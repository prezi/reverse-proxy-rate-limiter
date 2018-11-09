"use strict";

const request = require("request");
const assert = require("assert");
const itUtils = require('./integration-utils');

itUtils.describe("Healthcheck test", function(tester) {

    it("should return a healthcheck if healthcheck header is set", function(done) {
        request({
            url: "http://localhost:" + tester.listenPort,
            headers: {
                'x-rate-limiter': 'healthcheck'
            }
        }, function (error, response, body) {
            if (!error && response.statusCode === 200) {
                assert.strictEqual(body, "OK");
                done();
            }
        });
    });
});
