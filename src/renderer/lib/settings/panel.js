// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Settings: the settings panel and its tabs, About/Info (moved from GridTracker2.js)

function showSettingsBox()
{
  if (rootSettingsDiv.style.display == "inline-block")
  {
    rootSettingsDiv.style.display = "none";
  }
  else
  {
    helpDiv.style.display = "none";
    GT.helpShow = false;
    rootSettingsDiv.style.display = "inline-block";
  }
}

function openInfoTab(evt, tabName, callFunc, callObj)
{
  openStatsWindow();

  if (GT.statsWindowInitialized)
  {
    // Declare all variables
    let i, infoTabcontent, infoTablinks;
    // Get all elements with class="infoTabcontent" and hide them
    infoTabcontent = GT.statsWindowHandle.window.document.getElementsByClassName(
      "infoTabcontent"
    );
    for (i = 0; i < infoTabcontent.length; i++)
    {
      infoTabcontent[i].style.display = "none";
    }
    // Get all elements with class="infoTablinks" and remove the class "active"
    infoTablinks = GT.statsWindowHandle.window.document.getElementsByClassName(
      "infoTablinks"
    );
    for (i = 0; i < infoTablinks.length; i++)
    {
      infoTablinks[i].className = infoTablinks[i].className.replace(
        " active",
        ""
      );
    }
    // Show the current tab, and add an "active" class to the button that opened the tab

    GT.statsWindowHandle.window.document.getElementById(tabName).style.display = "block";

    if (evt)
    {
      evt = GT.statsWindowHandle.window.document.getElementById(evt);
    }
    if (evt)
    {
      if (typeof evt.currentTarget != "undefined")
      {
        evt.currentTarget.className += " active";
      }
      else
      {
        evt.className += " active";
      }
    }

    if (callFunc)
    {
      if (callObj) callFunc(callObj);
      else callFunc();
    }
  }
}

function openAboutBox()
{
  openSettingsTab(aboutbut, 'aboutDiv');
  helpDiv.style.display = "none";
  GT.helpShow = false;
  rootSettingsDiv.style.display = "inline-block";
}

function openLogbookSettings()
{
  openSettingsTab(logbut, 'logbookSettingsDiv');
  helpDiv.style.display = "none";
  GT.helpShow = false;
  rootSettingsDiv.style.display = "inline-block";
}

function openAudioAlertSettings()
{
  openSettingsTab(audioalertbut, 'audioAlertsDiv');
  helpDiv.style.display = "none";
  GT.helpShow = false;
  rootSettingsDiv.style.display = "inline-block";
  electron.ipcRenderer.send("showWin", "GridTracker2")
}

function openSettingsTab(evt, tabName)
{
  // Declare all variables
  let i, settingsTabcontent, settingsTablinks;
  // Get all elements with class="settingsTabcontent" and hide them
  settingsTabcontent = document.getElementsByClassName("settingsTabcontent");
  for (i = 0; i < settingsTabcontent.length; i++)
  {
    settingsTabcontent[i].style.display = "none";
  }
  // Get all elements with class="settingsTablinks" and remove the class "active"
  settingsTablinks = document.getElementsByClassName("settingsTablinks");
  for (i = 0; i < settingsTablinks.length; i++)
  {
    settingsTablinks[i].className = settingsTablinks[i].className.replace(
      " active",
      ""
    );
  }
  displayCustomAlerts();
  // Show the current tab, and add an "active" class to the button that opened the tab
  document.getElementById(tabName).style.display = "";
  if (typeof evt.currentTarget != "undefined") { evt.currentTarget.className += " active"; }
  else evt.className += " active";
}

function initSettingsTabs()
{
  let settingsTabcontent = document.getElementsByClassName("settingsTabcontent");
  for (let i = 0; i < settingsTabcontent.length; i++)
  {
    settingsTabcontent[i].style.display = "none";
  }
  generalSettingsDiv.style.display = "";
}
