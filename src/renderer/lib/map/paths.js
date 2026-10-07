// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Map paths: flight path features, colours, styles and animation (flightFeature moved from third-party.js) (moved from GridTracker2.js)

function getPathColor()
{
  if (GT.settings.map.nightMapEnable && GT.nightTime)
  {
    if (GT.settings.map.nightPathColor == 0) return "#000";
    if (GT.settings.map.nightPathColor == 361) return "#FFF";
    return "hsl(" + GT.settings.map.nightPathColor + ", 100%, 50%)";
  }
  else
  {
    if (GT.settings.map.pathColor == 0) return "#000";
    if (GT.settings.map.pathColor == 361) return "#FFF";
    return "hsl(" + GT.settings.map.pathColor + ", 100%, 50%)";
  }
}

function getQrzPathColor()
{
  if (GT.settings.map.nightMapEnable && GT.nightTime)
  {
    if (GT.settings.map.nightQrzPathColor == 0) return "#000";
    if (GT.settings.map.nightQrzPathColor == 361) return "#FFF";
    return "hsl(" + GT.settings.map.nightQrzPathColor + ", 100%, 50%)";
  }
  else
  {
    if (GT.settings.map.qrzPathColor == 0) return "#000";
    if (GT.settings.map.qrzPathColor == 361) return "#FFF";
    return "hsl(" + GT.settings.map.qrzPathColor + ", 100%, 50%)";
  }
}

function changePathValues()
{
  GT.settings.app.pathWidthWeight = pathWidthValue.value;
  GT.settings.app.qrzPathWidthWeight = qrzPathWidthValue.value;
  GT.settings.map.pathColor = pathColorValue.value;
  GT.settings.map.qrzPathColor = qrzPathColorValue.value;

  pathWidthTd.innerHTML = pathWidthValue.value;
  qrzPathWidthTd.innerHTML = qrzPathWidthValue.value;
  setMapColors();
  
  styleAllFlightPaths();
}

// --- 2. THE UPDATED STYLE UPDATER (No Loops for standard flights!) ---
function styleAllFlightPaths() {
  if (!GT.sharedStyles) return;

  let colorNormal = getPathColor();
  let widthNormal = pathWidthValue.value;
  let colorQRZ = getQrzPathColor();
  let widthQRZ = qrzPathWidthValue.value;

  // 1. Remove paths ONLY if their stroke width changed to 0
  if (widthNormal == 0 || widthQRZ == 0) {
    for (let i = GT.flightPaths.length - 1; i >= 0; i--) {
      let path = GT.flightPaths[i];
      if ((path.isQRZ && widthQRZ == 0) || (!path.isQRZ && widthNormal == 0)) {
        if ("Arrow" in path) GT.layerSources.flight.removeFeature(path.Arrow);
        GT.layerSources.flight.removeFeature(path);
        GT.flightPaths.splice(i, 1);
      }
    }
  }

  // 2. Instantly update all lines via the shared styles!
  if (widthNormal > 0) {
    GT.sharedStyles.flight.getStroke().setWidth(widthNormal);
    GT.sharedStyles.flight.getStroke().setColor(colorNormal);
    GT.sharedStyles.flightArrow.getImage().getStroke().setWidth(widthNormal);
    GT.sharedStyles.flightArrow.getImage().getStroke().setColor(colorNormal);
  }

  if (widthQRZ > 0) {
    GT.sharedStyles.qrz.getStroke().setWidth(widthQRZ);
    GT.sharedStyles.qrz.getStroke().setColor(colorQRZ);
    GT.sharedStyles.qrzArrow.getImage().getStroke().setWidth(widthQRZ);
    GT.sharedStyles.qrzArrow.getImage().getStroke().setColor(colorQRZ);
  }
  
  // 3. Update Shape Flights (Polygons)
  for (let i = GT.flightPaths.length - 1; i >= 0; i--) {
    if (GT.flightPaths[i].isShapeFlight === 1) {
      let fStyle = GT.flightPaths[i].getStyle();
      let fStroke = fStyle.getStroke();
      fStroke.setWidth(GT.flightPaths[i].isQRZ ? widthQRZ : widthNormal);
      fStroke.setColor(GT.flightPaths[i].isQRZ ? colorQRZ : colorNormal);
      GT.flightPaths[i].setStyle(fStyle);
    }
  }

  // CRITICAL FIX: Tell the layers the styles changed!
  GT.layerSources.flight.changed();
  GT.layerSources.transmit.changed();

  if (GT.map) GT.map.render();
}

function setAnimateView()
{
  animateSpeedValue.style.display = animateValue.checked ? "" : "none";
}

function toggleAnimate()
{
  animateValue.checked = !animateValue.checked;
  setAnimateView()
  changeAnimate();
}

// --- 4. THE UPDATED ANIMATION TOGGLE ---
function changeAnimate() {
  GT.settings.map.animate = animateValue.checked;
  
  let dash = [];
  let dashOff = 0;
  if (GT.settings.map.animate == true) {
    dash = GT.flightPathLineDash;
    dashOff = GT.flightPathTotal - GT.flightPathOffset;
  }

  // Update Shared Styles instantly
  if (GT.sharedStyles) {
    GT.sharedStyles.flight.getStroke().setLineDash(dash);
    GT.sharedStyles.flight.getStroke().setLineDashOffset(dashOff);
    GT.sharedStyles.qrz.getStroke().setLineDash(dash);
    GT.sharedStyles.qrz.getStroke().setLineDashOffset(dashOff);
  
    GT.layerSources.flight.changed();
    GT.layerSources.transmit.changed();
  }

  if (GT.dazzleGrid != null) {
    let fStyle = GT.dazzleGrid.getStyle();
    let fStroke = fStyle.getStroke();
    fStroke.setLineDash(dash);
    fStroke.setLineDashOffset(dashOff);
    GT.dazzleGrid.setStyle(fStyle);
  }

  if (GT.settings.map.animate) {
    setAnimate(true);
  }
  
  if (GT.map) GT.map.render();
}

function changeAnimateSpeedValue()
{
  GT.settings.map.animateSpeed = 21 - animateSpeedValue.value;
  
}

function removeFlightPathsAndDimSquares()
{
  for (let i = GT.flightPaths.length - 1; i >= 0; i--)
  {
    if (GT.flightPaths[i].age < GT.timeNow)
    {
      if ("Arrow" in GT.flightPaths[i]) { GT.layerSources.flight.removeFeature(GT.flightPaths[i].Arrow); }
      GT.layerSources.flight.removeFeature(GT.flightPaths[i]);
      GT.flightPaths.splice(i, 1);
    }
  }

  if (GT.timeNow >= GT.nextDimTime)
  {
    dimGridsquare();
    GT.nextDimTime = GT.timeNow + 8;
  }
}

function setAnimate(enabled) {
  if (enabled && !GT.isAnimating) {
    GT.isAnimating = true;
    requestAnimationFrame(animatePaths);
  } else if (!enabled) {
    GT.isAnimating = false;
  }
}

function animatePaths() {
  if (!GT.settings.map.animate || !GT.isAnimating) {
    GT.isAnimating = false;
    return;
  } 

  const pathsLen = GT.flightPaths.length;
  const txPath = GT.transmitFlightPath;
  const dazzle = GT.dazzleGrid;

  if (pathsLen === 0 && !txPath && !dazzle) {
    GT.isAnimating = false;
    return;
  }

  requestAnimationFrame(animatePaths);

  if (GT.settings.map.animateSpeed > 1)
  {
    GT.animateFrame++;
    GT.animateFrame %= GT.settings.map.animateSpeed;
    if (GT.animateFrame > 0) return; 
  }

  GT.flightPathOffset++;
  GT.flightPathOffset %= GT.flightPathTotal;
  const targetOffset = GT.flightPathTotal - GT.flightPathOffset;

  let requestRedraw = false;

  // 1. Instantly Animate ALL flight paths via shared style modification
  if (GT.sharedStyles) {
      GT.sharedStyles.flight.getStroke().setLineDashOffset(targetOffset);
      GT.sharedStyles.qrz.getStroke().setLineDashOffset(targetOffset);
      GT.layerSources.flight.changed(); 
      GT.layerSources.transmit.changed();
      requestRedraw = true;
  }

  // 2. Animate Dazzle Grid
  if (dazzle) {
    dazzle.getStyle().getStroke().setLineDashOffset(targetOffset);
    dazzle.changed(); 
    requestRedraw = true;
  }

  if (requestRedraw && GT.map) {
    GT.map.render(); 
  }
}

function removePaths()
{
  GT.layerSources.flight.clear();
  GT.flightPaths = Array();
}

function fadePaths()
{
  if (pathWidthValue.value == 0)
  {
    removePaths();
  }
}

// Initially from https://pskreporter.info/
// Many many thanks!!!
function flightFeature(points, opts, layer, canAnimate) {
  let steps = opts.steps;
  let start = ol.proj.toLonLat(points[0]);
  let end = ol.proj.toLonLat(points[1]);
  let generator = new arc.GreatCircle({ x: start[0], y: start[1] }, { x: end[0], y: end[1] });
  let path = generator.Arc(steps, { offset: 10 });

  let line = [];
  let geom = path.geometries;
  let lonOff = 0;
  let lastc = 0;
  for (const j in geom) {
    for (const i in geom[j].coords) {
      const c = geom[j].coords[i];
      if (isNaN(c[0])) continue;
      if (Math.abs(lastc - c[0]) > 270) (c[0] < lastc) ? lonOff += 360 : lonOff -= 360;
      lastc = c[0];
      line.push(ol.proj.fromLonLat([ lastc + lonOff, c[1]]));
    }
  }
  if (line.length == 0) line.push(ol.proj.fromLonLat(start));

  let dash = [];
  let dashOff = 0;
  if (canAnimate == true && GT.settings.map.animate == true) {
    dash = GT.flightPathLineDash;
    dashOff = GT.flightPathTotal - GT.flightPathOffset;
  }

  let featureArrow = new ol.Feature(new ol.geom.Point(line[0]));
  let feature = new ol.Feature({ geometry: new ol.geom.LineString(line), prop: 'flight' });

  if (GT.useTransform) {
    featureArrow.getGeometry().transform("EPSG:3857", GT.settings.map.projection);
    feature.getGeometry().transform("EPSG:3857", GT.settings.map.projection);
  }

  if (!GT.sharedStyles) {
    GT.sharedStyles = {
      flight: new ol.style.Style({ stroke: new ol.style.Stroke({}) }),
      flightArrow: new ol.style.Style({ image: new ol.style.Circle({ radius: 3, stroke: new ol.style.Stroke({}) }) }),
      qrz: new ol.style.Style({ stroke: new ol.style.Stroke({}) }),
      qrzArrow: new ol.style.Style({ image: new ol.style.Circle({ radius: 3, stroke: new ol.style.Stroke({}) }) }),
    };
  }

  let lineStyle, arrowStyle;

  // ROUTE TO THE CORRECT SHARED STYLE (O(1) Memory footprint!)
  if (layer === "flight" || layer === "transmit") {
    if (layer === "transmit" || opts.isQRZ === true) {
      lineStyle = GT.sharedStyles.qrz;
      arrowStyle = GT.sharedStyles.qrzArrow;
    } else {
      lineStyle = GT.sharedStyles.flight;
      arrowStyle = GT.sharedStyles.flightArrow;
    }

    // Ensure shared style is up to date with the latest color/width
    lineStyle.getStroke().setColor(opts.color);
    lineStyle.getStroke().setWidth(opts.weight);
    lineStyle.getStroke().setLineDash(dash);
    lineStyle.getStroke().setLineDashOffset(dashOff);

    arrowStyle.getImage().getStroke().setColor(opts.color);
    arrowStyle.getImage().getStroke().setWidth(opts.weight);
  } else {
    // FALLBACK for unique spots (pskHop, etc. whose colors vary wildly per-feature)
    lineStyle = new ol.style.Style({ stroke: new ol.style.Stroke({ color: opts.color, width: opts.weight, lineDash: dash, lineDashOffset:dashOff}) });
    arrowStyle = new ol.style.Style({ image: new ol.style.Circle({ stroke: new ol.style.Stroke({color: opts.color, width: opts.weight}), radius: 3 }) });
  }

  feature.setStyle(lineStyle);
  featureArrow.setStyle(arrowStyle);
  feature.Arrow = featureArrow;

  GT.layerSources[layer].addFeature(featureArrow);
  GT.layerSources[layer].addFeature(feature);
  return feature;
}
