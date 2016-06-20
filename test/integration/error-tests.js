"use strict";

var assert = require("assert"),
    itUtils = require('./integration-utils');

itUtils.describe("Integration tests - error-tests", function (tester) {

    function changeConfig(key, value) {
        itUtils.changeConfig(tester, key, value);
    }

    it("should handle server errors: HPE_INVALID_CONSTANT", function (done) {
        changeConfig("max_requests", 1);

        tester.sendRequest().onForwarded(function () {
            assert.equal(tester.rateLimiter.evaluator.counter.getGlobalRequestCount(), 1);
            tester.failRequestWithInvalidContentLength().onFailed(function () {
                assert.equal(tester.rateLimiter.evaluator.counter.getGlobalRequestCount(), 0);
                done();
            });
        });
    });

    it("should not fail if a 4xx response is served", function (done) {
        tester.sendRequest({
            "expectedStatusCode": 401
        }).onForwarded(function() {
            itUtils.checkPendingRequestsCount(tester, 1);
            tester.serveRequestWithStatusCode(401).onServed(function () {
                itUtils.checkPendingRequestsCount(tester, 0);
                done();
            });
        });
    });

    it("should not fail if a 5xx response is served", function (done) {
        tester.sendRequest({
            "expectedStatusCode": 500
        }).onForwarded(function() {
            itUtils.checkPendingRequestsCount(tester, 1);
            tester.serveRequestWithStatusCode(500).onServed(function () {
                itUtils.checkPendingRequestsCount(tester, 0);
                done();
            });
        });
    });

});
