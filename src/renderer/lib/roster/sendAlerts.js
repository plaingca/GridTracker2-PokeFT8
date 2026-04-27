function sendAlerts()
{
  CR.alertTimer = null;
  const callRoster = CR.callRoster;
  let scriptPath = GT.scriptPath;
  let everyDecode = GT.settings.audioAlerts.rules.everyDecode;
  let dirPath = path.dirname(scriptPath);
  let scriptExists = false;
  let shouldRosterAlert = 0;
  let shouldAudioAlert = 0;
  let audioAlertCounts = createEmptyAudioAlerts();
  let scriptReport = {};

  for (const entry in callRoster)
  {
    const callObj = callRoster[entry].callObj;

    // if it's not visible in the roster, we don't want to send a report with it, 
    // otherwise the entire roster will be sent out, including all the ones that were filtered by exceptions
    if (callRoster[entry].tx == false) continue;

    let call = callObj.DEcall;
    scriptReport[call] = Object.assign({}, callObj);
    scriptReport[call].dxccName = GT.dxccToAltName[callObj.dxcc];
    scriptReport[call].distance = (callObj.distance > 0) ? parseInt(callObj.distance * MyCircle.validateRadius(window.opener.distanceUnit.value)) : 0;

    delete scriptReport[call].DEcall;
    delete scriptReport[call].style;
    delete scriptReport[call].wspr;
    delete scriptReport[call].qso;
    delete scriptReport[call].instance;

    if (callObj.shouldRosterAlert == true && callObj.rosterAlerted == false)
    {
      callObj.rosterAlerted = true;
      shouldRosterAlert++;
    }
    callObj.shouldRosterAlert = false;

    if (callObj.shouldAudioAlert == true && (callObj.audioAlerted == false || everyDecode))
    {
      if (!callObj.lastUTC || callObj.lastUTC != callObj.UTC)
      {
        callObj.lastUTC = callObj.UTC;
        callObj.audioAlerted = true;
        for (const key in callObj.audioAlertReason)
        {
          audioAlertCounts[key] += callObj.audioAlertReason[key];
        }
        shouldAudioAlert++;
      }
    }
    callObj.shouldAudioAlert = false;
  }

  if (shouldAudioAlert > 0)
  {
    let multi = 0;
    for (const key in audioAlertCounts)
    {
      if (audioAlertCounts[key] > 0)
      {
        multi++;
      }
    }
    audioAlertCounts.huntMultiple = multi;
    window.opener.processAudioAlertsFromRoster(audioAlertCounts);
  }

  // NOTE: Ring alerts if needed
  if (shouldRosterAlert > 0)
  {
    if (GT.settings.msg.msgPushover)
    {
      sendPushOverAlert(parseCRJson(scriptReport));
    }
    if (GT.settings.msg.msgSimplepush)
    {
      sendSimplePushMessage(parseCRJson(scriptReport));
    }

    try
    {
      if (fs.existsSync(scriptPath))
      {
        scriptExists = true;
        scriptIcon.innerHTML = "<div class='buttonScript' onclick='window.opener.toggleCRScript();'>"
          + (GT.crScript == 1
          ? `<font color='lightgreen'>${I18N("sendAlerts.scriptEnabled")}</font>`
          : `<font color='yellow'>${I18N("sendAlerts.scriptDisabled")}</font>`) + "</div>";
        scriptIcon.style.display = "block";
      }
      else
      {
        scriptIcon.style.display = "none";
      }
  
      if (scriptExists && GT.crScript == 1)
      {
        fs.writeFileSync(path.join(dirPath, "cr-alert.json"), JSON.stringify(scriptReport, null, 2), { flush: true });
        electron.ipcRenderer.send("spawnScript", scriptPath);
      }
    }
    catch (e) {
    }
  }
}

function sendSimplePushMessage(message)
{
  const url = "https://api.simplepush.io/send";
  let data = {
    key: GT.settings.msg.msgSimplepushApiKey,
    title: "GT Alert - " + formatCallsign(GT.settings.app.myCall),
    msg: message
  };

  GT.getPostBuffer(
    url,
    null, // callback,
    null,
    "https",
    443,
    data,
    5000
  );
}

function sendPushOverAlert(message)
{
  const url = "https://api.pushover.net/1/messages.json";
  let data = {
    user: GT.settings.msg.msgPushoverUserKey,
    token: GT.settings.msg.msgPushoverToken,
    title: "GT Alert - " + formatCallsign(GT.settings.app.myCall),
    message: message
  };

  GT.getPostBuffer(
    url,
    null, // callback,
    null,
    "https",
    443,
    data,
    5000
  );
}

function parseCRJson(data)
{
  let message = "";
  for (let callsign in data)
  {
    if (data[callsign].shouldRosterAlert == true && data[callsign].rosterAlerted == false)
    {
      let wanted = " (" + wantedColumnParts(data[callsign]) + ")";

      if (data[callsign].grid)
      {
        if (data[callsign].state)
        {
          message = message + formatCallsign(callsign) + ", " + data[callsign].dxccName + ", " + data[callsign].RSTsent.toString() + ", " + data[callsign].grid + ", " + data[callsign].band + ", " + data[callsign].state + wanted + "\n";
        }
        else
        {
          message = message + formatCallsign(callsign) + ", " + data[callsign].dxccName + ", " + data[callsign].RSTsent.toString() + ", " + data[callsign].grid + ", " + data[callsign].band + wanted + "\n";
        }
      }
      else
      {
        if (!data[callsign].grid)
        {
          if (data[callsign].state)
          {
            message = message + formatCallsign(callsign) + ", " + data[callsign].dxccName + ", " + data[callsign].RSTsent.toString() + ", " + data[callsign].band + ", " + data[callsign].state + wanted + "\n";
          }
          else
          {
            message = message + formatCallsign(callsign) + ", " + data[callsign].dxccName + ", " + data[callsign].RSTsent.toString() + ", " + data[callsign].band + wanted + "\n";
          }
        }
      }
    }
  }
  return message;
}
