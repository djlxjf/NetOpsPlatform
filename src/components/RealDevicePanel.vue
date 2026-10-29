<template>
  <div class="real-device-panel">
    <!-- 工具栏 -->
    <div class="real-panel-toolbar">
      <span class="toolbar-title">真实面板视图</span>
      <!-- 视图切换：3D 模型（默认）/ 2D 面板 -->
      <el-radio-group v-model="view3d" size="small" class="view-mode-toggle">
        <el-radio-button :label="true">3D 模型</el-radio-button>
        <el-radio-button :label="false">2D 面板</el-radio-button>
      </el-radio-group>
      <span v-if="!view3d" class="toolbar-info">缩放: {{ Math.round(scale * 100) }}%</span>
      <span v-else class="toolbar-info">3D 模型视图</span>
      <el-button size="small" :disabled="view3d" @click="resetView">重置视图</el-button>
      <el-button size="small" type="primary" @click="showUploadDialog = true">上传自定义面板</el-button>
    </div>

    <!-- 3D 模型视口（端口点击事件与 2D 面板一致） -->
    <div v-if="view3d" class="real-panel-3d-stage">
      <DevicePanel3D
        v-if="device"
        :device="device"
        @port-click="(p) => emit('port-click', p)"
      />
    </div>

    <!-- 面板视口（2D） -->
    <div 
      v-else
      class="real-panel-viewport" 
      ref="viewportRef"
      @wheel="handleWheel"
      @mousedown="startDrag"
      @mousemove="doDrag"
      @mouseup="stopDrag"
      @mouseleave="stopDrag"
    >
      <div 
        class="real-panel-canvas" 
        :style="{
          width: panelData.panelWidth + 'px',
          height: panelData.panelHeight + 'px',
          transform: `scale(${scale}) translate(${offsetX}px, ${offsetY}px)`
        }"
      >
        <!-- 面板底图（仅显示前面板） -->
        <template v-if="panelData.panelImage">
          <img
            ref="panelBgRef"
            class="panel-bg-image"
            :src="panelData.panelImage"
            :alt="panelData.model"
            draggable="false"
            @load="detectPanelPorts"
          />
          <!-- 端口热点层：按型号端口配置叠加在图片上，点击网口/光口直接连线；已连接端口绿色闪烁 -->
          <div
            v-for="spot in portHotspots"
            :key="spot.portId"
            class="port-hotspot"
            :class="{ connected: spot.connected }"
            :style="{ left: spot.x + 'px', top: spot.y + 'px', width: spot.w + 'px', height: spot.h + 'px' }"
            :title="spot.tooltip"
            @click.stop="onHotspotClick(spot)"
          ></div>
        </template>
        <!-- 厂商Logo -->
        <img
          v-if="panelData.logo?.src"
          :src="panelData.logo.src"
          :style="{
            position: 'absolute',
            left: panelData.logo.x + 'px',
            top: panelData.logo.y + 'px',
            width: panelData.logo.width + 'px',
            height: panelData.logo.height + 'px',
            objectFit: 'contain'
          }"
          :alt="device?.vendor"
        />
        <!-- 型号标签 -->
        <div 
          v-if="panelData.modelLabel" 
          :style="{
            position: 'absolute',
            left: panelData.modelLabel.x + 'px',
            top: panelData.modelLabel.y + 'px',
            fontSize: '14px',
            fontWeight: 'bold',
            color: 'var(--text-primary)'
          }"
        >{{ panelData.modelLabel.text }}</div>
        <!-- 端口 -->
        <div 
          v-for="port in panelData.ports" 
          :key="port.id"
          class="real-panel-port"
          :class="{ connected: getPortConnectedStatus(port.id), 'has-data': getPortHasData(port.id) }"
          :style="{
            position: 'absolute',
            left: port.x + 'px',
            top: port.y + 'px'
          }"
          @click="onPortClick(port)"
          :title="getPortTooltip(port)"
        >
          <!-- RJ45端口 -->
          <div v-if="port.type === 'rj45'" class="real-rj45">
            <div class="real-rj45-body">
              <div class="real-rj45-top"></div>
              <div class="real-rj45-pins">
                <div class="real-pin" v-for="n in 8" :key="n"></div>
              </div>
              <div 
                class="real-rj45-led" 
                :class="getPortConnectedStatus(port.id) ? (getPortHasData(port.id) ? 'blinking' : 'on') : 'off'"
              ></div>
            </div>
            <div class="real-port-label">{{ port.label }}</div>
          </div>
          <!-- SFP端口 -->
          <div v-else-if="port.type === 'sfp'" class="real-sfp">
            <div class="real-sfp-body">
              <div class="real-sfp-notch"></div>
              <div class="real-sfp-latch"></div>
              <div 
                class="real-sfp-led" 
                :class="getPortConnectedStatus(port.id) ? (getPortHasData(port.id) ? 'blinking' : 'on') : 'off'"
              ></div>
            </div>
            <div class="real-port-label">{{ port.label }}</div>
          </div>
          <!-- XFP端口 -->
          <div v-else-if="port.type === 'xfp'" class="real-xfp">
            <div class="real-xfp-body">
              <div class="real-xfp-notch"></div>
              <div 
                class="real-xfp-led" 
                :class="getPortConnectedStatus(port.id) ? (getPortHasData(port.id) ? 'blinking' : 'on') : 'off'"
              ></div>
            </div>
            <div class="real-port-label">{{ port.label }}</div>
          </div>
        </div>
        <!-- LED指示灯 -->
        <div 
          v-for="led in panelData.leds" 
          :key="led.id"
          class="real-panel-led"
          :class="[getLedStatus(led), led.color]"
          :style="{
            position: 'absolute',
            left: led.x + 'px',
            top: led.y + 'px'
          }"
          :title="led.label"
        ></div>
      </div>
    </div>

    <!-- 端口统计 -->
    <div class="port-stats-bar">
      <div class="stat">
        <span class="stat-dot total"></span>
        <span class="stat-label">总端口</span>
        <span class="stat-value">{{ panelData.ports?.length || 0 }}</span>
      </div>
      <div class="stat">
        <span class="stat-dot connected"></span>
        <span class="stat-label">已连接</span>
        <span class="stat-value connected">{{ connectedCount }}</span>
      </div>
      <div class="stat">
        <span class="stat-dot free"></span>
        <span class="stat-label">空闲</span>
        <span class="stat-value free">{{ freeCount }}</span>
      </div>
      <div class="stat">
        <span class="stat-dot active"></span>
        <span class="stat-label">活跃</span>
        <span class="stat-value active">{{ activeCount }}</span>
      </div>
    </div>

    <!-- 自定义面板上传对话框 -->
    <el-dialog v-model="showUploadDialog" title="上传自定义面板" width="600px">
      <el-form label-width="100px" size="default">
        <el-form-item label="面板数据(JSON)">
          <el-input 
            v-model="customPanelJson" 
            type="textarea" 
            :rows="10" 
            placeholder="粘贴面板数据 JSON..."
          />
        </el-form-item>
        <el-form-item label="说明">
          <div class="upload-hint">
            <p>JSON 格式示例：</p>
            <pre>{{ hintJson }}</pre>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showUploadDialog = false">取消</el-button>
        <el-button type="primary" @click="saveCustomPanel">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { usePortStateStore } from '../stores/portState'
import { useDeviceStore, useCabinetStore } from '../stores'
import { resolveRemotePortName, findPatchItemById } from '../utils/portNaming.js'
import { getDevicePortConfig } from '../composables/useRackTransform'
import { ElMessage } from 'element-plus'
import devicePanelData from '../data/devicePanelData.js'
import DevicePanel3D from './cabinet/DevicePanel3D.vue'
import { computePanelPorts, computePortStates } from './cabinet/device3d/portLayout.js'

const props = defineProps({
  device: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['port-click'])

// Store
const portStateStore = usePortStateStore()
const rdpCabinetStore = useCabinetStore()

// 视图模式：true = 3D 模型（默认），false = 2D 面板
const view3d = ref(true)

// 3D 模式端口列表与状态（与 2D 面板同源：computePanelPorts + portStateStore）
const ports3d = computed(() => (view3d.value && props.device ? computePanelPorts(props.device).ports : []))
const states3d = computed(() => (
  ports3d.value.length ? computePortStates(props.device, ports3d.value, portStateStore) : new Map()
))

// 本地状态
const scale = ref(1.0)
const offsetX = ref(0)
const offsetY = ref(0)
const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartY = ref(0)
const showUploadDialog = ref(false)
const customPanelJson = ref('')
const viewportRef = ref(null)

// nVisual 导入面板：正面/背面切换
const showBack = ref(false)

// 面板底图 DOM 引用：热点基于图片实际渲染尺寸定位（不受 canvas 边框影响）
const panelBgRef = ref(null)
// 运行时端口检测结果缓存：{ src, rows:[{cy, rowH, ports:[{cx, w}]}] }
const detectedPorts = ref(null)

// ===== 运行时图像端口检测 =====
// 真实面板图片端口布局各不相同（口数、行列、SFP 位置差异大），
// 固定布局常量无法通用。因此加载图片后从像素自动识别网口/光口行列，
// 生成的端口热点精确贴合图片实际端口位置。
function detectPanelPorts() {
  const img = panelBgRef.value
  if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) return
  const W = img.naturalWidth
  const H = img.naturalHeight
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  ctx.drawImage(img, 0, 0, W, H)
  let data
  try {
    data = ctx.getImageData(0, 0, W, H).data
  } catch (e) {
    return
  }
  const n = W * H
  const dark = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const o = i * 4
    dark[i] = (0.3 * data[o] + 0.59 * data[o + 1] + 0.11 * data[o + 2]) < 100 ? 1 : 0
  }
  // 行剖面 → 端口行带
  const rowRatio = new Float32Array(H)
  for (let y = 0; y < H; y++) {
    let s = 0
    for (let x = 0; x < W; x++) s += dark[y * W + x]
    rowRatio[y] = s / W
  }
  const rows = []
  const minW = 0.012 * W // 口最小宽（过滤丝印文字）
  const maxW = 0.06 * W   // 口最大宽
  let yStart = -1
  for (let y = 0; y <= H; y++) {
    const v = y < H ? rowRatio[y] : 0
    if (v > 0.2 && yStart < 0) yStart = y
    else if (v <= 0.2 && yStart >= 0) {
      const y0 = yStart, y1 = y
      yStart = -1
      if (y1 - y0 < 0.04 * H) continue // 过滤顶部/底部装饰细边
      // 带内整体暗占比：纯黑装饰/边缘带（顶部/底部标签）跳过
      let bandDark = 0
      for (let yy = y0; yy < y1; yy++) bandDark += rowRatio[yy]
      bandDark /= (y1 - y0)
      if (bandDark > 0.8) continue
      // 行带内列方向找端口
      const ports = []
      let xStart = -1
      for (let x = 0; x <= W; x++) {
        let colV = 0
        if (x < W) {
          let s = 0
          for (let yy = y0; yy < y1; yy++) s += dark[yy * W + x]
          colV = s / (y1 - y0)
        } else {
          colV = 0
        }
        if (colV > 0.3 && xStart < 0) xStart = x
        else if (colV <= 0.3 && xStart >= 0) {
          const w = x - xStart
          const cx = (xStart + x) / 2 / W
          // 过滤贴近左右边缘的挂耳/装饰误检段
          if (w >= minW && w <= maxW && cx > 0.03 && cx < 0.97) ports.push([xStart, x])
          xStart = -1
        }
      }
      if (ports.length) {
        rows.push({
          cy: (y0 + y1) / 2 / H,
          rowH: (y1 - y0) / H,
          ports: ports.map(([a, b]) => ({ cx: (a + b) / 2 / W, w: (b - a) / W }))
        })
      }
    }
  }
  detectedPorts.value = { src: img.currentSrc || img.src, rows }
}

// 提示JSON
const hintJson = computed(() => JSON.stringify({
  vendor: '华为',
  model: 'S5735-L24T4X-A',
  panelWidth: 480,
  panelHeight: 300,
  logo: { x: 16, y: 16, width: 72, height: 24, src: './vendor-logos/huawei.png' },
  modelLabel: { x: 100, y: 20, text: 'S5735-L24T4X-A' },
  ports: [
    { id: 'GE0/0/1', type: 'rj45', x: 60, y: 80, label: '1' },
    { id: 'SFP0/0/1', type: 'sfp', x: 560, y: 80, label: 'SFP1' }
  ],
  leds: [
    { id: 'sys', x: 16, y: 240, label: 'SYS', color: 'green' }
  ]
}, null, 2))

// 验证面板数据结构的函数
function validatePanelData(data) {
  if (!data || typeof data !== 'object') return false
  if (typeof data.panelWidth !== 'number' || typeof data.panelHeight !== 'number') return false
  if (data.logo && typeof data.logo !== 'object') return false
  if (data.modelLabel && typeof data.modelLabel !== 'object') return false
  if (!Array.isArray(data.ports)) return false
  // 验证每个端口的数据结构
  for (const port of data.ports) {
    if (!port || typeof port !== 'object') return false
    if (typeof port.id !== 'string' || typeof port.type !== 'string') return false
    if (typeof port.x !== 'number' || typeof port.y !== 'number') return false
  }
  // 验证 LED 数据结构（可选）
  if (data.leds && !Array.isArray(data.leds)) return false
  return true
}

// 面板数据
const panelData = computed(() => {
  if (!props.device) return null
  const vendor = props.device.vendor || ''
  const model = props.device.model || ''
  if (!vendor || !model) return null
  
  // 1. 先查自定义面板数据
  const customKey = `customPanel_${vendor}_${model}`
  const customData = localStorage.getItem(customKey)
  if (customData) {
    try {
      const parsed = JSON.parse(customData)
      // 验证 JSON 结构和内容
      if (validatePanelData(parsed)) {
        return parsed
      } else {
        console.warn('自定义面板数据结构无效，已忽略')
      }
    } catch {
      // JSON 解析失败，忽略错误，继续查找
    }
  }
  
  // 2. 查找预置面板数据（先按 厂商-型号 组合键，再按纯型号键兜底）
  const key = `${vendor}-${model}`
  return devicePanelData[key] || devicePanelData[model] || null
})

// 是否显示兜底提示
const showFallback = computed(() => !panelData.value && !!props.device)

// 端口统计（图片面板基于热点，绘制面板基于 ports，3D 面板基于端口布局适配器）
const isImagePanel = computed(() => !view3d.value && !!panelData.value?.panelImage)
const connectedCount = computed(() => {
  if (!props.device) return 0
  if (view3d.value) {
    let n = 0
    states3d.value.forEach(v => { if (v) n++ })
    return n
  }
  if (isImagePanel.value) return portHotspots.value.filter(s => s.connected).length
  return panelData.value?.ports?.filter(p => getPortConnectedStatus(p.id)).length || 0
})

const freeCount = computed(() => {
  if (!props.device) return 0
  if (view3d.value) return ports3d.value.length - connectedCount.value
  if (isImagePanel.value) return portHotspots.value.filter(s => !s.connected).length
  return panelData.value?.ports?.filter(p => !getPortConnectedStatus(p.id)).length || 0
})

const activeCount = computed(() => {
  if (!props.device) return 0
  const online = props.device.status === 'online' || props.device.status === 'active'
  if (view3d.value) return online ? connectedCount.value : 0
  if (isImagePanel.value) return online ? connectedCount.value : 0
  return panelData.value?.ports?.filter(p => getPortHasData(p.id)).length || 0
})

// 方法：端口 ID 归一化（绘制数据 GE0/0/N、SFPN → store 规则 ethN、sfpN）
function normalizePortId(portId) {
  if (!portId) return portId
  return portStateStore.inferPortId(portId) || portId
}

// 方法：获取端口连接状态
function getPortConnectedStatus(portId) {
  if (!props.device || !portId) return false
  const deviceId = props.device.id
  return portStateStore.isPortOccupied(deviceId, normalizePortId(portId))
}

// 方法：获取端口是否有数据流通
function getPortHasData(portId) {
  if (!props.device || !portId) return false
  const isConnected = getPortConnectedStatus(portId)
  const isOnline = props.device.status === 'online' || props.device.status === 'active'
  return isConnected && isOnline
}

// 方法：获取LED状态
function getLedStatus(led) {
  if (!props.device) return 'off'
  if (led.id === 'sys' || led.id === 'sys') {
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

// 方法：获取端口提示
function getPortTooltip(port) {
  const isConnected = getPortConnectedStatus(port.id)
  if (!isConnected) {
    return `${port.label} - 可用`
  }
  
  // 查找对端设备
  const conn = portStateStore.getPortConnection(props.device.id, port.id)
  const remoteDeviceName = conn?.remoteDeviceName || '未知设备'
  const cable = conn?.cableType || '未指定'
  
  return `${port.label} - 已连接至: ${remoteDeviceName}, 线缆: ${cable}`
}

// 方法：端口点击（绘制数据端口：GE0/0/1 等，带精确坐标）
function onPortClick(port) {
  emit('port-click', {
    ...port,
    portType: port.portType || (port.type === 'sfp' || port.type === 'xfp' ? 'optical' : 'ethernet')
  })
}

// ===== 图片面板端口热点层 =====
// 热点位置基于"运行时图像检测"（detectPanelPorts）：面板图加载后从像素识别端口行列，
// 自动贴合任意面板图的实际端口位置，无需按型号写死布局。
// 检测不可靠（深色/低对比/无数据端口面板）时不生成热点，避免错位。
const portHotspots = computed(() => {
  if (!props.device || !panelData.value?.panelImage) return []
  const devId = props.device.id
  // 以图片实际渲染尺寸为基准（避免 canvas 边框导致的热点整体偏移）
  const img = panelBgRef.value
  const W = img && img.offsetWidth ? img.offsetWidth : panelData.value.panelWidth
  const H = img && img.offsetHeight ? img.offsetHeight : panelData.value.panelHeight
  const baseX = img ? img.offsetLeft : 0
  const baseY = img ? img.offsetTop : 0
  const spots = []
  const rdpDeviceStore = useDeviceStore()
  function push(portId, portNum, portType, name, cxPct, cyPct, wPct, hPct) {
    const normId = normalizePortId(portId)
    const connected = portStateStore.isPortOccupied(devId, normId)
    const conn = connected ? portStateStore.getPortConnection(devId, normId) : null
    const w = wPct * W
    const h = hPct * H
    // 对端端口名动态解析（portNames 权威源优先，快照兜底），改名后立即生效
    let remotePortDisplay = ''
    if (conn) {
      const remoteDev = rdpDeviceStore.devices.find(d => String(d.id) === String(conn.remoteDeviceId))
      // 对端是配线架等机柜配线设备时不在 deviceStore 中，从 patchItems 查备注名
      const remotePatchItem = remoteDev ? null : findPatchItemById(rdpCabinetStore.cabinets, conn.remoteDeviceId)
      remotePortDisplay = resolveRemotePortName(remoteDev || remotePatchItem, conn.remotePortId, conn.remoteDeviceId, conn.remotePortNum)
    }
    spots.push({
      portId: normId,
      portNum,
      portType,
      name,
      connected,
      x: baseX + cxPct * W - w / 2,
      y: baseY + cyPct * H - h / 2,
      w,
      h,
      tooltip: connected
        ? `${name} · 已连接 ${conn?.remoteDeviceName || ''} ${remotePortDisplay}（${conn?.cableType || ''}）`
        : `${name} · 未连接，点击创建连线`
    })
  }
  // 1) 优先使用运行时图像检测到的真实端口位置（贴合任意面板图）
  const det = detectedPorts.value
  if (det && det.rows && det.rows.length) {
    // 端口过少说明检测不可靠（深色/低对比/无数据端口面板），不生成错位热点
    let total = 0
    for (const row of det.rows) total += row.ports.length
    if (total < 6) return []
    let eth = 0
    let sfp = 0
    for (const row of det.rows) {
      const hPct = Math.max(Math.min(row.rowH, 0.12), 0.045)
      for (const p of row.ports) {
        // 宽口（>3% 图宽）视为光口 SFP，其余为电口
        if (p.w > 0.03) {
          sfp++
          push('sfp' + sfp, sfp, 'optical', 'SFP' + sfp, p.cx, row.cy, p.w * 1.15, hPct)
        } else {
          eth++
          push('eth' + eth, eth, 'ethernet', 'GE0/0/' + eth, p.cx, row.cy, p.w * 1.2, hPct)
        }
      }
    }
    return spots
  }
  // 2) 检测失败（图片无法识别端口：深色/低对比度/无数据端口面板）→ 不生成热点
  return []
})

// 方法：热点点击
function onHotspotClick(spot) {
  emit('port-click', {
    id: spot.portId,
    portId: spot.portId,
    portNum: spot.portNum,
    portType: spot.portType,
    label: spot.name,
    connectable: true
  })
}

// 方法：缩放处理
function handleWheel(e) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  const newScale = Math.min(Math.max(scale.value + delta, 0.5), 3.0)
  scale.value = Math.round(newScale * 10) / 10
}

// 方法：拖拽处理
function startDrag(e) {
  isDragging.value = true
  dragStartX.value = e.clientX - offsetX.value
  dragStartY.value = e.clientY - offsetY.value
}

function doDrag(e) {
  if (!isDragging.value) return
  offsetX.value = e.clientX - dragStartX.value
  offsetY.value = e.clientY - dragStartY.value
}

function stopDrag() {
  isDragging.value = false
}

// 方法：重置视图
function resetView() {
  scale.value = 1.0
  offsetX.value = 0
  offsetY.value = 0
}

// 修复：关闭面板后拖拽事件未解绑导致设备跟着鼠标走
onMounted(() => {
  document.addEventListener('mouseup', stopDrag)
})

onUnmounted(() => {
  document.removeEventListener('mouseup', stopDrag)
  isDragging.value = false
})

// 方法：保存自定义面板
function saveCustomPanel() {
  if (!customPanelJson.value) {
    ElMessage.warning('请先粘贴面板数据 JSON')
    return
  }
  
  let data
  try {
    data = JSON.parse(customPanelJson.value)
  } catch (err) {
    ElMessage.error('JSON 解析失败：' + err.message)
    return
  }
  
  // 使用统一的验证函数进行结构校验
  if (!validatePanelData(data)) {
    ElMessage.error('面板数据格式错误：缺少必要字段或字段类型不正确')
    return
  }
  
  // 保存到 localStorage
  const key = `customPanel_${props.device.vendor}_${props.device.model}`
  localStorage.setItem(key, JSON.stringify(data))
  
  customPanelJson.value = ''
  showUploadDialog.value = false
  ElMessage.success('自定义面板数据已保存，重新打开面板即可生效')
}
</script>

<style scoped>
.real-device-panel {
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

/* 工具栏 */
.real-panel-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--bg-glass-strong);
  border-bottom: 1px solid var(--border-color);
}

.toolbar-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.toolbar-info {
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-glass);
  padding: 2px 8px;
  border-radius: 4px;
}

/* 面板视口 */
.real-panel-viewport {
  width: 100%;
  height: 500px;
  overflow: auto;
  background: var(--bg-base);
  position: relative;
  cursor: grab;
}

/* 3D 舞台（与 2D 视口等高） */
.real-panel-3d-stage {
  width: 100%;
  height: 500px;
  position: relative;
}

/* 视图切换 */
.view-mode-toggle {
  margin-left: 4px;
}

.real-panel-viewport:active {
  cursor: grabbing;
}

.real-panel-canvas {
  position: relative;
  background: linear-gradient(180deg, var(--bg-glass-strong) 0%, var(--bg-glass-strong) 100%);
  border: 2px solid var(--border-strong);
  border-radius: 8px;
  transform-origin: 0 0;
  transition: transform 0.1s ease;
  margin: 20px;
}

/* 面板底图（nVisual 导入的真实面板图片） */
.panel-bg-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  user-select: none;
  pointer-events: none;
  border-radius: 6px;
}

/* 端口热点层（图片面板）：默认透明，hover 高亮；已连接绿色闪烁 */
.port-hotspot {
  position: absolute;
  border-radius: 2px;
  cursor: pointer;
  z-index: 5;
  transition: background 0.15s, box-shadow 0.15s;
}
.port-hotspot:hover {
  background: rgba(90, 165, 255, 0.28);
  box-shadow: 0 0 0 1.5px rgba(90, 165, 255, 0.85), 0 0 10px rgba(90, 165, 255, 0.5);
}
.port-hotspot.connected {
  background: rgba(0, 221, 102, 0.22);
  box-shadow: inset 0 0 0 1px rgba(0, 221, 102, 0.65);
  animation: hotspot-blink 1.2s infinite ease-in-out;
}
.port-hotspot.connected:hover {
  background: rgba(0, 221, 102, 0.32);
  box-shadow: inset 0 0 0 1.5px rgba(0, 221, 102, 0.9), 0 0 8px rgba(0, 221, 102, 0.5);
}
@keyframes hotspot-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

/* 正面/背面切换按钮 */
.panel-face-toggle {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 10;
  padding: 2px 10px;
  font-size: 11px;
  color: var(--text-primary);
  background: var(--bg-glass-strong);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  opacity: 0.85;
  transition: opacity 0.15s;
}

.panel-face-toggle:hover {
  opacity: 1;
}

/* 端口 */
.real-panel-port {
  cursor: pointer;
  transition: all 0.2s;
}

.real-panel-port:hover {
  filter: brightness(1.2);
}

.real-panel-port.connected {
  filter: drop-shadow(0 0 4px var(--accent-glow));
}

/* RJ45端口 */
.real-rj45 {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.real-rj45-body {
  width: 24px;
  height: 32px;
  background: var(--bg-glass-strong);
  border: 1px solid var(--text-muted);
  border-radius: 2px;
  position: relative;
  display: flex;
  flex-direction: column;
}

.real-rj45-top {
  width: 100%;
  height: 4px;
  background: var(--text-secondary);
  border-radius: 2px 2px 0 0;
}

.real-rj45-pins {
  display: flex;
  flex-wrap: wrap;
  gap: 1px;
  padding: 2px;
}

.real-pin {
  width: 2px;
  height: 2px;
  background: var(--text-secondary);
  border-radius: 1px;
}

.real-rj45-led {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  position: absolute;
  bottom: 2px;
  right: 2px;
}

.real-rj45-led.on {
  background: var(--accent);
  box-shadow: 0 0 4px var(--accent);
}

.real-rj45-led.blinking {
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
  animation: blink 1s infinite;
}

.real-rj45-led.off {
  background: var(--border-strong);
}

/* SFP端口 */
.real-sfp {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.real-sfp-body {
  width: 20px;
  height: 28px;
  background: var(--bg-glass-strong);
  border: 1px solid var(--text-muted);
  border-radius: 2px;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.real-sfp-notch {
  width: 12px;
  height: 2px;
  background: var(--text-secondary);
  border-radius: 1px;
  margin-top: 4px;
}

.real-sfp-latch {
  width: 8px;
  height: 4px;
  background: var(--text-muted);
  border-radius: 0 0 2px 2px;
}

.real-sfp-led {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  position: absolute;
  bottom: 2px;
  right: 2px;
}

.real-sfp-led.on {
  background: var(--accent);
  box-shadow: 0 0 4px var(--accent);
}

.real-sfp-led.blinking {
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
  animation: blink 1s infinite;
}

.real-sfp-led.off {
  background: var(--border-strong);
}

/* XFP端口 */
.real-xfp {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.real-xfp-body {
  width: 22px;
  height: 30px;
  background: var(--bg-glass-strong);
  border: 1px solid var(--text-muted);
  border-radius: 2px;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.real-xfp-notch {
  width: 14px;
  height: 2px;
  background: var(--text-secondary);
  border-radius: 1px;
  margin-top: 6px;
}

.real-xfp-led {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  position: absolute;
  bottom: 2px;
  right: 2px;
}

.real-xfp-led.on {
  background: var(--accent);
  box-shadow: 0 0 4px var(--accent);
}

.real-xfp-led.blinking {
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
  animation: blink 1s infinite;
}

.real-xfp-led.off {
  background: var(--border-strong);
}

/* 端口标签 */
.real-port-label {
  font-size: 9px;
  color: var(--text-secondary);
  text-align: center;
  white-space: nowrap;
}

/* LED指示灯 */
.real-panel-led {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.real-panel-led.on {
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent);
}

.real-panel-led.off {
  background: var(--border-strong);
}

.real-panel-led.blinking {
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
  animation: blink 1s infinite;
}

.real-panel-led.alarm {
  background: var(--danger);
  box-shadow: 0 0 6px var(--danger);
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* 端口统计 */
.port-stats-bar {
  display: flex;
  gap: 16px;
  padding: 8px 16px;
  background: var(--bg-glass-strong);
  border-top: 1px solid var(--border-color);
}

.stat {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.stat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.stat-dot.total {
  background: var(--text-secondary);
}

.stat-dot.connected {
  background: var(--accent);
}

.stat-dot.free {
  background: var(--border-strong);
}

.stat-dot.active {
  background: var(--info);
}

.stat-label {
  color: var(--text-secondary);
}

.stat-value {
  font-weight: 600;
  color: var(--text-primary);
}

.stat-value.connected {
  color: var(--accent);
}

.stat-value.free {
  color: var(--text-secondary);
}

.stat-value.active {
  color: var(--info);
}

/* 上传提示 */
.upload-hint {
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-glass-strong);
  padding: 8px;
  border-radius: 4px;
}

.upload-hint pre {
  margin-top: 4px;
  font-size: 11px;
  background: var(--bg-glass-strong);
  padding: 8px;
  border-radius: 4px;
  overflow: auto;
  max-height: 200px;
}
</style>
