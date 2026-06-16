function prepareRosterSettings()
{
  let rosterSettings = {
    bands: {},
    modes: {},
    onlyHits: GT.activeRoster.exceptions.onlyHits,
    isAwardTracker: false,
    now: timeNowSec()
  }

  if (GT.activeRoster.logbook.referenceNeed == LOGBOOK_AWARD_TRACKER)
  {
    GT.activeRoster.exceptions.onlyHits = false;
    rosterSettings.isAwardTracker = true;
  }

  if (GT.activeRoster.logbook.huntNeed == "mixed")
  {
    rosterSettings.huntIndex = GT.tracker.confirmed;
    rosterSettings.workedIndex = GT.tracker.worked;
    rosterSettings.layeredMode = LAYERED_MODE_FOR[GT.activeRoster.logbook.referenceNeed];
  }
  else if (GT.activeRoster.logbook.huntNeed == "worked")
  {
    rosterSettings.huntIndex = GT.tracker.worked;
    rosterSettings.workedIndex = false;
    rosterSettings.layeredMode = false;
  }
  else if (GT.activeRoster.logbook.huntNeed == "confirmed")
  {
    rosterSettings.huntIndex = GT.tracker.confirmed;
    rosterSettings.workedIndex = GT.tracker.worked;
    rosterSettings.layeredMode = false;
  }
  else
  {
    console.log("Invalid/Unknown huntNeed");
    rosterSettings.huntIndex = false;
    rosterSettings.workedIndex = false;
    rosterSettings.layeredMode = false;
  }

  return rosterSettings;
}
