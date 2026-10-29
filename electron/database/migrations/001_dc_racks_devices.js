// 迁移：为 dc_racks 增加 devices 列，持久化单柜设备清单（U 位 / 类别 / 状态）。
// 修复 Electron(SQLite) 下柜内设备重启即丢失、132 台机柜回落成同一张脸的问题
// （浏览器 localStorage 路径本就序列化整份 plan，不受影响；仅 SQLite 路径缺列）。
// 与 db.js 的 CREATE TABLE 必须成对改动：旧库靠本迁移补齐列，新库靠 CREATE TABLE 建列。
//
// 幂等性（必修）：db.js 的 init() 顺序是「先 createTables() 再 runMigrations()」，
// 而 CREATE TABLE 里已经写了 devices 列 —— 新库建表即拥有该列，此后本迁移若
// 无条件 ADD COLUMN，会抛 SqliteError: duplicate column name: devices，
// 且 runMigrations 没有任何 try/catch，异常直接冒到 init() 外 → 整个应用起不来。
// （实测：全新安装 / 删库后首次启动必崩，E2E 一次性复现。）
// 因此必须先探测列是否已存在：旧库没有才补，新库直接跳过。
module.exports = {
  up(db) {
    const cols = db.prepare('PRAGMA table_info(dc_racks)').all()
    if (cols.some((c) => c.name === 'devices')) return
    db.exec('ALTER TABLE dc_racks ADD COLUMN devices TEXT;')
  }
}
