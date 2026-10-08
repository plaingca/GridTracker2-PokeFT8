// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// QSO data bookkeeping: applying/refreshing QSOs, worked/confirmed counts, zone stats, clearing data (moved from GridTracker2.js)

function refreshQSOs()
{
  // Don't bother, we have other logs coming
  if (GT.adifLogCount > 0) return;

  clearOrLoadButton.style.display = "none";
  busyDiv.style.display = "block";

  let task = {};
  task.type = "process";
  task.QSOhash = GT.QSOhash;
  GT.trackerWorker.postMessage(task);
}

function applyQSOs(task)
{
  if (task != null)
  {
    GT.tracker = task.tracker;
  }

  if (GT.adifLogCount == 0)
  {
    clearOrLoadButton.style.display = "block";
    busyDiv.style.display = "none";

    updateRosterWorked();
    goProcessRoster();
    redrawGrids(false);
  }
}

function hasAnyKeys(obj) {
    for (const _ in obj) {
        return true; // Instantly bails out on the very first key it finds!
    }
    return false; // Loop finished without finding anything
}

function updateCountStats()
{
  callsignCount.innerHTML = GT.sessionCallsigns.size;
  countryCount.innerHTML = GT.sessionDXCCs.size;

  qsoCount.innerHTML = GT.QSOcount;
  qslCount.innerHTML = GT.QSLcount;

  if (GT.rowsFiltered > 0)
  {
    rowsFilteredTr.style.display = "";
  }
  else
  {
    rowsFilteredTr.style.display = "none";
  }

  if (hasAnyKeys(GT.QSOhash))
  {
    clearOrLoadButton.innerHTML = I18N("quickLoad.clearLog.label");
    GT.loadQSOs = false;
  }
  else
  {
    clearOrLoadButton.innerHTML = I18N("quickLoad.loadLog.label");
    GT.loadQSOs = true;
  }
}

function resetWorkingCollection(collection)
{
  for (const key in collection)
  {
    const obj = collection[key];
    obj.worked = false;
    obj.confirmed = false;
    obj.worked_bands = {};
    obj.confirmed_bands = {};
    obj.worked_modes = {};
    obj.confirmed_modes = {};
  }
}

function clearCalls()
{
  removePaths();
  GT.liveCallsigns = {};
  GT.sessionCallsigns.clear();
  GT.sessionDXCCs.clear();
}

function clearLive()
{
  GT.Decodes = 0;

  GT.lastMessages = Array();
  GT.lastTraffic = Array();
  GT.callRoster = {};

  removePaths();
  clearGrids();
  clearCalls();
  clearTempGrids();
  setHomeGridsquare();
  redrawGrids();

  updateRosterWorked();
  goProcessRoster();
}

function clearOrLoadQSOs()
{
  if (GT.loadQSOs == true)
  {
    startupAdifLoadCheck();
  }
  else
  {
    clearQSOs();
  }
}

function clearQSOs(clearFiles = true, nextFunc = null)
{
  // in adif.js
  clearAdifWorkerQSO(clearFiles, nextFunc);
}

// callback from adifWorker
function clearQSOcallback(clearFiles, nextFunc)
{
  initQSOdata();
  GT.QSOhash = {};
  GT.myQsoCalls = {};
  GT.myQsoGrids = {};
  GT.QSLcount = 0;
  GT.QSOcount = 0;
  GT.rowsFiltered = 0;
  setTrophyOverlay(GT.currentOverlay);

  updateRosterWorked();
  goProcessRoster();
  redrawGrids(false);

  if (clearFiles == true)
  {
    clearLogFilesAndCounts();
  }
  if (nextFunc != null && typeof window[nextFunc] == "function")
  {
    // this should be startupAdifLoadCheck, but it's open ended :)
    window[nextFunc]();
  }
}

function clearLogFilesAndCounts()
{
  tryToDeleteAppFile("LogbookOfTheWorld.adif");
  tryToDeleteAppFile("LoTW_QSL.adif");
  tryToDeleteAppFile("qrz.adif");
  tryToDeleteAppFile("clublog.adif");

  GT.settings.adifLog.lastFetch.lotw_qsl = 0;
}

// Optimized for V8, it's ugly, but it's fast
function updateZoneStats(zoneDict, zoneName, worked, didConfirm, band, mode) {
  const entry = zoneDict[zoneName];
  if (entry === undefined) {
    return;
  }

  if (worked === true) {
    entry.worked = true;
    const wBands = entry.worked_bands;
    const wModes = entry.worked_modes;

    const wBandVal = wBands[band];
    wBands[band] = wBandVal === undefined ? 1 : wBandVal + 1;

    const wModeVal = wModes[mode];
    wModes[mode] = wModeVal === undefined ? 1 : wModeVal + 1;
  }

  if (didConfirm === true) {
    entry.confirmed = true;

    const cBands = entry.confirmed_bands;
    const cModes = entry.confirmed_modes;

    const cBandVal = cBands[band];
    cBands[band] = cBandVal === undefined ? 1 : cBandVal + 1;

    const cModeVal = cModes[mode];
    cModes[mode] = cModeVal === undefined ? 1 : cModeVal + 1;
  }
}
