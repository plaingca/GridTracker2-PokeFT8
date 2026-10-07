// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Map settings: map sources and API keys, night map, colours, legend, offline maps, pins (moved from gt.js)

function mapApiKeyInputChanged()
{
  let map = GT.maps[GT.settings.map.mapIndex];
  if ("keyId" in map)
  {
    let showUpdateButton = false;
    if (GT.settings.map.apiKeys[map.keyId] != mapApiKeyInput.value)
    {
      showUpdateButton = true;
    }
    GT.settings.map.apiKeys[map.keyId] = mapApiKeyInput.value;
    if (mapApiKeyInput.value == "")
    {
      showUpdateButton = false;
    }
    ValidateText(mapApiKeyInput);
    mapApiKeyApplyDiv.style.display = showUpdateButton ? "" : "none";
  }
}

function nightMapApiKeyInputChanged()
{
  let map = GT.maps[GT.settings.map.nightMapIndex];
  if ("keyId" in map)
  {
    let showUpdateButton = false;
    if (GT.settings.map.apiKeys[map.keyId] != nightMapApiKeyInput.value)
    {
      showUpdateButton = true;
    }
    GT.settings.map.apiKeys[map.keyId] = nightMapApiKeyInput.value;
    if (nightMapApiKeyInput.value == "")
    {
      showUpdateButton = false;
    }
    ValidateText(nightMapApiKeyInput);
    nightMapApiKeyApplyDiv.style.display = showUpdateButton ? "" : "none";
  }
}

function changeNightMapEnable(check)
{
  if (check.checked)
  {
    GT.settings.map.nightMapEnable = true;
    GT.nightTime = dayNight.refresh();
  }
  else
  {
    GT.settings.map.nightMapEnable = false;
  }

  nightMapSpan.style.display = GT.settings.map.nightMapEnable ? "" : "none";
  changeMapLayer();
  styleAllFlightPaths();
  redrawSpots();
}

function loadMapSettings()
{
  graylineValue.value = GT.settings.map.graylineOpacity;
  showDarknessTd.innerHTML = parseInt(graylineValue.value * 100) + "%";
  pathWidthTd.innerHTML = pathWidthValue.value = GT.settings.app.pathWidthWeight;
  qrzPathWidthTd.innerHTML = qrzPathWidthValue.value = GT.settings.app.qrzPathWidthWeight;

  mapTransValue.value = GT.settings.map.mapTrans;
  mapTransChange();

  mapTerminatorValue.value = GT.settings.map.terminatorDegreeIndex;
  mapTerminatorChange();

  gridDecay.value = GT.settings.app.gridsquareDecayTime;
  changeGridDecay();

  pathColorValue.value = GT.settings.map.pathColor;
  qrzPathColorValue.value = GT.settings.map.qrzPathColor;
  brightnessValue.value = GT.settings.map.mapOpacity;
  nightBrightnessValue.value = GT.settings.map.nightMapOpacity;

  nightPathColorValue.value = GT.settings.map.nightPathColor;
  nightQrzPathColorValue.value = GT.settings.map.nightQrzPathColor;

  mouseOverValue.checked = GT.settings.map.mouseOver;
  mergeOverlayValue.checked = GT.settings.map.mergeOverlay;

  offlineModeEnable.checked = GT.settings.map.offlineMode;

  allGridOpacityValue.value = GT.settings.map.allGridOpacity;
  
  mapSelect.value = GT.settings.map.mapIndex;
  mapNightSelect.value = GT.settings.map.nightMapIndex;

  animateValue.checked = GT.settings.map.animate;
  animateSpeedValue.value = 21 - GT.settings.map.animateSpeed;
  setAnimateView();
  splitQSLValue.checked = GT.settings.map.splitQSL;
  fitQRZvalue.checked = GT.settings.map.fitQRZ;
  qrzDxccFallbackValue.checked = GT.settings.map.qrzDxccFallback;
  CqHiliteValue.checked = GT.settings.map.CQhilite;
  focusRigValue.checked = GT.settings.map.focusRig;
  haltAllOnTxValue.checked = GT.settings.map.haltAllOnTx;

  trafficDecode.checked = GT.settings.map.trafficDecode;
  wantedByBandMode.checked = GT.settings.app.wantedByBandMode;
  includeExceptions.checked =  GT.settings.app.includeExceptions;
  includeCustomAlerts.checked = GT.settings.app.includeCustomAlerts;
  setWantedByBandModeRowView();
  
  warnOnSoundcardsChanged.checked = GT.settings.app.warnOnSoundcardsChange;

  setSpotImage();

  timezoneImg.style.filter = GT.settings.map.timezonesEnable == 1 ? "" : "grayscale(1)";
  radarImg.style.filter = GT.settings.map.usRadar ? "" : "grayscale(1)";
  predImg.src = GT.predImageArray[GT.settings.map.predMode];
  predImg.style.filter = GT.settings.map.predMode > 0 ? "" : "grayscale(1)";
  gridOverlayImg.style.filter = GT.settings.map.showAllGrids ? "" : "grayscale(1)";
  equatorImg.style.filter = GT.settings.map.equator ? "" : "grayscale(1)";
  rangeRingsImg.style.filter = GT.settings.map.showRangeRings ? "" : "grayscale(1)";
  
  GT.bandToColor = { ...GT.pskColors };

  setGridOpacity();
  setMapColors();
  setNightMapColors();

  if (GT.settings.app.myGrid.length > 3)
  {
    let LL = squareToCenter(GT.settings.app.myGrid);
    GT.settings.map.latitude = GT.myLat = LL.a;
    GT.settings.map.longitude = GT.myLon = LL.o;
  }
}

function changeMapNightPathValues()
{
  GT.settings.map.nightPathColor = nightPathColorValue.value;
  GT.settings.map.nightQrzPathColor = nightQrzPathColorValue.value;
  setNightMapColors();
  styleAllFlightPaths();
  
}

function changeMapNightValues()
{
  GT.settings.map.nightMapIndex = mapNightSelect.value;
  GT.settings.map.nightMapOpacity = nightBrightnessValue.value;

  
  changeMapLayer();
}

function setMapColors()
{
  let pathColor = pathColorValue.value == 0 ? "#000" : pathColorValue.value == 361 ? "#FFF" : "hsl(" + pathColorValue.value + ", 100%, 50%)";
  if (pathColorValue.value != 0)
  {
    pathColorDiv.style.color = "#000";
    pathColorDiv.style.backgroundColor = pathColor;
    pathColorDiv.style.textShadow = "-1px -1px 0 #FFF, 1px -1px 0 #FFF, -1px 1px 0 #FFF, 1px 1px 0 #FFF";
  }
  else
  {
    pathColorDiv.style.color = "#FFF";
    pathColorDiv.style.backgroundColor = pathColor;
    pathColorDiv.style.textShadow = "";
  }

  pathColor = qrzPathColorValue.value == 0 ? "#000" : qrzPathColorValue.value == 361 ? "#FFF" : "hsl(" + qrzPathColorValue.value + ", 100%, 50%)";
  if (qrzPathColorValue.value != 0)
  {
    qrzPathColorDiv.style.color = "#000";
    qrzPathColorDiv.style.backgroundColor = pathColor;
    qrzPathColorDiv.style.textShadow = "-1px -1px 0 #FFF, 1px -1px 0 #FFF, -1px 1px 0 #FFF, 1px 1px 0 #FFF";
  }
  else
  {
    qrzPathColorDiv.style.color = "#FFF";
    qrzPathColorDiv.style.backgroundColor = pathColor;
    qrzPathColorDiv.style.textShadow = "";
  }
}

function setNightMapColors()
{
  let pathColor = GT.settings.map.nightPathColor == 0 ? "#000" : GT.settings.map.nightPathColor == 361 ? "#FFF" : "hsl(" + GT.settings.map.nightPathColor + ", 100%, 50%)";
  if (GT.settings.map.nightPathColor != 0)
  {
    pathNightColorDiv.style.color = "#000";
    pathNightColorDiv.style.backgroundColor = pathColor;
    pathNightColorDiv.style.textShadow = "-1px -1px 0 #FFF, 1px -1px 0 #FFF, -1px 1px 0 #FFF, 1px 1px 0 #FFF";
  }
  else
  {
    pathNightColorDiv.style.color = "#FFF";
    pathNightColorDiv.style.backgroundColor = pathColor;
    pathNightColorDiv.style.textShadow = "";
  }

  pathColor = GT.settings.map.nightQrzPathColor == 0 ? "#000" : GT.settings.map.nightQrzPathColor == 361 ? "#FFF" : "hsl(" + GT.settings.map.nightQrzPathColor + ", 100%, 50%)";
  if (GT.settings.map.nightQrzPathColor != 0)
  {
    pathNightQrzColorDiv.style.color = "#000";
    pathNightQrzColorDiv.style.backgroundColor = pathColor;
    pathNightQrzColorDiv.style.textShadow = "-1px -1px 0 #FFF, 1px -1px 0 #FFF, -1px 1px 0 #FFF, 1px 1px 0 #FFF";
  }
  else
  {
    pathNightQrzColorDiv.style.color = "#FFF";
    pathNightQrzColorDiv.style.backgroundColor = pathColor;
    pathNightQrzColorDiv.style.textShadow = "";
  }
}

function changeOfflineMap()
{
  GT.settings.map.offlineMapIndex = offlineMapSelect.value;
  changeMapLayer();
}

function changeOfflineNightMap()
{
  GT.settings.map.offlineNightMapIndex = offlineMapNightSelect.value;
  changeMapLayer();
}

function changeMapValues()
{
  GT.settings.map.mapOpacity = brightnessValue.value;
  GT.settings.map.mapIndex = mapSelect.value;
  if (GT.settings.app.gtFlagImgSrc > 0 && GT.settings.map.offlineMode == false && GT.settings.app.offAirServicesEnable == true)
  {
    GT.layerVectors.gtflags.setVisible(true);
  }
  else
  {
    GT.layerVectors.gtflags.setVisible(false);
  }

  changeMapLayer();
}

function setLegendGrid(name, newColor)
{
  document.getElementById(name + "gridValue").value = newColor;
}

function setLegendGridSettings()
{
  for (let key in GT.settings.legendColors)
  {
    setLegendGrid(key, GT.settings.legendColors[key]);
  }
}

function resetLegendColors()
{
  for (let key in def_legendColors)
  {
    GT.settings.legendColors[key] = def_legendColors[key];
  }

  setLegendGridSettings();
  
  redrawGrids();
}

function changeLegendColor(source)
{
  let newColor = source.value;

  let name = source.id.replace("gridValue", "");

  GT.settings.legendColors[name] = newColor;

  if (GT.redrawFromLegendTimeoutHandle != null)
  {
    nodeTimers.clearTimeout(GT.redrawFromLegendTimeoutHandle);
  }
  GT.redrawFromLegendTimeoutHandle = nodeTimers.setTimeout(redrawGrids, 500);
}

function changeMapLayer()
{
  GT.map.removeLayer(GT.tileLayer);
  let maps, index, mapOpacity;

  if (GT.settings.map.offlineMode)
  {
    maps = GT.offlineMapsLayer;
    if (GT.settings.map.nightMapEnable && GT.nightTime)
    {
      index = GT.settings.map.offlineNightMapIndex;
      mapOpacity = Number(GT.settings.map.nightMapOpacity);
    }
    else
    {
      index = GT.settings.map.offlineMapIndex;
      mapOpacity = Number(GT.settings.map.mapOpacity);
    }

    mapApiKeyTr.style.display = "none";
    nightMapApiKeyTr.style.display = "none";
  }
  else
  {
    maps = GT.mapsLayer;
    if (GT.settings.map.nightMapEnable && GT.nightTime)
    {
      index = GT.settings.map.nightMapIndex;
      mapOpacity = Number(GT.settings.map.nightMapOpacity);
    }
    else
    {
      index = GT.settings.map.mapIndex;
      mapOpacity = Number(GT.settings.map.mapOpacity);
    }

    if ("keyId" in GT.maps[GT.settings.map.nightMapIndex])
    {
      nightMapApiKeyTr.style.display = "";
      nightMapApiKeyApplyDiv.style.display = "none";
      nightMapApiKeyInput.value = GT.settings.map.apiKeys[GT.maps[GT.settings.map.nightMapIndex].keyId];
      ValidateText(nightMapApiKeyInput);
    }
    else
    {
      nightMapApiKeyTr.style.display = "none";
    }

    if ("keyId" in GT.maps[GT.settings.map.mapIndex])
    {
      mapApiKeyTr.style.display = "";
      mapApiKeyApplyDiv.style.display = "none";
      mapApiKeyInput.value = GT.settings.map.apiKeys[GT.maps[GT.settings.map.mapIndex].keyId];
      ValidateText(mapApiKeyInput);
    }
    else
    {
      mapApiKeyTr.style.display = "none";
    }
  }

  GT.currentMapIndex = index;

  if (GT.maps[index].sourceType == "Group")
  {
    ProcessGroupMapSource(index);
    GT.tileLayer = new ol.layer.Group({ layers: maps[index] });
  }
  else
  {
    GT.tileLayer = new ol.layer.Tile({ source: maps[index] });
  }

  GT.tileLayer.setOpacity(mapOpacity);
  GT.map.getLayers().insertAt(0, GT.tileLayer);

  changeMapBackgroundColor(false);
  setAllGridOpacity();
}

function changeMapBackgroundColor(fromSettings = true)
{
  if (fromSettings == true)
  {
    GT.settings.map.backgroundColor[GT.currentMapIndex] = mapBackgroundColor.value;
  }
  else if (!(GT.currentMapIndex in GT.settings.map.backgroundColor))
  {
    GT.settings.map.backgroundColor[GT.currentMapIndex] = "#000000";
  }

  mapDiv.style.backgroundColor = mapBackgroundColor.value = GT.settings.map.backgroundColor[GT.currentMapIndex];
}

function setPins()
{
  GT.colorLeafletPins = {};
  GT.colorLeafletQPins = {};
  GT.colorLeafletQPins.worked = {};
  GT.colorLeafletQPins.confirmed = {};
  for (let i = 0; i < GT.colorBands.length; i++)
  {
    let pin = new ol.style.Icon({
      src: "img/pin/" + GT.colorBands[i] + ".png",
      anchorYUnits: "pixels",
      anchorXUnits: "pixels",
      anchor: [5, 18]
    });
    GT.colorLeafletPins[GT.colorBands[i]] = pin;
    pin = new ol.style.Icon({
      src: "img/pin/" + GT.colorBands[i] + "w.png",
      anchorYUnits: "pixels",
      anchorXUnits: "pixels",
      anchor: [5, 18]
    });
    GT.colorLeafletQPins.worked[GT.colorBands[i]] = pin;
    pin = new ol.style.Icon({
      src: "img/pin/" + GT.colorBands[i] + "q.png",
      anchorYUnits: "pixels",
      anchorXUnits: "pixels",
      anchor: [5, 18]
    });
    GT.colorLeafletQPins.confirmed[GT.colorBands[i]] = pin;
  }
}

function registerLegendContextMenus()
{
  predButton.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const menu = new Menu();
    
    if (GT.settings.map.predMode > 0)
    {
      menu.append(new MenuItem({
        type: "checkbox",
        label: I18N("legend.title"),
        checked: GT.settings.map.predLegend,
        click: function ()
        {
          GT.settings.map.predLegend = !GT.settings.map.predLegend;
          predDiv.style.display = (GT.settings.map.predLegend) ? "" : "none";
        }
      }));

      menu.append(new MenuItem({ type: "separator" }));
    }
    
    GT.predLayers.forEach((layerKey, index) => {
      menu.append(new MenuItem({
        type: "radio",
        label: I18N(layerKey),
        checked: (GT.settings.map.predMode === index),
        click: function ()
        {
          directPredLayer(index);
        }
      }));
    });
    
    menu.popup();
  });


  buttonSpotsBoxDiv.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const menu = new Menu();
    if (GT.settings.app.spotView != 0)
    {
      menu.append(new MenuItem({
        type: "checkbox",
        label: I18N("legend.title"),
        checked: GT.settings.map.spotLegend,
        click: function ()
        {
          GT.settings.map.spotLegend = !GT.settings.map.spotLegend;
          spotsDiv.style.display = GT.settings.map.spotLegend ? "" : "none";
        }
      }));
      menu.append(new MenuItem({ type: "separator" }));
    }

    GT.spotLayers.forEach((layerKey, index) => {
      menu.append(new MenuItem({
        type: "radio",
        label: I18N(layerKey),
        checked: (GT.settings.app.spotView === index),
        click: function ()
        {
          directSpotLayer(index);
        }
      }));
    });
    
    menu.popup();
  });
}

function mapTransChange()
{
  GT.settings.map.mapTrans = mapTransValue.value;

  mapTransTd.innerHTML = String(100 - parseInt(((GT.settings.map.mapTrans * 255) / 255) * 100)) + "%";
  mapSettingsDiv.style.backgroundColor = "rgba(0,0,0, " + GT.settings.map.mapTrans + ")";
}
