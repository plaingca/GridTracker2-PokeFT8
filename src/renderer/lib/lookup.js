// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Callsign lookup: QRZ, HamQTH, Callook, cache and display (moved verbatim from gt.js)

function loadLookupDetails()
{
  lookupService.value = GT.settings.app.lookupService;
  if (lookupService.value == "QRZ")
  {
    lookupLogin.value = GT.settings.app.lookupLoginQrz;
    lookupPassword.value = GT.settings.app.lookupPasswordQrz;
  }
  if (lookupService.value == "QRZCQ")
  {
    lookupLogin.value = GT.settings.app.lookupLoginCq;
    lookupPassword.value = GT.settings.app.lookupPasswordCq;
  }
  if (lookupService.value == "HAMQTH")
  {
    lookupLogin.value = GT.settings.app.lookupLoginQth;
    lookupPassword.value = GT.settings.app.lookupPasswordQth;
  }
  ValidateText(lookupLogin);
  ValidateText(lookupPassword);
  if (lookupService.value == "CALLOOK") { lookupCredentials.style.display = "none"; }
  else lookupCredentials.style.display = "block";
}

function lookupValueChanged(what)
{
  if (GT.settings.app.lookupService != lookupService.value)
  {
    GT.lastLookupCallsign = "";
    if (lookupService.value == "QRZ")
    {
      lookupLogin.value = GT.settings.app.lookupLoginQrz;
      lookupPassword.value = GT.settings.app.lookupPasswordQrz;
    }
    if (lookupService.value == "QRZCQ")
    {
      lookupLogin.value = GT.settings.app.lookupLoginCq;
      lookupPassword.value = GT.settings.app.lookupPasswordCq;
    }
    if (lookupService.value == "HAMQTH")
    {
      lookupLogin.value = GT.settings.app.lookupLoginQth;
      lookupPassword.value = GT.settings.app.lookupPasswordQth;
    }
  }
  GT.settings.app.lookupService = lookupService.value;
  // GT.settings.app.lookupCallookPreferred = lookupCallookPreferred.checked;
  lookupQrzTestResult.innerHTML = "";
  GT.qrzLookupSessionId = null;
  if (lookupService.value == "CALLOOK") { lookupCredentials.style.display = "none"; }
  else lookupCredentials.style.display = "block";
  if (ValidateText(lookupLogin) && ValidateText(lookupPassword))
  {
    if (lookupService.value == "QRZ")
    {
      GT.settings.app.lookupLoginQrz = lookupLogin.value;
      GT.settings.app.lookupPasswordQrz = lookupPassword.value;
    }
    if (lookupService.value == "QRZCQ")
    {
      GT.settings.app.lookupLoginCq = lookupLogin.value;
      GT.settings.app.lookupPasswordCq = lookupPassword.value;
    }
    if (lookupService.value == "HAMQTH")
    {
      GT.settings.app.lookupLoginQth = lookupLogin.value;
      GT.settings.app.lookupPasswordQth = lookupPassword.value;
    }
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

function continueWithLookup(callsign, gridPass)
{
  setLookupDiv(
    "lookupInfoDiv",
    "Looking up <font color='cyan'>" + callsign + "</font>, please wait..."
  );
 
  if (GT.settings.app.lookupService != "CALLOOK")
  {
    GT.qrzLookupCallsign = callsign;
    GT.qrzLookupGrid = gridPass;
    if (
      GT.qrzLookupSessionId == null ||
      timeNowSec() - GT.sinceLastLookup > 3600
    )
    {
      GT.qrzLookupSessionId = null;
      GT.sinceLastLookup = timeNowSec();
      GetSessionID(null, true);
    }
    else
    {
      GT.sinceLastLookup = timeNowSec();
      GetLookup(true);
    }
  }
  else
  {
    let dxcc = callsignToDxcc(callsign);
    let where;
    let ccode = 0;
    if (dxcc in GT.dxccToAltName)
    {
      where = GT.dxccToAltName[dxcc];
      ccode = GT.dxccInfo[dxcc].ccode;
    }
    else where = "Unknown";
    if (ccode == 840)
    {
      getBuffer(
        "https://callook.info/" + callsign + "/json",
        callookResults,
        gridPass,
        "https",
        443,
        true
      );
    }
    else
    {
      let html = ["<center>" + I18N("gt.callookDX1") +
          "<br>" + I18N("gt.callookDX2") +
          "<br>" + I18N("gt.callookDX3") + "<br>"];
      html.push(
        "<br>" + I18N("gt.callookDX4") + " <font color='orange'> " +
        callsign +
        "</font> " + I18N("gt.callookDX5") + " <font color='yellow'> " +
        where +
        "</font><br>");
      html.push(
        "<br><br>" + I18N("gt.callookDX6") + "<br>");
      html.push(I18N("gt.callookDX7") + "<br></center>");

      setLookupDiv("lookupInfoDiv", html.join(""));
    }
  }
}

function callookResults(buffer, gridPass)
{
  try {
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
          results.current.callsign +
          "\");'>C A L L O O K</div></b></font></td></tr>";
        cacheLookupObject(callObject, gridPass, true);
      }
      else if (results.status == "INVALID")
      {
        setLookupDiv("lookupInfoDiv", "Invalid Lookup");
      }
      else
      {
        setLookupDiv("lookupInfoDiv", "Server is down for maintenance");
      }
    }
    else setLookupDiv("lookupInfoDiv", "Unknown Lookup Error");
  }
  catch (e)
  {
  }
}

function GetSessionID(resultTd, useCache)
{
  if (GT.settings.map.offlineMode == true) return;
  if (resultTd != null) resultTd.innerHTML = "Testing";
  if (GT.settings.app.lookupService == "QRZCQ")
  {
    getBuffer(
      "https://ssl.qrzcq.com/xml?username=" +
      GT.settings.app.lookupLoginCq +
      "&password=" +
      encodeURIComponent(GT.settings.app.lookupPasswordCq) +
      "&agent=GridTracker1.18",
      qrzGetSessionCallback,
      resultTd,
      "https",
      443,
      useCache
    );
  }
  else if (GT.settings.app.lookupService == "QRZ")
  {
    getBuffer(
      "https://xmldata.qrz.com/xml/current/?username=" +
      GT.settings.app.lookupLoginQrz +
      ";password=" +
      encodeURIComponent(GT.settings.app.lookupPasswordQrz),
      qrzGetSessionCallback,
      resultTd,
      "https",
      443,
      useCache
    );
  }
  else
  {
    getBuffer(
      "https://www.hamqth.com/xml.php?u=" +
      GT.settings.app.lookupLoginQth +
      "&p=" +
      encodeURIComponent(GT.settings.app.lookupPasswordQth),
      hamQthGetSessionCallback,
      resultTd,
      "https",
      443,
      useCache
    );
  }
}



function SessionResponse(newKey, result, useCache)
{
  // for QRZCQ.com as well
  if (newKey == null)
  {
    setLookupDiv("lookupInfoDiv", result, useCache);
  }
  else
  {
    GetLookup(useCache);
  }
}

function GetLookup(useCache)
{
  if (GT.settings.app.lookupService == "QRZCQ")
  {
    getBuffer(
      "https://ssl.qrzcq.com/xml?s=" +
      GT.qrzLookupSessionId +
      "&callsign=" +
      encodeURIComponent(GT.qrzLookupCallsign) +
      "&agent=GridTracker",
      qrzLookupResults,
      GT.qrzLookupGrid,
      "https",
      443,
      useCache
    );
  }
  else if (GT.settings.app.lookupService == "QRZ")
  {
    getBuffer(
      "http://xmldata.qrz.com/xml/current/?s=" +
      GT.qrzLookupSessionId +
      ";callsign=" +
      encodeURIComponent(GT.qrzLookupCallsign) ,
      qrzLookupResults,
      GT.qrzLookupGrid,
      "http",
      80,
      useCache
    );
  }
  else
  {
    getBuffer(
      "https://www.hamqth.com/xml.php?id=" +
      GT.qrzLookupSessionId +
      "&callsign=" +
      encodeURIComponent(GT.qrzLookupCallsign)  +
      "&prg=GridTracker",
      qthHamLookupResults,
      GT.qrzLookupGrid,
      "https",
      443,
      useCache
    );
  }
}

function hamQthGetSessionCallback(buffer, resultTd, useCache)
{
  const oParser = new DOMParser();
  const oDOM = oParser.parseFromString(buffer, "text/xml");
  let result = "";

  // DOMParser never returns null; malformed XML yields a <parsererror> node
  if (oDOM.getElementsByTagName("parsererror").length > 0)
  {
    result = "<font color='red'>Unknown Error</font>";
    GT.qrzLookupSessionId = null;
  }
  else
  {
    const json = XML2jsobj(oDOM.documentElement);

    if (!json.hasOwnProperty("session"))
    {
      result = "<font color='red'>Invalid Response</font>";
      GT.qrzLookupSessionId = null;
    }
    else if (json.session.hasOwnProperty("session_id"))
    {
      result = "<font color='green'>Valid</font>";
      GT.qrzLookupSessionId = json.session.session_id;
    }
    else
    {
      result = "<font color='red'>" + (json.session.error || "Unknown Error") + "</font>";
      GT.qrzLookupSessionId = null;
    }
  }

  if (resultTd == null)
  {
    // It's a true session Request
    SessionResponse(GT.qrzLookupSessionId, result, useCache);
    return;
  }

  // Settings "Test" button: never keep a session from a test
  GT.qrzLookupSessionId = null;
  resultTd.innerHTML = result;
}

function qrzGetSessionCallback(buffer, resultTd, useCache)
{
  const oParser = new DOMParser();
  const oDOM = oParser.parseFromString(buffer, "text/xml");
  let result = "";

  // DOMParser never returns null; malformed XML yields a <parsererror> node
  if (oDOM.getElementsByTagName("parsererror").length > 0)
  {
    result = "<font color='red'>Unknown Error</font>";
    GT.qrzLookupSessionId = null;
  }
  else
  {
    const json = XML2jsobj(oDOM.documentElement);

    if (!json.hasOwnProperty("Session"))
    {
      result = "<font color='red'>Invalid Response</font>";
      GT.qrzLookupSessionId = null;
    }
    else if (json.Session.hasOwnProperty("Key"))
    {
      result = "<font color='green'>Valid</font>";
      GT.qrzLookupSessionId = json.Session.Key;
    }
    else
    {
      result = "<font color='red'>" + (json.Session.Error || "Unknown Error") + "</font>";
      GT.qrzLookupSessionId = null;
    }
  }

  if (resultTd == null)
  {
    // It's a true session Request
    SessionResponse(GT.qrzLookupSessionId, result, useCache);
    return;
  }

  resultTd.innerHTML = result;
}

function qthHamLookupResults(buffer, gridPass, useCache)
{
  const oParser = new DOMParser();
  const oDOM = oParser.parseFromString(buffer, "text/xml");

  // DOMParser never returns null; malformed XML yields a <parsererror> node
  if (oDOM.getElementsByTagName("parsererror").length > 0)
  {
    setLookupDiv("lookupInfoDiv", String(buffer));
    GT.qrzLookupSessionId = null;
    return;
  }

  const json = XML2jsobj(oDOM.documentElement);

  if (!json.hasOwnProperty("search"))
  {
    GT.qrzLookupSessionId = null;
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

  cacheLookupObject(json.search, gridPass, true);
}


function qrzLookupResults(buffer, gridPass, useCache)
{
  let oParser = new DOMParser();
  let oDOM = oParser.parseFromString(buffer, "text/xml");

  // DOMParser never returns null; malformed XML yields a <parsererror> node
  if (oDOM.getElementsByTagName("parsererror").length > 0)
  {
    setLookupDiv("lookupInfoDiv", String(buffer));
    GT.qrzLookupSessionId = null;
    return;
  }

  let json = XML2jsobj(oDOM.documentElement);

  if (!json.hasOwnProperty("Callsign"))
  {
    setLookupDiv(
      "lookupInfoDiv",
      "<br><b>" + I18N("gt.lookup.NoResult") + "</b><br><br>"
    );
    GT.qrzLookupSessionId = null;
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

  json.Callsign.source =
    "<tr><td>Source</td><td><font color='orange'><b><div style='cursor:pointer' onClick='window.opener.openSite(\"" +
    url +
    "\");'>" +
    label +
    "</div></b></font></td></tr>";

  if (gridPass) json.Callsign.gtGrid = gridPass;

  cacheLookupObject(json.Callsign, gridPass, true);
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

function cacheLookupObject(lookup, gridPass, cacheable = false)
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
      if (!(lookup.county.startsWith(lookup.state + ","))) {
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

  if (lookup.call && lookup.grid) {
    if (GT.instances) {
      for (const instKey in GT.instances) {
        const inst = GT.instances[instKey];
        if (inst && inst.status && inst.status.Band && inst.status.MO) {
          const hash = lookup.call + inst.status.Band + inst.status.MO;
          const entry = GT.liveCallsigns[hash];
          if (entry) {
            if (!entry.grid) {
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
    lookup.cached = timeNowSec();
    addLookupObjectToCache(lookup);
  }

  displayLookupObject(lookup, gridPass, !cacheable);
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
      arr.push(`<tr${extra}><td>${label}</td><td>${value}</td></tr>`);
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
    cardRows.push(`<tr><td>${addrAttn}</td></tr>`);
  }

  cardRows.push(
    `<tr><td><b>${name}</b></td></tr>`,
    `<tr><td>${addr1}</td></tr>`,
    `<tr><td>${addr2}</td></tr>`,
    `<tr><td>${country}</td></tr>`,
    `<tr><td>${
      email.length > 0
        ? `<div style='cursor:pointer;font-weight:bold;vertical-align:top' onclick='window.opener.mailThem("${email}");'>${email}</div>`
        : ""
    }</td></tr>`
  );

  const card = `
    <div class='mapItem' id='callCard' style='top:0;padding:4px;'>
      <table title='Click to copy address to clipboard' onclick='setClipboardFromLookup();' style='cursor:pointer'>
        <tr>
          <td style='font-size:36pt;color:cyan;font-weight:bold'>${formatCallsign(call)}</td>
          <td align='center' style='margin:0;padding:0'>
            ${lookup.dxcc > 0 && lookup.dxcc in GT.dxccInfo
              ? `<img style='padding-top:4px' src='img/flags/24/${GT.dxccInfo[lookup.dxcc].flag}'>`
              : ""}
          </td>
          <td rowspan='6'>
            ${image.length > 0
              ? `<img style='border:1px solid gray' class='roundBorder' width='220px' src='${image}'>`
              : ""}
          </td>
        </tr>
        ${cardRows.join("")}
      </table>
    </div>`;

  const detailsRows = ["<tr><th colspan='2'>Details</th></tr>"];

  if (url.length > 0)
  {
    detailsRows.push(
      `<tr><td>Website</td><td><font color='orange'><b><div style='cursor:pointer' onClick='window.opener.openSite("${url}");'>Link</div></b></font></td></tr>`
    );
  }

  if (Number(p("bio")) > 0)
  {
    detailsRows.push(
      `<tr><td>Biography</td><td><font color='orange'><b><div style='cursor:pointer' onClick='window.opener.openSite("https://www.qrz.com/db/${p("call")}");'>Link</div></b></font></td></tr>`
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
  addRowIf(detailsRows, "Aliases", aliases, ` title='${aliases}'`);

  detailsRows.push(
    makeRow("Polish OT", lookup, "plot"),
    makeRow("German DOK", lookup, "dok"),
    makeYesNoRow("DOK is Sonder-DOK", lookup, "sondok"),
    `<tr><td>DXCC</td><td>${p("dxcc")} - ${GT.dxccToAltName[p("dxcc")]}</td></tr>`,
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
        <div title='Generate Messages' class='button' onclick='window.opener.setCallAndGrid("${p("call")}","${grid}");'>Generate Messages</div>
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

function addTextToClipboard(data)
{
  navigator.clipboard.writeText(data);
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
      return ("<tr><td>" + first + "</td><td title='Copy to clipboard' style='cursor:pointer;font-weight:bold;" + style + "' onClick='addTextToClipboard(\"" + object[key] + "\")'>" + object[key] + "</td></tr>");
    }
    else
    {
      return ("<tr><td>" + first + "</td><td>" + object[key].substr(0, 45) + "</td></tr>");
    }
  }
  return "";
}

function getLookProp(object, key)
{
  return object.hasOwnProperty(key) ? object[key] : "";
}

function joinSpaceIf(camera1, camera2)
{
  if (camera1.length > 0 && camera2.length > 0) return camera1 + " " + camera2;
  if (camera1.length > 0) return camera1;
  if (camera2.length > 0) return camera2;
  return "";
}

function joinCommaIf(camera1, camera2)
{
  if (camera1.length > 0 && camera2.length > 0)
  {
    if (camera1.indexOf(",") > -1) return camera1 + " " + camera2;
    else return camera1 + ", " + camera2;
  }
  if (camera1.length > 0) return camera1;
  if (camera2.length > 0) return camera2;
  return "";
}

function joinIfBothWithDash(camera1, camera2)
{
  if (camera1.length > 0 && camera2.length > 0) { return camera1 + " / " + camera2; }
  return "";
}

function startLookup(call, grid)
{
  if (call == "-") return;
  if (grid == "-") grid = "";

  openLookupWindow(true);

  lookupCallsign(call, grid);
}
