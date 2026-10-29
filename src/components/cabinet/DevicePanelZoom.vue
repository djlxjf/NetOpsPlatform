<template>
  <el-dialog
    v-model="visible"
    :title="panelTitle"
    width="1320px"
    :close-on-click-modal="true"
    :close-on-press-escape="true"
    :append-to-body="true"
    align-center
    class="device-panel-zoom-dialog"
  >
    <div class="zoom-container">
      <!-- 视图切换：3D 模型（默认）/ 2D 面板（原 SVG 渲染） -->
      <div class="zoom-view-toggle">
        <el-radio-group v-model="viewMode" size="small">
          <el-radio-button label="3d">3D 模型</el-radio-button>
          <el-radio-button label="2d">2D 面板</el-radio-button>
        </el-radio-group>
      </div>

      <!-- 舞台容器（常驻）：2D 面板的电源按钮/端口原生事件委托挂载点 -->
      <div ref="stageRef" class="zoom-stage">
        <!-- 3D 模型视图：端口点击/电源/重命名事件与 2D 面板完全一致 -->
        <DevicePanel3D
          v-if="viewMode === '3d' && device && device.id"
          :device="device"
          class="zoom-3d-stage"
          @port-click="handlePortClick"
          @power-toggle="(data) => emit('power-toggle', data)"
          @patch-rename="(data) => emit('patch-rename', data)"
        />

        <!-- 2D 面板视图（原实现，保持兼容） -->
        <div v-else class="zoom-2d-stage">
          <svg
            :viewBox="svgViewBox"
            :style="{ width: '100%', aspectRatio: svgAspectRatio }"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="xMidYMid meet"
          >
          <!-- 背景（模拟机柜内部的深色底，覆盖挂耳区域） -->
          <rect
            x="0"
            y="0"
            :width="DEVICE_WIDTH + 2 * RACK_EAR_W + 2 * EAR_MARGIN"
            :height="deviceHeight"
            fill="#1a1a1a"
            rx="2"
          />
          <!-- 挂耳 + 设备主体整体右移，避免负坐标挂耳被 SVG 边缘裁切，并四周留白 -->
          <g :transform="`translate(${RACK_EAR_W + EAR_MARGIN}, 0)`">
            <RackEarsComponent
              :device="device"
              :width="DEVICE_WIDTH"
              :height="deviceHeight"
              color="#2a2a2a"
            />
            <DevicePanelRenderer
              :device="device"
              :width="DEVICE_WIDTH"
              :height="deviceHeight"
              @port-click="handlePortClick"
              @power-toggle="(data) => emit('power-toggle', data)"
              @patch-rename="(data) => emit('patch-rename', data)"
            />
          </g>
        </svg>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="zoom-footer">
        <el-button size="small" @click="visible = false">关闭</el-button>
        <el-button v-if="isPatchItem" size="small" @click="emit('rename', device)">重命名</el-button>
        <el-button size="small" type="danger" plain v-if="showUnmount" @click="emit('unmount', device)">下架</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { U_HEIGHT, DEVICE_WIDTH, RACK_EAR_W } from '../../composables/useRackTransform.js'
import { DevicePanelRenderer, RackEarsComponent } from './DevicePanelRenderer.js'
import DevicePanel3D from './DevicePanel3D.vue'

// 挂耳四周留白，避免贴边被边缘裁切
const EAR_MARGIN = 28

const props = defineProps({
  visible: { type: Boolean, default: false },
  device: { type: Object, default: () => ({}) },
  showUnmount: { type: Boolean, default: true }
})

const emit = defineEmits(['update:visible', 'port-click', 'unmount', 'power-toggle', 'patch-rename', 'rename'])

// 面板视图模式：3d（默认，3D 模型）/ 2d（原 SVG 渲染）
const viewMode = ref('3d')

// 配线架/理线架/ODF 等配线设备：支持重命名与下架（普通设备名称在设备管理中维护）
const isPatchItem = computed(() => !!(props.device && (props.device._isPatchItem || props.device._category)))

// SVG 元素上的 Vue onClick 事件绑定在部分场景下不生效，改用原生事件委托确保电源按钮可点
// 委托容器改为常驻的 2D 舞台节点（3D 模式下不渲染 SVG，closest 查询自然落空）
const stageRef = ref(null)
function onPanelClick(e) {
  const hit = e.target && e.target.closest && e.target.closest('[data-power-btn]')
  if (hit && props.device && props.device.id) {
    emit('power-toggle', { deviceId: props.device.id, device: props.device })
    return
  }
  const pr = e.target && e.target.closest && e.target.closest('[data-patch-rename]')
  if (pr && props.device && props.device.id) {
    const portNum = parseInt(pr.getAttribute('data-patch-rename'), 10)
    emit('patch-rename', { deviceId: props.device.id, device: props.device, portNum })
    return
  }
  const portEl = e.target && e.target.closest && e.target.closest('[data-port-id]')
  if (portEl && props.device && props.device.id) {
    emit('port-click', {
      deviceId: props.device.id,
      device: props.device,
      portId: portEl.getAttribute('data-port-id'),
      portNum: parseInt(portEl.getAttribute('data-port-num'), 10),
      portType: portEl.getAttribute('data-port-type') || 'ethernet',
      portName: portEl.getAttribute('data-port-name') || ''
    })
  }
}
onMounted(() => { stageRef.value && stageRef.value.addEventListener('click', onPanelClick) })
onUnmounted(() => { stageRef.value && stageRef.value.removeEventListener('click', onPanelClick) })

const visible = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v)
})

function handlePortClick(portInfo) {
  emit('port-click', portInfo)
}

const panelTitle = computed(() => {
  if (!props.device || !props.device.id) return '设备前面板'
  const name = props.device.name || props.device.deviceName || '设备'
  const model = props.device.model || props.device.model_number || ''
  return `${name} ${model ? '- ' + model : ''} - 前面板`
})

const deviceHeight = computed(() => {
  const u = (props.device && (props.device.u_height || props.device.uSize)) || 1
  return U_HEIGHT * u
})

// viewBox 从 0 开始（设备已整体右移，挂耳进入正坐标区），宽覆盖左右挂耳并留白
const svgViewBox = computed(() => {
  return `0 0 ${DEVICE_WIDTH + 2 * RACK_EAR_W + 2 * EAR_MARGIN} ${deviceHeight.value}`
})

// 让 SVG 宽高比与 viewBox 一致，保证左右挂耳完整显示不被边缘裁切
const svgAspectRatio = computed(() => `${DEVICE_WIDTH + 2 * RACK_EAR_W + 2 * EAR_MARGIN} / ${deviceHeight.value}`)

// SVG 显示高度：按 8 倍放大（仅作为参考，实际尺寸由 aspect-ratio 决定）
const svgHeight = computed(() => deviceHeight.value * 8)
</script>

<style scoped>
.device-panel-zoom-dialog :deep(.el-dialog) {
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

.device-panel-zoom-dialog :deep(.el-dialog__header) {
  border-bottom: 1px solid var(--border-color);
  padding: 16px 24px;
  margin-right: 0;
}

.device-panel-zoom-dialog :deep(.el-dialog__title) {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
}

.device-panel-zoom-dialog :deep(.el-dialog__body) {
  padding: 24px;
  background: var(--bg-base);
}

.device-panel-zoom-dialog :deep(.el-dialog__close) {
  color: var(--text-muted);
  font-size: 18px;
}
.device-panel-zoom-dialog :deep(.el-dialog__close:hover) {
  color: var(--text-primary);
}

.zoom-container {
  width: 100%;
  background: var(--bg-base);
  border-radius: var(--radius-md);
  padding: 20px 10px;
  border: 1px solid var(--border-color);
}

/* 视图切换（3D / 2D） */
.zoom-view-toggle {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

/* 2D 舞台（常驻容器） */
.zoom-stage {
  width: 100%;
}

/* 3D 舞台：固定高度，内部 Three.js 视口自适应 */
.zoom-3d-stage {
  display: block;
  height: 520px;
  border-radius: var(--radius-md);
  overflow: hidden;
}

/* 2D 舞台 */
.zoom-2d-stage {
  width: 100%;
}

.zoom-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* LED 动画（与机柜中保持一致） */
@keyframes rj45-led-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

@keyframes sfp-led-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.device-panel-zoom-dialog :deep(.rj45-led-green) {
  animation: rj45-led-blink 1.4s infinite;
}

.device-panel-zoom-dialog :deep(.rj45-led-orange) {
  animation: rj45-led-blink 1.4s infinite;
}

.device-panel-zoom-dialog :deep(.sfp-led-active) {
  animation: sfp-led-blink 1.8s infinite;
}
</style>
