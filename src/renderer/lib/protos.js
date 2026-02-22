// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.
const g_proto_bands = [
  "OOB",
  "OOB",
  1,
  "160m",
  3,
  "80m",
  5,
  "60m",
  7,
  "40m",
  10,
  "30m",
  14,
  "20m",
  18,
  "17m",
  21,
  "15m",
  24,
  "12m",
  27,
  "11m",
  28,
  "10m",
  29,
  "10m",
  40,
  "8m",
  50,
  "6m",
  51,
  "6m",
  52,
  "6m",
  53,
  "6m",
  54,
  "6m",
  70,
  "4m",
  141,
  "2m",
  142,
  "2m",
  143,
  "2m",
  144,
  "2m",
  145,
  "2m",
  146,
  "2m",
  147,
  "2m",
  148,
  "2m",
  219,
  "1.25m",
  220,
  "1.25m",
  221,
  "1.25m",
  222,
  "1.25m",
  223,
  "1.25m",
  224,
  "1.25m",
  225,
  "1.25m"
];
// Incoming is already   float fixed (  14.037 ) for 14,037,000hz
function formatBand(freq)
{
  let newFreq = parseInt(freq);
  if (newFreq > 0 && newFreq < 226) return g_proto_bands[g_proto_bands.indexOf(newFreq) + 1];
  else if (newFreq >= 420 && newFreq <= 450) return "70cm";
  else if (newFreq >= 902 && newFreq <= 928) return "33cm";
  else if (newFreq >= 1240 && newFreq <= 1300) return "23cm";
  else if (newFreq >= 2300 && newFreq <= 2450) return "13cm";
  else if (newFreq >= 2300 && newFreq <= 2450) return "13cm";
  else if (newFreq >= 3300 && newFreq <= 3500) return "9cm";
  else if (newFreq >= 5650 && newFreq <= 5925) return "6cm";
  else if (newFreq >= 10000 && newFreq <= 10500) return "3cm";
  else if (newFreq >= 24000 && newFreq <= 24250) return "1.2cm";
  else if (newFreq >= 47000 && newFreq <= 47200) return "6mm";
  else if (newFreq >= 75500 && newFreq <= 81000) return "4mm";
  else if (newFreq >= 122500 && newFreq <= 123000) return "2.5mm";
  else if (newFreq >= 134000 && newFreq <= 141000) return "2mm";
  else if (newFreq >= 241000 && newFreq <= 250000) return "1mm";
  else if (freq >= 0.472 && freq <= 0.479) return "630m";
  else if (freq >= 0.1357 && freq <= 0.1485) return "2200m";
  else if (freq >= 0.009 && freq <= 0.02) return "4000m";
  else return "OOB";
};

function formatMhz(freq, n, x)
{
  let re = "\\d(?=(\\d{" + (x || 3) + "})+" + (n > 0 ? "\\." : "$") + ")";
  return freq.toFixed(Math.max(0, ~~n)).replace(new RegExp(re, "g"), "$&.");
};

function formatSignalReport(val)
{
  let report = String();
  if (!isNaN(val) && val >= 0) report = "+" + val;
  else report = val;
  return report;
};

const CALLSIGN_REGEX = /0/g
function formatCallsign(call)
{
  return call.replace(CALLSIGN_REGEX, "Ø");
};

function toDHMS(inputSeconds)
{
  let seconds = inputSeconds;
  let days = Math.floor(seconds / (3600 * 24));
  seconds -= days * 3600 * 24;
  let hrs = Math.floor(seconds / 3600);
  seconds -= hrs * 3600;
  let mnts = Math.floor(seconds / 60);
  seconds -= mnts * 60;

  days = days ? days + "d " : "";
  hrs = hrs ? hrs + "h " : "";
  mnts = mnts ? mnts + "m " : "";
  let first = days + hrs + mnts;
  if (first == "") val = seconds + "s";
  else val = first + (seconds > 0 ? seconds + "s" : "");
  return val;
};

function toDHM(inputSeconds)
{
  let seconds = inputSeconds;
  let days = Math.floor(seconds / (3600 * 24));
  seconds -= days * 3600 * 24;
  let hrs = Math.floor(seconds / 3600);
  seconds -= hrs * 3600;
  let mnts = Math.floor(seconds / 60);
  seconds -= mnts * 60;

  days = days ? days + "d " : "";
  hrs = hrs ? hrs + "h " : "";
  mnts = mnts || seconds ? mnts + "m " : "";
  val = days + hrs + mnts;
  if (val == "") val = "0m";

  return val;
};

function toColonHMS(inputSeconds)
{
  let seconds = inputSeconds;
  let hrs = Math.floor(seconds / 3600);
  seconds -= hrs * 3600;
  let mnts = Math.floor(seconds / 60);
  seconds -= mnts * 60;
  return padNumber(hrs, 2) + ":" + padNumber(mnts, 2) + ":" + padNumber(seconds, 2);
};

function toYM(input)
{
  let months = input;
  let years = parseInt(Math.floor(months / 12));
  months -= years * 12;
  months = parseInt(months);
  years = years ? years + "y " : "";
  months = months ? months + "m" : "";
  let total = years + months;
  return total == "" ? "any" : total;
};

function padNumber(number, size)
{
  let s = String(number);
  while (s.length < (size || 2))
  {
    s = "0" + s;
  }
  return s;
};

function replaceAll(input, str1, str2)
{
  return input.split(str1).join(str2);
};

function toProperCase(text)
{
  return text.replace(/\w\S*/g, function (txt)
  {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
};
