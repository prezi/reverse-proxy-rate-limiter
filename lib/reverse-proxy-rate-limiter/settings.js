/* global require, process */
(function () {
    const os = require('os'),
        fs = require('fs'),
        _ = require('lodash'),
        url = require('url');

    exports.init = init;
    exports.load = load;
    exports.updateDerivedSettings = updateDerivedSettings;

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

    function maybeLoadConfigFile(path) {
        let content;
        try {
            content = fs.readFileSync(path);
        } catch (e) {
            console.error("Tried to load settings file " + path + " but it doesn't exist.");
            return {};
        }
        return JSON.parse(content);
    }

    function updateDerivedSettings(settings) {
        settings.forwardUrl = "http://" + settings.forwardHost + ":" + settings.forwardPort;

        let configUrl = url.parse(settings.configEndpoint);
        if (configUrl.protocol === null) {
            configUrl = url.parse(settings.forwardUrl);
            configUrl.pathname = settings.configEndpoint;
            settings.fullConfigEndpoint = url.format(configUrl);
        } else {
            settings.fullConfigEndpoint = settings.configEndpoint;
        }
        return settings;
    }

    function load(extraConfigFile, hook) {
        const builder = new ConfigBuilder();
        builder.addObj(defaultConfig);
        builder.addDir("config");
        if (hook) { hook(builder); }
        if (extraConfigFile) {
            builder.addFile(extraConfigFile);
        }

        const settings = builder.build();
        return updateDerivedSettings(settings);
    }

    function init() {
        const opts = require('nomnom')
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
    }

    const defaultConfig = {
        "log4js": {
            "appenders": {
                "console" : {
                    "type": "console",
                    "layout": {
                        "type": "pattern",
                        "pattern": "%d{ISO8601} %h %c %p %m%n"
                    }
                }
            },
            "categories": {
                "default": {
                    "appenders": ["console"],
                    "level": "info"
                }
            }
        },
        "serviceName": "defaultService",
        "listenPort": 8001,
        "forwardPort": 8000,
        "forwardHost": "localhost",
        "configRefreshInterval": 0,
        "configEndpoint": "/rate-limiter/",
        "bucketHeaderName": "X-RateLimiter-Bucket"
    };
}());
