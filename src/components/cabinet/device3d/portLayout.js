/**
 * 设备面板 3D 端口布局适配器
 *
 * 目的：让 3D 模型上的每个端口与二维 DevicePanelRenderer 发射的 port-click 负载
 *      （portId / portNum / portType / portName）以及端口占用状态判断逻辑完全一致，
 *      从而保证 3D 视图与原面板的数据绑定、事件处理、状态更新机制无缝对齐。
 *
 * 端口 ID 规则复刻自 src/components/cabinet/DevicePanelRenderer.js：
 *  · 交换机：console / eth{奇数=下排, 偶数=上排} / sfp{n}；电源按钮 power-toggle
 *  · 防火墙 1U：mgmt / console / port{n} / sfp{n}
 *  · 防火墙 2U（U2 通用排版）：mgmt / console / eth{n} / sfp{n}
 *  · 路由器 1U：console / wan1-3 / lan1-4 / sfp{n}
 *  · 路由器 2U（U2 通用排版）：mgmt / console / eth{n} / sfp{n}
 *  · 配线架：patch-{n}（portType: patch-panel），标签点击 patch-rename
 *  · 光纤托盘：fiber-{n}（portType: optical），标签点击 patch-rename
 *  · 服务器/存储/PDU/KVM/理线架/ODF：2D 面板无可交互端口（仅装饰），3D 同样无端口事件
 */

import { getDevicePortConfig } from '../../../composables/useRackTransform.js'
import { getDeviceSpec } from './deviceSpecs.js'

/** 归一化坐标：x ∈ [0,1]（左→右），y ∈ [-1,1]（下→上），相对于门叶内区 */
function pt(portId, portNum, portType, portName, role, x, y, checkIds, connSetKeys, patchRename = false) {
  return { portId, portNum, portType, portName, role, x, y, checkIds: checkIds || [], connSetKeys: connSetKeys || [], patchRename }
}

/**
 * 计算设备面板端口布局（与 2D 渲染器同源同序）
 * @returns {{ kind, ports: Array, hasPowerBtn: boolean, spec: Object }}
 */
export function computePanelPorts(device) {
  const spec = getDeviceSpec(device)
  const type = String(device?.device_type || device?.type || '').toLowerCase()
  const u = Number(device?.uSize || device?.u_height || 1) || 1
  const is2U = u >= 2
  const ports = []

  switch (type) {
    case 'switch': {
      const cfg = getDevicePortConfig(device)
      const { rj45Count, sfpCount, groups, hasConsole } = cfg
      // Console（与 2D 一致：hasConsole && rj45Count > 0 时渲染在最左，3D 置于左侧脊板）
      if (hasConsole && rj45Count > 0) {
        ports.push(pt('console', 'CON', 'console', 'Console', 'console', 0.008, 0, [], []))
      }
      // RJ45 双行交错编号（复刻 renderSwitchPorts：下排奇数、上排偶数，组间 portOffset += 2*groupSize）
      const totalCols = groups.reduce((a, b) => a + b, 0)
      let portOffset = 0
      let colIdx = 0
      const X0 = 0.10, X1 = 0.70
      for (const groupSize of groups) {
        for (let col = 0; col < groupSize; col++) {
          const bottomNumber = portOffset + (col + 1) * 2 - 1
          const topNumber = portOffset + (col + 1) * 2
          const x = totalCols > 1 ? X0 + (colIdx + 0.5) / totalCols * (X1 - X0) : (X0 + X1) / 2
          const portNames = device?.portNames || {}
          const bottomName = portNames[`eth${bottomNumber}`] || String(bottomNumber)
          const topName = portNames[`eth${topNumber}`] || String(topNumber)
          ports.push(pt(`eth${bottomNumber}`, bottomNumber, 'ethernet', bottomName, 'rj45', x, -0.34, [`eth${bottomNumber}`], []))
          ports.push(pt(`eth${topNumber}`, topNumber, 'ethernet', topName, 'rj45', x, 0.34, [`eth${topNumber}`], []))
          colIdx++
        }
        portOffset += 2 * groupSize
      }
      // SFP 光口（右侧单行居中）
      if (sfpCount > 0) {
        const n = Math.min(sfpCount, 8)
        for (let i = 0; i < n; i++) {
          const x = 0.74 + (n === 1 ? 0.115 : (i / (n - 1)) * 0.23)
          ports.push(pt(`sfp${i + 1}`, i + 1, 'sfp', `SFP${i + 1}`, 'sfp', x, 0, [`sfp${i + 1}`], [`SFP-${i + 1}`, i + 1]))
        }
      }
      return { kind: 'switch', ports, hasPowerBtn: true, spec }
    }

    case 'firewall':
    case 'router': {
      const cfg = getDevicePortConfig(device)
      const { rj45Count, sfpCount } = cfg
      if (is2U) {
        // 2U 通用排版（renderU2DevicePanel）：mgmt/console 居左，GE 单排上、SFP 单排下
        ports.push(pt('mgmt', 'MGMT', 'mgmt', 'MGMT', 'mgmt', 0.12, 0.62, ['mgmt'], []))
        ports.push(pt('console', 'CON', 'console', 'Console', 'console', 0.12, 0.40, [], []))
        const nRj = Math.min(rj45Count, 24)
        for (let i = 0; i < nRj; i++) {
          const x = 0.08 + (nRj === 1 ? 0.35 : (i / (nRj - 1)) * 0.70)
          const portNames = device?.portNames || {}
          const name = portNames[`eth${i + 1}`] || String(i + 1)
          ports.push(pt(`eth${i + 1}`, i + 1, 'ethernet', name, 'rj45', x, 0.10, [`eth${i + 1}`], []))
        }
        const nSfp = Math.min(sfpCount, 4)
        for (let i = 0; i < nSfp; i++) {
          const x = 0.08 + (nSfp === 1 ? 0.1 : (i / (nSfp - 1)) * 0.30)
          ports.push(pt(`sfp${i + 1}`, i + 1, 'sfp', `SFP${i + 1}`, 'sfp', x, -0.40, [`sfp${i + 1}`], [`SFP-${i + 1}`, i + 1]))
        }
        return { kind: type, ports, hasPowerBtn: true, spec }
      }
      if (type === 'firewall') {
        // 1U 防火墙：mgmt + console 居左，port1..N 单排，SFP 居右
        ports.push(pt('mgmt', 'MGMT', 'mgmt', 'MGMT', 'mgmt', 0.10, 0, ['mgmt'], []))
        ports.push(pt('console', 'CON', 'console', 'Console', 'console', 0.16, 0, [], []))
        const nRj = Math.min(rj45Count || 8, 8)
        for (let i = 0; i < nRj; i++) {
          const x = 0.24 + (nRj === 1 ? 0.23 : (i / (nRj - 1)) * 0.46)
          const portNames = device?.portNames || {}
          const name = portNames[`port${i + 1}`] || String(i + 1)
          // 2D 占用判断：isPortOccupied('port'+n) || isPortOccupied('eth'+n)
          ports.push(pt(`port${i + 1}`, i + 1, 'ethernet', name, 'rj45', x, 0, [`port${i + 1}`, `eth${i + 1}`], []))
        }
        const nSfp = Math.min(sfpCount, 4)
        for (let i = 0; i < nSfp; i++) {
          const x = 0.72 + (nSfp === 1 ? 0.115 : (i / (nSfp - 1)) * 0.23)
          ports.push(pt(`sfp${i + 1}`, i + 1, 'sfp', `SFP${i + 1}`, 'sfp', x, 0, [`sfp${i + 1}`], [`SFP-${i + 1}`, i + 1]))
        }
        return { kind: 'firewall', ports, hasPowerBtn: true, spec }
      }
      // 1U 路由器：console + WAN×3 + LAN×4 + SFP×2
      ports.push(pt('console', 'CON', 'console', 'Console', 'console', 0.035, 0, [], []))
      const portNames = device?.portNames || {}
      for (let i = 1; i <= 3; i++) {
        const name = portNames[`wan${i}`] || `WAN${i}`
        ports.push(pt(`wan${i}`, `WAN${i}`, 'ethernet', name, 'wan', 0.10 + (i - 1) * 0.075, 0, [`wan${i}`, `ge${i}`, `eth${i}`], []))
      }
      for (let i = 1; i <= 4; i++) {
        const name = portNames[`lan${i}`] || `LAN${i}`
        ports.push(pt(`lan${i}`, `LAN${i}`, 'ethernet', name, 'lan', 0.345 + (i - 1) * 0.075, 0, [`lan${i}`, `ge${i + 3}`, `eth${i + 3}`], []))
      }
      // 不可写 `sfpCount || 2`：显式 0（无光口的路由器）会被兜底成 2 个不存在的 SFP 口
      const nSfp = Math.min(Math.max(0, Number(sfpCount) || 0), 2)
      for (let i = 0; i < nSfp; i++) {
        const x = 0.72 + i * 0.10
        ports.push(pt(`sfp${i + 1}`, i + 1, 'sfp', `SFP${i + 1}`, 'sfp', x, 0, [`sfp${i + 1}`], [`SFP-${i + 1}`, i + 1]))
      }
      return { kind: 'router', ports, hasPowerBtn: true, spec }
    }

    case 'patch_panel': {
      // ports_count 可能以字符串 "48" 来自数据库，必须先 Number() 再比较，
      // 否则 `=== 48` 严格等号判 false，48 口配线架会被当成 24 口只画一半
      const declaredPorts = Number(device.ports_count ?? device.ports ?? 0) || 0
      const is48Port = u >= 2 || declaredPorts === 48
      const totalPortCount = is48Port ? 48 : (declaredPorts || 24)
      const rows = is48Port ? 2 : 1
      const portsPerRow = totalPortCount / rows
      const portMap = device.portMap || {}
      for (let i = 0; i < totalPortCount; i++) {
        const row = Math.floor(i / portsPerRow)
        const col = i % portsPerRow
        const portNum = i + 1
        const pmInfo = portMap[portNum] || portMap[String(portNum)] || {}
        const name = pmInfo.portName || `端口${portNum}`
        const x = 0.035 + (col + 0.5) / portsPerRow * 0.93
        const y = rows === 2 ? (row === 0 ? 0.30 : -0.30) : 0.02
        ports.push(pt(`patch-${portNum}`, portNum, 'patch-panel', name, 'patch', x, y, [`patch-${portNum}`], [], true))
      }
      return { kind: 'patch_panel', ports, hasPowerBtn: false, spec }
    }

    case 'fiber_tray':
    case 'odf': {
      const fibers = Number(device?.fibers) || 12
      const cols = fibers <= 12 ? 6 : 8
      const rows = Math.ceil(fibers / cols)
      const portMap = device?.portMap || {}
      const fiberMap = device?.fiberMap || {}
      for (let i = 0; i < fibers; i++) {
        const portNum = i + 1
        const pmInfo = portMap[portNum] || portMap[String(portNum)] || fiberMap[portNum] || fiberMap[String(portNum)] || {}
        const name = pmInfo.portName || `芯${portNum}`
        const col = i % cols
        const row = Math.floor(i / cols)
        const x = 0.05 + (cols === 1 ? 0.5 : (col / (cols - 1)) * 0.90)
        const y = rows === 1 ? 0 : 0.30 - (rows === 1 ? 0 : (row / (rows - 1)) * 0.60)
        ports.push(pt(`fiber-${portNum}`, portNum, 'optical', name, 'fiber', x, y, [`fiber-${portNum}`], [], true))
      }
      return { kind: type, ports, hasPowerBtn: false, spec }
    }

    default:
      // server / storage / pdu / kvm / cable_manager 等：2D 面板无可交互端口
      return { kind: spec.kind, ports: [], hasPowerBtn: false, spec }
  }
}

/**
 * 计算各端口占用/连接状态（复刻 2D active 判断：离线全灭 + connectedPortSet + store 占用）
 * @returns {Map<string, boolean>} portId → 是否已连接（LED 亮）
 */
export function computePortStates(device, ports, portStateStore) {
  const states = new Map()
  if (!device || !ports || !ports.length) return states
  const isOffline = device.status === 'offline'
  if (isOffline) {
    for (const p of ports) states.set(p.portId, false)
    return states
  }
  const cfg = getDevicePortConfig(device)
  const connSet = cfg.connectedPortSet || new Set()
  const deviceId = device.id
  for (const p of ports) {
    let active = false
    for (const k of p.connSetKeys) {
      if (connSet.has(k)) { active = true; break }
    }
    if (!active) {
      active = p.checkIds.some(id => portStateStore && portStateStore.isPortOccupied(deviceId, id))
    }
    states.set(p.portId, active)
  }
  return states
}

/** 电源按钮激活态（与 2D 一致：设备非离线即激活） */
export function powerBtnActive(device) {
  return !!device && device.status !== 'offline'
}
