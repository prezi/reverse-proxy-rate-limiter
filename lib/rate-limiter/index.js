"use strict";

var rateLimiter = exports,
    _ = require("underscore")._,
    limitsConfig = require("./limits-config"),
    Bucket = require("./bucket").Bucket,
    ipResolver = require("./ipresolver"),
    CounterStore = require("./counter").CounterStore,
    Configuration = require("./limits-config").Configuration,
    httpProxy = require('http-proxy'),
    http = require("http"),
    os = require('os'),
    url = require('url'),
    monitoring = require.main.require('node-graphite-client'),
    log4js = require('log4js'),
    config = require('config');

rateLimiter.RateLimiter = RateLimiter;
var logger = log4js.getLogger();

log4js.configure(config.get('log4js.path'));

// http://nodejs.org/docs/v0.10.35/api/http.html#http_agent_maxsockets
// in v0.12 maxSockets default was changed to Infinity
http.globalAgent.maxSockets = Infinity;

var defaultOptions = {
    forwardHost: "localhost",
    forwardPort: 80,
    configRefreshInterval: 60000,
    configEndpoint: "/rate_limiter",
    bucketHeaderName: "X-RateLimiter-Bucket",
    graphiteHost: "localhost",
    graphitePort: 22003
};

function RateLimiter(options) {
    this.configuration = null;
    this.onConfigurationUpdated = null;
    this.options = this.validateOptions(options);

    this.updateConfig(limitsConfig.defaultConfig);
    this.counter = new CounterStore();
    this.initProxy();

    var graphitePrefix = "ratelimiter." + this.options.serviceName + "." + os.hostname().replace(/\./g, "_") + ".";
    this.monitor = monitoring.createClient({
        port: this.options.graphitePort,
        host: this.options.graphiteHost,
        interval: 60000,
        prefix: graphitePrefix
    });

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
                    rl.logForwardedRequest(bucket);
                }
                rl.forward(req, res);
            };
        },
        REJECT: function (reason, errorCode) {
            return function (rl, req, res) {
                rl.monitor.increment(reason, 1);
                rl.reject(req, res, errorCode);
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
        this.proxy.on('proxyRes', function (proxyReq, req, res, options) {
            _this.requestServed(proxyReq, req, res, options);
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

        process.on('SIGTERM', function () {
            _this.terminate(server);
        });

        process.on('message', function (message) {
            if (message === 'shutdown') {
                _this.terminate(server);
            }
        });

        process.on('uncaughtException', function(err) {
            logger.error('uncaughtException handler received: ' + err);
            _this.monitor.increment('uncaughtException', 1);
            _this.terminate(server);
        });
    },

    terminate: function (server) {
        logger.info("Old worker is being terminated, will serve active requests but no new request will be accepted.");
        if (process.send) {
            logger.info("Old worker sends 'offline' message.");
            process.send('offline');
        }
        server.close(function () {
            logger.info("Old worker is terminated.");
            process.exit(0);
        });
    },

    // see: https://gist.github.com/adenes/c70920820faff25ff7a2 evaluate_limits_v3
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

            if (this.configuration.maxRequests > 0 && this.counter.getGlobal() >= this.configuration.maxRequests) {
                // hard limit reached
                logger.info("Rejected by global limit: " + this.counter.getGlobal());
                return this.evaluateResult.REJECT("global.request_limit_reached");
            }

            var bucket = this.getMatchingBucket(req);
            req.bucket = bucket;

            var ip = ipResolver.resolve(req);
            req.ip = ip;
            var requestCountForBucket = this.counter.get(bucket, ip);
            if (bucket.getMaxRequestsPerIp() > 0 && requestCountForBucket[2] >= bucket.getMaxRequestsPerIp()) {
                // by ip limit reached
                logger.info("Rejected by IP limit for bucket: ", bucket.name, ip);
                return this.evaluateResult.REJECT(bucket.name + ".ip_limit_reached");
            }

            var isGlobalRequestsUnlimited = this.configuration.maxRequestsWithoutBuffer === 0;
            if (isGlobalRequestsUnlimited || this.counter.getGlobal() < this.configuration.maxRequestsWithoutBuffer) {
                // we are below the limits
                return this.evaluateResult.FORWARD(bucket, ip);
            }

            if (bucket.getMaxRequests() > 0 && requestCountForBucket[1] >= this.calculateAvailableRequestsForBucket(bucket)) {
                logger.info("Rejected by bucket limit: ", bucket.name, ip);
                return this.evaluateResult.REJECT(bucket.name + ".request_limit_reached");
            }
        } catch (e) {
            logger.error("Evaluating limits failed:", e);
            // do nothing, let the request through
        }

        return this.evaluateResult.FORWARD(bucket, ip);
    },

    calculateAvailableRequestsForBucket: function (bucket) {
        var remainingRequestCount = this.configuration.maxRequestsWithoutBuffer;
        var sumOfCapacityUnits = 0;
        var _this = this;
        this.configuration.buckets.forEach(function (b) {
            if (_this.counter.getBucketCount(b) >= b.getMaxRequests()) {
                sumOfCapacityUnits += b.capacityUnit;
            } else {
                remainingRequestCount -= _this.counter.getBucketCount(b);
            }
        });

        return Math.ceil(remainingRequestCount / sumOfCapacityUnits * bucket.capacityUnit);
    },

    logForwardedRequest: function (bucket) {
        this.monitor.collectMaximum("global.active_requests", this.counter.getGlobal());
        this.monitor.collectMaximum(bucket.name + ".active_requests", this.counter.getBucketCount(bucket));
        this.monitor.collectLastValue("global.requests_limit", this.configuration.maxRequests);
        this.monitor.collectLastValue(bucket.name + ".requests_limit", bucket.getMaxRequests());
    },

    forward: function (req, res) {
        logger.debug(req.headers['x-forwarded-for'] + " " + req.method + " " + req.url + " " + this.counter.getGlobal());
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

    requestForwarded: function (proxyReq, req, res, options) {
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

    requestServed: function (proxyReq, req, res, options) {
        this.counter.decrement(req.bucket, req.ip);
    },

    requestFailed: function (err, req, res, options) {
        logger.error('proxy error', err, req, res, options);

        this.counter.decrement(req.bucket, req.ip);

        res.writeHead(500, {
            'Content-Type': 'text/plain'
        });

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
