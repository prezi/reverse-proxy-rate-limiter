"use strict";

var assert = require("assert"),
    helpers = require("./../helpers"),
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
        tester.rateLimiter.evaluator.updateConfig(cfg);
    });

    function getCountForBucket(ratelimiter, bucketName) {
        var bucket = helpers.getBucketByName(tester.rateLimiter.evaluator.limitsConfiguration.buckets, bucketName);
        return ratelimiter.evaluator.counter.getRequestCountForBucket(bucket);
    }

    it("counter consistency: two in, two served", function (done) {
        tester.sendRequest(2).onForwarded(function () {
            assert.equal(2, tester.pendingRequestsCount());
            assert.equal(2, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
            assert.equal(2, getCountForBucket(tester.rateLimiter, "default"));
            tester.serveRequests().onServed(function () {
                assert.equal(0, tester.pendingRequestsCount());
                assert.equal(0, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
                assert.equal(0, getCountForBucket(tester.rateLimiter, "default"));
                done();
            });
        });
    });

    it("counter consistency: four in, one rejected, three served", function (done) {
        tester.sendRequest(3).onForwarded(function () {
            assert.equal(3, tester.pendingRequestsCount());
            assert.equal(3, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
            assert.equal(3, getCountForBucket(tester.rateLimiter, "default"));

            tester.sendRequest().onRejected(function () {
                assert.equal(3, tester.pendingRequestsCount());
                assert.equal(3, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
                assert.equal(3, getCountForBucket(tester.rateLimiter, "default"));
                tester.serveRequests().onServed(function () {
                    assert.equal(0, tester.pendingRequestsCount());
                    assert.equal(0, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
                    assert.equal(0, getCountForBucket(tester.rateLimiter, "default"));
                    done();
                });
            });
        });
    });

    it("counter consistency: one default bucket, one A bucket, both served", function (done) {
        tester.sendRequest(1).onForwarded(function () {
            assert.equal(1, tester.pendingRequestsCount());
            assert.equal(1, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
            assert.equal(1, getCountForBucket(tester.rateLimiter, "default"));
            assert.equal(0, getCountForBucket(tester.rateLimiter, "A"));

            tester.sendRequest(1, {bucket: 'A'}).onForwarded(function () {
                assert.equal(2, tester.pendingRequestsCount());
                assert.equal(2, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
                assert.equal(1, getCountForBucket(tester.rateLimiter, "default"));
                assert.equal(1, getCountForBucket(tester.rateLimiter, "A"));

                tester.serveRequests().onServed(function () {
                    assert.equal(0, tester.pendingRequestsCount());
                    assert.equal(0, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
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
            assert.equal(1, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
            assert.equal(0, getCountForBucket(tester.rateLimiter, "default"));
            assert.equal(1, getCountForBucket(tester.rateLimiter, "A"));

            tester.sendRequest(2).onForwarded(function () {
                assert.equal(3, tester.pendingRequestsCount());
                assert.equal(3, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
                assert.equal(2, getCountForBucket(tester.rateLimiter, "default"));
                assert.equal(1, getCountForBucket(tester.rateLimiter, "A"));

                tester.sendRequest(1).onRejected(function () {
                    assert.equal(3, tester.pendingRequestsCount());
                    assert.equal(3, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
                    assert.equal(2, getCountForBucket(tester.rateLimiter, "default"));
                    assert.equal(1, getCountForBucket(tester.rateLimiter, "A"));

                    tester.serveRequests().onServed(function () {
                        assert.equal(0, tester.pendingRequestsCount());
                        assert.equal(0, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
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
            assert.equal(3, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
            assert.equal(0, getCountForBucket(tester.rateLimiter, "default"));
            assert.equal(3, getCountForBucket(tester.rateLimiter, "A"));

            tester.sendRequest(1, {bucket: "A"}).onRejected(function () {
                assert.equal(3, tester.pendingRequestsCount());
                assert.equal(3, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
                assert.equal(0, getCountForBucket(tester.rateLimiter, "default"));
                assert.equal(3, getCountForBucket(tester.rateLimiter, "A"));

                tester.serveRequests().onServed(function () {
                    assert.equal(0, tester.pendingRequestsCount());
                    assert.equal(0, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
                    assert.equal(0, getCountForBucket(tester.rateLimiter, "default"));
                    assert.equal(0, getCountForBucket(tester.rateLimiter, "A"));
                    done();
                });
            });
        });
    });
});
