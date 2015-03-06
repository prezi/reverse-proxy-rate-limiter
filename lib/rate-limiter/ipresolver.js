"use strict";

var proxyaddr = require('proxy-addr'),
    config = require('config'),
    log4js = require('log4js'),
    IPExtractor = require("./ipextractor").IPExtractor;

var SMARTROUTER_HEADER = 'X-PREZI-SMARTROUTER-FORWARDED-FOR'.toLowerCase();
var PROXY_HEADER = 'X-FORWARDED-FOR'.toLowerCase();
var FORWARDED_HEADERS = config.forwarded_headers;
var ipExtractorMap = {};

// If the request only passed through external proxies, and maybe ELB,
// the situation is a bit trickier. We have to go from the end of the
// list, and take the first IP that doesn't belong to a private network.
// More information can be found here:
// http://serverfault.com/questions/314574/nginx-real-ip-header-and-x-forwarded-for-seems-wrong#answer-414166

FORWARDED_HEADERS[PROXY_HEADER] = {
    "ignored_ip_ranges": ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.0.2.0/24', '192.168.0.0/16']
};

var logger = log4js.getLogger('ipresolver');

function resolve(req) {
    var remoteAddress = req.socket.remoteAddress;
    for (var key in FORWARDED_HEADERS) {
        if (FORWARDED_HEADERS.hasOwnProperty(key)) {
            var hdr = req.headers[key.toLowerCase()];
            if(hdr){
                return getExtractor(key).extractClientIP(hdr);
            }
        }
    }
    return remoteAddress;
}

function getExtractor(headerName){
    if(!ipExtractorMap.hasOwnProperty(headerName))
        ipExtractorMap[headerName]= new IPExtractor(FORWARDED_HEADERS[headerName]);
    return ipExtractorMap[headerName];
}

exports.resolve = resolve;
exports.SMARTROUTER_HEADER = SMARTROUTER_HEADER;
exports.PROXY_HEADER = PROXY_HEADER;