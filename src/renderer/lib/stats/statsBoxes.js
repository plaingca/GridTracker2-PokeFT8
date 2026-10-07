// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Stats window: opening it, the stats/awards tabs (stats, zones, WAS+, DXCC, WPX, callsigns) and their table builders (moved from gt.js)

function showCallsignBox() {
  // Start with a pure string
  let html = `<div style='vertical-align:top;display:inline-block;margin:2px;color:cyan;font-weight:bolder;'>${I18N("gt.callsignBox.title")} <img src='img/reset_24x48.png' title='${I18N("gt.spots.refresh")}' onclick="window.opener.showCallsignBox()" style='height:18px;margin:-1px;margin-bottom:-3px;padding:0px;cursor:pointer;border:1px' alt="${I18N("gt.spots.refresh")}"></div><br>`;

  const callsignCount = GT.sessionCallsigns.size;

  if (callsignCount > 0) {
    const newCallList = getSortedCallsigns();
    const myCall = GT.settings.app.myRawCall;
    const now = timeNowSec(); 

    // OPTIMIZATION 1: Cache deep settings outside the loop!
    const useLotw = GT.settings.callsignLookups.lotwUseEnable;
    const useEqsl = GT.settings.callsignLookups.eqslUseEnable;
    const useOqrs = GT.settings.callsignLookups.oqrsUseEnable;
    
    // OPTIMIZATION 2: Cache deep objects for instant hash lookups
    const workedCall = GT.tracker.worked.call;
    const confCall = GT.tracker.confirmed.call;
    const lotwCall = GT.lotwCallsigns;
    const eqslCall = GT.eqslCallsigns;
    const oqrsCall = GT.oqrsCallsigns;
    const pskColors = GT.pskColors;

    // Table Header (using +=)
    html += `
      <div style='display:inline-block;padding-right:4px;margin-right:8px; overflow:auto;overflow-x:hidden;height:${Math.min(callsignCount * 24 + 26, getStatsWindowHeight())}px;'>
        <table class='darkTable' align=center>
          <tr>
            <th align=left>${I18N("gt.callsignBox.callsign")} (${callsignCount})</th>
            <th align=left>${I18N("gt.callsignBox.Grid")}</th>
            <th>${I18N("gt.newCallList.Band")}</th>
            <th>${I18N("gt.callsignBox.DXCC")}</th>
            <th>${I18N("gt.callsignBox.CQ")}</th>
            <th>${I18N("gt.callsignBox.ITU")}</th>
            <th align=left>${I18N("gt.callsignBox.QSO")}</th>
            <th>${I18N("gt.callsignBox.QSL")}</th>
            <th>${I18N("gt.callsignBox.When")}</th>
            ${useLotw ? `<th>${I18N("gt.callsignBox.LoTW")}</th>` : ""}
            ${useEqsl ? `<th>${I18N("gt.callsignBox.eQSL")}</th>` : ""}
            ${useOqrs ? `<th>${I18N("gt.callsignBox.OQRS")}</th>` : ""}
          </tr>
    `;

    for (let i = 0; i < newCallList.length; i++) {
      const callObj = newCallList[i];
      const thisCall = callObj.DEcall;
      
      if (thisCall === myCall) continue; 

      const grid = callObj.grid || "-";
      const cqzone = callObj.cqz || "-";
      const ituzone = callObj.ituz || "-";
      const geo = callObj.geo;
      
      // Use cached pskColors and direct check (!== undefined)
      const bandColor = pskColors[callObj.band] !== undefined ? pskColors[callObj.band] : pskColors.OOB;
      const age = now - callObj.time;
      let ageString = (age < 3601) ? toDHMS(age) : userTimeString(callObj.time * 1000);

      // OPTIMIZATION 3: Replace slow 'in' operator with instant '!== undefined' hash checks
      html += `
        <tr>
          <td align=left style='color:#ff0;cursor:pointer' onClick='window.opener.startLookup("${thisCall}", "${grid}");'>${formatCallsign(thisCall)}</td>
          <td align=left style='color:cyan;'>${grid}</td>
          <td style='color:#${bandColor};'>${callObj.band}</td>
          <td style='color:orange;'>${geo.name}<font style='color:lightgreen;'> (${geo.pp})</font></td>
          <td>${cqzone}</td>
          <td>${ituzone}</td>
          <td>${workedCall[thisCall] !== undefined ? "&#10004;" : ""}</td>
          <td>${confCall[thisCall] !== undefined ? "&#10004;" : ""}</td>
          <td>${ageString}</td>
          ${useLotw ? `<td align='center'>${lotwCall[thisCall] !== undefined ? "&#10004;" : ""}</td>` : ""}
          ${useEqsl ? `<td align='center'>${eqslCall[thisCall] !== undefined ? "&#10004;" : ""}</td>` : ""}
          ${useOqrs ? `<td align='center'>${oqrsCall[thisCall] !== undefined ? "&#10004;" : ""}</td>` : ""}
        </tr>`;
    }

    html += "</table></div>";
  }

  // Heard DXCCs Section
  const heardCount = GT.sessionDXCCs.size;
  
  if (heardCount > 0) {
    html += `
      <div style='vertical-align:top;display:inline-block;margin-right:2px;overflow:auto;overflow-x:hidden;height:${Math.min(heardCount * 23 + 45, getStatsWindowHeight())}px;'>
        <table class='darkTable' align=center>
          <tr>
            <th colspan=4 style='font-weight:bold'>DXCC (${heardCount})</th>
          </tr>
          <tr>
            <th align=left>${I18N("gt.callsignBox.Name")}</th>
            <th>${I18N("gt.callsignBox.Flag")}</th>
            <th align=left>${I18N("gt.callsignBox.Calls")}</th>
          </tr>
    `;

    const dxccArray = [];
    for (const [key, count] of GT.sessionDXCCs) {
      dxccArray.push({
        name: GT.dxccToAltName[key],
        total: count,
        flag: GT.dxccInfo[key].flag
      });
    }

    // .localeCompare is slow but acceptable here since the DXCC list is generally small
    dxccArray.sort((a, b) => a.name.localeCompare(b.name));

    for (let i = 0; i < dxccArray.length; i++) {
      const item = dxccArray[i];
      html += `
        <tr>
          <td align=left style='color:#ff0;'>${item.name}</td>
          <td align='center' style='margin:0;padding:0'><img style='padding-top:3px' src='img/flags/16/${item.flag}'></td>
          <td align=left style='color:lightblue;'>${item.total}</td>
        </tr>
      `;
    }
    
    html += "</table></div>";
  }
  
  html += "</div>";

  setStatsDiv("callsignListDiv", html);
}

function getBandSlots()
{
  const bands = (GT.myDXCC in GT.callsignDatabaseUSplus) ? GT.us_bands : GT.non_us_bands;
  const bSlots = { Mixed: 0, Phone: 0, Digital: 0, CW: 0 };
  bands.forEach(b => bSlots[b] = 0);

  const confirmed = GT.tracker.confirmed.dxcc;

  for (const [key, info] of Object.entries(GT.dxccInfo)) {
    const baseKey = `${key}|`;

    if (info.geo !== "deleted" && baseKey in confirmed) {
      bSlots.Mixed++;
      if (`${baseKey}dg` in confirmed) bSlots.Digital++;
      if (`${baseKey}ph` in confirmed) bSlots.Phone++;
      if (`${baseKey}CW` in confirmed) bSlots.CW++;
      
      bands.forEach(b => { 
        if (`${baseKey}${b}` in confirmed) bSlots[b]++; 
      });
    }
  }

  const total = bands.reduce((acc, b) => acc + bSlots[b], 0);

  const bandHeaders = bands.map(b => `<th><span style="color: #${GT.pskColors[b]}">${b}</span></th>`).join("");
  const bandData = bands.map(b => `<td>${bSlots[b]}</td>`).join("");

  return `
    <table class="darkTable" style="margin: 0 auto;">
      <tr>
        <th colspan="${bands.length + 5}">Confirmed Band Slots</th>
      </tr>
      <tr>
        <th>Mixed</th><th>Phone</th><th>Digital</th><th>CW</th>${bandHeaders}<th>Total</th>
      </tr>
      <tr>
        <td>${bSlots.Mixed}</td><td>${bSlots.Phone}</td><td>${bSlots.Digital}</td><td>${bSlots.CW}</td>${bandData}<td>${total}</td>
      </tr>
    </table><br>
  `;
}

function getDXMarathon()
{
  let workedDxm = GT.tracker.worked.dxm;
  let cCount = keysThatContain(workedDxm, "c" + GT.currentYear);
  let zCount = keysThatContain(workedDxm, "z" + GT.currentYear);
  let tCount = keysThatContain(workedDxm, GT.currentYear);

  return `<h1>${I18N("rosterColumns.Wanted.dxm")} ${GT.currentYear}</h1>
    <table class='darkTable' align=center>
      <tr><th><font color='orange'>${I18N("gt.viewInfo.worldGeoData")}</font></th>
      <th><font color='cyan'>${I18N("gt.viewInfo.cqZones")}</font></th>
      <th><font color='yellow'>Total</font></th></tr>
      <tr><td style='color:white;'>${cCount}</td><td style='color:white;'>${zCount}</td><td style='font-weight:bold;color:white;'>${tCount}</td></tr>
    </table>`;
}

function keysThatContain(obj, text)
{
  return Object.keys(obj).filter(key => key.includes(text)).length;
};

function showZonesBox()
{
  let html = [getCurrentBandModeHTML()];

  html.push("<div style='vertical-align:top;display:inline-block;margin-right:8px;overflow:auto;overflow-x:hidden;color:cyan;'><b>" + I18N("gt.CQZoneBox.Worked") + "</b><br>");
  html.push(displayItemList(GT.cqZones, "#FFA500"));
  html.push("</div>");

  html.push("<div style='vertical-align:top;display:inline-block;margin-right:8px;overflow:auto;overflow-x:hidden;color:cyan;'><b>" + I18N("gt.ITUZoneBox.Worked") + "</b><br>");
  html.push(displayItemList(GT.ituZones, "#00DDDD"));
  html.push("</div>");

  html.push("<div style='vertical-align:top;display:inline-block;margin-right:8px;overflow:auto;overflow-x:hidden;color:cyan;'><b>" + I18N("gt.WASWACBox.WAC") + "</b><br>");
  html.push(displayItemList(GT.wacZones, "#90EE90"));
  html.push("</div>");

  setStatsDiv("zonesListDiv", html.join(""));
}

function showWASPlusBox()
{
  let html = [getCurrentBandModeHTML()];
  let band = GT.settings.app.gtBandFilter == "auto" ? GT.settings.app.myBand : GT.settings.app.gtBandFilter || "";

  html.push("<div style='vertical-align:top;display:inline-block;margin-right:8px;overflow:auto;overflow-x:hidden;color:cyan;'><b>" + I18N("gt.WASWACBox.WAS") + "</b><br>");
  html.push(displayItemList(GT.wasZones, "#00DDDD"));
  html.push("</div>");

  html.push("<div style='vertical-align:top;display:inline-block;margin-right:8px;overflow:auto;overflow-x:hidden;color:cyan;'><b>" + I18N("gt.WASWACBox.WACP") + "</b><br>");
  html.push(displayItemList(GT.wacpZones, "#FFA500"));
  html.push("</div>");

  html.push("<div style='vertical-align:top;display:inline-block;margin-right:8px;overflow:auto;overflow-x:hidden;color:cyan;'><b>" + I18N("gt.viewInfo.us48Data") + "</b><br>");
  html.push(displayItemList(GT.us48Data, "#DDDD00", key => `searchWorkedGrid("${key}", "${band}")`));
  html.push("</div>");

  setStatsDiv("wasPlusListDiv", html.join(""));
}

function displayItemList(table, color, clickFn = null)
{
  const entries = Object.entries(table);
  const itemCount = entries.length;

  let worked = 0;
  let confirmed = 0;
  let needed = 0;

  for (const [, item] of entries)
  {
    if (item.worked === true) worked++;
    if (item.confirmed === true) confirmed++;
    if (item.confirmed === false && item.worked === false) needed++;
  }

  const maxHeight = Math.min(
    itemCount * 23 + 68,
    getStatsWindowHeight() - 12
  );

  const confirmedStyle = "color:" + color + ";";
  const workedStyle = "color:" + color + ";background-clip:content-box;box-shadow: 0 0 8px 3px inset;";
  const workedClickStyle = "color:" + color + ";background-clip:content-box;box-shadow: 0 0 8px 3px inset;cursor:pointer;";
  const neededStyle = "color:#000000;background-color:" + color + ";text-shadow: 0px 0px 1px black;";

  let rows = [];

  rows.push(
    "<div style='color:white;vertical-align:top;display:inline-block;margin-right:8px;overflow-y:auto;overflow-x:hidden;height:" +
      maxHeight +
      "px;'>"
  );
  rows.push("<table class='darkTable' align='center'>");
  rows.push("<tr><th style='font-weight:bold'>" + I18N("gt.displayItemsList.Worked") + " (" + worked + ")</th></tr>");
  rows.push("<tr><th style='font-weight:bold'>" + I18N("gt.displayItemsList.Confirmed") + " (" + confirmed + ")</th></tr>");
  rows.push("<tr><th style='font-weight:bold'>" + I18N("gt.displayItemsList.Needed") + " (" + needed + ")</th></tr>");
  rows.push("<tr><th align='left'>Name</th></tr>");

  entries
    .sort(function (a, b)
    {
      return a[0].localeCompare(b[0]);
    })
    .forEach(function ([key, item])
    {
      const name =
        typeof item.name != "undefined" && item.name != key
          ? key + " / " + item.name
          : key;

      let style;
      let rowAttr = "";
      if (item.confirmed === true)
      {
        style = confirmedStyle;
      }
      else if (item.worked === true)
      {
        if (clickFn)
        {
          style = workedClickStyle;
          rowAttr = " onclick='" + clickFn(key) + "'";
        }
        else
        {
          style = workedStyle;
        }
      }
      else
      {
        style = neededStyle;
      }

      rows.push("<tr><td align='left' style='" + style + "'" + rowAttr + ">" + name + "</td></tr>");
    });

  rows.push("</table></div>");

  return rows.join("");
}

function showDXCCsBox()
{
  let html = [getBandSlots(), getCurrentBandModeHTML()];
  let band = GT.settings.app.gtBandFilter == "auto" ? GT.settings.app.myBand : GT.settings.app.gtBandFilter || "";
  let mode = GT.settings.app.gtModeFilter == "auto" ? GT.settings.app.myMode : GT.settings.app.gtModeFilter || "";

  let workedList = [], confirmedList = [], neededList = [];

  for (const key in GT.dxccInfo)
  {
    if (key != -1 && Number(GT.dxccInfo[key].dxcc) > 0)
    {
      let info = GT.dxccInfo[key];
      let item = { dxcc: info.dxcc, flag: info.flag, name: info.name };
      if (info.confirmed) confirmedList.push(item);
      else if (info.worked) workedList.push(item);
      else if (info.pp != "" && info.geo != "deleted") neededList.push(item);
    }
  }

  const renderTable = (title, list, isConfirmed, isNeeded) => {
    if (list.length === 0) return "";
    list.sort((a, b) => a.name.localeCompare(b.name));
    
    let rows = list.map(item => {
      let rowStyle = isNeeded ? "color:#000000;background-color:#ff0;text-shadow: 0px 0px 1px black;" : isConfirmed ? "" : "background-clip:content-box;box-shadow: 0 0 8px 3px inset; cursor:pointer;";
      let rowAttr =  isNeeded ? "" : isConfirmed ? "" : `onclick='searchWorked(${item.dxcc}, "${band}", "${mode}");'`;
      return `<tr>
        <td align=left style='color:#ff0;${rowStyle}' ${rowAttr}>${item.name}</td>
        <td align='center' style='margin:0;padding:0'><img style='padding-top:3px' src='img/flags/16/${item.flag}'></td>
        <td align=left style='color:cyan;'>${item.dxcc}</td>
      </tr>`;
    }).join("");

    let height = Math.min((list.length+2) * 23, getStatsWindowHeight() - 70);
    return `
      <div style='vertical-align:top;display:inline-block;margin-right:5px;overflow:auto;overflow-x:hidden;height:${height}px;'>
        <table class='darkTable' align=center>
          <tr><th colspan=5 style='font-weight:bold'>${title} (${list.length})</th></tr>
          <tr><th align=left>${I18N("gt.dxccBox.Name")}</th><th>${I18N("gt.dxccBox.Flag")}</th><th align=left>${I18N("gt.dxccBox.DXCC")}</th></tr>
          ${rows}
        </table>
      </div>`;
  };

  html.push(
    renderTable(I18N("gt.dxccBox.Worked"), workedList, false, false),
    renderTable(I18N("gt.dxccBox.Confirmed"), confirmedList, true, false),
    renderTable(I18N("gt.dxccBox.Needed"), neededList, false, true)
  );

  setStatsDiv("dxccListDiv", html.join(""));
}

function showWPXBox()
{
  let worker = getCurrentBandModeHTML();

  let band = GT.settings.app.gtBandFilter == "auto" ? GT.settings.app.myBand : GT.settings.app.gtBandFilter.length == 0 ? "" : GT.settings.app.gtBandFilter;
  let mode = GT.settings.app.gtModeFilter == "auto" ? GT.settings.app.myMode : GT.settings.app.gtModeFilter.length == 0 ? "" : GT.settings.app.gtModeFilter;

  if (mode == "Digital") { mode = "dg"; }
  if (mode == "Phone") { mode = "ph"; }

  let modifier = String(band) + String(mode);
  let worked = 0;
  let confirmed = 0;
  let List = {};
  let ListConfirmed = {};
  const workedPx = GT.tracker.worked.px;
  const confirmedPx = GT.tracker.confirmed.px;
  for (const key in workedPx)
  {
    if (typeof workedPx[key] === "string" && key + modifier in workedPx)
    {
      List[key] = key;
      worked++;
    }
  }

  for (const key in confirmedPx)
  {
    if (typeof confirmedPx[key] === "string" &&  key + modifier in confirmedPx)
    {
      ListConfirmed[key] = key;
      confirmed++;
    }
  }

  if (worked > 0)
  {
    worker +=
      "<div  style='vertical-align:top;display:inline-block;margin-right:8px;overflow:auto;overflow-x:hidden;color:cyan;'>" +
        "<b>" + I18N("gt.WPXBox.worked") + " (<font color='#fff'>" +
      worked +
      "</font>)</b><br>";
    worker +=
      "<div  style='color:white;vertical-align:top;display:inline-block;margin-right:8px;overflow:auto;overflow-x:hidden;height:" +
      Math.min(worked * 23 + 45, getStatsWindowHeight() - 6) +
      "px;'><table class='darkTable' align=center>";
    Object.keys(List)
      .sort()
      .forEach(function (key, i)
      {
        worker +=
          "<tr><td align=left style='color:#ff0;' >" +
          formatCallsign(key) +
          "</td><td style='color:#0ff;'>" +
          formatCallsign(GT.tracker.worked.px[key]) +
          "</td></tr>";
      });

    worker += "</table></div>";
    worker += "</div>";
  }

  if (confirmed > 0)
  {
    worker +=
      "<div  style='vertical-align:top;display:inline-block;margin-right:16px;overflow:auto;overflow-x:hidden;color:cyan;'>" +
        "<b>" + I18N("gt.WPXBox.confirmed") + " (<font color='#fff'>" +
      confirmed +
      "</font>)</b><br>";
    worker +=
      "<div  style='color:white;vertical-align:top;display:inline-block;margin-right:8px;overflow:auto;overflow-x:hidden;height:" +
      Math.min(confirmed * 23 + 45, getStatsWindowHeight() - 6) +
      "px;'><table class='darkTable' align=center>";
    Object.keys(ListConfirmed)
      .sort()
      .forEach(function (key, i)
      {
        worker +=
          "<tr><td align=left style='color:#ff0;' >" +
          formatCallsign(key) +
          "</td><td style='color:#0ff;'>" +
          formatCallsign(GT.tracker.confirmed.px[key]) +
          "</td></tr>";
      });

    worker += "</table></div>";
    worker += "</div>";
  }

  worker += "<div style='vertical-align:top;display:inline-block;margin-right:8px;overflow:auto;overflow-x:hidden;color:cyan;'><b>" + I18N("gt.viewInfo.countyData") + "</b><br>";
  worker += displayItemList(GT.countyData, "orange");
  worker += "</div>";
  
  setStatsDiv("wpxListDiv", worker);
}

function showRootInfoBox(toggle = true)
{
  if (GT.statsWindowInitialized)
  {
    if (toggle)
    {
      electron.ipcRenderer.send("toggleWin", "gt_stats");
    }
    else
    {
      electron.ipcRenderer.send("showWin", "gt_stats");
    }
  }
}

function newStatObject()
{
  let statObject = {};
  statObject.worked = 0;
  statObject.confirmed = 0;
  statObject.worked_bands = {};
  statObject.confirmed_bands = {};
  statObject.worked_modes = {};
  statObject.confirmed_modes = {};
  statObject.worked_types = {};
  statObject.confirmed_types = {};
  return statObject;
}

function newStatCountObject()
{
  let statCountObject = {};

  statCountObject.worked = 0;
  statCountObject.confirmed = 0;
  statCountObject.worked_bands = {};
  statCountObject.confirmed_bands = {};
  statCountObject.worked_modes = {};
  statCountObject.confirmed_modes = {};
  statCountObject.worked_types = {};
  statCountObject.confirmed_types = {};

  statCountObject.worked_high = 0;
  statCountObject.confirmed_high = 0;
  statCountObject.worked_high_key = null;
  statCountObject.confirmed_high_key = null;

  return statCountObject;
}

function newDistanceObject(start = 0)
{
  let distance = {};
  distance.worked_unit = start;
  distance.worked_hash = "";
  distance.confirmed_unit = start;
  distance.confirmed_hash = null;
  return distance;
}

function showStatBox(resize)
{
  let count = Object.keys(GT.QSOhash).length;

  if (typeof resize != "undefined" && resize)
  {
    setStatsDivHeight("statViewDiv", getStatsWindowHeight() + 29 + "px");
    return;
  }

  if (GT.statBoxTimer) nodeTimers.clearTimeout(GT.statBoxTimer);

  if (count > 0)
  {
    setStatsDiv(
      "statViewDiv",
      "&nbsp;<br>" + I18N("gt.statBox.NoEntries") + "<br>&nbsp;"
    );
    setStatsDivHeight("statViewDiv", "auto");
    GT.statBoxTimer = nodeTimers.setTimeout(renderStatsBox, 250);
  }
  else
  {
    setStatsDiv(
      "statViewDiv",
      "&nbsp;<br>" + I18N("gt.statBox.NoEntries") + "<br>&nbsp;"
    );
    setStatsDivHeight("statViewDiv", "auto");
  }
}

function getTypeFromMode(mode)
{
  if (mode in GT.modes)
  {
    if (GT.modes[mode] == true) return "Digital";
    else if (GT.modes_phone[mode] == true) return "Phone";
    else if (mode == "CW") return "CW";
  }
  return "Other";
}

function workObject(obj, count, band, mode, type, didConfirm) {
  // 1. Fast SMI increment
  obj.worked++;

  // 2. Cache nested dictionaries
  const wBands = obj.worked_bands;
  const wModes = obj.worked_modes;

  // 3. Fast dictionary mutation
  const wBandVal = wBands[band];
  wBands[band] = wBandVal === undefined ? 1 : wBandVal + 1;

  const wModeVal = wModes[mode];
  wModes[mode] = wModeVal === undefined ? 1 : wModeVal + 1;

  // 5. Strict boolean check (No ToBoolean casting)
  if (count === false) {
    const wTypes = obj.worked_types;
    
    const wModeMixed = wTypes.Mixed;
    wTypes.Mixed = wModeMixed === undefined ? 1 : wModeMixed + 1;

    const wModeTypeVal = wTypes[type];
    wTypes[type] = wModeTypeVal === undefined ? 1 : wModeTypeVal + 1;
  }

  // 6. Strict boolean pointer check (No ToBoolean casting)
  if (didConfirm === true) {
    obj.confirmed++;

    const cBands = obj.confirmed_bands;
    const cModes = obj.confirmed_modes;

    const cBandVal = cBands[band];
    cBands[band] = cBandVal === undefined ? 1 : cBandVal + 1;

    const cModeVal = cModes[mode];
    cModes[mode] = cModeVal === undefined ? 1 : cModeVal + 1;

    // Reuse the cached evaluation
    if (count === false) {
      const cTypes = obj.confirmed_types;
      
      const cTypeMixed = cTypes.Mixed;
      cTypes.Mixed = cTypeMixed === undefined ? 1 : cTypeMixed + 1;

      const cTypeVal = cTypes[type];
      cTypes[type] = cTypeVal === undefined ? 1 : cTypeVal + 1;
    }
  }

  return obj;
}

function renderStatsBox()
{
  let html = [];
  let scoreSection = "Initial";
  try
  {
    let dxccInfo = {};
    let cqZones = {};
    let ituZones = {};
    let wasZones = {};
    let wacpZones = {};
    let wacZones = {};
    let countyData = {};
    let gridData = {};
    let wpxData = {};
    let callData = {};

    let long_distance = newDistanceObject();
    let short_distance = newDistanceObject(100000);
    long_distance.band = {};
    long_distance.mode = {};
    long_distance.type = {};
    short_distance.band = {};
    short_distance.mode = {};
    short_distance.type = {};

    let modet = {};
    modet.Mixed = newStatCountObject();
    modet.Digital = newStatCountObject();
    modet.Phone = newStatCountObject();
    modet.CW = newStatCountObject();
    modet.Other = newStatCountObject();

    let details = {};
    details.callsigns = {};

    details.oldest = timeNowSec() + 86400;
    details.newest = 0;

    scoreSection = "QSO";

    for (const [i, qsoObj] of Object.entries(GT.QSOhash)) 
    {
      let finalGrid = qsoObj.grid;
      let vuccGrids = qsoObj.vucc_grids;
      let didConfirm = qsoObj.confirmed;
      let band = qsoObj.band;
      let mode = qsoObj.mode;
      let state = qsoObj.state;
      let cont = qsoObj.cont;
      let finalDxcc = qsoObj.dxcc;
      let cnty = qsoObj.cnty;
      let ituz = qsoObj.ituz;
      let cqz = qsoObj.cqz;
      let wpx = qsoObj.px;
      let call = qsoObj.DXcall;
      let who = qsoObj.DEcall;
      let type = getTypeFromMode(mode);

      if (!(who in callData)) callData[who] = newStatObject();

      workObject(callData[who], false, band, mode, type, didConfirm);

      details.callsigns[call] = ~~details.callsigns[call] + 1;

      if (qsoObj.time < details.oldest) { details.oldest = qsoObj.time; }
      if (qsoObj.time > details.newest) { details.newest = qsoObj.time; }

      workObject(modet.Mixed, true, band, mode, type, didConfirm);

      if (mode in GT.modes)
      {
        if (GT.modes[mode] == true)
        {
          workObject(modet.Digital, true, band, mode, type, didConfirm);
        }
        else if (GT.modes_phone[mode] == true)
        {
          workObject(modet.Phone, true, band, mode, type, didConfirm);
        }
        else if (mode == "CW")
        {
          workObject(modet.CW, true, band, mode, type, didConfirm);
        }
        else workObject(modet.Other, true, band, mode, type, didConfirm);
      }
      else workObject(modet.Other, true, band, mode, type, didConfirm);

      if (state != null && isKnownCallsignDXCC(finalDxcc))
      {
        if (state in GT.StateData)
        {
          let name = state;

          if (name in GT.wasZones)
          {
            if (!(name in wasZones)) wasZones[name] = newStatObject();

            workObject(wasZones[name], false, band, mode, type, didConfirm);
          }
          else if (name in GT.wacpZones)
          {
            if (!(name in wacpZones)) wacpZones[name] = newStatObject();

            workObject(wacpZones[name], false, band, mode, type, didConfirm);
          }
        }
      }

      if (wpx != null)
      {
        if (!(wpx in wpxData)) wpxData[wpx] = newStatObject();

        workObject(wpxData[wpx], false, band, mode, type, didConfirm);
      }

      if (cnty != null)
      {
        if (cnty in GT.cntyToCounty)
        {
          if (!(cnty in countyData)) countyData[cnty] = newStatObject();

          workObject(countyData[cnty], false, band, mode, type, didConfirm);
        }
      }
      if (cont != null)
      {
        if (cont in GT.shapeData)
        {
          let name = GT.shapeData[cont].properties.name;
          if (name in GT.wacZones)
          {
            if (!(name in wacZones)) wacZones[name] = newStatObject();

            workObject(wacZones[name], false, band, mode, type, didConfirm);
          }
        }
      }

      if (finalGrid.length > 0)
      {
        let LL = squareToCenter(finalGrid);
        let unit = parseInt(MyCircle.distance(GT.myLat, GT.myLon, LL.a, LL.o) * MyCircle.validateRadius(distanceUnit.value));

        if (unit > long_distance.worked_unit)
        {
          long_distance.worked_unit = unit;
          long_distance.worked_hash = i;
        }

        if (!(band in long_distance.band)) { long_distance.band[band] = newDistanceObject(); }
        if (!(mode in long_distance.mode)) { long_distance.mode[mode] = newDistanceObject(); }
        if (!(type in long_distance.type)) { long_distance.type[type] = newDistanceObject(); }

        if (unit > long_distance.mode[mode].worked_unit)
        {
          long_distance.mode[mode].worked_unit = unit;
          long_distance.mode[mode].worked_hash = i;
        }

        if (unit >= long_distance.band[band].worked_unit)
        {
          long_distance.band[band].worked_unit = unit;
          long_distance.band[band].worked_hash = i;
        }

        if (unit >= long_distance.type[type].worked_unit)
        {
          long_distance.type[type].worked_unit = unit;
          long_distance.type[type].worked_hash = i;
        }

        if (didConfirm)
        {
          if (unit >= long_distance.confirmed_unit)
          {
            long_distance.confirmed_unit = unit;
            long_distance.confirmed_hash = i;
          }
          if (unit >= long_distance.mode[mode].confirmed_unit)
          {
            long_distance.mode[mode].confirmed_unit = unit;
            long_distance.mode[mode].confirmed_hash = i;
          }
          if (unit >= long_distance.band[band].confirmed_unit)
          {
            long_distance.band[band].confirmed_unit = unit;
            long_distance.band[band].confirmed_hash = i;
          }
          if (unit >= long_distance.type[type].confirmed_unit)
          {
            long_distance.type[type].confirmed_unit = unit;
            long_distance.type[type].confirmed_hash = i;
          }
        }

        if (unit > 0)
        {
          if (unit < short_distance.worked_unit)
          {
            short_distance.worked_unit = unit;
            short_distance.worked_hash = i;
          }

          if (!(band in short_distance.band)) { short_distance.band[band] = newDistanceObject(100000); }
          if (!(mode in short_distance.mode)) { short_distance.mode[mode] = newDistanceObject(100000); }
          if (!(type in short_distance.type)) { short_distance.type[type] = newDistanceObject(100000); }

          if (unit < short_distance.mode[mode].worked_unit)
          {
            short_distance.mode[mode].worked_unit = unit;
            short_distance.mode[mode].worked_hash = i;
          }
          if (unit < short_distance.band[band].worked_unit)
          {
            short_distance.band[band].worked_unit = unit;
            short_distance.band[band].worked_hash = i;
          }
          if (unit < short_distance.type[type].worked_unit)
          {
            short_distance.type[type].worked_unit = unit;
            short_distance.type[type].worked_hash = i;
          }
          if (didConfirm)
          {
            if (unit < short_distance.confirmed_unit)
            {
              short_distance.confirmed_unit = unit;
              short_distance.confirmed_hash = i;
            }
            if (unit < short_distance.mode[mode].confirmed_unit)
            {
              short_distance.mode[mode].confirmed_unit = unit;
              short_distance.mode[mode].confirmed_hash = i;
            }
            if (unit < short_distance.band[band].confirmed_unit)
            {
              short_distance.band[band].confirmed_unit = unit;
              short_distance.band[band].confirmed_hash = i;
            }
            if (unit < short_distance.type[type].confirmed_unit)
            {
              short_distance.type[type].confirmed_unit = unit;
              short_distance.type[type].confirmed_hash = i;
            }
          }
        }
      }

      if (finalDxcc > 0)
      {
        if (!(GT.dxccToAltName[finalDxcc] in dxccInfo)) { dxccInfo[GT.dxccToAltName[finalDxcc]] = newStatObject(); }

        workObject(
          dxccInfo[GT.dxccToAltName[finalDxcc]],
          false,
          band,
          mode,
          type,
          didConfirm
        );
      }

      if (cqz && cqz.length > 0)
      {
        let name = GT.cqZones[cqz].name;
        if (!(name in cqZones)) cqZones[name] = newStatObject();

        workObject(cqZones[name], false, band, mode, type, didConfirm);
      }

      if (ituz && ituz.length > 0)
      {
        if (!(ituz in ituZones)) ituZones[ituz] = newStatObject();

        workObject(ituZones[ituz], false, band, mode, type, didConfirm);
      }

      if (finalGrid.length > 0)
      {
        let gridCheck = finalGrid.substr(0, 4);

        if (!(gridCheck in gridData)) gridData[gridCheck] = newStatObject();

        workObject(gridData[gridCheck], false, band, mode, type, didConfirm);
      }

      if (vuccGrids && vuccGrids.length > 0)
      {
        for (let vuccIdx = 0; vuccIdx < vuccGrids.length; vuccIdx++)
        {
          let gridCheck = vuccGrids[vuccIdx].substr(0, 4);

          if (!(gridCheck in gridData)) gridData[gridCheck] = newStatObject();

          workObject(gridData[gridCheck], false, band, mode, type, didConfirm);
        }
      }
    }

    scoreSection = "Stats";

    const stats = {
      DXCC: dxccInfo,
      GRID: gridData,
      CQ: cqZones,
      ITU: ituZones,
      WAC: wacZones,
      WAS: wasZones,
      WACP: wacpZones,
      USC: countyData,
      WPX: wpxData,
      WRFA: callData
    };

    const output = {};
    const statKeys = Object.keys(stats);

    for (let sIdx = 0; sIdx < statKeys.length; sIdx++)
    {
      const statName = statKeys[sIdx];
      const currentStat = stats[statName];
      const outObj = output[statName] = newStatCountObject();
      
      const subKeys = Object.keys(currentStat);
      
      for (let kIdx = 0; kIdx < subKeys.length; kIdx++)
      {
        const key = subKeys[kIdx];
        const statItem = currentStat[key];

        if (statItem.worked)
        {
          outObj.worked++;
          if (statItem.worked > outObj.worked_high)
          {
            outObj.worked_high = statItem.worked;
            outObj.worked_high_key = key;
          }
        }
        if (statItem.confirmed)
        {
          outObj.confirmed++;
          if (statItem.confirmed > outObj.confirmed_high)
          {
            outObj.confirmed_high = statItem.confirmed;
            outObj.confirmed_high_key = key;
          }
        }

        // V8 Fast Array Loops
        const wBands = Object.keys(statItem.worked_bands);
        for (let bIdx = 0; bIdx < wBands.length; bIdx++)
        {
          const band = wBands[bIdx];
          outObj.worked_bands[band] = ~~outObj.worked_bands[band] + 1;
        }

        const cBands = Object.keys(statItem.confirmed_bands);
        for (let bIdx = 0; bIdx < cBands.length; bIdx++)
        {
          const band = cBands[bIdx];
          outObj.confirmed_bands[band] = ~~outObj.confirmed_bands[band] + 1;
        }

        const wModes = Object.keys(statItem.worked_modes);
        for (let mIdx = 0; mIdx < wModes.length; mIdx++)
        {
          const mode = wModes[mIdx];
          outObj.worked_modes[mode] = ~~outObj.worked_modes[mode] + 1;
        }

        const cModes = Object.keys(statItem.confirmed_modes);
        for (let mIdx = 0; mIdx < cModes.length; mIdx++)
        {
          const mode = cModes[mIdx];
          outObj.confirmed_modes[mode] = ~~outObj.confirmed_modes[mode] + 1;
        }

        const wTypes = Object.keys(statItem.worked_types);
        for (let tIdx = 0; tIdx < wTypes.length; tIdx++)
        {
          const type = wTypes[tIdx];
          outObj.worked_types[type] = ~~outObj.worked_types[type] + 1;
        }

        const cTypes = Object.keys(statItem.confirmed_types);
        for (let tIdx = 0; tIdx < cTypes.length; tIdx++)
        {
          const type = cTypes[tIdx];
          outObj.confirmed_types[type] = ~~outObj.confirmed_types[type] + 1;
        }
      }

      stats[statName] = null; // Free pointer memory early
    }
    scoreSection = "Modes";

    output.MIXED = modet.Mixed;
    output.DIGITAL = modet.Digital;
    output.PHONE = modet.Phone;
    output.CW = modet.CW;
    output.Other = modet.Other;

    // V8-Friendly Array loop instead of for...in
    const outKeys = Object.keys(output);
    for (let i = 0; i < outKeys.length; i++)
    {
      const out = output[outKeys[i]];
      out.worked_band_count = Object.keys(out.worked_bands).length;
      out.confirmed_band_count = Object.keys(out.confirmed_bands).length;
      out.worked_mode_count = Object.keys(out.worked_modes).length;
      out.confirmed_mode_count = Object.keys(out.confirmed_modes).length;
      out.worked_type_count = Object.keys(out.worked_types).length;
      out.confirmed_type_count = Object.keys(out.confirmed_types).length;
    }

    // Converted to native Arrays instead of numeric-key Objects
    const TypeNames = [
      ["MIXED", I18N("gt.typeNames.Mixed"), ""],
      ["DIGITAL", I18N("gt.typeNames.Digital"), ""],
      ["PHONE", I18N("gt.typeNames.Phone"), ""],
      ["CW", I18N("gt.typeNames.CW"), ""],
      ["Other", I18N("gt.typeNames.Other"), ""]
    ];

    const AwardNames = [
      ["WRFA", I18N("gt.awardNames.WRFA"), "WRFA", "yellow"],
      ["GRID", I18N("gt.awardNames.Grid"), "GSA", "cyan"],
      ["DXCC", I18N("gt.awardNames.DXCC"), "DXWA", "orange"],
      ["CQ", I18N("gt.awardNames.CQ"), "WAZ", "lightgreen"],
      ["ITU", I18N("gt.awardNames.ITU"), "ITUz", "#DD44DD"],
      ["WAC", I18N("gt.awardNames.WAC"), "WAC", "cyan"],
      ["WAS", I18N("gt.awardNames.WAS"), "WAS", "lightblue"],
      ["USC", I18N("gt.awardNames.USC"), "USA-CA", "orange"],
      ["WPX", I18N("gt.awardNames.WPX"), "WPX", "yellow"],
      ["WACP", "CA Provinces", "WACP", "lightblue"]
    ];

    const callsignsCount = Object.keys(details.callsigns).length;
    const callsignsList = Object.keys(details.callsigns).sort().join(", ");
    const distUnitStr = distanceUnit.value.toLowerCase();

    // Template Literals drastically improve HTML readability
    html.push(`<font color='cyan'>`);
    html.push(`<h1>${I18N("gt.logbook.title")}</h1>`);
    html.push(`<table style='display:inline-table;margin:5px;' class='darkTable'>`);
    
    html.push(`<tr><td>Callsign${callsignsCount > 1 ? "s" : ""}</td><td style='color:yellow'><b>${callsignsList}</b></td></tr>`);
    html.push(`<tr><td>${I18N("gt.logbook.firstContact")}</td><td style='color:white'>${userTimeString(details.oldest * 1000)}</td></tr>`);
    html.push(`<tr><td>${I18N("gt.logbook.lastContact")}</td><td style='color:white'>${userTimeString(details.newest * 1000)}</td></tr>`);
    
    html.push(`</table><br>`);
    
    html.push(`<h1>${I18N("gt.logbook.scoreCard")}</h1>`);
    html.push(`<table style='display:inline-table;margin:5px;' class='darkTable'>`);
    html.push(`<tr><th>${I18N("gt.logbook.topScore")}</th><th style='color:yellow'>${I18N("gt.logbook.worked")}</th><th style='color:lightgreen'>${I18N("gt.logbook.confirmed")}</th></tr>`);

    for (let i = 0; i < AwardNames.length; i++)
    {
      const [awdId, awdLabel, awdCode, color] = AwardNames[i];
      scoreSection = "Award " + awdLabel;
      
      const info = output[awdId];
      
      let confirmedHtml = `<td></td>`;
      if (info.confirmed_high_key)
      {
        confirmedHtml = `<td style='color:${color}'>${info.confirmed_high_key}<font color='white'> (${info.confirmed_high})</font></td>`;
      }

      html.push(`<tr><td style='color:white'>${awdLabel}</td>` +
                `<td style='color:${color}'>${info.worked_high_key}<font color='white'> (${info.worked_high})</font></td>` +
                confirmedHtml +
                `</tr>`);
    }

    // Helper to format Distance Cells cleanly
    const buildDistCell = (distObj, unitColor, isConfirmed) => {
      const hash = isConfirmed ? distObj.confirmed_hash : distObj.worked_hash;
      const val = isConfirmed ? distObj.confirmed_unit : distObj.worked_unit;
      
      let res = `<td style='color:${unitColor}'>${val} ${distUnitStr}`;
      
      // Pointer cache avoids slow "in" prototype lookups
      const qso = hash ? GT.QSOhash[hash] : null; 
      if (qso && (!isConfirmed || val > 0)) {
        res += `<font style='color:yellow'> ${qso.DEcall}</font><font style='color:orange'> ${qso.grid}</font>`;
      } else if (isConfirmed) {
        return `<td></td>`;
      }
      
      return res + `</td>`;
    };

    scoreSection = "Long Distance";
    html.push(`<tr><td style='color:white'>${I18N("gt.score.LongDist")}</td>`);
    html.push(buildDistCell(long_distance, "lightgreen", false));
    html.push(buildDistCell(long_distance, "lightgreen", true));
    html.push(`</tr>`);

    scoreSection = "Short Distance";
    html.push(`<tr><td style='color:white'>${I18N("gt.score.ShortDist")}</td>`);
    html.push(buildDistCell(short_distance, "lightblue", false));
    html.push(buildDistCell(short_distance, "lightblue", true));
    html.push(`</tr>`);

    html.push(`</table><br>`);

    scoreSection = "DX Marathon";
    html.push(getDXMarathon());

    html.push(`<h1>${I18N("gt.AwardTypes")}</h1>`);
    scoreSection = "Award Types";
    for (let i = 0; i < AwardNames.length; i++)
    {
      const [awdId, awdLabel, awdCode] = AwardNames[i];
      html.push(createStatTable(awdLabel, output[awdId], awdCode));
    }

    html.push(`<br>`);

    html.push(`<h1>${I18N("gt.ModeTypes")}</h1>`);
    scoreSection = "Mode Types";
    for (let i = 0; i < TypeNames.length; i++)
    {
      const [typeId, typeLabel, typeCode] = TypeNames[i];
      html.push(createStatTable(typeLabel, output[typeId], typeCode));
    }

    html.push(`<br>`);

    html.push(`<h1>${I18N("gt.Distances")}</h1>`);
    scoreSection = "Distances";
    html.push(createDistanceTable(long_distance, I18N("gt.LongestDist")));
    html.push(createDistanceTable(short_distance, I18N("gt.ShortestDist")));
    html.push(`<br>`);
  }
  catch (e)
  {
    html.push(`<br> In Section: ${scoreSection}<br>${I18N("gt.scorecardError")}`);
  }

  setStatsDiv("statViewDiv", html.join(""));
  setStatsDivHeight("statViewDiv", getStatsWindowHeight() + 29 + "px");
}

function createDistanceTable(obj, name)
{
  let html = `<table style='display:inline-table;margin:5px;' class='darkTable'>
    <tr><th colspan=3 align=left style='font-size:15px;color:cyan;'>${name}</th></tr>
    <tr><td></td><td><font color='yellow'>${I18N("gt.distanceTable.Worked")}</font></td><td colspan=2><font color='lightgreen'>${I18N("gt.distanceTable.Confirmed")}</font></td></tr>`;

  const categories = [
    { id: "band", color: "lightgreen", label: I18N("gt.distanceTable.Bands"), sort: numberSort },
    { id: "mode", color: "orange", label: I18N("gt.distanceTable.Modes") },
    { id: "type", color: "#DD44DD", label: I18N("gt.distanceTable.Types") }
  ];

  const distUnit = distanceUnit.value.toLowerCase();

  for (let cat of categories)
  {
    let catObj = obj[cat.id];
    let keys = Object.keys(catObj).sort(cat.sort);

    const buildRows = (isConf) => keys.map(key => {
      let entry = catObj[key];
      let hash = isConf ? entry.confirmed_hash : entry.worked_hash;
      let unit = isConf ? entry.confirmed_unit : entry.worked_unit;
      
      if (hash && GT.QSOhash[hash]) {
        let qso = GT.QSOhash[hash];
        return `<tr><td align=right>${key}</td><td style='color:lightgreen' align=left>(${unit} ${distUnit})</td>
          <td style='color:yellow;cursor:pointer' align=left onclick='window.opener.startLookup("${qso.DEcall}","${qso.grid}");'>${qso.DEcall}</td>
          <td style='color:orange' align=left>${qso.grid}</td></tr>`;
      }
      return isConf ? "<tr><td>&nbsp;</td></tr>" : "";
    }).join("");

    let workedRows = buildRows(false);
    let confRows = buildRows(true);

    if (workedRows || confRows.replace(/<tr><td>&nbsp;<\/td><\/tr>/g, "")) {
      html += `<tr><td align=center><font color='${cat.color}'>${cat.label}</font></td>
        <td align=left><table class='subtable'>${workedRows}</table></td>
        <td align=left><table class='subtable'>${confRows}</table></td></tr>`;
    }
  }

  return html + "</table>";
}

function numberSort(a, b)
{
  const toMeters = (s) =>
  {
    const v = parseFloat(s);
    if (isNaN(v)) return Infinity;          // non-bands sort last
    return s.endsWith("cm") ? v * 0.01 : s.endsWith("mm") ? v *.001 : v;
  };
  return toMeters(a) - toMeters(b);
}

function createStatTable(title, infoObject, awardName)
{
  if (!infoObject || !infoObject.worked) return "";

  let html = `<table style='display:inline-table;margin:5px;' class='darkTable'>
    <tr><th colspan=3 align=left style='font-size:15px;color:cyan;'>${title}</th></tr>
    <tr><th>${awardName}</th><td><font color='yellow'>${I18N("gt.statTable.Worked")}</font> <font color='white'>(${infoObject.worked})</font></td>
    <td colspan=2><font color='lightgreen'>${I18N("gt.statTable.Confirmed")}</font> <font color='white'>(${infoObject.confirmed})</font></td></tr>`;

  const categories = [
    { label: I18N("gt.statTable.Bands"), color: "lightgreen", wDict: infoObject.worked_bands, cDict: infoObject.confirmed_bands, sort: numberSort, count: infoObject.worked_band_count },
    { label: I18N("gt.statTable.Modes"), color: "orange", wDict: infoObject.worked_modes, cDict: infoObject.confirmed_modes, sort: undefined, count: infoObject.worked_mode_count },
    { label: I18N("gt.statTable.Types"), color: "#DD44DD", wDict: infoObject.worked_types, cDict: infoObject.confirmed_types, sort: undefined, count: infoObject.worked_type_count }
  ];

  for (let cat of categories)
  {
    if (cat.count === 0 && cat.label === I18N("gt.statTable.Types")) continue;

    let keys = Object.keys(cat.wDict).sort(cat.sort);
    
    let wRows = keys.map(k => `<tr><td align=right>${k}</td><td align=left> <font color='white'>(${cat.wDict[k]})</font></td></tr>`).join("");
    let cRows = keys.map(k => cat.cDict[k] ? `<tr><td align=right>${k}</td><td align=left> <font color='white'>(${cat.cDict[k]})</font></td></tr>` : `<tr><td>&nbsp;</td></tr>`).join("");

    html += `<tr><td align=center><font color='${cat.color}'>${cat.label}</font></td>
      <td align=left><table class='subtable'>${wRows}</table></td>
      <td align=left><table class='subtable'>${cRows}</table></td></tr>`;
  }

  return html + "</table>";
}
