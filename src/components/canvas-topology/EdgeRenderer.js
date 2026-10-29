/**
 * EdgeRenderer - 连线渲染器
 * 负责渲染连线（曼哈顿/直线/曲线路由、A/B端端口标签）
 */
import { NOC_THEME, getEdgeStyle } from './theme.js'

export class EdgeRenderer {
  constructor(engine) {
    this.engine = engine
    this.store = engine.store
  }

  /** 渲染所有连线 */
  render(ctx, edges) {
    for (const edge of edges) {
      this.renderEdge(ctx, edge)
    }
  }

  /** 渲染单条连线 */
  renderEdge(ctx, edge) {
    const sourceNode = this.store.getNodeById(edge.source)
    const targetNode = this.store.getNodeById(edge.target)
    if (!sourceNode || !targetNode) return

    const edgeStyle = getEdgeStyle(edge.linkType, edge.status)
    // eNSP 连线规则：端点取面向对端节点的边中点（智能选择四边，线不穿节点图形）
    const sp = this._getPortPosition(sourceNode, edge.sourcePort, 'source', targetNode)
    const tp = this._getPortPosition(targetNode, edge.targetPort, 'target', sourceNode)

    ctx.save()

    // 发光效果
    if (edgeStyle.glow && edgeStyle.glow !== 'none') {
      ctx.shadowColor = edgeStyle.stroke
      ctx.shadowBlur = 6
    }

    // 绘制连线
    ctx.strokeStyle = edgeStyle.stroke
    ctx.lineWidth = edge.status === 'down' ? 2 : 2
    if (edge.status === 'down') {
      ctx.setLineDash([6, 4])
    }

    // 路由方式：默认直线（点对点直连，不拐弯）
    const router = edge.router || 'straight'
    if (router === 'straight') {
      this._drawStraightLine(ctx, sp, tp)
    } else if (router === 'curve') {
      this._drawCurveLine(ctx, sp, tp)
    } else {
      this._drawManhattanLine(ctx, sp, tp)
    }

    ctx.setLineDash([])
    ctx.shadowBlur = 0

    // 端口标签
    this._renderPortLabels(ctx, edge, sp, tp, sourceNode, targetNode)

    // 中间线缆标签
    if (edge.label) {
      this._renderCableLabel(ctx, edge, sp, tp)
    }

    // 数据流方向箭头（双向，表示链路双向流量）
    this._drawFlowArrows(ctx, sp, tp, edgeStyle.stroke)

    ctx.restore()
  }

  /** 绘制数据流方向箭头（A↔B 双向流量） */
  _drawFlowArrows(ctx, sp, tp, color) {
    const angle = Math.atan2(tp.y - sp.y, tp.x - sp.x)
    const len = 8
    ctx.save()
    ctx.fillStyle = color
    ctx.globalAlpha = 0.9

    // A 端箭头（指向 B，代表 A→B 数据流）
    const aHeadX = sp.x + Math.cos(angle) * 14
    const aHeadY = sp.y + Math.sin(angle) * 14
    ctx.beginPath()
    ctx.moveTo(aHeadX, aHeadY)
    ctx.lineTo(aHeadX - len * Math.cos(angle - 0.42), aHeadY - len * Math.sin(angle - 0.42))
    ctx.lineTo(aHeadX - len * Math.cos(angle + 0.42), aHeadY - len * Math.sin(angle + 0.42))
    ctx.closePath()
    ctx.fill()

    // B 端箭头（指向 A，代表 B→A 数据流）
    const bAngle = angle + Math.PI
    const bHeadX = tp.x + Math.cos(bAngle) * 14
    const bHeadY = tp.y + Math.sin(bAngle) * 14
    ctx.beginPath()
    ctx.moveTo(bHeadX, bHeadY)
    ctx.lineTo(bHeadX - len * Math.cos(bAngle - 0.42), bHeadY - len * Math.sin(bAngle - 0.42))
    ctx.lineTo(bHeadX - len * Math.cos(bAngle + 0.42), bHeadY - len * Math.sin(bAngle + 0.42))
    ctx.closePath()
    ctx.fill()

    ctx.restore()
  }

  /** 直线路由 */
  _drawStraightLine(ctx, sp, tp) {
    ctx.beginPath()
    ctx.moveTo(sp.x, sp.y)
    ctx.lineTo(tp.x, tp.y)
    ctx.stroke()
  }

  /** 贝塞尔曲线路由 */
  _drawCurveLine(ctx, sp, tp) {
    const dx = tp.x - sp.x
    const dy = tp.y - sp.y
    const cx1 = sp.x + dx * 0.4
    const cy1 = sp.y
    const cx2 = tp.x - dx * 0.4
    const cy2 = tp.y
    ctx.beginPath()
    ctx.moveTo(sp.x, sp.y)
    ctx.bezierCurveTo(cx1, cy1, cx2, cy2, tp.x, tp.y)
    ctx.stroke()
  }

  /** 曼哈顿路由（正交直角 + 圆角） */
  _drawManhattanLine(ctx, sp, tp) {
    const dx = tp.x - sp.x
    const dy = tp.y - sp.y
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)
    const radius = 8

    ctx.beginPath()
    ctx.moveTo(sp.x, sp.y)

    if (absDx > absDy) {
      // 水平为主
      const midX = sp.x + dx / 2
      ctx.lineTo(midX - radius, sp.y)
      ctx.quadraticCurveTo(midX, sp.y, midX, sp.y + Math.sign(dy) * radius)
      ctx.lineTo(midX, tp.y - Math.sign(dy) * radius)
      ctx.quadraticCurveTo(midX, tp.y, midX + radius, tp.y)
      ctx.lineTo(tp.x, tp.y)
    } else {
      // 垂直为主
      const midY = sp.y + dy / 2
      ctx.lineTo(sp.x, midY - radius)
      ctx.quadraticCurveTo(sp.x, midY, sp.x + Math.sign(dx) * radius, midY)
      ctx.lineTo(tp.x - Math.sign(dx) * radius, midY)
      ctx.quadraticCurveTo(tp.x, midY, tp.x, midY + radius)
      ctx.lineTo(tp.x, tp.y)
    }

    ctx.stroke()
  }

  /** 获取端口位置（eNSP 规则：智能选择面向对端节点的边中点，线不穿节点图形） */
  _getPortPosition(node, portId, type, otherNode) {
    const { x, y, width = 120, height = 120 } = node
    const cx = x + width / 2
    const cy = y + height / 2
    if (otherNode) {
      const ow = otherNode.width || 120
      const oh = otherNode.height || 120
      const dx = (otherNode.x + ow / 2) - cx
      const dy = (otherNode.y + oh / 2) - cy
      // 水平方向主导：取面向对端的左/右边；垂直方向主导：取面向对端的上/下边
      if (Math.abs(dx) >= Math.abs(dy)) {
        return dx >= 0 ? { x: x + width, y: cy } : { x: x, y: cy }
      } else {
        return dy >= 0 ? { x: cx, y: y + height } : { x: cx, y: y }
      }
    }
    // 兜底：无对端信息时 source 右侧、target 左侧
    if (type === 'source') {
      return { x: x + width, y: cy }
    } else {
      return { x: x, y: cy }
    }
  }

  /** 渲染端口标签 */
  _renderPortLabels(ctx, edge, sp, tp, sourceNode, targetNode) {
    const aPort = edge.sourcePortNum || edge.sourcePort || ''
    const bPort = edge.targetPortNum || edge.targetPort || ''
    const aName = edge.sourceDeviceName || sourceNode.label || ''
    const bName = edge.targetDeviceName || targetNode.label || ''

    ctx.font = '11px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'

    // A端标签（源端）
    const aLabel = `A: ${aPort}`
    const aLabelX = sp.x + 30
    const aLabelY = sp.y - 14
    this._drawLabelBg(ctx, aLabel, aLabelX, aLabelY, NOC_THEME.portLabelA)
    ctx.fillStyle = NOC_THEME.portLabelA.fill
    ctx.fillText(aLabel, aLabelX, aLabelY + 4)

    // B端标签（目标端）
    const bLabel = `B: ${bPort}`
    const bLabelX = tp.x - 30
    const bLabelY = tp.y - 14
    this._drawLabelBg(ctx, bLabel, bLabelX, bLabelY, NOC_THEME.portLabelB)
    ctx.fillStyle = NOC_THEME.portLabelB.fill
    ctx.fillText(bLabel, bLabelX, bLabelY + 4)
  }

  /** 绘制标签背景 */
  _drawLabelBg(ctx, text, x, y, style) {
    const metrics = ctx.measureText(text)
    const pad = 4
    const bw = metrics.width + pad * 2
    const bh = 18
    ctx.fillStyle = style.bg
    ctx.beginPath()
    ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, 3)
    ctx.fill()
  }

  /** 渲染中间线缆标签 */
  _renderCableLabel(ctx, edge, sp, tp) {
    const mx = (sp.x + tp.x) / 2
    const my = (sp.y + tp.y) / 2

    ctx.font = '11px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    this._drawLabelBg(ctx, edge.label, mx, my - 14, NOC_THEME.cableLabel)
    ctx.fillStyle = NOC_THEME.cableLabel.fill
    ctx.fillText(edge.label, mx, my - 10)
  }

  /** 渲染选中高亮 */
  renderSelection(ctx, edge) {
    const sourceNode = this.store.getNodeById(edge.source)
    const targetNode = this.store.getNodeById(edge.target)
    if (!sourceNode || !targetNode) return

    const sp = this._getPortPosition(sourceNode, edge.sourcePort, 'source', targetNode)
    const tp = this._getPortPosition(targetNode, edge.targetPort, 'target', sourceNode)

    ctx.save()
    ctx.strokeStyle = NOC_THEME.selection
    ctx.lineWidth = 3
    ctx.shadowColor = NOC_THEME.selection
    ctx.shadowBlur = 8
    this._drawStraightLine(ctx, sp, tp)
    ctx.restore()
  }

  /** 渲染悬浮高亮 */
  renderHover(ctx, edge) {
    const sourceNode = this.store.getNodeById(edge.source)
    const targetNode = this.store.getNodeById(edge.target)
    if (!sourceNode || !targetNode) return

    const sp = this._getPortPosition(sourceNode, edge.sourcePort, 'source', targetNode)
    const tp = this._getPortPosition(targetNode, edge.targetPort, 'target', sourceNode)

    ctx.save()
    ctx.strokeStyle = NOC_THEME.hover
    ctx.lineWidth = 2.5
    ctx.setLineDash([4, 4])
    this._drawStraightLine(ctx, sp, tp)
    ctx.setLineDash([])
    ctx.restore()
  }

  /** 渲染临时连线（拖拽中） */
  renderTempEdge(ctx, data) {
    ctx.save()
    ctx.strokeStyle = '#22d3ee'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.globalAlpha = 0.6
    this._drawStraightLine(ctx, data.from, data.to)
    ctx.setLineDash([])
    ctx.globalAlpha = 1
    ctx.restore()
  }
}