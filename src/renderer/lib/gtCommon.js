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

function validateGridFromString(inputText)
{
  var validGrid = false;
  if (inputText && (inputText.length == 4 || inputText.length == 6))
  {
    var LETTERS = inputText.substr(0, 2);
    var NUMBERS = inputText.substr(2, 2);
    if (/^[A-R]+$/.test(LETTERS) && /^[0-9]+$/.test(NUMBERS))
    {
      validGrid = true;
    }
    if (validGrid && inputText.length == 6)
    {
      var LETTERS_SUB = inputText.substr(4, 2);
      if (!(/^[A-Xa-x]+$/.test(LETTERS_SUB)))
      {
        validGrid = false;
      }
    }
  }

  return validGrid;
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

GT.ancPrefixes = ["P", "M", "MM", "AM", "A", "NWS"];

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
  return parseInt(Date.now() / 1000);
}

function initQSOdata()
{
  GT.tracker = {};
  GT.tracker.worked = {};
  GT.tracker.confirmed = {};

  GT.tracker.worked.call = {};
  GT.tracker.worked.grid = {};
  // GT.tracker.worked.field = {};
  GT.tracker.worked.dxcc = {};
  GT.tracker.worked.cqz = {};
  GT.tracker.worked.dxm = {};
  GT.tracker.worked.ituz = {};
  GT.tracker.worked.state = {};
  GT.tracker.worked.px = {};
  GT.tracker.worked.cnty = {};
  GT.tracker.worked.cont = {};
  GT.tracker.worked.pota = {};

  GT.tracker.confirmed.call = {};
  GT.tracker.confirmed.grid = {};
  // GT.tracker.confirmed.field = {};
  GT.tracker.confirmed.dxcc = {};
  GT.tracker.confirmed.cqz = {};
  GT.tracker.confirmed.dxm = {};
  GT.tracker.confirmed.ituz = {};
  GT.tracker.confirmed.state = {};
  GT.tracker.confirmed.px = {};
  GT.tracker.confirmed.cnty = {};
  GT.tracker.confirmed.cont = {};
  GT.tracker.confirmed.pota = {};
}

const K_15_DAYS_IN_SECONDS = 1296000;

function trackQSO(details, currentYear, currentDay, currentSecond)
{
  let qsoDate = new Date(1970, 0, 1); qsoDate.setSeconds(details.time);
  let isCurrentYear = (qsoDate.getUTCFullYear() == currentYear);
  let isCurrentDay = (parseInt(details.time / 86400) == currentDay);
  let fourGrid = details.grid.substring(0, 4);
  let isDigi = details.digital;
  let isPhone = details.phone;

  if (details.DEcall.length == 3 && details.DEcall.charAt(0) != 'A' && details.DEcall.charAt(2) != 'X' && isKnownCallsignUS(details.dxcc) && currentSecond - details.time > K_15_DAYS_IN_SECONDS)
  {
    // Any 1x1 QSO in the US over 15 days is not considered worked for hunting purposes
    return;
  }

  GT.tracker.worked.call[details.DEcall + details.band + details.mode] = true;
  GT.tracker.worked.call[details.DEcall] = true;
  GT.tracker.worked.call[details.DEcall + details.mode] = true;
  GT.tracker.worked.call[details.DEcall + details.band] = true;

  if (isDigi == true)
  {
    GT.tracker.worked.call[details.DEcall + "dg"] = true;
    GT.tracker.worked.call[details.DEcall + details.band + "dg"] = true;
  }

  if (fourGrid != "")
  {
    GT.tracker.worked.grid[fourGrid] = true;
    GT.tracker.worked.grid[fourGrid + details.mode] = true;
    GT.tracker.worked.grid[fourGrid + details.band] = true;
    GT.tracker.worked.grid[fourGrid + details.band + details.mode] = true;

    /* let field = fourGrid.substring(0, 2);

    GT.tracker.worked.field[field] = true;
    GT.tracker.worked.field[field + details.mode] = true;
    GT.tracker.worked.field[field + details.band] = true;
    GT.tracker.worked.field[field + details.band + details.mode] = true; */

    if (isDigi == true)
    {
      GT.tracker.worked.grid[fourGrid + "dg"] = true;
      GT.tracker.worked.grid[fourGrid + details.band + "dg"] = true;

      /* GT.tracker.worked.field[field + "dg"] = true;
      GT.tracker.worked.field[field + details.band + "dg"] = true; */
    }
  }

  if (details.ituz)
  {
    GT.tracker.worked.ituz[details.ituz + "|" + details.band + details.mode] = true;
    GT.tracker.worked.ituz[details.ituz + "|"] = true;
    GT.tracker.worked.ituz[details.ituz + "|" + details.mode] = true;
    GT.tracker.worked.ituz[details.ituz + "|" + details.band] = true;
    if (isDigi == true)
    {
      GT.tracker.worked.ituz[details.ituz + "|dg"] = true;
      GT.tracker.worked.ituz[details.ituz + "|" + details.band + "dg"] = true;
    }
  }

  if (details.cqz)
  {
    GT.tracker.worked.cqz[details.cqz + "|" + details.band + details.mode] = true;
    GT.tracker.worked.cqz[details.cqz + "|"] = true;
    GT.tracker.worked.cqz[details.cqz + "|" + details.mode] = true;
    GT.tracker.worked.cqz[details.cqz + "|" + details.band] = true;
    if (isDigi == true)
    {
      GT.tracker.worked.cqz[details.cqz + "|dg"] = true;
      GT.tracker.worked.cqz[details.cqz + "|" + details.band + "dg"] = true;
    }
    if (isCurrentYear)
    {
      GT.tracker.worked.dxm[`${details.cqz}z${currentYear}`] = true;
    }
  }

  if (details.dxcc > 0)
  {
    var sDXCC = String(details.dxcc);
    GT.tracker.worked.dxcc[sDXCC + "|" + details.band + details.mode] = true;
    GT.tracker.worked.dxcc[sDXCC + "|"] = true;
    GT.tracker.worked.dxcc[sDXCC + "|" + details.mode] = true;
    GT.tracker.worked.dxcc[sDXCC + "|" + details.band] = true;
    if (isDigi == true)
    {
      GT.tracker.worked.dxcc[sDXCC + "|dg"] = true;
      GT.tracker.worked.dxcc[sDXCC + "|" + details.band + "dg"] = true;
    }
    if (isPhone == true)
    {
      GT.tracker.worked.dxcc[sDXCC + "|ph"] = true;
      GT.tracker.worked.dxcc[sDXCC + "|" + details.band + "ph"] = true;
    }
    if (isCurrentYear)
    {
      GT.tracker.worked.dxm[`${sDXCC}c${currentYear}`] = true;
    }
  }

  if (details.px)
  {
    GT.tracker.worked.px[details.px + details.band + details.mode] = true;
    // store the last one
    GT.tracker.worked.px[details.px] = details.hash;
    GT.tracker.worked.px[details.px + details.mode] = true;
    GT.tracker.worked.px[details.px + details.band] = true;
    if (isDigi == true)
    {
      GT.tracker.worked.px[details.px + "dg"] = true;
      GT.tracker.worked.px[details.px + details.band + "dg"] = true;
    }
    if (isPhone == true)
    {
      GT.tracker.worked.px[details.px + "ph"] = true;
      GT.tracker.worked.px[details.px + details.band + "ph"] = true;
    }
  }

  if (details.cont)
  {
    GT.tracker.worked.cont[details.cont + details.band + details.mode] = true;
    // store the last one
    GT.tracker.worked.cont[details.cont] = details.hash;
    GT.tracker.worked.cont[details.cont + details.mode] = true;
    GT.tracker.worked.cont[details.cont + details.band] = true;
    if (isDigi == true)
    {
      GT.tracker.worked.cont[details.cont + "dg"] = true;
      GT.tracker.worked.cont[details.cont + details.band + "dg"] = true;
    }
  }

  if (details.state)
  {
    GT.tracker.worked.state[details.state] = true;
    GT.tracker.worked.state[details.state + details.mode] = true;
    GT.tracker.worked.state[details.state + details.band] = true;
    GT.tracker.worked.state[details.state + details.band + details.mode] = true;

    if (isDigi)
    {
      GT.tracker.worked.state[details.state + "dg"] =
      GT.tracker.worked.state[details.state + details.band + "dg"] = true;
    }
  }

  if (details.cnty)
  {
    GT.tracker.worked.cnty[details.cnty] = true;
    GT.tracker.worked.cnty[details.cnty + details.mode] = true;
    GT.tracker.worked.cnty[details.cnty + details.band] = true;
    GT.tracker.worked.cnty[details.cnty + details.band + details.mode] = true;

    if (isDigi)
    {
      GT.tracker.worked.cnty[details.cnty + "dg"] = true;
      GT.tracker.worked.cnty[details.cnty + details.band + "dg"] = true;
    }
  }

  if (details.pota)
  {
    let day = String(currentDay);
    let potas = details.pota.split(",");
    for (let x in potas)
    {
      let pota = potas[x].trim();

      if (isCurrentDay)
      {
        GT.tracker.worked.pota[day + "." + details.DEcall + "." + pota + "." + details.band + details.mode] = true;
        GT.tracker.worked.pota[day + "." + pota + "." + details.band + details.mode] = true;
      }
      GT.tracker.worked.pota[pota] = true;
    }
  }

  if (details.confirmed == true)
  {
    GT.tracker.confirmed.call[details.DEcall + details.band + details.mode] = true;
    GT.tracker.confirmed.call[details.DEcall] = true;
    GT.tracker.confirmed.call[details.DEcall + details.mode] = true;
    GT.tracker.confirmed.call[details.DEcall + details.band] = true;
    if (isDigi == true)
    {
      GT.tracker.confirmed.call[details.DEcall + "dg"] = true;
      GT.tracker.confirmed.call[details.DEcall + details.band + "dg"] = true;
    }

    if (fourGrid != "")
    {
      GT.tracker.confirmed.grid[fourGrid + details.band + details.mode] = true;
      GT.tracker.confirmed.grid[fourGrid] = true;
      GT.tracker.confirmed.grid[fourGrid + details.mode] = true;
      GT.tracker.confirmed.grid[fourGrid + details.band] = true;
      if (isDigi == true)
      {
        GT.tracker.confirmed.grid[fourGrid + "dg"] = true;
        GT.tracker.confirmed.grid[fourGrid + details.band + "dg"] = true;
      }
    }
    if (details.ituz && details.ituz.length > 0)
    {
      GT.tracker.confirmed.ituz[details.ituz + "|" + details.band + details.mode] = true;
      GT.tracker.confirmed.ituz[details.ituz + "|"] = true;
      GT.tracker.confirmed.ituz[details.ituz + "|" + details.mode] = true;
      GT.tracker.confirmed.ituz[details.ituz + "|" + details.band] = true;
      if (isDigi == true)
      {
        GT.tracker.confirmed.ituz[details.ituz + "|dg"] = true;
        GT.tracker.confirmed.ituz[details.ituz + "|" + details.band + "dg"] = true;
      }
    }
    if (details.cqz && details.cqz.length > 0)
    {
      GT.tracker.confirmed.cqz[details.cqz + "|" + details.band + details.mode] = true;
      GT.tracker.confirmed.cqz[details.cqz + "|"] = true;
      GT.tracker.confirmed.cqz[details.cqz + "|" + details.mode] = true;
      GT.tracker.confirmed.cqz[details.cqz + "|" + details.band] = true;
      if (isDigi == true)
      {
        GT.tracker.confirmed.cqz[details.cqz + "|dg"] = true;
        GT.tracker.confirmed.cqz[details.cqz + "|" + details.band + "dg"] = true;
      }
    }

    if (details.dxcc > 0)
    {
      var sDXCC = String(details.dxcc);
      GT.tracker.confirmed.dxcc[sDXCC + "|" + details.band + details.mode] = true;
      GT.tracker.confirmed.dxcc[sDXCC + "|"] = true;
      GT.tracker.confirmed.dxcc[sDXCC + "|" + details.mode] = true;
      GT.tracker.confirmed.dxcc[sDXCC + "|" + details.band] = true;
      if (isDigi == true)
      {
        GT.tracker.confirmed.dxcc[sDXCC + "|dg"] = true;
        GT.tracker.confirmed.dxcc[sDXCC + "|" + details.band + "dg"] = true;
      }
      if (isPhone == true)
      {
        GT.tracker.confirmed.dxcc[sDXCC + "|ph"] = true;
        GT.tracker.confirmed.dxcc[sDXCC + "|" + details.band + "ph"] = true;
      }
    }

    if (details.state)
    {
      GT.tracker.confirmed.state[details.state] = true;
      GT.tracker.confirmed.state[details.state + details.mode] = true;
      GT.tracker.confirmed.state[details.state + details.band] = true;
      GT.tracker.confirmed.state[details.state + details.band + details.mode] = true;

      if (isDigi)
      {
        GT.tracker.confirmed.state[details.state + "dg"] = true;
        GT.tracker.confirmed.state[details.state + details.band + "dg"] = true;
      }
    }

    if (details.cnty)
    {
      GT.tracker.confirmed.cnty[details.cnty] = true;
      GT.tracker.confirmed.cnty[details.cnty + details.mode] = true;
      GT.tracker.confirmed.cnty[details.cnty + details.band] = true;
      GT.tracker.confirmed.cnty[details.cnty + details.band + details.mode] = true;

      if (isDigi)
      {
        GT.tracker.confirmed.cnty[details.cnty + "dg"] = true;
        GT.tracker.confirmed.cnty[details.cnty + details.band + "dg"] = true;
      }
    }

    if (details.px)
    {
      GT.tracker.confirmed.px[details.px + details.band + details.mode] = true;
      // store the last one
      GT.tracker.confirmed.px[details.px] = details.hash;
      GT.tracker.confirmed.px[details.px + details.mode] = true;
      GT.tracker.confirmed.px[details.px + details.band] = true;
      if (isDigi == true)
      {
        GT.tracker.confirmed.px[details.px + "dg"] = true;
        GT.tracker.confirmed.px[details.px + details.band + "dg"] = true;
      }
      if (isPhone == true)
      {
        GT.tracker.confirmed.px[details.px + "ph"] = true;
        GT.tracker.confirmed.px[details.px + details.band + "ph"] = true;
      }
    }

    if (details.cont)
    {
      GT.tracker.confirmed.cont[details.cont + details.band + details.mode] = true;
      // store the last one
      GT.tracker.confirmed.cont[details.cont] = details.hash;
      GT.tracker.confirmed.cont[details.cont + details.mode] = true;
      GT.tracker.confirmed.cont[details.cont + details.band] = true;
      if (isDigi == true)
      {
        GT.tracker.confirmed.cont[details.cont + "dg"] = true;
        GT.tracker.confirmed.cont[details.cont + details.band + "dg"] = true;
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