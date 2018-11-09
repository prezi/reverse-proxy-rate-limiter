"use strict";

const fs = require('fs');
const http = require('http');
const expect = require('expect');
const assert = require("assert");
const _ = require("lodash");
const limitsConfig = require("../lib/reverse-proxy-rate-limiter/limits-config");
const LimitsConfigurationLoader = require("../lib/reverse-proxy-rate-limiter/limits-config").LimitsConfigurationLoader;
const schema = require("../lib/reverse-proxy-rate-limiter/limits-config-schema");

describe("Schema validator", function () {
    it("should accept valid config", function () {
        const validConfig = {"version": 1, "max_requests": 10, "buffer_ratio": 0.1, "buckets": [{"name": "default"}]};
        expect(limitsConfig.isValidConfig(validConfig)).toBeTruthy();
    });

    it("should reject invalid config'", function () {
        const invalidConfig = {"version": "a", "max_requests": -1, "buffer_ratio": 2};
        expect(limitsConfig.isValidConfig(invalidConfig)).toBeFalsy();
    });
});

describe("Conditions", function () {
    const configWithValidCondition = {
        "version": 1,
        "max_requests": 10,
        "buffer_ratio": 0.1,
        "buckets": [
            {
                "name": "reuse",
                "conditions": [
                    ["header", "X-Prezi-Client", "eq", "reuse"],
                    ["header", "X-Prezi-Client", "eq", "backup"]
                ],
                "limits": {
                    "capacity_unit": 2
                }
            }
        ]
    };

    it("should be accepted with valid parameters", function () {
        expect(schema.validate(configWithValidCondition).valid).toBeTruthy();
    });

    it("should be rejected with invalid subject type", function () {
        const configWithInvalidSubjectType = configWithValidCondition;
        configWithInvalidSubjectType.buckets[0].conditions = [
            ["unsupported_subject_type", "X-Prezi-Client", "eq", "reuse"]
        ];

        const result = schema.validate(configWithInvalidSubjectType);

        expect(result.valid).toBeFalsy();
        expect(_.find(result.errors, function (error) {
            return error.message.indexOf("Invalid subject") > -1;
        }));
    });

    it("should be rejected with invalid predicate", function () {
        const configWithInvalidPredicate = configWithValidCondition;
        configWithInvalidPredicate.buckets[0].conditions = [
            ["header", "X-Prezi-Client", "equals_not_eq", "reuse"]
        ];

        const result = schema.validate(configWithInvalidPredicate);

        expect(result.valid).toBeFalsy();
        expect(_.find(result.errors, function (error) {
            return error.message.indexOf("Invalid predicate") > -1;
        }));
    });
});

describe("Load config from url", function () {
    let httpServer;
    before(function (done) {
        httpServer = http.createServer(function (req, res) {
            let cfg;
            if (req.url === "/valid-config/") {
                cfg = fs.readFileSync(__dirname + "/fixtures/example_configuration.json");
            } else if (req.url === "/invalid-config/") {
                cfg = "invalid json";

            } else if (/\/\d{3}/.test(req.url)) {
                res.writeHead(parseInt(req.url.substring(1)));
                res.end();
                return;

            } else {
                res.writeHead(404);
                res.end();
                return;
            }

            res.writeHead(200, {'Content-Type': 'text/plain'});
            res.write(cfg);
            res.end();
        }).listen(9999, done);
    });

    after(function (done) {
        httpServer.close(done);
    });

    it("should load valid config", function (done) {
        const limitsConfigurationLoader = new LimitsConfigurationLoader("http://localhost:9999/valid-config/");
        limitsConfigurationLoader.load(function (cfg) {
            assert.strictEqual(cfg.version, 1);
            assert.strictEqual(cfg.max_requests, 30);
            assert.strictEqual(cfg.buckets.length, 3);
            done();
        });
    });

    it("should handle invalid config", function (done) {
        const limitsConfigurationLoader = new LimitsConfigurationLoader("http://localhost:9999/invalid-config/");
        limitsConfigurationLoader.load(function (cfg) {
            assert.strictEqual(cfg, null);
            done();
        });
    });

    it("should handle 404 not found", function (done) {
        const limitsConfigurationLoader = new LimitsConfigurationLoader("http://localhost:9999/404");
        limitsConfigurationLoader.load(function (cfg) {
            assert.strictEqual(cfg, null);
            done();
        });
    });

    it("should handle 500 internal server error", function (done) {
        const limitsConfigurationLoader = new LimitsConfigurationLoader("http://localhost:9999/500");
        limitsConfigurationLoader.load(function (cfg) {
            assert.strictEqual(cfg, null);
            done();
        });
    });

});