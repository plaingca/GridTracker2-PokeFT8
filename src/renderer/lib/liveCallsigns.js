// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Live callsigns heard from WSJT-X/JTDX and the session callsign list (moved from GridTracker2.js)

class CallsignSession {
    constructor(callObj) {
      this.grid = callObj.grid;
      this.cqz = callObj.cqz;
      this.ituz = callObj.ituz;
      this.band = callObj.band;
      this.time = callObj.time;
      this.dxcc = callObj.dxcc;
      this.geo = GT.dxccInfo[callObj.dxcc];
      this.DEcall = callObj.DEcall;
    }
}

// =========================================================================
// V8 OPTIMIZATION: Rigid Object Constructor for Live Callsigns
// Guarantees a single Hidden Class (Memory Shape) for massive V8 speedups.
// =========================================================================
function LiveCallsign(DEcall, DXcall, grid, mode, band, msg, dxcc, time) {
  // 1. Core identifiers
  this.hash = null;
  this.DEcall = DEcall;
  this.DXcall = DXcall;
  this.grid = grid;
  this.gridQualified = false;
  this.mode = mode;
  this.band = band;
  this.msg = msg;
  this.dxcc = dxcc;
  
  // 2. Timestamps
  this.time = time;
  this.age = time;
  this.life = time;
  
  // 3. QSO Data
  this.worked = false;
  this.confirmed = false;
  this.qso = false;
  this.RSTsent = "-";
  this.RSTrecv = "-";
  this.dt = 0.0;
  this.delta = -1;
  this.wspr = null;
  
  // 4. Geographic Data
  this.distance = 0;
  this.heading = 0;
  this.px = null;
  this.zone = null;
  this.cont = null;
  this.pota = null;
  this.state = null;
  this.cnty = null;
  this.zipcode = null;
  this.fips = null;
  this.ituz = null;
  this.cqz = null;
  
  // 5. System State / Flags
  this.instance = null;
  this.rosterAlerted = false;
  this.shouldRosterAlert = false;
  this.audioAlerted = false;
  this.shouldAudioAlert = false;
  this.qrz = false;
  this.digital = true;
  this.phone = false;
  this.even = false;
  this.qual = false;
  this.locked = false;
  this.reset = false;
  this.CQ = false;
  this.RR73 = false;
  
  // 6. Arrays / Strings
  this.vucc_grids = [];
  this.propMode = "";
  this.IOTA = "";
  this.cntys = 0;
  this.UTC = "";
}

function addLiveCallsign(
  finalGrid,
  finalDXcall,
  finalDEcall,
  finalRSTsent,
  finalTime,
  ifinalMsg,
  mode,
  band,
  confirmed,
  isQSO,
  finalRSTrecv,
  finalDxcc
)
{
  let callsign = null;
  let wspr = mode == "WSPR" ? band : null;
  let hash = "";

  let finalMsg = ifinalMsg.trim();
  if (finalMsg.length > 40) finalMsg = finalMsg.substring(0, 40) + "...";

  if (finalDxcc < 1) finalDxcc = callsignToDxcc(finalDXcall);

  hash = finalDXcall + band + mode;

  if (hash in GT.liveCallsigns) callsign = GT.liveCallsigns[hash];

  if (wspr != null && validateMapBandAndMode(band, mode))
  {
    qthToBox(finalGrid, finalDXcall, false, false, finalDEcall, band, wspr, hash, false);
  }

  if (callsign == null)
  {
    // Pass finalDXcall to DEcall, and finalDEcall to DXcall (matching original parameter swap)
    let newCallsign = new LiveCallsign(finalDXcall, finalDEcall, finalGrid, mode, band, finalMsg, finalDxcc, finalTime);
    if (finalGrid.length > 0) newCallsign.gridQualified = true;
    newCallsign.wspr = wspr;

    if (finalDxcc > -1)
    {
      newCallsign.px = getWpx(finalDXcall);
      if (newCallsign.px)
      {
        newCallsign.zone = Number(newCallsign.px.charAt(newCallsign.px.length - 1));
      }

      newCallsign.cont = GT.dxccInfo[finalDxcc].continent;
      if (newCallsign.dxcc == 390 && newCallsign.zone == 1) { newCallsign.cont = "EU"; }
    }

    if (finalRSTsent != null) newCallsign.RSTsent = finalRSTsent;
    if (finalRSTrecv != null) newCallsign.RSTrecv = finalRSTrecv;

    if (isKnownCallsignUS(newCallsign.dxcc))
    {
      let fourGrid = finalGrid.substr(0, 4);
      if (fourGrid in GT.gridToState && GT.gridToState[fourGrid].length == 1)
      {
        newCallsign.state = GT.gridToState[fourGrid][0];
      }
    }

    if (GT.settings.callsignLookups.ulsUseEnable && isKnownCallsignUS(finalDxcc) && (newCallsign.state == null || newCallsign.cnty == null))
    {
      lookupKnownCallsign(newCallsign);
    }
    else if (newCallsign.state == null)
    {
      if (finalDxcc == 1 && GT.settings.callsignLookups.cacUseEnable && finalDXcall in GT.cacCallsigns)
      {
        newCallsign.state = "CA-" + GT.cacCallsigns[finalDXcall];
      }
    }
    GT.liveCallsigns[hash] = newCallsign;
    updateSessionCallsigns(newCallsign);
  }
  else
  {
    if (callsign.DXcall != "Self" && finalTime > callsign.time)
    {
      callsign.time = finalTime;
      callsign.age = finalTime;
      callsign.mode = mode;
      callsign.band = band;
      callsign.delta = -1;
      callsign.DXcall = finalDEcall;
      callsign.msg = finalMsg;
      callsign.dxcc = finalDxcc;
      callsign.wspr = wspr;
      if (finalGrid.length > callsign.grid.length) {
        callsign.grid = finalGrid;
        callsign.gridQualified = true;
      } else if (finalGrid.length == callsign.grid.length && finalGrid != callsign.grid) {
        callsign.grid = finalGrid;
        callsign.gridQualified = true;
      }
      // callsign.field = callsign.grid.substring(0, 2);
      if (finalRSTsent != null) callsign.RSTsent = finalRSTsent;
      if (finalRSTrecv != null) callsign.RSTrecv = finalRSTrecv;
      callsign.vucc_grids = [];
      callsign.propMode = "";
      callsign.digital = true;
      callsign.phone = false;
      callsign.IOTA = "";

      updateSessionCallsigns(callsign);
    }
  }
}

function compareCallsignTime(a, b)
{
  return a.time - b.time;
}

function updateLiveDistance(callsign)
{
  if (!callsign.grid) return;
  const LL = squareToCenter(callsign.grid);
  callsign.distance = MyCircle.distance(GT.myLat, GT.myLon, LL.a, LL.o);
  callsign.heading = MyCircle.bearing(GT.myLat, GT.myLon, LL.a, LL.o);
}

function liveHash(call, band, mode)
{
  return call + band + mode;
}

function updateSessionCallsigns(callObj)
{
  const key = callObj.DEcall;
  const record = GT.sessionCallsigns.get(key); 

  if (record !== undefined) {
    if (record.grid != callObj.grid) {
      record.grid = callObj.grid;
      record.cqz = callObj.cqz;
      record.ituz = callObj.ituz;
    }
    record.band = callObj.band;
    record.time = callObj.time;
    
  } else {
    GT.sessionCallsigns.set(key, new CallsignSession(callObj));

    const currentCount = GT.sessionDXCCs.get(callObj.dxcc);
    if (currentCount !== undefined) {
        GT.sessionDXCCs.set(callObj.dxcc, currentCount + 1);
    } else {
        GT.sessionDXCCs.set(callObj.dxcc, 1);
    }
  }
}
