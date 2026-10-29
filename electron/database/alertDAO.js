/**
 * 告警数据访问对象 (Alert DAO)
 */

const dbManager = require('./db')

class AlertDAO {
  constructor() {
    this.db = null
  }

  getDB() {
    if (!this.db) {
      this.db = dbManager.getDatabase()
    }
    return this.db
  }

  /**
   * 创建告警
   */
  create(alert) {
    const db = this.getDB()
    const stmt = db.prepare(`
      INSERT INTO alerts (
        id, device_id, rule_id, level, title, message, status
      ) VALUES (
        @id, @device_id, @rule_id, @level, @title, @message, @status
      )
    `)
    
    stmt.run({
      id: alert.id,
      device_id: alert.device_id || null,
      rule_id: alert.rule_id || null,
      level: alert.level || 'warning',
      title: alert.title,
      message: alert.message || null,
      status: alert.status || 'active'
    })
    
    return this.findById(alert.id)
  }

  /**
   * 更新告警状态
   */
  updateStatus(id, status, resolvedBy = null, resolutionNote = null) {
    const db = this.getDB()
    
    const stmt = db.prepare(`
      UPDATE alerts 
      SET status = @status,
          resolved_at = CASE WHEN @status = 'resolved' THEN CURRENT_TIMESTAMP ELSE resolved_at END,
          resolved_by = @resolved_by,
          resolution_note = @resolution_note
      WHERE id = @id
    `)
    
    stmt.run({
      id,
      status,
      resolved_by: resolvedBy,
      resolution_note: resolutionNote
    })
    
    return this.findById(id)
  }

  /**
   * 增加告警计数
   */
  incrementCount(id) {
    const db = this.getDB()
    const stmt = db.prepare(`
      UPDATE alerts 
      SET count = count + 1,
          last_triggered = CURRENT_TIMESTAMP
      WHERE id = @id
    `)
    
    stmt.run({ id })
    return this.findById(id)
  }

  /**
   * 根据 ID 查找告警
   */
  findById(id) {
    const db = this.getDB()
    const stmt = db.prepare('SELECT * FROM alerts WHERE id = ?')
    return stmt.get(id)
  }

  /**
   * 删除告警
   */
  delete(id) {
    const db = this.getDB()
    // 先获取告警信息
    const alert = this.findById(id)
    // 再删除
    const stmt = db.prepare('DELETE FROM alerts WHERE id = ?')
    stmt.run(id)
    // 返回被删除的告警
    return alert
  }

  /**
   * 查找所有告警
   */
  findAll(filters = {}) {
    const db = this.getDB()
    
    let sql = 'SELECT * FROM alerts WHERE 1=1'
    const params = {}
    
    if (filters.status) {
      sql += ' AND status = @status'
      params.status = filters.status
    }
    
    if (filters.level) {
      sql += ' AND level = @level'
      params.level = filters.level
    }
    
    if (filters.device_id) {
      sql += ' AND device_id = @device_id'
      params.device_id = filters.device_id
    }
    
    sql += ' ORDER BY last_triggered DESC'
    
    const stmt = db.prepare(sql)
    return stmt.all(params)
  }

  /**
   * 获取活跃告警
   */
  findActive() {
    return this.findAll({ status: 'active' })
  }

  /**
   * 获取告警统计
   */
  getStats() {
    const db = this.getDB()
    
    const total = db.prepare('SELECT COUNT(*) as count FROM alerts').get().count
    const active = db.prepare("SELECT COUNT(*) as count FROM alerts WHERE status = 'active'").get().count
    const resolved = db.prepare("SELECT COUNT(*) as count FROM alerts WHERE status = 'resolved'").get().count
    
    const byLevel = db.prepare(`
      SELECT level, COUNT(*) as count 
      FROM alerts 
      WHERE status = 'active' 
      GROUP BY level
    `).all()
    
    return { total, active, resolved, byLevel }
  }

  /**
   * 删除已解决的告警（清理历史数据）
   */
  cleanupResolved(olderThanDays = 30) {
    const db = this.getDB()
    
    const stmt = db.prepare(`
      DELETE FROM alerts 
      WHERE status = 'resolved' 
        AND julianday('now') - julianday(resolved_at) > ?
    `)
    
    return stmt.run(olderThanDays)
  }
}

module.exports = new AlertDAO()
