"use strict";

var _ = require("underscore")._,
    assert = require("assert"),
	itUtils = require('./integration-utils');

itUtils.describe("counter consistency test", function(tester) {
    var cfg = {
        version: 1,
        max_requests: 3,
        buffer_ratio: 0,
        buckets: [
            {
                "name": "A",
                "conditions": [["header", "Bucket", "eq", "A"]],
                "limits": {"capacity_unit": 1}
            }, {
                name: "default",
                limits: {
                    "capacity_unit": 2
                }
            }
        ]
    };

    beforeEach(function() {
        tester.rateLimiter.updateConfig(cfg);
    });

    function getCountForBucket(ratelimiter, bucketName) {
        return ratelimiter.counter.get(tester.rateLimiter.configuration.bucketsByName[bucketName], "dummy_ip")[1];
    }

    it("counter consistency: two in, two served", function (done) {
        tester.sendRequest(2).onForwarded(function () {
            assert.equal(2, tester.pendingRequestsCount());
            assert.equal(2, tester.rateLimiter.counter.getGlobal());
            assert.equal(2, getCountForBucket(tester.rateLimiter, "default"));
            tester.serveRequests().onServed(function () {
                assert.equal(0, tester.pendingRequestsCount());
                assert.equal(0, tester.rateLimiter.counter.getGlobal());
                assert.equal(0, getCountForBucket(tester.rateLimiter, "default"));
                done();
            });
        });
    });

    it("counter consistency: four in, one rejected, three served", function (done) {
        tester.sendRequest(3).onForwarded(function () {
            assert.equal(3, tester.pendingRequestsCount());
            assert.equal(3, tester.rateLimiter.counter.getGlobal());
            assert.equal(3, getCountForBucket(tester.rateLimiter, "default"));

            tester.sendRequest().onRejected(function () {
                assert.equal(3, tester.pendingRequestsCount());
                assert.equal(3, tester.rateLimiter.counter.getGlobal());
                assert.equal(3, getCountForBucket(tester.rateLimiter, "default"));
                tester.serveRequests().onServed(function () {
                    assert.equal(0, tester.pendingRequestsCount());
                    assert.equal(0, tester.rateLimiter.counter.getGlobal());
                    assert.equal(0, getCountForBucket(tester.rateLimiter, "default"));
                    done();
                });
            });
        });
    });

    it("counter consistency: one default bucket, one A bucket, both served", function (done) {
        tester.sendRequest(1).onForwarded(function () {
            assert.equal(1, tester.pendingRequestsCount());
            assert.equal(1, tester.rateLimiter.counter.getGlobal());
            assert.equal(1, getCountForBucket(tester.rateLimiter, "default"));
            assert.equal(0, getCountForBucket(tester.rateLimiter, "A"));

            tester.sendRequest(1, {bucket: 'A'}).onForwarded(function () {
                assert.equal(2, tester.pendingRequestsCount());
                assert.equal(2, tester.rateLimiter.counter.getGlobal());
                assert.equal(1, getCountForBucket(tester.rateLimiter, "default"));
                assert.equal(1, getCountForBucket(tester.rateLimiter, "A"));

                tester.serveRequests().onServed(function () {
                    assert.equal(0, tester.pendingRequestsCount());
                    assert.equal(0, tester.rateLimiter.counter.getGlobal());
                    assert.equal(0, getCountForBucket(tester.rateLimiter, "default"));
                    assert.equal(0, getCountForBucket(tester.rateLimiter, "A"));
                    done();
                });
            });
        });
    });

    it("counter consistency: one A, two default, one rejected due to global limit", function (done) {
        tester.sendRequest(1, {bucket: 'A'}).onForwarded(function () {
            assert.equal(1, tester.pendingRequestsCount());
            assert.equal(1, tester.rateLimiter.counter.getGlobal());
            assert.equal(0, getCountForBucket(tester.rateLimiter, "default"));
            assert.equal(1, getCountForBucket(tester.rateLimiter, "A"));

            tester.sendRequest(2).onForwarded(function () {
                assert.equal(3, tester.pendingRequestsCount());
                assert.equal(3, tester.rateLimiter.counter.getGlobal());
                assert.equal(2, getCountForBucket(tester.rateLimiter, "default"));
                assert.equal(1, getCountForBucket(tester.rateLimiter, "A"));

                tester.sendRequest(1).onRejected(function () {
                    assert.equal(3, tester.pendingRequestsCount());
                    assert.equal(3, tester.rateLimiter.counter.getGlobal());
                    assert.equal(2, getCountForBucket(tester.rateLimiter, "default"));
                    assert.equal(1, getCountForBucket(tester.rateLimiter, "A"));

                    tester.serveRequests().onServed(function () {
                        assert.equal(0, tester.pendingRequestsCount());
                        assert.equal(0, tester.rateLimiter.counter.getGlobal());
                        assert.equal(0, getCountForBucket(tester.rateLimiter, "default"));
                        assert.equal(0, getCountForBucket(tester.rateLimiter, "A"));
                        done();
                    });
                });
            });
        });
    });

    it("counter consistency: three A, one rejected due to global limit", function (done) {
        tester.sendRequest(3, {bucket: 'A'}).onForwarded(function () {
            assert.equal(3, tester.pendingRequestsCount());
            assert.equal(3, tester.rateLimiter.counter.getGlobal());
            assert.equal(0, getCountForBucket(tester.rateLimiter, "default"));
            assert.equal(3, getCountForBucket(tester.rateLimiter, "A"));

            tester.sendRequest(1, {bucket: "A"}).onRejected(function () {
                assert.equal(3, tester.pendingRequestsCount());
                assert.equal(3, tester.rateLimiter.counter.getGlobal());
                assert.equal(0, getCountForBucket(tester.rateLimiter, "default"));
                assert.equal(3, getCountForBucket(tester.rateLimiter, "A"));

                tester.serveRequests().onServed(function () {
                    assert.equal(0, tester.pendingRequestsCount());
                    assert.equal(0, tester.rateLimiter.counter.getGlobal());
                    assert.equal(0, getCountForBucket(tester.rateLimiter, "default"));
                    assert.equal(0, getCountForBucket(tester.rateLimiter, "A"));
                    done();
                });
            });
        });
    });
});
