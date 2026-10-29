const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

module.exports = async (context) => {
  const appOutDir = context.appOutDir
  const exeName = context.packager.appInfo.productFilename + '.exe'
  const exePath = path.join(appOutDir, exeName)
  
  // 查找 rcedit
  const rceditDir = path.join(__dirname, '..', 'node_modules', 'rcedit', 'bin')
  const rceditExe = path.join(rceditDir, 'rcedit.exe')
  const iconPath = path.join(__dirname, '..', 'public', 'logo.ico')
  
  if (fs.existsSync(rceditExe) && fs.existsSync(exePath) && fs.existsSync(iconPath)) {
    try {
      const cmd = `"${rceditExe}" "${exePath}" --set-icon "${iconPath}"`
      execSync(cmd, { stdio: 'pipe' })
      console.log('[after-pack] Icon embedded successfully into', exeName)
    } catch (err) {
      console.error('[after-pack] rcedit failed:', err.message)
    }
  } else {
    console.log('[after-pack] Skipping icon embed:', { 
      rcedit: fs.existsSync(rceditExe), 
      exe: fs.existsSync(exePath),
      icon: fs.existsSync(iconPath)
    })
  }
}
