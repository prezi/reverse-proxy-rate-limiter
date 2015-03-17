"use strict";

var log4js = require('log4js'),
    IPExtractor = require("./ipextractor").IPExtractor;

var PROXY_HEADER = 'X-FORWARDED-FOR'.toLowerCase();
var ipExtractorMap = {};

// If the request only passed through external proxies, and maybe ELB,
// the situation is a bit trickier. We have to go from the end of the
// list, and take the first IP that doesn't belong to a private network.
// More information can be found here:
// http://serverfault.com/questions/314574/nginx-real-ip-header-and-x-forwarded-for-seems-wrong#answer-414166

function IPResolver(forwardedHeadersFromSettings) {
    this.forwardedHeaders = forwardedHeadersFromSettings || {};
    this.forwardedHeaders[PROXY_HEADER] = {
        "ignored_ip_ranges": ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.0.2.0/24', '192.168.0.0/16']
    };
}

IPResolver.prototype.resolve = function (req) {
    var remoteAddress = req.socket.remoteAddress;
    for (var key in this.forwardedHeaders) {
        if (this.forwardedHeaders.hasOwnProperty(key)) {
            var hdr = req.headers[key.toLowerCase()];
            if(hdr){
                return this.getExtractor(key).extractClientIP(hdr);
            }
        }
    }
    return remoteAddress;
};

IPResolver.prototype.getExtractor = function (headerName){
    if(!ipExtractorMap.hasOwnProperty(headerName))
        ipExtractorMap[headerName]= new IPExtractor(this.forwardedHeaders[headerName]);
    return ipExtractorMap[headerName];
};

exports.IPResolver = IPResolver;
exports.PROXY_HEADER = PROXY_HEADER;