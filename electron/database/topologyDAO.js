/**
 * 拓扑数据 DAO - 使用SQLite存储拓扑数据（节点和连线）
 */

const db = require('./db')

class TopologyDAO {
  constructor() {
    this.initialized = false
  }

  /**
   * 确保数据库已初始化
   */
  ensureInitialized() {
    if (!this.initialized) {
      const database = db.getDb()
      // 创建拓扑表（如果不存在）
      database.exec(`
        CREATE TABLE IF NOT EXISTS topology (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL DEFAULT 'default',
          nodes_json TEXT NOT NULL DEFAULT '[]',
          edges_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(user_id, name)
        )
      `)
      this.initialized = true
    }
  }

  /**
   * 保存拓扑数据
   */
  save(userId, name = 'default', nodes, edges) {
    this.ensureInitialized()
    const database = db.getDb()
    
    const id = `${userId}_${name}`
    const nodesJson = JSON.stringify(nodes || [])
    const edgesJson = JSON.stringify(edges || [])
    
    const stmt = database.prepare(`
      INSERT OR REPLACE INTO topology (id, user_id, name, nodes_json, edges_json, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `)
    
    stmt.run(id, userId, name, nodesJson, edgesJson)
    
    return { id, userId, name, nodes, edges }
  }

  /**
   * 加载拓扑数据
   */
  load(userId, name = 'default') {
    this.ensureInitialized()
    const database = db.getDb()
    
    const stmt = database.prepare(`
      SELECT nodes_json, edges_json FROM topology
      WHERE user_id = ? AND name = ?
    `)
    
    const row = stmt.get(userId, name)
    
    if (row) {
      try {
        return {
          nodes: JSON.parse(row.nodes_json || '[]'),
          edges: JSON.parse(row.edges_json || '[]')
        }
      } catch (e) {
        console.error('[TopologyDAO] 解析拓扑数据失败:', e)
        return { nodes: [], edges: [] }
      }
    }
    
    return { nodes: [], edges: [] }
  }

  /**
   * 删除拓扑数据
   */
  delete(userId, name = 'default') {
    this.ensureInitialized()
    const database = db.getDb()
    
    const stmt = database.prepare(`
      DELETE FROM topology WHERE user_id = ? AND name = ?
    `)

    
    return result
  }

  /**
   * 列出用户的所有拓扑
   */
  listByUser(userId) {
    this.ensureInitialized()
    const database = db.getDb()
    
    const stmt = database.prepare(`
      SELECT id, name, created_at, updated_at
      FROM topology
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `)
    
    return stmt.all(userId)
  }
}

module.exports = new TopologyDAO()
