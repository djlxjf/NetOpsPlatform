/**
 * NodeRenderer - 节点渲染器
 * 负责渲染设备节点（圆角矩形、图标、状态灯、文字、端口标记）
 */
import { NOC_THEME, getStatusStyle } from './theme.js'
import { drawDeviceIcon } from './device-icons.js'

export class NodeRenderer {
  constructor(engine) {
    this.engine = engine
  }

  /** 渲染所有节点 */
  render(ctx, nodes) {
    for (const node of nodes) {
      this.renderNode(ctx, node)
    }
  }

  /** 渲染单个节点 */
  renderNode(ctx, node) {
    const { x, y, width = 120, height = 120, deviceType, label, status, ip } = node
    const radius = NOC_THEME.nodeRadius
    const statusStyle = getStatusStyle(status)

    ctx.save()

    // 1. 设备图标（居中偏上）— 无外框模式，图标直接显示在画布上
    const iconSize = 40
    const iconX = x + (width - iconSize) / 2
    const iconY = y + 15
    drawDeviceIcon(ctx, deviceType, iconX, iconY, iconSize)

    // 4. 状态指示灯（右上角）
    const lightX = x + width - 14
    const lightY = y + 10
    ctx.beginPath()
    ctx.arc(lightX, lightY, 5, 0, Math.PI * 2)
    ctx.fillStyle = statusStyle.color
    ctx.fill()
    // 发光效果
    if (statusStyle.glow && statusStyle.glow !== 'none') {
      ctx.shadowColor = statusStyle.color
      ctx.shadowBlur = 8
      ctx.beginPath()
      ctx.arc(lightX, lightY, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    }

    // 5. 设备名（图标下方居中）
    ctx.fillStyle = NOC_THEME.nodeLabel
    ctx.font = '12px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const labelY = iconY + iconSize + 6
    // 文字截断
    const maxWidth = width - 12
    const displayLabel = this._truncateText(ctx, label || '未知', maxWidth)
    ctx.fillText(displayLabel, x + width / 2, labelY)

    // 6. IP 地址（设备名下方）
    if (ip) {
      ctx.fillStyle = NOC_THEME.nodeIp
      ctx.font = '10px "Microsoft YaHei", sans-serif'
      const ipY = labelY + 16
      ctx.fillText(ip, x + width / 2, ipY)
    }

    // 7. 端口标记已移除（eNSP 风格：纯图标+名称，节点四边无小圆点，避免“隐形框”感）

    ctx.restore()
  }

  /** 渲染选中高亮（无外框模式：仅高亮状态灯，不绘制边框/手柄） */
  renderSelection(ctx, node) {
    // 选中态：状态灯加粗发光，不画任何外框
    const { x, y, width = 120, status } = node
    const statusStyle = getStatusStyle(status)
    const lightX = x + width - 14
    const lightY = y + 10
    ctx.save()
    ctx.shadowColor = statusStyle.color
    ctx.shadowBlur = 14
    ctx.beginPath()
    ctx.arc(lightX, lightY, 6, 0, Math.PI * 2)
    ctx.fillStyle = statusStyle.color
    ctx.fill()
    ctx.restore()
  }

  /** 渲染悬浮高亮（无外框模式：不绘制任何悬浮边框，避免隐形框感） */
  renderHover(ctx, node) {
    // 无外框模式：悬浮时不绘制任何边框
    // 鼠标悬停的视觉反馈由光标样式（move）提供
  }

  /** 渲染端口标记 */
  _renderPortDots(ctx, node) {
    const { x, y, width = 120, height = 120, ports = [] } = node
    if (!ports || ports.length === 0) return

    const dotR = NOC_THEME.portRadius
    const positions = [
      { dx: width / 2, dy: 0 },        // 上
      { dx: width, dy: height / 2 },    // 右
      { dx: width / 2, dy: height },    // 下
      { dx: 0, dy: height / 2 }         // 左
    ]

    const count = Math.min(ports.length, 4)
    for (let i = 0; i < count; i++) {
      const pos = positions[i]
      ctx.beginPath()
      ctx.arc(x + pos.dx, y + pos.dy, dotR, 0, Math.PI * 2)
      ctx.fillStyle = '#22d3ee'
      ctx.fill()
    }
  }

  /** 绘制圆角矩形 */
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
  }

  /** 截断文字 */
  _truncateText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text
    let truncated = text
    while (truncated.length > 0 && ctx.measureText(truncated + '...').width > maxWidth) {
      truncated = truncated.slice(0, -1)
    }
    return truncated + '...'
  }
}