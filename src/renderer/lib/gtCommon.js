// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.
// gtCommon.js is common functions used by gt.js , adifWorker.js, trackerWorker.js and others
// var GT must be initiliazed before loading this script.

GT.callsignDatabaseDXCC = {
  291: true,
  1: true,
  6: true,
  110: true
};

GT.callsignDatabaseUS = {
  291: true,
  6: true,
  110: true
};

GT.callsignDatabaseUSplus = {
  291: true,
  6: true,
  110: true,
  202: true
};

GT.acLogBandMap = {
  "2200": "2200m",
  "2190": "2190m",
  "630":  "630m",
  "560":  "560m",
  "160":  "160m",
  "80":   "80m",
  "60":   "60m",
  "40":   "40m",
  "30":   "30m",
  "20":   "20m",
  "17":   "17m",
  "15":   "15m",
  "12":   "12m",
  "10":   "10m",
  "8":    "8m",
  "6":    "6m",
  "4":    "4m",
  "2":    "2m",
  "1.25": "1.25m",
  "70":   "70cm",
  "33":   "33cm",
  "23":   "23cm",
  "13":   "13cm",
  "9":    "9cm",
  "3":    "3cm",
  "1.25cm": "1.2cm"
};

const K_GRID_REGEX = /^[A-R]{2}[0-9]{2}([A-X]{2})?$/i;

function validateGridFromString(inputText) {
  if (!inputText) return false;
  // Matches exactly 2 letters (A-R), 2 numbers, and optionally 2 sub-letters (A-X)
  return K_GRID_REGEX.test(inputText);
}

function isKnownCallsignDXCC(dxcc)
{
  return (dxcc in GT.callsignDatabaseDXCC);
}

function isKnownCallsignUS(dxcc)
{
  return (dxcc in GT.callsignDatabaseUS);
}

function isKnownCallsignUSplus(dxcc)
{
  return (dxcc in GT.callsignDatabaseUSplus);
}

function cqZoneFromCallsign(insign, dxcc)
{
  var callsign = insign;

  if (!/\d/.test(callsign) || !/[a-zA-Z]/.test(callsign))
  {
    return null;
  }

  if (callsign in GT.directCallToCQzone) { return GT.directCallToCQzone[callsign]; }

  for (var x = callsign.length; x > 0; x--)
  {
    if (callsign.substr(0, x) in GT.prefixToCQzone)
    {
      return GT.prefixToCQzone[callsign.substr(0, x)];
    }
  }

  if (dxcc > 0)
  {
    return GT.dxccInfo[dxcc].cqzone;
  }

  return null;
}

function ituZoneFromCallsign(insign, dxcc)
{
  var callsign = insign;

  if (!/\d/.test(callsign) || !/[a-zA-Z]/.test(callsign))
  {
    return null;
  }

  if (callsign in GT.directCallToITUzone) { return GT.directCallToITUzone[callsign]; }

  for (var x = callsign.length; x > 0; x--)
  {
    if (callsign.substr(0, x) in GT.prefixToITUzone)
    {
      return GT.prefixToITUzone[callsign.substr(0, x)];
    }
  }

  if (dxcc > 0)
  {
    return GT.dxccInfo[dxcc].ituzone;
  }

  return null;
}

function getWpx(callsign)
{
  let prefix = null;

  if (callsign.includes("/"))
  // Handle in the future?
  { return null; }
  if (!/\d/.test(callsign))
  // Insert 0, never seen this
  { return null; }

  let end = callsign.length;
  let foundPrefix = false;
  let prefixEnd = 1;
  while (prefixEnd != end)
  {
    if (/\d/.test(callsign.charAt(prefixEnd)))
    {
      while (prefixEnd + 1 != end && /\d/.test(callsign.charAt(prefixEnd + 1))) { prefixEnd++; }
      foundPrefix = true;
      break;
    }
    prefixEnd++;
  }

  if (foundPrefix) prefix = callsign.substr(0, prefixEnd + 1);

  return String(prefix);
}

const OPERATIONAL_MODIFIERS = new Set([
  "P",     // Portable
  "M",     // Mobile
  "MM",    // Maritime Mobile
  "AM",    // Aeronautical Mobile
  "QRP",   // Low Power
  "QRO",   // High Power
  "R",     // Rover
  "ROV",   // Rover
  "B",     // Beacon
  "J",     // JOTA (Jamboree on the Air)
  "T",     // Testing
  "AE",    // Amateur Extra upgrade indicator (US)
  "AG",    // General upgrade indicator (US)
  "KT",    // Technician upgrade indicator (US)
  "LH",    // Lighthouse
  "FF",    // Flora & Fauna
  "WFF",   // World Flora & Fauna
  "SOTA",  // Summits on the Air
  "POTA",  // Parks on the Air
  "IOTA",  // Islands on the Air
  "LOTA",  // Lighthouses on the Air
  "SWL"    // Shortwave Listener
]);

function callsignToDxcc(callsign) {
  // 1. Raw string exact match (e.g., explicitly mapped VP2V/W1AW)
  if (GT.directCallToDXCC[callsign]) return GT.directCallToDXCC[callsign];

  // 2. Strip SSID (CPU-fast string slicing)
  let call = callsign;
  const dashIndex = callsign.lastIndexOf('-');
  if (dashIndex > -1) call = callsign.substring(0, dashIndex);

  if (call.indexOf('/') === -1) {
    if (GT.directCallToDXCC[call]) return GT.directCallToDXCC[call];
    return lookupPrefix(call);
  }

  const parts = call.split('/');
  
  if (parts.includes('MM') || parts.includes('AM')) return 0; // Maritime and Air Mobile strictly 0 (none)

  let possibleBaseCalls = [];
  let prefixOverride = null;
  let zoneOverride = null;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    
    if (OPERATIONAL_MODIFIERS.has(part)) continue; // Ignore /QRP, /M, etc.
    
    if (part.length === 1 && part >= '0' && part <= '9') {
      zoneOverride = part; // Single digit zone modifier (e.g., /1)
      continue;
    }

    // POSITION SENSITIVITY: Regional Indicators (e.g., LU1ABC/F)
    // If a single letter is at the very END of the callsign, it is an internal 
    // regional/province indicator, NOT a geographic DXCC override.
    if (part.length === 1 && part >= 'A' && part <= 'Z' && i === parts.length - 1) {
      continue; 
    }

    possibleBaseCalls.push(part);
  }

  let baseCall = possibleBaseCalls[0] || parts[0];
  if (possibleBaseCalls.length > 1) {
    for (let i = 1; i < possibleBaseCalls.length; i++) {
      const p = possibleBaseCalls[i];
      if (p.length > baseCall.length) {
        baseCall = p;
      } else if (p.length === baseCall.length) {
        // TIE-BREAKER for KH0/K0H (both length 3)
        // If the current candidate is a known explicit prefix block but the new one isn't,
        // the new one is the base call (K0H) and the other is the geographic override (KH0).
        if (GT.prefixToDXCC[baseCall] && !GT.prefixToDXCC[p]) {
          baseCall = p;
        }
      }
    }
  }

  // Identify Geographic Override
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part !== baseCall && 
        !OPERATIONAL_MODIFIERS.has(part) && 
        !(part.length === 1 && part >= '0' && part <= '9') &&
        !(part.length === 1 && part >= 'A' && part <= 'Z' && i === parts.length - 1)) {
      prefixOverride = part;
      break;
    }
  }

  let basePrefix = baseCall;
  for (let i = baseCall.length - 1; i >= 0; i--) {
    if (baseCall[i] >= '0' && baseCall[i] <= '9') {
      basePrefix = baseCall.substring(0, i + 1);
      break;
    }
  }

  let activePrefix = prefixOverride ? prefixOverride : basePrefix;

  if (zoneOverride) {
    const lastCharCode = activePrefix.charCodeAt(activePrefix.length - 1);
    // 48 is '0', 57 is '9' in ASCII
    if (lastCharCode >= 48 && lastCharCode <= 57) {
      activePrefix = activePrefix.substring(0, activePrefix.length - 1) + zoneOverride;
    } else {
      activePrefix += zoneOverride;
    }
  }

  if (!prefixOverride && !zoneOverride) {
    if (GT.directCallToDXCC[baseCall]) return GT.directCallToDXCC[baseCall];
  }

  return lookupPrefix(activePrefix);
}

function lookupPrefix(prefixStr) {
  let len = prefixStr.length;
  for (let x = len; x > 0; x--) {
    let sub = prefixStr.substring(0, x);
    let dxccNum = GT.prefixToDXCC[sub];
    if (dxccNum) {
      // We assume "KG4 2x2 is (KG4) else (K)""
      if (dxccNum === 105 ) return (len === 5) ? 105 : 291;
      return dxccNum;
    }
  }
  return -1;
}

function timeNowSec()
{
  return Math.trunc(Date.now() / 1000);
}

const K_15_DAYS_IN_SECONDS = 1296000;

function initQSOdata() {
  // V8 OPTIMIZATION: Initializing the entire object structure literally 
  // establishes the Hidden Classes immediately, preventing V8 from having 
  // to recompile the object shape 24 separate times.
  GT.tracker = {
    worked: {
      call: {}, grid: {}, dxcc: {}, cqz: {}, dxm: {},
      ituz: {}, state: {}, px: {}, cnty: {}, cont: {}, pota: {}
    },
    confirmed: {
      call: {}, grid: {}, dxcc: {}, cqz: {}, dxm: {},
      ituz: {}, state: {}, px: {}, cnty: {}, cont: {}, pota: {}
    }
  };
}


function mark(obj, baseKey, baseVal, includePhone, details, bandMode, bandDg, bandPh) {
  obj[baseKey] = baseVal;
  obj[baseKey + details.mode] = true;
  obj[baseKey + details.band] = true;
  obj[baseKey + bandMode] = true;

  if (details.digital) {
    obj[baseKey + "dg"] = true;
    obj[baseKey + bandDg] = true;
  }
  
  if (includePhone && details.phone) {
    obj[baseKey + "ph"] = true;
    obj[baseKey + bandPh] = true;
  }
}


function applyTracking(tracker, isWorked, details, isCurrentYear, currentYear, workedDxm, bandMode, bandDg, bandPh) {
  const { DEcall, grid4, vucc_grids, ituz, cqz, dxcc, px, cont, state, cnty } = details;

  if (DEcall) mark(tracker.call, DEcall, true, false, details, bandMode, bandDg, bandPh);
  if (grid4) mark(tracker.grid, grid4, true, false, details, bandMode, bandDg, bandPh);

  for (let i = 0, len = vucc_grids.length; i < len; i++) {
    mark(tracker.grid, vucc_grids[i].substring(0, 4), true, false, details, bandMode, bandDg, bandPh);
  }

  if (ituz) mark(tracker.ituz, ituz + "|", true, false, details, bandMode, bandDg, bandPh);
  
  if (cqz) {
    mark(tracker.cqz, cqz + "|", true, false, details, bandMode, bandDg, bandPh);
    if (isWorked && isCurrentYear) workedDxm[cqz + "z" + currentYear] = true; 
  }

  if (dxcc > 0) {
    mark(tracker.dxcc, dxcc + "|", true, true, details, bandMode, bandDg, bandPh);
    if (isWorked && isCurrentYear) workedDxm[dxcc + "c" + currentYear] = true;
  }

  if (px) mark(tracker.px, px, DEcall, true, details, bandMode, bandDg, bandPh); 
  if (cont) mark(tracker.cont, cont, true, false, details, bandMode, bandDg, bandPh);
  if (state) mark(tracker.state, state, true, false, details, bandMode, bandDg, bandPh);
  if (cnty) mark(tracker.cnty, cnty, true, false, details, bandMode, bandDg, bandPh);
}

function trackQSO(details, currentYear, currentDay, currentSecond) {
  const { DEcall, time, dxcc, pota, confirmed, band, mode } = details;

  const qsoDate = new Date(time * 1000);
  const isCurrentYear = (qsoDate.getUTCFullYear() === currentYear);
  const isCurrentDay = (~~(time / 86400) === currentDay);

  if (
    DEcall.length === 3 &&
    DEcall.charCodeAt(0) !== 65 &&
    DEcall.charCodeAt(2) !== 88 &&
    isKnownCallsignUS(dxcc) &&
    (currentSecond - time) > K_15_DAYS_IN_SECONDS
  ) {
    return;
  }

  const bandMode = band + mode;
  const bandDg = band + "dg";
  const bandPh = band + "ph";
  
  const worked = GT.tracker.worked;

  // Process WORKED
  applyTracking(worked, true, details, isCurrentYear, currentYear, worked.dxm, bandMode, bandDg, bandPh);

  // Process POTA (Worked Only)
  if (pota) {
    const wPota = worked.pota;
    const sDay = "" + currentDay;
    const potasList = pota.split(",");
    
    for (let i = 0, len = potasList.length; i < len; i++) {
      const p = potasList[i].trim();
      if (isCurrentDay) {
        wPota[sDay + "." + DEcall + "." + p + "." + bandMode] = true;
        wPota[sDay + "." + p + "." + bandMode] = true;
      }
      wPota[p] = true;
    }
  }

  // Process CONFIRMED
  if (confirmed) {
    applyTracking(GT.tracker.confirmed, false, details, isCurrentYear, currentYear, null, bandMode, bandDg, bandPh);
  }
}


/* eslint-disable */

function bitwise(str){
	var hash = 0;
	if (str.length == 0) return hash;
	for (var i = 0; i < str.length; i++) {
		var ch = str.charCodeAt(i);
		hash = ((hash<<5)-hash) + ch;
		hash = hash & hash; // Convert to 32bit integer
	}
	return hash;
}

// convert 10 binary to customized binary, max is 62
function binaryTransfer(integer, binary) {
	binary = binary || 62;
	var stack = [];
	var num;
	var result = '';
	var sign = integer < 0 ? 'Z' : '';

	function table (num) {
		var t = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
		return t[num];
	}

	integer = Math.abs(integer);

	while (integer >= binary) {
		num = integer % binary;
		integer = Math.floor(integer / binary);
		stack.push(table(num));
	}

	if (integer > 0) {
		stack.push(table(integer));
	}

	for (var i = stack.length - 1; i >= 0; i--) {
		result += stack[i];
	}

	return sign + result;
}
/**
 * why choose 61 binary, because we need the last element char to replace the minus sign
 * eg: -aGtzd will be ZaGtzd
 */
function unique (text) {
	return binaryTransfer(bitwise(text), 62);
}


function isMergeableObject(val) {
  var nonNullObject = val && typeof val == 'object'

  return nonNullObject
      && Object.prototype.toString.call(val) !== '[object RegExp]'
      && Object.prototype.toString.call(val) !== '[object Date]'
}

function emptyTarget(val) {
  return Array.isArray(val) ? [] : {}
}

function cloneIfNecessary(value, optionsArgument) {
  var clone = optionsArgument && optionsArgument.clone == true
  return (clone && isMergeableObject(value)) ? deepmerge(emptyTarget(value), value, optionsArgument) : value
}

function defaultArrayMerge(target, source, optionsArgument) {
  var destination = target.slice()
  source.forEach(function(e, i) {
      if (typeof destination[i] == 'undefined') {
          destination[i] = cloneIfNecessary(e, optionsArgument)
      } else if (isMergeableObject(e)) {
          destination[i] = deepmerge(target[i], e, optionsArgument)
      } else if (target.indexOf(e) == -1) {
          destination.push(cloneIfNecessary(e, optionsArgument))
      }
  })
  return destination
}

function mergeObject(target, source, optionsArgument) {
  var destination = {}
  if (isMergeableObject(target)) {
      Object.keys(target).forEach(function (key) {
          destination[key] = cloneIfNecessary(target[key], optionsArgument)
      })
  }
  Object.keys(source).forEach(function (key) {
      if (!isMergeableObject(source[key]) || !target[key]) {
          destination[key] = cloneIfNecessary(source[key], optionsArgument)
      } else {
          destination[key] = deepmerge(target[key], source[key], optionsArgument)
      }
  })
  return destination
}

function deepmerge(target, source, optionsArgument) {
  var array = Array.isArray(source);
  var options = optionsArgument || { arrayMerge: defaultArrayMerge }
  var arrayMerge = options.arrayMerge || defaultArrayMerge

  if (array) {
      return Array.isArray(target) ? arrayMerge(target, source, optionsArgument) : cloneIfNecessary(source, optionsArgument)
  } else {
      return mergeObject(target, source, optionsArgument)
  }
}

deepmerge.all = function deepmergeAll(array, optionsArgument) {
  if (!Array.isArray(array) || array.length < 2) {
      throw new Error('first argument should be an array with at least two elements')
  }

  // we are sure there are at least 2 values, so it is safe to have no initial value
  return array.reduce(function(prev, next) {
      return deepmerge(prev, next, optionsArgument)
  })
}

function parseAcLogXML(line)
{
  let record = {};
  line = line.substring(5); // skip <CMD>
  while (line.length > 0)
  {
    while (line.charAt(0) != "<" && line.length > 0)
    {
      line = line.substring(1);
    }
    if (line.length > 0)
    {
      line = line.substring(1);
      let nextChev = line.indexOf(">");
      if (nextChev > -1)
      {
        let fieldName = line.substring(0, nextChev).toUpperCase();
        let endField = "</" + fieldName + ">";
        line = line.substring(fieldName.length + 1);
        let end = line.indexOf(endField);
        if (end > -1)
        {
          let  fieldValue = line.substring(0, end);
          line = line.substring(end + endField.length);
          record[fieldName] = fieldValue;
        }
        else
        {
          record.type = fieldName;
        }
      }
    }
  }

  return record;
}