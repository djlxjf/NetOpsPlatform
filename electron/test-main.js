const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const logPath = os.tmpdir() + '/electron-test.log'
fs.writeFileSync(logPath, 'Electron test started at ' + new Date().toISOString() + '\n')

app.whenReady().then(() => {
  fs.appendFileSync(logPath, 'app ready\n')
  const win = new BrowserWindow({ width: 800, height: 600 })
  win.loadURL('https://www.baidu.com')
  fs.appendFileSync(logPath, 'window created\n')
})
