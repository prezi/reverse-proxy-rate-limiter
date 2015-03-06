/* global require */
(function () {
    "use strict";
    var fs = require('fs'),
        rateLimiter = require('./index'),
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
                return "version " + require('./package.json').version;
            }
        })
        .parse();

    var config = require('./lib/rate-limiter/config').load(opts.config);
    var rl = rateLimiter.createRateLimiter(config);
}());
