// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Reference data: Maidenhead/DXCC data load and BigCTY updates (moved from GridTracker2.js)

function updateFromBigCty(dxccBigCTY)
{
  GT.prefixToDXCC = {};
  GT.directCallToDXCC = {};
  GT.directCallToCQzone = {};
  GT.directCallToITUzone = {};
  GT.prefixToCQzone = {};
  GT.prefixToITUzone = {};

  // Safety measure for backwards compatibility
  delete dxccBigCTY[0];

  for (let key in dxccBigCTY)
  {
    const info = dxccBigCTY[key]; 

    GT.dxccInfo[key].cqzone = info.cqzone;
    GT.dxccInfo[key].ituzone = info.ituzone;

    const dxcc = Number(key);
    
    GT.prefixToDXCC[GT.dxccInfo[key].pp] = dxcc;

    for (let i = 0; i < info.prefix.length; i++) {
      GT.prefixToDXCC[info.prefix[i]] = dxcc;
    }

    for (let i = 0; i < info.direct.length; i++) {
      GT.directCallToDXCC[info.direct[i]] = dxcc;
    }
 
    for (let val in info.prefixCQ) GT.prefixToCQzone[val] = info.prefixCQ[val];
    for (let val in info.prefixITU) GT.prefixToITUzone[val] = info.prefixITU[val];
    for (let val in info.directCQ) GT.directCallToCQzone[val] = info.directCQ[val];
    for (let val in info.directITU) GT.directCallToITUzone[val] = info.directITU[val];
  }
}

function loadMaidenHeadData()
{
  GT.dxccInfo = window.require(GT.dxccBasePath);

  for (let key in GT.dxccInfo)
  {
    const info = GT.dxccInfo[key]; 

    GT.dxccToAltName[info.dxcc] = info.name;
    GT.dxccToADIFName[info.dxcc] = info.aname;
    GT.altNameToDXCC[info.name] = info.dxcc;
    GT.dxccToCountryCode[info.dxcc] = info.cc;

    for (let x = 0; x < info.mh.length; x++)
    {
      if (!(info.mh[x] in GT.gridToDXCC)) { GT.gridToDXCC[info.mh[x]] = Array(); }
      GT.gridToDXCC[info.mh[x]].push(info.dxcc);
    }
  }

  let dxccBigCTY;
  try {
    dxccBigCTY = window.require(GT.dxccInfoPath);
  }
  catch (e)
  {
    console.error("Failed to load Ginternal dxcc-info, falling back to asar");
    // Fallback to asar
    dxccBigCTY = window.require(GT.asarDxccInfoPath);
  }

  if ("version" in dxccBigCTY[1])
  {
    GT.dxccVersion = parseInt(dxccBigCTY[1].version);

    updateLookupsBigCtyUI();

    nodeTimers.setTimeout(downloadCtyDat, 120000);    // In 2 minutes, when the dust settles

  }
  else
  {
    GT.dxccVersion = 19700101;
    nodeTimers.setTimeout(downloadCtyDat, 5000);    // In 5 seconds
  }

  updateFromBigCty(dxccBigCTY);

  let dxccGeo = requireJson("data/dxcc.json");
  for (let key in dxccGeo.features)
  {
    let dxcc = dxccGeo.features[key].properties.dxcc_entity_code;
    GT.dxccInfo[dxcc].geo = dxccGeo.features[key];
  }

  let countyData = requireJson("data/counties.json");

  for (let id in countyData)
  {
    let cnty = countyData[id].properties.st + "," + countyData[id].properties.n.replaceAll(" ", "").toUpperCase();

    if (!(cnty in GT.cntyToCounty)) { GT.cntyToCounty[cnty] = toProperCase(countyData[id].properties.n); }

    GT.countyData[cnty] = createWorkingObject(cnty);
    GT.countyData[cnty].geo = countyData[id];

    GT.fipsToCounty[id] = cnty;

    for (let x in countyData[id].properties.z)
    {
      let zipS = String(countyData[id].properties.z[x]);
      if (!(zipS in GT.zipToCounty))
      {
        GT.zipToCounty[zipS] = Array();
      }
      GT.zipToCounty[zipS].push(cnty);
    }
  }

  GT.shapeData = requireJson("data/shapes.json");
  GT.StateData = requireJson("data/state.json");

  for (let key in GT.StateData)
  {
    for (let x = 0; x < GT.StateData[key].mh.length; x++)
    {
      if (!(GT.StateData[key].mh[x] in GT.gridToState)) { GT.gridToState[GT.StateData[key].mh[x]] = Array(); }
      GT.gridToState[GT.StateData[key].mh[x]].push(GT.StateData[key].postal);
    }
  }

  GT.phonetics = requireJson("data/phone.json");
  GT.enums = requireJson("data/enums.json");

  for (let key in GT.dxccInfo)
  {
    if (GT.dxccInfo[key].pp != "" && GT.dxccInfo[key].geo != "deleted")
    {
      GT.enums[GT.dxccInfo[key].dxcc] = GT.dxccInfo[key].name;
    }
    if (key == 291)
    {
      // US Mainland
      for (let mh in GT.dxccInfo[key].mh)
      {
        let sqr = GT.dxccInfo[key].mh[mh];
        GT.us48Data[sqr] = createWorkingObject(sqr);
      }
    }
  }

  GT.cqZones = requireJson("data/cqzone.json");
  GT.ituZones = requireJson("data/ituzone.json");

  for (let key in GT.StateData)
  {
    if (key.substr(0, 3) == "US-")
    {
      let shapeKey = key.substr(3, 2);
      let name = key;

      if (shapeKey in GT.shapeData)
      {
        GT.wasZones[name] = createWorkingObject(GT.StateData[key].name);
        GT.wasZones[name].geo = GT.shapeData[shapeKey];
      }
    }
    else if (key.substr(0, 3) == "CA-")
    {
      let shapeKey = key.substr(3, 2);
      let name = key;

      if (shapeKey in GT.shapeData)
      {
        GT.wacpZones[name] = createWorkingObject(GT.StateData[key].name)
        GT.wacpZones[name].geo = GT.shapeData[shapeKey];
      }
    }
  }

  for (let key in GT.shapeData)
  {
    if (GT.shapeData[key].properties.type == "Continent")
    {
      let name = GT.shapeData[key].properties.name;
      GT.wacZones[name] = createWorkingObject(name);
      GT.wacZones[name].geo = GT.shapeData[key];
    }
  }



  let langDxcc = requireJson("i18n/" + GT.settings.app.locale + "-dxcc.json");
  if (langDxcc)
  {
    for (const dxcc in langDxcc)
    {
      if (dxcc in GT.dxccInfo)
      {
        GT.dxccInfo[dxcc].name = langDxcc[dxcc];
        GT.dxccToAltName[dxcc] = langDxcc[dxcc];
      }
    }
  }

  let langState = requireJson("i18n/" + GT.settings.app.locale + "-state.json");
  if (langState)
  {
    for (const state in langState)
    {
      if (state in GT.StateData)
      {
        GT.StateData[state].name = langState[state];
      }
    }
  }

  GT.acknowledgedCalls = requireJson("data/acknowledgements.json");
  
  // Pass running data set to workers as needed.
  initAdifWorker();
}
