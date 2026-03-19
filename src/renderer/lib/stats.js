// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

document.addEventListener("dragover", function (event)
{
  event.preventDefault();
});

document.addEventListener("drop", function (event)
{
  event.preventDefault();
});

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
  if (typeof evt.currentTarget != "undefined")
  { evt.currentTarget.className += " active"; }
  else evt.className += " active";

  if (callFunc)
  {
    if (typeof window.opener.window[callFunc] != "undefined")
    {
      var caller = window.opener.window[callFunc];
      if (caller)
      {
        if (callObj) caller(callObj);
        else caller();
      }
    }
  }
}

function resetSearch()
{
  window.opener.resetSearch();
}

function lookupCallsign(callsign)
{
  window.opener.lookupCallsign(callsign);
}

function appendToChild(elementString, object, onInputString, defaultValue)
{
  window[elementString].appendChild(object);
  object.oninput = window.opener[onInputString];
  object.value = defaultValue;
}

function statsFocus(selection)
{
  var which = document.getElementById(selection);
  if (which != null)
  {
    which.focus();
    which.selectionStart = which.selectionEnd = which.value.length;
  }
}

function ValidateCallsign(inputText, validDiv)
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
      inputText.style.backgroundColor = "darkblue";
      if (validDiv) validDiv.innerHTML = I18N("stats.Validate.Valid");
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

function validateCallByElement(elementString)
{
  ValidateCallsign(window[elementString], null);
}

function init()
{
  openInfoTab(qsobox, "workedBoxDiv", "renderLogbookView");
  loadChildWindowI18n();
  registerCutAndPasteContextMenu();
}

function searchWorked(dxcc, band, mode)
{
  openInfoTab(qsobox, "workedBoxDiv", "renderLogbookView");
  window.opener.searchWorked(dxcc, band, mode);
}

function addTextToClipboard(data)
{
  navigator.clipboard.writeText(data);
}

function setClipboardFromLookup()
{
  if (GT.lastLookupAddress)
  {
    addTextToClipboard(GT.lastLookupAddress);
  }
}

function resizeWorked()
{
  workedListDiv.style.height = window.innerHeight - 63 - 6 + "px";
}

function Resize()
{
  if (GT.statsWindowInitialized == false) return;
  
  if (statBoxDiv.style.display == "block")
  {
    window.opener.showStatBox(true);
  }
  if (workedBoxDiv.style.display == "block")
  {
    resizeWorked();
  }
  if (callsignBoxDiv.style.display == "block")
  {
    window.opener.showCallsignBox(true);
  }
  if (dxccBoxDiv.style.display == "block")
  {
    window.opener.showDXCCsBox();
  }
  if (zonesBoxDiv.style.display == "block")
  {
    window.opener.showZonesBox();
  }
  if (wasPlusBoxDiv.style.display == "block")
  {
    window.opener.showWASPlusBox();
  }
  if (wpxBoxDiv.style.display == "block")
  {
    window.opener.showWPXBox(true);
  }
  if (decodeLastDiv.style.display == "block")
  {
    decodeLastListDiv.style.height = window.innerHeight - 63 + 26 + "px";
  }
}

function reloadInfo(bandOrMode)
{
  if (workedBoxDiv.style.display == "block")
  {
    window.opener.renderLogbookView();
  }
  if (statBoxDiv.style.display == "block")
  {
    window.opener.showStatBox(false);
  }
  if (callsignBoxDiv.style.display == "block")
  {
    window.opener.showCallsignBox(false);
  }
  if (dxccBoxDiv.style.display == "block")
  {
    window.opener.showDXCCsBox();
  }
  if (wpxBoxDiv.style.display == "block")
  {
    window.opener.showWPXBox();
  }

  if (zonesBoxDiv.style.display == "block")
  {
    window.opener.showZonesBox();
  }

  if (wasPlusBoxDiv.style.display == "block")
  {
    window.opener.showWASPlusBox();
  }
}

function contextMenu()
{
  const menu = new Menu();
  menu.append(new MenuItem({ label: I18N("copy"), role: 'copy' }));
  menu.append(new MenuItem({ label: I18N("paste"), role: 'paste' }));
  menu.popup();
}