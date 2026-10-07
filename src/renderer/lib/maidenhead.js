// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Maidenhead grid math: lat/lon to grid, grid bounds and centres (moved from GridTracker2.js)

// Pre-computed constants
const K_LO_STEP_6 = 5 / 60;

const K_LA_STEP_6 = 2.5 / 60;

function maidenheadFieldToBounds(qth) {
  const lo1 = ((qth.charCodeAt(0) & 0xDF) - 65) * 20 - 180;
  const la1 = ((qth.charCodeAt(1) & 0xDF) - 65) * 10 - 90;

  return {
    la1,
    lo1,
    la2: la1 + 10,
    lo2: lo1 + 20
  };
}

function squareToCenter(qth) {
  const LL = maidenheadToBounds(qth, true);
  return {
    a: (LL.la1 + LL.la2) * 0.5,
    o: (LL.lo1 + LL.lo2) * 0.5
  };
}

function latLonToGridSquare(lat, lon, width = 4) {
  if (!(lat > -90 && lat < 90 && lon >= -180 && lon <= 180)) {
    return "";
  }
  
  const adjLat = lat + 90;
  const adjLon = lon + 180;
  const gLon = (adjLon / 20) | 0;
  const gLat = (adjLat / 10) | 0;
  const remLon = adjLon % 20;
  const remLat = adjLat % 10;
  const nLon = (remLon / 2) | 0;
  const nLat = remLat | 0;
  if (width === 4) {
      return String.fromCharCode(
      65 + gLon,    // 1st char (Field)
      65 + gLat,    // 2nd char (Field)
      48 + nLon,    // 3rd char (Square)
      48 + nLat,    // 4th char (Square)
    );
  }

  const subLon = ((remLon % 2) * 12) | 0;
  const subLat = ((remLat % 1) * 24) | 0;
  return String.fromCharCode(
    65 + gLon,    // 1st char (Field)
    65 + gLat,    // 2nd char (Field)
    48 + nLon,    // 3rd char (Square)
    48 + nLat,    // 4th char (Square)
    65 + subLon,  // 5th char (Subsquare)
    65 + subLat   // 6th char (Subsquare )
  );
}

function maidenheadToBounds(qth, allChars) {
  const c0 = (qth.charCodeAt(0) & 0xDF) - 65;
  const c1 = (qth.charCodeAt(1) & 0xDF) - 65;
  const c2 =  qth.charCodeAt(2) - 48;
  const c3 =  qth.charCodeAt(3) - 48;

  const lo1 = c0 * 20 + c2 * 2 - 180;
  const la1 = c1 * 10 + c3 - 90;

  if (qth.length === 6 && (allChars || (GT.pushPinMode && GT.settings.app.sixWideMode))) {
    const c4 = (qth.charCodeAt(4) & 0xDF) - 65;
    const c5 = (qth.charCodeAt(5) & 0xDF) - 65;
    const lo  = lo1 + c4 * K_LO_STEP_6;
    const la  = la1 + c5 * K_LA_STEP_6;
    return { lo1: lo, la1: la, lo2: lo + K_LO_STEP_6, la2: la + K_LA_STEP_6, size: 6 };
  }

  return { lo1, la1, lo2: lo1 + 2, la2: la1 + 1, size: 4 };
}
