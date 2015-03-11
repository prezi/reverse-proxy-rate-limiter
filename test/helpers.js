"use strict";

module.exports.createTestRateLimiter = createTestRateLimiter;


function createTestRateLimiter(options) {
    var rateLimiter = require("../lib/rate-limiter/");
    // returns a RateLimiter instance that neither initializes a config nor starts the proxy

    function TestRateLimiter(options) {
        rateLimiter.RateLimiter.call(this, options);
    }

    TestRateLimiter.prototype = Object.create(rateLimiter.RateLimiter.prototype);
    TestRateLimiter.prototype.loadConfig = function () {
    };
    TestRateLimiter.prototype.initProxy = function () {
    };

    return new TestRateLimiter(options);
}
