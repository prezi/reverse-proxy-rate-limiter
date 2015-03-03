"use strict";

var _ = require("underscore")._,
    assert = require("assert"),
    CounterStore = require("../lib/rate-limiter/counter.js").CounterStore;

describe("CounterStore tests", function () {
    var cs;
    beforeEach(function () {
        cs = new CounterStore();
    });

    var bucket1 = {name: "bucket1"}, bucket2 = {name: "bucket2"};

    it("should increment the counters", function () {
        cs.increment(bucket1, "ip1");
        cs.increment(bucket1, "ip1");
        cs.increment(bucket1, "ip2");
        cs.increment(bucket2, "ip1");

        var counters = {
            global: cs.get(bucket1, "ip1")[0],

            bucket1: cs.get(bucket1, "ip1")[1],
            bucket1_ip1: cs.get(bucket1, "ip1")[2],
            bucket1_ip2: cs.get(bucket1, "ip2")[2],

            bucket2: cs.get(bucket2, "ip1")[1],
            bucket2_ip1: cs.get(bucket2, "ip1")[2],
            bucket2_ip2: cs.get(bucket2, "ip2")[2]
        };

        assert.equal(counters.global, 4);
        assert.equal(counters.bucket1, 3);
        assert.equal(counters.bucket1_ip1, 2);
        assert.equal(counters.bucket1_ip2, 1);

        assert.equal(counters.bucket2, 1);
        assert.equal(counters.bucket2_ip1, 1);
        assert.equal(counters.bucket2_ip2, 0);
    });

    it("should increment and decrement the counters", function () {
        cs.increment(bucket1, "ip1");
        cs.increment(bucket1, "ip1");
        cs.increment(bucket1, "ip2");

        cs.decrement(bucket1, "ip1");
        cs.decrement(bucket1, "ip2");

        var counters = {
            global: cs.get(bucket1, "ip1")[0],

            bucket1: cs.get(bucket1, "ip1")[1],
            bucket1_ip1: cs.get(bucket1, "ip1")[2],
            bucket1_ip2: cs.get(bucket1, "ip2")[2]
        };

        assert.equal(counters.global, 1);
        assert.equal(counters.bucket1, 1);
        assert.equal(counters.bucket1_ip1, 1);
        assert.equal(counters.bucket1_ip2, 0);
    });

    it("should delete the nulled values", function () {
        cs.increment(bucket1, "ip1");
        cs.decrement(bucket1, "ip1");
        assert.equal(Object.keys(cs.counters).length, 0);
    });
});
