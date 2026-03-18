/* eslint-disable */

// HamGridSquare.js
// Copyright 2014 Paul Brewer KI6CQ
// License:  MIT License http://opensource.org/licenses/MIT
//
// Javascript routines to convert from lat-lon to Maidenhead Grid Squares
// typically used in Ham Radio Satellite operations and VHF Contests
//
// Inspired in part by K6WRU Walter Underwood's python answer
// http://ham.stackexchange.com/a/244
// to this stack overflow question:
// How Can One Convert From Lat/Long to Grid Square
// http://ham.stackexchange.com/questions/221/how-can-one-convert-from-lat-long-to-grid-square
//

const MH_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWX";
function latLonToGridSquare(lat, lon, width = 4)
{
  let adjLat,adjLon,GLat,GLon,nLat,nLon,gLat,gLon,rLat,rLon;
  
  if (isNaN(lat)) throw "lat is NaN";
  if (isNaN(lon)) throw "lon is NaN";
  if (Math.abs(lat) == 90.0) throw "grid g_grids invalid at N/S poles";
  if (Math.abs(lat) > 90) throw "invalid latitude: "+lat;
  if (Math.abs(lon) > 180)
  {
    if ( lon > 180 )
    {
      let temp = lon + 360;
      temp = temp % 360;
      lon = temp - 360;
    }
    while ( lon < -180 )
    {
      lon += 180;
      lon = 180 + lon;
    } // 53032
  }
  adjLat = lat + 90;
  adjLon = lon + 180;
  GLat = MH_CHARS[Math.trunc(adjLat/10)];
  GLon = MH_CHARS[Math.trunc(adjLon/20)];
  nLat = ''+Math.trunc(adjLat % 10);
  nLon = ''+Math.trunc((adjLon/2) % 10);
  
  if (width == 4)
  {
    return GLon+GLat+nLon+nLat;
  }
  else
  {
    rLat = (adjLat - Math.trunc(adjLat)) * 60;
    rLon = (adjLon - 2*Math.trunc(adjLon/2)) *60;
    gLat = MH_CHARS[Math.trunc(rLat/2.5)];
    gLon = MH_CHARS[Math.trunc(rLon/5)];
    return GLon+GLat+nLon+nLat+gLon+gLat;
  }
}

const K_Unit_to_Rad = {'M': 6371009, 'KM': 6371.009, 'MI': 3958.761, 'NM': 3440.070, 'YD': 6967420, 'FT': 20902260, 'DG': 57.2957795131};
const K_PI_tt = Math.PI / 180;
const K_tt_PI = 180 / Math.PI;

const MyCircle = {
    validateRadius: function(unit) {
        return (unit in K_Unit_to_Rad) ? K_Unit_to_Rad[unit] : unit;
    },

    distance: function(lat1, lon1, lat2, lon2) {
        lat1 *= K_PI_tt;
        lon1 *= K_PI_tt;
        lat2 *= K_PI_tt;
        lon2 *= K_PI_tt;
        let lonDelta = lon2 - lon1;
        let a = Math.pow(Math.cos(lat2) * Math.sin(lonDelta) , 2) + Math.pow(Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lonDelta) , 2);
        let b = Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(lonDelta);
        return Math.atan2(Math.sqrt(a) , b);
    },

    bearing: function(lat1, lon1, lat2, lon2) {
        lat1 *= K_PI_tt;
        lon1 *= K_PI_tt;
        lat2 *= K_PI_tt;
        lon2 *= K_PI_tt;
        let lonDelta = lon2 - lon1;
        let y = Math.sin(lonDelta) * Math.cos(lat2);
        let x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lonDelta);
        let brng = Math.atan2(y, x);
        brng = brng * K_tt_PI;
        return (brng < 0) ? brng + 360 : brng;
    }
}

if (typeof module != 'undefined' && module.exports) {
    module.exports = MyCircle;
} else {
    window['MyCircle'] = MyCircle;
}

/**
 * XML2jsobj v1.0
 * Converts XML to a JavaScript object
 * so it can be handled like a JSON message
 *
 * By Craig Buckler, @craigbuckler, http://optimalworks.net
 *
 * As featured on SitePoint.com:
 * http://www.sitepoint.com/xml-to-javascript-object/
 *
 * Please use as you wish at your own risk.
 */

function XML2jsobj(node) {

  let	data = null;

  // append a value
  function Add(name, value) {
    if (value == null) return;
    if (data == null) data = {};
    if (data[name]) {
      if (data[name].constructor != Array) {
        data[name] = [data[name]];
      }
      data[name][data[name].length] = value;
    }
    else {
      data[name] = value;
    }
  };

  // element attributes
  let c, cn;
  for (c = 0; cn = node.attributes[c]; c++) {
    Add(cn.name, cn.value);
  }

  // child elements
  for (c = 0; cn = node.childNodes[c]; c++) {
    if (cn.nodeType == 1) {
      if (cn.childNodes.length == 1 && cn.firstChild.nodeType == 3) {
        // text value
        Add(cn.nodeName, cn.firstChild.nodeValue);
      }
      else {
        // sub-object
        Add(cn.nodeName, XML2jsobj(cn));
      }
    }
  }

  return data;
}

function lineGeometry(points, steps)
{
  // Map coords into lat lngs
  let start = points[0];
  let end = points[1];
  let generator = new arc.GreatCircle({ x: start[0], y: start[1] }, { x: end[0], y: end[1] });
  let path = generator.Arc(steps, { offset: 10 });

  let line = [];
  let geom = path.geometries;
  let lonOff = 0;
  let lastc = 0;
  for (const j in geom) 
  {
    for (const i in geom[j].coords)
    {
      const c = geom[j].coords[i];
      if (isNaN(c[0])) continue;
      // wrapped?
      if (Math.abs(lastc - c[0]) > 270) (c[0] < lastc) ? lonOff += 360 : lonOff -= 360;
      lastc = c[0];
      line.push(ol.proj.fromLonLat([ lastc + lonOff, c[1]]));
    }
  }
  return line;
}

function rad2deg (r) { return (57.2957795131*r); }
function deg2rad (d) { return (0.01745329251*d); }

function sin(x) { return Math.sin(x); }
function cos(x) { return Math.cos(x); }
function atan2(x,y) { return Math.atan2(x,y); }
function sqrt(x) { return Math.sqrt(x); }
function fmod(a,b) { return Number((a - (Math.floor(a / b) * b)).toPrecision(8)); };

/* given seconds since 1/1/1970 compute sublunar lat and long.
 * http://www.stjarnhimlen.se/comp/ppcomp.html
 */
function subLunar(t)
{
  // want days since 1999 Dec 31, 0:00 UT
  let d = (t - 946598400)/(3600.0*24.0);

  /* use this if given year month day hour
  * double d = 367*y - 7 * ( y + (m+9)/12 ) / 4 + 275*m/9 + D - 730530;	// all integer divisions
  * d = d + UT/24.0;
  */

  let M_PI = Math.PI;
  // obliquity of the ecliptic
  let ecl = M_PI/180.0*(23.4393 - 3.563E-7 * d);

  /* N = longitude of the ascending node
  * i = inclination to the ecliptic
  * w = argument of perihelion
  * a = semi-major axis
  * e = eccentricity (0=circle, 0-1=ellipse, 1=parabola)
  * M = mean anomaly (0 at perihelion; increases uniformly with time)
  */

  // lunar orbital elements, with respect to Earth
  let N_m = M_PI/180.0*(125.1228 - 0.0529538083 * d);
  let i_m = M_PI/180.0*(5.1454);
  let w_m = M_PI/180.0*(318.0634 + 0.1643573223 * d);
  let a_m = 60.2666;		// Earth radii
  let e_m = 0.054900;
  let M_m = M_PI/180.0*(115.3654 + 13.0649929509 * d);

  // solar orbital elements (really Earth's)
  // double N_s = M_PI/180.0 * (0.0);
  // double i_s = M_PI/180.0 * (0.0);
  let w_s = M_PI/180.0 * (282.9404 + 4.70935E-5 * d);
  // double a_s = 1.000000;			// AU
  // double e_s = 0.016709 - 1.151E-9 * d;
  let M_s = M_PI/180.0 * (356.0470 + 0.9856002585 * d);

  // solar eccentric anomaly
  // double E_s = M_s + e_s * sin(M_s) * ( 1.0 + e_s * cos(M_s) );

  // eccentric anomaly, no need to refine if e < ~0.05
  let E_m = M_m + e_m * sin(M_m) * ( 1.0 + e_m * cos(M_m) );

  // solar distance and true anomaly
  // double xv_s = cos(E_s) - e_s;
  // double yv_s = sqrt(1.0 - e_s*e_s) * sin(E_s);
  // double v_s = atan2( yv_s, xv_s );
  // double r_s = sqrt( xv_s*xv_s + yv_s*yv_s );

  // lunar distance and true anomaly
  let xv_m = a_m * ( cos(E_m) - e_m );
  let yv_m = a_m * ( sqrt(1.0 - e_m*e_m) * sin(E_m) );
  let v_m = atan2 ( yv_m, xv_m );
  let r_m = sqrt ( xv_m*xv_m + yv_m*yv_m );

  // ideal (without perturbations) geocentric ecliptic position in 3-dimensional space:
  let xh_m = r_m * ( cos(N_m) * cos(v_m+w_m) - sin(N_m) * sin(v_m+w_m) * cos(i_m) );
  let yh_m = r_m * ( sin(N_m) * cos(v_m+w_m) + cos(N_m) * sin(v_m+w_m) * cos(i_m) );
  let zh_m = r_m * ( sin(v_m+w_m) * sin(i_m) );

  // ecliptic long and lat
  let lonecl_m = atan2( yh_m, xh_m );
  let latecl_m = atan2( zh_m, sqrt(xh_m*xh_m+yh_m*yh_m) );

  // add enough perturbations to yield max error 0.25 degrees long, 0.15 degs lat
  let L_s = M_s + w_s;					// Mean Longitude of the Sun (Ns=0)
  let L_m = M_m + w_m + N_m;				// Mean longitude of the Moon
  let D_m = L_m - L_s;        				// Mean elongation of the Moon
  let F_m = L_m - N_m; 					// Argument of latitude for the Moon
  lonecl_m += M_PI/180.0 * (-1.274 * sin(M_m - 2*D_m));	// Ptolemy's "Evection"
  lonecl_m +=	M_PI/180.0 * ( 0.658 * sin(2*D_m));		// Brahe's "Variation"
  lonecl_m += M_PI/180.0 * ( 0.186 * sin(M_s));		// Brahe's "Yearly Equation"
  latecl_m += M_PI/180.0 * (-0.173 * sin(F_m - 2*D_m));

  // convert back to geocentric, now with perturbations applied
  xh_m = r_m * cos(lonecl_m) * cos(latecl_m);
  yh_m = r_m * sin(lonecl_m) * cos(latecl_m);
  zh_m = r_m * sin(latecl_m);

  // lunar ecliptic to geocentric (already)
  let xg_m = xh_m;
  let yg_m = yh_m;
  let zg_m = zh_m;

  // convert to equatorial by rotating ecliptic by obliquity
  let xe_m = xg_m;
  let ye_m = yg_m * cos(ecl) - zg_m * sin(ecl);
  let ze_m = yg_m * sin(ecl) + zg_m * cos(ecl);

  // compute the planet's Right Ascension (RA) and Declination (Dec):
  let RA  = 180/M_PI * fmod (atan2( ye_m, xe_m ) + 2*M_PI, 2*M_PI);	// degrees
  let Dec = atan2( ze_m, sqrt(xe_m*xe_m+ye_m*ye_m) );			// rads

  let ll = {};
  ll.lat = Dec;
  ll.lat_d = rad2deg(ll.lat);

  let JD = (t/86400.0) + 2440587.5;
  let D = JD - 2451545.0;
  let GMST = fmod(15*(18.697374558 + 24.06570982441908*D), 360.0);
  ll.lng_d = fmod(RA-GMST+36000.0+180.0, 360.0) - 180.0;
  ll.lng = deg2rad(ll.lng_d);

  let data = {};
  data.ll = [ll.lng_d,ll.lat_d];
  data.RA = RA/15;
  data.Dec = 180/M_PI*Dec;

  return data;
}

function doRAconvert(lg, la, ras, decs) {

  let jd = datetojd();
  let lgt = lg;
  let lat = rad(la);
  let ra = ras;
  let dec = rad(decs);
  let st = sidTime(jd-2400000.5, lgt)

  return convert(ra, dec, st,lat);
}

function fraction(x) {
  x = x-Math.floor(x);
  if (x < 0) x++;
  return x;
}

function sidTime(mjd, lambda) {
  let mjdo=Math.floor(mjd);
  let ut = (mjd-mjdo)*24;
  let t = (mjdo-51544.5) / 36525.0;
  let gmst=6.697374558+1.0027379093*ut+(8640184.812866+(0.093104-6.2E-6*t)*t)*t/3600.0;
  return (24.0*fraction((gmst+lambda/15.0)/24.0));
}

function datetojd() 
{
  return (timeNowSec() / 86400.0) + 2440587.5;
}

function deg(angle) {
  return angle*180/Math.PI;
}

function rad(angle) {
  return angle*Math.PI/180;
}

function convert(ra, dec, lmst,lat) {
  let hangle=rad((lmst-ra)*15);
  let sinalt=Math.sin(dec)*Math.sin(lat)+Math.cos(dec)*Math.cos(hangle)*Math.cos(lat);
  let alt=Math.asin(sinalt);
  let sinaz=-Math.cos(dec)*Math.sin(hangle)/Math.cos(alt);
  let cosaz=Math.sin(dec)*Math.cos(lat)-Math.cos(dec)*Math.cos(hangle)*Math.sin(lat);
  let az = (cosaz <= 0.0) ? Math.PI-Math.asin(sinaz) : (sinaz <= 0.0) ? 2*Math.PI+Math.asin(sinaz) : Math.asin(sinaz);

  let data = {};
  data.azimuth = deg(az);
  data.elevation = deg(alt);
  return data;
}
