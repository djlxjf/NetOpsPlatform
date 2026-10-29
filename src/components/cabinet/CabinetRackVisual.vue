<template>
  <div class="cabinet-rack-visual" ref="containerRef">
    <!-- 端口悬浮提示 -->
    <div
      v-if="portTooltip.visible"
      ref="portTooltipEl"
      class="port-tooltip"
      :style="{ position: 'fixed', left: portTooltip.x + 'px', top: portTooltip.y + 'px', zIndex: 9999, background: 'rgba(0,0,0,0.85)', color: '#fff', padding: '6px 10px', borderRadius: '4px', fontSize: '12px', pointerEvents: 'none', whiteSpace: 'nowrap' }"
    >
      {{ portTooltip.content }}
    </div>
    <!-- 用于触发端口连接变化的响应式更新 -->
    <span v-if="portConnections.length" style="display: none;"></span>
    <div
      class="cabinet-viewport"
      ref="viewportRef"
      @wheel="handleWheel"
      @mousedown="handleMouseDown"
    >
      <div class="zoom-controls">
        <button class="zoom-btn" @click="zoomOut" title="缩小">−</button>
        <span class="zoom-level">{{ Math.round(scale * 100) }}%</span>
        <button class="zoom-btn" @click="zoomIn" title="放大">+</button>
        <button class="zoom-btn" @click="resetZoom" title="重置">1:1</button>
        <button class="zoom-btn fit-btn" @click="fitToScreen" title="适应屏幕">⤢</button>
        <span class="zoom-divider"></span>
        <button class="zoom-btn fs-btn" @click.stop="emit('toggle-fullscreen')" :title="isFullscreen ? '退出全屏' : '全屏'">{{ isFullscreen ? '⤡' : '⛶' }}</button>
      </div>
      <div
        class="cabinet-content"
        ref="contentRef"
        :style="{ transform: `translate(${translateX}px, ${translateY}px)` }"
      >
        <svg
          ref="svgRef"
          :width="effectiveSvgWidth * scale"
          :height="svgHeight * scale"
          :viewBox="`0 0 ${effectiveSvgWidth} ${svgHeight}`"
          style="background: #ffffff; display: block; user-select: none; text-rendering: geometricPrecision"
          xmlns="http://www.w3.org/2000/svg"
          @mouseup="onMouseUp"
          @mousemove="onMouseMove"
        >
      <!-- SVG Defs -->
      <defs>
        <linearGradient id="metalGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#2a2a2a" />
          <stop offset="50%" stop-color="#3a3a3a" />
          <stop offset="100%" stop-color="#2a2a2a" />
        </linearGradient>
        <linearGradient id="cabinetInnerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#f5f5f5" />
          <stop offset="50%" stop-color="#ffffff" />
          <stop offset="100%" stop-color="#f5f5f5" />
        </linearGradient>
        <pattern id="ventPattern" patternUnits="userSpaceOnUse" width="3" height="3">
          <rect width="3" height="3" fill="#2a2a2a" />
          <circle cx="1.5" cy="1.5" r="0.6" fill="#4a4a4a" />
        </pattern>
        <pattern id="ventGrille" patternUnits="userSpaceOnUse" width="12" height="6">
          <rect width="12" height="6" fill="#0f0f0f" />
          <rect x="0" y="0.5" width="12" height="1" fill="#2a2a2a" />
          <rect x="0" y="2.5" width="12" height="1" fill="#2a2a2a" />
          <rect x="0" y="4.5" width="12" height="1" fill="#2a2a2a" />
          <line x1="2" y1="0" x2="2" y2="6" stroke="#333" stroke-width="0.5" />
          <line x1="6" y1="0" x2="6" y2="6" stroke="#333" stroke-width="0.5" />
          <line x1="10" y1="0" x2="10" y2="6" stroke="#333" stroke-width="0.5" />
        </pattern>
        <filter id="cabinetShadow" x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="1" dy="1" stdDeviation="1" flood-opacity="0.3" />
        </filter>
        <filter id="deviceShadow" x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="1" dy="1" stdDeviation="0.8" flood-opacity="0.25" />
        </filter>
        <linearGradient id="cabinetFrame" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#35353a" />
          <stop offset="50%" stop-color="#2B2B2B" />
          <stop offset="100%" stop-color="#26262a" />
        </linearGradient>
        <linearGradient id="cabinetBeam" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#1f1f22" />
          <stop offset="50%" stop-color="#141414" />
          <stop offset="100%" stop-color="#0f0f11" />
        </linearGradient>
        <linearGradient id="railMetal" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#d8d9db" />
          <stop offset="50%" stop-color="#dcdddf" />
          <stop offset="100%" stop-color="#d2d3d5" />
        </linearGradient>
        <linearGradient id="squareHole" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#0a0a0a" />
          <stop offset="100%" stop-color="#1a1a1a" />
        </linearGradient>
        <pattern id="ventSlots" patternUnits="userSpaceOnUse" width="10" height="4">
          <rect width="10" height="4" fill="#1a1a1a" />
          <line x1="0" y1="1" x2="10" y2="1" stroke="#333" stroke-width="0.5" />
          <line x1="0" y1="2.5" x2="10" y2="2.5" stroke="#333" stroke-width="0.5" />
        </pattern>
        <filter id="innerShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0.5" dy="0.5" stdDeviation="0.3" flood-color="#000" flood-opacity="0.6" />
        </filter>
      </defs>

      <!-- ===== 多机柜并排渲染（同一画布，底部对齐） ===== -->
      <template v-for="(rack, rIdx) in displayRacks" :key="rack.id || rIdx">
        <g :transform="`translate(${rackOffsetX(rIdx)}, ${rackOffsetY(rack)})`">
          <!-- ===== 机柜框架 ===== -->
          <CabinetFrameComponent
            :cabinet="rack"
            :totalU="rack.totalU || totalU"
            :usedU="getRackUsedU(rack)"
            :emptySlots="getRackEmptySlots(rack)"
          />

          <!-- ===== 已上架设备渲染 ===== -->
          <!-- 空机柜点击捕捉层 → 点击任何空U位均触发上架对话框 -->
          <rect
            :x="LEFT_LABEL_WIDTH + SIDE_FRAME_WIDTH"
            :y="TOP_HEADER_HEIGHT + TOP_VENT_HEIGHT + TOP_MARGIN_HEIGHT"
            :width="CABINET_BODY_WIDTH - 2 * SIDE_FRAME_WIDTH"
            :height="(rack.totalU || totalU) * U_HEIGHT"
            fill="transparent"
            style="cursor: pointer"
            @click.stop="onEmptyAreaClick($event, rack)"
          />
          <template v-for="device in getRackSortedDevices(rack)" :key="device.id">
            <g
              :transform="`translate(${DEVICE_X}, ${getDeviceY(device, rack)})`"
              :data-device-id="device.id"
              :data-rack-id="rack.id"
              :style="{ cursor: interactive ? 'grab' : 'default' }"
              :opacity="isDragging(device) ? 0.4 : 1"
              @click.stop="onDeviceClickHandler($event, device)"
              @mousedown.prevent="onDeviceMouseDown($event, device)"
            >
              <!-- nVisual 真实面板图片优先（图片文件已在源头裁剪自带挂耳）；无图片回退 SVG 绘制面板 -->
              <image
                v-if="getRealPanelImage(device)"
                :href="getRealPanelImage(device)"
                :x="RACK_EAR_W"
                y="0"
                :width="DEVICE_WIDTH - RACK_EAR_W * 2"
                :height="getDeviceHeight(device)"
                preserveAspectRatio="xMidYMid slice"
              />

              <!-- 根据设备类型渲染不同面板 -->
              <DevicePanelRenderer
                v-if="!getRealPanelImage(device)"
                :device="device"
                :width="DEVICE_WIDTH"
                :height="getDeviceHeight(device)"
                @port-click="(portInfo) => emit('port-click', portInfo)"
                @port-hover="handlePortHover"
                @port-leave="handlePortLeave"
                @power-toggle="(data) => emit('power-toggle', data)"
                @patch-rename="(data) => emit('patch-rename', data)"
              />

              <!-- 挂耳 -->
              <RackEarsComponent
                :device="device"
                :width="DEVICE_WIDTH"
                :height="getDeviceHeight(device)"
                :color="device.device_type === 'pdu' ? '#888' : '#2a2a2a'"
              />

              <!-- 选中高亮（已按需求移除蓝色选中框） -->
            </g>
          </template>
        </g>
      </template>

      <!-- ===== 拖拽预览框 ===== -->
      <template v-if="dragState && previewU !== null">
        <rect
          :x="DEVICE_X + rackOffsetX(dragTargetRackIdx)"
          :y="uToY(previewU + dragState.device.u_height - 1, rackTotalUForIndex(dragTargetRackIdx)) + rackOffsetY(displayRacks[dragTargetRackIdx]) + 1"
          :width="DEVICE_WIDTH"
          :height="dragState.device.u_height * U_HEIGHT - 2"
          :fill="previewValid ? 'rgba(0, 170, 68, 0.15)' : 'rgba(238, 51, 51, 0.2)'"
          :stroke="previewValid ? COLORS.statusNormal : COLORS.statusAlarm"
          stroke-width="1.5"
          stroke-dasharray="5,3"
          pointer-events="none"
        />
      </template>
        </svg>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  U_HEIGHT, LEFT_LABEL_WIDTH, CABINET_BODY_WIDTH, RAIL_WIDTH,
  SIDE_FRAME_WIDTH, TOP_HEADER_HEIGHT, TOP_VENT_HEIGHT,
  TOP_MARGIN_HEIGHT, BOTTOM_MARGIN_HEIGHT, FEET_HEIGHT,
  BOTTOM_FOOTER_HEIGHT, SVG_WIDTH, DEVICE_X, DEVICE_WIDTH,
  RJ45_W, RJ45_H, RJ45_SPACING_X, RJ45_SPACING_Y,
  SFP_W, SFP_H, SFP_SPACING,
  HDD25_W, HDD25_H, RACK_EAR_W, RACK_EAR_SCREW,
  HOLE_SIZE, COLORS, VENDOR_COLORS, DEFAULT_VENDOR_COLOR,
  uToY, statusColor, checkOverlap, getVendorColor, getDevicePortConfig,
} from '../../composables/useRackTransform.js'
import { usePortStateStore } from '../../stores/portState'
import { useDeviceStore } from '../../stores'
import { resolvePortName, resolveRemotePortName, getShortPortKey, standardPortName, findPatchItemById, findCabinetOfDevice } from '../../utils/portNaming.js'
import { storeToRefs } from 'pinia'
import { ElMessageBox } from 'element-plus'

const portStateStore = usePortStateStore()
const deviceStore = useDeviceStore()
const { connections: portConnections } = storeToRefs(portStateStore)

const props = defineProps({
  cabinet: { type: Object, default: () => ({ id: 'CAB-01', name: '标准机柜', totalU: 42 }) },
  cabinets: { type: Array, default: () => [] },
  devices: { type: Array, default: () => [] },
  selectedDeviceId: { type: [String, Number], default: null },
  interactive: { type: Boolean, default: true },
  isFullscreen: { type: Boolean, default: false },
})

const emit = defineEmits(['device-click', 'device-move', 'device-contextmenu', 'empty-u-click', 'port-click', 'port-hover', 'port-leave', 'power-toggle', 'patch-rename', 'toggle-fullscreen'])

// 查找设备对应的真实面板图片；无则返回 null（回退 SVG 绘制面板）
// 注：面板图片资源（public/panel-images）已移除，统一使用 DevicePanelRenderer 自绘面板（品牌LOGO+型号+端口）
function getRealPanelImage(device) {
  return null
}

const containerRef = ref(null)
const svgRef = ref(null)
const viewportRef = ref(null)
const contentRef = ref(null)
const portTooltipEl = ref(null)
const dragState = ref(null)
const previewU = ref(null)
// 拖拽时鼠标当前所在的目标机柜索引（用于跨机柜预览框定位）
const dragTargetRackIdx = ref(0)

const scale = ref(1)
const translateX = ref(0)
const translateY = ref(0)
const isPanning = ref(false)
const panStart = reactive({ x: 0, y: 0, tx: 0, ty: 0 })
const maxScale = ref(4)
const minScale = computed(() => {
  if (!viewportRef.value) return 0.2
  const vpRect = viewportRef.value.getBoundingClientRect()
  const scaleX = vpRect.width / effectiveSvgWidth.value
  const scaleY = vpRect.height / svgHeight.value
  return Math.min(scaleX, scaleY, 0.2)
})

const portTooltip = reactive({
  visible: false,
  x: 0,
  y: 0,
  content: null
})

// 参与对端解析的机柜列表（含单柜模式回退）：对端是配线架等配线设备时，从 patchItems 中查找备注名
const cabinetsForLookup = computed(() => {
  const list = Array.isArray(props.cabinets) ? props.cabinets.filter(Boolean) : []
  if (props.cabinet && props.cabinet.id && !list.some(c => String(c.id) === String(props.cabinet.id))) {
    list.push(props.cabinet)
  }
  return list
})

function handlePortHover(portInfo) {
  const conn = portStateStore.getPortConnection(portInfo.deviceId, portInfo.portId)
  let content = ''
  // 配线架端口：portName 即备注名（无备注时回退"端口N"），只显示备注名，不再追加端口号
  const portLabel = portInfo.portType === 'console'
    ? 'Console'
    : portInfo.portType === 'patch-panel'
      ? (portInfo.portName || standardPortName(portInfo.portId))
      : `${portInfo.portName}${String(portInfo.portNum) !== String(portInfo.portName) ? ' ' + portInfo.portNum : ''}`

  if (portInfo.portType === 'console') {
    content = 'Console 口'
  } else if (conn) {
    // 本端设备/端口名实时解析（portNames 是权威源，改名后立即生效；配线架备注名存于 portMap）
    const localDev = deviceStore.devices.find(d => String(d.id) === String(portInfo.deviceId)) || portInfo.device
    const localDeviceName = localDev?.name || localDev?.ip || '未知设备'
    const localPortName = localDev
      ? resolvePortName(localDev, portInfo.portId)
      : (portInfo.portName || portInfo.portId)
    // 查对端设备型号与 U 数（用户要求显示对端设备型号及对应U数）
    const remoteDev = deviceStore.devices.find(d => String(d.id) === String(conn.remoteDeviceId))
    // 对端是配线架等机柜内配线设备时，不在 deviceStore 中，从机柜 patchItems 查找
    const remotePatchItem = remoteDev ? null : findPatchItemById(cabinetsForLookup.value, conn.remoteDeviceId)
    const remoteName = remoteDev?.name || remotePatchItem?.name || conn.remoteDeviceName || '未知'
    // 对端端口名动态解析：自定义名/配线架备注名 > 标准名 > 连接快照兕底（不再显示旧快照）
    const remotePortDisplay = resolveRemotePortName(remoteDev || remotePatchItem, conn.remotePortId, conn.remoteDeviceId, conn.remotePortNum)
    // 跨机柜判断：两端设备所在机柜不同时，B端加机柜名前缀（用户要求：仅跨机柜显示机柜名）
    const localCab = findCabinetOfDevice(cabinetsForLookup.value, portInfo.deviceId)
    const remoteCab = findCabinetOfDevice(cabinetsForLookup.value, conn.remoteDeviceId)
    const isCrossCabinet = !!(localCab && remoteCab && String(localCab.id) !== String(remoteCab.id))
    // 跨机柜："机柜名-设备名-端口"（用户指定格式，不含型号/U数）；同机柜：设备对端保持"名称 [型号] xU-端口"、配线架对端"配线架名-备注名"
    if (isCrossCabinet) {
      content = `${portLabel} | A端: ${localDeviceName}-${localPortName} | B端: ${remoteCab.name}-${remoteName}-${remotePortDisplay} | 线缆: ${conn.cableType}`
    } else if (remotePatchItem) {
      content = `${portLabel} | A端: ${localDeviceName}-${localPortName} | B端: ${remoteName}-${remotePortDisplay} | 线缆: ${conn.cableType}`
    } else {
      const remoteModel = remoteDev?.model ? '[' + remoteDev.model + ']' : ''
      const remoteU = remoteDev ? (remoteDev.u_height || remoteDev.uSize || 1) : 1
      content = `${portLabel} | A端: ${localDeviceName}-${localPortName} | B端: ${remoteName} ${remoteModel} ${remoteU}U-${remotePortDisplay} | 线缆: ${conn.cableType}`
    }
  } else {
    content = `${portLabel} | 状态: 未连接`
  }

  portTooltip.content = content
  portTooltip.x = portInfo.clientX + 10
  portTooltip.y = portInfo.clientY + 10
  portTooltip.visible = true

  emit('port-hover', portInfo)
}

function handlePortLeave() {
  portTooltip.visible = false
  portTooltip.content = null
  emit('port-leave')
}

// 计算总U和高宽
const totalU = computed(() => props.cabinet?.totalU || 42)
// 多机柜并排时，取所有机柜的最大 U 数作为画布高度基准（矮柜通过 rackOffsetY 下移实现底部对齐）
const maxRackTotalU = computed(() => {
  const racks = displayRacks.value
  if (!racks.length) return totalU.value
  return Math.max(...racks.map(r => r.totalU || totalU.value))
})
const bodyHeight = computed(() => maxRackTotalU.value * U_HEIGHT + TOP_MARGIN_HEIGHT + BOTTOM_MARGIN_HEIGHT)
const svgHeight = computed(() => TOP_HEADER_HEIGHT + TOP_VENT_HEIGHT + bodyHeight.value + BOTTOM_FOOTER_HEIGHT + FEET_HEIGHT)

// ===== 多机柜并排（同一画布） =====
// 参与并排渲染的机柜列表（优先使用 cabinets 数组；为空则回退到单柜 cabinet）
// 单画布并排上限：与 CabinetsView 的 MAX_DISPLAY_CABINETS 保持一致
const MAX_DISPLAY_RACKS = 5
const displayRacks = computed(() => {
  if (props.cabinets && props.cabinets.length > 0) return props.cabinets.slice(0, MAX_DISPLAY_RACKS)
  if (props.cabinet && props.cabinet.id) return [props.cabinet]
  return []
})
// 每柜之间的横向间距
const RACK_GAP = 20
// 单个机柜占用的横向宽度（含左侧 U 标签 + 柜体）
const RACK_STEP_X = LEFT_LABEL_WIDTH + CABINET_BODY_WIDTH + RACK_GAP
// 画布总宽 = 柜数 × 单柜步宽 + 尾部留白
const multiSvgWidth = computed(() => {
  const n = displayRacks.value.length
  if (n === 0) return SVG_WIDTH
  return n * RACK_STEP_X + LEFT_LABEL_WIDTH
})
// 每柜的左偏移
const rackOffsetX = (index) => index * RACK_STEP_X
// 每柜的纵向偏移：以最大 U 机柜为基准，矮柜整体下移 (maxU - rackU) * U_HEIGHT，实现底部对齐
const rackOffsetY = (rack) => {
  const rackU = rack && rack.totalU ? rack.totalU : totalU.value
  return (maxRackTotalU.value - rackU) * U_HEIGHT
}
// 渲染用的总宽（兼容单柜时取 SVG_WIDTH）
const effectiveSvgWidth = computed(() => {
  return displayRacks.value.length > 1 ? multiSvgWidth.value : SVG_WIDTH
})

// 反向 U 编号：从 totalU 向下
function revU(u) {
  return totalU.value - u + 1
}

// ===== SVG 设备数据转换（按柜） =====
// 计算开销较大（建 deviceMap + 遍历 slots + 排序），而 previewValid / dragRackIndex
// 在拖拽过程中会被高频求值，复杂度 O(机柜数 × 设备数)。
// 这里按「机柜对象 + devices 引用 + slots 引用」做记忆化：任一项变化即失效，
// 保证不会返回脏数据，同时避免同一帧内重复计算。
const _rackDevicesCache = new WeakMap()
const getRackDevices = (rack) => {
  if (!rack || !props.devices) return []
  const cached = _rackDevicesCache.get(rack)
  if (cached && cached.devices === props.devices && cached.slots === rack.slots && cached.patchItems === rack.patchItems) {
    return cached.list
  }
  const list = computeRackDevices(rack)
  _rackDevicesCache.set(rack, {
    devices: props.devices, slots: rack.slots, patchItems: rack.patchItems, list,
  })
  return list
}

function computeRackDevices(rack) {
  const deviceMap = {}
  props.devices.forEach((d) => {
    deviceMap[d.id] = d
  })

  // 从 slots 转换
  const slotMap = rack.slots || {}
  const deviceIds = new Set(Object.values(slotMap).filter(Boolean))
  const result = []

  deviceIds.forEach((deviceId) => {
    const device = deviceMap[deviceId]
    if (!device) return

    let minU = Infinity
    Object.entries(slotMap).forEach(([u, id]) => {
      if (id === deviceId) {
        const uNum = parseFloat(u)
        if (uNum < minU) minU = uNum
      }
    })
    if (minU === Infinity) return

    const uSize = device.uSize || 1
    result.push({
      id: device.id,
      device_type: device.type || 'server',
      brand: device.vendor || '',
      model: device.model || '',
      name: device.name || '',
      vendor: device.vendor || '',
      ip: device.ip || '',
      u_position: minU,
      u_height: uSize,
      status: device.status || 'normal',
      ports: [],
      drives: [],
      _isPatchItem: false,
    })
  })

  // 从 patchItems 转换
  const patchItems = rack.patchItems || []
  patchItems.forEach((item) => {
    let deviceType = 'other'
    let brand = ''
    let model = ''
    let status = 'normal'

    if (item.category === 'network') {
      const device = deviceMap[item.deviceId]
      if (device) {
        deviceType = device.type || 'switch'
        brand = device.vendor || ''
        model = device.model || ''
        status = device.status || 'normal'
      } else {
        deviceType = 'switch'
      }
    } else if (item.category === 'patch_panel') {
      deviceType = 'patch_panel'
    } else if (item.category === 'cable_manager') {
      deviceType = 'cable_manager'
    } else if (item.category === 'odf') {
      deviceType = 'odf'
    } else if (item.category === 'fiber_tray') {
      deviceType = 'fiber_tray'
    }

    const uSize = item.uSize || 1
    const startU = item.startU || 1

    result.push({
      id: item.id,
      device_type: deviceType,
      brand: brand,
      model: model,
      name: item.name || '',
      vendor: '',
      ip: '',
      u_position: startU,
      u_height: uSize,
      status: status,
      ports: [],
      drives: [],
      _isPatchItem: true,
      _category: item.category,
      portMap: item.portMap || {},
      fiberType: item.fiberType || 'SC',
      fibers: item.fibers || 0,
      fiberMap: item.fiberMap || {},
      ports_count: item.ports || 0,
    })
  })

  result.sort((a, b) => b.u_position - a.u_position)
  return result
}

// 兼容单柜逻辑：将当前柜的设备转为 allSvgDevices（供原有逻辑使用）
const allSvgDevices = computed(() => getRackDevices(props.cabinet))

// 已使用 U 数
      // 占用 U 数：每台设备向上取整（1U=3 个方孔位，不足 3 个方孔位也算占用 1U）
      const usedU = computed(() => allSvgDevices.value.reduce((sum, d) => sum + Math.ceil(d.u_height || 1), 0))

// 按柜：占用 U 数
function getRackUsedU(rack) {
  const devs = getRackDevices(rack)
  return devs.reduce((sum, d) => sum + Math.ceil(d.u_height || 1), 0)
}

// 按柜：连续空 U 区间（使用范围检查以支持 1/3U 精度）
function getRackEmptySlots(rack) {
  const devs = getRackDevices(rack)
  const ranges = []
  devs.forEach((d) => {
    const h = d.u_height || 1
    ranges.push({ start: d.u_position, end: d.u_position + h })
  })
  const step = 1 / 3
  const total = rack?.totalU || totalU.value
  const isOccupied = (u) => {
    for (const r of ranges) {
      if (u >= r.start && u < r.end) return true
    }
    return false
  }
  const slots = []
  let start = null
  for (let u = 1; u <= total + 0.0001; u += step) {
    const uc = Math.round(u * 3) / 3
    if (!isOccupied(uc)) {
      if (start === null) start = uc
    } else if (start !== null) {
      const prev = Math.round((uc - step) * 3) / 3
      const size = prev - start + step
      if (size >= 1) slots.push({ startU: start, endU: prev, size })
      start = null
    }
  }
  if (start !== null) {
    const size = total - start + step
    if (size >= 1) slots.push({ startU: start, endU: total, size })
  }
  return slots
}

// 连续空 U 区间（使用范围检查以支持 1/3U 精度）
const emptySlots = computed(() => {
  // 收集所有设备占用的范围 [startU, startU + uHeight)
  const ranges = []
  allSvgDevices.value.forEach((d) => {
    const h = d.u_height || 1
    ranges.push({ start: d.u_position, end: d.u_position + h })
  })
  // 按 1/3U 步进扫描机柜，标记占用位置
  const step = 1 / 3
  const total = totalU.value
  // occupied[floor(u * 3)] = true/false，表示该 1/3U位置是否被占用
  const isOccupied = (u) => {
    for (const r of ranges) {
      if (u >= r.start && u < r.end) return true
    }
    return false
  }
  const slots = []
  let start = null
  // 从 1 到 totalU，按 1/3U 步进扫描
  for (let u = 1; u <= total + 0.0001; u += step) {
    // 浮点精度修正
    const uc = Math.round(u * 3) / 3
    if (!isOccupied(uc)) {
      if (start === null) start = uc
    } else if (start !== null) {
      const prev = Math.round((uc - step) * 3) / 3
      const size = prev - start + step
      if (size >= 1) slots.push({ startU: start, endU: prev, size })
      start = null
    }
  }
  if (start !== null) {
    const size = total - start + step
    if (size >= 1) slots.push({ startU: start, endU: total, size })
  }
  return slots
})

// 排序设备
const sortedDevices = computed(() => {
  return [...allSvgDevices.value].sort((a, b) => b.u_position - a.u_position)
})

// 按柜：排序设备
function getRackSortedDevices(rack) {
  return getRackDevices(rack).slice().sort((a, b) => b.u_position - a.u_position)
}

// 设备坐标：按所属机柜的 totalU 换算（支持不同 U 数机柜并排，矮柜内部设备位置正确）
function getDeviceY(device, rack) {
  const rackU = rack && rack.totalU ? rack.totalU : totalU.value
  const uHeight = device.u_height || 1
  return uToY(device.u_position + uHeight - 1, rackU) + 1
}
function getDeviceHeight(device) {
  return (device.u_height || 1) * U_HEIGHT - 2
}

// 拖拽预览有效性
const previewValid = computed(() => {
  if (!dragState.value || previewU.value === null) return true
  const dev = dragState.value.device
  // 跨机柜拖拽时，重叠检查应基于目标机柜的设备与 totalU（而非单柜）
  const targetRack = displayRacks.value[dragTargetRackIdx.value]
  const targetDevices = targetRack ? getRackDevices(targetRack) : allSvgDevices.value
  const targetTotal = targetRack && targetRack.totalU ? targetRack.totalU : totalU.value
  return !checkOverlap(targetDevices, dev.id, previewU.value, dev.u_height || 1, targetTotal)
})

function isDragging(device) {
  return dragState.value && String(dragState.value.device.id) === String(device.id)
}

// 拖拽中设备所属机柜的索引（用于预览框横向定位）
const dragRackIndex = computed(() => {
  if (!dragState.value) return 0
  const deviceId = dragState.value.device.id
  const idx = displayRacks.value.findIndex(r => {
    return getRackDevices(r).some(d => String(d.id) === String(deviceId))
  })
  return idx >= 0 ? idx : 0
})

// ===== ClientY -> U 位（按目标机柜 totalU 换算，多柜底部对齐后需减去该柜纵向偏移） =====
function clientYToU(clientY, rackTotal) {
  const svg = svgRef.value
  if (!svg) return null
  const pt = svg.createSVGPoint()
  pt.y = clientY
  pt.x = 0
  const ctm = svg.getScreenCTM()
  if (!ctm) return null
  const svgY = pt.matrixTransform(ctm.inverse()).y
  const rackU = rackTotal || totalU.value
  // 减去该柜的纵向偏移（矮柜下移后，柜内局部坐标 = 根坐标 - 偏移量）
  const yInBody = svgY - (maxRackTotalU.value - rackU) * U_HEIGHT - (TOP_HEADER_HEIGHT + TOP_VENT_HEIGHT + TOP_MARGIN_HEIGHT)
  const uFromTopContinuous = yInBody / U_HEIGHT
  const uFloat = rackU - uFromTopContinuous
  // 按 1/3U（单个方孔位）步进吸附：1U 设备占 3 孔、2U 占 6 孔，均可在任意方孔位间移动
  // 方孔网格全局均匀（每 12px 一孔），挂耳螺丝孔随 1/3U 偏移自动套在方孔上
  const snappedU = Math.round(uFloat * 3) / 3
  const minU = 1 / 3
  const maxU = rackU
  return Math.max(minU, Math.min(maxU, snappedU))
}

// ===== ClientX -> 目标机柜索引（跨机柜拖拽） =====
// 将鼠标 X 坐标转换为 SVG 世界坐标，判断落在哪个机柜的横向区间
function clientXToRackIndex(clientX) {
  const svg = svgRef.value
  if (!svg || displayRacks.value.length <= 1) return 0
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = 0
  const ctm = svg.getScreenCTM()
  if (!ctm) return 0
  const svgX = pt.matrixTransform(ctm.inverse()).x
  for (let i = 0; i < displayRacks.value.length; i++) {
    const start = rackOffsetX(i)
    const end = start + RACK_STEP_X
    // 落在该柜区间内（含边缘）
    if (svgX >= start && svgX < end) return i
  }
  // 超出最右边界则归到最后一个柜
  return displayRacks.value.length - 1
}

// 返回目标机柜的 U 位上下限（按 1/3U 精度）
function rackTotalUForIndex(index) {
  const rack = displayRacks.value[index]
  return rack && rack.totalU ? rack.totalU : totalU.value
}

// ===== 拖拽事件 =====
const DRAG_THRESHOLD = 5 // 最小拖拽距离（像素）

// 记录鼠标按下时的初始状态（用于检测是否真正发生了拖拽）
const mouseDownState = ref(null)

function onDeviceMouseDown(e, device) {
  if (!props.interactive) return
  e.preventDefault()
  e.stopPropagation()
  // 记录按下时的初始位置和设备信息
  mouseDownState.value = {
    device,
    startU: device.u_position,
    clientX: e.clientX,
    clientY: e.clientY,
    hasMoved: false, // 是否已经移动超过阈值
  }
}

function onMouseMove(e) {
  try {
    if (!mouseDownState.value) return

    // 检查是否超过拖拽阈值
    if (!mouseDownState.value.hasMoved) {
      const dx = e.clientX - mouseDownState.value.clientX
      const dy = e.clientY - mouseDownState.value.clientY
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance > DRAG_THRESHOLD) {
        // 超过阈值，正式开始拖拽
        mouseDownState.value.hasMoved = true
        dragState.value = {
          device: mouseDownState.value.device,
          startU: mouseDownState.value.startU,
        }
        previewU.value = mouseDownState.value.startU
      }
    }

    // 如果正在拖拽，更新预览位置
    if (dragState.value) {
      dragTargetRackIdx.value = clientXToRackIndex(e.clientX)
      // 目标机柜的 U 上限
      const targetRackIdx = dragTargetRackIdx.value
      const targetRackTotal = rackTotalUForIndex(targetRackIdx)
const u = clientYToU(e.clientY, targetRackTotal)
      if (u === null) return
      const uHeight = dragState.value.device.u_height || 1
      // startU 范围 [1, totalU - uHeight + 1]
      const clampedU = Math.max(1, Math.min(targetRackTotal - uHeight + 1, u))
      previewU.value = clampedU
    }
  } catch (err) {
    console.error('onMouseMove error:', err)
  }
}

function onMouseUp(e) {
  try {
    if (!mouseDownState.value) return

    // 如果发生了有效拖拽（移动超过阈值），执行移动
    if (dragState.value) {
      // 目标机柜索引（跨机柜拖拽）：根据拖拽过程中的鼠标 X 判断
      const targetRackIdx = dragTargetRackIdx.value
      const targetRack = displayRacks.value[targetRackIdx]
      const targetRackTotal = rackTotalUForIndex(targetRackIdx)
      const targetDevices = targetRack ? getRackDevices(targetRack) : allSvgDevices.value

      const u = clientYToU(e.clientY, targetRackTotal)
      const uHeight = dragState.value.device.u_height || 1
      let targetU = dragState.value.startU
      if (u !== null) {
        // 目标机柜总高可能不同（当前各柜同高 42U，但兼容不同高）
        targetU = Math.max(1, Math.min(targetRackTotal - uHeight + 1, u))
      }
      const movedRack = targetRackIdx !== dragRackIndex.value
      if (
        !checkOverlap(targetDevices, dragState.value.device.id, targetU, uHeight, targetRackTotal) &&
        (targetU !== dragState.value.startU || movedRack)
      ) {
        emit('device-move', {
          deviceId: dragState.value.device.id,
          fromU: dragState.value.startU,
          fromRackId: dragState.value.device._rackId || (displayRacks.value[dragRackIndex.value] && displayRacks.value[dragRackIndex.value].id),
          toU: targetU,
          toCabinetId: targetRack ? targetRack.id : (displayRacks.value[0] && displayRacks.value[0].id),
          toRackIndex: targetRackIdx,
          device: dragState.value.device,
        })
      }
      dragState.value = null
      previewU.value = null
      dragTargetRackIdx.value = 0
    }

    mouseDownState.value = null
  } catch (err) {
    console.error('onMouseUp error:', err)
  }
}

// ===== 缩放平移功能 =====
function handleWheel(e) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  const newScale = Math.max(minScale.value, Math.min(maxScale.value, scale.value + delta))
  if (newScale === scale.value) return
  
  const rect = viewportRef.value.getBoundingClientRect()
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top
  
  const contentX = (mouseX - translateX.value) / scale.value
  const contentY = (mouseY - translateY.value) / scale.value
  
  scale.value = newScale
  
  translateX.value = mouseX - contentX * newScale
  translateY.value = mouseY - contentY * newScale
}

// 平移事件监听器引用（用于清理）
const boundPanMoveHandler = ref(null)
const boundPanUpHandler = ref(null)
// 记录本次鼠标事件是否发生了拖动（超过阈值），以及是否需要抑制随后的空位点击弹窗
let panMoved = false
let suppressEmptyClick = false

function handleMouseDown(e) {
  if (e.button !== 0) return
  if (e.target.closest('.zoom-controls')) return

  // 每次新按下时重置，避免上次拖动的抑制状态影响本次点击
  suppressEmptyClick = false
  panMoved = false
  isPanning.value = true
  panStart.x = e.clientX
  panStart.y = e.clientY
  panStart.tx = translateX.value
  panStart.ty = translateY.value
  
  boundPanMoveHandler.value = handlePanMove
  boundPanUpHandler.value = handlePanUp
  document.addEventListener('mousemove', boundPanMoveHandler.value)
  document.addEventListener('mouseup', boundPanUpHandler.value)
  document.body.style.cursor = 'grabbing'
}

function handlePanMove(e) {
  if (!isPanning.value) return
  // 移动超过阈值才算真正“拖动”，否则视为点击空白
  if (Math.abs(e.clientX - panStart.x) > 5 || Math.abs(e.clientY - panStart.y) > 5) panMoved = true
  translateX.value = panStart.tx + (e.clientX - panStart.x)
  translateY.value = panStart.ty + (e.clientY - panStart.y)
}

function handlePanUp() {
  isPanning.value = false
  // 本次是拖动 → 抑制接下来的一次空位点击弹窗
  if (panMoved) suppressEmptyClick = true
  panMoved = false
  if (boundPanMoveHandler.value) {
    document.removeEventListener('mousemove', boundPanMoveHandler.value)
  }
  if (boundPanUpHandler.value) {
    document.removeEventListener('mouseup', boundPanUpHandler.value)
  }
  boundPanMoveHandler.value = null
  boundPanUpHandler.value = null
  document.body.style.cursor = ''
}

function zoomIn() {
  const newScale = Math.min(maxScale.value, scale.value + 0.1)
  setScaleCentered(newScale)
}

function zoomOut() {
  const newScale = Math.max(minScale.value, scale.value - 0.1)
  setScaleCentered(newScale)
}

function setScaleCentered(newScale) {
  if (!viewportRef.value) return
  const rect = viewportRef.value.getBoundingClientRect()
  const centerX = rect.width / 2
  const centerY = rect.height / 2
  const contentX = (centerX - translateX.value) / scale.value
  const contentY = (centerY - translateY.value) / scale.value
  scale.value = newScale
  translateX.value = centerX - contentX * newScale
  translateY.value = centerY - contentY * newScale
}

function resetZoom() {
  scale.value = 1
  translateX.value = 0
  translateY.value = 0
}

function fitToScreen() {
  if (!viewportRef.value || !contentRef.value) return
  const vpRect = viewportRef.value.getBoundingClientRect()
  const contentW = effectiveSvgWidth.value
  const contentH = svgHeight.value
  
  const scaleX = vpRect.width / contentW
  const scaleY = vpRect.height / contentH
  const fitScale = Math.min(scaleX, scaleY, 1)
  
  scale.value = fitScale
  translateX.value = (vpRect.width - contentW * fitScale) / 2
  translateY.value = (vpRect.height - contentH * fitScale) / 2
}

// 全局事件监听
onMounted(() => {
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  // SVG 元素上的 Vue onClick 事件绑定在部分场景下不生效，改用原生事件委托确保电源按钮可点
  svgRef.value && svgRef.value.addEventListener('click', onRackPowerClick)
  setTimeout(() => {
    fitToScreen()
  }, 50)
})
onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  svgRef.value && svgRef.value.removeEventListener('click', onRackPowerClick)
  if (boundPanMoveHandler.value) {
    document.removeEventListener('mousemove', boundPanMoveHandler.value)
  }
  if (boundPanUpHandler.value) {
    document.removeEventListener('mouseup', boundPanUpHandler.value)
  }
})

// 机柜内设备电源按钮原生委托：DevicePanelRenderer 的 SVG onClick 事件未可靠触发，此处兜底
function onRackPowerClick(e) {
  const hit = e.target && e.target.closest && e.target.closest('[data-power-btn]')
  const pr = e.target && e.target.closest && e.target.closest('[data-patch-rename]')
  if (!hit && !pr) return
  const devEl = e.target.closest('[data-device-id]')
  const deviceId = devEl && devEl.getAttribute('data-device-id')
  if (!deviceId) return
  let device = deviceStore.devices.find(d => String(d.id) === String(deviceId))
  if (!device) {
    for (const r of displayRacks.value) {
      if (Array.isArray(r.patchItems)) {
        device = r.patchItems.find(i => String(i.id) === String(deviceId) || String(i.deviceId) === String(deviceId))
        if (device) break
      }
    }
  }
if (!device) return
  if (hit) {
    emit('power-toggle', { deviceId: device.id, device })
  } else if (pr) {
    const portNum = parseInt(pr.getAttribute('data-patch-rename'), 10)
    if (!portNum) return
    emit('patch-rename', { deviceId: device.id, device, portNum })
  } else {
    const portEl = e.target.closest('[data-port-id]')
    if (portEl) {
      emit('port-click', {
        deviceId: device.id,
        device,
        portId: portEl.getAttribute('data-port-id'),
        portNum: parseInt(portEl.getAttribute('data-port-num'), 10),
        portType: portEl.getAttribute('data-port-type') || 'ethernet',
        portName: portEl.getAttribute('data-port-name') || ''
      })
    }
  }
}

// 仅在切换到不同机柜时重新适应屏幕；deep 监听会让拖动设备后的数据更新也触发 fitToScreen，导致用户放大后被强制缩小
watch(() => displayRacks.value.map(r => r.id).join(','), () => {
  setTimeout(() => {
    fitToScreen()
  }, 50)
})

function onDeviceClickHandler(e, device) {
  if (!props.interactive) return
  e.stopPropagation()
  emit('device-click', device.id, device)
}

function onEmptySlotClick(slot) {
  if (!props.interactive) return
  if (suppressEmptyClick) { suppressEmptyClick = false; return }
  emit('empty-u-click', slot.startU)
}

// 点击空区域（未被设备占据）→ 把点击位置换算成 1/3U 精度并 emit（按所属机柜 U 数换算）
function onEmptyAreaClick(e, rack) {
  if (!props.interactive) return
  if (suppressEmptyClick) { suppressEmptyClick = false; return }
  const rackU = rack && rack.totalU ? rack.totalU : totalU.value
  const u = clientYToU(e.clientY, rackU)
  if (u === null) return
  // 保留 1/3U 精度（每U有3个方孔），clamp 到所属机柜范围
  const targetU = Math.max(1, Math.min(rackU, u))
  emit('empty-u-click', targetU)
}

// ===== 设备面板渲染子组件（内联定义） =====
// 注：为了适配 Vue SFC 模板，设备面板渲染逻辑以组件形式在下方定义
</script>

<script>
import { h, defineComponent, ref, reactive } from 'vue'
import { statusColor, COLORS, U_HEIGHT, DEVICE_WIDTH, RACK_EAR_W, HOLE_SIZE, getVendorColor, getEarScrewPositions, RJ45_W, RJ45_H, RJ45_SPACING_X, RJ45_SPACING_Y, SFP_W, SFP_H, SFP_SPACING, HDD25_W, HDD25_H, TOP_MARGIN_HEIGHT, BOTTOM_MARGIN_HEIGHT, LEFT_LABEL_WIDTH, CABINET_BODY_WIDTH, SIDE_FRAME_WIDTH, RAIL_WIDTH, SVG_WIDTH, TOP_HEADER_HEIGHT, TOP_VENT_HEIGHT, BOTTOM_FOOTER_HEIGHT, FEET_HEIGHT } from '../../composables/useRackTransform.js'
import { DevicePanelRenderer, RackEarsComponent } from './DevicePanelRenderer.js'
import { renderBrandLogo } from './brandLogos.js'
import { usePortStateStore } from '../../stores/portState'

const patchLabels = reactive({})

// ===== 机柜框架组件 =====
const CabinetFrameComponent = defineComponent({
  name: 'CabinetFrameComponent',
  props: { cabinet: Object, totalU: Number, usedU: Number, emptySlots: Array },
  setup(props) {
    return () => {
      const { cabinet, totalU, usedU } = props
      const bodyH = totalU * U_HEIGHT + TOP_MARGIN_HEIGHT + BOTTOM_MARGIN_HEIGHT
      const cabinetLeft = LEFT_LABEL_WIDTH
      const cabinetRight = LEFT_LABEL_WIDTH + CABINET_BODY_WIDTH
      const cabinetTop = TOP_HEADER_HEIGHT + TOP_VENT_HEIGHT
      const cabinetBottom = cabinetTop + bodyH
      const headerName = cabinet?.name || `${totalU}U 标准机柜`
      const headerModel = cabinet?.model || '标准机柜'
      const headerSize = cabinet?.size || `尺寸：600×1000×${Math.round(totalU * 44.45 + 200)}mm`
      const footerLocation = cabinet?.location || 'IDC机房'
      const RAIL_END_PADDING = 0
      const leftRailX = cabinetLeft + SIDE_FRAME_WIDTH
      const rightRailX = cabinetRight - RAIL_WIDTH - SIDE_FRAME_WIDTH
      const railY = cabinetTop + TOP_MARGIN_HEIGHT - RAIL_END_PADDING
      const railHeight = bodyH - TOP_MARGIN_HEIGHT - BOTTOM_MARGIN_HEIGHT + 2 * RAIL_END_PADDING

      // 引用 design tokens 中定义的 SVG_WIDTH
      const svgW = SVG_WIDTH

      return [
        // 顶部金属顶盖
        h('rect', { x: cabinetLeft - 2, y: 0, width: CABINET_BODY_WIDTH + 4, height: TOP_VENT_HEIGHT + 3, fill: 'url(#cabinetBeam)', stroke: '#0a0a0a', 'stroke-width': 1 }),
        h('line', { x1: cabinetLeft - 1, y1: 0, x2: cabinetRight + 1, y2: 0, stroke: '#5a5a5a', 'stroke-width': 0.6 }),
        h('line', { x1: cabinetLeft - 1, y1: TOP_HEADER_HEIGHT + TOP_VENT_HEIGHT + 1, x2: cabinetRight + 1, y2: TOP_HEADER_HEIGHT + TOP_VENT_HEIGHT + 1, stroke: '#1a1a1a', 'stroke-width': 0.5 }),
        h('rect', { x: cabinetLeft + 1, y: TOP_HEADER_HEIGHT + 1, width: CABINET_BODY_WIDTH - 2, height: TOP_VENT_HEIGHT - 2, fill: '#0a0a0a', stroke: '#1a1a1a', 'stroke-width': 0.3 }),
        h('rect', { x: cabinetLeft + 3, y: TOP_HEADER_HEIGHT + 3, width: CABINET_BODY_WIDTH - 6, height: TOP_VENT_HEIGHT - 6, fill: 'none', stroke: '#3a3a3a', 'stroke-width': 0.5 }),

        // 通风栅格
        ...Array.from({ length: 14 }).map((_, i) =>
          h('rect', { key: `vent-l-${i}`, x: cabinetLeft + 8 + i * 2.5, y: TOP_HEADER_HEIGHT + 6, width: 1.2, height: TOP_VENT_HEIGHT - 12, fill: '#333338', rx: 0.4 })
        ),
        ...Array.from({ length: 14 }).map((_, i) =>
          h('rect', { key: `vent-r-${i}`, x: cabinetRight - 43 + i * 2.5, y: TOP_HEADER_HEIGHT + 6, width: 1.2, height: TOP_VENT_HEIGHT - 12, fill: '#333338', rx: 0.4 })
        ),

        // 品牌标牌
        h('rect', { x: cabinetLeft + CABINET_BODY_WIDTH / 2 - 70, y: TOP_HEADER_HEIGHT + TOP_VENT_HEIGHT / 2 - 7, width: 140, height: 14, fill: '#0d0d0f', stroke: '#3a3d42', 'stroke-width': 0.6, rx: 1.5 }),
        h('line', { x1: cabinetLeft + CABINET_BODY_WIDTH / 2 - 68, y1: TOP_HEADER_HEIGHT + TOP_VENT_HEIGHT / 2 - 5, x2: cabinetLeft + CABINET_BODY_WIDTH / 2 + 68, y2: TOP_HEADER_HEIGHT + TOP_VENT_HEIGHT / 2 - 5, stroke: '#2a2a2a', 'stroke-width': 0.3 }),
        h('text', { x: cabinetLeft + CABINET_BODY_WIDTH / 2, y: TOP_HEADER_HEIGHT + TOP_VENT_HEIGHT / 2 + 3, 'font-size': 7, 'font-weight': 'bold', fill: '#9A9DA3', 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif' }, 'RACK · 标准机柜'),

        // 顶盖左侧：机柜名称（白字，位于左侧通风栅格与标牌之间）
        h('text', { x: cabinetLeft + 52, y: TOP_HEADER_HEIGHT + TOP_VENT_HEIGHT / 2 + 3, 'font-size': 8.5, 'font-weight': 'bold', fill: '#FFFFFF', 'text-anchor': 'start', 'font-family': 'Arial, sans-serif' }, headerName),
        // 顶盖右侧：占用/剩余 U 数（1U=3 个方孔位，不足 3 个方孔位也算占用 1U）
        h('text', { x: cabinetRight - 52, y: TOP_HEADER_HEIGHT + TOP_VENT_HEIGHT / 2 + 3, 'font-size': 8.5, fill: '#FFFFFF', 'text-anchor': 'end', 'font-family': 'Arial, sans-serif' }, `占用 ${usedU}U / 剩余 ${totalU - usedU}U`),

        // 四角螺丝孔
        h('circle', { cx: cabinetLeft + 6, cy: TOP_HEADER_HEIGHT + 4, r: 1.5, fill: '#1a1a1a', stroke: '#3a3a3a', 'stroke-width': 0.4 }),
        h('circle', { cx: cabinetRight - 6, cy: TOP_HEADER_HEIGHT + 4, r: 1.5, fill: '#1a1a1a', stroke: '#3a3a3a', 'stroke-width': 0.4 }),
        h('circle', { cx: cabinetLeft + 6, cy: TOP_HEADER_HEIGHT + TOP_VENT_HEIGHT - 4, r: 1.5, fill: '#1a1a1a', stroke: '#3a3a3a', 'stroke-width': 0.4 }),
        h('circle', { cx: cabinetRight - 6, cy: TOP_HEADER_HEIGHT + TOP_VENT_HEIGHT - 4, r: 1.5, fill: '#1a1a1a', stroke: '#3a3a3a', 'stroke-width': 0.4 }),

        // 顶部预留方格（深灰、与机柜同宽 + 水平虚线）
        h('rect', { x: cabinetLeft, y: cabinetTop, width: CABINET_BODY_WIDTH, height: TOP_MARGIN_HEIGHT, fill: '#2B2B2B', stroke: '#0a0a0a', 'stroke-width': 1 }),
        h('line', { x1: cabinetLeft + 1, y1: cabinetTop + 1, x2: cabinetRight - 1, y2: cabinetTop + 1, stroke: '#3a3d42', 'stroke-width': 0.8 }),
        h('line', { x1: cabinetLeft + SIDE_FRAME_WIDTH + RAIL_WIDTH, y1: cabinetTop + TOP_MARGIN_HEIGHT / 2, x2: cabinetRight - SIDE_FRAME_WIDTH - RAIL_WIDTH, y2: cabinetTop + TOP_MARGIN_HEIGHT / 2, stroke: '#171717', 'stroke-width': 1, 'stroke-dasharray': '5,4' }),
        h('line', { x1: cabinetLeft + 1, y1: cabinetTop + TOP_MARGIN_HEIGHT - 1, x2: cabinetRight - 1, y2: cabinetTop + TOP_MARGIN_HEIGHT - 1, stroke: '#141414', 'stroke-width': 0.5 }),
        h('circle', { cx: cabinetLeft + 8, cy: cabinetTop + 8, r: 1.5, fill: '#3a3a3a', stroke: '#1a1a1a', 'stroke-width': 0.3 }),
        h('circle', { cx: cabinetLeft + 8, cy: cabinetTop + TOP_MARGIN_HEIGHT - 8, r: 1.5, fill: '#3a3a3a', stroke: '#1a1a1a', 'stroke-width': 0.3 }),
        h('circle', { cx: cabinetRight - 8, cy: cabinetTop + 8, r: 1.5, fill: '#3a3a3a', stroke: '#1a1a1a', 'stroke-width': 0.3 }),
        h('circle', { cx: cabinetRight - 8, cy: cabinetTop + TOP_MARGIN_HEIGHT - 8, r: 1.5, fill: '#3a3a3a', stroke: '#1a1a1a', 'stroke-width': 0.3 }),

        // 左侧金属立柱
        h('rect', { x: cabinetLeft, y: cabinetTop, width: SIDE_FRAME_WIDTH, height: bodyH, fill: 'url(#cabinetFrame)', stroke: '#0a0a0a', 'stroke-width': 0.5 }),
        h('line', { x1: cabinetLeft + 1.5, y1: cabinetTop + 2, x2: cabinetLeft + 1.5, y2: cabinetBottom - 2, stroke: '#1a1a1a', 'stroke-width': 0.5 }),
        h('line', { x1: cabinetLeft + SIDE_FRAME_WIDTH - 3, y1: cabinetTop + 2, x2: cabinetLeft + SIDE_FRAME_WIDTH - 3, y2: cabinetBottom - 2, stroke: '#2a2a2a', 'stroke-width': 0.5 }),
        h('line', { x1: cabinetLeft + SIDE_FRAME_WIDTH - 1, y1: cabinetTop, x2: cabinetLeft + SIDE_FRAME_WIDTH - 1, y2: cabinetBottom, stroke: '#5a5a5a', 'stroke-width': 0.6 }),
        // 左侧金属立柱装饰螺丝孔 - 根据机柜高度动态计算数量和间距
        ...(() => {
          const frameInnerH = bodyH - TOP_MARGIN_HEIGHT - BOTTOM_MARGIN_HEIGHT - 40
          const holeCount = Math.max(4, Math.floor(frameInnerH / 120))
          const holeSpacing = frameInnerH / (holeCount + 1)
          return Array.from({ length: holeCount }).flatMap((_, i) => [
            h('circle', { key: `ls-${i}`, cx: cabinetLeft + SIDE_FRAME_WIDTH / 2, cy: cabinetTop + TOP_MARGIN_HEIGHT + 20 + (i + 1) * holeSpacing, r: 1.8, fill: '#1a1a1a', stroke: '#3a3a3a', 'stroke-width': 0.3 }),
            h('line', { key: `ls-l-${i}`, x1: cabinetLeft + SIDE_FRAME_WIDTH / 2 - 1.2, y1: cabinetTop + TOP_MARGIN_HEIGHT + 20 + (i + 1) * holeSpacing, x2: cabinetLeft + SIDE_FRAME_WIDTH / 2 + 1.2, y2: cabinetTop + TOP_MARGIN_HEIGHT + 20 + (i + 1) * holeSpacing, stroke: '#3a3a3a', 'stroke-width': 0.3 }),
          ])
        })(),

        // 右侧金属立柱
        h('rect', { x: cabinetRight - SIDE_FRAME_WIDTH, y: cabinetTop, width: SIDE_FRAME_WIDTH, height: bodyH, fill: 'url(#cabinetFrame)', stroke: '#0a0a0a', 'stroke-width': 0.5 }),
        h('line', { x1: cabinetRight - 1.5, y1: cabinetTop + 2, x2: cabinetRight - 1.5, y2: cabinetBottom - 2, stroke: '#1a1a1a', 'stroke-width': 0.5 }),
        h('line', { x1: cabinetRight - SIDE_FRAME_WIDTH + 3, y1: cabinetTop + 2, x2: cabinetRight - SIDE_FRAME_WIDTH + 3, y2: cabinetBottom - 2, stroke: '#2a2a2a', 'stroke-width': 0.5 }),
        h('line', { x1: cabinetRight - SIDE_FRAME_WIDTH + 1, y1: cabinetTop, x2: cabinetRight - SIDE_FRAME_WIDTH + 1, y2: cabinetBottom, stroke: '#5a5a5a', 'stroke-width': 0.6 }),
        // 右侧金属立柱装饰螺丝孔 - 根据机柜高度动态计算数量和间距
        ...(() => {
          const frameInnerH = bodyH - TOP_MARGIN_HEIGHT - BOTTOM_MARGIN_HEIGHT - 40
          const holeCount = Math.max(4, Math.floor(frameInnerH / 120))
          const holeSpacing = frameInnerH / (holeCount + 1)
          return Array.from({ length: holeCount }).flatMap((_, i) => [
            h('circle', { key: `rs-${i}`, cx: cabinetRight - SIDE_FRAME_WIDTH / 2, cy: cabinetTop + TOP_MARGIN_HEIGHT + 20 + (i + 1) * holeSpacing, r: 1.8, fill: '#1a1a1a', stroke: '#3a3a3a', 'stroke-width': 0.3 }),
            h('line', { key: `rs-l-${i}`, x1: cabinetRight - SIDE_FRAME_WIDTH / 2 - 1.2, y1: cabinetTop + TOP_MARGIN_HEIGHT + 20 + (i + 1) * holeSpacing, x2: cabinetRight - SIDE_FRAME_WIDTH / 2 + 1.2, y2: cabinetTop + TOP_MARGIN_HEIGHT + 20 + (i + 1) * holeSpacing, stroke: '#3a3a3a', 'stroke-width': 0.3 }),
          ])
        })(),

        // 背景
        h('rect', { x: cabinetLeft + SIDE_FRAME_WIDTH, y: cabinetTop + TOP_MARGIN_HEIGHT, width: CABINET_BODY_WIDTH - 2 * SIDE_FRAME_WIDTH, height: bodyH - TOP_MARGIN_HEIGHT - BOTTOM_MARGIN_HEIGHT, fill: '#0f0f0f', stroke: '#1a1a1a', 'stroke-width': 0.5 }),
        h('rect', { x: cabinetLeft + SIDE_FRAME_WIDTH + RAIL_WIDTH, y: cabinetTop + TOP_MARGIN_HEIGHT, width: CABINET_BODY_WIDTH - 2 * (SIDE_FRAME_WIDTH + RAIL_WIDTH), height: bodyH - TOP_MARGIN_HEIGHT - BOTTOM_MARGIN_HEIGHT, fill: 'url(#cabinetInnerGrad)', stroke: '#ccc', 'stroke-width': 0.5 }),

        // 方孔条（银白色：含数字带与方孔带）
        h('rect', { x: leftRailX, y: railY, width: RAIL_WIDTH, height: railHeight, fill: 'url(#railMetal)', stroke: '#9a9b9d', 'stroke-width': 0.8 }),
        h('rect', { x: rightRailX, y: railY, width: RAIL_WIDTH, height: railHeight, fill: 'url(#railMetal)', stroke: '#9a9b9d', 'stroke-width': 0.8 }),

        // 方孔条上的安装孔 - 标准机柜：所有方孔间距均匀一致
        // 1U=36px，3个孔均匀分布，孔间距 = 36/3 = 12px
        ...Array.from({ length: totalU }).flatMap((_, i) => {
          const yBase = cabinetTop + TOP_MARGIN_HEIGHT + i * U_HEIGHT
          // 方孔贴安装区一侧（左条靠右缘、右条靠左缘），与参考图一致
          // 注意：与 U 编号底板保持 1px 内缩，避免底板（宽 11、居外缘）盖住方孔
          const leftHoleX = leftRailX + RAIL_WIDTH - HOLE_SIZE - 1
          const rightHoleX = rightRailX + 1
          // 3个方孔均匀分布在U内，间距12px，上下对称
          // 距U顶: 6, 18, 30 (距U底: 6, 18, 30)
          const holeOffsets = [6, 18, 30]
          return holeOffsets.flatMap((off, idx) => {
            const y = yBase + off - HOLE_SIZE / 2
            return [
              h('rect', { key: `lh-${i}-${idx}`, x: leftHoleX, y, width: HOLE_SIZE, height: HOLE_SIZE, fill: 'url(#squareHole)', stroke: '#1a1a1a', 'stroke-width': 0.3, rx: 0.5 }),
              h('rect', { key: `rh-${i}-${idx}`, x: rightHoleX, y, width: HOLE_SIZE, height: HOLE_SIZE, fill: 'url(#squareHole)', stroke: '#1a1a1a', 'stroke-width': 0.3, rx: 0.5 }),
            ]
          })
        }),

        // 方孔条螺丝孔
        ...Array.from({ length: totalU }).flatMap((_, i) => {
          const y = cabinetTop + TOP_MARGIN_HEIGHT + i * U_HEIGHT + U_HEIGHT / 2
          return [
            h('circle', { key: `sc-l-${i}`, cx: cabinetLeft + 3, cy: y, r: 1.2, fill: '#3a3a3a', stroke: '#1a1a1a', 'stroke-width': 0.2 }),
            h('circle', { key: `sc-r-${i}`, cx: cabinetRight - 3, cy: y, r: 1.2, fill: '#3a3a3a', stroke: '#1a1a1a', 'stroke-width': 0.2 }),
          ]
        }),

        // U边界分隔线（银白方孔条上的黑色刻度线：横跨全带、与两端黑竖线相连）+ 安装区浅灰线
        ...Array.from({ length: totalU + 1 }).flatMap((_, i) => {
          const lineY = cabinetTop + TOP_MARGIN_HEIGHT + i * U_HEIGHT
          const uNumber = totalU - i
          const els = [
            h('line', { key: `bd-l-${i}`, x1: leftRailX, y1: lineY, x2: leftRailX + RAIL_WIDTH, y2: lineY, stroke: '#1a1a1a', 'stroke-width': 1.4 }),
            h('line', { key: `bd-r-${i}`, x1: rightRailX, y1: lineY, x2: rightRailX + RAIL_WIDTH, y2: lineY, stroke: '#1a1a1a', 'stroke-width': 1.4 }),
            h('line', { key: `bd-c-${i}`, x1: cabinetLeft + SIDE_FRAME_WIDTH + RAIL_WIDTH, y1: lineY, x2: cabinetRight - SIDE_FRAME_WIDTH - RAIL_WIDTH, y2: lineY, stroke: '#E2E2E2', 'stroke-width': 0.8 }),
          ]
          if (i < totalU) {
            const ny = lineY + U_HEIGHT / 2
            els.push(
              // 左侧 U 编号：深色数字直接置于银白导轨外缘（无底板），与内侧方孔互不遮挡
              h('text', { key: `ul-${i}`, x: leftRailX + 2, y: ny + 3.4, 'font-size': 9, fill: '#15171b', 'text-anchor': 'start', 'font-family': 'Arial, sans-serif' }, String(uNumber).padStart(2, '0')),
              // 右侧 U 编号：同规格镜像
              h('text', { key: `ur-${i}`, x: rightRailX + RAIL_WIDTH - 2, y: ny + 3.4, 'font-size': 9, fill: '#15171b', 'text-anchor': 'end', 'font-family': 'Arial, sans-serif' }, String(uNumber).padStart(2, '0')),
            )
          }
          return els
        }),

        // 底部预留方格窄条（深灰、与机柜同宽 + 左右端圆形凹点）
        h('rect', { x: cabinetLeft, y: cabinetBottom - BOTTOM_MARGIN_HEIGHT, width: CABINET_BODY_WIDTH, height: BOTTOM_MARGIN_HEIGHT, fill: '#343437', stroke: '#0a0a0a', 'stroke-width': 0.8 }),
        h('circle', { cx: cabinetLeft + 16, cy: cabinetBottom - BOTTOM_MARGIN_HEIGHT / 2, r: 2, fill: '#1a1a1a' }),
        h('circle', { cx: cabinetLeft + 30, cy: cabinetBottom - BOTTOM_MARGIN_HEIGHT / 2, r: 2, fill: '#1a1a1a' }),
        h('circle', { cx: cabinetRight - 30, cy: cabinetBottom - BOTTOM_MARGIN_HEIGHT / 2, r: 2, fill: '#1a1a1a' }),
        h('circle', { cx: cabinetRight - 16, cy: cabinetBottom - BOTTOM_MARGIN_HEIGHT / 2, r: 2, fill: '#1a1a1a' }),

        // 底部窄边（深灰、与机柜同宽）
        h('rect', { x: cabinetLeft, y: cabinetBottom + BOTTOM_FOOTER_HEIGHT, width: CABINET_BODY_WIDTH, height: 16, fill: '#343437' }),

        // 左侧支撑脚
        h('rect', { x: cabinetLeft - 3, y: cabinetBottom + BOTTOM_FOOTER_HEIGHT + FEET_HEIGHT - 6, width: 36, height: 6, fill: 'url(#cabinetBeam)', stroke: '#0a0a0a', 'stroke-width': 1 }),
        h('line', { x1: cabinetLeft - 1, y1: cabinetBottom + BOTTOM_FOOTER_HEIGHT + FEET_HEIGHT - 5, x2: cabinetLeft + 31, y2: cabinetBottom + BOTTOM_FOOTER_HEIGHT + FEET_HEIGHT - 5, stroke: '#5a5a5a', 'stroke-width': 0.6 }),
        h('polygon', { points: `${cabinetLeft + 1},${cabinetBottom + BOTTOM_FOOTER_HEIGHT + 5} ${cabinetLeft + 23},${cabinetBottom + BOTTOM_FOOTER_HEIGHT + 5} ${cabinetLeft + 22},${cabinetBottom + BOTTOM_FOOTER_HEIGHT + 15} ${cabinetLeft + 2},${cabinetBottom + BOTTOM_FOOTER_HEIGHT + 15}`, fill: 'url(#cabinetBeam)', stroke: '#0a0a0a', 'stroke-width': 1 }),
        h('polygon', { points: `${cabinetLeft + 2},${cabinetBottom + BOTTOM_FOOTER_HEIGHT + 15} ${cabinetLeft + 22},${cabinetBottom + BOTTOM_FOOTER_HEIGHT + 15} ${cabinetLeft + 19},${cabinetBottom + BOTTOM_FOOTER_HEIGHT + 24} ${cabinetLeft + 5},${cabinetBottom + BOTTOM_FOOTER_HEIGHT + 24}`, fill: 'url(#cabinetBeam)', stroke: '#0a0a0a', 'stroke-width': 1 }),
        h('polygon', { points: `${cabinetLeft + 5},${cabinetBottom + BOTTOM_FOOTER_HEIGHT + 24} ${cabinetLeft + 19},${cabinetBottom + BOTTOM_FOOTER_HEIGHT + 24} ${cabinetLeft + 24},${cabinetBottom + BOTTOM_FOOTER_HEIGHT + FEET_HEIGHT - 6} ${cabinetLeft - 1},${cabinetBottom + BOTTOM_FOOTER_HEIGHT + FEET_HEIGHT - 6}`, fill: 'url(#cabinetBeam)', stroke: '#0a0a0a', 'stroke-width': 1 }),
        h('line', { x1: cabinetLeft + 4, y1: cabinetBottom + BOTTOM_FOOTER_HEIGHT + 7, x2: cabinetLeft + 4, y2: cabinetBottom + BOTTOM_FOOTER_HEIGHT + 14, stroke: '#5a5a5a', 'stroke-width': 0.5 }),
        h('line', { x1: cabinetLeft + 20, y1: cabinetBottom + BOTTOM_FOOTER_HEIGHT + 7, x2: cabinetLeft + 20, y2: cabinetBottom + BOTTOM_FOOTER_HEIGHT + 14, stroke: '#1a1a1a', 'stroke-width': 0.5 }),

        // 右侧支撑脚
        h('rect', { x: cabinetRight - 33, y: cabinetBottom + BOTTOM_FOOTER_HEIGHT + FEET_HEIGHT - 6, width: 36, height: 6, fill: 'url(#cabinetBeam)', stroke: '#0a0a0a', 'stroke-width': 1 }),
        h('line', { x1: cabinetRight - 31, y1: cabinetBottom + BOTTOM_FOOTER_HEIGHT + FEET_HEIGHT - 5, x2: cabinetRight + 1, y2: cabinetBottom + BOTTOM_FOOTER_HEIGHT + FEET_HEIGHT - 5, stroke: '#5a5a5a', 'stroke-width': 0.6 }),
        h('polygon', { points: `${cabinetRight - 23},${cabinetBottom + BOTTOM_FOOTER_HEIGHT + 5} ${cabinetRight - 1},${cabinetBottom + BOTTOM_FOOTER_HEIGHT + 5} ${cabinetRight - 2},${cabinetBottom + BOTTOM_FOOTER_HEIGHT + 15} ${cabinetRight - 22},${cabinetBottom + BOTTOM_FOOTER_HEIGHT + 15}`, fill: 'url(#cabinetBeam)', stroke: '#0a0a0a', 'stroke-width': 1 }),
        h('polygon', { points: `${cabinetRight - 22},${cabinetBottom + BOTTOM_FOOTER_HEIGHT + 15} ${cabinetRight - 2},${cabinetBottom + BOTTOM_FOOTER_HEIGHT + 15} ${cabinetRight - 5},${cabinetBottom + BOTTOM_FOOTER_HEIGHT + 24} ${cabinetRight - 19},${cabinetBottom + BOTTOM_FOOTER_HEIGHT + 24}`, fill: 'url(#cabinetBeam)', stroke: '#0a0a0a', 'stroke-width': 1 }),
        h('polygon', { points: `${cabinetRight - 19},${cabinetBottom + BOTTOM_FOOTER_HEIGHT + 24} ${cabinetRight - 5},${cabinetBottom + BOTTOM_FOOTER_HEIGHT + 24} ${cabinetRight + 1},${cabinetBottom + BOTTOM_FOOTER_HEIGHT + FEET_HEIGHT - 6} ${cabinetRight - 25},${cabinetBottom + BOTTOM_FOOTER_HEIGHT + FEET_HEIGHT - 6}`, fill: 'url(#cabinetBeam)', stroke: '#0a0a0a', 'stroke-width': 1 }),
        h('line', { x1: cabinetRight - 4, y1: cabinetBottom + BOTTOM_FOOTER_HEIGHT + 7, x2: cabinetRight - 4, y2: cabinetBottom + BOTTOM_FOOTER_HEIGHT + 14, stroke: '#1a1a1a', 'stroke-width': 0.5 }),
        h('line', { x1: cabinetRight - 20, y1: cabinetBottom + BOTTOM_FOOTER_HEIGHT + 7, x2: cabinetRight - 20, y2: cabinetBottom + BOTTOM_FOOTER_HEIGHT + 14, stroke: '#5a5a5a', 'stroke-width': 0.5 }),

        // 底部阴影线
        h('line', { x1: cabinetLeft - 8, y1: cabinetBottom + BOTTOM_FOOTER_HEIGHT + FEET_HEIGHT, x2: cabinetRight + 8, y2: cabinetBottom + BOTTOM_FOOTER_HEIGHT + FEET_HEIGHT, stroke: '#000', 'stroke-width': 2, opacity: 0.7 }),
        h('line', { x1: cabinetLeft - 10, y1: cabinetBottom + BOTTOM_FOOTER_HEIGHT + FEET_HEIGHT + 1, x2: cabinetRight + 10, y2: cabinetBottom + BOTTOM_FOOTER_HEIGHT + FEET_HEIGHT + 1, stroke: '#000', 'stroke-width': 1, opacity: 0.35 }),
      ]
    }
  }
})

</script>

<style scoped>
.cabinet-rack-visual {
  display: flex;
  flex-direction: column;
  width: 100%;
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: 8px;
  box-sizing: border-box;
}

.cabinet-viewport {
  position: relative;
  overflow: hidden;
  flex: 1;
  min-height: 500px;
  max-height: 80vh;
  background: var(--bg-base);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: grab;
  user-select: none;
}

.cabinet-viewport:active {
  cursor: grabbing;
}

.cabinet-content {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}

.cabinet-content svg {
  display: block;
}

.zoom-controls {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: rgba(20, 20, 24, 0.85);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.zoom-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-glass);
  border: 1px solid var(--border-light);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
  padding: 0;
  line-height: 1;
}

.zoom-btn:hover {
  background: var(--accent-subtle);
  border-color: var(--accent);
  color: #fff;
}

.zoom-btn:active {
  transform: scale(0.95);
}

.zoom-level {
  min-width: 48px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.fit-btn {
  font-size: 16px;
}

.zoom-divider {
  width: 1px;
  height: 18px;
  background: var(--border-light);
  margin: 0 2px;
}

.fs-btn {
  font-size: 16px;
}

.fs-btn.active {
  background: var(--warning, #ff9800);
  border-color: var(--warning, #ff9800);
  color: #fff;
}

/* RJ45端口LED闪烁动画 - 模拟真实网络设备数据传输 */
:deep(.rj45-led-green),
:deep(.rj45-led-orange) {
  animation: rj45-led-blink 1.4s infinite ease-in-out;
}

:deep(.rj45-led-glow-green),
:deep(.rj45-led-glow-orange) {
  animation: rj45-glow-blink 1.4s infinite ease-in-out;
}

@keyframes rj45-led-blink {
  0%   { opacity: 1; }
  35%  { opacity: 1; }
  50%  { opacity: 0.35; }
  65%  { opacity: 1; }
  100% { opacity: 1; }
}

@keyframes rj45-glow-blink {
  0%   { opacity: 0.2; }
  35%  { opacity: 0.2; }
  50%  { opacity: 0.05; }
  65%  { opacity: 0.2; }
  100% { opacity: 0.2; }
}

/* SFP端口LED闪烁 */
:deep(.sfp-led-active) {
  animation: sfp-led-blink 1.8s infinite ease-in-out;
}

@keyframes sfp-led-blink {
  0%   { opacity: 1; }
  40%  { opacity: 1; }
  55%  { opacity: 0.4; }
  70%  { opacity: 1; }
  100% { opacity: 1; }
}

/* 关闭状态 - 暗色无动画 */
:deep(.rj45-led-off) {
  fill: var(--bg-elevated);
}
</style>
