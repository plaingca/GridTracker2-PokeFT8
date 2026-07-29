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

GT.ancPrefixes = ["R", "P", "M", "MM", "AM", "A", "NWS"];

function callsignToDxcc(insign)
{
  let callsign = insign;

  if (!/\d/.test(callsign) || !/[a-zA-Z]/.test(callsign))
  {
    return -1;
  }

  if (callsign in GT.directCallToDXCC) { return Number(GT.directCallToDXCC[callsign]); }

  if (callsign.includes("/"))
  {
    let parts = callsign.split("/");
    if (GT.ancPrefixes.includes(parts[parts.length - 1]))
    {
      if (parts[parts.length - 1] == "MM")  return 0;
      parts.pop();
    }

    callsign = parts[0];

    if (parts.length == 2)
    {
      if (parts[0] in GT.prefixToDXCC) return Number(GT.dxccInfo[GT.prefixToDXCC[parts[0]]].dxcc);
      if (parts[1] in GT.prefixToDXCC) return Number(GT.dxccInfo[GT.prefixToDXCC[parts[1]]].dxcc);

      if (parts[1].length < parts[0].length)
      {
        callsign = parts[1];
      }
    }

    if (callsign in GT.directCallToDXCC) { return Number(GT.directCallToDXCC[callsign]); }
  }

  for (let x = callsign.length; x > 0; x--)
  {
    if (callsign.substr(0, x) in GT.prefixToDXCC)
    {
      return Number(GT.dxccInfo[GT.prefixToDXCC[callsign.substr(0, x)]].dxcc);
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

function trackQSO(details, currentYear, currentDay, currentSecond) {
  // V8 OPTIMIZATION: Destructuring locals once avoids repeated object property lookups
  const { 
    DEcall, band, mode, time, digital, phone, grid4, 
    dxcc, px, cont, state, cnty, ituz, cqz, confirmed, pota 
  } = details;

  // V8 OPTIMIZATION: 'new Date(ms)' is native and much faster than creating a 1970 date and calling setSeconds
  const qsoDate = new Date(time * 1000);
  const isCurrentYear = (qsoDate.getUTCFullYear() === currentYear);
  
  // V8 MATH OPTIMIZATION: ~~ is a bitwise NOT-NOT, which does native C++ integer truncation. 
  // parseInt() forces V8 to convert the float to a string, then parse it back to an int!
  const isCurrentDay = (~~(time / 86400) === currentDay);

  // V8 CHARCODE OPTIMIZATION: charCodeAt bypasses string allocations 
  if (
    DEcall.length === 3 &&
    DEcall.charCodeAt(0) !== 65 && // 'A'
    DEcall.charCodeAt(2) !== 88 && // 'X'
    isKnownCallsignUS(dxcc) &&
    (currentSecond - time) > K_15_DAYS_IN_SECONDS
  ) {
    // Any 1x1 QSO in the US over 15 days is not considered worked for hunting purposes
    return;
  }

  // CACHE LOCAL REFERENCES: Prevents looking up 'GT -> tracker -> worked -> call' dozens of times
  const worked = GT.tracker.worked;
  
  // PRE-COMPUTE STRINGS: Prevent allocating the exact same strings multiple times
  const bandMode = band + mode;
  const bandDg = band + "dg";
  const bandPh = band + "ph";

  // --- WORKED LOGIC ---
  const wCall = worked.call;
  wCall[DEcall + bandMode] = true;
  wCall[DEcall] = true;
  wCall[DEcall + mode] = true;
  wCall[DEcall + band] = true;
  
  if (digital) {
    wCall[DEcall + "dg"] = true;
    wCall[DEcall + bandDg] = true;
  }

  if (grid4) {
    const wGrid = worked.grid;
    wGrid[grid4] = true;
    wGrid[grid4 + mode] = true;
    wGrid[grid4 + band] = true;
    wGrid[grid4 + bandMode] = true;

    if (digital) {
      wGrid[grid4 + "dg"] = true;
      wGrid[grid4 + bandDg] = true;
    }
  }

  if (ituz) {
    const wItuz = worked.ituz;
    const iBase = ituz + "|"; // Coerces natively, faster than String(ituz)
    wItuz[iBase + bandMode] = true;
    wItuz[iBase] = true;
    wItuz[iBase + mode] = true;
    wItuz[iBase + band] = true;
    if (digital) {
      wItuz[iBase + "dg"] = true;
      wItuz[iBase + bandDg] = true;
    }
  }

  if (cqz) {
    const wCqz = worked.cqz;
    const cBase = cqz + "|";
    wCqz[cBase + bandMode] = true;
    wCqz[cBase] = true;
    wCqz[cBase + mode] = true;
    wCqz[cBase + band] = true;
    if (digital) {
      wCqz[cBase + "dg"] = true;
      wCqz[cBase + bandDg] = true;
    }
    if (isCurrentYear) {
      worked.dxm[`${cqz}z${currentYear}`] = true;
    }
  }

  if (dxcc > 0) {
    const wDxcc = worked.dxcc;
    const dBase = dxcc + "|";
    wDxcc[dBase + bandMode] = true;
    wDxcc[dBase] = true;
    wDxcc[dBase + mode] = true;
    wDxcc[dBase + band] = true;
    if (digital) {
      wDxcc[dBase + "dg"] = true;
      wDxcc[dBase + bandDg] = true;
    }
    if (phone) {
      wDxcc[dBase + "ph"] = true;
      wDxcc[dBase + bandPh] = true;
    }
    if (isCurrentYear) {
      worked.dxm[`${dxcc}c${currentYear}`] = true;
    }
  }

  if (px) {
    const wPx = worked.px;
    wPx[px + bandMode] = true;
    wPx[px] = DEcall;
    wPx[px + mode] = true;
    wPx[px + band] = true;
    if (digital) {
      wPx[px + "dg"] = true;
      wPx[px + bandDg] = true;
    }
    if (phone) {
      wPx[px + "ph"] = true;
      wPx[px + bandPh] = true;
    }
  }

  if (cont) {
    const wCont = worked.cont;
    wCont[cont + bandMode] = true;
    wCont[cont] = true;
    wCont[cont + mode] = true;
    wCont[cont + band] = true;
    if (digital) {
      wCont[cont + "dg"] = true;
      wCont[cont + bandDg] = true;
    }
  }

  if (state) {
    const wState = worked.state;
    wState[state] = true;
    wState[state + mode] = true;
    wState[state + band] = true;
    wState[state + bandMode] = true;
    if (digital) {
      wState[state + "dg"] = true;
      wState[state + bandDg] = true;
    }
  }

  if (cnty) {
    const wCnty = worked.cnty;
    wCnty[cnty] = true;
    wCnty[cnty + mode] = true;
    wCnty[cnty + band] = true;
    wCnty[cnty + bandMode] = true;
    if (digital) {
      wCnty[cnty + "dg"] = true;
      wCnty[cnty + bandDg] = true;
    }
  }

  if (pota) {
    const wPota = worked.pota;
    const sDay = "" + currentDay;
    const potasList = pota.split(",");
    const len = potasList.length;
    
    // V8 OPTIMIZATION: 'for...in' loops check prototypes and are terrible for arrays. 
    for (let i = 0; i < len; i++) {
      const p = potasList[i].trim();
      if (isCurrentDay) {
        wPota[`${sDay}.${DEcall}.${p}.${bandMode}`] = true;
        wPota[`${sDay}.${p}.${bandMode}`] = true;
      }
      wPota[p] = true;
    }
  }

  // --- CONFIRMED LOGIC ---
  if (confirmed) {
    const trackerConfirmed = GT.tracker.confirmed;

    const cCall = trackerConfirmed.call;
    cCall[DEcall + bandMode] = true;
    cCall[DEcall] = true;
    cCall[DEcall + mode] = true;
    cCall[DEcall + band] = true;
    if (digital) {
      cCall[DEcall + "dg"] = true;
      cCall[DEcall + bandDg] = true;
    }

    if (grid4) {
      const cGrid = trackerConfirmed.grid;
      cGrid[grid4 + bandMode] = true;
      cGrid[grid4] = true;
      cGrid[grid4 + mode] = true;
      cGrid[grid4 + band] = true;
      if (digital) {
        cGrid[grid4 + "dg"] = true;
        cGrid[grid4 + bandDg] = true;
      }
    }

    if (ituz) {
      const cItuz = trackerConfirmed.ituz;
      const iBase = ituz + "|";
      cItuz[iBase + bandMode] = true;
      cItuz[iBase] = true;
      cItuz[iBase + mode] = true;
      cItuz[iBase + band] = true;
      if (digital) {
        cItuz[iBase + "dg"] = true;
        cItuz[iBase + bandDg] = true;
      }
    }

    if (cqz) {
      const cCqz = trackerConfirmed.cqz;
      const cBase = cqz + "|";
      cCqz[cBase + bandMode] = true;
      cCqz[cBase] = true;
      cCqz[cBase + mode] = true;
      cCqz[cBase + band] = true;
      if (digital) {
        cCqz[cBase + "dg"] = true;
        cCqz[cBase + bandDg] = true;
      }
    }

    if (dxcc > 0) {
      const cDxcc = trackerConfirmed.dxcc;
      const dBase = dxcc + "|";
      cDxcc[dBase + bandMode] = true;
      cDxcc[dBase] = true;
      cDxcc[dBase + mode] = true;
      cDxcc[dBase + band] = true;
      if (digital) {
        cDxcc[dBase + "dg"] = true;
        cDxcc[dBase + bandDg] = true;
      }
      if (phone) {
        cDxcc[dBase + "ph"] = true;
        cDxcc[dBase + bandPh] = true;
      }
    }

    if (state) {
      const cState = trackerConfirmed.state;
      cState[state] = true;
      cState[state + mode] = true;
      cState[state + band] = true;
      cState[state + bandMode] = true;
      if (digital) {
        cState[state + "dg"] = true;
        cState[state + bandDg] = true;
      }
    }

    if (cnty) {
      const cCnty = trackerConfirmed.cnty;
      cCnty[cnty] = true;
      cCnty[cnty + mode] = true;
      cCnty[cnty + band] = true;
      cCnty[cnty + bandMode] = true;
      if (digital) {
        cCnty[cnty + "dg"] = true;
        cCnty[cnty + bandDg] = true;
      }
    }

    if (px) {
      const cPx = trackerConfirmed.px;
      cPx[px + bandMode] = true;
      cPx[px] = DEcall;
      cPx[px + mode] = true;
      cPx[px + band] = true;
      if (digital) {
        cPx[px + "dg"] = true;
        cPx[px + bandDg] = true;
      }
      if (phone) {
        cPx[px + "ph"] = true;
        cPx[px + bandPh] = true;
      }
    }

    if (cont) {
      const cCont = trackerConfirmed.cont;
      cCont[cont + bandMode] = true;
      cCont[cont] = true;
      cCont[cont + mode] = true;
      cCont[cont + band] = true;
      if (digital) {
        cCont[cont + "dg"] = true;
        cCont[cont + bandDg] = true;
      }
    }
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