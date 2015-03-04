"use strict";

var rateLimiter = require("./../../index.js"),
    request = require("request"),
    assert = require("assert");

describe("Healthcheck test", function() {
    var host = "localhost";
    var listenPort = 8082;

    var rl;
    before(function () {
        rl = rateLimiter.createRateLimiter({
            listenPort: listenPort,
            forwardPort: 8081,
            forwardHost: host,
            configRefreshInterval: 10000,
            configEndpoint: 'file:./test/fixtures/example_configuration.json'
        });
    });

    after(function (done) {
        rl.close(done);
    });

    it("should return a healthcheck if healthcheck header is set", function (done) {
        request({
            url: "http://" + host + ":" + listenPort,
            headers: {
                'x-rate-limiter': 'healthcheck'
            }
        }, function (error, response, body) {
            if (!error && response.statusCode === 200) {
                assert.equal(body, "OK");
                done();
            }
        });
    });
});
