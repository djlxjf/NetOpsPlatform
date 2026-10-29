// 迁移：为机房规划表补齐此前被 SQLite 丢弃的工程字段（审查报告 F4 / O5）
//   dc_rooms:   engineering TEXT（五域工程配置 JSON）、seed_version INTEGER DEFAULT 0（内容版本号）
//   dc_openings: rating TEXT（防火门等级 甲/乙/丙）、security TEXT（门禁子模型 JSON）、
//                relief_area REAL DEFAULT 0（泄压口有效面积）
// 目的：桌面端(Electron)保存后再刷新，不再丢失五域工程配置/内容版本号/防火门等级/
// 门禁子模型/泄压口面积（此前 savePlan/loadPlan 与表结构均未读写这些字段）。
//
// 幂等性（必修，同 001/004 范式）：db.js 的 init() 顺序是「先 createTables() 再 runMigrations()」。
// CREATE TABLE 已同步补列，新库不会缺列；但旧库表结构缺列，必须逐列 PRAGMA 探测后再 ALTER，
// 已存在即跳过，否则 duplicate column name 直接让应用起不来。
module.exports = {
  up(db) {
    const roomCols = db.prepare('PRAGMA table_info(dc_rooms)').all()
    const hasRoomCol = (name) => roomCols.some((c) => c.name === name)
    if (!hasRoomCol('engineering')) {
      db.exec('ALTER TABLE dc_rooms ADD COLUMN engineering TEXT;')
    }
    if (!hasRoomCol('seed_version')) {
      db.exec('ALTER TABLE dc_rooms ADD COLUMN seed_version INTEGER DEFAULT 0;')
    }

    const openingCols = db.prepare('PRAGMA table_info(dc_openings)').all()
    const hasOpeningCol = (name) => openingCols.some((c) => c.name === name)
    if (!hasOpeningCol('rating')) {
      db.exec('ALTER TABLE dc_openings ADD COLUMN rating TEXT;')
    }
    if (!hasOpeningCol('security')) {
      db.exec('ALTER TABLE dc_openings ADD COLUMN security TEXT;')
    }
    if (!hasOpeningCol('relief_area')) {
      db.exec('ALTER TABLE dc_openings ADD COLUMN relief_area REAL DEFAULT 0;')
    }
  }
}
