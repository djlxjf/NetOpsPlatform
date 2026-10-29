/**
 * LayoutEngine - 力导向自动布局引擎
 * Fruchterman-Reingold 算法
 */
export class LayoutEngine {
  constructor(engine) {
    this.engine = engine
    this.store = engine.store
  }

  /**
   * 执行力导向布局
   * @param {number} width - 画布宽度
   * @param {number} height - 画布高度
   * @param {number} iterations - 迭代次数（默认100）
   */
  layout(width, height, iterations = 100) {
    const nodes = this.store.nodes
    const edges = this.store.edges
    if (nodes.length === 0) return

    // 过滤固定节点
    const movableNodes = nodes.filter(n => !n.fixed)
    const fixedNodes = nodes.filter(n => n.fixed)

    // 如果没有可移动节点，直接返回
    if (movableNodes.length === 0) return

    // 计算理想距离
    const area = width * height
    const k = Math.sqrt(area / nodes.length)

    // 初始化温度
    let temperature = width / 10
    const minTemp = 0.5

    // 如果节点没有初始位置，随机分布
    for (const node of movableNodes) {
      if (node.x === undefined || node.y === undefined) {
        node.x = Math.random() * width * 0.6 + width * 0.2
        node.y = Math.random() * height * 0.6 + height * 0.2
      }
    }

    // 迭代计算
    for (let iter = 0; iter < iterations; iter++) {
      // 计算每个节点的受力
      const forces = {}
      for (const node of movableNodes) {
        forces[node.id] = { fx: 0, fy: 0 }
      }

      // 斥力：所有节点之间
      const allNodes = [...fixedNodes, ...movableNodes]
      for (let i = 0; i < allNodes.length; i++) {
        for (let j = i + 1; j < allNodes.length; j++) {
          const a = allNodes[i]
          const b = allNodes[j]
          let dx = b.x - a.x
          let dy = b.y - a.y
          let dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 1) dist = 1

          const force = k * k / dist
          const fx = force * dx / dist
          const fy = force * dy / dist

          if (!a.fixed && forces[a.id]) {
            forces[a.id].fx -= fx
            forces[a.id].fy -= fy
          }
          if (!b.fixed && forces[b.id]) {
            forces[b.id].fx += fx
            forces[b.id].fy += fy
          }
        }
      }

      // 引力：有连线的节点之间
      for (const edge of edges) {
        const source = nodes.find(n => n.id === edge.source)
        const target = nodes.find(n => n.id === edge.target)
        if (!source || !target) continue

        let dx = target.x - source.x
        let dy = target.y - source.y
        let dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 1) dist = 1

        const force = dist * dist / k
        const fx = force * dx / dist
        const fy = force * dy / dist

        if (!source.fixed && forces[source.id]) {
          forces[source.id].fx += fx
          forces[source.id].fy += fy
        }
        if (!target.fixed && forces[target.id]) {
          forces[target.id].fx -= fx
          forces[target.id].fy -= fy
        }
      }

      // 应用力（温度控制）
      for (const node of movableNodes) {
        const f = forces[node.id]
        if (!f) continue

        let fMag = Math.sqrt(f.fx * f.fx + f.fy * f.fy)
        if (fMag < 0.1) continue

        const moveX = (f.fx / fMag) * Math.min(fMag, temperature)
        const moveY = (f.fy / fMag) * Math.min(fMag, temperature)

        node.x += moveX
        node.y += moveY

        // 边界约束
        node.x = Math.max(20, Math.min(width - 20, node.x))
        node.y = Math.max(20, Math.min(height - 20, node.y))
      }

      // 降温
      temperature *= (1 - iter / iterations)
      if (temperature < minTemp) break
    }

    // 防重叠微调
    this._resolveOverlaps(movableNodes)

    // 居中适配
    this._centerLayout(movableNodes, width, height)

    // 更新 store
    this.store.setNodes([...nodes])
    this.engine.markDirty('nodes')
  }

  /** 防重叠处理 */
  _resolveOverlaps(nodes) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]
        const b = nodes[j]
        const minDist = 130 // 最小间距
        let dx = b.x - a.x
        let dy = b.y - a.y
        let dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < minDist && dist > 0) {
          const overlap = minDist - dist
          const angle = Math.atan2(dy, dx)
          const pushX = overlap * Math.cos(angle) / 2
          const pushY = overlap * Math.sin(angle) / 2
          a.x -= pushX
          a.y -= pushY
          b.x += pushX
          b.y += pushY
        }
      }
    }
  }

  /** 居中布局 */
  _centerLayout(nodes, width, height) {
    if (nodes.length === 0) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of nodes) {
      minX = Math.min(minX, n.x)
      minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x)
      maxY = Math.max(maxY, n.y)
    }
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const offsetX = width / 2 - cx
    const offsetY = height / 2 - cy
    for (const n of nodes) {
      n.x += offsetX
      n.y += offsetY
    }
  }
}