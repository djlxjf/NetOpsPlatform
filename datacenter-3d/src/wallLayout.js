// 墙面布局：数据模型 / 默认数据 / 持久化 / 合法性校验
// 坐标约定（2D 编辑器与数据一致）：
//   offset —— 门窗左边缘距墙面左端点的横向距离（m）
//   sill   —— 门窗底边距地面的高度（m），门必须为 0（落地）
//   width / height —— 门窗自身尺寸（m）

// 领域纯函数层（整改 P1-4-J）：门窗合法性校验纯函数已抽取至 ./domain/validation.js
// 作为唯一真相源。此处仅做 import + re-export，并保留 hasElectronIPC / savePlan /
// loadPlan / debouncedSave 等含 IPC/存储副作用的逻辑（这些不属于纯函数层）。
import { validateOpening, validateWall, OPENING_MIN_SIZE, WINDOW_MIN_SILL, EPS } from './domain/validation.js';
export { validateOpening, validateWall, OPENING_MIN_SIZE, WINDOW_MIN_SILL, EPS };

// P1-1-B：宿主（Vue 大屏）可注入数据端口，建立「Vue→3D 单向注入、3D→Vue 仅经回调」
// 的数据流，解耦 3D 直连 IPC。注入后 savePlan/loadPlan 优先调用注入函数，否则回退
// window.electronAPI / localStorage（保证独立运行工具模式仍可用，不删除该回退路径）。
// 注入契约：ports = { savePlan(roomId, plan)=>Promise<boolean>,
//                    loadPlan(roomId)=>Promise<object|null 归一化形态>,
//                    getRackStatus?, onDcAlert? }
let _ports = null;
export function bindPorts(ports) { _ports = ports || null; }

const LS_KEY = 'dc3d.plan.v3';
let _uid = 0;

export function genId(type) {
  _uid += 1;
  const prefix = type === 'door' ? 'D' : (type === 'relief' ? 'R' : 'W');
  return `${prefix}${String(_uid).padStart(2, '0')}`;
}

// 整改 O4：读档/导入后调用——扫描已有门窗 id，把模块级计数器 _uid 快进到
// 当前最大值，避免「每次打开页面从 D01/W01 重新发号」导致 id 重名：
//   ① validateOpening 的重叠检查按 id 跳过自身 → 重名门窗互相穿透不报错；
//   ② Electron 端 dc_openings 按 id INSERT OR REPLACE → 后写的同 id 行覆盖旧行。
// id 形态统一为 D01/W02/R01（前缀 + 两位数字，超 99 自然增位）。
export function syncIdCounter(layout) {
  if (!layout) return;
  let max = 0;
  for (const key of ['back', 'left', 'front', 'right']) {
    const w = layout[key];
    if (!w || !Array.isArray(w.openings)) continue;
    for (const op of w.openings) {
      const m = /^[DWR](\d+)$/.exec(op && op.id);
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  if (max > _uid) _uid = max;
}

export function defaultWallLayout() {
  _uid = 0;
  // 默认为封闭机房：四面墙均无门窗，由用户在阶段②自行布置。
  // 长度/高度由 roomDims（config.js）在 syncWallsToRoom 中统一覆盖，
  // 此处仅为首次调用前的兜底值。
  const blank = () => ({ openings: [] });
  return {
    back: { length: 26, height: 8, thickness: 0.3, ...blank() },
    left: { length: 22, height: 8, thickness: 0.3, ...blank() },
    front: { length: 26, height: 8, thickness: 0.3, ...blank() },
    right: { length: 22, height: 8, thickness: 0.3, ...blank() },
  };
}

// ---------------------------------------------------------------------------
// 机房尺寸 ↔ 墙面同步：墙长=对应房间边长，墙高=房间高；越界门窗钳回合法范围
// ---------------------------------------------------------------------------
export function syncWallsToRoom(layout, dims) {
  const edgeLen = { back: dims.width, front: dims.width, left: dims.depth, right: dims.depth };
  for (const key of ['back', 'left', 'front', 'right']) {
    const w = layout[key];
    w.length = edgeLen[key];
    w.height = dims.height;
    for (const op of w.openings) {
      op.width = Math.min(op.width, w.length);
      op.height = Math.min(op.height, w.height);
      op.offset = Math.max(0, Math.min(op.offset, w.length - op.width));
      if (op.type === 'door') {
        op.sill = 0;
        op.height = Math.min(op.height, w.height);
      } else {
        op.sill = Math.max(0.3, Math.min(op.sill, w.height - op.height));
      }
    }
  }
  return layout;
}

// ---------------------------------------------------------------------------
// 持久化（v3：房间尺寸 + 墙面布局 + 设备清单）
// 策略：IPC 优先（Electron 主进程 SQLite，dc_* 独立规划表）；
//       不可用时回退到 localStorage（浏览器独立运行 / 兜底）。
// roomId 用于未来多房间切换；独立运行工具默认使用 DEFAULT_ROOM_ID。
// ---------------------------------------------------------------------------
export const DEFAULT_ROOM_ID = 'MAIN';

// 运行环境是否具备 Electron IPC 能力（window.electronAPI.dcPlan*）
function hasElectronIPC() {
  return typeof window !== 'undefined'
    && window.electronAPI
    && typeof window.electronAPI.dcPlanSave === 'function'
    && typeof window.electronAPI.dcPlanLoad === 'function'
    && typeof window.electronAPI.dcPlanList === 'function'
    && typeof window.electronAPI.dcPlanDelete === 'function';
}

// localStorage 兜底：默认房间沿用历史键 dc3d.plan.v3，其余按 roomId 区分
function lsKey(roomId) {
  return roomId === DEFAULT_ROOM_ID ? LS_KEY : `dc3d.plan.${roomId}`;
}

function lsSave(roomId, plan) {
  try {
    localStorage.setItem(lsKey(roomId), JSON.stringify({ v: 3, ...plan }));
    return true;
  } catch {
    return false;
  }
}

function lsLoad(roomId) {
  try {
    const raw = localStorage.getItem(lsKey(roomId));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 3 || !data.dims || !data.walls) return null;
    for (const key of ['back', 'left', 'front', 'right']) {
      const w = data.walls[key];
      if (!w || typeof w.length !== 'number' || typeof w.height !== 'number'
        || typeof w.thickness !== 'number' || !Array.isArray(w.openings)) return null;
    }
    if (!Array.isArray(data.racks)) data.racks = [];
    data.seedVersion = Number(data.seedVersion) || 0;
    return data;
  } catch {
    return null;
  }
}

/**
 * 保存完整方案（异步）
 * @param {string} roomId
 * @param {object} dims {width,depth,height}
 * @param {object} walls {back,left,front,right}
 * @param {Array}  racks
 * @param {boolean} locked
 * @param {string|null} name 房间名（Electron 侧用于展示）
 * @returns {Promise<boolean>}
 */
export async function savePlan(roomId = DEFAULT_ROOM_ID, dims, walls, racks = [], locked = false, name = null, seedVersion = 0, engineering = null) {
  const plan = {
    name: name || (roomId === DEFAULT_ROOM_ID ? '主机房' : roomId),
    dims, walls, racks, locked,
    // 整改 G-PWR-13/G-FIRE-12/G-SEC-12/G-CAB-10：五域工程配置持久化（报审草稿数据源）
    ...(engineering ? { engineering } : {}),
    // seedVersion：记录生成机房内容的 seedLayout 版本，用于识别「旧空房间存档」
    // 使代码更新后能自动重建（仅当 racks 为空时才重建，见 main.js _boot）
    seedVersion: Number(seedVersion) || 0,
  };
  // P1-1-B：优先使用宿主注入的保存端口（Vue 侧落库），失败再回退内置路径
  if (_ports && typeof _ports.savePlan === 'function') {
    try {
      const ok = await _ports.savePlan(roomId, plan);
      return !!ok;
    } catch (e) {
      debugLog('injected savePlan failed, fallback: ' + (e && e.message));
    }
  }
  if (hasElectronIPC()) {
    try {
      const res = await window.electronAPI.dcPlanSave(roomId, plan);
      if (res && res.success) return true;
    } catch (e) {
      debugLog('dcPlanSave IPC failed, fallback to localStorage: ' + (e && e.message));
    }
    return lsSave(roomId, plan); // IPC 失败兜底
  }
  return lsSave(roomId, plan);
}

/**
 * 同步保存（仅写 localStorage，不经过 IPC）
 *
 * 用途：销毁 / 切页 / 页面关闭时，异步 savePlan 的 IPC 往返可能来不及完成即被中断，
 * 导致刚摆好的布局丢失。此同步版本用于「最后一刻」的兜底落盘。
 * @returns {boolean} 是否写入成功
 */
export function savePlanSync(roomId = DEFAULT_ROOM_ID, dims, walls, racks = [], locked = false, seedVersion = 0, engineering = null) {
  return lsSave(roomId, {
    name: roomId === DEFAULT_ROOM_ID ? '主机房' : roomId,
    dims, walls, racks, locked,
    seedVersion: Number(seedVersion) || 0,
    ...(engineering ? { engineering } : {}),
  });
}

// F5：保存防抖。连续编辑（拖拽/连续改参）时合并多次 savePlan 调用，
// 仅在停止 500ms 后落盘一次，降低 IPC / SQLite 写入压力。
let _saveTimer = null
export function debouncedSave(roomId, dims, walls, racks, locked, name = null, seedVersion = 0, onDone = null, engineering = null) {
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(async () => {
    _saveTimer = null
    const ok = await savePlan(roomId, dims, walls, racks, locked, name, seedVersion, engineering)
    if (typeof onDone === 'function') onDone(ok)
  }, 500)
}

/**
 * 把任意来源读到的原始存档 d 归一化为标准形态：
 * 解析 engineering（对象或 JSON 字符串）、补全 racks、规整 seedVersion。
 * IPC 分支与注入分支共用，保证两种来源返回结构一致。
 */
function normalizeLoaded(d) {
  let engineering = null;
  if (d.engineering && typeof d.engineering === 'object') {
    engineering = d.engineering;
  } else if (typeof d.engineering === 'string' && d.engineering) {
    try { engineering = JSON.parse(d.engineering); } catch (_) { engineering = null; }
  }
  if (!Array.isArray(d.racks)) d.racks = [];
  d.seedVersion = Number(d.seedVersion) || 0;
  return {
    v: 3,
    name: d.name,
    dims: d.dims,
    walls: d.walls,
    racks: d.racks,
    locked: !!d.locked,
    seedVersion: d.seedVersion,
    ...(engineering ? { engineering } : {}),
  };
}

/**
 * 读取完整方案（异步）；返回 null 表示无数据
 * @param {string} roomId
 * @returns {Promise<object|null>} { v:3, name, dims, walls, racks, locked }
 */
export async function loadPlan(roomId = DEFAULT_ROOM_ID) {
  // P1-1-B：优先使用宿主注入的读取端口（Vue 侧取数），失败再回退内置路径
  if (_ports && typeof _ports.loadPlan === 'function') {
    try {
      const d = await _ports.loadPlan(roomId);
      if (d && d.dims && d.walls) {
        syncIdCounter(d.walls);
        return normalizeLoaded(d);
      }
    } catch (e) {
      debugLog('injected loadPlan failed, fallback: ' + (e && e.message));
    }
  }
  if (hasElectronIPC()) {
    try {
      const res = await window.electronAPI.dcPlanLoad(roomId);
      if (res && res.success && res.data) {
        const d = res.data;
        // 整改 O1：localStorage 分支（lsLoad 整案返回）一直带着 engineering，
        // 但此 IPC 分支手工拼返回对象时丢了它 → Electron 下端③保存的五域工程
        // 配置每次重启都被 engDefaults() 重置。此处按存档形态透传：
        // DAO 可能回传对象或 JSON 字符串（取决于列存储方式），统一归一为对象。
        // 整改 O4：读后续号，避免新增门窗 id 与既有存档重名
        syncIdCounter(d.walls);
        return normalizeLoaded(d);
      }
    } catch (e) {
      debugLog('dcPlanLoad IPC failed, fallback to localStorage: ' + (e && e.message));
    }
    const ls = lsLoad(roomId); // IPC 失败兜底
    if (ls) syncIdCounter(ls.walls);
    return ls;
  }
  const ls = lsLoad(roomId);
  if (ls) syncIdCounter(ls.walls);
  return ls;
}

function debugLog(msg) {
  if (typeof console !== 'undefined') console.warn('[wallLayout] ' + msg);
}

// ---------------------------------------------------------------------------
// 合法性校验
// ---------------------------------------------------------------------------
// validateOpening / validateWall / OPENING_MIN_SIZE / WINDOW_MIN_SILL / EPS
// 已抽取至 ./domain/validation.js（领域纯函数唯一真相源），由文件顶部 import +
// re-export。以下 findFreeSlot 依赖上述 re-export 的符号，无需改动。

// 为新增门窗寻找第一个合法空位，找不到返回 null
export function findFreeSlot(wall, width, height, sill) {
  const step = 0.25;
  for (let offset = 0.5; offset + width <= wall.length - 0.5 + EPS; offset += step) {
    const probe = { id: '__probe__', type: sill === 0 ? 'door' : 'window', offset, sill, width, height };
    if (validateOpening(wall, probe).length === 0) return offset;
  }
  return null;
}
