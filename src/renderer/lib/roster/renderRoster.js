function renderRoster(callRoster, rosterSettings)
{
  let columnOverrides = {
    Callsign: true
  }

  let visibleCallList = [];
  for (const entry in callRoster)
  {
    // entry should populate in general
    if (callRoster[entry].tx == true)
    {
      visibleCallList.push(callRoster[entry]);
    }
  }

  let totalCount = Object.keys(callRoster).length;
  let visibleCount = visibleCallList.length;
  let huntedCount = visibleCallList.filter(obj => Object.keys(obj.callObj.hunting).length > 0).length
  let countParts = [];

  if (totalCount != visibleCount)
  {
    countParts.push(`${totalCount} heard`);
  }

  countParts.push(`${visibleCount} in roster`);

  if (huntedCount != visibleCount)
  {
    countParts.push(`${huntedCount} wanted`);
  }

  window.document.title = `Call Roster: ${countParts.join(" • ")}`;
  let multiInstance = false;
  if (listShortInstances().length > 0)
  {
    window.document.title += " | " + listShortInstances().join(" • ");
    multiInstance = true;
  }
  let multiBand = Object.keys(rosterSettings.bands).length > 1;
  let showBands = (CR.rosterSettings.columns.Band || multiBand);
  let showModes = (CR.rosterSettings.columns.Mode || (Object.keys(rosterSettings.modes).length > 1));

  columnOverrides.Band = showBands;
  columnOverrides.Mode = showModes;
  const rosterColumns = rosterColumnList(CR.rosterSettings.columns, columnOverrides);

  if (CR.rosterSettings.compact)
  {
    sortCallList(visibleCallList, "Age", false, rosterColumns);
  }
  else
  {
    sortCallList(visibleCallList, CR.rosterSettings.sortColumn, CR.rosterSettings.sortReverse);
  }

  const html = [CR.rosterSettings.compact ? renderCompactRosterHeaders() : renderNormalRosterHeaders(rosterColumns)];

  // Third loop: render all rows
  for (const x in visibleCallList)
  {
    let callObj = visibleCallList[x].callObj;

    // TODO: This is filtering
    if (callObj.shouldRosterAlert == false && rosterSettings.onlyHits == true && callObj.qrz == false)
    { continue; }
    // Folks complained *shrug*, performance increase anyway
    // if (callObj.DEcall.match("^[KNW][0-9][A-W|Y|Z](/w+)?$")) { callObj.style.call = "class='oneByOne'"; }
    if (callObj.DEcall == GT.instances[callObj.instance].status.DXcall)
    {
      if (GT.instances[callObj.instance].status.TxEnabled == 1)
      {
        callObj.style.call = "class='dxCalling'";
      }
      else
      {
        callObj.style.call = "class='dxCaller'";
      }
    }

    html.push(CR.rosterSettings.compact ? renderCompactRosterRow(callObj, multiInstance || multiBand) : renderNormalRosterRow(rosterColumns, callObj));
  }

  html.push(CR.rosterSettings.compact ? renderCompactRosterFooter() : renderNormalRosterFooter());

  RosterTable.innerHTML = html.join("");
}
