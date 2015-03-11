"use strict";

var fs = require('fs'),
    http = require('http'),
    expect = require('expect.js'),
    assert = require("assert"),
    _ = require("lodash"),
    limitsConfig = require("../lib/rate-limiter/limits-config"),
    schema = require("../lib/rate-limiter/limits-config-schema");

describe("Schema validator", function () {
    it("should accept valid config", function () {
        var validConfig = {"version": 1, "max_requests": 10, "buffer_ratio": 0.1, "buckets": [{"name": "default"}]};
        expect(limitsConfig.isValidConfig(validConfig)).to.be.ok();
    });

    it("should reject invalid config'", function () {
        var invalidConfig = {"version": "a", "max_requests": -1, "buffer_ratio": 2};
        expect(limitsConfig.isValidConfig(invalidConfig)).to.not.be.ok();
    });
});

describe("Conditions", function () {
    var configWithValidCondition = {
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
        expect(schema.validate(configWithValidCondition).valid).to.be.ok();
    });

    it("should be rejected with invalid subject type", function () {
        var configWithInvalidSubjectType = configWithValidCondition;
        configWithInvalidSubjectType.buckets[0].conditions = [
            ["unsupported_subject_type", "X-Prezi-Client", "eq", "reuse"]
        ];

        var result = schema.validate(configWithInvalidSubjectType);

        expect(result.valid).to.not.be.ok();
        expect(_.find(result.errors, function (error) {
            return error.message.indexOf("Invalid subject") > -1;
        }));
    });

    it("should be rejected with invalid predicate", function () {
        var configWithInvalidPredicate = configWithValidCondition;
        configWithInvalidPredicate.buckets[0].conditions = [
            ["header", "X-Prezi-Client", "equals_not_eq", "reuse"]
        ];

        var result = schema.validate(configWithInvalidPredicate);

        expect(result.valid).to.not.be.ok();
        expect(_.find(result.errors, function (error) {
            return error.message.indexOf("Invalid predicate") > -1;
        }));
    });
});

describe("Load config from url", function () {
    var httpServer;
    before(function () {
        httpServer = http.createServer(function (req, res) {
            var cfg;
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
        }).listen(9999);
    });

    after(function (done) {
        httpServer.close(done);
    });

    it("should load valid config", function (done) {
        limitsConfig.loadConfig("http://localhost:9999/valid-config/", function (cfg) {
            assert.equal(cfg.version, 1);
            assert.equal(cfg.max_requests, 30);
            assert.equal(cfg.buckets.length, 3);
            done();
        });
    });

    it("should handle invalid config", function (done) {
        limitsConfig.loadConfig("http://localhost:9999/invalid-config/", function (cfg) {
            assert.equal(cfg, null);
            done();
        });
    });

    it("should handle 404 not found", function (done) {
        limitsConfig.loadConfig("http://localhost:9999/404", function (cfg) {
            assert.equal(cfg, null);
            done();
        });
    });

    it("should handle 500 internal server error", function (done) {
        limitsConfig.loadConfig("http://localhost:9999/500", function (cfg) {
            assert.equal(cfg, null);
            done();
        });
    });

});