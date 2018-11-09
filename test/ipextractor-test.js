"use strict";

const IPExtractor = require("../lib/reverse-proxy-rate-limiter/ipextractor").IPExtractor;
const assert = require('assert');

describe("IP Extracting",function(){

    let ipextractor;
    beforeEach(function(){

        ipextractor = new IPExtractor({
            "ignored_ip_ranges": [
                "127.0.0.0/8",
                "10.0.0.0/8",
                "172.16.0.0/12",
                "192.0.2.0/24",
                "192.168.0.0/16",
                "193.45.0.0/16"
            ]
        });
    });


    it("should return the only ip", function () {
        const result = ipextractor.extractClientIP('41.168.1.1');
        assert.strictEqual(result,'41.168.1.1');
    });

    it("should return the last ip", function () {
        const result = ipextractor.extractClientIP(' 41.168.1.1, 41.168.1.2 ');
        assert.strictEqual(result,'41.168.1.2');
    });

    it("should return last not ignored ip", function () {
        const result = ipextractor.extractClientIP(' 41.168.1.1, 192.168.1.2');
        assert.strictEqual(result,'41.168.1.1');
    });

    it("should return the last ip if no configuration", function () {
        ipextractor = new IPExtractor({});
        const result = ipextractor.extractClientIP(' 41.168.1.1, 192.168.1.2');
        assert.strictEqual(result,'192.168.1.2');
    });

    it("should return the last ip if no public ip present", function () {
        const result = ipextractor.extractClientIP(' 192.168.1.1, 192.168.1.2');
        assert.strictEqual(result,'192.168.1.2');
    });
});
