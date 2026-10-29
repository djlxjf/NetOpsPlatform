/**
 * derivedTopologyStore - 派生式拓扑 store facade
 *
 * 把「派生节点/边 + 布局 + 选中态」包装成 CanvasEngine 期望的 store 接口，
 * 使渲染引擎（CanvasEngine/NodeRenderer/EdgeRenderer/HitTest）零改动复用。
 *
 * 与 canvasTopology store 的关键差异：
 *  - nodes/edges 是派生结果（来自 useTopologySync），不可直接 add/remove；
 *  - undo/redo/copy/paste 在派生模型下无意义，全部置为 no-op（真正的撤销
 *    落在设备/连接操作层）；
 *  - 拖拽坐标写 useTopologyLayoutStore；
 *  - 连线创建/断开转发给 portStateStore.connectPorts/disconnectPorts。
 */
import { ref, computed, reactive } from 'vue'
import { useTopologyLayoutStore } from '@/stores/topologyLayout'
import { usePortStateStore } from '@/stores/portState'
import { useDeviceStore } from '@/stores'

export function createDerivedTopologyStore({ sync }) {
  const layoutStore = useTopologyLayoutStore()
  const portStateStore = usePortStateStore()
  const deviceStore = useDeviceStore()

  // 选中态（本 facade 自持，不落持久化）
  const selectedNodeIds = ref([])
  const selectedEdgeIds = ref([])

  const totalNodes = computed(() => sync.nodes.value.length)
  const totalEdges = computed(() => sync.edges.value.length)

  // ---------- 渲染数据 ----------
  const nodes = computed(() => sync.nodes.value)
  const edges = computed(() => sync.edges.value)
  const viewport = layoutStore.viewport

  // ---------- 查询 ----------
  function getNodeById(id) {
    return sync.nodes.value.find((n) => n.id === id) || null
  }

  function getEdgeById(id) {
    return sync.edges.value.find((e) => e.id === id) || null
  }

  // ---------- 选中 ----------
  function selectNode(id, add = false) {
    if (!add) selectedNodeIds.value = []
    if (!selectedNodeIds.value.includes(id)) selectedNodeIds.value.push(id)
    selectedEdgeIds.value = []
  }

  function selectEdge(id, add = false) {
    if (!add) selectedEdgeIds.value = []
    if (!selectedEdgeIds.value.includes(id)) selectedEdgeIds.value.push(id)
    selectedNodeIds.value = []
  }

  function clearSelection() {
    selectedNodeIds.value = []
    selectedEdgeIds.value = []
  }

  function selectAll() {
    selectedNodeIds.value = sync.nodes.value.map((n) => n.id)
    selectedEdgeIds.value = []
  }

  // ---------- 视口 ----------
  function setViewport(x, y, zoom) {
    layoutStore.setViewport(x, y, zoom)
  }

  function zoomIn() {
    layoutStore.setViewport(viewport.x, viewport.y, Math.min(4, viewport.zoom * 1.2))
  }

  function zoomOut() {
    layoutStore.setViewport(viewport.x, viewport.y, Math.max(0.1, viewport.zoom / 1.2))
  }

  function zoomToFit() {
    layoutStore.setViewport(0, 0, 1)
  }

  function resetViewport() {
    layoutStore.resetViewport()
  }

  // ---------- 布局（拖拽写 layout store） ----------
  function setNodePosition(deviceId, x, y, fixed = true) {
    layoutStore.setPosition(deviceId, x, y, fixed)
    layoutStore.save()
  }

  // ---------- 数据操作（派生模型下均为 no-op / 转发） ----------
  // undo/redo：派生数据无法"撤销一次派生"，废弃
  function undo() {}
  function redo() {}
  // 剪贴板：派生节点/边不允许复制粘贴
  function copySelection() {}
  function pasteClipboard() {}
  // 直接增删节点/边：禁止（走设备管理/机柜管理）
  function addNode() { console.warn('[Topology] 派生式拓扑禁止手动添加节点，请在设备管理中操作') }
  function removeNode() {}
  function removeSelectedNodes() {
    // Delete 删除节点 = 删除设备（带确认在 InteractionManager 层做）
    // 这里只清除选中
    selectedNodeIds.value = []
  }
  function addEdge() { console.warn('[Topology] 派生式拓扑禁止手动添加连线，请在机柜/设备管理中连接端口') }
  function removeEdge() {}
  function removeSelectedEdges() {
    selectedEdgeIds.value = []
  }
  function updateNode() {}
  function updateEdge() {}

  // ---------- 持久化（布局由 layout store 自持） ----------
  function save() {
    layoutStore.save()
  }

  function load() {
    return layoutStore.load()
  }

  // ---------- 连接操作转发（画布拖拽连线 → portState） ----------
  function connectPorts(portA, portB, cableType) {
    return portStateStore.connectPorts(portA, portB, cableType)
  }

  function disconnectConnection(connectionId) {
    return portStateStore.disconnectPorts(connectionId)
  }

  function updateConnectionCable(connectionId, cableType) {
    return portStateStore.updateCableType(connectionId, cableType)
  }

  // ---------- 设备删除（Delete 键删除节点 = 删设备） ----------
  function deleteDevice(deviceId) {
    return deviceStore.deleteDevice(deviceId)
  }

  // 用 reactive 包裹，使顶层 ref/computed 像 Pinia store 一样自动解包，
  // 渲染引擎与组件才能以「普通数组/值」的方式访问 selectedNodeIds / nodes 等。
  // 否则暴露的是 ref 对象，会导致 selectedEdgeIds is not iterable 等运行时错误。
  return reactive({
    // 状态
    nodes, edges, viewport,
    selectedNodeIds, selectedEdgeIds,
    // 计算属性
    totalNodes, totalEdges,
    // 查询
    getNodeById, getEdgeById,
    // 选中
    selectNode, selectEdge, clearSelection, selectAll,
    // 视口
    setViewport, zoomIn, zoomOut, zoomToFit, resetViewport,
    // 布局
    setNodePosition,
    // 数据操作（no-op / 转发）
    undo, redo, copySelection, pasteClipboard,
    addNode, removeNode, removeSelectedNodes,
    addEdge, removeEdge, removeSelectedEdges,
    updateNode, updateEdge,
    // 持久化
    save, load,
    // 连接转发
    connectPorts, disconnectConnection, updateConnectionCable,
    // 设备删除
    deleteDevice
  })
}
