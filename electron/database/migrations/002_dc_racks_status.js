// 迁移：为 dc_racks 增加 status 列索引（B5），加速按状态聚合统计/告警查询。
// 与 db.js 的 CREATE INDEX 成对：新库靠 CREATE INDEX 建索引，旧库靠本迁移补齐。
module.exports = {
  up(db) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_dc_racks_status ON dc_racks(status);')
  }
}
