/**
 * Electron API 兼容层（Polyfill）
 * 在浏览器/Capacitor 环境下模拟 window.electronAPI
 * - 构建时零依赖，不会触发 Vite 解析错误
 * - 运行时自动检测 Capacitor 并调用原生插件
 * - 非 Capacitor 环境自动降级到 localStorage + 下载
 */

import logger from './utils/logger'

const STORAGE_KEYS = {
  ACCOUNTS: 'netops_accounts',
  ACCOUNT_SESSION: 'netops_account_session',
  CURRENT_USER: 'netops_current_user',
  USER_DATA_PREFIX: 'netops_user_',
};

// 安全地读取 Capacitor 插件（无需 import）
function getCapacitorPlugin(name) {
  try {
    return window.Capacitor?.Plugins?.[name] || null;
  } catch (e) {
    return null;
  }
}

const Preferences = () => getCapacitorPlugin('Preferences');
const Filesystem = () => getCapacitorPlugin('Filesystem');
const AppPlugin = () => getCapacitorPlugin('App');

// 注册 before-close 回调
let beforeCloseCallback = null;

// 初始化 App 状态监听（Capacitor 移动端）
try {
  const App = AppPlugin();
  if (App) {
    App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive && beforeCloseCallback) {
        beforeCloseCallback();
      }
    });
  }
} catch (e) {}

// ---------- 统一存储读写（Preferences / localStorage 自动降级）----------

async function prefGet(key) {
  const P = Preferences();
  if (P) {
    try { const { value } = await P.get({ key }); return value; } catch (e) {}
  }
  return localStorage.getItem(key);
}

async function prefSet(key, value) {
  const P = Preferences();
  if (P) {
    try { await P.set({ key, value }); return; } catch (e) {}
  }
  localStorage.setItem(key, value);
}

// ---------------------- 辅助函数 ----------------------

function getCurrentUsername() {
  // 以 auth store 的 localStorage 键为权威来源（与 stores/index.js 的
  // getStorageKey() 同源读取 netops_user）。window.__CURRENT_USER__ 在全工程中
  // 均无赋值处，历史上导致 invoke 类数据全部落到 *_default 键，与按用户名读取的
  // 加载路径错位——Web 预览模式下机柜数据保存后刷新即丢（机柜无 legacy 回退键）。
  try {
    const raw = localStorage.getItem('netops_user');
    if (raw) {
      const u = JSON.parse(raw);
      if (u && u.username) return u.username;
    }
  } catch (e) { /* 落到下方默认值 */ }
  return window.__CURRENT_USER__ || 'default';
}

// 每用户数据对象读写（键 netops_user_<username>，形状镜像 main.js 的 dbCache.users[un]）
function readUserData(username) {
  const obj = readJSON(STORAGE_KEYS.USER_DATA_PREFIX + username);
  return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
}

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}

// ---------------------- Electron API 模拟 ----------------------

const electronPolyfill = {

  // ========== 用户/账户数据 ==========
  // 【契约红线】下列方法的入参/返回形状与 electron/preload.js + electron/main.js
  // 对应处理器 1:1 对齐（main.js:1214-1252 db-save/load-user-data、1315-1326
  // db-load-current-user）。历史版本曾以裸值返回（无 success 包装），导致
  // App.vue 等消费方校验 result?.success 失败后清除登录态/静默回退
  // localStorage——Web 预览模式（无真实 preload 时注入本 polyfill）每次刷新即登出。

  async dbLoadCurrentUser() {
    const raw = await prefGet(STORAGE_KEYS.CURRENT_USER);
    if (!raw) return { success: true, user: null };
    // 兼容历史存量：裸用户名字符串或 JSON 对象均可解析
    let user = null;
    try {
      const parsed = JSON.parse(raw);
      user = (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        ? parsed
        : { username: String(raw), name: String(raw) };
    } catch (e) {
      user = { username: String(raw), name: String(raw) };
    }
    return { success: true, user };
  },

  async dbSaveCurrentUser(username) {
    await prefSet(STORAGE_KEYS.CURRENT_USER, username);
    return { success: true };
  },

  async dbLoadAccounts() {
    // 契约与 Electron 主进程 db-load-accounts 一致：{ success, accounts: 对象字典 }
    const raw = await prefGet(STORAGE_KEYS.ACCOUNTS);
    if (!raw) return { success: true, accounts: {} };
    try {
      const parsed = JSON.parse(raw);
      return {
        success: true,
        accounts: (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {}
      };
    } catch (e) {
      return { success: true, accounts: {} };
    }
  },

  async dbSaveAccounts(accounts) {
    await prefSet(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
    return { success: true };
  },

  // 账号会话持久化（登录系统）：契约镜像 main.js 的 auth-save/auth-load-session
  async authSaveSession(username) {
    await prefSet(STORAGE_KEYS.ACCOUNT_SESSION, username || '');
    return { success: true };
  },

  async authLoadSession() {
    const raw = await prefGet(STORAGE_KEYS.ACCOUNT_SESSION);
    return { success: true, username: raw || null };
  },

  async dbLoadUserData(username) {
    const data = readUserData(username);
    // 仅返回对象形态的数据；字符串/数组等历史脏值视为无数据，
    // 让消费方走 localStorage 回退（切勿把 devices 覆盖为空数组）
    return { success: true, data: Object.keys(data).length > 0 ? data : null };
  },

  async dbSaveUserData(username, dataType, data) {
    // 3 参签名 + dataType 路由，镜像 main.js db-save-user-data。
    // 差异点：main.js 对未知 dataType 静默丢弃，polyfill 选择直接落盘——
    // 降级环境下丢弃数据永远比保留更糟（portConnections/topologyLayout
    // 即属 main.js 不处理、但 store 侧仍在调用的类型）。
    const obj = readUserData(username);
    if (dataType === 'topologyNodes') {
      if (!obj.topology) obj.topology = { nodes: [], edges: [] };
      obj.topology.nodes = data;
    } else if (dataType === 'topologyEdges') {
      if (!obj.topology) obj.topology = { nodes: [], edges: [] };
      obj.topology.edges = data;
    } else if (dataType === 'all' && data && typeof data === 'object') {
      if (data.devices !== undefined) obj.devices = data.devices;
      if (data.cabinets !== undefined) obj.cabinets = data.cabinets;
      if (data.topologyNodes !== undefined) {
        if (!obj.topology) obj.topology = { nodes: [], edges: [] };
        obj.topology.nodes = data.topologyNodes;
      }
      if (data.topologyEdges !== undefined) {
        if (!obj.topology) obj.topology = { nodes: [], edges: [] };
        obj.topology.edges = data.topologyEdges;
      }
      if (data.deviceLibCustom !== undefined) obj.deviceLibCustom = data.deviceLibCustom;
    } else {
      obj[dataType] = data;
    }
    writeJSON(STORAGE_KEYS.USER_DATA_PREFIX + username, obj);
    return { success: true };
  },

  async loadUserData(username) {
    return this.dbLoadUserData(username);
  },

  async saveUserData({ username, data }) {
    // AppLayout.vue:310 的对象式调用 → 映射为 'all' 语义
    //（对应真实链路的 save-user-data 文件备份所保存的内容）
    return this.dbSaveUserData(username, 'all', data);
  },

  async dbFlush() {
    return true;
  },

  // ========== 窗口管理（移动端 no-op）==========

  isMaximized() { return false; },
  minimize() {},
  maximize() {},
  close() {
    const App = AppPlugin();
    if (App) { App.exitApp(); return; }
    window.close();
  },
  titlebarDblClick() {},

  onBeforeClose(callback) {
    beforeCloseCallback = callback;
  },

  confirmClose(allowed) {
    logger.debug('[Polyfill] confirmClose:', allowed)
  },

  // ========== 文件操作 ==========

  async saveBackupFile({ content, defaultPath }) {
    try {
      const fileName = (defaultPath || 'backup.json').split(/[\\/]/).pop();
      const FS = Filesystem();
      if (FS) {
        await FS.writeFile({
          path: fileName,
          data: content,
          directory: 'DOCUMENTS',
          encoding: 'UTF8',
        });
        return { success: true, path: fileName };
      }
      // 浏览器：触发下载
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      return { success: true, path: fileName };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  // ========== IPC invoke 模拟 ==========

  async invoke(channel, ...args) {
    try {
      const username = getCurrentUsername();

      // ---------- 设备相关 ----------
      if (channel === 'db-device-find-all') {
        const key = `netops_devices_${username}`;
        const data = readJSON(key) || [];
        return { success: true, data };
      }

      if (channel === 'db-device-create') {
        const device = args[0];
        const key = `netops_devices_${username}`;
        const list = readJSON(key) || [];
        list.push(device);
        writeJSON(key, list);
        return { success: true, data: device };
      }

      if (channel === 'db-device-update') {
        const { id, updates } = args[0];
        const key = `netops_devices_${username}`;
        const list = readJSON(key) || [];
        const idx = list.findIndex(d => d.id === id);
        if (idx >= 0) {
          list[idx] = { ...list[idx], ...updates };
          writeJSON(key, list);
        }
        return { success: true };
      }

      if (channel === 'db-device-delete') {
        const id = args[0];
        const key = `netops_devices_${username}`;
        const list = readJSON(key) || [];
        const filtered = list.filter(d => d.id !== id);
        writeJSON(key, filtered);
        return { success: true };
      }

      if (channel === 'db-device-find-by-id') {
        const id = args[0];
        const list = readJSON(`netops_devices_${username}`) || [];
        return { success: true, data: list.find(d => d.id === id) || null };
      }

      if (channel === 'db-device-update-status') {
        const { id, status } = args[0] || {};
        const key = `netops_devices_${username}`;
        const list = readJSON(key) || [];
        const idx = list.findIndex(d => d.id === id);
        if (idx >= 0) {
          list[idx] = { ...list[idx], status };
          writeJSON(key, list);
        }
        return { success: true };
      }

      // 注意：拓扑同步的 60s 心跳探活依赖此通道。
      // 若返回 {success:false}，Web 预览下拓扑会被误判为断连，故必须实现。
      // 字段与 electron/database/deviceDAO.js getStats() 保持一致。
      if (channel === 'db-device-get-stats') {
        const list = readJSON(`netops_devices_${username}`) || [];
        return {
          success: true,
          data: {
            total: list.length,
            online: list.filter(d => d.status === 'online').length,
            offline: list.filter(d => d.status === 'offline').length,
            warning: list.filter(d => d.status === 'warning').length
          }
        };
      }

      // ---------- 机柜相关 ----------
      if (channel === 'db-cabinet-find-all') {
        const key = `netops_cabinets_${username}`;
        const data = readJSON(key) || [];
        return { success: true, data };
      }

      if (channel === 'db-cabinet-create') {
        const cabinet = args[0];
        const key = `netops_cabinets_${username}`;
        const list = readJSON(key) || [];
        list.push(cabinet);
        writeJSON(key, list);
        return { success: true, data: cabinet };
      }

      if (channel === 'db-cabinet-update') {
        const { id, updates } = args[0];
        const key = `netops_cabinets_${username}`;
        const list = readJSON(key) || [];
        const idx = list.findIndex(c => c.id === id);
        if (idx >= 0) {
          list[idx] = { ...list[idx], ...updates };
          writeJSON(key, list);
        }
        return { success: true };
      }

      if (channel === 'db-cabinet-delete') {
        const id = args[0];
        const key = `netops_cabinets_${username}`;
        const list = readJSON(key) || [];
        const filtered = list.filter(c => c.id !== id);
        writeJSON(key, filtered);
        return { success: true };
      }

      if (channel === 'db-cabinet-find-by-id') {
        const id = args[0];
        const list = readJSON(`netops_cabinets_${username}`) || [];
        return { success: true, data: list.find(c => c.id === id) || null };
      }

      if (channel === 'db-cabinet-get-devices') {
        const cabinetId = args[0];
        const key = `netops_devices_${username}`;
        const devices = readJSON(key) || [];
        const data = devices.filter(d => d.cabinetId === cabinetId);
        return { success: true, data };
      }

      // ---------- 告警相关 ----------
      if (channel === 'db-alert-find-all') {
        const key = `netops_alerts_${username}`;
        const data = readJSON(key) || [];
        return { success: true, data };
      }

      if (channel === 'db-alert-create') {
        const alert = args[0];
        const key = `netops_alerts_${username}`;
        const list = readJSON(key) || [];
        list.push(alert);
        writeJSON(key, list);
        return { success: true, data: alert };
      }

      if (channel === 'db-alert-update-status') {
        const { id, status, resolvedBy, resolutionNote } = args[0];
        const key = `netops_alerts_${username}`;
        const list = readJSON(key) || [];
        const idx = list.findIndex(a => a.id === id);
        if (idx >= 0) {
          list[idx] = { ...list[idx], status, resolvedBy, resolutionNote };
          writeJSON(key, list);
        }
        return { success: true };
      }

      if (channel === 'db-alert-delete') {
        const id = args[0];
        const key = `netops_alerts_${username}`;
        const list = readJSON(key) || [];
        const filtered = list.filter(a => a.id !== id);
        writeJSON(key, filtered);
        return { success: true };
      }

      // 字段与 electron/database/alertDAO.js getStats() 保持一致
      if (channel === 'db-alert-get-stats') {
        const list = readJSON(`netops_alerts_${username}`) || [];
        const active = list.filter(a => a.status === 'active');
        const byLevelMap = active.reduce((acc, a) => {
          acc[a.level] = (acc[a.level] || 0) + 1;
          return acc;
        }, {});
        return {
          success: true,
          data: {
            total: list.length,
            active: active.length,
            resolved: list.filter(a => a.status === 'resolved').length,
            byLevel: Object.entries(byLevelMap).map(([level, count]) => ({ level, count }))
          }
        };
      }

      // ---------- 数据接入（type 驱动：alarm/sensor/env/energy/source）----------
      if (channel === 'db-ingest-create' || channel === 'db-ingest-create-many') {
        const { type, record, records } = args[0] || {}
        const list = readJSON(`netops_ingest_${type}_${username}`) || []
        const toAdd = records && Array.isArray(records) ? records : [record]
        const added = []
        for (const item of toAdd) {
          const rec = {
            id: item.id || `${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
            source_type: item.source_type || 'manual',
            created_at: item.created_at || new Date().toISOString(),
            ...item
          }
          list.push(rec)
          added.push(rec)
        }
        writeJSON(`netops_ingest_${type}_${username}`, list)
        return { success: true, data: added[0] || null, count: added.length }
      }

      if (channel === 'db-ingest-update') {
        const { type, id, updates } = args[0] || {}
        const list = readJSON(`netops_ingest_${type}_${username}`) || []
        const idx = list.findIndex(r => r.id === id)
        if (idx >= 0) {
          list[idx] = { ...list[idx], ...updates, updated_at: new Date().toISOString() }
          writeJSON(`netops_ingest_${type}_${username}`, list)
          return { success: true, data: list[idx] }
        }
        return { success: false, error: '记录不存在' }
      }

      if (channel === 'db-ingest-delete') {
        const { type, id } = args[0] || {}
        const list = readJSON(`netops_ingest_${type}_${username}`) || []
        const filtered = list.filter(r => r.id !== id)
        writeJSON(`netops_ingest_${type}_${username}`, filtered)
        return { success: true }
      }

      if (channel === 'db-ingest-find-all') {
        const { type, filters } = args[0] || {}
        let list = readJSON(`netops_ingest_${type}_${username}`) || []
        if (filters && typeof filters === 'object') {
          if (filters.status) list = list.filter(r => r.status === filters.status)
          if (filters.level) list = list.filter(r => r.alarm_level === filters.level)
          if (filters.sensor_type) list = list.filter(r => r.sensor_type === filters.sensor_type)
          if (filters.energy_type) list = list.filter(r => r.energy_type === filters.energy_type)
          if (filters.source_type) list = list.filter(r => r.source_type === filters.source_type)
          if (filters.collector_id) list = list.filter(r => r.collector_id === filters.collector_id)
          if (filters.keyword) {
            const kw = String(filters.keyword).toLowerCase()
            list = list.filter(r => JSON.stringify(r).toLowerCase().includes(kw))
          }
        }
        return { success: true, data: list }
      }

      if (channel === 'db-ingest-find-by-id') {
        const { type, id } = args[0] || {}
        const list = readJSON(`netops_ingest_${type}_${username}`) || []
        return { success: true, data: list.find(r => r.id === id) || null }
      }

      if (channel === 'db-ingest-get-stats') {
        const { type } = args[0] || {}
        const list = readJSON(`netops_ingest_${type}_${username}`) || []
        const total = list.length
        if (type === 'alarm') {
          const active = list.filter(r => r.status && r.status !== 'resolved').length
          const resolved = total - active
          const byLevel = {}
          list.forEach(r => { if (r.status !== 'resolved') byLevel[r.alarm_level] = (byLevel[r.alarm_level] || 0) + 1 })
          return { success: true, data: { total, active, resolved, byLevel: Object.entries(byLevel).map(([level, count]) => ({ level, count })) } }
        }
        if (type === 'source') {
          const enabled = list.filter(r => r.enabled === 1 || r.enabled === true).length
          return { success: true, data: { total, enabled } }
        }
        return { success: true, data: { total } }
      }

      if (channel === 'db-ingest-mark-poll') {
        const { type, id, status, error } = args[0] || {}
        const list = readJSON(`netops_ingest_${type}_${username}`) || []
        const idx = list.findIndex(r => r.id === id)
        if (idx >= 0) {
          list[idx] = { ...list[idx], last_poll_at: new Date().toISOString(), last_status: status, last_error: error || null }
          writeJSON(`netops_ingest_${type}_${username}`, list)
        }
        return { success: true }
      }

      logger.warn('[Polyfill] 未处理的 invoke 通道:', channel);
      return { success: false, error: 'Unknown channel' };
    } catch (e) {
      logger.error('[Polyfill] invoke 失败:', channel, e);
      return { success: false, error: e.message };
    }
  },

  // ========== 具名 DB 方法（镜像 electron/preload.js 契约） ==========
  // 【契约红线】渲染层禁止直接调用通用 invoke，只允许调用下列具名方法。
  // 此处签名必须与 electron/preload.js 中的同名方法保持 1:1 一致，
  // 否则 Web 预览与 Electron 桌面端会出现行为分叉。
  // 使用显式对象引用而非 this，保证被解构调用时依然可用。

  dbDeviceFindAll: (filters) => electronPolyfill.invoke('db-device-find-all', filters),
  dbDeviceCreate: (device) => electronPolyfill.invoke('db-device-create', device),
  dbDeviceUpdate: (id, updates) => electronPolyfill.invoke('db-device-update', { id, updates }),
  dbDeviceDelete: (id) => electronPolyfill.invoke('db-device-delete', id),
  dbDeviceFindById: (id) => electronPolyfill.invoke('db-device-find-by-id', id),
  dbDeviceUpdateStatus: (id, status) => electronPolyfill.invoke('db-device-update-status', { id, status }),
  dbDeviceGetStats: () => electronPolyfill.invoke('db-device-get-stats'),

  dbCabinetFindAll: () => electronPolyfill.invoke('db-cabinet-find-all'),
  dbCabinetCreate: (cabinet) => electronPolyfill.invoke('db-cabinet-create', cabinet),
  dbCabinetUpdate: (id, updates) => electronPolyfill.invoke('db-cabinet-update', { id, updates }),
  dbCabinetDelete: (id) => electronPolyfill.invoke('db-cabinet-delete', id),
  dbCabinetFindById: (id) => electronPolyfill.invoke('db-cabinet-find-by-id', id),
  dbCabinetGetDevices: (cabinetId) => electronPolyfill.invoke('db-cabinet-get-devices', cabinetId),

  dbAlertFindAll: (filters) => electronPolyfill.invoke('db-alert-find-all', filters),
  dbAlertCreate: (alert) => electronPolyfill.invoke('db-alert-create', alert),
  dbAlertUpdateStatus: (id, status, resolvedBy, resolutionNote) =>
    electronPolyfill.invoke('db-alert-update-status', { id, status, resolvedBy, resolutionNote }),
  dbAlertDelete: (id) => electronPolyfill.invoke('db-alert-delete', id),
  dbAlertGetStats: () => electronPolyfill.invoke('db-alert-get-stats'),

  // ========== 数据接入（type 驱动）==========
  dbIngestCreate: (type, record) => electronPolyfill.invoke('db-ingest-create', { type, record }),
  dbIngestCreateMany: (type, records) => electronPolyfill.invoke('db-ingest-create-many', { type, records }),
  dbIngestUpdate: (type, id, updates) => electronPolyfill.invoke('db-ingest-update', { type, id, updates }),
  dbIngestDelete: (type, id) => electronPolyfill.invoke('db-ingest-delete', { type, id }),
  dbIngestFindAll: (type, filters) => electronPolyfill.invoke('db-ingest-find-all', { type, filters }),
  dbIngestFindById: (type, id) => electronPolyfill.invoke('db-ingest-find-by-id', { type, id }),
  dbIngestGetStats: (type) => electronPolyfill.invoke('db-ingest-get-stats', { type }),
  dbIngestMarkPoll: (type, id, status, error) => electronPolyfill.invoke('db-ingest-mark-poll', { type, id, status, error }),

  // ========== 拓扑数据 ==========

  async dbTopologyLoad({ userId, name }) {
    try {
      const nodesKey = `netops_topo_nodes_${userId}`;
      const edgesKey = `netops_topo_edges_${userId}`;
      const nodes = readJSON(nodesKey) || [];
      const edges = readJSON(edgesKey) || [];
      return { success: true, data: { nodes, edges } };
    } catch (e) {
      logger.error('[Polyfill] dbTopologyLoad 失败:', e);
      return { success: false, error: e.message };
    }
  },

  async dbTopologySave({ userId, name, nodes, edges }) {
    try {
      const nodesKey = `netops_topo_nodes_${userId}`;
      const edgesKey = `netops_topo_edges_${userId}`;
      writeJSON(nodesKey, nodes);
      writeJSON(edgesKey, edges);
      return { success: true };
    } catch (e) {
      logger.error('[Polyfill] dbTopologySave 失败:', e);
      return { success: false, error: e.message };
    }
  },

  // ========== 通用 JSON 数据 ==========

  async dbJsonLoad({ userId, dataType }) {
    try {
      const key = `netops_${dataType}_${userId}`;
      const data = readJSON(key);
      return { success: true, data: data !== null ? data : null };
    } catch (e) {
      logger.error('[Polyfill] dbJsonLoad 失败:', e);
      return { success: false, error: e.message };
    }
  },

  async dbJsonSave({ userId, dataType, data }) {
    try {
      const key = `netops_${dataType}_${userId}`;
      writeJSON(key, data);
      return { success: true };
    } catch (e) {
      logger.error('[Polyfill] dbJsonSave 失败:', e);
      return { success: false, error: e.message };
    }
  },
};

export default electronPolyfill;
