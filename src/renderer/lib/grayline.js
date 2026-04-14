/**
 * GeoJSONTerminator (Fixed AEQD Inversion logic for GT2)
 */
/**
 * GeoJSONTerminator (Fixed AEQD Inversion logic for GT2)
 */
(function (global, factory) {
  typeof exports === "object" && typeof module !== "undefined"
    ? (module.exports = factory())
    : typeof define === "function" && define.amd
      ? define(factory)
      : (global.GeoJSONTerminator = factory());
})(this, function () {
  "use strict";

  const R2D = 180 / Math.PI;
  const D2R = Math.PI / 180;

  function generateTerminator(options = {}) {
    let today = options.time ? new Date(options.time) : new Date();
    let julianDay = today.getTime() / 86400000.0 + 2440587.5;
    let d = julianDay - 2451545.0;
    
    let gst = (18.697374558 + 24.06570982441908 * d) % 24;

    let offset = options.offset !== undefined ? options.offset : -6;
    let h0Rad = offset * D2R;

    let limit = (typeof GT !== 'undefined' && GT.useTransform) ? 89.999 : 85;

    let n = julianDay - 2451545.0;
    let L = (280.46 + 0.9856474 * n) % 360;
    let g = (357.528 + 0.9856003 * n) % 360;
    let lambda = L + 1.915 * Math.sin(g * D2R) + 0.02 * Math.sin(2 * g * D2R);

    let T = n / 36525;
    let epsilon = 23.43929111 - T * (46.836769 / 3600);

    let alphaRad = Math.atan(Math.cos(epsilon * D2R) * Math.tan(lambda * D2R));
    let deltaRad = Math.asin(Math.sin(epsilon * D2R) * Math.sin(lambda * D2R));
    
    let alpha = alphaRad * R2D;
    let lQuadrant = Math.floor(lambda / 90) * 90;
    let raQuadrant = Math.floor(alpha / 90) * 90;
    alpha = alpha + (lQuadrant - raQuadrant);

    let isQthNight = false;
    if (options.qth) {
      let qthLon = options.qth[0];
      let qthLat = options.qth[1];
      let lst = gst + qthLon / 15;
      let haRad = (lst * 15 - alpha) * D2R;
      let latRad = qthLat * D2R;
      
      let altRad = Math.asin(
        Math.sin(latRad) * Math.sin(deltaRad) + 
        Math.cos(latRad) * Math.cos(deltaRad) * Math.cos(haRad)
      );
      isQthNight = (altRad * R2D) < offset;
    }

    let getAlt = (lat, haRad) => {
      let lRad = lat * D2R;
      return Math.asin(
        Math.sin(lRad) * Math.sin(deltaRad) + 
        Math.cos(lRad) * Math.cos(deltaRad) * Math.cos(haRad)
      ) * R2D;
    };

    let bottomEdge = [];
    let topEdge = [];
    let polygons = [];

    for (let i = -180; i <= 180; i += 1) {
      let lng = i;
      let lst = gst + lng / 15;
      let haRad = (lst * 15 - alpha) * D2R;

      let A = Math.sin(deltaRad);
      let B = Math.cos(deltaRad) * Math.cos(haRad);
      let C = Math.sin(h0Rad);

      let R = Math.sqrt(A * A + B * B) || 0.0000001;
      let ratio = C / R;
      let latMin = null;
      let latMax = null;

      if (ratio >= 1) {
        latMin = -limit;
        latMax = limit;
      } else if (ratio <= -1) {
        // Entirely light
      } else {
        let theta = Math.asin(ratio);
        let aRad = Math.atan2(B, A);
        
        let phi1 = theta - aRad;
        let phi2 = Math.PI - theta - aRad;
        
        let norm = (p) => {
          while (p > Math.PI) p -= 2 * Math.PI;
          while (p < -Math.PI) p += 2 * Math.PI;
          return p;
        };
        
        let r1 = norm(phi1) * R2D;
        let r2 = norm(phi2) * R2D;
        
        let validRoots = [];
        if (Math.abs(r1) <= 90.001) validRoots.push(r1);
        if (Math.abs(r2) <= 90.001) validRoots.push(r2);
        
        if (validRoots.length === 2) {
          let rMin = Math.min(validRoots[0], validRoots[1]);
          let rMax = Math.max(validRoots[0], validRoots[1]);
          if (getAlt((rMin + rMax) / 2, haRad) < offset) {
            latMin = rMin;
            latMax = rMax;
          }
        } else if (validRoots.length === 1) {
          let root = validRoots[0];
          let testLat = root < 0 ? root + 2 : root - 2;
          let isDark = getAlt(testLat, haRad) < offset;
          
          if (testLat > root) {
            latMin = isDark ? root : -limit;
            latMax = isDark ? limit : root;
          } else {
            latMin = isDark ? -limit : root;
            latMax = isDark ? root : limit;
          }
        }
      }

      if (latMin !== null && latMax !== null) {
        latMin = Math.max(-limit, Math.min(limit, latMin));
        latMax = Math.max(-limit, Math.min(limit, latMax));
        bottomEdge.push([lng, latMin]); 
        topEdge.unshift([lng, latMax]); 
      } else {
        if (bottomEdge.length > 0) {
          let polygon = bottomEdge.concat(topEdge);
          polygon.push(polygon[0]); 
          polygons.push(polygon);
          bottomEdge = [];
          topEdge = [];
        }
      }
    }

    if (bottomEdge.length > 0) {
      let polygon = bottomEdge.concat(topEdge);
      polygon.push(polygon[0]); 
      polygons.push(polygon);
    }
    
    let geometry;
    if (polygons.length === 0) {
      geometry = { type: "Polygon", coordinates: [] };
    } else if (polygons.length === 1) {
      geometry = { type: "Polygon", coordinates: [polygons[0]] };
    } else {
      geometry = { type: "MultiPolygon", coordinates: polygons.map(p => [p]) };
    }

    return {
      isQthNight: isQthNight,
      geojson: {
        type: "Feature",
        properties: { prop: "shadow" },
        geometry: geometry
      }
    };
  }
  
  return generateTerminator;
});


(function (global, factory) {
  typeof exports === "object" && typeof module !== "undefined"
    ? (module.exports = factory())
    : typeof define === "function" && define.amd
      ? define(factory)
      : (global.CircularTerminator = factory());
})(this, function () {
  "use strict";

  const R2D = 180 / Math.PI;
  const D2R = Math.PI / 180;

  function generateCircularTerminator(options = {}) {
    let today = options.time ? new Date(options.time) : new Date();
    let julianDay = today.getTime() / 86400000.0 + 2440587.5;

    let n = julianDay - 2451545.0;
    
    let gst = (18.697374558 + 24.06570982441908 * n) % 24;
    let L = (280.46 + 0.9856474 * n) % 360;
    let g = (357.528 + 0.9856003 * n) % 360;
    let lambda = L + 1.915 * Math.sin(g * D2R) + 0.02 * Math.sin(2 * g * D2R);
    let T = n / 36525;
    let epsilon = 23.43929111 - T * (46.836769 / 3600);

    let alphaRad = Math.atan(Math.cos(epsilon * D2R) * Math.tan(lambda * D2R));
    let deltaRad = Math.asin(Math.sin(epsilon * D2R) * Math.sin(lambda * D2R));
    
    let alpha = alphaRad * R2D;
    let lQuadrant = Math.floor(lambda / 90) * 90;
    let raQuadrant = Math.floor(alpha / 90) * 90;
    alpha = alpha + (lQuadrant - raQuadrant);

    let sunLat = deltaRad * R2D;
    let sunLon = alpha - (gst * 15);
    
    let nightLat = -sunLat;
    let nightLon = sunLon > 0 ? sunLon - 180 : sunLon + 180;
    
    let nightLatRad = nightLat * D2R;
    let nightLonRad = nightLon * D2R;

    let offset = options.offset !== undefined ? options.offset : -0.833;
    let radiusDegrees = 90 + offset; 
    let radiusRad = radiusDegrees * D2R;

    let polygon = [];
    let steps = 1440; 
    
    let prevLonRad = null;
    let lonOffset = 0;

    for (let i = 0; i <= steps; i++) {
      let bearing = (i * 360 / steps) * D2R;

      let latRad = Math.asin(
        Math.sin(nightLatRad) * Math.cos(radiusRad) + 
        Math.cos(nightLatRad) * Math.sin(radiusRad) * Math.cos(bearing)
      );
      
      let lonRad = nightLonRad + Math.atan2(
        Math.sin(bearing) * Math.sin(radiusRad) * Math.cos(nightLatRad),
        Math.cos(radiusRad) - Math.sin(nightLatRad) * Math.sin(latRad)
      );

      if (prevLonRad !== null) {
          let diff = lonRad - prevLonRad;
          if (diff < -Math.PI) lonOffset += 2 * Math.PI; // Crossed going East
          if (diff > Math.PI) lonOffset -= 2 * Math.PI;  // Crossed going West
      }
      prevLonRad = lonRad;

      let continuousLonRad = lonRad + lonOffset;
      polygon.push([continuousLonRad * R2D, latRad * R2D]);
    }

    let isQthNight = false;
    if (options.qth) {
      let qthLon = options.qth[0];
      let qthLat = options.qth[1];
      let lst = gst + qthLon / 15;
      let haRad = (lst * 15 - alpha) * D2R;
      let latRad = qthLat * D2R;
      
      let altRad = Math.asin(
        Math.sin(latRad) * Math.sin(deltaRad) + 
        Math.cos(latRad) * Math.cos(deltaRad) * Math.cos(haRad)
      );
      isQthNight = (altRad * R2D) < offset;
    }

    return {
      isQthNight: isQthNight,
      geojson: {
        type: "Feature",
        properties: { prop: "shadow" },
        geometry: { type: "Polygon", coordinates: [polygon] }
      }
    };
  }
  
  return generateCircularTerminator;
});


const dayNight = {
  vectorSource: new ol.source.Vector({}),
  
  baseStyle: new ol.style.Style({
    fill: new ol.style.Fill({ color: "rgb(0,0,0)" }),
    stroke: new ol.style.Stroke({ color: "rgb(0,0,0)" })
  }),

  init: function () {
    GT.shadowVector.setSource(this.vectorSource);
    GT.shadowVector.setStyle(this.baseStyle);
  },

  refresh: function () {
    GT.shadowVector.setOpacity(Number(GT.settings.map.graylineOpacity));
    this.vectorSource.clear();
    
    if (GT.useTransform) {
      let terminatorData = CircularTerminator({ 
          offset: GT.terminatorDegrees[GT.settings.map.terminatorDegreeIndex] , 
          qth: [GT.myLon, GT.myLat] 
      });
      
      let isTrueNight = terminatorData.isQthNight;
      let rawPolygon = terminatorData.geojson.geometry.coordinates[0];
      
      let qthProj = ol.proj.fromLonLat([GT.myLon, GT.myLat], GT.settings.map.projection);
      let qx = qthProj[0];
      let qy = qthProj[1];
      
      let R_MAX = 20037508.34; 

      // 1. Project all valid points
      let pts = [];
      for (let i = 0; i < rawPolygon.length; i++) {
        let lon = rawPolygon[i][0];
        let lat = rawPolygon[i][1];
        
        // Strip out the unwrapper jump for standard projection handling
        lon = ((lon + 180) % 360 + 360) % 360 - 180;

        let p = ol.proj.fromLonLat([lon, lat], GT.settings.map.projection);
        
        // Filter out any NaN/Infinity singularities right at the exact antipode
        if (isFinite(p[0]) && isFinite(p[1])) {
            pts.push(p);
        }
      }

      let projectedRing = [];
      let smoothThreshold = 250000; // 250 km: Smooths jagged stretched edges
      let jumpThreshold = 5000000;  // 5,000 km: Detects the true antipode leap

      // Helper function to draw smooth curves for stretched segments
      function injectSmoothCurve(pPrev, pNext, qx, qy, R_MAX) {
          let dist = Math.sqrt(Math.pow(pNext[0] - pPrev[0], 2) + Math.pow(pNext[1] - pPrev[1], 2));
          
          if (dist > smoothThreshold) {
              let a1 = Math.atan2(pPrev[1] - qy, pPrev[0] - qx);
              let a2 = Math.atan2(pNext[1] - qy, pNext[0] - qx);
              let r1 = Math.sqrt(Math.pow(pPrev[0] - qx, 2) + Math.pow(pPrev[1] - qy, 2));
              let r2 = Math.sqrt(Math.pow(pNext[0] - qx, 2) + Math.pow(pNext[1] - qy, 2));
              
              let diff = a2 - a1;
              while (diff < -Math.PI) diff += 2 * Math.PI;
              while (diff > Math.PI) diff -= 2 * Math.PI;
              
              // If it's a massive leap across the antipode, force radius to R_MAX to hug the perimeter
              let isJump = dist > jumpThreshold; 
              
              // Add a point roughly every ~1 degree to ensure a perfect curve
              let steps = Math.ceil(Math.abs(diff) / 0.02); 
              for (let j = 1; j < steps; j++) {
                  let fraction = j / steps;
                  let a = a1 + diff * fraction;
                  let r = isJump ? R_MAX : (r1 + (r2 - r1) * fraction); // Interpolate radius for smooth transition
                  
                  projectedRing.push([
                      qx + Math.cos(a) * r,
                      qy + Math.sin(a) * r
                  ]);
              }
          }
      }

      for (let i = 0; i < pts.length; i++) {
        let p = pts[i];
        if (projectedRing.length > 0) {
            injectSmoothCurve(projectedRing[projectedRing.length - 1], p, qx, qy, R_MAX);
        }
        projectedRing.push(p);
      }

      if (projectedRing.length > 0) {
          injectSmoothCurve(projectedRing[projectedRing.length - 1], projectedRing[0], qx, qy, R_MAX);
      }

      let feature = new ol.Feature({
        geometry: new ol.geom.Polygon([projectedRing])
      });


      let isVisualNight = false;
      let testX = qx + 10, testY = qy + 10; // 10m offset prevents collinear math crashes
      
      for (let i = 0, j = projectedRing.length - 1; i < projectedRing.length; j = i++) {
          let xi = projectedRing[i][0], yi = projectedRing[i][1];
          let xj = projectedRing[j][0], yj = projectedRing[j][1];
          let intersect = ((yi > testY) !== (yj > testY)) && (testX < (xj - xi) * (testY - yi) / (yj - yi) + xi);
          if (intersect) isVisualNight = !isVisualNight;
      }

      if (isTrueNight !== isVisualNight) {
          let shadowRing = projectedRing.slice().reverse(); 
          let maxDist = 100000000;
          
          let worldRing = [
              [qx + maxDist, qy + maxDist], // Top-Right
              [qx - maxDist, qy + maxDist], // Top-Left
              [qx - maxDist, qy - maxDist], // Bottom-Left
              [qx + maxDist, qy - maxDist], // Bottom-Right
              [qx + maxDist, qy + maxDist]  // Close it
          ];
          
          feature.setGeometry(new ol.geom.Polygon([worldRing, shadowRing]));
      }
      
      this.vectorSource.addFeature(feature);
      return isTrueNight;

    } else {
      // Standard Mercator Fallback
      let terminatorData = GeoJSONTerminator({ 
        offset: GT.terminatorDegrees[GT.settings.map.terminatorDegreeIndex], 
        qth: [GT.myLon, GT.myLat] 
      });
    
      let isTrueNight = terminatorData.isQthNight;
      let format = new ol.format.GeoJSON();
      let feature = format.readFeature(terminatorData.geojson, {
        featureProjection: GT.settings.map.projection
      });
      this.vectorSource.addFeature(feature);
      return isTrueNight;
    }
  },

  show: function () {
    GT.shadowVector.setVisible(true);
    return this.refresh();
  },

  hide: function () {
    GT.shadowVector.setVisible(false);
  },

  isVisible: function () {
    return GT.shadowVector.getVisible();
  }
};

let moonLayer = {
  vectorSource: null,
  vectorLayer: null,
  icon: null,
  pin: null,
  init: function (map)
  {
    this.icon = new ol.style.Icon({
      src: "img/luna.png",
      anchorYUnits: "pixels",
      anchorXUnits: "pixels",
      anchor: [255, 255],
      scale: 0.1,
      opacity: 0.5
    });

    this.pin = iconFeature(
      ol.proj.fromLonLat(subLunar(timeNowSec()).ll),
      this.icon,
      0,
      "moon"
    );
    this.pin.size = 99;
    this.vectorSource = new ol.source.Vector({});

    this.vectorLayer = new ol.layer.Vector({
      source: this.vectorSource,
      zIndex: 30
    });
    map.getLayers().insertAt(1, this.vectorLayer);
  },
  future: function (now)
  {
    let r = 0;
    let x = 25;
    let i = 3600;
    let data = Array();
    for (r = 0; r < x; r++)
    {
      data.push(subLunar(now + r * i).ll);
    }
    let line = [];

    let lonOff = 0;
    let lastc = 0;

    for (let i = 0; i < data.length; i++)
    {
      let c = data[i];
      if (isNaN(c[0]))
      {
        continue;
      }
      if (Math.abs(lastc - c[0]) > 270)
      {
        // Wrapped
        if (c[0] < lastc)
        {
          lonOff += 360;
        }
        else
        {
          lonOff -= 360;
        }
      }
      lastc = c[0];
      line.push(ol.proj.fromLonLat([c[0] + lonOff, c[1]]));
    }

    if (line.length == 0)
    {
      line.push(ol.proj.fromLonLat(start));
    }

    line = new ol.geom.LineString(line);
    let feature = new ol.Feature({ geometry: line, prop: "moonFlight" });

    if (GT.useTransform)
    {
      feature.getGeometry().transform("EPSG:3857", GT.settings.map.projection);
    }
    
    feature.setStyle(
      new ol.style.Style({
        stroke: new ol.style.Stroke({ color: "#FFF", width: 1 })
      })
    );

    return feature;
  },
  refresh: function ()
  {
    this.vectorSource.clear();
    if (GT.settings.app.moonTrack == 1)
    {
      this.pin = iconFeature(
        ol.proj.fromLonLat(subLunar(timeNowSec()).ll),
        this.icon,
        0,
        "moon"
      );
      this.pin.size = 99;
      this.vectorSource.addFeature(this.pin);
    }
  },

  show: function ()
  {
    this.refresh();
    this.vectorLayer.setVisible(true);
    lunaButonImg.style.webkitFilter = "brightness(100%)";
  },
  hide: function ()
  {
    this.vectorLayer.setVisible(false);
    lunaButonImg.style.webkitFilter = "brightness(50%)";
  },
  isVisible: function ()
  {
    return this.vectorLayer.getVisible();
  }
};
