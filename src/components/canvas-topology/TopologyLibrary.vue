<template>
  <div class="topology-library" :class="{ collapsed }">
    <div class="library-header" @click="$emit('toggle')">
      <span class="library-title">拓扑概览</span>
      <el-icon class="collapse-icon" :class="{ rotated: collapsed }"><ArrowLeft /></el-icon>
    </div>

    <template v-if="!collapsed">
      <!-- 统计 -->
      <div class="lib-stats">
        <div class="stat-item">
          <span class="stat-value">{{ nodes.length }}</span>
          <span class="stat-label">设备</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ edges.length }}</span>
          <span class="stat-label">连线</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ onlineCount }}</span>
          <span class="stat-label">在线</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ alertCount }}</span>
          <span class="stat-label">告警</span>
        </div>
      </div>

      <!-- 设备类型过滤 -->
      <div class="lib-section">
        <div class="lib-section-title">设备类型</div>
        <div class="type-filter-list">
          <div
            v-for="meta in typeGroups"
            :key="meta.type"
            class="type-filter-item"
            :class="{ active: isTypeActive(meta.type) }"
            @click="toggleType(meta.type)"
          >
            <span class="type-icon" v-html="getSvg(meta.type)"></span>
            <span class="type-name">{{ meta.label }}</span>
            <span class="type-count">{{ meta.count }}</span>
          </div>
        </div>
      </div>

      <!-- 状态图例 -->
      <div class="lib-section">
        <div class="lib-section-title">状态图例</div>
        <div class="status-legend">
          <div v-for="s in statusLegend" :key="s.key" class="legend-item">
            <span class="legend-dot" :style="{ background: s.color }"></span>
            <span class="legend-label">{{ s.label }}</span>
            <span class="legend-count">{{ s.count }}</span>
          </div>
        </div>
      </div>

      <!-- 连线图例 -->
      <div class="lib-section">
        <div class="lib-section-title">连线图例</div>
        <div class="link-legend">
          <div class="link-legend-item">
            <svg width="36" height="8" viewBox="0 0 36 8">
              <line x1="0" y1="4" x2="36" y2="4" stroke="#64748b" stroke-width="2" />
            </svg>
            <span>网线（铜缆）</span>
          </div>
          <div class="link-legend-item">
            <svg width="36" height="8" viewBox="0 0 36 8">
              <line x1="0" y1="4" x2="36" y2="4" stroke="#818cf8" stroke-width="3" />
            </svg>
            <span>光纤</span>
          </div>
          <div class="link-legend-item">
            <svg width="36" height="8" viewBox="0 0 36 8">
              <line x1="0" y1="4" x2="36" y2="4" stroke="#ef4444" stroke-width="2" stroke-dasharray="4 4" />
            </svg>
            <span>链路中断</span>
          </div>
        </div>
      </div>

      <div class="library-footer">
        <el-button size="small" @click="resetFilters" style="width: 100%">
          <el-icon><Refresh /></el-icon>
          重置过滤
        </el-button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ArrowLeft, Refresh } from '@element-plus/icons-vue'
import { DEVICE_TYPE_ORDER, DEVICE_TYPE_META, STATUS_ORDER, STATUS_META } from '@/constants/topology'
import { getDeviceSvg } from './device-icons.js'

const props = defineProps({
  collapsed: { type: Boolean, default: false },
  nodes: { type: Array, default: () => [] },
  edges: { type: Array, default: () => [] }
})

defineEmits(['toggle'])

// 类型过滤
const activeTypes = ref([])
const activeStatuses = ref([])

function toggleType(type) {
  const idx = activeTypes.value.indexOf(type)
  if (idx >= 0) activeTypes.value.splice(idx, 1)
  else activeTypes.value.push(type)
}

function isTypeActive(type) {
  return activeTypes.value.includes(type)
}

function toggleStatus(status) {
  const idx = activeStatuses.value.indexOf(status)
  if (idx >= 0) activeStatuses.value.splice(idx, 1)
  else activeStatuses.value.push(status)
}

function isStatusActive(status) {
  return activeStatuses.value.includes(status)
}

function resetFilters() {
  activeTypes.value = []
  activeStatuses.value = []
}

// 类型分组统计
const typeGroups = computed(() => {
  const map = {}
  for (const n of props.nodes) {
    const t = n.deviceType || 'other'
    map[t] = (map[t] || 0) + 1
  }
  return DEVICE_TYPE_ORDER
    .filter((t) => map[t] > 0)
    .map((t) => ({ type: t, label: DEVICE_TYPE_META[t].label, count: map[t] }))
})

// 状态图例统计
const statusLegend = computed(() => {
  const map = {}
  for (const n of props.nodes) map[n.status] = (map[n.status] || 0) + 1
  return STATUS_ORDER
    .filter((s) => map[s] > 0)
    .map((s) => ({ key: s, label: STATUS_META[s].label, color: STATUS_META[s].color, count: map[s] }))
})

const onlineCount = computed(() => props.nodes.filter((n) => n.status === 'online').length)
const alertCount = computed(() => props.nodes.filter((n) => n.status === 'alert').length)

function getSvg(type) {
  return getDeviceSvg(type, 22)
}
</script>

<style scoped>
.topology-library {
  display: flex;
  flex-direction: column;
  width: 220px;
  height: 100%;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  transition: width 0.2s ease;
  flex-shrink: 0;
}

.topology-library.collapsed {
  width: 42px;
}

.library-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  user-select: none;
}

.collapse-icon {
  transition: transform 0.2s ease;
}

.collapse-icon.rotated {
  transform: rotate(180deg);
}

.lib-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-light);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-value {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.stat-label {
  font-size: 10px;
  color: var(--text-muted);
}

.lib-section {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-light);
}

.lib-section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin-bottom: 8px;
}

.type-filter-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.type-filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
}

.type-filter-item:hover {
  background: var(--bg-hover);
}

.type-filter-item.active {
  background: rgba(0, 122, 204, 0.1);
  border-color: rgba(0, 122, 204, 0.4);
}

.type-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.type-name {
  flex: 1;
  font-size: 12px;
  color: var(--text-primary);
}

.type-count {
  font-size: 11px;
  color: var(--text-muted);
}

.status-legend {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  cursor: pointer;
  padding: 3px 4px;
  border-radius: 4px;
}

.legend-item:hover {
  background: var(--bg-hover);
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-label {
  flex: 1;
  color: var(--text-primary);
}

.legend-count {
  font-size: 11px;
  color: var(--text-muted);
}

.link-legend {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.link-legend-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--text-primary);
}

.library-footer {
  margin-top: auto;
  padding: 10px 12px;
  border-top: 1px solid var(--border-color);
}
</style>
