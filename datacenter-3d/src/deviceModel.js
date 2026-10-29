import * as THREE from 'three';
import { maxAnisotropy } from './texQuality.js';

// P2-5-3：机柜内设备面板纹理（CanvasTexture）按签名缓存，避免重复设备反复
// new CanvasTexture 造成的显存/CPU 浪费。签名含分辨率（faceW/faceH），保证
// 「缓存命中不改变视觉效果」。缓存为模块级，disposeFaceTextures() 在实例销毁时
// 统一 dispose 并清空，避免重挂后引用已 dispose 的纹理。
const _faceTexCache = new Map();

// ===========================================================================
// 精细设备 3D 模型（移植自 cockpit-rack-3d-model.html 的 buildDeviceModel3D）
//
// 与 src/rackModel.js 中「摆放用剪影」的区别：
//   - 真实进深机身 + 两侧挂耳（含与导轨方孔对齐的螺丝孔）
//   - 前面板贴 Canvas 绘制的设备面板纹理（品牌条 / 型号 / 端口阵列 / 状态灯）
//   - 背面按设备类别建模（服务器 PSU+风扇、网络设备接口+散热、配线架端口）
//   - 状态 LED 颜色与设备状态一致
//
// 用途：机柜详情视图（单台特写）使用本模块；机房整排视图使用简化剪影，
//       避免数十台机柜 × 精细模型的 draw call 爆炸。
// ===========================================================================

// 设备类型 → 真实外形尺寸（场景单位 = 10mm，依据各厂商公开规格）
const DEVICE_SPECS = {
  switch:   { w: 44, d: 40 },
  firewall: { w: 43, d: 34 },
  router:   { w: 44, d: 45 },
  compute:  { w: 46, d: 70 },
  storage:  { w: 46, d: 70 },
  patch:    { w: 45, d: 22 },
  fiber:    { w: 45, d: 23 },
  pdu:      { w: 45, d: 8 },
  kvm:      { w: 44, d: 36 },
  lb:       { w: 43, d: 53 },
};

// 厂商主色（用于面板品牌条与状态区分）
const VENDOR_ACCENT = {
  switch: '#2f9e44', firewall: '#e03131', router: '#1971c2',
  server: '#6741d9', storage: '#6741d9', patch_panel: '#868e96',
  fiber_tray: '#0c8599', pdu: '#f08c00', kvm: '#495057', lb: '#2f9e44',
};

const VENDOR_NAME = {
  switch: 'SWITCH', firewall: 'FIREWALL', router: 'ROUTER',
  server: 'SERVER', storage: 'STORAGE', patch_panel: 'PATCH PANEL',
  fiber_tray: 'FIBER', pdu: 'PDU', kvm: 'KVM', lb: 'LOAD BALANCER',
};

const U_UNIT = 4.445;   // 1U = 44.45mm（场景单位）
const EAR_W = 1.2;      // 单侧挂耳宽 ≈12mm

// 中文类别 → 源文件的英文 kind（与 DEVICE_SPECS 键对应）
const KIND_OF = {
  核心交换机: 'switch', 接入交换机: 'switch', 交换机: 'switch',
  边界防火墙: 'firewall', 防火墙: 'firewall',
  核心路由器: 'router', 路由器: 'router',
  计算服务器: 'compute', 服务器: 'compute',
  存储服务器: 'storage', 存储: 'storage',
  光纤配线架: 'fiber', 配线架: 'patch', 光纤盘: 'fiber',
  'PDU 电源': 'pdu', PDU: 'pdu', 配电: 'pdu',
  'KVM 切换器': 'kvm', KVM: 'kvm',
  负载均衡: 'lb',
};

function kindOf(dv) {
  if (dv.kind && DEVICE_SPECS[dv.kind]) return dv.kind;
  return KIND_OF[dv.n] || KIND_OF[dv.type] || 'compute';
}

/** 状态 → LED 颜色 */
function ledColorFor(status, type) {
  const offline = status === 'offline';
  if (type === 'pwr') return offline ? 0x555555 : 0x22aa44;
  if (offline) return 0x555555;
  if (status === 'alert') return 0xee3333;
  if (status === 'warning') return 0xffaa00;
  return 0x22aa44;
}

// ---- Canvas 面板纹理：品牌条 + 型号 + 端口阵列 + 状态灯 ----
// 画布宽高比必须与面片严格一致，否则端口格/品牌条会被拉伸压扁成细线。
// 面片尺寸（机柜局部原始单位）：宽 = iw（≈46.8），高 = h-0.6（1U≈3.85 / 2U≈8.29）。
// 故以 W=512 为基准，H 按比例推导，并对 1U 这类极扁面片保证最小可读高度。
function faceTexture(kind, accentHex, modelName, status, faceW, faceH) {
  // P2-5-3：按签名复用同一 CanvasTexture；命中则直接返回（不重建画布/纹理）
  const key = [kind, accentHex, modelName, status, faceW, faceH].join('|');
  if (_faceTexCache.has(key)) return _faceTexCache.get(key);
  const W = 512;
  const ratio = Math.max(0.08, faceH / faceW);   // 面片高宽比（1U≈0.082 / 2U≈0.177）
  const H = Math.max(48, Math.round(W * ratio));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');

  const accent = accentHex || '#4b9bff';
  const offline = status === 'offline';
  const stColor = offline ? '#555' : (status === 'alert' ? '#ee3333' : (status === 'warning' ? '#ffaa00' : '#22cc55'));
  const pwColor = offline ? '#555' : '#22aa44';

  // 机身底色（深灰 + 竖向渐变模拟金属拉丝）
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2c313a');
  g.addColorStop(0.5, '#22262d');
  g.addColorStop(1, '#1a1d22');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);

  // 顶部品牌条（高度按画布比例，最低 6px）
  const barH = Math.max(6, Math.round(H * 0.16));
  x.fillStyle = accent;
  x.fillRect(0, 0, W, barH);
  x.fillStyle = '#ffffff';
  x.font = `bold ${Math.max(8, Math.round(barH * 0.62))}px Arial, sans-serif`;
  x.textBaseline = 'middle';
  x.fillText(VENDOR_NAME[kind] || 'DEVICE', 8, barH / 2);

  // 型号/名称（品牌条右侧）
  x.fillStyle = '#c8ccd2';
  x.font = `${Math.max(7, Math.round(barH * 0.5))}px Arial, sans-serif`;
  x.textAlign = 'right';
  x.fillText(String(modelName || '').slice(0, 26), W - 8, barH / 2);
  x.textAlign = 'left';

  // 状态灯三点（PWR / SYS / STAT）
  const lampR = Math.max(2, Math.round(barH * 0.22));
  const lamps = [pwColor, stColor, stColor];
  for (let i = 0; i < 3; i++) {
    x.beginPath();
    x.arc(W - 96 + i * (lampR * 2.6), barH / 2, lampR, 0, Math.PI * 2);
    x.fillStyle = lamps[i];
    x.fill();
  }

  // 内容区（品牌条以下）
  const cy0 = barH + 2;
  const ch = H - cy0 - 2;
  if (ch <= 2) { /* 极扁面片（如 1U 配线架）仅保留品牌条 */ }

  const isNet = kind === 'switch' || kind === 'firewall' || kind === 'router' || kind === 'lb';
  const isPatch = kind === 'patch_panel' || kind === 'fiber_tray';
  const isServer = kind === 'compute' || kind === 'storage';

  if (isNet && ch > 8) {
    // 交换机/防火墙/路由器：双排 RJ45 端口 + 上行 SFP
    const rows = ch > 26 ? 2 : 1;
    const portH = Math.max(4, (ch - 4) / rows - 2);
    const cols = 12;
    const cw = (W - 30) / cols;
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < cols; i++) {
        const px = 15 + i * cw;
        const py = cy0 + 2 + r * (portH + 2);
        x.fillStyle = '#0c0d10';
        x.fillRect(px, py, cw - 3, portH);
        // LED 指示（亮起为绿）
        x.fillStyle = offline ? '#333' : '#1d8a4a';
        x.fillRect(px + 1, py + 1, Math.max(1, cw - 6), Math.max(1, portH * 0.22));
      }
    }
    // 上行 SFP 口（右侧）
    for (let i = 0; i < 2; i++) {
      x.fillStyle = '#0c0d10';
      x.fillRect(W - 26 + i * 11, cy0 + 2, 9, portH);
    }
  } else if (isPatch && ch > 8) {
    // 配线架：单排编号端口
    const cols = 16;
    const cw = (W - 30) / cols;
    const portH = Math.min(ch - 2, 22);
    for (let i = 0; i < cols; i++) {
      const px = 15 + i * cw;
      x.fillStyle = '#0c0d10';
      x.fillRect(px, cy0 + 2, cw - 3, portH);
      x.fillStyle = offline ? '#444' : '#2f6f8f';
      x.fillRect(px + 1, cy0 + 3, Math.max(1, cw - 6), 3);
      if (ch > 16) {
        x.fillStyle = '#8a929c';
        x.font = `${Math.max(6, Math.round(portH * 0.3))}px Arial`;
        x.fillText(String(i + 1), px + 2, cy0 + 2 + portH + 9);
      }
    }
  } else if (isServer && ch > 8) {
    // 服务器：前置拉手 + 硬盘仓 + 散热孔
    const hdW = Math.max(5, W * 0.02);
    for (const sx of [0, 1]) {
      x.fillStyle = '#9a9ea4';
      x.fillRect(sx === 0 ? 4 : W - 4 - hdW, cy0 + 2, hdW, ch - 4);
    }
    const bayW = (W - 60) / 4;
    for (let i = 0; i < 4; i++) {
      const px = 40 + i * bayW;
      x.fillStyle = '#14161a';
      x.fillRect(px, cy0 + 3, bayW - 6, ch * 0.52);
      x.fillStyle = offline ? '#333' : '#22aa44';
      x.fillRect(px + 3, cy0 + 6, 6, 3);
      x.fillStyle = '#6a6e75';
      x.fillRect(px + 3, cy0 + 12, Math.max(4, bayW * 0.55), 2);
    }
    // 散热孔点阵
    x.fillStyle = '#0a0b0d';
    const dotR = Math.max(1, Math.round(ch * 0.06));
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 26; i++) {
        x.fillRect(40 + i * ((W - 60) / 26), cy0 + ch * 0.62 + r * dotR * 1.8, dotR, dotR);
      }
    }
  } else if (ch > 6) {
    // 其它（PDU / KVM 等）：插座阵列
    const n = 8;
    const gap = (W - 30) / n;
    for (let i = 0; i < n; i++) {
      x.fillStyle = '#0c0d10';
      x.fillRect(15 + i * gap, cy0 + 2, gap - 5, Math.min(ch - 4, 16));
      x.fillStyle = offline ? '#444' : '#c9a227';
      x.fillRect(19 + i * gap, cy0 + 5, 7, 3);
    }
  }

  const t = new THREE.CanvasTexture(c);
  if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAnisotropy();
  _faceTexCache.set(key, t);
  return t;
}

/**
 * 构建单台设备的精细 3D 模型。
 * @param {object} dv 设备描述：{ n, u, h, st, ports, d }
 * @param {object} ctx 机柜几何上下文：{ U_H, T, RD, RAIL_SQ_X, FRONT_Z }
 * @returns {THREE.Group} 已定位到「机柜局部坐标、设备中心在原点」的组
 */
export function buildDeviceModel(dv, ctx) {
  const kind = kindOf(dv);
  const spec = DEVICE_SPECS[kind] || { w: 45, d: dv.d || 40 };
  const d = spec.d;
  const u = dv.h || 1;
  const h = u * ctx.U_H - 0.6;

  const group = new THREE.Group();
  group.name = 'device3d';

  const MAT = {
    body:   new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.52, metalness: 0.62 }),
    bezel:  new THREE.MeshStandardMaterial({ color: 0x22262d, roughness: 0.46, metalness: 0.66 }),
    ear:    new THREE.MeshStandardMaterial({ color: 0xb7bbc1, roughness: 0.42, metalness: 0.72 }),
    handle: new THREE.MeshStandardMaterial({ color: 0x9a9ea4, roughness: 0.38, metalness: 0.76 }),
    portOut: new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.7, metalness: 0.3 }),
    vent:   new THREE.MeshStandardMaterial({ color: 0x0a0b0d, roughness: 0.85, metalness: 0.2 }),
    psu:    new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.5, metalness: 0.6 }),
    metal:  new THREE.MeshStandardMaterial({ color: 0x6a6e75, roughness: 0.4, metalness: 0.8 }),
  };

  // 机身宽度由机柜方孔列决定，保证挂耳与导轨对齐
  const iw = 2 * (ctx.RAIL_SQ_X - EAR_W / 2);
  const body = new THREE.Mesh(new THREE.BoxGeometry(iw, h - 0.3, d), MAT.body);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // 两侧挂耳 + 螺丝孔（与导轨方孔对齐：每 U 取 1/6、5/6 处两孔）
  const earGeo = new THREE.BoxGeometry(EAR_W, h, d);
  const screwGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.2, 10);
  const uCount = Math.max(1, Math.round(u));
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, MAT.ear);
    ear.position.set(sx * ctx.RAIL_SQ_X, 0, 0);
    ear.castShadow = true;
    group.add(ear);
    for (let m = 0; m < uCount; m++) {
      for (const frac of [1 / 6, 5 / 6]) {
        const sy = -h / 2 + (m + frac) * ctx.U_H;
        const screw = new THREE.Mesh(screwGeo, MAT.metal);
        screw.rotation.x = Math.PI / 2;
        screw.position.set(sx * ctx.RAIL_SQ_X, sy, d / 2 + 0.36);
        group.add(screw);
      }
    }
  }

  // 前面板（Canvas 纹理：品牌条 / 型号 / 端口阵列 / 状态灯）
  // 材质用 MeshBasicMaterial：与源文件一致，让面板纹理按原样显示、不受场景光照压暗，
  // 从而保证品牌条/端口格/状态灯在任意视角下都清晰可辨。
  const fz = d / 2 + 0.05;
  const faceW = iw, faceH = h - 0.6;
  const faceMat = new THREE.MeshBasicMaterial({
    map: faceTexture(kind, VENDOR_ACCENT[kind === 'compute' ? 'server' : (kind === 'patch' ? 'patch_panel' : kind)], dv.n, dv.st, faceW, faceH),
  });
  // 面板纹理来自模块级缓存（P2-5-3），标记 shared 使 scene/rackDetailView 的
  // 释放逻辑跳过它（否则缓存被提前 dispose 后，下一台设备会复用到已销毁的纹理）。
  faceMat.userData.shared = true;
  const facePlane = new THREE.Mesh(new THREE.PlaneGeometry(faceW, faceH), faceMat);
  facePlane.position.set(0, 0, fz);
  group.add(facePlane);
  // 上下金属横梁（边框）
  for (const sy of [faceH / 2 - 0.15, -(faceH / 2 - 0.15)]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(faceW + 0.4, 0.7, 0.5), MAT.bezel);
    beam.position.set(0, sy, fz + 0.2);
    group.add(beam);
  }

  // 服务器/存储：前置拉手
  if (kind === 'compute' || kind === 'storage') {
    const handleGeo = new THREE.BoxGeometry(0.5, h * 0.42, 1.6);
    for (const sx of [-1, 1]) {
      const hd = new THREE.Mesh(handleGeo, MAT.handle);
      hd.position.set(sx * (iw / 2 + 0.1), 0, d / 2 + 0.6);
      hd.castShadow = true;
      group.add(hd);
    }
  }

  // ---- 背面结构 ----
  const backZ = -d / 2 - 0.3;
  const backPlate = new THREE.Mesh(new THREE.BoxGeometry(iw, h - 0.3, 0.3), MAT.bezel);
  backPlate.position.z = backZ;
  group.add(backPlate);

  if (kind === 'compute' || kind === 'storage') {
    // PSU ×2 + 风扇 ×4 + 管理口 ×2
    const psuGeo = new THREE.BoxGeometry(4.2, h * 0.34, 2.6);
    for (const sx of [-1, 1]) {
      const psu = new THREE.Mesh(psuGeo, MAT.psu);
      psu.position.set(sx * (iw / 2 - 2.6), 0, backZ - 1.5);
      group.add(psu);
    }
    const fanRingGeo = new THREE.TorusGeometry(0.95, 0.12, 8, 20);
    const fanBladeGeo = new THREE.CylinderGeometry(0.72, 0.72, 0.1, 18);
    for (let i = 0; i < 4; i++) {
      const fx = -iw / 2 + 4.5 + (i % 2) * 3.2;
      const fy = (i < 2 ? 1 : -1) * (h * 0.22);
      const ring = new THREE.Mesh(fanRingGeo, MAT.vent);
      ring.position.set(fx, fy, backZ - 0.2);
      group.add(ring);
      const blade = new THREE.Mesh(fanBladeGeo, MAT.metal);
      blade.rotation.x = Math.PI / 2;
      blade.position.set(fx, fy, backZ - 0.25);
      group.add(blade);
    }
    const mgmtGeo = new THREE.BoxGeometry(1.05, 0.85, 0.4);
    for (let i = 0; i < 2; i++) {
      const mp = new THREE.Mesh(mgmtGeo, MAT.portOut);
      mp.position.set(iw / 2 - 3 - i * 1.6, -h * 0.3, backZ - 0.2);
      group.add(mp);
    }
  } else if (kind === 'switch' || kind === 'firewall' || kind === 'router' || kind === 'lb') {
    // 背面接口阵列 + 散热区
    const bpGeo = new THREE.BoxGeometry(1.05, 0.85, 0.4);
    const n = Math.min(Number(dv.ports) || 12, 12);
    for (let i = 0; i < n; i++) {
      const bp = new THREE.Mesh(bpGeo, MAT.portOut);
      bp.position.set(-iw / 2 + 2 + i * 1.5, h * 0.28, backZ - 0.2);
      group.add(bp);
    }
    const vent = new THREE.Mesh(new THREE.BoxGeometry(3.5, h * 0.4, 0.2), MAT.vent);
    vent.position.set(iw / 2 - 3, -h * 0.28, backZ - 0.2);
    group.add(vent);
  } else if (kind === 'patch' || kind === 'fiber') {
    // 配线架背面端口
    const pdGeo = new THREE.BoxGeometry(0.8, 0.5, 0.3);
    const n = Math.min(Number(dv.ports) || 24, 24);
    for (let i = 0; i < n; i++) {
      const pd = new THREE.Mesh(pdGeo, MAT.portOut);
      pd.position.set(-iw / 2 + 2 + (i % 12) * 1.4, (i < 12 ? 0.7 : -0.7), backZ - 0.2);
      group.add(pd);
    }
  } else if (kind === 'pdu') {
    // PDU：前置插座
    const soGeo = new THREE.BoxGeometry(0.9, 0.7, 0.35);
    for (let i = 0; i < 8; i++) {
      const so = new THREE.Mesh(soGeo, MAT.portOut);
      so.position.set(-iw / 2 + 3 + i * 2.1, 0, d / 2 + 0.1);
      group.add(so);
    }
  }

  group.userData.device = dv;
  group.userData.kind = 'device3d';
  return group;
}

// 统一释放模块级缓存的设备面板纹理（实例销毁时由 main.js 调用），dispose 后清空，
// 保证下次进入场景重建全新纹理，不引用已 dispose 的纹理。
export function disposeFaceTextures() {
  for (const t of _faceTexCache.values()) {
    try { if (typeof t.dispose === 'function') t.dispose(); } catch (_) { /* 忽略 */ }
  }
  _faceTexCache.clear();
}

export { DEVICE_SPECS, kindOf, U_UNIT, EAR_W };
