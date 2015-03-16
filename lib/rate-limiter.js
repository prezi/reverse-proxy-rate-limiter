var rateLimiter = require('./rate-limiter/');

module.exports.createRateLimiter = function createRateLimiter(settings) {
    return new rateLimiter.RateLimiter(settings);
};
