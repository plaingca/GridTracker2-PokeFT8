GT.countyLookupReady = false;
GT.countySource = new ol.source.Vector({});

function initCountyMap()
{
  for (key in GT.countyData)
  {
    GT.countySource.addFeature(new ol.format.GeoJSON({ geometryName: key }).readFeature(GT.countyData[key].geo, { featureProjection: "EPSG:3857" }));
  }
  GT.countyLookupReady = true;
}

function clearCountyMap()
{
  GT.countySource.clear();
  GT.countyLookupReady = false;
}

function getCountyFromLongLat(long, lat)
{
  let counties = GT.countySource.getFeaturesAtCoordinate(ol.proj.fromLonLat([long, lat]));
  if (counties.length == 1)
  {
    return counties[0].getGeometryName();
  }
  return null;
}
