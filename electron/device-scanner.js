/**
 * 网络设备扫描模块 - 精确版 v5.0
 * 核心改进：MAC地址白名单过滤、正确识别路由器vs摄像头、获取真实设备名称
 */

const { networkInterfaces } = require('os')
const { exec } = require('child_process')
const { promisify } = require('util')
const dgram = require('dgram')
const crypto = require('crypto')
const net = require('net')
const http = require('http')
const https = require('https')

const execAsync = promisify(exec)

// 调试日志：仅当设置环境变量 CAMSCAN_DEBUG 时输出，避免在生产路径产生大量噪声日志
function debugLog(...args) {
  if (process.env.CAMSCAN_DEBUG) {
    console.log('[camscan]', ...args)
  }
}

// ============================================================
// 摄像头厂商MAC地址白名单（只有这些MAC的设备才被认为是摄像头）
// ============================================================

const CAMERA_MAC_PREFIXES = [
  // 海康威视
  '787EBC', 'BCAD28', 'E0BB9E', '44D5F2', '20F41B',
  '9C644A', 'D4970B', 'EC172F', '64DB8B', 'AC4E91',
  // 大华
  'C0A545', 'C4B5C2', '004E35', '4C11BF', 'BC329F',
  '9C8E99', '44EA30', '3C4C92', 'EC71DB', '30DDAA',
  'B4A3AF', '00E04C', '0050C2',
  // 宇视
  'B4A3AF', '80A589',
  // 安讯士
  '001B11', 'ACCC8E', '00408C', '00D0D0',
  // TP-Link
  '00195B', 'A0F3C1', '90F652', '14A0F8', '3C846A',
  '50C7BF', '5C628B', '60A4B7', '68FF7B', '78C3E9',
  '98DA92', 'AC15A2', 'B0BE76', 'C025E9', 'C4E984',
  'D8C4E9', 'E4C3E3', 'F0A731', 'F832E4', 'FC7C02',
  // 创维
  '0022B5', '0026ED', '00E04C', '40F2E9', '6C5E3B',
  '8C57EE', 'A865B2', 'B0E57D', 'D4F57A', 'E8B748',
  // 天地伟业
  '001F8F',
  // 华为
  '10C61F', 'F8A6D0', 'D46D6D', '006B8E', '001882',
  '7425DA', 'E848B8', '70723C', '001F64', '001F3C',
  'F492BF', 'AC853D', 'EC233D', '30846A', 'E8B4AE',
  'D4BF7F', '04F938', '248A07', 'C8A9D0', '00E0FC',
  '3891D5', '4C1FCC',
  // 华三
  'AC853D',
  // 普联/TPLINK
  'CCCCCC',
  // 宇视（更多）
  '001B11', '001B11',
]

const MAC_TO_VENDOR = {
  '787EBC': '海康威视', 'BCAD28': '海康威视', 'E0BB9E': '海康威视', '44D5F2': '海康威视',
  '20F41B': '海康威视', '9C644A': '海康威视', 'D4970B': '海康威视', 'EC172F': '海康威视',
  '64DB8B': '海康威视', 'AC4E91': '海康威视',
  'C0A545': '大华', 'C4B5C2': '大华', '004E35': '大华', '4C11BF': '大华',
  'BC329F': '大华', '9C8E99': '大华', '44EA30': '大华', '3C4C92': '大华', 'EC71DB': '大华',
  '30DDAA': '大华', 'B4A3AF': '大华', '00E04C': '大华', '0050C2': '大华',
  'B4A3AF': '宇视', '80A589': '宇视',
  '001B11': '安讯士', 'ACCC8E': '安讯士', '00408C': '安讯士', '00D0D0': '安讯士',
  '00195B': 'TP-Link', 'A0F3C1': 'TP-Link', '90F652': 'TP-Link', '14A0F8': 'TP-Link',
  '3C846A': 'TP-Link', '50C7BF': 'TP-Link', '5C628B': 'TP-Link', '60A4B7': 'TP-Link',
  '68FF7B': 'TP-Link', '78C3E9': 'TP-Link', '98DA92': 'TP-Link', 'AC15A2': 'TP-Link',
  'B0BE76': 'TP-Link', 'C025E9': 'TP-Link', 'C4E984': 'TP-Link', 'D8C4E9': 'TP-Link',
  'E4C3E3': 'TP-Link', 'F0A731': 'TP-Link', 'F832E4': 'TP-Link', 'FC7C02': 'TP-Link',
  '0022B5': '创维', '0026ED': '创维', '00E04C': '创维', '40F2E9': '创维',
  '6C5E3B': '创维', '8C57EE': '创维', 'A865B2': '创维', 'B0E57D': '创维',
  'D4F57A': '创维', 'E8B748': '创维',
  '001F8F': '天地伟业',
  '10C61F': '华为', 'F8A6D0': '华为', 'D46D6D': '华为', '006B8E': '华为',
  '001882': '华为', '7425DA': '华为', 'E848B8': '华为', '70723C': '华为',
  '001F64': '华为', '001F3C': '华为', 'F492BF': '华为', 'AC853D': '华为',
  'EC233D': '华为', '30846A': '华为', 'E8B4AE': '华为', 'D4BF7F': '华为',
  '04F938': '华为', '248A07': '华为', 'C8A9D0': '华为', '00E0FC': '华为',
  '3891D5': '华为', '4C1FCC': '华为',
  // 新格林耐特 G-COM / GCOM Technologies
  '00252E': 'G-COM', '149182': 'G-COM', 'C85BA0': 'G-COM',
  // 迈普 / Maipu
  '002207': '迈普', '00E0FC': '迈普', '001CF1': '迈普', '001EDA': '迈普',
  // 中兴
  '000732': '中兴', '001AA2': '中兴', 'D87B7B': '中兴', '40BF17': '中兴', 'C864C7': '中兴',
  // 烽火 FiberHome
  '0030BA': '烽火', '4CC0AF': '烽火', '107BD2': '烽火',
  // 博达 / BDCOM
  '00238E': '博达(BDCOM)', '001405': '博达(BDCOM)',
}

/** 判断MAC是否属于摄像头厂商 */
function isCameraMAC(mac) {
  if (!mac) return false
  const prefix = mac.replace(/[-:]/g, '').substring(0, 6).toUpperCase()
  return CAMERA_MAC_PREFIXES.includes(prefix)
}

/** 从MAC获取厂商 */
function getVendorFromMAC(mac) {
  if (!mac) return ''
  const prefix = mac.replace(/[-:]/g, '').substring(0, 6).toUpperCase()
  return MAC_TO_VENDOR[prefix] || ''
}

/** 根据端口推断摄像头品牌 */
function guessBrandByPort(port) {
  const map = {
    8000: '海康威视',
    37777: '大华',
    3456: '创维',
    6004: '天地伟业',
    2020: 'TP-Link',
    8080: '未知品牌',
    80: '未知品牌'
  }
  return map[port] || '监控设备'
}

// ============================================================
// 配置常量
// ============================================================

/** 全局最大并发限制（借鉴Ingram策略：高并发扫描，Electron main进程不受子进程限制） */
const MAX_GLOBAL_CONCURRENCY = 200

/** 摄像头/NVR 常用端口 */
const CAMERA_PORTS = [
  { port: 80, protocol: 'http', weight: 10 },
  { port: 554, protocol: 'rtsp', weight: 10 },
  { port: 8000, protocol: 'hikvision', weight: 9 },
  { port: 37777, protocol: 'dahua', weight: 9 },
  { port: 8080, protocol: 'http', weight: 8 },
  { port: 443, protocol: 'https', weight: 8 },
  { port: 22, protocol: 'ssh', weight: 8 },
  { port: 23, protocol: 'telnet', weight: 7 },
  { port: 161, protocol: 'snmp', weight: 7 },
  { port: 8443, protocol: 'https', weight: 7 },
  { port: 34567, protocol: 'dahua', weight: 7 },
  { port: 8554, protocol: 'rtsp', weight: 7 },
  { port: 2020, protocol: 'onvif', weight: 8 },
  { port: 5000, protocol: 'onvif', weight: 6 },
  { port: 9000, protocol: 'uniview', weight: 6 },
  { port: 81, protocol: 'http', weight: 5 },
  { port: 82, protocol: 'http', weight: 5 },
  { port: 83, protocol: 'http', weight: 5 },
  { port: 7001, protocol: 'hikvision', weight: 5 },
  { port: 7681, protocol: 'hikvision', weight: 5 },
  { port: 8081, protocol: 'hikvision', weight: 5 },
  { port: 8091, protocol: 'hikvision', weight: 5 },
  { port: 8200, protocol: 'hikvision', weight: 5 },
  { port: 9010, protocol: 'hikvision', weight: 5 },
  { port: 37778, protocol: 'dahua', weight: 5 },
  { port: 37779, protocol: 'dahua', weight: 5 },
  { port: 5001, protocol: 'onvif', weight: 4 },
  { port: 5002, protocol: 'onvif', weight: 4 },
  { port: 1935, protocol: 'rtmp', weight: 4 },
  { port: 800, protocol: 'hikvision', weight: 4 },
  { port: 34599, protocol: 'dahua', weight: 4 }
]

const QUICK_PORTS = CAMERA_PORTS.filter(p => p.weight >= 8)
const FULL_PORTS = CAMERA_PORTS

// ============================================================
// 工具函数
// ============================================================

function getLocalNetworks() {
  const interfaces = networkInterfaces()
  const networks = []
  for (const [name, ifaces] of Object.entries(interfaces)) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const network = getNetworkRange(iface.address, iface.netmask)
        networks.push({
          interface: name,
          ip: iface.address,
          mask: iface.netmask,
          network: network.network,
          broadcast: network.broadcast,
          prefix: network.prefix,
          cidr: `${network.network}/${network.prefix}`
        })
      }
    }
  }
  return networks
}

function getNetworkRange(ip, mask) {
  const ipParts = ip.split('.').map(Number)
  const maskParts = mask.split('.').map(Number)
  const networkParts = ipParts.map((part, i) => part & maskParts[i])
  const broadcastParts = networkParts.map((part, i) => part | (~maskParts[i] & 255))
  let prefix = 0
  for (const m of maskParts) {
    let b = m
    while (b > 0) {
      prefix += b & 1
      b >>>= 1
    }
  }
  return { network: networkParts.join('.'), broadcast: broadcastParts.join('.'), prefix }
}

// 预留能力：扫描与本机相邻的"常用网段"（如 192.168.0.0/24、192.168.1.0/24）。
// 当前 fastScan 主流程仅扫描本机实际网段，未在调用链中启用，留作扩展。
function getCommonNetworks() {
  const networks = []
  const localNets = getLocalNetworks()
  const localNetworkStrs = new Set()
  for (const net of localNets) {
    networks.push({ ...net, source: 'local' })
    localNetworkStrs.add(net.cidr)
  }
  // 只保留与本地网段相邻的常用网段，大幅减少无效扫描
  const commonCClass = ['192.168.1', '192.168.0']
  for (const base of commonCClass) {
    const cidr = `${base}.0/24`
    if (!localNetworkStrs.has(cidr)) {
      networks.push({
        interface: 'virtual', ip: `${base}.1`, mask: '255.255.255.0',
        network: `${base}.0`, broadcast: `${base}.255`,
        prefix: 24, cidr: cidr, source: 'common'
      })
    }
  }
  return networks
}

// ============================================================
// ARP 表读取
// ============================================================

async function getARPTable() {
  try {
    const { stdout } = await execAsync('arp -a', { timeout: 3000, windowsHide: true })
    return parseARPTable(stdout)
  } catch (e) {
    return []
  }
}

/** 通过 nbtstat 获取指定IP的MAC地址（ARP表缺失时的备用方案） */
async function getMACByNbtstat(ip) {
  try {
    const { stdout } = await execAsync(`nbtstat -A ${ip}`, { timeout: 2000, windowsHide: true })
    const macMatch = stdout.match(/MAC Address\s*=\s*([0-9A-Fa-f:-]{17})/)
    if (macMatch) {
      return macMatch[1].toLowerCase().replace(/-/g, ':')
    }
  } catch (e) {}
  return null
}

/** 通过 getmac 获取指定IP的MAC地址 */
async function getMACByGetMac(ip) {
  try {
    const { stdout } = await execAsync(`getmac /s ${ip} /v`, { timeout: 2000, windowsHide: true })
    // getmac 输出格式较复杂，尝试提取
    const lines = stdout.split('\n')
    for (const line of lines) {
      const match = line.match(/([0-9A-Fa-f]{2}[-:]){5}[0-9A-Fa-f]{2}/)
      if (match) {
        return match[0].toLowerCase().replace(/-/g, ':')
      }
    }
  } catch (e) {}
  return null
}

/** 多途径获取MAC地址 */
async function getMacForIP(ip, arpTable) {
  // 1. 先从ARP表查找
  const arpEntry = arpTable.find(a => a.ip === ip)
  if (arpEntry && arpEntry.mac) return arpEntry.mac

  // 2. 尝试 nbtstat
  const nbtMac = await getMACByNbtstat(ip)
  if (nbtMac) return nbtMac

  // 3. 尝试 getmac
  const getmacMac = await getMACByGetMac(ip)
  if (getmacMac) return getmacMac

  return null
}

function parseARPTable(output) {
  const devices = []
  const seen = new Set()
  const lines = output.split('\n')
  for (const line of lines) {
    const winMatch = line.match(/^\s*(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F:-]{17})/)
    if (winMatch) {
      const ip = winMatch[1]
      const mac = winMatch[2].toLowerCase().replace(/-/g, ':')
      if (mac === 'ff:ff:ff:ff:ff:ff' || mac === '00:00:00:00:00:00') continue
      if (ip === '0.0.0.0' || ip === '255.255.255.255') continue
      if (!seen.has(ip)) {
        seen.add(ip)
        devices.push({ ip, mac, source: 'arp' })
      }
    }
  }
  return devices
}

// ============================================================
// 默认网关检测（用于排除路由器）
// ============================================================

async function getDefaultGateways() {
  const gateways = new Set()
  // 方法1: route print（最可靠）
  try {
    const { stdout } = await execAsync('route print 0.0.0.0', { timeout: 3000, windowsHide: true })
    const lines = stdout.toString().split('\n')
    for (const line of lines) {
      const parts = line.trim().split(/\s+/)
      // route print 输出: Network Destination  Netmask  Gateway  Interface  Metric
      // 0.0.0.0  0.0.0.0  192.168.2.1  192.168.2.101  35
      if (parts.length >= 4 && parts[0] === '0.0.0.0' && parts[1] === '0.0.0.0') {
        const gw = parts[2]
        if (gw && gw !== '0.0.0.0' && gw.match(/^\d+\.\d+\.\d+\.\d+$/)) {
          gateways.add(gw)
        }
      }
    }
  } catch (e) {}

  // 方法2: ipconfig（备用）
  if (gateways.size === 0) {
    try {
      const { stdout } = await execAsync('ipconfig', { timeout: 3000, windowsHide: true })
      const lines = stdout.toString().split('\n')
      for (const line of lines) {
        const match = line.match(/(?:Default Gateway|默认网关).*?:\s*(\d+\.\d+\.\d+\.\d+)/i)
        if (match && match[1] && match[1] !== '0.0.0.0') {
          gateways.add(match[1].trim())
        }
      }
    } catch (e) {}
  }

  return Array.from(gateways)
}

// ============================================================
// ICMP Ping 扫描（100ms超时，60并发）
// ============================================================

function fastPing(ip, timeoutMs = 100) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32'
    const cmd = isWin
      ? `ping -n 1 -w ${timeoutMs} ${ip}`
      : `ping -c 1 -W ${Math.max(1, Math.ceil(timeoutMs / 1000))} ${ip}`

    const child = exec(cmd, {
      timeout: timeoutMs + 500,
      encoding: 'buffer',
      windowsHide: true
    }, (err, stdout) => {
      let output = ''
      try {
        output = stdout?.toString(isWin ? 'cp936' : 'utf-8') || ''
      } catch {
        output = (stdout || '').toString()
      }
      output = output.toLowerCase()

      const success = output.includes('reply from') ||
                     output.includes('bytes=') ||
                     output.includes('来自') ||
                     output.includes('字节=') ||
                     output.includes('1 received') ||
                     output.includes('0% packet loss') ||
                     output.includes('0% loss')

      resolve({ ip, online: success })
    })

    setTimeout(() => {
      try { child.kill() } catch (e) {}
      resolve({ ip, online: false })
    }, timeoutMs + 200)
  })
}

async function pingSweep(baseIP, concurrency = 80, timeoutMs = 80, onProgress) {
  const ips = []
  for (let i = 1; i <= 254; i++) {
    ips.push(`${baseIP}.${i}`)
  }

  const onlineIPs = []
  let completed = 0
  const total = ips.length

  await new Promise((resolve) => {
    let index = 0
    let running = 0
    let resolved = false

    function next() {
      while (index < total && running < concurrency) {
        const ip = ips[index++]
        running++
        fastPing(ip, timeoutMs).then(result => {
          running--
          completed++
          if (result.online) {
            onlineIPs.push(ip)
          }
          if (onProgress && completed % 10 === 0) {
            onProgress(completed, total)
          }
          if (completed >= total) {
            if (!resolved) {
              resolved = true
              if (onProgress) onProgress(total, total)
              resolve()
            }
          } else {
            next()
          }
        })
      }

      if (index >= total && running === 0 && !resolved) {
        resolved = true
        if (onProgress) onProgress(total, total)
        resolve()
      }
    }

    next()
  })

  return onlineIPs
}

async function multiNetworkPingSweep(networks, concurrency = 60, timeoutMs = 100, onProgress) {
  const allOnlineIPs = new Set()
  // 串行扫描网段，避免网段数 × 并发数导致子进程爆炸
  const effectiveConcurrency = Math.min(concurrency, MAX_GLOBAL_CONCURRENCY)
  let netsDone = 0
  const totalNets = networks.length
  for (const net of networks) {
    const baseIP = net.network.replace(/\.0$/, '')
    const ips = await pingSweep(baseIP, effectiveConcurrency, timeoutMs, (done, total) => {
      if (onProgress) onProgress(netsDone, totalNets, done, total)
    })
    for (const ip of ips) {
      allOnlineIPs.add(ip)
    }
    netsDone++
    if (onProgress) onProgress(netsDone, totalNets, 254, 254)
  }
  return Array.from(allOnlineIPs)
}

// ============================================================
// TCP 端口扫描
// ============================================================

function quickPortCheck(ip, port, timeoutMs = 60) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let resolved = false

    const finish = (open) => {
      if (!resolved) {
        resolved = true
        try { socket.destroy() } catch (e) {}
        resolve(open)
      }
    }

    socket.setTimeout(timeoutMs)
    socket.on('connect', () => finish(true))
    socket.on('timeout', () => finish(false))
    socket.on('error', () => finish(false))
    socket.on('close', () => finish(false))

    try {
      socket.connect(port, ip)
    } catch (e) {
      finish(false)
    }

    setTimeout(() => finish(false), timeoutMs + 20)
  })
}

async function scanPortsOnHost(ip, ports, timeoutMs = 100, concurrency = 16, probed) {
  const openPorts = []
  const sortedPorts = [...ports].sort((a, b) => (b.weight || 0) - (a.weight || 0))

  for (let i = 0; i < sortedPorts.length; i += concurrency) {
    const batch = sortedPorts.slice(i, i + concurrency)
    const results = await Promise.all(
      batch.map(p => {
        const key = `${ip}:${p.port}`
        // 跨阶段去重：已在其他阶段探测过的端口跳过，避免重复 TCP connect
        if (probed && probed.has(key)) return Promise.resolve(null)
        if (probed) probed.add(key)
        return quickPortCheck(ip, p.port, timeoutMs).then(open => open ? p : null)
      })
    )
    openPorts.push(...results.filter(r => r !== null))
    if (openPorts.length >= 2) break
  }

  return openPorts
}

// ============================================================
// HTTP 设备识别（区分路由器和摄像头）
// ============================================================

/** 判断是否是路由器/网关页面 */
function isRouterPage(body, headers) {
  if (!body) return false
  const content = body.toLowerCase()
  const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i)
  const title = titleMatch ? titleMatch[1].toLowerCase() : ''

  // 路由器常见特征（内容中）—— 大幅扩充
  const routerKeywords = [
    'router', 'gateway', 'modem', 'firmware', 'firmware upgrade',
    'tp-link router', 'xiaoqiang', 'miwifi',
    'asus', 'netgear', 'd-link', 'tenda', 'totolink', 'mercury',
    '水星', '迅捷', '斐讯', '小米路由', '荣耀路由', '华为路由',
    'administrator', 'sysadmin', 'admin login',
    'wan', 'lan', 'dhcp', 'wlan', 'wireless',
    '宽带', '拨号', '上网设置', '无线设置', '网络状态',
    'wifi', 'wps', 'ssid', 'channel', 'bandwidth',
    'xd21', 'honor router', 'hilink', 'smart home',
    'guest network', 'parental control', 'qos', 'nat',
    'pppoe', 'dynamic ip', 'static ip',
    // 增强：更多路由器常见关键词
    '系统状态', 'wan口设置', 'lan口设置', 'mac地址克隆',
    '端口转发', '虚拟服务器', 'dmz主机', 'upnp设置',
    'ipv6', '网络参数', '系统工具', '备份和载入',
    '恢复出厂', '重启路由器', '系统日志', '流量统计',
    '连接设备', '终端管理', 'ip与mac绑定',
    '安全防护', '攻击防护', '家长控制', '行为管控',
    '云服务', 'ddns', '远程管理', '端口映射'
  ]

  for (const keyword of routerKeywords) {
    if (content.includes(keyword)) return true
  }

  // 路由器title特征 —— 扩充
  const routerTitlePatterns = [
    /荣耀路由/, /华为路由/, /小米路由/, /tp-link/i, /mercury/i, /totolink/i,
    /fast\s*router/i, /router\s*login/i, /gateway/i, /firmware/i,
    /智慧生活/, /hilink/, /honor/i, /huawei\s*home/i
  ]
  for (const p of routerTitlePatterns) {
    if (p.test(title)) return true
  }

  // 检查是否是OpenWrt/LuCI
  if (content.includes('luci') || content.includes('openwrt')) return true

  // 增强：如果页面是极简登录页且无摄像头特征，大概率是路由器
  if (title.length > 0 && title.length < 20) {
    const simpleTitles = ['login', 'log in', 'sign in', 'admin', 'index', 'home', '首页', '登录', '管理']
    const isSimpleTitle = simpleTitles.some(t => title.includes(t))
    // 页面有登录表单但无摄像头特征
    if (isSimpleTitle && content.includes('password') && content.includes('submit')) {
      const cameraWords = ['camera', 'ipcam', 'webcam', 'onvif', 'rtsp', 'video', 'stream']
      const hasCamera = cameraWords.some(w => content.includes(w))
      if (!hasCamera) return true
    }
  }

  // 检查响应头中是否有路由器特征
  if (headers) {
    const server = (headers['server'] || '').toLowerCase()
    const wwwAuth = (headers['www-authenticate'] || '').toLowerCase()
    // 许多路由器使用简单的认证方式
    if (wwwAuth.includes('basic') && title.length < 30 && (
      title.includes('login') || title.includes('设置') || title.includes('管理')
    )) return true
    // 常见路由器Server头
    const routerServers = ['boa', 'goahead', 'lighttpd', 'mini_httpd', 'httpd', 'router', 'gateway']
    if (routerServers.some(s => server.includes(s)) && title.length < 30) {
      const routerTitleHints = ['login', 'admin', '设置', '管理', 'index', '首页']
      if (routerTitleHints.some(h => title.includes(h))) return true
    }
  }

  return false
}

/** 分析 HTTP 响应判断设备类型 */
function analyzeDeviceResponse(body, headers, statusCode) {
  const content = (body || '').toLowerCase()
  const server = (headers?.server || '').toLowerCase()
  const wwwAuth = (headers?.['www-authenticate'] || '').toLowerCase()
  const titleMatch = (body || '').match(/<title[^>]*>([^<]+)<\/title>/i)
  const title = titleMatch ? titleMatch[1].toLowerCase() : ''

  // 401/403：设备存在且要求认证（大量摄像头/录像机返回 401 Digest 而非登录页）
  // 将其视为"设备存在"的强信号，避免 HTTPS/认证类摄像头被漏检
  if (statusCode === 401 || statusCode === 403) {
    // 优先排除明显的路由器登录页
    if (isRouterPage(body, headers)) {
      return { vendor: '未知', type: '路由器/网关', confidence: 0.4, isRouter: true }
    }
    let vendor = '未知'
    if (wwwAuth.includes('hikvision')) vendor = '海康威视'
    else if (wwwAuth.includes('dahua')) vendor = '大华'
    else if (wwwAuth.includes('axis')) vendor = '安讯士'
    else if (wwwAuth.includes('uniview')) vendor = '宇视'
    return { vendor, type: '摄像头/NVR', confidence: 0.65, authRequired: true }
  }

  // 先检查是否是路由器
  if (isRouterPage(body, headers)) {
    return { vendor: '未知', type: '路由器/网关', confidence: 0.3, isRouter: true }
  }

  // 海康威视
  if (content.includes('hikvision') || server.includes('hikvision') ||
      content.includes('ivms') || wwwAuth.includes('hikvision') ||
      content.includes('/doc/ui/scripts/hik') || content.includes('hik-webui')) {
    return { vendor: '海康威视', type: '摄像头/NVR', confidence: 0.95 }
  }

  // 大华
  if (content.includes('dahua') || server.includes('dahua') ||
      content.includes('smart pss') || wwwAuth.includes('dahua') ||
      content.includes('/cgi-bin/configmanager') ||
      content.includes('大华') || body.includes('大华') ||
      content.includes('web端') || content.includes('web登录') ||
      content.includes('/cgi-bin/magicbox.cgi') ||
      content.includes('/cgi-bin/devicemanager.cgi') ||
      content.includes('/cgi-bin/configmanager.cgi') ||
      content.includes('/cgi-bin/device.cgi') ||
      content.includes('/doc/page/login.asp') ||
      content.includes('dm368') || content.includes('ti814x') ||
      content.includes('netctrl') || content.includes('dhnetsdk') ||
      title.includes('dahua') || title.includes('大华') || title.includes('web端')) {
    return { vendor: '大华', type: '摄像头/NVR', confidence: 0.95 }
  }

  // TP-Link
  if (content.includes('tp-link') || server.includes('tp-link') ||
      content.includes('tplink') || content.includes('tp link') ||
      body.includes('TP-LINK') || body.includes('TPLINK') ||
      content.includes('/stw-cgi/') || content.includes('tapo') ||
      content.includes('kcamera') || content.includes('kasa') ||
      title.includes('tp-link') || title.includes('tplink') ||
      content.includes('tpcamera') || content.includes('tp-link_camera') ||
      content.includes('/login.htm') || content.includes('/index.htm')) {
    return { vendor: 'TP-Link', type: '摄像头', confidence: 0.85 }
  }

  // 宇视
  if (content.includes('uniview') || content.includes('unv') ||
      server.includes('uniview')) {
    return { vendor: '宇视', type: '摄像头/NVR', confidence: 0.85 }
  }

  // 安讯士
  if (content.includes('axis') || server.includes('axis') ||
      content.includes('/axis-cgi/')) {
    return { vendor: '安讯士', type: '摄像头', confidence: 0.9 }
  }

  // 华为
  if (content.includes('huawei') || content.includes('holosens') ||
      server.includes('huawei')) {
    return { vendor: '华为', type: '摄像头/NVR', confidence: 0.85 }
  }

  // 创维
  if (content.includes('skyworth') || content.includes('创维')) {
    return { vendor: '创维', type: '摄像头', confidence: 0.8 }
  }

  // 天地伟业
  if (content.includes('tiandy') || content.includes('天地伟业')) {
    return { vendor: '天地伟业', type: '摄像头', confidence: 0.8 }
  }

  // 皓视通
  if (content.includes('haoshitong') || content.includes('皓视通')) {
    return { vendor: '皓视通', type: '摄像头', confidence: 0.8 }
  }

  // ONVIF 通用
  if (content.includes('onvif') || content.includes('soap') ||
      headers?.soapaction || content.includes('tds:device')) {
    return { vendor: 'ONVIF设备', type: '摄像头', confidence: 0.7 }
  }

  // 通用摄像头特征（排除同时含有路由器特征的设备）
  const genericCameraWords = ['camera', 'ipcam', 'webcam', 'live view', 'video stream', 'rtsp']
  const hasCameraWord = genericCameraWords.some(w => content.includes(w))
  if (hasCameraWord) {
    // 二次排除：页面同时含有路由器/网关特征的，优先认定为路由器而非摄像头
    const routerIndicators = ['router', 'gateway', 'modem', 'wan', 'lan', 'dhcp', 'ssid', 'pppoe', 'firmware upgrade', '宽带', '拨号', '上网设置', '无线设置', 'wireless settings', 'network settings']
    const hasRouterIndicator = routerIndicators.some(kw => content.includes(kw))
    if (!hasRouterIndicator) {
      return { vendor: '未知', type: 'IP摄像头', confidence: 0.6 }
    }
  }

  return null
}

/** 从 HTTP 响应中提取设备名称 */
function extractDeviceNameFromHTTP(body, headers) {
  if (!body) return null

  // 从HTML title标签提取
  const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (titleMatch) {
    let name = titleMatch[1].trim().replace(/[\[\]\-_\|]/g, ' ').replace(/\s+/g, ' ').trim()
    if (name.length > 1 && name.length < 100) {
      const pureRouterTitles = ['router', 'gateway', 'index', 'home']
      const lower = name.toLowerCase()
      if (name.length > 8 || !pureRouterTitles.includes(lower)) {
        return name
      }
    }
  }

  // 尝试从页面内容中提取设备型号（强化正则，覆盖更多格式）
  const modelPatterns = [
    /model[:\s=]+["']?([A-Za-z0-9\-]{3,30})["']?/i,
    /device[_\s-]?model[:\s=]+["']?([A-Za-z0-9\-]{3,30})["']?/i,
    /product[_\s-]?name[:\s=]+["']?([A-Za-z0-9\-]{3,30})["']?/i,
    /dev(?:ice)?[_\s-]?model[:\s=]+["']?([A-Za-z0-9\-]{3,30})["']?/i,
    /modelname[:\s=]+["']?([A-Za-z0-9\-]{3,30})["']?/i,
  ]
  for (const re of modelPatterns) {
    const m = body.match(re)
    if (m && m[1]) return m[1].trim()
  }

  return null
}

/** 从 HTTP 响应体中提取设备型号（更激进的匹配） */
function extractModelFromHTTP(body) {
  if (!body) return null
  const content = body.substring(0, 5000).toLowerCase()

  // 常见型号格式正则
  const patterns = [
    /([A-Z]{2}-\w{6,20})/,           // DS-2CD2xxxx, DH-IPC-xxxx
    /(DH-\w{6,20})/,                  // 大华型号
    /(DS-\w{6,20})/,                  // 海康型号
    /(IPC-\w{4,20})/,                 // 通用IPC型号
    /(NVR-\w{4,20})/,                 // 通用NVR型号
    /model[=\s:]+([A-Za-z0-9\-]{4,25})/i,
    /devmodel[=\s:]+([A-Za-z0-9\-]{4,25})/i,
  ]

  for (const re of patterns) {
    const m = body.match(re)
    if (m && m[1] && m[1].length > 4) {
      return m[1].trim()
    }
  }
  return null
}

async function identifyDevice(ip, port, timeoutMs = 150) {
  return new Promise((resolve) => {
    // 递归支持重定向（摄像头常将 / 重定向到登录页）
    const doRequest = (url, depth) => {
      const useHttps = url.startsWith('https')
      const client = useHttps ? https : http
      const req = client.get(url, {
        timeout: timeoutMs,
        // 整改（安全 F-10）：LAN 摄像头大量使用自签名证书，禁用证书校验是为了
        // 避免漏检——但这同时让识别阶段的响应可被中间人伪造（注入虚假厂商/型号，
        // 诱导运维连错设备）。折中方案：默认保持兼容（漏检代价更高），
        // 但提供 NETOPS_STRICT_TLS=1 开关强制校验证书，供高安全环境启用。
        rejectUnauthorized: process.env.NETOPS_STRICT_TLS !== '1',
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }, (res) => {
        const status = res.statusCode || 0

        // 处理重定向（301/302/303/307/308）
        if (depth < 2 && [301, 302, 303, 307, 308].includes(status)) {
          const loc = res.headers.location
          if (loc) {
            let nextUrl = null
            try { nextUrl = new URL(loc, url).toString() } catch (e) { nextUrl = null }
            if (nextUrl) {
              res.resume() // 丢弃当前响应体
              return doRequest(nextUrl, depth + 1)
            }
          }
        }

        let data = ''
        const chunks = []

        res.on('data', chunk => {
          chunks.push(chunk)
          // 放宽截断上限：部分设备型号信息位于较长响应体尾部
          if (chunks.length > 40) {
            req.destroy()
            data = Buffer.concat(chunks).toString('utf-8').substring(0, 8000)
            const info = analyzeDeviceResponse(data, res.headers, status)
            resolve(info || { confidence: (status === 401 || status === 403) ? 0.6 : 0 })
          }
        })

        res.on('end', () => {
          data = Buffer.concat(chunks).toString('utf-8').substring(0, 8000)
          const info = analyzeDeviceResponse(data, res.headers, status)
          resolve(info || { confidence: (status === 401 || status === 403) ? 0.6 : 0 })
        })
      })

      req.on('error', () => resolve(null))
      req.on('timeout', () => { req.destroy(); resolve(null) })
      setTimeout(() => { req.destroy(); resolve(null) }, timeoutMs + 50)
    }

    const scheme = (port === 443 || port === 8443) ? 'https' : 'http'
    doRequest(`${scheme}://${ip}:${port}`, 0)
  })
}

// ============================================================
// 厂商私有API获取设备名称
// ============================================================

async function getHikvisionDeviceInfo(ip, timeoutMs = 300) {
  try {
    return new Promise((resolve) => {
      const req = http.get(`http://${ip}/ISAPI/System/deviceInfo`, { timeout: timeoutMs }, (res) => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => {
          const nameMatch = data.match(/<deviceName[^>]*>([^<]+)<\/deviceName>/)
          const modelMatch = data.match(/<model[^>]*>([^<]+)<\/model>/)
          if (nameMatch || modelMatch) {
            resolve({
              vendor: '海康威视',
              name: nameMatch ? nameMatch[1] : null,
              model: modelMatch ? modelMatch[1] : null
            })
          } else {
            resolve(null)
          }
        })
      })
      req.on('error', () => resolve(null))
      req.on('timeout', () => { req.destroy(); resolve(null) })
      setTimeout(() => { req.destroy(); resolve(null) }, timeoutMs + 50)
    })
  } catch (e) { return null }
}

async function getDahuaDeviceInfo(ip, port, timeoutMs = 500) {
  // 大华设备可能在 80 或 37777 端口提供 HTTP 服务
  const ports = port ? [port] : [80, 37777, 37778]
  const endpoints = [
    `/cgi-bin/configManager.cgi?action=getConfig&name=DeviceInfo`,
    `/cgi-bin/magicBox.cgi?action=getMachineName`,
    `/cgi-bin/device.cgi?action=getDeviceInfo`,
  ]

  for (const p of ports) {
    for (const endpoint of endpoints) {
      try {
        const result = await new Promise((resolve) => {
          const url = `http://${ip}:${p}${endpoint}`
          const req = http.get(url, { timeout: timeoutMs }, (res) => {
            let data = ''
            res.on('data', chunk => { data += chunk })
            res.on('end', () => {
              const nameMatch = data.match(/table\.DeviceInfo\.devName\s*=\s*(.+)/)
              const typeMatch = data.match(/table\.DeviceInfo\.devType\s*=\s*(.+)/)
              const modelMatch = data.match(/table\.DeviceInfo\.devModel\s*=\s*(.+)/)
              const machineMatch = data.match(/machineName\s*=\s*"([^"]+)"/)
              const modelXmlMatch = data.match(/<model[^>]*>([^<]+)<\/model>/i)

              const name = (nameMatch ? nameMatch[1] : null) || (machineMatch ? machineMatch[1] : null)
              const devType = typeMatch ? typeMatch[1].trim() : null
              const devModel = (modelMatch ? modelMatch[1].trim() : null) || (modelXmlMatch ? modelXmlMatch[1].trim() : null)
              const model = devModel || devType || null

              if (name || model) {
                resolve({ vendor: '大华', name: name?.trim(), model: model?.trim() })
              } else {
                resolve(null)
              }
            })
          })
          req.on('error', () => resolve(null))
          req.on('timeout', () => { req.destroy(); resolve(null) })
          setTimeout(() => { req.destroy(); resolve(null) }, timeoutMs)
        })
        if (result) return result
      } catch (e) { continue }
    }
  }
  return null
}

// ============================================================
// 海康SADP私有协议发现（UDP 37020）
// ============================================================

async function discoverHikvisionSADP(timeoutMs = 3000) {
  const devices = []
  const seenIPs = new Set()
  const sockets = []

  return new Promise((resolve) => {
    try {
      const interfaces = networkInterfaces()
      const localAddrs = []

      for (const name in interfaces) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            localAddrs.push(iface.address)
          }
        }
      }

      if (localAddrs.length === 0) {
        resolve(devices)
        return
      }

      const probeMsg = `<?xml version="1.0" encoding="utf-8"?>
<Probe>
  <Uuid>${crypto.randomUUID()}</Uuid>
  <Types>inquiry</Types>
</Probe>`

      const probeBuffer = Buffer.from(probeMsg, 'utf-8')
      let completed = 0
      const total = localAddrs.length

      for (const localAddr of localAddrs) {
        try {
          const socket = dgram.createSocket('udp4')

          socket.on('message', (msg, rinfo) => {
            try {
              const response = msg.toString('utf-8')
              const ip = rinfo.address

              if (seenIPs.has(ip)) return
              seenIPs.add(ip)

              // 解析 ProbeMatch 响应
              const uuidMatch = response.match(/<Uuid>([^<]+)<\/Uuid>/)
              const typeMatch = response.match(/<Types>([^<]+)<\/Types>/)
              const descMatch = response.match(/<DeviceDescription>([^<]+)<\/DeviceDescription>/)
              const snMatch = response.match(/<DeviceSN>([^<]+)<\/DeviceSN>/)
              const cmdPortMatch = response.match(/<CommandPort>([^<]+)<\/CommandPort>/)
              const httpPortMatch = response.match(/<HttpPort>([^<]+)<\/HttpPort>/)
              const macMatch = response.match(/<MAC>([^<]+)<\/MAC>/)
              const ipv4Match = response.match(/<IPv4Address>([^<]+)<\/IPv4Address>/)
              const softVerMatch = response.match(/<SoftwareVersion>([^<]+)<\/SoftwareVersion>/)

              const deviceIp = ipv4Match ? ipv4Match[1].trim() : ip
              const mac = macMatch ? macMatch[1].trim().toLowerCase().replace(/-/g, ':') : ''
              const model = descMatch ? descMatch[1].trim() : ''
              const serial = snMatch ? snMatch[1].trim() : ''
              const cmdPort = cmdPortMatch ? parseInt(cmdPortMatch[1]) : 8000
              const httpPort = httpPortMatch ? parseInt(httpPortMatch[1]) : 80

              devices.push({
                ip: deviceIp,
                port: httpPort,
                cmdPort,
                protocol: 'sadp',
                type: 'camera',
                vendor: '海康威视',
                model,
                serial,
                name: model || serial,
                macAddress: mac,
                softwareVersion: softVerMatch ? softVerMatch[1].trim() : '',
                confidence: 0.98,
                source: 'sadp'
              })
            } catch (e) {
              // 忽略单个响应解析错误
            }
          })

          socket.on('error', () => {
            completed++
            try { socket.close() } catch (e) {}
            if (completed >= total) resolve(devices)
          })

          socket.on('close', () => {
            if (!socket._sadpCounted) {
              socket._sadpCounted = true
              completed++
              if (completed >= total) resolve(devices)
            }
          })

          socket.bind(0, () => {
            try {
              socket.setBroadcast(true)
              const parts = localAddr.split('.')
              const broadcast = `${parts[0]}.${parts[1]}.${parts[2]}.255`

              // 发送到组播地址
              socket.send(probeBuffer, 0, probeBuffer.length, 37020, '239.255.255.250')
              // 同时发送到广播地址
              socket.send(probeBuffer, 0, probeBuffer.length, 37020, broadcast)
              // 也发送到全局广播地址
              socket.send(probeBuffer, 0, probeBuffer.length, 37020, '255.255.255.255')
              debugLog(`[SADP] 已从 ${localAddr} 发送探测 (组播+广播)`);
            } catch (e) {
              if (!socket._sadpCounted) {
                socket._sadpCounted = true
                completed++
                try { socket.close() } catch (err) {}
                if (completed >= total) resolve(devices)
              }
            }
          })

          sockets.push(socket)
        } catch (e) {
          completed++
          if (completed >= total) resolve(devices)
        }
      }

      // 超时自动返回
      setTimeout(() => {
        for (const s of sockets) {
          try { s.close() } catch (e) {}
        }
        resolve(devices)
      }, timeoutMs)
    } catch (e) {
      resolve(devices)
    }
  })
}

// ============================================================
// UPnP/SSDP 设备发现（秒级响应，大多数IP摄像头都支持）
// ============================================================

/**
 * UPnP/SSDP 设备发现
 * 发送多播请求到 239.255.255.250:1900，所有UPnP设备会同时响应
 * 比逐个Ping扫描快几个数量级
 */
async function discoverUPnPDevices(timeoutMs = 3000) {
  const devices = []
  const seenIPs = new Set()
  const sockets = []

  return new Promise((resolve) => {
    try {
      const interfaces = networkInterfaces()
      const localAddrs = []

      for (const name in interfaces) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            localAddrs.push({ address: iface.address, family: 'IPv4' })
          }
        }
      }

      if (localAddrs.length === 0) {
        resolve(devices)
        return
      }

      const ssdpRequest = [
        'M-SEARCH * HTTP/1.1',
        'HOST: 239.255.255.250:1900',
        'MAN: "ssdp:discover"',
        'MX: 2',
        'ST: ssdp:all',
        '',
        ''
      ].join('\r\n')

      const ssdpBuffer = Buffer.from(ssdpRequest)

      let completed = 0
      const total = localAddrs.length

      for (const { address } of localAddrs) {
        try {
          const socket = dgram.createSocket('udp4')

          socket.on('message', (msg, rinfo) => {
            try {
              const response = msg.toString()
              const ip = rinfo.address

              if (seenIPs.has(ip)) return
              seenIPs.add(ip)

              // 解析SSDP响应，提取设备信息
              const locationMatch = response.match(/LOCATION:\s*(.+)/i)
              const serverMatch = response.match(/SERVER:\s*(.+)/i)
              const usnMatch = response.match(/USN:\s*(.+)/i)
              const stMatch = response.match(/ST:\s*(.+)/i)

              if (locationMatch) {
                const location = locationMatch[1].trim()
                devices.push({
                  ip,
                  port: parseInt(location.match(/:(\d+)/)?.[1] || '80'),
                  protocol: 'upnp',
                  type: 'unknown',
                  vendor: detectVendorFromSSDP(response),
                  model: '',
                  name: '',
                  source: 'upnp',
                  location,
                  rawResponse: response.substring(0, 500)
                })
              }
            } catch (e) {
              // 忽略单个响应解析错误
            }
          })

          socket.on('error', () => {
            completed++
            try { socket.close() } catch (e) {}
            if (completed >= total) resolve(devices)
          })

          socket.on('close', () => {
            // socket关闭时确保completed增加，防止resolve遗漏
            if (!socket._upnpCounted) {
              socket._upnpCounted = true
              completed++
              if (completed >= total) resolve(devices)
            }
          })

          socket.bind(0, () => {
            try {
              socket.send(ssdpBuffer, 0, ssdpBuffer.length, 1900, '239.255.255.250')
              // 也发送到广播
              socket.setBroadcast(true)
              socket.send(ssdpBuffer, 0, ssdpBuffer.length, 1900, '255.255.255.255')
            } catch (e) {
              if (!socket._upnpCounted) {
                socket._upnpCounted = true
                completed++
                try { socket.close() } catch (err) {}
                if (completed >= total) resolve(devices)
              }
            }
          })

          sockets.push(socket)
        } catch (e) {
          completed++
          if (completed >= total) resolve(devices)
        }
      }

      // 超时自动返回
      const timeoutId = setTimeout(() => {
        for (const s of sockets) {
          try { s.close() } catch (e) {}
        }
        resolve(devices)
      }, timeoutMs)
    } catch (e) {
      resolve(devices)
    }
  })
}

/** 从SSDP响应中检测厂商 */
function detectVendorFromSSDP(response) {
  const upper = response.toUpperCase()
  if (upper.includes('HIKVISION') || upper.includes('HIK')) return '海康威视'
  if (upper.includes('DAHUA') || upper.includes('DH_')) return '大华'
  if (upper.includes('TP-LINK') || upper.includes('TPLINK')) return 'TP-Link'
  if (upper.includes('UNV') || upper.includes('UNISIGHT')) return '宇视'
  if (upper.includes('HUAWEI')) return '华为'
  if (upper.includes('EZVIZ')) return '萤石'
  if (upper.includes('IMOU')) return '乐橙'
  if (upper.includes('WFS')) return '创维'
  if (upper.includes('TIANDY') || upper.includes('TDY')) return '天地伟业'
  if (upper.includes('HAOSITONG') || upper.includes('HST')) return '皓视通'
  return '未知'
}

/** 通过UPnP Location URL获取设备详细描述，提取设备名称/型号 */
async function fetchUPnPDeviceDescription(upnpDevices, timeoutMs = 300) {
  const results = []
  for (const dev of upnpDevices) {
    if (!dev.location) continue
    try {
      const url = new URL(dev.location)
      const options = {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method: 'GET',
        timeout: timeoutMs,
        headers: { 'User-Agent': 'UPnP/1.0' }
      }
      const info = await new Promise((resolve) => {
        const req = http.request(options, (res) => {
          let data = ''
          res.on('data', chunk => data += chunk)
          res.on('end', () => {
            try {
              // 从XML描述中提取设备名称
              const nameMatch = data.match(/<friendlyName[^>]*>([^<]+)<\/friendlyName>/i)
              const modelMatch = data.match(/<modelName[^>]*>([^<]+)<\/modelName>/i)
              const mfMatch = data.match(/<manufacturer[^>]*>([^<]+)<\/manufacturer>/i)
              resolve({
                name: nameMatch ? nameMatch[1].trim() : '',
                model: modelMatch ? modelMatch[1].trim() : '',
                vendor: mfMatch ? mfMatch[1].trim() : dev.vendor
              })
            } catch (e) { resolve(null) }
          })
        })
        req.on('error', () => resolve(null))
        req.on('timeout', () => { req.destroy(); resolve(null) })
        req.end()
      })
      if (info) {
        dev.name = info.name || dev.name
        dev.model = info.model || dev.model
        dev.vendor = info.vendor || dev.vendor
      }
    } catch (e) {}
    results.push(dev)
  }
  return results
}

// ============================================================
// ONVIF WS-Discovery
// ============================================================

async function discoverOnvifDevices(timeoutMs = 2000) {
  const devices = []
  const seenIPs = new Set()

  try {
    const interfaces = networkInterfaces()
    const localAddrs = []
    for (const name in interfaces) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          localAddrs.push(iface.address)
        }
      }
    }

    for (const localAddr of localAddrs) {
      try {
        const found = await onvifProbeSingle(localAddr, timeoutMs)
        for (const dev of found) {
          if (!seenIPs.has(dev.ip)) {
            seenIPs.add(dev.ip)
            devices.push(dev)
          }
        }
      } catch (e) {}
    }
  } catch (e) {}

  return devices
}

function onvifProbeSingle(localAddr, timeoutMs) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4')
    const devices = []
    const seenURLs = new Set()
    const uuid = crypto.randomUUID()
    let responseCount = 0

    const probeMsg = `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://www.w3.org/2003/05/soap-envelope"
  xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:d="http://schemas.xmlsoap.org/ws/2005/06/discovery"
  xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <SOAP-ENV:Header>
    <wsa:MessageID>urn:uuid:${uuid}</wsa:MessageID>
    <wsa:To SOAP-ENV:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To>
    <wsa:Action SOAP-ENV:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/06/discovery/Probe</wsa:Action>
  </SOAP-ENV:Header>
  <SOAP-ENV:Body>
    <d:Probe>
      <d:Types>dn:NetworkVideoTransmitter</d:Types>
    </d:Probe>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`

    const timer = setTimeout(() => {
      debugLog(`[ONVIF] ${localAddr} 超时, 收到 ${responseCount} 个响应`);
      try { socket.close() } catch (e) {}
      resolve(devices)
    }, timeoutMs)

    socket.on('error', (err) => {
      debugLog(`[ONVIF] ${localAddr} socket错误:`, err.message);
      clearTimeout(timer)
      try { socket.close() } catch (e) {}
      resolve(devices)
    })

    socket.on('listening', () => {
      try {
        const message = Buffer.from(probeMsg)
        // 组播
        socket.send(message, 0, message.length, 3702, '239.255.255.250')
        // 子网广播
        const parts = localAddr.split('.')
        const broadcast = `${parts[0]}.${parts[1]}.${parts[2]}.255`
        socket.send(message, 0, message.length, 3702, broadcast)
        // 全局广播
        socket.send(message, 0, message.length, 3702, '255.255.255.255')
        debugLog(`[ONVIF] 已从 ${localAddr} 发送探测`);
      } catch (e) {
        debugLog(`[ONVIF] ${localAddr} 发送错误:`, e.message);
        clearTimeout(timer)
        try { socket.close() } catch (e) {}
        resolve(devices)
      }
    })

    socket.on('message', (msg, rinfo) => {
      try {
        responseCount++;
        const response = msg.toString()
        debugLog(`[ONVIF] 收到来自 ${rinfo.address}:${rinfo.port} 的响应`);
        const xaddrsMatch = response.match(/<d:XAddrs>([\s\S]*?)<\/d:XAddrs>/)
        if (xaddrsMatch) {
          const xaddrs = xaddrsMatch[1].trim().split(/\s+/)[0]
          if (!seenURLs.has(xaddrs)) {
            seenURLs.add(xaddrs)
            const ipMatch = xaddrs.match(/http:\/\/(\d+\.\d+\.\d+\.\d+)/)
            const ip = ipMatch ? ipMatch[1] : rinfo.address

            let manufacturer = ''
            let friendlyName = ''
            const scopesMatch = response.match(/<d:Scopes>([\s\S]*?)<\/d:Scopes>/)
            if (scopesMatch) {
              const scopes = scopesMatch[1]
              const mfrMatch = scopes.match(/onvif:\/\/www\.onvif\.org\/name\/([^\s<]+)/)
              if (mfrMatch) manufacturer = decodeURIComponent(mfrMatch[1])
              const nameMatch = scopes.match(/onvif:\/\/www\.onvif\.org\/friendlyname\/([^\s<]+)/)
              if (nameMatch) friendlyName = decodeURIComponent(nameMatch[1])
            }

            if (!manufacturer) {
              if (xaddrs.includes('hikvision') || xaddrs.includes('hik')) manufacturer = '海康威视'
              else if (xaddrs.includes('dahua')) manufacturer = '大华'
              else if (xaddrs.includes('axis')) manufacturer = '安讯士'
              else if (xaddrs.includes('uniview') || xaddrs.includes('unv')) manufacturer = '宇视'
              else if (xaddrs.includes('tp-link') || xaddrs.includes('tplink')) manufacturer = 'TP-Link'
            }

            debugLog(`[ONVIF] 发现设备: ${ip}, 厂商: ${manufacturer || '未知'}`);
            devices.push({
              ip,
              manufacturer: manufacturer || 'ONVIF设备',
              type: 'ONVIF摄像头',
              confidence: 0.9,
              onvif: true,
              xaddrs,
              name: friendlyName || ''
            })
          }
        }
      } catch (e) {}
    })

    socket.bind(0)
  })
}

// ============================================================
// 主扫描函数
// ============================================================

async function fastScan(options = {}, onProgress, onDeviceFound) {
  const {
    networks = null,
    pingConcurrency = 200,   // 借鉴Ingram策略：超高并发
    pingTimeout = 200,       // 增加Ping超时时间，50ms太短导致设备无法响应
    portTimeout = 200,        // 增加端口扫描超时，60ms太短导致慢设备无法响应
    portConcurrency = 30,     // 降低并发以避免网络拥塞丢包
    enableOnvif = true,
    enableARP = true,
    enableEnterprise = true,
    enableUdpDiscovery = true,
    deviceTypeFilter = 'all',  // 'all' | 'monitoring' | 'network'
    discoveryTimeout = 5000,   // UDP发现超时（毫秒）
    fullPortScan = false,
    extraIPs = []
  } = options

  const startTime = Date.now()
  const foundDevices = []
  const seenIPs = new Set()
  // 记录已探测的 (ip:port)，跨多个扫描阶段去重，避免同一端口被重复 TCP connect
  const probedPorts = new Set()

  // 端口探测（带去重）：同一 (ip:port) 在本次扫描中只 connect 一次
  const probePort = (ip, port, timeoutMs) => {
    const key = `${ip}:${port}`
    if (probedPorts.has(key)) return Promise.resolve(false)
    probedPorts.add(key)
    return quickPortCheck(ip, port, timeoutMs)
  }

  // 获取默认网关列表，用于排除路由器
  const gatewayIPs = new Set(await getDefaultGateways())

  // ============================================================
  // 阶段 -1: 全子网 TCP 端口扫描（主动发现，不依赖ARP缓存）
  // 解决"必须扫描两次"问题：首次扫描时ARP表为空，需主动探测所有IP
  // ============================================================
  const allLocalNets = getLocalNetworks()
  const activeIPs = new Set()
  const candIPs = []  // 候选IP列表（全子网，排除网关）

  for (const net of allLocalNets) {
    if (net.network) {
      const parts = net.network.split('.')
      const base = `${parts[0]}.${parts[1]}.${parts[2]}`
      for (let i = 1; i <= 254; i++) {
        const ip = `${base}.${i}`
        // 不再按 .1 后缀一刀切排除：摄像头/NVR 管理地址常在 .1，
        // 仅排除已知网关；低置信度 .1 设备由 addDevice 的置信度检查过滤
        if (!gatewayIPs.has(ip)) {
          candIPs.push(ip)
        }
      }
    }
  }

  if (candIPs.length > 0 && deviceTypeFilter !== 'network') {
    debugLog(`[ActiveScan] 全子网主动扫描 ${candIPs.length} 个IP`)
    if (onProgress) onProgress('active-scan', 0, 1, `正在主动扫描 ${candIPs.length} 个IP...`)

    // 并行检查每个IP的80端口（最快的TCP探测方式）
    const batchSize = 80
    let scannedCount = 0

    for (let i = 0; i < candIPs.length; i += batchSize) {
      const batch = candIPs.slice(i, i + batchSize)
      const results = await Promise.all(
        batch.map(ip => probePort(ip, 80, 300).then(alive => ({ ip, alive })))
      )
      
      for (const r of results) {
        if (r.alive) activeIPs.add(r.ip)
      }
      scannedCount += batch.length
      if (onProgress) onProgress('active-scan', Math.min(scannedCount, candIPs.length), candIPs.length, 
        `主动扫描: ${scannedCount}/${candIPs.length}，活跃: ${activeIPs.size}`)
    }

    debugLog(`[ActiveScan] 发现 ${activeIPs.size} 个活跃IP`)

    // 对活跃IP扫描摄像头专用端口（海康8000/大华37777等）
    if (activeIPs.size > 0) {
      if (onProgress) onProgress('camera-scan', 0, activeIPs.size, `正在识别 ${activeIPs.size} 个设备...`)
      
      const cameraPorts = [8000, 37777, 3456, 6004, 2020, 8080]
      let cameraFound = 0

      for (const port of cameraPorts) {
        const ipsToScan = [...activeIPs].filter(ip => !seenIPs.has(ip))
        if (ipsToScan.length === 0) break
        
        const portResults = await Promise.all(
          ipsToScan.map(ip => probePort(ip, port, 800).then(open => ({ ip, open })))
        )

        for (const { ip, open } of portResults) {
          if (!open || seenIPs.has(ip)) continue

          // 尝试HTTP指纹识别
          let info = null
          try { info = await identifyDevice(ip, port, 1500) } catch (e) {}

          if (info && info.confidence >= 0.3 && !info.isRouter) {
            const brand = info.vendor || guessBrandByPort(port)
            addDevice({
              ip, port, protocol: 'tcp-active',
              type: 'camera',
              vendor: brand,
              model: info.model || '',
              name: info.name || `${brand}`,
              confidence: Math.max(info.confidence || 0.7, 0.7),
              openPorts: [{ port: port, protocol: 'http' }],
              discoveredAt: new Date().toISOString()
            })
            cameraFound++
            debugLog(`[ActiveScan] HTTP确认: ${ip}:${port} -> ${brand}`)
          } else if (port === 8080 || port === 80) {
            // 通用端口，可能是路由器或其他设备，尝试但降低置信度
            if (info && !info.isRouter) {
              addDevice({
                ip, port, protocol: 'tcp-active',
                type: 'camera',
                vendor: info.vendor || guessBrandByPort(port) || '监控设备',
                model: info.model || '',
                name: info.name || info.vendor || '监控设备',
                confidence: 0.45,
                discoveredAt: new Date().toISOString()
              })
              cameraFound++
            }
          } else {
            // 品牌专用端口，直接推断
            const brand = guessBrandByPort(port)
            addDevice({
              ip, port, protocol: 'tcp-active',
              type: 'camera',
              vendor: brand,
              model: '',
              name: `${brand}监控设备`,
              confidence: 0.75,
              discoveredAt: new Date().toISOString()
            })
            cameraFound++
            debugLog(`[ActiveScan] 端口推断: ${ip}:${port} -> ${brand}`)
          }
        }
      }
      
      if (onProgress) onProgress('camera-scan', activeIPs.size, activeIPs.size, `设备识别完成，发现 ${cameraFound} 个监控设备`)
      debugLog(`[ActiveScan] 完成: ${activeIPs.size} 个活跃IP，发现 ${cameraFound} 个监控设备`)
    }
  }

  function addDevice(device) {
    if (!device || !device.ip || seenIPs.has(device.ip)) return
    // 排除默认网关（路由器）
    if (gatewayIPs.has(device.ip)) {
      if (onProgress) onProgress('router-excluded', 0, 1, `排除网关设备: ${device.ip}`)
      return
    }
    // 排除.1结尾的IP（大概率是路由器/网关），但中高置信度设备保留
    if (device.ip.endsWith('.1') && (!device.confidence || device.confidence < 0.5)) {
      debugLog(`[Filter] 排除疑似路由器IP: ${device.ip}`)
      return
    }
    // 放宽过滤：不再排除低置信度未知设备，改为保留并标记
    // 之前的过滤太严格导致正常设备被误排除
    if (device.vendor === '未知' && device.type === 'unknown' && (!device.confidence || device.confidence < 0.3)) {
      debugLog(`[Filter] 排除极低置信度未知设备: ${device.ip}`)
      return
    }
    seenIPs.add(device.ip)
    foundDevices.push(device)
    if (onDeviceFound) onDeviceFound(device)
  }

  // ============================================================
  // 阶段 0: 并行UDP发现（SADP + DHDiscover + UPnP + ONVIF 同时执行）
  // 借鉴Strix策略：所有发现协议并行，大幅缩短发现阶段耗时
  // ============================================================
  const discoveredIPs = new Set()

  if (onProgress) onProgress('discovery', 0, 4, `正在并行发现设备 (${discoveryTimeout/1000}秒超时)...`)

  const discoveryStart = Date.now()

  // 并行执行所有UDP发现协议
  const [
    hikDevices,
    dahuaDevices,
    upnpDevices,
    onvifDevices
  ] = await Promise.all([
    // SADP - 海康设备发现
    enableUdpDiscovery ? discoverHikvisionSADP(discoveryTimeout).catch(() => []) : Promise.resolve([]),
    // DHDiscover - 大华设备发现
    enableUdpDiscovery ? discoverDahuaUDP(discoveryTimeout).catch(() => []) : Promise.resolve([]),
    // UPnP
    enableUdpDiscovery ? discoverUPnPDevices(discoveryTimeout).catch(() => []) : Promise.resolve([]),
    // ONVIF
    (enableOnvif && enableUdpDiscovery) ? discoverOnvifDevices(discoveryTimeout).catch(() => []) : Promise.resolve([])
  ])

  debugLog(`[Discovery] UDP并行发现完成，耗时 ${Date.now() - discoveryStart}ms`)
  debugLog(`[Discovery] SADP:${hikDevices.length} DHDiscover:${dahuaDevices.length} UPnP:${upnpDevices.length} ONVIF:${onvifDevices.length}`)

  // 处理SADP结果
  for (const dev of hikDevices) {
    addDevice({
      ip: dev.ip,
      port: dev.port || 80,
      protocol: 'sadp',
      type: dev.model && dev.model.includes('NVR') ? 'nvr' : 'camera',
      vendor: '海康威视',
      model: dev.model || '',
      name: dev.model || dev.serial || '',
      confidence: 0.98,
      macAddress: dev.macAddress || '',
      openPorts: [dev.port, dev.cmdPort].filter(Boolean),
      discoveredAt: new Date().toISOString()
    })
  }

  // 处理DHDiscover结果
  for (const dev of dahuaDevices) {
    discoveredIPs.add(dev.ip)
    addDevice({
      ip: dev.ip,
      port: dev.port || 80,
      protocol: 'dahua-udp',
      type: dev.type || 'camera',
      vendor: '大华',
      model: dev.model || '',
      name: dev.name || dev.model || '',
      macAddress: dev.macAddress || '',
      confidence: 0.95,
      discoveredAt: new Date().toISOString()
    })
  }

  // 处理UPnP结果（过滤未知vendor的设备，避免加入路由器）
  if (upnpDevices.length > 0) {
    // 快速过滤：只保留有明确厂商信息的UPnP设备，或进行快速HTTP验证
    const upnpCandidates = upnpDevices.filter(dev => {
      // 排除已发现的IP
      if (seenIPs.has(dev.ip) || discoveredIPs.has(dev.ip)) return false
      // 排除网关
      if (gatewayIPs.has(dev.ip)) return false
      // 只保留识别出厂商的设备，未知的需要进一步验证
      return dev.vendor && dev.vendor !== '未知'
    })

    if (upnpCandidates.length > 0) {
      const enriched = await fetchUPnPDeviceDescription(upnpCandidates, 300)
      for (const dev of enriched) {
        discoveredIPs.add(dev.ip)
        addDevice({
          ip: dev.ip,
          port: dev.port || 80,
          protocol: 'upnp',
          type: 'unknown',
          vendor: dev.vendor || 'UPnP设备',
          model: dev.model || '',
          name: dev.name || dev.model || '',
          confidence: 0.85,
          discoveredAt: new Date().toISOString()
        })
      }
    }
  }

  // 处理ONVIF结果
  for (const dev of onvifDevices) {
    discoveredIPs.add(dev.ip)
    addDevice({
      ip: dev.ip,
      port: 80,
      protocol: 'onvif',
      type: 'camera',
      vendor: dev.manufacturer || 'ONVIF设备',
      model: dev.name || dev.type || 'IP摄像头',
      name: dev.name || '',
      confidence: dev.confidence || 0.9,
      discoveredAt: new Date().toISOString()
    })
  }

  if (onProgress) {
    const totalUdp = hikDevices.length + dahuaDevices.length + upnpDevices.length + onvifDevices.length
    const diagMsg = `UDP发现完成: SADP=${hikDevices.length} DHDiscover=${dahuaDevices.length} UPnP=${upnpDevices.length} ONVIF=${onvifDevices.length} (共${totalUdp})`
    debugLog(`[Discovery] ${diagMsg}`)
    onProgress('discovery', 4, 4, diagMsg)
  }

  // 如果UDP发现什么都没找到，且是监控设备扫描，给出诊断提示
  if (deviceTypeFilter === 'monitoring' && hikDevices.length === 0 && dahuaDevices.length === 0 && onvifDevices.length === 0) {
    debugLog('[Discovery] 警告: 未通过组播/广播发现任何监控设备，可能是网络配置问题')
    if (onProgress) onProgress('diagnostic', 0, 1, '未发现监控设备响应，请检查: 1)防火墙是否屏蔽组播 2)摄像头是否在线 3)是否与摄像头在同一网段')
  }

  // ---- 阶段 1: ARP 表读取 ----
  let arpDevices = []
  if (enableARP) {
    if (onProgress) onProgress('arp', 0, 1, '正在读取 ARP 表...')
    try {
      arpDevices = await getARPTable()
      if (onProgress) onProgress('arp', 1, 1, `ARP 表有 ${arpDevices.length} 个设备`)
    } catch (e) {
      if (onProgress) onProgress('arp', 1, 1, 'ARP 读取失败')
    }
  }

  // ---- 阶段 1.5: ARP-MAC HTTP 深度探测（极速版）----
  // 借鉴Ingram策略：高并发短超时，只探测ARP表中未识别的设备
  if (arpDevices.length > 0) {
    if (onProgress) onProgress('arp-probe', 0, 1, '正在通过ARP+HTTP探测识别设备...')

    // 过滤掉已发现、网关和.1结尾的路由器IP
    const candidateIPs = arpDevices.filter(arp => {
      // 排除已知网关IP和已发现的IP
      if (seenIPs.has(arp.ip) || discoveredIPs.has(arp.ip) || gatewayIPs.has(arp.ip)) return false
      // 注：不再无条件排除 .1 结尾 IP，由 addDevice 的置信度检查处理
      return true
    })

    debugLog(`[ARP-Probe] ARP表共 ${arpDevices.length} 个设备，候选 ${candidateIPs.length} 个`)

    // 第一步：高并发检查80端口（借鉴masscan策略：大量并发+短超时）
    const PORT_CHECK_CONCURRENCY = 80
    const portResults = []

    for (let i = 0; i < candidateIPs.length; i += PORT_CHECK_CONCURRENCY) {
      const batch = candidateIPs.slice(i, i + PORT_CHECK_CONCURRENCY)
      const batchPromises = batch.map(arp =>
        probePort(arp.ip, 80, 500).then(open => ({ ip: arp.ip, mac: arp.mac, open }))
      )
      const results = await Promise.all(batchPromises)
      portResults.push(...results.filter(r => r.open))

      if (onProgress && i % 50 === 0) {
        onProgress('arp-probe', Math.min(i + PORT_CHECK_CONCURRENCY, candidateIPs.length), candidateIPs.length,
          `ARP端口探测 ${Math.min(i + PORT_CHECK_CONCURRENCY, candidateIPs.length)}/${candidateIPs.length}...`)
      }
    }

    debugLog(`[ARP-Probe] ${portResults.length} 个IP开放80端口`)

    // 第二步：高并发HTTP识别（借鉴dvr-scanner策略：多线程+短超时）
    const HTTP_CONCURRENCY = 30
    let foundCount = 0

    for (let i = 0; i < portResults.length; i += HTTP_CONCURRENCY) {
      const batch = portResults.slice(i, i + HTTP_CONCURRENCY)
      const batchPromises = batch.map(({ ip, mac }) =>
        identifyDevice(ip, 80, 500).then(info => {
          // 如果识别出是路由器，跳过
          if (info && info.isRouter) return false

          // 如果识别成功且置信度足够（放宽至0.3以捕获更多设备）
          if (info && info.confidence >= 0.3) {
            discoveredIPs.add(ip)
            seenIPs.add(ip)

            const vendor = getVendorFromMAC(mac) || info.vendor || '未知'
            let deviceName = info.name || ''
            let deviceModel = info.model || ''

            // 大华尝试获取详细信息（短超时）
            if (info.vendor === '大华' || vendor === '大华') {
              return getDahuaDeviceInfo(ip, 80, 500).then(dahuaInfo => {
                if (dahuaInfo) {
                  deviceName = dahuaInfo.model || dahuaInfo.name || deviceName
                  deviceModel = dahuaInfo.model || ''
                }
                const finalName = deviceModel || deviceName || `${info.vendor || vendor}设备`
                addDevice({
                  ip,
                  port: 80,
                  protocol: 'arp-http',
                  type: info.type === 'NVR' || info.type === '摄像头/NVR' ? 'nvr' : 'camera',
                  vendor: info.vendor || vendor,
                  model: deviceModel || info.model || '',
                  name: finalName,
                  macAddress: mac,
                  confidence: info.confidence || 0.6,
                  discoveredAt: new Date().toISOString()
                })
                debugLog(`[ARP-Probe] 发现设备: ${ip} -> ${info.vendor || vendor}`)
                return true
              })
            }

            const finalName = deviceModel || deviceName || `${info.vendor || vendor}设备`
            addDevice({
              ip,
              port: 80,
              protocol: 'arp-http',
              type: info.type === 'NVR' || info.type === '摄像头/NVR' ? 'nvr' : 'camera',
              vendor: info.vendor || vendor,
              model: deviceModel || info.model || '',
              name: finalName,
              macAddress: mac,
              confidence: info.confidence || 0.6,
              discoveredAt: new Date().toISOString()
            })
            debugLog(`[ARP-Probe] 发现设备: ${ip} -> ${info.vendor || vendor}`)
            return true
          }

          // 如果identifyDevice返回null或置信度较低，但仍开放80端口
          // 使用MAC地址识别厂商，将设备添加为"网络设备"
          if (!info || (info.confidence >= 0.3 && !info.isRouter)) {
            const vendor = getVendorFromMAC(mac) || (info ? info.vendor : null) || '未知'
            // 不再跳过未知设备，将其加入列表供用户判断
            discoveredIPs.add(ip)
            seenIPs.add(ip)
            addDevice({
              ip,
              port: 80,
              protocol: 'arp-http',
              type: info?.type || 'network-device',
              vendor: vendor,
              model: info?.model || '',
              name: info?.name || `${vendor}设备`,
              macAddress: mac,
              confidence: info?.confidence || 0.3,
              discoveredAt: new Date().toISOString()
            })
            debugLog(`[ARP-Probe] 发现网络设备: ${ip} -> ${vendor} (置信度: ${info?.confidence || 0.3})`)
            return true
          }
          return false
        })
      )
      const results = await Promise.all(batchPromises)
      foundCount += results.filter(r => r === true).length
    }

    if (onProgress) onProgress('arp-probe', 1, 1, `ARP+HTTP探测完成，发现 ${foundCount} 个设备`)
    debugLog(`[ARP-Probe] 完成: ${candidateIPs.length} 个候选IP, ${portResults.length} 个开放80端口, 发现 ${foundCount} 个设备`)
  }

  // ---- 阶段 1.6: 摄像头专用端口扫描（海康8000/大华37777/创维3456/天地伟业6004/TP-Link2020/8080）----
  // 借鉴监控设备扫描器：80端口可能被关闭或重定向，但品牌私有端口直接暴露
  if (deviceTypeFilter !== 'network' && arpDevices.length > 0) {
    if (onProgress) onProgress('camera-ports', 0, 1, '正在扫描摄像头专用端口...')

    // 品牌私有端口对照表
    const cameraPorts = [
      { port: 8000, brand: '海康威视' },
      { port: 37777, brand: '大华' },
      { port: 3456, brand: '创维' },
      { port: 6004, brand: '天地伟业' },
      { port: 2020, brand: 'TP-Link' },
      { port: 8080, brand: null }
    ]

    // 收集尚未被识别的IP候选（排除已发现的IP和网关）
    const cameraCandidates = arpDevices.filter(arp => {
      if (seenIPs.has(arp.ip) || discoveredIPs.has(arp.ip) || gatewayIPs.has(arp.ip)) return false
      return true
    })

    let cameraFound = 0

    if (cameraCandidates.length > 0) {
      debugLog(`[Camera-Ports] 候选IP: ${cameraCandidates.length} 个`)

      for (const { port, brand } of cameraPorts) {
        if (cameraCandidates.length === 0) break

        // 并发检查当前端口
        const batchResults = await Promise.all(
          cameraCandidates.map(arp => probePort(arp.ip, port, 800).then(open => ({ ip: arp.ip, mac: arp.mac, open })))
        )

        const openIPs = batchResults.filter(r => r.open)
        debugLog(`[Camera-Ports] 端口 ${port} 开放: ${openIPs.length} 个`)

        for (const { ip, mac } of openIPs) {
          if (seenIPs.has(ip)) continue

          // 尝试HTTP探测确认设备身份
          let info = null
          try {
            info = await identifyDevice(ip, port, 1000)
          } catch (e) {}

          if (info && info.confidence >= 0.3 && !info.isRouter) {
            // HTTP识别成功
            const vendor = info.vendor || brand || getVendorFromMAC(mac) || '监控设备'
            addDevice({
              ip,
              port,
              protocol: 'camera-port',
              type: 'camera',
              vendor,
              model: info.model || '',
              name: info.name || `${vendor}`,
              macAddress: mac,
              confidence: Math.max(info.confidence || 0.6, 0.6),
              discoveredAt: new Date().toISOString()
            })
            cameraFound++
            debugLog(`[Camera-Ports] HTTP确认: ${ip}:${port} -> ${vendor}`)
          } else if (brand) {
            // 端口能通且匹配已知品牌
            const macVendor = mac ? getVendorFromMAC(mac) : null
            const finalVendor = macVendor && macVendor !== '未知' ? macVendor : brand
            addDevice({
              ip,
              port,
              protocol: 'camera-port',
              type: 'camera',
              vendor: finalVendor,
              model: '',
              name: `${finalVendor}监控设备`,
              macAddress: mac,
              confidence: 0.7,
              discoveredAt: new Date().toISOString()
            })
            cameraFound++
            debugLog(`[Camera-Ports] 端口推测: ${ip}:${port} -> ${finalVendor}`)
          } else {
            // 端口8080无法确定品牌
            const macVendor = mac ? getVendorFromMAC(mac) : null
            if (macVendor && macVendor !== '未知') {
              addDevice({
                ip, port,
                protocol: 'camera-port',
                type: 'camera',
                vendor: macVendor,
                model: '',
                name: `${macVendor}监控设备`,
                macAddress: mac,
                confidence: 0.55,
                discoveredAt: new Date().toISOString()
              })
              cameraFound++
              debugLog(`[Camera-Ports] MAC推断: ${ip}:${port} -> ${macVendor}`)
            }
          }
        }
      }
    }

    if (onProgress) onProgress('camera-ports', 1, 1, `摄像头端口扫描完成，发现 ${cameraFound} 个`)
    debugLog(`[Camera-Ports] 完成: 发现 ${cameraFound} 个监控设备`)
  }

  // ---- 阶段 1.8: 企业级网络设备发现（SNMP + SSH/Telnet）----
  // 对ARP表中未识别的设备尝试SNMP/SSH/Telnet企业设备发现
  // 当 deviceTypeFilter='monitoring' 时跳过（只扫描监控设备）
  if (enableEnterprise && deviceTypeFilter !== 'monitoring' && arpDevices.length > 0) {
    if (onProgress) onProgress('enterprise', 0, 1, '正在扫描企业级网络设备...')

    // 收集尚未被识别的IP候选
    const enterpriseCandidates = arpDevices.filter(arp => {
      if (seenIPs.has(arp.ip) || discoveredIPs.has(arp.ip) || gatewayIPs.has(arp.ip)) return false
      return true
    })

    if (enterpriseCandidates.length > 0) {
      debugLog(`[Enterprise] 候选企业设备IP: ${enterpriseCandidates.length} 个`)

      // 并行执行SNMP探测和SSH/Telnet检测
      const entIPs = enterpriseCandidates.map(a => a.ip)
      const entMacMap = {}
      enterpriseCandidates.forEach(a => { entMacMap[a.ip] = a.mac })

      // SNMP发现（用较短的超时）
      const snmpPromise = discoverEnterpriseDevices(entIPs, 800, 15).then(results => {
        for (const r of results) {
          const mac = entMacMap[r.ip]
          const macVendor = mac ? getVendorFromMAC(mac) : null
          const deviceName = r.sysDescr ? r.sysDescr.substring(0, 50) : `${r.vendor} ${r.type === 'switch' ? '交换机' : r.type === 'router' ? '路由器' : r.type === 'firewall' ? '防火墙' : '设备'}`
          addDevice({
            ip: r.ip,
            port: 161,
            protocol: 'snmp',
            type: r.type,
            vendor: macVendor || r.vendor,
            model: r.sysDescr ? r.sysDescr.substring(0, 80) : '',
            name: deviceName,
            confidence: 0.85,
            discoveredAt: new Date().toISOString(),
            openPorts: [{ port: 161, protocol: 'snmp' }]
          })
        }
        return results.length
      }).catch(() => 0)

      // SSH/Telnet检测（22和23端口）
      const mgmtPromise = (async () => {
        let mgmtFound = 0
        for (let i = 0; i < enterpriseCandidates.length; i += 20) {
          const batch = enterpriseCandidates.slice(i, i + 20)
          const sshResults = await Promise.all(batch.map(async (arp) => {
            const [sshInfo, telnetInfo] = await Promise.all([
              detectManagementService(arp.ip, 22, 800),
              detectManagementService(arp.ip, 23, 800)
            ])
            return { ip: arp.ip, mac: arp.mac, ssh: sshInfo, telnet: telnetInfo }
          }))

          for (const r of sshResults) {
            if (r.ssh?.adminAccess || r.telnet?.adminAccess) {
              const macVendor = r.mac ? getVendorFromMAC(r.mac) : null
              if (!seenIPs.has(r.ip)) {
                const service = r.ssh?.adminAccess ? 'ssh' : 'telnet'
                addDevice({
                  ip: r.ip,
                  port: r.ssh?.adminAccess ? 22 : 23,
                  protocol: service,
                  type: macVendor ? (macVendor.includes('H3C') || macVendor.includes('华为') ? 'switch' : 'router') : 'network',
                  vendor: macVendor || '企业网设备',
                  model: '',
                  name: macVendor ? `${macVendor} 网络设备` : '企业级网络设备',
                  confidence: 0.7,
                  discoveredAt: new Date().toISOString(),
                  openPorts: r.ssh?.adminAccess ? [{ port: 22, protocol: 'ssh' }] : [{ port: 23, protocol: 'telnet' }]
                })
                mgmtFound++
              }
            }
          }
        }
        return mgmtFound
      })().catch(() => 0)

      const [snmpCount, mgmtCount] = await Promise.all([snmpPromise, mgmtPromise])
      if (onProgress) onProgress('enterprise', 1, 1, `企业设备发现完成 (SNMP:${snmpCount} SSH/Telnet:${mgmtCount})`)
      debugLog(`[Enterprise] SNMP发现:${snmpCount}, SSH/Telnet:${mgmtCount}`)
    }
  }

  // ---- 阶段 2: 确定要扫描的网段 ----
  // 只扫描本地网段，避免扫太多无效网段
  const scanNetworks = networks || getLocalNetworks()
  const targetNetworks = []
  const seenNets = new Set()
  for (const n of scanNetworks) {
    const key = `${n.network}/${n.mask}`
    if (!seenNets.has(key)) {
      seenNets.add(key)
      targetNetworks.push(n)
    }
  }

  debugLog(`[Scan] 扫描网段: ${targetNetworks.map(n => n.network + '/' + n.mask).join(', ')}`)

  // ---- 阶段 3: 收集所有已知在线IP ----
  const allOnlineIPs = new Set()
  const arpIPSet = new Set()

  // ARP表设备直接加入（已知在线，无需ping）
  for (const arp of arpDevices) {
    if (!gatewayIPs.has(arp.ip)) {
      allOnlineIPs.add(arp.ip)
      arpIPSet.add(arp.ip)
    }
  }
  // 额外指定IP
  for (const ip of extraIPs) {
    if (!gatewayIPs.has(ip)) {
      allOnlineIPs.add(ip)
    }
  }
  // 协议发现设备
  for (const ip of discoveredIPs) {
    if (!gatewayIPs.has(ip)) {
      allOnlineIPs.add(ip)
    }
  }

  // ---- 阶段 3.5: ICMP Ping 扫描（仅扫 ARP 表中没有的IP，极速版）----
  // 借鉴Ingram策略：超高并发+超短超时
  let pingProgress = 0
  const pingTotal = targetNetworks.length * 254

  if (targetNetworks.length > 0) {
    if (onProgress) onProgress('ping', 0, pingTotal, '正在发现网络中的存活主机...')


    const onlineIPsArray = await multiNetworkPingSweep(
      targetNetworks,
      Math.min(pingConcurrency, 200), // 提高并发到200
      pingTimeout, // 50ms超快超时
      (netDone, netTotal, doneInNet, totalInNet) => {
        pingProgress = Math.min(pingTotal, netDone * 254 + doneInNet)
        if (onProgress && doneInNet % 50 === 0) {
          onProgress('ping', pingProgress, pingTotal,
            `正在扫描第 ${netDone + 1}/${netTotal} 个网段...`)
        }
      }
    )
    for (const ip of onlineIPsArray) {
      if (!gatewayIPs.has(ip) && !arpIPSet.has(ip)) {
        allOnlineIPs.add(ip)
      }
    }
  }

  const onlineIPs = Array.from(allOnlineIPs)
  if (onProgress) {
    onProgress('ping', pingTotal || 1, pingTotal || 1,
      `主机发现完成，共 ${onlineIPs.length} 个`)
  }

  // ---- 阶段 4: 对存活主机进行端口扫描和设备识别（极速版）----
  // 借鉴dvr-scanner+Ingram策略：高并发+短超时+严格过滤
  const portsToScan = fullPortScan ? FULL_PORTS : QUICK_PORTS

  if (onProgress) onProgress('port', 0, onlineIPs.length, `正在识别 ${onlineIPs.length} 个主机...`)

  // 批量端口扫描（每批处理多个IP，而不是逐个串行）
  const IP_BATCH_SIZE = 40

  for (let batchStart = 0; batchStart < onlineIPs.length; batchStart += IP_BATCH_SIZE) {
    const ipBatch = onlineIPs.slice(batchStart, Math.min(batchStart + IP_BATCH_SIZE, onlineIPs.length))

    // 对这批IP并行进行端口扫描
    const batchResults = await Promise.all(
      ipBatch.map(async (ip) => {
        // 跳过已发现的设备和网关
        if (seenIPs.has(ip) || gatewayIPs.has(ip)) return null

        const openPorts = await scanPortsOnHost(ip, portsToScan, portTimeout, portConcurrency, probedPorts)
        return { ip, openPorts }
      })
    )

    // 对端口开放的IP并行进行HTTP识别
    const identifyPromises = []
    for (const result of batchResults) {
      if (!result || result.openPorts.length === 0) continue

      const { ip, openPorts } = result

      // 获取MAC
      const mac = await getMacForIP(ip, arpDevices)
      const macVendor = getVendorFromMAC(mac)

      identifyPromises.push(
        (async () => {
          let deviceInfo = null
          let deviceName = null
          let deviceModel = null

          // 如果80/443/8080开放，尝试HTTP识别（短超时）
          const httpPort = openPorts.find(p => p.port === 80)?.port ||
                           openPorts.find(p => p.port === 443)?.port ||
                           openPorts.find(p => p.port === 8080)?.port
          if (httpPort) {
            deviceInfo = await identifyDevice(ip, httpPort, 200)
            // 如果是路由器页面，直接跳过
            if (deviceInfo?.isRouter) return null
            if (deviceInfo) {
              deviceName = deviceInfo.name
              deviceModel = deviceInfo.model || null
            }
          }

          // 海康ISAPI（短超时）
          if (deviceInfo?.vendor === '海康威视' || openPorts.some(p => p.protocol === 'hikvision')) {
            const hikInfo = await getHikvisionDeviceInfo(ip, 300)
            if (hikInfo) {
              deviceName = hikInfo.name || deviceName
              deviceModel = hikInfo.model || deviceModel
              deviceInfo = deviceInfo || { vendor: '海康威视', confidence: 0.8 }
              deviceInfo.vendor = '海康威视'
              deviceInfo.model = deviceModel
            }
          }

          // 大华CGI（短超时）
          const dahuaPort = openPorts.find(p => p.port === 80)?.port ||
                            openPorts.find(p => p.port === 37777)?.port ||
                            openPorts.find(p => p.port === 37778)?.port
          if (deviceInfo?.vendor === '大华' || openPorts.some(p => p.protocol === 'dahua')) {
            const dahuaInfo = await getDahuaDeviceInfo(ip, dahuaPort, 500)
            if (dahuaInfo) {
              deviceName = dahuaInfo.model || dahuaInfo.name || deviceName
              deviceModel = dahuaInfo.model || deviceModel
              deviceInfo = deviceInfo || { vendor: '大华', confidence: 0.8 }
              deviceInfo.vendor = '大华'
              deviceInfo.model = deviceModel
            }
          }

          // 确定厂商和类型
          let vendor = deviceInfo?.vendor || macVendor || '未知'
          const hasCameraPort = openPorts.some(p =>
            p.port === 554 || p.port === 8554 || p.port === 5000 ||
            p.port === 8000 || p.port === 37777 || p.port === 7001 || p.port === 9000
          )

          // 放宽过滤：没有HTTP识别但开放端口的设备也保留
          // 之前的过滤太严格，导致普通网络设备被跳过
          if (!deviceInfo && !hasCameraPort) {
            // 检查是否开放了常见的网络设备端口（含80端口）
            const hasNetworkPort = openPorts.some(p =>
              p.port === 80 || p.port === 23 || p.port === 22 || p.port === 161 ||
              p.port === 443 || p.port === 8443 || p.port === 8080
            )
            // 注：无需提前 return null，让在线设备都通过（即使无开放端口仍标记为未知设备）
            if (!hasNetworkPort) {
              // 无开放端口但设备在线，仍作为未知网络设备保留
            }
          }

          // 未知vendor但有摄像头端口的设备保留
          if (vendor === '未知' && !hasCameraPort) {
            // 不再跳过，改为标记为网络设备
          }

          let type = deviceInfo?.type || (hasCameraPort ? '摄像头' : 'unknown')
          let confidence = deviceInfo?.confidence || (hasCameraPort ? 0.5 : 0.3)

          // 根据端口特征推断
          if (openPorts.some(p => p.protocol === 'hikvision')) {
            vendor = vendor === '未知' ? '海康威视' : vendor
            type = type === '摄像头' ? 'NVR' : type
            confidence = Math.max(confidence, 0.8)
          }
          if (openPorts.some(p => p.protocol === 'dahua')) {
            vendor = vendor === '未知' ? '大华' : vendor
            type = type === '摄像头' ? 'NVR' : type
            confidence = Math.max(confidence, 0.8)
          }

          // 确定设备类型
          if (openPorts.some(p => p.port === 8000 || p.port === 37777 || p.port === 7001 || p.port === 9000)) {
            type = 'NVR'
          } else if (openPorts.some(p => p.port === 554 || p.port === 8554 || p.port === 5000)) {
            type = '摄像头'
          }

          // 生成设备名称
          let finalName = ''
          const modelToUse = deviceModel || (deviceInfo?.model) || null
          if (modelToUse && modelToUse.length > 2) {
            finalName = modelToUse
          } else if (deviceName && deviceName.length > 2 && !deviceName.includes('摄像头') && !deviceName.includes('NVR')) {
            finalName = deviceName
          } else if (modelToUse) {
            finalName = modelToUse
          } else {
            finalName = `${vendor} ${type}`
            if (vendor === '未知') {
              finalName = `${type} (${ip})`
            }
          }

          const typeCode = type === 'NVR' ? 'nvr' : 'camera'

          return {
            ip,
            port: openPorts[0].port,
            protocol: openPorts[0].protocol,
            type: typeCode,
            vendor,
            model: deviceInfo?.model || '',
            name: finalName,
            confidence,
            openPorts: openPorts.map(p => p.port),
            macAddress: mac
          }
        })()
      )
    }

    // 等待这批识别完成
    const identifiedDevices = await Promise.all(identifyPromises)

    // 添加有效设备
    for (const dev of identifiedDevices) {
      if (dev) {
        addDevice({
          ...dev,
          discoveredAt: new Date().toISOString()
        })
      }
    }

    if (onProgress) {
      onProgress('identify', Math.min(batchStart + IP_BATCH_SIZE, onlineIPs.length), onlineIPs.length,
        `识别中... 已检查 ${Math.min(batchStart + IP_BATCH_SIZE, onlineIPs.length)}/${onlineIPs.length} 个主机，发现 ${foundDevices.length} 个设备`)
    }
  }

  if (onProgress) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    onProgress('done', onlineIPs.length, onlineIPs.length,
      `扫描完成！耗时 ${elapsed} 秒，发现 ${foundDevices.length} 个设备`)
  }

  return foundDevices
}

// ============================================================
// 兼容旧接口
// ============================================================

async function quickScan(onDeviceFound) {
  return fastScan({
    fullPortScan: false,
    pingConcurrency: 80,
    pingTimeout: 80,
    portTimeout: 80
  }, null, onDeviceFound)
}

async function fullScan(onProgress, onDeviceFound) {
  return fastScan({
    fullPortScan: true,
    pingConcurrency: 80,
    pingTimeout: 100,
    portTimeout: 100
  }, (stage, completed, total, message) => {
    if (onProgress) onProgress(completed, total)
  }, onDeviceFound)
}

async function scanNetwork(options = {}, onProgress, onDeviceFound) {
  return fastScan({
    fullPortScan: options.fullScan || false,
    pingConcurrency: options.concurrency || 60,
    pingTimeout: options.timeout || 150,
    portTimeout: 100
  }, (stage, completed, total, message) => {
    if (onProgress) onProgress(completed, total)
  }, onDeviceFound)
}

// ============================================================
// 大华 DHDiscover 协议发现（UDP 37810）
// ============================================================

/**
 * 大华设备 UDP 37810 DHDiscover 协议发现
 * 请求载荷：62字节（32字节二进制头 + 30字节JSON）
 * 响应结构：二进制头 + JSON设备信息 + \n\0 结束符
 * 响应JSON关键字段：mac, params.deviceInfo.DeviceType(型号), MachineName, IPv4Address
 * 参考：腾讯安全应急响应中心 / 绿盟科技 DHDiscover 协议分析
 */
async function discoverDahuaUDP(timeoutMs = 3000) {
  const devices = [];
  const seenIPs = new Set();

  return new Promise((resolve) => {
    try {
      const interfaces = networkInterfaces();
      const localAddrs = [];

      for (const name in interfaces) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            localAddrs.push(iface.address);
          }
        }
      }

      if (localAddrs.length === 0) {
        resolve(devices);
        return;
      }

      // 构造两种请求包（不同设备可能支持不同方法名）
      // 头部: 32字节固定二进制头
      function makePayload(jsonStr) {
        const jsonLen = Buffer.byteLength(jsonStr);
        const totalLen = 32 + jsonLen;
        const header = Buffer.alloc(32);
        header.writeUInt32LE(0x20, 0);  // 第一个字节 0x20
        header.write('DHIP', 4);         // 魔术字
        header.writeUInt32LE(totalLen, 16); // 长度字段1
        header.writeUInt32LE(totalLen, 24); // 长度字段2
        return Buffer.concat([header, Buffer.from(jsonStr)]);
      }

      // 绿盟标准格式: 62字节 (32+30)
      const payloadV1 = makePayload('{"method":"DHDiscover.search"}');
      // 腾讯安全格式: 63字节 (32+31)，注意是大写I
      const payloadV2 = makePayload('{"method":"DHDIscover.search"}');

      debugLog('[DHDiscover] 发送两种请求:', payloadV1.length, '字节 /', payloadV2.length, '字节');
      debugLog('[DHDiscover] 网卡:', localAddrs.join(', '));

      let completed = 0;
      const total = localAddrs.length;
      const sockets = [];
      let responseCount = 0;

      for (const localAddr of localAddrs) {
        try {
          const socket = dgram.createSocket('udp4');

          socket.on('message', (msg, rinfo) => {
            try {
              responseCount++;
              debugLog(`[DHDiscover] 收到来自 ${rinfo.address}:${rinfo.port} 的响应, 长度 ${msg.length} 字节`);

              // 跳过二进制头部，寻找JSON起始 '{' (0x7b)
              let jsonStart = -1;
              for (let i = 0; i < msg.length; i++) {
                if (msg[i] === 0x7b) {
                  jsonStart = i;
                  break;
                }
              }
              if (jsonStart === -1) {
                debugLog('[DHDiscover] 响应中未找到JSON起始位置');
                return;
              }

              // 寻找结束符 \n\0 (0x0a 0x00)
              let jsonEnd = -1;
              for (let i = jsonStart; i < msg.length - 1; i++) {
                if (msg[i] === 0x0a && msg[i + 1] === 0x00) {
                  jsonEnd = i;
                  break;
                }
              }
              if (jsonEnd === -1) jsonEnd = msg.length;

              const jsonStr = msg.slice(jsonStart, jsonEnd).toString('utf8');
              debugLog('[DHDiscover] 解析JSON:', jsonStr.substring(0, 200));
              const data = JSON.parse(jsonStr);

              if (data.method === 'client.notifyDevInfo' && data.params && data.params.deviceInfo) {
                const info = data.params.deviceInfo;
                const ip = (info.IPv4Address && info.IPv4Address.IPAddress) || rinfo.address;

                if (seenIPs.has(ip)) return;
                seenIPs.add(ip);

                // 设备型号：优先DeviceType，其次MachineName
                const deviceModel = (info.DeviceType || '').trim();
                const deviceName = deviceModel || (info.MachineName || '').trim() || '大华设备';

                devices.push({
                  ip,
                  port: (info.HttpPort != null) ? info.HttpPort : 80,
                  managePort: (info.Port != null) ? info.Port : 37777,
                  protocol: 'dahua-udp',
                  type: (info.DeviceClass && info.DeviceClass.toUpperCase().includes('NVR')) ? 'nvr' : 'camera',
                  vendor: '大华',
                  model: deviceModel,
                  name: deviceName,
                  macAddress: (data.mac || ''),
                  version: (info.Version || ''),
                  serial: (info.SerialNo || ''),
                  confidence: 0.95,
                  source: 'dahua-udp'
                });
                debugLog('[DHDiscover] 发现大华设备:', ip, deviceModel);
              }
            } catch (e) {
              debugLog('[DHDiscover] 响应解析错误:', e.message);
            }
          });

          socket.on('error', (err) => {
            debugLog('[DHDiscover] socket错误:', err.message);
            completed++;
            try { socket.close(); } catch (e) {}
            if (completed >= total) {
              debugLog(`[DHDiscover] 完成, 共收到 ${responseCount} 个响应, 发现 ${devices.length} 个设备`);
              resolve(devices);
            }
          });

          socket.on('close', () => {
            if (!socket._dahuaCounted) {
              socket._dahuaCounted = true;
              completed++;
              if (completed >= total) {
                debugLog(`[DHDiscover] 完成, 共收到 ${responseCount} 个响应, 发现 ${devices.length} 个设备`);
                resolve(devices);
              }
            }
          });

          socket.bind(0, () => {
            try {
              socket.setBroadcast(true);
              const parts = localAddr.split('.');
              const broadcast = `${parts[0]}.${parts[1]}.${parts[2]}.255`;

              // 发送V1 (DHDiscover)
              socket.send(payloadV1, 0, payloadV1.length, 37810, broadcast, (err) => {
                if (err) debugLog('[DHDiscover] V1发送错误:', err);
                else debugLog(`[DHDiscover] V1已发送到 ${broadcast}:37810`);
              });
              // 发送V2 (DHDIscover)
              socket.send(payloadV2, 0, payloadV2.length, 37810, broadcast, (err) => {
                if (err) debugLog('[DHDiscover] V2发送错误:', err);
                else debugLog(`[DHDiscover] V2已发送到 ${broadcast}:37810`);
              });
              // 同时发送到全局广播
              socket.send(payloadV1, 0, payloadV1.length, 37810, '255.255.255.255', (err) => {
                if (err) debugLog('[DHDiscover] 全局广播V1错误:', err);
              });
              socket.send(payloadV2, 0, payloadV2.length, 37810, '255.255.255.255', (err) => {
                if (err) debugLog('[DHDiscover] 全局广播V2错误:', err);
              });
            } catch (e) {
              if (!socket._dahuaCounted) {
                socket._dahuaCounted = true;
                completed++;
                try { socket.close(); } catch (err) {}
                if (completed >= total) resolve(devices);
              }
            }
          });

          sockets.push(socket);
        } catch (e) {
          completed++;
          if (completed >= total) resolve(devices);
        }
      }

      // 超时自动返回
      setTimeout(() => {
        debugLog(`[DHDiscover] 超时关闭, 共收到 ${responseCount} 个响应, 发现 ${devices.length} 个设备`);
        for (const s of sockets) {
          try { s.close(); } catch (e) {}
        }
        resolve(devices);
      }, timeoutMs);

    } catch (e) {
      debugLog('[DHDiscover] 异常:', e);
      resolve(devices);
    }
  });
}

// ============================================================
// 企业级网络设备 SNMP/SSH/Telnet 发现
// 用于自动识别交换机、路由器、防火墙等企业设备
// ============================================================

// 常见 SNMP 团体名
const SNMP_COMMUNITIES = ['public', 'private', 'admin', 'manager', 'monitor', 'netman', 'snmp', 'read', 'write']

// 企业级设备 SNMP sysDescr 特征库
const ENTERPRISE_SYSDESCR = {
  // 华为
  huawei: { patterns: [/Huawei/i, /HUAWEI/i, /VRP/i, /Quidway/i, /S\d{4}/, /CE\d{4}/, /AR\d{3,4}/, /NE\d{2,4}/], vendor: '华为' },
  // 华三
  h3c: { patterns: [/H3C/i, /Comware/i, /HPE/i, /S\d{4}/, /MSR\d{2,4}/, /SecPath/i, /S5500/i, /S5800/i], vendor: '华三(H3C)' },
  // 锐捷
  ruijie: { patterns: [/Ruijie/i, /RG-S\d{4}/, /RG-WALL/i, /RG-EG\d+/i, /RGOS/i], vendor: '锐捷' },
  // 思科
  cisco: { patterns: [/Cisco/i, /IOS/i, /IOS-XE/i, /NX-OS/i, /Catalyst/i, /ASA/i], vendor: '思科(Cisco)' },
  // Juniper
  juniper: { patterns: [/Juniper/i, /JUNOS/i, /EX\d{4}/, /SRX\d{3,4}/, /MX\d{3,4}/], vendor: 'Juniper' },
  // Aruba/HPE
  aruba: { patterns: [/Aruba/i, /HP ProCurve/i, /HP Switch/i, /ProCurve/i, /ArubaOS/i], vendor: 'Aruba/HPE' },
  // TP-Link 企业级
  tplink_ent: { patterns: [/TP-Link.*(?:JetStream|Switch|Managed|Smart)/i, /JetStream/i, /T\d{4}G/], vendor: 'TP-Link' },
  // 中兴
  zte: { patterns: [/ZTE/i, /ZXR10/i, /ZXR\d{2}/i], vendor: '中兴' },
  // 博科/Extreme
  brocade: { patterns: [/Brocade/i, /Extreme/i, /EXOS/i, /Summit/i], vendor: 'Extreme/Brocade' },
  // Dell
  dell: { patterns: [/Dell/i, /PowerConnect/i, /Force10/i, /DNOS/i], vendor: 'Dell' },
  // 新格林耐特 G-COM
  gcom: { patterns: [/GCOM/i, /G-Com/i, /S\d{4}.*(?:TC|P|G)/i, /GreenNet/i, /格林耐特/i], vendor: 'G-COM(新格林耐特)' },
  // 迈普 Maipu
  maipu: { patterns: [/Maipu/i, /MyPower/i, /迈普/i, /SM\d{4}/i], vendor: '迈普(Maipu)' },
  // 中兴
  zte: { patterns: [/ZTE/i, /ZXR10/i, /ZXR\d{2}/i], vendor: '中兴(ZTE)' },
  // 烽火 FiberHome
  fiberhome: { patterns: [/FiberHome/i, /烽火/i, /AN\d{4}/i, /ONU/i], vendor: '烽火(FiberHome)' },
  // 博达 BDCOM
  bdcom: { patterns: [/BDCOM/i, /博达/i], vendor: '博达(BDCOM)' },
}

// 企业设备类型判断（根据 sysDescr 内容推断）
function inferEnterpriseDeviceType(sysDescr) {
  const s = sysDescr || ''
  if (/switch|交换机|Catalyst|JetStream|ProCurve|EX\d{4}|Summit|PowerConnect|S\d{4}.*(?:P|L|S)/i.test(s)) return 'switch'
  if (/router|路由器|route|交换.*路由|多业务|MSR|AR\d{3,4}|NE\d{2,4}|SRX\d{3,4}|MX\d{3,4}|RG-EG/i.test(s)) return 'router'
  if (/firewall|防火墙|security|SecPath|USG|FortiGate|PA-|ASA|SRX|RG-WALL|安全网关/i.test(s)) return 'firewall'
  if (/wireless|无线|AC|controller|WX\d{4}|AP\d{4}/i.test(s)) return 'wireless'
  return 'switch' // 默认交换机
}

function identifyEnterpriseVendor(sysDescr) {
  for (const [key, info] of Object.entries(ENTERPRISE_SYSDESCR)) {
    for (const p of info.patterns) {
      if (p.test(sysDescr)) return { vendor: info.vendor, key }
    }
  }
  return { vendor: '企业网设备', key: 'unknown' }
}

/**
 * SNMP sysDescr 探测 - 使用 UDP send + receive
 * 解析 SNMP Get Response v1 报文提取 sysDescr
 */
function snmpGetSysDescr(ip, community = 'public', timeoutMs = 1500) {
  return new Promise((resolve) => {
    try {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
      let resolved = false

      const finish = (result) => {
        if (resolved) return
        resolved = true
        try { socket.close() } catch (e) { }
        resolve(result)
      }

      // 构建 SNMP v1 GetRequest: OID 1.3.6.1.2.1.1.1.0 (sysDescr)
      const oid = [0x2b, 0x06, 0x01, 0x02, 0x01, 0x01, 0x01, 0x00]
      const oidEnc = oid.map(b => {
        if (b <= 0x7f) return [b]
        // 简化OID编码（标准MIB-2 OID各字节均<128）
        return [b]
      }).flat()

      const communityEnc = Buffer.from(community, 'ascii')
      // SNMP PDU body
      const pduBody = Buffer.from([
        0x04, oidEnc.length, ...oidEnc,
        0x05, 0x00  // null value
      ])
      const pduHeader = Buffer.from([
        0x30, pduBody.length + 10,
        0x02, 0x01, 0x00,  // version v1
        0x04, communityEnc.length, ...communityEnc,
        0xA0, pduBody.length
      ])
      const packet = Buffer.concat([pduHeader, pduBody])

      socket.on('message', (msg) => {
        try {
          // 解析 SNMP v1 Response - 查找 sysDescr 字符串
          const data = msg.toString('binary')
          // 查找 OID 1.3.6.1.2.1.1.1.0 的响应值（0x04 长度 字符串）
          const idx = msg.indexOf(Buffer.from([0x2b, 0x06, 0x01, 0x02, 0x01, 0x01, 0x01, 0x00]))
          if (idx < 0) { finish(null); return }

          // 在OID后面找value (0x04 = OCTET STRING)
          const valIdx = msg.indexOf(0x04, idx + 12)
          if (valIdx < 0 || valIdx + 1 >= msg.length) { finish(null); return }

          const valLen = msg[valIdx + 1]
          if (valLen <= 0 || valLen > 255 || valIdx + 2 + valLen > msg.length) { finish(null); return }

          const sysDescr = msg.slice(valIdx + 2, valIdx + 2 + valLen).toString('utf-8').replace(/[^\x20-\x7E\u4e00-\u9fff]/g, '').trim()
          const vendorInfo = identifyEnterpriseVendor(sysDescr)
          const deviceType = inferEnterpriseDeviceType(sysDescr)

          finish({
            sysDescr,
            vendor: vendorInfo.vendor,
            type: deviceType,
            community
          })
        } catch (e) { finish(null) }
      })

      socket.on('error', () => finish(null))
      socket.send(packet, 161, ip, (err) => {
        if (err) finish(null)
      })

      setTimeout(() => finish(null), timeoutMs)
    } catch (e) { resolve(null) }
  })
}

/**
 * 批量 SNMP 企业设备发现
 * 对候选IP列表尝试常见 community strings
 */
async function discoverEnterpriseDevices(ipList, timeoutMs = 2000, concurrency = 20) {
  const results = []
  for (let i = 0; i < ipList.length; i += concurrency) {
    const batch = ipList.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map(async (ip) => {
      for (const community of SNMP_COMMUNITIES) {
        const info = await snmpGetSysDescr(ip, community, timeoutMs)
        if (info) {
          return { ip, ...info }
        }
      }
      return null
    }))
    results.push(...batchResults.filter(Boolean))
  }
  return results
}

/**
 * SSH/Telnet Banner 检测 - 判断是否为可管理的网络设备
 */
function detectManagementService(ip, port = 22, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let resolved = false
    const finish = (result) => { if (!resolved) { resolved = true; try { socket.destroy() } catch(e){}; resolve(result) } }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => {
      // 连接成功，等待 banner
      socket.once('data', (data) => {
        const banner = data.toString('utf-8').trim().substring(0, 200)
        // 检测 SSH banner 特征 (SSH-2.0-xxx)
        if (banner.includes('SSH') || banner.includes('OpenSSH') || banner.includes('Dropbear')) {
          finish({ service: 'ssh', banner, adminAccess: true })
        } else {
          finish({ service: 'unknown-tcp', banner, adminAccess: false })
        }
      })
      setTimeout(() => finish({ service: port === 22 ? 'ssh' : 'telnet', adminAccess: true }), 300)
    })
    socket.once('timeout', () => finish(null))
    socket.once('error', () => finish(null))
    socket.connect(port, ip)
  })
}

module.exports = {
  fastScan,
  quickScan,
  fullScan,
  scanNetwork,
  getLocalNetworks,
  getARPTable,
  discoverOnvifDevices,
  discoverDahuaUDP,
  pingSweep,
  discoverEnterpriseDevices,
  detectManagementService,
  CAMERA_PORTS
}
