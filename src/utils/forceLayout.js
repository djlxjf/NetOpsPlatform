/**
 * 力导向图布局算法
 * 
 * 实现基于 Fruchterman-Reingold 算法的力导向图布局
 * 适用于网络拓扑图的可视化布局
 */

/**
 * 创建力导向图模拟器
 * @param {Object} options 配置选项
 * @returns {Object} 模拟器对象
 */
export function createForceLayout(options = {}) {
  const {
    width = 3000,        // 画布宽度
    height = 2000,       // 画布高度
    nodeSpacing = 150,    // 节点间距
    edgeLength = 200,     // 理想边长
    iterations = 300,     // 迭代次数
    alpha = 1,            // 初始温度
    alphaDecay = 0.028,  // 温度衰减率
    alphaMin = 0.001,    // 最小温度
    gravity = 0.1,       // 重力强度
    centerGravity = 0.3,  // 中心引力
  } = options
  
  let nodes = []
  let edges = []
  let simulation = null
  
  /**
   * 初始化节点和边
   * @param {Array} nodeList 节点列表
   * @param {Array} edgeList 边列表
   */
  function initialize(nodeList, edgeList) {
    nodes = nodeList.map(node => ({
      id: node.id,
      x: node.x || width / 2 + (Math.random() - 0.5) * 100,
      y: node.y || height / 2 + (Math.random() - 0.5) * 100,
      vx: 0,  // x 轴速度
      vy: 0,  // y 轴速度
      fixed: node.fixed || false,
    }))
    
    edges = edgeList.map(edge => ({
      source: edge.source,
      target: edge.target,
      weight: edge.weight || 1,
    }))
  }
  
  /**
   * 计算库仑力（节点间斥力）
   */
  function calculateRepulsion() {
    const k = Math.sqrt(width * height / nodes.length) * nodeSpacing / 100
    
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x
        const dy = nodes[j].y - nodes[i].y
        let distance = Math.sqrt(dx * dx + dy * dy)
        
        // 避免距离为 0
        if (distance < 1) distance = 1
        
        // 斥力公式：F = k^2 / distance
        const force = (k * k) / distance
        const fx = (dx / distance) * force
        const fy = (dy / distance) * force
        
        nodes[i].vx -= fx
        nodes[i].vy -= fy
        nodes[j].vx += fx
        nodes[j].vy += fy
      }
    }
  }
  
  /**
   * 计算胡克力（边的引力）
   */
  function calculateAttraction() {
    for (const edge of edges) {
      const sourceNode = nodes.find(n => n.id === edge.source)
      const targetNode = nodes.find(n => n.id === edge.target)
      
      if (!sourceNode || !targetNode) continue
      
      const dx = targetNode.x - sourceNode.x
      const dy = targetNode.y - sourceNode.y
      let distance = Math.sqrt(dx * dx + dy * dy)
      
      // 避免距离为 0
      if (distance < 1) distance = 1
      
      // 引力公式：F = (distance - edgeLength) * weight
      const force = (distance - edgeLength) * edge.weight
      const fx = (dx / distance) * force
      const fy = (dy / distance) * force
      
      sourceNode.vx += fx
      sourceNode.vy += fy
      targetNode.vx -= fx
      targetNode.vy -= fy
    }
  }
  
  /**
   * 计算重力（向中心吸引）
   */
  function calculateGravity() {
    const centerX = width / 2
    const centerY = height / 2
    
    for (const node of nodes) {
      const dx = centerX - node.x
      const dy = centerY - node.y
      
      node.vx += dx * centerGravity
      node.vy += dy * centerGravity
    }
  }
  
  /**
   * 更新节点位置
   * @param {number} alpha 当前温度
   */
  function updatePositions(alpha) {
    for (const node of nodes) {
      if (node.fixed) continue
      
      // 应用速度
      node.x += node.vx * alpha
      node.y += node.vy * alpha
      
      // 边界约束
      node.x = Math.max(50, Math.min(width - 50, node.x))
      node.y = Math.max(50, Math.min(height - 50, node.y))
      
      // 重置速度
      node.vx = 0
      node.vy = 0
    }
  }
  
  /**
   * 运行一次迭代
   * @param {number} currentAlpha 当前温度
   */
  function tick(currentAlpha) {
    calculateRepulsion()
    calculateAttraction()
    calculateGravity()
    updatePositions(currentAlpha)
  }
  
  /**
   * 运行完整模拟
   * @returns {Array} 布局后的节点列表
   */
  function run() {
    let currentAlpha = alpha
    
    for (let i = 0; i < iterations && currentAlpha > alphaMin; i++) {
      tick(currentAlpha)
      currentAlpha *= (1 - alphaDecay)
    }
    
    return nodes.map(n => ({
      id: n.id,
      x: Math.round(n.x),
      y: Math.round(n.y),
    }))
  }
  
  /**
   * 逐步运行模拟（用于动画）
   * @param {Function} onTick 每次迭代的回调函数
   * @returns {Promise} 模拟完成的 Promise
   */
  function runAnimated(onTick) {
    return new Promise((resolve) => {
      let currentAlpha = alpha
      let iteration = 0
      
      function animate() {
        if (iteration >= iterations || currentAlpha < alphaMin) {
          resolve(nodes.map(n => ({
            id: n.id,
            x: Math.round(n.x),
            y: Math.round(n.y),
          })))
          return
        }
        
        tick(currentAlpha)
        currentAlpha *= (1 - alphaDecay)
        iteration++
        
        // 调用回调
        if (onTick) {
          onTick(nodes.map(n => ({ ...n })), currentAlpha, iteration)
        }
        
        // 使用 requestAnimationFrame 实现平滑动画
        requestAnimationFrame(animate)
      }
      
      animate()
    })
  }
  
  return {
    initialize,
    run,
    runAnimated,
    tick,
  }
}

/**
 * 应用力导向图布局到拓扑图
 * @param {Array} nodes 节点列表
 * @param {Array} edges 边列表
 * @param {Object} options 布局选项
 * @returns {Array} 布局后的节点列表
 */
export function applyForceLayout(nodes, edges, options = {}) {
  const layout = createForceLayout(options)
  layout.initialize(nodes, edges)
  return layout.run()
}

/**
 * 应用力导向图布局（带动画）
 * @param {Array} nodes 节点列表
 * @param {Array} edges 边列表
 * @param {Function} onTick 每次迭代的回调函数
 * @param {Object} options 布局选项
 * @returns {Promise} 布局完成的 Promise
 */
export function applyForceLayoutAnimated(nodes, edges, onTick, options = {}) {
  const layout = createForceLayout(options)
  layout.initialize(nodes, edges)
  return layout.runAnimated(onTick)
}

export default {
  createForceLayout,
  applyForceLayout,
  applyForceLayoutAnimated,
}