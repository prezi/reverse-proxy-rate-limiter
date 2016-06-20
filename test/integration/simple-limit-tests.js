"use strict";

var limitsConfig = require("../../lib/reverse-proxy-rate-limiter/limits-config"),
    itUtils = require('./integration-utils');

itUtils.describe("Integration tests", function(tester) {

    function changeConfig(key, value) {
        itUtils.changeConfig(tester, key, value);
    }

    it("should limit per bucket", function(done) {
        var buckets = [{
            "name": "default"
        }, {
            "name": "A",
            "conditions": [
                ["header", "Bucket", "eq", "A"]
            ],
            "limits": {
                "capacity_unit": 2
            }
        }];

        changeConfig("buckets", buckets);
        changeConfig("max_requests", 2);
        var options = {
            "bucket": "A"
        };
        tester.sendRequests(2, options, function() {
            tester.sendRequest(options).onRejected(function() {
                done();
            });
        });
    });

    it("should update bucket limits when requests are served", function(done) {
        var buckets = [{
            "name": "default"
        }, {
            "name": "A",
            "conditions": [
                ["header", "Bucket", "eq", "A"]
            ],
            "limits": {
                "capacity_unit": 2
            }
        }];

        changeConfig("buckets", buckets);
        changeConfig("max_requests", 2);
        var options = {
            "bucket": "A"
        };
        tester.sendRequests(2, options, function() {
            tester.sendRequest(options).onRejected(function() {
                tester.serveRequests(2).onServed(function() {
                    tester.sendRequest(options).onForwarded(function() {
                        done();
                    });
                });
            });
        });
    });

    it("let everything in with default limitsConfiguration", function(done) {
        tester.rateLimiter.evaluator.updateConfig(limitsConfig.defaultLimitsConfig);

        tester.sendRequests(100, {}, function() {
            done();
        });

    });


});
