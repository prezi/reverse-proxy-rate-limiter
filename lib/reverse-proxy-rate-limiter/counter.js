"use strict";

exports.CounterStore = CounterStore;

const BUCKET_PREFIX = "bucket:";
const IP_PREFIX = "ip:";
const GLOBAL_KEY = "global";

function CounterStore() {
    // counters : {
    //    "global": 100,
    //    "bucket:default": 10,
    //	  "ip:default:192.168.1.1": 1,
    //    "ip:default:192.168.1.2": 1,
    //	  "bucket:reuse": 15
    // }

    this.counters = {};
}

CounterStore.prototype = {

    getGlobalRequestCount: function () {
        const key = GLOBAL_KEY;
        return this.counters[key] || 0;
    },

    getRequestCountForBucket: function (bucket) {
        const key = BUCKET_PREFIX + bucket.name;
        return this.counters[key] || 0;
    },

    getRequestCountForBucketAndIP: function (bucket, ip) {
        const key = IP_PREFIX + bucket.name + ":" + ip;
        return this.counters[key] || 0;
    },

    increment: function (bucket, ip) {
        this.changeValue(bucket, ip, 1);
    },

    decrement: function (bucket, ip) {
        this.changeValue(bucket, ip, -1);
    },

    changeValue: function (bucket, ip, incrementBy) {
        if (typeof bucket === "undefined") {
            return;
        }

        const keys = getKeys(bucket, ip);
        for (let i = 0; i < keys.length; i++) {
            this.changeValueForKey(keys[i], incrementBy);
        }
    },

    changeValueForKey: function (key, incrementBy) {
        let val;
        if (key in this.counters) {
            val = this.counters[key];
        } else {
            val = 0;
        }
        val += incrementBy;
        if (val > 0) {
            this.counters[key] = val;
        } else {
            delete this.counters[key];
        }
    }
};

function getKeys(bucket, ip) {
    return [GLOBAL_KEY, BUCKET_PREFIX + bucket.name, IP_PREFIX + bucket.name + ":" + ip];
}
