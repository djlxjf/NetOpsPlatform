/**
 * CanvasEngine - 纯 Canvas 2D 核心渲染引擎
 * 游戏渲染循环模式，60fps，分层渲染
 */
import { NOC_THEME } from './theme.js'
import { NodeRenderer } from './NodeRenderer.js'
import { EdgeRenderer } from './EdgeRenderer.js'
import { InteractionManager } from './InteractionManager.js'
import { HitTest } from './HitTest.js'
import { LayoutEngine } from './LayoutEngine.js'

export class CanvasEngine {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('./store.js').CanvasTopologyStore} store
   */
  constructor(canvas, store) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.store = store

    // 子模块
    this.nodeRenderer = new NodeRenderer(this)
    this.edgeRenderer = new EdgeRenderer(this)
    this.hitTest = new HitTest(this)
    this.interaction = new InteractionManager(this)
    this.layout = new LayoutEngine(this)

    // 视口状态
    this.viewport = { x: 0, y: 0, zoom: 1 }
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)

    // 渲染控制
    this.rafId = null
    this.isRunning = false
    this.dirty = true
    this.frameCount = 0

    // Canvas 尺寸
    this.width = 0
    this.height = 0

    // 脏区域标记（按层）
    this.dirtyLayers = {
      background: true,
      grid: true,
      edges: true,
      nodes: true,
      selection: true,
      overlay: true
    }

    // 绑定方法
    this._loop = this._loop.bind(this)
    this._resize = this._resize.bind(this)
    this.resizeObserver = null
  }

  /** 初始化引擎 */
  init() {
    this._setupCanvas()
    this._setupResize()
    this._syncViewport()
    this.interaction.bindEvents()
    this.isRunning = true
    this._loop()
    console.log('[CanvasEngine] 初始化完成, DPR:', this.dpr)
  }

  /** 销毁引擎 */
  destroy() {
    this.isRunning = false
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.interaction.unbindEvents()
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }
    console.log('[CanvasEngine] 已销毁')
  }

  /** 设置 Canvas */
  _setupCanvas() {
    const rect = this.canvas.getBoundingClientRect()
    this.width = rect.width
    this.height = rect.height
    this.canvas.width = rect.width * this.dpr
    this.canvas.height = rect.height * this.dpr
    this.ctx.scale(this.dpr, this.dpr)
  }

  /** 监听尺寸变化 */
  _setupResize() {
    this.resizeObserver = new ResizeObserver(() => {
      this._resize()
    })
    this.resizeObserver.observe(this.canvas.parentElement || this.canvas)
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect()
    if (this.width === rect.width && this.height === rect.height) return
    this.width = rect.width
    this.height = rect.height
    this.canvas.width = rect.width * this.dpr
    this.canvas.height = rect.height * this.dpr
    // 重置缩放
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.markDirty('all')
  }

  /** 同步视口 */
  _syncViewport() {
    this.viewport.x = this.store.viewport.x
    this.viewport.y = this.store.viewport.y
    this.viewport.zoom = this.store.viewport.zoom
  }

  /** 标记脏区域 */
  markDirty(layer = 'all') {
    if (layer === 'all') {
      for (const key in this.dirtyLayers) {
        this.dirtyLayers[key] = true
      }
    } else if (this.dirtyLayers.hasOwnProperty(layer)) {
      this.dirtyLayers[layer] = true
    }
    this.dirty = true
  }

  /** 请求渲染 */
  requestRender() {
    this.markDirty('all')
  }

  /** 渲染循环 */
  _loop() {
    if (!this.isRunning) return
    this.rafId = requestAnimationFrame(this._loop)

    this.frameCount++
    // 检查 store 视口变化
    this._syncViewport()

    // 每帧渲染
    this.render()
  }

  /** 主渲染函数 */
  render() {
    const ctx = this.ctx
    const { width, height } = this
    const { x: vx, y: vy, zoom } = this.viewport

    // 规范化 nodes / edges 为数组，避免 store 暴露非数组结构（如 Set/Map/undefined）时渲染异常
    const nodes = Array.isArray(this.store?.nodes) ? this.store.nodes : (this.store?.nodes ? Array.from(this.store.nodes) : [])
    const edges = Array.isArray(this.store?.edges) ? this.store.edges : (this.store?.edges ? Array.from(this.store.edges) : [])

    // 始终重绘背景
    this._renderBackground(ctx, width, height)

    // 应用视口变换
    ctx.save()
    ctx.translate(vx, vy)
    ctx.scale(zoom, zoom)

    // 网格（仅在缩放变化时重绘）
    if (this.dirtyLayers.grid) {
      this._renderGrid(ctx, width, height)
      this.dirtyLayers.grid = false
    }

    // 连线层：只要有连线就始终重绘（背景每帧清屏，dirty 未刷新会导致连线消失）
    if (this.dirtyLayers.edges || edges.length > 0) {
      this.edgeRenderer.render(ctx, edges)
      this.dirtyLayers.edges = false
    }

    // 节点层：只要有节点就始终重绘（修复“画布空白看不到设备”）
    if (this.dirtyLayers.nodes || nodes.length > 0) {
      this.nodeRenderer.render(ctx, nodes)
      this.dirtyLayers.nodes = false
    }

    // 选中层
    if (this.dirtyLayers.selection) {
      this._renderSelection(ctx, nodes)
      this.dirtyLayers.selection = false
    }

    // 悬浮层（由交互管理器控制）
    if (this.dirtyLayers.overlay) {
      this._renderOverlay(ctx)
      this.dirtyLayers.overlay = false
    }

    ctx.restore()

    this.dirty = false
  }

  /** 渲染背景 */
  _renderBackground(ctx, width, height) {
    ctx.fillStyle = NOC_THEME.canvasBg
    ctx.fillRect(0, 0, width, height)
  }

  /** 渲染网格 */
  _renderGrid(ctx, width, height) {
    const { x: vx, y: vy, zoom } = this.viewport
    const gridSize = NOC_THEME.gridSize * zoom
    const dotRadius = NOC_THEME.gridDotRadius * Math.max(0.5, Math.min(zoom, 1))

    if (gridSize < 4) return // 缩放太小时不显示网格

    const startX = -(vx % gridSize)
    const startY = -(vy % gridSize)
    const cols = Math.ceil(width / gridSize) + 1
    const rows = Math.ceil(height / gridSize) + 1

    ctx.fillStyle = NOC_THEME.gridDotColor

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        ctx.beginPath()
        ctx.arc(startX + i * gridSize, startY + j * gridSize, dotRadius, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  /** 渲染选中状态 */
  _renderSelection(ctx, nodes) {
    const { selectedNodeIds, selectedEdgeIds } = this.store

    // 选中节点高亮
    for (const node of nodes) {
      if (selectedNodeIds.includes(node.id)) {
        this.nodeRenderer.renderSelection(ctx, node)
      }
    }

    // 选中连线高亮
    for (const edgeId of selectedEdgeIds) {
      const edge = this.store.getEdgeById(edgeId)
      if (edge) {
        this.edgeRenderer.renderSelection(ctx, edge)
      }
    }
  }

  /** 渲染悬浮层 */
  _renderOverlay(ctx) {
    // 由 InteractionManager 管理
    if (this.interaction.hoveredNode) {
      this.nodeRenderer.renderHover(ctx, this.interaction.hoveredNode)
    }
    if (this.interaction.hoveredEdge) {
      this.edgeRenderer.renderHover(ctx, this.interaction.hoveredEdge)
    }
    // 拖拽中的连线
    if (this.interaction.draggingEdge) {
      this.edgeRenderer.renderTempEdge(ctx, this.interaction.draggingEdge)
    }
  }

  /** 画布坐标转世界坐标 */
  screenToWorld(sx, sy) {
    return {
      x: (sx - this.viewport.x) / this.viewport.zoom,
      y: (sy - this.viewport.y) / this.viewport.zoom
    }
  }

  /** 世界坐标转画布坐标 */
  worldToScreen(wx, wy) {
    return {
      x: wx * this.viewport.zoom + this.viewport.x,
      y: wy * this.viewport.zoom + this.viewport.y
    }
  }

  /** 以屏幕坐标 (sx, sy) 为中心缩放，factor > 1 放大、< 1 缩小 */
  zoomAt(sx, sy, factor) {
    const oldZoom = this.viewport.zoom
    const newZoom = Math.max(0.1, Math.min(4, oldZoom * factor))
    const worldPos = this.screenToWorld(sx, sy)
    this.viewport.zoom = newZoom
    this.viewport.x = sx - worldPos.x * newZoom
    this.viewport.y = sy - worldPos.y * newZoom
    this.store.setViewport(this.viewport.x, this.viewport.y, newZoom)
    this.markDirty('all')
  }

  /** 以画布中心放大 */
  zoomIn() {
    this.zoomAt(this.width / 2, this.height / 2, 1.2)
  }

  /** 以画布中心缩小 */
  zoomOut() {
    this.zoomAt(this.width / 2, this.height / 2, 1 / 1.2)
  }

  /** 适配所有节点 */
  zoomToFit(padding = 50) {
    const nodes = this.store.nodes
    if (nodes.length === 0) return

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of nodes) {
      minX = Math.min(minX, n.x)
      minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x + (n.width || 120))
      maxY = Math.max(maxY, n.y + (n.height || 120))
    }

    const contentW = maxX - minX + padding * 2
    const contentH = maxY - minY + padding * 2
    const zoomX = (this.width - padding * 2) / contentW
    const zoomY = (this.height - padding * 2) / contentH
    const zoom = Math.min(zoomX, zoomY, 2)

    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2

    this.viewport.zoom = Math.max(0.1, zoom)
    this.viewport.x = this.width / 2 - cx * this.viewport.zoom
    this.viewport.y = this.height / 2 - cy * this.viewport.zoom

    this.store.setViewport(this.viewport.x, this.viewport.y, this.viewport.zoom)
    this.markDirty('all')
  }

  /** 截图导出 */
  toDataURL() {
    this.render()
    return this.canvas.toDataURL('image/png')
  }
}