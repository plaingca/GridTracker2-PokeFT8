const CALLSIGN_REGEXP = /^([A-Z0-9]+\/){0,1}([0-9][A-Z]{1,2}[0-9]|[A-Z]{1,2}[0-9])([A-Z0-9]+)(\/[A-Z0-9/]+){0,1}$/;
const GRID_REGEXP = /^[A-Z]{2}[0-9]{2}$/;

function processRosterFiltering(callRoster, rosterSettings)
{
  const rs = CR.rosterSettings;
  const cl = GT.settings.callsignLookups;
  const instances = GT.instances;
  const winOpener = window.opener; // Cache cross-context reference
  const now = rosterSettings.now;
  const viewHistoryTimeSec = GT.settings.reception.viewHistoryTimeSec;
  const myDxcc = GT.myDXCC;

  const maxLotwDays = rs.maxLoTW < 27 ? rs.maxLoTW * 30 : Infinity;
  const maxDT = rs.maxDT;
  const minDb = rs.minDb;
  const minFreq = rs.minFreq;
  const maxFreq = rs.maxFreq;

  for (const callHash in callRoster)
  {
    const entry = callRoster[callHash];
    const callObj = entry.callObj;
    const call = entry.DEcall;
    const msg = entry.message;

    // --- EXTREMELY FAST FAILURES (Run these first) ---
    if (now - callObj.age > rs.rosterTime)
    {
      entry.tx = false;
      entry.rosterAlerted = false;
      entry.audioAlerted = false;
      callObj.qrz = false;
      callObj.reset = true;
      continue;
    }

    // Missing requirements & disabled instances
    if (!callObj.dxcc || !(callObj.instance in instances))
    {
      entry.tx = false;
      continue;
    }

    if (GT.instanceCount > 1 && instances[callObj.instance].crEnable === false)
    {
      entry.tx = false;
      continue;
    }

    // Use RegExp.test() - Returns Boolean, 10x faster than .match() (No Array Allocation)
    if (!call || !CALLSIGN_REGEXP.test(call))
    {
      entry.tx = false;
      continue;
    }

    // Reset base states cleanly without trashing Hidden Classes
    entry.tx = true;
    callObj.shouldRosterAlert = false;
    callObj.shouldAudioAlert = false;
    callObj.AH = {};               // Will optimize later if AH shape can be static
    callObj.audioAlertReason = {}; // Same
    callObj.dxm = null;
    callObj.awardReason = null;
    callObj.awardType = null;

    const dxCall = entry.DXcall;

    if (call in CR.ignoredCalls ||
        callObj.ituz in CR.ignoredITUz ||
        callObj.cqz in CR.ignoredCQz ||
        callObj.dxcc in CR.ignoredDxcc ||
        callObj.grid in CR.ignoredGrid ||
        dxCall in CR.ignoredCQ ||
        (dxCall + ":" + callObj.dxcc) in CR.ignoredCQ)
    {
      entry.tx = false;
      continue;
    }

    if (rs.cqOnly)
    {
      if (rs.wantRRCQ)
      {
        if (!callObj.RR73 && !callObj.CQ)
        {
          entry.tx = false;
          continue;
        }
      }
      else if (!callObj.CQ)
      {
        entry.tx = false;
        continue;
      }
    }

    if (rs.requireGrid && callObj.grid.length !== 4)
    {
      entry.tx = false;
      continue;
    }
    
    if (rs.wantMinDB && msg.SR < minDb)
    {
      entry.tx = false;
      continue;
    }
    
    if (rs.wantMinFreq && msg.DF < minFreq)
    {
      entry.tx = false;
      continue;
    }
    
    if (rs.wantMaxFreq && msg.DF > maxFreq)
    {
      entry.tx = false;
      continue;
    }
       
    if (rs.wantMaxDT && (msg.DT > maxDT || msg.DT < -maxDT))
    {
      entry.tx = false;
      continue;
    }

    if (callObj.dxcc === myDxcc)
    {
      if (rs.noMyDxcc)
      {
        entry.tx = false;
        continue;
      }
    }
    else if (rs.onlyMyDxcc)
    {
      entry.tx = false;
      continue;
    }

    let usesOneOf = 0;
    let checkUses = 0;

    if (cl.lotwUseEnable && rs.usesLoTW)
    {
      checkUses++;
      const lotwTime = GT.lotwCallsigns[call]; 
      
      if (lotwTime !== undefined)
      {
        // Evaluated with integer math pre-calculated outside the loop
        if (maxLotwDays === Infinity || (CR.day - lotwTime) <= maxLotwDays)
        {
          usesOneOf++;
        }
      }
    }

    if (cl.eqslUseEnable && rs.useseQSL)
    {
      checkUses++;
      
      if (call in GT.eqslCallsigns)
      {
        usesOneOf++;
      }
    }

    if (cl.oqrsUseEnable && rs.usesOQRS)
    {
      checkUses++;
      
      if (call in GT.oqrsCallsigns)
      {
        usesOneOf++;
      }
    }

    if (checkUses > 0 && usesOneOf === 0)
    {
      entry.tx = false;
      continue;
    }

    // By moving this here, we only cross the Chromium window boundary for valid, filtered calls.
    if (rs.columns.Spot)
    {
      callObj.spot = winOpener.getSpotTime(call + callObj.mode + callObj.band);
      
      if (rs.onlySpot && (callObj.spot.when === 0 || (now - callObj.spot.when > viewHistoryTimeSec)))
      {
        entry.tx = false;
        continue;
      }
    }
    else
    {
      if (!callObj.spot)
      {
        callObj.spot = { when: 0, snr: 0 };
      }
      else
      {
        callObj.spot.when = 0;
        callObj.spot.snr = 0;
      }
    }

    if (rosterSettings.isAwardTracker)
    {
      let tx = false;
      const trackers = CR.awardTracker; // Local cache

      for (const award in trackers)
      {
        const trk = trackers[award];
        
        if (trk.enable)
        {
          tx = testAward(award, callObj);
          
          if (tx)
          {
            const sponsorData = CR.awards[trk.sponsor];
            const awardData = sponsorData.awards[trk.name];

            callObj.awardReason = awardData.tooltip + " (" + sponsorData.sponsor + ")";
            callObj.awardType = awardData.rule.type;
            callObj.shouldRosterAlert = true;

            if (GT.activeAudioAlerts.wanted.huntAward)
            {
              callObj.AH = { huntAward: 1 };
            }
            break;
          }
        }
      }
      entry.tx = tx;
    }
  }
}
