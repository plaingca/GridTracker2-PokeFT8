// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.
const gtVersionStr = electron.ipcRenderer.sendSync("appVersion");
const gtVersion = parseInt(gtVersionStr.replace(/\./g, ""));

// let GT is in screen.js
GT.startingUp = true;
GT.firstRun = false;

const p = os.platform().toLowerCase();
GT.platform = p.startsWith("win") ? "windows" : p.includes("darwin") ? "mac" : p.includes("linux") ? "linux" : p;
GT.Platform = p.startsWith("win") ? "Windows" : p.includes("darwin") ? "Mac" : p.includes("linux") ? "Linux" : p;

const distanceUnitConfig = {
    KM: { step: 100, max: 19500, min: 100, default: 1000 },
    MI: { step: 100, max: 12100, min: 100, default: 1000 },  // ~100 km in miles
    NM: { step: 100, max: 10500, min: 100, default: 1000 },  // ~100 km in nautical miles
    DG: { step: 1, max: 176, min: 1, default: 10 }  
};

function loadAllSettings()
{
  const userDataPath = electron.ipcRenderer.sendSync("getPath", "userData");
  
  GT.scriptPath = path.join(userDataPath, "Call Roster Scripts");
  GT.appData = path.join(userDataPath, "Ginternal");
  GT.qsoBackupDir = path.join(userDataPath, "Backup Logs");
  GT.extraMediaDir = path.join(userDataPath, "Extra Media");
  
  GT.asarDxccInfoPath = path.resolve(resourcesPath, "data/dxcc-info.json");
  GT.dxccInfoPath = path.join(GT.appData, "dxcc-info.json");
  GT.tempDxccInfoPath = path.join(GT.appData, "dxcc-info-update.json");
  GT.spotsPath = path.join(GT.appData, "spots.json");
  GT.tempPath = electron.ipcRenderer.sendSync("getPath", "temp"); // Okay to do this one separate
  
  let tryDirectory = "";
  try {
    [GT.appData, GT.scriptPath, GT.qsoBackupDir, GT.extraMediaDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        tryDirectory = dir;
        fs.mkdirSync(dir);
      }
    });
  } catch (e) {
    alert(`Unable to create or access ${tryDirectory} folder.\r\nPermission violation, GT cannot continue`);
  }

  GT.scriptPath = path.join(GT.scriptPath, (GT.platform == "windows") ? "cr-alert.bat" : "cr-alert.sh");

  // Apply defaults once
  if (!("defaultsApplied" in GT.settings))
  {
    GT.settings = { ...def_settings };
    GT.settings.defaultsApplied = true;
  }
  else
  {
    GT.settings = deepmerge(def_settings, GT.settings, { arrayMerge: (destinationArray, sourceArray) => sourceArray } );
    for (const key in GT.settings.roster.exceptions)
    {
      if (key in GT.settings.roster)
      {
        GT.settings.roster.exceptions[key] = GT.settings.roster[key];
        delete GT.settings.roster[key]
      }
    }
  }


  // Test for valid projections
  if (k_valid_projections.indexOf(GT.settings.map.projection) == -1)
  {
    GT.settings.map.projection = k_valid_projections[0];
  }

  if (GT.settings.mapMemory.length != 7)
  {
    GT.settings.mapMemory = [];
    for (let x = 0; x < 7; x++)
    {
      GT.settings.mapMemory[x] = { ...def_mapMemory };
    }
  }
  else
  {
    for (let x in GT.settings.mapMemory)
    {
      // In case we add more to def_mapMemory
      GT.settings.mapMemory[x] = { ...def_mapMemory, ...GT.settings.mapMemory[x] };
    }
  }

  GT.settings.currentVersion = String(gtVersion);

  // remap any settings as neeeded
  if (GT.settings.roster.huntNeed)
  {
    GT.settings.roster.logbook.huntNeed = GT.settings.roster.huntNeed;
    delete GT.settings.roster.huntNeed;
  }

  if (GT.settings.roster.referenceNeed)
  {
    GT.settings.roster.logbook.referenceNeed = GT.settings.roster.referenceNeed;
    delete GT.settings.roster.referenceNeed;
  }

  if (GT.settings.roster.columns.OAMS)
  {
    delete GT.settings.roster.columns.OAMS;
  }

  let indexOfOAMS = GT.settings.roster.columnOrder.indexOf("OAMS");
  if (indexOfOAMS > -1)
  {
    GT.settings.roster.columnOrder.splice(indexOfOAMS, 1);
  }

  // Deprecated single app log path
  if (GT.settings.app.wsjtLogPath)
  {
    if (fs.existsSync(GT.settings.app.wsjtLogPath)) appendAppLog(GT.settings.app.wsjtLogPath, true);
    delete GT.settings.app.wsjtLogPath;
  }

  // Remove any unknown settings
  for (const key in GT.settings)
  {
    if (validSettings.indexOf(key) == -1)
    {
      console.log("Removing unknown setting: " + key);
      delete GT.settings[key];
    }
  }

  // Correct Range Ring values from previous versions
  if (GT.settings.map.rangeRingDistance == 0)
  {
      GT.settings.map.showRangeRings = false;
      GT.settings.map.rangeRingDistance = unitToKilometer(distanceUnitConfig[GT.settings.app.distanceUnit].default, GT.settings.app.distanceUnit);
  }

  setWindowTheme();
}

loadAllSettings();

const gtShortVersion = "v" + gtVersionStr;
const gtUserAgent = "GridTracker/" + gtVersionStr;
const backupAdifHeader = "GridTracker v" + gtVersion + " <EOH>\r\n";

GT.languages = {
  en: "i18n/en.json",
  cn: "i18n/cn.json",
  cnt: "i18n/cn-t.json",
  de: "i18n/de.json",
  fr: "i18n/fr.json",
  qb: "i18n/fr-ca.json",
  it: "i18n/it.json",
  es: "i18n/es.json",
  ja: "i18n/ja.json",
  br: "i18n/pt-br.json",
  pt: "i18n/pt-pt.json",
  nl: "i18n/nl.json",
  pl: "i18n/pl.json",
};

GT.i18n = {};
GT.popupWindowHandle = null;
GT.popupWindowInitialized = false;
GT.callRosterWindowHandle = null;
GT.callRosterWindowInitialized = false;
GT.conditionsWindowHandle = null;
GT.conditionsWindowInitialized = false;

// Basic regexp that identifies a callsign and any pre- and post-indicators.
const CALLSIGN_REGEXP = /^([A-Z0-9]+\/){0,1}([0-9][A-Z]{1,2}[0-9]|[A-Z]{1,2}[0-9])([A-Z0-9]+)(\/[A-Z0-9/]+){0,1}$/

GT.statsWindowHandle = null;
GT.statsWindowInitialized = false;
GT.lookupWindowHandle = null;
GT.lookupWindowInitialized = false;
GT.baWindowHandle = null;
GT.baWindowInitialized = false;
GT.alertWindowHandle = null;
GT.alertWindowInitialized = false;

GT.callRoster = {};
GT.rosterUpdateTimer = null;
GT.updateLastMsgTimer = null;
GT.myDXGrid = "";
GT.speechAvailable = false;
GT.receptionReports = { spots: {} };
GT.acknowledgedCalls = {};
GT.worldVhfActivity = {};
GT.worldVhfActivityTimestamp = 0;
GT.flightDuration = 30;
GT.crScript = GT.settings.app.crScript;
GT.spotView = GT.settings.app.spotView;

GT.myLat = Number(GT.settings.map.latitude);
if (isNaN(GT.myLat) || Math.abs(GT.myLat) >= 90)
{
  GT.myLat = 0.0;
  GT.settings.map.latitude = 0.0;
}

GT.myLon = Number(GT.settings.map.longitude);
if (isNaN(GT.myLon) || Math.abs(GT.myLon) >= 180)
{
  GT.myLon = 0.0;
  GT.settings.map.longitude = 0.0;
}

GT.useTransform = false;
GT.currentOverlay = GT.settings.map.trophyOverlay;
GT.spotCollector = {};
GT.decodeCollector = {};
GT.currentMapIndex = "";
GT.setNewUdpPortTimeoutHandle = null;
GT.map = null;
GT.menuShowing = true;
GT.closing = false;
GT.lastLookupCallsign = "";
GT.lookupTimeout = null;
GT.liveGrids = {};
GT.qsoGrids = {};
GT.liveCallsigns = {};
GT.sessionCallsigns = new Map();
GT.sessionDXCCs = new Map();

GT.hotKeys = {};
GT.forwardIPs = [];

GT.activeRoster = null;
GT.activeExceptions = null;
GT.activeAudioAlerts = null;
GT.activeCustomAlerts = null;

GT.flightPaths = [];
GT.flightPathOffset = 0;
GT.flightPathLineDash = [9, 3, 3];
GT.flightPathTotal = (9 + 3 + 3) * 2;

GT.lastTimeState = -1;

GT.lastMessages = [];
GT.lastTraffic = [];
GT.Zday = false;

GT.maps = [];
GT.modes = {};
GT.modes_phone = {};
GT.colorBands = [
  "OOB",
  "4000m",
  "2200m",
  "630m",
  "160m",
  "80m",
  "60m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "11m",
  "10m",
  "8m",
  "6m",
  "4m",
  "2m",
  "1.25m",
  "70cm",
  "33cm",
  "23cm",
  "13cm",
  "9cm",
  "6cm",
  "3cm",
  "1.2cm",
  "6mm",
  "4mm",
  "2.5mm",
  "2mm",
  "1mm"
];

GT.non_us_bands = [
  "160m",
  "80m",
  "60m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
  "6m",
  "4m",
  "2m"
];

GT.us_bands = [
  "160m",
  "80m",
  "60m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
  "6m",
  "2m"
];

GT.ipformat = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

GT.pathIgnore = {};
GT.pathIgnore.RU = true;
GT.pathIgnore.FTRU = true;
GT.pathIgnore.FD = true;
GT.pathIgnore.TEST = true;
GT.pathIgnore.DX = true;
GT.pathIgnore.CQ = true;

GT.replaceCQ = {};
GT.replaceCQ.ASIA = "AS";

GT.myDXCC = -1;
GT.QSOhash = {};
GT.myQsoCalls = {};
GT.myQsoGrids = {};
GT.QSLcount = 0;
GT.QSOcount = 0;
GT.rowsFiltered = 0;
GT.ignoreMessages = 0;
GT.lastTimeSinceMessageInSeconds = timeNowSec();
GT.currentYear = new Date().getUTCFullYear();
GT.currentDay = 0;
GT.loadQSOs = false;
GT.mainBorderColor = "#222222FF";
GT.pushPinMode = false;
GT.pskBandActivityTimerHandle = null;

GT.dxccInfo = {};
GT.dxccVersion = 0;
GT.newDxccVersion = 0;
GT.prefixToDXCC = {};
GT.directCallToDXCC = {};
GT.directCallToCQzone = {};
GT.directCallToITUzone = {};
GT.prefixToCQzone = {};
GT.prefixToITUzone = {};
GT.dxccToAltName = {};
GT.dxccToCountryCode = {};
GT.altNameToDXCC = {};
GT.dxccToADIFName = {};
GT.gridToDXCC = {};
GT.gridToState = {};
GT.StateData = {};
GT.cqZones = {};
GT.wacZones = {};
GT.wasZones = {};
GT.wacpZones = {};
GT.ituZones = {};

GT.tracker = {};
GT.lastTrasmissionTimeSec = timeNowSec();
GT.getPostBuffer = getPostBuffer;
GT.mapsLayer = [];
GT.offlineMapsLayer = [];
GT.tileLayer = null;
GT.mapView = null;
GT.layerSources = {};
GT.layerVectors = {};
GT.scaleLine = null;
GT.scaleUnits = {};
GT.scaleUnits.MI = "us";
GT.scaleUnits.KM = "metric";
GT.scaleUnits.NM = "nautical";
GT.scaleUnits.DG = "degrees";
GT.PredLayer = null;
GT.predLayerTimeout = null;
GT.epiTimeValue = 0;
GT.mouseX = 0;
GT.mouseY = 0;
GT.screenX = 0;
GT.screenY = 0;

GT.gtMediaDir = path.resolve(resourcesPath, "media");
GT.localeString = navigator.language;
GT.voices = null;
GT.shapeData = {};
GT.utilShapes = {};
GT.countyData = {};
GT.zipToCounty = {};
GT.fipsToCounty = {};
GT.cntyToCounty = {};
GT.us48Data = {};
GT.lastLookupAddress = null;
GT.lookupCache = {};
GT.pskColors = {};
GT.pskColors.OOB = "888888";
GT.pskColors["4000m"] = "45E0FF";
GT.pskColors["2200m"] = "FF4500";
GT.pskColors["630m"] = "1E90FF";
GT.pskColors["160m"] = "7CFC00";
GT.pskColors["80m"] = "E550E5";
GT.pskColors["60m"] = "99CCFF";
GT.pskColors["40m"] = "00FFFF";
GT.pskColors["30m"] = "62FF62";
GT.pskColors["20m"] = "FFC40C";
GT.pskColors["17m"] = "F2F261";
GT.pskColors["15m"] = "CCA166";
GT.pskColors["12m"] = "CB3D3D";
GT.pskColors["11m"] = "00FF00";
GT.pskColors["10m"] = "FF69B4";
GT.pskColors["8m"] = "8b00fb";
GT.pskColors["6m"] = "4dfff9";
GT.pskColors["4m"] = "93ff05";
GT.pskColors["2m"] = "FF1493";
GT.pskColors["1.25m"] = "beff00";
GT.pskColors["70cm"] = "999900";
GT.pskColors["33cm"] = "ff8c90";
GT.pskColors["23cm"] = "5AB8C7";
GT.pskColors["13cm"] = "ff7540";
GT.pskColors["9cm"] = "b77ac7";
GT.pskColors["6cm"] = "b77ac7";
GT.pskColors["3cm"] = "696969";
GT.pskColors["1.2cm"] = "b77ac7";
GT.pskColors["6mm"] = "b77ac7";
GT.pskColors["4mm"] = "b77ac7";
GT.pskColors["2.5mm"] = "b77ac7";
GT.pskColors["2mm"] = "b77ac7";
GT.pskColors["1mm"] = "b77ac7";

GT.bandToColor = {};
GT.colorLeafletPins = {};
GT.colorLeafletQPins = {};

GT.KColors = [
  "#0F0",
  "#0F0",
  "#0F0",
  "#0F0",
  "#0F0",
  "#FF0",
  "#FC0",
  "#F90",
  "#F00",
  "#F00"
];


GT.UTCoptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short"
};

GT.LocalOptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZoneName: "short"
};

GT.terminatorDegrees = [-0.833 , -6 , -12, -18];
GT.terminatorDegreesNames = ["Horizon", "Civil", "Nautical", "Astronomical"];


GT.GraylineImageArray = ["img/shadow_on_32.png", "img/shadow_off_32.png"];
GT.gtFlagImageArray = ["img/flag_off.png", "img/flag_on.png"];
GT.pinImageArray = ["img/gt_grid.png", "img/red_pin_32.png"];
GT.qsoLockImageArray = ["img/qso_unlocked_32.png", "img/qso_locked_32.png"];
GT.qslLockImageArray = ["img/qsl_unlocked_32.png", "img/qsl_locked_32.png"];
GT.alertImageArray = ["img/unmuted-button.png", "img/muted-button.png"];
GT.spotImageArray = ["img/spots.png", "img/spots.png", "img/heat.png"];
GT.maidenheadModeImageArray = ["img/mh4_32.png", "img/mh6_32.png"];
GT.predImageArray = ["img/no-pred.png", "img/muf.png", "img/fof2.png", "img/epi.png", "img/auf.png", "img/tropo.png"];

GT.tropoData = { nodes: {}, alert_id: 0, refresh: 128, timeout: null };

GT.viewInfo = {};
GT.viewInfo[0] = ["qsoGrids", "Grids", 0, 0, 0];
GT.viewInfo[1] = ["cqZones", "CQ Zones", 0, 0, 40];
GT.viewInfo[2] = ["ituZones", "ITU Zones", 0, 0, 90];
GT.viewInfo[3] = ["wacZones", "Continents", 0, 0, 6];
GT.viewInfo[4] = ["wasZones", "US States", 0, 0, 50];
GT.viewInfo[5] = ["dxccInfo", "DXCCs", 0, 0, 340];
GT.viewInfo[6] = ["countyData", "US Counties", 0, 0, 3220];
GT.viewInfo[7] = ["us48Data", "US Continental Grids", 0, 0, 488];
GT.viewInfo[8] = ["wacpZones", "CA Provinces", 0, 0, 13];

GT.awardLayers = {
  1 : {o: "cqZones",  p: "cqzone",  bx: "#FF000015", br: "#005500FF", bw: 1,   ww: 1,   dc: "#00FF0066", dw: "#FFFF0066", s: true},
  2 : {o: "ituZones", p: "ituzone", bx: "#FF000015", br: "#800080FF", bw: 1,   ww: 1,   dc: "#00FF0066", dw: "#FFFF0066", s: true},
  3 : {o: "wacZones", p: "wac",     bx: "#FF000015", br: "#006666FF", bw: 1,   ww: 1,   dc: "#00FF0066", dw: "#FFFF0066", s: true},
  4 : {o: "wasZones", p: "was",     bx: "#FF000020", br: "#0000FFFF", bw: 1,   ww: 1,   dc: "#00FF0066", dw: "#FFFF0066", s: true},
  5 : {o: "dxccInfo", p: "dxcc",    bx: "#FF000015", br: "#0000FFFF", bw: 1,   ww: 1,   dc: "#00FF0066", dw: "#FFFF0066", s: true},
  6 : {o: "countyData", p: "usc",   bx: "#00000000", br: "#0000FFFF", bw: 0.1, ww: 1,   dc: "#00FF0066", dw: "#FFFF0066", s: true},
  7 : {o: "us48Data", p: "us48",    bx: "#FF000015", br: "#0000FFFF", bw: 0.1, ww: 0.2, dc: "#00FF0066", dw: "#FFFF0066", s: false},
  8 : {o: "wacpZones", p: "wacp",   bx: "#FF000020", br: "#0000FFFF", bw: 1,   ww: 1 ,  dc: "#00FF0066", dw: "#FFFF0066", s: true}
};

GT.dazzleGrid = null;
GT.dazzleTimeout = null;
GT.gridAlpha = "88";
GT.mediaFiles = null;
GT.qslAuthorityTimer = null;


GT.helpShow = false;
GT.MyCurrentGrid = "";
GT.MyGridIsUp = false;
GT.animateFrame = 0;
GT.nextDimTime = 0;
GT.nightTime = false;
GT.currentNightState = false;
GT.timeNow = timeNowSec();
GT.transmitFlightPath = null;
GT.usRadar = null;
GT.usRadarInterval = null;
GT.oldQSOTimer = null;
GT.lastBand = "";
GT.lastMode = "";
GT.weAreDecoding = false;
GT.localDXcall = "";
GT.countIndex = 0;
GT.lastCountIndex = 0;
GT.lastTransmitCallsign = {};
GT.lastStatusCallsign = {};
GT.lastTxMessage = null;
GT.lastMapView = null;
GT.lastVersionInfo = null;
GT.wsStatusTimer = null;
GT.hoverFunctors = {};
GT.lastHover = { feature: null, functor: null };

GT.wsjtHandlers = {
  0: handleWsjtxNotSupported,
  1: handleInstanceStatus,
  2: handleWsjtxDecode,
  3: handleWsjtxClear,
  4: handleWsjtxNotSupported,
  5: handleWsjtxQSO,
  6: handleWsjtxClose,
  7: handleWsjtxNotSupported,
  8: handleWsjtxNotSupported,
  9: handleWsjtxNotSupported,
  10: handleWsjtxWSPR,
  11: handleWsjtxNotSupported,
  12: handleWsjtxADIF
};

GT.gtFlagIcon = new ol.style.Icon({
  src: "img/flag_gt_user.png",
  anchorYUnits: "pixels",
  anchorXUnits: "pixels",
  anchor: [12, 17]
});

GT.pushPinIconOff = new ol.style.Icon({
  src: "img/red-circle.png",
  anchorYUnits: "pixels",
  anchorXUnits: "pixels",
  anchor: [5, 18]
});

GT.mapSourceTypes = {
  XYZ: ol.source.XYZ,
  TileWMS: ol.source.TileWMS,
  Group: null
};

GT.trackerWorkerCallbacks = {
  processed: applyQSOs
};

GT.trackerWorker = new Worker("./lib/trackerWorker.js");

GT.trackerWorker.onmessage = function(event)
{
  if ("type" in event.data)
  {
    if (event.data.type in GT.trackerWorkerCallbacks)
    {
      GT.trackerWorkerCallbacks[event.data.type](event.data);
    }
    else console.log("trackerWorkerCallback: unknown event type : " + event.data.type);
  }
  else console.log("trackerWorkerCallback: no event type");
};

GT.sortFunction = [
  myCallCompare,
  myGridCompare,
  myModeCompare,
  myDxccCompare,
  myTimeCompare,
  myBandCompare,
  myConfirmedCompare,
  myPotaCompare,
  myStateCompare,
  myCntyCompare
];

GT.lastSortIndex = 4;
GT.qsoPages = 1;
GT.qsoPage = 0;
GT.lastSortType = 1;
GT.searchWB = "";
GT.gridSearch = "";
GT.potaSearch = "";
GT.stateSearch = "";
GT.cntySearch = "";
GT.filterBand = "Mixed";
GT.filterMode = "Mixed";
GT.filterDxcc = 0;
GT.filterQSL = "All";
GT.lastSearchSelection = null;
GT.statBoxTimer = null;
GT.timezoneLayer = null;
GT.redrawFromLegendTimeoutHandle = null;
GT.defaultButtons = [];
GT.finishedLoading = false;
GT.wsjtCurrentPort = -1;
GT.wsjtCurrentIP = "";
GT.wsjtUdpServer = null;
GT.wsjtUdpSocketReady = false;
GT.wsjtUdpSocketError = false;
GT.forwardUdpServer = null;
GT.instances = {};
GT.instanceCount = 0;
GT.activeInstance = "";
GT.activeIndex = 0;

GT.adifBroadcastServer = null;
GT.adifBroadcastSocketReady = false;
GT.adifBroadcastSocketError = false;

GT.adifBroadcastCurrentPort = -1;
GT.adifBroadcastCurrentIP = "";


GT.currentID = null;
GT.lastWsjtMessageByPort = {};
GT.qrzLookupSessionId = null;
GT.qrzLookupCallsign = "";
GT.qrzLookupGrid = "";
GT.sinceLastLookup = 0;
GT.rosterSpot = false;
GT.redrawSpotsTimeout = null;
GT.spotTotalCount = 0;
GT.spotFlightColor = "#FFFFFFBB";
GT.spotNightFlightColor = "#FFFFFFBB";

GT.startupTable = [
  [loadI18n, "Loading Locales", "gt.startupTable.loadi18n"],
  [mediaCheck, "Media Check", ""],
  [callsignServicesInit, "Callsign Services Initialized", "gt.startupTable.callsigns"],
  [loadMapSettings, "Map Settings Initialized", "gt.startupTable.mapSettings"],
  [initMap, "Loaded Map", "gt.startupTable.loadMap"],
  [setPins, "Created Pins", "gt.startupTable.setPins"],
  [loadViewSettings, "Loaded View Settings", "gt.startupTable.viewSettings"],
  [loadMsgSettings, "Loaded Messaging Settings", "gt.startupTable.msgSettings"],
  [setFileSelectors, "Set File Selectors", "gt.startupTable.fileSelectors"],
  [loadMaidenHeadData, "Loaded Maidenhead Dataset", "gt.startupTable.maidenheadData"],
  [updateBasedOnIni, "Updated from WSJT-X", "gt.startupTable.updateINI"],
  [loadAdifSettings, "Loaded ADIF Settings", "gt.startupTable.loadADIF"],
  [startupButtonsAndInputs, "Buttons and Inputs Initialized", "gt.startupTable.initButtons"],
  [initSpeech, "Speech Initialized", "gt.startupTable.initSpeech"],
  [initSoundCards, "Sounds Initialized", "gt.startupTable.initSounds"],
  [loadPortSettings, "Loaded Network Settings", "gt.startupTable.loadPorts"],
  [loadLookupDetails, "Callsign Lookup Details Loaded", "gt.startupTable.loadLookup"],
  [renderLocale, "Rendering Locale", "gt.startupTable.loadi18n"],
  [startupEventsAndTimers, "Set Events and Timers", "gt.startupTable.eventTimers"],
  [registerHotKeys, "Registered Hotkeys", "gt.startupTable.regHotkeys"],
  [gtChatSystemInit, "Chat System Initialized", "gt.startupTable.initOams"],
  [initPota, "POTA Initialized", "gt.startupTable.loadPOTA"],
  [postInit, "Finalizing System", "gt.startupTable.postInit"],
  [undefined, "Completed", "gt.startupEngine.completed"]
];

function saveAllSettings()
{
  try
  {
    if (GT.map)
    {
      mapMemory(6, true, true);
      GT.settings.map.zoom = GT.map.getView().getZoom() / 0.333;
    }
  
    saveGridTrackerSettings();
  }
  catch (e)
  {
    console.error("saveAllSettings");
    console.error(e);
  }
}

function saveAndCloseApp(shouldRestart = false)
{
  GT.closing = true;
  saveAllSettings();
  saveReceptionReports();

  if (GT.wsjtUdpServer != null)
  {
    try
    {
      if (multicastEnable.checked == true && GT.settings.app.wsjtIP != "")
      {
        GT.wsjtUdpServer.dropMembership(GT.settings.app.wsjtIP);
      }
      GT.wsjtUdpServer.close();
      GT.wsjtUdpServer = null;
    }
    catch (e)
    {
      console.error(e);
    }
  }

  if (GT.adifBroadcastServer != null)
  {
    try
    {
      if (adifBroadcastMulticast.checked == true && GT.settings.app.adifBroadcastIP != "")
      {
        GT.adifBroadcastServer.dropMembership(GT.settings.app.adifBroadcastIP);
      }
      GT.adifBroadcastServer.close();
    }
    catch (e)
    {
      console.error(e);
    }
  }

  if (GT.forwardUdpServer != null)
  {
    try
    {
      GT.forwardUdpServer.close();
    }
    catch (e)
    {
      console.error(e);
    }
  }

  closePskMqtt();

  if (shouldRestart == true)
  {
    electron.ipcRenderer.sendSync("restartGridTracker2", false);
  }
}

function clearAndReload(fullReset = true)
{
  GT.closing = true;
  
  if (GT.wsjtUdpServer != null)
  {
    try
    {
      if (multicastEnable.checked == true && GT.settings.app.wsjtIP != "")
      {
        GT.wsjtUdpServer.dropMembership(GT.settings.app.wsjtIP);
      }
      GT.wsjtUdpServer.close();
    }
    catch (e)
    {
      console.error(e);
    }
  }

  if (GT.adifBroadcastServer != null)
  {
    try
    {
      if (adifBroadcastMulticast.checked == true && GT.settings.app.adifBroadcastIP != "")
      {
        GT.adifBroadcastServer.dropMembership(GT.settings.app.adifBroadcastIP);
      }
      GT.adifBroadcastServer.close();
    }
    catch (e)
    {
      console.error(e);
    }
  }

  if (GT.forwardUdpServer != null)
  {
    try
    {
      GT.forwardUdpServer.close();
    }
    catch (e)
    {
      console.error(e);
    }
  }

  if (fullReset)
  {
    GT.settings = { };
  }
  else
  {
    delete GT.settings.app;
    delete GT.settings.map;
    delete GT.settings.legendColors;
    delete GT.settings.audio;
  }

  saveGridTrackerSettings();

  electron.ipcRenderer.sendSync("restartGridTracker2", true);
}

window.addEventListener("beforeunload", function ()
{
  saveAndCloseApp();
});


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

function hideLiveGrid(i)
{
  if (GT.layerSources.live.hasFeature(GT.liveGrids[i].rectangle))
  {
    GT.layerSources.live.removeFeature(GT.liveGrids[i].rectangle);
  }
}

function liveTriangleGrid(i)
{
  if (GT.liveGrids[i].isTriangle == false)
  {
    if (GT.layerSources.live.hasFeature(GT.liveGrids[i].rectangle))
    {
      GT.layerSources.live.removeFeature(GT.liveGrids[i].rectangle);
    }

    gridToTriangle(i, GT.liveGrids[i].rectangle, false);
    GT.liveGrids[i].isTriangle = true;
    GT.layerSources.live.addFeature(GT.liveGrids[i].rectangle);
  }
}

function qsoTriangleGrid(i)
{
  if (GT.qsoGrids[i].isTriangle == false)
  {
    if (GT.layerSources.qso.hasFeature(GT.qsoGrids[i].rectangle))
    {
      GT.layerSources.qso.removeFeature(GT.qsoGrids[i].rectangle);
    }

    gridToTriangle(i, GT.qsoGrids[i].rectangle, true);
    GT.qsoGrids[i].isTriangle = true;
    GT.layerSources.qso.addFeature(GT.qsoGrids[i].rectangle);
  }
}

function setGridView()
{
  GT.settings.app.gridViewMode = gtGridViewMode.value;
  
  redrawGrids();
}

function cycleGridView()
{
  let mode = GT.settings.app.gridViewMode;
  mode++;
  if (mode > 3) mode = 1;
  if (mode < 1) mode = 1;
  gtGridViewMode.value = GT.settings.app.gridViewMode = mode;

  
  redrawGrids();
}

function toggleEarth()
{
  GT.settings.app.graylineImgSrc ^= 1;
  graylineImg.src = GT.GraylineImageArray[GT.settings.app.graylineImgSrc];
  if (GT.settings.app.graylineImgSrc == 1)
  {
    dayNight.hide();
    GT.nightTime = dayNight.refresh();
  }
  else
  {
    GT.nightTime = dayNight.refresh();
    dayNight.show();
  }

}

function toggleOffline()
{
  offlineModeEnable.checked = !offlineModeEnable.checked;
  changeOffline();
}

function changeOffline()
{
  if (GT.map == null) return;

  GT.settings.map.offlineMode = offlineModeEnable.checked;

  if (GT.settings.map.offlineMode == false)
  {
    conditionsButton.style.display = "";
    lookupButton.style.display = "";

    radarButton.style.display = "";
    mapSelect.style.display = "";
    mapNightSelect.style.display = "";
    offlineMapSelect.style.display = "none";
    offlineMapNightSelect.style.display = "none";

    for (let key in GT.settings.adifLog.menu)
    {
      let value = GT.settings.adifLog.menu[key];
      let where = key + "Div";
      document.getElementById(key).checked = value;
      if (value == true)
      {
        document.getElementById(where).style.display = "";
      }
      else
      {
        document.getElementById(where).style.display = "none";
      }
    }
    if (GT.lookupWindowInitialized == false)
    {
      openLookupWindow(false);
    }
  }
  else
  {
    openLookupWindow(false);

    conditionsButton.style.display = "none";
    buttonPsk24CheckBoxDiv.style.display = "none";
    buttonQRZCheckBoxDiv.style.display = "none";
    buttonLOTWCheckBoxDiv.style.display = "none";
    buttonClubCheckBoxDiv.style.display = "none";

    lookupButton.style.display = "none";
    radarButton.style.display = "none";
    mapSelect.style.display = "none";
    mapNightSelect.style.display = "none";
    offlineMapSelect.style.display = "";
    offlineMapNightSelect.style.display = "";

  }
  CloudlogGetProfiles();
  changePotaEnable();
  displayRadar();
  displayPredLayer();
  updateSpottingViews();
  updateOffAirServicesViews();
  loadMapSettings();
  changeMapValues();
  setVisualHunting();
  goProcessRoster();
}


// from GridTracker.html
function ignoreMessagesToggle()
{
  GT.ignoreMessages ^= 1;
  if (GT.ignoreMessages == 0)
  {
    txrxdec.style.backgroundColor = "Green";
    txrxdec.style.borderColor = "GreenYellow";
    txrxdec.innerHTML = "RECEIVE";
    txrxdec.title = "Click to ignore incoming messages";
  }
  else
  {
    txrxdec.style.backgroundColor = "DimGray";
    txrxdec.style.borderColor = "DarkGray";
    txrxdec.innerHTML = "IGNORE";
    txrxdec.title = "Click to resume reading messages";
  }
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

function refreshQSOs()
{
  // Don't bother, we have other logs coming
  if (GT.adifLogCount > 0) return;

  clearOrLoadButton.style.display = "none";
  busyDiv.style.display = "block";

  let task = {};
  task.type = "process";
  task.QSOhash = GT.QSOhash;
  GT.trackerWorker.postMessage(task);
}

function applyQSOs(task)
{
  if (task != null)
  {
    GT.tracker = task.tracker;
  }

  if (GT.adifLogCount == 0)
  {
    clearOrLoadButton.style.display = "block";
    busyDiv.style.display = "none";

    updateRosterWorked();
    goProcessRoster();
    redrawGrids(false);
  }
}


// =========================================================================
// V8 OPTIMIZATION: Rigid Object Constructor for Live Callsigns
// Guarantees a single Hidden Class (Memory Shape) for massive V8 speedups.
// =========================================================================
function LiveCallsign(DEcall, DXcall, grid, mode, band, msg, dxcc, time) {
  // 1. Core identifiers
  this.hash = null;
  this.DEcall = DEcall;
  this.DXcall = DXcall;
  this.grid = grid;
  this.gridQualified = false;
  this.mode = mode;
  this.band = band;
  this.msg = msg;
  this.dxcc = dxcc;
  
  // 2. Timestamps
  this.time = time;
  this.age = time;
  this.life = time;
  
  // 3. QSO Data
  this.worked = false;
  this.confirmed = false;
  this.qso = false;
  this.RSTsent = "-";
  this.RSTrecv = "-";
  this.dt = 0.0;
  this.delta = -1;
  this.wspr = null;
  
  // 4. Geographic Data
  this.distance = 0;
  this.heading = 0;
  this.px = null;
  this.zone = null;
  this.cont = null;
  this.pota = null;
  this.state = null;
  this.cnty = null;
  this.zipcode = null;
  this.fips = null;
  this.ituz = null;
  this.cqz = null;
  
  // 5. System State / Flags
  this.instance = null;
  this.rosterAlerted = false;
  this.shouldRosterAlert = false;
  this.audioAlerted = false;
  this.shouldAudioAlert = false;
  this.qrz = false;
  this.digital = true;
  this.phone = false;
  this.even = false;
  this.qual = false;
  this.locked = false;
  this.reset = false;
  this.CQ = false;
  this.RR73 = false;
  
  // 6. Arrays / Strings
  this.vucc_grids = [];
  this.propMode = "";
  this.IOTA = "";
  this.cntys = 0;
  this.UTC = "";
}

function addLiveCallsign(
  finalGrid,
  finalDXcall,
  finalDEcall,
  finalRSTsent,
  finalTime,
  ifinalMsg,
  mode,
  band,
  confirmed,
  isQSO,
  finalRSTrecv,
  finalDxcc
)
{
  let callsign = null;
  let wspr = mode == "WSPR" ? band : null;
  let hash = "";

  let finalMsg = ifinalMsg.trim();
  if (finalMsg.length > 40) finalMsg = finalMsg.substring(0, 40) + "...";

  if (finalDxcc < 1) finalDxcc = callsignToDxcc(finalDXcall);

  hash = finalDXcall + band + mode;

  if (hash in GT.liveCallsigns) callsign = GT.liveCallsigns[hash];

  if (wspr != null && validateMapBandAndMode(band, mode))
  {
    qthToBox(finalGrid, finalDXcall, false, false, finalDEcall, band, wspr, hash, false);
  }

  if (callsign == null)
  {
    // Pass finalDXcall to DEcall, and finalDEcall to DXcall (matching original parameter swap)
    let newCallsign = new LiveCallsign(finalDXcall, finalDEcall, finalGrid, mode, band, finalMsg, finalDxcc, finalTime);
    if (finalGrid.length > 0) newCallsign.gridQualified = true;
    newCallsign.wspr = wspr;

    if (finalDxcc > -1)
    {
      newCallsign.px = getWpx(finalDXcall);
      if (newCallsign.px)
      {
        newCallsign.zone = Number(newCallsign.px.charAt(newCallsign.px.length - 1));
      }

      newCallsign.cont = GT.dxccInfo[finalDxcc].continent;
      if (newCallsign.dxcc == 390 && newCallsign.zone == 1) { newCallsign.cont = "EU"; }
    }

    if (finalRSTsent != null) newCallsign.RSTsent = finalRSTsent;
    if (finalRSTrecv != null) newCallsign.RSTrecv = finalRSTrecv;

    if (isKnownCallsignUS(newCallsign.dxcc))
    {
      let fourGrid = finalGrid.substr(0, 4);
      if (fourGrid in GT.gridToState && GT.gridToState[fourGrid].length == 1)
      {
        newCallsign.state = GT.gridToState[fourGrid][0];
      }
    }

    if (GT.settings.callsignLookups.ulsUseEnable && isKnownCallsignUS(finalDxcc) && (newCallsign.state == null || newCallsign.cnty == null))
    {
      lookupKnownCallsign(newCallsign);
    }
    else if (newCallsign.state == null)
    {
      if (finalDxcc == 1 && GT.settings.callsignLookups.cacUseEnable && finalDXcall in GT.cacCallsigns)
      {
        newCallsign.state = "CA-" + GT.cacCallsigns[finalDXcall];
      }
    }
    GT.liveCallsigns[hash] = newCallsign;
    updateSessionCallsigns(newCallsign);
  }
  else
  {
    if (callsign.DXcall != "Self" && finalTime > callsign.time)
    {
      callsign.time = finalTime;
      callsign.age = finalTime;
      callsign.mode = mode;
      callsign.band = band;
      callsign.delta = -1;
      callsign.DXcall = finalDEcall;
      callsign.msg = finalMsg;
      callsign.dxcc = finalDxcc;
      callsign.wspr = wspr;
      if (finalGrid.length > callsign.grid.length) {
        callsign.grid = finalGrid;
        callsign.gridQualified = true;
      } else if (finalGrid.length == callsign.grid.length && finalGrid != callsign.grid) {
        callsign.grid = finalGrid;
        callsign.gridQualified = true;
      }
      // callsign.field = callsign.grid.substring(0, 2);
      if (finalRSTsent != null) callsign.RSTsent = finalRSTsent;
      if (finalRSTrecv != null) callsign.RSTrecv = finalRSTrecv;
      callsign.vucc_grids = [];
      callsign.propMode = "";
      callsign.digital = true;
      callsign.phone = false;
      callsign.IOTA = "";

      updateSessionCallsigns(callsign);
    }
  }
}

function timeoutSetUdpPort()
{
  GT.settings.app.wsjtUdpPort = udpPortInput.value;

  // Make sure the broadcast Port isn't on our recieve port!
  ValidatePort(adifBroadcastPort, adifBroadcastEnable, CheckAdifBroadcastPortIsNotReceivePort);

  lastMsgTimeDiv.innerHTML = I18N("gt.timeoutSetUdpPort");
  GT.setNewUdpPortTimeoutHandle = null;
}

function setUdpPort()
{
  if (GT.setNewUdpPortTimeoutHandle != null) { nodeTimers.clearTimeout(GT.setNewUdpPortTimeoutHandle); }
  lastMsgTimeDiv.innerHTML = I18N("gt.setUdpPort");
  GT.setNewUdpPortTimeoutHandle = nodeTimers.setTimeout(timeoutSetUdpPort, 1000);
}

function changeGridDecay()
{
  GT.settings.app.gridsquareDecayTime = parseInt(gridDecay.value);
  decayRateTd.innerHTML =
    Number(GT.settings.app.gridsquareDecayTime) == 0
      ? "<I>No Decay</I>"
      : toDHMS(Number(GT.settings.app.gridsquareDecayTime));
}

function changeMouseOverValue()
{
  GT.settings.map.mouseOver = mouseOverValue.checked;
  
}

function changeMergeOverlayValue()
{
  GT.settings.map.mergeOverlay = mergeOverlayValue.checked;
  
  setTrophyOverlay(GT.currentOverlay);
}

function getPathColor()
{
  if (GT.settings.map.nightMapEnable && GT.nightTime)
  {
    if (GT.settings.map.nightPathColor == 0) return "#000";
    if (GT.settings.map.nightPathColor == 361) return "#FFF";
    return "hsl(" + GT.settings.map.nightPathColor + ", 100%, 50%)";
  }
  else
  {
    if (GT.settings.map.pathColor == 0) return "#000";
    if (GT.settings.map.pathColor == 361) return "#FFF";
    return "hsl(" + GT.settings.map.pathColor + ", 100%, 50%)";
  }
}

function getQrzPathColor()
{
  if (GT.settings.map.nightMapEnable && GT.nightTime)
  {
    if (GT.settings.map.nightQrzPathColor == 0) return "#000";
    if (GT.settings.map.nightQrzPathColor == 361) return "#FFF";
    return "hsl(" + GT.settings.map.nightQrzPathColor + ", 100%, 50%)";
  }
  else
  {
    if (GT.settings.map.qrzPathColor == 0) return "#000";
    if (GT.settings.map.qrzPathColor == 361) return "#FFF";
    return "hsl(" + GT.settings.map.qrzPathColor + ", 100%, 50%)";
  }
}

function changeGrayline()
{
  GT.settings.map.graylineOpacity = graylineValue.value;
  showDarknessTd.innerHTML = parseInt(graylineValue.value * 100) + "%";
  
  GT.nightTime = dayNight.refresh();
}

function changePathValues()
{
  GT.settings.app.pathWidthWeight = pathWidthValue.value;
  GT.settings.app.qrzPathWidthWeight = qrzPathWidthValue.value;
  GT.settings.map.pathColor = pathColorValue.value;
  GT.settings.map.qrzPathColor = qrzPathColorValue.value;

  pathWidthTd.innerHTML = pathWidthValue.value;
  qrzPathWidthTd.innerHTML = qrzPathWidthValue.value;
  setMapColors();
  
  styleAllFlightPaths();
}


// --- 2. THE UPDATED STYLE UPDATER (No Loops for standard flights!) ---
function styleAllFlightPaths() {
  if (!GT.sharedStyles) return;

  let colorNormal = getPathColor();
  let widthNormal = pathWidthValue.value;
  let colorQRZ = getQrzPathColor();
  let widthQRZ = qrzPathWidthValue.value;

  // 1. Remove paths ONLY if their stroke width changed to 0
  if (widthNormal == 0 || widthQRZ == 0) {
    for (let i = GT.flightPaths.length - 1; i >= 0; i--) {
      let path = GT.flightPaths[i];
      if ((path.isQRZ && widthQRZ == 0) || (!path.isQRZ && widthNormal == 0)) {
        if ("Arrow" in path) GT.layerSources.flight.removeFeature(path.Arrow);
        GT.layerSources.flight.removeFeature(path);
        GT.flightPaths.splice(i, 1);
      }
    }
  }

  // 2. Instantly update all lines via the shared styles!
  if (widthNormal > 0) {
    GT.sharedStyles.flight.getStroke().setWidth(widthNormal);
    GT.sharedStyles.flight.getStroke().setColor(colorNormal);
    GT.sharedStyles.flightArrow.getImage().getStroke().setWidth(widthNormal);
    GT.sharedStyles.flightArrow.getImage().getStroke().setColor(colorNormal);
  }

  if (widthQRZ > 0) {
    GT.sharedStyles.qrz.getStroke().setWidth(widthQRZ);
    GT.sharedStyles.qrz.getStroke().setColor(colorQRZ);
    GT.sharedStyles.qrzArrow.getImage().getStroke().setWidth(widthQRZ);
    GT.sharedStyles.qrzArrow.getImage().getStroke().setColor(colorQRZ);
  }
  
  // 3. Update Shape Flights (Polygons)
  for (let i = GT.flightPaths.length - 1; i >= 0; i--) {
    if (GT.flightPaths[i].isShapeFlight === 1) {
      let fStyle = GT.flightPaths[i].getStyle();
      let fStroke = fStyle.getStroke();
      fStroke.setWidth(GT.flightPaths[i].isQRZ ? widthQRZ : widthNormal);
      fStroke.setColor(GT.flightPaths[i].isQRZ ? colorQRZ : colorNormal);
      GT.flightPaths[i].setStyle(fStyle);
    }
  }

  // CRITICAL FIX: Tell the layers the styles changed!
  GT.layerSources.flight.changed();
  GT.layerSources.transmit.changed();

  if (GT.map) GT.map.render();
}


function compareCallsignTime(a, b)
{
  return a.time - b.time;
}


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
    startLookup(GT.gtFlagPins[feature.key].call, GT.gtFlagPins[feature.key].grid);
  }
  return false;
}

function openConditionsWindow(show = true)
{
  if (GT.conditionsWindowHandle == null)
  {
    GT.conditionsWindowHandle = window.open("gt_conditions.html","gt_conditions");
  }
  else if (GT.conditionsWindowInitialized)
  {
    show ? electron.ipcRenderer.send("showWin", "gt_conditions") : electron.ipcRenderer.send("hideWin", "gt_conditions");
  }
}

function toggleConditionsBox()
{
  if (GT.conditionsWindowInitialized)
  {
    electron.ipcRenderer.send("toggleWin", "gt_conditions");
  }
}


function insertMessageInRoster(newMessage, msgDEcallsign, msgDXcallsign, callObj, hash)
{
    if (GT.rosterUpdateTimer) {
        if (typeof GT.rosterUpdateTimer.refresh === "function") {
            GT.rosterUpdateTimer.refresh();
        } else {
            nodeTimers.clearTimeout(GT.rosterUpdateTimer);
            GT.rosterUpdateTimer = nodeTimers.setTimeout(delayedRosterUpdate, 150);
        }
    } else {
        GT.rosterUpdateTimer = nodeTimers.setTimeout(delayedRosterUpdate, 150);
    }

    // 2. Adjust Hash for SP=7 (Fox/Hound or SuperFox)
    if (newMessage.SP === 7) {
        hash += msgDXcallsign;
    }

    if (callObj.life === undefined || callObj.reset) {
        callObj.life = timeNowSec();
        callObj.reset = false;
    }

    const activeCallObj = newMessage.SP === 7 ? { ...callObj } : callObj;
    activeCallObj.hash = hash;

    const entry = GT.callRoster[hash];
    
    if (!entry) {
        GT.callRoster[hash] = {
            message: newMessage,
            callObj: activeCallObj,
            DXcall: msgDXcallsign,
            DEcall: msgDEcallsign,
        };
    } else {
        entry.message = newMessage;
        entry.callObj = activeCallObj;
        entry.DXcall = msgDXcallsign;
        entry.DEcall = msgDEcallsign;
    }
}

function delayedRosterUpdate()
{
  GT.rosterUpdateTimer = null;
  goProcessRoster();
}

function updateLiveDistance(callsign)
{
  if (!callsign.grid) return;
  const LL = squareToCenter(callsign.grid);
  callsign.distance = MyCircle.distance(GT.myLat, GT.myLon, LL.a, LL.o);
  callsign.heading = MyCircle.bearing(GT.myLat, GT.myLon, LL.a, LL.o);
}

function openCallRosterWindow(toggle = true)
{
  if (GT.callRosterWindowHandle == null)
  {
    GT.callRosterWindowHandle = window.open("gt_roster.html", "gt_roster");
  }
  else if (GT.callRosterWindowInitialized)
  {
    if (toggle)
    {
      electron.ipcRenderer.send("toggleWin", "gt_roster");
    }
    else
    {
      electron.ipcRenderer.send("showWin", "gt_roster");
    }
    goProcessRoster();
  }
}

function updateRosterWorked()
{
  if (GT.callRosterWindowInitialized)
  {
    try
    {
      GT.callRosterWindowHandle.window.updateWorked();
    }
    catch (e)
    {
      console.error(e);
    }
  }
}

function updateRosterInstances()
{
  if (GT.callRosterWindowInitialized)
  {
    try
    {
      GT.callRosterWindowHandle.window.updateInstances();
    }
    catch (e)
    {
      console.error(e);
    }
  }
}

// Called from GridTracher.html
function changeLogbookPage()
{
  qsoItemsPerPageTd.innerHTML = GT.settings.app.qsoItemsPerPage = parseInt(qsoItemsPerPageValue.value);
  
}


// Called from GridTracher.html
function qslAuthorityChanged()
{
  if (GT.qslAuthorityTimer != null)
  {
    nodeTimers.clearTimeout(GT.qslAuthorityTimer);
    GT.qslAuthorityTimer = null;
  }

  GT.settings.app.qslAuthority = qslAuthority.value;
  
  // we set the timer as calling directly will pause the input queue
  GT.qslAuthorityTimer = nodeTimers.setTimeout(reloadFromQslAuthorityChanged, 500);
}

function reloadFromQslAuthorityChanged()
{
  GT.qslAuthorityTimer = null;
  clearQSOs(false, "startupAdifLoadCheck"); // do not clear what's on disk!
}

function updateLogbook()
{
  renderLogbookView();
}

function openStatsWindow(show = true)
{
  if (GT.statsWindowHandle == null)
  {
    GT.statsWindowHandle = window.open("gt_stats.html", "gt_stats");
  }
  else if (GT.statsWindowInitialized == true)
  {
    show ? electron.ipcRenderer.send("showWin", "gt_stats") : electron.ipcRenderer.send("hideWin", "gt_stats");
  }
}

function initPopupWindow()
{
  if (GT.popupWindowHandle == null)
  {
    GT.popupWindowHandle = window.open("gt_popup.html", "gt_popup");
  }
}

function renderTooltipWindow(feature)
{
  if (GT.popupWindowInitialized)
  {
    let positionInfo = myTooltip.getBoundingClientRect();
    GT.popupWindowHandle.window.resizeTo(parseInt(positionInfo.width + 20), parseInt(positionInfo.height + 40));
    GT.popupWindowHandle.window.adifTable.innerHTML = myTooltip.innerHTML;
    electron.ipcRenderer.send("showWin", "gt_popup");
  }
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

function tempGridToBox(iQTH, borderColor, boxColor, layer)
{
  let borderWeight = 2;
  let newGridBox = null;
  let LL = maidenheadToBounds(iQTH.substr(0, 4));

  let bounds = [
    [LL.lo1, LL.la1],
    [LL.lo2, LL.la2]
  ];
  newGridBox = rectangle(bounds);
  newGridBox.setId(iQTH);
  newGridBox.set("prop", null);
  const featureStyle = new ol.style.Style({
    fill: new ol.style.Fill({
      color: boxColor
    }),
    stroke: new ol.style.Stroke({
      color: borderColor,
      width: borderWeight,
      lineJoin: "round"
    }),
    zIndex: 60
  });
  newGridBox.setStyle(featureStyle);
  newGridBox.grid = iQTH;
  newGridBox.size = 0;
  GT.layerSources.temp.addFeature(newGridBox);
  return newGridBox;
}


function onMyKeyDown(event)
{
  if (event.keyCode == 27)
  {
    rootSettingsDiv.style.display = "none";
    helpDiv.style.display = "none";
    GT.helpShow = false;
    event.preventDefault();
  }

  if (spotsDiv.style.display !== "none")
  {
    let activeId = document.activeElement ? document.activeElement.id : "";
    if (activeId === "spotHistoryH" || activeId === "spotHistoryM")
    {
      if ((event.key >= '0' && event.key <= '9') || 
          ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.key)) 
      {
        return; 
      }
    }
  }

  if (rootSettingsDiv.style.display == "none")
  {
    if (event.code in GT.hotKeys)
    {
      if (GT.hotKeys[event.code].extKey != null && GT.hotKeys[event.code].extKey in event && event[GT.hotKeys[event.code].extKey] == false)
      {
        return;
      }
      if (GT.hotKeys[event.code].param1 != null)
      {
        let param2 = null;
        if (GT.hotKeys[event.code].param2 != null)
        {
          if (GT.hotKeys[event.code].param2 in event) { param2 = event[GT.hotKeys[event.code].param2]; }
        }
        GT.hotKeys[event.code].func(GT.hotKeys[event.code].param1, param2);
        event.preventDefault();
      }
      else
      {
        GT.hotKeys[event.code].func();
        event.preventDefault();
      }
    }
    else if (event.key in GT.hotKeys)
    {
      if (GT.hotKeys[event.key].extKey != null && GT.hotKeys[event.key].extKey in event && event[GT.hotKeys[event.key].extKey] == false)
      {
        return;
      }
      if (GT.hotKeys[event.key].param1 != null)
      {
        let param2 = null;
        if (GT.hotKeys[event.key].param2 != null)
        {
          if (GT.hotKeys[event.key].param2 in event) { param2 = event[GT.hotKeys[event.key].param2]; }
        }
        GT.hotKeys[event.key].func(GT.hotKeys[event.key].param1, param2);
        event.preventDefault();
      }
      else
      {
        GT.hotKeys[event.key].func();
        event.preventDefault();
      }
    }
  }
}

function clearTempGrids()
{
  GT.layerSources.temp.clear();
}

function clearAwardLayer()
{
  GT.layerSources.award.clear();
}

function mapMemory(x, save, internal = false)
{
  if (save == true)
  {
    GT.settings.mapMemory[x].LoLa = ol.proj.toLonLat(GT.mapView.getCenter(), GT.settings.map.projection);
    GT.settings.mapMemory[x].zoom = GT.mapView.getZoom() / 0.333;
    GT.settings.mapMemory[x].bearing = GT.mapView.getRotation();
    if (internal == false)
    {
      playAlertMediaFile("Clicky-3.mp3");
    }
  }
  else
  {
    if (GT.settings.mapMemory[x].zoom != -1)
    {
      GT.mapView.setCenter(ol.proj.fromLonLat(GT.settings.mapMemory[x].LoLa, GT.settings.map.projection));
      GT.mapView.setZoom(GT.settings.mapMemory[x].zoom * 0.333);
      GT.mapView.setRotation(GT.settings.mapMemory[x].bearing);
    }
  }
}

function registerHotKey(name, key, func, param1 = null, param2 = null, extKey = null, descPrefix = null)
{
  GT.hotKeys[key] = {};
  GT.hotKeys[key].name = name;
  GT.hotKeys[key].func = func;
  GT.hotKeys[key].param1 = param1;
  GT.hotKeys[key].param2 = param2;
  GT.hotKeys[key].extKey = extKey;
  GT.hotKeys[key].descPrefix = descPrefix;
}

function registerHotKeys()
{
  registerHotKey("Show Grid Map Layer", "1", setTrophyOverlay, 0);
  registerHotKey("Show CQ Zones Award Layer", "2", setTrophyOverlay, 1);
  registerHotKey("Show ITU Zones Award Layer", "3", setTrophyOverlay, 2);
  registerHotKey("Show WAC Award Layer", "4", setTrophyOverlay, 3);
  registerHotKey("Show WAS Award Layer", "5", setTrophyOverlay, 4);
  registerHotKey("Show DXCC Award Layer", "6", setTrophyOverlay, 5);
  registerHotKey("Show US Counties Award Layer", "7", setTrophyOverlay, 6);
  registerHotKey("Show US48 Grids Award Layer", "8", setTrophyOverlay, 7);
  registerHotKey("Show CA Provinces Award Layer", "9", setTrophyOverlay, 8);
  registerHotKey("Toggle US Radar Overlay", "0", toggleRadar);
  registerHotKey("Cycle Award Layers", "Equal", cycleTrophyOverlay);
  
  // KeyA reserved in first.js
  registerHotKey("Toggle All Grid Overlay", "KeyB", toggleAllGrids, null, null, "ctrlKey");
  // KeyC reserved in first.js
  registerHotKey("Toggle Moon Tracking", "KeyD", toggleMoon, null, null, "ctrlKey");
  registerHotKey("Open Conditions Windows", "KeyE", showConditionsBox, null, null, "ctrlKey");
  registerHotKey("Open Call Roster Window", "KeyF", openCallRosterWindow, null, null, "ctrlKey");
  registerHotKey("Toggle GridTracker Users", "KeyG", toggleGtMap, null, null, "ctrlKey");
  registerHotKey("Toggle Timezone Overlay", "KeyH", toggleTimezones, null, null, "ctrlKey");
  registerHotKey("Open Statistics Window", "KeyI", showRootInfoBox, null, null, "ctrlKey");
  registerHotKey("Toggle Active Path Animation", "KeyJ", toggleAnimate, null, null, "ctrlKey");
  registerHotKey("Capture Window to Clipboard", "KeyK", captureScreenshot, null, null, "ctrlKey");
  registerHotKey("Open ADIF file", "KeyL", adifLoadDialog, null, null, "ctrlKey");
  registerHotKey("Toggle Audio Mute", "KeyM", toggleAlertMute, null, null, "ctrlKey");
  registerHotKey("Toggle Grayline", "KeyN", toggleEarth, null, null, "ctrlKey");
  registerHotKey("Cycle Spot View", "KeyO", cycleSpotsView, null, null, "ctrlKey");
  registerHotKey("Toggle Grid/PushPin Mode", "KeyP", togglePushPinMode, null, null, "ctrlKey");
  registerHotKey("Cycle Logbook/Live View", "KeyQ", cycleGridView, null, null, "ctrlKey");
  // KeyR reserved and broken
  registerHotKey("Open Settings", "KeyS", showSettingsBox, null, null, "ctrlKey");
  registerHotKey("Toggle RX Spots over Grids", "KeyT", toggleSpotOverGrids, null, null, "ctrlKey");
  registerHotKey("Toggle Award Layer Merge", "KeyU", toggleMergeOverlay, null, null, "ctrlKey");
  // KeyV reserved in first.js
  registerHotKey("Toggle AEQD Projection", "KeyW", changeMapProjection, null, null, "ctrlKey");
  registerHotKey("Toggle Map Position Info", "KeyX", toggleMouseTrack, null, null, "ctrlKey");
  registerHotKey("Toggle Offline Mode", "KeyY", toggleOffline, null, null, "ctrlKey");
  registerHotKey("Center Map on QTH Grid", "KeyZ", setCenterQTH, null, null, "ctrlKey");

  registerHotKey("Toggle Call Roster Scripts", "Minus", toggleCRScript, null, null, "shiftKey");
  registerHotKey("Map Memory 1", "F5", mapMemory, 0, "shiftKey", null, "Save");
  registerHotKey("Map Memory 2", "F6", mapMemory, 1, "shiftKey", null, "Save");
  registerHotKey("Map Memory 3", "F7", mapMemory, 2, "shiftKey", null, "Save");
  registerHotKey("Map Memory 4", "F8", mapMemory, 3, "shiftKey", null, "Save");
  registerHotKey("Map Memory 5", "F9", mapMemory, 4, "shiftKey", null, "Save");
  registerHotKey("Map Memory 6", "F10", mapMemory, 5, "shiftKey", null, "Save");
  registerHotKey("Toggle Fullscreen", "F11", toggleFullscreen);
  registerHotKey("Toggle Sidebar Panel", "F12", toggleMenu);
  registerHotKey("Hot Key List (This List)", "F1", toggleHelp);

  generatePrintTable();
}

const naturalCollator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base'
});

function generatePrintTable()
{
  let rows = [];
  let keys = Object.keys(GT.hotKeys).sort((a, b) => naturalCollator.compare(a, b));
  for (const index in keys)
  {
    let key = keys[index];
    let row = {};
    let keyName = key.replace("Key", "");
    let prefix = "";
    if (GT.hotKeys[key].extKey != null)
    {
      prefix = GT.hotKeys[key].extKey.replace("Key", "") + " + ";
    }
    row.key = prefix + keyName;
    row.desc = GT.hotKeys[key].name;
    rows.push(row);

    if (GT.hotKeys[key].descPrefix != null)
    {
      row = {};
      prefix = (GT.hotKeys[key].descPrefix) ? GT.hotKeys[key].param2.replace("Key", "") + " + " : "";
      row.key = prefix + keyName;
      row.desc = GT.hotKeys[key].descPrefix + " " + GT.hotKeys[key].name;
      rows.push(row);
    }
  }

  let halfOfRows = parseInt(rows.length / 2); 
  let htmlWorker = "<tr><th colspan='4'>Hot Key List (" + gtShortVersion + ")</th></tr>";
  htmlWorker += "<tr><th>Key</th><th>Action</th><th>Key</th><th>Action</th></tr>";
  GT.printableHotkeyList = "<table class='darkTable'><tr><th colspan='4'><h1>GridTracker2</h1><h3>Hot Key List (<i>" + gtShortVersion + "</i>)</h3></th></tr>";
  GT.printableHotkeyList += "<tr><th>Key</th><th>Action</th><th>Key</th><th>Action</th></tr>";
  for (let x = 0; x <= halfOfRows; x++)
  {
    let secondX = x + halfOfRows + 1;
    let row;
    if (secondX < rows.length)
    {
      row = "<tr><td>" + rows[x].key + "</td><td align='left'>" +  rows[x].desc + "</td><td>" + rows[secondX].key +"</td><td align='left'>" + rows[secondX].desc + "</td></tr>";
    }
    else
    {
      row = "<tr><td>" + rows[x].key + "</td><td align='left'>" +  rows[x].desc + "</td></tr>";
    }
    htmlWorker += row;
    GT.printableHotkeyList += row;
  }
  GT.printableHotkeyList += "</table>";
  printableHotKeyTable.innerHTML = htmlWorker;
}

function openPrint()
{
  let printWindow = window.open('', 'printHotKeys', 'height=500, width=500');
  printWindow.document.open();
  printWindow.document.write(`
      <html>
        <head>
            <title>Print HotKeys</title>
            <style>
                body { font-family: sans-serif; }
                table.darkTable {
                  border-collapse: collapse;
                  border: 1px solid #888;
                  text-align: center;
                }
                table.darkTable td,
                table.darkTable th { border: 1px solid #888; padding: 2px 4px; }
                table.darkTable thead { border-bottom: 2px solid #888; }
                table.darkTable thead th {
                  font-weight: bold;
                  text-align: center;
                  border-left: 2px solid #888;
                }
                table.darkTable thead th:first-child { border-left: none; }
            </style>
        </head>
        <body onLoad="print();close()">
            ${GT.printableHotkeyList}
        </body>
      </html>
  `);
  printWindow.document.close();
}

function toggleMoon()
{
  GT.settings.app.moonTrack ^= 1;
  (GT.settings.app.moonTrack == 1) ? moonLayer.show() : moonLayer.hide();
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

function cycleTrophyOverlay()
{
  GT.currentOverlay++;
  GT.currentOverlay %= 9;

  setTrophyOverlay(GT.currentOverlay);
}

function makeTitleInfo(mapWindow)
{
  let band = GT.settings.app.gtBandFilter.length == 0 ? "Mixed" : GT.settings.app.gtBandFilter == "auto" ? GT.settings.app.myBand : GT.settings.app.gtBandFilter;
  let mode = GT.settings.app.gtModeFilter.length == 0 ? "Mixed" : GT.settings.app.gtModeFilter == "auto" ? GT.settings.app.myMode : GT.settings.app.gtModeFilter;

  let news = `GridTracker2 [Band: ${band} Mode: ${mode}`;
  let end = "]";

  if (mapWindow)
  {
    news += ` Layer: ${GT.viewInfo[GT.currentOverlay][1]}`;
  }

  if (GT.currentOverlay == 0 && GT.settings.app.gridViewMode == 1) { return news + end; }

  let workline = ` - Worked ${GT.viewInfo[GT.currentOverlay][2]} Confirmed ${GT.viewInfo[GT.currentOverlay][3]}`;
  if (GT.viewInfo[GT.currentOverlay][2] <= GT.viewInfo[GT.currentOverlay][4] && GT.viewInfo[GT.currentOverlay][4] > 0)
  {
    end = ` Needed ${(GT.viewInfo[GT.currentOverlay][4] - GT.viewInfo[GT.currentOverlay][3])}]`;
  }
  return news + workline + end;
}

function gtTrophyLayerChanged(element)
{
  setTrophyOverlay(element.value);
}

function setTrophyOverlay(which)
{
  gtTrophyLayer.value = GT.currentOverlay = GT.settings.map.trophyOverlay = which;
  window.document.title = makeTitleInfo(true);
  myTrophyTooltip.style.zIndex = -1;

  clearAwardLayer();

  if (which == 0)
  {
    for (const key in GT.layerVectors) GT.layerVectors[key].setVisible(true);

    GT.layerVectors.award.setVisible(false);

    if (GT.timezoneLayer) GT.timezoneLayer.setVisible(true);
  }
  else
  {
    if (GT.settings.map.mergeOverlay == false)
    {
      for (const key in GT.layerVectors) GT.layerVectors[key].setVisible(false);
    }
    else
    {
      for (const key in GT.layerVectors) GT.layerVectors[key].setVisible(true);
    }

    GT.layerVectors.award.setVisible(true);

    if (GT.timezoneLayer) GT.timezoneLayer.setVisible(false);

    mapLoseFocus();
  }

  if (GT.settings.app.gtFlagImgSrc > 0 && GT.settings.app.offAirServicesEnable == true && GT.settings.map.offlineMode == false)
  {
    GT.layerVectors.gtflags.setVisible(true);
  }
  else
  {
    GT.layerVectors.gtflags.setVisible(false);
  }

  if (which in GT.awardLayers)
  {
    const layer = GT.awardLayers[which];
    const data = GT[layer.o];
    for (const key in data)
    {
      let boxColor = layer.bx;
      let borderColor = layer.br;
      let borderWeight = layer.bw;
      if (data[key].confirmed)
      {
        boxColor = layer.dc;
        borderWeight = layer.ww;
      }
      else if (data[key].worked)
      {
        boxColor = layer.dw;
        borderWeight = layer.ww;
      }
      if (layer.s)
      {
        // Old DXCCs may be deleted
        if (data[key].geo != "deleted")
        {
          GT.layerSources.award.addFeature(shapeFeature(
            key,
            data[key].geo,
            layer.p,
            boxColor,
            borderColor,
            borderWeight
          ));
        }
      }
      else
      {
        let LL = maidenheadToBounds(key);
        let bounds = [[LL.lo1, LL.la1], [LL.lo2, LL.la2]];

        GT.layerSources.award.addFeature(gridFeature(
          key,
          rectangle(bounds),
          layer.p,
          boxColor,
          borderColor,
          borderWeight
        ));
      }
    }
  }

  updateSpottingViews();
}

function gridFeature(key, objectData, propname, fillColor, borderColor, borderWidth)
{
  let style = new ol.style.Style({
    stroke: new ol.style.Stroke({
      color: borderColor,
      width: borderWidth
    }),
    fill: new ol.style.Fill({
      color: fillColor
    })
  });

  objectData.setStyle(style);
  objectData.set("prop", propname);
  objectData.set("grid", key);
  objectData.size = 2;
  return objectData;
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
        let color = report.source == "O" ? "cyan;font-size: larger" : "orange";
        let fullSource = report.source == "O" ? "GT-RTSN" : report.source == "M" ? "PSK-MQTT" : "PSK-Reporter";
        sourceStr = `<tr><td>Source</td><td style='color:${color};'>${fullSource}</font></td>`;
      }

      const gridSpotRow =
        `<tr><td>Grid</td><td style='${lookupGridCellStyle(report.grid, report.band, report.mode)}'>${report.grid}</td></tr>`;

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
  let pin = GT.gtFlagPins[key];
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

function reloadInfo()
{
  if (GT.statsWindowInitialized == true)
  {
    GT.statsWindowHandle.window.reloadInfo();
  }
}

function maidenheadFieldToBounds(qth) {
  const lo1 = ((qth.charCodeAt(0) & 0xDF) - 65) * 20 - 180;
  const la1 = ((qth.charCodeAt(1) & 0xDF) - 65) * 10 - 90;

  return {
    la1,
    lo1,
    la2: la1 + 10,
    lo2: lo1 + 20
  };
}

function squareToCenter(qth) {
  const LL = maidenheadToBounds(qth, true);
  return {
    a: (LL.la1 + LL.la2) * 0.5,
    o: (LL.lo1 + LL.lo2) * 0.5
  };
}

function latLonToGridSquare(lat, lon, width = 4) {
  if (!(lat > -90 && lat < 90 && lon >= -180 && lon <= 180)) {
    return "";
  }
  
  const adjLat = lat + 90;
  const adjLon = lon + 180;
  const gLon = (adjLon / 20) | 0;
  const gLat = (adjLat / 10) | 0;
  const remLon = adjLon % 20;
  const remLat = adjLat % 10;
  const nLon = (remLon / 2) | 0;
  const nLat = remLat | 0;
  if (width === 4) {
      return String.fromCharCode(
      65 + gLon,    // 1st char (Field)
      65 + gLat,    // 2nd char (Field)
      48 + nLon,    // 3rd char (Square)
      48 + nLat,    // 4th char (Square)
    );
  }

  const subLon = ((remLon % 2) * 12) | 0;
  const subLat = ((remLat % 1) * 24) | 0;
  return String.fromCharCode(
    65 + gLon,    // 1st char (Field)
    65 + gLat,    // 2nd char (Field)
    48 + nLon,    // 3rd char (Square)
    48 + nLat,    // 4th char (Square)
    65 + subLon,  // 5th char (Subsquare)
    65 + subLat   // 6th char (Subsquare )
  );
}

// Pre-computed constants
const K_LO_STEP_6 = 5 / 60;
const K_LA_STEP_6 = 2.5 / 60;

function maidenheadToBounds(qth, allChars) {
  const c0 = (qth.charCodeAt(0) & 0xDF) - 65;
  const c1 = (qth.charCodeAt(1) & 0xDF) - 65;
  const c2 =  qth.charCodeAt(2) - 48;
  const c3 =  qth.charCodeAt(3) - 48;

  const lo1 = c0 * 20 + c2 * 2 - 180;
  const la1 = c1 * 10 + c3 - 90;

  if (qth.length === 6 && (allChars || (GT.pushPinMode && GT.settings.app.sixWideMode))) {
    const c4 = (qth.charCodeAt(4) & 0xDF) - 65;
    const c5 = (qth.charCodeAt(5) & 0xDF) - 65;
    const lo  = lo1 + c4 * K_LO_STEP_6;
    const la  = la1 + c5 * K_LA_STEP_6;
    return { lo1: lo, la1: la, lo2: lo + K_LO_STEP_6, la2: la + K_LA_STEP_6, size: 6 };
  }

  return { lo1, la1, lo2: lo1 + 2, la2: la1 + 1, size: 4 };
}

function iconFeature(center, iconObj, zIndex, propName)
{
  let feature = new ol.Feature({
    geometry: new ol.geom.Point(center),
    prop: propName
  });

  if (GT.useTransform)
  {
    feature.getGeometry().transform("EPSG:3857", GT.settings.map.projection);
  }

  let iconStyle = new ol.style.Style({
    zIndex: zIndex,
    image: iconObj
  });

  feature.setStyle(iconStyle);
  return feature;
}

function qthToQsoBox(iQTH, iHash, locked, DE, worked, confirmed, band)
{
  if (GT.settings.app.gridViewMode == 1) return null;

  if (GT.useTransform)
  {
    let LL = maidenheadToBounds(iQTH.substr(0, 4));
    if (MyCircle.distance(GT.myLat, GT.myLon, LL.la1, LL.lo1) * 3958.761 > k_max_aeqd_grid_in_miles)
    {
      return null;
    }
  }

  let borderColor = GT.mainBorderColor;
  let boxColor = GT.settings.legendColors.QSX + GT.gridAlpha;
  let borderWeight = 0.5;
  let myDEbox = false;
  if (worked)
  {
    boxColor = GT.settings.legendColors.QSO + GT.gridAlpha;
  }
  if (confirmed)
  {
    boxColor = GT.settings.legendColors.QSL + GT.gridAlpha;
  }

  let zIndex = 2;
  let entityVisibility = GT.settings.app.gridViewMode > 1;
  if (GT.pushPinMode == false || GT.settings.app.sixWideMode == 0) iQTH = iQTH.substr(0, 4);
  else iQTH = iQTH.substr(0, 6);
  let rect = null;

  if (iQTH in GT.qsoGrids)
  {
    rect = GT.qsoGrids[iQTH];
  }

  if (rect == null)
  {
    let triangleView = false;
    if (GT.settings.app.gridViewMode == 3 && iQTH in GT.liveGrids && entityVisibility == true && GT.pushPinMode == false)
    {
      if (confirmed)
      {
        hideLiveGrid(iQTH);
      }
      else
      {
        liveTriangleGrid(iQTH);
        triangleView = true;
      }
    }
    LL = maidenheadToBounds(iQTH);
    if (LL.size == 6)
    {
      borderColor = "#000000FF";
      zIndex = 50;
    }
    let newRect = new MapGridRect(iQTH);

    let bounds = [
      [LL.lo1, LL.la1],
      [LL.lo2, LL.la2]
    ];
    if (triangleView == true) newRect.rectangle = triangle(bounds, true);
    else newRect.rectangle = rectangle(bounds);

    newRect.isTriangle = triangleView;

    const featureHoverStyle = new ol.style.Style({
      fill: new ol.style.Fill({
        color: boxColor
      }),
      stroke: new ol.style.Stroke({
        color: borderColor,
        width: borderWeight,
        lineJoin: "round"
      }),
      zIndex: zIndex
    });
    newRect.rectangle.setStyle(featureHoverStyle);

    newRect.rectangle.qth = iQTH;

    if (GT.pushPinMode == false && entityVisibility == true) { GT.layerSources.qso.addFeature(newRect.rectangle); }

    let newPin = GT.colorLeafletQPins.worked[band];
    if (confirmed) newPin = GT.colorLeafletQPins.confirmed[band];

    let lat = (LL.la1 + LL.la2) / 2;
    let lon = (LL.lo1 + LL.lo2) / 2;

    newRect.rectangle.pin = iconFeature(
      ol.proj.fromLonLat([lon, lat]),
      GT.settings.app.sixWideMode == 1 ? newPin : GT.pushPinIconOff,
      zIndex,
      "pin"
    );
    newRect.rectangle.pin.qth = iQTH;
    newRect.rectangle.pin.hashes = {};
    newRect.rectangle.pin.hashes[iHash] = 1;
    newRect.rectangle.pin.size = LL.size;

    if (GT.pushPinMode && entityVisibility == true) { GT.layerSources.qsoPins.addFeature(newRect.rectangle.pin); }

    newRect.rectangle.locked = locked;
    newRect.rectangle.worked = worked;
    newRect.rectangle.confirmed = confirmed;
    newRect.rectangle.size = LL.size;
    newRect.rectangle.hashes = {};
    newRect.rectangle.hashes[iHash] = 1;
    newRect.rectangle.qso = true;

    newRect.rectangle.pin.qso = true;
    GT.qsoGrids[iQTH] = newRect;
  }
  else
  {
    if (!(iHash in rect.rectangle.hashes))
    {
      rect.rectangle.hashes[iHash] = 1;
      rect.rectangle.pin.hashes[iHash] = 1;
    }
    if (!confirmed && rect.rectangle.confirmed)
    {
      return rect.rectangle;
    }
    if (worked && !rect.rectangle.worked) rect.rectangle.worked = worked;
    if (confirmed && !rect.rectangle.confirmed) { rect.rectangle.confirmed = confirmed; }
    borderColor = GT.mainBorderColor;
    if (myDEbox) borderWeight = 1;
    zIndex = 2;
    if (rect.rectangle.size == 6)
    {
      borderColor = "#000000FF";
      zIndex = 50;
    }

    const featureHoverStyle = new ol.style.Style({
      fill: new ol.style.Fill({
        color: boxColor
      }),
      stroke: new ol.style.Stroke({
        color: borderColor,
        width: borderWeight,
        lineJoin: "round"
      }),
      zIndex: zIndex
    });
    rect.rectangle.setStyle(featureHoverStyle);
  }
}

function MapGridRect(qth, age = 0) {
  this.qth = qth;
  this.age = age;
  this.rectangle = null;
  this.isTriangle = false;
}

function qthToBox(iQTH, iDEcallsign, iCQ, locked, DE, band, wspr, hash, fromLive)
{
  if (GT.settings.app.gridViewMode == 2) return null;

  if (GT.useTransform)
  {
    let LL = maidenheadToBounds(iQTH.substr(0, 4));
    if (MyCircle.distance(GT.myLat, GT.myLon, LL.la1, LL.lo1) * 3958.761 > k_max_aeqd_grid_in_miles)
    {
      return null;
    }
  }
  let borderColor = GT.mainBorderColor;
  let boxColor = GT.settings.legendColors.QSX + GT.gridAlpha;
  let borderWeight = 0.5;
  let myDEbox = false;
  if (DE == "CQ" || iCQ)
  {
    boxColor = GT.settings.legendColors.CQ + GT.gridAlpha;
  }

  if (DE == GT.settings.app.myCall)
  {
    borderColor = "#FF0000FF";
    boxColor = GT.settings.legendColors.QRZ + GT.gridAlpha;
    borderWeight = 1.0;
    myDEbox = true;
  }
  if (DE.indexOf("CQ DX") > -1)
  {
    boxColor = GT.settings.legendColors.CQDX + GT.gridAlpha;
  }
  if (locked)
  {
    boxColor = GT.settings.legendColors.QTH + GT.gridAlpha;
    borderColor = "#000000FF";
    borderOpacity = 1;
  }
  if (wspr != null)
  {
    if (wspr in GT.pskColors)
    {
      boxColor = "#" + GT.pskColors[wspr] + GT.gridAlpha
    }
    else
    {
      boxColor = "#" + GT.pskColors.OOB + GT.gridAlpha;
    }
  }
  let zIndex = 2;
  if (GT.pushPinMode == false || GT.settings.app.sixWideMode == 0) iQTH = iQTH.substr(0, 4);
  else iQTH = iQTH.substr(0, 6);
  let rect = null;
  if (iQTH == "")
  {
    for (let key in GT.liveGrids)
    {
      if (hash in GT.liveGrids[key].rectangle.liveHash)
      {
        rect = GT.liveGrids[key];
        break;
      }
    }
  }
  else
  {
    if (iQTH in GT.liveGrids)
    {
      rect = GT.liveGrids[iQTH];
    }
  }
  if (rect == null)
  {
    if (iQTH != "")
    {
      // Valid QTH
      let entityVisibility = true;
      let triangleView = false;
      if (Number(GT.settings.app.gridViewMode) == 3 && iQTH in GT.qsoGrids && GT.pushPinMode == false)
      {
        if (GT.settings.map.splitQSL || GT.qsoGrids[iQTH].rectangle.confirmed == false)
        {
          qsoTriangleGrid(iQTH);
          triangleView = true;
          entityVisibility = true;
        }
        else entityVisibility = false;
      }
      let LL = maidenheadToBounds(iQTH);
      if (LL.size == 6)
      {
        borderColor = "#000000FF";
        // borderWeight = 1.0;
        zIndex = 50;
      }

      let newRect = new MapGridRect(iQTH, GT.timeNow);

      let bounds = [
        [LL.lo1, LL.la1],
        [LL.lo2, LL.la2]
      ];
      if (triangleView == true) newRect.rectangle = triangle(bounds, false);
      else newRect.rectangle = rectangle(bounds);

      newRect.isTriangle = triangleView;
      newRect.rectangle.setId(iQTH);

      const featureHoverStyle = new ol.style.Style({
        fill: new ol.style.Fill({
          color: boxColor
        }),
        stroke: new ol.style.Stroke({
          color: borderColor,
          width: borderWeight,
          lineJoin: "round"
        }),
        zIndex: zIndex
      });
      newRect.rectangle.setStyle(featureHoverStyle);

      newRect.rectangle.qth = iQTH;

      if (GT.pushPinMode == false && entityVisibility)
      {
        GT.layerSources.live.addFeature(newRect.rectangle);
      }

      let lat = (LL.la1 + LL.la2) / 2;
      let lon = (LL.lo1 + LL.lo2) / 2;

      newRect.rectangle.pin = iconFeature(
        ol.proj.fromLonLat([lon, lat]),
        GT.colorLeafletPins[band],
        zIndex,
        "pin"
      );
      newRect.rectangle.pin.qth = iQTH;
      newRect.rectangle.pin.liveHash = {};
      newRect.rectangle.pin.liveHash[hash] = 1;
      newRect.rectangle.pin.size = LL.size;

      if (GT.pushPinMode && entityVisibility == true) { GT.layerSources.livePins.addFeature(newRect.rectangle.pin); }

      newRect.rectangle.locked = locked;
      newRect.rectangle.size = LL.size;
      newRect.rectangle.liveHash = {};
      newRect.rectangle.liveHash[hash] = 1;
      newRect.rectangle.qso = false;

      newRect.rectangle.pin.qso = false;
      GT.liveGrids[iQTH] = newRect;
    }
  }
  else
  {
    if (!(hash in rect.rectangle.liveHash))
    {
      rect.rectangle.liveHash[hash] = 1;
      rect.rectangle.pin.liveHash[hash] = 1;
    }
    rect.rectangle.locked = rect.rectangle.locked | locked;
    if (rect.rectangle.locked)
    {
      boxColor = GT.settings.legendColors.QTH + GT.gridAlpha;
      borderColor = "#000000FF";
      borderOpacity = 1;
    }
    if (myDEbox) borderWeight = 1;
    if (rect.rectangle.size == 6)
    {
      borderColor = "#000000FF";
      // borderWeight = 1.0;
      zIndex = 50;
    }

    if (fromLive)
    {
      // Reset the age of the old grid if this is a live update
      rect.age = GT.timeNow;
    }

    const featureHoverStyle = new ol.style.Style({
      fill: new ol.style.Fill({
        color: boxColor
      }),
      stroke: new ol.style.Stroke({
        color: borderColor,
        width: borderWeight,
        lineJoin: "round"
      }),
      zIndex: zIndex
    });
    rect.rectangle.setStyle(featureHoverStyle);
  }
}

function intAlphaToRGB(rgb, alphaInt)
{
  return rgb + alphaInt.toString(16).padStart(2, '0');
}

// Pre-calculate 00 to FF once at startup to prevent memory allocation in the render loop
const K_HEX_ALPHAS = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

function alphaTo(rgba, alphaFloat)
{
  // Bitwise ~~ is drastically faster than parseInt()
  const alphaInt = ~~(alphaFloat * 255); 
  return rgba.slice(0, -2) + K_HEX_ALPHAS[alphaInt];
}

function dimFunction(qthObj)
{
  if (qthObj.rectangle.locked == false)
  {
    let featureStyle = qthObj.rectangle.getStyle();
    let featureFill = featureStyle.getFill();
    let fillColor = featureFill.getColor();
    let featureStroke = featureStyle.getStroke();
    let strokeColor = featureStroke.getColor();
    let percent = 1.0 - (GT.timeNow - qthObj.age) / gridDecay.value;
    let alpha = Math.max(0.06, (GT.settings.map.gridAlpha / 255) * percent);

    fillColor = alphaTo(fillColor, alpha);
    featureFill.setColor(fillColor);
    featureStyle.setFill(featureFill);

    strokeColor = alphaTo(strokeColor, alpha);
    featureStroke.setColor(strokeColor);
    featureStyle.setStroke(featureStroke);

    qthObj.rectangle.setStyle(featureStyle);
  }
}

function changeTrafficDecode()
{
  GT.settings.map.trafficDecode = trafficDecode.checked;
  trafficDecodeView();
}

function setWantedByBandModeRowView()
{
  includeExceptionsRow.style.display = includeCustomAlertsRow.style.display = GT.settings.app.wantedByBandMode ? "" : "none"
}

function changeWantedByBandMode()
{
  GT.settings.app.wantedByBandMode = wantedByBandMode.checked;
  setWantedByBandModeRowView();
  updateByBandMode();
}

function changeIncludeExceptions()
{
  GT.settings.app.includeExceptions = includeExceptions.checked;
  updateByBandMode();
}

function changeIncludeCustomAlerts()
{
  GT.settings.app.includeCustomAlerts = includeCustomAlerts.checked;
  updateByBandMode();
}


function changeWarnOnSoundcardsChanged()
{
  GT.settings.app.warnOnSoundcardsChange = warnOnSoundcardsChanged.checked;
}

function trafficDecodeView()
{
  if (GT.settings.map.trafficDecode == false)
  {
    trafficDiv.innerHTML = "";
    GT.lastTraffic = [];
  }
}

function changeFitQRZvalue()
{
  GT.settings.map.fitQRZ = fitQRZvalue.checked;
  
}

function changeQrzDxccFallbackValue()
{
  GT.settings.map.qrzDxccFallback = qrzDxccFallbackValue.checked;
  
}

function changeCqHiliteValue(check)
{
  GT.settings.map.CQhilite = check.checked;
  
  if (check.checked == false) removePaths();
}

function changeFocusRigValue(check)
{
  GT.settings.map.focusRig = check.checked;
  
}

function changeHaltOntTxValue(check)
{
  GT.settings.map.haltAllOnTx = check.checked;
  
}

function changeSplitQSL()
{
  GT.settings.map.splitQSL = splitQSLValue.checked;
  redrawGrids();
}

function setAnimateView()
{
  animateSpeedValue.style.display = animateValue.checked ? "" : "none";
}

function toggleAnimate()
{
  animateValue.checked = !animateValue.checked;
  setAnimateView()
  changeAnimate();
}

function toggleAllGrids()
{
  GT.settings.map.showAllGrids = !GT.settings.map.showAllGrids;
  gridOverlayImg.style.filter = GT.settings.map.showAllGrids ? "" : "grayscale(1)";
  drawAllGrids();
}

// --- 4. THE UPDATED ANIMATION TOGGLE ---
function changeAnimate() {
  GT.settings.map.animate = animateValue.checked;
  
  let dash = [];
  let dashOff = 0;
  if (GT.settings.map.animate == true) {
    dash = GT.flightPathLineDash;
    dashOff = GT.flightPathTotal - GT.flightPathOffset;
  }

  // Update Shared Styles instantly
  if (GT.sharedStyles) {
    GT.sharedStyles.flight.getStroke().setLineDash(dash);
    GT.sharedStyles.flight.getStroke().setLineDashOffset(dashOff);
    GT.sharedStyles.qrz.getStroke().setLineDash(dash);
    GT.sharedStyles.qrz.getStroke().setLineDashOffset(dashOff);
  
    GT.layerSources.flight.changed();
    GT.layerSources.transmit.changed();
  }

  if (GT.dazzleGrid != null) {
    let fStyle = GT.dazzleGrid.getStyle();
    let fStroke = fStyle.getStroke();
    fStroke.setLineDash(dash);
    fStroke.setLineDashOffset(dashOff);
    GT.dazzleGrid.setStyle(fStyle);
  }

  if (GT.settings.map.animate) {
    setAnimate(true);
  }
  
  if (GT.map) GT.map.render();
}

function changeAnimateSpeedValue()
{
  GT.settings.map.animateSpeed = 21 - animateSpeedValue.value;
  
}

function removeFlightPathsAndDimSquares()
{
  for (let i = GT.flightPaths.length - 1; i >= 0; i--)
  {
    if (GT.flightPaths[i].age < GT.timeNow)
    {
      if ("Arrow" in GT.flightPaths[i]) { GT.layerSources.flight.removeFeature(GT.flightPaths[i].Arrow); }
      GT.layerSources.flight.removeFeature(GT.flightPaths[i]);
      GT.flightPaths.splice(i, 1);
    }
  }

  if (GT.timeNow >= GT.nextDimTime)
  {
    dimGridsquare();
    GT.nextDimTime = GT.timeNow + 8;
  }
}

// --- 3. THE UPDATED RAF ANIMATION LOOP (No Loop Required!) ---
GT.isAnimating = false;

function setAnimate(enabled) {
  if (enabled && !GT.isAnimating) {
    GT.isAnimating = true;
    requestAnimationFrame(animatePaths);
  } else if (!enabled) {
    GT.isAnimating = false;
  }
}

function animatePaths() {
  if (!GT.settings.map.animate || !GT.isAnimating) {
    GT.isAnimating = false;
    return;
  } 

  const pathsLen = GT.flightPaths.length;
  const txPath = GT.transmitFlightPath;
  const dazzle = GT.dazzleGrid;

  if (pathsLen === 0 && !txPath && !dazzle) {
    GT.isAnimating = false;
    return;
  }

  requestAnimationFrame(animatePaths);

  if (GT.settings.map.animateSpeed > 1)
  {
    GT.animateFrame++;
    GT.animateFrame %= GT.settings.map.animateSpeed;
    if (GT.animateFrame > 0) return; 
  }

  GT.flightPathOffset++;
  GT.flightPathOffset %= GT.flightPathTotal;
  const targetOffset = GT.flightPathTotal - GT.flightPathOffset;

  let requestRedraw = false;

  // 1. Instantly Animate ALL flight paths via shared style modification
  if (GT.sharedStyles) {
      GT.sharedStyles.flight.getStroke().setLineDashOffset(targetOffset);
      GT.sharedStyles.qrz.getStroke().setLineDashOffset(targetOffset);
      GT.layerSources.flight.changed(); 
      GT.layerSources.transmit.changed();
      requestRedraw = true;
  }

  // 2. Animate Dazzle Grid
  if (dazzle) {
    dazzle.getStyle().getStroke().setLineDashOffset(targetOffset);
    dazzle.changed(); 
    requestRedraw = true;
  }

  if (requestRedraw && GT.map) {
    GT.map.render(); 
  }
}


function removePaths()
{
  GT.layerSources.flight.clear();
  GT.flightPaths = Array();
}

function fadePaths()
{
  if (pathWidthValue.value == 0)
  {
    removePaths();
  }
}

function dimGridsquare()
{
  if (gridDecay.value == 0) return;
  
  const liveGridKeys = Object.keys(GT.liveGrids);
  for (let idx = 0; idx < liveGridKeys.length; idx++)
  {
    const i = liveGridKeys[idx];
    const liveGrid = GT.liveGrids[i];
    
    dimFunction(liveGrid);

    if (GT.timeNow - liveGrid.age >= gridDecay.value && liveGrid.rectangle.locked == false)
    {
      // Walk the rectangles DEcall's and remove them from GT.liveCallsigns
      const liveHashKeys = Object.keys(liveGrid.rectangle.liveHash);
      for (let hIdx = 0; hIdx < liveHashKeys.length; hIdx++)
      {
        const CallIsKey = liveHashKeys[hIdx];
        if (CallIsKey in GT.liveCallsigns)
        {
          delete GT.liveCallsigns[CallIsKey];
        }
      }
      
      if (liveGrid.rectangle.pin != null)
      {
        if (GT.layerSources.livePins.hasFeature(liveGrid.rectangle.pin))
        {
          GT.layerSources.livePins.removeFeature(liveGrid.rectangle.pin);
        }
      }
      
      if (GT.layerSources.live.hasFeature(liveGrid.rectangle))
      {
        GT.layerSources.live.removeFeature(liveGrid.rectangle);

        if (GT.settings.app.gridViewMode == 3 && i in GT.qsoGrids)
        {
          if (GT.qsoGrids[i].isTriangle)
          {
            triangleToGrid(i, GT.qsoGrids[i].rectangle);
            GT.qsoGrids[i].isTriangle = false;
          }
        }
      }

      GT.liveGrids[i] = null;
      delete GT.liveGrids[i];
    }
  }
}

function hasAnyKeys(obj) {
    for (const _ in obj) {
        return true; // Instantly bails out on the very first key it finds!
    }
    return false; // Loop finished without finding anything
}

function updateCountStats()
{
  callsignCount.innerHTML = GT.sessionCallsigns.size;
  countryCount.innerHTML = GT.sessionDXCCs.size;

  qsoCount.innerHTML = GT.QSOcount;
  qslCount.innerHTML = GT.QSLcount;

  if (GT.rowsFiltered > 0)
  {
    rowsFilteredTr.style.display = "";
  }
  else
  {
    rowsFilteredTr.style.display = "none";
  }

  if (hasAnyKeys(GT.QSOhash))
  {
    clearOrLoadButton.innerHTML = I18N("quickLoad.clearLog.label");
    GT.loadQSOs = false;
  }
  else
  {
    clearOrLoadButton.innerHTML = I18N("quickLoad.loadLog.label");
    GT.loadQSOs = true;
  }
}

function clearGrids()
{
  GT.layerSources.live.clear();
  GT.layerSources.livePins.clear();
  GT.liveGrids = {};
}

function resetWorkingCollection(collection)
{
  for (const key in collection)
  {
    const obj = collection[key];
    obj.worked = false;
    obj.confirmed = false;
    obj.worked_bands = {};
    obj.confirmed_bands = {};
    obj.worked_modes = {};
    obj.confirmed_modes = {};
  }
}

function clearQsoGrids()
{
  const layerSources = GT.layerSources;

  layerSources.qso.clear();
  layerSources.qsoPins.clear();

  GT.qsoGrids = {};

  resetWorkingCollection(GT.dxccInfo);
  resetWorkingCollection(GT.cqZones);
  resetWorkingCollection(GT.ituZones);
  resetWorkingCollection(GT.wasZones);
  resetWorkingCollection(GT.wacpZones);
  resetWorkingCollection(GT.wacZones);
  resetWorkingCollection(GT.countyData);
  resetWorkingCollection(GT.us48Data);
}


function clearCalls()
{
  removePaths();
  GT.liveCallsigns = {};
  GT.sessionCallsigns.clear();
  GT.sessionDXCCs.clear();
}

function clearLive()
{
  GT.Decodes = 0;

  GT.lastMessages = Array();
  GT.lastTraffic = Array();
  GT.callRoster = {};



  removePaths();
  clearGrids();
  clearCalls();
  clearTempGrids();
  setHomeGridsquare();
  redrawGrids();

  updateRosterWorked();
  goProcessRoster();
}

function clearOrLoadQSOs()
{
  if (GT.loadQSOs == true)
  {
    startupAdifLoadCheck();
  }
  else
  {
    clearQSOs();
  }
}

function clearAndLoadQSOs()
{
  clearQSOs(true, "startupAdifLoadCheck");
}

function clearQSOs(clearFiles = true, nextFunc = null)
{
  // in adif.js
  clearAdifWorkerQSO(clearFiles, nextFunc);
}

// callback from adifWorker
function clearQSOcallback(clearFiles, nextFunc)
{
  initQSOdata();
  GT.QSOhash = {};
  GT.myQsoCalls = {};
  GT.myQsoGrids = {};
  GT.QSLcount = 0;
  GT.QSOcount = 0;
  GT.rowsFiltered = 0;
  setTrophyOverlay(GT.currentOverlay);

  updateRosterWorked();
  goProcessRoster();
  redrawGrids(false);

  if (clearFiles == true)
  {
    clearLogFilesAndCounts();
  }
  if (nextFunc != null && typeof window[nextFunc] == "function")
  {
    // this should be startupAdifLoadCheck, but it's open ended :)
    window[nextFunc]();
  }
}

function clearLogFilesAndCounts()
{
  tryToDeleteAppFile("LogbookOfTheWorld.adif");
  tryToDeleteAppFile("LoTW_QSL.adif");
  tryToDeleteAppFile("qrz.adif");
  tryToDeleteAppFile("clublog.adif");

  GT.settings.adifLog.lastFetch.lotw_qsl = 0;
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

function createGlobalHeatmapLayer(name, blur, radius, gradient = ['#00f', '#0ff', '#0f0', '#ff0', '#f00'])
{
  GT.layerSources[name] = new ol.source.Vector({});
  GT.layerVectors[name] = new ol.layer.Heatmap({
    source: GT.layerSources[name],
    blur: blur,
    radius: radius,
    gradient: gradient,
    zIndex: Object.keys(GT.layerVectors).length + 1
  });
  GT.layerVectors[name].set("name", name);
}

function createGlobalMapLayer(name, maxResolution, minResolution)
{
  GT.layerSources[name] = new ol.source.Vector({});
  if (typeof maxResolution == "undefined" && typeof minResolution == "undefined")
  {
    GT.layerVectors[name] = new ol.layer.Vector({
      source: GT.layerSources[name],
      zIndex: Object.keys(GT.layerVectors).length + 2
    });
  }
  else if (typeof minResolution == "undefined")
  {
    GT.layerVectors[name] = new ol.layer.Vector({
      source: GT.layerSources[name],
      maxResolution: maxResolution,
      zIndex: Object.keys(GT.layerVectors).length + 2
    });
  }
  else
  {
    GT.layerVectors[name] = new ol.layer.Vector({
      source: GT.layerSources[name],
      maxResolution: maxResolution,
      minResolution: minResolution,
      zIndex: Object.keys(GT.layerVectors).length + 2
    });
  }
  GT.layerVectors[name].set("name", name);
}

function createGeoJsonLayer(name, url, color, stroke)
{
  let style = new ol.style.Style({
    stroke: new ol.style.Stroke({
      color: color,
      width: stroke
    }),
    fill: new ol.style.Fill({
      color: "#00000000"
    })
  });

  let layerSource = new ol.source.Vector({
    url: url,
    format: new ol.format.GeoJSON({ geometryName: name }),
    overlaps: true
  });

  let layerVector = new ol.layer.Vector({
    source: layerSource,
    style: style,
    visible: true,
    zIndex: 1
  });
  layerVector.set("name", name);
  return layerVector;
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

function mapApiKeyInputChanged()
{
  let map = GT.maps[GT.settings.map.mapIndex];
  if ("keyId" in map)
  {
    let showUpdateButton = false;
    if (GT.settings.map.apiKeys[map.keyId] != mapApiKeyInput.value)
    {
      showUpdateButton = true;
    }
    GT.settings.map.apiKeys[map.keyId] = mapApiKeyInput.value;
    if (mapApiKeyInput.value == "")
    {
      showUpdateButton = false;
    }
    ValidateText(mapApiKeyInput);
    mapApiKeyApplyDiv.style.display = showUpdateButton ? "" : "none";
  }
}

function nightMapApiKeyInputChanged()
{
  let map = GT.maps[GT.settings.map.nightMapIndex];
  if ("keyId" in map)
  {
    let showUpdateButton = false;
    if (GT.settings.map.apiKeys[map.keyId] != nightMapApiKeyInput.value)
    {
      showUpdateButton = true;
    }
    GT.settings.map.apiKeys[map.keyId] = nightMapApiKeyInput.value;
    if (nightMapApiKeyInput.value == "")
    {
      showUpdateButton = false;
    }
    ValidateText(nightMapApiKeyInput);
    nightMapApiKeyApplyDiv.style.display = showUpdateButton ? "" : "none";
  }
}

function ProcessGroupMapSource(map)
{
  // Double check
  if (map in GT.maps)
  {
    let apiKey = "";
    if ("keyId" in GT.maps[map])
    {
      if (!(GT.maps[map].keyId in GT.settings.map.apiKeys))
      {
        GT.settings.map.apiKeys[GT.maps[map].keyId] = apiKey;
      }
      else
      {
        apiKey = GT.settings.map.apiKeys[GT.maps[map].keyId];
      }
    }
    let layers = [];
    for (let x in GT.maps[map].group)
    {
      // Only "_url"'s are processed for {r7} and {k}
      // It sets "url" otherwise, "url" must be present in the group entry!
      if ("_url" in GT.maps[map].group[x])
      {
        // Apply apiKey if needed
        let url = GT.maps[map].group[x]._url.replace("{k}", apiKey);
        // Apply random number from 0-7 if needed
        GT.maps[map].group[x].url = url.replace("{r7}", Math.floor(Math.random() * 8));
      }
      else if (!("url" in GT.maps[map].group[x]))
      {
        alert("Map: " + map + "\n" + "Missing 'url' or '_url' in group (" + x + ") " + "\nPlease fix!");
      }

      let source = new GT.mapSourceTypes[GT.maps[map].group[x].sourceType](GT.maps[map].group[x]);
      layers[x] = new ol.layer.Tile({ source: source });
    }
    GT.mapsLayer[map] = layers;
  }
}

function initAEQDprojection()
{
  if (ol.proj.proj4.isRegistered())
  {
    ol.proj.proj4.unregister();
    ol.proj.deleteProjection("AEQD");
    proj4.defs("AEQD", '+');
  }
 
  proj4.defs("AEQD", '+proj=aeqd +lat_0=' + GT.myLat + ' +lon_0=' + GT.myLon + ' +x_0=0 +y_0=0 +a=6371000 +b=6371000 +units=m');
  ol.proj.proj4.register(proj4);
}

function tryRecenterAEQD()
{
  // Only if we're AEQD
  if (GT.settings.map.projection == "AEQD")
  {
    // we fake a change
    GT.settings.map.projection = "EPSG:3857";
    changeMapProjection(false);
    centerOn(GT.settings.app.myGrid, false);
  }
  else
  {
    drawRangeRings();
  }
}

function changeMapProjection(honorMemory = true) {
  if (honorMemory) {
    // save the current map view
    mapMemory(6, true, true);
  }

  // remove flights
  removePaths();

  if (GT.settings.map.projection == "AEQD") {
    GT.settings.map.projection = "EPSG:3857";
    projectionImg.style.filter = "grayscale(1)";
  } else {
    GT.settings.map.projection = "AEQD";
    projectionImg.style.filter = "";
  }

  if (GT.map != null) {
    const map = GT.map;

    // 1. DEEP CLEAN LAYERS & SOURCES (Recursive)
    // This ensures child layers inside LayerGroups are also destroyed.
    const disposeLayerTree = (layer) => {
      // If it's a Group, recursively dispose its children first
      if (typeof layer.getLayers === 'function') {
        layer.getLayers().getArray().forEach(disposeLayerTree);
      }
      // Dispose the source (frees geometries/features from memory)
      if (typeof layer.getSource === 'function') {
        const source = layer.getSource();
        if (source && typeof source.dispose === 'function') {
          source.dispose();
        }
      }
      // Dispose the layer itself
      if (typeof layer.dispose === 'function') {
        layer.dispose();
      }
    };
    
    map.getLayers().getArray().forEach(disposeLayerTree);
    map.getLayers().clear();

    // 2. CLEANUP OVERLAYS (Fixes Detached DOM Node leaks)
    map.getOverlays().getArray().forEach(overlay => {
      const element = overlay.getElement();
      if (element && element.parentNode) {
        element.parentNode.removeChild(element);
      }
    });
    map.getOverlays().clear();

    // 3. CLEANUP CONTROLS AND INTERACTIONS (Frees event listeners)
    map.getControls().getArray().forEach(c => typeof c.dispose === 'function' && c.dispose());
    map.getInteractions().getArray().forEach(i => typeof i.dispose === 'function' && i.dispose());

    // 4. CLEANUP WEBGL CONTEXT (Your original excellent code)
    const olCanvas = map.getViewport().querySelector("canvas");
    if (olCanvas) {
      const gl = olCanvas.getContext("webgl") || olCanvas.getContext("webgl2");
      if (gl) {
        const loseContext = gl.getExtension("WEBGL_lose_context");
        if (loseContext) {
          loseContext.loseContext();
        }
      }
    }

    // 5. COMPLETELY NUKE THE MAP
    map.setTarget(null); // Detach from DOM container
    if (typeof map.dispose === 'function') {
      map.dispose(); // Unbinds all window/document listeners!
    }
    
    GT.map = null;
  }

  // REBUILD
  renderMap();

  if (honorMemory) {
    // load the current map view
    mapMemory(6, false);
  }

  // RE-ADD DATA
  drawAllGrids();
  drawRangeRings();
  displayPredLayer();
  
  // Clear old references to specific layers so they are garbage collected
  GT.timezoneLayer = null;
  displayTimezones();
  
  GT.usRadar = null;
  displayRadar();
  
  redrawGrids();
  redrawSpots();
  redrawParks();
  redrawPins();
  setTrophyOverlay(GT.currentOverlay);
}


class RotateNorthControl extends ol.control.Control {
  /**
   * @param {Object} [opt_options] Control options.
   */
  constructor(opt_options) {
    const options = opt_options || {};

    const button = document.createElement('button');
    button.innerHTML = "<img src='img/north.png' style='width:1em'></img>";
    button.title = "Reset Heading";

    const element = document.createElement('div');
    element.className = 'rotate-north ol-unselectable ol-control';
    element.appendChild(button);

    super({
      element: element,
      target: options.target,
    });

    button.addEventListener('click', this.handleRotateNorth.bind(this), false);
  }

  handleRotateNorth() {
    this.getMap().getView().setRotation(0);
  }
}

function initMap()
{
  initHoverFunctors();

  const mapsData = requireJson("data/maps.json");
  if (!mapsData)
  {
    alert("Internal Map Data file Corrupt, GridTracker2 will now crash");
    return;
  }

  const sortedKeys = Object.keys(mapsData).sort();
  GT.maps = Object.fromEntries(sortedKeys.map(key => [key, mapsData[key]]));

  GT.mapsLayer = {};
  GT.offlineMapsLayer = {};

  const offlineKeys = sortedKeys.filter(key => GT.maps[key].offline === true);

  function normalizeMapSetting(settingName, defaultValue, validKeys)
  {
    const fallback =
      validKeys.includes(defaultValue) ? defaultValue : validKeys[0];

    if (!validKeys.includes(GT.settings.map[settingName]))
    {
      GT.settings.map[settingName] = fallback;
    }
  }

  function appendOptions(select, keys)
  {
    select.length = 0;

    const fragment = document.createDocumentFragment();
    for (const key of keys)
    {
      const option = document.createElement("option");
      option.value = key;
      option.text = key;
      fragment.appendChild(option);
    }

    select.appendChild(fragment);
  }

  function getAttributionText(attributions)
  {
    if (String(attributions).includes("GridTracker.org"))
    {
      return attributions;
    }

    const gtCredit = "<a href='https://gridtracker.org' target='_blank'>GridTracker.org</a>";

    return "&copy; " + attributions + " " + gtCredit;
  }

  function buildTileLayer()
  {
    if (GT.settings.map.offlineMode)
    {
      return new ol.layer.Tile({
        source: GT.offlineMapsLayer[offlineMapSelect.value]
      });
    }

    const selectedMap = GT.maps[mapSelect.value];
    if (selectedMap.sourceType === "Group")
    {
      return new ol.layer.Group({
        layers: GT.mapsLayer[mapSelect.value]
      });
    }

    return new ol.layer.Tile({
      source: GT.mapsLayer[mapSelect.value]
    });
  }

  normalizeMapSetting("mapIndex", def_maps.mapIndex, sortedKeys);
  normalizeMapSetting("nightMapIndex", def_maps.nightMapIndex, sortedKeys);
  normalizeMapSetting("offlineMapIndex", def_maps.offlineMapIndex, offlineKeys);
  normalizeMapSetting("offlineNightMapIndex", def_maps.offlineNightMapIndex, offlineKeys);

  for (const key of sortedKeys)
  {
    const mapConfig = GT.maps[key];
    mapConfig.attributions = getAttributionText(mapConfig.attributions);

    if (mapConfig.sourceType === "Group")
    {
      ProcessGroupMapSource(key);
    }
    else
    {
      GT.mapsLayer[key] = new GT.mapSourceTypes[mapConfig.sourceType](mapConfig);
    }

    if (mapConfig.offline === true)
    {
      GT.offlineMapsLayer[key] = new ol.source.XYZ(mapConfig);
    }
  }

  appendOptions(mapSelect, sortedKeys);
  appendOptions(mapNightSelect, sortedKeys);
  appendOptions(offlineMapSelect, offlineKeys);
  appendOptions(offlineMapNightSelect, offlineKeys);

  mapSelect.value = GT.settings.map.mapIndex;
  mapNightSelect.value = GT.settings.map.nightMapIndex;
  offlineMapSelect.value = GT.settings.map.offlineMapIndex;
  offlineMapNightSelect.value = GT.settings.map.offlineNightMapIndex;

  GT.tileLayer = buildTileLayer();

  if (!GT.mapEventsBound)
  {
    mapDiv.addEventListener("pointermove", mapMoveEvent);
    mapDiv.addEventListener("mouseleave", mapLoseFocus, false);
    mapDiv.addEventListener("contextmenu", function (event)
    {
      event.preventDefault();
    });

    GT.mapEventsBound = true;
  }

  renderMap();
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

function renderMap()
{
  if (isNaN(GT.myLat) || Math.abs(GT.myLat) >= 90)
  {
    GT.myLat = 0.0;
    GT.settings.map.latitude = 0.0;
  }

  if (isNaN(GT.myLon) || Math.abs(GT.myLon) >= 180)
  {
    GT.myLon = 0.0;
    GT.settings.map.longitude = 0.0;
  }

  if (k_valid_projections.indexOf(GT.settings.map.projection) == -1)
  {
    GT.settings.map.projection = k_valid_projections[0];
  }

  initAEQDprojection();

  document.getElementById("mapDiv").innerHTML = "";

  GT.scaleLine = new ol.control.ScaleLine({
    units: GT.scaleUnits[GT.settings.app.distanceUnit]
  });

  GT.mapControl = [
    GT.scaleLine,
    new ol.control.Rotate(),
    new ol.control.Zoom(),
    new ol.control.FullScreen({ source: "mainBody" }),
    new ol.control.Attribution({ collapsible: false, collapsed: false }),
    new RotateNorthControl()
  ];

  createGlobalMapLayer("rangeRings");
  createGlobalMapLayer("award");
  createGlobalHeatmapLayer("baHeat", 20, 18, ['#f00', '#ff0' ,'#0f0',  '#0ff',  '#00f']);
  createGlobalHeatmapLayer("pskHeat", 20, 15);
  createGlobalMapLayer("qso");
  createGlobalMapLayer("qsoPins");
  createGlobalMapLayer("live");
  createGlobalMapLayer("livePins");
  createGlobalMapLayer("lineGrids");
  createGlobalMapLayer("longGrids", 4500);
  createGlobalMapLayer("bigGrids", 50000, 4501);
  createGlobalMapLayer("baFlight");
  createGlobalMapLayer("pskFlights");
  createGlobalMapLayer("pskSpots");
  createGlobalMapLayer("pskHop");
  createGlobalMapLayer("pota");
  createGlobalMapLayer("flight");
  createGlobalMapLayer("transmit");
  createGlobalMapLayer("gtflags");
  createGlobalMapLayer("temp");

  if (GT.settings.map.projection != "EPSG:3857")
  {
    GT.useTransform = true;
  }
  else
  {
    GT.useTransform = false;
  }

  GT.mapView = new ol.View({
    center: ol.proj.transform([GT.myLon, GT.myLat], "EPSG:4326", GT.settings.map.projection),
    zoom: GT.settings.map.zoom * 0.333,
    projection: GT.settings.map.projection,
    showFullExtent: true
  });

  GT.shadowVector = new ol.layer.Vector({ zIndex: 0 });

  GT.map = new ol.Map({
    target: "mapDiv",
    layers: [
      GT.tileLayer,
      GT.shadowVector,
      GT.layerVectors.rangeRings,
      GT.layerVectors.award,
      GT.layerVectors.baHeat,
      GT.layerVectors.pskHeat,
      GT.layerVectors.qso,
      GT.layerVectors.qsoPins,
      GT.layerVectors.live,
      GT.layerVectors.livePins,
      GT.layerVectors.lineGrids,
      GT.layerVectors.longGrids,
      GT.layerVectors.bigGrids,
      GT.layerVectors.baFlight,
      GT.layerVectors.pskFlights,
      GT.layerVectors.pskSpots,
      GT.layerVectors.pskHop,
      GT.layerVectors.pota,
      GT.layerVectors.flight,
      GT.layerVectors.transmit,
      GT.layerVectors.gtflags,
      GT.layerVectors.temp
    ],
    interactions: ol.interaction.defaults.defaults({
      dragPan: false,
      mouseWheelZoom: false
    }).extend([
      new ol.interaction.DragPan({ kinetic: false }),
      new ol.interaction.MouseWheelZoom({ duration: 0 }),
      new ol.interaction.DragRotateAndZoom({ duration: 0 })
    ]),
    controls: GT.mapControl,
    view: GT.mapView
  });

  GT.map.on("pointerdown", mouseDownEvent);
  GT.map.on("pointerup", mouseUpEvent);
  GT.map.on('moveend', mapMoveEndEvent);

  document.getElementById("menuDiv").style.display = "block";

  dayNight.init();
  if (GT.settings.app.graylineImgSrc == 1)
  {
    dayNight.hide();
  }
  else
  {
    GT.nightTime = dayNight.show();
  }

  moonLayer.init(GT.map);
  if (GT.settings.app.moonTrack == 1)
  {
    moonLayer.show();
  }
  else
  {
    moonLayer.hide();
  }

  GT.tileLayer.setOpacity(Number(GT.settings.map.mapOpacity));

  nightMapEnable.checked = GT.settings.map.nightMapEnable;
  changeNightMapEnable(nightMapEnable);
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

function mapMoveEndEvent(event)
{
  if (GT.settings.map.predMode === 5)
  {
    stopTropoTimer();

    GT.tropoData.refresh = 128;
    GT.tropoData.alert_id = 0;
    GT.tropoData.timeout = nodeTimers.setTimeout(fetchTropoLayer, 1000);
  }
}

function changeEquatorEnable()
{
  GT.settings.map.equator = !GT.settings.map.equator;
  equatorImg.style.filter = GT.settings.map.equator ? "" : "grayscale(1)";
  drawRangeRings();
}

function changeRangeRingsEnable()
{
  GT.settings.map.showRangeRings = !GT.settings.map.showRangeRings;
  rangeRingsImg.style.filter = GT.settings.map.showRangeRings ? "" : "grayscale(1)";
  drawRangeRings();
}

function changeNightMapEnable(check)
{
  if (check.checked)
  {
    GT.settings.map.nightMapEnable = true;
    GT.nightTime = dayNight.refresh();
  }
  else
  {
    GT.settings.map.nightMapEnable = false;
  }

  nightMapSpan.style.display = GT.settings.map.nightMapEnable ? "" : "none";
  changeMapLayer();
  styleAllFlightPaths();
  redrawSpots();
}

function createRadar()
{
  let layerSource = new ol.source.TileWMS({
    projection: "EPSG:3857",
    url: "https://mapservices.weather.noaa.gov:443/eventdriven/services/radar/radar_base_reflectivity/MapServer/WMSServer",
    attributions: `<a href="https://radar.weather.gov/" target="_blank">NWS</a>`,
    params: { LAYERS: "0" }
  });

  let layerVector = new ol.layer.Tile({
    source: layerSource,
    visible: true,
    opacity: 0.6,
    zIndex: 900
  });

  layerVector.set("name", "radar");

  return layerVector;
}

function toggleRadar()
{
  GT.settings.map.usRadar = !GT.settings.map.usRadar;
  displayRadar();
  
}

function displayRadar()
{
  if (GT.settings.map.usRadar && GT.settings.map.offlineMode == false)
  {
    if (GT.usRadar == null)
    {
      GT.usRadar = createRadar();
      GT.map.addLayer(GT.usRadar);
    }

    if (GT.usRadarInterval == null) { GT.usRadarInterval = nodeTimers.setInterval(radarRefresh, 600000); }
  }
  else
  {
    if (GT.usRadarInterval != null)
    {
      nodeTimers.clearInterval(GT.usRadarInterval);
      GT.usRadarInterval = null;
    }
    if (GT.usRadar)
    {
      GT.map.removeLayer(GT.usRadar);
      GT.usRadar = null;
    }
  }

  radarImg.style.filter = GT.settings.map.usRadar ? "" : "grayscale(1)";
}

function radarRefresh()
{
  if (GT.usRadar != null && GT.settings.map.offlineMode == false)
  {
    GT.usRadar.getSource().updateParams({ ol3_salt: Math.random() });
    GT.usRadar.getSource().refresh();
  }
}

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


function mapLoseFocus()
{
  if (GT.lastHover.feature)
  {
    GT.lastHover.functor.out(GT.lastHover.feature);
    GT.lastHover.feature = null;
  }
}

function lineString(points, count)
{
  let thing;
  if (GT.useTransform)
  {
    let line = lineGeometry(points, count);
    thing = new ol.geom.LineString(line);
  }
  else
  {
    let fromPoint = ol.proj.fromLonLat(points[0]);
    let toPoint = ol.proj.fromLonLat(points[1]);
    let pointsA = [ fromPoint, toPoint ];
    thing = new ol.geom.LineString(pointsA);
  }

  let rect = new ol.Feature({
    geometry: thing,
    prop: "lineString"
  });
  if (GT.useTransform)
  {
    rect.getGeometry().transform("EPSG:3857", GT.settings.map.projection);
  }
  return rect;
}

function rectangle(bounds, property = "grid")
{
  let thing = new ol.geom.Polygon([
    [
      ol.proj.fromLonLat([bounds[0][0], bounds[0][1]]),
      ol.proj.fromLonLat([bounds[0][0], bounds[1][1]]),
      ol.proj.fromLonLat([bounds[1][0], bounds[1][1]]),
      ol.proj.fromLonLat([bounds[1][0], bounds[0][1]])
    ]
  ]);
  let rect = new ol.Feature({
    prop: property,
    geometry: thing
  });
  if (GT.useTransform)
  {
    rect.getGeometry().transform("EPSG:3857", GT.settings.map.projection);
  }
  return rect;
}

function triangle(bounds, topLeft)
{
  let thing = null;

  if (topLeft)
  {
    thing = new ol.geom.Polygon([
      [
        ol.proj.fromLonLat([bounds[0][0], bounds[0][1]]),
        ol.proj.fromLonLat([bounds[0][0], bounds[1][1]]),
        ol.proj.fromLonLat([bounds[1][0], bounds[1][1]]),
        ol.proj.fromLonLat([bounds[0][0], bounds[0][1]])
      ]
    ]);
  }
  else
  {
    thing = new ol.geom.Polygon([
      [
        ol.proj.fromLonLat([bounds[0][0], bounds[0][1]]),
        ol.proj.fromLonLat([bounds[1][0], bounds[1][1]]),
        ol.proj.fromLonLat([bounds[1][0], bounds[0][1]]),
        ol.proj.fromLonLat([bounds[0][0], bounds[0][1]])
      ]
    ]);
  }

  let rect = new ol.Feature({
    prop: "grid",
    geometry: thing
  });
  if (GT.useTransform)
  {
    rect.getGeometry().transform("EPSG:3857", GT.settings.map.projection);
  }
  return rect;
}

function triangleToGrid(iQTH, feature)
{
  let LL = maidenheadToBounds(iQTH);
  let bounds = [
    [LL.lo1, LL.la1],
    [LL.lo2, LL.la2]
  ];

  let thing = new ol.geom.Polygon([
    [
      ol.proj.fromLonLat([bounds[0][0], bounds[0][1]]),
      ol.proj.fromLonLat([bounds[0][0], bounds[1][1]]),
      ol.proj.fromLonLat([bounds[1][0], bounds[1][1]]),
      ol.proj.fromLonLat([bounds[1][0], bounds[0][1]]),
      ol.proj.fromLonLat([bounds[0][0], bounds[0][1]])
    ]
  ]);

  feature.setGeometry(thing);
  if (GT.useTransform)
  {
    feature.getGeometry().transform("EPSG:3857", GT.settings.map.projection);
  }
}

function gridToTriangle(iQTH, feature, topLeft)
{
  let LL = maidenheadToBounds(iQTH);
  let bounds = [
    [LL.lo1, LL.la1],
    [LL.lo2, LL.la2]
  ];
  let thing = null;

  if (topLeft)
  {
    thing = new ol.geom.Polygon([
      [
        ol.proj.fromLonLat([bounds[0][0], bounds[0][1]]),
        ol.proj.fromLonLat([bounds[0][0], bounds[1][1]]),
        ol.proj.fromLonLat([bounds[1][0], bounds[1][1]]),
        ol.proj.fromLonLat([bounds[0][0], bounds[0][1]])
      ]
    ]);
  }
  else
  {
    thing = new ol.geom.Polygon([
      [
        ol.proj.fromLonLat([bounds[0][0], bounds[0][1]]),
        ol.proj.fromLonLat([bounds[1][0], bounds[1][1]]),
        ol.proj.fromLonLat([bounds[1][0], bounds[0][1]]),
        ol.proj.fromLonLat([bounds[0][0], bounds[0][1]])
      ]
    ]);
  }

  feature.setGeometry(thing);
  if (GT.useTransform)
  {
    feature.getGeometry().transform("EPSG:3857", GT.settings.map.projection);
  }
}

function liveHash(call, band, mode)
{
  return call + band + mode;
}

function setHomeGridsquare()
{
  let hash = GT.settings.app.myGrid;
  qthToBox(GT.settings.app.myGrid, GT.settings.app.myCall, false, true, "", GT.settings.app.myBand, null, hash, false);

  let newCallsign;
  let push = false;

  if (!(hash in GT.liveCallsigns))
  {
    // FIX: Use the rigid constructor to preserve V8 hidden classes!
    newCallsign = new LiveCallsign(
      GT.settings.app.myCall, // DECall
      "Self",                 // DXCall
      GT.settings.app.myGrid,
      GT.settings.app.myMode,
      GT.settings.app.myBand,
      GT.settings.app.myGrid, // Msg
      callsignToDxcc(GT.settings.app.myCall),
      timeNowSec()
    );
    push = true;
  }
  else
  {
    newCallsign = GT.liveCallsigns[hash];
  }

  // Force reset data
  newCallsign.DEcall = GT.settings.app.myCall;
  newCallsign.grid = GT.settings.app.myGrid;
  newCallsign.wspr = null;
  newCallsign.msg = GT.settings.app.myGrid;
  newCallsign.RSTsent = "-";
  newCallsign.RSTrecv = "-";
  newCallsign.time = timeNowSec();
  newCallsign.delta = -1;
  newCallsign.DXcall = "Self";
  newCallsign.mode = GT.settings.app.myMode;
  newCallsign.band = GT.settings.app.myBand;
  newCallsign.locked = true;

  GT.myDXCC = newCallsign.dxcc = callsignToDxcc(GT.settings.app.myCall);

  if (push) GT.liveCallsigns[hash] = newCallsign;
}

function haltAllTx(allTx = false)
{
  for (let instance in GT.instances)
  {
    if ((instance != GT.activeInstance || allTx == true) && GT.instances[instance].remote)
    {
      let responseArray = Buffer.alloc(1024);
      let length = 0;

      let port = GT.instances[instance].remote.port;
      let address = GT.instances[instance].remote.address;

      length = encodeQUINT32(responseArray, length, 0xadbccbda);
      length = encodeQUINT32(responseArray, length, 2);
      length = encodeQUINT32(responseArray, length, 8);
      length = encodeQUTF8(responseArray, length, instance);
      length = encodeQBOOL(responseArray, length, 0);

      responseArray = responseArray.slice(0, length);
      wsjtUdpMessage(responseArray, responseArray.length, port, address);
    }
  }
}

function initiateQso(thisCall)
{
  if (thisCall in GT.callRoster && GT.callRoster[thisCall].message.instance in GT.instances)
  {
    if (GT.settings.map.focusRig && GT.activeInstance != GT.callRoster[thisCall].message.instance)
    {
      activeRig(GT.callRoster[thisCall].message.instance);
    }
    if (GT.settings.map.haltAllOnTx)
    {
      haltAllTx();
    }

    let newMessage = GT.callRoster[thisCall].message;
    let responseArray = Buffer.alloc(1024);
    let length = 0;
    let instance = GT.callRoster[thisCall].message.instance;
    let port = GT.instances[instance].remote.port;
    let address = GT.instances[instance].remote.address;
    length = encodeQUINT32(responseArray, length, newMessage.magic_key);
    length = encodeQUINT32(responseArray, length, newMessage.schema_number);
    length = encodeQUINT32(responseArray, length, 4);
    length = encodeQUTF8(responseArray, length, newMessage.Id);
    length = encodeQUINT32(responseArray, length, newMessage.TM);
    length = encodeQINT32(responseArray, length, newMessage.SR);
    length = encodeQDOUBLE(responseArray, length, newMessage.DT);
    length = encodeQUINT32(responseArray, length, newMessage.DF);
    length = encodeQUTF8(responseArray, length, newMessage.MO);
    length = encodeQUTF8(responseArray, length, newMessage.Msg);
    length = encodeQBOOL(responseArray, length, newMessage.LC);
    length = encodeQBOOL(responseArray, length, 0);

    responseArray = responseArray.slice(0, length);
    wsjtUdpMessage(responseArray, responseArray.length, port, address);
  }
}

function spotLookupAndSetCall(spot)
{
  let call = GT.receptionReports.spots[spot].call;
  let grid = GT.receptionReports.spots[spot].grid;
  let band = GT.receptionReports.spots[spot].band;
  let mode = GT.receptionReports.spots[spot].mode;
  for (let instance in GT.instances)
  {
    if (GT.instances[instance].valid && GT.instances[instance].status.Band == band && GT.instances[instance].status.MO == mode)
    {
      setCallAndGrid(call, grid, instance);
      return;
    }
  }
  setCallAndGrid(call, grid, null);
}

function setCallAndGrid(callsign, grid, instance = null, genMessages = true)
{
  let thisInstance = null;
  let port = null;
  let address = null;
  if (instance != null)
  {
    if (instance in GT.instances && GT.instances[instance].remote)
    {
      thisInstance = GT.instances[instance].status;
      port = GT.instances[instance].remote.port;
      address = GT.instances[instance].remote.address;
    }
  }
  else
  {
    if (GT.instances[GT.activeInstance].valid && GT.instances[GT.activeInstance].remote)
    {
      thisInstance = GT.instances[GT.activeInstance].status;
      port = GT.instances[GT.activeInstance].remote.port;
      address = GT.instances[GT.activeInstance].remote.address;
    }
  }

  if (thisInstance && (thisInstance.TxEnabled == 0 || genMessages == false))
  {
    let responseArray = Buffer.alloc(1024);
    let length = 0;
    length = encodeQUINT32(responseArray, length, thisInstance.magic_key);
    length = encodeQUINT32(responseArray, length, thisInstance.schema_number);
    length = encodeQUINT32(responseArray, length, 15);
    length = encodeQUTF8(responseArray, length, thisInstance.Id);
    length = encodeQUTF8(responseArray, length, thisInstance.MO);
    length = encodeQUINT32(responseArray, length, thisInstance.FreqTol);
    length = encodeQUTF8(responseArray, length, thisInstance.Submode);
    length = encodeQBOOL(responseArray, length, thisInstance.Fastmode);
    length = encodeQUINT32(responseArray, length, thisInstance.TRP);
    length = encodeQUINT32(responseArray, length, thisInstance.RxDF);

    if (genMessages == true)
    {
      length = encodeQUTF8(responseArray, length, callsign);

      let hash = liveHash(callsign, thisInstance.Band, thisInstance.MO);
      if (hash in GT.liveCallsigns && GT.liveCallsigns[hash].grid.length > 1) { grid = GT.liveCallsigns[hash].grid; }

      if (grid.length == 0) grid = " ";

      length = encodeQUTF8(responseArray, length, grid);
      length = encodeQBOOL(responseArray, length, 1);

      responseArray = responseArray.slice(0, length);
      wsjtUdpMessage(responseArray, responseArray.length, port, address);
      addLastTraffic("<font color='lightgreen'>Generated Msgs</font>");
    }
    else
    {
      // Callsign
      length = encodeQUTF8(responseArray, length, " ");
      // Grid
      length = encodeQUTF8(responseArray, length, " ");
      length = encodeQBOOL(responseArray, length, 1);

      responseArray = responseArray.slice(0, length);
      wsjtUdpMessage(responseArray, responseArray.length, port, address);

      responseArray = Buffer.alloc(1024);
      length = 0;
      length = encodeQUINT32(responseArray, length, thisInstance.magic_key);
      length = encodeQUINT32(responseArray, length, thisInstance.schema_number);
      length = encodeQUINT32(responseArray, length, 9);
      length = encodeQUTF8(responseArray, length, thisInstance.Id);
      length = encodeQUTF8(responseArray, length, "");
      length = encodeQBOOL(responseArray, length, 0);

      responseArray = responseArray.slice(0, length);
      wsjtUdpMessage(responseArray, responseArray.length, port, address);
    }
  }
  if (thisInstance && thisInstance.TxEnabled == 1 && genMessages == true)
  {
    addLastTraffic("<font color='yellow'>Transmit Enabled!</font><br><font color='yellow'>Generate Msgs Aborted</font>");
  }
}

function handleWsjtxADIF(newMessage)
{
  if (GT.oldQSOTimer)
  {
    nodeTimers.clearTimeout(GT.oldQSOTimer);
    GT.oldQSOTimer = null;
  }

  sendToLogger(newMessage.ADIF);
}

function handleWsjtxQSO(newMessage)
{
  if (GT.oldQSOTimer)
  {
    nodeTimers.clearTimeout(GT.oldQSOTimer);
    GT.oldQSOTimer = null;
  }

  GT.oldStyleLogMessage = Object.assign({}, newMessage);

  GT.oldQSOTimer = nodeTimers.setTimeout(oldSendToLogger, 3000);
}

function handleWsjtxNotSupported(newMessage) { }

function rigChange(up)
{
  if (GT.activeInstance == "") return;

  let targetIndex;
  let indexInstances = [];

  for (let instance in GT.instances)
  {
    indexInstances.push(instance);
  }

  targetIndex = indexInstances.indexOf(GT.activeInstance);
  if (up == true)
  {
    targetIndex = targetIndex + 1;
    if (targetIndex > indexInstances.length - 1) targetIndex = 0;
  }
  else
  {
    targetIndex = targetIndex - 1;
    if (targetIndex < 0) targetIndex = indexInstances.length - 1;
  }

  setRig(indexInstances[targetIndex]);
}

function setRig(instanceId)
{
  if (GT.instances[instanceId].valid)
  {
    if (GT.lastMapView != null)
    {
      GT.mapView.animate({ zoom: GT.lastMapView.zoom, duration: 100 });
      GT.mapView.animate({ center: GT.lastMapView.LoLa, duration: 100 });
      GT.lastMapView = null;
    }

    GT.activeInstance = instanceId;

    handleInstanceStatus(GT.instances[GT.activeInstance].status);
    handleClosed(GT.instances[GT.activeInstance].status);
  }
}

function activeRig(instance)
{
  if (GT.instances[instance].valid)
  {
    if (GT.lastMapView != null)
    {
      GT.mapView.animate({ zoom: GT.lastMapView.zoom, duration: 100 });
      GT.mapView.animate({ center: GT.lastMapView.LoLa, duration: 100 });
      GT.lastMapView = null;
    }

    GT.activeInstance = instance;

    handleInstanceStatus(GT.instances[GT.activeInstance].status);
    handleClosed(GT.instances[GT.activeInstance].status);
  }
}

function handleInstanceStatus(newMessage)
{
  if (GT.ignoreMessages == 1) return;

  let instanceKey = null;
  if (newMessage.DEcall && newMessage.DEgrid) instanceKey = `${newMessage.DEcall}|${newMessage.Band}|${newMessage.MO}|${newMessage.DEgrid}`;

  if (instanceKey != GT.instances[newMessage.instance].instanceKey )
  {
    GT.instances[newMessage.instance].instanceKey = instanceKey;
    GT.gtLiveStatusUpdate = true;
  }
  
  if (GT.callRosterWindowInitialized)
  {
    try
    {
      GT.callRosterWindowHandle.window.processStatus(newMessage);
    }
    catch (e)
    {
      console.error(e);
    }
  }

  if (GT.activeInstance == "")
  {
    GT.activeInstance = newMessage.instance;
  }

  if (Object.keys(GT.instances).length > 1)
  {
    rigWrap.style.display = "";
  }
  else
  {
    rigWrap.style.display = "none";
  }

  let DXcall = newMessage.DXcall.trim();
  let DXcallDXCC = -1;

  if (DXcall.length > 1)
  {
    if (!(newMessage.instance in GT.lastTransmitCallsign)) { GT.lastTransmitCallsign[newMessage.instance] = ""; }

    if (!(newMessage.instance in GT.lastStatusCallsign)) { GT.lastStatusCallsign[newMessage.instance] = ""; }

    if (lookupOnTx.checked == true && newMessage.Transmitting == 1 && GT.lastTransmitCallsign[newMessage.instance] != DXcall)
    {
      openLookupWindow(true);
      GT.lastTransmitCallsign[newMessage.instance] = DXcall;
    }

    if (GT.lastStatusCallsign[newMessage.instance] != DXcall)
    {
      GT.lastStatusCallsign[newMessage.instance] = DXcall;
      lookupCallsign(DXcall, newMessage.DXgrid.trim());
    }

    DXcallDXCC = callsignToDxcc(DXcall);
  }

  if (GT.callRosterWindowInitialized && GT.settings.roster.clearRosterOnBandChange && GT.instances[newMessage.instance].oldStatus)
  {
    if (GT.instances[newMessage.instance].oldStatus.Band != newMessage.Band || GT.instances[newMessage.instance].oldStatus.MO != newMessage.MO)
    {
      for (const call in GT.callRoster)
      {
        if (GT.callRoster[call].callObj.instance == newMessage.instance) { delete GT.callRoster[call]; }
      }
      if (GT.activeInstance == newMessage.instance)
      {
        goProcessRoster();
      }
    }
  }

  if (newMessage.Transmitting == 1)
  {
    GT.lastTrasmissionTimeSec = GT.timeNow;
  }

  if (GT.activeInstance == newMessage.instance)
  {
    let sp = newMessage.Id.split(" - ");
    rigDiv.innerHTML = sp[sp.length - 1].substring(0, 18);

    let bandChange = false;
    let modeChange = false;

    wsjtxMode.innerHTML = "<font color='orange'>" + newMessage.MO + "</font>";
    GT.settings.app.myMode = newMessage.MO;
    GT.settings.app.myBand = newMessage.Band;
    if (GT.lastBand != GT.settings.app.myBand)
    {
      GT.lastBand = GT.settings.app.myBand;
      bandChange = true;
      if (GT.pskBandActivityTimerHandle != null)
      {
        nodeTimers.clearInterval(GT.pskBandActivityTimerHandle);
        GT.pskBandActivityTimerHandle = null;
      }
    }
    if (GT.lastMode != GT.settings.app.myMode)
    {
      GT.lastMode = GT.settings.app.myMode;
      modeChange = true;
      if (GT.pskBandActivityTimerHandle != null)
      {
        nodeTimers.clearInterval(GT.pskBandActivityTimerHandle);
        GT.pskBandActivityTimerHandle = null;
      }
    }
    if (GT.pskBandActivityTimerHandle == null) pskGetBandActivity();
    if (bandChange || modeChange || GT.startingUp)
    {
      if (GT.instances[GT.activeInstance].canRoster == true) { updateByBandMode(); }
      removePaths();
      goProcessRoster();
      redrawGrids();
      redrawSpots();
      redrawParks();
      redrawPins();

      let msg = "<font color='yellow'>" + GT.settings.app.myBand + "</font> / <font color='orange'>" + GT.settings.app.myMode + "</font>";
      addLastTraffic(msg);
      ackAlerts();

      GT.startingUp = false;
    }

    GT.settings.app.myRawFreq = newMessage.Frequency;
    frequency.innerHTML = "<font color='lightgreen'>" + formatMhz(Number(newMessage.Frequency / 1000)) + " Hz </font><font color='yellow'>(" + GT.settings.app.myBand + ")</font>";
    

    GT.settings.app.myRawCall = newMessage.DEcall.trim();


    let testGrid = newMessage.DEgrid.trim().substr(0, 6);

    if (/^[A-R]+$/.test(testGrid.substr(0, 2)) && /^[0-9]+$/.test(testGrid.substr(2, 2)) && ( testGrid.length == 4 || testGrid.length == 6))
    {
    }
    else
    {
      testGrid = "II99";
    }

    GT.settings.app.myRawGrid = testGrid;

    if (GT.settings.app.myRawGrid != GT.settings.app.myGrid)
    {
      homeQTHInput.value = GT.settings.app.myRawGrid;
      if (ValidateGridsquare(homeQTHInput, null)) 
      {
        let LL = squareToCenter(homeQTHInput.value);
        GT.settings.map.latitude = GT.myLat = LL.a;
        GT.settings.map.longitude = GT.myLon = LL.o;
        tryUpdateQTH(homeQTHInput.value);
        nodeTimers.setTimeout(tryRecenterAEQD, 32);
        GT.nightTime = dayNight.refresh();
      }
    }

    dxCallBoxDiv.className = "DXCallBox";

    let hash = DXcall + GT.settings.app.myBand + GT.settings.app.myMode;

    if (hash in GT.tracker.worked.call)
    {
      dxCallBoxDiv.className = "DXCallBoxWorked";
    }
    if (hash in GT.tracker.confirmed.call)
    {
      dxCallBoxDiv.className = "DXCallBoxConfirmed";
    }

    if (GT.settings.app.clearOnCQ && newMessage.Transmitting == 1 && newMessage.TxMessage && GT.lastTxMessage != newMessage.TxMessage)
    {
      GT.lastTxMessage = newMessage.TxMessage;
      if (newMessage.TxMessage.substring(0, 3) == "CQ " && DXcall.length > 0)
      {
        setCallAndGrid("", "", newMessage.instance, false);
        DXcall = "";
        newMessage.DXgrid = "";
        hash = "";
      }
    }

    GT.localDXcall = DXcall;
    localDXcall.innerHTML = formatCallsign(DXcall);
    if (localDXcall.innerHTML.length == 0)
    {
      localDXcall.innerHTML = "-";
      GT.localDXcall = "";
    }

    GT.myDXGrid = newMessage.DXgrid.trim();

    // MSHV provides incomplete grid!
    if (GT.myDXGrid.length < 4) GT.myDXGrid = "";

    if (GT.myDXGrid.length == 0 && hash in GT.liveCallsigns)
    {
      GT.myDXGrid = GT.liveCallsigns[hash].grid.substr(0, 4);
    }

    if (GT.myDXGrid.length == 0)
    {
      localDXGrid.innerHTML = "-";
      localDXDistance.innerHTML = "&nbsp;";
      localDXAzimuth.innerHTML = "&nbsp;";
    }
    else
    {
      localDXGrid.innerHTML = GT.myDXGrid;
      let LL = squareToCenter(GT.myDXGrid);
      localDXDistance.innerHTML = parseInt(MyCircle.distance(GT.myLat, GT.myLon, LL.a, LL.o) * MyCircle.validateRadius(distanceUnit.value)) + distanceUnit.value.toLowerCase();
      localDXAzimuth.innerHTML = parseInt(MyCircle.bearing(GT.myLat, GT.myLon, LL.a, LL.o)) + "&deg;";
    }

    if (localDXcall.innerHTML != "-")
    {
      localDXReport.innerHTML = formatSignalReport(newMessage.Report.trim());
      if (DXcall.length > 0)
      {
        localDXCountry.innerHTML = GT.dxccToAltName[DXcallDXCC];
      }
      else
      {
        localDXCountry.innerHTML = "&nbsp;";
      }
    }
    else
    {
      localDXReport.innerHTML = localDXCountry.innerHTML = "";
    }

    GT.settings.app.myCall = newMessage.DEcall;
 
    if (newMessage.Decoding == 1)
    {
      // Decoding
      fadePaths();
      txrxdec.style.backgroundColor = "Blue";
      txrxdec.style.borderColor = "Cyan";
      txrxdec.innerHTML = "DECODE";
      GT.countIndex++;
      GT.weAreDecoding = true;
    }
    else
    {
      GT.weAreDecoding = false;

      if (GT.countIndex != GT.lastCountIndex)
      {
        GT.lastCountIndex = GT.countIndex;

        updateCountStats();

        if (bandChange || modeChange) reloadInfo();
        let html = [];

        html.push("<div  style='vertical-align:top;display:inline-block;margin-right:8px;'>");
        html.push("<table class='darkTable' align=center>");
        html.push("<tr><th colspan=7>Last " + GT.lastMessages.length + " Decoded Messages</th></tr>");
        html.push("<tr><th>Time</th><th>dB</th><th>DT</th><th>Freq</th><th>Mode</th><th>Message</th><th>DXCC</th></tr>");

        html.push(GT.lastMessages.join(""));

        html.push("</table></div>");

        setStatsDiv("decodeLastListDiv", html.join(""));
        setStatsDivHeight("decodeLastListDiv", getStatsWindowHeight() + 26 + "px");

        if (GT.settings.app.offAirServicesEnable == true && Object.keys(GT.spotCollector).length > 0)
        {
          gtChatSendSpots(GT.spotCollector);
          GT.spotCollector = {};
        }
      }

      txrxdec.style.backgroundColor = "Green";
      txrxdec.style.borderColor = "GreenYellow";
      txrxdec.innerHTML = "RECEIVE";
    }

    if (newMessage.TxEnabled)
    {
      if (GT.settings.map.fitQRZ && (GT.spotView == 0 || GT.settings.reception.mergeSpots))
      {
        if (GT.lastMapView == null)
        {
          GT.lastMapView = {};
          GT.lastMapView.LoLa = GT.mapView.getCenter();
          GT.lastMapView.zoom = GT.mapView.getZoom();
        }
        if (GT.myDXGrid.length > 0)
        {
          fitViewBetweenPoints([getPoint(GT.settings.app.myRawGrid), getPoint(GT.myDXGrid)]);
        }
        else if (GT.settings.map.qrzDxccFallback && DXcall.length > 0 && DXcallDXCC > 0)
        {
          let Lat = GT.dxccInfo[DXcallDXCC].lat;
          let Lon = GT.dxccInfo[DXcallDXCC].lon;
          fitViewBetweenPoints([getPoint(GT.settings.app.myRawGrid), ol.proj.fromLonLat([Lon, Lat])], 15);
        }
      }
    }
    else
    {
      if (GT.lastMapView != null)
      {
        GT.mapView.animate({ zoom: GT.lastMapView.zoom, duration: 1200 });
        GT.mapView.animate({ center: GT.lastMapView.LoLa, duration: 1200 });
        GT.lastMapView = null;
      }
    }

    if (newMessage.Transmitting == 0)
    {
      // Not Transmitting
      GT.lastTxMessage = null;
      GT.layerSources.transmit.clear();
      GT.transmitFlightPath = null;
    }
    else
    {
      txrxdec.style.backgroundColor = "red";
      txrxdec.style.borderColor = "orange";
      txrxdec.innerHTML = "TRANSMIT";
      GT.layerSources.transmit.clear();
      GT.transmitFlightPath = null;

      if (qrzPathWidthValue.value != 0 && GT.settings.app.gridViewMode != 2 && validateGridFromString(GT.settings.app.myRawGrid))
      {
        let strokeColor = getQrzPathColor();
        let strokeWeight = qrzPathWidthValue.value;
        let LL = squareToCenter(GT.settings.app.myRawGrid);
        let fromPoint = ol.proj.fromLonLat([LL.o, LL.a]);
        let toPoint = null;

        if (validateGridFromString(GT.myDXGrid))
        {
          LL = squareToCenter(GT.myDXGrid);
          toPoint = ol.proj.fromLonLat([LL.o, LL.a]);
        }
        else if (GT.settings.map.qrzDxccFallback && DXcall.length > 0 && DXcallDXCC > 0)
        {
          toPoint = ol.proj.fromLonLat([GT.dxccInfo[DXcallDXCC].lon, GT.dxccInfo[DXcallDXCC].lat]);

          let locality = GT.dxccInfo[DXcallDXCC].geo;
          if (locality == "deleted") locality = null;

          if (locality != null)
          {
            let feature = shapeFeature("qrz", locality, "qrz", "#FFFF0010", "#FF0000FF", 1.0);
            GT.layerSources.transmit.addFeature(feature);
          }
        }

        if (toPoint)
        {
          try
          {
            GT.transmitFlightPath = flightFeature(
              [fromPoint, toPoint],
              {
                weight: strokeWeight,
                color: strokeColor,
                steps: 75,
                zIndex: 90
              },
              "transmit",
              true
            );
            setAnimate(true);
          }
          catch (err)
          {
            console.log("Unexpected error inside handleInstanceStatus", err)
          }
        }
      }

      GT.weAreDecoding = false;
    }
  }

  if (newMessage.Decoding == 0)
  {
    goProcessRoster();
  }
}

function reportDecodes()
{
  if (hasAnyKeys(GT.decodeCollector))
  {
    if (GT.settings.app.spottingEnable) {
       gtChatSendDecodes(GT.decodeCollector);
    }
    GT.decodeCollector = {};
  }
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

function getPoint(grid)
{
  let LL = squareToCenter(grid);
  return ol.proj.fromLonLat([LL.o, LL.a]);
}

function fitViewBetweenPoints(points, maxZoom = 20)
{
  let start = ol.proj.toLonLat(points[0]);
  let end = ol.proj.toLonLat(points[1]);

  if (Math.abs(start[0] - end[0]) > 180)
  {
    // Wrapped
    if (end[0] < start[0])
    {
      start[0] -= 360;
    }
    else
    {
      end[0] -= 360;
    }
  }

  start = ol.proj.fromLonLat(start);
  end = ol.proj.fromLonLat(end);
  let line = new ol.geom.LineString([start, end]);
  let feature = new ol.Feature({ geometry: line });
  if (GT.useTransform)
  {
    feature.getGeometry().transform("EPSG:3857", GT.settings.map.projection);
  }

  GT.mapView.fit(feature.getGeometry(), {
    duration: 500,
    maxZoom: maxZoom,
    padding: [75, 75, 75, 75]
  });
}

function handleWsjtxDecode(newMessage)
{
  if (GT.ignoreMessages == 1) return;
  
  if (newMessage.OM == "JS8")
  {
    // A JS8Call message
    const message = parseJS8Message(newMessage.Msg);
    if (message)
    {
      finalWsjtxDecode(newMessage, true, message);
    }
    return;
  }

  // FOX message
  // eg: "YK7DAQ RR73; 3O5GAS <JI1BXD> +14"
  if (newMessage.Msg.includes(" RR73; "))
  {
    let parts = newMessage.Msg.split("RR73; ");
    // parts[0] is "YK7DAQ " includes space
    // parts[1] is "3O5GAS <JI1BXD> +14" no leading space, a useable message
    let caller = parts[1].split(" ")[1];
    // caller is "<JI1BXD>"
    let first = parts[0] + caller + " RR73";
    // first is "YK7DAQ <JI1BXD> RR73"
    finalWsjtxDecode(newMessage, true, parts[1]);
    // Send the RR73 last as it's more important to us
    finalWsjtxDecode(newMessage, true, first);
  }
  else
  {
    // A classic mode 0 decoded message
    finalWsjtxDecode(newMessage);
  }
}

const kIsEven = {
  FT8: { "00": 1, "30": 1 },
  FT4: { "00": 1, "15": 1, "30": 1, "45": 1 }
}

const REGEX_GRID_4 = /^[A-R]{2}[0-9]{2}$/; 

function finalWsjtxDecode(newMessage, useReformedMessage = false, reformedMessage)
{
  let didCustomAlert = false;
  let validQTH = false;
  let CQ = false;
  let RR73 = false;
  let msgDEcallsign = "";
  let msgDXcallsign = "";
  let theirQTH = "";
  let countryName = "";
  let newF;
  if (newMessage.OF > 0)
  {
    newF = formatMhz(Number((newMessage.OF + newMessage.DF) / 1000));
  }
  else
  {
    newF = newMessage.DF;
  }

  let theTimeStamp = timeNowSec() - (timeNowSec() % 86400) + ~~(newMessage.TM / 1000);

  let theMessage = useReformedMessage ? reformedMessage : newMessage.Msg;

  // Break up the decoded message
  let decodeWords = theMessage.split(" ").slice(0, 5);
  while (decodeWords[decodeWords.length - 1] == "") decodeWords.pop();

  if (decodeWords.length > 1)
  {
    if (theMessage.includes("<"))
    {
      // Standard for-loop is drastically faster for Arrays in V8 than for...in
      for (let i = 0; i < decodeWords.length; i++)
      {
        let word = decodeWords[i];
        // Absolute fastest: V8 SlicedString. 60 is '<', 62 is '>'
        if (word.charCodeAt(0) === 60 && word.charCodeAt(word.length - 1) === 62)
        {
          word = word.slice(1, -1);
          decodeWords[i] = word;
        } 
        else if (word.includes("<")) 
        {
          // Fallback just in case of a malformed/partial string
          word = word.replace(/[<>]/g, "");
          decodeWords[i] = word;
        }

        if (word.includes("..."))
        {
          if (i !== 0)
          {
            // simply ignore <...> , we don't know who they are and we aint talking to them.
            return;
          }
          else
          {
            decodeWords[0] = "UNKNOWN";
          }
        }
      }
    }

    // Grab the last word in the decoded message
    let qth = decodeWords[decodeWords.length - 1].trim();
    if (qth.length === 4) {
      if (qth === "RR73") {
        // Trap the FT8 message immediately. No regex needed!
        theirQTH = "";
        validQTH = false;
      } else if (REGEX_GRID_4.test(qth)) {
        // It's not RR73, so validate it as a real grid
        theirQTH = qth;
        validQTH = true;
      }
    }

    if (validQTH) msgDEcallsign = decodeWords[decodeWords.length - 2].trim();
    if (validQTH == false && decodeWords.length == 3) { msgDEcallsign = decodeWords[decodeWords.length - 2].trim(); }
    if (validQTH == false && decodeWords.length == 2) { msgDEcallsign = decodeWords[decodeWords.length - 1].trim(); }
    if (decodeWords[0] == "CQ")
    {
      CQ = true;
      msgDXcallsign = "CQ";
    }

    if (decodeWords.length == 4 && CQ == true)
    {
      msgDXcallsign += " " + decodeWords[1];
    }
    if (decodeWords.length == 3 && CQ == true && validQTH == false)
    {
      msgDXcallsign += " " + decodeWords[1];
    }
    if (decodeWords.length < 4 && CQ == false)
    {
      msgDXcallsign = decodeWords[0];
    }
    if (decodeWords.length >= 3 && CQ == true && validQTH == false)
    {
      if (validateNumAndLetter(decodeWords[decodeWords.length - 1].trim())) { msgDEcallsign = decodeWords[decodeWords.length - 1].trim(); }
      else msgDEcallsign = decodeWords[decodeWords.length - 2].trim();
    }

    if (decodeWords.length >= 4 && CQ == false)
    {
      msgDXcallsign = decodeWords[0];
      msgDEcallsign = decodeWords[1];
    }

    if (decodeWords[2] == "RR73" || decodeWords[2] == "73")
    {
      RR73 = decodeWords[2];
    }

    let callsign = null;

    let decodeHadGrid = (theirQTH !== "");
    let spotHadGrid = false;

    let hash = msgDEcallsign + newMessage.OB + newMessage.OM;
    if (hash in GT.liveCallsigns)
    {
      callsign = GT.liveCallsigns[hash];
      if (theirQTH == "" && callsign.grid.length)
      {
        theirQTH = callsign.grid;
        validQTH = true;
      }
    }


    if (theirQTH == "")
    {
      let spotHash = msgDEcallsign + newMessage.OM + newMessage.OB;
      if (spotHash in GT.receptionReports.spots)
      {
        let spotGrid = GT.receptionReports.spots[spotHash].grid;
        if (spotGrid && spotGrid.length > 0) {
          theirQTH = spotGrid.substring(0,4);
          validQTH = true;
          spotHadGrid = true;
        }
      }
    }

    let canPath = false;
    if (
      (GT.settings.app.gtBandFilter.length == 0 ||
        (GT.settings.app.gtBandFilter == "auto" && newMessage.OB == GT.settings.app.myBand) ||
        newMessage.OB == GT.settings.app.gtBandFilter) &&
      (GT.settings.app.gtModeFilter.length == 0 ||
        (GT.settings.app.gtModeFilter == "auto" && newMessage.OM == GT.settings.app.myMode) ||
        newMessage.OM == GT.settings.app.gtModeFilter ||
        GT.settings.app.gtModeFilter == "Digital")
    )
    {
      qthToBox(theirQTH, msgDEcallsign, CQ, false, msgDXcallsign, newMessage.OB, null, hash, true);
      canPath = true;
    }

    if (theirQTH in GT.liveGrids)
    {
      GT.liveGrids[theirQTH].age = GT.timeNow;
    }

    if (callsign == null)
    {
      let dxcc = callsignToDxcc(msgDEcallsign);
      let newCallsign = new LiveCallsign(
        msgDEcallsign,        // DEcall
        msgDXcallsign.trim(), // DXcall
        theirQTH,             // grid
        newMessage.OM,        // mode
        newMessage.OB,        // band
        newMessage.Msg,       // msg
        dxcc,                 // dxcc
        theTimeStamp          // time
      );
      if (theirQTH.length > 0) newCallsign.gridQualified = true;
      
      newCallsign.RSTsent = newMessage.SR;
      newCallsign.delta = newMessage.DF;
      newCallsign.dt = newMessage.DT.toFixed(2);

      if (dxcc != -1)
      {
        newCallsign.px = getWpx(msgDEcallsign);
        if (newCallsign.px)
        {
          newCallsign.zone = Number(newCallsign.px.charAt(newCallsign.px.length - 1));
        }

        newCallsign.cont = GT.dxccInfo[dxcc].continent;
        if (dxcc == 390 && newCallsign.zone == 1) { newCallsign.cont = "EU"; }
      }

      newCallsign.ituz = ituZoneFromCallsign(msgDEcallsign, dxcc);
      newCallsign.cqz = cqZoneFromCallsign(msgDEcallsign, dxcc);

      getLookupCachedObject(msgDEcallsign, null, null, null, newCallsign);

      GT.liveCallsigns[hash] = newCallsign;
      callsign = newCallsign;
    }
    else
    {
      if (validQTH)
      {
        callsign.grid = theirQTH;
        if (decodeHadGrid || spotHadGrid) callsign.gridQualified = true;
      }

      callsign.time = theTimeStamp;
      callsign.age = timeNowSec();

      callsign.RSTsent = newMessage.SR;
      callsign.delta = newMessage.DF;
      callsign.DXcall = msgDXcallsign.trim();
      callsign.msg = newMessage.Msg;
      callsign.dt = newMessage.DT.toFixed(2);

      if (callsign.ituz == null) callsign.ituz = ituZoneFromCallsign(callsign.DEcall, callsign.dxcc);
      if (callsign.cqz == null ) callsign.cqz = cqZoneFromCallsign(callsign.DEcall, callsign.dxcc);
    }

    callsign.mode = newMessage.OM;
    callsign.band = newMessage.OB;
    callsign.instance = newMessage.instance;
    callsign.grid = callsign.grid.substr(0, 4);
    callsign.CQ = CQ;
    callsign.RR73 = RR73;
    callsign.UTC = toColonHMS(parseInt(newMessage.TM / 1000));

    if (callsign.mode in kIsEven)
    {
      callsign.even = (callsign.UTC.slice(-2) in kIsEven[callsign.mode]);
    }

    callsign.qrz = (msgDXcallsign == GT.settings.app.myCall);

    if (callsign.grid.length > 0 && isKnownCallsignUS(callsign.dxcc))
    {
      if (callsign.grid in GT.gridToState && GT.gridToState[callsign.grid].length == 1)
      {
        callsign.state = GT.gridToState[callsign.grid][0];
      }
    }

    if (GT.settings.callsignLookups.ulsUseEnable == true && isKnownCallsignUSplus(callsign.dxcc) && (callsign.state == null || callsign.cnty == null))
    {
      lookupKnownCallsign(callsign);
    }

    if (callsign.state == null)
    {
      if (callsign.dxcc == 1 && GT.settings.callsignLookups.cacUseEnable && callsign.DEcall in GT.cacCallsigns)
      {
        callsign.state = "CA-" + GT.cacCallsigns[callsign.DEcall];
      }
    }

    if (callsign.distance == 0 && callsign.grid.length > 0)
    {
      let LL = squareToCenter(callsign.grid);
      callsign.distance = MyCircle.distance(GT.myLat, GT.myLon, LL.a, LL.o);
      callsign.heading = MyCircle.bearing(GT.myLat, GT.myLon, LL.a, LL.o);
    }

    if (GT.settings.app.potaFeatureEnabled)
    {
      callsign.pota = null;
      if (callsign.DEcall in GT.pota.callSpots || callsign.DEcall in GT.pota.callSchedule)
      {
        let now = Date.now();
        if (callsign.DEcall in GT.pota.callSpots)
        {
          if (GT.pota.callSpots[callsign.DEcall] in GT.pota.parkSpots && GT.pota.parkSpots[GT.pota.callSpots[callsign.DEcall]][callsign.DEcall].expire > now)
          {
            callsign.pota = GT.pota.callSpots[callsign.DEcall];
          }
        }
        else if (callsign.DEcall in GT.pota.callSchedule)
        {
          for (const i in GT.pota.callSchedule[callsign.DEcall])
          {
            if (now < GT.pota.callSchedule[callsign.DEcall][i].end && now >= GT.pota.callSchedule[callsign.DEcall][i].start)
            {
              callsign.pota = GT.pota.callSchedule[callsign.DEcall][i].id;
              break;
            }
          }
        }
        if (callsign.pota)
        {
          potaSpotFromDecode(callsign);
        }
        else if (CQ == true && msgDXcallsign == "CQ POTA")
        {
          callsign.pota = "?-????";
        }
      }
      else if (CQ == true && msgDXcallsign == "CQ POTA")
      {
        callsign.pota = "?-????";
      }
    }

    if (newMessage.NW)
    {
      if (GT.settings.app.spottingEnable === true && newMessage.OF > 0) {
        const instanceKey = GT.instances[newMessage.instance].instanceKey;
        if (instanceKey)
        {
          const instanceHash = GT.instances[newMessage.instance].instanceHash;
          const call = callsign.DEcall;
          if (GT.gtCallsigns[call] !== undefined) {
            const spotColl = GT.spotCollector;
            let spotMap = spotColl[instanceHash];

            if (spotMap === undefined) {
              spotMap = new Map();
              spotColl[instanceHash] = spotMap;
            }

            spotMap.set(call, callsign.RSTsent + "|" + (callsign.delta + newMessage.OF));
          }

          const decodeColl = GT.decodeCollector;
          const currentCount = decodeColl[instanceHash];
          // V8 optimized, i know it looks bad, but it's really not
          if (currentCount === undefined) {
            decodeColl[instanceHash] = 1;
          } else {
            decodeColl[instanceHash] = currentCount + 1;
          }
        }
      }

      didCustomAlert = processCustomAlertMessage(decodeWords, theMessage.substr(0, 30).trim(), callsign.band, callsign.mode);

      insertMessageInRoster(newMessage, msgDEcallsign, msgDXcallsign, callsign, hash);

      if (GT.settings.map.trafficDecode && didCustomAlert == true)
      {
        let traffic = htmlEntities(theMessage);

        traffic = traffic + " 🚩";

        GT.lastTraffic.unshift(traffic);
        GT.lastTraffic.unshift(userTimeString(null));
        GT.lastTraffic.unshift("<hr style='border-color:#333;margin-top:0px;margin-bottom:2px;width:80%'>");
        drawTraffic();
        lastMessageWasInfo = true;
      }
    }

    if (callsign.dxcc != -1) { 
      countryName = GT.dxccToAltName[callsign.dxcc];
      updateSessionCallsigns(callsign);
    }
    if (canPath == true)
    {
      if (callsign.DXcall.indexOf("CQ") < 0 && GT.settings.app.gridViewMode != 2)
      {
        // Nothing special, we know the callers grid
        if (callsign.grid != "")
        {
          // Our msgDEcallsign is not sending a CQ.
          // Let's see if we can locate who he's talking to in our known list
          let DEcallsign = null;
          if (callsign.DXcall + newMessage.OB + newMessage.OM in GT.liveCallsigns)
          {
            DEcallsign = GT.liveCallsigns[callsign.DXcall + newMessage.OB + newMessage.OM];
          }
          else if (msgDXcallsign == GT.settings.app.myCall && GT.settings.app.myGrid in GT.liveCallsigns)
          {
            DEcallsign = GT.liveCallsigns[GT.settings.app.myGrid];
          }

          if (DEcallsign != null && DEcallsign.grid != "")
          {
            let strokeColor = getPathColor();
            let strokeWeight = pathWidthValue.value;
            let flightPath = null;
            let isQRZ = false;
            if (msgDXcallsign == GT.settings.app.myCall)
            {
              strokeColor = getQrzPathColor();
              strokeWeight = qrzPathWidthValue.value;
              isQRZ = true;
            }

            if (strokeWeight != 0)
            {
              try
              {
                flightPath = flightFeature(
                  [getPoint(callsign.grid), getPoint(DEcallsign.grid)],
                  {
                    weight: strokeWeight,
                    color: strokeColor,
                    steps: 75,
                    zIndex: 90,
                    isQRZ: isQRZ
                  },
                  "flight",
                  true
                );

                flightPath.age = GT.timeNow + GT.flightDuration;
                flightPath.isShapeFlight = 0;
                flightPath.isQRZ = isQRZ;

                GT.flightPaths.push(flightPath);
                setAnimate(true);
              }
              catch (err)
              {
               // console.error("Unexpected error inside handleWsjtxDecode 1", err)
              }
            }
          }
        }
        else if (GT.settings.map.qrzDxccFallback && msgDXcallsign == GT.settings.app.myCall && callsign.dxcc > 0)
        {
          // the caller is calling us, but they don't have a grid, so lookup the DXCC and show it
          let strokeColor = getQrzPathColor();
          let strokeWeight = qrzPathWidthValue.value;
          let flightPath = null;
          let isQRZ = true;
 
          if (strokeWeight != 0 && GT.settings.app.myGrid.length > 0)
          {
            try
            {
              flightPath = flightFeature(
                [ol.proj.fromLonLat([ GT.dxccInfo[callsign.dxcc].lon, GT.dxccInfo[callsign.dxcc].lat]), getPoint(GT.settings.app.myGrid)],
                {
                  weight: strokeWeight,
                  color: strokeColor,
                  steps: 75,
                  zIndex: 90,
                  isQRZ: isQRZ
                },
                "flight",
                true
              );

              flightPath.age = GT.timeNow + GT.flightDuration;
              flightPath.isShapeFlight = 0;
              flightPath.isQRZ = isQRZ;

              GT.flightPaths.push(flightPath);
              setAnimate(true);
            }
            catch (err)
            {
              console.error("Unexpected error inside handleWsjtxDecode 2", err)
            }

            let feature = shapeFeature(
              "qrz",
              GT.dxccInfo[callsign.dxcc].geo,
              "qrz",
              "#FFFF0010",
              "#FF0000FF",
              1.0
            );
            feature.age = GT.timeNow + GT.flightDuration;
            feature.isShapeFlight = 1;
            feature.isQRZ = isQRZ;
            GT.layerSources.flight.addFeature(feature);
            GT.flightPaths.push(feature);
            setAnimate(true);
          }
        }
      }
      else if (GT.settings.map.CQhilite && msgDXcallsign.indexOf("CQ ") == 0 && callsign.grid != "" && GT.settings.app.gridViewMode != 2 && pathWidthValue.value != 0)
      {
        let CCd = msgDXcallsign.replace("CQ ", "").split(" ")[0];
        if (CCd.length < 5 && !(CCd in GT.pathIgnore))
        {
          let locality = null;
          // Direct lookup US states, Continents, possibly
          if (CCd in GT.replaceCQ) CCd = GT.replaceCQ[CCd];

          if (CCd.length == 2 && CCd in GT.shapeData)
          {
            locality = GT.shapeData[CCd];
          }
          else if (CCd.length == 3)
          {
            // maybe it's DEL, or WYO. check the first two letters
            if (CCd.substr(0, 2) in GT.shapeData) { locality = GT.shapeData[CCd.substr(0, 2)]; }
          }

          if (locality == null)
          {
            // Check the prefix for dxcc direct
            if (CCd in GT.prefixToDXCC)
            {
              locality = GT.dxccInfo[GT.prefixToDXCC[CCd]].geo;
              if (locality == "deleted")
              {
                locality = null;
              }
            }
          }

          if (locality != null)
          {
            let strokeColor = getPathColor();
            let strokeWeight = pathWidthValue.value;
            let flightPath = null;

            let feature = shapeFeature(
              CCd,
              locality,
              CCd,
              "#00000000",
              "#FF0000C0",
              strokeWeight
            );

            feature.age = GT.timeNow + GT.flightDuration;
            feature.isShapeFlight = 1;
            feature.isQRZ = false;
            GT.layerSources.flight.addFeature(feature);
            GT.flightPaths.push(feature);
            setAnimate(true);
            let fromPoint = getPoint(callsign.grid);
            let toPoint = ol.proj.fromLonLat(locality.properties.center);

            try
            {
              flightPath = flightFeature(
                [fromPoint, toPoint],
                {
                  weight: strokeWeight,
                  color: strokeColor,
                  steps: 75,
                  zIndex: 90,
                  isQRZ: false
                },
                "flight",
                true
              );

              flightPath.age = GT.timeNow + GT.flightDuration;
              flightPath.isShapeFlight = 0;
              flightPath.isQRZ = false;
              GT.flightPaths.push(flightPath);
              setAnimate(true);
            }
            catch (err)
            {
              console.error("Unexpected error inside handleWsjtxDecode 3", err)
            }
          }
        }
      }
    }
  }

  let bgColor = "black";
  if (newMessage.LC > 0) bgColor = "#880000";

  GT.lastMessages.unshift(
    "<tr style='background-color:" +
    bgColor +
    "'><td style='color:lightblue'>" +
    userTimeString(theTimeStamp * 1000) +
    "</td><td style='color:orange'>" +
    newMessage.SR +
    "</td><td style='color:gray'>" +
    newMessage.DT.toFixed(1) +
    "</td><td style='color:lightgreen'>" +
    newF +
    "</td><td>" +
    newMessage.MO +
    "</td><td style='color:" +
    (CQ ? "cyan" : "white") +
    "'>" +
    htmlEntities(theMessage) +
    "</td><td style='color:yellow'>" +
    countryName +
    "</td></tr>"
  );

  while (GT.lastMessages.length > 100) GT.lastMessages.pop();
}


/**
 * Parse JS8Call message format: "CALLSIGN: CONTENT"
 *
 * Examples:
 * - Heartbeat: "K1ABC: @HB HEARTBEAT EM73" -> callsign + grid
 * - CQ: "K1ABC: @ALLCALL CQ DX EM73" -> callsign + grid + cq flag
 * - Directed: "K1ABC: N2DEF SNR -05" -> callsign + dxCall
 * 
 * Returns:
 *  WSJT-X compatible message
 */
function parseJS8Message(message)
{
  let msg = message.trim();
  let colonIndex = msg.indexOf(":");
  if (colonIndex == -1)
  {
    return null;
  }

  let DEcallsign = msg.substring(0, colonIndex).trim();

  // JS8Call prefixes compound callsigns with backtick
  if (DEcallsign.charAt(0) == "`")
  {
    DEcallsign = DEcallsign.substring(1);
  }

  // Is it valid?
  if (!DEcallsign.match(CALLSIGN_REGEXP)) return null;

  let words = msg.substring(colonIndex + 1).trim().split(/\s+/);

  if (words.length > 1)
  {
    if (words[0] == "@HB" || words[0] == "HB")
    {
        return `HB ${DEcallsign} ${words[words.length - 1]}`;
    }
    if (words[0] == "@ALLCALL")
    {
      if (words[1] == "CQ")
      {
        let decode = `CQ ${DEcallsign}`;
        if (words.length > 2)
        {
          decode += ` ${words[words.length - 1]}`;
        }
        return decode;
      }
      else return null;

    }
    return `${words[0]} ${DEcallsign} ${words[words.length - 1]}`;
  }
  else
  {
    return null;
  }
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

const K_CACHED_WORLD_RING = [];
(function initWorldRing() {
  const radius = 20047508;
  const radFactor = Math.PI / 180;
  for (let i = 0; i <= 360; i += 0.1) {
    let rad = i * radFactor;
    K_CACHED_WORLD_RING.push([radius * Math.cos(rad), radius * Math.sin(rad)]);
  }
})();

function pointInPolygon(point, vs) {
  let lon = point[0], lat = point[1];
  let poly = new Array(vs.length); // Pre-allocate memory for V8
  let curLon = vs[0][0];
  poly[0] = [curLon, vs[0][1]];
  
  let minLon = curLon;
  let maxLon = curLon;

  for (let i = 1; i < vs.length; i++) {
    let dl = vs[i][0] - vs[i - 1][0];
    if (Math.abs(dl) > 359) {
      // Explicit full-world sweep, keep it
    } else if (dl > 180) {
      dl -= 360;
    } else if (dl < -180) {
      dl += 360;
    }
    curLon += dl;
    poly[i] = [curLon, vs[i][1]];
    
    // V8 Optimization: Calculate min/max natively without spread/map arrays
    if (curLon < minLon) minLon = curLon;
    if (curLon > maxLon) maxLon = curLon;
  }

  let testLons = [lon, lon - 360, lon + 360];
  for (let i = 0; i < 3; i++) {
    let tLon = testLons[i];
    if (tLon >= minLon && tLon <= maxLon) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        let xi = poly[i][0], yi = poly[i][1];
        let xj = poly[j][0], yj = poly[j][1];
        let intersect = ((yi > lat) !== (yj > lat)) && (tLon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      if (inside) return true;
    }
  }
  return false;
}

const K_RAD_FACTOR = Math.PI / 180;
const K_DEG_FACTOR = 180 / Math.PI; 

function segmentizeRing(ring, antiLon, antiLat) {
  let newRing = [];
  
  const aLatRad = antiLat * K_RAD_FACTOR;
  const cosALatRad = Math.cos(aLatRad);

  for (let i = 0; i < ring.length - 1; i++) {
    let p1 = ring[i];
    let p2 = ring[i + 1];

    let lat1 = Math.max(-89.99, Math.min(89.99, p1[1]));
    let lat2 = Math.max(-89.99, Math.min(89.99, p2[1]));
    let lon1 = p1[0];
    let lon2 = p2[0];
    
    newRing.push([lon1, lat1]);

    let dLon = lon2 - lon1;
    let dLat = lat2 - lat1;

    if (Math.abs(dLon) > 359) {
      // Keep perfect closure
    } else if (Math.abs(dLon) > 180) {
      dLon = dLon > 0 ? dLon - 360 : dLon + 360;
    }

    let dist = Math.sqrt(dLon * dLon + dLat * dLat);

    let lat1Rad = lat1 * K_RAD_FACTOR;
    let dLonRad1 = (lon1 - antiLon) * K_RAD_FACTOR;
    let a1 = Math.sin((aLatRad - lat1Rad) / 2) ** 2 + cosALatRad * Math.cos(lat1Rad) * Math.sin(dLonRad1 / 2) ** 2;
    // Replaced (180 / Math.PI) with K_DEG_FACTOR
    let dist1 = 2 * Math.asin(Math.sqrt(a1)) * K_DEG_FACTOR; 

    let lat2Rad = lat2 * K_RAD_FACTOR;
    let dLonRad2 = (lon2 - antiLon) * K_RAD_FACTOR;
    let a2 = Math.sin((aLatRad - lat2Rad) / 2) ** 2 + cosALatRad * Math.cos(lat2Rad) * Math.sin(dLonRad2 / 2) ** 2;
    // Replaced (180 / Math.PI) with K_DEG_FACTOR
    let dist2 = 2 * Math.asin(Math.sqrt(a2)) * K_DEG_FACTOR; 

    let distToAnti = Math.min(dist1, dist2);

    let currentMaxDegree = 0.5;
    if (distToAnti < 5.0) {
       currentMaxDegree = 0.05;
    } else if (distToAnti < 15.0) {
       currentMaxDegree = 0.1; 
    } else if (distToAnti < 30.0) {
       currentMaxDegree = 0.2; 
    }

    if (dist > currentMaxDegree) {
      let steps = Math.ceil(dist / currentMaxDegree);
      for (let j = 1; j < steps; j++) {
        let intLon = lon1 + dLon * (j / steps);
        let intLat = lat1 + dLat * (j / steps);
        
        if (intLon > 180) intLon -= 360;
        else if (intLon < -180) intLon += 360;
        
        newRing.push([intLon, intLat]);
      }
    }
  }
  
  let lastP = ring[ring.length - 1];
  newRing.push([lastP[0], Math.max(-89.99, Math.min(89.99, lastP[1]))]);
  return newRing;
}


function shapeFeature(
  key,
  geoJsonData,
  propname,
  fillColor,
  borderColor,
  borderWidth
) {
  let format = new ol.format.GeoJSON({ geometryName: key });
  let feature = format.readFeature(geoJsonData);
  let geometry = feature.getGeometry();

  if (GT.useTransform) {
    let antiLon = GT.myLon > 0 ? GT.myLon - 180 : GT.myLon + 180;
    let antiLat = -GT.myLat;
    
    let testLon = antiLon + 0.00013;
    let testLat = antiLat + 0.00017;
    if (testLat <= -89.9) testLat = -89.9;
    else if (testLat >= 89.9) testLat = 89.9;

    let type = geometry.getType();
    let invertedPolygons = []; 

    if (type === 'Polygon') {
      let rings = geometry.getCoordinates();
      if (pointInPolygon([testLon, testLat], rings[0])) invertedPolygons.push(0);
      geometry.setCoordinates(rings.map(ring => segmentizeRing(ring, antiLon, antiLat)));
    } else if (type === 'MultiPolygon') {
      let polys = geometry.getCoordinates();
      polys.forEach((poly, index) => {
        if (pointInPolygon([testLon, testLat], poly[0])) invertedPolygons.push(index);
      });
      geometry.setCoordinates(polys.map(poly => poly.map(ring => segmentizeRing(ring, antiLon, antiLat))));
      
    } else if (type === 'LineString') {
      let line = geometry.getCoordinates();
      geometry.setCoordinates(segmentizeRing(line, antiLon, antiLat));
      
    } else if (type === 'MultiLineString') {
      let lines = geometry.getCoordinates();
      geometry.setCoordinates(lines.map(line => segmentizeRing(line, antiLon, antiLat)));
    }

    geometry.transform('EPSG:4326', GT.settings.map.projection);

    // Apply inverted polygons (this will safely be skipped for lines because invertedPolygons.length === 0)
    if (invertedPolygons.length > 0) {
      // Deep copy the cached world ring to prevent OpenLayers mutation bugs
      let clonedWorldRing = K_CACHED_WORLD_RING.map(coord => [coord[0], coord[1]]);

      if (type === 'Polygon') {
        let rings = geometry.getCoordinates();
        rings.unshift(clonedWorldRing); 
        geometry.setCoordinates(rings);
      } else if (type === 'MultiPolygon') {
        let polys = geometry.getCoordinates();
        invertedPolygons.forEach(index => {
          polys[index].unshift(clonedWorldRing);
        });
        geometry.setCoordinates(polys);
      }
    }
  } else {
    geometry.transform('EPSG:4326', GT.settings.map.projection);
  }

  let style = new ol.style.Style({
    stroke: new ol.style.Stroke({
      color: borderColor,
      width: borderWidth
    }),
    fill: new ol.style.Fill({
      color: fillColor // OpenLayers ignores fill on lines, so leaving this here is perfectly safe
    })
  });

  feature.setStyle(style);
  feature.set("prop", propname);
  feature.size = 2;
  return feature;
}

function handleWsjtxClear(newMessage)
{
  for (let hash in GT.liveCallsigns)
  {
    if (GT.liveCallsigns[hash].instance == newMessage.instance || GT.liveCallsigns[hash].mode == GT.instances[newMessage.instance].status.MO)
    {
      delete GT.liveCallsigns[hash];
    }
  }
  for (let call in GT.callRoster)
  {
    if (GT.callRoster[call].callObj.instance == newMessage.instance) { delete GT.callRoster[call]; }
  }

  removePaths();
  clearTempGrids();
  redrawGrids();
  redrawPins();

  updateCountStats();
  goProcessRoster();
}

function goProcessRoster() {
    const now = timeNowSec();

    for (const call in GT.callRoster) {
        const entry = GT.callRoster[call];
        const callObj = entry.callObj;

        if (now - callObj.age > 300) {
            // callObj is passed by reference from elsewhere, 
            // so we safely reset its flags before pruning the roster entry.
            callObj.rosterAlerted = false;
            callObj.shouldRosterAlert = false;
            callObj.audioAlerted = false;
            callObj.shouldAudioAlert = false;
            
            // Delete from the roster map
            delete GT.callRoster[call];
        }
    }

    if (GT.callRosterWindowInitialized) {
        try {
            GT.callRosterWindowHandle.window.processRoster();
        } catch (e) {
            console.log("[goProcessRoster] IPC Error:", e);
        }
    }
}

function handleClosed(newMessage)
{
  if (GT.activeInstance == newMessage.Id && GT.instances[newMessage.Id].open == false)
  {
    txrxdec.style.backgroundColor = "Purple";
    txrxdec.style.borderColor = "Purple";
    let name = newMessage.Id.toUpperCase().split(" - ");
    txrxdec.innerHTML = name[name.length - 1] + " Closed";
  }

  if (GT.instances[newMessage.Id].open == false)
  {
    if (GT.instances[newMessage.Id].canRoster == true) GT.instanceCount--;
    delete GT.instances[newMessage.Id];
    GT.gtLiveStatusUpdate = true;
  }

  if (!(GT.activeInstance in GT.instances))
  {
    GT.activeInstance = "";
  }

  if (Object.keys(GT.instances).length > 1)
  {
    rigWrap.style.display = "";
  }
  else
  {
    rigWrap.style.display = "none";
  }

  updateRosterInstances();
  goProcessRoster();
}

function handleWsjtxClose(newMessage)
{
  updateCountStats();
  GT.instances[newMessage.Id].open = false;
  handleClosed(newMessage);
}

function handleWsjtxWSPR(newMessage)
{
  if (GT.ignoreMessages == 1) return;
  let callsign = newMessage.Callsign.replace("<", "").replace(">", "").trim();

  addLiveCallsign(
    newMessage.Grid,
    callsign,
    "-",
    Number(newMessage.SR),
    timeNowSec(),
    "Pwr:" + newMessage.Power + " Freq:" + formatMhz(Number(newMessage.Frequency / 1000)) + " Delta:" + Number(newMessage.DT).toFixed(2) + " Drift:" +
    newMessage.Drift,
    "WSPR",
    formatBand(Number(newMessage.Frequency / 1000000)),
    false,
    false,
    null,
    callsignToDxcc(callsign)
  );

  processCustomAlertMessage(callsign + " " + newMessage.Grid);

  updateCountStats();
}

function removeDazzleGrid()
{
  if (GT.dazzleTimeout)
  {
    nodeTimers.clearTimeout(GT.dazzleTimeout);
    GT.dazzleTimeout = null;
  }

  if (GT.dazzleGrid)
  {
    if (GT.layerSources.temp.hasFeature(GT.dazzleGrid)) { GT.layerSources.temp.removeFeature(GT.dazzleGrid); }
    GT.dazzleGrid = null;
  }
}

function dazzleGrid(LL)
{
  removeDazzleGrid();

  let borderWeight = 5;
  let bounds = [[LL.lo1, LL.la1], [LL.lo2, LL.la2]];

  GT.dazzleGrid = rectangle(bounds, "dazzle");

  const featureStyle = new ol.style.Style({
    stroke: new ol.style.Stroke({
      color: "#000",
      width: borderWeight,
      lineJoin: "round",
      lineDash: GT.flightPathLineDash,
      lineDashOffset: GT.flightPathTotal - GT.flightPathOffset
    }),
    zIndex: 60
  });

  GT.dazzleGrid.setStyle(featureStyle);

  GT.layerSources.temp.addFeature(GT.dazzleGrid);
  setAnimate(true);

  GT.dazzleTimeout = nodeTimers.setTimeout(removeDazzleGrid, 3000);
}

function showDxccGrids(grid)
{
  for (let x = 0; x < GT.gridToDXCC[grid].length; x++)
  {
    let dxcc = GT.dxccInfo[GT.gridToDXCC[grid][x]];
    let color = parseInt(GT.gridToDXCC[grid][x]);
    let boxColor = "hsl(" + (color*3.3) % 360 + " 100% 50% / 20%)";
    let borderColor = "#0000FFFF";
    let borderWeight = 0.1;

    for (let y = 0; y < dxcc.mh.length; y++ )
    {
      let LL = maidenheadToBounds(dxcc.mh[y]);
      let bounds = [
        [LL.lo1, LL.la1],
        [LL.lo2, LL.la2]
      ];

      GT.layerSources.temp.addFeature(gridFeature(
        dxcc.mh[y],
        rectangle(bounds),
        null,
        boxColor,
        borderColor,
        borderWeight
      ));
    }
  }
}

function centerOn(grid, dazzle = true)
{
  if (grid.length >= 4)
  {
    let LL = maidenheadToBounds(grid);

    if (dazzle) dazzleGrid(LL);

    GT.map
      .getView()
      .setCenter(
        ol.proj.fromLonLat([
          (LL.lo1 + LL.lo2) / 2,
          (LL.la1 + LL.la2) / 2
        ], GT.settings.map.projection)
      );
  }
}

function setCenterQTH()
{
  if (GT.settings.app.myGrid.length >= 4)
  {
    // Grab home QTH Gridsquare from Center QTH
    let LL = maidenheadToBounds(GT.settings.app.myGrid);

    GT.mapView
      .setCenter(
        ol.proj.fromLonLat([
          (LL.lo1 + LL.lo2) / 2,
          (LL.la1 + LL.la2) / 2
        ], GT.settings.map.projection)
      );

    GT.mapView.setRotation(0);
    GT.mapView.setZoom(4);
  }
}

function saveCenterGridsquare()
{
  let LL = squareToCenter(homeQTHInput.value);
  GT.settings.map.latitude = GT.myLat = LL.a;
  GT.settings.map.longitude = GT.myLon = LL.o;
  tryUpdateQTH(homeQTHInput.value);
  tryRecenterAEQD();
}

function tryUpdateQTH(grid)
{
  if (grid != GT.settings.app.myGrid)
  {
    let hash = GT.settings.app.myGrid;
    if (hash in GT.liveGrids)
    {
      GT.liveGrids[hash].rectangle.locked = false;
      delete GT.liveGrids[hash].rectangle.liveHash[hash];
      delete GT.liveCallsigns[hash];
    }

    homeQTHInput.value = GT.settings.app.myGrid = GT.settings.app.myRawGrid = grid;

    setHomeGridsquare();
    redrawGrids();
  }
}

function setCenterGridsquare()
{
  if (GT.settings.mapMemory[6].zoom != -1)
  {
    mapMemory(6, false);
    return;
  }

  setCenterQTH();
}

function changeLookupMerge()
{
  GT.settings.app.lookupMerge = lookupMerge.checked;
  GT.settings.app.lookupMissingGrid = lookupMissingGrid.checked;
  lookupMissingGridTr.style.display = GT.settings.app.lookupMerge ? "" : "none";
}

function changelookupOnTx()
{
  GT.settings.app.lookupOnTx = lookupOnTx.checked;
  GT.settings.app.lookupCloseLog = lookupCloseLog.checked;
}

function importSettings(contents)
{
  try {
    let data = JSON.parse(contents);
    if (data && "app" in data && "currentVersion" in data)
    {
      if (Number(data.currentVersion.substring(0,7)) < 2241005 )
      {
        importSettingsInfo.innerHTML = "<font style='color:orange;font-weight:bold'>Incompatible Version!</font>";
      }
      else
      {
        GT.settings = { };
        for (const key in data)
        {
          GT.settings[key] = data[key];
        }
        saveGridTrackerSettings();
        electron.ipcRenderer.sendSync("restartGridTracker2", false);
      }
    }
    else
    {
      importSettingsInfo.innerHTML = "<font style='color:orange;font-weight:bold'>File Corrupt!</font>";
    }
  }
  catch (e)
  {
    importSettingsInfo.innerHTML = "<font style='color:orange;font-weight:bold'>File Read!</font>";
  }
}

class CallsignSession {
    constructor(callObj) {
      this.grid = callObj.grid;
      this.cqz = callObj.cqz;
      this.ituz = callObj.ituz;
      this.band = callObj.band;
      this.time = callObj.time;
      this.dxcc = callObj.dxcc;
      this.geo = GT.dxccInfo[callObj.dxcc];
      this.DEcall = callObj.DEcall;
    }
}

function updateSessionCallsigns(callObj)
{
  const key = callObj.DEcall;
  const record = GT.sessionCallsigns.get(key); 

  if (record !== undefined) {
    if (record.grid != callObj.grid) {
      record.grid = callObj.grid;
      record.cqz = callObj.cqz;
      record.ituz = callObj.ituz;
    }
    record.band = callObj.band;
    record.time = callObj.time;
    
  } else {
    GT.sessionCallsigns.set(key, new CallsignSession(callObj));

    const currentCount = GT.sessionDXCCs.get(callObj.dxcc);
    if (currentCount !== undefined) {
        GT.sessionDXCCs.set(callObj.dxcc, currentCount + 1);
    } else {
        GT.sessionDXCCs.set(callObj.dxcc, 1);
    }
  }
}

function getSortedCallsigns() {
    const size = GT.sessionCallsigns.size;
    const sortedList = new Array(size); 
    
    let i = 0;
    // 2. Iterate using Map iterators (very fast in V8)
    for (const session of GT.sessionCallsigns.values()) {
        sortedList[i++] = session;
    }

    sortedList.sort((a, b) => b.time - a.time); 

    return sortedList;
}

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

function setStatsDiv(div, worker)
{
  if (GT.statsWindowInitialized)
  {
      const el = GT.statsWindowHandle.document.getElementById(div);
      if (el)
      {
        el.innerHTML = worker;                 
      }
  }
}

function setStatsDivHeight(div, heightWithPx)
{
  if (GT.statsWindowInitialized)
  {
    GT.statsWindowHandle.window[div].style.height = heightWithPx;
  }
}
function getStatsWindowHeight()
{
  if (GT.statsWindowInitialized)
  {
    return GT.statsWindowHandle.window.window.innerHeight - 63;
  }
  return 300;
}

function setLookupDiv(div, worker)
{
  if (GT.lookupWindowInitialized && typeof GT.lookupWindowHandle.window[div].innerHTML != "undefined")
  {
    GT.lookupWindowHandle.window[div].innerHTML = worker;
  }
}

function setLookupDivHeight(div, heightWithPx)
{
  if (GT.lookupWindowInitialized && typeof GT.lookupWindowHandle.window[div].style != "undefined")
  {
    GT.lookupWindowHandle.window[div].style.height = heightWithPx;
  }
}

function getLookupWindowHeight()
{
  if (GT.lookupWindowInitialized && typeof GT.lookupWindowHandle.window.window != "undefined")
  {
    return GT.lookupWindowHandle.window.window.innerHeight;
  }
  return 300;
}

function showConditionsBox(toggle = true)
{
  if (GT.settings.map.offlineMode == false)
  {
    if (toggle)
    {
      toggleConditionsBox();
    }
    else
    {
      openConditionsWindow(true);
    }
  }
}

function myCallCompare(a, b)
{
  return a.DEcall.localeCompare(b.DEcall);
}

function myGridCompare(a, b)
{
  return a.grid.localeCompare(b.grid);
}

function myModeCompare(a, b)
{
  return a.mode.localeCompare(b.mode);
}

function myDxccCompare(a, b)
{
  return GT.dxccToAltName[a.dxcc].localeCompare(GT.dxccToAltName[b.dxcc]);
}

function myDxccIntCompare(a, b)
{
  if (!(a in GT.dxccToAltName)) return 0;
  if (!(b in GT.dxccToAltName)) { return GT.dxccToAltName[a].localeCompare(GT.dxccToAltName[b]); }
}

function myTimeCompare(a, b)
{
  return a.time - b.time;
}

function myBandCompare(a, b)
{
  return a.band.localeCompare(b.band);
}

function myConfirmedCompare(a, b)
{
  if (a.confirmed && !b.confirmed) return 1;
  if (!a.confirmed && b.confirmed) return -1;
  return 0;
}

function myStateCompare(a, b)
{
  if (a.state && !b.state) return -1;
  if (!a.state && b.state) return 1;
  if (a.state > b.state) return 1;
  if (a.state < b.state) return -1;
  return 0;
}

function myCntyCompare(a, b)
{
  if (a.cnty && !b.cnty) return -1;
  if (!a.cnty && b.cnty) return 1;
  if (a.cnty > b.cnty) return 1;
  if (a.cnty < b.cnty) return -1;
  return 0;
}

function myPotaCompare(a, b)
{
  if (a.pota && !b.pota) return -1;
  if (!a.pota && b.pota) return 1;
  if (a.pota > b.pota) return 1;
  if (a.pota < b.pota) return -1;
  return 0;
}

function resetSearch()
{
  GT.lastSortIndex = 4;
  GT.qsoPages = 1;
  GT.qsoPage = 0;
  GT.lastSortType = 1;
  GT.searchWB = "";
  GT.gridSearch = "";
  GT.stateSearch = "";
  GT.cntySearch = "";
  GT.potaSearch = "";

  GT.filterBand = "Mixed";
  GT.filterMode = "Mixed";
  GT.filterDxcc = 0;
  GT.filterQSL = "All";

  GT.lastSearchSelection = null;
}

function renderLogbookByCall(callsign, event)
{
  event.preventDefault();

  resetSearch();
  GT.searchWB = callsign;
  if (event.shiftKey == true) GT.filterQSL = "true";
  openInfoTab("qsobox", "workedBoxDiv", renderLogbookView);
}

function renderLogbookSearchChanged(object, index)
{
  ValidateCallsign(object, null);
  GT.searchWB = object.value.toUpperCase();
  GT.lastSearchSelection = object.id;
  renderLogbookView(index, 0);
}

function renderLogbookSearchState(object, index)
{
  ValidateCallsign(object, null);
  GT.stateSearch = object.value.toUpperCase();
  GT.lastSearchSelection = object.id;
  renderLogbookView(index, 0);
}

function renderLogbookSearchCnty(object, index)
{
  ValidateCallsign(object, null);
  GT.cntySearch = object.value.toUpperCase();
  GT.lastSearchSelection = object.id;
  renderLogbookView(index, 0);
}

function renderLogbookSearchPOTA(object, index)
{
  ValidateCallsign(object, null);
  GT.potaSearch = object.value.toUpperCase();
  GT.lastSearchSelection = object.id;
  renderLogbookView(index, 0);
}

function renderLogbookSearchGrid(object, index)
{
  ValidateCallsign(object, null);
  GT.gridSearch = object.value.toUpperCase();
  GT.lastSearchSelection = object.id;
  renderLogbookView(index, 0);
}

function filterBandFunction(event, index)
{
  GT.filterBand = this.value;
  GT.lastSearchSelection = this.id;
  renderLogbookView(index, 0);
}

function filterModeFunction(event, index)
{
  GT.filterMode = this.value;
  GT.lastSearchSelection = this.id;
  renderLogbookView(index, 0);
}

function filterDxccFunction(event, index)
{
  GT.filterDxcc = this.value;
  GT.lastSearchSelection = this.id;
  renderLogbookView(index, 0);
}

function filterQSLFunction(event, index)
{
  GT.filterQSL = this.value;
  GT.lastSearchSelection = this.id;
  renderLogbookView(index, 0);
}

function changeZday(element)
{
  GT.Zday = element.checked;
  renderLogbookView();
}

function renderLogbookView(sortIndex = null, nextPage = 0)
{
  try
  {
    const myObjects = GT.QSOhash;
    const bands = {};
    const modes = {};
    const dxccs = {};
    const confSrcs = {};

    const perPage = GT.settings.app.qsoItemsPerPage;

    function startsWithCI(value, search)
    {
      return String(value).toLowerCase().startsWith(String(search).toLowerCase());
    }

    function includesCI(value, search)
    {
      return String(value).toLowerCase().includes(String(search).toLowerCase());
    }

    function matchesModeFilter(value)
    {
      if (GT.filterMode == "Mixed") return true;

      if (
        GT.filterMode == "Phone" &&
        value.mode in GT.modes_phone &&
        GT.modes_phone[value.mode]
      ) return true;

      if (
        GT.filterMode == "Digital" &&
        value.mode in GT.modes &&
        GT.modes[value.mode]
      ) return true;

      return value.mode == GT.filterMode;
    }

    function matchesQslFilter(value)
    {
      if (GT.filterQSL == "All") return true;

      if (GT.filterQSL == "false" || GT.filterQSL == "true")
      {
        return value.confirmed == (GT.filterQSL == "true");
      }

      return !!(value.confirmed && value.confSrcs && GT.filterQSL in value.confSrcs);
    }

    let mySort = sortIndex;

    if (mySort == null)
    {
      mySort = GT.lastSortIndex;
    }
    else
    {
      if (mySort == GT.lastSortIndex)
      {
        if (nextPage == 0) 
        {
          GT.lastSortType ^= 1;
          GT.qsoPage = 0;
        }
      }
      else
      {
        GT.lastSortType = 1;
        GT.qsoPage = 0;
      }
    }

    GT.lastSortIndex = mySort;

    const allList = Object.values(myObjects || {});
    let filtered = [];

    for (const value of allList)
    {
      if (GT.Zday && Math.floor(value.time / 86400) != GT.currentDay) continue;

      if (GT.searchWB.length > 0 && !includesCI(value.DEcall, GT.searchWB)) continue;

      if (GT.gridSearch.length > 0)
      {
        const x = startsWithCI(value.grid, GT.gridSearch);
        const y = Array.isArray(value.vucc_grids) &&
          value.vucc_grids.some(grid => startsWithCI(grid, GT.gridSearch));

        if (!x && !y) continue;
      }

      if (GT.stateSearch.length > 0)
      {
        if (!value.state || !includesCI(value.state, GT.stateSearch)) continue;
      }

      if (GT.cntySearch.length > 0)
      {
        if (!value.cnty) continue;
        if (!(value.cnty in GT.countyData)) continue;

        const countyName = GT.countyData[value.cnty].geo.properties.n;
        if (!includesCI(countyName, GT.cntySearch)) continue;
      }

      if (GT.potaSearch.length > 0)
      {
        if (!value.pota || !includesCI(value.pota, GT.potaSearch)) continue;
      }

      const pp = value.dxcc in GT.dxccInfo ? GT.dxccInfo[value.dxcc].pp : "?";
      bands[value.band] = value.band;
      modes[value.mode] = value.mode;
      dxccs[GT.dxccToAltName[value.dxcc] + " (" + pp + ")"] = value.dxcc;

      if (value.confirmed && value.confSrcs)
      {
        Object.assign(confSrcs, value.confSrcs);
      }

      if (GT.filterBand != "Mixed" && value.band != GT.filterBand) continue;
      if (!matchesModeFilter(value)) continue;
      if (GT.filterDxcc != 0 && value.dxcc != GT.filterDxcc) continue;
      if (!matchesQslFilter(value)) continue;

      filtered.push(value);
    }

    const sortFn = GT.sortFunction[GT.lastSortIndex];
    filtered.sort(function (a, b)
    {
      return (GT.lastSortType == 0) ? sortFn(a, b) : sortFn(b, a);
    });

    const ObjectCount = filtered.length;

    GT.qsoPages = Math.max(1, Math.ceil(ObjectCount / perPage));

    GT.qsoPage += (nextPage || 0);
    GT.qsoPage = ((GT.qsoPage % GT.qsoPages) + GT.qsoPages) % GT.qsoPages;

    const startIndex = GT.qsoPage * perPage;
    const endIndex = Math.min(startIndex + perPage, ObjectCount);

    const workHead = `<b> Entries (${ObjectCount})</b>` + 
      (GT.qsoPages > 1 ? `<br><font style='font-size:15px;' color='cyan' onClick='window.opener.renderLogbookView(${mySort}, -1);'>&#8678;&nbsp;</font> Page ${GT.qsoPage + 1} of ${GT.qsoPages} (${endIndex - startIndex}) <font style='font-size:16px;' color='cyan' onClick='window.opener.renderLogbookView(${mySort}, 1);'>&nbsp;&#8680;</font>` : "");

    setStatsDiv("workedHeadDiv", workHead);

    if (myObjects != null)
    {
      const clearBtn = (val, id, func) => val ? `<img title='Clear' onclick='${id}.value="";window.opener.${func}(${id});' src='img/trash_24x48.png' style='width:30px;margin:0px;padding:0px;margin-bottom:-4px;cursor:pointer;' />` : "";

      let tableHtml = `<table id='logTable' style='white-space:nowrap;overflow:auto;overflow-x:hidden;' class='darkTable' align=center>
        <tr>
          <th><input type='text' id='searchWB' style='margin:0px' class='inputTextValue' value='${GT.searchWB}' size='8' oninput='window.opener.renderLogbookSearchChanged(this);' />${clearBtn(GT.searchWB, "searchWB", "renderLogbookSearchChanged")}</th>
          <th><input type='text' id='searchGrid' style='margin:0px' class='inputTextValue' value='${GT.gridSearch}' size='6' oninput='window.opener.renderLogbookSearchGrid(this);' />${clearBtn(GT.gridSearch, "searchGrid", "renderLogbookSearchGrid")}</th>
          <th><div id='bandFilterDiv'></div></th>
          <th><div id='modeFilterDiv'></div></th>
          <th><div id='qslFilterDiv'></div></th>
          <th></th>
          <th></th>
          ${GT.filterDxcc !== 0 
            ? `<th style='border-right:none;'><div id='dxccFilterDiv'></div></th><th style='border-left:none;'><img title='Show All' onclick='window.opener.GT.filterDxcc=0;window.opener.renderLogbookView();' src='img/trash_24x48.png' style='width:30px;margin:0px;padding:0px;margin-bottom:-4px;cursor:pointer' /></th>`
            : `<th colspan='2'><div id='dxccFilterDiv'></div></th>`
          }
          <th><input type='text' id='searchState' style='margin:0px' class='inputTextValue' value='${GT.stateSearch}' size='3' oninput='window.opener.renderLogbookSearchState(this);' />${clearBtn(GT.stateSearch, "searchState", "renderLogbookSearchState")}</th>
          <th><input type='text' id='searchCnty' style='margin:0px' class='inputTextValue' value='${GT.cntySearch}' size='4' oninput='window.opener.renderLogbookSearchCnty(this);' />${clearBtn(GT.cntySearch, "searchCnty", "renderLogbookSearchCnty")}</th>
          ${GT.settings.app.potaFeatureEnabled ? `<th><input type='text' id='searchPOTA' style='margin:0px' class='inputTextValue' value='${GT.potaSearch}' size='4' oninput='window.opener.renderLogbookSearchPOTA(this);' />${clearBtn(GT.potaSearch, "searchPOTA", "renderLogbookSearchPOTA")}</th>` : ""}
          <th><label>${I18N("gt.Zday")}</label>&nbsp;<input type='checkbox' id='Zday' ${GT.Zday ? "checked" : ""} onclick='window.opener.changeZday(Zday)'/></th>
        </tr>
        <tr>
          <th style='cursor:pointer;' align=center onclick='window.opener.renderLogbookView(0);'>${I18N("gt.qsoPage.Station")}</th>
          <th style='cursor:pointer;' align=center onclick='window.opener.renderLogbookView(1);'>${I18N("gt.qsoPage.Grid")}</th>
          <th style='cursor:pointer;' align=center onclick='window.opener.renderLogbookView(5);'>${I18N("gt.qsoPage.Band")}</th>
          <th style='cursor:pointer;' align=center onclick='window.opener.renderLogbookView(2);'>${I18N("gt.qsoPage.Mode")}</th>
          <th style='cursor:pointer;' align=center onclick='window.opener.renderLogbookView(6);'>${I18N("gt.qsoPage.QSL")}</th>
          <th align=center>${I18N("gt.qsoPage.Sent")}</th>
          <th align=center>${I18N("gt.qsoPage.Rcvd")}</th>
          <th style='cursor:pointer;' align=center onclick='window.opener.renderLogbookView(3);'>${I18N("gt.qsoPage.DXCC")}</th>
          <th style='cursor:pointer;' align=center onclick='window.opener.renderLogbookView(3);'>${I18N("gt.qsoPage.Flag")}</th>
          <th style='cursor:pointer;' align=center onclick='window.opener.renderLogbookView(8);'>${I18N("roster.secondary.wanted.state")}</th>
          <th style='cursor:pointer;' align=center onclick='window.opener.renderLogbookView(9);'>${I18N("roster.secondary.wanted.county")}</th>
          ${GT.settings.app.potaFeatureEnabled ? `<th style='cursor:pointer;' align=center onclick='window.opener.renderLogbookView(7);'>POTA</th>` : ""}
          <th style='cursor:pointer;' align=center onclick='window.opener.renderLogbookView(4);'>${I18N("gt.qsoPage.When")}</th>
          ${GT.settings.callsignLookups.lotwUseEnable ? `<th>${I18N("gt.qsoPage.LoTW")}</th>` : ""}
          ${GT.settings.callsignLookups.eqslUseEnable ? `<th>${I18N("gt.qsoPage.eQSL")}</th>` : ""}
          ${GT.settings.callsignLookups.oqrsUseEnable ? `<th>${I18N("gt.qsoPage.OQRS")}</th>` : ""}
        </tr>`;

      // Build Data Rows via ultra-fast array mapping
      tableHtml += filtered.slice(startIndex, endIndex).map(key => {
        let confTitle = "", confTd = "";
        if (key.confirmed && key.confSrcs) {
          confTd = Object.keys(key.confSrcs).join("");
          confTitle = `title='${Object.keys(key.confSrcs).map(src => GT.confSrcNames[src]).join(", ")}'`;
        }

        let stateTd = key.state ? `<td align=center style='color:lightgreen' ${key.state in GT.StateData ? `title='${GT.StateData[key.state].name}'` : ""}>${key.state.substr(3)}</td>` : `<td></td>`;
        let cntyTd = (key.cnty && key.cnty in GT.countyData) ? `<td align=center style='color:cyan'>${GT.countyData[key.cnty].geo.properties.n}</td>` : `<td></td>`;
        let potaTd = GT.settings.app.potaFeatureEnabled ? (key.pota ? `<td align=center style='color:#fbb6fc'>${key.pota}</td>` : `<td></td>`) : "";

        let lotwTd = GT.settings.callsignLookups.lotwUseEnable ? `<td align=center>${key.DEcall in GT.lotwCallsigns ? "&#10004;" : ""}</td>` : "";
        let eqslTd = GT.settings.callsignLookups.eqslUseEnable ? `<td align=center>${key.DEcall in GT.eqslCallsigns ? "&#10004;" : ""}</td>` : "";
        let oqrsTd = "";
        
        if (GT.settings.callsignLookups.oqrsUseEnable) {
          oqrsTd = key.DEcall in GT.oqrsCallsigns 
            ? (key.confirmed ? `<td>&#10004;</td>` : `<td style='cursor:pointer;' align='left' onClick='window.opener.openSite("https://clublog.org/logsearch/logsearch.php?log=${key.DEcall}&call=${key.DXcall}&SubmitLogSearch=Show+contacts");'>&#10004; &#128236;</td>`)
            : `<td></td>`;
        }

        return `<tr align=left>
          <td style='color:#ff0;cursor:pointer' onclick='window.opener.startLookup("${key.DEcall}","${key.grid}");'>${formatCallsign(key.DEcall)}</td>
          <td style='color:cyan;'>${key.grid}${key.vucc_grids.length ? ", " + key.vucc_grids.join(", ") : ""}</td>
          <td style='color:lightgreen'>${key.band}</td>
          <td style='color:lightblue'>${key.mode}</td>
          <td align=left ${confTitle}>${confTd}</td>
          <td>${key.RSTsent}</td>
          <td>${key.RSTrecv}</td>
          <td style='color:orange'>${GT.dxccToAltName[key.dxcc]} <font color='lightgreen'>(${key.dxcc in GT.dxccInfo ? GT.dxccInfo[key.dxcc].pp : "?"})</font></td>
          <td align=center style='margin:0;padding:0'><img style='padding-top:4px' src='img/flags/16/${key.dxcc in GT.dxccInfo ? GT.dxccInfo[key.dxcc].flag : "_United Nations.png"}'></td>
          ${stateTd}
          ${cntyTd}
          ${potaTd}
          <td style='color:lightblue'>${userTimeString(key.time * 1000)}</td>
          ${lotwTd}
          ${eqslTd}
          ${oqrsTd}
        </tr>`;
      }).join("") + "</table>";

      setStatsDiv("workedListDiv", tableHtml);

      statsValidateCallByElement("searchWB");
      statsValidateCallByElement("searchGrid");
      statsValidateCallByElement("searchState");
      statsValidateCallByElement("searchCnty");
      if (GT.settings.app.potaFeatureEnabled) statsValidateCallByElement("searchPOTA");

      let newSelect = document.createElement("select");
      newSelect.id = "bandFilter";
      newSelect.title = "Band Filter";

      let option = document.createElement("option");
      option.value = "Mixed";
      option.text = "Mixed";
      newSelect.appendChild(option);

      Object.keys(bands)
        .sort(function (a, b)
        {
          return parseInt(a) - parseInt(b);
        })
        .forEach(function (key)
        {
          const option = document.createElement("option");
          option.value = key;
          option.text = key;
          newSelect.appendChild(option);
        });

      statsAppendChild("bandFilterDiv", newSelect, "filterBandFunction", GT.filterBand, true);

      newSelect = document.createElement("select");
      newSelect.id = "modeFilter";
      newSelect.title = "Mode Filter";

      option = document.createElement("option");
      option.value = "Mixed";
      option.text = "Mixed";
      newSelect.appendChild(option);

      option = document.createElement("option");
      option.value = "Phone";
      option.text = "Phone";
      newSelect.appendChild(option);

      option = document.createElement("option");
      option.value = "Digital";
      option.text = "Digital";
      newSelect.appendChild(option);

      Object.keys(modes)
        .sort()
        .forEach(function (key)
        {
          const option = document.createElement("option");
          option.value = key;
          option.text = key;
          newSelect.appendChild(option);
        });

      statsAppendChild("modeFilterDiv", newSelect, "filterModeFunction", GT.filterMode, true);

      newSelect = document.createElement("select");
      newSelect.id = "dxccFilter";
      newSelect.title = "DXCC Filter";

      option = document.createElement("option");
      option.value = 0;
      option.text = "All";
      newSelect.appendChild(option);

      Object.keys(dxccs)
        .sort()
        .forEach(function (key)
        {
          const option = document.createElement("option");
          option.value = dxccs[key];
          option.text = key;
          newSelect.appendChild(option);
        });

      statsAppendChild("dxccFilterDiv", newSelect, "filterDxccFunction", GT.filterDxcc, true);

      newSelect = document.createElement("select");
      newSelect.id = "qslFilter";
      newSelect.title = "QSL Filter";

      option = document.createElement("option");
      option.value = "All";
      option.text = "All";
      newSelect.appendChild(option);

      option = document.createElement("option");
      option.value = true;
      option.text = "Yes";
      newSelect.appendChild(option);

      option = document.createElement("option");
      option.value = false;
      option.text = "No";
      newSelect.appendChild(option);

      Object.keys(confSrcs).forEach(function (key)
      {
        const option = document.createElement("option");
        option.value = key;
        option.text = GT.confSrcNames[key];
        newSelect.appendChild(option);
      });

      statsAppendChild("qslFilterDiv", newSelect, "filterQSLFunction", GT.filterQSL, true);

      statsFocus(GT.lastSearchSelection);
      setStatsDivHeight("workedListDiv", getStatsWindowHeight() - 6 + "px");
    }
    else
    {
      setStatsDiv("workedListDiv", "None");
    }
  }
  catch (e)
  {
    console.error(e);
  }
}
''
function statsValidateCallByElement(elementString)
{
  if (GT.statsWindowInitialized)
  {
    GT.statsWindowHandle.window.validateCallByElement(elementString);
  }
}

function statsFocus(selection)
{
  if (GT.statsWindowInitialized)
  {
    GT.statsWindowHandle.window.statsFocus(selection);
  }
}

function lookupValidateCallByElement(elementString)
{
  if (GT.lookupWindowInitialized && typeof GT.lookupWindowHandle.window.validateCallByElement != "undefined")
  {
    GT.lookupWindowHandle.window.validateCallByElement(elementString);
  }
}

function statsAppendChild(elementString, object, onInputString, defaultValue)
{
  if (GT.statsWindowInitialized)
  {
    GT.statsWindowHandle.window.appendToChild(
      elementString,
      object,
      onInputString,
      defaultValue
    );
  }
}

function searchWorked(dxcc, band, mode)
{
  resetSearch();
  GT.filterDxcc = dxcc;
  if (band.length > 0)
  {
    GT.filterBand = band;
  }
  if (mode.length > 0)
  {
    GT.filterMode = mode;
  }
  renderLogbookView();
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

  html.push("<div style='vertical-align:top;display:inline-block;margin-right:8px;overflow:auto;overflow-x:hidden;color:cyan;'><b>" + I18N("gt.WASWACBox.WAS") + "</b><br>");
  html.push(displayItemList(GT.wasZones, "#00DDDD"));
  html.push("</div>");

  html.push("<div style='vertical-align:top;display:inline-block;margin-right:8px;overflow:auto;overflow-x:hidden;color:cyan;'><b>" + I18N("gt.WASWACBox.WACP") + "</b><br>");
  html.push(displayItemList(GT.wacpZones, "#FFA500"));
  html.push("</div>");

  html.push("<div style='vertical-align:top;display:inline-block;margin-right:8px;overflow:auto;overflow-x:hidden;color:cyan;'><b>" + I18N("gt.viewInfo.us48Data") + "</b><br>");
  html.push(displayItemList(GT.us48Data, "#DDDD00"));
  html.push("</div>");

  setStatsDiv("wasPlusListDiv", html.join(""));
}

function displayItemList(table, color)
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
      if (item.confirmed === true)
      {
        style = confirmedStyle;
      }
      else if (item.worked === true)
      {
        style = workedStyle;
      }
      else
      {
        style = neededStyle;
      }

      rows.push("<tr><td align='left' style='" + style + "'>" + name + "</td></tr>");
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

function showSettingsBox()
{
  if (rootSettingsDiv.style.display == "inline-block")
  {
    rootSettingsDiv.style.display = "none";
  }
  else
  {
    helpDiv.style.display = "none";
    GT.helpShow = false;
    rootSettingsDiv.style.display = "inline-block";
  }
}

function toggleBaWindow()
{
  if (GT.baWindowHandle == null)
  {
    openBaWindow(true);
  }
  else
  {
    electron.ipcRenderer.send("toggleWin", "gt_bandactivity");
  }
}

function openBaWindow(show = true)
{
  if (GT.baWindowHandle == null)
  {
    GT.baWindowHandle = window.open("gt_bandactivity.html","gt_bandactivity");
  }
  else if (GT.baWindowInitialized)
  {
    show ? electron.ipcRenderer.send("showWin", "gt_bandactivity") : electron.ipcRenderer.send("hideWin", "gt_bandactivity");
  }
}

function openAlertWindow(show = true)
{
  if (GT.alertWindowHandle == null)
  {
    GT.alertWindowHandle = window.open("gt_alert.html", "gt_alert");
  }
  else if (GT.alertWindowInitialized)
  {
    show ? electron.ipcRenderer.send("showWin", "gt_alert") : electron.ipcRenderer.send("hideWin", "gt_alert");
  }
}

function openLookupWindow(show = false)
{
  if (GT.settings.map.offlineMode == true) return;

  if (GT.lookupWindowHandle == null)
  {
    GT.lookupWindowHandle = window.open("gt_lookup.html","gt_lookup");
  }
  else if (GT.lookupWindowInitialized == true)
  {
    show ? electron.ipcRenderer.send("showWin", "gt_lookup") : electron.ipcRenderer.send("hideWin", "gt_lookup");
  }
}

function toggleLookupWindow(toggle = true)
{
  if (GT.lookupWindowInitialized == true)
  {
    if (toggle)
    {
      electron.ipcRenderer.send("toggleWin", "gt_lookup");
    }
    else
    {
      electron.ipcRenderer.send("showWin", "gt_lookup");
    }
  }
}

function openInfoTab(evt, tabName, callFunc, callObj)
{
  openStatsWindow();

  if (GT.statsWindowInitialized)
  {
    // Declare all variables
    let i, infoTabcontent, infoTablinks;
    // Get all elements with class="infoTabcontent" and hide them
    infoTabcontent = GT.statsWindowHandle.window.document.getElementsByClassName(
      "infoTabcontent"
    );
    for (i = 0; i < infoTabcontent.length; i++)
    {
      infoTabcontent[i].style.display = "none";
    }
    // Get all elements with class="infoTablinks" and remove the class "active"
    infoTablinks = GT.statsWindowHandle.window.document.getElementsByClassName(
      "infoTablinks"
    );
    for (i = 0; i < infoTablinks.length; i++)
    {
      infoTablinks[i].className = infoTablinks[i].className.replace(
        " active",
        ""
      );
    }
    // Show the current tab, and add an "active" class to the button that opened the tab

    GT.statsWindowHandle.window.document.getElementById(tabName).style.display = "block";

    if (evt)
    {
      evt = GT.statsWindowHandle.window.document.getElementById(evt);
    }
    if (evt)
    {
      if (typeof evt.currentTarget != "undefined")
      {
        evt.currentTarget.className += " active";
      }
      else
      {
        evt.className += " active";
      }
    }

    if (callFunc)
    {
      if (callObj) callFunc(callObj);
      else callFunc();
    }
  }
}

function openAboutBox()
{
  openSettingsTab(aboutbut, 'aboutDiv');
  helpDiv.style.display = "none";
  GT.helpShow = false;
  rootSettingsDiv.style.display = "inline-block";
}

function openLogbookSettings()
{
  openSettingsTab(logbut, 'logbookSettingsDiv');
  helpDiv.style.display = "none";
  GT.helpShow = false;
  rootSettingsDiv.style.display = "inline-block";
}

function openAudioAlertSettings()
{
  openSettingsTab(audioalertbut, 'audioAlertsDiv');
  helpDiv.style.display = "none";
  GT.helpShow = false;
  rootSettingsDiv.style.display = "inline-block";
  electron.ipcRenderer.send("showWin", "GridTracker2")
}

function openSettingsTab(evt, tabName)
{
  // Declare all variables
  let i, settingsTabcontent, settingsTablinks;
  // Get all elements with class="settingsTabcontent" and hide them
  settingsTabcontent = document.getElementsByClassName("settingsTabcontent");
  for (i = 0; i < settingsTabcontent.length; i++)
  {
    settingsTabcontent[i].style.display = "none";
  }
  // Get all elements with class="settingsTablinks" and remove the class "active"
  settingsTablinks = document.getElementsByClassName("settingsTablinks");
  for (i = 0; i < settingsTablinks.length; i++)
  {
    settingsTablinks[i].className = settingsTablinks[i].className.replace(
      " active",
      ""
    );
  }
  displayCustomAlerts();
  // Show the current tab, and add an "active" class to the button that opened the tab
  document.getElementById(tabName).style.display = "";
  if (typeof evt.currentTarget != "undefined") { evt.currentTarget.className += " active"; }
  else evt.className += " active";
}

function toggleGridMode()
{
  GT.settings.app.sixWideMode ^= 1;
  modeImg.src = GT.maidenheadModeImageArray[GT.settings.app.sixWideMode];
  clearTempGrids();
  redrawGrids();
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
    
    const wModeMixed = wModes.Mixed;
    wTypes.Mixed = wModeMixed === undefined ? 1 : wModeMixed + 1;

    const wModeTypeVal = wModes[type];
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
  // cut off 'm' from 80m or 70cm
  let metersA = a.slice(0, -1);
  let metersB = b.slice(0, -1);

  // if last letter is c we have a centimeter band, multiply value with 0.01
  if (metersA.slice(-1) == "c")
  {
    metersA = 0.01 * parseInt(metersA);
  }
  else
  {
    metersA = parseInt(metersA);
  }
  if (metersB.slice(-1) == "c")
  {
    metersB = 0.01 * parseInt(metersB);
  }
  else
  {
    metersA = parseInt(metersA);
  }
  if (metersA > metersB) return 1;
  if (metersB > metersA) return -1;
  return 0;
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

function validatePropMode(propMode)
{
  if (GT.settings.app.gtPropFilter == "mixed") return true;

  return GT.settings.app.gtPropFilter == propMode;
}

function validateMapBandAndMode(band, mode) {
  const app = GT.settings.app; // Cache reference
  const bandFilter = app.gtBandFilter;
  
  if (bandFilter.length === 0 || (bandFilter === "auto" ? app.myBand === band : bandFilter === band)) {
    const modeFilter = app.gtModeFilter;
    
    if (modeFilter.length === 0) return true;
    if (modeFilter === "auto") return app.myMode === mode;
    if (modeFilter === "Digital") return !!GT.modes[mode];       // Fast boolean cast
    if (modeFilter === "Phone") return !!GT.modes_phone[mode];   // Fast boolean cast
    if (modeFilter === "CW") return mode === "CW";
    
    return modeFilter === mode;
  }
  return false;
}

function redrawLiveGrids(honorAge = true)
{
  const callKeys = Object.keys(GT.liveCallsigns);
  for (let idx = 0; idx < callKeys.length; idx++)
  {
    const i = callKeys[idx];
    const call = GT.liveCallsigns[i];
    if (GT.settings.app.gridViewMode != 2 && validateMapBandAndMode(call.band, call.mode) && (honorAge == false || (honorAge == true && GT.timeNow - call.age <= gridDecay.value)))
    {
      qthToBox(call.grid, call.DEcall, false, false, call.DXcall, call.band, call.wspr, i, false);
    }
  }
  
  if (honorAge == false)
  {
    const gridKeys = Object.keys(GT.liveGrids);
    for (let idx = 0; idx < gridKeys.length; idx++)
    {
      GT.liveGrids[gridKeys[idx]].age = GT.timeNow;
    }
  }
  else
  {
    dimGridsquare();
  }
}

// Optimized for V8, it's ugly, but it's fast
function updateZoneStats(zoneDict, zoneName, worked, didConfirm, band, mode) {
  const entry = zoneDict[zoneName];
  if (entry === undefined) {
    return;
  }

  if (worked === true) {
    entry.worked = true;
    const wBands = entry.worked_bands;
    const wModes = entry.worked_modes;

    const wBandVal = wBands[band];
    wBands[band] = wBandVal === undefined ? 1 : wBandVal + 1;

    const wModeVal = wModes[mode];
    wModes[mode] = wModeVal === undefined ? 1 : wModeVal + 1;
  }

  if (didConfirm === true) {
    entry.confirmed = true;

    const cBands = entry.confirmed_bands;
    const cModes = entry.confirmed_modes;

    const cBandVal = cBands[band];
    cBands[band] = cBandVal === undefined ? 1 : cBandVal + 1;

    const cModeVal = cModes[mode];
    cModes[mode] = cModeVal === undefined ? 1 : cModeVal + 1;
  }
}

function redrawGrids()
{
  if (GT.settings.app.gridViewMode == 2) removePaths();
  clearGrids();
  clearQsoGrids();

  GT.QSLcount = 0;
  GT.QSOcount = 0;

  for (const [i, qsoObj] of Object.entries(GT.QSOhash))
  {
    
    let finalGrid = qsoObj.grid;
    let worked = qsoObj.worked;
    let didConfirm = qsoObj.confirmed;
    let band = qsoObj.band;
    let mode = qsoObj.mode;
    
    GT.QSOcount++;
    if (didConfirm) GT.QSLcount++;

    if (validateMapBandAndMode(band, mode) && validatePropMode(qsoObj.propMode))
    {
      if (GT.settings.app.gridViewMode > 1)
      {
        if (finalGrid.length > 0)
        {
          qthToQsoBox(finalGrid, i, false, qsoObj.DXcall, worked, didConfirm, band);
        }
        for (let vuccIdx = 0; vuccIdx < qsoObj.vucc_grids.length; vuccIdx++)
        {
          qthToQsoBox(qsoObj.vucc_grids[vuccIdx], i, false, qsoObj.DXcall, worked, didConfirm, band);
        }
      }

      let state = qsoObj.state;
      let cont = qsoObj.cont;
      let finalDxcc = qsoObj.dxcc;
      let cnty = qsoObj.cnty;
      let ituz = qsoObj.ituz;
      let cqz = qsoObj.cqz;

      updateZoneStats(GT.dxccInfo, finalDxcc, worked, didConfirm, band, mode);

      if (state != null && isKnownCallsignDXCC(finalDxcc) && state in GT.StateData) 
      {
        if (state in GT.wasZones) updateZoneStats(GT.wasZones, state, worked, didConfirm, band, mode);
        else if (state in GT.wacpZones) updateZoneStats(GT.wacpZones, state, worked, didConfirm, band, mode);
      }

      if (cnty != null && cnty in GT.cntyToCounty) updateZoneStats(GT.countyData, cnty, worked, didConfirm, band, mode);
      if (cont != null && cont in GT.shapeData) updateZoneStats(GT.wacZones, GT.shapeData[cont].properties.name, worked, didConfirm, band, mode);
      if (cqz && cqz.length > 0) updateZoneStats(GT.cqZones, cqz, worked, didConfirm, band, mode);
      if (ituz && ituz.length > 0) updateZoneStats(GT.ituZones, ituz, worked, didConfirm, band, mode);
      if (finalGrid.length > 0) updateZoneStats(GT.us48Data, finalGrid.substr(0, 4), worked, didConfirm, band, mode);
      for (let vIdx = 0; vIdx < qsoObj.vucc_grids.length; vIdx++) updateZoneStats(GT.us48Data, qsoObj.vucc_grids[vIdx].substr(0, 4), worked, didConfirm, band, mode);
    }
  }

  const viewKeys = Object.keys(GT.viewInfo);
  for (let vIdx = 0; vIdx < viewKeys.length; vIdx++)
  {
    let layer = viewKeys[vIdx];
    let search = GT[GT.viewInfo[layer][0]];
    let worked = 0;
    let confirmed = 0;
    
    const searchKeys = Object.keys(search);

    if (layer == 0)
    {
      for (let sIdx = 0; sIdx < searchKeys.length; sIdx++)
      {
        const key = searchKeys[sIdx];
        if (search[key].rectangle.worked) worked++;
        if (search[key].rectangle.confirmed) confirmed++;
      }
    }
    else if (layer == 5)
    {
      for (let sIdx = 0; sIdx < searchKeys.length; sIdx++)
      {
        const key = searchKeys[sIdx];
        if (search[key].geo != "deleted")
        {
          if (search[key].worked) worked++;
          if (search[key].confirmed) confirmed++;
        }
      }
    }
    else
    {
      for (let sIdx = 0; sIdx < searchKeys.length; sIdx++)
      {
        const key = searchKeys[sIdx];
        if (search[key].worked) worked++;
        if (search[key].confirmed) confirmed++;
      }
    }
    GT.viewInfo[layer][2] = worked;
    GT.viewInfo[layer][3] = confirmed;
  }

  redrawLiveGrids(false);
  reloadInfo();
  setHomeGridsquare();
  setTrophyOverlay(GT.currentOverlay);
  updateCountStats();
  redrawParks();
}

function toggleAlertMute()
{
  GT.settings.audio.alertMute ^= 1;
  alertMuteImg.src = GT.alertImageArray[GT.settings.audio.alertMute];
  if (GT.settings.audio.alertMute == 1 ) {
    if (GT.audioPool) {
      GT.audioPool.forEach(player => { player.pause(); player.currentTime = 0; });
    }
    if( GT.speechAvailable)
    {
      window.speechSynthesis.cancel();
    }
  }
}

function togglePushPinMode()
{
  GT.pushPinMode = !GT.pushPinMode;
  GT.settings.app.pushPinMode = GT.pushPinMode;
  pinImg.src = GT.pinImageArray[GT.pushPinMode == false ? 0 : 1];

  gridModeDiv.style.display = GT.pushPinMode ? "" : "none";

  clearTempGrids();
  redrawGrids();
}

function changeOffAirServicesEnable()
{
  GT.settings.app.offAirServicesEnable = offAirServicesEnable.checked;
  updateOffAirServicesViews();
}

function updateOffAirServicesViews()
{
  offAirServicesTr.style.display = GT.settings.map.offlineMode == true ? "none" : "";
  updateGTFlagViews();
  setMsgSettingsView();
  updateBandActivityViews();
  updateSpottingViews();
  setVisualHunting();
  goProcessRoster();
}

function updateBandActivityViews()
{
  if (GT.settings.map.offlineMode == true || GT.settings.app.offAirServicesEnable == false)
  {
    bandActivityEnableTr.style.display = "none";
  }
  else
  {
    bandActivityEnableTr.style.display = "";
  }

  if (GT.settings.map.offlineMode == true || GT.settings.app.offAirServicesEnable == false || GT.settings.app.oamsBandActivity == false )
  {
    GT.oamsBandActivityData = null;
    bandActivityNeighborTr.style.display = "none";
    bandActivityDiv.style.display = "none";
    openBaWindow(false);
  }
  else
  {
    bandActivityNeighborTr.style.display = "";
    bandActivityDiv.style.display = "";
    oamsBandActivityCheck();
  }

  renderBandActivity();
}

function updateGTFlagViews()
{
  if (GT.settings.app.offAirServicesEnable == true && GT.settings.map.offlineMode == false)
  {
    gtFlagButton.style.display = "";
    if (GT.settings.app.gtFlagImgSrc > 0)
    {
      GT.layerVectors.gtflags.setVisible(true);
    }
    else
    {
      GT.layerVectors.gtflags.setVisible(false);
    }
  }
  else
  {
    gtFlagButton.style.display = "none";

    GT.layerVectors.gtflags.setVisible(false);
    clearGtFlags();
    // Clear list
    GT.gtFlagPins = {};
    GT.gtCallsigns = {};

    conditionsButton.style.background = "";
    conditionsButton.innerHTML = "<img src=\"img/conditions.png\" class=\"buttonImg\" />";

  }

  offAirServicesEnable.checked = GT.settings.app.offAirServicesEnable;
}

function setMulticastIp()
{
  GT.settings.app.wsjtIP = multicastIpInput.value;
}

function setMulticastEnable(checkbox)
{
  if (checkbox.checked == true)
  {
    multicastTD.style.display = "";
    if (ValidateMulticast(multicastIpInput))
    {
      GT.settings.app.wsjtIP = multicastIpInput.value;
    }
    else
    {
      GT.settings.app.wsjtIP = "";
    }
  }
  else
  {
    multicastTD.style.display = "none";
    GT.settings.app.wsjtIP = "";
  }
  GT.settings.app.multicast = checkbox.checked;

  setAdifBroadcastEnable(adifBroadcastEnable);
}

function setAdifBroadcastMulticast(checkbox)
{
  if (checkbox.checked == true)
  {
    adifBroadcastIpTD.style.display = "";
    if (ValidateMulticast(adifBroadcastIP))
    {
      GT.settings.app.adifBroadcastIP = adifBroadcastIP.value;
    }
    else
    {
      GT.settings.app.adifBroadcastIP = "";
    }
  }
  else
  {
    adifBroadcastIpTD.style.display = "none";
    GT.settings.app.adifBroadcastIP = "";
  }
  GT.settings.app.adifBroadcastMulticast = checkbox.checked;

  setAdifBroadcastEnable(adifBroadcastEnable);
}

function setAdifBroadcastIp()
{
  GT.settings.app.adifBroadcastIP = adifBroadcastIP.value;
  setAdifBroadcastEnable(adifBroadcastEnable);
}

function setAdifBroadcastPort()
{
  GT.settings.app.adifBroadcastPort = Number(adifBroadcastPort.value);
  setAdifBroadcastEnable(adifBroadcastEnable);
}

function setAdifBroadcastEnable(checkbox)
{
  if (checkbox.checked)
  {
    if (ValidatePort(adifBroadcastPort, null, CheckAdifBroadcastPortIsNotReceivePort))
    {
      if (GT.settings.app.adifBroadcastMulticast)
      {
        checkbox.checked = ValidateMulticast(adifBroadcastIP);
      }
      GT.settings.app.adifBroadcastEnable = checkbox.checked;
      return;
    }
  }

  GT.settings.app.adifBroadcastEnable = checkbox.checked = false;
}

function setUdpForwardEnable(checkbox)
{
  if (checkbox.checked)
  {
    if (ValidatePort(udpForwardPortInput, null, CheckForwardPortIsNotReceivePort) && ValidateIPaddresses(udpForwardIpInput, null))
    {
      GT.settings.app.wsjtForwardUdpEnable = checkbox.checked;
      return;
    }
  }
  checkbox.checked = false;
  GT.settings.app.wsjtForwardUdpEnable = checkbox.checked;
}

function setSpottingEnable()
{
  GT.settings.app.spottingEnable = spottingEnable.checked;

  if (GT.settings.app.spottingEnable == false)
  {
    GT.spotCollector = {};
    GT.decodeCollector = {};
  }
  GT.gtLiveStatusUpdate = true;
  updateSpottingViews();
}

function setOamsBandActivity(checkbox)
{
  GT.settings.app.oamsBandActivity = checkbox.checked;
  updateBandActivityViews();

}

function setOamsBandActivityNeighbors(checkbox)
{
  GT.settings.app.oamsBandActivityNeighbors = checkbox.checked;
  oamsBandActivityCheck();
}

function setOamsSimplepush(checkbox)
{
  GT.settings.msg.msgSimplepush = checkbox.checked;
  simplePushDiv.style.display = GT.settings.msg.msgSimplepush == true ? "" : "none";
}


function setOamsPushover(checkbox)
{
  GT.settings.msg.msgPushover = checkbox.checked;
  pushOverDiv.style.display = GT.settings.msg.msgPushover == true ? "" : "none";
}

function newMessageSetting(whichSetting)
{
  if (whichSetting.id in GT.settings.msg && whichSetting.value != "none")
  {
    GT.settings.msg[whichSetting.id] = whichSetting.value;
    setMsgSettingsView();
  }
}


function renderBandActivity()
{
  if (GT.settings.app.oamsBandActivity == false) return;

  let buffer = [];
  if (typeof GT.settings.bandActivity.lines[GT.settings.app.myMode] != "undefined" || GT.oamsBandActivityData != null)
  {
    let lines = (GT.settings.app.myMode in GT.settings.bandActivity.lines) ? GT.settings.bandActivity.lines[GT.settings.app.myMode] : [];
    let bands = (GT.myDXCC in GT.callsignDatabaseUSplus) ? GT.us_bands : GT.non_us_bands;
    let bandData = {};
    let maxValue = 0;

    for (let i = 0; i < bands.length; i++)
    {
      bandData[bands[i]] = { pskScore: 0, pskSpots: 0, pskTx: 0, pskRx: 0, oamsRxSpots: 0, oamsTxSpots: 0, oamsTx: 0, oamsRx: 0, oamsDecodes: 0, oamsScore: 0 };
    }

    for (let x = 0; x < lines.length; x++)
    {
      let firstChar = lines[x].charCodeAt(0);
      if (firstChar != 35 && lines[x].length > 1)
      {
        // doesn't begins with # and has something
        let values = lines[x].trim().split(" ");
        let band = formatBand(Number(Number(values[0]) / 1000000));

        if (band in bandData)
        {
          let place = bandData[band];

          place.pskScore += Number(values[1]);
          place.pskSpots += Number(values[2]);
          place.pskTx += Number(values[3]);
          place.pskRx += Number(values[4]);
          if (maxValue < place.pskScore) maxValue = place.pskScore;
          if (maxValue < place.pskSpots) maxValue = place.pskSpots;
        }
      }
    }

    if (GT.settings.app.offAirServicesEnable == true && GT.settings.app.oamsBandActivity == true && GT.oamsBandActivityData)
    {
      for (const grid in GT.oamsBandActivityData)
      {
        for (const band in GT.oamsBandActivityData[grid])
        {
          if (band in bandData)
          {
            let place = bandData[band];
            let data = GT.oamsBandActivityData[grid][band];

            place.oamsScore ??= 0;
            place.oamsDecodes += data.d;
            place.oamsRxSpots += data.rS;
            place.oamsTxSpots += data.tS;
            place.oamsTx += data.t;
            place.oamsRx += data.r;

            if (data.r > 0)
            {
              place.oamsScore += parseInt((data.d > data.rS) ? (data.d / data.r) + (data.t > 0 ? data.tS / data.t : 0) : (data.rS / data.r) + (data.t > 0 ? data.tS / data.t : 0));
            }
            else
            {
              place.oamsScore += parseInt(data.t > 0 ? data.tS / data.t : 0);
            }
            if (maxValue < place.oamsScore) maxValue = place.oamsScore;
          }
        }
      }
    }

    let scaleFactor = 1.0;
    if (maxValue > 26)
    {
      scaleFactor = 26 / maxValue;
    }
    for (const band in bandData)
    {
      let blockMyBand = (band == GT.settings.app.myBand) ? " class='myBand' " : "";
      let title = [];
      let blueBarValue;

      if (GT.settings.app.offAirServicesEnable == true && GT.settings.app.oamsBandActivity == true)
      {
        title.push("OAMS (blue)\n");
        title.push("\tScore: " + bandData[band].oamsScore + "\n\tDecodes: " + bandData[band].oamsDecodes + "\n\tTX-Spots: " + bandData[band].oamsTxSpots + "\n\tRX-Spots: " + bandData[band].oamsRxSpots + "\n\tTx: " + bandData[band].oamsTx + "\tRx: " + bandData[band].oamsRx);
        title.push("\nPSK-Reporter (red)\n");
        title.push("\tScore: " + bandData[band].pskScore + "\n\tSpots: " + bandData[band].pskSpots + "\n\tTx: " + bandData[band].pskTx + "\tRx: " + bandData[band].pskRx);
        blueBarValue = (bandData[band].oamsScore * scaleFactor + 1);
      }
      else
      {
        title = ["Score: " + bandData[band].pskScore + "\nSpots: " + bandData[band].pskSpots + "\nTx: " + bandData[band].pskTx + "\tRx: " + bandData[band].pskRx];
        blueBarValue = (bandData[band].pskSpots * scaleFactor + 1);
      }

      buffer.push("<div title='" + title.join("") + "' style='display:inline-block;margin:1px;' class='aBand'>");
      buffer.push("<div style='height: " + blueBarValue + "px;' class='barRx'></div>");
      buffer.push("<div style='height: " + (bandData[band].pskScore * scaleFactor + 1) + "px;' class='barTx'></div>"); 
      buffer.push("<div style='font-size:10px' " + blockMyBand + ">" + parseInt(band) + "</div>");
      buffer.push("</div>");
    }
  }
  else
  {
    buffer = ["..no data yet.."];
  }
  graphDiv.innerHTML = buffer.join("");
  if (GT.baWindowInitialized == true)
  {
    GT.baWindowHandle.window.graphDiv.innerHTML = buffer.join("");
  }
}

function pskBandActivityCallback(buffer, flag)
{
  let result = String(buffer);
  if (result.indexOf("frequency score") > -1)
  {
    // looks good so far
    GT.settings.bandActivity.lines[GT.settings.app.myMode] = result.split("\n");
    GT.settings.bandActivity.lastUpdate[GT.settings.app.myMode] = GT.timeNow + 600;
  }

  renderBandActivity();
}

function pskGetBandActivity()
{
  if (GT.settings.map.offlineMode == true || GT.settings.map.offAirServicesEnable == false || GT.settings.map.oamsBandActivity == false) return;
  
  if (typeof GT.settings.bandActivity.lastUpdate[GT.settings.app.myMode] == "undefined")
  {
    GT.settings.bandActivity.lastUpdate[GT.settings.app.myMode] = 0;
  }

  if (GT.settings.app.myMode.length > 0 && GT.settings.app.myGrid.length > 0 && GT.timeNow > GT.settings.bandActivity.lastUpdate[GT.settings.app.myMode])
  {
    getBuffer(
      "https://pskreporter.info/cgi-bin/psk-freq.pl?mode=" + GT.settings.app.myMode + "&grid=" + GT.settings.app.myGrid.substr(0, 4) + "&cb=" + timeNowSec(),
      pskBandActivityCallback,
      null,
      "https",
      443
    );
  }

  renderBandActivity();

  if (GT.pskBandActivityTimerHandle != null)
  {
    nodeTimers.clearInterval(GT.pskBandActivityTimerHandle);
  }

  GT.pskBandActivityTimerHandle = nodeTimers.setInterval(pskGetBandActivity, 601000); // every 20 minutes, 1 second
}

function getIniFromApp(appName)
{
  let result = {};
  result.port = -1;
  result.ip = "";
  result.MyCall = "NOCALL";
  result.MyGrid = "";
  result.MyBand = "";
  result.MyMode = "";

  result.N1MMServer = "";
  result.N1MMServerPort = 0;
  result.BroadcastToN1MM = false;
  result.appName = appName;
  let wsjtxCfgPath = "";

  let appData = electron.ipcRenderer.sendSync("getPath","appData");

  if (GT.platform == "windows")
  {
    let basename = path.basename(appData);
    if (basename != "Local")
    {
      appData = appData.replace(basename, "Local");
    }

    wsjtxCfgPath = path.join(appData, appName, appName + ".ini");
  }
  else if (GT.platform == "mac")
  {
    wsjtxCfgPath =  path.join(process.env.HOME, "Library/Preferences/WSJT-X.ini");
  }
  else
  {
    wsjtxCfgPath = path.join(process.env.HOME, ".config/" + appName + ".ini");
  }
  if (fs.existsSync(wsjtxCfgPath))
  {
    let fileBuf = fs.readFileSync(wsjtxCfgPath, "ascii");
    let fileArray = fileBuf.split("\n");
    for (const key in fileArray) fileArray[key] = fileArray[key].trim();

    for (let x = 0; x < fileArray.length; x++)
    {
      let indexOfSearch = fileArray[x].indexOf("UDPServerPort=");
      if (indexOfSearch == 0)
      {
        let valSplit = fileArray[x].split("=");
        result.port = valSplit[1];
      }
      indexOfSearch = fileArray[x].indexOf("UDPServer=");
      if (indexOfSearch == 0)
      {
        let valSplit = fileArray[x].split("=");
        result.ip = valSplit[1];
      }
      indexOfSearch = fileArray[x].indexOf("MyCall=");
      if (indexOfSearch == 0)
      {
        let valSplit = fileArray[x].split("=");
        result.MyCall = valSplit[1];
      }
      indexOfSearch = fileArray[x].indexOf("MyGrid=");
      if (indexOfSearch == 0)
      {
        let valSplit = fileArray[x].split("=");
        result.MyGrid = valSplit[1].substr(0, 6);
      }
      indexOfSearch = fileArray[x].indexOf("Mode=");
      if (indexOfSearch == 0)
      {
        let valSplit = fileArray[x].split("=");
        result.MyMode = valSplit[1];
      }
      indexOfSearch = fileArray[x].indexOf("DialFreq=");
      if (indexOfSearch == 0)
      {
        let valSplit = fileArray[x].split("=");
        result.MyBand = formatBand(Number(valSplit[1] / 1000000));
      }
      indexOfSearch = fileArray[x].indexOf("N1MMServerPort=");
      if (indexOfSearch == 0)
      {
        let valSplit = fileArray[x].split("=");
        result.N1MMServerPort = valSplit[1];
      }
      indexOfSearch = fileArray[x].indexOf("N1MMServer=");
      if (indexOfSearch == 0)
      {
        let valSplit = fileArray[x].split("=");
        result.N1MMServer = valSplit[1];
      }
      indexOfSearch = fileArray[x].indexOf("BroadcastToN1MM=");
      if (indexOfSearch == 0)
      {
        let valSplit = fileArray[x].split("=");
        result.BroadcastToN1MM = valSplit[1] == "true";
      }
    }
  }

  return result;
}

function updateBasedOnIni()
{
  scanForAppLogs();
  
  let which =  getIniFromApp("WSJT-X");
  if (which.port == -1) which = getIniFromApp("JTDX");

  // UdpPortNotSet
  if (GT.settings.app.wsjtUdpPort == 0 && which.port > -1)
  {
    GT.settings.app.wsjtUdpPort = which.port;
    GT.settings.app.wsjtIP = which.ip;

    if (ipToInt(GT.settings.app.wsjtIP) >= ipToInt("224.0.0.0") && ipToInt(GT.settings.app.wsjtIP) < ipToInt("240.0.0.0"))
    {
      GT.settings.app.multicast = true;
    }
    else
    {
      GT.settings.app.multicast = false;
    }

  }

  if (GT.settings.app.wsjtUdpPort == 0)
  {
    GT.settings.app.wsjtUdpPort = 2237;
    GT.settings.app.wsjtIP = "";
    GT.settings.app.multicast = false;
  }
  // Which INI do we load?
  if (GT.settings.app.wsjtUdpPort > 0 && which.MyCall != "NOCALL")
  {
    GT.settings.app.myCall = which.MyCall;
    GT.settings.app.myGrid = GT.settings.app.myRawGrid = which.MyGrid;
    GT.lastBand = GT.settings.app.myBand;
    GT.lastMode = GT.settings.app.myMode;

    if (which.BroadcastToN1MM == true && GT.settings.N1MM.enable == true)
    {
      if (which.N1MMServer == GT.settings.N1MM.ip && which.N1MMServerPort == GT.settings.N1MM.port)
      {
        buttonN1MMCheckBox.checked = GT.settings.N1MM.enable = false;
        alert(which.appName + " N1MM Logger+ is enabled in WSJT-X with same settings, disabled GridTracker N1MM logger");
      }
    }

    if (GT.settings.app.wsjtIP == "")
    {
      GT.settings.app.wsjtIP = which.ip;
    }
  }
}

function CheckReceivePortIsNotForwardPort(value)
{
  if (udpForwardIpInput.value.indexOf("127.0.0.1") > -1 && udpForwardPortInput.value == value && GT.settings.app.wsjtIP == "" && udpForwardEnable.checked)
  {
    return false;
  }

  return true;
}

function CheckForwardPortIsNotReceivePort(value)
{
  if (udpForwardIpInput.value.indexOf("127.0.0.1") > -1 && udpPortInput.value == value && GT.settings.app.wsjtIP == "")
  {
    return false;
  }

  return true;
}

function CheckAdifBroadcastPortIsNotReceivePort(value)
{
  if (GT.settings.app.adifBroadcastMulticast == false && GT.settings.app.multicast == false && udpPortInput.value == value)
  {
    return false;
  }
  if (GT.settings.app.adifBroadcastIP == GT.settings.app.wsjtIP && udpPortInput.value == value)
  {
    return false;
  }
  return true;
}

function setForwardIp()
{
  let ips = udpForwardIpInput.value.split(",");
  GT.forwardIPs = [...new Set(ips)];
  GT.settings.app.wsjtForwardUdpIp = GT.forwardIPs.join(",");
  if (ValidatePort(udpPortInput, null, CheckReceivePortIsNotForwardPort))
  {
    setUdpPort();
  }
  ValidatePort(udpForwardPortInput, null, CheckForwardPortIsNotReceivePort);
}

function setForwardPort()
{
  GT.settings.app.wsjtForwardUdpPort = udpForwardPortInput.value;
  ValidateIPaddresses(udpForwardIpInput, null);
  if (ValidatePort(udpPortInput, null, CheckReceivePortIsNotForwardPort))
  {
    setUdpPort();
  }
}

function validIpKeys(value)
{
  if (value == 46) return true;
  return value >= 48 && value <= 57;
}

function validIpsKeys(value)
{
  if (value == 44) return true;
  if (value == 46) return true;
  return value >= 48 && value <= 57;
}

function validNumberKeys(value)
{
  return value >= 48 && value <= 57;
}

function validateNumAndLetter(input)
{
  if (/\d/.test(input) && /[A-Z]/.test(input)) return true;
  else return false;
}

function validCallsignsKeys(value)
{
  if (value == 44) return true;
  if (value >= 47 && value <= 57) return true;
  if (value >= 65 && value <= 90) return true;
  return value >= 97 && value <= 122;
}

function validGridKeys(value)
{
  if (value == 44) return true;
  if (value >= 48 && value <= 57) return true;
  if (value >= 65 && value <= 90) return true;
  return value >= 97 && value <= 122;
}

function setInputStatus(input, valid, validDiv, validTxt = "Valid!", invalidTxt = "Invalid!") {
  input.style.color = valid ? "#FF0" : (input.value ? "#FFF" : "#000");
  input.style.backgroundColor = valid ? "darkblue" : (input.value ? "rgb(199, 113, 0)" : "yellow");
  if (validDiv) validDiv.innerHTML = valid ? validTxt : invalidTxt;
  return valid;
}

function ValidateCallsigns(inputText) {
  inputText.value = inputText.value.toUpperCase();
  let calls = inputText.value.split(",").map(c => c.trim()).filter(c => c);
  let passed = calls.length > 0 && calls.every(c => /\d/.test(c) && /[A-Z]/.test(c));
  return setInputStatus(inputText, passed, null);
}

function ValidateGrids(inputText) {
  inputText.value = inputText.value.toUpperCase();
  let grids = inputText.value.split(",").map(g => g.trim()).filter(g => g);
  let passed = grids.length > 0 && grids.every(g => /^[A-R]{2}[0-9]{2}$/.test(g));
  return setInputStatus(inputText, passed, null);
}

function ValidateCallsign(inputText, validDiv) {
  if (validDiv) validDiv.innerHTML = "";
  inputText.value = inputText.value.toUpperCase();
  let passed = inputText.value.length > 0 && (/\d/.test(inputText.value) || /[A-Z]/.test(inputText.value));
  inputText.style.color = passed ? "#FF0" : "#000";
  inputText.style.backgroundColor = passed ? "darkblue" : "yellow";
  if (validDiv) validDiv.innerHTML = passed ? "Valid!" : "Invalid!";
  return passed;
}

function ValidateGridsquareOnly4(inputText, validDiv) {
  inputText.value = inputText.value.toUpperCase();
  let passed = inputText.value.length === 0 || /^[A-R]{2}[0-9]{2}$/.test(inputText.value);
  inputText.style.color = passed ? (inputText.value.length ? "#FF0" : "#000") : "#FFF";
  inputText.style.backgroundColor = passed ? (inputText.value.length ? "darkblue" : "yellow") : "rgb(199, 113, 0)";
  if (validDiv) validDiv.innerHTML = passed ? "Valid!" : "Invalid!";
  return passed;
}

function ValidateGridsquare(inputText, validDiv) {
  inputText.value = inputText.value.toUpperCase();
  let passed = /^[A-R]{2}[0-9]{2}([A-X]{2})?$/.test(inputText.value);
  return setInputStatus(inputText, passed, validDiv);
}

function ValidateIPaddress(inputText, checkBox) {
  let ip = inputText.value.trim();
  let valid = GT.ipformat.test(ip) && ip !== "0.0.0.0" && ip !== "255.255.255.255";
  if (!valid && checkBox) checkBox.checked = false;
  return setInputStatus(inputText, valid, null);
}

function ValidateIPaddresses(inputText, checkBox) {
  let ips = inputText.value.split(",").map(i => i.trim()).filter(i => i);
  let valid = ips.length > 0 && ips.every(ip => GT.ipformat.test(ip) && ip !== "0.0.0.0" && ip !== "255.255.255.255");
  if (!valid && checkBox) checkBox.checked = false;
  return setInputStatus(inputText, valid, null);
}

function ipToInt(ip)
{
  return ip
    .split(".")
    .map((octet, index, array) =>
    {
      return parseInt(octet) * Math.pow(256, array.length - index - 1);
    })
    .reduce((prev, curr) =>
    {
      return prev + curr;
    });
}

function ValidateMulticast(inputText)
{
  if (inputText.value.match(GT.ipformat))
  {
    if (inputText.value != "0.0.0.0" && inputText.value != "255.255.255.255")
    {
      let ipInt = ipToInt(inputText.value);
      if (ipInt >= ipToInt("224.0.0.0") && ipInt < ipToInt("240.0.0.0"))
      {
        if (ipInt > ipToInt("224.0.0.255"))
        {
          inputText.style.color = "black";
          inputText.style.backgroundColor = "yellow";
        }
        else
        {
          inputText.style.color = "#FF0";
          inputText.style.backgroundColor = "darkblue";
        }
        return true;
      }
      else
      {
        inputText.style.color = "#FFF";
        inputText.style.backgroundColor = "rgb(199, 113, 0)";
        return false;
      }
    }
    else
    {
      inputText.style.color = "#FFF";
      inputText.style.backgroundColor = "rgb(199, 113, 0)";
      return false;
    }
  }
  else
  {
    inputText.style.color = "#FFF";
    inputText.style.backgroundColor = "rgb(199, 113, 0)";
    return false;
  }
}


function ValidatePort(inputText, checkBox, callBackCheck)
{
  let value = Number(inputText.value);
  if (value > 1023 && value < 65536)
  {
    if (callBackCheck && !callBackCheck(value))
    {
      inputText.style.color = "#FFF";
      inputText.style.backgroundColor = "orange";
      if (checkBox) checkBox.checked = false;
      return false;
    }
    else
    {
      inputText.style.color = "#FF0";
      inputText.style.backgroundColor = "darkblue";
      return true;
    }
  }
  else
  {
    inputText.style.color = "#FFF";
    inputText.style.backgroundColor = "orange";
    if (checkBox) checkBox.checked = false;
    return false;
  }
}

function workingCallsignEnableChanged(ele)
{
  GT.settings.app.workingCallsignEnable = ele.checked;
  applyCallsignsAndDateDiv.style.display = "";
}

function workingGridEnableChanged(ele)
{
  GT.settings.app.workingGridEnable = ele.checked;
  applyCallsignsAndDateDiv.style.display = "";
}

function workingDateEnableChanged(ele)
{
  GT.settings.app.workingDateEnable = ele.checked;
  applyCallsignsAndDateDiv.style.display = "";
}

function workingDateChanged()
{
  if (workingDateValue.value.length == 0)
  {
    workingDateValue.value = "1970-01-01T00:00";
  }

  if (workingDateValue.value == "1970-01-01T00:00")
  {
    workingDateEnableTd.style.display = "none";
    workingDateEnable.checked = GT.settings.app.workingDateEnable = false;
  }
  else
  {
    workingDateEnableTd.style.display = "";
  }

  GT.settings.app.workingDate = parseInt(Date.parse(workingDateValue.value + "Z") / 1000);

  displayWorkingDate();

  applyCallsignsAndDateDiv.style.display = "";
}

function displayWorkingDate()
{
  let date = new Date(GT.settings.app.workingDate * 1000);
  workingDateValue.value = date.toISOString().slice(0, 16);
  workingDateString.innerHTML = dateToString(date);
}

function workingCallsignsChanged(ele)
{
  let valid = ValidateCallsigns(ele); 
  if (valid)
  {
    let tempWorkingCallsigns = {};
    let callsigns = ele.value.split(",");
    for (let call in callsigns)
    {
      tempWorkingCallsigns[callsigns[call]] = true;
    }
    if (callsigns.length > 0)
    {
      workingCallsignEnableTd.style.display = "";
      GT.settings.app.workingCallsigns = Object.assign({}, tempWorkingCallsigns);
      if (GT.settings.app.workingCallsignEnable) { applyCallsignsAndDateDiv.style.display = ""; }
    }
  }
  else
  {
    GT.settings.app.workingCallsigns = {};
    workingCallsignEnable.checked = GT.settings.app.workingCallsignEnable = false;
    workingCallsignEnableTd.style.display = "none";
  }
  applyCallsignsAndDateDiv.style.display = "";
}

function workingGridsChanged(ele)
{
  let valid = ValidateGrids(ele); 
  if (valid)
  {
    let tempWorkingGrids = {};
    let grids = ele.value.split(",");
    for (let grid in grids)
    {
      tempWorkingGrids[grids[grid]] = true;
    }
    if (grids.length > 0)
    {
      workingGridEnableTd.style.display = "";
      GT.settings.app.workingGrids = Object.assign({}, tempWorkingGrids);
      if (GT.settings.app.workingGridEnable) { applyCallsignsAndDateDiv.style.display = ""; }
    }
  }
  else
  {
    GT.settings.app.workingGrids = {};
    workingGridEnable.checked = GT.settings.app.workingGridEnable = false;
    workingGridEnableTd.style.display = "none";
  }
  applyCallsignsAndDateDiv.style.display = "";
}

function applyCallsignsAndDates()
{
  clearAndLoadQSOs();
  applyCallsignsAndDateDiv.style.display = "none";
}

function selectElementContents(el)
{
  if (document.createRange && window.getSelection)
  {
    let range = document.createRange();
    let sel = window.getSelection();
    sel.removeAllRanges();
    range.selectNodeContents(el);
    sel.addRange(range);
    let text = sel.toString();
    text = text.replace(/\t/g, ",");
    sel.removeAllRanges();
    selectNodeDiv.innerText = text;
    range.selectNodeContents(selectNodeDiv);
    sel.addRange(range);
    document.execCommand("copy");
    sel.removeAllRanges();
    selectNodeDiv.innerText = "";
  }
}

function createWorkingObject(name)
{
  return {
    name,
    worked: false,
    confirmed: false,
    worked_bands: {},
    confirmed_bands: {},
    worked_modes: {},
    confirmed_modes: {}
  };
}

function loadMaidenHeadData()
{
  try {
    GT.dxccInfo = require(GT.dxccInfoPath);
  }
  catch (e)
  {
    console.error("Failed to load Ginternal dxcc-info, falling back to asar");
    // Fallback to asar
    GT.dxccInfo = require(GT.asarDxccInfoPath);
    
  }

  if ("version" in GT.dxccInfo[0])
  {
    GT.dxccVersion = parseInt(GT.dxccInfo[0].version);

    updateLookupsBigCtyUI();
  }

  for (let key in GT.dxccInfo)
  {
    const info = GT.dxccInfo[key]; // Cache the pointer!

    GT.dxccToAltName[info.dxcc] = info.name;
    GT.dxccToADIFName[info.dxcc] = info.aname;
    GT.altNameToDXCC[info.name] = info.dxcc;
    GT.dxccToCountryCode[info.dxcc] = info.cc;

    for (let i = 0; i < info.prefix.length; i++) {
      GT.prefixToDXCC[info.prefix[i]] = key;
    }
    info.prefix = undefined; // Nullifies reference for GC without destroying V8 Hidden Class

    for (let i = 0; i < info.direct.length; i++) {
      GT.directCallToDXCC[info.direct[i]] = info.dxcc;
    }
    info.direct = undefined;

    for (let val in info.prefixCQ) GT.prefixToCQzone[val] = info.prefixCQ[val];
    info.prefixCQ = undefined;

    for (let val in info.prefixITU) GT.prefixToITUzone[val] = info.prefixITU[val];
    info.prefixITU = undefined;

    for (let val in info.directCQ) GT.directCallToCQzone[val] = info.directCQ[val];
    info.directCQ = undefined;

    for (let val in info.directITU) GT.directCallToITUzone[val] = info.directITU[val];
    info.directITU = undefined;

    for (let x = 0; x < info.mh.length; x++)
    {
      if (!(info.mh[x] in GT.gridToDXCC)) { GT.gridToDXCC[info.mh[x]] = Array(); }
      GT.gridToDXCC[info.mh[x]].push(info.dxcc);
    }
  }

  let dxccGeo = requireJson("data/dxcc.json");
  for (let key in dxccGeo.features)
  {
    let dxcc = dxccGeo.features[key].properties.dxcc_entity_code;
    GT.dxccInfo[dxcc].geo = dxccGeo.features[key];
  }

  let countyData = requireJson("data/counties.json");

  for (let id in countyData)
  {
    let cnty = countyData[id].properties.st + "," + countyData[id].properties.n.replaceAll(" ", "").toUpperCase();

    if (!(cnty in GT.cntyToCounty)) { GT.cntyToCounty[cnty] = toProperCase(countyData[id].properties.n); }

    GT.countyData[cnty] = createWorkingObject(cnty);
    GT.countyData[cnty].geo = countyData[id];

    GT.fipsToCounty[id] = cnty;

    for (let x in countyData[id].properties.z)
    {
      let zipS = String(countyData[id].properties.z[x]);
      if (!(zipS in GT.zipToCounty))
      {
        GT.zipToCounty[zipS] = Array();
      }
      GT.zipToCounty[zipS].push(cnty);
    }
  }

  GT.shapeData = requireJson("data/shapes.json");
  GT.StateData = requireJson("data/state.json");

  for (let key in GT.StateData)
  {
    for (let x = 0; x < GT.StateData[key].mh.length; x++)
    {
      if (!(GT.StateData[key].mh[x] in GT.gridToState)) { GT.gridToState[GT.StateData[key].mh[x]] = Array(); }
      GT.gridToState[GT.StateData[key].mh[x]].push(GT.StateData[key].postal);
    }
  }

  GT.phonetics = requireJson("data/phone.json");
  GT.enums = requireJson("data/enums.json");

  for (let key in GT.dxccInfo)
  {
    if (GT.dxccInfo[key].pp != "" && GT.dxccInfo[key].geo != "deleted")
    {
      GT.enums[GT.dxccInfo[key].dxcc] = GT.dxccInfo[key].name;
    }
    if (key == 291)
    {
      // US Mainland
      for (let mh in GT.dxccInfo[key].mh)
      {
        let sqr = GT.dxccInfo[key].mh[mh];
        GT.us48Data[sqr] = createWorkingObject(sqr);
      }
    }
  }

  GT.cqZones = requireJson("data/cqzone.json");
  GT.ituZones = requireJson("data/ituzone.json");

  for (let key in GT.StateData)
  {
    if (key.substr(0, 3) == "US-")
    {
      let shapeKey = key.substr(3, 2);
      let name = key;

      if (shapeKey in GT.shapeData)
      {
        GT.wasZones[name] = createWorkingObject(GT.StateData[key].name);
        GT.wasZones[name].geo = GT.shapeData[shapeKey];
      }
    }
    else if (key.substr(0, 3) == "CA-")
    {
      let shapeKey = key.substr(3, 2);
      let name = key;

      if (shapeKey in GT.shapeData)
      {
        GT.wacpZones[name] = createWorkingObject(GT.StateData[key].name)
        GT.wacpZones[name].geo = GT.shapeData[shapeKey];
      }
    }
  }

  for (let key in GT.shapeData)
  {
    if (GT.shapeData[key].properties.type == "Continent")
    {
      let name = GT.shapeData[key].properties.name;
      GT.wacZones[name] = createWorkingObject(name);
      GT.wacZones[name].geo = GT.shapeData[key];
    }
  }



  let langDxcc = requireJson("i18n/" + GT.settings.app.locale + "-dxcc.json");
  if (langDxcc)
  {
    for (const dxcc in langDxcc)
    {
      if (dxcc in GT.dxccInfo)
      {
        GT.dxccInfo[dxcc].name = langDxcc[dxcc];
        GT.dxccToAltName[dxcc] = langDxcc[dxcc];
      }
    }
  }

  let langState = requireJson("i18n/" + GT.settings.app.locale + "-state.json");
  if (langState)
  {
    for (const state in langState)
    {
      if (state in GT.StateData)
      {
        GT.StateData[state].name = langState[state];
      }
    }
  }

  GT.acknowledgedCalls = requireJson("data/acknowledgements.json");
  
  // Pass running data set to workers as needed.
  initAdifWorker();
}

function toggleTimezones()
{
  GT.settings.map.timezonesEnable ^= 1;
  displayTimezones();
}

function displayTimezones()
{
  timezoneImg.style.filter = GT.settings.map.timezonesEnable == 1 ? "" : "grayscale(1)";

  if (GT.settings.map.timezonesEnable == 1)
  {
    if (GT.timezoneLayer == null)
    {
      GT.timezoneLayer = createGeoJsonLayer(
        "tz",
        path.resolve(resourcesPath, "data/combined-now.json"),
        "#000088FF",
        0.5
      );
      GT.map.addLayer(GT.timezoneLayer);
      GT.timezoneLayer.setVisible(false);
    }
    if (GT.currentOverlay == 0)
    {
      GT.timezoneLayer.setVisible(true);
    }
  }
  else
  {
    if (GT.timezoneLayer != null)
    {
      GT.timezoneLayer.getSource().clear();
      GT.map.removeLayer(GT.timezoneLayer);
      GT.timezoneLayer = null;
    }
  }
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

function changeRangeRingDistance()
{
  let val = parseFloat(event.target.value);
  let unit = GT.settings.app.distanceUnit || 'KM';
  
  // Convert slider value back to KM
  let valInKm = unitToKilometer(val, unit);
  
  // --> HARD ENFORCEMENT: Never allow the value below 100 KM <--
  if (valInKm < 100) {
      valInKm = 100;
  }

  GT.settings.map.rangeRingDistance = valInKm;
  
  updateRangeRingsUI();
  drawRangeRings();
}


function changeRangeRingColor()
{
  GT.settings.map.rangeRingColor = parseInt(rangeRingColorValue.value);
  drawRangeRings();
}

function changeEquatorColor()
{
  GT.settings.map.equatorColor = parseInt(equatorColorValue.value);
  drawRangeRings();
}

function updateRangeRingsUI()
{
  let currentUnit = GT.settings.app.distanceUnit || "KM";
  let config = distanceUnitConfig[currentUnit] || distanceUnitConfig['KM'];

  // Convert the internal KM to the display unit, snapped to step to fix float drift
  let rawLocal = kilometerToUnit(GT.settings.map.rangeRingDistance, currentUnit);
  let displayValue = Math.round(rawLocal / config.step) * config.step;

  // Update the HTML slider attributes dynamically
  rangeRingDistanceValue.value = displayValue;
  rangeRingDistanceValue.min = config.min;
  rangeRingDistanceValue.step = config.step;
  rangeRingDistanceValue.max = config.max;

  // Format the text label (Degrees get 1 decimal place, others are whole numbers)
  let textValue = Math.round(displayValue);
  rangeRingDistanceTd.innerHTML = textValue + " " + currentUnit.toLowerCase();

  // --- Original Color Management untouched below ---
  rangeRingColorDiv.style.color = (GT.settings.map.rangeRingColor == 0) ? "#FFF" : "#000";
  rangeRingColorDiv.style.textShadow = (GT.settings.map.rangeRingColor == 0) ? "" : "-1px -1px 0 #FFF, 1px -1px 0 #FFF, -1px 1px 0 #FFF, 1px 1px 0 #FFF";
  rangeRingColorDiv.style.backgroundColor = GT.settings.map.rangeRingColor == 0 ? "#000" : GT.settings.map.rangeRingColor == 361 ? "#FFF" : "hsl(" + GT.settings.map.rangeRingColor + ", 100%, 50%)";
  rangeRingColorValue.value = GT.settings.map.rangeRingColor;

  equatorColorDiv.style.color = (GT.settings.map.equatorColor == 0) ? "#FFF" : "#000";
  equatorColorDiv.style.textShadow = (GT.settings.map.equatorColor == 0) ? "" : "-1px -1px 0 #FFF, 1px -1px 0 #FFF, -1px 1px 0 #FFF, 1px 1px 0 #FFF";
  equatorColorDiv.style.backgroundColor = GT.settings.map.equatorColor == 0 ? "#000" : GT.settings.map.equatorColor == 361 ? "#FFF" : "hsl(" + GT.settings.map.equatorColor + ", 100%, 50%)";
  equatorColorValue.value = GT.settings.map.equatorColor;
}

function drawRangeRings()
{
  updateRangeRingsUI();

  GT.layerSources.rangeRings.clear();

  if (GT.settings.map.equator)
  {
    
    // Helper to generate a line with exactly 1000 evenly split steps
    function generatePoints(start, end, steps, callback) {
      const points = [];
      const stepSize = (end - start) / (steps - 1);
      for (let i = 0; i < steps; i++) {
        const val = start + (stepSize * i);
        points.push(callback(val));
      }
      return points;
    }

    const parallels = [23.4363, -23.4363, 66.5637, -66.5637].map(lat => 
      generatePoints(-180, 180, GT.useTransform ? 2048 : 2 , lon => [Number(lon.toFixed(6)), lat])
    );

    const meridians = [0.0, 180.0].map(lon => 
      generatePoints(-90, 90, GT.useTransform ? 2048 : 2, lat => [lon, Number(lat.toFixed(6))])
    );

    // add equator
    meridians.push(generatePoints(-180, 180, GT.useTransform ? 2048 : 2, lon => [Number(lon.toFixed(6)), 0.0]));

    const parallelsGeoJSON = {
      type: "Feature",
      properties: { name: "para" },
      geometry: { type: "MultiLineString", coordinates: parallels }
    };

    const meridiansGeoJSON = {
      type: "Feature",
      properties: { name: "merd-equa" },
      geometry: { type: "MultiLineString", coordinates: meridians }
    };

    let feature = shapeFeature("eq", meridiansGeoJSON, "eq", "#00000000", equatorColorDiv.style.backgroundColor, 1.0);
    GT.layerSources.rangeRings.addFeature(feature);

    let dashStyle = new ol.style.Style({
      stroke: new ol.style.Stroke({
        color: equatorColorDiv.style.backgroundColor,
        width: 1,
        lineDash: [10, 10]
      })
    });

    feature = shapeFeature("eq", parallelsGeoJSON, "eq", "#00000000",  equatorColorDiv.style.backgroundColor, 1.0);
    feature.setStyle(dashStyle);
    GT.layerSources.rangeRings.addFeature(feature);

  }

  if (GT.settings.map.showRangeRings == false)
  {
    return;
  }

  const center = [GT.settings.map.longitude, GT.settings.map.latitude];    
  const distance = GT.settings.map.rangeRingDistance;
  const geoJsonFormat = new ol.format.GeoJSON();

  for (let x = distance; x < 20000; x += distance)
  {
    let feature = null;

    if (GT.settings.map.projection == "EPSG:3857")
    {
      let geoJson = generateGeodesicCircle(GT.settings.map.longitude, GT.settings.map.latitude, x * 2);
      
      if (geoJson) {
        feature = geoJsonFormat.readFeature(geoJson, {
          dataProjection: 'EPSG:4326', 
          featureProjection: GT.settings.map.projection
        });
        feature.set('prop', 'range');
      }
    }
    else
    {
      let poly = new ol.geom.Polygon.circular(center, parseInt(x * 1000), 359).transform("EPSG:4326", GT.settings.map.projection);
      feature = new ol.Feature({ geometry: poly, prop: "range" });
    }

    if (feature) {
      let featureStyle = new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: rangeRingColorDiv.style.backgroundColor,
          width: (x % (distance * 2) == 0) ? 0.2 : 0.4
        })
      });
      
      feature.setStyle(featureStyle);
      GT.layerSources.rangeRings.addFeature(feature);
    }
  }

}

function drawAllGrids()
{
  GT.layerSources.lineGrids.clear();
  GT.layerSources.longGrids.clear();
  GT.layerSources.bigGrids.clear();

  if (GT.settings.map.showAllGrids == false)
  {
    return;
  }

  let borderColor = "#000";
  let borderWeight = 0.5;

  for (let x = -178; x < 181; x += 2)
  {
    let points = [[x, -85], [x, 85]];

    if (x % 20 == 0) GT.useTransform ? borderWeight = 0.75 : borderWeight = 1.25;
    else borderWeight = 0.25;

    let newGridBox = lineString(points, 100);

    let featureStyle = new ol.style.Style({
      stroke: new ol.style.Stroke({
        color: borderColor,
        width: borderWeight
      })
    });
    newGridBox.setStyle(featureStyle);

    GT.layerSources.lineGrids.addFeature(newGridBox);
  }

  for (let x = -85; x < 85; x++)
  {
    if (x % 10 == 0) GT.useTransform ? borderWeight = 0.75 : borderWeight = 1.25;
    else borderWeight = 0.25;

    if (GT.useTransform)
    {
      for (let y = -180; y < 180; y += 2)
      {
        let points = [[y, x], [y + 2, x]];
        let newGridBox = lineString(points, 10);

        let featureStyle = new ol.style.Style({
          stroke: new ol.style.Stroke({
            color: borderColor,
            width: borderWeight
          })
        });
        newGridBox.setStyle(featureStyle);
        GT.layerSources.lineGrids.addFeature(newGridBox);
      }
    }
    else
    {
      let points = [[-180, x], [180, x]];
      let newGridBox = lineString(points);

      let featureStyle = new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: borderColor,
          width: borderWeight
        })
      });
      newGridBox.setStyle(featureStyle);
      GT.layerSources.lineGrids.addFeature(newGridBox);
    }
  }

  // Pre-allocate shared style objects OUTSIDE the loops
  let font4String = GT.useTransform ? "normal 12px sans-serif" : "normal 16px sans-serif";
  let font2String = GT.useTransform ? "normal 16px sans-serif" : "normal 22px sans-serif";

  const sharedFill = new ol.style.Fill({ color: "#000" });
  const sharedStrokeThin = new ol.style.Stroke({ color: "#88888888", width: 1 });
  const sharedStrokeThick = new ol.style.Stroke({ color: "#88888888", width: 2 });

  for (let x = 65; x < 83; x++)
  {
    for (let y = 65; y < 83; y++)
    {
      for (let a = 0; a < 10; a++)
      {
        for (let b = 0; b < 10; b++)
        {
          let LL = maidenheadToBounds(
            String.fromCharCode(x) +
            String.fromCharCode(y) +
            String(a) +
            String(b)
          );
          let Lat = (LL.la1 + LL.la2) / 2;
          let Lon = (LL.lo1 + LL.lo2) / 2;
          let point = ol.proj.fromLonLat([Lon, Lat]);
          let feature = new ol.Feature({
            geometry: new ol.geom.Point(point)
          });

          let featureStyle = new ol.style.Style({
            text: new ol.style.Text({
              fill: sharedFill,           // Re-use!
              stroke: sharedStrokeThin,   // Re-use!
              font: font4String,
              text: String.fromCharCode(x) + String.fromCharCode(y) + String(a) + String(b),
              offsetY: 1
            })
          });
          feature.setStyle(featureStyle);
          if (GT.useTransform)
          {
            feature.getGeometry().transform("EPSG:3857", GT.settings.map.projection);
          }
          GT.layerSources.longGrids.addFeature(feature);
        }
      }

      let LL = maidenheadFieldToBounds(String.fromCharCode(x) + String.fromCharCode(y));
      let Lat = (LL.la1 + LL.la2) / 2;
      let Lon = (LL.lo1 + LL.lo2) / 2;
      let point = ol.proj.fromLonLat([Lon, Lat]);
      feature = new ol.Feature(new ol.geom.Point(point));
      featureStyle = new ol.style.Style({
        text: new ol.style.Text({
          fill: sharedFill,            // Re-use!
          stroke: sharedStrokeThick,   // Re-use!
          font: font2String,
          text: String.fromCharCode(x) + String.fromCharCode(y)
        })
      });
      feature.setStyle(featureStyle);
      if (GT.useTransform)
      {
        feature.getGeometry().transform("EPSG:3857", GT.settings.map.projection);
      }
      GT.layerSources.bigGrids.addFeature(feature);
    }
  }
}

function mailThem(address)
{
  window.open("mailto:" + address, "_blank");
}

function openSite(address)
{
  window.open(address, "_blank");
}

function closeUpdateToDateDiv()
{
  upToDateDiv.style.display = "none";
  main.style.display = "block";
}

function cancelVersion()
{
  main.style.display = "block";
  versionDiv.style.display = "none";
}

function getBuffer(file_url, callback, flag, mode, port, cache = null)
{
  let http = require(mode);
  let fileBuffer = null;
  let options = null;

  options = {
    host: NodeURL.parse(file_url).host, // eslint-disable-line node/no-deprecated-api
    port: port,
    followAllRedirects: true,
    path: NodeURL.parse(file_url).path, // eslint-disable-line node/no-deprecated-api
    headers: { "User-Agent": gtUserAgent, "x-user-agent": gtUserAgent, 'Accept-Encoding': 'gzip' },
  };

  http.get(options, function (res)
  {
    const encoding = res.headers['content-encoding'];
    res.on("data", function (data)
      {
        if (fileBuffer == null) fileBuffer = Buffer.from(data);
        else fileBuffer = Buffer.concat([fileBuffer, data]);
      })
      .on("end", function ()
      {
        if (encoding === 'gzip')
        {
          const zlib = require('zlib');
          fileBuffer =  zlib.gunzipSync(fileBuffer);
        }
        if (typeof callback == "function")
        {
          // Call it, since we have confirmed it is callable
          callback(fileBuffer, flag, cache);
        }
      })
      .on("error", function (e)
      {
        console.error("getBuffer " + file_url + " error: " + e.message);
      });
  });
}

function getPostBuffer(file_url, callback, flag, mode, port, theData, timeoutMs, timeoutCallback, who)
{
  let querystring = require("querystring");
  let postData = querystring.stringify(theData);
  let http = require(mode);
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

function loadMapSettings()
{
  graylineValue.value = GT.settings.map.graylineOpacity;
  showDarknessTd.innerHTML = parseInt(graylineValue.value * 100) + "%";
  pathWidthTd.innerHTML = pathWidthValue.value = GT.settings.app.pathWidthWeight;
  qrzPathWidthTd.innerHTML = qrzPathWidthValue.value = GT.settings.app.qrzPathWidthWeight;

  mapTransValue.value = GT.settings.map.mapTrans;
  mapTransChange();

  mapTerminatorValue.value = GT.settings.map.terminatorDegreeIndex;
  mapTerminatorChange();

  gridDecay.value = GT.settings.app.gridsquareDecayTime;
  changeGridDecay();

  pathColorValue.value = GT.settings.map.pathColor;
  qrzPathColorValue.value = GT.settings.map.qrzPathColor;
  brightnessValue.value = GT.settings.map.mapOpacity;
  nightBrightnessValue.value = GT.settings.map.nightMapOpacity;

  nightPathColorValue.value = GT.settings.map.nightPathColor;
  nightQrzPathColorValue.value = GT.settings.map.nightQrzPathColor;

  mouseOverValue.checked = GT.settings.map.mouseOver;
  mergeOverlayValue.checked = GT.settings.map.mergeOverlay;

  offlineModeEnable.checked = GT.settings.map.offlineMode;

  allGridOpacityValue.value = GT.settings.map.allGridOpacity;
  
  mapSelect.value = GT.settings.map.mapIndex;
  mapNightSelect.value = GT.settings.map.nightMapIndex;

  animateValue.checked = GT.settings.map.animate;
  animateSpeedValue.value = 21 - GT.settings.map.animateSpeed;
  setAnimateView();
  splitQSLValue.checked = GT.settings.map.splitQSL;
  fitQRZvalue.checked = GT.settings.map.fitQRZ;
  qrzDxccFallbackValue.checked = GT.settings.map.qrzDxccFallback;
  CqHiliteValue.checked = GT.settings.map.CQhilite;
  focusRigValue.checked = GT.settings.map.focusRig;
  haltAllOnTxValue.checked = GT.settings.map.haltAllOnTx;

  trafficDecode.checked = GT.settings.map.trafficDecode;
  wantedByBandMode.checked = GT.settings.app.wantedByBandMode;
  includeExceptions.checked =  GT.settings.app.includeExceptions;
  includeCustomAlerts.checked = GT.settings.app.includeCustomAlerts;
  setWantedByBandModeRowView();
  
  warnOnSoundcardsChanged.checked = GT.settings.app.warnOnSoundcardsChange;

  setSpotImage();

  timezoneImg.style.filter = GT.settings.map.timezonesEnable == 1 ? "" : "grayscale(1)";
  radarImg.style.filter = GT.settings.map.usRadar ? "" : "grayscale(1)";
  predImg.src = GT.predImageArray[GT.settings.map.predMode];
  predImg.style.filter = GT.settings.map.predMode > 0 ? "" : "grayscale(1)";
  gridOverlayImg.style.filter = GT.settings.map.showAllGrids ? "" : "grayscale(1)";
  equatorImg.style.filter = GT.settings.map.equator ? "" : "grayscale(1)";
  rangeRingsImg.style.filter = GT.settings.map.showRangeRings ? "" : "grayscale(1)";
  
  GT.bandToColor = { ...GT.pskColors };

  setGridOpacity();
  setMapColors();
  setNightMapColors();

  if (GT.settings.app.myGrid.length > 3)
  {
    let LL = squareToCenter(GT.settings.app.myGrid);
    GT.settings.map.latitude = GT.myLat = LL.a;
    GT.settings.map.longitude = GT.myLon = LL.o;
  }
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


function changeMapNightPathValues()
{
  GT.settings.map.nightPathColor = nightPathColorValue.value;
  GT.settings.map.nightQrzPathColor = nightQrzPathColorValue.value;
  setNightMapColors();
  styleAllFlightPaths();
  
}

function changeMapNightValues()
{
  GT.settings.map.nightMapIndex = mapNightSelect.value;
  GT.settings.map.nightMapOpacity = nightBrightnessValue.value;

  
  changeMapLayer();
}

function setMapColors()
{
  let pathColor = pathColorValue.value == 0 ? "#000" : pathColorValue.value == 361 ? "#FFF" : "hsl(" + pathColorValue.value + ", 100%, 50%)";
  if (pathColorValue.value != 0)
  {
    pathColorDiv.style.color = "#000";
    pathColorDiv.style.backgroundColor = pathColor;
    pathColorDiv.style.textShadow = "-1px -1px 0 #FFF, 1px -1px 0 #FFF, -1px 1px 0 #FFF, 1px 1px 0 #FFF";
  }
  else
  {
    pathColorDiv.style.color = "#FFF";
    pathColorDiv.style.backgroundColor = pathColor;
    pathColorDiv.style.textShadow = "";
  }

  pathColor = qrzPathColorValue.value == 0 ? "#000" : qrzPathColorValue.value == 361 ? "#FFF" : "hsl(" + qrzPathColorValue.value + ", 100%, 50%)";
  if (qrzPathColorValue.value != 0)
  {
    qrzPathColorDiv.style.color = "#000";
    qrzPathColorDiv.style.backgroundColor = pathColor;
    qrzPathColorDiv.style.textShadow = "-1px -1px 0 #FFF, 1px -1px 0 #FFF, -1px 1px 0 #FFF, 1px 1px 0 #FFF";
  }
  else
  {
    qrzPathColorDiv.style.color = "#FFF";
    qrzPathColorDiv.style.backgroundColor = pathColor;
    qrzPathColorDiv.style.textShadow = "";
  }
}

function setNightMapColors()
{
  let pathColor = GT.settings.map.nightPathColor == 0 ? "#000" : GT.settings.map.nightPathColor == 361 ? "#FFF" : "hsl(" + GT.settings.map.nightPathColor + ", 100%, 50%)";
  if (GT.settings.map.nightPathColor != 0)
  {
    pathNightColorDiv.style.color = "#000";
    pathNightColorDiv.style.backgroundColor = pathColor;
    pathNightColorDiv.style.textShadow = "-1px -1px 0 #FFF, 1px -1px 0 #FFF, -1px 1px 0 #FFF, 1px 1px 0 #FFF";
  }
  else
  {
    pathNightColorDiv.style.color = "#FFF";
    pathNightColorDiv.style.backgroundColor = pathColor;
    pathNightColorDiv.style.textShadow = "";
  }

  pathColor = GT.settings.map.nightQrzPathColor == 0 ? "#000" : GT.settings.map.nightQrzPathColor == 361 ? "#FFF" : "hsl(" + GT.settings.map.nightQrzPathColor + ", 100%, 50%)";
  if (GT.settings.map.nightQrzPathColor != 0)
  {
    pathNightQrzColorDiv.style.color = "#000";
    pathNightQrzColorDiv.style.backgroundColor = pathColor;
    pathNightQrzColorDiv.style.textShadow = "-1px -1px 0 #FFF, 1px -1px 0 #FFF, -1px 1px 0 #FFF, 1px 1px 0 #FFF";
  }
  else
  {
    pathNightQrzColorDiv.style.color = "#FFF";
    pathNightQrzColorDiv.style.backgroundColor = pathColor;
    pathNightQrzColorDiv.style.textShadow = "";
  }
}

function changeOfflineMap()
{
  GT.settings.map.offlineMapIndex = offlineMapSelect.value;
  changeMapLayer();
}

function changeOfflineNightMap()
{
  GT.settings.map.offlineNightMapIndex = offlineMapNightSelect.value;
  changeMapLayer();
}

function changeMapValues()
{
  GT.settings.map.mapOpacity = brightnessValue.value;
  GT.settings.map.mapIndex = mapSelect.value;
  if (GT.settings.app.gtFlagImgSrc > 0 && GT.settings.map.offlineMode == false && GT.settings.app.offAirServicesEnable == true)
  {
    GT.layerVectors.gtflags.setVisible(true);
  }
  else
  {
    GT.layerVectors.gtflags.setVisible(false);
  }

  changeMapLayer();
}

function setLegendGrid(name, newColor)
{
  document.getElementById(name + "gridValue").value = newColor;
}

function setLegendGridSettings()
{
  for (let key in GT.settings.legendColors)
  {
    setLegendGrid(key, GT.settings.legendColors[key]);
  }
}

function resetLegendColors()
{
  for (let key in def_legendColors)
  {
    GT.settings.legendColors[key] = def_legendColors[key];
  }

  setLegendGridSettings();
  
  redrawGrids();
}

function changeLegendColor(source)
{
  let newColor = source.value;

  let name = source.id.replace("gridValue", "");

  GT.settings.legendColors[name] = newColor;

  if (GT.redrawFromLegendTimeoutHandle != null)
  {
    nodeTimers.clearTimeout(GT.redrawFromLegendTimeoutHandle);
  }
  GT.redrawFromLegendTimeoutHandle = nodeTimers.setTimeout(redrawGrids, 500);
}

function changeMapLayer()
{
  GT.map.removeLayer(GT.tileLayer);
  let maps, index, mapOpacity;

  if (GT.settings.map.offlineMode)
  {
    maps = GT.offlineMapsLayer;
    if (GT.settings.map.nightMapEnable && GT.nightTime)
    {
      index = GT.settings.map.offlineNightMapIndex;
      mapOpacity = Number(GT.settings.map.nightMapOpacity);
    }
    else
    {
      index = GT.settings.map.offlineMapIndex;
      mapOpacity = Number(GT.settings.map.mapOpacity);
    }

    mapApiKeyTr.style.display = "none";
    nightMapApiKeyTr.style.display = "none";
  }
  else
  {
    maps = GT.mapsLayer;
    if (GT.settings.map.nightMapEnable && GT.nightTime)
    {
      index = GT.settings.map.nightMapIndex;
      mapOpacity = Number(GT.settings.map.nightMapOpacity);
    }
    else
    {
      index = GT.settings.map.mapIndex;
      mapOpacity = Number(GT.settings.map.mapOpacity);
    }

    if ("keyId" in GT.maps[GT.settings.map.nightMapIndex])
    {
      nightMapApiKeyTr.style.display = "";
      nightMapApiKeyApplyDiv.style.display = "none";
      nightMapApiKeyInput.value = GT.settings.map.apiKeys[GT.maps[GT.settings.map.nightMapIndex].keyId];
      ValidateText(nightMapApiKeyInput);
    }
    else
    {
      nightMapApiKeyTr.style.display = "none";
    }

    if ("keyId" in GT.maps[GT.settings.map.mapIndex])
    {
      mapApiKeyTr.style.display = "";
      mapApiKeyApplyDiv.style.display = "none";
      mapApiKeyInput.value = GT.settings.map.apiKeys[GT.maps[GT.settings.map.mapIndex].keyId];
      ValidateText(mapApiKeyInput);
    }
    else
    {
      mapApiKeyTr.style.display = "none";
    }
  }

  GT.currentMapIndex = index;

  if (GT.maps[index].sourceType == "Group")
  {
    ProcessGroupMapSource(index);
    GT.tileLayer = new ol.layer.Group({ layers: maps[index] });
  }
  else
  {
    GT.tileLayer = new ol.layer.Tile({ source: maps[index] });
  }

  GT.tileLayer.setOpacity(mapOpacity);
  GT.map.getLayers().insertAt(0, GT.tileLayer);

  changeMapBackgroundColor(false);
  setAllGridOpacity();
}

function changeMapBackgroundColor(fromSettings = true)
{
  if (fromSettings == true)
  {
    GT.settings.map.backgroundColor[GT.currentMapIndex] = mapBackgroundColor.value;
  }
  else if (!(GT.currentMapIndex in GT.settings.map.backgroundColor))
  {
    GT.settings.map.backgroundColor[GT.currentMapIndex] = "#000000";
  }

  mapDiv.style.backgroundColor = mapBackgroundColor.value = GT.settings.map.backgroundColor[GT.currentMapIndex];
}

function voiceChangedValue()
{
  GT.settings.audio.speechVoice = Number(alertVoiceInput.value) + 1;
  changeSpeechValues();
}

function timedGetVoices()
{
  try {
    GT.voices = window.speechSynthesis.getVoices();
    if (GT.voices.length > 0 &&  GT.speechAvailable == false)
    {
      alertVoiceInput.title = "Select Voice";
      for (let i = 0; i < GT.voices.length; i++)
      {
        let option = document.createElement("option");
        option.value = i;
        option.text = GT.voices[i].name;
        if (GT.voices[i].default)
        {
          option.selected = true;
        }
        alertVoiceInput.appendChild(option);
      }
      alertVoiceInput.oninput = voiceChangedValue;
      voicesDiv.appendChild(alertVoiceInput);

      if (GT.settings.audio.speechVoice > 0)
      {
        alertVoiceInput.value = GT.settings.audio.speechVoice - 1;
      }

      let msg = new SpeechSynthesisUtterance("\n");
      msg.lang = GT.localeString;
      window.speechSynthesis.speak(msg);

      GT.speechAvailable = true;
    }
    else
    {
      // try again in 10 seconds
      nodeTimers.setTimeout(timedGetVoices, 10000);
    }
  }
  catch (e)
  {
    // try again in 30 seconds
    nodeTimers.setTimeout(timedGetVoices, 30000);
  }
}

function initSpeech()
{
  nodeTimers.setTimeout(timedGetVoices, 1000);
}

function initSoundCards()
{
  navigator.mediaDevices.ondevicechange = (event) =>
  {
    updateSoundCards();
  }
  updateSoundCards();
  setAudioView();
  loadAlerts();
}

function updateSoundCards()
{
  navigator.mediaDevices
    .enumerateDevices()
    .then(gotAudioDevices)
    .catch(errorCallback);
}

function errorCallback(e) { }

function gotAudioDevices(deviceInfos)
{
  soundCardDiv.innerHTML = "";
  let newSelect = document.createElement("select");
  newSelect.id = "soundCardInput";
  newSelect.title = "Select Sound Card";

  let foundCards = {};
  for (let i = 0; i != deviceInfos.length; ++i)
  {
    let deviceInfo = deviceInfos[i];
    if (deviceInfo.kind == "audiooutput")
    {
      let option = document.createElement("option");
      option.value = deviceInfo.deviceId;
      option.text = deviceInfo.label || "Speaker " + (newSelect.length + 1);
      newSelect.appendChild(option);
      foundCards[deviceInfo.deviceId] = option.text;
    }
  }

  if (GT.settings.app.soundcards != null)
  {
    if (!(GT.settings.app.soundCard in foundCards))
    {
      if (GT.settings.app.soundCardName != null)
      {
        let foundId = false;
        // Search the found cards by name and see if we can find the right deviceId
        for (let deviceId in foundCards)
        {
          if (foundCards[deviceId] == GT.settings.app.soundCardName)
          {
            // Found it!
            GT.settings.app.soundCard = deviceId;
            foundId = true;
            break;
          }
        }
        if (foundId == false)
        {
          audioCardWarn(true);
        }
      }
      else
      {
        audioCardWarn(true);
      }
    }
    else
    {
      // Scan for differences
      let warn = false
      for (let soundcard in GT.settings.app.soundcards)
      {
        if (!(soundcard in foundCards))
        {
          warn = true;
          break;
        }
      }
      if (warn == false)
      {
        for (let soundcard in foundCards)
          {
            if (!(soundcard in GT.settings.app.soundcards))
            {
              warn = true;
              break;
            }
          }
      }
      if (warn == true)
      {
        audioCardWarn(false);
      }
    }
  }

  GT.settings.app.soundcards = Object.assign({}, foundCards);

  if (GT.settings.app.soundCard in GT.settings.app.soundcards) GT.settings.app.soundCardName = GT.settings.app.soundcards[GT.settings.app.soundCard];
  
  newSelect.oninput = soundCardChangedValue;
  soundCardDiv.appendChild(newSelect);
  soundCardInput.value = GT.settings.app.soundCard;
}

function audioCardWarn(didSetDefault)
{
  if (GT.settings.app.warnOnSoundcardsChange)
  {
    warnSoundcardHtml.innerHTML =  I18N(didSetDefault == false ? "settings.audio.devicesChanged.label" : "settings.audio.deviceDefaultSet.label");
    warnSoundcardDiv.style.display = "block";
  }
}

function soundCardChangedValue()
{
  GT.settings.app.soundCard = soundCardInput.value;
  if (GT.settings.app.soundCard in GT.settings.app.soundcards) GT.settings.app.soundCardName = GT.settings.app.soundcards[GT.settings.app.soundCard];
  playTestFile();
}

function setPins()
{
  GT.colorLeafletPins = {};
  GT.colorLeafletQPins = {};
  GT.colorLeafletQPins.worked = {};
  GT.colorLeafletQPins.confirmed = {};
  for (let i = 0; i < GT.colorBands.length; i++)
  {
    let pin = new ol.style.Icon({
      src: "img/pin/" + GT.colorBands[i] + ".png",
      anchorYUnits: "pixels",
      anchorXUnits: "pixels",
      anchor: [5, 18]
    });
    GT.colorLeafletPins[GT.colorBands[i]] = pin;
    pin = new ol.style.Icon({
      src: "img/pin/" + GT.colorBands[i] + "w.png",
      anchorYUnits: "pixels",
      anchorXUnits: "pixels",
      anchor: [5, 18]
    });
    GT.colorLeafletQPins.worked[GT.colorBands[i]] = pin;
    pin = new ol.style.Icon({
      src: "img/pin/" + GT.colorBands[i] + "q.png",
      anchorYUnits: "pixels",
      anchorXUnits: "pixels",
      anchor: [5, 18]
    });
    GT.colorLeafletQPins.confirmed[GT.colorBands[i]] = pin;
  }
}

function changeClearOnCQ()
{
  GT.settings.app.clearOnCQ = clearOnCQ.checked; 
}

function loadViewSettings()
{
  gtBandFilter.value = GT.settings.app.gtBandFilter;
  gtModeFilter.value = GT.settings.app.gtModeFilter;
  if (GT.settings.app.gtPropFilter == "") GT.settings.app.gtPropFilter = "mixed";
  gtPropFilter.value = GT.settings.app.gtPropFilter;
  distanceUnit.value = GT.settings.app.distanceUnit;
  languageLocale.value = GT.settings.app.locale;
  N1MMIpInput.value = GT.settings.N1MM.ip;
  N1MMPortInput.value = GT.settings.N1MM.port;
  buttonN1MMCheckBox.checked = GT.settings.N1MM.enable;
  ValidatePort(N1MMPortInput, buttonN1MMCheckBox, null);
  ValidateIPaddress(N1MMIpInput, buttonN1MMCheckBox, null);

  log4OMIpInput.value = GT.settings.log4OM.ip;
  log4OMPortInput.value = GT.settings.log4OM.port;
  buttonLog4OMCheckBox.checked = GT.settings.log4OM.enable;
  ValidatePort(log4OMPortInput, buttonLog4OMCheckBox, null);
  ValidateIPaddress(log4OMIpInput, buttonLog4OMCheckBox, null);

  acLogIpInput.value = GT.settings.acLog.ip;
  acLogPortInput.value = GT.settings.acLog.port;
  acLogCheckbox.checked = GT.settings.acLog.enable;
  acLogMenuCheckbox.checked = GT.settings.acLog.menu;
  acLogStartupCheckbox.checked = GT.settings.acLog.startup;
  acLogConnectCheckbox.checked = GT.settings.acLog.connect;
  ValidatePort(acLogPortInput, acLogCheckbox, null);
  ValidateIPaddress(acLogIpInput, acLogCheckbox, null);
  acLogQsl.value = GT.settings.acLog.qsl;
  acLogQslSpan.style.display = (acLogMenuCheckbox.checked || acLogStartupCheckbox.checked) ? "" : "none";
  buttonAcLogCheckBoxDiv.style.display = (acLogMenuCheckbox.checked) ? "" : "none";

  dxkLogIpInput.value = GT.settings.dxkLog.ip;
  dxkLogPortInput.value = GT.settings.dxkLog.port;
  buttondxkLogCheckBox.checked = GT.settings.dxkLog.enable;
  ValidatePort(dxkLogPortInput, buttondxkLogCheckBox, null);
  ValidateIPaddress(dxkLogIpInput, buttondxkLogCheckBox, null);

  hrdLogbookIpInput.value = GT.settings.HRDLogbookLog.ip;
  hrdLogbookPortInput.value = GT.settings.HRDLogbookLog.port;
  buttonHrdLogbookCheckBox.checked = GT.settings.HRDLogbookLog.enable;
  ValidatePort(hrdLogbookPortInput, buttonHrdLogbookCheckBox, null);
  ValidateIPaddress(hrdLogbookIpInput, buttonHrdLogbookCheckBox, null);

  pstrotatorIpInput.value = GT.settings.pstrotator.ip;
  pstrotatorPortInput.value = GT.settings.pstrotator.port;
  pstrotatorCheckBox.checked = GT.settings.pstrotator.enable;
  ValidatePort(pstrotatorPortInput, pstrotatorCheckBox, null);
  ValidateIPaddress(pstrotatorIpInput, pstrotatorCheckBox, null);

  spotHistoryTimeValue.value = parseInt(
    GT.settings.reception.viewHistoryTimeSec / 60
  );

  let mins = parseInt(spotHistoryTimeValue.value);

  // Split slider minutes into Hours and Minutes for the inputs
  let hInput = document.getElementById("spotHistoryH");
  let mInput = document.getElementById("spotHistoryM");
  
  if (hInput && mInput) {
    // padStart ensures it always shows "05" instead of "5"
    hInput.value = String(Math.floor(mins / 60)).padStart(2, '0');
    mInput.value = String(mins % 60).padStart(2, '0');
  }

  spotPathColorValue.value = GT.settings.reception.pathColor;
  spotNightPathColorValue.value = GT.settings.reception.pathNightColor;
  spotWidthTd.innerHTML = spotWidthValue.value = GT.settings.reception.spotWidth;


  spotMergeValue.checked = GT.settings.reception.mergeSpots;

  lookupOnTx.checked = GT.settings.app.lookupOnTx;
  // lookupCallookPreferred.checked = GT.settings.app.lookupCallookPreferred;
  lookupCloseLog.checked = GT.settings.app.lookupCloseLog;
  lookupMerge.checked = GT.settings.app.lookupMerge;
  lookupMissingGrid.checked = GT.settings.app.lookupMissingGrid;

  clearOnCQ.checked = GT.settings.app.clearOnCQ;

  lookupMissingGridTr.style.display = GT.settings.app.lookupMerge ? "" : "none";

  gridModeDiv.style.display = GT.pushPinMode ? "" : "none";

  spotPathChange();
  setLegendGridSettings();

  mapRightValue.checked = GT.settings.app.mapRight;

  updateLayout(false);
}

function changeMapRight(checkbox)
{
  GT.settings.app.mapRight = mapRightValue.checked;
  updateLayout(false);
}

function loadMsgSettings()
{

  spottingEnable.checked = GT.settings.app.spottingEnable;

  oamsBandActivity.checked = GT.settings.app.oamsBandActivity;
  oamsBandActivityNeighbors.checked = GT.settings.app.oamsBandActivityNeighbors;
  setOamsBandActivity(oamsBandActivity);

  setSpotImage();

  for (const key in GT.settings.msg)
  {
    if (key in window)
    {
      window[key].value = GT.settings.msg[key];
    }
    else
    {
      delete GT.settings.msg[key];
    }
  }

  msgSimplepush.checked = GT.settings.msg.msgSimplepush;
  msgPushover.checked = GT.settings.msg.msgPushover;

  setMsgSettingsView();
}

function setMsgSettingsView()
{
  simplepushMsgEnableTr.style.display = (GT.settings.map.offlineMode == false) ? "" : "none";
  pushoverMsgEnableTr.style.display = (GT.settings.map.offlineMode == false) ? "" : "none";

  simplePushDiv.style.display = (GT.settings.msg.msgSimplepush && GT.settings.map.offlineMode == false) ? "" : "none";
  pushOverDiv.style.display = (GT.settings.msg.msgPushover && GT.settings.map.offlineMode == false) ? "" : "none";

  ValidateText(msgSimplepushApiKey);
  ValidateText(msgPushoverUserKey);
  ValidateText(msgPushoverToken);
}

function loadAdifSettings()
{
  qslAuthority.value = GT.settings.app.qslAuthority;
  qsoItemsPerPageTd.innerHTML = qsoItemsPerPageValue.value = GT.settings.app.qsoItemsPerPage;

  if (Object.keys(GT.settings.app.workingCallsigns).length == 0) {
    GT.settings.app.workingCallsignEnable = false;
    workingCallsignEnableTd.style.display = "none";
  }
  workingCallsignEnable.checked = GT.settings.app.workingCallsignEnable;
  workingCallsignsValue.value = Object.keys(GT.settings.app.workingCallsigns).join(",");
  ValidateCallsigns(workingCallsignsValue);

  if (Object.keys(GT.settings.app.workingGrids).length == 0) {
    GT.settings.app.workingGridEnable = false;
    workingGridEnableTd.style.display = "none";
  }
  workingGridEnable.checked = GT.settings.app.workingGridEnable;
  workingGridsValue.value = Object.keys(GT.settings.app.workingGrids).join(",");
  ValidateGrids(workingGridsValue);

  if (GT.settings.app.workingDate == 0) {
    GT.settings.app.workingDateEnable = false;
    workingDateEnableTd.style.display = "none";
  }
  workingDateEnable.checked = GT.settings.app.workingDateEnable;
  displayWorkingDate();

  if (GT.platform == "mac") selectTQSLButton.style.display = "none";

  // Generic Setting Applicator to stop DOM query thrashing
  const applySettings = (settingsObj, callback) => {
    for (let key in settingsObj) {
      let el = document.getElementById(key);
      if (el) {
        if (el.type === "checkbox") el.checked = settingsObj[key];
        else el.value = settingsObj[key];
        if (callback) callback(key, settingsObj[key], el);
      } else if (!callback) {
        delete settingsObj[key]; // Prune invalid config entries dynamically
      }
    }
  };

  applySettings(GT.settings.adifLog.menu, (k, val) => {
    let div = document.getElementById(k + "Div");
    if (div) div.style.display = val ? "" : "none";
  });
  
  applySettings(GT.settings.adifLog.startup);
  
  applySettings(GT.settings.adifLog.nickname, (k, val) => {
    if (k == "nicknameeQSLCheckBox") eQSLNickname.style.display = val ? "" : "none";
  });
  
  applySettings(GT.settings.adifLog.text, (k, val, el) => ValidateText(el));
  
  applySettings(GT.settings.adifLog.qsolog, (k, val) => {
    if (k == "logLOTWqsoCheckBox") {
      lotwUpload.style.display = val ? "" : "none";
      trustedTestButton.style.display = val ? "" : "none";
    }
  });

  if (clubCall.value == "" && GT.settings.app.myRawCall != "NOCALL") {
    clubCall.value = GT.settings.app.myRawCall;
    ValidateText(clubCall);
  }

  try {
    findTrustedQSLPaths();
  } catch (e) {
    if (logLOTWqsoCheckBox.checked == true) {
      alert("Unable to access LoTW TrustedQSL (TQSL) due to OS permissions\nLogging to LoTW disabled for this session\nRun as administrator or allow file access to GridTracker if problem persists");
      logLOTWqsoCheckBox.checked = false;
    }
  }

  CloudlogStationProfileID.style.color = "#FF0";
  CloudlogStationProfileID.style.backgroundColor = "darkblue";
  CloudlogGetProfiles();

  updateAppLogsUI();
  setAdifStartup(loadAdifCheckBox);
  ValidateQrzApi(qrzApiKey);

  lotwStation.addEventListener('mousedown', (event) => {
    if (event.target.tagName === 'SELECT') {
      setLotwStationOptions();
    }
  });
}

function startupButtonsAndInputs()
{
  try
  {
    setWindowThemeSelector();
    GT.pushPinMode = !(GT.settings.app.pushPinMode == true);
    togglePushPinMode();
    udpForwardEnable.checked = GT.settings.app.wsjtForwardUdpEnable;
    multicastEnable.checked = GT.settings.app.multicast;
    adifBroadcastMulticast.checked = GT.settings.app.adifBroadcastMulticast;

    GT.settings.app.gridViewMode = clamp(GT.settings.app.gridViewMode, 1, 3);
    gtGridViewMode.value = GT.settings.app.gridViewMode;
    graylineImg.src = GT.GraylineImageArray[GT.settings.app.graylineImgSrc];
    gtFlagImg.src = GT.gtFlagImageArray[GT.settings.app.gtFlagImgSrc % 2];
    offAirServicesEnable.checked = GT.settings.app.offAirServicesEnable;

    alertMuteImg.src = GT.alertImageArray[GT.settings.audio.alertMute];
    modeImg.src = GT.maidenheadModeImageArray[GT.settings.app.sixWideMode];

    if (GT.settings.app.myGrid.length > 0)
    {
      homeQTHInput.value = GT.settings.app.myGrid.substr(0, 6);
      if (ValidateGridsquare(homeQTHInput, null)) 
      {
        setCenterGridsquare();
        saveCenterGridsquare();
      }
    }
    ValidateCallsign(alertValueInput, null);

    if (GT.settings.map.offlineMode == true)
    {
      conditionsButton.style.display = "none";
      buttonPsk24CheckBoxDiv.style.display = "none";
      buttonQRZCheckBoxDiv.style.display = "none";
      buttonLOTWCheckBoxDiv.style.display = "none";
      buttonClubCheckBoxDiv.style.display = "none";

      potaButton.style.display = "none";
      lookupButton.style.display = "none";
      radarButton.style.display = "none";
      mapSelect.style.display = "none";
      mapNightSelect.style.display = "none";

    }
    else
    {
      offlineMapSelect.style.display = "none";
      offlineMapNightSelect.style.display = "none";
    }

    updateOffAirServicesViews();
  }
  catch (e)
  {
    console.error(e);
  }
}

function startupEventsAndTimers()
{
  // Clock timer update every second
  nodeTimers.setInterval(displayTime, 1000);
  nodeTimers.setInterval(reportDecodes, 60000);
  nodeTimers.setInterval(oamsBandActivityCheck, 300000);
}

function initSettingsTabs()
{
  settingsTabcontent = document.getElementsByClassName("settingsTabcontent");
  for (i = 0; i < settingsTabcontent.length; i++)
  {
    settingsTabcontent[i].style.display = "none";
  }
  generalSettingsDiv.style.display = "";
}

function postInit()
{
  let section = "mapViewFilters";
  try
  {
    displayMapViewFilters();
    section = "InitSettingsTabs";
    initSettingsTabs();
    section = "DrawMapLines";
    drawAllGrids();
    drawRangeRings();
    section = "Spots";
    loadReceptionReports();
    redrawSpots();
    section = "UDPListenerForward";
    startForwardListener();
    section = "LastTraffic";
    addLastTraffic("GridTracker2<br>" + gtShortVersion);
    section = "displayRadar";
    displayRadar();
    section = "PredictionInit";
    predInit();
    section = "PredictionLayer";
    displayPredLayer();
    section = "TimezonesLayer";
    displayTimezones();

    section = "inputRanges";
    let x = document.querySelectorAll("input[type='range']");
    for (let i = 0; i < x.length; i++)
    {
      if (x[i].title.length > 0) x[i].title += "\n";
      x[i].title += "(Use Arrow Keys For Smaller Increments)";
    }

    section = "DataBreakout";
    initPopupWindow();
    section = "StatsWindow";
    openStatsWindow(false);
    section = "LookupWindow";
    openLookupWindow(false);
    section = "BaWindow";
    openBaWindow(false);
    section = "AlertWindow";
    openAlertWindow(false);
    section = "ConditionsWindow";
    openConditionsWindow(false);
    section = "RosterWindow";
    openCallRosterWindow(false);
    section = "ButtonPanelInit";
    buttonPanelInit();
    projectionImg.style.filter = GT.settings.map.projection == "AEQD" ? "" : "grayscale(1)";
    section = "MouseTrack";
    displayMouseTrack();
    section = "FileSelectorHandles";
    createFileSelectorHandlers();
    section = "registerCutAndPasteContextMenu";
    registerCutAndPasteContextMenu();
    section = "registerLegendContextMenus";
    registerLegendContextMenus();
    section = "SettingTimers";
    nodeTimers.setInterval(removeFlightPathsAndDimSquares, 2000); // Every 2 seconds
    nodeTimers.setInterval(downloadCtyDat, 86400000);  // Every 24 hours
    nodeTimers.setInterval(refreshSpotsNoTx, 300000); // Redraw spots every 5 minutes, this clears old ones
    nodeTimers.setTimeout(downloadCtyDat, 120000);    // In 2 minutes, when the dust settles
    nodeTimers.setTimeout(checkForNewVersion, 10000); // Informative check
    section = "passwordInputs";
    stylePasswordInputs();
  }
  catch (e)
  {
    console.log("!Init Failed Section!: " + section + "\nPlease report failed section");
    console.log(JSON.stringify(e));
  }
}

function registerLegendContextMenus()
{
  predButton.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const menu = new Menu();
    
    if (GT.settings.map.predMode > 0)
    {
      menu.append(new MenuItem({
        type: "checkbox",
        label: I18N("legend.title"),
        checked: GT.settings.map.predLegend,
        click: function ()
        {
          GT.settings.map.predLegend = !GT.settings.map.predLegend;
          predDiv.style.display = (GT.settings.map.predLegend) ? "" : "none";
        }
      }));

      menu.append(new MenuItem({ type: "separator" }));
    }
    
    GT.predLayers.forEach((layerKey, index) => {
      menu.append(new MenuItem({
        type: "radio",
        label: I18N(layerKey),
        checked: (GT.settings.map.predMode === index),
        click: function ()
        {
          directPredLayer(index);
        }
      }));
    });
    
    menu.popup();
  });


  buttonSpotsBoxDiv.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const menu = new Menu();
    if (GT.settings.app.spotView != 0)
    {
      menu.append(new MenuItem({
        type: "checkbox",
        label: I18N("legend.title"),
        checked: GT.settings.map.spotLegend,
        click: function ()
        {
          GT.settings.map.spotLegend = !GT.settings.map.spotLegend;
          spotsDiv.style.display = GT.settings.map.spotLegend ? "" : "none";
        }
      }));
      menu.append(new MenuItem({ type: "separator" }));
    }

    GT.spotLayers.forEach((layerKey, index) => {
      menu.append(new MenuItem({
        type: "radio",
        label: I18N(layerKey),
        checked: (GT.settings.app.spotView === index),
        click: function ()
        {
          directSpotLayer(index);
        }
      }));
    });
    
    menu.popup();
  });
}

electron.ipcRenderer.on("versionInfo", (event, info) => {
  if (info != null)
  {
    if (GT.gtVersionStr != info.version && GT.lastVersionInfo != info.version)
    {
      if (!info.autoDownload)
      {
        // settings.About.label
        addLastTraffic("<font style='color:lightgreen'>" + I18N("gt.NewVersionAvailable") + "</font><br><font style='color:cyan'>" + info.version + "</font><br><div class='button' onclick='openAboutBox()'>" + I18N("settings.About.label") + "</div>");
        updateVersionText.innerHTML = "<font style='color:lightgreen'>" + I18N("gt.NewVersionAvailable") + "</font><br><font style='color:cyan'>" + info.version + "</font><br><div class='button' onclick='downloadUpdate()'>" + I18N("gt.Download") + "</div>";
      }
    }

    GT.lastVersionInfo = info.version
  }
});

function downloadUpdate()
{
  GT.lastVersionInfo = "";
  electron.ipcRenderer.send("downloadUpdate", null);
}

electron.ipcRenderer.on("updateDownloaded", (event, info) => {
  if (info != null)
  {
    if (GT.gtVersionStr != info.version && GT.lastVersionInfo != info.version)
    {
      const html = "<font style='color:yellow'>" + I18N("gt.NewVersionDownloaded") + "</font><br><font style='color:cyan'>" + info.version + "</font><br><div class='button' onclick='installAndRestart()'>" + I18N("gt.InstallAndRestart") + "</div>"
      updateVersionText.innerHTML = html;
      addLastTraffic(html);
    }

    GT.lastVersionInfo = info.version
  }
});

function installAndRestart()
{
  saveAndCloseApp(false);
  electron.ipcRenderer.sendSync("installAndRestart", "exit");
}

function checkForNewVersion()
{
  electron.ipcRenderer.send("updateAvailable");
  nodeTimers.setTimeout(checkForNewVersion, 86400000); // Informative check in 24 hours
}

function buttonPanelInit()
{
  let iconButtons = buttonsDiv.querySelectorAll(".iconButton");

  for (let i = 0; i < iconButtons.length; i++)
  {
    GT.defaultButtons[i] = iconButtons[i].id;

    iconButtons[i].addEventListener("dragstart", buttonDragStart);
    iconButtons[i].draggable = true;
  }

  if (GT.settings.app.buttonPanelOrder.length > 0)
  {
    // First make sure that all the saved buttons exist.
    let i = GT.settings.app.buttonPanelOrder.length;
    while (i--)
    {
      if (document.getElementById(GT.settings.app.buttonPanelOrder[i]) == null)
      {
        GT.settings.app.buttonPanelOrder.splice(i, 1);
      }
    }

    for (let i = 0; i < GT.defaultButtons.length; i++)
    {
      if (GT.settings.app.buttonPanelOrder.indexOf(GT.defaultButtons[i]) == -1)
      {
        GT.settings.app.buttonPanelOrder.push(GT.defaultButtons[i]);
      }
    }

    setButtonPanelOrder(GT.settings.app.buttonPanelOrder);
  }
  else
  {
    GT.settings.app.buttonPanelOrder = [...GT.defaultButtons];
  }
}

function setButtonPanelOrder(which)
{
  let buttonObjects = {};
  let iconButtons = buttonsDiv.querySelectorAll(".iconButton");

  // Save a point to each button element so we don't destroy it
  for (let i = 0; i < iconButtons.length; i++)
  {
    buttonObjects[iconButtons[i].id] = iconButtons[i];
  }

  // Clear the button panel
  while (buttonsDiv.lastElementChild)
  {
    buttonsDiv.removeChild(buttonsDiv.lastElementChild);
  }

  // Append each button by its order
  for (let i = 0; i < which.length; i++)
  {
    buttonsDiv.appendChild(buttonObjects[which[i]]);
  }
  saveButtonOrder();
}

function buttonDragStart(event)
{
  event.dataTransfer.setData("Button", event.target.id);
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.dropEffect = "move";
}

function onButtonDrop(event)
{
  if (event.target.draggable)
  {
    let dragElement = document.getElementById( event.dataTransfer.getData("Button"));
    let target = event.target;
    let parent = event.target.parentNode;
    while (parent != buttonsDiv)
    {
      target = parent;
      parent = target.parentNode;
    }

    let movingButton = GT.settings.app.buttonPanelOrder.indexOf(dragElement.id);
    let targetButton = GT.settings.app.buttonPanelOrder.indexOf(target.id);


    if (target.nextElementSibling)
    {
      if (movingButton < targetButton)
      {
        parent.insertBefore(dragElement, target.nextElementSibling);
      }
      else
      {
        parent.insertBefore(dragElement, target);
      }
    }
    else
    {
      parent.appendChild(dragElement);
    }

    saveButtonOrder();
    event.preventDefault();
  }
}

document.addEventListener("drop", onButtonDrop);
document.addEventListener("dragover", function(event) {
  if (event.target.draggable)
  {
    event.preventDefault();
  }
});


function saveButtonOrder()
{
  let iconButtons = buttonsDiv.querySelectorAll("[class^='iconButton']");
  GT.settings.app.buttonPanelOrder = [];
  for (let i = 0; i < iconButtons.length; i++)
  {
    GT.settings.app.buttonPanelOrder[i] = iconButtons[i].id;
  }
}

function init()
{
  updateByBandMode();

  initQSOdata();

  aboutVersionText.innerHTML = gtShortVersion;
  supportVersionsText.innerHTML = `<span style="font-size:smaller;color:#999;">Electron v${process.versions.electron} OpenLayers: v${ol.util.VERSION}<br>(${GT.Platform} ${os.arch()})</span>`;

  GT.currentDay = parseInt(timeNowSec() / 86400);

  startupDiv.style.display = "block";
  startupStatusDiv.innerHTML = "Starting...";
  nodeTimers.setTimeout(startupEngine, 100);
}

function startupEngine()
{
  if (GT.startupTable.length > 0)
  {
    let funcInfo = GT.startupTable.shift();
    funcInfo[0] && funcInfo[0]();
    startupStatusDiv.innerHTML = funcInfo[1];
    nodeTimers.setTimeout(startupEngine, 100);
  }
  else
  {
    startupDiv.style.display = "none";
    main.style.display = "block";
    nodeTimers.setTimeout(endStartup, 500);
  }
}

function refreshI18NStrings()
{
  GT.startupTable.forEach(function (item)
  {
    if (item[2].length > 0) item[1] = I18N(item[2]);
  })
}

function endStartup()
{
  if (loadPsk24CheckBox.checked == true) grabPsk24();
  startupAdifLoadCheck();
  GT.finishedLoading = true;
}

function loadPortSettings()
{
  multicastEnable.checked = GT.settings.app.multicast;
  multicastIpInput.value = GT.settings.app.wsjtIP;

  adifBroadcastPort.value = GT.settings.app.adifBroadcastPort;
  adifBroadcastIP.value = GT.settings.app.adifBroadcastIP;
  adifBroadcastMulticast.checked = GT.settings.app.adifBroadcastMulticast;
  adifBroadcastEnable.checked = GT.settings.app.adifBroadcastEnable;
  
  setMulticastEnable(multicastEnable);
  udpPortInput.value = GT.settings.app.wsjtUdpPort;
  ValidatePort(udpPortInput, null, CheckReceivePortIsNotForwardPort);
  udpForwardPortInput.value = GT.settings.app.wsjtForwardUdpPort;
  ValidatePort(udpForwardPortInput, null, CheckForwardPortIsNotReceivePort);
  udpForwardIpInput.value = GT.settings.app.wsjtForwardUdpIp;
  ValidateIPaddresses(udpForwardIpInput, null);
  setForwardIp();
  udpForwardEnable.checked = GT.settings.app.wsjtForwardUdpEnable;
  setUdpForwardEnable(udpForwardEnable);

  setAdifBroadcastMulticast(adifBroadcastMulticast);
  ValidatePort(adifBroadcastPort, adifBroadcastEnable, CheckAdifBroadcastPortIsNotReceivePort);
  setAdifBroadcastEnable(adifBroadcastEnable);
}

function encodeQBOOL(byteArray, offset, value)
{
  return byteArray.writeUInt8(value ? 1 : 0, offset);
}

function encodeQUINT32(byteArray, offset, value)
{
  if (value == -1) value = 4294967295;
  return byteArray.writeUInt32BE(value, offset);
}

function encodeQINT32(byteArray, offset, value)
{
  return byteArray.writeInt32BE(value, offset);
}

function encodeQUTF8(byteArray, offset, value)
{
  offset = encodeQUINT32(byteArray, offset, value.length);
  let wrote = byteArray.write(value, offset, value.length);
  return wrote + offset;
}

function encodeQDOUBLE(byteArray, offset, value)
{
  return byteArray.writeDoubleBE(value, offset);
}

function startForwardListener()
{
  if (GT.forwardUdpServer != null)
  {
    GT.forwardUdpServer.close();
  }
  if (GT.closing == true) return;

  const dgram = require("dgram");
  GT.forwardUdpServer = dgram.createSocket({
    type: "udp4",
    reuseAddr: true
  });

  GT.forwardUdpServer.on("listening", function () { });
  GT.forwardUdpServer.on("error", function ()
  {
    GT.forwardUdpServer.close();
    GT.forwardUdpServer = null;
  });
  GT.forwardUdpServer.on("message", function (originalMessage, remote)
  {
    let offset = 0;
    const magicKey = originalMessage.readUInt32BE(offset);
    offset += 4;

    if (magicKey != 0xadbccbda) {
      return;
    }

    offset += 4; // schema_number
    offset += 4; // type

    const idLen = originalMessage.readUInt32BE(offset);
    offset += 4;

    const id = idLen === 0xffffffff ? "" : originalMessage.toString("utf8", offset, offset + idLen);

    if (id in GT.instances) {
      wsjtUdpMessage(
        originalMessage,
        originalMessage.length,
        GT.instances[id].remote.port,
        GT.instances[id].remote.address
      );
    }
  });
  GT.forwardUdpServer.bind(0);
}

function sendForwardUdpMessage(msg, length)
{
  if (GT.forwardUdpServer)
  {
    const port = GT.settings.app.wsjtForwardUdpPort;
    for (let i = 0; i < GT.forwardIPs.length; i++) 
    {
      GT.forwardUdpServer.send(msg, 0, length, port, GT.forwardIPs[i]);
    }
  }
}

function wsjtUdpMessage(msg, length, port, address)
{
  if (GT.wsjtUdpServer)
  {
    GT.wsjtUdpServer.send(msg, 0, length, port, address);
  }
}

function checkWsjtxListener()
{
  if (GT.wsjtUdpServer == null || (GT.wsjtUdpSocketReady == false && GT.wsjtUdpSocketError == true))
  {
    GT.wsjtCurrentPort = -1;
    GT.wsjtCurrentIP = "none";
  }
  updateWsjtxListener(GT.settings.app.wsjtUdpPort);
}


function createQtReader(buffer) {
  let offset = 0;

  return {
    remaining() {
      return buffer.length - offset;
    },

    u8() {
      const value = buffer.readUInt8(offset);
      offset += 1;
      return value;
    },

    u32() {
      const value = buffer.readUInt32BE(offset);
      offset += 4;
      return value;
    },

    i32() {
      const value = buffer.readInt32BE(offset);
      offset += 4;
      return value;
    },

    u64() {
      let value = 0;
      for (let i = 0; i < 8; i++)
      {
        value = value * 256 + buffer[offset+i];
      }
      offset += 8;
      return value;
    },

    f64() {
      const value = buffer.readDoubleBE(offset);
      offset += 8;
      return value;
    },

    utf8() {
      const len = buffer.readUInt32BE(offset);
      offset += 4;

      if (len === 0xffffffff) {
        return "";
      }

      const value = buffer.toString("utf8", offset, offset + len);
      offset += len;
      return value;
    },

    offset() {
      return offset;
    }
  };
}

/**
 * Fast, Zero-GC string hashing using FNV-1a.
 * Converts "WSJT-X - HF" into a short anonymous hex string like "a8f3b2c1"
 */
function hashAppString(str) {
    if (typeof str !== 'string' || str.length === 0) return "0";

    let hash = 2166136261; // FNV offset basis (0x811C9DC5)

    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        // FNV prime multiplication done via bit shifts for max speed
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }

    // `>>> 0` forces V8 to treat the result as an unsigned 32-bit integer.
    // `.toString(16)` converts it to a clean hexadecimal string.
    return (hash >>> 0).toString(16); 
}

function addNewInstance(instanceId)
{
  // Instantiate all properties immediately
  GT.instances[instanceId] = {
    valid: false,
    open: false,
    crEnable: true,
    canRoster: true,
    oldStatus: null,
    status: null,
    instanceKey: null,
    instanceHash: hashAppString(instanceId)
  };

  if (Object.keys(GT.instances).length > 1)
  {
    multiRigCRDiv.style.display = "inline-block";
    haltTXDiv.style.display = "inline-block";
  }
}

function updateWsjtxListener(port)
{
  if (port == GT.wsjtCurrentPort && GT.settings.app.wsjtIP == GT.wsjtCurrentIP) { return; }
  if (GT.wsjtUdpServer != null)
  {
    if (multicastEnable.checked == true && GT.settings.app.wsjtIP != "")
    {
      try
      {
        GT.wsjtUdpServer.dropMembership(GT.settings.app.wsjtIP);
      }
      catch (e)
      {
        console.error(e);
      }
    }
    GT.wsjtUdpServer.close();
    GT.wsjtUdpServer = null;
    GT.wsjtUdpSocketReady = false;
  }
  if (GT.closing == true) return;
  GT.wsjtUdpSocketError = false;
  const dgram = require("dgram");
  GT.wsjtUdpServer = dgram.createSocket({
    type: "udp4",
    reuseAddr: true
  });
  if (multicastEnable.checked == true && GT.settings.app.wsjtIP != "")
  {
    GT.wsjtUdpServer.on("listening", function ()
    {
      GT.wsjtUdpServer.setBroadcast(true);
      GT.wsjtUdpServer.setMulticastTTL(3);
      let interfaces = os.networkInterfaces();
      for (let i in interfaces)
      {
        for (let x in interfaces[i])
        {
          if (interfaces[i][x].family == "IPv4")
          {
            GT.wsjtUdpServer.addMembership(GT.settings.app.wsjtIP, interfaces[i][x].address);
          }
        }
      }
      GT.wsjtUdpSocketReady = true;
    });
  }
  else
  {
    GT.settings.app.multicast = false;
    GT.wsjtCurrentIP = GT.settings.app.wsjtIP = "";
    GT.wsjtUdpServer.on("listening", function ()
    {
      GT.wsjtUdpServer.setBroadcast(true);
      GT.wsjtUdpSocketReady = true;
    });
  }
  GT.wsjtUdpServer.on("error", function ()
  {
    GT.wsjtUdpServer.close();
    GT.wsjtUdpServer = null;
    GT.wsjtUdpSocketReady = false;
    GT.wsjtUdpSocketError = true;
  });

  GT.wsjtUdpServer.on("message", function (message, remote)
  {
    if (GT.finishedLoading == false) return;

    if (!(remote.port in GT.lastWsjtMessageByPort))
    {
      GT.lastWsjtMessageByPort[remote.port] = Buffer.from([0x01]);
    }

    let testBuffer = Buffer.from(message);
    if (testBuffer.equals(GT.lastWsjtMessageByPort[remote.port]))
    {
      return;
    }

    GT.lastWsjtMessageByPort[remote.port] = testBuffer;

    if (typeof udpForwardEnable != "undefined" && udpForwardEnable.checked == true)
    {
      sendForwardUdpMessage(message, message.length);
    }

    const r = createQtReader(message);
    const newMessage = {};

    newMessage.magic_key = r.u32();
    if (newMessage.magic_key != 0xadbccbda) {
      return;
    }

    newMessage.schema_number = r.u32();
    newMessage.type = r.u32();
    newMessage.Id = r.utf8();

    const instanceId = newMessage.Id;

    if (!(instanceId in GT.instances)) {
      addNewInstance(instanceId);
      GT.instanceCount++;
    }

    const instance = GT.instances[instanceId];
    const wasClosed = instance.open === false;

    instance.open = true;
    instance.remote = remote;

    if (wasClosed) {
      updateRosterInstances();
    }

    switch (newMessage.type) {
      case 1: {
        newMessage.Frequency = r.u64();
        newMessage.Band = formatBand(Number(newMessage.Frequency) / 1000000);
        newMessage.MO = r.utf8();
        newMessage.DXcall = r.utf8();
        newMessage.Report = r.utf8();
        newMessage.TxMode = r.utf8();
        newMessage.TxEnabled = r.u8();
        newMessage.Transmitting = r.u8();
        newMessage.Decoding = r.u8();
        newMessage.RxDF = r.i32();
        newMessage.TxDF = r.i32();
        newMessage.DEcall = r.utf8();
        newMessage.DEgrid = r.utf8();
        newMessage.DXgrid = r.utf8();
        newMessage.TxWatchdog = r.u8();
        newMessage.Submode = r.utf8();
        newMessage.Fastmode = r.u8();

        newMessage.SopMode = r.remaining() > 0 ? r.u8() : -1;
        newMessage.FreqTol = r.remaining() > 0 ? r.i32() : -1;
        newMessage.TRP = r.remaining() > 0 ? r.i32() : -1;
        newMessage.ConfName = r.remaining() > 0 ? r.utf8() : null;
        newMessage.TxMessage = r.remaining() > 0 ? r.utf8() : null;

        if (instance.status && newMessage.SopMode != instance.status.SopMode) GT.callRoster = {};
        instance.oldStatus = instance.status;
        instance.status = newMessage;
        instance.valid = true;
        break;
      }

      case 2: {
        if (!instance.valid) return;
        
        const status = instance.status;
        newMessage.NW = r.u8();
        newMessage.TM = r.u32();
        newMessage.SR = r.i32();
        newMessage.DT = r.f64();
        newMessage.DF = r.u32();
        newMessage.MO = r.utf8();
        newMessage.Msg = r.utf8();
        newMessage.LC = r.u8();
        newMessage.OA = r.u8();
        newMessage.OF = status.Frequency;
        newMessage.OC = status.DEcall;
        newMessage.OG = status.DEgrid;
        newMessage.OM = status.MO;
        newMessage.OB = status.Band;
        newMessage.SP = status.SopMode;
        break;
      }

      case 3: {
        if (!instance.valid) return;
        break;
      }

      case 5: {
        if (!instance.valid) return;

        newMessage.DateOff = r.u64();
        newMessage.TimeOff = r.u32();
        newMessage.timespecOff = r.u8();

        if (newMessage.timespecOff === 2) {
          newMessage.offsetOff = r.i32();
        }

        newMessage.DXCall = r.utf8();
        newMessage.DXGrid = r.utf8();
        newMessage.Frequency = r.u64();
        newMessage.MO = r.utf8();
        newMessage.ReportSend = r.utf8();
        newMessage.ReportRecieved = r.utf8();
        newMessage.TXPower = r.utf8();
        newMessage.Comments = r.utf8();
        newMessage.Name = r.utf8();
        newMessage.DateOn = r.u64();
        newMessage.TimeOn = r.u32();
        newMessage.timespecOn = r.u8();

        if (newMessage.timespecOn === 2) {
          newMessage.offsetOn = r.i32();
        }

        newMessage.Operatorcall = r.remaining() > 0 ? r.utf8() : "";
        newMessage.Mycall = r.remaining() > 0 ? r.utf8() : "";
        newMessage.Mygrid = r.remaining() > 0 ? r.utf8() : "";
        newMessage.ExchangeSent = r.remaining() > 0 ? r.utf8() : "";
        newMessage.ExchangeReceived = r.remaining() > 0 ? r.utf8() : "";
        break;
      }

      case 6: {
        if (!instance.valid) return;
        break;
      }

      case 10: {
        if (!instance.valid ) return;

        const status = instance.status;

        newMessage.NW = r.u8();
        newMessage.TM = r.u32();
        newMessage.SR = r.i32();
        newMessage.DT = r.f64();
        newMessage.Frequency = r.u64();
        newMessage.Drift = r.i32();
        newMessage.Callsign = r.utf8();
        newMessage.Grid = r.utf8();
        newMessage.Power = r.i32();
        newMessage.OA = r.u8();
        newMessage.OF = status.Frequency;
        newMessage.OC = status.DEcall;
        newMessage.OG = status.DEgrid;
        newMessage.OM = status.MO;
        newMessage.OB = status.Band;
        break;
      }

      case 12: {
        if (!instance.valid) return;
        newMessage.ADIF = r.utf8();
        break;
      }

      default:
        return;
    }

    if (instance.valid && newMessage.type in GT.wsjtHandlers) {
      newMessage.remote = remote;
      newMessage.instance = instanceId;

      GT.wsjtHandlers[newMessage.type](newMessage);
      if (GT.updateLastMsgTimer != null)
      {
        nodeTimers.clearTimeout(GT.updateLastMsgTimer);
      }
      GT.updateLastMsgTimer = nodeTimers.setTimeout(updateLastMsgTimeDiv, 500, newMessage.Id);
    }
  });
  GT.wsjtUdpServer.bind(port);
  GT.wsjtCurrentPort = port;
  GT.wsjtCurrentIP = GT.settings.app.wsjtIP;
}



function updateLastMsgTimeDiv(id)
{
  lastMsgTimeDiv.innerHTML = I18N("gt.newMesg.Recvd") + " " + id;
  GT.lastTimeSinceMessageInSeconds = GT.timeNow;
  updateLastMsgTimer = null;
}

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

function hamQthGetSessionCallback(buffer, resultTd)
{
  let oParser = new DOMParser();
  let oDOM = oParser.parseFromString(buffer, "text/xml");
  let result = "";
  if (oDOM != null)
  {
    let json = XML2jsobj(oDOM.documentElement);
    if (json.hasOwnProperty("session"))
    {
      if (json.session.hasOwnProperty("session_id"))
      {
        result = "<font color='green'>Valid</font>";
        GT.qrzLookupSessionId = json.session.session_id;
      }
      else
      {
        result = "<font color='red'>" + json.session.error + "</font>";
        GT.qrzLookupSessionId = null;
      }
    }
    else
    {
      result = "<font color='red'>Invalid Response</font>";
      GT.qrzLookupSessionId = null;
    }
  }
  else
  {
    result = "<font color='red'>Unknown Error</font>";
    GT.qrzLookupSessionId = null;
  }
  if (resultTd == null)
  {
    // It's a true session Request
    SessionResponse(GT.qrzLookupSessionId, result);
  }
  else
  {
    GT.qrzLookupSessionId = null;
    resultTd.innerHTML = result;
  }
}

function qrzGetSessionCallback(buffer, resultTd, useCache)
{
  let oParser = new DOMParser();
  let oDOM = oParser.parseFromString(buffer, "text/xml");
  let result = "";
  if (oDOM != null)
  {
    let json = XML2jsobj(oDOM.documentElement);
    if (json.hasOwnProperty("Session"))
    {
      if (json.Session.hasOwnProperty("Key"))
      {
        result = "<font color='green'>Valid</font>";
        GT.qrzLookupSessionId = json.Session.Key;
      }
      else
      {
        result = "<font color='red'>" + json.Session.Error + "</font>";
        GT.qrzLookupSessionId = null;
      }
    }
    else
    {
      result = "<font color='red'>Invalid Response</font>";
      GT.qrzLookupSessionId = null;
    }
  }
  else
  {
    result = "<font color='red'>Unknown Error</font>";
    GT.qrzLookupSessionId = null;
  }
  if (resultTd == null)
  {
    // It's a true session Request
    SessionResponse(GT.qrzLookupSessionId, result, useCache);
  }
  else resultTd.innerHTML = result;
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
      GT.qrzLookupCallsign +
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
      GT.qrzLookupCallsign,
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
      GT.qrzLookupCallsign +
      "&prg=GridTracker",
      qthHamLookupResults,
      GT.qrzLookupGrid,
      "https",
      443,
      useCache
    );
  }
}

function qthHamLookupResults(buffer, gridPass, useCache)
{
  let oParser = new DOMParser();
  let oDOM = oParser.parseFromString(buffer, "text/xml");
  let result = "";
  if (oDOM != null)
  {
    let json = XML2jsobj(oDOM.documentElement);
    if (json.hasOwnProperty("search"))
    {
      if (gridPass) json.search.gtGrid = gridPass;
      json.search.source =
        "<tr><td>Source</td><td><font color='orange'><b><div style='cursor:pointer' onClick='window.opener.openSite(\"https://www.hamqth.com/" +
        json.search.callsign.toUpperCase() +
        "\");'>HamQTH</div></b></font></td></tr>";

      cacheLookupObject(json.search, gridPass, true);
    }
    else
    {
      GT.qrzLookupSessionId = null;
      setLookupDiv(
        "lookupInfoDiv",
        "<br><b>" + I18N("gt.lookup.NoResult") + "</b><br><br>"
      );
    }
  }
  else
  {
    setLookupDiv("lookupInfoDiv", String(buffer));
    GT.qrzLookupSessionId = null;
  }
}

function qrzLookupResults(buffer, gridPass, useCache)
{
  let oParser = new DOMParser();
  let oDOM = oParser.parseFromString(buffer, "text/xml");
  let result = "";
  if (oDOM != null)
  {
    let json = XML2jsobj(oDOM.documentElement);
    if (json.hasOwnProperty("Callsign"))
    {
      let call = "";
      if (json.Callsign.hasOwnProperty("callsign"))
      {
        json.Callsign.call = lookup.callsign;
        delete json.Callsign.callsign;
      }
      if (json.Callsign.hasOwnProperty("call")) call = json.Callsign.call;
      if (GT.settings.app.lookupService == "QRZ")
      {
        json.Callsign.source =
          "<tr><td>Source</td><td><font color='orange'><b><div style='cursor:pointer' onClick='window.opener.openSite(\"https://www.qrz.com/lookup?callsign=" +
          call +
          "\");'>QRZ.com</div></b></font></td></tr>";
      }
      else
      {
        json.Callsign.source =
          "<tr><td>Source</td><td><font color='orange'><b><div style='cursor:pointer' onClick='window.opener.openSite(\"https://www.qrzcq.com/call/" +
          call +
          "\");'>QRZCQ.com</div></b></font></td></tr>";
      }
      if (gridPass) json.Callsign.gtGrid = gridPass;
      cacheLookupObject(json.Callsign, gridPass, true);
    }
    else
    {
      setLookupDiv(
        "lookupInfoDiv",
        "<br><b>" + I18N("gt.lookup.NoResult") + "</b><br><br>"
      );
      GT.qrzLookupSessionId = null;
    }
  }
  else
  {
    setLookupDiv("lookupInfoDiv", String(buffer));
    GT.qrzLookupSessionId = null;
  }
}

function startupApplication()
{
  init();
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

function searchLogForCallsign(call)
{
  setLookupDiv("lookupLocalDiv", "");
  let list = Object.values(GT.QSOhash)
    .filter(function (value)
    {
      return value.DEcall == call;
    })
    .sort(GT.settings.app.myBandCompare);

  let html = [];
  const ack = GT.acknowledgedCalls[call];

  // If 'ack' exists, populate the HTML array using a single-allocation template literal
  if (ack) {
    html = [
      `<h3>${I18N("gt.lookup.acks")} ${formatCallsign(call)} <img class="lookupAckBadge" src="img/emojis/${ack.b}.png"> ${ack.m}</h3>`
    ];
  }
  let work = {};
  let conf = {};
  let lastTime = 0;
  let lastRow = null;
  let dxcc = (list.length > 0 ? list[0].dxcc : callsignToDxcc(call));

  for (let row in list)
  {
    let what = list[row].band + "," + list[row].mode;
    if (list[row].time > lastTime)
    {
      lastRow = row;
      lastTime = list[row].time;
    }
    if (list[row].confirmed)
    {
      conf[what] = GT.pskColors[list[row].band];
      if (what in work) delete work[what];
    }
    else if (!(what in conf)) work[what] = GT.pskColors[list[row].band];
  }
  html.push("<div class='mapItemNoSize'><table align='center' class='darkTable'>");
  if (Object.keys(work).length > 0)
  {
    html.push("<tr><th style='color:yellow'>Worked</th><td>");
    let k = Object.keys(work).sort();
    for (let key in k)
    {
      html.push("<font color='#" + work[k[key]] + "'>" + k[key] + " </font>");
    }
    html.push("</td></tr>");
  }
  if (Object.keys(conf).length > 0)
  {
    html.push("<tr><th style='color:lightgreen'>Confirmed</th><td>");
    let k = Object.keys(conf).sort();
    for (let key in k)
    {
      html.push("<font color='#" + conf[k[key]] + "'>" + k[key] + " </font>");
    }
    html.push("</td></tr>");
  }
  if (lastRow)
  {
    html.push("<tr><th style='color:cyan'>Last QSO</th><td>");
    html.push("<font color='#" + GT.pskColors[list[lastRow].band] + "'>" + list[lastRow].band + "," + list[lastRow].mode + " </font> " + userTimeString(list[lastRow].time * 1000));
    html.push("</td></tr>");
  }

  html.push("<tr><th style='color:orange'>" + GT.dxccToAltName[dxcc] + " (" + GT.dxccInfo[dxcc].pp + ")</th><td>");
  for (let band in GT.colorBands)
  {
    if (String(dxcc) + "|" + GT.colorBands[band] in GT.tracker.worked.dxcc)
    {
      let strike = "";
      if (String(dxcc) + "|" + GT.colorBands[band] in GT.tracker.confirmed.dxcc) { strike = "text-decoration: underline overline;"; }
      html.push("<div style='" + strike + "display:inline-block;color:#" + GT.pskColors[GT.colorBands[band]] + "'>" + GT.colorBands[band] + "</div>&nbsp;");
    }
  }

  html.push("</td></tr></table></div>");
  setLookupDiv("lookupLocalDiv", html.join(""));
}

function startGenMessages(call, grid, instance = null)
{
  if (call == "-") return;
  if (grid == "-") grid = "";

  setCallAndGrid(call, grid, instance);
}

function mediaCheck()
{
  GT.LoTWLogFile = path.join(GT.appData, "LoTW_QSL.adif");
  GT.QrzLogFile = path.join(GT.appData, "qrz.adif");
  GT.clublogLogFile = path.join(GT.appData, "clublog.adif");

  logEventMedia.appendChild(newOption("none", I18N("settings.OAMS.message.newAlert.none")));

  alertMediaSelect.appendChild(newOption("none", I18N("alerts.addNew.SelectFile")));

  GT.mediaFiles = [ ...fs.readdirSync(GT.extraMediaDir), ...fs.readdirSync(GT.gtMediaDir) ];

  GT.mediaFiles.forEach((filename) =>
  {
    let noExt = path.parse(filename).name;
    logEventMedia.appendChild(newOption(filename, noExt));
    alertMediaSelect.appendChild(newOption(filename, noExt));

  });

  GT.modes = requireJson("data/modes.json");
  for (const key in GT.modes)
  {
    gtModeFilter.appendChild(newOption(key));
  }

  GT.modes_phone = requireJson("data/modes-phone.json");

  initQSOdata();

  GT.QSOhash = {};
  GT.QSLcount = 0;
  GT.QSOcount = 0;
  GT.rowsFiltered = 0;

  let appName = I18N("settings.about.AppName");
  let gtName = electron.ipcRenderer.sendSync("getAppName");
  if (gtName.length > 0)
  {
    appName += " - " + gtName;
  }
  appTitle.innerHTML = aboutTitle.innerHTML = loadTitle.innerHTML = appName;
}

function newOption(value, text = null, selected = null)
{
  if (text == null) text = value;
  let option = document.createElement("option");
  option.value = value;
  option.text = text;
  if (selected != null) option.selected = selected;
  return option;
}


function setRosterSpot(enabled)
{
  GT.rosterSpot = enabled;
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
      GT.receptionReports = require(GT.spotsPath);
    }
  }
  catch (e)
  {
    GT.receptionReports = {
      spots: {}
    };
  }
}

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
    this.source = 0;
    this.bearing = 0; // Pre-allocate for tooltip usage later
  }
}

function addNewOAMSSpot(parts) {
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
  report.source = "O";

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
  report.source = "M";
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
      let testColor = workingColor < 1 ? "#0000000" : workingColor == 361 ? "#FFFFFF" : "hsla(" + workingColor + ", 100%, 50%," + report.color / 255 + ")";
      if (workingColor < 1 || workingColor == 361)
      {
        spotColor = intAlphaToRGB(testColor.substr(0, 7), report.color);
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
      shouldSave = true;
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



function mapTransChange()
{
  GT.settings.map.mapTrans = mapTransValue.value;

  mapTransTd.innerHTML = String(100 - parseInt(((GT.settings.map.mapTrans * 255) / 255) * 100)) + "%";
  mapSettingsDiv.style.backgroundColor = "rgba(0,0,0, " + GT.settings.map.mapTrans + ")";
}

function mapTerminatorChange()
{
  GT.settings.map.terminatorDegreeIndex = mapTerminatorValue.value;
  mapTerminatorTd.innerHTML = I18N( "settings.map.terminator." +  GT.terminatorDegreesNames[GT.settings.map.terminatorDegreeIndex] );

  if (GT.map)
  {
    dayNight.refresh();
  }
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
      ? "#0000000BB"
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
      ? "#0000000BB"
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

function toggleCRScript()
{
  GT.crScript ^= 1;
  GT.settings.app.crScript = GT.crScript;
  if (GT.crScript == 1)
  {
    addLastTraffic("<font style='color:lightgreen'>Call Roster Script Enabled</font>");
  }
  else
  {
    addLastTraffic("<font style='color:yellow'>Call Roster Script Disabled</font>");
  }
  goProcessRoster();
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

function setGridOpacity()
{
  opacityValue.value = GT.settings.map.gridAlpha;
  showOpacityTd.innerHTML = parseInt((GT.settings.map.gridAlpha / 255) * 100) + "%";
  GT.gridAlpha = parseInt(GT.settings.map.gridAlpha).toString(16);
}

function changeGridOpacity()
{
  GT.settings.map.gridAlpha = opacityValue.value;
  showOpacityTd.innerHTML = parseInt((GT.settings.map.gridAlpha / 255) * 100) + "%";
  GT.gridAlpha = parseInt(GT.settings.map.gridAlpha).toString(16);
  
}

function openBackupLogsFolder()
{
  electron.ipcRenderer.send("openFileFolder", "GridTracker2", GT.qsoBackupDir);
}

function refreshSpotsNoTx()
{
  redrawSpots();
}

function changePredOpacityValue()
{
  predOpacityTd.innerHTML = GT.settings.map.predOpacity = predOpacityValue.value;
  if (GT.PredLayer != null)
  {
    GT.PredLayer.setOpacity(Number(GT.settings.map.predOpacity));
  }
}

function setAllGridOpacity()
{
  GT.settings.map.allGridOpacity = allGridOpacityValue.value;
  allGridOpacityTd.innerHTML = parseInt(allGridOpacityValue.value * 100) + "%";

  if (GT.layerVectors.lineGrids)
  {
    GT.layerVectors.lineGrids.setOpacity(Number(GT.settings.map.allGridOpacity));
    GT.layerVectors.longGrids.setOpacity(Number(GT.settings.map.allGridOpacity));
    GT.layerVectors.bigGrids.setOpacity(Number(GT.settings.map.allGridOpacity));
  }
}

function changeEpiTimeValue()
{
  GT.epiTimeValue = epiTimeValue.value;
  epiTimeOffsetTd.innerHTML = ((GT.epiTimeValue > 0) ? "+" + GT.epiTimeValue : GT.epiTimeValue) + "h";
  predLayerRefreh();
}

function getCurrentPredURL()
{
  let where = "";
  let now = timeNowSec();
  let timeOut = 0;
  if (GT.settings.map.predMode < 3)
  {
    timeOut = 901 * 1000;
    where = GT.settings.map.predMode == 1 ? "https://tagloomis.com/pred/muf/img/muf.png?" : "https://tagloomis.com/pred/muf/img/fof2.png?";
    where += String(now - (now % 900));
  }
  else if (GT.settings.map.predMode == 3)
  {
    timeOut = (3601 - (now % 3600)) * 1000;
    now = now + (GT.epiTimeValue * 3600);
    now = now - (now % 3600);
    where = "https://tagloomis.com/pred/epi/img/" + now + ".jpg";
  }
  else if (GT.settings.map.predMode == 4)
  {
    timeOut = 361 * 1000;
    where = "https://tagloomis.com/pred/auf/img/auf.png?" + String(now - (now % 360));
  }
  if (GT.predLayerTimeout != null)
  {
    nodeTimers.clearTimeout(GT.predLayerTimeout);
    GT.predLayerTimeout = null;
  }
  if (timeOut > 0)
  {
    GT.predLayerTimeout = nodeTimers.setTimeout(predLayerRefreh, timeOut);
  }
  return where;
}

function createPredSource()
{
  return new ol.source.XYZ({
    url: getCurrentPredURL(),
    attributions: GT.settings.map.predMode < 3 ? "<a href='https://prop.kc2g.com/acknowledgments/' target='_blank' title='Visit prop.kc2g.com'>KC2G</a>" : GT.settings.map.predMode == 3 ? "<a href='https://www.propquest.co.uk/about.php' target='_blank' title='Visit PROPquest.co.uk'>PROPquest</a>" : "<a href='https://www.swpc.noaa.gov/products/aurora-30-minute-forecast' target='_blank' title='Visit NOAA'>NOAA</a>",
    minZoom: 0,
    maxZoom: 0
  });
}

function createPredLayer()
{
  let layerVector = new ol.layer.Tile({
    source: createPredSource(),
    opacity: Number(GT.settings.map.predOpacity),
    visible: true,
    zIndex: 0
  });

  layerVector.set("name", "Pred");

  return layerVector;
}

function cyclePredLayer()
{
  GT.settings.map.predMode = (GT.settings.map.predMode + 1) % 6;
  displayPredLayer();
}


function directPredLayer(layer)
{
  GT.settings.map.predMode = layer;
  displayPredLayer();
}

function predInit()
{
  GT.predViews = Array();
  GT.predViews[1] = { mufTitle, mufBarTr, mufRangeTr };
  GT.predViews[2] = { fof2Title, fof2BarTr, fof2RangeTr }
  GT.predViews[3] = { epiTitle, epiTimeOffsetTr, epiBarTr, epiRangeTr };
  GT.predViews[4] = { aufTitle, aufPercentTr, aufBarTr };
  GT.predViews[5] = { tropoTitle, tropoBarTr, tropoRangeTr };

  GT.predLayers = ["gt.Disabled", "predlayer.muf.label", "predlayer.fof2.label", "predlayer.epi.label", "predlayer.auf.label", "predlayer.tropo.label"];

  GT.spotLayers = ["gt.Disabled", "spotlayer.RX.Spots", "spotlayer.RX.Heatmap"];
}

function displayPredLayer()
{
  predButton.style.display = (GT.settings.map.offlineMode == true) ? "none" : "";
  if (GT.settings.map.predMode > 0 && GT.settings.map.offlineMode == false)
  {
    predDiv.style.display = (GT.settings.map.predLegend) ? "" : "none";
    for (let viewIndex in GT.predViews)
    {
      for (let html in GT.predViews[viewIndex])
      {
        GT.predViews[viewIndex][html].style.display = viewIndex == GT.settings.map.predMode ? "" : "none";
      }
    }

    predLayerRefreh();
  }
  else
  {
    predDiv.style.display = "none";
    if (GT.predLayerTimeout != null)
    {
      nodeTimers.clearTimeout(GT.predLayerTimeout);
      GT.predLayerTimeout = null;
    }
    if (GT.PredLayer)
    {
      GT.map.removeLayer(GT.PredLayer);
      GT.PredLayer = null;
    }
  }
  predImg.src = GT.predImageArray[GT.settings.map.predMode];
  predImg.style.filter = GT.settings.map.predMode > 0 ? "" : "grayscale(1)";
  predOpacityTd.innerHTML = predOpacityValue.value = GT.settings.map.predOpacity;
}

function predLayerRefreh()
{
  if (GT.settings.map.predMode > 0 && GT.settings.map.offlineMode == false)
  {
    let oldLayer = null;
    if (GT.PredLayer)
    {
      oldLayer = GT.PredLayer;
      GT.PredLayer = null;
    }

    if (GT.settings.map.predMode == 5) {
      GT.PredLayer = createTropoLayer();
    } else {
      GT.PredLayer = createPredLayer();
    }

    GT.map.addLayer(GT.PredLayer);
    if (oldLayer)
    {
      GT.map.removeLayer(oldLayer);
      oldLayer = null;
    }
  }

  if (GT.settings.map.predMode !== 5) {
    stopTropoTimer();
  }
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

function saveGridTrackerSettings()
{
  let filename = path.join(GT.appData, "app-settings.json");
  let tempFilename = path.join(GT.appData, "app-settings.json.tmp");
  
  try
  {
    const settingsString = JSON.stringify(GT.settings, null, 2);

    try {
      let existingSettings = fs.readFileSync(filename, "utf8");
      if (existingSettings === settingsString) {
        return; 
      }
    } catch (err) {
      // If fs.readFileSync fails (e.g., the file doesn't exist yet on a fresh install),
      // we just swallow the error and let the code continue down to save the file.
    }

    // Write to the temporary file
    fs.writeFileSync(tempFilename, settingsString, { flush: true });

    // Verify the temporary file
    let fileBuf = fs.readFileSync(tempFilename, "utf8");
    
    if (fileBuf === settingsString) {
      // Atomic swap
      fs.renameSync(tempFilename, filename);
    } else {
      throw new Error("Temporary file verification failed.");
    }
  }
  catch (e)
  {
    console.error(e);
    alert("Failure to write settings to: " + filename);
  }
}


function captureScreenshot()
{
  electron.ipcRenderer.send("capturePageToClipboard", "GridTracker2");
  addLastTraffic("<font style='color:lightgreen;'>Screenshot Captured</font>");
  playAlertMediaFile("Camera Click 1.mp3");
}

function createFileSelectorHandlers()
{
  exportSettingsButton.addEventListener('click', async function(){
    saveAllSettings();
    try {
      const blob = new Blob([JSON.stringify(GT.settings, null,2)], { type: 'application/json'});
      
      const pickerOptions = {
        suggestedName: "GridTracker2 Settings.json",
        types: [
          {
            description: "GridTracker2 Settings",
            accept: {
              "application/json": [".json"]
            },
          },
        ],
      };
      const fileHandle = await window.showSaveFilePicker(pickerOptions);
      const writableFileStream = await fileHandle.createWritable();
      await writableFileStream.write(blob);
      await writableFileStream.close();
    }
    catch (e)
    {
      // user aborted or file permission issue
    }
  });

  GT.importFileHandle = null;
  importSettingsButton.addEventListener('click', async () => {
    try
    {
      const pickerOptions = {
        types: [
          {
            description: "GridTracker2 Settings",
            accept: {
              "application/json": [".json"],
            },
          },
        ],
        excludeAcceptAllOption: true,
        multiple: false,
      };

      [GT.importFileHandle] = await window.showOpenFilePicker(pickerOptions);
      let file = await GT.importFileHandle.getFile();
      importSettings(await file.text());
    }
    catch (e)
    {
      // user aborted or file permission issue
    }
  });
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

const emojiShow = '👀';
const emojiHide = '🔒';

function stylePasswordInputs()
{
    const passwordInputs = document.querySelectorAll('input[type="password"]');

    passwordInputs.forEach(input => {
        // Create the wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'password-wrapper';
        
        // Wrap the input
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        // Create the button
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'password-toggle-btn';
        toggleBtn.title = I18N("togglePasswordVisibility");
        toggleBtn.innerText = emojiShow; 

        const updateIconVisibility = () => {
            // If there's text, show the button. If empty, hide it completely.
            toggleBtn.style.display = input.value.length > 0 ? 'inline-block' : 'none';
        };

        // Run it once on load (catches auto-filled passwords)
        updateIconVisibility();

        // Listen for every keystroke, paste, or deletion
        input.addEventListener('input', updateIconVisibility);
        // -------------------------------------------

        // Toggle logic (click)
        toggleBtn.addEventListener('click', () => {
            if (input.type === 'password') {
                input.type = 'text';
                toggleBtn.innerText = emojiHide;
            } else {
                input.type = 'password';
                toggleBtn.innerText = emojiShow;
            }
            input.focus(); 
        });

        wrapper.appendChild(toggleBtn);
    });
}

