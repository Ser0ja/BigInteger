"use strict";

var global = this;
var I = undefined;
global.url = undefined;
global.benchmarkSuite = undefined;
global.testSuite = undefined;
var base = this.parent !== undefined ? this.parent : {
  postMessage: function (message) {
    global.postMessage(message);
  }
};

var loadScripts = function (src, callback) {
  if (src === "") {
    setTimeout(callback, 0);
  } else {
    if (global.importScripts !== undefined) {
      global.importScripts(src);
      setTimeout(callback, 0);
    } else {
      var script = document.createElement("script");
      script.src = src;
      script.onload = callback;
      script.onreadystatechange = function() { // IE
        if (script.readyState === "complete" || script.readyState === "loaded") {
          script.onload = undefined;
          callback();
        }
      };
      document.documentElement.appendChild(script);
    }
  }
};

var transform = function (f) {
  return eval("(" + f.toString().replace(/I\.([a-zA-Z]+)\(([^,\)]+)(?:,([^,\)]+))?\)/g, function (p, o, a, b) {
    if (I[o] == undefined) {
      return p;
    }
    return I[o].replace(/([a-zA-Z]+)/g, function (t) {
      return t === "a" ? a.trim() : (t === "b" ? b.trim() : t);
    });
  }) + ")");
};

var invervalId = setInterval(function () {
  console.log("!");
}, 10000);

self.onmessage = function (event) {
  if (event.data === "start") {
    var src = decodeURIComponent(/src\=([^&]*)/.exec(location.search)[1]);
    loadScripts("benchmark.js", function () {
      Benchmark.options.minTime = 1 / 128;
      Benchmark.options.maxTime = 1 / 4;
      Benchmark.options.minSamples = 7;

      benchmarkSuite = new Benchmark.Suite();
      benchmarkSuite.on("cycle", function (event) {
        base.postMessage(JSON.stringify({
          message: event.target.toString(),
          url: url,
          name: event.target.name,
          result: (1 / event.target.times.period)
        }), "*");
      });
      var complete = false;
      benchmarkSuite.on("error", function (event) {
        if (!complete) {
          complete = true;
          console.log(event.target.error);
          base.postMessage(JSON.stringify({
            message: "",
            url: url,
            name: "complete",
            result: 0
          }), "*");
        }
      });
      benchmarkSuite.on("complete", function (event) {
        if (!complete) {
          complete = true;
          base.postMessage(JSON.stringify({
            message: "",
            url: url,
            name: "complete",
            result: 0
          }), "*");
          clearInterval(invervalId);
        }
      });
      testSuite = {
        callbacks: [],
        add: function (title, callback) {
          this.callbacks.push({
            title: title,
            callback: callback
          });
        },
        run: function (options) {
          for (var i = 0; i < this.callbacks.length; i += 1) {
            var test = this.callbacks[i];
            var data = "";
            try {
              test.callback(I);
            } catch (e) {
              data = e.toString();
              if (e.message === "-") {
                data = "N/A";
              }
            }
            base.postMessage(JSON.stringify({
              message: test.title,
              url: url,
              name: "test",
              result: data
            }), "*");
          }
        }
      };
      loadScripts("libs.js", function () {
        loadScripts(src === "number" ? "" : src, function () {
          var lib = undefined;
          for (var i = 0; i < libs.length; i += 1) {
            if (libs[i].src === src) {
              lib = libs[i];
            }
          }
          I = lib;
          url = lib.url;//!
          loadScripts("tests.js", function () {
            if (I.setup != undefined) {
              I.setup();
            }
            var f = transform(wrapper.toString());
            f();
            setTimeout(function () {
              if (src !== "data:application/javascript,%3B") {
                testSuite.run();
              }
              benchmarkSuite.run({
                async: true
              });
            }, 64);
          });
        });
      });
    });
  }
};
