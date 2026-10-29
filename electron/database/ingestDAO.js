/**
 * 数据接入 DAO（Data Ingestion DAO）
 * ---------------------------------------------------------------
 * 统一管理四类机房接入数据 + 数据源注册表的持久化：
 *   - ingest_alarms    告警数据
 *   - ingest_sensors   机柜传感器
 *   - ingest_env       动环监测
 *   - ingest_energy    能耗
 *   - ingest_sources   数据源（预留：未来自动采集的采集器注册表）
 *
 * 设计原则（与既有 deviceDAO/cabinetDAO 保持一致）：
 *   1. 所有方法通过 dbManager.getDatabase() 获取 SQLite 实例；
 *   2. 所有写操作返回最新行（便于前端回显）；
 *   3. 读操作统一返回 { success, data } 形状（main.js 的 safeHandle 再包一层）。
 *
 * 扩展点：新增一种数据类型时，只需在 TYPE_TABLE 增加映射 + 在 initTables 增加建表语句，
 *         无需新增 IPC 通道（通道为 type 驱动的通用的 db-ingest-* ）。
 */

const dbManager = require('./db')

// 逻辑类型 -> 物理表名
const TYPE_TABLE = {
  alarm: 'ingest_alarms',
  sensor: 'ingest_sensors',
  env: 'ingest_env',
  energy: 'ingest_energy',
  source: 'ingest_sources'
}

// 各类型可写入的列（用于 INSERT/UPDATE 白名单，防止 SQL 注入与脏字段）
const TYPE_COLUMNS = {
  alarm: ['source_type', 'collector_id', 'project_id', 'recorded_at', 'remark',
    'alarm_level', 'alarm_type', 'title', 'description', 'status',
    'device_id', 'cabinet_id', 'location', 'metric_value', 'threshold', 'unit', 'occurred_at'],
  sensor: ['source_type', 'collector_id', 'project_id', 'recorded_at', 'remark',
    'cabinet_id', 'sensor_type', 'sensor_name', 'value', 'unit', 'location', 'status'],
  env: ['source_type', 'collector_id', 'project_id', 'recorded_at', 'remark',
    'room_id', 'room_name', 'temperature', 'humidity', 'power_status', 'voltage',
    'current_a', 'water_leak', 'smoke', 'door_status', 'ups_status', 'ac_status', 'power_kw'],
  energy: ['source_type', 'collector_id', 'project_id', 'recorded_at', 'remark',
    'room_id', 'device_id', 'meter_id', 'energy_type', 'consumption', 'unit',
    'period_start', 'period_end', 'peak_power', 'cost'],
  source: ['name', 'type', 'target', 'protocol', 'poll_interval', 'config',
    'enabled', 'last_poll_at', 'last_status', 'last_error']
}

// 数值列（写入时做 Number 转换，空串/NaN 落 NULL）
const NUMERIC_COLUMNS = new Set([
  'metric_value', 'threshold', 'value', 'temperature', 'humidity',
  'voltage', 'current_a', 'power_kw', 'consumption', 'peak_power', 'cost', 'poll_interval'
])

function isNumericCol(col) {
  return NUMERIC_COLUMNS.has(col)
}

class IngestDAO {
  constructor() {
    this.db = null
  }

  getDB() {
    if (!this.db) {
      this.db = dbManager.getDatabase()
    }
    return this.db
  }

  _table(type) {
    const t = TYPE_TABLE[type]
    if (!t) throw new Error('未知的数据接入类型: ' + type)
    return t
  }

  _columns(type) {
    return TYPE_COLUMNS[type] || []
  }

  /**
   * 白名单过滤 + 数值归一化
   */
  _normalize(type, raw) {
    const cols = this._columns(type)
    const out = {}
    cols.forEach(col => {
      if (!(col in raw)) return
      let v = raw[col]
      if (v === '' || v === undefined) v = null
      if (v !== null && isNumericCol(col)) {
        const n = Number(v)
        v = Number.isFinite(n) ? n : null
      }
      out[col] = v
    })
    return out
  }

  _genId(type) {
    const prefix = { alarm: 'alm', sensor: 'sen', env: 'env', energy: 'enr', source: 'src' }[type] || 'ing'
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  }

  /**
   * 创建一条记录
   */
  create(type, raw) {
    const db = this.getDB()
    const record = this._normalize(type, raw)
    if (!record.id) record.id = this._genId(type)
    const cols = Object.keys(record)
    const placeholders = cols.map(c => '@' + c)
    const sql = `INSERT INTO ${this._table(type)} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`
    db.prepare(sql).run(record)
    return this.findById(type, record.id)
  }

  /**
   * 批量创建（预留：自动采集落库用）
   */
  createMany(type, list) {
    const db = this.getDB()
    const tx = db.transaction(rows => {
      for (const raw of rows) this.create(type, raw)
    })
    tx(list || [])
    return list ? list.length : 0
  }

  update(type, id, updates) {
    const db = this.getDB()
    const norm = this._normalize(type, updates)
    const fields = Object.keys(norm).filter(k => k !== 'id')
    if (fields.length === 0) return this.findById(type, id)
    const sets = fields.map(f => `${f} = @${f}`)
    sets.push("updated_at = CURRENT_TIMESTAMP")
    const params = { id, ...norm }
    db.prepare(`UPDATE ${this._table(type)} SET ${sets.join(', ')} WHERE id = @id`).run(params)
    return this.findById(type, id)
  }

  delete(type, id) {
    const db = this.getDB()
    const row = this.findById(type, id)
    db.prepare(`DELETE FROM ${this._table(type)} WHERE id = ?`).run(id)
    return row
  }

  findById(type, id) {
    const db = this.getDB()
    return db.prepare(`SELECT * FROM ${this._table(type)} WHERE id = ?`).get(id) || null
  }

  findAll(type, filters = {}) {
    const db = this.getDB()
    let sql = `SELECT * FROM ${this._table(type)} WHERE 1=1`
    const params = {}

    if (filters.status) {
      sql += ' AND status = @status'
      params.status = filters.status
    }
    if (filters.level) {
      sql += ' AND alarm_level = @level'
      params.level = filters.level
    }
    if (filters.sensor_type) {
      sql += ' AND sensor_type = @sensor_type'
      params.sensor_type = filters.sensor_type
    }
    if (filters.energy_type) {
      sql += ' AND energy_type = @energy_type'
      params.energy_type = filters.energy_type
    }
    if (filters.room_id) {
      sql += ' AND room_id = @room_id'
      params.room_id = filters.room_id
    }
    if (filters.cabinet_id) {
      sql += ' AND cabinet_id = @cabinet_id'
      params.cabinet_id = filters.cabinet_id
    }
    if (filters.source_type) {
      sql += ' AND source_type = @source_type'
      params.source_type = filters.source_type
    }
    if (filters.collector_id) {
      sql += ' AND collector_id = @collector_id'
      params.collector_id = filters.collector_id
    }
    if (filters.keyword) {
      // 关键词模糊匹配 title/sensor_name/room_name/name 等常见文本列
      const likeCols = {
        alarm: ['title', 'description', 'location', 'device_id', 'cabinet_id'],
        sensor: ['sensor_name', 'location', 'cabinet_id'],
        env: ['room_name', 'room_id', 'location'],
        energy: ['meter_id', 'room_id', 'device_id'],
        source: ['name', 'target']
      }[type] || ['id']
      const or = likeCols.map(c => `${c} LIKE @kw`).join(' OR ')
      sql += ` AND (${or})`
      params.kw = `%${filters.keyword}%`
    }

    // 数据源按启用状态、其余按时间倒序
    sql += (type === 'source')
      ? ' ORDER BY enabled DESC, name ASC'
      : ' ORDER BY COALESCE(recorded_at, created_at) DESC'

    return db.prepare(sql).all(params)
  }

  /**
   * 统计（各类型差异化）
   */
  getStats(type) {
    const db = this.getDB()
    const t = this._table(type)
    const total = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get().c

    if (type === 'alarm') {
      const active = db.prepare(`SELECT COUNT(*) as c FROM ${t} WHERE status != 'resolved'`).get().c
      const resolved = db.prepare(`SELECT COUNT(*) as c FROM ${t} WHERE status = 'resolved'`).get().c
      const byLevel = db.prepare(`SELECT alarm_level as level, COUNT(*) as count FROM ${t} WHERE status != 'resolved' GROUP BY alarm_level`).all()
      return { total, active, resolved, byLevel }
    }
    if (type === 'sensor') {
      const byStatus = db.prepare(`SELECT status, COUNT(*) as c FROM ${t} GROUP BY status`).all()
        .reduce((acc, r) => { acc[r.status] = r.c; return acc }, {})
      const byType = db.prepare(`SELECT sensor_type, COUNT(*) as c FROM ${t} GROUP BY sensor_type`).all()
      return { total, byStatus, byType }
    }
    if (type === 'env') {
      const latest = db.prepare(`SELECT * FROM ${t} ORDER BY COALESCE(recorded_at, created_at) DESC LIMIT 1`).get() || null
      const avg = db.prepare(`SELECT AVG(temperature) as t, AVG(humidity) as h FROM ${t}`).get()
      return { total, latest, avgTemperature: avg.t, avgHumidity: avg.h }
    }
    if (type === 'energy') {
      const sum = db.prepare(`SELECT SUM(consumption) as s, SUM(cost) as c FROM ${t}`).get()
      const byType = db.prepare(`SELECT energy_type, COUNT(*) as c, SUM(consumption) as s FROM ${t} GROUP BY energy_type`).all()
      return { total, totalConsumption: sum.s || 0, totalCost: sum.c || 0, byType }
    }
    if (type === 'source') {
      const enabled = db.prepare(`SELECT COUNT(*) as c FROM ${t} WHERE enabled = 1`).get().c
      return { total, enabled }
    }
    return { total }
  }

  /**
   * 预留：标记一次采集结果（自动采集落库后回写数据源状态）
   */
  markPoll(type, id, status, error) {
    const db = this.getDB()
    db.prepare(`UPDATE ${this._table(type)} SET last_poll_at = CURRENT_TIMESTAMP, last_status = @s, last_error = @e WHERE id = @id`)
      .run({ id, s: status, e: error || null })
    return this.findById(type, id)
  }
}

module.exports = new IngestDAO()
