// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Map mouse handling: clicks, hover dispatch (GT.hoverFunctors), tooltips, right-drag grid selection (moved from GridTracker2.js)

function createTooltTipTable(toolElement)
{
  if ("spot" in toolElement)
  {
    return createSpotTipTable(toolElement);
  }

  const isQso = toolElement.qso === true;
  const qth = toolElement.qth;

  const showLoTW = GT.settings.callsignLookups.lotwUseEnable === true;
  const showEQSL = GT.settings.callsignLookups.eqslUseEnable === true;
  const showOQRS = GT.settings.callsignLookups.oqrsUseEnable === true;

  const lookupColumnCount =
    (showLoTW ? 1 : 0) +
    (showEQSL ? 1 : 0) +
    (showOQRS ? 1 : 0);

  const colspan = 10 + (isQso ? 1 : 0) + lookupColumnCount;
  const newCallList = [];

  function addQsoCalls()
  {
    const hashes = toolElement.hashes || {};

    for (const hash in hashes)
    {
      if (hash in GT.QSOhash)
      {
        newCallList.push(GT.QSOhash[hash]);
      }
    }

    if (
      qth in GT.liveGrids &&
      GT.liveGrids[qth].rectangle != null &&
      GT.liveGrids[qth].isTriangle === false &&
      GT.settings.app.gridViewMode == 3
    )
    {
      const liveHash = GT.liveGrids[qth].rectangle.liveHash || {};
      for (const call in liveHash)
      {
        if (call in GT.liveCallsigns)
        {
          newCallList.push(GT.liveCallsigns[call]);
        }
      }
    }
  }

  function addLiveCalls()
  {
    const liveHash = toolElement.liveHash || {};
    for (const call in liveHash)
    {
      if (call in GT.liveCallsigns)
      {
        newCallList.push(GT.liveCallsigns[call]);
      }
    }
  }

  function buildGridInfo()
  {
    if (!(qth in GT.gridToDXCC))
    {
      return "";
    }

    let parts = [];
    const dxccList = GT.gridToDXCC[qth];
    const stateList = qth in GT.gridToState ? GT.gridToState[qth] : null;

    for (let x = 0; x < dxccList.length; x++)
    {
      const dxcc = dxccList[x];
      let text = GT.dxccToAltName[dxcc];

      if (stateList)
      {
        const stateNames = [];

        for (let y = 0; y < stateList.length; y++)
        {
          const stateKey = stateList[y];
          if (GT.StateData[stateKey].dxcc == dxcc)
          {
            stateNames.push(GT.StateData[stateKey].name);
          }
        }

        if (stateNames.length > 0)
        {
          text += " (<font color='orange'>" + stateNames.join(" / ") + "</font>)";
        }
      }

      parts.push(text);
    }

    return (
      "<tr><th colspan='" +
      colspan +
      "' style='color:yellow'><small>" +
      parts.join(", ") +
      "</small></th></tr>"
    );
  }

  function buildHeaderRow()
  {
    let cells = [
      I18N("gt.newCallList.Call"),
      I18N("gt.newCallList.Freq"),
      I18N("gt.newCallList.Sent"),
      I18N("gt.newCallList.Rcvd"),
      I18N("gt.newCallList.Station"),
      I18N("gt.newCallList.Mode"),
      I18N("gt.newCallList.Band")
    ];

    if (isQso)
    {
      cells.push(I18N("gt.newCallList.QSL"));
    }

    cells.push(
      I18N("gt.newCallList.LastMsg"),
      I18N("gt.newCallList.DXCC"),
      I18N("gt.newCallList.Time")
    );

    if (showLoTW) cells.push(I18N(isQso ? "gt.qsoPage.LoTW" : "gt.newCallList.LoTW"));
    if (showEQSL) cells.push(I18N(isQso ? "gt.qsoPage.eQSL" : "gt.newCallList.eQSL"));
    if (showOQRS) cells.push(I18N(isQso ? "gt.qsoPage.OQRS" : "gt.newCallList.OQRS"));

    return "<tr align='center'><td>" + cells.join("</td><td>") + "</td></tr>";
  }

  function getAgeString(call)
  {
    const age = timeNowSec() - call.time;
    return age < 3601 ? toDHMS(age) : userTimeString(call.time * 1000);
  }

  function getDxccText(call)
  {
    const info = GT.dxccInfo[call.dxcc];
    const name = GT.dxccToAltName[call.dxcc] || "";
    const pp = info ? info.pp : "?";

    return (
      "<td style='color:yellow'>" +
      name +
      " <font color='lightgreen'>(" +
      pp +
      ")</font></td>"
    );
  }

  function getLookupCell(enabledSet, call)
  {
    return "<td align='center'>" + (call.DEcall in enabledSet ? "&#10004;" : "") + "</td>";
  }

  function buildCallRow(call)
  {
    const isMyDX = call.DXcall == GT.settings.app.myCall;
    const isMyDE = call.DEcall == GT.settings.app.myCall;
    const bgDX = isMyDX ? "background-color:cyan;color:#000;font-weight:bold" : "font-weight:bold;color:cyan;";
    const bgDE = isMyDE ? "background-color:#FFFF00;color:#000;font-weight:bold" : "font-weight:bold;color:yellow;";
    const msg = call.msg || "-";

    let dxCallHtml = (call.DXcall.indexOf("CQ") == 0 || call.DXcall == "-") 
      ? formatCallsign(call.DXcall) 
      : `<div style='display:inline-table;cursor:pointer' onclick='startLookup("${call.DXcall}",null);'>${formatCallsign(call.DXcall)}</div>`;

    return `
      <tr>
        <td style='${bgDE}'>
          <div style='display:inline-table;cursor:pointer' onclick='startLookup("${call.DEcall}","${qth}");'>${formatCallsign(call.DEcall)}</div>
        </td>
        <td>${call.delta > -1 ? call.delta : "-"}</td>
        <td>${call.RSTsent}</td>
        <td>${call.RSTrecv}</td>
        <td style='${bgDX}'>${dxCallHtml}</td>
        <td style='color:lightblue'>${call.mode}</td>
        <td style='color:lightgreen'>${call.band}</td>
        ${isQso ? `<td align='center'>${call.confirmed ? "&#10004;" : ""}</td>` : ""}
        <td>${msg}</td>
        ${getDxccText(call)}
        <td align='center' style='color:lightblue'>${getAgeString(call)}</td>
        ${showLoTW ? getLookupCell(GT.lotwCallsigns, call) : ""}
        ${showEQSL ? getLookupCell(GT.eqslCallsigns, call) : ""}
        ${showOQRS ? getLookupCell(GT.oqrsCallsigns, call) : ""}
      </tr>`;
  }

  if (isQso)
  {
    addQsoCalls();
  }
  else
  {
    addLiveCalls();
  }

  newCallList.sort(function (a, b)
  {
    return compareCallsignTime(b, a);
  });

  let rows = [];

  rows.push(
    "<table id='tooltipTable' class='darkTable'>" +
    "<tr><th colspan='" +
    colspan +
    "' style='color:cyan'>" +
    qth +
    " (<font color='white'>" +
    I18N(isQso ? "gt.gridView.logbook" : "gt.gridView.live") +
    "</font>)</th></tr>"
  );

  rows.push(buildGridInfo());

  if (newCallList.length > 0)
  {
    rows.push(buildHeaderRow());

    for (let i = 0; i < newCallList.length; i++)
    {
      rows.push(buildCallRow(newCallList[i]));
    }
  }

  rows.push("</table>");

  myTooltip.innerHTML = rows.join("");

  return newCallList.length;
}

function leftClickGtFlag(feature)
{
  let e = window.event;
  if ((e.which && e.which == 1) || (e.button && e.button == 1))
  {
    startLookup(GT.rtsnPins[feature.key].call, GT.rtsnPins[feature.key].grid);
  }
  return false;
}

function onRightClickGridSquare(feature)
{
  let e = window.event;
  if ((e.which && e.button == 2 && event.shiftKey) || (e.button && e.button == 2 && event.shiftKey))
  {
    createTooltTipTable(feature);
    selectElementContents(myTooltip);
  }
  else if (e.button == 0 && GT.settings.map.mouseOver == false)
  {
    mouseOverDataItem(feature, false);
  }
  else if ((e.which && e.which == 3) || (e.button && e.button == 2))
  {
    createTooltTipTable(feature);
    renderTooltipWindow(feature);
    mouseOutOfDataItem();
  }
  else if ((e.which && e.which == 1) || (e.button && e.button == 0))
  {
    if ("spot" in feature)
    {
      spotLookupAndSetCall(feature.spot);
    }
  }
  return false;
}

function onMouseUpdate(e)
{
  GT.mouseX = e.pageX;
  GT.mouseY = e.pageY;
  GT.screenX = e.screenX;
  GT.screenY = e.screenY;
  mouseMoveGrid();
}

function getMouseX()
{
  return GT.mouseX;
}

function getMouseY()
{
  return GT.mouseY;
}

function createSpotTipTable(toolElement)
{
  try
  {
    let now = timeNowSec();
    if (toolElement.spot in GT.receptionReports.spots)
    {
      GT.layerSources.pskHop.clear();
      let report = GT.receptionReports.spots[toolElement.spot];

      let LL = squareToCenter(GT.settings.app.myRawGrid);
      let fromPoint = ol.proj.fromLonLat([LL.o, LL.a]);
      let reportLL = squareToCenter(report.grid);

      report.bearing = parseInt(MyCircle.bearing(GT.myLat, GT.myLon, reportLL.a, reportLL.o));
      let dist = parseInt(MyCircle.distance(GT.myLat, GT.myLon, reportLL.a, reportLL.o, distanceUnit.value) * MyCircle.validateRadius(distanceUnit.value));

      let sourceStr = "";
      if ("source" in report) {
        sourceStr = `<tr><td>Source</td><td>`;
        if ("O" in report.source)
        {
          sourceStr += `<span style="color:cyan">GT-RTSN </span>`;
        }
        if ("M" in report.source)
        {
          sourceStr += `<span style="color:orange">PSK-MQTT</span>`;
        }
        sourceStr += `</td></tr>`;
      }

      const gridSpotRow = `<tr><td>Grid</td><td style='${lookupGridCellStyle(report.grid, report.band, report.mode)}'>${report.grid}</td></tr>`;

      myTooltip.innerHTML = `
        <table id='tooltipTable' class='darkTable'>
          <tr><th colspan=2 style='color:cyan'>Rx Spot</th></tr>
          <tr><td>Call</td><td style='color:#ff0'>${formatCallsign(report.call)}</td></tr>
          <tr><td>dB</td><td style='color:#DD44DD'>${formatSignalReport(Number(report.snr))}</td></tr>
          <tr><td>Age</td><td>${toDHMS(Number(now - report.when))}</td></tr>
          ${report.dxcc > 0 ? `<tr><td>DXCC</td><td style='color:orange;'>${GT.dxccToAltName[report.dxcc]} <font color='lightgreen'>(${GT.dxccInfo[report.dxcc].pp})</font></td>` : ""}
          ${gridSpotRow}
          <tr><td>Freq</td><td style='color:lightgreen'>${formatMhz(report.freq)} <font color='yellow'>(${report.band})</font></td></tr>
          <tr><td>Mode</td><td style='color:orange'>${report.mode}</td></tr>
          <tr><td>Dist</td><td style='color:cyan'>${dist}${distanceUnit.value.toLowerCase()}</td></tr>
          <tr><td>Azim</td><td style='color:yellow'>${report.bearing}&deg;</td></tr>
          <tr><td>Time</td><td>${userTimeString(report.when * 1000)}</td></tr>
          ${sourceStr}
        </table>`;

      let toPoint = ol.proj.fromLonLat([reportLL.o, reportLL.a]);

      flightFeature(
        [fromPoint, toPoint],
        { weight: pathWidthValue.value, color: getQrzPathColor(), steps: 75 },
        "pskHop",
        false
      );
    }
    return 10;
  }
  catch (err) { console.error("Unexpected error at createSpotTipTable", toolElement, err) }
}

function createFlagTipTable(feature)
{
  let key = feature.key;
  let pin = GT.rtsnPins[key];
  let dxcc = callsignToDxcc(pin.call);
  let dxccName = GT.dxccToAltName[dxcc];
  let hash = pin.call + GT.settings.app.myBand + GT.settings.app.myMode;
  
  let workColor = (hash in GT.tracker.confirmed.call) ? "#00FF00" : (hash in GT.tracker.worked.call) ? "yellow" : "cyan";

  let LL = squareToCenter(pin.grid);
  let bearing = parseInt(MyCircle.bearing(GT.myLat, GT.myLon, LL.a, LL.o));
  let dist = parseInt(MyCircle.distance(GT.myLat, GT.myLon, LL.a, LL.o) * MyCircle.validateRadius(distanceUnit.value));

  myFlagtip.innerHTML = `
    <div style='background-color:${workColor};color:#000;font-weight:bold;font-size:18px;border:2px solid gray;margin:0px' class='roundBorder'>${pin.fCall}</div>
    <table id='tooltipTable' class='darkTable'>
      <tr><td>DXCC</td><td style='color:orange;'>${dxccName} <font color='lightgreen'>(${GT.dxccInfo[dxcc].pp})</font></td>
      <tr><td>Grid</td><td style='color:cyan;'>${pin.grid}</td></tr>
      <tr><td>Band</td><td style='color:yellow'>${pin.band}</td></tr>
      <tr><td>Mode</td><td style='color:orange'>${pin.mode}</td></tr>
      <tr><td>Dist</td><td style='color:cyan'>${dist}${distanceUnit.value.toLowerCase()}</td></tr>
      <tr><td>Azim</td><td style='color:yellow'>${bearing}&deg;</td></tr>
    </table>`;
}

function createTimezoneTipTable(feature)
{
  let props = feature.getProperties();
  moment.locale(navigator.languages[0]);
  let m = moment().tz(props.tzid);
  let abbr = m.format("zz");
  let zone = m.format("Z");
  abbr = zone.indexOf(abbr) > -1 ? "" : ` <font color='orange'>(${abbr})</font>`;

  myTimezoneTip.innerHTML = `
    <div style='background-color:cyan;color:#000;font-weight:bold;font-size:16px;border:2px solid gray;margin:0px;padding:1px' class='roundBorder'>${props.tzid}</div>
    <table id='tooltipTable' class='darkTable' align=center>
      <tr><td style='color:yellow;font-weight:bold'>${m.format("LLLL")}</td></tr>
      <tr><td style='color:#00FF00;font-weight:bold'>${zone}${abbr}</td></tr>
    </table>`;
}

function moonOver(feature)
{
  if (GT.currentOverlay != 0) return false;

  let data = subLunar(timeNowSec());
  let object = doRAconvert(GT.myLon, GT.myLat, data.RA, data.Dec);
  let elevation = object.elevation.toFixed(1);
  let elColor = elevation <= 0 ? "red" : elevation > 10.0 ? "lightgreen" : "yellow";

  myMoonTooltip.innerHTML = `
    <table class='darkTable'>
      <tr><th colspan=2 style='font-size:15px;color:cyan;'>Moon</th></tr>
      <tr><th>Azimuth</th><td style='color:lightgreen'>${object.azimuth.toFixed(1)}&deg;</td></tr>
      <tr><th>Elevation</th><td style='color:${elColor}'>${elevation}</td></tr>
    </table>`;

  moonMove();
  myMoonTooltip.style.zIndex = 499;
  myMoonTooltip.style.display = "block";
  return true;
}

function mouseDownGrid(longlat)
{
  if (isNaN(longlat[0]) || (GT.useTransform && ((MyCircle.distance(GT.myLat, GT.myLon, longlat[1], longlat[0]) * 3958.761) > k_max_aeqd_grid_in_miles))) return null;

  let grid = latLonToGridSquare(longlat[1], longlat[0]);
  GT.MyCurrentGrid = grid.substr(0, 4);
  let bearing = parseInt(MyCircle.bearing(GT.myLat, GT.myLon, longlat[1], longlat[0]));
  let dist = parseInt(MyCircle.distance(GT.myLat, GT.myLon, longlat[1], longlat[0]) * MyCircle.validateRadius(distanceUnit.value));

  let html = `
    <div style='font-size:14px;font-weight:bold;color:cyan;margin:0 auto' class='roundBorder'>${grid}</div>
    <table align='center' class='darkTable'>
      <tr style='color:white;'>
      <tr><td>Dist</td><td style='color:lightgreen'>${dist}${distanceUnit.value.toLowerCase()}</td></tr>
      <tr><td>Azim</td><td style='color:yellow'>${bearing}&deg;</td></tr>
      <tr><td>Lat</td><td style='color:orange'>${longlat[1].toFixed(3)}</td></tr>
      <tr><td>Long</td><td style='color:lightblue'>${longlat[0].toFixed(3)}</td></tr>
    </table>`;

  if (grid in GT.gridToDXCC)
  {
    let dxccCols = GT.gridToDXCC[grid].map(d => `<td>${GT.dxccToAltName[d]} <font color='lightgreen'>(${GT.dxccInfo[d].pp})</font></td>`).join("");
    let stateCols = "";
    
    if (grid in GT.gridToState)
    {
      stateCols = "</tr><tr style='color:yellow;'>" + GT.gridToDXCC[grid].map(d => {
        let states = GT.gridToState[grid].filter(s => GT.StateData[s].dxcc == d).map(s => GT.StateData[s].name).join("<br>");
        return `<td>${states}</td>`;
      }).join("");
    }
    html += `<table align='center' class='darkTable' style='border-top:none'><tr style='color:orange;'>${dxccCols}${stateCols}</tr></table>`;
    showDxccGrids(grid);
  }

  tempGridToBox(grid, "#000000FF", "#00000000");

  myGridTooltip.innerHTML = html;
  GT.MyGridIsUp = true;
  mouseMoveGrid();
  myGridTooltip.style.zIndex = 499;
  myGridTooltip.style.display = "block";
}

function trophyOver(feature)
{
  let name = feature.getGeometryName();
  let infoObject = {};
  let trophy = "";
  let zone = null;
  let key = feature.get("prop");

  // Trophy Mapping (Retained logic but simplified setup)
  if (key == "cqzone") { trophy = "CQ Zone"; infoObject = GT.cqZones[name]; zone = name; name = GT.cqZones[name].name; }
  else if (key == "ituzone") { trophy = "ITU Zone"; infoObject = GT.ituZones[name]; }
  else if (key == "wac" && name in GT.wacZones) { trophy = "Continent"; infoObject = GT.wacZones[name]; }
  else if (key == "was" && name in GT.wasZones) { trophy = "US State"; infoObject = GT.wasZones[name]; name = GT.StateData[name].name; }
  else if (key == "wacp" && name in GT.wacpZones) { trophy = "CA Provinces"; infoObject = GT.wacpZones[name]; name = GT.StateData[name].name; }
  else if (key == "dxcc" && name in GT.dxccInfo) { trophy = "DXCC"; infoObject = GT.dxccInfo[name]; name = `${GT.dxccInfo[name].name} <font color='orange'>(${GT.dxccInfo[name].pp})</font>`; }
  else if (key == "usc") { trophy = "US County"; infoObject = GT.countyData[name]; name = `${infoObject.geo.properties.n}, ${infoObject.geo.properties.st}`; }
  else if (key == "us48") {
    trophy = "US Continental Grids"; infoObject = GT.us48Data[feature.get("grid")]; name = feature.get("grid");
    if (name in GT.gridToState) {
      let zoneArr = [];
      GT.gridToDXCC[name].forEach(d => {
        GT.gridToState[name].filter(s => d == GT.StateData[s].dxcc && d == 291).forEach(s => zoneArr.push(GT.StateData[s].name));
      });
      zone = zoneArr.join(", ");
    }
  }

  let html = `<div style='font-size:15px;color:cyan;' class='roundBorder'><table><tr><th colspan=2>${trophy}</th></tr>`;
  html += `<tr><td colspan=2><font color='white'><b>${name}</b></font></td></tr>`;
  if (zone) html += `<tr><td colspan=2><font color='lightgreen'>${zone}</font></td></tr>`;

  if (!infoObject.worked && !infoObject.confirmed) {
    html += `<tr><td colspan=2><font color='orange'>${I18N("gt.wcTable.Needed")}</font></td></tr>`;
  } else {
    html += `<tr>`;
    if (infoObject.worked) {
      let wBands = Object.keys(infoObject.worked_bands).sort().map(b => `<tr><td align=right>${b}</td><td align=left> <font color='white'>(${infoObject.worked_bands[b]})</font></td></tr>`).join("");
      let wModes = Object.keys(infoObject.worked_modes).sort().map(m => `<tr><td align=right>${m}</td><td align=left> <font color='white'>(${infoObject.worked_modes[m]})</font></td></tr>`).join("");
      html += `<td align=center><table class='darkTable'>
        <tr><td colspan=2><font color='yellow'>${I18N("gt.wcTable.Worked")}</font></td></tr>
        <tr><td align=right><font color='green'>Band</font></td><td align=left><table class='subtable'>${wBands}</table></td></tr>
        <tr><td align=right><font color='orange'>${I18N("gt.wcTable.Mode")}</font></td><td align=left><table class='subtable'>${wModes}</table></td></tr>
      </table></td>`;
    } else html += `<td></td>`;

    if (infoObject.confirmed) {
      let cBands = Object.keys(infoObject.confirmed_bands).sort().map(b => `<tr><td align=right>${b}</td><td align=left> <font color='white'>(${infoObject.confirmed_bands[b]})</font></td></tr>`).join("");
      let cModes = Object.keys(infoObject.confirmed_modes).sort().map(m => `<tr><td align=right>${m}</td><td align=left> <font color='white'>(${infoObject.confirmed_modes[m]})</font></td></tr>`).join("");
      html += `<td align=center><table class='darkTable'>
        <tr><td colspan=2><font color='lightgreen'>${I18N("gt.wcTable.Confirmed")}</font></td></tr>
        <tr><td align=right><font color='green'>${I18N("gt.wcTable.Band")}</font></td><td align=left><table class='subtable'>${cBands}</table></td></tr>
        <tr><td align=right><font color='orange'>${I18N("gt.wcTable.Mode")}</font></td><td align=left><table class='subtable'>${cModes}</table></td></tr>
      </table></td>`;
    } else html += `<td></td>`;
    html += `</tr>`;
  }
  html += `</table></div>`;

  myTrophyTooltip.innerHTML = html;
  trophyMove(feature);
  myTrophyTooltip.style.zIndex = 499;
  myTrophyTooltip.style.display = "block";
  return true;
}

function moonMove(feature)
{
  let positionInfo = myMoonTooltip.getBoundingClientRect();
  myMoonTooltip.style.left = getMouseX() - positionInfo.width / 2 + "px";
  myMoonTooltip.style.top = getMouseY() - positionInfo.height - 22 + "px";
}

function moonOut(feature)
{
  myMoonTooltip.style.zIndex = -1;
}

function trophyMove(feature)
{
  let positionInfo = myTrophyTooltip.getBoundingClientRect();
  myTrophyTooltip.style.left = getMouseX() - positionInfo.width / 2 + "px";
  myTrophyTooltip.style.top = getMouseY() - positionInfo.height - 22 + "px";
}

function trophyOut(feature)
{
  myTrophyTooltip.style.zIndex = -1;
}

function mouseMoveGrid()
{
  if (GT.MyGridIsUp == true)
  {
    let positionInfo = myGridTooltip.getBoundingClientRect();
    myGridTooltip.style.left = getMouseX() - positionInfo.width / 2 + "px";
    myGridTooltip.style.top = getMouseY() - positionInfo.height - 22 + "px";
  }
}

function mouseUpGrid()
{
  GT.MyGridIsUp = false;
  myGridTooltip.style.zIndex = -1;
  clearTempGrids();
}

function mouseOverGtFlag(feature)
{
  createFlagTipTable(feature);
  mouseGtFlagMove(feature);

  myFlagtip.style.zIndex = 499;
  myFlagtip.style.display = "block";
  return true;
}

function mouseGtFlagMove(feature)
{
  let positionInfo = myFlagtip.getBoundingClientRect();
  myFlagtip.style.left = getMouseX() - positionInfo.width / 2 + "px";
  myFlagtip.style.top = getMouseY() - positionInfo.height - 22 + "px";
}

function mouseOutGtFlag(feature)
{
  myFlagtip.style.zIndex = -1;
}

function mouseOverTimezone(feature)
{
  let style = new ol.style.Style({
    fill: new ol.style.Fill({
      color: "#FFFF0088"
    })
  });
  feature.setStyle(style);

  createTimezoneTipTable(feature);

  TimezoneMove();

  myTimezoneTip.style.zIndex = 499;
  myTimezoneTip.style.display = "block";

  return true;
}

function TimezoneMove()
{
  let positionInfo = myTimezoneTip.getBoundingClientRect();
  myTimezoneTip.style.left = getMouseX() - positionInfo.width / 2 + "px";
  myTimezoneTip.style.top = getMouseY() - positionInfo.height - 22 + "px";
}

function mouseOutZimezone(feature)
{
  myTimezoneTip.style.zIndex = -1;
  feature.setStyle(null);
}

function mouseOverSpotItem(feature, fromHover)
{
  if (GT.MyGridIsUp) return false;
  if (GT.settings.map.mouseOver == true && fromHover == false) return false;
  if (GT.settings.map.mouseOver == false && fromHover == true) return false;

  createTooltTipTable(feature);

  mouseMoveDataItem(feature);

  myTooltip.style.zIndex = 500;
  myTooltip.style.display = "block";
  return true;
}

function mouseOverDataItem(feature, fromHover)
{
  if (GT.currentOverlay != 0) return false;
  if (GT.MyGridIsUp) return false;
  if (GT.settings.map.mouseOver == true && fromHover == false) return false;
  if (GT.settings.map.mouseOver == false && fromHover == true) return false;

  createTooltTipTable(feature);

  mouseMoveDataItem(feature);

  myTooltip.style.zIndex = 500;
  myTooltip.style.display = "block";
  return true;
}

function mouseMoveDataItem(feature)
{
  let positionInfo = myTooltip.getBoundingClientRect();
  let windowWidth = window.innerWidth;
  let windowHeight = window.innerHeight;
  let top = 0;
  let left = 0;
  let noRoomLeft = false;
  let noRoomRight = false;

  top = getMouseY() - (positionInfo.height / 2);
  // Favor the left side over the right side (avoid covering the work panel if possible)
  if (getMouseX() - positionInfo.width < 0)
  {
    noRoomLeft = true;
    left = getMouseX() + 10;
  }
  else
  {
    left = getMouseX() - (10 + positionInfo.width);
  }
  if (windowWidth - getMouseX() < positionInfo.width)
  {
    noRoomRight = true;
  }

  if (noRoomLeft == true && noRoomRight == true)
  {
    if (positionInfo.width >= windowWidth)
    {
      left = 0;
    }
    else
    {
      left = getMouseX() - (positionInfo.width / 2);
      if (left + positionInfo.width > windowWidth)
      {
        left = windowWidth - positionInfo.width;
      }
    }

    top = getMouseY() + 10;
    if (positionInfo.height < getMouseY() - 10)
    {
      top = (getMouseY() - positionInfo.height) - 10;
    }
  }
  else
  {
    if (top + positionInfo.height > windowHeight)
    {
      top = windowHeight - positionInfo.height;
    }
  }
  if (top < 0) { top = 0; }
  if (left < 0) { left = 0; }
  myTooltip.style.top = parseInt(top) + "px";
  myTooltip.style.left = parseInt(left) + "px";
}

function mouseOutOfDataItem(feature)
{
  myTooltip.style.zIndex = -1;

  if (GT.spotView == 1) GT.layerSources.pskHop.clear();
}

function toggleMouseTrack()
{
  GT.settings.app.mouseTracking = !GT.settings.app.mouseTracking;
  displayMouseTrack();
}

function displayMouseTrack()
{
  mouseTrackDiv.style.display = (GT.settings.app.mouseTracking) ? "block" : "none";
}

function initHoverFunctors()
{
  GT.hoverFunctors.tz = { hover: mouseOverTimezone, move: TimezoneMove, out: mouseOutZimezone };
  GT.hoverFunctors.grid = { hover: mouseOverDataItem, move: mouseMoveDataItem, out: mouseOutOfDataItem };
  GT.hoverFunctors.pin = { hover: mouseOverDataItem, move: mouseMoveDataItem, out: mouseOutOfDataItem };
  GT.hoverFunctors.moon = { hover: moonOver, move: moonMove, out: moonOut };
  GT.hoverFunctors.dxcc = { hover: trophyOver, move: trophyMove, out: trophyOut };
  GT.hoverFunctors.cqzone = { hover: trophyOver, move: trophyMove, out: trophyOut };
  GT.hoverFunctors.ituzone = { hover: trophyOver, move: trophyMove, out: trophyOut };
  GT.hoverFunctors.wac = { hover: trophyOver, move: trophyMove, out: trophyOut };
  GT.hoverFunctors.was = { hover: trophyOver, move: trophyMove, out: trophyOut };
  GT.hoverFunctors.wacp = { hover: trophyOver, move: trophyMove, out: trophyOut };
  GT.hoverFunctors.usc = { hover: trophyOver, move: trophyMove, out: trophyOut };
  GT.hoverFunctors.us48 = { hover: trophyOver, move: trophyMove, out: trophyOut };
  GT.hoverFunctors.parkFlag = { hover: mouseOverPark, move: mouseParkMove, out: mouseOutPark };
  GT.hoverFunctors.gtFlag = { hover: mouseOverGtFlag, move: mouseGtFlagMove, out: mouseOutGtFlag };
  GT.hoverFunctors.spot = { hover: mouseOverSpotItem, move: mouseMoveDataItem, out: mouseOutOfDataItem };
}

function mouseDownEvent(event)
{
  if (event.activePointers[0].buttons == 1 && event.activePointers[0].ctrlKey == true)
  {
    let LL = ol.proj.toLonLat(event.coordinate, GT.settings.map.projection);
    let info = {};
    info.callObj = {};
    info.callObj.distance = 1; // We just need the heading, but distance makes it valid
    info.callObj.heading = parseInt(MyCircle.bearing(GT.myLat, GT.myLon, LL[1], LL[0]));
    aimRotator(info);
  }

  let shouldReturn = false;
  let features = GT.map.getFeaturesAtPixel(event.pixel);
  if (features != null && features.length > 0)
  {
    features = features.reverse();
    let finalGridFeature = null;
    for (let i = 0; i < features.length; i++)
    {
      const feature = features[i];
      if (!(feature.values_.prop in GT.hoverFunctors)) continue;
      if (feature.size == 6)
      {
        finalGridFeature = feature;
      }
      if (feature.size == 4 && finalGridFeature == null)
      {
        finalGridFeature = feature;
      }
      if (feature.size == 1)
      {
        leftClickGtFlag(feature);
        shouldReturn = true;
      }
      if (feature.size == 22)
      {
        leftClickPota(feature.key);
        shouldReturn = true;
      }
    }
    if (finalGridFeature)
    {
      onRightClickGridSquare(finalGridFeature);
      shouldReturn = true;
    }
  }

  if (shouldReturn) return true;

  if (event.activePointers[0].buttons == 2 && GT.currentOverlay == 0)
  {
    mouseDownGrid(ol.proj.toLonLat(event.coordinate, GT.settings.map.projection));
    return true;
  }
}

function mouseUpEvent(event)
{
    mouseUpGrid();
    if (GT.settings.map.mouseOver == false)
    {
      mouseOutOfDataItem();
    }
}

function mapMoveEvent(event)
{
  onMouseUpdate(event);

  let mousePosition = GT.map.getEventPixel(event);
  if (GT.settings.app.mouseTracking)
  {
    let mouseLngLat = GT.map.getEventCoordinate(event);
    if (mouseLngLat)
    {
      let LL = ol.proj.toLonLat(mouseLngLat, GT.settings.map.projection);
      if (isNaN(LL[0]))
      {
        mouseTrackDiv.innerHTML = "";
      }
      else
      {
        let dist = ~~(MyCircle.distance(GT.myLat, GT.myLon, LL[1], LL[0]) * MyCircle.validateRadius(distanceUnit.value)) + distanceUnit.value.toLowerCase();
        let azim = ~~(MyCircle.bearing(GT.myLat, GT.myLon, LL[1], LL[0])) + "&deg;";
        let gg = latLonToGridSquare(LL[1], LL[0], 6);
        mouseTrackDiv.innerHTML = LL[1].toFixed(3) + ", " + LL[0].toFixed(3) + " " + dist + " " + azim + " " + gg;
      }
    }
  }

  let noFeature = true;
  let features = GT.map.getFeaturesAtPixel(mousePosition);
  if (features && features.length > 0)
  {
    for (let i = 0; i < features.length; i++)
    {
      const feature = features[i];
      const prop = feature.values_.prop;
      if (!prop || !(prop in GT.hoverFunctors)) continue;
      
      if (GT.lastHover.feature)
      {
        if (feature !== GT.lastHover.feature)
        {
          GT.lastHover.functor.out(GT.lastHover.feature);
          GT.lastHover.feature = null;
        }
        else
        {
          GT.hoverFunctors[prop].move(feature);
          noFeature = false;
          break;
        }
      }
      if (GT.lastHover.feature == null)
      {
        if (GT.hoverFunctors[prop].hover(feature, true))
        {
          GT.lastHover.feature = feature;
          GT.lastHover.functor = GT.hoverFunctors[prop];
          noFeature = false;
          break;
        }
      }
    }
  }

  if (noFeature && GT.lastHover.feature)
  {
    GT.lastHover.functor.out(GT.lastHover.feature);
    GT.lastHover.feature = null;
  }
}

function mapLoseFocus()
{
  if (GT.lastHover.feature)
  {
    GT.lastHover.functor.out(GT.lastHover.feature);
    GT.lastHover.feature = null;
  }
}
