/**
 * 设备数据访问对象 (Device DAO)
 * 封装设备相关的数据库操作
 */

const dbManager = require('./db')

// B7：设备凭据落库加密
//  - 主路径：Electron safeStorage 的 OS 级密钥链（密文前缀 'enc:'）。
//  - 降级路径（safeStorage 不可用，如部分 Linux / 无密钥链环境）：
//    不再以明文 JSON 落库，改用应用级派生密钥（PBKDF2 -> AES-256-CBC）加密，
//    密文前缀 'dk:' 并携带 IV 与 encrypted 标记，读取端对称解密。
//  - 历史明文 JSON 与 'enc:' 密文均保持读取兼容（decCred 自动识别）。
//  - 注：与 main.js 的 credentials 处理保持一致，res?.fallback 兼容路径保留，
//    但降级时不再落明文，改为派生密钥加密（encrypted:true）。
const crypto = require('crypto')

let _safeStorage = null
try { _safeStorage = require('electron').safeStorage } catch (e) { _safeStorage = null }

// 应用级派生密钥（降级加密用，不依赖 OS 密钥链；与打包产物一同分发）
const DERIVED_PASSPHRASE = 'NetOpsPlatform-derived-key-v1'
const DERIVED_SALT = 'netops-static-salt-v1'
let _derivedKey = null
function getDerivedKey() {
  if (_derivedKey) return _derivedKey
  _derivedKey = crypto.pbkdf2Sync(DERIVED_PASSPHRASE, DERIVED_SALT, 100000, 32, 'sha256')
  return _derivedKey
}

function encCred(obj) {
  if (obj == null) return null
  const plain = JSON.stringify(obj)
  // 主路径：safeStorage 可用
  if (_safeStorage && _safeStorage.isEncryptionAvailable()) {
    try {
      return 'enc:' + _safeStorage.encryptString(plain).toString('base64')
    } catch (e) { /* 落到降级加密 */ }
  }
  // 降级路径：派生密钥加密（绝不再存明文 password 等敏感字段）
  try {
    const key = getDerivedKey()
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
    let enc = cipher.update(plain, 'utf8', 'base64')
    enc += cipher.final('base64')
    // 格式：dk:<ivBase64>:<cipherBase64>:1  （末位 1 = encrypted:true）
    return 'dk:' + iv.toString('base64') + ':' + enc + ':1'
  } catch (e) {
    // 极端兜底：加密失败时记录标记位而非明文，避免敏感凭据明文落库
    return 'dk:encfailed:1'
  }
}

function decCred(raw) {
  if (!raw) return null
  if (typeof raw === 'string' && raw.startsWith('enc:')) {
    try {
      if (_safeStorage && _safeStorage.isEncryptionAvailable()) {
        return JSON.parse(_safeStorage.decryptString(Buffer.from(raw.slice(4), 'base64')))
      }
    } catch (e) { /* safeStorage 不可用或解密失败 */ }
    // safeStorage 不可用：旧 enc: 密文无法解密（与历史行为一致，返回 null）
    return null
  }
  if (typeof raw === 'string' && raw.startsWith('dk:')) {
    try {
      const parts = raw.split(':')
      // 容错：极短/损坏的 dk 标记
      if (parts.length < 3 || parts[1] === 'encfailed') return null
      const iv = Buffer.from(parts[1], 'base64')
      const enc = parts[2]
      const key = getDerivedKey()
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
      let dec = decipher.update(enc, 'base64', 'utf8')
      dec += decipher.final('utf8')
      return JSON.parse(dec)
    } catch (e) { return null }
  }
  // 兼容历史明文 JSON（旧数据仍可读，建议后续在写入时统一重写为加密格式）
  try { return JSON.parse(raw) } catch (e) { return null }
}

// devices 表可写列白名单（UPDATE 时仅接受白名单内的键，防止列标识符注入）
const DEVICE_COLUMNS = [
  'name', 'type', 'vendor', 'model', 'ip', 'mac', 'sn', 'status',
  'location', 'rack_id', 'rack_position', 'description', 'credentials', 'monitor_config'
]

class DeviceDAO {
  constructor() {
    this.db = null
  }

  /**
   * 获取数据库实例
   */
  getDB() {
    if (!this.db) {
      this.db = dbManager.getDatabase()
    }
    return this.db
  }

  /**
   * 创建设备
   */
  create(device) {
    const db = this.getDB()
    const stmt = db.prepare(`
      INSERT INTO devices (
        id, name, type, vendor, model, ip, mac, sn,
        status, location, rack_id, rack_position, description, credentials,
        monitor_config
      ) VALUES (
        @id, @name, @type, @vendor, @model, @ip, @mac, @sn,
        @status, @location, @rack_id, @rack_position, @description, @credentials,
        @monitor_config
      )
    `)

    const result = stmt.run({
      id: device.id,
      name: device.name,
      type: device.type,
      vendor: device.vendor || null,
      model: device.model || null,
      ip: device.ip || null,
      mac: device.mac || null,
      sn: device.sn || null,
      status: device.status || 'online',
      location: device.location || null,
      rack_id: device.rack_id || null,
      rack_position: device.rack_position || null,
      description: device.description || null,
      credentials: encCred(device.credentials),
      monitor_config: device.monitor_config ? (typeof device.monitor_config === 'string' ? device.monitor_config : JSON.stringify(device.monitor_config)) : null
    })
    
    return this.findById(device.id)
  }

  /**
   * 更新设备
   */
  update(id, updates) {
    const db = this.getDB()
    
    const fields = []
    const params = {}
    
    Object.keys(updates).forEach(key => {
      if (!DEVICE_COLUMNS.includes(key)) return // 跳过非白名单列，防止列标识符注入
      if (key === 'credentials' && typeof updates[key] === 'object') {
        fields.push(`${key} = @${key}`)
        params[key] = encCred(updates[key])
      } else {
        fields.push(`${key} = @${key}`)
        params[key] = updates[key]
      }
    })

    if (fields.length === 0) {
      // 无可写合法字段：仍回写 updated_at，保持与原行为一致，避免生成非法 SQL
      fields.push('updated_at = CURRENT_TIMESTAMP')
      params.id = id
      const stmt = db.prepare(`UPDATE devices SET ${fields.join(', ')} WHERE id = @id`)
      stmt.run(params)
      return this.findById(id)
    }

    fields.push('updated_at = CURRENT_TIMESTAMP')
    params.id = id

    const sql = `UPDATE devices SET ${fields.join(', ')} WHERE id = @id`
    const stmt = db.prepare(sql)

    stmt.run(params)
    return this.findById(id)
  }

  /**
   * 删除设备
   */
  delete(id) {
    const db = this.getDB()
    // 先获取设备信息
    const device = this.findById(id)
    // 再删除
    const stmt = db.prepare('DELETE FROM devices WHERE id = ?')
    stmt.run(id)
    // 返回被删除的设备
    return device
  }

  /**
   * 根据 ID 查找设备
   */
  findById(id) {
    const db = this.getDB()
    const stmt = db.prepare('SELECT * FROM devices WHERE id = ?')
    const device = stmt.get(id)
    
    if (device) {
      device.credentials = decCred(device.credentials)
    }
    
    return device
  }

  /**
   * 查找所有设备
   * @param {Object} filters - 过滤条件 { type, status, rack_id }
   * @param {number|null} limit  - 可选分页上限；缺省（null）保持原行为（无 LIMIT）
   * @param {number|null} offset - 可选分页偏移；仅当 limit 有效时可生效
   */
  findAll(filters = {}, limit = null, offset = null) {
    const db = this.getDB()
    
    let sql = 'SELECT * FROM devices WHERE 1=1'
    const params = {}
    
    if (filters.type) {
      sql += ' AND type = @type'
      params.type = filters.type
    }
    
    if (filters.status) {
      sql += ' AND status = @status'
      params.status = filters.status
    }
    
    if (filters.rack_id) {
      sql += ' AND rack_id = @rack_id'
      params.rack_id = filters.rack_id
    }
    
    sql += ' ORDER BY created_at DESC'
    
    // 可选分页：仅当显式传入正整数 limit 时附加 LIMIT/OFFSET（缺省行为不变）
    if (Number.isInteger(limit) && limit > 0) {
      sql += ' LIMIT @_limit'
      params._limit = limit
      if (Number.isInteger(offset) && offset >= 0) {
        sql += ' OFFSET @_offset'
        params._offset = offset
      }
    }
    
    const stmt = db.prepare(sql)
    const devices = stmt.all(params)
    
    // 解析 credentials（解密；旧明文自动兼容）
    devices.forEach(device => {
      device.credentials = decCred(device.credentials)
    })
    
    return devices
  }

  /**
   * 根据 IP 查找设备
   */
  findByIP(ip) {
    const db = this.getDB()
    const stmt = db.prepare('SELECT * FROM devices WHERE ip = ?')
    const device = stmt.get(ip)
    
    if (device) {
      device.credentials = decCred(device.credentials)
    }
    
    return device
  }

  /**
   * 更新设备状态
   */
  updateStatus(id, status) {
    const db = this.getDB()
    const stmt = db.prepare(`
      UPDATE devices 
      SET status = @status, 
          last_seen = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `)
    
    return stmt.run({ id, status })
    return this.findById(id)
  }

  /**
   * 获取设备统计（单条聚合 SQL，减少多次 COUNT 往返）
   */
  getStats() {
    const db = this.getDB()
    const row = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'online'  THEN 1 ELSE 0 END) as online,
        SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline,
        SUM(CASE WHEN status = 'warning' THEN 1 ELSE 0 END) as warning
      FROM devices
    `).get()
    return {
      total: row.total || 0,
      online: row.online || 0,
      offline: row.offline || 0,
      warning: row.warning || 0
    }
  }

  /**
   * 批量更新设备状态
   */
  batchUpdateStatus(deviceIds, status) {
    const db = this.getDB()
    
    const transaction = db.transaction((ids) => {
      const stmt = db.prepare(`
        UPDATE devices 
        SET status = @status, 
            last_seen = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
      `)
      
      for (const id of ids) {
        stmt.run({ id, status })
      }
    })
    
    transaction(deviceIds)
  }
}

module.exports = new DeviceDAO()
