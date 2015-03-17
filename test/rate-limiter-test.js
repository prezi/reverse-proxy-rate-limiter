"use strict";

var expect = require('expect.js'),
    assert = require('assert'),
    rateLimiter = require("../lib/reverse-proxy-rate-limiter/"),
    settings = require("../lib/reverse-proxy-rate-limiter/settings"),
    createTestRateLimiter = require('./helpers').createTestLimitsEvaluator;

describe("Default settings values", function () {
    var rl;
    before(function() {
        // the rateLimiter created by createTestLimitsEvaluator does not start a proxy so it doesn't need to be terminated
        var s = settings.load();
        rl = createTestRateLimiter(s);
    });

    it("config endpoint should be set to valid URL", function () {
        expect(rl.getConfigEndpoint()).to.be("http://localhost:8000/rate-limiter/");
    });

    it("should be 60000", function () {
        expect(rl.getConfigRefreshInterval()).to.be(60000);
    });

    it("should validate the options", function () {
        var testSettings = {
            forwardHost: "example.com",
            forwardPort: 9001,
            configEndpoint: "test_endpoint"
        };
        expect(settings.updateDerivedSettings(testSettings).fullConfigEndpoint).to.be("http://example.com:9001/test_endpoint");

        var testSettings1 = {
            forwardHost: "example.com",
            forwardPort: 9001,
            configEndpoint: "/test_endpoint"
        };
        expect(settings.updateDerivedSettings(testSettings1).fullConfigEndpoint).to.be("http://example.com:9001/test_endpoint");

        var testSettings2 = {
            forwardHost: "example.com/",
            forwardPort: 9001,
            configEndpoint: "/test_endpoint"
        };
        expect(settings.updateDerivedSettings(testSettings2).fullConfigEndpoint).to.be("http://example.com/test_endpoint");

        var testSettings3 = {
            forwardHost: "localhost",
            forwardPort: "9001",
            configEndpoint: "test_endpoint"
        };
        expect(settings.updateDerivedSettings(testSettings3).fullConfigEndpoint).to.be("http://localhost:9001/test_endpoint");

        var testSettings4 = {
            forwardHost: "localhost",
            forwardPort: "test",
            configEndpoint: "test_endpoint"
        };
        expect(settings.updateDerivedSettings(testSettings4).fullConfigEndpoint).to.be("http://localhost/test_endpoint");
    });
});
