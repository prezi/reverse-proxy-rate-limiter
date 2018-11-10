"use strict";

const expect = require('expect'),
    assert = require('assert'),
    rateLimiter = require("../lib/reverse-proxy-rate-limiter/"),
    settings = require("../lib/reverse-proxy-rate-limiter/settings"),
    createTestRateLimiter = require('./helpers').createTestLimitsEvaluator;

describe("Default settings values", function () {
    let rl;
    before(function() {
        // the rateLimiter created by createTestLimitsEvaluator does not start a proxy so it doesn't need to be terminated
        const s = settings.load();
        rl = createTestRateLimiter(s);
    });

    it("config endpoint should be set to valid URL", function () {
        expect(rl.getConfigEndpoint()).toBe("http://localhost:8000/rate-limiter/");
    });

    it("refresh interval should be 0", function () {
        expect(rl.getConfigRefreshInterval()).toBe(0);
    });

    it("should validate the options", function () {
        const testSettings = {
            forwardHost: "example.com",
            forwardPort: 9001,
            configEndpoint: "test_endpoint"
        };
        expect(settings.updateDerivedSettings(testSettings).fullConfigEndpoint).toBe("http://example.com:9001/test_endpoint");

        const testSettings1 = {
            forwardHost: "example.com",
            forwardPort: 9001,
            configEndpoint: "/test_endpoint"
        };
        expect(settings.updateDerivedSettings(testSettings1).fullConfigEndpoint).toBe("http://example.com:9001/test_endpoint");

        const testSettings2 = {
            forwardHost: "example.com/",
            forwardPort: 9001,
            configEndpoint: "/test_endpoint"
        };
        expect(settings.updateDerivedSettings(testSettings2).fullConfigEndpoint).toBe("http://example.com/test_endpoint");

        const testSettings3 = {
            forwardHost: "localhost",
            forwardPort: "9001",
            configEndpoint: "test_endpoint"
        };
        expect(settings.updateDerivedSettings(testSettings3).fullConfigEndpoint).toBe("http://localhost:9001/test_endpoint");

        const testSettings4 = {
            forwardHost: "localhost",
            forwardPort: "test",
            configEndpoint: "test_endpoint"
        };
        expect(settings.updateDerivedSettings(testSettings4).fullConfigEndpoint).toBe("http://localhost/test_endpoint");
    });
});
