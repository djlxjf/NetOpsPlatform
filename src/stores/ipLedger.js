/**
 * IP 台账 Store - 网段管理 + IP 台账（核心数据表）+ 冲突检测 + 自动扫描回填
 * 数据模型遵循《IP地址管理软件 · 基础版 MVP 方案》：
 *  - 网段：CIDR + 备注 + 自动统计
 *  - IP 台账：IP / MAC / 主机名 / 设备类型 / 位置负责人 / 状态
 *  - 冲突检测：同一 IP 多 MAC -> 冲突；同一 MAC 多 IP -> 异常
 *  - 扫描引擎：调用主进程 arpScan（ARP + ICMP）
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { loadFromDB, saveToDB } from './db-sync-utils'

const IP_SUBNETS_DATA = 'ipSubnets'
const IP_LEDGER_DATA = 'ipLedger'
const IP_LAST_SCAN_DATA = 'ipLastScan'
const IP_AUTO_SCAN_DATA = 'ipAutoScan'
const IP_MAC_HISTORY_DATA = 'ipMacHistory'

// MVP 明确要求的设备类型下拉（扩展路由器/防火墙/其他以兼容设备管理导入）
export const DEVICE_TYPES = ['PC', '摄像头', '服务器', '交换机', '路由器', '防火墙', '打印机', '其他']
// IP 状态
export const IP_STATUS = ['空闲', '已占用', '预留']

function defaultSubnets() {
  return [
    { id: '1', cidr: '192.168.1.0/24', remark: '管理网段' },
    { id: '2', cidr: '192.168.10.0/24', remark: '监控网络' }
  ]
}

export const useIPLedgerStore = defineStore('ipLedger', () => {
  const subnets = ref([])
  const ledger = ref([])
  const lastScanTime = ref('')
  const scanning = ref(false)

  // 定时自动扫描
  const autoScanEnabled = ref(false)
  const autoScanInterval = ref(30)
  let autoScanTimer = null

  // MAC 绑定变更历史
  const macHistory = ref([])

  // 初始化时从数据库加载
  ;(async () => {
    await loadFromDB(IP_SUBNETS_DATA, subnets)
    await loadFromDB(IP_LEDGER_DATA, ledger)
    await loadFromDB(IP_LAST_SCAN_DATA, lastScanTime)
    await loadFromDB(IP_MAC_HISTORY_DATA, macHistory)
    // 自动扫描配置为对象 { enabled, interval }
    const autoScanCfg = ref(null)
    await loadFromDB(IP_AUTO_SCAN_DATA, autoScanCfg)
    if (autoScanCfg.value && typeof autoScanCfg.value === 'object') {
      autoScanEnabled.value = !!autoScanCfg.value.enabled
      if (autoScanCfg.value.interval) autoScanInterval.value = autoScanCfg.value.interval
    } else if (autoScanCfg.value !== null) {
      autoScanEnabled.value = !!autoScanCfg.value
    }
    if (!subnets.value || subnets.value.length === 0) {
      subnets.value = defaultSubnets()
      saveSubnets()
    }
  })()

  function saveAutoScanCfg() {
    saveToDB(IP_AUTO_SCAN_DATA, { enabled: autoScanEnabled.value, interval: autoScanInterval.value })
  }
  async function saveMacHistory() {
    await saveToDB(IP_MAC_HISTORY_DATA, macHistory.value)
  }

  async function saveSubnets() {
    await saveToDB(IP_SUBNETS_DATA, subnets.value)
  }
  async function saveLedger() {
    await saveToDB(IP_LEDGER_DATA, ledger.value)
  }
  async function saveMeta() {
    await saveToDB(IP_LAST_SCAN_DATA, lastScanTime.value)
  }

  // ============ 网段管理 ============
  function addSubnet({ cidr, remark }) {
    const c = (cidr || '').trim()
    if (!c) return { success: false, error: 'CIDR 不能为空' }
    if (!isValidCIDR(c)) return { success: false, error: 'CIDR 格式不正确，如 192.168.1.0/24' }
    const s = { id: Date.now().toString() + Math.random().toString(36).slice(2, 6), cidr: c, remark: (remark || '').trim() }
    subnets.value.push(s)
    saveSubnets()
    return { success: true }
  }
  function updateSubnet(id, updates) {
    const idx = subnets.value.findIndex(s => s.id === id)
    if (idx === -1) return
    if (updates.cidr !== undefined) {
      const c = (updates.cidr || '').trim()
      if (!c) return { success: false, error: 'CIDR 不能为空' }
      if (!isValidCIDR(c)) return { success: false, error: 'CIDR 格式不正确，如 192.168.1.0/24' }
      updates.cidr = c
    }
    subnets.value[idx] = { ...subnets.value[idx], ...updates }
    saveSubnets()
    return { success: true }
  }
  function removeSubnet(id) {
    subnets.value = subnets.value.filter(s => s.id !== id)
    saveSubnets()
  }

  // ============ IP 台账 ============
  function isIPUsed(ip) {
    return ledger.value.some(x => x.ip === (ip || '').trim())
  }

  function addRecord(data) {
    const ip = (data.ip || '').trim()
    if (!ip) return { success: false, error: 'IP 地址不能为空' }
    if (!isValidIP(ip)) return { success: false, error: 'IP 地址格式不正确' }
    if (isIPUsed(ip)) return { success: false, error: `IP ${ip} 已存在` }
    ledger.value.push({
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      ip,
      mac: normalizeMAC(data.mac),
      hostname: (data.hostname || '').trim(),
      deviceType: data.deviceType || 'PC',
      location: (data.location || '').trim(),
      owner: (data.owner || '').trim(),
      status: data.status || '已占用',
      updatedAt: new Date().toISOString()
    })
    saveLedger()
    return { success: true }
  }

  function updateRecord(id, updates) {
    const idx = ledger.value.findIndex(x => x.id === id)
    if (idx === -1) return { success: false, error: '记录不存在' }
    // 如果改了 IP，校验格式和重复
    if (updates.ip !== undefined) {
      const newIP = (updates.ip || '').trim()
      if (!newIP) return { success: false, error: 'IP 地址不能为空' }
      if (!isValidIP(newIP)) return { success: false, error: 'IP 地址格式不正确' }
      const dup = ledger.value.find(x => x.ip === newIP && x.id !== id)
      if (dup) return { success: false, error: `IP ${newIP} 已被其他记录占用` }
      updates.ip = newIP
    }
    // MAC 标准化
    if (updates.mac !== undefined) {
      updates.mac = normalizeMAC(updates.mac)
    }
    ledger.value[idx] = { ...ledger.value[idx], ...updates, updatedAt: new Date().toISOString() }
    saveLedger()
    return { success: true }
  }

  function removeRecord(id) {
    ledger.value = ledger.value.filter(x => x.id !== id)
    saveLedger()
  }

  function bulkAdd(records) {
    let added = 0
    let skipped = 0
    records.forEach(r => {
      const ip = (r.ip || '').trim()
      if (!ip || !isValidIP(ip) || isIPUsed(ip)) { skipped++; return }
      ledger.value.push({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        ip,
        mac: normalizeMAC(r.mac),
        hostname: (r.hostname || '').trim(),
        deviceType: r.deviceType || 'PC',
        location: (r.location || '').trim(),
        owner: (r.owner || '').trim(),
        status: r.status || '已占用',
        remark: (r.remark || '').trim(),
        updatedAt: new Date().toISOString()
      })
      added++
    })
    saveLedger()
    return { added, skipped }
  }

  // ============ 冲突检测 ============
  const conflicts = computed(() => {
    const list = []
    const byIP = new Map()
    const byMAC = new Map()
    ledger.value.forEach(r => {
      if (!byIP.has(r.ip)) byIP.set(r.ip, [])
      byIP.get(r.ip).push(r)
      const normalizedMac = normalizeMAC(r.mac)
      if (normalizedMac) {
        if (!byMAC.has(normalizedMac)) byMAC.set(normalizedMac, [])
        byMAC.get(normalizedMac).push(r)
      }
    })
    // 同一 IP 对应多个 MAC -> 冲突
    byIP.forEach((recs, ip) => {
      const macs = new Set(recs.map(r => r.mac).filter(Boolean))
      if (recs.length > 1 && macs.size > 1) {
        list.push({ type: '冲突', ip, macs: [...macs], records: recs, key: 'conflict-' + ip })
      }
    })
    // 同一 MAC 对应多个 IP -> 异常
    byMAC.forEach((recs, mac) => {
      const ips = new Set(recs.map(r => r.ip))
      if (recs.length > 1 && ips.size > 1) {
        list.push({ type: '异常', mac, ips: [...ips], desc: '同MAC多IP', records: recs, key: 'abnormal-' + mac })
      }
    })
    return list
  })

  // ============ 统计 ============
  const stats = computed(() => {
    const total = ledger.value.length
    const used = ledger.value.filter(r => r.status === '已占用').length
    const reserved = ledger.value.filter(r => r.status === '预留').length
    const free = ledger.value.filter(r => r.status === '空闲').length
    return { total, used, reserved, free }
  })

  // ============ 自动扫描 ============
  async function scanNetwork(network) {
    if (!window.electronAPI?.arpScan) return { success: false, error: '扫描引擎不可用' }
    if (scanning.value) return { success: false, error: '扫描正在进行中' }
    scanning.value = true
    try {
      const res = await window.electronAPI.arpScan({ network })
      if (res.success) {
        const devices = res.devices || []
        // 回填台账：已存在同 IP 的设备保留并标记在线；新发现的追加
        devices.forEach(d => {
          const ip = d.ipAddress
          const mac = d.macAddress || ''
          const existing = ledger.value.find(x => x.ip === ip)
          if (existing) {
            // MAC 变更 -> 记录历史 + 标记为异常（冲突检测里会体现）
            if (mac && existing.mac && mac.toLowerCase() !== existing.mac.toLowerCase()) {
              macHistory.value.unshift({
                ip,
                oldMac: existing.mac,
                newMac: mac,
                time: new Date().toISOString()
              })
              // 最多保留 200 条，避免无限累积
              if (macHistory.value.length > 200) macHistory.value = macHistory.value.slice(0, 200)
              existing.remark = (existing.remark || '') + ' [MAC变更]'
            }
            if (mac) existing.mac = mac
            existing.status = '已占用'
          } else {
            ledger.value.push({
              id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
              ip,
              mac,
              hostname: '',
              deviceType: mapDeviceType(d.deviceType || d.manufacturer),
              location: '',
              owner: '',
              status: '已占用',
              remark: '自动扫描发现',
              updatedAt: new Date().toISOString()
            })
          }
        })
        lastScanTime.value = new Date().toISOString()
        saveLedger()
        saveMeta()
        saveMacHistory()
        return { success: true, count: devices.length, devices }
      }
      return res
    } catch (e) {
      return { success: false, error: e.message }
    } finally {
      scanning.value = false
    }
  }

  // ============ 定时自动扫描 ============
  async function runAutoScanOnce() {
    // 依次扫描所有网段
    const targets = subnets.value.length ? subnets.value.map(s => s.cidr) : []
    for (const cidr of targets) {
      if (scanning.value) continue
      await scanNetwork(cidr)
    }
  }
  function startAutoScan(intervalMinutes = 30) {
    stopAutoScan()
    autoScanEnabled.value = true
    autoScanInterval.value = Number(intervalMinutes) || 30
    saveAutoScanCfg()
    const ms = autoScanInterval.value * 60 * 1000
    autoScanTimer = setInterval(runAutoScanOnce, ms)
    // 开启后立即执行一次
    runAutoScanOnce()
  }
  function stopAutoScan() {
    autoScanEnabled.value = false
    if (autoScanTimer) {
      clearInterval(autoScanTimer)
      autoScanTimer = null
    }
    saveAutoScanCfg()
  }

  // ============ 从设备管理导入设备 IP ============
  // 将设备管理（deviceStore.devices）中的设备 IP 记录到 IP 台账：
  // IP 取设备 ip、主机名取设备名、类型按设备类型映射、位置取设备位置；
  // 重复 IP / 无效 IP 自动跳过（bulkAdd 内置校验）。
  function importFromDevices(devices) {
    const list = Array.isArray(devices) ? devices : []
    const records = list
      .filter(d => d && d.ip && isValidIP(String(d.ip).trim()))
      .map(d => ({
        ip: String(d.ip).trim(),
        mac: (d.mac || '').trim(),
        hostname: (d.name || '').trim(),
        deviceType: mapDeviceManagerType(d.type),
        location: (d.location || '').trim(),
        owner: (d.owner || '').trim(),
        status: '已占用',
        remark: '来自设备管理' + (d.vendor ? ' · ' + d.vendor : '')
      }))
    if (records.length === 0) {
      return { added: 0, skipped: list.length, total: list.length }
    }
    const res = bulkAdd(records)
    return { ...res, total: records.length }
  }

  return {
    subnets,
    ledger,
    lastScanTime,
    scanning,
    autoScanEnabled,
    autoScanInterval,
    macHistory,
    conflicts,
    stats,
    addSubnet,
    updateSubnet,
    removeSubnet,
    addRecord,
    updateRecord,
    removeRecord,
    bulkAdd,
    importFromDevices,
    isIPUsed,
    scanNetwork,
    startAutoScan,
    stopAutoScan,
    isValidIP,
    isValidCIDR,
    normalizeMAC
  }
})

function mapDeviceType(raw) {
  const t = (raw || '').toLowerCase()
  if (t.includes('switch') || t.includes('交换机')) return '交换机'
  if (t.includes('server') || t.includes('服务器')) return '服务器'
  if (t.includes('camera') || t.includes('摄像头')) return '摄像头'
  if (t.includes('print') || t.includes('打印机')) return '打印机'
  if (t.includes('pc') || t.includes('computer')) return 'PC'
  return 'PC'
}

// 设备管理 type（英文）→ IP 台账设备类型（中文）
function mapDeviceManagerType(raw) {
  const t = (raw || '').toLowerCase()
  if (t.includes('switch') || t.includes('交换机')) return '交换机'
  if (t.includes('router') || t.includes('路由')) return '路由器'
  if (t.includes('firewall') || t.includes('防火墙') || t.includes('安全') || t.includes('网闸')) return '防火墙'
  if (t.includes('camera') || t.includes('ipc') || t.includes('nvr') || t.includes('dvr') || t.includes('摄像头')) return '摄像头'
  if (t.includes('server') || t.includes('storage') || t.includes('nas') || t.includes('服务器')) return '服务器'
  if (t.includes('print') || t.includes('打印机')) return '打印机'
  if (t.includes('pc') || t.includes('computer') || t.includes('terminal')) return 'PC'
  return '其他'
}

function isValidIP(ip) {
  if (typeof ip !== 'string') return false
  // 严格口径：带首尾空格一律判为非法（" 1.2.3.4 " => false），避免脏数据入库。
  // 各调用方（addSubnet/updateSubnet/addRecord/updateRecord/importFromDevices）
  // 均已先 .trim() 再调用本函数，故收紧不会破坏现有入口。
  if (ip !== ip.trim()) return false
  const parts = ip.split('.')
  if (parts.length !== 4) return false
  return parts.every(p => {
    if (!/^\d{1,3}$/.test(p)) return false
    const n = parseInt(p, 10)
    return n >= 0 && n <= 255
  })
}

function isValidCIDR(cidr) {
  if (typeof cidr !== 'string') return false
  // 与 isValidIP 一致的严格口径：带首尾空格一律判为非法（" 192.168.1.0/24 " => false）
  if (cidr !== cidr.trim()) return false
  const m = cidr.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/)
  if (!m) return false
  const ip = m[1]
  const prefix = parseInt(m[2], 10)
  if (prefix < 0 || prefix > 32) return false
  return isValidIP(ip)
}

function normalizeMAC(mac) {
  if (!mac || typeof mac !== 'string') return ''
  return mac.trim().toUpperCase().replace(/[-]/g, ':')
}