// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// App updates: download, install, check, and the up-to-date notice (moved from GridTracker2.js)

function closeUpdateToDateDiv()
{
  upToDateDiv.style.display = "none";
  main.style.display = "block";
}

function cancelVersion()
{
  main.style.display = "block";
  versionDiv.style.display = "none";
}

function downloadUpdate()
{
  electron.ipcRenderer.send("downloadUpdate", null);
}

function installAndRestart()
{
  saveAndCloseApp(false);
  electron.ipcRenderer.sendSync("installAndRestart", "exit");
}

function checkForNewVersion()
{
  electron.ipcRenderer.send("updateAvailable");
  nodeTimers.setTimeout(checkForNewVersion, 86400000); // Informative check in 24 hours
}
