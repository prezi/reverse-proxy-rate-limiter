"use strict";

var _ = require("underscore")._,
    assert = require("assert"),
    limitsConfig = require("../../lib/rate-limiter/limits-config"),
    itUtils = require('./integration-utils');

itUtils.describe("Integration tests", function(tester) {

    function changeConfig(key, value) {
        itUtils.changeConfig(tester, key, value);
    }

    it("should start with an empty buffer", function() {
        assert.equal(tester.requestBuffer.length, 0);
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

    it("should always allow /healthcheck/", function(done) {
        changeConfig("max_requests", 1);
        tester.sendRequest().onForwarded(function() {
            tester.sendRequest().onRejected(function() {
                tester.sendRequest(1, {
                    "path": "healthcheck/"
                }).onForwarded(function() {
                    assert.equal(tester.rateLimiter.counter.getGlobal(), 1);
                    done();
                });
            });
        });
    });

    it("should not proxy requests to the configEndpoint", function(done) {
        var oldEndpoint = tester.rateLimiter.options.configEndpoint;
        var testEndpoint = "test-config-endpoint";
        tester.rateLimiter.options.configEndpoint = "/" + testEndpoint;

        tester.sendRequest(1, {
            "path": testEndpoint
        }).onRejected(function(res) {
            itUtils.checkPendingRequestsCount(tester, 0);
            assert.equal(res.statusCode, 404);

            tester.rateLimiter.options.configEndpoint = oldEndpoint;
            done();
        });

    });

    it("should limit per bucket", function(done) {
        var buckets = [{
            "name": "default"
        }, {
            "name": "A",
            "conditions": [
                ["header", "Bucket", "eq", "A"]
            ],
            "limits": {
                "capacity_unit": 2
            }
        }];

        changeConfig("buckets", buckets);
        changeConfig("max_requests", 2);
        var options = {
            "bucket": "A"
        };
        tester.sendRequest(2, options).onForwarded(function() {
            tester.sendRequest(1, options).onRejected(function() {
                done();
            });
        });
    });

    it("should update bucket limits when requests are served", function(done) {
        var buckets = [{
            "name": "default"
        }, {
            "name": "A",
            "conditions": [
                ["header", "Bucket", "eq", "A"]
            ],
            "limits": {
                "capacity_unit": 2
            }
        }];

        changeConfig("buckets", buckets);
        changeConfig("max_requests", 2);
        var options = {
            "bucket": "A"
        };
        tester.sendRequest(2, options).onForwarded(function() {
            tester.sendRequest(1, options).onRejected(function() {
                tester.serveRequests(2).onServed(function() {
                    tester.sendRequest(1, options).onForwarded(function() {
                        done();
                    });
                });
            });
        });
    });

    it("let everything in with default configuration", function(done) {
        tester.rateLimiter.updateConfig(limitsConfig.defaultConfig);

        tester.sendRequest(100).onForwarded(function() {
            done();
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


    var cfg2 = {
        version: 1,
        max_requests: 10,
        buffer_ratio: 0.2,
        buckets: [{
            name: "default",
            limits: {
                capacity_unit: 4
            }
        }, {
            name: "reuse",
            limits: {
                capacity_unit: 3
            },
            conditions: [
                ["header", "bucket", "eq", "reuse"]
            ]
        }, {
            name: "backup",
            limits: {
                capacity_unit: 1
            },
            conditions: [
                ["header", "bucket", "eq", "backup"]
            ]
        }]
    };
    var bucketReuse = {
        "bucket": "reuse"
    };
    var bucketBackup = {
        "bucket": "backup"
    };


    it("soft-hard limit testing", function(done) {
        tester.rateLimiter.updateConfig(cfg2);

        tester.sendRequest(8).onForwarded(function() {
            tester.sendRequest(1).onRejected(function() {
                tester.sendRequest(2, bucketReuse).onForwarded(function() { // hard limit reached, next will be rejected
                    tester.sendRequest(1, bucketBackup).onRejected(function() {
                        tester.serveRequests(-2).onServed(function() { // serve the first two default, still above the "soft" limit
                            tester.sendRequest(1, bucketBackup).onForwarded(function() {
                                tester.serveRequests().onServed(function() {
                                    done();
                                });
                            });
                        });
                    });
                });
            });
        });
    });

    it("bucket ratio test", function(done) {
        tester.rateLimiter.updateConfig(cfg2);

        tester.sendRequest(5, bucketBackup).onForwarded(function() { // 5 backup
            tester.sendRequest(5, bucketReuse).onForwarded(function() {
                // 5 backup, 5 reuse = 10  = hard limit
                // next request will be rejected
                tester.sendRequest(1, bucketBackup).onRejected(function() { //
                    tester.serveRequests(-1).onServed(function() {
                        // 4 backup, 5 reuse = 9 = soft limit
                        // expected ratio is 2 backup : 6 reuse
                        // next backup will be rejected but next reuse will be forwarded
                        tester.sendRequest(1, bucketBackup).onRejected(function() {
                            tester.sendRequest(1, bucketReuse).onForwarded(function() {
                                done();
                            });
                        });
                    })
                });
            });
        });
    });

    var maxRequestsPerIPConfig = {
        version: 1,
        max_requests: 10,
        buffer_ratio: 0.2,
        buckets: [{
            name: "default",
            limits: {
                max_requests_per_ip: 2
            }
        }]
    };
    var bucketDefault = {
        "bucket": "default"
    };


    it("ip limit is enforced", function(done) {
        tester.rateLimiter.updateConfig(maxRequestsPerIPConfig);

        tester.sendRequest(2, bucketDefault).onForwarded(function() {
            tester.sendRequest(1, bucketDefault).onRejected(function() {
                tester.serveRequests(2).onServed(function() {
                    tester.sendRequest(1, bucketDefault).onForwarded(function() {
                        done();
                    });
                });
            });
        });
    });
});