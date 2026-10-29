/**
 * topologyLayout - 拓扑布局持久化 store
 *
 * 职责：只保存拓扑**布局**（节点坐标 / 视口 / 边视觉覆盖），
 * 不保存节点/边本身 —— 节点由 deviceStore 派生、边由 portStateStore 派生。
 *
 * 为什么独立成 store 而不是复用 canvasTopology：
 *  1. canvasTopology 的 setNodes 会 pushHistory / 标记 isDirty / 整份写 localStorage，
 *     拿它当 layout 层语义错位，还会继续残留旧分裂数据；
 *  2. 本 store key 带用户维度（`netops_topology_layout_${username}`），
 *     修正 canvasTopology 无用户维度的问题。
 */
import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'

function getCurrentUsername() {
  try {
    const user = JSON.parse(localStorage.getItem('netops_user') || 'null')
    return user?.username || 'default'
  } catch {
    return 'default'
  }
}

export const useTopologyLayoutStore = defineStore('topologyLayout', () => {
  // 布局数据
  const positions = ref({})   // { [deviceId]: { x, y, fixed } }
  const edgeOverrides = ref({}) // { [connectionId]: { router, label } }
  const viewport = reactive({ x: 0, y: 0, zoom: 1 })
  const migrated = ref(false) // 旧画布数据是否已迁移

  function storageKey() {
    return 'netops_topology_layout_' + getCurrentUsername()
  }

  // ---------- 节点坐标 ----------
  function getPosition(deviceId) {
    return positions.value[deviceId] || null
  }

  function setPosition(deviceId, x, y, fixed = true) {
    const cur = positions.value[deviceId] || { x: 0, y: 0, fixed: false }
    positions.value[deviceId] = { x, y, fixed: fixed ?? cur.fixed }
  }

  function setFixed(deviceId, fixed) {
    if (positions.value[deviceId]) {
      positions.value[deviceId].fixed = fixed
    }
  }

  function hasPosition(deviceId) {
    return Boolean(positions.value[deviceId])
  }

  /** 清理不再存在的设备坐标 */
  function prune(validDeviceIds) {
    const set = new Set(validDeviceIds)
    let changed = false
    for (const id of Object.keys(positions.value)) {
      if (!set.has(id)) {
        delete positions.value[id]
        changed = true
      }
    }
    return changed
  }

  // ---------- 边视觉覆盖 ----------
  function getEdgeOverride(connectionId) {
    return edgeOverrides.value[connectionId] || null
  }

  function setEdgeOverride(connectionId, override) {
    edgeOverrides.value[connectionId] = { ...(edgeOverrides.value[connectionId] || {}), ...override }
  }

  // ---------- 视口 ----------
  function setViewport(x, y, zoom) {
    viewport.x = x ?? viewport.x
    viewport.y = y ?? viewport.y
    viewport.zoom = zoom ?? viewport.zoom
  }

  function resetViewport() {
    viewport.x = 0
    viewport.y = 0
    viewport.zoom = 1
  }

  // ---------- 撤销 / 重做（布局快照栈 + 删除对象恢复） ----------
  const undoStack = ref([])
  const redoStack = ref([])
  const MAX_HISTORY = 50

  /** 在会改变布局/拓扑的操作前调用：压入当前状态快照
   *  extra 可携带"被删除对象"等恢复所需数据，undo 时原样返回给调用方处理 */
  function snapshot(extra = null) {
    undoStack.value.push({
      layout: JSON.stringify({ positions: positions.value, edgeOverrides: edgeOverrides.value }),
      extra
    })
    if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift()
    redoStack.value = []
  }

  function _currentSnap() {
    return {
      layout: JSON.stringify({ positions: positions.value, edgeOverrides: edgeOverrides.value }),
      extra: null
    }
  }

  /** 撤销：恢复上一快照；返回该快照的 extra（含被删对象，供调用方恢复）；无可撤销时返回 undefined */
  function undo() {
    if (!undoStack.value.length) return undefined
    const snap = undoStack.value.pop()
    // redo 逆操作：记录需重新删除的对象
    redoStack.value.push({ ..._currentSnap(), extra: { redelete: snap.extra } })
    const data = JSON.parse(snap.layout)
    positions.value = data.positions
    edgeOverrides.value = data.edgeOverrides
    save()
    return snap.extra
  }

  /** 重做：恢复下一快照；返回 { redelete }（供调用方重新执行删除）；无可重做时返回 undefined */
  function redo() {
    if (!redoStack.value.length) return undefined
    const snap = redoStack.value.pop()
    // push 回 undoStack，extra 还原为原快照的删除数据，支持再次 undo
    undoStack.value.push({ ..._currentSnap(), extra: snap.extra?.redelete || null })
    const data = JSON.parse(snap.layout)
    positions.value = data.positions
    edgeOverrides.value = data.edgeOverrides
    save()
    return snap.extra
  }

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  // ---------- 持久化 ----------
  function save() {
    try {
      const data = {
        version: 1,
        positions: positions.value,
        edgeOverrides: edgeOverrides.value,
        viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
        migrated: migrated.value,
        savedAt: Date.now()
      }
      localStorage.setItem(storageKey(), JSON.stringify(data))
      // Electron 环境双写落库（与 devices/portState 模式一致）
      if (window.electronAPI?.dbSaveUserData) {
        try {
          window.electronAPI.dbSaveUserData(getCurrentUsername(), 'topologyLayout', data)
        } catch (e) {
          // 忽略落库失败（web 环境无此 API）
        }
      }
    } catch (e) {
      console.error('[TopologyLayout] 保存失败:', e)
    }
  }

  async function load() {
    try {
      // 优先从 Electron 数据库读取
      let data = null
      if (window.electronAPI?.dbLoadUserData) {
        try {
          const res = await window.electronAPI.dbLoadUserData(getCurrentUsername())
          if (res?.success && res.data?.topologyLayout) {
            data = res.data.topologyLayout
          }
        } catch (e) {
          // 忽略
        }
      }
      if (!data) {
        const raw = localStorage.getItem(storageKey())
        if (!raw) return false
        data = JSON.parse(raw)
      }
      if (data.positions) positions.value = data.positions
      if (data.edgeOverrides) edgeOverrides.value = data.edgeOverrides
      if (data.viewport) {
        viewport.x = data.viewport.x || 0
        viewport.y = data.viewport.y || 0
        viewport.zoom = data.viewport.zoom || 1
      }
      migrated.value = Boolean(data.migrated)
      return true
    } catch (e) {
      console.error('[TopologyLayout] 加载失败:', e)
      return false
    }
  }

  function clear() {
    positions.value = {}
    edgeOverrides.value = {}
    resetViewport()
    save()
  }

  return {
    positions, edgeOverrides, viewport, migrated,
    getPosition, setPosition, setFixed, hasPosition, prune,
    getEdgeOverride, setEdgeOverride,
    setViewport, resetViewport,
    snapshot, undo, redo, canUndo, canRedo,
    save, load, clear
  }
})
