/* global require, process */
(function () {
    var os = require('os'),
        fs = require('fs'),
        _ = require('lodash');
    
    function maybeLoadConfigFile(path) {
        var content;
        try {
            content = fs.readFileSync(path);
        } catch (e) {
            console.error("Tried to load config file " + path + " but it doesn't exist.");
            return {};
        }
        return JSON.parse(content);
    }

    function ConfigBuilder() {
        this.objects = [];
    }
    
    ConfigBuilder.prototype.addObj = function (obj) {
        this.objects.push(obj);
    }
    
    ConfigBuilder.prototype.addFile = function (path) {
        this.objects.push(maybeLoadConfigFile(path));
    };
    
    ConfigBuilder.prototype.addDir = function (path) {
        this.objects.push(maybeLoadConfigFile(path + '/default.json'))
        if (process.env.NODE_ENV) {
            this.objects.push(maybeLoadConfigFile(path + '/' + process.env.NODE_ENV + '.json'));
        }
    };
    
    ConfigBuilder.prototype.build = function () {
        return _.merge.apply(null, [{}].concat(this.objects));
    };
    
    var defaultConfig = {
        "log4js": {
            "appenders": [
                {
                    "type": "console",
                    "layout": {
                        "type": "pattern",
                        "pattern": "%d{ISO8601} %h %c %p %m%n"
                    }
                }
            ]
        },
        "serviceName": "defaultService",
        "listenPort": 8001,
        "forwardPort": 8000,
        "forwardHost": "localhost",
        "configRefreshInterval": 60000,
        "configEndpoint": "/rate-limiter/"
    };
    
    exports.load = function (extraConfigFile, hook) {
        var builder = new ConfigBuilder();
        builder.addObj(defaultConfig);
        builder.addDir("config");
        if (hook) { hook(builder); }
        if (extraConfigFile) {
            builder.addFile(extraConfigFile);
        }
        return builder.build();
    };
}());
