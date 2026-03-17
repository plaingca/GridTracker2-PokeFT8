// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// var CR is in screen.js
CR.developerMode = false;
CR.callRoster = {};
CR.ignoredCalls = {};
CR.ignoredCQ = {};
CR.ignoredDxcc = {};
CR.ignoredGrid = {};
CR.ignoredCQz = {};
CR.ignoredITUz = {};
CR.modes = {};
CR.modes_phone = {};
CR.rosterSettings = GT.settings.roster;
CR.day = 0;
CR.dayAsString = "0";
CR.menuHide = null;
CR.menuShow = null;
CR.columnMenu = null;
CR.columnMembers = {};
CR.callMenu = null;
CR.callMenuRotator = null;
CR.callingMenu = null;
CR.callingMenuRotator = null;
CR.ageMenu = null;
CR.compactMenuHide = null;
CR.compactMenuShow = null;

CR.currentColumnName = null;
CR.targetHash = "";
CR.dxccMenu = null;
CR.targetDxcc = -1;
CR.CQMenu = null;
CR.CQzMenu = null;
CR.GridMenu = null;
CR.MsgMenu = null;
CR.targetCQ = "";
CR.targetCQz = null;
CR.timerInterval = null;
CR.alertTimer = null;
CR.awards = {};
CR.awardTypes = {};
CR.awardTracker = {};
CR.callsignDatabaseDXCC = {};
CR.callsignDatabaseUS = {};
CR.callsignDatabaseUSplus = {};
CR.modeColors = {};
CR.modeColors.FT2 = "FF8811";
CR.modeColors.FT4 = "7777FF";
CR.modeColors.FT8 = "11FF11";
CR.modeColors.JS8 = "11FFFF";
CR.modeColors.JT4 = "EE1111";
CR.modeColors.JT9 = "7CFC00";
CR.modeColors.JT65 = "E550E5";
CR.modeColors.QRA64 = "FF00FF";
CR.modeColors.MSK144 = "1149FF";
CR.rosterTimeout = null;
CR.rosterFocus = false;
CR.lastTime = 0;
CR.watchers = {};
CR.watchersTest = {};

CR.def_displayFilters = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  invert: 0,
  sepia: 0,
  huerotate: 0
};

const LOGBOOK_LIVE_BAND_LIVE_MODE = "0";
const LOGBOOK_LIVE_BAND_MIX_MODE = "1";
const LOGBOOK_LIVE_BAND_DIGI_MODE = "2";
const LOGBOOK_MIX_BAND_LIVE_MODE = "3";
const LOGBOOK_MIX_BAND_MIX_MODE = "4";
const LOGBOOK_MIX_BAND_DIGI_MODE = "5";
const LOGBOOK_AWARD_TRACKER = "6";

const LAYERED_MODE_FOR = {};
LAYERED_MODE_FOR[LOGBOOK_LIVE_BAND_LIVE_MODE] = false;
LAYERED_MODE_FOR[LOGBOOK_LIVE_BAND_MIX_MODE] = false;
LAYERED_MODE_FOR[LOGBOOK_LIVE_BAND_DIGI_MODE] = false;
LAYERED_MODE_FOR[LOGBOOK_MIX_BAND_LIVE_MODE] = LOGBOOK_LIVE_BAND_LIVE_MODE;
LAYERED_MODE_FOR[LOGBOOK_MIX_BAND_MIX_MODE] = LOGBOOK_LIVE_BAND_MIX_MODE;
LAYERED_MODE_FOR[LOGBOOK_MIX_BAND_DIGI_MODE] = LOGBOOK_LIVE_BAND_DIGI_MODE;
LAYERED_MODE_FOR[LOGBOOK_AWARD_TRACKER] = false;


// awardTrackersActive is a much smaller object than awardTracker
CR.awardTrackersActive = GT.settings.awardTracker;
CR.awardTracker = {};

CR.ignoredCalls = GT.settings.ignoredCalls;
CR.ignoredDxcc = GT.settings.ignoredDxcc;
CR.ignoredGrid = GT.settings.ignoredGrid;
CR.ignoredCQz = GT.settings.ignoredCQz;
CR.ignoredITUz = GT.settings.ignoredITUz;
CR.ignoredCQ = GT.settings.ignoredCQ;

function storeBlocks(render = true)
{
  GT.settings.ignoredCalls = CR.ignoredCalls;
  GT.settings.ignoredDxcc = CR.ignoredDxcc;
  GT.settings.ignoredGrid = CR.ignoredGrid;
  GT.settings.ignoredCQz = CR.ignoredCQz;
  GT.settings.ignoredITUz = CR.ignoredITUz;
  GT.settings.ignoredCQ = CR.ignoredCQ;
  if (render)
  {
    renderIgnoresTab();
  }
}

function storeAwardTracker()
{
  let activeAwards = {};
  for (const hash in CR.awardTracker)
  {
    let award = {
      sponsor: CR.awardTracker[hash].sponsor,
      name: CR.awardTracker[hash].name,
      enable: CR.awardTracker[hash].enable
    };
    activeAwards[hash] = award;
  }
  GT.settings.awardTracker = activeAwards;
}

function loadSettings()
{
  
  for (let key in CR.rosterSettings.watchers)
  {
    // Fix because I allowed \ to be input as a key name char. -Tag
    let test = key.replace(/\\/g, "");
    if (test.length != key.length)
    {
      delete CR.rosterSettings.watchers[key];
      continue;
    }

    // Fix beacues we could have stored a regex object in settings in older versions
    if ("test" in CR.rosterSettings.watchers[key])
    {
      delete CR.rosterSettings.watchers[key].test;
    }

    // Fix to add the name to the entry, makes sorting easier since we can sort on members vs key
    if (!("name" in CR.rosterSettings.watchers[key]))
    {
      CR.rosterSettings.watchers[key].name = key;
    }

    if (CR.rosterSettings.watchers[key].start == false) CR.rosterSettings.watchers[key].startTime = 0;
    if (CR.rosterSettings.watchers[key].end == false) CR.rosterSettings.watchers[key].endTime = 0;

  }

  // Code reducer
  CR.watchers = CR.rosterSettings.watchers;
}


function writeRosterSettings()
{
  GT.settings.roster =  CR.rosterSettings;
  storeAwardTracker();
  storeBlocks();
}

function isKnownCallsignDXCC(dxcc)
{
  return (dxcc in CR.callsignDatabaseDXCC);
}

function isKnownCallsignUS(dxcc)
{
  return (dxcc in CR.callsignDatabaseUS);
}

function isKnownCallsignUSplus(dxcc)
{
  return (dxcc in CR.callsignDatabaseUSplus);
}

function timeNowSec()
{
  return parseInt(Date.now() / 1000);
}

function hashMaker(callObj, reference)
{
  if (reference == LOGBOOK_LIVE_BAND_LIVE_MODE) return `${callObj.band}${callObj.mode}`;

  if (reference == LOGBOOK_AWARD_TRACKER) return `${callObj.band}${callObj.mode}`;

  if (reference == LOGBOOK_LIVE_BAND_MIX_MODE) return callObj.band;

  if (reference == LOGBOOK_LIVE_BAND_DIGI_MODE) return `${callObj.band}dg`;

  if (reference == LOGBOOK_MIX_BAND_LIVE_MODE) return callObj.mode;

  if (reference == LOGBOOK_MIX_BAND_MIX_MODE) return "";

  if (reference == LOGBOOK_MIX_BAND_DIGI_MODE) return "dg";

  return "";
}

function rosterInFocus()
{
  if (CR.rosterSettings.rosterDelayOnFocus)
  {
    CR.rosterFocus = true;
  }
}

function rosterNoFocus()
{
  CR.rosterFocus = false;
  if (CR.rosterTimeout != null)
  {
    nodeTimers.clearTimeout(CR.rosterTimeout);
    CR.rosterTimeout = null;
    viewRoster();
  }
}

function processRoster()
{
  CR.callRoster = GT.callRoster;
  if (CR.rosterTimeout != null)
  {
    nodeTimers.clearTimeout(CR.rosterTimeout);
    CR.rosterTimeout = null;
  }

  if (CR.rosterFocus)
  {
    CR.rosterTimeout = nodeTimers.setTimeout(viewRoster, CR.rosterSettings.rosterDelayTime);
    rosterDelayDiv.style.display = "inline-block";
  }
  else
  {
    viewRoster();
  }
}

function viewRoster()
{
  CR.rosterTimeout = null;
  rosterDelayDiv.style.display = "none";
  let rosterSettings = prepareRosterSettings();
  processRosterFiltering(CR.callRoster, rosterSettings);
  processRosterHunting(CR.callRoster, rosterSettings);
  renderRoster(CR.callRoster, rosterSettings);

  if (CR.alertTimer != null)
  {
    nodeTimers.clearTimeout(CR.alertTimer);
    CR.alertTimer = null;
  }

  CR.alertTimer = nodeTimers.setTimeout(sendAlerts, 250);
}

function realtimeRoster()
{
  let now = timeNowSec();
  CR.day = parseInt(now / 86400);
  CR.dayAsString = String(CR.day);

  if (CR.rosterSettings.realtime == false) return;

  let timeCols = document.getElementsByClassName("timeCol");
  for (let x = 0; x < timeCols.length; x++)
  {
    let id = timeCols[x].id.substring(2);
    if (id in CR.callRoster)
    {
      timeCols[x].innerHTML = toDHMS(now - CR.callRoster[id].callObj.age);
    }
  }

  let lifeCols = document.getElementsByClassName("lifeCol");
  for (let x = 0; x < lifeCols.length; x++)
  {
    let id = lifeCols[x].id.substring(2);
    if (id in CR.callRoster)
    {
      lifeCols[x].innerHTML = toDHMS(now - CR.callRoster[id].callObj.life);
    }
  }
  
  if (CR.rosterSettings.columns.Spot)
  {
    let spotCols = document.getElementsByClassName("spotCol");
    for (let x = 0; x < spotCols.length; x++)
    {
      let id = spotCols[x].id.substring(2);
      if (id in CR.callRoster)
      {
        spotCols[x].innerHTML = getSpotString(CR.callRoster[id].callObj);
      }
    }
  }
}

function getSpotString(callObj)
{
  let result = "&nbsp;";
  if (callObj.spot && callObj.spot.when > 0)
  {
    when = timeNowSec() - callObj.spot.when;
    if (when <= GT.settings.reception.viewHistoryTimeSec)
    { result = toDHM(parseInt(when)); }
  }
  if (result != "&nbsp;") result += " / " + callObj.spot.snr;
  return result;
}

function initiateQso(thisHash)
{
  window.opener.initiateQso(thisHash);
}

function callLookup(thisHash, grid)
{
  window.opener.startLookup(CR.callRoster[thisHash].DEcall, CR.callRoster[thisHash].grid);
}

function callingLookup(thisHash, grid)
{
  window.opener.startLookup(CR.callRoster[thisHash].DXcall, grid);
}

function callGenMessage(thisHash, grid)
{
  let thisCall = CR.callRoster[thisHash].DEcall;
  let instance = CR.callRoster[thisHash].callObj.instance;

  window.opener.startGenMessages(thisCall, grid, instance);
}

function callingGenMessage(thisHash, grid)
{
  let thisCall = CR.callRoster[thisHash].DXcall;
  let instance = CR.callRoster[thisHash].callObj.instance;

  window.opener.startGenMessages(thisCall, grid, instance);
}

function centerOn(grid)
{
  window.opener.centerOn(grid);
}

function instanceChange(what)
{
  GT.instances[what.id].crEnable = what.checked;
  viewRoster();
}

function updateInstances()
{
  if (GT.instanceCount > 1)
  {
    let instances = GT.instances;
    const html = [];
    let keys = Object.keys(instances).sort();
    for (const key in keys)
    {
      let inst = keys[key];
      if (instances[inst].canRoster)
      {
        let sp = inst.split(" - ");
        let shortInst = sp[sp.length - 1].substring(0, 18);
        let color = "blue";

        if (instances[inst].open == false)
        {
          color = "purple";
        }
        html.push(`<div class='button' style='background-color:${color};'>` +
                  `<input type='checkbox' id='${inst}' onchange='instanceChange(this);' ` +
                  (instances[inst].crEnable ? "checked " : "") +
                  `>&nbsp;${shortInst}</div>`)
      }
    }
    instancesDiv.innerHTML = html.join("");
    instancesWrapper.style.display = "";
  }
  else
  {
    instancesDiv.innerHTML = "";
    instancesWrapper.style.display = "none";
  }
}

function processStatus(newMessage)
{
  if (newMessage.Transmitting == 0)
  {
    // Not Transmitting
    if (newMessage.Decoding == 1)
    {
      // Decoding
      txrxdec.style.backgroundColor = "Blue";
      txrxdec.style.borderColor = "Cyan";
      txrxdec.innerHTML = "DECODE";
    }
    else
    {
      txrxdec.style.backgroundColor = "Green";
      txrxdec.style.borderColor = "GreenYellow";
      txrxdec.innerHTML = "RECEIVE";
    }
  }
  else
  {
    txrxdec.style.backgroundColor = "red";
    txrxdec.style.borderColor = "orange";
    txrxdec.innerHTML = "TRANSMIT";
  }
}

function toTitleCase(str)
{
  return str.replace(/\w\S*/g, function (txt)
  {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

function newOption(value, text)
{
  if (typeof text == "undefined") text = value;
  let option = document.createElement("option");
  option.value = value;
  option.text = text;
  return option;
}

function createSelectOptions(
  selectElementString,
  selectNameDefault,
  forObject,
  altName = null,
  defaultValue = null,
  checkSponsor = null
)
{
  let selector = document.getElementById(selectElementString);
  selector.innerHTML = "";

  let option = document.createElement("option");
  option.value = defaultValue;
  option.text = selectNameDefault;
  option.selected = true;
  option.disabled = true;
  option.style.display = "none";
  selector.appendChild(option);

  let obj = null;
  if (forObject)
  {
    obj = Object.keys(forObject).sort();
  }
  for (const k in obj)
  {
    let opt = obj[k];
    let option = document.createElement("option");
    option.value = opt;
    option.text = altName ? forObject[opt][altName] : opt;
    if (checkSponsor && opt + "-" + checkSponsor in CR.awardTracker)
    { option.disabled = true; }

    selector.appendChild(option);
  }
}

function awardSponsorChanged()
{
  awardName.style.display = "";
  createSelectOptions(
    "awardName",
    "Select Award",
    CR.awards[awardSponsor.value].awards,
    "name",
    null,
    awardSponsor.value
  );
}

function addAwardTracker(sponsor, name, enabled)
{
  let awardToAdd = newAwardTrackerObject(
    sponsor,
    name,
    enabled
  );

  let hash = awardToAdd.name + "-" + awardToAdd.sponsor;
  if (!(hash in CR.awardTracker))
  {
    CR.awardTracker[hash] = awardToAdd;
    storeAwardTracker();
    processAward(hash);
    updateAwardList(hash);
    viewRoster();
  }
  createSelectOptions(
    "awardName",
    "Select Award",
    CR.awards[awardToAdd.sponsor].awards,
    "name",
    null,
    awardToAdd.sponsor
  );
}

function updateAwardList(target = null)
{
  const html = ["<table id='awardTable' class='awardTableCSS' >"];
  html.push("<tr>");
  html.push("<th align='left'>Name</th><th>Award</th><th>Track</th><th></th>");
  html.push("</tr>");
  html.push("</table>");

  AwardWantedList.innerHTML = html.join("");

  let keys = Object.keys(CR.awardTracker).sort();

  for (const key in keys)
  {
    let award = CR.awardTracker[keys[key]];
    let row = awardTable.insertRow();
    row.id = keys[key];
    let baseAward = false;
    let baseCount = 0;

    let endorseCount = 0;
    let endorseTotal = 0;
    let allEndorse = false;

    let tooltip = CR.awards[award.sponsor].awards[award.name].tooltip + " (" + CR.awards[award.sponsor].sponsor + ")\n";
    tooltip += toTitleCase(award.test.look) + " QSO\n";
    for (const mode in award.comp.counts)
    {
      tooltip += mode + "\n";
      for (const count in award.comp.counts[mode])
      {
        endorseTotal++;
        if (award.comp.counts[mode][count].per == 100)
        {
          baseAward = true;
          endorseCount++;
        }
        if (award.comp.counts[mode][count].num > baseCount)
        { baseCount = award.comp.counts[mode][count].num; }

        tooltip += "\t" + award.comp.counts[mode][count].num + "/" + count + " (" + award.comp.counts[mode][count].per + "%)\n";
        let wrk = "";
        if (Object.keys(award.comp.endorse).length > 0)
        {
          for (const band in award.comp.endorse[mode])
          {
            endorseTotal++;
            if (award.comp.endorse[mode][band][count] == true)
            {
              endorseCount++;
              wrk += band + " ";
            }
          }
        }
        if (wrk.length > 0)
        {
          tooltip += "\t\t" + wrk + "\n";
        }
      }
    }
    if (baseCount > 0 && endorseCount == endorseTotal) allEndorse = true;

    let cell = createCellHtml(row, award.name + " - " + award.sponsor);
    cell.style.textAlign = "left";
    cell.style.color = "lightblue";

    createCellHtml(
      row, (allEndorse
        ? "<img src='img/award-trophy.png' height='14px'>"
        : baseAward
          ? "<img src='img/award-medal.png' height='13px'>"
          : baseCount > 0
            ? "<img src='img/award-tally.png' height='15px'>"
            : "<img src='img/award-empty.png' height='12px'>"),
      tooltip
    );
    createCell(row, "enable", award.enable, award.enable, "Toggle Tracking", true);
    createCellHtml(row, "<img title='Remove Tracker' onclick='deleteAwardTracker(this)' style='margin:0;padding:0;margin-top:2px;cursor:pointer;' src='img/award-delete.png' height='12px'>");
  }
}

function deleteAwardTracker(sender)
{
  delete CR.awardTracker[sender.parentNode.parentNode.id];
  storeAwardTracker();
  resetAwardAdd();
  updateAwardList();
  viewRoster();
}

function awardCheckboxChanged(sender)
{
  CR.awardTracker[sender.target.parentNode.parentNode.id][sender.target.name] = sender.target.checked;
  storeAwardTracker();
  viewRoster();
}

function awardValueChanged(sender)
{
  CR.awardTracker[sender.target.parentNode.parentNode.id][sender.target.name] = sender.target.value;
  storeAwardTracker();
  viewRoster();
}

function createCell(row, target, value, data = null, title = null, checkbox = false)
{
  let cell = row.insertCell();
  if (data == null) cell.innerHTML = value;
  if (title) cell.title = title;
  if (checkbox)
  {
    let x = document.createElement("INPUT");
    x.setAttribute("type", "checkbox");
    x.checked = value;
    x.name = target;
    x.addEventListener("change", awardCheckboxChanged);
    cell.appendChild(x);
  }
  else if (data)
  {
    cell.appendChild(createAwardSelector(cell, target, value, data));
  }
  return cell;
}

function createCellHtml(row, html, title = null)
{
  let cell = row.insertCell();
  cell.innerHTML = html;
  if (title) cell.title = title;

  return cell;
}

function createAwardSelector(cell, target, value, forObject)
{
  let selector = document.createElement("select");
  selector.name = target;
  selector.value = value;
  selector.disabled = forObject.length == 1;
  selector.style.margin = "0px";
  selector.style.padding = "1px";
  if (selector.disabled) selector.style.cursor = "auto";
  selector.addEventListener("change", awardValueChanged);
  for (const opt in forObject)
  {
    let option = document.createElement("option");
    option.value = forObject[opt];
    if (option.value == "Phone" || option.value == "CW") option.disabled = true;
    option.text = forObject[opt];
    selector.appendChild(option);
  }
  return selector;
}

function resetAwardAdd()
{
  awardName.style.display = "none";
  createSelectOptions("awardName", "Select Award", null);
  createSelectOptions("awardSponsor", "Select Sponsor", CR.awards, "sponsor");
}

function openAwardPopup()
{
  awardHunterDiv.style.display = "";
  resetAwardAdd();
}

function closeAwardPopup()
{
  awardHunterDiv.style.display = "none";
  resetAwardAdd();
}

function toggleMoreControls()
{
  CR.rosterSettings.controlsExtended = !CR.rosterSettings.controlsExtended;

  setVisual();
}

function setVisual()
{
  referenceNeed.value = GT.activeRoster.logbook.referenceNeed;
  huntNeed.value = GT.activeRoster.logbook.huntNeed;

  if (CR.rosterSettings.controls)
  {
    if (CR.rosterSettings.controlsExtended)
    {
      RosterControls.className = "extended";
      instancesWrapper.style.display = "";
    }
    else
    {
      RosterControls.className = "normal";
      instancesWrapper.style.display = "none";
    }
  }
  else
  {
    RosterControls.className = "hidden";
    instancesWrapper.style.display = "none";
  }

  // Award Hunter
  if (GT.activeRoster.logbook.referenceNeed == LOGBOOK_AWARD_TRACKER)
  {
    huntNeed.style.display = "none";
    onlyHitsDiv.style.display = "none";
    HuntModeControls.style.display = "none";
    huntingMatrixDiv.style.display = "none";

    AwardTrackerControls.style.display = "";
    AwardWantedList.style.display = "";
    updateAwardList();
  }
  else
  {
    for (const key in GT.activeRoster.wanted)
    {
      if (key in window)
      {
        window[key].checked = GT.activeRoster.wanted[key];
        if (GT.activeAudioAlerts.wanted[key] == true)
        {
          window[key].nextElementSibling.nextElementSibling.innerHTML = "<font style='font-size:smaller;' onclick='window.opener.openAudioAlertSettings()'>&#128276;</font>";
        }
        else
        {
          window[key].nextElementSibling.nextElementSibling.innerHTML = "";
        }
      }
    }

    AwardTrackerControls.style.display = "none";
    AwardWantedList.style.display = "none";
    closeAwardPopup();

    HuntModeControls.style.display = "";
    huntingMatrixDiv.style.display = "";
    huntNeed.style.display = "";
    onlyHitsDiv.style.display = "";
  }

  usesLoTWDiv.style.display = (GT.settings.callsignLookups.lotwUseEnable) ? "" : "none";
  useseQSLDiv.style.display = (GT.settings.callsignLookups.eqslUseEnable) ? "" : "none";
  usesOQRSDiv.style.display = (GT.settings.callsignLookups.oqrsUseEnable) ? "" : "none";
  onlySpotDiv.style.display = (CR.rosterSettings.columns.Spot) ? "" : "none";
  huntingMatrixPotaDiv.style.display = (GT.settings.app.potaFeatureEnabled && GT.settings.map.offlineMode == false) ? "" : "none";
  rosterBody.style.display = "block";
  
  resize();
}

function wantedChanged(element)
{
  GT.activeRoster.wanted[element.id] = element.checked;

  if (element.checked == true)
  {
    let id = element.id.replace("hunt", "");

    if (id in CR.rosterSettings.columns)
    {
      CR.rosterSettings.columns[id] = true;
      if (id in CR.columnMembers)
      {
        CR.columnMembers[id].checked = true;
      }
    }
  }

  resetAlertReporting(true, false);
  setVisual();
  viewRoster();
}


// Incoming from GT window
function wantedValuesChangedFromAudioAlerts()
{
  resetAlertReporting(false, true);
  setVisual();
  viewRoster();
}

// Incoming from GT window
function huntingValueChangedFromAudioAlerts(id, value)
{
  if (id in window)
  {
    if (window[id].type == "checkbox")
    {
      CR.rosterSettings[id] = window[id].checked = value;
    }
    else
    {
      CR.rosterSettings[id] = window[id].value = value;
    }
    resetAlertReporting(true, true);
    setVisual();
    viewRoster();
  }
}

function logbookValuesChanged()
{
  GT.activeRoster.logbook.referenceNeed = referenceNeed.value;
  GT.activeRoster.logbook.huntNeed = huntNeed.value;
  setVisual();
  window.opener.setVisualAudioAlerts();
}

function huntingValueChanged(element)
{
  let id = element.id
  
  if (id in CR.rosterSettings)
  {
    let value;
    if (element.type == "checkbox")
    {
      value = CR.rosterSettings[id] = element.checked;
    }
    else
    {
      value = CR.rosterSettings[id] = element.value;
      let view = id + "View";
      if (view in window)
      {
        window[view].innerHTML = element.value;
      }
    }
    window.opener.huntingValueChangedFromCallRoster(id, value);
  }

  maxLoTWView.innerHTML = CR.rosterSettings.maxLoTW < 27 ? toYM(Number(CR.rosterSettings.maxLoTW)) : "<b>&infin;</b>";

  resetAlertReporting(true, true);
  setVisual();
  viewRoster();
}

function resetAlertReporting(clearRoster, clearAudio)
{
  for (const callHash in CR.callRoster)
  {
    if (clearRoster) GT.callRoster[callHash].callObj.rosterAlerted = false;
    if (clearAudio) GT.callRoster[callHash].callObj.audioAlerted = false;
  }
}

function loadFilterSettings()
{
  let filters = "";
  for (const filter in CR.rosterSettings.displayFilters)
  {
    let slider = document.getElementById("filter" + filter + "Slider");

    if (slider)
    {
      slider.value = CR.rosterSettings.displayFilters[filter];
      let td = document.getElementById("filter" + filter + "Td");

      if (filter == "invert")
      {
        if (slider.value > 49 ) slider.value = 100;
        if (slider.value <= 49) slider.value = 0;
      }
      
      if (filter == "huerotate")
      {
        td.innerHTML = slider.value + " deg";
        filters += "hue-rotate(" + slider.value + "deg) ";
      }
      else 
      {
        td.innerHTML = slider.value + "%";
        filters += filter + "(" + slider.value + "%) ";
      }
    }
  }
  document.documentElement.style.filter = filters;
}

function filtersChanged()
{
  for (const filter in CR.rosterSettings.displayFilters)
  {
    let slider = document.getElementById("filter" + filter + "Slider");

    if (slider)
    {
      CR.rosterSettings.displayFilters[filter] = slider.value;
    }
    else
    {
      // no longer a filter, get rid of it
      delete CR.rosterSettings.displayFilters[filter];
    }
  }
  loadFilterSettings();
}

function resetFilters()
{
  for (const filter in CR.rosterSettings.displayFilters)
  {
    CR.rosterSettings.displayFilters[filter] = CR.def_displayFilters[filter];
  }
  loadFilterSettings();
}

function initSelectors()
{
  for (const column in ROSTER_COLUMNS)
  {
    if (column != "Callsign")
    {
      let option = newOption(column, column);
      if (column == CR.rosterSettings.compactEntity)
      {
        option.selected = true;
      }
      compactEntitySelect.appendChild(option);
    }
  }

  let items = Object.keys(GT.dxccToAltName).sort(function (a, b)
  {
    return GT.dxccToAltName[a].localeCompare(
      GT.dxccToAltName[b]
    );
  });

  for (const i in items)
  {
    let key = items[i];
    if (GT.dxccInfo[key].geo != "deleted")
    {
      let option = document.createElement("option");
      option.value = key;
      option.text = GT.dxccToAltName[key] + " (" + GT.dxccInfo[key].pp + ")";
      // Note: do not use cloneNode on elements/nodes that have ids
      ignoreCqDxccSelect.appendChild(option.cloneNode(true));
      ignoreDxccSelect.appendChild(option.cloneNode(true));
    }
  }

  items = Object.keys(GT.cqZones).sort();
  for (const i in items)
  {
    let key = items[i];
    let option = document.createElement("option");
    option.value = key;
    option.text = key + " - " + GT.cqZones[key].name;
    ignoreCqzSelect.appendChild(option);
  }

  items = Object.keys(GT.ituZones).sort();
  for (const i in items)
  {
    let key = items[i];
    let option = document.createElement("option");
    option.value = key;
    option.text = key;
    ignoreItuzSelect.appendChild(option);
  }

  CR.ignoreTypeInputs = {};
  CR.ignoreTypeInputs.Callsign = ignoreCallsignValue;
  CR.ignoreTypeInputs.Grid = ignoreGridValue;
  CR.ignoreTypeInputs.CQ = ignoreCqDiv;
  CR.ignoreTypeInputs.DXCC = ignoreDxccSelect;
  CR.ignoreTypeInputs.CQz = ignoreCqzSelect;
  CR.ignoreTypeInputs.ITUz = ignoreItuzSelect;

  ignoreTypeChanged("Callsign");
  watcherTypeChanged("Callsign");
}

function hideIgnoreElements()
{
  ignoreCallsignValue.style.display = "none";
  ignoreGridValue.style.display = "none";
  ignoreCqDiv.style.display = "none";
  ignoreDxccSelect.style.display = "none";
  ignoreCqzSelect.style.display = "none";
  ignoreItuzSelect.style.display = "none";
}

CR.ignoreType = "Callsign";

function ignoreTypeChanged(ignoreTypeValue)
{
  hideIgnoreElements();
  CR.ignoreTypeInputs[ignoreTypeValue].style.display = "";
  if (CR.ignoreType != ignoreTypeValue)
  {
    ingnoreAddResultLabel.innerHTML = "";
    CR.ignoreType = ignoreTypeValue;
  }
  ValidateTextInput(ignoreCallsignValue);
  gridInputValidate(ignoreGridValue);
  ValidateTextInput(ignoreCqCallsignValue);
}

function gridInputValidate(element)
{
  element.value = element.value.toUpperCase().replace(/[^A-Z0-9/]+/g, "").substr(0, 4);
  if (!element.value.match(GRID_REGEXP))
  {
    element.style.color = "#000";
    element.style.backgroundColor = "yellow";
  }
  else
  {
    element.style.color = "";
    element.style.backgroundColor = "";
  }
}

function addNewIgnore()
{
  if (CR.ignoreType == "Callsign")
  {
    if (ValidateTextInput(ignoreCallsignValue, ingnoreAddResultLabel))
    {
      ignoreCallsign(ignoreCallsignValue.value);
    }
  }
  else if (CR.ignoreType == "CQ")
  {
    if (ValidateTextInput(ignoreCqCallsignValue, ingnoreAddResultLabel))
    {
      ignoreCQ("CQ " + ignoreCqCallsignValue.value, ignoreCqDxccSelect.value);
    }
  }
  else if (CR.ignoreType == "DXCC")
  {
    ignoreDxcc(ignoreDxccSelect.value);
  }
  else if (CR.ignoreType == "Grid")
  {
    ignoreGrid(ignoreGridValue.value);
  }
  else if (CR.ignoreType == "CQz")
  {
    ignoreCQz(ignoreCqzSelect.value)
  }
  else if (CR.ignoreType == "ITUz")
  {
    ignoreITUz(ignoreItuzSelect.value);
  }
}

function updateWorked()
{
  CR.modes = GT.modes;
  CR.modes_phone = GT.modes_phone;

  processAllAwardTrackers();
}

function deleteCallsignIgnore(key)
{
  delete CR.ignoredCalls[key];
  storeBlocks();
  viewRoster();
}

function ignoreCallsign(callsign)
{
  CR.ignoredCalls[callsign] = true;
  storeBlocks();
  viewRoster();
}

function ignoreDxcc(dxcc)
{
  CR.ignoredDxcc[dxcc] = true;
  storeBlocks();
  viewRoster();
}

function ignoreGrid(grid)
{
  CR.ignoredGrid[grid] = true;
  storeBlocks();
  viewRoster();
}

function ignoreCQ(cq, dxcc)
{
  if (dxcc > 0)
  {
    CR.ignoredCQ[cq + ":" + dxcc] = true;
  }
  else
  {
    CR.ignoredCQ[cq] = true;
  }

  storeBlocks();
  viewRoster();
}

function ignoreCQz(cqz)
{
  CR.ignoredCQz[cqz] = true;
  storeBlocks();
  viewRoster();
}

function ignoreITUz(ituz)
{
  CR.ignoredITUz[ituz] = true;
  storeBlocks();
  viewRoster();
}

function deleteDxccIgnore(key)
{
  delete CR.ignoredDxcc[key];
  storeBlocks();
  viewRoster();
}

function deleteGridIgnore(key)
{
  delete CR.ignoredGrid[key];
  storeBlocks();
  viewRoster();
}

function deleteCQIgnore(key)
{
  delete CR.ignoredCQ[key];
  storeBlocks();
  viewRoster();
}

function deleteCQzIgnore(key)
{
  delete CR.ignoredCQz[key];
  storeBlocks();
  viewRoster();
}

function deleteITUzIgnore(key)
{
  delete CR.ignoredITUz[key];
  storeBlocks();
  viewRoster();
}

function clearAllCallsignIgnores()
{
  CR.ignoredCalls = Object();
  storeBlocks();
  viewRoster();
}

function clearAllDxccIgnores()
{
  CR.ignoredDxcc = Object();
  storeBlocks();
  viewRoster();
}

function clearAllGridIgnores()
{
  CR.ignoredGrid = Object();
  storeBlocks();
  viewRoster();
}

function clearAllCQIgnores()
{
  CR.ignoredCQ = Object();
  storeBlocks();
  viewRoster();
}

function clearAllCQzIgnores()
{
  CR.ignoredCQz = Object();
  storeBlocks();
  viewRoster();
}

function clearAllITUzIgnores()
{
  CR.ignoredITUz = Object();
  storeBlocks();
  viewRoster();
}

function openSettings()
{
  openInfoTab("generalbox", "generalSettingsDiv");
  settingsDiv.style.display = "inline-block";
}

function openWatcher()
{
  openInfoTab("watcherbox", "watcherBoxDiv", openWatchersTab);
  settingsDiv.style.display = "inline-block";
}

function openExceptions()
{
  openInfoTab("exceptionsbox", "exceptionsBoxDiv");
  settingsDiv.style.display = "inline-block";
}

function openIgnores()
{
  openInfoTab("ingoresbox", "ignoresBoxDiv", renderIgnoresTab);
  settingsDiv.style.display = "inline-block";
}

function closeSettings()
{
  settingsDiv.style.display = "none";
}

function renderIgnoresTab()
{
  const html = [];
  let clearString = "<th>none</th>";
  if (Object.keys(CR.ignoredCalls).length > 0)
  {
    clearString = "<th style='cursor:pointer;' onclick='clearAllCallsignIgnores()'>Clear All</th>";
    html.push("<div class='ignoresTables'><table class='darkTable' align=center><tr><th align=left>Callsigns</th>" + clearString + "</tr>");
    Object.keys(CR.ignoredCalls)
      .sort()
      .forEach(function (key, i)
      {
        html.push("<tr><td align=left style='color:#FFFF00;' >" + key + "</td><td style='cursor:pointer;' onclick='deleteCallsignIgnore(\"" + key + "\")'><img src='img/trash_24x48.png' style='height:17px;margin:-1px;margin-bottom:-3px;padding:0px'></td></tr>");
      });
    html.push("</table></div>");
  }

  if (Object.keys(CR.ignoredCQ).length > 0)
  {
    clearString = "<th style='cursor:pointer;' onclick='clearAllCQIgnores()'>Clear All</th>";
    html.push("<div class='ignoresTables'><table class='darkTable' align=center><tr><th align=left>CQ</th>" + clearString + "</tr>");
    Object.keys(CR.ignoredCQ)
      .sort()
      .forEach(function (rawKey, i)
      {
        let split = rawKey.split(":");
        let key = split[0];
        let dxcc = -1;
        if (split.length == 2) dxcc = parseInt(split[1]);
        html.push("<tr><td align=left style='color:lightgreen;' >" + key + " from " + (dxcc == -1 ? "All" : GT.dxccToAltName[dxcc]) + "</td><td style='cursor:pointer;' onclick='deleteCQIgnore(\"" + rawKey + "\")'><img src='img/trash_24x48.png' style='height:17px;margin:-1px;margin-bottom:-3px;padding:0px'></td></tr>");
      });
    html.push("</table></div>");
  }

  if (Object.keys(CR.ignoredDxcc).length > 0)
  {
    clearString = "<th style='cursor:pointer;' onclick='clearAllDxccIgnores()'>Clear All</th>";
    html.push("<div class='ignoresTables'><table class='darkTable' align=center><tr><th align=left>DXCC</th>" + clearString + "</tr>");
    Object.keys(CR.ignoredDxcc)
      .sort()
      .forEach(function (key, i)
      {
        html.push("<tr><td align=left style='color:#FFA500' >" + GT.dxccToAltName[key] + " (" + GT.dxccInfo[key].pp + ")</td><td style='cursor:pointer;' onclick='deleteDxccIgnore(\"" + key + "\")'><img src='img/trash_24x48.png' style='height:17px;margin:-1px;margin-bottom:-3px;padding:0px'></td></tr>");
      });
    html.push("</table></div>");
  }

  if (Object.keys(CR.ignoredGrid).length > 0)
  {
    clearString = "<th style='cursor:pointer;' onclick='clearAllGridIgnores()'>Clear All</th>";
    html.push("<div class='ignoresTables'><table class='darkTable' align=center><tr><th align=left>Grid</th>" + clearString + "</tr>");
    Object.keys(CR.ignoredGrid)
      .sort()
      .forEach(function (key, i)
      {
        html.push("<tr><td align=left style='color:cyan' >" + key + "</td><td style='cursor:pointer;' onclick='deleteGridIgnore(\"" + key + "\")'><img src='img/trash_24x48.png' style='height:17px;margin:-1px;margin-bottom:-3px;padding:0px'></td></tr>");
      });
    html.push("</table></div>");
  }

  if (Object.keys(CR.ignoredCQz).length > 0)
  {
    clearString = "<th style='cursor:pointer;' onclick='clearAllCQzIgnores()'>Clear All</th>";
    html.push("<div class='ignoresTables' ><table class='darkTable' align=center><tr><th align=left>CQ Zones</th>" + clearString + "</tr>");
    Object.keys(CR.ignoredCQz)
      .sort()
      .forEach(function (key, i)
      {
        html.push("<tr><td align=left style='color:cyan;' >" + key + "</td><td style='cursor:pointer;' onclick='deleteCQzIgnore(\"" + key + "\")'><img src='img/trash_24x48.png' style='height:17px;margin:-1px;margin-bottom:-3px;padding:0px'></td></tr>");
      });
    html.push("</table></div>");
  }

  if (Object.keys(CR.ignoredITUz).length > 0)
  {
    clearString = "<th style='cursor:pointer;' onclick='clearAllITUzIgnores()'>Clear All</th>";
    html.push("<div class='ignoresTables'><table class='darkTable' align=center><tr><th align=left>ITU Zones</th>" + clearString + "</tr>");
    Object.keys(CR.ignoredITUz)
      .sort()
      .forEach(function (key, i)
      {
        html.push("<tr><td align=left style='color:cyan;' >" + key + "</td><td style='cursor:pointer;' onclick='deleteITUzIgnore(\"" + key + "\")'><img src='img/trash_24x48.png' style='height:17px;margin:-1px;margin-bottom:-3px;padding:0px'></td></tr>");
      });
    html.push("</table></div>");
  }

  ignoresEditView.innerHTML = html.join("");
  ignoresBoxDiv.style.height = (window.innerHeight - 50) + "px";

  let elems = document.getElementsByClassName("ignoresTables");
  for (let x = 0; x < elems.length; x++)
  {
    let height = 110;
    if (elems[x].offsetHeight > window.innerHeight - height)
    {
      elems[x].style.height = (window.innerHeight - height) + "px";
    }
  }
}


function onMyKeyDown(event)
{
  if (event.keyCode == 27)
  {
    closeSettings();
  }

  if (event.ctrlKey == true)
  {
    if (event.code == "KeyL")
    {
      resetFilters();
    }
    else if (event.code == "KeyS")
    {
      openSettings();
    }
    else if (event.code == "KeyW" || event.code == "KeyO")
    {
      openWatcher();
    }
    else if (event.code == "KeyE")
    {
      openExceptions();
    }
    else if (event.code == "KeyI")
    {
      openIgnores();
    }
    else if (event.code == "KeyL")
    {
      usesLoTW.checked = !usesLoTW.checked;
      huntingValueChanged(usesLoTW);
    }
  }
}

function blurOnEnter(ele)
{
  if (event.key == "Enter")
  {
    ele.blur();
  }
}

function resize()
{
  if (GT.callRosterWindowInitialized == false) return;

  if (ignoresBoxDiv.style.display != "none")
  {
    renderIgnoresTab();
  }

  wantRenderWatchersTab();

  viewRoster();
  // tagdo, why?
  window.opener.goProcessRoster();
}

function init()
{
  loadSettings();

  CR.callsignDatabaseDXCC = GT.callsignDatabaseDXCC;
  CR.callsignDatabaseUS = GT.callsignDatabaseUS;
  CR.callsignDatabaseUSplus = GT.callsignDatabaseUSplus;

  loadAwardJson();
  updateWorked();
  loadFilterSettings();
  updateInstances();
  loadRosterI18n();
  setRosterTop();
  createActiveAwardsFromSettings();
  registerCutAndPasteContextMenu();
  
  GT.callRosterWindowInitialized = true;
}

function toggleShowControls()
{
  CR.rosterSettings.controls = !CR.rosterSettings.controls;
  setVisual();
}

// called from i18n.js
function addControls()
{
  WANTED_LABELS = {
    cont: I18N("rosterColumns.Wanted.cont"),
    cqz: I18N("rosterColumns.Wanted.cqz"),
    ituz: I18N("rosterColumns.Wanted.ituz"),
    dxcc: I18N("rosterColumns.Wanted.dxcc"),
    dxm: I18N("rosterColumns.Wanted.dxm"),
    state: I18N("rosterColumns.Wanted.state"),
    grid: I18N("rosterColumns.Wanted.grid"),
    cnty: I18N("rosterColumns.Wanted.cnty"),
    wpx: I18N("rosterColumns.Wanted.wpx"),
    call: I18N("rosterColumns.Wanted.call"),
    watcher: I18N("roster.watcher.label"),
    oams: I18N("rosterColumns.Wanted.oams"),
    pota: I18N("rosterColumns.Wanted.pota")
  }

  window.opener.setRosterSpot(CR.rosterSettings.columns.Spot);

  for (const key in GT.activeRoster.wanted)
  {
    if (key in window)
    { 
      window[key].checked = GT.activeRoster.wanted[key]; 
    }
  }

  createMenuHide();
  createMenuShow();
  createCompactMenuHide();
  createCompactMenuShow();
  createRestOfMenus();

  referenceNeed.value = GT.activeRoster.logbook.referenceNeed;
  huntNeed.value = GT.activeRoster.logbook.huntNeed;

  requireGrid.checked = CR.rosterSettings.requireGrid;

  wantMaxDT.checked = CR.rosterSettings.wantMaxDT;
  wantMinDB.checked = CR.rosterSettings.wantMinDB;
  wantMinFreq.checked = CR.rosterSettings.wantMinFreq;
  wantMaxFreq.checked = CR.rosterSettings.wantMaxFreq;
  wantRRCQ.checked = CR.rosterSettings.wantRRCQ;

  maxDTView.innerHTML = maxDT.value = CR.rosterSettings.maxDT;
  minDbView.innerHTML = minDb.value = CR.rosterSettings.minDb;
  minFreqView.innerHTML = minFreq.value = CR.rosterSettings.minFreq;
  maxFreqView.innerHTML = maxFreq.value = CR.rosterSettings.maxFreq;

  maxLoTW.value = CR.rosterSettings.maxLoTW;
  maxLoTWView.innerHTML = maxLoTW.value < 27 ? toYM(Number(maxLoTW.value)) : "<b>&infin;</b>";

  onlyHits.checked = CR.rosterSettings.onlyHits;
  cqOnly.checked = CR.rosterSettings.cqOnly;
  noMyDxcc.checked = CR.rosterSettings.noMyDxcc;
  onlyMyDxcc.checked = CR.rosterSettings.onlyMyDxcc;

  usesLoTW.checked = CR.rosterSettings.usesLoTW;
  useseQSL.checked = CR.rosterSettings.useseQSL;
  onlySpot.checked = CR.rosterSettings.onlySpot;
  usesOQRS.checked = CR.rosterSettings.usesOQRS;

  allOnlyNew.checked = CR.rosterSettings.allOnlyNew;

  clearRosterOnBandChange.checked = CR.rosterSettings.clearRosterOnBandChange;
  rosterAlwaysOnTop.checked = CR.rosterSettings.rosterAlwaysOnTop;
  rosterDelayOnFocus.checked = CR.rosterSettings.rosterDelayOnFocus;
  displayDelayOnFocus();
  rosterDelayTime.value = CR.rosterSettings.rosterDelayTime;
  rosterDelayTimeTd.innerHTML = rosterDelayTime.value + "ms";
  setRosterTimeView();
  setCompactView();
  initSelectors();
  setVisual();
  document.addEventListener("keydown", onMyKeyDown, false);
  CR.timerInterval = nodeTimers.setInterval(realtimeRoster, 1000);
  updateInstances();
}

function setCompactView()
{
  compactModeDiv.innerHTML = CR.rosterSettings.compact ? I18N("roster.menu.RosterMode") : I18N("roster.menu.CompactMode");
  compactEnityDiv.style.display = CR.rosterSettings.compact ? "" : "none";
}

function compactModeChanged()
{
  CR.rosterSettings.compact = !CR.rosterSettings.compact;
  setCompactView();
  viewRoster();
}

function compactEntityChanged()
{
  CR.rosterSettings.compactEntity = compactEntitySelect.value;
  viewRoster();
}

function clearRosterOnBandChangeValueChanged(what)
{
  CR.rosterSettings.clearRosterOnBandChange = clearRosterOnBandChange.checked;
}

function rosterDelayOnFocusValueChanged(what)
{
  CR.rosterSettings.rosterDelayOnFocus = rosterDelayOnFocus.checked;
  displayDelayOnFocus();
}

function displayDelayOnFocus()
{
  if (CR.rosterSettings.rosterDelayOnFocus)
  {
    rosterDelayTimeTd.style.display = "block";
    rosterDelayTime.style.display = "block";
  }
  else
  {
    rosterDelayTimeTd.style.display = "none";
    rosterDelayTime.style.display = "none";
  }
}

function changeRosterDelayTime()
{
  CR.rosterSettings.rosterDelayTime = rosterDelayTime.value;
  rosterDelayTimeTd.innerHTML = rosterDelayTime.value + "ms";
}

function changeRosterTime()
{
  CR.rosterSettings.rosterTime = rosterTime.value;
  setRosterTimeView();
  viewRoster();
}

function changeRosterTop(butt)
{
  CR.rosterSettings.rosterAlwaysOnTop = butt.checked;
  setRosterTop();
}

function setRosterTop()
{
  electron.ipcRenderer.send("setAlwaysOnTop", "gt_roster", CR.rosterSettings.rosterAlwaysOnTop);
}

function setRosterTimeView()
{
  rosterTime.value = CR.rosterSettings.rosterTime;
  rosterTimeTd.innerHTML = toDHMS(Number(rosterTime.value));
}

function handleContextMenu(ev)
{
  let mouseX = Math.round(ev.x);
  let mouseY = Math.round(ev.y);

  if (typeof ev.target != "undefined")
  {
    if (ev.target.className == "inputTextValue") return true;

    let name = "";
    let target = ev.target;
    let parent = ev.target.parentNode;
    if (target.tagName == "SPAN")
    {
      target = ev.target.parentNode;
      parent = target.parentNode;
    }
    if (target.tagName == "TD" || (CR.rosterSettings.compact && target.tagName == "DIV"))
    {
      name = target.getAttribute("name");
    }
    if (CR.rosterSettings.compact && name != "Callsign")
    {
      parent = parent.parentNode;
    }
    if (name == "Callsign")
    {
      CR.targetHash = parent.id;
      CR.callMenu.popup();
    }
    else if (name == "Calling")
    {
      CR.targetHash = parent.id;
      CR.callingMenu.popup();
    }
    else if (name == "Msg")
    {
      CR.targetHash = parent.id;
      CR.MsgMenu.popup();
    }
    else if (name == "Grid")
    {
      if (CR.callRoster[parent.id].callObj.grid.length == 4)
      {
        CR.targetHash = parent.id;
        CR.GridMenu.popup();
      }
    }
    else if (name == "CQ")
    {
      if (CR.callRoster[parent.id].DXcall != "CQ")
      {
        CR.targetCQ = parent.id;
        CR.CQMenu.popup();
      }
    }
    else if (name == "CQz")
    {
      CR.targetCQz = parent.id;
      CR.CQzMenu.popup();
    }
    else if (name == "ITUz")
    {
      CR.targetITUz = parent.id;
      CR.ITUzMenu.popup();
    }
    else if (name && name.startsWith("DXCC"))
    {
      let dxcca = name.split("(");
      let dxcc = parseInt(dxcca[1]);
      CR.targetDxcc = dxcc;
      CR.dxccMenu.popup();
    }
    else
    {
      if (CR.rosterSettings.compact)
      {
        CR.rosterSettings.controls ? CR.compactMenuHide.popup() : CR.compactMenuShow.popup();
      }
      else
      {
        if (target.tagName == "TH" && target.getAttribute("name"))
        {
          CR.currentColumnName = target.getAttribute("name");
          CR.columnMenu.popup();
        }
        else
        {
          CR.rosterSettings.controls ? CR.menuHide.popup() : CR.menuShow.popup();
        }
      }
    }
  }
  else
  {
    if (CR.rosterSettings.compact == false)
    {
      CR.menu.popup();
    }
    else
    {
      CR.compactMenu.popup();
    }
  }

  ev.preventDefault();

  return false;
}

function getTypeFromMode(mode)
{
  if (mode in CR.modes)
  {
    if (CR.modes[mode] == true) return "Digital";
    else if (CR.modes_phone[mode] == true) return "Phone";
  }
  return "";
}

function testAward(awardName, obj)
{

   if (
    CR.awardTracker[awardName].test.dxcc &&
    CR.awardTracker[awardName].rule.dxcc.indexOf(obj.dxcc) == -1
  )
  { return false; }

  if (
    CR.awardTracker[awardName].test.mode &&
    CR.awardTracker[awardName].rule.mode.indexOf(obj.mode) == -1
  )
  { return false; }

  if (
    CR.awardTracker[awardName].test.band &&
    CR.awardTracker[awardName].rule.band.indexOf(obj.band) == -1
  )
  { return false; }

  if (
    CR.awardTracker[awardName].test.DEcall &&
    CR.awardTracker[awardName].rule.call.indexOf(obj.DEcall) == -1
  )
  { return false; }

  if (
    CR.awardTracker[awardName].test.cont &&
    CR.awardTracker[awardName].rule.cont.indexOf(obj.cont) == -1
  )
  { return false; }

  if (
    CR.awardTracker[awardName].test.prop &&
    CR.awardTracker[awardName].rule.propMode != obj.propMode
  )
  { return false; }


  let baseHash = "";
  if (CR.awardTracker[awardName].test.band) baseHash += obj.band;
  if (CR.awardTracker[awardName].test.mode) baseHash += obj.mode;

  return CR.awardTypes[CR.awardTracker[awardName].rule.type].test(
    CR.awardTracker[awardName],
    obj,
    baseHash
  );
}

function processAward(awardName)
{
  let award =
    CR.awards[CR.awardTracker[awardName].sponsor].awards[
      CR.awardTracker[awardName].name
    ];
  CR.awardTracker[awardName].rule = award.rule;
  let test = (CR.awardTracker[awardName].test = {});
  let mode = award.rule.mode.slice();

  let Index = mode.indexOf("Mixed");
  if (Index > -1) mode.splice(Index, 1);

  Index = mode.indexOf("Digital");
  if (Index > -1) mode.splice(Index, 1);

  Index = mode.indexOf("Phone");
  if (Index > -1) mode.splice(Index, 1);
 
  test.mode = mode.length > 0;
  test.confirmed = "qsl_req" in CR.awards[CR.awardTracker[awardName].sponsor].awards[CR.awardTracker[awardName].name].rule ? CR.awards[CR.awardTracker[awardName].sponsor].awards[CR.awardTracker[awardName].name].rule.qsl_req == "confirmed" : CR.awards[CR.awardTracker[awardName].sponsor].qsl_req == "confirmed";
  test.look = "qsl_req" in CR.awards[CR.awardTracker[awardName].sponsor].awards[CR.awardTracker[awardName].name].rule ? CR.awards[CR.awardTracker[awardName].sponsor].awards[CR.awardTracker[awardName].name].rule.qsl_req : CR.awards[CR.awardTracker[awardName].sponsor].qsl_req;
  test.DEcall = "call" in award.rule;
  test.band = "band" in award.rule && award.rule.band.indexOf("Mixed") == -1;
  test.dxcc = "dxcc" in award.rule;
  test.cont = "cont" in award.rule;
  test.grid = "grid" in award.rule;
  test.prop = "propMode" in award.rule;

  CR.awardTracker[awardName].stat = {};

  for (const i in GT.QSOhash)
  {
    let obj = GT.QSOhash[i];

    if (test.confirmed && !obj.confirmed) continue;

    if (obj.dxcc < 1) continue;

    if (test.grid && award.rule.grid.indexOf(obj.grid.substring(0, 4)) == -1) continue;

    if (test.dxcc && award.rule.dxcc.indexOf(obj.dxcc) == -1) continue;

    if (test.mode && award.rule.mode.indexOf(obj.mode) == -1) continue;

    if (test.band && award.rule.band.indexOf(obj.band) == -1) continue;

    if (test.DEcall && award.rule.call.indexOf(obj.DEcall) == -1) continue;

    if (test.cont && award.rule.cont.indexOf(obj.cont) == -1) continue;

    if (test.prop && award.rule.propMode != obj.propMode) continue;

    CR.awardTypes[award.rule.type].score(CR.awardTracker[awardName], obj);
  }

  CR.awardTracker[awardName].comp = CR.awardTypes[award.rule.type].compile(
    CR.awardTracker[awardName],
    CR.awardTracker[awardName].stat
  );
  CR.awardTracker[awardName].stat = {};
}

function newAwardCountObject()
{
  let statCountObject = {};

  statCountObject.bands = {};
  statCountObject.bands.Mixed = {};
  statCountObject.bands.Digital = {};
  statCountObject.bands.Phone = {};
  statCountObject.modes = {};
  statCountObject.modes.Mixed = {};
  statCountObject.modes.Digital = {};
  statCountObject.modes.Phone = {};
  statCountObject.unique = null;
  return statCountObject;
}

function workAwardObject(obj, band, mode, isDigital, isPhone, unique = null)
{
  obj.bands.Mixed[band] = ~~obj.bands.Mixed[band] + 1;
  if (!(mode in obj.bands)) obj.bands[mode] = {};
  obj.bands[mode][band] = ~~obj.bands[mode][band] + 1;
  obj.modes.Mixed[mode] = ~~obj.modes.Mixed[mode] + 1;

  if (isDigital)
  {
    obj.bands.Digital[band] = ~~obj.bands.Digital[band] + 1;
    obj.modes.Digital[mode] = ~~obj.modes.Digital[mode] + 1;
  }
  if (isPhone)
  {
    obj.bands.Phone[band] = ~~obj.bands.Phone[band] + 1;
    obj.modes.Phone[mode] = ~~obj.modes.Phone[mode] + 1;
  }
  if (unique)
  {
    if (obj.unique == null) obj.unique = {};
    if (!(unique in obj.unique)) obj.unique[unique] = newAwardCountObject();
    workAwardObject(obj.unique[unique], band, mode, isDigital, isPhone);
  }
  return true;
}

function buildAwardTypeHandlers()
{
  CR.awardTypes = {
    IOTA: { name: "Islands On The Air" },
    call: { name: "Callsign" },
    callarea: { name: "Call Area" },
    calls2dxcc: { name: "Stations per DXCC" },
    cnty: { name: "County" },
    cont: { name: "Continents" },
    cont5: { name: "5 Continents" },
    cont52band: { name: "5 Continents per Band" },
    cqz: { name: "CQ Zone" },
    dxcc: { name: "DXCC" },
    grids: { name: "Grids" },
    numsfx: { name: "Call Area + Suffix" },
    px: { name: "Prefix" },
    pxa: { name: "Prefixes" },
    pxplus: { name: "Special Calls" },
    sfx: { name: "Suffix" },
    states: { name: "States" },
    cont2band: { name: "Continents per Band" },
    calls2band: { name: "Stations per Band" },
    dxcc2band: { name: "DXCC per Band" },
    states2band: { name: "States per Band" }
  };

  CR.awardTypes.IOTA.score = scoreAIOTA;
  CR.awardTypes.call.score = scoreAcall;
  CR.awardTypes.callarea.score = scoreAcallarea;
  CR.awardTypes.calls2dxcc.score = scoreAcalls2dxcc;
  CR.awardTypes.cnty.score = scoreAcnty;
  CR.awardTypes.cont.score = scoreAcont;
  CR.awardTypes.cont5.score = scoreAcont5;
  CR.awardTypes.cont52band.score = scoreAcont52band;
  CR.awardTypes.cqz.score = scoreAcqz;
  CR.awardTypes.dxcc.score = scoreAdxcc;
  CR.awardTypes.grids.score = scoreAgrids;
  CR.awardTypes.numsfx.score = scoreAnumsfx;
  CR.awardTypes.px.score = scoreApx;
  CR.awardTypes.pxa.score = scoreApxa;
  CR.awardTypes.pxplus.score = scoreApxplus;
  CR.awardTypes.sfx.score = scoreAsfx;
  CR.awardTypes.states.score = scoreAstates;
  CR.awardTypes.cont2band.score = scoreAcont2band;
  CR.awardTypes.calls2band.score = scoreAcalls2band;
  CR.awardTypes.dxcc2band.score = scoreAdxcc2band;
  CR.awardTypes.states2band.score = scoreAstates2band;

  CR.awardTypes.IOTA.test = testAIOTA;
  CR.awardTypes.call.test = testAcall;
  CR.awardTypes.callarea.test = testAcallarea;
  CR.awardTypes.calls2dxcc.test = testAcalls2dxcc;
  CR.awardTypes.cnty.test = testAcnty;
  CR.awardTypes.cont.test = testAcont;
  CR.awardTypes.cont5.test = testAcont5;
  CR.awardTypes.cont52band.test = testAcont52band;
  CR.awardTypes.cqz.test = testAcqz;
  CR.awardTypes.dxcc.test = testAdxcc;
  CR.awardTypes.grids.test = testAgrids;
  CR.awardTypes.numsfx.test = testAnumsfx;
  CR.awardTypes.px.test = testApx;
  CR.awardTypes.pxa.test = testApxa;
  CR.awardTypes.pxplus.test = testApxplus;
  CR.awardTypes.sfx.test = testAsfx;
  CR.awardTypes.states.test = testAstates;
  CR.awardTypes.cont2band.test = testAcont2band;
  CR.awardTypes.calls2band.test = testAcalls2band;
  CR.awardTypes.dxcc2band.test = testAdxcc2band;
  CR.awardTypes.states2band.test = testAstates;

  CR.awardTypes.IOTA.compile = singleCompile;
  CR.awardTypes.call.compile = singleCompile;
  CR.awardTypes.callarea.compile = singleCompile;
  CR.awardTypes.calls2dxcc.compile = doubleCompile;
  CR.awardTypes.cnty.compile = singleCompile;
  CR.awardTypes.cont.compile = singleCompile;
  CR.awardTypes.cont5.compile = singleCompile;
  CR.awardTypes.cont52band.compile = doubleCompile;
  CR.awardTypes.cqz.compile = singleCompile;
  CR.awardTypes.dxcc.compile = singleCompile;
  CR.awardTypes.grids.compile = singleCompile;
  CR.awardTypes.numsfx.compile = singleCompile;
  CR.awardTypes.px.compile = singleCompile;
  CR.awardTypes.pxa.compile = singleCompile;
  CR.awardTypes.pxplus.compile = singleCompile;
  CR.awardTypes.sfx.compile = singleCompile;
  CR.awardTypes.states.compile = singleCompile;
  CR.awardTypes.cont2band.compile = doubleCompile;
  CR.awardTypes.calls2band.compile = doubleCompile;
  CR.awardTypes.dxcc2band.compile = doubleCompile;
  CR.awardTypes.states2band.compile = doubleCompile;
}

function scoreAstates(award, obj)
{
  if (obj.state)
  {
    if (!(obj.state in award.stat))
    { award.stat[obj.state] = newAwardCountObject(); }
    return workAwardObject(
      award.stat[obj.state],
      obj.band,
      obj.mode,
      obj.digital,
      obj.phone
    );
  }
  return false;
}

function testAstates(award, obj, baseHash)
{
  // calls with empty state will not match anything in the hash map. so filter those out
  if (!obj.state || obj.state + baseHash in GT.tracker[award.test.look].state)
  {
    return false;
  }
  return true;
}

function scoreAstates2band(award, obj)
{
  if (obj.state)
  {
    if (!(obj.band in award.stat)) award.stat[obj.band] = newAwardCountObject();
    return workAwardObject(
      award.stat[obj.band],
      obj.band,
      obj.mode,
      obj.digital,
      obj.phone,
      obj.state
    );
  }
  return false;
}

function scoreAdxcc(award, obj)
{
  if (!(obj.dxcc in award.stat)) award.stat[obj.dxcc] = newAwardCountObject();
  return workAwardObject(
    award.stat[obj.dxcc],
    obj.band,
    obj.mode,
    obj.digital,
    obj.phone
  );
}

function testAdxcc(award, obj, baseHash)
{
  if (String(obj.dxcc) + "|" + baseHash in GT.tracker[award.test.look].dxcc)
  {
    return false;
  }
  return true;
}

function scoreAcont(award, obj)
{
  if (obj.cont)
  {
    let cont = obj.cont;
    if (cont == "AN") cont = "OC";
    if (!(cont in award.stat)) award.stat[cont] = newAwardCountObject();
    return workAwardObject(
      award.stat[cont],
      obj.band,
      obj.mode,
      obj.digital,
      obj.phone
    );
  }
  return false;
}

function testAcont(award, obj, baseHash)
{
  if (obj.cont)
  {
    let cont = obj.cont;
    if (cont == "AN") cont = "OC";

    if (cont + baseHash in GT.tracker[award.test.look].cont)
    {
      return false;
    }
  }
  return true;
}

function scoreAcont5(award, obj, baseHash)
{
  if (obj.cont)
  {
    let cont = obj.cont;
    if (cont == "NA" || cont == "SA") cont = "AM";
    if (cont == "AN") cont = "OC";

    if (!(cont in award.stat)) award.stat[cont] = newAwardCountObject();
    return workAwardObject(
      award.stat[cont],
      obj.band,
      obj.mode,
      obj.digital,
      obj.phone
    );
  }
  return false;
}

function testAcont5(award, obj, baseHash)
{
  if (obj.cont)
  {
    let cont = obj.cont;
    if (cont == "NA" || cont == "SA") cont = "AM";
    if (cont == "AN") cont = "OC";

    if (cont + baseHash in GT.tracker[award.test.look].cont)
    {
      return false;
    }
  }
  return true;
}

function scoreAcont2band(award, obj)
{
  if (!(obj.band in award.stat)) award.stat[obj.band] = newAwardCountObject();

  return workAwardObject(
    award.stat[obj.band],
    obj.band,
    obj.mode,
    obj.digital,
    obj.phone,
    obj.cont
  );
}

function testAcont2band(award, obj, baseHash)
{
  if (obj.cont)
  {
    let cont = obj.cont;
    if (cont == "AN") cont = "OC";

    if (cont + baseHash in GT.tracker[award.test.look].cont)
    {
      return false;
    }
  }
  return true;
}

function scoreAcont52band(award, obj)
{
  if (obj.cont)
  {
    let cont = obj.cont;
    if (cont == "NA" || cont == "SA") cont = "AM";
    if (cont == "AN") cont = "OC";

    if (!(obj.band in award.stat)) award.stat[obj.band] = newAwardCountObject();
    return workAwardObject(
      award.stat[obj.band],
      obj.band,
      obj.mode,
      obj.digital,
      obj.phone,
      cont
    );
  }
  return false;
}

function testAcont52band(award, obj, baseHash)
{
  if (obj.cont)
  {
    let cont = obj.cont;
    if (cont == "NA" || cont == "SA") cont = "AM";
    if (cont == "AN") cont = "OC";

    if (cont + baseHash in GT.tracker[award.test.look].cont)
    {
      return false;
    }
  }
  return true;
}

function scoreAgrids(award, obj)
{
  if (obj.grid && obj.grid.length > 0)
  {
    let grid = obj.grid.substring(0, 4);

    if (!(grid in award.stat)) award.stat[grid] = newAwardCountObject();
    return workAwardObject(
      award.stat[grid],
      obj.band,
      obj.mode,
      obj.digital,
      obj.phone
    );
  }
  return false;
}

function testAgrids(award, obj, baseHash)
{
  let grid = obj.grid;
  if (!grid || grid.length == 0) return false;
  if (award.rule.grid && award.rule.grid.indexOf(grid) == -1) return false;
  if (grid + baseHash in GT.tracker[award.test.look].grid) return false;

  return true;
}

function scoreAcnty(award, obj)
{
  if (obj.cnty)
  {
    if (!(obj.cnty in award.stat)) award.stat[obj.cnty] = newAwardCountObject();
    return workAwardObject(
      award.stat[obj.cnty],
      obj.band,
      obj.mode,
      obj.digital,
      obj.phone
    );
  }
  return false;
}

function testAcnty(award, obj, baseHash)
{
  if (obj.cnty && obj.cnty + baseHash in GT.tracker[award.test.look].cnty)
  {
    return false;
  }
  return true;
}

function scoreAcall(award, obj)
{
  let call = obj.DEcall;

  if (call.indexOf("/") > -1)
  {
    if (call.endsWith("/MM")) return false;
    call = call.replace("/P", "").replace("/R", "").replace("/QRP");
  }

  if (!(call in award.stat)) award.stat[call] = newAwardCountObject();
  return workAwardObject(
    award.stat[call],
    obj.band,
    obj.mode,
    obj.digital,
    obj.phone
  );
}

function testAcall(award, obj, baseHash)
{
  if (obj.DEcall.indexOf("/") > -1 && obj.DEcall.endsWith("/MM")) return false;

  if (obj.DEcall + baseHash in GT.tracker[award.test.look].call)
  {
    return false;
  }
  return true;
}

function scoreAIOTA(award, obj)
{
  if (obj.IOTA)
  {
    let test = CR.awards[award.sponsor].awards[award.name];

    if ("IOTA" in test.rule && test.rule.IOTA.indexOf(obj.IOTA) == -1)
    { return false; }

    if (!(obj.IOTA in award.stat)) award.stat[obj.IOTA] = newAwardCountObject();
    return workAwardObject(
      award.stat[obj.IOTA],
      obj.band,
      obj.mode,
      obj.digital,
      obj.phone
    );
  }
  return false;
}

// NO IOTA YET
function testAIOTA(award, obj, baseHash)
{
  /* if ( obj.IOTA )
  {
    let test = CR.awards[award.sponsor].awards[award.name];

    if ( "IOTA" in test.rule && test.rule.IOTA.indexOf(obj.IOTA) == -1 )
      return false;

  } */

  return false;
}

function scoreAcallarea(award, obj)
{
  if (obj.zone != null)
  {
    let test = CR.awards[award.sponsor].awards[award.name];

    if ("zone" in test.rule && test.rule.zone.indexOf(obj.zone) == -1)
    { return false; }

    if (!(obj.zone in award.stat)) award.stat[obj.zone] = newAwardCountObject();
    return workAwardObject(
      award.stat[obj.zone],
      obj.band,
      obj.mode,
      obj.digital,
      obj.phone
    );
  }
  return false;
}

function testAcallarea(award, obj, baseHash)
{
  if (obj.zone != null)
  {
    let test = CR.awards[award.sponsor].awards[award.name];

    if ("zone" in test.rule && test.rule.zone.indexOf(obj.zone) == -1)
    { return false; }
  }
  return true;
}

function scoreApx(award, obj)
{
  if (obj.px)
  {
    let test = CR.awards[award.sponsor].awards[award.name];
    let px = obj.px;
    if ("px" in test.rule)
    {
      px = px.substr(0, test.rule.px[0].length);
      if (test.rule.px.indexOf(px) == -1) return false;
    }

    if (!(px in award.stat)) award.stat[px] = newAwardCountObject();
    return workAwardObject(
      award.stat[px],
      obj.band,
      obj.mode,
      obj.digital,
      obj.phone
    );
  }
  return false;
}

function testApx(award, obj, baseHash)
{
  if (obj.px)
  {
    let test = CR.awards[award.sponsor].awards[award.name];
    let px = obj.px;
    if ("px" in test.rule)
    {
      px = px.substr(0, test.rule.px[0].length);
      if (test.rule.px.indexOf(px) == -1) return false;
    }

    if (String(obj.px) + baseHash in GT.tracker[award.test.look].px)
    {
      return false;
    }
  }
  return true;
}

function scoreApxa(award, obj)
{
  if (obj.px)
  {
    let test = CR.awards[award.sponsor].awards[award.name];
    for (const i in test.rule.pxa)
    {
      if (test.rule.pxa[i].indexOf(obj.px) > -1)
      {
        if (!(i in award.stat)) award.stat[i] = newAwardCountObject();
        return workAwardObject(
          award.stat[i],
          obj.band,
          obj.mode,
          obj.digital,
          obj.phone
        );
      }
    }
  }
  return false;
}

function testApxa(award, obj, baseHash)
{
  if (obj.px)
  {
    let test = CR.awards[award.sponsor].awards[award.name];
    for (const i in test.rule.pxa)
    {
      if (test.rule.pxa[i].indexOf(obj.px) > -1)
      {
        if (String(obj.px) + baseHash in GT.tracker[award.test.look].px)
        {
          return false;
        }
        else
        {
          return true;
        }
      }
    }
  }
  return false;
}

function scoreAsfx(award, obj)
{
  let test = CR.awards[award.sponsor].awards[award.name];
  let suf = obj.DEcall.replace(obj.px, "");
  for (const i in test.rule.sfx)
  {
    for (const s in test.rule.sfx[i])
    {
      if (suf.indexOf(test.rule.sfx[i][s]) == 0)
      {
        if (!(i in award.stat)) award.stat[i] = newAwardCountObject();
        return workAwardObject(
          award.stat[i],
          obj.band,
          obj.mode,
          obj.digital,
          obj.phone
        );
      }
    }
  }

  return false;
}

function testAsfx(award, obj, baseHash)
{
  let test = CR.awards[award.sponsor].awards[award.name];
  let suf = obj.DEcall.replace(obj.px, "");
  for (const i in test.rule.sfx)
  {
    for (const s in test.rule.sfx[i])
    {
      if (suf.indexOf(test.rule.sfx[i][s]) == 0)
      {
        return false;
      }
    }
  }

  return true;
}

function scoreAcalls2dxcc(award, obj)
{
  if (!(obj.dxcc in award.stat)) award.stat[obj.dxcc] = newAwardCountObject();

  return workAwardObject(
    award.stat[obj.dxcc],
    obj.band,
    obj.mode,
    obj.digital,
    obj.phone,
    obj.DEcall
  );
}

function testAcalls2dxcc(award, obj, baseHash)
{
  if (obj.DEcall + baseHash in GT.tracker[award.test.look].call)
  {
    return false;
  }
  return true;
}

function scoreAcalls2band(award, obj)
{
  if (!(obj.band in award.stat)) award.stat[obj.band] = newAwardCountObject();

  return workAwardObject(
    award.stat[obj.band],
    obj.band,
    obj.mode,
    obj.digital,
    obj.phone,
    obj.DEcall
  );
}

function testAcalls2band(award, obj, baseHash)
{
  if (obj.DEcall + baseHash in GT.tracker[award.test.look].call)
  {
    return false;
  }
  return true;
}

function scoreAdxcc2band(award, obj)
{
  if (!(obj.band in award.stat)) award.stat[obj.band] = newAwardCountObject();

  return workAwardObject(
    award.stat[obj.band],
    obj.band,
    obj.mode,
    obj.digital,
    obj.phone,
    obj.dxcc
  );
}

function testAdxcc2band(award, obj, baseHash)
{
  if (String(obj.dxcc) + "|" + baseHash in GT.tracker[award.test.look].dxcc)
  {
    return false;
  }
  return true;
}

function scoreAcqz(award, obj)
{
  if (obj.cqz)
  {
    if (!(obj.cqz in award.stat)) award.stat[obj.cqz] = newAwardCountObject();

    return workAwardObject(
      award.stat[obj.cqz],
      obj.band,
      obj.mode,
      obj.digital,
      obj.phone
    );
  }
  return false;
}

function testAcqz(award, obj, baseHash)
{
  // calls with empty cqz will not match anything in the hash map. so filter those out
  if (!obj.cqz || obj.cqz + "|" + baseHash in GT.tracker[award.test.look].cqz)
  {
    return false;
  }
  return true;
}

function scoreAnumsfx(award, obj)
{
  if (obj.px)
  {
    let test = CR.awards[award.sponsor].awards[award.name];
    let px = obj.px.substr(0, obj.px.length - 1);
    let suf = obj.DEcall.replace(px, "");
    suf = suf.substr(0, test.rule.numsfx[0][0].length);
    for (const i in test.rule.numsfx)
    {
      for (const s in test.rule.numsfx[i])
      {
        if (suf.indexOf(test.rule.numsfx[i][s]) == 0)
        {
          if (!(i in award.stat)) award.stat[i] = newAwardCountObject();
          return workAwardObject(
            award.stat[i],
            obj.band,
            obj.mode,
            obj.digital,
            obj.phone
          );
        }
      }
    }
  }
  return false;
}

function testAnumsfx(award, obj)
{
  if (obj.px)
  {
    let test = CR.awards[award.sponsor].awards[award.name];
    let px = obj.px.substr(0, obj.px.length - 1);
    let suf = obj.DEcall.replace(px, "");
    suf = suf.substr(0, test.rule.numsfx[0][0].length);
    for (const i in test.rule.numsfx)
    {
      for (const s in test.rule.numsfx[i])
      {
        if (suf.indexOf(test.rule.numsfx[i][s]) == 0)
        {
          return false;
        }
      }
    }
  }

  return true;
}

function scoreApxplus(award, obj)
{
  let test = CR.awards[award.sponsor].awards[award.name];

  if (test.rule.pxplus)
  {
    for (const i in test.rule.pxplus)
    {
      if (obj.DEcall.indexOf(test.rule.pxplus[i]) == 0)
      {
        if (!(i in award.stat)) award.stat[i] = newAwardCountObject();
        return workAwardObject(
          award.stat[i],
          obj.band,
          obj.mode,
          obj.digital,
          obj.phone
        );
      }
    }
  }
  return false;
}

function testApxplus(award, obj)
{
  let test = CR.awards[award.sponsor].awards[award.name];

  if (test.rule.pxplus)
  {
    for (const i in test.rule.pxplus)
    {
      if (obj.DEcall.indexOf(test.rule.pxplus[i]) == 0)
      {
        return false;
      }
    }
  }
  return true;
}

function loadAwardJson()
{
  CR.awards = {};
  try
  {
    CR.awards = requireJson("data/awards.json");
    for (const sp in CR.awards)
    {
      for (const aw in CR.awards[sp].awards)
      {
        if (!("unique" in CR.awards[sp].awards[aw].rule))
        { CR.awards[sp].awards[aw].rule.unique = 1; }

        if (CR.awards[sp].awards[aw].rule.band[0] == "Mixed")
        {
          CR.awards[sp].awards[aw].rule.band.shift();
        }

        if (CR.awards[sp].awards[aw].rule.band[0] == "Any") CR.awards[sp].awards[aw].rule.band[0] = "Mixed";

        if (CR.awards[sp].awards[aw].rule.band.length == 0)
        {
          CR.awards[sp].awards[aw].rule.band = [];
          for (let key in CR.awards[sp].mixed)
          {
            CR.awards[sp].awards[aw].rule.band.push(CR.awards[sp].mixed[key]);
          }
        }

        if (
          CR.awards[sp].awards[aw].rule.endorse.length == 1 &&
          CR.awards[sp].awards[aw].rule.endorse[0] == "Mixed"
        )
        {
          CR.awards[sp].awards[aw].rule.endorse = [];
          for (let key in CR.awards[sp].mixed)
          {
            CR.awards[sp].awards[aw].rule.endorse.push(
              CR.awards[sp].mixed[key]
            );
          }
        }
      }
    }

    buildAwardTypeHandlers();
  }
  catch (e)
  {
    alert("Core awards.json : " + e);
    CR.awards = {};
  }
}

function createActiveAwardsFromSettings()
{
  for (const hash in CR.awardTrackersActive)
  {
    const award = CR.awardTrackersActive[hash];
    if (award.sponsor in CR.awards && award.name in CR.awards[award.sponsor].awards)
    {
      addAwardTracker(award.sponsor, award.name, award.enable);
    }
  }
}

function processAllAwardTrackers()
{
  for (let tracker in CR.awardTracker)
  {
    if (!(CR.awardTracker[tracker].sponsor in CR.awards))
    {
      delete CR.awardTracker[tracker];
      continue;
    }
    if (
      !(
        CR.awardTracker[tracker].name in
        CR.awards[CR.awardTracker[tracker].sponsor].awards
      )
    )
    {
      delete CR.awardTracker[tracker];
      continue;
    }
    processAward(tracker);
  }
  updateAwardList();
}

function newAwardTrackerObject(sponsor, award, enable)
{
  let newAward = {};
  newAward.sponsor = sponsor;
  newAward.name = award;
  newAward.enable = enable;
  newAward.mode = CR.awards[sponsor].awards[award].rule.mode[0];
  newAward.band = CR.awards[sponsor].awards[award].rule.band[0];
  newAward.count = CR.awards[sponsor].awards[award].rule.count[0];
  newAward.stat = {};
  newAward.comp = {};
  newAward.test = {};
  return newAward;
}

function addAllAwards()
{
  for (let sponsor in CR.awards)
  {
    for (let award in CR.awards[sponsor].awards)
    {
      let awardToAdd = newAwardTrackerObject(sponsor, award, true);

      let hash = awardToAdd.name + "-" + awardToAdd.sponsor;
      if (!(hash in CR.awardTracker))
      {
        CR.awardTracker[hash] = awardToAdd;
        processAward(hash);
        storeAwardTracker();
      }
    }
  }
  updateAwardList();
  viewRoster();
}

function delAllAwards()
{
  CR.awardTracker = {};
  storeAwardTracker();
  updateAwardList();
  viewRoster();
}

function newCompileCountObject()
{
  let compileCountObject = {};
  compileCountObject.bands = {};
  compileCountObject.modes = {};
  compileCountObject.endorse = {};
  compileCountObject.counts = {};
  return compileCountObject;
}

function singleCompile(award, obj)
{
  let test = CR.awards[award.sponsor].awards[award.name];
  let rule = test.rule;
  let comp = newCompileCountObject();
  for (let mode in rule.mode)
  {
    comp.modes[rule.mode[mode]] = 0;
    comp.bands[rule.mode[mode]] = {};

    for (let band in rule.band)
    {
      comp.bands[rule.mode[mode]][rule.band[band]] = 0;
    }
    for (let key in obj)
    {
      if (rule.mode[mode] in obj[key].bands && Object.keys(obj[key].bands[rule.mode[mode]]).length)
      {
        comp.modes[rule.mode[mode]] += 1;

        for (let band in rule.band)
        {
          if (rule.band[band] in obj[key].bands[rule.mode[mode]])
          { comp.bands[rule.mode[mode]][rule.band[band]] += 1; }
        }
      }
    }

    if ("score" in rule && rule.score == "band")
    {
      comp.modes[rule.mode[mode]] = 0;
      for (let band in comp.bands[rule.mode[mode]])
      {
        comp.modes[rule.mode[mode]] += comp.bands[rule.mode[mode]][band];
      }
    }
  }

  for (let mode in comp.modes)
  {
    comp.endorse[mode] = {};
    comp.counts[mode] = {};
    for (let cnts in rule.count)
    {
      comp.counts[mode][rule.count[cnts]] = {
        num: comp.modes[mode],
        per: parseInt(Math.min(100, (comp.modes[mode] / rule.count[cnts]) * 100.0))
      };
    }

    for (let endorse in rule.endorse)
    {
      comp.endorse[mode][rule.endorse[endorse]] = {};
      for (let cnts in rule.count)
      {
        comp.endorse[mode][rule.endorse[endorse]][rule.count[cnts]] =
          comp.bands[mode][rule.endorse[endorse]] >= rule.count[cnts];
      }
    }
  }

  return comp;
}

function doubleCompile(award, firstLevel)
{
  let test = CR.awards[award.sponsor].awards[award.name];
  let rule = test.rule;

  for (let k in firstLevel)
  {
    firstLevel[k].bands = {};
    let obj = singleCompile(award, firstLevel[k].unique);

    for (let mode in obj.bands)
    {
      for (let cnt in test.rule.count)
      {
        if (obj.counts[mode][test.rule.count[cnt]].num >= test.rule.unique)
        {
          for (let band in obj.bands[mode])
          {
            if (!(mode in firstLevel[k].bands)) firstLevel[k].bands[mode] = {};

            if (obj.bands[mode][band] > 0)
            {
              firstLevel[k].bands[mode][band] =
                ~~firstLevel[k].bands[mode][band] + 1;
            }
          }
        }
      }
    }

    delete firstLevel[k].unique;
    firstLevel[k].unique = null;
  }

  return singleCompile(award, firstLevel);
}

function listShortInstances()
{
  let shortInstances = [];
  if (typeof GT.instances != "undefined" && Object.keys(GT.instances).length > 1)
  {
    let keys = Object.keys(GT.instances).sort();
    for (let key in keys)
    {
      let inst = keys[key];
      let sp = inst.split(" - ");
      let shortInst = sp[sp.length - 1].substring(0, 18);
      if (GT.instances[inst].canRoster == true) shortInstances.push(shortInst);
    }
  }
  return shortInstances;
}

function openInfoTab(evt, tabName, callFunc, callObj)
{
  // Declare all variables
  var i, infoTabcontent, infoTablinks;
  // Get all elements with class="infoTabcontent" and hide them
  infoTabcontent = document.getElementsByClassName("infoTabcontent");
  for (i = 0; i < infoTabcontent.length; i++)
  {
    infoTabcontent[i].style.display = "none";
  }
  // Get all elements with class="infoTablinks" and remove the class "active"
  infoTablinks = document.getElementsByClassName("infoTablinks");
  for (i = 0; i < infoTablinks.length; i++)
  {
    infoTablinks[i].className = infoTablinks[i].className.replace(
      " active",
      ""
    );
  }
  // Show the current tab, and add an "active" class to the button that opened the tab

  document.getElementById(tabName).style.display = "block";
  if (typeof evt == "string")
  {
    for (i = 0; i < infoTablinks.length; i++)
    {
      if (infoTablinks[i].id == evt)
      {
        infoTablinks[i].className += " active";
      }
    }
  }
  else if (typeof evt.currentTarget != "undefined")
  {
    evt.currentTarget.className += " active";
  }
  else
  {
    evt.className += " active";
  }

  if (callFunc)
  {
    if (typeof callFunc == "function")
    {
      if (callObj) callFunc(callObj);
      else callFunc();
    }
  }
}

function ValidateTextInput(inputText, validDiv = null)
{
  if (inputText.value.length > 0)
  {
    var passed = false;
    inputText.value = inputText.value.toUpperCase();
    if (/\d/.test(inputText.value) || /[A-Z]/.test(inputText.value))
    {
      passed = true;
    }
    if (passed)
    {
      inputText.style.color = "#FF0";
      inputText.style.backgroundColor = "darkgreen";
      if (validDiv) validDiv.innerHTML = "";
      return true;
    }
    else
    {
      inputText.style.color = "#000";
      inputText.style.backgroundColor = "yellow";
      if (validDiv) validDiv.innerHTML = I18N("stats.Validate.Invalid");
      return false;
    }
  }
  else
  {
    inputText.style.color = "#000";
    inputText.style.backgroundColor = "yellow";
    if (validDiv) validDiv.innerHTML = I18N("stats.Validate.Invalid");
    return false;
  }
}

function watcherOnName()
{
  watcherName.value = watcherName.value.replace(/[$%.'"\\,<>]/g, "");
  watcherNameValidate();
}

function watcherNameValidate()
{
  if (watcherName.value.length == 0 || (watcherName.value in CR.watchers && watcherName.value != CR.watcherEditKey))
  {
    watcherName.style.color = "#000";
    watcherName.style.backgroundColor = "orange";
    return false;
  }
  else
  {
    watcherName.style.color = "";
    watcherName.style.backgroundColor = "";
    return true;
  }
}

function watcherTypeChanged(value)
{
  watcherType.value = value;
  if (value == "Callsign")
  {
    watcherTextTh.innerHTML = I18N("roster.controls.hunting.callsign");
  }
  if (value == "Calling")
  {
    watcherTextTh.innerHTML = I18N("alerts.QRZ.speech");
  }
  if (value == "Grid")
  {
    watcherTextTh.innerHTML = I18N("roster.controls.hunting.grid");
  }
  if (value == "Message")
  {
    watcherTextTh.innerHTML = I18N("gt.WSJTMessage.Message");
  }

  watcherStartDateEnable(watcherStartDateCheckbox.checked);
  watcherEndDateEnable(watcherEndDateCheckbox.checked);
}

function watcherRegexChanged(checked)
{
  watcherOnText();
}

function watcherOnText()
{
  var testCallsign = false;
  if (watcherRegexCheckbox.checked == false)
  {
    if (watcherType.value == "Message")
    {
      watcherText.value = watcherText.value.toUpperCase().replace(/[^A-Z0-9/<>\s]+/g, "");
    }
    else if (watcherType.value == "Calling")
    {
      testCallsign = true;
      watcherText.value = watcherText.value.toUpperCase().replace(/[^A-Z0-9/\s]+/g, "");
    }
    else if (watcherType.value == "Grid")
    {
      gridInputValidate(watcherText);
      return;
    }
    else
    {
      testCallsign = true;
      watcherText.value = watcherText.value.toUpperCase().replace(/[^A-Z0-9/]+/g, "");
    }
  }
  else
  {
    let originalValue = watcherText.value;
    try {
      "ABC123".match(watcherText.value);
    }
    catch (e)
    {
      // Error in user entered regex
      watcherText.value = "";
      watcherTextValidate(true);
      watcherText.value = originalValue;
      return;
    }
  }
  watcherTextValidate(testCallsign);
}

function watcherTextValidate(testCallsign = false)
{
  if (watcherText.value.length == 0)
  {
    watcherText.style.color = "#FFF";
    watcherText.style.backgroundColor = "orange";
    return false;
  }
  else
  {
    if (testCallsign && !watcherText.value.match(CALLSIGN_REGEXP))
    {
      watcherText.style.color = "#000";
      watcherText.style.backgroundColor = "yellow";
    }
    else
    {
      watcherText.style.color = "";
      watcherText.style.backgroundColor = "";
    }
    return true;
  }
}

function watcherStartDateEnable(checked)
{
  watcherStartDateTh.style.display = watcherStartDateTd.style.display = (checked ? "" : "none");
}

function watcherEndDateEnable(checked)
{
  watcherAutoDeleteTd.style.display = watcherAutoDeleteTh.style.display = watcherEndDateTh.style.display = watcherEndDateTd.style.display = (checked ? "" : "none");
}

function newWatcherEntry()
{
  let entry = Object();

  entry.watch = true;
  entry.type = "Callsign";
  entry.regex = false;
  entry.text = "";
  entry.name = "";
  entry.start = false;
  entry.end = false;
  entry.startTime = 0;
  entry.endTime = 0;
  entry.autoDelete = false;
  entry.error = false;

  return entry;
}

function saveWatcher()
{
  watcherName.value = watcherName.value.trim();
  watcherText.value = watcherText.value.trim();
  if (watcherNameValidate() == false || watcherTextValidate() == false) return;

  if (CR.watcherEditKey.length > 0 && CR.watcherEditKey in CR.watchers)
  {
    delete CR.watchers[CR.watcherEditKey];
    if (CR.watcherEditKey in CR.watchersTest) delete CR.watchersTest[CR.watcherEditKey];
  }

  let entry = newWatcherEntry();
  entry.watch = true;
  entry.name = watcherName.value;
  entry.type = watcherType.value;
  entry.regex = watcherRegexCheckbox.checked;
  entry.text = watcherText.value;
  entry.start = watcherStartDateCheckbox.checked;
  entry.end = watcherEndDateCheckbox.checked;
  entry.autoDelete = entry.end ? watcherAutoDeleteCheckbox.checked : false;

  if (entry.start)
  {
    if (watcherStartDate.value.length == 0)
    {
      entry.startTime = Date.now();
    }
    else
    {
      entry.startTime = Date.parse(watcherStartDate.value + "Z");
    }
  }
  else entry.startTime = 0;

  if (entry.end)
  {
    if (watcherEndDate.value.length == 0)
    {
      entry.endTime = Date.now();
    }
    else
    {
      entry.endTime = Date.parse(watcherEndDate.value + "Z");
    }
    if (entry.start && entry.endTime <= entry.startTime)
    {
      // Good for a minute, least we can do :)
      entry.endTime = entry.startTime + 60000;
    }
  }
  else entry.endTime = 0;

  CR.watchers[entry.name] = entry;
  CR.watchersTest[entry.name] = null;
  openWatchersTab();
  window.opener.goProcessRoster();
}

function addWatcher(value, type)
{
  if (!(value in CR.watchers))
  {
    let entry = newWatcherEntry();
    entry.watch = true;
    entry.type = type;
    entry.regex = false;
    entry.text = value;
    entry.autoDelete = false;
    entry.name = value;
    CR.watchers[value] = entry;
    CR.watchersTest[value] = null;
    GT.activeRoster.wanted.huntWatcher = huntWatcher.checked = true;
    window.opener.goProcessRoster();
    wantRenderWatchersTab();
  }
}

function clearWatcher()
{
  CR.watcherEditKey = "";

  watcherName.style.color = "";
  watcherName.style.backgroundColor = "";
  watcherText.style.color = "";
  watcherText.style.backgroundColor = "";

  loadWatcherValues("", newWatcherEntry());
}

function toggleWatcher(key)
{
  CR.watchers[key].watch = !CR.watchers[key].watch;
  wantRenderWatchersTab();
  window.opener.goProcessRoster();
}

function deleteWatcher(key)
{
  delete CR.watchers[key];
  if (key in CR.watchersTest) delete CR.watchersTest[key];
  wantRenderWatchersTab();
  window.opener.goProcessRoster();
}

CR.watcherEditKey = "";

function editWatcher(key)
{
  CR.watcherEditKey = key;
  
  loadWatcherValues(key, CR.watchers[key]);
}
 
function loadWatcherValues(key, entry)
{
  watcherName.value = key;
  watcherType.value = entry.type;
  watcherRegexCheckbox.checked = entry.regex;
  watcherText.value = entry.text;
  watcherStartDateCheckbox.checked = entry.start;
  watcherEndDateCheckbox.checked = entry.end;
  let today = Date.now();
  today -= today % 86400000;
  let date = entry.startTime > 0 ? new Date(entry.startTime) : new Date(today);
  watcherStartDate.value = date.toISOString().slice(0, 16);
  date = entry.endTime > 0 ? new Date(entry.endTime) : new Date(today);
  watcherEndDate.value = date.toISOString().slice(0, 16);
  watcherAutoDeleteCheckbox.checked = entry.autoDelete;
  watcherTypeChanged(entry.type);
}

function htmlEntities(str)
{
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bracesToHTML(str)
{
  return String(str)
  .replace(/{/g, "<")
  .replace(/}/g, ">");
}

function openWatchersTab()
{
  clearWatcher();
  wantRenderWatchersTab();
}

function wantRenderWatchersTab()
{
  if (watcherBoxDiv.style.display != "none")
  {
    renderWatchersTab();
  }
}

function boolCompare(a, b)
{
  return (a == false && b == true) ? -1 : (a == b) ? 0 : 1;
}

function stringCompare(a, b)
{
  return a.toLowerCase() < b.toLowerCase() ? -1 : (a == b) ? 0 : 1;
}

function numberCompare(a ,b)
{
  return (a < b) ? -1 : (a == b) ? 0 : 1;
}

CR.watcherColumns = {
  watch: { text: "👁️", sort: true, cmp: boolCompare },
  name: { text: "Name", sort: true, cmp: stringCompare  },
  type: { text: "Type", sort: true, cmp: stringCompare },
  regex: { text: "Regex", sort: true, cmp: boolCompare },
  text: { text: "Text", sort: true, cmp: stringCompare },
  startTime: { text: "Start Date", sort: true, cmp: numberCompare },
  endTime: { text: "End Date", sort: true, cmp: numberCompare },
  edit: { text: "Edit", sort: false },
  delete: { text: "Delete", sort: false },
};

function watcherSortFunc(a, b)
{
  return CR.watcherColumns[CR.rosterSettings.watcherSortColumn].cmp(CR.watchers[a][CR.rosterSettings.watcherSortColumn], CR.watchers[b][CR.rosterSettings.watcherSortColumn]);
}

function renderWatchersTab()
{
  // If there's no decodes the watcher rules are not checked, so we'll check before each render.
  // Functionally not nessecary as any expired watcher will not be tested *ever*, but makes some people happy
  let now = Date.now();
  for (let key in CR.watchers)
  {
    let watcher = CR.watchers[key];

    if (watcher.end && now > watcher.endTime && watcher.autoDelete)
    {
        delete CR.watchers[key];
        if (key in CR.watchersTest) delete CR.watchersTest[key];
    }
  }

  if (Object.keys(CR.watchers).length > 0)
  {
    const html = ["<div id='watcherTable'><table class='darkTable' align=center><tr>"];
    
    for (column in CR.watcherColumns)
    {
      html.push("<th ");
      html.push((CR.watcherColumns[column].sort ? "style='cursor:pointer;' onClick='setWatcherSorting(\"" + column + "\");'": "" ));
      html.push(">" + CR.watcherColumns[column].text);
      if (CR.rosterSettings.watcherSortColumn == column)
      {
        html.push("<div style='display:inline-block;margin:0px;padding:0px;'>&nbsp;" + (CR.rosterSettings.watcherSortReverse == false ? "▲" : "▼") + "</div>");
      }
      html.push("</th>");
    }

    html.push("</tr>");

    let sorted = Object.keys(CR.watchers).sort( watcherSortFunc );
  
    if (CR.rosterSettings.watcherSortReverse) sorted.reverse();

    sorted.forEach(function (key)
      {
        html.push("<tr><td style='cursor:pointer;font-size:larger;' onclick='toggleWatcher(\"" + key + "\")'>" + (CR.watchers[key].watch ? "👀" : "🙈") + "</td>");
        html.push("<td align=left style='color:yellow;' >" + CR.watchers[key].name + "</td><td>" + CR.watchers[key].type + "</td><td>" + (CR.watchers[key].regex ? "☑️" : "") + "</td>");
        let text = htmlEntities(CR.watchers[key].text);
        html.push("<td style='overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:250px;color:cyan;'>" + (CR.watchers[key].regex ? text : formatCallsign(text)) + "</td>");
        html.push("<td>" + (CR.watchers[key].start ? window.opener.userTimeString(CR.watchers[key].startTime) : "") + "</td>");
        html.push("<td>" + (CR.watchers[key].end ? window.opener.userTimeString(CR.watchers[key].endTime) : "") + "</td>");
        html.push("<td style='cursor:pointer;font-size:larger;' onclick='editWatcher(\"" + key + "\")'>📝</td>");
        html.push("<td style='cursor:pointer;font-size:larger;' onclick='deleteWatcher(\"" + key + "\")'>");
        html.push(CR.watchers[key].autoDelete ? "🤖" : "🚮");
        html.push("</td></tr>");
      });
    html.push("</table></div>");
    
    watcherEditView.innerHTML = html.join("");
    let height = 40;
    if (watcherBoxDiv.offsetHeight >= window.innerHeight - height)
    {
      watcherBoxDiv.style.height = (window.innerHeight - height) + "px";
    }
    else
    {
      watcherBoxDiv.style.height = "";
    }
  }
  else
  {
    watcherBoxDiv.style.height = "";
    watcherEditView.innerHTML = "";
  }
}

function setWatcherSorting(column)
{
  if (CR.rosterSettings.watcherSortColumn == column)
  {
    CR.rosterSettings.watcherSortReverse = !CR.rosterSettings.watcherSortReverse;
  }
  else
  {
    CR.rosterSettings.watcherSortColumn = column;
    CR.rosterSettings.watcherSortReverse = false;
  }

  renderWatchersTab();
}

function createMenuHide()
{
  CR.menuHide = new Menu();
  let item = new MenuItem({
    type: "normal",
    label: I18N("roster.menu.HideControls"),
    click: function ()
    {
      toggleShowControls();
    }
  });
  CR.menuHide.append(item);

  item = new MenuItem({ type: "separator" });
  CR.menuHide.append(item);

  item = new MenuItem({
    type: "checkbox",
    label: I18N("roster.menu.Realtime"),
    checked: CR.rosterSettings.realtime,
    click: function (item)
    {
      CR.rosterSettings.realtime = item.checked;
      CR.menuShow.items[2].checked = item.checked;
      viewRoster();
    }
  });
  CR.menuHide.append(item);
}

function createMenuShow()
{
  CR.menuShow = new Menu();
  let item = new MenuItem({
    type: "normal",
    label: I18N("roster.menu.ShowControls"),
    click: function ()
    {
      toggleShowControls();
    }
  });
  CR.menuShow.append(item);

  item = new MenuItem({ type: "separator" });
  CR.menuShow.append(item);

  item = new MenuItem({
    type: "checkbox",
    label: I18N("roster.menu.Realtime"),
    checked: CR.rosterSettings.realtime,
    click: function (item)
    {
      CR.rosterSettings.realtime = item.checked;
      CR.menuHide.items[2].checked = item.checked;
      viewRoster();
    }
  });
  CR.menuShow.append(item);
}

function createCompactMenuHide()
{
  CR.compactMenuHide = new Menu();
  let item = new MenuItem({
    type: "normal",
    label: I18N("roster.menu.HideControls"),
    click: function ()
    {
      toggleShowControls();
    }
  });
  CR.compactMenuHide.append(item);
}

function createCompactMenuShow()
{
  CR.compactMenuShow = new Menu();
  let item = new MenuItem({
    type: "normal",
    label: I18N("roster.menu.ShowControls"),
    click: function ()
    {
      toggleShowControls();
    }
  });
  CR.compactMenuShow.append(item);
}

function createRestOfMenus()
{
  CR.callMenu = new Menu();
  let item = new MenuItem({
    type: "normal",
    label: I18N("roster.menu.Lookup"),
    click: function ()
    {
      callLookup(CR.targetHash, "");
    }
  });

  CR.callMenu.append(item);

  item = new MenuItem({
    type: "normal",
    label: I18N("roster.menu.GenMesg"),
    click: function ()
    {
      callGenMessage(CR.targetHash, "");
    }
  });
  CR.callMenu.append(item);

  item = new MenuItem({
    type: "normal",
    label: I18N("roster.add.watcher.label"),
    click: function ()
    {
      addWatcher(CR.callRoster[CR.targetHash].DEcall, "Callsign");
    }
  });

  CR.callMenu.append(item);

  item = new MenuItem({
    type: "normal",
    label: I18N("copy"),
    click: function ()
    {
      navigator.clipboard.writeText(CR.callRoster[CR.targetHash].DEcall);
    }
  });

  CR.callMenu.append(item);

  // Saved for later user
  CR.callMenuRotator = new MenuItem({
    type: "normal",
    label: I18N("roster.menu.AimRotator"),
    visible: GT.settings.pstrotator.enable,
    click: function ()
    {
      let target = CR.callRoster[CR.targetHash]
      window.opener.aimRotator(target, "");
    }
  });

  CR.callMenu.append(CR.callMenuRotator);

  item = new MenuItem({ type: "separator" });
  CR.callMenu.append(item);
 

  item = new MenuItem({
    type: "normal",
    label: I18N("roster.menu.IgnoreCall"),
    click: function ()
    {
      ignoreCallsign(CR.callRoster[CR.targetHash].DEcall);
    }
  });

  CR.callMenu.append(item);

  item = new MenuItem({
    type: "normal",
    label: I18N("roster.menu.EditIgnores"),
    enabled: true,
    click: function ()
    {
      openIgnores();
    }
  });

  CR.callMenu.append(item);

  CR.callingMenu = new Menu();
  item = new MenuItem({
    type: "normal",
    label: I18N("roster.menu.Lookup"),
    click: function ()
    {
      callingLookup(CR.targetHash, "");
    }
  });

  CR.callingMenu.append(item);

  item = new MenuItem({
    type: "normal",
    label: I18N("roster.menu.GenMesg"),
    click: function ()
    {
      callingGenMessage(CR.targetHash, "");
    }
  });

  CR.callingMenu.append(item);

  item = new MenuItem({
    type: "normal",
    label: I18N("roster.add.watcher.label"),
    click: function ()
    {
      addWatcher(CR.callRoster[CR.targetHash].DXcall, "Callsign");
    }
  });

  CR.callingMenu.append(item);

  item = new MenuItem({
    type: "normal",
    label: I18N("copy"),
    click: function ()
    {
      navigator.clipboard.writeText(CR.callRoster[CR.targetHash].DXcall);
    }
  });

  CR.callingMenu.append(item);

  CR.callingMenuRotator = new MenuItem({
    type: "normal",
    label: I18N("roster.menu.AimRotator"),
    visible: GT.settings.pstrotator.enable,
    click: function ()
    {
      let target = CR.callRoster[CR.targetHash]
      window.opener.aimRotator(target, "");
    }
  });
  CR.callingMenu.append(CR.callingMenuRotator);

  CR.columnMenu = new Menu();

  for (const columnIndex in CR.rosterSettings.columnOrder)
  {
    let key = CR.rosterSettings.columnOrder[columnIndex];
    if (key != "Callsign")
    {
      let itemx = new MenuItem({
        type: "checkbox",
        label: key,
        checked: CR.rosterSettings.columns[key],
        click: function (item)
        {
          toggleColumn(item);
          logbookValuesChanged();
        }
      });

      CR.columnMenu.append(itemx);
      CR.columnMembers[key] = itemx;
    }
  }

  CR.MsgMenu = new Menu();

  item = new MenuItem({
    type: "normal",
    label: I18N("roster.add.watcher.label"),
    click: function ()
    {
      addWatcher(CR.callRoster[CR.targetHash].callObj.msg, "Message");
    }
  });

  CR.MsgMenu.append(item);

  CR.CQMenu = new Menu();

  item = new MenuItem({
    type: "normal",
    label: I18N("roster.add.watcher.label"),
    click: function ()
    {
      addWatcher(CR.callRoster[CR.targetCQ].DXcall, "Calling");
    }
  });

  CR.CQMenu.append(item);

  item = new MenuItem({
    type: "normal",
    label: "Ignore CQ from DXCC",
    click: function ()
    {
      ignoreCQ(CR.callRoster[CR.targetCQ].DXcall, CR.callRoster[CR.targetCQ].callObj.dxcc);
    }
  });

  CR.CQMenu.append(item);

  item = new MenuItem({
    type: "normal",
    label: "Ignore CQ from All",
    click: function ()
    {
      ignoreCQ(CR.callRoster[CR.targetCQ].DXcall, -1);
    }
  });

  CR.CQMenu.append(item);

  CR.CQzMenu = new Menu();

  item = new MenuItem({
    type: "normal",
    label: I18N("roster.menu.IgnoreCQZone"),
    click: function ()
    {
      ignoreCQz(CR.callRoster[CR.targetCQz].callObj.cqz);
    }
  });

  CR.CQzMenu.append(item);

  item = new MenuItem({
    type: "normal",
    label: I18N("roster.menu.EditIgnores"),
    enabled: true,
    click: function ()
    {
      openIgnores();
    }
  });

  CR.CQzMenu.append(item);

  CR.ITUzMenu = new Menu();

  item = new MenuItem({
    type: "normal",
    label: I18N("roster.menu.IgnoreITUZone"),
    click: function ()
    {
      ignoreITUz(CR.callRoster[CR.targetITUz].callObj.itu);
    }
  });

  CR.ITUzMenu.append(item);

  item = new MenuItem({
    type: "normal",
    label: I18N("roster.menu.EditIgnores"),
    enabled: true,
    click: function ()
    {
      openIgnores();
    }
  });

  CR.ITUzMenu.append(item);

  CR.dxccMenu = new Menu();

  item = new MenuItem({
    type: "normal",
    label: I18N("roster.menu.IgnoreDXCC"),
    click: function ()
    {
      ignoreDxcc(CR.targetDxcc);
    }
  });

  CR.dxccMenu.append(item);

  item = new MenuItem({
    type: "normal",
    label: I18N("roster.menu.EditIgnores"),
    enabled: true,
    click: function ()
    {
      openIgnores();
    }
  });

  CR.dxccMenu.append(item);

  CR.GridMenu = new Menu();

  item = new MenuItem({
    type: "normal",
    label: I18N("roster.add.watcher.label"),
    click: function ()
    {
      addWatcher(CR.callRoster[CR.targetHash].callObj.grid, "Grid");
    }
  });

  CR.GridMenu.append(item);

  item = new MenuItem({
    type: "normal",
    label: "Ignore Grid",
    click: function ()
    {
      ignoreGrid(CR.callRoster[CR.targetHash].callObj.grid);
    }
  });

  CR.GridMenu.append(item);

  item = new MenuItem({
    type: "normal",
    label: I18N("roster.menu.EditIgnores"),
    enabled: true,
    click: function ()
    {
      openIgnores();
    }
  });

  CR.GridMenu.append(item);
}

function setPstrotatorEnable(enabled)
{
  CR.callingMenuRotator.visible = CR.callMenuRotator.visible = enabled;
}
