// 机柜 / 巡检 / 状态映射 纯逻辑单元测试
// 使用 Node 内置测试运行器（无需 vitest / 浏览器），命令：
//   node --test tests/unit/dc-logic.test.mjs
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
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
    assert.ok(cold instanceof THREE.Color)
    assert.ok(hot.r >= cold.r) // 高温端红通道更高
  })
  it('STATUS_LABEL / TYPE_LABEL / STATUS_COLOR_NUM 三处真源一致', () => {
    assert.equal(STATUS_LABEL.fault, '故障')
    assert.ok(Number.isInteger(STATUS_COLOR_NUM.fault) && STATUS_COLOR_NUM.fault > 0) // 数值色（0xRRGGBB）
    assert.ok(TYPE_LABEL.server)
  })
})

describe('seedLayout 设备派生', () => {
  it('genCabinetDevices 返回非空设备清单', () => {
    const devs = genCabinetDevices(Math.random)
    assert.ok(Array.isArray(devs))
    assert.ok(devs.length > 0)
  })
  it('deriveCabinetStatus 返回合法状态', () => {
    const s = deriveCabinetStatus(genCabinetDevices(Math.random))
    assert.ok(['normal', 'warning', 'fault'].includes(s))
  })
})

describe('RackSystem 统计 / 传感器 / 状态映射', () => {
  it('构造不依赖浏览器环境', () => {
    assert.doesNotThrow(() => makeRackSystem())
  })

  it('stats 正确归类状态计数', () => {
    const rs = makeRackSystem()
    seedRacks(rs)
    const s = rs.stats()
    assert.equal(s.total, 3)
    assert.equal(s.normal, 1)
    assert.equal(s.warning, 1)
    assert.equal(s.fault, 1)
  })

  it('sensorTable 输出温度/湿度/功率/状态', () => {
    const rs = makeRackSystem()
    seedRacks(rs)
    const rows = rs.sensorTable()
    assert.equal(rows.length, 3)
    const r1 = rows[0]
    assert.equal(r1.id, 'RK001')
    assert.equal(r1.temp, 24)
    assert.equal(r1.humidity, 45)
    assert.equal(r1.power, 4)
    assert.equal(r1.status, 'normal')
    assert.equal(r1.type, TYPE_LABEL.server)
  })

  it('applyStatusMap 按 rackId 覆盖并触发着色（返回变化数）', () => {
    const rs = makeRackSystem()
    seedRacks(rs)
    const n = rs.applyStatusMap({ RK001: 'critical', RK999: 'warning' })
    assert.equal(n, 1) // 仅 RK001 命中
    assert.equal(rs.racks[0].status, 'fault')
    assert.equal(rs.racks[1].status, 'warning') // 未被覆盖
  })

  it('setAlert / clearAlert 切换机柜状态', () => {
    const rs = makeRackSystem()
    seedRacks(rs)
    rs.setAlert('RK001', 'critical')
    assert.equal(rs.racks[0].status, 'fault')
    rs.clearAlert('RK001')
    assert.equal(rs.racks[0].status, 'normal')
  })

  it('toPlain 持久化传感器字段', () => {
    const rs = makeRackSystem()
    seedRacks(rs)
    const plain = rs.toPlain()
    assert.equal(plain[0].humidity, 45)
    assert.equal(plain[0].power, 4)
  })
})

describe('PatrolController 自动巡检路径', () => {
  it('由机柜分布推导环绕路径并启停', () => {
    const sm = { camera: new THREE.PerspectiveCamera(55, 1, 0.1, 100) }
    const p = new PatrolController(sm)
    const ok = p.buildPath({ racks: [{ x: -5, z: -3 }, { x: 5, z: 3 }] })
    assert.equal(ok, true)
    assert.equal(p.pts.length, 4)
    assert.equal(p.start(), true)
    const before = sm.camera.position.clone()
    p.update(0.1)
    assert.ok(sm.camera.position.distanceTo(before) > 0) // 沿路径前进
  })

  it('无机柜时 buildPath 失败', () => {
    const p = new PatrolController({ camera: new THREE.PerspectiveCamera() })
    assert.equal(p.buildPath({ racks: [] }), false)
  })
})
