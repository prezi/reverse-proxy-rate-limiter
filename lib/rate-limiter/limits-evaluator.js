"use strict";

var IPResolver = require("./ipresolver").IPResolver,
    CounterStore = require("./counter").CounterStore,
    LimitsConfiguration = require("./limits-config").LimitsConfiguration,
    LimitsConfigurationLoader = require("./limits-config").LimitsConfigurationLoader,
    defaultLimitsConfig = require("./limits-config").defaultLimitsConfig,
    log4js = require('log4js');

module.exports = LimitsEvaluator;

var logger = log4js.getLogger();

function LimitsEvaluator(settings) {
    this.settings = settings;

    this.limitsConfiguration = null;
    this.onConfigurationUpdated = null;

    this.limitConfigurationLoader = new LimitsConfigurationLoader(settings.fullConfigEndpoint);
    this.counter = new CounterStore();
    this.ipResolver = new IPResolver(settings.forwarded_headers);

    this.updateConfig(defaultLimitsConfig);
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
            this.limitConfigurationLoader.load(function (cfg) {
                if (cfg !== null) {
                    _this.updateConfig(cfg);
                } else if (_this.limitsConfiguration === null) {
                    _this.updateConfig(limitsConfig.defaultLimitsConfig);
                } // else use the current config
            });
        } catch (e) {
            logger.error("load/update config failed: " + e);
        }
    },

    updateConfig: function (cfg) {
        this.limitsConfiguration = new LimitsConfiguration(cfg);

        if (typeof this.onConfigurationUpdated === "function") {
            this.onConfigurationUpdated();
        }
    },

    FORWARD: function (bucket, ip) {
        var self = this;
        return function (rl, req, res) {
            if (bucket && ip) {
                self.counter.increment(bucket, ip);
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
    },

    isRateLimiterHealthcheck: function (req) {
        return req.headers["x-rate-limiter"] === "healthcheck";
    },

    isServiceHealthcheck: function (req) {
        return req.url === this.limitsConfiguration.healthcheckUrl;
    },

    isConfigEndpointRequested: function (req) {
        return req.url === this.getConfigEndpoint();
    },

    isMaxRequestsLimitReached: function () {
        var isMaxRequestsLimitSet = this.limitsConfiguration.maxRequests > 0;
        var isMaxRequestsLimitReached = this.counter.getGlobalRequestCount() >= this.limitsConfiguration.maxRequests;

        if (isMaxRequestsLimitSet && isMaxRequestsLimitReached) {
            logger.info("Rejected by global limit: " + this.counter.getGlobalRequestCount());
            return true;
        }

        return false;
    },

    isByIPLimitReached: function (bucket, ip) {
        var isByIPLimitSet = bucket.getMaxRequestsPerIp() > 0;
        var isByIPLimitReached = this.counter.getRequestCountForBucketAndIP(bucket, ip) >= bucket.getMaxRequestsPerIp();

        if (isByIPLimitSet && isByIPLimitReached) {
            logger.info("Rejected by IP limit for bucket: ", bucket.name, ip);
            return true;
        }

        return false;
    },

    isBelowMaxRequestsWithoutBuffer: function () {
        var isGlobalRequestsUnlimited = this.limitsConfiguration.maxRequestsWithoutBuffer === 0;
        var isBelowMaxRequestsWithoutBuffer = this.counter.getGlobalRequestCount() < this.limitsConfiguration.maxRequestsWithoutBuffer;
        return isGlobalRequestsUnlimited || isBelowMaxRequestsWithoutBuffer;
    },

    isBucketFull: function (bucket, ip) {
        var isMaxRequestsSetForBucket = bucket.getMaxRequests() > 0;
        var isRequestsAvailableForBucket = this.counter.getRequestCountForBucket(bucket) >= this.calculateAvailableRequestsForBucket(bucket);

        if (isMaxRequestsSetForBucket && isRequestsAvailableForBucket) {
            logger.info("Rejected by bucket limit: ", bucket.name, ip);
            return true;
        }

        return false;
    },

    evaluate: function (req) {
        try {
            if (this.isRateLimiterHealthcheck(req)) {
                return this.RESPOND_WITH_HEALTHCHECK();
            }

            if (this.isServiceHealthcheck(req)) {
                return this.FORWARD();
            }

            if (this.isConfigEndpointRequested(req)) {
                return this.REJECT("config_endpoint_requested", 404);
            }

            if (this.isMaxRequestsLimitReached()) {
                return this.REJECT("global.request_limit_reached");
            }

            var bucket = this.getMatchingBucket(req);
            req.bucket = bucket;

            var ip = this.ipResolver.resolve(req);
            req.ip = ip;

            if (this.isByIPLimitReached(bucket, ip)) {
                return this.REJECT(bucket.name + ".ip_limit_reached");
            }

            if (this.isBelowMaxRequestsWithoutBuffer()) {
                return this.FORWARD(bucket, ip);
            }

            if (this.isBucketFull(bucket, ip)) {
                return this.REJECT(bucket.name + ".request_limit_reached");
            }

            return this.FORWARD(bucket, ip);
        } catch (e) {
            logger.error("Evaluating limits failed:", e);
            // do nothing, let the request through
        }

        return this.FORWARD();
    },

    calculateAvailableRequestsForBucket: function (bucket) {
        var remainingRequestCount = this.limitsConfiguration.maxRequestsWithoutBuffer;
        var sumOfCapacityUnits = 0;
        var _this = this;
        this.limitsConfiguration.buckets.forEach(function (b) {
            if (_this.counter.getRequestCountForBucket(b) >= b.getMaxRequests()) {
                sumOfCapacityUnits += b.capacityUnit;
            } else {
                remainingRequestCount -= _this.counter.getRequestCountForBucket(b);
            }
        });

        return Math.ceil(remainingRequestCount / sumOfCapacityUnits * bucket.capacityUnit);
    },

    getMatchingBucket: function (req) {
        for (var i = 0; i < this.limitsConfiguration.buckets.length; i++) {
            if (this.limitsConfiguration.buckets[i].matches(req)) {
                return this.limitsConfiguration.buckets[i];
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
