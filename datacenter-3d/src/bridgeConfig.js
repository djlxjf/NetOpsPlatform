// ===========================================================================
// 桥架参数配置模型（用户自定义调整）
//
// 与 bridgeSystem.js 配套：BridgeSystem 的几何参数全部来自本模块的配置对象，
// 用户可在「桥架铺设参数」面板中调整并实时预览，保存后持久化。
//
// 配置结构（每类桥架一组，弱电/强电支持多层与「铺设位置/走向」选择）：
//   {
//     weak:   { label, color, opacity, offsetX, hangerStep, rungStep,
//               place: 'over'|'under',        // 铺设位置：机柜上方 / 静电地板下方
//               route: 'network'|'rows'|'cross', // 布置走向：全程互联 / 沿排纵贯 / 横穿布线
//               layers: [ { y, width }, ... ],// 1~3 层，y=槽底安装高度
//               floor:  { enabled, y, width, offsetX,
//                         rungStep, hangerStep } },  // 兼容：旧版「地板下弱电层」
//     strong: { ... },
//     ground: { ... },   // 配套·接地干线（横穿）
//     fire:   { ... },   // 配套·消防管架（横穿）
//   }
// 说明：
//   · offsetX —— 桥架中心相对机柜排中心的横向偏移（m）。强弱电默认各偏 ±0.35m，
//     作为竖向分层之外的辅助水平净距；竖向分层（弱电 3.40m / 强电 3.00m）为主分离手段；
//   · hangerStep —— 吊杆（机柜上方）/ 支架（地板下方）水平跨距（m）；
//     rungStep —— 槽内横档间距（m）；
//   · layers —— 层数可调（弱电/强电 1~3 层），每层独立安装高度 y 与宽度；
//   · place —— 'over' 时机柜上方（默认，吊杆悬吊）；'under' 时改在防静电地板
//     架空层内敷设（支架支撑），安装高度 y 须落在地板下区间；
//   · route —— 'network' 全程互联（主干母线+馈线+列运行，默认）；
//     'rows' 仅沿每排机柜纵贯；'cross' 仅主干+馈线横穿；
//   · floor —— 旧版存档的「地板下弱电桥架」可选单层；place='under' 时由主层
//     直接承担地板下敷设，floor 层不再重复生成（兼容旧存档行为不变）；
//   · 显隐状态（visible）是会话态，不入配置，每次打开默认全隐。
//
// 校验依据（数值均为规范原文或按其推导，见 docs/桥架参数自定义功能说明.md）：
//   GB 51348-2019 第 8.5.3 条（底边距地）、第 8.5.4 条（吊杆跨距）、
//   第 8.5.5 条第 1/2/4 款（层间距离、电信与电力间距、最上层距顶棚）。
// ===========================================================================
import { FLOOR_DEFAULTS } from './floorConfig.js';

export const BRIDGE_STORAGE_KEY = 'dc3d.bridgeConfig.v1';

// 几何常量（与 bridgeSystem.js 的 PLATE_T + RAIL_H 对应）
export const TRAY_H = 0.18; // 槽底 0.05 + 侧帮 0.13

// 参数取值范围与最小间距（m）
// 间距口径说明：强弱电分离支持「垂直分层」或「水平平行」两种敷设方式，二者
// 满足其一即视为合规（GB 50311-2016 表 8.0.1 与 GB 51348-2019 第 8.5.5 条第 2 款
// 对「净距」的规定不限定方向）：
//   · 垂直净距 = |安装高度差| − 槽高 TRAY_H(0.18m)
//   · 水平净距 = |横向偏移差| − (两桥架宽度之和 / 2)
// 本方案默认采用「竖向分层」敷设（强电在下、弱电在上）：弱电 Y=3.40m、强电
// Y=3.00m，垂直净距 0.22m（>0，已错层），从根本上消除同标高长距离并行耦合与
// 交叉过桥；横向仍各偏 ±0.35m 作为辅助净距。若用户改回同标高，过桥弯避让逻辑
// 自动生效（参见 bridgeSystem.js 的过桥弯不变量）。
export const BRIDGE_LIMITS = {
  width:      { min: 0.10, max: 1.20 },
  offsetX:    { min: -0.60, max: 0.60 },
  hangerStep: { min: 1.0, max: 3.0 },  // GB 51348-2019 第 8.5.4 条：宜 1.5~3m，校验放宽至 1.0
  rungStep:   { min: 0.20, max: 1.00 },
  layers:     { min: 1, max: 3 },
  layerGap:   0.30,  // 同一桥架多层间最小本体净距（GB 51348-2019 第 8.5.5 条第 1 款）
  segGap:     0.30,  // 电信与电力桥架最小本体净距（垂直或水平，取其一达标即可；GB 51348-2019 第 8.5.5 条第 2 款降档值）
  auxGap:     0.10,  // 配套桥架与主体桥架最小本体净距（工程取值，防穿模）
  topClear:   0.15,  // 最上层桥架上部距顶棚/楼板（GB 51348-2019 第 8.5.5 条第 4 款）
  floorClear: 2.20,  // 桥架底边距地（GB 51348-2019 第 8.5.3 条：不宜低于 2.2m）
  floorY:     { min: -0.60, max: -0.05 }, // 地板下桥架标高区间（防静电地板架空层内，y<0）
  place:      ['over', 'under'],   // 铺设位置：机柜上方 / 静电地板下方
  route:      ['network', 'rows', 'cross'], // 布置走向：全程互联 / 沿排纵贯 / 横穿布线
};

// 「静电地板下方」敷设的标高区间（由 floorConfig 的离地高度 raise 与板厚 tileH 推导）：
//   · 下沿：槽底距架空层结构板面 ≥5cm（短支架安装间隙），且不越出 floorY 下限；
//   · 上沿：槽顶（y+槽高 TRAY_H）不得顶穿地板板厚（留 2cm 间隙），且不越出 floorY 上限。
// floorCfg 缺省时按默认地板参数（raise 0.35 / tileH 0.04）推得 [-0.30, -0.24]。
export function underYRange(floorCfg = FLOOR_DEFAULTS) {
  const f = floorCfg && typeof floorCfg === 'object' ? floorCfg : {};
  const raise = Number.isFinite(f.raise) ? f.raise : FLOOR_DEFAULTS.raise;
  const tileH = Number.isFinite(f.tileH) ? f.tileH : FLOOR_DEFAULTS.tileH;
  return {
    min: Math.max(BRIDGE_LIMITS.floorY.min, -raise + 0.05),
    max: Math.min(BRIDGE_LIMITS.floorY.max, -(tileH + TRAY_H + 0.02)),
  };
}

// 默认配置（与设计文档 3.2 节标高一一对应；弱电/强电默认机柜上方竖向分层——
// 弱电 3.40m 在上、强电 3.00m 在下；强电仍在机柜上方，满足 GB 51348 弱电在上工序）
export const BRIDGE_DEFAULTS = {
  weak: {
    label: '弱电桥架', color: 0x22d3ee, opacity: 0.52,
    place: 'over', route: 'network',
    offsetX: -0.35, hangerStep: 2.0, rungStep: 0.5,
    layers: [{ y: 3.40, width: 0.40 }],
    floor: { enabled: false, y: -0.30, width: 0.30, offsetX: 0, rungStep: 0.5, hangerStep: 2.0 },
  },
  strong: {
    label: '强电桥架', color: 0xf59e0b, opacity: 0.42,
    place: 'over', route: 'network',
    offsetX: 0.35, hangerStep: 2.0, rungStep: 0.5,
    layers: [{ y: 3.00, width: 0.30 }],
  },
  ground: {
    label: '接地干线', color: 0x34d399, opacity:0.48,
    offsetX: 0, hangerStep: 2.4, rungStep: 0.6,
    layers: [{ y: 4.20, width: 0.25 }],
  },
  fire: {
    label: '消防管架', color: 0xef4444, opacity: 0.45,
    offsetX: 0, hangerStep: 2.4, rungStep: 0.6,
    layers: [{ y: 4.50, width: 0.22 }],
  },
};

export const BRIDGE_KINDS = ['weak', 'strong', 'ground', 'fire'];

// 支持「铺设位置 / 走向」选择的桥架类（机柜上方/地板下方 + 三种走向）
export const PLACE_KINDS = ['weak', 'strong'];

/** 归一化铺设位置：仅弱电/强电可设，其余类恒为 'over' */
export function normPlace(kind, v) {
  if (PLACE_KINDS.indexOf(kind) < 0) return 'over';
  return v === 'under' ? 'under' : 'over';
}

/** 归一化布置走向：仅弱电/强电可设，非法值回落 'network' */
export function normRoute(kind, v) {
  if (PLACE_KINDS.indexOf(kind) < 0) return 'network';
  return BRIDGE_LIMITS.route.indexOf(v) >= 0 ? v : 'network';
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const num = (v, dflt) => (Number.isFinite(Number(v)) ? Number(v) : dflt);

function cloneDefaults() {
  return JSON.parse(JSON.stringify(BRIDGE_DEFAULTS));
}

/** 深合并：以默认值为骨架，保留用户值；结构不符（如 layers 非数组）回落默认 */
export function mergeBridgeConfig(raw) {
  const base = cloneDefaults();
  if (!raw || typeof raw !== 'object') return base;
  for (const kind of BRIDGE_KINDS) {
    const u = raw[kind];
    if (!u || typeof u !== 'object') continue;
    const d = base[kind];
    if (typeof u.label === 'string' && u.label) d.label = u.label;
    d.place = normPlace(kind, u.place);
    d.route = normRoute(kind, u.route);
    d.offsetX = num(u.offsetX, d.offsetX);
    d.hangerStep = num(u.hangerStep, d.hangerStep);
    d.rungStep = num(u.rungStep, d.rungStep);
    if (Array.isArray(u.layers) && u.layers.length) {
      // 只取合法条目，层数由调用方/sanitize 再钳制
      d.layers = u.layers
        .filter((l) => l && typeof l === 'object')
        .slice(0, BRIDGE_LIMITS.layers.max)
        .map((l) => ({ y: num(l.y, d.layers[0].y), width: num(l.width, d.layers[0].width) }));
      if (!d.layers.length) d.layers = [{ y: num(u.layers[0] && u.layers[0].y, base[kind].layers[0].y), width: base[kind].layers[0].width }];
    }
    // 地板下弱电桥架（弱电专属，可选单层）
    if (kind === 'weak' && u.floor && typeof u.floor === 'object') {
      d.floor = {
        enabled: u.floor.enabled === true,
        y: num(u.floor.y, -0.30),
        width: num(u.floor.width, 0.30),
        offsetX: num(u.floor.offsetX, 0),
        rungStep: num(u.floor.rungStep, 0.5),
        hangerStep: num(u.floor.hangerStep, 2.0),
      };
    }
  }
  return base;
}

// ---------------------------------------------------------------------------
// 持久化（localStorage；浏览器与 Electron file:// 下均可用，损坏时回落默认）
// ---------------------------------------------------------------------------
export function loadBridgeConfig() {
  try {
    const txt = localStorage.getItem(BRIDGE_STORAGE_KEY);
    if (!txt) return cloneDefaults();
    return mergeBridgeConfig(JSON.parse(txt));
  } catch (_) {
    return cloneDefaults();
  }
}

export function saveBridgeConfig(cfg) {
  try {
    localStorage.setItem(BRIDGE_STORAGE_KEY, JSON.stringify(cfg));
    return true;
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 自定义路径（手绘布线）存储模型
//
// 用户经交互手动绘制的强弱电桥架走向路径。每类（weak/strong）持有 0~N 条路径，
// 每条路径 = 有序节点数组 + 敷设方式。几何由 BridgeSystem 依据节点自动生成，
// 转角处自动补弯头，强弱电各走各的组、竖向分层兜底避免路径冲突（见 bridgeSystem.js）。
//   path = {
//     id:     string,                 // 路径唯一标识（dc3d 内部生成）
//     mount:  'over'|'under'|'wall',  // 敷设方式：机柜上方 / 静电地板下方 / 沿墙贴墙
//     points: [{ x, z, wallKey? }],   // 有序节点（x,z 为地板平面坐标，m；
//                                     //   wall 模式的节点贴某面墙内表面，wallKey 记墙别）
//   }
// 说明：
//   · 节点强制轴对齐（相邻两点共享 X 或共享 Z），保证桥架横平竖直、转角可生成直角弯头，
//     与系统既有自动路由（全部 axis-aligned）同口径；
//   · 标高（安装高度）沿用「桥架铺设参数」面板里该类桥架的层配置（layer.y），
//     mount 只决定水平落位：over/under 落在点击地面投影、wall 吸附到墙内表面；
//   · 显隐、竖向分层、过桥弯避让全自动沿用既有管线，无需重复实现。
// ---------------------------------------------------------------------------
export const BRIDGE_PATHS_KEY = 'dc3d.bridgePaths.v1';
export const PATH_MOUNTS = ['over', 'under', 'wall'];

let _pidSeq = 1;
function _genPathId() { return `p${Date.now().toString(36)}${(_pidSeq++).toString(36)}`; }

export function defaultBridgePaths() { return { weak: [], strong: [] }; }

/** 清洗单条路径：非法项降级为安全值；返回新对象（不修改入参） */
export function sanitizeBridgePath(p, roomDims) {
  if (!p || typeof p !== 'object') return null;
  const mount = PATH_MOUNTS.indexOf(p.mount) >= 0 ? p.mount : 'over';
  let pts = Array.isArray(p.points) ? p.points : [];
  const half = roomDims && roomDims.width ? { x: roomDims.width / 2, z: roomDims.depth / 2 } : { x: 20, z: 20 };
  pts = pts
    .filter((q) => q && Number.isFinite(q.x) && Number.isFinite(q.z))
    .map((q) => ({
      x: Math.max(-half.x, Math.min(half.x, Number(q.x))),
      z: Math.max(-half.z, Math.min(half.z, Number(q.z))),
      wallKey: typeof q.wallKey === 'string' ? q.wallKey : undefined,
    }));
  // 至少 2 个节点才构成一条可建模路径（单点无法成段）
  if (pts.length < 2) return null;
  return { id: typeof p.id === 'string' ? p.id : _genPathId(), mount, points: pts };
}

/** 清洗整份路径数据（弱电/强电两组），非法组/路径丢弃 */
export function sanitizeBridgePaths(raw, roomDims) {
  const out = defaultBridgePaths();
  if (!raw || typeof raw !== 'object') return out;
  for (const kind of ['weak', 'strong']) {
    if (!Array.isArray(raw[kind])) continue;
    out[kind] = raw[kind]
      .map((p) => sanitizeBridgePath(p, roomDims))
      .filter(Boolean);
  }
  return out;
}

/** 读取已保存路径；损坏/缺失返回默认空结构 */
export function loadBridgePaths(roomDims) {
  try {
    const txt = localStorage.getItem(BRIDGE_PATHS_KEY);
    if (!txt) return defaultBridgePaths();
    return sanitizeBridgePaths(JSON.parse(txt), roomDims);
  } catch (_) {
    return defaultBridgePaths();
  }
}

/** 持久化路径（保存按钮/完成路径时调用；opts.save !== false 才写盘） */
export function saveBridgePaths(paths, opts = {}) {
  const out = sanitizeBridgePaths(paths);
  if (opts.save !== false) {
    try { localStorage.setItem(BRIDGE_PATHS_KEY, JSON.stringify(out)); } catch (_) { /* 无存储环境仅内存态 */ }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 校验
// ---------------------------------------------------------------------------
/**
 * 校验配置合法性。roomDims 为 config.js 的活对象（width/height/depth）；
 * floorCfg 为 floorConfig 的活配置（raise/tileH，决定「静电地板下方」敷设的
 * 标高区间），缺省按默认地板参数。返回错误数组：[{ kind, layer, field, msg }]；
 * 空数组 = 全部通过。入口先与默认值深合并（缺失 kind 以默认补齐），因此可安全
 * 传入局部配置（如仅 { weak: {...} }），校验对象始终是「生效配置」；不修改传入配置。
 */
export function validateBridgeConfig(rawCfg, roomDims, floorCfg) {
  const errs = [];
  const cfg = mergeBridgeConfig(rawCfg);
  const L = BRIDGE_LIMITS;
  const height = (roomDims && roomDims.height) || 8;
  const yMax = height - L.topClear - TRAY_H; // 槽底最高安装高度（机柜上方）
  const under = underYRange(floorCfg);       // 静电地板下方敷设标高区间

  const push = (kind, layer, field, msg) => errs.push({ kind, layer, field, msg });

  for (const kind of BRIDGE_KINDS) {
    const c = cfg[kind];
    const n = Array.isArray(c.layers) ? c.layers.length : 0;
    if (n < L.layers.min || n > L.layers.max) {
      push(kind, null, 'layers', `层数须为 ${L.layers.min}~${L.layers.max} 层（当前 ${n}）`);
      continue;
    }
    for (const [key, lim, name] of [['hangerStep', L.hangerStep, c.place === 'under' ? '支架跨距' : '吊杆跨距'], ['rungStep', L.rungStep, '横档间距']]) {
      if (!(num(c[key], NaN) >= lim.min && num(c[key], NaN) <= lim.max)) {
        push(kind, null, key, `${name}须在 ${lim.min}~${lim.max} m（当前 ${c[key]}）`);
      }
    }
    if (!(num(c.offsetX, NaN) >= L.offsetX.min && num(c.offsetX, NaN) <= L.offsetX.max)) {
      push(kind, null, 'offsetX', `横向偏移须在 ${L.offsetX.min}~${L.offsetX.max} m（当前 ${c.offsetX}）`);
    }
    let prevTop = null; // 上一层槽顶高度
    // 地板下方敷设的退化区间：架空层深度不足以容纳桥架（板厚+槽高+间隙）时，
    // 任何标高都不合法——报 place 级错误并跳过逐层标高检查，提示去调离地高度
    const underDegenerate = c.place === 'under' && under.min > under.max + 1e-6;
    if (underDegenerate) {
      const fcfg = floorCfg && typeof floorCfg === 'object' ? floorCfg : {};
      const raise = Number.isFinite(fcfg.raise) ? fcfg.raise : FLOOR_DEFAULTS.raise;
      const need = (Number.isFinite(fcfg.tileH) ? fcfg.tileH : FLOOR_DEFAULTS.tileH) + TRAY_H + 0.07;
      push(kind, null, 'place', `当前地板离地高度 ${raise} m 不足以在地板下敷设桥架（需 ≥ ${need.toFixed(2)} m，请在「静电地板铺设」中加大离地高度）`);
    }
    c.layers.forEach((l, i) => {
      const at = `第 ${i + 1} 层`;
      if (!(num(l.width, NaN) >= L.width.min && num(l.width, NaN) <= L.width.max)) {
        push(kind, i, 'width', `${at}宽度须在 ${L.width.min}~${L.width.max} m（当前 ${l.width}）`);
      }
      if (c.place === 'under') {
        // 静电地板下方：标高须落在架空层内（不顶穿地板板厚、不低于结构板面）
        if (!underDegenerate && !(num(l.y, NaN) >= under.min - 1e-6 && num(l.y, NaN) <= under.max + 1e-6)) {
          push(kind, i, 'y', `${at}安装高度须在 ${under.min.toFixed(2)}~${under.max.toFixed(2)} m（静电地板下方架空层内，当前 ${l.y}）`);
        }
      } else if (!(num(l.y, NaN) >= L.floorClear && num(l.y, NaN) <= yMax)) {
        push(kind, i, 'y', `${at}安装高度须在 ${L.floorClear}~${yMax.toFixed(2)} m（当前 ${l.y}）`);
      }
      const top = num(l.y, 0) + TRAY_H;
      if (prevTop != null && num(l.y, 0) - prevTop < L.layerGap) {
        push(kind, i, 'y', `${at}与上层本体净距 ${(num(l.y, 0) - prevTop).toFixed(2)} m < ${L.layerGap} m（GB 51348-2019 第 8.5.5 条第 1 款）`);
      }
      prevTop = top;
    });
    // 最上层槽顶不得突破板底净距（仅机柜上方敷设；地板下方在架空层内，不适用）
    if (c.place !== 'under') {
      const topMost = Math.max.apply(null, c.layers.map((l) => num(l.y, 0) + TRAY_H));
      if (topMost > height - L.topClear + 1e-6) {
        push(kind, null, 'y', `最上层槽顶距楼板不足 ${L.topClear} m（GB 51348-2019 第 8.5.5 条第 4 款）`);
      }
    }
  }

  // 地板下弱电桥架（可选）校验
  const f = cfg.weak && cfg.weak.floor;
  if (f && f.enabled) {
    if (!(num(f.y, NaN) >= L.floorY.min && num(f.y, NaN) <= L.floorY.max)) {
      push('weak', null, 'floor.y', `地板下弱电桥架标高须在 ${L.floorY.min}~${L.floorY.max} m（防静电地板架空层内，当前 ${f.y}）`);
    }
    if (!(num(f.width, NaN) >= L.width.min && num(f.width, NaN) <= L.width.max)) {
      push('weak', null, 'floor.width', `地板下弱电桥架宽度须在 ${L.width.min}~${L.width.max} m（当前 ${f.width}）`);
    }
    if (!(num(f.offsetX, NaN) >= L.offsetX.min && num(f.offsetX, NaN) <= L.offsetX.max)) {
      push('weak', null, 'floor.offsetX', `地板下弱电桥架横向偏移须在 ${L.offsetX.min}~${L.offsetX.max} m（当前 ${f.offsetX}）`);
    }
  }

  // 跨类净距（本体净距可沿「垂直」或「水平」任一方向满足，取其一达标即可）：
  //   垂直净距 = |安装高度差| − 槽高 TRAY_H(0.18m)
  //   水平净距 = |横向偏移差| − (两桥架宽度之和 / 2)
  // 依据 GB 50311-2016 表 8.0.1 与 GB 51348-2019 第 8.5.5 条第 2 款对「净距」的
  // 规定（不限定方向）。弱电地板下桥架作为弱电的一层参与比对。
  const layersOf = (kind) => {
    const c = cfg[kind];
    if (!c || !Array.isArray(c.layers)) return [];
    const arr = c.layers.map((l) => ({ y: num(l.y, 0), width: num(l.width, 0), offsetX: num(c.offsetX, 0) }));
    if (kind === 'weak' && c.floor && c.floor.enabled) {
      arr.push({ y: num(c.floor.y, -0.30), width: num(c.floor.width, 0.30), offsetX: num(c.floor.offsetX, 0) });
    }
    return arr;
  };
  const cross = (a, b, gap, note) => {
    const La = layersOf(a), Lb = layersOf(b);
    if (!La.length || !Lb.length) return;
    for (const la of La) for (const lb of Lb) {
      const vNet = Math.abs(la.y - lb.y) - TRAY_H;
      const hNet = Math.abs(la.offsetX - lb.offsetX) - (la.width / 2 + lb.width / 2);
      if (vNet < gap - 1e-6 && hNet < gap - 1e-6) {
        push(a, null, 'y', `与${cfg[b].label}本体间距不足（垂直净距 ${vNet.toFixed(2)}m、水平净距 ${hNet.toFixed(2)}m 均 < ${gap} m；${note}）`);
      }
    }
  };
  cross('weak', 'strong', L.segGap, 'GB 51348-2019 第 8.5.5 条第 2 款，接地金属桥架降档值；无屏蔽盖板需 0.50m');
  for (const aux of ['ground', 'fire']) {
    for (const main of ['weak', 'strong']) cross(aux, main, L.auxGap, '工程取值，防桥架穿模');
    for (const other of ['ground', 'fire']) if (other !== aux) cross(aux, other, L.auxGap, '工程取值，防桥架穿模');
  }

  // S-1 固化「弱电在上、强电在下」工序：强电最低层须低于弱电最高层，否则报错误
  // 阻断保存——防止配置反转导致「强电压在弱电之上」（电磁干扰恶化、机械坠落隐患、
  // 检修须穿越带电层）。这是工序安全红线，不依赖过桥弯避让逻辑兜底。
  const wL = layersOf('weak'), sL = layersOf('strong');
  // 仅当强弱电「同处一个敷设空间」时才比较上下关系。
  // 新增「静电地板下方」敷设位置后，完全可能出现弱电走架空层、强电走机柜上方
  // 的分层敷设——这是常规做法，两者分处两套独立空间，既不存在强电压在弱电上的
  // 电磁干扰，也不存在检修穿越带电层的坠落隐患。若不加此判断，S-1 会把这种合法
  // 布局误判为违规并阻断保存，等于让「地板下方」选项实际不可用。
  // 跨空间的间距由上面的 cross() 按三维净距另行校验（垂直距离天然满足）。
  // S-1「弱电在上、强电在下」仅约束机柜上方（over）竖向分层敷设这种常规工序：
  // 弱电 3.40m 在上、强电 3.00m 在下，机械坠落与检修穿越带电层是真实风险。
  // 一旦任一桥架改走静电地板下方（under），两者在架空层内并排敷设，竖向上下关系
  // 在浅空腔内无实际意义，改由上方 cross() 按三维净距（水平/垂直取其一达标）判定。
  // 因此 S-1 只在强弱电「同处机柜上方」时生效；跨空间或同在地板下均不套用此红线。
  if (wL.length && sL.length && cfg.weak.place === 'over' && cfg.strong.place === 'over') {
    const wMax = Math.max.apply(null, wL.map((l) => l.y)); // 弱电最高层标高
    const sMin = Math.min.apply(null, sL.map((l) => l.y)); // 强电最低层标高
    if (sMin >= wMax - 1e-6) {
      push('strong', null, 'y', `强电安装高度须低于弱电（弱电在上、强电在下）：当前强电最低 ${sMin.toFixed(2)}m ≥ 弱电最高 ${wMax.toFixed(2)}m，违反强弱电分离工序（S-1 红线）`);
    }
  }

  return errs;
}

// ---------------------------------------------------------------------------
// 钳制（输入即时生效）：把标量参数压回合法范围，结构参数（层数）原样返回，
// 层间距等结构性问题由 validate 报告，UI 提示但不静默改动用户的高度值。
// floorCfg 同 validateBridgeConfig：决定「静电地板下方」敷设的标高区间。
// ---------------------------------------------------------------------------
export function sanitizeBridgeConfig(cfg, roomDims, floorCfg) {
  const L = BRIDGE_LIMITS;
  const height = (roomDims && roomDims.height) || 8;
  const out = mergeBridgeConfig(cfg);
  const yMax = height - L.topClear - TRAY_H;
  const under = underYRange(floorCfg);
  for (const kind of BRIDGE_KINDS) {
    const c = out[kind];
    c.hangerStep = clamp(num(c.hangerStep, BRIDGE_DEFAULTS[kind].hangerStep), L.hangerStep.min, L.hangerStep.max);
    c.rungStep = clamp(num(c.rungStep, BRIDGE_DEFAULTS[kind].rungStep), L.rungStep.min, L.rungStep.max);
    c.offsetX = clamp(num(c.offsetX, 0), L.offsetX.min, L.offsetX.max);
    // 机柜上方 → [底边距地, 板底净距]；静电地板下方 → 架空层区间（不顶穿地板、不低于结构板面）
    // 退化区间（架空层过浅，下沿高于上沿）时不钳制标高：保留用户原值，合法性由
    // validateBridgeConfig 报 place 级错误、UI 阻断保存。若此时仍按互换后的两界
    // 钳制，会把用户层高悄悄改成边界值（如 -0.29→-0.24），待地板离地高度恢复后
    // 无法还原——错误态必须完全可逆（floorPanel 的桥架联动会实时过一遍 sanitize）
    const underDegen = under.min > under.max + 1e-6;
    let yLo = c.place === 'under' ? (underDegen ? -Infinity : under.min) : L.floorClear;
    let yHi = c.place === 'under' ? (underDegen ? Infinity : under.max) : yMax;
    if (yLo > yHi) { const t = yLo; yLo = yHi; yHi = t; }
    c.layers = c.layers.slice(0, L.layers.max).map((l) => ({
      y: clamp(num(l.y, BRIDGE_DEFAULTS[kind].layers[0].y), yLo, yHi),
      width: clamp(num(l.width, BRIDGE_DEFAULTS[kind].layers[0].width), L.width.min, L.width.max),
    }));
    if (kind === 'weak' && c.floor && typeof c.floor === 'object') {
      c.floor.enabled = c.floor.enabled === true;
      c.floor.y = clamp(num(c.floor.y, -0.30), L.floorY.min, L.floorY.max);
      c.floor.width = clamp(num(c.floor.width, 0.30), L.width.min, L.width.max);
      c.floor.offsetX = clamp(num(c.floor.offsetX, 0), L.offsetX.min, L.offsetX.max);
      c.floor.rungStep = clamp(num(c.floor.rungStep, 0.5), L.rungStep.min, L.rungStep.max);
      c.floor.hangerStep = clamp(num(c.floor.hangerStep, 2.0), L.hangerStep.min, L.hangerStep.max);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 导出 / 导入（随工程走的高级用法）
// ---------------------------------------------------------------------------
export function exportBridgeConfig(cfg) {
  return JSON.stringify(cfg, null, 2);
}

/** 解析导入文本；返回 { ok, cfg, error } */
export function importBridgeConfig(text) {
  let raw;
  try { raw = JSON.parse(text); } catch (e) { return { ok: false, error: 'JSON 解析失败：' + e.message }; }
  if (!raw || typeof raw !== 'object' || !raw.weak || !raw.strong) {
    return { ok: false, error: '文件结构不符：缺少 weak/strong 桥架配置' };
  }
  return { ok: true, cfg: mergeBridgeConfig(raw) };
}
