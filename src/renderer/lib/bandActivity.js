// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Band activity: PSK Reporter band activity fetch and display (moved from GridTracker2.js)

function updateBandActivityViews()
{
  if (GT.settings.map.offlineMode == true || GT.settings.app.offAirServicesEnable == false)
  {
    bandActivityEnableTr.style.display = "none";
  }
  else
  {
    bandActivityEnableTr.style.display = "";
  }

  if (GT.settings.map.offlineMode == true || GT.settings.app.offAirServicesEnable == false || GT.settings.app.oamsBandActivity == false )
  {
    GT.oamsBandActivityData = null;
    bandActivityNeighborTr.style.display = "none";
    bandActivityDiv.style.display = "none";
    openBaWindow(false);
  }
  else
  {
    bandActivityNeighborTr.style.display = "";
    bandActivityDiv.style.display = "";
    oamsBandActivityCheck();
  }

  renderBandActivity();
}

function renderBandActivity()
{
  if (GT.settings.app.oamsBandActivity == false) return;

  let buffer = [];
  if (typeof GT.settings.bandActivity.lines[GT.settings.app.myMode] != "undefined" || GT.oamsBandActivityData != null)
  {
    let lines = (GT.settings.app.myMode in GT.settings.bandActivity.lines) ? GT.settings.bandActivity.lines[GT.settings.app.myMode] : [];
    let bands = (GT.myDXCC in GT.callsignDatabaseUSplus) ? GT.us_bands : GT.non_us_bands;
    let bandData = {};
    let maxValue = 0;

    for (let i = 0; i < bands.length; i++)
    {
      bandData[bands[i]] = { pskScore: 0, pskSpots: 0, pskTx: 0, pskRx: 0, oamsRxSpots: 0, oamsTxSpots: 0, oamsTx: 0, oamsRx: 0, oamsDecodes: 0, oamsScore: 0 };
    }

    for (let x = 0; x < lines.length; x++)
    {
      let firstChar = lines[x].charCodeAt(0);
      if (firstChar != 35 && lines[x].length > 1)
      {
        // doesn't begins with # and has something
        let values = lines[x].trim().split(" ");
        let band = formatBand(Number(Number(values[0]) / 1000000));

        if (band in bandData)
        {
          let place = bandData[band];

          place.pskScore += Number(values[1]);
          place.pskSpots += Number(values[2]);
          place.pskTx += Number(values[3]);
          place.pskRx += Number(values[4]);
          if (maxValue < place.pskScore) maxValue = place.pskScore;
          if (maxValue < place.pskSpots) maxValue = place.pskSpots;
        }
      }
    }

    if (GT.settings.app.offAirServicesEnable == true && GT.settings.app.oamsBandActivity == true && GT.oamsBandActivityData)
    {
      for (const grid in GT.oamsBandActivityData)
      {
        for (const band in GT.oamsBandActivityData[grid])
        {
          if (band in bandData)
          {
            let place = bandData[band];
            let data = GT.oamsBandActivityData[grid][band];

            place.oamsScore ??= 0;
            place.oamsDecodes += data.d;
            place.oamsRxSpots += data.rS;
            place.oamsTxSpots += data.tS;
            place.oamsTx += data.t;
            place.oamsRx += data.r;

            if (data.r > 0)
            {
              place.oamsScore += parseInt((data.d > data.rS) ? (data.d / data.r) + (data.t > 0 ? data.tS / data.t : 0) : (data.rS / data.r) + (data.t > 0 ? data.tS / data.t : 0));
            }
            else
            {
              place.oamsScore += parseInt(data.t > 0 ? data.tS / data.t : 0);
            }
            if (maxValue < place.oamsScore) maxValue = place.oamsScore;
          }
        }
      }
    }

    let scaleFactor = 1.0;
    if (maxValue > 26)
    {
      scaleFactor = 26 / maxValue;
    }
    for (const band in bandData)
    {
      let blockMyBand = (band == GT.settings.app.myBand) ? " class='myBand' " : "";
      let title = [];
      let blueBarValue;

      if (GT.settings.app.offAirServicesEnable == true && GT.settings.app.oamsBandActivity == true)
      {
        title.push("OAMS (blue)\n");
        title.push("\tScore: " + bandData[band].oamsScore + "\n\tDecodes: " + bandData[band].oamsDecodes + "\n\tTX-Spots: " + bandData[band].oamsTxSpots + "\n\tRX-Spots: " + bandData[band].oamsRxSpots + "\n\tTx: " + bandData[band].oamsTx + "\tRx: " + bandData[band].oamsRx);
        title.push("\nPSK-Reporter (red)\n");
        title.push("\tScore: " + bandData[band].pskScore + "\n\tSpots: " + bandData[band].pskSpots + "\n\tTx: " + bandData[band].pskTx + "\tRx: " + bandData[band].pskRx);
        blueBarValue = (bandData[band].oamsScore * scaleFactor + 1);
      }
      else
      {
        title = ["Score: " + bandData[band].pskScore + "\nSpots: " + bandData[band].pskSpots + "\nTx: " + bandData[band].pskTx + "\tRx: " + bandData[band].pskRx];
        blueBarValue = (bandData[band].pskSpots * scaleFactor + 1);
      }

      buffer.push("<div title='" + title.join("") + "' style='display:inline-block;margin:1px;' class='aBand'>");
      buffer.push("<div style='height: " + blueBarValue + "px;' class='barRx'></div>");
      buffer.push("<div style='height: " + (bandData[band].pskScore * scaleFactor + 1) + "px;' class='barTx'></div>"); 
      buffer.push("<div style='font-size:10px' " + blockMyBand + ">" + parseInt(band) + "</div>");
      buffer.push("</div>");
    }
  }
  else
  {
    buffer = ["..no data yet.."];
  }
  graphDiv.innerHTML = buffer.join("");
  if (GT.baWindowInitialized == true)
  {
    GT.baWindowHandle.window.graphDiv.innerHTML = buffer.join("");
  }
}

function pskBandActivityCallback(buffer, flag)
{
  let result = String(buffer);
  if (result.indexOf("frequency score") > -1)
  {
    // looks good so far
    GT.settings.bandActivity.lines[GT.settings.app.myMode] = result.split("\n");
    GT.settings.bandActivity.lastUpdate[GT.settings.app.myMode] = GT.timeNow + 600;
  }

  renderBandActivity();
}

function pskGetBandActivity()
{
  if (GT.settings.map.offlineMode == true || GT.settings.app.offAirServicesEnable == false || GT.settings.app.oamsBandActivity == false) return;
  
  if (typeof GT.settings.bandActivity.lastUpdate[GT.settings.app.myMode] == "undefined")
  {
    GT.settings.bandActivity.lastUpdate[GT.settings.app.myMode] = 0;
  }

  if (GT.settings.app.myMode.length > 0 && GT.settings.app.myGrid.length > 0 && GT.timeNow > GT.settings.bandActivity.lastUpdate[GT.settings.app.myMode])
  {
    getBuffer(
      "https://pskreporter.info/cgi-bin/psk-freq.pl?mode=" + GT.settings.app.myMode + "&grid=" + GT.settings.app.myGrid.substr(0, 4) + "&cb=" + timeNowSec(),
      pskBandActivityCallback,
      null,
      "https",
      443
    );
  }

  renderBandActivity();

  if (GT.pskBandActivityTimerHandle != null)
  {
    nodeTimers.clearInterval(GT.pskBandActivityTimerHandle);
  }

  GT.pskBandActivityTimerHandle = nodeTimers.setInterval(pskGetBandActivity, 601000); // every 20 minutes, 1 second
}
