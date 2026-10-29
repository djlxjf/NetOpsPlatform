/**
 * 全局端口状态管理器 (Global Port State Manager)
 * 
 * 核心职责：
 * 1. 统一管理所有设备的端口状态和连接关系
 * 2. 强制执行端口类型隔离、线缆类型匹配、双向占用互斥
 * 3. 任何界面的端口操作都通过此管理器执行
 * 4. 三个界面（机柜管理、设备管理、网络拓扑）共享同一数据源
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// 避免循环依赖，直接从 localStorage 获取当前用户名
function getCurrentUsername() {
  try {
    const user = JSON.parse(localStorage.getItem('netops_user') || 'null')
    return user?.username || 'default'
  } catch {
    return 'default'
  }
}

// 线缆选项定义
const ETHERNET_CABLES = [
  '超五类网线', '六类网线', '六A类网线', '七类网线'
]

const OPTICAL_CABLES = [
  'LC单模光纤', 'LC多模光纤', 'SC单模光纤', 'SC多模光纤',
  'FC单模光纤', 'FC多模光纤', 'ST单模光纤', 'ST多模光纤'
]

// 生成唯一端口ID
function makePortId(deviceId, portKey) {
  return deviceId + '-' + portKey
}

// 生成连接ID
export function makeConnectionId(portAId, portBId) {
  // 按字母顺序排序确保双向连接得到相同ID
  return [portAId, portBId].sort().join('<=>')
}

export const usePortStateStore = defineStore('portState', () => {
  function getStorageKey() {
    return 'netops_port_connections_' + getCurrentUsername()
  }

  // ==================== 核心数据 ====================
  // connections: 连接关系数组 { id, portA: { deviceId, portId, deviceName, portNum }, portB: {...}, cableType, createdAt }
  const connections = ref(JSON.parse(localStorage.getItem(getStorageKey()) || '[]'))

  // 设备端口定义缓存 { deviceId: [{ id, portNumber, portType, name }] }
  const devicePortCache = ref({})

  function save() {
    const key = getStorageKey()
    const username = getCurrentUsername()
    const plain = JSON.parse(JSON.stringify(connections.value))
    try {
      localStorage.setItem(key, JSON.stringify(plain))
    } catch (e) {
      console.error('保存端口连接到localStorage失败', e)
    }
    if (window.electronAPI) {
      window.electronAPI.dbSaveUserData(username, 'portConnections', plain).catch(e =>
        console.error('保存端口连接失败', e)
      )
    }
  }

  // ==================== 拓扑图自动同步 ====================
  // 端口连接变化时，通知新版拓扑视图刷新（防抖，避免批量操作时频繁刷新）
  // 注意：新版拓扑的节点派生自 deviceStore.devices、连线派生自 portStateStore，
  // 因此拓扑视图会自动响应，无需再反向写入旧 topology store（那段 sync 是 split-brain 来源，已删除）。
  let syncTopologyTimer = null
  function notifyTopologySync() {
    if (syncTopologyTimer) clearTimeout(syncTopologyTimer)
    syncTopologyTimer = setTimeout(() => {
      // 发送全局事件，通知新版拓扑视图同步连线
      window.dispatchEvent(new CustomEvent('topology:connections-changed'))
    }, 300)
  }

  // ==================== 端口状态查询 ====================
  // 获取指定端口的状态
  function getPortStatus(deviceId, portId) {
    const portKey = makePortId(deviceId, portId)
    return connections.value.some(c =>
      c.portA.portId === portKey || c.portB.portId === portKey
    ) ? 'occupied' : 'available'
  }

  // 检查端口是否被占用
  function isPortOccupied(deviceId, portId) {
    return getPortStatus(deviceId, portId) === 'occupied'
  }

  // 获取端口的连接信息（对端设备、端口、线缆）
  function getPortConnection(deviceId, portId) {
    const portKey = makePortId(deviceId, portId)
    const conn = connections.value.find(c =>
      c.portA.portId === portKey || c.portB.portId === portKey
    )
    if (!conn) return null

    const isA = conn.portA.portId === portKey
    const remote = isA ? conn.portB : conn.portA
    return {
      connectionId: conn.id,
      remoteDeviceId: remote.deviceId,
      remoteDeviceName: remote.deviceName,
      remotePortId: remote.portId,
      remotePortNum: remote.portNum,
      cableType: conn.cableType,
      createdAt: conn.createdAt
    }
  }

  // 获取设备上所有已占用端口
  function getOccupiedPorts(deviceId) {
    const occupied = []
    connections.value.forEach(c => {
      if (c.portA.deviceId === deviceId) {
        occupied.push({ portId: c.portA.portId, ...getPortConnection(deviceId, c.portA.portId) })
      }
      if (c.portB.deviceId === deviceId) {
        occupied.push({ portId: c.portB.portId, ...getPortConnection(deviceId, c.portB.portId) })
      }
    })
    return occupied
  }

  // ==================== 端口类型推断 ====================
  // 根据端口键推断端口类型
  function inferPortType(portId) {
    if (!portId) return 'ethernet'
    const lower = portId.toLowerCase()
    // SFP/XFP/光口
    if (lower.startsWith('sfp') || lower.startsWith('xfp') || lower.startsWith('optical')) {
      return 'optical'
    }
    // 默认网口
    return 'ethernet'
  }

  // ==================== 可用端口查询 ====================
  // 获取所有设备中可用的端口（按类型过滤）
  function getAvailablePorts(portType, excludeDeviceId, excludePortId, allDevices, patchPorts) {
    const result = []
    const excludeKey = excludeDeviceId && excludePortId ? makePortId(excludeDeviceId, excludePortId) : null

    // 从设备获取端口
    if (allDevices) {
      allDevices.forEach(device => {
        const ports = devicePortCache.value[device.id] || generateDevicePorts(device)
        devicePortCache.value[device.id] = ports

        ports.forEach(port => {
          // 类型必须匹配
          if (port.portType !== portType) return
          const fullId = makePortId(device.id, port.id)
          // 排除本设备所有端口
          if (device.id === excludeDeviceId) return
          // 已占用不可选
          if (isPortOccupied(device.id, port.id)) return

          result.push({
            portId: fullId,
            deviceId: device.id,
            deviceName: device.name || device.ip || '未知设备',
            portNumber: port.portNumber,
            portName: port.name || port.id,
            portType: port.portType,
            displayLabel: (device.name || device.ip || '未知设备') + ' - ' + (port.name || port.id)
          })
        })
      })
    }

    // 从配线架端口获取（配线架端口始终为 ethernet 类型）
    if (patchPorts && portType === 'ethernet') {
      patchPorts.forEach(pp => {
        const shortId = 'patch-' + pp.portNum
        const fullKey = makePortId(pp.panelId, shortId)
        // excludeKey 是 makePortId(excludeDeviceId, excludePortId)
        // 支持 excludePortId 为短格式（patch-1）或完整 key（deviceId-patch-1）
        if (excludeKey) {
          if (fullKey === excludeKey) return
          if (excludePortId === shortId && pp.panelId === excludeDeviceId) return
        }
        if (isPortOccupied(pp.panelId, shortId)) return

        result.push({
          portId: shortId,
          deviceId: pp.panelId,
          deviceName: pp.panelName || '配线架',
          portNumber: pp.portNum,
          portName: '端口' + pp.portNum,
          portType: 'ethernet',
          displayLabel: (pp.panelName || '配线架') + ' - 端口' + pp.portNum,
          isPatchPort: true
        })
      })
    }

    return result
  }

  // 为设备生成标准端口列表（可传入deviceLibStore用于获取型号端口信息）
  function generateDevicePorts(device, deviceLibStore) {
    if (!device) return []
    const ports = []

    let model = null
    if (deviceLibStore) {
      model = deviceLibStore.models?.find(m => m.name === device.model)
    }

    const ethCount = model?.ethernetPorts || (device.type === 'switch' ? 24 : (device.type === 'router' ? 8 : 0))
    const sfpCount = model?.sfpPorts || 0

    for (let i = 1; i <= ethCount; i++) {
      const portId = 'eth' + i
      const portName = 'GE0/0/' + i
      const customName = device.portNames?.[portId] || null
      ports.push({
        id: portId,
        portNumber: i,
        portType: 'ethernet',
        name: customName || portName,
        status: isPortOccupied(device.id, portId) ? 'occupied' : 'available'
      })
    }

    for (let i = 1; i <= sfpCount; i++) {
      const portId = 'sfp' + i
      const portName = 'SFP' + i
      const customName = device.portNames?.[portId] || null
      ports.push({
        id: portId,
        portNumber: ethCount + i,
        portType: 'optical',
        name: customName || portName,
        status: isPortOccupied(device.id, portId) ? 'occupied' : 'available'
      })
    }

    // 如果没有型号信息，生成默认端口
    if (ports.length === 0) {
      for (let i = 1; i <= 24; i++) {
        ports.push({
          id: 'eth' + i,
          portNumber: i,
          portType: 'ethernet',
          name: 'GE0/0/' + i,
          status: isPortOccupied(device.id, 'eth' + i) ? 'occupied' : 'available'
        })
      }
      for (let i = 1; i <= 4; i++) {
        ports.push({
          id: 'sfp' + i,
          portNumber: 24 + i,
          portType: 'optical',
          name: 'SFP' + i,
          status: isPortOccupied(device.id, 'sfp' + i) ? 'occupied' : 'available'
        })
      }
    }

    // 合并自定义端口（端口增删改功能）
    if (device.customPorts && Array.isArray(device.customPorts)) {
      device.customPorts.forEach(p => {
        const portId = p.id
        // 避免重复添加（标准端口可能已经生成了同 ID 的端口）
        if (!ports.find(existing => existing.id === portId)) {
          ports.push({
            id: portId,
            portNumber: p.portNumber || ports.length + 1,
            portType: p.portType || 'ethernet',
            name: device.portNames?.[portId] || p.name || portId,
            status: isPortOccupied(device.id, portId) ? 'occupied' : 'available'
          })
        }
      })
    }

    return ports
  }

  // 获取设备的端口列表（从缓存或生成）
  function getDevicePorts(device) {
    if (!device) return []
    if (!devicePortCache.value[device.id]) {
      devicePortCache.value[device.id] = generateDevicePorts(device)
    }
    // 刷新状态
    const ports = devicePortCache.value[device.id]
    ports.forEach(p => {
      p.status = isPortOccupied(device.id, p.id) ? 'occupied' : 'available'
    })
    return ports
  }

  // 清除设备端口缓存（设备信息变更后调用）
  function clearDevicePortCache(deviceId) {
    if (deviceId) {
      delete devicePortCache.value[deviceId]
    } else {
      devicePortCache.value = {}
    }
  }

  // ==================== 连接操作 ====================
  /**
   * 创建端口连接
   * @param {Object} portA - { deviceId, portId, deviceName, portNum, portType }
   * @param {Object} portB - { deviceId, portId, deviceName, portNum, portType }
   * @param {String} cableType - 线缆类型
   * @returns {Object} { success, message, connection }
   */
  function connectPorts(portA, portB, cableType) {
    // 1. 校验参数
    if (!portA || !portB) return { success: false, message: '端口信息不完整' }
    if (!portA.deviceId || !portA.portId || !portB.deviceId || !portB.portId) {
      return { success: false, message: '端口信息不完整' }
    }
    if (!cableType) return { success: false, message: '请选择线缆类型' }

    // 2. 端口类型隔离检查
    const typeA = portA.portType || inferPortType(portA.portId)
    const typeB = portB.portType || inferPortType(portB.portId)
    if (typeA !== typeB) {
      return { success: false, message: '网口不能与光口连接！端口类型必须一致' }
    }

    // 3. 线缆类型匹配检查
    if (typeA === 'ethernet') {
      if (!ETHERNET_CABLES.includes(cableType)) {
        return { success: false, message: '网口只能选择网线类型：超五类网线、六类网线、六A类网线、七类网线' }
      }
    } else if (typeA === 'optical') {
      if (!OPTICAL_CABLES.includes(cableType)) {
        return { success: false, message: '光口只能选择光纤类型' }
      }
    }

    // 4. 冲突检查
    const portAKey = makePortId(portA.deviceId, portA.portId)
    const portBKey = makePortId(portB.deviceId, portB.portId)

    if (portAKey === portBKey) {
      return { success: false, message: '不能将端口连接到自身' }
    }
    if (portA.deviceId === portB.deviceId) {
      return { success: false, message: '不能连接同一设备的两个端口（设备内部端口）' }
    }

    if (isPortOccupied(portA.deviceId, portA.portId)) {
      return { success: false, message: '本端端口已被占用' }
    }
    if (isPortOccupied(portB.deviceId, portB.portId)) {
      return { success: false, message: '目标端口已被占用' }
    }

    // 5. 创建连接
    const connection = {
      id: makeConnectionId(portAKey, portBKey),
      portA: {
        deviceId: portA.deviceId,
        portId: portAKey,
        deviceName: portA.deviceName || '',
        portNum: portA.portNum || portA.portId,
        portType: typeA
      },
      portB: {
        deviceId: portB.deviceId,
        portId: portBKey,
        deviceName: portB.deviceName || '',
        portNum: portB.portNum || portB.portId,
        portType: typeB
      },
      cableType: cableType,
      createdAt: new Date().toISOString()
    }

    connections.value.push(connection)
    save()

    // 清除相关设备的端口缓存
    clearDevicePortCache(portA.deviceId)
    clearDevicePortCache(portB.deviceId)

    // 自动同步到网络拓扑图
    notifyTopologySync()

    return { success: true, message: '连接创建成功', connection }
  }

  /**
   * 底层写入方法（仅用于一次性旧拓扑连接迁移的批量灌入）
   * 直接写入 connections，跳过 connectPorts 的端口占用/类型校验，
   * 也不触发 notifyTopologySync（避免批量迁移时疯狂触发同步）。
   * 迁移结束后由迁移 composable 统一派发一次 topology:connections-changed 事件。
   * @param {Object} conn - 完整连接对象 { id, portA, portB, cableType, createdAt }
   */
  function addConnectionRaw(conn) {
    if (!conn || !conn.portA || !conn.portB) return
    connections.value.push(conn)
    save()
    if (conn.portA.deviceId) clearDevicePortCache(conn.portA.deviceId)
    if (conn.portB.deviceId) clearDevicePortCache(conn.portB.deviceId)
  }

  /**
   * 断开端口连接
   * @param {String} connectionId - 连接ID
   * @returns {Object} { success, message }
   */
  function disconnectPorts(connectionId) {
    const idx = connections.value.findIndex(c => c.id === connectionId)
    if (idx < 0) return { success: false, message: '连接不存在' }

    const conn = connections.value[idx]
    const deviceAId = conn.portA.deviceId
    const deviceBId = conn.portB.deviceId

    connections.value.splice(idx, 1)
    save()

    // 清除相关设备的端口缓存
    clearDevicePortCache(deviceAId)
    clearDevicePortCache(deviceBId)

    // 自动同步到网络拓扑图
    notifyTopologySync()

    return { success: true, message: '连接已断开', disconnected: conn }
  }

  /**
   * 断开指定端口的所有连接
   */
  function disconnectDevicePort(deviceId, portId) {
    const portKey = makePortId(deviceId, portId)
    const conn = connections.value.find(c =>
      c.portA.portId === portKey || c.portB.portId === portKey
    )
    if (!conn) return { success: false, message: '该端口未连接' }
    return disconnectPorts(conn.id)
  }

  // ==================== 线缆类型修改 ====================
  /**
   * 修改连接的线缆类型
   * @param {String} connectionId - 连接ID
   * @param {String} newCableType - 新线缆类型
   * @returns {Object} { success, message }
   */
  function updateCableType(connectionId, newCableType) {
    const conn = connections.value.find(c => c.id === connectionId)
    if (!conn) return { success: false, message: '连接不存在' }

    const portType = conn.portA.portType || 'ethernet'
    if (portType === 'ethernet' && !ETHERNET_CABLES.includes(newCableType)) {
      return { success: false, message: '网口只能选择网线类型：' + ETHERNET_CABLES.join('、') }
    }
    if (portType === 'optical' && !OPTICAL_CABLES.includes(newCableType)) {
      return { success: false, message: '光口只能选择光纤类型：' + OPTICAL_CABLES.join('、') }
    }

    conn.cableType = newCableType
    save()
    // 自动同步到网络拓扑图（线缆类型影响边的显示样式）
    notifyTopologySync()
    return { success: true, message: '线缆类型已更新' }
  }

  // =================== 自定义端口管理 ====================
  /**
   * 给设备添加自定义端口
   * @param {String} deviceId - 设备ID
   * @param {Object} port - { portType: 'ethernet'|'optical', name: '端口名称' }
   * @param {Object} deviceStore - 设备 store 实例
   * @returns {Object} { success, message, portId }
   */
  function addPort(deviceId, port, deviceStore) {
    if (!deviceStore) return { success: false, message: '缺少 deviceStore' }
    const device = deviceStore.devices.find(d => d.id === deviceId)
    if (!device) return { success: false, message: '设备不存在' }

    if (!device.customPorts) device.customPorts = []

    // 生成唯一 portId
    const existingIds = device.customPorts.map(p => p.id)
    let idx = 1
    while (existingIds.includes('custom' + idx)) idx++
    const portId = 'custom' + idx

    const portNumber = device.customPorts.length + 1
    device.customPorts.push({
      id: portId,
      portNumber: portNumber,
      portType: port.portType || 'ethernet',
      name: port.name || portId
    })

    clearDevicePortCache(deviceId)
    deviceStore.saveDevices()
    return { success: true, message: '端口已添加', portId }
  }

  /**
   * 删除设备的自定义端口
   * @param {String} deviceId - 设备ID
   * @param {String} portId - 端口ID
   * @param {Object} deviceStore - 设备 store 实例
   * @returns {Object} { success, message }
   */
  function removePort(deviceId, portId, deviceStore) {
    if (!deviceStore) return { success: false, message: '缺少 deviceStore' }
    const device = deviceStore.devices.find(d => d.id === deviceId)
    if (!device) return { success: false, message: '设备不存在' }

    if (!device.customPorts) return { success: false, message: '该端口不是自定义端口' }

    const idx = device.customPorts.findIndex(p => p.id === portId)
    if (idx < 0) return { success: false, message: '端口不存在' }

    // 如果端口已连接，先断开
    const conn = connections.value.find(c =>
      c.portA.portId === makePortId(deviceId, portId) ||
      c.portB.portId === makePortId(deviceId, portId)
    )
    if (conn) {
      disconnectPorts(conn.id)
    }

    device.customPorts.splice(idx, 1)
    clearDevicePortCache(deviceId)
    deviceStore.saveDevices()
    return { success: true, message: '端口已删除' }
  }

  /**
   * 修改端口名称（支持所有端口，包括标准端口和自定义端口）
   * @param {String} deviceId - 设备ID
   * @param {String} portId - 端口ID
   * @param {String} newName - 新名称
   * @param {Object} deviceStore - 设备 store 实例
   * @returns {Object} { success, message }
   */
  function renamePort(deviceId, portId, newName, deviceStore) {
    if (!deviceStore) return { success: false, message: '缺少 deviceStore' }
    const device = deviceStore.devices.find(d => d.id === deviceId)
    if (!device) return { success: false, message: '设备不存在' }

    if (!device.portNames) device.portNames = {}
    device.portNames[portId] = newName

    clearDevicePortCache(deviceId)
    deviceStore.saveDevices()
    // 同步更新连接快照中的端口名，保证所有界面（悬停/连线信息/拓扑）立即显示新名
    syncPortNameToConnections(deviceId, portId, newName)
    return { success: true, message: '端口名称已更新' }
  }

  /**
   * 端口改名后，同步更新连接快照中的端口名（portNum）
   * 连接创建时会保存 portNum 快照，若不同步，悬停/连线编辑框会一直显示旧名。
   * @param {String} deviceId - 设备ID
   * @param {String} portId - 端口短 key（eth1 / patch-3 / fiber-12）
   * @param {String} newName - 新端口显示名
   * @returns {Object} { success, changed }
   */
  function syncPortNameToConnections(deviceId, portId, newName) {
    if (!deviceId || !portId || !newName) return { success: false, changed: false }
    const portKey = makePortId(deviceId, portId)
    let changed = false
    connections.value.forEach(c => {
      if (c.portA && c.portA.portId === portKey && c.portA.portNum !== newName) {
        c.portA.portNum = newName
        changed = true
      }
      if (c.portB && c.portB.portId === portKey && c.portB.portNum !== newName) {
        c.portB.portNum = newName
        changed = true
      }
    })
    if (changed) {
      save()
      clearDevicePortCache(deviceId)
    }
    return { success: true, changed }
  }

  /**
   * 设备改名后，同步更新连接快照中的设备名（deviceName）
   * 连接创建时会保存 deviceName 快照，若不同步，设备管理连接详情弹窗、
   * 机柜悬停 tooltip 等直接读取快照的界面会一直显示旧设备名。
   * @param {String} deviceId - 设备ID（网络设备或配线设备）
   * @param {String} newName - 新设备名
   * @returns {Object} { success, changed }
   */
  function syncDeviceNameToConnections(deviceId, newName) {
    if (!deviceId || !newName) return { success: false, changed: false }
    const idStr = String(deviceId)
    let changed = false
    connections.value.forEach(c => {
      if (c.portA && String(c.portA.deviceId) === idStr && c.portA.deviceName !== newName) {
        c.portA.deviceName = newName
        changed = true
      }
      if (c.portB && String(c.portB.deviceId) === idStr && c.portB.deviceName !== newName) {
        c.portB.deviceName = newName
        changed = true
      }
    })
    if (changed) {
      save()
      clearDevicePortCache(deviceId)
      // 通知拓扑刷新（边标签/属性面板可能引用连接快照）
      notifyTopologySync()
    }
    return { success: true, changed }
  }

  /**
   * 修复历史连接快照中的端口名（存量数据迁移）
   * 旧版本连线时 portNum 存的是数字端口号（如 5），本方法按当前
   * 设备自定义名/标准命名规则重写所有连接的 portNum 快照。
   * @param {Array} allDevices - deviceStore.devices
   * @returns {Object} { repaired, total }
   */
  function repairConnectionPortNames(allDevices) {
    if (!Array.isArray(allDevices)) return { repaired: 0, total: connections.value.length }
    let repaired = 0
    connections.value.forEach(c => {
      const devA = allDevices.find(d => String(d.id) === String(c.portA?.deviceId))
      const devB = allDevices.find(d => String(d.id) === String(c.portB?.deviceId))
      // A 端：短 key 从完整 key 剥离
      if (c.portA) {
        const shortA = c.portA.deviceId && c.portA.portId && c.portA.portId.startsWith(c.portA.deviceId + '-')
          ? c.portA.portId.slice(c.portA.deviceId.length + 1)
          : c.portA.portId
        const nameA = resolveSnapshotPortName(devA, shortA, c.portA.portNum)
        if (nameA && c.portA.portNum !== nameA) { c.portA.portNum = nameA; repaired++ }
      }
      if (c.portB) {
        const shortB = c.portB.deviceId && c.portB.portId && c.portB.portId.startsWith(c.portB.deviceId + '-')
          ? c.portB.portId.slice(c.portB.deviceId.length + 1)
          : c.portB.portId
        const nameB = resolveSnapshotPortName(devB, shortB, c.portB.portNum)
        if (nameB && c.portB.portNum !== nameB) { c.portB.portNum = nameB; repaired++ }
      }
    })
    if (repaired > 0) {
      save()
      clearDevicePortCache()
    }
    return { repaired, total: connections.value.length }
  }

  // 快照端口名解析（内联轻量实现，避免 store 层反向依赖 utils 循环引用；
  // 规则与 src/utils/portNaming.js 保持一致）
  function resolveSnapshotPortName(device, shortKey, fallback) {
    if (!shortKey) return fallback || ''
    const custom = device?.portNames?.[String(shortKey)]
    if (custom && String(custom).trim()) return String(custom).trim()
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
    // 无规则命中（如 custom 端口）：保留原快照
    return fallback && String(fallback).trim() ? String(fallback) : s
  }

  // ==================== 拓扑连接同步 ====================
  // 从拓扑边自动同步到端口状态管理器
  function syncFromTopology(edges, nodes, deviceStore) {
    if (!edges || !Array.isArray(edges)) return

    edges.forEach(edge => {
      // 提取deviceId
      const sourceNode = nodes?.find(n => n.id === edge.source)
      const targetNode = nodes?.find(n => n.id === edge.target)
      if (!sourceNode || !targetNode) return

      const sourceDeviceId = sourceNode.deviceId || sourceNode.id.replace('node_', '')
      const targetDeviceId = targetNode.deviceId || targetNode.id.replace('node_', '')

      if (!sourceDeviceId || !targetDeviceId) return

      const sourcePort = edge.sourcePort || ''
      const targetPort = edge.targetPort || ''

      if (!sourcePort || !targetPort) return

      // 确定端口类型
      const portTypeA = edge.linkType === 'fiber' ? 'optical' : 'ethernet'
      const cableType = edge.cableType || (edge.linkType === 'fiber' ? 'LC单模光纤' : '超五类网线')

      // 获取设备名称
      const srcDevice = deviceStore?.devices?.find(d => d.id === sourceDeviceId)
      const tgtDevice = deviceStore?.devices?.find(d => d.id === targetDeviceId)

      const srcDeviceName = srcDevice?.name || sourceNode.label || ''
      const tgtDeviceName = tgtDevice?.name || targetNode.label || ''

      // 推断端口键
      const srcPortId = inferPortId(sourcePort)
      const tgtPortId = inferPortId(targetPort)

      const portA = {
        deviceId: sourceDeviceId,
        portId: srcPortId,
        deviceName: srcDeviceName,
        portNum: sourcePort,
        portType: portTypeA
      }

      const portB = {
        deviceId: targetDeviceId,
        portId: tgtPortId,
        deviceName: tgtDeviceName,
        portNum: targetPort,
        portType: portTypeA
      }

      connectPorts(portA, portB, cableType)
    })
  }

  // 将端口号转换为端口ID
  function inferPortId(portName) {
    if (!portName) return ''
    // GE0/0/1 -> eth1, SFP1 -> sfp1
    const geMatch = portName.match(/^GE0\/0\/(\d+)$/i)
    if (geMatch) return 'eth' + geMatch[1]

    const sfpMatch = portName.match(/^SFP(\d+)$/i)
    if (sfpMatch) return 'sfp' + sfpMatch[1]

    const xfpMatch = portName.match(/^XFP(\d+)$/i)
    if (xfpMatch) return 'xfp' + xfpMatch[1]

    // ethN 格式
    const ethMatch = portName.match(/^eth(\d+)$/i)
    if (ethMatch) return 'eth' + ethMatch[1]

    // 配线架端口
    const patchMatch = portName.match(/patch[_-](\d+)/i)
    if (patchMatch) return 'patch-' + patchMatch[1]

    return portName
  }

  // 获取所有端口状态（用于统计）
  function getAllPortStates() {
    const states = []
    // 遍历所有连接，标记被占用的端口
    connections.value.forEach(c => {
      states.push({
        id: c.portA.portId,
        deviceId: c.portA.deviceId,
        portNum: c.portA.portNum,
        isUp: true,
        portType: c.portA.portType
      })
      states.push({
        id: c.portB.portId,
        deviceId: c.portB.deviceId,
        portNum: c.portB.portNum,
        isUp: true,
        portType: c.portB.portType
      })
    })
    return states
  }

  // ==================== 获取所有连接（用于拓扑图渲染） ====================
  function getAllConnections() {
    return connections.value.map(c => ({
      id: c.id,
      sourceDeviceId: c.portA.deviceId,
      sourcePortId: c.portA.portId,
      sourceDeviceName: c.portA.deviceName,
      sourcePortNum: c.portA.portNum,
      targetDeviceId: c.portB.deviceId,
      targetPortId: c.portB.portId,
      targetDeviceName: c.portB.deviceName,
      targetPortNum: c.portB.portNum,
      cableType: c.cableType,
      portType: c.portA.portType,
      isOptical: c.portA.portType === 'optical'
    }))
  }

  // ==================== 导出/导入/清除 ====================
  function exportAll() {
    return { portConnections: JSON.parse(JSON.stringify(connections.value)) }
  }

  function importAll(data) {
    if (data?.portConnections) {
      connections.value = data.portConnections
      save()
      clearDevicePortCache()
    }
  }

  function clearAll() {
    connections.value = []
    save()
    clearDevicePortCache()
  }

  /**
   * 清理指定设备的所有连接和端口占用状态
   * @param {String} deviceId - 要清理的设备ID
   * @returns {Object} { success, message, removedCount }
   */
  function cleanupDevice(deviceId) {
    if (!deviceId) return { success: false, message: '设备ID不能为空', removedCount: 0 }
    const initialCount = connections.value.length
    connections.value = connections.value.filter(c => {
      const portAKey = c.portA.portId || ''
      const portBKey = c.portB.portId || ''
      const portADevice = portAKey.startsWith(deviceId + '-') ? deviceId : (c.portA.deviceId || '')
      const portBDevice = portBKey.startsWith(deviceId + '-') ? deviceId : (c.portB.deviceId || '')
      // 保留不涉及该设备的连接
      return c.portA.deviceId !== deviceId && c.portB.deviceId !== deviceId
    })
    const removedCount = initialCount - connections.value.length
    clearDevicePortCache(deviceId)
    save()
    // 自动同步到网络拓扑图
    notifyTopologySync()
    return { success: true, message: `已清理 ${removedCount} 条连接`, removedCount }
  }

  async function reload() {
    const username = getCurrentUsername()
    if (!username || username === 'default') {
      connections.value = []
      return
    }
    if (window.electronAPI) {
      try {
        const result = await window.electronAPI.dbLoadUserData(username)
        if (result?.success && result?.data?.portConnections) {
          connections.value = result.data.portConnections
          clearDevicePortCache()
          return
        }
      } catch (e) { console.error('加载端口连接失败', e) }
    }
    try {
      connections.value = JSON.parse(localStorage.getItem(getStorageKey()) || '[]')
    } catch {
      connections.value = []
    }
    clearDevicePortCache()
  }

  // ==================== 可用设备/端口查询（用于创建连线对话框）====================
  // 获取可连接的目标设备列表（排除本机，只包含有同类型空闲端口的设备）
  function getAvailableTargetDevices(currentDeviceId, portType, allDevices) {
    if (!allDevices || !Array.isArray(allDevices)) return []
    return allDevices.filter(d => {
      if (d.id === currentDeviceId) return false
      const ports = getDevicePorts(d)
      return ports.some(p =>
        (p.portType || p.type) === portType &&
        !isPortOccupied(d.id, p.id)
      )
    })
  }

  // 获取指定设备的可用（未占用）同类型端口列表
  function getDeviceAvailablePorts(deviceId, portType) {
    // 强制清除缓存，确保获取最新端口状态（避免连接后缓存未刷新）
    clearDevicePortCache(deviceId)
    // 从 deviceStore 获取完整设备信息
    let fullDevice = { id: deviceId }
    try {
      const ds = useDeviceStore()
      const found = ds.devices?.find(d => d.id === deviceId)
      if (found) fullDevice = found
    } catch (e) {
      // store 未在 pinia 注册时静默失败，使用 { id: deviceId } 兜底
    }
    const ports = getDevicePorts(fullDevice)
    if (!ports || !Array.isArray(ports)) return []
    return ports.filter(p =>
      (p.portType || p.type) === portType &&
      !isPortOccupied(deviceId, p.id)
    )
  }

  return {
    // 状态
    connections,
    // 常量
    ETHERNET_CABLES,
    OPTICAL_CABLES,
    // 端口状态查询
    getPortStatus,
    isPortOccupied,
    getPortConnection,
    getOccupiedPorts,
    getAllPortStates,
    // 端口管理
    getDevicePorts,
    getAvailablePorts,
    generateDevicePorts,
    clearDevicePortCache,
    inferPortType,
    addPort,
    removePort,
    renamePort,
    syncPortNameToConnections,
    syncDeviceNameToConnections,
    repairConnectionPortNames,
    // 连接操作
    connectPorts,
    addConnectionRaw,
    disconnectPorts,
    disconnectDevicePort,
    updateCableType,
    cleanupDevice,
    // 拓扑同步
    syncFromTopology,
    getAllConnections,
    // 生命周期
    save,
    exportAll,
    importAll,
    clearAll,
    reload,
    // 创建连线对话框辅助
    getAvailableTargetDevices,
    getDeviceAvailablePorts
  }
})
