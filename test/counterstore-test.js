"use strict";

const assert = require("assert"),
    CounterStore = require("../lib/reverse-proxy-rate-limiter/counter.js").CounterStore;

describe("CounterStore tests", function () {
    let cs;
    beforeEach(function () {
        cs = new CounterStore();
    });

    const bucket1 = {name: "bucket1"}, bucket2 = {name: "bucket2"};

    it("should increment the counters", function () {
        cs.increment(bucket1, "ip1");
        cs.increment(bucket1, "ip1");
        cs.increment(bucket1, "ip2");
        cs.increment(bucket2, "ip1");

        const counters = {
            global: cs.getGlobalRequestCount(),

            bucket1: cs.getRequestCountForBucket(bucket1, "ip1"),
            bucket1_ip1: cs.getRequestCountForBucketAndIP(bucket1, "ip1"),
            bucket1_ip2: cs.getRequestCountForBucketAndIP(bucket1, "ip2"),

            bucket2: cs.getRequestCountForBucket(bucket2),
            bucket2_ip1: cs.getRequestCountForBucketAndIP(bucket2, "ip1"),
            bucket2_ip2: cs.getRequestCountForBucketAndIP(bucket2, "ip2")
        };

        assert.strictEqual(counters.global, 4);
        assert.strictEqual(counters.bucket1, 3);
        assert.strictEqual(counters.bucket1_ip1, 2);
        assert.strictEqual(counters.bucket1_ip2, 1);

        assert.strictEqual(counters.bucket2, 1);
        assert.strictEqual(counters.bucket2_ip1, 1);
        assert.strictEqual(counters.bucket2_ip2, 0);
    });

    it("should increment and decrement the counters", function () {
        cs.increment(bucket1, "ip1");
        cs.increment(bucket1, "ip1");
        cs.increment(bucket1, "ip2");

        cs.decrement(bucket1, "ip1");
        cs.decrement(bucket1, "ip2");

        const counters = {
            global: cs.getGlobalRequestCount(),

            bucket1: cs.getRequestCountForBucket(bucket1),
            bucket1_ip1: cs.getRequestCountForBucketAndIP(bucket1, "ip1"),
            bucket1_ip2: cs.getRequestCountForBucketAndIP(bucket1, "ip2")
        };

        assert.strictEqual(counters.global, 1);
        assert.strictEqual(counters.bucket1, 1);
        assert.strictEqual(counters.bucket1_ip1, 1);
        assert.strictEqual(counters.bucket1_ip2, 0);
    });

    it("should delete the nulled values", function () {
        cs.increment(bucket1, "ip1");
        cs.decrement(bucket1, "ip1");
        assert.strictEqual(Object.keys(cs.counters).length, 0);
    });
});
