"use strict";

var rateLimiter = exports,
    _ = require("lodash"),
    limitsConfig = require("./limits-config"),
    IPResolver = require("./ipresolver").IPResolver,
    CounterStore = require("./counter").CounterStore,
    Configuration = require("./limits-config").Configuration,
    httpProxy = require('http-proxy'),
    http = require("http"),
    url = require('url'),
    log4js = require('log4js'),
    EventEmitter = require('events').EventEmitter;

rateLimiter.RateLimiter = RateLimiter;
var logger = log4js.getLogger();

// http://nodejs.org/docs/v0.10.35/api/http.html#http_agent_maxsockets
// in v0.12 maxSockets default was changed to Infinity
http.globalAgent.maxSockets = Infinity;

var defaultOptions = {
    forwardHost: "localhost",
    forwardPort: 80,
    configRefreshInterval: 60000,
    configEndpoint: "/rate_limiter",
    bucketHeaderName: "X-RateLimiter-Bucket"
};

function RateLimiter(options) {
    this.configuration = null;
    this.onConfigurationUpdated = null;

    this.options = this.validateOptions(options);
    log4js.configure(options.log4js);
    this.IPResolver = new IPResolver(options.forwarded_headers);

    this.updateConfig(limitsConfig.defaultConfig);
    this.proxyEvent = new EventEmitter();
    this.counter = new CounterStore();
    this.initProxy();

    this.loadConfig();
    if (this.options.configRefreshInterval > 0) {
        if (this.options.configRefreshInterval < 5000) {
            logger.warn("configRefreshInterval should be >= 5000 (5sec) -> automatic config update turned off");
        } else {
            var _this = this;
            setInterval(function () {
                _this.loadConfig();
            }, this.options.configRefreshInterval);
        }
    }
}

RateLimiter.prototype = {

    evaluateResult: {
        FORWARD: function (bucket, ip) {
            return function (rl, req, res) {
                if (bucket && ip) {
                    rl.counter.increment(bucket, ip);
                }
                rl.forward(req, res);
                rl.proxyEvent.emit('forward', bucket);
            };
        },
        REJECT: function (reason, errorCode) {
            return function (rl, req, res) {
                rl.reject(req, res, errorCode);
                rl.proxyEvent.emit('reject', reason);
            };
        },
        RESPOND_WITH_HEALTHCHECK: function () {
            return function (rl, req, res) {
                rl.respondWithHealthcheck(req, res);
            };
        }
    },

    loadConfig: function () {
        try {
            var _this = this;
            limitsConfig.loadConfig(this.options.configEndpoint, function (cfg) {
                if (cfg !== null) {
                    _this.updateConfig(cfg);
                } else if (_this.configuration === null) {
                    _this.updateConfig(limitsConfig.defaultConfig);
                } // else use the current config
            });
        } catch (e) {
            logger.error("load/update config failed: " + e);
        }
    },

    updateConfig: function (cfg) {
        this.configuration = new Configuration(cfg);

        if (typeof this.onConfigurationUpdated === "function") {
            this.onConfigurationUpdated();
        }
    },

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
            var resultMethod = _this.evaluateLimit(req);
            resultMethod(_this, req, res);
        });
        server.listen(_this.options.listenPort, function () {
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
            _this.terminate(1);
        };

        for (var listener in this.processEventListeners) {
            if (this.processEventListeners.hasOwnProperty(listener)) {
                process.on(listener, this.processEventListeners[listener]);
            }
        }
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

    evaluateLimit: function (req) {
        try {
            if (this.isRateLimiterHealthcheck(req)) {
                return this.evaluateResult.RESPOND_WITH_HEALTHCHECK();
            }

            if (this.isServiceHealthcheck(req)) {
                return this.evaluateResult.FORWARD();
            }

            if (req.url === this.getConfigEndpoint()) {
                return this.evaluateResult.REJECT("config_endpoint_requested", 404);
            }

            if (this.configuration.maxRequests > 0 && this.counter.getGlobalRequestCount() >= this.configuration.maxRequests) {
                // hard limit reached
                logger.info("Rejected by global limit: " + this.counter.getGlobalRequestCount());
                return this.evaluateResult.REJECT("global.request_limit_reached");
            }

            var bucket = this.getMatchingBucket(req);
            req.bucket = bucket;

            var ip = this.IPResolver.resolve(req);
            req.ip = ip;
            if (bucket.getMaxRequestsPerIp() > 0 && this.counter.getRequestCountForBucketAndIP(bucket, ip) >= bucket.getMaxRequestsPerIp()) {
                // by ip limit reached
                logger.info("Rejected by IP limit for bucket: ", bucket.name, ip);
                return this.evaluateResult.REJECT(bucket.name + ".ip_limit_reached");
            }

            var isGlobalRequestsUnlimited = this.configuration.maxRequestsWithoutBuffer === 0;
            if (isGlobalRequestsUnlimited || this.counter.getGlobalRequestCount() < this.configuration.maxRequestsWithoutBuffer) {
                // we are below the limits
                return this.evaluateResult.FORWARD(bucket, ip);
            }

            if (bucket.getMaxRequests() > 0 && this.counter.getRequestCountForBucket(bucket) >= this.calculateAvailableRequestsForBucket(bucket)) {
                logger.info("Rejected by bucket limit: ", bucket.name, ip);
                return this.evaluateResult.REJECT(bucket.name + ".request_limit_reached");
            }
            return this.evaluateResult.FORWARD(bucket, ip);

        } catch (e) {
            logger.error("Evaluating limits failed:", e);
            // do nothing, let the request through
        }
        return this.evaluateResult.FORWARD();
    },

    calculateAvailableRequestsForBucket: function (bucket) {
        var remainingRequestCount = this.configuration.maxRequestsWithoutBuffer;
        var sumOfCapacityUnits = 0;
        var _this = this;
        this.configuration.buckets.forEach(function (b) {
            if (_this.counter.getRequestCountForBucket(b) >= b.getMaxRequests()) {
                sumOfCapacityUnits += b.capacityUnit;
            } else {
                remainingRequestCount -= _this.counter.getRequestCountForBucket(b);
            }
        });

        return Math.ceil(remainingRequestCount / sumOfCapacityUnits * bucket.capacityUnit);
    },

    forward: function (req, res) {
        logger.debug(req.headers['x-forwarded-for'] + " " + req.method + " " + req.url + " " + this.counter.getGlobalRequestCount());
        this.proxy.web(req, res, {
            target: getForwardUrl(this.options)
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

    isRateLimiterHealthcheck: function (req) {
        return req.headers["x-rate-limiter"] === "healthcheck";
    },

    isServiceHealthcheck: function (req) {
        return req.url === this.configuration.healthcheckUrl;
    },

    requestForwarded: function (proxyReq, req) {
        if ("bucket" in req) {
            proxyReq.setHeader(this.options.bucketHeaderName, req.bucket.name);
        }
    },

    getMatchingBucket: function (req) {
        for (var i = 0; i < this.configuration.buckets.length; i++) {
            if (this.configuration.buckets[i].matches(req)) {
                return this.configuration.buckets[i];
            }
        }
        throw "Invalid state: no default bucket found";
    },

    requestServed: function (proxyRes, req, res) {
        this.counter.decrement(req.bucket, req.ip);
        this.proxyEvent.emit('served', req.bucket);
    },

    requestFailed: function (err, req, res, options) {
        logger.error('proxy error', err);

        this.counter.decrement(req.bucket, req.ip);
        this.proxyEvent.emit('failed', err);

        if (res.headersSent) {
            logger.error('Headers are sent already, cannot change HTTP response by now');
        } else {
            res.writeHead(500, {
                'Content-Type': 'text/plain'
            });
        }
        res.end('An internal error has occurred.');
    },

    getConfigEndpoint: function () {
        return this.options.configEndpoint;
    },

    getConfigRefreshInterval: function () {
        return this.options.configRefreshInterval;
    },

    validateOptions: function (options) {
        options = _.defaults(options || {}, defaultOptions);

        var configUrl = url.parse(options.configEndpoint);
        if (configUrl.protocol === null) {
            configUrl = url.parse(getForwardUrl(options));
            configUrl.pathname = options.configEndpoint;
            options.configEndpoint = url.format(configUrl);
        }

        return options;
    }
};

function getForwardUrl(options) {
    return "http://" + options.forwardHost + ":" + options.forwardPort;
}
