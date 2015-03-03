"use strict";

var Condition = require("./conditions/conditions").Condition;

function Bucket(bucketConfig) {
    this.name = bucketConfig.name;

    this.capacityUnit = 0;
    this.maxRequestsPerIp = 0;

    if ("limits" in bucketConfig) {
        if ("capacity_unit" in bucketConfig.limits) {
            this.capacityUnit = bucketConfig.limits.capacity_unit;
        }
        if ("max_requests_per_ip" in bucketConfig.limits) {
            this.maxRequestsPerIp = bucketConfig.limits.max_requests_per_ip;
        }
    }

    if (Array.isArray(bucketConfig.conditions)) {
        this.conditions = bucketConfig.conditions.map(function (c) {
            return new Condition(c);
        });
    } else {
        this.conditions = [];
    }
}
exports.Bucket = Bucket;

Bucket.prototype = {
    capacityUnit: 0,
    maxRequests: 0,
    maxRequestsPerIp: 0,

    isDefault: function () {
        return this.conditions.length === 0;
    },

    matches: function (request) {
        for (var i = 0; i < this.conditions.length; i++) {
            if (!this.conditions[i].evaluate(request)) {
                return false;
            }
        }

        return true;
    },

    getMaxRequests: function () {
        return this.maxRequests;
    },

    getMaxRequestsPerIp: function () {
        return this.maxRequestsPerIp;
    }
};