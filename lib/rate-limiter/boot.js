module.exports = function () {
    "use strict";
    var fs = require('fs'),
        rateLimiter = require('../rate-limiter'),
        _ = require('lodash');

    var opts = require('nomnom')
        .option('config', {
            abbr: 'c',
            default: null,
            help: 'Configuration file to use'
        })
        .option('version', {
            abbr: 'v',
            flag: true,
            help: 'Print version and exit',
            callback: function () {
                return "reverse-proxy-rate-limiter version " + require('../../package.json').version;
            }
        })
        .parse();

    var config = require('./config').load(opts.config);
    return rateLimiter.createRateLimiter(config);
};
