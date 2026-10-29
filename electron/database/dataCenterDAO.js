/**
 * 机房规划（3D 布局）数据访问对象 (DataCenter DAO)
 * 与现网 cabinets/devices 解耦，仅负责「规划态」数据：
 *   dc_rooms  -> 房间尺寸 / 锁定状态
 *   dc_walls  -> 四面墙（back/left/front/right）
 *   dc_openings -> 门窗（挂在墙上）
 *   dc_racks  -> 机柜 / 设备摆放
 *
 * 前端以一个「方案(plan)」为单位整体保存/读取，因此 savePlan 采用事务式 upsert：
 *   删除该房间下旧的 walls/openings/racks，再整体重建，保证数据一致性。
 */

const crypto = require('crypto')
const dbManager = require('./db')

// 安全解析机柜设备清单（SQLite 中以 JSON 文本存储；缺省/损坏时回落为 null，
// 由 racks.loadFrom 按默认设备重建，避免单柜设备清单丢失导致整柜「同一张脸」）
function parseRackDevices(v) {
  if (!v) return null
  try {
    const d = JSON.parse(v)
    return Array.isArray(d) ? d : null
  } catch {
    return null
  }
}

// 安全解析 JSON 对象字段（SQLite 中以 JSON 文本存储；缺省/损坏时回落为 null，
// 由前端按默认配置重建，避免单个工程字段损坏导致整个方案读档失败）
function parseJsonObject(v) {
  if (!v) return null
  try {
    const d = JSON.parse(v)
    return d && typeof d === 'object' ? d : null
  } catch {
    return null
  }
}

class DataCenterDAO {
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
   * 保存（upsert）一个完整规划方案
   * @param {string} roomId 房间标识（前端统一使用单一房间时可传固定值，如 'MAIN'）
   * @param {object} plan { name, dims:{width,depth,height}, walls:{back,left,front,right}, racks:[...], locked }
   */
  savePlan(roomId, plan) {
    const db = this.getDB()
    const tx = db.transaction(() => {
      const dims = (plan && plan.dims) || {}
      const width = Number(dims.width) || 46
      const depth = Number(dims.depth) || 34
      const height = Number(dims.height) || 9
      const locked = plan && plan.locked ? 1 : 0

      // 房间 upsert
      db.prepare(`
        INSERT INTO dc_rooms (id, name, width, depth, height, locked, updated_at, engineering, seed_version)
        VALUES (@id, @name, @width, @depth, @height, @locked, CURRENT_TIMESTAMP, @engineering, @seedVersion)
        ON CONFLICT(id) DO UPDATE SET
          name=@name, width=@width, depth=@depth, height=@height,
          locked=@locked, updated_at=CURRENT_TIMESTAMP,
          engineering=@engineering, seed_version=@seedVersion
      `).run({
        id: roomId,
        name: (plan && plan.name) || roomId,
        width, depth, height, locked,
        engineering: plan && plan.engineering ? JSON.stringify(plan.engineering) : null,
        seedVersion: Number(plan && plan.seedVersion) || 0
      })

      // 增量保存（B3）：保留存量行，仅删除「新方案中已不存在」的墙/门窗/机柜，
      // 其余走 INSERT OR REPLACE。避免每次保存全量 DELETE+重建，减少 IO 与
      // 机柜 ID 抖动（后端若以 rackId 关联其他数据则更稳定）。
      const walls = (plan && plan.walls) || {}
      const sides = ['back', 'left', 'front', 'right'].filter((s) => walls[s])
      if (sides.length) {
        db.prepare(`DELETE FROM dc_walls WHERE room_id = ? AND side NOT IN (${sides.map(() => '?').join(',')})`).run(roomId, ...sides)
      } else {
        db.prepare('DELETE FROM dc_walls WHERE room_id = ?').run(roomId)
      }
      const wallStmt = db.prepare(`
        INSERT OR REPLACE INTO dc_walls (id, room_id, side, length, height, thickness)
        VALUES (@id, @roomId, @side, @length, @height, @thickness)
      `)
      const openingStmt = db.prepare(`
        INSERT OR REPLACE INTO dc_openings (id, wall_id, type, offset, sill, width, height, rating, security, relief_area)
        VALUES (@id, @wallId, @type, @offset, @sill, @width, @height, @rating, @security, @reliefArea)
      `)
      for (const side of sides) {
        const w = walls[side]
        const wallId = `dc_wall_${roomId}_${side}`
        wallStmt.run({
          id: wallId,
          roomId,
          side,
          length: Number(w.length) || 0,
          height: Number(w.height) || 0,
          thickness: Number(w.thickness) || 0.3
        })
        const openings = Array.isArray(w.openings) ? w.openings : []
        // 回写稳定 id（首次生成后保持不变），避免每次保存都重建门窗行
        const opIds = openings.map((o) => o.id || `O_${crypto.randomUUID()}`)
        openings.forEach((o, i) => { if (!o.id) o.id = opIds[i] })
        if (opIds.length) {
          db.prepare(`DELETE FROM dc_openings WHERE wall_id = ? AND id NOT IN (${opIds.map(() => '?').join(',')})`).run(wallId, ...opIds)
        } else {
          db.prepare('DELETE FROM dc_openings WHERE wall_id = ?').run(wallId)
        }
        for (let i = 0; i < openings.length; i++) {
          const op = openings[i]
          openingStmt.run({
            id: opIds[i],
            wallId,
            type: op.type,
            offset: Number(op.offset) || 0,
            sill: Number(op.sill) || 0,
            width: Number(op.width) || 0,
            height: Number(op.height) || 0,
            rating: op.rating ?? null,
            security: op.security ? JSON.stringify(op.security) : null,
            reliefArea: Number(op.reliefArea) || 0
          })
        }
      }

      // 机柜 / 设备摆放：仅删去已移除的机柜，其余 upsert
      const racks = (plan && plan.racks) || []
      const rackIds = racks.map((r) => r.id).filter(Boolean)
      if (rackIds.length) {
        db.prepare(`DELETE FROM dc_racks WHERE room_id = ? AND id NOT IN (${rackIds.map(() => '?').join(',')})`).run(roomId, ...rackIds)
      } else {
        db.prepare('DELETE FROM dc_racks WHERE room_id = ?').run(roomId)
      }
      const rackStmt = db.prepare(`
        INSERT OR REPLACE INTO dc_racks (id, room_id, type, x, z, rotation_y, temp, density, status, devices)
        VALUES (@id, @roomId, @type, @x, @z, @rotation_y, @temp, @density, @status, @devices)
      `)
      for (const r of racks) {
        rackStmt.run({
          id: r.id,
          roomId,
          type: r.type,
          x: Number(r.x) || 0,
          z: Number(r.z) || 0,
          rotation_y: Number(r.rotationY) || 0,
          temp: Number(r.temp) || 22,
          density: Number(r.density) || 50,
          status: r.status || 'normal',
          devices: JSON.stringify(Array.isArray(r.devices) ? r.devices : [])
        })
      }
    })
    tx()
    return this.loadPlan(roomId)
  }

  /**
   * 读取一个完整规划方案；房间不存在时返回 null
   */
  loadPlan(roomId) {
    const db = this.getDB()
    const room = db.prepare('SELECT * FROM dc_rooms WHERE id = ?').get(roomId)
    if (!room) return null

    const wallRows = db.prepare('SELECT * FROM dc_walls WHERE room_id = ?').all(roomId)
    const walls = {}
    for (const w of wallRows) {
      const openings = db
        .prepare('SELECT * FROM dc_openings WHERE wall_id = ? ORDER BY offset ASC')
        .all(w.id)
        .map((o) => ({
          id: o.id,
          type: o.type,
          offset: o.offset,
          sill: o.sill,
          width: o.width,
          height: o.height,
          rating: o.rating ?? undefined,
          security: parseJsonObject(o.security),
          reliefArea: Number(o.relief_area) || 0
        }))
      walls[w.side] = {
        length: w.length,
        height: w.height,
        thickness: w.thickness,
        openings
      }
    }

    const racks = db
      .prepare('SELECT * FROM dc_racks WHERE room_id = ?').all(roomId)
      .map((r) => ({
        id: r.id,
        type: r.type,
        x: r.x,
        z: r.z,
        rotationY: r.rotation_y,
        temp: r.temp,
        density: r.density,
        status: r.status,
        devices: parseRackDevices(r.devices)
      }))

    return {
      name: room.name,
      dims: { width: room.width, depth: room.depth, height: room.height },
      walls,
      racks,
      locked: !!room.locked,
      seedVersion: Number(room.seed_version) || 0,
      engineering: parseJsonObject(room.engineering)
    }
  }

  /**
   * 列出全部房间（用于未来多房间切换 UI）
   */
  listRooms() {
    const db = this.getDB()
    return db
      .prepare('SELECT id, name, width, depth, height, locked, updated_at FROM dc_rooms ORDER BY updated_at DESC')
      .all()
      .map((r) => ({ ...r, locked: !!r.locked }))
  }

  /**
   * 删除一个房间（级联删除 walls/openings/racks）
   */
  deletePlan(roomId) {
    const db = this.getDB()
    db.prepare('DELETE FROM dc_rooms WHERE id = ?').run(roomId)
    return true
  }
}

module.exports = new DataCenterDAO()
