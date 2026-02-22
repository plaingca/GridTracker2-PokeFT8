// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

GT.lotwCallsigns = Object();
GT.lotwFile = "";
GT.lotwWhenDate = 0;
GT.lotwLoadTimer = null;

GT.eqslCallsigns = Object();
GT.eqslFile = "";
GT.eqslWhenDate = 0;
GT.eqslLoadTimer = null;

GT.ulsCallsigns = Object();
GT.ulsCallsignsCount = 0;
GT.ulsLoadTimer = null;
GT.ulsFile = "";

GT.cacCallsigns = Object();
GT.cacFile = "";
GT.cacWhenDate = 0;
GT.cacLoadTimer = null;

GT.oqrsCallsigns = Object();
GT.oqrsFile = "";
GT.oqrsWhenDate = 0;
GT.oqrsLoadTimer = null;

function dumpFile(file)
{
  try
  {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  catch (e) {}
}

function dumpDir(dir)
{
  try
  {
    if (fs.existsSync(dir)) fs.rmdirSync(dir);
  }
  catch (e) {}
}

function callsignServicesInit()
{
  GT.lotwFile = path.join(GT.appData, "lotw-ts-callsigns.json");
  GT.eqslFile = path.join(GT.appData, "eqsl-callsigns.json");
  GT.oqrsFile = path.join(GT.appData, "cloqrs-callsigns.json");
  GT.cacFile = path.join(GT.appData, "canada-callsigns.txt");
  GT.ulsFile = path.join(GT.appData, "uls-callsigns.txt");

  if (GT.settings.callsignLookups.lotwUseEnable)
  {
    lotwLoadCallsigns();
  }
  if (GT.settings.callsignLookups.eqslUseEnable)
  {
    eqslLoadCallsigns();
  }
  if (GT.settings.callsignLookups.ulsUseEnable)
  {
    ulsLoadCallsigns();
  }
  if (GT.settings.callsignLookups.cacUseEnable)
  {
    cacLoadCallsigns();
  }
  if (GT.settings.callsignLookups.oqrsUseEnable)
  {
    oqrsLoadCallsigns();
  }

  lotwSettingsDisplay();
  eqslSettingsDisplay();
  ulsSettingsDisplay();
  cacSettingsDisplay();
  oqrsSettingsDisplay();
}

function lotwLoadCallsigns()
{
  var now = timeNowSec();
  if (now - GT.settings.callsignLookups.lotwLastUpdate > 86400 * 7)
  { GT.settings.callsignLookups.lotwLastUpdate = 0; }
  else
  {
    var lotwWhenTimer = 86400 * 7 - (now - GT.settings.callsignLookups.lotwLastUpdate);
    GT.lotwWhenDate = now + lotwWhenTimer;
    GT.lotwLoadTimer = nodeTimers.setTimeout(lotwDownload, lotwWhenTimer * 1000);
  }

  try
  {
    if (!fs.existsSync(GT.lotwFile))
    {
      GT.settings.callsignLookups.lotwLastUpdate = 0;
    }
    else
    {
      GT.lotwCallsigns = require(GT.lotwFile);
      if (Object.keys(GT.lotwCallsigns).length < 100)
      {
        lotwDownload();
      }
    }
    if (GT.settings.callsignLookups.lotwLastUpdate == 0)
    {
      lotwDownload();
    }
  }
  catch (e)
  {
    logError(e);
    GT.settings.callsignLookups.lotwLastUpdate = 0;
    lotwDownload();
  }
}

function lotwSettingsDisplay()
{
  lotwUseEnable.checked = GT.settings.callsignLookups.lotwUseEnable;

  if (GT.settings.callsignLookups.lotwLastUpdate == 0)
  {
    lotwUpdatedTd.innerHTML = "Never";
  }
  else
  {
    lotwUpdatedTd.innerHTML = userTimeString(
      GT.settings.callsignLookups.lotwLastUpdate * 1000
    );
  }

  if (!GT.settings.callsignLookups.lotwUseEnable)
  {
    if (GT.lotwLoadTimer != null) nodeTimers.clearTimeout(GT.lotwLoadTimer);
    GT.lotwLoadTimer = null;
    GT.lotwCallsigns = Object();
  }
  lotwCountTd.innerHTML = Object.keys(GT.lotwCallsigns).length;
}

function removeLotwFile()
{
  try
  {
    fs.unlinkSync(GT.lotwFile);
  }
  catch (err)
  {
    // handle the error
  }
  GT.settings.callsignLookups.lotwLastUpdate = 0;
  if (GT.lotwLoadTimer != null)
  {
    nodeTimers.clearTimeout(GT.lotwLoadTimer);
    GT.lotwLoadTimer = null;
  }
}

function lotwValuesChanged()
{
  let wasEnabled = GT.settings.callsignLookups.lotwUseEnable;
  GT.settings.callsignLookups.lotwUseEnable = lotwUseEnable.checked;
  
  if (GT.settings.callsignLookups.lotwUseEnable == true)
  {
    if (wasEnabled == false)
    {
      removeLotwFile();
    }
    lotwLoadCallsigns();
  }
  else
  {
    removeLotwFile();
    lotwSettingsDisplay();
  }

  setVisualHunting();

}

function lotwDownload(fromSettings)
{
  lotwUpdatedTd.innerHTML = "<b><i>Downloading...</i></b>";
  getBuffer(
    "https://lotw.arrl.org/lotw-user-activity.csv",
    processLotwCallsigns,
    null,
    "https",
    443
  );
}

function processLotwCallsigns(buffer, flag)
{
  let result = String(buffer);
  let lines = result.split("\n");

  let lotwCallsigns = Object();
  for (x in lines)
  {
    let breakout = lines[x].split(",");
    if (breakout.length == 3)
    {
      let dateTime = new Date(
        Date.UTC(
          breakout[1].substr(0, 4),
          parseInt(breakout[1].substr(5, 2)) - 1,
          breakout[1].substr(8, 2),
          0,
          0,
          0
        )
      );
      lotwCallsigns[breakout[0]] = parseInt(dateTime.getTime() / 1000) / 86400;
    }
  }

  GT.settings.callsignLookups.lotwLastUpdate = timeNowSec();
  

  let now = timeNowSec();
  if (GT.lotwLoadTimer != null) nodeTimers.clearTimeout(GT.lotwLoadTimer);

  let lotwWhenTimer = 86400 * 7 - (now - GT.settings.callsignLookups.lotwLastUpdate);
  GT.lotwWhenDate = now + lotwWhenTimer;
  GT.lotwLoadTimer = nodeTimers.setTimeout(lotwDownload, lotwWhenTimer * 1000);

  if (Object.keys(lotwCallsigns).length > 100)
  {
    GT.lotwCallsigns = lotwCallsigns;
    fs.writeFileSync(GT.lotwFile, JSON.stringify(GT.lotwCallsigns), { flush: true });
  }

  lotwSettingsDisplay();
}

function cacLoadCallsigns()
{
  let now = timeNowSec();
  if (now - GT.settings.callsignLookups.cacLastUpdate > 86400 * 7)
  { GT.settings.callsignLookups.cacLastUpdate = 0; }
  else
  {
    let cacWhenTimer = 86400 * 7 - (now - GT.settings.callsignLookups.cacLastUpdate);
    GT.cacWhenDate = now + cacWhenTimer;
    GT.cacLoadTimer = nodeTimers.setTimeout(cacDownload, cacWhenTimer * 1000);
  }

  try
  {
    if (!fs.existsSync(GT.cacFile))
    {
      GT.settings.callsignLookups.cacLastUpdate = 0;
    }
    else
    {
      parseCacCallsigns(fs.readFileSync(GT.cacFile, "UTF-8"));
    }
    if (GT.settings.callsignLookups.cacLastUpdate == 0)
    {
      cacDownload();
    }
  }
  catch (e)
  {
    GT.settings.callsignLookups.cacLastUpdate = 0;
    cacDownload();
  }
}

function parseCacCallsigns(data)
{
  let callsignRows = data.split("\n");
  for (let x = 0; x < callsignRows.length; x++)
  {
    if (callsignRows[x].length > 1)
    {
      GT.cacCallsigns[callsignRows[x].substr(8)] = callsignRows[x].substr(6, 2);
    }
  }
  fs.writeFileSync(GT.cacFile, data, "UTF-8", { flush: true });
}

function processCacCallsigns(buffer, flag)
{
  let data = (typeof buffer == "object") ? String(buffer) : buffer;
  parseCacCallsigns(data);

  GT.settings.callsignLookups.cacLastUpdate = timeNowSec();
  

  var now = timeNowSec();
  if (GT.cacLoadTimer != null) nodeTimers.clearTimeout(GT.cacLoadTimer);

  var cacWhenTimer = 86400 * 7 - (now - GT.settings.callsignLookups.cacLastUpdate);
  GT.cacWhenDate = now + cacWhenTimer;
  GT.cacLoadTimer = nodeTimers.setTimeout(cacDownload, cacWhenTimer * 1000);

  cacSettingsDisplay();
}

function cacDownload(fromSettings)
{
  cacUpdatedTd.innerHTML = "<b><i>Downloading...</i></b>";
  getBuffer(
    "https://app2.gridtracker.org/dbs/canada.txt",
    processCacCallsigns,
    null,
    "https",
    443
  );
}

function cacSettingsDisplay()
{
  cacUseEnable.checked = GT.settings.callsignLookups.cacUseEnable;

  if (GT.settings.callsignLookups.cacLastUpdate == 0)
  {
    cacUpdatedTd.innerHTML = "Never";
  }
  else
  {
    cacUpdatedTd.innerHTML = userTimeString(GT.settings.callsignLookups.cacLastUpdate * 1000);
  }

  if (!GT.settings.callsignLookups.cacUseEnable)
  {
    if (GT.cacLoadTimer != null) nodeTimers.clearTimeout(GT.cacLoadTimer);
    GT.cacLoadTimer = null;
    GT.cacCallsigns = Object();
    for (const key in GT.liveCallsigns)
    {
      if (GT.liveCallsigns[key].dxcc == 1) GT.liveCallsigns[key].state = null;
    }
  }
  cacCountTd.innerHTML = Object.keys(GT.cacCallsigns).length;
}

function removeCacFile()
{
  try
  {
    fs.unlinkSync(GT.cacFile);
  }
  catch (err)
  {
    // handle the error
  }
  GT.settings.callsignLookups.cacLastUpdate = 0;
  if (GT.cacLoadTimer != null)
  {
    nodeTimers.clearTimeout(GT.cacLoadTimer);
    GT.cacLoadTimer = null;
  }
}

function cacValuesChanged()
{
  let wasEnabled = GT.settings.callsignLookups.cacUseEnable;
  GT.settings.callsignLookups.cacUseEnable = cacUseEnable.checked;
  
  if (GT.settings.callsignLookups.cacUseEnable == true)
  {
    if (wasEnabled == false)
    {
      removeCacFile();
    }
    cacLoadCallsigns();
  }
  else
  {
    removeCacFile();
    cacSettingsDisplay();
  }
}

function oqrsLoadCallsigns()
{
  var now = timeNowSec();
  if (now - GT.settings.callsignLookups.oqrsLastUpdate > 86400 * 7)
  { GT.settings.callsignLookups.oqrsLastUpdate = 0; }
  else
  {
    var oqrsWhenTimer = 86400 * 7 - (now - GT.settings.callsignLookups.oqrsLastUpdate);
    GT.oqrsWhenDate = now + oqrsWhenTimer;
    GT.oqrsLoadTimer = nodeTimers.setTimeout(oqrsDownload, oqrsWhenTimer * 1000);
  }

  try
  {
    if (!fs.existsSync(GT.oqrsFile))
    {
      GT.settings.callsignLookups.oqrsLastUpdate = 0;
    }
    else
    {
      GT.oqrsCallsigns = require(GT.oqrsFile);
    }
    if (GT.settings.callsignLookups.oqrsLastUpdate == 0)
    {
      oqrsDownload();
    }
  }
  catch (e)
  {
    GT.settings.callsignLookups.oqrsLastUpdate = 0;
    oqrsDownload();
  }
}

function oqrsSettingsDisplay()
{
  oqrsUseEnable.checked = GT.settings.callsignLookups.oqrsUseEnable;

  if (GT.settings.callsignLookups.oqrsLastUpdate == 0)
  {
    oqrsUpdatedTd.innerHTML = "Never";
  }
  else
  {
    oqrsUpdatedTd.innerHTML = userTimeString(
      GT.settings.callsignLookups.oqrsLastUpdate * 1000
    );
  }

  if (!GT.settings.callsignLookups.oqrsUseEnable)
  {
    if (GT.oqrsLoadTimer != null) nodeTimers.clearTimeout(GT.oqrsLoadTimer);
    GT.oqrsLoadTimer = null;
    GT.oqrsCallsigns = Object();
  }
  oqrsCountTd.innerHTML = Object.keys(GT.oqrsCallsigns).length;
}

function removeOqrsFile()
{
  try
  {
    fs.unlinkSync(GT.oqrsFile);
  }
  catch (err)
  {
    // handle the error
  }
  GT.settings.callsignLookups.oqrsLastUpdate = 0;
  if (GT.oqrsLoadTimer != null)
  {
    nodeTimers.clearTimeout(GT.oqrsLoadTimer);
    GT.oqrsLoadTimer = null;
  }
}

function oqrsValuesChanged()
{
  let wasEnabled = GT.settings.callsignLookups.oqrsUseEnable;
  GT.settings.callsignLookups.oqrsUseEnable = oqrsUseEnable.checked;
  
  if (GT.settings.callsignLookups.oqrsUseEnable == true)
  {
    if (wasEnabled == false)
    {
      removeOqrsFile();
    }
    oqrsLoadCallsigns();
  }
  else
  {
    removeOqrsFile();
    oqrsSettingsDisplay();
  }

  setVisualHunting();
}

function oqrsDownload(fromSettings)
{
  oqrsUpdatedTd.innerHTML = "<b><i>Downloading...</i></b>";
  getBuffer(
    "https://app2.gridtracker.org/dbs/clublog.json",
    processoqrsCallsigns,
    null,
    "https",
    443
  );
}

function processoqrsCallsigns(buffer, flag)
{
  GT.oqrsCallsigns = JSON.parse(buffer);

  GT.settings.callsignLookups.oqrsLastUpdate = timeNowSec();
  

  var now = timeNowSec();
  if (GT.oqrsLoadTimer != null) nodeTimers.clearTimeout(GT.oqrsLoadTimer);

  var oqrsWhenTimer = 86400 * 7 - (now - GT.settings.callsignLookups.oqrsLastUpdate);
  GT.oqrsWhenDate = now + oqrsWhenTimer;
  GT.oqrsLoadTimer = nodeTimers.setTimeout(oqrsDownload, oqrsWhenTimer * 1000);

  fs.writeFileSync(GT.oqrsFile, JSON.stringify(GT.oqrsCallsigns), { flush: true });
  oqrsSettingsDisplay();
}

function eqslLoadCallsigns()
{
  var now = timeNowSec();
  if (now - GT.settings.callsignLookups.eqslLastUpdate > 86400 * 7)
  { GT.settings.callsignLookups.eqslLastUpdate = 0; }
  else
  {
    var eqslWhenTimer = 86400 * 7 - (now - GT.settings.callsignLookups.eqslLastUpdate);
    GT.eqslWhenDate = now + eqslWhenTimer;
    GT.eqslLoadTimer = nodeTimers.setTimeout(eqslDownload, eqslWhenTimer * 1000);
  }

  try
  {
    if (!fs.existsSync(GT.eqslFile))
    {
      GT.settings.callsignLookups.eqslLastUpdate = 0;
    }
    else
    {
      GT.eqslCallsigns = require(GT.eqslFile);
    }
    if (GT.settings.callsignLookups.eqslLastUpdate == 0)
    {
      eqslDownload();
    }
  }
  catch (e)
  {
    logError(e);
    GT.settings.callsignLookups.eqslLastUpdate = 0;
    eqslDownload();
  }
}

function eqslSettingsDisplay()
{
  eqslUseEnable.checked = GT.settings.callsignLookups.eqslUseEnable;

  if (GT.settings.callsignLookups.eqslLastUpdate == 0)
  {
    eqslUpdatedTd.innerHTML = "Never";
  }
  else
  {
    eqslUpdatedTd.innerHTML = userTimeString(
      GT.settings.callsignLookups.eqslLastUpdate * 1000
    );
  }

  if (!GT.settings.callsignLookups.eqslUseEnable)
  {
    if (GT.eqslLoadTimer != null) nodeTimers.clearTimeout(GT.eqslLoadTimer);
    GT.eqslLoadTimer = null;
    GT.eqslCallsigns = Object();
  }
  eqslCountTd.innerHTML = Object.keys(GT.eqslCallsigns).length;
}

function removeEqslFile()
{
  try
  {
    fs.unlinkSync(GT.eqslFile);
  }
  catch (err)
  {
    // handle the error
  }
  GT.settings.callsignLookups.eqslLastUpdate = 0;
  if (GT.eqslLoadTimer != null)
  {
    nodeTimers.clearTimeout(GT.eqslLoadTimer);
    GT.eqslLoadTimer = null;
  }
}

function eqslValuesChanged()
{
  let wasEnabled = GT.settings.callsignLookups.eqslUseEnable;
  GT.settings.callsignLookups.eqslUseEnable = eqslUseEnable.checked;
  
  if (GT.settings.callsignLookups.eqslUseEnable == true)
  {
    if (wasEnabled == false)
    {
      removeEqslFile();
    }
    eqslLoadCallsigns();
  }
  else
  {
    removeEqslFile();
    eqslSettingsDisplay();
  }

  setVisualHunting();
}

function eqslDownload(fromSettings)
{
  eqslUpdatedTd.innerHTML = "<b><i>Downloading...</i></b>";
  getBuffer(
    "https://www.eqsl.cc/qslcard/DownloadedFiles/AGMemberList.txt",
    processeqslCallsigns,
    null,
    "https",
    443
  );
}

function processeqslCallsigns(buffer, flag)
{
  var result = String(buffer);
  var lines = Array();
  lines = result.split("\n");
  GT.eqslCallsigns = Object();
  for (x in lines)
  {
    GT.eqslCallsigns[lines[x].trim()] = true;
  }
  GT.settings.callsignLookups.eqslLastUpdate = timeNowSec();
  

  var now = timeNowSec();
  if (GT.eqslLoadTimer != null) nodeTimers.clearTimeout(GT.eqslLoadTimer);

  var eqslWhenTimer = 86400 * 7 - (now - GT.settings.callsignLookups.eqslLastUpdate);
  GT.eqslWhenDate = now + eqslWhenTimer;
  GT.eqslLoadTimer = nodeTimers.setTimeout(eqslDownload, eqslWhenTimer * 1000);

  if (Object.keys(GT.eqslCallsigns).length > 10000)
  { fs.writeFileSync(GT.eqslFile, JSON.stringify(GT.eqslCallsigns), { flush: true }); }

  eqslSettingsDisplay();
}

function ulsLoadCallsigns()
{
  var now = timeNowSec();
  if (now - GT.settings.callsignLookups.ulsLastUpdate > 86400 * 7) ulsDownload();
  else
  {
    if (!fs.existsSync(GT.ulsFile))
    {
      GT.settings.callsignLookups.ulsLastUpdate = 0;
      ulsDownload();
    }
    else
    {
      loadULSFile();
    }
  }
}

function stateCheck()
{
  if (GT.settings.callsignLookups.ulsUseEnable)
  {
    for (let hash in GT.QSOhash)
    {
      let details = GT.QSOhash[hash];
      if (isKnownCallsignUSplus(details.dxcc))
      {
        let lookupCall = false;
        if ((details.cnty == null || details.state == null))
        {
          lookupCall = true;
        }
        else if (details.cnty != null)
        {
          if (!(details.cnty in GT.cntyToCounty))
          {
            if (details.cnty.indexOf(",") == -1)
            {
              if (!(details.state + "," + details.cnty in GT.cntyToCounty))
              {
                lookupCall = true;
              }
            }
            else
            {
              lookupCall = true;
            }
          }
        }
        if (lookupCall == true)
        {
          lookupKnownCallsign(details);
        }
      }
    }
  }

  if (GT.settings.callsignLookups.cacUseEnable)
  {
    for (let hash in GT.QSOhash)
    {
      let details = GT.QSOhash[hash];
      if (details.dxcc == 1 && details.state == null)
      {
        if (details.DEcall in GT.cacCallsigns)
        {
          details.state = "CA-" + GT.cacCallsigns[details.DEcall];
        }
      }
    }
  }
}

function updateCallsignCount()
{
  GT.ulsCallsignsCount = Object.keys(GT.ulsCallsigns).length;
  ulsCountTd.innerHTML = GT.ulsCallsignsCount;
}

function ulsSettingsDisplay()
{
  ulsUseEnable.checked = GT.settings.callsignLookups.ulsUseEnable;

  if (GT.settings.callsignLookups.ulsLastUpdate == 0)
  {
    ulsUpdatedTd.innerHTML = "Never";
  }
  else
  {
    ulsUpdatedTd.innerHTML = userTimeString(GT.settings.callsignLookups.ulsLastUpdate * 1000);
  }

  if (!GT.settings.callsignLookups.ulsUseEnable)
  {
    GT.ulsCallsignsCount = 0;
    ulsCountTd.innerHTML = GT.ulsCallsignsCount;
  }
}

function removeUlsFile()
{
  try
  {
    fs.unlinkSync(GT.ulsFile);
  }
  catch (err)
  {
    // handle the error
  }
  GT.settings.callsignLookups.eqslLastUpdate = 0;
  if (GT.ulsLoadTimer != null)
  {
    nodeTimers.clearTimeout(GT.ulsLoadTimer);
    GT.ulsLoadTimer = null;
  }
}

function ulsValuesChanged()
{
  GT.settings.callsignLookups.ulsUseEnable = ulsUseEnable.checked;
 
  if (GT.settings.callsignLookups.ulsUseEnable == true)
  {
    ulsLoadCallsigns();
  }
  else
  {
    removeUlsFile();
    resetULSDatabase();
    ulsSettingsDisplay();
    ulsCountTd.innerHTML = 0;
  }
  
  setVisualHunting();
}

function ulsDownload()
{
  ulsUpdatedTd.innerHTML = "<b><i>Downloading...</i></b>";
  ulsCountTd.innerHTML = 0;
  getBuffer(
    "https://app2.gridtracker.org/dbs/us.txt",
    ulsDownloadHandler,
    null,
    "https",
    443
  );
}

function resetULSDatabase()
{
  GT.settings.callsignLookups.ulsLastUpdate = 0;
  GT.ulsCallsignsCount = 0;
  GT.ulsCallsigns = {};

  
}

function ulsDownloadHandler(data)
{
  fs.writeFileSync(GT.ulsFile, data, { flush: true });

  GT.settings.callsignLookups.ulsLastUpdate = timeNowSec();
  
  loadULSFile();
}

function loadULSFile()
{
  ulsUpdatedTd.innerHTML = "<b><i>Processing...</i></b>";
  fs.readFile(GT.ulsFile, "utf-8", processulsCallsigns);
}

function processulsCallsigns(error, buffer)
{
  if (error)
  {
    logError("File Read Error: " + error);
  }

  if (buffer && buffer.length > 0)
  {
    GT.ulsCallsigns = {};

    var startPos = 0;
    var endPos = buffer.length;
    while (startPos != endPos)
    {
      let eol = buffer.substring(startPos).indexOf("\n");
      if (eol > -1)
      {
        let row = buffer.substring(startPos, startPos + eol);
        GT.ulsCallsigns[row.substring(7)] = row.substring(0, 7);
        startPos += eol + 1; // skip \n
      }
      else
      {
        break;
      }
    }
  }

  updateCallsignCount();
  ulsSettingsDisplay();

  if (GT.ulsLoadTimer != null)
  {
    nodeTimers.clearTimeout(GT.ulsLoadTimer);
    GT.ulsLoadTimer = null;
  }

  var whenTimer = (86400 * 7) - (timeNowSec() - GT.settings.callsignLookups.ulsLastUpdate);
  GT.ulsLoadTimer = nodeTimers.setTimeout(ulsDownload, whenTimer * 1000);
}

function lookupKnownCallsign(object)
{
  if (object.DEcall in GT.ulsCallsigns)
  {
    if (object.state == null)
    {
      object.state = "US-" + GT.ulsCallsigns[object.DEcall].substring(5);
    }
    object.zipcode = GT.ulsCallsigns[object.DEcall].substring(0, 5);
    
    if (object.cnty == null && object.zipcode in GT.zipToCounty)
    {
      var counties = GT.zipToCounty[object.zipcode];
      if (counties.length > 1)
      {
        object.qual = false;
      }
      else
      {
        object.qual = true;
      }
      object.cnty = counties[0];
    }
  }
}

function updateLookupsBigCtyUI()
{
  const dxccVersion = String(GT.dxccVersion);
  const year = parseInt(dxccVersion.substring(0,4));
  const month = parseInt(dxccVersion.substring(4,6)) - 1;
  const day = parseInt(dxccVersion.substring(6,8));

  let date = new Date(year, month, day);
  bigctyUpdatedTd.innerHTML = userTimeString(date.getTime());
}

GT.downloadingCtyDat = false;
GT.restartRequired = false;

function downloadCtyDat()
{
  if (GT.settings.map.offlineMode == true || GT.downloadingCtyDat == true) return;
  GT.downloadingCtyDat = true;
  bigctyUpdatedTd.innerHTML = "<b><i>Checking...</i></b>";
  bigctyDetailsTd.innerHTML = "";
  getBuffer(
    "https://app2.gridtracker.org/dbs/ctydatver.json",
    processCtyDatVer,
    null,
    "https",
    443
  );
}

function processCtyDatVer(buffer)
{
  let data = String(buffer);
  try
  {
    let ctydatver = JSON.parse(data);
    if (ctydatver && "version" in ctydatver)
    {
      GT.newDxccVersion = parseInt(ctydatver.version);

      if (GT.newDxccVersion > GT.dxccVersion)
      {
        bigctyUpdatedTd.innerHTML = "<b><i>Downloading...</i></b>";
        getBuffer(
          "https://app2.gridtracker.org/dbs/ctydat.json",
          processCtyDat,
          null,
          "https",
          443
        );
      }
      else
      {
        updateLookupsBigCtyUI();
        GT.downloadingCtyDat = false;
      }
    }
  }
  catch (e)
  {
    GT.downloadingCtyDat = false;
    bigctyUpdatedTd.innerHTML = "Version check";
    bigctyDetailsTd.innerHTML = "Error!";
    logError(e);
  }
}

function processCtyDat(buffer)
{
  GT.downloadingCtyDat = false;
  let data = String(buffer);
  try
  {
    let ctydata = JSON.parse(data);
    if (fs.existsSync(GT.asarDxccInfoPath))
    {
      let dxccInfo = JSON.parse(fs.readFileSync(GT.asarDxccInfoPath));
      if (291 in dxccInfo && 291 in ctydata)
      {
        updateDxccInfo(dxccInfo, ctydata);
        dxccInfo[0].version = GT.newDxccVersion;
        let toWrite = JSON.stringify(dxccInfo);
        fs.writeFileSync(GT.tempDxccInfoPath, toWrite, { flush: true });
        let stats = fs.statSync(GT.tempDxccInfoPath);
        if (stats.size == toWrite.length)
        {
          fs.unlinkSync(GT.dxccInfoPath);
          fs.renameSync(GT.tempDxccInfoPath, GT.dxccInfoPath);
          bigctyUpdatedTd.innerHTML = "<div style='color:cyan;font-weight:bold'>" + I18N("gt.NewVersion.Release") + "</div>";
          bigctyDetailsTd.innerHTML = "<div class='button' onclick='saveAndCloseApp(true)'>Restart</div>";
          addLastTraffic("<font style='color:yellow'>" + I18N("gt.NewVersion.Release") + " - Big CTY<br><div class='button' onclick='saveAndCloseApp(true)'>Restart</div></font>");
        }
        else
        {
          bigctyUpdatedTd.innerHTML = "<div style='color:orange;font-weight:bold'>" + stats.size + " : " + toWrite.length + "</div>";
          bigctyDetailsTd.innerHTML = "Mismatch!";
        }
      }
      else
      {
        bigctyUpdatedTd.innerHTML = "Invalid data";
        bigctyDetailsTd.innerHTML = "Corrupt!";
      }
    }
  }
  catch (e)
  {
    bigctyUpdatedTd.innerHTML = "Failed to parse";
    bigctyDetailsTd.innerHTML = "Error!";
    logError(e);
  }
}

function updateDxccInfo(dxccInfo, ctydata)
{
  for (const key in dxccInfo)
  {
    dxccInfo[key].ituzone = null;
    dxccInfo[key].cqzone = null;
    dxccInfo[key].prefixITU = {};
    dxccInfo[key].prefixCQ = {};
    dxccInfo[key].directITU = {};
    dxccInfo[key].directCQ = {};

    if (key in ctydata)
    {
      dxccInfo[key].cqzone = padNumber(Number(ctydata[key].cqzone), 2);
      dxccInfo[key].ituzone = padNumber(Number(ctydata[key].ituzone), 2);

      // Skip Guantanamo Bay, hand crafted with love
      if (key != "105")
      {
        dxccInfo[key].prefix = [];
        dxccInfo[key].direct = [];

        let arr = ctydata[key].prefix.substr(0, ctydata[key].prefix.length - 1).split(" ");
        for (const x in arr)
        {
          let test = arr[x];
          let direct = false;
          let cq = null;
          let itu = null;
          
          if (test.charAt(0) == "=")
          {
            direct = true;
            test = test.substr(1);
          }
          let cqTest = test.match(/\((.*)\)/);
          if (cqTest)
          {
            cq = padNumber(Number(cqTest[1]), 2);
          }
          let ituTest = test.match(/\[(.*)\]/);
          if (ituTest)
          {
            itu = padNumber(Number(ituTest[1]), 2);
          }

          let i = test.indexOf("(");
          if (i > -1)
          {
            test = test.substr(0, i);
          }
          i = test.indexOf("[");
          if (i > -1)
          {
            test = test.substr(0, i);
          }
          i = test.indexOf("<");
          if (i > -1)
          {
            test = test.substr(0, i);
          }
          i = test.indexOf("{");
          if (i > -1)
          {
            test = test.substr(0, i);
          }
          i = test.indexOf("~");
          if (i > -1)
          {
            test = test.substr(0, i);
          }
          
          if (direct)
          {
            dxccInfo[key].direct.push(test);
            if (cq)
            {
              dxccInfo[key].directCQ[test] = cq;
            }
            if (itu)
            {
              dxccInfo[key].directITU[test] = itu;
            }
          }
          else
          {
            dxccInfo[key].prefix.push(test);
            if (cq)
            {
              dxccInfo[key].prefixCQ[test] = cq;
            }
            if (itu)
            {
              dxccInfo[key].prefixITU[test] = itu;
            }
          }
        }
        dxccInfo[key].prefix = uniqueArrayFromArray(dxccInfo[key].prefix);
        dxccInfo[key].prefix.sort();
        dxccInfo[key].direct = uniqueArrayFromArray(dxccInfo[key].direct);
        dxccInfo[key].direct.sort();
      }
    }
  }
}