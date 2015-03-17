"use strict";

var expect = require('expect.js'),
    Condition = require("../lib/reverse-proxy-rate-limiter/conditions/conditions").Condition,
    Predicates = require("../lib/reverse-proxy-rate-limiter/conditions/predicates").Predicates,
    SubjectTypes = require("../lib/reverse-proxy-rate-limiter/conditions/subject-types").SubjectTypes;

describe("Condition parameter validation tests", function () {
    it("should throw an exception because parameter is not an array", function () {
        expect(function () {
            new Condition('not an array');
        }).to.throwException(/conditionArray parameter must be an array/);
    });

    it("should throw 'invalid subject' exception", function () {
        expect(function () {
            new Condition(["invalid"]);
        }).to.throwException(/Invalid subject: invalid/);
    });

    it("should have a valid subject", function () {
        var condition = new Condition(["header", "test", "eq", "test"]);
        var subject = condition.subject;
        expect(subject.name).to.be("header");
        expect(subject.parameterCount).to.be(1);
        expect(subject.predicates).to.be(SubjectTypes.header.predicates);
    });

    it("should throw an exception because of wrong parameter array size", function () {
        expect(function () {
            new Condition(["header", "eq", "test"]);
        }).to.throwException(/Expected conditionArray size is 4 but was 3/);
    });

    it("should throw an exception because of invalid predicate", function () {
        expect(function () {
            new Condition(["header", "test", "invalid predicate", "test"]);
        }).to.throwException(/Invalid predicate: invalid predicate/);
    });

    it("should throw an exception because of not usable predicate", function () {
        expect(function () {
            new Condition(["header", "test", "gt", "test"]);
        }).to.throwException(/Predicate gt not usable for subject header/);
    });

    it("should be the following condition: header['testheader'] == 'test'", function () {
        var condition = new Condition(["header", "testheader", "eq", "testvalue"]);

        expect(condition.subject.name).to.be("header");
        expect(condition.predicate).to.be(Predicates.eq);
        expect(condition.parameters.length).to.be(1);
        expect(condition.parameters[0]).to.be("testheader");
        expect(condition.expectedValue).to.be("testvalue");
    });
});

describe("Condition evaluation tests", function () {
    it("header[test] == FIXME shoud be true", function () {
        var condition = new Condition(["header", "test", "eq", "FIXME"]);
        expect(condition.evaluate({headers: {test: 'FIXME'}})).to.be(true);
    });

    it("header[test] == 'some other value' should be false", function () {
        var condition = new Condition(["header", "test", "eq", "some other value"]);
        expect(condition.evaluate()).to.be(false);
    });

    it("client_ip == 1.2.3.4 should be true", function () {
        var condition = new Condition(["client_ip", "eq", "1.2.3.4"]);
        expect(condition.evaluate()).to.be(true);
    });

    it("path == '/test' should be true", function () {
        var condition = new Condition(["path", "eq", "/test"]);
        expect(condition.evaluate({url: "/test?a=b"})).to.be(true);
    });

    it("true eq true should be true", function () {
        var condition = new Condition(["true", "eq", "true"]);
        expect(condition.evaluate()).to.be(true);
    });

    it("simple regexp should match", function () {
        var condition = new Condition(["header", "test", "matches", "^FIXM.$"]);
        expect(condition.evaluate({headers: {test: 'FIXME'}})).to.be(true);
    });

    it("regexp should not match 'undefined' if the header specified in condition is not present", function () {
        var condition = new Condition(["header", "test", "matches", ".*"]);
        expect(condition.evaluate({headers: {randomHeader: 'testValue'}})).to.be(false);
    });

    it("simple regexp should not match", function () {
        var condition = new Condition(["header", "test", "matches", "^FIXM.{2}$"]);
        expect(condition.evaluate()).to.be(false);
    });
});