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

    this.evaluator = new LimitsEvaluator(settings);
    this.proxyEvent = new EventEmitter();

    this.initProxy();
}

RateLimiter.prototype = {

    initProxy: function () {
        logger.info("New worker is being spawned.");
        var _this = this;
        this.proxy = httpProxy.createProxyServer({});

        this.proxy.on('proxyReq', function (proxyReq, req, res, options) {
            _this.requestForwarded(proxyReq, req, res, options);
        });
        this.proxy.on('proxyRes', function (proxyRes, req, res) {
            _this.requestServed(proxyRes, req, res);
        });
        this.proxy.on('error', function (err, req, res, options) {
            _this.requestFailed(err, req, res, options);
        });

        var server = http.createServer(function (req, res) {
            var resultMethod = _this.evaluator.evaluateLimit(req);
            resultMethod(_this, req, res);
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

    forward: function (req, res) {
        logger.debug(req.headers['x-forwarded-for'] + " " + req.method + " " + req.url + " " + this.evaluator.counter.getGlobalRequestCount());
        this.proxy.web(req, res, {
            target: this.settings.forwardUrl
        });
    },

    reject: function (req, res, errorCode) {
        errorCode = errorCode || 429;
        res.writeHead(errorCode, "Rejected by the rate limiter");
        res.write("Request has been rejected by the rate limiter");
        res.end();
    },

    respondWithHealthcheck: function (req, res) {
        res.writeHead(200, "Rate-Limiter is running");
        res.write("OK");
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

        var self = this;
        this.server.close(function () {
            logger.info("Old worker proxy is closed.");

            for (var listener in self.processEventListeners) {
                if (self.processEventListeners.hasOwnProperty(listener)) {
                    process.removeListener(listener, self.processEventListeners[listener]);
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
        this.evaluator.counter.decrement(req.bucket, req.ip);
        this.proxyEvent.emit('served', req.bucket);
    },

    requestFailed: function (err, req, res, options) {
        logger.error('proxy error', err);

        this.evaluator.counter.decrement(req.bucket, req.ip);
        this.proxyEvent.emit('failed', err);

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
