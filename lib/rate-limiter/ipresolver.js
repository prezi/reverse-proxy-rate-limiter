"use strict";

var proxyaddr = require('proxy-addr'),
    log4js = require('log4js');

var SMARTROUTER_HEADER = 'X-PREZI-SMARTROUTER-FORWARDED-FOR'.toLowerCase();
var PROXY_HEADER = 'X-FORWARDED-FOR'.toLowerCase();

var logger = log4js.getLogger('ipresolver');

function resolve(req) {
    var srh = req.headers[SMARTROUTER_HEADER];
    var ph = req.headers[PROXY_HEADER];
    var ra = req.socket.remoteAddress;
    var clientIp = "0.0.0.0";
    var ips;
    if (srh) {
        // If the request passed through SmartRouter, we can be certain that
        // the actual client IP address is the last one in the list
        ips = getListOfIpsFromHeader(srh);
        clientIp = ips.last();
    } else if (ph) {
        // If the request only passed through external proxies, and maybe ELB,
        // the situation is a bit trickier. We have to go from the end of the
        // list, and take the first IP that doesn't belong to a private network.
        // More information can be found here:
        // http://serverfault.com/questions/314574/nginx-real-ip-header-and-x-forwarded-for-seems-wrong#answer-414166
        ips = getListOfIpsFromHeader(ph);
        clientIp = getLastPublicIpFromList(ips);
    } else if (ra) {
        clientIp = ra;
    }
    logger.debug("client_ip=" + clientIp + " " + SMARTROUTER_HEADER + "=" + srh + " " + PROXY_HEADER + "=" + ph + " REMOTE_ADDR=" + ra);
    return clientIp;
}

function getListOfIpsFromHeader(headerValue) {
    return headerValue.split(",").map(Function.prototype.call, String.prototype.trim);
}

function getLastPublicIpFromList(ips) {
    var publicIps = ips.filter(isExternalIp);
    if (publicIps.length > 0) {
        return publicIps.last();
    }
    return ips.last();
}

function isExternalIp(ip) {
    var trust = proxyaddr.compile(['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.0.2.0/24', '192.168.0.0/16']);
    var isInternal = trust(ip);
    return !isInternal;
}

Array.prototype.last = function () {
    return this[this.length - 1];
};

exports.resolve = resolve;
exports.SMARTROUTER_HEADER = SMARTROUTER_HEADER;
exports.PROXY_HEADER = PROXY_HEADER;
