"use strict";

var http = require('http'),
    assert = require('assert'),
    proxyquire = require('proxyquire'),
    helpers = require('./helpers'),
    ipResolver = proxyquire('../lib/rate-limiter/ipresolver', { './config': helpers.configMock });

var EXPECTED = "expected";
var ACTUAL = "actual";
var HOST = "localhost";
var PORT = "9876";

var TEST_FORWARD_HEADER = 'X-TEST-FORWARDED-FOR';

var CLIENT_IP = "12.34.56.78";
var LOCAL_HOST = "127.0.0.1";
var SOME_IP = "11.22.33.44";
var IP_LIST = CLIENT_IP + ", " + LOCAL_HOST;
var LONG_IP_LIST = SOME_IP + " ," + IP_LIST;

function createRequest(headers, expected, done) {
    headers[EXPECTED] = expected;
    var options = {
        hostname: HOST,
        path: '/',
        port: PORT,
        headers: headers
    };
    var req = http.request(options, function (response) {
        assert.equal(response.headers[ACTUAL], expected);
        done();
    });
    req.end();
}

describe("Client IP tests", function () {
    var headers;
    var httpServer;

    before(function () {
        httpServer = http.createServer(function (req, res) {
            var ip = ipResolver.resolve(req);
            res.setHeader(ACTUAL, ip);
            res.setHeader("Connection", "close");
            res.writeHead(200, {'Content-Type': 'text/plain'});
            res.end();
        }).listen(PORT);
    });

    after(function (done) {
        httpServer.close(function () {
            done();
        });
    });

    beforeEach(function () {
        headers = {};
    });

    it("CUSTOM_HEADER: if available, takes precedence", function (done) {
        headers[TEST_FORWARD_HEADER] = CLIENT_IP;
        headers[ipResolver.PROXY_HEADER] = LOCAL_HOST;
        headers[ipResolver.REMOTE_ADDR] = LOCAL_HOST;
        createRequest(headers, CLIENT_IP, done);
    });

    it("CUSTOM_HEADER: the last ip in the list is always correct", function (done) {
        headers[TEST_FORWARD_HEADER] = IP_LIST;
        createRequest(headers, LOCAL_HOST, done);
    });

    it("CUSTOM_HEADER: custom header can ignore any ip ranges", function (done) {
        headers[TEST_FORWARD_HEADER] = LONG_IP_LIST;
        createRequest(headers, SOME_IP, done);
    });

    it("PROXY_HEADER: if no SMARTROUTER header, PROXY_HEADER takes precedence", function (done) {
        headers[ipResolver.PROXY_HEADER] = CLIENT_IP;
        headers[ipResolver.REMOTE_ADDR] = LOCAL_HOST;
        createRequest(headers, CLIENT_IP, done);
    });

    it("PROXY_HEADER: the last public ip is the one we need", function (done) {
        headers[ipResolver.PROXY_HEADER] = LONG_IP_LIST;
        createRequest(headers, CLIENT_IP, done);
    });

    it("PROXY_HEADER: if there is no public ip return private", function (done) {
        headers[ipResolver.PROXY_HEADER] = LOCAL_HOST;
        createRequest(headers, LOCAL_HOST, done);
    });

    it("REMOTE_ADDR: no proxies involved, use what we get from server", function (done) {
        headers[ipResolver.REMOTE_ADDR] = LOCAL_HOST;
        createRequest(headers, LOCAL_HOST, done);
    });
});
