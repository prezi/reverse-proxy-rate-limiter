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
    };

    ConfigBuilder.prototype.addFile = function (path) {
        this.objects.push(maybeLoadConfigFile(path));
    };

    ConfigBuilder.prototype.addDir = function (path) {
        this.objects.push(maybeLoadConfigFile(path + '/default.json'));
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
        "configEndpoint": "/rate-limiter/",
        "bucketHeaderName": "X-RateLimiter-Bucket"
    };

    function constructFullSettings(settings) {
        settings.forwardUrl = "http://" + settings.forwardHost + ":" + settings.forwardPort;

        var configUrl = url.parse(settings.configEndpoint);
        if (configUrl.protocol === null) {
            configUrl = url.parse(settings.forwardUrl);
            configUrl.pathname = settings.configEndpoint;
            settings.fullConfigEndpoint = url.format(configUrl);
        }
        return settings;
    }

    exports.load = function (extraConfigFile, hook) {
        var builder = new ConfigBuilder();
        builder.addObj(defaultConfig);
        builder.addDir("config");
        if (hook) { hook(builder); }
        if (extraConfigFile) {
            builder.addFile(extraConfigFile);
        }

        var settings = builder.build();
        return constructFullSettings(settings);
    };

    exports.init = function () {
        var opts = require('nomnom')
            .option('config', {
                abbr: 'c',
                default: null,
                help: 'Configuration file to use'
            })
            .option('version', {
                abbr: 'v',
                flag: true,
                help: 'Print version and exit',
                callback: function () {
                    return "reverse-proxy-rate-limiter version " + require('../../package.json').version;
                }
            })
            .parse();

        return this.load(opts.config);
    };
}());
