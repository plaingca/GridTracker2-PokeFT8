// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Settings: the 'working' callsign, grid and date filters (moved from GridTracker2.js)

function workingCallsignEnableChanged(ele)
{
  GT.settings.app.workingCallsignEnable = ele.checked;
  applyCallsignsAndDateDiv.style.display = "";
}

function workingGridEnableChanged(ele)
{
  GT.settings.app.workingGridEnable = ele.checked;
  applyCallsignsAndDateDiv.style.display = "";
}

function workingDateEnableChanged(ele)
{
  GT.settings.app.workingDateEnable = ele.checked;
  applyCallsignsAndDateDiv.style.display = "";
}

function workingDateChanged()
{
  if (workingDateValue.value.length == 0)
  {
    workingDateValue.value = "1970-01-01T00:00";
  }

  if (workingDateValue.value == "1970-01-01T00:00")
  {
    workingDateEnableTd.style.display = "none";
    workingDateEnable.checked = GT.settings.app.workingDateEnable = false;
  }
  else
  {
    workingDateEnableTd.style.display = "";
  }

  GT.settings.app.workingDate = parseInt(Date.parse(workingDateValue.value + "Z") / 1000);

  displayWorkingDate();

  applyCallsignsAndDateDiv.style.display = "";
}

function displayWorkingDate()
{
  let date = new Date(GT.settings.app.workingDate * 1000);
  workingDateValue.value = date.toISOString().slice(0, 16);
  workingDateString.innerHTML = dateToString(date);
}

function workingCallsignsChanged(ele)
{
  let valid = ValidateCallsigns(ele); 
  if (valid)
  {
    let tempWorkingCallsigns = {};
    let callsigns = ele.value.split(",");
    for (let call in callsigns)
    {
      tempWorkingCallsigns[callsigns[call]] = true;
    }
    if (callsigns.length > 0)
    {
      workingCallsignEnableTd.style.display = "";
      GT.settings.app.workingCallsigns = Object.assign({}, tempWorkingCallsigns);
      if (GT.settings.app.workingCallsignEnable) { applyCallsignsAndDateDiv.style.display = ""; }
    }
  }
  else
  {
    GT.settings.app.workingCallsigns = {};
    workingCallsignEnable.checked = GT.settings.app.workingCallsignEnable = false;
    workingCallsignEnableTd.style.display = "none";
  }
  applyCallsignsAndDateDiv.style.display = "";
}

function workingGridsChanged(ele)
{
  let valid = ValidateGrids(ele); 
  if (valid)
  {
    let tempWorkingGrids = {};
    let grids = ele.value.split(",");
    for (let grid in grids)
    {
      tempWorkingGrids[grids[grid]] = true;
    }
    if (grids.length > 0)
    {
      workingGridEnableTd.style.display = "";
      GT.settings.app.workingGrids = Object.assign({}, tempWorkingGrids);
      if (GT.settings.app.workingGridEnable) { applyCallsignsAndDateDiv.style.display = ""; }
    }
  }
  else
  {
    GT.settings.app.workingGrids = {};
    workingGridEnable.checked = GT.settings.app.workingGridEnable = false;
    workingGridEnableTd.style.display = "none";
  }
  applyCallsignsAndDateDiv.style.display = "";
}

function applyCallsignsAndDates()
{
  clearQSOs(GT.settings.app.workingGridEnable, "startupAdifLoadCheck");

  applyCallsignsAndDateDiv.style.display = "none";
}

function selectElementContents(el)
{
  if (document.createRange && window.getSelection)
  {
    let range = document.createRange();
    let sel = window.getSelection();
    sel.removeAllRanges();
    range.selectNodeContents(el);
    sel.addRange(range);
    let text = sel.toString();
    text = text.replace(/\t/g, ",");
    sel.removeAllRanges();
    selectNodeDiv.innerText = text;
    range.selectNodeContents(selectNodeDiv);
    sel.addRange(range);
    document.execCommand("copy");
    sel.removeAllRanges();
    selectNodeDiv.innerText = "";
  }
}

function createWorkingObject(name)
{
  return {
    name,
    worked: false,
    confirmed: false,
    worked_bands: {},
    confirmed_bands: {},
    worked_modes: {},
    confirmed_modes: {}
  };
}
