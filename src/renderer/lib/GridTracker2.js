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

GT.trackerWorker = new Worker("./lib/qso/trackerWorker.js");

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

GT.isAnimating = false;

// ---- Startup, in the order it runs: <body onload> calls startupApplication, which starts startupEngine.
// ---- startupEngine runs each step in GT.startupTable (above), including the two below, then endStartup.
function startupApplication()
{
  updateByBandMode();

  initQSOdata();

  aboutVersionText.innerHTML = gtShortVersion;
  supportVersionsText.innerHTML = `<span style="font-size:smaller;color:#999;">Electron v${process.versions.electron} OpenLayers: v${ol.util.VERSION}<br>(${GT.platform} ${os.arch()})</span>`;

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

function startupEventsAndTimers()
{
  // Clock timer update every second
  nodeTimers.setInterval(displayTime, 1000);
  nodeTimers.setInterval(reportDecodes, 60000);
  nodeTimers.setInterval(oamsBandActivityCheck, 300000);
  nodeTimers.setInterval(goProcessRoster, 5000);
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

function endStartup()
{
  if (loadPsk24CheckBox.checked == true) grabPsk24();
  startupAdifLoadCheck();
  GT.finishedLoading = true;
}

// ---- While running
function refreshI18NStrings()
{
  GT.startupTable.forEach(function (item)
  {
    if (item[2].length > 0) item[1] = I18N(item[2]);
  })
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

// ---- Shutdown and reset: the beforeunload listener (below) calls saveAndCloseApp
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

// ---- Event listeners registered at load
window.addEventListener("beforeunload", function ()
{
  saveAndCloseApp();
});

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

document.addEventListener("drop", onButtonDrop);

document.addEventListener("dragover", function(event) {
  if (event.target.draggable)
  {
    event.preventDefault();
  }
});
