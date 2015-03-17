"use strict";

var http = require("http"),
    rateLimiter = require("./../../index.js"),
    request = require("request"),
    url = require('url');

var HTTP_OK = 200,
    HTTP_NOT_FOUND = 404,
    HTTP_TOO_MANY_REQUESTS = 429,
    HTTP_INTERNAL_SERVER_ERROR = 500,
    REQUEST_ID_HEADER = "X-RateLimiter-IntegrationTest-RequestId";

var port = 8080;

function IntegrationTester() {
	this.requestBuffer = [];
	this.sentMessages = {};
	this.requestId = 0;
	this.listenPort = port;
	this.forwardPort = port + 1;
	port += 2;

    var _this = this;
    this.testBackendServer = http.createServer(function (req, res) {
        var sentMessage = _this.sentMessages[getRequestId(req)];

        _this.requestBuffer.push({
            req: req,
            res: res,
            setOnServedCallback: sentMessage.setOnServedCallback,
            setOnFailedCallback: sentMessage.setOnFailedCallback
        });
        sentMessage.onForwardedCallback();

    }).listen(this.forwardPort);

    var settingsModule = require('../../lib/reverse-proxy-rate-limiter/settings');
    var settings = settingsModule.load();

    settings.listenPort = this.listenPort;
    settings.forwardPort = this.forwardPort;
    settings = settingsModule.updateDerivedSettings(settings);  // update the derived values
    settings.fullConfigEndpoint = "file:./test/fixtures/example_configuration.json";

    this.rateLimiter = rateLimiter.createRateLimiter(settings);
}
exports.IntegrationTester = IntegrationTester;

IntegrationTester.prototype = {

    sendRequest: function (count, options) {
        if (typeof count === "undefined" || count === 0) {
            count = 1;
        }
        var lastMessage;
        while (count-- > 0) {
            lastMessage = new SentMessage(this, ++this.requestId, options);
        }
        return lastMessage;
    },

    serveRequests: function (howMany) {
        if (this.requestBuffer.length === 0) {
            throw "RequestBuffer empty, cannot serve any requests";
        }

        if (typeof howMany === "undefined" || howMany === 0) {
            howMany = this.requestBuffer.length;
        }

        var fromFirst = false;
        if (howMany < 0) {
            fromFirst = true;
            howMany *= -1;
        }

        if (howMany > this.requestBuffer.length) {
            throw "cannot serve more requests than the size of the request buffer (" + howMany + " > " + this.requestBuffer.length + ")";
        }

        var lastServedRequest;
        while (howMany-- > 0) {
            lastServedRequest = fromFirst ? this.requestBuffer.shift() : this.requestBuffer.pop();
            flushSingleRequest(HTTP_OK, lastServedRequest.req, lastServedRequest.res);
        }

        return new ServedRequestWrapper(lastServedRequest);
    },

    serveRequestWithStatusCode: function (statusCode) {
        if (this.requestBuffer.length === 0) {
            throw "RequestBuffer empty, cannot serve any requests";
        }

        var servedRequest = this.requestBuffer.pop();
        flushSingleRequest(statusCode, servedRequest.req, servedRequest.res);

        return new ServedRequestWrapper(servedRequest);
    },

    failRequestWithInvalidStatusCode: function () {
        var lastServedRequest = this.requestBuffer.pop();
        var res = lastServedRequest.res;
        res.writeHead("invalid_status_code", {'Content-Type': 'text/plain'});
        res.end();
        return new FailedRequestWrapper(lastServedRequest);
    },

    failRequestWithInvalidContentLength: function () {
        var lastServedRequest = this.requestBuffer.pop();
        var res = lastServedRequest.res;
        res.writeHead(200, {
            'Content-Length': 0,
            'Content-Type': 'text/plain'
        });
        res.write('obviously-nonzero-body');
        res.end();
        return new FailedRequestWrapper(lastServedRequest);
    },

    reset: function (done) {
        this.requestId = 0;
        if (typeof done !== "function") {
            done = function () { /* noop */
            };
        }
        if (this.requestBuffer.length > 0) {
            this.serveRequests().onServed(done);
        } else {
            done();
        }
    },

    closeTestBackendServer: function (done) {
        this.testBackendServer.close(done);
    },

    pendingRequestsCount: function () {
        return this.requestBuffer.length;
    }
};

function flushSingleRequest(statusCode, request, response) {
    response.writeHead(statusCode, {'Content-Type': 'text/plain'});
    response.write("Hello ratelimiter!");
    response.end();
}

function getRequestId(request) {
    return request.headers[REQUEST_ID_HEADER.toLowerCase()];
}

function ServedRequestWrapper(servedRequest) {
    this.onServed = function (callback) {
        servedRequest.setOnServedCallback(callback);
    };
}

function FailedRequestWrapper(failedRequest) {
    this.onFailed = function (callback) {
        failedRequest.setOnFailedCallback(callback);
    };
}

function SentMessage(it, requestId, options) {
    var onForwardedCallback, onRejectedCallback, onFailedCallback;
    var onServedCallback = defaultOnServedCallback;

    var headers = {};
    headers[REQUEST_ID_HEADER] = requestId;
    url = "http://localhost:" + it.listenPort + "/";

    if (options) {
        if (options.bucket) {
            headers.Bucket = options.bucket;
        }

        if ("expectedStatusCode" in options) {
            var expectedStatusCode = options.expectedStatusCode;
        }

        if (options.path) {
            url = url + options.path;
        }
    }

    request({
        url: url,
        headers: headers
    }, function (error, response) {
        if (response && response.statusCode === HTTP_OK) {
            onServedCallback();
        } else if (expectedStatusCode && response.statusCode === expectedStatusCode) {
            onServedCallback();
        } else if (response && response.statusCode === HTTP_NOT_FOUND) {
            onRejectedCallback(response);
        } else if (response && response.statusCode === HTTP_TOO_MANY_REQUESTS) {
            onRejectedCallback(response);
        } else if (error || (response && response.statusCode === HTTP_INTERNAL_SERVER_ERROR)) {
            onFailedCallback();
        }
    });

    this.onForwarded = function (callback) {
        it.sentMessages[requestId] = {
            onForwardedCallback: callback,
            setOnFailedCallback: function (c) {
                onFailedCallback = c;
            },
            setOnServedCallback: function (c) {
                onServedCallback = c;
            }
        };
    };

    this.onRejected = function (callback) {
        onRejectedCallback = callback;
    };

    this.onFailed = function (callback) {
        onFailedCallback = callback;
    };

    this.onForwarded(defaultOnForwarded);
    this.onRejected(defaultOnRejected);
    this.onFailed(defaultOnFailedCallback);

    function defaultOnRejected() {
        if (onForwardedCallback !== defaultOnForwarded) {
            throw new Error("Unexpected: request rejected by the ratelimiter");
        }
    }

    function defaultOnForwarded() {
        if (onRejectedCallback !== defaultOnRejected) {
            throw new Error("Unexpected: request forwarded by the ratelimiter");
        }
    }

    function defaultOnServedCallback() {
    }

    function defaultOnFailedCallback() {
        throw new Error("Unexpected: request failed on the service side");
    }
}
