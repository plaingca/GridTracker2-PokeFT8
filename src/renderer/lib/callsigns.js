// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

GT.lotwCallsigns = {};
GT.eqslCallsigns = {};
GT.ulsCallsigns = {};
GT.cacCallsigns = {};
GT.oqrsCallsigns = {};

GT.lotwFile = ""; GT.eqslFile = ""; GT.ulsFile = ""; GT.cacFile = ""; GT.oqrsFile = "";
GT.lotwLoadTimer = null; GT.eqslLoadTimer = null; GT.ulsLoadTimer = null; GT.cacLoadTimer = null; GT.oqrsLoadTimer = null;
GT.ulsCallsignsCount = 0;

function dumpFile(file) {
  try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch (e) {}
}

function dumpDir(dir) {
  try { if (fs.existsSync(dir)) fs.rmdirSync(dir); } catch (e) {}
}

function callsignServicesInit() {
  GT.lotwFile = path.join(GT.appData, "lotw-ts-callsigns.json");
  GT.eqslFile = path.join(GT.appData, "eqsl-callsigns.json");
  GT.oqrsFile = path.join(GT.appData, "cloqrs-callsigns.json");
  GT.cacFile = path.join(GT.appData, "canada-callsigns.txt");
  GT.ulsFile = path.join(GT.appData, "uls-fz-callsigns.txt");

  // deprecated; we use the "Fips or Zips" format now
  tryToDeleteAppFile("uls-callsigns.txt");

  const lookups = GT.settings.callsignLookups;
  if (lookups.lotwUseEnable) lotwLoadCallsigns();
  if (lookups.eqslUseEnable) eqslLoadCallsigns();
  if (lookups.ulsUseEnable) ulsLoadCallsigns();
  if (lookups.cacUseEnable) cacLoadCallsigns();
  if (lookups.oqrsUseEnable) oqrsLoadCallsigns();

  lotwSettingsDisplay();
  eqslSettingsDisplay();
  ulsSettingsDisplay();
  cacSettingsDisplay();
  oqrsSettingsDisplay();
}

// --- SHARED HELPER FUNCTIONS (DRY) ---

function manageServiceTimer(servicePrefix, downloadFunc) {
  const now = timeNowSec();
  const lookups = GT.settings.callsignLookups;
  const lastUpdate = lookups[`${servicePrefix}LastUpdate`] || 0;
  const timerVar = `${servicePrefix}LoadTimer`;

  if (GT[timerVar]) {
    nodeTimers.clearTimeout(GT[timerVar]);
    GT[timerVar] = null;
  }

  // 7 days = 604800 seconds
  if (now - lastUpdate > 604800) {
    lookups[`${servicePrefix}LastUpdate`] = 0;
    return true; // Indicates we need to download
  } else {
    const whenTimer = 604800 - (now - lastUpdate);
    GT[`${servicePrefix}WhenDate`] = now + whenTimer;
    GT[timerVar] = nodeTimers.setTimeout(downloadFunc, whenTimer * 1000);
    return false; // Timer set, no immediate download needed
  }
}

function updateServiceUI(prefix, countOverride = null) {
  const lookups = GT.settings.callsignLookups;
  const isEnabled = lookups[`${prefix}UseEnable`];
  const lastUpdate = lookups[`${prefix}LastUpdate`];
  
  // Update Checkbox UI (Assuming global DOM elements like lotwUseEnable exist)
  const cb = globalThis[`${prefix}UseEnable`];
  if (cb) cb.checked = isEnabled;

  // Update Time UI
  const updatedTd = globalThis[`${prefix}UpdatedTd`];
  if (updatedTd) {
    updatedTd.innerHTML = lastUpdate === 0 ? "Never" : userTimeString(lastUpdate * 1000);
  }

  if (!isEnabled) {
    const timerVar = `${prefix}LoadTimer`;
    if (GT[timerVar]) {
      nodeTimers.clearTimeout(GT[timerVar]);
      GT[timerVar] = null;
    }
    GT[`${prefix}Callsigns`] = {};
  }

  // Update Count UI
  const countTd = globalThis[`${prefix}CountTd`];
  if (countTd) {
    countTd.innerHTML = countOverride !== null ? countOverride : Object.keys(GT[`${prefix}Callsigns`]).length;
  }
}

function toggleService(prefix, loadFunc, displayFunc) {
  const lookups = GT.settings.callsignLookups;
  const cb = globalThis[`${prefix}UseEnable`];
  const wasEnabled = lookups[`${prefix}UseEnable`];
  lookups[`${prefix}UseEnable`] = cb.checked;
  
  if (cb.checked) {
    if (!wasEnabled) dumpFile(GT[`${prefix}File`]);
    loadFunc();
  } else {
    dumpFile(GT[`${prefix}File`]);
    if (prefix === 'uls') resetULSDatabase();
    displayFunc();
    
    // Specific CAC cleanup rule
    if (prefix === 'cac') {
      for (const key in GT.liveCallsigns) {
        if (GT.liveCallsigns[key].dxcc === 1) GT.liveCallsigns[key].state = null;
      }
    }
  }
  if (typeof setVisualHunting === "function") setVisualHunting();
}

function loadJsonFileSafe(filePath) {
  try {
    // Replaced require() with fs.readFileSync to prevent memory leaks in Node/Electron
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) { console.error(e); }
  return {};
}

// --- LOTW ---
function lotwLoadCallsigns() {
  const needsDownload = manageServiceTimer("lotw", lotwDownload);
  if (!needsDownload) {
    GT.lotwCallsigns = loadJsonFileSafe(GT.lotwFile);
    if (Object.keys(GT.lotwCallsigns).length < 100) lotwDownload();
  } else {
    lotwDownload();
  }
}
function lotwSettingsDisplay() { updateServiceUI("lotw"); }
function lotwValuesChanged() { toggleService("lotw", lotwLoadCallsigns, lotwSettingsDisplay); }
function lotwDownload() {
  if (window.lotwUpdatedTd) lotwUpdatedTd.innerHTML = "<b><i>Downloading...</i></b>";
  getBuffer("https://lotw.arrl.org/lotw-user-activity.csv", processLotwCallsigns, null, "https", 443);
}
function processLotwCallsigns(buffer) {
  const result = String(buffer);
  const lotwCallsigns = {};
  
  // Fast Single-Pass parsing, avoids split("\n") array allocation
  let startPos = 0;
  while (startPos < result.length) {
    let eol = result.indexOf("\n", startPos);
    if (eol === -1) eol = result.length;
    let row = result.substring(startPos, eol);
    
    // Format: CALL,YYYY-MM-DD,...
    let comma1 = row.indexOf(",");
    if (comma1 > 0) {
      let call = row.substring(0, comma1);
      let dateStr = row.substring(comma1 + 1, comma1 + 11); // gets YYYY-MM-DD
      if (dateStr.length === 10) {
        let timeSec = Date.UTC(
          dateStr.substring(0, 4),
          parseInt(dateStr.substring(5, 7), 10) - 1,
          dateStr.substring(8, 10)
        ) / 1000;
        lotwCallsigns[call] = timeSec / 86400; // Store as days
      }
    }
    startPos = eol + 1;
  }

  GT.settings.callsignLookups.lotwLastUpdate = timeNowSec();
  manageServiceTimer("lotw", lotwDownload);

  if (Object.keys(lotwCallsigns).length > 100) {
    GT.lotwCallsigns = lotwCallsigns;
    fs.writeFileSync(GT.lotwFile, JSON.stringify(GT.lotwCallsigns), { flush: true });
  }
  lotwSettingsDisplay();
}

// --- EQSL ---
function eqslLoadCallsigns() {
  const needsDownload = manageServiceTimer("eqsl", eqslDownload);
  if (!needsDownload) GT.eqslCallsigns = loadJsonFileSafe(GT.eqslFile);
  if (needsDownload || Object.keys(GT.eqslCallsigns).length === 0) eqslDownload();
}
function eqslSettingsDisplay() { updateServiceUI("eqsl"); }
function eqslValuesChanged() { toggleService("eqsl", eqslLoadCallsigns, eqslSettingsDisplay); }
function eqslDownload() {
  if (window.eqslUpdatedTd) eqslUpdatedTd.innerHTML = "<b><i>Downloading...</i></b>";
  getBuffer("https://www.eqsl.cc/qslcard/DownloadedFiles/AGMemberList.txt", processeqslCallsigns, null, "https", 443);
}
function processeqslCallsigns(buffer) {
  const result = String(buffer);
  GT.eqslCallsigns = {};

  // Fast text parsing
  let startPos = 0;
  while (startPos < result.length) {
    let eol = result.indexOf("\n", startPos);
    if (eol === -1) eol = result.length;
    let call = result.substring(startPos, eol).trim();
    if (call.length > 0) GT.eqslCallsigns[call] = true;
    startPos = eol + 1;
  }

  GT.settings.callsignLookups.eqslLastUpdate = timeNowSec();
  manageServiceTimer("eqsl", eqslDownload);

  if (Object.keys(GT.eqslCallsigns).length > 10000) {
    fs.writeFileSync(GT.eqslFile, JSON.stringify(GT.eqslCallsigns), { flush: true });
  }
  eqslSettingsDisplay();
}

// --- OQRS ---
function oqrsLoadCallsigns() {
  const needsDownload = manageServiceTimer("oqrs", oqrsDownload);
  if (!needsDownload) GT.oqrsCallsigns = loadJsonFileSafe(GT.oqrsFile);
  if (needsDownload || !hasAnyKeys(GT.oqrsCallsigns)) oqrsDownload();
}
function oqrsSettingsDisplay() { updateServiceUI("oqrs"); }
function oqrsValuesChanged() { toggleService("oqrs", oqrsLoadCallsigns, oqrsSettingsDisplay); }
function oqrsDownload() {
  if (window.oqrsUpdatedTd) oqrsUpdatedTd.innerHTML = "<b><i>Downloading...</i></b>";
  getBuffer("https://app2.gridtracker.org/dbs/clublog.json", processoqrsCallsigns, null, "https", 443);
}
function processoqrsCallsigns(buffer) {
  try { GT.oqrsCallsigns = JSON.parse(buffer); } catch (e) { GT.oqrsCallsigns = {}; }
  GT.settings.callsignLookups.oqrsLastUpdate = timeNowSec();
  manageServiceTimer("oqrs", oqrsDownload);
  fs.writeFileSync(GT.oqrsFile, JSON.stringify(GT.oqrsCallsigns), { flush: true });
  oqrsSettingsDisplay();
}

// --- CAC ---
function cacLoadCallsigns() {
  const needsDownload = manageServiceTimer("cac", cacDownload);
  if (!needsDownload && fs.existsSync(GT.cacFile)) {
    parseCacCallsigns(fs.readFileSync(GT.cacFile, "UTF-8"));
  } else {
    cacDownload();
  }
}
function cacSettingsDisplay() { updateServiceUI("cac"); }
function cacValuesChanged() { toggleService("cac", cacLoadCallsigns, cacSettingsDisplay); }
function cacDownload() {
  if (window.cacUpdatedTd) cacUpdatedTd.innerHTML = "<b><i>Downloading...</i></b>";
  getBuffer("https://app2.gridtracker.org/dbs/canada.txt", processCacCallsigns, null, "https", 443);
}
function processCacCallsigns(buffer) {
  parseCacCallsigns(String(buffer));
  GT.settings.callsignLookups.cacLastUpdate = timeNowSec();
  manageServiceTimer("cac", cacDownload);
  cacSettingsDisplay();
}
function parseCacCallsigns(data) {
  // Fast string parsing
  let startPos = 0;
  while (startPos < data.length) {
    let eol = data.indexOf("\n", startPos);
    if (eol === -1) eol = data.length;
    if (eol - startPos > 8) { // Minimum length check
      let call = data.substring(startPos + 8, eol).trim();
      let prov = data.substring(startPos + 6, startPos + 8);
      if (call) GT.cacCallsigns[call] = prov;
    }
    startPos = eol + 1;
  }
  fs.writeFileSync(GT.cacFile, data, "UTF-8", { flush: true });
}

// --- ULS ---
function ulsLoadCallsigns() {
  if (timeNowSec() - GT.settings.callsignLookups.ulsLastUpdate > 604800 || !fs.existsSync(GT.ulsFile)) {
    GT.settings.callsignLookups.ulsLastUpdate = 0;
    ulsDownload();
  } else {
    loadULSFile();
  }
}
function resetULSDatabase() {
  GT.settings.callsignLookups.ulsLastUpdate = 0;
  GT.ulsCallsignsCount = 0;
  GT.ulsCallsigns = {};
}
function updateCallsignCount() {
  GT.ulsCallsignsCount = Object.keys(GT.ulsCallsigns).length;
  if (window.ulsCountTd) ulsCountTd.innerHTML = GT.ulsCallsignsCount;
}
function ulsSettingsDisplay() { updateServiceUI("uls", GT.ulsCallsignsCount); }
function ulsValuesChanged() { toggleService("uls", ulsLoadCallsigns, ulsSettingsDisplay); }
function ulsDownload() {
  if (window.ulsUpdatedTd) ulsUpdatedTd.innerHTML = "<b><i>Downloading...</i></b>";
  if (window.ulsCountTd) ulsCountTd.innerHTML = 0;
  getBuffer("https://app2.gridtracker.org/dbs/fipszips.txt", ulsDownloadHandler, null, "https", 443);
}
function ulsDownloadHandler(data) {
  fs.writeFileSync(GT.ulsFile, data, { flush: true });
  GT.settings.callsignLookups.ulsLastUpdate = timeNowSec();
  loadULSFile();
}
function loadULSFile() {
  if (window.ulsUpdatedTd) ulsUpdatedTd.innerHTML = "<b><i>Processing...</i></b>";
  fs.readFile(GT.ulsFile, "utf-8", processulsCallsigns);
}

function processulsCallsigns(error, buffer) {
  if (error) console.error("File Read Error: " + error);
  GT.ulsCallsigns = {};

  if (buffer && buffer.length > 0) {
    let startPos = 0;
    const endPos = buffer.length;
    while (startPos < endPos) {
      let eol = buffer.indexOf("\n", startPos);
      if (eol === -1) break;
      // ULS Format assumption: first char = Z|F then code, then state, 8th onward = Call
      // Z12345NYCALLSIGN
      // 012345678      
      GT.ulsCallsigns[buffer.substring(startPos + 8, eol)] = buffer.substring(startPos, startPos + 8);
      startPos = eol + 1;
    }
  }

  updateCallsignCount();
  manageServiceTimer("uls", ulsDownload);
  ulsSettingsDisplay();
}

function stateCheck() {
  // 1. Cache deep property lookups to local variables
  const ulsEnabled = GT.settings.callsignLookups.ulsUseEnable;
  const cacEnabled = GT.settings.callsignLookups.cacUseEnable;

  // 2. Early exit: Prevents memory allocation if neither setting is active
  if (!ulsEnabled && !cacEnabled) return;

  // 3. Cache frequently accessed global/parent objects locally
  const cntyToCounty = GT.cntyToCounty;
  const cacCallsigns = GT.cacCallsigns;

  // 4. Allocate array ONLY if we know we are going to use it
  const hashes = Object.values(GT.QSOhash);
  const len = hashes.length;

  // 5. Single Pass Iteration using a standard for-loop 
  // (Avoids the hidden allocation of the iterator protocol in for...of)
  for (let i = 0; i < len; i++) {
    const details = hashes[i];

    if (ulsEnabled) {
      if (isKnownCallsignUSplus(details.dxcc)) {
        let lookupCall = !details.cnty || !details.state;
        
        // 6. Replaced 'in' operator with direct undefined check (faster lookup)
        if (details.cnty && cntyToCounty[details.cnty] === undefined) {
          lookupCall = (details.cnty.indexOf(",") !== -1) || 
                       (cntyToCounty[`${details.state},${details.cnty}`] === undefined);
        }
        
        if (lookupCall) lookupKnownCallsign(details);
      }
    }

    if (cacEnabled) {
      if (
        details.dxcc === 1 && 
        !details.state && 
        cacCallsigns[details.DEcall] !== undefined // Replaced 'in' operator
      ) {
        details.state = "CA-" + cacCallsigns[details.DEcall];
      }
    }
  }
}

function lookupKnownCallsign(object) {
  const ulsData = GT.ulsCallsigns[object.DEcall];
  if (ulsData) {
    let isZip = ulsData.startsWith("Z");
    let code = ulsData.substring(1, 6);
    let state = ulsData.substring(6);
    if (!object.state)
    { 
      object.state = "US-" + state;
    }

    if (isZip)
    {
      object.zipcode = code;
        
      if (!object.cnty && GT.zipToCounty[code]) {
        const counties = GT.zipToCounty[code];
        object.qual = counties.length === 1;
        object.cnty = counties[0];
      }
    }
    else
    {
      object.fips = code;

      if (!object.cnty && GT.fipsToCounty[code]) {
        object.qual = true
        object.cnty = GT.fipsToCounty[code];
      }
    }
  }
}


// --- CTY.DAT (Big CTY) ---
function updateLookupsBigCtyUI() {
  const v = String(GT.dxccVersion);
  const date = new Date(parseInt(v.substring(0,4)), parseInt(v.substring(4,6)) - 1, parseInt(v.substring(6,8)));
  if (window.bigctyUpdatedTd) bigctyUpdatedTd.innerHTML = userTimeString(date.getTime());
}

GT.downloadingCtyDat = false;
GT.restartRequired = false;

function downloadCtyDat() {
  if (GT.settings.map.offlineMode || GT.downloadingCtyDat) return;
  GT.downloadingCtyDat = true;
  if (window.bigctyUpdatedTd) {
    bigctyUpdatedTd.innerHTML = "<b><i>Checking...</i></b>";
    bigctyDetailsTd.innerHTML = "";
  }
  getBuffer("https://app2.gridtracker.org/dbs/ctydatver.json", processCtyDatVer, null, "https", 443);
}

function processCtyDatVer(buffer) {
  try {
    const ctydatver = JSON.parse(String(buffer));
    if (ctydatver && ctydatver.version) {
      GT.newDxccVersion = parseInt(ctydatver.version, 10);

      if (GT.newDxccVersion > GT.dxccVersion) {
        if (window.bigctyUpdatedTd) bigctyUpdatedTd.innerHTML = "<b><i>Downloading...</i></b>";
        getBuffer("https://app2.gridtracker.org/dbs/ctydat.json", processCtyDat, null, "https", 443);
      } else {
        updateLookupsBigCtyUI();
        GT.downloadingCtyDat = false;
      }
    }
  } catch (e) {
    GT.downloadingCtyDat = false;
    if (window.bigctyUpdatedTd) {
      bigctyUpdatedTd.innerHTML = "Version check";
      bigctyDetailsTd.innerHTML = "Error!";
    }
    console.error(e);
  }
}

function processCtyDat(buffer) {
  GT.downloadingCtyDat = false;
  try {
    const ctydata = JSON.parse(String(buffer));
    if (fs.existsSync(GT.asarDxccInfoPath)) {
      const dxccInfo = JSON.parse(fs.readFileSync(GT.asarDxccInfoPath, "utf8"));
      
      // Basic sanity check
      if ("291" in dxccInfo && "291" in ctydata) {
        updateDxccInfo(dxccInfo, ctydata);
        dxccInfo[0].version = GT.newDxccVersion;
        
        const toWrite = JSON.stringify(dxccInfo);
        fs.writeFileSync(GT.tempDxccInfoPath, toWrite, { flush: true });
        
        if (fs.statSync(GT.tempDxccInfoPath).size === toWrite.length) {
          fs.unlinkSync(GT.dxccInfoPath);
          fs.renameSync(GT.tempDxccInfoPath, GT.dxccInfoPath);
          
          if (window.bigctyUpdatedTd) {
            bigctyUpdatedTd.innerHTML = `<div style='color:cyan;font-weight:bold'>${I18N("gt.NewVersion.Release")}</div>`;
            bigctyDetailsTd.innerHTML = "<div class='button' onclick='saveAndCloseApp(true)'>Restart</div>";
          }
          addLastTraffic(`<font style='color:yellow'>${I18N("gt.NewVersion.Release")} - Big CTY<br><div class='button' onclick='saveAndCloseApp(true)'>Restart</div></font>`);
        } else {
          if (window.bigctyUpdatedTd) {
            bigctyUpdatedTd.innerHTML = "<div style='color:orange;font-weight:bold'>Mismatch!</div>";
            bigctyDetailsTd.innerHTML = "Mismatch!";
          }
        }
      } else {
        if (window.bigctyUpdatedTd) {
          bigctyUpdatedTd.innerHTML = "Invalid data";
          bigctyDetailsTd.innerHTML = "Corrupt!";
        }
      }
    }
  } catch (e) {
    if (window.bigctyUpdatedTd) {
      bigctyUpdatedTd.innerHTML = "Failed to parse";
      bigctyDetailsTd.innerHTML = "Error!";
    }
    console.error(e);
  }
}

function updateDxccInfo(dxccInfo, ctydata) {
  // Regex moved outside loop so V8 compiles it once
  const cqRegex = /\((.*?)\)/;
  const ituRegex = /\[(.*?)\]/;

  for (const key in dxccInfo) {
    dxccInfo[key].ituzone = null;
    dxccInfo[key].cqzone = null;
    dxccInfo[key].prefixITU = {};
    dxccInfo[key].prefixCQ = {};
    dxccInfo[key].directITU = {};
    dxccInfo[key].directCQ = {};

    if (key in ctydata) {
      dxccInfo[key].cqzone = padNumber(Number(ctydata[key].cqzone), 2);
      dxccInfo[key].ituzone = padNumber(Number(ctydata[key].ituzone), 2);

      // Skip Guantanamo Bay, hand crafted with love
      if (key !== "105") {
        const pfxStr = ctydata[key].prefix;
        const arr = pfxStr.substring(0, pfxStr.length - 1).split(" ");
        const prefixArr = [];
        const directArr = [];

        for (let test of arr) {
          const isDirect = test.startsWith("=");
          if (isDirect) test = test.substring(1);

          let cq = null, itu = null;
          
          const cqMatch = test.match(cqRegex);
          if (cqMatch) cq = padNumber(Number(cqMatch[1]), 2);

          const ituMatch = test.match(ituRegex);
          if (ituMatch) itu = padNumber(Number(ituMatch[1]), 2);

          // Strip metadata tags using Regex instead of 5 indexOf calls
          test = test.replace(/[\(\[\<\{\~].*/, "");

          if (isDirect) {
            directArr.push(test);
            if (cq) dxccInfo[key].directCQ[test] = cq;
            if (itu) dxccInfo[key].directITU[test] = itu;
          } else {
            prefixArr.push(test);
            if (cq) dxccInfo[key].prefixCQ[test] = cq;
            if (itu) dxccInfo[key].prefixITU[test] = itu;
          }
        }
        dxccInfo[key].prefix = uniqueArrayFromArray(prefixArr).sort();
        dxccInfo[key].direct = uniqueArrayFromArray(directArr).sort();
      }
    }
  }
}
