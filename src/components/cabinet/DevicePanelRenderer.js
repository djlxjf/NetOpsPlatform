import { h, defineComponent, reactive, computed } from 'vue'
import { storeToRefs } from 'pinia'
import {
  U_HEIGHT, DEVICE_WIDTH, RACK_EAR_W,
  RJ45_W, RJ45_H, RJ45_SPACING_X, RJ45_SPACING_Y,
  SFP_W, SFP_H, SFP_SPACING,
  HDD25_W, HDD25_H, HDD35_W, HDD35_H,
  HOLE_SIZE, COLORS, VENDOR_COLORS, DEFAULT_VENDOR_COLOR,
  getVendorColor, statusColor, getDevicePortConfig, getEarScrewPositions
} from '../../composables/useRackTransform.js'
import { usePortStateStore } from '../../stores/portState.js'
import { renderBrandLogo } from './brandLogos.js'
import { ElMessageBox } from 'element-plus'
import fiberFcImg from '../../assets/panels/fiber-fc.svg'
import fiberSc12Img from '../../assets/panels/fiber-sc12.png'
import fiberSc24Img from '../../assets/panels/fiber-sc24.png'
import fiberLc24Img from '../../assets/panels/fiber-lc24.png'
import fiberLc48Img from '../../assets/panels/fiber-lc48.png'
import { matchVendorPanel } from '../../assets/panels/vendor/vendorPanelImages.js'

const zoomPatchLabels = reactive({})

// 品牌区型号文本 clipPath 计数器（避免 id 冲突）
let _brandClipId = 0

// ===== 设备面板渲染组件 =====
// 这是一个使用 render function (h()) 的组件，输出 SVG 元素构成的设备面板
// 用法: <DevicePanelRenderer :device="device" :width="400" :height="34" />

export {
  U_HEIGHT, DEVICE_WIDTH, RACK_EAR_W,
  RJ45_W, RJ45_H, RJ45_SPACING_X, RJ45_SPACING_Y,
  SFP_W, SFP_H, SFP_SPACING,
  HDD25_W, HDD25_H,
  getVendorColor, statusColor, getDevicePortConfig,
}

// ===== 电源按钮 =====
function renderPowerButton(x, y, active, onClick) {
  const interactive = !!onClick
  return h('g', {
    'data-power-btn': 'true',
    style: { pointerEvents: interactive ? 'auto' : 'none', cursor: interactive ? 'pointer' : 'default' },
    onClick: interactive ? (e) => { e.stopPropagation(); onClick() } : undefined
  }, [
    h('circle', { cx: x, cy: y, r: 2.4, fill: '#1a1a1a', stroke: '#0a0a0a', 'stroke-width': 0.3 }),
    h('circle', { cx: x, cy: y, r: 1.8, fill: '#2a2a2a', stroke: '#333', 'stroke-width': 0.2 }),
    h('circle', { cx: x, cy: y, r: 1.2, fill: active ? '#22aa44' : '#3a3a3a' }),
    ...(active ? [h('circle', { cx: x, cy: y, r: 2.8, fill: '#22aa44', opacity: 0.25 })] : []),
    h('path', { d: `M ${x - 1.2} ${y - 0.7} A 1.2 1.2 0 1 1 ${x + 1.2} ${y - 0.7}`, fill: 'none', stroke: active ? '#fff' : '#999', 'stroke-width': 0.3 }),
    h('line', { x1: x, y1: y - 1.8, x2: x, y2: y - 0.2, stroke: active ? '#fff' : '#999', 'stroke-width': 0.3 }),
  ])
}

// ===== 品牌样式配置 =====
function getBrandStyleConfig(vendorOrBrand, deviceType) {
  let v = String(vendorOrBrand || '').toLowerCase()
  const type = deviceType || 'switch'

  // 中文厂商名 → 品牌 key 映射，保证左上角品牌 LOGO/配色正确
  const aliasMap = {
    '华为': 'huawei', '华为技术': 'huawei',
    '华三': 'h3c', '新华三': 'h3c',
    '思科': 'cisco',
    '锐捷': 'ruijie',
    '瞻博': 'juniper', '飞塔': 'fortinet', '派拓': 'paloalto',
  }
  for (const [cn, en] of Object.entries(aliasMap)) {
    if (v.includes(cn)) { v = en; break }
  }

  const configs = {
    huawei: {
      brandWidth: 70,
      brandBg: '#181818',
      stripeWidth: 1.5,
      stripeColor: '#e60012',
      textColor: '#e60012',
      textFontSize: 6,
      textBold: true,
      modelColor: '#ffffff',
      modelFontSize: 4,
      typeColor: '#666666',
      accentColor: '#e60012',
      panelBody: '#1a1a1a',
      panelFrame: '#0f0f0f',
      logoText: 'HUAWEI',
      typeText: type === 'firewall' ? 'NGFW' : type === 'router' ? 'AR Router' : 'Switch',
    },
    h3c: {
      brandWidth: 65,
      brandBg: '#181818',
      stripeWidth: 1.5,
      stripeColor: '#0088cc',
      textColor: '#0088cc',
      textFontSize: 6.5,
      textBold: true,
      modelColor: '#ffffff',
      modelFontSize: 4,
      typeColor: '#666666',
      accentColor: '#0088cc',
      panelBody: '#1a1a1a',
      panelFrame: '#0f0f0f',
      logoText: 'H3C',
      typeText: type === 'firewall' ? 'NGFW' : type === 'router' ? 'Router' : 'Switch',
    },
    cisco: {
      brandWidth: 72,
      brandBg: '#181818',
      stripeWidth: 0,
      stripeColor: '#1b9ee6',
      textColor: '#ffffff',
      textFontSize: 5.5,
      textBold: true,
      modelColor: '#ffffff',
      modelFontSize: 4,
      typeColor: '#666666',
      accentColor: '#1b9ee6',
      panelBody: '#1a1a1a',
      panelFrame: '#0f0f0f',
      logoText: 'CISCO',
      hasBlueAccentBar: true,
      typeText: type === 'firewall' ? 'NGFW' : type === 'router' ? 'ISR Router' : 'Catalyst',
    },
    ruijie: {
      brandWidth: 65,
      brandBg: '#181818',
      stripeWidth: 1.5,
      stripeColor: '#d92218',
      textColor: '#d92218',
      textFontSize: 5.5,
      textBold: true,
      modelColor: '#ffffff',
      modelFontSize: 4,
      typeColor: '#666666',
      accentColor: '#d92218',
      panelBody: '#1a1a1a',
      panelFrame: '#0f0f0f',
      logoText: 'RUIJIE',
      typeText: type === 'firewall' ? 'NGFW' : type === 'router' ? 'Router' : 'Switch',
    },
    juniper: {
      brandWidth: 68,
      brandBg: '#181818',
      stripeWidth: 1.5,
      stripeColor: '#64a70b',
      textColor: '#64a70b',
      textFontSize: 5.5,
      textBold: true,
      modelColor: '#ffffff',
      modelFontSize: 4,
      typeColor: '#666666',
      accentColor: '#64a70b',
      panelBody: '#1a1a1a',
      panelFrame: '#0f0f0f',
      logoText: 'JUNIPER',
      typeText: type === 'firewall' ? 'SRX' : type === 'router' ? 'MX Router' : 'Switch',
    },
    fortinet: {
      brandWidth: 72,
      brandBg: '#181818',
      stripeWidth: 1.5,
      stripeColor: '#ee3324',
      textColor: '#ee3324',
      textFontSize: 5.5,
      textBold: true,
      modelColor: '#ffffff',
      modelFontSize: 4,
      typeColor: '#666666',
      accentColor: '#ee3324',
      panelBody: '#1a1a1a',
      panelFrame: '#0f0f0f',
      logoText: 'FORTINET',
      typeText: type === 'firewall' ? 'FortiGate' : type === 'router' ? 'Router' : 'Switch',
    },
    paloalto: {
      brandWidth: 72,
      brandBg: '#181818',
      stripeWidth: 1.5,
      stripeColor: '#2d6f9e',
      textColor: '#2d6f9e',
      textFontSize: 5,
      textBold: true,
      modelColor: '#ffffff',
      modelFontSize: 3.8,
      typeColor: '#666666',
      accentColor: '#2d6f9e',
      panelBody: '#1a1a1a',
      panelFrame: '#0f0f0f',
      logoText: 'PALO ALTO',
      typeText: type === 'firewall' ? 'PA-Series' : type === 'router' ? 'Router' : 'Switch',
    },
    aruba: {
      brandWidth: 65,
      brandBg: '#181818',
      stripeWidth: 1.5,
      stripeColor: '#ff6a00',
      textColor: '#ff6a00',
      textFontSize: 5.5,
      textBold: true,
      modelColor: '#ffffff',
      modelFontSize: 4,
      typeColor: '#666666',
      accentColor: '#ff6a00',
      panelBody: '#1a1a1a',
      panelFrame: '#0f0f0f',
      logoText: 'ARUBA',
      typeText: type === 'firewall' ? 'NGFW' : type === 'router' ? 'Router' : 'Switch',
    },
    hp: {
      brandWidth: 68,
      brandBg: '#181818',
      stripeWidth: 1.5,
      stripeColor: '#0096d6',
      textColor: '#0096d6',
      textFontSize: 6.5,
      textBold: true,
      modelColor: '#ffffff',
      modelFontSize: 4,
      typeColor: '#666666',
      accentColor: '#0096d6',
      panelBody: '#1a1a1a',
      panelFrame: '#0f0f0f',
      logoText: 'HP',
      typeText: type === 'firewall' ? 'NGFW' : type === 'router' ? 'Router' : 'Switch',
    },
    dell: {
      brandWidth: 65,
      brandBg: '#181818',
      stripeWidth: 1.5,
      stripeColor: '#007db8',
      textColor: '#007db8',
      textFontSize: 6,
      textBold: true,
      modelColor: '#ffffff',
      modelFontSize: 4,
      typeColor: '#666666',
      accentColor: '#007db8',
      panelBody: '#1a1a1a',
      panelFrame: '#0f0f0f',
      logoText: 'DELL',
      typeText: type === 'firewall' ? 'NGFW' : type === 'router' ? 'Router' : 'Switch',
    },
  }

  for (const key of Object.keys(configs)) {
    if (v.includes(key)) return configs[key]
  }

  const vColor = getVendorColor(vendorOrBrand)
  return {
    brandWidth: 68,
    brandBg: '#181818',
    stripeWidth: 1.5,
    stripeColor: vColor.primary,
    textColor: vColor.primary,
    textFontSize: 6,
    textBold: true,
    modelColor: '#ffffff',
    modelFontSize: 4,
    typeColor: '#666666',
    accentColor: vColor.primary,
    panelBody: '#1a1a1a',
    panelFrame: '#0f0f0f',
    logoText: (vendorOrBrand || 'NETWORK').toUpperCase().slice(0, 10),
    typeText: type === 'firewall' ? 'NGFW' : type === 'router' ? 'Router' : 'Switch',
  }
}

// ===== 渲染品牌区域 =====
function renderBrandArea(x, y, width, height, brandConfig, modelName, modelClipMaxX, deviceName) {
  const els = []
  const { brandBg, stripeWidth, stripeColor, textColor, textFontSize, textBold,
    modelColor, modelFontSize, typeColor, logoText, typeText, hasBlueAccentBar, accentColor } = brandConfig

  els.push(h('rect', { x, y: y + 2, width, height: height - 4, fill: brandBg, stroke: '#2a2a2a', 'stroke-width': 0.3 }))

  if (stripeWidth > 0) {
    els.push(h('rect', { x, y: y + 2, width: stripeWidth, height: height - 4, fill: stripeColor }))
  }

  if (hasBlueAccentBar) {
    els.push(h('rect', { x: x + 2, y: y + height - 8, width: width - 4, height: 2, fill: accentColor }))
  }

  const textX = x + stripeWidth + 2.5

  // 品牌 LOGO 矢量图（替代纯文字）
  // 根据 logoText 推断品牌 key，若有矢量 LOGO 则绘制矢量图形，否则回退文字
  // LOGO 绘图区高度固定为 10 个单位（品牌区顶部），保持与面板高度无关的紧凑比例
  const brandKey = (logoText || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const logoBoxH = Math.min(8, height - 8)
  const logoEl = renderBrandLogo(h, brandKey, x + stripeWidth + 1.5, y + 2, width, logoBoxH, { stripeColor, accentColor })
  if (logoEl) {
    els.push(logoEl)
  } else {
    els.push(h('text', {
      x: textX, y: y + 9,
      'font-size': textFontSize,
      'font-weight': textBold ? 'bold' : 'normal',
      fill: textColor,
      'font-family': 'Arial, Helvetica, sans-serif',
      'letter-spacing': logoText.length <= 4 ? '0.5' : '0'
    }, logoText))
  }

  let modelTextEl = h('text', {
    x: textX, y: y + 12,
    'font-size': modelFontSize,
    fill: modelColor,
    'font-family': 'Arial, sans-serif'
  }, (modelName || '').toUpperCase().slice(0, 22))

  // 若指定了最大宽度（如避免遮住右侧状态灯），用 clipPath 裁剪型号文本
  if (modelClipMaxX != null && modelClipMaxX > textX) {
    const clipId = 'brand-clip-' + (++_brandClipId)
    els.push(h('clipPath', { id: clipId }, [
      h('rect', { x: textX, y: y + 8, width: modelClipMaxX - textX, height: 8 })
    ]))
    modelTextEl = h('g', { clipPath: `url(#${clipId})` }, [modelTextEl])
  }
  els.push(modelTextEl)

  // 类型文字左下角，前面加设备名称（如「内网 Switch」「网关 Router」）
  const typeLabel = deviceName ? (String(deviceName) + ' ' + typeText) : typeText
  els.push(h('text', {
    x: textX, y: y + height - 4,
    'font-size': 3.5,
    fill: typeColor,
    'font-family': 'Arial, sans-serif'
  }, typeLabel))

  els.push(h('line', { x1: x, y1: y + height / 2, x2: x + width + 2, y2: y + height / 2, stroke: '#252525', 'stroke-width': 0.3 }))

  return els
}

// ===== 状态指示灯 =====
function renderStatusLED(x, y, color, label) {
  return h('g', { style: { pointerEvents: 'none' } }, [
    h('circle', { cx: x, cy: y, r: 1, fill: color, stroke: '#0a0a0a', 'stroke-width': 0.15 }),
    h('circle', { cx: x, cy: y, r: 1.7, fill: color, opacity: 0.25 }),
    ...(label ? [h('text', { x, y: y + 3.5, 'font-size': 2.5, fill: '#888', 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif' }, label)] : []),
  ])
}

// ===== 设备状态灯颜色规范 =====
// PWR 电源：在线（通电）→ 绿；离线断电 → 灰灭
// SYS 系统：正常 → 绿；警告 → 黄/橙；告警 → 红；离线 → 灰灭
// STAT/ACT/ALM 状态灯：正常 → 绿；警告 → 黄/橙；告警 → 红；离线 → 灰灭
function ledColor(status, type) {
  const offline = status === 'offline'
  if (type === 'pwr') return offline ? '#555555' : '#22aa44'
  if (offline) return '#555555'
  if (status === 'alarm') return '#ee3333'
  if (status === 'warning') return '#ffaa00'
  return '#22aa44'
}

// ===== 状态灯组统一 Y（所有面板垂直居中对齐，避免高低不一）=====
function statusLEDY(height) {
  return height / 2 - 2
}

// ===== RJ45 端口（带绿/橙双LED）=====
function renderRJ45Port(x, y, active, ledPosition) {
  const PW = RJ45_W, PH = RJ45_H
  const isTop = ledPosition === 'top'
  const ledW = PW * 0.15, ledH = PH * 0.14
  const leftLedX = x + PW * 0.12
  const rightLedX = x + PW * 0.73
  const ledY = y + PH * 0.16

  const greenFill = active ? '#00dd00' : '#1a1a1a'
  const orangeFill = active ? '#ffbb00' : '#1a1a1a'

  const innerH = PH - 2.5

  const portContent = h('g', {}, [
    h('rect', { x, y, width: PW, height: PH, fill: '#2a2a2a', stroke: '#0a0a0a', 'stroke-width': 0.3, rx: 0.3 }),
    h('rect', { x: x + 1, y: y + 1, width: PW - 2, height: innerH, fill: '#0a0a0a' }),
    h('rect', {
      x: leftLedX, y: ledY, width: ledW, height: ledH, rx: 0.2,
      fill: greenFill, stroke: '#0a0a0a', 'stroke-width': 0.1,
      class: active ? 'rj45-led rj45-led-green' : 'rj45-led-off'
    }),
    h('rect', {
      x: rightLedX, y: ledY, width: ledW, height: ledH, rx: 0.2,
      fill: orangeFill, stroke: '#0a0a0a', 'stroke-width': 0.1,
      class: active ? 'rj45-led rj45-led-orange' : 'rj45-led-off'
    }),
    ...(active ? [
      h('rect', {
        x: leftLedX - 0.2, y: ledY - 0.12, width: ledW + 0.4, height: ledH + 0.24, rx: 0.25,
        fill: '#00dd00', opacity: 0.2, class: 'rj45-led-glow-green'
      }),
      h('rect', {
        x: rightLedX - 0.2, y: ledY - 0.12, width: ledW + 0.4, height: ledH + 0.24, rx: 0.25,
        fill: '#ffbb00', opacity: 0.2, class: 'rj45-led-glow-orange'
      }),
    ] : []),
  ])

  if (isTop) {
    return portContent
  } else {
    const centerX = x + PW / 2
    const centerY = y + PH / 2
    return h('g', { transform: `rotate(180, ${centerX}, ${centerY})` }, [portContent])
  }
}

// ===== SFP 光口 =====
// 参考用户需求：光口与面板主体同色（深灰 #1a1a1a），靠内部黑色通槽 + 轮廓描边区分，
// 尺寸略大于 RJ45 电口（11x9 vs 10x8），低调不突兀。
function renderSFPPort(x, y, active, label) {
  const PW = SFP_W, PH = SFP_H
  const slotFill = active ? '#181828' : '#0a0a0a'
  return h('g', {}, [
    // 深灰外框（与面板主体同色）
    h('rect', {
      x, y, width: PW, height: PH,
      fill: '#1a1a1a', stroke: '#333', 'stroke-width': 0.5, rx: 0.5
    }),
    // 内部横向通槽（黑色，光模块插拔口）
    h('rect', {
      x: x + 0.8, y: y + PH * 0.24, width: PW - 1.6, height: PH * 0.5,
      fill: slotFill, rx: 0.3
    }),
    // 通槽上下细描边，强化轮廓
    h('line', { x1: x + 0.8, y1: y + PH * 0.24, x2: x + PW - 0.8, y2: y + PH * 0.24, stroke: '#0a0a0a', 'stroke-width': 0.3 }),
    h('line', { x1: x + 0.8, y1: y + PH * 0.74, x2: x + PW - 0.8, y2: y + PH * 0.74, stroke: '#0a0a0a', 'stroke-width': 0.3 }),
    // 左右两端限位凸起
    h('rect', { x: x + 1, y: y + PH * 0.24, width: 0.9, height: PH * 0.5, fill: '#262626' }),
    h('rect', { x: x + PW - 1.9, y: y + PH * 0.24, width: 0.9, height: PH * 0.5, fill: '#262626' }),
    ...(label ? [
      h('text', { x: x + PW / 2, y: y + PH + 1.5, 'font-size': 1.6, fill: '#999', 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif' }, label)
    ] : []),
  ])
}

// ===== 硬盘托架 =====
function renderHDDBay(x, y, width, height, active, status, label) {
  return h('g', { style: { pointerEvents: 'none' } }, [
    h('rect', { x, y, width, height, fill: '#222', stroke: '#333', 'stroke-width': 0.3, rx: 0.3 }),
    h('rect', { x: x + 1, y: y + 0.5, width: width - 2, height: height * 0.55, fill: '#111' }),
    h('rect', {
      x: x + width - 2.5, y: y + 1, width: 1.5, height: 1,
      fill: active ? (status === 'alarm' ? '#ee3333' : '#22aa44') : '#3a3a3a'
    }),
    h('rect', {
      x: x + width - 4.5, y: y + 1, width: 1.5, height: 1,
      fill: active ? '#ffaa00' : '#3a3a3a'
    }),
    ...(label ? [
      h('text', { x: x + 1.5, y: y + height - 1.5, 'font-size': 1.8, fill: '#888', 'font-family': 'Arial, sans-serif' }, label)
    ] : []),
  ])
}

// ===== 电源指示灯（设备右上角）=====
function renderPowerIndicator(width, height, isOnline) {
  const indicatorX = width - RACK_EAR_W - 6
  const indicatorY = 6
  const color = isOnline ? '#22aa44' : '#ee3333'
  return h('g', { style: { pointerEvents: 'none' } }, [
    h('circle', { cx: indicatorX, cy: indicatorY, r: 3.5, fill: '#1a1a1a', stroke: '#0a0a0a', 'stroke-width': 0.4 }),
    h('circle', { cx: indicatorX, cy: indicatorY, r: 2.5, fill: color }),
    ...(isOnline ? [
      h('circle', { cx: indicatorX, cy: indicatorY, r: 3.5, fill: color, opacity: 0.3 }),
    ] : []),
  ])
}

const PORT_LABEL_FONT_SIZE = 3.0
const PORT_LABEL_COLOR = '#c0c0c0'
const PORT_LABEL_COLOR_BELOW = '#b0b0b0'
const TRIANGLE_COLOR = '#888'
const TRIANGLE_W = 2
const TRIANGLE_H = 1.5
const PORT_GAP_TO_TRIANGLE = 0.5
const TEXT_TO_TRIANGLE_GAP = 0.5

function renderPortLabel(cx, portTopY, portNum, isTop, onDblclick) {
  const triBottomY = portTopY - PORT_GAP_TO_TRIANGLE
  const triY = triBottomY - TRIANGLE_H
  const textY = triY - TEXT_TO_TRIANGLE_GAP
  const textX = cx
  const triCx = cx
  const displayText = String(portNum)
  return h('g', {}, [
    h('text', {
      x: textX, y: textY,
      'font-size': PORT_LABEL_FONT_SIZE, fill: PORT_LABEL_COLOR,
      'text-anchor': 'middle', 'font-family': 'Arial, sans-serif',
      style: 'cursor: pointer',
      onDblclick: (e) => {
        e.stopPropagation()
        if (onDblclick) onDblclick()
      }
    }, displayText),
    h('polygon', {
      points: isTop
        ? `${triCx - TRIANGLE_W / 2},${triY + TRIANGLE_H} ${triCx + TRIANGLE_W / 2},${triY + TRIANGLE_H} ${triCx},${triY}`
        : `${triCx - TRIANGLE_W / 2},${triY} ${triCx + TRIANGLE_W / 2},${triY} ${triCx},${triY + TRIANGLE_H}`,
      fill: TRIANGLE_COLOR,
      style: { pointerEvents: 'none' }
    })
  ])
}

function renderSinglePortLabel(cx, portY, portNum, labelBelow, onDblclick, customColor) {
  const textY = labelBelow ? portY + RJ45_H + 2.5 : portY - 1.5
  const displayText = String(portNum)
  return h('text', {
    x: cx, y: textY,
    'font-size': PORT_LABEL_FONT_SIZE, fill: customColor || (labelBelow ? PORT_LABEL_COLOR_BELOW : PORT_LABEL_COLOR),
    'text-anchor': 'middle', 'font-family': 'Arial, sans-serif',
    style: 'cursor: pointer',
    onDblclick: (e) => {
      e.stopPropagation()
      if (onDblclick) onDblclick()
    }
  }, displayText)
}

// ===== 交换机端口区 =====
function renderSwitchPorts(contentW, height, device, emit, portStateStore, portStartX) {
  const els = []
  const portCfg = getDevicePortConfig(device)
  const { rj45Count, sfpCount, groups, hasConsole } = portCfg
  const isOffline = device && device.status === 'offline'
  const portNames = device?.portNames || {}
  const deviceId = device?.id

  const getPortDisplayName = (portNum) => {
    const customName = portNames[`eth${portNum}`]
    return customName || String(portNum)
  }

  const handlePortNameEdit = async (portNum) => {
    const current = portNames[`eth${portNum}`] || ''
    try {
      const { value } = await ElMessageBox.prompt(`编辑端口 ${portNum} 名称`, '端口名称', {
        inputValue: current,
        confirmButtonText: '确定',
        cancelButtonText: '取消'
      })
      if (!device.portNames) device.portNames = {}
      device.portNames[`eth${portNum}`] = value
    } catch (e) { /* 用户取消 */ }
  }

  const startX = portStartX != null ? portStartX : 68
  const portAreaTotalH = RJ45_SPACING_Y + RJ45_H
  const labelAreaH = PORT_LABEL_FONT_SIZE + TEXT_TO_TRIANGLE_GAP + TRIANGLE_H + PORT_GAP_TO_TRIANGLE
  const twoRowNeed = portAreaTotalH + labelAreaH + 4
  const actualTwoRow = height >= twoRowNeed

  let topRowY, bottomRowY, singleRowY
  if (actualTwoRow) {
    topRowY = (height - portAreaTotalH) / 2
    bottomRowY = topRowY + RJ45_SPACING_Y
  } else {
    singleRowY = (height - RJ45_H) / 2
    topRowY = singleRowY
    bottomRowY = singleRowY
  }

  const labelTopY = actualTwoRow ? (topRowY - PORT_GAP_TO_TRIANGLE - TRIANGLE_H - TEXT_TO_TRIANGLE_GAP - PORT_LABEL_FONT_SIZE - 1) : (singleRowY - PORT_LABEL_FONT_SIZE - 2)
  const sepLineTop = labelTopY - 0.5
  const sepLineBottom = actualTwoRow ? bottomRowY + RJ45_H + 1 : singleRowY + RJ45_H + 1

  let nextPortX = startX
  if (hasConsole && rj45Count > 0) {
    const consoleActive = false
    const consoleCenterX = nextPortX + RJ45_W / 2
    const consoleCenterY = height / 2
    const consolePortX = nextPortX
    const consolePortY = height / 2 - RJ45_H / 2
    const consolePortGroup = h('g', {
      style: 'cursor: pointer',
      onClick: (e) => {
        e.stopPropagation()
        emit('port-click', { deviceId: device.id, device, portId: 'console', portNum: 'CON', portType: 'console', portName: 'Console' })
      },
      onMouseenter: (e) => {
        e.stopPropagation()
        emit('port-hover', { deviceId: device.id, device, portId: 'console', portNum: 'CON', portType: 'console', portName: 'Console', clientX: e.clientX, clientY: e.clientY })
      },
      onMouseleave: (e) => {
        e.stopPropagation()
        emit('port-leave')
      }
    }, [
      h('g', { transform: `rotate(180, ${consoleCenterX}, ${consoleCenterY})` }, [
        renderRJ45Port(nextPortX, height / 2 - RJ45_H / 2, consoleActive, 'top'),
      ]),
      h('text', {
        x: nextPortX + RJ45_W / 2, y: height / 2 - RJ45_H / 2 + RJ45_H + 3.5,
        'font-size': 2, fill: '#b0b0b0', 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif', 'font-weight': 'bold'
      }, 'Console'),
    ])
    els.push(consolePortGroup)
    nextPortX += RJ45_W + 3
    els.push(h('line', { x1: nextPortX + 2, y1: sepLineTop, x2: nextPortX + 2, y2: sepLineBottom, stroke: '#2a2a2a', 'stroke-width': 0.3 }))
    nextPortX += 5
  }

  let portOffset = 0
  let currentX = nextPortX

  for (let g = 0; g < groups.length; g++) {
    const groupSize = groups[g]
    const sfpReserve = sfpCount > 0 ? sfpCount * SFP_SPACING + 10 : 0
    const groupNeedW = groupSize * RJ45_SPACING_X
    if (currentX + groupNeedW > contentW - sfpReserve) break
    if (g > 0) {
      els.push(h('line', { x1: currentX - 1.5, y1: sepLineTop, x2: currentX - 1.5, y2: sepLineBottom, stroke: '#2a2a2a', 'stroke-width': 0.3 }))
      currentX += 1
    }
    for (let col = 0; col < groupSize; col++) {
      const px = currentX + col * RJ45_SPACING_X
      const portCenterX = px + RJ45_W / 2
      const localIndex = col + 1
      const topNumber = portOffset + localIndex * 2
      const bottomNumber = portOffset + localIndex * 2 - 1

      if (actualTwoRow) {
        const bottomLabelCx = px + RJ45_W / 4
        const topLabelCx = px + 3 * RJ45_W / 4
        els.push(renderPortLabel(bottomLabelCx, topRowY, getPortDisplayName(bottomNumber), false, () => handlePortNameEdit(bottomNumber)))
        els.push(renderPortLabel(topLabelCx, topRowY, getPortDisplayName(topNumber), true, () => handlePortNameEdit(topNumber)))
      } else {
        els.push(renderSinglePortLabel(portCenterX, singleRowY, getPortDisplayName(topNumber), false, () => handlePortNameEdit(topNumber)))
      }

      const topActive = !isOffline && (portCfg.connectedPortSet.has(topNumber) || (portStateStore && portStateStore.isPortOccupied(deviceId, 'eth' + topNumber)))
      const topDisplayText = getPortDisplayName(topNumber)
      const topPortY = actualTwoRow ? topRowY : singleRowY
      els.push(h('g', {
        style: 'cursor: pointer',
        'data-port-id': `eth${topNumber}`,
        'data-port-num': topNumber,
        'data-port-type': 'ethernet',
        'data-port-name': topDisplayText,
        onClick: (e) => {
          e.stopPropagation()
          emit('port-click', { deviceId: device.id, device, portId: `eth${topNumber}`, portNum: topNumber, portType: 'ethernet', portName: topDisplayText })
        },
        onMouseenter: (e) => {
          e.stopPropagation()
          emit('port-hover', { deviceId: device.id, device, portId: `eth${topNumber}`, portNum: topNumber, portType: 'ethernet', portName: topDisplayText, clientX: e.clientX, clientY: e.clientY })
        },
        onMouseleave: (e) => {
          e.stopPropagation()
          emit('port-leave')
        }
      }, [
        renderRJ45Port(px, topPortY, topActive, actualTwoRow ? 'top' : 'bottom')
      ]))

      if (actualTwoRow) {
        const bottomActive = !isOffline && (portCfg.connectedPortSet.has(bottomNumber) || (portStateStore && portStateStore.isPortOccupied(deviceId, 'eth' + bottomNumber)))
        const bottomDisplayText = getPortDisplayName(bottomNumber)
        els.push(h('g', {
          style: 'cursor: pointer',
          'data-port-id': `eth${bottomNumber}`,
          'data-port-num': bottomNumber,
          'data-port-type': 'ethernet',
          'data-port-name': bottomDisplayText,
          onClick: (e) => {
            e.stopPropagation()
            emit('port-click', { deviceId: device.id, device, portId: `eth${bottomNumber}`, portNum: bottomNumber, portType: 'ethernet', portName: bottomDisplayText })
          },
          onMouseenter: (e) => {
            e.stopPropagation()
            emit('port-hover', { deviceId: device.id, device, portId: `eth${bottomNumber}`, portNum: bottomNumber, portType: 'ethernet', portName: bottomDisplayText, clientX: e.clientX, clientY: e.clientY })
          },
          onMouseleave: (e) => {
            e.stopPropagation()
            emit('port-leave')
          }
        }, [
          renderRJ45Port(px, bottomRowY, bottomActive, 'bottom')
        ]))
      }
    }
    if (actualTwoRow) portOffset += 2 * groupSize
    else portOffset += groupSize
    currentX += groupSize * RJ45_SPACING_X + 1
  }

  if (sfpCount > 0) {
    currentX += 3
    els.push(h('line', { x1: currentX, y1: sepLineTop, x2: currentX, y2: sepLineBottom, stroke: '#2a2a2a', 'stroke-width': 0.3 }))
    currentX += 2
    const sfpY = actualTwoRow ? (topRowY + bottomRowY + RJ45_H) / 2 - SFP_H / 2 : height / 2 - SFP_H / 2
    const sfpLabelY = actualTwoRow ? labelTopY + 3 : (singleRowY - 2)
    els.push(h('text', { x: currentX, y: sfpLabelY, 'font-size': 2.6, fill: '#a0a0a0', 'font-family': 'Arial, sans-serif', 'font-weight': 'bold' }, 'SFP'))
    for (let i = 0; i < sfpCount; i++) {
      const sx = currentX + i * SFP_SPACING
      const sfpNum = i + 1
      const sfpActive = !isOffline && (portCfg.connectedPortSet.has('SFP-' + sfpNum) || portCfg.connectedPortSet.has(sfpNum) || (portStateStore && portStateStore.isPortOccupied(deviceId, 'sfp' + sfpNum)))
      els.push(h('g', {
        style: 'cursor: pointer',
        onClick: (e) => {
          e.stopPropagation()
          emit('port-click', {
            deviceId: device.id,
            device: device,
            portId: `sfp${sfpNum}`,
            portNum: sfpNum,
            portType: 'sfp',
            portName: `SFP${sfpNum}`
          })
        },
        onMouseenter: (e) => {
          e.stopPropagation()
          emit('port-hover', { deviceId: device.id, device, portId: `sfp${sfpNum}`, portNum: sfpNum, portType: 'sfp', portName: `SFP${sfpNum}`, clientX: e.clientX, clientY: e.clientY })
        },
        onMouseleave: (e) => {
          e.stopPropagation()
          emit('port-leave')
        }
      }, [
        renderSFPPort(sx, sfpY, sfpActive, String(sfpNum))
      ]))
    }
  }
  return els
}

// ===== 交换机面板 =====
function renderSwitchPanel(width, height, devColor, contentW, device, emit, portStateStore) {
  const brandCfg = getBrandStyleConfig(device?.vendor || device?.brand, 'switch')
  const brandColor = brandCfg.accentColor
  const modelName = (device?.model || 'S5720-28X').toUpperCase()
  const isOnline = device && device.status !== 'offline'

  const els = [
    h('rect', { x: 0, y: 0, width, height, fill: brandCfg.panelFrame, stroke: brandColor, 'stroke-width': 0.8, filter: 'url(#deviceShadow)' }),
    h('rect', { x: 1, y: 1, width: width - 2, height: height - 2, fill: brandCfg.panelBody }),
    h('line', { x1: 1, y1: 1.5, x2: width - 1, y2: 1.5, stroke: '#333', 'stroke-width': 0.3 }),
    h('line', { x1: 1, y1: height - 1.5, x2: width - 1, y2: height - 1.5, stroke: '#050505', 'stroke-width': 0.3 }),
    // 电源指示灯
    renderPowerIndicator(width, height, isOnline),
  ]

  const brandAreaWidth = brandCfg.brandWidth
  const controlX = 32
  const powerButtonX = controlX
  const ledGroupX = controlX + 10
  const portStartX = brandAreaWidth + 6

  const clipId = `switch-clip-${device.id || 'sw'}`
  els.push(h('g', { transform: `translate(${RACK_EAR_W}, 0)` }, [
    h('clipPath', { id: clipId }, [h('rect', { x: 0, y: 0, width: contentW, height })]),
    h('g', { clipPath: `url(#${clipId})` }, [
      ...renderBrandArea(0, 0, brandAreaWidth, height, brandCfg, modelName, ledGroupX - 2, device?.name),
      renderPowerButton(powerButtonX, height / 2, device.status !== 'offline', () => emit('power-toggle', { deviceId: device.id, device })),
      h('g', { transform: `translate(${ledGroupX}, ${statusLEDY(height)})` }, [
        renderStatusLED(0, 0, ledColor(device.status, 'pwr'), 'PWR'),
        renderStatusLED(8, 0, ledColor(device.status, 'sys'), 'SYS'),
        renderStatusLED(16, 0, ledColor(device.status, 'stat'), 'STAT'),
      ]),
      h('rect', { x: portStartX, y: 2, width: contentW - portStartX - 2, height: height - 4, fill: brandCfg.panelBody }),
      ...renderSwitchPortsCustom(contentW, height, device, emit, portStateStore, portStartX),
    ]),
  ]))
  return els
}

function renderSwitchPortsCustom(contentW, height, device, emit, portStateStore, portStartX) {
  return renderSwitchPorts(contentW, height, device, emit, portStateStore, portStartX)
}

// ===== 服务器面板 =====
function renderServerDrives(contentW, height, device) {
  const els = []
  const is2U = height > 30
  const driveStartX = Math.min(138, contentW * 0.44)
  const driveAreaWidth = contentW - driveStartX - 2
  const cols = Math.max(4, Math.min(10, Math.floor(driveAreaWidth / (HDD25_W + 2))))
  const rows = is2U ? 2 : 1
  const spacing = driveAreaWidth / cols

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      const dx = driveStartX + c * spacing + (spacing - HDD25_W) / 2
      const dy = 4 + r * ((height - 6) / rows) + (((height - 6) / rows - HDD25_H) / 2)
      els.push(renderHDDBay(dx, dy, HDD25_W, HDD25_H, true, 'normal', String(idx + 1)))
    }
  }

  if (is2U) {
    els.push(h('g', { transform: `translate(${contentW - 12}, ${height / 2 + 2})` }, [
      h('rect', { x: 0, y: 0, width: 5, height: 3.5, fill: '#1a1a1a', stroke: '#333', 'stroke-width': 0.2, rx: 0.3 }),
      h('circle', { cx: 1.5, cy: 1.7, r: 0.3, fill: '#444' }),
      h('circle', { cx: 2.5, cy: 1.7, r: 0.3, fill: '#444' }),
      h('circle', { cx: 3.5, cy: 1.7, r: 0.3, fill: '#444' }),
      h('rect', { x: 7, y: 0, width: 5, height: 3.5, fill: '#1a1a1a', stroke: '#333', 'stroke-width': 0.2, rx: 0.3 }),
      h('line', { x1: 9.5, y1: 0.5, x2: 9.5, y2: 3, stroke: '#555', 'stroke-width': 0.3 }),
    ]))
  }
  return els
}

function renderServerPanel(width, height, devColor, contentW, device) {
  const vColor = getVendorColor(device?.vendor || device?.brand)
  const brandColor = vColor.primary
  const brandName = (device?.vendor || device?.brand || 'DELL').toUpperCase().slice(0, 10)
  const modelName = (device?.model || 'R740xd').toUpperCase()

  const els = [
    h('rect', { x: 0, y: 0, width, height, fill: '#1a1a1a', stroke: brandColor, 'stroke-width': 0.8, filter: 'url(#deviceShadow)' }),
    h('rect', { x: 1, y: 1, width: width - 2, height: height - 2, fill: '#222' }),
    h('line', { x1: 1, y1: 1.5, x2: width - 1, y2: 1.5, stroke: '#3a3a3a', 'stroke-width': 0.3 }),
  ]

  const clipId = `svr-clip-${device.id || 'svr'}`
  els.push(h('g', { transform: `translate(${RACK_EAR_W}, 0)` }, [
    h('clipPath', { id: clipId }, [h('rect', { x: 0, y: 0, width: contentW, height })]),
    h('g', { clipPath: `url(#${clipId})` }, [
      h('rect', { x: 0, y: 2, width: Math.min(60, contentW * 0.18), height: height - 4, fill: '#0a0a0a', stroke: '#2a2a2a', 'stroke-width': 0.3 }),
      ...Array.from({ length: Math.floor((height - 6) / 2.2) }).map((_, i) =>
        h('line', { key: `sv-${i}`, x1: 2, y1: 4 + i * 2.2, x2: Math.min(58, contentW * 0.18 - 2), y2: 4 + i * 2.2, stroke: '#1a1a1a', 'stroke-width': 1.2 })
      ),
      ...Array.from({ length: 5 }).map((_, i) =>
        h('line', { key: `svv-${i}`, x1: 4 + i * 10, y1: 4, x2: 4 + i * 10, y2: height - 4, stroke: '#0a0a0a', 'stroke-width': 0.2 })
      ),
      h('rect', { x: Math.min(65, contentW * 0.22), y: 3, width: 36, height: height - 6, fill: '#181818', stroke: '#2a2a2a', 'stroke-width': 0.3 }),
      h('rect', { x: Math.min(65, contentW * 0.22), y: 3, width: 1.5, height: height - 6, fill: brandColor }),
      h('text', { x: Math.min(65, contentW * 0.22) + 18, y: height / 2 - 2, 'font-size': 6, 'font-weight': 'bold', fill: brandColor, 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif' }, brandName),
      h('text', { x: Math.min(65, contentW * 0.22) + 18, y: height / 2 + 4, 'font-size': 4.5, fill: '#888', 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif' }, modelName),
      h('rect', { x: Math.min(65, contentW * 0.22) + 2, y: height - 8, width: 32, height: 1, fill: '#2a2a2a' }),
      h('g', { transform: `translate(${Math.min(112, contentW * 0.38)}, ${statusLEDY(height)})` }, [
        renderPowerButton(0, 0, device.status !== 'offline'),
        renderStatusLED(10, 0, ledColor(device.status, 'sys'), 'MGMT'),
        renderStatusLED(20, 0, ledColor(device.status, 'stat'), 'HEALTH'),
      ]),
      ...renderServerDrives(contentW, height, device),
    ]),
  ]))
  return els
}

// ===== 防火墙面板 =====
// ===== 2U 通用面板（防火墙/密码机/网闸等端口较少设备，uSize>=2 或 height>=50）=====
// 设计规范见 docs/DEVICE_PANEL_2U_STYLE.md：
//   布局 = 品牌区 | 管理区(电源/LED/MGMT/Console) | 上排 RJ45(GE) | 下排 SFP | 风扇区
//   端口样式与 1U 完全一致（RJ45 10x8 双LED / SFP 11.5x9 金属框黑槽）
function renderU2DevicePanel(width, height, devColor, contentW, device, emit, portStateStore, kind) {
  const brandCfg = getBrandStyleConfig(device?.vendor || device?.brand, kind || 'firewall')
  const brandColor = brandCfg.accentColor
  const modelName = (device?.model || (kind === 'router' ? 'USG6600E' : 'SecPath F5000')).toUpperCase()
  const portCfg = getDevicePortConfig(device)
  const isOffline = device && device.status === 'offline'
  const isOnline = device && device.status !== 'offline'
  const portNames = device?.portNames || {}
  const deviceId = device?.id
  const rjCount = Math.min(portCfg.rj45Count || 8, 8)
  const sfpCount = Math.min(portCfg.sfpCount || 4, 8)

  const els = [
    h('rect', { x: 0, y: 0, width, height, fill: brandCfg.panelFrame, stroke: brandColor, 'stroke-width': 0.8, filter: 'url(#deviceShadow)' }),
    h('rect', { x: 1, y: 1, width: width - 2, height: height - 2, fill: brandCfg.panelBody }),
    h('line', { x1: 1, y1: 1.5, x2: width - 1, y2: 1.5, stroke: '#333', 'stroke-width': 0.3 }),
    // 中部横分隔线（2U 特征）
    h('line', { x1: 1, y1: height / 2, x2: width - 1, y2: height / 2, stroke: '#252525', 'stroke-width': 0.3 }),
    renderPowerIndicator(width, height, !isOffline),
  ]

  const brandW = brandCfg.brandWidth
  const controlX = brandW + 4
  const ledGroupX = controlX + 10
  const portStartX = controlX + 40  // 管理口区之后

  els.push(h('g', { transform: `translate(${RACK_EAR_W}, 0)` }, [
    h('clipPath', { id: `u2-clip-${device.id || 'u2'}` }, [h('rect', { x: 0, y: 0, width: contentW, height })]),
    h('g', { clipPath: `url(#u2-clip-${device.id || 'u2'})` }, [
      // 品牌区（2U 整高）
      ...renderBrandArea(0, 0, brandCfg.brandWidth, height, brandCfg, modelName, ledGroupX - 2, device?.name),
      // 电源按钮 + 状态灯（管理区）
      renderPowerButton(controlX, height * 0.28, !isOffline, () => emit('power-toggle', { deviceId: device.id, device })),
      h('g', { transform: `translate(${ledGroupX}, ${height * 0.28})` }, [
        renderStatusLED(0, 0, ledColor(device.status, 'pwr'), 'PWR'),
        renderStatusLED(8, 0, ledColor(device.status, 'sys'), 'SYS'),
        renderStatusLED(16, 0, ledColor(device.status, 'stat'), 'ALM'),
        renderStatusLED(24, 0, ledColor(device.status, 'stat'), 'HA'),
      ]),
      // MGMT 管理口 + Console（管理区，竖排两行）
      ...renderMgmtPorts(controlX + 12, height, device, emit, isOffline),
      // 风扇区（右端，2U 防火墙 2 风扇）
      ...renderFanZone(contentW, height),
      // 上排 RJ45（GE 业务口）
      ...renderU2RjPorts(portStartX, contentW, height, rjCount, device, emit, portStateStore, isOffline),
      // 下排 SFP（光口）
      ...renderU2SfpRow(portStartX, height, sfpCount, device, emit, portStateStore, isOffline),
    ]),
  ]))
  return els
}

// 2U 面板 MGMT/Console 管理口（竖排两行）
function renderMgmtPorts(x, height, device, emit, isOffline) {
  const els = []
  const y1 = height * 0.08
  const y2 = height * 0.56
  const portY = (y) => y + (RJ45_H / 2 - 1)
  // MGMT
  const mgmtGroup = h('g', {
    style: 'cursor: pointer',
    onClick: (e) => { e.stopPropagation(); emit('port-click', { deviceId: device.id, device, portId: 'mgmt', portNum: 'MGMT', portType: 'mgmt', portName: 'MGMT' }) },
    onMouseenter: (e) => { e.stopPropagation(); emit('port-hover', { deviceId: device.id, device, portId: 'mgmt', portNum: 'MGMT', portType: 'mgmt', portName: 'MGMT', clientX: e.clientX, clientY: e.clientY }) },
    onMouseleave: (e) => { e.stopPropagation(); emit('port-leave') }
  }, [
    renderRJ45Port(x, portY(y1), !isOffline, 'top'),
  ])
  els.push(mgmtGroup)
  els.push(h('text', { x: x + RJ45_W / 2, y: portY(y1) - 1, 'font-size': 2.2, fill: '#6699cc', 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif' }, 'MGMT'))
  // Console
  const consoleCenterX = x + RJ45_W / 2
  const consoleCenterY = portY(y2) + RJ45_H / 2
  const consoleGroup = h('g', {
    style: 'cursor: pointer',
    onClick: (e) => { e.stopPropagation(); emit('port-click', { deviceId: device.id, device, portId: 'console', portNum: 'CON', portType: 'console', portName: 'Console' }) },
    onMouseenter: (e) => { e.stopPropagation(); emit('port-hover', { deviceId: device.id, device, portId: 'console', portNum: 'CON', portType: 'console', portName: 'Console', clientX: e.clientX, clientY: e.clientY }) },
    onMouseleave: (e) => { e.stopPropagation(); emit('port-leave') }
  }, [
    h('g', { transform: `rotate(180, ${consoleCenterX}, ${consoleCenterY})` }, [
      renderRJ45Port(x, portY(y2), false, 'normal'),
    ]),
  ])
  els.push(consoleGroup)
  els.push(h('text', { x: x + RJ45_W / 2, y: portY(y2) + RJ45_H + 2.5, 'font-size': 1.8, fill: '#888', 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif' }, 'Console'))
  return els
}

// 2U 上排 RJ45 业务口（编号 + GE 标签）
function renderU2RjPorts(startX, contentW, height, rjCount, device, emit, portStateStore, isOffline) {
  const els = []
  const y = height * 0.14
  const portNames = device?.portNames || {}
  const deviceId = device?.id
  const getPortDisplayName = (n) => portNames[`eth${n}`] || String(n)
  const spacing = Math.max(RJ45_SPACING_X, (contentW - startX - 20) / Math.max(rjCount, 1))
  for (let i = 0; i < rjCount; i++) {
    const x = startX + i * spacing
    const n = i + 1
    const display = getPortDisplayName(n)
    const active = !isOffline && (portStateStore && portStateStore.isPortOccupied(deviceId, 'eth' + n))
    els.push(h('text', { x: x + RJ45_W / 2, y: y - 4.5, 'font-size': PORT_LABEL_FONT_SIZE, fill: PORT_LABEL_COLOR, 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif' }, display))
    els.push(h('g', {
      style: 'cursor: pointer',
      onClick: (e) => { e.stopPropagation(); emit('port-click', { deviceId: device.id, device, portId: `eth${n}`, portNum: n, portType: 'ethernet', portName: display }) },
      onMouseenter: (e) => { e.stopPropagation(); emit('port-hover', { deviceId: device.id, device, portId: `eth${n}`, portNum: n, portType: 'ethernet', portName: display, clientX: e.clientX, clientY: e.clientY }) },
      onMouseleave: (e) => { e.stopPropagation(); emit('port-leave') }
    }, [renderRJ45Port(x, y, active, 'normal')]))
  }
  els.push(h('text', { x: startX + rjCount * spacing / 2 - RJ45_W / 2, y: y + RJ45_H + 4.5, 'font-size': 2.6, fill: '#a0a0a0', 'font-family': 'Arial, sans-serif', 'font-weight': 'bold' }, 'GE'))
  return els
}

// 2U 下排 SFP 光口
function renderU2SfpRow(startX, height, sfpCount, device, emit, portStateStore, isOffline) {
  const els = []
  const y = height * 0.58
  const deviceId = device?.id
  for (let i = 0; i < sfpCount; i++) {
    const x = startX + i * SFP_SPACING
    const n = i + 1
    const active = !isOffline && (portStateStore && portStateStore.isPortOccupied(deviceId, 'sfp' + n))
    els.push(h('text', { x: x + SFP_W / 2, y: y - 4.5, 'font-size': 2.4, fill: '#a0a0a0', 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif' }, String(n)))
    els.push(h('g', {
      style: 'cursor: pointer',
      onClick: (e) => { e.stopPropagation(); emit('port-click', { deviceId: device.id, device, portId: `sfp${n}`, portNum: n, portType: 'sfp', portName: `SFP${n}` }) },
      onMouseenter: (e) => { e.stopPropagation(); emit('port-hover', { deviceId: device.id, device, portId: `sfp${n}`, portNum: n, portType: 'sfp', portName: `SFP${n}`, clientX: e.clientX, clientY: e.clientY }) },
      onMouseleave: (e) => { e.stopPropagation(); emit('port-leave') }
    }, [renderSFPPort(x, y, active)]))
  }
  els.push(h('text', { x: startX + sfpCount * SFP_SPACING / 2 - SFP_W / 2, y: y + SFP_H + 4.5, 'font-size': 2.6, fill: '#a0a0a0', 'font-family': 'Arial, sans-serif', 'font-weight': 'bold' }, 'SFP'))
  return els
}

// 2U 右端风扇区
function renderFanZone(contentW, height) {
  const els = []
  const fanX = contentW - 18
  const fanR = 8
  ;[0, 1].forEach(i => {
    const fy = 8 + i * (height - 24)
    els.push(h('circle', { cx: fanX, cy: fy + 8, r: fanR, fill: '#0f0f0f', stroke: '#333', 'stroke-width': 0.5 }))
    els.push(h('circle', { cx: fanX, cy: fy + 8, r: fanR * 0.35, fill: '#222', stroke: '#444', 'stroke-width': 0.3 }))
    els.push(h('line', { x1: fanX - fanR + 2, y1: fy + 8, x2: fanX + fanR - 2, y2: fy + 8, stroke: '#333', 'stroke-width': 0.4 }))
    els.push(h('line', { x1: fanX, y1: fy + 8 - fanR + 2, x2: fanX, y2: fy + 8 + fanR - 2, stroke: '#333', 'stroke-width': 0.4 }))
  })
  return els
}

// 改造：renderFirewallPanel 在 2U 时走 2U 通用面板
function renderFirewallPanel(width, height, devColor, contentW, device, emit, portStateStore) {
  // 2U（及以上）防火墙/密码机/网闸等端口较少设备 → 2U 通用排版（docs/DEVICE_PANEL_2U_STYLE.md）
  if (height >= 50 || (device?.uSize || device?.u_height || 1) >= 2) {
    return renderU2DevicePanel(width, height, devColor, contentW, device, emit, portStateStore, 'firewall')
  }
  const brandCfg = getBrandStyleConfig(device?.vendor || device?.brand, 'firewall')
  const brandColor = brandCfg.accentColor
  const modelName = (device?.model || 'FG-600E').toUpperCase()
  const fwPortCfg = getDevicePortConfig(device)
  const isOffline = device && device.status === 'offline'
  const portNames = device?.portNames || {}
  const deviceId = device?.id
  const isOnline = device && device.status !== 'offline'

  const getPortDisplayName = (portNum) => {
    const customName = portNames[`port${portNum}`]
    return customName || String(portNum)
  }

  const handlePortNameEdit = async (portNum) => {
    const current = portNames[`port${portNum}`] || ''
    try {
      const { value } = await ElMessageBox.prompt(`编辑端口 ${portNum} 名称`, '端口名称', {
        inputValue: current,
        confirmButtonText: '确定',
        cancelButtonText: '取消'
      })
      if (!device.portNames) device.portNames = {}
      device.portNames[`port${portNum}`] = value
    } catch (e) { /* 用户取消 */ }
  }

  const els = [
    h('rect', { x: 0, y: 0, width, height, fill: brandCfg.panelFrame, stroke: brandColor, 'stroke-width': 0.8, filter: 'url(#deviceShadow)' }),
    h('rect', { x: 1, y: 1, width: width - 2, height: height - 2, fill: brandCfg.panelBody }),
    h('line', { x1: 1, y1: 1.5, x2: width - 1, y2: 1.5, stroke: '#333', 'stroke-width': 0.3 }),
    // 电源指示灯
    renderPowerIndicator(width, height, isOnline),
  ]

  const clipId = `fw-clip-${device.id || 'fw'}`
  const fwRj45Count = Math.min(fwPortCfg.rj45Count || 8, 8)
  const brandAreaWidth = brandCfg.brandWidth
  const powerButtonX = 26
  const ledGroupX = 36
  const ventX = brandAreaWidth + 3
  const mgmtX = ventX + 13
  const portStartX = mgmtX + 28

  els.push(h('g', { transform: `translate(${RACK_EAR_W}, 0)` }, [
    h('clipPath', { id: clipId }, [h('rect', { x: 0, y: 0, width: contentW, height })]),
    h('g', { clipPath: `url(#${clipId})` }, [
      ...renderBrandArea(0, 0, brandAreaWidth, height, brandCfg, modelName, ledGroupX - 2, device?.name),
      renderPowerButton(powerButtonX, height / 2 - 1, device.status !== 'offline', () => emit('power-toggle', { deviceId: device.id, device })),
      h('g', { transform: `translate(${ledGroupX}, ${statusLEDY(height)})` }, [
        renderStatusLED(0, 0, ledColor(device.status, 'pwr'), 'PWR'),
        renderStatusLED(7, 0, ledColor(device.status, 'sys'), 'SYS'),
        renderStatusLED(14, 0, ledColor(device.status, 'stat'), 'ALM'),
        renderStatusLED(21, 0, ledColor(device.status, 'stat'), 'HA'),
      ]),
      h('rect', { x: ventX, y: 4, width: 10, height: height - 8, fill: '#0a0a0a' }),
      ...Array.from({ length: Math.max(0, Math.floor((height - 10) / 2)) }).map((_, i) =>
        h('line', { key: `fwv-${i}`, x1: ventX + 1, y1: 5 + i * 2, x2: ventX + 9, y2: 5 + i * 2, stroke: '#1a1a1a', 'stroke-width': 1 })
      ),
      h('g', { 
        style: 'cursor: pointer', 
        onClick: (e) => {
          e.stopPropagation()
          emit('port-click', { deviceId: device.id, device, portId: 'mgmt', portNum: 'MGMT', portType: 'mgmt', portName: 'MGMT' })
        },
        onMouseenter: (e) => {
          e.stopPropagation()
          emit('port-hover', { deviceId: device.id, device, portId: 'mgmt', portNum: 'MGMT', portType: 'mgmt', portName: 'MGMT', clientX: e.clientX, clientY: e.clientY })
        },
        onMouseleave: (e) => {
          e.stopPropagation()
          emit('port-leave')
        }
      }, [
        renderRJ45Port(mgmtX, height / 2 - RJ45_H / 2, !isOffline, 'top'),
      ]),
      h('text', { x: mgmtX + RJ45_W / 2, y: height / 2 - RJ45_H / 2 - 2, 'font-size': 2.2, fill: '#6699cc', 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif' }, 'MGMT'),
      h('g', { 
        style: 'cursor: pointer', 
        onClick: (e) => {
          e.stopPropagation()
          emit('port-click', { deviceId: device.id, device, portId: 'console', portNum: 'CON', portType: 'console', portName: 'Console' })
        },
        onMouseenter: (e) => {
          e.stopPropagation()
          emit('port-hover', { deviceId: device.id, device, portId: 'console', portNum: 'CON', portType: 'console', portName: 'Console', clientX: e.clientX, clientY: e.clientY })
        },
        onMouseleave: (e) => {
          e.stopPropagation()
          emit('port-leave')
        }
      }, [
        h('g', { transform: `rotate(180, ${mgmtX + 14 + RJ45_W / 2}, ${height / 2})` }, [
          renderRJ45Port(mgmtX + 14, height / 2 - RJ45_H / 2, false, 'top'),
        ]),
      ]),
      h('text', { x: mgmtX + 14 + RJ45_W / 2, y: height / 2 - RJ45_H / 2 + RJ45_H + 3.5, 'font-size': 2, fill: '#888', 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif' }, 'Console'),
      h('rect', { x: portStartX, y: 2, width: contentW - portStartX - 12, height: height - 4, fill: brandCfg.panelBody }),
      ...(() => {
        const fwPortY = (height - RJ45_H) / 2
        const sfpY = height / 2 - SFP_H / 2
        const portEls = []
        for (let i = 0; i < fwRj45Count; i++) {
          const rx = portStartX + i * RJ45_SPACING_X
          if (rx > contentW - fwPortCfg.sfpCount * SFP_SPACING - 15) break
          const portNum = i + 1
          const rActive = !isOffline && (fwPortCfg.connectedPortSet.has(portNum) || (portStateStore && (portStateStore.isPortOccupied(deviceId, 'port' + portNum) || portStateStore.isPortOccupied(deviceId, 'eth' + portNum))))
          const portDisplayText = getPortDisplayName(portNum)
          portEls.push(renderSinglePortLabel(rx + RJ45_W / 2, fwPortY, portDisplayText, true, () => handlePortNameEdit(portNum)))
          portEls.push(h('g', {
            key: `fw-port-${i}`,
            style: 'cursor: pointer',
            onClick: (e) => {
              e.stopPropagation()
              emit('port-click', { deviceId: device.id, device, portId: `port${portNum}`, portNum: portNum, portType: 'ethernet', portName: portDisplayText })
            },
            onMouseenter: (e) => {
              e.stopPropagation()
              emit('port-hover', { deviceId: device.id, device, portId: `port${portNum}`, portNum: portNum, portType: 'ethernet', portName: portDisplayText, clientX: e.clientX, clientY: e.clientY })
            },
            onMouseleave: (e) => {
              e.stopPropagation()
              emit('port-leave')
            }
          }, [
            renderRJ45Port(rx, fwPortY, rActive, 'top'),
          ]))
        }
        if (fwPortCfg.sfpCount > 0) {
          const sfpCount = Math.min(fwPortCfg.sfpCount, 4)
          portEls.push(h('text', { x: contentW - sfpCount * SFP_SPACING - 4, y: sfpY - 2, 'font-size': 2.6, fill: '#a0a0a0', 'font-family': 'Arial, sans-serif', 'font-weight': 'bold' }, 'SFP'))
          for (let i = 0; i < sfpCount; i++) {
            const rx2 = contentW - (sfpCount - i) * SFP_SPACING - 4
            const sfpNum = i + 1
            const rActive = !isOffline && (fwPortCfg.connectedPortSet.has('SFP-' + sfpNum) || (portStateStore && portStateStore.isPortOccupied(deviceId, 'sfp' + sfpNum)))
            portEls.push(h('g', {
              key: `fw-sfp-${i}`,
              style: 'cursor: pointer',
              onClick: (e) => {
                e.stopPropagation()
                emit('port-click', { deviceId: device.id, device, portId: `sfp${sfpNum}`, portNum: sfpNum, portType: 'sfp', portName: `SFP${sfpNum}` })
              },
              onMouseenter: (e) => {
                e.stopPropagation()
                emit('port-hover', { deviceId: device.id, device, portId: `sfp${sfpNum}`, portNum: sfpNum, portType: 'sfp', portName: `SFP${sfpNum}`, clientX: e.clientX, clientY: e.clientY })
              },
              onMouseleave: (e) => {
                e.stopPropagation()
                emit('port-leave')
              }
            }, [
              renderSFPPort(rx2, sfpY, rActive, String(sfpNum))
            ]))
          }
        }
        return portEls
      })(),
    ]),
  ]))
  return els
}

// ===== Console 端口（路由器用） =====
function renderConsolePort(x, y, active) {
  const innerH = RJ45_H - 2.5
  return [
    h('rect', { x, y, width: RJ45_W, height: RJ45_H, fill: '#2a2a2a', stroke: '#0a0a0a', 'stroke-width': 0.3, rx: 0.3 }),
    h('rect', { x: x + 1, y: y + 1, width: RJ45_W - 2, height: innerH, fill: '#0a0a0a' }),
    h('rect', { 'x': x + RJ45_W * 0.12, 'y': y + RJ45_H * 0.16, 'width': RJ45_W * 0.15, 'height': RJ45_H * 0.14, rx: 0.15, fill: active ? '#4488ff' : '#1a1a1a', stroke: '#0a0a0a', 'stroke-width': 0.1 }),
    h('rect', { 'x': x + RJ45_W * 0.73, 'y': y + RJ45_H * 0.16, 'width': RJ45_W * 0.15, 'height': RJ45_H * 0.14, rx: 0.15, fill: active ? '#ff9933' : '#1a1a1a', stroke: '#0a0a0a', 'stroke-width': 0.1 }),
    ...(active ? [
      h('rect', { 'x': x + RJ45_W * 0.12 - 0.2, 'y': y + RJ45_H * 0.16 - 0.12, 'width': RJ45_W * 0.15 + 0.4, 'height': RJ45_H * 0.14 + 0.24, rx: 0.2, fill: '#4488ff', opacity: 0.2 }),
      h('rect', { 'x': x + RJ45_W * 0.73 - 0.2, 'y': y + RJ45_H * 0.16 - 0.12, 'width': RJ45_W * 0.15 + 0.4, 'height': RJ45_H * 0.14 + 0.24, rx: 0.2, fill: '#ff9933', opacity: 0.2 }),
    ] : []),
  ]
}

// ===== 存储面板 =====
function renderStorageDrives(contentW, height, device, brandWidth) {
  const els = []
  const driveStartX = Math.max(75, (brandWidth || 62) + 10)
  const driveAreaWidth = contentW - driveStartX - 2
  const rows = Math.max(2, Math.min(3, Math.floor(height / (HDD25_H + 2))))
  const cols = Math.max(8, Math.min(16, Math.floor(driveAreaWidth / (HDD25_W + 2))))
  const colSpacing = driveAreaWidth / cols
  const rowSpacing = (height - 8) / rows

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      const dx = driveStartX + c * colSpacing + (colSpacing - HDD25_W) / 2
      const dy = 4 + r * rowSpacing + (rowSpacing - HDD25_H) / 2
      els.push(renderHDDBay(dx, dy, HDD25_W, HDD25_H, true, 'normal', String(idx + 1)))
    }
  }
  return els
}

function renderStoragePanel(width, height, devColor, contentW, device) {
  const vColor = getVendorColor(device?.vendor || device?.brand)
  const brandColor = vColor.primary
  const brandName = (device?.vendor || device?.brand || 'HUAWEI').toUpperCase().slice(0, 10)
  const modelName = (device?.model || 'OceanStor').toUpperCase()

  const els = [
    h('rect', { x: 0, y: 0, width, height, fill: '#1a1a1a', stroke: brandColor, 'stroke-width': 0.8, filter: 'url(#deviceShadow)' }),
    h('rect', { x: 1, y: 1, width: width - 2, height: height - 2, fill: '#222' }),
    h('line', { x1: 1, y1: 1.5, x2: width - 1, y2: 1.5, stroke: '#3a3a3a', 'stroke-width': 0.3 }),
  ]

  const clipId = `st-clip-${device.id || 'st'}`
  const storageBrandWidth = 62
  els.push(h('g', { transform: `translate(${RACK_EAR_W}, 0)` }, [
    h('clipPath', { id: clipId }, [h('rect', { x: 0, y: 0, width: contentW, height })]),
    h('g', { clipPath: `url(#${clipId})` }, [
      h('rect', { x: 0, y: 2, width: storageBrandWidth, height: height - 4, fill: '#181818', stroke: '#2a2a2a', 'stroke-width': 0.3 }),
      h('rect', { x: 0, y: 2, width: 1.5, height: height - 4, fill: brandColor }),
      h('text', { x: 3, y: 12, 'font-size': 6, 'font-weight': 'bold', fill: brandColor, 'font-family': 'Arial, sans-serif' }, brandName),
      h('text', { x: 3, y: 18, 'font-size': 4.5, fill: '#888', 'font-family': 'Arial, sans-serif' }, modelName),
      h('g', { transform: `translate(5, ${height - 18})` }, [
        renderStatusLED(0, 0, ledColor(device.status, 'pwr'), 'A'),
        renderStatusLED(7, 0, ledColor(device.status, 'pwr'), 'B'),
        renderStatusLED(14, 0, ledColor(device.status, 'sys'), 'SYS'),
      ]),
      renderPowerButton(38, height / 2 - 2, device.status !== 'offline'),
      ...renderStorageDrives(contentW, height, device, storageBrandWidth),
    ]),
  ]))
  return els
}

// ===== 路由器面板 =====
function renderRouterPanel(width, height, devColor, contentW, device, emit, portStateStore) {
  // 2U（及以上）路由器 → 2U 通用排版（docs/DEVICE_PANEL_2U_STYLE.md）
  if (height >= 50 || (device?.uSize || device?.u_height || 1) >= 2) {
    return renderU2DevicePanel(width, height, devColor, contentW, device, emit, portStateStore, 'router')
  }
  const brandCfg = getBrandStyleConfig(device?.vendor || device?.brand, 'router')
  const brandColor = brandCfg.accentColor
  const modelName = (device?.model || 'AR1220').toUpperCase()
  const rtPortCfg = getDevicePortConfig(device)
  const isOffline = device && device.status === 'offline'
  const portNames = device?.portNames || {}
  const deviceId = device?.id
  const isOnline = device && device.status !== 'offline'

  const WAN_COUNT = 3
  const LAN_COUNT = 4

  const wanPorts = []
  for (let i = 1; i <= WAN_COUNT; i++) {
    const pid = 'wan' + i
    const customName = portNames[pid]
    wanPorts.push({ id: pid, label: 'WAN' + i, displayName: customName || ('WAN' + i) })
  }
  const lanPorts = []
  for (let i = 1; i <= LAN_COUNT; i++) {
    const pid = 'lan' + i
    const customName = portNames[pid]
    lanPorts.push({ id: pid, label: 'LAN' + i, displayName: customName || ('LAN' + i) })
  }
  const allPorts = [...wanPorts, ...lanPorts]

  const handlePortNameEdit = async (portId, currentLabel) => {
    const current = portNames[portId] || ''
    try {
      const { value } = await ElMessageBox.prompt(`编辑端口 ${currentLabel} 名称`, '端口名称', {
        inputValue: current,
        confirmButtonText: '确定',
        cancelButtonText: '取消'
      })
      if (!device.portNames) device.portNames = {}
      device.portNames[portId] = value
    } catch (e) { /* 用户取消 */ }
  }

  const els = [
    h('rect', { x: 0, y: 0, width, height, fill: brandCfg.panelFrame, stroke: brandColor, 'stroke-width': 0.8, filter: 'url(#deviceShadow)' }),
    h('rect', { x: 1, y: 1, width: width - 2, height: height - 2, fill: brandCfg.panelBody }),
    h('line', { x1: 1, y1: 1.5, x2: width - 1, y2: 1.5, stroke: '#333', 'stroke-width': 0.3 }),
  ]

  const clipId = `rt-clip-${device.id || 'rt'}`
  const rtSfpCount = Math.min(rtPortCfg.sfpCount || 2, 2)
  const brandAreaWidth = brandCfg.brandWidth
  const controlX = 32
  const powerButtonX = controlX
  const ledGroupX = controlX + 10
  const consoleX = brandAreaWidth + 5
  const portStartX = consoleX + 16

  const rtPortY = (height - RJ45_H) / 2
  const rtSfpY = height / 2 - SFP_H / 2

  const totalRj45W = allPorts.length * RJ45_SPACING_X
  const sfpAreaW = rtSfpCount > 0 ? rtSfpCount * SFP_SPACING + 12 : 0
  const availableW = contentW - portStartX - sfpAreaW
  const portSpacing = Math.min(RJ45_SPACING_X, Math.floor((availableW - 10) / allPorts.length))
  const wanSepX = portStartX + WAN_COUNT * portSpacing + 2
  // 光口紧接在 LAN 口右侧、与电口同一横排连续排列（参考真实面板排版）
  const sfpStartX = Math.min(wanSepX + 3 + LAN_COUNT * portSpacing + 6, contentW - rtSfpCount * SFP_SPACING - 6)
  const groupLabelY = rtPortY - 2

  els.push(h('g', { transform: `translate(${RACK_EAR_W}, 0)` }, [
    h('clipPath', { id: clipId }, [h('rect', { x: 0, y: 0, width: contentW, height })]),
    h('g', { clipPath: `url(#${clipId})` }, [
      ...renderBrandArea(0, 0, brandAreaWidth, height, brandCfg, modelName, ledGroupX - 2, device?.name),
      renderPowerButton(powerButtonX, height / 2 - 2, device.status !== 'offline', () => emit('power-toggle', { deviceId: device.id, device })),
      h('g', { transform: `translate(${ledGroupX}, ${statusLEDY(height)})` }, [
        renderStatusLED(0, 0, ledColor(device.status, 'pwr'), 'PWR'),
        renderStatusLED(8, 0, ledColor(device.status, 'sys'), 'SYS'),
        renderStatusLED(16, 0, ledColor(device.status, 'stat'), 'ACT'),
      ]),
      h('g', {
        style: 'cursor: pointer',
        onClick: (e) => {
          e.stopPropagation()
          emit('port-click', { deviceId: device.id, device, portId: 'console', portNum: 'CON', portType: 'console', portName: 'Console' })
        },
        onMouseenter: (e) => {
          e.stopPropagation()
          emit('port-hover', { deviceId: device.id, device, portId: 'console', portNum: 'CON', portType: 'console', portName: 'Console', clientX: e.clientX, clientY: e.clientY })
        },
        onMouseleave: (e) => {
          e.stopPropagation()
          emit('port-leave')
        }
      }, [
        h('g', { transform: `rotate(180, ${consoleX + RJ45_W / 2}, ${height / 2})` }, [
          ...renderConsolePort(consoleX, height / 2 - RJ45_H / 2, false),
        ]),
      ]),
      h('text', { x: consoleX + RJ45_W / 2, y: height / 2 - RJ45_H / 2 + RJ45_H + 3.5, 'font-size': 2, fill: '#999', 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif' }, 'Console'),
      h('rect', { x: portStartX, y: 2, width: contentW - portStartX - 10, height: height - 4, fill: brandCfg.panelBody }),

      h('text', { x: portStartX + (WAN_COUNT * portSpacing) / 2 - RJ45_W / 2, y: groupLabelY, 'font-size': 2.6, fill: '#cc6633', 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif', 'font-weight': 'bold' }, 'WAN'),
      h('text', { x: wanSepX + 3 + (LAN_COUNT * portSpacing) / 2 - RJ45_W / 2, y: groupLabelY, 'font-size': 2.6, fill: '#3388cc', 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif', 'font-weight': 'bold' }, 'LAN'),

      h('line', { x1: wanSepX, y1: rtPortY - 3, x2: wanSepX, y2: rtPortY + RJ45_H + 5, stroke: '#444', 'stroke-width': 0.5 }),

      ...allPorts.map((p, i) => {
        const px = i < WAN_COUNT ? portStartX + i * portSpacing : wanSepX + 3 + (i - WAN_COUNT) * portSpacing
        const isWan = i < WAN_COUNT
        const portCenterX = px + RJ45_W / 2
        const isOccupied = !isOffline && (
          portStateStore && (
            portStateStore.isPortOccupied(deviceId, p.id) ||
            portStateStore.isPortOccupied(deviceId, 'ge' + (i + 1)) ||
            portStateStore.isPortOccupied(deviceId, 'eth' + (i + 1))
          )
        )
        return h('g', { key: `rt-${p.id}` }, [
          h('text', {
            x: portCenterX, y: rtPortY + RJ45_H + 2.5,
            'font-size': PORT_LABEL_FONT_SIZE,
            fill: isWan ? '#cc8855' : '#5599cc',
            'text-anchor': 'middle', 'font-family': 'Arial, sans-serif',
            style: 'cursor: pointer',
            onDblclick: (e) => {
              e.stopPropagation()
              handlePortNameEdit(p.id, p.label)
            }
          }, p.displayName),
          h('g', {
            style: 'cursor: pointer',
            onClick: (e) => {
              e.stopPropagation()
              emit('port-click', { deviceId: device.id, device, portId: p.id, portNum: p.label, portType: 'ethernet', portName: p.displayName })
            },
            onMouseenter: (e) => {
              e.stopPropagation()
              emit('port-hover', { deviceId: device.id, device, portId: p.id, portNum: p.label, portType: 'ethernet', portName: p.displayName, clientX: e.clientX, clientY: e.clientY })
            },
            onMouseleave: (e) => {
              e.stopPropagation()
              emit('port-leave')
            }
          }, [
            renderRJ45Port(px, rtPortY, isOccupied, 'top'),
          ]),
        ])
      }),

      ...(rtSfpCount > 0 ? [
        h('line', { x1: sfpStartX - 1, y1: rtPortY - 3, x2: sfpStartX - 1, y2: rtPortY + RJ45_H + 5, stroke: '#2a2a2a', 'stroke-width': 0.3 }),
        h('text', { x: sfpStartX + (rtSfpCount * SFP_SPACING) / 2, y: rtSfpY - 2, 'font-size': 2.6, fill: '#a0a0a0', 'font-family': 'Arial, sans-serif', 'font-weight': 'bold', 'text-anchor': 'middle' }, 'SFP'),
        ...Array.from({ length: rtSfpCount }).map((_, i) => {
          const sx = sfpStartX + i * SFP_SPACING
          const sfpNum = i + 1
          const sfpActive = !isOffline && (rtPortCfg.connectedPortSet.has('SFP-' + sfpNum) || (portStateStore && portStateStore.isPortOccupied(deviceId, 'sfp' + sfpNum)))
          return h('g', {
            key: `rt-sfp-${i}`,
            style: 'cursor: pointer',
            onClick: (e) => {
              e.stopPropagation()
              emit('port-click', { deviceId: device.id, device, portId: `sfp${sfpNum}`, portNum: sfpNum, portType: 'sfp', portName: `SFP${sfpNum}` })
            },
            onMouseenter: (e) => {
              e.stopPropagation()
              emit('port-hover', { deviceId: device.id, device, portId: `sfp${sfpNum}`, portNum: sfpNum, portType: 'sfp', portName: `SFP${sfpNum}`, clientX: e.clientX, clientY: e.clientY })
            },
            onMouseleave: (e) => {
              e.stopPropagation()
              emit('port-leave')
            }
          }, [
            renderSFPPort(sx, rtSfpY, sfpActive, String(sfpNum))
          ])
        })
      ] : []),
    ]),
  ]))
  return els
}

// ===== KVM 面板 =====
function renderKVMPanel(width, height, devColor, contentW, device) {
  const vColor = getVendorColor(device?.vendor || device?.brand)
  const brandColor = vColor.primary
  const brandName = (device?.vendor || device?.brand || 'ATEN').toUpperCase().slice(0, 10)
  const modelName = (device?.model || 'KH1532').toUpperCase()

  const els = [
    h('rect', { x: 0, y: 0, width, height, fill: '#1a1a1a', stroke: brandColor, 'stroke-width': 0.8, filter: 'url(#deviceShadow)' }),
    h('rect', { x: 1, y: 1, width: width - 2, height: height - 2, fill: '#222' }),
  ]

  const clipId = `kvm-clip-${device.id || 'kvm'}`
  const kvmBrandWidth = 55
  els.push(h('g', { transform: `translate(${RACK_EAR_W}, 0)` }, [
    h('clipPath', { id: clipId }, [h('rect', { x: 0, y: 0, width: contentW, height })]),
    h('g', { clipPath: `url(#${clipId})` }, [
      h('rect', { x: 0, y: 2, width: kvmBrandWidth, height: height - 4, fill: '#181818', stroke: '#2a2a2a', 'stroke-width': 0.3 }),
      h('rect', { x: 0, y: 2, width: 1.5, height: height - 4, fill: brandColor }),
      h('text', { x: 3, y: 10, 'font-size': 5.5, 'font-weight': 'bold', fill: brandColor, 'font-family': 'Arial, sans-serif' }, brandName),
      h('text', { x: 3, y: 16, 'font-size': 4, fill: '#888', 'font-family': 'Arial, sans-serif' }, modelName),
      renderPowerButton(35, height / 2 - 2, device.status !== 'offline'),
      h('g', { transform: `translate(${contentW - 16}, ${height / 2 - 3})` }, [
        h('rect', { x: 0, y: 0, width: 14, height: 6, fill: '#111', stroke: '#333', 'stroke-width': 0.3 }),
        h('rect', { x: 2, y: 1, width: 10, height: 4, fill: '#0a0a0a' }),
        h('rect', { x: 3, y: 2, width: 8, height: 2, fill: device.status === 'offline' ? '#333' : '#00a8ff' }),
      ]),
    ]),
  ]))
  return els
}

// ===== PDU 面板 =====
function renderPDUPanel(width, height, devColor, contentW, device) {
  const vColor = getVendorColor(device?.vendor || device?.brand)
  const brandColor = vColor.primary
  const brandName = (device?.vendor || device?.brand || 'APC').toUpperCase().slice(0, 8)
  const outlets = device?.outletCount || 8

  const els = [
    h('rect', { x: 0, y: 0, width, height, fill: '#333', stroke: brandColor, 'stroke-width': 0.5, filter: 'url(#deviceShadow)' }),
    h('rect', { x: 1, y: 1, width: width - 2, height: height - 2, fill: '#3a3a3a' }),
  ]

  const clipId = `pdu-clip-${device.id || 'pdu'}`
  els.push(h('g', { transform: `translate(${RACK_EAR_W}, 0)` }, [
    h('clipPath', { id: clipId }, [h('rect', { x: 0, y: 0, width: contentW, height })]),
    h('g', { clipPath: `url(#${clipId})` }, [
      h('rect', { x: 0, y: 2, width: 35, height: height - 4, fill: '#2a2a2a', stroke: '#444', 'stroke-width': 0.3 }),
      h('text', { x: 3, y: 10, 'font-size': 5, 'font-weight': 'bold', fill: brandColor, 'font-family': 'Arial, sans-serif' }, brandName),
      h('text', { x: 3, y: 15, 'font-size': 3.5, fill: '#aaa', 'font-family': 'Arial, sans-serif' }, `PDU ${outlets}路`),
      ...Array.from({ length: Math.min(outlets, 8) }).map((_, i) => {
        const ox = 40 + i * ((contentW - 45) / Math.min(outlets, 8))
        const ow = (contentW - 45) / Math.min(outlets, 8) - 2
        return h('g', { key: `outlet-${i}` }, [
          h('rect', { x: ox, y: height / 2 - 3, width: ow, height: 6, fill: '#222', stroke: '#111', 'stroke-width': 0.3, rx: 0.5 }),
          h('circle', { cx: ox + 1.5, cy: height / 2, r: 0.6, fill: '#555' }),
          h('circle', { cx: ox + ow - 1.5, cy: height / 2, r: 0.6, fill: '#555' }),
          h('rect', { x: ox + 3, y: height / 2 - 1.5, width: ow - 6, height: 3, fill: device.status === 'offline' ? '#3a3a3a' : '#22aa44' }),
        ])
      }),
    ]),
  ]))
  return els
}

// ===== 配线架面板 =====
function renderPatchPanel(width, height, device, portLabels, emit, portStateStore) {
  const labels = portLabels || {}
  const contentW = width - RACK_EAR_W * 2
  const is48Port = device.u_height >= 2 || (device.ports_count || device.ports || 0) === 48
  const totalPortCount = is48Port ? 48 : (device.ports_count || device.ports || 24)
  const rows = is48Port ? 2 : 1
  const portsPerRow = totalPortCount / rows
  const groupCount = portsPerRow / 6

  const portMap = device.portMap || {}
  const deviceId = device?.id

  const els = [
    h('rect', { x: 0, y: 0, width, height, fill: '#0a0a0a', stroke: '#1a1a1a', 'stroke-width': 0.5, filter: 'url(#deviceShadow)' }),
    h('rect', { x: 1, y: 1, width: width - 2, height: height - 2, fill: '#181818' }),
  ]

  // 左侧名称区（对齐交换机品牌区）：上方类型小字，左下角显示配线架名称（用户要求同交换机名称位置）
  const nameAreaW = 32
  const panelName = String(device.name || '').trim()
  els.push(h('g', { transform: `translate(${RACK_EAR_W + 2}, 0)` }, [
    h('rect', { x: 0, y: 2, width: nameAreaW, height: height - 4, fill: '#222', stroke: '#333', 'stroke-width': 0.2 }),
    h('text', { x: 2.5, y: 7, 'font-size': 2.8, fill: '#9a9a9a', 'font-family': 'Arial, sans-serif' }, '配线架'),
    // 名称颜色/字号/左对齐方式与交换机品牌区左下角名称一致（typeColor #666666，x 左起，font 3.5）
    h('text', {
      x: 2.5, y: height - 4, 'font-size': 3.5, fill: '#666666',
      'font-family': 'Arial, sans-serif'
    }, panelName.length > 7 ? panelName.slice(0, 7) : panelName),
  ]))

  for (let row = 0; row < rows; row++) {
    const rowH = height / rows
    const rowTop = row * rowH
    // 端口区右侧让出左侧名称区宽度
    const leftMargin = RACK_EAR_W + 2 + nameAreaW
    const innerW = width - leftMargin - (RACK_EAR_W + 2)
    const groupW = innerW / groupCount
    const portSlotW = groupW / 6
    const rj45W = RJ45_W
    const rj45H = RJ45_H

    const labelH = Math.min(rowH * 0.16, 4.6)
    const numFontH = Math.min(3.2, rowH * 0.22)

    const totalContentH = labelH + 1.5 + rj45H + 1.5 + numFontH
    const contentTop = rowTop + (rowH - totalContentH) / 2

    const labelY = contentTop
    const portY = labelY + labelH + 1.5
    const numY = portY + rj45H + 1.8

    const groupEls = []

    for (let g = 0; g < groupCount; g++) {
      const gx = leftMargin + g * groupW
      const portStartIdx = g * 6 + row * portsPerRow

      for (let p = 0; p < 6; p++) {
        const portNum = portStartIdx + p + 1
        const labelKey = `${device.id || 'pp'}-${portNum}`
        const portCenterX = gx + p * portSlotW + portSlotW / 2
        const labelW = portSlotW * 0.8

        const portInfo = portMap[portNum] || portMap[String(portNum)] || {}
        const isConnected = !!(portInfo.from || portInfo.to || portInfo.connectDeviceId || portInfo.cable)
        const hasLink = isConnected || (portStateStore && portStateStore.isPortOccupied(deviceId, 'patch-' + portNum))

        const labelX = portCenterX - labelW / 2
        groupEls.push(h('rect', {
          key: `pp-label-${row}-${g}-${p}`,
          x: labelX, y: labelY,
          width: labelW, height: labelH,
          fill: '#fafafa', stroke: '#d0d0d0', 'stroke-width': 0.15, rx: 0.2,
          'data-patch-rename': portNum,
          style: 'cursor: pointer',
          onClick: (e) => {
            e.stopPropagation()
            emit('patch-rename', { deviceId: device.id, device, portNum })
          },
        }))

        const labelText = (portInfo && portInfo.portName) || labels[labelKey] || ''
        groupEls.push(h('text', {
          key: `pp-label-text-${row}-${g}-${p}`,
          x: portCenterX, y: labelY + labelH * 0.72,
          'font-size': Math.min(3.0, labelH * 0.72),
          fill: '#333', 'text-anchor': 'middle',
          'font-family': 'Arial, sans-serif',
          style: 'pointer-events: none',
        }, labelText.length > 6 ? labelText.slice(0, 6) : labelText))

        const portX = portCenterX - rj45W / 2
        const ledW = rj45W * 0.15, ledH = rj45H * 0.14
        // 确保内部凹陷矩形不会遮挡LED（底部LED）
        const innerH = rj45H * 0.58
        groupEls.push(h('g', {
          key: `pp-port-group-${row}-${g}-${p}`,
          style: 'cursor: pointer',
          onClick: (e) => {
            e.stopPropagation()
            emit('port-click', {
              deviceId: device.id,
              device: device,
              portId: `patch-${portNum}`,
              portNum: portNum,
              portType: 'patch-panel',
              portName: labelText || `端口${portNum}`
            })
          },
          onMouseenter: (e) => {
            e.stopPropagation()
            emit('port-hover', { deviceId: device.id, device, portId: `patch-${portNum}`, portNum: portNum, portType: 'patch-panel', portName: labelText || `端口${portNum}`, clientX: e.clientX, clientY: e.clientY })
          },
          onMouseleave: (e) => {
            e.stopPropagation()
            emit('port-leave')
          }
        }, [
          h('rect', {
            x: portX, y: portY,
            width: rj45W, height: rj45H,
            fill: '#2a2a2a', stroke: '#0a0a0a', 'stroke-width': 0.3, rx: 0.3
          }),
          h('rect', {
            x: portX + 1, y: portY + 1,
            width: rj45W - 2, height: innerH,
            fill: '#0a0a0a'
          }),
          h('rect', {
            x: portX + rj45W * 0.12, y: portY + rj45H * 0.70,
            width: ledW, height: ledH, rx: 0.15,
            fill: hasLink ? '#22aa44' : '#2a2a2a',
            stroke: '#0a0a0a', 'stroke-width': 0.1,
            class: hasLink ? 'rj45-led rj45-led-green' : ''
          }),
          h('rect', {
            x: portX + rj45W * 0.73, y: portY + rj45H * 0.70,
            width: ledW, height: ledH, rx: 0.15,
            fill: hasLink ? '#ffbb00' : '#2a2a2a',
            stroke: '#0a0a0a', 'stroke-width': 0.1,
            class: hasLink ? 'rj45-led rj45-led-orange' : ''
          }),
          h('text', {
            x: portCenterX, y: numY,
            'font-size': numFontH,
            fill: '#ffffff', 'text-anchor': 'middle', 'font-weight': 'bold',
            'font-family': 'Arial, sans-serif'
          }, String(portNum))
        ]))
      }

      if (g < groupCount - 1) {
        const sepX = gx + groupW
        groupEls.push(h('rect', {
          key: `pp-sep-${row}-${g}`,
          x: sepX - 0.8, y: rowTop,
          width: 1.6, height: 1.3,
          fill: '#050505', rx: 0.1
        }))
      }
    }
    els.push(...groupEls)
  }

  return els
}

// ===== 线缆管理器 =====
function renderCableManager(width, height, device) {
  // 康宁 1U 理线架样式（参考 nVisual 迁移导出 SVG 精确比例）：
  // 黑色主体 + 中央 #3f3f3f 凸台 + 上下折边（上 #595959 / 下 #262626）+ 凸台中央白色名称（对应参考图 CORNING 标识位）
  // 注意：参考 SVG 两端的安装块（含白孔）对应本项目的挂耳区，固定孔由 RackEarsComponent 统一渲染，
  // 面板主体不再画端块/白孔（否则白孔会落在挂耳内侧，与其他设备挂耳逻辑不一致）。
  const contentW = width - RACK_EAR_W * 2
  // 折边高 ≈ 面板高 13%（参考 SVG 16.52/126.63）
  const hemH = height * 0.13
  // 凸台中央名称
  const nameText = String(device?.name || '理线架').trim()

  const els = [
    // 黑色主体底板
    h('rect', { x: 0, y: 0, width, height, fill: '#000000', stroke: '#0a0a0a', 'stroke-width': 0.3, filter: 'url(#deviceShadow)' }),
  ]

  // 主体三段：上折边 + 中央凸台 + 下折边（凸台占 74%，黑底上下留边）
  els.push(h('g', { key: 'cm-body', transform: `translate(${RACK_EAR_W}, 0)` }, [
    h('rect', { x: 0, y: 0, width: contentW, height: hemH, fill: '#595959' }),
    h('rect', { x: 0, y: hemH, width: contentW, height: height - hemH * 2, fill: '#3f3f3f' }),
    h('rect', { x: 0, y: height - hemH, width: contentW, height: hemH, fill: '#262626' }),
    // 凸台中央名称（白色，水平垂直居中）
    h('text', {
      x: contentW / 2, y: height / 2 + 1.8, 'font-size': 5, fill: '#ffffff',
      'text-anchor': 'middle', 'font-family': 'Arial, sans-serif', 'letter-spacing': '0.4'
    }, nameText.length > 10 ? nameText.slice(0, 10) : nameText),
  ]))
  return els
}

// ===== ODF 光纤配线架（nVisual 风格：浅米灰外框 + 深炭黑腔体 + 湖蓝托盘 + SC适配器）=====
function renderODFPanel(width, height, device) {
  const fiberNum = device?.fibers || 12
  const cols = 12
  const rows = Math.max(1, Math.ceil(fiberNum / cols))
  const contentW = width - RACK_EAR_W * 2
  const els = [
    // 浅米灰金属外框
    h('rect', { x: 0, y: 0, width, height, fill: '#b8b4a8', stroke: '#8a867a', 'stroke-width': 0.3, filter: 'url(#deviceShadow)' }),
    h('rect', { x: 1, y: 1, width: width - 2, height: height - 2, fill: '#c4c0b2' }),
  ]
  // 深炭黑腔体 + 湖蓝托盘
  const trayW = contentW - 1
  const trayH = Math.min((height - 4) * 0.82, 14)
  const trayY = (height - trayH) / 2
  els.push(h('g', { transform: `translate(${RACK_EAR_W}, 0)` }, [
    h('rect', { x: 0.5, y: 1, width: trayW, height: height - 2, fill: '#2a2a2c' }),
    h('rect', { x: 0.5, y: trayY, width: trayW, height: trayH, fill: '#2A78AE', stroke: '#1e5f8a', 'stroke-width': 0.15 }),
    ...Array.from({ length: fiberNum }).map((_, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const slotW = trayW / cols
      const rowH = trayH / rows
      const scW = Math.min(slotW * 0.62, 5)
      const scH = Math.min(rowH * 0.62, 5)
      const sx = col * slotW + (slotW - scW) / 2
      const sy = trayY + row * rowH + (rowH - scH) / 2
      const scCx = sx + scW / 2
      return h('g', { key: `odf-${i}` }, [
        // SC适配器：浅蓝方框 + 深灰凹槽 + 白色圆心
        h('rect', { x: sx, y: sy, width: scW, height: scH, fill: '#5aa7d8', stroke: '#2f7fae', 'stroke-width': 0.12, rx: 0.15 }),
        h('rect', { x: sx + scW * 0.14, y: sy + scH * 0.14, width: scW * 0.72, height: scH * 0.72, fill: '#222', stroke: '#111', 'stroke-width': 0.1 }),
        h('circle', { cx: scCx, cy: sy + scH / 2, r: scH * 0.16, fill: '#ffffff' }),
        // 端口编号（适配器下方）
        h('text', { x: sx + slotW / 2, y: height - 0.8, 'font-size': Math.min(2, scH * 0.8), fill: '#333', 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif', 'font-weight': 'bold' }, String((i + 1) < 10 ? '0' + (i + 1) : (i + 1))),
      ])
    }),
  ]))
  return els
}

// ===== 光纤盘面板（直接应用 nVisual 导出面板图，SC/LC/FC 三种接口）=====
// 图源: D:\nvisual  图标\面板\光纤盘\nvisual-migration-2026-10-06-10-50-51.nvl
//   SC → 「24口1U光口光纤适配器」正面板 mqgptpu5.png（原图 2996×279，裁两端图内挂耳后 2578×279）
//   LC → 「48口1U光口光纤适配器」正面板 j4kuqytp.png（同上）
//   FC → 「光纤盒子」正面板 fdpkdogd.svg（viewBox 0 0 1368.24 126.63，嵌入裁剪窗口 x 100~1284 去图内挂耳）
// 规范：图内自带挂耳（含白孔）一律裁除，固定孔由 RackEarsComponent 统一渲染（同康宁理线架）
// 热点坐标为图内适配器色块质心（PIL/canvas 像素级检测），SC/LC 已逐口验证：
//   SC 24/24 检出，最大偏差 dx=0.13/dy=0.19 面板单位；LC 48/48 检出，最大偏差 dx=0.46/dy=0.16
// FC 图为 26 等差口位（x=108+46.1n，viewBox 单位），其中 n=8/17 为螺丝固定位（深灰十字），已跳过 → 24 个 FC 适配器
// 嵌入区 x∈[RACK_EAR_W+2, width-(RACK_EAR_W+2)]，preserveAspectRatio none（与项目面板坐标系一致）
const FIBER_EAR_X = RACK_EAR_W + 2

// SC/LC 面板按用户提供的 SC.png / LC.png 原图制作，FC 保留 nVisual 导出图 fiber-fc.svg
// SC.png 原图四层结构：浅灰白衬边 #F0F2F5 → 亮宝蓝框 #1C82EE → 中深蓝台阶 #1246A0 → 极深藏蓝底板 #081946
// LC.png 原图结构：白色圆角外框 #FAFBFC（右下阴影 #E4E8EB）+ 藏蓝基底 #164888 + 亮蓝装饰条 #2088E1
// 端口贴图：SC.png 裁剪圆形端口（蓝环+黑芯）、LC.png 裁剪双工白环；单排大口/双排小口，同排数内尺寸固定
// 布局：SC 12芯=1排12列、24芯=2排12列；LC 24芯=1排12列双工、48芯=2排12列双工
// 端口热点/悬停/点击连线/备注标签机制与旧版一致（透明热点 + 绿点）
// FC 布局（基于 fiber-fc.svg 裁剪窗口 x∈[80,1284] 宽 1204；slotN 已剔除 2 个螺丝位）
// 裁剪窗口左边界 80 避开图内挂耳白孔（viewBox x 24~76），第一个适配器 n=0（viewBox x=108）距裁剪窗口左边 28 单位（相对 2.3%），映射面板后 cx=17.9 距挂耳右边界 9 有 8.9 单位，热点左边界 10.8 不被挂耳覆盖
const FC_PANEL_LAYOUT = {
  slotN: [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25],
  cxOfN: (n) => (28 + 46.1 * n) / 1204,
  cy: 63 / 126.63,
  holeW: 44.5 / 1204, holeH: 44.5 / 126.63,
  labelY: 0.73611, labelH: 0.08889, labelW: 0.03516,
  slots: 24,
}

// SC 12 芯正面板布局（fiber-sc12.png 3501×351；SE12光纤配线架正面图 xvphie0t.png 像素级裁除两端挂耳 [149,3650]）
// cols/rows = 端口中心归一化坐标（像素检测，3 组×4 列，组间距保留）；holeW/H = 端口方框归一化尺寸
const SC12_PANEL_LAYOUT = {
  imgW: 3501, imgH: 351,
  cols: [0.089032, 0.146701, 0.204342, 0.262068, 0.404342, 0.462010, 0.519680, 0.577349, 0.719680, 0.777435, 0.835018, 0.892887],
  rows: [0.463248],
  holeW: 0.037132, holeH: 0.259259,
  // 2026-10-07 备注标签放大（字号 2.43→4.4）且以原校准的图内印刷标签格中心 28.6 为准对称放大（25.7+5.8/2=28.6）
  // 2026-10-07 用户反馈标签框太长：宽度 26→21；反馈未对齐：白框上沿回到印刷格中心对称位置
  labelYs: [25.7], labelHs: [5.8], labelW: 21,
}

// SC 24 芯正面板布局（fiber-sc24.png 2740×279；24口1U光口适配器正面图 mqgptpu5.png 像素级裁除两端挂耳 [128,2868]，2 排×12 列）
const SC24_PANEL_LAYOUT = {
  imgW: 2740, imgH: 279,
  cols: [0.084891, 0.143175, 0.201387, 0.259599, 0.403175, 0.461277, 0.519664, 0.577774, 0.721314, 0.779416, 0.837737, 0.895985],
  rows: [0.281720, 0.709319],
  holeW: 0.037591, holeH: 0.254480,
  // 2026-10-07 备注标签放大（字号 1.98→3.34）且各排以原校准印刷格中心（17.8/33.0）为准对称放大；
  // 下排 30.8+4.4=35.2 < 面板底 36，不再超出面板（上一版 31.7+5.4=37.1 超出导致“未对齐端口”观感）
  labelYs: [15.6, 30.8], labelHs: [4.4, 4.4], labelW: 19,
}

// LC 24 芯正面板布局（fiber-lc24.png 3500×351；24口光纤配线架正面图 nlwzqorf.png 像素级裁除两端挂耳 [150,3650]）
// 口径：厂商图 1 口 = 1 个 LC 双工位（2 孔）；cols = 24 个双工位中心归一化坐标（孔芯像素检测配对），rows = 孔中心 y；
// 图内自带印刷编号 1-24（每双工位 1 个，与端口编号一一对齐）
const LC24_PANEL_LAYOUT = {
  imgW: 3500, imgH: 351,
  cols: [0.031714, 0.072429, 0.113114, 0.153829, 0.194543, 0.235200, 0.275886, 0.316600, 0.357286, 0.397971, 0.438686, 0.479400, 0.520086, 0.560771, 0.601457, 0.642171, 0.682857, 0.723571, 0.764257, 0.804971, 0.845686, 0.886343, 0.927057, 0.967743],
  rows: [0.558690],
  holeW: 0.037143, holeH: 0.253846,
  labelYs: [27.0], labelHs: [3.2], labelW: 13.5,
}

// LC 48 芯正面板布局（fiber-lc48.png 3500×351；48口光纤配线架正面图 gkizmmgo.png 像素级裁除两端挂耳 [150,3650]，2 排×24 双工位、6 位一组）
// 上排 1-24 / 下排 25-48；上排标签落在原图自带白色分段标签条上，下排标签在底部深灰区
const LC48_PANEL_LAYOUT = {
  imgW: 3500, imgH: 351,
  cols: [0.091200, 0.124429, 0.157686, 0.190943, 0.224229, 0.257457, 0.308343, 0.341629, 0.374857, 0.408114, 0.441371, 0.474629, 0.525514, 0.558800, 0.592029, 0.625314, 0.658571, 0.691800, 0.742714, 0.775971, 0.809200, 0.842514, 0.875743, 0.909000],
  rows: [0.377778, 0.635328],
  holeW: 0.030857, holeH: 0.235043,
  labelYs: [17.0, 30.0], labelHs: [2.4, 2.4], labelW: 11.5,
}

function renderFiberTrayPanel(width, height, device, emit, portStateStore) {
  const fibers = device?.fibers || 12
  const fiberType = device?.fiberType || 'SC'
  const portMap = device?.portMap || {}
  const fiberMap = device?.fiberMap || {}
  const deviceId = device?.id
  const imgX = FIBER_EAR_X
  const imgW = width - FIBER_EAR_X * 2

  const els = [
    // 底板（SC/LC 全幅面板覆盖，FC 深灰兕底露出）
    h('rect', { key: 'ft-base', x: 0, y: 0, width, height, fill: fiberType === 'FC' ? '#262626' : '#101010', stroke: '#0a0a0a', 'stroke-width': 0.3, filter: 'url(#deviceShadow)' }),
  ]

  // FC 面板（嵌套 svg + viewBox 裁剪；图内挂耳已裁，耳区留给 RackEarsComponent）
  if (fiberType === 'FC') {
    els.push(h('svg', { key: 'ft-img', x: imgX, y: 0, width: imgW, height, viewBox: '80 0 1204 126.63', preserveAspectRatio: 'none' }, [
      h('image', { href: fiberFcImg, x: 0, y: 0, width: 1368.24, height: 126.63, preserveAspectRatio: 'none' }),
    ]))
  }

  // 端口信息 / 连接状态
  const pmInfoOf = (portNum) => portMap[portNum] || portMap[String(portNum)] || fiberMap[portNum] || fiberMap[String(portNum)] || {}
  const connectedOf = (portNum) => {
    const pmInfo = pmInfoOf(portNum)
    return !!(pmInfo.from || pmInfo.to || pmInfo.connectDeviceId || pmInfo.cable) || !!(portStateStore && portStateStore.isPortOccupied(deviceId, 'fiber-' + portNum))
  }

  // 热点（透明可交互区，覆盖适配器视觉）
  const addHot = (portNum, cx, cy, w, ah) => {
    els.push(h('g', {
      key: `ft-port-${portNum}`,
      style: 'cursor: pointer',
      onClick: (e) => {
        e.stopPropagation()
        emit('port-click', { deviceId, device, portId: `fiber-${portNum}`, portNum, portType: 'optical', portName: pmInfoOf(portNum).portName || `芯${portNum}` })
      },
      onMouseenter: (e) => {
        e.stopPropagation()
        emit('port-hover', { deviceId, device, portId: `fiber-${portNum}`, portNum, portType: 'optical', portName: pmInfoOf(portNum).portName || `芯${portNum}`, clientX: e.clientX, clientY: e.clientY })
      },
      onMouseleave: (e) => { e.stopPropagation(); emit('port-leave') },
    }, [
      h('rect', { x: cx - w / 2, y: cy - ah / 2, width: w, height: ah, fill: 'transparent' }),
      ...(connectedOf(portNum) ? [h('circle', { cx, cy, r: height * 0.028, fill: '#22aa44' })] : []),
    ]))
  }

  // 备注名标签（可点击批量命名，同配线架机制）
  // 2026-10-07 字号上限 3.0→5.0（配合 SC 标签放大；LC/FC 标签高未变，字号不受影响）
  const addLabel = (portNum, labelText, cx, y, w, labelH) => {
    const fs = Math.min(5.0, labelH * 0.76)
    els.push(h('rect', {
      key: `ft-label-${portNum}`,
      x: cx - w / 2, y, width: w, height: labelH,
      fill: '#fafafa', stroke: '#d0d0d0', 'stroke-width': 0.15, rx: 0.2,
      'data-patch-rename': portNum, style: 'cursor: pointer',
      onClick: (e) => { e.stopPropagation(); emit('patch-rename', { deviceId, device, portNum }) },
    }))
    els.push(h('text', {
      key: `ft-label-text-${portNum}`,
      x: cx, y: y + labelH * 0.72, 'font-size': fs, fill: '#333', 'text-anchor': 'middle',
      'font-family': 'Arial, sans-serif', style: 'pointer-events: none',
    }, labelText.length > 6 ? labelText.slice(0, 6) : labelText))
  }

  if (fiberType === 'LC') {
    // LC：nvl 矢量图正面板（LC24.nvl / LC48.nvl；图内挂耳已像素级裁除，耳区留给 RackEarsComponent 统一渲染）
    // 口径：厂商图 1 口 = 1 个 LC 双工位（2 孔），端口数 = 双工位数（旧版每孔一端口的语义已按用户确认改为每双工位一端口）
    const is24 = fibers <= 24
    const L = is24 ? LC24_PANEL_LAYOUT : LC48_PANEL_LAYOUT
    els.push(h('svg', { key: 'lc-img', x: imgX, y: 0, width: imgW, height, viewBox: `0 0 ${L.imgW} ${L.imgH}`, preserveAspectRatio: 'none' }, [
      h('image', { href: is24 ? fiberLc24Img : fiberLc48Img, x: 0, y: 0, width: L.imgW, height: L.imgH, preserveAspectRatio: 'none' }),
    ]))
    const maxPort = Math.min(fibers, L.rows.length * 24)
    for (let ri = 0; ri < L.rows.length; ri++) {
      for (let ci = 0; ci < 24; ci++) {
        const portNum = ri * 24 + ci + 1
        if (portNum > maxPort) break
        const cx = imgX + L.cols[ci] * imgW
        addHot(portNum, cx, L.rows[ri] * height, L.holeW * imgW, L.holeH * height)
        addLabel(portNum, pmInfoOf(portNum).portName || '', cx, L.labelYs[ri], L.labelW, L.labelHs[ri])
      }
    }
  } else if (fiberType === 'FC') {
    // FC：1 行 24 个圆形适配器（26 口位中已跳过 2 个螺丝固定位）
    const L = FC_PANEL_LAYOUT
    const maxPort = Math.min(fibers, L.slots)
    L.slotN.slice(0, maxPort).forEach((n, idx) => {
      const portNum = idx + 1
      const cx = imgX + L.cxOfN(n) * imgW
      addHot(portNum, cx, L.cy * height, L.holeW * imgW, L.holeH * height)
      addLabel(portNum, pmInfoOf(portNum).portName || '', cx, L.labelY * height, L.labelW * imgW, L.labelH * height)
    })
  } else {
    // SC：nvl 矢量图正面板（SC12芯.nvl / SC24芯.nvl；图内挂耳已像素级裁除，耳区留给 RackEarsComponent 统一渲染）
    const is12 = fibers <= 12
    const L = is12 ? SC12_PANEL_LAYOUT : SC24_PANEL_LAYOUT
    els.push(h('svg', { key: 'sc-img', x: imgX, y: 0, width: imgW, height, viewBox: `0 0 ${L.imgW} ${L.imgH}`, preserveAspectRatio: 'none' }, [
      h('image', { href: is12 ? fiberSc12Img : fiberSc24Img, x: 0, y: 0, width: L.imgW, height: L.imgH, preserveAspectRatio: 'none' }),
    ]))
    const maxPort = Math.min(fibers, L.rows.length * 12)
    for (let ri = 0; ri < L.rows.length; ri++) {
      for (let ci = 0; ci < 12; ci++) {
        const portNum = ri * 12 + ci + 1
        if (portNum > maxPort) break
        const cx = imgX + L.cols[ci] * imgW
        addHot(portNum, cx, L.rows[ri] * height, L.holeW * imgW * 1.1, L.holeH * height * 1.1)
        addLabel(portNum, pmInfoOf(portNum).portName || '', cx, L.labelYs[ri], L.labelW, L.labelHs[ri])
      }
    }
  }
  return els
}

// ===== 厂商真实面板图（海康/大华 nVisual 导出正面板直接应用）=====
// 图源: src/assets/panels/vendor/{hikvision,dahua}/（.nvl node_type_image 提取，图内挂耳已裁除左右各 4%）
// 规范: 图内不渲染挂耳，固定孔位由 RackEarsComponent 统一渲染（同光纤盘/理线架，避免双重挂耳错位）
// 匹配: vendorPanelImages.js matchVendorPanel(device) —— 厂商别名缩小范围 + 型号规范化（精确→双向包含）两级匹配
// 布局: uSize 与设备一致时填满主体区（slice 垂直轻裁机身边缘，同历史真实面板图机制）；
//       不一致时按面板图真实 U 数换算高度、垂直居中（meet 完整显示，不拉伸变形）
// 交互: NVR 等设备端口在背面，第一版无端口热点；叠加右上角电源指示灯显示在线状态（同其他面板）
function renderVendorImagePanel(width, height, device, entry) {
  const els = [
    // 底板兜底：图未加载完成前显示深色面板，不出现白底
    h('rect', { key: 'vp-base', x: 0, y: 0, width, height, fill: '#1a1a1a', stroke: '#0a0a0a', 'stroke-width': 0.5, filter: 'url(#deviceShadow)' }),
  ]

  const devU = device?.u_height || device?.uSize || 1
  const imgU = entry?.uSize || devU
  const sameU = String(imgU) === String(devU)
  const imgH = sameU ? height : Math.min(height, imgU * U_HEIGHT)
  const imgY = sameU ? 0 : (height - imgH) / 2

  els.push(h('image', {
    key: 'vp-img',
    href: entry.img,
    x: RACK_EAR_W, y: imgY, width: width - RACK_EAR_W * 2, height: imgH,
    preserveAspectRatio: sameU ? 'xMidYMid slice' : 'xMidYMid meet',
    style: { pointerEvents: 'none' },
  }))

  // 电源指示灯（右上角，同交换机面板；pointer-events none 不拦截点击）
  els.push(h('g', { key: 'vp-power' }, [renderPowerIndicator(width, height, device && device.status !== 'offline')]))
  return els
}

// 根据 device.type 分发到不同渲染函数
export const DevicePanelRenderer = defineComponent({
  name: 'DevicePanelRenderer',
  props: {
    device: { type: Object, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  emits: ['port-click', 'port-hover', 'port-leave', 'power-toggle', 'patch-rename'],
  setup(props, { emit }) {
    const portStateStore = usePortStateStore()
    // 使用storeToRefs确保响应式追踪
    const { connections } = storeToRefs(portStateStore)
    
    return () => {
      // 直接访问connections建立响应式依赖 - 当连接变化时强制重新渲染
      const conns = connections.value
      // 构建本地occupied端口Set，用于快速查询
      const occupiedPorts = new Set()
      conns.forEach(c => {
        occupiedPorts.add(c.portA.portId)
        occupiedPorts.add(c.portB.portId)
      })
      
      const { device, width, height } = props
      if (!device) return null
      const deviceType = device.device_type || device.type
      if (!deviceType) return null
      const devColor = statusColor(device.status)
      const contentW = width - RACK_EAR_W * 2

      // 创建一个增强版portStateStore，使用本地occupiedPorts进行查询
      const reactivePortState = {
        ...portStateStore,
        isPortOccupied: (deviceId, portId) => {
          const fullId = deviceId + '-' + portId
          return occupiedPorts.has(fullId)
        },
        getPortConnection: (deviceId, portId) => {
          const fullId = deviceId + '-' + portId
          const conn = conns.find(c => c.portA.portId === fullId || c.portB.portId === fullId)
          if (!conn) return null
          const isA = conn.portA.portId === fullId
          const remote = isA ? conn.portB : conn.portA
          return {
            connectionId: conn.id,
            remoteDeviceId: remote.deviceId,
            remoteDeviceName: remote.deviceName,
            remotePortId: remote.portId,
            remotePortNum: remote.portNum,
            cableType: conn.cableType,
            createdAt: conn.createdAt
          }
        }
      }

      // 厂商真实面板图优先：型号命中注册表（海康/大华）时直接应用真实正面板图
      const vendorEntry = matchVendorPanel(device)
      if (vendorEntry) {
        return renderVendorImagePanel(width, height, device, vendorEntry)
      }

      switch (deviceType) {
        case 'switch':
          return renderSwitchPanel(width, height, devColor, contentW, device, emit, reactivePortState)
        case 'server':
          return renderServerPanel(width, height, devColor, contentW, device)
        case 'firewall':
          return renderFirewallPanel(width, height, devColor, contentW, device, emit, reactivePortState)
        case 'storage':
          return renderStoragePanel(width, height, devColor, contentW, device)
        case 'router':
          return renderRouterPanel(width, height, devColor, contentW, device, emit, reactivePortState)
        case 'pdu':
          return renderPDUPanel(width, height, devColor, contentW, device)
        case 'kvm':
          return renderKVMPanel(width, height, devColor, contentW, device)
        case 'patch_panel':
          return renderPatchPanel(width, height, device, zoomPatchLabels, emit, reactivePortState)
        case 'cable_manager':
          return renderCableManager(width, height, device)
        case 'odf':
          return renderODFPanel(width, height, device)
        case 'fiber_tray':
          return renderFiberTrayPanel(width, height, device, emit, reactivePortState)
        default:
          return renderServerPanel(width, height, devColor, contentW, device)
      }
    }
  }
})

// ===== 挂耳组件（与机柜中一致）=====
const RackEarsComponent = defineComponent({
  name: 'RackEarsComponent',
  props: { device: Object, width: Number, height: Number, color: { type: String, default: '#2a2a2a' } },
  setup(props) {
    return () => {
      const { width, height, device, color } = props
      const vColor = getVendorColor(device?.vendor || device?.brand)
      const accent = vColor.primary
      const leftHoleX = 1
      const rightHoleX = width - 1
      const leftEarStart = leftHoleX - 8
      const leftEarEnd = leftHoleX + 8
      const leftEarWidth = leftEarEnd - leftEarStart
      const rightEarStart = rightHoleX - 8
      const rightEarEnd = rightHoleX + 8
      const rightEarWidth = rightEarEnd - rightEarStart
      const uHeight = device?.u_height || device?.uSize || 1
      const screwYs = getEarScrewPositions(height, uHeight)
      const els = []
      els.push(h('rect', { x: leftEarStart, y: 0, width: leftEarWidth, height, fill: color, stroke: '#111', 'stroke-width': 0.5 }))
      els.push(h('line', { x1: leftEarStart + 1.5, y1: 2, x2: leftEarStart + 1.5, y2: height - 2, stroke: '#444', 'stroke-width': 0.3 }))
      els.push(h('line', { x1: leftEarEnd - 1.5, y1: 2, x2: leftEarEnd - 1.5, y2: height - 2, stroke: '#111', 'stroke-width': 0.3 }))
      for (let i = 2; i < height - 2; i += 5) {
        els.push(h('line', { x1: leftEarStart + 2, y1: i, x2: leftEarEnd - 2, y2: i + 1, stroke: '#3a3a3a', 'stroke-width': 0.2 }))
      }
      screwYs.forEach((y) => {
        els.push(h('circle', { cx: leftHoleX, cy: y, r: HOLE_SIZE / 2 + 0.3, fill: '#1a1a1a', stroke: accent, 'stroke-width': 0.5 }))
        els.push(h('circle', { cx: leftHoleX, cy: y, r: HOLE_SIZE / 2 - 0.5, fill: '#3a3a3a', stroke: '#555', 'stroke-width': 0.2 }))
        els.push(h('line', { x1: leftHoleX - HOLE_SIZE / 2 + 0.8, y1: y, x2: leftHoleX + HOLE_SIZE / 2 - 0.8, y2: y, stroke: '#111', 'stroke-width': 0.3 }))
        els.push(h('line', { x1: leftHoleX, y1: y - HOLE_SIZE / 2 + 0.8, x2: leftHoleX, y2: y + HOLE_SIZE / 2 - 0.8, stroke: '#111', 'stroke-width': 0.3 }))
      })
      els.push(h('rect', { x: rightEarStart, y: 0, width: rightEarWidth, height, fill: color, stroke: '#111', 'stroke-width': 0.5 }))
      els.push(h('line', { x1: rightEarStart + 1.5, y1: 2, x2: rightEarStart + 1.5, y2: height - 2, stroke: '#444', 'stroke-width': 0.3 }))
      els.push(h('line', { x1: rightEarEnd - 1.5, y1: 2, x2: rightEarEnd - 1.5, y2: height - 2, stroke: '#111', 'stroke-width': 0.3 }))
      for (let i = 2; i < height - 2; i += 5) {
        els.push(h('line', { x1: rightEarStart + 2, y1: i, x2: rightEarEnd - 2, y2: i + 1, stroke: '#3a3a3a', 'stroke-width': 0.2 }))
      }
      screwYs.forEach((y) => {
        els.push(h('circle', { cx: rightHoleX, cy: y, r: HOLE_SIZE / 2 + 0.3, fill: '#1a1a1a', stroke: accent, 'stroke-width': 0.5 }))
        els.push(h('circle', { cx: rightHoleX, cy: y, r: HOLE_SIZE / 2 - 0.5, fill: '#3a3a3a', stroke: '#555', 'stroke-width': 0.2 }))
        els.push(h('line', { x1: rightHoleX - HOLE_SIZE / 2 + 0.8, y1: y, x2: rightHoleX + HOLE_SIZE / 2 - 0.8, y2: y, stroke: '#111', 'stroke-width': 0.3 }))
        els.push(h('line', { x1: rightHoleX, y1: y - HOLE_SIZE / 2 + 0.8, x2: rightHoleX, y2: y + HOLE_SIZE / 2 - 0.8, stroke: '#111', 'stroke-width': 0.3 }))
      })
      return h('g', { style: { pointerEvents: 'none' } }, els)
    }
  }
})

export { RackEarsComponent }
export default DevicePanelRenderer
