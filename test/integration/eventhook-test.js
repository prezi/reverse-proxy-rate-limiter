"use strict";

var limitsConfig = require("../../lib/reverse-proxy-rate-limiter/limits-config"),
    assert = require("assert"),
    http = require("http"),
    itUtils = require('./integration-utils');

itUtils.describe("Integration tests - from the hooks", function(tester) {

    var eventStat = bindEventHandlers(tester.rateLimiter.proxyEvent);

    function bindEventHandlers(proxyEvent) {
        var eventStat = {};

        var e = function(name) {
            return function() {
                var v = eventStat[name] != undefined ? eventStat[name] : 0;
                eventStat[name] = v + 1;
            }
        };

        proxyEvent.on('forwarded', e('forwarded'));
        proxyEvent.on('rejected', e('rejected'));
        proxyEvent.on('failed', e('failed'));
        proxyEvent.on('served', e('served'));

        proxyEvent.on('rejectRequest', function(req, res, errorCode, reason) {
            res.writeHead(404, "Rejected by the rate limiter");
            res.write(JSON.stringify({"code": errorCode}));
            res.end();

            e('rejectRequest')();
        });

        return eventStat;
    }

    function clearEventStat(eventStat) {
        delete eventStat['forwarded'];
        delete eventStat['rejected'];
        delete eventStat['failed'];
        delete eventStat['served'];
        delete eventStat['rejectRequest'];
    }

    function changeConfig(key, value) {
        itUtils.changeConfig(tester, key, value);
    }


    it("'served' should be called on served", function(done) {
        clearEventStat(eventStat);

        tester.sendRequest().onForwarded(function() {
            tester.serveRequests(1).onServed(function() {
                assert.equal(eventStat['served'], 1);
                done();
            });
        });
    });

    it("'forwarded' should be called on forward", function(done) {
        clearEventStat(eventStat);

        tester.sendRequest().onForwarded(function() {
            assert.equal(eventStat['forwarded'], 1);
            done();
        });
    });

    it("'rejected' should be called on rejected request", function(done) {
        clearEventStat(eventStat);
        changeConfig("max_requests", 1);

        tester.sendRequest().onForwarded(function() {
            assert.equal(eventStat['forwarded'], 1);
            tester.sendRequest().onRejected(function() {
                assert.equal(eventStat['forwarded'], 1);
                assert.equal(eventStat['rejected'], 1);
                done();
            });
        });
    });

    it("'rejectRequest' should be be able to set the response of a rejected request", function(done) {
        clearEventStat(eventStat);
        changeConfig("max_requests", 1);

        tester.sendRequest().onForwarded(function() {
            assert(eventStat['forwarded'], 1);
            tester.sendRequest().onRejected(function(response) {
                assert.equal(eventStat['forwarded'], 1);
                assert.equal(eventStat['rejected'], 1);
                assert.equal(response.statusCode, 404);
                assert.equal(JSON.parse(response.body).code, 429)
                tester.serveRequests(1).onServed(function() {
                    assert.equal(eventStat['forwarded'], 1);
                    assert.equal(eventStat['rejected'], 1);
                    done();
                })
            });
        });
    });

    it("'failed' should be called on failed", function(done) {
        clearEventStat(eventStat);

        tester.sendRequest().onForwarded(function() {
            tester.failRequestWithInvalidContentLength().onFailed(function() {
                assert.equal(eventStat['forwarded'], 1);
                assert.equal(eventStat['failed'], 1);
                done();
            });
        });
    });
});