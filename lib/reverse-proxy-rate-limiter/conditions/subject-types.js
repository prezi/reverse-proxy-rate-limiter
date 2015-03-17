"use strict";

var Predicates = require("./predicates").Predicates,
    url = require("url");

var SubjectTypes = {
    header: {
        parameterCount: 1,
        predicates: [Predicates.eq, Predicates.ne, Predicates.matches],
        extractValue: extractHeader
    },
    client_ip: {
        parameterCount: 0,
        predicates: [Predicates.eq, Predicates.ne],
        extractValue: extractClientIp
    },
    path: {
        parameterCount: 0,
        predicates: [Predicates.eq, Predicates.ne, Predicates.matches],
        extractValue: extractPath
    },
    "true": { // to have a let-everything-through option with ['true', 'eq', 'true']
        parameterCount: 0,
        predicates: [Predicates.eq],
        extractValue: function () {
            return "true";
        }
    }
};

function extractHeader(request, parameters) {
    if (typeof request === "undefined" || typeof request.headers === "undefined") {
        return undefined;
    }
    return request.headers[parameters[0].toLowerCase()];
}

function extractClientIp() {
    return "1.2.3.4";
}

function extractPath(request) {
    var urlObject = url.parse(request.url);
    return urlObject.pathname;
}

for (var st in SubjectTypes) {
    SubjectTypes[st].name = st;
}
exports.SubjectTypes = SubjectTypes;


