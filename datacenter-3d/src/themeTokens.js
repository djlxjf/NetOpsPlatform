// 语义色单一真源（审查 #5a / R-7）。
//
// 3D 网格状态色（racks.js _colorFor）、设备状态 LED（rackModel.js _M）、
// 3D 工具 UI（style.css 的 --ok/--warn/--bad）、监控大屏（DataCenterView.vue）
// 的状态色，全部以本文件为唯一真源，杜绝「同一语义多种色值」的割裂。
//
// 注意：CSS 无法 import JS，故 style.css 与 DataCenterView.vue 中的色值须与本处
// 严格保持一致；改动本文件后务必同步这两处（两处均有注释指回本文件）。
//
// 整改（2026-10-23）：经全量检索，JS 侧实际消费的只有 STATUS_COLOR_NUM
// （rackModel.js / racks.js 引用）。ACCENT / SELECTED / HOVER / TYPE_COLOR
// 与十六进制形式的 STATUS_COLOR 当前无 JS 引用，仅作文档与后续取色基准；
// 其中 ACCENT 原写作 #2BD6FF，与 style.css 的 --accent(#22d3ee) 不一致，
// 而 CSS 侧从未引用 JS，实际不影响渲染——已统一为 CSS 的真实取值 #22d3ee，
// 消除「看起来已统一、实际两套值」的文档性割裂。

// 统一说明（2026-10-23 整改：跨页状态色割裂）
// 这三个状态色此前与「数智机房」2D 面板用的设计令牌（--n-online / --n-warning /
// --n-alert = #34D399 / #F59E0B / #EF4444）是两套值，同屏并排时 3D 机柜与 2D 徽标
// 的绿/橙/红深浅不同。现统一到设计令牌：3D 侧取同组色值（暗场景中亮度足够、色相不变），
// 2D 侧由亮色主题自动切深一档保证对比度。改动必须同步：
//   ① src/styles/design-tokens.css（--n-online / --n-warning / --n-alert）
//   ② 本文件（3D 网格 / 设备 LED）
//   ③ datacenter-3d/src/style.css（--ok / --warn / --bad，已桥接为 var(--n-*)）
export const STATUS_COLOR = {
  normal: '#34D399',
  warning: '#F59E0B',
  fault: '#EF4444',
};

// THREE.Color 需要的数值形式（0xRRGGBB）
export const STATUS_COLOR_NUM = {
  normal: 0x34d399,
  warning: 0xf59e0b,
  fault: 0xef4444,
};

// 强调 / 选中 / 悬停
// （ACCENT 与 style.css --accent 保持一致；见文件头说明）
export const ACCENT = '#22d3ee';
export const SELECTED = '#FFD60A';
export const HOVER = '#FFFFFF';

// 机柜类型色（去撞色：配电柜/灭火器改中性灰，避免被误读为告警）
// 整改（2026-10-23，设计 P0-A）：此前本表只有 5 项，而 config.js 的 RACK 有 16 类，
// 后者各自硬编码十六进制色值且从未引用本表 —— 结果是配电柜 0xe08a1e（告警橙）、
// 灭火器 0xd23b2f（告警红）照旧渲染，而 seedLayout.js:169 恰好在机房正中放了一台
// status=normal 的配电柜，用户看到的就是「一台正常设备呈告警色」。
// 现将全部 16 类补入本表，并由 config.js 改为从本表取色（见 config.js 的 hex()），
// 让「单一真源」真正成立。
// 取色原则（沿用既定方向）：类型色避开三种状态色的色相家族——
//   亮绿 #21D07A / 琥珀 #FFB000 / 红 #FF3B30，
//   只允许蓝、青、紫、灰蓝、中性灰，确保「颜色=状态」的读法不被类型色干扰。
//   原 amber/orange 家族的感烟/感温/灭火控制器/钢瓶一并改为去饱和蓝灰。
export const TYPE_COLOR = {
  server: '#3B7DD8',
  ac: '#4FB0C6',
  power: '#8E8E93',
  ups: '#7C6BD6',
  fire: '#6E6E73',
  // —— 扩展类型（原 config.js 硬编码值，未与状态色冲突的予以保留） ——
  rpp: '#B06FD8',
  odf: '#3FB6AF',
  patch: '#5F8FC9',
  cam: '#9AA7B8',
  // —— 原 amber/orange 家族，去饱和为蓝灰以免被误读为告警 ——
  smoke: '#7C8A99',
  heat: '#6B7787',
  reader: '#8A94A6',
  intrusion: '#98A2B3',
  patrol: '#7FA8A0',
  ctrl: '#8892A0',
  cylinder: '#5F6B7A',
};
