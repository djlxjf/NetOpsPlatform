/**
 * 设备 3D 模型构建器（Three.js）
 *
 * 依据 deviceSpecs.js 的真实外形规格与 portLayout.js 的端口布局，
 * 为每类设备构建可交互 3D 模型：
 *   · 真实进深机身 + 前门脸 + 两侧挂耳（含螺丝孔）+ 品牌/型号区
 *   · 每个端口为独立网格（userData.port 携带与 2D 完全一致的 port-click 负载），
 *     射线点击即触发与原面板相同的事件
 *   · 端口 LED / 电源按钮 / 状态灯（PWR/SYS/STAT）颜色与 2D 面板逻辑一致
 *   · 背面接口/电源/风扇等后部结构（装饰性，开门视角可见）
 */

import * as THREE from 'three'
import { U_UNIT, EAR_W } from './deviceSpecs.js'
import { getVendorColor } from '../../../composables/useRackTransform.js'

/* ---------------- 材质 ---------------- */
const MAT = {
  body:    () => new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.52, metalness: 0.62 }),
  bezel:   () => new THREE.MeshStandardMaterial({ color: 0x22262d, roughness: 0.46, metalness: 0.66 }),
  spine:   () => new THREE.MeshStandardMaterial({ color: 0x181b20, roughness: 0.5, metalness: 0.6 }),
  ear:     () => new THREE.MeshStandardMaterial({ color: 0xb7bbc1, roughness: 0.42, metalness: 0.72 }),
  handle:  () => new THREE.MeshStandardMaterial({ color: 0x9a9ea4, roughness: 0.38, metalness: 0.76 }),
  portOut: () => new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.7, metalness: 0.3 }),
  portIn:  () => new THREE.MeshStandardMaterial({ color: 0x05060a, roughness: 0.9, metalness: 0.1 }),
  metal:   () => new THREE.MeshStandardMaterial({ color: 0x6a6e75, roughness: 0.4, metalness: 0.8 }),
  vent:    () => new THREE.MeshStandardMaterial({ color: 0x0a0b0d, roughness: 0.85, metalness: 0.2 }),
  label:   () => new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.85, metalness: 0.02 }),
  psu:     () => new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.5, metalness: 0.6 }),
  select:  () => new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.16, side: THREE.BackSide, depthWrite: false }),
}

const LED_ON   = 0x22cc55
const LED_OFF  = 0x14161a
const ledColorFor = (status, type) => {
  const offline = status === 'offline'
  if (type === 'pwr') return offline ? 0x555555 : 0x22aa44
  if (offline) return 0x555555
  if (status === 'alarm') return 0xee3333
  if (status === 'warning') return 0xffaa00
  return 0x22aa44
}

/* ---------------- 工具 ---------------- */
function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  m.castShadow = true
  parent.add(m)
  return m
}

/** 品牌/型号区纹理（厂商色条 + 厂商名 + 型号） */
function brandTexture(vendor, model, accent) {
  const W = 512, H = 128
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const x = c.getContext('2d')
  x.fillStyle = '#101216'
  x.fillRect(0, 0, W, H)
  x.fillStyle = accent
  x.fillRect(0, 0, 10, H)
  x.fillStyle = accent
  x.font = 'bold 44px Arial, sans-serif'
  x.textBaseline = 'middle'
  x.fillText(String(vendor || 'DEVICE').toUpperCase().slice(0, 12), 22, 34)
  x.fillStyle = '#e8e8e8'
  x.font = '30px Arial, sans-serif'
  x.fillText(String(model || '').toUpperCase().slice(0, 22), 22, 88)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/* ---------------- 端口编号标签（与 2D 面板一致的信息展示） ---------------- */
const _labelTexCache = new Map()
// 模块级共享资源登记表：PORT_GEO / LABEL_GEO 与 _labelTexCache 中的纹理由**所有设备实例共用**，
// 单个模型 dispose 时若一并释放，其余仍在使用中的实例会持有已释放的 GPU 句柄
// （表现为重建后端口/标签贴图异常、每帧重复上传）。故销毁时按此表跳过。
const SHARED_RESOURCES = new Set()

function labelTexture(text) {
  const key = String(text)
  if (_labelTexCache.has(key)) return _labelTexCache.get(key)
  const W = 96, H = 44
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const x = c.getContext('2d')
  x.clearRect(0, 0, W, H)
  x.fillStyle = '#c8ccd2'
  x.font = 'bold 30px Arial, sans-serif'
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.fillText(key.slice(0, 6), W / 2, H / 2)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  _labelTexCache.set(key, t)
  SHARED_RESOURCES.add(t)
  return t
}

const LABEL_GEO = new THREE.PlaneGeometry(0.62, 0.28)
SHARED_RESOURCES.add(LABEL_GEO)

/* ---------------- 端口网格 ---------------- */
const PORT_GEO = {
  rj45Out: new THREE.BoxGeometry(1.05, 0.85, 0.42),
  rj45In:  new THREE.BoxGeometry(0.82, 0.6, 0.3),
  sfpOut:  new THREE.BoxGeometry(0.92, 0.72, 0.38),
  sfpIn:   new THREE.BoxGeometry(0.7, 0.5, 0.26),
  fiber:   new THREE.BoxGeometry(0.72, 0.6, 0.3),
  led:     new THREE.SphereGeometry(0.11, 8, 8),
  label:   new THREE.PlaneGeometry(0.92, 0.3),
  latch:   new THREE.BoxGeometry(0.5, 0.12, 0.06),
}
for (const g of Object.values(PORT_GEO)) SHARED_RESOURCES.add(g)

/**
 * 构建单个端口网格
 * @returns {{ group: THREE.Group, ledMat: THREE.MeshStandardMaterial }}
 */
function buildPort(port, frontZ, parent) {
  const g = new THREE.Group()
  const isSfp = port.portType === 'sfp'
  const isFiber = port.portType === 'optical'
  const outMat = MAT.portOut()
  const inMat = MAT.portIn()

  if (isFiber) {
    const b = new THREE.Mesh(PORT_GEO.fiber, outMat)
    b.castShadow = true
    g.add(b)
  } else {
    const out = new THREE.Mesh(isSfp ? PORT_GEO.sfpOut : PORT_GEO.rj45Out, outMat)
    out.castShadow = true
    g.add(out)
    const inner = new THREE.Mesh(isSfp ? PORT_GEO.sfpIn : PORT_GEO.rj45In, inMat)
    inner.position.z = 0.08
    g.add(inner)
    if (isSfp) {
      const latch = new THREE.Mesh(PORT_GEO.latch, MAT.metal())
      latch.position.set(0, -0.3, 0.2)
      g.add(latch)
    }
  }
  // LED（右上角，与 2D 面板一致）
  const ledMat = new THREE.MeshStandardMaterial({ color: LED_OFF, emissive: LED_OFF, emissiveIntensity: 0.9, roughness: 0.4 })
  const led = new THREE.Mesh(PORT_GEO.led, ledMat)
  led.position.set(isSfp || isFiber ? 0.3 : 0.36, isSfp || isFiber ? 0.2 : 0.28, 0.22)
  g.add(led)
  // 配线架/光纤托盘：端口上方白色标签（点击 → patch-rename）
  if (port.patchRename) {
    const label = new THREE.Mesh(PORT_GEO.label, MAT.label())
    label.position.set(0, 0.62, 0.05)
    label.userData.patchRename = port.portNum
    label.userData.port = port
    g.add(label)
  } else {
    // 端口编号标签（与 2D 面板的端口数字一致；上排居上、下排居下）
    const labelMat = new THREE.MeshBasicMaterial({ map: labelTexture(port.portNum), transparent: true, depthWrite: false })
    const label = new THREE.Mesh(LABEL_GEO, labelMat)
    label.position.set(0, port.y >= 0 ? 0.62 : -0.62, 0.06)
    label.userData.portLabel = true
    g.add(label)
  }
  g.position.z = frontZ
  g.userData.port = port
  // 射线拾取：整组可点
  g.traverse(o => { o.userData.port = port })
  parent.add(g)
  return { group: g, ledMat }
}

/* ---------------- 主构建 ---------------- */
/**
 * @param {Object} device   设备对象（含 device_type/type、u_height、status、vendor、model 等）
 * @param {Object} layout   computePanelPorts() 的返回值
 * @returns {Object} model 句柄 { group, setSelected, updateStates, updateBlink, setStatus, dispose }
 */
export function buildDeviceModel(device, layout) {
  const spec = layout.spec
  const { w, d, u } = spec
  const h = U_UNIT * u
  const group = new THREE.Group()
  group.name = 'device3d'

  const disposables = []   // { dispose() }
  const track = (obj) => { disposables.push(obj); return obj }

  /* ---- 机身（真实进深） ---- */
  const bodyMat = MAT.body()
  const bodyGeo = track(new THREE.BoxGeometry(w - 2 * EAR_W, h - 0.3, d))
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.castShadow = true
  body.receiveShadow = true
  body.userData.body = true
  group.add(body)

  /* ---- 前门脸（略凸的钢板） ---- */
  const bezelMat = MAT.bezel()
  const bezelGeo = track(new THREE.BoxGeometry(w - 2 * EAR_W + 0.3, h - 0.15, 0.5))
  const bezel = new THREE.Mesh(bezelGeo, bezelMat)
  bezel.position.z = d / 2 + 0.1
  bezel.userData.body = true
  group.add(bezel)
  const frontZ = d / 2 + 0.42

  /* ---- 两侧挂耳（含螺丝孔） ---- */
  const earMat = MAT.ear()
  const earGeo = track(new THREE.BoxGeometry(EAR_W, h, d))
  const screwGeo = track(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 10))
  const screwMat = MAT.metal()
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, earMat)
    ear.position.set(sx * (w / 2 - EAR_W / 2), 0, 0)
    ear.castShadow = true
    group.add(ear)
    const screwCount = u >= 2 ? 4 : 2
    for (let i = 0; i < screwCount; i++) {
      const sy = -h / 2 + (h / (screwCount + 1)) * (i + 1)
      const screw = new THREE.Mesh(screwGeo, screwMat)
      screw.rotation.x = Math.PI / 2
      screw.position.set(sx * (w / 2 - EAR_W / 2), sy, d / 2 + 0.36)
      group.add(screw)
    }
  }

  /* ---- 服务器/存储：两侧把手 ---- */
  if (layout.kind === 'server' || layout.kind === 'storage') {
    const handleGeo = track(new THREE.BoxGeometry(0.5, h * 0.42, 1.6))
    const handleMat = MAT.handle()
    for (const sx of [-1, 1]) {
      const hd = new THREE.Mesh(handleGeo, handleMat)
      hd.position.set(sx * (w / 2 - EAR_W - 0.1), 0, d / 2 + 0.6)
      hd.castShadow = true
      group.add(hd)
    }
  }

  /* ---- 左侧品牌/型号脊板 ---- */
  const spineMat = MAT.spine()
  const spineGeo = track(new THREE.BoxGeometry(3.0, h - 0.5, 0.45))
  const spine = new THREE.Mesh(spineGeo, spineMat)
  spine.position.set(-(w / 2 - EAR_W) + 1.5, 0, d / 2 + 0.22)
  spine.userData.body = true
  group.add(spine)

  const vColor = getVendorColor(device?.vendor || device?.brand)
  const brandTex = track(brandTexture(device?.vendor || device?.brand, device?.model, vColor.primary))
  const brandGeo = track(new THREE.PlaneGeometry(2.7, 0.68))
  const brandMat = track(new THREE.MeshBasicMaterial({ map: brandTex, transparent: true }))
  const brand = new THREE.Mesh(brandGeo, brandMat)
  brand.position.set(-(w / 2 - EAR_W) + 1.5, h / 2 - 0.85, d / 2 + 0.46)
  group.add(brand)

  /* ---- 状态灯（PWR/SYS/STAT，颜色与 2D 一致） ---- */
  const ledMats = {}
  const ledGeo = track(new THREE.SphereGeometry(0.16, 10, 10))
  const ledY = h / 2 - 1.7
  const ledX0 = -(w / 2 - EAR_W) + 1.5
  for (const [i, key] of ['pwr', 'sys', 'stat'].entries()) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x555555, emissive: 0x555555, emissiveIntensity: 1.1, roughness: 0.4 })
    ledMats[key] = mat
    const led = new THREE.Mesh(ledGeo, mat)
    led.position.set(ledX0 - 0.75 + i * 0.75, ledY, d / 2 + 0.48)
    group.add(led)
  }

  /* ---- 电源按钮（与 2D 一致的 power-toggle 交互） ---- */
  let powerBtn = null
  if (layout.hasPowerBtn) {
    const btnMat = MAT.metal()
    const btnGeo = track(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 14))
    const btnLedGeo = track(new THREE.CylinderGeometry(0.18, 0.18, 0.26, 12))
    powerBtn = new THREE.Group()
    const cap = new THREE.Mesh(btnGeo, btnMat)
    cap.rotation.x = Math.PI / 2
    powerBtn.add(cap)
    const btnLedMat = new THREE.MeshStandardMaterial({ color: 0x22aa44, emissive: 0x22aa44, emissiveIntensity: 1.2, roughness: 0.4 })
    ledMats.powerBtn = btnLedMat
    const bled = new THREE.Mesh(btnLedGeo, btnLedMat)
    bled.rotation.x = Math.PI / 2
    bled.position.z = 0.16
    powerBtn.add(bled)
    powerBtn.position.set(ledX0, ledY - 0.65, d / 2 + 0.4)
    powerBtn.userData.powerBtn = true
    powerBtn.traverse(o => { o.userData.powerBtn = true })
    group.add(powerBtn)
  }

  /* ---- 端口网格 ---- */
  const portEntries = []
  const iw = w - 2 * EAR_W
  const halfH = h / 2 - 0.55
  for (const p of layout.ports) {
    const px = (p.x - 0.5) * iw
    const py = p.y * halfH
    const entry = buildPort(p, frontZ, group)
    entry.group.position.set(px, py, 0)
    entry.port = p
    portEntries.push(entry)
  }

  /* ---- 背面结构（装饰：电源/风扇/接口/理线） ---- */
  const backZ = -d / 2 - 0.3
  const backPlateGeo = track(new THREE.BoxGeometry(iw, h - 0.3, 0.3))
  const backPlate = new THREE.Mesh(backPlateGeo, MAT.bezel())
  backPlate.position.z = backZ
  backPlate.userData.body = true
  group.add(backPlate)

  if (layout.kind === 'server' || layout.kind === 'storage') {
    // 双电源模块
    const psuGeo = track(new THREE.BoxGeometry(4.2, h * 0.34, 2.6))
    const psuMat = MAT.psu()
    for (const sx of [-1, 1]) {
      const psu = new THREE.Mesh(psuGeo, psuMat)
      psu.position.set(sx * (iw / 2 - 2.6), 0, backZ - 1.5)
      group.add(psu)
    }
    // 风扇区（4 圆形风窗）
    const fanRingGeo = track(new THREE.TorusGeometry(0.95, 0.12, 8, 20))
    const fanBladeGeo = track(new THREE.CylinderGeometry(0.72, 0.72, 0.1, 18))
    const fanMat = MAT.vent()
    const bladeMat = MAT.metal()
    for (let i = 0; i < 4; i++) {
      const fx = -iw / 2 + 4.5 + (i % 2) * 3.2
      const fy = (i < 2 ? 1 : -1) * (h * 0.22)
      const ring = new THREE.Mesh(fanRingGeo, fanMat)
      ring.position.set(fx, fy, backZ - 0.2)
      group.add(ring)
      const blade = new THREE.Mesh(fanBladeGeo, bladeMat)
      blade.rotation.x = Math.PI / 2
      blade.position.set(fx, fy, backZ - 0.25)
      group.add(blade)
    }
    // 背面管理口（装饰）
    const mgmtGeo = track(new THREE.BoxGeometry(1.05, 0.85, 0.4))
    for (let i = 0; i < 2; i++) {
      const mp = new THREE.Mesh(mgmtGeo, MAT.portOut())
      mp.position.set(iw / 2 - 3 - i * 1.6, -h * 0.3, backZ - 0.2)
      group.add(mp)
    }
  } else if (layout.kind === 'switch' || layout.kind === 'firewall' || layout.kind === 'router') {
    // 背面接口排 + 风窗
    const bpGeo = track(new THREE.BoxGeometry(1.05, 0.85, 0.4))
    const n = Math.min(layout.ports.filter(p => p.role === 'rj45' || p.role === 'sfp').length, 12)
    for (let i = 0; i < n; i++) {
      const bp = new THREE.Mesh(bpGeo, MAT.portOut())
      bp.position.set(-iw / 2 + 2 + i * 1.5, h * 0.28, backZ - 0.2)
      group.add(bp)
    }
    const ventGeo = track(new THREE.BoxGeometry(3.5, h * 0.4, 0.2))
    const vent = new THREE.Mesh(ventGeo, MAT.vent())
    vent.position.set(iw / 2 - 3, -h * 0.28, backZ - 0.2)
    group.add(vent)
  } else if (layout.kind === 'patch_panel' || layout.kind === 'fiber_tray' || layout.kind === 'odf') {
    // 背面打线排（装饰）
    const pdGeo = track(new THREE.BoxGeometry(0.8, 0.5, 0.3))
    const n = Math.min(layout.ports.length, 24)
    for (let i = 0; i < n; i++) {
      const pd = new THREE.Mesh(pdGeo, MAT.portOut())
      pd.position.set(-iw / 2 + 2 + (i % 12) * 1.4, (i < 12 ? 0.7 : -0.7), backZ - 0.2)
      group.add(pd)
    }
  } else if (layout.kind === 'pdu') {
    // 背面/正面插座排（装饰）
    const soGeo = track(new THREE.BoxGeometry(0.9, 0.7, 0.35))
    for (let i = 0; i < 8; i++) {
      const so = new THREE.Mesh(soGeo, MAT.portOut())
      so.position.set(-iw / 2 + 3 + i * 2.1, 0, frontZ + 0.1)
      group.add(so)
    }
  } else if (layout.kind === 'cable_manager') {
    // 理线环（装饰）
    const ringGeo = track(new THREE.TorusGeometry(1.1, 0.16, 8, 22))
    const ringMat = MAT.metal()
    for (let i = 0; i < 5; i++) {
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.position.set(-iw / 2 + 3 + i * 2.6, 0, d / 2 + 0.5)
      group.add(ring)
    }
  }

  /* ---- 选中高亮框 ---- */
  const selectGeo = track(new THREE.BoxGeometry(w + 0.6, h + 0.6, d + 0.6))
  const selectMat = MAT.select()
  const selectBox = new THREE.Mesh(selectGeo, selectMat)
  selectBox.visible = false
  group.add(selectBox)

  /* ---- 对外句柄 ---- */
  const model = {
    group,
    /** 选中高亮 */
    setSelected(v) { selectBox.visible = !!v },
    /** 更新端口连接状态：states = Map<portId, boolean> */
    updateStates(states) {
      for (const e of portEntries) {
        const on = states && states.get(e.port.portId)
        e.ledMat.color.setHex(on ? LED_ON : LED_OFF)
        e.ledMat.emissive.setHex(on ? LED_ON : LED_OFF)
        e.ledMat.userData.on = !!on
      }
    },
    /** 闪烁相位（0..1）：已连接端口 LED 呼吸 */
    updateBlink(phase) {
      for (const e of portEntries) {
        if (e.ledMat.userData.on) {
          e.ledMat.emissiveIntensity = 0.45 + 0.75 * (0.5 + 0.5 * Math.sin(phase * Math.PI * 2))
        } else {
          e.ledMat.emissiveIntensity = 0.9
        }
      }
    },
    /** 设备运行状态 → 状态灯/电源按钮（与 2D ledColor 一致） */
    setStatus(status) {
      for (const key of ['pwr', 'sys', 'stat']) {
        const c = ledColorFor(status, key)
        ledMats[key].color.setHex(c)
        ledMats[key].emissive.setHex(c)
      }
      if (ledMats.powerBtn) {
        const c = status === 'offline' ? 0x555555 : 0x22aa44
        ledMats.powerBtn.color.setHex(c)
        ledMats.powerBtn.emissive.setHex(c)
      }
    },
    /** 释放本模型独占资源（模块级共享的 PORT_GEO/LABEL_GEO/标签纹理必须跳过） */
    dispose() {
      group.traverse(o => {
        if (o.isMesh || o.isLine) {
          if (o.geometry && !SHARED_RESOURCES.has(o.geometry)) o.geometry.dispose()
          if (o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material]
            mats.forEach(m => {
              if (m.map && !SHARED_RESOURCES.has(m.map)) m.map.dispose()
              if (!SHARED_RESOURCES.has(m)) m.dispose()
            })
          }
        }
      })
      disposables.forEach(d => { if (!SHARED_RESOURCES.has(d) && d.dispose) d.dispose() })
    },
  }
  model.setStatus(device?.status)
  return model
}
