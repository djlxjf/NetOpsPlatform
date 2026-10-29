/**
 * InteractionManager - 交互管理器
 * 处理鼠标/键盘事件：拖拽、连线、框选、平移、缩放
 */
export class InteractionManager {
  constructor(engine) {
    this.engine = engine
    this.store = engine.store
    this.canvas = engine.canvas
    this.hitTest = engine.hitTest

    // 交互状态
    this.isDragging = false
    this.isPanning = false
    this.isSelecting = false
    this.isConnecting = false
    this.dragTarget = null
    this.dragOffset = { x: 0, y: 0 }
    this.dragStart = { x: 0, y: 0 }
    this.dragCurrent = { x: 0, y: 0 }
    this.selectBox = null
    this.hoveredNode = null
    this.hoveredEdge = null
    this.draggingEdge = null

    // 网格吸附
    this.gridSize = 20

    // 绑定事件
    this._onMouseDown = this._onMouseDown.bind(this)
    this._onMouseMove = this._onMouseMove.bind(this)
    this._onMouseUp = this._onMouseUp.bind(this)
    this._onWheel = this._onWheel.bind(this)
    this._onKeyDown = this._onKeyDown.bind(this)
    this._onContextMenu = this._onContextMenu.bind(this)
    this._onDoubleClick = this._onDoubleClick.bind(this)
  }

  bindEvents() {
    this.canvas.addEventListener('mousedown', this._onMouseDown)
    this.canvas.addEventListener('mousemove', this._onMouseMove)
    this.canvas.addEventListener('mouseup', this._onMouseUp)
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false })
    this.canvas.addEventListener('contextmenu', this._onContextMenu)
    this.canvas.addEventListener('dblclick', this._onDoubleClick)
    window.addEventListener('keydown', this._onKeyDown)
  }

  unbindEvents() {
    this.canvas.removeEventListener('mousedown', this._onMouseDown)
    this.canvas.removeEventListener('mousemove', this._onMouseMove)
    this.canvas.removeEventListener('mouseup', this._onMouseUp)
    this.canvas.removeEventListener('wheel', this._onWheel)
    this.canvas.removeEventListener('contextmenu', this._onContextMenu)
    this.canvas.removeEventListener('dblclick', this._onDoubleClick)
    window.removeEventListener('keydown', this._onKeyDown)
  }

  /** 获取画布坐标 */
  _getCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  /** 网格吸附 */
  _snapToGrid(val) {
    return Math.round(val / this.gridSize) * this.gridSize
  }

  /** 鼠标按下 */
  _onMouseDown(e) {
    const pos = this._getCanvasPos(e)
    const worldPos = this.engine.screenToWorld(pos.x, pos.y)

    // 左键
    if (e.button === 0) {
      // 命中检测：节点 → 端口 → 连线 → 空白
      const hitNode = this.hitTest.hitNode(worldPos.x, worldPos.y)
      const hitPort = hitNode ? this.hitTest.hitPort(hitNode, worldPos.x, worldPos.y) : null
      const hitEdge = !hitNode ? this.hitTest.hitEdge(worldPos.x, worldPos.y) : null

      if (hitNode && hitPort) {
        // 开始创建连线
        this.isConnecting = true
        this.draggingEdge = {
          from: { x: hitNode.x + hitNode.width / 2, y: hitNode.y + hitNode.height / 2 },
          to: { x: worldPos.x, y: worldPos.y },
          sourceNode: hitNode,
          sourcePort: hitPort.portId
        }
        this.store.clearSelection()
        this.engine.markDirty('overlay')
      } else if (hitNode) {
        // 开始拖拽节点
        this.isDragging = true
        this.dragTarget = hitNode
        this.dragOffset = { x: worldPos.x - hitNode.x, y: worldPos.y - hitNode.y }
        this.dragStart = { x: hitNode.x, y: hitNode.y }

        if (!this.store.selectedNodeIds.includes(hitNode.id)) {
          if (!e.ctrlKey) this.store.clearSelection()
          this.store.selectNode(hitNode.id, e.ctrlKey)
        }
        // 派发节点点击事件（TopologyCanvas → TopologyView 选中属性面板）
        this.canvas.dispatchEvent(new CustomEvent('node:click', {
          detail: { node: hitNode }
        }))
        this.engine.markDirty('all')
      } else if (hitEdge) {
        // 选中连线
        this.store.clearSelection()
        this.store.selectEdge(hitEdge.id)
        // 派发连线点击事件
        this.canvas.dispatchEvent(new CustomEvent('edge:click', {
          detail: { edge: hitEdge }
        }))
        this.engine.markDirty('all')
      } else {
        // 空白区域：左键直接平移画布（无框选，可上下左右拖动）
        this.isPanning = true
        this.dragStart = { x: pos.x, y: pos.y }
        // 派发画布空白点击事件（TopologyView → 取消选中属性面板）
        this.canvas.dispatchEvent(new CustomEvent('canvas:click', {
          detail: {}
        }))
        this.engine.markDirty('all')
      }
    }

    // 中键 = 平移
    if (e.button === 1) {
      this.isPanning = true
      this.dragStart = { x: pos.x, y: pos.y }
      e.preventDefault()
    }
  }

  /** 鼠标移动 */
  _onMouseMove(e) {
    const pos = this._getCanvasPos(e)
    const worldPos = this.engine.screenToWorld(pos.x, pos.y)

    if (this.isDragging && this.dragTarget) {
      // 拖拽节点
      let newX = worldPos.x - this.dragOffset.x
      let newY = worldPos.y - this.dragOffset.y
      newX = this._snapToGrid(newX)
      newY = this._snapToGrid(newY)

      // 拖拽选中的多个节点
      for (const nodeId of this.store.selectedNodeIds) {
        const node = this.store.getNodeById(nodeId)
        if (node) {
          const dx = nodeId === this.dragTarget.id ? newX - this.dragTarget.x : newX - this.dragTarget.x
          const dy = nodeId === this.dragTarget.id ? newY - this.dragTarget.y : newY - this.dragTarget.y
          if (nodeId === this.dragTarget.id) {
            node.x = newX
            node.y = newY
          } else {
            node.x += (nodeId === this.dragTarget.id ? 0 : worldPos.x - this.dragStart.x - this.dragOffset.x)
            node.y += (nodeId === this.dragTarget.id ? 0 : worldPos.y - this.dragStart.y - this.dragOffset.y)
          }
          node.fixed = true
        }
      }
      this.dragTarget.x = newX
      this.dragTarget.y = newY
      this.engine.markDirty('nodes')
      this.engine.markDirty('edges')
    } else if (this.isPanning) {
      // 平移画布
      const dx = pos.x - this.dragStart.x
      const dy = pos.y - this.dragStart.y
      this.engine.viewport.x += dx
      this.engine.viewport.y += dy
      this.dragStart = { x: pos.x, y: pos.y }
      this.store.setViewport(this.engine.viewport.x, this.engine.viewport.y, this.engine.viewport.zoom)
      this.engine.markDirty('all')
    } else if (this.isSelecting) {
      // 框选
      this.selectBox.x2 = worldPos.x
      this.selectBox.y2 = worldPos.y
      this.engine.markDirty('selection')
    } else if (this.isConnecting && this.draggingEdge) {
      // 拖拽连线
      this.draggingEdge.to = { x: worldPos.x, y: worldPos.y }
      this.engine.markDirty('overlay')
    } else {
      // 悬浮检测
      this._updateHover(worldPos.x, worldPos.y, pos.x, pos.y)
    }

    // 更新画布光标样式
    this._updateCursor(e)
  }

  /** 鼠标释放 */
  _onMouseUp(e) {
    if (this.isDragging) {
      this.isDragging = false
      // 拖拽结束：坐标写回 layout store（持久化）
      if (this.dragTarget && typeof this.store.setNodePosition === 'function') {
        this.store.setNodePosition(this.dragTarget.id, this.dragTarget.x, this.dragTarget.y, true)
      }
      this.dragTarget = null
      this.store.save?.()
      this.engine.markDirty('all')
    }

    if (this.isPanning) {
      this.isPanning = false
    }

    if (this.isSelecting) {
      this.isSelecting = false
      // 框选范围内的节点
      if (this.selectBox) {
        const x1 = Math.min(this.selectBox.x1, this.selectBox.x2)
        const y1 = Math.min(this.selectBox.y1, this.selectBox.y2)
        const x2 = Math.max(this.selectBox.x1, this.selectBox.x2)
        const y2 = Math.max(this.selectBox.y1, this.selectBox.y2)
        for (const node of this.store.nodes) {
          if (node.x >= x1 && node.x + node.width <= x2 &&
              node.y >= y1 && node.y + node.height <= y2) {
            if (!this.store.selectedNodeIds.includes(node.id)) {
              this.store.selectedNodeIds.push(node.id)
            }
          }
        }
        this.selectBox = null
      }
      this.engine.markDirty('all')
    }

    if (this.isConnecting && this.draggingEdge) {
      this.isConnecting = false
      const pos = this._getCanvasPos(e)
      const worldPos = this.engine.screenToWorld(pos.x, pos.y)
      const targetNode = this.hitTest.hitNode(worldPos.x, worldPos.y)

      if (targetNode && targetNode.id !== this.draggingEdge.sourceNode.id) {
        // 连线创建：转发给 portStateStore.connectPorts（权威数据源）
        // 源端口已由 hitPort 解析（portId 可能是 'eth1' 短键，需拼全键）
        const src = this.draggingEdge.sourceNode
        const srcPortKey = this.draggingEdge.sourcePort || 'eth1'
        const tgtPortKey = 'eth1' // 目标端口默认第一个网口

        const result = this.store.connectPorts?.({
          deviceId: src.id,
          portId: srcPortKey,
          deviceName: src.label,
          portNum: srcPortKey,
          portType: 'ethernet'
        }, {
          deviceId: targetNode.id,
          portId: tgtPortKey,
          deviceName: targetNode.label,
          portNum: tgtPortKey,
          portType: 'ethernet'
        }, '六类网线')

        if (result?.success) {
          this.canvas.dispatchEvent(new CustomEvent('connection-created', {
            detail: { connection: result.connection }
          }))
        } else if (result) {
          console.warn('[Topology] 连接创建失败:', result.message)
        }
      }

      this.draggingEdge = null
      this.engine.markDirty('all')
    }
  }

  /** 滚轮缩放 */
  _onWheel(e) {
    // 直接滚轮缩放（不需要按住 Ctrl），Ctrl+滚轮也保持兼容
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    // 以鼠标位置为中心缩放
    const pos = this._getCanvasPos(e)
    this.engine.zoomAt(pos.x, pos.y, delta)
  }

  /** 键盘事件 */
  _onKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

    // Delete / Backspace 删除：边 → 断开连接；节点 → 删设备（带确认，由 TopologyView 处理）
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      if (this.store.selectedEdgeIds.length > 0) {
        this.canvas.dispatchEvent(new CustomEvent('edge:delete', {
          detail: { edgeId: this.store.selectedEdgeIds[0] }
        }))
      } else if (this.store.selectedNodeIds.length > 0) {
        this.canvas.dispatchEvent(new CustomEvent('node:delete', {
          detail: { nodeId: this.store.selectedNodeIds[0] }
        }))
      }
      this.engine.markDirty('all')
    }
    // Ctrl+A 全选
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault()
      this.store.selectAll()
      this.engine.markDirty('all')
    }
    // Escape 取消选中
    if (e.key === 'Escape') {
      this.store.clearSelection()
      this.engine.markDirty('all')
    }
  }

  /** 右键菜单 */
  _onContextMenu(e) {
    e.preventDefault()
  }

  /** 双击节点 */
  _onDoubleClick(e) {
    const pos = this._getCanvasPos(e)
    const worldPos = this.engine.screenToWorld(pos.x, pos.y)
    const hitNode = this.hitTest.hitNode(worldPos.x, worldPos.y)
    if (hitNode) {
      // 触发设备详情事件
      this.canvas.dispatchEvent(new CustomEvent('node:dblclick', {
        detail: { node: hitNode }
      }))
    }
  }

  /** 更新悬浮状态（wx/wy 世界坐标，sx/sy 屏幕坐标） */
  _updateHover(wx, wy, sx, sy) {
    const hitNode = this.hitTest.hitNode(wx, wy)
    const hitEdge = !hitNode ? this.hitTest.hitEdge(wx, wy) : null

    if (hitNode !== this.hoveredNode) {
      this.hoveredNode = hitNode
      this.engine.markDirty('overlay')
    }
    if (hitEdge !== this.hoveredEdge) {
      this.hoveredEdge = hitEdge
      this.engine.markDirty('overlay')
      // 连线悬停：派发 tooltip 事件（TopologyCanvas 监听显示 HTML tooltip）
      if (hitEdge && sx !== undefined && sy !== undefined) {
        this.canvas.dispatchEvent(new CustomEvent('edge:hover', {
          detail: { edge: hitEdge, screenX: sx, screenY: sy }
        }))
      } else {
        this.canvas.dispatchEvent(new CustomEvent('edge:hover-leave', { detail: {} }))
      }
    }
  }

  /** 更新光标样式 */
  _updateCursor(e) {
    const pos = this._getCanvasPos(e)
    const worldPos = this.engine.screenToWorld(pos.x, pos.y)
    const hitNode = this.hitTest.hitNode(worldPos.x, worldPos.y)
    const hitPort = hitNode ? this.hitTest.hitPort(hitNode, worldPos.x, worldPos.y) : null
    const hitEdge = !hitNode ? this.hitTest.hitEdge(worldPos.x, worldPos.y) : null

    if (e.ctrlKey || e.metaKey) {
      this.canvas.style.cursor = 'grab'
    } else if (hitPort) {
      this.canvas.style.cursor = 'crosshair'
    } else if (hitNode) {
      this.canvas.style.cursor = 'move'
    } else if (hitEdge) {
      this.canvas.style.cursor = 'pointer'
    } else {
      // 空白区域：抓手光标提示可拖动平移
      this.canvas.style.cursor = 'grab'
    }
  }
}