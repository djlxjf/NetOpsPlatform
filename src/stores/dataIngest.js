/**
 * 数据接入 Store（Pinia）
 * ---------------------------------------------------------------
 * 统一管理四类机房接入数据 + 数据源的读写，遵循既有 device/cabinet store 的
 * 双轨契约：
 *   - Electron 环境：调用 window.electronAPI.dbIngest*（主进程 SQLite）
 *   - Web/预览 环境：window.electronAPI 由 electron-polyfill 注入，同样走
 *     dbIngest* 通道（其内部回落到按用户分区的 localStorage）；
 *     若极端情况下 electronAPI 完全缺失，本 store 再退一层到 localStorage。
 *
 * 预留自动采集接口：
 *   - 每条记录带 source_type('manual'|'auto') 与 collector_id（关联数据源）；
 *   - adapters 注册表 + registerIngestionAdapter(type, fn) 是未来自动采集的扩展点；
 *   - startAutoCollection/pollSource 为调度骨架（当前为占位，自动采集未启用）。
 */
import { defineStore } from 'pinia'
import { reactive, ref, computed } from 'vue'

const TYPES = ['alarm', 'sensor', 'env', 'energy', 'source']

function currentUsername() {
  try {
    const u = JSON.parse(localStorage.getItem('netops_user') || 'null')
    if (u && u.username) return u.username
  } catch (e) {}
  return 'default'
}

function lsKey(type) {
  return `netops_ingest_${type}_${currentUsername()}`
}

export const useDataIngestStore = defineStore('dataIngest', () => {
  // 各类型记录缓存（source 为数据源）
  const records = reactive({
    alarm: [], sensor: [], env: [], energy: [], source: []
  })
  const stats = reactive({
    alarm: null, sensor: null, env: null, energy: null, source: null
  })
  const loading = ref(false)

  // ============ 预留：自动采集适配器注册表 ============
  // 未来接入真实采集时，通过 registerIngestionAdapter('snmp', async (source) => {...})
  // 注册一个返回记录数组的异步函数；startAutoCollection 会按数据源调用它。
  const adapters = reactive({})
  function registerIngestionAdapter(type, fn) {
    if (typeof fn !== 'function') throw new Error('adapter 必须是函数')
    adapters[type] = fn
  }
  function getAdapter(type) {
    return adapters[type] || null
  }

  // ============ 内部调用封装 ============
  async function api(method, ...args) {
    const apiObj = window.electronAPI
    if (apiObj && typeof apiObj[method] === 'function') {
      return await apiObj[method](...args)
    }
    // 末级回落：直接操作 localStorage（与 polyfill 键约定一致）
    return localFallback(method, ...args)
  }

  function localFallback(method, ...args) {
    // 覆盖常用方法；与 electron-polyfill 的键/形状保持一致
    const run = () => {
      if (method === 'dbIngestFindAll') {
        const [type, filters] = args
        let list = JSON.parse(localStorage.getItem(lsKey(type)) || '[]')
        if (filters) {
          if (filters.status) list = list.filter(r => r.status === filters.status)
          if (filters.keyword) {
            const kw = String(filters.keyword).toLowerCase()
            list = list.filter(r => JSON.stringify(r).toLowerCase().includes(kw))
          }
        }
        return { success: true, data: list }
      }
      if (method === 'dbIngestCreate') {
        const [type, record] = args
        const list = JSON.parse(localStorage.getItem(lsKey(type)) || '[]')
        const rec = { id: `${type}_${Date.now()}`, source_type: 'manual', created_at: new Date().toISOString(), ...record }
        list.push(rec)
        localStorage.setItem(lsKey(type), JSON.stringify(list))
        return { success: true, data: rec }
      }
      if (method === 'dbIngestUpdate') {
        const [type, id, updates] = args
        const list = JSON.parse(localStorage.getItem(lsKey(type)) || '[]')
        const idx = list.findIndex(r => r.id === id)
        if (idx >= 0) list[idx] = { ...list[idx], ...updates }
        localStorage.setItem(lsKey(type), JSON.stringify(list))
        return { success: true, data: list[idx] || null }
      }
      if (method === 'dbIngestDelete') {
        const [type, id] = args
        const list = JSON.parse(localStorage.getItem(lsKey(type)) || '[]')
        localStorage.setItem(lsKey(type), JSON.stringify(list.filter(r => r.id !== id)))
        return { success: true }
      }
      if (method === 'dbIngestGetStats') {
        const [type] = args
        const list = JSON.parse(localStorage.getItem(lsKey(type)) || '[]')
        return { success: true, data: { total: list.length } }
      }
      return { success: false, error: 'no fallback for ' + method }
    }
    return Promise.resolve(run())
  }

  // ============ 通用 CRUD（按 type）============
  async function loadType(type, filters = {}) {
    loading.value = true
    try {
      const res = await api('dbIngestFindAll', type, filters)
      records[type] = res?.success ? (res.data || []) : []
    } catch (e) {
      records[type] = []
    } finally {
      loading.value = false
    }
    await loadStats(type)
    return records[type]
  }

  async function loadStats(type) {
    try {
      const res = await api('dbIngestGetStats', type)
      stats[type] = res?.success ? res.data : null
    } catch (e) {
      stats[type] = null
    }
  }

  async function addRecord(type, record) {
    const res = await api('dbIngestCreate', type, normalizeRecord(type, record))
    if (res?.success) {
      await loadType(type)
    }
    return res
  }

  async function updateRecord(type, id, updates) {
    const res = await api('dbIngestUpdate', type, id, updates)
    if (res?.success) {
      await loadType(type)
    }
    return res
  }

  async function deleteRecord(type, id) {
    const res = await api('dbIngestDelete', type, id)
    if (res?.success) {
      await loadType(type)
    }
    return res
  }

  async function deleteRecords(type, ids = []) {
    for (const id of ids) {
      await api('dbIngestDelete', type, id)
    }
    await loadType(type)
  }

  // 数值字段空串转 null，避免脏数据
  function normalizeRecord(type, record) {
    const out = { ...record }
    Object.keys(out).forEach(k => {
      if (out[k] === '' || out[k] === undefined) out[k] = null
      if (['metric_value', 'threshold', 'value', 'temperature', 'humidity', 'voltage',
        'current_a', 'power_kw', 'consumption', 'peak_power', 'cost', 'poll_interval'].includes(k)) {
        const n = Number(out[k])
        out[k] = Number.isFinite(n) ? n : null
      }
    })
    return out
  }

  // ============ 数据源（预留自动采集）============
  async function loadSources() {
    return await loadType('source')
  }
  function getSources() {
    return records.source
  }
  async function saveSource(source) {
    const rec = normalizeRecord('source', source)
    let res
    if (rec.id) {
      res = await api('dbIngestUpdate', 'source', rec.id, rec)
    } else {
      res = await api('dbIngestCreate', 'source', rec)
    }
    if (res?.success) await loadSources()
    return res
  }
  async function deleteSource(id) {
    return await deleteRecord('source', id)
  }

  // ============ 预留：自动采集调度骨架（当前未启用）============
  // autoTimer 仅作占位；真实采集启用后由 registerIngestionAdapter 提供数据源实现。
  let autoTimer = null
  async function pollSource(source) {
    const adapter = getAdapter(source.type)
    if (!adapter) {
      // 未注册适配器：自动采集接口为预留，当前仅手动录入
      console.info('[数据接入] 类型 ' + source.type + ' 尚未注册采集适配器（预留接口）')
      return { collected: 0, note: 'reserved' }
    }
    try {
      const rows = await adapter(source)
      if (Array.isArray(rows) && rows.length) {
        await api('dbIngestCreateMany', source.type === 'manual' ? 'manual' : source.type, rows)
        if (window.electronAPI?.dbIngestMarkPoll) {
          await api('dbIngestMarkPoll', 'source', source.id, 'ok', null)
        }
      }
      return { collected: rows?.length || 0 }
    } catch (e) {
      if (window.electronAPI?.dbIngestMarkPoll) {
        await api('dbIngestMarkPoll', 'source', source.id, 'error', e.message)
      }
      return { collected: 0, error: e.message }
    }
  }
  function startAutoCollection(sources = []) {
    stopAutoCollection()
    const enabled = sources.filter(s => s.enabled && s.type !== 'manual')
    if (!enabled.length) return
    autoTimer = setInterval(() => {
      enabled.forEach(s => pollSource(s))
    }, 1000 * 60)
  }
  function stopAutoCollection() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null }
  }

  return {
    records, stats, loading,
    loadType, loadStats, addRecord, updateRecord, deleteRecord, deleteRecords,
    loadSources, getSources, saveSource, deleteSource,
    registerIngestionAdapter, getAdapter, pollSource, startAutoCollection, stopAutoCollection
  }
})

export const INGEST_TYPE_LIST = TYPES
