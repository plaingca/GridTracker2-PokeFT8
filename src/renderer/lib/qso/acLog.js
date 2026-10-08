GT.acLogAPISocket = null;
GT.acLogInstanceId = "AC-Log";
GT.acLogStatus = {
  Id: GT.acLogInstanceId,
  event: "Status",
  Frequency: 0,
  Band: "OOB",
  MO: "???",
  TxEnabled: 0,
  Transmitting: 0,
  Decoding: 0,
  DEcall: "",
  DEgrid: "",
  DXcall: "",
  DXgrid: "",
  Report: "-",
  instance: GT.acLogInstanceId
};

function connectToAcLogAPI()
{
  if (GT.acLogAPISocket && GT.settings.acLog.connect == false) closeAcLogAPI();
  if (GT.acLogAPISocket || GT.settings.acLog.connect == false) return;
  if (!(GT.settings.acLog.port > 0 && GT.settings.acLog.ip.length > 4)) return;

  const net = window.require("net");
  let workingBuffer = null;

  GT.acLogAPISocket = new net.Socket();
  GT.acLogAPISocket.on("error", function () {
    closeAcLogAPI();
  });

  GT.acLogAPISocket.connect(GT.settings.acLog.port, GT.settings.acLog.ip, function ()
  {
    if (!(GT.acLogInstanceId in GT.instances))
    {
      addNewInstance(GT.acLogInstanceId);
      GT.instances[GT.acLogInstanceId].crEnable = false;
      GT.instances[GT.acLogInstanceId].canRoster = false;
      GT.instances[GT.acLogInstanceId].valid = false;
      GT.instances[GT.acLogInstanceId].oldStatus = null;
      GT.instances[GT.acLogInstanceId].status = GT.acLogStatus;
    }

    GT.acLogAPISocket.write(Buffer.from("<CMD><OPINFO></CMD>\r\n<CMD><READBMF></CMD>\r\n"));
  });

  GT.acLogAPISocket.on("data", function (data)  {
    if (!workingBuffer) workingBuffer = Buffer.from(data).toString();
    else workingBuffer += Buffer.from(data).toString();
    let end = workingBuffer.indexOf("\r\n");
    while (end > -1)
    {
      handleAcLogAPIMessage(workingBuffer.substring(0, end));
      workingBuffer = workingBuffer.substring(end+2);
      end = workingBuffer.indexOf("\r\n");
    }
  });

  GT.acLogAPISocket.on("end", function () 
  {
    closeAcLogAPI();
  });
}

function closeAcLogAPI()
{
  if (GT.acLogInstanceId in GT.instances) 
  {
    GT.instances[GT.acLogInstanceId].open = false;
    handleClosed(GT.acLogStatus);
  }
  GT.acLogAPISocket.destroy();
  GT.acLogAPISocket = null;
}

function handleAcLogAPIMessage(buffer)
{
  if (buffer.length > 0)
  {
    let object = parseAcLogXML(buffer.substring(0, buffer.indexOf("</CMD>")));
    if (object.type)
    {
      let updateStatus = false;
      if (object.type == "OPINFORESPONSE")
      {
        GT.acLogStatus.DEcall = object.CALL.toUpperCase();
        GT.acLogStatus.DEgrid = object.GRID.toUpperCase();
      }
      else if (object.type == "READBMFRESPONSE" && Number(object.FREQ) > 0 && object.MODE.length > 0)
      {
        GT.acLogStatus.MO = object.MODE;
        GT.acLogStatus.Band = formatBand(Number(object.FREQ));
        GT.acLogStatus.Frequency = parseInt(Number(object.FREQ * 1000000));
        updateStatus = true;
      }
      else if (object.type == "CALLTABEVENT")
      {
        GT.acLogStatus.DXcall = object.CALL.toUpperCase();
        if (object.GRID)
        {
           GT.acLogStatus.DXgrid = object.GRID.substring(0, 4).toUpperCase();
        }
        else if (object.LAT && object.LON)
        {
          GT.acLogStatus.DXgrid = latLonToGridSquare(Number(object.LAT), Number(object.LON));
        }
        updateStatus = true;
      }
      else if (object.type == "ENTEREVENT")
      {
        // Grab the last log entry in a 1/4 second
        nodeTimers.setTimeout(grabAcLog, 250, 1);
      }

      var notify = false;
      if (GT.instances[GT.acLogInstanceId].open == false) notify = true;
      GT.instances[GT.acLogInstanceId].open = true;
      GT.instances[GT.acLogInstanceId].valid = true;
      if (notify) updateRosterInstances();
      if (updateStatus) handleInstanceStatus(GT.acLogStatus);
    }
  }
}