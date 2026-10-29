// 迁移：为 devices 表增加 monitor_config 列，持久化单台设备的监控接入配置
// （管理 IP、监测方式、监测端口、机柜编号、离线重试次数、温度阈值、是否启用监测）。
//
// 幂等性（必修，同 001 范式）：db.js 的 init() 顺序是「先 createTables() 再 runMigrations()」。
// 现有 CREATE TABLE devices 语句未含 monitor_config 列，故新库/旧库都会走到本迁移补列；
// 但若将来 CREATE TABLE 补了该列，必须先探测再 ALTER，否则 duplicate column name 直接让应用起不来。
module.exports = {
  up(db) {
    const cols = db.prepare('PRAGMA table_info(devices)').all()
    if (cols.some((c) => c.name === 'monitor_config')) return
    db.exec('ALTER TABLE devices ADD COLUMN monitor_config TEXT;')
  }
}
