"use strict";

var fs = require('fs'),
    request = require("request"),
    url = require("url"),
    configSchema = require('./limits-config-schema'),
    Bucket = require("./bucket").Bucket,
    log4js = require('log4js');

exports.loadConfig = loadConfig;
exports.isValidConfig = isValidConfig;
exports.Configuration = Configuration;

exports.defaultConfig = {
    version: 1,
    max_requests: 99999999,
    buffer_ratio: 0,
    buckets: [{name: "default"}]
};

if (!isValidConfig(exports.defaultConfig)) {
    throw new Error("Invalid defaultConfig");
}

var logger = log4js.getLogger();


function Configuration(cfg) {
    this.buckets = [];
    this.bufferRatio = cfg.buffer_ratio;

    this.maxRequests = cfg.max_requests;
    this.maxRequestsWithoutBuffer = Math.floor(this.maxRequests * (1 - this.bufferRatio));
    this.healthcheckUrl = cfg.healthcheck_url;

    this.buckets = this.initializeBuckets(cfg.buckets);

    this.bucketsByName = {};
    this.buckets.forEach(function (bucket) {
        this.bucketsByName[bucket.name] = bucket;
    }, this);

    var sumOfCapacityUnits = this.calculateTotalCapacityUnits();
    this.buckets.forEach(function (bucket) {
        if (sumOfCapacityUnits === 0) {
            bucket.maxRequests = 0;
        } else {
            var bucketCapacityRatio = bucket.capacityUnit / sumOfCapacityUnits;
            bucket.maxRequests = Math.ceil(this.maxRequestsWithoutBuffer * bucketCapacityRatio);
        }
    }, this);
}

Configuration.prototype = {
    initializeBuckets: function (buckets) {
        var defaultBucket = null;
        var initializedBuckets = [];

        buckets.forEach(function (bucketConfig) {
            var bucket = new Bucket(bucketConfig);

            if (bucket.isDefault()) {
                // FIXME check if there is a default bucket already
                defaultBucket = bucket; // we will push it separately to be at the end of the array
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
        var capacityUnits = 0;
        this.buckets.forEach(function (bucket) {
            capacityUnits += bucket.capacityUnit;
        });
        return capacityUnits;
    }
};


function loadConfig(source, callback) {
    parseConfig(source, function (config) {
        if (isValidConfig(config)) {
            callback(config);
        } else {
            logger.error("Could not load config from " + source + ". Using the existing configuration...");
            callback(null);
        }
    });
}

//   /ratelimiter-config  -> http://localhost:8181/ratelimiter-config
function parseConfig(source, callback) {
    var sourceUrl = url.parse(source);

    if (sourceUrl.protocol === "https:" || sourceUrl.protocol === "http:") {
        loadConfigFromURL(url.format(sourceUrl), callback);

    } else if (sourceUrl.protocol === "file:") {
        loadConfigFromFile(sourceUrl.path, callback);

    } else {
        throw new Error("Illegal url: " + url.format(sourceUrl));
    }
}

function loadConfigFromURL(url, callback) {
    request({
        url: url,
        json: true
    }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            callback(body);
        } else {
            logger.error("Could not load config from url. " + error + "; url: " + url);
            callback(null);
        }
    });
}

function loadConfigFromFile(path, callback) {
    fs.readFile(path, {encoding: 'utf8'}, function (err, data) {
        if (err) {
            logger.error("Could not load config from file. " + err + "; file: " + path);
        } else {
            callback(JSON.parse(data));
        }
    });
}

function isValidConfig(config) {
    var result = configSchema.validate(config);
    if (result.errors.length > 0) {
        logger.error("Invalid config: " + result.errors);
    }
    return result.valid;
}
