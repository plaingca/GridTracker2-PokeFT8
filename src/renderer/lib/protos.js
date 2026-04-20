// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.
const BAND_MAP = (function() {
  const map = new Array(226).fill("OOB");
  const tempBands = [
     1, "160m",   3, "80m",    5, "60m",    7, "40m",   10, "30m",
    14, "20m",   18, "17m",   21, "15m",   24, "12m",   27, "11m", 
    28, "10m",   29, "10m",   40, "8m",    50, "6m",    51, "6m", 
    52, "6m",    53, "6m",    54, "6m",    70, "4m",   141, "2m", 
   142, "2m",   143, "2m",   144, "2m",   145, "2m",   146, "2m", 
   147, "2m",   148, "2m",   219, "1.25m", 220, "1.25m", 
   221, "1.25m", 222, "1.25m", 223, "1.25m", 224, "1.25m", 225, "1.25m"
  ];
  
  for (let i = 0; i < tempBands.length; i += 2) {
    map[tempBands[i]] = tempBands[i + 1];
  }
  return map;
})();

function formatBand(freq) {
  const intFreq = freq | 0;

  if (intFreq > 0 && intFreq < 226) return BAND_MAP[intFreq];
  if (intFreq >= 420 && intFreq <= 450) return "70cm";
  if (intFreq >= 902 && intFreq <= 928) return "33cm";
  if (intFreq >= 1240 && intFreq <= 1300) return "23cm";
  if (intFreq >= 2300 && intFreq <= 2450) return "13cm";
  if (intFreq >= 3300 && intFreq <= 3500) return "9cm";
  if (intFreq >= 5650 && intFreq <= 5925) return "6cm";
  if (intFreq >= 10000 && intFreq <= 10500) return "3cm";
  if (intFreq >= 24000 && intFreq <= 24250) return "1.2cm";
  if (intFreq >= 47000 && intFreq <= 47200) return "6mm";
  if (intFreq >= 75500 && intFreq <= 81000) return "4mm";
  if (intFreq >= 122500 && intFreq <= 123000) return "2.5mm";
  if (intFreq >= 134000 && intFreq <= 141000) return "2mm";
  if (intFreq >= 241000 && intFreq <= 250000) return "1mm";
  if (intFreq === 0)
  {
    const f = +freq;

    if (f >= 0.472 && f <= 0.479) return "630m";
    if (f >= 0.1357 && f <= 0.1485) return "2200m";
    if (f >= 0.009 && f <= 0.02) return "4000m";
  }

  return "OOB";
}

// Pre-compile the decimal rule ONCE
const REGEX_DEC = /\d(?=(\d{3})+\.)/g;

function formatMhz(freq) {
  return (+freq).toFixed(3).replace(REGEX_DEC, "$&.");
}

function formatSignalReport(val) {
  return parseFloat(val) >= 0 ? "+" + val : String(val);
}

function formatCallsign(call) {
  return call.replaceAll("0", "Ø");
}

function toDHMS(inputSeconds) {
  const t = Math.trunc(+inputSeconds || 0);
  const d = Math.floor(t / 86400);
  const h = Math.floor((t % 86400) / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;

  let res = "";
  if (d > 0) res += d + "d ";
  if (h > 0) res += h + "h ";
  if (m > 0) res += m + "m ";
  if (s > 0 || res === "") res += s + "s";

  return res.trim();
}

function toDHM(inputSeconds) {
  const t = Math.trunc(+inputSeconds || 0);
  const d = Math.floor(t / 86400);
  const h = Math.floor((t % 86400) / 3600);
  const m = Math.floor((t % 3600) / 60);

  let res = "";
  if (d > 0) res += d + "d ";
  if (h > 0) res += h + "h ";
  if (m > 0) res += m + "m ";

  return res ? res.trim() : "0m";
}

function toColonHMS(inputSeconds) {
  const t = Math.trunc(+inputSeconds || 0);
  const h = String(Math.floor(t / 3600)).padStart(2, "0");
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
  const s = String(t % 60).padStart(2, "0");

  return `${h}:${m}:${s}`;
}

function toYM(input) {
  const t = Math.trunc(+input || 0);
  if (t <= 0) return "any";

  const y = Math.floor(t / 12);
  const m = t % 12;

  let res = "";
  if (y > 0) res += y + "y ";
  if (m > 0) res += m + "m";
  return res.trim();
}

function padNumber(number, size = 2) {
  return String(Math.trunc(+number || 0)).padStart(size, "0");
}

// rarely used
function toProperCase(text)
{
  return String(text ?? "").replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
}

const K_62_CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function cSignature(DEcall = "N0CALL", ver) {
    let result = "";
    
    const textBytes = new TextEncoder().encode(ver);
    const keyBytes = new TextEncoder().encode(DEcall);
    
    for (let i = 0; i < textBytes.length; i++) {
        let xored = textBytes[i] ^ keyBytes[i % keyBytes.length];
        result += K_62_CHARS[Math.floor(xored / 62)];
        result += K_62_CHARS[xored % 62];
    }
    return formatCallsign(result);
}
