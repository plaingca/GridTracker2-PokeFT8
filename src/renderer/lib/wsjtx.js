// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// WSJT-X / JTDX message processing: decodes, status, QSO logging, and commands sent back to WSJT-X
// (moved from GridTracker2.js; the UDP socket itself is in wsjtxUdp.js)

// Used by finalWsjtxDecode: the seconds that start an "even" FT8/FT4 period, and a 4-character grid
const kIsEven = {
  FT8: { "00": 1, "30": 1 },
  FT4: { "00": 1, "15": 1, "30": 1, "45": 1 }
}

const REGEX_GRID_4 = /^[A-R]{2}[0-9]{2}$/; 

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
      setRig(GT.callRoster[thisCall].message.instance);
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
    if (GT.activeInstance && GT.instances[GT.activeInstance].valid && GT.instances[GT.activeInstance].remote)
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

  if (DXcall.length > 0)
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

  // Cache these to avoid repeated property lookups on newMessage
  const band = newMessage.OB;
  const mode = newMessage.OM;

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
    let rtsnHadGrid = false;
    let spotHadGrid = false;

    const hash = msgDEcallsign + band + mode;

    const liveCall = GT.liveCallsigns[hash];
    if (liveCall !== undefined) {
      callsign = liveCall;
      if (theirQTH === "" && callsign.grid.length > 0) {
        theirQTH = callsign.grid;
        validQTH = true;
        decodeHadGrid = true;
      }
    }

    if (theirQTH === "") {
      // RTSN member, no spot required, we know them and their grid
      const callDict = GT.rtsnCallsigns[msgDEcallsign];
      if (callDict !== undefined) {
        for (const cid in callDict) {
          const entry = GT.rtsnPins[cid];
          if (entry.band === band && entry.mode === mode) {
            theirQTH = entry.grid.substring(0, 4);
            validQTH = true;
            rtsnHadGrid = true;
            break; 
          }
        }
      }
    }

    if (theirQTH == "")
    {
      // PSK-MQTT fallback check
      const spotHash = msgDEcallsign + mode + band;
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
        (GT.settings.app.gtBandFilter == "auto" && band == GT.settings.app.myBand) ||
        band == GT.settings.app.gtBandFilter) &&
      (GT.settings.app.gtModeFilter.length == 0 ||
        (GT.settings.app.gtModeFilter == "auto" && mode == GT.settings.app.myMode) ||
        mode == GT.settings.app.gtModeFilter ||
        GT.settings.app.gtModeFilter == "Digital")
    )
    {
      qthToBox(theirQTH, msgDEcallsign, CQ, false, msgDXcallsign, band, null, hash, true);
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
        mode,        // mode
        band,        // band
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
        if (decodeHadGrid || rtsnHadGrid || spotHadGrid) callsign.gridQualified = true;
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

    callsign.mode = mode;
    callsign.band = band;
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
          if (GT.rtsnCallsigns[call] !== undefined) {
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
          if (callsign.DXcall + band + mode in GT.liveCallsigns)
          {
            DEcallsign = GT.liveCallsigns[callsign.DXcall + band + mode];
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

  GT.lastMessages.unshift(`
    <tr style='background-color:${bgColor}'>
      <td style='color:lightblue'>${userTimeString(theTimeStamp * 1000)}</td>
      <td style='color:orange'>${newMessage.SR}</td>
      <td style='color:gray'>${newMessage.DT.toFixed(1)}</td>
      <td style='color:lightgreen'>${newF}</td>
      <td>${mode}</td>
      <td style='color:${CQ ? "cyan" : "white"}'>${htmlEntities(theMessage)}</td>
      <td style='color:yellow'>${countryName}</td>
    </tr>
  `);

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

  const mode = "WSPR";
  const band = formatBand(Number(newMessage.Frequency / 1000000));
  const hash = callsign + band + mode;
  let callsignRecord = null;
   
  if (hash in GT.liveCallsigns) callsignRecord = GT.liveCallsigns[hash];

  checkAlerts(callsign, newMessage.Grid, newMessage.Callsign + " " + newMessage.Grid, callsignRecord, band, mode);

  updateCountStats();
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

function updateLastMsgTimeDiv(id)
{
  lastMsgTimeDiv.innerHTML = I18N("gt.newMesg.Recvd") + " " + id;
  GT.lastTimeSinceMessageInSeconds = GT.timeNow;
  GT.updateLastMsgTimer = null;
}

function startGenMessages(call, grid, instance = null)
{
  if (call == "-") return;
  if (grid == "-") grid = "";

  setCallAndGrid(call, grid, instance);
}

// Live callsigns heard from WSJT-X/JTDX and the session callsign list (moved from GridTracker2.js)

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

function compareCallsignTime(a, b)
{
  return a.time - b.time;
}

function updateLiveDistance(callsign)
{
  if (!callsign.grid) return;
  const LL = squareToCenter(callsign.grid);
  callsign.distance = MyCircle.distance(GT.myLat, GT.myLon, LL.a, LL.o);
  callsign.heading = MyCircle.bearing(GT.myLat, GT.myLon, LL.a, LL.o);
}

function liveHash(call, band, mode)
{
  return call + band + mode;
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
