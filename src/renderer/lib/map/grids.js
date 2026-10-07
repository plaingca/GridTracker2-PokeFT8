// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Map grid squares: live and QSO grid boxes, grid view modes, dimming, highlighting, redraws and clears (moved from gt.js)

function hideLiveGrid(i)
{
  if (GT.layerSources.live.hasFeature(GT.liveGrids[i].rectangle))
  {
    GT.layerSources.live.removeFeature(GT.liveGrids[i].rectangle);
  }
}

function liveTriangleGrid(i)
{
  if (GT.liveGrids[i].isTriangle == false)
  {
    if (GT.layerSources.live.hasFeature(GT.liveGrids[i].rectangle))
    {
      GT.layerSources.live.removeFeature(GT.liveGrids[i].rectangle);
    }

    gridToTriangle(i, GT.liveGrids[i].rectangle, false);
    GT.liveGrids[i].isTriangle = true;
    GT.layerSources.live.addFeature(GT.liveGrids[i].rectangle);
  }
}

function qsoTriangleGrid(i)
{
  if (GT.qsoGrids[i].isTriangle == false)
  {
    if (GT.layerSources.qso.hasFeature(GT.qsoGrids[i].rectangle))
    {
      GT.layerSources.qso.removeFeature(GT.qsoGrids[i].rectangle);
    }

    gridToTriangle(i, GT.qsoGrids[i].rectangle, true);
    GT.qsoGrids[i].isTriangle = true;
    GT.layerSources.qso.addFeature(GT.qsoGrids[i].rectangle);
  }
}

function setGridView()
{
  GT.settings.app.gridViewMode = gtGridViewMode.value;
  
  redrawGrids();
}

function cycleGridView()
{
  let mode = GT.settings.app.gridViewMode;
  mode++;
  if (mode > 3) mode = 1;
  if (mode < 1) mode = 1;
  gtGridViewMode.value = GT.settings.app.gridViewMode = mode;

  
  redrawGrids();
}

function tempGridToBox(iQTH, borderColor, boxColor)
{
  let borderWeight = 2;
  let newGridBox = null;
  let LL = maidenheadToBounds(iQTH.substr(0, 4));

  let bounds = [
    [LL.lo1, LL.la1],
    [LL.lo2, LL.la2]
  ];
  newGridBox = rectangle(bounds);
  newGridBox.setId(iQTH);
  newGridBox.set("prop", null);
  const featureStyle = new ol.style.Style({
    fill: new ol.style.Fill({
      color: boxColor
    }),
    stroke: new ol.style.Stroke({
      color: borderColor,
      width: borderWeight,
      lineJoin: "round"
    }),
    zIndex: 60
  });
  newGridBox.setStyle(featureStyle);
  newGridBox.grid = iQTH;
  newGridBox.size = 0;
  GT.layerSources.temp.addFeature(newGridBox);
  return newGridBox;
}

function clearTempGrids()
{
  GT.layerSources.temp.clear();
}

function clearAwardLayer()
{
  GT.layerSources.award.clear();
}

function qthToQsoBox(iQTH, iHash, locked, DE, worked, confirmed, band)
{
  if (GT.settings.app.gridViewMode == 1) return null;

  if (GT.useTransform)
  {
    let LL = maidenheadToBounds(iQTH.substr(0, 4));
    if (MyCircle.distance(GT.myLat, GT.myLon, LL.la1, LL.lo1) * 3958.761 > k_max_aeqd_grid_in_miles)
    {
      return null;
    }
  }

  let borderColor = GT.mainBorderColor;
  let boxColor = GT.settings.legendColors.QSX + GT.gridAlpha;
  let borderWeight = 0.5;
  let myDEbox = false;
  if (worked)
  {
    boxColor = GT.settings.legendColors.QSO + GT.gridAlpha;
  }
  if (confirmed)
  {
    boxColor = GT.settings.legendColors.QSL + GT.gridAlpha;
  }

  let zIndex = 2;
  let entityVisibility = GT.settings.app.gridViewMode > 1;
  if (GT.pushPinMode == false || GT.settings.app.sixWideMode == 0) iQTH = iQTH.substr(0, 4);
  else iQTH = iQTH.substr(0, 6);
  let rect = null;

  if (iQTH in GT.qsoGrids)
  {
    rect = GT.qsoGrids[iQTH];
  }

  if (rect == null)
  {
    let triangleView = false;
    if (GT.settings.app.gridViewMode == 3 && iQTH in GT.liveGrids && entityVisibility == true && GT.pushPinMode == false)
    {
      if (confirmed)
      {
        hideLiveGrid(iQTH);
      }
      else
      {
        liveTriangleGrid(iQTH);
        triangleView = true;
      }
    }
    let LL = maidenheadToBounds(iQTH);
    if (LL.size == 6)
    {
      borderColor = "#000000FF";
      zIndex = 50;
    }
    let newRect = new MapGridRect(iQTH);

    let bounds = [
      [LL.lo1, LL.la1],
      [LL.lo2, LL.la2]
    ];
    if (triangleView == true) newRect.rectangle = triangle(bounds, true);
    else newRect.rectangle = rectangle(bounds);

    newRect.isTriangle = triangleView;

    const featureHoverStyle = new ol.style.Style({
      fill: new ol.style.Fill({
        color: boxColor
      }),
      stroke: new ol.style.Stroke({
        color: borderColor,
        width: borderWeight,
        lineJoin: "round"
      }),
      zIndex: zIndex
    });
    newRect.rectangle.setStyle(featureHoverStyle);

    newRect.rectangle.qth = iQTH;

    if (GT.pushPinMode == false && entityVisibility == true) { GT.layerSources.qso.addFeature(newRect.rectangle); }

    let newPin = GT.colorLeafletQPins.worked[band];
    if (confirmed) newPin = GT.colorLeafletQPins.confirmed[band];

    let lat = (LL.la1 + LL.la2) / 2;
    let lon = (LL.lo1 + LL.lo2) / 2;

    newRect.rectangle.pin = iconFeature(
      ol.proj.fromLonLat([lon, lat]),
      GT.settings.app.sixWideMode == 1 ? newPin : GT.pushPinIconOff,
      zIndex,
      "pin"
    );
    newRect.rectangle.pin.qth = iQTH;
    newRect.rectangle.pin.hashes = {};
    newRect.rectangle.pin.hashes[iHash] = 1;
    newRect.rectangle.pin.size = LL.size;

    if (GT.pushPinMode && entityVisibility == true) { GT.layerSources.qsoPins.addFeature(newRect.rectangle.pin); }

    newRect.rectangle.locked = locked;
    newRect.rectangle.worked = worked;
    newRect.rectangle.confirmed = confirmed;
    newRect.rectangle.size = LL.size;
    newRect.rectangle.hashes = {};
    newRect.rectangle.hashes[iHash] = 1;
    newRect.rectangle.qso = true;

    newRect.rectangle.pin.qso = true;
    GT.qsoGrids[iQTH] = newRect;
  }
  else
  {
    if (!(iHash in rect.rectangle.hashes))
    {
      rect.rectangle.hashes[iHash] = 1;
      rect.rectangle.pin.hashes[iHash] = 1;
    }
    if (!confirmed && rect.rectangle.confirmed)
    {
      return rect.rectangle;
    }
    if (worked && !rect.rectangle.worked) rect.rectangle.worked = worked;
    if (confirmed && !rect.rectangle.confirmed) { rect.rectangle.confirmed = confirmed; }
    borderColor = GT.mainBorderColor;
    if (myDEbox) borderWeight = 1;
    zIndex = 2;
    if (rect.rectangle.size == 6)
    {
      borderColor = "#000000FF";
      zIndex = 50;
    }

    const featureHoverStyle = new ol.style.Style({
      fill: new ol.style.Fill({
        color: boxColor
      }),
      stroke: new ol.style.Stroke({
        color: borderColor,
        width: borderWeight,
        lineJoin: "round"
      }),
      zIndex: zIndex
    });
    rect.rectangle.setStyle(featureHoverStyle);
  }
}

function MapGridRect(qth, age = 0) {
  this.qth = qth;
  this.age = age;
  this.rectangle = null;
  this.isTriangle = false;
}

function qthToBox(iQTH, iDEcallsign, iCQ, locked, DE, band, wspr, hash, fromLive)
{
  if (GT.settings.app.gridViewMode == 2) return null;

  if (GT.useTransform)
  {
    let LL = maidenheadToBounds(iQTH.substr(0, 4));
    if (MyCircle.distance(GT.myLat, GT.myLon, LL.la1, LL.lo1) * 3958.761 > k_max_aeqd_grid_in_miles)
    {
      return null;
    }
  }
  let borderColor = GT.mainBorderColor;
  let boxColor = GT.settings.legendColors.QSX + GT.gridAlpha;
  let borderWeight = 0.5;
  let myDEbox = false;
  if (DE == "CQ" || iCQ)
  {
    boxColor = GT.settings.legendColors.CQ + GT.gridAlpha;
  }

  if (DE == GT.settings.app.myCall)
  {
    borderColor = "#FF0000FF";
    boxColor = GT.settings.legendColors.QRZ + GT.gridAlpha;
    borderWeight = 1.0;
    myDEbox = true;
  }
  if (DE.indexOf("CQ DX") > -1)
  {
    boxColor = GT.settings.legendColors.CQDX + GT.gridAlpha;
  }
  if (locked)
  {
    boxColor = GT.settings.legendColors.QTH + GT.gridAlpha;
    borderColor = "#000000FF";
  }
  if (wspr != null)
  {
    if (wspr in GT.pskColors)
    {
      boxColor = "#" + GT.pskColors[wspr] + GT.gridAlpha
    }
    else
    {
      boxColor = "#" + GT.pskColors.OOB + GT.gridAlpha;
    }
  }
  let zIndex = 2;
  if (GT.pushPinMode == false || GT.settings.app.sixWideMode == 0) iQTH = iQTH.substr(0, 4);
  else iQTH = iQTH.substr(0, 6);
  let rect = null;
  if (iQTH == "")
  {
    for (let key in GT.liveGrids)
    {
      if (hash in GT.liveGrids[key].rectangle.liveHash)
      {
        rect = GT.liveGrids[key];
        break;
      }
    }
  }
  else
  {
    if (iQTH in GT.liveGrids)
    {
      rect = GT.liveGrids[iQTH];
    }
  }
  if (rect == null)
  {
    if (iQTH != "")
    {
      // Valid QTH
      let entityVisibility = true;
      let triangleView = false;
      if (Number(GT.settings.app.gridViewMode) == 3 && iQTH in GT.qsoGrids && GT.pushPinMode == false)
      {
        if (GT.settings.map.splitQSL || GT.qsoGrids[iQTH].rectangle.confirmed == false)
        {
          qsoTriangleGrid(iQTH);
          triangleView = true;
          entityVisibility = true;
        }
        else entityVisibility = false;
      }
      let LL = maidenheadToBounds(iQTH);
      if (LL.size == 6)
      {
        borderColor = "#000000FF";
        zIndex = 50;
      }

      let newRect = new MapGridRect(iQTH, GT.timeNow);

      let bounds = [
        [LL.lo1, LL.la1],
        [LL.lo2, LL.la2]
      ];
      if (triangleView == true) newRect.rectangle = triangle(bounds, false);
      else newRect.rectangle = rectangle(bounds);

      newRect.isTriangle = triangleView;
      newRect.rectangle.setId(iQTH);

      const featureHoverStyle = new ol.style.Style({
        fill: new ol.style.Fill({
          color: boxColor
        }),
        stroke: new ol.style.Stroke({
          color: borderColor,
          width: borderWeight,
          lineJoin: "round"
        }),
        zIndex: zIndex
      });
      newRect.rectangle.setStyle(featureHoverStyle);

      newRect.rectangle.qth = iQTH;

      if (GT.pushPinMode == false && entityVisibility)
      {
        GT.layerSources.live.addFeature(newRect.rectangle);
      }

      let lat = (LL.la1 + LL.la2) / 2;
      let lon = (LL.lo1 + LL.lo2) / 2;

      newRect.rectangle.pin = iconFeature(
        ol.proj.fromLonLat([lon, lat]),
        GT.colorLeafletPins[band],
        zIndex,
        "pin"
      );
      newRect.rectangle.pin.qth = iQTH;
      newRect.rectangle.pin.liveHash = {};
      newRect.rectangle.pin.liveHash[hash] = 1;
      newRect.rectangle.pin.size = LL.size;

      if (GT.pushPinMode && entityVisibility == true) { GT.layerSources.livePins.addFeature(newRect.rectangle.pin); }

      newRect.rectangle.locked = locked;
      newRect.rectangle.size = LL.size;
      newRect.rectangle.liveHash = {};
      newRect.rectangle.liveHash[hash] = 1;
      newRect.rectangle.qso = false;

      newRect.rectangle.pin.qso = false;
      GT.liveGrids[iQTH] = newRect;
    }
  }
  else
  {
    if (!(hash in rect.rectangle.liveHash))
    {
      rect.rectangle.liveHash[hash] = 1;
      rect.rectangle.pin.liveHash[hash] = 1;
    }
    rect.rectangle.locked = rect.rectangle.locked | locked;
    if (rect.rectangle.locked)
    {
      boxColor = GT.settings.legendColors.QTH + GT.gridAlpha;
      borderColor = "#000000FF";
    }
    if (myDEbox) borderWeight = 1;
    if (rect.rectangle.size == 6)
    {
      borderColor = "#000000FF";
      // borderWeight = 1.0;
      zIndex = 50;
    }

    if (fromLive)
    {
      // Reset the age of the old grid if this is a live update
      rect.age = GT.timeNow;
    }

    const featureHoverStyle = new ol.style.Style({
      fill: new ol.style.Fill({
        color: boxColor
      }),
      stroke: new ol.style.Stroke({
        color: borderColor,
        width: borderWeight,
        lineJoin: "round"
      }),
      zIndex: zIndex
    });
    rect.rectangle.setStyle(featureHoverStyle);
  }
}

function dimFunction(qthObj)
{
  if (qthObj.rectangle.locked == false)
  {
    let featureStyle = qthObj.rectangle.getStyle();
    let featureFill = featureStyle.getFill();
    let fillColor = featureFill.getColor();
    let featureStroke = featureStyle.getStroke();
    let strokeColor = featureStroke.getColor();
    let percent = 1.0 - (GT.timeNow - qthObj.age) / gridDecay.value;
    let alpha = Math.max(0.06, (GT.settings.map.gridAlpha / 255) * percent);

    fillColor = alphaTo(fillColor, alpha);
    featureFill.setColor(fillColor);
    featureStyle.setFill(featureFill);

    strokeColor = alphaTo(strokeColor, alpha);
    featureStroke.setColor(strokeColor);
    featureStyle.setStroke(featureStroke);

    qthObj.rectangle.setStyle(featureStyle);
  }
}

function dimGridsquare()
{
  if (gridDecay.value == 0) return;
  
  const liveGridKeys = Object.keys(GT.liveGrids);
  for (let idx = 0; idx < liveGridKeys.length; idx++)
  {
    const i = liveGridKeys[idx];
    const liveGrid = GT.liveGrids[i];
    
    dimFunction(liveGrid);

    if (GT.timeNow - liveGrid.age >= gridDecay.value && liveGrid.rectangle.locked == false)
    {
      // Walk the rectangles DEcall's and remove them from GT.liveCallsigns
      const liveHashKeys = Object.keys(liveGrid.rectangle.liveHash);
      for (let hIdx = 0; hIdx < liveHashKeys.length; hIdx++)
      {
        const CallIsKey = liveHashKeys[hIdx];
        if (CallIsKey in GT.liveCallsigns)
        {
          delete GT.liveCallsigns[CallIsKey];
        }
      }
      
      if (liveGrid.rectangle.pin != null)
      {
        if (GT.layerSources.livePins.hasFeature(liveGrid.rectangle.pin))
        {
          GT.layerSources.livePins.removeFeature(liveGrid.rectangle.pin);
        }
      }
      
      if (GT.layerSources.live.hasFeature(liveGrid.rectangle))
      {
        GT.layerSources.live.removeFeature(liveGrid.rectangle);

        if (GT.settings.app.gridViewMode == 3 && i in GT.qsoGrids)
        {
          if (GT.qsoGrids[i].isTriangle)
          {
            triangleToGrid(i, GT.qsoGrids[i].rectangle);
            GT.qsoGrids[i].isTriangle = false;
          }
        }
      }

      GT.liveGrids[i] = null;
      delete GT.liveGrids[i];
    }
  }
}

function clearGrids()
{
  GT.layerSources.live.clear();
  GT.layerSources.livePins.clear();
  GT.liveGrids = {};
}

function clearQsoGrids()
{
  const layerSources = GT.layerSources;

  layerSources.qso.clear();
  layerSources.qsoPins.clear();

  GT.qsoGrids = {};

  resetWorkingCollection(GT.dxccInfo);
  resetWorkingCollection(GT.cqZones);
  resetWorkingCollection(GT.ituZones);
  resetWorkingCollection(GT.wasZones);
  resetWorkingCollection(GT.wacpZones);
  resetWorkingCollection(GT.wacZones);
  resetWorkingCollection(GT.countyData);
  resetWorkingCollection(GT.us48Data);
}

function setHomeGridsquare()
{
  let hash = GT.settings.app.myGrid;
  qthToBox(GT.settings.app.myGrid, GT.settings.app.myCall, false, true, "", GT.settings.app.myBand, null, hash, false);

  let newCallsign;
  let push = false;

  if (!(hash in GT.liveCallsigns))
  {
    // FIX: Use the rigid constructor to preserve V8 hidden classes!
    newCallsign = new LiveCallsign(
      GT.settings.app.myCall, // DECall
      "Self",                 // DXCall
      GT.settings.app.myGrid,
      GT.settings.app.myMode,
      GT.settings.app.myBand,
      GT.settings.app.myGrid, // Msg
      callsignToDxcc(GT.settings.app.myCall),
      timeNowSec()
    );
    push = true;
  }
  else
  {
    newCallsign = GT.liveCallsigns[hash];
  }

  // Force reset data
  newCallsign.DEcall = GT.settings.app.myCall;
  newCallsign.grid = GT.settings.app.myGrid;
  newCallsign.wspr = null;
  newCallsign.msg = GT.settings.app.myGrid;
  newCallsign.RSTsent = "-";
  newCallsign.RSTrecv = "-";
  newCallsign.time = timeNowSec();
  newCallsign.delta = -1;
  newCallsign.DXcall = "Self";
  newCallsign.mode = GT.settings.app.myMode;
  newCallsign.band = GT.settings.app.myBand;
  newCallsign.locked = true;

  GT.myDXCC = newCallsign.dxcc = callsignToDxcc(GT.settings.app.myCall);

  if (push) GT.liveCallsigns[hash] = newCallsign;
}

function removeDazzleGrid()
{
  if (GT.dazzleTimeout)
  {
    nodeTimers.clearTimeout(GT.dazzleTimeout);
    GT.dazzleTimeout = null;
  }

  if (GT.dazzleGrid)
  {
    if (GT.layerSources.temp.hasFeature(GT.dazzleGrid)) { GT.layerSources.temp.removeFeature(GT.dazzleGrid); }
    GT.dazzleGrid = null;
  }
}

function dazzleGrid(LL)
{
  removeDazzleGrid();

  let borderWeight = 5;
  let bounds = [[LL.lo1, LL.la1], [LL.lo2, LL.la2]];

  GT.dazzleGrid = rectangle(bounds, "dazzle");

  const featureStyle = new ol.style.Style({
    stroke: new ol.style.Stroke({
      color: "#000",
      width: borderWeight,
      lineJoin: "round",
      lineDash: GT.flightPathLineDash,
      lineDashOffset: GT.flightPathTotal - GT.flightPathOffset
    }),
    zIndex: 60
  });

  GT.dazzleGrid.setStyle(featureStyle);

  GT.layerSources.temp.addFeature(GT.dazzleGrid);
  setAnimate(true);

  GT.dazzleTimeout = nodeTimers.setTimeout(removeDazzleGrid, 3000);
}

function showDxccGrids(grid)
{
  for (let x = 0; x < GT.gridToDXCC[grid].length; x++)
  {
    let dxcc = GT.dxccInfo[GT.gridToDXCC[grid][x]];
    let color = parseInt(GT.gridToDXCC[grid][x]);
    let boxColor = "hsl(" + (color*3.3) % 360 + " 100% 50% / 20%)";
    let borderColor = "#0000FFFF";
    let borderWeight = 0.1;

    for (let y = 0; y < dxcc.mh.length; y++ )
    {
      let LL = maidenheadToBounds(dxcc.mh[y]);
      let bounds = [
        [LL.lo1, LL.la1],
        [LL.lo2, LL.la2]
      ];

      GT.layerSources.temp.addFeature(gridFeature(
        dxcc.mh[y],
        rectangle(bounds),
        null,
        boxColor,
        borderColor,
        borderWeight
      ));
    }
  }
}

function validatePropMode(propMode)
{
  if (GT.settings.app.gtPropFilter == "mixed") return true;

  return GT.settings.app.gtPropFilter == propMode;
}

function validateMapBandAndMode(band, mode) {
  const app = GT.settings.app; // Cache reference
  const bandFilter = app.gtBandFilter;
  
  if (bandFilter.length === 0 || (bandFilter === "auto" ? app.myBand === band : bandFilter === band)) {
    const modeFilter = app.gtModeFilter;
    
    if (modeFilter.length === 0) return true;
    if (modeFilter === "auto") return app.myMode === mode;
    if (modeFilter === "Digital") return !!GT.modes[mode];       // Fast boolean cast
    if (modeFilter === "Phone") return !!GT.modes_phone[mode];   // Fast boolean cast
    if (modeFilter === "CW") return mode === "CW";
    
    return modeFilter === mode;
  }
  return false;
}

function redrawLiveGrids(honorAge = true)
{
  const callKeys = Object.keys(GT.liveCallsigns);
  for (let idx = 0; idx < callKeys.length; idx++)
  {
    const i = callKeys[idx];
    const call = GT.liveCallsigns[i];
    if (GT.settings.app.gridViewMode != 2 && validateMapBandAndMode(call.band, call.mode) && (honorAge == false || (honorAge == true && GT.timeNow - call.age <= gridDecay.value)))
    {
      qthToBox(call.grid, call.DEcall, false, false, call.DXcall, call.band, call.wspr, i, false);
    }
  }
  
  if (honorAge == false)
  {
    const gridKeys = Object.keys(GT.liveGrids);
    for (let idx = 0; idx < gridKeys.length; idx++)
    {
      GT.liveGrids[gridKeys[idx]].age = GT.timeNow;
    }
  }
  else
  {
    dimGridsquare();
  }
}

function redrawGrids()
{
  if (GT.settings.app.gridViewMode == 2) removePaths();
  clearGrids();
  clearQsoGrids();

  GT.QSLcount = 0;
  GT.QSOcount = 0;

  for (const [i, qsoObj] of Object.entries(GT.QSOhash))
  {
    
    let finalGrid = qsoObj.grid;
    let worked = qsoObj.worked;
    let didConfirm = qsoObj.confirmed;
    let band = qsoObj.band;
    let mode = qsoObj.mode;
    
    GT.QSOcount++;
    if (didConfirm) GT.QSLcount++;

    if (validateMapBandAndMode(band, mode) && validatePropMode(qsoObj.propMode))
    {
      if (GT.settings.app.gridViewMode > 1)
      {
        if (finalGrid.length > 0)
        {
          qthToQsoBox(finalGrid, i, false, qsoObj.DXcall, worked, didConfirm, band);
        }
        for (let vuccIdx = 0; vuccIdx < qsoObj.vucc_grids.length; vuccIdx++)
        {
          qthToQsoBox(qsoObj.vucc_grids[vuccIdx], i, false, qsoObj.DXcall, worked, didConfirm, band);
        }
      }

      let state = qsoObj.state;
      let cont = qsoObj.cont;
      let finalDxcc = qsoObj.dxcc;
      let cnty = qsoObj.cnty;
      let ituz = qsoObj.ituz;
      let cqz = qsoObj.cqz;

      updateZoneStats(GT.dxccInfo, finalDxcc, worked, didConfirm, band, mode);

      if (state != null && isKnownCallsignDXCC(finalDxcc) && state in GT.StateData) 
      {
        if (state in GT.wasZones) updateZoneStats(GT.wasZones, state, worked, didConfirm, band, mode);
        else if (state in GT.wacpZones) updateZoneStats(GT.wacpZones, state, worked, didConfirm, band, mode);
      }

      if (cnty != null && cnty in GT.cntyToCounty) updateZoneStats(GT.countyData, cnty, worked, didConfirm, band, mode);
      if (cont != null && cont in GT.shapeData) updateZoneStats(GT.wacZones, GT.shapeData[cont].properties.name, worked, didConfirm, band, mode);
      if (cqz && cqz.length > 0) updateZoneStats(GT.cqZones, cqz, worked, didConfirm, band, mode);
      if (ituz && ituz.length > 0) updateZoneStats(GT.ituZones, ituz, worked, didConfirm, band, mode);
      if (finalGrid.length > 0) updateZoneStats(GT.us48Data, finalGrid.substr(0, 4), worked, didConfirm, band, mode);
      for (let vIdx = 0; vIdx < qsoObj.vucc_grids.length; vIdx++) updateZoneStats(GT.us48Data, qsoObj.vucc_grids[vIdx].substr(0, 4), worked, didConfirm, band, mode);
    }
  }

  const viewKeys = Object.keys(GT.viewInfo);
  for (let vIdx = 0; vIdx < viewKeys.length; vIdx++)
  {
    let layer = viewKeys[vIdx];
    let search = GT[GT.viewInfo[layer][0]];
    let worked = 0;
    let confirmed = 0;
    
    const searchKeys = Object.keys(search);

    if (layer == 0)
    {
      for (let sIdx = 0; sIdx < searchKeys.length; sIdx++)
      {
        const key = searchKeys[sIdx];
        if (search[key].rectangle.worked) worked++;
        if (search[key].rectangle.confirmed) confirmed++;
      }
    }
    else if (layer == 5)
    {
      for (let sIdx = 0; sIdx < searchKeys.length; sIdx++)
      {
        const key = searchKeys[sIdx];
        if (search[key].geo != "deleted")
        {
          if (search[key].worked) worked++;
          if (search[key].confirmed) confirmed++;
        }
      }
    }
    else
    {
      for (let sIdx = 0; sIdx < searchKeys.length; sIdx++)
      {
        const key = searchKeys[sIdx];
        if (search[key].worked) worked++;
        if (search[key].confirmed) confirmed++;
      }
    }
    GT.viewInfo[layer][2] = worked;
    GT.viewInfo[layer][3] = confirmed;
  }

  redrawLiveGrids(false);
  reloadInfo();
  setHomeGridsquare();
  setTrophyOverlay(GT.currentOverlay);
  updateCountStats();
  redrawParks();
}

function setGridOpacity()
{
  opacityValue.value = GT.settings.map.gridAlpha;
  showOpacityTd.innerHTML = parseInt((GT.settings.map.gridAlpha / 255) * 100) + "%";
  GT.gridAlpha = parseInt(GT.settings.map.gridAlpha).toString(16).padStart(2, "0");
}

function changeGridOpacity()
{
  GT.settings.map.gridAlpha = opacityValue.value;
  showOpacityTd.innerHTML = parseInt((GT.settings.map.gridAlpha / 255) * 100) + "%";
  GT.gridAlpha = parseInt(GT.settings.map.gridAlpha).toString(16).padStart(2, "0");
}

function setAllGridOpacity()
{
  GT.settings.map.allGridOpacity = allGridOpacityValue.value;
  allGridOpacityTd.innerHTML = parseInt(allGridOpacityValue.value * 100) + "%";

  if (GT.layerVectors.lineGrids)
  {
    GT.layerVectors.lineGrids.setOpacity(Number(GT.settings.map.allGridOpacity));
    GT.layerVectors.longGrids.setOpacity(Number(GT.settings.map.allGridOpacity));
    GT.layerVectors.bigGrids.setOpacity(Number(GT.settings.map.allGridOpacity));
  }
}
