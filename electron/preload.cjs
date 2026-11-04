const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mobHost', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.send('settings:set', patch),
  onSettings: (fn) => ipcRenderer.on('settings', (_e, s) => fn(s)),
  onCommand: (fn) => ipcRenderer.on('command', (_e, c) => fn(c)),
  setPointerOver: (over) => ipcRenderer.send('pointer:over', over),
  setExpanded: (on) => ipcRenderer.send('window:expand', on),
  reportState: (name) => ipcRenderer.send('state', name),
});
