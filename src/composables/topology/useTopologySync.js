/**
 * useTopologySync - 拓扑派生同步 composable
 *
 * 架构：派生式拓扑
 *  - 节点 = deviceStore.devices 派生（id = device.id）
 *  - 边   = portStateStore.getAllConnections() 派生（id = connection.id）
 *  - 坐标 = useTopologyLayoutStore（独立布局层）
 *
 * 同步机制：
 *  - 设备增删改 → watch(deviceStore.devices)（字符串脏检测，防抖）
 *  - 连线增删改 → 监听 window 'topology:connections-changed'（portState 已派发）
 *                 + watch(portStateStore.connections.length) 兜底（importAll/clearAll 路径）
 *
 * 纯函数（buildTopologyNodes / buildTopologyEdges）可独立单元测试。
 */
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useDeviceStore } from '@/stores'
import { usePortStateStore } from '@/stores/portState'
import { useTopologyLayoutStore } from '@/stores/topologyLayout'
import {
  normalizeDeviceType,
  resolveDeviceStatus,
  deriveLinkStatus,
  getDeviceTypeMeta,
  PERF
} from '@/constants/topology'

/* ==================== 纯函数区（可单测） ==================== */

/** 端口全键 'deviceId-portKey' → 短键 'portKey' */
export function portIdToShortKey(deviceId, fullPortId) {
  if (!fullPortId) return ''
  const prefix = deviceId + '-'
  return fullPortId.startsWith(prefix) ? fullPortId.slice(prefix.length) : fullPortId
}

/** 网格槽位分配：按设备类型层带，从中心向外找第一个空闲格 */
export function allocateSlot(device, positions, opts = {}) {
  const margin = opts.margin ?? 120
  const colGap = opts.colGap ?? 180
  const rowGap = opts.rowGap ?? 180
  const layerGap = opts.layerGap ?? 200
  const maxCols = opts.maxCols ?? 8
  const cardW = opts.cardW ?? 120
  const cardH = opts.cardH ?? 120

  const type = normalizeDeviceType(device?.type)
  const layer = getDeviceTypeMeta(type).layer
  const originY = layer * layerGap + margin

  const overlaps = (x, y) => {
    for (const pos of Object.values(positions)) {
      if (!pos) continue
      const px = pos.x ?? 0
      const py = pos.y ?? 0
      if (x < px + cardW && x + cardW > px && y < py + cardH && y + cardH > py) {
        return true
      }
    }
    return false
  }

  let col = 0
  let row = 0
  for (let i = 0; i < 200; i++) {
    const x = margin + col * colGap
    const y = originY + row * rowGap
    if (!overlaps(x, y)) return { x, y }
    col++
    if (col >= maxCols) {
      col = 0
      row++
    }
  }
  return { x: margin + Math.random() * 400, y: originY + Math.random() * 400 }
}

/**
 * 从设备列表派生拓扑节点。
 * @param {Array} devices deviceStore.devices
 * @param {Object} positions layout.positions { [deviceId]: {x,y,fixed} }
 * @param {Set<string>} activeAlertIds 告警设备 id 集合（可空）
 * @returns {Array} TopologyNode[]
 */
export function buildTopologyNodes(devices, positions = {}, activeAlertIds = null) {
  return devices.map((device) => {
    const pos = positions[device.id] || null
    const deviceType = normalizeDeviceType(device.type)
    let x = 0
    let y = 0
    let fixed = false
    if (pos) {
      x = pos.x
      y = pos.y
      fixed = Boolean(pos.fixed)
    }
    return {
      id: device.id,
      deviceId: device.id,
      deviceType,
      label: device.name || device.ip || '未命名设备',
      x,
      y,
      width: 120,
      height: 120,
      status: resolveDeviceStatus(device, activeAlertIds),
      ip: device.ip || '',
      vendor: device.vendor || '',
      model: device.model || '',
      uHeight: Number(device.u_height || device.uSize || 1),
      ports: [], // 装饰点用，不参与连线逻辑
      fixed,
      layerId: ''
    }
  })
}

/**
 * 从 portState 连接列表派生拓扑边。
 * @param {Array} connections portStateStore.getAllConnections() 平铺结构
 * @param {Object} layoutNodes 节点表 { [deviceId]: TopologyNode }（用于取状态）
 * @param {Object} edgeOverrides layout.edgeOverrides { [connectionId]: {router,label} }
 * @returns {Array} TopologyEdge[]
 */
export function buildTopologyEdges(connections, layoutNodes = {}, edgeOverrides = {}) {
  const result = []
  for (const conn of connections) {
    // 防御性过滤：孤儿连接（端口引用的设备不存在）跳过
    const nodeA = layoutNodes[conn.sourceDeviceId]
    const nodeB = layoutNodes[conn.targetDeviceId]
    if (!nodeA || !nodeB) {
      console.warn('[TopologySync] 跳过孤儿连接:', conn.id, conn.sourceDeviceId, conn.targetDeviceId)
      continue
    }
    const override = edgeOverrides[conn.id] || {}
    const linkStatus = deriveLinkStatus(nodeA.status, nodeB.status)
    result.push({
      id: conn.id,
      source: conn.sourceDeviceId,
      target: conn.targetDeviceId,
      sourcePort: portIdToShortKey(conn.sourceDeviceId, conn.sourcePortId),
      targetPort: portIdToShortKey(conn.targetDeviceId, conn.targetPortId),
      sourcePortNum: conn.sourcePortNum || '',
      targetPortNum: conn.targetPortNum || '',
      sourceDeviceName: conn.sourceDeviceName || nodeA.label,
      targetDeviceName: conn.targetDeviceName || nodeB.label,
      sourceModel: nodeA.model || '',
      targetModel: nodeB.model || '',
      sourceUHeight: nodeA.uHeight || 1,
      targetUHeight: nodeB.uHeight || 1,
      linkType: conn.isOptical ? 'fiber' : 'copper',
      status: linkStatus === 'down' ? 'down' : 'active',
      cableType: conn.cableType || (conn.isOptical ? '光纤' : '网线'),
      router: override.router || 'straight',
      label: override.label || conn.cableType || ''
    })
  }
  return result
}

/* ==================== 响应式同步 ==================== */

/**
 * 创建拓扑同步（在 TopologyView setup 中调用）。
 * @param {Object} opts
 * @param {Function} opts.onChange 派生数据变化回调（由 facade 注入）
 */
export function useTopologySync({ onChange } = {}) {
  const deviceStore = useDeviceStore()
  const portStateStore = usePortStateStore()
  const layoutStore = useTopologyLayoutStore()

  // 派生结果（响应式，供 facade / 渲染层读取）
  const nodes = ref([])
  const edges = ref([])
  // 告警设备 id 集合（可选接入 alertStore）
  const activeAlertIds = ref(null)

  // 防抖计时器
  let nodesTimer = null
  let edgesTimer = null
  let lastNodeSig = ''
  let lastMetaSig = ''
  let lastStatusSig = ''
  let lastEdgeCount = -1

  const PATCH_MS = PERF.PATCH_DEBOUNCE || 150

  // ---------- 同步函数 ----------
  function syncNodes() {
    const devices = deviceStore.devices || []
    const nodeTable = {}
    for (const d of devices) {
      nodeTable[d.id] = true
    }
    // 清理失效坐标
    layoutStore.prune(devices.map((d) => d.id))

    // 无布局记录的设备 → 分配网格槽位
    let needSave = false
    for (const d of devices) {
      if (!layoutStore.hasPosition(d.id)) {
        const slot = allocateSlot(d, layoutStore.positions)
        layoutStore.setPosition(d.id, slot.x, slot.y, false)
        needSave = true
      }
    }
    if (needSave) layoutStore.save()

    nodes.value = buildTopologyNodes(devices, layoutStore.positions, activeAlertIds.value)
    onChange?.({ type: 'nodes' })
  }

  function syncEdges() {
    const devices = deviceStore.devices || []
    const nodeTable = {}
    for (const n of nodes.value) nodeTable[n.id] = n
    const connections = portStateStore.getAllConnections() || []
    edges.value = buildTopologyEdges(connections, nodeTable, layoutStore.edgeOverrides)
    onChange?.({ type: 'edges' })
  }

  function syncAll() {
    syncNodes()
    syncEdges()
  }

  // ---------- 防抖包装 ----------
  function scheduleNodes() {
    clearTimeout(nodesTimer)
    nodesTimer = setTimeout(() => {
      syncNodes()
      syncEdges()
    }, PATCH_MS)
  }

  function scheduleEdges() {
    clearTimeout(edgesTimer)
    edgesTimer = setTimeout(() => {
      syncEdges()
    }, PATCH_MS)
  }

  // ---------- 设备 watchers（字符串脏检测，避免 deep watch 全量成本） ----------
  function watchDevices() {
    // 1) 设备增删：id 集合变化
    watch(
      () => (deviceStore.devices || []).map((d) => d.id).join('|'),
      (sig) => {
        if (sig === lastNodeSig) return
        lastNodeSig = sig
        scheduleNodes()
      },
      { immediate: true }
    )

    // 2) 元数据：名称/IP/厂商/型号/类型
    watch(
      () =>
        (deviceStore.devices || [])
          .map((d) => `${d.name}|${d.ip}|${d.vendor}|${d.model}|${d.type}`)
          .join('|'),
      (sig) => {
        if (sig === lastMetaSig) return
        lastMetaSig = sig
        scheduleNodes()
      },
      { immediate: true }
    )

    // 3) 状态：只刷 status，并触发边状态重派生
    watch(
      () => (deviceStore.devices || []).map((d) => d.status).join('|'),
      (sig) => {
        if (sig === lastStatusSig) return
        lastStatusSig = sig
        scheduleNodes()
      },
      { immediate: true }
    )
  }

  // ---------- 连线同步（事件 + watch 兜底） ----------
  function watchConnections() {
    const handler = () => scheduleEdges()
    onMounted(() => {
      syncEdges() // 首帧全量同步
      window.addEventListener('topology:connections-changed', handler)
      // 响应式兜底：覆盖 importAll/clearAll 等未派发事件的路径
      watch(
        () => (portStateStore.connections || []).length,
        (len) => {
          if (len === lastEdgeCount) return
          lastEdgeCount = len
          scheduleEdges()
        }
      )
    })
    onUnmounted(() => {
      clearTimeout(nodesTimer)
      clearTimeout(edgesTimer)
      window.removeEventListener('topology:connections-changed', handler)
    })
  }

  // 首次同步
  function init() {
    syncAll()
    watchDevices()
    watchConnections()
  }

  // 手动刷新（工具栏按钮）
  function refresh() {
    syncAll()
  }

  return {
    nodes,
    edges,
    activeAlertIds,
    syncNodes,
    syncEdges,
    syncAll,
    refresh,
    init
  }
}
