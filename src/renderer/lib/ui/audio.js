// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Audio: speech and voices, sound cards, media file checks (moved from GridTracker2.js)

function voiceChangedValue()
{
  GT.settings.audio.speechVoice = Number(alertVoiceInput.value) + 1;
  changeSpeechValues();
}

function timedGetVoices()
{
  try {
    GT.voices = window.speechSynthesis.getVoices();
    if (GT.voices.length > 0 &&  GT.speechAvailable == false)
    {
      alertVoiceInput.title = "Select Voice";
      for (let i = 0; i < GT.voices.length; i++)
      {
        let option = document.createElement("option");
        option.value = i;
        option.text = GT.voices[i].name;
        if (GT.voices[i].default)
        {
          option.selected = true;
        }
        alertVoiceInput.appendChild(option);
      }
      alertVoiceInput.oninput = voiceChangedValue;
      voicesDiv.appendChild(alertVoiceInput);

      if (GT.settings.audio.speechVoice > 0)
      {
        alertVoiceInput.value = GT.settings.audio.speechVoice - 1;
      }

      let msg = new SpeechSynthesisUtterance("\n");
      msg.lang = GT.localeString;
      window.speechSynthesis.speak(msg);

      GT.speechAvailable = true;
    }
    else
    {
      // try again in 10 seconds
      nodeTimers.setTimeout(timedGetVoices, 10000);
    }
  }
  catch (e)
  {
    // try again in 30 seconds
    nodeTimers.setTimeout(timedGetVoices, 30000);
  }
}

function initSpeech()
{
  nodeTimers.setTimeout(timedGetVoices, 1000);
}

function initSoundCards()
{
  navigator.mediaDevices.ondevicechange = (event) =>
  {
    updateSoundCards();
  }
  updateSoundCards();
  setAudioView();
  loadAlerts();
}

function updateSoundCards()
{
  navigator.mediaDevices
    .enumerateDevices()
    .then(gotAudioDevices)
    .catch(errorCallback);
}

function errorCallback(e) { }

function gotAudioDevices(deviceInfos)
{
  soundCardDiv.innerHTML = "";
  let newSelect = document.createElement("select");
  newSelect.id = "soundCardInput";
  newSelect.title = "Select Sound Card";

  let foundCards = {};
  for (let i = 0; i != deviceInfos.length; ++i)
  {
    let deviceInfo = deviceInfos[i];
    if (deviceInfo.kind == "audiooutput")
    {
      let option = document.createElement("option");
      option.value = deviceInfo.deviceId;
      option.text = deviceInfo.label || "Speaker " + (newSelect.length + 1);
      newSelect.appendChild(option);
      foundCards[deviceInfo.deviceId] = option.text;
    }
  }

  if (GT.settings.app.soundcards != null)
  {
    if (!(GT.settings.app.soundCard in foundCards))
    {
      if (GT.settings.app.soundCardName != null)
      {
        let foundId = false;
        // Search the found cards by name and see if we can find the right deviceId
        for (let deviceId in foundCards)
        {
          if (foundCards[deviceId] == GT.settings.app.soundCardName)
          {
            // Found it!
            GT.settings.app.soundCard = deviceId;
            foundId = true;
            break;
          }
        }
        if (foundId == false)
        {
          audioCardWarn(true);
        }
      }
      else
      {
        audioCardWarn(true);
      }
    }
    else
    {
      // Scan for differences
      let warn = false
      for (let soundcard in GT.settings.app.soundcards)
      {
        if (!(soundcard in foundCards))
        {
          warn = true;
          break;
        }
      }
      if (warn == false)
      {
        for (let soundcard in foundCards)
          {
            if (!(soundcard in GT.settings.app.soundcards))
            {
              warn = true;
              break;
            }
          }
      }
      if (warn == true)
      {
        audioCardWarn(false);
      }
    }
  }

  GT.settings.app.soundcards = Object.assign({}, foundCards);

  if (GT.settings.app.soundCard in GT.settings.app.soundcards) GT.settings.app.soundCardName = GT.settings.app.soundcards[GT.settings.app.soundCard];
  
  newSelect.oninput = soundCardChangedValue;
  soundCardDiv.appendChild(newSelect);
  soundCardInput.value = GT.settings.app.soundCard;
}

function audioCardWarn(didSetDefault)
{
  if (GT.settings.app.warnOnSoundcardsChange)
  {
    warnSoundcardHtml.innerHTML =  I18N(didSetDefault == false ? "settings.audio.devicesChanged.label" : "settings.audio.deviceDefaultSet.label");
    warnSoundcardDiv.style.display = "block";
  }
}

function soundCardChangedValue()
{
  GT.settings.app.soundCard = soundCardInput.value;
  if (GT.settings.app.soundCard in GT.settings.app.soundcards) GT.settings.app.soundCardName = GT.settings.app.soundcards[GT.settings.app.soundCard];
  playTestFile();
}

function mediaCheck()
{
  GT.LoTWLogFile = path.join(GT.appData, "LoTW_QSL.adif");
  GT.QrzLogFile = path.join(GT.appData, "qrz.adif");
  GT.clublogLogFile = path.join(GT.appData, "clublog.adif");

  logEventMedia.appendChild(newOption("none", I18N("settings.OAMS.message.newAlert.none")));

  alertMediaSelect.appendChild(newOption("none", I18N("alerts.addNew.SelectFile")));

  GT.mediaFiles = [ ...fs.readdirSync(GT.extraMediaDir), ...fs.readdirSync(GT.gtMediaDir) ];

  GT.mediaFiles.forEach((filename) =>
  {
    let noExt = path.parse(filename).name;
    logEventMedia.appendChild(newOption(filename, noExt));
    alertMediaSelect.appendChild(newOption(filename, noExt));

  });

  GT.modes = requireJson("data/modes.json");
  for (const key in GT.modes)
  {
    gtModeFilter.appendChild(newOption(key));
  }

  GT.modes_phone = requireJson("data/modes-phone.json");

  let appName = I18N("settings.about.AppName");
  let gtName = electron.ipcRenderer.sendSync("getAppName");
  if (gtName.length > 0)
  {
    appName += " - " + gtName;
  }
  appTitle.innerHTML = aboutTitle.innerHTML = loadTitle.innerHTML = appName;
}

function newOption(value, text = null, selected = null)
{
  if (text == null) text = value;
  let option = document.createElement("option");
  option.value = value;
  option.text = text;
  if (selected != null) option.selected = selected;
  return option;
}
