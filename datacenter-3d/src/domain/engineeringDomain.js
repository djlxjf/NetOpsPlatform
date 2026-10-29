// 领域纯函数层（从 engineering.js 抽取）
// 仅包含「机房工程量化 / 合规」相关的纯函数，不依赖渲染对象、DOM 或 THREE，
// 便于复用与单元测试。任何需要 window / document / 场景图的代码都不应放进本文件。

/**
 * 统一容量核算引擎（审查报告 5.6 口径，单一锚点 d + 机柜数 N 驱动两域）
 * @returns P_IT IT有功 / cooling 总冷量需求 / acPower 空调电耗 / nonIT 非IT电 /
 *          upsVA UPS视在(含关键制冷口径) / genKVA 柴发容量 / rppCount 列头柜建议数
 */
export function computeCapacity(eng, rackCount) {
  const N = Math.max(0, Number(rackCount) || 0)
  const d = Math.max(0, Number(eng && eng.density) || 0)
  const P_IT = N * d
  const cooling = 1.1 * P_IT                       // 总冷量≈1.1·P_IT
  const acPower = 0.31 * P_IT                      // 空调电耗中值
  const nonIT = 0.35 * P_IT                        // 含空调+照明+弱电+输配损耗
  const keyOnUps = !eng || !eng.hvac || eng.hvac.keyCoolingOnUps !== false
  const upsVA = keyOnUps ? 1.68 * P_IT : 1.33 * P_IT // 含关键制冷 1.6~1.75，纯 IT 1.33
  const genKVA = 1.55 * P_IT                        // 已含空调电耗
  const rppCount = Math.ceil(N / 25)                // 每 20~30 柜 1 台列头柜，取 25
  const itRacks = N
  return { N: itRacks, d, P_IT, cooling, acPower, nonIT, upsVA, genKVA, rppCount }
}

/**
 * 机柜进风温度模型（G-HVAC-12）：删除随机种子，由「机房等级设点 + 功率密度偏离」
 * 确定性推导——密度越高、制冷越吃紧，进风温度越接近设点上限。
 * @returns 摄氏度（确定性：同配置同结果）
 */
export function rackInletTemp(eng, rack) {
  const h = eng && eng.hvac ? eng.hvac : {}
  const set = Number(h.setTemp) || 24
  const max = Number(h.tempMax) || 27
  const d = Math.max(0, Number(eng && eng.density) || 0)
  const rackW = Math.max(0, Number(rack && rack.power) || 0)
  // 功率密度偏离基准(5kW)每 +1kW，进风温度向 [set, max] 区间推进 18%
  const over = Math.max(0, (d - 5)) / 5
  const t = set + (max - set) * Math.min(1, over * 0.18 + (rackW > 8 ? 0.12 : 0))
  return +t.toFixed(1)
}

/** 电池室跨域项（融合项 B）：一处定义、三域引用 */
export function batteryRoomIssue(eng) {
  const rooms = (eng.auxRooms || []).filter((r) => r.type === 'battery')
  if (!rooms.length) return null
  const r = rooms[0]
  const load = Number(r.floorLoad) || 0
  if (load > 0 && load < 12) return { code: 'G-PWR-11', level: 'warn', msg: `电池室楼板活荷载 ${load} kN/㎡ < 12（工程惯用下限，须核正文）` }
  return null
}

export const COMPLIANCE_RULES = [
  { code: 'G-PWR-01', cat: '供配电', text: '机房等级已按运行中断后果定级并填写理由' },
  { code: 'G-PWR-02', cat: '供配电', text: '单机柜功率密度已录入，IT 负荷可核算' },
  { code: 'G-PWR-04', cat: '供配电', text: 'UPS 容量/冗余/后备时间满足 IT 与关键制冷负荷' },
  { code: 'G-PWR-06', cat: '供配电', text: '列头柜(RPP)数量满足约每 25 柜 1 台' },
  { code: 'G-HVAC-01', cat: '空调暖通', text: '总制冷量（含冗余）≥ 热负荷需求' },
  { code: 'G-HVAC-02', cat: '空调暖通', text: '空调冗余方式满足单台失效仍带全载' },
  { code: 'G-HVAC-04', cat: '空调暖通', text: '温湿度/露点设点落在规范区间（18~27℃ / RH≤60%）' },
  { code: 'G-FIRE-01', cat: '消防', text: '主灭火系统（气体/细水雾）已选型' },
  { code: 'G-FIRE-05', cat: '消防', text: '泄压口有效面积满足保护区核算' },
  { code: 'G-FIRE-06', cat: '消防', text: '防火门等级与防火分区开口匹配' },
  { code: 'G-FIRE-07', cat: '消防', text: '疏散门 ≥2 且净宽 ≥0.9m' },
  { code: 'G-SEC-01', cat: '安防', text: '主机房摄像机覆盖无盲区' },
  { code: 'G-SEC-02', cat: '安防', text: '主机房门双向受控 + fireRelease 已启用' },
  { code: 'G-SEC-04', cat: '安防', text: '录像存储天数 ≥30d' },
  { code: 'G-CAB-03', cat: '综合布线', text: '水平链路 ≤90m（信道 ≤100m）' },
  { code: 'G-CAB-04', cat: '综合布线', text: '电信间/设备间/进线间已规划登记' },
]

/** 合规清单状态：error/warn/info=自动核验发现问题；manual=人工已确认；pass=自动通过 */
export function complianceStatus(eng, issues) {
  const byCode = {}
  for (const it of issues) byCode[it.code] = it
  return COMPLIANCE_RULES.map((r) => {
    const hit = byCode[r.code]
    const done = !!(eng.compliance && eng.compliance[r.code])
    // 有自动问题→该问题级别；无问题：人工勾选过→manual，否则→pass（自动通过）
    const state = hit ? hit.level : (done ? 'manual' : 'pass')
    return { ...r, state, done, msg: hit ? hit.msg : '' }
  })
}
