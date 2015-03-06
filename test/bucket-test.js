"use strict";

var expect = require('expect.js'),
    fs = require('fs'),
    helpers = require('./helpers'),
    Bucket = require('../lib/rate-limiter/bucket').Bucket;

describe("Bucket tests", function () {
    var request = {
        "url": "/test"
    };
    it("should match the bucket", function () {
        var bucket = new Bucket({
            name: "testBucket",
            conditions: [
                ["path", "eq", "/test"]
            ]
        });

        expect(bucket.matches(request)).to.be(true);
    });

    it("should not match the bucket", function () {
        var bucket = new Bucket({
            name: "testBucket",
            conditions: [
                ["path", "eq", "/test2"]
            ]
        });

        expect(bucket.matches(request)).to.be(false);
    });

    it("should not match if only one condition is met", function () {
        var bucket = new Bucket({
            name: "testBucket",
            conditions: [
                ["path", "eq", "/test"],
                ["path", "eq", "/test2"]
            ]
        });

        expect(bucket.matches(request)).to.be(false);
    });

    var rl;

    it("should choose the reuse bucket", function () {
        var b = rl.getMatchingBucket({headers: {"x-prezi-client": "reuse-e5759ce4bb1c298b063f2d8aa1a334"}});
        expect(b.name).to.be("reuse");
    });
    it("should choose the default bucket", function () {
        var b = rl.getMatchingBucket();
        expect(b.name).to.be("default");
    });

    before(function () {
        rl = helpers.createTestRateLimiter();
        rl.updateConfig(JSON.parse(fs.readFileSync("./test/fixtures/example_configuration.json")));
    });

});
