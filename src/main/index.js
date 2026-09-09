const {
  app,
  dialog,
  Notification,
  shell,
  BrowserWindow,
  ipcMain,
  Menu,
  screen,
  clipboard,
  nativeTheme,
} = require('electron');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("enable-speech-dispatcher");

const fs = require('fs');
const timers = require('timers');
const remoteMain = require('@electron/remote/main');
const { autoUpdater } = require('electron-updater');
const { electronApp, optimizer } = require('@electron-toolkit/utils');
const path = require('path');
const { join } = require('path');
const log = require('electron-log');
const isMac = process.platform === 'darwin';
const disableAutoUpdate = app.commandLine.hasSwitch("disable-auto-updates");

let gtName = "";

if (app.commandLine.hasSwitch("gt-name")) {
  let appInstance = app.getPath('userData');
  gtName = slugify(app.commandLine.getSwitchValue("gt-name"));
  if (gtName.length > 0 ) {
    app.setPath('userData', appInstance + " - " + gtName);
  }
  console.log("Running from: " + app.getPath('userData') + "\r\n");
}

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
}

if (app.isPackaged) {
  if (process.platform.toLowerCase().indexOf("win") == 0 && !("ELECTRON_NO_ATTACH_CONSOLE" in process.env)) {
    console.log("To launch GridTracker2 from command line add the following before launching:");
    console.log("\r\nset ELECTRON_NO_ATTACH_CONSOLE=true\r\n");
  }
  console.log("GridTracker2 starting up!\r\n");
  // we send to the log file instead
  console.log = log.error;
  console.error = log.error;
}

// Needed for direct accsess to Menu and MenuItem
remoteMain.initialize();

const template = [
  ...(isMac
    ? [
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide', label: 'Hide GridTracker2' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { click: function () { allowedWindows.GridTracker2.window.close(); }, label: 'Quit GridTracker2' },
          ],
        },
      ]
    : []),
  {
    label: 'File',
    submenu: [ { role: 'close' } ],
  },
  // include developer menu items if the app is not packaged
  ...(!app.isPackaged
    ? [
        {
          label: 'View',
          submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }],
        },
      ]
    : []),
  {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      ...(isMac
        ? [{ type: 'separator' }, { role: 'front' }, { type: 'separator' }, { role: 'window' }]
        : [{ role: 'close' }]),
    ],
  },
  // Add about menu on Windows
  ...(!isMac
    ? [
        {
          label: 'Help',
          submenu: [
            { role: 'about' },
          ],
        },
      ]
    : []),
];

const menu = Menu.buildFromTemplate(template);

if (isMac || !app.isPackaged) {
  Menu.setApplicationMenu(menu);
}
else {
  Menu.setApplicationMenu(null);
}

// Every window accounted for here
const allowedWindows = {
  GridTracker2: {
    window: null,
    honorVisibility: true,
    options: { x: 40, y: 40, width: 860, height: 652, show: true, zoom: 0 },
    static: {
      minWidth: 217,
      minHeight: 398,
      icon: join(__dirname, '../renderer/img/gt-icon.png'),
    },
  },
  gt_popup: {
    window: null,
    honorVisibility: false,
    options: { x: 45, y: 45, width: 200, height: 200, show: false, zoom: 0 },
    static: { minWidth: 100, minHeight: 50 },
  },
  gt_stats: {
    window: null,
    honorVisibility: true,
    options: { x: 55, y: 55, width: 640, height: 480, show: false, zoom: 0 },
    static: {
      minWidth: 620,
      minHeight: 200,
      icon: join(__dirname, '../renderer/img/stats-button.png'),
    },
  },
  gt_lookup: {
    window: null,
    honorVisibility: true,
    options: { x: 75, y: 75, width: 680, height: 200, show: false, zoom: 0 },
    static: {
      minWidth: 680,
      minHeight: 200,
      icon: join(__dirname, '../renderer/img/lookup-icon.png'),
    },
  },
  gt_bandactivity: {
    window: null,
    honorVisibility: true,
    options: { x: 250, y: 250, width: 198, height: 52, show: false, zoom: 0 },
    static: { minWidth: 198, minHeight: 52, frame: false, alwaysOnTop: true, skipTaskbar: true },
  },
  gt_alert: {
    window: null,
    honorVisibility: false,
    options: { x: 50, y: 50, width: 600, height: 52, show: false, zoom: 0 },
    static: { resizable: false, alwaysOnTop: true },
  },
  gt_conditions: {
    window: null,
    honorVisibility: true,
    options: { x: 75, y: 75, width: 492, height: 308, show: false, zoom: 0 },
    static: {
      minWidth: 492,
      minHeight: 308,
      icon: join(__dirname, '../renderer/img/conditions.png'),
    },
  },
  gt_roster: {
    window: null,
    honorVisibility: true,
    options: { x: 55, y: 55, width: 760, height: 400, show: false, zoom: 0 },
    static: {
      minWidth: 150,
      minHeight: 250,
      icon: join(__dirname, '../renderer/img/roster-icon.png'),
    },
  },
};

const asarResourcesPath = join(__dirname, '../../resources');

const gtInternalPath = join(app.getPath('userData'), 'Ginternal');

if (!fs.existsSync(gtInternalPath)) {
  fs.mkdirSync(gtInternalPath);
}

const gtScreenshotPath = join(app.getPath('userData'), 'Screenshots');

if (!fs.existsSync(gtScreenshotPath)) {
  fs.mkdirSync(gtScreenshotPath);
}

// We will allow updating of this by the user, copy existing into Ginternal
let dxccInfoPath = join(gtInternalPath, 'dxcc-info.json');
let asarInfoPath = join(asarResourcesPath, 'data/dxcc-info.json');
if (!fs.existsSync(dxccInfoPath)) {
  fs.copyFileSync(
    asarInfoPath,
    dxccInfoPath,
    fs.constants.COPYFILE_EXCL,
  );
}
else {
  try {
    // Update gtInternal with newer version when found
    const asarInfo = require(asarInfoPath);
    const gtInternalInfo = require(dxccInfoPath);
    if ("version" in asarInfo["1"] && "version" in gtInternalInfo["1"] && parseInt(asarInfo["1"].version) > parseInt(gtInternalInfo["1"].version)) {
      fs.copyFileSync(
        asarInfoPath,
        dxccInfoPath,
      );
    }
  }
  catch (e)
  {
    console.log("Error checking dxcc-info files");
  }
}

const windowIdToAllowedWindows = {};
const windowSettingsPath = join(gtInternalPath, 'windows.json');

if (fs.existsSync(windowSettingsPath)) {
  try {
    const settings = require(windowSettingsPath);
    for (let windowName in settings) {
      if (windowName in allowedWindows) {
        allowedWindows[windowName].options = {
          ...allowedWindows[windowName].options,
          ...settings[windowName],
        };
      }
    }
  }
  catch (e)
  {
    log.error(e);
  }
}

let mainWindowClosing = false;

let mapKeys = {};

try {
  const mapKeysPath = path.join(__dirname, 'map_keys.json');
  if (fs.existsSync(mapKeysPath)) {
    mapKeys = JSON.parse(fs.readFileSync(mapKeysPath, 'utf8'));
  }
} catch (error) {
  console.error('Failed to load map keys', error);
}

ipcMain.on('getResourcesPath', (event) => {
  event.returnValue = asarResourcesPath;
});

ipcMain.on('getPath', (event, what) => {
  event.returnValue = app.getPath(what);
});

ipcMain.on('getAppName', (event) => {
  event.returnValue = gtName;
});

ipcMain.on('appVersion', (event) => {
  event.returnValue = app.getVersion();
});

ipcMain.on('mapKeys', (event) => {
  event.returnValue = mapKeys;
});

ipcMain.on('updateAvailable', (event) => {
    checkForUpdates();
});

ipcMain.on('downloadUpdate', (event) => {
    downloadUpdate();
});


ipcMain.on('showWin', (event, what) => {
  if (allowedWindows[what]?.window) {
    allowedWindows[what].window.show();
    allowedWindows[what].options.show = true;
  }
});

ipcMain.on('hideWin', (event, what) => {
  if (allowedWindows[what]?.window) {
    allowedWindows[what].window.hide();
    allowedWindows[what].options.show = false;
  }
});

ipcMain.on('toggleWin', (event, what) => {
  if (allowedWindows[what]?.window) {
    if (allowedWindows[what].window.isVisible()) {
      allowedWindows[what].window.hide();
      allowedWindows[what].options.show = false;
    } else {
      allowedWindows[what].window.show();
      allowedWindows[what].options.show = true;
    }
  }
});

ipcMain.on('focusWin', (event, what) => {
  if (allowedWindows[what]?.window) {
    allowedWindows[what].window.focus();
  }
});

async function screenshot(window) {
  await window.capturePage().then((image) => {
    clipboard.writeImage(image);
    let filename = path.join(gtScreenshotPath, "GT2 " + currentTimeStampString() + ".png");
    fs.writeFileSync(filename, image.toPNG());
  });
}

ipcMain.on('capturePageToClipboard', (event, what) => {
  if (allowedWindows[what]?.window) {
    screenshot(allowedWindows[what].window);
  }
});

ipcMain.on('setAlwaysOnTop', (event, what, value) => {
  if (allowedWindows[what]?.window) {
    allowedWindows[what].window.setAlwaysOnTop(value);
  }
});

ipcMain.on('openFileFolder', (event, what, value) => {
  if (allowedWindows[what]?.window) {
    shell.openPath(value);
  }
});

ipcMain.on('saveZoom', (event, zoom) => {
  if (event.sender.id in windowIdToAllowedWindows) {
    allowedWindows[windowIdToAllowedWindows[event.sender.id]].options.zoom = zoom;
  }
});

ipcMain.on('setTheme', (event, theme) => {
  nativeTheme.themeSource = theme;
});

ipcMain.on('spawnScript', (event, scriptPath) => {
  try {
    const cp = require("child_process");
    let dirPath = path.dirname(scriptPath);
    let child = cp.spawn(`"${scriptPath}"`, [], {
      detached: true,
      cwd: dirPath,
      shell: true,
      stdio: ["ignore", "ignore", "ignore"]
    });
    child.unref();
  }
  catch (e) {
  }
});

let isShuttingDown = false; 

ipcMain.on('installAndRestart', (event, what) => {
    if (isShuttingDown) {
        event.returnValue = true;
        return; // Ignore duplicate clicks
    }
    isShuttingDown = true;

    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.autoRunAppAfterInstall = true;
    
    saveWindowPositions(); 
    
    event.returnValue = true;
    
    timers.setTimeout(() => {
        autoUpdater.quitAndInstall(true, true);
    }, 100);
});

ipcMain.on('restartGridTracker2', (event, resetWindowPositions = false) => {
    if (isShuttingDown) {
        event.returnValue = true;
        return;
    }
    isShuttingDown = true;

    if (resetWindowPositions === true) {
        if (fs.existsSync(windowSettingsPath)) {
            fs.unlinkSync(windowSettingsPath);
        }
    } else {
        saveWindowPositions();
    }
  
    event.returnValue = true; 
  
    timers.setTimeout(() => {
        app.relaunch();
        app.exit();
    }, 100);
});

ipcMain.on('log', (event, value) => {
  log.error(value);
});

let mainWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    //...allowedWindows['GridTracker2'].options,
    ...allowedWindows['GridTracker2'].static,
    tabbingIdentifier: 'GridTracker2',
    title: 'GridTracker2',
    show: false,
    backgroundColor: 'black',
    autoHideMenuBar: true,
    enableLargerThanScreen: true,
    acceptFirstMouse: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      backgroundThrottling: false,
      contextIsolation: false,
      nodeIntegration: true,
      nodeIntegrationInWorker: true,
      sandbox: false,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (details.frameName == 'printHotKeys') {
      let options = {
        show: false,
        // for macOS
        tabbingIdentifier: details.frameName,
        // for Windows
        title: details.frameName,
        webPreferences: {
          autoHideMenuBar: true,
          devTools: !app.isPackaged,
        },
      };
      return { action: 'allow', overrideBrowserWindowOptions: options };
    } else if (details.frameName in allowedWindows) {
      let options = {
        //...allowedWindows[details.frameName].options,
        ...allowedWindows[details.frameName].static,
        autoHideMenuBar: true,
        backgroundColor: 'black',
        enableLargerThanScreen: true,
        acceptFirstMouse: true,
        show: false,
        // for macOS
        tabbingIdentifier: details.frameName,
        // for Windows
        title: details.frameName,
        webPreferences: {
          backgroundThrottling: false,
          contextIsolation: false,
          nodeIntegration: true,
          nodeIntegrationInWorker: true,
          preload: join(__dirname, '../preload/index.js'),
          sandbox: false,
          devTools: !app.isPackaged,
        },
      };

      return { action: 'allow', overrideBrowserWindowOptions: options };
    } else {
      shell.openExternal(details.url);
      return { action: 'deny' };
    }
  });

  mainWindow.loadFile(join(__dirname, '../renderer/GridTracker2.html'));
}

let autoUpdateInitialized = false;
let autoUpdateTimer = null;

function checkForUpdates() {
  if (!autoUpdateInitialized) {
      if (process.env.DEBUG_AUTO_UPDATING === 'true') {
      const log = require('electron-log');

      log.transports.file.level = 'debug';

      autoUpdater.logger = log;
      autoUpdater.forceDevUpdateConfig = true;
    }

    if (disableAutoUpdate == true)
    {
      autoUpdater.autoDownload = false;
    }

    autoUpdater.on('update-available', notifyOnUpdate);
    autoUpdater.on('update-downloaded', updateDownloaded);

    autoUpdateInitialized = true;
  }

  try {
    if (disableAutoUpdate == true) {
      autoUpdater.checkForUpdates();
    }
    else {
      autoUpdater.checkForUpdatesAndNotify();
    }
  }
  catch (e) {
    log.error("Failed to update check");
    log.error(e.message);
  }

  if (autoUpdateTimer) timers.clearTimeout(autoUpdateTimer);
  autoUpdateTimer = timers.setTimeout(checkForUpdates, 86400000);
}

function downloadUpdate() {
  autoUpdater.autoDownload = true;
  autoUpdater.checkForUpdatesAndNotify();
}

function notifyOnUpdate(info) {
  if (mainWindow) {
    info.autoDownload = autoUpdater.autoDownload;
    mainWindow.webContents.send("versionInfo", info);
  }
}

function updateDownloaded(info) {
  if (mainWindow) {
    mainWindow.webContents.send("updateDownloaded", info);
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('org.gridtracker.GridTracker2');
  app.setAppUserModelId('org.gridtracker.GridTracker2');

  dialog.showErrorBox = (title, content) => {
    log.error(`${title}\n${content}`);
  };


  app.on('browser-window-created', (_, window) => {
    // window.title works on Windows, window.tabbingIdentifier works on macOS
    const title = isMac ? window.tabbingIdentifier : window.title;

    if (title in allowedWindows) {
      // save the window handle (not the dom handle);
      allowedWindows[title].window = window;
      windowIdToAllowedWindows[window.id] = title;

      // set up events here...
      window.on('ready-to-show', () => {
        // Options are being applied as bounds to the window, but if there is a scaleFactor
        // this call corrects the sizing
        let options = allowedWindows[windowIdToAllowedWindows[window.id]].options;
        allowedWindows[windowIdToAllowedWindows[window.id]].window.setContentBounds(
          options
        );

        // is the top left corner on screen?
        if (!(isWithinDisplayBounds(options.x + parseInt(options.width / 2), options.y + parseInt(options.height / 2)))) {
          options.x = 40;
          options.y = 40;
          allowedWindows[windowIdToAllowedWindows[window.id]].window.setContentBounds(
            options
          );
        }

        if (
          allowedWindows[windowIdToAllowedWindows[window.id]].honorVisibility == true &&
          options.show == true
        ) {
          window.show();
        }

        // Send this event to first.js, this windows zoom level
        allowedWindows[windowIdToAllowedWindows[window.id]].window.webContents.send(
          'loadZoom',
          options.zoom,
        );

      });

      window.on('move', (event) => {
        let bounds = window.getContentBounds();
        let saveBounds = !(window.isMinimized() || window.isFullScreen() || (isMac && window.isMaximized()));
        if (saveBounds) {
          allowedWindows[windowIdToAllowedWindows[window.id]].options = {
            ...allowedWindows[windowIdToAllowedWindows[window.id]].options,
            ...bounds,
          };
        }
      });

      window.on('moved', (event) => {
        let bounds = window.getContentBounds();
        let saveBounds = !(window.isMinimized() || window.isFullScreen() || (isMac && window.isMaximized()));
        if (saveBounds) {
          allowedWindows[windowIdToAllowedWindows[window.id]].options = {
            ...allowedWindows[windowIdToAllowedWindows[window.id]].options,
            ...bounds,
          };
        }
      });

      window.on('resize', (event) => {
        let bounds = window.getContentBounds();
        let saveBounds = !(window.isMinimized() || window.isFullScreen() || (isMac && window.isMaximized()));
        if (saveBounds) {
          allowedWindows[windowIdToAllowedWindows[window.id]].options = {
            ...allowedWindows[windowIdToAllowedWindows[window.id]].options,
            ...bounds,
          };
        }
      });

      window.on('resized', (event) => {
        let bounds = window.getContentBounds();
        let saveBounds = !(window.isMinimized() || window.isFullScreen() || (isMac && window.isMaximized()));
        if (saveBounds) {
          allowedWindows[windowIdToAllowedWindows[window.id]].options = {
            ...allowedWindows[windowIdToAllowedWindows[window.id]].options,
            ...bounds,
          };
        }
      });

      window.on('close', (event) => {
        if (window.id != 1) {
          // save vis, but don't close
          event.preventDefault();        
          window.hide();
          timers.setTimeout(onChildWindowCloseTimeout, 200, windowIdToAllowedWindows[window.id]);
        } else {
          mainWindowClosing = true;
          // Main window is 1, so really destroy all the others
          for (const windowId in windowIdToAllowedWindows) {
            if (windowId != 1 &&
                allowedWindows[windowIdToAllowedWindows[windowId]].window &&
                !allowedWindows[windowIdToAllowedWindows[windowId]].window.isDestroyed() ) {
              allowedWindows[windowIdToAllowedWindows[windowId]].window.destroy();
            }
          }
        }
      });

      remoteMain.enable(window.webContents);

      window.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url);
        return { action: 'deny' };
      });
    } else if (window.id !== 1) {
      // we need to fix this for Mac, it's the band activity window which doesn't have a tabbing title
      // console.log(`WARNING: id: "${window.id}"  title: "${title}" not found in allowedWindows`);
    }

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    optimizer.watchWindowShortcuts(window);
  });

  createMainWindow();

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  saveWindowPositions();
  app.quit();
});

function onChildWindowCloseTimeout(windowName) {
  if (mainWindowClosing == false) {
    allowedWindows[windowName].options.show = false;
  }
}

function saveWindowPositions() {
  const finalSettings = {};
  for (let window in allowedWindows) {
    finalSettings[window] = allowedWindows[window].options;
  }
  fs.writeFileSync(windowSettingsPath, JSON.stringify(finalSettings, null, 2), { flush: true });
}

function isWithinDisplayBounds( x, y ) {
  const displays = screen.getAllDisplays();
  return displays.reduce((result, display) => {
    const area = display.workArea
    return (
      result ||
      (x >= area.x &&
       y >= area.y &&
       x < area.x + area.width &&
       y < area.y + area.height)
    );
  }, false);
}

function currentTimeStampString() {
  let now = new Date();
  return (
    now.getFullYear() +
    "-" +
    (now.getMonth() + 1) +
    "-" +
    now.getDate() +
    " " +
    padNumber(now.getHours()) +
    "." +
    padNumber(now.getMinutes()) +
    "." +
    padNumber(now.getSeconds())
  );
}

function padNumber(number, size) {
  let s = String(number);
  while (s.length < (size || 2)) {
    s = "0" + s;
  }
  return s;
};

function slugify(string) {
  return string
    .trim()
    .replace(/ +/g, '-')
    .replace(/[^A-Za-z0-9\-_]/g, '');
}

process.on('uncaughtException', function (error) {
  log.error(error);
});
