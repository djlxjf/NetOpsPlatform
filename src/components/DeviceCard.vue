<template>
  <div class="device-card" @click="$emit('click', device)">
    <div class="device-card-header">
      <div class="device-type-icon" :class="device.type">
        <el-icon size="20"><component :is="getDeviceIcon(device.type)" /></el-icon>
      </div>
      <div class="device-title">
        <span class="device-name">{{ device.name }}</span>
        <el-tag size="small" :type="getVendorTagType(device.vendor)" class="vendor-tag">
          {{ device.vendor }}
        </el-tag>
      </div>
      <div class="device-status">
        <span class="status-dot" :class="device.status"></span>
      </div>
    </div>
    
    <div class="device-card-body">
      <div class="device-info-row">
        <el-icon size="14"><Monitor /></el-icon>
        <span class="info-label">IP:</span>
        <span class="info-value">{{ device.ip || '-' }}</span>
      </div>
      <div class="device-info-row">
        <el-icon size="14"><SetUp /></el-icon>
        <span class="info-label">型号:</span>
        <span class="info-value">{{ device.model || '-' }}</span>
      </div>
      <div class="device-info-row">
        <el-icon size="14"><Location /></el-icon>
        <span class="info-label">位置:</span>
        <span class="info-value">{{ getDeviceLocation(device) }}</span>
      </div>
    </div>
    
    <div class="device-card-actions" @click.stop>
      <el-button 
        size="small" 
        type="primary" 
        @click="$emit('connect', device)"
        class="action-btn"
      >
        <el-icon><Monitor /></el-icon>
      </el-button>
      <el-button 
        size="small" 
        @click="$emit('edit', device)"
        class="action-btn"
      >
        <el-icon><Edit /></el-icon>
      </el-button>
      <el-button 
        size="small" 
        type="danger" 
        @click="$emit('delete', device)"
        class="action-btn"
      >
        <el-icon><Delete /></el-icon>
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue'
import { Monitor, SetUp, Location, Edit, Delete } from '@element-plus/icons-vue'
import { useDeviceStore, useCabinetStore } from '../stores'

const props = defineProps({
  device: {
    type: Object,
    required: true
  }
})

defineEmits(['click', 'connect', 'edit', 'delete'])

const deviceStore = useDeviceStore()
const cabinetStore = useCabinetStore()

function getDeviceIcon(type) {
  const icons = { 
    switch: 'Connection', 
    router: 'Share', 
    firewall: 'Lock', 
    server: 'Monitor', 
    wireless: 'Promotion',
    other: 'Cpu' 
  }
  return icons[type] || 'Cpu'
}

function getVendorTagType(vendor) {
  const map = { 
    '华为': '', 
    '华三(H3C)': 'success', 
    '锐捷': 'warning', 
    'TP-Link': 'info', 
    '思科(Cisco)': 'danger' 
  }
  return map[vendor] || ''
}

function getDeviceLocation(device) {
  if (!device?.id) return device?.location || '-'
  
  const cabinet = cabinetStore.cabinets.find(c => {
    if (c.slots) return Object.values(c.slots).includes(device.id)
    return false
  })
  
  if (cabinet && cabinet.slots) {
    const occupiedUs = []
    Object.entries(cabinet.slots).forEach(([u, deviceId]) => {
      if (deviceId === device.id) occupiedUs.push(parseInt(u))
    })
    if (occupiedUs.length > 0) {
      occupiedUs.sort((a, b) => a - b)
      const startU = occupiedUs[0]
      const endU = occupiedUs[occupiedUs.length - 1]
      const uRange = startU === endU ? `U${startU}` : `U${startU}-U${endU}`
      return `${cabinet.name}，${uRange}`
    }
  }
  
  return device.location || '-'
}
</script>

<style scoped>
.device-card {
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 12px;
}

.device-card:hover {
  border-color: var(--accent);
  box-shadow: 0 4px 16px rgba(0, 122, 204, 0.2);
  transform: translateY(-1px);
}

.device-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.device-type-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-glass-strong);
  color: var(--text-secondary);
}

.device-type-icon.switch {
  color: var(--info);
}

.device-type-icon.firewall {
  color: var(--danger);
}

.device-type-icon.server {
  color: var(--accent);
}

.device-title {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.device-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.vendor-tag {
  align-self: flex-start;
  font-size: 10px;
}

.device-status {
  display: flex;
  align-items: center;
}

.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.online {
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent-glow);
}

.status-dot.offline {
  background: var(--danger);
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
}

.device-card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.device-info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.info-label {
  color: var(--text-muted);
  min-width: 40px;
}

.info-value {
  color: var(--text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-card-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.action-btn {
  padding: 6px 12px !important;
}

/* 超小屏幕优化 */
@media (max-width: 375px) {
  .device-card-actions {
    flex-direction: column;
  }
  
  .device-card-actions .el-button {
    width: 100%;
  }
}
</style>
