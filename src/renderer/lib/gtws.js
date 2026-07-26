// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

GT.chatRecvFunctions = {
  l: gtChatNewList,
  o: gtSpotMessage,
  b: bandActivityReply,
  k: kpIndexMessage,
  a: gtAddCalls,
  d: gtRemoveCalls,
};

const ChatState = {
  none: 100,
  idle: 0,
  connect: 1,
  connecting: 2,
  connected: 3,
  status: 4,
  closed: 5,
  error: 6,
};

GT.gtStateToFunction = {
  100: gtSetIdle,
  0: gtCanConnect,
  1: gtConnectChat,
  2: gtConnecting,
  3: gtChatSendVersion,
  4: gtStatusCheck,
  5: gtInError,
  6: closeGtSocket,
};

GT.oamsDenied = false;
GT.lastConnectAttempt = 0;
GT.gtEngineInterval = null;
GT.gtChatSocket = null;
GT.rtsnPins = {};
GT.rtsnCallsigns = {};
GT.wsStatusTimer = null;
GT.gtState = ChatState.none;
GT.gtNeedUsersList = true;
GT.gtLiveStatusUpdate = false;
GT.oamsBandActivityData = null;
GT.lastGtStatus = "";

function gtConnectChat() {
  if (GT.gtChatSocket != null) {
    GT.gtState = ChatState.error;
    GT.lastGtStatus = "";
    GT.spotCollector = {};
    GT.decodeCollector = {};
    return;
  }

  // Modern Math.floor and Template Literals
  const rnd = Math.floor(Math.random() * 10) + 18470;
  try {
    GT.gtState = ChatState.connecting;
    GT.gtChatSocket = new WebSocket(`ws://oams.space:${rnd}`);
  } catch (e) {
    GT.gtState = ChatState.error;
    return;
  }

  GT.gtChatSocket.onopen = function () {
    GT.gtState = ChatState.connected;
    GT.spotCollector = {};
    GT.decodeCollector = {};
    GT.lastGtStatus = "";
    GT.gtLiveStatusUpdate = true;
  };

  GT.gtChatSocket.onmessage = function (evt) {
    if (!GT.settings.app.offAirServicesEnable) {
      closeGtSocket();
      return;
    }

    try {
      const jsmesg = JSON.parse(evt.data);
 
      if (!jsmesg.t) {
        GT.gtState = ChatState.error;
        return;
      }

      if (jsmesg.t in GT.chatRecvFunctions) {
        GT.chatRecvFunctions[jsmesg.t](jsmesg);
      }
    } catch (err) {
      // bad message, dumping client
      GT.gtState = ChatState.error;
    }
  };

  GT.gtChatSocket.onerror = function () {
    this.close();
    GT.gtChatSocket = null;
    GT.gtState = ChatState.error;
  };

  GT.gtChatSocket.onclose = function () {
    GT.gtChatSocket = null;
    GT.gtState = ChatState.closed;
  };
}

function gtConnecting() {}

function gtInError()
{
  closeGtSocket();
}

function closeGtSocket()
{
  if (GT.gtChatSocket != null)
  {
    GT.gtChatSocket.close();
    GT.gtChatSocket = null;
  }
  
  GT.gtState = ChatState.none;
  GT.lastGtStatus = "";
}


function gtCanConnect()
{
  GT.lastConnectAttempt = timeNowSec();
  GT.gtState = ChatState.connect;
}

function gtSetIdle()
{
  if (timeNowSec() - GT.lastConnectAttempt >= 30)
  {
    GT.gtNeedUsersList = true;
    GT.gtState = ChatState.idle;
    GT.lastGtStatus = "";
  }
}

function gtStatusCheck()
{
  if (GT.gtLiveStatusUpdate)
  {
    GT.gtLiveStatusUpdate = false;
    gtChatSendStatus();
  }
  if (GT.gtNeedUsersList)
  {
    GT.gtNeedUsersList = false;
    gtChatGetList();
  }
}

function sendGtJson(json)
{
  if (GT.settings.app.offAirServicesEnable && GT.gtChatSocket != null)
  {
    if (GT.gtChatSocket.readyState === WebSocket.OPEN) {
      GT.gtChatSocket.send(json);
    } else if (GT.gtChatSocket.readyState === WebSocket.CLOSED) {
      GT.gtState = ChatState.closed;
    }
  }
}

function gtChatSendStatus()
{
  let msg = {
    t: "s",
    i: {}
  };

  for (const instance of Object.values(GT.instances))
  {
    if (GT.settings.app.spottingEnable && instance.open && instance.valid && instance.status && instance.instanceKey && instance.status.Band != "OOB")
    {
      msg.i[instance.instanceHash] = instance.instanceKey;
    }
  }

  msg = JSON.stringify(msg);

  if (GT.wsStatusTimer) 
  {
    nodeTimers.clearTimeout(GT.wsStatusTimer);
    GT.wsStatusTimer = null;
  }

  GT.wsStatusTimer = nodeTimers.setTimeout(sendStatusMessage, 10000, msg);
}

function sendStatusMessage(msg)
{
  if (msg != GT.lastGtStatus)
  {
    sendGtJson(msg);
    GT.lastGtStatus = msg;
  }
  GT.wsStatusTimer = null;
}

function gtChatSendSpots(instancesMap) {
  if (GT.wsStatusTimer != null) return; 

  const payloadInstances = {};

  for (const [instanceHash, spotMap] of Object.entries(instancesMap)) {
    payloadInstances[instanceHash] = Array.from(
      spotMap, 
      ([call, data]) => `${call}|${data}`
    ).join(",");
  }

  sendGtJson(JSON.stringify({ t: "o", i: payloadInstances }));
}

function gtChatSendDecodes(instancesCounts)
{
  // Don't send decodes if have a pending instance change
  if (GT.wsStatusTimer == null)
  {
    sendGtJson(JSON.stringify({ t: "d", i: instancesCounts }));
  }
}

function oamsBandActivityCheck()
{
  if (GT.settings.app.oamsBandActivity && GT.settings.app.myGrid.length >= 4)
  {
    let grid = GT.settings.app.myGrid.substring(0, 4).toUpperCase();
    if (GT.settings.app.oamsBandActivityNeighbors)
    {
      gtChatSendBandActivityRequest(squareToNeighbors(grid));
    }
    else
    {
      gtChatSendBandActivityRequest([grid]);
    }
  }
}

function gtChatSendBandActivityRequest(gridArray)
{
  let msg = { t: "b", g: gridArray };
  sendGtJson(JSON.stringify(msg));
}

function bandActivityReply(jsmesg)
{
  GT.oamsBandActivityData = jsmesg.r;
  renderBandActivity();
}

function kpIndexMessage(jsmesg)
{
  handleKpIndexJSON(jsmesg.i);
}

function oamsDisable(jsmesg)
{
  // Denied access from OAMS
  // Do not attempt to connect again this session
  GT.oamsDenied = true;
  closeGtSocket();
}

function gtAddCalls(jsmesg)
{

  const callkeys = jsmesg.c.split(",");

 for (const cid of callkeys) {
    if (!(cid in GT.rtsnPins)) {
      addNewCall(cid);
    }
  }
}

function gtRemoveCalls(jsmesg) {

  const gtFlagsLayer = GT.layerSources.gtflags;
  const rtsnPins = GT.rtsnPins;
  const rtsnCallsigns = GT.rtsnCallsigns;

  const callkeys = jsmesg.c.split(",");
  
  for (const cid of callkeys) {
    const pinObj = rtsnPins[cid];
    if (!pinObj) continue;

    if (pinObj.pin && gtFlagsLayer.hasFeature(pinObj.pin)) {
      gtFlagsLayer.removeFeature(pinObj.pin);
    }
    pinObj.pin = null;


    const call = pinObj.call;
    if (rtsnCallsigns[call]) {
      delete rtsnCallsigns[call][cid]; // Delete the specific CID first
      
      // If no more CIDs exist for this call, delete the call itself
      if (Object.keys(rtsnCallsigns[call]).length === 0) {
        delete rtsnCallsigns[call];
      }
    }

    delete GT.rtsnPins[cid];
  }
}

function gtChatGetList()
{
  sendGtJson(JSON.stringify({t: "l"}));
}

function redrawPins()
{
  clearGtFlags();

  const features = [];

  for (const cid in GT.rtsnPins)
  {
    const pinObj = GT.rtsnPins[cid];

    pinObj.pin = null;
    makeGtPin(pinObj);

    if (pinObj.pin != null)
    {
      features.push(pinObj.pin);
    }
  }

  if (features.length > 0)
  {
    GT.layerSources.gtflags.addFeatures(features);
  }
}

function makeGtPin(obj) {
  try {
    if (obj.pin) {
      if (GT.layerSources.gtflags.hasFeature(obj.pin)) {
        GT.layerSources.gtflags.removeFeature(obj.pin);
      }
      obj.pin = null;
    }
        
    if (!obj.grid || (obj.grid.length !== 4 && obj.grid.length !== 6)) return;
    if (validateGridFromString(obj.grid) === false) return;
    if (!validateMapBandAndMode(obj.band, obj.mode)) return;

    let LL = squareToCenter(obj.grid);
    obj.pin = iconFeature(ol.proj.fromLonLat([LL.o, LL.a]), GT.gtFlagIcon, 100, "gtFlag");
    obj.pin.key = obj.cid;
    obj.pin.isGtFlag = true;
    obj.pin.size = 1;
  } catch (e) {
    console.error(`Failed to make GT Pin for ${obj?.cid}:`, e); 
  }
}

class PinData {
  constructor(call, band, mode, grid, cid, dxcc, fCall) {
    this.pin = null; 
    this.call = call;
    this.fCall = fCall;
    this.grid = grid;
    this.freq = 0;       // SMI (Small Integer)
    this.band = band;
    this.mode = mode;
    this.cid = cid;
    this.dxcc = dxcc;
  }
}

function addNewCall(cid) {
  const parts = cid.split("|");
  const call = parts[0];

  const fCall = formatCallsign(call);
  const dxcc = callsignToDxcc(call);

  const pinData = new PinData(
    call, 
    parts[1], 
    parts[2], 
    parts[3], 
    cid, 
    dxcc, 
    fCall
  );

  GT.rtsnPins[cid] = pinData;

  // 5. Caching the dictionary lookup.
  // When objects are used as Maps, V8 downgrades them to "Dictionary Mode" (Hash Maps).
  // Lookups in Dictionary Mode are slower, so we look it up exactly once.
  let callDict = GT.rtsnCallsigns[call];
  if (callDict === undefined) {
    callDict = {};
    GT.rtsnCallsigns[call] = callDict;
  }
  callDict[cid] = true;

  makeGtPin(pinData);

  // 6. Strict null check instead of Truthy check.
  // `if (pinData.pin)` requires V8 to perform type coercion.
  // `!== null` is a direct memory pointer comparison. It is faster.
  if (pinData.pin !== null) {
    GT.layerSources.gtflags.addFeature(pinData.pin);
  }
}

function gtChatNewList(jsmesg)
{
  clearGtFlags();

  // starting clean if we're getting a new chat list
  GT.rtsnPins = {}
  GT.rtsnCallsigns = {};

  const callkeys = jsmesg.c.split(",");

  for (const cid of callkeys)
  {
    addNewCall(cid);
  }

  oamsBandActivityCheck();
}


function htmlEntities(str)
{
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sendSimplePushMessage(jsmesg)
{
  const url = "https://api.simplepush.io/send";
  let data = {
    key: GT.settings.msg.msgSimplepushApiKey,
    title: "GT Test - " + formatCallsign(GT.settings.app.myCall),
    msg: formatCallsign(jsmesg.call) + ": " + jsmesg.msg
  };
  getPostBuffer(
    url,
    null, // callback,
    null,
    "https",
    443,
    data,
    5000
  );
}

function sendPushOverMessage(jsmesg, test = false)
{
  const url = "https://api.pushover.net/1/messages.json";
  let data = {
    user: GT.settings.msg.msgPushoverUserKey,
    token: GT.settings.msg.msgPushoverToken,
    title:
        "GT Test - " + formatCallsign(GT.settings.app.myCall),
    message: formatCallsign(jsmesg.call) + ": " + jsmesg.msg
  };
  getPostBuffer(
    url,
    PushoverReply, // callback,
    test,
    "https",
    443,
    data,
    5000 // timeoutMs,
  );
}

function PushoverReply(data, isTest)
{
  if (isTest)
  {
    let result = "Unknown Error";
    let color = "#F00";
    let responseJson = JSON.parse(data);

    if (typeof responseJson != "undefined" && typeof responseJson.status != "undefined")
    {
      if (responseJson.status == 1)
      {
        // {"status":1,"request":"1d5ace84-c2e4-4b19-a051-5ac4c9671170"}
        color = "#FFF";
        result = "Passed!";
      }
      else if (responseJson.status == 0)
      {
        color = "#FF0";
        if (typeof responseJson.user != "undefined")
        {
          // {"user":"invalid","errors":["user identifier is not a valid user, group, or subscribed user key, see https://pushover.net/api#identifiers"],"status":0,"request":"3ef45ac6-38d6-47db-b7aa-7731e8ac0fcb"}
          result = "User Key Invalid";
        }
        else if (typeof responseJson.token != "undefined")
        {
          //  {"token":"invalid","errors":["application token is invalid, see https://pushover.net/api"],"status":0,"request":"10629fe4-1e37-4c0f-a123-4585a3fb2aea"}
          result = "API Token Invalid";
        }
        else
        {
          result = "Unknown Response";
        }
      }
      else
      {
        result = "Unknown Status";
      }
    }

    pushOverTestResultsDiv.innerHTML = result;
    pushOverTestResultsDiv.style.color = color;
  }
}

function gtChatSendVersion()
{
  sendGtJson(JSON.stringify({t: "v", v: gtVersion, p: GT.platform}));
  GT.gtState = ChatState.status;
}


GT.getEngineWasRunning = false;

function gtChatStateMachine()
{
  if (GT.settings.app.offAirServicesEnable && !GT.settings.map.offlineMode && GT.settings.app.myCall.length > 2 && GT.settings.app.myCall != "NOCALL" && !GT.oamsDenied)
  {
    GT.gtStateToFunction[GT.gtState]();
    GT.getEngineWasRunning = true;
  }
  else
  {
    if (GT.getEngineWasRunning)
    {
      GT.getEngineWasRunning = false;
      closeGtSocket();
      GT.lastGtStatus = "";
    }
  }
}

function gtSpotMessage(jsmesg)
{
  if ("O" in jsmesg)
  {
    const parts = jsmesg.O.split("|");
    if (parts.length == 5)
    {
      addNewRTSNSpot(parts);
    }
  }
}

function gtChatSystemInit()
{
  GT.lastConnectAttempt = timeNowSec() - 25;
  GT.gtEngineInterval = nodeTimers.setInterval(gtChatStateMachine, 1333);
}

function showGtFlags()
{
  if (GT.settings.app.gtFlagImgSrc > 0)
  {
    if (!GT.settings.map.offlineMode)
    {
      redrawPins();
      GT.layerVectors.gtflags.setVisible(true);
    }
    else
    {
      GT.layerVectors.gtflags.setVisible(false);
    }
  }
  else GT.layerVectors.gtflags.setVisible(false);
}

function clearGtFlags()
{
  GT.layerSources.gtflags.clear();
}

function toggleGtMap()
{
  GT.settings.app.gtFlagImgSrc += 1;
  GT.settings.app.gtFlagImgSrc %= 2;
  gtFlagImg.src = GT.gtFlagImageArray[GT.settings.app.gtFlagImgSrc];
  if (GT.spotView > 0 && !GT.settings.reception.mergeSpots) return;
  if (GT.settings.app.gtFlagImgSrc > 0)
  {
    redrawPins();
    GT.layerVectors.gtflags.setVisible(true);
  }
  else
  {
    GT.layerVectors.gtflags.setVisible(false);
  }
}
