/**
 * 网络拓扑 —— 唯一视觉真源 (Single Source of Visual Truth)
 *
 * 设计约束：
 * 1. 本文件是纯常量 + 纯函数，零依赖（不 import vue / pinia / @vue-flow）。
 *    这保证数据层可以脱离渲染库与框架独立单元测试。
 * 2. 任何拓扑相关的颜色 / 标签 / 层级 / 阈值都必须来源于这里。
 *    组件里不允许再出现硬编码色值，否则视觉一致性无法保证。
 * 3. 三个纯函数（normalizeDeviceType / resolveDeviceStatus / deriveLinkStatus）
 *    是「脏业务数据 → 干净视图模型」的唯一入口。
 */

/** 深冻结：保证常量表在运行时不会被误改 */
function deepFreeze(obj) {
  Object.values(obj).forEach((v) => {
    if (v && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v);
  });
  return Object.freeze(obj);
}

/* ------------------------------------------------------------------ *
 * 设备状态
 * ------------------------------------------------------------------ */

export const STATUS = Object.freeze({
  ONLINE: "online",
  OFFLINE: "offline",
  ALERT: "alert",
  MAINTENANCE: "maintenance",
  UNKNOWN: "unknown",
});

export const STATUS_META = deepFreeze({
  online: { label: "在线", color: "#34d399", bg: "rgba(52,211,153,.14)" },
  offline: { label: "离线", color: "#f87171", bg: "rgba(248,113,113,.14)" },
  alert: { label: "告警", color: "#ef4444", bg: "rgba(239,68,68,.14)" },
  maintenance: { label: "维护", color: "#f59e0b", bg: "rgba(245,158,11,.12)" },
  unknown: { label: "未知", color: "#94a3b8", bg: "rgba(148,163,184,.12)" },
});

/** 图例 / 统计的固定展示顺序（避免 Object.keys 顺序不稳定导致图例跳动） */
export const STATUS_ORDER = Object.freeze([
  STATUS.ONLINE,
  STATUS.ALERT,
  STATUS.OFFLINE,
  STATUS.MAINTENANCE,
  STATUS.UNKNOWN,
]);

/* ------------------------------------------------------------------ *
 * 设备类型
 * ------------------------------------------------------------------ */

/**
 * 归一化后的 10 类设备类型。
 * 这 10 类与 src/views/devices/DevicesView.vue 的 deviceTypes 下拉项完全一致，
 * 即「设备管理页能录入的类型」就是「拓扑能渲染的类型」，不多不少。
 *
 * layer 决定分层布局的纵向层级（0 = 最上层，数字越大越靠下）。
 */
export const DEVICE_TYPE_META = deepFreeze({
  router: { label: "路由器", layer: 1, osi: 3 },
  gateway: { label: "网关", layer: 0, osi: 3 },
  firewall: { label: "防火墙", layer: 2, osi: 3 },
  loadbalancer: { label: "负载均衡", layer: 3, osi: 4 },
  switch: { label: "交换机", layer: 4, osi: 2 },
  wireless: { label: "无线AP", layer: 5, osi: 2 },
  server: { label: "服务器", layer: 5, osi: 7 },
  nvr: { label: "NVR", layer: 6, osi: 7 },
  monitor: { label: "监控设备", layer: 6, osi: 1 },
  other: { label: "其他", layer: 6, osi: 9 },
});

// 设备类型展示顺序：按 OSI 层（osi）从低到高（物理层→应用层），
// 同一 OSI 层内保持原有子顺序；"其他"固定排最后。不强行分七组，按设备实际所属层自然排列。
export const DEVICE_TYPE_ORDER = Object.freeze([
  "monitor",
  "switch",
  "wireless",
  "router",
  "gateway",
  "firewall",
  "loadbalancer",
  "server",
  "nvr",
  "other",
]);

/** 最大层级，布局算法用 */
export const MAX_LAYER = 6;

export const FALLBACK_DEVICE_TYPE = "other";

/* ------------------------------------------------------------------ *
 * 连线
 * ------------------------------------------------------------------ */

export const LINK_STYLE = deepFreeze({
  fiber: { stroke: "#a855f7", width: 2.5 },
  copper: { stroke: "#64748b", width: 1.5 },
  down: { stroke: "#ef4444", width: 1.5, dash: "4 4" },
});

export const LINK_STATUS = Object.freeze({
  UP: "up",
  DEGRADED: "degraded",
  DOWN: "down",
});

export const LINK_STATUS_META = deepFreeze({
  up: { label: "正常", color: "#34d399" },
  degraded: { label: "降级", color: "#f59e0b" },
  down: { label: "中断", color: "#ef4444" },
});

/* ------------------------------------------------------------------ *
 * 性能阈值
 * ------------------------------------------------------------------ */

export const PERF = Object.freeze({
  LIGHT_NODE_THRESHOLD: 800,
  EDGE_ANIMATION_MAX: 300,
  MINIMAP_MAX: 500,
  PATCH_DEBOUNCE: 150,
  VIRTUALIZE_FROM: 200,
});

/** 节点渲染尺寸（布局算法做重叠检测需要，组件应以此为准渲染） */
export const NODE_SIZE = Object.freeze({ width: 168, height: 64 });

/* ================================================================== *
 * 纯函数区
 * ================================================================== */

/**
 * 精确别名表 —— key 一律小写 + trim 后匹配。
 *
 * 这张表不是凭空写的，覆盖了项目里真实出现过的全部类型取值来源：
 *  A. src/views/devices/DevicesView.vue:768  设备管理下拉（10 个规范值）
 *  B. src/views/devicelib/DeviceLibView.vue:474  设备库下拉（多出 ups / storage）
 *  C. src/components/canvas-topology/TopologyPropertyPanel.vue:124
 *     旧画布属性面板（多出 pc / printer / camera / cloud / isp / storage）
 *  D. src/stores/index.js:691 旧 chineseTypeMap 的产物
 *     （laptop / phone / optical / isp / cloud / camera / ups / nvr / storage / pc）
 *  E. src/data/deviceModels.js 的型号目录 key（含 ac = 无线控制器）
 *  F. src/views/config-command/ConfigCommandView.vue:180（wlc = 无线控制器）
 *  G. DevicesView.vue:1611 Excel 导入 —— 该分支存在
 *     `return typeMap[rawType] || rawType || 'other'`，
 *     也就是**任意中文原始串会被原样写进 device.type**，是最大的脏数据来源。
 */
const TYPE_ALIAS = Object.freeze({
  // ---- A. 10 个规范值（恒等） ----
  router: "router",
  gateway: "gateway",
  firewall: "firewall",
  loadbalancer: "loadbalancer",
  switch: "switch",
  wireless: "wireless",
  server: "server",
  nvr: "nvr",
  monitor: "monitor",
  other: "other",

  // ---- B/C/D. 历史英文取值 ----
  storage: "other",
  ups: "other",
  pc: "other",
  laptop: "other",
  phone: "other",
  printer: "other",
  cloud: "other",
  optical: "other",
  device: "other",
  unknown: "other",
  camera: "monitor",
  ipc: "monitor",
  dvr: "nvr",
  dvs: "nvr",
  isp: "gateway",

  // ---- E/F. 无线控制器 ----
  ac: "wireless",
  wlc: "wireless",
  ap: "wireless",
  "access point": "wireless",
  accesspoint: "wireless",

  // ---- 常见英文缩写/变体 ----
  lb: "loadbalancer",
  "load balancer": "loadbalancer",
  "load-balancer": "loadbalancer",
  loadbalance: "loadbalancer",
  gw: "gateway",
  fw: "firewall",
  switches: "switch",
  l2switch: "switch",
  l3switch: "switch",

  // ---- G. 中文原始串（Excel 导入 / 手工录入） ----
  交换机: "switch",
  核心交换机: "switch",
  汇聚交换机: "switch",
  接入交换机: "switch",
  二层交换机: "switch",
  三层交换机: "switch",
  poe交换机: "switch",
  路由器: "router",
  防火墙: "firewall",
  无线ap: "wireless",
  无线: "wireless",
  无线控制器: "wireless",
  无线接入点: "wireless",
  负载均衡: "loadbalancer",
  负载均衡器: "loadbalancer",
  网关: "gateway",
  出口网关: "gateway",
  运营商: "gateway",
  运营商线路: "gateway",
  服务器: "server",
  存储: "other",
  存储设备: "other",
  ups电源: "other",
  光端机: "other",
  台式机: "other",
  笔记本: "other",
  手机: "other",
  打印机: "other",
  监控设备: "monitor",
  摄像头: "monitor",
  网络摄像机: "monitor",
  录像机: "nvr",
  硬盘录像机: "nvr",
  安全准入: "firewall",
  安全隔离: "firewall",
  密码管理: "firewall",
  威胁防御: "firewall",
  网闸: "firewall",
  网御: "firewall",
  其他: "other",
});

/**
 * 模糊规则表 —— 精确表未命中时按顺序试探。
 * 顺序即优先级，越靠前置信度越高。
 *
 * 关键取舍：把 switch / router / firewall(防火墙) 放在 monitor 之前，
 * 这样「监控交换机」按功能归为 switch 而不是 monitor
 * （DevicesView.isNetworkDevice 是先排除监控，与此处不同，但拓扑分层
 *   关心的是转发角色，按功能分层更合理）。
 * 低置信度的安全类关键字（安全/网闸/vpn…）放到最后，避免「安全交换机」被吞掉。
 */
const TYPE_PATTERNS = Object.freeze([
  [/防火墙|firewall/, "firewall"],
  [/交换机|switch/, "switch"],
  [/路由|router/, "router"],
  [/负载均衡|loadbalanc|load[\s-]?balanc/, "loadbalancer"],
  [/网关|gateway/, "gateway"],
  [/录像机|\bnvr\b|\bdvr\b|\bdvs\b/, "nvr"],
  [/摄像|监控|camera|\bipc\b|视频|video|encoder|decoder/, "monitor"],
  [/无线|wireless|\bwlc\b|\bap\b|\bac\b|access[\s-]?point/, "wireless"],
  [/服务器|server|主机|虚拟机|hypervisor/, "server"],
  [/运营商|\bisp\b|专线|宽带|出口/, "gateway"],
  // 低置信度：安全类设备统一并入防火墙层
  [/安全准入|安全隔离|密码管理|威胁防御|网闸|网御|\bvpn\b|上网行为|审计|堡垒/, "firewall"],
]);

/**
 * 把任意脏输入归一化为 10 类规范设备类型之一。
 * @param {*} raw 任意输入：英文、中文、大小写混杂、自定义串、null、数字、对象…
 * @returns {string} DEVICE_TYPE_META 的 key，兜底 'other'
 */
export function normalizeDeviceType(raw) {
  if (raw === null || raw === undefined) return FALLBACK_DEVICE_TYPE;

  const text = typeof raw === "string" ? raw : String(raw);
  const key = text.trim().toLowerCase();
  if (!key) return FALLBACK_DEVICE_TYPE;

  // 1) 精确命中
  if (Object.prototype.hasOwnProperty.call(TYPE_ALIAS, key)) return TYPE_ALIAS[key];

  // 2) 模糊命中（按置信度顺序）
  for (const [pattern, type] of TYPE_PATTERNS) {
    if (pattern.test(key)) return type;
  }

  // 3) 兜底
  return FALLBACK_DEVICE_TYPE;
}

/** 设备状态原始取值 → 5 类规范状态。项目里出现过 'normal'（CabinetsView）等变体。 */
const STATUS_ALIAS = Object.freeze({
  online: STATUS.ONLINE,
  up: STATUS.ONLINE,
  normal: STATUS.ONLINE,
  active: STATUS.ONLINE,
  running: STATUS.ONLINE,
  在线: STATUS.ONLINE,
  正常: STATUS.ONLINE,

  offline: STATUS.OFFLINE,
  down: STATUS.OFFLINE,
  inactive: STATUS.OFFLINE,
  stopped: STATUS.OFFLINE,
  离线: STATUS.OFFLINE,
  下线: STATUS.OFFLINE,

  alert: STATUS.ALERT,
  alarm: STATUS.ALERT,
  critical: STATUS.ALERT,
  error: STATUS.ALERT,
  warning: STATUS.ALERT,
  fault: STATUS.ALERT,
  告警: STATUS.ALERT,
  故障: STATUS.ALERT,

  maintenance: STATUS.MAINTENANCE,
  maintain: STATUS.MAINTENANCE,
  维护: STATUS.MAINTENANCE,
  检修: STATUS.MAINTENANCE,
  停机维护: STATUS.MAINTENANCE,
});

function normalizeStatusToken(raw) {
  if (raw === true) return STATUS.ONLINE;
  if (raw === false) return STATUS.OFFLINE;
  if (raw === null || raw === undefined) return STATUS.UNKNOWN;
  const key = String(raw).trim().toLowerCase();
  if (!key) return STATUS.UNKNOWN;
  return STATUS_ALIAS[key] || STATUS.UNKNOWN;
}

/**
 * 计算设备在拓扑上应展示的状态。
 * 优先级：维护 > 告警 > 离线 > 在线 > 未知
 *
 * @param {object} device 设备对象（来自 useDeviceStore().devices）
 * @param {Set<string>} activeAlertDeviceIds 当前有效告警覆盖的 deviceId 集合
 * @returns {string} STATUS 之一
 */
export function resolveDeviceStatus(device, activeAlertDeviceIds) {
  if (!device) return STATUS.UNKNOWN;

  const token = normalizeStatusToken(device.status);
  if (token === STATUS.MAINTENANCE) return STATUS.MAINTENANCE;

  const hasAlert =
    activeAlertDeviceIds &&
    typeof activeAlertDeviceIds.has === "function" &&
    activeAlertDeviceIds.has(device.id);
  if (token === STATUS.ALERT || hasAlert) return STATUS.ALERT;

  if (token === STATUS.OFFLINE) return STATUS.OFFLINE;
  if (token === STATUS.ONLINE) return STATUS.ONLINE;
  return STATUS.UNKNOWN;
}

/**
 * 由两端设备状态推导链路状态。
 * 任一端 offline → down；任一端非 online → degraded；否则 up。
 */
export function deriveLinkStatus(statusA, statusB) {
  if (statusA === STATUS.OFFLINE || statusB === STATUS.OFFLINE) return LINK_STATUS.DOWN;
  if (statusA !== STATUS.ONLINE || statusB !== STATUS.ONLINE) return LINK_STATUS.DEGRADED;
  return LINK_STATUS.UP;
}

/* ------------------------------------------------------------------ *
 * 便捷查询（组件渲染直接用，避免各处再写兜底逻辑）
 * ------------------------------------------------------------------ */

export function getStatusMeta(status) {
  return STATUS_META[status] || STATUS_META[STATUS.UNKNOWN];
}

export function getDeviceTypeMeta(type) {
  return DEVICE_TYPE_META[type] || DEVICE_TYPE_META[FALLBACK_DEVICE_TYPE];
}

export function getDeviceTypeLayer(type) {
  return getDeviceTypeMeta(type).layer;
}

/**
 * 连线样式：链路中断优先用 down 样式，否则按介质区分光纤/铜缆。
 * @param {boolean} isOptical
 * @param {string} linkStatus LINK_STATUS 之一
 */
export function resolveLinkStyle(isOptical, linkStatus) {
  if (linkStatus === LINK_STATUS.DOWN) return LINK_STYLE.down;
  return isOptical ? LINK_STYLE.fiber : LINK_STYLE.copper;
}
