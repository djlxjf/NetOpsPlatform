/**
 * 端口显示名解析 —— 单一真源 (Single Source of Port Naming)
 *
 * 职责：
 * 1. 完整端口 key（deviceId-eth5）→ 短 key（eth5）
 * 2. 短 key → 标准端口名（与 portState.generateDevicePorts 的命名规则一致）：
 *    eth5 → GE0/0/5，sfp2 → SFP2，xfp1 → XFP1，
 *    patch-3 → 端口3，fiber-12 → 芯12，console → Console，mgmt → MGMT
 * 3. 设备 + 短 key → 当前显示名（自定义名 device.portNames[shortKey] 优先，其次标准名）
 *    配线架例外：备注名存于 portMap[portNum].portName（伪设备自身携带），
 *    resolvePortName 会自动兼容读取。
 * 4. findPatchItemById：配线架不在 deviceStore 中，需从机柜 patchItems 查找，
 *    用于解析连接对端为配线架时的备注名。
 *
 * 使用约束：
 * - connection 快照里的 portNum 只在连线/改名时写入，可能过期；
 *   悬停、编辑框等实时展示场景应调用本模块动态解析，不要直接读快照。
 */

/** 完整端口 key（deviceId-eth5）→ 短 key（eth5）；不匹配前缀则原样返回 */
export function getShortPortKey(fullPortKey, deviceId) {
  if (!fullPortKey) return ''
  if (deviceId && fullPortKey.startsWith(deviceId + '-')) {
    return fullPortKey.slice(deviceId.length + 1)
  }
  return fullPortKey
}

/** 短 key → 标准端口名（未命中规则时原样返回） */
export function standardPortName(shortKey) {
  if (!shortKey) return ''
  const s = String(shortKey)
  const ethMatch = s.match(/^eth(\d+)$/i)
  if (ethMatch) return 'GE0/0/' + parseInt(ethMatch[1], 10)
  const sfpMatch = s.match(/^sfp(\d+)$/i)
  if (sfpMatch) return 'SFP' + parseInt(sfpMatch[1], 10)
  const xfpMatch = s.match(/^xfp(\d+)$/i)
  if (xfpMatch) return 'XFP' + parseInt(xfpMatch[1], 10)
  const patchMatch = s.match(/^patch-(\d+)$/)
  if (patchMatch) return '端口' + parseInt(patchMatch[1], 10)
  const fiberMatch = s.match(/^fiber-(\d+)$/)
  if (fiberMatch) return '芯' + parseInt(fiberMatch[1], 10)
  if (/^console$/i.test(s)) return 'Console'
  if (/^mgmt$/i.test(s)) return 'MGMT'
  return s
}

/**
 * 配线架端口短 key → 备注名
 * 配线架的端口备注存于 portMap[portNum].portName（区别于普通设备的 portNames）
 * @param {Object|null} patchItem 配线架条目（cabinet.patchItems[] 或其伪设备，含 portMap）
 * @param {String} shortKey 端口短 key（patch-3）
 */
export function resolvePatchPortAlias(patchItem, shortKey) {
  if (!patchItem || !shortKey) return ''
  const m = String(shortKey).match(/^(?:patch|fiber)-(\d+)$/)
  if (!m) return ''
  const portMap = patchItem.portMap || {}
  const info = portMap[m[1]] || portMap[Number(m[1])] || patchItem.fiberMap?.[m[1]] || patchItem.fiberMap?.[Number(m[1])]
  const alias = info?.portName
  return alias && String(alias).trim() ? String(alias).trim() : ''
}

/**
 * 从机柜数组中查找配线设备条目（配线架/ODF 框等，不在 deviceStore 中）
 * @param {Array} cabinets 机柜数组（每项含 patchItems）
 * @param {String} deviceId 配线设备 ID
 */
export function findPatchItemById(cabinets, deviceId) {
  if (!cabinets || !deviceId) return null
  const idStr = String(deviceId)
  for (const cab of cabinets) {
    if (!cab) continue
    for (const item of cab.patchItems || []) {
      if (item && String(item.id) === idStr) return item
    }
  }
  return null
}

/**
 * 从机柜数组中查找设备/配线设备所在的机柜（slots 设备 + patchItems 配线设备）
 * 用于跨机柜连线判断与 tooltip 显示对端机柜名
 * @param {Array} cabinets 机柜数组（每项含 slots/patchItems）
 * @param {String} deviceId 设备或配线设备 ID
 * @returns {Object|null} 机柜对象（未找到返回 null）
 */
export function findCabinetOfDevice(cabinets, deviceId) {
  if (!cabinets || !deviceId) return null
  const idStr = String(deviceId)
  for (const cab of cabinets) {
    if (!cab) continue
    const slots = cab.slots || {}
    if (Object.values(slots).some(v => v != null && String(v) === idStr)) return cab
    for (const item of cab.patchItems || []) {
      if (item && String(item.id) === idStr) return cab
    }
  }
  return null
}

/**
 * 设备 + 短 key → 当前显示名
 * 优先级：设备自定义名 device.portNames[shortKey] > 配线架备注名 portMap[portNum].portName > 标准名 > 短 key
 * @param {Object|null} device 设备对象（可为 null；配线架伪设备亦兼容，含 portMap）
 * @param {String} shortKey 端口短 key（eth5 / patch-3 / fiber-12）
 */
export function resolvePortName(device, shortKey) {
  if (!shortKey) return ''
  const custom = device?.portNames?.[String(shortKey)]
  if (custom && String(custom).trim()) return String(custom).trim()
  // 配线架伪设备：备注名存于 portMap[portNum].portName
  const patchAlias = resolvePatchPortAlias(device, shortKey)
  if (patchAlias) return patchAlias
  return standardPortName(shortKey)
}

/**
 * 完整端口 key + 对端设备 → 当前显示名（一步到位）
 * @param {Object|null} device 对端设备对象
 * @param {String} fullPortKey 完整端口 key（deviceId-eth5）
 * @param {String} deviceId 对端设备 ID（用于剥离前缀）
 * @param {String} fallback 快照兜底值（旧 connection 里的 portNum）
 */
export function resolveRemotePortName(device, fullPortKey, deviceId, fallback) {
  const shortKey = getShortPortKey(fullPortKey, deviceId)
  const resolved = resolvePortName(device, shortKey)
  if (resolved && resolved !== shortKey) return resolved
  // 自定义名缺失且标准名无规则命中（如 custom 端口）时，用快照兜底
  if (fallback && String(fallback).trim()) return String(fallback).trim()
  return resolved || shortKey
}
