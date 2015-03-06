"use strict";

module.exports.createTestRateLimiter = createTestRateLimiter;


function createTestRateLimiter(options) {
    var rateLimiter = require("../lib/rate-limiter/");
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
    configValues: {
        "log4js.path": __dirname + "/../lib/log4js-configuration.json",

        "forwarded_headers": {
            "X-TEST-FORWARDED-FOR": {
                "ignored_ip_ranges": [
                    "127.0.0.0/8",
                    "10.0.0.0/8",
                    "172.16.0.0/12",
                    "192.0.2.0/24",
                    "12.34.0.0/16"
                ]
            }
        }
    },

    get: function(key) {
        return this.configValues[key]
    }
};
