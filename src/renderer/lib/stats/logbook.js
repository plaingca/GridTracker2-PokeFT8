// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Stats window: the logbook tab (sorting, searching, filtering, rendering) and worked-before searches (moved from GridTracker2.js)

// Called from GridTracher.html
function changeLogbookPage()
{
  qsoItemsPerPageTd.innerHTML = GT.settings.app.qsoItemsPerPage = parseInt(qsoItemsPerPageValue.value);
  
}

function updateLogbook()
{
  renderLogbookView();
}

function myCallCompare(a, b)
{
  return a.DEcall.localeCompare(b.DEcall);
}

function myGridCompare(a, b)
{
  return a.grid.localeCompare(b.grid);
}

function myModeCompare(a, b)
{
  return a.mode.localeCompare(b.mode);
}

function myDxccCompare(a, b)
{
  return GT.dxccToAltName[a.dxcc].localeCompare(GT.dxccToAltName[b.dxcc]);
}

function myTimeCompare(a, b)
{
  return a.time - b.time;
}

function myBandCompare(a, b)
{
  return a.band.localeCompare(b.band);
}

function myConfirmedCompare(a, b)
{
  if (a.confirmed && !b.confirmed) return 1;
  if (!a.confirmed && b.confirmed) return -1;
  return 0;
}

function myStateCompare(a, b)
{
  if (a.state && !b.state) return -1;
  if (!a.state && b.state) return 1;
  if (a.state > b.state) return 1;
  if (a.state < b.state) return -1;
  return 0;
}

function myCntyCompare(a, b)
{
  if (a.cnty && !b.cnty) return -1;
  if (!a.cnty && b.cnty) return 1;
  if (a.cnty > b.cnty) return 1;
  if (a.cnty < b.cnty) return -1;
  return 0;
}

function myPotaCompare(a, b)
{
  if (a.pota && !b.pota) return -1;
  if (!a.pota && b.pota) return 1;
  if (a.pota > b.pota) return 1;
  if (a.pota < b.pota) return -1;
  return 0;
}

function resetSearch()
{
  GT.lastSortIndex = 4;
  GT.qsoPages = 1;
  GT.qsoPage = 0;
  GT.lastSortType = 1;
  GT.searchWB = "";
  GT.gridSearch = "";
  GT.stateSearch = "";
  GT.cntySearch = "";
  GT.potaSearch = "";

  GT.filterBand = "Mixed";
  GT.filterMode = "Mixed";
  GT.filterDxcc = 0;
  GT.filterQSL = "All";

  GT.lastSearchSelection = null;
}

function renderLogbookByCall(callsign, event)
{
  event.preventDefault();

  resetSearch();
  GT.searchWB = callsign;
  if (event.shiftKey == true) GT.filterQSL = "true";
  openInfoTab("qsobox", "workedBoxDiv", renderLogbookView);
}

function renderLogbookSearchChanged(object, index)
{
  ValidateCallsign(object, null);
  GT.searchWB = object.value.toUpperCase();
  GT.lastSearchSelection = object.id;
  renderLogbookView(index, 0);
}

function renderLogbookSearchState(object, index)
{
  ValidateCallsign(object, null);
  GT.stateSearch = object.value.toUpperCase();
  GT.lastSearchSelection = object.id;
  renderLogbookView(index, 0);
}

function renderLogbookSearchCnty(object, index)
{
  ValidateCallsign(object, null);
  GT.cntySearch = object.value.toUpperCase();
  GT.lastSearchSelection = object.id;
  renderLogbookView(index, 0);
}

function renderLogbookSearchPOTA(object, index)
{
  ValidateCallsign(object, null);
  GT.potaSearch = object.value.toUpperCase();
  GT.lastSearchSelection = object.id;
  renderLogbookView(index, 0);
}

function renderLogbookSearchGrid(object, index)
{
  ValidateCallsign(object, null);
  GT.gridSearch = object.value.toUpperCase();
  GT.lastSearchSelection = object.id;
  renderLogbookView(index, 0);
}

function filterBandFunction(event, index)
{
  GT.filterBand = this.value;
  GT.lastSearchSelection = this.id;
  renderLogbookView(index, 0);
}

function filterModeFunction(event, index)
{
  GT.filterMode = this.value;
  GT.lastSearchSelection = this.id;
  renderLogbookView(index, 0);
}

function filterDxccFunction(event, index)
{
  GT.filterDxcc = this.value;
  GT.lastSearchSelection = this.id;
  renderLogbookView(index, 0);
}

function filterQSLFunction(event, index)
{
  GT.filterQSL = this.value;
  GT.lastSearchSelection = this.id;
  renderLogbookView(index, 0);
}

function changeZday(element)
{
  GT.Zday = element.checked;
  renderLogbookView();
}

function renderLogbookView(sortIndex = null, nextPage = 0)
{
  try
  {
    const myObjects = GT.QSOhash;
    const bands = {};
    const modes = {};
    const dxccs = {};
    const confSrcs = {};

    const perPage = GT.settings.app.qsoItemsPerPage;

    function startsWithCI(value, search)
    {
      return String(value).toLowerCase().startsWith(String(search).toLowerCase());
    }

    function includesCI(value, search)
    {
      return String(value).toLowerCase().includes(String(search).toLowerCase());
    }

    function matchesModeFilter(value)
    {
      if (GT.filterMode == "Mixed") return true;

      if (
        GT.filterMode == "Phone" &&
        value.mode in GT.modes_phone &&
        GT.modes_phone[value.mode]
      ) return true;

      if (
        GT.filterMode == "Digital" &&
        value.mode in GT.modes &&
        GT.modes[value.mode]
      ) return true;

      return value.mode == GT.filterMode;
    }

    function matchesQslFilter(value)
    {
      if (GT.filterQSL == "All") return true;

      if (GT.filterQSL == "false" || GT.filterQSL == "true")
      {
        return value.confirmed == (GT.filterQSL == "true");
      }

      return !!(value.confirmed && value.confSrcs && GT.filterQSL in value.confSrcs);
    }

    let mySort = sortIndex;

    if (mySort == null)
    {
      mySort = GT.lastSortIndex;
    }
    else
    {
      if (mySort == GT.lastSortIndex)
      {
        if (nextPage == 0) 
        {
          GT.lastSortType ^= 1;
          GT.qsoPage = 0;
        }
      }
      else
      {
        GT.lastSortType = 1;
        GT.qsoPage = 0;
      }
    }

    GT.lastSortIndex = mySort;

    const allList = Object.values(myObjects || {});
    let filtered = [];

    for (const value of allList)
    {
      if (GT.Zday && Math.floor(value.time / 86400) != GT.currentDay) continue;

      if (GT.searchWB.length > 0 && !includesCI(value.DEcall, GT.searchWB)) continue;

      if (GT.gridSearch.length > 0)
      {
        const x = startsWithCI(value.grid, GT.gridSearch);
        const y = Array.isArray(value.vucc_grids) &&
          value.vucc_grids.some(grid => startsWithCI(grid, GT.gridSearch));

        if (!x && !y) continue;
      }

      if (GT.stateSearch.length > 0)
      {
        if (!value.state || !includesCI(value.state, GT.stateSearch)) continue;
      }

      if (GT.cntySearch.length > 0)
      {
        if (!value.cnty) continue;
        if (!(value.cnty in GT.countyData)) continue;

        const countyName = GT.countyData[value.cnty].geo.properties.n;
        if (!includesCI(countyName, GT.cntySearch)) continue;
      }

      if (GT.potaSearch.length > 0)
      {
        if (!value.pota || !includesCI(value.pota, GT.potaSearch)) continue;
      }

      const pp = value.dxcc in GT.dxccInfo ? GT.dxccInfo[value.dxcc].pp : "?";
      bands[value.band] = value.band;
      modes[value.mode] = value.mode;
      dxccs[GT.dxccToAltName[value.dxcc] + " (" + pp + ")"] = value.dxcc;

      if (value.confirmed && value.confSrcs)
      {
        Object.assign(confSrcs, value.confSrcs);
      }

      if (GT.filterBand != "Mixed" && value.band != GT.filterBand) continue;
      if (!matchesModeFilter(value)) continue;
      if (GT.filterDxcc != 0 && value.dxcc != GT.filterDxcc) continue;
      if (!matchesQslFilter(value)) continue;

      filtered.push(value);
    }

    const sortFn = GT.sortFunction[GT.lastSortIndex];
    filtered.sort(function (a, b)
    {
      return (GT.lastSortType == 0) ? sortFn(a, b) : sortFn(b, a);
    });

    const ObjectCount = filtered.length;

    GT.qsoPages = Math.max(1, Math.ceil(ObjectCount / perPage));

    GT.qsoPage += (nextPage || 0);
    GT.qsoPage = ((GT.qsoPage % GT.qsoPages) + GT.qsoPages) % GT.qsoPages;

    const startIndex = GT.qsoPage * perPage;
    const endIndex = Math.min(startIndex + perPage, ObjectCount);

    const workHead = `<b> Entries (${ObjectCount})</b>` + 
      (GT.qsoPages > 1 ? `<br><font style='font-size:15px;' color='cyan' onClick='window.opener.renderLogbookView(${mySort}, -1);'>&#8678;&nbsp;</font> Page ${GT.qsoPage + 1} of ${GT.qsoPages} (${endIndex - startIndex}) <font style='font-size:16px;' color='cyan' onClick='window.opener.renderLogbookView(${mySort}, 1);'>&nbsp;&#8680;</font>` : "");

    setStatsDiv("workedHeadDiv", workHead);

    if (myObjects != null)
    {
      const clearBtn = (val, id, func) => val ? `<img title='Clear' onclick='${id}.value="";window.opener.${func}(${id});' src='img/trash_24x48.png' style='width:30px;margin:0px;padding:0px;margin-bottom:-4px;cursor:pointer;' />` : "";

      let tableHtml = `<table id='logTable' style='white-space:nowrap;overflow:auto;overflow-x:hidden;' class='darkTable' align=center>
        <tr>
          <th><input type='text' id='searchWB' style='margin:0px' class='inputTextValue' value='${GT.searchWB}' size='8' oninput='window.opener.renderLogbookSearchChanged(this);' />${clearBtn(GT.searchWB, "searchWB", "renderLogbookSearchChanged")}</th>
          <th><input type='text' id='searchGrid' style='margin:0px' class='inputTextValue' value='${GT.gridSearch}' size='6' oninput='window.opener.renderLogbookSearchGrid(this);' />${clearBtn(GT.gridSearch, "searchGrid", "renderLogbookSearchGrid")}</th>
          <th><div id='bandFilterDiv'></div></th>
          <th><div id='modeFilterDiv'></div></th>
          <th><div id='qslFilterDiv'></div></th>
          <th></th>
          <th></th>
          ${GT.filterDxcc !== "0" 
            ? `<th style='border-right:none;'><div id='dxccFilterDiv'></div></th><th style='border-left:none;'><img title='Show All' onclick='window.opener.GT.filterDxcc=0;window.opener.renderLogbookView();' src='img/trash_24x48.png' style='width:30px;margin:0px;padding:0px;margin-bottom:-4px;cursor:pointer' /></th>`
            : `<th colspan='2'><div id='dxccFilterDiv'></div></th>`
          }
          <th><input type='text' id='searchState' style='margin:0px' class='inputTextValue' value='${GT.stateSearch}' size='3' oninput='window.opener.renderLogbookSearchState(this);' />${clearBtn(GT.stateSearch, "searchState", "renderLogbookSearchState")}</th>
          <th><input type='text' id='searchCnty' style='margin:0px' class='inputTextValue' value='${GT.cntySearch}' size='4' oninput='window.opener.renderLogbookSearchCnty(this);' />${clearBtn(GT.cntySearch, "searchCnty", "renderLogbookSearchCnty")}</th>
          ${GT.settings.app.potaFeatureEnabled ? `<th><input type='text' id='searchPOTA' style='margin:0px' class='inputTextValue' value='${GT.potaSearch}' size='4' oninput='window.opener.renderLogbookSearchPOTA(this);' />${clearBtn(GT.potaSearch, "searchPOTA", "renderLogbookSearchPOTA")}</th>` : ""}
          <th><label>${I18N("gt.Zday")}</label>&nbsp;<input type='checkbox' id='Zday' ${GT.Zday ? "checked" : ""} onclick='window.opener.changeZday(Zday)'/></th>
        </tr>
        <tr>
          <th style='cursor:pointer;' align=center onclick='window.opener.renderLogbookView(0);'>${I18N("gt.qsoPage.Station")}</th>
          <th style='cursor:pointer;' align=center onclick='window.opener.renderLogbookView(1);'>${I18N("gt.qsoPage.Grid")}</th>
          <th style='cursor:pointer;' align=center onclick='window.opener.renderLogbookView(5);'>${I18N("gt.qsoPage.Band")}</th>
          <th style='cursor:pointer;' align=center onclick='window.opener.renderLogbookView(2);'>${I18N("gt.qsoPage.Mode")}</th>
          <th style='cursor:pointer;' align=center onclick='window.opener.renderLogbookView(6);'>${I18N("gt.qsoPage.QSL")}</th>
          <th align=center>${I18N("gt.qsoPage.Sent")}</th>
          <th align=center>${I18N("gt.qsoPage.Rcvd")}</th>
          <th style='cursor:pointer;' align=center onclick='window.opener.renderLogbookView(3);'>${I18N("gt.qsoPage.DXCC")}</th>
          <th style='cursor:pointer;' align=center onclick='window.opener.renderLogbookView(3);'>${I18N("gt.qsoPage.Flag")}</th>
          <th style='cursor:pointer;' align=center onclick='window.opener.renderLogbookView(8);'>${I18N("roster.secondary.wanted.state")}</th>
          <th style='cursor:pointer;' align=center onclick='window.opener.renderLogbookView(9);'>${I18N("roster.secondary.wanted.county")}</th>
          ${GT.settings.app.potaFeatureEnabled ? `<th style='cursor:pointer;' align=center onclick='window.opener.renderLogbookView(7);'>POTA</th>` : ""}
          <th style='cursor:pointer;' align=center onclick='window.opener.renderLogbookView(4);'>${I18N("gt.qsoPage.When")}</th>
          ${GT.settings.callsignLookups.lotwUseEnable ? `<th>${I18N("gt.qsoPage.LoTW")}</th>` : ""}
          ${GT.settings.callsignLookups.eqslUseEnable ? `<th>${I18N("gt.qsoPage.eQSL")}</th>` : ""}
          ${GT.settings.callsignLookups.oqrsUseEnable ? `<th>${I18N("gt.qsoPage.OQRS")}</th>` : ""}
        </tr>`;

      // Build Data Rows via ultra-fast array mapping
      tableHtml += filtered.slice(startIndex, endIndex).map(key => {
        let confTitle = "", confTd = "";
        if (key.confirmed && key.confSrcs) {
          confTd = Object.keys(key.confSrcs).join("");
          confTitle = `title='${Object.keys(key.confSrcs).map(src => GT.confSrcNames[src]).join(", ")}'`;
        }

        let stateTd = key.state ? `<td align=center style='color:lightgreen' ${key.state in GT.StateData ? `title='${GT.StateData[key.state].name}'` : ""}>${key.state.substr(3)}</td>` : `<td></td>`;
        let cntyTd = (key.cnty && key.cnty in GT.countyData) ? `<td align=center style='color:cyan'>${GT.countyData[key.cnty].geo.properties.n}</td>` : `<td></td>`;
        let potaTd = GT.settings.app.potaFeatureEnabled ? (key.pota ? `<td align=center style='color:#fbb6fc'>${key.pota}</td>` : `<td></td>`) : "";

        let lotwTd = GT.settings.callsignLookups.lotwUseEnable ? `<td align=center>${key.DEcall in GT.lotwCallsigns ? "&#10004;" : ""}</td>` : "";
        let eqslTd = GT.settings.callsignLookups.eqslUseEnable ? `<td align=center>${key.DEcall in GT.eqslCallsigns ? "&#10004;" : ""}</td>` : "";
        let oqrsTd = "";
        
        if (GT.settings.callsignLookups.oqrsUseEnable) {
          oqrsTd = key.DEcall in GT.oqrsCallsigns 
            ? (key.confirmed ? `<td>&#10004;</td>` : `<td style='cursor:pointer;' align='left' onClick='window.opener.openSite("https://clublog.org/logsearch/logsearch.php?log=${key.DEcall}&call=${key.DXcall}&SubmitLogSearch=Show+contacts");'>&#10004; &#128236;</td>`)
            : `<td></td>`;
        }

        return `<tr align=left>
          <td style='color:#ff0;cursor:pointer' onclick='window.opener.startLookup("${key.DEcall}","${key.grid}");'>${formatCallsign(key.DEcall)}</td>
          <td style='color:cyan;'>${key.grid}${key.vucc_grids.length ? ", " + key.vucc_grids.join(", ") : ""}</td>
          <td style='color:lightgreen'>${key.band}</td>
          <td style='color:lightblue'>${key.mode}</td>
          <td align=left ${confTitle}>${confTd}</td>
          <td>${key.RSTsent}</td>
          <td>${key.RSTrecv}</td>
          <td style='color:orange'>${GT.dxccToAltName[key.dxcc]} <font color='lightgreen'>(${key.dxcc in GT.dxccInfo ? GT.dxccInfo[key.dxcc].pp : "?"})</font></td>
          <td align=center style='margin:0;padding:0'><img style='padding-top:4px' src='img/flags/16/${key.dxcc in GT.dxccInfo ? GT.dxccInfo[key.dxcc].flag : "_United Nations.png"}'></td>
          ${stateTd}
          ${cntyTd}
          ${potaTd}
          <td style='color:lightblue'>${userTimeString(key.time * 1000)}</td>
          ${lotwTd}
          ${eqslTd}
          ${oqrsTd}
        </tr>`;
      }).join("") + "</table>";

      setStatsDiv("workedListDiv", tableHtml);

      statsValidateCallByElement("searchWB");
      statsValidateCallByElement("searchGrid");
      statsValidateCallByElement("searchState");
      statsValidateCallByElement("searchCnty");
      if (GT.settings.app.potaFeatureEnabled) statsValidateCallByElement("searchPOTA");

      let newSelect = document.createElement("select");
      newSelect.id = "bandFilter";
      newSelect.title = "Band Filter";

      let option = document.createElement("option");
      option.value = "Mixed";
      option.text = "Mixed";
      newSelect.appendChild(option);

      Object.keys(bands)
        .sort(function (a, b)
        {
          return parseInt(a) - parseInt(b);
        })
        .forEach(function (key)
        {
          const option = document.createElement("option");
          option.value = key;
          option.text = key;
          newSelect.appendChild(option);
        });

      statsAppendChild("bandFilterDiv", newSelect, "filterBandFunction", GT.filterBand, true);

      newSelect = document.createElement("select");
      newSelect.id = "modeFilter";
      newSelect.title = "Mode Filter";

      option = document.createElement("option");
      option.value = "Mixed";
      option.text = "Mixed";
      newSelect.appendChild(option);

      option = document.createElement("option");
      option.value = "Phone";
      option.text = "Phone";
      newSelect.appendChild(option);

      option = document.createElement("option");
      option.value = "Digital";
      option.text = "Digital";
      newSelect.appendChild(option);

      Object.keys(modes)
        .sort()
        .forEach(function (key)
        {
          const option = document.createElement("option");
          option.value = key;
          option.text = key;
          newSelect.appendChild(option);
        });

      statsAppendChild("modeFilterDiv", newSelect, "filterModeFunction", GT.filterMode, true);

      newSelect = document.createElement("select");
      newSelect.id = "dxccFilter";
      newSelect.title = "DXCC Filter";

      option = document.createElement("option");
      option.value = 0;
      option.text = "All";
      newSelect.appendChild(option);

      Object.keys(dxccs)
        .sort()
        .forEach(function (key)
        {
          const option = document.createElement("option");
          option.value = dxccs[key];
          option.text = key;
          newSelect.appendChild(option);
        });

      statsAppendChild("dxccFilterDiv", newSelect, "filterDxccFunction", GT.filterDxcc, true);

      newSelect = document.createElement("select");
      newSelect.id = "qslFilter";
      newSelect.title = "QSL Filter";

      option = document.createElement("option");
      option.value = "All";
      option.text = "All";
      newSelect.appendChild(option);

      option = document.createElement("option");
      option.value = true;
      option.text = "Yes";
      newSelect.appendChild(option);

      option = document.createElement("option");
      option.value = false;
      option.text = "No";
      newSelect.appendChild(option);

      Object.keys(confSrcs).forEach(function (key)
      {
        const option = document.createElement("option");
        option.value = key;
        option.text = GT.confSrcNames[key];
        newSelect.appendChild(option);
      });

      statsAppendChild("qslFilterDiv", newSelect, "filterQSLFunction", GT.filterQSL, true);

      statsFocus(GT.lastSearchSelection);
      setStatsDivHeight("workedListDiv", getStatsWindowHeight() - 6 + "px");
    }
    else
    {
      setStatsDiv("workedListDiv", "None");
    }
  }
  catch (e)
  {
    console.error(e);
  }
}

function searchWorked(dxcc, band, mode)
{
  resetSearch();
  GT.filterDxcc = dxcc;
  if (band.length > 0)
  {
    GT.filterBand = band;
  }
  if (mode.length > 0)
  {
    GT.filterMode = mode;
  }
  renderLogbookView();
}

function searchWorkedGrid(grid, band)
{
  resetSearch();
  GT.gridSearch = grid;
  if (band && band.length > 0)
  {
    GT.filterBand = band;
  }
  renderLogbookView();
}
