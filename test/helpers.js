"use strict";

var rateLimiter = require("../lib/rate-limiter/");

module.exports.createTestRateLimiter = createTestRateLimiter;

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

module.exports.configMock = {
    get: function(key) {
        if (key == "log4js.path") return __dirname + "/../lib/log4js-configuration.json";
    }
};
