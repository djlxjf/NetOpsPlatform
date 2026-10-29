import { ref, onUnmounted } from 'vue'
import { useDeviceStore, useCabinetStore } from '../stores'
import { ElNotification } from 'element-plus'
import logger from '../utils/logger'

// 全局单例状态
let monitorTimer = null
let isRunning = false // 防止并发
const STATUS_STORAGE_KEY = 'netops_device_status'

// 检测间隔：5 秒持续 ping，ping 不通立即掉线，通了马上恢复在线
const MONITOR_INTERVAL = 5000

// 从 localStorage 恢复持久化状态
function loadPersistedStatus() {
  try {
    const raw = localStorage.getItem(STATUS_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) {
    logger.warn('[DeviceStatus] 读取持久化状态失败', e)
  }
  return {}
}

// 持久化状态到 localStorage
function savePersistedStatus(statusMap) {
  try {
    localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(statusMap))
  } catch (e) {
    logger.warn('[DeviceStatus] 持久化状态失败', e)
  }
}

// 单次 Ping：能 ping 通即在线，ping 不通即离线
// 返回 { online: boolean, detail: string }
async function pingDevice(device) {
  const ip = device.ip || device.ipAddress
  if (!ip || String(ip).trim() === '') {
    return { online: false, detail: '无IP地址' }
  }

  const api = window.electronAPI
  const hasElectronPing = api && typeof api.ping === 'function'

  try {
    let ok = false
    if (hasElectronPing) {
      const result = await api.ping({ target: ip, count: 1, timeout: 3000 })
      ok = !!result?.success
    } else {
      // Web 环境 fallback：尝试 HTTP 连接
      ok = await webFallbackPing(ip)
    }

    return ok
      ? { online: true, detail: 'ping 成功' }
      : { online: false, detail: 'ping 超时或不可达' }
  } catch (e) {
    return { online: false, detail: e?.message || 'ping 异常' }
  }
}

// Web 环境 fallback ping（HTTP 端口探测）
async function webFallbackPing(ip) {
  const ports = [80, 443, 22, 23, 161]
  for (const port of ports) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 2000)
      const res = await fetch(`http://${ip}:${port}`, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal
      })
      clearTimeout(timer)
      // no-cors 模式下 res.ok 永远是 false，能跑到这里说明没抛异常 = 连接成功
      return true
    } catch {
      continue
    }
  }
  return false
}

// 收集机柜内已上架的设备 id 集合
// 机柜内设备状态由用户通过 PWR 手动控制（上架默认开机/关机），不受自动 ping 扫描覆盖
function getCabinetMountedDeviceIds() {
  try {
    const cabinetStore = useCabinetStore()
    const ids = new Set()
    ;(cabinetStore.cabinets || []).forEach(cab => {
      // slots 中的网络设备
      const slots = cab.slots || {}
      Object.values(slots).forEach(id => { if (id) ids.add(String(id)) })
      // patchItems 中的网络设备（配线机柜上架的实体设备）
      ;(cab.patchItems || []).forEach(item => {
        if (item.deviceId) ids.add(String(item.deviceId))
      })
    })
    return ids
  } catch (e) {
    return new Set()
  }
}

// 全量检测（后台异步，不阻塞 UI）
// 返回 Promise，方便手动刷新时 await
async function checkAllDevices() {
  if (isRunning) {
    logger.debug('[DeviceStatus] 上一轮检测尚未完成，跳过')
    return
  }
  isRunning = true

  const deviceStore = useDeviceStore()
  const allDevices = deviceStore.devices.filter(d => d.ip || d.ipAddress)
  if (allDevices.length === 0) {
    isRunning = false
    return
  }

  // 机柜内已上架设备：状态由用户手动控制，跳过自动扫描，避免 ping 覆盖关机状态
  const cabinetMountedIds = getCabinetMountedDeviceIds()

  // 恢复旧状态，用于对比变化
  const oldStatusMap = {}
  deviceStore.devices.forEach(d => {
    oldStatusMap[d.id] = d.status || 'offline'
  })

  const newStatusMap = {}
  const api = window.electronAPI
  const hasElectronPing = api && typeof api.ping === 'function'

  // 分批并发，每批 10 个，避免瞬间打爆网络
  const batchSize = 10
  for (let i = 0; i < allDevices.length; i += batchSize) {
    const batch = allDevices.slice(i, i + batchSize)

    const results = await Promise.allSettled(
      batch.map(async (device) => {
        // 机柜内已上架设备：跳过自动扫描，保持用户手动控制的开/关机状态
        if (cabinetMountedIds.has(String(device.id))) {
          return {
            id: device.id,
            name: device.name || device.ip || device.id,
            status: device.status || 'offline', // 保留当前状态不变
            detail: '机柜内设备，状态由用户手动控制，跳过自动扫描'
          }
        }
        const result = await pingDevice(device)
        return {
          id: device.id,
          name: device.name || device.ip || device.id,
          status: result.online ? 'online' : 'offline',
          detail: result.detail
        }
      })
    )

    results.forEach(r => {
      if (r.status === 'fulfilled' && r.value) {
        newStatusMap[r.value.id] = r.value.status
      }
    })
  }

  // 批量更新 store（触发响应式，三个界面自动同步）
  if (Object.keys(newStatusMap).length > 0) {
    deviceStore.batchSetStatus(newStatusMap)
  }

  // 持久化
  savePersistedStatus(newStatusMap)

  // 状态变化提醒
  Object.entries(newStatusMap).forEach(([deviceId, newStatus]) => {
    const oldStatus = oldStatusMap[deviceId]
    if (oldStatus === newStatus) return // 无变化

    const device = deviceStore.devices.find(d => d.id === deviceId)
    const name = device?.name || deviceId

    if (newStatus === 'offline' && oldStatus === 'online') {
      ElNotification.warning({
        title: '设备离线',
        message: `设备【${name}】已离线`,
        position: 'bottom-right',
        duration: 5000
      })
    } else if (newStatus === 'online' && oldStatus === 'offline') {
      ElNotification.success({
        title: '设备恢复在线',
        message: `设备【${name}】已恢复在线`,
        position: 'bottom-right',
        duration: 3000
      })
    }
  })

  isRunning = false
}

// ============ 对外暴露的 API ============

// 启动定时监测（5 秒持续 ping，后台异步，不卡界面）
export function startDeviceStatusMonitor() {
  if (monitorTimer) return // 防止重复启动

  // 启动时先恢复持久化状态（避免刷新后状态丢失）
  // 注意：机柜内已上架设备的状态由用户手动 PWR 控制，不从持久化状态恢复，避免覆盖上架默认开机状态
  const persisted = loadPersistedStatus()
  const deviceStore = useDeviceStore()
  const cabinetMountedIds = getCabinetMountedDeviceIds()
  const filteredPersisted = {}
  Object.entries(persisted).forEach(([id, status]) => {
    if (!cabinetMountedIds.has(String(id))) {
      filteredPersisted[id] = status
    }
  })
  if (Object.keys(filteredPersisted).length > 0) {
    deviceStore.batchSetStatus(filteredPersisted)
  }

  // 立即检测一次
  checkAllDevices()

  // 每 5 秒检测一次（持续 ping：ping 不通立即掉线，通了马上恢复在线）
  monitorTimer = setInterval(() => {
    checkAllDevices() // 异步，不 await，绝不卡界面
  }, MONITOR_INTERVAL)
}

// 停止定时监测
export function stopDeviceStatusMonitor() {
  if (monitorTimer) {
    clearInterval(monitorTimer)
    monitorTimer = null
  }
}

// 手动刷新（保留原"一键刷新在线状态"按钮功能）
// 返回 Promise，按钮可以 await 后提示结果
export async function refreshDeviceStatus() {
  const deviceStore = useDeviceStore()
  const allDevices = deviceStore.devices.filter(d => d.ip || d.ipAddress)
  if (allDevices.length === 0) return { online: 0, offline: 0 }

  // 先重置 timer，立即执行
  if (monitorTimer) {
    clearInterval(monitorTimer)
  }

  await checkAllDevices()

  // 重启定时器（5 秒持续 ping）
  monitorTimer = setInterval(() => {
    checkAllDevices()
  }, MONITOR_INTERVAL)

  // 统计结果
  let online = 0, offline = 0
  allDevices.forEach(d => {
    if (d.status === 'online') online++
    else offline++
  })
  return { online, offline }
}

// 应用启动时恢复持久化状态（在 App.vue 中调用）
export function restoreDeviceStatus() {
  const persisted = loadPersistedStatus()
  const deviceStore = useDeviceStore()
  if (Object.keys(persisted).length > 0) {
    deviceStore.batchSetStatus(persisted)
  }
}
