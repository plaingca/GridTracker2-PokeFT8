// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Settings: simple checkbox and slider change handlers (moved from GridTracker2.js)

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

function changeClearOnCQ()
{
  GT.settings.app.clearOnCQ = clearOnCQ.checked; 
}
