/* global require */
var config = require('./lib/reverse-proxy-rate-limiter/settings').init(),
    rateLimiter = require('./lib/rate-limiter');

rateLimiter.createRateLimiter(config);
