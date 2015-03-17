"use strict";

exports.Predicates = {
    eq: function (actual, expected) {
        return actual === expected;
    },

    ne: function (actual, expected) {
        return actual !== expected;
    },

    gt: function (actual, expected) {
        return actual > expected;
    },

    matches: function (actual, expected) {
        return new RegExp(expected).test(actual);
    }
};
