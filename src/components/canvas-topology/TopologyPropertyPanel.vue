<template>
  <div class="topology-property-panel">
    <div class="panel-header">
      <span class="panel-title">属性</span>
      <el-button v-if="hasSelection" size="small" text @click="handleClose">
        <el-icon><Close /></el-icon>
      </el-button>
    </div>

    <!-- 未选中状态 -->
    <div v-if="!hasSelection" class="panel-empty">
      <el-empty description="选中节点或连线查看详情" :image-size="60" />
    </div>

    <!-- 节点属性（只读，编辑去设备管理） -->
    <div v-else-if="selectedNode" class="panel-body">
      <div class="node-head">
        <span class="node-icon" v-html="getSvg(selectedNode.deviceType)"></span>
        <span class="node-name">{{ selectedNode.label }}</span>
        <span class="status-tag" :style="statusStyle">{{ statusLabel }}</span>
      </div>

      <el-descriptions :column="1" size="small" border class="node-desc">
        <el-descriptions-item label="类型">{{ typeLabel }}</el-descriptions-item>
        <el-descriptions-item label="IP 地址">{{ selectedNode.ip || '未设置' }}</el-descriptions-item>
        <el-descriptions-item label="厂商">{{ selectedNode.vendor || '未设置' }}</el-descriptions-item>
        <el-descriptions-item label="型号">{{ selectedNode.model || '未设置' }}</el-descriptions-item>
        <el-descriptions-item label="坐标">({{ Math.round(selectedNode.x) }}, {{ Math.round(selectedNode.y) }})</el-descriptions-item>
      </el-descriptions>

      <div class="panel-actions">
        <el-button size="small" type="primary" plain @click="goToDevices">
          <el-icon><Switch /></el-icon>
          去设备管理编辑
        </el-button>
        <el-button v-if="canSsh" size="small" type="success" plain @click="openSsh">
          <el-icon><Monitor /></el-icon>
          SSH 命令配置
        </el-button>
        <el-button size="small" type="danger" plain @click="emit('delete-node', selectedNode.id)">
          <el-icon><Delete /></el-icon>
          删除设备
        </el-button>
      </div>
    </div>

    <!-- 连线属性（详情 + 断开） -->
    <div v-else-if="selectedEdge" class="panel-body">
      <div class="edge-head">
        <span class="cable-badge" :class="selectedEdge.linkType">{{ selectedEdge.cableType || '未知线缆' }}</span>
        <span class="edge-status" :class="selectedEdge.status">
          {{ selectedEdge.status === 'down' ? '链路中断' : '链路正常' }}
        </span>
      </div>

      <el-descriptions :column="1" size="small" border class="node-desc">
        <el-descriptions-item label="连接类型">
          {{ selectedEdge.linkType === 'fiber' ? '光纤' : '网线（铜缆）' }}
        </el-descriptions-item>
        <el-descriptions-item label="线缆规格">{{ selectedEdge.cableType || '-' }}</el-descriptions-item>
        <el-descriptions-item label="A端设备">{{ selectedEdge.sourceDeviceName || '未知' }}</el-descriptions-item>
        <el-descriptions-item label="A端端口">
          <span class="port-tag port-a">{{ selectedEdge.sourcePort || '-' }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="B端设备">{{ selectedEdge.targetDeviceName || '未知' }}</el-descriptions-item>
        <el-descriptions-item label="B端端口">
          <span class="port-tag port-b">{{ selectedEdge.targetPort || '-' }}</span>
        </el-descriptions-item>
      </el-descriptions>

      <div class="panel-actions">
        <el-button size="small" type="danger" plain @click="emit('delete-edge', selectedEdge.id)">
          <el-icon><Connection /></el-icon>
          断开连接
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Close, Delete, Switch, Connection, Monitor } from '@element-plus/icons-vue'
import { DEVICE_TYPE_META, STATUS_META } from '@/constants/topology'
import { getDeviceSvg } from './device-icons.js'

const props = defineProps({
  selectedNode: { type: Object, default: null },
  selectedEdge: { type: Object, default: null }
})

const emit = defineEmits(['update-node', 'update-edge', 'delete-node', 'delete-edge', 'close', 'open-ssh'])

// 可 SSH 的网络设备类型（交换机/路由器/防火墙/无线/负载均衡/网关）
const SSHABLE_TYPES = ['switch', 'router', 'firewall', 'wireless', 'loadbalancer', 'gateway']
const canSsh = computed(() => {
  if (!props.selectedNode) return false
  const t = props.selectedNode.deviceType
  return SSHABLE_TYPES.includes(t) && !!props.selectedNode.ip
})

const hasSelection = computed(() => Boolean(props.selectedNode || props.selectedEdge))
const typeLabel = computed(() => {
  if (!props.selectedNode) return '-'
  return DEVICE_TYPE_META[props.selectedNode.deviceType]?.label || '其他'
})
const statusLabel = computed(() => {
  if (!props.selectedNode) return '-'
  return STATUS_META[props.selectedNode.status]?.label || '未知'
})
const statusStyle = computed(() => {
  if (!props.selectedNode) return {}
  const meta = STATUS_META[props.selectedNode.status] || STATUS_META.unknown
  return { color: meta.color, background: meta.bg }
})

function getSvg(type) {
  return getDeviceSvg(type, 28)
}

function goToDevices() {
  if (props.selectedNode) {
    // 跳转到设备管理（哈希路由）
    window.location.hash = '#/devices'
  }
}

function openSsh() {
  if (props.selectedNode) {
    emit('open-ssh', props.selectedNode)
  }
}

function handleClose() {
  emit('close')
}
</script>

<style scoped>
.topology-property-panel {
  width: 280px;
  height: 100%;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
  overflow-y: auto;
  flex-shrink: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-color);
}

.panel-empty {
  padding: 40px 10px;
}

.panel-body {
  padding: 14px;
}

.node-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.node-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.node-name {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  flex-shrink: 0;
}

.node-desc {
  margin-bottom: 12px;
}

.edge-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.cable-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 12px;
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

.edge-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
}

.edge-status.active {
  background: var(--accent-soft);
  color: var(--accent);
}

.edge-status.down {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.port-tag {
  font-family: 'Consolas', monospace;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
}

.port-tag.port-a {
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.12);
}

.port-tag.port-b {
  color: #ec4899;
  background: rgba(236, 72, 153, 0.12);
}

.panel-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
