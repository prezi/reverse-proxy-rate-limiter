"use strict";

const expect = require('expect');
const fs = require('fs');
const LimitsEvaluator = require('../lib/reverse-proxy-rate-limiter/limits-evaluator');
const EventEmitter = require('events').EventEmitter;
const Bucket = require('../lib/reverse-proxy-rate-limiter/bucket').Bucket;

describe("Bucket tests", function () {
    const request = {
        "url": "/test"
    };
    it("should match the bucket", function () {
        const bucket = new Bucket({
            name: "testBucket",
            conditions: [
                ["path", "eq", "/test"]
            ]
        });

        expect(bucket.matches(request)).toBeTruthy();
    });

    it("should not match the bucket", function () {
        const bucket = new Bucket({
            name: "testBucket",
            conditions: [
                ["path", "eq", "/test2"]
            ]
        });

        expect(bucket.matches(request)).toBeFalsy();
    });

    it("should not match if only one condition is met", function () {
        const bucket = new Bucket({
            name: "testBucket",
            conditions: [
                ["path", "eq", "/test"],
                ["path", "eq", "/test2"]
            ]
        });

        expect(bucket.matches(request)).toBeFalsy();
    });

    let evaluator;

    it("should choose the reuse bucket", function () {
        const b = evaluator.getMatchingBucket({headers: {"x-prezi-client": "reuse-e5759ce4bb1c298b063f2d8aa1a334"}});
        expect(b.name).toBe("reuse");
    });
    it("should choose the default bucket", function () {
        const b = evaluator.getMatchingBucket();
        expect(b.name).toBe("default");
    });

    before(function () {
        evaluator = new LimitsEvaluator({}, new EventEmitter());
        evaluator.updateConfig(JSON.parse(fs.readFileSync("./test/fixtures/example_configuration.json", 'utf8')));
    });

});
