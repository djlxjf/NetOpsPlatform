/**
 * 配置备份数据访问对象 (Config Backup DAO)
 */

const dbManager = require('./db')

class ConfigBackupDAO {
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
   * 创建配置备份
   */
  create(backup) {
    const db = this.getDB()
    
    // 获取下一个版本号
    const latest = db.prepare(`
      SELECT MAX(version) as max_version 
      FROM config_backups 
      WHERE device_id = ?
    `).get(backup.device_id)
    
    const version = (latest.max_version || 0) + 1
    
    const stmt = db.prepare(`
      INSERT INTO config_backups (
        id, device_id, version, content, backup_by, change_note, diff
      ) VALUES (
        @id, @device_id, @version, @content, @backup_by, @change_note, @diff
      )
    `)
    
    stmt.run({
      id: backup.id,
      device_id: backup.device_id,
      version,
      content: backup.content,
      backup_by: backup.backup_by || null,
      change_note: backup.change_note || null,
      diff: backup.diff || null
    })
    
    return this.findById(backup.id)
  }

  /**
   * 根据 ID 查找备份
   */
  findById(id) {
    const db = this.getDB()
    const stmt = db.prepare('SELECT * FROM config_backups WHERE id = ?')
    return stmt.get(id)
  }

  /**
   * 根据设备 ID 查找所有备份
   */
  findByDeviceId(deviceId) {
    const db = this.getDB()
    const stmt = db.prepare(`
      SELECT * FROM config_backups 
      WHERE device_id = ? 
      ORDER BY version DESC
    `)
    return stmt.all(deviceId)
  }

  /**
   * 获取设备的最新配置
   */
  findLatest(deviceId) {
    const db = this.getDB()
    const stmt = db.prepare(`
      SELECT * FROM config_backups 
      WHERE device_id = ? 
      ORDER BY version DESC 
      LIMIT 1
    `)
    return stmt.get(deviceId)
  }

  /**
   * 获取两个版本之间的差异
   */
  findVersionsForDiff(deviceId, version1, version2) {
    const db = this.getDB()
    
    const stmt = db.prepare(`
      SELECT version, content 
      FROM config_backups 
      WHERE device_id = ? 
        AND (version = ? OR version = ?)
      ORDER BY version
    `)
    
    const results = stmt.all(deviceId, version1, version2)
    
    if (results.length === 2) {
      return {
        oldVersion: results[0],
        newVersion: results[1]
      }
    }
    
    return null
  }

  /**
   * 删除备份
   */
  delete(id) {
    const db = this.getDB()
    // 先获取备份信息
    const backup = this.findById(id)
    // 再删除
    const stmt = db.prepare('DELETE FROM config_backups WHERE id = ?')
    stmt.run(id)
    // 返回被删除的备份
    return backup
  }

  /**
   * 清理旧备份（保留最新 N 个版本）
   */
  cleanupOld(deviceId, keepVersions = 10) {
    const db = this.getDB()
    
    const stmt = db.prepare(`
      DELETE FROM config_backups 
      WHERE device_id = @device_id 
        AND version NOT IN (
          SELECT version 
          FROM config_backups 
          WHERE device_id = @device_id 
          ORDER BY version DESC 
          LIMIT @keep
        )
    `)
    
    return stmt.run({
      device_id: deviceId,
      keep: keepVersions
    })
  }

  /**
   * 获取备份统计
   */
  getStats() {
    const db = this.getDB()
    
    const total = db.prepare('SELECT COUNT(*) as count FROM config_backups').get().count
    const devices = db.prepare('SELECT COUNT(DISTINCT device_id) as count FROM config_backups').get().count
    
    return { total, devices }
  }
}

module.exports = new ConfigBackupDAO()
