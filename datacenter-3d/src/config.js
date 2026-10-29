import * as THREE from 'three';
import { TYPE_COLOR } from './themeTokens.js';

// 类型配色单一真源在 themeTokens.js 的 TYPE_COLOR（十六进制串）。
// 整改（设计 P0-A）：原实现在这里硬编码 16 组 0xRRGGBB，从不引用 token，
// 导致「去撞色」的整改只落在文档里 —— 配电柜仍是告警橙、灭火器仍是告警红，
// 而 seedLayout.js:169 在机房正中放了一台 status=normal 的配电柜，
// 用户看到的就是「一台正常设备呈告警色」。
// 现统一从 token 取色，改色只需改 themeTokens.js 一处。
const hex = (s) => parseInt(s.slice(1), 16);

// ---------------------------------------------------------------------------
// 机房尺寸（阶段1「平面绘制」可编辑；导出的是同一可变对象引用）
// ---------------------------------------------------------------------------
// 默认尺寸按常见中小型机房取值（原 46×34m 过大：4 排机柜阵列仅占其 26%，观感空旷）
export const DEFAULT_ROOM_DIMS = {
  width: 26,  // X 方向（m）
  depth: 22,  // Z 方向（m）
  height: 8,  // Y 方向（m），同步到四面墙
};

// 导出的是同一可变对象引用（墙面/机柜逻辑均直接读写它）
export const roomDims = { ...DEFAULT_ROOM_DIMS };

/**
 * 把模块级单例 roomDims 复位为默认值。
 * roomDims 是模块级可变对象，上一次挂载留下的尺寸会残留到下一次（无存档时尤为明显），
 * 故每次初始化前先复位，再套用存档值。
 */
export function resetRoomDims() {
  Object.assign(roomDims, DEFAULT_ROOM_DIMS);
}

export const ROOM_MIN = 6;
export const ROOM_MAX = 90;

// 单台精密空调典型制冷量（kW，CRAC 房间级工程惯用量级，供容量核算使用）
export const AC_UNIT_COOLING_KW = 100;

// 每类设备的占地尺寸（宽=X，高=Y，深=Z）与基础配色
// server / fire 使用精细模型（rackModel.js）；ac / cylinder 使用精细模型
// （equipmentModel.js：立式精密空调 / 柜式七氟丙烷灭火装置）；
// 其余类型仍为实例化箱体（racks.js 的 InstancedMesh 分支）
// 类型扩展依据《问题清单与整改验收准则》：G-PWR-06 列头柜、G-CAB-01 ODF/配线架/布线柜、
// G-SEC-01 摄像机、G-FIRE-02 感烟/感温探测器
export const RACK = {
  server: { w: 0.6, h: 2.0, d: 1.0, color: hex(TYPE_COLOR.server) }, // 服务器机柜（19" 42U 精细模型）
  // 精密空调：改用 equipmentModel.js 的 buildACModel() 精细模型（美的立式机房空调）。
  // 尺寸为 Box3 实测包围盒（含前立面进风百叶与液晶屏的外凸），故略大于
  // 机柜本体的名义 600×600mm：宽 0.608 / 高 1.803 / 深 0.629（百叶外凸所致）。
  ac:     { w: 0.61, h: 1.80, d: 0.63, color: hex(TYPE_COLOR.ac) }, // 机房精密空调（立式 600×1800×600）
  // 低压配电柜：改用 equipmentModel.js 的 buildPowerCabinetModel() 精细模型
  // （单柜 800×600×2000mm 列头柜/进线柜风格）。尺寸为 Box3 实测包围盒
  // （_verify_ups_power_swap.mjs 实测 0.800×2.0495×0.657）：柜体名义
  // 800×600×2000，前门把手/锁芯外凸使深 0.657，顶部进出线接口与吊环使高≈2.05。
  power:  { w: 0.80, h: 2.05, d: 0.66, color: hex(TYPE_COLOR.power) }, // 低压配电柜
  // 在线式 UPS 电源柜：改用 equipmentModel.js 的 buildUPSModel() 精细模型
  // （塔式 600×850×1720mm）。尺寸为 Box3 实测包围盒
  // （_verify_ups_power_swap.mjs 实测 0.624×1.7683×0.9353）：顶盖 0.624×0.868，
  // 前门把手外凸使深 0.935，顶置排风扇使高≈1.77。
  ups:    { w: 0.62, h: 1.77, d: 0.94, color: hex(TYPE_COLOR.ups) }, // UPS 电源
  fire:   { w: 0.3, h: 0.9, d: 0.3, color: hex(TYPE_COLOR.fire) }, // 机房灭火器（精细模型，辅助消防）
  // —— 整改扩展类型 ——
  rpp:    { w: 0.8, h: 2.2, d: 1.0, color: hex(TYPE_COLOR.rpp) }, // 列头柜 RPP（G-PWR-06）
  odf:    { w: 0.6, h: 2.0, d: 0.8, color: hex(TYPE_COLOR.odf) }, // 光纤配线架 ODF（G-CAB-01）
  patch:  { w: 0.6, h: 2.0, d: 0.8, color: hex(TYPE_COLOR.patch) }, // 铜缆配线架/布线柜（G-CAB-01）
  cam:    { w: 0.28, h: 0.4, d: 0.28, color: hex(TYPE_COLOR.cam) }, // 摄像机（吊装，G-SEC-01）
  smoke:  { w: 0.14, h: 0.1, d: 0.14, color: hex(TYPE_COLOR.smoke) }, // 感烟探测器（G-FIRE-02）
  heat:   { w: 0.14, h: 0.1, d: 0.14, color: hex(TYPE_COLOR.heat) }, // 感温探测器（G-FIRE-02）
  // —— 菜单优化批次二：安防/消防设备补缺（G-SEC-02/05/10、G-FIRE-04） ——
  reader:    { w: 0.16, h: 0.3, d: 0.1, color: hex(TYPE_COLOR.reader) }, // 门禁读卡器（G-SEC-02）
  intrusion: { w: 0.14, h: 0.14, d: 0.08, color: hex(TYPE_COLOR.intrusion) }, // 入侵探测器（G-SEC-05）
  patrol:    { w: 0.12, h: 0.12, d: 0.06, color: hex(TYPE_COLOR.patrol) }, // 电子巡查点（G-SEC-10）
  ctrl:      { w: 0.6, h: 1.2, d: 0.4, color: hex(TYPE_COLOR.ctrl) }, // 灭火控制器（G-FIRE-04）
  // 柜式七氟丙烷灭火装置：改用 equipmentModel.js 的 buildGasFireCabinetModel() 精细模型。
  // 尺寸同为 Box3 实测包围盒：柜体名义 620×420×1890mm，含柜顶喷放管路与喷嘴后
  // 高 1.949m，含柜门把手外凸后深 0.454m。
  cylinder:  { w: 0.64, h: 1.95, d: 0.45, color: hex(TYPE_COLOR.cylinder) }, // 柜式七氟丙烷灭火装置（G-FIRE-04）
};

export const TYPE_LABEL = {
  server: '服务器机柜',
  ac: '空调机组',
  power: '配电柜',
  ups: 'UPS 电源',
  fire: '灭火器',
  rpp: '列头柜(RPP)',
  odf: '光纤配线架(ODF)',
  patch: '配线架/布线柜',
  cam: '摄像机',
  smoke: '感烟探测器',
  heat: '感温探测器',
  reader: '门禁读卡器',
  intrusion: '入侵探测器',
  patrol: '电子巡查点',
  ctrl: '灭火控制器',
  // 类型 key 仍为 cylinder（存档兼容），仅更新显示文案以匹配新模型
  cylinder: '柜式七氟丙烷',
};
export const STATUS_LABEL = {
  normal: '正常',
  warning: '告警',
  fault: '故障',
};

// ---------------------------------------------------------------------------
// 热力色阶：t∈[0,1] → 蓝→青→绿→黄→红
// ---------------------------------------------------------------------------
const HEAT_STOPS = [
  [0.00, [0x1f, 0x6f, 0xeb]],
  [0.35, [0x12, 0xb5, 0xc9]],
  [0.55, [0x3f, 0xae, 0x5a]],
  [0.75, [0xe0, 0xc0, 0x1e]],
  [1.00, [0xff, 0x3b, 0x30]],
];

export function heat(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 0; i < HEAT_STOPS.length - 1; i++) {
    const [a, ca] = HEAT_STOPS[i];
    const [b, cb] = HEAT_STOPS[i + 1];
    if (t >= a && t <= b) {
      const k = (t - a) / (b - a || 1);
      return new THREE.Color(
        (ca[0] + (cb[0] - ca[0]) * k) / 255,
        (ca[1] + (cb[1] - ca[1]) * k) / 255,
        (ca[2] + (cb[2] - ca[2]) * k) / 255,
      );
    }
  }
  return new THREE.Color(1, 0, 0);
}
