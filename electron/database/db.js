/**
 * SQLite 数据库管理模块
 * 负责数据库连接、初始化、迁移
 */

const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

class DatabaseManager {
  constructor() {
    this.db = null
    this.dbPath = null
  }

  /**
   * 初始化数据库
   * @param {string} userDataPath - Electron app.getPath('userData')
   */
  init(userDataPath) {
    if (this.db) {
      return this.db
    }

    // 确保数据库目录存在
    const dbDir = path.join(userDataPath, 'database')
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }

    // 数据库文件路径
    this.dbPath = path.join(dbDir, 'netops.db')

    // 创建数据库连接
    this.db = new Database(this.dbPath)

    // 启用 WAL 模式（提升性能）
    this.db.pragma('journal_mode = WAL')

    // 启用外键约束
    this.db.pragma('foreign_keys = ON')

    // 设置同步模式（平衡性能与安全性）
    this.db.pragma('synchronous = NORMAL')

    // 设置缓存大小（64MB）
    this.db.pragma('cache_size = -64000')

    console.log(`✅ 数据库已初始化: ${this.dbPath}`)

    // 初始化表结构
    this.initTables()

    // 执行迁移
    this.runMigrations()

    return this.db
  }

  /**
   * 初始化数据库表
   */
  initTables() {
    const createTablesSQL = `
      -- 设备表
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        vendor TEXT,
        model TEXT,
        ip TEXT,
        mac TEXT,
        sn TEXT,
        status TEXT DEFAULT 'online',
        location TEXT,
        rack_id TEXT,
        rack_position INTEGER,
        description TEXT,
        credentials TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_seen TEXT
      );

      -- 机柜表
      CREATE TABLE IF NOT EXISTS cabinets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        location TEXT,
        total_u INTEGER DEFAULT 42,
        specs_width INTEGER DEFAULT 600,
        specs_depth INTEGER DEFAULT 1000,
        specs_height INTEGER DEFAULT 2045,
        status TEXT DEFAULT 'active',
        description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- 端口状态表
      CREATE TABLE IF NOT EXISTS ports (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        port_name TEXT NOT NULL,
        port_type TEXT,
        status TEXT DEFAULT 'down',
        speed TEXT,
        duplex TEXT,
        vlan TEXT,
        description TEXT,
        last_changed TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
      );

      -- 告警表
      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        device_id TEXT,
        rule_id TEXT,
        level TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT,
        status TEXT DEFAULT 'active',
        count INTEGER DEFAULT 1,
        first_triggered TEXT DEFAULT CURRENT_TIMESTAMP,
        last_triggered TEXT DEFAULT CURRENT_TIMESTAMP,
        resolved_at TEXT,
        resolved_by TEXT,
        resolution_note TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
      );

      -- 告警规则表
      CREATE TABLE IF NOT EXISTS alert_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        enabled INTEGER DEFAULT 1,
        level TEXT DEFAULT 'warning',
        conditions TEXT NOT NULL,
        cooldown INTEGER DEFAULT 300,
        notifications TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- 配置备份表
      CREATE TABLE IF NOT EXISTS config_backups (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        content TEXT NOT NULL,
        backup_time TEXT DEFAULT CURRENT_TIMESTAMP,
        backup_by TEXT,
        change_note TEXT,
        diff TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
      );

      -- 操作日志表
      CREATE TABLE IF NOT EXISTS operation_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        user TEXT,
        type TEXT NOT NULL,
        target TEXT,
        target_id TEXT,
        action TEXT NOT NULL,
        detail TEXT,
        result TEXT DEFAULT 'success',
        message TEXT,
        ip TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ 机房规划（3D 布局）数据表 ============
      -- 与现网 cabinets/devices 解耦：规划态 vs 现网资产态
      CREATE TABLE IF NOT EXISTS dc_rooms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        width REAL NOT NULL,
        depth REAL NOT NULL,
        height REAL NOT NULL,
        locked INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        engineering TEXT,
        seed_version INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS dc_walls (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        side TEXT NOT NULL,
        length REAL NOT NULL,
        height REAL NOT NULL,
        thickness REAL NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES dc_rooms(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS dc_openings (
        id TEXT PRIMARY KEY,
        wall_id TEXT NOT NULL,
        type TEXT NOT NULL,
        offset REAL NOT NULL,
        sill REAL NOT NULL,
        width REAL NOT NULL,
        height REAL NOT NULL,
        rating TEXT,
        security TEXT,
        relief_area REAL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (wall_id) REFERENCES dc_walls(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS dc_racks (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        type TEXT NOT NULL,
        x REAL NOT NULL,
        z REAL NOT NULL,
        rotation_y REAL DEFAULT 0,
        temp REAL DEFAULT 22,
        density REAL DEFAULT 50,
        status TEXT DEFAULT 'normal',
        devices TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES dc_rooms(id) ON DELETE CASCADE
      );

      -- 创建索引
      CREATE INDEX IF NOT EXISTS idx_devices_ip ON devices(ip);
      CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
      CREATE INDEX IF NOT EXISTS idx_ports_device ON ports(device_id);
      CREATE INDEX IF NOT EXISTS idx_alerts_device ON alerts(device_id);
      CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
      CREATE INDEX IF NOT EXISTS idx_alerts_level ON alerts(level);
      CREATE INDEX IF NOT EXISTS idx_config_device ON config_backups(device_id);
      CREATE INDEX IF NOT EXISTS idx_config_version ON config_backups(device_id, version);
      CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON operation_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_logs_type ON operation_logs(type);

      -- 机房规划表索引
      CREATE INDEX IF NOT EXISTS idx_dc_walls_room ON dc_walls(room_id);
      CREATE INDEX IF NOT EXISTS idx_dc_openings_wall ON dc_openings(wall_id);
      CREATE INDEX IF NOT EXISTS idx_dc_racks_room ON dc_racks(room_id);
      -- B5：机房规划机柜状态索引（按状态聚合告警/统计时避免全表扫描）
      CREATE INDEX IF NOT EXISTS idx_dc_racks_status ON dc_racks(status);

      -- ============ 数据接入（手动录入 + 预留自动采集）============
      -- 与现有设备/机柜/告警表解耦：本模块是"机房数据采集接入层"，
      -- 用户先在界面手动填写，未来可经数据源注册表(ingest_sources)切换为自动采集。

      -- 告警数据
      CREATE TABLE IF NOT EXISTS ingest_alarms (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL DEFAULT 'manual',
        collector_id TEXT,
        project_id TEXT,
        recorded_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        remark TEXT,
        alarm_level TEXT NOT NULL,
        alarm_type TEXT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        device_id TEXT,
        cabinet_id TEXT,
        location TEXT,
        metric_value REAL,
        threshold REAL,
        unit TEXT,
        occurred_at TEXT
      );

      -- 机柜传感器
      CREATE TABLE IF NOT EXISTS ingest_sensors (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL DEFAULT 'manual',
        collector_id TEXT,
        project_id TEXT,
        recorded_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        remark TEXT,
        cabinet_id TEXT,
        sensor_type TEXT NOT NULL,
        sensor_name TEXT,
        value REAL,
        unit TEXT,
        location TEXT,
        status TEXT NOT NULL DEFAULT 'normal'
      );

      -- 动环监测（机房环境）
      CREATE TABLE IF NOT EXISTS ingest_env (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL DEFAULT 'manual',
        collector_id TEXT,
        project_id TEXT,
        recorded_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        remark TEXT,
        room_id TEXT,
        room_name TEXT,
        temperature REAL,
        humidity REAL,
        power_status TEXT,
        voltage REAL,
        current_a REAL,
        water_leak TEXT,
        smoke TEXT,
        door_status TEXT,
        ups_status TEXT,
        ac_status TEXT,
        power_kw REAL
      );

      -- 能耗
      CREATE TABLE IF NOT EXISTS ingest_energy (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL DEFAULT 'manual',
        collector_id TEXT,
        project_id TEXT,
        recorded_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        remark TEXT,
        room_id TEXT,
        device_id TEXT,
        meter_id TEXT,
        energy_type TEXT NOT NULL DEFAULT 'electric',
        consumption REAL,
        unit TEXT,
        period_start TEXT,
        period_end TEXT,
        peak_power REAL,
        cost REAL
      );

      -- 数据源注册表（预留：自动采集的采集器）
      CREATE TABLE IF NOT EXISTS ingest_sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'manual',
        target TEXT,
        protocol TEXT,
        poll_interval INTEGER NOT NULL DEFAULT 60,
        config TEXT,
        enabled INTEGER NOT NULL DEFAULT 0,
        last_poll_at TEXT,
        last_status TEXT,
        last_error TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_ingest_alarm_status ON ingest_alarms(status);
      CREATE INDEX IF NOT EXISTS idx_ingest_alarm_level ON ingest_alarms(alarm_level);
      CREATE INDEX IF NOT EXISTS idx_ingest_sensor_type ON ingest_sensors(sensor_type);
      CREATE INDEX IF NOT EXISTS idx_ingest_env_room ON ingest_env(room_id);
      CREATE INDEX IF NOT EXISTS idx_ingest_energy_type ON ingest_energy(energy_type);
      CREATE INDEX IF NOT EXISTS idx_ingest_source_enabled ON ingest_sources(enabled);
    `

    this.db.exec(createTablesSQL)
    console.log('✅ 数据库表结构已初始化')
  }

  /**
   * 运行数据库迁移
   */
  runMigrations() {
    const migrationsDir = path.join(__dirname, 'migrations')
    if (!fs.existsSync(migrationsDir)) {
      return
    }

    // 创建迁移记录表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL UNIQUE,
        applied_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 获取已应用的迁移
    const appliedMigrations = this.db.prepare('SELECT version FROM migrations').all()
    const appliedVersions = new Set(appliedMigrations.map(m => m.version))

    // 读取迁移文件
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.js'))
      .sort()

    // 执行未应用的迁移
    for (const file of migrationFiles) {
      const version = file.replace('.js', '')
      if (appliedVersions.has(version)) {
        continue
      }

      console.log(`🔄 执行迁移: ${version}`)
      const migration = require(path.join(migrationsDir, file))
      
      const transaction = this.db.transaction(() => {
        migration.up(this.db)
        this.db.prepare('INSERT INTO migrations (version) VALUES (?)').run(version)
      })

      transaction()
      console.log(`✅ 迁移完成: ${version}`)
    }
  }

  /**
   * 获取数据库实例
   */
  getDatabase() {
    if (!this.db) {
      throw new Error('数据库未初始化，请先调用 init()')
    }
    return this.db
  }

  /**
   * 关闭数据库连接
   */
  close() {
    if (this.db) {
      this.db.close()
      this.db = null
      console.log('✅ 数据库连接已关闭')
    }
  }

  /**
   * 备份数据库
   */
  backup(backupPath) {
    if (!this.db) {
      throw new Error('数据库未初始化')
    }
    this.db.backup(backupPath)
    console.log(`✅ 数据库已备份到: ${backupPath}`)
  }
}

// 单例模式
const dbManager = new DatabaseManager()

module.exports = dbManager
