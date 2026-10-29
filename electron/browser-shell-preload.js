const { ipcRenderer, contextBridge } = require('electron')

// 存储初始 URL（通过 IPC 传递）
let initialUrl = null
const urlCallbacks = []

ipcRenderer.on('browser-shell-set-url', (event, url) => {
  initialUrl = url
  urlCallbacks.forEach(cb => cb(url))
})

// 暴露窗口控制 API 给 browser-shell.html
contextBridge.exposeInMainWorld('browserWindow', {
  minimize: () => ipcRenderer.send('browser-shell-minimize'),
  maximize: () => ipcRenderer.send('browser-shell-maximize'),
  close: () => ipcRenderer.send('browser-shell-close'),
  isMaximized: () => ipcRenderer.invoke('browser-shell-isMaximized'),
  getInitialUrl: () => initialUrl,
  onInitialUrl: (callback) => {
    urlCallbacks.push(callback)
    if (initialUrl) callback(initialUrl)
    return () => {
      const idx = urlCallbacks.indexOf(callback)
      if (idx > -1) urlCallbacks.splice(idx, 1)
    }
  }
})
