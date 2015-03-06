# reverse-proxy-rate-limiter

[![Build Status](https://magnum.travis-ci.com/prezi/reverse-proxy-rate-limiter.svg?token=C6T3YoEYndcatuyXax7y&branch=master)](https://magnum.travis-ci.com/prezi/reverse-proxy-rate-limiter)

Reverse proxy written in Node.js that limits incoming requests based on their origin and the number of active concurrent requests.

## JS-Hint
* [How to install] (https://packagecontrol.io/packages/JSHint)
* To add options to the current configurations open 'package.json' and add your options under 'jshintConfig'. 

## Configuration

There are 5 levels of configuration sources (all but the first one optional). From lowest to highest priority:

 * Default configuration values hard-coded in `lib/rate-limiter/config.js`
 * `$PWD/config/default.json` if it exists
 * `$PWD/config/$NODE_ENV.json` if it exists
 * The second parameter to `lib/rate-limiter/config.js#load` is an optional function which gets called with
   a `ConfigBuilder` instance as its only argument. It can make `add{Obj,File,Dir}` calls on it to add
   any custom config sources.
 * The first parameter to `lib/rate-limiter/config.js#load` is an optional string which is the path to
   a configuration file. If run through `lib/rate-limiter/boot.js` (used by `start-rate-limiter.js`), the
   command-line argument `--config` (or just `-c`) is passed in here.
