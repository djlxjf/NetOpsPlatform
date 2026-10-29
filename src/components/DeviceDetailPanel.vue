<template>
  <el-dialog 
    v-model="dialogVisible" 
    :title="(device?.name || '设备') + ' - ' + (panelMode === 'back' ? '后面板' : '前面板')" 
    width="1100px" 
    class="device-panel-dialog" 
    align-center
    @close="handleClose"
  >
    <div v-if="device" class="device-panel-content">
      <!-- 设备详细信息 -->
      <div class="device-detail-info">
        <div class="detail-info-grid">
          <div class="detail-info-item">
            <span class="detail-label">设备名称</span>
            <span class="detail-value">{{ device.name }}</span>
          </div>
          <div class="detail-info-item">
            <span class="detail-label">IP地址</span>
            <span class="detail-value ip">{{ device.ip || '-' }}</span>
          </div>
          <div class="detail-info-item">
            <span class="detail-label">厂商</span>
            <span class="detail-value">{{ device.vendor || '-' }}</span>
          </div>
          <div class="detail-info-item">
            <span class="detail-label">型号</span>
            <span class="detail-value">{{ device.model || '-' }}</span>
          </div>
          <div class="detail-info-item">
            <span class="detail-label">类型</span>
            <span class="detail-value">{{ device.type || '-' }}</span>
          </div>
          <div class="detail-info-item">
            <span class="detail-label">状态</span>
            <span class="detail-value" :class="device.status">
              {{ device.status === 'online' ? '在线' : '离线' }}
            </span>
          </div>
          <div class="detail-info-item">
            <span class="detail-label">U位</span>
            <span class="detail-value">{{ device.uSize || 1 }}U</span>
          </div>
          <div class="detail-info-item">
            <span class="detail-label">端口数</span>
            <span class="detail-value">{{ devicePanelPorts.length }}</span>
          </div>
        </div>
      </div>

      <!-- 端口区域 -->
      <div>
          <!-- 前面板端口区域 -->
          <div v-if="panelMode === 'front'" class="device-front-panel">
          <!-- 前面板无端口提示 -->
          <div v-if="devicePanelPorts.length === 0" class="empty-panel-notice">
            <el-icon size="20"><InfoFilled /></el-icon>
            <span>该设备前面板未配置端口</span>
          </div>
          <!-- RJ45网口 -->
          <div v-if="panelEthernetPorts.length > 0" class="port-section">
            <div class="section-header">
              <span class="section-count">{{ panelEthernetPorts.length }}口</span>
            </div>
            <!-- 交换机使用两排交错排列 -->
            <div v-if="isPanelSwitchDevice" class="rj45-ports-real" :class="{ compact: isLargePortCount }">
              <!-- 上排：偶数端口 -->
              <div class="port-row top-row">
                <div
                  v-for="port in panelEthernetTopRow"
                  :key="port.id"
                  class="rj45-port"
                  :class="{ connected: port.connected, 'has-data': port.hasData }"
                  @click.stop="onPortClick(port)"
                  @mouseenter.stop="showPortTooltip($event, port)" @mouseleave.stop="hidePortTooltip()"
                >
                  <div class="rj45-body">
                    <div class="rj45-top"></div>
                    <div class="rj45-pins">
                      <div class="pin" v-for="n in 8" :key="n"></div>
                    </div>
                    <div class="rj45-led" :class="port.connected ? (port.hasData ? 'blinking' : 'on') : 'off'"></div>
                  </div>
                  <div v-if="!portEditMode" class="rj45-label">{{ port.customName || port.name }}</div>
                  <el-input v-else v-model="portNameEdits[port.id]" class="port-name-input" placeholder="端口名称" />
                </div>
              </div>
              <!-- 下排：奇数端口 -->
              <div class="port-row bottom-row">
                <div
                  v-for="port in panelEthernetBottomRow"
                  :key="port.id"
                  class="rj45-port"
                  :class="{ connected: port.connected, 'has-data': port.hasData }"
                  @click.stop="onPortClick(port)"
                  @mouseenter.stop="showPortTooltip($event, port)" @mouseleave.stop="hidePortTooltip()"
                >
                  <div class="rj45-body">
                    <div class="rj45-top"></div>
                    <div class="rj45-pins">
                      <div class="pin" v-for="n in 8" :key="n"></div>
                    </div>
                    <div class="rj45-led" :class="port.connected ? (port.hasData ? 'blinking' : 'on') : 'off'"></div>
                  </div>
                  <div v-if="!portEditMode" class="rj45-label">{{ port.customName || port.name }}</div>
                  <el-input v-else v-model="portNameEdits[port.id]" class="port-name-input" placeholder="端口名称" />
                </div>
              </div>
              <!-- SFP光口 - 独立区域，避免溢出 -->
              <div v-if="panelSfpPorts.length > 0" class="port-section sfp-section">
                <div class="section-header">
                  <span class="section-count">{{ panelSfpPorts.length }}口</span>
                </div>
                <div class="sfp-ports-grid">
                  <div
                    v-for="port in panelSfpPorts"
                    :key="port.id"
                    class="sfp-port"
                    :class="{ connected: port.connected, 'has-data': port.hasData }"
                    @click.stop="onPortClick(port)"
                    @mouseenter.stop="showPortTooltip($event, port)" @mouseleave.stop="hidePortTooltip()"
                  >
                    <div class="sfp-body">
                      <div class="sfp-notch"></div>
                      <div class="sfp-latch"></div>
                      <div class="sfp-led" :class="port.connected ? (port.hasData ? 'blinking' : 'on') : 'off'"></div>
                    </div>
                    <div v-if="!portEditMode" class="sfp-label">{{ port.customName || port.name }}</div>
                    <el-input v-else v-model="portNameEdits[port.id]" class="port-name-input" placeholder="端口名称" />
                  </div>
                </div>
              </div>
            </div>
            <!-- 非交换机使用单排网格 -->
            <div v-else class="rj45-ports-grid">
              <div
                v-for="port in panelEthernetPorts"
                :key="port.id"
                class="rj45-port"
                :class="{ connected: port.connected, 'has-data': port.hasData }"
                @click.stop="onPortClick(port)"
                @mouseenter.stop="showPortTooltip($event, port)" @mouseleave.stop="hidePortTooltip()"
              >
                <div class="rj45-body">
                  <div class="rj45-top"></div>
                  <div class="rj45-pins">
                    <div class="pin" v-for="n in 8" :key="n"></div>
                  </div>
                  <div class="rj45-led" :class="port.connected ? (port.hasData ? 'blinking' : 'on') : 'off'"></div>
                </div>
                <div v-if="!portEditMode" class="rj45-label">{{ port.customName || port.name }}</div>
                <el-input v-else v-model="portNameEdits[port.id]" class="port-name-input" placeholder="端口名称" />
              </div>
            </div>
          </div>

          <!-- SFP光口 - 非交换机单独显示，交换机已集成到下排 -->
            <div v-if="panelSfpPorts.length > 0 && !isPanelSwitchDevice" class="port-section">
            <div class="section-header">
              <span class="section-label">SFP 光口</span>
              <span class="section-count">{{ panelSfpPorts.length }}口</span>
            </div>
            <div class="sfp-ports-grid">
              <div
                v-for="port in panelSfpPorts"
                :key="port.id"
                class="sfp-port"
                :class="{ connected: port.connected, 'has-data': port.hasData }"
                @click.stop="onPortClick(port)"
                @mouseenter.stop="showPortTooltip($event, port)" @mouseleave.stop="hidePortTooltip()"
              >
                <div class="sfp-body">
                  <div class="sfp-notch"></div>
                  <div class="sfp-latch"></div>
                  <div class="sfp-led" :class="port.connected ? (port.hasData ? 'blinking' : 'on') : 'off'"></div>
                </div>
                <div v-if="!portEditMode" class="sfp-label">{{ port.customName || port.name }}</div>
                <el-input v-else v-model="portNameEdits[port.id]" class="port-name-input" placeholder="端口名称" />
              </div>
            </div>
          </div>

          <!-- XFP万兆口 -->
          <div v-if="panelXfpPorts.length > 0" class="port-section">
            <div class="section-header">
              <span class="section-label">XFP 万兆口</span>
              <span class="section-count">{{ panelXfpPorts.length }}口</span>
            </div>
            <div class="xfp-ports-grid">
              <div
                v-for="port in panelXfpPorts"
                :key="port.id"
                class="xfp-port"
                :class="{ connected: port.connected, 'has-data': port.hasData }"
                @click.stop="onPortClick(port)"
                @mouseenter.stop="showPortTooltip($event, port)" @mouseleave.stop="hidePortTooltip()"
              >
                <div class="xfp-body">
                  <div class="xfp-notch"></div>
                  <div class="xfp-led" :class="port.connected ? (port.hasData ? 'blinking' : 'on') : 'off'"></div>
                </div>
                <div v-if="!portEditMode" class="xfp-label">{{ port.customName || port.name }}</div>
                <el-input v-else v-model="portNameEdits[port.id]" class="port-name-input" placeholder="端口名称" />
              </div>
            </div>
          </div>
        </div>

        <!-- 后面板端口区域 -->
        <div v-if="panelMode === 'back'" class="ports-area back-panel">
        <!-- 管理端口区域（RJ45样式） -->
        <div v-if="backPanelMgmtPorts.length > 0" class="port-section">
          <div class="section-header">
            <span class="section-label">管理端口</span>
            <span class="section-count">{{ backPanelMgmtPorts.length }}口</span>
          </div>
          <div class="rj45-ports-grid">
            <div
              v-for="port in backPanelMgmtPorts"
              :key="port.id"
              class="rj45-port"
              :class="{ connected: port.connected }"
              @click.stop="onPortClick(port)"
              @mouseenter.stop="showPortTooltip($event, port)" @mouseleave.stop="hidePortTooltip()"
            >
              <div class="rj45-body">
                <div class="rj45-top"></div>
                <div class="rj45-pins">
                  <div class="pin" v-for="n in 8" :key="n"></div>
                </div>
                <div class="rj45-led" :class="port.connected ? 'on' : 'off'"></div>
              </div>
              <div class="rj45-label">{{ port.name }}</div>
            </div>
          </div>
        </div>
        <!-- 后面板网络端口区域 -->
        <div v-if="backPanelEthPorts.length > 0" class="port-section">
          <div class="section-header">
            <span class="section-label">网络端口 (RJ45)</span>
            <span class="section-count">{{ backPanelEthPorts.length }}口</span>
          </div>
          <div class="rj45-ports-grid">
            <div
              v-for="port in backPanelEthPorts"
              :key="port.id"
              class="rj45-port"
              :class="{ connected: port.connected }"
              @click.stop="onPortClick(port)"
              @mouseenter.stop="showPortTooltip($event, port)" @mouseleave.stop="hidePortTooltip()"
            >
              <div class="rj45-body">
                <div class="rj45-top"></div>
                <div class="rj45-pins">
                  <div class="pin" v-for="n in 8" :key="n"></div>
                </div>
                <div class="rj45-led" :class="port.connected ? 'on' : 'off'"></div>
              </div>
              <div class="rj45-label">{{ port.name }}</div>
            </div>
          </div>
        </div>
        <!-- 后面板光口区域 -->
        <div v-if="backPanelSfpPorts.length > 0" class="port-section">
          <div class="section-header">
            <span class="section-label">光口 (SFP)</span>
            <span class="section-count">{{ backPanelSfpPorts.length }}口</span>
          </div>
          <div class="sfp-ports-grid">
            <div
              v-for="port in backPanelSfpPorts"
              :key="port.id"
              class="sfp-port"
              :class="{ connected: port.connected }"
              @click.stop="onPortClick(port)"
              @mouseenter.stop="showPortTooltip($event, port)" @mouseleave.stop="hidePortTooltip()"
            >
              <div class="sfp-body">
                <div class="sfp-notch"></div>
                <div class="sfp-latch"></div>
                <div class="sfp-led" :class="port.connected ? 'on' : 'off'"></div>
              </div>
              <div class="sfp-label">{{ port.name }}</div>
            </div>
          </div>
        </div>
      </div>
      </div>

      <!-- 端口统计 -->
      <div class="port-stats-bar">
        <div class="stat">
          <span class="stat-dot total"></span>
          <span class="stat-label">总端口</span>
          <span class="stat-value">{{ devicePanelPorts.length }}</span>
        </div>
        <div class="stat">
          <span class="stat-dot connected"></span>
          <span class="stat-label">已连接</span>
          <span class="stat-value connected">{{ devicePanelPorts.filter(p => p.connected).length }}</span>
        </div>
        <div class="stat">
          <span class="stat-dot free"></span>
          <span class="stat-label">空闲</span>
          <span class="stat-value free">{{ devicePanelPorts.filter(p => !p.connected).length }}</span>
        </div>
        <div class="stat">
          <span class="stat-dot active"></span>
          <span class="stat-label">活跃</span>
          <span class="stat-value active">{{ devicePanelPorts.filter(p => p.connected && p.hasData).length }}</span>
        </div>
      </div>
    </div>
  </el-dialog>

    <!-- 端口连线操作弹窗：上半部分显示对端信息，下半部分取消连线/更改连线 -->
    <el-dialog
      title="端口连线信息"
      v-model="editConnectionVisible"
      width="520px"
      align-center
    >
      <div class="connection-info-panel">
        <el-descriptions :column="1" border size="default">
          <el-descriptions-item label="对端设备">
            {{ editConnectionData.remoteDeviceName || '未知设备' }}
          </el-descriptions-item>
          <el-descriptions-item label="对端端口">
            {{ editConnectionData.remotePortNum || '未知端口' }}
          </el-descriptions-item>
          <el-descriptions-item label="对端机柜">
            {{ editConnectionData.remoteCabinetName || '未入柜' }}
          </el-descriptions-item>
          <el-descriptions-item label="对端U位">
            {{ editConnectionData.remoteUPosition || '未入柜' }}
          </el-descriptions-item>
          <el-descriptions-item label="线缆类型">
            {{ editConnectionData.cableType || '未指定' }}
          </el-descriptions-item>
        </el-descriptions>
      </div>
      <template #footer>
        <el-button type="danger" @click="disconnectConnection">取消连线</el-button>
        <el-button type="primary" @click="changeConnection">更改连线</el-button>
      </template>
    </el-dialog>

    <!-- 端口信息浮窗 -->
    <div
      v-if="portTooltip.visible"
      class="port-tooltip"
      :style="{ top: portTooltip.y + 'px', left: portTooltip.x + 'px' }"
    >
      <div class="tooltip-title">端口 {{ portTooltip.port }}</div>
      <div v-if="portTooltip.info" class="tooltip-body">
        <div>A端: {{ portTooltip.info.from || '未连接' }}</div>
        <div>B端: {{ portTooltip.info.to || '未连接' }}</div>
        <div v-if="portTooltip.info.cable">
          线缆: {{ portTooltip.info.cable }}
        </div>
      </div>
      <div v-else class="tooltip-empty">未连接</div>
    </div>
    <!-- 创建连线对话框 -->
    <el-dialog
      title="创建端口连线"
      v-model="portConnectVisible"
      width="520px"
    >
      <el-form :model="portConnectForm" label-width="100px">
        <el-form-item label="本端设备">
          <el-input :value="portConnectForm.deviceName" disabled />
        </el-form-item>
        <el-form-item label="本端端口">
          <el-input :value="connectingPortName" disabled />
        </el-form-item>
        <el-form-item label="对端设备">
          <el-select v-model="portConnectForm.targetDeviceId" style="width:100%">
            <el-option
              v-for="d in availableTargetDevices"
              :key="d.id"
              :label="d.name || d.ip || d.id"
              :value="d.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="对端端口">
          <el-select v-model="portConnectForm.targetPortId" style="width:100%">
            <el-option
              v-for="p in targetDevicePorts"
              :key="p.id"
              :label="p.name || p.id"
              :value="p.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="线缆类型">
          <el-select v-model="portConnectForm.cableType" style="width:100%">
            <el-option
              v-for="ct in availableCableOptions"
              :key="ct"
              :label="ct"
              :value="ct"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cancelPortConnect">取消</el-button>
        <el-button type="primary" @click="confirmPortConnect">确认</el-button>
      </template>
    </el-dialog>
  </template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useDeviceStore, useDeviceLibStore, useCabinetStore } from '../stores'
import { usePortStateStore } from '../stores/portState'
import { resolvePortName, resolveRemotePortName, standardPortName, findPatchItemById } from '../utils/portNaming.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { InfoFilled, Connection } from '@element-plus/icons-vue'

const props = defineProps({
  device: {
    type: Object,
    default: null
  },
  modelValue: {
    type: Boolean,
    default: false
  },
  panelMode: {
    type: String,
    default: 'front',
    validator: (val) => ['front', 'back'].includes(val)
  }
})

const emit = defineEmits(['update:modelValue', 'port-click', 'save-port-names', 'save-back-port-names', 'toggle-panel-mode', 'exit-connect-mode'])

// Store
const deviceStore = useDeviceStore()
const deviceLibStore = useDeviceLibStore()
const cabinetStore = useCabinetStore()
const portStateStore = usePortStateStore()

// 本地状态
const portEditMode = ref(false)
const portNameEdits = ref({})
const backPortEditMode = ref(false)
const backPortNameEdits = ref({})
const devicePanelPorts = ref([])
const portTooltip = ref({ visible: false, x: 0, y: 0, port: null, info: null })
// 修改连线对话框
const editConnectionVisible = ref(false)
const editConnectionData = ref({})
// 创建连线对话框（从 CabinetsView 复制）
const portConnectVisible = ref(false)
const connectingPort = ref(null)
const portConnectForm = ref({
  portType: 'ethernet',
  portId: '',
  deviceId: '',
  deviceName: '',
  portNum: 0,
  targetDeviceId: '',
  targetPortId: '',
  cableType: '',
  occupied: false,
  connectionId: '',
  remoteDeviceName: '',
  remotePortName: '',
  existingCableType: ''
})
const showAddPortDialog = ref(false)
const addPortForm = ref({ portType: 'ethernet', name: '' })
const currentPanelMode = ref(props.panelMode || 'front')

// 计算属性：对话框显示状态
const dialogVisible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

// 监听 device 变化，重新加载端口数据
watch(() => props.device, (newDevice) => {
  if (newDevice) {
    loadDevicePorts(newDevice)
  }
}, { immediate: true })

// 监听 panelMode 变化
watch(() => props.panelMode, (newMode) => {
  if (newMode) {
    currentPanelMode.value = newMode
  }
})

// 监听端口状态变化（连线增删），自动刷新端口连接状态
// 注：新版拓扑连线派生自 portStateStore，故只需监听 connections 即可
watch(() => portStateStore.connections.length, () => {
  if (props.device) {
    loadDevicePorts(props.device)
  }
})

// 是否为服务器设备
const isServerDevice = computed(() => {
  if (!props.device) return false
  const type = (props.device.type || '').toLowerCase()
  const name = (props.device.name || '').toLowerCase()
  return type.includes('server') || type.includes('服务器') || name.includes('服务器') || name.includes('server')
})

// 设备是否有前面板端口（服务器不显示前面板）
const hasFrontPanelPorts = computed(() => {
  if (isServerDevice.value) return false
  if (!props.device) return false
  const model = deviceLibStore.models?.find(m => m.name === props.device.model)
  if (!model) return true
  const frontEth = model.frontEthernetPorts || model.ethernetPorts || 0
  const frontSfp = model.frontSfpPorts || model.sfpPorts || 0
  return frontEth > 0 || frontSfp > 0
})

// 端口分类（使用统一 portType: ethernet/optical）
const panelEthernetPorts = computed(() => devicePanelPorts.value.filter(p => p.type === 'ethernet' || p.portType === 'ethernet'))
const panelOpticalPorts = computed(() => devicePanelPorts.value.filter(p => p.type === 'optical' || p.portType === 'optical' || p.type === 'sfp' || p.type === 'xfp'))
const panelSfpPorts = computed(() => devicePanelPorts.value.filter(p => p.type === 'sfp' || p.type === 'optical'))
const panelXfpPorts = computed(() => devicePanelPorts.value.filter(p => p.type === 'xfp'))

// 只有交换机类型且端口数 >= 8 时使用两排交错排列
const isPanelSwitchDevice = computed(() => {
  const type = props.device?.type
  const isSwitch = type === 'switch' || type === '核心交换机' || type === '汇聚交换机' || type === '接入交换机'
  if (!isSwitch) return false
  return panelEthernetPorts.value.length >= 8
})

// RJ45端口按真实交换机两排交错排列（上排偶数、下排奇数）
const panelEthernetTopRow = computed(() => {
  if (!isPanelSwitchDevice.value) return []
  return panelEthernetPorts.value.filter((_, index) => (index + 1) % 2 === 0)
})

const panelEthernetBottomRow = computed(() => {
  if (!isPanelSwitchDevice.value) return []
  return panelEthernetPorts.value.filter((_, index) => (index + 1) % 2 === 1)
})

const isLargePortCount = computed(() => panelEthernetPorts.value.length > 24)
// 创建连线对话框 - 计算属性（从机柜复制）
const connectingPortName = computed(() => {
  if (!connectingPort.value) return ''
  return connectingPort.value.customName || connectingPort.value.name || connectingPort.value.id || ''
})

const availableCableOptions = computed(() => {
  if (!portConnectForm.value) return []
  const pt = portConnectForm.value.portType || 'ethernet'
  return pt === 'optical' ? portStateStore.OPTICAL_CABLES : portStateStore.ETHERNET_CABLES
})

// 可用目标设备列表（同类型端口、未占用）
const availableTargetDevices = computed(() => {
  const currentDeviceId = props.device?.id || props.device?.deviceId
  if (!currentDeviceId || !portConnectForm.value) return []
  const portType = portConnectForm.value.portType || 'ethernet'
  return portStateStore.getAvailableTargetDevices(currentDeviceId, portType, deviceStore.devices || [])
})

// 目标设备已选时，获取其可用端口列表
const targetDevicePorts = computed(() => {
  if (!portConnectForm.value?.targetDeviceId) return []
  const portType = portConnectForm.value.portType || 'ethernet'
  return portStateStore.getDeviceAvailablePorts(portConnectForm.value.targetDeviceId, portType)
})


// 辅助函数：检查设备端口是否已连接（使用全局端口状态管理器）
function checkPortConnected(deviceId, portId) {
  if (!deviceId || !portId) return false
  return portStateStore.isPortOccupied(deviceId, portId)
}

// 辅助函数：根据设备ID查找设备名称（支持网络设备和配线设备）
function resolveDeviceName(deviceId) {
  if (!deviceId) return null
  // 1. 从设备库查找
  const device = deviceStore.devices.find(d => d.id === deviceId)
  if (device?.name) return device.name
  // 2. 从机柜配线设备查找
  for (const cab of cabinetStore.cabinets || []) {
    for (const item of cab.patchItems || []) {
      if (item.id === deviceId) return item.name || '配线设备'
    }
  }
  return null
}

// 辅助函数：生成端口悬浮提示文本
// 核心逻辑：所有设备端口都通过全局状态管理器解析对端信息
function getPortTooltip(port) {
  if (!port.connected) {
    return `${port.customName || port.name} - 可用`
  }
  // 直接从全局状态管理器查询对端信息，不依赖可能出错的中间字段
  const info = getPortRemoteInfo(props.device?.id, port.id)
  const remoteDevice = info?.connectDeviceName || '未知设备'
  const remotePort = info?.connectPortName ? `${info.connectPortName}口` : ''
  const cable = info?.cableType || '未指定'
  const parts = [`${port.customName || port.name} - 已连接至: ${remoteDevice}`]
  if (remotePort) parts.push(remotePort)
  parts.push(`线缆: ${cable}`)
  return parts.join(', ')
}

// 辅助函数：获取端口的对端连接信息
function getPortRemoteInfo(deviceId, portId) {
  if (!deviceId || !portId) return null
  const conn = portStateStore.getPortConnection(deviceId, portId)
  if (!conn) return null
  // 优先使用连接记录中的设备名，如果没有则从全局设备列表解析
  const remoteDeviceName = conn.remoteDeviceName || resolveDeviceName(conn.remoteDeviceId) || '未知设备'
  // 对端端口名动态解析（portNames 是权威源，改名后立即生效；快照仅兜底）
  const remoteDev = deviceStore.devices.find(d => String(d.id) === String(conn.remoteDeviceId))
  // 对端是配线架等机柜配线设备时不在 deviceStore 中，从 patchItems 查备注名
  const remotePatchItem = remoteDev ? null : findPatchItemById(cabinetStore.cabinets, conn.remoteDeviceId)
  const remotePortDisplay = resolveRemotePortName(remoteDev || remotePatchItem, conn.remotePortId, conn.remoteDeviceId, conn.remotePortNum)
  return {
    connectDeviceName: remoteDeviceName,
    connectPortName: remotePortDisplay,
    cableType: conn.cableType || ''
  }
}


function showPortTooltip(event, port) {
  if (!port || !port.connected) {
    portTooltip.value = { visible: false, x: 0, y: 0, port: null, info: null };
    return;
  }
  const info = getPortRemoteInfo(props.device?.id, port.id);
  // 格式对齐机柜管理的 tooltip info：{ from, to, cable }
  portTooltip.value = {
    visible: true,
    x: event.clientX + 10,
    y: event.clientY - 10,
    port: port.customName || port.name,
    info: info ? {
      from: (port.customName || port.name) + '口',
      to: (info.connectDeviceName || '未知设备') + ' ' + (info.connectPortName || '') + '口',
      cable: info.cableType || '未指定'
    } : null
  };
}

function hidePortTooltip() {
  portTooltip.value.visible = false;
}

// 后面板管理端口（仅保留可连线的网络管理端口，使用RJ45样式）
const backPanelMgmtPorts = computed(() => {
  const savedNames = props.device?.backPortNames || {}
  const ports = [
    { id: 'mgmt', name: savedNames['mgmt'] || 'MGMT', type: 'ethernet', connected: false, connectable: true, connectDeviceName: '', connectPortName: '' },
    { id: 'console', name: savedNames['console'] || 'Console', type: 'ethernet', connected: false, connectable: true, connectDeviceName: '', connectPortName: '' },
    { id: 'ilo', name: savedNames['ilo'] || 'iLO/iDRAC', type: 'ethernet', connected: false, connectable: true, connectDeviceName: '', connectPortName: '' }
  ]
  // 根据设备连接状态更新
  const deviceId = props.device?.id
  if (deviceId) {
    ports.forEach(p => {
      p.connected = checkPortConnected(deviceId, p.name)
      const info = getPortRemoteInfo(deviceId, p.name)
      if (info) {
        p.connectDeviceName = info.connectDeviceName
        p.connectPortName = info.connectPortName
      }
    })
  }
  return ports
})

// 后面板电源模块（已移除，服务器后面板只保留网络端口）
const backPanelPowerModules = computed(() => [])

// 后面板网络端口（RJ45）
const backPanelEthPorts = computed(() => {
  const device = props.device
  if (!device) return []
  const model = deviceLibStore.models?.find(d => d.name === device.model || d.model === device.model)
  const ethCount = model?.backEthernetPorts || 0
  if (ethCount === 0) return []

  const savedNames = device?.backPortNames || {}
  const ports = []
  const deviceId = device.deviceId || device.id
  for (let i = 1; i <= ethCount; i++) {
    const portName = savedNames[`back-eth-${i}`] || `GE-${i}`
    ports.push({
      id: `back-eth-${i}`,
      name: portName,
      customName: '',
      icon: 'rj45',
      connectable: true,
      connected: false,
      connectDeviceName: '',
      connectPortName: ''
    })
  }
  // 根据设备连接状态更新
  if (deviceId) {
    ports.forEach(p => {
      p.connected = checkPortConnected(deviceId, p.name)
      const info = getPortRemoteInfo(deviceId, p.name)
      if (info) {
        p.connectDeviceName = info.connectDeviceName
        p.connectPortName = info.connectPortName
      }
    })
  }
  return ports
})

// 后面板光口（SFP）
const backPanelSfpPorts = computed(() => {
  const device = props.device
  if (!device) return []
  const model = deviceLibStore.models?.find(d => d.name === device.model || d.model === device.model)
  const sfpCount = model?.backSfpPorts || 0
  if (sfpCount === 0) return []

  const savedNames = device?.backPortNames || {}
  const ports = []
  const deviceId = device.deviceId || device.id
  for (let i = 1; i <= sfpCount; i++) {
    const portName = savedNames[`back-sfp-${i}`] || `SFP-${i}`
    ports.push({
      id: `back-sfp-${i}`,
      name: portName,
      customName: '',
      icon: 'sfp',
      connectable: true,
      connected: false,
      connectDeviceName: '',
      connectPortName: ''
    })
  }
  // 根据设备连接状态更新
  if (deviceId) {
    ports.forEach(p => {
      p.connected = checkPortConnected(deviceId, p.name)
      const info = getPortRemoteInfo(deviceId, p.name)
      if (info) {
        p.connectDeviceName = info.connectDeviceName
        p.connectPortName = info.connectPortName
      }
    })
  }
  return ports
})

// 方法：获取端口连接状态（用于真实面板）
function getPortConnectedStatus(portId) {
  if (!props.device || !portId) return false
  const deviceId = props.device.id
  return portStateStore.isPortOccupied(deviceId, portId)
}

// 方法：获取端口是否有数据流通（用于真实面板）
function getPortHasData(portId) {
  if (!props.device || !portId) return false
  const isConnected = getPortConnectedStatus(portId)
  const isOnline = props.device.status === 'online' || props.device.status === 'active'
  return isConnected && isOnline
}

// 方法：获取LED状态（用于真实面板）
function getLedStatus(led) {
  if (!props.device) return 'off'
  if (led.id === 'sys') {
    return props.device.status === 'online' ? 'on' : 'off'
  }
  if (led.id === 'pwr' || led.id === 'pwr') {
    return 'on' // 电源灯常亮
  }
  if (led.id === 'alm' || led.id === 'alarm') {
    // 告警灯：设备离线或有端口异常时亮红灯
    return props.device.status === 'offline' ? 'alarm' : 'off'
  }
  return 'off'
}

// 方法：处理自定义面板数据保存
async function saveCustomPanel() {
  if (!customPanelJson.value) {
    ElMessage.warning('请先粘贴面板数据 JSON')
    return
  }
  try {
    const data = JSON.parse(customPanelJson.value)
    if (!data.ports || !Array.isArray(data.ports)) {
      ElMessage.error('面板数据格式错误：缺少 ports 数组')
      return
    }
    // 保存到 localStorage
    const key = `customPanel_${props.device.vendor}_${props.device.model}`
    localStorage.setItem(key, JSON.stringify(data))
    customPanelData.value = data
    showCustomPanelDialog.value = false
    ElMessage.success('自定义面板数据已保存')
    // 重新加载端口数据
    if (props.device) {
      loadDevicePorts(props.device)
    }
  } catch (err) {
    ElMessage.error('JSON 解析失败：' + err.message)
  }
}

function getVendorLogoImage(vendor) {
  if (!vendor) return ''
  const v = vendor.toLowerCase()
  if (v.includes('huawei') || v.includes('华为')) return './vendor-logos/huawei.png'
  if (v.includes('cisco') || v.includes('思科')) return './vendor-logos/cisco.png'
  if (v.includes('tp-link') || v.includes('tplink')) return './vendor-logos/tp-link.png'
  if (v.includes('dahua') || v.includes('大华')) return './vendor-logos/dahua.png'
  if (v.includes('hikvision') || v.includes('hik') || v.includes('海康')) return './vendor-logos/hikvision.png'
  if (v.includes('ruijie') || v.includes('锐捷')) return './vendor-logos/ruijie.png'
  if (v.includes('网御') || v.includes('leadsec')) return './vendor-logos/leadsec.png'
  if (v.includes('h3c') || v.includes('华三')) return './vendor-logos/h3c.png'
  return ''
}

// 方法：获取厂商Logo样式类
function getVendorLogoClass(vendor) {
  if (!vendor) return 'vendor-default'
  const v = vendor.toLowerCase()
  if (v.includes('h3c') || v.includes('华三')) return 'vendor-h3c'
  if (v.includes('huawei') || v.includes('华为')) return 'vendor-huawei'
  if (v.includes('cisco') || v.includes('思科')) return 'vendor-cisco'
  if (v.includes('ruijie') || v.includes('锐捷')) return 'vendor-ruijie'
  if (v.includes('aruba')) return 'vendor-aruba'
  return 'vendor-default'
}

// 方法：获取厂商Logo文字
function getVendorLogoText(vendor) {
  if (!vendor) return 'N'
  const v = vendor.toLowerCase()
  if (v.includes('h3c') || v.includes('华三')) return 'H3C'
  if (v.includes('huawei') || v.includes('华为')) return 'HW'
  if (v.includes('cisco') || v.includes('思科')) return 'CS'
  if (v.includes('ruijie') || v.includes('锐捷')) return 'RJ'
  if (v.includes('aruba')) return 'AR'
  return vendor.substring(0, 2).toUpperCase()
}

// 方法：加载设备端口数据
function loadDevicePorts(device) {
  if (!device) return
  
  // 使用全局端口状态管理器获取设备端口
  // 拓扑节点用 device.deviceId，设备管理用 device.id
  const actualDeviceId = device.deviceId || device.id
  const ports = portStateStore.getDevicePorts({ ...device, id: actualDeviceId })
  
  // 设备是否在线
  const isDeviceOnline = device.status === 'online' || device.status === 'active'
  
  // 加载设备已保存的端口名称
  const savedPortNames = device.portNames || {}
  
  // 应用状态到端口列表
  // 核心：每个端口直接调用 getPortRemoteInfo() 从全局状态管理器解析对端信息
  // 不依赖 getOccupiedPorts() 的中间结果，避免端口ID格式不匹配导致的解析失败
  const enrichedPorts = ports.map(p => {
    // 直接调用 portStateStore 判断连接状态，不依赖 p.status 字符串
    const occupied = portStateStore.isPortOccupied(actualDeviceId, p.id)
    const isConnected = occupied
    // 直接从全局状态管理器查询对端信息
    const remoteInfo = isConnected ? getPortRemoteInfo(actualDeviceId, p.id) : null
    return {
      ...p,
      type: p.portType,
      connected: isConnected,  // 直接用 store 的状态
      connectable: true,
      hasData: isConnected && isDeviceOnline,  // hasData 表示有实际数据流通（需要设备在线）
      connectDeviceName: remoteInfo?.connectDeviceName || '',
      connectPortName: remoteInfo?.connectPortName || '',
      cableType: remoteInfo?.cableType || ''
    }
  })
  
  devicePanelPorts.value = enrichedPorts
  
  // 初始化端口名称编辑数据
  portNameEdits.value = {}
  enrichedPorts.forEach(p => {
    portNameEdits.value[p.id] = p.name || p.customName || p.id
  })
  
  // 初始化后面板端口名称编辑数据
  backPortNameEdits.value = {}
  const savedBackNames = device.backPortNames || {}
  const defaultBackNames = {
    mgmt: 'MGMT', console: 'Console', ilo: 'iLO/iDRAC',
    usb1: 'USB 1', usb2: 'USB 2', vga: 'VGA', serial: 'Serial',
    psu1: '电源模块 1', psu2: '电源模块 2'
  }
  Object.keys(defaultBackNames).forEach(id => {
    backPortNameEdits.value[id] = savedBackNames[id] || defaultBackNames[id]
  })
}

// 方法：切换面板模式
function togglePanelMode(mode) {
  currentPanelMode.value = mode
  emit('toggle-panel-mode', mode)
}

// 方法：端口点击（复制机柜逻辑）
function onPortClick(port) {
  if (!port || !port.connectable) return
  const deviceId = props.device?.id || props.device?.deviceId
  if (!deviceId) return
  const isOccupied = portStateStore.isPortOccupied(deviceId, port.id)
  if (isOccupied) {
    openEditConnection(port)
  } else {
    openPortConnect(port)
  }
}

// 辅助函数：根据设备ID查询所在机柜名和U位
function getDeviceCabinetInfo(deviceId) {
  if (!deviceId) return { cabinetName: '', uPosition: '' }
  const cabinets = cabinetStore.cabinets || []
  for (const cab of cabinets) {
    // 查 slots（网络设备直接放在U位上）
    if (cab.slots && typeof cab.slots === 'object') {
      for (const [uPos, slotDeviceId] of Object.entries(cab.slots)) {
        if (slotDeviceId === deviceId) {
          return { cabinetName: cab.name || cab.id || '未知机柜', uPosition: uPos + 'U' }
        }
      }
    }
    // 查 patchItems（配线架/ODF框等，可能有关联设备）
    if (Array.isArray(cab.patchItems)) {
      for (const item of cab.patchItems) {
        if (item.deviceId === deviceId) {
          return { cabinetName: cab.name || cab.id || '未知机柜', uPosition: item.uPosition ? item.uPosition + 'U' : (item.label || '') }
        }
      }
    }
  }
  return { cabinetName: '', uPosition: '' }
}

// 方法：打开修改连线对话框（复制机柜逻辑）
function openEditConnection(port) {
  const deviceId = props.device?.id || props.device?.deviceId
  if (!deviceId) return
  const portId = port.id
  const connInfo = portStateStore.getPortConnection(deviceId, portId)
  if (!connInfo) return

  // 查询对端设备所在机柜信息
  const remoteCabinet = getDeviceCabinetInfo(connInfo.remoteDeviceId)

  editConnectionData.value = {
    deviceId: deviceId,
    portId: portId,
    portType: port.portType || 'ethernet',
    deviceName: props.device?.name || '',
    portName: port.name || port.id,
    connectionId: connInfo.connectionId,
    remoteDeviceId: connInfo.remoteDeviceId,
    remoteDeviceName: connInfo.remoteDeviceName || '',
    remotePortId: connInfo.remotePortId,
    remotePortNum: connInfo.remotePortNum || '',
    cableType: connInfo.cableType || '',
    remoteCabinetName: remoteCabinet.cabinetName,
    remoteUPosition: remoteCabinet.uPosition
  }
  editConnectionVisible.value = true
}

async function saveConnectionEdit() {
  try {
    const result = await portStateStore.updateCableType(
      editConnectionData.value.connectionId,
      editConnectionData.value.cableType
    )
    if (result.success) {
      ElMessage.success(result.message)
      editConnectionVisible.value = false
      portStateStore.clearDevicePortCache(editConnectionData.value.deviceId)
      portStateStore.clearDevicePortCache(editConnectionData.value.remoteDeviceId)
    } else {
      ElMessage.error(result.message)
    }
  } catch (e) {
    ElMessage.error('保存失败：' + e.message)
  }
}

async function disconnectConnection() {
  try {
    const result = await portStateStore.disconnectPorts(editConnectionData.value.connectionId)
    if (result.success) {
      ElMessage.success(result.message)
      editConnectionVisible.value = false
      // 刷新端口状态，确保三个页面同步
      if (props.device) {
        loadDevicePorts(props.device)
      }
    } else {
      ElMessage.error(result.message)
    }
  } catch (e) {
    ElMessage.error('断开失败：' + e.message)
  }
}

// 更改连线：断开当前连接后进入连线模式
async function changeConnection() {
  try {
    const result = await portStateStore.disconnectPorts(editConnectionData.value.connectionId)
    if (result.success) {
      ElMessage.success('已断开原连接，请选择新的连线目标')
      editConnectionVisible.value = false
      // 刷新端口状态
      if (props.device) {
        loadDevicePorts(props.device)
      }
      // 进入连线模式
      nextTick(() => {
        openPortConnect({
          id: editConnectionData.value.portId,
          name: editConnectionData.value.portName,
          portType: editConnectionData.value.portType || 'ethernet'
        })
      })
    } else {
      ElMessage.error(result.message)
    }
  } catch (e) {
    ElMessage.error('更改连线失败：' + e.message)
  }
}

// 方法：打开端口连接对话框（从机柜复制，不再 emit）

// 确认端口连线
async function confirmPortConnect() {
  if (!connectingPort.value || !portConnectForm.value.targetDeviceId || !portConnectForm.value.targetPortId) {
    ElMessage.warning('请选择目标设备和端口')
    return
  }

  const portType = portConnectForm.value.portType || 'ethernet'
  const sourceDeviceId = props.device?.id || props.device?.deviceId
  const sourcePortId = connectingPort.value.id
  const targetDeviceId = portConnectForm.value.targetDeviceId
  const targetPortId = portConnectForm.value.targetPortId

  // 本端端口显示名：自定义名优先，其次标准名（eth5 → GE0/0/5）
  const sourceDev = deviceStore.devices.find(d => String(d.id) === String(sourceDeviceId)) || props.device
  const sourcePortDisplayName = resolvePortName(sourceDev, sourcePortId)

  const portA = {
    deviceId: sourceDeviceId,
    portId: sourcePortId,
    deviceName: props.device?.name || '',
    portNum: sourcePortDisplayName,
    portType: portType
  }

  const targetDevice = deviceStore.devices.find(d => d.id === targetDeviceId)
  const targetPorts = portStateStore.getDeviceAvailablePorts(targetDeviceId, portType)
  const targetPort = targetPorts?.find(p => p.id === targetPortId)

  const portB = {
    deviceId: targetDeviceId,
    portId: targetPortId,
    deviceName: targetDevice?.name || '',
    // 连线快照存端口显示名（GE0/0/5 / 端口3），不再是数字端口号
    portNum: resolvePortName(targetDevice, targetPortId) || targetPort?.name || targetPortId,
    portType: portType
  }

  const cableType = portConnectForm.value.cableType || (portType === 'optical' ? 'LC单模光纤' : '六类网线')

  const result = await portStateStore.connectPorts(portA, portB, cableType)
  if (result.success) {
    ElMessage.success(result.message)
  } else {
    ElMessage.error(result.message)
  }
  // 无论成功失败都必须关闭弹窗、清除状态
  portConnectVisible.value = false
  connectingPort.value = null
  emit('exit-connect-mode')
  if (props.device) {
    portStateStore.clearDevicePortCache(props.device.id)
    loadDevicePorts(props.device)
  }
}

// 取消端口连线
function cancelPortConnect() {
  portConnectVisible.value = false
  connectingPort.value = null
}

// 方法：打开端口连接对话框（从机柜复制，不再 emit）
function openPortConnect(port) {
  if (portEditMode.value || backPortEditMode.value) return
  connectingPort.value = port

  const deviceId = props.device?.id || props.device?.deviceId
  const portId = port.id
  const deviceName = props.device?.name || ''

  // 判断端口类型
  const portType = port.portType || port.type
  const normalizedType = (portType === 'sfp' || portType === 'xfp' || portType === 'optical') ? 'optical' : 'ethernet'

  // 获取端口号
  let portNum = port.portNumber || 0
  if (!portNum) {
    const match = portId.match(/(\d+)$/)
    if (match) portNum = parseInt(match[1])
  }

  // 清除端口缓存以获取最新状态
  portStateStore.clearDevicePortCache(deviceId)

  // 检查是否已占用
  const isOccupied = portStateStore.isPortOccupied(deviceId, portId)
  const connInfo = portStateStore.getPortConnection(deviceId, portId)

  portConnectForm.value = {
    portType: normalizedType,
    portId: portId,
    deviceId: deviceId,
    deviceName: deviceName,
    portNum: portNum,
    targetDeviceId: '',
    targetPortId: '',
    cableType: normalizedType === 'optical' ? 'LC单模光纤' : '六类网线',
    occupied: isOccupied,
    connectionId: connInfo?.connectionId || '',
    remoteDeviceName: connInfo?.remoteDeviceName || resolveDeviceName(connInfo?.remoteDeviceId) || '',
    remotePortName: connInfo?.remotePortNum || '',
    existingCableType: connInfo?.cableType || ''
  }

  portConnectVisible.value = true
}

// 方法：保存端口名称
function savePortNames() {
  const updatedPorts = devicePanelPorts.value.map(p => ({
    ...p,
    customName: portNameEdits.value[p.id] || p.name
  }))
  devicePanelPorts.value = updatedPorts
  
  // 保存到设备数据中
  const device = props.device
  if (device) {
    const portNames = {}
    updatedPorts.forEach(p => {
      if (p.customName && p.customName !== p.name) {
        portNames[p.id] = p.customName
      }
    })
    // 触发保存事件
    emit('save-port-names', portNames)
  }
  
  portEditMode.value = false
  ElMessage.success('端口名称已保存')
}

// 方法：保存后面板端口名称
function saveBackPortNames() {
  const device = props.device
  if (!device) return
  
  const defaultNames = {
    mgmt: 'MGMT', console: 'Console', ilo: 'iLO/iDRAC',
    usb1: 'USB 1', usb2: 'USB 2', vga: 'VGA', serial: 'Serial',
    psu1: '电源模块 1', psu2: '电源模块 2'
  }
  const backPortNames = { ...(device.backPortNames || {}) }
  
  Object.entries(backPortNameEdits.value).forEach(([id, name]) => {
    if (name && name !== defaultNames[id]) {
      backPortNames[id] = name
    } else {
      delete backPortNames[id]
    }
  })
  
  // 触发保存事件
  emit('save-back-port-names', backPortNames)
  
  backPortEditMode.value = false
  ElMessage.success('后面板端口名称已保存')
}

// 方法：处理对话框关闭（彻底解绑所有鼠标事件，防止鼠标跟随）
function handleClose() {
  // 彻底重置所有拖拽/连线状态
  portEditMode.value = false
  backPortEditMode.value = false
  connectingPort.value = null
  portConnectVisible.value = false
  editConnectionVisible.value = false
  // 强制重置父组件的连线模式状态（通过事件通知）
  emit('exit-connect-mode')
  emit('update:modelValue', false)
}
</script>

<style scoped>
/* ========== 设备前面板对话框样式 ========== */
.device-panel-dialog {
  :deep(.el-dialog__body) {
    padding: 0;
  }
}

.device-panel-content {
  padding: 20px;
}

/* 设备详细信息 */
.device-detail-info {
  margin-bottom: 20px;
  padding: 16px;
  background: var(--bg-glass-strong);
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.detail-info-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.detail-info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-label {
  font-size: 10px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);

  &.ip {
    color: var(--info);
    font-family: monospace;
  }

  &.online {
    color: var(--accent);
  }

  &.offline {
    color: var(--danger);
  }
}

/* 设备前面板 */
.device-front-panel {
  background: linear-gradient(180deg, var(--bg-glass-strong) 0%, rgba(0,0,0,0.3) 100%);
  border: 2px solid var(--border-strong);
  border-radius: 8px;
  padding: 16px;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.panel-brand-area {
  display: flex;
  align-items: center;
  gap: 8px;
}

.vendor-logo-img {
  height: 24px;
  width: auto;
  object-fit: contain;
}

.vendor-logo {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 900;
  color: white;
  
  &.vendor-h3c { background: linear-gradient(135deg, #e60012 0%, #ff4d4f 100%); }
  &.vendor-huawei { background: linear-gradient(135deg, #ff0000 0%, #ff4d4f 100%); }
  &.vendor-cisco { background: linear-gradient(135deg, #049fd9 0%, #6bc5e8 100%); }
  &.vendor-ruijie { background: linear-gradient(135deg, #003da5 0%, #0a5a9c 100%); }
  &.vendor-aruba { background: linear-gradient(135deg, #00a1e6 0%, #66c2f0 100%); }
  &.vendor-default { background: linear-gradient(135deg, #8e8e93 0%, var(--text-secondary) 100%); }
}

.panel-brand {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.panel-model {
  font-size: 12px;
  color: var(--text-secondary);
  flex: 1;
}

.panel-leds {
  display: flex;
  gap: 8px;
  align-items: center;
}

.panel-led {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  transition: all 0.3s;

  &.sys-led {
    &.online {
      background: var(--accent);
      box-shadow: 0 0 8px var(--accent);
      animation: led-blink 2s ease-in-out infinite;
    }
    &.offline {
      background: var(--danger);
      box-shadow: 0 0 4px var(--danger);
    }
  }

  &.pwr-led {
    &.on {
      background: var(--info);
      box-shadow: 0 0 6px var(--info);
    }
  }
}

/* 端口区域 */
.ports-area {
  display: flex;
  flex-direction: column;
  gap: 20px;

  &.back-panel {
    gap: 16px;
  }
}

/* 后面板样式 */
.back-panel-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.18);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-primary);

  .el-icon {
    color: var(--info);
    flex-shrink: 0;
  }
}

.back-ports-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.back-port-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--bg-glass-strong);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  transition: all 0.2s;

  &:hover {
    background: rgba(0,0,0,0.3);
    border-color: var(--info);
  }

  &.connected {
    border-color: var(--accent);
    background: var(--accent-subtle);
  }

  .back-port-icon {
    width: 28px;
    height: 28px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(56, 189, 248, 0.12);
    color: var(--info);

    &.psu-icon {
      background: rgba(245, 158, 11, 0.12);
      color: var(--warning);
    }
  }

  .back-port-name {
    font-size: 12px;
    color: var(--text-primary);
    font-weight: 500;
  }

  .back-port-led {
    width: 6px;
    height: 6px;
    border-radius: 50%;

    &.on { background: var(--accent); box-shadow: 0 0 4px var(--accent-glow); }
    &.off { background: var(--border-color); }
  }
}

/* 后面板迷你RJ45端口图标 */
.back-port-icon.rj45-icon {
  background: transparent;
  width: 32px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;

  .mini-rj45 {
    width: 18px;
    height: 22px;
    background: var(--bg-glass-strong);
    border-radius: 2px 2px 0 0;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 2px;

    .mini-rj45-top {
      width: 14px;
      height: 2px;
      background: var(--text-muted);
      border-radius: 1px;
      margin-bottom: 2px;
    }

    .mini-rj45-pins {
      display: flex;
      gap: 1px;
      flex-wrap: wrap;
      justify-content: center;
      width: 14px;

      .mini-pin {
        width: 1.5px;
        height: 5px;
        background: var(--text-secondary);
        border-radius: 0.5px;
      }
    }
  }
}

/* 后面板迷你SFP端口图标 */
.back-port-icon.sfp-icon {
  background: transparent;
  width: 32px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;

  .mini-sfp {
    width: 18px;
    height: 22px;
    background: var(--bg-glass-strong);
    border: 1px solid var(--text-muted);
    border-radius: 2px;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 3px;

    .mini-sfp-notch {
      width: 10px;
      height: 2px;
      background: var(--text-secondary);
      border-radius: 1px;
      margin-bottom: 2px;
    }

    .mini-sfp-latch {
      width: 6px;
      height: 4px;
      background: var(--text-muted);
      border-radius: 0 0 2px 2px;
    }
  }
}

/* 空面板提示 */
.empty-panel-notice {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px;
  color: var(--text-secondary);
  font-size: 13px;
  background: var(--bg-glass-strong);
  border-radius: 8px;
  margin: 8px 0;
}

/* 端口区域 */
.port-section {
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .section-label {
    font-size: 10px;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .section-count {
    font-size: 10px;
    color: var(--text-primary);
    background: var(--bg-glass);
    padding: 2px 8px;
    border-radius: 4px;
  }
}

/* RJ45端口 - 真实交换机两排交错排列 */
.rj45-ports-real {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-x: visible;
  width: 100%;
  min-width: 0;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  padding: 8px;
  background: var(--bg-glass);

  &.compact {
    gap: 2px;
    padding: 4px;

    .port-row {
      gap: 2px;
      flex-wrap: nowrap;
      overflow-x: auto;
    }

    .rj45-port {
      padding: 1px;
      gap: 1px;
      flex-shrink: 0;
    }

    .rj45-body {
      width: 28px;
      height: 28px;
      padding-top: 2px;
    }

    .rj45-top {
      width: 20px;
      height: 2px;
      margin-bottom: 1px;
    }

    .rj45-pins .pin {
      width: 1.5px;
      height: 3px;
    }

    .rj45-label {
      font-size: 5px;
      white-space: nowrap;
    }

    .port-name-input {
      width: 28px !important;
    }
  }
}

.port-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-start;
  overflow-x: visible;
  align-items: flex-end;

  &.top-row {
    padding-bottom: 4px;
    border-bottom: 1px dashed var(--border-color);
  }

  &.bottom-row {
    padding-top: 4px;
  }
}

.rj45-port {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  padding: 3px;
  border-radius: 4px;
  transition: background 0.2s;

  &:hover {
    background: var(--accent-subtle);
  }

  &.connected .rj45-body {
    border-color: var(--accent);
    box-shadow: 0 0 8px var(--accent-glow);
    background: linear-gradient(180deg, rgba(0, 122, 204, 0.18) 0%, rgba(0, 122, 204, 0.06) 100%);
  }
}

.rj45-body {
  width: 32px;
  height: 32px;
  background: linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.4) 100%);
  border: 1px solid var(--border-strong);
  border-radius: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 3px;
  transition: all 0.3s;
}

.rj45-top {
  width: 20px;
  height: 2px;
  background: var(--border-color);
  border-radius: 1px;
  margin-bottom: 2px;
}

.rj45-pins {
  display: flex;
  gap: 1px;
  .pin {
    width: 2px;
    height: 4px;
    background: var(--text-muted);
    border-radius: 0 0 1px 1px;
  }
}

.rj45-led {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--border-color);
  transition: all 0.3s;

  &.on {
    background: var(--accent);
    box-shadow: 0 0 4px var(--accent);
  }

  &.blinking {
    background: var(--accent);
    box-shadow: 0 0 6px var(--accent);
    animation: led-blink 1s ease-in-out infinite;
  }
}

.rj45-label {
  font-size: 7px;
  color: var(--text-secondary);
  font-family: monospace;
  white-space: nowrap;
}

/* 非交换机RJ45端口 - 自适应横向排列 */
.rj45-ports-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  align-items: flex-start;
  gap: 8px;

  .rj45-port {
    flex-shrink: 0;
  }
}

/* SFP端口 - 自适应网格 */
.sfp-ports-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(68px, 1fr));
  gap: 10px;
}

.sfp-port {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background 0.2s;

  &:hover {
    background: var(--accent-subtle);
  }

  &.connected .sfp-body {
    border-color: var(--accent);
    box-shadow: 0 0 8px var(--accent-glow);
    background: linear-gradient(180deg, rgba(0, 122, 204, 0.18) 0%, rgba(0, 122, 204, 0.06) 100%);
  }
}

.sfp-body {
  width: 56px;
  height: 24px;
  background: linear-gradient(180deg, var(--bg-glass-strong) 0%, rgba(0,0,0,0.3) 100%);
  border: 1px solid var(--border-strong);
  border-radius: 0;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}

.sfp-notch {
  width: 20px;
  height: 10px;
  background: rgba(0,0,0,0.4);
  border: 1px solid var(--border-color);
  border-radius: 1px;
}

.sfp-latch {
  position: absolute;
  top: -3px;
  right: 6px;
  width: 10px;
  height: 3px;
  background: var(--text-muted);
  border-radius: 1px 1px 0 0;
}

.sfp-led {
  position: absolute;
  bottom: 2px;
  left: 2px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--border-color);
  transition: all 0.3s;

  &.on {
    background: var(--accent);
    box-shadow: 0 0 4px var(--accent);
  }

  &.blinking {
    background: var(--accent);
    box-shadow: 0 0 6px var(--accent);
    animation: led-blink 1s ease-in-out infinite;
  }
}

.sfp-label {
  font-size: 9px;
  color: var(--text-secondary);
  font-family: monospace;
}

/* XFP端口 - 自适应网格 */
.xfp-ports-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
  gap: 10px;
}

.xfp-port {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background 0.2s;

  &:hover {
    background: var(--accent-subtle);
  }

  &.connected .xfp-body {
    border-color: var(--accent);
    box-shadow: 0 0 8px var(--accent-glow);
    background: linear-gradient(180deg, rgba(0, 122, 204, 0.18) 0%, rgba(0, 122, 204, 0.06) 100%);
  }
}

.xfp-body {
  width: 72px;
  height: 28px;
  background: linear-gradient(180deg, var(--bg-glass-strong) 0%, rgba(0,0,0,0.3) 100%);
  border: 1px solid var(--border-strong);
  border-radius: 0;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}

.xfp-notch {
  width: 28px;
  height: 12px;
  background: rgba(0,0,0,0.4);
  border: 1px solid var(--border-color);
  border-radius: 1px;
}

.xfp-led {
  position: absolute;
  bottom: 2px;
  left: 2px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--border-color);
  transition: all 0.3s;

  &.on {
    background: var(--accent);
    box-shadow: 0 0 4px var(--accent);
  }

  &.blinking {
    background: var(--accent);
    box-shadow: 0 0 6px var(--accent);
    animation: led-blink 1s ease-in-out infinite;
  }
}

.xfp-label {
  font-size: 9px;
  color: var(--text-secondary);
  font-family: monospace;
}

/* 端口统计栏 */
.port-stats-bar {
  display: flex;
  gap: 20px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.stat {
  display: flex;
  align-items: center;
  gap: 6px;

  .stat-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;

    &.total { background: var(--text-secondary); }
    &.connected { background: var(--accent); }
    &.free { background: var(--info); }
    &.active { background: var(--warning); }
  }

  .stat-label {
    font-size: 10px;
    color: var(--text-secondary);
  }

  .stat-value {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);

    &.connected { color: var(--accent); }
    &.free { color: var(--info); }
    &.active { color: var(--warning); }
  }
}

/* 端口名称编辑模式切换栏 */
.port-edit-mode-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 8px 12px; background: var(--bg-glass-strong); border-radius: 6px;
  margin-bottom: 12px;

  .mode-bar-left {
    display: flex; align-items: center; gap: 10px;
  }

  .mode-bar-right {
    display: flex; align-items: center; gap: 6px;

    .panel-toggle-label {
      font-size: 12px; color: var(--text-primary);
    }
  }
}

.port-name-input {
  width: 56px !important;
  :deep(.el-input__inner) {
    padding: 0 2px !important;
    font-size: 8px !important;
    height: 16px !important;
    line-height: 16px !important;
    text-align: center !important;
  }
  :deep(.el-input__wrapper) {
    padding: 0 2px !important;
    min-height: 16px !important;
  }
  :deep(.el-input) {
    font-size: 8px !important;
  }
}

/* LED闪烁动画 */
@keyframes led-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* 移动端适配 */
@media (max-width: 768px) {
  .device-panel-dialog {
    width: 96vw !important;
    max-width: 96vw !important;
    margin: 2vh auto !important;
    border-radius: 8px !important;
  }

  .device-panel-content {
    padding: 12px;
  }

  .device-detail-info {
    padding: 12px;
    margin-bottom: 12px;
  }

  .detail-info-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .device-front-panel {
    padding: 12px;
  }

  .panel-header {
    gap: 8px;
    margin-bottom: 12px;
    padding-bottom: 10px;
  }

  .panel-brand {
    font-size: 13px;
  }

  .rj45-ports-real {
    gap: 4px;
  }
}

/* 端口悬浮提示 - 与机柜管理完全一致 */
.port-tooltip {
  position: fixed;
  z-index: 9999;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-primary);
  box-shadow: var(--shadow-md);
  pointer-events: none;
  min-width: 160px;
}
.tooltip-title {
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--info);
}
.tooltip-body {
  color: var(--text-secondary);
  line-height: 1.8;
}
.tooltip-empty {
  color: var(--text-muted);
  font-size: 11px;
}

</style>
