const IntegrationTester = require("./integration-tester").IntegrationTester,
    _ = require("lodash"),
    assert = require("assert");

const cfg = {
    "version": 1,
    "max_requests": 10,
    "healthcheck_url": "/healthcheck/",
    "buffer_ratio": 0.1,
    "buckets": [{
        "name": "default"
    }]
};

module.exports.changeConfig = function(tester, key, value) {
    const _cfg = _.cloneDeep(cfg);
    _cfg[key] = value;
    tester.rateLimiter.evaluator.updateConfig(_cfg);
};

module.exports.describe = function(name, testingFunction) {

    describe(name, function() {

        const tester = new IntegrationTester();

        after(function(done) {
            tester.closeTestBackendServer(function() {
                tester.rateLimiter.close(done);
            });
        });

        beforeEach(function(done) {
            tester.rateLimiter.evaluator.onConfigurationUpdated = function() {
                tester.rateLimiter.evaluator.onConfigurationUpdated = null;
                done();
            };
            tester.rateLimiter.evaluator.updateConfig(cfg);
        });

        afterEach(function(done) {
	        tester.reset(done);
        });

        testingFunction(tester);
    });
};

module.exports.checkPendingRequestsCount = function(tester, expectedRequestsCount) {
    assert.strictEqual(tester.pendingRequestsCount(), expectedRequestsCount);
};