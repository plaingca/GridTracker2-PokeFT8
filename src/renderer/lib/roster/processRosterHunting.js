

const AWT_MAP = {
  call: "huntCallsign",
  calls2band: "huntCallsign",
  calls2dxcc: "huntCallsign",
  grids: "huntGrid",
  dxcc2band: "huntDXCC",
  dxcc: "huntDXCC",
  states: "huntState",
  states2band: "huntState",
  cnty: "huntCounty",
  cqz: "huntCQz",
  px: "huntPX",
  pxplus: "huntPX",
  cont: "huntCont",
  cont2band: "huntCont",
  cont52band: "huntCont"
};

const AWARD_HUNT_EMPTY = {
  huntCallsign: false,
  huntGrid: false,
  huntDXCC: false,
  huntCQz: false,
  huntDXM: false,
  huntState: false,
  huntCounty: false,
  huntPOTA: false,
  huntITUz: false,
  huntPX: false,
  huntCont: false,
  huntWatcher: false
};

const AUDIO_ALERT_HUNT_ZERO = {
  huntCallsign: 0,
  huntGrid: 0,
  huntDXCC: 0,
  huntState: 0,
  huntCounty: 0,
  huntPOTA: 0,
  huntCQz: 0,
  huntITUz: 0,
  huntPX: 0,
  huntCont: 0,
  huntWatcher: 0,
  huntAward: 0,
  huntDXM: 0
};


const kInversionAlpha = "DD";
const kRow = "#000000";
const kBold = "#000000;font-weight: bold;";
const kUnconf = "background-clip:padding-box;box-shadow: 0 0 7px 3px inset ";
const kLayeredAlpha = "77";
const kLayeredInversionAlpha = "66";
const kLayeredUnconf = "background-clip:padding-box;box-shadow: 0 0 4px 2px inset ";
const kLayeredUnconfAlpha = "AA";

function processRosterHunting(callRoster, rosterSettings)
{
  const currentYear = new Date().getUTCFullYear();
  const potaFeatureEnabled = (GT.settings.app.potaFeatureEnabled && GT.settings.map.offlineMode == false);

  let isAwardTracker = (GT.activeRoster.logbook.referenceNeed == LOGBOOK_AWARD_TRACKER);
  // Rw == Roster Wanted
  let RW = GT.activeRoster.wanted;
  // AAW == Audio Alert Wanted
  let AAW = GT.activeAudioAlerts.wanted;
 
  // Second loop, hunting and highlighting
  for (const callHash in callRoster)
  {
    let entry = callRoster[callHash];
    let callObj = entry.callObj;

    // Special case check for called station
    if (callObj.qrz == true && entry.tx == false)
    {
      // The instance has to be enabled
      if (GT.instances[callObj.instance].crEnable == true || GT.instanceCount == 1)
      {
        // Calling us, but we wouldn't normally display
        // If they are not ignored or we're in a QSO with them, let it through

        // TODO: This is here because it's after the filtering stage
        if ((!(entry.DEcall in CR.ignoredCalls) && !(callObj.dxcc in CR.ignoredDxcc) && !(callObj.grid in CR.ignoredGrid)) ||
          GT.instances[callObj.instance].status.DXcall == entry.DEcall)
        {
          entry.tx = true;
        }
      }
    }

    // Only render entries with `tx == true`, ignore the rest
    if (entry.tx == true)
    {
      // AH = Audio Hunting Counts
      let AH = (isAwardTracker) ? callObj.AH : { ...AUDIO_ALERT_HUNT_ZERO };

      // In layered mode ("Hunting: mixed") the workHashSuffix becomes a more stricter 'live band',
      // while the layered suffix is a broader 'mixed band'
      let workHashSuffix, layeredHashSuffix;
      if (rosterSettings.layeredMode)
      {
        workHashSuffix = hashMaker(callObj, rosterSettings.layeredMode);
        layeredHashSuffix = hashMaker(callObj, GT.activeRoster.logbook.referenceNeed);
      }
      else
      {
        workHashSuffix = hashMaker(callObj, GT.activeRoster.logbook.referenceNeed);
        layeredHashSuffix = false;
      }
      let workHash = workHashSuffix; // TODO: Remove after replacing all occurrences with Suffix

      let callsign = entry.DEcall;

      callObj.hunting = {};
      callObj.callFlags = {};
      callObj.style = callObj.style || {};
      callObj.DEcallHTML = null;
      callObj.DXcallHTML = null;
      callObj.msgHTML = null;
      callObj.gridHTML = null;

      let colorObject = {};
      let callPointer = (callObj.CQ == true) ? "cursor:pointer" : "";
      let call = "#FFFF00";
      let grid = "#00FFFF";
      let calling = "#90EE90";
      let dxcc = "#FFA500";
      let state = "#90EE90";
      let cnty = "#CCDD00";
      let cont = "#00DDDD";
      let pota = "#fbb6fc";
      let cqz = "#DDDDDD";
      let ituz = "#DDDDDD";
      let wpx = "#FFFF00";
      let dxm = "#7398FF";
      let shouldRosterAlert = false;
   
      let callBg, gridBg, callingBg, dxccBg, stateBg, cntyBg, contBg, potaBg, cqzBg, ituzBg, wpxBg, dxmBg;
      let callConf, gridConf, callingConf, dxccConf, stateConf, cntyConf, contConf, potaConf, cqzConf, ituzConf, wpxConf, dxmConf;

      callBg = gridBg = callingBg = dxccBg = stateBg = cntyBg = contBg = potaBg = cqzBg = ituzBg = wpxBg = dxmBg = kRow;
      callConf = gridConf = callingConf = dxccConf = stateConf = cntyConf = contConf = potaConf = cqzConf = ituzConf = wpxConf = dxmConf = "";

      let cntyPointer = (callObj.cnty && callObj.qual == false) ? "cursor: pointer;" : "";
      let didWork = false;
      let hash = callsign + workHashSuffix;

      // Call worked in current logbook settings, regardless of hunting mode
      if (hash in GT.tracker.worked.call)
      {
        callObj.callFlags.worked = true;
        didWork = true;
        callConf = `${kUnconf}${call}${kInversionAlpha};`;

        if (hash in GT.tracker.confirmed.call)
        {
          callObj.callFlags.confirmed = true;
          callPointer = "text-decoration: line-through;";
          callConf = "";
        }
      }

    
      // Just All Traffic and Awards now, yay!
      {
        // Skip when "only new calls"
        // Questions: Move to the first loop? 
        if (allOnlyNew.checked == true && didWork && callObj.qrz == false)
        {
          if (potaFeatureEnabled && callObj.pota && (RW.huntPOTA || AAW.huntPOTA))
          {
            let hash = CR.dayAsString + "." + callsign + "." + callObj.pota + "." + callObj.band + callObj.mode;
            // POTA is only in the worked list
            if (hash in GT.tracker.worked.pota)
            {
              entry.tx = false;
              continue;             
            }
          }
          else
          {
            entry.tx = false;
            continue;
          }

        }

        // Special Calls, folks complained, so it's out
        /* if (callObj.DEcall.match("^[A-Z][0-9][A-Z](/w+)?$"))
        {
          callObj.style.call = "class='oneByOne'";
        } */

        // Entries currently calling or being called by us
        if (callObj.DEcall == GT.instances[callObj.instance].status.DXcall)
        {
          if (GT.instances[callObj.instance].status.TxEnabled == 1)
          {
            callObj.hunting.call = "calling";
            callObj.style.call = "class='dxCalling'";
          }
          else
          {
            callObj.hunting.call = "caller";
            callObj.style.call = "class='dxCaller'";
          }
        }

        // "stations calling you", only applies to the Roster
        if (callObj.qrz == true)
        {
          callObj.callFlags.calling = true;
          callObj.hunting.qrz = "hunted";
          shouldRosterAlert = true;
        }

        if (isAwardTracker)
        {
          RW = { ...AWARD_HUNT_EMPTY };
          if (callObj.awardType in AWT_MAP)
          {
            RW[AWT_MAP[callObj.awardType]] = true;
          }

        }

        // Hunting for callsigns
        if (RW.huntCallsign || AAW.huntCallsign)
        {
          let hash = callsign + workHashSuffix;
          let layeredHash = rosterSettings.layeredMode && (callsign + layeredHashSuffix);

          if (rosterSettings.huntIndex && !(hash in rosterSettings.huntIndex.call))
          {
            if (AAW.huntCallsign) AH.huntCallsign++;
            if (RW.huntCallsign)
            {
              shouldRosterAlert = true;

              if (rosterSettings.workedIndex && hash in rosterSettings.workedIndex.call)
              {
                if (rosterSettings.layeredMode && layeredHash in rosterSettings.huntIndex.call)
                {
                  callObj.hunting.call = "worked-and-mixed";
                  callConf = `${kLayeredUnconf}${call}${kLayeredUnconfAlpha};`;
                  callBg = `${call}${kLayeredInversionAlpha}`;
                  call = kBold;
                }
                else
                {
                  callObj.hunting.call = "worked";
                  callConf = `${kUnconf}${call}${kInversionAlpha};`;
                }
              }
              else
              {
                if (rosterSettings.layeredMode && layeredHash in rosterSettings.huntIndex.call)
                {
                  callObj.hunting.call = "mixed";
                  callBg = `${call}${kLayeredAlpha};`;
                  call = kBold;
                }
                else if (rosterSettings.layeredMode && layeredHash in rosterSettings.workedIndex.call)
                {
                  callObj.hunting.call = "mixed-worked";
                  callConf = `${kUnconf}${call}${kLayeredAlpha};`;
                }
                else
                {
                  callObj.hunting.call = "hunted";
                  callBg = `${call}${kInversionAlpha};`;
                  call = kBold;
                }
              }
            }
          }
        }

        if (RW.huntWatcher || AAW.huntWatcher)
        {
          let alert = processWatchers(callObj);
          if (alert)
          {
            if (AAW.huntWatcher) AH.huntWatcher++;
            if (RW.huntWatcher) shouldRosterAlert = true;
          }
        }

        // Hunting for grids
        if ((RW.huntGrid || AAW.huntGrid) && callObj.grid.length > 1)
        {
          let hash = callObj.grid.substr(0, 4) + workHashSuffix;
          let layeredHash = rosterSettings.layeredMode && (callObj.grid.substr(0, 4) + layeredHashSuffix);

          if (rosterSettings.huntIndex && !(hash in rosterSettings.huntIndex.grid))
          {
            if (AAW.huntGrid) AH.huntGrid++;
            if (RW.huntGrid)
            {
              shouldRosterAlert = true;

              if (rosterSettings.workedIndex && hash in rosterSettings.workedIndex.grid)
              {
                if (rosterSettings.layeredMode && layeredHash in rosterSettings.huntIndex.grid)
                {
                  callObj.hunting.grid = "worked-and-mixed";
                  gridConf = `${kLayeredUnconf}${grid}${kLayeredUnconfAlpha};`;
                  gridBg = `${grid}${kLayeredInversionAlpha}`;
                  grid = kBold;
                }
                else
                {
                  callObj.hunting.grid = "worked";
                  gridConf = `${kUnconf}${grid}${kInversionAlpha};`;
                }
              }
              else
              {
                if (rosterSettings.layeredMode && layeredHash in rosterSettings.huntIndex.grid)
                {
                  callObj.hunting.grid = "mixed";
                  gridBg = `${grid}${kLayeredAlpha};`;
                  grid = kBold;
                }
                else if (rosterSettings.layeredMode && layeredHash in rosterSettings.workedIndex.grid)
                {
                  callObj.hunting.grid = "mixed-worked";
                  gridConf = `${kUnconf}${grid}${kLayeredAlpha};`;
                }
                else
                {
                  callObj.hunting.grid = "hunted";
                  gridBg = `${grid}${kInversionAlpha};`;
                  grid = kBold;
                }
              }
            }
          }
        }

        // Hunting for DXCC
        if (RW.huntDXCC || AAW.huntDXCC)
        {
          let hash = String(callObj.dxcc) + "|" + workHashSuffix;
          let layeredHash = rosterSettings.layeredMode && (String(callObj.dxcc) + "|" + layeredHashSuffix)

          if (rosterSettings.huntIndex && !(hash in rosterSettings.huntIndex.dxcc))
          {
            if (AAW.huntDXCC) AH.huntDXCC++;
            if (RW.huntDXCC)
            {
              shouldRosterAlert = true;

              if (rosterSettings.workedIndex && hash in rosterSettings.workedIndex.dxcc)
              {
                if (rosterSettings.layeredMode && layeredHash in rosterSettings.huntIndex.dxcc)
                {
                  callObj.hunting.dxcc = "worked-and-mixed";
                  dxccConf = `${kLayeredUnconf}${dxcc}${kLayeredUnconfAlpha};`;
                  dxccBg = `${dxcc}${kLayeredInversionAlpha}`;
                  dxcc = kBold;
                }
                else
                {
                  callObj.hunting.dxcc = "worked";
                  dxccConf = `${kUnconf}${dxcc}${kInversionAlpha};`;
                }
              }
              else
              {
                if (rosterSettings.layeredMode && layeredHash in rosterSettings.huntIndex.dxcc)
                {
                  callObj.hunting.dxcc = "mixed";
                  dxccBg = `${dxcc}${kLayeredAlpha};`;
                  dxcc = kBold;
                }
                else if (rosterSettings.layeredMode && layeredHash in rosterSettings.workedIndex.dxcc)
                {
                  callObj.hunting.dxcc = "mixed-worked";
                  dxccConf = `${kUnconf}${dxcc}${kLayeredAlpha};`;
                }
                else
                {
                  callObj.hunting.dxcc = "hunted";
                  dxccBg = `${dxcc}${kInversionAlpha};`;
                  dxcc = kBold;
                }
              }
            }
          }
        }

        // Hunting for DX Marathon
        if (RW.huntDXM || AAW.huntDXM)
        {
          let hash = `${callObj.dxcc}c${currentYear}`;
          let count = 0;
          let what;
          if (callObj.dxcc > 0 && !(hash in GT.tracker.worked.dxm))
          {
            count++;
            what = "DXCC";
          }
          hash = `${callObj.cqz}z${currentYear}`;
          if (callObj.cqz && !(hash in GT.tracker.worked.dxm))
          {
            count++;
            what = "CQz";
          }
          if (count > 0)
          {
            if (AAW.huntDXM) AH.huntDXM++;
            if (RW.huntDXM)
            {
              shouldRosterAlert = true;
              callObj.dxm = (count == 1) ? what : "DX+CQz";
              callObj.hunting.dxm = "hunted";
              dxmBg = `${dxm}${kInversionAlpha};`;
              dxm = kBold;
            }
          }
        }

        // Hunting for Known States
        if (RW.huntState || AAW.huntState)
        {
          let stateSearch = callObj.state;
          if (stateSearch in GT.StateData && isKnownCallsignDXCC(callObj.dxcc))
          {
            let hash = stateSearch + workHashSuffix;
            let layeredHash = rosterSettings.layeredMode && (stateSearch + layeredHashSuffix)

            if (rosterSettings.huntIndex && !(hash in rosterSettings.huntIndex.state))
            {
              if (AAW.huntState) AH.huntState++;
              if (RW.huntState)
              {
                shouldRosterAlert = true;

                if (rosterSettings.workedIndex && hash in rosterSettings.workedIndex.state)
                {
                  if (rosterSettings.layeredMode && layeredHash in rosterSettings.huntIndex.state)
                  {
                    callObj.hunting.state = "worked-and-mixed";
                    stateConf = `${kLayeredUnconf}${state}${kLayeredUnconfAlpha};`;
                    stateBg = `${state}${kLayeredInversionAlpha}`;
                    state = kBold;
                  }
                  else
                  {
                    callObj.hunting.state = "worked";
                    stateConf = `${kUnconf}${state}${kInversionAlpha};`;
                  }
                }
                else
                {
                  if (rosterSettings.layeredMode && layeredHash in rosterSettings.huntIndex.state)
                  {
                    callObj.hunting.state = "mixed";
                    stateBg = `${state}${kLayeredAlpha};`;
                    state = kBold;
                  }
                  else if (rosterSettings.layeredMode && layeredHash in rosterSettings.workedIndex.state)
                  {
                    callObj.hunting.state = "mixed-worked";
                    stateConf = `${kUnconf}${state}${kLayeredAlpha};`;
                  }
                  else
                  {
                    callObj.hunting.state = "hunted";
                    stateBg = `${state}${kInversionAlpha};`;
                    state = kBold;
                  }
                }
              }
            }
          }
        }

        // Hunting for US Counties
        if ((RW.huntCounty || AAW.huntCounty) && GT.settings.callsignLookups.ulsUseEnable == true)
        {
          if (callObj.cnty && callObj.cnty.length > 0 && isKnownCallsignUSplus(callObj.dxcc))
          {
            let hash = callObj.cnty + (rosterSettings.layeredMode ? layeredHashSuffix : workHashSuffix);

            if ((rosterSettings.huntIndex && !(hash in rosterSettings.huntIndex.cnty)) || callObj.qual == false)
            {
              let shouldAlert = false
              if (callObj.qual == false)
              {
                let counties = GT.zipToCounty[callObj.zipcode];
                let foundHit = false;
                for (const cnt in counties)
                {
                  let hh = counties[cnt] + workHash;
                  callObj.cnty = counties[cnt];
                  if (rosterSettings.huntIndex && !(hh in rosterSettings.huntIndex.cnty))
                  {
                    foundHit = true;
                    break;
                  }
                }
                if (foundHit) shouldAlert = true;
              }
              else
              {
                shouldAlert = true;
              }

              if (shouldAlert)
              {
                if (AAW.huntCounty) AH.huntCounty++;
                if (RW.huntCounty)
                {
                  shouldRosterAlert = true; 

                  if (rosterSettings.workedIndex && hash in rosterSettings.workedIndex.cnty)
                  {
                    callObj.hunting.cnty = "worked";
                    cntyConf = `${kUnconf}${cnty}${kInversionAlpha};`;
                  }
                  else
                  {
                    callObj.hunting.cnty = "hunted";
                    cntyBg = `${cnty}${kInversionAlpha}`;
                    cnty = kBold;
                  }
                }
              }
            }
          }
        }

        // Hunting for POTAs
        if (potaFeatureEnabled && (RW.huntPOTA || AAW.huntPOTA) && callObj.pota)
        {
          let hash = CR.dayAsString + "." + callsign + "." + callObj.pota + "." + callObj.band + callObj.mode;

          // POTA is only in the worked list
          if (!(hash in GT.tracker.worked.pota))
          {
            if (AAW.huntPOTA) AH.huntPOTA++;
            if (RW.huntPOTA)
            {
              shouldRosterAlert = true;
              callObj.hunting.pota = "hunted";

              if (!(callObj.pota in GT.tracker.worked.pota)) 
              {
                // ATNO
                potaBg = `${pota}${kInversionAlpha};`;
                pota = kBold;
              }
              else
              {
                potaBg = `${pota}${kLayeredUnconfAlpha};`;
                pota = kBold;
              }
            }
          }
          else if (callObj.pota in GT.tracker.worked.pota)
          {
            potaConf = `${kUnconf}${pota}${kInversionAlpha};`;
          }
        }

        // Hunting for CQ Zones
        if ((RW.huntCQz || AAW.huntCQz) && callObj.cqz)
        {
          let huntTotal = 1;
          let huntFound = 0, layeredFound = 0, workedFound = 0, layeredWorkedFound = 0;
          let hash = callObj.cqz + "|" + workHashSuffix;
          let layeredHash = rosterSettings.layeredMode && (callObj.cqz + "|" + layeredHashSuffix);
      
          if (rosterSettings.huntIndex && hash in rosterSettings.huntIndex.cqz) huntFound++;
          if (rosterSettings.layeredMode && layeredHash in rosterSettings.huntIndex.cqz) layeredFound++;
          if (rosterSettings.workedIndex && hash in rosterSettings.workedIndex.cqz) workedFound++;
          if (rosterSettings.layeredMode && layeredHash in rosterSettings.workedIndex.cqz) layeredWorkedFound++;
    
          if (huntFound != huntTotal)
          {
            if (AAW.huntCQz) AH.huntCQz++;
            if (RW.huntCQz)
            {
              shouldRosterAlert = true;

              if (rosterSettings.workedIndex && workedFound == huntTotal)
              {
                if (rosterSettings.layeredMode && layeredFound == huntTotal)
                {
                  callObj.hunting.cqz = "worked-and-mixed";
                  cqzConf = `${kLayeredUnconf}${cqz}${kLayeredUnconfAlpha};`;
                  cqzBg = `${cqz}${kLayeredInversionAlpha}`;
                  cqz = kBold;
                }
                else
                {
                  callObj.hunting.cqz = "worked";
                  cqzConf = `${kUnconf}${cqz}${kInversionAlpha};`;
                }
              }
              else
              {
                if (rosterSettings.layeredMode && layeredFound == huntTotal)
                {
                  callObj.hunting.cqz = "mixed";
                  cqzBg = `${cqz}${kLayeredAlpha};`;
                  cqz = kBold;
                }
                else if (rosterSettings.layeredMode && layeredWorkedFound == huntTotal)
                {
                  callObj.hunting.cqz = "mixed-worked";
                  cqzConf = `${kUnconf}${cqz}${kLayeredAlpha};`;
                }
                else
                {
                  callObj.hunting.cqz = "hunted";
                  cqzBg = `${cqz}${kInversionAlpha};`;
                  cqz = kBold;
                }
              }
            }
          }
        }

        // Hunting for ITU Zones
        if ((RW.huntITUz || AAW.huntITUz) && callObj.ituz)
        {
          let huntTotal = 1;
          let huntFound = 0, layeredFound = 0, workedFound = 0, layeredWorkedFound = 0;
          let hash = callObj.ituz + "|" + workHashSuffix;
          let layeredHash = rosterSettings.layeredMode && (callObj.ituz + "|" + layeredHashSuffix)

          if (rosterSettings.huntIndex && hash in rosterSettings.huntIndex.ituz) huntFound++;
          if (rosterSettings.layeredMode && layeredHash in rosterSettings.huntIndex.ituz) layeredFound++;
          if (rosterSettings.workedIndex && hash in rosterSettings.workedIndex.ituz) workedFound++;
          if (rosterSettings.layeredMode && layeredHash in rosterSettings.workedIndex.ituz) layeredWorkedFound++;

          if (huntFound != huntTotal)
          {
            if (AAW.huntITUz) AH.huntITUz++;
            if (RW.huntITUz)
            {
              shouldRosterAlert = true;

              if (rosterSettings.workedIndex && workedFound == huntTotal)
              {
                if (rosterSettings.layeredMode && layeredFound == huntTotal)
                {
                  callObj.hunting.ituz = "worked-and-mixed";
                  ituzConf = `${kLayeredUnconf}${ituz}${kLayeredUnconfAlpha};`;
                  ituzBg = `${ituz}${kLayeredInversionAlpha}`;
                  ituz = kBold;
                }
                else
                {
                  callObj.hunting.ituz = "worked";
                  ituzConf = `${kUnconf}${ituz}${kInversionAlpha};`;
                }
              }
              else
              {
                if (rosterSettings.layeredMode && layeredFound == huntTotal)
                {
                  callObj.hunting.ituz = "mixed";
                  ituzBg = `${ituz}${kLayeredAlpha};`;
                  ituz = kBold;
                }
                else if (rosterSettings.layeredMode && layeredWorkedFound == huntTotal)
                {
                  callObj.hunting.ituz = "mixed-worked";
                  ituzConf = `${kUnconf}${ituz}${kLayeredAlpha};`;
                }
                else
                {
                  callObj.hunting.ituz = "hunted";
                  ituzBg = `${ituz}${kInversionAlpha};`;
                  ituz = kBold;
                }
              }
            }
          }
        }

        // Hunting for WPX (Prefixes)
        if ((RW.huntPX || AAW.huntPX) && callObj.px)
        {
          let hash = callObj.px + workHashSuffix;
          let layeredHash = rosterSettings.layeredMode && (callObj.px + layeredHashSuffix)

          if (rosterSettings.huntIndex && !(hash in rosterSettings.huntIndex.px))
          {
            if (AAW.huntPX) AH.huntPX++;
            if (RW.huntPX)
            {
              shouldRosterAlert = true;

              if (rosterSettings.workedIndex && hash in rosterSettings.workedIndex.px)
              {
                if (rosterSettings.layeredMode && layeredHash in rosterSettings.huntIndex.px)
                {
                  callObj.hunting.wpx = "worked-and-mixed";
                  wpxConf = `${kLayeredUnconf}${wpx}${kLayeredUnconfAlpha};`;
                  wpxBg = `${wpx}${kLayeredInversionAlpha}`;
                  wpx = kBold;
                }
                else
                {
                  callObj.hunting.wpx = "worked";
                  wpxConf = `${kUnconf}${wpx}${kInversionAlpha};`;
                }
              }
              else
              {
                if (rosterSettings.layeredMode && layeredHash in rosterSettings.huntIndex.px)
                {
                  callObj.hunting.wpx = "mixed";
                  wpxBg = `${wpx}${kLayeredAlpha};`;
                  wpx = kBold;
                }
                else if (rosterSettings.layeredMode && layeredHash in rosterSettings.workedIndex.px)
                {
                  callObj.hunting.wpx = "mixed-worked";
                  wpxConf = `${kUnconf}${wpx}${kLayeredAlpha};`;
                }
                else
                {
                  callObj.hunting.wpx = "hunted";
                  wpxBg = `${wpx}${kInversionAlpha};`;
                  wpx = kBold;
                }
              }
            }
          }
        }

        // Hunting for Continents
        if ((RW.huntCont || AAW.huntCont) && callObj.cont)
        {
          let hash = callObj.cont + workHashSuffix;
          let layeredHash = rosterSettings.layeredMode && (callObj.cont + layeredHashSuffix)

          if (rosterSettings.huntIndex && !(hash in rosterSettings.huntIndex.cont))
          {
            if (AAW.huntCont) AH.huntCont++;
            if (RW.huntCont)
            {
              shouldRosterAlert = true;

              if (rosterSettings.workedIndex && hash in rosterSettings.workedIndex.cont)
              {
                if (rosterSettings.layeredMode && layeredHash in rosterSettings.huntIndex.cont)
                {
                  callObj.hunting.cont = "worked-and-mixed";
                  contConf = `${kLayeredUnconf}${cont}${kLayeredUnconfAlpha};`;
                  contBg = `${cont}${kLayeredInversionAlpha}`;
                  cont = kBold;
                }
                else
                {
                  callObj.hunting.cont = "worked";
                  contConf = `${kUnconf}${cont}${kInversionAlpha};`;
                }
              }
              else
              {
                if (rosterSettings.layeredMode && layeredHash in rosterSettings.huntIndex.cont)
                {
                  callObj.hunting.cont = "mixed";
                  contBg = `${cont}${kLayeredAlpha};`;
                  cont = kBold;
                }
                else if (rosterSettings.layeredMode && layeredHash in rosterSettings.workedIndex.cont)
                {
                  callObj.hunting.cont = "mixed-worked";
                  contConf = `${kUnconf}${cont}${kLayeredAlpha};`;
                }
                else
                {
                  callObj.hunting.cont = "hunted";
                  contBg = `${cont}${kInversionAlpha};`;
                  cont = kBold;
                }
              }
            }
          }
        }
      }

      // Station is calling us
      if (callObj.DXcall == GT.settings.app.myCall)
      {
        callingBg = "#0000FF" + kInversionAlpha;
        calling = "#FFFF00;text-shadow: 0px 0px 2px #FFFF00";
      }
      else if ((callObj.CQ == true || (CR.rosterSettings.wantRRCQ && callObj.RR73 == true)) && !CR.rosterSettings.cqOnly)
      {
        callingBg = calling + kInversionAlpha;
        calling = kBold;
        // If treating RR73/73 as CQ, soften highlighting to help differentiate foreshadow from an actual CQ
        if (CR.rosterSettings.wantRRCQ && callObj.RR73 == true)
        {
          callingConf = `${kUnconf}#90EE90${kInversionAlpha};`;
          calling = `#90EE90${kInversionAlpha};`
          callingBg = "#000000"
        }
      }
  
      // Assemble all styles
      colorObject.call = "style='" + callConf + "background-color:" + callBg + ";color:" + call + ";" + callPointer + "'";
      colorObject.grid = "style='" + gridConf + "background-color:" + gridBg + ";color:" + grid + ";cursor:pointer'";
      colorObject.calling = "style='" + callingConf + "background-color:" + callingBg + ";color:" + calling + "'";
      colorObject.dxcc = "style='" + dxccConf + "background-color:" + dxccBg + ";color:" + dxcc + "'";
      colorObject.state = "style='" + stateConf + "background-color:" + stateBg + ";color:" + state + "'";
      colorObject.cnty = "style='" + cntyConf + "background-color:" + cntyBg + ";color:" + cnty + ";" + cntyPointer + "'";
      colorObject.pota = "style='" + potaConf + "background-color:" + potaBg + ";color:" + pota + "'";
      colorObject.cont = "style='" + contConf + "background-color:" + contBg + ";color:" + cont + "'";
      colorObject.cqz = "style='" + cqzConf + "background-color:" + cqzBg + ";color:" + cqz + "'";
      colorObject.ituz = "style='" + ituzConf + "background-color:" + ituzBg + ";color:" + ituz + "'";
      colorObject.px = "style='" + wpxConf + "background-color:" + wpxBg + ";color:" + wpx + "'";
      colorObject.dxm = "style='" + dxmConf + "background-color:" + dxmBg + ";color:" + dxm + "'";
      callObj.style = colorObject;
      callObj.shouldRosterAlert ||= shouldRosterAlert;
      callObj.shouldAudioAlert ||= testShouldAudioAlert(callObj, AH);
      rosterSettings.modes[callObj.mode] = true;
      rosterSettings.bands[callObj.band] = true;
    }
  }
}

function testShouldAudioAlert(callObj, AudioAlertHuntObject)
{
  let alert = false;
  for (const key in AudioAlertHuntObject)
  {
    if (AudioAlertHuntObject[key] > 0)
    {
      alert = true;
      break;
    }
  }
  if (alert)
  {
    callObj.audioAlertReason = AudioAlertHuntObject;
  }
  return alert;
}

function buildWatcher(watcher, key)
{
  if (watcher.regex)
  {
    try
    {
      CR.watchersTest[key] = new RegExp(watcher.text, "gi");
    }
    catch (e)
    {
      watcher.watch = false;
      CR.watchersTest[key] = null;
      watcher.error = true;
      wantRenderWatchersTab();
    }
  }
  else
  {
    try
    {
      CR.watchersTest[key] = new RegExp("^" + watcher.text + "$", "gi");
    }
    catch (e)
    {
      watcher.watch = false;
      CR.watchersTest[key] = null;
      watcher.error = true;
      wantRenderWatchersTab();
    }
  }

  if (watcher.type == "Callsign")
  {
    watcher.source = "DEcall";
    watcher.html = "DEcallHTML";
  }
  else if (watcher.type == "Calling")
  {
    watcher.source = "DXcall";
    watcher.html = "DXcallHTML";
  }
  else if (watcher.type == "Grid")
  {
    watcher.source = "grid";
    watcher.html = "gridHTML";
  }
  else
  {
    watcher.source = "msg";
    watcher.html = "msgHTML";
  }
  return CR.watchersTest[key];
}

function processWatchers(callObj)
{
  let now = Date.now();
  for (let key in CR.watchers)
  {
    let watcher = CR.watchers[key];
    if (watcher.watch)
    {
      if (watcher.start && now < watcher.startTime) continue;
      if (watcher.end && now > watcher.endTime)
      {
        if (watcher.autoDelete)
        {
          // Don't call deleteWatcher() as it calls the roster renderer
          delete CR.watchers[key];
          if (key in CR.watchersTest) delete CR.watchersTest[key];
          wantRenderWatchersTab();
        }
        else
        {
          watcher.watch = false;
          wantRenderWatchersTab();
        }
        continue;
      }
      CR.watchersTest[key] = CR.watchersTest[key] || buildWatcher(watcher, key);
      if (CR.watchersTest[key])
      {
        try
        {
          if (callObj[watcher.source].match(CR.watchersTest[key]))
          {
            callObj.hunting.watcher = "hunted";
            callObj.watcherKey = key;
            callObj[watcher.html] = bracesToHTML(htmlEntities(callObj[watcher.source].replace(CR.watchersTest[key], (x, y) => `{span class='regexMatch'}${x}{/span}`)));
            return true;
          }
        }
        catch (e)
        {
          CR.watchersTest[key] = null;
          watcher.watch = false;
          watcher.error = true;
          wantRenderWatchersTab();
        }
      }
    }
  }
  return false;
}
