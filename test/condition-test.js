"use strict";

const expect = require('expect');
const Condition = require("../lib/reverse-proxy-rate-limiter/conditions/conditions").Condition;
const Predicates = require("../lib/reverse-proxy-rate-limiter/conditions/predicates").Predicates;
const SubjectTypes = require("../lib/reverse-proxy-rate-limiter/conditions/subject-types").SubjectTypes;

describe("Condition parameter validation tests", function () {
    it("should throw an exception because parameter is not an array", function () {
        expect(function () {
            new Condition('not an array');
        }).toThrow(/conditionArray parameter must be an array/);
    });

    it("should throw 'invalid subject' exception", function () {
        expect(function () {
            new Condition(["invalid"]);
        }).toThrow(/Invalid subject: invalid/);
    });

    it("should have a valid subject", function () {
        const condition = new Condition(["header", "test", "eq", "test"]);
        const subject = condition.subject;
        expect(subject.name).toBe("header");
        expect(subject.parameterCount).toBe(1);
        expect(subject.predicates).toBe(SubjectTypes.header.predicates);
    });

    it("should throw an exception because of wrong parameter array size", function () {
        expect(function () {
            new Condition(["header", "eq", "test"]);
        }).toThrow(/Expected conditionArray size is 4 but was 3/);
    });

    it("should throw an exception because of invalid predicate", function () {
        expect(function () {
            new Condition(["header", "test", "invalid predicate", "test"]);
        }).toThrow(/Invalid predicate: invalid predicate/);
    });

    it("should throw an exception because of not usable predicate", function () {
        expect(function () {
            new Condition(["header", "test", "gt", "test"]);
        }).toThrow(/Predicate gt not usable for subject header/);
    });

    it("should be the following condition: header['testheader'] == 'test'", function () {
        const condition = new Condition(["header", "testheader", "eq", "testvalue"]);

        expect(condition.subject.name).toBe("header");
        expect(condition.predicate).toBe(Predicates.eq);
        expect(condition.parameters.length).toBe(1);
        expect(condition.parameters[0]).toBe("testheader");
        expect(condition.expectedValue).toBe("testvalue");
    });
});

describe("Condition evaluation tests", function () {
    it("header[test] == FIXME shoud be true", function () {
        const condition = new Condition(["header", "test", "eq", "FIXME"]);
        expect(condition.evaluate({headers: {test: 'FIXME'}})).toBe(true);
    });

    it("header[test] == 'some other value' should be false", function () {
        const condition = new Condition(["header", "test", "eq", "some other value"]);
        expect(condition.evaluate()).toBe(false);
    });

    it("client_ip == 1.2.3.4 should be true", function () {
        const condition = new Condition(["client_ip", "eq", "1.2.3.4"]);
        expect(condition.evaluate()).toBe(true);
    });

    it("path == '/test' should be true", function () {
        const condition = new Condition(["path", "eq", "/test"]);
        expect(condition.evaluate({url: "/test?a=b"})).toBe(true);
    });

    it("true eq true should be true", function () {
        const condition = new Condition(["true", "eq", "true"]);
        expect(condition.evaluate()).toBe(true);
    });

    it("simple regexp should match", function () {
        const condition = new Condition(["header", "test", "matches", "^FIXM.$"]);
        expect(condition.evaluate({headers: {test: 'FIXME'}})).toBe(true);
    });

    it("regexp should not match 'undefined' if the header specified in condition is not present", function () {
        const condition = new Condition(["header", "test", "matches", ".*"]);
        expect(condition.evaluate({headers: {randomHeader: 'testValue'}})).toBe(false);
    });

    it("simple regexp should not match", function () {
        const condition = new Condition(["header", "test", "matches", "^FIXM.{2}$"]);
        expect(condition.evaluate()).toBe(false);
    });
});