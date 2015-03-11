"use strict";

var expect = require('expect.js'),
    assert = require('assert'),
    rateLimiter = require("../lib/rate-limiter/"),
    createTestRateLimiter = require('./helpers').createTestRateLimiter;

describe("Default settings values", function () {
    var rl;
    before(function() {
        // the rateLimiter created by createTestRateLimiter does not start a proxy so it doesn't need to be terminated
        rl = createTestRateLimiter({});
    });

    it("config endpoint should be set to valid URL", function () {
        expect(rl.getConfigEndpoint()).to.be("http://localhost:80/rate_limiter");
    });

    it("should be 60000", function () {
        expect(rl.getConfigRefreshInterval()).to.be(60000);
    });

    it("should validate the options", function () {
        var options = {
            forwardHost: "example.com",
            forwardPort: 9001,
            configEndpoint: "test_endpoint"
        };
        expect(rl.validateOptions(options).configEndpoint).to.be("http://example.com:9001/test_endpoint");

        var options1 = {
            forwardHost: "example.com",
            forwardPort: 9001,
            configEndpoint: "/test_endpoint"
        };
        expect(rl.validateOptions(options1).configEndpoint).to.be("http://example.com:9001/test_endpoint");

        var options2 = {
            forwardHost: "example.com/",
            forwardPort: 9001,
            configEndpoint: "/test_endpoint"
        };
        expect(rl.validateOptions(options2).configEndpoint).to.be("http://example.com/test_endpoint");

        var options3 = {
            forwardHost: "localhost",
            forwardPort: "9001",
            configEndpoint: "test_endpoint"
        };
        expect(rl.validateOptions(options3).configEndpoint).to.be("http://localhost:9001/test_endpoint");

        var options4 = {
            forwardHost: "localhost",
            forwardPort: "test",
            configEndpoint: "test_endpoint"
        };
        expect(rl.validateOptions(options4).configEndpoint).to.be("http://localhost/test_endpoint");
    });
});
