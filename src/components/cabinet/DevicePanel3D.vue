<template>
  <div class="device-panel-3d">
    <!-- 工具栏：视角切换 / 自动旋转 / 重置（仅视图操作，不影响数据与事件） -->
    <div class="dp3d-toolbar">
      <span class="dp3d-title">{{ panelTitle }}</span>
      <div class="dp3d-actions">
        <el-button-group>
          <el-button size="small" :type="view === 'front' ? 'primary' : ''" @click="setView('front')">正面</el-button>
          <el-button size="small" :type="view === 'back' ? 'primary' : ''" @click="setView('back')">背面</el-button>
          <el-button size="small" :type="view === 'iso' ? 'primary' : ''" @click="setView('iso')">透视</el-button>
        </el-button-group>
        <el-button size="small" :type="autoRotate ? 'primary' : ''" @click="autoRotate = !autoRotate">自动旋转</el-button>
        <el-button size="small" @click="resetView">重置视角</el-button>
      </div>
      <span class="dp3d-hint">左键旋转 · 滚轮缩放 · 右键平移 · 点击端口创建连线</span>
    </div>

    <!-- 3D 视口 -->
    <div class="dp3d-viewport" ref="viewportRef"></div>

    <!-- WebGL 不可用时的降级提示（不抛错，保持布局） -->
    <div v-if="glError" class="dp3d-error">
      3D 渲染初始化失败（{{ glError }}），请检查浏览器 WebGL 支持或显卡驱动。
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { storeToRefs } from 'pinia'
import { usePortStateStore } from '../../stores/portState.js'
import { computePanelPorts, computePortStates } from './device3d/portLayout.js'
import { buildDeviceModel } from './device3d/deviceModels.js'
import { getDeviceSpec, U_UNIT } from './device3d/deviceSpecs.js'

/*
 * 设备面板 3D 组件
 *
 * 数据与事件契约与二维 DevicePanelRenderer 完全一致：
 *   · 端口占用/连接状态来自 usePortStateStore（与 2D 同一 store、同一响应式依赖 connections）
 *   · 点击端口 → port-click { deviceId, device, portId, portNum, portType, portName }
 *   · 点击电源按钮 → power-toggle { deviceId, device }
 *   · 点击配线架/光纤托盘标签 → patch-rename { deviceId, device, portNum }
 *   · 悬停端口 → port-hover { ..., clientX, clientY } / port-leave
 *   · 点击机身 → device-select { deviceId, device }（新增的选中交互，不影响既有事件流）
 */

const props = defineProps({
  device: { type: Object, required: true },
  // 以下两个参数仅为与二维渲染器（:width/:height）保持调用签名兼容而保留
  width: { type: Number, default: 0 },
  height: { type: Number, default: 0 },
})

const emit = defineEmits(['port-click', 'port-hover', 'port-leave', 'power-toggle', 'patch-rename', 'device-select'])

const portStateStore = usePortStateStore()
const { connections } = storeToRefs(portStateStore)

/* ---------------- 本地状态 ---------------- */
const viewportRef = ref(null)
const glError = ref('')
const view = ref('iso')
const autoRotate = ref(false)

let renderer = null
let scene = null
let camera = null
let controls = null
let model = null
let layout = null
let rafId = 0
let resizeObserver = null
let disposed = false

// 交互用
const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()
let downPos = null
let hoveredKey = null

// 视角补间
let tween = null
const clock = new THREE.Clock()

const panelTitle = computed(() => {
  const d = props.device
  if (!d) return '设备面板 3D'
  const name = d.name || d.deviceName || '设备'
  const model_ = d.model || d.model_number || ''
  return `${name}${model_ ? ' - ' + model_ : ''}`
})

/* ---------------- 场景初始化 ---------------- */
function initThree() {
  const el = viewportRef.value
  if (!el) return false
  const w = el.clientWidth || 860
  const h = el.clientHeight || 520

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  } catch (e) {
    glError.value = (e && e.message) || 'WebGL 不可用'
    return false
  }
  // 浏览器在内存压力/长时间后台后会回收 GPU 上下文。
  // 早期只 try/catch 一次构造函数，上下文丢失后画面黑屏且无任何提示。
  // 这里监听并在 restored 时标记，由调用方/用户主动重载面板。
  renderer.domElement.addEventListener('webglcontextlost', onContextLost, false)
  renderer.domElement.addEventListener('webglcontextrestored', onContextRestored, false)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(w, h)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  el.appendChild(renderer.domElement)

  scene = new THREE.Scene()

  camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 2000)

  // 灯光（暗色机房环境：主光 + 冷色补光 + 正面补光）
  scene.add(new THREE.AmbientLight(0xffffff, 0.65))
  const key = new THREE.DirectionalLight(0xffffff, 1.7)
  key.position.set(60, 90, 80)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0x88aaff, 0.55)
  fill.position.set(-70, 40, 60)
  scene.add(fill)
  const rim = new THREE.DirectionalLight(0xffffff, 0.7)
  rim.position.set(0, 20, -100)
  scene.add(rim)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 18
  controls.maxDistance = 420
  controls.autoRotateSpeed = 2.2

  // 交互事件（带拖拽阈值，避免旋转视角误触发点击）
  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointerup', onPointerUp)
  renderer.domElement.addEventListener('pointermove', onPointerMove)
  renderer.domElement.addEventListener('pointerleave', onPointerLeave)

  // 尺寸变化 → 更新渲染缓冲（仅在尺寸真实变化时执行，且不写回画布样式，
  // 避免 setSize→样式变化→容器重新布局→ResizeObserver 再次触发的反馈环路）
  let lastW = 0, lastH = 0
  resizeObserver = new ResizeObserver(() => {
    if (!renderer || !camera) return
    const cw = el.clientWidth
    const ch = el.clientHeight
    if (!cw || !ch) return
    if (cw === lastW && ch === lastH) return
    lastW = cw
    lastH = ch
    renderer.setSize(cw, ch, false)
    camera.aspect = cw / ch
    camera.updateProjectionMatrix()
  })
  resizeObserver.observe(el)

  return true
}

/* ---------------- 模型构建 / 状态刷新 ---------------- */
function rebuildModel() {
  if (disposed || !scene) return
  if (model) {
    scene.remove(model.group)
    model.dispose()
    model = null
  }
  if (!props.device) return
  layout = computePanelPorts(props.device)
  model = buildDeviceModel(props.device, layout)
  scene.add(model.group)
  refreshStates()
  frameDevice(props.device, true)
}

/** 端口连接状态 / 设备运行状态 → 3D LED（与 2D 同一数据源） */
function refreshStates() {
  if (!model || !layout || !props.device) return
  const states = computePortStates(props.device, layout.ports, portStateStore)
  model.updateStates(states)
  model.setStatus(props.device.status)
}

/* ---------------- 相机取景 ---------------- */
function frameDevice(dev, immediate = false) {
  const spec = getDeviceSpec(dev)
  const hUnits = U_UNIT * spec.u
  const size = Math.max(spec.w, hUnits, spec.d)
  const dist = size * 2.35
  const pos = new THREE.Vector3(dist * 0.58, hUnits * 0.42, dist * 0.92)
  const target = new THREE.Vector3(0, 0, 0)
  if (immediate) {
    camera.position.copy(pos)
    controls.target.copy(target)
    controls.update()
  } else {
    startTween(pos, target)
  }
}

function startTween(pos, target) {
  tween = {
    fromPos: camera.position.clone(),
    toPos: pos,
    fromTgt: controls.target.clone(),
    toTgt: target,
    t: 0,
    dur: 0.55,
  }
}

function setView(v) {
  view.value = v
  if (!camera || !props.device) return
  const spec = getDeviceSpec(props.device)
  const hUnits = U_UNIT * spec.u
  const size = Math.max(spec.w, hUnits, spec.d)
  const dist = size * 2.35
  let pos, target
  if (v === 'front') {
    pos = new THREE.Vector3(dist * 0.14, hUnits * 0.06, dist * 1.08)
    target = new THREE.Vector3(0, 0, 0)
  } else if (v === 'back') {
    pos = new THREE.Vector3(dist * 0.14, hUnits * 0.06, -dist * 1.08)
    target = new THREE.Vector3(0, 0, 0)
  } else {
    pos = new THREE.Vector3(dist * 0.58, hUnits * 0.42, dist * 0.92)
    target = new THREE.Vector3(0, 0, 0)
  }
  startTween(pos, target)
}

function resetView() {
  autoRotate.value = false
  setView('iso')
}

/* ---------------- 射线交互 ---------------- */
function updateNdc(e) {
  const el = renderer.domElement
  const rect = el.getBoundingClientRect()
  ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
}

/** 从命中结果向上查找可交互对象：patch-rename 标签 > 电源按钮 > 端口 > 机身 */
function findInteractive(hits) {
  for (const hit of hits) {
    let o = hit.object
    while (o && o !== model.group) {
      if (o.userData && o.userData.patchRename != null) return { patch: o.userData.patchRename }
      if (o.userData && o.userData.powerBtn) return { power: true }
      if (o.userData && o.userData.port) return { port: o.userData.port }
      if (o.userData && o.userData.body) return { body: true }
      o = o.parent
    }
  }
  return null
}

function onPointerDown(e) {
  downPos = [e.clientX, e.clientY]
}

function onPointerUp(e) {
  if (!downPos) return
  const dx = e.clientX - downPos[0]
  const dy = e.clientY - downPos[1]
  downPos = null
  if (Math.hypot(dx, dy) > 5) return // 拖拽旋转，不视为点击
  if (!model || !props.device) return
  updateNdc(e)
  raycaster.setFromCamera(ndc, camera)
  const hits = raycaster.intersectObject(model.group, true)
  const info = findInteractive(hits)
  if (!info) return
  if (info.patch != null) {
    emit('patch-rename', { deviceId: props.device.id, device: props.device, portNum: info.patch })
  } else if (info.power) {
    emit('power-toggle', { deviceId: props.device.id, device: props.device })
  } else if (info.port) {
    const p = info.port
    emit('port-click', {
      deviceId: props.device.id,
      device: props.device,
      portId: p.portId,
      portNum: p.portNum,
      portType: p.portType,
      portName: p.portName,
    })
  } else if (info.body) {
    model.setSelected(true)
    emit('device-select', { deviceId: props.device.id, device: props.device })
  }
}

/**
 * 指针移动拾取：用 rAF 合并同一帧内的多次 pointermove。
 * 早期实现每个事件都做一次递归射线求交（含端口/螺丝/挂耳大量子网格），
 * 高频移动时 CPU 占用明显偏高；这里一帧最多算一次，并只保留最后一个事件。
 */
let hoverRafId = 0
let pendingMove = null
function onPointerMove(e) {
  if (!model || !renderer) return
  pendingMove = e
  if (hoverRafId) return
  hoverRafId = requestAnimationFrame(() => {
    hoverRafId = 0
    const ev = pendingMove
    pendingMove = null
    if (!ev || !model || !renderer || disposed) return
    doHoverPick(ev)
  })
}

function doHoverPick(e) {
  updateNdc(e)
  raycaster.setFromCamera(ndc, camera)
  const hits = raycaster.intersectObject(model.group, true)
  const info = findInteractive(hits)
  const key = info?.port ? info.port.portId : (info?.power ? '__power' : (info?.patch != null ? '__patch' + info.patch : null))
  renderer.domElement.style.cursor = info ? 'pointer' : 'default'
  if (key === hoveredKey) return
  hoveredKey = key
  if (info?.port && props.device) {
    const p = info.port
    emit('port-hover', {
      deviceId: props.device.id,
      device: props.device,
      portId: p.portId,
      portNum: p.portNum,
      portType: p.portType,
      portName: p.portName,
      clientX: e.clientX,
      clientY: e.clientY,
    })
  } else {
    emit('port-leave')
  }
}

function onPointerLeave() {
  if (hoveredKey !== null) {
    hoveredKey = null
    emit('port-leave')
  }
}

/* ---------------- WebGL 上下文丢失/恢复 ---------------- */
function onContextLost(e) {
  // 阻止默认行为是浏览器恢复上下文的前提
  e.preventDefault()
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
  glError.value = 'WebGL 上下文已丢失（显卡驱动重置或长时间后台）'
}

function onContextRestored() {
  glError.value = ''
  // 上下文恢复后 GPU 资源已失效，重建模型并重启渲染循环
  try {
    rebuildModel()
    if (!rafId && !disposed) animate()
  } catch (err) {
    glError.value = 'WebGL 上下文恢复后重建失败，请重新打开面板'
  }
}

/* ---------------- 渲染循环 ---------------- */
function animate() {
  if (disposed) return
  rafId = requestAnimationFrame(animate)
  const dt = clock.getDelta()
  const t = clock.elapsedTime

  // 视角补间
  if (tween) {
    tween.t = Math.min(1, tween.t + dt / tween.dur)
    const k = 1 - Math.pow(1 - tween.t, 3) // easeOutCubic
    camera.position.lerpVectors(tween.fromPos, tween.toPos, k)
    controls.target.lerpVectors(tween.fromTgt, tween.toTgt, k)
    if (tween.t >= 1) tween = null
  }

  controls.autoRotate = autoRotate.value
  controls.update()

  if (model) model.updateBlink(t * 0.85)
  renderer.render(scene, camera)
}

/* ---------------- 生命周期 ---------------- */
onMounted(async () => {
  await nextTick()
  if (disposed) return
  if (!initThree()) return
  rebuildModel()
  animate()
})

onBeforeUnmount(() => {
  disposed = true
  if (rafId) cancelAnimationFrame(rafId)
  if (hoverRafId) { cancelAnimationFrame(hoverRafId); hoverRafId = 0 }
  pendingMove = null
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null }
  if (renderer) {
    renderer.domElement.removeEventListener('pointerdown', onPointerDown)
    renderer.domElement.removeEventListener('pointerup', onPointerUp)
    renderer.domElement.removeEventListener('pointermove', onPointerMove)
    renderer.domElement.removeEventListener('pointerleave', onPointerLeave)
    renderer.domElement.removeEventListener('webglcontextlost', onContextLost)
    renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored)
    if (controls) controls.dispose()
    if (model) { scene.remove(model.group); model.dispose(); model = null }
    renderer.dispose()
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement)
    renderer = null
  }
})

/* ---------------- 响应式：与 2D 面板同源的状态更新机制 ---------------- */
// 端口连接变化 → 刷新 LED（对应 2D 渲染器中 connections 依赖驱动的重渲染）
watch(connections, () => refreshStates(), { deep: true })

// 设备对象/运行状态变化 → 重建或刷新（CabinetsView 通过克隆设备对象触发更新）
watch(() => props.device, (nv, ov) => {
  if (!nv) return
  if (!ov || nv.id !== ov.id || (nv.u_height || nv.uSize) !== (ov.u_height || ov.uSize)) {
    rebuildModel()
  } else {
    refreshStates()
  }
}, { deep: false })

// 端口自定义名变化 → 重建（标签文字与 2D 的 portNames 一致）
// 用 deep watch 代替 `JSON.stringify(...)` 作为 watcher 源：
// 后者每次响应式求值都要把整个 portNames 序列化一遍，属于无谓开销
watch(() => props.device?.portNames, () => rebuildModel(), { deep: true })
</script>

<style scoped>
.device-panel-3d {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 420px;
  background: var(--bg-base, #0f1115);
  border-radius: var(--radius-md, 8px);
  overflow: hidden;
}

.dp3d-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  background: var(--bg-glass-strong, rgba(255, 255, 255, 0.04));
  border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
  flex-wrap: wrap;
}

.dp3d-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #e5e7eb);
  white-space: nowrap;
}

.dp3d-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dp3d-hint {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-muted, #9ca3af);
  white-space: nowrap;
}

.dp3d-viewport {
  flex: 1;
  min-height: 360px;
  position: relative;
  background:
    radial-gradient(ellipse at 50% 35%, rgba(56, 78, 120, 0.22) 0%, rgba(10, 12, 16, 0) 62%),
    var(--bg-base, #0b0d11);
  cursor: default;
}

.dp3d-error {
  padding: 12px 16px;
  font-size: 12px;
  color: var(--danger, #ef4444);
  background: rgba(239, 68, 68, 0.08);
  border-top: 1px solid rgba(239, 68, 68, 0.25);
}
</style>
