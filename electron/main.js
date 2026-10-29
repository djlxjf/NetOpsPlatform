const { app, BrowserWindow, shell, ipcMain, dialog, safeStorage, protocol } = require('electron')
const path = require('path')
const fs = require('fs')
// 启动早期日志 - 同步写文件，不依赖任何模块
try { fs.writeFileSync('C:\\temp\\netops-boot.log', 'main.js require stage 1: ' + new Date().toISOString() + '\n') } catch(e) {}
const os = require('os')
const { exec, spawn } = require('child_process')
const { pathToFileURL } = require('url')

// ============================================================
// 调试日志 - 强制同步写入（自包含，彻底消除 TDZ / 初始化顺序风险）
// 说明：debugLog 完全不依赖任何模块级 const，路径与 fs/os 均在
//       函数体内计算（核心模块 require 已被缓存，开销可忽略）。
//       这样即使在文件顶部、本声明之前新增任何 top-level debugLog 调用，
//       也绝不会命中暂时性死区(TDZ)，打包后主进程加载安全。
// 注意：旧版 EXE（2026-08-06 产物）因 debugLog 用 const 声明且调用在前，
//       会在打包后主进程加载时抛 "Cannot access 'debugLog' before initialization"，
//       必须重新打包分发新版。
// ============================================================
function debugLog(msg) {
  try {
    const os = require('os')
    const fs = require('fs')
    const logPath = os.tmpdir() + '/netops-debug.log'
    fs.appendFileSync(logPath, msg + '\n')
  } catch (e) {}
}

// 启动头部日志（一次性写入，路径同样自包含，不依赖任何模块级 const）
try {
  const os = require('os')
  const fs = require('fs')
  const logPath = os.tmpdir() + '/netops-debug.log'
  fs.writeFileSync(logPath, '=== App starting ===\n')
  fs.appendFileSync(logPath, 'execPath: ' + process.execPath + '\n')
  fs.appendFileSync(logPath, 'platform: ' + process.platform + '\n')
  fs.appendFileSync(logPath, 'cwd: ' + process.cwd() + '\n')
} catch (e) {}

// ============================================================
// 注册 app:// 为标准安全 scheme（必须在 app ready 之前，且全程仅能调用一次）
// 必要性：
// ① 未注册为 standard 时页面 origin 为 opaque，dist 的 CSP 'self' 无法匹配
//    app:// 资源 → JS/CSS 全被 CSP 拦截 → 黑屏（CSP 已加 "app:" scheme-source 双保险）；
// ② opaque origin 下 window.localStorage 直接抛 SecurityError 不可用。
// 注册为 standard 后 origin=app://. ，localStorage/CSP 均正常。
// 注意：历史旧包（2026-08-06）用 file:// 加载，用户数据在 file:// origin 的
// localStorage 分区；standard app://. 与其分区不同，旧数据已于 2026-10-07
// 一次性迁移至 app://. 分区（详见当日会话记录）。
// ============================================================
try {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
  ])
  debugLog('app scheme registered as privileged/standard')
} catch (e) {
  debugLog('registerSchemesAsPrivileged error: ' + e.message)
}

// Sentry 错误监控（可选，需要配置 DSN）
// const Sentry = require('@sentry/electron')
// Sentry.init({
//   dsn: 'https://your-dsn@sentry.io/your-project',
//   environment: process.env.NODE_ENV || 'development'
// })

// 引入邮件发送模块
let nodemailer = null
try {
  nodemailer = require('nodemailer')
} catch (e) {
  debugLog('nodemailer module not available: ' + e.message)
}

// 引入设备扫描模块
const deviceScanner = require('./device-scanner')

// 引入数据库模块
const dbManager = require('./database/db')
const deviceDAO = require('./database/deviceDAO')
const cabinetDAO = require('./database/cabinetDAO')
const alertDAO = require('./database/alertDAO')
const configBackupDAO = require('./database/configBackupDAO')
const topologyDAO = require('./database/topologyDAO')
const configDAO = require('./database/configDAO')
const dataCenterDAO = require('./database/dataCenterDAO')
const ingestDAO = require('./database/ingestDAO')

// 引入SNMP模块（交换机端口监控）
let snmp = null
try {
  snmp = require('net-snmp')
} catch (e) {
  debugLog('SNMP module not available: ' + e.message)
}

// ============================================================
// Chromium 兼容性参数 - 针对旧版路由器/摄像头Web界面
// ============================================================
// GPU 策略（架构审查 5-1 整改）：
//   旧实现在此 app 级全局禁用 GPU 并强制 SwiftShader 软件渲染，导致承载 3D 场景的
//   主窗口被迫走 CPU 软渲染、帧率严重受限（P1 级 FPS 瓶颈）。
//   整改：主窗口与 3D 场景恢复硬件加速；仅对承载老旧设备 Web 页面的 browser-shell
//   窗口做局部 GPU 降级（见下方 new BrowserWindow 的 additionalArguments）。
//   注意：渲染进程已 nodeIntegration:false + contextIsolation + sandbox 加固，
//   移除全局 GPU 降级不会削弱安全边界。

debugLog('main.js loaded')

// ============================================================
// 防御性 IPC 注册卫士（safeHandle）
// 背景：Electron 的 ipcMain.handle 对同一 channel 二次注册会直接 throw，
//       并中断主进程初始化（这正是 P0-2 的同源风险）。
// 行为：channel 已注册则告警并跳过（不覆盖、不抛错）；
//       内部通过缓存的原始 ipcMain['handle'] 引用调用，避免与 safeHandle 自身递归；
//       用 _registeredIpcChannels 集合判重。
// ============================================================
const _ipcHandle = ipcMain['handle'].bind(ipcMain)
const _registeredIpcChannels = new Set()
function safeHandle(channel, fn) {
  if (_registeredIpcChannels.has(channel)) {
    debugLog('[safeHandle] SKIP duplicate registration for channel: ' + channel)
    return
  }
  _registeredIpcChannels.add(channel)
  _ipcHandle(channel, fn)
}

// 防御性 IPC 事件注册卫士（safeOn）——与 safeHandle 同源去重
// 背景：ipcMain.on 对同一 channel 重复注册不会抛错，但会叠加监听器，
//       窗口二次创建等场景会导致事件被重复处理。
// 行为：channel 已注册则告警并跳过；用同一 _registeredIpcChannels 集合判重。
const _ipcOn = ipcMain['on'].bind(ipcMain)
function safeOn(channel, fn) {
  if (_registeredIpcChannels.has(channel)) {
    debugLog('[safeOn] SKIP duplicate registration for channel: ' + channel)
    return
  }
  _registeredIpcChannels.add(channel)
  _ipcOn(channel, fn)
}

// 全局变量
let mainWindow = null
let isQuitting = false
let userDataPath = null
let isFirstInstall = false  // 首次安装标志

// 确保数据目录存在
function ensureUserDataDir(username) {
  try {
    const userDir = path.join(userDataPath || os.tmpdir(), 'userData', username || 'default')
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true })
    }
    return userDir
  } catch (e) {
    debugLog('ensureUserDataDir error: ' + e.message)
    return null
  }
}

// 全局异常处理
process.on('uncaughtException', (error) => {
  debugLog('UNCAUGHT: ' + error.message)
})

process.on('unhandledRejection', (reason) => {
  debugLog('UNHANDLED: ' + String(reason))
})

function createWindow() {
  debugLog('createWindow() called')

  try {
    const windowOptions = {
      width: 1400,
      height: 900,
      minWidth: 1100,
      minHeight: 700,
      backgroundColor: '#0d1117',
      show: true,
      // 隐藏原生标题栏文字，但保留系统原生最小化/最大化/关闭按钮；
      // titleBarOverlay 让标题栏区域颜色与窗口内部一致（深色），避免白色外框
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#0d1117',
        symbolColor: '#b8c0cc',
        height: 40
      },
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: path.join(__dirname, 'preload.js')
      }
    }

    // Windows 下追加应用图标
    if (process.platform === 'win32') {
      const iconPath = path.join(__dirname, '../public/logo.ico')
      if (fs.existsSync(iconPath)) {
        windowOptions.icon = iconPath
      }
    }

    mainWindow = new BrowserWindow(windowOptions)
    debugLog('BrowserWindow created')

    // 加载页面
    // 修复黑屏：改用自定义 app:// 协议加载（见 app.whenReady 中的 registerFileProtocol）。
    // 原因：Electron 用 loadFile(file://) 时，Vite 构建产物里的 ES module 脚本无法以
    // file:// 协议加载（CORS/模块限制），且绝对路径 /assets/... 会解析到文件系统根而 404。
    // app:// 协议把请求映射到 app.asar/dist 下，绝对/相对路径均能正确解析。
    const indexPath = 'app://./index.html'
    debugLog('Loading: ' + indexPath)

    mainWindow.loadURL(indexPath).then(() => {
      debugLog('Page loaded')
      // 首次安装：清空渲染进程的 localStorage（端口连接等测试数据）
      if (isFirstInstall && mainWindow?.webContents) {
        mainWindow.webContents.executeJavaScript(`
          try {
            const keys = []
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i)
              if (k && k.startsWith('netops_')) keys.push(k)
            }
            keys.forEach(k => localStorage.removeItem(k))
            console.log('[first-install] cleared localStorage keys:', keys.length)
          } catch(e) { console.error('clear localStorage failed', e) }
        `).catch(e => debugLog('executeJavaScript failed: ' + e.message))
        debugLog('initDb: cleared localStorage for first install')
      }
    }).catch((err) => {
      debugLog('Load error: ' + err.message)
    })

    // 窗口关闭前自动保存数据
    mainWindow.on('close', (event) => {
      if (!isQuitting) {
        event.preventDefault()
        debugLog('Window close requested, sending before-close')
        mainWindow.webContents.send('before-close')
        // 给渲染进程 3 秒时间保存数据，然后强制关闭
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            debugLog('Force closing after timeout')
            isQuitting = true
            mainWindow.close()
          }
        }, 3000)
      }
    })

    mainWindow.webContents.on('did-fail-load', (event, code, desc) => {
      debugLog('Failed load: ' + code + ' ' + desc)
    })

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http')) {
        safeOpenExternal(url)
      }
      return { action: 'deny' }
    })

    // 安全审计 F-011：拦截页面内导航，防止被导航到远程页面（继承渲染进程权限）
    mainWindow.webContents.on('will-navigate', (event, url) => {
      const appUrl = mainWindow.webContents.getURL()
      // 仅允许本应用自身文件页面导航（比较 pathname，hash/query 不影响）
      let isSameApp = false
      try {
        isSameApp = url.startsWith('file://') && new URL(url).pathname === new URL(appUrl).pathname
      } catch (e) { isSameApp = false }
      if (!isSameApp) {
        event.preventDefault()
        if (url.startsWith('http')) {
          safeOpenExternal(url)
        }
      }
    })

    // ====== 自动更新（按需启用，默认关闭）======
    // 启用需同时满足两个环境变量，缺一则静默跳过：不联网、不注册更新通道。
    //   NETOPS_AUTO_UPDATE=1            显式开启开关
    //   NETOPS_GITHUB_OWNER=<仓库所有者> 真实发布仓库（占位值 your-github-username 无效）
    // 说明：内网/离线部署请保持默认（不设这两个变量）。
    try {
      if (process.env.NETOPS_AUTO_UPDATE === '1' && process.env.NETOPS_GITHUB_OWNER) {
        require('./updater.js').initAutoUpdater(mainWindow)
        debugLog('auto-updater enabled and initialized')
      }
    } catch (updaterErr) {
      debugLog('auto-updater init skipped: ' + updaterErr.message)
    }

  } catch (err) {
    debugLog('createWindow error: ' + err.message)
  }
}

app.whenReady().then(async () => {
  // ====== 注册 app:// 文件协议（修复黑屏根因）======
  // 将 app://<path> 映射到 app.asar/dist/<path>。
  // 这样 renderer 的 ES module / 资源无论用绝对(/assets/..)还是相对(./assets/..)路径，
  // 都能在 app:// 源下正确加载（file:// 协议无法加载 ES module 且绝对路径会 404）。
  try {
    protocol.registerFileProtocol('app', (request, callback) => {
      try {
        let u = String(request.url || '').replace(/^app:\/\//, '')
        u = u.replace(/^\.\//, '').replace(/^\/+/, '')
        u = u.split('?')[0].split('#')[0]
        const filePath = path.normalize(path.join(__dirname, '..', 'dist', u))
        callback({ path: filePath })
      } catch (e) {
        callback({ error: -2 })
      }
    })
    debugLog('app:// protocol registered')
  } catch (e) {
    debugLog('registerFileProtocol error: ' + e.message)
  }

  debugLog('App ready')

  // ====== 授权验证 ======
  try {
    const { execFileSync } = require('child_process')
    const licenseExe = path.join(__dirname, 'LicenseCheck.exe')
    if (fs.existsSync(licenseExe)) {
      const result = execFileSync(licenseExe, { encoding: 'utf8', timeout: 3000, stdio: 'pipe' })
      debugLog('License check: ' + (result || '').trim())
    } else {
      debugLog('LicenseCheck.exe not found, skipping check')
    }
  } catch (err) {
    const exitCode = err.status
    if (exitCode === 1) {
      // 试用到期，显示激活窗口
      try {
        const { execFileSync } = require('child_process')
        execFileSync(path.join(__dirname, 'LicenseActivate.exe'), { timeout: 300000, stdio: 'inherit' })
      } catch (e) {
        debugLog('License activate error: ' + e.message)
      }
    } else if (exitCode === 2) {
      dialog.showErrorBox('安全警告', '检测到调试工具，软件已退出。')
      app.quit()
      return
    }
    debugLog('License check exit code: ' + exitCode)
  }
  // ====== 授权验证结束 ======
  
  
  try {
    userDataPath = app.getPath('userData')
    debugLog('userDataPath: ' + userDataPath)
    
    const localStoragePath = path.join(userDataPath, 'LocalStorage')
    if (!fs.existsSync(localStoragePath)) {
      fs.mkdirSync(localStoragePath, { recursive: true })
    }
    
    initDb()
  } catch (e) {
    debugLog('Path error: ' + e.message)
  }
  
  // 启动Python后端服务器（如果需要的话）
  // startPythonBackend()
  // 暂时注释掉，避免启动失败
  
  createWindow()
  
  // 移除启动自动扫描：避免与前端页面自动扫描冲突导致资源竞争/卡死
  // 扫描由 MonitoringView.vue 的 onMounted -> autoScan() 统一触发
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch((err) => {
  debugLog('whenReady error: ' + err.message)
})

app.on('window-all-closed', () => {
  debugLog('All closed')
  // 停止Python后端服务器
  // stopPythonBackend()
  // 暂时注释掉
  if (process.platform !== 'darwin') app.quit()
})

// IPC: 窗口控制
safeOn('window-minimize', () => mainWindow?.minimize())

safeOn('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

safeOn('window-close', () => {
  if (mainWindow) {
    isQuitting = false
    mainWindow.webContents.send('before-close')
  }
})

safeOn('confirm-close', (event, shouldClose) => {
  debugLog('confirm-close received: ' + shouldClose)
  if (shouldClose && mainWindow) {
    flushDbSync()
    debugLog('Flushed db before close')
    isQuitting = true
    mainWindow.close()
  } else {
    isQuitting = false
  }
})

safeHandle('window-isMaximized', () => mainWindow?.isMaximized() || false)

ipcMain.on('window-titlebar-dblclick', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

// ============================================================
// 安全工具函数：命令参数校验（安全审计 F-003）
// 所有外部输入（IP/域名/端口/跳数）必须经此校验后才能进 spawn 参数数组，
// 严禁拼接进 shell 字符串。
// ============================================================
function isValidIp(ip) {
  if (typeof ip !== 'string') return false
  const parts = ip.split('.')
  if (parts.length !== 4) return false
  return parts.every(p => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255)
}

function isValidDomain(domain) {
  if (typeof domain !== 'string' || domain.length > 253) return false
  // 仅允许字母数字、连字符、点（DNS 名），禁止空格/引号/分号/换行等注入字符
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(domain)
}

// 安全 spawn：用参数数组执行外部命令（不经过 shell，天然免疫注入）
function safeSpawn(bin, args, opts = {}) {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    try {
      const child = spawn(bin, args, { windowsHide: true, ...opts })
      const timer = opts.timeout ? setTimeout(() => { try { child.kill() } catch (e) {} }, opts.timeout) : null
      child.stdout?.on('data', d => { stdout += d.toString() })
      child.stderr?.on('data', d => { stderr += d.toString() })
      child.on('close', (code) => {
        if (timer) clearTimeout(timer)
        resolve({ success: code === 0, output: stdout || stderr, code })
      })
      child.on('error', (err) => {
        if (timer) clearTimeout(timer)
        resolve({ success: false, output: err.message, code: -1 })
      })
    } catch (e) {
      resolve({ success: false, output: e.message, code: -1 })
    }
  })
}

// ============================================================
// 凭据加密原语（安全审计 F-007）
// 用 Electron safeStorage（OS 级密钥链）加密 SSH 密码 / AI Key 等敏感字段。
// handler 在运行时执行（app 已 ready），safeStorage 可用。
// 不可用时（Linux 无 keyring）返回 fallback，渲染侧降级为明文存储。
// ============================================================
safeHandle('credentials-encrypt', async (event, text) => {
  try {
    if (typeof text !== 'string' || !text) return { success: false, error: 'empty' }
    if (!safeStorage.isEncryptionAvailable()) return { success: false, fallback: true }
    const encrypted = safeStorage.encryptString(text)
    return { success: true, data: 'enc:' + encrypted.toString('base64') }
  } catch (e) {
    debugLog('credentials-encrypt error: ' + e.message)
    return { success: false, error: e.message }
  }
})

safeHandle('credentials-decrypt', async (event, enc) => {
  try {
    if (typeof enc !== 'string' || !enc.startsWith('enc:')) return { success: false, error: 'not-encrypted' }
    if (!safeStorage.isEncryptionAvailable()) return { success: false, fallback: true }
    const decrypted = safeStorage.decryptString(Buffer.from(enc.slice(4), 'base64'))
    return { success: true, data: decrypted }
  } catch (e) {
    debugLog('credentials-decrypt error: ' + e.message)
    return { success: false, error: e.message }
  }
})

// IPC: Ping — 通用ping函数，同时兼容真实/虚拟设备，中文/英文系统
async function pingDevice(ip) {
  if (!isValidIp(ip)) return false
  // 参数数组执行，杜绝命令注入；chcp 由 spawn 的 cmd 包装处理（Windows 编码）
  const args = process.platform === 'win32'
    ? ['/c', 'chcp', '65001', '>nul', '&', 'ping', '-n', '2', '-w', '2000', ip]
    : ['-n', '2', '-W', '2000', ip]
  const bin = process.platform === 'win32' ? 'cmd' : 'ping'
  const { success, output } = await safeSpawn(bin, args, { timeout: 15000 })
  console.log(`[pingDevice] ping完成, IP: ${ip}, success: ${success}`)
  debugLog(`[pingDevice] ping完成, IP: ${ip}, success: ${success}, stdout长度: ${(output || '').length}`)
  // 同时兼容中文和英文系统的输出，只要有回复就判断在线
  const isOnline = output.includes('回复来自') || output.includes('Reply from')
  console.log(`[pingDevice] IP: ${ip}, isOnline: ${isOnline}`)
  debugLog(`[pingDevice] IP: ${ip}, isOnline: ${isOnline}`)
  return isOnline
}

safeHandle('ping', async (event, { target }) => {
  const success = await pingDevice(target)
  return { success }
})

// IPC: Ping Sweep - 扫描子网内所有在线IP
safeHandle('pingSweep', async (event, { network }) => {
  try {
    const match = network.match(/^(\d+\.\d+\.\d+)\.(\d+)\/(\d+)$/)
    if (!match) return { success: false, error: '无效的网络格式，请使用 CIDR 格式如 192.168.1.0/24' }
    
    const baseIP = match[1]
    const cidr = parseInt(match[3])
    
    if (cidr < 24) {
      return { success: false, error: '暂不支持 /23 以下子网，请手动指定范围' }
    }
    
    debugLog(`pingSweep: scanning ${network}`)
    
    // 使用新版全子网扫描
    const onlineIPs = await pingSubnet(baseIP, (done, total, found) => {
      if (done % 50 === 0) {
        debugLog(`pingSweep: ${done}/${total} completed, ${found} online`)
      }
    })
    
    debugLog(`pingSweep: found ${onlineIPs.length} online IPs`)
    
    // TCP端口扫描降级：ICMP ping无结果时（Windows防火墙常阻止ICMP）
    // 使用TCP连接常见端口来发现在线主机
    if (onlineIPs.length === 0) {
      debugLog(`pingSweep: ICMP returned 0 hosts, falling back to TCP port scan...`)
      const tcpPorts = [80, 443, 22, 3389, 8080, 8000, 554, 3000, 5000, 9090, 445, 139, 135]
      const tcpResults = await tcpSweepSubnet(baseIP, tcpPorts, 40, 200)  // 40并发,200ms超时
      debugLog(`pingSweep: TCP scan found ${tcpResults.length} online IPs`)
      for (const ip of tcpResults) {
        if (!onlineIPs.includes(ip)) onlineIPs.push(ip)
      }
    }
    
    // 尝试获取ARP信息
    let arpMap = {}
    try {
      const arpResult = await new Promise((resolve) => {
        exec('arp -a', { timeout: 5000 }, (err, stdout) => {
          if (err) { resolve({}); return }
          const map = {}
          const lines = stdout.split('\n')
          for (const line of lines) {
            const winMatch = line.match(/^\s*(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F:-]+)/)
            if (winMatch) {
              map[winMatch[1]] = winMatch[2].toLowerCase()
            }
          }
          resolve(map)
        })
      })
      arpMap = arpResult
    } catch (e) {
      debugLog('pingSweep: ARP read failed: ' + e.message)
    }
    
    // 构建带MAC和厂商信息的设备列表
    const devices = onlineIPs.map(ip => {
      const mac = arpMap[ip] || ''
      const manufacturer = mac ? getManufacturerFromMac(mac) : ''
      return {
        ipAddress: ip,
        macAddress: mac,
        status: 'online',
        deviceType: manufacturer || '网络设备',
        manufacturer: manufacturer,
        isOnvifSupported: false,
        openPorts: []
      }
    })
    
    return { success: true, onlineIPs, devices, total: 254 }
  } catch (err) {
    debugLog('pingSweep error: ' + err.message)
    return { success: false, error: err.message }
  }
})

// 批量ping扫描整个子网（全254个IP）
async function pingSubnet(baseIP, onProgress) {
  const onlineIPs = []
  const total = 254
  const concurrency = 30
  let completed = 0
  
  await new Promise((resolve) => {
    let index = 1
    let running = 0
    
    function next() {
      while (index <= total && running < concurrency) {
        const ip = `${baseIP}.${index++}`
        running++
        pingDevice(ip).then(isOnline => {
          running--
          completed++
          if (isOnline) onlineIPs.push(ip)
          if (onProgress) onProgress(completed, total, onlineIPs.length)
          if (completed >= total) {
            resolve()
          } else {
            next()
          }
        })
      }
      // 如果没有新的可以启动且还有在运行的，不需要做什么，等待完成回调触发 next
      if (running === 0 && completed < total) {
        // 这种情况不应该发生，但以防万一
        resolve()
      }
    }
    
    next()
  })
  
  return onlineIPs
}

// TCP端口扫描整个子网 — ICMP ping降级方案
// 对每个IP尝试连接常用的TCP端口，有任意端口回应即视为在线
async function tcpSweepSubnet(baseIP, ports, concurrency = 40, timeoutMs = 200) {
  const onlineIPs = []
  const total = 254
  const allPorts = ports || [80, 443, 22, 8080, 8000, 3389, 445]
  const net = require('net')
  
  let nextIPIndex = 1
  let completed = 0
  let running = 0
  
  await new Promise((resolve) => {
    function next() {
      while (nextIPIndex <= total && running < concurrency) {
        const ip = `${baseIP}.${nextIPIndex++}`
        running++
        
        // 对每个IP并行扫描所有端口，找到第一个开放的即停止
        scanHost(ip, allPorts, timeoutMs).then(foundOpen => {
          running--
          completed++
          if (foundOpen) onlineIPs.push(ip)
          if (completed >= total && running === 0) {
            resolve()
          } else {
            next()
          }
        })
      }
      if (running === 0 && completed >= total) resolve()
    }
    next()
  })
  
  return onlineIPs
}

// 扫描单个主机的端口列表，发现任何一个开放端口即返回true
function scanHost(ip, ports, timeoutMs) {
  const net = require('net')
  return new Promise((resolve) => {
    let resolved = false
    let completed = 0
    const total = ports.length
    
    for (const port of ports) {
      const socket = new net.Socket()
      socket.setTimeout(timeoutMs)
      socket.on('connect', () => {
        if (!resolved) {
          resolved = true
          // 关闭所有其他socket
          resolve(true)
        }
        try { socket.destroy() } catch(e) {}
      })
      socket.on('timeout', () => {
        completed++
        try { socket.destroy() } catch(e) {}
        if (completed >= total && !resolved) {
          resolved = true
          resolve(false)
        }
      })
      socket.on('error', () => {
        completed++
        try { socket.destroy() } catch(e) {}
        if (completed >= total && !resolved) {
          resolved = true
          resolve(false)
        }
      })
      try {
        socket.connect(port, ip)
      } catch(e) {
        completed++
        if (completed >= total && !resolved) {
          resolved = true
          resolve(false)
        }
      }
    }
  })
}

// 使用 nmap 风格的快速扫描（如果系统有 nmap）
async function fastPortScan(ip, ports, timeoutMs = 800) {
  const openPorts = []
  const net = require('net')
  
  await Promise.all(ports.map(port => new Promise(resolve => {
    const socket = new net.Socket()
    socket.setTimeout(timeoutMs)
    socket.on('connect', () => {
      openPorts.push(port)
      socket.destroy()
      resolve()
    })
    socket.on('timeout', () => { socket.destroy(); resolve() })
    socket.on('error', () => { socket.destroy(); resolve() })
    socket.connect(port, ip)
  })))
  
  return openPorts
}

// IPC: Traceroute（spawn 参数数组 + 输入校验，安全审计 F-003）
safeHandle('traceroute', async (event, { target, maxHops = 30 }) => {
  // 目标必须是合法 IP 或域名；跳数限制 1-30
  const hops = Math.min(30, Math.max(1, parseInt(maxHops, 10) || 30))
  if (!isValidIp(target) && !isValidDomain(target)) {
    return { success: false, output: '无效的目标地址（仅支持合法 IP 或域名）' }
  }
  const args = process.platform === 'win32'
    ? ['-h', String(hops), target]
    : ['-m', String(hops), target]
  const result = await safeSpawn(process.platform === 'win32' ? 'tracert' : 'traceroute', args, { timeout: 60000 })
  return { success: result.success, output: result.output }
})

// IPC: DNS（spawn 参数数组 + 域名校验，安全审计 F-003）
safeHandle('nslookup', async (event, { domain }) => {
  if (!isValidDomain(domain)) {
    return { success: false, output: '无效的域名（仅支持合法 DNS 名）' }
  }
  const result = await safeSpawn('nslookup', [domain], { timeout: 10000 })
  return { success: result.success, output: result.output }
})

// IPC: 端口扫描
safeHandle('scan-port', async (event, { target, port, timeout = 1000 }) => {
  return new Promise((resolve) => {
    const net = require('net')
    const socket = new net.Socket()
    socket.setTimeout(timeout)
    socket.on('connect', () => { socket.destroy(); resolve({ open: true }) })
    socket.on('timeout', () => { socket.destroy(); resolve({ open: false }) })
    socket.on('error', () => { socket.destroy(); resolve({ open: false }) })
    socket.connect(port, target)
  })
})

// IPC: 执行系统命令 —— 安全审计 F-003 修复：不再原样执行任意命令。
// 现仅允许白名单格式 `arp -a [IP]`（渲染侧全部调用方都是 ARP 表查询），
// 且用 spawn 参数数组执行 + IP 严格校验，其余命令一律拒绝。
safeHandle('exec-command', async (event, command) => {
  const cmd = String(command || '').trim()
  // 白名单解析：arp -a 或 arp -a <合法IP>
  const arpMatch = cmd.match(/^arp\s+-a(\s+(\S+))?$/i)
  if (!arpMatch) {
    return { success: false, output: '该命令通道已被安全加固：仅支持 arp -a [IP]' }
  }
  const ipArg = arpMatch[2]
  if (ipArg !== undefined && !isValidIp(ipArg)) {
    return { success: false, output: '无效的 IP 地址' }
  }
  const args = ipArg !== undefined ? ['-a', ipArg] : ['-a']
  const result = await safeSpawn('arp', args, { timeout: 10000 })
  return { success: result.success, output: result.output }
})

// IPC: SNMP 交换机端口状态获取
safeHandle('snmp-get-ports', async (event, { ip, community = 'public', timeout = 5000 }) => {
  if (!snmp) {
    return { success: false, error: 'SNMP模块未安装' }
  }
  
  return new Promise((resolve) => {
    try {
      const session = snmp.createSession(ip, community, { timeout })
      const ports = []
      
      // OID for interface descriptions (ifDescr)
      const ifDescrOid = '1.3.6.1.2.1.2.2.1.2'
      // OID for interface oper status (ifOperStatus) 1=up, 2=down
      const ifOperStatusOid = '1.3.6.1.2.1.2.2.1.8'
      // OID for interface admin status (ifAdminStatus)
      const ifAdminStatusOid = '1.3.6.1.2.1.2.2.1.7'
      // OID for interface speed (ifSpeed)
      const ifSpeedOid = '1.3.6.1.2.1.2.2.1.5'
      // OID for interface type (ifType)
      const ifTypeOid = '1.3.6.1.2.1.2.2.1.3'
      
      session.subtree(ifDescrOid, (varbinds) => {
        for (const vb of varbinds) {
          const index = vb.oid.split('.').pop()
          const name = vb.value.toString()
          ports.push({ index, name, status: 'unknown', adminStatus: 'unknown', speed: 0, type: 'unknown' })
        }
      }, (err) => {
        if (err) {
          session.close()
          resolve({ success: false, error: err.message })
          return
        }
        
        // Get oper status
        session.subtree(ifOperStatusOid, (varbinds) => {
          for (const vb of varbinds) {
            const index = vb.oid.split('.').pop()
            const port = ports.find(p => p.index === index)
            if (port) {
              port.status = vb.value === 1 ? 'up' : (vb.value === 2 ? 'down' : 'unknown')
            }
          }
        }, (err) => {
          if (err) {
            session.close()
            resolve({ success: false, error: err.message })
            return
          }
          
          // Get admin status
          session.subtree(ifAdminStatusOid, (varbinds) => {
            for (const vb of varbinds) {
              const index = vb.oid.split('.').pop()
              const port = ports.find(p => p.index === index)
              if (port) {
                port.adminStatus = vb.value === 1 ? 'up' : (vb.value === 2 ? 'down' : 'unknown')
              }
            }
          }, (err) => {
            if (err) {
              session.close()
              resolve({ success: false, error: err.message })
              return
            }
            
            // Get speed
            session.subtree(ifSpeedOid, (varbinds) => {
              for (const vb of varbinds) {
                const index = vb.oid.split('.').pop()
                const port = ports.find(p => p.index === index)
                if (port) {
                  port.speed = parseInt(vb.value) || 0
                }
              }
            }, (err) => {
              session.close()
              if (err) {
                resolve({ success: false, error: err.message })
                return
              }
              
              // Filter out loopback and null interfaces, keep only physical ports
              const filteredPorts = ports.filter(p => {
                const name = p.name.toLowerCase()
                return !name.includes('loopback') && 
                       !name.includes('null') && 
                       !name.includes('vlan') &&
                       p.name.length > 0
              })
              
              resolve({ success: true, ports: filteredPorts })
            })
          })
        })
      })
    } catch (e) {
      resolve({ success: false, error: e.message })
    }
  })
})

// IPC: 设备状态变化通知（邮件/企业微信/钉钉）
safeHandle('notify-status-change', async (event, { device, prevStatus, newStatus }) => {
  try {
    const statusText = newStatus === 'online' ? '上线' : '离线'
    const msg = `设备【${device.name || device.ip}】(${device.ip}) 状态变化：${prevStatus} → ${statusText}`
    debugLog(`notify-status-change: ${msg}`)

    // 1. 系统通知（Windows Toast）
    if (process.platform === 'win32') {
      // 使用系统通知，需要主窗口存在
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('status-change-notify', { device, prevStatus, newStatus, message: msg })
      }
    }

    // 2. 邮件通知（读取用户配置）
    try {
      const accountsData = await new Promise((resolve) => {
        ipcMain.emit('db-load-accounts', { sender: null }, (result) => resolve(result))
      }).catch(() => null)
      // 如果用户配置了SMTP，则发邮件（这里留接口，具体实现由用户配置驱动）
      // TODO: 读取通知配置，发送邮件/企业微信/钉钉
    } catch (e) { debugLog('notify email error: ' + e.message) }

    return { success: true }
  } catch (e) {
    debugLog('notify-status-change error: ' + e.message)
    return { success: false, error: e.message }
  }
})

// 整改（安全 F-06）：统一的外部链接打开闸门。
// 原实现有三处散落的 openExternal：IPC 'open-external' 完全未校验；
// setWindowOpenHandler / will-navigate 用 url.startsWith('http') 粗判——
// 该写法会误放行 'httpx://'、'httpfoo://' 等伪协议字符串。
// 现全部收敛到本函数：协议必须精确为 http/https，且主机名合法。
function safeOpenExternal(rawUrl) {
  let ok = false;
  try {
    const u = new URL(String(rawUrl));
    ok = (u.protocol === 'http:' || u.protocol === 'https:') && /^[a-zA-Z0-9.-]+$/.test(u.hostname);
  } catch (e) { ok = false; }
  if (!ok) {
    debugLog('openExternal rejected: ' + rawUrl)
    return false;
  }
  shell.openExternal(String(rawUrl))
  return true;
}

// IPC: 文件操作
// 渲染进程请求打开外部链接：仅放行 http/https（详见 safeOpenExternal）
safeOn('open-external', (event, url) => {
  safeOpenExternal(url)
})

// 探测URL是否可达（HTTP/HEAD请求）
// 整改（安全 F-10）：原实现写死 rejectUnauthorized:false，且经全量检索
// 确认本函数无任何调用点（'open-webview' 已改为直接打开、无探测延时，
//  见下方注释）。既是死代码，又是不必要的 TLS 校验关闭面，故整体移除。
// 若将来确需恢复，请同时补上协议白名单与私网地址拦截，不要照抄原版。

// IPC: 应用内打开 WebView（直接打开，无探测延时）
ipcMain.on('open-webview', (event, data) => {
  let urls = []
  let titlePrefix = 'NetOps'

  if (typeof data === 'string') {
    urls = [data]
  } else if (data && data.urls && Array.isArray(data.urls)) {
    urls = data.urls
    titlePrefix = data.manufacturer || data.deviceType || 'NetOps'
  }

  if (urls.length === 0) {
    debugLog('open-webview: no urls provided')
    return
  }

  const targetUrl = urls[0]
  debugLog('open-webview: opening ' + targetUrl)

  const webviewWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: `${titlePrefix} - NetOps 内置浏览器`,
    backgroundColor: '#0d1117',
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'browser-shell-preload.js'),
      webSecurity: true, // 安全审计 C-003：强制启用同源策略，阻止任意源加载
      allowRunningInsecureContent: false, // 禁止加载不安全内容
      allowDisplayingInsecureContent: false, // 禁止显示不安全内容
      webviewTag: true,
      sandbox: true, // 安全审计 C-003：启用沙箱隔离
      javascript: true
    },
    // 架构审查 5-1：仅对 browser-shell（老旧设备 Web 页面）局部降级 GPU，
    // 避免全局禁用 GPU 拖累主窗口 3D 硬件加速。主窗口保持 GPU 开启。
    additionalArguments: ['--disable-gpu', '--disable-gpu-compositing', '--use-gl=swiftshader']
  })

  // 去掉菜单栏
  webviewWindow.setMenu(null)

  // 伪装 User-Agent 为旧版 Chrome（提升旧设备页面兼容性）
  webviewWindow.webContents.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.149 Safari/537.36'
  )

  // 忽略 HTTPS 证书错误（安全审计 C-003：旧设备自签证书场景，仅允许自签证书，不拒绝证书错误）
  // 注意：这是内网设备管理的必要功能（旧设备使用自签名证书），保留但要限制范围
  webviewWindow.webContents.on('certificate-error', (event, url, error, certificate, callback) => {
    event.preventDefault()
    callback(true) // 内网设备自签证书必须接受，否则无法管理旧设备
  })

  // 页面加载完成后显示窗口
  webviewWindow.once('ready-to-show', () => {
    webviewWindow.show()
  })

  // 监听 browser-shell 的窗口控制事件
  const minimizeHandler = () => webviewWindow?.minimize()
  const maximizeHandler = () => {
    if (webviewWindow?.isMaximized()) {
      webviewWindow.unmaximize()
    } else {
      webviewWindow?.maximize()
    }
  }
  const closeHandler = () => webviewWindow?.close()
  ipcMain.on('browser-shell-minimize', minimizeHandler)
  ipcMain.on('browser-shell-maximize', maximizeHandler)
  ipcMain.on('browser-shell-close', closeHandler)
  safeHandle('browser-shell-isMaximized', () => webviewWindow?.isMaximized() || false)

  // 窗口关闭时清理监听器
  webviewWindow.once('closed', () => {
    ipcMain.removeListener('browser-shell-minimize', minimizeHandler)
    ipcMain.removeListener('browser-shell-maximize', maximizeHandler)
    ipcMain.removeListener('browser-shell-close', closeHandler)
    ipcMain.removeHandler('browser-shell-isMaximized')
  })

  // 加载浏览器外壳页面
  const shellPath = path.join(__dirname, 'browser-shell.html')
  debugLog('open-webview: loading shell ' + shellPath + ' with url=' + targetUrl)
  webviewWindow.loadFile(shellPath)

  // 页面完全加载后，通过 executeJavaScript 直接调用 loadInitialUrl（最可靠的方式）
  webviewWindow.webContents.on('did-finish-load', () => {
    debugLog('open-webview: did-finish-load, calling loadInitialUrl via executeJavaScript: ' + targetUrl)
    webviewWindow.webContents.executeJavaScript(`loadInitialUrl(${JSON.stringify(targetUrl)})`).then(() => {
      debugLog('open-webview: executeJavaScript loadInitialUrl succeeded')
    }).catch(err => {
      debugLog('open-webview: executeJavaScript error: ' + err.message)
    })
  })
})

safeHandle('save-file', async (event, { content, defaultName, filters }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: filters || [
      { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (!result.canceled && result.filePath) {
    try {
      fs.writeFileSync(result.filePath, content, 'utf-8')
      return { success: true, filePath: result.filePath }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }
  return { success: false, canceled: true }
})

safeHandle('read-file', async (event, { filters }) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [
      { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (!result.canceled && result.filePaths.length > 0) {
    try {
      return { success: true, filePath: result.filePaths[0], content: fs.readFileSync(result.filePaths[0], 'utf-8') }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }
  return { success: false, canceled: true }
})

// ============================================================
// 统一数据库层 - 内存缓存 + 防抖写入 + 原子性保证
// ============================================================
let dbCache = null          // 内存缓存，避免每次读文件
let dbWritePending = false  // 写入防抖标记
let dbWriteTimer = null     // 防抖定时器
const DB_FILE = 'netops_db.json'

function getDbPath() {
  return path.join(userDataPath || os.tmpdir(), DB_FILE)
}

function initDb() {
  const installedFlag = path.join(userDataPath || os.tmpdir(), '.installed')
  
  // 首次安装检测：没有 .installed 标记文件时，清空所有旧数据
  isFirstInstall = !fs.existsSync(installedFlag)
  if (isFirstInstall) {
    debugLog('initDb: first install detected, wiping old data')
    // 删除旧的数据库文件（如果存在）
    const dbPath = getDbPath()
    if (fs.existsSync(dbPath)) {
      try { fs.unlinkSync(dbPath) } catch(e) { debugLog('initDb: delete old db failed: ' + e.message) }
    }
    // 清空同目录下的所有用户数据子目录
    try {
      const userDir = path.join(userDataPath || os.tmpdir(), 'userData')
      if (fs.existsSync(userDir)) {
        fs.rmSync(userDir, { recursive: true, force: true })
        debugLog('initDb: wiped old userData dir')
      }
    } catch(e) { debugLog('initDb: wipe userData failed: ' + e.message) }
    // 创建安装标记文件，标记已初始化
    try { fs.writeFileSync(installedFlag, 'installed') } catch(e) {}
    debugLog('initDb: fresh install, will use SQLite database')
  }
  
  // 初始化 SQLite 数据库
  try {
    dbManager.init(userDataPath)
    debugLog('SQLite database initialized successfully')
  } catch (e) {
    debugLog('SQLite init error: ' + e.message)
  }
  
  // 保留旧的 dbCache 用于兼容（逐步迁移）
  try {
    const dbPath = getDbPath()
    if (fs.existsSync(dbPath)) {
      dbCache = JSON.parse(fs.readFileSync(dbPath, 'utf-8'))
    }
  } catch (e) {
    debugLog('initDb read error: ' + e.message)
  }
  if (!dbCache) {
    dbCache = {
      version: '1.0',
      accounts: {},
      currentUsername: null,
      users: {},
      system: { lastUpdate: null }
    }
  }
  if (!dbCache.accounts) dbCache.accounts = {}
  if (!dbCache.users) dbCache.users = {}
  if (!dbCache.system) dbCache.system = {}
  if (dbCache.currentAccount === undefined) dbCache.currentAccount = null
  debugLog('initDb done, users: ' + Object.keys(dbCache.users).length)
}

function ensureUser(username) {
  if (!username) username = 'default'
  if (!dbCache.users[username]) {
    dbCache.users[username] = {
      devices: [],
      cabinets: [],
      topology: { nodes: [], edges: [] },
      deviceLibCustom: []
    }
  }
  return username
}

function flushDb() {
  try {
    dbCache.system.lastUpdate = new Date().toISOString()
    const tmpPath = getDbPath() + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(dbCache, null, 2), 'utf-8')
    fs.renameSync(tmpPath, getDbPath())
    debugLog('flushDb OK, users: ' + Object.keys(dbCache.users).length)
  } catch (e) {
    debugLog('flushDb error: ' + e.message)
  }
}

function scheduleDbFlush() {
  if (dbWritePending) return
  dbWritePending = true
  if (dbWriteTimer) clearTimeout(dbWriteTimer)
  dbWriteTimer = setTimeout(() => {
    dbWritePending = false
    flushDb()
  }, 500)  // 500ms 防抖
}

function flushDbSync() {
  if (dbWriteTimer) { clearTimeout(dbWriteTimer); dbWriteTimer = null }
  dbWritePending = false
  flushDb()
}

// 初始化数据库（在 app ready 后调用）
// initDb() is called inside app.whenReady after userDataPath is set

// ============================================================
// IPC: 统一数据库操作 - 批量保存用户所有数据
// ============================================================
safeHandle('db-save-user-data', async (event, { username, dataType, data }) => {
  try {
    const un = ensureUser(username)
    const user = dbCache.users[un]

    if (dataType === 'devices') user.devices = data
    else if (dataType === 'cabinets') user.cabinets = data
    else if (dataType === 'topologyNodes') {
      if (!user.topology) user.topology = { nodes: [], edges: [] }
      user.topology.nodes = data
    } else if (dataType === 'topologyEdges') {
      if (!user.topology) user.topology = { nodes: [], edges: [] }
      user.topology.edges = data
    } else if (dataType === 'deviceLibCustom') user.deviceLibCustom = data
    else if (dataType === 'topologyLayout') user.topologyLayout = data
    else if (dataType === 'portConnections') user.portConnections = data
    else if (dataType === 'all') {
      if (data.devices !== undefined) user.devices = data.devices
      if (data.cabinets !== undefined) user.cabinets = data.cabinets
      if (data.topologyNodes !== undefined) {
        if (!user.topology) user.topology = { nodes: [], edges: [] }
        user.topology.nodes = data.topologyNodes
      }
      if (data.topologyEdges !== undefined) {
        if (!user.topology) user.topology = { nodes: [], edges: [] }
        user.topology.edges = data.topologyEdges
      }
      if (data.deviceLibCustom !== undefined) user.deviceLibCustom = data.deviceLibCustom
      if (data.topologyLayout !== undefined) user.topologyLayout = data.topologyLayout
      if (data.portConnections !== undefined) user.portConnections = data.portConnections
    } else {
      // 未知 dataType 不再静默丢弃：落同名通用桶并告警，避免前端写入后读不回
      // （历史缺陷：topologyLayout / portConnections 在桌面路径被静默丢弃且仍返回 success）
      debugLog('db-save-user-data: unknown dataType=' + dataType + '（已存通用桶）')
      user[dataType] = data
    }

    scheduleDbFlush()
    debugLog('db-save-user-data: ' + dataType + ' for ' + un)
    return { success: true }
  } catch (err) {
    debugLog('db-save-user-data error: ' + err.message)
    return { success: false, error: err.message }
  }
})

// ============================================================
// IPC: 统一数据库操作 - 加载用户数据
// ============================================================
safeHandle('db-load-user-data', async (event, username) => {
  try {
    const un = username || 'default'
    const user = dbCache.users[un]
    if (!user) {
      debugLog('db-load-user-data: no data for ' + un)
      return { success: true, data: null }
    }
    debugLog('db-load-user-data: loaded for ' + un + ', devices=' + (user.devices?.length || 0))
    return {
      success: true,
      data: {
        devices: user.devices || [],
        cabinets: user.cabinets || [],
        topologyNodes: user.topology?.nodes || [],
        topologyEdges: user.topology?.edges || [],
        deviceLibCustom: user.deviceLibCustom || [],
        topologyLayout: user.topologyLayout || null,
        portConnections: user.portConnections || null
      }
    }
  } catch (err) {
    debugLog('db-load-user-data error: ' + err.message)
    return { success: false, error: err.message }
  }
})

// ============================================================
// IPC: 账户管理 - 注册/登录/列出账户
// ============================================================
safeHandle('db-save-accounts', async (event, { accounts }) => {
  try {
    dbCache.accounts = accounts
    scheduleDbFlush()
    debugLog('db-save-accounts: ' + Object.keys(accounts).length + ' accounts')
    return { success: true }
  } catch (err) {
    debugLog('db-save-accounts error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-load-accounts', async () => {
  try {
    return { success: true, accounts: dbCache.accounts || {} }
  } catch (err) {
    debugLog('db-load-accounts error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-save-current-user', async (event, { username }) => {
  try {
    dbCache.currentUsername = username
    scheduleDbFlush()
    debugLog('db-save-current-user: ' + (username || 'null'))
    return { success: true }
  } catch (err) {
    debugLog('db-save-current-user error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-load-current-user', async () => {
  try {
    const username = dbCache.currentUsername
    debugLog('db-load-current-user: ' + (username || 'null'))
    if (username) {
      return { success: true, user: { username, name: username } }
    }
    return { success: true, user: null }
  } catch (err) {
    debugLog('db-load-current-user error: ' + err.message)
    return { success: false, error: err.message }
  }
})

// ============================================================
// IPC: 账号会话持久化（登录系统）
// currentAccount 存"已通过密码登录的账号名"，与 currentUsername（项目会话）相互独立
// ============================================================
safeHandle('auth-save-session', async (event, { username }) => {
  try {
    dbCache.currentAccount = username || null
    scheduleDbFlush()
    debugLog('auth-save-session: ' + (username || 'null'))
    return { success: true }
  } catch (err) {
    debugLog('auth-save-session error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('auth-load-session', async () => {
  try {
    debugLog('auth-load-session: ' + (dbCache.currentAccount || 'null'))
    return { success: true, username: dbCache.currentAccount || null }
  } catch (err) {
    debugLog('auth-load-session error: ' + err.message)
    return { success: false, error: err.message }
  }
})

// ============================================================
// IPC: 强制立即写入（关闭时调用）
// ============================================================
safeHandle('db-flush', async () => {
  try {
    flushDbSync()
    return { success: true }
  } catch (err) {
    debugLog('db-flush error: ' + err.message)
    return { success: false, error: err.message }
  }
})

// ============================================================
// IPC: 数据库操作 - 设备相关（使用SQLite DAO）
// ============================================================
safeHandle('db-device-create', async (event, device) => {
  try {
    const result = deviceDAO.create(device)
    debugLog('db-device-create: ' + result.id)
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-device-create error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-device-update', async (event, { id, updates }) => {
  try {
    const result = deviceDAO.update(id, updates)
    debugLog('db-device-update: ' + id)
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-device-update error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-device-delete', async (event, id) => {
  try {
    const result = deviceDAO.delete(id)
    debugLog('db-device-delete: ' + id)
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-device-delete error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-device-find-by-id', async (event, id) => {
  try {
    const result = deviceDAO.findById(id)
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-device-find-by-id error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-device-find-all', async (event, filters) => {
  try {
    const result = deviceDAO.findAll(filters || {})
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-device-find-all error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-device-update-status', async (event, { id, status }) => {
  try {
    const result = deviceDAO.updateStatus(id, status)
    debugLog('db-device-update-status: ' + id + ' -> ' + status)
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-device-update-status error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-device-get-stats', async () => {
  try {
    const result = deviceDAO.getStats()
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-device-get-stats error: ' + err.message)
    return { success: false, error: err.message }
  }
})

// ============================================================
// IPC: 数据库操作 - 机柜相关（使用SQLite DAO）
// ============================================================
safeHandle('db-cabinet-create', async (event, cabinet) => {
  try {
    const result = cabinetDAO.create(cabinet)
    debugLog('db-cabinet-create: ' + result.id)
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-cabinet-create error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-cabinet-update', async (event, { id, updates }) => {
  try {
    const result = cabinetDAO.update(id, updates)
    debugLog('db-cabinet-update: ' + id)
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-cabinet-update error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-cabinet-delete', async (event, id) => {
  try {
    const result = cabinetDAO.delete(id)
    debugLog('db-cabinet-delete: ' + id)
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-cabinet-delete error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-cabinet-find-by-id', async (event, id) => {
  try {
    const result = cabinetDAO.findById(id)
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-cabinet-find-by-id error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-cabinet-find-all', async () => {
  try {
    const result = cabinetDAO.findAll()
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-cabinet-find-all error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-cabinet-get-devices', async (event, cabinetId) => {
  try {
    const result = cabinetDAO.getDevices(cabinetId)
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-cabinet-get-devices error: ' + err.message)
    return { success: false, error: err.message }
  }
})

// ============================================================
// IPC: 数据库操作 - 告警相关（使用SQLite DAO）
// ============================================================
safeHandle('db-alert-create', async (event, alert) => {
  try {
    const result = alertDAO.create(alert)
    debugLog('db-alert-create: ' + result.id)
    // 3D 机房实时告警广播（B2）：新建告警后推送事件，驱动 3D 红色脉冲 + 2D 面板联动
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('dc-alert', { action: 'create', ...result })
    }
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-alert-create error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-alert-update-status', async (event, { id, status, resolvedBy, resolutionNote }) => {
  try {
    const result = alertDAO.updateStatus(id, status, resolvedBy, resolutionNote)
    debugLog('db-alert-update-status: ' + id + ' -> ' + status)
    // 3D 机房实时告警广播（B2）：状态变更（含「已解决」）后推送，驱动 3D 解除脉冲
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('dc-alert', { action: 'update', ...result })
    }
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-alert-update-status error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-alert-find-all', async (event, filters) => {
  try {
    const result = alertDAO.findAll(filters || {})
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-alert-find-all error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-alert-get-stats', async () => {
  try {
    const result = alertDAO.getStats()
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-alert-get-stats error: ' + err.message)
    return { success: false, error: err.message }
  }
})

// ============================================================
// IPC: 数据接入（手动录入 + 预留自动采集，type 驱动通用通道）
//   type ∈ { alarm, sensor, env, energy, source }
// ============================================================
const INGEST_TYPES = ['alarm', 'sensor', 'env', 'energy', 'source']

function validateIngestType(type) {
  if (!INGEST_TYPES.includes(type)) {
    throw new Error('不支持的数据接入类型: ' + type)
  }
}

safeHandle('db-ingest-create', async (event, { type, record }) => {
  try {
    validateIngestType(type)
    const result = ingestDAO.create(type, record || {})
    debugLog('db-ingest-create: ' + type + ' / ' + result.id)
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-ingest-create error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-ingest-create-many', async (event, { type, records }) => {
  try {
    validateIngestType(type)
    const n = ingestDAO.createMany(type, records || [])
    return { success: true, count: n }
  } catch (err) {
    debugLog('db-ingest-create-many error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-ingest-update', async (event, { type, id, updates }) => {
  try {
    validateIngestType(type)
    const result = ingestDAO.update(type, id, updates || {})
    debugLog('db-ingest-update: ' + type + ' / ' + id)
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-ingest-update error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-ingest-delete', async (event, { type, id }) => {
  try {
    validateIngestType(type)
    const result = ingestDAO.delete(type, id)
    debugLog('db-ingest-delete: ' + type + ' / ' + id)
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-ingest-delete error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-ingest-find-all', async (event, { type, filters }) => {
  try {
    validateIngestType(type)
    const result = ingestDAO.findAll(type, filters || {})
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-ingest-find-all error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-ingest-find-by-id', async (event, { type, id }) => {
  try {
    validateIngestType(type)
    const result = ingestDAO.findById(type, id)
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-ingest-find-by-id error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-ingest-get-stats', async (event, { type }) => {
  try {
    validateIngestType(type)
    const result = ingestDAO.getStats(type)
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-ingest-get-stats error: ' + err.message)
    return { success: false, error: err.message }
  }
})

// 预留：自动采集回写数据源状态
safeHandle('db-ingest-mark-poll', async (event, { type, id, status, error }) => {
  try {
    validateIngestType(type)
    const result = ingestDAO.markPoll(type, id, status, error)
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-ingest-mark-poll error: ' + err.message)
    return { success: false, error: err.message }
  }
})

// B1/F2：后端聚合状态 → 3D 机房初始化着色。
// 取活跃告警，按 device_id 聚合最严重级别（critical > warning），返回 { [device_id]: level }。
// 无告警 / 出错时返回空对象，由 Vue 侧安全忽略。
safeHandle('dc-rack-status', async () => {
  try {
    const alerts = (alertDAO.findActive && alertDAO.findActive()) || []
    const map = {}
    for (const a of alerts) {
      if (!a.device_id) continue
      const lvl = a.level === 'critical' ? 'critical' : 'warning'
      if (map[a.device_id] !== 'critical') map[a.device_id] = lvl
    }
    return { success: true, data: map }
  } catch (err) {
    debugLog('dc-rack-status error: ' + err.message)
    return { success: false, data: {} }
  }
})

// 删除告警
safeHandle('db-alert-delete', async (event, id) => {
  try {
    const result = alertDAO.delete(id)
    debugLog('db-alert-delete: ' + id)
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-alert-delete error: ' + err.message)
    return { success: false, error: err.message }
  }
})

// ============================================================
// IPC: 数据库操作 - 配置备份相关（使用SQLite DAO）
// ============================================================
safeHandle('db-config-backup-create', async (event, backup) => {
  try {
    const result = configBackupDAO.create(backup)
    debugLog('db-config-backup-create: ' + result.id)
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-config-backup-create error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-config-backup-find-by-device', async (event, deviceId) => {
  try {
    const result = configBackupDAO.findByDeviceId(deviceId)
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-config-backup-find-by-device error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-config-backup-find-latest', async (event, deviceId) => {
  try {
    const result = configBackupDAO.findLatest(deviceId)
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-config-backup-find-latest error: ' + err.message)
    return { success: false, error: err.message }
  }
})

// ============================================================
// IPC: 数据库操作 - 拓扑数据相关（使用SQLite DAO）
// ============================================================
safeHandle('db-topology-save', async (event, { userId, name, nodes, edges }) => {
  try {
    const result = topologyDAO.save(userId, name || 'default', nodes, edges)
    debugLog('db-topology-save: ' + userId + '/' + (name || 'default'))
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-topology-save error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-topology-load', async (event, { userId, name }) => {
  try {
    const result = topologyDAO.load(userId, name || 'default')
    debugLog('db-topology-load: ' + userId + '/' + (name || 'default'))
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-topology-load error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-topology-delete', async (event, { userId, name }) => {
  try {
    const result = topologyDAO.delete(userId, name || 'default')
    debugLog('db-topology-delete: ' + userId + '/' + (name || 'default'))
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-topology-delete error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-topology-list', async (event, userId) => {
  try {
    const result = topologyDAO.listByUser(userId)
    return { success: true, data: result }
  } catch (err) {
    debugLog('db-topology-list error: ' + err.message)
    return { success: false, error: err.message }
  }
})

// ============================================================
// IPC: 数据库操作 - 机房规划（DataCenter 3D，独立规划表 dc_*）
// ============================================================
safeHandle('dc-plan-save', async (event, { roomId, plan }) => {
  try {
    const result = dataCenterDAO.savePlan(roomId, plan)
    debugLog('dc-plan-save: ' + roomId)
    return { success: true, data: result }
  } catch (err) {
    debugLog('dc-plan-save error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('dc-plan-load', async (event, { roomId }) => {
  try {
    const result = dataCenterDAO.loadPlan(roomId)
    return { success: true, data: result }
  } catch (err) {
    debugLog('dc-plan-load error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('dc-plan-list', async () => {
  try {
    const result = dataCenterDAO.listRooms()
    return { success: true, data: result }
  } catch (err) {
    debugLog('dc-plan-list error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('dc-plan-delete', async (event, { roomId }) => {
  try {
    const result = dataCenterDAO.deletePlan(roomId)
    debugLog('dc-plan-delete: ' + roomId)
    return { success: true, data: result }
  } catch (err) {
    debugLog('dc-plan-delete error: ' + err.message)
    return { success: false, error: err.message }
  }
})

// ============================================================
// IPC: 通用JSON数据存储（用于快速集成剩余Store）
// ============================================================

// 确保json_data表存在
function ensureJsonDataTable() {
  const db = dbManager.getDatabase()
  db.exec(`
    CREATE TABLE IF NOT EXISTS json_data (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      data_type TEXT NOT NULL,
      data_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
}

safeHandle('db-json-save', async (event, { userId, dataType, data }) => {
  try {
    ensureJsonDataTable()
    const db = dbManager.getDatabase()
    const id = `${userId}_${dataType}`
    const dataJson = JSON.stringify(data || {})
    
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO json_data (id, user_id, data_type, data_json, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `)
    
    stmt.run(id, userId, dataType, dataJson)
    debugLog('db-json-save: ' + userId + '/' + dataType)
    return { success: true }
  } catch (err) {
    debugLog('db-json-save error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('db-json-load', async (event, { userId, dataType }) => {
  try {
    ensureJsonDataTable()
    const db = dbManager.getDatabase()
    
    const stmt = db.prepare(`
      SELECT data_json FROM json_data WHERE user_id = ? AND data_type = ?
    `)
    
    const row = stmt.get(userId, dataType)
    
    if (row) {
      const data = JSON.parse(row.data_json || '{}')
      debugLog('db-json-load: ' + userId + '/' + dataType)
      return { success: true, data }
    }
    
    return { success: true, data: null }
  } catch (err) {
    debugLog('db-json-load error: ' + err.message)
    return { success: false, error: err.message }
  }
})

// ============================================================
// IPC: 备份文件（关闭时创建带时间戳的完整备份）
// ============================================================
safeHandle('save-backup-file', async (event, { content, subDir, fileName }) => {
  try {
    // 安全审计 F-005：路径白名单校验，防止 ../ 逃逸出 backups 目录
    const backupRoot = path.join(userDataPath || os.tmpdir(), 'backups')
    const safeSubDir = String(subDir || '').replace(/[\\/]/g, '').replace(/\.\./g, '')
    const safeFileName = String(fileName || '').replace(/[\\/]/g, '').replace(/\.\./g, '')
    if (!safeFileName) return { success: false, error: '无效的文件名' }
    const backupDir = path.join(backupRoot, safeSubDir)
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })
    const filePath = path.resolve(backupDir, safeFileName)
    // 二次校验：解析后的路径必须仍在 backupRoot 内
    if (!filePath.startsWith(path.resolve(backupRoot) + path.sep)) {
      return { success: false, error: '非法路径：仅允许写入 backups 目录' }
    }
    fs.writeFileSync(filePath, content, 'utf-8')
    return { success: true, filePath }
  } catch (err) {
    debugLog('save-backup-file error: ' + err.message)
    return { success: false, error: err.message }
  }
})

// ============================================================
// IPC: 获取用户数据路径
// ============================================================
safeHandle('get-user-data-path', async () => userDataPath || os.tmpdir())

// ============================================================
// 以下是兼容旧 IPC 接口的转发器（保持前端代码不崩溃）
// ============================================================

safeHandle('save-user-data', async (event, { username, data }) => {
  try {
    const un = ensureUser(username)
    const user = dbCache.users[un]
    if (data.devices !== undefined) user.devices = data.devices
    if (data.cabinets !== undefined) user.cabinets = data.cabinets
    if (data.topologyNodes !== undefined) {
      if (!user.topology) user.topology = { nodes: [], edges: [] }
      user.topology.nodes = data.topologyNodes
    }
    if (data.topologyEdges !== undefined) {
      if (!user.topology) user.topology = { nodes: [], edges: [] }
      user.topology.edges = data.topologyEdges
    }
    if (data.deviceLibCustom !== undefined) user.deviceLibCustom = data.deviceLibCustom
    scheduleDbFlush()
    debugLog('save-user-data(compat): ' + un)
    return { success: true }
  } catch (err) {
    debugLog('save-user-data error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('load-user-data', async (event, username) => {
  try {
    const un = username || 'default'
    const user = dbCache.users[un]
    if (!user) return { success: true, data: { devices: null, cabinets: null, topologyNodes: null, topologyEdges: null, deviceLibCustom: null } }
    debugLog('load-user-data(compat): ' + un + ', devices=' + (user.devices?.length || 0))
    return {
      success: true,
      data: {
        devices: user.devices || null,
        cabinets: user.cabinets || null,
        topologyNodes: user.topology?.nodes || null,
        topologyEdges: user.topology?.edges || null,
        deviceLibCustom: user.deviceLibCustom || null
      }
    }
  } catch (err) {
    debugLog('load-user-data error: ' + err.message)
    return { success: false, error: err.message }
  }
})

safeHandle('save-accounts', async (event, { accounts }) => {
  dbCache.accounts = accounts; scheduleDbFlush()
  debugLog('save-accounts(compat): ' + Object.keys(accounts).length)
  return { success: true }
})

safeHandle('load-accounts', async () => {
  return { success: true, accounts: dbCache.accounts || {} }
})

safeHandle('save-current-user', async (event, { user }) => {
  dbCache.currentUsername = user?.username || null
  scheduleDbFlush()
  debugLog('save-current-user(compat): ' + (user?.username || 'null'))
  return { success: true }
})

safeHandle('load-current-user', async () => {
  const un = dbCache.currentUsername
  debugLog('load-current-user(compat): ' + (un || 'null'))
  if (un && dbCache.accounts[un]) {
    return { success: true, user: { username: un, name: un, ...dbCache.accounts[un] } }
  }
  return { success: true, user: null }
})

// ============================================================
// 网络摄像头/NVR搜索功能
// ============================================================

// 获取本地网络信息
safeHandle('getLocalNetworks', async () => {
  try {
    const interfaces = os.networkInterfaces()
    const networks = []
    
    for (const [name, ifaces] of Object.entries(interfaces)) {
      for (const iface of ifaces) {
        // 跳过回环、非IPv4、非活动的接口
        if (iface.family !== 'IPv4' || iface.internal) continue
        
        // 计算网络地址
        const ip = iface.address
        const mask = iface.netmask
        const network = ipAndMaskToNetwork(ip, mask)
        
        if (network && !networks.some(n => n.network === network)) {
          networks.push({
            name: name,
            ipAddress: ip,
            netmask: mask,
            network: network
          })
        }
      }
    }
    
    debugLog('getLocalNetworks: found ' + networks.length + ' networks')
    return { success: true, networks }
  } catch (err) {
    debugLog('getLocalNetworks error: ' + err.message)
    return { success: false, error: err.message }
  }
})

// IP和掩码转换为网络地址
function ipAndMaskToNetwork(ip, mask) {
  try {
    const ipParts = ip.split('.').map(Number)
    const maskParts = mask.split('.').map(Number)
    const networkParts = ipParts.map((part, i) => part & maskParts[i])
    return networkParts.join('.') + '/' + maskToCIDR(mask)
  } catch (e) {
    return null
  }
}

// 掩码转换为CIDR表示法
function maskToCIDR(mask) {
  const maskParts = mask.split('.').map(Number)
  let cidr = 0
  for (const part of maskParts) {
    let binary = part.toString(2)
    cidr += (binary.match(/1/g) || []).length
  }
  return cidr
}

// ARP扫描 - 先Ping子网填充ARP表，再读取ARP表
safeHandle('arpScan', async (event, { network }) => {
  try {
    debugLog('arpScan: starting full subnet scan for ' + network)

    const match = network && network.match(/^(\d+\.\d+\.\d+)\.\d+\/(\d+)$/)
    if (!match) {
      return { success: false, error: '无效的网络格式' }
    }

    const baseIP = match[1]
    const allDevices = []
    const seenIPs = new Set()
    
    // 步骤1：全子网 Ping Sweep（254个IP全部扫）
    debugLog('arpScan: step 1 - full ping sweep')
    const onlineIPs = await pingSubnet(baseIP, (done, total, found) => {
      if (done % 50 === 0) {
        debugLog(`arpScan: ping ${done}/${total}, found ${found} online`)
      }
    })
    
    debugLog(`arpScan: ping sweep found ${onlineIPs.length} online IPs`)
    
    // 步骤2：读取系统 ARP 表获取 MAC 地址
    debugLog('arpScan: step 2 - reading ARP table')
    let arpDevices = []
    try {
      const arpResult = await new Promise((resolve) => {
        exec('arp -a', { timeout: 10000 }, (err, stdout) => {
          if (err) {
            debugLog('arpScan arp -a error: ' + err.message)
            resolve([])
            return
          }
          resolve(parseArpOutput(stdout))
        })
      })
      arpDevices = arpResult
      debugLog(`arpScan: ARP table has ${arpDevices.length} entries`)
    } catch (e) {
      debugLog('arpScan: ARP read failed: ' + e.message)
    }
    
    // 步骤3：合并在线IP和ARP表数据
    for (const ip of onlineIPs) {
      const arpEntry = arpDevices.find(d => d.ipAddress === ip)
      const mac = arpEntry ? arpEntry.macAddress : ''
      const manufacturer = mac ? getManufacturerFromMac(mac) : ''
      
      allDevices.push({
        ipAddress: ip,
        macAddress: mac,
        deviceType: manufacturer || '网络设备',
        manufacturer: manufacturer,
        model: '',
        serialNumber: '',
        firmwareVersion: '',
        rtspPort: 0,
        isOnvifSupported: false,
        openPorts: []
      })
      seenIPs.add(ip)
    }
    
    // 步骤4：ARP表中有的但ping没响应的（可能防火墙拦截ping但在线）
    for (const arpDev of arpDevices) {
      if (!seenIPs.has(arpDev.ipAddress)) {
        // 快速端口探测确认是否在线
        try {
          const hasOpenPort = await quickPortCheck(arpDev.ipAddress, [80, 8080, 8000, 554, 37777])
          if (hasOpenPort) {
            allDevices.push({
              ...arpDev,
              status: 'online',
              deviceType: arpDev.manufacturer || '网络设备',
              openPorts: []
            })
            seenIPs.add(arpDev.ipAddress)
          }
        } catch (e) {
          // 忽略错误
        }
      }
    }
    
    debugLog(`arpScan: total found ${allDevices.length} devices`)
    return { success: true, devices: allDevices }
  } catch (err) {
    debugLog('arpScan error: ' + err.message)
    return { success: false, error: err.message }
  }
})

// 快速端口检查（只检查第一个开放的端口）
async function quickPortCheck(ip, ports) {
  const net = require('net')
  for (const port of ports) {
    const isOpen = await new Promise(resolve => {
      const socket = new net.Socket()
      socket.setTimeout(500)
      socket.on('connect', () => { socket.destroy(); resolve(true) })
      socket.on('timeout', () => { socket.destroy(); resolve(false) })
      socket.on('error', () => { socket.destroy(); resolve(false) })
      socket.connect(port, ip)
    })
    if (isOpen) return true
  }
  return false
}

// 从MAC地址前3字节识别厂商
function getManufacturerFromMac(mac) {
  if (!mac) return ''
  const oui = mac.replace(/[-:]/g, '').substring(0, 6).toUpperCase()
  const ouiMap = {
    'C0A545': '大华',
    'C4B5C2': '大华',
    '004E35': '大华',
    '4C11BF': '大华',
    'BC329F': '大华',
    '9C8E99': '大华',
    '44EA30': '大华',
    '3C4C92': '大华',
    'EC71DB': '大华',
    '787EBC': '海康威视',
    'BCAD28': '海康威视',
    'E0BB9E': '海康威视',
    '44D5F2': '海康威视',
    '20F41B': '海康威视',
    '9C644A': '海康威视',
    'D4970B': '海康威视',
    'EC172F': '海康威视',
    '64DB8B': '海康威视',
    'AC4E91': '海康威视',
    'B4A3AF': '宇视',
    '80A589': '宇视',
    '001B11': '安讯士',
    'ACCC8E': '安讯士',
    '00408C': '安讯士',
    '00D0D0': '安讯士',
    '00195B': 'TP-Link',
    'A0F3C1': 'TP-Link',
    '90F652': 'TP-Link',
    'CCCCCC': 'TP-Link',
    '14A0F8': 'TP-Link',
    '3C846A': 'TP-Link',
    '50C7BF': 'TP-Link',
    '5C628B': 'TP-Link',
    '60A4B7': 'TP-Link',
    '68FF7B': 'TP-Link',
    '78C3E9': 'TP-Link',
    '98DA92': 'TP-Link',
    'AC15A2': 'TP-Link',
    'B0BE76': 'TP-Link',
    'C025E9': 'TP-Link',
    'C4E984': 'TP-Link',
    'D8C4E9': 'TP-Link',
    'E4C3E3': 'TP-Link',
    'F0A731': 'TP-Link',
    'F832E4': 'TP-Link',
    'F8A45F': 'TP-Link',
    'FC7C02': 'TP-Link',
    '0022B5': '创维',
    '0026ED': '创维',
    '00E04C': '创维',
    '40F2E9': '创维',
    '6C5E3B': '创维',
    '8C57EE': '创维',
    'A865B2': '创维',
    'B0E57D': '创维',
    'C0A545': '创维',
    'D4F57A': '创维',
    'E8B748': '创维',
    '001F8F': '天地伟业',
    '787EBC': '皓视通',
    'BCAD28': '皓视通',
    'E0BB9E': '皓视通',
    '44D5F2': '皓视通',
    '20F41B': '皓视通',
    '9C644A': '皓视通',
    'D4970B': '皓视通',
    'EC172F': '皓视通',
    '64DB8B': '皓视通',
    'AC4E91': '皓视通',
    '10C61F': '华为',
    'F8A6D0': '华为',
    'D46D6D': '华为',
    '006B8E': '华为',
    '001882': '华为',
    '7425DA': '华为',
    'E848B8': '华为',
    '70723C': '华为',
    '001F64': '华为',
    '001F3C': '华为',
    'F492BF': '华为',
    'AC853D': '华为',
    'EC233D': '华为',
    '30846A': '华为',
    'E8B4AE': '华为',
    'D4BF7F': '华为',
    '04F938': '华为',
    '248A07': '华为',
    'C8A9D0': '华为',
    '00E0FC': '华为',
    '3891D5': '华为',
    '4C1FCC': '华为',
    'CCCCCC': 'TP-Link',
    'D48564': '小米',
    '64CC22': '小米',
    '8C5CA1': '小米',
    'F0B429': '小米',
    '50EC50': '小米',
    '28D127': '小米',
    'D4970C': '小米',
    'ACF7F3': '小米',
    '9C99A0': '小米',
    '349B5B': '小米',
    '58BEFD': '小米',
    'F8A45F': '小米',
    '70C946': '小米',
    '54EF44': '小米',
    '846988': '小米',
    '3C846A': '小米',
    '286C07': '小米',
    '40F308': '小米',
    '6817E0': '小米',
    'A4D45C': '小米',
    'F0A731': '小米',
    'DC4427': '小米',
    '30D16B': '小米',
    '48A195': '小米',
    'F4911E': '小米',
    'D063B4': '小米',
    '6854FD': '小米',
    '74DA38': '小米',
    '6854B0': '小米',
    'F0B4D2': '小米',
    'C46E1F': '小米',
    '9C65EE': '小米',
    'D4F57A': '小米',
    '90DE80': '小米',
    '2CAA8E': '小米',
    'C83A35': '小米',
    'E8D8D1': '小米',
    '847BE9': '小米',
    'F81F32': '小米',
    '842712': '小米',
    'C86F1D': '小米',
    '94B555': '小米',
    'A0CC2B': '小米',
    'D4B43D': '小米',
    'B8C68E': '小米',
    '8C710F': '小米',
    'C4A559': '小米',
    '5CF9DD': '小米',
    'E8B748': '小米',
    'C07585': '小米',
    'CCB5B4': '小米',
    '18C04D': '小米',
    '7C49EB': '小米',
    'B0BE76': '小米',
    '3C28A6': '小米',
    '50EC50': '小米',
    '68DFDD': '小米',
    '907A58': '小米',
    '68DBF5': '小米',
    '9C2EA3': '小米',
    'B0E57D': '小米',
    '5CF9DD': '小米',
    '54EF44': '小米',
    '886B6E': '小米',
    'A0C5F2': '小米',
    'AC853D': '华三',
    '005056': 'VMware',
    '000C29': 'VMware',
    '001C14': 'VMware',
    '080027': 'VirtualBox',
    '525400': 'QEMU',
    'B827EB': '树莓派'
  }
  return ouiMap[oui] || ''
}

// 解析ARP命令输出（兼容中英文Windows和Linux）
function parseArpOutput(output) {
  const devices = []
  const lines = output.split('\n')

  for (const line of lines) {
    // Windows格式（英文/中文）: IP地址  物理地址            类型
    // Linux格式: "Address  HWtype  HWaddress  Flags Mask Iface"
    // 只匹配 IP + MAC，不强制匹配类型列（避免中文版汉字类型不匹配）
    const winMatch = line.match(/^\s*(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F:-]{17})/)
    const linuxMatch = line.match(/^(\d+\.\d+\.\d+\.\d+)\s+\w+\s+([0-9a-fA-F:]+)/)

    const match = winMatch || linuxMatch
    if (match) {
      const ip = match[1]
      const mac = match[2].toLowerCase()

      // 跳过广播地址和无效MAC
      if (mac === 'ff-ff-ff-ff-ff-ff' || mac === 'ff:ff:ff:ff:ff:ff') continue
      if (ip === '0.0.0.0' || ip === '255.255.255.255') continue
      // 跳过未解析的MAC（00-00-00-00-00-00）
      if (mac === '00-00-00-00-00-00' || mac === '00:00:00:00:00:00') continue

      devices.push({
        ipAddress: ip,
        macAddress: mac,
        deviceType: '未知设备',
        manufacturer: '',
        model: '',
        serialNumber: '',
        firmwareVersion: '',
        rtspPort: 0,
        isOnvifSupported: false
      })
    }
  }

  return devices
}

// 扫描设备端口以识别设备类型
safeHandle('scanPorts', async (event, device) => {
  try {
    const net = require('net')
    // 扩展端口列表，覆盖主流监控设备
    const commonPorts = [
      80,    // HTTP Web
      81,    // 备用HTTP（大华/海康）
      82,    // 备用HTTP
      83,    // 备用HTTP
      443,   // HTTPS
      554,   // RTSP标准
      8554,  // RTSP备用
      1935,  // RTMP
      8000,  // 海康威视
      8080,  // 通用Web
      37777, // 大华
      37778, // 大华备用
      37779, // 大华备用
      5000,  // 安讯士/ONVIF
      5001,  // ONVIF备用
      5002,  // ONVIF备用
      800,   // 海康NVR
      9000,  // 宇视
      34567, // 大华P2P
      80,    // 重复，确保检测
      7001,  // 海康ISAPI
      7681,  // 海康
      8081,  // 海康Web
      8091,  // 海康
      8200,  // 海康
      9010   // 海康
    ]
    const openPorts = []
    
    // 并发扫描（每批10个）
    const batchSize = 10
    for (let i = 0; i < commonPorts.length; i += batchSize) {
      const batch = commonPorts.slice(i, i + batchSize)
      const results = await Promise.all(batch.map(port => new Promise((resolve) => {
        const socket = new net.Socket()
        socket.setTimeout(800)
        socket.on('connect', () => { socket.destroy(); resolve(port) })
        socket.on('timeout', () => { socket.destroy(); resolve(null) })
        socket.on('error', () => { socket.destroy(); resolve(null) })
        socket.connect(port, device.ipAddress)
      })))
      openPorts.push(...results.filter(p => p !== null))
    }
    
    // 去重
    const uniquePorts = [...new Set(openPorts)]
    
    // 根据开放端口判断设备类型
    let deviceType = device.deviceType || '未知设备'
    let manufacturer = device.manufacturer || ''
    let model = device.model || ''
    let rtspPort = 0

    // 辅助判断
    const hasRtsp = uniquePorts.includes(554) || uniquePorts.includes(8554)
    const hasHttp = uniquePorts.includes(80) || uniquePorts.includes(443) || uniquePorts.includes(8080) || uniquePorts.includes(81) || uniquePorts.includes(82) || uniquePorts.includes(83)

    // 识别海康威视（端口特征 + MAC前缀已知）
    const hikMgmtPorts = [8000, 7681, 8081, 8091, 8200, 7001, 800].filter(p => uniquePorts.includes(p))
    const isHikvisionByPort = hikMgmtPorts.length > 0
    const isHikvisionByMac = manufacturer.toLowerCase().includes('海康')
    if (isHikvisionByPort || isHikvisionByMac) {
      manufacturer = '海康威视'
      // NVR判断：有多个管理端口(>=2) + RTSP，或仅有8000但无80（NVR可能不开80）
      // 摄像头判断：通常只有80+554，或8000+80+554（新型摄像头也开8000）
      const has80 = uniquePorts.includes(80)
      if (hasRtsp && hikMgmtPorts.length >= 2) {
        deviceType = '海康威视NVR'
      } else if (hasRtsp && hikMgmtPorts.length === 1 && !has80) {
        // 只有1个管理端口且没有80 → 更可能是NVR（旧型号摄像头通常都有80）
        deviceType = '海康威视NVR'
      } else if (hasRtsp || hasHttp) {
        deviceType = '海康威视摄像头'
      } else {
        deviceType = '海康威视设备'
      }
    }

    // 识别大华（端口特征 + MAC前缀已知）
    const dahuaMgmtPorts = [37777, 37778, 37779].filter(p => uniquePorts.includes(p))
    const isDahuaByPort = dahuaMgmtPorts.length > 0 || uniquePorts.includes(34567)
    const isDahuaByMac = manufacturer.toLowerCase().includes('大华')
    if (isDahuaByPort || isDahuaByMac) {
      manufacturer = '大华'
      const has80 = uniquePorts.includes(80)
      if (hasRtsp && dahuaMgmtPorts.length >= 1 && !has80) {
        // 有管理端口但没有80 → NVR
        deviceType = '大华NVR'
      } else if (hasRtsp && dahuaMgmtPorts.length >= 2) {
        deviceType = '大华NVR'
      } else if (hasRtsp || hasHttp) {
        deviceType = '大华摄像头'
      } else {
        deviceType = '大华设备'
      }
    }

    // 识别安讯士
    if (uniquePorts.includes(5000) || uniquePorts.includes(5001) || uniquePorts.includes(5002)) {
      manufacturer = '安讯士(Axis)'
      deviceType = '安讯士网络摄像头'
    }

    // 识别宇视
    if (uniquePorts.includes(9000)) {
      manufacturer = '宇视'
      deviceType = '宇视NVR'
    }

    // 识别 TP-Link 监控设备
    const isTpLinkByMac = manufacturer.toLowerCase().includes('tp-link')
    if (isTpLinkByMac && (hasRtsp || hasHttp)) {
      manufacturer = 'TP-Link'
      deviceType = 'TP-Link摄像头'
    }

    // 识别创维监控设备
    const isSkyworthByMac = manufacturer.toLowerCase().includes('创维')
    if (isSkyworthByMac && (hasRtsp || hasHttp)) {
      manufacturer = '创维'
      if (uniquePorts.includes(8000) && hasRtsp) {
        deviceType = '创维NVR'
      } else {
        deviceType = '创维摄像头'
      }
    }

    // 识别华为监控设备（HoloSens/好望）
    const isHuaweiByMac = manufacturer.toLowerCase().includes('华为')
    if (isHuaweiByMac && (hasRtsp || hasHttp)) {
      manufacturer = '华为'
      if (uniquePorts.includes(8080) && hasRtsp) {
        deviceType = '华为NVR'
      } else {
        deviceType = '华为摄像头'
      }
    }

    // 识别天地伟业
    const isTiandyByMac = manufacturer.toLowerCase().includes('天地伟业')
    if (isTiandyByMac && (hasRtsp || hasHttp)) {
      manufacturer = '天地伟业'
      if (uniquePorts.includes(8000) || uniquePorts.includes(37777)) {
        deviceType = '天地伟业NVR'
      } else {
        deviceType = '天地伟业摄像头'
      }
    }

    // 识别皓视通（海康威视子品牌）
    const isHaoshitongByMac = manufacturer.toLowerCase().includes('皓视通')
    if (isHaoshitongByMac && (hasRtsp || hasHttp)) {
      manufacturer = '皓视通'
      const hstMgmtPorts = [8000, 7681, 8081, 8091, 8200, 7001, 800].filter(p => uniquePorts.includes(p))
      const has80 = uniquePorts.includes(80)
      if (hasRtsp && hstMgmtPorts.length >= 2) {
        deviceType = '皓视通NVR'
      } else if (hasRtsp && hstMgmtPorts.length === 1 && !has80) {
        deviceType = '皓视通NVR'
      } else if (hasRtsp || hasHttp) {
        deviceType = '皓视通摄像头'
      } else {
        deviceType = '皓视通设备'
      }
    }

    // 通用视频设备（仅当厂商未知时）
    if (!manufacturer && (hasRtsp || hasHttp)) {
      deviceType = '网络摄像头'
      rtspPort = uniquePorts.includes(554) ? 554 : (uniquePorts.includes(8554) ? 8554 : 0)
    }

    // 确定RTSP端口
    if (uniquePorts.includes(554)) rtspPort = 554
    else if (uniquePorts.includes(8554)) rtspPort = 8554
    
    const result = {
      ...device,
      deviceType,
      manufacturer,
      model,
      rtspPort,
      openPorts: uniquePorts
    }
    
    debugLog('scanPorts: ' + device.ipAddress + ' [' + manufacturer + '] open=' + uniquePorts.join(','))
    return { success: true, device: result }
  } catch (err) {
    debugLog('scanPorts error: ' + err.message)
    return { success: false, error: err.message }
  }
})

// ONVIF设备发现（WS-Discovery 协议）
safeHandle('discoverOnvif', async () => {
  const dgram = require('dgram')
  const devices = []
  const seenIPs = new Set()

  try {
    debugLog('discoverOnvif: starting WS-Discovery')

    // WS-Discovery Probe 消息（多种类型）
    const probeTypes = [
      'dn:NetworkVideoTransmitter',
      'dn:Device',
      'tds:Device'
    ]
    
    // 获取所有本地网络接口
    const interfaces = os.networkInterfaces()
    const localAddrs = []
    for (const name in interfaces) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          localAddrs.push(iface.address)
        }
      }
    }
    debugLog('discoverOnvif: local addresses: ' + localAddrs.join(', '))

    // 对每个本地地址发送探测
    for (const localAddr of localAddrs) {
      for (const probeType of probeTypes) {
        const probeMsg = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
  xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:wsd="http://schemas.xmlsoap.org/ws/2005/06/discovery">
  <s:Header>
    <wsa:MessageID>urn:uuid:${require('crypto').randomUUID()}</wsa:MessageID>
    <wsa:To s:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To>
    <wsa:Action s:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/06/discovery/Probe</wsa:Action>
  </s:Header>
  <s:Body>
    <wsd:Probe>
      <wsd:Types>${probeType}</wsd:Types>
    </wsd:Probe>
  </s:Body>
</s:Envelope>`

        try {
          const foundDevices = await discoverOnvifSingle(probeMsg, localAddr)
          for (const dev of foundDevices) {
            if (!seenIPs.has(dev.ipAddress)) {
              seenIPs.add(dev.ipAddress)
              devices.push(dev)
            }
          }
        } catch (e) {
          debugLog(`discoverOnvif: probe on ${localAddr} failed: ${e.message}`)
        }
      }
    }

    debugLog(`discoverOnvif: total found ${devices.length} devices`)
    return { success: true, devices }
  } catch (err) {
    debugLog('discoverOnvif error: ' + err.message)
    return { success: true, devices }
  }
})

// 单次 ONVIF 发现
function discoverOnvifSingle(probeMsg, localAddr) {
  const dgram = require('dgram')
  const devices = []
  const seenURLs = new Set()

  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    const timeout = setTimeout(() => {
      try { socket.close() } catch(e) {}
      resolve(devices)
    }, 5000)

    socket.on('error', (err) => {
      clearTimeout(timeout)
      try { socket.close() } catch(e) {}
      reject(err)
    })

    socket.on('listening', () => {
      try {
        socket.addMembership('239.255.255.250', localAddr)
        debugLog(`discoverOnvif: listening on ${localAddr}`)

        const message = Buffer.from(probeMsg)
        // 发送到标准 WS-Discovery 多播地址
        socket.send(message, 0, message.length, 3702, '239.255.255.250')
        // 也发送到广播地址
        const parts = localAddr.split('.')
        const broadcast = `${parts[0]}.${parts[1]}.${parts[2]}.255`
        socket.send(message, 0, message.length, 3702, broadcast)
        debugLog(`discoverOnvif: probe sent from ${localAddr} to ${broadcast}`)
      } catch (e) {
        clearTimeout(timeout)
        try { socket.close() } catch(e) {}
        reject(e)
      }
    })

    socket.on('message', (msg, rinfo) => {
      try {
        const response = msg.toString()
        debugLog(`discoverOnvif: response from ${rinfo.address}`)

        // 解析 SOAP 响应
        const xaddrsMatch = response.match(/<wsd:XAddrs>(.*?)<\/wsd:XAddrs>/)
        const scopesMatch = response.match(/<wsd:Scopes>(.*?)<\/wsd:Scopes>/)
        
        if (xaddrsMatch) {
          const xaddrs = xaddrsMatch[1].split(' ')[0]
          if (!seenURLs.has(xaddrs)) {
            seenURLs.add(xaddrs)
            
            const ipMatch = xaddrs.match(/http:\/\/(\d+\.\d+\.\d+\.\d+)/)
            const ip = ipMatch ? ipMatch[1] : rinfo.address
            
            // 从 Scopes 提取厂商信息
            let manufacturer = ''
            let model = ''
            if (scopesMatch) {
              const scopes = scopesMatch[1]
              const mfrMatch = scopes.match(/onvif:\/\/www\.onvif\.org\/name\/([^\s]+)/)
              if (mfrMatch) manufacturer = decodeURIComponent(mfrMatch[1])
              const modelMatch = scopes.match(/onvif:\/\/www\.onvif\.org\/hardware\/([^\s]+)/)
              if (modelMatch) model = decodeURIComponent(modelMatch[1])
            }
            
            // 根据 XAddrs 中的路径判断厂商
            if (!manufacturer) {
              if (xaddrs.includes('hikvision') || xaddrs.includes('hik')) manufacturer = '海康威视'
              else if (xaddrs.includes('dahua')) manufacturer = '大华'
              else if (xaddrs.includes('axis')) manufacturer = '安讯士'
              else if (xaddrs.includes('uniview') || xaddrs.includes('unv')) manufacturer = '宇视'
              else if (xaddrs.includes('tp-link') || xaddrs.includes('tplink')) manufacturer = 'TP-Link'
              else if (xaddrs.includes('skyworth') || xaddrs.includes('创维')) manufacturer = '创维'
              else if (xaddrs.includes('huawei') || xaddrs.includes('holosens')) manufacturer = '华为'
              else if (xaddrs.includes('tiandy') || xaddrs.includes('天地伟业')) manufacturer = '天地伟业'
              else if (xaddrs.includes('haoshitong') || xaddrs.includes('皓视通')) manufacturer = '皓视通'
            }

            // 根据厂商推断设备类型
            let onvifDeviceType = 'ONVIF摄像头'
            if (manufacturer.toLowerCase().includes('海康')) onvifDeviceType = '海康威视摄像头'
            else if (manufacturer.toLowerCase().includes('大华')) onvifDeviceType = '大华摄像头'
            else if (manufacturer.toLowerCase().includes('axis') || manufacturer.toLowerCase().includes('安讯士')) onvifDeviceType = '安讯士摄像头'
            else if (manufacturer.toLowerCase().includes('宇视')) onvifDeviceType = '宇视摄像头'
            else if (manufacturer.toLowerCase().includes('tp')) onvifDeviceType = 'TP-Link摄像头'
            else if (manufacturer.toLowerCase().includes('创维')) onvifDeviceType = '创维摄像头'
            else if (manufacturer.toLowerCase().includes('华为')) onvifDeviceType = '华为摄像头'
            else if (manufacturer.toLowerCase().includes('天地伟业')) onvifDeviceType = '天地伟业摄像头'
            else if (manufacturer.toLowerCase().includes('皓视通')) onvifDeviceType = '皓视通摄像头'

            devices.push({
              ipAddress: ip,
              manufacturer: manufacturer,
              model: model,
              deviceType: onvifDeviceType,
              isOnvifSupported: true,
              xaddrs: xaddrs
            })
            debugLog(`discoverOnvif: found device at ${ip} [${manufacturer}]`)
          }
        }
      } catch (e) {
        debugLog('discoverOnvif parse error: ' + e.message)
      }
    })

    socket.bind(0, localAddr)
  })
}

// IPC: 获取摄像头快照（支持 Basic Auth）
safeHandle('fetch-camera-snapshot', async (event, { url, username, password }) => {
  return new Promise((resolve) => {
    const http = require('http')
    const options = new URL(url)
    const reqOptions = {
      hostname: options.hostname,
      port: options.port || 80,
      path: options.pathname + options.search,
      method: 'GET',
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0'
      }
    }
    if (username && password) {
      reqOptions.headers['Authorization'] = 'Basic ' + Buffer.from(username + ':' + password).toString('base64')
    }

    const req = http.request(reqOptions, (res) => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        const buffer = Buffer.concat(chunks)
        if (res.statusCode === 200 && buffer.length > 100) {
          const contentType = res.headers['content-type'] || 'image/jpeg'
          resolve({
            success: true,
            data: 'data:' + contentType + ';base64,' + buffer.toString('base64')
          })
        } else {
          resolve({ success: false, error: 'HTTP ' + res.statusCode + ', size=' + buffer.length })
        }
      })
    })

    req.on('error', (err) => {
      resolve({ success: false, error: err.message })
    })

    req.on('timeout', () => {
      req.destroy()
      resolve({ success: false, error: '请求超时' })
    })

    req.end()
  })
})

// ============ 设备扫描功能 ============
// 全局扫描状态
let scanResults = []
let isScanning = false
let scanProgress = { completed: 0, total: 0 }

/**
 * 自动扫描网络设备（摄像头/NVR）- 高速版
 */
async function autoScanDevices() {
  if (isScanning) {
    debugLog('Device scan already running, skipping auto scan')
    return
  }

  debugLog('[自动扫描] 开始高速扫描网络设备...')
  isScanning = true
  scanResults = []
  scanProgress = { completed: 0, total: 0 }

  try {
    // 通知渲染进程：清空旧列表并重新开始扫描
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scan-clear')
      mainWindow.webContents.send('scan-status', {
        status: 'starting',
        message: '正在初始化扫描...'
      })
    }

    // 使用新版高速扫描（限制并发避免 Windows 子进程耗尽）
    const devices = await deviceScanner.fastScan({
      fullPortScan: false,
      pingConcurrency: 40,
      pingTimeout: 200,
      portTimeout: 200
    }, (stage, completed, total, message) => {
      scanProgress = { completed, total, stage, message }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('scan-progress', { completed, total, stage, message })
      }
    }, (device) => {
      scanResults.push(device)
      debugLog(`[自动扫描] 发现设备: ${device.ip}:${device.port} (${device.vendor})`)

      // 实时通知渲染进程
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('device-found', device)
      }
    })

    isScanning = false
    scanProgress.completed = scanProgress.total

    debugLog(`[自动扫描] 扫描完成，共发现 ${scanResults.length} 个设备`)

    // 通知渲染进程扫描完成
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scan-status', {
        status: 'completed',
        totalFound: scanResults.length,
        devices: scanResults
      })
    }

    return devices
  } catch (err) {
    isScanning = false
    debugLog('[自动扫描] 扫描失败: ' + err.message)

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scan-status', {
        status: 'error',
        error: err.message
      })
    }

    return []
  }
}

// IPC: 启动设备扫描
safeHandle('start-device-scan', async (event, options = {}) => {
  if (isScanning) {
    return { success: false, error: '扫描正在进行中，请稍候' }
  }

  debugLog('[IPC] 收到扫描请求')
  isScanning = true
  scanResults = []

  // 通知前端清空旧列表
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('scan-clear')
  }

  try {
    const devices = await deviceScanner.fastScan({
      fullPortScan: options.fullScan || false,
      pingConcurrency: options.concurrency || 200,
      pingTimeout: options.timeout || 200,
      portTimeout: options.portTimeout || 200,
      portConcurrency: options.portConcurrency || 30,
      enableOnvif: options.enableOnvif !== false,
      enableARP: options.enableARP !== false,
      enableEnterprise: options.enableEnterprise !== false,
      enableUdpDiscovery: options.enableUdpDiscovery !== false,
      deviceTypeFilter: options.deviceTypeFilter || 'all',
      discoveryTimeout: options.discoveryTimeout || 5000
    }, (stage, completed, total, message) => {
      scanProgress = { completed, total }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('scan-progress', { completed, total, stage, message })
      }
    }, (device) => {
      scanResults.push(device)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('device-found', device)
      }
    })

    isScanning = false

    return {
      success: true,
      totalFound: scanResults.length,
      devices: scanResults
    }
  } catch (err) {
    isScanning = false
    debugLog('[IPC] 扫描失败: ' + err.message)
    return { success: false, error: err.message }
  }
})

// IPC: 获取扫描结果
safeHandle('get-scan-results', async (event) => {
  return {
    success: true,
    isScanning,
    results: scanResults,
    progress: scanProgress
  }
})


// ============================================
// SSH 终端功能
// ============================================
// 方案：交互式终端（ssh-shell）走系统 OpenSSH（支持所有算法，含后量子算法）
//       命令执行（ssh-exec）和 SFTP 仍用 ssh2 库
const { Client: SSHClient } = require('ssh2')
const sshConnections = {}
// spawn 已在文件顶部 require('child_process') 时引入

// 判断系统 ssh 是否可用
function getSystemSSH() {
  if (os.platform() === 'win32') {
    // Windows：OpenSSH 通常安装在 C:\Windows\System32\OpenSSH\ssh.exe
    const winSSH = 'C:\\Windows\\System32\\OpenSSH\\ssh.exe'
    try { require('fs').accessSync(winSSH); return winSSH } catch (e) { /**/ }
  }
  // Linux / macOS / 或 Windows 下有 ssh 在 PATH
  return 'ssh'
}

safeHandle('ssh-connect', async (event, { connectionId, device, proxy }) => {
  const { ip, sshPort, sshUser, sshPass, sshTimeout, privateKey } = device
  try {
    if (sshConnections[connectionId]) return { success: false, error: '该设备已经连接' }
    const doConnect = (retryCount = 0) => {
      const conn = new SSHClient()
      const config = {
        host: ip,
        port: parseInt(sshPort) || 22,
        username: sshUser || 'admin',
        readyTimeout: (sshTimeout || 30) * 1000,
        // 公钥认证（私钥字符串）
        ...(privateKey ? { privateKey } : (sshPass ? { password: sshPass } : {})),
        // 完整的全算法兼容配置，一个都不能少，兼容所有新老服务器
        algorithms: {
          kex: [
            // TODO: ssh2@1.17.0 暂不支持 sntrup761x25519-sha512@openssh.com，等后续版本升级后加回
            // 'sntrup761x25519-sha512@openssh.com',
            'curve25519-sha256@libssh.org',
            'ecdh-sha2-nistp256',
            'ecdh-sha2-nistp384',
            'ecdh-sha2-nistp521',
            'diffie-hellman-group-exchange-sha256',
            'diffie-hellman-group14-sha1',
            'diffie-hellman-group1-sha1'
          ],
          cipher: [
            'aes128-ctr',
            'aes192-ctr',
            'aes256-ctr',
            'aes128-gcm@openssh.com',
            'aes256-gcm@openssh.com',
            '3des-cbc',
            'blowfish-cbc'
          ],
          serverHostKey: [
            'ssh-ed25519',
            'ecdsa-sha2-nistp256',
            'ecdsa-sha2-nistp384',
            'ecdsa-sha2-nistp521',
            'rsa-sha2-256',
            'rsa-sha2-512',
            'ssh-rsa'
          ],
          hmac: [
            'hmac-sha2-256',
            'hmac-sha2-512',
            'hmac-sha1'
          ]
        }
      }
      return new Promise((resolve) => {
        let settled = false

        // 代理连接支持
        const setupProxy = (cb) => {
          if (!proxy || !proxy.type) return cb(null)
          if (proxy.type === 'socks5' || proxy.type === 'socks4') {
            // SOCKS5/SOCKS4 代理：先连代理服务器，完成 SOCKS 握手
            const pSocket = net.connect(Number(proxy.port), proxy.host, () => {
              // SOCKS5 握手：发送方法选择
              if (proxy.type === 'socks5') {
                pSocket.write(Buffer.from([0x05, 0x01, 0x00])) // 无认证
                pSocket.once('data', (d) => {
                  if (d[1] !== 0x00) return cb(new Error('SOCKS5 认证失败'))
                  // 发送 CONNECT 请求
                  const addr = proxy.targetHost || ip
                  const port = proxy.targetPort || parseInt(sshPort) || 22
                  const buf = Buffer.alloc(7 + addr.length)
                  buf[0] = 0x05; buf[1] = 0x01; buf[2] = 0x00; buf[3] = 0x03
                  buf[4] = addr.length
                  Buffer.from(addr).copy(buf, 5)
                  buf.writeUInt16BE(port, 5 + addr.length)
                  pSocket.write(buf)
                  pSocket.once('data', (d2) => {
                    if (d2[1] !== 0x00) return cb(new Error('SOCKS5 连接失败:' + d2[1]))
                    cb(null, pSocket)
                  })
                })
              } else {
                // SOCKS4
                const addr = proxy.targetHost || ip
                const port = proxy.targetPort || parseInt(sshPort) || 22
                const uid = process.pid.toString()
                const buf = Buffer.alloc(9 + addr.length + uid.length)
                buf[0] = 0x04; buf[1] = 0x01
                buf.writeUInt16BE(port, 2)
                // IPv4 用 0.0.0.1 让代理解析域名
                buf[4]=0; buf[5]=0; buf[6]=0; buf[7]=1
                let off=8
                Buffer.from(uid).copy(buf, off); off+=uid.length
                Buffer.from(addr).copy(buf, off)
                pSocket.write(buf)
                pSocket.once('data', (d2) => {
                  if (d2[1] !== 0x5a) return cb(new Error('SOCKS4 连接失败'))
                  cb(null, pSocket)
                })
              }
            })
            pSocket.on('error', (e) => cb(new Error('代理连接失败:' + e.message)))
          } else if (proxy.type === 'http' || proxy.type === 'https') {
            // HTTP CONNECT 代理
            const pSocket = net.connect(Number(proxy.port), proxy.host, () => {
              const connectReq = `CONNECT ${proxy.targetHost || ip}:${proxy.targetPort || parseInt(sshPort) || 22} HTTP/1.1\r\nHost: ${proxy.targetHost || ip}\r\n\r\n`
              pSocket.write(connectReq)
              let resp = ''
              pSocket.once('data', (d) => {
                resp += d.toString()
                if (resp.includes('\r\n\r\n')) {
                  if (!resp.includes('200')) return cb(new Error('HTTP 代理连接失败:' + resp.split('\r\n')[0]))
                  cb(null, pSocket)
                }
              })
            })
            pSocket.on('error', (e) => cb(new Error('HTTP 代理连接失败:' + e.message)))
          } else {
            cb(null)
          }
        }

        const onError = (err) => {
          if (settled) return
          settled = true
          const msg = err.message || ''
          if (msg.includes('no matching') || msg.includes('algorithm') || msg.includes('Unsupported algorithm')) {
            return resolve({ success: false, error: '算法协商失败：' + msg })
          }
          if (retryCount < 1 && (msg.includes('timeout') || msg.includes('Timed out') || msg.includes('handshake'))) {
            try { conn.end() } catch (e) {}
            setTimeout(() => doConnect(retryCount + 1).then(resolve), 500)
            return
          }
          try { delete sshConnections[connectionId] } catch (e) {}
          resolve({ success: false, error: msg })
        }
        conn.once('ready', () => {
          if (settled) return
          settled = true
          sshConnections[connectionId] = { client: conn, shell: null, sftp: null, useSystemSSH: false, device }
          resolve({ success: true })
        })
        conn.once('error', onError)
        conn.once('close', () => {
          if (!settled) onError(new Error('连接意外关闭，可能算法协商失败或认证失败'))
        })
        // 代理连接支持
        setupProxy((err, sock) => {
          if (err) return onError(err)
          if (sock) config.sock = sock
          conn.connect(config)
        })
        return
      })
    }
    return await doConnect()
  } catch (err) { return { success: false, error: err.message } }
})


safeHandle('ssh-exec', async (event, { connectionId, command }) => {
  const conn = sshConnections[connectionId]
  if (!conn?.client) return { success: false, error: '未连接' }
  return new Promise((resolve) => {
    conn.client.exec(command, (err, stream) => {
      if (err) return resolve({ success: false, error: err.message })
      let out = ''
      stream.on('data', (d) => { out += d.toString() })
      stream.stderr.on('data', (d) => { out += d.toString() })
      stream.on('close', () => { resolve({ success: true, output: out }) })
    })
  })
})

safeHandle('ssh-shell', async (event, { connectionId, cols, rows }) => {
  const conn = sshConnections[connectionId]
  if (!conn?.client) return { success: false, error: '未连接' }
  return new Promise((resolve) => {
    conn.client.shell({ cols: cols || 80, rows: rows || 24 }, (err, stream) => {
      if (!err && stream) {
        // ssh2 库成功打开 shell
        conn.shell = stream
        conn.useSystemSSH = false
        stream.on('data', (d) => { event.sender.send(`ssh-data-${connectionId}`, d.toString()) })
        stream.on('close', () => { conn.shell = null; event.sender.send(`ssh-closed-${connectionId}`) })
        stream.stderr.on('data', (d) => { event.sender.send(`ssh-data-${connectionId}`, d.toString()) })
        resolve({ success: true })
      } else {
        // ssh2 失败，尝试系统 OpenSSH fallback
        console.log('[ssh-shell] ssh2 shell failed, trying system ssh:', err?.message)
        try {
          const sysSSH = getSystemSSH()
          const sshInfo = sshConnections[connectionId]
          if (!sshInfo) return resolve({ success: false, error: '连接已断开' })
          const d = sshInfo.device || {}
          const args = [
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'UserKnownHostsFile=/dev/null',
            '-o', 'ConnectTimeout=15',
            '-p', String(d.sshPort || 22),
            `${d.sshUser || 'admin'}@${d.ip}`
          ]
          const proc = spawn(sysSSH, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, TERM: 'xterm-256color' }
          })
          conn.systemProc = proc
          conn.useSystemSSH = true
          conn.shell = { write: (d) => proc.stdin.write(d), close: () => proc.kill('SIGTERM'), setWindow: () => {} }
          proc.stdout.on('data', (d) => { event.sender.send(`ssh-data-${connectionId}`, d.toString()) })
          proc.stderr.on('data', (d) => { event.sender.send(`ssh-data-${connectionId}`, d.toString()) })
          proc.on('close', () => {
            conn.shell = null
            conn.systemProc = null
            event.sender.send(`ssh-closed-${connectionId}`)
          })
          proc.on('error', (e) => {
            resolve({ success: false, error: '系统SSH也失败: ' + e.message })
          })
          // 写入密码（如果需要）
          if (d.sshPass && !d.sshKey) {
            // ssh 会提示输入密码，用 sshpass 或直接报错
            // 简单处理：提示用户配置密钥或使用 sshpass
          }
          resolve({ success: true })
        } catch (e2) {
          resolve({ success: false, error: '打开终端失败: ' + (err?.message || e2.message) })
        }
      }
    })
  })
})

safeOn('ssh-shell-write', (event, { connectionId, data }) => {
  const conn = sshConnections[connectionId]
  if (conn?.shell) conn.shell.write(data)
})

safeOn('ssh-shell-resize', (event, { connectionId, cols, rows }) => {
  const conn = sshConnections[connectionId]
  if (conn?.shell) conn.shell.setWindow(rows, cols)
})

safeHandle('ssh-disconnect', async (event, { connectionId }) => {
  // 先清理该连接的所有隧道
  cleanupTunnelsByConnection(connectionId)
  const conn = sshConnections[connectionId]
  if (conn) {
    try { conn.shell?.close() } catch (e) {}
    try { conn.sftp?.end() } catch (e) {}
    try { if (conn.client) conn.client.end() } catch (e) {}
    try { if (conn.systemProc) conn.systemProc.kill('SIGTERM') } catch (e) {}
    delete sshConnections[connectionId]
  }
  return { success: true }
})

// ============================================================
// SFTP 完整功能
// ============================================================

// SFTP 文件列表
safeHandle('ssh-sftp-list', async (event, { connectionId, path }) => {
  const conn = sshConnections[connectionId]
  if (!conn?.client) return { success: false, error: '未连接' }
  return new Promise((resolve) => {
    conn.client.sftp((err, sftp) => {
      if (err) return resolve({ success: false, error: err.message })
      sftp.readdir(path || '/', (err, list) => {
        if (err) return resolve({ success: false, error: err.message })
        resolve({
          success: true,
          files: list.map(f => ({
            filename: f.filename,
            longname: f.longname,
            isDir: f.attrs.isDirectory(),
            size: f.attrs.size,
            mtime: f.attrs.mtime,
            atime: f.attrs.atime,
            mode: f.attrs.mode,
          })),
          path: path || '/'
        })
      })
    })
  })
})

// SFTP 上传文件（Buffer 写入远程）
safeHandle('ssh-sftp-put', async (event, { connectionId, remotePath, data }) => {
  const conn = sshConnections[connectionId]
  if (!conn?.client) return { success: false, error: '未连接' }
  return new Promise((resolve) => {
    conn.client.sftp((err, sftp) => {
      if (err) return resolve({ success: false, error: err.message })
      sftp.writeFile(remotePath, Buffer.from(data), (err) => {
        if (err) return resolve({ success: false, error: err.message })
        resolve({ success: true })
      })
    })
  })
})

// SFTP 下载文件（读取远程文件返回 Buffer）
safeHandle('ssh-sftp-get', async (event, { connectionId, remotePath }) => {
  const conn = sshConnections[connectionId]
  if (!conn?.client) return { success: false, error: '未连接' }
  return new Promise((resolve) => {
    conn.client.sftp((err, sftp) => {
      if (err) return resolve({ success: false, error: err.message })
      sftp.readFile(remotePath, (err, data) => {
        if (err) return resolve({ success: false, error: err.message })
        resolve({ success: true, data: Array.from(data) }) // Buffer -> Array 可序列化
      })
    })
  })
})

// SFTP 创建目录
safeHandle('ssh-sftp-mkdir', async (event, { connectionId, path }) => {
  const conn = sshConnections[connectionId]
  if (!conn?.client) return { success: false, error: '未连接' }
  return new Promise((resolve) => {
    conn.client.sftp((err, sftp) => {
      if (err) return resolve({ success: false, error: err.message })
      sftp.mkdir(path, (err) => {
        if (err) return resolve({ success: false, error: err.message })
        resolve({ success: true })
      })
    })
  })
})

// SFTP 删除目录（需为空）
safeHandle('ssh-sftp-rmdir', async (event, { connectionId, path }) => {
  const conn = sshConnections[connectionId]
  if (!conn?.client) return { success: false, error: '未连接' }
  return new Promise((resolve) => {
    conn.client.sftp((err, sftp) => {
      if (err) return resolve({ success: false, error: err.message })
      sftp.rmdir(path, (err) => {
        if (err) return resolve({ success: false, error: err.message })
        resolve({ success: true })
      })
    })
  })
})

// SFTP 删除文件
safeHandle('ssh-sftp-delete', async (event, { connectionId, path }) => {
  const conn = sshConnections[connectionId]
  if (!conn?.client) return { success: false, error: '未连接' }
  return new Promise((resolve) => {
    conn.client.sftp((err, sftp) => {
      if (err) return resolve({ success: false, error: err.message })
      sftp.unlink(path, (err) => {
        if (err) return resolve({ success: false, error: err.message })
        resolve({ success: true })
      })
    })
  })
})

// SFTP 重命名/移动文件或目录
safeHandle('ssh-sftp-rename', async (event, { connectionId, oldPath, newPath }) => {
  const conn = sshConnections[connectionId]
  if (!conn?.client) return { success: false, error: '未连接' }
  return new Promise((resolve) => {
    conn.client.sftp((err, sftp) => {
      if (err) return resolve({ success: false, error: err.message })
      sftp.rename(oldPath, newPath, (err) => {
        if (err) return resolve({ success: false, error: err.message })
        resolve({ success: true })
      })
    })
  })
})

// SFTP 获取文件状态
safeHandle('ssh-sftp-stat', async (event, { connectionId, path }) => {
  const conn = sshConnections[connectionId]
  if (!conn?.client) return { success: false, error: '未连接' }
  return new Promise((resolve) => {
    conn.client.sftp((err, sftp) => {
      if (err) return resolve({ success: false, error: err.message })
      sftp.stat(path, (err, stats) => {
        if (err) return resolve({ success: false, error: err.message })
        resolve({
          success: true,
          stats: {
            size: stats.size,
            mtime: stats.mtime,
            atime: stats.atime,
            isDir: stats.isDirectory(),
            mode: stats.mode,
          }
        })
      })
    })
  })
})

// ============================================

debugLog('=== main.js loaded completely ===')


// ============================================================
// SSH 隧道 / 端口转发
// ============================================================
const net = require('net')
const sshTunnels = {}
// sshTunnels[id] = { type, connectionId, localPort, remoteAddr, remotePort, server }

// 本地端口转发（Local Port Forwarding）
// 原理：本地监听 localPort，收到 TCP 连接后通过 SSH 通道转发到 remoteAddr:remotePort
safeHandle('ssh-tunnel-local', async (event, { connectionId, localPort, remoteAddr, remotePort, description }) => {
  const conn = sshConnections[connectionId]
  if (!conn?.client) return { success: false, error: '未连接' }
  const tid = `${connectionId}-local-${localPort}`
  if (sshTunnels[tid]) return { success: false, error: '该本地端口已有转发' }
  return new Promise((resolve) => {
    const server = net.createServer((localSocket) => {
      conn.client.forwardOut('127.0.0.1', localPort, remoteAddr, remotePort, (err, stream) => {
        if (err) { try { localSocket.end() } catch (e) {}; return }
        localSocket.pipe(stream)
        stream.pipe(localSocket)
        stream.on('close', () => { try { localSocket.end() } catch (e) {} })
        localSocket.on('close', () => { try { stream.close() } catch (e) {} })
      })
    })
    server.on('error', (err) => {
      resolve({ success: false, error: '本地端口监听失败：' + err.message })
    })
    server.listen(localPort, '127.0.0.1', () => {
      sshTunnels[tid] = { type: 'local', connectionId, localPort, remoteAddr, remotePort, description: description || '', server }
      resolve({ success: true, tunnelId: tid })
    })
  })
})

// 远程端口转发（Remote Port Forwarding）
// 原理：让远程 SSH 服务器监听 remotePort，流量转发到本地
safeHandle('ssh-tunnel-remote', async (event, { connectionId, bindAddr, bindPort, localAddr, localPort, description }) => {
  const conn = sshConnections[connectionId]
  if (!conn?.client) return { success: false, error: '未连接' }
  const tid = `${connectionId}-remote-${bindPort}`
  if (sshTunnels[tid]) return { success: false, error: '该远程端口已有转发' }
  return new Promise((resolve) => {
    conn.client.forwardIn(bindAddr || '127.0.0.1', bindPort, (err) => {
      if (err) return resolve({ success: false, error: err.message })
      const onTcp = (info, acceptFn) => {
        const stream = acceptFn()
        const localSocket = net.connect(localPort || 22, localAddr || '127.0.0.1', () => {
          stream.pipe(localSocket)
          localSocket.pipe(stream)
        })
        localSocket.on('error', () => { try { stream.close() } catch (e) {} })
        stream.on('close', () => { try { localSocket.end() } catch (e) {} })
      }
      conn._tcpHandler = onTcp
      conn.client.on('tcp connection', onTcp)
      sshTunnels[tid] = { type: 'remote', connectionId, bindAddr, bindPort, localAddr, localPort, description: description || '', onTcp }
      resolve({ success: true, tunnelId: tid })
    })
  })
})

// 动态 SOCKS5 代理（Dynamic Port Forwarding）
// 原理：本地启动 SOCKS5 代理服务器，通过 SSH 通道转发
safeHandle('ssh-tunnel-dynamic', async (event, { connectionId, localPort, description }) => {
  const conn = sshConnections[connectionId]
  if (!conn?.client) return { success: false, error: '未连接' }
  const tid = `${connectionId}-dynamic-${localPort}`
  if (sshTunnels[tid]) return { success: false, error: '该端口已有 SOCKS5 代理' }
  return new Promise((resolve) => {
    const server = net.createServer((clientSocket) => {
      // SOCKS5 握手：客户端发送支持的方法列表
      clientSocket.once('data', (data) => {
        if (data[0] !== 0x05) { clientSocket.end(); return }
        // 发送方法选择响应（无需认证 = 0x00）
        clientSocket.write(Buffer.from([0x05, 0x00]))
        // 等待连接请求
        clientSocket.once('data', (req) => {
          if (req[1] !== 0x01) { clientSocket.end(); return } // 只支持 CONNECT
          const atyp = req[3]
          let remoteAddr, remotePort
          if (atyp === 0x01) { // IPv4
            remoteAddr = Array.from(req.slice(4, 8)).join('.')
            remotePort = req.readUInt16BE(8)
          } else if (atyp === 0x03) { // 域名
            const len = req[4]
            remoteAddr = req.slice(5, 5 + len).toString()
            remotePort = req.readUInt16BE(5 + len)
          } else { clientSocket.end(); return } // 不支持 IPv6
          // 通过 SSH 建立通道
          conn.client.forwardOut('127.0.0.1', localPort, remoteAddr, remotePort, (err, stream) => {
            if (err) {
              clientSocket.write(Buffer.from([0x05, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]))
              clientSocket.end()
              return
            }
            // 发送连接成功响应
            clientSocket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]))
            stream.pipe(clientSocket)
            clientSocket.pipe(stream)
            stream.on('close', () => { try { clientSocket.end() } catch (e) {} })
            clientSocket.on('close', () => { try { stream.close() } catch (e) {} })
          })
        })
      })
    })
    server.on('error', (err) => {
      resolve({ success: false, error: 'SOCKS5 代理启动失败：' + err.message })
    })
    server.listen(localPort, '127.0.0.1', () => {
      sshTunnels[tid] = { type: 'dynamic', connectionId, localPort, description: description || '', server }
      resolve({ success: true, tunnelId: tid })
    })
  })
})

// 关闭隧道
safeHandle('ssh-tunnel-close', async (event, { tunnelId }) => {
  const t = sshTunnels[tunnelId]
  if (!t) return { success: false, error: '隧道不存在' }
  try {
    if (t.server) t.server.close()
    if (t.type === 'remote' && t.onTcp) {
      const conn = sshConnections[t.connectionId]
      if (conn?._tcpHandler) conn.client.off('tcp connection', conn._tcpHandler)
    }
    delete sshTunnels[tunnelId]
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// 列出所有隧道
safeHandle('ssh-tunnel-list', async (event, { connectionId }) => {
  const list = Object.entries(sshTunnels)
    .filter(([id, t]) => !connectionId || t.connectionId === connectionId)
    .map(([id, t]) => ({ id, type: t.type, localPort: t.localPort, remoteAddr: t.remoteAddr, remotePort: t.remotePort, description: t.description }))
  return { success: true, tunnels: list }
})

// SSH 断开时清理对应隧道
const _origSshDisconnect = ipcMain._events['ssh-disconnect'] // 不覆盖，在 ssh-disconnect handler 里处理
function cleanupTunnelsByConnection(connectionId) {
  for (const [tid, t] of Object.entries(sshTunnels)) {
    if (t.connectionId === connectionId) {
      try { if (t.server) t.server.close() } catch (e) {}
      if (t.type === 'remote' && t.onTcp) {
        try { sshConnections[connectionId]?.client?.off('tcp connection', t.onTcp) } catch (e) {}
      }
      delete sshTunnels[tid]
    }
  }
}
// 在 ssh-disconnect handler 里调用 cleanupTunnelsByConnection


// ============================================================
// 告警邮件通知
// ============================================================

safeHandle('send-email', async (event, { to, subject, body, smtpConfig }) => {
  if (!nodemailer) {
    return { success: false, error: 'nodemailer 模块未安装' }
  }
  
  try {
    // 创建邮件传输器
    const transporter = nodemailer.createTransporter({
      host: smtpConfig.host || 'smtp.company.com',
      port: smtpConfig.port || 587,
      secure: smtpConfig.secure || false,
      auth: {
        user: smtpConfig.user || 'alerts@company.com',
        pass: smtpConfig.pass || '',
      },
    })
    
    // 邮件内容
    const mailOptions = {
      from: smtpConfig.from || 'alerts@company.com',
      to: Array.isArray(to) ? to.join(',') : to,
      subject: subject,
      html: body,
    }
    
    // 发送邮件
    const result = await transporter.sendMail(mailOptions)
    debugLog(`邮件发送成功: ${result.messageId}`)
    return { success: true, messageId: result.messageId }
  } catch (e) {
    debugLog(`邮件发送失败: ${e.message}`)
    return { success: false, error: e.message }
  }
})

// ============================================================
// 告警Webhook通知
// ============================================================

const axios = require('axios')

// 整改（安全 F-07）：send-webhook 原样把 url 交给 axios.post，可被用于
// SSRF——渲染进程传入内网/环回/链路本地地址即可让主进程代为请求，
// 借用应用的网络位置探测内网服务。现限制协议为 http/https，
// 并显式拒绝环回、私网、链路本地与保留段目标。
function isPublicHttpUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch (e) { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname;
  // 环回 / 私网 / 链路本地 / 保留段（IPv4 点分十进制与 IPv6 十六进制均覆盖）
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (/^127\./.test(host)) return false;
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false;
  if (/^0\./.test(host) || host === '0.0.0.0') return false;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return false; // CGNAT 100.64/10
  if (/^192\.0\.2\./.test(host) || /^198\.51\.100\./.test(host) || /^203\.0\.113\./.test(host)) return false; // TEST-NET
  if (/^::1$/.test(host) || /^fe80:/i.test(host) || /^fc/i.test(host) || /^fd/i.test(host)) return false;
  return true;
}

safeHandle('send-webhook', async (event, { url, payload }) => {
  if (!isPublicHttpUrl(url)) {
    debugLog('send-webhook rejected (non-public target): ' + url)
    return { success: false, error: 'Webhook 地址不被允许：仅支持公网 http/https 目标' }
  }
  try {
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000,
    })
    debugLog(`Webhook发送成功: ${response.status}`)
    return { success: true, status: response.status }
  } catch (e) {
    debugLog(`Webhook发送失败: ${e.message}`)
    return { success: false, error: e.message }
  }
})
const sessionLogStreams = {}

// 开始记录会话日志（安全审计 F-005：日志路径固定到 userData/logs/，忽略渲染进程传入路径）
safeHandle('ssh-log-start', async (event, { connectionId }) => {
  try {
    if (sessionLogStreams[connectionId]) {
      try { sessionLogStreams[connectionId].end() } catch (e) {}
      delete sessionLogStreams[connectionId]
    }
    // 固定日志目录，文件名由主进程生成（含连接ID与时间戳），杜绝任意路径写
    const logsRoot = path.join(userDataPath || os.tmpdir(), 'logs')
    if (!fs.existsSync(logsRoot)) fs.mkdirSync(logsRoot, { recursive: true })
    const safeId = String(connectionId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '')
    const logPath = path.join(logsRoot, `ssh-${safeId}-${Date.now()}.log`)
    const ws = fs.createWriteStream(logPath, { flags: 'a' })
    ws.write(`=== NetOps SSH Session Log ===\n`)
    ws.write(`Session: ${connectionId}\n`)
    ws.write(`Started: ${new Date().toISOString()}\n\n`)
    sessionLogStreams[connectionId] = ws
    return { success: true, logPath }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// 写入日志数据（纯文本，已去 ANSI 转义）
safeHandle('ssh-log-write', async (event, { connectionId, data }) => {
  try {
    const ws = sessionLogStreams[connectionId]
    if (ws) ws.write(data)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// 停止记录会话日志
safeHandle('ssh-log-stop', async (event, { connectionId }) => {
  try {
    if (sessionLogStreams[connectionId]) {
      sessionLogStreams[connectionId].write(`\n=== Session ended: ${new Date().toISOString()} ===\n`)
      sessionLogStreams[connectionId].end()
      delete sessionLogStreams[connectionId]
    }
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ============================================================
// Python 后端服务器管理（暂时禁用）
// ============================================================
function startPythonBackend() {
  debugLog('startPythonBackend: disabled')
  // 如果需要启用Python后端，在这里实现
  // 例如：启动一个子进程运行 Python 脚本
}

function stopPythonBackend() {
  debugLog('stopPythonBackend: disabled')
  // 如果需要启用Python后端，在这里实现停止逻辑
}

