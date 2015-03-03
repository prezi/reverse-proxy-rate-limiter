"use strict";

exports.CounterStore = CounterStore;

var BUCKET_PREFIX = "bucket:";
var IP_PREFIX = "ip:";
var GLOBAL_KEY = "global";

function CounterStore() {
    this.counters = {};
}

CounterStore.prototype = {

    //counters : {
    //	global : 100,
    //	"bucket:default" : 10,
    //	"ip:default:192.168.1.1" : 1,
    //	"ip:default:192.168.1.2" : 1,
    //	"bucket:reuse" : 15
    //},

    get: function (bucket, ip) { // [ 100, 10, 1 ]
        return getKeys(bucket, ip).map(function (key) {
            if (key in this.counters) {
                return this.counters[key];
            }
            else {
                return 0;
            }
        }, this);
    },

    getGlobal: function () {
        if (GLOBAL_KEY in this.counters) {
            return this.counters[GLOBAL_KEY];
        } else {
            return 0;
        }
    },

    getBucketCount: function (bucket) {
        var key = BUCKET_PREFIX + bucket.name;
        if (key in this.counters) {
            return this.counters[key];
        } else {
            return 0;
        }
    },

    increment: function (bucket, ip) {
        changeValue(this.counters, bucket, ip, 1);
    },

    decrement: function (bucket, ip) {
        changeValue(this.counters, bucket, ip, -1);
    }
};

function changeValue(counters, bucket, ip, incrementBy) {
    if (typeof bucket === "undefined") {
        return;
    }

    var keys = getKeys(bucket, ip);
    for (var i = 0; i < keys.length; i++) {
        changeValueForKey(counters, keys[i], incrementBy);
    }
}

function changeValueForKey(counters, key, incrementBy) {
    var val;
    if (key in counters) {
        val = counters[key];
    } else {
        val = 0;
    }
    val += incrementBy;
    if (val > 0) {
        counters[key] = val;
    } else {
        delete counters[key];
    }
}

function getKeys(bucket, ip) {
    var bucketName = bucket.name;
    return [GLOBAL_KEY, BUCKET_PREFIX + bucketName, IP_PREFIX + bucketName + ":" + ip];
}
