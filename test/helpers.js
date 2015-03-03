"use strict";

var rateLimiter = require("../lib/rate-limiter/");

module.exports = createTestRateLimiter;

function createTestRateLimiter(options) {
    // returns a RateLimiter instance that neither initializes a config nor starts the proxy

    function TestRateLimiter(options) {
        rateLimiter.RateLimiter.call(this, options);
    }

    TestRateLimiter.prototype = Object.create(rateLimiter.RateLimiter.prototype);
    TestRateLimiter.prototype.loadConfig = function () {};
    TestRateLimiter.prototype.initProxy = function () {};

    return new TestRateLimiter(options);
}
