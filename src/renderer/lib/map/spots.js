// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Reception spots (PSK Reporter, RTSN, MQTT): storage, map features, display settings (moved from gt.js)

class SpotReport {
  constructor(call, band, grid, mode) {
    this.call = call;
    this.band = band;
    this.grid = grid;
    this.mode = mode;
    this.dxcc = -1;
    this.when = 0;
    this.snr = 0;
    this.freq = 0;
    this.color = 0;
    this.source = {};
    this.bearing = 0; // Pre-allocate for tooltip usage later
  }
}

function saveReceptionReports()
{
  try
  {
    fs.writeFileSync(GT.spotsPath, JSON.stringify(GT.receptionReports), { flush: true });
  }
  catch (e)
  {
    console.error(e);
  }
}

function loadReceptionReports()
{
  try
  {
    if (fs.existsSync(GT.spotsPath))
    {
      GT.receptionReports = window.require(GT.spotsPath);
      // Convert old single spot source to new object type allowing for multiple sources
      for (const spot of Object.values(GT.receptionReports.spots))
      {
        if (typeof spot.source === "string")
        {
          const key = spot.source;
          spot.source = {};
          spot.source[key] = true;
        }
      }
    }
  }
  catch (e)
  {
    GT.receptionReports = {
      spots: {}
    };
  }
}

function addNewRTSNSpot(parts) {
  nodeTimers.clearTimeout(GT.redrawSpotsTimeout);

  // 3. Array Destructuring makes grabbing parts much cleaner
  const [call, rawGrid, rawDb, rawFreq, mode] = parts;

  // 4. .substr() is deprecated in modern JS. Use .slice()
  const grid = rawGrid.slice(0, 6); 
  const snr = Number(rawDb);
  const freq = Number(rawFreq);
  const band = formatBand(freq / 1000000); // Division implies Number, no cast needed
  const hash = `${call}${mode}${band}`;

  // 5. Use the Logical Nullish Assignment (??=) we used earlier!
  const report = GT.receptionReports.spots[hash] ??= new SpotReport(call, band, grid, mode);

  // 6. Update properties
  report.dxcc = callsignToDxcc(call);
  report.when = timeNowSec();
  report.snr = snr; // Removed redundant Number() wrapper
  report.freq = freq;
  
  // 7. Math.trunc() is much faster and cleaner than parseInt() for math
  report.color = clamp(Math.trunc((Math.trunc(snr) + 25) * 9), 0, 255);
  report.source.O = true;

  // Restart the timer
  GT.redrawSpotsTimeout = nodeTimers.setTimeout(redrawSpots, 250);
}

function addNewMqttPskSpot(json)
{
  if (json.rl == null || json.rl.length < 4) return;
  // json.rc, json.rl, json.ra, json.rp, json.f, json.b, json.md, json.t
  // call, grid, dxcc, snr, frequency, band, mode, when
  if (GT.redrawSpotsTimeout != null)
  {
    nodeTimers.clearTimeout(GT.redrawSpotsTimeout);
    GT.redrawSpotsTimeout = null;
  }
  
  let call = String(json.rc).replaceAll(".", "/").toUpperCase();
  let report;
  json.rl = String(json.rl).substring(0, 6).toUpperCase();
  json.md = String(json.md).toUpperCase();
  json.b = String(json.b).toLowerCase();
  json.t = parseInt(json.t);
  if (isNaN(json.t)) return;
  json.rp = Number(json.rp);
  if (isNaN(json.rp)) return;
  json.f = Number(json.f);
  if (isNaN(json.f)) return;
  
  let hash = call + json.md + json.b;
  let rosterHash = call + json.b + json.md;

  // Update call roster if station is already present and has no high-confidence grid
  if (json.rl && json.rl.length >= 4 && rosterHash in GT.liveCallsigns) {
    const entry = GT.liveCallsigns[rosterHash];
    if (!entry.grid || !entry.gridQualified) {
      entry.grid = json.rl.substring(0, 4);
      entry.gridQualified = true;
      updateLiveDistance(entry);
    }
  }

  if (hash in GT.receptionReports.spots)
  {
    report = GT.receptionReports.spots[hash];
  }
  else
  {
    report = GT.receptionReports.spots[hash] = new SpotReport(call, json.b, json.rl, json.md);
  }

  report.dxcc = callsignToDxcc(call);
  report.when = Math.min(json.t, timeNowSec());
  report.snr = json.rp;
  report.freq = json.f;
  report.color = clamp(parseInt((parseInt(report.snr) + 25) * 9), 0, 255);
  report.source.M = true;
  GT.redrawSpotsTimeout = nodeTimers.setTimeout(redrawSpots, 250);
}

function spotFeature(center)
{
  return new ol.Feature(ol.geom.Polygon.circular(center, 30000, 63).transform("EPSG:4326", GT.settings.map.projection));
}

function createSpot(report, key, fromPoint, addToLayer = true)
{
  try
  {
    let LL = squareToCenter(report.grid);

    if (isNaN(LL.a))
    {
      // Bad value in grid, don't map //
      return;
    }

    let spot = spotFeature([LL.o, LL.a]);

    let colorNoAlpha = "#" + GT.bandToColor[report.band];
    let colorAlpha = intAlphaToRGB(colorNoAlpha, report.color);
    let spotColor = colorAlpha;

    let workingColor = GT.settings.map.nightMapEnable && GT.nightTime ? GT.settings.reception.pathNightColor : GT.settings.reception.pathColor;

    if (workingColor != -1)
    {
      let testColor = workingColor < 1 ? "#000000" : workingColor == 361 ? "#FFFFFF" : "hsla(" + workingColor + ", 100%, 50%," + report.color / 255 + ")";
      if (workingColor < 1 || workingColor == 361)
      {
        spotColor = intAlphaToRGB(testColor.substring(0, 7), report.color);
      }
      else
      {
        spotColor = testColor;
      }
    }

    let featureStyle = new ol.style.Style({
      fill: new ol.style.Fill({
        color: spotColor
      }),
      stroke: new ol.style.Stroke({
        color: "#000000FF",
        width: 0.25
      })
    });
    spot.setStyle(featureStyle);
    spot.spot = key;
    spot.set("prop", "spot");
    spot.size = 6; // Mouseover detection
    GT.layerSources.pskSpots.addFeature(spot);

    let toPoint = ol.proj.fromLonLat([LL.o, LL.a]);

    let lonLat = new ol.geom.Point(toPoint);

    let pointFeature = new ol.Feature({
      geometry: lonLat,
      weight: report.color / 255 // e.g. temperature
    });

    if (GT.useTransform)
    {
      pointFeature.getGeometry().transform("EPSG:3857", GT.settings.map.projection);
    }

    GT.layerSources.pskHeat.addFeature(pointFeature);

    if (GT.settings.reception.spotWidth > 0)
    {
      let strokeWeight = GT.settings.reception.spotWidth;

      let flightColor =
        workingColor == -1
          ? colorNoAlpha + "BB"
          : GT.settings.map.nightMapEnable && GT.nightTime
            ? GT.spotNightFlightColor
            : GT.spotFlightColor;

      flightFeature(
        [fromPoint, toPoint],
        {
          weight: strokeWeight,
          color: flightColor,
          steps: 75
        },
        "pskFlights",
        false
      );
    }
  }
  catch (err)
  {
    console.error("Unexpected error inside createSpot", report, err)
  }
}

function redrawSpots()
{
  let now = timeNowSec();
  GT.spotTotalCount = 0;
  GT.layerSources.pskSpots.clear();
  GT.layerSources.pskFlights.clear();
  GT.layerSources.pskHop.clear();
  GT.layerSources.pskHeat.clear();

  let fromPoint = getPoint(GT.settings.app.myRawGrid);

  if (GT.settings.reception.mergeSpots == false)
  {
    let spot = iconFeature(fromPoint, GT.gtFlagIcon, 100, "homeFlag");
    GT.layerSources.pskSpots.addFeature(spot);
  }

  for (let key in GT.receptionReports.spots)
  {
    let report = GT.receptionReports.spots[key];

    if ((now - report.when > 86400) || (report.grid.length < 4))
    {
      delete GT.receptionReports.spots[key];
      continue;
    }

    if (validateMapBandAndMode(report.band, report.mode))
    {
      if (now - report.when <= GT.settings.reception.viewHistoryTimeSec)
      {
        createSpot(report, key, fromPoint);
        GT.spotTotalCount++;
      }
    }
  }

  updateSpotCountDiv();
}

function updateSpotCountDiv()
{
  spotCountDiv.innerHTML = I18N("spotlayer.RX.Spots") + ":&nbsp;" + GT.spotTotalCount;
}

function changeSpotValues()
{
  let mins = parseInt(spotHistoryTimeValue.value);

  // Split slider minutes into Hours and Minutes for the inputs
  let hInput = document.getElementById("spotHistoryH");
  let mInput = document.getElementById("spotHistoryM");
  
  if (hInput && mInput) {
    // padStart ensures it always shows "05" instead of "5"
    hInput.value = String(Math.floor(mins / 60)).padStart(2, '0');
    mInput.value = String(mins % 60).padStart(2, '0');
  }

  GT.settings.reception.viewHistoryTimeSec = mins * 60;
  GT.settings.reception.mergeSpots = spotMergeValue.checked;

  setTrophyOverlay(GT.currentOverlay);
  if (GT.rosterSpot) goProcessRoster();
}

function syncSpotSlider() 
{
  let hInput = document.getElementById("spotHistoryH");
  let mInput = document.getElementById("spotHistoryM");
  if (!hInput || !mInput) return;
  
  // Grab typed values, default to 0 if they deleted the text
  let h = parseInt(hInput.value, 10) || 0;
  let m = parseInt(mInput.value, 10) || 0;
  
  // Convert back to total slider minutes
  let val = (h * 60) + m;
  
  // Validate bounds (1 minute to 24 hours)
  if (val < 1) val = 1;
  if (val > 1440) val = 1440;
  
  // Update the slider and trigger render
  spotHistoryTimeValue.value = val;
  changeSpotValues(); // Re-runs to fix the input visually (e.g. if they typed "90" mins, it fixes it to 1h 30m)
  redrawSpots();
}

function spotPathChange()
{
  GT.settings.reception.pathColor = spotPathColorValue.value;
  let pathColor = GT.settings.reception.pathColor < 1
    ? "#000"
    : GT.settings.reception.pathColor == 361
      ? "#FFF"
      : "hsl(" + GT.settings.reception.pathColor + ", 100%, 50%)";

  if (GT.settings.reception.pathColor > 0)
  {
    spotPathColorDiv.style.color = "#000";
    spotPathColorDiv.style.backgroundColor = pathColor;
    spotPathColorDiv.style.textShadow = "-1px -1px 0 #FFF, 1px -1px 0 #FFF, -1px 1px 0 #FFF, 1px 1px 0 #FFF";
  }
  else
  {
    spotPathColorDiv.style.color = "#FFF";
    spotPathColorDiv.style.backgroundColor = pathColor;
    spotPathColorDiv.style.textShadow = "";
  }

  spotPathInfoLabel.style.display = (GT.settings.reception.pathColor == -1) ? "" : "none";

  GT.spotFlightColor =
    GT.settings.reception.pathColor < 1
      ? "#000000BB"
      : GT.settings.reception.pathColor == 361
        ? "#FFFFFFBB"
        : "hsla(" + GT.settings.reception.pathColor + ", 100%, 50%,0.73)";

  GT.settings.reception.pathNightColor = spotNightPathColorValue.value;
  let pathNightColor =
    GT.settings.reception.pathNightColor < 1
      ? "#000"
      : GT.settings.reception.pathNightColor == 361
        ? "#FFF"
        : "hsl(" + GT.settings.reception.pathNightColor + ", 100%, 50%)";
  if (GT.settings.reception.pathNightColor > 0)
  {
    spotNightPathColorDiv.style.color = "#000";
    spotNightPathColorDiv.style.backgroundColor = pathNightColor;
    spotNightPathColorDiv.style.textShadow = "-1px -1px 0 #FFF, 1px -1px 0 #FFF, -1px 1px 0 #FFF, 1px 1px 0 #FFF";
  }
  else
  {
    spotNightPathColorDiv.style.color = "#FFF";
    spotNightPathColorDiv.style.backgroundColor = pathNightColor;
    spotNightPathColorDiv.style.textShadow = "";
  }


  GT.spotNightFlightColor =
    GT.settings.reception.pathNightColor < 1
      ? "#000000BB"
      : GT.settings.reception.pathNightColor == 361
        ? "#FFFFFFBB"
        : "hsla(" + GT.settings.reception.pathNightColor + ", 100%, 50%,0.73)";

  spotWidthTd.innerHTML = GT.settings.reception.spotWidth = spotWidthValue.value;


}

function toggleSpotOverGrids()
{
  spotMergeValue.checked = spotMergeValue.checked != true;
  changeSpotValues();
  redrawSpots();
}

function toggleMergeOverlay()
{
  mergeOverlayValue.checked = mergeOverlayValue.checked != true;
  changeMergeOverlayValue();
}

function setSpotImage()
{
  spotsButtonImg.src = GT.spotImageArray[GT.spotView];
  spotsButtonImg.style.filter = (GT.spotView == 0) ? "grayscale(1)" : "";
}

function cycleSpotsView()
{
  GT.spotView++;
  GT.spotView %= 3;

  GT.settings.app.spotView = GT.spotView;
  setSpotImage();

  setTrophyOverlay(GT.currentOverlay);
}

function directSpotLayer(index)
{
  GT.spotView = index;
  GT.settings.app.spotView = GT.spotView;
  setSpotImage();

  setTrophyOverlay(GT.currentOverlay);
}

function updateSpottingViews()
{
  if (GT.settings.app.offAirServicesEnable == false || GT.settings.map.offlineMode == true)
  {
    spottingEnableTr.style.display = "none";
  }
  else
  {
    spottingEnableTr.style.display = "";
  }

  if (GT.settings.app.spottingEnable == false || GT.settings.app.offAirServicesEnable == false || GT.settings.map.offlineMode == true)
  {
    GT.layerVectors.pskSpots.setVisible(false);
    GT.layerVectors.pskFlights.setVisible(false);
    GT.layerVectors.pskHop.setVisible(false);
    GT.layerVectors.pskHeat.setVisible(false);
    spotsDiv.style.display = "none";
    spotMergeTr.style.display = "none";
    buttonSpotsBoxDiv.style.display = "none";
    spotPathColorDiv.style.display = "none";
    spotPathWidthDiv.style.display = "none";
    openPskMqtt();
    return;
  }
  else
  {
    buttonSpotsBoxDiv.style.display = "";
    spotMergeTr.style.display = "";
    spotPathColorDiv.style.display = "";
    spotPathWidthDiv.style.display = "";
  }

  if (GT.spotView > 0)
  {
    if (GT.settings.reception.mergeSpots == false)
    {
      for (let key in GT.layerVectors)
      {
        GT.layerVectors[key].setVisible(false);
      }
    }
    if (GT.spotView == 1)
    {
      GT.layerVectors.pskSpots.setVisible(true);
      GT.layerVectors.pskFlights.setVisible(true);
      GT.layerVectors.pskHop.setVisible(true);
      GT.layerVectors.pskHeat.setVisible(false);
    }
    else
    {
      GT.layerVectors.pskSpots.setVisible(false);
      GT.layerVectors.pskFlights.setVisible(false);
      GT.layerVectors.pskHop.setVisible(false);
      GT.layerVectors.pskHeat.setVisible(true);
    }

    spotsDiv.style.display = GT.settings.map.spotLegend ? "" : "none";
  }
  else
  {
    GT.layerVectors.pskSpots.setVisible(false);
    GT.layerVectors.pskFlights.setVisible(false);
    GT.layerVectors.pskHop.setVisible(false);
    GT.layerVectors.pskHeat.setVisible(false);

    spotsDiv.style.display = "none";
  }

  openPskMqtt();
}

function getSpotTime(hash)
{
  if (hash in GT.receptionReports.spots)
  {
    return GT.receptionReports.spots[hash];
  }
  else return { when: 0, snr: 0 };
}

function refreshSpotsNoTx()
{
  redrawSpots();
}
