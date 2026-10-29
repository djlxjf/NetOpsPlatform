/**
 * 数据接入监测引擎 Store（Pinia）
 * ---------------------------------------------------------------
 * 定位：把「数据接入」模块录入的数据变成数智机房大屏上的实时显示与告警。
 * 开发阶段无真实机房设备，因此本引擎不产生任何模拟数据——它只做三件事：
 *   1) 周期性拉取数据接入记录（机柜传感器 / 动环监测 / 告警）；
 *   2) 按阈值评估温度/湿度，越限时自动生成告警、恢复时自动解除（去重 + 防抖）；
 *   3) 生成「机柜叠加映射」，由 DataCenterView 应用到 3D 机柜与大屏指标。
 *
 * 预留的真实采集链路（对接硬件时启用，界面与存储无需改动）：
 *   - 设备离线探测：主进程实现 probeDevice 通道（ICMP/TCP/SNMP）后在 evaluateOffline 内接入；
 *   - 自动采集：在 dataIngest store 用 registerIngestionAdapter 注册协议适配器。
 *
 * 设计原则（与既有 store 一致）：
 *   - 配置持久化走 window.electronAPI.dbJsonSave/Load，无 IPC 时回落 localStorage；
 *   - 告警/读数读写全部复用 dataIngest store 的 type 驱动通道。
 */
import { defineStore } from 'pinia'
import { reactive, ref, computed } from 'vue'
import { useDataIngestStore } from './dataIngest.js'

const DEFAULT_CONFIG = {
  tempWarning: 30,      // 温度预警阈值（℃）
  tempCritical: 35,     // 温度严重阈值（℃）
  humWarning: 60,       // 湿度预警阈值（%RH）
  humCritical: 80,      // 湿度严重阈值（%RH）
  offlineRetries: 3,    // 连续探测失败几次判定离线（防抖，接真实探测后生效）
  intervalSec: 5        // 大屏数据刷新间隔（秒）
}

function currentUsername() {
  try {
    const u = JSON.parse(localStorage.getItem('netops_user') || 'null')
    if (u && u.username) return u.username
  } catch (e) {}
  return 'default'
}

function tsOf(rec) {
  const t = new Date(rec.recorded_at || rec.created_at || rec.occurred_at || 0).getTime()
  return Number.isFinite(t) ? t : 0
}
function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export const useMonitoringStore = defineStore('monitoring', () => {
  const ingest = useDataIngestStore()

  const config = reactive({ ...DEFAULT_CONFIG })
  const running = ref(false)
  const tickCount = ref(0)
  const lastRunAt = ref(null)
  // 接入模式判定：manual=仅手动录入；auto=已登记并启用自动采集数据源
  const mode = ref('manual')

  // 已生成告警的 key 集合（type:targetId），用于去重与自动恢复
  const alarmKeys = new Set()
  let timer = null

  // ============ 配置持久化 ============
  async function loadConfig() {
    try {
      if (window.electronAPI?.dbJsonLoad) {
        const r = await window.electronAPI.dbJsonLoad({ userId: currentUsername(), dataType: 'monitoring_config' })
        if (r?.success && r.data) Object.assign(config, r.data)
      } else {
        const raw = localStorage.getItem('netops_monitoring_config_' + currentUsername())
        if (raw) Object.assign(config, JSON.parse(raw))
      }
    } catch (e) {}
  }
  async function saveConfig() {
    try {
      const data = JSON.parse(JSON.stringify(config))
      if (window.electronAPI?.dbJsonSave) {
        await window.electronAPI.dbJsonSave({ userId: currentUsername(), dataType: 'monitoring_config', data })
      } else {
        localStorage.setItem('netops_monitoring_config_' + currentUsername(), JSON.stringify(data))
      }
    } catch (e) {}
  }
  async function updateConfig(patch) {
    Object.assign(config, patch)
    await saveConfig()
  }

  // ============ 数据拉取 ============
  async function loadIngestData() {
    await ingest.loadType('sensor')
    await ingest.loadType('env')
    await ingest.loadType('alarm')
  }

  // ============ 阈值评估（温度/湿度越限 → 告警）============
  // 取每个机柜每种指标的最新一条读数进行评估；恢复后自动解除对应告警。
  async function evaluate() {
    const latest = latestReadingsByCabinet()
    for (const [cab, r] of Object.entries(latest)) {
      if (r.temperature != null) {
        if (r.temperature >= config.tempCritical) {
          await ensureAlarm('temperature', cab, 'critical', r.temperature, config.tempCritical, `机柜 ${cab} 温度越限(严重)`, null, cab)
        } else if (r.temperature >= config.tempWarning) {
          await ensureAlarm('temperature', cab, 'warning', r.temperature, config.tempWarning, `机柜 ${cab} 温度越限(预警)`, null, cab)
        } else {
          await resolveAlarm('temperature', cab)
        }
      } else {
        await resolveAlarm('temperature', cab)
      }
      if (r.humidity != null) {
        if (r.humidity >= config.humCritical) {
          await ensureAlarm('humidity', cab, 'critical', r.humidity, config.humCritical, `机柜 ${cab} 湿度越限(严重)`, null, cab)
        } else if (r.humidity >= config.humWarning) {
          await ensureAlarm('humidity', cab, 'warning', r.humidity, config.humWarning, `机柜 ${cab} 湿度越限(预警)`, null, cab)
        } else {
          await resolveAlarm('humidity', cab)
        }
      } else {
        await resolveAlarm('humidity', cab)
      }
    }
  }

  // 每柜最新读数（温度/湿度各取最新一条）
  function latestReadingsByCabinet() {
    const out = {}
    const ts = {}
    for (const s of ingest.records.sensor || []) {
      const cab = s.cabinet_id
      if (!cab) continue
      const t = tsOf(s)
      const v = num(s.value)
      if (v == null) continue
      const metric = s.sensor_type === 'humidity' ? 'humidity' : (s.sensor_type === 'temperature' ? 'temperature' : null)
      if (!metric) continue
      const key = cab + '|' + metric
      if (!(key in ts) || t >= ts[key]) {
        ts[key] = t
        if (!out[cab]) out[cab] = {}
        out[cab][metric] = v
      }
    }
    return out
  }

  // ============ 设备离线探测（预留：接真实硬件后自动启用）============
  // 该能力未实现：主进程未提供 probeDevice 通道，此前唯一的探测入口为死代码（守卫恒真、永不执行）。
  // 未实现期间保持空转，不根据现有状态猜测在线/离线，避免误报。
  // 接入真实探测能力后在此实现：按 monitorConfig 的 managementIp/pollMethod 探测并累计
  // consecutiveFailures，达到 offlineRetries 后置离线并生成告警。
  async function evaluateOffline() {
    return
  }

  // ============ 告警去重/恢复 ============
  async function ensureAlarm(type, targetId, level, value, threshold, title, deviceId, cabinetId) {
    const existing = (ingest.records.alarm || []).find(a =>
      a.alarm_type === type &&
      (a.cabinet_id === cabinetId || (cabinetId == null && a.cabinet_id == null)) &&
      (a.device_id === deviceId || (deviceId == null && a.device_id == null)) &&
      a.status !== 'resolved'
    )
    if (existing) {
      await ingest.updateRecord('alarm', existing.id, {
        metric_value: value != null ? value : existing.metric_value,
        threshold: threshold != null ? threshold : existing.threshold,
        alarm_level: level
      })
    } else {
      await ingest.addRecord('alarm', {
        title,
        alarm_type: type,
        alarm_level: level,
        status: 'active',
        device_id: deviceId || null,
        cabinet_id: cabinetId || null,
        metric_value: value,
        threshold,
        unit: type === 'humidity' ? '%RH' : '℃',
        source_type: 'auto',
        collector_id: 'threshold-engine',
        occurred_at: new Date().toISOString()
      })
    }
    alarmKeys.add(`${type}:${targetId}`)
  }
  async function resolveAlarm(type, targetId) {
    const key = `${type}:${targetId}`
    if (!alarmKeys.has(key)) return
    // targetId 对温度/湿度是机柜编号，对离线告警是设备ID：两边都要能命中
    const existing = (ingest.records.alarm || []).find(a =>
      a.alarm_type === type && a.status !== 'resolved' &&
      (a.cabinet_id === targetId || a.device_id === targetId)
    )
    if (existing) await ingest.updateRecord('alarm', existing.id, { status: 'resolved' })
    alarmKeys.delete(key)
  }

  // ============ 机柜叠加映射（供 3D 大屏应用）============
  // 温度/湿度：每柜每指标取最新读数；状态：未处理告警按最严重级别聚合
  // （critical/major → fault 红，其余 → warning 黄）。
  function buildOverlayMap() {
    const map = {}
    const latest = latestReadingsByCabinet()
    for (const [cab, r] of Object.entries(latest)) {
      if (!map[cab]) map[cab] = {}
      if (r.temperature != null) map[cab].temp = r.temperature
      if (r.humidity != null) map[cab].humidity = r.humidity
    }
    for (const a of ingest.records.alarm || []) {
      if (a.status === 'resolved') continue
      const cab = a.cabinet_id
      if (!cab) continue
      const st = (a.alarm_level === 'critical' || a.alarm_level === 'major') ? 'fault' : 'warning'
      const cur = map[cab] || (map[cab] = {})
      if (!cur.status || (st === 'fault' && cur.status !== 'fault')) cur.status = st
    }
    return map
  }

  // 最新一条动环监测记录（机房级温湿度，供大屏环境指标覆盖）
  function latestEnv() {
    let best = null
    let bestTs = -1
    for (const e of ingest.records.env || []) {
      const t = tsOf(e)
      if (t >= bestTs) { bestTs = t; best = e }
    }
    return best
  }

  // ============ 模式判定 ============
  function updateMode() {
    const hasAuto = (ingest.records.source || []).some(s => s.enabled && s.type !== 'manual')
    mode.value = hasAuto ? 'auto' : 'manual'
  }

  // ============ 引擎启停 ============
  async function tick() {
    await loadIngestData()
    await evaluate()
    await evaluateOffline()
    tickCount.value++
    lastRunAt.value = Date.now()
    updateMode()
  }
  function start() {
    if (running.value) return
    running.value = true
    tick()
    timer = setInterval(tick, Math.max(1, config.intervalSec) * 1000)
  }
  function stop() {
    running.value = false
    if (timer) { clearInterval(timer); timer = null }
  }

  function parseMC(v) {
    if (!v) return {}
    if (typeof v === 'string') {
      try { return JSON.parse(v) } catch (e) { return {} }
    }
    return v || {}
  }

  return {
    config, running, tickCount, lastRunAt, mode,
    loadConfig, saveConfig, updateConfig,
    loadIngestData, evaluate, evaluateOffline,
    buildOverlayMap, latestEnv, latestReadingsByCabinet,
    start, stop, tick, parseMC
  }
})
