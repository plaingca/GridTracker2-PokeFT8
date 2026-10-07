// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Settings: Simplepush / Pushover / OAMS notifications, daily schedules, alert mute (moved from GridTracker2.js)

function toggleAlertMute()
{
  GT.settings.audio.alertMute ^= 1;
  alertMuteImg.src = GT.alertImageArray[GT.settings.audio.alertMute];
  if (GT.settings.audio.alertMute == 1 ) {
    if (GT.audioPool) {
      GT.audioPool.forEach(player => { player.pause(); player.currentTime = 0; });
    }
    if( GT.speechAvailable)
    {
      window.speechSynthesis.cancel();
    }
  }
}

function setOamsBandActivity(checkbox)
{
  GT.settings.app.oamsBandActivity = checkbox.checked;
  updateBandActivityViews();
}

function setOamsBandActivityNeighbors(checkbox)
{
  GT.settings.app.oamsBandActivityNeighbors = checkbox.checked;
  oamsBandActivityCheck();
}

function setOamsSimplepush(checkbox)
{
  GT.settings.msg.msgSimplepush = checkbox.checked;
  simplePushDiv.style.display = GT.settings.msg.msgSimplepush == true ? "" : "none";
}

function setOamsPushover(checkbox)
{
  GT.settings.msg.msgPushover = checkbox.checked;
  pushOverDiv.style.display = GT.settings.msg.msgPushover == true ? "" : "none";
}

function newMessageSetting(whichSetting)
{
  if (whichSetting.id in GT.settings.msg && whichSetting.value != "none")
  {
    GT.settings.msg[whichSetting.id] = whichSetting.value;
    setMsgSettingsView();
  }
}

function simplepushDailySchedule(chk) {
  GT.settings.msg.msgSimplepushDailySchedule = chk.checked;
  simplepushDailyScheduleDiv.style.display = chk.checked ? "" : "none";
}

function pushoverDailySchedule(chk) {
  GT.settings.msg.msgPushoverDailySchedule = chk.checked;
  pushoverDailyScheduleDiv.style.display = chk.checked ? "" : "none";
}

// "HH:MM" -> minutes since midnight (0-1439)
function timeStringToMinutes(timeStr)
{
  const [h, m] = timeStr.split(":").map(Number);
  return (h * 60) + m;
}

// minutes since midnight -> "HH:MM" (mod 1440 in case something upstream ever
// stores an already-adjusted value, e.g. > 1440)
function minutesToTimeString(minutes)
{
  const normalized = ((minutes % 1440) + 1440) % 1440; // safe even for negatives
  const h = Math.floor(normalized / 60).toString().padStart(2, "0");
  const m = (normalized % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

// Given start/end minutes-of-day, return the *effective* end,
// pushed past midnight if the schedule wraps.
function getEffectiveEndMinutes(startMinutes, endMinutes)
{
  return (endMinutes <= startMinutes) ? (endMinutes + 1440) : endMinutes;
}

// Duration in minutes, wraparound-safe
function getScheduleDurationMinutes(startMinutes, endMinutes)
{
  return getEffectiveEndMinutes(startMinutes, endMinutes) - startMinutes;
}

// Is "now" (minutes since midnight) inside the window?
function isWithinScheduledMinutes(startMinutes, endMinutes)
{
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const effectiveEnd = getEffectiveEndMinutes(startMinutes, endMinutes);
  let effectiveNow = nowMinutes;
  if (effectiveEnd > 1439 && effectiveNow < startMinutes)
  {
    effectiveNow += 1440; // "now" is in the early-morning part of the wrapped window
  }
  return (effectiveNow >= startMinutes) && (effectiveNow < effectiveEnd);
}

function toHM(inputMinutes) {
  const t = Math.trunc(+inputMinutes || 0);
  const h = Math.floor(t / 60);
  const m = t % 60;

  let res = "";
  if (h > 0) res += h + "h ";
  if (m > 0) res += m + "m ";

  return res ? res.trim() : "0m";
}

function newScheduleTimeSetting(el)
{
  GT.settings.msg[el.id] = timeStringToMinutes(el.value);
}

function displaySimplepushSchedule()
{
  simplepushScheduleDiv.innerHTML = toHM(getScheduleDurationMinutes(GT.settings.msg.msgSimplepushScheduleStart, GT.settings.msg.msgSimplepushScheduleEnd));
}

function displayPushoverSchedule()
{
  pushoverScheduleDiv.innerHTML = toHM(getScheduleDurationMinutes(GT.settings.msg.msgPushoverScheduleStart, GT.settings.msg.msgPushoverScheduleEnd));
}
