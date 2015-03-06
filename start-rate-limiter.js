var fs = require('fs'),
    rateLimiter = require("./index.js");

var config = JSON.parse(fs.readFileSync('/etc/prezi/ratelimiter/configuration.json', 'utf8'));

rateLimiter.createRateLimiter(config);
