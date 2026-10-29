// ===== 设计令牌系统（真实尺寸 + 统一缩放比例）=====
// 真实 19" 标准机柜物理尺寸（基准，单位 mm）：
//   宽 W = 600mm（外部宽度 / 窄柜）
//   深 D = 1000mm（标准机柜深度）
//   高 H = 1995mm（42U 总高，含底座与顶盖）
//   1U = 44.45mm，42U 内部可用高度 = 1866.9mm
// 统一缩放比例：PX_PER_MM（像素/毫米），宽与高共用同一比例 → 等比无畸变。
export const REAL_W = 600         // 机柜外部宽 (mm)
export const REAL_D = 1000        // 机柜深 (mm)
export const REAL_H = 1995        // 机柜总高 (mm)
export const U_COUNT = 42         // U 位数
export const U_MM = 44.45         // 1U 高度 (mm)

// 统一缩放比例（像素/毫米）；1U = U_MM * PX_PER_MM = 36px
export const PX_PER_MM = 36 / U_MM            // ≈ 0.8099 px/mm
// 3D 机柜模型统一缩放比例（场景单位/毫米），与 PX_PER_MM 同源、按介质取整
export const SCALE_3D = 0.1                  // 0.1 场景单位/mm（1 单位 = 1cm）

// 由真实尺寸 × 统一比例推导（宽与 U 高共用 PX_PER_MM，保证比例协调、无畸变）
export const U_HEIGHT = Math.round(U_MM * PX_PER_MM)              // 36（1U）
export const CABINET_BODY_WIDTH = Math.round(REAL_W * PX_PER_MM)  // 486（≈ 600mm 外部宽）
export const LEFT_LABEL_WIDTH = 40
export const RAIL_WIDTH = 20
export const SIDE_FRAME_WIDTH = 20    // 侧板加厚，更真实
export const TOP_HEADER_HEIGHT = 0    // 顶部标题栏已移除（不再超出机柜）
export const TOP_VENT_HEIGHT = 36     // 通风区加高
export const TOP_MARGIN_HEIGHT = 36
export const BOTTOM_MARGIN_HEIGHT = 22
export const FEET_HEIGHT = 30         // 支撑脚调整
export const BOTTOM_FOOTER_HEIGHT = 0 // 底部信息主栏已移除（不再超出机柜）
export const SVG_WIDTH = LEFT_LABEL_WIDTH + CABINET_BODY_WIDTH + 30

// RJ45/SFP 端口尺寸
// SFP 光口：参考真实设备面板，为"横向长条"，比 RJ45 电口更宽、高度接近电口，
// 宽高比约 2:1（电口 10x8 接近方形）。突出光口比网口更宽、更"粗壮"的形态，
// 且用亮银色金属外框 + 内部黑色通槽与深灰网口彻底区分。
export const RJ45_W = 10
export const RJ45_H = 8
export const RJ45_SPACING_X = 11.5
export const RJ45_SPACING_Y = 10.5
export const SFP_W = 11
export const SFP_H = 9
export const SFP_SPACING = 12.5
export const HDD25_W = 47
export const HDD25_H = 8.5
export const HDD35_W = 48
export const HDD35_H = 12
export const RACK_EAR_W = 7
export const RACK_EAR_SCREW = 1.2
export const HOLE_SIZE = 6

// 厂商颜色方案（设备面板 accent color）
export const VENDOR_COLORS = {
  huawei:   { primary: '#e60012', secondary: '#b8000d', text: '#ffffff', name: 'HUAWEI' },
  h3c:      { primary: '#0088cc', secondary: '#006699', text: '#ffffff', name: 'H3C' },
  cisco:    { primary: '#1b9ee6', secondary: '#0e80bf', text: '#ffffff', name: 'CISCO' },
  ruijie:   { primary: '#f39800', secondary: '#cc7a00', text: '#ffffff', name: 'RUIJIE' },
  aruba:    { primary: '#ff6a00', secondary: '#cc5500', text: '#ffffff', name: 'ARUBA' },
  hp:       { primary: '#0096d6', secondary: '#0077aa', text: '#ffffff', name: 'HP' },
  dell:     { primary: '#007db8', secondary: '#005f8c', text: '#ffffff', name: 'DELL' },
  juniper:  { primary: '#64a70b', secondary: '#4d8008', text: '#ffffff', name: 'JUNIPER' },
  fortinet: { primary: '#ee3324', secondary: '#bb2519', text: '#ffffff', name: 'FORTINET' },
  paloalto: { primary: '#2d6f9e', secondary: '#1f5073', text: '#ffffff', name: 'PALO ALTO' },
  aten:     { primary: '#5a2d82', secondary: '#3f1e5e', text: '#ffffff', name: 'ATEN' },
  apc:      { primary: '#355d3a', secondary: '#23402a', text: '#ffffff', name: 'APC' },
}

// 默认厂商颜色（未知）
export const DEFAULT_VENDOR_COLOR = { primary: '#555555', secondary: '#3a3a3a', text: '#ffffff', name: 'DEVICE' }

/**
 * 根据厂商名返回颜色方案
 */
export function getVendorColor(vendorOrBrand) {
  if (!vendorOrBrand) return DEFAULT_VENDOR_COLOR
  let v = String(vendorOrBrand).toLowerCase()
  // 中文厂商名 → 英文 key 映射，保证品牌色/LOGO 正确渲染
  const aliasMap = {
    '华为': 'huawei', '华为技术': 'huawei',
    '华三': 'h3c', '新华三': 'h3c', 'h3c': 'h3c',
    '思科': 'cisco', 'cisco': 'cisco',
    '锐捷': 'ruijie', 'ruijie': 'ruijie',
    '瞻博': 'juniper', 'juniper': 'juniper',
    '飞塔': 'fortinet', 'fortinet': 'fortinet',
    '派拓': 'paloalto', 'paloalto': 'paloalto',
    'aruba': 'aruba', '惠普': 'hp', '戴尔': 'dell', 'dell': 'dell',
    'at': 'aten', 'apc': 'apc',
  }
  for (const [cn, en] of Object.entries(aliasMap)) {
    if (v.includes(cn)) { v = en; break }
  }
  for (const key of Object.keys(VENDOR_COLORS)) {
    if (v.includes(key)) return VENDOR_COLORS[key]
  }
  return DEFAULT_VENDOR_COLOR
}

// 设备位置常量
export const DEVICE_X = LEFT_LABEL_WIDTH + SIDE_FRAME_WIDTH + 14
export const DEVICE_WIDTH = CABINET_BODY_WIDTH - 2 * SIDE_FRAME_WIDTH - 28

// 颜色规范
export const COLORS = {
  cabinetOuter: '#2a2a2a',
  cabinetMetal: '#3a3a3a',
  innerBg: '#f4f4f2',
  innerBgAlt: '#e8e8e5',
  railBg: '#e8e8e8',
  railHole: '#555555',
  borderLine: '#bbb',
  statusNormal: '#22aa44',
  statusWarning: '#ffaa00',
  statusAlarm: '#ee3333',
  statusOffline: '#888888',
  selectedBlue: '#0066ff',
}

// 坐标函数：U1在底部，U42在顶部
export function uToY(u, totalU) {
  const deviceAreaTop = TOP_HEADER_HEIGHT + TOP_VENT_HEIGHT + TOP_MARGIN_HEIGHT
  return deviceAreaTop + (totalU - u) * U_HEIGHT
}

export function statusColor(status) {
  switch (status) {
    case 'alarm':
      return COLORS.statusAlarm
    case 'warning':
      return COLORS.statusWarning
    case 'offline':
      return COLORS.statusOffline
    default:
      return COLORS.statusNormal
  }
}

/**
 * ===== 型号自动识别引擎（品牌 + 设备类型） =====
 * 输入任意型号字符串，识别出品牌（厂商）与设备类型（switch/router/firewall/...）。
 * 返回 { vendor, type }，vendor 与设备管理表单厂商名一致；无法识别返回 null。
 *
 * 识别优先级：强前缀（RG-/TL-/DS-/ZXR10/Catalyst/WS-C/CE/USG/AR/NE/SecPath/MSR...）
 *           → S 系列数字白名单（华为/华三/锐捷区分）
 *           → 其他品牌特征（Juniper/Dell/浪潮/深信服/山石/神州数码...）
 */
export function detectDeviceFromModel(model) {
  const raw = String(model || '').trim().toUpperCase()
  if (!raw) return null
  const hit = (re) => re.test(raw)

  // ---------- 1. 强前缀品牌（无歧义） ----------

  // 锐捷 RG-
  if (/^RG[-_]?/.test(raw)) {
    if (hit(/^RG[-_]?(WALL|ACE)/)) return { vendor: '锐捷', type: 'firewall' }
    if (hit(/^RG[-_]?(NBR|AR|RSR|EG)\d?/)) return { vendor: '锐捷', type: 'router' }
    if (hit(/^RG[-_]?AP|^AP\d{3}/)) return { vendor: '锐捷', type: 'wireless' }
    if (hit(/^RG[-_]?WS\d{3}/)) return { vendor: '锐捷', type: 'wireless' }
    return { vendor: '锐捷', type: 'switch' } // RG-S / ES / N 系列
  }
  // TP-Link TL-
  if (/^TL[-_]/.test(raw)) {
    if (hit(/^TL[-_]?(SG|SF|SL|SH)\d/)) return { vendor: 'TP-Link', type: 'switch' }
    if (hit(/^TL[-_]?(ER|R)\d/)) return { vendor: 'TP-Link', type: 'router' }
    if (hit(/^TL[-_]?AP\d/)) return { vendor: 'TP-Link', type: 'wireless' }
    if (hit(/^TL[-_]?(W|X)\d/)) return { vendor: 'TP-Link', type: 'wireless' }
    return null
  }
  // 海康威视 DS-
  if (/^DS[-_]/.test(raw)) {
    if (hit(/^DS[-_]2(CD|CE|XE|WD|MP|CV)/)) return { vendor: '海康威视', type: 'monitor' } // 网络摄像机
    if (hit(/^DS[-_]3E\d/)) return { vendor: '海康威视', type: 'switch' }
    if (hit(/^DS[-_]3WF/)) return { vendor: '海康威视', type: 'wireless' }
    if (hit(/^DS[-_](A\d|EVS|CVR|IVMS|SS\d)/)) return { vendor: '海康威视', type: 'server' } // 存储/阵列
    if (hit(/^DS[-_]6\d/)) return { vendor: '海康威视', type: 'monitor' } // 编解码器
    if (hit(/^DS[-_][789]\d/)) return { vendor: '海康威视', type: 'nvr' } // DVR/NVR
    return { vendor: '海康威视', type: 'other' }
  }
  // 大华 DH- / NVR / HCVR / XVR
  if (/^DH[-_]/.test(raw) || /^NVR\d|^HCVR\d|^XVR\d|^DHI[-_]/.test(raw)) {
    if (hit(/^DH[-_](S\d|31)/)) return { vendor: '大华', type: 'switch' }
    if (hit(/^DH[-_](A\d|ES)/)) return { vendor: '大华', type: 'server' }
    if (hit(/^DH[-_](CA|SD|SDN)|^IPC/)) return { vendor: '大华', type: 'monitor' }
    if (hit(/^NVR|^HCVR|^XVR|^DHI[-_]?(NVR|XVR|HCVR)/)) return { vendor: '大华', type: 'nvr' }
    return { vendor: '大华', type: 'other' }
  }
  // 中兴 ZXR10 / ZXA10
  if (/^ZX[RA]10/.test(raw)) {
    if (hit(/GER/)) return { vendor: '中兴(ZTE)', type: 'router' }
    return { vendor: '中兴(ZTE)', type: 'switch' }
  }
  // 思科
  if (/^CATALYST|^WS-C|^C\d{4}|^N(9K|7K|5K|3K)\d?|^NEXUS|^CBS\d|^SG[235]\d\d|^ISR\d|^ASR\d|^ASA\d|^FPR|^FTD|^AIR-/.test(raw)) {
    if (hit(/^ISR\d|^ASR\d/)) return { vendor: '思科(Cisco)', type: 'router' }
    if (hit(/^ASA|^FPR|^FTD/)) return { vendor: '思科(Cisco)', type: 'firewall' }
    if (hit(/^AIR-(AP|CT|CAP)/)) return { vendor: '思科(Cisco)', type: 'wireless' }
    return { vendor: '思科(Cisco)', type: 'switch' }
  }
  // 华为非 S 前缀系列
  if (hit(/^CE\d{4}|^CLOUDENGINE/)) return { vendor: '华为', type: 'switch' }
  if (hit(/^USG\d|^HISECENGINE/)) return { vendor: '华为', type: 'firewall' }
  if (hit(/^NE\d{2,4}|^NETENGINE/)) return { vendor: '华为', type: 'router' }
  if (hit(/^AR\d{3,4}/)) return { vendor: '华为', type: 'router' }
  if (hit(/^AIRENGINE|^AP\d{3}/)) return { vendor: '华为', type: 'wireless' }
  if (hit(/^RH\d|^TAISHAN|^FUSIONSERVER|^OCEANSTOR/)) return { vendor: '华为', type: 'server' }
  // 华三非 S 前缀系列
  if (hit(/^SECPATH/)) return { vendor: '华三(H3C)', type: 'firewall' }
  if (hit(/^MSR\d|^ER\d{3,4}/)) return { vendor: '华三(H3C)', type: 'router' }
  if (hit(/^WA\d{3,4}|^WX\d{3}/)) return { vendor: '华三(H3C)', type: 'wireless' }
  if (hit(/^R(4700|4900|6900)/)) return { vendor: '华三(H3C)', type: 'server' } // H3C UniServer R 系列

  // ---------- 2. S 系列（华为 / 华三 / 锐捷数字白名单区分） ----------
  const sm = raw.match(/^S(\d{3,5})/)
  if (sm) {
    const num = parseInt(sm[1], 10)
    const h3cSeries = [1224, 1600, 1800, 1850, 3100, 3600, 5000, 5120, 5130, 5500, 5560, 5800, 6300, 6500, 6520, 6800, 7500, 7900, 9500, 10500, 12500, 12400]
    if (h3cSeries.includes(num)) return { vendor: '华三(H3C)', type: 'switch' }
    if (num === 2910 || num === 2928) return { vendor: '锐捷', type: 'switch' }
    return { vendor: '华为', type: 'switch' } // 白名单外默认华为（S 系列最常见）
  }

  // ---------- 3. 其他品牌特征 ----------
  // Juniper
  if (hit(/^EX\d{4}|^QFX\d/)) return { vendor: 'Juniper', type: 'switch' }
  if (hit(/^MX\d{3}/)) return { vendor: 'Juniper', type: 'router' }
  if (hit(/^SRX\d{3}/)) return { vendor: 'Juniper', type: 'firewall' }
  // Arista（DCS-7xxx 交换机；神州数码 DCS-4xxx/3950 走后面）
  if (hit(/^DCS-7\d{3}/)) return { vendor: 'Arista', type: 'switch' }
  // D-Link
  if (hit(/^DGS\d{4}|^DES\d{4}/)) return { vendor: 'D-Link', type: 'switch' }
  if (hit(/^DIR\d|DAP\d/)) return { vendor: 'D-Link', type: 'router' }
  // Dell：N 系列交换机 / PowerEdge 服务器
  if (hit(/^N\d{4}[A-Z]?/) && !hit(/^N(9K|7K|5K|3K)/)) return { vendor: 'Dell', type: 'switch' }
  if (hit(/^POWEREDGE/)) return { vendor: 'Dell', type: 'server' }
  // 联想 / 浪潮
  if (hit(/^THINKSYSTEM/)) return { vendor: '联想', type: 'server' }
  if (hit(/^SA\d{4}|^NF\d{4}/)) return { vendor: '浪潮', type: 'server' }
  // Dell PowerEdge R 系列（裸 R740/R750；华三 R4900 系已在前面命中）
  if (hit(/^R\d{3}/) && !hit(/^R(4700|4900|6900)/)) return { vendor: 'Dell', type: 'server' }
  // HPE / Aruba / HP ProCurve
  if (hit(/^JL\d|^ARUBA/)) return { vendor: 'HPE', type: 'switch' }
  if (hit(/^J\d{4}/)) return { vendor: 'HP', type: 'switch' }
  // Netgear
  if (hit(/^GS\d{3,4}/)) return { vendor: 'Netgear', type: 'switch' }
  // 深信服
  if (hit(/^AF-\d|^AF\d{4}/)) return { vendor: '深信服', type: 'firewall' }
  if (hit(/^AC-\d/)) return { vendor: '深信服', type: 'gateway' }
  if (hit(/^AD-\d/)) return { vendor: '深信服', type: 'loadbalancer' }
  // 山石 / 天融信 / 迪普 / F5
  if (hit(/^SG-\d{4}/)) return { vendor: '山石网科', type: 'firewall' }
  if (hit(/^NGFW|^TOPSEC/)) return { vendor: '天融信', type: 'firewall' }
  if (hit(/^DPX\d/)) return { vendor: '迪普', type: 'firewall' }
  if (hit(/^BIG-IP/)) return { vendor: 'F5', type: 'loadbalancer' }
  // 神州数码 DCN
  if (hit(/^DCS-\d{4}/)) return { vendor: '神州数码', type: 'switch' }
  if (hit(/^DCR-\d{4}/)) return { vendor: '神州数码', type: 'router' }

  return null
}

/**
 * ===== 通用型号端口解析引擎 =====
 * 解析任意品牌交换机/路由器型号中的"端口数量+类型"组合，自动推导 rj45 电口数与 sfp 光口数。
 *
 * 品牌命名规则（各品牌已核实）：
 *  华为  S5735S-L24T4S-A2   → 24T=24电口 + 4S=4光口（T电/PoE供电电口/S光/X万兆光/C扩展/TP光电复用）
 *  华三  S5130S-28P-EI       → 28 为总口数：24 电 + 4 光（P 千兆光；S 万兆光；ST/TP 组合）
 *  锐捷  RG-S5760C-48GT4XS-X → 48GT=48千兆电口 + 4XS=4万兆光口（GT 千兆电 / SFP 光 / XS 万兆光）
 *  思科  Catalyst 2960X-24TS → 24 电口 + 4 上行光口（TS/TC 后缀；9500-48Y4C 含高速口）
 *  TP-LINK TL-SG3428         → 3428 = 24 电口 + 4 光口（尾数 28=24+4）
 *
 * 字母语义（关键，勿混淆）：
 *  电口(RJ45)：T、P（PoE 供电电口）、TP（光电复用）、G/GT（千兆电）
 *  光口(SFP)：S、X、XS、SFP、Y（25G）、Q（40G）、F
 *  扩展槽：C、SL（不计入端口，仅记录 slots）
 */
export function parseModelPortSpec(model, vendor) {
  const raw = String(model || '').toUpperCase()
  let v = String(vendor || '').toLowerCase()
  // 品牌未填时自动识别（型号特征 → 品牌）
  if (!v) {
    const det = detectDeviceFromModel(raw)
    if (det && det.vendor) v = det.vendor.toLowerCase()
  }
  const isH3c = v.includes('h3c') || v.includes('华三')
  const isRuijie = v.includes('ruijie') || v.includes('锐捷')
  const isCisco = v.includes('cisco') || v.includes('思科')
  const isTpLink = v.includes('tp-link') || v.includes('tplink') || v.includes('普联')
  const isHuawei = v.includes('huawei') || v.includes('华为')
  const isZte = v.includes('zte') || v.includes('中兴')

  let rj45 = 0
  let sfp = 0
  let slots = 0

  // 闭包累加器：直接修改本函数作用域的 rj45/sfp/slots
  const addByType = (t, n) => {
    const k = classifyPort(t)
    if (k === 'rj') rj45 += n
    else if (k === 'sfp') sfp += n
    else if (k === 'slot') slots += n
  }

  // ---------- A. 品牌特定精确规则（优先） ----------

  // A1. 华为：L24T4S / S48P4X / H24X6C（数字+字母连缀段）
  // 入口：品牌明确为华为，或型号含华为特征段（S5735-S48P4X / L24T4S / H24X6C 等）
  const huaweiLike = /^S[0-9]{4,5}|^CE\d|CLOUDENGINE|(?:^|[-\s])(?:L|H)\d{1,2}[A-Z]/.test(raw)
  if (isHuawei || (!isH3c && !isRuijie && !isCisco && !isTpLink && !isZte && huaweiLike)) {
    // 连缀式 -L24T4S / -S48P4X / -H24X6C（两段数字+字母，前缀 L/S/H 可选）
    const hua = raw.match(/(?:^|[-\s])(?:[LSH])?(\d{1,2})([A-Z]{1,2})(\d{1,2})([A-Z]{1,2})?(?:$|[-\s]|\.)/)
    if (hua && hua[3]) {
      const n1 = parseInt(hua[1], 10)
      const t1 = hua[2]
      const n2 = parseInt(hua[3], 10)
      const t2 = hua[4] || ''
      if (n1 >= 4 && n1 <= 56) {
        const isH = /(?:^|[-\s])H/.test(raw)
        addByType(t1, n1)
        if (n2 >= 2) {
          // H 系列 C6C：C 段视作扩展光口（如 S6730-H24X6C = 24×10GE 光 + 6×100GE 光）
          if (t2 === 'C' && isH) sfp += n2
          else addByType(t2, n2)
        }
        if (rj45 > 0 || sfp > 0) return finishParse(rj45, sfp, slots)
      }
    }
    // 华为单段 -52X / -28X / -28S / -28P / -54P（nP/S/X 结尾：n>=26 → n-4 电+4 光）
    const hx = raw.match(/[-\s](\d{2})(X|S|P|T)(?:[-\s]|$)/)
    if (hx) {
      const n = parseInt(hx[1], 10)
      const tt = hx[2]
      if (n === 54 && tt === 'P') { rj45 = 48; sfp = 6 }
      else if (n >= 26 && (tt === 'X' || tt === 'S' || tt === 'P')) { rj45 = n - 4; sfp = 4 }
      else if (n >= 24) { rj45 = n; sfp = tt === 'S' ? 4 : 0 }
      if (rj45 > 0 || sfp > 0) return finishParse(rj45, sfp, slots)
    }
  }

  // A2. 锐捷 — RG-S5760C-48GT4XS / RG-S2910-24GT4XS / RG-2928G
  if (isRuijie || (!isHuawei && !isH3c && !isCisco && !isTpLink && !isZte && /RG-[A-Z]/.test(raw))) {
    const ru = raw.match(/(\d{1,2})(GT|SFP|X|XS|P)(\d{1,2})?(XS|XS|GT|SFP|S|X)?/i)
    if (ru && ru[1]) {
      const n1 = parseInt(ru[1], 10)
      const t1 = (ru[2] || '').toUpperCase()
      const n2 = ru[3] ? parseInt(ru[3], 10) : 0
      const t2 = (ru[4] || '').toUpperCase()
      if (n1 >= 8 && n1 <= 96) {
        addByType(t1, n1)
        if (n2 >= 2) addByType(t2, n2)
        if (rj45 > 0 || sfp > 0) return finishParse(rj45, sfp, slots)
      }
    }
    // 锐捷 -2928G / -S2928G / -24G / -48G（数字+G：尾数 28=24+4 光；2928 系列等）
    const rg = raw.match(/[-\s]S?(\d{3,4})G(?:[-\s]|$)/i)
    if (rg) {
      const n = parseInt(rg[1], 10)
      const tail = n % 100
      if (n >= 5000) { rj45 = tail >= 48 ? 48 : 24; sfp = tail >= 48 ? 4 : 4 }
      else if (tail >= 26) { rj45 = tail - 4; sfp = 4 }
      else if (tail >= 8) { rj45 = tail; sfp = 0 }
      if (rj45 > 0) return finishParse(rj45, sfp, slots)
    }
  }

  // A.3 华三 — -28P / -28S / -52P / -28ST / -28TP / -30QC / -54QC
  if (isH3c || (!isHuawei && !isRuijie && !isCisco && !isTpLink && !isZte && /S[0-9]{4}.*-\d{2}/.test(raw))) {
    const h3 = raw.match(/[-\s](\d{2})(P|S|T|ST|TP|QC|Q|C|E|EI)?(?:[-\s]|$)/)
    if (h3 && h3[1]) {
      const total = parseInt(h3[1], 10)
      const suffix = (h3[2] || '').toUpperCase()
      if (total >= 24 && total <= 96) {
        // 总口数 → 电口/光口 映射（华三惯例）
        const map = { 26: [24, 2], 28: [24, 4], 30: [24, 6], 34: [28, 6], 44: [40, 4], 48: [44, 4], 52: [48, 4], 54: [48, 6] }
        if (suffix.includes('ST') || suffix.includes('TP')) { rj45 = total - 2; sfp = 2 }
        else if (map[total]) { rj45 = map[total][0]; sfp = map[total][1] }
        else { rj45 = total - 4; sfp = 4 }
        return finishParse(rj45, sfp, slots)
      }
    }
  }

  // A.4 思科 Catalyst — 2960X-24TS / 2960X-48TS / 9500-48Y4C
  if (isCisco || (!isHuawei && !isH3c && !isRuijie && !isTpLink && !isZte && /catalyst|c2960|c3560|c3650|c3750|c3850|c9200|c9300|c9500/i.test(raw))) {
    const ci = raw.match(/[-\s](\d{2})(TS|TC|TT|ST|PS|P|T|S|Y|U|Q)?(?:[-\s]|$)/i)
    if (ci && ci[1]) {
      const total = parseInt(ci[1], 10)
      const suffix = (ci[2] || '').toUpperCase()
      if (total >= 8 && total <= 96) {
        if (suffix.includes('Y') || suffix.includes('U') || suffix.includes('Q')) {
          rj45 = 0; sfp = total
        } else {
          rj45 = total
          if (suffix.includes('TC')) sfp = 2
          else if (suffix.includes('TS') || suffix.includes('ST') || suffix.includes('PS')) sfp = 4
          else sfp = 0
        }
        return finishParse(rj45, sfp, slots)
      }
    }
  }

  // A.5 TP-LINK — SG3428 / SG1048 / SG1024 / SG1016 / SG1008
  if (isTpLink || (!isHuawei && !isH3c && !isRuijie && !isCisco && !isZte && /(SG|SF|TL-)\d{4}/i.test(raw))) {
    const tp = raw.match(/(?:SG|SF)(\d{4})/i)
    if (tp) {
      const tpn = parseInt(tp[1], 10)
      if (tpn === 1048 || tpn === 1052) return finishParse(48, 4, 0)
      if (tpn === 1024) return finishParse(24, 0, 0)
      if (tpn === 1016) return finishParse(16, 0, 0)
      if (tpn === 1008) return finishParse(8, 0, 0)
      if (tpn >= 3000 && tpn <= 6000) {
        const total = tpn % 100
        const e = total === 24 ? 24 : total === 28 ? 24 : total === 48 ? 48 : total === 52 ? 48 : 0
        if (e) return finishParse(e, total - e, 0)
      }
    }
  }

  // A.6 中兴 — ZXR10 5928 / 5952（尾数 28=24+4 光 / 52=48+4 光）
  if (isZte || (!isHuawei && !isH3c && !isRuijie && !isCisco && !isTpLink && /ZXR10|^\d{4}[-\s]?/.test(raw))) {
    const zte = raw.match(/(\d{4})(?:[-\s]|$)/)
    if (zte) {
      const n = parseInt(zte[1], 10)
      const tail = n % 100
      if (tail >= 52) return finishParse(48, 4, 0)
      if (tail >= 28) return finishParse(24, 4, 0)
      if (tail >= 24) return finishParse(24, 0, 0)
      if (tail >= 16) return finishParse(16, 0, 0)
    }
  }

  // ---------- B. 通用「数字+字母」段（兜底） ----------
  // 只接受出现在 [- 空格 . ] 边界后的 2 位数段，避免 5735/5130 误拆
  const segRe = /(?:^|[-\s.])(\d{2})([A-Z]{1,3})/g
  let m
  const segs = []
  while ((m = segRe.exec(raw)) !== null) {
    const n = parseInt(m[1], 10)
    const t = m[2].toUpperCase()
    if (n < 4 || n > 96) continue
    if (/^(PWR|AC|DC|POE|PT|LT|EI|SI|HI|HP|LH|GE)$/.test(t)) continue
    segs.push({ n, t })
  }
  if (segs.length > 0) {
    for (const { n, t } of segs) {
      addByType(t, n)
    }
    if (rj45 > 0 || sfp > 0) return finishParse(rj45, sfp, slots)
  }

  return null
}

// 端口类型分类（T/P/GT → 电口；S/X/XS/SFP/Y/Q/F → 光口；C → 扩展槽）
function classifyPort(t) {
  if (!t) return null
  const upper = t.toUpperCase()
  if (/^(T|P|TP|G|GT)$/.test(upper)) return 'rj'
  if (/^(S|SFP|X|XS|Y|Q|F)$/.test(upper) || upper.includes('XS') || upper.includes('SFP')) return 'sfp'
  if (/^C$/.test(upper)) return 'slot'
  return null
}
// 按端口类型累加到解析结果（由 parseModelPortSpec 内部闭包 addByType 实现，此函数保留分类逻辑供调试）
function addByType(t, n, res) {
  const k = classifyPort(t)
  if (k === 'rj') res.rj45 += n
  else if (k === 'sfp') res.sfp += n
  else if (k === 'slot') res.slots += n
  return res
}

// 统一出口：修正无效组合并分组
function finishParse(rj, sf, slots) {
  if (rj === 0 && sf === 0 && slots === 0) return null
  return { rj45Count: rj, sfpCount: sf, slots, groups: makePortGroups(rj) }
}

/**
 * 按电口数量自动分组（每组代表一排，组内上下两排交错编号）
 *
 * 这是端口分组的**唯一来源**：buildPortConfig 与 finishParse 均调用它。
 *
 * 语义（与 2D DevicePanelRenderer、3D portLayout 完全一致）：
 *   groups 的每一项是「列数」，每一列渲染上下两个端口（下排奇数 / 上排偶数），
 *   故 **sum(groups) === ceil(rj45Count / 2)**。
 *
 * 早期存在两套并行实现，且都把 rj45Count 当成列数来分组
 * （如 56 口得到 [12,12,4] → 28 列 × 2 = 56，看似对，但 28 口会得到 [12,12,4] → 56 个端口，
 *   凭空多出一倍）。这里统一修正为按列数分组。
 */
function makePortGroups(rj45Count) {
  if (rj45Count <= 0) return []
  const cols = Math.ceil(rj45Count / 2) // 一列两个端口
  // 常见规格沿用既有排布，避免改动存量设备的观感
  if (cols === 4) return [4]        // 8 口
  if (cols === 8) return [8]        // 16 口
  if (cols === 12) return [12]      // 24 口
  if (cols === 24) return [12, 12]  // 48 口
  const gs = cols <= 16 ? 8 : 12
  const num = Math.ceil(cols / gs)
  const groups = []
  for (let i = 0; i < num; i++) groups.push(Math.min(gs, cols - i * gs))
  return groups
}

/**
 * 取第一个「已提供」的值（null/undefined/'' 视为未提供，**0 视为已提供**）
 * 用于区分「字段缺失」与「显式填 0」，避免 `x || default` 把显式 0 吞掉
 */
function firstDefined(...vals) {
  for (const v of vals) {
    if (v === null || v === undefined || v === '') continue
    return v
  }
  return undefined
}

/** 归一化为非负整数端口数（非法值 → 0） */
function toCount(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.round(n))
}

/**
 * 从设备型号解析端口配置
 * 支持常见的华为/H3C/思科/锐捷等型号命名方式
 * 返回: { rj45Count, sfpCount, hasConsole, groups, uHeight, power }
 *  - groups: 每组代表一排端口的组织，如 [8, 8] 表示两组，每组8口
 *  - 端口总数应该等于 rj45Count
 */
export function getDevicePortConfig(device) {
  if (!device) return defaultPortConfig(24, 4, 1)
  const model = String(device.model || '').toLowerCase()
  const name = String(device.name || '').toLowerCase()
  const vendor = String(device.vendor || device.brand || '').toLowerCase()
  const type = String(device.type || device.device_type || '').toLowerCase()
  const uSize = Number(device.uSize || device.u_height || 1)

  // 显式端口数覆盖（支持 rj45Count/sfpCount，也兼容设备库 ethernetPorts/sfpPorts 字段）
  // 注意：必须区分「字段未提供」与「显式填 0」——
  // 纯光口设备（rj45Count=0, sfpCount=8）走 `0 || 24` 会被错误渲染成 24 电口。
  // 字段缺失才回落到 24/4 默认值；显式 0 必须保留为 0。
  const RAW_RJ = firstDefined(device.rj45Count, device.rj45, device.ethernetPorts)
  const RAW_SFP = firstDefined(device.sfpCount, device.sfp, device.sfpPorts)
  const explicitRj45 = toCount(RAW_RJ)
  const explicitSfp = toCount(RAW_SFP)
  if (RAW_RJ !== undefined || RAW_SFP !== undefined) {
    return buildPortConfig(
      RAW_RJ === undefined ? 24 : explicitRj45,
      RAW_SFP === undefined ? 4 : explicitSfp,
      uSize, 'switch', device,
    )
  }

  // 路由器/防火墙特殊处理
  if (type === 'router') {
    return buildPortConfig(7, 2, uSize, 'router', device)
  }
  if (type === 'firewall') {
    return buildPortConfig(8, 2, uSize, 'firewall', device)
  }
  if (type === 'pdu' || type === 'kvm') {
    return buildPortConfig(0, 0, uSize, type, device)
  }

  // 从型号解析端口数
  // 模式：S5720-28X, S5731-S48P4X, S5130S-28P-EI, CE5855-48T4S, etc.
  const text = model + ' ' + name

  // 路由器型号检测（AR系列、MSR系列、ISR系列、ASR系列等）
  if (/(ar\d{4}|msr\d|isr\d|asr\d|ne\d{2}|mx\d|cr\d{2})/i.test(text) || /router/i.test(text)) {
    return buildPortConfig(7, 2, uSize, 'router', device)
  }

  // ===== 通用型号端口解析引擎（支持任意品牌型号自动推导端口数量/类型）=====
  // 华为 L24T4S、锐捷 48GT4XS、华三 28P/28S、思科 24TS、TP-Link SG3428 等
  const parsed = parseModelPortSpec(model, vendor || device.brand)
  if (parsed) {
    return buildPortConfig(parsed.rj45Count, parsed.sfpCount, uSize, 'switch', device)
  }

  // 48 口 + 4 光口 (S5731-S48P4X, S5720-52X, S5720-52P, CE-5855-48T4S, RG-S2910-48GT4XS, 高端 48-56 口交换机)
  if (/(48p|48t|48s|48gt|52p|52x|52s|l48t4|48s4q|48t4q|48gc|48y4|48y4c|48s4|48x|48q|56hf|40xs)/i.test(text) || /^5[0-9](hf|xs|gc|y4c)/i.test(text) || /s12500|n18010|n1800/i.test(text)) {
    const is40xs = /40xs/i.test(text)
    const is56 = /56hf/i.test(text)
    return buildPortConfig(is40xs ? 40 : is56 ? 56 : 48, is56 ? 8 : 4, uSize, 'switch', device)
  }
  // 24 口 + 4 光口 (S5720-28X, S5731-S24T4X, S5130-28P, -28S, RG-S2910-24GT4XS, S5735-L24T4X)
  if (/(24p|24t|24s|24gt|28p|28x|28s|l24t4|2960-?x?-?24)/i.test(text)) {
    return buildPortConfig(24, 4, uSize, 'switch', device)
  }
  // 16 口 + 2 光口 (S1720-16GWR, -16TP)
  if (/(16gw|16tp|16gwr|16pwr)/i.test(text)) {
    return buildPortConfig(16, 2, uSize, 'switch', device)
  }
  // 8 口 + 1 光口 (S1730S-L8P, TL-SG1008)
  if (/(^|[^0-9])8(p|tp|t)([^0-9]|$)/i.test(text) || /sg1008/i.test(text)) {
    return buildPortConfig(8, 1, uSize, 'switch', device)
  }
  // TP-Link 桌面交换机：TL-SG1024D=24口, TL-SG1016DT=16口, TL-SF1024D=24口
  const tpLinkM = text.match(/(?:sg|sf)(\d{4})([a-z]*)/i)
  if (tpLinkM) {
    const tpn = parseInt(tpLinkM[1], 10)
    if (tpn >= 1048) return buildPortConfig(48, 0, uSize, 'switch', device)
    if (tpn >= 1024) return buildPortConfig(24, 0, uSize, 'switch', device)
    if (tpn >= 1016) return buildPortConfig(16, 0, uSize, 'switch', device)
    if (tpn >= 1008) return buildPortConfig(8, 0, uSize, 'switch', device)
  }
  // 思科 Catalyst 2960-24T: 24电+2光
  if (/catalyst.*2960.*24t/i.test(text) || /c2960.*24t/i.test(text)) {
    return buildPortConfig(24, 2, uSize, 'switch', device)
  }
  // 通用：-NN 数字模式
  const m = text.match(/-(\d{2,3})([a-z])/)
  if (m) {
    const n = parseInt(m[1], 10)
    if (n >= 52) return buildPortConfig(n - 4, 4, uSize, 'switch', device)
    if (n >= 28) return buildPortConfig(n - 4, 4, uSize, 'switch', device)
    if (n >= 20) return buildPortConfig(n - 2, 2, uSize, 'switch', device)
    if (n >= 16) return buildPortConfig(n - 2, 2, uSize, 'switch', device)
    if (n >= 8)  return buildPortConfig(n - 2, 2, uSize, 'switch', device)
  }

  // 型号无法解析时的兜底：优先采用设备自带的端口总数（8 口桌面交换机等），
  // 只有连端口总数都没有时才回落到 24+4 通用交换机
  const fallbackPorts = toCount(firstDefined(device.ports_count, device.ports, device.portCount))
  if (fallbackPorts > 0) {
    const fallbackSfp = toCount(firstDefined(device.sfpCount, device.sfp, device.sfpPorts))
    return defaultPortConfig(fallbackPorts, fallbackSfp, uSize, device)
  }
  return defaultPortConfig(24, 4, uSize, device)
}

function defaultPortConfig(rj45Count, sfpCount, uHeight, device) {
  return buildPortConfig(rj45Count, sfpCount, uHeight, 'switch', device)
}

// 根据端口总数自动分组 —— 每组上下两排，数量按设备端口数明确映射
function buildPortConfig(rj45Count, sfpCount, uHeight, kind, device) {
  let groups = []
  const isRouter = kind === 'router'
  const isFirewall = kind === 'firewall'

  if (rj45Count > 0) {
    if (isRouter) {
      groups = [rj45Count]
    } else if (isFirewall) {
      groups = [rj45Count]
    } else {
      // 与 makePortGroups 保持同一套算法（端口分组唯一来源）
      groups = makePortGroups(rj45Count)
    }
  }

  const connectedPortSet = new Set()
  if (device && device.status !== 'offline') {
    if (Array.isArray(device.connectedPorts) && device.connectedPorts.length > 0) {
      // 同时保留「原始字符串」与「数字」两种形态：
      //   · 电口以数字或数字字符串记录（1 / '1'）
      //   · 光口以 'SFP-n' 记录（消费端 isSFPPortConnected / DevicePanelRenderer 均按 'SFP-'+n 查找）
      // 早期实现统一 Number(p) 会把 'SFP-1' 变成 NaN，导致光口连接状态永远匹配不上
      device.connectedPorts.forEach((p) => {
        if (p === null || p === undefined || p === '') return
        connectedPortSet.add(p)
        const n = Number(p)
        if (!Number.isNaN(n)) connectedPortSet.add(n)
      })
    }
  }

  return {
    rj45Count,
    sfpCount,
    hasConsole: !isRouter,
    hasMgmt: isFirewall,
    isRouter,
    isFirewall,
    singleRowOnly: isRouter || isFirewall || rj45Count <= 8,
    groups,
    uHeight,
    kind,
    connectedPortSet,
  }
}

/**
 * 辅助函数：判断某个RJ45端口（1-based编号）是否处于连接状态
 * 注意：真实连接状态需同时检查 portStateStore.isPortOccupied
 */
export function isPortConnected(device, portNumber, portCfg) {
  if (!device || device.status === 'offline') return false
  if (portCfg && portCfg.connectedPortSet) {
    return portCfg.connectedPortSet.has(portNumber)
  }
  return false
}

/**
 * 辅助函数：判断某个SFP端口（1-based编号）是否处于连接状态
 * 注意：真实连接状态需同时检查 portStateStore.isPortOccupied
 */
export function isSFPPortConnected(device, sfpIndex, portCfg) {
  if (!device || device.status === 'offline') return false
  if (portCfg && portCfg.connectedPortSet) {
    return portCfg.connectedPortSet.has('SFP-' + sfpIndex) || portCfg.connectedPortSet.has(sfpIndex)
  }
  return false
}

/**
 * 根据厂商/设备 u 位置计算挂耳螺丝相对 Y 位置
 * 每个 U 的方孔 y 偏移为 [6, 18, 30]（相对U顶），返回相对设备顶的 Y
 * 设备顶比 U 顶低 1px，所以相对设备顶：5, 17, 29
 * 使用第一个和第三个孔（每个 U 的上下螺丝），确保上下对称：
 *   - 顶部螺丝距挂耳顶：5px
 *   - 底部螺丝距挂耳底：5px（1U height=34，34-29=5）
 */
export function getEarScrewPositions(deviceHeight, uHeight) {
  const screws = []
  for (let u = 0; u < uHeight; u++) {
    screws.push(u * U_HEIGHT + 5)  // 上孔
    screws.push(u * U_HEIGHT + 29) // 下孔
  }
  // 确保不超出 deviceHeight
  return screws.filter(y => y > 0 && y < deviceHeight - 2)
}

/**
 * 将 store 中的 slot/device 数据转换为 SVG 设备列表
 * 适配 React JSX 中的 device 数据结构
 * @param {Object} cabinet - 机柜对象 { id, name, totalU, slots: {U: deviceId}, patchItems }
 * @param {Array} devices - 设备数组 [{ id, name, type, uSize, status, vendor, model, ip }]
 * @returns {Array} svgDevices - [{ id, device_type, brand, model, u_position, u_height, status, ports, drives, name, vendor, ip }]
 */
export function transformSlotDevices(cabinet, devices) {
  if (!cabinet || !cabinet.slots) return []
  const slotMap = cabinet.slots || {}
  const deviceMap = {}
  devices.forEach((d) => {
    deviceMap[d.id] = d
  })

  // 按设备去重：每个设备在 slots 中可能有1个（新单key模式）或多个（旧整数U模式）key
  const deviceIds = new Set(Object.values(slotMap).filter(Boolean))
  const result = []

  deviceIds.forEach((deviceId) => {
    const device = deviceMap[deviceId]
    if (!device) return

    // 找到设备占用的最低U位 (startU)
    // 新模型：1个 key = startU；旧模型：多个整数key，取最小
    let minU = Infinity
    Object.entries(slotMap).forEach(([u, id]) => {
      if (id === deviceId) {
        const uNum = parseFloat(u)
        if (uNum < minU) minU = uNum
      }
    })

    if (minU === Infinity) return

    const uSize = device.uSize || 1
    const brand = device.vendor || ''
    const deviceType = device.type || 'server'

    result.push({
      id: device.id,
      device_type: deviceType,
      brand: brand,
      model: device.model || '',
      name: device.name || '',
      vendor: device.vendor || '',
      ip: device.ip || '',
      u_position: minU,
      u_height: uSize,
      status: device.status || 'normal',
      ports: [],
      drives: [],
    })
  })

  // 按 u_position 从大到小排序（大的在上方先渲染）
  result.sort((a, b) => b.u_position - a.u_position)
  return result
}

/**
 * 计算连续空 U 区间（>=3U）
 * @param {Array} svgDevices
 * @param {number} totalU
 * @returns {Array} [{ startU, endU, size }]
 */
export function calcEmptySlots(svgDevices, totalU) {
  // 范围模型：每个设备占据 [startU, startU + uHeight)
  const ranges = svgDevices.map((d) => {
    const h = d.u_height || 1
    return { start: d.u_position, end: d.u_position + h }
  })
  const isOccupied = (u) => ranges.some((r) => u >= r.start && u < r.end)
  const step = 1 / 3
  const slots = []
  let start = null
  for (let u = 1; u <= totalU + 0.0001; u += step) {
    const uc = Math.round(u * 3) / 3
    if (!isOccupied(uc)) {
      if (start === null) start = uc
    } else if (start !== null) {
      const prev = Math.round((uc - step) * 3) / 3
      const size = prev - start + step
      if (size >= 1) slots.push({ startU: start, endU: prev, size })
      start = null
    }
  }
  if (start !== null) {
    const size = totalU - start + step
    if (size >= 1) slots.push({ startU: start, endU: totalU, size })
  }
  return slots
}

/**
 * 从 patchItems 转换配线设备列表用于 SVG 渲染
 * @param {Object} cabinet
 * @param {Array} allDevices
 * @returns {Array}
 */
export function transformPatchDevices(cabinet, allDevices) {
  if (!cabinet || !cabinet.patchItems) return []
  const items = cabinet.patchItems || []
  const result = []
  // 无 id 配线设备的回退 id 生成计数器：
  // 早期用 Date.now()，同一毫秒内新增多个无 id 设备会得到完全相同的 id，
  // 导致后续按 id 查找/删除串台。改用「时间戳 + 递增序号」保证本次转换内唯一。
  let fallbackSeq = 0

  items.forEach((item) => {
    let deviceType = 'server'
    let brand = ''
    let model = ''
    let name = item.name || ''
    let status = 'normal'
    let ports = []
    let drives = []

    if (item.category === 'network') {
      // 网络设备：从 device 数据获取
      const device = allDevices.find((d) => d.id === item.deviceId)
      if (device) {
        deviceType = device.type || 'switch'
        brand = device.vendor || ''
        model = device.model || ''
        name = device.name || name
        status = device.status || 'normal'
      } else {
        deviceType = 'switch'
      }
    } else if (item.category === 'patch_panel') {
      deviceType = 'patch_panel'
      // 配线架显示为面板类型
    } else if (item.category === 'cable_manager') {
      deviceType = 'cable_manager'
    } else if (item.category === 'odf') {
      deviceType = 'odf'
    } else if (item.category === 'fiber_tray') {
      deviceType = 'fiber_tray'
    }

    const uSize = item.uSize || 1
    const startU = item.startU || 1

    result.push({
      id: item.id || `patch-${Date.now()}-${fallbackSeq++}`,
      device_type: deviceType,
      brand: brand,
      model: model,
      name: name,
      u_position: startU,
      u_height: uSize,
      status: status,
      ports: ports,
      drives: drives,
      _isPatchItem: true,
      _category: item.category,
    })
  })

  result.sort((a, b) => b.u_position - a.u_position)
  return result
}

/**
 * 获取设备名称显示（用于 SVG tooltip 等）
 */
export function getDeviceDisplayName(device) {
  if (device.name) return device.name
  if (device.brand && device.model) return `${device.brand} ${device.model}`
  return `设备 #${device.id}`
}

/**
 * 碰撞检测
 */
export function checkOverlap(devices, deviceId, newU, uHeight, totalU) {
  // 边界：startU 必须 >= 1，且 startU + uHeight - 1 <= totalU
  if (newU < 1 - 0.0001 || newU + uHeight - 1 > totalU + 0.0001) return true
  const newTopY = uToY(newU + uHeight - 1, totalU) + 1
  const newBottomY = newTopY + uHeight * U_HEIGHT - 2
  for (const d of devices) {
    if (String(d.id) === String(deviceId)) continue
    const dHeight = d.u_height || 1
    const dTopY = uToY(d.u_position + dHeight - 1, totalU) + 1
    const dBottomY = dTopY + dHeight * U_HEIGHT - 2
    if (newTopY < dBottomY && newBottomY > dTopY) return true
  }
  return false
}

/**
 * clientY -> U 位转换
 */
export function clientYToU(clientY, svgElement, totalU) {
  if (!svgElement) return null
  const pt = svgElement.createSVGPoint
    ? svgElement.createSVGPoint()
    : { x: 0, y: clientY }
  if (svgElement.createSVGPoint) {
    pt.y = clientY
    pt.x = 0
  }
  const ctm = svgElement.getScreenCTM()
  if (!ctm) return null
  const svgY = pt.matrixTransform(ctm.inverse()).y
  const yInBody = svgY - (TOP_HEADER_HEIGHT + TOP_VENT_HEIGHT + TOP_MARGIN_HEIGHT)
  const uFromTopContinuous = yInBody / U_HEIGHT
  const uFloat = totalU - uFromTopContinuous
  const snappedU = Math.round(uFloat * 3) / 3
  const minU = 1
  const maxU = totalU
  return Math.max(minU, Math.min(maxU, snappedU))
}
