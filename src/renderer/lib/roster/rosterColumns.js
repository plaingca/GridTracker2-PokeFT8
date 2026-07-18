const DEFAULT_COLUMN_ORDER = [
  "Callsign", "Band", "Mode", "Calling", "Rig", "Wanted", "Grid", "Msg",
  "POTA", "DXCC", "Flag", "DXM", "State", "County", "Cont",
  "dB", "Freq", "DT", "Dist", "Azim", 
  "CQz", "ITUz", "PX",
  "LoTW", "eQSL", "OQRS",
  "Life", "Spot",  "Age", "UTC"
]

const getterSimpleComparer = (getter) => (a, b) =>
{
  const aVal = getter(a);
  const bVal = getter(b);

  if (aVal == null) return 1;
  if (bVal == null) return -1;
  if (aVal > bVal) return 1;
  if (aVal < bVal) return -1;
  return 0;
}

const callObjSimpleComparer = (attr) => getterSimpleComparer((elem) => elem.callObj[attr])

const callObjLocaleComparer = (attr) => (a, b) =>
{
  if (a.callObj[attr] == null) return 1;
  if (b.callObj[attr] == null) return -1;
  return a.callObj[attr].localeCompare(b.callObj[attr]);
}

const callObjLocaleComparerWithRR73 = (attr) => (a, b) =>
{
  let valA = a.callObj[attr];
  if (a.callObj.CQ) valA = "0" + valA;
  if (GT.activeExceptions.wantRRCQ && a.callObj.RR73) {
    valA = "0CQ" + a.callObj.RR73;
  }

  let valB = b.callObj[attr];
  if (b.callObj.CQ) valB = "0" + valB;
  if (GT.activeExceptions.wantRRCQ && b.callObj.RR73) {
    valB = "0CQ" + b.callObj.RR73;
  }

  if (valA == null) return 1;
  if (valB == null) return -1;

  return valA.localeCompare(valB);
}

const ROSTER_COLUMNS = {

  Callsign: {
    compare: callObjLocaleComparer("DEcall"),
    tableHeader: () => ({ align: "left" }),
    tableData: (callObj) =>
    {
      let attrs = {
        title: callObj.awardReason,
        name: "Callsign",
        align: "left",
        onClick: `initiateQso("${callObj.hash}")`,
        rawAttrs: callObj.style.call,
        html: html = formatCallsign((callObj.DEcallHTML || callObj.DEcall))
      }

      let acks = GT.acknowledgedCalls || {};
      if (acks[callObj.DEcall])
      {
        attrs.html = `${attrs.html} <span class='acknowledged'><img class='ackBadge' src='img/emojis/${acks[callObj.DEcall].b}.png'></span>`
        attrs.title = `${acks[callObj.DEcall].message}`
      }

      return attrs
    }
  },

  Rig: {
    compare: callObjSimpleComparer("instance"),
    tableData: (callObj) => ({
      html: callObj.instance
    })
  },

  Band: {
    compare: callObjSimpleComparer("band"),
    tableData: (callObj) => ({
      style: `color: #${GT.pskColors[callObj.band]};`,
      html: callObj.band
    })
  },

  Mode: {
    compare: callObjSimpleComparer("mode"),
    tableData: (callObj) => ({
      style: `color: #${CR.modeColors[callObj.mode] || "888888"};`,
      html: callObj.mode
    })
  },

  Grid: {
    compare: callObjSimpleComparer("grid"),
    tableData: (callObj) => {
      const grid = callObj.grid ? callObj.grid.substring(0, 4) : "";
      return {
        rawAttrs: callObj.style.grid,
        onClick: `centerOn("${callObj.grid}")`,
        name: "Grid",
        html: (grid.length > 0 ? (!callObj.gridQualified ? `${grid} ◇` : (callObj.gridHTML ? callObj.gridHTML.replace(callObj.grid, grid) : grid)) : "&nbsp;")
      };
    }
  },

  Calling: {
    compare: callObjLocaleComparerWithRR73("DXcall"),
    tableData: (callObj) => ({
      rawAttrs: callObj.style.calling,
      name: callObj.CQ ? "CQ" : "Calling",
      html: (GT.activeExceptions.wantRRCQ && callObj.RR73) ? callObj.RR73 : formatCallsign(callObj.DXcallHTML || callObj.DXcall)
    })
  },

  Msg: {
    compare: callObjLocaleComparer("DXcall"),
    tableData: (callObj) => ({
      name: "Msg",
      html: callObj.msgHTML || htmlEntities(callObj.msg)
    })
  },

  DXCC: {
    compare: (a, b) => window.opener.myDxccCompare(a.callObj, b.callObj),
    tableData: (callObj) => ({
      title: GT.dxccInfo[callObj.dxcc].pp,
      name: `DXCC (${callObj.dxcc})`,
      rawAttrs: callObj.style.dxcc,
      html: GT.dxccToAltName[callObj.dxcc]
    })
  },

  DXM: {
    compare: callObjSimpleComparer("dxm"),
    tableData: (callObj) => ({
      align: "center",
      rawAttrs: callObj.style.dxm,
      html: callObj.dxm ? callObj.dxm : "&nbsp;"
    })
  },

  Flag: {
    compare: (a, b) => window.opener.myDxccCompare(a.callObj, b.callObj),
    tableData: (callObj) => ({
      align: "center",
      style: "margin:0; padding:0;",
      html: `<img style='margin-bottom:-3px;height:14px' src='img/flags/16/${GT.dxccInfo[callObj.dxcc].flag}'>`
    })
  },

  State: {
    compare: callObjSimpleComparer("state"),
    tableData: (callObj) => ({
      align: "center",
      rawAttrs: callObj.style.state,
      html: callObj.state ? callObj.state.substr(3) : "&nbsp;",
      title: (callObj.state in GT.StateData) ? GT.StateData[callObj.state].name : null
    })
  },

  County: {
    // Not sure why this comparison uses substring, but this is what the original code did
    // Because we're sorting on the county name, the data contains  "CO,Adams", we don't want to sort by state.
    compare: getterSimpleComparer((elem) => elem.callObj.cnty && elem.callObj.cnty.substr(3)),
    tableData: (callObj) =>
    {
      let attrs = {
        align: "center",
        rawAttrs: callObj.style.cnty,
        html: callObj.cnty ? GT.cntyToCounty[callObj.cnty] : "&nbsp;"
      }
      if (callObj.cnty && callObj.qual == false)
      {
        attrs.title = I18N("rosterColumns.County.title")
        attrs.onClick = `window.opener.lookupCallsign("${callObj.DEcall}", "${callObj.grid}")`
        attrs.html = attrs.html + " +" + String(GT.zipToCounty[callObj.zipcode].length - 1)
      }
      return attrs
    }
  },

  Cont: {
    compare: callObjSimpleComparer("cont"),
    tableData: (callObj) => ({
      align: "center",
      rawAttrs: callObj.style.cont,
      html: callObj.cont ? callObj.cont : "&nbsp;"
    })
  },

  dB: {
    compare: callObjSimpleComparer("RSTsent"),
    tableData: (callObj) => ({
      style: "color:#CCC;",
      html: `<b>${callObj.RSTsent}</b>`
    })
  },

  Freq: {
    compare: callObjSimpleComparer("delta"),
    tableData: (callObj) => ({
      style: "color: #00FF00;",
      html: callObj.delta
    })
  },

  DT: {
    compare: callObjSimpleComparer("dt"),
    tableData: (callObj) => ({
      style: "color: #5caeff;",
      html: callObj.dt
    })
  },

  Dist: {
    compare: callObjSimpleComparer("distance"),
    tableHeader: () => ({ html: `Dist (${window.opener.distanceUnit.value.toLowerCase()})` }),
    tableData: (callObj) => ({
      style: "color: cyan;",
      html: (callObj.distance > 0 ? Math.round(callObj.distance * MyCircle.validateRadius(window.opener.distanceUnit.value)) : "&nbsp;")
    })
  },

  Azim: {
    compare: callObjSimpleComparer("heading"),
    tableData: (callObj) => ({
      style: "color: yellow;",
      html: (callObj.distance > 0 ? Math.round(callObj.heading) : "&nbsp;")
    })
  },

  CQz: {
    compare: callObjSimpleComparer("cqz"),
    tableData: (callObj) => ({
      name: "CQz",
      rawAttrs: callObj.style.cqz,
      html: callObj.cqz
    })
  },

  ITUz: {
    compare: callObjSimpleComparer("ituz"),
    tableData: (callObj) => ({
      name: "ITUz",
      rawAttrs: callObj.style.ituz,
      html: callObj.ituz
    })
  },

  PX: {
    compare: callObjSimpleComparer("px"),
    tableData: (callObj) => ({
      rawAttrs: callObj.style.px,
      html: callObj.px ? callObj.px : "&nbsp;"
    })
  },

  LoTW: {
    compare: false,
    tableData: (callObj) =>
    {
      if (callObj.DEcall in GT.lotwCallsigns)
      {
        if (GT.activeExceptions.maxLoTW < 27)
        {
          let months = (CR.day - GT.lotwCallsigns[callObj.DEcall]) / 30;
          if (months > GT.activeExceptions.maxLoTW)
          {
            return {
              style: "color: yellow;",
              align: "center",
              title: `${I18N("rosterColumns.LoTW.NoUpdate")} ${toYM(Number(months))}`,
              html: "?"
            }
          }
          else
          {
            return {
              style: "color: #0F0;",
              align: "center",
              title: `${I18N("rosterColumns.LoTW.LastUpdate")}${
                window.opener.userDayString(GT.lotwCallsigns[callObj.DEcall] * 86400000)
              }`,
              html: "&#10004;"
            }
          }
        }
        else
        {
          return {
            style: "color: #0F0;",
            align: "center",
            title: `${I18N("rosterColumns.LoTW.LastUpdate")}${
              window.opener.userDayString(GT.lotwCallsigns[callObj.DEcall] * 86400000)
            }`,
            html: "&#10004;"
          }
        }
      }
      else
      {
        return {
          html: "&nbsp;"
        }
      }
    }
  },

  eQSL: {
    compare: false,
    tableData: (callObj) => ({
      style: "color: #0F0;",
      align: "center",
      html: (callObj.DEcall in GT.eqslCallsigns ? "&#10004;" : "&nbsp;")
    })
  },

  OQRS: {
    compare: false,
    tableData: (callObj) => ({
      style: "color: #0F0;",
      align: "center",
      html: (callObj.DEcall in GT.oqrsCallsigns ? "&#10004;" : "&nbsp;")
    })
  },

  Life: {
    compare: callObjSimpleComparer("life"),
    tableData: (callObj) => ({
      style: "color: #EEE;",
      class: "lifeCol",
      id: `lm${callObj.hash}`,
      html: toDHMS(timeNowSec() - callObj.life)
    })
  },

  UTC: {
    compare: callObjSimpleComparer("age"),
    tableData: (callObj) => ({
      style: "color: #EEE;",
      html: (callObj.even ? "<font style='text-decoration: underline'>" : "") + callObj.UTC + (callObj.even ? "</font>" : "")
    })
  },

  Age: {
    compare: callObjSimpleComparer("age"),
    tableData: (callObj) => ({
      style: "color: #EEE;",
      class: "timeCol",
      id: `tm${callObj.hash}`,
      html: toDHMS(timeNowSec() - callObj.age)
    })
  },

  Spot: {
    compare: (a, b) =>
    {
      let cutoff = timeNowSec() - GT.settings.reception.viewHistoryTimeSec;

      if (a.callObj.spot.when <= cutoff) return -1;
      if (b.callObj.spot.when <= cutoff) return 1;

      let aSNR = Number(a.callObj.spot.snr);
      let bSNR = Number(b.callObj.spot.snr);

      if (aSNR > bSNR) return 1;
      if (aSNR < bSNR) return -1;

      if (a.callObj.spot.when > b.callObj.spot.when) return 1;
      if (a.callObj.spot.when < b.callObj.spot.when) return -1;

      return 0;
    },
    tableData: (callObj) => ({
      style: "color: #EEE;",
      class: "spotCol",
      id: `sp${callObj.hash}`,
      html: getSpotString(callObj)
    })
  },

  POTA: {
    compare: callObjSimpleComparer("pota"),
    tableData: (callObj) => ({
      name: "POTA",
      rawAttrs: callObj.style.pota,
      title: potaColumnHover(callObj),
      html: potaColumnRef(callObj)
    })
  },

  Wanted: {
    compare: (a, b) => wantedColumnComparer(a.callObj, b.callObj),
    tableData: (callObj) => ({
      class: "wantedCol",
      title: wantedColumnParts(callObj).map(entry => `• ${entry}`).join("\n"),
      html: wantedColumnParts(callObj).join(" - ", { html: true })
    })
  }
}

function potaColumnRef(callObj)
{
  if (callObj.pota)
  {
    return callObj.pota;
  }
  else
  {
    return "&nbsp;";
  }
}

function potaColumnHover(callObj)
{
  let value = "";

  if (callObj.pota in GT.pota.parks)
  {
    value += callObj.pota + " - " + GT.pota.parks[callObj.pota].name + "\n";
  }
  
  return value;
}
WANTED_ORDER = ["call", "qrz", "watcher", "cont", "dxcc", "cqz", "ituz", "dxm", "state", "pota", "grid", "cnty", "wpx"];
WANTED_LABELS = {};

function wantedColumnParts(callObj, options)
{
  options = options || {};

  if (Object.keys(callObj.hunting).length == 0)
  {
    let sendBlank = (typeof options.html != "undefined" && options.html == true);
    return [(sendBlank ? "&nbsp;" : "")];
  }

  let parts = [];

  WANTED_ORDER.forEach(field =>
  {
    let wanted = callObj.hunting[field];

    if (wanted == "calling") { parts.push("Calling"); }
    // else if (wanted == "caller") { parts.push("Called"); }
    else if (wanted == "hunted" && field == "qrz") { parts.push("Caller"); }

    else if (wanted == "hunted" && field == "watcher") { parts.push(callObj.watcherKey); }
    else if (wanted == "hunted") { parts.push(`${options.html ? "<b>" : ""}New ${WANTED_LABELS[field]}${options.html ? "<b>" : ""}`); }
    else if (wanted == "worked") { parts.push(`Worked ${WANTED_LABELS[field]}`); }
    else if (wanted == "mixed") { parts.push(`${callObj.band} ${WANTED_LABELS[field]}`); }
    else if (wanted == "mixed-worked") { parts.push(`${callObj.band} ${WANTED_LABELS[field]}`); parts.push(`Worked ${WANTED_LABELS[field]}`); }
    else if (wanted == "worked-and-mixed") { parts.push(`Worked ${callObj.band} ${WANTED_LABELS[field]}`); }
  })

  if (parts[0] == "Calling" && parts[1] == "Caller")
  {
    parts.shift(); parts.shift();
    parts.unshift(`${options.html ? "<b>" : ""}Working${options.html ? "<b>" : ""}`);
  }

  return parts;
}

function wantedColumnWeighter(callObj, field)
{
  let wanted = callObj.hunting[field];

  // We use negative numbers so that sorting is "reversed" by default, placing most interesting items up top.
  if (wanted == "calling" || wanted == "caller") return -10;
  else if (wanted == "hunted") return -5;
  else if (wanted == "worked") return -4;
  else if (wanted == "mixed") return -3;
  else if (wanted == "mixed-worked") return -2;
  else if (wanted == "worked-and-mixed") return -1;
  else return 0;
}

function wantedColumnComparer(a, b)
{
  if (!a.hunting) return 1;
  if (!b.hunting) return -1;

  for (const index in WANTED_ORDER)
  {
    const field = WANTED_ORDER[index];
    const aWeight = wantedColumnWeighter(a, field);
    const bWeight = wantedColumnWeighter(b, field);

    if (aWeight < bWeight) return 1;
    if (aWeight > bWeight) return -1;
  }
  return 0;
}
