"use strict";

const assert = require("assert"),
    helpers = require("./../helpers"),
    itUtils = require('./integration-utils');

itUtils.describe("counter consistency test", function(tester) {
    const cfg = {
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
        const bucket = helpers.getBucketByName(tester.rateLimiter.evaluator.limitsConfiguration.buckets, bucketName);
        return ratelimiter.evaluator.counter.getRequestCountForBucket(bucket);
    }

    it("counter consistency: two in, two served", function (done) {
        tester.sendRequests(2, {}, function () {
            assert.strictEqual(2, tester.pendingRequestsCount());
            assert.strictEqual(2, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
            assert.strictEqual(2, getCountForBucket(tester.rateLimiter, "default"));
            tester.serveRequests().onServed(function () {
                assert.strictEqual(0, tester.pendingRequestsCount());
                assert.strictEqual(0, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
                assert.strictEqual(0, getCountForBucket(tester.rateLimiter, "default"));
                done();
            });
        });
    });

    it("counter consistency: four in, one rejected, three served", function (done) {
        tester.sendRequests(3, {}, function () {
            assert.strictEqual(3, tester.pendingRequestsCount());
            assert.strictEqual(3, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
            assert.strictEqual(3, getCountForBucket(tester.rateLimiter, "default"));

            tester.sendRequest().onRejected(function () {
                assert.strictEqual(3, tester.pendingRequestsCount());
                assert.strictEqual(3, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
                assert.strictEqual(3, getCountForBucket(tester.rateLimiter, "default"));
                tester.serveRequests().onServed(function () {
                    assert.strictEqual(0, tester.pendingRequestsCount());
                    assert.strictEqual(0, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
                    assert.strictEqual(0, getCountForBucket(tester.rateLimiter, "default"));
                    done();
                });
            });
        });
    });

    it("counter consistency: one default bucket, one A bucket, both served", function (done) {
        tester.sendRequest().onForwarded(function () {
            assert.strictEqual(1, tester.pendingRequestsCount());
            assert.strictEqual(1, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
            assert.strictEqual(1, getCountForBucket(tester.rateLimiter, "default"));
            assert.strictEqual(0, getCountForBucket(tester.rateLimiter, "A"));

            tester.sendRequest({bucket: 'A'}).onForwarded(function () {
                assert.strictEqual(2, tester.pendingRequestsCount());
                assert.strictEqual(2, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
                assert.strictEqual(1, getCountForBucket(tester.rateLimiter, "default"));
                assert.strictEqual(1, getCountForBucket(tester.rateLimiter, "A"));

                tester.serveRequests().onServed(function () {
                    assert.strictEqual(0, tester.pendingRequestsCount());
                    assert.strictEqual(0, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
                    assert.strictEqual(0, getCountForBucket(tester.rateLimiter, "default"));
                    assert.strictEqual(0, getCountForBucket(tester.rateLimiter, "A"));
                    done();
                });
            });
        });
    });

    it("counter consistency: one A, two default, one rejected due to global limit", function (done) {
        tester.sendRequest({bucket: 'A'}).onForwarded(function () {
            assert.strictEqual(1, tester.pendingRequestsCount());
            assert.strictEqual(1, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
            assert.strictEqual(0, getCountForBucket(tester.rateLimiter, "default"));
            assert.strictEqual(1, getCountForBucket(tester.rateLimiter, "A"));

            tester.sendRequests(2, {}, function () {
                assert.strictEqual(3, tester.pendingRequestsCount());
                assert.strictEqual(3, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
                assert.strictEqual(2, getCountForBucket(tester.rateLimiter, "default"));
                assert.strictEqual(1, getCountForBucket(tester.rateLimiter, "A"));

                tester.sendRequest().onRejected(function () {
                    assert.strictEqual(3, tester.pendingRequestsCount());
                    assert.strictEqual(3, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
                    assert.strictEqual(2, getCountForBucket(tester.rateLimiter, "default"));
                    assert.strictEqual(1, getCountForBucket(tester.rateLimiter, "A"));

                    tester.serveRequests().onServed(function () {
                        assert.strictEqual(0, tester.pendingRequestsCount());
                        assert.strictEqual(0, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
                        assert.strictEqual(0, getCountForBucket(tester.rateLimiter, "default"));
                        assert.strictEqual(0, getCountForBucket(tester.rateLimiter, "A"));
                        done();
                    });
                });
            });
        });
    });

    it("counter consistency: three A, one rejected due to global limit", function (done) {
        tester.sendRequests(3, {bucket: 'A'}, function () {
            assert.strictEqual(3, tester.pendingRequestsCount());
            assert.strictEqual(3, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
            assert.strictEqual(0, getCountForBucket(tester.rateLimiter, "default"));
            assert.strictEqual(3, getCountForBucket(tester.rateLimiter, "A"));

            tester.sendRequest({bucket: "A"}).onRejected(function () {
                assert.strictEqual(3, tester.pendingRequestsCount());
                assert.strictEqual(3, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
                assert.strictEqual(0, getCountForBucket(tester.rateLimiter, "default"));
                assert.strictEqual(3, getCountForBucket(tester.rateLimiter, "A"));

                tester.serveRequests().onServed(function () {
                    assert.strictEqual(0, tester.pendingRequestsCount());
                    assert.strictEqual(0, tester.rateLimiter.evaluator.counter.getGlobalRequestCount());
                    assert.strictEqual(0, getCountForBucket(tester.rateLimiter, "default"));
                    assert.strictEqual(0, getCountForBucket(tester.rateLimiter, "A"));
                    done();
                });
            });
        });
    });
});
