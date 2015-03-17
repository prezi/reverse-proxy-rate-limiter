"use strict";

var Validator = require('jsonschema').Validator,
    SchemaError = require('jsonschema').SchemaError,
    Condition = require("./conditions/conditions").Condition;

exports.validate = validate;

function validate(limitsConfig) {
    var validator = new Validator();
    validator.attributes.isCondition = validateCondition;
    validator.addSchema(bucket);
    validator.addSchema(bucketLimit);
    validator.addSchema(condition);
    return validator.validate(limitsConfig, limitsConfigSchema);
}

var limitsConfigSchema = {
    "id": "/LimitsConfig",
    "type": "object",
    "properties": {
        "version": {"type": "integer", "required": true},
        "max_requests": {"type": "integer", "required": true, "minimum": 0},
        "buffer_ratio": {"type": "double", "required": true, "minimum": 0.0},
        "healthcheck_url": {"type": "string"},
        "buckets": {
            "type": "array",
            "items": {"$ref": "/Buckets"},
            "required": true
        }
    }
};

var bucket = {
    "id": "/Buckets",
    "type": "object",
    "properties": {
        "name": {"type": "string", "required": true},
        "conditions": {
            "type": "array",
            "items": {$ref: "/Condition"}
        },
        "limits": {"$ref": "/BucketLimit"}
    }
};

var condition = {
    "id": "/Condition",
    "type": "array",
    "items": {"type": "string"},
    "isCondition": true
};

var bucketLimit = {
    "id": "/BucketLimit",
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

function validateCondition(instance, schema) {
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
