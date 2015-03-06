"use strict";

var proxyaddr = require('proxy-addr');

function IPExtractor(headerConfig){
    this.config = headerConfig;
    this.internalfilter = proxyaddr.compile(this.config['ignored_ip_ranges']||[]);
}

IPExtractor.prototype = {

    extractClientIP : function(header){

        var ipextractor = this;
        var extractedIps = this.extractIps(header);
        var publicIps =  extractedIps.filter(function(ip){
           return ipextractor.isClientIp(ip);
       });
        if(publicIps.length){
            return publicIps.pop();
        }
        return extractedIps.pop();
    },
    extractIps: function(header){

        return header.split(",").map(Function.prototype.call, String.prototype.trim);
    },
    isClientIp: function(ip){

        return !this.internalfilter(ip);
    }
};

exports.IPExtractor = IPExtractor;