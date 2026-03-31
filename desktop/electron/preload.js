/**
 * Fateen POS — Electron Preload Script
 * Runs in the renderer process with contextIsolation enabled.
 * Exposes only a minimal, safe API to the renderer via contextBridge.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe, minimal API surface to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  // Allow renderer to signal the main process to open external URLs safely
  openExternal: (url) => ipcRenderer.send('open-external', url),
});
