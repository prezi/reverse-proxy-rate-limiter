"use strict";

const LimitsConfigurationLoader = require("../lib/reverse-proxy-rate-limiter/limits-config").LimitsConfigurationLoader;

module.exports.createTestLimitsEvaluator = createTestLimitsEvaluator;
module.exports.getBucketByName = getBucketByName;
module.exports.TestLimitsConfigurationLoader = TestLimitsConfigurationLoader;


function createTestLimitsEvaluator(settings) {
    const Evaluator = require("../lib/reverse-proxy-rate-limiter/limits-evaluator");
    // returns a RateLimiter instance that neither initializes a config nor starts the proxy

    const EventEmitter = require('events').EventEmitter;

    function TestLimitsEvaluator(settings) {
        Evaluator.call(this, settings, new EventEmitter());
    }

    TestLimitsEvaluator.prototype = Object.create(Evaluator.prototype);
    TestLimitsEvaluator.prototype.loadConfig = function () {
    };
    TestLimitsEvaluator.prototype.initProxy = function () {
    };

    return new TestLimitsEvaluator(settings);
}

function TestLimitsConfigurationLoader(fullConfigEndpoint) {

    function TestLimitsConfigurationLoader(settings) {
        LimitsConfigurationLoader.call(this, fullConfigEndpoint);
    }
}

TestLimitsConfigurationLoader.prototype = Object.create(LimitsConfigurationLoader.prototype);
TestLimitsConfigurationLoader.prototype.load = function (callback) { callback(null); };

function getBucketByName(buckets, name) {
    const filteredBuckets = buckets.filter(function (bucket) { return bucket.name == name});
    return filteredBuckets[0];
}
