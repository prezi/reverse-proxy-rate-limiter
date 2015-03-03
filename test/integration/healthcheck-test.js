"use strict";

var rateLimiter = require("./../../index.js"),
    request = require("request"),
    assert = require("assert");

it("should return a healthcheck if healthcheck header is set", function (done) {
    var host = "localhost";
    var listenPort = 8082;

    rateLimiter.createRateLimiter({
        listenPort: listenPort,
        forwardPort: 8081,
        forwardHost: host,
        configRefreshInterval: 10000,
        configEndpoint: 'file:./test/fixtures/example_configuration.json'
    });

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
