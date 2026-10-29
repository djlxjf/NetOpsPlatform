import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { RackSystem } from '../../datacenter-3d/src/racks.js'
import { heat, STATUS_LABEL, TYPE_LABEL } from '../../datacenter-3d/src/config.js'
import { genCabinetDevices, deriveCabinetStatus } from '../../datacenter-3d/src/seedLayout.js'
import { STATUS_COLOR_NUM } from '../../datacenter-3d/src/themeTokens.js'
import { PatrolController } from '../../datacenter-3d/src/walkthrough.js'

// 用真实 THREE.Scene 构造（无需 WebGL 上下文 / 文档）：RackSystem 构造函数不触碰 DOM。
function makeRackSystem() {
  return new RackSystem(new THREE.Scene())
}

function seedRacks(rs) {
  rs.racks = [
    { id: 'RK001', type: 'server', x: 0, z: 0, rotationY: 0, temp: 24, density: 60, humidity: 45, power: 4, status: 'normal', devices: null },
    { id: 'RK002', type: 'server', x: 1, z: 0, rotationY: 0, temp: 31, density: 80, humidity: 50, power: 6, status: 'warning', devices: null },
    { id: 'RK003', type: 'ac', x: 2, z: 0, rotationY: 0, temp: 22, density: 0, humidity: 40, power: 3, status: 'fault', devices: null },
  ]
}

describe('config.heat / 状态色', () => {
  it('heat 随温度单调偏红', () => {
    const cold = heat(0)
    const hot = heat(1)
    expect(cold).toBeInstanceOf(THREE.Color)
    expect(hot.r).toBeGreaterThanOrEqual(cold.r) // 高温端红通道更高
  })
  it('STATUS_LABEL / TYPE_LABEL / STATUS_COLOR_NUM 三处真源一致', () => {
    expect(STATUS_LABEL.fault).toBe('故障')
    expect(STATUS_COLOR_NUM.fault).toMatch(/^#/)
    expect(TYPE_LABEL.server).toBeTruthy()
  })
})

describe('seedLayout 设备派生', () => {
  it('genCabinetDevices 返回非空设备清单', () => {
    const devs = genCabinetDevices(Math.random)
    expect(Array.isArray(devs)).toBe(true)
    expect(devs.length).toBeGreaterThan(0)
  })
  it('deriveCabinetStatus 返回合法状态', () => {
    const s = deriveCabinetStatus(genCabinetDevices(Math.random))
    expect(['normal', 'warning', 'fault']).toContain(s)
  })
})

describe('RackSystem 统计 / 传感器 / 状态映射', () => {
  it('构造不依赖浏览器环境', () => {
    expect(() => makeRackSystem()).not.toThrow()
  })

  it('stats 正确归类状态计数', () => {
    const rs = makeRackSystem()
    seedRacks(rs)
    const s = rs.stats()
    expect(s.total).toBe(3)
    expect(s.normal).toBe(1)
    expect(s.warning).toBe(1)
    expect(s.fault).toBe(1)
  })

  it('sensorTable 输出温度/湿度/功率/状态', () => {
    const rs = makeRackSystem()
    seedRacks(rs)
    const rows = rs.sensorTable()
    expect(rows).toHaveLength(3)
    const r1 = rows[0]
    expect(r1.id).toBe('RK001')
    expect(r1.temp).toBe(24)
    expect(r1.humidity).toBe(45)
    expect(r1.power).toBe(4)
    expect(r1.status).toBe('normal')
    expect(r1.type).toBe(TYPE_LABEL.server)
  })

  it('applyStatusMap 按 rackId 覆盖并触发着色（返回变化数）', () => {
    const rs = makeRackSystem()
    seedRacks(rs)
    const n = rs.applyStatusMap({ RK001: 'critical', RK999: 'warning' })
    expect(n).toBe(1) // 仅 RK001 命中
    expect(rs.racks[0].status).toBe('fault')
    expect(rs.racks[1].status).toBe('warning') // 未被覆盖
  })

  it('setAlert / clearAlert 切换机柜状态', () => {
    const rs = makeRackSystem()
    seedRacks(rs)
    rs.setAlert('RK001', 'critical')
    expect(rs.racks[0].status).toBe('fault')
    rs.clearAlert('RK001')
    expect(rs.racks[0].status).toBe('normal')
  })

  it('toPlain 持久化传感器字段', () => {
    const rs = makeRackSystem()
    seedRacks(rs)
    const plain = rs.toPlain()
    expect(plain[0]).toHaveProperty('humidity', 45)
    expect(plain[0]).toHaveProperty('power', 4)
  })
})

describe('PatrolController 自动巡检路径', () => {
  it('由机柜分布推导环绕路径并启停', () => {
    const sm = { camera: new THREE.PerspectiveCamera(55, 1, 0.1, 100) }
    const p = new PatrolController(sm)
    const ok = p.buildPath({ racks: [{ x: -5, z: -3 }, { x: 5, z: 3 }] })
    expect(ok).toBe(true)
    expect(p.pts).toHaveLength(4)
    expect(p.start()).toBe(true)
    const before = sm.camera.position.clone()
    p.update(0.1)
    expect(sm.camera.position.distanceTo(before)).toBeGreaterThan(0) // 沿路径前进
  })

  it('无机柜时 buildPath 失败', () => {
    const p = new PatrolController({ camera: new THREE.PerspectiveCamera() })
    expect(p.buildPath({ racks: [] })).toBe(false)
  })
})
