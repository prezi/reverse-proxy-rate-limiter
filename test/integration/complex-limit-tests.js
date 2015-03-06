"use strict";

var _ = require("underscore")._,
    assert = require("assert"),
    limitsConfig = require("../../lib/rate-limiter/limits-config"),
    itUtils = require('./integration-utils');

itUtils.describe("Integration tests", function(tester) {

    function changeConfig(key, value) {
        itUtils.changeConfig(tester, key, value);
    }

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