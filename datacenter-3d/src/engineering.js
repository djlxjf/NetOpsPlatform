// 工程配置数据模型 + 统一容量核算引擎 + 跨域校验器
// 依据《3D 机房「创建机房」菜单 · 问题清单与整改验收准则》（2026-10-22）：
//  - G-PWR-01~06/13、G-HVAC-01/02/04/06/08/12、G-FIRE-01/02/05/06/07/10、G-SEC-01~04、G-CAB-01~04
//  - 跨域口径：审查报告 5.6 容量对照表（工程惯用值，正式数值须由资质单位按规范正文核定）
// 免责：本模块所有量化取值仅为软件内量级校验，不构成设计依据。
import { AC_UNIT_COOLING_KW } from './config.js';
// 领域纯函数层（整改 P1-4-J）：容量/进风温度/电池室/合规清单等纯函数已抽取至
// ./domain/engineeringDomain.js 作为唯一真相源。此处仅做 import + re-export，
// 不再保留重复定义，避免「规则散落在 3D 渲染层」的维护性问题。
import { computeCapacity, rackInletTemp, batteryRoomIssue, COMPLIANCE_RULES, complianceStatus } from './domain/engineeringDomain.js';
export { computeCapacity, rackInletTemp, batteryRoomIssue, COMPLIANCE_RULES, complianceStatus };

// 机房等级（GB 50174-2017 分级章）：A 重大影响 / B 较大影响 / C 其余
export const TIERS = [
  { v: 'A', label: 'A 级（运行中断将造成重大影响）' },
  { v: 'B', label: 'B 级（运行中断将造成较大影响）' },
  { v: 'C', label: 'C 级（其余情况）' },
]

// 气流组织选型（G-HVAC-06）：适用功率密度区间 kW/柜（量级参考）
export const AIR_TYPES = [
  { v: 'CRAC', label: '房间级风冷直膨（CRAC）', dMin: 2, dMax: 8 },
  { v: 'CRAH', label: '冷冻水房间级（CRAH）', dMin: 5, dMax: 15 },
  { v: 'inline', label: '行级/列间精密空调', dMin: 8, dMax: 25 },
  { v: 'rear-door', label: '背板热管/液冷', dMin: 20, dMax: 60 },
]

// UPS 冗余方式（G-PWR-04）
export const UPS_REDUNDANCY = [
  { v: '2N', label: '2N 双总线' },
  { v: 'N+1', label: 'N+1 模块冗余' },
  { v: 'DR', label: 'DR（双路由）' },
  { v: 'N', label: 'N（无冗余）' },
]

// 气体灭火剂选型（G-FIRE-01，GB 50370）
export const FIRE_AGENTS = [
  { v: 'IG541', label: 'IG541 混合气体' },
  { v: 'HFC227ea', label: '七氟丙烷（HFC-227ea）' },
  { v: 'FK5112', label: '全氟己酮（FK-5-1-12）' },
  { v: 'mist', label: '细水雾' },
]

// 供电电源形式（G-PWR-07，GB 50052）
export const LOAD_FORMS = [
  { v: 'dual', label: '双重电源（两路市电）' },
  { v: 'two-loop', label: '两回路供电' },
  { v: 'single', label: '单电源供电' },
]

// 冷源类型（G-HVAC-07）
export const COLD_SOURCES = [
  { v: 'air-cooled', label: '风冷直膨' },
  { v: 'chilled-water', label: '冷水机组 + 冷却塔' },
  { v: 'free-cooling', label: '氟泵/自然冷源' },
]

export const BATTERY_TYPES = [
  { v: 'lead-acid', label: '铅酸蓄电池' },
  { v: 'lithium', label: '锂离子电池（热失控专项）' },
]

/** 默认工程配置（首次运行 / 无存档时的初始值） */
export function engDefaults() {
  return {
    tier: '',            // 机房等级 A/B/C（G-PWR-01，未选禁止进入设备摆放阶段）
    tierReason: '',      // 定级理由（依据运行中断后果）
    density: 5,          // 单机柜平均功率密度 kW/柜（唯一输入锚点 d，G-PWR-02）
    // —— 供配电 ——
    ups: { capacity: 0, redundancy: 'N+1', backupMin: 15, battery: 'lead-acid', bypass: false },
    generator: { enabled: false, capacity: 0, fuelHours: 24 },
    grounding: { form: 'TN-S', resistance: 1, spd: 'three-level' },
    loadForm: '',        // 供电电源形式（与等级联动校验，G-PWR-07）
    // —— 空调暖通 ——
    hvac: {
      airType: 'CRAC', coldSource: 'air-cooled',
      redundancy: '',               // N+1 / 2N / N（G-HVAC-02）
      keyCoolingOnUps: true,        // 关键制冷接 UPS 输出母线（G-PWR-04 脚注①）
      setTemp: 24, tempMin: 18, tempMax: 27,      // 机柜进风区温度（G-HVAC-04）
      humidity: 45, rhMin: 40, rhMax: 60,
      dewMin: 5.5, dewMax: 15,                    // 露点窗口
      humidifier: 'none',
    },
    // —— 消防 ——
    fire: { agent: '', reliefArea: 0, vesda: false },
    // —— 安防 ——
    security: { riskLevel: '', recDays: 30, bitrate: 4 },
    // —— 综合布线 ——
    cable: { cat: 'Cat.6A', fiber: 'OM4', linkLen: 60 },
    // 辅助区（电池室/钢瓶间/监控中心/FD/BD/CD 等，G-PWR-11/FIRE-04/SEC-06/CAB-04 的量级登记）
    auxRooms: [],
    compliance: {},
    // 人员巡逻速度（m/s，0.3~2.0）：默认 0.85（原 1.4 过快，低帧率下位移跳格明显，
    // 放慢后行走动画 timeScale 自动匹配步频）。界面可逐步调至最顺滑值。
    patrolSpeed: 0.85,
  }
}

/**
 * 跨域校验器：返回 issues[]（{code, level:'error'|'warn'|'info', msg}）
 * level=error 的条目在阶段④入口处拦截（等级未选）。
 * 注意：computeCapacity 已 re-export 自 ./domain/engineeringDomain.js，本函数直接使用之。
 */
export function validatePlan(eng, racks, walls, dims) {
  const issues = []
  const list = Array.isArray(racks) ? racks : []
  const cap = computeCapacity(eng, list.filter((r) => r.type === 'server').length)
  const h = eng.hvac || {}
  const f = eng.fire || {}
  const s = eng.security || {}

  // —— G-PWR-01 等级 ——
  if (!eng.tier) issues.push({ code: 'G-PWR-01', level: 'error', msg: '未选择机房等级（A/B/C），请先在「工程配置」中定级并填写理由' })

  // —— G-PWR-02 密度录入 ——
  if (!(Number(eng.density) > 0)) issues.push({ code: 'G-PWR-02', level: 'error', msg: '未录入单机柜功率密度（kW/柜）' })
  else if (eng.density > 30) issues.push({ code: 'G-PWR-02', level: 'warn', msg: `功率密度 ${eng.density} kW/柜 超出常规风冷区间，建议复核或选背板/液冷（G-HVAC-06）` })

  // —— G-PWR-03 功率/负荷 ——
  if (cap.P_IT <= 0) issues.push({ code: 'G-PWR-03', level: 'info', msg: '当前无机柜或密度为 0，容量核算暂无输入' })

  // —— G-PWR-04 UPS 容量 ——
  if (cap.P_IT > 0) {
    const upsKVA = Number(eng.ups.capacity) || 0
    if (upsKVA <= 0) issues.push({ code: 'G-PWR-04', level: 'warn', msg: `未配置 UPS 容量；按 IT 有功 ${Math.round(cap.P_IT)} kW 估算需视在约 ${Math.round(cap.upsVA)} kVA（${h.keyCoolingOnUps !== false ? '含关键制冷' : '仅 IT'}口径）` })
    else if (upsKVA < cap.upsVA * 0.95) issues.push({ code: 'G-PWR-04', level: 'error', msg: `UPS 容量 ${upsKVA} kVA < 需求 ${Math.round(cap.upsVA)} kVA（P_IT/0.9×1.2${h.keyCoolingOnUps !== false ? ' 含关键制冷' : ''}），容量不足` })
  }

  // —— G-PWR-05 柴发 ——
  if (eng.generator.enabled && cap.P_IT > 0) {
    const gen = Number(eng.generator.capacity) || 0
    if (gen < cap.genKVA * 0.95) issues.push({ code: 'G-PWR-05', level: 'error', msg: `柴发容量 ${gen} kVA < 建议 ${Math.round(cap.genKVA)} kVA（≈1.55·P_IT）` })
    if (eng.tier === 'A' && (Number(eng.generator.fuelHours) || 0) < 72) issues.push({ code: 'G-PWR-05', level: 'warn', msg: 'A 级机房燃料储备惯用 ≥72h（须核正文）' })
  } else if (!eng.generator.enabled && (eng.tier === 'A')) {
    issues.push({ code: 'G-PWR-05', level: 'warn', msg: 'A 级机房宜设柴油发电机（须核正文）' })
  }

  // —— G-PWR-06 列头柜数量 ——
  const rppCount = list.filter((r) => r.type === 'rpp').length
  if (cap.rppCount > 0 && rppCount < cap.rppCount) {
    issues.push({ code: 'G-PWR-06', level: 'warn', msg: `列头柜(RPP) ${rppCount} 台 < 建议 ${cap.rppCount} 台（约每 25 柜 1 台）` })
  }

  // —— G-PWR-07 电源形式与等级联动 ——
  if (eng.tier === 'A' && eng.loadForm === 'single') issues.push({ code: 'G-PWR-07', level: 'error', msg: 'A 级机房不应为单电源供电（双重/两回路）' })
  if (eng.tier === 'B' && eng.loadForm === 'single') issues.push({ code: 'G-PWR-07', level: 'warn', msg: 'B 级机房宜双重/两回路供电' })

  // —— G-HVAC-01/02/08 制冷量与冗余 ——
  const acUnits = list.filter((r) => r.type === 'ac')
  const acTotal = acUnits.reduce((sum, r) => sum + (Number(r.coolingKW) || AC_UNIT_COOLING_KW), 0)
  if (cap.cooling > 0 && acTotal < cap.cooling) {
    issues.push({ code: 'G-HVAC-01', level: 'error', msg: `已摆放制冷量合计 ${Math.round(acTotal)} kW < 需求 ${Math.round(cap.cooling)} kW（≈1.1·P_IT），制冷不足` })
  }
  if (h.redundancy) {
    const unitKW = acUnits.length ? Math.round(acTotal / acUnits.length) : 0
    const remaining = acTotal - unitKW
    if (cap.cooling > 0 && remaining < cap.cooling) {
      issues.push({ code: 'G-HVAC-02', level: 'error', msg: `单台空调失效后剩余制冷量 ${Math.round(remaining)} kW < 需求 ${Math.round(cap.cooling)} kW，${h.redundancy} 冗余不达标` })
    }
  }

  // —— G-HVAC-04 温湿度/露点设点（机柜进风区，GB 50174-2017 环境章量级） ——
  const tSet = Number(h.setTemp), tMin = Number(h.tempMin), tMax = Number(h.tempMax)
  if (!(tMin >= 18 && tMax <= 27 && tMin <= tSet && tSet <= tMax)) {
    issues.push({ code: 'G-HVAC-04', level: 'error', msg: `温度设点/区间非法：现行 [${tMin}, ${tSet}, ${tMax}]，应满足 18≤下限≤设点≤上限≤27` })
  }
  if (Number(h.rhMax) > 60) issues.push({ code: 'G-HVAC-04', level: 'warn', msg: `相对湿度上限 ${h.rhMax}% > 60%，凝露风险` })
  if (!(Number(h.dewMin) >= 5.5 && Number(h.dewMax) <= 15 && Number(h.dewMin) < Number(h.dewMax))) {
    issues.push({ code: 'G-HVAC-04', level: 'warn', msg: `露点窗口 [${h.dewMin}, ${h.dewMax}] 超出 5.5~15℃ 量级区间` })
  }

  // —— G-HVAC-06 气流组织与密度匹配 ——
  const at = AIR_TYPES.find((a) => a.v === h.airType)
  if (at && cap.d > at.dMax) issues.push({ code: 'G-HVAC-06', level: 'warn', msg: `功率密度 ${cap.d} kW/柜 超出「${at.label}」适用区间（≤${at.dMax} kW/柜），建议升级选型` })

  // —— G-FIRE-01/10 灭火系统与灭火器误导 ——
  const hasExtinguisher = list.some((r) => r.type === 'fire')
  if (!f.agent) {
    if (hasExtinguisher || cap.N > 0) issues.push({ code: 'G-FIRE-10', level: 'error', msg: '未配置主灭火系统：手提灭火器仅为辅助消防，不能替代气体灭火（请在「工程配置→消防」选型）' })
  } else {
    // G-FIRE-05 泄压口有效面积（量级：≈0.002·保护区体积，须核 GB 50370 正文）
    const V = (dims ? dims.width * dims.depth * dims.height : 0) * 0.6
    const suggested = V > 0 ? Math.max(1, +(0.002 * V).toFixed(1)) : 0
    if ((Number(f.reliefArea) || 0) < suggested) {
      issues.push({ code: 'G-FIRE-05', level: 'warn', msg: `泄压口有效面积 ${f.reliefArea || 0} ㎡ < 建议 ${suggested} ㎡（保护区体积 ${Math.round(V)} m³ 量级，须核正文）` })
    }
  }

  // —— G-FIRE-06/07 防火门等级与疏散 ——
  const openings = []
  for (const k of ['back', 'left', 'front', 'right']) {
    for (const op of (walls && walls[k] && walls[k].openings) || []) openings.push({ ...op, wall: k })
  }
  const doors = openings.filter((o) => o.type === 'door')
  const reliefs = openings.filter((o) => o.type === 'relief')
  if (doors.length < 2) issues.push({ code: 'G-FIRE-07', level: 'error', msg: `疏散门 ${doors.length} 个 < 2，不满足疏散要求（GB 50016 量级）` })
  for (const dr of doors) {
    if ((Number(dr.width) || 0) < 0.9) issues.push({ code: 'G-FIRE-07', level: 'error', msg: `疏散门净宽 ${dr.width}m < 0.9m（GB 50016 量级）` })
  }
  if (f.agent && reliefs.length === 0 && (Number(f.reliefArea) || 0) <= 0) {
    issues.push({ code: 'G-FIRE-05', level: 'warn', msg: '气体灭火保护区未定义泄压口' })
  }

  // —— G-SEC-04 录像存储 ——
  const cams = list.filter((r) => r.type === 'cam').length
  if ((Number(s.recDays) || 0) < 30) issues.push({ code: 'G-SEC-04', level: 'warn', msg: `录像存储 ${s.recDays} 天 < 30 天（GB 50348-2018 工程惯用值）` })
  // 录像容量估算（量级）：码流 Mbps × 路数 × 天数 × 86400 / 8 → GB
  if (cams > 0) {
    const gb = (Number(s.bitrate) || 4) * cams * (Number(s.recDays) || 30) * 86400 / 8 / 1024
    issues.push({ code: 'G-SEC-04', level: 'info', msg: `录像容量估算约 ${Math.round(gb)} GB（${cams} 路 × ${s.bitrate}Mbps × ${s.recDays} 天，未计 RAID 冗余）` })
  }

  // —— G-SEC-01 主机房监控盲区（量级提示） ——
  if (cams === 0 && cap.N > 0) issues.push({ code: 'G-SEC-01', level: 'warn', msg: '主机房未布置任何摄像机，存在监控盲区' })

  // —— G-CAB-03 链路长度 ——
  const link = Number(eng.cable.linkLen) || 0
  if (link > 90) issues.push({ code: 'G-CAB-03', level: 'error', msg: `水平链路 ${link}m > 90m（永久链路上限），须增设电信间(FD)` })
  else if (link > 85) issues.push({ code: 'G-CAB-03', level: 'warn', msg: `水平链路 ${link}m 接近 90m 上限，建议预留余量` })

  // —— 菜单优化批次二补充规则 ——
  // G-SEC-02 主机房门双向受控（GB 50348-2018 出入口控制章）
  const doorsNoTwoWay = doors.filter((d) => !(d.security && d.security.twoWay));
  if (doors.length && doorsNoTwoWay.length === doors.length) {
    issues.push({ code: 'G-SEC-02', level: 'warn', msg: '主机房门未配置「双向受控」门禁（请在门窗属性面板勾选）' });
  }
  // G-SEC-03 火灾释放强制分支核查
  const doorsNoFire = doors.filter((d) => !(d.security && d.security.fireRelease));
  if (doors.length && doorsNoFire.length === doors.length) {
    issues.push({ code: 'G-SEC-03', level: 'warn', msg: '门禁未启用 fireRelease（火灾确认释放门禁，强制项）' });
  }
  // G-SEC-05 入侵报警探测器
  if (list.filter((r) => r.type === 'intrusion').length === 0) {
    issues.push({ code: 'G-SEC-05', level: 'warn', msg: '未布置入侵探测器（双鉴/幕帘等）' });
  }
  // G-SEC-10 电子巡查点
  if (list.filter((r) => r.type === 'patrol').length === 0) {
    issues.push({ code: 'G-SEC-10', level: 'info', msg: '未布置电子巡查点' });
  }
  // G-FIRE-04 灭火控制器与钢瓶
  if (f.agent && list.filter((r) => r.type === 'ctrl').length === 0) {
    issues.push({ code: 'G-FIRE-04', level: 'warn', msg: '已配置气体灭火系统但未放置灭火控制器' });
  }

  return issues
}

/** 消防联动矩阵（G-FIRE-08，融合项 A）：双独立火警确认后的强制动作时序 */
export const RELEASE_TIMELINE = [
  { t: 0, action: '双独立火警确认', by: 'FAS' },
  { t: 10, action: '声光疏散报警', by: 'FAS' },
  { t: 30, action: '停空调 / 关防火阀（acUnit.linkableShutdown / damper.closeOnRelease）', by: 'HVAC' },
  { t: 30, action: '切非消防电源（feeder.cutOnRelease，isFirePower:true 不切除）', by: 'PWR' },
  { t: 30, action: '释放疏散方向门禁（door.fireRelease，优先于一切安防逻辑）', by: 'SEC' },
  { t: 60, action: '延时喷放（dischargeDelay 0~30s 可调）', by: 'FIRE' },
  { t: 180, action: '喷放后延时排烟', by: 'HVAC' },
]

// 以下纯函数已迁移至 ./domain/engineeringDomain.js（领域层唯一真相源），
// 由文件顶部 import + re-export，本渲染层不再保留重复定义：
//   - batteryRoomIssue（融合项 B：电池室跨域项）
//   - COMPLIANCE_RULES（合规检查清单）
//   - complianceStatus（合规清单状态派生）
