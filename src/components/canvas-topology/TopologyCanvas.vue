<template>
  <div class="canvas-container" ref="containerRef">
    <canvas
      ref="canvasRef"
      class="topology-canvas"
      @node:dblclick="onNodeDblClick"
    ></canvas>
    <!-- 加载提示 -->
    <div v-if="loading" class="canvas-loading">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>加载中...</span>
    </div>
    <!-- 空状态 -->
    <div v-if="!loading && store.nodes.length === 0" class="canvas-empty">
      <el-empty description="设备与连线将从「设备管理」「机柜管理」自动同步">
        <template #image>
          <svg viewBox="0 0 80 80" width="80" height="80" fill="none">
            <rect x="10" y="10" width="60" height="60" rx="8" stroke="#22d3ee" stroke-width="2" stroke-dasharray="6 4" fill="rgba(34,211,238,0.05)"/>
            <path d="M40 25v30M25 40h30" stroke="#22d3ee" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </template>
      </el-empty>
    </div>
    <!-- 连线悬停提示 -->
    <div
      v-if="hoverTooltip.visible"
      class="edge-tooltip"
      :style="{ left: hoverTooltip.x + 'px', top: hoverTooltip.y + 'px' }"
    >
      <div class="tooltip-cable">
        <span class="cable-badge" :class="hoverTooltip.edge?.linkType">{{ hoverTooltip.edge?.cableType || '未知线缆' }}</span>
      </div>
      <div class="tooltip-conn">
        <span class="conn-dev">{{ hoverTooltip.edge?.sourceDeviceName }}</span>
        <span v-if="hoverTooltip.edge?.sourceModel" class="conn-model">{{ hoverTooltip.edge.sourceModel }}</span>
        <span class="conn-u">[{{ hoverTooltip.edge?.sourceUHeight }}U]</span>/<span class="conn-port">{{ hoverTooltip.edge?.sourcePort }}</span>
        <span class="conn-sep">--</span>
        <span class="conn-dev">{{ hoverTooltip.edge?.targetDeviceName }}</span>
        <span v-if="hoverTooltip.edge?.targetModel" class="conn-model">{{ hoverTooltip.edge.targetModel }}</span>
        <span class="conn-u">[{{ hoverTooltip.edge?.targetUHeight }}U]</span>/<span class="conn-port">{{ hoverTooltip.edge?.targetPort }}</span>
      </div>
    </div>
    <!-- 角落信息 -->
    <div class="canvas-info">
      <span>节点: {{ store.totalNodes }} | 连线: {{ store.totalEdges }}</span>
      <span>缩放: {{ Math.round(engine?.viewport?.zoom * 100 || 100) }}%</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { CanvasEngine } from './CanvasEngine.js'
import { loadBitmapIcons } from './device-icons.js'

const props = defineProps({
  store: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['node-click', 'node-dblclick', 'edge-click', 'canvas-click', 'connection-created'])

const store = props.store
const containerRef = ref(null)
const canvasRef = ref(null)
const loading = ref(true)
const engine = ref(null)
const hoverTooltip = ref({ visible: false, x: 0, y: 0, edge: null })

// 初始化引擎
onMounted(async () => {
  await nextTick()
  if (!canvasRef.value) { loading.value = false; return }

  // 创建引擎（布局由 layout store 加载，引擎读 store.viewport）
  try {
    engine.value = new CanvasEngine(canvasRef.value, store)
    engine.value.init()
    // 预加载 nVisual 位图图标，加载完成后触发一次重绘
    loadBitmapIcons(() => {
      if (engine.value) engine.value.requestRender()
    })
  } catch (e) {
    console.error('[TopologyCanvas] 引擎初始化失败:', e)
  } finally {
    loading.value = false
  }

  // 连线悬停 tooltip
  canvasRef.value.addEventListener('edge:hover', (ev) => {
    const { edge, screenX, screenY } = ev.detail || {}
    if (edge) {
      hoverTooltip.value = { visible: true, x: screenX + 14, y: screenY + 14, edge }
    }
  })
  canvasRef.value.addEventListener('edge:hover-leave', () => {
    hoverTooltip.value = { visible: false, x: 0, y: 0, edge: null }
  })

  // 节点点击 → emit 给父组件（TopologyView 选中属性面板）
  canvasRef.value.addEventListener('node:click', (ev) => {
    const node = ev.detail?.node
    if (node) emit('node-click', node)
  })
  // 连线点击
  canvasRef.value.addEventListener('edge:click', (ev) => {
    const edge = ev.detail?.edge
    if (edge) emit('edge-click', edge)
  })
  // 画布空白点击
  canvasRef.value.addEventListener('canvas:click', () => {
    emit('canvas-click')
  })
  // 连线创建
  canvasRef.value.addEventListener('connection-created', (ev) => {
    emit('connection-created', ev.detail)
  })

  // 监听 store 变化，自动重绘
  watch(
    () => [store.nodes.length, store.edges.length, store.totalNodes, store.totalEdges],
    () => {
      engine.value?.markDirty('all')
      // 立即同步渲染一次（不依赖 rAF 循环，确保节点/连线变化后马上可见）
      engine.value?.render?.()
    }
  )

  // 自动适配视图：首次出现节点时自动缩放/平移，让全部设备节点可见
  // 修复“画布空白看不到设备”——节点坐标分层可能跨度很大，默认视口只显示局部
  let autoFitDone = false
  watch(
    () => store.nodes?.length || 0,
    (len) => {
      if (len > 0 && !autoFitDone) {
        autoFitDone = true
        const doFit = () => {
          engine.value?.zoomToFit?.()
          engine.value?.render?.() // 同步渲染，确保 fit 后立即显示节点
        }
        nextTick(doFit)
        setTimeout(doFit, 250) // 兜底：engine / nodes 可能延迟就绪
      }
    },
    { immediate: true }
  )

  console.log('[TopologyCanvas] 已初始化（派生式拓扑）')
})

// 销毁
onUnmounted(() => {
  engine.value?.destroy()
  engine.value = null
})

// 双击节点事件
function onNodeDblClick(e) {
  const node = e.detail?.node
  if (node) {
    console.log('[TopologyCanvas] 双击节点:', node.label)
  }
}

// 暴露方法给父组件
function refresh() {
  engine.value?.requestRender()
}

function zoomToFit() {
  engine.value?.zoomToFit()
}

function zoomIn() {
  engine.value?.zoomIn()
}

function zoomOut() {
  engine.value?.zoomOut()
}

function autoLayout() {
  if (!engine.value) return
  engine.value.layout?.layout?.(engine.value.width, engine.value.height, 100)
}

function exportPNG() {
  if (!engine.value) return
  const url = engine.value.toDataURL()
  const a = document.createElement('a')
  a.download = 'topology-' + Date.now() + '.png'
  a.href = url
  a.click()
}

// 连线悬停 tooltip 更新（InteractionManager 调用）
function showEdgeTooltip(edge, screenX, screenY) {
  hoverTooltip.value = { visible: true, x: screenX + 14, y: screenY + 14, edge }
}

function hideEdgeTooltip() {
  hoverTooltip.value = { visible: false, x: 0, y: 0, edge: null }
}

defineExpose({ refresh, zoomToFit, zoomIn, zoomOut, autoLayout, exportPNG, engine, showEdgeTooltip, hideEdgeTooltip })
</script>

<style scoped>
.canvas-container {
  position: relative;
  width: 100%;
  height: 100%;
  background: #0a0e27;
  overflow: hidden;
}

.topology-canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: default;
}

.canvas-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #94a3b8;
  font-size: 14px;
  background: rgba(10, 14, 39, 0.8);
}

.canvas-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.canvas-info {
  position: absolute;
  bottom: 8px;
  right: 12px;
  display: flex;
  gap: 16px;
  font-size: 11px;
  color: #64748b;
  font-family: 'Consolas', monospace;
  pointer-events: none;
}

/* 连线悬停提示 */
.edge-tooltip {
  position: absolute;
  z-index: 30;
  pointer-events: none;
  background: rgba(30, 41, 59, 0.95);
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 12px;
  color: #e2e8f0;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  min-width: 200px;
}

.tooltip-cable {
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #334155;
}

.cable-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.cable-badge.fiber {
  background: rgba(129, 140, 248, 0.2);
  color: #818cf8;
}

.cable-badge.copper {
  background: rgba(100, 116, 139, 0.2);
  color: #94a3b8;
}

.tooltip-end {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
}

.tooltip-conn {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-weight: 600;
  padding: 2px 0;
}

.conn-dev {
  color: #7dd3fc;
}

.conn-model {
  color: #c4b5fd;
  font-weight: 500;
  font-size: 11px;
}

.conn-u {
  color: #86efac;
  font-size: 11px;
  font-weight: 600;
}

.conn-port {
  color: #fbbf24;
  font-weight: 700;
}

.conn-sep {
  color: #94a3b8;
  margin: 0 4px;
}

.end-label {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  flex-shrink: 0;
}

.end-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.end-port {
  font-family: 'Consolas', monospace;
  font-size: 11px;
  color: #22d3ee;
  background: rgba(34, 211, 238, 0.1);
  padding: 1px 6px;
  border-radius: 3px;
  flex-shrink: 0;
}
</style>