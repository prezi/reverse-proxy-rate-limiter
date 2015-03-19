# reverse-proxy-rate-limiter

[![Build Status](https://magnum.travis-ci.com/prezi/reverse-proxy-rate-limiter.svg?token=C6T3YoEYndcatuyXax7y&branch=master)](https://magnum.travis-ci.com/prezi/reverse-proxy-rate-limiter)

`reverse-proxy-rate-limiter` is a reverse proxy written in Node.js that protects the service behind it from being overloaded. It limits incoming requests based on their origin and the number of active concurrent requests while ensuring that the service’s capacity is fully utilized.

## Usecase
Web services are often used by very different types of clients. If we imagine a service storing presentations, there could be users loading presentations in their browser and perhaps a search service that would like to index the content of the presentations. In this scenario, the requests from the user wanting to present is much more important than the one from the search service - the latter can wait and come back if it couldn’t retrieve presentations, but the user cannot.

The `reverse-proxy-rate-limiter` helps with managing such a situation. Standing between the clients and the service providing presentations, it ensures that the search service won’t consume capacity that is needed for serving requests from the users and that it won’t overload it as a whole.

![How it works](https://raw.githubusercontent.com/prezi/reverse-proxy-rate-limiter/master/examples/how-it-works.png?token=ACH8it15kS-54VlLDg8uFzYTpYGy4Q0cks5VDD1bwA%3D%3D)

The `reverse-proxy-rate-limiter` prioritizes requests from different clients by assigning them to different buckets (shown in red and blue in the figure above) based on HTTP headers. A bucket is basically a set of limitation rules that we want to apply on traffic that we mapped to the bucket. Based on those rules and the active requests both in the bucket and overall service, a request will be forwarded to the service or rejected (indicated with the `429` status code in the figure).

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

You can see, that the rate-limiter didn't allow the 3rd request to go to the service. This is basically the gist of how the rate-limiter will protect your service.

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
