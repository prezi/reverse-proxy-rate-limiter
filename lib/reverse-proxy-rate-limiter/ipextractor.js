"use strict";

const proxyaddr = require('proxy-addr');

function IPExtractor(forwardHeader){
    this.internalFilter = proxyaddr.compile(forwardHeader['ignored_ip_ranges'] || []);
}

IPExtractor.prototype = {

    extractClientIP : function(header){

        const ipExtractor = this;
        const extractedIPs = this.extractIPs(header);
        const filteredIPs = extractedIPs.filter(function (ip) {
            return !ipExtractor.isIgnoredIP(ip);
        });

        if(filteredIPs.length){
            return filteredIPs.pop();
        }

        return extractedIPs.pop();
    },

    extractIPs: function(header){
        return header.split(",").map(Function.prototype.call, String.prototype.trim);
    },

    isIgnoredIP: function(ip){
        return this.internalFilter(ip);
    }
};

exports.IPExtractor = IPExtractor;
