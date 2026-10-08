// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Keyboard: hotkey registration and handling (moved from GridTracker2.js)

function onMyKeyDown(event)
{
  if (event.keyCode == 27)
  {
    rootSettingsDiv.style.display = "none";
    helpDiv.style.display = "none";
    GT.helpShow = false;
    event.preventDefault();
  }

  if (spotsDiv.style.display !== "none")
  {
    let activeId = document.activeElement ? document.activeElement.id : "";
    if (activeId === "spotHistoryH" || activeId === "spotHistoryM")
    {
      if ((event.key >= '0' && event.key <= '9') || 
          ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.key)) 
      {
        return; 
      }
    }
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
  registerHotKey("Open Conditions Windows", "KeyE", showConditionsWindow, null, null, "ctrlKey");
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
