"use strict";

var assert = require("assert"),
    itUtils = require('./integration-utils');

itUtils.describe("Integration tests - simple tests", function(tester) {

    function changeConfig(key, value) {
        itUtils.changeConfig(tester, key, value);
    }

    it("should start with an empty buffer", function() {
	    itUtils.checkPendingRequestsCount(tester, 0);
    });

    it("should have one element in the buffer", function(done) {
        tester.sendRequest().onForwarded(function() {
	        itUtils.checkPendingRequestsCount(tester, 1);
            done();
        });
    });

    it("should consume all the requests in two steps", function(done) {
        tester.sendRequest(3).onForwarded(function() {
	        itUtils.checkPendingRequestsCount(tester, 3);

            tester.serveRequests(2).onServed(function() {
	            itUtils.checkPendingRequestsCount(tester, 1);

                tester.serveRequests().onServed(function() {
	                itUtils.checkPendingRequestsCount(tester, 0);
                    done();
                });
            });
        });
    });

    it("should not let in more requests than the global limit", function(done) {
        changeConfig("max_requests", 1);
        tester.sendRequest().onForwarded(function() {
            tester.sendRequest().onRejected(function() {
	            itUtils.checkPendingRequestsCount(tester, 1);
                done();
            });
        });

    });

    it("Limit 1, first forwarded, next rejected, pending served, next forwarded", function(done) {
        changeConfig("max_requests", 1);

        tester.sendRequest().onForwarded(function() {
            tester.sendRequest().onRejected(function() {
	            itUtils.checkPendingRequestsCount(tester, 1);

                tester.serveRequests().onServed(function() {
	                itUtils.checkPendingRequestsCount(tester, 0);

                    tester.sendRequest().onForwarded(function() {
	                    itUtils.checkPendingRequestsCount(tester, 1);
                        done();
                    });
                });
            });
        });

    });

    it("should always allow /healthcheck/", function(done) {
        changeConfig("max_requests", 1);
        tester.sendRequest().onForwarded(function() {
            tester.sendRequest().onRejected(function() {
                tester.sendRequest(1, {
                    "path": "healthcheck/"
                }).onForwarded(function() {
                    assert.equal(tester.rateLimiter.counter.getGlobalRequestCount(), 1);
                    done();
                });
            });
        });
    });

    it("should not proxy requests to the configEndpoint", function(done) {
        var oldEndpoint = tester.rateLimiter.settings.fullConfigEndpoint;
        var testEndpoint = "test-config-endpoint";
        tester.rateLimiter.settings.fullConfigEndpoint = "/" + testEndpoint;

        tester.sendRequest(1, {
            "path": testEndpoint
        }).onRejected(function(res) {
	        itUtils.checkPendingRequestsCount(tester, 0);
            assert.equal(res.statusCode, 404);

            tester.rateLimiter.settings.fullConfigEndpoint = oldEndpoint;
            done();
        });

    });
});