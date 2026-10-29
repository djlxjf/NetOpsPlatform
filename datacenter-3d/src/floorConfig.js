// ===========================================================================
// 静电地板铺设参数配置模型（floorConfig.js）
//
// 与 room.js 配套：机房「架空防静电地板」的全部几何参数来自本模块的配置对象，
// 用户在「静电地板铺设」面板（floorPanel.js）中调整并实时预览，保存后持久化
// （localStorage，键 dc3d.floorConfig.v1）。
//
// 配置结构（所有参数相互独立，可分别设置）：
//   {
//     tileW:   0.60,     // 单块地板砖长度（沿 X，m）
//     tileD:   0.60,     // 单块地板砖宽度（沿 Z，m）
//     tileH:   0.04,     // 地板板厚（m）
//     gap:     0.008,    // 砖缝宽度（m）
//     raise:   0.35,     // 离地高度（m）：地板顶面保持 y=0 不变，架空层向 -Y 延伸
//     surface: 'light',  // 贴面：light 浅灰 / dark 深灰 / blue 蓝灰
//   }
// 坐标系口径（重要，与全部既有锚点兼容）：
//   地板顶面恒为 y=0 —— 机柜/设备/桥架吊杆等既有锚点一律不动；「离地高度」
//   实现为地板面向下架空层的深度（板厚 + 空腔 + 裙边），空腔内按 1.2m 网格
//   布置支撑立柱，裙边（结构板面）沉至 -raise-0.02m。因此调大离地高度不会
//   抬高任何设备，只会加深地板下的敷设空间（与 bridgeConfig 的地板下桥架
//   y∈[-0.60,-0.05] 口径一致）。
// ===========================================================================

export const FLOOR_STORAGE_KEY = 'dc3d.floorConfig.v1';

// 默认值（与既有场景一致：600×600 砖、板厚 40mm、砖缝 8mm；
// 离地高度 0.35m 取机房架空地板常见值，地板下可敷设弱电/强电桥架）
export const FLOOR_DEFAULTS = {
  tileW: 0.60,
  tileD: 0.60,
  tileH: 0.04,
  gap: 0.008,
  raise: 0.35,
  surface: 'light',
};

// 参数取值范围（m）
export const FLOOR_LIMITS = {
  tileW: { min: 0.30, max: 1.20 },
  tileD: { min: 0.30, max: 1.20 },
  tileH: { min: 0.02, max: 0.10 },
  gap:   { min: 0, max: 0.05 },
  raise: { min: 0.10, max: 0.80 },
};

// 贴面预设（防静电贴面基色；room.js 的 makeAntiStaticFloorTexture 取此基色）
export const FLOOR_SURFACES = [
  { key: 'light', label: '浅灰', color: '#8d949a' },
  { key: 'dark',  label: '深灰', color: '#5b636b' },
  { key: 'blue',  label: '蓝灰', color: '#6f8296' },
];

// 地板下桥架敷设所需的最小架空层深度（工程经验值，仅提示不拦截）
export const FLOOR_MIN_PLENUM_HINT = 0.25;

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const num = (v, dflt) => (Number.isFinite(Number(v)) ? Number(v) : dflt);

export function cloneFloorDefaults() {
  return JSON.parse(JSON.stringify(FLOOR_DEFAULTS));
}

/** 贴面 key → 基色；未知 key 回落浅灰 */
export function surfaceColor(key) {
  const s = FLOOR_SURFACES.find((x) => x.key === key);
  return s ? s.color : FLOOR_SURFACES[0].color;
}

/** 深合并：以默认值为骨架，保留用户值；结构不符回落默认 */
export function mergeFloorConfig(raw) {
  const base = cloneFloorDefaults();
  if (!raw || typeof raw !== 'object') return base;
  for (const k of ['tileW', 'tileD', 'tileH', 'gap', 'raise']) {
    base[k] = num(raw[k], base[k]);
  }
  if (typeof raw.surface === 'string' && FLOOR_SURFACES.some((s) => s.key === raw.surface)) {
    base.surface = raw.surface;
  }
  return base;
}

// ---------------------------------------------------------------------------
// 持久化（localStorage；浏览器与 Electron file:// 下均可用，损坏时回落默认）
// ---------------------------------------------------------------------------
export function loadFloorConfig() {
  try {
    const txt = localStorage.getItem(FLOOR_STORAGE_KEY);
    if (!txt) return cloneFloorDefaults();
    return mergeFloorConfig(JSON.parse(txt));
  } catch (_) {
    return cloneFloorDefaults();
  }
}

export function saveFloorConfig(cfg) {
  try {
    localStorage.setItem(FLOOR_STORAGE_KEY, JSON.stringify(cfg));
    return true;
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 实时预览态（floorPanel 编辑稿未经保存时，room.js / bridgeSystem.js 读它）
// ---------------------------------------------------------------------------
let _live = null;

/** 设置/清除实时预览稿（null = 回到已保存配置） */
export function setLiveFloorConfig(cfg) {
  _live = cfg && typeof cfg === 'object' ? mergeFloorConfig(cfg) : null;
}

/** 当前生效配置：预览稿优先，否则已保存配置 */
export function getLiveFloorConfig() {
  return _live || loadFloorConfig();
}

/** 当前架空层深度（m）——桥架地板下敷设立杆高度/校验区间用它 */
export function getFloorPlenum() {
  return getLiveFloorConfig().raise;
}

// ---------------------------------------------------------------------------
// 校验：返回 [{ level:'error'|'warn', field, msg }]；error 才阻止保存
// ---------------------------------------------------------------------------
export function validateFloorConfig(rawCfg) {
  const items = [];
  const c = mergeFloorConfig(rawCfg);
  const L = FLOOR_LIMITS;
  const range = (field, name) => {
    const v = num(c[field], NaN);
    if (!(v >= L[field].min && v <= L[field].max)) {
      items.push({ level: 'error', field, msg: `${name}须在 ${L[field].min}~${L[field].max} m（当前 ${c[field]}）` });
    }
  };
  range('tileW', '地板砖长度');
  range('tileD', '地板砖宽度');
  range('tileH', '地板板厚');
  range('gap', '砖缝宽度');
  range('raise', '离地高度');
  // 砖缝不得吞掉整块砖（缝宽 < 砖宽 - 5cm）
  const minTile = Math.min(num(c.tileW, 0.6), num(c.tileD, 0.6));
  if (num(c.gap, 0) >= minTile - 0.05) {
    items.push({ level: 'error', field: 'gap', msg: `砖缝宽度须小于 ${minTile - 0.05} m（当前砖宽下限 ${minTile.toFixed(2)} m）` });
  }
  // 离地高度必须大于板厚，否则不构成架空层
  if (num(c.raise, 0.35) < num(c.tileH, 0.04) + 0.02) {
    items.push({ level: 'error', field: 'raise', msg: `离地高度须大于板厚 + 2cm（当前 ${c.raise} m，板厚 ${c.tileH} m）` });
  }
  // 浅架空层提示（不影响保存）
  if (num(c.raise, 0.35) < FLOOR_MIN_PLENUM_HINT) {
    items.push({ level: 'warn', field: 'raise', msg: `架空层仅 ${c.raise} m，地板下敷设桥架空间受限（建议 ≥ ${FLOOR_MIN_PLENUM_HINT} m）` });
  }
  return items;
}

// ---------------------------------------------------------------------------
// 钳制（输入即时生效）：标量参数压回合法范围，结构性问题交 validate 报告
// ---------------------------------------------------------------------------
export function sanitizeFloorConfig(cfg) {
  const c = mergeFloorConfig(cfg);
  const L = FLOOR_LIMITS;
  c.tileW = clamp(num(c.tileW, FLOOR_DEFAULTS.tileW), L.tileW.min, L.tileW.max);
  c.tileD = clamp(num(c.tileD, FLOOR_DEFAULTS.tileD), L.tileD.min, L.tileD.max);
  c.tileH = clamp(num(c.tileH, FLOOR_DEFAULTS.tileH), L.tileH.min, L.tileH.max);
  c.gap = clamp(num(c.gap, FLOOR_DEFAULTS.gap), L.gap.min, L.gap.max);
  c.raise = clamp(num(c.raise, FLOOR_DEFAULTS.raise), L.raise.min, L.raise.max);
  // 保证「离地高度 > 板厚 + 2cm」：raise 被钳上限时优先保 raise，抬板厚上限
  if (c.raise < c.tileH + 0.02) {
    c.tileH = clamp(c.raise - 0.02, L.tileH.min, L.tileH.max);
  }
  return c;
}

// ---------------------------------------------------------------------------
// 导出 / 导入（随工程走的高级用法）
// ---------------------------------------------------------------------------
export function exportFloorConfig(cfg) {
  return JSON.stringify(cfg, null, 2);
}

/** 解析导入文本；返回 { ok, cfg, error } */
export function importFloorConfig(text) {
  let raw;
  try { raw = JSON.parse(text); } catch (e) { return { ok: false, error: 'JSON 解析失败：' + e.message }; }
  if (!raw || typeof raw !== 'object' || raw.tileW === undefined) {
    return { ok: false, error: '文件结构不符：缺少地板参数（tileW 等字段）' };
  }
  return { ok: true, cfg: mergeFloorConfig(raw) };
}
