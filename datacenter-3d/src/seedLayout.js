import { RACK } from './config.js';

// ===========================================================================
// 默认机房生成器（从零设计的“完整 3D 机房模型”数据层）
// 行业规范：标准 42U 机柜（0.6×1.0×2.0m），成排布置，前对前=冷通道 / 背对背=热通道；
// 机柜间距 0.72m（0.6 宽 + 0.12 间隙），行间距含冷热通道（约 2.4m）。
// 每机柜携带 devices 设备清单（U 位、类别、状态），与 rackModel.js 内部设备格式一致。
// ===========================================================================

/**
 * 默认机房内容版本号。
 * 用途：存档中记录生成该内容的 seedLayout 版本。当本常量提升而存档版本落后时，
 * 说明旧存档是「空机房 / 旧版内容」，应按新规则重建，避免出现
 * 「代码已更新但用户界面毫无变化」的情况。
 * 规则：仅当存档 racks 为空（用户从未摆放设备）时才自动重建，
 *       以免覆盖用户已有的真实布局。
 *
 * 变更历史：
 *   2 → 3：端部基础设施改版。空调由「2 台 1.4m 宽占位方块」改为「4 台 0.6m 宽
 *          立式精密空调精细模型」沿端墙均匀排布；并新增 2 台柜式七氟丙烷灭火
 *          装置（对侧端墙）。旧版存档的 2 台空调仍保留在 -X 端部原坐标，
 *          不强行迁移，故必须提版本以触发空机房的重建。
 *   3 → 4：整改 F5（冷热通道朝向）。两条外侧排的 rotationY 符号写反（面朝房间
 *          中心），修正为面朝房间外，形成「背对背热通道 + 前对前冷通道」的
 *          标准组织；内侧排朝向不变。旧存档机柜坐标不迁移，提版本触发空机房重建。
 */
export const SEED_CONTENT_VERSION = 4;

// 设备模板（字段与 rackModel.js 的 DEVICES 对齐：u=起始U、h=U高、st=状态、ports、d=深mm）
const DEV_TPL = {
  switch:  { h: 1, st: 'online',   ports: 16, d: 40 },
  patch:   { h: 1, st: 'neutral',  ports: 16, d: 23 },
  server:  { h: 2, st: 'online',   ports: 4,  d: 70 },
  storage: { h: 2, st: 'online',   ports: 4,  d: 70 },
  router:  { h: 1, st: 'warning',  ports: 6,  d: 45 },
  firewall:{ h: 1, st: 'alert',    ports: 8,  d: 34 },
  pdu:     { h: 1, st: 'online',   ports: 6,  d: 10 },
  lb:      { h: 1, st: 'online',   ports: 8,  d: 53 },
  kvm:     { h: 1, st: 'online',   ports: 4,  d: 36 },
};

const NAME = {
  switch: '接入交换机', patch: '光纤配线架', server: '计算服务器', storage: '存储服务器',
  router: '核心路由器', firewall: '边界防火墙', pdu: 'PDU 电源', lb: '负载均衡', kvm: 'KVM 切换器',
};

// 简单可复现随机（seed 固定 → 同一机房布局稳定）
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 为单台机柜生成内部设备清单（自底向上填充，底部留 2U 走线，顶部留 1U）
// 真实分布：以机柜级状态为主导（正常为主，少量告警/故障），仅 1~2 台设备承载异常，
// 避免“单台离线即整柜故障”导致监控大屏一片红的不真实观感。
export function genCabinetDevices(rng, opts = {}) {
  // 机柜级状态：未显式指定时按真实分布抽样（正常为主，少量告警/故障）
  let cabinetStatus = opts.cabinetStatus;
  if (!cabinetStatus) {
    const r = rng();
    cabinetStatus = r < 0.78 ? 'normal' : (r < 0.94 ? 'warning' : 'fault');
  }
  // 异常设备数量与类型（仅在告警/故障机柜出现，且限定 1~2 台）
  let anomalyLeft = 0, anomalyKind = null;
  if (cabinetStatus === 'warning') { anomalyLeft = rng() < 0.5 ? 1 : 2; anomalyKind = 'warning'; }
  else if (cabinetStatus === 'fault') { anomalyLeft = rng() < 0.4 ? 1 : 2; anomalyKind = (rng() < 0.5 ? 'offline' : 'alert'); }

  const devices = [];
  let u = 3;                       // 从 U3 起（底部 U1-2 留给 PDU/走线）
  const top = 41;                  // 顶部 U42 留空
  while (u <= top - 1) {
    // 以较高概率放服务器/交换机，少量基础设施
    const roll = rng();
    let type;
    if (roll < 0.42) type = 'server';
    else if (roll < 0.58) type = 'switch';
    else if (roll < 0.68) type = 'patch';
    else if (roll < 0.78) type = 'storage';
    else if (roll < 0.85) type = 'router';
    else if (roll < 0.90) type = 'firewall';
    else if (roll < 0.95) type = 'lb';
    else type = 'kvm';

    const tpl = DEV_TPL[type];
    if (u + tpl.h - 1 > top) break;

    // 状态赋值：保证与机柜级状态一致（normal 机柜压平异常；warning/fault 仅异常设备承载）
    let st;
    if (cabinetStatus === 'normal') {
      st = type === 'patch' ? 'neutral' : 'online';
    } else if (anomalyLeft > 0 && type !== 'patch') {
      st = anomalyKind; anomalyLeft--;
    } else {
      st = 'online';
    }
    if (type === 'patch' && st === 'online') st = 'neutral'; // 配线架恒为中性，不触发告警着色

    devices.push({
      n: NAME[type],
      u,
      h: tpl.h,
      st,
      ports: tpl.ports,
      d: tpl.d,
    });
    u += tpl.h + 1;                // 设备之间留 1U 间隙（盲板位）
  }
  return devices;
}

// 由机柜内部设备推导机柜级状态（供着色与告警统计）
export function deriveCabinetStatus(devices) {
  let hasFault = false, hasWarn = false;
  for (const d of devices) {
    if (d.st === 'alert' || d.st === 'offline') hasFault = true;
    else if (d.st === 'warning') hasWarn = true;
  }
  if (hasFault) return 'fault';
  if (hasWarn) return 'warning';
  return 'normal';
}

// 生成整座机房：rows 排机柜（含冷热通道），ends 处放置空调/配电/UPS
export function seedDefaultDataCenter(dims, opts = {}) {
  const rng = mulberry32(opts.seed ?? 42);
  // 布局自适应房间尺寸：排数按可用面宽推导（每排构成一组冷/热通道），
  // 列数按可用进深推导，使机柜阵列既填满房间又留出端部基础设施与检修通道。
  // （旧版固定 4 排×14 列，在 46×34m 默认房间里阵列仅占中央一小块，视觉上空旷且设备密集难辨）
  const gap = 0.72;                    // 同排机柜沿 Z 间距（0.6 宽 + 0.12 间隙）
  const rowGap = 2.4;                  // 排间距（含冷热通道）
  const cabinetD = RACK.server.d;
  // 每排可用进深：扣除两侧各 3m 检修通道
  const usableDepth = Math.max(6, dims.depth - 6);
  const cols = opts.cols ?? Math.max(4, Math.min(28, Math.floor(usableDepth / gap)));
  // 排数：偶数排以构成「背对背热通道 + 外侧冷通道」的标准组织；按面宽推导并夹在 4~6 排
  // （上限 6 而非 8：8 排时总机柜达 200+ 台，精细模型 draw call 激增、帧率明显下降）
  const usableWidth = Math.max(6, dims.width - 6);
  const rows = opts.rows ?? Math.max(4, Math.min(6, 2 * Math.round(usableWidth / rowGap / 2)));
  const aisle = 2.6;                   // 端部横向通道
  const usedDepth = (cols - 1) * gap;

  const racks = [];
  let uid = 0;
  const nextId = () => `RK${String(++uid).padStart(3, '0')}`;

  const z0 = -((cols - 1) * gap) / 2;
  const x0 = -((rows - 1) * rowGap) / 2;
  for (let r = 0; r < rows; r++) {
    const x = x0 + r * rowGap;
    // 朝向（整改 F5）：按本文件自述口径「前对前=冷通道 / 背对背=热通道」，
    // 标准组织为「相邻两排背对背构成热通道，两对之间前对前构成冷通道，
    // 最外侧两排面朝房间外、外侧再过道即冷通道」。
    // 原代码把两条外侧排的朝向写反（r0 面朝 +X、末排面朝 -X，都朝向房间
    // 中心），导致 6 排只有 2 条冷通道、外侧两条变成前-背混合通道，
    // 与注释「外侧排朝向外侧冷通道」相反。此处仅翻转两排外侧排的符号：
    // r0 位于 -X 端应面朝 -X（rotationY=-π/2），末排位于 +X 端应面朝 +X（+π/2）；
    // 内侧排的交错朝向（奇数排 +π/2、偶数排 -π/2）本就正确，保持不变。
    const facesOut = (r === 0 || r === rows - 1);
    const rotationY = facesOut
      ? (r === 0 ? -Math.PI / 2 : Math.PI / 2)   // 外侧排朝房间外（端部冷通道）
      : (r % 2 === 1 ? Math.PI / 2 : -Math.PI / 2); // 内侧排背对背（热通道）
    for (let c = 0; c < cols; c++) {
      const z = z0 + c * gap;
      const devices = genCabinetDevices(rng);
      const status = deriveCabinetStatus(devices);
      racks.push({
        id: nextId(), type: 'server', x, z, rotationY,
        temp: 21 + Math.floor(rng() * 12),          // 21~33 ℃
        density: 40 + Math.floor(rng() * 50),        // 负载 40~90%
        status, devices,
      });
    }
  }

  // 端部基础设施：精密空调（4 台）/ 柜式七氟丙烷（2 台）/ 配电柜（1）/ UPS（1）
  // 置于阵列端部通道之外，不占用冷/热通道。
  //
  // 空调：新模型只有 0.61m 宽（原占位方块 1.4m），若仍沿用「2 台贴 Z 两端」的旧
  // 摆法，22m 长的端墙会留出大片空白。改为沿 -X 端墙均匀排布 4 台（Z 向间距
  // 4.8m ≥ 1.2m 检修间距要求），rotationY = +π/2 使正面（+Z）转向 +X 面向房间内部。
  //
  // 配电柜 / UPS 仍留在 -X 端部 Z 中部，与空调错开 Z 位置，互不重叠
  // （判据同 racks.js:_halfExtents，两柜 |dx| < hx_a+hx_b-0.05 且 |dz| < hz_a+hz_b-0.05 才重叠）。
  const endX = x0 - rowGap * 0.9 - aisle;
  const infra = [
    { type: 'ac', x: endX, z: -7.2, rotationY: Math.PI / 2 },
    { type: 'ac', x: endX, z: -2.4, rotationY: Math.PI / 2 },
    { type: 'ac', x: endX, z: 2.4, rotationY: Math.PI / 2 },
    { type: 'ac', x: endX, z: 7.2, rotationY: Math.PI / 2 },
    { type: 'power', x: endX, z: 0, rotationY: 0 },
    { type: 'ups', x: endX, z: z0 * 0.5, rotationY: 0 },
    // 柜式七氟丙烷：布置在对侧（+X）端墙，正面（+Z）转 -X 面向房间内部。
    // 气体灭火装置按防护区两端对称布置是工程惯例，也与空调分列房间两侧，
    // 避免端部设备过度集中。
    { type: 'cylinder', x: -endX, z: -3.0, rotationY: -Math.PI / 2 },
    { type: 'cylinder', x: -endX, z: 3.0, rotationY: -Math.PI / 2 },
  ];
  for (const it of infra) {
    racks.push({
      id: nextId(), type: it.type, x: it.x, z: it.z, rotationY: it.rotationY,
      temp: 19 + Math.floor(rng() * 4), density: 30 + Math.floor(rng() * 20),
      status: 'normal', devices: null,
    });
  }

  return racks;
}
