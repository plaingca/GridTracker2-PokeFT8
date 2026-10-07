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
  
  GT.dxccBasePath = path.resolve(resourcesPath, "data/dxcc-base.json");
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

GT.lastVersionInfo = null;
GT.lastDownloadedVersion = null;

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
GT.getPostJSONBuffer = getPostJSONBuffer;
GT.isWithinScheduledMinutes = isWithinScheduledMinutes;
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

function closeOpenSockets()
{
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
}

function saveAndCloseApp(shouldRestart = false)
{
  GT.closing = true;
  saveAllSettings();
  saveReceptionReports();

  closeOpenSockets();

  if (shouldRestart == true)
  {
    electron.ipcRenderer.sendSync("restartGridTracker2", false);
  }
}

function clearAndReload(fullReset = true)
{
  GT.closing = true;
  
  closeOpenSockets();

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
    if (GT.lookupWindowInitialized) electron.ipcRenderer.send("hideWin", "gt_lookup");

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



function compareCallsignTime(a, b)
{
  return a.time - b.time;
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

function toggleConditionsWindow()
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
  registerHotKey("Open Conditions Windows", "KeyE", showConditionsWindow, null, null, "ctrlKey");
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

// --- 3. THE UPDATED RAF ANIMATION LOOP (No Loop Required!) ---
GT.isAnimating = false;


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


function liveHash(call, band, mode)
{
  return call + band + mode;
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

function showConditionsWindow(toggle = true)
{
  if (GT.settings.map.offlineMode == false)
  {
    if (toggle)
    {
      toggleConditionsWindow();
    }
    else
    {
      openConditionsWindow(true);
    }
  }
}

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
    GT.rtsnPins = {};
    GT.rtsnCallsigns = {};

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


function simplepushDailySchedule(chk) {
  GT.settings.msg.msgSimplepushDailySchedule = chk.checked;
  simplepushDailyScheduleDiv.style.display = chk.checked ? "" : "none";
}

function pushoverDailySchedule(chk) {
  GT.settings.msg.msgPushoverDailySchedule = chk.checked;
  pushoverDailyScheduleDiv.style.display = chk.checked ? "" : "none";
}

// "HH:MM" -> minutes since midnight (0-1439)
function timeStringToMinutes(timeStr)
{
  const [h, m] = timeStr.split(":").map(Number);
  return (h * 60) + m;
}

// minutes since midnight -> "HH:MM" (mod 1440 in case something upstream ever
// stores an already-adjusted value, e.g. > 1440)
function minutesToTimeString(minutes)
{
  const normalized = ((minutes % 1440) + 1440) % 1440; // safe even for negatives
  const h = Math.floor(normalized / 60).toString().padStart(2, "0");
  const m = (normalized % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

// Given start/end minutes-of-day, return the *effective* end,
// pushed past midnight if the schedule wraps.
function getEffectiveEndMinutes(startMinutes, endMinutes)
{
  return (endMinutes <= startMinutes) ? (endMinutes + 1440) : endMinutes;
}

// Duration in minutes, wraparound-safe
function getScheduleDurationMinutes(startMinutes, endMinutes)
{
  return getEffectiveEndMinutes(startMinutes, endMinutes) - startMinutes;
}

// Is "now" (minutes since midnight) inside the window?
function isWithinScheduledMinutes(startMinutes, endMinutes)
{
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const effectiveEnd = getEffectiveEndMinutes(startMinutes, endMinutes);
  let effectiveNow = nowMinutes;
  if (effectiveEnd > 1439 && effectiveNow < startMinutes)
  {
    effectiveNow += 1440; // "now" is in the early-morning part of the wrapped window
  }
  return (effectiveNow >= startMinutes) && (effectiveNow < effectiveEnd);
}

function toHM(inputMinutes) {
  const t = Math.trunc(+inputMinutes || 0);
  const h = Math.floor(t / 60);
  const m = t % 60;

  let res = "";
  if (h > 0) res += h + "h ";
  if (m > 0) res += m + "m ";

  return res ? res.trim() : "0m";
}

function newScheduleTimeSetting(el)
{
  GT.settings.msg[el.id] = timeStringToMinutes(el.value);
}

function displaySimplepushSchedule()
{
  simplepushScheduleDiv.innerHTML = toHM(getScheduleDurationMinutes(GT.settings.msg.msgSimplepushScheduleStart, GT.settings.msg.msgSimplepushScheduleEnd));
}

function displayPushoverSchedule()
{
  pushoverScheduleDiv.innerHTML = toHM(getScheduleDurationMinutes(GT.settings.msg.msgPushoverScheduleStart, GT.settings.msg.msgPushoverScheduleEnd));
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
  if (GT.settings.map.offlineMode == true || GT.settings.app.offAirServicesEnable == false || GT.settings.app.oamsBandActivity == false) return;
  
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

function getIniFromApp(appName, iniName)
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

  let appData = electron.ipcRenderer.sendSync("getPath", "appData");

  if (GT.platform == "windows")
  {
    let basename = path.basename(appData);
    if (basename != "Local")
    {
      appData = appData.replace(basename, "Local");
    }

    wsjtxCfgPath = path.join(appData, appName, iniName + ".ini");
  }
  else if (GT.platform == "mac")
  {
    wsjtxCfgPath =  path.join(process.env.HOME, "Library/Preferences/WSJT-X.ini");
  }
  else
  {
    wsjtxCfgPath = path.join(process.env.HOME, ".config/" + iniName + ".ini");
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
  
  let which =  getIniFromApp("WSJT-X", "WSJT-X");
  if (which.port == -1) which = getIniFromApp("WS", "WSJT-X");
  if (which.port == -1) which = getIniFromApp("WS", "WS");
  if (which.port == -1) which = getIniFromApp("JTDX", "JTDX");

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
  clearQSOs(GT.settings.app.workingGridEnable, "startupAdifLoadCheck");

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

function updateFromBigCty(dxccBigCTY)
{
  GT.prefixToDXCC = {};
  GT.directCallToDXCC = {};
  GT.directCallToCQzone = {};
  GT.directCallToITUzone = {};
  GT.prefixToCQzone = {};
  GT.prefixToITUzone = {};

  // Safety measure for backwards compatibility
  delete dxccBigCTY[0];

  for (let key in dxccBigCTY)
  {
    const info = dxccBigCTY[key]; 

    GT.dxccInfo[key].cqzone = info.cqzone;
    GT.dxccInfo[key].ituzone = info.ituzone;

    const dxcc = Number(key);
    
    GT.prefixToDXCC[GT.dxccInfo[key].pp] = dxcc;

    for (let i = 0; i < info.prefix.length; i++) {
      GT.prefixToDXCC[info.prefix[i]] = dxcc;
    }

    for (let i = 0; i < info.direct.length; i++) {
      GT.directCallToDXCC[info.direct[i]] = dxcc;
    }
 
    for (let val in info.prefixCQ) GT.prefixToCQzone[val] = info.prefixCQ[val];
    for (let val in info.prefixITU) GT.prefixToITUzone[val] = info.prefixITU[val];
    for (let val in info.directCQ) GT.directCallToCQzone[val] = info.directCQ[val];
    for (let val in info.directITU) GT.directCallToITUzone[val] = info.directITU[val];
  }
}

function loadMaidenHeadData()
{
  GT.dxccInfo = window.require(GT.dxccBasePath);

  for (let key in GT.dxccInfo)
  {
    const info = GT.dxccInfo[key]; 

    GT.dxccToAltName[info.dxcc] = info.name;
    GT.dxccToADIFName[info.dxcc] = info.aname;
    GT.altNameToDXCC[info.name] = info.dxcc;
    GT.dxccToCountryCode[info.dxcc] = info.cc;

    for (let x = 0; x < info.mh.length; x++)
    {
      if (!(info.mh[x] in GT.gridToDXCC)) { GT.gridToDXCC[info.mh[x]] = Array(); }
      GT.gridToDXCC[info.mh[x]].push(info.dxcc);
    }
  }

  let dxccBigCTY;
  try {
    dxccBigCTY = window.require(GT.dxccInfoPath);
  }
  catch (e)
  {
    console.error("Failed to load Ginternal dxcc-info, falling back to asar");
    // Fallback to asar
    dxccBigCTY = window.require(GT.asarDxccInfoPath);
  }

  if ("version" in dxccBigCTY[1])
  {
    GT.dxccVersion = parseInt(dxccBigCTY[1].version);

    updateLookupsBigCtyUI();

    nodeTimers.setTimeout(downloadCtyDat, 120000);    // In 2 minutes, when the dust settles

  }
  else
  {
    GT.dxccVersion = 19700101;
    nodeTimers.setTimeout(downloadCtyDat, 5000);    // In 5 seconds
  }

  updateFromBigCty(dxccBigCTY);

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

// onError (optional): called once with a message if the request fails, stalls for 20 seconds,
// or the reply can't be decompressed. Without it, failures are only logged, as before.
function getBuffer(file_url, callback, flag, mode, port, cache = null, onError = null)
{
  let http = window.require(mode);
  let fileBuffer = null;
  let options = null;
  // for logging: drop the query string, which can hold logins and passwords (e.g. QRZ/HamQTH sign-in)
  const logUrl = file_url.split("?")[0];
  let failed = false;
  const fail = function (message)
  {
    if (onError && !failed)
    {
      failed = true;
      onError(message);
    }
  };

  options = {
    host: NodeURL.parse(file_url).host, // eslint-disable-line node/no-deprecated-api
    port: port,
    followAllRedirects: true,
    path: NodeURL.parse(file_url).path, // eslint-disable-line node/no-deprecated-api
    headers: { "User-Agent": gtUserAgent, "x-user-agent": gtUserAgent, 'Accept-Encoding': 'gzip' },
  };

  const req = http.get(options, function (res)
  {
    const encoding = res.headers['content-encoding'];
    res.on("data", function (data)
      {
        if (fileBuffer == null) fileBuffer = Buffer.from(data);
        else fileBuffer = Buffer.concat([fileBuffer, data]);
      })
      .on("end", function ()
      {
        if (encoding === 'gzip') {
          try { fileBuffer = window.require('zlib').gunzipSync(fileBuffer); }
          catch (e) { console.error("getBuffer gunzip " + logUrl, e.message); fail("could not read the reply"); return; }
        }
        if (typeof callback == "function")
        {
          // Call it, since we have confirmed it is callable
          callback(fileBuffer, flag, cache);
        }
      })
      .on("error", function (e)
      {
        console.error("getBuffer " + logUrl + " error: " + e.message);
        fail(e.message);
      });
  });

  req.on("error", function (e)
  {
    console.error("getBuffer " + logUrl + " request error: " + e.message);
    fail(e.message);
  });

  if (onError)
  {
    req.setTimeout(20000, function ()
    {
      req.destroy(new Error("no reply from server"));
    });
  }
}

function getPostBuffer(file_url, callback, flag, mode, port, theData, timeoutMs, timeoutCallback, who)
{
  let querystring = window.require("querystring");
  let postData = querystring.stringify(theData);
  let http = window.require(mode);
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
    if (window[key].type === "checkbox")
    {
      window[key].checked = GT.settings.msg[key];
    }
    else if (window[key].type === "time")
    {
      window[key].value = minutesToTimeString(GT.settings.msg[key]);
    }
    else
    {
      window[key].value = GT.settings.msg[key];
    }
  }
  else
  {
    delete GT.settings.msg[key];
  }
}

  setMsgSettingsView();
}


function setMsgSettingsView()
{
  simplepushMsgEnableTr.style.display = (GT.settings.map.offlineMode == false) ? "" : "none";
  pushoverMsgEnableTr.style.display = (GT.settings.map.offlineMode == false) ? "" : "none";

  simplePushDiv.style.display = (GT.settings.msg.msgSimplepush && GT.settings.map.offlineMode == false) ? "" : "none";
  pushOverDiv.style.display = (GT.settings.msg.msgPushover && GT.settings.map.offlineMode == false) ? "" : "none";

  simplepushDailyScheduleDiv.style.display = (GT.settings.msg.msgSimplepushDailySchedule ? "" : "none");
  pushoverDailyScheduleDiv.style.display = (GT.settings.msg.msgPushoverDailySchedule ? "" : "none");

  ValidateText(msgSimplepushApiKey);
  ValidateText(msgPushoverUserKey);
  ValidateText(msgPushoverToken);

  displaySimplepushSchedule();
  displayPushoverSchedule();
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
  nodeTimers.setInterval(goProcessRoster, 5000);
}

function initSettingsTabs()
{
  let settingsTabcontent = document.getElementsByClassName("settingsTabcontent");
  for (let i = 0; i < settingsTabcontent.length; i++)
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
    nodeTimers.setInterval(downloadCtyDat, 86400000); // Every 24 hours
    nodeTimers.setInterval(refreshSpotsNoTx, 300000); // Redraw spots every 5 minutes, this clears old ones
    nodeTimers.setInterval(saveAllSettings, 900000);  // Save settings (if they have changed) every 10 minutes
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

electron.ipcRenderer.on("versionInfo", (event, info) => {
  if (info != null)
  {
    if (gtVersionStr != info.version && GT.lastVersionInfo != info.version)
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
  electron.ipcRenderer.send("downloadUpdate", null);
}

electron.ipcRenderer.on("updateDownloaded", (event, info) => {
  if (info != null)
  {
    if (gtVersionStr != info.version && GT.lastDownloadedVersion != info.version)
    {
      const html = "<font style='color:yellow'>" + I18N("gt.NewVersionDownloaded") + "</font><br><font style='color:cyan'>" + info.version + "</font><br><div class='button' onclick='installAndRestart()'>" + I18N("gt.InstallAndRestart") + "</div>"
      updateVersionText.innerHTML = html;
      addLastTraffic(html);
      
      GT.lastDownloadedVersion = info.version;
    }
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

function startupApplication()
{
  init();
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




function updateLastMsgTimeDiv(id)
{
  lastMsgTimeDiv.innerHTML = I18N("gt.newMesg.Recvd") + " " + id;
  GT.lastTimeSinceMessageInSeconds = GT.timeNow;
  GT.updateLastMsgTimer = null;
}


function searchLogForCallsign(call)
{
  setLookupDiv("lookupLocalDiv", "");
  let list = Object.values(GT.QSOhash)
    .filter(function (value)
    {
      return value.DEcall == call;
    })
    .sort(myBandCompare);

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

