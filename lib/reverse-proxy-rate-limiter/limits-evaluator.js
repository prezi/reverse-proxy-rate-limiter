"use strict";

var IPResolver = require("./ipresolver").IPResolver,
    CounterStore = require("./counter").CounterStore,
    LimitsConfiguration = require("./limits-config").LimitsConfiguration,
    LimitsConfigurationLoader = require("./limits-config").LimitsConfigurationLoader,
    defaultLimitsConfig = require("./limits-config").defaultLimitsConfig,
    log4js = require('log4js');

module.exports = LimitsEvaluator;

var logger = log4js.getLogger();

function LimitsEvaluator(settings, eventEmitter) {
    this.settings = settings;

    this.limitsConfiguration = null;
    this.onConfigurationUpdated = null;

    this.limitConfigurationLoader = new LimitsConfigurationLoader(settings.fullConfigEndpoint);
    this.counter = new CounterStore();
    this.ipResolver = new IPResolver(settings.forwarded_headers);

    eventEmitter.on('forward', this.onRequestForward.bind(this));
    eventEmitter.on('failed', this.onRequestFailed.bind(this));
    eventEmitter.on('served', this.onRequestServed.bind(this));

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
                    _this.updateConfig(defaultLimitsConfig.defaultLimitsConfig);
                } // else use the current limits config
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

    // event handlers

    onRequestForward: function(req) {
        var bucket = req.bucket;
        var ip = req.ip;

        if (bucket && ip) {
            this.counter.increment(bucket, ip);
        }
    },

    onRequestServed: function(req, res) {
        this.counter.decrement(req.bucket, req.ip);
    },

    onRequestFailed: function(req, res) {
        this.counter.decrement(req.bucket, req.ip);
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
        var isBucketCapacityLimited = bucket.getMaxRequests() > 0;
        var isBucketFull = this.counter.getRequestCountForBucket(bucket) >= this.calculateAvailableRequestsForBucket(bucket);

        if (isBucketCapacityLimited && isBucketFull) {
            logger.info("Rejected by bucket limit: ", bucket.name, ip);
            return true;
        }

        return false;
    },

    evaluate: function (req, returnForward, returnReject, returnHealthcheck) {
        try {
            if (this.isRateLimiterHealthcheck(req)) {
                return returnHealthcheck();
            }

            if (this.isServiceHealthcheck(req)) {
                return returnForward();
            }

            if (this.isConfigEndpointRequested(req)) {
                return returnReject("config_endpoint_requested", 404);
            }

            if (this.isMaxRequestsLimitReached()) {
                return returnReject("global.request_limit_reached");
            }

            var bucket = this.getMatchingBucket(req);
            req.bucket = bucket;

            var ip = this.ipResolver.resolve(req);
            req.ip = ip;

            if (this.isByIPLimitReached(bucket, ip)) {
                return returnReject(bucket.name + ".ip_limit_reached");
            }

            if (this.isBelowMaxRequestsWithoutBuffer()) {
                return returnForward();
            }

            if (this.isBucketFull(bucket, ip)) {
                return returnReject(bucket.name + ".request_limit_reached");
            }

            return returnForward();
        } catch (e) {
            logger.error("Evaluating limits failed:", e);
            // do nothing, let the request through
        }

        return returnForward();
    },

    getCompetingBuckets: function() {
        return this.limitsConfiguration.buckets.filter(function (bucket) {
            return this.counter.getRequestCountForBucket(bucket) >= bucket.getMaxRequests();
        }, this);
    },

    calculateAvailableRequestCount: function () {
        var remainingRequestCount = this.limitsConfiguration.maxRequestsWithoutBuffer;

        this.limitsConfiguration.buckets.forEach(function (bucket) {
            if (this.counter.getRequestCountForBucket(bucket) < bucket.getMaxRequests()) {
                remainingRequestCount -= this.counter.getRequestCountForBucket(bucket);
            }
        }, this);

        return remainingRequestCount;
    },

    calculateTotalCapacityOfCompetingBuckets: function (competingBuckets) {
        var sumOfCapacityUnits = 0;

        competingBuckets.forEach(function (bucket) {
            sumOfCapacityUnits += bucket.capacityUnit;
        });

        return sumOfCapacityUnits;
    },

    calculateAvailableRequestsForBucket: function (bucket) {
        var competingBuckets = this.getCompetingBuckets();
        var totalCapacityOfCompetingBuckets = this.calculateTotalCapacityOfCompetingBuckets(competingBuckets);
        var availableRequestCount = this.calculateAvailableRequestCount();

        return Math.ceil(availableRequestCount / totalCapacityOfCompetingBuckets * bucket.capacityUnit);
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
