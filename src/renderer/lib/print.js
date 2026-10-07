// GridTracker Copyright © 2026 GridTracker.org
// All rights reserved.
// See LICENSE for more information.

// Printing: print table generation and print window (moved from GridTracker2.js)

const naturalCollator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base'
});

function generatePrintTable()
{
  let rows = [];
  let keys = Object.keys(GT.hotKeys).sort((a, b) => naturalCollator.compare(a, b));
  for (const index in keys)
  {
    let key = keys[index];
    let row = {};
    let keyName = key.replace("Key", "");
    let prefix = "";
    if (GT.hotKeys[key].extKey != null)
    {
      prefix = GT.hotKeys[key].extKey.replace("Key", "") + " + ";
    }
    row.key = prefix + keyName;
    row.desc = GT.hotKeys[key].name;
    rows.push(row);

    if (GT.hotKeys[key].descPrefix != null)
    {
      row = {};
      prefix = (GT.hotKeys[key].descPrefix) ? GT.hotKeys[key].param2.replace("Key", "") + " + " : "";
      row.key = prefix + keyName;
      row.desc = GT.hotKeys[key].descPrefix + " " + GT.hotKeys[key].name;
      rows.push(row);
    }
  }

  let halfOfRows = parseInt(rows.length / 2); 
  let htmlWorker = "<tr><th colspan='4'>Hot Key List (" + gtShortVersion + ")</th></tr>";
  htmlWorker += "<tr><th>Key</th><th>Action</th><th>Key</th><th>Action</th></tr>";
  GT.printableHotkeyList = "<table class='darkTable'><tr><th colspan='4'><h1>GridTracker2</h1><h3>Hot Key List (<i>" + gtShortVersion + "</i>)</h3></th></tr>";
  GT.printableHotkeyList += "<tr><th>Key</th><th>Action</th><th>Key</th><th>Action</th></tr>";
  for (let x = 0; x <= halfOfRows; x++)
  {
    let secondX = x + halfOfRows + 1;
    let row;
    if (secondX < rows.length)
    {
      row = "<tr><td>" + rows[x].key + "</td><td align='left'>" +  rows[x].desc + "</td><td>" + rows[secondX].key +"</td><td align='left'>" + rows[secondX].desc + "</td></tr>";
    }
    else
    {
      row = "<tr><td>" + rows[x].key + "</td><td align='left'>" +  rows[x].desc + "</td></tr>";
    }
    htmlWorker += row;
    GT.printableHotkeyList += row;
  }
  GT.printableHotkeyList += "</table>";
  printableHotKeyTable.innerHTML = htmlWorker;
}

function openPrint()
{
  let printWindow = window.open('', 'printHotKeys', 'height=500, width=500');
  printWindow.document.open();
  printWindow.document.write(`
      <html>
        <head>
            <title>Print HotKeys</title>
            <style>
                body { font-family: sans-serif; }
                table.darkTable {
                  border-collapse: collapse;
                  border: 1px solid #888;
                  text-align: center;
                }
                table.darkTable td,
                table.darkTable th { border: 1px solid #888; padding: 2px 4px; }
                table.darkTable thead { border-bottom: 2px solid #888; }
                table.darkTable thead th {
                  font-weight: bold;
                  text-align: center;
                  border-left: 2px solid #888;
                }
                table.darkTable thead th:first-child { border-left: none; }
            </style>
        </head>
        <body onLoad="print();close()">
            ${GT.printableHotkeyList}
        </body>
      </html>
  `);
  printWindow.document.close();
}
