class Spherical {
    constructor(lat, lon) {
        this.lon = lon;
        this.sinc = Math.cos(lat);
        this.cosc = Math.sin(lat);
    }
    calc(dir, dist) {
        this.dist = dist;
        this.dir = dir;
        const cosDist = Math.cos(dist);
        const sinDist = Math.sin(dist);
        const cosDir = Math.cos(dir);
        const sinDir = Math.sin(dir);
        
        let newSinLat = this.cosc * cosDist + this.sinc * sinDist * cosDir;
        let sinLonDelta = sinDist * sinDir / Math.sqrt(1 - newSinLat * newSinLat);
        
        let newLonDelta = Math.asin(Math.max(-1, Math.min(1, sinLonDelta)));
        let newLat = Math.asin(Math.max(-1, Math.min(1, newSinLat)));
        
        let reverseSin = this.sinc * sinDir;
        let reverse = -Math.asin(Math.max(-1, Math.min(1, reverseSin)));
        
        if (this.cosc < cosDist * newSinLat) {
            reverse = Math.PI - reverse;
        }
        
        this.new_lat = newLat;
        this.new_lon = this.lon + newLonDelta;
        this.reverse = reverse;
        return this;
    }
}

function to_d(rad) {
    return 180 * rad / Math.PI;
}

class Bezier {
    constructor(p0, p1, p3, p2) {
        this.x0 = to_d(p0.new_lon);
        this.y0 = to_d(p0.new_lat);
        
        const x1 = to_d(p1.new_lon);
        const y1 = to_d(p1.new_lat);
        const x2 = to_d(p2.new_lon);
        const y2 = to_d(p2.new_lat);
        const x3 = to_d(p3.new_lon);
        const y3 = to_d(p3.new_lat);
        
        this.cx = 3 * (x1 - this.x0);
        this.bx = 3 * (x2 - x1) - this.cx;
        this.ax = x3 - this.x0 - this.cx - this.bx;
        
        this.cy = 3 * (y1 - this.y0);
        this.by = 3 * (y2 - y1) - this.cy;
        this.ay = y3 - this.y0 - this.cy - this.by;
    }
    calc(t) {
        const x = t * (t * (t * this.ax + this.bx) + this.cx) + this.x0;
        const y = t * (t * (t * this.ay + this.by) + this.cy) + this.y0;
        this.pos = [x, y];
        return this;
    }
}

function bez_smooth(coords, bez, t0, t1, depth) {
    if (depth > 4) return; // 16 segments is smooth enough
    
    const tMid = (t0 + t1) / 2;
    const midPoint = bez.calc(tMid).pos;
    
    if (depth < 3) {
        bez_smooth(coords, bez, t0, tMid, depth + 1);
        coords.push(midPoint);
        bez_smooth(coords, bez, tMid, t1, depth + 1);
    }
}

function pl_pair(coords, p1, p2, useSmooth) {
    coords.push([to_d(p1.new_lon), to_d(p1.new_lat)]);
    if (!useSmooth) return;
    
    const h1 = new Spherical(p1.new_lat, p1.new_lon);
    const h2 = new Spherical(p2.new_lat, p2.new_lon);
    
    h1.calc(p1.reverse - Math.PI / 2, 0.3 * p1.dist);
    h2.calc(p2.reverse + Math.PI / 2, 0.3 * p2.dist);
    
    const bez = new Bezier(p1, h1, p2, h2);
    bez_smooth(coords, bez, 0, 1, 0);
}

const isPi = process && process.platform === 'linux' && (process.arch === 'arm' || process.arch === 'arm64');

function dxviewSpokesToFeature(node) {
    if (!node.spokes || node.spokes.length === 0) return null;
    
    let coords = [];
    let pPrev = null;
    let pFirst = null;
    let maxDist = 0;
    
    let arr = node.spokes.slice(0);
    const useSmooth = !isPi; // Disable smoothing on Raspberry Pi
    
    while (arr.length > 0) {
        let dir = arr.shift();
        let dist = arr.shift();
        if (dist > maxDist) maxDist = dist;
        
        let pCurr = new Spherical(node.lat, node.lon);
        pCurr.calc(dir, dist);
        
        if (pPrev) {
            if (pCurr.dir - pPrev.dir > Math.PI) {
                let pZero = new Spherical(node.lat, node.lon);
                pZero.calc(0, 0);
                pl_pair(coords, pPrev, pZero, useSmooth);
                pl_pair(coords, pZero, pCurr, useSmooth);
            } else {
                pl_pair(coords, pPrev, pCurr, useSmooth);
            }
        } else {
            pFirst = pCurr;
        }
        pPrev = pCurr;
    }
    
    if (2 * Math.PI - pPrev.dir + pFirst.dir > Math.PI) {
        let pZero = new Spherical(node.lat, node.lon);
        pZero.calc(0, 0);
        pl_pair(coords, pPrev, pZero, useSmooth);
        pl_pair(coords, pZero, pFirst, useSmooth);
    } else {
        pl_pair(coords, pPrev, pFirst, useSmooth);
    }
    
    if (coords.length > 0) {
        coords.push(coords[0]); // close polygon
    }
    
    // Create Polygon using the raw EPSG:4326 (LonLat degrees) coordinates
    const poly = new ol.geom.Polygon([coords]);
    
    if (GT.useTransform) {
        // Calculate the Antipode (exact opposite side of the Earth)
        let antiLon = GT.myLon > 0 ? GT.myLon - 180 : GT.myLon + 180;
        let antiLat = -GT.myLat;
        
        let testLon = antiLon + 0.00013;
        let testLat = antiLat + 0.00017;
        if (testLat <= -89.9) testLat = -89.9;
        else if (testLat >= 89.9) testLat = 89.9;

        let rings = poly.getCoordinates();
        
        // Check if the Antipode is inside the Tropo polygon (meaning the polygon inverted)
        let inverted = pointInPolygon([testLon, testLat], rings[0]);
        
        // Add extra vertices along long lines to prevent projection tearing
        poly.setCoordinates(rings.map(ring => segmentizeRing(ring, antiLon, antiLat)));
        
        // Transform to the AEQD projection
        poly.transform('EPSG:4326', GT.settings.map.projection);

        // If inverted, unshift the global world ring to turn the polygon inside-out
        if (inverted) {
            // Deep copy the cached world ring to prevent OpenLayers mutation bugs
            let clonedWorldRing = K_CACHED_WORLD_RING.map(coord => [coord[0], coord[1]]);
            let newRings = poly.getCoordinates();
            newRings.unshift(clonedWorldRing);
            poly.setCoordinates(newRings);
        }
    } else {
        poly.transform('EPSG:4326', GT.settings.map.projection);
    }
    
    const feature = new ol.Feature({
        geometry: poly
    });
    
    // DXView Color Math
    const distKm = maxDist * 6371; 
    let o = 0, g = 255, r = 255;
    if (distKm > 250) {
        o = 255 - (distKm - 250) / (500 / 255);
        g = Math.floor(Math.max(0, Math.min(o, 255)));
    } else {
        o = distKm / (250 / 255);
        r = Math.floor(Math.max(0, Math.min(o, 255)));
    }
    
    // Age fading
    const max_age_mins = 60;
    const ageMs = Date.now() - (node.ts * 1000);
    const maxAgeMs = max_age_mins * 60 * 1000;
    
    let opacity = 0.4;
    if (ageMs > 0) {
        opacity = Math.max(Math.min((maxAgeMs - ageMs) / maxAgeMs, 1), 0.025);
    }
    
    feature.setStyle(new ol.style.Style({
        fill: new ol.style.Fill({
            color: [r, g, 0, opacity] 
        }),
        zIndex: 10000 - Math.round(distKm) // Fixed Z-Index
    }));

    return feature;
}

function createTropoLayer() {
  if (!GT.tropoData.tropoSource)
  {
    GT.tropoData.tropoSource = new ol.source.Vector( { attributions: "<a href='https://vhf.dxview.org/' target='_blank' title='Visit dxview.org'>DXView</a>", });
  }
  let layer = new ol.layer.Vector({
      source: GT.tropoData.tropoSource,
      opacity: Number(GT.settings.map.predOpacity),
      visible: true,
      zIndex: 0
  });
  
  layer.set("name", "Pred");
  
  fetchTropoLayer();
  
  return layer;
}

function stopTropoTimer() {
    if (GT.tropoData.timeout) {
        nodeTimers.clearTimeout(GT.tropoData.timeout);
        GT.tropoData.timeout = null;
    }
}

function renderTropoData() {
    GT.tropoData.tropoSource.clear();
    
    if (Object.keys(GT.tropoData.nodes).length == 0) return;
    
    const features = [];
    const now = Date.now();
    const maxAgeMs = 60 * 60 * 1000; // 60 minutes
    
    for (const call in GT.tropoData.nodes) {
        const node = GT.tropoData.nodes[call];
        
        // PRUNE EXPIRED NODES TO PREVENT MEMORY LEAK
        if (now - (node.ts * 1000) > maxAgeMs) {
            delete GT.tropoData.nodes[call];
            continue;
        }
        
        const feat = dxviewSpokesToFeature(node);
        if (feat) features.push(feat);
    }
    GT.tropoData.tropoSource.addFeatures(features);
}

function fetchTropoLayer()
{
  stopTropoTimer();
  
  if (GT.settings.map.predMode !== 5) 
  {
    return;
  }

  // Gets the center of the screen
  const center = GT.map.getView().getCenter(); 

  // Calculates true meters per pixel at the current latitude, regardless of projection
  const pointResolution = Math.min(ol.proj.getPointResolution(
      GT.map.getView().getProjection(),
      GT.map.getView().getResolution(),
      center
  ) , 10000);

  // True radians per pixel (using meters / Earth radius in meters)
  const resRads = pointResolution / 6371000; 

  const sizeParam = resRads.toExponential(4);

  // Calculate Grid Fields in view to prevent server from capping results to large macro-blobs
  const extent = GT.map.getView().calculateExtent(GT.map.getSize());
  let bl = ol.proj.toLonLat([extent[0], extent[1]], GT.settings.map.projection);
  let tr = ol.proj.toLonLat([extent[2], extent[3]], GT.settings.map.projection);

  // Handle NaN fallbacks for continuous panning
  if (Number.isNaN(bl[0])) bl[0] = -180;
  if (Number.isNaN(tr[0])) tr[0] = 179.999;

  // Clamp Latitude to physical earth borders to prevent N/S inversion on extreme zoom outs, 
  // but allow Longitude to exceed bounds so the modulo math can seamlessly wrap endless E/W panning.
  bl[1] = Number.isNaN(bl[1]) ?  -90 : Math.max( -90, bl[1]);
  tr[1] = Number.isNaN(tr[1]) ? 89.999 : Math.min(89.999, tr[1]);

  let t = (9 + Math.floor(bl[0] / 20)) % 18;
  let e = (9 + Math.floor(bl[1] / 10)) % 18;
  let s = (9 + Math.floor(tr[0] / 20)) % 18;
  let o = (9 + Math.floor(tr[1] / 10)) % 18;
  
  // Only Longitude (t, s) can be negative now since Latitude is strictly clamped
  if (t < 0) t += 18;
  if (s < 0) s += 18;

  
  // Generate the 2-character Maidenhead field for Bottom-Left and Top-Right
  const blField = String.fromCharCode(t + 65, e + 65);
  const trField = String.fromCharCode(s + 65, o + 65);

  // If they are the same field, only send it once
  let fields = blField;
  if (blField !== trField) {
      fields += trField;
  }

  const url = `https://vhf.dxview.org/map/refresh?band=50&alert_id=${GT.tropoData.alert_id}&size=${sizeParam}&squares=${fields}`;
    
  getBuffer(url, handleTropoData, null, "https", 443, false);
}

function handleTropoData(buffer) {
  if (GT.settings.map.predMode !== 5) return;
  
  try {
      const json = JSON.parse(buffer);
      
      if (json.update_calls) {
          for (const node of json.update_calls) {
              GT.tropoData.nodes[node.call] = node;
          }
      }

      if ("refresh_delay" in json) {
        const t = json.refresh_delay;
        0 < t ? GT.tropoData.refresh < 1024 && (GT.tropoData.refresh *= 2) : t < 0 && 16 < GT.tropoData.refresh && (GT.tropoData.refresh /= 2)
      }
      
      GT.tropoData.alert_id = json.alert_id;

      renderTropoData();
  } catch (e) {
      console.error("Tropo parsing error:", e);
  }
        
  stopTropoTimer();

  GT.tropoData.timeout = nodeTimers.setTimeout(fetchTropoLayer, GT.tropoData.refresh * 1000);
}
