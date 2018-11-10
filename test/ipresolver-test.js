"use strict";

const http = require('http');
const assert = require('assert');
const helpers = require('./helpers');
const ipResolver = require('../lib/reverse-proxy-rate-limiter/ipresolver');

const EXPECTED = "expected";
const ACTUAL = "actual";
const HOST = "localhost";
const PORT = "9876";

const TEST_FORWARD_HEADERS = {
    "X-TEST-FORWARDED-FOR": {
        "ignored_ip_ranges": [
            "127.0.0.0/8",
            "10.0.0.0/8",
            "172.16.0.0/12",
            "192.0.2.0/24",
            "12.34.0.0/16"
        ]
    }
};

const TEST_FORWARD_HEADER = 'X-TEST-FORWARDED-FOR';

const CLIENT_IP = "12.34.56.78";
const LOCAL_HOST = "127.0.0.1";
const SOME_IP = "11.22.33.44";
const IP_LIST = CLIENT_IP + ", " + LOCAL_HOST;
const LONG_IP_LIST = SOME_IP + " ," + IP_LIST;

function createRequest(headers, expected, done) {
    headers[EXPECTED] = expected;
    const options = {
        hostname: HOST,
        path: '/',
        port: PORT,
        headers: headers
    };
    const req = http.request(options, function (response) {
        assert.strictEqual(response.headers[ACTUAL], expected);
        done();
    });
    req.end();
}

describe("Client IP tests", function () {
    let headers;
    let httpServer;

    before(function (done) {
        httpServer = http.createServer(function (req, res) {
            const ip = new ipResolver.IPResolver(TEST_FORWARD_HEADERS).resolve(req);
            res.setHeader(ACTUAL, ip);
            res.setHeader("Connection", "close");
            res.writeHead(200, {'Content-Type': 'text/plain'});
            res.end();
        }).listen(PORT, HOST, done);
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

    it("PROXY_HEADER: if no custom header, PROXY_HEADER takes precedence", function (done) {
        headers[ipResolver.PROXY_HEADER] = CLIENT_IP;
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
        createRequest(headers, LOCAL_HOST, done);
    });
});
