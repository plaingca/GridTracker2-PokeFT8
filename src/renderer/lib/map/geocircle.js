const MAX_LAT = 85;
const MIN_LAT = -85;
const EARTH_RADIUS_KM = 6371.0088;

/**
 * Calculates a destination point from a center given distance and bearing.
 */
function getDestination(lat, lng, bearingDeg, distanceKm) {
    const d = distanceKm / EARTH_RADIUS_KM;
    const brng = bearingDeg * Math.PI / 180;
    const phi1 = lat * Math.PI / 180;
    const lam1 = lng * Math.PI / 180;

    const phi2 = Math.asin(Math.sin(phi1) * Math.cos(d) + Math.cos(phi1) * Math.sin(d) * Math.cos(brng));
    let lam2 = lam1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(phi1), Math.cos(d) - Math.sin(phi1) * Math.sin(phi2));

    // Normalize longitude to -180..180 strictly
    lam2 = lam2 * 180 / Math.PI;
    lam2 = ((lam2 + 540) % 360) - 180;

    return {
        lat: phi2 * 180 / Math.PI,
        lng: lam2
    };
}

/**
 * Main Function: Generates a geodesic circle strictly bound to Map bounds
 */
function generateGeodesicCircle(centerLng, centerLat, diameterKm) {
    const radiusKm = diameterKm / 2;
    const steps = 360; 
    
    let multiLineString = [];

    // Helper to join continuous line segments to prevent massive arrays of 2-point lines
    function addSegment(x1, y1, x2, y2) {
        if (multiLineString.length > 0) {
            let currentLine = multiLineString[multiLineString.length - 1];
            let lastPt = currentLine[currentLine.length - 1];
            // If the new segment physically touches the end of the last segment, combine them
            if (Math.abs(lastPt[0] - x1) < 1e-5 && Math.abs(lastPt[1] - y1) < 1e-5) {
                currentLine.push([x2, y2]);
                return;
            }
        }
        // Otherwise start a new separated line string
        multiLineString.push([[x1, y1], [x2, y2]]);
    }

    let prevLat = null;
    let prevLng = null;
    let prevContinuousLng = null;

    for (let i = 0; i <= steps; i++) {
        const bearing = (i * 360) / steps;
        const dest = getDestination(centerLat, centerLng, bearing, radiusKm);
        
        if (i === 0) {
            prevLat = dest.lat;
            prevLng = dest.lng;
            prevContinuousLng = dest.lng;
            continue;
        }

        // Calculate continuous mathematical longitude (ignoring boundaries momentarily)
        let dLng = dest.lng - prevLng;
        if (dLng > 180) dLng -= 360;
        else if (dLng < -180) dLng += 360;
        
        let continuousLng = prevContinuousLng + dLng;
        let lat = dest.lat;

        // 1. Clip against latitudes (-85 to 85)
        let t1 = 0, t2 = 1;
        let skip = false;

        // If whole segment is above or below Web Mercator bounds, skip it entirely
        if (prevLat > MAX_LAT && lat > MAX_LAT) skip = true;
        if (prevLat < MIN_LAT && lat < MIN_LAT) skip = true;

        if (!skip) {
            // Find intersection percentages if crossing polar boundaries
            if (prevLat > MAX_LAT) t1 = (MAX_LAT - prevLat) / (lat - prevLat);
            else if (prevLat < MIN_LAT) t1 = (MIN_LAT - prevLat) / (lat - prevLat);

            if (lat > MAX_LAT) t2 = (MAX_LAT - prevLat) / (lat - prevLat);
            else if (lat < MIN_LAT) t2 = (MIN_LAT - prevLat) / (lat - prevLat);

            // Calculate mathematically clamped segment coordinates
            let cx1 = prevContinuousLng + t1 * (continuousLng - prevContinuousLng);
            let cy1 = prevLat + t1 * (lat - prevLat);
            let cx2 = prevContinuousLng + t2 * (continuousLng - prevContinuousLng);
            let cy2 = prevLat + t2 * (lat - prevLat);

            // 2. Wrap/Slice along Longitudes (Antimeridian cuts)
            let w1 = Math.floor((cx1 + 180) / 360);
            let w2 = Math.floor((cx2 + 180) / 360);

            if (w1 === w2) {
                // Segment is safely inside a single map boundary
                addSegment(cx1 - w1 * 360, cy1, cx2 - w2 * 360, cy2);
            } else {
                // Segment crossed the antimeridian, slice it EXACTLY at +/- 180
                let boundX = 180 + Math.min(w1, w2) * 360;
                let tCross = (boundX - cx1) / (cx2 - cx1);
                let crossY = cy1 + tCross * (cy2 - cy1);

                addSegment(cx1 - w1 * 360, cy1, boundX - w1 * 360, crossY);
                addSegment(boundX - w2 * 360, crossY, cx2 - w2 * 360, cy2);
            }
        }

        prevLat = lat;
        prevLng = dest.lng;
        prevContinuousLng = continuousLng;
    }

    if (multiLineString.length === 0) return null;

    // Clean up closure seamlessly to prevent any double-opacity overlaps
    if (multiLineString.length > 1) {
        let firstLine = multiLineString[0];
        let lastLine = multiLineString[multiLineString.length - 1];
        let firstPt = firstLine[0];
        let lastPt = lastLine[lastLine.length - 1];
        
        // ONLY connect start to end if they rest on the EXACT same physical coordinate
        if (Math.abs(firstPt[0] - lastPt[0]) < 1e-5 && Math.abs(firstPt[1] - lastPt[1]) < 1e-5) {
            lastLine.pop();
            multiLineString[0] = lastLine.concat(firstLine);
            multiLineString.pop();
        }
    }

    return {
        type: "Feature",
        properties: {},
        geometry: {
            type: multiLineString.length === 1 ? "LineString" : "MultiLineString",
            coordinates: multiLineString.length === 1 ? multiLineString[0] : multiLineString
        }
    };
}
