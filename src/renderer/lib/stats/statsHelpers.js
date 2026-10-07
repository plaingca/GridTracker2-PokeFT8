// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Stats window: opening it and writing into it (div content, sizing, focus, input validation), session callsign list (moved from GridTracker2.js)

function openStatsWindow(show = true)
{
  if (GT.statsWindowHandle == null)
  {
    GT.statsWindowHandle = window.open("gt_stats.html", "gt_stats");
  }
  else if (GT.statsWindowInitialized == true)
  {
    show ? electron.ipcRenderer.send("showWin", "gt_stats") : electron.ipcRenderer.send("hideWin", "gt_stats");
  }
}

function getSortedCallsigns() {
    const size = GT.sessionCallsigns.size;
    const sortedList = new Array(size); 
    
    let i = 0;
    // 2. Iterate using Map iterators (very fast in V8)
    for (const session of GT.sessionCallsigns.values()) {
        sortedList[i++] = session;
    }

    sortedList.sort((a, b) => b.time - a.time); 

    return sortedList;
}

function setStatsDiv(div, worker)
{
  if (GT.statsWindowInitialized)
  {
      const el = GT.statsWindowHandle.document.getElementById(div);
      if (el)
      {
        el.innerHTML = worker;                 
      }
  }
}

function setStatsDivHeight(div, heightWithPx)
{
  if (GT.statsWindowInitialized)
  {
    GT.statsWindowHandle.window[div].style.height = heightWithPx;
  }
}

function getStatsWindowHeight()
{
  if (GT.statsWindowInitialized)
  {
    return GT.statsWindowHandle.window.window.innerHeight - 63;
  }
  return 300;
}

function statsValidateCallByElement(elementString)
{
  if (GT.statsWindowInitialized)
  {
    GT.statsWindowHandle.window.validateCallByElement(elementString);
  }
}

function statsFocus(selection)
{
  if (GT.statsWindowInitialized)
  {
    GT.statsWindowHandle.window.statsFocus(selection);
  }
}

function statsAppendChild(elementString, object, onInputString, defaultValue)
{
  if (GT.statsWindowInitialized)
  {
    GT.statsWindowHandle.window.appendToChild(
      elementString,
      object,
      onInputString,
      defaultValue
    );
  }
}
