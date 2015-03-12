(function () {
    "use strict"; 

    var http = require("http");

    function handler(req, res) {
        var status_code = 200;

        var body = "";
        body += "Hello ratelimiter!\n";
        body += req.url + "\n";
        body += JSON.stringify(req.headers, true, 2);

        res.writeHead(status_code, {'Content-Type': 'text/plain'});
        res.write(body);
        res.end();


        console.log(["request", req.url, status_code].join(" "))
    }

    console.log("Starting mock server on localhost:7001");

    http.createServer(function (req, res) {
        if (req.url == "/sleep5secs/") {
            setTimeout(handler, 5000, req, res);
        } else {
            handler(req, res);
        }
    }).listen(7001);
})()
