// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Map core: OpenLayers map creation, base and data layers, rendering, controls, view-change events (moved from gt.js)

class RotateNorthControl extends ol.control.Control {
  /**
   * @param {Object} [opt_options] Control options.
   */
  constructor(opt_options) {
    const options = opt_options || {};

    const button = document.createElement('button');
    button.innerHTML = "<img src='img/north.png' style='width:1em'></img>";
    button.title = "Reset Heading";

    const element = document.createElement('div');
    element.className = 'rotate-north ol-unselectable ol-control';
    element.appendChild(button);

    super({
      element: element,
      target: options.target,
    });

    button.addEventListener('click', this.handleRotateNorth.bind(this), false);
  }

  handleRotateNorth() {
    this.getMap().getView().setRotation(0);
  }
}

function createGlobalHeatmapLayer(name, blur, radius, gradient = ['#00f', '#0ff', '#0f0', '#ff0', '#f00'])
{
  GT.layerSources[name] = new ol.source.Vector({});
  GT.layerVectors[name] = new ol.layer.Heatmap({
    source: GT.layerSources[name],
    blur: blur,
    radius: radius,
    gradient: gradient,
    zIndex: Object.keys(GT.layerVectors).length + 1
  });
  GT.layerVectors[name].set("name", name);
}

function createGlobalMapLayer(name, maxResolution, minResolution)
{
  GT.layerSources[name] = new ol.source.Vector({});
  if (typeof maxResolution == "undefined" && typeof minResolution == "undefined")
  {
    GT.layerVectors[name] = new ol.layer.Vector({
      source: GT.layerSources[name],
      zIndex: Object.keys(GT.layerVectors).length + 2
    });
  }
  else if (typeof minResolution == "undefined")
  {
    GT.layerVectors[name] = new ol.layer.Vector({
      source: GT.layerSources[name],
      maxResolution: maxResolution,
      zIndex: Object.keys(GT.layerVectors).length + 2
    });
  }
  else
  {
    GT.layerVectors[name] = new ol.layer.Vector({
      source: GT.layerSources[name],
      maxResolution: maxResolution,
      minResolution: minResolution,
      zIndex: Object.keys(GT.layerVectors).length + 2
    });
  }
  GT.layerVectors[name].set("name", name);
}

function createGeoJsonLayer(name, url, color, stroke)
{
  let style = new ol.style.Style({
    stroke: new ol.style.Stroke({
      color: color,
      width: stroke
    }),
    fill: new ol.style.Fill({
      color: "#00000000"
    })
  });

  let layerSource = new ol.source.Vector({
    url: url,
    format: new ol.format.GeoJSON({ geometryName: name }),
    overlaps: true
  });

  let layerVector = new ol.layer.Vector({
    source: layerSource,
    style: style,
    visible: true,
    zIndex: 1
  });
  layerVector.set("name", name);
  return layerVector;
}

function ProcessGroupMapSource(map)
{
  // Double check
  if (map in GT.maps)
  {
    let apiKey = "";
    if ("keyId" in GT.maps[map])
    {
      if (!(GT.maps[map].keyId in GT.settings.map.apiKeys))
      {
        GT.settings.map.apiKeys[GT.maps[map].keyId] = apiKey;
      }
      else
      {
        apiKey = GT.settings.map.apiKeys[GT.maps[map].keyId];
      }
    }
    let layers = [];
    for (let x in GT.maps[map].group)
    {
      // Only "_url"'s are processed for {r7} and {k}
      // It sets "url" otherwise, "url" must be present in the group entry!
      if ("_url" in GT.maps[map].group[x])
      {
        // Apply apiKey if needed
        let url = GT.maps[map].group[x]._url.replace("{k}", apiKey);
        // Apply random number from 0-7 if needed
        GT.maps[map].group[x].url = url.replace("{r7}", Math.floor(Math.random() * 8));
      }
      else if (!("url" in GT.maps[map].group[x]))
      {
        alert("Map: " + map + "\n" + "Missing 'url' or '_url' in group (" + x + ") " + "\nPlease fix!");
      }

      let source = new GT.mapSourceTypes[GT.maps[map].group[x].sourceType](GT.maps[map].group[x]);
      layers[x] = new ol.layer.Tile({ source: source });
    }
    GT.mapsLayer[map] = layers;
  }
}

function initMap()
{
  initHoverFunctors();

  const mapsData = requireJson("data/maps.json");
  if (!mapsData)
  {
    alert("Internal Map Data file Corrupt, GridTracker2 will now crash");
    return;
  }

  const sortedKeys = Object.keys(mapsData).sort();
  GT.maps = Object.fromEntries(sortedKeys.map(key => [key, mapsData[key]]));

  const mapKeys = electron.ipcRenderer.sendSync("mapKeys"); 

  // Apply any api keys needed
  for (const index in GT.maps)
  {
    for (const key in mapKeys)
    { 
      if ("url" in GT.maps[index] && GT.maps[index].url.indexOf(key) > 0 )
      {
        GT.maps[index].url = GT.maps[index].url.replaceAll(key, mapKeys[key])
      }
    }
  }

  GT.mapsLayer = {};
  GT.offlineMapsLayer = {};

  const offlineKeys = sortedKeys.filter(key => GT.maps[key].offline === true);

  function normalizeMapSetting(settingName, defaultValue, validKeys)
  {
    const fallback =
      validKeys.includes(defaultValue) ? defaultValue : validKeys[0];

    if (!validKeys.includes(GT.settings.map[settingName]))
    {
      GT.settings.map[settingName] = fallback;
    }
  }

  function appendOptions(select, keys)
  {
    select.length = 0;

    const fragment = document.createDocumentFragment();
    for (const key of keys)
    {
      const option = document.createElement("option");
      option.value = key;
      option.text = key;
      fragment.appendChild(option);
    }

    select.appendChild(fragment);
  }

  function getAttributionText(attributions)
  {
    if (String(attributions).includes("GridTracker.org"))
    {
      return attributions;
    }

    const gtCredit = "<a href='https://gridtracker.org' target='_blank'>GridTracker.org</a>";

    return "&copy; " + attributions + " " + gtCredit;
  }

  function buildTileLayer()
  {
    if (GT.settings.map.offlineMode)
    {
      return new ol.layer.Tile({
        source: GT.offlineMapsLayer[offlineMapSelect.value]
      });
    }

    const selectedMap = GT.maps[mapSelect.value];
    if (selectedMap.sourceType === "Group")
    {
      return new ol.layer.Group({
        layers: GT.mapsLayer[mapSelect.value]
      });
    }

    return new ol.layer.Tile({
      source: GT.mapsLayer[mapSelect.value]
    });
  }

  normalizeMapSetting("mapIndex", def_maps.mapIndex, sortedKeys);
  normalizeMapSetting("nightMapIndex", def_maps.nightMapIndex, sortedKeys);
  normalizeMapSetting("offlineMapIndex", def_maps.offlineMapIndex, offlineKeys);
  normalizeMapSetting("offlineNightMapIndex", def_maps.offlineNightMapIndex, offlineKeys);

  for (const key of sortedKeys)
  {
    const mapConfig = GT.maps[key];
    mapConfig.attributions = getAttributionText(mapConfig.attributions);

    if (mapConfig.sourceType === "Group")
    {
      ProcessGroupMapSource(key);
    }
    else
    {
      GT.mapsLayer[key] = new GT.mapSourceTypes[mapConfig.sourceType](mapConfig);
    }

    if (mapConfig.offline === true)
    {
      GT.offlineMapsLayer[key] = new ol.source.XYZ(mapConfig);
    }
  }

  appendOptions(mapSelect, sortedKeys);
  appendOptions(mapNightSelect, sortedKeys);
  appendOptions(offlineMapSelect, offlineKeys);
  appendOptions(offlineMapNightSelect, offlineKeys);

  mapSelect.value = GT.settings.map.mapIndex;
  mapNightSelect.value = GT.settings.map.nightMapIndex;
  offlineMapSelect.value = GT.settings.map.offlineMapIndex;
  offlineMapNightSelect.value = GT.settings.map.offlineNightMapIndex;

  GT.tileLayer = buildTileLayer();

  if (!GT.mapEventsBound)
  {
    mapDiv.addEventListener("pointermove", mapMoveEvent);
    mapDiv.addEventListener("mouseleave", mapLoseFocus, false);
    mapDiv.addEventListener("contextmenu", function (event)
    {
      event.preventDefault();
    });

    GT.mapEventsBound = true;
  }

  renderMap();
}

function renderMap()
{
  if (isNaN(GT.myLat) || Math.abs(GT.myLat) >= 90)
  {
    GT.myLat = 0.0;
    GT.settings.map.latitude = 0.0;
  }

  if (isNaN(GT.myLon) || Math.abs(GT.myLon) >= 180)
  {
    GT.myLon = 0.0;
    GT.settings.map.longitude = 0.0;
  }

  if (k_valid_projections.indexOf(GT.settings.map.projection) == -1)
  {
    GT.settings.map.projection = k_valid_projections[0];
  }

  initAEQDprojection();

  document.getElementById("mapDiv").innerHTML = "";

  GT.scaleLine = new ol.control.ScaleLine({
    units: GT.scaleUnits[GT.settings.app.distanceUnit]
  });

  GT.mapControl = [
    GT.scaleLine,
    new ol.control.Rotate(),
    new ol.control.Zoom(),
    new ol.control.FullScreen({ source: "mainBody" }),
    new ol.control.Attribution({ collapsible: false, collapsed: false }),
    new RotateNorthControl()
  ];

  createGlobalMapLayer("rangeRings");
  createGlobalMapLayer("award");
  createGlobalHeatmapLayer("baHeat", 20, 18, ['#f00', '#ff0' ,'#0f0',  '#0ff',  '#00f']);
  createGlobalHeatmapLayer("pskHeat", 20, 15);
  createGlobalMapLayer("qso");
  createGlobalMapLayer("qsoPins");
  createGlobalMapLayer("live");
  createGlobalMapLayer("livePins");
  createGlobalMapLayer("lineGrids");
  createGlobalMapLayer("longGrids", 4500);
  createGlobalMapLayer("bigGrids", 50000, 4501);
  createGlobalMapLayer("baFlight");
  createGlobalMapLayer("pskFlights");
  createGlobalMapLayer("pskSpots");
  createGlobalMapLayer("pskHop");
  createGlobalMapLayer("pota");
  createGlobalMapLayer("flight");
  createGlobalMapLayer("transmit");
  createGlobalMapLayer("gtflags");
  createGlobalMapLayer("temp");

  if (GT.settings.map.projection != "EPSG:3857")
  {
    GT.useTransform = true;
  }
  else
  {
    GT.useTransform = false;
  }

  GT.mapView = new ol.View({
    center: ol.proj.transform([GT.myLon, GT.myLat], "EPSG:4326", GT.settings.map.projection),
    zoom: GT.settings.map.zoom * 0.333,
    projection: GT.settings.map.projection,
    showFullExtent: true
  });

  GT.shadowVector = new ol.layer.Vector({ zIndex: 0 });

  GT.map = new ol.Map({
    target: "mapDiv",
    layers: [
      GT.tileLayer,
      GT.shadowVector,
      GT.layerVectors.rangeRings,
      GT.layerVectors.award,
      GT.layerVectors.baHeat,
      GT.layerVectors.pskHeat,
      GT.layerVectors.qso,
      GT.layerVectors.qsoPins,
      GT.layerVectors.live,
      GT.layerVectors.livePins,
      GT.layerVectors.lineGrids,
      GT.layerVectors.longGrids,
      GT.layerVectors.bigGrids,
      GT.layerVectors.baFlight,
      GT.layerVectors.pskFlights,
      GT.layerVectors.pskSpots,
      GT.layerVectors.pskHop,
      GT.layerVectors.pota,
      GT.layerVectors.flight,
      GT.layerVectors.transmit,
      GT.layerVectors.gtflags,
      GT.layerVectors.temp
    ],
    interactions: ol.interaction.defaults.defaults({
      dragPan: false,
      mouseWheelZoom: false
    }).extend([
      new ol.interaction.DragPan({ kinetic: false }),
      new ol.interaction.MouseWheelZoom({ duration: 0 }),
      new ol.interaction.DragRotateAndZoom({ duration: 0 })
    ]),
    controls: GT.mapControl,
    view: GT.mapView
  });

  GT.map.on("pointerdown", mouseDownEvent);
  GT.map.on("pointerup", mouseUpEvent);
  GT.map.on('moveend', mapMoveEndEvent);

  document.getElementById("menuDiv").style.display = "block";

  dayNight.init();
  if (GT.settings.app.graylineImgSrc == 1)
  {
    dayNight.hide();
  }
  else
  {
    GT.nightTime = dayNight.show();
  }

  moonLayer.init(GT.map);
  if (GT.settings.app.moonTrack == 1)
  {
    moonLayer.show();
  }
  else
  {
    moonLayer.hide();
  }

  GT.tileLayer.setOpacity(Number(GT.settings.map.mapOpacity));

  nightMapEnable.checked = GT.settings.map.nightMapEnable;
  changeNightMapEnable(nightMapEnable);
}

function mapMoveEndEvent(event)
{
  if (GT.settings.map.predMode === 5)
  {
    stopTropoTimer();

    GT.tropoData.refresh = 128;
    GT.tropoData.alert_id = 0;
    GT.tropoData.timeout = nodeTimers.setTimeout(fetchTropoLayer, 1000);
  }
}
