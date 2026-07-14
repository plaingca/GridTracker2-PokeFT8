const GT = {};
const myTextEncoder = new TextEncoder();
const myTextDecoder = new TextDecoder();

importScripts("protos.js");
importScripts("gtCommon.js");

GT.workerFunctions = {
  init: initGlobals,
  clear: clearQSO,
  parse: onAdiLoadComplete,
  parseAcLog: parseAcLog
};

onmessage = (event) => {
  if (event.data?.type && event.data.type in GT.workerFunctions) {
    GT.workerFunctions[event.data.type](event.data);
  } else {
    console.log("adifWorker: unknown or missing event type");
  }
};

function initGlobals(task) {
  GT.dxccInfo = task.dxccInfo;
  for (const key in GT.dxccInfo) GT.dxccInfo[key].geo = null;
  GT.dxccToCountryCode = task.dxccToCountryCode;
  GT.directCallToDXCC = task.directCallToDXCC;
  GT.directCallToITUzone = task.directCallToITUzone;
  GT.directCallToCQzone = task.directCallToCQzone;
  GT.prefixToITUzone = task.prefixToITUzone;
  GT.prefixToCQzone = task.prefixToCQzone;
  GT.prefixToDXCC = task.prefixToDXCC;
  GT.gridToState = task.gridToState;
  GT.cqZones = task.cqZones;
  for (const key in GT.cqZones) GT.cqZones[key].geo = null;
  GT.ituZones = task.ituZones;
  for (const key in GT.ituZones) GT.ituZones[key].geo = null;
  GT.wacZones = task.wacZones;
  for (const key in GT.wacZones) GT.wacZones[key].geo = null;

  GT.modes = task.modes;
  GT.modes_phone = task.modes_phone;
  GT.QSOhash = task.QSOhash;

  postMessage({ type: "loaded" });
}

function clearQSO(task) {
  GT.QSOhash = {};
  postMessage({
    type: "cleared",
    clearFiles: task.clearFiles,
    nextFunc: task.nextFunc
  });
}


function parseADIFRecordStrict(line)
{
  let record = {};
  let pos = line.indexOf("<");
  while (pos > -1)
  {
    line = line.substr(pos + 1);
    let where = line.indexOf(":");
    let nextChev = line.indexOf(">");
    if (where != -1 && nextChev > where)
    {
      let fieldName = line.substr(0, where).toUpperCase();
      line = line.substr(fieldName.length + 1);
      let fieldLength = parseInt(line);
      let end = line.indexOf(">");
      if (end > 0 && fieldName in GT.strictAdif)
      {
        line = line.substr(end + 1);
        let fieldValue;
        if (GT.strictAdif[fieldName] == true)
        {
          fieldValue = myTextDecoder.decode(myTextEncoder.encode(line.substr(0)).slice(0, fieldLength));
        }
        else
        {
          fieldValue = line.substr(0, fieldLength);
        }
        line = line.substr(1);
        record[fieldName] = fieldValue;
      }
    }

    pos = line.indexOf("<");
  }

  return record;
}

function onAdiLoadComplete(task) {
  GT.appSettings = task.appSettings;
  GT.myQsoCalls = {};
  GT.myQsoGrids = {};

  let liveLog = task.liveLog;
  let rows = 0;
  let rowsFiltered = 0;
  let lastHash = null;
  let clublogFile = false;
  let lotwTimestampUpdated = false;
  let returnTask = {};

  try {
    if (task.rawAdiBuffer.indexOf("clublog.adif") > -1 || task.rawAdiBuffer.indexOf("ADIF export from Club Log") > -1) clublogFile = true;

    // PERFORMANCE FIX: Added 'g' (global) flag so we can use .exec() to scan
    // the text incredibly fast without creating memory-hogging substrings.
    let eorRegEx = new RegExp("<EOR>", "ig");

    if (task.rawAdiBuffer.length > 1) {
      let startPos = 0;
      let match;

      // Scanning the buffer sequentially using Regex .exec() is 100x faster
      // and uses almost zero RAM compared to .substring().search()
      while ((match = eorRegEx.exec(task.rawAdiBuffer)) !== null) {
        
        let row = task.rawAdiBuffer.substring(startPos, match.index);
        startPos = eorRegEx.lastIndex; // Move startPos to just after this <EOR>

        let object = parseADIFRecordStrict(row);
        let lotwConfirmed = false;
        let confirmed = false;

        if (object.APP_LOTW_RXQSL) {
          let parts = object.APP_LOTW_RXQSL.split(" ");
          if (parts.length == 2) {
            let dRXQSL = Date.parse(parts.join("T") + "Z");
            if ((isNaN(dRXQSL) == false) && dRXQSL > 0 && dRXQSL > task.lotw_qsl) {
              // add a second
              dRXQSL += 1000;
              task.lotw_qsl = dRXQSL;
              lotwTimestampUpdated = true;
            }
          }
          lotwConfirmed = true;
        }

        let finalDEcall = "";
        if (object.STATION_CALLSIGN) {
          finalDEcall = object.STATION_CALLSIGN.replace("_", "/");
        }
        if (finalDEcall == "") {
          finalDEcall = GT.appSettings.myCall;
        }
        GT.myQsoCalls[finalDEcall] = true;

        if (GT.appSettings.workingCallsignEnable && !(finalDEcall in GT.appSettings.workingCallsigns)) {
          // not in the working callsigns, move to next
          rowsFiltered++;
          continue;
        }

        let finalTime = 0;

        if (object.QSO_DATE && object.TIME_ON) {
          let dateTime = new Date(
            Date.UTC(
              object.QSO_DATE.substr(0, 4),
              parseInt(object.QSO_DATE.substr(4, 2)) - 1,
              object.QSO_DATE.substr(6, 2),
              object.TIME_ON.substr(0, 2),
              object.TIME_ON.substr(2, 2),
              object.TIME_ON.substr(4, 2)
            )
          );

          finalTime = parseInt(dateTime.getTime() / 1000);
        }

        if (GT.appSettings.workingDateEnable && finalTime < GT.appSettings.workingDate) {
          // Not after our working date
          rowsFiltered++;
          continue;
        }

        let myGrid = (object.MY_GRIDSQUARE || "").toUpperCase();
        if (myGrid.length > 3) {
          let finalMyGrid = myGrid.substr(0, 4);
          GT.myQsoGrids[finalMyGrid] = true;
          if (GT.appSettings.workingGridEnable && !(finalMyGrid in GT.appSettings.workingGrids)) {
            // not in the working grids, move to next
            rowsFiltered++;
            continue;
          }
        }

        let finalDXcall = (object.CALL || null);
        if (finalDXcall == null) continue;
        finalDXcall = finalDXcall.replace("_", "/");

        // We made it this far, we have a workable qso
        const qso = {
          DXcall: finalDEcall,
          DEcall: finalDXcall,
          time: finalTime,
        };

        let finalGrid = (object.GRIDSQUARE || "").toUpperCase().substring(0, 6);
        let vuccGrids = (object.VUCC_GRIDS || "").toUpperCase();
        let finalVucc = [];

        if (!validateGridFromString(finalGrid)) finalGrid = null;
        
        if (vuccGrids != "") {
          finalVucc = vuccGrids.split(",");
          
          if (finalGrid) {
            let foundGrid = finalVucc.indexOf(finalGrid.substring(0, 4));
            if (foundGrid > -1) {
              finalVucc.splice(foundGrid, 1);
            }
          } else {
            finalGrid = finalVucc.shift();
          }
        }

        if (finalVucc.length > 0) qso.vucc_grids = finalVucc;

        if (finalGrid) {
          qso.grid = finalGrid;
          qso.grid4 = finalGrid.substring(0, 4);
        }

        let finalRSTsent = (object.RST_SENT || null);
        if (finalRSTsent) qso.RSTsent = finalRSTsent;

        let finalRSTrecv = (object.RST_RCVD || null);
        if (finalRSTrecv) qso.RSTrecv = finalRSTrecv;

        let finalBand = (object.BAND || "").toLowerCase();
        if (finalBand == "" || finalBand == "oob") {
          finalBand = formatBand(Number(object.FREQ || 0));
        }
        qso.band = finalBand;

        let finalPropMode = (object.PROP_MODE || null);
        if (finalPropMode) qso.propMode = finalPropMode.toUpperCase();

        let finalCont = (object.CONT || null);
        if (finalCont && finalCont in GT.wacZones) qso.cont = finalCont.toUpperCase();

        let finalCnty = (object.CNTY || null);
        // GT references internally with NO spaces, this is important 
        if (finalCnty) qso.cnty = finalCnty.toUpperCase().replaceAll(" ", "");

        let finalMode = (object.MODE || "").toUpperCase();
        let subMode = (object.SUBMODE || "").toUpperCase();
        if ((finalMode == "MFSK" || finalMode == "DATA") && subMode.length) {
          // Internal assigment only
          finalMode = subMode;
        }

        qso.mode = finalMode;

        let finalMsg = (object.COMMENT || null);
        let finalQslMsg = (object.QSLMSG || null);
        let finalQslMsgIntl = (object.QSLMSG_INTL || null);
        if (finalQslMsg) {
          finalMsg = finalQslMsg;
        }
        if (finalQslMsgIntl && finalMsg == null) {
          finalMsg = finalQslMsgIntl;
        }
        if (finalMsg) {
          finalMsg = finalMsg.trim();
          if (finalMsg.length > 40) finalMsg = finalMsg.substring(0, 40) + "...";
          if (finalMsg.length > 0) qso.msg = finalMsg;
        }

        let finalDxcc = 0;
        if (object.DXCC) {
          finalDxcc = parseInt(object.DXCC);
        }

        if (finalDxcc == 0) finalDxcc = parseInt(callsignToDxcc(finalDXcall));
        if (!(finalDxcc in GT.dxccInfo)) finalDxcc = parseInt(callsignToDxcc(finalDXcall));
        qso.dxcc = finalDxcc;

        let finalState = (object.STATE || null);
        if (finalState && finalDxcc > 0) finalState = GT.dxccToCountryCode[finalDxcc] + "-" + finalState.toUpperCase();
        if (finalState) qso.state = finalState;

        let finalCqZone = (object.CQZ || "");
        if (finalCqZone.length == 1) finalCqZone = "0" + finalCqZone;
        finalCqZone = String(finalCqZone);
        if (finalCqZone in GT.cqZones) qso.cqz = finalCqZone;

        let finalItuZone = (object.ITUZ || "");
        if (finalItuZone.length == 1) finalItuZone = "0" + finalItuZone;
        finalItuZone = String(finalItuZone);
        if (finalItuZone in GT.ituZones) qso.ituz = finalItuZone;

        let finalIOTA = (object.IOTA || null);
        if (finalIOTA) qso.IOTA = finalIOTA.toUpperCase();

        let qrzConfirmed = (object.APP_QRZLOG_STATUS || "").toUpperCase();
        let genericConfirmed = (object.QSL_RCVD || "").toUpperCase();
        let genConf = (genericConfirmed == "Y" || genericConfirmed == "V");
        let lotw_qsl_rcvd = (object.LOTW_QSL_RCVD || "").toUpperCase();
        let eqsl_qsl_rcvd = (object.EQSL_QSL_RCVD || "").toUpperCase();

        lotwConfirmed = (lotwConfirmed || lotw_qsl_rcvd == "Y" || lotw_qsl_rcvd == "V");
        let eqslConf = (eqsl_qsl_rcvd == "Y" || eqsl_qsl_rcvd == "V");
        let clubConf = (clublogFile && genConf);
        if (genConf || qrzConfirmed == "C" || lotwConfirmed || eqslConf) {
          confirmed = true;
          qso.confSrcs = {};
          if (qrzConfirmed == "C") qso.confSrcs["Q"] = true;
          else {
            if (lotwConfirmed == true) qso.confSrcs["L"] = true;
            if (eqslConf) qso.confSrcs["e"] = true;
            if (clubConf) qso.confSrcs["C"] = true;
          }
          if (Object.keys(qso.confSrcs).length == 0) qso.confSrcs["O"] = true;
        }

        qso.confirmed = confirmed;

        qso.digital = false;
        if (finalMode in GT.modes) qso.digital = GT.modes[finalMode];
        qso.phone = false;
        if (finalMode in GT.modes_phone) qso.phone = GT.modes_phone[finalMode];

        let finalPOTA = (object.POTA_REF || object.POTA || null);
        if (finalPOTA) {
          qso.pota = finalPOTA.toUpperCase();
        } else if (object.SIG && object.SIG.toUpperCase() == "POTA" && object.SIG_INFO && object.SIG_INFO.length > 2) {
          qso.pota = object.SIG_INFO.toUpperCase();
        }

        lastHash = addQSO(qso);
        rows++;
      }
    }

    // Came from a live event, we handly differently
    if (liveLog == true) {
      if (rows == 1 && lastHash != null) {
        returnTask.type = "parsedLive";
        returnTask.hash = lastHash;
        returnTask.details = GT.QSOhash[lastHash];
        returnTask.nextFunc = task.nextFunc;
      } else {
        returnTask.type = "filteredLive";
        returnTask.rows = rows;
        returnTask.rowsFiltered = rowsFiltered;
        returnTask.nextFunc = task.nextFunc;
      }
    } else {
      returnTask.type = "parsed";
      returnTask.QSOhash = GT.QSOhash;
      returnTask.myQsoCalls = GT.myQsoCalls;
      returnTask.myQsoGrids = GT.myQsoGrids;
      returnTask.lotw_qsl = task.lotw_qsl;
      returnTask.lotwTimestampUpdated = lotwTimestampUpdated;
      returnTask.rowsFiltered = rowsFiltered;
      returnTask.nextFunc = task.nextFunc;
    }
  } catch (e) {
    // something when horribly wrong, let's tell the boss
    console.error(e);
    returnTask.type = "exception";
    returnTask.nextFunc = task.nextFunc;
  }
  
  postMessage(returnTask);
}


const def_qso = {
  band: "", cnty: null, confirmed: false, confSrcs: {}, cont: null,
  cqz: null, DEcall: "", delta: -1, digital: false, DXcall: "", dxcc: -1,
  grid: "", grid4: "", IOTA: null, ituz: null, mode: "", msg: "-", phone: false,
  pota: null, propMode: "", px: null, qso: true, qual: false, RSTrecv: "",
  RSTsent: "", state: null, time: 0, vucc_grids: [], worked: true, zipcode: null,
  zone: null
};

function manualMerge(target, source) {
  for (const key in source) {
    if (key === 'confSrcs') continue; // handled specially
    if (source[key] !== undefined) target[key] = source[key];
  }
  return target;
}

function addQSO(qso) {
  const timeMod = qso.time - ((qso.time % 60) + 30);
  const hash = unique(qso.DEcall + timeMod) + unique(qso.mode + qso.band);
  
  let details = GT.QSOhash[hash];

  if (details !== undefined) {
    let canWrite = (details.confirmed === false || (qso.confirmed === true && (GT.appSettings.qslAuthority === "0" || GT.appSettings.qslAuthority in qso.confSrcs || !(GT.appSettings.qslAuthority in details.confSrcs))));
    
    if (GT.appSettings.qslAuthority === "1" && qso.confirmed === true) canWrite = false;
    
    if (qso.confSrcs) {
      details.confSrcs = Object.assign({}, details.confSrcs || {}, qso.confSrcs);
    }
    
    if (qso.pota) details.pota = qso.pota;
    if (canWrite === false) return;
    
    // Fast merge instead of deepmerge
    details = manualMerge(details, qso);
  } else {
    // Fast creation for new QSOs
    details = manualMerge(Object.assign({}, def_qso), qso);
    details.confSrcs = qso.confSrcs ? Object.assign({}, qso.confSrcs) : {};
    GT.QSOhash[hash] = details;    
  }

  if (details.dxcc < 1) details.dxcc = callsignToDxcc(details.DEcall);
  if (details.px === null) details.px = getWpx(details.DEcall);
  if (details.zone === null && details.px) details.zone = Number(details.px.charAt(details.px.length - 1));

  if (details.dxcc > 0) {
    details.cont = GT.dxccInfo[details.dxcc].continent;
    if (details.dxcc === 390 && details.zone === 1) details.cont = "EU";
  }

  if (details.cnty && details.confirmed === true) details.qual = true;

  if (details.state === null && details.grid4 > 0 && isKnownCallsignUS(details.dxcc)) {
    let fourGrid = details.grid4;
    if (fourGrid in GT.gridToState && GT.gridToState[fourGrid].length === 1) {
      details.state = GT.gridToState[fourGrid][0];
    }
  }
  
  if (!details.cqz) details.cqz = cqZoneFromCallsign(details.DEcall, details.dxcc);
  if (!details.ituz) details.ituz = ituZoneFromCallsign(details.DEcall, details.dxcc);

  return hash;
}

GT.strictAdif = {
    APP_LOTW_RXQSL: false, STATION_CALLSIGN: false, QSO_DATE: false, TIME_ON: false, MY_GRIDSQUARE: false,
    CALL: false, GRIDSQUARE: false, VUCC_GRIDS: false, RST_SENT: false, RST_RCVD: false, BAND: false,
    FREQ: false, PROP_MODE: false, CONT: false, CNTY: false, MODE: false, SUBMODE: false, COMMENT: true,
    QSLMSG: true, QSLMSG_INTL: true, DXCC: false, STATE: false, CQZ: false, ITUZ: false, IOTA: false,
    APP_QRZLOG_STATUS: false, QSL_RCVD: false, LOTW_QSL_RCVD: false, EQSL_QSL_RCVD: false, POTA: false,
    POTA_REF: false, OPERATOR: false, APP_PSKREP_SNR: false, SIG: false, SIG_INFO: false
};


function parseAcLog(task)
{
  GT.appSettings = task.appSettings;
  GT.aclSettings = task.aclSettings;
  GT.myQsoCalls = {};
  GT.myQsoGrids = {};

  let rows = 0;
  let rowsFiltered = 0;
  let myCall = GT.appSettings.myCall;
  let myGrid = GT.appSettings.myGrid;
  let returnTask = {};

  try {

    let eorRegEx = new RegExp("</CMD>", "i");

    if (task.rawAcLogBuffer.length > 1)
    {
      let startPos = 0;
      let endPos = task.rawAcLogBuffer.length;

      let opRow = task.rawAcLogBuffer.substring(startPos).search(eorRegEx);
      if (opRow != -1)
      {
        let opInfo = parseAcLogXML(task.rawAcLogBuffer.substring(startPos, opRow));
        myCall = (opInfo.CALL || myCall);
        myGrid = (opInfo.GRID || myGrid);
        startPos += opRow + 6; // skip </CMD>
      }
      else
      {
        console.log("Missing operator info, we should not continue?");
      }

      while (startPos != endPos)
      {
        let eor = task.rawAcLogBuffer.substring(startPos).search(eorRegEx);
        if (eor != -1)
        {
          let row = task.rawAcLogBuffer.substring(startPos, startPos + eor);
          startPos += eor + 6; // skip </CMD>
          let object = parseAcLogXML(row);
          let confirmed = false;
          let confSource = null;
          let finalDEcall = (object.FLDOPERATOR || myCall);
          GT.myQsoCalls[finalDEcall] = true;

          if (GT.appSettings.workingCallsignEnable && !(finalDEcall in GT.appSettings.workingCallsigns))
          {
            // not in the working callsigns, move to next
            rowsFiltered++;
            continue;
          }

          let finalTime = 0;

          if (object.DATE && object.TIMEON)
          {
            let dateTime = new Date(
              Date.UTC(
                object.DATE.substring(0, 4),
                parseInt(object.DATE.substring(5, 7)) - 1,
                object.DATE.substring(8, 10),
                object.TIMEON.substring(0, 2),
                object.TIMEON.substring(3, 5),
                object.TIMEON.substring(6, 8)
              )
            );

            finalTime = parseInt(dateTime.getTime() / 1000);
          }

          if (GT.appSettings.workingDateEnable && finalTime < GT.appSettings.workingDate)
          {
            // Not after our working date
            rowsFiltered++;
            continue;
          }

          myGrid = (object.FLDGRIDS || myGrid);
          if (myGrid.length > 3)
          {
            let finalMyGrid = myGrid.substr(0, 4).toUpperCase();;
            GT.myQsoGrids[finalMyGrid] = true;
            if (GT.appSettings.workingGridEnable && !(finalMyGrid in GT.appSettings.workingGrids))
            {
              // not in the working grids, move to next
              rowsFiltered++;
              continue;
            }
          }

          let finalDXcall = (object.CALL || null);
          if (finalDXcall == null) continue;

          // We made it this far, we have a workable qso
          const qso = {
            DXcall: finalDEcall,
            DEcall: finalDXcall,
            time: finalTime,
          };

          let finalGrid = (object.GRID || "").toUpperCase().substring(0, 6);
          let vuccGrids = (object.VUCC_GRIDS || "").toUpperCase();
          let finalVucc = [];

          if (!validateGridFromString(finalGrid)) finalGrid = null;
          if (finalGrid == null && vuccGrids != "")
          {
            finalVucc = vuccGrids.split(",");
            finalGrid = finalVucc[0];
            finalVucc.shift();
          }

          if (finalVucc.length > 0)  qso.vucc_grids = [ ...finalVucc ];

          if (finalGrid)
          {
            qso.grid = finalGrid;
            qso.grid4 = finalGrid.substring(0, 4);
          }
  
          let finalRSTsent = (object.RSTS || null);
          if (finalRSTsent) qso.RSTsent = finalRSTsent;

          let finalRSTrecv = (object.RSTR || null);
          if (finalRSTrecv) qso.RSTrecv = finalRSTrecv;

          let finalBand = (object.BAND || "").toLowerCase();
          // Check mapping
          if (finalBand in GT.acLogBandMap)
          {
            finalBand = GT.acLogBandMap[finalBand];
          }
          if (finalBand == "") finalBand = formatBand(Number(object.FREQUENCY || 0));

          qso.band = finalBand;

          let finalPropMode = (object.PROPMODE || null);
          if (finalPropMode) qso.propMode = finalPropMode.toUpperCase();

          let finalCont = (object.CONTINENT || null);
          if (finalCont && finalCont in GT.wacZones)  qso.cont = finalCont.toUpperCase();

          let finalDxcc = 0;
          if (object.FLDCOUNTRYDXCC)
          {
            finalDxcc = parseInt(object.FLDCOUNTRYDXCC);
            if (finalDxcc == 0)  finalDxcc = parseInt(callsignToDxcc(finalDXcall));
            if (!(finalDxcc in GT.dxccInfo)) finalDxcc = parseInt(callsignToDxcc(finalDXcall));
            qso.dxcc = finalDxcc
          }

          let finalCnty = (object.COUNTYR || null);
          // GT references internally with NO spaces, this is important 
          if (finalCnty) qso.cnty = finalCnty.toUpperCase().replaceAll(" ", "");

          let finalState = (object.STATE || null);
          if (finalState && qso.cnty) qso.cnty = finalState + "," + qso.cnty;
          if (finalState && finalDxcc > 0) finalState = GT.dxccToCountryCode[finalDxcc] + "-" + finalState.toUpperCase();
          if (finalState) qso.state = finalState;

          qso.mode = (object.MODE || "").toUpperCase();

          let finalMsg = (object.COMMENTS || null);
          if (finalMsg) 
          {
            finalMsg = finalMsg.trim();
            if (finalMsg.length > 40) finalMsg = finalMsg.substring(0, 40) + "...";
            if (finalMsg.length > 0) qso.msg = finalMsg;
          }

          let finalCqZone = (object.CQZONE || "");
          if (finalCqZone.length == 1) finalCqZone = "0" + finalCqZone;
          finalCqZone = String(finalCqZone);
          if (finalCqZone in GT.cqZones) qso.cqz = finalCqZone;

          let finalItuZone = (object.ITUZ || "");
          if (finalItuZone.length == 1) finalItuZone = "0" + finalItuZone;
          finalItuZone = String(finalItuZone);
          if (finalItuZone in GT.ituZones) qso.ituz = finalItuZone;
          
          let finalIOTA = (object.IOTA || null);
          if (finalIOTA) qso.IOTA = finalIOTA.toUpperCase();

          let genericConfirmed = (object.FLDQSLR || "").toUpperCase();
          if (genericConfirmed == "Y" || genericConfirmed == "V")
          {
            if (GT.aclSettings.qsl != "A")
            {
              let confby = (object.QSLCONFBYR || null);
              if (confby && confby.indexOf(GT.aclSettings.qsl) != -1)
              {
                confirmed = true;
                confSource = "A";
              }
            }
            else
            {
              confirmed = true;
              confSource = "A";
            }
          }

          qso.confirmed = confirmed;
          if (confSource) { qso.confSrcs = {}; qso.confSrcs[confSource] = true; }

          qso.digital = false;
          if (qso.mode in GT.modes) qso.digital = GT.modes[qso.mode];
          qso.phone = false;
          if (qso.mode in GT.modes_phone) qso.phone = GT.modes_phone[qso.mode];

          let finalPOTA = (object.POTA_REF || null);
          if (finalPOTA) 
          {
            qso.pota = finalPOTA.toUpperCase();
          }
          else if (object.SIG && object.SIG.toUpperCase() == "POTA" && object.SIG_INFO && object.SIG_INFO.length > 2)
          {
            qso.pota = object.SIG_INFO.toUpperCase();
          }
        
          lastHash = addQSO(qso);
          rows++;
        }
        else
        {
          break; // we're done
        }
      }
    }

    returnTask.type = "parsedAcLog";
    returnTask.QSOhash = GT.QSOhash;
    returnTask.myQsoCalls = GT.myQsoCalls;
    returnTask.myQsoGrids = GT.myQsoGrids;
    returnTask.rowsFiltered = rowsFiltered;
    returnTask.nextFunc = task.nextFunc;
  }
  catch(e)
  {
    console.error(e);
    // something when horribly wrong, let's tell the boss
    returnTask.type = "exception";
    returnTask.nextFunc = task.nextFunc;
  }
  postMessage(returnTask);
}
