// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Callsign lookup: QRZ, QRZCQ, HamQTH, Callook, cache and display (split out of gt.js)

// GT.settings.app keys holding [login, password] for a lookup service, or null if it needs none
function lookupCredentialKeys(service)
{
  if (service == "QRZ") return ["lookupLoginQrz", "lookupPasswordQrz"];
  if (service == "QRZCQ") return ["lookupLoginCq", "lookupPasswordCq"];
  if (service == "HAMQTH") return ["lookupLoginQth", "lookupPasswordQth"];
  return null;
}

// Display name of a lookup service, as shown in the result's "Source" row
function lookupServiceName(service)
{
  if (service == "QRZ") return "QRZ.com";
  if (service == "QRZCQ") return "QRZCQ.com";
  if (service == "HAMQTH") return "HamQTH";
  return "Callook";
}

// Lookup results are written by each station's owner on QRZ/QRZCQ/HamQTH/Callook, so treat them as
// untrusted: escape every value before it goes into the lookup window's HTML.
// htmlEntities covers & < > "; single quotes too, since many attributes here are '...'
function lookupHtml(value)
{
  return htmlEntities(value == null ? "" : value).replace(/'/g, "&#39;");
}

// A value passed as a string argument inside an onclick='...' attribute: JS-quote it, then HTML-escape
function lookupJsArg(value)
{
  return lookupHtml(JSON.stringify(String(value == null ? "" : value)));
}

// A profile "website" to open in the system browser: only http(s), since openSite hands the
// address to the operating system (a file: address could start a program). "" = no link.
function lookupWebsiteUrl(url)
{
  url = String(url).trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (url.length > 0 && !/^[a-z][a-z0-9+.-]*:/i.test(url)) return "http://" + url; // e.g. "www.example.com"
  return "";
}

function loadLookupDetails()
{
  lookupService.value = GT.settings.app.lookupService;
  const keys = lookupCredentialKeys(lookupService.value);
  if (keys)
  {
    lookupLogin.value = GT.settings.app[keys[0]];
    lookupPassword.value = GT.settings.app[keys[1]];
  }
  ValidateText(lookupLogin);
  ValidateText(lookupPassword);
  if (lookupService.value == "CALLOOK") { lookupCredentials.style.display = "none"; }
  else lookupCredentials.style.display = "block";
}

function lookupValueChanged()
{
  const keys = lookupCredentialKeys(lookupService.value);
  if (GT.settings.app.lookupService != lookupService.value)
  {
    GT.lastLookupCallsign = "";
    if (keys)
    {
      lookupLogin.value = GT.settings.app[keys[0]];
      lookupPassword.value = GT.settings.app[keys[1]];
    }
  }
  GT.settings.app.lookupService = lookupService.value;
  lookupQrzTestResult.innerHTML = "";
  GT.qrzLookupSessionId = null;
  if (lookupService.value == "CALLOOK") { lookupCredentials.style.display = "none"; }
  else lookupCredentials.style.display = "block";
  if (ValidateText(lookupLogin) && ValidateText(lookupPassword) && keys)
  {
    GT.settings.app[keys[0]] = lookupLogin.value;
    GT.settings.app[keys[1]] = lookupPassword.value;
  }
}

function lookupCallsign(callsign, gridPass, useCache = true)
{
  if (GT.settings.map.offlineMode == true && useCache == false) return;
  GT.lastLookupCallsign = callsign;

  if (GT.lookupWindowInitialized)
  {
    GT.lookupWindowHandle.window.lookupCallsignInput.value = callsign;
    lookupValidateCallByElement("lookupCallsignInput");
  }
  if (GT.lookupTimeout != null)
  {
    nodeTimers.clearTimeout(GT.lookupTimeout);
    GT.lookupTimeout = null;
  }
  GT.lookupTimeout = nodeTimers.setTimeout(searchLogForCallsign, 500, callsign);

  if (useCache)
  {
    getLookupCachedObject(
      callsign,
      gridPass,
      cacheLookupObject,
      continueWithLookup
    );
  }
  else continueWithLookup(callsign, gridPass);
}

// The licence callsign inside a portable one: "W1AW/P", "KP4/W1AW" and "VE3/W1AW/M" all give "W1AW"
function lookupBaseCallsign(callsign)
{
  return String(callsign).split("/").reduce((best, part) => (part.length > best.length ? part : best), "");
}

// Callook serves the FCC licence database: the USA (840, which includes Alaska, Hawaii and the
// Marianas) plus Puerto Rico (630), Guam (316), US Virgin Is. (850) and American Samoa (16)
function isCallookCountry(ccode)
{
  return [840, 630, 316, 850, 16].includes(Number(ccode));
}

// Lookups also start automatically whenever the WSJT-X DX call changes, so replies can overlap.
// A reply is stale if a different call has been asked for since; it is still cached but not shown.
// requested is undefined for replies not tied to one call (e.g. sign-in), which are never stale.
function isStaleLookup(requested)
{
  return requested !== undefined && requested != GT.lastLookupCallsign;
}

// getBuffer onError handler: report a request that failed before any reply arrived
// (no network, DNS failure, server not answering) instead of leaving "please wait" up forever.
// With resultTd it's the settings Test button; otherwise the lookup window.
function lookupRequestFailed(resultTd, requested)
{
  return function (message)
  {
    if (resultTd == null && isStaleLookup(requested)) return;
    const html = "<font color='red'>Lookup failed: " + htmlEntities(message) + "</font>";
    if (resultTd != null) resultTd.innerHTML = html;
    else setLookupDiv("lookupInfoDiv", html);
  };
}

function continueWithLookup(callsign, gridPass)
{
  // Not in the cache: this needs the network, so stop here in offline mode
  if (GT.settings.map.offlineMode == true) return;

  setLookupDiv(
    "lookupInfoDiv",
    "Looking up <font color='cyan'>" + lookupHtml(callsign) + "</font>, please wait..."
  );

  if (GT.settings.app.lookupService != "CALLOOK")
  {
    // Without a saved login every lookup would just be a failed sign-in, so say so instead
    const keys = lookupCredentialKeys(GT.settings.app.lookupService);
    if (keys && (!GT.settings.app[keys[0]] || !GT.settings.app[keys[1]]))
    {
      setLookupDiv("lookupInfoDiv", "<br><b>Please enter your " + lookupServiceName(GT.settings.app.lookupService) + " login and password in Settings</b><br><br>");
      return;
    }

    GT.qrzLookupCallsign = callsign;
    GT.qrzLookupGrid = gridPass;
    GT.lookupSessionRetried = false;
    if (
      GT.qrzLookupSessionId == null ||
      timeNowSec() - GT.sinceLastLookup > 3600
    )
    {
      GT.qrzLookupSessionId = null;
      GT.sinceLastLookup = timeNowSec();
      getSessionId(null, true);
    }
    else
    {
      GT.sinceLastLookup = timeNowSec();
      getLookup(true);
    }
  }
  else
  {
    // Callook knows licence callsigns only, so look up the base call of a portable one
    const baseCall = lookupBaseCallsign(callsign);
    let dxcc = callsignToDxcc(baseCall);
    let where;
    let ccode = 0;
    if (dxcc in GT.dxccToAltName)
    {
      where = GT.dxccToAltName[dxcc];
      ccode = GT.dxccInfo[dxcc].ccode;
    }
    else where = "Unknown";
    if (isCallookCountry(ccode))
    {
      getBuffer(
        "https://callook.info/" + encodeURIComponent(baseCall) + "/json",
        (buffer, flag, cache) => callookResults(buffer, flag, cache, callsign),
        gridPass,
        "https",
        443,
        true,
        lookupRequestFailed(null, callsign)
      );
    }
    else
    {
      let html = ["<center>" + I18N("gt.callookDX1") +
          "<br>" + I18N("gt.callookDX2") +
          "<br>" + I18N("gt.callookDX3") + "<br>"];
      html.push(
        "<br>" + I18N("gt.callookDX4") + " <font color='orange'> " +
        lookupHtml(callsign) +
        "</font> " + I18N("gt.callookDX5") + " <font color='yellow'> " +
        lookupHtml(where) +
        "</font><br>");
      html.push(
        "<br><br>" + I18N("gt.callookDX6") + "<br>");
      html.push(I18N("gt.callookDX7") + "<br></center>");

      setLookupDiv("lookupInfoDiv", html.join(""));
    }
  }
}

function callookResults(buffer, gridPass, useCache, requested)
{
  const show = !isStaleLookup(requested);
  try
  {
    let results = JSON.parse(buffer);
    if (typeof results.status != "undefined")
    {
      if (results.status == "VALID")
      {
        let callObject = {};
        let dxcc = callsignToDxcc(results.current.callsign);
        if (dxcc in GT.dxccToAltName) callObject.land = GT.dxccToAltName[dxcc];
        callObject.type = results.type;
        callObject.call = results.current.callsign;
        callObject.dxcc = dxcc;
        callObject.email = "";
        callObject.class = results.current.operClass;
        callObject.aliases = results.previous.callsign;
        callObject.trustee =
          results.trustee.callsign +
          (results.trustee.name.length > 0 ? "; " + results.trustee.name : "");
        callObject.name = results.name;
        callObject.fname = "";
        callObject.addr1 = results.address.line1;
        callObject.addr2 = results.address.line2;
        callObject.addrAttn = results.address.attn;
        callObject.lat = results.location.latitude;
        callObject.lon = results.location.longitude;
        callObject.grid = results.location.gridsquare;
        callObject.efdate = results.otherInfo.grantDate;
        callObject.expdate = results.otherInfo.expiryDate;
        callObject.frn = results.otherInfo.frn;
        callObject.bio = 0;
        callObject.image = "";
        callObject.country = "United States";
        if (gridPass) callObject.gtGrid = gridPass;
        callObject.source =
          "<tr><td>Source</td><td><font color='orange'><b><div style='cursor:pointer' onClick='window.opener.openSite(\"https://callook.info/" +
          encodeURIComponent(results.current.callsign) +
          "\");'>C A L L O O K</div></b></font></td></tr>";
        cacheLookupObject(callObject, gridPass, true, show);
      }
      else if (!show) return;
      else if (results.status == "INVALID")
      {
        setLookupDiv("lookupInfoDiv", "Invalid Lookup");
      }
      else
      {
        setLookupDiv("lookupInfoDiv", "Server is down for maintenance");
      }
    }
    else if (show) setLookupDiv("lookupInfoDiv", "Unknown Lookup Error");
  }
  catch (e)
  {
    // e.g. Callook sent something that isn't the JSON we expect
    console.error("callookResults", e);
    if (show) setLookupDiv("lookupInfoDiv", "Unknown Lookup Error");
  }
}

function getSessionId(resultTd, useCache)
{
  if (GT.settings.map.offlineMode == true) return;
  if (resultTd != null) resultTd.innerHTML = "Testing";
  const app = GT.settings.app;
  let url, callback;
  if (app.lookupService == "QRZCQ")
  {
    url = "https://ssl.qrzcq.com/xml?username=" + app.lookupLoginCq +
      "&password=" + encodeURIComponent(app.lookupPasswordCq) +
      "&agent=" + encodeURIComponent(gtUserAgent);
    callback = qrzGetSessionCallback;
  }
  else if (app.lookupService == "QRZ")
  {
    url = "https://xmldata.qrz.com/xml/current/?username=" + app.lookupLoginQrz +
      ";password=" + encodeURIComponent(app.lookupPasswordQrz);
    callback = qrzGetSessionCallback;
  }
  else
  {
    url = "https://www.hamqth.com/xml.php?u=" + app.lookupLoginQth +
      "&p=" + encodeURIComponent(app.lookupPasswordQth);
    callback = hamQthGetSessionCallback;
  }
  getBuffer(url, callback, resultTd, "https", 443, useCache, lookupRequestFailed(resultTd));
}

function sessionResponse(newKey, result, useCache)
{
  // for QRZCQ.com as well
  if (newKey == null)
  {
    setLookupDiv("lookupInfoDiv", result);
  }
  else
  {
    getLookup(useCache);
  }
}

function getLookup(useCache)
{
  const service = GT.settings.app.lookupService;
  const call = encodeURIComponent(GT.qrzLookupCallsign);
  let url, callback;
  if (service == "QRZCQ")
  {
    url = "https://ssl.qrzcq.com/xml?s=" + GT.qrzLookupSessionId + "&callsign=" + call + "&agent=GridTracker";
    callback = qrzLookupResults;
  }
  else if (service == "QRZ")
  {
    url = "https://xmldata.qrz.com/xml/current/?s=" + GT.qrzLookupSessionId + ";callsign=" + call;
    callback = qrzLookupResults;
  }
  else
  {
    url = "https://www.hamqth.com/xml.php?id=" + GT.qrzLookupSessionId + "&callsign=" + call + "&prg=GridTracker";
    callback = hamQthLookupResults;
  }
  const requested = GT.qrzLookupCallsign;
  getBuffer(
    url,
    (buffer, gridPass, cache) => callback(buffer, gridPass, cache, requested),
    GT.qrzLookupGrid,
    "https",
    443,
    useCache,
    lookupRequestFailed(null, requested)
  );
}

// Parses a session login reply, sets GT.qrzLookupSessionId, and returns the status HTML.
// QRZ/QRZCQ and HamQTH replies differ only in their XML tag names.
function readLookupSession(buffer, sessionTag, keyTag, errorTag)
{
  const oParser = new DOMParser();
  const oDOM = oParser.parseFromString(buffer, "text/xml");

  // DOMParser never returns null; malformed XML yields a <parsererror> node
  if (oDOM.getElementsByTagName("parsererror").length > 0)
  {
    GT.qrzLookupSessionId = null;
    return "<font color='red'>Unknown Error</font>";
  }

  const json = XML2jsobj(oDOM.documentElement);

  if (!json.hasOwnProperty(sessionTag))
  {
    GT.qrzLookupSessionId = null;
    return "<font color='red'>Invalid Response</font>";
  }

  const session = json[sessionTag];
  if (session.hasOwnProperty(keyTag))
  {
    GT.qrzLookupSessionId = session[keyTag];
    return "<font color='green'>Valid</font>";
  }

  GT.qrzLookupSessionId = null;
  return "<font color='red'>" + lookupHtml(session[errorTag] || "Unknown Error") + "</font>";
}

// A lookup failed because the login session is no longer valid (e.g. it expired), not because
// the call wasn't found. Log in again and repeat the lookup, once. Returns true if a retry started.
function retryLookupOnSessionError(useCache)
{
  // getSessionId does nothing offline, so don't start a retry that can never finish
  if (GT.lookupSessionRetried || GT.settings.map.offlineMode == true) return false;
  GT.lookupSessionRetried = true;
  GT.qrzLookupSessionId = null;
  GT.sinceLastLookup = timeNowSec();
  getSessionId(null, useCache);
  return true;
}

function hamQthGetSessionCallback(buffer, resultTd, useCache)
{
  const result = readLookupSession(buffer, "session", "session_id", "error");

  if (resultTd == null)
  {
    // It's a true session Request
    sessionResponse(GT.qrzLookupSessionId, result, useCache);
    return;
  }

  // Settings "Test" button: never keep a session from a test
  GT.qrzLookupSessionId = null;
  resultTd.innerHTML = result;
}

function qrzGetSessionCallback(buffer, resultTd, useCache)
{
  const result = readLookupSession(buffer, "Session", "Key", "Error");

  if (resultTd == null)
  {
    // It's a true session Request
    sessionResponse(GT.qrzLookupSessionId, result, useCache);
    return;
  }

  resultTd.innerHTML = result;
}

function hamQthLookupResults(buffer, gridPass, useCache, requested)
{
  const show = !isStaleLookup(requested);
  const oParser = new DOMParser();
  const oDOM = oParser.parseFromString(buffer, "text/xml");

  // DOMParser never returns null; malformed XML yields a <parsererror> node,
  // e.g. when a proxy or the server sends an HTML error page instead
  if (oDOM.getElementsByTagName("parsererror").length > 0)
  {
    console.error("hamQthLookupResults: unexpected reply", String(buffer).substring(0, 200));
    GT.qrzLookupSessionId = null;
    if (show) setLookupDiv("lookupInfoDiv", "Unknown Lookup Error");
    return;
  }

  const json = XML2jsobj(oDOM.documentElement);

  if (!json.hasOwnProperty("search"))
  {
    GT.qrzLookupSessionId = null;
    if (!show) return;
    // HamQTH reports e.g. "Session does not exist or expired" vs "Callsign not found"
    const error = String((json.session && json.session.error) || "");
    if (/session/i.test(error))
    {
      if (retryLookupOnSessionError(useCache)) return;
      setLookupDiv("lookupInfoDiv", "<br><b>" + htmlEntities(error) + "</b><br><br>");
      return;
    }
    setLookupDiv(
      "lookupInfoDiv",
      "<br><b>" + I18N("gt.lookup.NoResult") + "</b><br><br>"
    );
    return;
  }

  const call = String(json.search.callsign || "").toUpperCase();
  const safeCall = encodeURIComponent(call);

  json.search.source =
    "<tr><td>Source</td><td><font color='orange'><b><div style='cursor:pointer' onClick='window.opener.openSite(\"https://www.hamqth.com/" +
    safeCall +
    "\");'>HamQTH</div></b></font></td></tr>";

  if (gridPass) json.search.gtGrid = gridPass;

  cacheLookupObject(json.search, gridPass, true, show);
}


function qrzLookupResults(buffer, gridPass, useCache, requested)
{
  const show = !isStaleLookup(requested);
  let oParser = new DOMParser();
  let oDOM = oParser.parseFromString(buffer, "text/xml");

  // DOMParser never returns null; malformed XML yields a <parsererror> node,
  // e.g. when a proxy or the server sends an HTML error page instead
  if (oDOM.getElementsByTagName("parsererror").length > 0)
  {
    console.error("qrzLookupResults: unexpected reply", String(buffer).substring(0, 200));
    GT.qrzLookupSessionId = null;
    if (show) setLookupDiv("lookupInfoDiv", "Unknown Lookup Error");
    return;
  }

  let json = XML2jsobj(oDOM.documentElement);

  if (!json.hasOwnProperty("Callsign"))
  {
    GT.qrzLookupSessionId = null;
    if (!show) return;
    // A reply without a session Key means our login is no longer valid (e.g. "Session Timeout");
    // with a Key it's a real "not found"
    const session = json.Session || {};
    if (!session.hasOwnProperty("Key"))
    {
      if (retryLookupOnSessionError(useCache)) return;
      if (session.Error)
      {
        setLookupDiv("lookupInfoDiv", "<br><b>" + htmlEntities(session.Error) + "</b><br><br>");
        return;
      }
    }
    setLookupDiv(
      "lookupInfoDiv",
      "<br><b>" + I18N("gt.lookup.NoResult") + "</b><br><br>"
    );
    return;
  }

  let call = "";
  if (json.Callsign.hasOwnProperty("callsign"))
  {
    json.Callsign.call = json.Callsign.callsign;
    delete json.Callsign.callsign;
  }
  if (json.Callsign.hasOwnProperty("call")) call = json.Callsign.call;

  const isQRZ = GT.settings.app.lookupService == "QRZ";
  const safeCall = encodeURIComponent(call);
  const url = isQRZ
    ? "https://www.qrz.com/lookup?callsign=" + safeCall
    : "https://www.qrzcq.com/call/" + safeCall;
  const label = isQRZ ? "QRZ.com" : "QRZCQ.com";

  // QRZCQ shows the biography on the call page; QRZ results use the qrz.com/db link (see displayLookupObject)
  if (!isQRZ) json.Callsign.bioUrl = url;

  json.Callsign.source =
    "<tr><td>Source</td><td><font color='orange'><b><div style='cursor:pointer' onClick='window.opener.openSite(\"" +
    url +
    "\");'>" +
    label +
    "</div></b></font></td></tr>";

  if (gridPass) json.Callsign.gtGrid = gridPass;

  cacheLookupObject(json.Callsign, gridPass, true, show);
}


function addLookupObjectToCache(lookupObject)
{
  GT.lookupCache[lookupObject.call] = lookupObject;
}

function getLookupCachedObject(call, gridPass, resultFunction = null, noResultFunction = null, callObject = null)
{
  if (call in GT.lookupCache)
  {
    let lookupObject = GT.lookupCache[call];
    if (callObject != null)
    {
      callObject.cnty = lookupObject.cnty;
      if (callObject.cnty in GT.countyData)
      {
        callObject.qual = true;
      }
      else
      {
        callObject.cnty = null;
        callObject.qual = false;
      }
      return;
    }
    if (resultFunction)
    {
      resultFunction(lookupObject, gridPass, false);
    }
  }
  else if (noResultFunction)
  {
    noResultFunction(call, gridPass);
  }
}

// display = false: cache the result and update the roster, but leave the lookup window alone
// (used for replies that a newer lookup has replaced; see isStaleLookup)
function cacheLookupObject(lookup, gridPass, cacheable = false, display = true)
{
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(lookup, key);

  const rename = (from, to) =>
  {
    if (hasOwn(from))
    {
      lookup[to] = lookup[from];
      delete lookup[from];
    }
  };

  if (!("cnty" in lookup))
  {
    lookup.cnty = null;
  }

  rename("callsign", "call");

  if (lookup.call)
  {
    lookup.call = lookup.call.toUpperCase();
  }

  rename("latitude", "lat");
  rename("longitude", "lon");
  rename("locator", "grid");

  rename("website", "url");
  rename("web", "url");

  rename("qslpic", "image");
  rename("picture", "image");

  rename("address", "addr1");
  rename("adr_city", "addr2");
  rename("city", "addr2");

  rename("itu", "ituzone");
  rename("cq", "cqzone");
  rename("adif", "dxcc");

  if (!hasOwn("dxcc") && lookup.call)
  {
    lookup.dxcc = callsignToDxcc(lookup.call);
  }

  rename("adr_name", "name");
  rename("adr_street1", "addr1");

  rename("us_state", "state");
  rename("oblast", "state");
  rename("district", "state");

  rename("adr_zip", "zip");
  rename("adr_country", "country");
  rename("us_county", "county");

  rename("qsldirect", "mqsl");
  rename("qsl", "bqsl");
  rename("utc_offset", "GMTOffset");

  rename("land", "country");

  if ("grid" in lookup && lookup.grid)
  {
    lookup.grid = lookup.grid.toUpperCase();
  }

  // Keep "GT Grid" current when a cached lookup is shown again (e.g. a portable station has moved)
  if (gridPass) lookup.gtGrid = gridPass;

  if (GT.settings.app.lookupService == "CALLOOK" && !("county" in lookup) && "lon" in lookup && "lat" in lookup)
  {
    if (GT.countyLookupReady == false) initCountyMap();
    lookup.cnty = getCountyFromLongLat(lookup.lon, lookup.lat);
    if (lookup.cnty)
    {
      lookup.county = GT.countyData[lookup.cnty].geo.properties.st + "," + GT.countyData[lookup.cnty].geo.properties.n;
      lookup.state = GT.countyData[lookup.cnty].geo.properties.st;
    }
  }
  else if (GT.countyLookupReady == true && GT.settings.app.lookupService != "CALLOOK") clearCountyMap();

  if ("state" in lookup && "county" in lookup)
  {
    let foundCounty = false;

    if (lookup.cnty == null)
    {
      if (!(lookup.county.startsWith(lookup.state + ",")))
      {
        lookup.county = lookup.state + "," + lookup.county;
      }
      lookup.cnty = lookup.county.toUpperCase().replaceAll(" ", "");
    }

    if (lookup.cnty in GT.countyData)
    {
      for (const hash in GT.liveCallsigns)
      {
        if (GT.liveCallsigns[hash].DEcall == lookup.call && GT.liveCallsigns[hash].state == "US-" + lookup.state)
        {
          GT.liveCallsigns[hash].cnty = lookup.cnty;
          GT.liveCallsigns[hash].qual = true;
          GT.liveCallsigns[hash].cntys = 0;
          foundCounty = true;
        }
      }
      if (foundCounty)
      {
        goProcessRoster();
      }
    }
    else
    {
      lookup.cnty = null;
    }
  }

  if (lookup.call && lookup.grid)
  {
    if (GT.instances)
    {
      for (const instKey in GT.instances)
      {
        const inst = GT.instances[instKey];
        if (inst && inst.status && inst.status.Band && inst.status.MO)
        {
          const hash = lookup.call + inst.status.Band + inst.status.MO;
          const entry = GT.liveCallsigns[hash];
          if (entry)
          {
            if (!entry.grid)
            {
              entry.grid = lookup.grid;
              entry.gridQualified = false;
              updateLiveDistance(entry);
              goProcessRoster();
            }
          }
        }
      }
    }
  }

  lookup.name = joinSpaceIf(getLookProp(lookup, "fname"), getLookProp(lookup, "name"));
  lookup.fname = "";

  if (cacheable)
  {
    addLookupObjectToCache(lookup);
  }

  if (display) displayLookupObject(lookup, gridPass, !cacheable);
}

function displayLookupObject(lookup, gridPass, fromCache = false)
{
  const p = (key) => getLookProp(lookup, key);

  const call = p("call").toUpperCase();
  const image = p("image");
  const name = p("name");
  const addrAttn = p("addrAttn");
  const addr1 = p("addr1");
  const addr2 = joinCommaIf(p("addr2"), joinSpaceIf(p("state"), p("zip")));
  const country = p("country");
  const email = p("email");
  const url = p("url");
  const grid = p("grid");
  const gtGrid = p("gtGrid");
  const lat = p("lat");
  const lon = p("lon");

  const addRowIf = (arr, label, value, extra = "") =>
  {
    if (value.length > 0)
    {
      arr.push(`<tr${extra}><td>${label}</td><td>${lookupHtml(value)}</td></tr>`);
    }
  };

  const addressLines = [];
  if (addrAttn.length > 0) addressLines.push(addrAttn);
  addressLines.push(name, addr1, addr2, country);
  if (email.length > 0) addressLines.push(email);
  GT.lastLookupAddress = addressLines.join("\n") + "\n";

  const cardRows = [];

  if (addrAttn.length > 0)
  {
    cardRows.push(`<tr><td>${lookupHtml(addrAttn)}</td></tr>`);
  }

  cardRows.push(
    `<tr><td><b>${lookupHtml(name)}</b></td></tr>`,
    `<tr><td>${lookupHtml(addr1)}</td></tr>`,
    `<tr><td>${lookupHtml(addr2)}</td></tr>`,
    `<tr><td>${lookupHtml(country)}</td></tr>`,
    `<tr><td>${
      email.length > 0
        ? `<div style='cursor:pointer;font-weight:bold;vertical-align:top' onclick='window.opener.mailThem(${lookupJsArg(email)});'>${lookupHtml(email)}</div>`
        : ""
    }</td></tr>`
  );

  const card = `
    <div class='mapItem' id='callCard' style='top:0;padding:4px;'>
      <table title='Click to copy address to clipboard' onclick='setClipboardFromLookup();' style='cursor:pointer'>
        <tr>
          <td style='font-size:36pt;color:cyan;font-weight:bold'>${lookupHtml(formatCallsign(call))}</td>
          <td align='center' style='margin:0;padding:0'>
            ${lookup.dxcc > 0 && lookup.dxcc in GT.dxccInfo
              ? `<img style='padding-top:4px' src='img/flags/24/${GT.dxccInfo[lookup.dxcc].flag}'>`
              : ""}
          </td>
          <td rowspan='6'>
            ${image.length > 0
              ? `<img style='border:1px solid gray' class='roundBorder' width='220px' src='${lookupHtml(image)}'>`
              : ""}
          </td>
        </tr>
        ${cardRows.join("")}
      </table>
    </div>`;

  const detailsRows = ["<tr><th colspan='2'>Details</th></tr>"];

  const website = url.length > 0 ? lookupWebsiteUrl(url) : "";
  if (website.length > 0)
  {
    detailsRows.push(
      `<tr><td>Website</td><td><font color='orange'><b><div style='cursor:pointer' onClick='window.opener.openSite(${lookupJsArg(website)});'>Link</div></b></font></td></tr>`
    );
  }

  if (Number(p("bio")) > 0)
  {
    const bioUrl = p("bioUrl") || "https://www.qrz.com/db/" + p("call");
    detailsRows.push(
      `<tr><td>Biography</td><td><font color='orange'><b><div style='cursor:pointer' onClick='window.opener.openSite(${lookupJsArg(bioUrl)});'>Link</div></b></font></td></tr>`
    );
  }

  detailsRows.push(
    makeRow("Type", lookup, "type"),
    makeRow("Class", lookup, "class"),
    makeRow("Codes", lookup, "codes"),
    makeRow("QTH", lookup, "qth")
  );

  const dates = joinIfBothWithDash(p("efdate"), p("expdate"));
  addRowIf(detailsRows, "Effective Dates", dates);

  const aliases = joinCommaIf(p("aliases"), p("p_call"));
  addRowIf(detailsRows, "Aliases", aliases, ` title='${lookupHtml(aliases)}'`);

  detailsRows.push(
    makeRow("Polish OT", lookup, "plot"),
    makeRow("German DOK", lookup, "dok"),
    makeYesNoRow("DOK is Sonder-DOK", lookup, "sondok"),
    `<tr><td>DXCC</td><td>${lookupHtml(p("dxcc"))} - ${lookupHtml(GT.dxccToAltName[p("dxcc")] || "Unknown")}</td></tr>`,
    makeRow("CQ zone", lookup, "cqzone"),
    makeRow("ITU zone", lookup, "ituzone"),
    makeRow("IOTA", lookup, "iota"),
    makeRow("FIPS", lookup, "fips"),
    makeRow("FRN", lookup, "frn"),
    makeRow("Timezone", lookup, "TimeZone"),
    makeRow("GMT Offset", lookup, "GMTOffset"),
    makeRow("County", lookup, "county"),
    makeRow("Latitude", lookup, "lat"),
    makeRow("Longitude", lookup, "lon")
  );

  if (lat.length > 0 && lon.length > 0)
  {
    const distance = parseInt(
      MyCircle.distance(
        GT.myLat,
        GT.myLon,
        Number(lat),
        Number(lon),
        distanceUnit.value
      ) * MyCircle.validateRadius(distanceUnit.value)
    );

    const bearing = parseInt(
      MyCircle.bearing(GT.myLat, GT.myLon, Number(lat), Number(lon))
    );

    detailsRows.push(
      `<tr><td>Distance</td><td style='color:cyan'>${distance}${distanceUnit.value.toLowerCase()}</td></tr>`,
      `<tr><td>Azimuth</td><td style='color:yellow'>${bearing}&deg;</td></tr>`
    );
  }

  detailsRows.push(makeRow("Grid", lookup, "grid", true));

  if (gtGrid.length > 0 && gtGrid.toUpperCase() != grid.toUpperCase())
  {
    detailsRows.push(makeRow("GT Grid", lookup, "gtGrid", true));
  }

  detailsRows.push(
    makeRow("Born", lookup, "born"),
    makeYesNoRow("LoTW", lookup, "lotw"),
    makeYesNoRow("eQSL", lookup, "eqsl"),
    makeYesNoRow("Bureau QSL", lookup, "bqsl"),
    makeYesNoRow("Mail Direct QSL", lookup, "mqsl"),
    makeRow("QSL Via", lookup, "qsl_via"),
    makeRow("QRZ Admin", lookup, "user"),
    makeRow("Prefix", lookup, "prefix"),
    lookup.source
  );

  if (GT.settings.callsignLookups.lotwUseEnable == true && call in GT.lotwCallsigns)
  {
    detailsRows.push(
      `<tr><td>LoTW Member</td><td>&#10004; (${userDayString(GT.lotwCallsigns[call] * 86400 * 1000)})</td></tr>`
    );
  }

  if (GT.settings.callsignLookups.eqslUseEnable == true && call in GT.eqslCallsigns)
  {
    detailsRows.push("<tr><td>eQSL Member</td><td>&#10004;</td></tr>");
  }

  if (GT.settings.callsignLookups.oqrsUseEnable == true && call in GT.oqrsCallsigns)
  {
    detailsRows.push("<tr><td>ClubLog OQRS</td><td>&#10004;</td></tr>");
  }

  if (fromCache)
  {
    detailsRows.push("<tr><td>Cached</td><td>Yes</td></tr>");
  }

  const details = `
    <div class='mapItem' id='callDetails' style='padding:4px;'>
      <table align='center' class='bioTable'>
        ${detailsRows.join("")}
      </table>
    </div>`;

  const genMessage = `
    <tr>
      <td colspan='2'>
        <div title='Clear' class='button' onclick='window.opener.clearLookup();'>Clear</div>
        <div title='Generate Messages' class='button' onclick='window.opener.setCallAndGrid(${lookupJsArg(p("call"))},${lookupJsArg(grid)});'>Generate Messages</div>
      </td>
    </tr>`;

  setLookupDiv(
    "lookupInfoDiv",
    `<table align='center'><tr><td>${card}</td><td>${details}</td></tr>${genMessage}</table>`
  );

  setLookupDivHeight("lookupBoxDiv", getLookupWindowHeight() + "px");
}

function clearLookup()
{
  if (GT.lookupWindowInitialized)
  {
    GT.lookupWindowHandle.window.lookupCallsignInput.value = "";
    lookupValidateCallByElement("lookupCallsignInput");
    setLookupDiv("lookupLocalDiv", "");
    setLookupDiv("lookupInfoDiv", "");
    setLookupDivHeight("lookupBoxDiv", getLookupWindowHeight() + "px");
  }
}

function makeYesNoRow(first, object, key)
{
  let value = getLookProp(object, key);
  if (value.length > 0)
  {
    let test = value.toUpperCase();
    if (test == "Y") return "<tr><td>" + first + "</td><td>Yes</td></tr>";
    if (test == "N") return "<tr><td>" + first + "</td><td>No</td></tr>";
    if (test == "?") return "";
    return ("<tr><td>" + first + "</td><td>" + (object[key] == 1 ? "Yes" : "No") + "</td></tr>");
  }
  return "";
}

function lookupGridCellStyle(gridLocator, band, mode)
{
  const g = (gridLocator || "").substr(0, 4);
  if (!g) return "color:cyan;";

  const b = band ?? GT.settings.app.myBand ?? "";
  const m = mode ?? GT.settings.app.myMode ?? "";
  const reference = GT.activeRoster?.logbook?.referenceNeed ?? GT.settings.roster?.logbook?.referenceNeed ?? "4";

  let suffix;
  switch (reference)
  {
    case "0": // Live Band & Mode
    case "6": // Award Tracker
      suffix = `${b}${m}`;
      break;
    case "1": // Live Band, Mix Modes
      suffix = b;
      break;
    case "2": // Live Band, Digi Modes
      suffix = `${b}dg`;
      break;
    case "3": // Mix Band, Live Mode
      suffix = m;
      break;
    case "5": // Mix Band, Digi Modes
      suffix = "dg";
      break;
    case "4": // Mix Band & Modes
    default:
      suffix = "";
      break;
  }

  return (g + suffix) in GT.tracker.confirmed.grid
    ? "color:cyan;background-color:black;"
    : "color:black;background-color:cyan;";
}

function makeRow(first, object, key, grid = false)
{
  let value = getLookProp(object, key);
  if (value.length > 0)
  {
    if (grid)
    {
      // only applies to grid at this point. we want to invert
      // the background color of the grid cell if new or
      // unconfirmed and leave as is if confirmed.
      let style = lookupGridCellStyle(object[key]);
      return ("<tr><td>" + first + "</td><td title='Copy to clipboard' style='cursor:pointer;font-weight:bold;" + style + "' onClick='addTextToClipboard(" + lookupJsArg(object[key]) + ")'>" + lookupHtml(object[key]) + "</td></tr>");
    }
    else
    {
      return ("<tr><td>" + first + "</td><td>" + lookupHtml(object[key].substr(0, 45)) + "</td></tr>");
    }
  }
  return "";
}

function getLookProp(object, key)
{
  return object.hasOwnProperty(key) ? object[key] : "";
}

function joinSpaceIf(first, second)
{
  if (first.length > 0 && second.length > 0) return first + " " + second;
  if (first.length > 0) return first;
  if (second.length > 0) return second;
  return "";
}

function joinCommaIf(first, second)
{
  if (first.length > 0 && second.length > 0)
  {
    if (first.indexOf(",") > -1) return first + " " + second;
    else return first + ", " + second;
  }
  if (first.length > 0) return first;
  if (second.length > 0) return second;
  return "";
}

function joinIfBothWithDash(first, second)
{
  if (first.length > 0 && second.length > 0) { return first + " / " + second; }
  return "";
}

function startLookup(call, grid)
{
  if (call == "-") return;
  if (grid == "-") grid = "";

  openLookupWindow(true);

  lookupCallsign(call, grid);
}
