"use strict";

module.exports.createTestLimitsEvaluator = createTestLimitsEvaluator;
module.exports.getBucketByName = getBucketByName;


function createTestLimitsEvaluator(options) {
    var evaluator = require("../lib/rate-limiter/limits-evaluator");
    // returns a RateLimiter instance that neither initializes a config nor starts the proxy

    function TestLimitsEvaluator(options) {
        evaluator.call(this, options);
    }

    TestLimitsEvaluator.prototype = Object.create(evaluator.prototype);
    TestLimitsEvaluator.prototype.loadConfig = function () {
    };
    TestLimitsEvaluator.prototype.initProxy = function () {
    };

    return new TestLimitsEvaluator(options);
}

function getBucketByName(buckets, name) {
    var filteredBuckets = buckets.filter(function (bucket) { return bucket.name == name});
    return filteredBuckets[0];
}
