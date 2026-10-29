/**
 * 设备 3D 模型真实外形规格（场景单位：1 单位 = 10mm，与项目 SCALE_3D = 0.1 一致）
 *
 * 数据来源（均为厂商公开规格，可公开核实）：
 *  · 交换机 1U：H3C S6116-48X 约 440×44×400 mm（机箱本体深，H3C 安装指南）
 *  · 防火墙 1U：Fortinet FortiGate 200F 约 432×44×342 mm（Fortinet 数据手册）
 *  · 核心路由器 1U：Cisco ISR 4431 约 438×44×507 mm（Rapidwarehouse 规格）
 *  · 计算/存储服务器 2U：Dell PowerEdge R7625 约 482×86.8×721.6 mm（Dell 规格）
 *  · 配线架 1U：TTI 1U ODF 约 482×240×44 mm、HNK 1U 光纤盘 约 482×212×44 mm
 *  · PDU 1U（横装）：APC AP9563 约 447×44×57 mm、StarTech 约 480×44×99 mm
 *  · KVM 切换器 1U：WebiT 1U 控制台 约 445×44×360 mm
 *  · 负载均衡 1U：F5 BIG-IP 5000 约 432×44×533 mm（F5 平台规格）
 *
 * 说明：w 为含两侧挂耳的总宽（19" 标准机架宽度 482.6mm）；d 为机箱进深；
 *       高度按 U 位数线性推导（1U = 44.45mm）。
 */

// 1U 高度（场景单位）
export const U_UNIT = 4.445

// 19" 标准机架设备总宽（含挂耳，482.6mm）
export const DEVICE_FULL_W = 48.3

// 单侧挂耳宽度（场景单位，约 12mm）
export const EAR_W = 1.2

/**
 * 各设备类型真实规格：w = 总宽（含耳），d = 进深
 * 未列出的类型按 server 兜底（与 2D 渲染器 default 分支一致）
 */
export const DEVICE_SPECS = {
  switch:        { w: DEVICE_FULL_W, d: 40 },   // ≈400mm 深（接入/核心交换机）
  firewall:      { w: DEVICE_FULL_W, d: 34 },   // ≈340mm 深（FortiGate 200F）
  router:        { w: DEVICE_FULL_W, d: 45 },   // ≈450mm 深（Cisco ISR 4431）
  server:        { w: DEVICE_FULL_W, d: 70 },   // ≈700mm 深（Dell R7625）
  storage:       { w: DEVICE_FULL_W, d: 70 },   // ≈700mm 深（存储服务器）
  patch_panel:   { w: DEVICE_FULL_W, d: 22 },   // ≈220mm 深（铜配线架）
  fiber_tray:    { w: DEVICE_FULL_W, d: 23 },   // ≈230mm 深（1U 光纤配线架/ODF）
  odf:           { w: DEVICE_FULL_W, d: 23 },   // ≈230mm 深（ODF）
  pdu:           { w: DEVICE_FULL_W, d: 8 },    // ≈80mm 深（横装 PDU）
  kvm:           { w: DEVICE_FULL_W, d: 36 },   // ≈360mm 深（KVM 控制台）
  cable_manager: { w: DEVICE_FULL_W, d: 20 },   // ≈200mm 深（理线架）
}

/** 取设备规格（未知类型按 server 兜底） */
export function getDeviceSpec(device) {
  const type = String(device?.device_type || device?.type || '').toLowerCase()
  const u = Number(device?.uSize || device?.u_height || 1) || 1
  const spec = DEVICE_SPECS[type] || DEVICE_SPECS.server
  return { kind: DEVICE_SPECS[type] ? type : 'server', w: spec.w, d: spec.d, u }
}

/** 设备高度（场景单位）：1U = 4.445 */
export function deviceHeightUnits(u) {
  return U_UNIT * (Number(u) || 1)
}
