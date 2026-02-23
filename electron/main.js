const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const os = require('os');
const net = require('net');

let mainWindow;
let tray;
let _localServerInstance = null;
let _localServerPort = null;
let _updateInterval = null;
let _updaterStatus = { status: 'idle', message: '' };

const isDev = !app.isPackaged;
const isPortable = Boolean(process.env.PORTABLE_EXECUTABLE_FILE);

// Find an available TCP port starting from the given port
function findAvailablePort(startPort = 3002) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(startPort, '0.0.0.0', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      if (startPort < 3100) {
        resolve(findAvailablePort(startPort + 1));
      } else {
        reject(new Error('No available ports found'));
      }
    });
  });
}

// Get the machine's outward-facing LAN IP (not loopback)
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return '127.0.0.1';
}

function getServerPath() {
  if (isDev) {
    return path.join(__dirname, '../server/index.js');
  }
  return path.join(process.resourcesPath, 'app', 'server', 'index.js');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    transparent: false,
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.on('maximize', () => {
    mainWindow.webContents.send('maximize-change', true);
  });
  mainWindow.webContents.on('unmaximize', () => {
    mainWindow.webContents.send('maximize-change', false);
  });
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show NoVoice',
      click: () => { mainWindow.show(); mainWindow.focus(); },
    },
    {
      label: 'Check for Updates',
      click: () => {
        checkForAppUpdates(true);
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => { app.isQuitting = true; app.quit(); },
    },
  ]);

  tray.setToolTip('NoVoice');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => { mainWindow.show(); mainWindow.focus(); });
}

function emitUpdaterStatus(payload) {
  _updaterStatus = payload;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', payload);
  }
}

function configureAutoUpdater() {
  if (isDev || isPortable) return;

  // You can override these with env vars when building/running packaged app.
  const owner = process.env.NOVOICE_UPDATER_OWNER || 'imikwy';
  const repo = process.env.NOVOICE_UPDATER_REPO || 'NoVoice-Application';

  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner,
      repo,
      private: false,
    });
  } catch (err) {
    console.error('Failed to configure updater feed:', err);
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    emitUpdaterStatus({ status: 'checking', message: 'Checking for updates...' });
  });

  autoUpdater.on('update-available', (info) => {
    emitUpdaterStatus({
      status: 'downloading',
      message: `Update available: v${info?.version || 'new'}`,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    emitUpdaterStatus({
      status: 'downloading',
      message: `Downloading update: ${Math.round(progress.percent || 0)}%`,
      percent: progress.percent || 0,
    });
  });

  autoUpdater.on('update-not-available', () => {
    emitUpdaterStatus({ status: 'up-to-date', message: 'App is up to date.' });
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto updater error:', err);
    emitUpdaterStatus({
      status: 'error',
      message: err?.message || 'Update failed',
    });
  });

  autoUpdater.on('update-downloaded', async (info) => {
    emitUpdaterStatus({
      status: 'downloaded',
      message: `Update ready: v${info?.version || 'new'}`,
    });

    if (!mainWindow || mainWindow.isDestroyed()) return;

    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info?.version || 'new'} was downloaded.`,
      detail: 'Restart now to install the update.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      app.isQuitting = true;
      autoUpdater.quitAndInstall();
    }
  });
}

function checkForAppUpdates(manual = false) {
  if (isDev) {
    if (manual) emitUpdaterStatus({ status: 'disabled', message: 'Auto updates are disabled in development.' });
    return;
  }

  if (isPortable) {
    if (manual) emitUpdaterStatus({ status: 'disabled', message: 'Portable build does not support auto updates.' });
    return;
  }

  autoUpdater.checkForUpdates().catch((err) => {
    console.error('checkForUpdates failed:', err);
    emitUpdaterStatus({ status: 'error', message: err?.message || 'Failed to check for updates.' });
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  configureAutoUpdater();
  checkForAppUpdates(false);
  _updateInterval = setInterval(() => checkForAppUpdates(false), 1000 * 60 * 60 * 6);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else mainWindow.show();
});

app.on('will-quit', async () => {
  if (_updateInterval) clearInterval(_updateInterval);
  if (_localServerInstance) {
    try {
      const { stopServer } = require(getServerPath());
      await stopServer();
    } catch (_) {}
  }
});

app.on('before-quit-for-update', () => {
  app.isQuitting = true;
});

// ── Window controls ──────────────────────────────────────────────────────────

ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.hide());
ipcMain.handle('window-is-maximized', () => mainWindow.isMaximized());

// ── Local server (Self-Host) ─────────────────────────────────────────────────

ipcMain.handle('local-server:start', async () => {
  if (_localServerInstance) {
    const ip = getLocalIP();
    return { success: true, port: _localServerPort, ip, url: `http://${ip}:${_localServerPort}` };
  }

  try {
    const port = await findAvailablePort(3002);
    const { startServer } = require(getServerPath());
    _localServerInstance = await startServer(port);
    _localServerPort = port;
    const ip = getLocalIP();
    return { success: true, port, ip, url: `http://${ip}:${port}` };
  } catch (err) {
    console.error('Failed to start local server:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-server:stop', async () => {
  if (!_localServerInstance) return { success: true };
  try {
    const { stopServer } = require(getServerPath());
    await stopServer();
    _localServerInstance = null;
    _localServerPort = null;
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-server:info', () => {
  if (!_localServerInstance) return null;
  const ip = getLocalIP();
  return { port: _localServerPort, ip, url: `http://${ip}:${_localServerPort}` };
});

// Update control/status for renderer (optional UI integration)
ipcMain.handle('updater:check', () => {
  checkForAppUpdates(true);
  return { success: true };
});

ipcMain.handle('updater:status', () => _updaterStatus);

ipcMain.handle('updater:restart-and-install', () => {
  if (isDev || isPortable) return { success: false };
  app.isQuitting = true;
  autoUpdater.quitAndInstall();
  return { success: true };
});
