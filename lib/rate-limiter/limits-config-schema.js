"use strict";

var _ = require("underscore")._,
    Validator = require('jsonschema').Validator,
    SchemaError = require('jsonschema').SchemaError,
    Condition = require("./conditions/conditions").Condition;

exports.validate = validate;

function validate(config) {
    var validator = new Validator();
    validator.attributes.isCondition = validateCondition;
    validator.addSchema(rateLimiterBucket);
    validator.addSchema(rateLimiterBucketLimit);
    validator.addSchema(rateLimiterConditions);
    return validator.validate(config, rateLimiterConfig);
}

var rateLimiterConfig = {
    "id": "/RateLimiterConfig",
    "type": "object",
    "properties": {
        "version": {"type": "integer", "required": true},
        "max_requests": {"type": "integer", "required": true, "minimum": 0},
        "buffer_ratio": {"type": "double", "required": true, "minimum": 0.0},
        "healthcheck_url": {"type": "string"},
        "buckets": {
            "type": "array",
            "items": {"$ref": "/RateLimiterBuckets"},
            "required": true
        }
    }
};

var rateLimiterBucket = {
    "id": "/RateLimiterBuckets",
    "type": "object",
    "properties": {
        "name": {"type": "string", "required": true},
        "conditions": {
            "type": "array",
            "items": {$ref: "/RateLimiterConditions"}
        },
        "limits": {"$ref": "/RateLimiterBucketLimit"}
    }
};

var rateLimiterConditions = {
    "id": "/RateLimiterConditions",
    "type": "array",
    "items": {"type": "string"},
    "isCondition": true
};

var rateLimiterBucketLimit = {
    "id": "/RateLimiterBucketLimit",
    "type": "object",
    "properties": {
        "capacity_unit": {
            "type": "integer",
            "required": true,
            "minimum": 0
        },
        "max_requests_per_ip": {"type": "integer", "minimum": 0}
    }
};

function validateCondition(instance, schema, options, ctx) {
    if (typeof schema.isCondition !== 'boolean') {
        throw new SchemaError('"isCondition" expects a boolean', schema);
    }

    if (schema.isCondition) {
        try {
            new Condition(instance);
        }
        catch (e) {
            return e.toString();
        }
    }
}
