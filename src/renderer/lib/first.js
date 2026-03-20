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

const originalConsole = {
  log: console.log.bind(console),
  error: console.error.bind(console),
  warn: console.warn.bind(console)
};

function serializeForLog(value)
{
  if (value instanceof Error)
  {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  if (typeof value === "string")
  {
    return value;
  }

  try
  {
    return JSON.stringify(value, getCircularReplacer(), 2);
  }
  catch (err)
  {
    try
    {
      return String(value);
    }
    catch
    {
      return "[Unserializable value]";
    }
  }
}

function getCircularReplacer()
{
  const seen = new WeakSet();

  return function (key, value)
  {
    if (typeof value === "object" && value !== null)
    {
      if (seen.has(value))
      {
        return "[Circular]";
      }
      seen.add(value);
    }

    if (value instanceof Error)
    {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack
      };
    }

    return value;
  };
}

function sendToElectron(channel, parts)
{
  try
  {
    const text = parts.map(serializeForLog).join(" ");
    electron.ipcRenderer.send(channel, text);
  }
  catch (err)
  {
    originalConsole.error("Failed to send log to Electron:", err);
  }
}

console.log = function (...args)
{
  originalConsole.log(...args);
  sendToElectron("log", args);
};

console.warn = function (...args)
{
  originalConsole.warn(...args);
  //sendToElectron("log", args);
};

console.error = function (...args)
{
  originalConsole.error(...args);
  sendToElectron("log", args);
};

window.onerror = function (message, source, lineNumber, colno, error)
{
  if (error && error.stack)
  {
    sendToElectron("log", [error]);
  }
  else
  {
    sendToElectron("log", [
      `WindowError: ${message} at ${source}:${lineNumber}:${colno}`
    ]);
  }
};

window.addEventListener("unhandledrejection", function (event)
{
  sendToElectron("log", [
    "UnhandledPromiseRejection:",
    event.reason
  ]);
});

process.on("uncaughtException", function (error)
{
  sendToElectron("log", [error]);
});

try
{
  dns.setDefaultResultOrder("ipv4first");
  dns.promises.setDefaultResultOrder("ipv4first");
}
catch (e)
{
  console.error("Can't set dns IPv4 default order");
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
        console.error("Error parsing settings, defaults will be applied");
      }
    }
    else
    {
      // This should happen only once for new users
      GT.settings = { };
      console.error("Could not load: " + filename);
      console.error("Defaults will be applied");
    }
  }
  catch (e)
  {
    GT.settings = { };
    console.error("Could not load: " + filename);
    console.error("Defaults will be applied");
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
      g_zoomKeys[event.key](event);
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
  s_zoomLevel = Math.round(clamp(s_zoomLevel, -5, 8) * 10) / 10;
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

