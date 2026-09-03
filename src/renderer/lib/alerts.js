// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.
GT.phonetics = {};
GT.enums = {};
GT.audioPool = new Map();

function loadAlerts()
{
  logEventMedia.value = GT.settings.app.logEventMedia;

  loadAudioAlertSettings();
  alertTypeChanged();
}

function newLogEventSetting(obj)
{
  GT.settings.app.logEventMedia = obj.value;
}

function setAudioView()
{
  speechVolume.value = GT.settings.audio.speechVolume;
  speechPitch.value = GT.settings.audio.speechPitch;
  speechRate.value = GT.settings.audio.speechRate;
  speechPhonetics.checked = GT.settings.audio.speechPhonetics;

  speechVolumeTd.innerText = speechVolume.value;
  speechPitchTd.innerText = speechPitch.value;
  speechRateTd.innerText = speechRate.value;

  audioVolume.value = GT.settings.audio.volume;
  audioVolumeTd.innerText = parseInt(audioVolume.value * 100) + "%";
}

GT.testAudioTimer = null;

function changeAudioValues()
{
  if (GT.testAudioTimer) nodeTimers.clearTimeout(GT.testAudioTimer);

  GT.settings.audio.volume = audioVolume.value;
  audioVolumeTd.innerText = parseInt(audioVolume.value * 100) + "%";

  GT.testAudioTimer = nodeTimers.setTimeout(playTestFile, 200);
}

function playTestFile()
{
  playAlertMediaFile("Sysenter-7.mp3");
}

function changeSpeechValues()
{
  if (GT.speechAvailable) window.speechSynthesis.cancel();

  GT.settings.audio.speechVolume = speechVolume.value;
  GT.settings.audio.speechPitch = speechPitch.value;
  GT.settings.audio.speechRate = speechRate.value;
  GT.settings.audio.speechPhonetics = speechPhonetics.checked;

  speechVolumeTd.innerText = speechVolume.value;
  speechPitchTd.innerText = speechPitch.value;
  speechRateTd.innerText = speechRate.value; 

  speakAlertString("Audio Test", "CQ 73");
}

function addNewAlert()
{
  var error = "<font color='green'>Added</font>";
  var valid = true;
  var filename = "";
  var shortname = "";
  if (alertNotifySelect.value == 0)
  {
    if (alertMediaSelect.value == "none")
    {
      valid = false;
      error = I18N("alerts.addNew.SelectFile");
    }
    else
    {
      filename = alertMediaSelect.value;
      shortname = alertMediaSelect.selectedOptions[0].innerText;
    }
  }
  if (valid)
  {
    if (alertTypeSelect.value == 0 || alertTypeSelect.value == 5)
    {
      valid = ValidateCallsign(alertValueInput, null);
      if (!valid)
      {
        error = "Invalid Callsign";
      }
    }
  }
  if (valid)
  {
    valid = addAlert(
      alertValueInput.value,
      alertTypeSelect.value,
      alertNotifySelect.value,
      alertRepeatSelect.value,
      filename,
      shortname
    );
    if (!valid)
    {
      error = "Duplicate!";
    }
  }
  addError.innerHTML = error;
  displayCustomAlerts();
}

function addAlert(value, type, notify, repeat, filename, shortname)
{
  var newKey = unique(value + type + notify + repeat + filename);

  if (!(newKey in GT.activeCustomAlerts))
  {
    // Use Object Literal for V8 optimization
    const alertItem = {
      value: value,
      type: parseInt(type),
      notify: parseInt(notify),
      repeat: parseInt(repeat),
      filename: filename,
      shortname: shortname,
      lastMessage: "",
      lastTime: 0,
      fired: 0,
      needAck: 0,
      regexObj: null // Placeholder for pre-compiled regex
    };

    // Pre-compile Regex if type is 6 so we don't do it in the decode loop!
    if (alertItem.type === 6) {
      try {
        alertItem.regexObj = new RegExp(value, 'i');
      } catch (e) {
        console.error("Invalid regex in alerts:", value);
      }
    }

    GT.activeCustomAlerts[newKey] = alertItem;
    return true;
  }
  return false; // we have this alert already
}


function deleteAlert(key)
{
  delete GT.activeCustomAlerts[key];
  displayCustomAlerts();
}

function resetAlert(key)
{
  GT.activeCustomAlerts[key].lastMessage = "";
  GT.activeCustomAlerts[key].lastTime = 0;
  GT.activeCustomAlerts[key].fired = 0;
  GT.activeCustomAlerts[key].needAck = 0;
  displayCustomAlerts();
}

function processCustomAlertMessage(decodeWords, message, band, mode)
{
  if (!hasAnyKeys(GT.activeCustomAlerts))
  {
    // no alerts, don't bother
    return false;
  }
  else
  {
    var CQ = false;
    var validQTH = false;
    var theirGrid = null;
    var msgDEcallsign = "";
    var found_callsign = null;

    // Grab the last word in the decoded message
    var grid = decodeWords[decodeWords.length - 1].trim();
    // One single Regex checks the exact 4-char pattern (e.g. EM12)
    if (/^[A-R]{2}[0-9]{2}$/.test(grid)) 
    {
      if (grid !== "RR73") 
      {
        theirGrid = grid;
        validQTH = true;
      } 
      else 
      {
        validQTH = false;
      }
    }

    if (validQTH) msgDEcallsign = decodeWords[decodeWords.length - 2].trim();
    if (validQTH == false && decodeWords.length == 3)
    { msgDEcallsign = decodeWords[decodeWords.length - 2].trim(); }
    if (validQTH == false && decodeWords.length == 2)
    { msgDEcallsign = decodeWords[decodeWords.length - 1].trim(); }
    if (decodeWords[0] == "CQ")
    {
      CQ = true;
    }
    if (decodeWords.length >= 3 && CQ == true && validQTH == false)
    {
      if (validateNumAndLetter(decodeWords[decodeWords.length - 1].trim()))
      { msgDEcallsign = decodeWords[decodeWords.length - 1].trim(); }
      else msgDEcallsign = decodeWords[decodeWords.length - 2].trim();
    }

    if (decodeWords.length >= 4 && CQ == false)
    {
      msgDEcallsign = decodeWords[1];
    }

    var okayToAlert = true;

    if (msgDEcallsign + band + mode in GT.liveCallsigns)
    { found_callsign = GT.liveCallsigns[msgDEcallsign + band + mode]; }

    if (okayToAlert == true)
    { return checkAlerts(msgDEcallsign, theirGrid, message, found_callsign); }
  }
  return false;
}

function checkAlerts(
  DEcallsign,
  grid,
  originalMessage,
  callsignRecord,
  band,
  mode
)
{
  var hadAlert = false;
  for (var key in GT.activeCustomAlerts)
  {
    var nalert = GT.activeCustomAlerts[key];
    if (nalert.type == 0)
    {
      // callsign exatch match
      if (DEcallsign == nalert.value)
      {
        handleAlert(nalert, DEcallsign, originalMessage, callsignRecord);
        hadAlert = true;
      }
    }
    else if (grid && nalert.type == 2)
    {
      // gridsquare
      if (!(DEcallsign + band + mode in GT.tracker.worked.call) && grid.indexOf(nalert.value) == 0)
      {
        handleAlert(nalert, DEcallsign, originalMessage, callsignRecord, grid);
        hadAlert = true;
      }
    }
    else if (nalert.type == 4)
    {
      // QRZ
      if (GT.settings.app.myCall.length > 0 && originalMessage.indexOf(GT.settings.app.myCall + " ") == 0)
      {
        handleAlert(nalert, DEcallsign, originalMessage, callsignRecord, grid);
        hadAlert = true;
      }
    }
    else if (nalert.type == 5)
    {
      // callsign partial
      if (!(DEcallsign + band + mode in GT.tracker.worked.call) && DEcallsign.indexOf(nalert.value) == 0)
      {
        handleAlert(nalert, DEcallsign, originalMessage, callsignRecord, grid);
        hadAlert = true;
      }
    }
    else if (nalert.type == 6)
    {
      // callsign regex
      // Backwards compatibility: Compile on the fly if loaded from JSON
      if (!nalert.regexObj || typeof nalert.regexObj.test !== 'function') {
        try {
          nalert.regexObj = new RegExp(nalert.value, 'i');
        } catch (e) {
          nalert.regexObj = null; // Mark as invalid so we don't try again
        }
      }

      if (nalert.regexObj && !(DEcallsign + band + mode in GT.tracker.worked.call) && nalert.regexObj.test(DEcallsign))
      {
        handleAlert(nalert, DEcallsign, originalMessage, callsignRecord, grid);
        hadAlert = true;
      }
    }

  }
  if (hadAlert)
  {
    displayCustomAlerts();
    return true;
  }
  return false;
}

function handleAlert(nAlert, target, lastMessage, callsignRecord, grid)
{
  if (nAlert.fired > 0 && nAlert.repeat == 0) return;

  if (nAlert.fired == 1 && nAlert.repeat == 1) return;

  nAlert.lastMessage = lastMessage;
  nAlert.lastTime = timeNowSec();

  if (nAlert.notify == 3 && callsignRecord != null && grid)
  {
    var LL = squareToCenter(grid);

    if (!isNaN(LL.a))
    {
      GT.map
        .getView()
        .setCenter(ol.proj.transform([LL.o, LL.a], "EPSG:4326", GT.settings.map.projection));
    }
  }

  if (nAlert.notify == 2) nAlert.needAck = 1;

  if (nAlert.type == 0 || nAlert.type == 5 || nAlert.type == 6)
  {
    if (nAlert.notify == 0) playAlertMediaFile(nAlert.filename);
    if (nAlert.notify == 1) speakAlertString(I18N("alerts.callsign.speech"), target, null);
    if (nAlert.notify == 2) displayAlertPopUp(I18N("alerts.callsign.popup"), target, null);
  }

  if (nAlert.type == 2)
  {
    if (nAlert.notify == 0) playAlertMediaFile(nAlert.filename);
    if (nAlert.notify == 1) speakAlertString(I18N("alerts.gridsquare.speech"), grid, null);
    if (nAlert.notify == 2) displayAlertPopUp(I18N("alerts.gridsquare.speech"), grid, target);
  }

  if (nAlert.type == 4)
  {
    if (nAlert.notify == 0) playAlertMediaFile(nAlert.filename);
    if (nAlert.notify == 1) speakQRZString(target, I18N("alerts.QRZ.speech"), GT.settings.app.myCall);
    if (nAlert.notify == 2) displayAlertPopUp("QRZ", null, null);
  }
  nAlert.fired++;
}

function playAlertMediaFile(filename)
{
  if (GT.settings.audio.alertMute == 1) {
    return;
  }

  let fpath = path.join(GT.gtMediaDir, filename);
  if (!fs.existsSync(fpath))
  {
    fpath = path.join(GT.extraMediaDir, filename);
  }

  // 1. Initialize our Audio Pool (using a Map to link filepath -> Audio object)
  if (!GT.audioPool) {
    GT.audioPool = new Map();
  }

  let player;

  // 2. Check if we already have an Audio object for this exact file
  if (GT.audioPool.has(fpath)) {
    player = GT.audioPool.get(fpath);
    // Reset the audio to the beginning so it immediately restarts if already playing
    player.currentTime = 0; 
  } else {
    // 3. We don't have this sound yet. Create a new one.
    player = new Audio("file://" + fpath);
    
    // Memory Failsafe: Cap the pool at 20 unique sounds. 
    // If a user has 100s of custom sounds, we delete the oldest one to prevent RAM leaks.
    if (GT.audioPool.size >= 20) {
      const oldestKey = GT.audioPool.keys().next().value; // Map remembers insertion order
      const oldPlayer = GT.audioPool.get(oldestKey);
      oldPlayer.src = ""; // Force browser to drop the file handle
      GT.audioPool.delete(oldestKey);
    }
    
    GT.audioPool.set(fpath, player);
  }

  // 4. Update Volume and Sound Card Routing
  player.volume = GT.settings.audio.volume;
  
  if (GT.settings.app.soundCard && typeof player.setSinkId === 'function') {
    // Only re-route if the sound card actually changed, saves CPU
    if (player.sinkId !== GT.settings.app.soundCard) {
      player.setSinkId(GT.settings.app.soundCard).catch(() => {});
    }
  }
  
  // 5. Play and gracefully suppress interruption errors
  player.play().catch(err => {
    if (err.name === 'AbortError') return; // Suppress harmless interruption errors
    console.error("Audio playback failed for", filename, ":", err);
  });
}

function stringToPhonetics(string)
{
  var newMsg = "";
  for (var x = 0; x < string.length; x++)
  {
    if (GT.settings.audio.speechPhonetics == true)
    { newMsg += GT.phonetics[string.substr(x, 1)]; }
    else
    {
      if (string.substr(x, 1) == " ") newMsg += ", ";
      else newMsg += string.substr(x, 1);
    }

    if (x != string.length - 1) newMsg += " ";
  }
  return newMsg;
}

function speakQRZString(caller, words, you)
{
  if (GT.settings.audio.alertMute == 0)
  {
    var sCaller = "";
    var sYou = "";
    if (caller) sCaller = stringToPhonetics(caller);
    if (you) sYou = stringToPhonetics(you);

    if (GT.speechAvailable)
    {
      var speak = sCaller.trim() + ", " + words.trim() + ", " + sYou.trim();
      var msg = new SpeechSynthesisUtterance(speak);
      msg.lang = GT.localeString;
      if (GT.settings.audio.speechVoice > 0)
      { msg.voice = GT.voices[GT.settings.audio.speechVoice - 1]; }
      msg.rate = GT.settings.audio.speechRate;
      msg.pitch = GT.settings.audio.speechPitch;
      msg.volume = GT.settings.audio.speechVolume;
      window.speechSynthesis.speak(msg);
    }
  }
}

function speakAlertString(what, message, target)
{
  if (GT.settings.audio.alertMute == 0)
  {
    var sMsg = "";
    var sTarget = "";
    if (message) sMsg = stringToPhonetics(message);
    if (target) sTarget = stringToPhonetics(target);

    if (GT.speechAvailable)
    {
      var speak = what.trim() + ", " + sMsg.trim() + ", " + sTarget.trim();
      var msg = new SpeechSynthesisUtterance(speak);
      msg.lang = GT.localeString;
      if (GT.settings.audio.speechVoice > 0)
      { msg.voice = GT.voices[GT.settings.audio.speechVoice - 1]; }
      msg.rate = GT.settings.audio.speechRate;
      msg.pitch = GT.settings.audio.speechPitch;
      msg.volume = GT.settings.audio.speechVolume;
      window.speechSynthesis.speak(msg);
    }
  }
}

function displayAlertPopUp(what, message, target)
{
  if (GT.alertWindowInitialized == false) return;

  let html = [];
  let acount = 0;

  if (hasAnyKeys(GT.activeCustomAlerts))
  {
    for (const key in GT.activeCustomAlerts)
    {
      if (GT.activeCustomAlerts[key].needAck) acount++;
    }

    html.push("<div id='tableDiv' style='overflow:hidden;'>");
    html.push("<table align='center' class='darkTable' >");
    html.push("<tr>");
    html.push("<th>Type</th>");
    html.push("<th>Value</th>");
    html.push("<th>Notify</th>");
    html.push("<th>Repeat</th>");
    html.push("<th>Filename</th>");
    html.push("<th>Alerted</th>");
    html.push("<th>Last Message</th>");
    html.push("<th>When</th>");
    html.push("</tr>");

    for (var key in GT.activeCustomAlerts)
    {
      if (GT.activeCustomAlerts[key].needAck)
      {
        html.push("<tr>");
        html.push("<td>" + GT.alertTypeOptions[GT.activeCustomAlerts[key].type] + "</td>");
        if (GT.activeCustomAlerts[key].type == 0)
        { html.push("<td style='color:yellow'>" + GT.activeCustomAlerts[key].value + "</td>"); }
        if (GT.activeCustomAlerts[key].type == 2)
        { html.push("<td style='color:red'>" + GT.activeCustomAlerts[key].value + "</td>"); }
        if (GT.activeCustomAlerts[key].type == 4)
        { html.push("<td style='color:cyan'>" + GT.settings.app.myCall + "</td>"); }
        if (GT.activeCustomAlerts[key].type == 5)
        {
          html.push("<td style='color:lightgreen'>" + GT.activeCustomAlerts[key].value + "*</td>");
        }
        if (GT.activeCustomAlerts[key].type == 6)
        { 
          html.push("<td style='color:pink'>" + GT.activeCustomAlerts[key].value + "</td>"); 
        }

        html.push("<td>" + GT.alertValueOptions[GT.activeCustomAlerts[key].notify] + "</td>");
        html.push("<td>" + GT.alertRepeatOptions[GT.activeCustomAlerts[key].repeat] + "</td>");
        html.push("<td>" +
          (GT.activeCustomAlerts[key].shortname.length > 0 ? GT.activeCustomAlerts[key].shortname : "-") +
          "</td>");
        html.push("<td>" + (GT.activeCustomAlerts[key].fired > 0 ? "Yes" : "No") + "</td>");
        html.push("<td style='color:cyan'>" +
          (GT.activeCustomAlerts[key].lastMessage.length > 0
            ? GT.activeCustomAlerts[key].lastMessage
            : "-") +
          "</td>");
        ageString = userTimeString(GT.activeCustomAlerts[key].lastTime * 1000);
        html.push("<td>" + (GT.activeCustomAlerts[key].lastTime > 0 ? ageString : "-") + "</td>");
        html.push("</tr>");
      }
    }
    html.push("</table>");
    html.push("</div>");
  }

  GT.alertWindowHandle.window.alertPopListDiv.innerHTML = html.join("");
  GT.alertWindowHandle.resizeTo(parseInt(GT.alertWindowHandle.window.alertsPopDiv.offsetWidth) + 20, parseInt(GT.alertWindowHandle.window.alertsPopDiv.offsetHeight) + 44);

  openAlertWindow(true);
}

function ackAlerts()
{
  for (var key in GT.activeCustomAlerts)
  {
    GT.activeCustomAlerts[key].needAck = 0;
  }
}

function alertTypeChanged()
{
  addError.innerHTML = "";
  if (alertTypeSelect.value == 0 || alertTypeSelect.value == 5)
  {
    alertValueSelect.innerHTML ="<input id=\"alertValueInput\" type=\"text\" class=\"inputTextValue\" maxlength=\"12\"  size=\"5\" oninput=\"ValidateCallsign(this,null);\" / >";
    ValidateCallsign(alertValueInput, null);
  }
  else if (alertTypeSelect.value == 2)
  {
    alertValueSelect.innerHTML = "<input id=\"alertValueInput\" type=\"text\" class=\"inputTextValue\"  maxlength=\"6\" size=\"3\" oninput=\"ValidateGridsquareOnly4(this,null);\" / >";
    ValidateGridsquareOnly4(alertValueInput, null);
  }
  else if (alertTypeSelect.value == 4)
  {
    alertValueSelect.innerHTML = "<input id=\"alertValueInput\" disabled=\"true\" type=\"text\" class=\"inputTextValue\" value=\"" + GT.settings.app.myCall + "\" maxlength=\"12\"  size=\"5\" oninput=\"ValidateCallsign(this,null);\" / >";
    ValidateCallsign(alertValueInput, null);
  }
  else if (alertTypeSelect.value == 6)
  {
    alertValueSelect.innerHTML = "<input id=\"alertValueInput\" type=\"text\" class=\"inputTextValue\" size=\"12\" value=\"^\" oninput=\"ValidateText(this);\" / >";
    ValidateText(alertValueInput);
  }
}

function alertNotifyChanged(who = "")
{
  addError.innerHTML = "";

  if (alertNotifySelect.value == 0)
  {
    alertMediaSelect.style.display = "block";
    if (who == "media" && alertMediaSelect.value != "none")
    {
      playAlertMediaFile(alertMediaSelect.value);
    }
  }
  else
  {
    alertMediaSelect.style.display = "none";
  }
}

GT.alertTypeOptions = Array();

GT.alertTypeOptions["0"] = "Call (exact)";
GT.alertTypeOptions["1"] = "Deprecated";
GT.alertTypeOptions["2"] = "Grid";
GT.alertTypeOptions["3"] = "Deprecated";
GT.alertTypeOptions["4"] = "QRZ";
GT.alertTypeOptions["5"] = "Call (partial)";
GT.alertTypeOptions["6"] = "Call (regex)";

GT.alertValueOptions = Array();
GT.alertValueOptions["0"] =
  "<img title='Audio File' style='margin:-1px;margin-bottom:-4px;padding:0px' src='img/icon_audio_16.png'>";
GT.alertValueOptions["1"] = "TTS";
GT.alertValueOptions["2"] = "PopUp";
GT.alertValueOptions["3"] = "MapCenter";

GT.alertRepeatOptions = Array();

GT.alertRepeatOptions["0"] = "No";
GT.alertRepeatOptions["1"] = "Once";
GT.alertRepeatOptions["2"] = "Inf";
GT.alertRepeatOptions["3"] = "Inf(Session)";

function displayCustomAlerts()
{
  let html = [];

  if (hasAnyKeys(GT.activeCustomAlerts))
  {
    html.push("<div style='padding-right:8px;overflow:auto;overflow-x:hidden;height:" +
      Math.min(Object.keys(GT.activeCustomAlerts).length * 24 + 23, 312) +
      "px;'>");

    html.push("<table align='center' class='darkTable' >");

    html.push("<tr>");
    html.push("<th>Type</th>");
    html.push("<th>Value</th>");
    html.push("<th>Notify</th>");
    html.push("<th>Repeat</th>");
    html.push("<th>Filename</th>");
    html.push("<th>Alerted</th>");
    html.push("<th>Last Message</th>");
    html.push("<th>When</th>");
    html.push("<th>Reset</th>");
    html.push("<th>Delete</th>");
    html.push("</tr>");

    for (var key in GT.activeCustomAlerts)
    {
      html.push("<tr>");
      html.push("<td>" + GT.alertTypeOptions[GT.activeCustomAlerts[key].type] + "</td>");
      if (GT.activeCustomAlerts[key].type == 0)
      { html.push("<td style='color:yellow'>" + GT.activeCustomAlerts[key].value + "</td>"); }
      if (GT.activeCustomAlerts[key].type == 2)
      { html.push("<td style='color:red'>" + GT.activeCustomAlerts[key].value + "</td>"); }
      if (GT.activeCustomAlerts[key].type == 4)
      { html.push("<td style='color:cyan'>" + GT.settings.app.myCall + "</td>"); }
      if (GT.activeCustomAlerts[key].type == 5)
      {
        html.push("<td style='color:lightgreen'>" + GT.activeCustomAlerts[key].value + "*</td>");
      }
      if (GT.activeCustomAlerts[key].type == 6)
      { html.push("<td style='color:pink'>" + GT.activeCustomAlerts[key].value + "</td>"); }

      html.push("<td>" + GT.alertValueOptions[GT.activeCustomAlerts[key].notify] + "</td>");
      html.push("<td>" + GT.alertRepeatOptions[GT.activeCustomAlerts[key].repeat] + "</td>");
      html.push("<td>" +
        (GT.activeCustomAlerts[key].shortname.length > 0 ? GT.activeCustomAlerts[key].shortname : "-") +
        "</td>");
      html.push("<td>" + (GT.activeCustomAlerts[key].fired > 0 ? "Yes" : "No") + "</td>");
      html.push("<td style='color:cyan'>" +
        (GT.activeCustomAlerts[key].lastMessage.length > 0
          ? GT.activeCustomAlerts[key].lastMessage
          : "-") +
        "</td>");
      ageString = userTimeString(GT.activeCustomAlerts[key].lastTime * 1000);
      html.push("<td>" + (GT.activeCustomAlerts[key].lastTime > 0 ? ageString : "-") + "</td>");
      html.push("<td style='cursor:pointer' onclick='resetAlert(\"" +
        key +
        "\")'><img src='img/reset_24x48.png' style='height:17px;margin:-1px;margin-bottom:-3px;padding:0px' ></td>");
      html.push("<td style='cursor:pointer' onclick='deleteAlert(\"" +
        key +
        "\")'><img src='img/trash_24x48.png' style='height:17px;margin:-1px;margin-bottom:-3px;padding:0px'></td>");
      html.push("</tr>");
    }
    html.push("</table>");
    html.push("</div>");
  }
  alertListDiv.innerHTML = html.join("");;
}

function wantedChanged(what)
{
  if (what.id in GT.activeAudioAlerts.wanted)
  {
    if (GT.speechAvailable) window.speechSynthesis.cancel();
    GT.activeAudioAlerts.wanted[what.id] = what.checked;
    if (GT.activeAudioAlerts.wanted[what.id] == false)
    {
      window[what.id + "Count"].innerHTML = 0;
      window.huntMultipleCount.innerHTML = 0;
    }
    if (GT.callRosterWindowInitialized)
    {
      GT.callRosterWindowHandle.window.wantedValuesChangedFromAudioAlerts();
    }
  }
  else if (what.id in GT.settings.audioAlerts.media)
  {
    GT.settings.audioAlerts.media[what.id] = what.value;
  }
}

function processAudioAlertsFromRoster(wantedAlerts)
{
  for (const key in wantedAlerts)
  {
    if (key in window)
    {
      window[key + "Count"].innerHTML = wantedAlerts[key];
    }
  }
  if (wantedAlerts.huntMultiple > 1)
  {
    if (GT.settings.audioAlerts.media.huntMultipleType == "tts")
    {
      speakAlertString(GT.settings.audioAlerts.media.huntMultipleSpeechMulti);
    }
    else
    {
      if (GT.settings.audioAlerts.media.huntMultipleFileMulti != "none")
      {
        playAlertMediaFile(GT.settings.audioAlerts.media.huntMultipleFileMulti);
      }
    }
  }
  else
  {
    delete wantedAlerts.huntMultiple;
    for (const key in wantedAlerts)
    {
      if (key in window)
      {
        let type = key + "Type";
        if (wantedAlerts[key] == 1)
        {
          if (GT.settings.audioAlerts.media[type] == "tts")
          {
            speakAlertString(GT.settings.audioAlerts.media[key + "SpeechSingle"]);
          }
          else
          {
            playAlertMediaFile(GT.settings.audioAlerts.media[key + "FileSingle"]);
          }
        }
        else if (wantedAlerts[key] > 1)
        {
          if (GT.settings.audioAlerts.media[type] == "tts")
          {
            speakAlertString(GT.settings.audioAlerts.media[key + "SpeechMulti"]);
          }
          else
          {
            if (GT.settings.audioAlerts.media[key + "FileMulti"] != "none")
            {
              playAlertMediaFile(GT.settings.audioAlerts.media[key + "FileMulti"]);
            }
          }
        }
      }
    }
  }
}

const LOGBOOK_LIVE_BAND_LIVE_MODE = "0";
const LOGBOOK_LIVE_BAND_MIX_MODE = "1";
const LOGBOOK_LIVE_BAND_DIGI_MODE = "2";
const LOGBOOK_MIX_BAND_LIVE_MODE = "3";
const LOGBOOK_MIX_BAND_MIX_MODE = "4";
const LOGBOOK_MIX_BAND_DIGI_MODE = "5";
const LOGBOOK_AWARD_TRACKER = "6";

function setVisualHunting()
{
  setVisualAudioAlerts();

  if (GT.callRosterWindowInitialized)
  {
    try
    {
      GT.callRosterWindowHandle.window.setVisual();
      GT.callRosterWindowHandle.window.applyActiveRoster();
      applyExceptions();
    }
    catch (e)
    {
    }
  }
}

function logbookValuesChanged()
{
  GT.activeRoster.logbook.referenceNeed = referenceNeed.value;
  GT.activeRoster.logbook.huntNeed = huntNeed.value;
  setVisualHunting();
}

// Syncronized call with roster.js!
function huntingValueChanged(element)
{
  if (GT.callRosterWindowInitialized)
  {
    if (GT.speechAvailable) window.speechSynthesis.cancel();
    let value = (element.type == "checkbox") ? element.checked : element.value;
    GT.callRosterWindowHandle.window.huntingValueChangedFromAudioAlerts(element.id, value);
    setVisualAudioAlerts();
  }
  else
  {
    console.log("Well this is odd.");
  }
}

function alertRulesValueChanged(element)
{
    if (GT.speechAvailable) window.speechSynthesis.cancel();
    let value = (element.type == "checkbox") ? element.checked : element.value;
    GT.settings.audioAlerts.rules[element.id] = value;
    GT.callRosterWindowHandle.window.huntingValueChangedFromAudioAlerts(element.id, value);
    setVisualAudioAlerts();
}

function huntingValueChangedFromCallRoster(id, value)
{
  if (id in window)
  {
    if (window[id].type == "checkbox")
    {
      window[id].checked = value;
    }
    else
    {
      window[id].value = value;
      let view = id + "View";
      if (view in window)
      {
        window[view].innerHTML = value;
      }
    }
    setVisualAudioAlerts();
  }
}

function openExceptions()
{
  if (GT.callRosterWindowInitialized)
  {
    GT.callRosterWindowHandle.window.openExceptions();
    electron.ipcRenderer.send("showWin", "gt_roster");
  }
  else
  {
    console.log("Well this is odd too.");
  }
}

function setVisualAudioAlerts()
{
  referenceNeed.value = GT.activeRoster.logbook.referenceNeed;
  huntNeed.value = GT.activeRoster.logbook.huntNeed;

  if (GT.activeRoster.logbook.referenceNeed == LOGBOOK_AWARD_TRACKER)
  {
    audioAlertsAwardTable.style.display = "";
    audioAlertsWantedTable.style.display = "none";
    HuntModeControls.style.display = "none";
  }
  else
  {
    audioAlertsAwardTable.style.display = "none";
    audioAlertsWantedTable.style.display = "";
    HuntModeControls.style.display = "";
  }

  useseQSLDiv.style.display = (GT.settings.callsignLookups.eqslUseEnable) ? "" : "none";
  usesOQRSDiv.style.display = (GT.settings.callsignLookups.oqrsUseEnable) ? "" : "none";
  onlySpotDiv.style.display = (GT.settings.roster.columns.Spot) ? "" : "none";
  huntingMatrixPotaRow.style.display = (GT.settings.app.potaFeatureEnabled && GT.settings.map.offlineMode == false) ? "" : "none";
  
  if (GT.settings.app.wantedByBandMode == true && GT.instanceCount == 1) {
     let audioAlertsHeader = document.querySelector('h3[data-i18n="settings.alerts.AudioAlert.label"]');
    let exceptionsHeader = document.querySelector('h3[data-i18n="roster.exceptions.label"]');
    let customAlertsHeader = document.querySelector('th[data-i18n="settings.alerts.CustomAlerts.label"]');

    if (audioAlertsHeader && !document.getElementById('wanted_mode_indicator')) {
      audioAlertsHeader.insertAdjacentHTML('beforeend', ' <span id="wanted_mode_indicator" class="band-mode-indicator">M</span>');
      wanted_mode_indicator.title = I18N("settings.Features.BandMemory");
    }
    if (GT.settings.app.includeExceptions) {
      if (exceptionsHeader && !document.getElementById('exceptions_mode_indicator')) {
        exceptionsHeader.insertAdjacentHTML('beforeend', ' <span id="exceptions_mode_indicator" class="band-mode-indicator">M</span>');
        exceptions_mode_indicator.title = I18N("settings.Features.BandMemory");
      }
    } else {
      let excIndicator = document.getElementById('exceptions_mode_indicator');
      if (excIndicator) excIndicator.remove();
    }
    if (GT.settings.app.includeCustomAlerts) {
      if (customAlertsHeader && !document.getElementById('custom_alerts_mode_indicator')) {
        customAlertsHeader.insertAdjacentHTML('beforeend', ' <span id="custom_alerts_mode_indicator" class="band-mode-indicator">M</span>');
        custom_alerts_mode_indicator.title = I18N("settings.Features.BandMemory");
      }
    } else {
      let caIndicator = document.getElementById('custom_alerts_mode_indicator');
      if (caIndicator) caIndicator.remove();
    }
  } else {
    let wantedIndicator = document.getElementById('wanted_mode_indicator');
    if (wantedIndicator) wantedIndicator.remove();

    let excIndicator = document.getElementById('exceptions_mode_indicator');
    if (excIndicator) excIndicator.remove();

    let caIndicator = document.getElementById('custom_alerts_mode_indicator');
    if (caIndicator) caIndicator.remove();
  }
}

function applyExceptions()
{
  requireGrid.checked = GT.activeExceptions.requireGrid;
  wantRRCQ.checked = GT.activeExceptions.wantRRCQ;
  cqOnly.checked = GT.activeExceptions.cqOnly;
  noMyDxcc.checked = GT.activeExceptions.noMyDxcc;
  onlyMyDxcc.checked = GT.activeExceptions.onlyMyDxcc;
  useseQSL.checked = GT.activeExceptions.useseQSL;
  onlySpot.checked = GT.activeExceptions.onlySpot;
  usesOQRS.checked = GT.activeExceptions.usesOQRS;
  allOnlyNew.checked = GT.activeExceptions.allOnlyNew;
}

function loadAudioAlertSettings()
{
  referenceNeed.value = GT.activeRoster.logbook.referenceNeed;
  huntNeed.value = GT.activeRoster.logbook.huntNeed;

  applyExceptions();

  for (const key in GT.settings.audioAlerts.rules)
  {
    if (key in window)
    {
      if (window[key].type == "checkbox")
      {
        window[key].checked = GT.settings.audioAlerts.rules[key];
      }
      else
      {
        window[key].value = GT.settings.audioAlerts.rules[key];
      }
    }
  }

  for (const key in GT.activeAudioAlerts.wanted)
  {
    if (key in window)
    {
      window[key].checked = GT.activeAudioAlerts.wanted[key];
    }
  }

  for (const key in GT.settings.audioAlerts.wanted)
  {
    if (key in window)
    {
      let visibility = window[key].style.visibility;
      let row = window[key].parentNode.parentNode;
      let parent = row.insertCell();
      let newDiv = document.createElement("div");
      let id = key + "Count";
      newDiv.id = id;
      newDiv.className = "roundBorderValue";
      newDiv.innerHTML = "0";
      parent.style.textAlign = "center";
      parent.appendChild(newDiv);
      parent = row.insertCell();

      let select = document.createElement("select");
      id = key + "Type";
      let value = GT.settings.audioAlerts.media[id];
      let mediaType = value;
      select.id = id;
      select.addEventListener("change", wantedChanged.bind(null, select), false);
  
      let option;
      option = newOption("tts", I18N("settings.OAMS.message.newAlert.textToSpeech"), value == "tts");
      select.appendChild(option);
      option = newOption("media", I18N("settings.OAMS.message.newAlert.mediaFile"), value == "media");
      select.appendChild(option);
      parent.appendChild(select);
      select.addEventListener("change", wantedMediaTypeChanged, false);

      select.value = value;

      parent = row.insertCell();

      select = null;
      select = document.createElement("select");
      id = key + "FileSingle";
      value = GT.settings.audioAlerts.media[id];
      select.id = id;
      select.appendChild(newOption("none", I18N("alerts.addNew.SelectFile")), value == "none");

      GT.mediaFiles.forEach((filename) =>
      {
        let noExt = path.parse(filename).name;
        select.appendChild(newOption(filename, noExt, value == filename));
      });

      select.addEventListener("change", wantedMediaFileChanged, false);
      parent.appendChild(select);
      select.value = value;
      select.style.display = (mediaType == "tts") ? "none" : "";
      select.style.visibility = visibility;

      let input = document.createElement("input");
      input.id = id = key + "SpeechSingle";
      input.type = "text";
      input.size = 16;
      input.value = GT.settings.audioAlerts.media[id];
      input.className = "inputTextValue";
      parent.appendChild(input);
      input.addEventListener("change", wantedMediaSpeechChanged, false);
      ValidateText(input);
      input.style.display = (mediaType == "media") ? "none" : "";
      input.style.visibility = visibility;

      parent = row.insertCell();

      id = key + "FileMulti";

      select = null;
      select = document.createElement("select");
      
      value = GT.settings.audioAlerts.media[id];
      select.id = id;
      select.appendChild(newOption("none", I18N("alerts.addNew.SelectFile")), value == "none");

      GT.mediaFiles.forEach((filename) =>
      {
        let noExt = path.parse(filename).name;
        select.appendChild(newOption(filename, noExt, value == filename));
      });

      select.addEventListener("change", wantedMediaFileChanged, false);
      parent.appendChild(select);
      select.value = value;
      select.style.display = (mediaType == "tts") ? "none" : "";

      input = document.createElement("input");
      input.id = id = key + "SpeechMulti";
      input.type = "text";
      input.size = 16;
      input.value = GT.settings.audioAlerts.media[id];
      input.className = "inputTextValue";
      parent.appendChild(input);
      input.addEventListener("change", wantedMediaSpeechChanged, false);
      ValidateText(input);
      input.style.display = (mediaType == "media") ? "none" : "";
    }
  }

  setVisualAudioAlerts();
}

function wantedMediaTypeChanged(event)
{
  let element = event.target;
  GT.settings.audioAlerts.media[element.id] = element.value;
  let rootName = element.id.replace("Type", "");
  if (element.value == "tts")
  {
    window[rootName + "SpeechSingle"].style.display = "";
    window[rootName + "FileSingle"].style.display = "none";
    if (rootName + "FileMulti" in window)
    {
      window[rootName + "SpeechMulti"].style.display = "";
      window[rootName + "FileMulti"].style.display = "none";
    }
  }
  else
  {
    window[rootName + "SpeechSingle"].style.display = "none";
    window[rootName + "FileSingle"].style.display = "";
    if (rootName + "FileMulti" in window)
    {
      window[rootName + "SpeechMulti"].style.display = "none";
      window[rootName + "FileMulti"].style.display = "";
    }
  }
  GT.settings.audioAlerts.media[element.id] = element.value;
}

function wantedMediaFileChanged(event)
{
  let element = event.target;
  if (element.value != "none")
  {
    playAlertMediaFile(element.value);
  }
  GT.settings.audioAlerts.media[element.id] = element.value;
}

function wantedMediaSpeechChanged(event)
{
  let element = event.target;
  element.value = element.value.trim();
  ValidateText(element);
  if (element.value != "")
  {
    speakAlertString(element.value);
  }
  GT.settings.audioAlerts.media[element.id] = element.value;
}

function openWatcher()
{
  if (GT.callRosterWindowInitialized)
  {
    try
    {
      GT.callRosterWindowHandle.window.openWatcher();
      electron.ipcRenderer.send("showWin", "gt_roster");
    }
    catch (e)
    {
    }
  }
}
