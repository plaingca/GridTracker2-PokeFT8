// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Network helpers: HTTP(S) GET/POST, opening web and mail links (moved from GridTracker2.js)

function mailThem(address)
{
  window.open("mailto:" + address, "_blank");
}

function openSite(address)
{
  window.open(address, "_blank");
}

// onError (optional): called once with a message if the request fails, stalls for 20 seconds,
// or the reply can't be decompressed. Without it, failures are only logged, as before.
function getBuffer(file_url, callback, flag, mode, port, cache = null, onError = null)
{
  let http = window.require(mode);
  let fileBuffer = null;
  let options = null;
  // for logging: drop the query string, which can hold logins and passwords (e.g. QRZ/HamQTH sign-in)
  const logUrl = file_url.split("?")[0];
  let failed = false;
  const fail = function (message)
  {
    if (onError && !failed)
    {
      failed = true;
      onError(message);
    }
  };

  options = {
    host: NodeURL.parse(file_url).host, // eslint-disable-line node/no-deprecated-api
    port: port,
    followAllRedirects: true,
    path: NodeURL.parse(file_url).path, // eslint-disable-line node/no-deprecated-api
    headers: { "User-Agent": gtUserAgent, "x-user-agent": gtUserAgent, 'Accept-Encoding': 'gzip' },
  };

  const req = http.get(options, function (res)
  {
    const encoding = res.headers['content-encoding'];
    res.on("data", function (data)
      {
        if (fileBuffer == null) fileBuffer = Buffer.from(data);
        else fileBuffer = Buffer.concat([fileBuffer, data]);
      })
      .on("end", function ()
      {
        if (encoding === 'gzip') {
          try { fileBuffer = window.require('zlib').gunzipSync(fileBuffer); }
          catch (e) { console.error("getBuffer gunzip " + logUrl, e.message); fail("could not read the reply"); return; }
        }
        if (typeof callback == "function")
        {
          // Call it, since we have confirmed it is callable
          callback(fileBuffer, flag, cache);
        }
      })
      .on("error", function (e)
      {
        console.error("getBuffer " + logUrl + " error: " + e.message);
        fail(e.message);
      });
  });

  req.on("error", function (e)
  {
    console.error("getBuffer " + logUrl + " request error: " + e.message);
    fail(e.message);
  });

  if (onError)
  {
    req.setTimeout(20000, function ()
    {
      req.destroy(new Error("no reply from server"));
    });
  }
}

function getPostBuffer(file_url, callback, flag, mode, port, theData, timeoutMs, timeoutCallback, who)
{
  let querystring = window.require("querystring");
  let postData = querystring.stringify(theData);
  let http = window.require(mode);
  let fileBuffer = null;
  let options = {
    host: NodeURL.parse(file_url).host, // eslint-disable-line node/no-deprecated-api
    port: port,
    path: NodeURL.parse(file_url).path, // eslint-disable-line node/no-deprecated-api
    method: "post",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(postData),
      "User-Agent": gtUserAgent,
      "x-user-agent": gtUserAgent
    }
  };
  let req = http.request(options, function (res)
  {
    // let fsize = res.headers["content-length"];
    let cookies = null;
    if (typeof res.headers["set-cookie"] != "undefined") { cookies = res.headers["set-cookie"]; }
    res
      .on("data", function (data)
      {
        if (fileBuffer == null) fileBuffer = data;
        else fileBuffer += data;
      })
      .on("end", function ()
      {
        if (typeof callback == "function")
        {
          // Call it, since we have confirmed it is callable
          callback(fileBuffer, flag, postData);
        }
      })
      .on("error", function ()
      {
        if (typeof errorCallback == "function")
        {
          errorCallback();
        }
      });
  });
  if (typeof timeoutMs == "number" && timeoutMs > 0)
  {
    req.on("socket", function (socket)
    {
      socket.setTimeout(timeoutMs);
      socket.on("timeout", function ()
      {
        req.abort();
      });
    });
  }
  req.on("error", function (err) // eslint-disable-line node/handle-callback-err
  {
    if (typeof timeoutCallback == "function")
    {
      timeoutCallback(
        file_url,
        callback,
        flag,
        mode,
        port,
        theData,
        timeoutMs,
        timeoutCallback,
        who
      );
    }
    else if (typeof callback == "function")
    {
      // Call it, since we have confirmed it is callable
      callback(null, null);
    }
    req.abort();
  });
  
  req.write(postData);
  req.end();
}
