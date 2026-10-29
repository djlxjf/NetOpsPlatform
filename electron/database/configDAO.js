/**
 * 配置管理 DAO - 使用SQLite存储设备配置数据
 */

const db = require('./db')

class ConfigDAO {
  constructor() {
    this.initialized = false
  }

  /**
   * 确保数据库已初始化
   */
  ensureInitialized() {
    if (!this.initialized) {
      const database = db.getDb()
      // 创建配置表（如果不存在）
      database.exec(`
        CREATE TABLE IF NOT EXISTS configs (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          data_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `)
      this.initialized = true
    }
  }

  /**
   * 保存配置数据
   */
  save(userId, data) {
    this.ensureInitialized()
    const database = db.getDb()
    
    const id = `${userId}_configs`
    const dataJson = JSON.stringify(data || {})
    
    const stmt = database.prepare(`
      INSERT OR REPLACE INTO configs (id, user_id, data_json, updated_at)
      VALUES (?, ?, ?, datetime('now'))
    `)
    
    stmt.run(id, userId, dataJson)
    
    return { id, userId, data }
  }

  /**
   * 加载配置数据
   */
  load(userId) {
    this.ensureInitialized()
    const database = db.getDb()
    
    const stmt = database.prepare(`
      SELECT data_json FROM configs WHERE user_id = ?
    `)
    
    const row = stmt.get(userId)
    
    if (row) {
      try {
        return JSON.parse(row.data_json || '{}')
      } catch (e) {
        console.error('[ConfigDAO] 解析配置数据失败:', e)
        return {}
      }
    }
    
    return {}
  }

  /**
   * 删除配置数据
   */
  delete(userId) {
    this.ensureInitialized()
    const database = db.getDb()
    
    const stmt = database.prepare(`
      DELETE FROM configs WHERE user_id = ?
    `)
    
    return result
  }
}

module.exports = new ConfigDAO()
