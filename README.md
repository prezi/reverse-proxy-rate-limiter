# reverse-proxy-rate-limiter

[![Build Status](https://magnum.travis-ci.com/prezi/reverse-proxy-rate-limiter.svg?token=C6T3YoEYndcatuyXax7y&branch=master)](https://magnum.travis-ci.com/prezi/reverse-proxy-rate-limiter)

Reverse proxy written in Node.js that limits incoming requests based on their origin and the number of active concurrent requests.

## Installation
Rate-limiter can be installed in a few seconds, let's check out our screencast about it:

[![Installation screencast](https://raw.githubusercontent.com/prezi/reverse-proxy-rate-limiter/master/examples/screencast.png?token=ACH8iktHghfGrEfB_szOqGAPRjoVtSdBks5VC1LzwA%3D%3D)](https://asciinema.org/a/17616)

At first clone the rate-limiter github repository:
```shell
$ git clone git@github.com:prezi/reverse-proxy-rate-limiter.git
```

Then install the needed npm packages:
```shell
$ cd reverse-proxy-rate-limiter
$ npm install
```

You can start the rate-limiter with a sample settings file that can be found in the `examples` directory:
```shell
$ cat examples/settings.sample.json
{
    "serviceName": "authservice",
    "listenPort": 7000,
    "forwardPort": 7001,
    "forwardHost": "localhost",
    "configRefreshInterval": 60000,
    "configEndpoint": "file:./examples/limits-config.sample.json"
}
```

The interesting information is that the rate-limiter will be listening on port ``7000``, and will forward the http requests to ``localhost:7001``.

The configuration of the limitation will be read from a file in this case: ``examples/limits-config.sample.json``:
```shell
$ cat examples/limits-config.sample.json
{
    "version": 1,
    "max_requests": 2,
    "buffer_ratio": 0,
    "buckets": [
        {
            "name": "default"
        }
    ]
}
```

There is no special rule added, but the rate-limiter won't allow more than 2 requests to be served simultaneously.

Let's start the rate-limiter:
```shell
$ node start-rate-limiter.js -c examples/settings.sample.json
```

We can start a sample service in the background, listening on the port 7001, which will reply with a JSON that contains all the headers it got from the rate-limiter:
```shell
$ node examples/mock-server.js
```

We can send a http request to the rate-limiter now:
```shell
$ curl localhost:7000/test/
Hello ratelimiter!
/test/
{
  "accept": "*/*",
  "host": "localhost:7000",
  "user-agent": "curl/7.30.0",
  "connection": "close",
  "x-ratelimiter-bucket": "default"
}
```

The ``x-ratelimiter-bucket`` is a special header the rate-limiter sets to the forwarded request to give some information to the service in the background about the traffic.

Let's try to overload the rate-limiter to start rejecting requests. It's not hard, if you send the request to the ``/sleep5secs/`` url, the mock-server won't answer for 5 seconds. With this we can easily send more than 2 requests:
```shell
$ curl localhost:7000/sleep5secs/ &
[1] 25948

$ curl localhost:7000/sleep5secs/ &
[2] 25954

$ curl localhost:7000/sleep5secs/ &
[3] 25960
Request has been rejected by the rate limiter[3]  + 25960 done

$ curl localhost:7000/sleep5secs/ &
[3] 25966
Request has been rejected by the rate limiter[3]  + 25966 done

$ curl localhost:7000/sleep5secs/ &
[3] 25972
Request has been rejected by the rate limiter[3]  + 25972 done
```

You can see, that the rate-limiter didn't allow the 3rd request to go to the service.

## JS-Hint
* [How to install] (https://packagecontrol.io/packages/JSHint)
* To add options to the current configurations open 'package.json' and add your options under 'jshintConfig'.

## Configuration

There are 5 levels of configuration sources (all but the first one optional). From lowest to highest priority:

 * Default configuration values hard-coded in `lib/rate-limiter/settings.js`
 * `$PWD/config/default.json` if it exists
 * `$PWD/config/$NODE_ENV.json` if it exists
 * The second parameter to `lib/rate-limiter/settings.js#load` is an optional function which gets called with
   a `ConfigBuilder` instance as its only argument. It can make `add{Obj,File,Dir}` calls on it to add
   any custom config sources.
 * The first parameter to `lib/rate-limiter/settings.js#load` is an optional string which is the path to
   a configuration file. If run through `lib/rate-limiter/boot.js` (used by `start-rate-limiter.js`), the
   command-line argument `--config` (or just `-c`) is passed in here.
