"use strict";

module.exports.createTestLimitsEvaluator = createTestLimitsEvaluator;


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
