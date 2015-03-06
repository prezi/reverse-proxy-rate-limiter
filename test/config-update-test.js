"use strict";

var expect = require('expect.js'),
    _ = require("underscore")._,
    assert = require('assert'),
    rateLimiter = require("../lib/rate-limiter/"),
    createTestRateLimiter = require("./helpers");

describe("Initializing Ratelimiter with configuration", function () {
    var rl;
    beforeEach(function (done) {
        rl = new rateLimiter.RateLimiter({configEndpoint: "file:./test/fixtures/example_configuration.json"});
        rl.onConfigurationUpdated = done;
    });
    afterEach(function (done) {
        rl.close(done);
    });

    it("should load required parameters", function () {
        expect(rl.configuration.maxRequests).to.be(30);
        expect(rl.configuration.maxRequestsWithoutBuffer).to.be(27);
        expect(rl.configuration.bufferRatio).to.be(0.1);
        expect(rl.configuration.healthcheckUrl).to.be("/healthcheck/");
    });

    it("should load 3 buckets", function () {
        expect(Object.keys(rl.configuration.buckets).length).to.be(3);
    });

    it("should load default bucket", function () {
        expect(rl.configuration.bucketsByName["default"].name).to.be("default");
        expect(rl.configuration.bucketsByName["default"].capacityUnit).to.be(7);
        expect(rl.configuration.bucketsByName["default"].maxRequests).to.be(19);
        expect(rl.configuration.bucketsByName["default"].maxRequestsPerIp).to.be(5);
    });


    it("should load and configure all the buckets' limits", function () {
        expect(rl.configuration.bucketsByName["default"].maxRequests).to.be(19);
        expect(rl.configuration.bucketsByName["default"].maxRequestsPerIp).to.be(5);

        expect(rl.configuration.bucketsByName.reuse.maxRequests).to.be(6);
        expect(rl.configuration.bucketsByName.backup.maxRequests).to.be(3);
    });
});


describe("Config change tests", function () {
    var cfg = {
        "version": 1,
        "max_requests": 10,
        "buffer_ratio": 0.1,
        "buckets": [{
            "name": "default",
            "limits": {
                "capacity_unit": 2
            }
        }]
    };

    function cloneConfig(cfg) {
        // _.clone creates a shallow copy, let's create a bit deeper
        var cloned = _.clone(cfg);
        cloned.buckets = _.map(cfg.buckets, _.clone);
        return cloned;
    }

    var cfgWith2Buckets = cloneConfig(cfg);
    cfgWith2Buckets.buckets.push({
        "name": "test",
        "conditions": [["true", "eq", "true"]],
        "limits": {
            "capacity_unit": 3
        }
    });

    var rl;
    beforeEach(function () {
        // the rateLimiter created by createTestRateLimiter does not start a proxy so it doesn't need to be terminated
        rl = createTestRateLimiter({});
        rl.updateConfig(cfg);
    });

    it("changing a bucket's config to have no limits it should have no limits", function () {
        var cfg2 = cloneConfig(cfg);
        cfg2.buckets[0] = {name: "default"};
        assert.equal(rl.configuration.buckets[0].capacityUnit, 2);

        rl.updateConfig(cfg2);
        assert.equal(rl.configuration.buckets[0].capacityUnit, 0);
    });

    it("changing the bucket's config should not change the request count", function () {

        rl.counter.increment(rl.configuration.buckets[0], "dummy_ip");

        assert.equal(rl.configuration.buckets[0].capacityUnit, 2);
        assert.deepEqual(rl.counter.get(rl.configuration.buckets[0], "dummy_ip"), [1, 1, 1]);

        var cfg2 = cloneConfig(cfg);
        cfg2.buckets[0].limits.capacity_unit = 3;
        rl.updateConfig(cfg2);

        assert.equal(rl.configuration.buckets[0].capacityUnit, 3);
        assert.deepEqual(rl.counter.get(rl.configuration.buckets[0], "dummy_ip"), [1, 1, 1]);
    });

    it("adding and removing buckets", function () {
        rl.counter.increment(rl.configuration.buckets[0], "dummy_ip");
        assert.equal(rl.configuration.buckets.length, 1);
        assert.deepEqual(rl.counter.get(rl.configuration.buckets[0], "dummy_ip"), [1, 1, 1]);

        rl.updateConfig(cfgWith2Buckets);
        assert.equal(rl.configuration.buckets.length, 2);
        assert.equal(rl.configuration.buckets[0].name, "test");
        assert.equal(rl.configuration.buckets[1].name, "default");

        rl.updateConfig(cfg);
        assert.equal(rl.configuration.buckets.length, 1);
        assert.equal(rl.configuration.buckets[0].name, "default");
        assert.deepEqual(rl.counter.get(rl.configuration.buckets[0], "dummy_ip"), [1, 1, 1]);
    });

});
