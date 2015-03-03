var rateLimiter = require('./rate-limiter/');

module.exports.createRateLimiter = function createRateLimiter(options) {
    return new rateLimiter.RateLimiter(options);
};
