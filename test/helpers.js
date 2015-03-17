"use strict";

var limitsConfigurationLoader = require("../lib/reverse-proxy-rate-limiter/limits-config").LimitsConfigurationLoader;

module.exports.createTestLimitsEvaluator = createTestLimitsEvaluator;
module.exports.getBucketByName = getBucketByName;
module.exports.TestLimitsConfigurationLoader = TestLimitsConfigurationLoader;


function createTestLimitsEvaluator(settings) {
    var evaluator = require("../lib/reverse-proxy-rate-limiter/limits-evaluator");
    // returns a RateLimiter instance that neither initializes a config nor starts the proxy

    function TestLimitsEvaluator(settings) {
        evaluator.call(this, settings);
    }

    TestLimitsEvaluator.prototype = Object.create(evaluator.prototype);
    TestLimitsEvaluator.prototype.loadConfig = function () {
    };
    TestLimitsEvaluator.prototype.initProxy = function () {
    };

    return new TestLimitsEvaluator(settings);
}

function TestLimitsConfigurationLoader(fullConfigEndpoint) {

    function TestLimitsConfigurationLoader(settings) {
        limitsConfigurationLoader.call(this, fullConfigEndpoint);
    }
}

TestLimitsConfigurationLoader.prototype = Object.create(limitsConfigurationLoader.prototype);
TestLimitsConfigurationLoader.prototype.load = function (callback) { callback(null); };

function getBucketByName(buckets, name) {
    var filteredBuckets = buckets.filter(function (bucket) { return bucket.name == name});
    return filteredBuckets[0];
}
