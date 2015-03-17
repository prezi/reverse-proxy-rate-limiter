"use strict";

var rateLimiter = exports,
    _ = require("lodash"),
    LimitsEvaluator = require("./limits-evaluator"),
    httpProxy = require('http-proxy'),
    http = require("http"),
    log4js = require('log4js'),
    EventEmitter = require('events').EventEmitter;

rateLimiter.RateLimiter = RateLimiter;
var logger = log4js.getLogger();

// http://nodejs.org/docs/v0.10.35/api/http.html#http_agent_maxsockets
// in v0.12 maxSockets default was changed to Infinity
http.globalAgent.maxSockets = Infinity;

function RateLimiter(settings) {
    this.settings = settings;
    log4js.configure(settings.log4js);

    this.proxyEvent = new EventEmitter();
    this.evaluator = new LimitsEvaluator(settings, this.proxyEvent);

    this.initProxy();
}

RateLimiter.prototype = {

    initProxy: function () {
        logger.info("New worker is being spawned.");
        var _this = this;
        this.proxy = httpProxy.createProxyServer({});

        this.proxy.on('proxyReq', function (proxyReq, req, res, options) {
            _this.requestForwarded(proxyReq, req);
        });
        this.proxy.on('proxyRes', function (proxyRes, req, res) {
            _this.requestServed(proxyRes, req, res);
        });
        this.proxy.on('error', function (err, req, res, options) {
            _this.requestFailed(err, req, res, options);
        });
        this.proxyEvent.on('forwarded', this.onForward.bind(this));

        var server = http.createServer(function (req, res) {
            var resultMethod = _this.evaluator.evaluate(req,
                                            _this.makeForward.bind(_this),
                                            _this.makeReject.bind(_this),
                                            _this.makeHealthcheck.bind(_this));
            resultMethod(req, res);
        });
        server.listen(_this.settings.listenPort, function () {
            logger.info("New worker successfully spawned.");
            if (process.send) {
                logger.info("New worker sends 'online' message.");
                process.send('online');
            }
        });
        this.server = server;

        this.processEventListeners = {};

        this.processEventListeners['SIGTERM'] = function () {
            _this.terminate(0);
        };

        this.processEventListeners['message'] = function (message) {
            if (message === 'shutdown') {
                _this.terminate(0);
            }
        };

        this.processEventListeners['uncaughtException'] = function(err) {
            logger.error('uncaughtException handler received: ' + err);
            _this.proxyEvent.emit('uncaughtException', err);
            if (err !== 'TestError') {
                _this.terminate(1);
            }
        };

        for (var listener in this.processEventListeners) {
            if (this.processEventListeners.hasOwnProperty(listener)) {
                process.on(listener, this.processEventListeners[listener]);
            }
        }
    },

    // event handlers

    onForward: function (req) {
        logger.debug(req.headers['x-forwarded-for'] + " " + req.method + " " + req.url + " " + this.evaluator.counter.getGlobalRequestCount());
    },

    // responder generator

    makeForward: function () {
        var _this = this;
        return function(req, res) {
            _this.proxyEvent.emit('forwarded', req);

            _this.proxy.web(req, res, {
                target: _this.settings.forwardUrl
            });
        }
    },

    makeReject: function(reason, errorCode) {
        var _this = this;
        errorCode = errorCode || 429;

        return function (req, res) {
            _this.proxyEvent.emit('rejected', reason);

            var handled = _this.proxyEvent.emit('rejectRequest', req, res, errorCode, reason)
            if (!handled) {
                _this.rejectRequest(req, res, errorCode, reason);
            }
        }
    },

    makeHealthcheck: function() {
        return function (req, res) {
            res.writeHead(200, "Rate-Limiter is running");
            res.write("OK");
            res.end();
        }
    },

    rejectRequest: function (req, res, errorCode, reason) {
        res.writeHead(errorCode, "Rejected by the rate limiter");
        res.write("Request has been rejected by the rate limiter");
        res.end();
    },

    terminate: function (value) {
        this.close(function () {
            logger.info("Old worker proxy process is terminated.");
            process.exit(value);
        });
    },

    close: function (done) {
        logger.info("Old worker proxy is being closed, will serve active requests but no new request will be accepted.");
        if (process.send) {
            logger.info("Old worker proxy sends 'offline' message.");
            process.send('offline');
        }

        var _this = this;
        this.server.close(function () {
            logger.info("Old worker proxy is closed.");

            for (var listener in _this.processEventListeners) {
                if (_this.processEventListeners.hasOwnProperty(listener)) {
                    process.removeListener(listener, _this.processEventListeners[listener]);
                }
            }
            done();
        });
    },

    requestForwarded: function (proxyReq, req) {
        if ("bucket" in req) {
            proxyReq.setHeader(this.settings.bucketHeaderName, req.bucket.name);
        }
    },

    requestServed: function (proxyRes, req, res) {
        this.proxyEvent.emit('served', req, res);
    },

    requestFailed: function (err, req, res, options) {
        logger.error('proxy error', err);

        this.proxyEvent.emit('failed', err, req, res);

        if (res.headersSent) {
            logger.error('Headers are sent already, cannot change HTTP response by now');
        } else {
            res.writeHead(500, {
                'Content-Type': 'text/plain'
            });
        }
        res.end('An internal error has occurred.');
    }
};
