"use strict";

var assert = require("assert"),
    itUtils = require('./integration-utils');

itUtils.describe("Integration tests - error-tests", function(tester) {

    function changeConfig(key, value) {
        itUtils.changeConfig(tester, key, value);
    }

    it("should handle server errors", function(done) {
		changeConfig("max_requests", 1);

		tester.sendRequest().onForwarded(function() {
			assert.equal(tester.rateLimiter.counter.getGlobal(), 1);
			tester.failRequest().onFailed(function() {
				assert.equal(tester.rateLimiter.counter.getGlobal(), 0);
				done();
			});
		});
    });

    it("should not fail if a 4xx response is served", function(done) {
        tester.sendRequest(1, {
            "expectedStatusCode": 401
        }).onForwarded(function() {
	        itUtils.checkPendingRequestsCount(tester, 1);
            tester.serveRequestWithStatusCode(401).onServed(function() {
	            itUtils.checkPendingRequestsCount(tester, 0);
                done();
            });
        });
    });

    it("should not fail if a 5xx response is served", function(done) {
        tester.sendRequest(1, {
            "expectedStatusCode": 500
        }).onForwarded(function() {
	        itUtils.checkPendingRequestsCount(tester, 1);
            tester.serveRequestWithStatusCode(500).onServed(function() {
	            itUtils.checkPendingRequestsCount(tester, 0);
                done();
            });
        });
    });

});