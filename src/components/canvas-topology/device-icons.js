/**
 * 真实设备 SVG 图标定义 v6.0
 * 纯 Canvas 版，使用 Path2D 缓存
 * 统一线条风格，支持 NOC 深色背景
 * v6.0: 接入 nVisual 彩色等距位图图标（switch/server/cloud/pc/router/firewall）
 */

// nVisual 位图图标注册表（源自「拓扑图图标.nvl」，彩色等距风格）
// 命中类型优先用位图绘制；未命中类型保留原线条风格
export const BITMAP_ICON_MAP = {
  switch: '/topo-icons/switch.svg', // 核心交换机
  server: '/topo-icons/server.svg', // 通用服务器
  nvr: '/topo-icons/terminal.svg', // NVR录像机（复用终端/控制器位图，drawDeviceIcon/getDeviceSvg 会叠加 NVR 角标区分）
  cloud: '/topo-icons/cloud.svg', // 网络云
  pc: '/topo-icons/terminal.svg', // 终端
  router: '/topo-icons/router.png', // 核心路由器
  firewall: '/topo-icons/firewall.svg' // 防火墙
}

// 位图 Image 缓存（type → HTMLImageElement）
const bitmapIconCache = {}

/**
 * 预加载全部位图图标（同步启动，异步完成）
 * @param {Function} onReady - 全部加载完成后的回调（触发画布重绘用）
 */
export function loadBitmapIcons(onReady) {
  const entries = Object.entries(BITMAP_ICON_MAP)
  if (!entries.length) { if (onReady) onReady(); return }
  let pending = entries.length
  let fired = false
  const done = () => {
    pending--
    if (pending <= 0 && !fired) { fired = true; if (onReady) onReady() }
  }
  for (const [type, src] of entries) {
    if (bitmapIconCache[type]) { done(); continue }
    const img = new Image()
    bitmapIconCache[type] = img
    img.onload = done
    img.onerror = () => { console.warn('[DeviceIcons] 位图图标加载失败:', type, src); done() }
    img.src = src
  }
}

/**
 * 获取已加载完成的位图图标
 * @returns {HTMLImageElement|null} 未加载完成时返回 null
 */
export function getBitmapIcon(type) {
  const img = bitmapIconCache[type]
  if (img && img.complete && img.naturalWidth > 0) return img
  return null
}

// 设备类型中文映射
export const DEVICE_TYPE_LABELS = {
  router: '路由器',
  switch: '交换机',
  firewall: '防火墙',
  loadbalancer: '负载均衡',
  server: '服务器',
  storage: '存储设备',
  wireless: '无线AP',
  ap: '无线AP',
  pc: 'PC电脑',
  printer: '打印机',
  camera: '摄像头',
  nvr: 'NVR录像机',
  cloud: '云网络',
  isp: '运营商',
  other: '其他'
}

/**
 * 将 SVG path 指令转换为 Canvas Path2D
 */
export function parseSvgPath(d) {
  try {
    return new Path2D(d)
  } catch (e) {
    console.warn('[DeviceIcons] SVG path 解析失败:', d)
    return new Path2D()
  }
}

// 缓存已解析的 Path2D 对象
const path2dCache = {}

/**
 * 获取设备图标的 Path2D 路径数组
 * 每个路径包含: { path: Path2D, stroke: string, fill: string, sw: number, cap: string }
 */
export function getDeviceIconPaths(type) {
  const icons = {
    router: [
      { d: 'M3 17h18M5 17v-3a2 2 0 012-2h10a2 2 0 012 2v3M7 17v2M17 17v2', stroke: '#22d3ee', fill: 'none', sw: 1.5, cap: 'round' },
      { d: 'M9 8l-2-2M15 8l2-2M12 8V5', stroke: '#22d3ee', fill: 'none', sw: 1.2, cap: 'round' },
      { d: 'M8 14h.01M12 14h.01M16 14h.01', stroke: '#94a3b8', fill: 'none', sw: 1.5, cap: 'round' }
    ],
    switch: [
      { d: 'M3 6h18v5H3zM3 13h18v5H3z', stroke: '#22d3ee', fill: 'rgba(34,211,238,0.1)', sw: 1.5 },
      { d: 'M6 8.5h.01M9 8.5h.01M12 8.5h.01M15 8.5h.01M18 8.5h.01M6 15.5h.01M9 15.5h.01M12 15.5h.01M15 15.5h.01M18 15.5h.01', stroke: '#22d3ee', fill: 'none', sw: 1.5, cap: 'round' }
    ],
    firewall: [
      { d: 'M3 5h18v14H3zM3 9h18M3 13h18M3 17h18M9 5v4M15 9v4M7 13v4M13 13v4', stroke: '#f59e0b', fill: 'rgba(245,158,11,0.1)', sw: 1.3 }
    ],
    loadbalancer: [
      { d: 'M12 3v4M8 7h8M6 11h12v6H6zM10 14h.01M14 14h.01', stroke: '#a855f7', fill: 'none', sw: 1.5, cap: 'round' },
      { d: 'M9 21l3-4 3 4M9 21h6', stroke: '#a855f7', fill: 'none', sw: 1.3, cap: 'round' }
    ],
    server: [
      { d: 'M4 4h16v6H4zM4 14h16v6H4z', stroke: '#22d3ee', fill: 'rgba(34,211,238,0.08)', sw: 1.5 },
      { d: 'M7 7h.01M7 17h.01', stroke: '#22d3ee', fill: 'none', sw: 1.5, cap: 'round' },
      { d: 'M10 7h7M10 17h7', stroke: '#94a3b8', fill: 'none', sw: 1, cap: 'round' }
    ],
    storage: [
      { d: 'M3 5h18v4H3zM3 11h18v4H3zM3 17h18v2H3z', stroke: '#22d3ee', fill: 'rgba(34,211,238,0.08)', sw: 1.5 },
      { d: 'M6 7h.01M6 13h.01M6 18h.01', stroke: '#22d3ee', fill: 'none', sw: 1.5, cap: 'round' }
    ],
    wireless: [
      { d: 'M12 20v.01M9 17a4 4 0 016 0M6 14a8 8 0 0112 0M3 11a12 12 0 0118 0', stroke: '#22d3ee', fill: 'none', sw: 1.5, cap: 'round' },
      { d: 'M12 4l2 2-2 2-2-2 2-2z', stroke: '#22d3ee', fill: 'rgba(34,211,238,0.2)', sw: 1.2 }
    ],
    ap: [
      { d: 'M12 20v.01M9 17a4 4 0 016 0M6 14a8 8 0 0112 0M3 11a12 12 0 0118 0', stroke: '#22d3ee', fill: 'none', sw: 1.5, cap: 'round' },
      { d: 'M12 4l2 2-2 2-2-2 2-2z', stroke: '#22d3ee', fill: 'rgba(34,211,238,0.2)', sw: 1.2 }
    ],
    pc: [
      { d: 'M3 5h18v11H3zM3 19h18M9 16v3M15 16v3', stroke: '#22d3ee', fill: 'rgba(34,211,238,0.08)', sw: 1.5 },
      { d: 'M8 10h8', stroke: '#94a3b8', fill: 'none', sw: 1, cap: 'round' }
    ],
    printer: [
      { d: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M6 14h12v7H6z', stroke: '#22d3ee', fill: 'rgba(34,211,238,0.08)', sw: 1.5, cap: 'round' },
      { d: 'M9 17h6', stroke: '#94a3b8', fill: 'none', sw: 1, cap: 'round' }
    ],
    camera: [
      { d: 'M3 7h4l2-3h6l2 3h4v12H3z', stroke: '#22d3ee', fill: 'rgba(34,211,238,0.08)', sw: 1.5 },
      { d: 'M12 13a3 3 0 100-6 3 3 0 000 6z', stroke: '#22d3ee', fill: 'none', sw: 1.5 },
      { d: 'M17 9h.01', stroke: '#22d3ee', fill: 'none', sw: 1.5, cap: 'round' }
    ],
    cloud: [
      { d: 'M7 18a5 5 0 010-10 7 7 0 0113 2 4 4 0 011 8H7z', stroke: '#a855f7', fill: 'rgba(168,85,247,0.1)', sw: 1.5 }
    ],
    isp: [
      { d: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18', stroke: '#a855f7', fill: 'none', sw: 1.3 },
      { d: 'M12 11a1 1 0 100 2 1 1 0 000-2z', stroke: '#a855f7', fill: '#a855f7', sw: 0 }
    ],
    other: [
      { d: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8v4M12 16h.01', stroke: '#64748b', fill: 'none', sw: 1.5, cap: 'round' }
    ]
  }
  // NVR 无独立线条图标：复用服务器图标（位图加载失败时的兑底，与位图版一致）
  icons.nvr = icons.server
  return icons[type] || icons.other
}

/**
 * 获取设备图标的 Path2D 缓存（带缓存）
 */
export function getDeviceIconPaths2D(type) {
  const key = 'icon_' + type
  if (path2dCache[key]) return path2dCache[key]

  const paths = getDeviceIconPaths(type)
  const result = paths.map(p => ({
    path: parseSvgPath(p.d),
    stroke: p.stroke,
    fill: p.fill,
    sw: p.sw,
    cap: p.cap
  }))
  path2dCache[key] = result
  return result
}

/**
 * NVR 角标：在服务器图标底部叠加白色 "NVR" 字符（深色描边保证在彩色位图上可读）
 */
function drawNvrBadge(ctx, x, y, size) {
  ctx.save()
  const fs = Math.max(9, Math.round(size * 0.28))
  ctx.font = `bold ${fs}px Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const tx = x + size / 2
  const ty = y + size
  ctx.lineWidth = Math.max(2, fs * 0.22)
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(13,17,23,0.9)'
  ctx.strokeText('NVR', tx, ty)
  ctx.fillStyle = '#ffffff'
  ctx.fillText('NVR', tx, ty)
  ctx.restore()
}

/**
 * 在 Canvas 上下文上绘制设备图标
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} type - 设备类型
 * @param {number} x - 图标左上角 x
 * @param {number} y - 图标左上角 y
 * @param {number} size - 图标尺寸
 */
export function drawDeviceIcon(ctx, type, x, y, size = 40) {
  // nVisual 彩色位图图标优先绘制
  const bmp = getBitmapIcon(type)
  if (bmp) {
    // 保持宽高比，在 size×size 区域内居中绘制
    const ratio = bmp.naturalWidth / bmp.naturalHeight
    let w = size
    let h = size
    if (ratio >= 1) { h = size / ratio } else { w = size * ratio }
    const dx = x + (size - w) / 2
    const dy = y + (size - h) / 2
    ctx.drawImage(bmp, dx, dy, w, h)
    if (type === 'nvr') drawNvrBadge(ctx, x, y, size) // NVR 复用服务器位图，叠角标区分
    return
  }
  // 原线条风格兜底
  const scale = size / 24
  const paths = getDeviceIconPaths2D(type)
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)

  for (const p of paths) {
    ctx.beginPath()
    if (p.fill && p.fill !== 'none') {
      ctx.fillStyle = p.fill
      ctx.fill(p.path)
    }
    if (p.stroke) {
      ctx.strokeStyle = p.stroke
      ctx.lineWidth = p.sw || 1.5
      if (p.cap) ctx.lineCap = p.cap
      ctx.stroke(p.path)
    }
  }
  ctx.restore()
  if (type === 'nvr') drawNvrBadge(ctx, x, y, size) // 线条兜底同样叠加 NVR 角标
}

export function getDeviceTypeLabel(type) {
  return DEVICE_TYPE_LABELS[type] || type || '未知'
}

/**
 * 获取设备 SVG 字符串（用于库面板显示）
 */
export function getDeviceSvg(type, size = 40) {
  // nVisual 位图图标：返回 img 标签（v-html 渲染）
  const bmpSrc = BITMAP_ICON_MAP[type]
  if (bmpSrc) {
    const img = `<img src="${bmpSrc}" alt="" draggable="false" style="width:${size}px;height:${size}px;object-fit:contain;display:block;margin:0 auto;" />`
    if (type === 'nvr') {
      // NVR：服务器图标 + 底部 NVR 角标（与画布 drawDeviceIcon 的角标一致）
      const fs = Math.max(9, Math.round(size * 0.28))
      return `<div style="position:relative;width:${size}px;height:${size}px;margin:0 auto;">` +
        `<img src="${bmpSrc}" alt="" draggable="false" style="width:${size}px;height:${size}px;object-fit:contain;display:block;" />` +
        `<span style="position:absolute;left:0;right:0;bottom:0;text-align:center;font:bold ${fs}px Arial,sans-serif;color:#fff;text-shadow:0 0 3px rgba(13,17,23,0.95),0 0 3px rgba(13,17,23,0.95),0 0 3px rgba(13,17,23,0.95);line-height:1;">NVR</span></div>`
    }
    return img
  }
  const paths = getDeviceIconPaths(type)
  const pathsStr = paths.map(p => {
    const attrs = []
    attrs.push(`d="${p.d}"`)
    if (p.stroke) attrs.push(`stroke="${p.stroke}"`)
    if (p.fill) attrs.push(`fill="${p.fill}"`)
    else attrs.push('fill="none"')
    if (p.sw) attrs.push(`stroke-width="${p.sw}"`)
    if (p.cap) attrs.push(`stroke-linecap="${p.cap}"`)
    return `<path ${attrs.join(' ')} />`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">${pathsStr}</svg>`
}