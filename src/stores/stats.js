import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useDeviceStore, useCabinetStore, usePortStateStore, useAlertStore } from '../stores'
import { loadFromDB, saveToDB } from './db-sync-utils'

const STATS_DATA_TYPE = 'statsCache'
const HISTORY_DATA_TYPE = 'statsHistory'

export const useStatsStore = defineStore('stats', () => {
  // 状态 - 从数据库加载，失败则降级到localStorage
  const statsCache = ref(null)
  const statsHistory = ref([])
  const lastUpdated = ref(null)
  
  // 初始化时从数据库加载
  ;(async () => {
    await loadFromDB(STATS_DATA_TYPE, statsCache)
    await loadFromDB(HISTORY_DATA_TYPE, statsHistory)
  })()

  const deviceStore = useDeviceStore()
  const cabinetStore = useCabinetStore()
  const portStateStore = usePortStateStore()
  const alertStore = useAlertStore()

  // 计算属性 - 实时统计数据
  const currentStats = computed(() => {
    const onlineDevices = deviceStore.devices.filter(d => d.status === 'online').length
    const offlineDevices = deviceStore.devices.filter(d => d.status === 'offline').length
    const unknownDevices = deviceStore.devices.filter(d => d.status === 'unknown').length

    const ports = portStateStore.getAllPortStates()
    const upPorts = ports.filter(p => p.isUp).length
    const downPorts = ports.filter(p => !p.isUp).length

    const criticalAlerts = alertStore.alerts.filter(a => a.level === 'critical' && !a.read).length
    const warningAlerts = alertStore.alerts.filter(a => a.level === 'warning' && !a.read).length

    // 设备类型统计
    const deviceTypes = {}
    deviceStore.devices.forEach(d => {
      const type = d.type || 'unknown'
      deviceTypes[type] = (deviceTypes[type] || 0) + 1
    })

    // 厂商统计
    const vendors = {}
    deviceStore.devices.forEach(d => {
      const vendor = d.vendor || 'unknown'
      vendors[vendor] = (vendors[vendor] || 0) + 1
    })

    // 机柜利用率
    const cabinetUtilization = cabinetStore.cabinets.map(cabinet => {
      const usedUs = deviceStore.devices.filter(d => d.cabinetId === cabinet.id).reduce((sum, d) => sum + (d.usize || 1), 0)
      const totalUs = cabinet.usize || 42
      return {
        id: cabinet.id,
        name: cabinet.name,
        usedUs,
        totalUs,
        percentage: totalUs > 0 ? Math.round((usedUs / totalUs) * 100) : 0
      }
    })

    return {
      devices: {
        total: deviceStore.devices.length,
        online: onlineDevices,
        offline: offlineDevices,
        unknown: unknownDevices,
        types: deviceTypes,
        vendors
      },
      cabinets: {
        total: cabinetStore.cabinets.length,
        utilization: cabinetUtilization
      },
      ports: {
        total: ports.length,
        up: upPorts,
        down: downPorts,
        percentage: ports.length > 0 ? Math.round((upPorts / ports.length) * 100) : 0
      },
      alerts: {
        critical: criticalAlerts,
        warning: warningAlerts
      }
    }
  })

  // 方法
  async function refreshStats() {
    statsCache.value = { ...currentStats.value, timestamp: Date.now() }
    lastUpdated.value = Date.now()
    await saveToDB(STATS_DATA_TYPE, statsCache.value)
    
    // 记录历史数据
    await recordHistory()
  }

  async function recordHistory() {
    const historyEntry = {
      timestamp: Date.now(),
      stats: currentStats.value
    }
    
    statsHistory.value.push(historyEntry)
    
    // 只保留最近30天的数据
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    statsHistory.value = statsHistory.value.filter(h => h.timestamp >= thirtyDaysAgo)
    
    await saveToDB(HISTORY_DATA_TYPE, statsHistory.value)
  }

  function getHistory(days = 7) {
    const since = Date.now() - days * 24 * 60 * 60 * 1000
    return statsHistory.value.filter(h => h.timestamp >= since)
  }

  function getTrendData(days = 7) {
    const history = getHistory(days)
    if (history.length === 0) return []

    // 每天取一个数据点（最新的）
    const dailyData = {}
    history.forEach(h => {
      const date = new Date(h.timestamp).toDateString()
      if (!dailyData[date] || dailyData[date].timestamp < h.timestamp) {
        dailyData[date] = h
      }
    })

    return Object.values(dailyData).sort((a, b) => a.timestamp - b.timestamp)
  }

  async function clearHistory() {
    statsHistory.value = []
    await saveToDB(HISTORY_DATA_TYPE, [])
  }

  // 导出统计数据
  function exportStats() {
    return {
      current: currentStats.value,
      history: statsHistory.value,
      exportedAt: Date.now()
    }
  }

  return {
    statsCache,
    statsHistory,
    lastUpdated,
    currentStats,
    refreshStats,
    getHistory,
    getTrendData,
    clearHistory,
    exportStats
  }
})
