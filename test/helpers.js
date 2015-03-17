"use strict";

module.exports.createTestLimitsEvaluator = createTestLimitsEvaluator;
module.exports.getBucketByName = getBucketByName;


function createTestLimitsEvaluator(settings) {
    var evaluator = require("../lib/reverse-proxy-rate-limiter/limits-evaluator");
    // returns a RateLimiter instance that neither initializes a config nor starts the proxy

    var EventEmitter = require('events').EventEmitter;

    function TestLimitsEvaluator(settings) {
        evaluator.call(this, settings, new EventEmitter());
    }

    TestLimitsEvaluator.prototype = Object.create(evaluator.prototype);
    TestLimitsEvaluator.prototype.loadConfig = function () {
    };
    TestLimitsEvaluator.prototype.initProxy = function () {
    };

    return new TestLimitsEvaluator(settings);
}

function getBucketByName(buckets, name) {
    var filteredBuckets = buckets.filter(function (bucket) { return bucket.name == name});
    return filteredBuckets[0];
}
