/* global require */
var config = require('./lib/rate-limiter/config').init(),
    rateLimiter = require('./lib/rate-limiter');

rateLimiter.createRateLimiter(config);
