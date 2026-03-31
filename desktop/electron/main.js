/**
 * Fateen POS — Electron Main Process
 * Loads the app from bundled local files for a fully offline experience.
 */

'use strict';

const { app, BrowserWindow, shell, session } = require('electron');
const path = require('path');

// Keep a global reference to prevent GC
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Fateen POS',
    icon: path.join(__dirname, '..', '..', 'icons', 'icon-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Allow IndexedDB to persist between sessions
      partition: 'persist:fateen-pos',
    },
  });

  // Load bundled static files
  const appRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'app')
    : path.join(__dirname, '..', '..');

  mainWindow.loadFile(path.join(appRoot, 'index.html'));

  // Open external links in the system browser, not in Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  // Content-Security-Policy: allow Supabase, Google Fonts, and CDN scripts
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: Object.assign(details.responseHeaders, {
        'Content-Security-Policy': [
          "default-src 'self';" +
          " script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline';" +
          " style-src 'self' https://fonts.googleapis.com 'unsafe-inline';" +
          " font-src 'self' https://fonts.gstatic.com;" +
          " connect-src 'self' https://*.supabase.co;" +
          " img-src 'self' data: blob:;",
        ],
      }),
    });
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
