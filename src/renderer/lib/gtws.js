// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

GT.lastConnectAttempt = 0;
GT.gtEngineInterval = null;
GT.chatRecvFunctions = {
  uuid: gtChatSetUUID,
  list: gtChatNewList,
  info: gtChatUpdateCall,
  drop: gtChatRemoveCall,
  o: gtSpotMessage,
  ba: bandActivityReply,
  Kp: kpIndexMessage,
  denied: oamsDisable
};

GT.oamsDenied = false;

const ChatState = {
  none: 100,
  idle: 0,
  connect: 1,
  connecting: 2,
  connected: 3,
  status: 4,
  closed: 5,
  error: 6,
  waitUUID: 7
};


GT.gtStateToFunction = {
  100: gtSetIdle,
  0: gtCanConnect,
  1: gtConnectChat,
  2: gtConnecting,
  3: gtChatSendUUID,
  4: gtStatusCheck,
  5: gtInError,
  6: gtClosedSocket,
  7: gtWaitUUID
};

GT.gtChatSocket = null;
GT.gtFlagPins = Object();
GT.gtCallsigns = Object();


GT.gtState = ChatState.none;
GT.gtStatusCount = 0;
GT.gtStatusTime = 500;
GT.gtNeedUsersList = true;
GT.gtUuidValid = false;

GT.gtLiveStatusUpdate = false;
GT.oamsBandActivityData = null;

GT.myChatId = 0;

GT.gtCurrentMessageCount = 0;

function gtConnectChat()
{
  if (GT.gtChatSocket != null)
  {
    // we should start over
    GT.gtState = ChatState.error;
    return;
  }

  let rnd = parseInt(Math.random() * 10) + 18360;
  try
  {
    GT.gtState = ChatState.connecting;
    GT.gtChatSocket = new WebSocket("ws://oams.space:" + rnd);
  }
  catch (e)
  {
    GT.gtState = ChatState.error;
    return;
  }

  GT.gtChatSocket.onopen = function ()
  {
    GT.gtState = ChatState.connected;
  };

  GT.gtChatSocket.onmessage = function (evt)
  {
    if (GT.settings.app.offAirServicesEnable == true)
    {
      let jsmesg = false;
      try
      {
        jsmesg = JSON.parse(evt.data);
      }
      catch (err)
      {
        // bad message, dumping client
        GT.gtState = ChatState.error;
        return;
      }
      if (!("type" in jsmesg))
      {
        GT.gtState = ChatState.error;
        return;
      }

      if (jsmesg.type in GT.chatRecvFunctions)
      {
        GT.chatRecvFunctions[jsmesg.type](jsmesg);
      }
      else
      {
        // Not fatal!
        // console.log("Unknown oams message '" + jsmesg.type + "' ignoring");
      }
    }
  };

  GT.gtChatSocket.onerror = function ()
  {
    this.close();
    GT.gtChatSocket = null;
    GT.gtState = ChatState.error;
  };

  GT.gtChatSocket.onclose = function ()
  {
    GT.gtChatSocket = null;
    GT.gtState = ChatState.closed;
  };
}

function gtConnecting() {}

function gtInError()
{
  closeGtSocket();
}

function gtChatSendClose()
{
  let msg = Object();
  msg.type = "close";
  msg.uuid = GT.settings.app.chatUUID;

  sendGtJson(JSON.stringify(msg));
}

function closeGtSocket()
{
  if (GT.gtChatSocket != null)
  {
    gtChatSendClose();

    GT.gtChatSocket.close();
    GT.gtChatSocket = null;
  }
  
  GT.gtState = ChatState.none;
}

function gtClosedSocket()
{
  if (GT.gtChatSocket != null)
  {
    GT.gtChatSocket.close();
    GT.gtChatSocket = null;
  }
  GT.gtState = ChatState.none;
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
    GT.gtStatusCount = 0;
    GT.gtNeedUsersList = true;
    GT.gtState = ChatState.idle;
    GT.lastGtStatus = "";
  }
  GT.gtUuidValid = false;
}

function gtStatusCheck()
{
  if (GT.gtStatusCount > 0)
  {
    GT.gtStatusCount--;
  }
  if (GT.gtStatusCount < 1 || GT.gtLiveStatusUpdate == true)
  {
    if (GT.gtLiveStatusUpdate == true)
    {
      GT.gtLiveStatusUpdate = false;
    }
    else
    {
      GT.lastGtStatus = "";
      GT.gtStatusCount = GT.gtStatusTime;
    }
    gtChatSendStatus();
  }
  if (GT.gtNeedUsersList == true)
  {
    GT.gtNeedUsersList = false;
    gtChatGetList();
  }
}

function sendGtJson(json, isUUIDrequest = false)
{
  if (GT.settings.app.offAirServicesEnable == true && GT.gtChatSocket != null)
  {
    if (GT.gtChatSocket.readyState == WebSocket.OPEN && (isUUIDrequest || GT.gtUuidValid))
    {
      GT.gtChatSocket.send(json);
    }
    else
    {
      if (GT.gtChatSocket.readyState == WebSocket.CLOSED)
      {
        GT.gtState = ChatState.closed;
      }
    }
  }
}

GT.lastGtStatus = "";

function gtChatSendStatus()
{
  let msg = Object();
  msg.type = "status";
  msg.uuid = GT.settings.app.chatUUID;

  msg.call = GT.settings.app.myCall;
  msg.grid = GT.settings.app.myRawGrid;
  msg.freq = GT.settings.app.myRawFreq;
  msg.mode = GT.settings.app.myMode;
  msg.band = GT.settings.app.myBand;
  msg.src = "GT";
  msg.canmsg = false;
  msg.o = GT.settings.app.spottingEnable == true ? 1 : 0;
  msg = JSON.stringify(msg);

  if (msg != GT.lastGtStatus)
  {
    sendGtJson(msg);
    GT.lastGtStatus = msg;
  }
}

function gtChatSendSpots(spotsObject, detailsObject)
{
  let msg = Object();
  msg.type = "o";
  msg.uuid = GT.settings.app.chatUUID;
  msg.o = spotsObject;
  msg.d = detailsObject;

  sendGtJson(JSON.stringify(msg));
}

function gtChatSendDecodes(instancesObject)
{
  let msg = Object();
  msg.type = "d";
  msg.uuid = GT.settings.app.chatUUID;
  msg.i = instancesObject;
  sendGtJson(JSON.stringify(msg));
}

function oamsBandActivityCheck()
{
  if (GT.settings.app.oamsBandActivity == true && GT.settings.app.myGrid.length >= 4)
  {
    let grid = GT.settings.app.myGrid.substring(0, 4).toUpperCase();
    if (GT.settings.app.oamsBandActivityNeighbors == true)
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
  let msg = Object();
  msg.type = "ba";
  msg.uuid = GT.settings.app.chatUUID;
  msg.ga = gridArray;
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

function gtChatRemoveCall(jsmesg)
{
  let id = jsmesg.id;
  let cid = jsmesg.cid;

  if (cid in GT.gtFlagPins)
  {
    if (id in GT.gtFlagPins[cid].ids)
    {
      delete GT.gtFlagPins[cid].ids[id];
    }
    
    if (Object.keys(GT.gtFlagPins[cid].ids).length == 0)
    {
      delete GT.gtCallsigns[GT.gtFlagPins[cid].call][cid];

      if (GT.gtFlagPins[cid].pin != null)
      {
        // remove pin from map here
        if (GT.layerSources.gtflags.hasFeature(GT.gtFlagPins[cid].pin))
        { GT.layerSources.gtflags.removeFeature(GT.gtFlagPins[cid].pin); }
        delete GT.gtFlagPins[cid].pin;
        GT.gtFlagPins[cid].pin = null;
      }
      GT.gtFlagPins[cid].live = false;

      if (Object.keys(GT.gtCallsigns[GT.gtFlagPins[cid].call]).length == 0)
      {
        delete GT.gtCallsigns[GT.gtFlagPins[cid].call];
      }
      delete GT.gtFlagPins[cid];    
    }
  }
}

function gtChatUpdateCall(jsmesg)
{
  let id = jsmesg.id;
  let cid = jsmesg.cid;

  if (cid in GT.gtFlagPins)
  {
    GT.gtFlagPins[cid].ids[id] = true;
    // Did they move grid location?
    if (jsmesg.grid != GT.gtFlagPins[cid].grid && GT.gtFlagPins[cid].pin != null)
    {
      // remove pin from map here
      if (GT.layerSources.gtflags.hasFeature(GT.gtFlagPins[cid].pin))
      { GT.layerSources.gtflags.removeFeature(GT.gtFlagPins[cid].pin); }
      delete GT.gtFlagPins[cid].pin;
      GT.gtFlagPins[cid].pin = null;
    }
    // Changed callsign?
    if (GT.gtFlagPins[cid].call != jsmesg.call)
    {
      delete GT.gtCallsigns[GT.gtFlagPins[cid].call][cid];
    }
  }
  else
  {
    GT.gtFlagPins[cid] = Object();
    GT.gtFlagPins[cid].pin = null;
    GT.gtFlagPins[cid].ids = Object();
    GT.gtFlagPins[cid].ids[id] = true;
  }

  GT.gtFlagPins[cid].cid = jsmesg.cid;
  GT.gtFlagPins[cid].call = jsmesg.call;
  GT.gtFlagPins[cid].fCall = formatCallsign(jsmesg.call);
  GT.gtFlagPins[cid].grid = jsmesg.grid;
  GT.gtFlagPins[cid].freq = jsmesg.freq;
  GT.gtFlagPins[cid].band = jsmesg.band;
  GT.gtFlagPins[cid].mode = jsmesg.mode;
  GT.gtFlagPins[cid].src = jsmesg.src;

  GT.gtFlagPins[cid].o = jsmesg.o;
  GT.gtFlagPins[cid].dxcc = callsignToDxcc(jsmesg.call);
  GT.gtFlagPins[cid].live = true;
  // Make a pin here
  if (GT.gtFlagPins[cid].pin == null)
  {
    makeGtPin(GT.gtFlagPins[cid]);
    if (GT.gtFlagPins[cid].pin != null)
    {
      GT.layerSources.gtflags.addFeature(GT.gtFlagPins[cid].pin);
    }
  }

  if (!(GT.gtFlagPins[cid].call in GT.gtCallsigns))
  {
    // Can happen when a user changes callsign
    GT.gtCallsigns[GT.gtFlagPins[cid].call] = {};
  }
  GT.gtCallsigns[GT.gtFlagPins[cid].call][cid] = true;

}

function gtChatGetList()
{
  let msg = Object();
  msg.type = "list";
  msg.uuid = GT.settings.app.chatUUID;

  sendGtJson(JSON.stringify(msg));
}

function redrawPins()
{
  clearGtFlags();

  const features = [];

  for (const cid in GT.gtFlagPins)
  {
    const pinObj = GT.gtFlagPins[cid];

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

function makeGtPin(obj)
{
  try
  {
    if (obj.pin)
    {
      if (GT.layerSources.gtflags.hasFeature(obj.pin))
      {
        GT.layerSources.gtflags.removeFeature(obj.pin);
      }
      delete obj.pin;
      obj.pin = null;
    }
    
    if (obj.src != "GT") return;
    
    if (typeof obj.grid == "undefined" || obj.grid == null) return;

    if (obj.grid.length != 4 && obj.grid.length != 6) return;

    if (validateGridFromString(obj.grid) == false) return;

    if (!validateMapBandAndMode(obj.band, obj.mode))
    {
      return;
    }

    let LL = squareToCenter(obj.grid);
    obj.pin = iconFeature(ol.proj.fromLonLat([LL.o, LL.a]), GT.gtFlagIcon, 100, "gtFlag");
    obj.pin.key = obj.cid;
    obj.pin.isGtFlag = true;
    obj.pin.size = 1;
  }
  catch (e) {}
}

function gtChatNewList(jsmesg)
{
  clearGtFlags();

  // starting clean if we're getting a new chat list
  GT.gtFlagPins = Object()
  GT.gtCallsigns = Object();


  for (let key in jsmesg.data.calls)
  {
    let cid = jsmesg.data.cid[key];
    let id = jsmesg.data.id[key];
    if (id != GT.myChatId)
    {
      if (cid in GT.gtFlagPins)
      {
        GT.gtFlagPins[cid].ids[id] = true;
      }
      else
      {
        GT.gtFlagPins[cid] = Object();
        GT.gtFlagPins[cid].ids = Object();
        GT.gtFlagPins[cid].ids[id] = true;
        GT.gtFlagPins[cid].pin = null;
      }

      GT.gtFlagPins[cid].call = jsmesg.data.calls[key];
      GT.gtFlagPins[cid].fCall = formatCallsign(GT.gtFlagPins[cid].call);
      GT.gtFlagPins[cid].grid = jsmesg.data.grid[key];
      GT.gtFlagPins[cid].freq = jsmesg.data.freq[key];
      GT.gtFlagPins[cid].band = jsmesg.data.band[key];
      GT.gtFlagPins[cid].mode = jsmesg.data.mode[key];
      GT.gtFlagPins[cid].src = jsmesg.data.src[key];
      GT.gtFlagPins[cid].cid = cid;

      GT.gtFlagPins[cid].o = jsmesg.data.o[key];
      GT.gtFlagPins[cid].dxcc = callsignToDxcc(GT.gtFlagPins[cid].call);
      GT.gtFlagPins[cid].live = true;

      if (!(GT.gtFlagPins[cid].call in GT.gtCallsigns))
      {
        GT.gtCallsigns[GT.gtFlagPins[cid].call] = Object();
      }

      GT.gtCallsigns[GT.gtFlagPins[cid].call][cid] = true;

      makeGtPin(GT.gtFlagPins[cid]);

      if (GT.gtFlagPins[cid].pin != null)
      {
        GT.layerSources.gtflags.addFeature(GT.gtFlagPins[cid].pin);
      }
    }
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

function gtChatSendUUID()
{
  let msg = Object();
  msg.type = "uuid";
  if (GT.settings.app.chatUUID != "")
  {
    msg.uuid = GT.settings.app.chatUUID;
  }
  else
  {
    msg.uuid = null;
  }

  msg.call = GT.settings.app.myCall;
  msg.ver = "v" + gtVersionStr;

  sendGtJson(JSON.stringify(msg), true);
  GT.gtState = ChatState.waitUUID;
}

function gtWaitUUID()
{
  // console.log("waiting for UUID from OAMS");
}

function gtChatSetUUID(jsmesg)
{
  GT.settings.app.chatUUID = jsmesg.uuid;
  GT.myChatId = jsmesg.id;

  GT.gtUuidValid = true;
  gtChatSendStatus();
  GT.gtLiveStatusUpdate = false;
  GT.gtStatusCount = GT.gtStatusTime;
  GT.gtState = ChatState.status;
}

GT.getEngineWasRunning = false;

function gtChatStateMachine()
{
  if (GT.settings.app.offAirServicesEnable == true && GT.settings.map.offlineMode == false && GT.settings.app.myCall.length > 2 && GT.settings.app.myCall != "NOCALL" && GT.oamsDenied == false)
  {
    GT.gtStateToFunction[GT.gtState]();
    GT.getEngineWasRunning = true;
  }
  else
  {
    if (GT.getEngineWasRunning == true)
    {
      GT.getEngineWasRunning = false;
      closeGtSocket();
      GT.lastGtStatus = "";
    }
  }
}

function gtSpotMessage(jsmesg)
{
  if (jsmesg.cid in GT.gtFlagPins)
  {
    let frequency, band, mode;
    if (jsmesg.ex != null)
    {
      frequency = Number(jsmesg.ex[0]);
      band = formatBand(Number(frequency / 1000000));
      mode = String(jsmesg.ex[1]).toUpperCase();
    }
    else
    {
      frequency = GT.gtFlagPins[jsmesg.cid].freq;
      band = GT.gtFlagPins[jsmesg.cid].band;
      mode = GT.gtFlagPins[jsmesg.cid].mode;
    }

    if (isNaN(frequency)) return;

    addNewOAMSSpot(jsmesg.cid, jsmesg.db, frequency, band, mode);
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
    if (GT.settings.map.offlineMode == false)
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
  if (GT.spotView > 0 && GT.settings.reception.mergeSpots == false) return;
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
