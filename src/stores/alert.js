import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import logger from '../utils/logger'
import { useNotificationStore } from './notification'

const ALERT_LEVELS = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical'
}

const ALERT_TYPES = {
  DEVICE_OFFLINE: 'device_offline',
  DEVICE_ONLINE: 'device_online',
  PING_TIMEOUT: 'ping_timeout',
  HIGH_CPU: 'high_cpu',
  HIGH_MEMORY: 'high_memory',
  CUSTOM: 'custom'
}

export const useAlertStore = defineStore('alerts', () => {
  const alerts = ref([])
  const settings = ref({
    autoCheck: true,
    checkInterval: 30000,
    soundEnabled: true,
    desktopNotification: true,
    autoClearDays: 7,
    alertRules: [
      { enabled: true, type: ALERT_TYPES.DEVICE_OFFLINE, level: ALERT_LEVELS.CRITICAL },
      { enabled: true, type: ALERT_TYPES.DEVICE_ONLINE, level: ALERT_LEVELS.INFO },
      { enabled: true, type: ALERT_TYPES.PING_TIMEOUT, level: ALERT_LEVELS.WARNING }
    ]
  })
  
  const loading = ref(false)
  const unreadCount = computed(() => alerts.value.filter(a => !a.read).length)
  // 未解决（未处置完成）的告警列表
  const pendingAlerts = computed(() => alerts.value.filter(a => a.processStatus !== 'resolved'))

  // 从数据库加载告警
  async function loadAlerts() {
    loading.value = true
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.dbAlertFindAll()
        if (result?.success) {
          alerts.value = result.data || []
          logger.info('[AlertStore] 从数据库加载告警:', alerts.value.length, '条')
        }
      } else {
        // Web环境降级到localStorage
        const username = window.__CURRENT_USER__ || 'default'
        const data = JSON.parse(localStorage.getItem(`netops_alerts_${username}`) || '[]')
        alerts.value = data
      }
    } catch (e) {
      logger.error('[AlertStore] 加载告警失败', e)
      alerts.value = []
    } finally {
      loading.value = false
    }
  }

  // 保存告警到数据库
  async function saveAlertToDB(alert, operation = 'create') {
    if (!window.electronAPI) {
      // Web环境使用localStorage
      const username = window.__CURRENT_USER__ || 'default'
      localStorage.setItem(`netops_alerts_${username}`, JSON.stringify(alerts.value))
      return { success: true }
    }

    try {
      let result = null
      if (operation === 'create') {
        result = await window.electronAPI.dbAlertCreate(alert)
      } else if (operation === 'updateStatus') {
        result = await window.electronAPI.dbAlertUpdateStatus(
          alert.id,
          alert.status,
          alert.resolvedBy,
          alert.resolutionNote
        )
      } else if (operation === 'delete') {
        result = await window.electronAPI.dbAlertDelete(alert.id)
      }
      // 后端 handler 以 { success:false, error } resolve（不是 reject），必须显式判定，
      // 否则调用方拿到 undefined 后会引发次生错误
      if (!result || !result.success) {
        logger.error('[AlertStore] 保存告警到数据库失败:', result?.error || `未知操作 ${operation}`)
        return { success: false, error: result?.error || `未知操作 ${operation}` }
      }
      return result
    } catch (e) {
      logger.error('[AlertStore] 保存告警到数据库失败', e)
      return { success: false, error: e.message }
    }
  }

  // 添加新告警
  async function addAlert(options) {
    const alert = {
      id: options.id || Date.now().toString(),
      title: options.title,
      message: options.message,
      level: options.level || ALERT_LEVELS.WARNING,
      type: options.type || ALERT_TYPES.CUSTOM,
      deviceId: options.deviceId || null,
      deviceName: options.deviceName || null,
      deviceIp: options.deviceIp || null,
      read: false,
      status: 'active',
      processStatus: 'pending',
      timestamp: new Date().toISOString(),
      metadata: options.metadata || {}
    }
    
    alerts.value.unshift(alert)
    await saveAlertToDB(alert, 'create')
    
    // 触发通知
    triggerNotification(alert)
    
    return alert
  }

  // 标记为已读
  async function markAsRead(id) {
    const alert = alerts.value.find(a => a.id === id)
    if (alert) {
      alert.read = true
      // 不需要保存到数据库，这只是前端状态
    }
  }

  // 标记全部为已读
  function markAllAsRead() {
    alerts.value.forEach(a => a.read = true)
  }

  // 删除告警
  async function removeAlert(id) {
    alerts.value = alerts.value.filter(a => a.id !== id)
    await saveAlertToDB({ id }, 'delete')
  }

  // 解决告警
  async function resolveAlert(id, resolvedBy, resolutionNote) {
    const alert = alerts.value.find(a => a.id === id)
    if (alert) {
      alert.status = 'resolved'
      alert.resolvedBy = resolvedBy || 'admin'
      alert.resolutionNote = resolutionNote || ''
      alert.resolvedAt = new Date().toISOString()
      await saveAlertToDB(alert, 'updateStatus')
    }
  }

  // 更新处置状态（未处理 → 处理中 → 已解决）
  async function updateProcessStatus(id, status, note) {
    const alert = alerts.value.find(a => a.id === id)
    if (!alert) return
    alert.processStatus = status
    alert.processNote = note || ''
    alert.processTime = new Date().toISOString()
    // 同步数据库中的 resolved 状态（已解决 → resolved，其余 → active）
    if (status === 'resolved') {
      alert.status = 'resolved'
      alert.resolvedBy = alert.resolvedBy || 'admin'
      alert.resolutionNote = note || alert.resolutionNote || ''
      alert.resolvedAt = alert.processTime
      await saveAlertToDB(alert, 'updateStatus')
    } else if (alert.status === 'resolved') {
      alert.status = 'active'
      await saveAlertToDB(alert, 'updateStatus')
    }
  }

  // 清空已读告警
  async function clearReadAlerts() {
    const readAlerts = alerts.value.filter(a => a.read)
    for (const alert of readAlerts) {
      await saveAlertToDB({ id: alert.id }, 'delete')
    }
    alerts.value = alerts.value.filter(a => !a.read)
  }

  // 清空所有告警
  async function clearAllAlerts() {
    for (const alert of alerts.value) {
      await saveAlertToDB({ id: alert.id }, 'delete')
    }
    alerts.value = []
  }

  // 更新告警设置
  function updateSettings(newSettings) {
    settings.value = { ...settings.value, ...newSettings }
    // 暂时保存到localStorage（后续可以添加到数据库）
    try {
      const username = window.__CURRENT_USER__ || 'default'
      localStorage.setItem(`netops_alert_settings_${username}`, JSON.stringify(settings.value))
    } catch (e) {
      logger.error('保存告警设置失败', e)
    }
  }

  // 加载告警设置
  function loadSettings() {
    try {
      const username = window.__CURRENT_USER__ || 'default'
      const saved = JSON.parse(localStorage.getItem(`netops_alert_settings_${username}`) || 'null')
      if (saved) {
        settings.value = { ...settings.value, ...saved }
      }
    } catch (e) {
      logger.error('加载告警设置失败', e)
    }
  }

  // 触发通知
  function triggerNotification(alert) {
    // 桌面通知：该能力未实现（主进程未提供 sendNotification 通道），暂不发送

    // 播放声音
    if (settings.value.soundEnabled) {
      playNotificationSound(alert.level)
    }

    // 调用通知推送系统发送通知
    try {
      const notiStore = useNotificationStore()
      notiStore.sendNotification(
        alert.level,
        alert.deviceName || '未知设备',
        alert.message,
        alert.type
      )
    } catch (e) {
      logger.error('调用通知推送系统失败', e)
    }
  }

  // 播放通知声音
  function playNotificationSound(level) {
    try {
      // 这里可以添加实际的声音播放逻辑
      logger.info(`播放告警声音: ${level}`)
    } catch (e) {
      logger.error('播放声音失败', e)
    }
  }

  // 获取告警级别标签
  function getAlertLevelLabel(level) {
    const labels = {
      [ALERT_LEVELS.INFO]: '信息',
      [ALERT_LEVELS.WARNING]: '警告',
      [ALERT_LEVELS.CRITICAL]: '严重'
    }
    return labels[level] || '未知'
  }

  // 获取告警类型标签
  function getAlertTypeLabel(type) {
    const labels = {
      [ALERT_TYPES.DEVICE_OFFLINE]: '设备离线',
      [ALERT_TYPES.DEVICE_ONLINE]: '设备上线',
      [ALERT_TYPES.PING_TIMEOUT]: 'Ping超时',
      [ALERT_TYPES.HIGH_CPU]: 'CPU过高',
      [ALERT_TYPES.HIGH_MEMORY]: '内存过高',
      [ALERT_TYPES.CUSTOM]: '自定义'
    }
    return labels[type] || '未知'
  }

  // 清理过期的告警
  async function cleanupOldAlerts() {
    if (settings.value.autoClearDays <= 0) return
    
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - settings.value.autoClearDays)
    
    const oldAlerts = alerts.value.filter(a => new Date(a.timestamp) <= cutoffDate)
    
    // 从数据库删除过期告警
    for (const alert of oldAlerts) {
      try {
        await window.electronAPI.dbAlertDelete(alert.id)
      } catch (e) {
        logger.error('删除过期告警失败', e)
      }
    }
    
    // 从本地状态移除
    alerts.value = alerts.value.filter(a => new Date(a.timestamp) > cutoffDate)
  }

  // 根据告警级别筛选
  const getAlertsByLevel = (level) => computed(() => alerts.value.filter(a => a.level === level))
  
  const criticalAlerts = computed(() => alerts.value.filter(a => a.level === ALERT_LEVELS.CRITICAL))
  const warningAlerts = computed(() => alerts.value.filter(a => a.level === ALERT_LEVELS.WARNING))
  const infoAlerts = computed(() => alerts.value.filter(a => a.level === ALERT_LEVELS.INFO))

  return {
    alerts,
    settings,
    loading,
    unreadCount,
    pendingAlerts,
    criticalAlerts,
    warningAlerts,
    infoAlerts,
    addAlert,
    markAsRead,
    markAllAsRead,
    removeAlert,
    resolveAlert,
    updateProcessStatus,
    clearReadAlerts,
    clearAllAlerts,
    updateSettings,
    loadAlerts,
    loadSettings,
    getAlertLevelLabel,
    getAlertTypeLabel,
    getAlertsByLevel,
    cleanupOldAlerts,
    ALERT_LEVELS,
    ALERT_TYPES
  }
})
