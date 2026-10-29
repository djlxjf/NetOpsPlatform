/**
 * 机柜数据访问对象 (Cabinet DAO)
 */

const dbManager = require('./db')

class CabinetDAO {
  constructor() {
    this.db = null
  }

  getDB() {
    if (!this.db) {
      this.db = dbManager.getDatabase()
    }
    return this.db
  }

  create(cabinet) {
    const db = this.getDB()
    const stmt = db.prepare(`
      INSERT INTO cabinets (
        id, name, location, total_u, specs_width, specs_depth, specs_height,
        status, description
      ) VALUES (
        @id, @name, @location, @total_u, @specs_width, @specs_depth, @specs_height,
        @status, @description
      )
    `)
    
    stmt.run({
      id: cabinet.id,
      name: cabinet.name,
      location: cabinet.location || null,
      total_u: cabinet.total_u || 42,
      specs_width: cabinet.specs_width || 600,
      specs_depth: cabinet.specs_depth || 1000,
      specs_height: cabinet.specs_height || 2045,
      status: cabinet.status || 'active',
      description: cabinet.description || null
    })
    
    return this.findById(cabinet.id)
  }

  update(id, updates) {
    const db = this.getDB()
    
    const fields = []
    const params = {}
    
    Object.keys(updates).forEach(key => {
      fields.push(`${key} = @${key}`)
      params[key] = updates[key]
    })
    
    fields.push('updated_at = CURRENT_TIMESTAMP')
    params.id = id
    
    const sql = `UPDATE cabinets SET ${fields.join(', ')} WHERE id = @id`
    const stmt = db.prepare(sql)
    
    stmt.run(params)
    return this.findById(id)
  }

  delete(id) {
    const db = this.getDB()
    // 先获取机柜信息
    const cabinet = this.findById(id)
    // 再删除
    const stmt = db.prepare('DELETE FROM cabinets WHERE id = ?')
    stmt.run(id)
    // 返回被删除的机柜
    return cabinet
  }

  findById(id) {
    const db = this.getDB()
    const stmt = db.prepare('SELECT * FROM cabinets WHERE id = ?')
    return stmt.get(id)
  }

  findAll() {
    const db = this.getDB()
    const stmt = db.prepare('SELECT * FROM cabinets ORDER BY created_at DESC')
    return stmt.all()
  }

  getDevices(cabinetId) {
    const db = this.getDB()
    const stmt = db.prepare(`
      SELECT * FROM devices 
      WHERE rack_id = ? 
      ORDER BY rack_position ASC
    `)
    return stmt.all(cabinetId)
  }

  getStats() {
    const db = this.getDB()
    
    const total = db.prepare('SELECT COUNT(*) as count FROM cabinets').get().count
    const active = db.prepare("SELECT COUNT(*) as count FROM cabinets WHERE status = 'active'").get().count
    
    return { total, active }
  }
}

module.exports = new CabinetDAO()
