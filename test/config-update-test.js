"use strict";

var expect = require('expect.js'),
    _ = require("lodash"),
    assert = require('assert'),
    helpers = require('./helpers'),
    rateLimiter = require("../lib/rate-limiter/"),
    LimitsEvaluator = require("../lib/rate-limiter/limits-evaluator"),
    createTestLimitsEvaluator = require("./helpers").createTestLimitsEvaluator;

describe("Initializing Ratelimiter with configuration", function () {
    var evaluator;
    beforeEach(function (done) {
        var settings = require('../lib/rate-limiter/settings').load();
        settings.fullConfigEndpoint = "file:./test/fixtures/example_configuration.json";

        evaluator = new LimitsEvaluator(settings);
        evaluator.onConfigurationUpdated = done;
    });

    it("should load required parameters", function () {
        expect(evaluator.configuration.maxRequests).to.be(30);
        expect(evaluator.configuration.maxRequestsWithoutBuffer).to.be(27);
        expect(evaluator.configuration.bufferRatio).to.be(0.1);
        expect(evaluator.configuration.healthcheckUrl).to.be("/healthcheck/");
    });

    it("should load 3 buckets", function () {
        expect(Object.keys(evaluator.configuration.buckets).length).to.be(3);
    });

    it("should load default bucket", function () {
        var defaultBucket = helpers.getBucketByName(evaluator.configuration.buckets, "default");

        expect(defaultBucket.name).to.be("default");
        expect(defaultBucket.capacityUnit).to.be(7);
        expect(defaultBucket.maxRequests).to.be(19);
        expect(defaultBucket.maxRequestsPerIp).to.be(5);
    });

    it("should load and configure all the buckets' limits", function () {
        expect(helpers.getBucketByName(evaluator.configuration.buckets, "default").maxRequests).to.be(19);
        expect(helpers.getBucketByName(evaluator.configuration.buckets, "default").maxRequestsPerIp).to.be(5);

        expect(helpers.getBucketByName(evaluator.configuration.buckets, "reuse").maxRequests).to.be(6);
        expect(helpers.getBucketByName(evaluator.configuration.buckets, "backup").maxRequests).to.be(3);
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
        return _.clone(cfg, true);
    }

    function assertRequestCountsEqual(bucket, ip, expectedCounts) {
        assert.equal(evaluator.counter.getGlobalRequestCount(), expectedCounts[0]);
        assert.equal(evaluator.counter.getRequestCountForBucket(bucket), expectedCounts[1]);
        assert.equal(evaluator.counter.getRequestCountForBucketAndIP(bucket, ip), expectedCounts[2]);
    }

    var cfgWith2Buckets = cloneConfig(cfg);
    cfgWith2Buckets.buckets.push({
        "name": "test",
        "conditions": [["true", "eq", "true"]],
        "limits": {
            "capacity_unit": 3
        }
    });

    var evaluator;
    beforeEach(function () {
        // the rateLimiter created by createTestLimitsEvaluator does not start a proxy so it doesn't need to be terminated
        evaluator = createTestLimitsEvaluator({});
        evaluator.updateConfig(cfg);
    });

    it("changing a bucket's config to have no limits it should have no limits", function () {
        var cfg2 = cloneConfig(cfg);
        cfg2.buckets[0] = {name: "default"};
        assert.equal(evaluator.configuration.buckets[0].capacityUnit, 2);

        evaluator.updateConfig(cfg2);
        assert.equal(evaluator.configuration.buckets[0].capacityUnit, 0);
    });

    it("changing the bucket's config should not change the request count", function () {

        evaluator.counter.increment(evaluator.configuration.buckets[0], "dummy_ip");

        assert.equal(evaluator.configuration.buckets[0].capacityUnit, 2);
        assert.equal(assertRequestCountsEqual(evaluator.configuration.buckets[0], "dummy_ip", [1, 1, 1]));

        var cfg2 = cloneConfig(cfg);
        cfg2.buckets[0].limits.capacity_unit = 3;
        evaluator.updateConfig(cfg2);

        assert.equal(evaluator.configuration.buckets[0].capacityUnit, 3);
        assert.deepEqual(assertRequestCountsEqual(evaluator.configuration.buckets[0], "dummy_ip", [1, 1, 1]));
    });

    it("adding and removing buckets", function () {
        evaluator.counter.increment(evaluator.configuration.buckets[0], "dummy_ip");
        assert.equal(evaluator.configuration.buckets.length, 1);
        assert.equal(assertRequestCountsEqual(evaluator.configuration.buckets[0], "dummy_ip", [1, 1, 1]));

        evaluator.updateConfig(cfgWith2Buckets);
        assert.equal(evaluator.configuration.buckets.length, 2);
        assert.equal(evaluator.configuration.buckets[0].name, "test");
        assert.equal(evaluator.configuration.buckets[1].name, "default");

        evaluator.updateConfig(cfg);
        assert.equal(evaluator.configuration.buckets.length, 1);
        assert.equal(evaluator.configuration.buckets[0].name, "default");
        assert.equal(assertRequestCountsEqual(evaluator.configuration.buckets[0], "dummy_ip", [1, 1, 1]));
    });

});
