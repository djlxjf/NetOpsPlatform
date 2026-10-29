<template>
  <div class="topology-toolbar">
    <div class="toolbar-left">
      <el-tooltip content="自动布局" placement="bottom">
        <el-button size="small" @click="$emit('auto-layout')">
          <el-icon><Refresh /></el-icon>
          自动布局
        </el-button>
      </el-tooltip>

      <el-tooltip content="撤销 (Ctrl+Z)" placement="bottom">
        <el-button size="small" @click="$emit('undo')">
          <el-icon><RefreshLeft /></el-icon>
        </el-button>
      </el-tooltip>

      <el-tooltip content="重做 (Ctrl+Y)" placement="bottom">
        <el-button size="small" @click="$emit('redo')">
          <el-icon><RefreshRight /></el-icon>
        </el-button>
      </el-tooltip>

      <el-tooltip content="适配画布" placement="bottom">
        <el-button size="small" @click="$emit('zoom-fit')">
          <el-icon><FullScreen /></el-icon>
          适配画布
        </el-button>
      </el-tooltip>

      <el-divider direction="vertical" />

      <!-- 缩放控制：缩小 / 百分比 / 放大 / 适配 -->
      <div class="zoom-controls">
        <el-tooltip content="缩小" placement="bottom">
          <el-button size="small" :disabled="zoom <= 10" @click="zoomOut">
            <el-icon><Minus /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip content="缩放（滚轮可直接缩放）" placement="bottom">
          <span class="zoom-label">{{ zoom }}%</span>
        </el-tooltip>
        <el-tooltip content="放大" placement="bottom">
          <el-button size="small" :disabled="zoom >= 400" @click="zoomIn">
            <el-icon><Plus /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
    </div>

    <div class="toolbar-right">
      <el-tooltip content="全屏" placement="bottom">
        <el-button size="small" @click="$emit('toggle-fullscreen')">
          <el-icon><FullScreen /></el-icon>
          {{ isFullscreen ? '退出全屏' : '全屏' }}
        </el-button>
      </el-tooltip>

      <el-tooltip content="导出 PNG" placement="bottom">
        <el-button size="small" @click="$emit('export-png')">
          <el-icon><Picture /></el-icon>
          导出图片
        </el-button>
      </el-tooltip>

      <el-tooltip content="导出拓扑快照 JSON" placement="bottom">
        <el-button size="small" @click="exportJSON">
          <el-icon><Upload /></el-icon>
          导出数据
        </el-button>
      </el-tooltip>

      <el-divider direction="vertical" />

      <el-tooltip content="重置布局" placement="bottom">
        <el-button size="small" type="danger" plain @click="clearCanvas">
          <el-icon><Delete /></el-icon>
          重置布局
        </el-button>
      </el-tooltip>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, RefreshLeft, RefreshRight, FullScreen, Upload, Picture, Delete, Plus, Minus } from '@element-plus/icons-vue'

// 派生式拓扑：store 由父组件注入（facade），不直接引 canvasTopology
const props = defineProps({
  store: { type: Object, required: true },
  isFullscreen: { type: Boolean, default: false }
})

const store = props.store
const zoom = ref(100)

const emit = defineEmits(['auto-layout', 'zoom-fit', 'export-png', 'export-json', 'zoom-in', 'zoom-out', 'toggle-fullscreen', 'undo', 'redo'])

// 监听 zoom 变化
watch(() => store.viewport.zoom, (val) => {
  zoom.value = Math.round((val || 1) * 100)
}, { immediate: true })

function zoomIn() { emit('zoom-in') }
function zoomOut() { emit('zoom-out') }

function exportJSON() {
  // 派生式：导出拓扑视图快照（由父组件 handleExport 实现）
  emit('export-json')
}

function importJSON() {
  // 派生式：不支持导入画布 JSON（数据由设备/机柜管理驱动）
  ElMessage.info('拓扑数据由设备管理与机柜管理自动同步，不支持手动导入')
}

function clearCanvas() {
  ElMessageBox.confirm('确定要重置拓扑布局吗？节点与连线数据不会被删除（由设备/机柜管理驱动）。', '确认重置', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    store.clear?.()
    store.save?.()
    ElMessage.success('布局已重置')
  }).catch(() => {})
}
</script>

<style scoped>
.topology-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.toolbar-left, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.zoom-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: 'Consolas', monospace;
  min-width: 48px;
  text-align: center;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 2px;
}

.zoom-controls .el-button {
  padding: 5px 6px;
}

:deep(.el-button) {
  border-color: rgba(255, 255, 255, 0.15);
  color: var(--text-primary);
  background: transparent;
}

:deep(.el-button:hover) {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(0, 122, 204, 0.1);
}

:deep(.el-button--danger) {
  color: var(--accent-red);
}

:deep(.el-button--danger:hover) {
  border-color: var(--accent-red);
  color: var(--accent-red);
  background: rgba(241, 76, 76, 0.1);
}

:deep(.el-divider--vertical) {
  height: 20px;
  border-color: rgba(255, 255, 255, 0.15);
  margin: 0 6px;
}
</style>