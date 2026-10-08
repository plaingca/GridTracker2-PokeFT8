var GT = {};

importScripts("../ui/formatters.js");
importScripts("../gtCommon.js");

GT.workerFunctions =
{
  process: processQSOs
};

onmessage = (event) =>
{
  if ("type" in event.data)
  {
    if (event.data.type in GT.workerFunctions)
    {
      GT.workerFunctions[event.data.type](event.data);
    }
    else console.log("trackerWorker: unknown event type : " + event.data.type);
  }
  else console.log("trackerWorker: no event type");
};

function processQSOs(task)
{
  initQSOdata();
  var currentYear = new Date().getUTCFullYear();
  var currentDay = parseInt((parseInt(Date.now() / 1000) / 86400));
  var currentSecond = timeNowSec();
  for (const hash in task.QSOhash)
  {
    trackQSO(task.QSOhash[hash], currentYear, currentDay, currentSecond);
  }
  var task = {};
  task.type = "processed";
  task.tracker = GT.tracker;
  postMessage(task);
}
