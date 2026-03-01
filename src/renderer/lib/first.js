// This file needs to be loaded first for all windows
// No exceptions, if you don't , things will go badly
const electron = require("electron");
const NodeURL = require("url");
const os = require("os");
const nodeTimers = require("timers");
const dns = require("node:dns");
const path = require("path");
const fs = require("fs");
const process = require("process");
const { webUtils } = require('electron');

console.log = logError;

function logError(error)
{
  if (typeof error == "string")
  {
    electron.ipcRenderer.send("log", error);
  }
  else
  {
    try 
    {
      electron.ipcRenderer.send("log", JSON.stringify(error, null, 2));
    }
    catch (e)
    {

    }
  }
}

window.onerror = function(message, source, lineNumber, colno, error) {
  logError(`${error.stack}`);
};

process.on('uncaughtException', function (error) {
  logError(error);
});

try
{
  dns.setDefaultResultOrder("ipv4first");
  dns.promises.setDefaultResultOrder("ipv4first");
}
catch (e)
{
  logError("Can't set dns IPv4 default order");
}


// Between Dev and App location
const resourcesPath = electron.ipcRenderer.sendSync("getResourcesPath");

function requireJson(filepath)
{
  let where;
  try 
  {
    where = path.resolve(resourcesPath, filepath);
    return require(where);
  }
  catch (e)
  {
    console.log("mild-warning: " + filepath + " not loaded");
  }
  return null;
}

// GridTracker object
var GT = {};
// CallRoster object
var CR = {};
var isGT = false;

if (document.title.substring(0, 12).trim() == "GridTracker2")
{
  isGT = true;
  let filename = path.join(electron.ipcRenderer.sendSync("getPath","userData"), "Ginternal", "app-settings.json");
  try
  {
    if (fs.existsSync(filename))
    {
      let data = require(filename);
      if (data)
      {
        GT.settings = data;
      }
      else
      {
        // safety catch
        GT.settings = {  };
        logError("Error parsing settings, defaults will be applied");
      }
    }
    else
    {
      // This should happen only once for new users
      GT.settings = { };
      logError("Could not load: " + filename);
      logError("Defaults will be applied");
    }
  }
  catch (e)
  {
    GT.settings = { };
    logError("Could not load: " + filename);
    logError("Defaults will be applied");
  }
}
else
{
  GT = window.opener.GT;
}

// Zoom Code Below
var s_zoomLevel = 0;
document.addEventListener("keydown", onZoomControlDown, { capture: true, passive: false });
document.addEventListener("wheel", onWheel, { capture: true, passive: false });

const g_zoomKeys = {
  NumpadSubtract: reduceZoom,
  Minus: reduceZoom,
  NumpadAdd: increaseZoom,
  Equal: increaseZoom,
  Numpad0: resetZoom,
  Digit0: resetZoom,
  "-": reduceZoom,
};

electron.ipcRenderer.on('loadZoom', (_event, value) => loadZoomCallback(value));

function loadZoomCallback(zoom)
{
  s_zoomLevel = zoom;
  electron.webFrame.setZoomLevel(s_zoomLevel);
}

function onZoomControlDown(event)
{
  if (event.metaKey && event.code == "KeyQ")
  {
    event.preventDefault();
    event.stopPropagation();
    
    if (isGT == true)
    {
      saveAndCloseApp(false);
      window.close();
      return;
    }

    window.opener.saveAndCloseApp(false);
    window.opener.window.close();
    return;
  }
  if (event.ctrlKey || event.altKey)
  {

    if (event.code in g_zoomKeys)
    {
      g_zoomKeys[event.code](event);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    else if (event.key in g_zoomKeys)
    {
      g_zoomKeys[event.code](event);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    else if (event.code == "KeyR" || event.code == "KeyW")
    {
      event.preventDefault();
      event.stopPropagation();
    }
  }
  if (isGT == true)
  {
    onMyKeyDown(event);
  }
}

function onWheel(event)
{
  if (event.ctrlKey && event.altKey)
  {
    if (event.deltaY > 0)
    {
      reduceZoom();
    }
    else
    {
      increaseZoom();
    }
    event.preventDefault();
    event.stopPropagation();
  }
}

function reduceZoom()
{
  s_zoomLevel -= 0.1;
  setAndSaveZoom();
}

function increaseZoom()
{
  s_zoomLevel += 0.1;
  setAndSaveZoom();
}

function resetZoom()
{
  s_zoomLevel = 0;
  setAndSaveZoom();
}

function isTextInput(element)
{
  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';
}


function clamp(num, min, max) {
  return Math.max(min, Math.min(num, max));
}

function setAndSaveZoom()
{
  s_zoomLevel = clamp(s_zoomLevel, -5, 8);
  s_zoomLevel = parseFloat(s_zoomLevel.toFixed(1));
  electron.webFrame.setZoomLevel(s_zoomLevel);
  electron.ipcRenderer.send("saveZoom", s_zoomLevel);
}

function registerCutAndPasteContextMenu()
{
  let inputText = document.getElementsByClassName("inputTextValue");
  for (let x = 0; x < inputText.length; x++)
  {
    inputText[x].addEventListener('contextmenu', (element) => {
      const menu = new Menu();
      menu.append(new MenuItem({ label: I18N("copy"), role: 'copy' }));
      menu.append(new MenuItem({ label: I18N("paste"), role: 'paste' }));
      menu.popup();
    });
  }
}

