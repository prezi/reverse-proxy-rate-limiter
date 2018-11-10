"use strict";

const fs = require('fs');
const request = require("request");
const url = require("url");
const limitsConfigSchema = require('./limits-config-schema');
const Bucket = require("./bucket").Bucket;
const log4js = require('log4js');

exports.isValidConfig = isValidConfig;
exports.LimitsConfiguration = LimitsConfiguration;
exports.LimitsConfigurationLoader = LimitsConfigurationLoader;

exports.defaultLimitsConfig = {
    version: 1,
    max_requests: 0,  // 0 means unlimited
    buffer_ratio: 0,
    buckets: [{name: "default"}]
};

if (!isValidConfig(exports.defaultLimitsConfig)) {
    throw new Error("Invalid defaultLimitsConfig");
}

const logger = log4js.getLogger();


function LimitsConfiguration(cfg) {
    this.buckets = [];
    this.bufferRatio = cfg.buffer_ratio;

    this.maxRequests = cfg.max_requests;
    this.maxRequestsWithoutBuffer = Math.floor(this.maxRequests * (1 - this.bufferRatio));
    this.healthcheckUrl = cfg.healthcheck_url;

    this.buckets = this.initializeBuckets(cfg.buckets);

    const sumOfCapacityUnits = this.calculateTotalCapacityUnits();
    this.buckets.forEach(function (bucket) {
        if (sumOfCapacityUnits === 0) {
            bucket.maxRequests = 0;
        } else {
            const bucketCapacityRatio = bucket.capacityUnit / sumOfCapacityUnits;
            bucket.maxRequests = Math.ceil(this.maxRequestsWithoutBuffer * bucketCapacityRatio);
        }
    }, this);
}

LimitsConfiguration.prototype = {
    initializeBuckets: function (buckets) {
        let defaultBucket = null;
        let initializedBuckets = [];

        buckets.forEach(function (bucketConfig) {
            const bucket = new Bucket(bucketConfig);

            if (bucket.isDefault()) {
                if (defaultBucket !== null) {
                    throw new Error("There is more than one default buckets defined in the limits configuration.");
                }
                defaultBucket = bucket;  // we will push it separately to be at the end of the array
            } else {
                initializedBuckets.push(bucket);
            }
        });

        if (defaultBucket === null) {
            throw new Error("No default bucket was set.");
        }
        initializedBuckets.push(defaultBucket);

        return initializedBuckets;
    },

    calculateTotalCapacityUnits: function () {
        let capacityUnits = 0;
        this.buckets.forEach(function (bucket) {
            capacityUnits += bucket.capacityUnit;
        });
        return capacityUnits;
    }
};

function LimitsConfigurationLoader(configEndpoint) {
    this.configEndpoint = configEndpoint;
    this.limitsConfigurationSource = null;

}

LimitsConfigurationLoader.prototype = {
    load: function (callback) {
        this.limitsConfigurationSource = new LimitsConfigurationSource(this.configEndpoint);
        const forwardValidConfigCallback = this.buildForwardValidConfigCallback(callback);

        if (this.limitsConfigurationSource.isUrl()) {
            this.loadFromURL(this.configEndpoint, forwardValidConfigCallback);
        } else if (this.limitsConfigurationSource.isFilePath()) {
            this.loadFromFile(this.limitsConfigurationSource.parsedConfigEndpoint.path, forwardValidConfigCallback);
        } else {
            throw new Error("Illegal url: " + this.configEndpoint);
        }
    },

    buildForwardValidConfigCallback: function (callback) {
        const _this = this;
        return function (config) {
            if (isValidConfig(config)) {
                callback(config);
            } else {
                logger.error("Could not load config from " + _this.configEndpoint + ". Using the existing limits configuration...");
                callback(null);
            }
        };
    },

    loadFromURL: function (url, forwardValidConfigCallback) {
        logger.debug("Loading config from URL: " + url);
        request({
            url: url,
            json: true,
            // if no timeout is defined and the server is not responding then request objects can slowly leak resources
            timeout: 1500
        }, function (error, response, body) {
            if (!error && response.statusCode === 200) {
                logger.debug("Getting config from URL succeeded.");
                forwardValidConfigCallback(body);
            } else {
                logger.error("Could not load config from url. " + error + "; url: " + url);
                forwardValidConfigCallback(null);
            }
        });
    },

    loadFromFile: function (path, forwardValidConfigCallback) {
        logger.debug("Loading config from file: " + path);
        fs.readFile(path, {encoding: 'utf8'}, function (err, data) {
            if (err) {
                logger.error("Could not load config from file. " + err + "; file: " + path);
            } else {
                logger.debug("Getting config from file succeeded.");
                forwardValidConfigCallback(JSON.parse(data));
            }
        });
    }
};

function LimitsConfigurationSource(configEndpoint) {
    this.parsedConfigEndpoint = url.parse(configEndpoint);
}

LimitsConfigurationSource.prototype = {
    isUrl: function () {
        return this.parsedConfigEndpoint.protocol === "https:" || this.parsedConfigEndpoint.protocol === "http:";
    },

    isFilePath: function () {
        return this.parsedConfigEndpoint.protocol === "file:";
    }
};

function isValidConfig(config) {
    const result = limitsConfigSchema.validate(config);
    if (result.errors.length > 0) {
        logger.error("Invalid config: " + result.errors);
    }
    return result.valid;
}
