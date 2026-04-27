const AWT_MAP =
{
  call: "huntCallsign", calls2band: "huntCallsign", calls2dxcc: "huntCallsign",
  grids: "huntGrid", dxcc2band: "huntDXCC", dxcc: "huntDXCC", states: "huntState",
  states2band: "huntState", cnty: "huntCounty", cqz: "huntCQz", px: "huntPX",
  pxplus: "huntPX", cont: "huntCont", cont2band: "huntCont", cont52band: "huntCont"
};

function createEmptyAudioAlerts()
{
  return {
    huntCallsign: 0, huntGrid: 0, huntDXCC: 0, huntState: 0, huntCounty: 0, 
    huntPOTA: 0, huntCQz: 0, huntITUz: 0, huntPX: 0, huntCont: 0, 
    huntWatcher: 0, huntAward: 0, huntDXM: 0 
  };
}

const kInversionAlpha = "DD";
const kRow = "#000000";
const kBold = "#000000;font-weight: bold;";
const kUnconf = "background-clip:padding-box;box-shadow: 0 0 7px 3px inset ";
const kLayeredAlpha = "77";
const kLayeredInversionAlpha = "66";
const kLayeredUnconf = "background-clip:padding-box;box-shadow: 0 0 4px 2px inset ";
const kLayeredUnconfAlpha = "AA";

// Ultra-fast style builder (V8 will inline this, preventing massive GC string churn)
const makeStyle = (conf, bg, color, extra = "") => `style='${conf}background-color:${bg};color:${color};${extra}'`;

function processRosterHunting(callRoster, rosterSettings)
{
  const currentYear = new Date().getUTCFullYear();
  const cYearStr = "c" + currentYear;
  const zYearStr = "z" + currentYear;
  
  const potaFeatureEnabled = (GT.settings.app.potaFeatureEnabled && GT.settings.map.offlineMode === false);
  const isAwardTracker = (GT.activeRoster.logbook.referenceNeed === LOGBOOK_AWARD_TRACKER);
  const AAW = GT.activeAudioAlerts.wanted;

  // Cache deep lookups ONCE outside the loop
  const trackerWorked = GT.tracker.worked;
  const trackerConfirmed = GT.tracker.confirmed;
  const instances = GT.instances;
  const huntIdx = rosterSettings.huntIndex;
  const workIdx = rosterSettings.workedIndex;
  const layeredMode = rosterSettings.layeredMode;
  
  const dayAsStr = CR.dayAsString;
  const myCall = GT.settings.app.myCall;
  const wantRRCQ = CR.rosterSettings.wantRRCQ;
  const cqOnly = CR.rosterSettings.cqOnly;
  const ulsUseEnable = GT.settings.callsignLookups.ulsUseEnable;
  
  // Cache time once for the Watchers lookup to avoid syscalls inside the loop
  const now = Date.now(); 

  for (const callHash in callRoster)
  {
    const entry = callRoster[callHash];
    const callObj = entry.callObj;
    const instanceStatus = instances[callObj.instance] ? instances[callObj.instance].status : null;

    // Special case check for called station
    if (callObj.qrz && !entry.tx)
    {
      if (instances[callObj.instance].crEnable || GT.instanceCount === 1)
      {
        if ((!(entry.DEcall in CR.ignoredCalls) && !(callObj.dxcc in CR.ignoredDxcc) && !(callObj.grid in CR.ignoredGrid)) ||
           (instanceStatus && instanceStatus.DXcall === entry.DEcall))
        {
          entry.tx = true;
        }
      }
    }

    // Skip the heavy lifting entirely if tx is false
    if (!entry.tx) continue;

    // Fast inline tracking instead of spreading objects
    let AH = isAwardTracker ? callObj.AH : createEmptyAudioAlerts();
    let hasAudioAlert = false; // Completely bypasses testShouldAudioAlert() loop
    let shouldRosterAlert = false;

    // Evaluate Wanted Tracking dynamically
    let rwActive = GT.activeRoster.wanted;
    if (isAwardTracker)
    {
      rwActive = { huntCallsign: false, huntGrid: false, huntDXCC: false, huntCQz: false, huntDXM: false, huntState: false, huntCounty: false, huntPOTA: false, huntITUz: false, huntPX: false, huntCont: false, huntWatcher: false };
      if (callObj.awardType in AWT_MAP)
      {
        rwActive[AWT_MAP[callObj.awardType]] = true;
      }
    }

    let workHashSuffix, layeredHashSuffix;
    if (layeredMode)
    {
      workHashSuffix = hashMaker(callObj, layeredMode);
      layeredHashSuffix = hashMaker(callObj, GT.activeRoster.logbook.referenceNeed);
    }
    else
    {
      workHashSuffix = hashMaker(callObj, GT.activeRoster.logbook.referenceNeed);
      layeredHashSuffix = false;
    }

    const callsign = entry.DEcall;
    const hash = callsign + workHashSuffix;
    let didWork = false;

    callObj.hunting = {};
    callObj.callFlags = {};
    callObj.style = callObj.style || {};
    callObj.DEcallHTML = null;
    callObj.DXcallHTML = null;
    callObj.msgHTML = null;
    callObj.gridHTML = null;

    // Baseline Style Configurations
    let callPointer = callObj.CQ ? "cursor:pointer" : "";
    let cntyPointer = (callObj.cnty && !callObj.qual) ? "cursor: pointer;" : "";
    
    let callColor = "#FFFF00", gridColor = "#00FFFF", callingColor = "#90EE90", dxccColor = "#FFA500",
        stateColor = "#90EE90", cntyColor = "#CCDD00", contColor = "#00DDDD", potaColor = "#fbb6fc",
        cqzColor = "#DDDDDD", ituzColor = "#DDDDDD", wpxColor = "#FFFF00", dxmColor = "#7398FF";

    let callBg = kRow, gridBg = kRow, callingBg = kRow, dxccBg = kRow, stateBg = kRow, cntyBg = kRow,
        contBg = kRow, potaBg = kRow, cqzBg = kRow, ituzBg = kRow, wpxBg = kRow, dxmBg = kRow;
        
    let callConf = "", gridConf = "", callingConf = "", dxccConf = "", stateConf = "", cntyConf = "",
        contConf = "", potaConf = "", cqzConf = "", ituzConf = "", wpxConf = "", dxmConf = "";

    // Global Tracker Evaluation
    if (hash in trackerWorked.call)
    {
      callObj.callFlags.worked = true;
      didWork = true;
      callConf = `${kUnconf}${callColor}${kInversionAlpha};`;

      if (hash in trackerConfirmed.call)
      {
        callObj.callFlags.confirmed = true;
        callPointer = "text-decoration: line-through;";
        callConf = "";
      }
    }

    // Skip when "only new calls"
    if (allOnlyNew.checked && didWork && !callObj.qrz)
    {
      if (potaFeatureEnabled && callObj.pota && (rwActive.huntPOTA || AAW.huntPOTA))
      {
        let potaHash = `${dayAsStr}.${callsign}.${callObj.pota}.${callObj.band}${callObj.mode}`;
        if (potaHash in trackerWorked.pota)
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

    // Station Caller Styling
    if (instanceStatus && callObj.DEcall === instanceStatus.DXcall)
    {
      if (instanceStatus.TxEnabled == 1)
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

    if (callObj.qrz)
    {
      callObj.callFlags.calling = true;
      callObj.hunting.qrz = "hunted";
      shouldRosterAlert = true;
    }

    // --- HUNTING STAGE ---

    // Hunt Callsign
    if (rwActive.huntCallsign || AAW.huntCallsign)
    {
      let layeredHash = layeredMode && (callsign + layeredHashSuffix);
      if (huntIdx && !(hash in huntIdx.call))
      {
        if (AAW.huntCallsign) { AH.huntCallsign++; hasAudioAlert = true; }
        if (rwActive.huntCallsign)
        {
          shouldRosterAlert = true;
          if (workIdx && hash in workIdx.call)
          {
            if (layeredMode && layeredHash in huntIdx.call)
            {
              callObj.hunting.call = "worked-and-mixed";
              callConf = `${kLayeredUnconf}${callColor}${kLayeredUnconfAlpha};`;
              callBg = `${callColor}${kLayeredInversionAlpha}`;
              callColor = kBold;
            }
            else
            {
              callObj.hunting.call = "worked";
              callConf = `${kUnconf}${callColor}${kInversionAlpha};`;
            }
          }
          else
          {
            if (layeredMode && layeredHash in huntIdx.call)
            {
              callObj.hunting.call = "mixed";
              callBg = `${callColor}${kLayeredAlpha};`;
              callColor = kBold;
            }
            else if (layeredMode && layeredHash in workIdx.call)
            {
              callObj.hunting.call = "mixed-worked";
              callConf = `${kUnconf}${callColor}${kLayeredAlpha};`;
            }
            else
            {
              callObj.hunting.call = "hunted";
              callBg = `${callColor}${kInversionAlpha};`;
              callColor = kBold;
            }
          }
        }
      }
    }

    // Hunt Watchers
    if (rwActive.huntWatcher || AAW.huntWatcher)
    {
      if (processWatchers(callObj, now))
      {
        if (AAW.huntWatcher) { AH.huntWatcher++; hasAudioAlert = true; }
        if (rwActive.huntWatcher) shouldRosterAlert = true;
      }
    }

    // Hunt Grids
    if ((rwActive.huntGrid || AAW.huntGrid) && callObj.grid.length > 1)
    {
      let gridSub = callObj.grid.substring(0, 4); 
      let gridHash = gridSub + workHashSuffix;
      let layeredHash = layeredMode && (gridSub + layeredHashSuffix);

      if (huntIdx && !(gridHash in huntIdx.grid))
      {
        if (AAW.huntGrid) { AH.huntGrid++; hasAudioAlert = true; }
        if (rwActive.huntGrid)
        {
          shouldRosterAlert = true;
          if (workIdx && gridHash in workIdx.grid)
          {
            if (layeredMode && layeredHash in huntIdx.grid)
            {
              callObj.hunting.grid = "worked-and-mixed";
              gridConf = `${kLayeredUnconf}${gridColor}${kLayeredUnconfAlpha};`;
              gridBg = `${gridColor}${kLayeredInversionAlpha}`;
              gridColor = kBold;
            }
            else
            {
              callObj.hunting.grid = "worked";
              gridConf = `${kUnconf}${gridColor}${kInversionAlpha};`;
            }
          }
          else
          {
            if (layeredMode && layeredHash in huntIdx.grid)
            {
              callObj.hunting.grid = "mixed";
              gridBg = `${gridColor}${kLayeredAlpha};`;
              gridColor = kBold;
            }
            else if (layeredMode && layeredHash in workIdx.grid)
            {
              callObj.hunting.grid = "mixed-worked";
              gridConf = `${kUnconf}${gridColor}${kLayeredAlpha};`;
            }
            else
            {
              callObj.hunting.grid = "hunted";
              gridBg = `${gridColor}${kInversionAlpha};`;
              gridColor = kBold;
            }
          }
        }
      }
    }

    // Hunting for DXCC
    if (rwActive.huntDXCC || AAW.huntDXCC)
    {
      let dxccHash = String(callObj.dxcc) + "|" + workHashSuffix;
      let layeredHash = layeredMode && (String(callObj.dxcc) + "|" + layeredHashSuffix);

      if (huntIdx && !(dxccHash in huntIdx.dxcc))
      {
        if (AAW.huntDXCC) { AH.huntDXCC++; hasAudioAlert = true; }
        if (rwActive.huntDXCC)
        {
          shouldRosterAlert = true;

          if (workIdx && dxccHash in workIdx.dxcc)
          {
            if (layeredMode && layeredHash in huntIdx.dxcc)
            {
              callObj.hunting.dxcc = "worked-and-mixed";
              dxccConf = `${kLayeredUnconf}${dxccColor}${kLayeredUnconfAlpha};`;
              dxccBg = `${dxccColor}${kLayeredInversionAlpha}`;
              dxccColor = kBold;
            }
            else
            {
              callObj.hunting.dxcc = "worked";
              dxccConf = `${kUnconf}${dxccColor}${kInversionAlpha};`;
            }
          }
          else
          {
            if (layeredMode && layeredHash in huntIdx.dxcc)
            {
              callObj.hunting.dxcc = "mixed";
              dxccBg = `${dxccColor}${kLayeredAlpha};`;
              dxccColor = kBold;
            }
            else if (layeredMode && layeredHash in workIdx.dxcc)
            {
              callObj.hunting.dxcc = "mixed-worked";
              dxccConf = `${kUnconf}${dxccColor}${kLayeredAlpha};`;
            }
            else
            {
              callObj.hunting.dxcc = "hunted";
              dxccBg = `${dxccColor}${kInversionAlpha};`;
              dxccColor = kBold;
            }
          }
        }
      }
    }

    // Hunting for DX Marathon
    if (rwActive.huntDXM || AAW.huntDXM)
    {
      let dxmHash = callObj.dxcc + cYearStr;
      let count = 0;
      let what = "";
      
      if (callObj.dxcc > 0 && !(dxmHash in trackerWorked.dxm))
      {
        count++;
        what = "DXCC";
      }
      
      let cqzHash = callObj.cqz + zYearStr;
      
      if (callObj.cqz && !(cqzHash in trackerWorked.dxm))
      {
        count++;
        what = "CQz";
      }
      
      if (count > 0)
      {
        if (AAW.huntDXM) { AH.huntDXM++; hasAudioAlert = true; }
        if (rwActive.huntDXM)
        {
          shouldRosterAlert = true;
          callObj.dxm = (count === 1) ? what : "DX+CQz";
          callObj.hunting.dxm = "hunted";
          dxmBg = `${dxmColor}${kInversionAlpha};`;
          dxmColor = kBold;
        }
      }
    }

    // Hunting for Known States
    if (rwActive.huntState || AAW.huntState)
    {
      let stateSearch = callObj.state;
      if (stateSearch in GT.StateData && isKnownCallsignDXCC(callObj.dxcc))
      {
        let stateHash = stateSearch + workHashSuffix;
        let layeredHash = layeredMode && (stateSearch + layeredHashSuffix);

        if (huntIdx && !(stateHash in huntIdx.state))
        {
          if (AAW.huntState) { AH.huntState++; hasAudioAlert = true; }
          if (rwActive.huntState)
          {
            shouldRosterAlert = true;

            if (workIdx && stateHash in workIdx.state)
            {
              if (layeredMode && layeredHash in huntIdx.state)
              {
                callObj.hunting.state = "worked-and-mixed";
                stateConf = `${kLayeredUnconf}${stateColor}${kLayeredUnconfAlpha};`;
                stateBg = `${stateColor}${kLayeredInversionAlpha}`;
                stateColor = kBold;
              }
              else
              {
                callObj.hunting.state = "worked";
                stateConf = `${kUnconf}${stateColor}${kInversionAlpha};`;
              }
            }
            else
            {
              if (layeredMode && layeredHash in huntIdx.state)
              {
                callObj.hunting.state = "mixed";
                stateBg = `${stateColor}${kLayeredAlpha};`;
                stateColor = kBold;
              }
              else if (layeredMode && layeredHash in workIdx.state)
              {
                callObj.hunting.state = "mixed-worked";
                stateConf = `${kUnconf}${stateColor}${kLayeredAlpha};`;
              }
              else
              {
                callObj.hunting.state = "hunted";
                stateBg = `${stateColor}${kInversionAlpha};`;
                stateColor = kBold;
              }
            }
          }
        }
      }
    }

    // Hunting for US Counties
    if ((rwActive.huntCounty || AAW.huntCounty) && ulsUseEnable)
    {
      if (callObj.cnty && callObj.cnty.length > 0 && isKnownCallsignUSplus(callObj.dxcc))
      {
        let cntyHash = callObj.cnty + (layeredMode ? layeredHashSuffix : workHashSuffix);

        if ((huntIdx && !(cntyHash in huntIdx.cnty)) || callObj.qual === false)
        {
          let shouldAlert = false;
          if (callObj.qual === false)
          {
            let counties = GT.zipToCounty[callObj.zipcode];
            let foundHit = false;
            
            for (const cnt in counties)
            {
              let hh = counties[cnt] + workHashSuffix;
              callObj.cnty = counties[cnt];
              if (huntIdx && !(hh in huntIdx.cnty))
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
            if (AAW.huntCounty) { AH.huntCounty++; hasAudioAlert = true; }
            if (rwActive.huntCounty)
            {
              shouldRosterAlert = true; 

              if (workIdx && cntyHash in workIdx.cnty)
              {
                callObj.hunting.cnty = "worked";
                cntyConf = `${kUnconf}${cntyColor}${kInversionAlpha};`;
              }
              else
              {
                callObj.hunting.cnty = "hunted";
                cntyBg = `${cntyColor}${kInversionAlpha}`;
                cntyColor = kBold;
              }
            }
          }
        }
      }
    }

    // Hunting for POTAs
    if (potaFeatureEnabled && (rwActive.huntPOTA || AAW.huntPOTA) && callObj.pota)
    {
      let potaHash = `${dayAsStr}.${callsign}.${callObj.pota}.${callObj.band}${callObj.mode}`;

      if (!(potaHash in trackerWorked.pota))
      {
        if (AAW.huntPOTA) { AH.huntPOTA++; hasAudioAlert = true; }
        if (rwActive.huntPOTA)
        {
          shouldRosterAlert = true;
          callObj.hunting.pota = "hunted";

          if (!(callObj.pota in trackerWorked.pota))
          {
            potaBg = `${potaColor}${kInversionAlpha};`;
            potaColor = kBold;
          }
          else
          {
            potaBg = `${potaColor}${kLayeredUnconfAlpha};`;
            potaColor = kBold;
          }
        }
      }
      else if (callObj.pota in trackerWorked.pota)
      {
        potaConf = `${kUnconf}${potaColor}${kInversionAlpha};`;
      }
    }

    // Hunting for CQ Zones
    if ((rwActive.huntCQz || AAW.huntCQz) && callObj.cqz)
    {
      let huntTotal = 1;
      let huntFound = 0, layeredFound = 0, workedFound = 0, layeredWorkedFound = 0;
      let cqzHash = callObj.cqz + "|" + workHashSuffix;
      let layeredHash = layeredMode && (callObj.cqz + "|" + layeredHashSuffix);
  
      if (huntIdx && cqzHash in huntIdx.cqz) huntFound++;
      if (layeredMode && layeredHash in huntIdx.cqz) layeredFound++;
      if (workIdx && cqzHash in workIdx.cqz) workedFound++;
      if (layeredMode && layeredHash in workIdx.cqz) layeredWorkedFound++;

      if (huntFound !== huntTotal)
      {
        if (AAW.huntCQz) { AH.huntCQz++; hasAudioAlert = true; }
        if (rwActive.huntCQz)
        {
          shouldRosterAlert = true;

          if (workIdx && workedFound === huntTotal)
          {
            if (layeredMode && layeredFound === huntTotal)
            {
              callObj.hunting.cqz = "worked-and-mixed";
              cqzConf = `${kLayeredUnconf}${cqzColor}${kLayeredUnconfAlpha};`;
              cqzBg = `${cqzColor}${kLayeredInversionAlpha}`;
              cqzColor = kBold;
            }
            else
            {
              callObj.hunting.cqz = "worked";
              cqzConf = `${kUnconf}${cqzColor}${kInversionAlpha};`;
            }
          }
          else
          {
            if (layeredMode && layeredFound === huntTotal)
            {
              callObj.hunting.cqz = "mixed";
              cqzBg = `${cqzColor}${kLayeredAlpha};`;
              cqzColor = kBold;
            }
            else if (layeredMode && layeredWorkedFound === huntTotal)
            {
              callObj.hunting.cqz = "mixed-worked";
              cqzConf = `${kUnconf}${cqzColor}${kLayeredAlpha};`;
            }
            else
            {
              callObj.hunting.cqz = "hunted";
              cqzBg = `${cqzColor}${kInversionAlpha};`;
              cqzColor = kBold;
            }
          }
        }
      }
    }

    // Hunting for ITU Zones
    if ((rwActive.huntITUz || AAW.huntITUz) && callObj.ituz)
    {
      let huntTotal = 1;
      let huntFound = 0, layeredFound = 0, workedFound = 0, layeredWorkedFound = 0;
      let ituzHash = callObj.ituz + "|" + workHashSuffix;
      let layeredHash = layeredMode && (callObj.ituz + "|" + layeredHashSuffix);

      if (huntIdx && ituzHash in huntIdx.ituz) huntFound++;
      if (layeredMode && layeredHash in huntIdx.ituz) layeredFound++;
      if (workIdx && ituzHash in workIdx.ituz) workedFound++;
      if (layeredMode && layeredHash in workIdx.ituz) layeredWorkedFound++;

      if (huntFound !== huntTotal)
      {
        if (AAW.huntITUz) { AH.huntITUz++; hasAudioAlert = true; }
        if (rwActive.huntITUz)
        {
          shouldRosterAlert = true;

          if (workIdx && workedFound === huntTotal)
          {
            if (layeredMode && layeredFound === huntTotal)
            {
              callObj.hunting.ituz = "worked-and-mixed";
              ituzConf = `${kLayeredUnconf}${ituzColor}${kLayeredUnconfAlpha};`;
              ituzBg = `${ituzColor}${kLayeredInversionAlpha}`;
              ituzColor = kBold;
            }
            else
            {
              callObj.hunting.ituz = "worked";
              ituzConf = `${kUnconf}${ituzColor}${kInversionAlpha};`;
            }
          }
          else
          {
            if (layeredMode && layeredFound === huntTotal)
            {
              callObj.hunting.ituz = "mixed";
              ituzBg = `${ituzColor}${kLayeredAlpha};`;
              ituzColor = kBold;
            }
            else if (layeredMode && layeredWorkedFound === huntTotal)
            {
              callObj.hunting.ituz = "mixed-worked";
              ituzConf = `${kUnconf}${ituzColor}${kLayeredAlpha};`;
            }
            else
            {
              callObj.hunting.ituz = "hunted";
              ituzBg = `${ituzColor}${kInversionAlpha};`;
              ituzColor = kBold;
            }
          }
        }
      }
    }

    // Hunting for WPX (Prefixes)
    if ((rwActive.huntPX || AAW.huntPX) && callObj.px)
    {
      let pxHash = callObj.px + workHashSuffix;
      let layeredHash = layeredMode && (callObj.px + layeredHashSuffix);

      if (huntIdx && !(pxHash in huntIdx.px))
      {
        if (AAW.huntPX) { AH.huntPX++; hasAudioAlert = true; }
        if (rwActive.huntPX)
        {
          shouldRosterAlert = true;

          if (workIdx && pxHash in workIdx.px)
          {
            if (layeredMode && layeredHash in huntIdx.px)
            {
              callObj.hunting.wpx = "worked-and-mixed";
              wpxConf = `${kLayeredUnconf}${wpxColor}${kLayeredUnconfAlpha};`;
              wpxBg = `${wpxColor}${kLayeredInversionAlpha}`;
              wpxColor = kBold;
            }
            else
            {
              callObj.hunting.wpx = "worked";
              wpxConf = `${kUnconf}${wpxColor}${kInversionAlpha};`;
            }
          }
          else
          {
            if (layeredMode && layeredHash in huntIdx.px)
            {
              callObj.hunting.wpx = "mixed";
              wpxBg = `${wpxColor}${kLayeredAlpha};`;
              wpxColor = kBold;
            }
            else if (layeredMode && layeredHash in workIdx.px)
            {
              callObj.hunting.wpx = "mixed-worked";
              wpxConf = `${kUnconf}${wpxColor}${kLayeredAlpha};`;
            }
            else
            {
              callObj.hunting.wpx = "hunted";
              wpxBg = `${wpxColor}${kInversionAlpha};`;
              wpxColor = kBold;
            }
          }
        }
      }
    }

    // Hunting for Continents
    if ((rwActive.huntCont || AAW.huntCont) && callObj.cont)
    {
      let contHash = callObj.cont + workHashSuffix;
      let layeredHash = layeredMode && (callObj.cont + layeredHashSuffix);

      if (huntIdx && !(contHash in huntIdx.cont))
      {
        if (AAW.huntCont) { AH.huntCont++; hasAudioAlert = true; }
        if (rwActive.huntCont)
        {
          shouldRosterAlert = true;

          if (workIdx && contHash in workIdx.cont)
          {
            if (layeredMode && layeredHash in huntIdx.cont)
            {
              callObj.hunting.cont = "worked-and-mixed";
              contConf = `${kLayeredUnconf}${contColor}${kLayeredUnconfAlpha};`;
              contBg = `${contColor}${kLayeredInversionAlpha}`;
              contColor = kBold;
            }
            else
            {
              callObj.hunting.cont = "worked";
              contConf = `${kUnconf}${contColor}${kInversionAlpha};`;
            }
          }
          else
          {
            if (layeredMode && layeredHash in huntIdx.cont)
            {
              callObj.hunting.cont = "mixed";
              contBg = `${contColor}${kLayeredAlpha};`;
              contColor = kBold;
            }
            else if (layeredMode && layeredHash in workIdx.cont)
            {
              callObj.hunting.cont = "mixed-worked";
              contConf = `${kUnconf}${contColor}${kLayeredAlpha};`;
            }
            else
            {
              callObj.hunting.cont = "hunted";
              contBg = `${contColor}${kInversionAlpha};`;
              contColor = kBold;
            }
          }
        }
      }
    }

    // Station is calling us
    if (callObj.DXcall === myCall)
    {
      callingBg = `#0000FF${kInversionAlpha}`;
      callingColor = "#FFFF00;text-shadow: 0px 0px 2px #FFFF00";
    }
    else if ((callObj.CQ || (wantRRCQ && callObj.RR73)) && !cqOnly)
    {
      callingBg = callingColor + kInversionAlpha;
      callingColor = kBold;
    }

    // --- FINALIZE CSS DOM STRINGS ---
    let styleObj = callObj.style;
    styleObj.call = makeStyle(callConf, callBg, callColor, callPointer);
    styleObj.grid = makeStyle(gridConf, gridBg, gridColor, "cursor:pointer");
    styleObj.calling = makeStyle(callingConf, callingBg, callingColor);
    styleObj.dxcc = makeStyle(dxccConf, dxccBg, dxccColor);
    styleObj.state = makeStyle(stateConf, stateBg, stateColor);
    styleObj.cnty = makeStyle(cntyConf, cntyBg, cntyColor, cntyPointer);
    styleObj.pota = makeStyle(potaConf, potaBg, potaColor);
    styleObj.cont = makeStyle(contConf, contBg, contColor);
    styleObj.cqz = makeStyle(cqzConf, cqzBg, cqzColor);
    styleObj.ituz = makeStyle(ituzConf, ituzBg, ituzColor);
    styleObj.px = makeStyle(wpxConf, wpxBg, wpxColor);
    styleObj.dxm = makeStyle(dxmConf, dxmBg, dxmColor);
    
    callObj.shouldRosterAlert = callObj.shouldRosterAlert || shouldRosterAlert;
    
    if (hasAudioAlert)
    {
      callObj.shouldAudioAlert = true;
      callObj.audioAlertReason = AH;
    }

    rosterSettings.modes[callObj.mode] = true;
    rosterSettings.bands[callObj.band] = true;
  }
}

function buildWatcher(watcher, key)
{
  try
  {
    CR.watchersTest[key] = watcher.regex 
      ? new RegExp(watcher.text, "gi")
      : new RegExp("^" + watcher.text + "$", "gi");
  }
  catch (e)
  {
    watcher.watch = false;
    CR.watchersTest[key] = null;
    watcher.error = true;
    wantRenderWatchersTab();
  }

  if (watcher.type === "Callsign")
  {
    watcher.source = "DEcall";
    watcher.html = "DEcallHTML";
  }
  else if (watcher.type === "Calling")
  {
    watcher.source = "DXcall";
    watcher.html = "DXcallHTML";
  }
  else if (watcher.type === "Grid")
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

function processWatchers(callObj, now)
{
  const watchers = CR.watchers;
  const watchersTest = CR.watchersTest;
  
  for (const key in watchers)
  {
    const watcher = watchers[key];
    
    if (!watcher.watch) continue;
    if (watcher.start && now < watcher.startTime) continue;
    
    if (watcher.end && now > watcher.endTime)
    {
      if (watcher.autoDelete)
      {
        delete watchers[key];
        delete watchersTest[key]; 
        wantRenderWatchersTab();
      }
      else
      {
        watcher.watch = false;
        wantRenderWatchersTab();
      }
      continue;
    }

    const regex = watchersTest[key] || buildWatcher(watcher, key);
    
    if (regex)
    {
      try
      {
        const sourceStr = callObj[watcher.source];
        
        // Reset regex index before test
        regex.lastIndex = 0;
        
        if (regex.test(sourceStr))
        {
          callObj.hunting.watcher = "hunted";
          callObj.watcherKey = key;
          
          // Reset index AGAIN before executing replace
          regex.lastIndex = 0;
          
          // Ultra-optimized Replacement:
          // We use $& (which represents the matched substring) instead of a JS callback
          // This keeps the entire regex string assembly in native C++
          const highlightedMatch = sourceStr.replace(regex, "{span class='regexMatch'}$&{/span}");
          
          callObj[watcher.html] = bracesToHTML(htmlEntities(highlightedMatch));
          
          return true; 
        }
      }
      catch (e)
      {
        watchersTest[key] = null;
        watcher.watch = false;
        watcher.error = true;
        wantRenderWatchersTab();
      }
    }
  }
  return false;
}
