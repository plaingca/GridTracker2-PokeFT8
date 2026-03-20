// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

GT.pota = {
  parks: {},
  locations: {},
  parksTimeout: null,
  callSchedule: {},
  parkSchedule: {},
  scheduleTimeout: null,
  callSpots: {},
  parkSpots: {},
  spotsTimeout: null,
  mapParks: {},
};

GT.potaSpotTemplate = {
  activator: "",
  frequency: 0,
  mode: "",
  band: "",
  reference: "",
  spotTime: 0,
  expire: 0,
  spotter: "",
  comments: "",
  source: "GT",
  count: 1,
  activatorGrid: "",
  spotterGrid: ""
};

GT.parkTemplate = {
  feature: null
}

GT.potaUnknownPark = {
  name: "Unknown park (not yet spotted)",
  active: "0",
  entityId: "-1",
  locationDesc: "??-??",
  latitude: "0.0",
  longitude: "0.0",
  grid: ""
};

GT.gtParkOnInstance = new ol.style.Icon({
  src: "img/ParkOnInstance.png",
  scale: 0.5
});

GT.gtParkWorkedOnInstance = new ol.style.Icon({
  src: "img/ParkWorkedOnInstance.png",
  scale: 0.45
});

GT.gtParkOffInstance = new ol.style.Icon({
  src: "img/ParkOffInstance.png",
  scale: 0.4
});

function iconText(center, iconObj, zIndex, propName)
{
  var feature = new ol.Feature({
    geometry: new ol.geom.Point(center),
    textAlign: "center",
    justify: "center",
    prop: propName
  });

  if (GT.useTransform)
  {
    feature.getGeometry().transform("EPSG:3857", GT.settings.map.projection);
  }

  var iconStyle = new ol.style.Style({
    zIndex: zIndex,
    text: iconObj
  });

  feature.setStyle(iconStyle);
  return feature;
}

function initPota()
{
  potaFeatureEnabled.checked = GT.settings.app.potaFeatureEnabled;
  if (GT.settings.app.potaFeatureEnabled == true)
  {
    logGTqsoCheckBox.checked = true;
    loadGTCheckBox.checked = true;
    GT.settings.adifLog.startup.loadGTCheckBox = true;
    GT.settings.adifLog.qsolog.logGTqsoCheckBox = true;
  }

  potaButton.style.display = (GT.settings.app.potaFeatureEnabled && GT.settings.map.offlineMode == false) ? "" : "none";
  potaImg.style.filter = GT.settings.app.potaMapEnabled ? "" : "grayscale(1)";

  GT.layerSources.pota.clear();
  GT.pota.mapParks = {};
  
  potaHuntingTr.style.display = GT.settings.map.offlineMode ? "none" : "";
  
  if (GT.settings.app.potaFeatureEnabled && GT.settings.map.offlineMode == false)
  {
    getPotaParks();
  }
}

function changePotaEnable()
{
  potaHuntingTr.style.display = GT.settings.map.offlineMode ? "none" : "";
  GT.settings.app.potaFeatureEnabled = potaFeatureEnabled.checked;
  if (GT.settings.app.potaFeatureEnabled == true)
  {
    logGTqsoCheckBox.checked = true;
    loadGTCheckBox.checked = true;
    GT.settings.adifLog.startup.loadGTCheckBox = true;
    GT.settings.adifLog.qsolog.logGTqsoCheckBox = true;
  }

  potaButton.style.display = (GT.settings.app.potaFeatureEnabled && GT.settings.map.offlineMode == false) ? "" : "none";
  if (!GT.settings.app.potaFeatureEnabled || GT.settings.map.offlineMode == true)
  {
    GT.layerSources.pota.clear();
  }
  else
  {
    getPotaParks();
  }

  setVisualHunting();
  goProcessRoster();
}

function togglePotaMap()
{
  GT.settings.app.potaMapEnabled = !GT.settings.app.potaMapEnabled;
  potaImg.style.filter = GT.settings.app.potaMapEnabled ? "" : "grayscale(1)";

  redrawParks();
}

function redrawParks()
{
  GT.layerSources.pota.clear();

  if (GT.settings.app.potaFeatureEnabled && GT.settings.app.potaMapEnabled && GT.settings.map.offlineMode == false)
  {
    GT.pota.mapParks = {};
    makeParkFeatures();
  }
}

function makeParkFeatures()
{
  try
  {
    let now = timeNowSec();
    let day = parseInt(now / 86400);
    let dayAsString = String(day);

    for (const park in GT.pota.parkSpots)
    {
      if (park in GT.pota.parks)
      {
        var parkObj = Object.assign({}, GT.parkTemplate);
        for (const call in GT.pota.parkSpots[park])
        {
          var report = GT.pota.parkSpots[park][call];
          if (parkObj.feature == null && validateMapBandAndMode(report.band, report.mode) && Date.now() < report.expire)
          {
            let parkIcon = GT.gtParkOffInstance;
            let zIndex = 1;
            for (let instance in GT.instances)
            {
              if (GT.instances[instance].valid && GT.instances[instance].status.Band == report.band && GT.instances[instance].status.MO == report.mode)
              {
                let hash = dayAsString + "." + park + "." + report.band + report.mode;
                if (hash in GT.tracker.worked.pota)
                {
                  parkIcon = GT.gtParkWorkedOnInstance;
                }
                else
                {
                  parkIcon = GT.gtParkOnInstance;
                }
                zIndex = 2;
                break;
              }
            }
            parkObj.feature = iconFeature(ol.proj.fromLonLat([Number(GT.pota.parks[park].longitude), Number(GT.pota.parks[park].latitude)]), parkIcon, zIndex, "parkFlag");
            parkObj.feature.key = park;
            parkObj.feature.size = 22;

            GT.pota.mapParks[park] = parkObj;
            GT.layerSources.pota.addFeature(parkObj.feature);
          }
        }
      }
    }
  }
  catch (e)
  {
    logError("exception: makeParkFeature " + park);
    logError(e);
  }
}

function potaSpotFromDecode(callObj)
{
  const myCall = GT.settings.app.myCall;
  if (myCall === "" || myCall === "NOCALL") return;

  // Cache deep property lookups locally
  const pota = GT.pota;
  const deCall = callObj.DEcall;
  const park = callObj.pota;
  const callSpots = pota.callSpots;
  const parkSpots = pota.parkSpots;
  
  let parkSpotGroup = parkSpots[park];
  let targetSpot;
  let isProcessed = false;

  const hasCallSpot = callSpots[deCall] !== undefined;

  // 1. Try to update an existing spot
  if (hasCallSpot && parkSpotGroup !== undefined)
  {
    targetSpot = parkSpotGroup[deCall];
    if (targetSpot !== undefined) 
    {
      const newObj = spotFromCallObj(callObj, park, targetSpot.count);
      targetSpot = fillObjectFromTemplate(targetSpot, newObj);
      parkSpotGroup[deCall] = targetSpot;
      isProcessed = true;
    }
  }

  // 2. If not updated, check if it's a scheduled spot (Looks like it's new)
  if (!isProcessed && pota.callSchedule[deCall] !== undefined)
  {
    callSpots[deCall] = park;

    if (parkSpotGroup === undefined)
    {
      parkSpotGroup = {};
      parkSpots[park] = parkSpotGroup;
    }
    
    targetSpot = spotFromCallObj(callObj, park, 0);
    targetSpot.expire = targetSpot.spotTime + 300000;
    parkSpotGroup[deCall] = targetSpot;
    
    isProcessed = true;
  }

  if (isProcessed && GT.settings.app.potaMapEnabled)
  {
    // May or may not be on screen, so try
    addParkSpotFeature(park, targetSpot);
  }
  else
  {
    if (!hasCallSpot) console.log(`No call spot: ${deCall}`);
    if (parkSpotGroup === undefined) console.log(`No park spot: ${park}`);
  }
}


function leftClickPota(parkId)
{
  if (parkId in GT.pota.parkSpots)
  {
    for (parkCaller in GT.pota.parkSpots[parkId])
    {
      let obj = GT.pota.parkSpots[parkId][parkCaller];
      let call = obj.activator;
      let grid = obj.activatorGrid;
      let band = obj.band;
      let mode = obj.mode;
      for (let instance in GT.instances)
      {
        if (GT.instances[instance].valid && GT.instances[instance].status.Band == band && GT.instances[instance].status.MO == mode)
        {
          setCallAndGrid(call, grid, instance);
          return;
        }
      }
    }
  }
}

function reportPotaQSO(record)
{
  var report = {
    activator: record.CALL,
    spotter: record.STATION_CALLSIGN,
    frequency: record.FREQ,
    reference: record.POTA_REF,
    mode: record.MODE,
    source: "GT",
    comments: record.COMMENT ? record.COMMENT : "",
    activatorGrid: record.GRIDSQUARE ? record.GRIDSQUARE : "",
    spotterGrid: record.MY_GRIDSQUARE ? record.MY_GRIDSQUARE : ""
  };
  
  if ("SUBMODE" in record)
  {
    report.mode = record.SUBMODE;
  }
 
  getPostJSONBuffer(
    "https://api.pota.app/spot",
    rbnReportResult,
    null,
    "https",
    443,
    report,
    10000,
    null,
    null
  );
}

function rbnReportResult(buffer, flag, cookies)
{
  // It worked! process latest spots!
  if (GT.pota.spotsTimeout)
  {
    nodeTimers.clearTimeout(GT.pota.spotsTimeout);
    GT.pota.spotsTimeout = null;
  }
  
  processPotaSpots(String(buffer));
  
  GT.pota.spotsTimeout = nodeTimers.setTimeout(getPotaSpots, 300000);
}

function spotFromCallObj(callObj, park, inCount, rbnTime)
{
  var callSpot = {
    activator: callObj.DEcall,
    activatorGrid: callObj.grid,
    spotter: GT.settings.app.myCall + "-#",
    spotterGrid: GT.settings.app.myGrid,
    frequency: Number((GT.instances[callObj.instance].status.Frequency / 1000000).toFixed(3)),
    reference: park,
    mode: callObj.mode,
    band: callObj.band,
    spotTime: Date.now(),
    source: "GT",
    count: inCount + 1,
    comments: "GT " + callObj.RSTsent + " dB " + GT.settings.app.myGrid + " via " + GT.settings.app.myCall + "-#"
  };
  return callSpot;
}

function addParkSpotFeature(park, report)
{
  var parkObj = Object.assign({}, GT.parkTemplate);
  if (park in GT.pota.mapParks)
  {
    parkObj = GT.pota.mapParks[park];
  }
  else
  {
    GT.pota.mapParks[park] = parkObj;
  }

  if (parkObj.feature == null && validateMapBandAndMode(report.band, report.mode))
  {
    let parkIcon = GT.gtParkOffInstance;
    let zIndex = 1;

    let now = timeNowSec();
    let day = parseInt(now / 86400);
    let dayAsString = String(day);

    for (let instance in GT.instances)
    {
      if (GT.instances[instance].valid && GT.instances[instance].status.Band == report.band && GT.instances[instance].status.MO == report.mode)
      {
        let hash = dayAsString + "." + park + "." + report.band + report.mode;
        if (hash in GT.tracker.worked.pota)
        {
          parkIcon = GT.gtParkWorkedOnInstance;
        }
        else
        {
          parkIcon = GT.gtParkOnInstance;
        }
        zIndex = 2;
        break;
      }
    }
    parkObj.feature = iconFeature(ol.proj.fromLonLat([Number(GT.pota.parks[park].longitude), Number(GT.pota.parks[park].latitude)]), parkIcon, zIndex, "parkFlag");
    parkObj.feature.key = park;
    parkObj.feature.size = 22;
    GT.layerSources.pota.addFeature(parkObj.feature);
  }
}

function processPotaParks(buffer)
{
  if (GT.settings.app.potaFeatureEnabled)
  {
    try
    {
      var data = JSON.parse(buffer);
      var newParks = data.parks;
      for (const park in newParks)
      {
        var locations = newParks[park].locationDesc.split(",");
        for (const i in locations)
        {
          if (locations[i] in data.locations)
          {
            locations[i] = data.locations[locations[i]];
          }
        }
        newParks[park].locationDesc = locations.join(", ");
      }
      newParks["?-????"] = GT.potaUnknownPark;
      
      GT.pota.parks = newParks;
      GT.pota.locations = data.locations;
      getPotaSchedule();
      getPotaSpots();
    }
    catch (e)
    {
      // can't write, somethings broke
      logError("Failed to load parks!");
      logError(e);
    }
  }
}

function getPotaParks()
{
  if (GT.pota.parksTimeout)
  {
    nodeTimers.clearTimeout(GT.pota.parksTimeout);
    GT.pota.spotsTimeout = null;
  }

  if (GT.settings.map.offlineMode == false && GT.settings.app.potaFeatureEnabled)
  {
    getBuffer(
      "https://app2.gridtracker.org/dbs/pota.json?cb=" + Date.now(),
      processPotaParks,
      null,
      "https",
      443
    );
  }

  GT.pota.parksTimeout = nodeTimers.setTimeout(getPotaParks, 86400000)
}

// This is a shallow copy, don't use with objects that contain other objects or arrays
function fillObjectFromTemplate(template, input)
{
  var object = {};
  for (const key in template)
  {
    if (key in input)
    {
      object[key] = input[key];
    }
    else
    {
      // missing, use the template value
      object[key] = template[key];
    }
  }
  return object;
}

function processPotaSpots(buffer)
{
  if (GT.settings.app.potaFeatureEnabled)
  {
    try
    {
      var spots = JSON.parse(buffer);
      GT.pota.callSpots = {};
      GT.pota.parkSpots = {};
      for (const spot in spots)
      {
        if (spots[spot].reference in GT.pota.parks)
        {
          var newSpot = fillObjectFromTemplate(GT.potaSpotTemplate, spots[spot]);
          newSpot.spotTime = Date.parse(newSpot.spotTime + "Z");
          newSpot.frequency = parseInt(newSpot.frequency) / 1000;

          newSpot.expire = Date.now() + (Number(newSpot.expire) * 1000);
          newSpot.band = formatBand(newSpot.frequency);
          if (newSpot.spotter == newSpot.activator && newSpot.comments.match(/qrt/gi))
          {
            // don't add the spot, they have self-QRT'ed
          }
          else if (Date.now() > newSpot.expire)
          {
            // Spot is expired!
          }
          else
          {
            GT.pota.callSpots[newSpot.activator] = newSpot.reference;
            
            if (!(newSpot.reference in GT.pota.parkSpots))
            {
              GT.pota.parkSpots[newSpot.reference] = {};
            }
 
            GT.pota.parkSpots[newSpot.reference][newSpot.activator] = newSpot;
          }
        }
      }
      
      redrawParks();
    }
    catch (e)
    {
      // can't write, somethings broke
      logError("processPotaSpots");
      logError(e);
    }
  }
}

function getPotaSpots()
{
  if (GT.pota.spotsTimeout)
  {
    nodeTimers.clearTimeout(GT.pota.spotsTimeout);
    GT.pota.spotsTimeout = null;
  }

  if (GT.settings.map.offlineMode == false && GT.settings.app.potaFeatureEnabled)
  {
    getBuffer(
      "https://api.pota.app/spot/activator",
      processPotaSpots,
      null,
      "https",
      443
    );
  }

  GT.pota.spotsTimeout = nodeTimers.setTimeout(getPotaSpots, 300000);
}

function uniqueArrayFromArray(input)
{
  return [...new Set(input)];
}

function processPotaSchedule(buffer)
{
  if (GT.settings.app.potaFeatureEnabled)
  {
    try
    {
      var schedules = JSON.parse(buffer);
      GT.pota.callSchedule = {};
      GT.pota.parkSchedule = {};
      for (const i in schedules)
      {
        var newObj = {};
        newObj.id = schedules[i].reference;
        newObj.start = Date.parse(schedules[i].startDate + "T" + schedules[i].startTime + "Z");
        newObj.end = Date.parse(schedules[i].endDate + "T" + schedules[i].endTime + "Z");
        newObj.frequencies = schedules[i].frequencies;
        newObj.comments = schedules[i].comments;
        if (Date.now() < newObj.end)
        {
          if (newObj.id in GT.pota.parks)
          {
            (GT.pota.callSchedule[schedules[i].activator] = GT.pota.callSchedule[schedules[i].activator] || []).push(newObj);

            newObj = Object.assign({}, newObj);
            newObj.id = schedules[i].activator;
            (GT.pota.parkSchedule[schedules[i].reference] = GT.pota.parkSchedule[schedules[i].reference] || []).push(newObj);
          }
        }
        // else it is expired and no longer relevant
      }

      // Sanity dedupe checks
      for (const key in GT.pota.callSchedule)
      {
        GT.pota.callSchedule[key] = uniqueArrayFromArray(GT.pota.callSchedule[key]);
      }
      for (const key in GT.pota.parkSchedule)
      {
        GT.pota.parkSchedule[key] = uniqueArrayFromArray(GT.pota.parkSchedule[key]);
      }
    }
    catch (e)
    {
      // can't write, somethings broke
    }
  }
}

function getPotaSchedule()
{
  if (GT.pota.scheduleTimeout)
  {
    nodeTimers.clearTimeout(GT.pota.scheduleTimeout);
    GT.pota.scheduleTimeout = null;
  }

  if (GT.settings.map.offlineMode == false && GT.settings.app.potaFeatureEnabled)
  {
    getBuffer(
      "https://api.pota.app/activation",
      processPotaSchedule,
      null,
      "https",
      443
    );
  }
  GT.pota.scheduleTimeout = nodeTimers.setTimeout(getPotaSchedule, 900000);
}

function mouseOverPark(feature)
{
  if (GT.currentOverlay != 0) return false;
  createParkTipTable(feature);
  mouseParkMove(feature);

  myParktip.style.zIndex = 499;
  myParktip.style.display = "block";
  return true;
}

function mouseParkMove(feature)
{
  const positionInfo = myParktip.getBoundingClientRect();
  const mouseX = getMouseX();
  const mouseY = getMouseY();
  const halfWidth = positionInfo.width / 2;
  const windowWidth = window.innerWidth;

  let left = mouseX - halfWidth;
  if (windowWidth - mouseX < halfWidth) {
    left = mouseX - (10 + positionInfo.width);
  } else if (left < 0) {
    left = mouseX + 10;
  }

  myParktip.style.left = left + "px";
  myParktip.style.top = (mouseY - positionInfo.height - 12) + "px";
}

function mouseOutPark(feature)
{
  myParktip.style.zIndex = -1;
}

function createParkTipTable(toolElement)
{
  const key = toolElement.key;
  const park = GT.pota.parks[key];

  if (!park) return;  // This should never happen, we're here because we have a park on the map with at least on spot

  const now = Date.now(); 

  const { name, entityId, locationDesc } = park;
 
  const altName = GT.dxccToAltName[+entityId] || "Unknown"; 

  let html = `<div style='background-color:#000;color:lightgreen;font-weight:bold;font-size:12px;border:1px solid gray;margin:0px' class='roundBorder'>
    ${key} : <font color='cyan'>${name} (<font color='yellow'>${altName}</font>)</font><br>
    <font color='lightblue'>${locationDesc}</font></div>
    <table id='potaSpotsTable' class='darkTable' style='margin: 0 auto;'>
    <tr><th>Activator</th><th>Spotter</th><th>Freq</th><th>Mode</th><th>Count</th><th>When</th><th>Source</th><th>Comment</th></tr>`;

  const spots = GT.pota.parkSpots[key];
  for (const i in spots) {
    const spot = spots[i]; 
    const { band, mode } = spot;

    if (validateMapBandAndMode(band, mode)) {
      const { activator, spotter, frequency, count, spotTime, source, comments } = spot;
      const spotterDisplay = (spotter === activator) ? "Self" : spotter;
      const secondsAgo = ~~((now - spotTime) / 1000);
      html += `<tr><td style='color:yellow'>${activator}</td><td style='color:cyan'>${spotterDisplay}</td><td style='color:lightgreen'>${formatMhz(frequency, 3, 3)} <font color='yellow'>(${band})</font></td><td style='color:orange'>${mode}</td><td>${count}</td><td style='color:lightblue'>${toDHMS(secondsAgo)}</td><td>${source}</td><td>${comments}</td></tr>`;
    }
  }
  html += "</table>";
  myParktip.innerHTML = html;
}
