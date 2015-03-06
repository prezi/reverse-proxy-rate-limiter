var IntegrationTester = require("./integration-tester").IntegrationTester;
var _ = require("underscore")._;
var assert = require("assert");

var cfg = {
    "version": 1,
    "max_requests": 10,
    "healthcheck_url": "/healthcheck/",
    "buffer_ratio": 0.1,
    "buckets": [{
        "name": "default"
    }]
};

module.exports.changeConfig = function(tester, key, value) {
    var _cfg = _.clone(cfg);
    _cfg[key] = value;
    tester.rateLimiter.updateConfig(_cfg);
}

module.exports.describe = function(name, testingFunction) {

    describe(name, function() {

        var tester = new IntegrationTester();

        after(function(done) {
            tester.closeTestBackendServer(function() {
                tester.rateLimiter.close(done);
            });
        });

        beforeEach(function(done) {
            tester.rateLimiter.onConfigurationUpdated = function() {
                tester.rateLimiter.onConfigurationUpdated = null;
                done();
            };
            tester.rateLimiter.updateConfig(cfg);
        });

        afterEach(function(done) {
            tester.reset(done);
        });

        testingFunction(tester);
    });
}

module.exports.checkPendingRequestsCount = function(tester, expectedRequestsCount) {
    assert.equal(tester.pendingRequestsCount(), expectedRequestsCount);
}