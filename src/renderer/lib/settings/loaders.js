// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Settings: loading settings into the settings panel, import/export, file pickers, password fields (moved from GridTracker2.js)

const emojiShow = '👀';

const emojiHide = '🔒';

function importSettings(contents)
{
  try {
    let data = JSON.parse(contents);
    if (data && "app" in data && "currentVersion" in data)
    {
      if (Number(data.currentVersion.substring(0,7)) < 2241005 )
      {
        importSettingsInfo.innerHTML = "<font style='color:orange;font-weight:bold'>Incompatible Version!</font>";
      }
      else
      {
        GT.settings = { };
        for (const key in data)
        {
          GT.settings[key] = data[key];
        }
        saveGridTrackerSettings();
        electron.ipcRenderer.sendSync("restartGridTracker2", false);
      }
    }
    else
    {
      importSettingsInfo.innerHTML = "<font style='color:orange;font-weight:bold'>File Corrupt!</font>";
    }
  }
  catch (e)
  {
    importSettingsInfo.innerHTML = "<font style='color:orange;font-weight:bold'>File Read!</font>";
  }
}

function loadViewSettings()
{
  gtBandFilter.value = GT.settings.app.gtBandFilter;
  gtModeFilter.value = GT.settings.app.gtModeFilter;
  if (GT.settings.app.gtPropFilter == "") GT.settings.app.gtPropFilter = "mixed";
  gtPropFilter.value = GT.settings.app.gtPropFilter;
  distanceUnit.value = GT.settings.app.distanceUnit;
  languageLocale.value = GT.settings.app.locale;
  N1MMIpInput.value = GT.settings.N1MM.ip;
  N1MMPortInput.value = GT.settings.N1MM.port;
  buttonN1MMCheckBox.checked = GT.settings.N1MM.enable;
  ValidatePort(N1MMPortInput, buttonN1MMCheckBox, null);
  ValidateIPaddress(N1MMIpInput, buttonN1MMCheckBox, null);

  log4OMIpInput.value = GT.settings.log4OM.ip;
  log4OMPortInput.value = GT.settings.log4OM.port;
  buttonLog4OMCheckBox.checked = GT.settings.log4OM.enable;
  ValidatePort(log4OMPortInput, buttonLog4OMCheckBox, null);
  ValidateIPaddress(log4OMIpInput, buttonLog4OMCheckBox, null);

  acLogIpInput.value = GT.settings.acLog.ip;
  acLogPortInput.value = GT.settings.acLog.port;
  acLogCheckbox.checked = GT.settings.acLog.enable;
  acLogMenuCheckbox.checked = GT.settings.acLog.menu;
  acLogStartupCheckbox.checked = GT.settings.acLog.startup;
  acLogConnectCheckbox.checked = GT.settings.acLog.connect;
  ValidatePort(acLogPortInput, acLogCheckbox, null);
  ValidateIPaddress(acLogIpInput, acLogCheckbox, null);
  acLogQsl.value = GT.settings.acLog.qsl;
  acLogQslSpan.style.display = (acLogMenuCheckbox.checked || acLogStartupCheckbox.checked) ? "" : "none";
  buttonAcLogCheckBoxDiv.style.display = (acLogMenuCheckbox.checked) ? "" : "none";

  dxkLogIpInput.value = GT.settings.dxkLog.ip;
  dxkLogPortInput.value = GT.settings.dxkLog.port;
  buttondxkLogCheckBox.checked = GT.settings.dxkLog.enable;
  ValidatePort(dxkLogPortInput, buttondxkLogCheckBox, null);
  ValidateIPaddress(dxkLogIpInput, buttondxkLogCheckBox, null);

  hrdLogbookIpInput.value = GT.settings.HRDLogbookLog.ip;
  hrdLogbookPortInput.value = GT.settings.HRDLogbookLog.port;
  buttonHrdLogbookCheckBox.checked = GT.settings.HRDLogbookLog.enable;
  ValidatePort(hrdLogbookPortInput, buttonHrdLogbookCheckBox, null);
  ValidateIPaddress(hrdLogbookIpInput, buttonHrdLogbookCheckBox, null);

  pstrotatorIpInput.value = GT.settings.pstrotator.ip;
  pstrotatorPortInput.value = GT.settings.pstrotator.port;
  pstrotatorCheckBox.checked = GT.settings.pstrotator.enable;
  ValidatePort(pstrotatorPortInput, pstrotatorCheckBox, null);
  ValidateIPaddress(pstrotatorIpInput, pstrotatorCheckBox, null);

  spotHistoryTimeValue.value = parseInt(
    GT.settings.reception.viewHistoryTimeSec / 60
  );

  let mins = parseInt(spotHistoryTimeValue.value);

  // Split slider minutes into Hours and Minutes for the inputs
  let hInput = document.getElementById("spotHistoryH");
  let mInput = document.getElementById("spotHistoryM");
  
  if (hInput && mInput) {
    // padStart ensures it always shows "05" instead of "5"
    hInput.value = String(Math.floor(mins / 60)).padStart(2, '0');
    mInput.value = String(mins % 60).padStart(2, '0');
  }

  spotPathColorValue.value = GT.settings.reception.pathColor;
  spotNightPathColorValue.value = GT.settings.reception.pathNightColor;
  spotWidthTd.innerHTML = spotWidthValue.value = GT.settings.reception.spotWidth;


  spotMergeValue.checked = GT.settings.reception.mergeSpots;

  lookupOnTx.checked = GT.settings.app.lookupOnTx;
  lookupCloseLog.checked = GT.settings.app.lookupCloseLog;
  lookupMerge.checked = GT.settings.app.lookupMerge;
  lookupMissingGrid.checked = GT.settings.app.lookupMissingGrid;

  clearOnCQ.checked = GT.settings.app.clearOnCQ;

  lookupMissingGridTr.style.display = GT.settings.app.lookupMerge ? "" : "none";

  gridModeDiv.style.display = GT.pushPinMode ? "" : "none";

  spotPathChange();
  setLegendGridSettings();

  mapRightValue.checked = GT.settings.app.mapRight;

  updateLayout(false);
}

function changeMapRight(checkbox)
{
  GT.settings.app.mapRight = mapRightValue.checked;
  updateLayout(false);
}

function loadMsgSettings()
{
  spottingEnable.checked = GT.settings.app.spottingEnable;
  oamsBandActivity.checked = GT.settings.app.oamsBandActivity;
  oamsBandActivityNeighbors.checked = GT.settings.app.oamsBandActivityNeighbors;
  setOamsBandActivity(oamsBandActivity);

  setSpotImage();

for (const key in GT.settings.msg)
{
  if (key in window)
  {
    if (window[key].type === "checkbox")
    {
      window[key].checked = GT.settings.msg[key];
    }
    else if (window[key].type === "time")
    {
      window[key].value = minutesToTimeString(GT.settings.msg[key]);
    }
    else
    {
      window[key].value = GT.settings.msg[key];
    }
  }
  else
  {
    delete GT.settings.msg[key];
  }
}

  setMsgSettingsView();
}

function setMsgSettingsView()
{
  simplepushMsgEnableTr.style.display = (GT.settings.map.offlineMode == false) ? "" : "none";
  pushoverMsgEnableTr.style.display = (GT.settings.map.offlineMode == false) ? "" : "none";

  simplePushDiv.style.display = (GT.settings.msg.msgSimplepush && GT.settings.map.offlineMode == false) ? "" : "none";
  pushOverDiv.style.display = (GT.settings.msg.msgPushover && GT.settings.map.offlineMode == false) ? "" : "none";

  simplepushDailyScheduleDiv.style.display = (GT.settings.msg.msgSimplepushDailySchedule ? "" : "none");
  pushoverDailyScheduleDiv.style.display = (GT.settings.msg.msgPushoverDailySchedule ? "" : "none");

  ValidateText(msgSimplepushApiKey);
  ValidateText(msgPushoverUserKey);
  ValidateText(msgPushoverToken);

  displaySimplepushSchedule();
  displayPushoverSchedule();
}

function loadAdifSettings()
{
  qslAuthority.value = GT.settings.app.qslAuthority;
  qsoItemsPerPageTd.innerHTML = qsoItemsPerPageValue.value = GT.settings.app.qsoItemsPerPage;

  if (Object.keys(GT.settings.app.workingCallsigns).length == 0) {
    GT.settings.app.workingCallsignEnable = false;
    workingCallsignEnableTd.style.display = "none";
  }
  workingCallsignEnable.checked = GT.settings.app.workingCallsignEnable;
  workingCallsignsValue.value = Object.keys(GT.settings.app.workingCallsigns).join(",");
  ValidateCallsigns(workingCallsignsValue);

  if (Object.keys(GT.settings.app.workingGrids).length == 0) {
    GT.settings.app.workingGridEnable = false;
    workingGridEnableTd.style.display = "none";
  }
  workingGridEnable.checked = GT.settings.app.workingGridEnable;
  workingGridsValue.value = Object.keys(GT.settings.app.workingGrids).join(",");
  ValidateGrids(workingGridsValue);

  if (GT.settings.app.workingDate == 0) {
    GT.settings.app.workingDateEnable = false;
    workingDateEnableTd.style.display = "none";
  }
  workingDateEnable.checked = GT.settings.app.workingDateEnable;
  displayWorkingDate();

  if (GT.platform == "mac") selectTQSLButton.style.display = "none";

  // Generic Setting Applicator to stop DOM query thrashing
  const applySettings = (settingsObj, callback) => {
    for (let key in settingsObj) {
      let el = document.getElementById(key);
      if (el) {
        if (el.type === "checkbox") el.checked = settingsObj[key];
        else el.value = settingsObj[key];
        if (callback) callback(key, settingsObj[key], el);
      } else if (!callback) {
        delete settingsObj[key]; // Prune invalid config entries dynamically
      }
    }
  };

  applySettings(GT.settings.adifLog.menu, (k, val) => {
    let div = document.getElementById(k + "Div");
    if (div) div.style.display = val ? "" : "none";
  });
  
  applySettings(GT.settings.adifLog.startup);
  
  applySettings(GT.settings.adifLog.nickname, (k, val) => {
    if (k == "nicknameeQSLCheckBox") eQSLNickname.style.display = val ? "" : "none";
  });
  
  applySettings(GT.settings.adifLog.text, (k, val, el) => ValidateText(el));
  
  applySettings(GT.settings.adifLog.qsolog, (k, val) => {
    if (k == "logLOTWqsoCheckBox") {
      lotwUpload.style.display = val ? "" : "none";
      trustedTestButton.style.display = val ? "" : "none";
    }
  });

  if (clubCall.value == "" && GT.settings.app.myRawCall != "NOCALL") {
    clubCall.value = GT.settings.app.myRawCall;
    ValidateText(clubCall);
  }

  try {
    findTrustedQSLPaths();
  } catch (e) {
    if (logLOTWqsoCheckBox.checked == true) {
      alert("Unable to access LoTW TrustedQSL (TQSL) due to OS permissions\nLogging to LoTW disabled for this session\nRun as administrator or allow file access to GridTracker if problem persists");
      logLOTWqsoCheckBox.checked = false;
    }
  }

  CloudlogStationProfileID.style.color = "#FF0";
  CloudlogStationProfileID.style.backgroundColor = "darkblue";
  CloudlogGetProfiles();

  updateAppLogsUI();
  setAdifStartup(loadAdifCheckBox);
  ValidateQrzApi(qrzApiKey);

  lotwStation.addEventListener('mousedown', (event) => {
    if (event.target.tagName === 'SELECT') {
      setLotwStationOptions();
    }
  });
}

function startupButtonsAndInputs()
{
  try
  {
    setWindowThemeSelector();
    GT.pushPinMode = !(GT.settings.app.pushPinMode == true);
    togglePushPinMode();
    udpForwardEnable.checked = GT.settings.app.wsjtForwardUdpEnable;
    multicastEnable.checked = GT.settings.app.multicast;
    adifBroadcastMulticast.checked = GT.settings.app.adifBroadcastMulticast;

    GT.settings.app.gridViewMode = clamp(GT.settings.app.gridViewMode, 1, 3);
    gtGridViewMode.value = GT.settings.app.gridViewMode;
    graylineImg.src = GT.GraylineImageArray[GT.settings.app.graylineImgSrc];
    gtFlagImg.src = GT.gtFlagImageArray[GT.settings.app.gtFlagImgSrc % 2];
    offAirServicesEnable.checked = GT.settings.app.offAirServicesEnable;

    alertMuteImg.src = GT.alertImageArray[GT.settings.audio.alertMute];
    modeImg.src = GT.maidenheadModeImageArray[GT.settings.app.sixWideMode];

    if (GT.settings.app.myGrid.length > 0)
    {
      homeQTHInput.value = GT.settings.app.myGrid.substr(0, 6);
      if (ValidateGridsquare(homeQTHInput, null)) 
      {
        setCenterGridsquare();
        saveCenterGridsquare();
      }
    }
    ValidateCallsign(alertValueInput, null);

    if (GT.settings.map.offlineMode == true)
    {
      conditionsButton.style.display = "none";
      buttonPsk24CheckBoxDiv.style.display = "none";
      buttonQRZCheckBoxDiv.style.display = "none";
      buttonLOTWCheckBoxDiv.style.display = "none";
      buttonClubCheckBoxDiv.style.display = "none";

      potaButton.style.display = "none";
      lookupButton.style.display = "none";
      radarButton.style.display = "none";
      mapSelect.style.display = "none";
      mapNightSelect.style.display = "none";

    }
    else
    {
      offlineMapSelect.style.display = "none";
      offlineMapNightSelect.style.display = "none";
    }

    updateOffAirServicesViews();
  }
  catch (e)
  {
    console.error(e);
  }
}

function loadPortSettings()
{
  multicastEnable.checked = GT.settings.app.multicast;
  multicastIpInput.value = GT.settings.app.wsjtIP;

  adifBroadcastPort.value = GT.settings.app.adifBroadcastPort;
  adifBroadcastIP.value = GT.settings.app.adifBroadcastIP;
  adifBroadcastMulticast.checked = GT.settings.app.adifBroadcastMulticast;
  adifBroadcastEnable.checked = GT.settings.app.adifBroadcastEnable;
  
  setMulticastEnable(multicastEnable);
  udpPortInput.value = GT.settings.app.wsjtUdpPort;
  ValidatePort(udpPortInput, null, CheckReceivePortIsNotForwardPort);
  udpForwardPortInput.value = GT.settings.app.wsjtForwardUdpPort;
  ValidatePort(udpForwardPortInput, null, CheckForwardPortIsNotReceivePort);
  udpForwardIpInput.value = GT.settings.app.wsjtForwardUdpIp;
  ValidateIPaddresses(udpForwardIpInput, null);
  setForwardIp();
  udpForwardEnable.checked = GT.settings.app.wsjtForwardUdpEnable;
  setUdpForwardEnable(udpForwardEnable);

  setAdifBroadcastMulticast(adifBroadcastMulticast);
  ValidatePort(adifBroadcastPort, adifBroadcastEnable, CheckAdifBroadcastPortIsNotReceivePort);
  setAdifBroadcastEnable(adifBroadcastEnable);
}

function saveGridTrackerSettings()
{
  let filename = path.join(GT.appData, "app-settings.json");
  let tempFilename = path.join(GT.appData, "app-settings.json.tmp");
  
  try
  {
    const settingsString = JSON.stringify(GT.settings, null, 2);

    try {
      let existingSettings = fs.readFileSync(filename, "utf8");
      if (existingSettings === settingsString) {
        return; 
      }
    } catch (err) {
      // If fs.readFileSync fails (e.g., the file doesn't exist yet on a fresh install),
      // we just swallow the error and let the code continue down to save the file.
    }

    // Write to the temporary file
    fs.writeFileSync(tempFilename, settingsString, { flush: true });

    // Verify the temporary file
    let fileBuf = fs.readFileSync(tempFilename, "utf8");
    
    if (fileBuf === settingsString) {
      // Atomic swap
      fs.renameSync(tempFilename, filename);
    } else {
      throw new Error("Temporary file verification failed.");
    }
  }
  catch (e)
  {
    console.error(e);
    alert("Failure to write settings to: " + filename);
  }
}

function createFileSelectorHandlers()
{
  exportSettingsButton.addEventListener('click', async function(){
    saveAllSettings();
    try {
      const blob = new Blob([JSON.stringify(GT.settings, null,2)], { type: 'application/json'});
      
      const pickerOptions = {
        suggestedName: "GridTracker2 Settings.json",
        types: [
          {
            description: "GridTracker2 Settings",
            accept: {
              "application/json": [".json"]
            },
          },
        ],
      };
      const fileHandle = await window.showSaveFilePicker(pickerOptions);
      const writableFileStream = await fileHandle.createWritable();
      await writableFileStream.write(blob);
      await writableFileStream.close();
    }
    catch (e)
    {
      // user aborted or file permission issue
    }
  });

  GT.importFileHandle = null;
  importSettingsButton.addEventListener('click', async () => {
    try
    {
      const pickerOptions = {
        types: [
          {
            description: "GridTracker2 Settings",
            accept: {
              "application/json": [".json"],
            },
          },
        ],
        excludeAcceptAllOption: true,
        multiple: false,
      };

      [GT.importFileHandle] = await window.showOpenFilePicker(pickerOptions);
      let file = await GT.importFileHandle.getFile();
      importSettings(await file.text());
    }
    catch (e)
    {
      // user aborted or file permission issue
    }
  });
}

function stylePasswordInputs()
{
    const passwordInputs = document.querySelectorAll('input[type="password"]');

    passwordInputs.forEach(input => {
        // Create the wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'password-wrapper';
        
        // Wrap the input
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        // Create the button
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'password-toggle-btn';
        toggleBtn.title = I18N("togglePasswordVisibility");
        toggleBtn.innerText = emojiShow; 

        const updateIconVisibility = () => {
            // If there's text, show the button. If empty, hide it completely.
            toggleBtn.style.display = input.value.length > 0 ? 'inline-block' : 'none';
        };

        // Run it once on load (catches auto-filled passwords)
        updateIconVisibility();

        // Listen for every keystroke, paste, or deletion
        input.addEventListener('input', updateIconVisibility);
        // -------------------------------------------

        // Toggle logic (click)
        toggleBtn.addEventListener('click', () => {
            if (input.type === 'password') {
                input.type = 'text';
                toggleBtn.innerText = emojiHide;
            } else {
                input.type = 'password';
                toggleBtn.innerText = emojiShow;
            }
            input.focus(); 
        });

        wrapper.appendChild(toggleBtn);
    });
}
