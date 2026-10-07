// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Call Roster, main-window side: opening the roster and feeding it messages, worked status and instances (moved from GridTracker2.js)

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
