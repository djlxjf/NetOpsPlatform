/**
 * 设备分类工具 - 全站统一的网络设备判定逻辑
 * 被 DashboardView、DevicesView 等共用，避免各处硬编码不一致
 */

// 网络设备关键词（含安防/服务器/存储/UPS）
const NETWORK_DEVICE_KEYWORDS = [
  'switch', 'router', 'firewall', 'wireless', 'loadbalancer', 'gateway',
  'server', '交换机', '路由器', '防火墙', '无线', '负载均衡', '网关',
  '服务器', '安全准入', '安全隔离', '密码管理', '威胁防御', '网闸',
  'vpn', '网御', 'ups', 'storage', '存储', 'ups电源'
]

// 监控类关键词（排除项）
const MONITOR_KEYWORDS = [
  'camera', '摄像头', 'ipc', 'nvr', 'dvr', 'dvs', 'video', 'encoder', 'decoder'
]

/**
 * 判断设备是否为网络设备（排除摄像头/NVR/监控类）
 * @param {Object} device - 设备对象，含 type/name/model 字段
 * @returns {boolean}
 */
export function isNetworkDevice(device) {
  if (!device) return false
  const type = (device.type || '').toLowerCase()
  const name = (device.name || '').toLowerCase()
  const model = (device.model || '').toLowerCase()

  // 排除监控类
  const isMonitor = MONITOR_KEYWORDS.some(kw =>
    type.includes(kw) || name.includes(kw) || model.includes(kw)
  )
  if (isMonitor) return false

  return NETWORK_DEVICE_KEYWORDS.some(kw =>
    type.includes(kw) || name.includes(kw) || model.includes(kw)
  )
}

export { NETWORK_DEVICE_KEYWORDS, MONITOR_KEYWORDS }
