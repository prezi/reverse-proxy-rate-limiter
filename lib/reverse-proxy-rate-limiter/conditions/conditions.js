"use strict";

var _ = require("lodash")._,
    Predicates = require("./predicates").Predicates,
    SubjectTypes = require("./subject-types").SubjectTypes;

exports.Condition = Condition;

// dtorok we could think about the functional approach too


// ["header", "X-Prezi-Client", "equals","reuse-e5759ce4bb1c298b063f2d8aa1a334"]
// ["client_ip", "equals", "12.23.45.56"]
function Condition(conditionArray) {
    if (!Array.isArray(conditionArray)) {
        throw new Error("conditionArray parameter must be an array");
    }
    this.subject = findSubjectType(conditionArray[0]);

    // dtorok even a predicate could have more parameters ([between, 10, 20], [in, "reuse", "reuse-image", "reuse-frame"]
    // dtorok or would it be an array? Than the subject's parameters could be too
    // dtorok hmm, I have even wilder ideas :)
    var expectedArraySize = this.subject.parameterCount + 3; // subject + subject parameters + predicate + value
    if (conditionArray.length !== expectedArraySize) {
        throw new Error("Expected conditionArray size is " + expectedArraySize + " but was " + conditionArray.length);
    }

    conditionArray = _.rest(conditionArray);
    if (this.subject.parameterCount === 0) {
        this.parameters = [];
    } else {
        this.parameters = _.slice(conditionArray, 0, this.subject.parameterCount);
        conditionArray = _.slice(conditionArray, this.subject.parameterCount);
    }

    this.predicateName = conditionArray[0];
    this.predicate = findPredicate(this.predicateName);
    if (!_.includes(this.subject.predicates, this.predicate)) {
        throw new Error("Predicate " + this.predicateName + " not usable for subject " + this.subject.name);
    }

    this.expectedValue = conditionArray[1];
}

Condition.prototype.toString = function () {
    if (typeof this.stringValue === 'undefined') {
        var s = "Condition[" + this.subject.name;
        if (this.parameters.length > 0) {
            s += "[" + this.parameters + "]";
        }
        s += " " + this.predicateName + " '" + this.expectedValue + "']";
        this.stringValue = s;
    }
    return this.stringValue;
};

Condition.prototype.evaluate = function (request) {
    var actualValue = this.subject.extractValue(request, this.parameters);
    if (actualValue === undefined) {
        return false;
    }
    return this.predicate(actualValue, this.expectedValue);
};

function findSubjectType(subject) {
    var ret = SubjectTypes[subject];
    if (ret === undefined) {
        throw new Error("Invalid subject: " + subject);
    }
    return ret;
}

function findPredicate(predicate) {
    var ret = Predicates[predicate];
    if (ret === undefined) {
        throw new Error("Invalid predicate: " + predicate);
    }
    return ret;
}
