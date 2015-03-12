var IPResolver = require("./ipresolver").IPResolver,
    CounterStore = require("./counter").CounterStore,
    Configuration = require("./limits-config").Configuration,
    limitsConfig = require("./limits-config"),
    log4js = require('log4js');

module.exports = LimitsEvaluator;

var logger = log4js.getLogger();

function LimitsEvaluator(settings) {
    this.settings = settings;

    this.configuration = null;
    this.onConfigurationUpdated = null;


    this.counter = new CounterStore();
    this.ipResolver = new IPResolver(settings.forwarded_headers);

    this.updateConfig(limitsConfig.defaultConfig);
    this.loadConfig();

    if (this.settings.configRefreshInterval > 0) {
        if (this.settings.configRefreshInterval < 5000) {
            logger.warn("configRefreshInterval should be >= 5000 (5sec) -> automatic config update turned off");
        } else {
            var _this = this;
            setInterval(function () {
                _this.loadConfig();
            }, this.settings.configRefreshInterval);
        }
    }
}

LimitsEvaluator.prototype = {
    loadConfig: function () {
        try {
            var _this = this;
            limitsConfig.loadConfig(this.settings.fullConfigEndpoint, function (cfg) {
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

    forward: function (req, res) {
        logger.debug(req.headers['x-forwarded-for'] + " " + req.method + " " + req.url + " " + this.counter.getGlobalRequestCount());
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

    isRateLimiterHealthcheck: function (req) {
        return req.headers["x-rate-limiter"] === "healthcheck";
    },

    isServiceHealthcheck: function (req) {
        return req.url === this.configuration.healthcheckUrl;
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

            var ip = this.ipResolver.resolve(req);
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

    getMatchingBucket: function (req) {
        for (var i = 0; i < this.configuration.buckets.length; i++) {
            if (this.configuration.buckets[i].matches(req)) {
                return this.configuration.buckets[i];
            }
        }
        throw "Invalid state: no default bucket found";
    },

    getConfigEndpoint: function () {
        return this.settings.fullConfigEndpoint;
    },

    getConfigRefreshInterval: function () {
        return this.settings.configRefreshInterval;
    }
};
