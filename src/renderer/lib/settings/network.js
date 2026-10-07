// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Settings: network - WSJT-X UDP port, multicast, UDP forwarding, ADIF broadcast, spotting, off-air services (moved from GridTracker2.js)

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
