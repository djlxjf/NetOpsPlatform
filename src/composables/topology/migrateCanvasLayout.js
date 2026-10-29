/**
 * migrateCanvasLayout - 旧画布拓扑数据迁移
 *
 * 读取旧 `netops_canvas_topology`（无用户维度）中的节点坐标，
 * 按 node.label ≈ device.name 或 node.id 中的 deviceId 匹配导入到新 layout store。
 * 边直接丢弃（权威连接在 portStateStore）。
 *
 * 幂等：迁移完成后置 migrated flag，不再重复执行。
 */
import { useDeviceStore } from '@/stores'
import { useTopologyLayoutStore } from '@/stores/topologyLayout'

const OLD_KEY = 'netops_canvas_topology'

export async function migrateCanvasLayout() {
  const layoutStore = useTopologyLayoutStore()
  const deviceStore = useDeviceStore()

  // 已迁移过则跳过
  if (layoutStore.migrated) return { migrated: false, reason: 'already-migrated' }

  let raw = null
  try {
    raw = localStorage.getItem(OLD_KEY)
  } catch (e) {
    return { migrated: false, reason: 'read-failed' }
  }
  if (!raw) {
    layoutStore.migrated = true
    layoutStore.save()
    return { migrated: false, reason: 'no-old-data' }
  }

  let oldData = null
  try {
    oldData = JSON.parse(raw)
  } catch (e) {
    return { migrated: false, reason: 'parse-failed' }
  }

  const oldNodes = oldData?.nodes || []
  if (oldNodes.length === 0) {
    layoutStore.migrated = true
    layoutStore.save()
    return { migrated: false, reason: 'no-old-nodes' }
  }

  const devices = deviceStore.devices || []
  // 建立 label → device 索引（名字可能重复，取第一个）
  const labelIndex = {}
  for (const d of devices) {
    if (d.name && !labelIndex[d.name]) labelIndex[d.name] = d
  }

  let imported = 0
  for (const oldNode of oldNodes) {
    if (oldNode.x === undefined || oldNode.y === undefined) continue

    // 匹配策略1：id 中的 deviceId（旧节点 id 可能是 device_xxx 或 node_xxx）
    let device = null
    const idStr = String(oldNode.id || '')
    for (const d of devices) {
      if (idStr === d.id || idStr.includes(d.id)) {
        device = d
        break
      }
    }
    // 匹配策略2：label 等于设备名
    if (!device && oldNode.label && labelIndex[oldNode.label]) {
      device = labelIndex[oldNode.label]
    }
    if (!device) continue // 匹配失败 → 交给自动布局

    if (!layoutStore.hasPosition(device.id)) {
      layoutStore.setPosition(device.id, oldNode.x, oldNode.y, Boolean(oldNode.fixed))
      imported++
    }
  }

  layoutStore.migrated = true
  layoutStore.save()

  // 迁移成功后删除旧数据（仅保留本次导入成功的坐标，edges 丢弃）
  try {
    localStorage.removeItem(OLD_KEY)
  } catch (e) {
    // 忽略
  }

  return { migrated: true, imported }
}
