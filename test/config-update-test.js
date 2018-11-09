"use strict";

const expect = require('expect');
const _ = require("lodash");
const assert = require('assert');
const helpers = require('./helpers');
const LimitsEvaluator = require("../lib/reverse-proxy-rate-limiter/limits-evaluator");
const EventEmitter = require('events').EventEmitter;
const createTestLimitsEvaluator = require("./helpers").createTestLimitsEvaluator;
const TestLimitsConfigurationLoader = require("./helpers").TestLimitsConfigurationLoader;

describe("Initializing Ratelimiter with limitsConfiguration", function () {
    let evaluator;
    beforeEach(function (done) {
        const settings = require('../lib/reverse-proxy-rate-limiter/settings').load();
        settings.fullConfigEndpoint = "file:./test/fixtures/example_configuration.json";

        evaluator = new LimitsEvaluator(settings, new EventEmitter());
        evaluator.onConfigurationUpdated = done;
    });

    it("should load required parameters", function () {
        expect(evaluator.limitsConfiguration.maxRequests).toBe(30);
        expect(evaluator.limitsConfiguration.maxRequestsWithoutBuffer).toBe(27);
        expect(evaluator.limitsConfiguration.bufferRatio).toBe(0.1);
        expect(evaluator.limitsConfiguration.healthcheckUrl).toBe("/healthcheck/");
    });

    it("should load 3 buckets", function () {
        expect(Object.keys(evaluator.limitsConfiguration.buckets).length).toBe(3);
    });

    it("should load default bucket", function () {
        const defaultBucket = helpers.getBucketByName(evaluator.limitsConfiguration.buckets, "default");

        expect(defaultBucket.name).toBe("default");
        expect(defaultBucket.capacityUnit).toBe(7);
        expect(defaultBucket.maxRequests).toBe(19);
        expect(defaultBucket.maxRequestsPerIp).toBe(5);
    });

    it("should load and configure all the buckets' limits", function () {
        expect(helpers.getBucketByName(evaluator.limitsConfiguration.buckets, "default").maxRequests).toBe(19);
        expect(helpers.getBucketByName(evaluator.limitsConfiguration.buckets, "default").maxRequestsPerIp).toBe(5);

        expect(helpers.getBucketByName(evaluator.limitsConfiguration.buckets, "reuse").maxRequests).toBe(6);
        expect(helpers.getBucketByName(evaluator.limitsConfiguration.buckets, "backup").maxRequests).toBe(3);
    });

    it("should fall back to default limits configuration if loading of configuration failed", function () {
        evaluator.limitConfigurationLoader = new TestLimitsConfigurationLoader("dumy_endpoint");
        evaluator.limitsConfiguration = null;
        evaluator.onConfigurationUpdated = null;
        evaluator.loadConfig();

        expect(evaluator.limitsConfiguration.maxRequests).toBe(0);
        expect(evaluator.limitsConfiguration.maxRequestsWithoutBuffer).toBe(0);
        expect(evaluator.limitsConfiguration.bufferRatio).toBe(0);
        expect(evaluator.limitsConfiguration.buckets.length).toBe(1);
        expect(evaluator.limitsConfiguration.buckets[0].name).toBe("default");
    });
});


describe("Config change tests", function () {
    const cfg = {
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
        return _.cloneDeep(cfg);
    }

    function assertRequestCountsEqual(bucket, ip, expectedCounts) {
        assert.strictEqual(evaluator.counter.getGlobalRequestCount(), expectedCounts[0]);
        assert.strictEqual(evaluator.counter.getRequestCountForBucket(bucket), expectedCounts[1]);
        assert.strictEqual(evaluator.counter.getRequestCountForBucketAndIP(bucket, ip), expectedCounts[2]);
    }

    const cfgWith2Buckets = cloneConfig(cfg);
    cfgWith2Buckets.buckets.push({
        "name": "test",
        "conditions": [["true", "eq", "true"]],
        "limits": {
            "capacity_unit": 3
        }
    });

    let evaluator;
    beforeEach(function () {
        // the rateLimiter created by createTestLimitsEvaluator does not start a proxy so it doesn't need to be terminated
        evaluator = createTestLimitsEvaluator({});
        evaluator.updateConfig(cfg);
    });

    it("changing a bucket's config to have no limits it should have no limits", function () {
        const cfg2 = cloneConfig(cfg);
        assert.strictEqual(evaluator.limitsConfiguration.buckets[0].capacityUnit, 2);

        cfg2.buckets[0] = {name: "default"};
        evaluator.updateConfig(cfg2);
        assert.strictEqual(evaluator.limitsConfiguration.buckets[0].capacityUnit, 0);
    });

    it("changing the bucket's config should not change the request count", function () {

        evaluator.counter.increment(evaluator.limitsConfiguration.buckets[0], "dummy_ip");

        assert.strictEqual(evaluator.limitsConfiguration.buckets[0].capacityUnit, 2);
        assertRequestCountsEqual(evaluator.limitsConfiguration.buckets[0], "dummy_ip", [1, 1, 1]);

        const cfg2 = cloneConfig(cfg);
        cfg2.buckets[0].limits.capacity_unit = 3;
        evaluator.updateConfig(cfg2);

        assert.strictEqual(evaluator.limitsConfiguration.buckets[0].capacityUnit, 3);
        assertRequestCountsEqual(evaluator.limitsConfiguration.buckets[0], "dummy_ip", [1, 1, 1]);
    });

    it("adding and removing buckets", function () {
        evaluator.counter.increment(evaluator.limitsConfiguration.buckets[0], "dummy_ip");
        assert.strictEqual(evaluator.limitsConfiguration.buckets.length, 1);
        assertRequestCountsEqual(evaluator.limitsConfiguration.buckets[0], "dummy_ip", [1, 1, 1]);

        evaluator.updateConfig(cfgWith2Buckets);
        assert.strictEqual(evaluator.limitsConfiguration.buckets.length, 2);
        assert.strictEqual(evaluator.limitsConfiguration.buckets[0].name, "test");
        assert.strictEqual(evaluator.limitsConfiguration.buckets[1].name, "default");

        evaluator.updateConfig(cfg);
        assert.strictEqual(evaluator.limitsConfiguration.buckets.length, 1);
        assert.strictEqual(evaluator.limitsConfiguration.buckets[0].name, "default");
        assertRequestCountsEqual(evaluator.limitsConfiguration.buckets[0], "dummy_ip", [1, 1, 1]);
    });

});
