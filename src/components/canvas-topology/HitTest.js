/**
 * HitTest - 命中检测
 * 检测鼠标位置是否命中节点、端口、连线
 */
export class HitTest {
  constructor(engine) {
    this.engine = engine
    this.store = engine.store
  }

  /** 检测是否命中节点 */
  hitNode(wx, wy) {
    // 从后往前遍历（上层节点优先）
    const nodes = this.store.nodes
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i]
      const { x, y, width = 120, height = 120 } = node
      if (wx >= x && wx <= x + width && wy >= y && wy <= y + height) {
        return node
      }
    }
    return null
  }

  /** 检测是否命中端口
   *  @returns {null|{node: object, portId: string, portIndex: number}}
   */
  hitPort(node, wx, wy) {
    const { x, y, width = 120, height = 120, ports = [] } = node
    if (!ports || ports.length === 0) return null

    const hitR = 8
    const positions = [
      { dx: width / 2, dy: 0, portId: 'top' },
      { dx: width, dy: height / 2, portId: 'right' },
      { dx: width / 2, dy: height, portId: 'bottom' },
      { dx: 0, dy: height / 2, portId: 'left' }
    ]

    for (let i = 0; i < Math.min(ports.length, 4); i++) {
      const pos = positions[i]
      const px = x + pos.dx
      const py = y + pos.dy
      const dist = Math.sqrt((wx - px) ** 2 + (wy - py) ** 2)
      if (dist <= hitR) {
        return { node, portId: ports[i]?.id || pos.portId, portIndex: i }
      }
    }
    return null
  }

  /** 检测是否命中连线 */
  hitEdge(wx, wy) {
    const threshold = 8
    const edges = this.store.edges

    for (let i = edges.length - 1; i >= 0; i--) {
      const edge = edges[i]
      const sourceNode = this.store.getNodeById(edge.source)
      const targetNode = this.store.getNodeById(edge.target)
      if (!sourceNode || !targetNode) continue

      const sp = this._getPortPosition(sourceNode, edge.sourcePort, 'source')
      const tp = this._getPortPosition(targetNode, edge.targetPort, 'target')

      // 计算点到线段距离
      const dist = this._pointToSegmentDist(wx, wy, sp.x, sp.y, tp.x, tp.y)
      if (dist <= threshold) {
        return edge
      }
    }
    return null
  }

  /** 获取端口位置 */
  _getPortPosition(node, portId, type) {
    const { x, y, width = 120, height = 120 } = node
    if (type === 'source') {
      return { x: x + width, y: y + height / 2 }
    } else {
      return { x: x, y: y + height / 2 }
    }
  }

  /** 点到线段距离 */
  _pointToSegmentDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1
    const dy = y2 - y1
    const lenSq = dx * dx + dy * dy
    if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2)

    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
    t = Math.max(0, Math.min(1, t))

    const nearX = x1 + t * dx
    const nearY = y1 + t * dy
    return Math.sqrt((px - nearX) ** 2 + (py - nearY) ** 2)
  }
}