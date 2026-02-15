// GridTracker Copyright © 2025 GridTracker.org
// All rights reserved.
// See LICENSE for more information.
const gtVersionStr = electron.ipcRenderer.sendSync("appVersion");
const gtVersion = parseInt(gtVersionStr.replace(/\./g, ""));

// let GT is in screen.js
GT.startingUp = true;
GT.firstRun = false;

GT.platform = os.platform();
if (GT.platform.indexOf("win") == 0 || GT.platform.indexOf("Win") == 0)
{
  GT.platform = "windows";
}
if (GT.platform.indexOf("inux") > -1)
{
  GT.platform = "linux";
}
if (GT.platform.indexOf("darwin") > -1)
{
  GT.platform = "mac";
}

function loadAllSettings()
{
  GT.scriptPath = path.join(electron.ipcRenderer.sendSync("getPath","userData"), "Call Roster Scripts");
  GT.appData = path.join(electron.ipcRenderer.sendSync("getPath","userData"), "Ginternal");
  GT.qsoBackupDir = path.join(electron.ipcRenderer.sendSync("getPath","userData"), "Backup Logs");
  GT.extraMediaDir = path.join(electron.ipcRenderer.sendSync("getPath","userData"), "Extra Media");
  GT.asarDxccInfoPath =  path.resolve(resourcesPath, "data/dxcc-info.json"),
  GT.dxccInfoPath = path.join(GT.appData, "dxcc-info.json");
  GT.tempDxccInfoPath = path.join(GT.appData, "dxcc-info-update.json");
  GT.spotsPath = path.join(GT.appData, "spots.json");
  GT.tempPath = electron.ipcRenderer.sendSync("getPath","temp");

  try
  {
    let tryDirectory = "";
    let userdirs = [
      GT.appData,
      GT.scriptPath,
      GT.qsoBackupDir,
      GT.extraMediaDir
    ];
    for (let dir of userdirs)
    {
      if (!fs.existsSync(dir))
      {
        tryDirectory = dir;
        fs.mkdirSync(dir);
      }
    }
  }
  catch (e)
  {
    alert("Unable to create or access " + tryDirectory + " folder.\r\nPermission violation, GT cannot continue");
  }

  GT.scriptPath = path.join(GT.scriptPath, (GT.platform == "windows") ? "cr-alert.bat" : "cr-alert.sh");

  // Apply defaults once if not applied
  if (!("defaultsApplied" in GT.settings))
  {
    GT.settings = { ...def_settings };
    GT.settings.defaultsApplied = true;
  }
  else
  {
    GT.settings = deepmerge(def_settings, GT.settings, { arrayMerge: (destinationArray, sourceArray) => sourceArray } );
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

  setWindowTheme();
}

loadAllSettings();

const gtShortVersion = "v" + gtVersionStr;
const gtUserAgent = "GridTracker/" + gtVersionStr;
const k_frequencyBucket = 10000;
const backupAdifHeader = "GridTracker v" + gtVersion + " <EOH>\r\n";

GT.languages = {
  en: "i18n/en.json",
  cn: "i18n/cn.json",
  cnt: "i18n/cn-t.json",
  de: "i18n/de.json",
  fr: "i18n/fr.json",
  it: "i18n/it.json",
  es: "i18n/es.json"
};
GT.i18n = {};
GT.popupWindowHandle = null;
GT.popupWindowInitialized = false;
GT.callRosterWindowHandle = null;
GT.callRosterWindowInitialized = false;
GT.conditionsWindowHandle = null;
GT.conditionsWindowInitialized = false;

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
GT.spotDetailsCollector = {};
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
GT.hotKeys = {};
GT.forwardIPs = [];

GT.activeRoster = null;
GT.activeAudioAlerts = null;

GT.flightPaths = [];
GT.flightPathOffset = 0;
GT.flightPathLineDash = [9, 3, 3];
GT.flightPathTotal = (9 + 3 + 3) * 2;

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
GT.prefixToMap = {};
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
GT.dxccCount = {};
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
GT.countyData = {};
GT.zipToCounty = {};
GT.stateToCounty = {};
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

GT.GraylineImageArray = Array();
GT.GraylineImageArray[0] = "img/shadow_on_32.png";
GT.GraylineImageArray[1] = "img/shadow_off_32.png";
GT.gtFlagImageArray = Array();
GT.gtFlagImageArray[1] = "img/flag_on.png";
GT.gtFlagImageArray[0] = "img/flag_off.png";
GT.mapImageArray = Array();
GT.mapImageArray[1] = "img/online_map.png";
GT.mapImageArray[0] = "img/offline_map.png";
GT.pinImageArray = Array();
GT.pinImageArray[1] = "img/red_pin_32.png";
GT.pinImageArray[0] = "img/gt_grid.png";
GT.qsoLockImageArray = Array();
GT.qsoLockImageArray[0] = "img/qso_unlocked_32.png";
GT.qsoLockImageArray[1] = "img/qso_locked_32.png";
GT.qslLockImageArray = Array();
GT.qslLockImageArray[0] = "img/qsl_unlocked_32.png";
GT.qslLockImageArray[1] = "img/qsl_locked_32.png";
GT.alertImageArray = Array();
GT.alertImageArray[0] = "img/unmuted-button.png";
GT.alertImageArray[1] = "img/muted-button.png";
GT.spotImageArray = Array();
GT.spotImageArray[0] = "img/spots.png";
GT.spotImageArray[1] = "img/spots.png";
GT.spotImageArray[2] = "img/heat.png";
GT.maidenheadModeImageArray = Array();
GT.maidenheadModeImageArray[0] = "img/mh4_32.png";
GT.maidenheadModeImageArray[1] = "img/mh6_32.png";
GT.predImageArray = Array();
GT.predImageArray[0] = "img/no-pred.png";
GT.predImageArray[1] = "img/muf.png";
GT.predImageArray[2] = "img/fof2.png";
GT.predImageArray[3] = "img/epi.png";
GT.predImageArray[4] = "img/auf.png";

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
GT.lastSortType = 0;
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
GT.qtToSplice = 0;
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
    logError(e);
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

function clearAndReload()
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

  GT.settings = { };
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
  if (GT.settings.app.graylineImgSrc == 1 || GT.useTransform == true)
  {
    dayNight.hide();
    GT.nightTime = dayNight.refresh();
  }
  else
  {
    GT.nightTime = dayNight.refresh();
    dayNight.show();
  }
  Grayline.style.display = (GT.useTransform) ? "none" : "";
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

  if (finalDxcc in GT.dxccCount) GT.dxccCount[finalDxcc]++;
  else GT.dxccCount[finalDxcc] = 1;

  if (wspr != null && validateMapBandAndMode(band, mode))
  {
    qthToBox(finalGrid, finalDXcall, false, false, finalDEcall, band, wspr, hash, false);
  }

  if (callsign == null)
  {
    let newCallsign = {};
    newCallsign.DEcall = finalDXcall;
    newCallsign.grid = finalGrid;
    // newCallsign.field = finalGrid.substring(0, 2);
    newCallsign.mode = mode;
    newCallsign.band = band;
    newCallsign.msg = finalMsg;
    newCallsign.dxcc = finalDxcc;
    newCallsign.worked = false;
    newCallsign.confirmed = false;
    newCallsign.RSTsent = "-";
    newCallsign.RSTrecv = "-";
    newCallsign.dt = 0.0;
    newCallsign.qso = false;
    newCallsign.distance = 0;
    newCallsign.px = null;
    newCallsign.zone = null;
    newCallsign.pota = null;
    newCallsign.cnty = null;
    newCallsign.cont = null;
    if (finalDxcc > -1)
    {
      newCallsign.px = getWpx(finalDXcall);
      if (newCallsign.px)
      {
        newCallsign.zone = Number(
          newCallsign.px.charAt(newCallsign.px.length - 1)
        );
      }

      if (newCallsign.cont == null)
      {
        newCallsign.cont = GT.dxccInfo[finalDxcc].continent;
        if (newCallsign.dxcc == 390 && newCallsign.zone == 1) { newCallsign.cont = "EU"; }
      }
    }
    if (finalRSTsent != null)
    {
      newCallsign.RSTsent = finalRSTsent;
    }
    if (finalRSTrecv != null)
    {
      newCallsign.RSTrecv = finalRSTrecv;
    }
    newCallsign.time = finalTime;
    newCallsign.age = finalTime;
    newCallsign.delta = -1;
    newCallsign.DXcall = finalDEcall;
    newCallsign.wspr = wspr;
    newCallsign.state = null;
    newCallsign.instance = null;
    newCallsign.rosterAlerted = false;
    newCallsign.shouldRosterAlert = false;
    newCallsign.audioAlerted = false;
    newCallsign.shouldAudioAlert = false;
    newCallsign.zipcode = null;
    newCallsign.qrz = false;
    newCallsign.vucc_grids = [];
    newCallsign.propMode = "";
    newCallsign.digital = true;
    newCallsign.phone = false;
    newCallsign.IOTA = "";
    newCallsign.hash = hash;

    if (newCallsign.state == null && isKnownCallsignUS(newCallsign.dxcc))
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
      if (finalGrid.length > callsign.grid.length) callsign.grid = finalGrid;
      if (finalGrid.length == callsign.grid.length && finalGrid != callsign.grid) callsign.grid = finalGrid;
      // callsign.field = callsign.grid.substring(0, 2);
      if (finalRSTsent != null) callsign.RSTsent = finalRSTsent;
      if (finalRSTrecv != null) callsign.RSTrecv = finalRSTrecv;
      callsign.vucc_grids = [];
      callsign.propMode = "";
      callsign.digital = true;
      callsign.phone = false;
      callsign.IOTA = "";
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

function styleAllFlightPaths()
{
  for (let i = GT.flightPaths.length - 1; i >= 0; i--)
  {
    let featureStyle = GT.flightPaths[i].getStyle();
    let featureStroke = featureStyle.getStroke();

    let color = GT.flightPaths[i].isQRZ ? getQrzPathColor() : getPathColor();
    let width = GT.flightPaths[i].isQRZ ? qrzPathWidthValue.value : pathWidthValue.value;

    if (width == 0)
    {
      if ("Arrow" in GT.flightPaths[i]) { GT.layerSources.flight.removeFeature(GT.flightPaths[i].Arrow); }
      GT.layerSources.flight.removeFeature(GT.flightPaths[i]);
      delete GT.flightPaths[i];
      GT.flightPaths[i] = null;

      GT.flightPaths.splice(i, 1);
      continue;
    }

    featureStroke.setWidth(width);

    if (GT.flightPaths[i].isShapeFlight == 0) featureStroke.setColor(color);

    featureStyle.setStroke(featureStroke);
    GT.flightPaths[i].setStyle(featureStyle);

    if ("Arrow" in GT.flightPaths[i])
    {
      let stroke = new ol.style.Stroke({
        color: color,
        width: width
      });
      let thisStle = new ol.style.Style({
        image: new ol.style.Circle({
          stroke: stroke,
          radius: 3
        })
      });
      GT.flightPaths[i].Arrow.setStyle(thisStle);
    }
  }
  if (GT.transmitFlightPath != null)
  {
    let featureStyle = GT.transmitFlightPath.getStyle();
    let featureStroke = featureStyle.getStroke();

    if (qrzPathWidthValue.value == 0)
    {
      GT.layerSources.transmit.clear();
      GT.transmitFlightPath = null;
    }
    else
    {
      featureStroke.setWidth(qrzPathWidthValue.value);
      featureStroke.setColor(getQrzPathColor());
      featureStyle.setStroke(featureStroke);
      GT.transmitFlightPath.setStyle(featureStyle);

      if ("Arrow" in GT.transmitFlightPath)
      {
        let stroke = new ol.style.Stroke({
          color: getQrzPathColor(),
          width: qrzPathWidthValue.value
        });
        let thisStle = new ol.style.Style({
          image: new ol.style.Circle({
            stroke: stroke,
            radius: 3
          })
        });
        GT.transmitFlightPath.Arrow.setStyle(thisStle);
      }
    }
  }
}

function compareCallsignTime(a, b)
{
  if (a.time < b.time) return -1;
  if (a.time > b.time) return 1;
  return 0;
}

function createSpotTipTable(toolElement)
{
  try
  {
    let now = timeNowSec();
    let worker = "";
    if (toolElement.spot in GT.receptionReports.spots)
    {
      GT.layerSources.pskHop.clear();
      let report = GT.receptionReports.spots[toolElement.spot];

      let LL = squareToCenter(GT.settings.app.myRawGrid);
      let fromPoint = ol.proj.fromLonLat([LL.o, LL.a]);

      worker = "<table id='tooltipTable' class='darkTable' ><tr><th colspan=2 style='color:cyan'>Rx Spot</th></tr>";
      worker += "<tr><td>Call</td><td style='color:#ff0' >" + formatCallsign(report.call) + "</td></tr>";
      worker += "<tr><td>dB</td><td style='color:#DD44DD' >" + formatSignalReport(Number(report.snr)) + "</td></tr>";
      worker += "<tr><td>Age</td><td>" + toDHMS(Number(now - report.when)) + "</td></tr>";

      if (report.dxcc > 0)
      {
        worker += "<tr><td>DXCC</td><td style='color:orange;'>" + GT.dxccToAltName[report.dxcc] + " <font color='lightgreen'>(" + GT.dxccInfo[report.dxcc].pp + ")</font></td>";
      }

      worker += "<tr><td>Grid</td><td style='color:cyan;cursor:pointer' >" + report.grid + "</td></tr>";
      worker += "<tr><td>Freq</td><td style='color:lightgreen' >" + formatMhz(report.freq) + " <font color='yellow'>(" + report.band + ")</font></td></tr>";
      worker += "<tr><td>Mode</td><td style='color:orange' >" + report.mode + "</td></tr>";

      LL = squareToCenter(report.grid);

      report.bearing = parseInt(MyCircle.bearing(GT.myLat, GT.myLon, LL.a, LL.o));
      worker += "<tr><td>Dist</td><td style='color:cyan'>" + parseInt(MyCircle.distance(GT.myLat, GT.myLon, LL.a, LL.o, distanceUnit.value) * MyCircle.validateRadius(distanceUnit.value)) + distanceUnit.value.toLowerCase() + "</td></tr>";
      worker += "<tr><td>Azim</td><td style='color:yellow'>" + report.bearing + "&deg;</td></tr>";
      worker += "<tr><td>Time</td><td>" + userTimeString(report.when * 1000) + "</td></tr>";
      if ("source" in report)
      {
        let color = (report.source == "O" ? "cyan;font-size: larger" : "orange");
        let fullSource = (report.source == "O" ? "OAMS Realtime Network" : report.source == "M" ? "PSK-MQTT" : "PSK-Reporter");
        worker += "<tr><td>Source</td><td style='color:" + color + ";'>" + fullSource + "</font></td>";
      }
      worker += "</table>";

      let strokeWeight = pathWidthValue.value;
      let toPoint = ol.proj.fromLonLat([LL.o, LL.a]);

      flightFeature(
        [fromPoint, toPoint],
        {
          weight: strokeWeight,
          color: getQrzPathColor(),
          steps: 75
        },
        "pskHop",
        false
      );
    }
    myTooltip.innerHTML = worker;
    return 10;
  }
  catch (err)
  {
    console.error("Unexpected error at createSpotTipTable", toolElement, err)
  }
}

function createTooltTipTable(toolElement)
{
  if ("spot" in toolElement)
  {
    return createSpotTipTable(toolElement);
  }
  let colspan = 10;
  if (GT.settings.callsignLookups.lotwUseEnable == true) colspan++;
  if (GT.settings.callsignLookups.eqslUseEnable == true) colspan++;
  if (GT.settings.callsignLookups.oqrsUseEnable == true) colspan++;
  if (toolElement.qso == true) colspan += 2;

  let worker = "<table id='tooltipTable' class='darkTable' ><tr><th colspan=" +
    colspan + " style='color:cyan'>" +
    toolElement.qth + " (<font color='white'>" + I18N((toolElement.qso ? "gt.gridView.logbook" : "gt.gridView.live")) + "</font>)</th></tr>";
  if (toolElement.qth in GT.gridToDXCC)
  {
    worker += "<tr><th colspan=" + colspan + " style='color:yellow'><small>";
    for (let x = 0; x < GT.gridToDXCC[toolElement.qth].length; x++)
    {
      worker += GT.dxccToAltName[GT.gridToDXCC[toolElement.qth][x]];
      if (toolElement.qth in GT.gridToState)
      {
        worker += " (<font color='orange'>";
        let added = false;
        for (let y = 0; y < GT.gridToState[toolElement.qth].length; y++)
        {
          if (GT.gridToDXCC[toolElement.qth][x] == GT.StateData[GT.gridToState[toolElement.qth][y]].dxcc)
          {
            worker += GT.StateData[GT.gridToState[toolElement.qth][y]].name + " / ";
            added = true;
          }
        }
        if (added == true) { worker = worker.substr(0, worker.length - " / ".length); }
        worker += "</font>)";
      }
      if (x + 1 < GT.gridToDXCC[toolElement.qth].length) worker += ", ";
    }
    worker += "</small></th></tr>";
  }
  let newCallList = Array();
  if (toolElement.qso == true)
  {
    if (Object.keys(toolElement.hashes).length > 0)
    {
      worker += "<tr align='center'>" +
          "<td>" + I18N("gt.newCallList.Call") + "</td>" +
          "<td>" + I18N("gt.newCallList.Freq") + "</td>" +
          "<td>" + I18N("gt.newCallList.Sent") + "</td>" +
          "<td>" + I18N("gt.newCallList.Rcvd") + "</td>" +
          "<td>" + I18N("gt.newCallList.Station") + "</td>" +
          "<td>" + I18N("gt.newCallList.Mode") + "</td>" +
          "<td>" + I18N("gt.newCallList.Band") + "</td>" +
          "<td>" + I18N("gt.newCallList.QSL") + "</td>" +
          "<td>" + I18N("gt.newCallList.LastMsg") + "</td>" +
          "<td>" + I18N("gt.newCallList.DXCC") + "</td>" +
          "<td>" + I18N("gt.newCallList.Time") + "</td>";

      if (GT.settings.callsignLookups.lotwUseEnable == true) worker += "<td>" + I18N("gt.qsoPage.LoTW") + "</td>";
      if (GT.settings.callsignLookups.eqslUseEnable == true) worker += "<td>" + I18N("gt.qsoPage.eQSL") + "</td>";
      if (GT.settings.callsignLookups.oqrsUseEnable == true) worker += "<td>" + I18N("gt.qsoPage.OQRS") + "</td>";
      worker += "</tr>";
    }
    for (let KeyIsHash in toolElement.hashes)
    {
      if (KeyIsHash in GT.QSOhash)
      {
        newCallList.push(GT.QSOhash[KeyIsHash]);
      }
    }
    if (toolElement.qth in GT.liveGrids && GT.liveGrids[toolElement.qth].rectangle != null && GT.liveGrids[toolElement.qth].isTriangle == false)
    {
      for (let KeyIsCall in GT.liveGrids[toolElement.qth].rectangle.liveHash)
      {
        if (KeyIsCall in GT.liveCallsigns && GT.settings.app.gridViewMode == 3) { newCallList.push(GT.liveCallsigns[KeyIsCall]); }
      }
    }
  }
  else
  {
    if (toolElement.liveHash != null && Object.keys(toolElement.liveHash).length > 0)
    {
      worker +=
        "<tr align='center'>" +
          "<td>" + I18N("gt.newCallList.Call") + "</td>" +
          "<td>" + I18N("gt.newCallList.Freq") + "</td>" +
          "<td>" + I18N("gt.newCallList.Sent") + "</td>" +
          "<td>" + I18N("gt.newCallList.Rcvd") + "</td>" +
          "<td>" + I18N("gt.newCallList.Station") + "</td>" +
          "<td>" + I18N("gt.newCallList.Mode") + "</td>" +
          "<td>" + I18N("gt.newCallList.Band") + "</td>" +
          "<td>" + I18N("gt.newCallList.LastMsg") + "</td>" +
          "<td>" + I18N("gt.newCallList.DXCC") + "</td>" +
          "<td>" + I18N("gt.newCallList.Time") + "</td>";

      if (GT.settings.callsignLookups.lotwUseEnable == true) worker += "<td>" + I18N("gt.newCallList.LoTW") + "</td>";
      if (GT.settings.callsignLookups.eqslUseEnable == true) worker += "<td>" + I18N("gt.newCallList.eQSL") + "</td>";
      if (GT.settings.callsignLookups.oqrsUseEnable == true) worker += "<td>" + I18N("gt.newCallList.OQRS") + "</td>";
      worker += "</tr>";
    }
    for (let KeyIsCall in toolElement.liveHash)
    {
      if (KeyIsCall in GT.liveCallsigns) { newCallList.push(GT.liveCallsigns[KeyIsCall]); }
    }
  }
  newCallList.sort(compareCallsignTime).reverse();
  for (let x = 0; x < newCallList.length; x++)
  {
    let callsign = newCallList[x];
    let bgDX = " style='font-weight:bold;color:cyan;' ";
    let bgDE = " style='font-weight:bold;color:yellow;' ";
    if (callsign.DXcall == GT.settings.app.myCall) { bgDX = " style='background-color:cyan;color:#000;font-weight:bold' "; }
    if (callsign.DEcall == GT.settings.app.myCall) { bgDE = " style='background-color:#FFFF00;color:#000;font-weight:bold' "; }
    if (typeof callsign.msg == "undefined" || callsign.msg == "") { callsign.msg = "-"; }
    let ageString = "";
    if (timeNowSec() - callsign.time < 3601) { ageString = toDHMS(timeNowSec() - callsign.time); }
    else
    {
      ageString = userTimeString(callsign.time * 1000);
    }
    worker += "<tr><td" + bgDE + ">";
    worker +=
      "<div style='display:inline-table;cursor:pointer' onclick='startLookup(\"" +
      callsign.DEcall +
      "\",\"" +
      toolElement.qth +
      "\");' >" +
      formatCallsign(callsign.DEcall) +
      "</div>";
    worker += "</td>";
    worker += "<td>" + (callsign.delta > -1 ? callsign.delta : "-") + "</td>";
    worker += "<td>" + callsign.RSTsent + "</td>";
    worker += "<td>" + callsign.RSTrecv + "</td>" + "<td" + bgDX + ">";
    if (callsign.DXcall.indexOf("CQ") == 0 || callsign.DXcall == "-") { worker += formatCallsign(callsign.DXcall); }
    else
    {
      worker +=
        "<div  style='display:inline-table;cursor:pointer' onclick='startLookup(\"" +
        callsign.DXcall +
        "\",null);' >" +
        formatCallsign(callsign.DXcall) +
        "</div>";
    }
    worker +=
      "</td>" +
      "<td style='color:lightblue'>" +
      callsign.mode +
      "</td>" +
      "<td style='color:lightgreen'>" +
      callsign.band +
      "</td>";
    if (toolElement.qso == true)
    {
      worker +=
        "<td align='center'>" +
        (callsign.confirmed ? "&#10004;" : "") +
        "</td>";
    }
    worker +=
      "<td>" +
      callsign.msg +
      "</td><td style='color:yellow'>" +
      GT.dxccToAltName[callsign.dxcc] +
      " <font color='lightgreen'>(" +
      GT.dxccInfo[callsign.dxcc].pp +
      ")</font></td>" +
      "<td align='center' style='color:lightblue' >" +
      ageString +
      "</td>";

    if (GT.settings.callsignLookups.lotwUseEnable == true)
    {
      worker +=
        "<td align='center'>" +
        (callsign.DEcall in GT.lotwCallsigns ? "&#10004;" : "") +
        "</td>";
    }
    if (GT.settings.callsignLookups.eqslUseEnable == true)
    {
      worker +=
        "<td align='center'>" +
        (callsign.DEcall in GT.eqslCallsigns ? "&#10004;" : "") +
        "</td>";
    }
    if (GT.settings.callsignLookups.oqrsUseEnable == true)
    {
      worker +=
        "<td align='center'>" +
        (callsign.DEcall in GT.oqrsCallsigns ? "&#10004;" : "") +
        "</td>";
    }

    worker += "</tr>";
  }
  worker += "</table>";
  myTooltip.innerHTML = worker;
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
  if (GT.rosterUpdateTimer != null)
  {
    nodeTimers.clearTimeout(GT.rosterUpdateTimer);
    GT.rosterUpdateTimer = null;
  }

  let now = timeNowSec();
  if (!(hash in GT.callRoster))
  {
    GT.callRoster[hash] = {};
    callObj.life = now;
    callObj.reset = false;
  }
  if (callObj.reset)
  {
    callObj.life = now;
    callObj.reset = false;
  }

  if (typeof callObj.life == "undefined")
  {
    callObj.life = now;
    callObj.reset = false;
  }

  GT.callRoster[hash].message = newMessage;
  GT.callRoster[hash].callObj = callObj;
  GT.callRoster[hash].DXcall = msgDXcallsign;
  GT.callRoster[hash].DEcall = msgDEcallsign;

  GT.rosterUpdateTimer = nodeTimers.setTimeout(delayedRosterUpdate, 150);
}

function delayedRosterUpdate()
{
  GT.rosterUpdateTimer = null;
  goProcessRoster();
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
  showWorkedBox(0, 0, true);
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
  let LL = squareToLatLong(iQTH.substr(0, 4));

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
  (GT.menuShowing == false) ? collapseMenu(false) : collapseMenu(true);
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
    end = ` Needed ${(GT.viewInfo[GT.currentOverlay][4] - GT.viewInfo[GT.currentOverlay][2])}]`;
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
        let LL = squareToLatLong(key);
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

function moonOver(feature)
{
  if (GT.currentOverlay != 0) return false;

  let data = subLunar(timeNowSec());
  let object = doRAconvert(GT.myLon, GT.myLat, data.RA, data.Dec);
  let elevation = object.elevation.toFixed(1);
  let elColor = "yellow";
  if (elevation <= 0) elColor = "red";
  if (elevation > 10.0) elColor = "lightgreen";
  let worker = "<table class='darkTable'>";
  worker += "<tr><th colspan=2 style='font-size:15px;color:cyan;'>Moon</th></tr>";
  worker += "<tr><th >Azimuth</th><td  style='color:lightgreen'>" + object.azimuth.toFixed(1) + "&deg;</td></tr>";
  worker += "<tr><th >Elevation</th><td  style='color:" + elColor + "'>" + elevation + "</td></tr>";
  worker += "</table>";
  myMoonTooltip.innerHTML = worker;

  moonMove();

  myMoonTooltip.style.zIndex = 499;
  myMoonTooltip.style.display = "block";

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

function trophyOver(feature)
{
  let name = feature.getGeometryName();
  let infoObject = {};
  let trophy = "";
  let zone = null;

  let key = feature.get("prop");
  if (key == "cqzone")
  {
    trophy = "CQ Zone";
    infoObject = GT.cqZones[name];
    zone = name;
    name = GT.cqZones[name].name;
  }
  else if (key == "ituzone")
  {
    trophy = "ITU Zone";
    infoObject = GT.ituZones[name];
  }
  else if (key == "wac" && name in GT.wacZones)
  {
    trophy = "Continent";
    infoObject = GT.wacZones[name];
  }
  else if (key == "was" && name in GT.wasZones)
  {
    trophy = "US State";
    infoObject = GT.wasZones[name];
    name = GT.StateData[name].name;
  }
  else if (key == "wacp" && name in GT.wacpZones)
  {
    trophy = "CA Provinces";
    infoObject = GT.wacpZones[name];
    name = GT.StateData[name].name;
  }
  else if (key == "dxcc" && name in GT.dxccInfo)
  {
    trophy = "DXCC";
    let ref = name;
    infoObject = GT.dxccInfo[ref];
    name = GT.dxccInfo[ref].name + " <font color='orange'>(" + GT.dxccInfo[ref].pp + ")</font>";
  }
  else if (key == "usc")
  {
    trophy = "US County";
    infoObject = GT.countyData[name];
    name = infoObject.geo.properties.n + ", " + infoObject.geo.properties.st;
  }
  else if (key == "us48")
  {
    trophy = "US Continental Grids";
    infoObject = GT.us48Data[feature.get("grid")];
    name = feature.get("grid");

    if (name in GT.gridToState)
    {
      zone = "";
      for (let x = 0; x < GT.gridToDXCC[name].length; x++)
      {
        if (name in GT.gridToState)
        {
          for (let y = 0; y < GT.gridToState[name].length; y++)
          {
            if (GT.gridToDXCC[name][x] == GT.StateData[GT.gridToState[name][y]].dxcc && GT.gridToDXCC[name][x] == 291)
            {
              zone += GT.StateData[GT.gridToState[name][y]].name + ", ";
            }
          }
        }
      }
      zone = zone.substr(0, zone.length - 2);
    }
  }

  let worker = "<table>";
  worker += "<tr><th colspan=2 >" + trophy + "</th></tr>";
  worker += "<tr><td colspan=2><font color='white'><b>" + name + "</b></font></td></tr>";

  if (zone)
  {
    worker += " <tr><td colspan=2><font color='lightgreen'>" + zone + "</font></td></tr>";
  }

  let wc1Table = "<td></td>";
  if (infoObject.worked)
  {
    wc1Table = "<td align=center><table class='darkTable'>";
    wc1Table += "<tr><td colspan=2 ><font  color='yellow'>" + I18N("gt.wcTable.Worked") + "</font></td></tr>";
    wc1Table += "<tr><td align=right><font color='green'>Band</font></td>";
    wc1Table += "<td align=left><table class='subtable'>";
    let keys = Object.keys(infoObject.worked_bands).sort();
    for (key in keys)
    {
      wc1Table += "<tr><td align=right>" + keys[key] + "</td><td align=left> <font color='white'>(" + infoObject.worked_bands[keys[key]] + ") </font></td></tr>";
    }
    wc1Table += "</table></td>";
    wc1Table += "</tr>";
    wc1Table += "<tr>";
    wc1Table += "<td align=right><font color='orange'>" + I18N("gt.wcTable.Mode") + "</font></td>";
    wc1Table += "<td align=left><table class='subtable'>";
    keys = Object.keys(infoObject.worked_modes).sort();
    for (key in keys)
    {
      wc1Table += "<tr><td align=right>" + keys[key] + "</td><td align=left> <font color='white'>(" + infoObject.worked_modes[keys[key]] + ") </font></td></tr>";
    }

    wc1Table += "</table></td>";
    wc1Table += "</tr>";
    wc1Table += "</table></td>";
  }
  let wcTable = "<td></td>";
  if (infoObject.confirmed)
  {
    wcTable = "<td align=center><table class='darkTable'>";
    wcTable += "<tr><td colspan=2 ><font  color='lightgreen'>" + I18N("gt.wcTable.Confirmed") + "</font></td></tr>";
    wcTable += "<tr><td align=right><font color='green'>" + I18N("gt.wcTable.Band") + "</font></td>";
    wcTable += "<td align=left><table class='subtable'>";
    let keys = Object.keys(infoObject.confirmed_bands).sort();
    for (key in keys)
    {
      wcTable += "<tr><td align=right>" + keys[key] + "</td><td align=left> <font color='white'>(" + infoObject.confirmed_bands[keys[key]] + ") </font></td></tr>";
    }
    wcTable += "</table></td>";
    wcTable += "</tr>";
    wcTable += "<tr>";
    wcTable += "<td align=right><font color='orange'>" + I18N("gt.wcTable.Mode") + "</font></td>";
    wcTable += "<td align=left><table class='subtable'>";
    keys = Object.keys(infoObject.confirmed_modes).sort();
    for (key in keys)
    {
      wcTable += "<tr><td align=right>" + keys[key] + "</td><td align=left> <font color='white'>(" + infoObject.confirmed_modes[keys[key]] + ") </font></td></tr>";
    }
    wcTable += "</table></td>";
    wcTable += "</tr>";
    wcTable += "</table></td>";
  }
  if (!infoObject.worked && !infoObject.confirmed)
  {
    worker +=
      "<tr><td colspan=2 ><font  color='orange'>" + I18N("gt.wcTable.Needed") + "</font></td></tr>";
  }
  else
  {
    worker += "<tr>" + wc1Table + wcTable + "</tr>";
  }

  worker += "</table>";

  myTrophyTooltip.innerHTML = "<div style='font-size:15px;color:cyan;' class='roundBorder'>" + worker + "</div>";

  trophyMove(feature);
  myTrophyTooltip.style.zIndex = 499;
  myTrophyTooltip.style.display = "block";
  return true;
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

function mouseDownGrid(longlat)
{
  if (isNaN(longlat[0]) || (GT.useTransform && ((MyCircle.distance(GT.myLat, GT.myLon, longlat[1], longlat[0]) * 3958.761) > k_max_aeqd_grid_in_miles)))
  {
    return null;
  }

  let grid = latLonToGridSquare(longlat[1], longlat[0]);
  GT.MyCurrentGrid = grid.substr(0, 4);
  let worker = "";
  worker += "<table align='center' class='darkTable'><tr style='color:white;'>";
  let bearing = parseInt(MyCircle.bearing(GT.myLat, GT.myLon, longlat[1], longlat[0]));
  worker += "<tr><td>Dist</td><td style='color:lightgreen'>" +
    parseInt(
      MyCircle.distance(
        GT.myLat,
        GT.myLon,
        longlat[1],
        longlat[0]
      ) * MyCircle.validateRadius(distanceUnit.value)
    ) +
    distanceUnit.value.toLowerCase() +
    "</td></tr>";
  worker += "<tr><td>Azim</td><td style='color:yellow'>" + bearing + "&deg;</td></tr>";
  worker += "<tr><td>Lat</td><td style='color:orange'>" + longlat[1].toFixed(3) + "</td></tr>";
  worker += "<tr><td>Long</td><td style='color:lightblue'>" + longlat[0].toFixed(3) + "</td></tr></table>";
  if (grid in GT.gridToDXCC)
  {
    worker += "<table align='center' class='darkTable' style='border-top:none'><tr style='color:white;'>";
    worker += "<tr style='color:orange;'>";
    for (let x = 0; x < GT.gridToDXCC[grid].length; x++)
    {
      worker +=
        "<td>" +
        GT.dxccToAltName[GT.gridToDXCC[grid][x]] +
        " <font color='lightgreen'>(" +
        GT.dxccInfo[GT.gridToDXCC[grid][x]].pp +
        ")</font></td>";
    }
    if (grid in GT.gridToState)
    {
      worker += "</tr><tr style='color:yellow;'>";
      for (let x = 0; x < GT.gridToDXCC[grid].length; x++)
      {
        worker += "<td>";
        if (grid in GT.gridToState)
        {
          for (let y = 0; y < GT.gridToState[grid].length; y++)
          {
            if (GT.gridToDXCC[grid][x] == GT.StateData[GT.gridToState[grid][y]].dxcc)
            {
              worker += GT.StateData[GT.gridToState[grid][y]].name + "<br>";
            }
          }
        }
        worker += "</td>";
      }
    }
    worker += "</tr></table>";

    showDxccGrids(grid);
  }

  tempGridToBox(grid, "#000000FF", "#00000000");

  myGridTooltip.innerHTML = "<div style='font-size:14px;font-weight:bold;color:cyan;margin:0 auto' class='roundBorder'>" + grid + "</div>" + worker;
  GT.MyGridIsUp = true;

  mouseMoveGrid();
  myGridTooltip.style.zIndex = 499;
  myGridTooltip.style.display = "block";
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

function createFlagTipTable(feature)
{
  let worker = "";
  let key = feature.key;
  let dxcc = callsignToDxcc(GT.gtFlagPins[key].call);
  let dxccName = GT.dxccToAltName[dxcc];
  let workColor = "cyan";

  if (GT.gtFlagPins[key].call + GT.settings.app.myBand + GT.settings.app.myMode in GT.tracker.worked.call)
  {
    workColor = "yellow";
  }
  if (GT.gtFlagPins[key].call + GT.settings.app.myBand + GT.settings.app.myMode in GT.tracker.confirmed.call)
  {
    workColor = "#00FF00";
  }

  worker += "<div style='background-color:" + workColor + ";color:#000;font-weight:bold;font-size:18px;border:2px solid gray;margin:0px' class='roundBorder'>" + formatCallsign(GT.gtFlagPins[key].call) + "</div>";
  worker += "<table id='tooltipTable' class='darkTable' >";
  worker += "<tr><td>DXCC</td><td style='color:orange;'>" + dxccName + " <font color='lightgreen'>(" + GT.dxccInfo[dxcc].pp + ")</font></td>";
  worker += "<tr><td>Grid</td><td style='color:cyan;' >" + GT.gtFlagPins[key].grid + "</td></tr>";
  worker += "<tr><td>Freq</td><td style='color:lightgreen' >" + formatMhz(Number(GT.gtFlagPins[key].freq / 1000), 3, 3) + " <font color='yellow'>(" + formatBand(Number(GT.gtFlagPins[key].freq / 1000000)) + ")</font></td></tr>";
  worker += "<tr><td>Mode</td><td style='color:orange' >" + GT.gtFlagPins[key].mode + "</td></tr>";

  let LL = squareToCenter(GT.gtFlagPins[key].grid);
  let bearing = parseInt(MyCircle.bearing(GT.myLat, GT.myLon, LL.a, LL.o));

  worker += "<tr><td>Dist</td><td style='color:cyan'>" + parseInt(MyCircle.distance(GT.myLat, GT.myLon, LL.a, LL.o) * MyCircle.validateRadius(distanceUnit.value)) + distanceUnit.value.toLowerCase() + "</td></tr>";
  worker += "<tr><td>Azim</td><td style='color:yellow'>" + bearing + "&deg;</td></tr>";
  worker += "</table>";

  myFlagtip.innerHTML = worker;
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

function createTimezoneTipTable(feature)
{
  let props = feature.getProperties();

  moment.locale(navigator.languages[0]);
  let m = moment().tz(props.tzid);
  let abbr = m.format("zz");
  let zone = m.format("Z");
  if (zone.indexOf(abbr) > -1) abbr = "";
  else abbr = " <font color='orange'>(" + abbr + ")</font>";

  worker = "<div style='background-color:cyan;color:#000;font-weight:bold;font-size:16px;border:2px solid gray;margin:0px;padding:1px' class='roundBorder'>" + props.tzid + "</div>";
  worker += "<table id='tooltipTable' class='darkTable' align=center>";
  worker += "<tr><td style='color:yellow;font-weight:bold'>" + m.format("LLLL") + "</td></tr>";
  worker += "<tr><td style='color:#00FF00;font-weight:bold'>" + zone + abbr + "</td></tr>";
  worker += "</table>";

  myTimezoneTip.innerHTML = worker;
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

function twoWideToLatLong(qth)
{
  qth = qth.toUpperCase();
  let a = qth.charCodeAt(0) - 65;
  let b = qth.charCodeAt(1) - 65;

  let la1 = b * 10;
  let lo1 = a * 20;
  let la2 = la1 + 10;
  let lo2 = lo1 + 20;
  let LatLong = [];

  la1 -= 90;
  lo1 -= 180;
  la2 -= 90;
  lo2 -= 180;
  LatLong.la1 = la1;
  LatLong.lo1 = lo1;
  LatLong.la2 = la2;
  LatLong.lo2 = lo2;
  return LatLong;
}

function squareToCenter(qth)
{
  let LL = squareToLatLongAll(qth);
  let obj = {};
  obj.a = LL.la2 - (LL.la2 - LL.la1) / 2;
  obj.o = LL.lo2 - (LL.lo2 - LL.lo1) / 2;
  return obj;
}

function squareToLatLongAll(qth)
{
  qth = qth.toUpperCase();
  let a = qth.charCodeAt(0) - 65;
  let b = qth.charCodeAt(1) - 65;
  let c = qth.charCodeAt(2) - 48;
  let d = qth.charCodeAt(3) - 48;
  let la1 = b * 10 + d;
  let lo1 = a * 20 + c * 2;
  let la2;
  let lo2;
  let LatLong = [];
  if (qth.length == 4)
  {
    la2 = la1 + 1;
    lo2 = lo1 + 2;
    LatLong.size = 4;
  }
  else
  {
    let lo3;
    let la3;
    let e = qth.charCodeAt(4) - 65;
    let f = qth.charCodeAt(5) - 65;
    let R = 5 / 60;
    let T = 2.5 / 60;
    lo3 = (e * 5) / 60;
    la3 = (f * 2.5) / 60;
    la1 += la3;
    lo1 += lo3;
    la2 = la1 + T;
    lo2 = lo1 + R;
    LatLong.size = 6;
  }

  la1 -= 90;
  lo1 -= 180;
  la2 -= 90;
  lo2 -= 180;
  LatLong.la1 = la1;
  LatLong.lo1 = lo1;
  LatLong.la2 = la2;
  LatLong.lo2 = lo2;
  return LatLong;
}

function squareToLatLong(qth)
{
  qth = qth.toUpperCase();
  let a = qth.charCodeAt(0) - 65;
  let b = qth.charCodeAt(1) - 65;
  let c = qth.charCodeAt(2) - 48;
  let d = qth.charCodeAt(3) - 48;
  let la1 = b * 10 + d;
  let lo1 = a * 20 + c * 2;
  let la2;
  let lo2;
  let LatLong = [];
  if (qth.length == 4 || GT.pushPinMode == false || GT.settings.app.sixWideMode == 0)
  {
    la2 = la1 + 1;
    lo2 = lo1 + 2;
    LatLong.size = 4;
  }
  else
  {
    let lo3;
    let la3;
    let e = qth.charCodeAt(4) - 65;
    let f = qth.charCodeAt(5) - 65;
    let R = 5 / 60;
    let T = 2.5 / 60;
    lo3 = (e * 5) / 60;
    la3 = (f * 2.5) / 60;
    la1 += la3;
    lo1 += lo3;
    la2 = la1 + T;
    lo2 = lo1 + R;
    LatLong.size = 6;
  }
  la1 -= 90;
  lo1 -= 180;
  la2 -= 90;
  lo2 -= 180;
  LatLong.la1 = la1;
  LatLong.lo1 = lo1;
  LatLong.la2 = la2;
  LatLong.lo2 = lo2;
  return LatLong;
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
    let LL = squareToLatLong(iQTH.substr(0, 4));
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
    LL = squareToLatLong(iQTH);
    if (LL.size == 6)
    {
      borderColor = "#000000FF";
      zIndex = 50;
    }
    newRect = {};
    newRect.qth = iQTH;

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

    let lat = LL.la2 - (LL.la2 - LL.la1) / 2;
    let lon = LL.lo2 - (LL.lo2 - LL.lo1) / 2;

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

function qthToBox(iQTH, iDEcallsign, iCQ, locked, DE, band, wspr, hash, fromLive)
{
  if (GT.settings.app.gridViewMode == 2) return null;

  if (GT.useTransform)
  {
    let LL = squareToLatLong(iQTH.substr(0, 4));
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
      let LL = squareToLatLong(iQTH);
      if (LL.size == 6)
      {
        borderColor = "#000000FF";
        // borderWeight = 1.0;
        zIndex = 50;
      }
      newRect = {};
      newRect.age = GT.timeNow;
      newRect.qth = iQTH;

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

      let lat = LL.la2 - (LL.la2 - LL.la1) / 2;
      let lon = LL.lo2 - (LL.lo2 - LL.lo1) / 2;

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

function alphaTo(rgba, alphaFloat)
{
  let alphaInt = parseInt(alphaFloat * 255);
  let alphaHex = alphaInt.toString(16);
  if (alphaHex.length == 1)
  {
    alphaHex = "0" + alphaHex;
  }
  return rgba.slice(0, -2) + alphaHex;
}

function intAlphaToRGB(rgb, alphaInt)
{
  let alphaHex = alphaInt.toString(16);
  if (alphaHex.length == 1)
  {
    alphaHex = "0" + alphaHex;
  }
  return rgb + alphaHex;
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

function changeWantedByBandMode()
{
  GT.settings.app.wantedByBandMode = wantedByBandMode.checked;
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

function changeAnimate()
{
  GT.settings.map.animate = animateValue.checked;
  
  let dash = [];
  let dashOff = 0;
  if (GT.settings.map.animate == true)
  {
    dash = GT.flightPathLineDash;
    dashOff = GT.flightPathTotal - GT.flightPathOffset;
  }

  for (let i = GT.flightPaths.length - 1; i >= 0; i--)
  {
    if (GT.flightPaths[i].isShapeFlight == 0)
    {
      let featureStyle = GT.flightPaths[i].getStyle();
      let featureStroke = featureStyle.getStroke();

      featureStroke.setLineDash(dash);
      featureStroke.setLineDashOffset(dashOff);

      featureStyle.setStroke(featureStroke);
      GT.flightPaths[i].setStyle(featureStyle);
    }
  }
  if (GT.transmitFlightPath != null)
  {
    let featureStyle = GT.transmitFlightPath.getStyle();
    let featureStroke = featureStyle.getStroke();

    featureStroke.setLineDash(dash);
    featureStroke.setLineDashOffset(dashOff);

    featureStyle.setStroke(featureStroke);
    GT.transmitFlightPath.setStyle(featureStyle);
  }

  if (GT.dazzleGrid != null)
  {
    let featureStyle = GT.dazzleGrid.getStyle();
    let featureStroke = featureStyle.getStroke();

    featureStroke.setLineDash(dash);
    featureStroke.setLineDashOffset(dashOff);

    featureStyle.setStroke(featureStroke);
    GT.dazzleGrid.setStyle(featureStyle);
  }

  if (GT.settings.map.animate)
  {
    setAnimate(true);
  }
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
      delete GT.flightPaths[i];
      GT.flightPaths[i] = null;

      GT.flightPaths.splice(i, 1);
    }
  }

  if (GT.timeNow >= GT.nextDimTime)
  {
    dimGridsquare();
    GT.nextDimTime = GT.timeNow + 8;
  }
}

GT.isAnimating = false;

function setAnimate(enabled)
{
  if (enabled && GT.isAnimating == false)
  {
    GT.isAnimating = true;
    requestAnimationFrame(animatePaths);
  }
  if (enabled == false) GT.isAnimating = false;
}

function animatePaths()
{
  if (GT.settings.map.animate == false)
  {
    GT.isAnimating = false;
    return;
  } 

  GT.animateFrame++;
  GT.animateFrame %= GT.settings.map.animateSpeed;

  let requestAnimation = false;

  if (GT.animateFrame > 0) 
  {
    setAnimate(false);
    if (GT.flightPaths.length > 0 || GT.transmitFlightPath || GT.dazzleGrid)
    {
      setAnimate(true);
    }
    return;
  }

  GT.flightPathOffset += 1;
  GT.flightPathOffset %= GT.flightPathTotal;

  let targetOffset = GT.flightPathTotal - GT.flightPathOffset;
  let featureStyle = null;
  let featureStroke = null;
  for (let i = 0; i < GT.flightPaths.length; i++)
  {
    if (GT.flightPaths[i].isShapeFlight == 0)
    {
      featureStyle = GT.flightPaths[i].getStyle();
      featureStroke = featureStyle.getStroke();
      featureStroke.setLineDashOffset(targetOffset);
      GT.flightPaths[i].setStyle(featureStyle);
      requestAnimation = true;
    }
  }

  if (GT.transmitFlightPath != null)
  {
    let featureStyle = GT.transmitFlightPath.getStyle();
    let featureStroke = featureStyle.getStroke();

    featureStroke.setLineDashOffset(targetOffset);

    featureStyle.setStroke(featureStroke);
    GT.transmitFlightPath.setStyle(featureStyle);
    requestAnimation = true;
  }

  if (GT.dazzleGrid != null)
  {
    let featureStyle = GT.dazzleGrid.getStyle();
    let featureStroke = featureStyle.getStroke();

    featureStroke.setLineDashOffset(targetOffset);

    featureStyle.setStroke(featureStroke);
    GT.dazzleGrid.setStyle(featureStyle);
    requestAnimation = true;
  }

  setAnimate(false);
  if (requestAnimation) setAnimate(requestAnimation);
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
  for (let i in GT.liveGrids)
  {
    dimFunction(GT.liveGrids[i]);

    if (GT.timeNow - GT.liveGrids[i].age >= gridDecay.value && GT.liveGrids[i].rectangle.locked == false)
    {
      // Walk the rectangles DEcall's and remove them from GT.liveCallsigns
      for (let CallIsKey in GT.liveGrids[i].rectangle.liveHash)
      {
        if (CallIsKey in GT.liveCallsigns)
        {
          let dxcc = GT.liveCallsigns[CallIsKey].dxcc;
          if (dxcc in GT.dxccCount)
          {
            GT.dxccCount[dxcc]--;
            if (GT.dxccCount[dxcc] < 1) delete GT.dxccCount[dxcc];
          }
          delete GT.liveCallsigns[CallIsKey];
        }
      }
      if (GT.liveGrids[i].rectangle.pin != null)
      {
        if (GT.layerSources.livePins.hasFeature(GT.liveGrids[i].rectangle.pin))
        {
          GT.layerSources.livePins.removeFeature(GT.liveGrids[i].rectangle.pin);
        }
      }
      if (GT.layerSources.live.hasFeature(GT.liveGrids[i].rectangle))
      {
        GT.layerSources.live.removeFeature(GT.liveGrids[i].rectangle);

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

function updateCountStats()
{
  let count = Object.keys(GT.liveCallsigns).length;

  if (GT.settings.app.myCall in GT.liveCallsigns) count--;

  callsignCount.innerHTML = count;

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

  countryCount.innerHTML = Object.keys(GT.dxccCount).length;

  if (Object.keys(GT.QSOhash).length > 0)
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

function clearQsoGrids()
{
  GT.layerSources.qso.clear();
  GT.layerSources.qsoPins.clear();

  GT.qsoGrids = {};

  for (const key in GT.dxccInfo)
  {
    clearWorkingObject(GT.dxccInfo[key]);
  }
  for (const key in GT.cqZones)
  {
    clearWorkingObject(GT.cqZones[key]);
  }
  for (const key in GT.ituZones)
  {
    clearWorkingObject(GT.ituZones[key]);
  }
  for (const key in GT.wasZones)
  {
    clearWorkingObject(GT.wasZones[key]);
  }
  for (const key in GT.wacpZones)
  {
    clearWorkingObject(GT.wacpZones[key]);
  }
  for (const key in GT.wacZones)
  {
    clearWorkingObject(GT.wacZones[key])
  }
  for (const key in GT.countyData)
  {
    clearWorkingObject(GT.countyData[key]);
  }
  for (const key in GT.us48Data)
  {
    clearWorkingObject(GT.us48Data[key]);
  }
}

function clearCalls()
{
  removePaths();
  GT.liveCallsigns = {};
  GT.dxccCount = {};
}

function clearLive()
{
  GT.Decodes = 0;

  GT.lastMessages = Array();
  GT.lastTraffic = Array();
  GT.callRoster = {};
  GT.dxccCount = {};

  removePaths();
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
  tryToDeleteLog("LogbookOfTheWorld.adif");
  tryToDeleteLog("LoTW_QSL.adif");
  tryToDeleteLog("qrz.adif");
  tryToDeleteLog("clublog.adif");

  GT.settings.adifLog.lastFetch.lotw_qsl = 0;
}

function getCurrentBandModeHTML()
{
  let band = GT.settings.app.gtBandFilter == "auto" ? GT.settings.app.myBand + " (Auto)" : GT.settings.app.gtBandFilter.length == 0 ? "Mixed Bands" : GT.settings.app.gtBandFilter;
  let mode = GT.settings.app.gtModeFilter == "auto" ? GT.settings.app.myMode + " (Auto)" : GT.settings.app.gtModeFilter.length == 0 ? "Mixed Modes" : GT.settings.app.gtModeFilter;
  return (
    "<div style='vertical-align:top;display:inline-block;margin-bottom:3px;color:lightgreen;font-weight:bold;font-size:larger'>" + I18N("stats.viewing") + ": <text style='color:yellow'>" +
    band +
    "</text> / <text style='color:orange'>" +
    mode +
    "</text></b></div><br>"
  );
}

function displayTime()
{
  GT.timeNow = timeNowSec();
  GT.currentDay = parseInt(GT.timeNow / 86400);
  GT.currentYear = new Date().getUTCFullYear();

  if (menuDiv.className == "menuDivStart" && GT.menuShowing == true)
  {
    menuDiv.className = "menuDivEnd";
    mapDiv.className = "mapDivEnd";
    legendDiv.className = "legendDivEnd";
    GT.map.updateSize();
  }

  currentTime.innerHTML = "<font color='lightblue'>" + userTimeString(null) + "</font>";
  if (GT.lastTimeSinceMessageInSeconds > 0)
  {
    let since = GT.timeNow - GT.lastTimeSinceMessageInSeconds;
    secondsAgoMsg.innerHTML = toDHMS(since);
    if (since > 17 && since < 122)
    {
      secondsAgoMsg.style.backgroundColor = "yellow";
      secondsAgoMsg.style.color = "#000";
    }
    else if (since > 121)
    {
      secondsAgoMsg.style.backgroundColor = "orange";
      secondsAgoMsg.style.color = "#000";
    }
    else
    {
      secondsAgoMsg.style.backgroundColor = "blue";
      secondsAgoMsg.style.color = "#FF0";
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
}

function changeMapProjection(honorMemory = true)
{
  if (honorMemory)
  {
    // save the current map view
    mapMemory(6, true, true);
  }

  // remove flights
  removePaths();

  if (GT.settings.map.projection == "AEQD")
  {
    GT.settings.map.projection = "EPSG:3857";
    projectionImg.style.filter = "grayscale(1)";
  }
  else
  {
    GT.settings.map.projection = "AEQD";
    projectionImg.style.filter = "";
  }

  delete GT.map;
  renderMap();

  if (honorMemory)
  {
    // load the current map view
    mapMemory(6, false);
  }

  drawAllGrids();
  drawRangeRings();
  displayPredLayer();
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

  mapSelect.value = def_maps.mapIndex;
  offlineMapSelect.value = def_maps.mapIndex;
  mapNightSelect.value = def_maps.mapIndex;
  offlineMapNightSelect.value = def_maps.mapIndex;

  GT.maps = requireJson("data/maps.json");
  if (GT.maps)
  {
    GT.maps = Object.keys(GT.maps).sort().reduce((obj, key) => { obj[key] = GT.maps[key]; return obj; }, {});

    if (!(GT.settings.map.mapIndex in GT.maps))
    {
      GT.settings.map.mapIndex = def_maps.mapIndex;
    }
    if (!(GT.settings.map.nightMapIndex in GT.maps))
    {
      GT.settings.map.nightMapIndex = def_maps.nightMapIndex;
    }
    if (!(GT.settings.map.offlineMapIndex in GT.maps))
    {
      GT.settings.map.offlineMapIndex = def_maps.offlineMapIndex;
    }
    if (!(GT.settings.map.offlineNightMapIndex in GT.maps))
    {
      GT.settings.map.offlineNightMapIndex = def_maps.offlineNightMapIndex;
    }

    for (const key in GT.maps)
    {
      GT.maps[key].attributions = "&copy; " + GT.maps[key].attributions + " <a href='https://gridtracker.org' target='_blank'>GridTracker.org</a>";
      if (GT.maps[key].sourceType == "Group")
      {
        ProcessGroupMapSource(key);
      }
      else
      {
        GT.mapsLayer[key] = new GT.mapSourceTypes[GT.maps[key].sourceType](GT.maps[key]);
      }

      let option = document.createElement("option");
      option.value = key;
      option.text = key;
      mapSelect.appendChild(option);

      option = document.createElement("option");
      option.value = key;
      option.text = key;
      mapNightSelect.appendChild(option);
      if (GT.maps[key].offline == true)
      {
        GT.offlineMapsLayer[key] = new ol.source.XYZ(GT.maps[key]);

        option = document.createElement("option");
        option.value = key;
        option.text = key;
        offlineMapSelect.appendChild(option);

        option = document.createElement("option");
        option.value = key;
        option.text = key;
        offlineMapNightSelect.appendChild(option);
      }
    }
    mapSelect.value = GT.settings.map.mapIndex;
    offlineMapSelect.value = GT.settings.map.offlineMapIndex;

    mapNightSelect.value = GT.settings.map.nightMapIndex;
    offlineMapNightSelect.value = GT.settings.map.offlineNightMapIndex;
  }
  else 
  {
    alert("Internal Map Data file Corrupt, GridTracker2 will now crash");
  }


  if (GT.settings.map.offlineMode)
  {
    GT.tileLayer = new ol.layer.Tile({
      source: GT.offlineMapsLayer[offlineMapSelect.value]
    });
  }
  else
  {
    if (GT.maps[mapSelect.value].sourceType == "Group")
    {
      GT.tileLayer = new ol.layer.Group({ layers: GT.mapsLayer[mapSelect.value] });
    }
    else
    {
      GT.tileLayer = new ol.layer.Tile({ source: GT.mapsLayer[mapSelect.value] });
    }
  }

  mapDiv.addEventListener("pointermove", mapMoveEvent);
  mapDiv.addEventListener("mouseleave", mapLoseFocus, false);
  mapDiv.addEventListener("contextmenu", function (event)
  {
    event.preventDefault();
  });

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
    for (let index in features)
    {
      if (!(features[index].values_.prop in GT.hoverFunctors)) continue;
      if (features[index].size == 6)
      {
        finalGridFeature = features[index];
      }
      if (features[index].size == 4 && finalGridFeature == null)
      {
        finalGridFeature = features[index];
      }
      if (features[index].size == 1)
      {
        leftClickGtFlag(features[index]);
        shouldReturn = true;
      }
      if (features[index].size == 22)
      {
        leftClickPota(features[index].key);
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

  document.getElementById("menuDiv").style.display = "block";

  dayNight.init();
  if (GT.settings.app.graylineImgSrc == 1 || GT.useTransform == true)
  {
    dayNight.hide();
  }
  else
  {
    GT.nightTime = dayNight.show();
  }
  Grayline.style.display = (GT.useTransform) ? "none" : "";

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
        let dist = parseInt(MyCircle.distance(GT.myLat, GT.myLon, LL[1], LL[0]) * MyCircle.validateRadius(distanceUnit.value)) + distanceUnit.value.toLowerCase();
        let azim = parseInt(MyCircle.bearing(GT.myLat, GT.myLon, LL[1], LL[0])) + "&deg;";
        let gg = latLonToGridSquare(LL[1], LL[0], 6);
        mouseTrackDiv.innerHTML = LL[1].toFixed(3) + ", " + LL[0].toFixed(3) + " " + dist + " " + azim + " " + gg;
      }
    }
  }

  let noFeature = true;
  let features = GT.map.getFeaturesAtPixel(mousePosition);
  if (features != null && features.length > 0)
  {
    for (let index in features)
    {
      if (!(features[index].values_.prop in GT.hoverFunctors)) continue;
      if (GT.lastHover.feature)
      {
        if (features[index] != GT.lastHover.feature)
        {
          GT.lastHover.functor.out(GT.lastHover.feature);
          GT.lastHover.feature = null;
        }
        else
        {
          // feature is still up.
          GT.hoverFunctors[features[index].values_.prop].move(features[index]);
          noFeature = false;
          break;
        }
      }
      if (GT.lastHover.feature == null)
      {
        if (GT.hoverFunctors[features[index].values_.prop].hover(features[index], true))
        {
          // feature was displayed.
          GT.lastHover.feature = features[index];
          GT.lastHover.functor = GT.hoverFunctors[features[index].values_.prop];
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

function collapseMenu(shouldCollapse)
{
  if (shouldCollapse == true)
  {
    GT.menuShowing = false;
    mapDiv.className = "mapDivStart";
    menuDiv.className = "menuDivStart";
    legendDiv.className = "legendDivStart";
    chevronDiv.className = "chevronDivEnd";
  }
  else
  {
    GT.menuShowing = true;
    chevronDiv.className = "chevronDivStart";
    displayTime();
  }
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
  let LL = squareToLatLong(iQTH);
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
  let LL = squareToLatLong(iQTH);
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

  let push = false;

  if (!(hash in GT.liveCallsigns))
  {
    newCallsign = {};
    push = true;
  }
  else
  {
    newCallsign = GT.liveCallsigns[hash];
  }

  newCallsign.DEcall = GT.settings.app.myCall;
  newCallsign.grid = GT.settings.app.myGrid;
  // newCallsign.field = newCallsign.grid.substring(0, 2);
  newCallsign.wspr = null;
  newCallsign.msg = GT.settings.app.myGrid;
  newCallsign.RSTsent = "-";
  newCallsign.RSTrecv = "-";
  newCallsign.time = timeNowSec();
  newCallsign.delta = -1;
  newCallsign.DXcall = "Self";
  newCallsign.mode = GT.settings.app.myMode;
  newCallsign.band = GT.settings.app.myBand;
  newCallsign.worked = false;
  newCallsign.confirmed = false;
  newCallsign.state = null;
  newCallsign.zipcode = null;
  newCallsign.cnty = null;
  newCallsign.qual = false;
  newCallsign.instance = null;
  newCallsign.rosterAlerted = false;
  newCallsign.shouldRosterAlert = false;
  newCallsign.audioAlerted = false;
  newCallsign.shouldAudioAlert = false;
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

      oamsBandActivityCheck();
      GT.gtLiveStatusUpdate = true;
      GT.startingUp = false;
    }

    GT.settings.app.myRawFreq = newMessage.Frequency;
    frequency.innerHTML = "<font color='lightgreen'>" + formatMhz(Number(newMessage.Frequency / 1000), 3, 3) + " Hz </font><font color='yellow'>(" + GT.settings.app.myBand + ")</font>";
    GT.settings.app.myRawCall = newMessage.DEcall.trim();
    GT.settings.app.myRawGrid = newMessage.DEgrid.trim().substr(0, 6);

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
        localDXCountry.innerHTML = GT.dxccToAltName[callsignToDxcc(DXcall)];
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
        let worker = "";

        worker += "<div  style='vertical-align:top;display:inline-block;margin-right:8px;'>";
        worker += "<table class='darkTable' align=center>";
        worker += "<tr><th colspan=7>Last " + GT.lastMessages.length + " Decoded Messages</th></tr>";
        worker += "<tr><th>Time</th><th>dB</th><th>DT</th><th>Freq</th><th>Mode</th><th>Message</th><th>DXCC</th></tr>";

        worker += GT.lastMessages.join("");

        worker += "</table></div>";

        setStatsDiv("decodeLastListDiv", worker);
        setStatsDivHeight("decodeLastListDiv", getStatsWindowHeight() + 26 + "px");
        showCallsignBoxIfTabOpen();

        if (GT.settings.app.offAirServicesEnable == true && Object.keys(GT.spotCollector).length > 0)
        {
          gtChatSendSpots(GT.spotCollector, GT.spotDetailsCollector);
          GT.spotCollector = {};
          GT.spotDetailsCollector = {};
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
        else if (GT.settings.map.qrzDxccFallback && DXcall.length > 0 && callsignToDxcc(DXcall) > 0)
        {
          let dxcc = callsignToDxcc(DXcall);
          let Lat = GT.dxccInfo[dxcc].lat;
          let Lon = GT.dxccInfo[dxcc].lon;
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
        else if (GT.settings.map.qrzDxccFallback && DXcall.length > 0 && callsignToDxcc(DXcall) > 0)
        {
          let dxcc = callsignToDxcc(DXcall);
          toPoint = ol.proj.fromLonLat([GT.dxccInfo[dxcc].lon, GT.dxccInfo[dxcc].lat]);

          let locality = GT.dxccInfo[dxcc].geo;
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
            console.error("Unexpected error inside handleInstanceStatus", err)
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
  if (Object.keys(GT.decodeCollector).length > 0)
  {
    gtChatSendDecodes(GT.decodeCollector);
    GT.decodeCollector = {};
  }
}

function drawTraffic()
{
  while (GT.lastTraffic.length > 60) GT.lastTraffic.pop();

  let worker = GT.lastTraffic.join("<br>");
  worker = worker.split("80%'><br>").join("80%'>");
  if (GT.localDXcall.length > 1)
  {
    worker = worker
      .split(GT.localDXcall)
      .join("<font style='color:cyan'>" + GT.localDXcall + "</font>");
  }
  if (GT.settings.app.myRawCall.length > 1)
  {
    worker = worker
      .split(GT.settings.app.myRawCall)
      .join("<font style='color:yellow'>" + GT.settings.app.myRawCall + "</font>");
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
  
  // eg: "YK7DAQ RR73; 3O5GAS <JI1BXD> +14"
  if (newMessage.Msg.indexOf(" RR73; ") > -1)
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
    // A classic mode 0 decoded messages
    finalWsjtxDecode(newMessage);
  }
}

const kIsEven = {
  FT8: { "00": 1, "30": 1 },
  FT4: { "00": 1, "15": 1, "30": 1, "45": 1 }
}

function finalWsjtxDecode(newMessage, isFox = false, foxMessage)
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
    newF = formatMhz(Number((newMessage.OF + newMessage.DF) / 1000), 3, 3);
  }
  else
  {
    newF = newMessage.DF;
  }
  let theTimeStamp = timeNowSec() - (timeNowSec() % 86400) + parseInt(newMessage.TM / 1000);

  let theMessage = (isFox == true ? foxMessage : newMessage.Msg);

  // Break up the decoded message
  let decodeWords = theMessage.split(" ").slice(0, 5);
  while (decodeWords[decodeWords.length - 1] == "") decodeWords.pop();

  if (decodeWords.length > 1)
  {
    if (theMessage.indexOf("<") != -1)
    {
      for (const i in decodeWords)
      {
        decodeWords[i] = decodeWords[i].replace("<", "").replace(">", "");
        if (decodeWords[i].indexOf("...") != -1)
        {
          if (i != 0)
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
    if (qth.length == 4)
    {
      let LETTERS = qth.substr(0, 2);
      let NUMBERS = qth.substr(2, 2);
      if (/^[A-R]+$/.test(LETTERS) && /^[0-9]+$/.test(NUMBERS))
      {
        theirQTH = LETTERS + NUMBERS;
        if (theirQTH != "RR73")
        {
          validQTH = true;
        }
        else
        {
          theirQTH = "";
          validQTH = false;
        }
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

    if (decodeWords[2] == "RR73")
    {
      RR73 = true;
    }

    let callsign = null;

    let hash = msgDEcallsign + newMessage.OB + newMessage.OM;
    if (hash in GT.liveCallsigns) callsign = GT.liveCallsigns[hash];

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
      let newCallsign = {};
      newCallsign.DEcall = msgDEcallsign;
      newCallsign.grid = theirQTH;
      // newCallsign.field = theirQTH.substring(0, 2);
      newCallsign.wspr = null;
      newCallsign.msg = newMessage.Msg;
      newCallsign.RSTsent = newMessage.SR;
      newCallsign.RSTrecv = "-";
      newCallsign.time = theTimeStamp;
      newCallsign.life = newCallsign.age = timeNowSec();
      newCallsign.delta = newMessage.DF;
      newCallsign.dt = newMessage.DT.toFixed(2);
      newCallsign.DXcall = msgDXcallsign.trim();
      newCallsign.state = null;
      newCallsign.zipcode = null;
      newCallsign.worked = false;
      newCallsign.confirmed = false;
      newCallsign.qso = false;
      newCallsign.dxcc = callsignToDxcc(newCallsign.DEcall);
      newCallsign.px = null;
      newCallsign.pota = null;
      newCallsign.zone = null;
      newCallsign.vucc_grids = [];
      newCallsign.propMode = "";
      newCallsign.digital = true;
      newCallsign.phone = false;
      newCallsign.even = false;
      newCallsign.IOTA = "";
      newCallsign.hash = hash;
      if (newCallsign.dxcc != -1)
      {
        newCallsign.px = getWpx(newCallsign.DEcall);
        if (newCallsign.px)
        {
          newCallsign.zone = Number(
            newCallsign.px.charAt(newCallsign.px.length - 1)
          );
        }

        newCallsign.cont = GT.dxccInfo[newCallsign.dxcc].continent;
        if (newCallsign.dxcc == 390 && newCallsign.zone == 1) { newCallsign.cont = "EU"; }
      }

      newCallsign.ituz = ituZoneFromCallsign(newCallsign.DEcall, newCallsign.dxcc);
      newCallsign.cqz = cqZoneFromCallsign(newCallsign.DEcall, newCallsign.dxcc);
      newCallsign.distance = 0;
      newCallsign.heading = 0;

      newCallsign.cnty = null;
      newCallsign.qual = false;

      getLookupCachedObject(msgDEcallsign, null, null, null, newCallsign);

      if (newCallsign.dxcc in GT.dxccCount) GT.dxccCount[newCallsign.dxcc]++;
      else GT.dxccCount[newCallsign.dxcc] = 1;

      newCallsign.rosterAlerted = false;
      newCallsign.shouldRosterAlert = false;
      newCallsign.audioAlerted = false;
      newCallsign.shouldAudioAlert = false;
      GT.liveCallsigns[hash] = newCallsign;
      callsign = newCallsign;
    }
    else
    {
      if (validQTH)
      {
        callsign.grid = theirQTH;
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
    // callsign.field = callsign.grid.substring(0, 2);
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

      if (GT.settings.app.spottingEnable == true && newMessage.OF > 0)
      {
        let freq = callsign.delta + newMessage.OF;
        if (callsign.DEcall in GT.gtCallsigns)
        {
          for (const cid in GT.gtCallsigns[callsign.DEcall])
          {
            if (cid in GT.gtFlagPins && GT.gtFlagPins[cid].o == 1)
            {
              GT.spotCollector[cid] = callsign.RSTsent;
              GT.spotDetailsCollector[cid] = [freq, callsign.mode];
            }
          }
        }
        freq = freq - (freq % k_frequencyBucket);
        GT.decodeCollector[freq] ??= 0;
        GT.decodeCollector[freq]++;
      }
    }

    if (callsign.dxcc != -1) countryName = GT.dxccToAltName[callsign.dxcc];
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
                    zIndex: 90
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
                  zIndex: 90
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
            if (CCd in GT.prefixToMap)
            {
              locality = GT.dxccInfo[GT.prefixToMap[CCd]].geo;
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
                  zIndex: 90
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

function shapeFeature(
  key,
  geoJsonData,
  propname,
  fillColor,
  borderColor,
  borderWidth
)
{
  let feature = new ol.format.GeoJSON({
    geometryName: key
  }).readFeature(geoJsonData, {
    featureProjection: GT.settings.map.projection
  });

  let style = new ol.style.Style({
    stroke: new ol.style.Stroke({
      color: borderColor,
      width: borderWidth
    }),
    fill: new ol.style.Fill({
      color: fillColor
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
      let dxcc = GT.liveCallsigns[hash].dxcc;
      if (dxcc in GT.dxccCount)
      {
        GT.dxccCount[dxcc]--;
        if (GT.dxccCount[dxcc] < 1) delete GT.dxccCount[dxcc];
      }
      delete GT.liveCallsigns[hash];
    }
  }
  for (let call in GT.callRoster)
  {
    if (GT.callRoster[call].callObj.instance == newMessage.instance) { delete GT.callRoster[call]; }
  }

  redrawGrids();
  redrawPins();

  updateCountStats();
  goProcessRoster();
}

function goProcessRoster()
{
  let now = timeNowSec();
  for (const call in GT.callRoster)
  {
    if (now - GT.callRoster[call].callObj.age > 300)
    {
      GT.callRoster[call].callObj.rosterAlerted = false;
      GT.callRoster[call].callObj.shouldRosterAlert = false;
      GT.callRoster[call].callObj.audioAlerted = false;
      GT.callRoster[call].callObj.shouldAudioAlert = false;
      delete GT.callRoster[call];
      continue;
    }
  }
  if (GT.callRosterWindowInitialized)
  {
    try
    {
      GT.callRosterWindowHandle.window.processRoster();
    }
    catch (e)
    {
      logError(e);
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
    "Pwr:" + newMessage.Power + " Freq:" + formatMhz(Number(newMessage.Frequency / 1000), 3, 3) + " Delta:" + Number(newMessage.DT).toFixed(2) + " Drift:" +
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
      let LL = squareToLatLong(dxcc.mh[y]);
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
    let LL = squareToLatLong(grid);

    if (dazzle) dazzleGrid(LL);

    GT.map
      .getView()
      .setCenter(
        ol.proj.fromLonLat([
          LL.lo2 - (LL.lo2 - LL.lo1) / 2,
          LL.la2 - (LL.la2 - LL.la1) / 2
        ], GT.settings.map.projection)
      );
  }
}

function setCenterQTH()
{
  if (GT.settings.app.myGrid.length >= 4)
  {
    // Grab home QTH Gridsquare from Center QTH
    let LL = squareToLatLong(GT.settings.app.myGrid);

    GT.mapView
      .setCenter(
        ol.proj.fromLonLat([
          LL.lo2 - (LL.lo2 - LL.lo1) / 2,
          LL.la2 - (LL.la2 - LL.la1) / 2
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

function showCallsignBox(redraw)
{
  let worker = "<div style='vertical-align:top;display:inline-block;margin:2px;color:cyan;font-weight:bold'>" + I18N("gt.callsignBox.title") + "</div><br>";

  GT.newCallsignCount = Object.keys(GT.liveCallsigns).length;
  if (GT.newCallsignCount > 0)
  {
    let newCallList = Array();

    worker +=
      "<div  style='display:inline-block;padding-right:4px;margin-right:8px; overflow:auto;overflow-x:hidden;height:" +
      Math.min(GT.newCallsignCount * 24 + 26, getStatsWindowHeight()) + "px;'>" +
        "<table class='darkTable' align=center>" +
        "<th align=left>" + I18N("gt.callsignBox.callsign") + "</th>" +
        "<th align=left>" + I18N("gt.callsignBox.Grid") + "</th>" +
        "<th>" + I18N("gt.newCallList.Band") + "</th>" +
        "<th>" + I18N("gt.callsignBox.DXCC") + "</th>" +
        "<th>" + I18N("gt.callsignBox.CQ") + "</th>" +
        "<th>" + I18N("gt.callsignBox.ITU") + "</th>" +
        "<th>" + I18N("gt.callsignBox.Flag") + "</th>" +
        "<th align=left>" + I18N("gt.callsignBox.QSO") + "</th>" +
        "<th>" + I18N("gt.callsignBox.QSL") + "</th>" +
        "<th>" + I18N("gt.callsignBox.When") + "</th>";
    if (GT.settings.callsignLookups.lotwUseEnable == true) worker += "<th>" + I18N("gt.callsignBox.LoTW") + "</th>";
    if (GT.settings.callsignLookups.eqslUseEnable == true) worker += "<th>" + I18N("gt.callsignBox.eQSL") + "</th>";
    if (GT.settings.callsignLookups.oqrsUseEnable == true) worker += "<th>" + I18N("gt.callsignBox.OQRS") + "</th>";
    for (let x in GT.liveCallsigns)
    {
      if (GT.liveCallsigns[x].dxcc != -1)
      {
        newCallList.push(GT.liveCallsigns[x]);
      }
    }
    newCallList.sort(compareCallsignTime).reverse();
    for (let x in newCallList)
    {
      if (newCallList[x].DEcall == GT.settings.app.myRawCall) continue;
      let grid = newCallList[x].grid ? newCallList[x].grid : "-";
      let cqzone = newCallList[x].cqz ? newCallList[x].cqz : "-";
      let ituzone = newCallList[x].ituz ? newCallList[x].ituz : "-";
      let geo = GT.dxccInfo[newCallList[x].dxcc];
      let thisCall = formatCallsign(newCallList[x].DEcall);
      let bandColor = newCallList[x].band in GT.pskColors ? GT.pskColors[newCallList[x].band] : GT.pskColors.OOB;

      worker += "<tr><td align=left style='color:#ff0;cursor:pointer'  onClick='window.opener.startLookup(\"" + newCallList[x].DEcall + "\",\"" + grid + "\");'>" + thisCall + "</td>";
      worker += "<td align=left style='color:cyan;' >" + grid + "</td>";
      worker += "<td style='color:#" + bandColor + ";'>" + newCallList[x].band + "</td>";
      worker += "<td style='color:orange;'>" + geo.name + "<font style='color:lightgreen;'> (" + geo.pp + ")<font></td>";
      worker += "<td>" + cqzone + "</td><td>" + ituzone + "</td>";
      worker += "<td align='center' style='margin:0;padding:0'><img style='padding-top:4px' src='img/flags/16/" + geo.flag + "'></td>";
      worker += "<td>" + (thisCall in GT.tracker.worked.call ? "&#10004;" : "") + "</td><td>" + (thisCall in GT.tracker.confirmed.call ? "&#10004;" : "") + "</td>";
      let ageString = "";
      if (timeNowSec() - newCallList[x].time < 3601) { ageString = toDHMS(timeNowSec() - newCallList[x].time); }
      else
      {
        ageString = userTimeString(newCallList[x].time * 1000);
      }
      worker += "<td>" + ageString + "</td>";
      if (GT.settings.callsignLookups.lotwUseEnable == true)
      {
        worker += "<td align='center'>" + (thisCall in GT.lotwCallsigns ? "&#10004;" : "") + "</td>";
      }
      if (GT.settings.callsignLookups.eqslUseEnable == true)
      {
        worker += "<td align='center'>" + (thisCall in GT.eqslCallsigns ? "&#10004;" : "") + "</td>";
      }
      if (GT.settings.callsignLookups.oqrsUseEnable == true)
      {
        worker += "<td align='center'>" + (thisCall in GT.oqrsCallsigns ? "&#10004;" : "") + "</td>";
      }
      worker += "</tr>";
    }
    worker += "</table></div>";
  }

  let heard = 0;
  let List = {};
  if (Object.keys(GT.dxccCount).length > 0)
  {
    for (let key in GT.dxccCount)
    {
      if (key != -1)
      {
        let item = {};
        item.total = GT.dxccCount[key];
        item.confirmed = GT.dxccInfo[key].confirmed;
        item.worked = GT.dxccInfo[key].worked;
        item.dxcc = key;
        item.flag = GT.dxccInfo[key].flag;
        List[GT.dxccToAltName[key]] = item;
        heard++;
      }
    }
    worker +=
      "<div  style='vertical-align:top;display:inline-block;margin-right:2px;overflow:auto;overflow-x:hidden;height:" +
      Math.min(
        Object.keys(GT.dxccCount).length * 23 + 45,
        getStatsWindowHeight()
      ) +
      "px;'>" +
        "<table class='darkTable' align=center>" +
        "<tr><th colspan=4 style='font-weight:bold'>DXCC (" + heard + ")</th>" +
        "<tr>" +
        "<th align=left>" + I18N("gt.callsignBox.Name") + "</th>" +
        "<th>" + I18N("gt.callsignBox.Flag") + "</th>" +
        "<th align=left>" + I18N("gt.callsignBox.Calls") + "</th>" +
        "</tr>";
    Object.keys(List)
      .sort()
      .forEach(function (key, i)
      {
        worker += "<tr><td align=left style='color:#ff0;' >" + key + "</td>";
        worker +=
          "<td align='center' style='margin:0;padding:0'><img style='padding-top:3px' src='img/flags/16/" +
          List[key].flag +
          "'></td>";
        worker +=
          "<td align=left style='color:lightblue;' >" +
          List[key].total +
          "</td>";
        worker += "</tr>";
      });
    worker += "</table></div>";
  }
  worker += "</div>";

  setStatsDiv("callsignListDiv", worker);
}

function showCallsignBoxIfTabOpen()
{
  if (GT.statsWindowInitialized)
  {
    if (GT.statsWindowHandle.window["callsignBoxDiv"].style.display == "block")
    {
      showCallsignBox(true);
    }
  }
}

function setStatsDiv(div, worker)
{
  if (GT.statsWindowInitialized)
  {
    GT.statsWindowHandle.window[div].innerHTML = worker;
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
  if (GT.lookupWindowInitialized && typeof GT.lookupWindowHandle.window[div].innerHTML !== "undefined")
  {
    GT.lookupWindowHandle.window[div].innerHTML = worker;
  }
}

function setLookupDivHeight(div, heightWithPx)
{
  if (GT.lookupWindowInitialized && typeof GT.lookupWindowHandle.window[div].style !== "undefined")
  {
    GT.lookupWindowHandle.window[div].style.height = heightWithPx;
  }
}

function getLookupWindowHeight()
{
  if (GT.lookupWindowInitialized && typeof GT.lookupWindowHandle.window.window !== "undefined")
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
  if (a.time > b.time) return 1;
  if (a.time < b.time) return -1;
  return 0;
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
  GT.lastSortType = 2;
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

function showWorkedByCall(callsign, event)
{
  event.preventDefault();

  resetSearch();
  GT.searchWB = callsign;
  if (event.shiftKey == true) GT.filterQSL = "true";
  openInfoTab("qsobox", "workedBoxDiv", showWorkedBox);
}

function showWorkedSearchChanged(object, index)
{
  ValidateCallsign(object, null);
  GT.searchWB = object.value.toUpperCase();
  GT.lastSearchSelection = object.id;
  showWorkedBox(index, 0);
}

function showWorkedSearchState(object, index)
{
  ValidateCallsign(object, null);
  GT.stateSearch = object.value.toUpperCase();
  GT.lastSearchSelection = object.id;
  showWorkedBox(index, 0);
}

function showWorkedSearchCnty(object, index)
{
  ValidateCallsign(object, null);
  GT.cntySearch = object.value.toUpperCase();
  GT.lastSearchSelection = object.id;
  showWorkedBox(index, 0);
}

function showWorkedSearchPOTA(object, index)
{
  ValidateCallsign(object, null);
  GT.potaSearch = object.value.toUpperCase();
  GT.lastSearchSelection = object.id;
  showWorkedBox(index, 0);
}

function showWorkedSearchGrid(object, index)
{
  ValidateCallsign(object, null);
  GT.gridSearch = object.value.toUpperCase();
  GT.lastSearchSelection = object.id;
  showWorkedBox(index, 0);
}

function filterBandFunction(event, index)
{
  GT.filterBand = this.value;
  GT.lastSearchSelection = this.id;
  showWorkedBox(index, 0);
}

function filterModeFunction(event, index)
{
  GT.filterMode = this.value;
  GT.lastSearchSelection = this.id;
  showWorkedBox(index, 0);
}

function filterDxccFunction(event, index)
{
  GT.filterDxcc = this.value;
  GT.lastSearchSelection = this.id;
  showWorkedBox(index, 0);
}

function filterQSLFunction(event, index)
{
  GT.filterQSL = this.value;
  GT.lastSearchSelection = this.id;
  showWorkedBox(index, 0);
}

function changeZday(element)
{
  GT.Zday = element.checked;
  showWorkedBox();
}

function showWorkedBox(sortIndex, nextPage, redraw)
{
  try
  {
    let myObjects = null;
    let mySort = sortIndex;
    let bands = {};
    let modes = {};
    let dxccs = {};
    let confSrcs = {};
    let ObjectCount = 0;

    myObjects = GT.QSOhash;

    if (sortIndex == null || typeof sortIndex == "undefined")
    {
      mySort = 4;
      GT.lastSortIndex = 4;
      GT.lastSortType = 2;
    }

    let list = Object.values(myObjects);

    if (GT.Zday)
    {
      list = list.filter(function (value)
      {
        return parseInt(value.time / 86400) == GT.currentDay;
      });
    }

    if (GT.searchWB.length > 0)
    {
      let regExTest = new RegExp(GT.searchWB, "gi")
      list = list.filter(function (value)
      {
        return value.DEcall.match(regExTest);
      });
    }

    if (GT.gridSearch.length > 0)
    {
      list = list.filter(function (value)
      {
        let x = value.grid.indexOf(GT.gridSearch);
        let y = value.vucc_grids.indexOf(GT.gridSearch);
        return x == 0 || y == 0;
      });
    }

    if (GT.stateSearch.length > 0)
    {
      let regExTest = new RegExp(GT.stateSearch, "gi")
      list = list.filter(function (value)
      {
        if (!value.state) return false;
        return value.state.match(regExTest);
      });
    }

    if (GT.cntySearch.length > 0)
    {
      let regExTest = new RegExp(GT.cntySearch, "gi")
      list = list.filter(function (value)
      {
        if (!value.cnty) return false;
        if (!(value.cnty in GT.countyData)) return false;
        return GT.countyData[value.cnty].geo.properties.n.match(regExTest);
      });
    }

    if (GT.potaSearch.length > 0)
    {
      let regExTest = new RegExp(GT.potaSearch, "gi")
      list = list.filter(function (value)
      {
        if (!value.pota) return false;
        return value.pota.match(regExTest);
      });
    }

    for (let key in list)
    {
      bands[list[key].band] = list[key].band;
      modes[list[key].mode] = list[key].mode;

      let pp = list[key].dxcc in GT.dxccInfo ? GT.dxccInfo[list[key].dxcc].pp : "?";

      dxccs[GT.dxccToAltName[list[key].dxcc] + " (" + pp + ")"] = list[key].dxcc;
      if (list[key].confirmed)
      {
        confSrcs = Object.assign(confSrcs, list[key].confSrcs);
      }
    }

    if (GT.filterBand != "Mixed")
    {
      list = list.filter(function (value)
      {
        return value.band == GT.filterBand;
      });
    }

    if (GT.filterMode != "Mixed")
    {
      list = list.filter(function (value)
      {
        if (
          GT.filterMode == "Phone" &&
          value.mode in GT.modes_phone &&
          GT.modes_phone[value.mode]
        ) { return true; }
        if (
          GT.filterMode == "Digital" &&
          value.mode in GT.modes &&
          GT.modes[value.mode]
        ) { return true; }
        return value.mode == GT.filterMode;
      });
    }

    if (GT.filterDxcc != 0)
    {
      list = list.filter(function (value)
      {
        return value.dxcc == GT.filterDxcc;
      });
    }

    if (GT.filterQSL != "All")
    {
      list = list.filter(function (value)
      {
        if (GT.filterQSL == "false" || GT.filterQSL == "true")
        {
          return value.confirmed == (GT.filterQSL == "true");
        }
        else
        {
          if (value.confirmed && GT.filterQSL in value.confSrcs)
          {
            return true;
          }
          return false;
        }
      });
    }

    if (typeof redraw == "undefined")
    {
      if (typeof nextPage == "undefined")
      {
        nextPage = 0;
        if (GT.lastSortIndex != mySort)
        {
          list = list.sort(GT.sortFunction[mySort]);
          GT.lastSortIndex = mySort;
          GT.lastSortType = 1;
          GT.qsoPage = 0;
        }
        else
        {
          list = list.sort(GT.sortFunction[mySort]).reverse();
          GT.lastSortIndex = -1;
          GT.lastSortType = 2;
          GT.qsoPage = 0;
        }
      }
      else
      {
        if (GT.lastSortType == 1)
        {
          list = list.sort(GT.sortFunction[mySort]);
        }
        else
        {
          list = list.sort(GT.sortFunction[mySort]).reverse();
        }
      }
    }
    else
    {
      mySort = GT.lastSortIndex;
      if (mySort == -1) mySort = 4;

      if (GT.lastSortType == 1)
      {
        list = list.sort(GT.sortFunction[mySort]);
      }
      else
      {
        list = list.sort(GT.sortFunction[mySort]).reverse();
      }
    }

    ObjectCount = list.length;

    GT.qsoPages = parseInt(ObjectCount / GT.settings.app.qsoItemsPerPage) + 1;

    GT.qsoPage += nextPage;
    GT.qsoPage %= GT.qsoPages;
    if (GT.qsoPage < 0) GT.qsoPage = GT.qsoPages - 1;

    let startIndex = GT.qsoPage * GT.settings.app.qsoItemsPerPage;
    let endIndex = startIndex + GT.settings.app.qsoItemsPerPage;
    if (endIndex > ObjectCount) endIndex = ObjectCount;

    let workHead = "<b> Entries (" + ObjectCount + ")</b>";

    if (GT.qsoPages > 1)
    {
      workHead += "<br><font  style='font-size:15px;' color='cyan' onClick='window.opener.showWorkedBox(" + mySort + ", -1);'>&#8678;&nbsp;</font>";
      workHead += " Page " + (GT.qsoPage + 1) + " of " + GT.qsoPages + " (" + (endIndex - startIndex) + ") ";
      workHead += "<font  style='font-size:16px;' color='cyan' onClick='window.opener.showWorkedBox(" + mySort + ", 1);'>&nbsp;&#8680;</font>";
    }
    setStatsDiv("workedHeadDiv", workHead);

    if (myObjects != null)
    {
      let worker = "";
      worker += "<table  id='logTable' style='white-space:nowrap;overflow:auto;overflow-x;hidden;' class='darkTable' align=center>";
      worker += "<tr><th><input type='text' id='searchWB' style='margin:0px'  oncontextmenu='contextMenu()' class='inputTextValue' value='" + GT.searchWB + "' size='8' oninput='window.opener.showWorkedSearchChanged(this);' / >";
      if (GT.searchWB.length > 0)
      {
        worker += "<img title='Clear Callsign' onclick='searchWB.value=\"\";window.opener.showWorkedSearchChanged(searchWB);' src='img/trash_24x48.png' style='width: 30px; margin:0px; padding:0px; margin-bottom: -4px; cursor: pointer;'/>";
      }
      worker += "</th>";
      worker += "<th><input type='text' id='searchGrid' style='margin:0px' oncontextmenu='contextMenu()' class='inputTextValue' value='" + GT.gridSearch + "' size='6' oninput='window.opener.showWorkedSearchGrid(this);' / >";
      if (GT.gridSearch.length > 0)
      {
        worker += "<img title='Clear Grid' onclick='searchGrid.value=\"\";window.opener.showWorkedSearchGrid(searchGrid);' src='img/trash_24x48.png' style='width: 30px; margin:0px; padding:0px; margin-bottom: -4px; cursor: pointer;'/>";
      }
      worker += "</th>";
      worker += "<th><div id='bandFilterDiv'></div></th>";
      worker += "<th><div id='modeFilterDiv'></div></th>";
      worker += "<th><div id='qslFilterDiv'></div></th>";
      worker += "<th></th>";
      worker += "<th></th>";
      if (GT.filterDxcc != 0)
      {
        worker += "<th style='border-right:none;'><div id='dxccFilterDiv'></div></th>";
        worker += "<th style='border-left:none;'><img title='Show All' onclick='window.opener.GT.filterDxcc = 0; window.opener.showWorkedBox();' src='img/trash_24x48.png' style='width: 30px; margin:0px; padding:0px; margin-bottom: -4px; cursor: pointer'/></th>";
      }
      else
      {
        worker += "<th colspan='1'><div id='dxccFilterDiv'></div><th>";
      }

      worker += "<th><input type='text' id='searchState' style='margin:0px'  oncontextmenu='contextMenu()' class='inputTextValue' value='" + GT.stateSearch + "' size='3' oninput='window.opener.showWorkedSearchState(this);' / >";
      if (GT.stateSearch.length > 0)
      {
        worker += "<img title='Clear Park' onclick='searchState.value=\"\";window.opener.showWorkedSearchState(searchState);' src='img/trash_24x48.png' style='width: 30px; margin:0px; padding:0px; margin-bottom: -4px; cursor: pointer;'/>";
      }
      worker += "</th>";""

      worker += "<th><input type='text' id='searchCnty' style='margin:0px'  oncontextmenu='contextMenu()' class='inputTextValue' value='" + GT.cntySearch + "' size='4' oninput='window.opener.showWorkedSearchCnty(this);' / >";
      if (GT.cntySearch.length > 0)
      {
        worker += "<img title='Clear County' onclick='searchCnty.value=\"\";window.opener.showWorkedSearchCnty(searchCnty);' src='img/trash_24x48.png' style='width: 30px; margin:0px; padding:0px; margin-bottom: -4px; cursor: pointer;'/>";
      }
      worker += "</th>";""

      if (GT.settings.app.potaFeatureEnabled) 
      {
        worker += "<th><input type='text' id='searchPOTA' style='margin:0px'  oncontextmenu='contextMenu()' class='inputTextValue' value='" + GT.potaSearch + "' size='4' oninput='window.opener.showWorkedSearchPOTA(this);' / >";
        if (GT.potaSearch.length > 0)
        {
          worker += "<img title='Clear Park' onclick='searchPOTA.value=\"\";window.opener.showWorkedSearchPOTA(searchPOTA);' src='img/trash_24x48.png' style='width: 30px; margin:0px; padding:0px; margin-bottom: -4px; cursor: pointer;'/>";
        }
        worker += "</th>";""
      }

      worker += "<th><label>" + I18N("gt.Zday") + "</label>&nbsp;<input type='checkbox' id='Zday' " + (GT.Zday ? "checked" : "") + " onclick='window.opener.changeZday(Zday)'/></th>";

      worker += "</tr> ";
      worker += "<tr><th style='cursor:pointer;' align=center onclick='window.opener.showWorkedBox(0);'>" + I18N("gt.qsoPage.Station") + "</th>";
      worker += "<th style='cursor:pointer;' align=center onclick='window.opener.showWorkedBox(1);'>" + I18N("gt.qsoPage.Grid") + "</th>";
      worker += "<th style='cursor:pointer;' align=center onclick='window.opener.showWorkedBox(5);'>" + I18N("gt.qsoPage.Band") + "</th>";
      worker += "<th style='cursor:pointer;' align=center onclick='window.opener.showWorkedBox(2);'>" + I18N("gt.qsoPage.Mode") + "</th>";
      worker += "<th style='cursor:pointer;' align=center onclick='window.opener.showWorkedBox(6);'>" + I18N("gt.qsoPage.QSL") + "</th>";
      worker += "<th align=center>" + I18N("gt.qsoPage.Sent") + "</th>";
      worker += "<th align=center>" + I18N("gt.qsoPage.Rcvd") + "</th>";
      worker += "<th style='cursor:pointer;' align=center onclick='window.opener.showWorkedBox(3);'>" + I18N("gt.qsoPage.DXCC") + "</th>";
      worker += "<th style='cursor:pointer;' align=center onclick='window.opener.showWorkedBox(3);'>" + I18N("gt.qsoPage.Flag") + "</th>";
      worker += "<th style='cursor:pointer;' align=center onclick='window.opener.showWorkedBox(8);'>" + I18N("roster.secondary.wanted.state") + "</th>";
      worker += "<th style='cursor:pointer;' align=center onclick='window.opener.showWorkedBox(9);'>" + I18N("roster.secondary.wanted.county") + "</th>";
      if (GT.settings.app.potaFeatureEnabled) worker += "<th style='cursor:pointer;' align=center onclick='window.opener.showWorkedBox(7);'>POTA</th>";
      worker += "<th style='cursor:pointer;' align=center onclick='window.opener.showWorkedBox(4);'>" + I18N("gt.qsoPage.When") + "</th>";

      if (GT.settings.callsignLookups.lotwUseEnable == true) worker += "<th>" + I18N("gt.qsoPage.LoTW") + "</th>";
      if (GT.settings.callsignLookups.eqslUseEnable == true) worker += "<th>" + I18N("gt.qsoPage.eQSL") + "</th>";
      if (GT.settings.callsignLookups.oqrsUseEnable == true) worker += "<th>" + I18N("gt.qsoPage.OQRS") + "</th>";
      worker += "</tr>";

      for (let i = startIndex; i < endIndex; i++)
      {
        let confTitle = "";
        let confTd = "";
        let key = list[i];
        if (key.confirmed)
        {
          let srcs = {};
          Object.keys(key.confSrcs).forEach(src => { srcs[GT.confSrcNames[src]] = true; });
          confTd = Object.keys(key.confSrcs).join("");
          confTitle = "title='" + Object.keys(srcs).join(", ") + "'";
        }
        worker += "<tr align=left><td style='color:#ff0;cursor:pointer' onclick='window.opener.startLookup(\"" + key.DEcall + "\",\"" + key.grid + "\");' >" + formatCallsign(key.DEcall) + "</td>";
        worker += "<td style='color:cyan;'>" + key.grid + (key.vucc_grids.length ? ", " + key.vucc_grids.join(", ") : "") + "</td>";
        worker += "<td style='color:lightgreen'>" + key.band + "</td>";
        worker += "<td style='color:lightblue'>" + key.mode + "</td>";
        worker += "<td align=left " + confTitle + ">" + confTd + "</td>";
        worker += "<td>" + key.RSTsent + "</td>";
        worker += "<td>" + key.RSTrecv + "</td>";
        worker += "<td style='color:orange'>" + GT.dxccToAltName[key.dxcc] + " <font color='lightgreen'>(" + (key.dxcc in GT.dxccInfo ? GT.dxccInfo[key.dxcc].pp : "?") + ")</font></td>";
        worker += "<td align=center style='margin:0;padding:0' ><img style='padding-top:4px' src='img/flags/16/" + (key.dxcc in GT.dxccInfo ? GT.dxccInfo[key.dxcc].flag : "_United Nations.png") + "'></td>";
        if (key.state)
        {
          let title = (key.state in GT.StateData) ? "title='" + GT.StateData[key.state].name + "'" : "";
          worker += "<td align=center style='color:lightgreen' " + title + ">" + key.state.substr(3) + "</td>";
        }
        else
        {
          worker += "<td></td>";
        }
        if (key.cnty && key.cnty in GT.countyData)
        {
          worker += "<td align=center style='color:cyran'>" + GT.countyData[key.cnty].geo.properties.n + "</td>";
        }
        else
        {
          worker += "<td></td>";
        }
        if (GT.settings.app.potaFeatureEnabled)
        {
          worker += key.pota ? "<td align=center style='color:#fbb6fc'>" + key.pota + "</td>" :  "<td></td>";
        }
        worker += "<td style='color:lightblue'>" + userTimeString(key.time * 1000) + "</td>";
        if (GT.settings.callsignLookups.lotwUseEnable == true)
        {
          worker += "<td align=center>" + (key.DEcall in GT.lotwCallsigns ? "&#10004;" : "") + "</td>";
        }
        if (GT.settings.callsignLookups.eqslUseEnable == true)
        {
          worker += "<td align=center>" + (key.DEcall in GT.eqslCallsigns ? "&#10004;" : "") + "</td>";
        }
        if (GT.settings.callsignLookups.oqrsUseEnable == true)
        {
          if (key.DEcall in GT.oqrsCallsigns)
          {
            if (key.confirmed == false)
            {
              worker +=
                "<td style='cursor:pointer;' align='left' " +
                "onClick='window.opener.openSite(\"https://clublog.org/logsearch/logsearch.php?log=" +
                key.DEcall + "&call=" + key.DXcall + "&SubmitLogSearch=Show+contacts\");'>" +
                "&#10004; &#128236;</td>";
            }
            else
            {
              worker += "<td>&#10004;</td>";
            }
          }
          else
          {
            worker += "<td></td>";
          }
        }
        worker += "</tr>";
      }

      worker += "</table>";

      setStatsDiv("workedListDiv", worker);

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
          let option = document.createElement("option");
          option.value = key;
          option.text = key;
          newSelect.appendChild(option);
        });
      statsAppendChild(
        "bandFilterDiv",
        newSelect,
        "filterBandFunction",
        GT.filterBand,
        true
      );

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
          let option = document.createElement("option");
          option.value = key;
          option.text = key;
          newSelect.appendChild(option);
        });

      statsAppendChild(
        "modeFilterDiv",
        newSelect,
        "filterModeFunction",
        GT.filterMode,
        true
      );

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
          let option = document.createElement("option");
          option.value = dxccs[key];
          option.text = key;
          newSelect.appendChild(option);
        });

      statsAppendChild(
        "dxccFilterDiv",
        newSelect,
        "filterDxccFunction",
        GT.filterDxcc,
        true
      );

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

      Object.keys(confSrcs)
        .forEach(function (key)
        {
          let option = document.createElement("option");
          option.value = key
          option.text = GT.confSrcNames[key];
          newSelect.appendChild(option);
        });

      statsAppendChild(
        "qslFilterDiv",
        newSelect,
        "filterQSLFunction",
        GT.filterQSL,
        true
      );

      statsFocus(GT.lastSearchSelection);

      setStatsDivHeight("workedListDiv", getStatsWindowHeight() - 6 + "px");
    }
    else setStatsDiv("workedListDiv", "None");

    myObjects = null;
  }
  catch (e)
  {
    console.error(e);
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
  if (GT.lookupWindowInitialized && typeof GT.lookupWindowHandle.window.validateCallByElement !== "undefined")
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
  showWorkedBox(null, 0);
}

function getBandSlots()
{
  let worker = "";
  let bands = (GT.myDXCC in GT.callsignDatabaseUSplus) ? GT.us_bands : GT.non_us_bands;
  let bandslots = {};
  let total = 0;
  bandslots.Mixed = 0;
  bandslots.Phone = 0;
  bandslots.Digital = 0;
  for (const band in bands)
  {
    bandslots[bands[band]] = 0;
  }
  for (const key in GT.dxccInfo)
  {
    if (GT.dxccInfo[key].geo != "deleted")
    {
      if (key + "|" in GT.tracker.confirmed.dxcc)
      {
        bandslots.Mixed++;
        if (key + "|dg" in GT.tracker.confirmed.dxcc)
        {
          bandslots.Digital++;
        }
        if (key + "|ph" in GT.tracker.confirmed.dxcc)
        {
          bandslots.Phone++;
        }
        for (const band in bands)
        {
          if (key + "|" + bands[band] in GT.tracker.confirmed.dxcc)
          {
            bandslots[bands[band]]++;
          }
        }
      }
    }
  }
  worker += "<table class='darkTable' align=center>";
  worker += "<tr><th colspan=" + (bands.length + 4) + ">Confirmed Band Slots</th></tr>";
  worker += "<tr>";
  worker += "<th>Mixed</th>";
  worker += "<th>Phone</th>";
  worker += "<th>Digital</th>";
  for (const band in bands)
  {
    worker += "<th><font color=" + GT.pskColors[bands[band]] + ">" + bands[band] + "</font></th>";
  }
  worker += "<th>Total</th></tr><tr>";
  worker += "<td>" + bandslots.Mixed + "</td>";
  worker += "<td>" + bandslots.Phone + "</td>";
  worker += "<td>" + bandslots.Digital + "</td>";
  for (const band in bands)
  {
    total += bandslots[bands[band]];
    worker += "<td>" + bandslots[bands[band]] + "</td>";
  }
  worker += "<td>" + total + "</td></tr></table><br>";

  return worker;
}

function keysThatContain(obj, text) {
  return Object.keys(obj).filter(key => key.includes(text)).length;
};

function getDXMarathon()
{
  let worker = "<h1>" +I18N("rosterColumns.Wanted.dxm") + " " + GT.currentYear + "</h1>";

  worker += "<table class='darkTable' align=center>";
  worker += "<tr><th><font color='orange'>";
  worker +=  I18N("gt.viewInfo.worldGeoData");
  worker += "</font></th><th><font color='cyan'>";
  worker +=  I18N("gt.viewInfo.cqZones");
  worker += "</font></th><th><font color='yellow'>Total</font></th></tr>";
  worker += "<td style='color:white;'>" + keysThatContain(GT.tracker.worked.dxm, "c" + GT.currentYear) + "</td>";
  worker += "<td style='color:white;'>" + keysThatContain(GT.tracker.worked.dxm, "z" + GT.currentYear) + "</td>";
  worker += "<td style='font-weight:bold;color:white;'>" + keysThatContain(GT.tracker.worked.dxm, GT.currentYear) + "</td></table>";

  return worker;
}

function showDXCCsBox()
{
  let worker = getBandSlots();
  let band = GT.settings.app.gtBandFilter == "auto" ? GT.settings.app.myBand : GT.settings.app.gtBandFilter.length == 0 ? "" : GT.settings.app.gtBandFilter;
  let mode = GT.settings.app.gtModeFilter == "auto" ? GT.settings.app.myMode : GT.settings.app.gtModeFilter.length == 0 ? "" : GT.settings.app.gtModeFilter;
  worker += getCurrentBandModeHTML();
  let confirmed = 0;
  let worked = 0;
  let needed = 0;
  let List = {};
  let ListConfirmed = {};
  let ListNotWorked = {};
  for (const key in GT.dxccInfo)
  {
    if (key != -1 && Number(GT.dxccInfo[key].dxcc) > 0)
    {
      if (GT.dxccInfo[key].worked == true)
      {
        let item = {};
        item.dxcc = GT.dxccInfo[key].dxcc;
        item.flag = GT.dxccInfo[key].flag;
        item.confirmed = GT.dxccInfo[key].confirmed;
        List[GT.dxccInfo[key].name] = item;
        worked++;
      }
      if (GT.dxccInfo[key].confirmed == true)
      {
        let item = {};
        item.dxcc = GT.dxccInfo[key].dxcc;
        item.flag = GT.dxccInfo[key].flag;
        item.confirmed = GT.dxccInfo[key].confirmed;
        ListConfirmed[GT.dxccInfo[key].name] = item;
        confirmed++;
      }
      if (GT.dxccInfo[key].worked == false && GT.dxccInfo[key].confirmed == false && GT.dxccInfo[key].pp != "" && GT.dxccInfo[key].geo != "deleted")
      {
        let item = {};
        item.dxcc = GT.dxccInfo[key].dxcc;
        item.flag = GT.dxccInfo[key].flag;
        item.confirmed = GT.dxccInfo[key].confirmed;
        ListNotWorked[GT.dxccInfo[key].name] = item;
        needed++;
      }
    }
  }

  if (worked > 0)
  {
    worker +=
      "<div  style='vertical-align:top;display:inline-block;margin-right:5px;overflow:auto;overflow-x:hidden;height:" +
      Math.min(Object.keys(List).length * 23, getStatsWindowHeight() - 70) +
      "px;'><table class='darkTable' align=center>" +
        "<tr><th colspan=5 style='font-weight:bold'>" +
        "" + I18N("gt.dxccBox.Worked") + " (" + worked + ")</th>" +
        "<tr><th align=left>" + I18N("gt.dxccBox.Name") + "</th>" +
        "<th>" + I18N("gt.dxccBox.Flag") + "</th>" +
        "<th align=left>" + I18N("gt.dxccBox.DXCC") + "</th></tr>";
    Object.keys(List)
      .sort()
      .forEach(function (key, i)
      {
        let rowStyle = List[key].confirmed ? "" : "background-clip:content-box;box-shadow: 0 0 8px 3px inset; cursor:pointer ";
        let rowAttributes = List[key].confirmed ? "" : "onclick='searchWorked(" + List[key].dxcc + ", \"" + band + "\", \"" + mode + "\");'";

        worker += "<tr><td align=left style='color:#ff0;" + rowStyle + "' " + rowAttributes + ">" + key + "</td>";
        worker += "<td align='center' style='margin:0;padding:0'><img style='padding-top:3px' src='img/flags/16/" + List[key].flag + "'></td>";
        worker += "<td align=left style='color:cyan;' >" + List[key].dxcc + "</td>";
      });
    worker += "</table></div>";
  }
  if (confirmed > 0)
  {
    worker +=
      "<div  style='padding:0px;vertical-align:top;display:inline-block;margin-right:5px;overflow:auto;overflow-x:hidden;height:" +
      Math.min(Object.keys(ListConfirmed).length * 23, getStatsWindowHeight() - 70) +
        "px;'><table class='darkTable' align=center>" +
        "<tr><th colspan=5 style='font-weight:bold'>" + I18N("gt.dxccBox.Confirmed") +
        " (" + confirmed + ")</th>" +
        "<tr><th align=left>" + I18N("gt.dxccBox.Name") + "</th>" +
        "<th>" + I18N("gt.dxccBox.Flag") + "</th>" +
        "<th align=left>" + I18N("gt.dxccBox.DXCC") + "</th></tr>";
    Object.keys(ListConfirmed)
      .sort()
      .forEach(function (key, i)
      {
        worker += "<tr><td align=left style='color:#ff0;' >" + key + "</td>";
        worker += "<td align='center' style='margin:0;padding:0'><img style='padding-top:3px' src='img/flags/16/" +
          ListConfirmed[key].flag + "'></td>";
        worker += "<td align=left style='color:cyan;' >" + ListConfirmed[key].dxcc + "</td>";
      });
    worker += "</table></div>";
  }
  if (needed > 0)
  {
    worker +=
      "<div  style='vertical-align:top;display:inline-block;overflow:auto;overflow-x:hidden;height:" +
      Math.min(Object.keys(ListNotWorked).length * 23, getStatsWindowHeight() - 70) +
        "px;'><table class='darkTable' align=center>" +
        "<tr><th colspan=3 style='font-weight:bold'>" + I18N("gt.dxccBox.Needed") +
        " (" + needed + ")</th>" +
        "<tr><th align=left>" + I18N("gt.dxccBox.Name") + "</th>" +
        "<th>" + I18N("gt.dxccBox.Flag") + "</th>" +
        "<th align=left>" + I18N("gt.dxccBox.DXCC") + "</th></tr>";
    Object.keys(ListNotWorked)
      .sort()
      .forEach(function (key, i)
      {
        worker += "<tr><td align=left style='color:#ff0;' >" + key + "</td>";
        worker += "<td align='center' style='margin:0;padding:0'><img style='padding-top:3px' src='img/flags/16/" + ListNotWorked[key].flag + "'></td>";
        worker += "<td align=left style='color:cyan;' >" + ListNotWorked[key].dxcc + "</td>";
      });
    worker += "</table></div>";
  }
  setStatsDiv("dxccListDiv", worker);
}

function showZonesBox()
{
  let worker = getCurrentBandModeHTML();

  worker += "<div style='vertical-align:top;display:inline-block;margin-right:8px;overflow:auto;overflow-x:hidden;color:cyan;'><b>" + I18N("gt.CQZoneBox.Worked") + "</b><br>";
  worker += displayItemList(GT.cqZones, "#FFA500");
  worker += "</div>";

  worker += "<div style='vertical-align:top;display:inline-block;margin-right:8px;overflow:auto;overflow-x:hidden;color:cyan;'><b>" + I18N("gt.ITUZoneBox.Worked") + "</b><br>";
  worker += displayItemList(GT.ituZones, "#00DDDD");
  worker += "</div>";

  worker += "<div style='vertical-align:top;display:inline-block;margin-right:8px;overflow:auto;overflow-x:hidden;color:cyan;'><b>" + I18N("gt.WASWACBox.WAC") + "</b><br>";
  worker += displayItemList(GT.wacZones, "#90EE90");
  worker += "</div>";

  setStatsDiv("zonesListDiv", worker);
}

function showWASPlusBox()
{
  let worker = getCurrentBandModeHTML();

  worker += "<div style='vertical-align:top;display:inline-block;margin-right:8px;overflow:auto;overflow-x:hidden;color:cyan;'><b>" + I18N("gt.WASWACBox.WAS") + "</b><br>";
  worker += displayItemList(GT.wasZones, "#00DDDD");
  worker += "</div>";

  worker += "<div style='vertical-align:top;display:inline-block;margin-right:8px;overflow:auto;overflow-x:hidden;color:cyan;'><b>" + I18N("gt.WASWACBox.WACP") + "</b><br>";
  worker += displayItemList(GT.wacpZones, "#FFA500");
  worker += "</div>";

  worker += "<div style='vertical-align:top;display:inline-block;margin-right:8px;overflow:auto;overflow-x:hidden;color:cyan;'><b>" + I18N("gt.viewInfo.us48Data") + "</b><br>";
  worker += displayItemList(GT.us48Data, "#DDDD00");
  worker += "</div>";

  setStatsDiv("wasPlusListDiv", worker);
}

function displayItemList(table, color)
{
  let worked = 0;
  let needed = 0;
  let confirmed = 0;
  for (let key in table)
  {
    if (table[key].worked == true)
    {
      worked++;
    }
    if (table[key].confirmed == true)
    {
      confirmed++;
    }
    if (table[key].confirmed == false && table[key].worked == false)
    {
      needed++;
    }
  }
  let worker =
    "<div style='color:white;vertical-align:top;display:inline-block;margin-right:8px;overflow:auto;overflow-x:hidden;height:" +
    Math.min(
      Object.keys(table).length * 23 + (23 + 45),
      getStatsWindowHeight() - 12
    ) +
    "px;'>";
  worker += "<table class='darkTable' align=center>";
  worker += "<tr><th style='font-weight:bold'>" + I18N("gt.displayItemsList.Worked") + " (" + worked + ")</th></tr>";
  worker += "<tr><th style='font-weight:bold'>" + I18N("gt.displayItemsList.Confirmed") + " (" + confirmed + ")</th></tr>";
  worker += "<tr><th style='font-weight:bold'>" + I18N("gt.displayItemsList.Needed") + " (" + needed + ")</th></tr>";
  worker += "<tr><th align=left>Name</th></tr>";

  confirmed = "";
  let bold = "text-shadow: 0px 0px 1px black;";
  let unconf = "background-clip:content-box;box-shadow: 0 0 8px 3px inset ";

  Object.keys(table)
    .sort()
    .forEach(function (key, i)
    {
      let style;
      let name;
      if (typeof table[key].name !== "undefined" && table[key].name != key)
      {
        name = key + " / " + table[key].name;
      }
      else
      {
        name = key;
      }
      if (table[key].confirmed == true)
      {
        style = "color:" + color + ";" + confirmed;
      }
      else if (table[key].worked == true)
      {
        style = "color:" + color + ";" + unconf;
      }
      else
      {
        // needed
        style = "color:#000000;background-color:" + color + ";" + bold;
      }
      worker += "<tr><td align=left style='" + style + "'>" + name + "</td></tr>";
    });
  worker += "</table></div>";
  return worker;
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

  for (let key in GT.tracker.worked.px)
  {
    if (typeof GT.tracker.worked.px[key] == "string" && key + modifier in GT.tracker.worked.px)
    {
      List[key] = key;
    }
  }

  for (let key in GT.tracker.confirmed.px)
  {
    if (typeof GT.tracker.confirmed.px[key] == "string" && key + modifier in GT.tracker.confirmed.px)
    {
      ListConfirmed[key] = key;
    }
  }

  worked = Object.keys(List).length;
  confirmed = Object.keys(ListConfirmed).length;

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
          formatCallsign(GT.QSOhash[GT.tracker.worked.px[key]].DEcall) +
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
          formatCallsign(GT.QSOhash[GT.tracker.confirmed.px[key]].DEcall) +
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
  displayAlerts();
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

function workObject(obj, count, band, mode, type, didConfirm)
{
  obj.worked++;
  obj.worked_bands[band] = ~~obj.worked_bands[band] + 1;
  obj.worked_modes[mode] = ~~obj.worked_modes[mode] + 1;

  if (!count)
  {
    obj.worked_types.Mixed = ~~obj.worked_modes.Mixed + 1;

    if (type) obj.worked_types[type] = ~~obj.worked_modes[type] + 1;
  }

  if (didConfirm)
  {
    obj.confirmed++;
    obj.confirmed_bands[band] = ~~obj.confirmed_bands[band] + 1;
    obj.confirmed_modes[mode] = ~~obj.confirmed_modes[mode] + 1;

    if (!count)
    {
      obj.confirmed_types.Mixed = ~~obj.confirmed_types.Mixed + 1;
      if (type) obj.confirmed_types[type] = ~~obj.confirmed_types[type] + 1;
    }
  }
  return obj;
}

function renderStatsBox()
{
  let worker = "";
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

    for (let i in GT.QSOhash)
    {
      let finalGrid = GT.QSOhash[i].grid;
      let didConfirm = GT.QSOhash[i].confirmed;
      let band = GT.QSOhash[i].band;
      let mode = GT.QSOhash[i].mode;
      let state = GT.QSOhash[i].state;
      let cont = GT.QSOhash[i].cont;
      let finalDxcc = GT.QSOhash[i].dxcc;
      let cnty = GT.QSOhash[i].cnty;
      let ituz = GT.QSOhash[i].ituz;
      let cqz = GT.QSOhash[i].cqz;
      let wpx = GT.QSOhash[i].px;
      let call = GT.QSOhash[i].DXcall;
      let who = GT.QSOhash[i].DEcall;
      let type = getTypeFromMode(mode);

      if (!(who in callData)) callData[who] = newStatObject();

      workObject(callData[who], false, band, mode, type, didConfirm);

      details.callsigns[call] = ~~details.callsigns[call] + 1;

      if (GT.QSOhash[i].time < details.oldest) { details.oldest = GT.QSOhash[i].time; }
      if (GT.QSOhash[i].time > details.newest) { details.newest = GT.QSOhash[i].time; }

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
        LL = squareToCenter(finalGrid);
        unit = parseInt(MyCircle.distance(GT.myLat, GT.myLon, LL.a, LL.o) * MyCircle.validateRadius(distanceUnit.value));

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

    let stats = {};
    let output = {};

    dxccInfo.order = 1;
    stats.DXCC = dxccInfo;
    stats.GRID = gridData;
    stats.CQ = cqZones;
    stats.ITU = ituZones;
    stats.WAC = wacZones;
    stats.WAS = wasZones;
    stats.WACP = wacpZones;
    stats.USC = countyData;
    stats.WPX = wpxData;
    stats.WRFA = callData;

    for (i in stats)
    {
      output[i] = newStatCountObject();

      for (let key in stats[i])
      {
        if (stats[i][key].worked)
        {
          output[i].worked++;
          if (stats[i][key].worked > output[i].worked_high)
          {
            output[i].worked_high = stats[i][key].worked;
            output[i].worked_high_key = key;
          }
        }
        if (stats[i][key].confirmed)
        {
          output[i].confirmed++;
          if (stats[i][key].confirmed > output[i].confirmed_high)
          {
            output[i].confirmed_high = stats[i][key].confirmed;
            output[i].confirmed_high_key = key;
          }
        }

        for (let band in stats[i][key].worked_bands)
        {
          output[i].worked_bands[band] = ~~output[i].worked_bands[band] + 1;
        }

        for (let band in stats[i][key].confirmed_bands)
        {
          output[i].confirmed_bands[band] = ~~output[i].confirmed_bands[band] + 1;
        }

        for (let mode in stats[i][key].worked_modes)
        {
          output[i].worked_modes[mode] = ~~output[i].worked_modes[mode] + 1;
        }

        for (let mode in stats[i][key].confirmed_modes)
        {
          output[i].confirmed_modes[mode] = ~~output[i].confirmed_modes[mode] + 1;
        }

        for (let type in stats[i][key].worked_types)
        {
          output[i].worked_types[type] = ~~output[i].worked_types[type] + 1;
        }

        for (let type in stats[i][key].confirmed_types)
        {
          output[i].confirmed_types[type] = ~~output[i].confirmed_types[type] + 1;
        }
      }

      stats[i] = null;
    }

    scoreSection = "Modes";

    output.MIXED = modet.Mixed;
    output.DIGITAL = modet.Digital;
    output.PHONE = modet.Phone;
    output.CW = modet.CW;
    output.Other = modet.Other;

    for (let i in output)
    {
      output[i].worked_band_count = Object.keys(output[i].worked_bands).length;
      output[i].confirmed_band_count = Object.keys(
        output[i].confirmed_bands
      ).length;
      output[i].worked_mode_count = Object.keys(output[i].worked_modes).length;
      output[i].confirmed_mode_count = Object.keys(
        output[i].confirmed_modes
      ).length;
      output[i].worked_type_count = Object.keys(output[i].worked_types).length;
      output[i].confirmed_type_count = Object.keys(
        output[i].confirmed_types
      ).length;
    }

    let TypeNames = {
      0: ["MIXED", I18N("gt.typeNames.Mixed"), ""],
      1: ["DIGITAL", I18N("gt.typeNames.Digital"), ""],
      2: ["PHONE", I18N("gt.typeNames.Phone"), ""],
      3: ["CW", I18N("gt.typeNames.CW"), ""],
      4: ["Other", I18N("gt.typeNames.Other"), ""]
    };

    let AwardNames = {
      0: ["WRFA", I18N("gt.awardNames.WRFA"), "WRFA", "yellow"],
      1: ["GRID", I18N("gt.awardNames.Grid"), "GSA", "cyan"],
      2: ["DXCC", I18N("gt.awardNames.DXCC"), "DXWA", "orange"],
      3: ["CQ", I18N("gt.awardNames.CQ"), "WAZ", "lightgreen"],
      4: ["ITU", I18N("gt.awardNames.ITU"), "ITUz", "#DD44DD"],
      5: ["WAC", I18N("gt.awardNames.WAC"), "WAC", "cyan"],
      6: ["WAS", I18N("gt.awardNames.WAS"), "WAS", "lightblue"],
      7: ["USC", I18N("gt.awardNames.USC"), "USA-CA", "orange"],
      8: ["WPX", I18N("gt.awardNames.WPX"), "WPX", "yellow"],
      9: ["WACP", "CA Provinces", "WACP", "lightblue"]
    };

    worker = "<font color='cyan'>";

    worker += "<h1>" + I18N("gt.logbook.title") + "</h1>";

    worker += "<table style='display:inline-table;margin:5px;' class='darkTable'>";

    let ws = "";
    if (Object.keys(details.callsigns).length > 1) ws = "s";
    worker +=
      "<tr><td>Callsign" +
      ws +
      "</td><td style='color:yellow' ><b>" +
      Object.keys(details.callsigns).sort().join(", ") +
      "</b></td></tr>";
    worker +=
      "<tr><td>" + I18N("gt.logbook.firstContact") + "</td><td style='color:white' >" +
      userTimeString(details.oldest * 1000) +
      "</td></tr>";
    worker +=
      "<tr><td>" + I18N("gt.logbook.lastContact") + "</td><td style='color:white' >" +
      userTimeString(details.newest * 1000) +
      "</td></tr>";
    worker += "</table>";
    worker += "<br>";
    worker += "<h1>" + I18N("gt.logbook.scoreCard") + "</h1>";
    worker += "<table style='display:inline-table;margin:5px;' class='darkTable'>";
    worker += "<tr><th>" + I18N("gt.logbook.topScore") + "</th>" + "<th style='color:yellow'>" + I18N("gt.logbook.worked") + "</th>" + "<th style='color:lightgreen'>" + I18N("gt.logbook.confirmed") + "</th></tr>";

    for (let key in AwardNames)
    {
      scoreSection = "Award " + AwardNames[key][1];
      let infoObject = output[AwardNames[key][0]];
      worker += "<tr><td style='color:white'>" + AwardNames[key][1] + "</td>";
      worker +=
        "<td style='color:" +
        AwardNames[key][3] +
        "'>" +
        infoObject.worked_high_key +
        "<font color='white'> (" +
        infoObject.worked_high +
        ")</font></td>";

      if (infoObject.confirmed_high_key)
      {
        worker +=
          "<td style='color:" +
          AwardNames[key][3] +
          "'>" +
          infoObject.confirmed_high_key +
          "<font color='white'> (" +
          infoObject.confirmed_high +
          ")</font></td>";
      }
      else worker += "<td></td>";

      worker += "</tr>";
    }

    scoreSection = "Long Distance";

    worker += "<tr><td style='color:white'>" + I18N("gt.score.LongDist") + "</td>";
    worker +=
      "<td style='color:lightgreen'>" +
      long_distance.worked_unit +
      " " +
      distanceUnit.value.toLowerCase();
    if (long_distance.worked_hash && long_distance.worked_hash.length > 0 && long_distance.worked_hash in GT.QSOhash)
    {
      worker +=
        "<font style='color:yellow' > " +
        GT.QSOhash[long_distance.worked_hash].DEcall +
        "</font>";
      worker +=
        "<font style='color:orange' > " +
        GT.QSOhash[long_distance.worked_hash].grid +
        "</font>";
    }
    worker += "</td>";

    if (long_distance.confirmed_hash && long_distance.confirmed_hash.length > 0 && long_distance.confirmed_unit > 0 && long_distance.confirmed_hash in GT.QSOhash)
    {
      worker +=
        "<td style='color:lightgreen'>" +
        long_distance.confirmed_unit +
        " " +
        distanceUnit.value.toLowerCase();
      worker +=
        "<font style='color:yellow' > " +
        GT.QSOhash[long_distance.confirmed_hash].DEcall +
        "</font>";
      worker +=
        "<font style='color:orange' > " +
        GT.QSOhash[long_distance.confirmed_hash].grid +
        "</font></td>";
    }
    else worker += "<td></td>";

    scoreSection = "Short Distance";

    worker += "<tr><td style='color:white' >" + I18N("gt.score.ShortDist") + "</td>";
    worker +=
      "<td style='color:lightblue'>" +
      short_distance.worked_unit +
      " " +
      distanceUnit.value.toLowerCase();
    if (short_distance.worked_hash && short_distance.worked_hash.length > 0 && short_distance.worked_hash in GT.QSOhash)
    {
      worker +=
        "<font style='color:yellow' > " +
        GT.QSOhash[short_distance.worked_hash].DEcall +
        "</font>";
      worker +=
        "<font style='color:orange' > " +
        GT.QSOhash[short_distance.worked_hash].grid +
        "</font>";
    }
    worker += "</td>";

    if (short_distance.confirmed_hash && short_distance.confirmed_hash.length > 0 && short_distance.confirmed_unit > 0 && short_distance.confirmed_hash in GT.QSOhash)
    {
      worker +=
        "<td style='color:lightblue'>" +
        short_distance.confirmed_unit +
        " " +
        distanceUnit.value.toLowerCase();
      worker +=
        "<font style='color:yellow' > " +
        GT.QSOhash[short_distance.confirmed_hash].DEcall +
        "</font>";
      worker +=
        "<font style='color:orange' > " +
        GT.QSOhash[short_distance.confirmed_hash].grid +
        "</font></td>";
    }
    else worker += "<td></td>";

    worker += "</tr>";
    worker += "</table>";
    worker += "<br>";

    scoreSection = "DX Marathon";

    worker += getDXMarathon();

    worker += "<h1>" + I18N("gt.AwardTypes") + "</h1>";

    scoreSection = "Award Types";
    for (let key in AwardNames)
    {
      worker += createStatTable(
        AwardNames[key][1],
        output[AwardNames[key][0]],
        AwardNames[key][2]
      );
    }

    worker += "<br>";

    scoreSection = "Mode Types";

    worker += "<h1>" + I18N("gt.ModeTypes") + "</h1>";
    for (let key in TypeNames)
    {
      worker += createStatTable(
        TypeNames[key][1],
        output[TypeNames[key][0]],
        TypeNames[key][2]
      );
    }

    worker += "<br>";

    worker += "<h1>" + I18N("gt.Distances") + "</h1>";
    scoreSection = "Distances";
    worker += createDistanceTable(long_distance, I18N("gt.LongestDist"));
    worker += createDistanceTable(short_distance, I18N("gt.ShortestDist"));
    worker += "<br>";
  }
  catch (e)
  {
    worker +=
      "<br> In Section: " +
      scoreSection +
      "<br>" + I18N("gt.scorecardError");
  }

  setStatsDiv("statViewDiv", worker);
  setStatsDivHeight("statViewDiv", getStatsWindowHeight() + 29 + "px");
}

function createDistanceTable(obj, name)
{
  let worker =
    "<table style='display:inline-table;margin:5px;' class='darkTable'>";
  worker +=
    "<tr><th colspan = 3 align=left style='font-size:15px;color:cyan;'>" +
    name +
    "</th></tr>";
  worker +=
    "<tr><td></td><td><font  color='yellow'>" + I18N("gt.distanceTable.Worked") +
      "</font></td><td colspan=2 ><font color='lightgreen'>" + I18N("gt.distanceTable.Confirmed") + "</font></td></tr>";
  worker += "<tr><td align=center><font color='lightgreen'>" + I18N("gt.distanceTable.Bands") + "</font></td>";
  worker += "<td align=left><table class='subtable'>";
  let keys = Object.keys(obj.band).sort(numberSort);
  for (let key in keys)
  {
    let bandEntry = obj.band[keys[key]];
    if (bandEntry.worked_hash && bandEntry.worked_hash.length > 0 && bandEntry.worked_hash in GT.QSOhash)
    {
      let grid = GT.QSOhash[bandEntry.worked_hash].grid;
      let call = GT.QSOhash[bandEntry.worked_hash].DEcall;
      worker +=
        "<tr><td align=right>" +
        keys[key] +
        "</td><td style='color:lightgreen' align=left>(" +
        bandEntry.worked_unit +
        " " +
        distanceUnit.value.toLowerCase() +
        ")</td>";
      worker +=
        "<td style='color:yellow;cursor:pointer' align=left onclick='window.opener.startLookup(\"" +
        call +
        "\",\"" +
        grid +
        "\");' >" +
        call +
        "</td>";
      worker += "<td style='color:orange' align=left>" + grid + "</td>";
      worker += "</tr>";
    }
  }
  worker += "</table></td>";
  worker += "<td align=left><table class='subtable'>";
  for (let key in keys)
  {
    if (keys[key] in obj.band && obj.band[keys[key]].confirmed_hash && obj.band[keys[key]].confirmed_hash.length > 0 && obj.band[keys[key]].confirmed_hash in GT.QSOhash)
    {
      let grid = GT.QSOhash[obj.band[keys[key]].confirmed_hash].grid;
      let call = GT.QSOhash[obj.band[keys[key]].confirmed_hash].DEcall;
      worker +=
        "<tr><td align=right>" +
        keys[key] +
        "</td><td style='color:lightgreen' align=left>(" +
        obj.band[keys[key]].confirmed_unit +
        " " +
        distanceUnit.value.toLowerCase() +
        ")</td>";
      worker +=
        "<td style='color:yellow;cursor:pointer' align=left onclick='window.opener.startLookup(\"" +
        call +
        "\",\"" +
        grid +
        "\");'>" +
        call +
        "</td>";
      worker += "<td style='color:orange' align=left>" + grid + "</td>";
      worker += "</tr>";
    }
    else worker += "<tr><td>&nbsp;</td></tr>";
  }

  worker += "</table></td>";
  worker += "</tr>";
  worker += "<tr><td align=center><font color='orange'>" + I18N("gt.distanceTable.Modes") + "</font></td>";
  worker += "<td align=left><table class='subtable'>";
  keys = Object.keys(obj.mode).sort();
  for (let key in keys)
  {
    let modeEntry = obj.mode[keys[key]];
    if (modeEntry.worked_hash && modeEntry.worked_hash.length > 0 && modeEntry.worked_hash in GT.QSOhash)
    {
      let grid = GT.QSOhash[modeEntry.worked_hash].grid;
      let call = GT.QSOhash[modeEntry.worked_hash].DEcall;
      worker +=
        "<tr><td align=right>" +
        keys[key] +
        "</td><td style='color:lightgreen' align=left>(" +
        modeEntry.worked_unit +
        " " +
        distanceUnit.value.toLowerCase() +
        ")</td>";
      worker +=
        "<td style='color:yellow;cursor:pointer' align=left  onclick='window.opener.startLookup(\"" +
        call +
        "\",\"" +
        grid +
        "\");' >" +
        call +
        "</td>";
      worker += "<td style='color:orange' align=left>" + grid + "</td>";
      worker += "</tr>";
    }
  }
  worker += "</table></td>";
  worker += "<td align=left><table class='subtable'>";
  for (let key in keys)
  {
    if (keys[key] in obj.mode && obj.mode[keys[key]].confirmed_hash && obj.mode[keys[key]].confirmed_hash.length > 0 && obj.mode[keys[key]].confirmed_hash in GT.QSOhash)
    {
      let grid = GT.QSOhash[obj.mode[keys[key]].confirmed_hash].grid;
      let call = GT.QSOhash[obj.mode[keys[key]].confirmed_hash].DEcall;
      worker +=
        "<tr><td align=right>" +
        keys[key] +
        "</td><td style='color:lightgreen' align=left>(" +
        obj.mode[keys[key]].confirmed_unit +
        " " +
        distanceUnit.value.toLowerCase() +
        ")</td>";
      worker +=
        "<td style='color:yellow;cursor:pointer' align=left onclick='window.opener.startLookup(\"" +
        call +
        "\",\"" +
        grid +
        "\");' >" +
        call +
        "</td>";
      worker += "<td style='color:orange' align=left>" + grid + "</td>";
      worker += "</tr>";
    }
    else worker += "<tr><td>&nbsp;</td></tr>";
  }
  worker += "</table></td>";
  worker += "</tr>";
  worker += "<tr><td align=center><font color='#DD44DD'>" + I18N("gt.distanceTable.Types") + "</font></td>";
  worker += "<td align=left><table class='subtable'>";
  keys = Object.keys(obj.type).sort();
  for (let key in keys)
  {
    let typeEntry = obj.type[keys[key]];
    if (typeEntry.worked_hash && typeEntry.worked_hash.length > 0 && typeEntry.worked_hash in GT.QSOhash)
    {
      let grid = GT.QSOhash[typeEntry.worked_hash].grid;
      let call = GT.QSOhash[typeEntry.worked_hash].DEcall;
      worker +=
        "<tr><td align=right>" +
        keys[key] +
        "</td><td style='color:lightgreen' align=left>(" +
        typeEntry.worked_unit +
        " " +
        distanceUnit.value.toLowerCase() +
        ")</td>";
      worker +=
        "<td style='color:yellow;cursor:pointer' align=left onclick='window.opener.startLookup(\"" +
        call +
        "\",\"" +
        grid +
        "\");' >" +
        call +
        "</td>";
      worker += "<td style='color:orange' align=left>" + grid + "</td>";
      worker += "</tr>";
    }
  }
  worker += "</table></td>";
  worker += "<td align=left><table class='subtable'>";
  for (let key in keys)
  {
    if (keys[key] in obj.type && obj.type[keys[key]].confirmed_hash && obj.type[keys[key]].confirmed_hash.length > 0 && obj.type[keys[key]].confirmed_hash in GT.QSOhash)
    {
      let grid = GT.QSOhash[obj.type[keys[key]].confirmed_hash].grid;
      let call = GT.QSOhash[obj.type[keys[key]].confirmed_hash].DEcall;
      worker +=
        "<tr><td align=right>" +
        keys[key] +
        "</td><td style='color:lightgreen' align=left>(" +
        obj.type[keys[key]].confirmed_unit +
        " " +
        distanceUnit.value.toLowerCase() +
        ")</td>";
      worker +=
        "<td style='color:yellow;cursor:pointer' align=left onclick='window.opener.startLookup(\"" +
        call +
        "\",\"" +
        grid +
        "\");' >" +
        call +
        "</td>";
      worker += "<td style='color:orange' align=left>" + grid + "</td>";
      worker += "</tr>";
    }
    else worker += "<tr><td>&nbsp;</td></tr>";
  }
  worker += "</table></td>";
  worker += "</tr>";
  worker += "</table>";
  return worker;
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
  let wc1Table = "";

  if (infoObject.worked)
  {
    wc1Table =
      "<table style='display:inline-table;margin:5px;' class='darkTable'>";
    wc1Table +=
      "<tr><th colspan = 3 align=left style='font-size:15px;color:cyan;'>" +
      title +
      "</th></tr>";
    let award = "<th></th>";

    wc1Table +=
      "<tr>" +
      award +
      "<td><font  color='yellow'>" + I18N("gt.statTable.Worked") + "</font> <font color='white'>(" +
      infoObject.worked +
      ")</font></td><td colspan=2 ><font  color='lightgreen'>" + I18N("gt.statTable.Confirmed") + "</font> <font color='white'>(" +
      infoObject.confirmed +
      ")</font></td></tr>";

    wc1Table +=
      "<tr><td align=center><font color='lightgreen'>" + I18N("gt.statTable.Bands") + "</font></td>";

    wc1Table += "<td align=left><table class='subtable'>";
    let keys = Object.keys(infoObject.worked_bands).sort(numberSort);
    for (let key in keys)
    {
      wc1Table +=
        "<tr><td align=right>" +
        keys[key] +
        "</td><td align=left> <font color='white'>(" +
        infoObject.worked_bands[keys[key]] +
        ")</font></td></tr>";
    }

    wc1Table += "</table></td>";
    wc1Table += "<td align=left><table class='subtable'>";

    for (let key in keys)
    {
      if (keys[key] in infoObject.confirmed_bands)
      {
        wc1Table +=
          "<tr><td align=right>" +
          keys[key] +
          "</td><td align=left> <font color='white'>(" +
          infoObject.confirmed_bands[keys[key]] +
          ")</font></td></tr>";
      }
      else wc1Table += "<tr><td>&nbsp;</td></tr>";
    }
    wc1Table += "</table></td>";
    wc1Table += "</tr>";

    wc1Table += "<tr>";
    wc1Table += "<td align=center><font color='orange'>" + I18N("gt.statTable.Modes") + "</font></td>";
    wc1Table += "<td align=left><table class='subtable'>";
    keys = Object.keys(infoObject.worked_modes).sort();
    for (let key in keys)
    {
      wc1Table +=
        "<tr><td align=right>" +
        keys[key] +
        "</td><td align=left> <font color='white'>(" +
        infoObject.worked_modes[keys[key]] +
        ")</font></td></tr>";
    }

    wc1Table += "</table></td>";

    wc1Table += "<td align=left><table class='subtable'>";

    for (let key in keys)
    {
      if (keys[key] in infoObject.confirmed_modes)
      {
        wc1Table +=
          "<tr><td align=right>" +
          keys[key] +
          "</td><td align=left> <font color='white'>(" +
          infoObject.confirmed_modes[keys[key]] +
          ")</font></td></tr>";
      }
      else wc1Table += "<tr><td>&nbsp;</td></tr>";
    }

    wc1Table += "</table></td>";
    wc1Table += "</tr>";

    if (infoObject.worked_type_count > 0)
    {
      wc1Table += "<tr>";
      wc1Table += "<td align=center><font color='#DD44DD'>" + I18N("gt.statTable.Types") + "</font></td>";
      wc1Table += "<td align=left><table class='subtable'>";
      let keys = Object.keys(infoObject.worked_types).sort();
      for (let key in keys)
      {
        wc1Table +=
          "<tr><td align=right>" +
          keys[key] +
          "</td><td align=left> <font color='white'>(" +
          infoObject.worked_types[keys[key]] +
          ") " +
          "</font></td></tr>";
      }

      wc1Table += "</table></td>";

      wc1Table += "<td align=left><table class='subtable'>";

      for (let key in keys)
      {
        if (keys[key] in infoObject.confirmed_types)
        {
          wc1Table +=
            "<tr><td align=right>" +
            keys[key] +
            "</td><td align=left> <font color='white'>(" +
            infoObject.confirmed_types[keys[key]] +
            ") " +
            "</font></td></tr>";
        }
        else wc1Table += "<tr><td>&nbsp;</td></tr>";
      }

      wc1Table += "</table></td>";
      wc1Table += "</tr>";
    }

    wc1Table += "</table>";
  }

  return wc1Table;
}

function validatePropMode(propMode)
{
  if (GT.settings.app.gtPropFilter == "mixed") return true;

  return GT.settings.app.gtPropFilter == propMode;
}

function validateMapBandAndMode(band, mode)
{
  if ((GT.settings.app.gtBandFilter.length == 0 || (GT.settings.app.gtBandFilter == "auto" ? GT.settings.app.myBand == band : GT.settings.app.gtBandFilter == band)))
  {
    if (GT.settings.app.gtModeFilter.length == 0) return true;

    if (GT.settings.app.gtModeFilter == "auto") return GT.settings.app.myMode == mode;

    if (GT.settings.app.gtModeFilter == "Digital")
    {
      if (mode in GT.modes && GT.modes[mode]) return true;
      return false;
    }
    if (GT.settings.app.gtModeFilter == "Phone")
    {
      if (mode in GT.modes_phone && GT.modes_phone[mode]) return true;
      return false;
    }

    if (GT.settings.app.gtModeFilter == "CW" && mode == "CW") return true;

    return GT.settings.app.gtModeFilter == mode;
  }
  else
  {
    return false;
  }
}

function redrawLiveGrids(honorAge = true)
{
  for (let i in GT.liveCallsigns)
  {
    if (GT.settings.app.gridViewMode != 2 && validateMapBandAndMode(GT.liveCallsigns[i].band, GT.liveCallsigns[i].mode) && (honorAge == false || (honorAge == true && GT.timeNow - GT.liveCallsigns[i].age <= gridDecay.value)))
    {
      qthToBox(GT.liveCallsigns[i].grid, GT.liveCallsigns[i].DEcall, false, false, GT.liveCallsigns[i].DXcall, GT.liveCallsigns[i].band, GT.liveCallsigns[i].wspr, i, false);
    }
  }
  if (honorAge == false)
  {
    for (let i in GT.liveGrids)
    {
      GT.liveGrids[i].age = GT.timeNow;
    }
  }
  else
  {
    dimGridsquare();
  }
}

function redrawGrids()
{
  if (GT.settings.app.gridViewMode == 2) removePaths();
  clearGrids();
  clearQsoGrids();

  GT.QSLcount = 0;
  GT.QSOcount = 0;

  for (let i in GT.QSOhash)
  {
    let finalGrid = GT.QSOhash[i].grid;
    let worked = GT.QSOhash[i].worked;
    let didConfirm = GT.QSOhash[i].confirmed;
    let band = GT.QSOhash[i].band;
    let mode = GT.QSOhash[i].mode;
    GT.QSOcount++;
    if (didConfirm) GT.QSLcount++;

    if (validateMapBandAndMode(GT.QSOhash[i].band, GT.QSOhash[i].mode) && validatePropMode(GT.QSOhash[i].propMode))
    {
      if (GT.settings.app.gridViewMode > 1)
      {
        if (finalGrid.length > 0)
        {
          qthToQsoBox(
            GT.QSOhash[i].grid,
            i,
            false,
            GT.QSOhash[i].DXcall,
            GT.QSOhash[i].worked,
            GT.QSOhash[i].confirmed,
            GT.QSOhash[i].band
          );
        }
        for (let vucc in GT.QSOhash[i].vucc_grids)
        {
          qthToQsoBox(
            GT.QSOhash[i].vucc_grids[vucc],
            i,
            false,
            GT.QSOhash[i].DXcall,
            GT.QSOhash[i].worked,
            GT.QSOhash[i].confirmed,
            GT.QSOhash[i].band
          );
        }
      }

      let state = GT.QSOhash[i].state;
      let cont = GT.QSOhash[i].cont;
      let finalDxcc = GT.QSOhash[i].dxcc;
      let cnty = GT.QSOhash[i].cnty;
      let ituz = GT.QSOhash[i].ituz;
      let cqz = GT.QSOhash[i].cqz;

      if (state != null && isKnownCallsignDXCC(finalDxcc))
      {
        if (state in GT.StateData)
        {
          let name = state;
          if (name in GT.wasZones)
          {
            GT.wasZones[name].worked ||= worked;
            if (worked)
            {
              GT.wasZones[name].worked_bands[band] = ~~GT.wasZones[name].worked_bands[band] + 1;
              GT.wasZones[name].worked_modes[mode] = ~~GT.wasZones[name].worked_modes[mode] + 1;
            }

            GT.wasZones[name].confirmed ||= didConfirm;
            if (didConfirm)
            {
              GT.wasZones[name].confirmed_bands[band] = ~~GT.wasZones[name].confirmed_bands[band] + 1;
              GT.wasZones[name].confirmed_modes[mode] = ~~GT.wasZones[name].confirmed_modes[mode] + 1;
            }
          }
          else if (name in GT.wacpZones)
          {
            GT.wacpZones[name].worked ||= worked;
            if (worked)
            {
              GT.wacpZones[name].worked_bands[band] = ~~GT.wacpZones[name].worked_bands[band] + 1;
              GT.wacpZones[name].worked_modes[mode] = ~~GT.wacpZones[name].worked_modes[mode] + 1;
            }

            GT.wacpZones[name].confirmed ||= didConfirm;
            if (didConfirm)
            {
              GT.wacpZones[name].confirmed_bands[band] = ~~GT.wacpZones[name].confirmed_bands[band] + 1;
              GT.wacpZones[name].confirmed_modes[mode] = ~~GT.wacpZones[name].confirmed_modes[mode] + 1;
            }
          }
        }
      }

      if (cnty != null)
      {
        if (cnty in GT.cntyToCounty)
        {
          GT.countyData[cnty].worked ||= worked;
          if (worked)
          {
            GT.countyData[cnty].worked_bands[band] = ~~GT.countyData[cnty].worked_bands[band] + 1;
            GT.countyData[cnty].worked_modes[mode] = ~~GT.countyData[cnty].worked_modes[mode] + 1;
          }

          GT.countyData[cnty].confirmed ||= didConfirm;
          if (didConfirm)
          {
            GT.countyData[cnty].confirmed_bands[band] = ~~GT.countyData[cnty].confirmed_bands[band] + 1;
            GT.countyData[cnty].confirmed_modes[mode] = ~~GT.countyData[cnty].confirmed_modes[mode] + 1;
          }
        }
      }
      if (cont != null)
      {
        if (cont in GT.shapeData)
        {
          let name = GT.shapeData[cont].properties.name;

          if (name in GT.wacZones)
          {
            GT.wacZones[name].worked ||= worked;
            if (worked)
            {
              GT.wacZones[name].worked_bands[band] = ~~GT.wacZones[name].worked_bands[band] + 1;
              GT.wacZones[name].worked_modes[mode] = ~~GT.wacZones[name].worked_modes[mode] + 1;
            }

            GT.wacZones[name].confirmed ||= didConfirm;
            if (didConfirm)
            {
              GT.wacZones[name].confirmed_bands[band] = ~~GT.wacZones[name].confirmed_bands[band] + 1;
              GT.wacZones[name].confirmed_modes[mode] = ~~GT.wacZones[name].confirmed_modes[mode] + 1;
            }
          }
        }
      }

      GT.dxccInfo[finalDxcc].worked ||= worked;
      if (worked)
      {
        GT.dxccInfo[finalDxcc].worked_bands[band] = ~~GT.dxccInfo[finalDxcc].worked_bands[band] + 1;
        GT.dxccInfo[finalDxcc].worked_modes[mode] = ~~GT.dxccInfo[finalDxcc].worked_modes[mode] + 1;
      }

      GT.dxccInfo[finalDxcc].confirmed ||= didConfirm;
      if (didConfirm)
      {
        GT.dxccInfo[finalDxcc].confirmed_bands[band] = ~~GT.dxccInfo[finalDxcc].confirmed_bands[band] + 1;
        GT.dxccInfo[finalDxcc].confirmed_modes[mode] = ~~GT.dxccInfo[finalDxcc].confirmed_modes[mode] + 1;
      }

      if (cqz && cqz.length > 0)
      {
        GT.cqZones[cqz].worked ||= worked;
        if (worked)
        {
          GT.cqZones[cqz].worked_bands[band] = ~~GT.cqZones[cqz].worked_bands[band] + 1;
          GT.cqZones[cqz].worked_modes[mode] = ~~GT.cqZones[cqz].worked_modes[mode] + 1;
        }

        GT.cqZones[cqz].confirmed ||= didConfirm;
        if (didConfirm)
        {
          GT.cqZones[cqz].confirmed_bands[band] = ~~GT.cqZones[cqz].confirmed_bands[band] + 1;
          GT.cqZones[cqz].confirmed_modes[mode] = ~~GT.cqZones[cqz].confirmed_modes[mode] + 1;
        }
      }

      if (ituz && ituz.length > 0)
      {
        GT.ituZones[ituz].worked ||= worked;
        if (worked)
        {
          GT.ituZones[ituz].worked_bands[band] = ~~GT.ituZones[ituz].worked_bands[band] + 1;
          GT.ituZones[ituz].worked_modes[mode] = ~~GT.ituZones[ituz].worked_modes[mode] + 1;
        }

        GT.ituZones[ituz].confirmed ||= didConfirm;
        if (didConfirm)
        {
          GT.ituZones[ituz].confirmed_bands[band] = ~~GT.ituZones[ituz].confirmed_bands[band] + 1;
          GT.ituZones[ituz].confirmed_modes[mode] = ~~GT.ituZones[ituz].confirmed_modes[mode] + 1;
        }
      }

      if (finalGrid.length > 0)
      {
        let gridCheck = finalGrid.substr(0, 4);

        if (gridCheck in GT.us48Data)
        {
          GT.us48Data[gridCheck].worked ||= worked;

          if (worked)
          {
            GT.us48Data[gridCheck].worked_bands[band] = ~~GT.us48Data[gridCheck].worked_bands[band] + 1;
            GT.us48Data[gridCheck].worked_modes[mode] = ~~GT.us48Data[gridCheck].worked_modes[mode] + 1;
          }

          GT.us48Data[gridCheck].confirmed ||= didConfirm;

          if (didConfirm)
          {
            GT.us48Data[gridCheck].confirmed_bands[band] = ~~GT.us48Data[gridCheck].confirmed_bands[band] + 1;
            GT.us48Data[gridCheck].confirmed_modes[mode] = ~~GT.us48Data[gridCheck].confirmed_modes[mode] + 1;
          }
        }
      }

      for (let key in GT.QSOhash[i].vucc_grids)
      {
        let grid = GT.QSOhash[i].vucc_grids[key].substr(0, 4);
        if (grid in GT.us48Data)
        {
          GT.us48Data[grid].worked ||= worked;
          if (worked)
          {
            GT.us48Data[grid].worked_bands[band] = ~~GT.us48Data[grid].worked_bands[band] + 1;
            GT.us48Data[grid].worked_modes[mode] = ~~GT.us48Data[grid].worked_modes[mode] + 1;
          }

          GT.us48Data[grid].confirmed ||= didConfirm;
          if (didConfirm)
          {
            GT.us48Data[grid].confirmed_bands[band] = ~~GT.us48Data[grid].confirmed_bands[band] + 1;
            GT.us48Data[grid].confirmed_modes[mode] = ~~GT.us48Data[grid].confirmed_modes[mode] + 1;
          }
        }
      }
    }
  }

  for (let layer in GT.viewInfo)
  {
    let search = GT[GT.viewInfo[layer][0]];
    let worked = (confirmed = 0);

    if (layer == 0)
    {
      for (let key in search)
      {
        if (search[key].rectangle.worked) worked++;
        if (search[key].rectangle.confirmed) confirmed++;
      }
      GT.viewInfo[layer][2] = worked;
      GT.viewInfo[layer][3] = confirmed;
    }
    else if (layer == 5)
    {
      for (let key in search)
      {
        if (search[key].geo != "deleted")
        {
          if (search[key].worked) worked++;
          if (search[key].confirmed) confirmed++;
        }
      }
      GT.viewInfo[layer][2] = worked;
      GT.viewInfo[layer][3] = confirmed;
    }
    else
    {
      for (let key in search)
      {
        if (search[key].worked) worked++;
        if (search[key].confirmed) confirmed++;
      }
      GT.viewInfo[layer][2] = worked;
      GT.viewInfo[layer][3] = confirmed;
    }
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
  if (GT.settings.audio.alertMute == 1 && GT.speechAvailable)
  {
    window.speechSynthesis.cancel();
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
    GT.gtFlagPins = Object()
    GT.gtCallsigns = Object();

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
    GT.spotDetailsCollector = {};
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

  let buffer = "";
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
      let title;
      let blueBarValue;

      if (GT.settings.app.offAirServicesEnable == true && GT.settings.app.oamsBandActivity == true)
      {
        title = "OAMS (blue)\n";
        title += "\tScore: " + bandData[band].oamsScore + "\n\tDecodes: " + bandData[band].oamsDecodes + "\n\tTX-Spots: " + bandData[band].oamsTxSpots + "\n\tRX-Spots: " + bandData[band].oamsRxSpots + "\n\tTx: " + bandData[band].oamsTx + "\tRx: " + bandData[band].oamsRx;
        title += "\nPSK-Reporter (red)\n";
        title += "\tScore: " + bandData[band].pskScore + "\n\tSpots: " + bandData[band].pskSpots + "\n\tTx: " + bandData[band].pskTx + "\tRx: " + bandData[band].pskRx;
        blueBarValue = (bandData[band].oamsScore * scaleFactor + 1);
      }
      else
      {
        title = "Score: " + bandData[band].pskScore + "\nSpots: " + bandData[band].pskSpots + "\nTx: " + bandData[band].pskTx + "\tRx: " + bandData[band].pskRx;
        blueBarValue = (bandData[band].pskSpots * scaleFactor + 1);
      }

      buffer += "<div title='" + title + "' style='display:inline-block;margin:1px;' class='aBand'>";
      buffer += "<div style='height: " + blueBarValue + "px;' class='barRx'></div>";
      buffer += "<div style='height: " + (bandData[band].pskScore * scaleFactor + 1) + "px;' class='barTx'></div>"; 
      buffer += "<div style='font-size:10px' " + blockMyBand + ">" + parseInt(band) + "</div>";
      buffer += "</div>";
    }
  }
  else
  {
    buffer = "..no data yet..";
  }
  graphDiv.innerHTML = buffer;
  if (GT.baWindowInitialized == true)
  {
    GT.baWindowHandle.window.graphDiv.innerHTML = buffer;
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

function ValidateCallsigns(inputText)
{
  inputText.value = inputText.value.toUpperCase();
  let callsigns = inputText.value.split(",");
  let passed = false;
  for (let call in callsigns)
  {
    if (callsigns[call].length > 0)
    {
      if (/\d/.test(callsigns[call]) && /[A-Z]/.test(callsigns[call]))
      {
        passed = true;
      }
      else
      {
        passed = false;
        break;
      }
    }
    else
    {
      passed = false;
      break;
    }
  }

  if (passed)
  {
    inputText.style.color = "#FF0";
    inputText.style.backgroundColor = "darkblue";
  }
  else
  {
    inputText.style.color = "#000";
    inputText.style.backgroundColor = "yellow";
  }
  return passed;
}

function ValidateGrids(inputText)
{
  inputText.value = inputText.value.toUpperCase();
  let grids = inputText.value.split(",");
  let passed = false;
  for (let grid in grids)
  {
    if (grids[grid].length == 4)
    {
      if (/\d/.test(grids[grid]) && /[A-Z]/.test(grids[grid]))
      {
        passed = true;
      }
      else
      {
        passed = false;
        break;
      }
    }
    else
    {
      passed = false;
      break;
    }
  }

  if (passed)
  {
    inputText.style.color = "#FF0";
    inputText.style.backgroundColor = "darkblue";
  }
  else
  {
    inputText.style.color = "#000";
    inputText.style.backgroundColor = "yellow";
  }
  return passed;
}

function ValidateCallsign(inputText, validDiv)
{
  addError.innerHTML = "";
  if (inputText.value.length > 0)
  {
    let passed = false;
    inputText.value = inputText.value.toUpperCase();
    if (/\d/.test(inputText.value) || /[A-Z]/.test(inputText.value))
    {
      passed = true;
    }
    if (passed)
    {
      inputText.style.color = "#FF0";
      inputText.style.backgroundColor = "darkblue";
      if (validDiv) validDiv.innerHTML = "Valid!";
      return true;
    }
    else
    {
      inputText.style.color = "#000";
      inputText.style.backgroundColor = "yellow";
      if (validDiv) validDiv.innerHTML = "Invalid!";
      return false;
    }
  }
  else
  {
    inputText.style.color = "#000";
    inputText.style.backgroundColor = "yellow";
    if (validDiv) validDiv.innerHTML = "Invalid!";
    return false;
  }
}

function ValidateGridsquareOnly4(inputText, validDiv)
{
  addError.innerHTML = "";
  if (inputText.value.length == 4)
  {
    let gridSquare = "";
    let LETTERS = inputText.value.substr(0, 2).toUpperCase();
    let NUMBERS = inputText.value.substr(2, 2).toUpperCase();
    if (/^[A-R]+$/.test(LETTERS) && /^[0-9]+$/.test(NUMBERS))
    {
      gridSquare = LETTERS + NUMBERS;
    }
    if (gridSquare != "")
    {
      inputText.style.color = "#FF0";
      inputText.style.backgroundColor = "darkblue";
      inputText.value = gridSquare;
      if (validDiv) validDiv.innerHTML = "Valid!";
      return true;
    }
    else
    {
      inputText.style.color = "#FFF";
      inputText.style.backgroundColor = "rgb(199, 113, 0)";
      if (validDiv) validDiv.innerHTML = "Invalid!";
      return false;
    }
  }
  else
  {
    inputText.style.color = "#000";
    inputText.style.backgroundColor = "yellow";
    if (validDiv) validDiv.innerHTML = "Valid!";
    return true;
  }
}

function ValidateGridsquare(inputText, validDiv)
{
  if (inputText.value.length == 4 || inputText.value.length == 6)
  {
    let gridSquare = "";
    let LETTERS = inputText.value.substr(0, 2).toUpperCase();
    let NUMBERS = inputText.value.substr(2, 2).toUpperCase();
    if (/^[A-R]+$/.test(LETTERS) && /^[0-9]+$/.test(NUMBERS))
    {
      gridSquare = LETTERS + NUMBERS;
    }
    if (inputText.value.length > 4)
    {
      let LETTERS_SUB = inputText.value.substr(4, 2);
      gridSquare = "";
      if (
        /^[A-R]+$/.test(LETTERS) &&
        /^[0-9]+$/.test(NUMBERS) &&
        /^[A-Xa-x]+$/.test(LETTERS_SUB)
      )
      {
        gridSquare = LETTERS + NUMBERS + LETTERS_SUB;
      }
    }
    if (gridSquare != "")
    {
      inputText.style.color = "#FF0";
      inputText.style.backgroundColor = "darkblue";
      inputText.value = gridSquare;
      if (validDiv) validDiv.innerHTML = "Valid!";
      return true;
    }
    else
    {
      inputText.style.color = "#FFF";
      inputText.style.backgroundColor = "rgb(199, 113, 0)";
      if (validDiv) validDiv.innerHTML = "Invalid!";
      return false;
    }
  }
  else
  {
    inputText.style.color = "#FFF";
    inputText.style.backgroundColor = "rgb(199, 113, 0)";
    if (validDiv) validDiv.innerHTML = "Invalid!";
    return false;
  }
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

function ValidateIPaddress(inputText, checkBox)
{
  if (inputText.value.match(GT.ipformat))
  {
    if (inputText.value != "0.0.0.0" && inputText.value != "255.255.255.255")
    {
      inputText.style.color = "#FF0";
      inputText.style.backgroundColor = "darkblue";
      return true;
    }
    else
    {
      inputText.style.color = "#FFF";
      inputText.style.backgroundColor = "rgb(199, 113, 0)";
      if (checkBox) checkBox.checked = false;
      return false;
    }
  }
  else
  {
    inputText.style.color = "#FFF";
    inputText.style.backgroundColor = "rgb(199, 113, 0)";
    if (checkBox) checkBox.checked = false;
    return false;
  }
}


function ValidateIPaddresses(inputText, checkBox)
{
  let ips = inputText.value.split(",");
  let valid = true;
  for (let x = 0; x < ips.length; x++)
  {
    if (ips[x].match(GT.ipformat))
    {
      if (ips[x] != "0.0.0.0" && ips[x] != "255.255.255.255")
      {
        inputText.style.color = "#FF0";
        inputText.style.backgroundColor = "darkblue";
      }
      else
      {
        inputText.style.color = "#FFF";
        inputText.style.backgroundColor = "rgb(199, 113, 0)";
        if (checkBox) checkBox.checked = false;
        valid = false;
        break;
      }
    }
    else
    {
      valid = false;
      break;
    }
  }

  if (valid == false)
  {
    if (checkBox) checkBox.checked = false;
    inputText.style.color = "#FFF";
    inputText.style.backgroundColor = "rgb(199, 113, 0)";
  }
  else
  {
    inputText.style.color = "#FF0";
    inputText.style.backgroundColor = "darkblue";
  }

  return valid;
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
  // Date.parse(watcherEndDate.value + "Z");

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
  let workingObject = {};
  workingObject.name = name;
  clearWorkingObject(workingObject);
  return workingObject;
}

function clearWorkingObject(workingObject)
{
  workingObject.worked = false;
  workingObject.confirmed = false;
  workingObject.worked_bands = {};
  workingObject.confirmed_bands = {};
  workingObject.worked_modes = {};
  workingObject.confirmed_modes = {};
}

function loadMaidenHeadData()
{
  GT.dxccInfo = require(GT.dxccInfoPath);

  if ("version" in GT.dxccInfo[0])
  {
    GT.dxccVersion = parseInt(GT.dxccInfo[0].version);

    updateLookupsBigCtyUI();
  }

  for (let key in GT.dxccInfo)
  {
    GT.dxccToAltName[GT.dxccInfo[key].dxcc] = GT.dxccInfo[key].name;
    GT.dxccToADIFName[GT.dxccInfo[key].dxcc] = GT.dxccInfo[key].aname;
    GT.altNameToDXCC[GT.dxccInfo[key].name] = GT.dxccInfo[key].dxcc;
    GT.dxccToCountryCode[GT.dxccInfo[key].dxcc] = GT.dxccInfo[key].cc;

    for (let x = 0; x < GT.dxccInfo[key].prefix.length; x++)
    {
      GT.prefixToMap[GT.dxccInfo[key].prefix[x]] = key;
    }
    delete GT.dxccInfo[key].prefix;

    for (let x = 0; x < GT.dxccInfo[key].direct.length; x++)
    {
      GT.directCallToDXCC[GT.dxccInfo[key].direct[x]] = GT.dxccInfo[key].dxcc;
    }
    delete GT.dxccInfo[key].direct;

    for (let val in GT.dxccInfo[key].prefixCQ)
    {
      GT.prefixToCQzone[val] = GT.dxccInfo[key].prefixCQ[val];
    }
    delete GT.dxccInfo[key].prefixCQ;

    for (let val in GT.dxccInfo[key].prefixITU)
    {
      GT.prefixToITUzone[val] = GT.dxccInfo[key].prefixITU[val];
    }
    delete GT.dxccInfo[key].prefixITU;

    for (let val in GT.dxccInfo[key].directCQ)
    {
      GT.directCallToCQzone[val] = GT.dxccInfo[key].directCQ[val];
    }
    delete GT.dxccInfo[key].directCQ;

    for (let val in GT.dxccInfo[key].directITU)
    {
      GT.directCallToITUzone[val] = GT.dxccInfo[key].directITU[val];
    }
    delete GT.dxccInfo[key].directITU;

    for (let x = 0; x < GT.dxccInfo[key].mh.length; x++)
    {
      if (!(GT.dxccInfo[key].mh[x] in GT.gridToDXCC)) { GT.gridToDXCC[GT.dxccInfo[key].mh[x]] = Array(); }
      GT.gridToDXCC[GT.dxccInfo[key].mh[x]].push(GT.dxccInfo[key].dxcc);
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
    if (!(countyData[id].properties.st in GT.stateToCounty)) { GT.stateToCounty[countyData[id].properties.st] = Array(); }
    GT.stateToCounty[countyData[id].properties.st].push(id);

    let cnty = countyData[id].properties.st + "," + replaceAll(countyData[id].properties.n, " ", "").toUpperCase();

    if (!(cnty in GT.cntyToCounty)) { GT.cntyToCounty[cnty] = toProperCase(countyData[id].properties.n); }

    GT.countyData[cnty] = createWorkingObject(cnty);
    GT.countyData[cnty].geo = countyData[id];

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
  let r = { 'KM': 1, 'MI': 0.621371, 'NM': 0.539957, 'DG':0.008 };
  if ( unit in r ) return r[unit] * value;
  else return unit;
}

function changeRangeRingDistance()
{
  GT.settings.map.rangeRingDistance = parseInt(rangeRingDistanceValue.value);
  drawRangeRings();
}

function changeRangeRingColor()
{
  GT.settings.map.rangeRingColor = parseInt(rangeRingColorValue.value);
  drawRangeRings();
}

function updateRangeRingsUI()
{
  let value = (distanceUnit.value != "KM") ? parseFloat(kilometerToUnit(GT.settings.map.rangeRingDistance, distanceUnit.value)).toFixed(1) : GT.settings.map.rangeRingDistance;
  value += " " + distanceUnit.value.toLowerCase();
  rangeRingDistanceTd.innerHTML = value;
  rangeRingDistanceValue.value = GT.settings.map.rangeRingDistance;

  rangeRingColorDiv.style.color = (GT.settings.map.rangeRingColor == 0) ? "#FFF" : "#000";
  rangeRingColorDiv.style.textShadow = (GT.settings.map.rangeRingColor == 0) ? "#000" : "0 0 2px black, 0 0 8px white";
  rangeRingColorDiv.style.backgroundColor = GT.settings.map.rangeRingColor == 0 ? "#000" : GT.settings.map.rangeRingColor == 361 ? "#FFF" : "hsl(" + GT.settings.map.rangeRingColor + ", 100%, 50%)";
  rangeRingColorValue.value = GT.settings.map.rangeRingColor;
}

function drawRangeRings()
{
  updateRangeRingsUI();

  GT.layerSources.rangeRings.clear();

  if (GT.settings.map.showRangeRings == false || GT.settings.map.projection == "EPSG:3857" || GT.settings.map.rangeRingDistance == 0)
  {
    return;
  }

  const center = [GT.settings.map.longitude , GT.settings.map.latitude];    
  const distance = GT.settings.map.rangeRingDistance;

  for (let x = distance; x < 20000; x += distance)
  {
    let poly = new ol.geom.Polygon.circular(center, parseInt(x * 1000), 359).transform("EPSG:4326", GT.settings.map.projection);
    let feature = new ol.Feature( { geometry: poly, prop: "range" } );
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

  let font4String = GT.useTransform ? "normal 12px sans-serif" : "normal 16px sans-serif";
  let font2String = GT.useTransform ? "normal 16px sans-serif" : "normal 22px sans-serif";

  for (let x = 65; x < 83; x++)
  {
    for (let y = 65; y < 83; y++)
    {
      for (let a = 0; a < 10; a++)
      {
        for (let b = 0; b < 10; b++)
        {
          let LL = squareToLatLong(
            String.fromCharCode(x) +
            String.fromCharCode(y) +
            String(a) +
            String(b)
          );
          let Lat = LL.la2 - (LL.la2 - LL.la1) / 2;
          let Lon = LL.lo2 - (LL.lo2 - LL.lo1) / 2;
          let point = ol.proj.fromLonLat([Lon, Lat]);
          let feature = new ol.Feature({
            geometry: new ol.geom.Point(point)
          });

          let featureStyle = new ol.style.Style({
            text: new ol.style.Text({
              fill: new ol.style.Fill({ color: "#000" }),
              font: font4String,
              stroke: new ol.style.Stroke({
                color: "#88888888",
                width: 1
              }),
              text:
                String.fromCharCode(x) +
                String.fromCharCode(y) +
                String(a) +
                String(b),
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

      let LL = twoWideToLatLong(String.fromCharCode(x) + String.fromCharCode(y));
      let Lat = LL.la2 - (LL.la2 - LL.la1) / 2;
      let Lon = LL.lo2 - (LL.lo2 - LL.lo1) / 2;
      let point = ol.proj.fromLonLat([Lon, Lat]);
      feature = new ol.Feature(new ol.geom.Point(point));

      featureStyle = new ol.style.Style({
        text: new ol.style.Text({
          fill: new ol.style.Fill({ color: "#000" }),
          font: font2String,
          stroke: new ol.style.Stroke({
            color: "#88888888",
            width: 2
          }),
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
  warnOnSoundcardsChanged.checked = GT.settings.app.warnOnSoundcardsChange;

  setSpotImage();

  timezoneImg.style.filter = GT.settings.map.timezonesEnable == 1 ? "" : "grayscale(1)";
  radarImg.style.filter = GT.settings.map.usRadar ? "" : "grayscale(1)";
  predImg.src = GT.predImageArray[GT.settings.map.predMode];
  predImg.style.filter = GT.settings.map.predMode > 0 ? "" : "grayscale(1)";
  gridOverlayImg.style.filter = GT.settings.map.showAllGrids ? "" : "grayscale(1)";

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
  GT.settings.app.distanceUnit = distanceUnit.value;
  GT.scaleLine.setUnits(GT.scaleUnits[GT.settings.app.distanceUnit]);
  updateRangeRingsUI();
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
  }
  else
  {
    pathColorDiv.style.color = "#FFF";
    pathColorDiv.style.backgroundColor = pathColor;
  }

  pathColor = qrzPathColorValue.value == 0 ? "#000" : qrzPathColorValue.value == 361 ? "#FFF" : "hsl(" + qrzPathColorValue.value + ", 100%, 50%)";
  if (qrzPathColorValue.value != 0)
  {
    qrzPathColorDiv.style.color = "#000";
    qrzPathColorDiv.style.backgroundColor = pathColor;
  }
  else
  {
    qrzPathColorDiv.style.color = "#FFF";
    qrzPathColorDiv.style.backgroundColor = pathColor;
  }
}

function setNightMapColors()
{
  let pathColor = GT.settings.map.nightPathColor == 0 ? "#000" : GT.settings.map.nightPathColor == 361 ? "#FFF" : "hsl(" + GT.settings.map.nightPathColor + ", 100%, 50%)";
  if (GT.settings.map.nightPathColor != 0)
  {
    pathNightColorDiv.style.color = "#000";
    pathNightColorDiv.style.backgroundColor = pathColor;
  }
  else
  {
    pathNightColorDiv.style.color = "#FFF";
    pathNightColorDiv.style.backgroundColor = pathColor;
  }

  pathColor = GT.settings.map.nightQrzPathColor == 0 ? "#000" : GT.settings.map.nightQrzPathColor == 361 ? "#FFF" : "hsl(" + GT.settings.map.nightQrzPathColor + ", 100%, 50%)";
  if (GT.settings.map.nightQrzPathColor != 0)
  {
    pathNightQrzColorDiv.style.color = "#000";
    pathNightQrzColorDiv.style.backgroundColor = pathColor;
  }
  else
  {
    pathNightQrzColorDiv.style.color = "#FFF";
    pathNightQrzColorDiv.style.backgroundColor = pathColor;
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
  for (let i = 0; i !== deviceInfos.length; ++i)
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
  spotHistoryTimeTd.innerHTML =
    "Max Age: " + toDHM(Number(GT.settings.reception.viewHistoryTimeSec));


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

  if (Object.keys(GT.settings.app.workingCallsigns).length == 0)
  {
    GT.settings.app.workingCallsignEnable = false;
    workingCallsignEnableTd.style.display = "none";
  }
  workingCallsignEnable.checked = GT.settings.app.workingCallsignEnable;
  workingCallsignsValue.value = Object.keys(
    GT.settings.app.workingCallsigns
  ).join(",");

  ValidateCallsigns(workingCallsignsValue);

  if (Object.keys(GT.settings.app.workingGrids).length == 0)
  {
    GT.settings.app.workingGridEnable = false;
    workingGridEnableTd.style.display = "none";
  }

  workingGridEnable.checked = GT.settings.app.workingGridEnable;
  workingGridsValue.value = Object.keys(
    GT.settings.app.workingGrids
  ).join(",");

  ValidateGrids(workingGridsValue);

  if (GT.settings.app.workingDate == 0)
  {
    GT.settings.app.workingDateEnable = false;
    workingDateEnableTd.style.display = "none";
  }

  workingDateEnable.checked = GT.settings.app.workingDateEnable;
  displayWorkingDate();

  if (GT.platform == "mac")
  {
    selectTQSLButton.style.display = "none";
  }

  for (let key in GT.settings.adifLog.menu)
  {
    let value = GT.settings.adifLog.menu[key];
    let where = key + "Div";
    if (document.getElementById(key) != null)
    {
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
    else
    {
      delete GT.settings.adifLog.menu[key];
    }
  }
  for (let key in GT.settings.adifLog.startup)
  {
    if (document.getElementById(key) != null) { document.getElementById(key).checked = GT.settings.adifLog.startup[key]; }
  }
  for (let key in GT.settings.adifLog.nickname)
  {
    if (document.getElementById(key) != null)
    {
      document.getElementById(key).checked = GT.settings.adifLog.nickname[key];
      if (key == "nicknameeQSLCheckBox")
      {
        if (document.getElementById(key).checked == true)
        {
          eQSLNickname.style.display = "";
        }
        else
        {
          eQSLNickname.style.display = "none";
        }
      }
    }
  }
  for (let key in GT.settings.adifLog.text)
  {
    if (document.getElementById(key) != null)
    {
      document.getElementById(key).value = GT.settings.adifLog.text[key];
      ValidateText(document.getElementById(key));
    }
  }
  for (let key in GT.settings.adifLog.qsolog)
  {
    if (document.getElementById(key) != null)
    {
      document.getElementById(key).checked = GT.settings.adifLog.qsolog[key];
      if (key == "logLOTWqsoCheckBox")
      {
        if (document.getElementById(key).checked == true)
        {
          lotwUpload.style.display = "";
          trustedTestButton.style.display = "";
        }
        else
        {
          lotwUpload.style.display = "none";
          trustedTestButton.style.display = "none";
        }
      }
    }
  }
  if (clubCall.value == "" && GT.settings.app.myRawCall != "NOCALL")
  {
    clubCall.value = GT.settings.app.myRawCall;
    ValidateText(clubCall);
  }

  try
  {
    findTrustedQSLPaths();
  }
  catch (e)
  {
    if (logLOTWqsoCheckBox.checked == true)
    {
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
    nodeTimers.setTimeout(checkForNewVersion, 30000); // Informative check

    //nodeTimers.setTimeout(downloadWorldVhfActivity, 2000);
  }
  catch (e)
  {
    alert("!Init Failed Section!: " + section + "\nPlease report failed section");
  }
}

function registerLegendContextMenus()
{
  predButton.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (GT.settings.map.predMode > 0)
    {
      const menu = new Menu();
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
      menu.popup();
    }
  });

  buttonSpotsBoxDiv.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (GT.spotView != 0)
    {
      const menu = new Menu();
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
      menu.popup();
    }
  });
}

function checkForNewVersion()
{
  let info = electron.ipcRenderer.sendSync("updateAvailable");
  if (info != null)
  {
    if (GT.lastVersionInfo == null || GT.lastVersionInfo.version != info.version)
    {
      addLastTraffic("<font style='color:lightgreen'>New Version</font><br><font style='color:cyan'>" + info.version + "</font>");
    }
  }

  GT.lastVersionInfo = Object.assign({}, info);
  nodeTimers.setTimeout(checkForNewVersion, 43200000); // Informative check in 12 hours
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
        GT.settings.app.buttonPanelOrder.unshift(GT.defaultButtons[i]);
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

function decodeQUINT8(byteArray)
{
  GT.qtToSplice = 1;
  return byteArray[0];
}

function encodeQBOOL(byteArray, offset, value)
{
  return byteArray.writeUInt8(value, offset);
}

function decodeQUINT32(byteArray)
{
  GT.qtToSplice = 4;
  return byteArray.readUInt32BE(0);
}

function encodeQUINT32(byteArray, offset, value)
{
  if (value == -1) value = 4294967295;
  return byteArray.writeUInt32BE(value, offset);
}

function decodeQINT32(byteArray)
{
  GT.qtToSplice = 4;
  return byteArray.readInt32BE(0);
}

function encodeQINT32(byteArray, offset, value)
{
  return byteArray.writeInt32BE(value, offset);
}

function decodeQUINT64(byteArray)
{
  let value = 0;
  for (let i = 0; i < 8; i++)
  {
    value = value * 256 + byteArray[i];
  }
  GT.qtToSplice = 8;
  return value;
}

function encodeQUINT64(byteArray, offset, value)
{
  let breakOut = Array();
  for (let i = 0; i < 8; i++)
  {
    breakOut[i] = value & 0xff;
    value >>= 8;
  }
  for (let i = 0; i < 8; i++)
  {
    offset = encodeQBOOL(byteArray, offset, breakOut[7 - i]);
  }
  return offset;
}

function decodeQUTF8(byteArray)
{
  let utf8_len = decodeQUINT32(byteArray);
  let result = "";
  byteArray = byteArray.slice(GT.qtToSplice);
  if (utf8_len == 0xffffffff) utf8_len = 0;
  else result = byteArray.slice(0, utf8_len);
  GT.qtToSplice = utf8_len + 4;
  return result.toString();
}

function encodeQUTF8(byteArray, offset, value)
{
  offset = encodeQUINT32(byteArray, offset, value.length);
  let wrote = byteArray.write(value, offset, value.length);
  return wrote + offset;
}

function decodeQDOUBLE(byteArray)
{
  GT.qtToSplice = 8;
  return byteArray.readDoubleBE(0);
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
    // Decode enough to get the rig-name, so we know who to send to
    let message = originalMessage.slice();
    let newMessage = {};
    newMessage.magic_key = decodeQUINT32(message);
    message = message.slice(GT.qtToSplice);
    if (newMessage.magic_key == 0xadbccbda)
    {
      newMessage.schema_number = decodeQUINT32(message);
      message = message.slice(GT.qtToSplice);
      newMessage.type = decodeQUINT32(message);
      message = message.slice(GT.qtToSplice);
      newMessage.Id = decodeQUTF8(message);

      if (newMessage.Id in GT.instances)
      {
        wsjtUdpMessage(originalMessage, originalMessage.length, GT.instances[newMessage.Id].remote.port, GT.instances[newMessage.Id].remote.address);
      }
    }
  });
  GT.forwardUdpServer.bind(0);
}

function sendForwardUdpMessage(msg, length)
{
  if (GT.forwardUdpServer)
  {
    for (const key in GT.forwardIPs)
    {
      GT.forwardUdpServer.send(msg, 0, length, GT.settings.app.wsjtForwardUdpPort, GT.forwardIPs[key]);
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

function addNewInstance(instanceId)
{
  GT.instances[instanceId] = {};
  GT.instances[instanceId].valid = false;
  GT.instances[instanceId].open = false;
  GT.instances[instanceId].crEnable = true;
  GT.instances[instanceId].canRoster = true;
  GT.instances[instanceId].oldStatus = null;
  GT.instances[instanceId].status = null;
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

    let newMessage = {};
    newMessage.magic_key = decodeQUINT32(message);
    message = message.slice(GT.qtToSplice);
    if (newMessage.magic_key == 0xadbccbda)
    {
      newMessage.schema_number = decodeQUINT32(message);
      message = message.slice(GT.qtToSplice);
      newMessage.type = decodeQUINT32(message);
      message = message.slice(GT.qtToSplice);
      newMessage.Id = decodeQUTF8(message);
      message = message.slice(GT.qtToSplice);

      let instanceId = newMessage.Id;
      if (!(instanceId in GT.instances))
      {
        addNewInstance(instanceId);
        GT.instanceCount++;
      }
      let notify = false;
      if (GT.instances[instanceId].open == false) notify = true;
      GT.instances[instanceId].open = true;
      GT.instances[instanceId].remote = remote;

      if (notify) updateRosterInstances();

      if (newMessage.type == 1)
      {
        newMessage.event = "Status";
        newMessage.Frequency = decodeQUINT64(message);
        newMessage.Band = formatBand(Number(newMessage.Frequency / 1000000));
        message = message.slice(GT.qtToSplice);
        newMessage.MO = decodeQUTF8(message);
        message = message.slice(GT.qtToSplice);
        newMessage.DXcall = decodeQUTF8(message);
        message = message.slice(GT.qtToSplice);
        newMessage.Report = decodeQUTF8(message);
        message = message.slice(GT.qtToSplice);
        newMessage.TxMode = decodeQUTF8(message);
        message = message.slice(GT.qtToSplice);
        newMessage.TxEnabled = decodeQUINT8(message);
        message = message.slice(GT.qtToSplice);
        newMessage.Transmitting = decodeQUINT8(message);
        message = message.slice(GT.qtToSplice);
        newMessage.Decoding = decodeQUINT8(message);
        message = message.slice(GT.qtToSplice);
        newMessage.RxDF = decodeQINT32(message);
        message = message.slice(GT.qtToSplice);
        newMessage.TxDF = decodeQINT32(message);
        message = message.slice(GT.qtToSplice);
        newMessage.DEcall = decodeQUTF8(message);
        message = message.slice(GT.qtToSplice);
        newMessage.DEgrid = decodeQUTF8(message);
        message = message.slice(GT.qtToSplice);
        newMessage.DXgrid = decodeQUTF8(message);
        message = message.slice(GT.qtToSplice);
        newMessage.TxWatchdog = decodeQUINT8(message);
        message = message.slice(GT.qtToSplice);
        newMessage.Submode = decodeQUTF8(message);
        message = message.slice(GT.qtToSplice);
        newMessage.Fastmode = decodeQUINT8(message);
        message = message.slice(GT.qtToSplice);

        if (message.length > 0)
        {
          newMessage.SopMode = decodeQUINT8(message);
          message = message.slice(GT.qtToSplice);
        }
        else
        {
          newMessage.SopMode = -1;
        }
        if (message.length > 0)
        {
          newMessage.FreqTol = decodeQINT32(message);
          message = message.slice(GT.qtToSplice);
        }
        else
        {
          newMessage.FreqTol = -1;
        }
        if (message.length > 0)
        {
          newMessage.TRP = decodeQINT32(message);
          message = message.slice(GT.qtToSplice);
        }
        else
        {
          newMessage.TRP = -1;
        }
        if (message.length > 0)
        {
          newMessage.ConfName = decodeQUTF8(message);
          message = message.slice(GT.qtToSplice);
        }
        else
        {
          newMessage.ConfName = null;
        }
        if (message.length > 0)
        {
          newMessage.TxMessage = decodeQUTF8(message);
          message = message.slice(GT.qtToSplice);
        }
        else
        {
          newMessage.TxMessage = null;
        }
        GT.instances[instanceId].oldStatus = GT.instances[instanceId].status;
        GT.instances[instanceId].status = newMessage;
        GT.instances[instanceId].valid = true;
      }
      if (GT.instances[instanceId].valid == true)
      {
        if (newMessage.type == 2)
        {
          newMessage.event = "Decode";
          newMessage.NW = decodeQUINT8(message);
          message = message.slice(GT.qtToSplice);
          newMessage.TM = decodeQUINT32(message);
          message = message.slice(GT.qtToSplice);
          newMessage.SR = decodeQINT32(message);
          message = message.slice(GT.qtToSplice);
          newMessage.DT = decodeQDOUBLE(message);
          message = message.slice(GT.qtToSplice);
          newMessage.DF = decodeQUINT32(message);
          message = message.slice(GT.qtToSplice);
          newMessage.MO = decodeQUTF8(message);
          message = message.slice(GT.qtToSplice);
          newMessage.Msg = decodeQUTF8(message);
          message = message.slice(GT.qtToSplice);
          newMessage.LC = decodeQUINT8(message);
          message = message.slice(GT.qtToSplice);
          newMessage.OA = decodeQUINT8(message);
          message = message.slice(GT.qtToSplice);
          newMessage.OF = GT.instances[instanceId].status.Frequency;
          newMessage.OC = GT.instances[instanceId].status.DEcall;
          newMessage.OG = GT.instances[instanceId].status.DEgrid;
          newMessage.OM = GT.instances[instanceId].status.MO;
          newMessage.OB = GT.instances[instanceId].status.Band;
          newMessage.SP = GT.instances[instanceId].status.SopMode;
        }
        if (newMessage.type == 3)
        {
          newMessage.event = "Clear";
        }
        if (newMessage.type == 5)
        {
          newMessage.event = "QSO Logged";
          newMessage.DateOff = decodeQUINT64(message);
          message = message.slice(GT.qtToSplice);
          newMessage.TimeOff = decodeQUINT32(message);
          message = message.slice(GT.qtToSplice);
          newMessage.timespecOff = decodeQUINT8(message);
          message = message.slice(GT.qtToSplice);
          if (newMessage.timespecOff == 2)
          {
            newMessage.offsetOff = decodeQINT32(message);
            message = message.slice(GT.qtToSplice);
          }
          newMessage.DXCall = decodeQUTF8(message);
          message = message.slice(GT.qtToSplice);
          newMessage.DXGrid = decodeQUTF8(message);
          message = message.slice(GT.qtToSplice);
          newMessage.Frequency = decodeQUINT64(message);
          message = message.slice(GT.qtToSplice);
          newMessage.MO = decodeQUTF8(message);
          message = message.slice(GT.qtToSplice);
          newMessage.ReportSend = decodeQUTF8(message);
          message = message.slice(GT.qtToSplice);
          newMessage.ReportRecieved = decodeQUTF8(message);
          message = message.slice(GT.qtToSplice);
          newMessage.TXPower = decodeQUTF8(message);
          message = message.slice(GT.qtToSplice);
          newMessage.Comments = decodeQUTF8(message);
          message = message.slice(GT.qtToSplice);
          newMessage.Name = decodeQUTF8(message);
          message = message.slice(GT.qtToSplice);
          newMessage.DateOn = decodeQUINT64(message);
          message = message.slice(GT.qtToSplice);
          newMessage.TimeOn = decodeQUINT32(message);
          message = message.slice(GT.qtToSplice);
          newMessage.timespecOn = decodeQUINT8(message);
          message = message.slice(GT.qtToSplice);
          if (newMessage.timespecOn == 2)
          {
            newMessage.offsetOn = decodeQINT32(message);
            message = message.slice(GT.qtToSplice);
          }
          if (message.length > 0)
          {
            newMessage.Operatorcall = decodeQUTF8(message);
            message = message.slice(GT.qtToSplice);
          }
          else newMessage.Operatorcall = "";

          if (message.length > 0)
          {
            newMessage.Mycall = decodeQUTF8(message);
            message = message.slice(GT.qtToSplice);
          }
          else newMessage.Mycall = "";

          if (message.length > 0)
          {
            newMessage.Mygrid = decodeQUTF8(message);
            message = message.slice(GT.qtToSplice);
          }
          else newMessage.Mygrid = "";

          if (message.length > 0)
          {
            newMessage.ExchangeSent = decodeQUTF8(message);
            message = message.slice(GT.qtToSplice);
          }
          else newMessage.ExchangeSent = "";

          if (message.length > 0)
          {
            newMessage.ExchangeReceived = decodeQUTF8(message);
            message = message.slice(GT.qtToSplice);
          }
          else newMessage.ExchangeReceived = "";
        }
        if (newMessage.type == 6)
        {
          newMessage.event = "Close";
        }
        if (newMessage.type == 10)
        {
          newMessage.event = "WSPRDecode";
          newMessage.NW = decodeQUINT8(message);
          message = message.slice(GT.qtToSplice);
          newMessage.TM = decodeQUINT32(message);
          message = message.slice(GT.qtToSplice);
          newMessage.SR = decodeQINT32(message);
          message = message.slice(GT.qtToSplice);
          newMessage.DT = decodeQDOUBLE(message);
          message = message.slice(GT.qtToSplice);
          newMessage.Frequency = decodeQUINT64(message);
          message = message.slice(GT.qtToSplice);
          newMessage.Drift = decodeQINT32(message);
          message = message.slice(GT.qtToSplice);
          newMessage.Callsign = decodeQUTF8(message);
          message = message.slice(GT.qtToSplice);
          newMessage.Grid = decodeQUTF8(message);
          message = message.slice(GT.qtToSplice);
          newMessage.Power = decodeQINT32(message);
          message = message.slice(GT.qtToSplice);
          newMessage.OA = decodeQUINT8(message);
          message = message.slice(GT.qtToSplice);
          newMessage.OF = GT.instances[instanceId].status.Frequency;
          newMessage.OC = GT.instances[instanceId].status.DEcall;
          newMessage.OG = GT.instances[instanceId].status.DEgrid;
          newMessage.OM = GT.instances[instanceId].status.MO;
          newMessage.OB = GT.instances[instanceId].status.Band;
        }
        if (newMessage.type == 12)
        {
          newMessage.event = "ADIF";
          newMessage.ADIF = decodeQUTF8(message);
          message = message.slice(GT.qtToSplice);
        }

        if (newMessage.type in GT.wsjtHandlers)
        {
          newMessage.remote = remote;
          newMessage.instance = instanceId;

          lastMsgTimeDiv.innerHTML = I18N("gt.newMesg.Recvd") + " " + newMessage.Id;

          GT.wsjtHandlers[newMessage.type](newMessage);
          GT.lastTimeSinceMessageInSeconds = parseInt(Date.now() / 1000);
        }
      }
    }
  });
  GT.wsjtUdpServer.bind(port);
  GT.wsjtCurrentPort = port;
  GT.wsjtCurrentIP = GT.settings.app.wsjtIP;
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
      let worker =
        "<center>" + I18N("gt.callookDX1") +
          "<br>" + I18N("gt.callookDX2") +
          "<br>" + I18N("gt.callookDX3") + "<br>";
      worker +=
        "<br>" + I18N("gt.callookDX4") + " <font color='orange'> " +
        callsign +
        "</font> " + I18N("gt.callookDX5") + " <font color='yellow'> " +
        where +
        "</font><br>";
      worker +=
        "<br><br>" + I18N("gt.callookDX6") + "<br>";
      worker += I18N("gt.callookDX7") + "<br></center>";

      setLookupDiv("lookupInfoDiv", worker);
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
  if (!("cnty" in lookup))
  {
    lookup.cnty = null;
  }

  if (lookup.hasOwnProperty("callsign"))
  {
    lookup.call = lookup.callsign;
    delete lookup.callsign;
  }

  lookup.call = lookup.call.toUpperCase();

  if (lookup.hasOwnProperty("latitude"))
  {
    lookup.lat = lookup.latitude;
    delete lookup.latitude;
  }
  if (lookup.hasOwnProperty("longitude"))
  {
    lookup.lon = lookup.longitude;
    delete lookup.longitude;
  }
  if (lookup.hasOwnProperty("locator"))
  {
    lookup.grid = lookup.locator;
    delete lookup.locator;
  }
  if (lookup.hasOwnProperty("website"))
  {
    lookup.url = lookup.website;
    delete lookup.website;
  }
  if (lookup.hasOwnProperty("web"))
  {
    lookup.url = lookup.web;
    delete lookup.web;
  }
  if (lookup.hasOwnProperty("qslpic"))
  {
    lookup.image = lookup.qslpic;
    delete lookup.qslpic;
  }
  if (lookup.hasOwnProperty("picture"))
  {
    lookup.image = lookup.picture;
    delete lookup.picture;
  }
  if (lookup.hasOwnProperty("address"))
  {
    lookup.addr1 = lookup.address;
    delete lookup.address;
  }
  if (lookup.hasOwnProperty("adr_city"))
  {
    lookup.addr2 = lookup.adr_city;
    delete lookup.adr_city;
  }
  if (lookup.hasOwnProperty("city"))
  {
    lookup.addr2 = lookup.city;
    delete lookup.city;
  }
  if (lookup.hasOwnProperty("itu"))
  {
    lookup.ituzone = lookup.itu;
    delete lookup.itu;
  }
  if (lookup.hasOwnProperty("cq"))
  {
    lookup.cqzone = lookup.cq;
    delete lookup.cq;
  }
  if (lookup.hasOwnProperty("adif"))
  {
    lookup.dxcc = lookup.adif;
    delete lookup.adif;
  }
  if (!lookup.hasOwnProperty("dxcc"))
  {
    lookup.dxcc = callsignToDxcc(lookup.call.toUpperCase());
  }
  if (lookup.hasOwnProperty("adr_name"))
  {
    lookup.name = lookup.adr_name;
    delete lookup.adr_name;
  }
  if (lookup.hasOwnProperty("adr_street1"))
  {
    lookup.addr1 = lookup.adr_street1;
    delete lookup.adr_street1;
  }
  if (lookup.hasOwnProperty("us_state"))
  {
    lookup.state = lookup.us_state;
    delete lookup.us_state;
  }
  if (lookup.hasOwnProperty("oblast"))
  {
    lookup.state = lookup.oblast;
    delete lookup.oblast;
  }
  if (lookup.hasOwnProperty("district"))
  {
    lookup.state = lookup.district;
    delete lookup.district;
  }
  if (lookup.hasOwnProperty("adr_zip"))
  {
    lookup.zip = lookup.adr_zip;
    delete lookup.adr_zip;
  }
  if (lookup.hasOwnProperty("adr_country"))
  {
    lookup.country = lookup.adr_country;
    delete lookup.adr_country;
  }
  if (lookup.hasOwnProperty("us_county"))
  {
    lookup.county = lookup.us_county;
    delete lookup.us_county;
  }
  if (lookup.hasOwnProperty("qsldirect"))
  {
    lookup.mqsl = lookup.qsldirect;
    delete lookup.qsldirect;
  }
  if (lookup.hasOwnProperty("qsl"))
  {
    lookup.bqsl = lookup.qsl;
    delete lookup.qsl;
  }
  if (lookup.hasOwnProperty("utc_offset"))
  {
    lookup.GMTOffset = lookup.utc_offset;
    delete lookup.utc_offset;
  }

  if (lookup.hasOwnProperty("land"))
  {
    lookup.country = lookup.land;
    delete lookup.land;
  }

  if ("grid" in lookup)
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
      lookup.cnty = replaceAll(lookup.county.toUpperCase(), " ", "");
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
  let worker = "";
  let thisCall = getLookProp(lookup, "call").toUpperCase();

  worker += "<table title='Click to copy address to clipboard' onclick='setClipboardFromLookup();' style='cursor:pointer' >";
  worker += "<tr>";
  worker += "<td style='font-size:36pt;color:cyan;font-weight:bold'>";
  worker += formatCallsign(getLookProp(lookup, "call").toUpperCase());
  worker += "</td>";
  worker += "<td align='center' style='margin:0;padding:0'>";
  if (lookup.dxcc > 0 && lookup.dxcc in GT.dxccInfo)
  {
    worker += "<img style='padding-top:4px' src='img/flags/24/" + GT.dxccInfo[lookup.dxcc].flag + "'>";
  }
  worker += "</td>";
  worker += "<td rowspan=6>";
  let image = getLookProp(lookup, "image");
  if (image.length > 0)
  {
    worker += "<img style='border:1px solid gray' class='roundBorder' width='220px' src='" + image + "'>";
  }
  worker += "</td>";
  worker += "</tr>";

  GT.lastLookupAddress = "";
  if (getLookProp(lookup, "addrAttn").length > 0)
  {
    worker += "<tr>";
    worker += "<td>";
    worker += getLookProp(lookup, "addrAttn");
    GT.lastLookupAddress += getLookProp(lookup, "addrAttn") + "\n";
    worker += "</td>";
    worker += "</tr>";
  }
  worker += "<tr>";
  worker += "<td>";
  worker += "<b>" + getLookProp(lookup, "name") + "</b>";
  GT.lastLookupAddress += getLookProp(lookup, "name") + "\n";
  worker += "</td>";
  worker += "</tr>";
  worker += "<tr>";
  worker += "<td>";
  worker += getLookProp(lookup, "addr1");
  GT.lastLookupAddress += getLookProp(lookup, "addr1") + "\n";
  worker += "</td>";
  worker += "</tr>";
  worker += "<tr>";
  worker += "<td>";
  worker += joinCommaIf(getLookProp(lookup, "addr2"), joinSpaceIf(getLookProp(lookup, "state"), getLookProp(lookup, "zip")));
  GT.lastLookupAddress += joinCommaIf(getLookProp(lookup, "addr2"), joinSpaceIf(getLookProp(lookup, "state"), getLookProp(lookup, "zip"))) + "\n";
  worker += "</td>";
  worker += "</tr>";
  worker += "<tr>";
  worker += "<td>";
  let country = getLookProp(lookup, "country");
  worker += country;
  GT.lastLookupAddress += country + "\n";

  worker += "</td>";
  worker += "</tr>";
  worker += "<tr>";
  worker += "<td>";
  let email = getLookProp(lookup, "email");
  if (email.length > 0)
  {
    worker += "<div style='cursor:pointer;font-weight:bold;vertical-align:top' onclick='window.opener.mailThem(\"" + email + "\");'>" + email + "</div>";
    GT.lastLookupAddress += email + "\n";
  }

  worker += "</td>";
  worker += "</tr>";
  worker += "</table>";
  let card = "<div class='mapItem' id='callCard' style='top:0;padding:4px;'>" + worker + "</div>";
  worker = "";
  worker += "<table align='center' class='bioTable' >";
  worker += "<tr><th colspan=2>Details</th></tr>";
  if (getLookProp(lookup, "url").length > 0)
  {
    worker += "<tr>";
    worker += "<td>Website</td>";
    worker += "<td  >";
    worker += "<font color='orange'><b><div style='cursor:pointer' onClick='window.opener.openSite(\"" + getLookProp(lookup, "url") + "\");' >Link</div></b></font>";
    worker += "</td>";
    worker += "</tr>";
  }
  if (Number(getLookProp(lookup, "bio")) > 0)
  {
    worker += "<tr>";
    worker += "<td>Biography</td>";
    worker += "<td>";
    worker += "<font color='orange'><b><div style='cursor:pointer' onClick='window.opener.openSite(\"https://www.qrz.com/db/" + getLookProp(lookup, "call") + "\");'>Link</div></b></font>";
    worker += "</td>";
    worker += "</tr>";
  }

  worker += makeRow("Type", lookup, "type");
  worker += makeRow("Class", lookup, "class");
  worker += makeRow("Codes", lookup, "codes");
  worker += makeRow("QTH", lookup, "qth");
  let dates = joinIfBothWithDash(getLookProp(lookup, "efdate"), getLookProp(lookup, "expdate"));
  if (dates.length > 0)
  {
    worker += "<tr><td>Effective Dates</td><td>" + dates + "</td></tr>";
  }
  let Aliases = joinCommaIf(getLookProp(lookup, "aliases"), getLookProp(lookup, "p_call"));
  if (Aliases.length > 0)
  {
    worker += "<tr title='" + Aliases + "' ><td>Aliases</td><td>" + Aliases + "</td></tr>";
  }
  worker += makeRow("Polish OT", lookup, "plot");
  worker += makeRow("German DOK", lookup, "dok");
  worker += makeYesNoRow("DOK is Sonder-DOK", lookup, "sondok");
  worker += "<tr><td>DXCC</td><td>" + getLookProp(lookup, "dxcc") + " - " + GT.dxccToAltName[getLookProp(lookup, "dxcc")] + "</td></tr>";
  worker += makeRow("CQ zone", lookup, "cqzone");
  worker += makeRow("ITU zone", lookup, "ituzone");
  worker += makeRow("IOTA", lookup, "iota");
  worker += makeRow("FIPS", lookup, "fips");
  worker += makeRow("FRN", lookup, "frn");
  worker += makeRow("Timezone", lookup, "TimeZone");
  worker += makeRow("GMT Offset", lookup, "GMTOffset");
  worker += makeRow("County", lookup, "county");
  worker += makeRow("Latitude", lookup, "lat");
  worker += makeRow("Longitude", lookup, "lon");
  if (getLookProp(lookup, "lat").length > 0 && getLookProp(lookup, "lon").length > 0)
  {
    worker += "<tr><td>Distance</td><td style='color:cyan'>" +
      parseInt(
        MyCircle.distance(
          GT.myLat,
          GT.myLon,
          Number(lookup.lat), Number(lookup.lon),
          distanceUnit.value
        ) * MyCircle.validateRadius(distanceUnit.value)
      ) + distanceUnit.value.toLowerCase() + "</td></tr>";
    let bearing = parseInt(MyCircle.bearing(GT.myLat, GT.myLon, Number(lookup.lat), Number(lookup.lon)));
    worker += "<tr><td>Azimuth</td><td style='color:yellow'>" + bearing + "&deg;</td></tr>";
  }
  worker += makeRow("Grid", lookup, "grid", true);
  if (getLookProp(lookup, "gtGrid").length > 0 && getLookProp(lookup, "gtGrid").toUpperCase() != getLookProp(lookup, "grid").toUpperCase())
  {
    worker += makeRow("GT Grid", lookup, "gtGrid", true);
  }

  worker += makeRow("Born", lookup, "born");
  worker += makeYesNoRow("LoTW", lookup, "lotw");
  worker += makeYesNoRow("eQSL", lookup, "eqsl");
  worker += makeYesNoRow("Bureau QSL", lookup, "bqsl");
  worker += makeYesNoRow("Mail Direct QSL", lookup, "mqsl");
  worker += makeRow("QSL Via", lookup, "qsl_via");
  worker += makeRow("QRZ Admin", lookup, "user");
  worker += makeRow("Prefix", lookup, "prefix");
  worker += lookup.source;

  if (GT.settings.callsignLookups.lotwUseEnable == true && thisCall in GT.lotwCallsigns)
  {
    lookup.ulotw = "&#10004; (" + userDayString(GT.lotwCallsigns[thisCall] * 86400 * 1000) + ")";
    worker += makeRow("LoTW Member", lookup, "ulotw");
  }
  if (GT.settings.callsignLookups.eqslUseEnable == true && thisCall in GT.eqslCallsigns)
  {
    lookup.ueqsl = "&#10004;";
    worker += makeRow("eQSL Member", lookup, "ueqsl");
  }
  if (GT.settings.callsignLookups.oqrsUseEnable == true && thisCall in GT.oqrsCallsigns)
  {
    lookup.uoqrs = "&#10004;";
    worker += makeRow("ClubLog OQRS", lookup, "uoqrs");
  }

  if (fromCache)
  {
    worker += "<tr><td>Cached</td><td>Yes</td></tr>";
  }

  worker += "</table>";
  let details = "<div class='mapItem' id='callDetails' style='padding:4px;'>" +  worker + "</div>";
  let genMessage = "<tr><td colspan=2><div title=\"Clear\" class=\"button\" onclick=\"window.opener.clearLookup();\" >Clear</div> <div title=\"Generate Messages\" class=\"button\" onclick=\"window.opener.setCallAndGrid('" + getLookProp(lookup, "call") + "','" + getLookProp(lookup, "grid") + "');\">Generate Messages</div></td></tr>";

  setLookupDiv("lookupInfoDiv", "<table align='center'><tr><td>" + card + "</td><td>" + details + "</td></tr>" + genMessage + "</table>");
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
      let style = ((object[key].substr(0, 4) + GT.settings.app.myBand + GT.settings.app.myMode) in GT.tracker.confirmed.grid) ? "color:cyan;background-color:black;" : "color:black;background-color:cyan;";
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

    let worker = "";

  if (call in GT.acknowledgedCalls)
  {
    worker = "<h3>" + I18N("gt.lookup.acks") + " " + formatCallsign(call) + " <img class='lookupAckBadge' src='" + GT.acknowledgedCalls[call].badge + "'> " + GT.acknowledgedCalls[call].message + "</h3>";
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
  worker += "<div class='mapItemNoSize'><table align='center' class='darkTable'>";
  if (Object.keys(work).length > 0)
  {
    worker += "<tr><th style='color:yellow'>Worked</th><td>";
    let k = Object.keys(work).sort();
    for (let key in k)
    {
      worker += "<font color='#" + work[k[key]] + "'>" + k[key] + " </font>";
    }
    worker += "</td></tr>";
  }
  if (Object.keys(conf).length > 0)
  {
    worker += "<tr><th style='color:lightgreen'>Confirmed</th><td>";
    let k = Object.keys(conf).sort();
    for (let key in k)
    {
      worker += "<font color='#" + conf[k[key]] + "'>" + k[key] + " </font>";
    }
    worker += "</td></tr>";
  }
  if (lastRow)
  {
    worker += "<tr><th style='color:cyan'>Last QSO</th><td>";
    worker += "<font color='#" + GT.pskColors[list[lastRow].band] + "'>" + list[lastRow].band + "," + list[lastRow].mode + " </font> " + userTimeString(list[lastRow].time * 1000);
    worker += "</td></tr>";
  }

  worker += "<tr><th style='color:orange'>" + GT.dxccToAltName[dxcc] + " (" + GT.dxccInfo[dxcc].pp + ")</th><td>";
  for (let band in GT.colorBands)
  {
    if (String(dxcc) + "|" + GT.colorBands[band] in GT.tracker.worked.dxcc)
    {
      let strike = "";
      if (String(dxcc) + "|" + GT.colorBands[band] in GT.tracker.confirmed.dxcc) { strike = "text-decoration: underline overline;"; }
      worker += "<div style='" + strike + "display:inline-block;color:#" + GT.pskColors[GT.colorBands[band]] + "'>" + GT.colorBands[band] + "</div>&nbsp;";
    }
  }

  worker += "</td></tr></table></div>";
  setLookupDiv("lookupLocalDiv", worker);
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


function addNewOAMSSpot(cid, db, frequency, band, mode)
{
  if (GT.redrawSpotsTimeout !== null)
  {
    nodeTimers.clearTimeout(GT.redrawSpotsTimeout);
    GT.redrawSpotsTimeout = null;
  }

  let report;
  let call = GT.gtFlagPins[cid].call;
  let grid = GT.gtFlagPins[cid].grid.substr(0, 6);
  let hash = call + mode + band;

  if (hash in GT.receptionReports.spots)
  {
    report = GT.receptionReports.spots[hash];
  }
  else
  {
    report = GT.receptionReports.spots[hash] = {};
    report.call = call;
    report.band = band;
    report.grid = grid;
    report.mode = mode;
  }

  report.dxcc = GT.gtFlagPins[cid].dxcc;
  report.when = timeNowSec();
  report.snr = Number(db);
  report.freq = frequency;
  report.color = clamp(parseInt((parseInt(report.snr) + 25) * 9), 0, 255);
  report.source = "O";
  GT.redrawSpotsTimeout = nodeTimers.setTimeout(redrawSpots, 250);
}

function addNewMqttPskSpot(json)
{
  if (json.rl == null || json.rl.length < 4) return;
  // json.rc, json.rl, json.ra, json.rp, json.f, json.b, json.md, json.t
  // call, grid, dxcc, snr, frequency, band, mode, when
  if (GT.redrawSpotsTimeout !== null)
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

  if (hash in GT.receptionReports.spots)
  {
    report = GT.receptionReports.spots[hash];
  }
  else
  {
    report = GT.receptionReports.spots[hash] = {};
    report.call = call;
    report.band = json.b;
    report.grid = json.rl;
    report.mode = json.md;
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
  let shouldSave = false;
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
    report = GT.receptionReports.spots[key];

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
  spotCountDiv.innerHTML = "Spots: " + GT.spotTotalCount;
}

function changeSpotValues()
{
  GT.settings.reception.viewHistoryTimeSec = parseInt(spotHistoryTimeValue.value) * 60;
  spotHistoryTimeTd.innerHTML = "Max Age: " + toDHM(Number(GT.settings.reception.viewHistoryTimeSec));


  GT.settings.reception.mergeSpots = spotMergeValue.checked;

  setTrophyOverlay(GT.currentOverlay);
  if (GT.rosterSpot) goProcessRoster();
}

function mapTransChange()
{
  GT.settings.map.mapTrans = mapTransValue.value;

  mapTransTd.innerHTML = String(100 - parseInt(((GT.settings.map.mapTrans * 255) / 255) * 100)) + "%";
  mapSettingsDiv.style.backgroundColor = "rgba(0,0,0, " + GT.settings.map.mapTrans + ")";
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
  }
  else
  {
    spotPathColorDiv.style.color = "#FFF";
    spotPathColorDiv.style.backgroundColor = pathColor;
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
  }
  else
  {
    spotNightPathColorDiv.style.color = "#FFF";
    spotNightPathColorDiv.style.backgroundColor = pathNightColor;
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
    where = GT.settings.map.predMode == 1 ? "https://tagloomis.com/muf/img/muf.png?" : "https://tagloomis.com/muf/img/fof2.png?";
    where += String(now - (now % 900));
  }
  else if (GT.settings.map.predMode == 3)
  {
    timeOut = (3601 - (now % 3600)) * 1000;
    now = now + (GT.epiTimeValue * 3600);
    now = now - (now % 3600);
    where = "https://tagloomis.com/epi/img/" + now + ".jpg";
  }
  else if (GT.settings.map.predMode == 4)
  {
    timeOut = 361 * 1000;
    where = "https://tagloomis.com/auf/img/auf.png?" + String(now - (now % 360));
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
  GT.settings.map.predMode = (GT.settings.map.predMode + 1) % 5;
  displayPredLayer();
  
}

function predInit()
{
  GT.predViews = Array();
  GT.predViews[1] = { mufTitle, mufBarTr, mufRangeTr };
  GT.predViews[2] = { fof2Title, fof2BarTr, fof2RangeTr }
  GT.predViews[3] = { epiTitle, epiTimeOffsetTr, epiBarTr, epiRangeTr };
  GT.predViews[4] = { aufTitle, aufPercentTr, aufBarTr };
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

    GT.PredLayer = createPredLayer();
    GT.map.addLayer(GT.PredLayer);
    if (oldLayer)
    {
      GT.map.removeLayer(oldLayer);
    }
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
  try
  {
    fs.writeFileSync(filename, JSON.stringify(GT.settings, null, 2), { flush: true });
  }
  catch (e)
  {
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
  let hash = GT.settings.app.myBand + GT.settings.app.myMode;

  if (!(hash in GT.settings.ByBandMode.roster))
  {
    if (GT.activeRoster)
    {
      GT.settings.ByBandMode.roster[hash] = { 
          wanted: { ...GT.activeRoster.wanted },
          logbook: { ...GT.activeRoster.logbook }
        };
    }
    else
    {
      GT.settings.ByBandMode.roster[hash] = { 
        wanted: { ...GT.settings.roster.wanted },
        logbook: { ...GT.settings.roster.logbook }
      };
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

  if (GT.settings.app.wantedByBandMode == false || GT.instanceCount > 1)
  {
    GT.activeRoster = GT.settings.roster;
    GT.activeAudioAlerts = GT.settings.audioAlerts;
  }
  else
  {
    GT.activeRoster = GT.settings.ByBandMode.roster[hash];
    GT.activeAudioAlerts = GT.settings.ByBandMode.audioAlerts[hash];
  }

  for (const key in GT.activeAudioAlerts.wanted)
  {
    if (key in window)
    {
      window[key].checked = GT.activeAudioAlerts.wanted[key];
    }
  }

  setVisualHunting();
}

function downloadWorldVhfActivity()
{
  if (GT.settings.map.offlineMode == false)
  {
    getBuffer(
      "https://tagloomis.com/oams_muf/vhf.json",
      processWorldVhfActivity,
      null,
      "https",
      443
    );
  }

  nodeTimers.setTimeout(downloadWorldVhfActivity, 60000);
}

function processWorldVhfActivity(buffer, flag)
{
  let valid = false;
  try
  {
    GT.worldVhfActivity = JSON.parse(buffer);

    if (GT.worldVhfActivityTimestamp != GT.worldVhfActivity.t)
    {
      GT.worldVhfActivityTimestamp = GT.worldVhfActivity.t;
      valid = true;
    }
  }
  catch (e)
  {

  }

  if (valid)
  {
    nodeTimers.setTimeout(renderWorldBandActivity, 1000);
  }
}

function renderWorldBandActivity()
{
  let paths = {};
  let points = {};
  GT.layerSources.baHeat.clear();
  GT.layerSources.baFlight.clear();

  for (const band in GT.worldVhfActivity.p)
  {
    for (const pipe in GT.worldVhfActivity.p[band])
    {
      const grids = GT.worldVhfActivity.p[band][pipe].split("-");
      // occasionally, we see invalid grids, so rather than test each and every one
      // we'll try/catch
      try
      {
        (grids.length == 1) ? circleFeatureFromPoint(getPoint(grids[0]),
              {
                weight: 1,
                color: "green",
                zIndex: 90
              },
              "baFlight",
              false
            )
            :  flightFeaturePointToPoint([getPoint(grids[0]), getPoint(grids[1])],
              {
                weight: 0.5,
                color: "purple",
                steps: 22,
                zIndex: 90
              },
              "baFlight",
              true
            );
      }
      catch (e)
      {

      }
    }
  }

  for (const band in GT.worldVhfActivity.h)
  {
    for (const grid in GT.worldVhfActivity.h[band])
    {
      // occasionally, we see invalid grids, so rather than test each and every one
      // we'll try/catch
      try
      {
        let toPoint = getPoint(grid);

        let lonLat = new ol.geom.Point(toPoint);

        let pointFeature = new ol.Feature({
          geometry: lonLat,
          weight: GT.worldVhfActivity.h[band][grid] * 0.01
        });

        if (GT.useTransform)
        {
          pointFeature.getGeometry().transform("EPSG:3857", GT.settings.map.projection);
        }

        GT.layerSources.baHeat.addFeature(pointFeature);
      }
      catch (e)
      {

      }
    }
  }
}
