// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.
const { webUtils } = require('electron');

GT.confSrcNames = {
  C: "Clublog",
  e: "eQSL",
  L: "LoTW",
  A: "N3FJP",
  Q: "QRZ.com",
  O: "Other"
};

GT.adifLogCount = 0;

GT.adifWorkerCallbacks = {
  loaded: initAdifComplete,
  parsed: adifParseComplete,
  parsedLive: adifParseLiveComplete,
  parsedAcLog: aclogParseComplete,
  filteredLive: adifFilteredLiveComplete,
  exception: exceptionComplete,
  cleared: clearComplete
};

GT.adifWorker = new Worker("./lib/adifWorker.js");

GT.adifWorker.onmessage = function(event)
{
  if ("type" in event.data)
  {
    if (event.data.type in GT.adifWorkerCallbacks)
    {
      GT.adifWorkerCallbacks[event.data.type](event.data);
    }
    else console.error("adifWorkerCallback: unknown event type : " + event.data.type);
  }
  else console.error("adifWorkerCallback: no event type");
};

function initAdifWorker()
{
  let task = {};
  task.type = "init";
  task.dxccInfo = GT.dxccInfo;
  task.dxccToCountryCode = GT.dxccToCountryCode;
  task.directCallToDXCC = GT.directCallToDXCC;
  task.directCallToITUzone = GT.directCallToITUzone;
  task.directCallToCQzone = GT.directCallToCQzone;
  task.prefixToITUzone = GT.prefixToITUzone;
  task.prefixToCQzone = GT.prefixToCQzone;
  task.prefixToDXCC = GT.prefixToDXCC;
  task.gridToState = GT.gridToState;
  task.cqZones = GT.cqZones;
  task.ituZones = GT.ituZones;
  task.wacZones = GT.wacZones;
  task.modes = GT.modes;
  task.modes_phone = GT.modes_phone;
  task.QSOhash = GT.QSOhash;
  GT.adifWorker.postMessage(task);
}

function initAdifComplete()
{
  // console.error("Adif Worker Initialized");
}

function clearAdifWorkerQSO(clearFiles, nextFunc = null)
{
  let task = {};
  task.type = "clear";
  task.clearFiles = clearFiles;
  task.nextFunc = nextFunc;
  GT.adifWorker.postMessage(task);
}

function clearComplete(task)
{
  clearQSOcallback(task.clearFiles, task.nextFunc);
}

function onAdiLoadComplete(rawAdiBuffer, nextFunc = null, liveLog = false)
{
  clearOrLoadButton.style.display = "none";
  busyDiv.style.display = "block";

  let task = {};
  task.type = "parse";
  task.appSettings = GT.settings.app;

  task.lotw_qsl = GT.settings.adifLog.lastFetch.lotw_qsl;
  task.liveLog = liveLog;

  task.nextFunc = nextFunc;

  if (typeof rawAdiBuffer == "object")
  {
    console.error("ADIF buffer is an object!");
    return;
  }
  else task.rawAdiBuffer = rawAdiBuffer;

  GT.adifLogCount++;
  GT.adifWorker.postMessage(task);

  rawAdiBuffer = null;

  GT.fileSelector.setAttribute("type", "");
  GT.fileSelector.setAttribute("type", "file");
  GT.fileSelector.setAttribute("accept", ".adi, .adif");
  GT.fileSelector.value = null;
}

function tryNextTask(task)
{
  if (task.nextFunc != null)
  {
    if (typeof window[task.nextFunc] == "function")
    {
      window[task.nextFunc]();
    }
    else
    {
      console.error("tryNextTask: nextFunc not a function: " + task.nextFunc);
    }
  }
}

function adifParseLiveComplete(task)
{
  GT.adifLogCount--;
  GT.QSOhash[task.hash] = task.details;

  trackQSO(GT.QSOhash[task.hash], GT.currentYear, GT.currentDay, timeNowSec());
  applyQSOs(null);

  tryNextTask(task);
}

function adifFilteredLiveComplete(task)
{
  GT.adifLogCount--;
  GT.rowsFiltered += task.rowsFiltered;

  tryNextTask(task);
}

function exceptionComplete(task)
{
  GT.adifLogCount--;
  console.error("Expection loading last log");

  tryNextTask(task);
}

function setQsoFound()
{
  qsoGridsFound.title = "Found: " + Object.keys(GT.myQsoGrids).join(",");
  qsoCallsignsFound.title = "Found: " + Object.keys(GT.myQsoCalls).join(",");
}

function adifParseComplete(task)
{
  GT.adifLogCount--;
  GT.QSOhash = task.QSOhash;
  GT.rowsFiltered += task.rowsFiltered;

  GT.myQsoCalls = { ...GT.myQsoCalls, ...task.myQsoCalls };
  GT.myQsoGrids = { ...GT.myQsoGrids, ...task.myQsoGrids };

  if (task.lotwTimestampUpdated == true)
  {
    GT.settings.adifLog.lastFetch.lotw_qsl = parseInt(Math.max(task.lotw_qsl, GT.settings.adifLog.lastFetch.lotw_qsl));
  }

  stateCheck();
  refreshQSOs();

  setQsoFound();

  tryNextTask(task);
}

function aclogParseComplete(task)
{
  GT.adifLogCount--;
  GT.QSOhash = task.QSOhash;
  GT.rowsFiltered += task.rowsFiltered;

  GT.myQsoCalls = { ...GT.myQsoCalls, ...task.myQsoCalls };
  GT.myQsoGrids = { ...GT.myQsoGrids, ...task.myQsoGrids };

  stateCheck();
  refreshQSOs();

  setQsoFound();

  tryNextTask(task);
}

function clubLogCallback(buffer, flag, cookie)
{
  let rawAdiBuffer = String(buffer);
  if (rawAdiBuffer.indexOf("Invalid login") > -1)
  {
    if (flag) clubTestResult.innerHTML = "Invalid";
  }
  else if (buffer == null)
  {
    if (flag) clubTestResult.innerHTML = "Unknown Error";
  }
  else
  {
    if (flag) clubTestResult.innerHTML = "Passed";
    else
    {
      tryToWriteAdifToDocFolder("clublog.adif", rawAdiBuffer);

      onAdiLoadComplete(rawAdiBuffer);
    }
  }
}

GT.isGettingClub = false;
function grabClubLog(test)
{
  if (fs.existsSync(GT.clublogLogFile) && getFilesizeInBytes(GT.clublogLogFile) > 0)
  {
    let buffer = fs.readFileSync(GT.clublogLogFile, "utf-8");
    if (buffer) onAdiLoadComplete(buffer);
  }

  if (GT.isGettingClub == false)
  {
    if (test) clubTestResult.innerHTML = "Testing";

    let postData = {
      email: clubEmail.value,
      password: clubPassword.value,
      call: clubCall.value
    };
    getAPostBuffer(
      "https://clublog.org/getadif.php",
      clubLogCallback,
      test,
      "https",
      443,
      postData,
      ClubLogImg,
      "GT.isGettingClub"
    );
  }
}

function tryToWriteAdifToDocFolder(filename, buffer, append = false)
{
  let finalFile = path.join(GT.appData, filename);
  try
  {
    if (append == false)
    {
      fs.writeFileSync(finalFile, buffer, { flush: true });
      return buffer;
    }
    else
    {
      fs.appendFileSync(finalFile, buffer, { flush: true });
      return buffer;
    }
  }
  catch (e)
  {
    return false;
  }
}

function addZero(i)
{
  if (i < 10)
  {
    i = "0" + i;
  }
  return i;
}

function getUTCStringForLoTW(d)
{
  let Y = d.getUTCFullYear();
  let M = addZero(d.getUTCMonth() + 1);
  let D = addZero(d.getUTCDate());
  let h = addZero(d.getUTCHours());
  let m = addZero(d.getUTCMinutes());
  let s = addZero(d.getUTCSeconds());
  return Y + "-" + M + "-" + D + " " + h + ":" + m + ":" + s;
}

function lotwCallback(buffer, flag, cookies, url)
{
  let rawAdiBuffer = String(buffer);
  if (rawAdiBuffer.indexOf("password incorrect") > -1)
  {
    if (flag)
    {
      lotwTestResult.innerHTML = "Invalid";
    }
  }
  else
  {
    if (flag)
    {
      lotwTestResult.innerHTML = "Passed";
    }
    else
    {
      let shouldAppend = true;
      let adiFileName = "LoTW_QSL.adif";
      let eorRegEx = new RegExp("<EOR>", "i");
  
      // don't write just an empty <EOH> only result
      if (rawAdiBuffer.search(eorRegEx) > 0)
      {
        rawAdiBuffer = tryToWriteAdifToDocFolder(adiFileName, rawAdiBuffer, shouldAppend);
      }

      onAdiLoadComplete(rawAdiBuffer);
    }
  }
}

function tryToDeleteLog(filename)
{
  let finalFile = path.join(GT.appData, filename);
  try
  {
    if (fs.existsSync(finalFile))
    {
      fs.unlinkSync(finalFile);
    }
  }
  catch (e) {}
}

GT.lotwCount = 0;

GT.isGettingLOTW = false;
GT.lotwTest = false;

function grabLOtWLog(test)
{
  let lastQSLDateString = "";

  if (test == true && GT.isGettingLOTW == false)
  {
    lotwTestResult.innerHTML = "Testing";
    lastQSLDateString = "&qso_qsosince=2100-01-01";

    // Fetch Test Results
    getABuffer(
      "https://lotw.arrl.org/lotwuser/lotwreport.adi?login=" +
      lotwLogin.value +
      "&password=" +
      encodeURIComponent(lotwPassword.value) +
      "&qso_query=1&qso_qsl=no&qso_qsldetail=yes&qso_withown=yes" +
      lastQSLDateString,
      lotwCallback,
      test,
      "https",
      443,
      lotwLogImg,
      "GT.isGettingLOTW",
      150000
    );
  }

  if (test == false)
  {
    loadLoTWLogFile();
  }
}


function grabLoTWQSL()
{
  let qsoDate = new Date(GT.settings.adifLog.lastFetch.lotw_qsl);
  let qsoDateAsString = getUTCStringForLoTW(qsoDate);

  // Don't grab if the last QSL was less than 5 minutes ago
  if (GT.isGettingLOTW == false)
  {
    lastQSLDateString = "&qso_qslsince=" + qsoDateAsString;
    getABuffer(
      "https://lotw.arrl.org/lotwuser/lotwreport.adi?login=" +
      lotwLogin.value +
      "&password=" +
      encodeURIComponent(lotwPassword.value) +
      ((GT.settings.app.workingGridEnable == true) ? "&qso_mydetail=yes" : "") +
      "&qso_query=1&qso_qsl=yes&qso_qsldetail=yes&qso_withown=yes" +
      lastQSLDateString,
      lotwCallback,
      false,
      "https",
      443,
      lotwLogImg,
      "GT.isGettingLOTW",
      120000
    );
  }
}

function qrzCallback(buffer, flag)
{
  if (buffer.indexOf("invalid api key") > -1)
  {
    if (flag) qrzTestResult.innerHTML = "Invalid";
  }
  else
  {
    if (flag)
    {
      qrzTestResult.innerHTML = "Passed";
    }
    else
    {
      let htmlString = buffer.toString().replace(/&lt;/g, "<").replace(/&gt;/g, ">");

      tryToWriteAdifToDocFolder("qrz.adif", htmlString);

      onAdiLoadComplete(htmlString);
    }
  }
}


function grabQrzComLog(test)
{
  if (fs.existsSync(GT.QrzLogFile) && getFilesizeInBytes(GT.QrzLogFile) > 0)
  {
    let buffer = fs.readFileSync(GT.QrzLogFile, "utf-8");
    if (buffer) onAdiLoadComplete(buffer);
  }


  let action = "FETCH";
  if (test)
  {
    qrzTestResult.innerHTML = "Testing";
    action = "STATUS";
  }

  getABuffer(
    "https://logbook.qrz.com/api?KEY=" +
      qrzApiKey.value +
      "&ACTION=" +
      action,
    qrzCallback,
    test,
    "https",
    443,
    qrzLogImg,
    "GT.isGettingQRZCom",
    null
  );
}

function ValidateQrzApi(inputText)
{
  inputText.value = inputText.value.toUpperCase().trim();
  if (inputText.value.length == 19)
  {
    let passed = false;
    let dashcount = 0;
    for (let i = 0; i < inputText.value.length; i++)
    {
      if (inputText.value[i] == "-") dashcount++;
    }
    if (dashcount == 3)
    {
      passed = true;
    }
    if (passed)
    {
      inputText.style.color = "#FF0";
      inputText.style.backgroundColor = "darkblue";

      return true;
    }
    else
    {
      inputText.style.color = "white";
      inputText.style.backgroundColor = "rgb(199, 113, 0)";
      return false;
    }
  }
  else
  {
    inputText.style.color = "white";
    inputText.style.backgroundColor = "rgb(199, 113, 0)";

    return false;
  }
}

function ValidateText(inputText)
{
  if (inputText.value.length > 0)
  {
    inputText.style.color = "#FF0";
    inputText.style.backgroundColor = "darkblue";
    return true;
  }
  else
  {
    inputText.style.color = "white";
    inputText.style.backgroundColor = "rgb(199, 113, 0)";
    return false;
  }
}

function adifMenuCheckBoxChanged(what)
{
  GT.settings.adifLog.menu[what.id] = what.checked;
  let menuItem = what.id + "Div";
  if (what.checked == true)
  {
    document.getElementById(menuItem).style.display = "inline-block";
  }
  else
  {
    document.getElementById(menuItem).style.display = "none";
  }


  if (what == buttonAdifCheckBox) setAdifStartup(loadAdifCheckBox);
}

function adifStartupCheckBoxChanged(what)
{
  GT.settings.adifLog.startup[what.id] = what.checked;

  if (what == loadAdifCheckBox) setAdifStartup(loadAdifCheckBox);
}

function adifLogQsoCheckBoxChanged(what)
{
  GT.settings.adifLog.qsolog[what.id] = what.checked;
  if (what.id == "logLOTWqsoCheckBox")
  {
    if (what.checked == true)
    {
      lotwUpload.style.display = "inline-block";
      trustedTestButton.style.display = "inline-block";
    }
    else
    {
      lotwUpload.style.display = "none";
      trustedTestButton.style.display = "none";
    }
  }

}

function adifNicknameCheckBoxChanged(what)
{
  GT.settings.adifLog.nickname[what.id] = what.checked;
  if (what.id == "nicknameeQSLCheckBox")
  {
    if (what.checked == true)
    {
      eQSLNickname.style.display = "inline-block";
    }
    else
    {
      eQSLNickname.style.display = "none";
    }
  }
}

function adifTextValueChange(what)
{
  what.value = what.value.trim();
  GT.settings.adifLog.text[what.id] = what.value;
}

GT.fileSelector = document.createElement("input");
GT.fileSelector.setAttribute("type", "file");
GT.fileSelector.setAttribute("accept", ".adi, .adif");
GT.fileSelector.onchange = function ()
{
  if (this.files && this.files[0])
  {
    addLogToStartupList(this.files[0].name, webUtils.getPathForFile(this.files[0]));
  }
};

function ValidatePotentialAdifLogFileAgainstInternal(fullPath)
{
  // Is on disk
  if (!(fs.existsSync(fullPath))) return false;

  let dirname = path.dirname(fullPath);
  // Not in Ginternal
  if (dirname == GT.appData) return false;
  // Not in Backup Logs
  if (dirname == GT.qsoBackupDir) return false;

  return true;
}

function addLogToStartupList(name, path)
{
  loadAdifCheckBox.checked = true;
  adifStartupCheckBoxChanged(loadAdifCheckBox);
  
  for (const i in GT.settings.startupLogs)
  {
    if (path == GT.settings.startupLogs[i].file)
    {
      addLastTraffic("<font color='white'>Dupe</font> <font color='orange'>" + name + "</font>");
      return;
    }
  }
  if (ValidatePotentialAdifLogFileAgainstInternal(path) == false)
  {
    addLastTraffic("<font color='white'>Error Adding</font><br/><font color='orange'>" + name + "</font>");
    return;
  }

  let buffer = fs.readFileSync(path, "utf-8");
  if (buffer) onAdiLoadComplete(buffer);

  let newObject = Object();
  newObject.name = name;
  newObject.file = path;
  GT.settings.startupLogs.push(newObject);

  setAdifStartup(loadAdifCheckBox);

  addLastTraffic("<font color='white'>Added</font> <font color='cyan'>" + name + "</font>");
}

function adifLoadDialog()
{
  GT.fileSelector.click();
  return false;
}

function start_and_end(str)
{
  if (str.length > 31)
  {
    return (
      str.substr(0, 16) + " ... " + str.substr(str.length - 15, str.length)
    );
  }
  return str;
}

function setFileSelectors()
{
  selectTqsl = document.getElementById("selectTQSLButton");
  selectTqsl.onclick = function ()
  {
    GT.tqslFileSelector.click();
    return false;
  };
  lotwUpload.prepend(selectTqsl);
}

GT.tqslFileSelector = document.createElement("input");
GT.tqslFileSelector.setAttribute("type", "file");
GT.tqslFileSelector.setAttribute("accept", "*");
GT.tqslFileSelector.onchange = function ()
{
  if (this.files && this.files[0])
  {
    GT.settings.trustedQsl.binaryFile = webUtils.getPathForFile(this.files[0]);
    if (fs.existsSync(GT.settings.trustedQsl.binaryFile) &&
       (GT.settings.trustedQsl.binaryFile.endsWith("tqsl.exe") ||
        GT.settings.trustedQsl.binaryFile.endsWith("tqsl")))
    {
      GT.settings.trustedQsl.binaryFileValid = true;
    }
    else GT.settings.trustedQsl.binaryFileValid = false;

    if (GT.settings.trustedQsl.binaryFileValid == true)
    {
      tqslFileDiv.style.backgroundColor = "darkblue";
    }
    else
    {
      tqslFileDiv.style.backgroundColor = "rgb(199, 113, 0)";
    }

    tqslFileDiv.innerHTML = "<b>" + start_and_end(GT.settings.trustedQsl.binaryFile) + "</b>";
  }
};

function loadBackupLogFiles()
{
  try 
  {
    let logFiles = fs.readdirSync(GT.qsoBackupDir);

    logFiles.forEach((filename) =>
    {
      let buffer = fs.readFileSync(path.join(GT.qsoBackupDir, filename), "UTF-8");
      if (buffer) onAdiLoadComplete(buffer);
    });
  }
  catch (e)
  {
    console.error("Error trying to read directory: " + GT.qsoBackupDir);
  }
}

function getFilesizeInBytes(filename)
{
  let stats = fs.statSync(filename);
  let fileSizeInBytes = stats.size;
  return fileSizeInBytes;
}

function loadLoTWLogFile()
{
  GT.settings.adifLog.lastFetch.lotw_qsl = 0;

  if (fs.existsSync(GT.LoTWLogFile) && getFilesizeInBytes(GT.LoTWLogFile) > 0)
  {
    let buffer = fs.readFileSync(GT.LoTWLogFile, "utf-8");
    if (buffer) onAdiLoadComplete(buffer, "grabLoTWQSL");
  }
  else
  {
    grabLoTWQSL();
  }
}


function findTrustedQSLPaths()
{
  let base = null;

  if (GT.settings.trustedQsl.stationFileValid == true)
  {
    // double check the presence of the station_data;
    if (!fs.existsSync(GT.settings.trustedQsl.stationFile))
    {
      GT.settings.trustedQsl.stationFileValid = false;
    }
  }
  if (GT.settings.trustedQsl.stationFileValid == false)
  {
    if (GT.platform == "windows")
    {
      base = process.env.APPDATA + "\\TrustedQSL\\station_data";
      if (fs.existsSync(base))
      {
        GT.settings.trustedQsl.stationFile = base;
        GT.settings.trustedQsl.stationFileValid = true;
      }
      else
      {
        base = process.env.LOCALAPPDATA + "\\TrustedQSL\\station_data";
        if (fs.existsSync(base))
        {
          GT.settings.trustedQsl.stationFile = base;
          GT.settings.trustedQsl.stationFileValid = true;
        }
      }
    }
    else
    {
      base = process.env.HOME + "/.tqsl/station_data";
      if (fs.existsSync(base))
      {
        GT.settings.trustedQsl.stationFile = base;
        GT.settings.trustedQsl.stationFileValid = true;
      }
    }
  }
  if (GT.settings.trustedQsl.stationFileValid == true)
  {
    let validate = false;
    let option = document.createElement("option");
    option.value = "";
    option.text = "Select a Station";
    lotwStation.appendChild(option);

    let buffer = fs.readFileSync(GT.settings.trustedQsl.stationFile, "UTF-8");
    let parser = new DOMParser();
    let xmlDoc = parser.parseFromString(buffer, "text/xml");
    let x = xmlDoc.getElementsByTagName("StationData");
    for (let i = 0; i < x.length; i++)
    {
      option = document.createElement("option");
      option.value = x[i].getAttribute("name");
      option.text = x[i].getAttribute("name");
      if (option.value == GT.settings.adifLog.text.lotwStation)
      {
        option.selected = true;
        validate = true;
      }
      lotwStation.appendChild(option);
    }
    if (validate)
    {
      ValidateText(lotwStation);
    }
  }

  if (GT.settings.trustedQsl.binaryFileValid == true)
  {
    // double check the presence of the TrustedQSL binary;
    if (!fs.existsSync(GT.settings.trustedQsl.binaryFile))
    {
      GT.settings.trustedQsl.binaryFileValid = false;
    }
  }
  if (GT.settings.trustedQsl.binaryFileValid == false)
  {
    if (GT.platform == "windows")
    {
      base = process.env["ProgramFiles(x86)"] + "\\TrustedQSL\\tqsl.exe";
      if (fs.existsSync(base))
      {
        GT.settings.trustedQsl.binaryFile = base;
        GT.settings.trustedQsl.binaryFileValid = true;
      }
    }
    else if (GT.platform == "mac")
    {
      const testLocations = [
        "/Applications/TrustedQSL/tqsl.app/Contents/MacOS/tqsl",
        "/Applications/tqsl.app/Contents/MacOS/tqsl",
        process.env.HOME + "/Applications/TrustedQSL/tqsl.app/Contents/MacOS/tqsl",
        process.env.HOME + "/Applications/tqsl.app/Contents/MacOS/tqsl",
        process.env.HOME + "/Desktop/TrustedQSL/tqsl.app/Contents/MacOS/tqsl",
        process.env.HOME + "/Desktop/tqsl.app/Contents/MacOS/tqsl",
        process.env.HOME + "/Applications/Ham Radio/TrustedQSL/tqsl.app/Contents/MacOS/tqsl",
        process.env.HOME + "/Applications/Ham Radio/tqsl.app/Contents/MacOS/tqsl",
      ];

      for (const path of testLocations)
      {
        if (fs.existsSync(path))
        {
          GT.settings.trustedQsl.binaryFile = path;
          GT.settings.trustedQsl.binaryFileValid = true;
          break;
        }
       }
    }
    else if (GT.platform == "linux")
    {
      base = "/usr/bin/tqsl";
      if (fs.existsSync(base))
      {
        GT.settings.trustedQsl.binaryFile = base;
        GT.settings.trustedQsl.binaryFileValid = true;
      }
      else
      {
        base = "/usr/local/bin/tqsl";
        if (fs.existsSync(base))
        {
          GT.settings.trustedQsl.binaryFile = base;
          GT.settings.trustedQsl.binaryFileValid = true;
        }
      }
    }
  }
}

function startupAdifLoadFunction()
{
  for (let i in GT.settings.startupLogs)
  {
    try
    {
      if (ValidatePotentialAdifLogFileAgainstInternal(GT.settings.startupLogs[i].file))
      {
        let buffer = fs.readFileSync(GT.settings.startupLogs[i].file, "UTF-8");
        if (buffer) onAdiLoadComplete(buffer);
      }
    }
    catch (e) {}
  }
}

function setAdifStartup(checkbox)
{
  if (GT.settings.trustedQsl.binaryFile == null)
  { GT.settings.trustedQsl.binaryFile = ""; }

  if (
    GT.settings.trustedQsl.binaryFile.endsWith("tqsl.exe") ||
    GT.settings.trustedQsl.binaryFile.endsWith("tqsl")
  )
  {
    GT.settings.trustedQsl.binaryFileValid = true;
  }
  else GT.settings.trustedQsl.binaryFileValid = false;

  if (GT.settings.trustedQsl.binaryFileValid == true)
  {
    tqslFileDiv.style.backgroundColor = "darkblue";
  }
  else
  {
    tqslFileDiv.style.backgroundColor = "rgb(199, 113, 0)";
  }
  tqslFileDiv.innerHTML = "<b>" + start_and_end(GT.settings.trustedQsl.binaryFile) + "</b>";

  if (buttonAdifCheckBox.checked || loadAdifCheckBox.checked)
  {
    let html = [];
    if (GT.settings.startupLogs.length > 0)
    {
      html.push("<table class='darkTable'>");
      for (const i in GT.settings.startupLogs)
      {
        const appFile = GT.settings.startupLogs[i];
        let style = isInAppLog(appFile.file) ? "style='text-decoration: line-through red; text-decoration-thickness: 2px;'" : "";
        html.push("<tr title='" + appFile.file + "'>");
        html.push("<td " + style + ">" +  getParentFolderAndFilename(appFile.file) + "</td>");
        html.push("<td onclick='removeStartupLog(" + i + ")'><img src='img/trash_24x48.png' style='height:17px;margin:-1px;margin-bottom:-3px;padding:0px;cursor:pointer'></td></tr>");
      }
      html.push("</table>");
    }
    else
    {
      html = ["No file(s) selected"];
    }
    startupLogFileDiv.innerHTML = html.join("");
    selectFileOnStartupDiv.style.display = "block";
  }
  else
  {
    startupLogFileDiv.innerHTML = "No file(s) selected";
    selectFileOnStartupDiv.style.display = "none";
  }
}


GT.appLogsFileSelector = document.createElement("input");
GT.appLogsFileSelector.setAttribute("type", "file");
GT.appLogsFileSelector.setAttribute("accept", ".adi, .adif");
GT.appLogsFileSelector.value = null;
GT.appLogsFileSelector.onchange = function ()
{
  if (this.files && this.files[0])
  {
    let fullPath = webUtils.getPathForFile(this.files[0]);

    if (ValidatePotentialAdifLogFileAgainstInternal(fullPath))
    {
      appendAppLog(fullPath, true);
      updateAppLogsUI();

      let buffer = fs.readFileSync(fullPath, "UTF-8");
      if (buffer) onAdiLoadComplete(buffer);
    }
    else
    {
      addLastTraffic("<font color='white'>Error Adding</font><br/><font color='orange'>" + this.files[0].name + "</font>");
      return;
    }

    GT.appLogsFileSelector.setAttribute("type", "file");
    GT.appLogsFileSelector.setAttribute("accept", ".adi, .adif");
    GT.appLogsFileSelector.value = null;
  }
};

function isInAppLog(filepath)
{
  for (const appFile of GT.settings.appLogs)
  {
    if (appFile.file == filepath)
    {
      appFile.enabled = true;
      updateAppLogsUI();
      return true;
    }
  }
  return false;
}

const CONST_APP_LOG_REGEX = /^WSJT|^JTDX/
const CONST_ADIF_FILE_REGEX = /\.adi$|\.adif$/

function scanForAppLogs()
{
  let appBase = "";
  if (GT.platform == "windows")
  {
    let appData = electron.ipcRenderer.sendSync("getPath","appData");
    let basepath = path.basename(appData);
    if (basepath != "Local")
    {
      appData = appData.replace(basepath, "Local");
    }
    appBase = appData;
  }
  else if (GT.platform == "mac")
  {
    appBase = path.join(process.env.HOME, "Library/Application Support");
  }
  else
  {
    appBase = path.join(process.env.HOME, ".local/share");
  }
      
  try 
  {
    const directories = getDirectoriesSync(appBase).sort();
    for (const dir of directories)
    {
      if (path.basename(dir).toUpperCase().match(CONST_APP_LOG_REGEX))
      {
        const foundFiles = fs.readdirSync(dir).filter(file => { return path.extname(file).toLowerCase().match(CONST_ADIF_FILE_REGEX); });
        for (const file of foundFiles) appendAppLog(path.join(dir, file), false);
      }
    }
  }
  catch (err) 
  {
    console.error(err);
  }
}

function getDirectoriesSync(srcpath)
{
  return fs.readdirSync(srcpath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => path.join(srcpath, dirent.name));
}

function appendAppLog(filepath, forceEnable = false)
{
  let newLog = true;
  for (const appFile of GT.settings.appLogs)
  {
    if (appFile.file == filepath)
    {
      if (forceEnable) appFile.enabled = true;
      newLog = false;
      break;
    }
  }
  if (newLog)
  {
    GT.settings.appLogs.push({ enabled: true, file: filepath });
  }
}


function loadAppLogs()
{
  for (const appFile of GT.settings.appLogs)
  {
    if (appFile.enabled && fs.existsSync(appFile.file))
    {
      let buffer = fs.readFileSync(appFile.file, "UTF-8");
      if (buffer) onAdiLoadComplete(buffer);
    }
  }
}

function getParentFolderAndFilename(filepath)
{
  let pathParts = [];
  pathParts.push(path.basename(path.dirname(filepath)));
  pathParts.push(path.basename(filepath));
  return pathParts.join(' ' + path.sep + ' ');
}

function updateAppLogsUI()
{
  let html = [];
  if (GT.settings.appLogs.length > 0)
  {
    html.push("<table class='darkTable'><tr><th>" + I18N("settings.alerts.AudioAlert.Header.Enable") + "</th>");
    html.push("<th>" + I18N("settings.alerts.AudioAlert.Header.Value") + "</th></tr>");
    for (const i in GT.settings.appLogs)
    {
      const appFile = GT.settings.appLogs[i];
      html.push("<tr title='" + appFile.file + "'>");
      html.push("<td><input type='checkbox' " + (appFile.enabled ? "checked" : "") +  " onclick='toggleAppLog(" + i + ", this)' /></td>");
      html.push("<td >" +  getParentFolderAndFilename(appFile.file) + "</td>");
      html.push("<td onclick='removeAppLog(" + i + ")'><img src='img/trash_24x48.png' style='height:17px;margin:-1px;margin-bottom:-3px;padding:0px;cursor:pointer'></td></tr>");
    }
    html.push("</table>");
  }
  else
  {
    html = ["No file(s) selected"];
  }
  appLogsFilesDiv.innerHTML = html.join("");
}

function removeAppLog(i)
{
  if (i in GT.settings.appLogs)
  {
    GT.settings.appLogs.splice(i, 1);

    updateAppLogsUI();
  }
}

function toggleAppLog(i, checkbox)
{
  if (i in GT.settings.appLogs)
  {
    GT.settings.appLogs[i].enabled = checkbox.checked;
    if (GT.settings.appLogs[i].enabled)
    {
      let buffer = fs.readFileSync(GT.settings.appLogs[i].file, "UTF-8");
      if (buffer) onAdiLoadComplete(buffer);
    }
  }
}

function removeStartupLog(i)
{
  if (i in GT.settings.startupLogs)
  {
    GT.settings.startupLogs.splice(i, 1);

    setAdifStartup(loadAdifCheckBox);
  }
}

function startupAdifLoadCheck()
{
  logEventMedia.value = GT.settings.app.logEventMedia;
 
  loadAppLogs();

  if (loadGTCheckBox.checked == true) loadBackupLogFiles();

  if (loadAdifCheckBox.checked == true && GT.settings.startupLogs.length > 0) startupAdifLoadFunction();

  if (GT.settings.acLog.startup == true) grabAcLog();

  if (GT.settings.map.offlineMode == false)
  {
    if (loadClubCheckBox.checked == true) grabClubLog(false);

    if (loadQRZCheckBox.checked == true) grabQrzComLog(false);

    if (loadLOTWCheckBox.checked == true) grabLOtWLog(false);
  }
}

function getABuffer(file_url, callback, flag, mode, port, imgToGray, stringOfFlag, timeoutX) {
  const http = require(mode);
  const zlib = require('zlib');
  
  // Modern URL parsing (Replaces deprecated url.parse)
  const parsedUrl = new URL(file_url);
  
  let options = {
    hostname: parsedUrl.hostname,
    port: port || parsedUrl.port,
    path: parsedUrl.pathname + parsedUrl.search,
    method: "get",
    headers: {
      'Accept-Encoding': 'gzip'
    },
    timeout: timeoutX || 280000
  };

  function resetUI() {
    if (typeof stringOfFlag !== "undefined") {
      window[stringOfFlag] = false;
    }
    if (typeof imgToGray !== "undefined" && imgToGray.parentNode) {
      imgToGray.parentNode.style.animation = "";
      imgToGray.style.webkitFilter = "";
    }
  }

  // Set initial UI state
  if (typeof stringOfFlag !== "undefined") window[stringOfFlag] = true;
  if (typeof imgToGray !== "undefined" && imgToGray.parentNode) {
    imgToGray.parentNode.style.animation = "borderDash 750ms ease infinite";
    imgToGray.style.webkitFilter = "invert(100%)";
  }

  const req = http.request(options, function (res) {
    const encoding = res.headers['content-encoding'];
    let chunks = []; // Store chunks in an array (Much faster!)

    res.on("data", function (data) {
      // Just collect chunks, do NOT concat here
      chunks.push(data); 
    });

    res.on("end", function () {
      // Concat exactly once at the very end
      let fileBuffer = Buffer.concat(chunks);
      let error = null;

      if (encoding === 'gzip' || encoding === 'deflate') {
        try {
          fileBuffer = zlib.gunzipSync(fileBuffer);
        } catch (e) {
          console.error("Gzip decompression failed:", e);
          error = e;
          fileBuffer = null;
        }
      }

      resetUI();

      if (typeof callback === "function") {
        callback(fileBuffer, flag, error, file_url);
      }
    });

    res.on("error", function (err) {
      console.log("Response ERROR:", err);
      resetUI();
      if (typeof callback === "function") {
        callback(null, flag, err, file_url); // Don't leave caller hanging!
      }
    });
  });

  req.on("timeout", function () {
    req.destroy(); 
  });

  req.on("error", function (err) {
    console.log("Request ERROR:", err);
    resetUI();
    if (typeof callback === "function") {
      callback(null, flag, err, file_url); // Don't leave caller hanging!
    }
  });

  req.end();
}


function getAPostBuffer(file_url, callback, flag, mode, port, theData, imgToGray, stringOfFlag) {
  // querystring is deprecated in modern node, use URLSearchParams
  const postData = new URLSearchParams(theData).toString(); 
  const http = require(mode);
  
  const parsedUrl = new URL(file_url);

  let options = {
    hostname: parsedUrl.hostname,
    port: port || parsedUrl.port,
    path: parsedUrl.pathname + parsedUrl.search,
    method: "post",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(postData)
    },
    timeout: 280000 // Modern timeout
  };

  window[stringOfFlag] = true;
  if (typeof imgToGray != "undefined") {
    imgToGray.parentNode.style.animation = "borderDash 750ms ease infinite";
    imgToGray.style.webkitFilter = "invert(100%)";
  }

  let req = http.request(options, function (res) {
    let cookies = res.headers["set-cookie"] || null;
    let chunks = []; // Use the fast array-chunk method!

    res.on("data", function (data) {
        chunks.push(data);
    });
    
    res.on("end", function () {
        let fileBuffer = Buffer.concat(chunks);
        if (typeof callback == "function") {
          callback(fileBuffer, flag, cookies);
        }
        window[stringOfFlag] = false;
        if (typeof imgToGray != "undefined") {
          imgToGray.parentNode.style.animation = "";
          imgToGray.style.webkitFilter = "";
        }
    });
  });

  req.on("timeout", function () {
    req.destroy();
  });

  req.on("error", function (err) {
    window[stringOfFlag] = false;
    if (typeof imgToGray != "undefined") {
      imgToGray.parentNode.style.animation = "";
      imgToGray.style.webkitFilter = "";
    }
    // ensure callback fires so app doesn't hang!
    if (typeof callback == "function") callback(null, flag, null);
  });

  req.write(postData);
  req.end();
}


function sendUdpMessage(msg, length, port, address)
{
  const dgram = require("dgram");
  let socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  socket.send(msg, 0, length, port, address, (err) => // eslint-disable-line node/handle-callback-err
  {
    socket.close();
  });
}

function sendTcpMessage(msg, length, port, address)
{
  const net = require("net");
  let client = new net.Socket();
  client.setTimeout(30000);
  
  // MUST HAVE THIS to prevent app crashes when external loggers are closed/unreachable!
  client.on("error", function (err) {
    console.error("TCP Logger Connection Error:", err.message);
    client.destroy();
  });

  client.connect(port, address, function ()
  {
    client.write(Buffer.from(msg, "utf-8"));
  });

  client.on("close", function () {});

  client.on("end", function () {
  });

  client.on("timeout", function () {
    client.end();
  });
}


function valueToAdiField(field, value)
{
  let adi = "<" + field + ":";
  adi += String(value).length + ">";
  adi += String(value) + " ";
  return adi;
}

function pad(value)
{
  return String(value).padStart(2, "0");
}

function HMSfromMilli(milli)
{
  let seconds = parseInt(milli / 1000);
  let days = Math.floor(seconds / (3600 * 24));
  seconds -= days * 3600 * 24;
  let hrs = Math.floor(seconds / 3600);
  seconds -= hrs * 3600;
  let mnts = Math.floor(seconds / 60);
  seconds -= mnts * 60;

  return (pad(hrs) + pad(mnts) + pad(seconds));
}

function convertToDate(julian)
{
  let DAY = 86400000;
  let HALF_DAY = DAY / 2;
  let UNIX_EPOCH_JULIAN_DATE = 2440587.5;
  let UNIX_EPOCH_JULIAN_DAY = 2440587;
  return new Date((Number(julian) - UNIX_EPOCH_JULIAN_DATE) * DAY);
}

const CLk = "25bc718451a71954cb6d0d1b50541dd45d4ba148";

GT.lastReport = "";

GT.oldStyleLogMessage = null;

function oldSendToLogger()
{
  let newMessage = Object.assign({}, GT.oldStyleLogMessage);

  let band = formatBand(Number(newMessage.Frequency / 1000000));

  if (newMessage.DXGrid.length == 0 && newMessage.DXCall + band + newMessage.MO in GT.liveCallsigns)
  {
    newMessage.DXGrid = GT.liveCallsigns[newMessage.DXCall + band + newMessage.MO].grid.substr(0, 4);
  }

  let report = "<EOH>";

  report += valueToAdiField("BAND", formatBand(Number(newMessage.Frequency / 1000000)));
  report += valueToAdiField("CALL", newMessage.DXCall.toUpperCase());
  report += valueToAdiField("FREQ", Number(newMessage.Frequency / 1000000).toFixed(6));
  report += valueToAdiField("MODE", newMessage.MO.toUpperCase());
  let date = convertToDate(parseInt(newMessage.DateOn));
  let dataString =
    date.getUTCFullYear() +
    ("0" + (date.getUTCMonth() + 1)).slice(-2) +
    ("0" + date.getUTCDate()).slice(-2);
  report += valueToAdiField("QSO_DATE", dataString);
  report += valueToAdiField("TIME_ON", HMSfromMilli(newMessage.TimeOn));

  date = convertToDate(parseInt(newMessage.DateOff));
  dataString =
    date.getUTCFullYear() +
    ("0" + (date.getUTCMonth() + 1)).slice(-2) +
    ("0" + date.getUTCDate()).slice(-2);
  report += valueToAdiField("QSO_DATE_OFF", dataString);
  report += valueToAdiField("TIME_OFF", HMSfromMilli(newMessage.TimeOff));

  report += valueToAdiField("RST_RCVD", newMessage.ReportRecieved);
  report += valueToAdiField("RST_SENT", newMessage.ReportSend);
  if ("TXPower" in newMessage)
  {
    let power = parseInt(newMessage.TXPower);
    if (!isNaN(power))
    {
      report += valueToAdiField("TX_PWR", power);
    }
  }
  report += valueToAdiField("GRIDSQUARE", newMessage.DXGrid);

  if (newMessage.Comments.length > 0)
  { report += valueToAdiField("COMMENT", newMessage.Comments); }

  if (newMessage.Name.length > 0)
  { report += valueToAdiField("NAME", newMessage.Name); }

  if (newMessage.Operatorcall.length > 0)
  {
    report += valueToAdiField("OPERATOR", newMessage.Operatorcall);
  }

  if (newMessage.Mycall.length > 0)
  {
    report += valueToAdiField("STATION_CALLSIGN", newMessage.Mycall);
  }
  else if (GT.settings.app.myCall != "NOCALL" && GT.settings.app.myCall.length > 0)
  { report += valueToAdiField("STATION_CALLSIGN", GT.settings.app.myCall); }

  if (newMessage.Mygrid.length > 0)
  {
    report += valueToAdiField("MY_GRIDSQUARE", newMessage.Mygrid);
  }
  else if (GT.settings.app.myGrid.length > 1)
  {
    report += valueToAdiField("MY_GRIDSQUARE", GT.settings.app.myGrid);
  }

  report += "<EOR>";

  sendToLogger(report);
}

GT.adifLookupMap = {
  name: "NAME",
  iota: "IOTA",
  sota: "SOTA_REF",
  continent: "CONT",
  cqzone: "CQZ",
  ituzone: "ITUZ",
  email: "EMAIL",
  state: "STATE",
  county: "CNTY"
};

GT.lastADIFrx = "";

function sendToLogger(ADIF)
{
  let regex = new RegExp("<EOH>", "i");
  let message = ADIF.split(regex)[1].trim();

  // is it a dupe?
  if (message == GT.lastADIFrx) return;

  GT.lastADIFrx = message;

  let record = parseADIFRecord(message);
  if (!("MODE" in record) || !("CALL" in record) || !("BAND" in record)) 
  {
    console.error("Invalid ADIF Record");
    console.error(message);
    return;
  }

  let localMode = record.MODE;

  if (localMode == "MFSK" && "SUBMODE" in record)
  {
    localMode = record.SUBMODE;
  }

  // Fixed for MSHV
  record.BAND = record.BAND.toLowerCase();

  let localHash = record.CALL + record.BAND + localMode;
  if ((!("GRIDSQUARE" in record) || record.GRIDSQUARE.length == 0) && localHash in GT.liveCallsigns)
  {
    record.GRIDSQUARE = GT.liveCallsigns[localHash].grid.substr(0, 4);
  }

  if (GT.settings.app.potaFeatureEnabled && localHash in GT.liveCallsigns && GT.liveCallsigns[localHash].pota)
  {
    if (GT.liveCallsigns[localHash].pota != "?-????")
    {
      record.POTA_REF = GT.liveCallsigns[localHash].pota;
    }
  }

  if ("TX_PWR" in record)
  {
    record.TX_PWR = parseInt(record.TX_PWR);
    if (isNaN(record.TX_PWR))
    {
      delete record.TX_PWR;
    }
    else
    {
      record.TX_PWR = String(record.TX_PWR);
    }
  }

  if ((!("STATION_CALLSIGN" in record) || record.STATION_CALLSIGN.length == 0) && GT.settings.app.myCall != "NOCALL" && GT.settings.app.myCall.length > 0)
  {
    record.STATION_CALLSIGN = GT.settings.app.myCall;
  }

  if ((!("MY_GRIDSQUARE" in record) || record.MY_GRIDSQUARE.length == 0) && GT.settings.app.myGrid.length > 1)
  {
    record.MY_GRIDSQUARE = GT.settings.app.myGrid;
  }

  if (!("DXCC" in record))
  {
    let dxcc = callsignToDxcc(record.CALL);
    if (dxcc == -1) dxcc = 0;
    record.DXCC = String(dxcc);
  }

  // Tag: This is going to bite us in the butt later, but leaving it alone.
  if (!("COUNTRY" in record) && Number(record.DXCC) > 0)
  {
    record.COUNTRY = GT.dxccToADIFName[Number(record.DXCC)];
  }

  if (GT.settings.app.lookupMerge == true && record.CALL in GT.lookupCache)
  {
    let lookup = GT.lookupCache[record.CALL];
    for (const key in lookup)
    {
      if (key in GT.adifLookupMap)
      {
        record[GT.adifLookupMap[key]] = lookup[key];
      }
    }
    if ("GRIDSQUARE" in record && "grid" in lookup)
    {
      if (record.GRIDSQUARE.substr(0, 4) == lookup.grid.substr(0, 4))
      {
        record.GRIDSQUARE = lookup.grid;
      }
    }
    if (GT.settings.app.lookupMissingGrid && "grid" in lookup && (!("GRIDSQUARE" in record) || record.GRIDSQUARE.length == 0))
    {
      record.GRIDSQUARE = lookup.grid;
    }
  }

  finishSendingReport(record);
}

function finishSendingReport(record)
{
  let report = "";
  for (const key in record)
  {
    // Strip any null, those with unicode or empty
    if (record[key] == null || record[key].length != Buffer.byteLength(record[key]) || record[key].length == 0)
    {
      delete record[key];
      continue;
    }
    report += "<" + key + ":" + record[key].length + ">" + record[key] + " ";
  }
  report += "<EOR>";

  let reportNoStateNoCnty = "";
  for (const key in record)
  {
    if (key != "STATE" && key != "CNTY")
    {
      reportNoStateNoCnty += "<" + key + ":" + record[key].length + ">" + record[key] + " ";
    }
  }
  reportNoStateNoCnty += "<EOR>";
  
  let callsignFile = "";
  if ("STATION_CALLSIGN" in record)
  {
    callsignFile = record["STATION_CALLSIGN"].replaceAll("/","_");
  }
  
  let gridFile = "";
  if ("MY_GRIDSQUARE" in record)
  {
    gridFile = record["MY_GRIDSQUARE"].substring(0,4);
  }

  // Full record dupe check
  if (report != GT.lastReport)
  {
    GT.lastReport = report;

    addLastTraffic("<font style='color:#FFA500'>▲ </font><font style='color:#0FF'> New QSO </font><font style='color:#FF0'>" + record.CALL + "</font><font style='color:#FFA500'> ▲</font>");
    
    if (GT.settings.app.potaFeatureEnabled && "POTA_REF" in record)
    {
      reportPotaQSO(record);
      addLastTraffic("<font style='color:white'>Spotted to POTA</font>");
    }

    if (GT.settings.N1MM.enable == true && GT.settings.N1MM.port > 1024 && GT.settings.N1MM.ip.length > 4)
    {
      sendUdpMessage(
        report,
        report.length,
        parseInt(GT.settings.N1MM.port),
        GT.settings.N1MM.ip
      );
      addLastTraffic("<font style='color:white'>Logged to N1MM</font>");
    }

    if (GT.settings.log4OM.enable == true && GT.settings.log4OM.port > 1024 && GT.settings.log4OM.ip.length > 4)
    {
      sendUdpMessage(
        "ADD " + report,
        report.length + 4,
        parseInt(GT.settings.log4OM.port),
        GT.settings.log4OM.ip
      );
      addLastTraffic("<font style='color:white'>Logged to Log4OM</font>");
    }

    try
    {
      onAdiLoadComplete(report, null, true);
    }
    catch (e)
    {
      addLastTraffic("<font style='color:red'>Exception Internal Log</font>");
    }
    try
    {
      // Log worthy
      if (logGTqsoCheckBox.checked == true)
      {
        let logNameArray = ["GridTracker2"];
        if (callsignFile.length > 0)
        {
          logNameArray.push(callsignFile);
        }
        if (gridFile.length > 0)
        {
          logNameArray.push(gridFile);
        }
        let filename = logNameArray.join("_") + ".adif";
        let fullPath = path.join(GT.qsoBackupDir, filename);

        if (!fs.existsSync(fullPath))
        {
          fs.writeFileSync(fullPath, backupAdifHeader);
        }

        fs.appendFileSync(fullPath, report + "\r\n", { flush: true });
        addLastTraffic("<font style='color:white'>Logged to Backup</font>");
      }
    }
    catch (e)
    {
      addLastTraffic("<font style='color:red'>Exception GridTracker backup</font>");
      console.error(e);
    }

    try
    {
      sendQrzLogEntry(reportNoStateNoCnty);
    }
    catch (e)
    {
      addLastTraffic("<font style='color:red'>Exception QRZ Log</font>");
      console.error(e);
    }

    try
    {
      sendClubLogEntry(report);
    }
    catch (e)
    {
      addLastTraffic("<font style='color:red'>Exception ClubLog Log</font>");
      console.error(e);
    }

    try
    {
      sendHrdLogEntry(report);
    }
    catch (e)
    {
      addLastTraffic("<font style='color:red'>Exception HrdLog.net Log</font>");
      console.error(e);
    }

    try
    {
      sendCloudlogEntry(report);
    }
    catch (e)
    {
      addLastTraffic("<font style='color:red'>Exception Cloudlog Log</font>");
      console.error(e);
    }

    if (GT.settings.acLog.enable == true && GT.settings.acLog.port > 0 && GT.settings.acLog.ip.length > 4)
    {
      try
      {
        sendACLogMessage(record, GT.settings.acLog.port, GT.settings.acLog.ip);
        addLastTraffic("<font style='color:white'>Logged to N3FJP</font>");
      }
      catch (e)
      {
        addLastTraffic("<font style='color:red'>Exception N3FJP Log</font>");
        console.error(e);
      }
    }

    if (GT.settings.dxkLog.enable == true && GT.settings.dxkLog.port > 0 && GT.settings.dxkLog.ip.length > 4)
    {
      try
      {
        let DXreport = "";
        for (const key in record)
        {
          if ("MY_GRIDSQUARE" in record)
          {
            record.MY_GRIDSQUARE = record.MY_GRIDSQUARE.substr(0, 6);
          }
          if ("GRIDSQUARE" in record)
          {
            record.GRIDSQUARE = record.GRIDSQUARE.substr(0, 6);
          }

          DXreport += "<" + key + ":" + record[key].length + ">" + record[key] + " ";
        }
        DXreport += "<EOR>";

        sendDXKeeperLogMessage(DXreport, GT.settings.dxkLog.port, GT.settings.dxkLog.ip);
        addLastTraffic("<font style='color:white'>Logged to DXKeeper</font>");
      }
      catch (e)
      {
        addLastTraffic("<font style='color:red'>Exception DXKeeper Log</font>");
        console.error(e);
      }
    }

    if (GT.settings.HRDLogbookLog.enable == true && GT.settings.HRDLogbookLog.port > 0 && GT.settings.HRDLogbookLog.ip.length > 4)
    {
      try
      {
        sendHRDLogbookEntry(record, GT.settings.HRDLogbookLog.port, GT.settings.HRDLogbookLog.ip);
        addLastTraffic("<font style='color:white'>Logged to HRD Logbook</font>");
      }
      catch (e)
      {
        addLastTraffic("<font style='color:red'>Exception HRD Log</font>");
        console.error(e);
      }
    }

    try
    {
      sendLotwLogEntry(report, callsignFile, gridFile);
    }
    catch (e)
    {
      addLastTraffic("<font style='color:red'>Exception LoTW Log</font>");
      console.error(e);
    }

    try
    {
      sendHamCQEntry(report);
    }
    catch (e)
    {
      addLastTraffic("<font style='color:red'>Exception HamCQ Log</font>");
      console.error(e);
    }

    if (logeQSLQSOCheckBox.checked == true && (nicknameeQSLCheckBox.checked == false || (nicknameeQSLCheckBox.checked == true && eQSLNickname.value.trim().length > 0)))
    {
      if (nicknameeQSLCheckBox.checked == true)
      {
        record.APP_EQSL_QTH_NICKNAME = eQSLNickname.value.trim();
      }
      let eQSLreport = "";
      for (let key in record)
      {
        eQSLreport += "<" + key + ":" + record[key].length + ">" + record[key] + " ";
      }
      eQSLreport += "<EOR>";

      try
      {
        sendeQSLEntry(eQSLreport);
      }
      catch (e)
      {
        addLastTraffic("<font style='color:red'>Exception eQSL Log</font>");
        console.error(e);
      }
    }

    try
    {
      alertLogMessage();
    }
    catch (e)
    {
      addLastTraffic("<font style='color:red'>Exception Alert Log</font>");
      console.error(e);
    }

    if (lookupCloseLog.checked == true)
    {
      try
      {
        openLookupWindow(false);
      }
      catch (e)
      {
        addLastTraffic("<font style='color:red'>Exception Hide Lookup</font>");
        console.error(e);
      }
    }
  }
}

function alertLogMessage()
{
  if (logEventMedia.value != "none")
  {
    playAlertMediaFile(logEventMedia.value);
  }
}

function eqslCallback(buffer, flag)
{
  let result = String(buffer);
  if (flag)
  {
    if (result.indexOf("No such Username/Password found") != -1)
    {
      eQSLTestResult.innerHTML = "Bad<br>Password<br>or<br>Nickname";
      logeQSLQSOCheckBox.checked = false;
      adifLogQsoCheckBoxChanged(logeQSLQSOCheckBox);
    }
    else if (result.indexOf("No such Callsign found") != -1)
    {
      eQSLTestResult.innerHTML = "Unknown<br>Callsign";
      logeQSLQSOCheckBox.checked = false;
      adifLogQsoCheckBoxChanged(logeQSLQSOCheckBox);
    }
    else if (result.indexOf("Your ADIF log file has been built") > -1 || result.indexOf("You have no log entries") > -1)
    {
      eQSLTestResult.innerHTML = "Passed";
    }
    else if (result.indexOf("specify the desired User by using the QTHNickname") != -1)
    {
      eQSLTestResult.innerHTML = "QTH Nickname<br>Needed";
    }
    else
    {
      eQSLTestResult.innerHTML = "Unknown<br>Error";
      logeQSLQSOCheckBox.checked = false;
      adifLogQsoCheckBoxChanged(logeQSLQSOCheckBox);
    }
  }
  else
  {
    if (result.indexOf("Error: No match on eQSL_User/eQSL_Pswd") != -1)
    {
      addLastTraffic(
        "<font style='color:red'>Fail log eQSL.cc (credentials)</font>"
      );
    }
    if (
      result.indexOf("specify the desired User by using the QTHNickname") != -1
    )
    {
      addLastTraffic(
        "<font style='color:red'>Fail log eQSL.cc (nickname)</font>"
      );
    }
    else if (result.indexOf("Result: 0 out of 1 records") != -1)
    {
      addLastTraffic("<font style='color:red'>Fail log eQSL.cc (dupe)</font>");
    }
    else if (result.indexOf("Result: 1 out of 1 records added") != -1)
    {
      addLastTraffic("<font style='color:white'>Logged to eQSL.cc</font>");
    }
    else
    {
      addLastTraffic("<font style='color:red'>Fail log eQSL.cc (?)</font>");
    }
  }
}

function eQSLTest(test)
{
  if (GT.settings.map.offlineMode == true) return;

  eQSLTestResult.innerHTML = "Testing";

  let fUrl =
    "https://www.eQSL.cc/qslcard/DownloadInBox.cfm?UserName=" +
    encodeURIComponent(eQSLUser.value) +
    "&Password=" +
    encodeURIComponent(eQSLPassword.value) +
    "&RcvdSince=2020101";

  if (nicknameeQSLCheckBox.checked == true)
  { fUrl += "&QTHNickname=" + encodeURIComponent(eQSLNickname.value); }
  getABuffer(fUrl, eqslCallback, true, "https", 443);
}

function sendeQSLEntry(report)
{
  if (GT.settings.map.offlineMode == true) return;

  let pid = "GridTracker";
  let pver = String(gtVersion);
  let header = "<PROGRAMID:" + pid.length + ">" + pid + "\r\n";
  header += "<PROGRAMVERSION:" + pver.length + ">" + pver + "\r\n";
  header += "<EOH>\r\n";
  let eReport = encodeURIComponent(header + report);
  let fUrl =
    "https://www.eQSL.cc/qslcard/importADIF.cfm?ADIFData=" +
    eReport +
    "&EQSL_USER=" +
    encodeURIComponent(eQSLUser.value) +
    "&EQSL_PSWD=" +
    encodeURIComponent(eQSLPassword.value);

  getABuffer(fUrl, eqslCallback, false, "https", 443);
}

function testTrustedQSL(test)
{
  if (GT.settings.map.offlineMode == true)
  {
    lotwTestResult.innerHTML = "Currently<br>offline";
    return;
  }

  if (logLOTWqsoCheckBox.checked == true && GT.settings.trustedQsl.binaryFileValid == true && GT.settings.trustedQsl.stationFileValid == true && lotwStation.value.length > 0)
  {
    lotwTestResult.innerHTML = "Testing Upload";

    const child_process = require("child_process");
    let options = Array();
    options.push("-q");
    options.push("-v");

    child_process.execFile(
      GT.settings.trustedQsl.binaryFile,
      options,
      (error, stdout, stderr) =>
      {
        if (error)
        {
          lotwTestResult.innerHTML = "Error encountered";
        }
        lotwTestResult.innerHTML = stderr;
      }
    );
  }
  else
  {
    let html = [];
    if (GT.settings.trustedQsl.binaryFileValid == false)
    { html.push("Invalid tqsl executable<br>"); }
    if (GT.settings.trustedQsl.stationFileValid == false)
    { html.push("Stations not found<br>"); }
    if (!ValidateText(lotwTrusted)) html.push("TQSL Password missing<br>");
    if (!ValidateText(lotwStation)) html.push("Select Station<br>");
    lotwTestResult.innerHTML = html.join();
  }
}


function sendLotwLogEntry(report, callsignFile, gridFile)
{
  if (GT.settings.map.offlineMode == true) return;

  if (
    logLOTWqsoCheckBox.checked == true &&
    GT.settings.trustedQsl.binaryFileValid == true &&
    GT.settings.trustedQsl.stationFileValid == true &&
    lotwStation.value.length > 0
  )
  {

    let logNameArray = ["LoTW_queue"];
    if (callsignFile.length > 0)
    {
      logNameArray.push(callsignFile);
    }
    if (gridFile.length > 0)
    {
      logNameArray.push(gridFile);
    }

    let filename = logNameArray.join("_") + ".adif";
    let fullPath = path.join(GT.tempPath, filename);

    try {
      if (fs.existsSync(path.join(GT.appData, filename))) 
      {
        fs.renameSync(path.join(GT.appData, filename), fullPath);
      }
    }
    catch (e)
    {
      console.log(`Error moving old lotw queue (${path.join(GT.appData, filename)}) to temp directory`);
      console.log("Suggest deleting the file");
    }
    
    if (!fs.existsSync(fullPath))
    {
      let header = "Generated " + userTimeString(null) + " for " + callsignFile.replaceAll('_','/') + "\r\n\r\n";
      let pid = "GridTracker";
      let pver = String(gtVersion);
      header += "<PROGRAMID:" + pid.length + ">" + pid + "\r\n";
      header += "<PROGRAMVERSION:" + pver.length + ">" + pver + "\r\n";
      header += "<EOH>\r\n";
      fs.writeFileSync(fullPath, header, { flush: true });
    }

    fs.appendFileSync(fullPath, report + "\r\n", { flush: true });

    const child_process = require("child_process");
    let options = Array();
    options.push("-a");
    options.push("all");
    options.push("-l");
    options.push(lotwStation.value);
    if (lotwTrusted.value.length > 0)
    {
      options.push("-p");
      options.push(lotwTrusted.value);
    }
    options.push("-q");
    options.push("-x");
    options.push("-d");
    options.push("-u");
    options.push(fullPath);

    child_process.execFile(
      GT.settings.trustedQsl.binaryFile,
      options,
      (error, stdout, stderr) => // eslint-disable-line node/handle-callback-err
      {
        if (stderr.indexOf("Final Status: Success") < 0)
        {
          addLastTraffic("<font style='color:orange'>Fail log to TQSL<br/>Queued for retry</font>");
          console.error("TQSL: " + stderr);
        }
        else
        {
          addLastTraffic("<font style='color:white'>Logged to TQSL</font>");
          fs.unlinkSync(fullPath);
        }
      }
    );
  }
}

function n1mmLoggerChanged()
{
  GT.settings.N1MM.enable = buttonN1MMCheckBox.checked;
  GT.settings.N1MM.ip = N1MMIpInput.value;
  GT.settings.N1MM.port = N1MMPortInput.value;
}

function log4OMLoggerChanged()
{
  GT.settings.log4OM.enable = buttonLog4OMCheckBox.checked;
  GT.settings.log4OM.ip = log4OMIpInput.value;
  GT.settings.log4OM.port = log4OMPortInput.value;
}

function acLogLoggerChanged()
{
  GT.settings.acLog.enable = acLogCheckbox.checked;
  GT.settings.acLog.ip = acLogIpInput.value;
  GT.settings.acLog.port = acLogPortInput.value;
  GT.settings.acLog.menu = acLogMenuCheckbox.checked;
  GT.settings.acLog.startup = acLogStartupCheckbox.checked;
  GT.settings.acLog.connect = acLogConnectCheckbox.checked;
  GT.settings.acLog.qsl = acLogQsl.value;

  acLogQslSpan.style.display = (acLogMenuCheckbox.checked || acLogStartupCheckbox.checked) ? "" : "none";
  buttonAcLogCheckBoxDiv.style.display = (acLogMenuCheckbox.checked) ? "" : "none";
}

function dxkLogLoggerChanged()
{
  GT.settings.dxkLog.enable = buttondxkLogCheckBox.checked;
  GT.settings.dxkLog.ip = dxkLogIpInput.value;
  GT.settings.dxkLog.port = dxkLogPortInput.value;
}

function CloudUrlErrorCallback(
  file_url,
  callback,
  flag,
  mode,
  port,
  theData,
  timeoutMs,
  timeoutCallback,
  message
)
{
  CloudlogTestResult.innerHTML = message;
}

function CloudlogSendLogResult(input)
{
  let buffer = String(input);
  if (buffer && buffer.indexOf("created") > -1)
  {
    addLastTraffic("<font style='color:white'>Logged to Cloudlog</font>");
  }
  else 
  {
    addLastTraffic("<font style='color:red'>Fail log to Cloudlog</font><br><font style='color:orange'>See main.log for error</font>");
    console.error("Cloudlog/Wavelog response:");
    console.error(buffer);
  }
}

function CloudlogGetProfiles()
{
  if (GT.settings.map.offlineMode == true) return;

  CloudLogCorrectURL();
  if (ValidateText(CloudlogURL) && ValidateText(CloudlogAPI))
  {
    let localValue = CloudlogURL.value;
    while (localValue.endsWith("/")) localValue = localValue.slice(0,-1);

    getPostJSONBuffer(
      localValue + "/index.php/api/station_info/" + CloudlogAPI.value,
      CloudlogFillProfiles,
      true,
      "https",
      80,
      null,
      10000,
      CloudUrlErrorCallback,
      "No Response<br>or<br>Timeout"
    );
  }
  else if (logCloudlogQSOCheckBox.checked == true)
  {
    CloudlogTestResult.innerHTML = "Invalid Fields";
    GT.settings.adifLog.text.CloudlogStationProfileID = CloudlogStationProfileID.value = "1";
  }
}

function CloudlogTestApiKey(buffer, flag)
{
  if (flag && flag == true)
  {
    CloudlogTestResult.style.backgroundColor = "black";
    if (buffer)
    {
      let parser = new DOMParser();
      let xmlDoc = parser.parseFromString(buffer, "text/xml");
      if (xmlDoc.getElementsByTagName("status").length > 0)
      {
        let state = xmlDoc.getElementsByTagName("status");
        let rights = xmlDoc.getElementsByTagName("rights");
        if (rights[0].childNodes[0].nodeValue == "r")
        {
          CloudlogTestResult.innerHTML = "Read Only!";
          CloudlogTestResult.style.backgroundColor = "rgb(199, 113, 0)";
        }
        else if (rights[0].childNodes[0].nodeValue == "rw")
        {
          CloudlogTestResult.innerHTML = "OK";
          CloudlogTestResult.style.backgroundColor = "darkblue";
          CloudlogGetProfiles();
        }
      }
      else
      {
        if (xmlDoc.getElementsByTagName("message").length > 0)
        {
          let message = xmlDoc.getElementsByTagName("message");
          CloudlogTestResult.innerHTML = "Error: " + message[0].childNodes[0].nodeValue;
          CloudlogTestResult.style.backgroundColor = "rgb(199, 113, 0)";
        }
      }
    }
    else
    {
      CloudlogTestResult.innerHTML = "Invalid Response";
    }
  }
}

function CloudlogFillProfiles(buffer, flag)
{
  if (flag && flag == true)
  {
    if (buffer)
    {
      let select = document.getElementById("CloudlogStationProfileID");
      select.options.length = 0;
      let jsonData = JSON.parse(buffer);
      let selected = false;
      for (let i = 0; i < jsonData.length; i++)
      {
        let item = jsonData[i];
        let opt = document.createElement("option");
        opt.value = item.station_id;
        // Selection from config fits to this station? select it                   or Old selection in config never set/fit to a station? so take last one as default
        if ((item.station_id == GT.settings.adifLog.text.CloudlogStationProfileID) || ((i == (jsonData.length-1)) && (!selected)))
        {
          opt.selected = true;
          selected=true;
        }
        opt.innerHTML = item.station_profile_name + " (" + item.station_callsign + ")";
        select.appendChild(opt);
      }
      if (selected)
      {
        CloudLogProfileChanged(select);
      }
    }
    else
    {
      CloudlogTestResult.innerHTML = "Invalid Response";
    }
  }
}

function qrzSendLogResult(buffer, flag, postData)
{
  let error = null;

  if (typeof buffer != "undefined" && buffer != null)
  {
    let data = String(buffer);
    let kv = data.split("&");
    if (kv.length > 0)
    {
      let arrData = Object();
      for (let x in kv)
      {
        let split = kv[x].split("=");
        arrData[split[0]] = split[1];
      }
      if (!("RESULT" in arrData))
      {
        error = "Unknown Response";
        if ("STATUS" in arrData)
        {
          if ("REASON" in arrData)
          {
            error = arrData.REASON;
          }
          if ("EXTENDED" in arrData && arrData.EXTENDED.length > 0)
          {
            error = arrData.EXTENDED;
            if (arrData.EXTENDED.indexOf("outside date range") > -1)
            {
              error = "Logbook Date Range!";
            }
          }
        }
      }
      else if (arrData.RESULT != "OK")
      {
        if (arrData.RESULT == "FAIL" && "REASON" in arrData)
        {
          error = arrData.REASON;
        }
        else if (arrData.RESULT == "AUTH")
        {
          error = "Invalid Auth";
        }
        else
        {
          error = arrData.RESULT;
        }
      }
      else
      {
        addLastTraffic("<font style='color:white'>Logged to QRZ.com</font>");
        return;
      }
    }
    else
    {
      error = "Missing Response";
    }
    console.error("QRZ.com post data:");
    console.error(postData);
    console.error("QRZ.com response:");
    console.error(data);
  }
  else
  {
    error = "No Response";
  }

  if (error != null)
  {
    addLastTraffic("<font style='font-size: smaller; color:orange'>" + error.replaceAll("ror:", "ror:<br>") + "</font>");
  }
  addLastTraffic("<font style='color:red'>Failed log to QRZ.com</font>");
}

function postRetryErrorCallaback(file_url, callback, flag, mode, port, theData, timeoutMs, timeoutCallback, who)
{
  getPostBuffer(file_url, callback, flag, mode, port, theData, timeoutMs, null, who);
}

function sendQrzLogEntry(report)
{
  if (GT.settings.map.offlineMode == true) return;

  if (logQRZqsoCheckBox.checked == true && ValidateQrzApi(qrzApiKey))
  {
    let postData = {
      KEY: qrzApiKey.value,
      ACTION: "INSERT",
      ADIF: report
    };
    getPostBuffer(
      "https://logbook.qrz.com/api",
      qrzSendLogResult,
      null,
      "https",
      443,
      postData,
      30000,
      postRetryErrorCallaback,
      "QRZ.com"
    );
  }
}

function clubLogQsoResult(buffer, flag)
{
  addLastTraffic("<font style='color:white'>Logged to ClubLog.org</font>");
}

function sendClubLogEntry(report)
{
  if (GT.settings.map.offlineMode == true) return;

  if (logClubqsoCheckBox.checked == true)
  {
    let postData = {
      email: clubEmail.value,
      password: clubPassword.value,
      callsign: clubCall.value,
      adif: report,
      api: CLk
    };

    getPostBuffer(
      "https://clublog.org/realtime.php",
      clubLogQsoResult,
      null,
      "https",
      443,
      postData,
      30000,
      postRetryErrorCallaback,
      "ClubLog.org"
    );
  }
}

function sendCloudlogEntry(report)
{
  if (GT.settings.map.offlineMode == true) return;

  if (logCloudlogQSOCheckBox.checked == true)
  {
    CloudLogCorrectURL();
    let localValue = CloudlogURL.value;
    while (localValue.endsWith("/")) localValue = localValue.slice(0,-1);
    let postData = { key: CloudlogAPI.value, station_profile_id: parseInt(GT.settings.adifLog.text.CloudlogStationProfileID), type: "adif", string: report };
    getPostJSONBuffer(
      localValue + "/index.php/api/qso",
      CloudlogSendLogResult,
      null,
      "https",
      80,
      postData,
      10000,
      CloudUrlErrorCallback,
      "Failed to Send"
    );
  }
}

function hrdSendLogResult(buffer, flag)
{
  if (flag && flag == true)
  {
    if (buffer.indexOf("Unknown user") > -1)
    {
      HRDLogTestResult.innerHTML = "Failed";
      logHRDLOGqsoCheckBox.checked = false;
      adifLogQsoCheckBoxChanged(logHRDLOGqsoCheckBox);
    }
    else HRDLogTestResult.innerHTML = "Passed";
  }
  else
  {
    if (buffer != null && buffer.indexOf("Unknown user") == -1)
    { addLastTraffic("<font style='color:white'>Logged to HRDLOG.net</font>"); }
    else
    { addLastTraffic("<font style='color:red'>Fail log to HRDLOG.net</font>"); }
  }
}

function sendHrdLogEntry(report)
{
  if (GT.settings.map.offlineMode == true) return;

  if (logHRDLOGqsoCheckBox.checked == true)
  {
    let postData = {
      Callsign: HRDLOGCallsign.value,
      Code: HRDLOGUploadCode.value,
      App: "GridTracker " + gtVersion,
      ADIFData: report
    };
    getPostBuffer(
      "https://www.hrdlog.net/NewEntry.aspx",
      hrdSendLogResult,
      null,
      "https",
      443,
      postData,
      30000,
      postRetryErrorCallaback,
      "HRDLog.net"
    );
  }
}

function hrdCredentialTest(test)
{
  if (test && test == true)
  {
    HRDLogTestResult.innerHTML = "Testing";

    let postData = {
      Callsign: HRDLOGCallsign.value,
      Code: HRDLOGUploadCode.value
    };
    getPostBuffer(
      "https://www.hrdlog.net/NewEntry.aspx",
      hrdSendLogResult,
      test,
      "https",
      443,
      postData
    );
  }
}

function CloudLogCorrectURL()
{
  let initialValue = CloudlogURL.value;
  CloudlogURL.value = CloudlogURL.value.replace("/index.php/api/qso", "");

  if (CloudlogURL.value != initialValue)
  {
    GT.settings.adifLog.text.CloudlogURL = CloudlogURL.value;
  }
}

function CloudLogProfileChanged(obj)
{
  GT.settings.adifLog.text.CloudlogStationProfileID = obj.value;
}

function CloudlogTest(test)
{
  if (test && test == true)
  {
    CloudLogCorrectURL();
    if (ValidateText(CloudlogURL) && ValidateText(CloudlogAPI))
    {
      CloudlogTestResult.innerHTML = "Testing API Key";
      let localValue = CloudlogURL.value;
      while (localValue.endsWith("/")) localValue = localValue.slice(0,-1);
      
      getPostJSONBuffer(
       localValue + "/index.php/api/auth/" + CloudlogAPI.value,
        CloudlogTestApiKey,
        test,
        "https",
        80,
        null,
        10000,
        CloudUrlErrorCallback,
        "No Response<br>or<br>Timeout"
      );
    }
    else
    {
      CloudlogTestResult.innerHTML = "Missing Fields<br>Test Aborted";
    }
  }
}

function HamCQTest(test)
{
  if (test && test == true)
  {
    HamCQTestResult.innerHTML = "Testing";

    let postData = { key: HamCQApiKey.value };
    getPostJSONBuffer(
      "https://www.hamcq.cn/v1/logbook?from=gridtracker",
      HamCQSendResult,
      test,
      "https",
      443,
      postData,
      10000,
      HamCQErrorCallback,
      "Failed"
    );
  }
}

function HamCQErrorCallback(
  file_url,
  callback,
  flag,
  mode,
  port,
  theData,
  timeoutMs,
  timeoutCallback,
  message
)
{
  HamCQTestResult.innerHTML = message;
}

function HamCQSendResult(buffer, flag)
{
  if (flag && flag == true)
  {
    if (buffer)
    {
      if (buffer.indexOf("Invalid") > -1)
      {
        HamCQTestResult.innerHTML = "Invalid";
      }
      else if (buffer.indexOf("Pass") > -1)
      {
        HamCQTestResult.innerHTML = "Passed";
      }
      else
      {
        HamCQTestResult.innerHTML = "Unknown Error";
      }
    }
    else
    {
      HamCQTestResult.innerHTML = "Resp Err";
    }
  }
}

function sendHamCQEntry(report)
{
  if (GT.settings.map.offlineMode == true) return;

  if (logHamCQqsoCheckBox.checked == true)
  {
    let postData = {
      key: HamCQApiKey.value,
      app: "GridTracker " + gtVersion,
      adif: report
    };
    getPostBuffer(
      "https://www.hamcq.cn/v1/logbook?from=gridtracker",
      HamCQSendResult,
      null,
      "https",
      443,
      postData,
      30000,
      postRetryErrorCallaback,
      "HamCQ.cn"
    );
  }
}

function getPostJSONBuffer(
  file_url,
  callback,
  flag,
  mode,
  port,
  theData,
  timeoutMs,
  timeoutCallback,
  who
)
{
  try
  {
    let postData = JSON.stringify(theData);
    let protocol = NodeURL.parse(file_url).protocol; // eslint-disable-line node/no-deprecated-api
    const http = require(protocol.replace(":", ""));
    let fileBuffer = null;
    let options = {
      host: NodeURL.parse(file_url).hostname, // eslint-disable-line node/no-deprecated-api
      port: NodeURL.parse(file_url).port, // eslint-disable-line node/no-deprecated-api
      path: NodeURL.parse(file_url).path, // eslint-disable-line node/no-deprecated-api
      method: "post",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
        "User-Agent": gtUserAgent,
        "x-user-agent": gtUserAgent
      }
    };
    let req = http.request(options, function (res)
    {
      let fsize = res.headers["content-length"];
      let cookies = null;
      if (typeof res.headers["set-cookie"] != "undefined")
      { cookies = res.headers["set-cookie"]; }
      res
        .on("data", function (data)
        {
          if (fileBuffer == null) fileBuffer = data;
          else fileBuffer += data;
        })
        .on("end", function ()
        {
          if (typeof callback == "function")
          {
            // Call it, since we have confirmed it is callable
            callback(fileBuffer, flag, cookies);
          }
        })
        .on("error", function () {});
    });
    if (typeof timeoutMs == "number" && timeoutMs > 0)
    {
      req.on("socket", function (socket)
      {
        socket.setTimeout(timeoutMs);
        socket.on("timeout", function ()
        {
          req.abort();
        });
      });
    }
    req.on("error", function (err) // eslint-disable-line node/handle-callback-err
    {
      if (typeof timeoutCallback == "function")
      {
        timeoutCallback(
          file_url,
          callback,
          flag,
          mode,
          80,
          theData,
          timeoutMs,
          timeoutCallback,
          who
        );
      }
      req.abort();
    });
  
    req.write(postData);
    req.end();
  }
  catch (e)
  {
    if (typeof timeoutCallback != "undefined")
    {
      timeoutCallback(
        file_url,
        callback,
        flag,
        mode,
        80,
        theData,
        timeoutMs,
        timeoutCallback,
        "Invalid Url"
      );
    }
  }
}

function valueToXmlField(field, value)
{
  return "<" + field + ">" + String(value) + "</" + field + ">";
}

function aclUpdateControlValue(control, value)
{
  return (valueToXmlField("CMD", "<UPDATE>" + valueToXmlField("CONTROL", control) + valueToXmlField("VALUE", value)) + "\r\n");
}

function aclAction(action)
{
  return (valueToXmlField("CMD", "<ACTION>" + valueToXmlField("VALUE", action)) + "\r\n");
}

function adifField(record, key)
{
  if (key in record) return record[key].trim();
  else return "";
}
function sendACLogMessage(record, port, address)
{
  let report = "";

  report += aclAction("CLEAR");
  report += aclUpdateControlValue("TXTENTRYBAND", adifField(record, "BAND"));
  report += aclUpdateControlValue("TXTENTRYCALL", adifField(record, "CALL"));
  report += aclAction("CALLTAB");
  report += aclUpdateControlValue("TXTENTRYFREQUENCY", adifField(record, "FREQ"));
  if (adifField(record, "SUBMODE").length > 0)
  {
    report += aclUpdateControlValue("TXTENTRYMODE", adifField(record, "SUBMODE"));
  }
  else
  { 
    report += aclUpdateControlValue("TXTENTRYMODE", adifField(record, "MODE"));
  }

  let date = adifField(record, "QSO_DATE");
  let dataString = date.substr(0, 4) + "/" + date.substr(4, 2) + "/" + date.substr(6);

  report += aclUpdateControlValue("TXTENTRYDATE", dataString);

  let timeVal = adifField(record, "TIME_ON");
  let whenString = timeVal.substr(0, 2) + ":" + timeVal.substr(2, 2) + ":" + timeVal.substr(4, 2);
  report += aclUpdateControlValue("TXTENTRYTIMEON", whenString);

  timeVal = adifField(record, "TIME_OFF");
  whenString = timeVal.substr(0, 2) + ":" + timeVal.substr(2, 2) + ":" + timeVal.substr(4, 2);
  report += aclUpdateControlValue("TXTENTRYTIMEOFF", whenString);

  report += aclUpdateControlValue("TXTENTRYRSTR", adifField(record, "RST_RCVD"));
  report += aclUpdateControlValue("TXTENTRYRSTS", adifField(record, "RST_SENT"));
  report += aclUpdateControlValue("TXTENTRYPOWER", adifField(record, "TX_PWR"));
  report += aclUpdateControlValue("TXTENTRYGRID", adifField(record, "GRIDSQUARE"));
  report += aclUpdateControlValue("TXTENTRYCOMMENTS", adifField(record, "COMMENT"));
  report += aclUpdateControlValue("TXTENTRYNAMER", adifField(record, "NAME"));
  report += aclUpdateControlValue("TXTENTRYIOTA", adifField(record, "IOTA"));
  report += aclUpdateControlValue("TXTENTRYCONTINENT", adifField(record, "CONT"));
  report += aclUpdateControlValue("TXTENTRYITUZ", adifField(record, "ITUZ"));
  report += aclUpdateControlValue("TXTENTRYCQZONE", adifField(record, "CQZ"));
  report += aclUpdateControlValue("TXTENTRYCOUNTYR", adifField(record, "CNTY").replaceAll(", ", ","));

  let sentSpcNum = false;
  if (adifField(record, "SRX").length > 0)
  {
    report += aclUpdateControlValue("TXTENTRYSERIALNOR", adifField(record, "SRX"));
  }
  else if (adifField(record, "CONTEST_ID").length > 0)
  {
    report += aclUpdateControlValue("TXTENTRYSPCNUM", adifField(record, "SRX_STRING"));
    sentSpcNum = true;
    report += aclUpdateControlValue("TXTENTRYCLASS", adifField(record, "CLASS"));
    report += aclUpdateControlValue("TXTENTRYSECTION", adifField(record, "ARRL_SECT"));
  }

  if (adifField(record, "STATE").length > 0)
  {
    report += aclUpdateControlValue("TXTENTRYSTATE", adifField(record, "STATE"));
    if (sentSpcNum == false)
    {
      report += aclUpdateControlValue("TXTENTRYSPCNUM", adifField(record, "STATE"));
    }
  }

  report += aclAction("ENTER") + "\r\n\r\n";

  sendTcpMessage(report, report.length, port, address);
}

function sendDXKeeperLogMessage(newMessage, port, address)
{
  let report = "";

  report += valueToAdiField("command", "log");
  report += valueToAdiField("parameters", newMessage);
  report += "\r\n";

  sendTcpMessage(report, report.length, Number(port) + 1, address);
}

const myTextEncoder = new TextEncoder();
const myTextDecoder = new TextDecoder();

function parseADIFRecord(adif)
{
  let regex = new RegExp("<EOR>", "i");
  let newLine = adif.split(regex);
  let line = newLine[0].trim(); // Catch the naughty case of someone sending two records at the same time
  let record = {};

  while (line.length > 0)
  {
    while (line.charAt(0) != "<" && line.length > 0)
    {
      line = line.substr(1);
    }
    if (line.length > 0)
    {
      line = line.substr(1);
      let where = line.indexOf(":");
      if (where != -1)
      {
        let fieldName = line.substr(0, where).toUpperCase();
        line = line.substr(fieldName.length + 1);
        let fieldLength = parseInt(line);
        let end = line.indexOf(">");
        if (end > 0)
        {
          line = line.substr(end + 1);
          fieldValue = myTextDecoder.decode(myTextEncoder.encode(line.substr(0)).slice(0, fieldLength))
          line = line.substr(fieldValue.length);
          record[fieldName] = fieldValue;
        }
      }
    }
  }

  return record;
}

function pskCallback(buffer, flag)
{
  parsePSKadif(buffer);
}

GT.isGettingPsk = false;

function grabPsk24()
{
  if (GT.isGettingPsk == true) return;

  if (GT.settings.app.myCall.length > 0 && GT.settings.app.myCall != "NOCALL")
  {
    let days = 1;
    if (pskImg.src == 1) days = 7;
    getABuffer(
      "https://pskreporter.info/cgi-bin/pskdata.pl?adif=1&days=" +
        days +
        "&receiverCallsign=" +
        GT.settings.app.myCall.toLowerCase(),
      pskCallback,
      null,
      "https",
      443,
      pskImg,
      "GT.isGettingPsk"
    );
  }
}

function findAdiField(row, field)
{
  let value = "";
  let regex = new RegExp("<" + field + ":", "i");
  let firstSplitArray = row.split(regex);
  if (firstSplitArray && firstSplitArray.length == 2)
  {
    let secondSplitArray = firstSplitArray[1].split(">");
    if (secondSplitArray.length > 1)
    {
      let newLenSearch = secondSplitArray[0].split(":");
      let newLen = newLenSearch[0];
      value = secondSplitArray[1].slice(0, newLen);
    }
  }
  return value;
}

function parsePSKadif(adiBuffer)
{
  let rawAdiBuffer = String(adiBuffer ?? "");

  let activeAdifArray = Array();

  if (rawAdiBuffer.indexOf("PSKReporter") == -1) return;

  if (rawAdiBuffer.length > 1)
  {
    rawAdiBuffer = rawAdiBuffer.replace(/<EOH>/ig, "");
  }

  activeAdifArray = String(rawAdiBuffer ?? "").split(/<EOR>/i).filter(record => record.trim().length > 0);

  for (let x = 0; x < activeAdifArray.length; x++)
  {
    if (activeAdifArray[x].length > 0)
    {
      let finalMyGrid = findAdiField(activeAdifArray[x], "MY_GRIDSQUARE").toUpperCase();
      let finalGrid = findAdiField(activeAdifArray[x], "GRIDSQUARE").toUpperCase();
      let finalDXcall = findAdiField(activeAdifArray[x], "CALL");
      let finalDEcall = findAdiField(activeAdifArray[x], "OPERATOR");
      let finalRSTsent = findAdiField(activeAdifArray[x], "APP_PSKREP_SNR");
      let dateVal = findAdiField(activeAdifArray[x], "QSO_DATE");
      let timeVal = findAdiField(activeAdifArray[x], "TIME_ON");
      let finalMode = findAdiField(activeAdifArray[x], "MODE");
      let finalBand = formatBand(Number(findAdiField(activeAdifArray[x], "FREQ")));
      let finalMsg = "-";
      let finalDxcc = Number(findAdiField(activeAdifArray[x], "DXCC"));
      if (finalDxcc == 0)
      {
        if (finalDXcall == GT.settings.app.myCall) finalDxcc = callsignToDxcc(finalDEcall);
        else finalDxcc = callsignToDxcc(finalDXcall);
      }

      finalGrid = finalGrid.substr(0, 6);

      let dateTime = new Date(
        Date.UTC(
          dateVal.substr(0, 4),
          parseInt(dateVal.substr(4, 2)) - 1,
          dateVal.substr(6, 2),
          timeVal.substr(0, 2),
          timeVal.substr(2, 2),
          timeVal.substr(4, 2)
        )
      );
      let finalTime = parseInt(dateTime.getTime() / 1000);
      if (finalGrid != "" && finalDXcall != "" && validateGridFromString(finalGrid))
      {
        if (finalDXcall == GT.settings.app.myCall)
        {
          addLiveCallsign(
            finalMyGrid,
            finalDEcall,
            finalDXcall,
            null,
            finalTime,
            finalMsg,
            finalMode,
            finalBand,
            false,
            false,
            finalRSTsent,
            finalDxcc
          );
        }
        else if (finalDEcall == GT.settings.app.myCall)
        {
          addLiveCallsign(
            finalGrid,
            finalDXcall,
            "-",
            finalRSTsent,
            finalTime,
            finalMsg,
            finalMode,
            finalBand,
            false,
            false,
            null,
            finalDxcc
          );
        }
        else
        {
          addLiveCallsign(
            finalGrid,
            finalDXcall,
            finalDEcall,
            finalRSTsent,
            finalTime,
            finalMsg,
            finalMode,
            finalBand,
            false,
            false,
            null,
            finalDxcc
          );
        }
      }
    }
  }
  redrawLiveGrids(false);
  updateCountStats();
}

function sendTcpMessageGetResponse(msg, port, address, callback = null)
{
  const net = require("net");
  let client = new net.Socket();
  client.setTimeout(30000);
  
  // Consolidated error handler!
  client.on("error", function (err) {
    console.error("TCP Logger Connection Error (ACLog):", err.message);
    addLastTraffic("<font style='color:orange'>N3FJP Download Failed</font><br><font style='color:white'>Is it running and<br>TCP server enabled?</font>");
    client.destroy(); // Safely kill the socket
    if (callback) callback(null);
  });

  client.connect(port, address, function ()
  {
    client.write(Buffer.from(msg, "utf-8"));
  });

  let chunks = [];
  
  client.on("data", function (data)  {
      chunks.push(data);
  });

  client.on("end", function () {
    let fileBuffer = Buffer.concat(chunks);
    if (callback) callback(fileBuffer);
  });

  client.on("close", function () {
  });

  client.on("timeout", function () {
    client.end();
  });
}


function grabAcLog(count = 0)
{
  AcLogImg.style.webkitFilter = "invert(100%)";
  
  let countString = count > 0 ? ("<VALUE>" + count + "</VALUE>") : "";

  let cmd = valueToXmlField("CMD", "<OPINFO>") + "\r\n";
  cmd += valueToXmlField("CMD", "<LIST><INCLUDEALL>" + countString) + "\r\n\r\n";

  sendTcpMessageGetResponse(cmd, GT.settings.acLog.port, GT.settings.acLog.ip, acLogCallback);
}

function acLogCallback(buffer)
{
  AcLogImg.style.webkitFilter = "";
  if (buffer)
  {
    clearOrLoadButton.style.display = "none";
    busyDiv.style.display = "block";

    let task = {};
    task.type = "parseAcLog";
    task.appSettings = GT.settings.app;
    task.aclSettings = GT.settings.acLog;
    task.nextFunc = null;
    task.rawAcLogBuffer = buffer.toString();

    GT.adifLogCount++;
    GT.adifWorker.postMessage(task);
  }
}

function checkAdifBroadcastListener()
{
  if (GT.adifBroadcastServer == null || (GT.adifBroadcastSocketReady == false && GT.adifBroadcastSocketError == true))
  {
    GT.adifBroadcastCurrentPort = -1;
    GT.adifBroadcastCurrentIP = "";
  }

  updateAdifBroadcast(GT.settings.app.adifBroadcastPort);
}

function updateAdifBroadcast(port)
{
  if (adifBroadcastEnable.checked == true && port == GT.adifBroadcastCurrentPort && GT.settings.app.adifBroadcastIP == GT.adifBroadcastCurrentIP) { return; }

  if (GT.adifBroadcastServer != null)
  {
    if (GT.adifBroadcastCurrentIP != "")
    {
      try
      {
        GT.adifBroadcastServer.dropMembership(GT.adifBroadcastCurrentIP);
      }
      catch (e)
      {
      }
    }

    GT.adifBroadcastCurrentIP = "";
    GT.adifBroadcastServer.close();
    GT.adifBroadcastServer = null;
    GT.adifBroadcastSocketReady = false;
  }

  if (port == -1 || GT.closing == true || GT.settings.app.adifBroadcastEnable == false || adifBroadcastEnable.checked == false) return;

  GT.adifBroadcastSocketError = false;
  const dgram = require("dgram");
  GT.adifBroadcastServer = dgram.createSocket({
    type: "udp4",
    reuseAddr: true
  });

  if (adifBroadcastMulticast.checked == true && GT.settings.app.adifBroadcastIP != "")
  {
    GT.adifBroadcastServer.on("listening", function ()
    {
      GT.adifBroadcastServer.setBroadcast(true);
      GT.adifBroadcastServer.setMulticastTTL(3);
      let interfaces = os.networkInterfaces();
      for (let i in interfaces)
      {
        for (let x in interfaces[i])
        {
          if (interfaces[i][x].family == "IPv4")
          {
            GT.adifBroadcastServer.addMembership(GT.settings.app.adifBroadcastIP, interfaces[i][x].address);
          }
        }
      }
      GT.adifBroadcastSocketReady = true;
    });
  }
  else
  {
    GT.settings.app.adifBroadcastMulticast = adifBroadcastMulticast.checked = false;
    GT.adifBroadcastCurrentIP = GT.settings.app.adifBroadcastIP = adifBroadcastIP.value = "";
    GT.adifBroadcastServer.on("listening", function ()
    {
      GT.adifBroadcastServer.setBroadcast(true);
      GT.adifBroadcastSocketReady = true;
    });
  }

  GT.adifBroadcastServer.on("error", function ()
  {
    GT.adifBroadcastServer.close();
    GT.adifBroadcastServer = null;
    GT.adifBroadcastSocketReady = false;
    GT.adifBroadcastSocketError = true;
  });

  GT.adifBroadcastServer.on("message", function (incoming, remote)
  {
    if (GT.finishedLoading == false) return;

    let message =  String(incoming);
    if (message.indexOf("FLDIGI_TEST") == -1)
    {
      sendToLogger("<EOH>" + message.replaceAll("<eor>", "<EOR>"));
    }
    else
    {
      addLastTraffic("<font color='cyan'>✅ fldigi log test ✅</font>");
    }
  });

  GT.adifBroadcastServer.bind(port);
  GT.adifBroadcastCurrentPort = port;
  GT.adifBroadcastCurrentIP = GT.settings.app.adifBroadcastIP;
}

function hrdLogbookLoggerChanged()
{
  GT.settings.HRDLogbookLog.enable = buttonHrdLogbookCheckBox.checked;
  GT.settings.HRDLogbookLog.ip = hrdLogbookIpInput.value;
  GT.settings.HRDLogbookLog.port = hrdLogbookPortInput.value;
}

function sendHRDLogbookEntry(report, port, address)
{
  let command = "ver\rdb add {";
  let items = Object.assign({}, report);

  items.FREQ = items.FREQ.split(".").join("");

  for (let item in items)
  {
    command += item + "=\"" + items[item] + "\" ";
  }

  command += "}\rexit\r";

  sendTcpMessage(command, command.length, Number(port), address);
}