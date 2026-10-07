// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Map projection and view: AEQD projection, centring, fitting, remembered views (moved from gt.js)

function mapMemory(x, save, internal = false)
{
  if (save == true)
  {
    GT.settings.mapMemory[x].LoLa = ol.proj.toLonLat(GT.mapView.getCenter(), GT.settings.map.projection);
    GT.settings.mapMemory[x].zoom = GT.mapView.getZoom() / 0.333;
    GT.settings.mapMemory[x].bearing = GT.mapView.getRotation();
    if (internal == false)
    {
      playAlertMediaFile("Clicky-3.mp3");
    }
  }
  else
  {
    if (GT.settings.mapMemory[x].zoom != -1)
    {
      GT.mapView.setCenter(ol.proj.fromLonLat(GT.settings.mapMemory[x].LoLa, GT.settings.map.projection));
      GT.mapView.setZoom(GT.settings.mapMemory[x].zoom * 0.333);
      GT.mapView.setRotation(GT.settings.mapMemory[x].bearing);
    }
  }
}

function initAEQDprojection()
{
  if (ol.proj.proj4.isRegistered())
  {
    ol.proj.proj4.unregister();
    ol.proj.deleteProjection("AEQD");
    proj4.defs("AEQD", '+');
  }
 
  proj4.defs("AEQD", '+proj=aeqd +lat_0=' + GT.myLat + ' +lon_0=' + GT.myLon + ' +x_0=0 +y_0=0 +a=6371000 +b=6371000 +units=m');
  ol.proj.proj4.register(proj4);
}

function tryRecenterAEQD()
{
  // Only if we're AEQD
  if (GT.settings.map.projection == "AEQD")
  {
    // we fake a change
    GT.settings.map.projection = "EPSG:3857";
    changeMapProjection(false);
    centerOn(GT.settings.app.myGrid, false);
  }
  else
  {
    drawRangeRings();
  }
}

function changeMapProjection(honorMemory = true) {
  if (honorMemory) {
    // save the current map view
    mapMemory(6, true, true);
  }

  // remove flights
  removePaths();

  if (GT.settings.map.projection == "AEQD") {
    GT.settings.map.projection = "EPSG:3857";
    projectionImg.style.filter = "grayscale(1)";
  } else {
    GT.settings.map.projection = "AEQD";
    projectionImg.style.filter = "";
  }

  if (GT.map != null) {
    const map = GT.map;

    // 1. DEEP CLEAN LAYERS & SOURCES (Recursive)
    // This ensures child layers inside LayerGroups are also destroyed.
    const disposeLayerTree = (layer) => {
      // If it's a Group, recursively dispose its children first
      if (typeof layer.getLayers === 'function') {
        layer.getLayers().getArray().forEach(disposeLayerTree);
      }
      // Dispose the source (frees geometries/features from memory)
      if (typeof layer.getSource === 'function') {
        const source = layer.getSource();
        if (source && typeof source.dispose === 'function') {
          source.dispose();
        }
      }
      // Dispose the layer itself
      if (typeof layer.dispose === 'function') {
        layer.dispose();
      }
    };
    
    map.getLayers().getArray().forEach(disposeLayerTree);
    map.getLayers().clear();

    // 2. CLEANUP OVERLAYS (Fixes Detached DOM Node leaks)
    map.getOverlays().getArray().forEach(overlay => {
      const element = overlay.getElement();
      if (element && element.parentNode) {
        element.parentNode.removeChild(element);
      }
    });
    map.getOverlays().clear();

    // 3. CLEANUP CONTROLS AND INTERACTIONS (Frees event listeners)
    map.getControls().getArray().forEach(c => typeof c.dispose === 'function' && c.dispose());
    map.getInteractions().getArray().forEach(i => typeof i.dispose === 'function' && i.dispose());

    // 4. CLEANUP WEBGL CONTEXT (Your original excellent code)
    const olCanvas = map.getViewport().querySelector("canvas");
    if (olCanvas) {
      const gl = olCanvas.getContext("webgl") || olCanvas.getContext("webgl2");
      if (gl) {
        const loseContext = gl.getExtension("WEBGL_lose_context");
        if (loseContext) {
          loseContext.loseContext();
        }
      }
    }

    // 5. COMPLETELY NUKE THE MAP
    map.setTarget(null); // Detach from DOM container
    if (typeof map.dispose === 'function') {
      map.dispose(); // Unbinds all window/document listeners!
    }
    
    GT.map = null;
  }

  // REBUILD
  renderMap();

  if (honorMemory) {
    // load the current map view
    mapMemory(6, false);
  }

  // RE-ADD DATA
  drawAllGrids();
  drawRangeRings();
  displayPredLayer();
  
  // Clear old references to specific layers so they are garbage collected
  GT.timezoneLayer = null;
  displayTimezones();
  
  GT.usRadar = null;
  displayRadar();
  
  redrawGrids();
  redrawSpots();
  redrawParks();
  redrawPins();
  setTrophyOverlay(GT.currentOverlay);
}

function getPoint(grid)
{
  let LL = squareToCenter(grid);
  return ol.proj.fromLonLat([LL.o, LL.a]);
}

function fitViewBetweenPoints(points, maxZoom = 20)
{
  let start = ol.proj.toLonLat(points[0]);
  let end = ol.proj.toLonLat(points[1]);

  if (Math.abs(start[0] - end[0]) > 180)
  {
    // Wrapped
    if (end[0] < start[0])
    {
      start[0] -= 360;
    }
    else
    {
      end[0] -= 360;
    }
  }

  start = ol.proj.fromLonLat(start);
  end = ol.proj.fromLonLat(end);
  let line = new ol.geom.LineString([start, end]);
  let feature = new ol.Feature({ geometry: line });
  if (GT.useTransform)
  {
    feature.getGeometry().transform("EPSG:3857", GT.settings.map.projection);
  }

  GT.mapView.fit(feature.getGeometry(), {
    duration: 500,
    maxZoom: maxZoom,
    padding: [75, 75, 75, 75]
  });
}

function centerOn(grid, dazzle = true)
{
  if (grid.length >= 4)
  {
    let LL = maidenheadToBounds(grid);

    if (dazzle) dazzleGrid(LL);

    GT.map
      .getView()
      .setCenter(
        ol.proj.fromLonLat([
          (LL.lo1 + LL.lo2) / 2,
          (LL.la1 + LL.la2) / 2
        ], GT.settings.map.projection)
      );
  }
}

function setCenterQTH()
{
  if (GT.settings.app.myGrid.length >= 4)
  {
    // Grab home QTH Gridsquare from Center QTH
    let LL = maidenheadToBounds(GT.settings.app.myGrid);

    GT.mapView
      .setCenter(
        ol.proj.fromLonLat([
          (LL.lo1 + LL.lo2) / 2,
          (LL.la1 + LL.la2) / 2
        ], GT.settings.map.projection)
      );

    GT.mapView.setRotation(0);
    GT.mapView.setZoom(4);
  }
}
