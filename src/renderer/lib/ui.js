// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Main window UI: theme, map-view filters, layout, time display, traffic list, colours, toggles, units (moved from GridTracker2.js)

// Pre-calculate 00 to FF once at startup to prevent memory allocation in the render loop
const K_HEX_ALPHAS = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

const mainLayout = {
  mapLeft: {
    chevronDiv: {  style: { display: "none" } },
    legendDiv: { style: { right: "203px" } },
    mouseTrackDiv: { style: { left: "35px" } },
    mapDiv: { style: { left: "0", right: "201px" } },
    menuDiv: { style: { display: "block", left: "", right: 0 } },
  },
  mapRight: {
    chevronDiv: { style: { display: "none" } },
    legendDiv: { style: { right: "2px" } },
    mouseTrackDiv: { style: { left: "236px" } },
    mapDiv: { style: { left: "201px", right: "0" } },
    menuDiv: { style: { display: "block", left: 0, right: "" } },
  },
  hideMenuLeft: {
    menuDiv: { style: { display: "none" } },
    chevronDiv: { style: { display: "block", left: "6px", top: "67px", right: "" , width: "23px"}, innerHTML: "☰▶" },
    legendDiv: { style: { right: "2px" } },
    mouseTrackDiv: { style: { left: "35px" } },
    mapDiv: { style: { left: "0", right: "0" } }
  },
  hideMenuRight: {
    menuDiv: { style: { display: "none" } },
    chevronDiv: { style: { display: "block", right: "7px", top: "28px", left: "", width: "21px" }, innerHTML: "◀☰"},
    legendDiv: { style: { right: "2px" } },
    mouseTrackDiv: { style: { left: "35px" } },
    mapDiv: { style: { left: "0", right: "0" } }
  }
};

function setWindowTheme()
{
  electron.ipcRenderer.send("setTheme", GT.settings.app.windowTheme);
}

function setWindowThemeSelector()
{
  windowTheme.value = GT.settings.app.windowTheme;
}

function changeWindowTheme()
{
  GT.settings.app.windowTheme = windowTheme.value;
  setWindowTheme();
}

function toggleMapViewFiltersCollapse()
{
  GT.settings.app.collapsedMapViewFilters = !GT.settings.app.collapsedMapViewFilters;
  displayMapViewFilters();
}

function checkMapViewFiltersMaximize()
{
  // If the user clicks the Map View Filters when minimized, it maximizes
  if (GT.settings.app.collapsedMapViewFilters == true)
  {
    toggleMapViewFiltersCollapse();
  }
}

function displayMapViewFilters()
{
  if (GT.settings.app.collapsedMapViewFilters == true)
  {
    mapViewFiltersTable.style.display = "none";
    mapViewFiltersCollapseImg.src = "img/maximize.png";
    mapViewFiltersCollapseImg.title = I18N("roster.menu.ShowControls");
  }
  else
  {
    mapViewFiltersTable.style.display = "";
    mapViewFiltersCollapseImg.src = "img/minimize.png";
    mapViewFiltersCollapseImg.title = I18N("roster.menu.HideControls");
  }
}

function gtBandFilterChanged(selector)
{
  GT.settings.app.gtBandFilter = selector.value;

  removePaths();
  redrawGrids();
  redrawPins();
  redrawSpots();
  redrawParks();
}

function gtModeFilterChanged(selector)
{
  GT.settings.app.gtModeFilter = selector.value;

  removePaths();
  redrawGrids();
  redrawPins();
  redrawSpots();
  redrawParks();
}

function gtPropFilterChanged(selector)
{
  GT.settings.app.gtPropFilter = selector.value;

  redrawGrids();
  redrawSpots();
}

function setBandAndModeToAuto()
{
  GT.settings.app.gtModeFilter = GT.settings.app.gtBandFilter = gtBandFilter.value = gtModeFilter.value = "auto";
  redrawGrids();
  redrawPins();
  redrawSpots();
  redrawParks();
}

// from GridTracker.html
function toggleTime()
{
  GT.settings.app.useLocalTime ^= 1;
  displayTime();
}

function dateToString(dateTime)
{
  if (GT.settings.app.useLocalTime == 1) { return dateTime.toLocaleString().replace(/,/g, ""); }
  else return dateTime.toUTCString().replace(/GMT/g, "UTC").replace(/,/g, "");
}

function userDayString(Msec)
{
  let dateTime;
  if (Msec != null) dateTime = new Date(Msec);
  else dateTime = new Date();

  let ds = dateTime.toUTCString().replace(/GMT/g, "UTC").replace(/,/g, "");
  let dra = ds.split(" ");
  dra.shift();
  dra.pop();
  dra.pop();
  return dra.join(" ");
}

function userTimeString(Msec)
{
  let dateTime;
  if (Msec != null) dateTime = new Date(Msec);
  else dateTime = new Date();
  return dateToString(dateTime);
}

function toggleFullscreen()
{
  (document.fullscreenElement == null) ?  mainBody.requestFullscreen() : document.exitFullscreen();
}

function toggleMenu()
{
  (GT.menuShowing == false) ? updateLayout(false) : updateLayout(true);
}

function toggleHelp()
{
  GT.helpShow = !GT.helpShow;
  helpDiv.style.display = (GT.helpShow) ? "block" : "none";
}

function reloadInfo()
{
  if (GT.statsWindowInitialized == true)
  {
    GT.statsWindowHandle.window.reloadInfo();
  }
}

function intAlphaToRGB(rgb, alphaInt)
{
  return rgb + alphaInt.toString(16).padStart(2, '0');
}

function alphaTo(rgba, alphaFloat)
{
  // Bitwise ~~ is drastically faster than parseInt()
  const alphaInt = ~~(alphaFloat * 255); 
  return rgba.slice(0, -2) + K_HEX_ALPHAS[alphaInt];
}

function getCurrentBandModeHTML()
{
  let band = GT.settings.app.gtBandFilter == "auto" ? GT.settings.app.myBand + " (Auto)" : GT.settings.app.gtBandFilter.length == 0 ? "Mixed Bands" : GT.settings.app.gtBandFilter;
  let mode = GT.settings.app.gtModeFilter == "auto" ? GT.settings.app.myMode + " (Auto)" : GT.settings.app.gtModeFilter.length == 0 ? "Mixed Modes" : GT.settings.app.gtModeFilter;
  return (
    "<div style='vertical-align:top;display:inline-block;margin-bottom:3px;color:lightgreen;font-weight:bold;font-size:larger'>" + I18N("stats.viewing") + ": <span style='color:yellow'>" +
    band +
    "</span> / <span style='color:orange'>" +
    mode +
    "</span></b></div><br>"
  );
}

function displayTime()
{
  GT.timeNow = timeNowSec();
  GT.currentDay = ~~(GT.timeNow / 86400);
  GT.currentYear = new Date().getUTCFullYear();

  currentTime.innerHTML = "<font color='lightblue'>" + userTimeString(null) + "</font>";
  if (GT.lastTimeSinceMessageInSeconds > 0)
  {
    let since = GT.timeNow - GT.lastTimeSinceMessageInSeconds;
    secondsAgoMsg.innerHTML = toDHMS(since);
    let targetState = 0;
    if (since > 121) targetState = 2; // Orange
    else if (since > 17) targetState = 1; // Yellow
    // 0 is Blue

    // ONLY touch the DOM if the state category actually changed
    if (GT.lastTimeState !== targetState) {
      GT.lastTimeState = targetState;
      if (targetState === 2) {
        secondsAgoMsg.style.backgroundColor = "orange";
        secondsAgoMsg.style.color = "#000";
      } else if (targetState === 1) {
        secondsAgoMsg.style.backgroundColor = "yellow";
        secondsAgoMsg.style.color = "#000";
      } else {
        secondsAgoMsg.style.backgroundColor = "blue";
        secondsAgoMsg.style.color = "#FF0";
      }
    }
  }
  else secondsAgoMsg.innerHTML = "<b>Never</b>";

  checkWsjtxListener();
  checkAdifBroadcastListener();
  connectToAcLogAPI();

  if (GT.timeNow % 22 == 0)
  {
    GT.nightTime = dayNight.refresh();
    moonLayer.refresh();
  }

  if (GT.currentNightState != GT.nightTime)
  {
    changeMapLayer();
    styleAllFlightPaths();
    GT.currentNightState = GT.nightTime;
  }
}

function updateLayout(shouldCollapseMenu)
{
  let layout = GT.settings.app.mapRight ? "mapRight" : "mapLeft";
  
  if (shouldCollapseMenu == true)
  {
    layout = (GT.settings.app.mapRight) ? "hideMenuLeft" : "hideMenuRight";
  } 

  for (const [elementId, config] of Object.entries(mainLayout[layout]))
  {
    const el = document.getElementById(elementId);

    if (config.style)
    {
      for (const [styleProp, styleValue] of Object.entries(config.style))
      {
        el.style[styleProp] = styleValue;
      }
    }

    if (config.innerHTML !== undefined)
    {
      el.innerHTML = config.innerHTML;
    }
  }

  GT.menuShowing = !shouldCollapseMenu;

  GT.map.updateSize();
}

function drawTraffic()
{
  while (GT.lastTraffic.length > 60) GT.lastTraffic.pop();

  let worker = GT.lastTraffic.join("<br>");
  worker = worker.split("80%'><br>").join("80%'>");
  if (GT.localDXcall.length > 1) {
    worker = worker.replaceAll(GT.localDXcall, `<font style='color:cyan'>${GT.localDXcall}</font>`);
  }
  if (GT.settings.app.myRawCall.length > 1) {
    worker = worker.replaceAll(GT.settings.app.myRawCall, `<font style='color:yellow'>${GT.settings.app.myRawCall}</font>`);
  }
  trafficDiv.innerHTML = worker;
}

function addLastTraffic(traffic)
{
  GT.lastTraffic.unshift(traffic);
  GT.lastTraffic.unshift(
    "<hr style='border-color:#333;margin-top:0px;margin-bottom:2px;width:80%'>"
  );
  drawTraffic();
}

function htmlEntities(str)
{
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function kilometerToUnit(value, unit) {
  let r = { 'KM': 1, 'MI': 0.621371, 'NM': 0.539957, 'DG': 0.00899322 };
  if ( unit in r ) return r[unit] * value;
  else return value;
}

function unitToKilometer(value, unit) {
  let r = { 'KM': 1, 'MI': 1 / 0.621371, 'NM': 1 / 0.539957, 'DG': 1 / 0.00899322 };
  if ( unit in r ) return r[unit] * value;
  else return value;
}

function changeDistanceUnit()
{
  let newUnit = distanceUnit.value;
  
  // Convert current internal KM distance to the new local unit
  let currentLocalValue = kilometerToUnit(GT.settings.map.rangeRingDistance, newUnit);
  
  // Snap to the nearest step of the new unit (e.g., nearest 100 or 0.5)
  let step = distanceUnitConfig[newUnit].step;
  let snappedValue = Math.round(currentLocalValue / step) * step;

  // Ensure we don't accidentally exceed the new slider max
  snappedValue = Math.max(0, Math.min(snappedValue, distanceUnitConfig[newUnit].max));

  // Convert the snapped local unit back to KM and save to settings
  GT.settings.map.rangeRingDistance = unitToKilometer(snappedValue, newUnit);

  GT.settings.app.distanceUnit = newUnit;
  GT.scaleLine.setUnits(GT.scaleUnits[newUnit]);
  
  // Updating range rings will natively call updateRangeRingsUI()
  drawRangeRings();
  goProcessRoster();
}

function openBackupLogsFolder()
{
  electron.ipcRenderer.send("openFileFolder", "GridTracker2", GT.qsoBackupDir);
}

function handleKpIndexJSON(json)
{
  if (json && typeof json == "object")
  {
    let K = parseInt(json[1]);
    let geoStorm = "";
    if (K > 5)
    {
      let speed = 13 - K;
      geoStorm = "animation: geoStorm " + speed + "s ease-in-out infinite alternate;";
    }

    let preK = json[0];
    let curK = json[1];
    let trend = (preK == curK ? "" : preK < curK ? "▲" : "▼");

    conditionsButton.style = geoStorm + "height:32px;width:32px;vertical-align:bottom;background:radial-gradient(" + GT.KColors[K] + ", #000)";
    conditionsButton.innerHTML = "<div style='display:block'><font style='text-shadow:1px 1px 2px #000;color: #0FF;'>Kp</font><br><font style='font-weight:bold;font-size:16px;text-shadow:1px 1px 1px #000;color: #FFF;'>" + K + "<font style='font-weight:normal;font-size:10px'>" + trend + "</font></font><div>";
  }
}

function captureScreenshot()
{
  electron.ipcRenderer.send("capturePageToClipboard", "GridTracker2");
  addLastTraffic("<font style='color:lightgreen;'>Screenshot Captured</font>");
  playAlertMediaFile("Camera Click 1.mp3");
}

function updateByBandMode()
{
  if (GT.settings.app.wantedByBandMode == false || GT.instanceCount > 1)
  {
    GT.activeRoster = GT.settings.roster;
    GT.activeAudioAlerts = GT.settings.audioAlerts;
    GT.activeExceptions = GT.settings.roster.exceptions;
    GT.activeCustomAlerts = GT.settings.customAlerts;
  }
  else
  {
    let hash = GT.settings.app.myBand + GT.settings.app.myMode;

    if (!(hash in GT.settings.ByBandMode.roster))
    {
      if (GT.activeRoster)
      {
        GT.settings.ByBandMode.roster[hash] = { 
            wanted: { ...GT.activeRoster.wanted },
            logbook: { ...GT.activeRoster.logbook },
          };
      }
      else
      {
        GT.settings.ByBandMode.roster[hash] = { 
          wanted: { ...GT.settings.roster.wanted },
          logbook: { ...GT.settings.roster.logbook },
        };
      }  
    }

    if (!(hash in GT.settings.ByBandMode.exceptions))
    {
      if (GT.activeExceptions)
      {
        GT.settings.ByBandMode.exceptions[hash] = { ...GT.activeExceptions };
      }
      else
      {
        GT.settings.ByBandMode.exceptions[hash] = { ...GT.settings.roster.exceptions };
      }  
    }

    if (!(hash in GT.settings.ByBandMode.audioAlerts))
    {
      if (GT.activeAudioAlerts)
      {
        GT.settings.ByBandMode.audioAlerts[hash] = { 
          wanted: { ...GT.activeAudioAlerts.wanted }
        };
      }
      else
      {
        GT.settings.ByBandMode.audioAlerts[hash] = { 
          wanted: { ...GT.settings.audioAlerts.wanted }
        };
      }  
    }

    if (!(hash in GT.settings.ByBandMode.customAlerts))
    {
      if (GT.activeCustomAlerts)
      {
        GT.settings.ByBandMode.customAlerts[hash] = { ...GT.activeCustomAlerts };
      }
      else
      {
        GT.settings.ByBandMode.customAlerts[hash] = { ...GT.settings.customAlerts };
      }  
    }

    GT.activeRoster = GT.settings.ByBandMode.roster[hash];
    GT.activeAudioAlerts = GT.settings.ByBandMode.audioAlerts[hash];
    GT.activeExceptions = GT.settings.app.includeExceptions ? GT.settings.ByBandMode.exceptions[hash] : GT.settings.roster.exceptions;
    GT.activeCustomAlerts = GT.settings.app.includeCustomAlerts ? GT.settings.ByBandMode.customAlerts[hash] : GT.settings.customAlerts;
  }


  for (const key in GT.activeAudioAlerts.wanted)
  {
    if (key in window)
    {
      window[key].checked = GT.activeAudioAlerts.wanted[key];
    }
  }

  displayCustomAlerts();

  setVisualHunting();
}
