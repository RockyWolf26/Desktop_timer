const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;

function getAssetsPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, 'assets');
}

function createTrayIcon() {
  const iconPath = path.join(getAssetsPath(), 'tray-icon-32.png');
  tray = new Tray(iconPath);
  tray.setToolTip('Desktop Timer');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Pokaż',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Wyjdź',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 320,
    height: 200,
    resizable: false,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    icon: path.join(getAssetsPath(), 'icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      app.quit();
    }
  });

  mainWindow.on('minimize', (event) => {
    event.preventDefault();
    mainWindow.hide();
  });
}

app.isQuitting = false;

// IPC handlers dla przycisków z renderera
ipcMain.on('minimize-window', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});

ipcMain.on('close-window', () => {
  app.quit();
});

app.whenReady().then(() => {
  createTrayIcon();
  createWindow();
});

app.on('window-all-closed', () => {});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});