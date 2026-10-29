/**
 * Operation Log Composable
 * 用户操作日志管理：记录、查询、过滤、导出
 * 数据持久化到 localStorage，key: netops_operation_logs
 */
import { ref, computed } from 'vue'

const LOGS_KEY = 'netops_operation_logs'
const MAX_LOGS = 5000 // 最多保留5000条日志

// 操作类型枚举
export const LogType = {
  LOGIN: '登录',
  LOGOUT: '退出登录',
  DEVICE_ADD: '添加设备',
  DEVICE_EDIT: '编辑设备',
  DEVICE_DELETE: '删除设备',
  DEVICE_IMPORT: '导入设备',
  DEVICE_EXPORT: '导出设备',
  CABINET_ADD: '添加机柜',
  CABINET_EDIT: '编辑机柜',
  CABINET_DELETE: '删除机柜',
  MOUNT_DEVICE: '上架设备',
  UNMOUNT_DEVICE: '下架设备',
  TOPOLOGY_CONNECT: '创建连线',
  TOPOLOGY_DISCONNECT: '删除连线',
  TOPOLOGY_AUTO_LAYOUT: '自动布局',
  TOPOLOGY_CLEAR: '清空拓扑',
  SSH_CONNECT: 'SSH连接',
  SSH_DISCONNECT: 'SSH断开',
  AUTO_SCAN: '自动扫描',
  CONFIG_COMMAND: '配置命令',
  IP_ADD: '添加IP',
  IP_DELETE: '删除IP',
  BACKUP: '备份数据',
  RESTORE: '恢复数据',
  TOOL_USE: '工具使用',
  OTHER: '其他操作',
}

// 操作结果枚举
export const LogResult = {
  SUCCESS: '成功',
  FAILED: '失败',
  PENDING: '进行中',
}

/**
 * 生成唯一ID
 */
function generateId() {
  return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 获取当前用户（从 authStore 或 localStorage）
 */
function getCurrentUser() {
  try {
    const user = JSON.parse(localStorage.getItem('netops_user') || 'null')
    return user?.name || user?.username || 'admin'
  } catch {
    return 'admin'
  }
}

/**
 * 从 localStorage 加载日志
 */
function loadLogsFromStorage() {
  try {
    const data = localStorage.getItem(LOGS_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

/**
 * 保存日志到 localStorage
 */
function saveLogsToStorage(logs) {
  try {
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs))
  } catch (e) {
    console.warn('[OperationLog] 保存日志失败:', e.message)
  }
}

// 全局日志列表（响应式）
const logs = ref(loadLogsFromStorage())

/**
 * 添加一条日志
 * @param {Object} params
 * @param {string} params.type - 操作类型（LogType 值）
 * @param {string} params.detail - 操作详情描述
 * @param {string} params.result - 操作结果（LogResult 值）
 * @param {string} [params.device] - 关联设备名称/IP
 * @param {string} [params.ip] - 操作IP地址（可选）
 * @param {string} [params.user] - 操作用户（可选，默认当前用户）
 */
export function addLog(params) {
  const log = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    user: params.user || getCurrentUser(),
    device: params.device || '-',
    type: params.type || LogType.OTHER,
    detail: params.detail || '',
    result: params.result || LogResult.SUCCESS,
    ip: params.ip || '-',
  }

  logs.value.unshift(log)

  // 限制日志数量，超出时删除最旧的
  if (logs.value.length > MAX_LOGS) {
    logs.value = logs.value.slice(0, MAX_LOGS)
  }

  saveLogsToStorage(logs.value)
  return log
}

/**
 * 获取过滤后的日志列表
 * @param {Object} filters
 * @param {string} [filters.keyword] - 关键词搜索（匹配 detail、device、user）
 * @param {string} [filters.type] - 操作类型过滤
 * @param {string} [filters.result] - 操作结果过滤
 * @param {string} [filters.startDate] - 开始日期（ISO格式）
 * @param {string} [filters.endDate] - 结束日期（ISO格式）
 * @returns {Array} 过滤后的日志列表
 */
export function getFilteredLogs(filters = {}) {
  let result = [...logs.value]

  if (filters.keyword) {
    const kw = filters.keyword.toLowerCase()
    result = result.filter(log =>
      (log.detail || '').toLowerCase().includes(kw) ||
      (log.device || '').toLowerCase().includes(kw) ||
      (log.user || '').toLowerCase().includes(kw) ||
      (log.ip || '').toLowerCase().includes(kw)
    )
  }

  if (filters.type) {
    result = result.filter(log => log.type === filters.type)
  }

  if (filters.result) {
    result = result.filter(log => log.result === filters.result)
  }

  if (filters.startDate) {
    const start = new Date(filters.startDate).getTime()
    result = result.filter(log => new Date(log.timestamp).getTime() >= start)
  }

  if (filters.endDate) {
    const end = new Date(filters.endDate).getTime() + 86400000 - 1 // 包含整天
    result = result.filter(log => new Date(log.timestamp).getTime() <= end)
  }

  return result
}

/**
 * 获取日志统计
 */
export function getLogStats() {
  const total = logs.value.length
  const success = logs.value.filter(l => l.result === LogResult.SUCCESS).length
  const failed = logs.value.filter(l => l.result === LogResult.FAILED).length
  return { total, success, failed }
}

/**
 * 清空所有日志
 */
export function clearLogs() {
  logs.value = []
  saveLogsToStorage([])
}

/**
 * 清理指定天数之前的日志
 */
export function clearLogsBeforeDays(days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  logs.value = logs.value.filter(l => new Date(l.timestamp).getTime() >= cutoff)
  saveLogsToStorage(logs.value)
}

/**
 * 保存日志到存储（供视图层选择性清理后持久化）
 */
export function saveLogs(newLogs) {
  logs.value = newLogs
  saveLogsToStorage(newLogs)
}

/**
 * 导出日志为文本
 */
export function exportLogsAsText() {
  const lines = logs.value.map(log => {
    const time = new Date(log.timestamp).toLocaleString('zh-CN')
    return `[${time}] [${log.user}] [${log.type}] [${log.result}] 设备:${log.device} IP:${log.ip} ${log.detail}`
  })
  return lines.join('\n')
}

/**
 * 导出日志为 JSON
 */
export function exportLogsAsJSON() {
  return JSON.stringify(logs.value, null, 2)
}

/**
 * 刷新日志（重新从 localStorage 加载）
 */
export function refreshLogs() {
  logs.value = loadLogsFromStorage()
}

/**
 * Composable 形式使用
 */
export function useOperationLog() {
  const filteredLogs = ref([...logs.value])
  const stats = computed(() => getLogStats())

  function applyFilters(filters) {
    filteredLogs.value = getFilteredLogs(filters)
  }

  return {
    logs,
    filteredLogs,
    stats,
    addLog,
    getFilteredLogs,
    getLogStats,
    clearLogs,
    clearLogsBeforeDays,
    saveLogs,
    exportLogsAsText,
    exportLogsAsJSON,
    refreshLogs,
    applyFilters,
    LogType,
    LogResult,
  }
}
