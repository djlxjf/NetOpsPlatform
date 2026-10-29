/**
 * NOC 监控大屏主题配置 v5.0
 * 纯 Canvas 版
 */

export const NOC_THEME = {
  // 画布
  canvasBg: '#0a0e27',
  gridColor: '#1e293b',
  gridDotColor: '#334155',

  // 设备节点
  nodeBg: 'rgba(15, 23, 42, 0.9)',
  nodeBorder: '#1e3a5f',
  nodeBorderHover: '#22d3ee',
  nodeBorderSelected: '#22d3ee',
  nodeLabel: '#e2e8f0',
  nodeSubLabel: '#94a3b8',
  nodeIp: '#22d3ee',

  // 节点尺寸
  nodeWidth: 120,
  nodeHeight: 120,
  nodeRadius: 8,

  // 状态指示灯
  status: {
    online:  { color: '#34d399', glow: '0 0 8px #34d399' },
    offline: { color: '#f87171', glow: '0 0 8px #f87171' },
    warning: { color: '#f59e0b', glow: '0 0 8px #f59e0b' },
    error:   { color: '#ef4444', glow: '0 0 8px #ef4444' },
    unknown: { color: '#94a3b8', glow: 'none' }
  },

  // 连线
  edge: {
    copper:  { stroke: '#64748b', glow: 'none' },
    fiber:   { stroke: '#a855f7', glow: '0 0 4px #a855f7' },
    down:    { stroke: '#ef4444', glow: '0 0 4px #ef4444' },
    default: { stroke: '#64748b', glow: 'none' }
  },

  // 端口标签
  portLabelA: { fill: '#3b82f6', bg: 'rgba(59,130,246,0.2)' },
  portLabelB: { fill: '#ec4899', bg: 'rgba(236,72,153,0.2)' },
  cableLabel: { fill: '#e2e8f0', bg: 'rgba(15,23,42,0.8)' },

  // 选中高亮
  selection: '#22d3ee',
  hover: '#3b82f6',

  // 网格
  gridSize: 20,
  gridDotRadius: 1.5,

  // 缩放范围
  minZoom: 0.1,
  maxZoom: 4,

  // 端口
  portRadius: 4,
  portHitRadius: 8
}

export function getStatusStyle(status) {
  return NOC_THEME.status[status] || NOC_THEME.status.unknown
}

export function getEdgeStyle(linkType, status) {
  if (status === 'down') return NOC_THEME.edge.down
  return NOC_THEME.edge[linkType] || NOC_THEME.edge.default
}