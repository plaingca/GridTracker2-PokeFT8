// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Map overlays: grayline/moon toggles, award (trophy) overlays, range rings, equator, timezones, all-grids, radar, propagation prediction (moved from gt.js)

function toggleEarth()
{
  GT.settings.app.graylineImgSrc ^= 1;
  graylineImg.src = GT.GraylineImageArray[GT.settings.app.graylineImgSrc];
  if (GT.settings.app.graylineImgSrc == 1)
  {
    dayNight.hide();
    GT.nightTime = dayNight.refresh();
  }
  else
  {
    GT.nightTime = dayNight.refresh();
    dayNight.show();
  }

}

function changeGrayline()
{
  GT.settings.map.graylineOpacity = graylineValue.value;
  showDarknessTd.innerHTML = parseInt(graylineValue.value * 100) + "%";
  
  GT.nightTime = dayNight.refresh();
}

function toggleMoon()
{
  GT.settings.app.moonTrack ^= 1;
  (GT.settings.app.moonTrack == 1) ? moonLayer.show() : moonLayer.hide();
}

function cycleTrophyOverlay()
{
  GT.currentOverlay++;
  GT.currentOverlay %= 9;

  setTrophyOverlay(GT.currentOverlay);
}

function makeTitleInfo(mapWindow)
{
  let band = GT.settings.app.gtBandFilter.length == 0 ? "Mixed" : GT.settings.app.gtBandFilter == "auto" ? GT.settings.app.myBand : GT.settings.app.gtBandFilter;
  let mode = GT.settings.app.gtModeFilter.length == 0 ? "Mixed" : GT.settings.app.gtModeFilter == "auto" ? GT.settings.app.myMode : GT.settings.app.gtModeFilter;

  let news = `GridTracker2 [Band: ${band} Mode: ${mode}`;
  let end = "]";

  if (mapWindow)
  {
    news += ` Layer: ${GT.viewInfo[GT.currentOverlay][1]}`;
  }

  if (GT.currentOverlay == 0 && GT.settings.app.gridViewMode == 1) { return news + end; }

  let workline = ` - Worked ${GT.viewInfo[GT.currentOverlay][2]} Confirmed ${GT.viewInfo[GT.currentOverlay][3]}`;
  if (GT.viewInfo[GT.currentOverlay][2] <= GT.viewInfo[GT.currentOverlay][4] && GT.viewInfo[GT.currentOverlay][4] > 0)
  {
    end = ` Needed ${(GT.viewInfo[GT.currentOverlay][4] - GT.viewInfo[GT.currentOverlay][3])}]`;
  }
  return news + workline + end;
}

function gtTrophyLayerChanged(element)
{
  setTrophyOverlay(element.value);
}

function setTrophyOverlay(which)
{
  gtTrophyLayer.value = GT.currentOverlay = GT.settings.map.trophyOverlay = which;
  window.document.title = makeTitleInfo(true);
  myTrophyTooltip.style.zIndex = -1;

  clearAwardLayer();

  if (which == 0)
  {
    for (const key in GT.layerVectors) GT.layerVectors[key].setVisible(true);

    GT.layerVectors.award.setVisible(false);

    if (GT.timezoneLayer) GT.timezoneLayer.setVisible(true);
  }
  else
  {
    if (GT.settings.map.mergeOverlay == false)
    {
      for (const key in GT.layerVectors) GT.layerVectors[key].setVisible(false);
    }
    else
    {
      for (const key in GT.layerVectors) GT.layerVectors[key].setVisible(true);
    }

    GT.layerVectors.award.setVisible(true);

    if (GT.timezoneLayer) GT.timezoneLayer.setVisible(false);

    mapLoseFocus();
  }

  if (GT.settings.app.gtFlagImgSrc > 0 && GT.settings.app.offAirServicesEnable == true && GT.settings.map.offlineMode == false)
  {
    GT.layerVectors.gtflags.setVisible(true);
  }
  else
  {
    GT.layerVectors.gtflags.setVisible(false);
  }

  if (which in GT.awardLayers)
  {
    const layer = GT.awardLayers[which];
    const data = GT[layer.o];
    for (const key in data)
    {
      let boxColor = layer.bx;
      let borderColor = layer.br;
      let borderWeight = layer.bw;
      if (data[key].confirmed)
      {
        boxColor = layer.dc;
        borderWeight = layer.ww;
      }
      else if (data[key].worked)
      {
        boxColor = layer.dw;
        borderWeight = layer.ww;
      }
      if (layer.s)
      {
        // Old DXCCs may be deleted
        if (data[key].geo != "deleted")
        {
          GT.layerSources.award.addFeature(shapeFeature(
            key,
            data[key].geo,
            layer.p,
            boxColor,
            borderColor,
            borderWeight
          ));
        }
      }
      else
      {
        let LL = maidenheadToBounds(key);
        let bounds = [[LL.lo1, LL.la1], [LL.lo2, LL.la2]];

        GT.layerSources.award.addFeature(gridFeature(
          key,
          rectangle(bounds),
          layer.p,
          boxColor,
          borderColor,
          borderWeight
        ));
      }
    }
  }

  updateSpottingViews();
}

function toggleAllGrids()
{
  GT.settings.map.showAllGrids = !GT.settings.map.showAllGrids;
  gridOverlayImg.style.filter = GT.settings.map.showAllGrids ? "" : "grayscale(1)";
  drawAllGrids();
}

function changeEquatorEnable()
{
  GT.settings.map.equator = !GT.settings.map.equator;
  equatorImg.style.filter = GT.settings.map.equator ? "" : "grayscale(1)";
  drawRangeRings();
}

function changeRangeRingsEnable()
{
  GT.settings.map.showRangeRings = !GT.settings.map.showRangeRings;
  rangeRingsImg.style.filter = GT.settings.map.showRangeRings ? "" : "grayscale(1)";
  drawRangeRings();
}

function createRadar()
{
  let layerSource = new ol.source.TileWMS({
    projection: "EPSG:3857",
    url: "https://mapservices.weather.noaa.gov:443/eventdriven/services/radar/radar_base_reflectivity/MapServer/WMSServer",
    attributions: `<a href="https://radar.weather.gov/" target="_blank">NWS</a>`,
    params: { LAYERS: "0" }
  });

  let layerVector = new ol.layer.Tile({
    source: layerSource,
    visible: true,
    opacity: 0.6,
    zIndex: 900
  });

  layerVector.set("name", "radar");

  return layerVector;
}

function toggleRadar()
{
  GT.settings.map.usRadar = !GT.settings.map.usRadar;
  displayRadar();
  
}

function displayRadar()
{
  if (GT.settings.map.usRadar && GT.settings.map.offlineMode == false)
  {
    if (GT.usRadar == null)
    {
      GT.usRadar = createRadar();
      GT.map.addLayer(GT.usRadar);
    }

    if (GT.usRadarInterval == null) { GT.usRadarInterval = nodeTimers.setInterval(radarRefresh, 600000); }
  }
  else
  {
    if (GT.usRadarInterval != null)
    {
      nodeTimers.clearInterval(GT.usRadarInterval);
      GT.usRadarInterval = null;
    }
    if (GT.usRadar)
    {
      GT.map.removeLayer(GT.usRadar);
      GT.usRadar = null;
    }
  }

  radarImg.style.filter = GT.settings.map.usRadar ? "" : "grayscale(1)";
}

function radarRefresh()
{
  if (GT.usRadar != null && GT.settings.map.offlineMode == false)
  {
    GT.usRadar.getSource().updateParams({ ol3_salt: Math.random() });
    GT.usRadar.getSource().refresh();
  }
}

function toggleTimezones()
{
  GT.settings.map.timezonesEnable ^= 1;
  displayTimezones();
}

function displayTimezones()
{
  timezoneImg.style.filter = GT.settings.map.timezonesEnable == 1 ? "" : "grayscale(1)";

  if (GT.settings.map.timezonesEnable == 1)
  {
    if (GT.timezoneLayer == null)
    {
      GT.timezoneLayer = createGeoJsonLayer(
        "tz",
        path.resolve(resourcesPath, "data/combined-now.json"),
        "#000088FF",
        0.5
      );
      GT.map.addLayer(GT.timezoneLayer);
      GT.timezoneLayer.setVisible(false);
    }
    if (GT.currentOverlay == 0)
    {
      GT.timezoneLayer.setVisible(true);
    }
  }
  else
  {
    if (GT.timezoneLayer != null)
    {
      GT.timezoneLayer.getSource().clear();
      GT.map.removeLayer(GT.timezoneLayer);
      GT.timezoneLayer = null;
    }
  }
}

function changeRangeRingDistance(event)
{
  let val = parseFloat(event.target.value);
  let unit = GT.settings.app.distanceUnit || 'KM';
  
  // Convert slider value back to KM
  let valInKm = unitToKilometer(val, unit);
  
  // --> HARD ENFORCEMENT: Never allow the value below 100 KM <--
  if (valInKm < 100) {
      valInKm = 100;
  }

  GT.settings.map.rangeRingDistance = valInKm;
  
  updateRangeRingsUI();
  drawRangeRings();
}

function changeRangeRingColor()
{
  GT.settings.map.rangeRingColor = parseInt(rangeRingColorValue.value);
  drawRangeRings();
}

function changeEquatorColor()
{
  GT.settings.map.equatorColor = parseInt(equatorColorValue.value);
  drawRangeRings();
}

function updateRangeRingsUI()
{
  let currentUnit = GT.settings.app.distanceUnit || "KM";
  let config = distanceUnitConfig[currentUnit] || distanceUnitConfig['KM'];

  // Convert the internal KM to the display unit, snapped to step to fix float drift
  let rawLocal = kilometerToUnit(GT.settings.map.rangeRingDistance, currentUnit);
  let displayValue = Math.round(rawLocal / config.step) * config.step;

  // Update the HTML slider attributes dynamically
  rangeRingDistanceValue.value = displayValue;
  rangeRingDistanceValue.min = config.min;
  rangeRingDistanceValue.step = config.step;
  rangeRingDistanceValue.max = config.max;

  // Format the text label (Degrees get 1 decimal place, others are whole numbers)
  let textValue = Math.round(displayValue);
  rangeRingDistanceTd.innerHTML = textValue + " " + currentUnit.toLowerCase();

  // --- Original Color Management untouched below ---
  rangeRingColorDiv.style.color = (GT.settings.map.rangeRingColor == 0) ? "#FFF" : "#000";
  rangeRingColorDiv.style.textShadow = (GT.settings.map.rangeRingColor == 0) ? "" : "-1px -1px 0 #FFF, 1px -1px 0 #FFF, -1px 1px 0 #FFF, 1px 1px 0 #FFF";
  rangeRingColorDiv.style.backgroundColor = GT.settings.map.rangeRingColor == 0 ? "#000" : GT.settings.map.rangeRingColor == 361 ? "#FFF" : "hsl(" + GT.settings.map.rangeRingColor + ", 100%, 50%)";
  rangeRingColorValue.value = GT.settings.map.rangeRingColor;

  equatorColorDiv.style.color = (GT.settings.map.equatorColor == 0) ? "#FFF" : "#000";
  equatorColorDiv.style.textShadow = (GT.settings.map.equatorColor == 0) ? "" : "-1px -1px 0 #FFF, 1px -1px 0 #FFF, -1px 1px 0 #FFF, 1px 1px 0 #FFF";
  equatorColorDiv.style.backgroundColor = GT.settings.map.equatorColor == 0 ? "#000" : GT.settings.map.equatorColor == 361 ? "#FFF" : "hsl(" + GT.settings.map.equatorColor + ", 100%, 50%)";
  equatorColorValue.value = GT.settings.map.equatorColor;
}

function drawRangeRings()
{
  updateRangeRingsUI();

  GT.layerSources.rangeRings.clear();

  if (GT.settings.map.equator)
  {
    
    // Helper to generate a line with exactly 1000 evenly split steps
    function generatePoints(start, end, steps, callback) {
      const points = [];
      const stepSize = (end - start) / (steps - 1);
      for (let i = 0; i < steps; i++) {
        const val = start + (stepSize * i);
        points.push(callback(val));
      }
      return points;
    }

    const parallels = [23.4363, -23.4363, 66.5637, -66.5637].map(lat => 
      generatePoints(-180, 180, GT.useTransform ? 2048 : 2 , lon => [Number(lon.toFixed(6)), lat])
    );

    const meridians = [0.0, 180.0].map(lon => 
      generatePoints(-90, 90, GT.useTransform ? 2048 : 2, lat => [lon, Number(lat.toFixed(6))])
    );

    // add equator
    meridians.push(generatePoints(-180, 180, GT.useTransform ? 2048 : 2, lon => [Number(lon.toFixed(6)), 0.0]));

    const parallelsGeoJSON = {
      type: "Feature",
      properties: { name: "para" },
      geometry: { type: "MultiLineString", coordinates: parallels }
    };

    const meridiansGeoJSON = {
      type: "Feature",
      properties: { name: "merd-equa" },
      geometry: { type: "MultiLineString", coordinates: meridians }
    };

    let feature = shapeFeature("eq", meridiansGeoJSON, "eq", "#00000000", equatorColorDiv.style.backgroundColor, 1.0);
    GT.layerSources.rangeRings.addFeature(feature);

    let dashStyle = new ol.style.Style({
      stroke: new ol.style.Stroke({
        color: equatorColorDiv.style.backgroundColor,
        width: 1,
        lineDash: [10, 10]
      })
    });

    feature = shapeFeature("eq", parallelsGeoJSON, "eq", "#00000000",  equatorColorDiv.style.backgroundColor, 1.0);
    feature.setStyle(dashStyle);
    GT.layerSources.rangeRings.addFeature(feature);

  }

  if (GT.settings.map.showRangeRings == false)
  {
    return;
  }

  const center = [GT.settings.map.longitude, GT.settings.map.latitude];    
  const distance = GT.settings.map.rangeRingDistance;
  const geoJsonFormat = new ol.format.GeoJSON();

  if (distance <= 0) return;

  for (let x = distance; x < 20000; x += distance)
  {
    let feature = null;

    if (GT.settings.map.projection == "EPSG:3857")
    {
      let geoJson = generateGeodesicCircle(GT.settings.map.longitude, GT.settings.map.latitude, x * 2);
      
      if (geoJson) {
        feature = geoJsonFormat.readFeature(geoJson, {
          dataProjection: 'EPSG:4326', 
          featureProjection: GT.settings.map.projection
        });
        feature.set('prop', 'range');
      }
    }
    else
    {
      let poly = new ol.geom.Polygon.circular(center, parseInt(x * 1000), 359).transform("EPSG:4326", GT.settings.map.projection);
      feature = new ol.Feature({ geometry: poly, prop: "range" });
    }

    if (feature) {
      let featureStyle = new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: rangeRingColorDiv.style.backgroundColor,
          width: (x % (distance * 2) == 0) ? 0.2 : 0.4
        })
      });
      
      feature.setStyle(featureStyle);
      GT.layerSources.rangeRings.addFeature(feature);
    }
  }

}

function drawAllGrids()
{
  GT.layerSources.lineGrids.clear();
  GT.layerSources.longGrids.clear();
  GT.layerSources.bigGrids.clear();

  if (GT.settings.map.showAllGrids == false) return;

  const useTransform = GT.useTransform;
  const targetProj = useTransform ? GT.settings.map.projection : "EPSG:3857";

  // ---- Grid lines: two shared styles, field boundaries vs square boundaries ----
  const borderColor = "#000";
  const fieldLineStyle = new ol.style.Style({
    stroke: new ol.style.Stroke({ color: borderColor, width: useTransform ? 0.75 : 1.25 })
  });
  const squareLineStyle = new ol.style.Style({
    stroke: new ol.style.Stroke({ color: borderColor, width: 0.25 })
  });

  const lineFeatures = [];

  // Meridians every 2° (square width); every 20° is a field boundary
  for (let lon = -178; lon <= 180; lon += 2)
  {
    const line = lineString([[lon, -85], [lon, 85]], 100);
    line.setStyle(lon % 20 == 0 ? fieldLineStyle : squareLineStyle);
    lineFeatures.push(line);
  }

  // Parallels every 1° (square height); every 10° is a field boundary
  for (let lat = -85; lat < 85; lat++)
  {
    const style = lat % 10 == 0 ? fieldLineStyle : squareLineStyle;

    if (useTransform)
    {
      // Segment parallels so they project correctly in non-Mercator projections
      for (let lon = -180; lon < 180; lon += 2)
      {
        const line = lineString([[lon, lat], [lon + 2, lat]], 10);
        line.setStyle(style);
        lineFeatures.push(line);
      }
    }
    else
    {
      const line = lineString([[-180, lat], [180, lat]]);
      line.setStyle(style);
      lineFeatures.push(line);
    }
  }

  GT.layerSources.lineGrids.addFeatures(lineFeatures);

  // ---- Labels: one Style object per level, text swapped in via style function ----
  const sharedFill = new ol.style.Fill({ color: "#000" });

  const squareTextStyle = new ol.style.Style({
    text: new ol.style.Text({
      fill: sharedFill,
      stroke: new ol.style.Stroke({ color: "#88888888", width: 1 }),
      font: useTransform ? "normal 12px sans-serif" : "normal 16px sans-serif",
      offsetY: 1
    })
  });
  const fieldTextStyle = new ol.style.Style({
    text: new ol.style.Text({
      fill: sharedFill,
      stroke: new ol.style.Stroke({ color: "#88888888", width: 2 }),
      font: useTransform ? "normal 16px sans-serif" : "normal 22px sans-serif"
    })
  });

  const squareStyleFn = function (feature)
  {
    squareTextStyle.getText().setText(feature.get("label"));
    return squareTextStyle;
  };
  const fieldStyleFn = function (feature)
  {
    fieldTextStyle.getText().setText(feature.get("label"));
    return fieldTextStyle;
  };

  function labelFeature(lon, lat, label, styleFn)
  {
    const feature = new ol.Feature({
      geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat], targetProj)),
      label: label
    });
    feature.setStyle(styleFn);
    return feature;
  }

  const squareFeatures = [];
  const fieldFeatures = [];

  // Fields A–R: 20° lon × 10° lat, origin at 180W / 90S
  for (let fx = 0; fx < 18; fx++)
  {
    const fieldLon = -180 + fx * 20;
    const lonChar = String.fromCharCode(65 + fx);

    for (let fy = 0; fy < 18; fy++)
    {
      const fieldLat = -90 + fy * 10;
      const field = lonChar + String.fromCharCode(65 + fy);

      // Squares 00–99: 2° lon × 1° lat, label at center
      for (let a = 0; a < 10; a++)
      {
        for (let b = 0; b < 10; b++)
        {
          squareFeatures.push(
            labelFeature(fieldLon + a * 2 + 1, fieldLat + b + 0.5, field + a + b, squareStyleFn)
          );
        }
      }

      fieldFeatures.push(labelFeature(fieldLon + 10, fieldLat + 5, field, fieldStyleFn));
    }
  }

  GT.layerSources.longGrids.addFeatures(squareFeatures);
  GT.layerSources.bigGrids.addFeatures(fieldFeatures);
}

function mapTerminatorChange()
{
  GT.settings.map.terminatorDegreeIndex = mapTerminatorValue.value;
  mapTerminatorTd.innerHTML = I18N( "settings.map.terminator." +  GT.terminatorDegreesNames[GT.settings.map.terminatorDegreeIndex] );

  if (GT.map)
  {
    dayNight.refresh();
  }
}

function changePredOpacityValue()
{
  predOpacityTd.innerHTML = GT.settings.map.predOpacity = predOpacityValue.value;
  if (GT.PredLayer != null)
  {
    GT.PredLayer.setOpacity(Number(GT.settings.map.predOpacity));
  }
}

function changeEpiTimeValue()
{
  GT.epiTimeValue = epiTimeValue.value;
  epiTimeOffsetTd.innerHTML = ((GT.epiTimeValue > 0) ? "+" + GT.epiTimeValue : GT.epiTimeValue) + "h";
  predLayerRefreh();
}

function getCurrentPredURL()
{
  let where = "";
  let now = timeNowSec();
  let timeOut = 0;
  if (GT.settings.map.predMode < 3)
  {
    timeOut = 901 * 1000;
    where = GT.settings.map.predMode == 1 ? "https://tagloomis.com/pred/muf/img/muf.png?" : "https://tagloomis.com/pred/muf/img/fof2.png?";
    where += String(now - (now % 900));
  }
  else if (GT.settings.map.predMode == 3)
  {
    timeOut = (3601 - (now % 3600)) * 1000;
    now = now + (GT.epiTimeValue * 3600);
    now = now - (now % 3600);
    where = "https://tagloomis.com/pred/epi/img/" + now + ".jpg";
  }
  else if (GT.settings.map.predMode == 4)
  {
    timeOut = 361 * 1000;
    where = "https://tagloomis.com/pred/auf/img/auf.png?" + String(now - (now % 360));
  }
  if (GT.predLayerTimeout != null)
  {
    nodeTimers.clearTimeout(GT.predLayerTimeout);
    GT.predLayerTimeout = null;
  }
  if (timeOut > 0)
  {
    GT.predLayerTimeout = nodeTimers.setTimeout(predLayerRefreh, timeOut);
  }
  return where;
}

function createPredSource()
{
  return new ol.source.XYZ({
    url: getCurrentPredURL(),
    attributions: GT.settings.map.predMode < 3 ? "<a href='https://prop.kc2g.com/acknowledgments/' target='_blank' title='Visit prop.kc2g.com'>KC2G</a>" : GT.settings.map.predMode == 3 ? "<a href='https://www.propquest.co.uk/about.php' target='_blank' title='Visit PROPquest.co.uk'>PROPquest</a>" : "<a href='https://www.swpc.noaa.gov/products/aurora-30-minute-forecast' target='_blank' title='Visit NOAA'>NOAA</a>",
    minZoom: 0,
    maxZoom: 0
  });
}

function createPredLayer()
{
  let layerVector = new ol.layer.Tile({
    source: createPredSource(),
    opacity: Number(GT.settings.map.predOpacity),
    visible: true,
    zIndex: 0
  });

  layerVector.set("name", "Pred");

  return layerVector;
}

function cyclePredLayer()
{
  GT.settings.map.predMode = (GT.settings.map.predMode + 1) % 6;
  displayPredLayer();
}

function directPredLayer(layer)
{
  GT.settings.map.predMode = layer;
  displayPredLayer();
}

function predInit()
{
  GT.predViews = Array();
  GT.predViews[1] = { mufTitle, mufBarTr, mufRangeTr };
  GT.predViews[2] = { fof2Title, fof2BarTr, fof2RangeTr }
  GT.predViews[3] = { epiTitle, epiTimeOffsetTr, epiBarTr, epiRangeTr };
  GT.predViews[4] = { aufTitle, aufPercentTr, aufBarTr };
  GT.predViews[5] = { tropoTitle, tropoBarTr, tropoRangeTr };

  GT.predLayers = ["gt.Disabled", "predlayer.muf.label", "predlayer.fof2.label", "predlayer.epi.label", "predlayer.auf.label", "predlayer.tropo.label"];

  GT.spotLayers = ["gt.Disabled", "spotlayer.RX.Spots", "spotlayer.RX.Heatmap"];
}

function displayPredLayer()
{
  predButton.style.display = (GT.settings.map.offlineMode == true) ? "none" : "";
  if (GT.settings.map.predMode > 0 && GT.settings.map.offlineMode == false)
  {
    predDiv.style.display = (GT.settings.map.predLegend) ? "" : "none";
    for (let viewIndex in GT.predViews)
    {
      for (let html in GT.predViews[viewIndex])
      {
        GT.predViews[viewIndex][html].style.display = viewIndex == GT.settings.map.predMode ? "" : "none";
      }
    }

    predLayerRefreh();
  }
  else
  {
    predDiv.style.display = "none";
    if (GT.predLayerTimeout != null)
    {
      nodeTimers.clearTimeout(GT.predLayerTimeout);
      GT.predLayerTimeout = null;
    }
    if (GT.PredLayer)
    {
      GT.map.removeLayer(GT.PredLayer);
      GT.PredLayer = null;
    }
  }
  predImg.src = GT.predImageArray[GT.settings.map.predMode];
  predImg.style.filter = GT.settings.map.predMode > 0 ? "" : "grayscale(1)";
  predOpacityTd.innerHTML = predOpacityValue.value = GT.settings.map.predOpacity;
}

function predLayerRefreh()
{
  if (GT.settings.map.predMode > 0 && GT.settings.map.offlineMode == false)
  {
    let oldLayer = null;
    if (GT.PredLayer)
    {
      oldLayer = GT.PredLayer;
      GT.PredLayer = null;
    }

    if (GT.settings.map.predMode == 5) {
      GT.PredLayer = createTropoLayer();
    } else {
      GT.PredLayer = createPredLayer();
    }

    GT.map.addLayer(GT.PredLayer);
    if (oldLayer)
    {
      GT.map.removeLayer(oldLayer);
      oldLayer = null;
    }
  }

  if (GT.settings.map.predMode !== 5) {
    stopTropoTimer();
  }
}
