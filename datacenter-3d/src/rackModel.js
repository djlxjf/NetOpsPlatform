import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildDeviceModel } from './deviceModel.js';
import { STATUS_COLOR_NUM } from './themeTokens.js';
import { maxAnisotropy } from './texQuality.js';

// ===========================================================================
// 设备 3D 模型库（移植自 cockpit-rack-3d-model.html）
// 原始建模单位：1 单位 = 10mm；导出前整体缩放 0.01 → 本项目 1 单位 = 1m
// 机柜外廓：600mm 宽 × 1000mm 深 × 1995mm 高（标准 19" 42U）
// 前后门为独立枢轴 Group（detail 视图可开合），柜体按材质合并几何体
// ===========================================================================

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, x: c.getContext('2d') };
}

/* 19" 方孔导轨纹理：方孔 + U 编号 + U 边界线（42U，每 U 3 孔） */
function railTex(RH, T, mirror = false) {
  const U = 42, ch = 44, W = 168, { c, x } = cv(W, U * ch);
  const g = x.createLinearGradient(0, 0, 0, U * ch);
  g.addColorStop(0, '#d8d9db'); g.addColorStop(0.5, '#dcdddf'); g.addColorStop(1, '#d2d3d5');
  x.fillStyle = g; x.fillRect(0, 0, W, U * ch);
  x.strokeStyle = '#9a9b9d'; x.lineWidth = 1; x.strokeRect(0.5, 0.5, W - 1, U * ch - 1);

  const RAIL_W_3D = 2.47;
  const RAIL_H_3D = RH - 2 * T;
  const SQ_3D = (RAIL_H_3D / U) / 6;
  const sqW = SQ_3D / RAIL_W_3D * W;
  const sqH = SQ_3D / RAIL_H_3D * (U * ch);
  const holeX = mirror ? 8 : W - sqW - 8;
  const numCX = mirror ? (holeX + sqW + 6 + (W - 4)) / 2 : (4 + holeX - 6) / 2;
  const LINE_W = (1.4 / 36) * ch;
  x.fillStyle = '#1a1a1a';
  for (let u = 0; u <= U; u++) x.fillRect(0, u * ch - LINE_W / 2, W, LINE_W);

  const TEXT_K = (RAIL_H_3D / (U * ch)) / (RAIL_W_3D / W);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let u = 0; u < U; u++) {
    const b = u * ch;
    for (const f of [1 / 6, 1 / 2, 5 / 6]) {
      const cy = b + ch * f;
      x.fillStyle = '#0a0a0a'; x.fillRect(holeX, cy - sqH / 2, sqW, sqH);
      x.strokeStyle = '#6f7174'; x.lineWidth = 0.8;
      x.strokeRect(holeX + 0.5, cy - sqH / 2 + 0.5, sqW - 1, sqH - 1);
    }
    x.save();
    x.translate(numCX, b + ch / 2);
    x.scale(TEXT_K, 1);
    x.fillStyle = '#15171b';
    x.font = '11px Arial, sans-serif';
    x.fillText(String(U - u).padStart(2, '0'), 0, 0);
    x.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = maxAnisotropy(); t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}

/* 细密蜂窝穿孔纹理（后门） */
function fineHoneycomb() {
  const R = 56;
  const W = Math.round(Math.sqrt(3) * R), H = 3 * R;
  const { c, x } = cv(W, H);
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'destination-out';
  const rHole = R * 0.66;
  for (let r = -1; r * 1.5 * R < H + 1.5 * R; r++) {
    const y = r * 1.5 * R, off = (r & 1) ? W / 2 : 0;
    for (let col = -1; col * W <= W; col++) {
      const hx = col * W + off;
      x.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + i * Math.PI / 3;
        const px = hx + Math.cos(a) * rHole, py = y + Math.sin(a) * rHole;
        i ? x.lineTo(px, py) : x.moveTo(px, py);
      }
      x.closePath(); x.fill();
    }
  }
  x.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAnisotropy();
  return t;
}

/* 拉丝金属纹理（侧板） */
function brushed(base = '#2c2c2c') {
  const S = 256, { c, x } = cv(S, S);
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 2400; i++) {
    x.strokeStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
    x.lineWidth = Math.random() * 1.4;
    const y = Math.random() * S;
    x.beginPath(); x.moveTo(0, y); x.lineTo(S, y + (Math.random() - 0.5) * 2); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAnisotropy();
  return t;
}

let _M = null;
function mats() {
  if (_M) return _M;
  const RW = 60, RD = 100, RH = 199.5, T = 3;
  const honeyInnerW = 58.8 - 2 * 2.6, honeyInnerH = 198.3 - 2 * 2.6;
  const texHoney = fineHoneycomb();
  texHoney.repeat.set(honeyInnerW / (Math.sqrt(3) * 0.30), honeyInnerH / (3 * 0.30));
  _M = {
    // 以下配色严格对齐 cockpit-rack-3d-model.html 的 M 对象
    frame: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.72 }),
    frameTop: new THREE.MeshStandardMaterial({ color: 0x32323a, roughness: 0.45, metalness: 0.8 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.48, metalness: 0.76 }),
    side: new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.82, metalness: 0.2 }),
    railL: new THREE.MeshStandardMaterial({ color: 0xd8d9db, roughness: 0.32, metalness: 0.9, map: railTex(RH, T, false) }),
    railR: new THREE.MeshStandardMaterial({ color: 0xd8d9db, roughness: 0.32, metalness: 0.9, map: railTex(RH, T, true) }),
    glass: new THREE.MeshStandardMaterial({ color: 0x8fb8d8, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false }),
    hinge: new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.32, metalness: 0.95 }),
    handle: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.7 }),
    lock: new THREE.MeshStandardMaterial({ color: 0x8f9094, roughness: 0.3, metalness: 0.95 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.85, metalness: 0.1 }),
    port: new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.35, metalness: 0.7 }),
    // 后门蜂窝穿孔板（源文件 honeyMat：近黑 + alphaTest 真实镂空，无黑色背衬）
    honey: new THREE.MeshStandardMaterial({ color: 0x0a0b0e, map: texHoney, alphaTest: 0.5, roughness: 0.55, metalness: 0.5, side: THREE.DoubleSide }),
    // 顶部走线口开孔（源文件 0x050505, roughness 1）与毛刷丝（源文件 0x1c1c1c, roughness 0.9）
    slotDark: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 }),
    brush: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.9 }),
    // ---- 以下仅用于「摆放/整排剪影」构建（collectInteriorParts），柜体本体不用 ----
    dark: new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 1 }),
    inner: new THREE.MeshStandardMaterial({ color: 0x4e5764, roughness: 0.5, metalness: 0.55, emissive: 0x161c26, emissiveIntensity: 0.6 }),
    panel: new THREE.MeshStandardMaterial({ color: 0x5a6472, roughness: 0.45, metalness: 0.55 }),
    ear: new THREE.MeshStandardMaterial({ color: 0xd2d6db, roughness: 0.4, metalness: 0.65 }),
    ledG: new THREE.MeshBasicMaterial({ color: STATUS_COLOR_NUM.normal }),
    ledA: new THREE.MeshBasicMaterial({ color: STATUS_COLOR_NUM.warning }),
    ledR: new THREE.MeshBasicMaterial({ color: STATUS_COLOR_NUM.fault }),
    ledN: new THREE.MeshBasicMaterial({ color: 0x8a929c }),
  };
  // 标记为跨实例共享：场景销毁时会遍历场景 dispose 材质，
  // 若不标记，_M 会被释放却仍被缓存复用（HMR / 重挂后材质异常）
  for (const m of Object.values(_M)) m.userData.shared = true;
  return _M;
}

/**
 * 释放模块级共享材质缓存。
 * 供场景销毁（切页 / HMR / 重挂）时调用：先释放旧 _M，再置空，
 * 下次 mats() 会重建一套全新的材质，避免复用已 dispose 的对象。
 */
export function disposeSharedMaterials() {
  if (!_M) return;
  for (const m of Object.values(_M)) {
    if (m.map && typeof m.map.dispose === 'function') m.map.dispose();
    if (typeof m.dispose === 'function') m.dispose();
  }
  _M = null;
}

// 柜内设备清单（与 cockpit-rack-3d-model.html 一致）
const DEVICES = [
  { n: '核心交换机', u: 1, h: 2, st: 'online', ports: 16, d: 40 },
  { n: '光纤配线架', u: 3, h: 1, st: 'neutral', ports: 16, d: 23 },
  { n: '计算服务器', u: 4, h: 2, st: 'online', ports: 4, d: 70 },
  { n: '边界防火墙', u: 6, h: 1, st: 'alert', ports: 8, d: 34 },
  { n: '计算服务器', u: 7, h: 2, st: 'online', ports: 4, d: 70 },
  { n: '核心路由器', u: 9, h: 1, st: 'warning', ports: 6, d: 45 },
  { n: '存储服务器', u: 10, h: 2, st: 'offline', ports: 4, d: 70 },
  { n: '接入交换机', u: 12, h: 1, st: 'online', ports: 16, d: 40 },
  { n: '负载均衡', u: 13, h: 1, st: 'online', ports: 8, d: 53 },
  { n: '计算服务器', u: 14, h: 2, st: 'online', ports: 4, d: 70 },
  { n: 'KVM 切换器', u: 16, h: 1, st: 'online', ports: 4, d: 36 },
  { n: '计算服务器', u: 17, h: 2, st: 'online', ports: 4, d: 70 },
  { n: '配线架', u: 19, h: 1, st: 'neutral', ports: 16, d: 22 },
  { n: '存储服务器', u: 20, h: 2, st: 'online', ports: 4, d: 70 },
  { n: '接入交换机', u: 22, h: 1, st: 'warning', ports: 16, d: 40 },
  { n: '计算服务器', u: 23, h: 2, st: 'online', ports: 4, d: 70 },
  { n: 'PDU 电源', u: 25, h: 1, st: 'online', ports: 6, d: 10 },
  { n: '计算服务器', u: 26, h: 2, st: 'online', ports: 4, d: 70 },
  { n: '光纤配线架', u: 28, h: 1, st: 'neutral', ports: 16, d: 23 },
  { n: '计算服务器', u: 29, h: 2, st: 'online', ports: 4, d: 70 },
];
const LED_KEY = { online: 'ledG', alert: 'ledR', warning: 'ledA', offline: 'ledN', neutral: 'ledN' };

// ---------------------------------------------------------------------------
// 机柜几何收集（原始单位，origin=柜体底部中心；门体在枢轴局部坐标）
// ---------------------------------------------------------------------------
function collectCabinetParts() {
  const RW = 60, RD = 100, RH = 199.5, T = 3, PLINTH = 9;
  const DOOR_W = RW - 1.2, DOOR_H = RH - 1.2, BW = 2.6, DY = DOOR_H / 2, DOOR_OFF = DOOR_W / 2;
  const PIVOT_X = -(RW / 2 - 0.6);
  const RAIL_INNER_X = 23.5, RAIL_FACE_W = 2.47, RAIL_FRONT_Z = RD / 2 - T - 0.8;

  const body = [], front = [], rear = [];
  const add = (arr, geo, mat, x, y, z, rot) => {
    if (rot) {
      if (rot.rx) geo.rotateX(rot.rx);
      if (rot.ry) geo.rotateY(rot.ry);
      if (rot.rz) geo.rotateZ(rot.rz);
    }
    geo.translate(x, y, z);
    arr.push({ geo, mat });
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // 圆角立柱
  const postGeo = () => {
    const s = new THREE.Shape(), w = T, d = T, r = 0.9, x = -w / 2, y = -d / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
    s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    const g = new THREE.ExtrudeGeometry(s, { depth: RH, bevelEnabled: true, bevelSize: 0.4, bevelThickness: 0.4, bevelSegments: 2 });
    g.rotateX(-Math.PI / 2);
    return g;
  };
  const postX = RW / 2 - T / 2, postZ = RD / 2 - T / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(body, postGeo(), 'frame', sx * postX, 0, sz * postZ);
  // 顶/底框架横梁
  for (const sy of [-1, 1]) {
    const y = sy > 0 ? RH - T / 2 : T / 2;
    add(body, box(RW, T, T), 'metal', 0, y, -postZ);
    add(body, box(RW, T, T), 'metal', 0, y, postZ);
    add(body, box(T, T, RD), 'metal', -postX, y, 0);
    add(body, box(T, T, RD), 'metal', postX, y, 0);
  }
  // 左右侧板 + 拉手 + 锁件
  for (const sx of [-1, 1]) {
    add(body, box(1, RH - 2 * T, RD - 2 * T), 'side', sx * (RW / 2 - 0.7), RH / 2, 0);
    add(body, box(0.4, 12, 3.2), 'handle', sx * (RW / 2 - 1.2), RH / 2, -2);
    add(body, new THREE.CylinderGeometry(1.1, 1.1, 1.2, 12), 'lock', sx * (RW / 2 - 1.6), RH / 2, RD / 2 - 4, { rz: Math.PI / 2 });
  }
  // 注意：源文件明确「内背板已移除：保证机柜前后通透（从前玻璃可见后门蜂窝、
  // 从后门孔洞可见前侧设备）」。虽然源文件定义了 innerBg 材质，但全文未使用，
  // 故此处不建背板——柜内可见性靠柜内点光源 + 设备面板自发光纹理解决。
  // 19" 方孔导轨
  for (const sx of [-1, 1]) {
    add(body, box(RAIL_FACE_W, RH - 2 * T, 0.2), sx < 0 ? 'railL' : 'railR',
      sx * (RAIL_INNER_X + RAIL_FACE_W / 2), RH / 2, RAIL_FRONT_Z - 0.1);
    add(body, box(0.2, RH - 2 * T, 1.2), 'metal',
      sx * (RAIL_INNER_X + RAIL_FACE_W + 0.1), RH / 2, RAIL_FRONT_Z - 0.8);
  }
  // 前门（枢轴局部坐标：铰链在左缘）
  for (const [w, h, x, y] of [
    [DOOR_W, BW, DOOR_OFF, DOOR_H - BW / 2], [DOOR_W, BW, DOOR_OFF, BW / 2],
    [BW, DOOR_H, DOOR_OFF - (DOOR_W / 2 - BW / 2), DY], [BW, DOOR_H, DOOR_OFF + (DOOR_W / 2 - BW / 2), DY],
  ]) {
    add(front, box(w, h, 1), 'metal', x, y, 0);
  }
  add(front, new THREE.PlaneGeometry(DOOR_W - 2 * BW, DOOR_H - 2 * BW), 'glass', DOOR_OFF, DY, 0.8);
  add(front, box(3.4, 20, 1.8), 'handle', DOOR_W - 8, DY, 1.6);
  add(front, new THREE.CylinderGeometry(1.7, 1.7, 1.4, 16), 'lock', DOOR_W - 8, DY + 15, 1.4, { rx: Math.PI / 2 });
  // 后门（枢轴局部坐标）
  for (const [w, h, x, y] of [
    [DOOR_W, BW, DOOR_OFF, DOOR_H - BW / 2], [DOOR_W, BW, DOOR_OFF, BW / 2],
    [BW, DOOR_H, DOOR_OFF - (DOOR_W / 2 - BW / 2), DY], [BW, DOOR_H, DOOR_OFF + (DOOR_W / 2 - BW / 2), DY],
  ]) {
    add(rear, box(w, h, 1), 'metal', x, y, 0);
  }
  add(rear, new THREE.PlaneGeometry(DOOR_W - 2 * BW, DOOR_H - 2 * BW), 'honey', DOOR_OFF, DY, -0.45);
  add(rear, box(3.2, 9, 1.8), 'handle', DOOR_W - 8, RH * 0.5, 1.4);
  // 顶部：盖板 + 走线口毛刷 + 风扇
  add(body, box(RW - 2 * T, 0.8, RD - 2 * T), 'metal', 0, RH - T + 0.4, 0);
  // 前/后走线口：开孔 + 13 根独立毛刷（源文件为逐根建模的刷丝，非整块）
  for (const sz of [1, -1]) {
    add(body, box(RW - 12, 0.5, 14), 'slotDark', 0, RH - T + 0.85, sz * (RD / 2 - 11));
    for (let i = -6; i <= 6; i++) {
      add(body, box(1.2, 1.6, 12), 'brush', i * 2.4, RH - T + 1.3, sz * (RD / 2 - 11));
    }
  }
  // 风扇位（2 只）：外圈 + 7 叶扇叶 + 轴心
  for (const sx of [-1, 1]) {
    add(body, new THREE.TorusGeometry(5.4, 0.7, 8, 28), 'metal', sx * 13, RH - T + 1.1, 0, { rx: Math.PI / 2 });
    add(body, new THREE.CylinderGeometry(5.0, 5.0, 0.4, 7), 'metal', sx * 13, RH - T + 1.1, 0);
    add(body, new THREE.CylinderGeometry(1.5, 1.5, 0.9, 12), 'metal', sx * 13, RH - T + 1.1, 0);
  }
  // 底部：底板 + 脚轮 + 支撑脚
  add(body, box(RW - 2 * T, 1.2, RD - 2 * T), 'metal', 0, -0.6, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cx = sx * postX, cz = sz * postZ, fx = cx - sx * 5;
    // 脚轮（移动用）：滚轮 + 两侧叉架 + 顶板
    add(body, new THREE.CylinderGeometry(2.6, 2.6, 2.4, 20), 'rubber', cx, -PLINTH + 2.6, cz, { rz: Math.PI / 2 });
    add(body, box(2.2, 5.6, 0.8), 'metal', cx, -3.6, cz - 2.4);
    add(body, box(2.2, 5.6, 0.8), 'metal', cx, -3.6, cz + 2.4);
    add(body, box(5, 1.4, 8), 'metal', cx, -0.8, cz);
    // 可调支撑脚（落地调平）：脚垫 + 螺杆 + 六角调节螺母
    add(body, new THREE.CylinderGeometry(2.4, 2.4, 1.2, 20), 'rubber', fx, -PLINTH + 0.6, cz);
    add(body, new THREE.CylinderGeometry(0.7, 0.7, 6, 12), 'metal', fx, -PLINTH + 5.4, cz);
    add(body, new THREE.CylinderGeometry(1.6, 1.6, 1.2, 6), 'metal', fx, -2.0, cz);
  }
// 导轨方孔列中心世界 x（与 railTex 纹理方孔位置严格一致，是挂耳螺丝孔对齐的单一事实源）
  // 推导与源文件 cockpit-rack-3d-model.html 的 RAIL_SQ_X 完全一致
  const RAIL_SQ_X = (() => {
    const U = 42, W = 168, RAIL_W_3D = 2.47;
    const SQ_3D = ((RH - 2 * T) / U) / 6;
    const sqW = SQ_3D / RAIL_W_3D * W;
    const holeCenterU = (W - sqW / 2 - 8) / W;   // 左轨非镜像：方孔靠内缘单列
    const railOuterX = RAIL_INNER_X + RAIL_FACE_W; // 导轨前翼外缘
    return railOuterX - holeCenterU * RAIL_FACE_W;  // ≈24.0
  })();

  return {
    body, front, rear, RW, RD, RH, T, PLINTH, PIVOT_X, RAIL_FRONT_Z,
    RAIL_INNER_X, RAIL_FACE_W, RAIL_SQ_X,
    U_H: (RH - 2 * T) / 42,
  };
}

// 柜内设备（simple=摆放用剪影；detail=详情用完整面板/端口/挂耳）
// 支持外部传入 devices（与 DEVICES 同构：u/h/st/ports/d），实现“一柜一U位”的差异化设备
function collectInteriorParts(info, detail, devices) {
  const list = (devices && devices.length) ? devices : DEVICES;
  const parts = [];
  const add = (arr, geo, mat, x, y, z, rot) => {
    if (rot) {
      if (rot.rx) geo.rotateX(rot.rx);
      if (rot.rz) geo.rotateZ(rot.rz);
    }
    geo.translate(x, y, z);
    arr.push({ geo, mat });
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const FRONT_Z = info.RAIL_FRONT_Z - 0.6;
  for (const dv of list) {
    const hU = dv.h * info.U_H;
    const y = info.T + (dv.u - 1) * info.U_H + hU / 2;
    if (y > info.RH - info.T - 1) continue;
    const zc = FRONT_Z - dv.d / 2;
    add(parts, box(46, hU - 0.5, dv.d), 'inner', 0, y, zc);
    add(parts, box(1.1, 1.1, 0.4), LED_KEY[dv.st], -20, y + hU / 2 - 1.4, FRONT_Z - 0.2);
    add(parts, box(1.1, 1.1, 0.4), 'ledN', -18.4, y + hU / 2 - 1.4, FRONT_Z - 0.2);
    if (!detail) continue;
    // 详情：前面板 + 挂耳 + 散热孔条 + 端口阵列
    add(parts, box(44, hU - 1.2, 0.5), 'panel', 0, y, FRONT_Z - 0.3);
    for (const sx of [-1, 1]) {
      add(parts, box(1.2, hU * 0.7, 2.5), 'ear', sx * 22.8, y, FRONT_Z - 1.6);
    }
    add(parts, box(20, hU * 0.2, 0.35), 'dark', 12, y + hU / 2 - 1.6, FRONT_Z - 0.15);
    const cols = Math.ceil(dv.ports / 2) || 1;
    for (let i = 0; i < dv.ports; i++) {
      const px = -14 + (Math.floor(i / 2) * (28 / Math.max(1, cols - 1)));
      const py = y + (i % 2 === 0 ? -0.85 : 0.85);
      add(parts, box(1.5, 1.5, 0.4), 'port', px, py, FRONT_Z + 0.05);
    }
  }
  return parts;
}

function addMerged(group, parts, M) {
  const byMat = {};
  for (const p of parts) (byMat[p.mat] ||= []).push(p.geo);
  for (const mat in byMat) {
    const geos = byMat[mat].map((g) => (g.index ? g.toNonIndexed() : g));
    group.add(new THREE.Mesh(mergeGeometries(geos, false), M[mat]));
  }
}

function assemble(info, interiorParts) {
  const M = mats();
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(0.01);            // 原始单位(10mm) → 米
  body.position.y = info.PLINTH * 0.01;  // 脚轮触地
  root.add(body);
  addMerged(body, info.body, M);
  addMerged(body, interiorParts, M);
  const frontPivot = new THREE.Group();
  frontPivot.name = 'frontPivot';
  frontPivot.position.set(info.PIVOT_X, 0, info.RD / 2 - 0.4);
  addMerged(frontPivot, info.front, M);
  frontPivot.traverse((o) => { o.userData.door = 'front'; });
  body.add(frontPivot);
  const rearPivot = new THREE.Group();
  rearPivot.name = 'rearPivot';
  rearPivot.position.set(info.PIVOT_X, 0, -(info.RD / 2 - 0.4));
  addMerged(rearPivot, info.rear, M);
  rearPivot.traverse((o) => { o.userData.door = 'rear'; });
  body.add(rearPivot);
  return { root, frontPivot, rearPivot };
}

// 摆放用机柜（简易柜内剪影 + 门体枢轴）
// devices：可选，单柜设备清单（U 位/类别/状态）；缺省用默认 DEVICES
export function buildCabinetModel(devices = null) {
  const info = collectCabinetParts();
  return assemble(info, collectInteriorParts(info, false, devices)).root;
}

// 原始建模单位 1 单位 = 10mm；导出前整体缩放系数（与 assemble 中 body.scale 一致）
export const CABINET_SCALE = 0.01;

/**
 * 柜体本体（不含门）按材质合并后的几何批次，已缩放到米、含脚轮偏移。
 * 供 RackSystem 用 InstancedMesh 实例化全部同型机柜：
 * 把 N 台机柜各自的 ~18 个本体 mesh 压缩为 ~18 次 draw call（与机柜数量无关）。
 * 门（frontPivot / rearPivot）不在其中 —— 门需逐柜独立开合动画，由 RackSystem 逐柜克隆。
 * @returns {{batches:Array<{matKey:string,material:THREE.Material,geo:THREE.BufferGeometry}>, scale:number, plinthY:number, pivotX:number, depth:number}}
 */
export function getCabinetBodyBatches(devices = null) {
  const info = collectCabinetParts();
  const M = mats();
  const S = CABINET_SCALE;
  const parts = [...info.body, ...collectInteriorParts(info, false, devices)];
  const byMat = {};
  for (const p of parts) (byMat[p.mat] ||= []).push(p.geo);
  const batches = [];
  for (const mat in byMat) {
    const geos = byMat[mat].map((g) => {
      // 复制后再缩放/平移，避免污染 collectCabinetParts 创建的可复用原始几何
      const c = (g.index ? g.toNonIndexed() : g).clone();
      c.scale(S, S, S);
      c.translate(0, info.PLINTH * S, 0);
      return c;
    });
    batches.push({ matKey: mat, material: M[mat], geo: mergeGeometries(geos, false) });
  }
  return { batches, scale: S, plinthY: info.PLINTH * S, pivotX: info.PIVOT_X * S, depth: info.RD * S };
}

// 详情用机柜（完整柜内设备：面板/端口/挂耳）+ 可开合门枢轴
// 返回完整 { root, frontPivot, rearPivot } 对象（与 assemble 一致），
// 供 RackDetailView 的构造与 show() 按 model.root / frontPivot / rearPivot 取值
export function buildCabinetDetailModel(devices = null) {
  const info = collectCabinetParts();
  return assemble(info, collectInteriorParts(info, true, devices));
}

/**
 * 单台机柜精细特写模型（对齐 cockpit-rack-3d-model.html 的观感）。
 * 与 buildCabinetDetailModel 的区别：柜内每台设备都用 deviceModel.js 的
 * 精细 3D 模型（真实进深机身 + 挂耳螺丝 + Canvas 面板纹理 + 背面 PSU/风扇），
 * 而非合并后的剪影几何。用于详情视图的「单台特写」模式。
 * @returns {{root:THREE.Group, frontPivot, rearPivot}}
 */
export function buildCabinetShowcaseModel(devices = null) {
  const info = collectCabinetParts();
  const list = (devices && devices.length) ? devices : DEVICES;
  const M = mats();
  const ctx = {
    U_H: info.U_H, T: info.T, RD: info.RD,
    RAIL_SQ_X: info.RAIL_SQ_X,
    // 与源文件一致：设备正面 z = RD/2 - T - 0.6（注意源文件中
    // RAIL_FRONT_Z = RD/2 - T - 0.8 是导轨前端面，与设备 FRONT_Z 是两个不同常量）
    FRONT_Z: info.RD / 2 - info.T - 0.6,
  };

  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(0.01);            // 原始单位(10mm) → 米
  body.position.y = info.PLINTH * 0.01;  // 脚轮触地
  root.add(body);
  addMerged(body, info.body, M);

  // 注意：源文件不建柜内背板（保证前后通透），故此处同样不建。
  // 柜内可见性由 rackDetailView 的三盏柜内点光源 + 设备面板自发光纹理保证。

  // 逐台设备精细建模并定位到 U 位（公式与源文件完全一致）
  for (const dv of list) {
    const hU = dv.h * info.U_H - 0.6;
    const yBottom = info.T + (dv.u - 1) * info.U_H;
    const yc = yBottom + hU / 2;
    if (yc > info.RH - info.T - 1) continue;
    const D = (DEVICE_SPECS_MAP[dv.n] && DEVICE_SPECS_MAP[dv.n].d) || dv.d || 40;
    const dev = buildDeviceModel(dv, ctx);
    dev.position.set(0, yc, ctx.FRONT_Z - D / 2);
    dev.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    body.add(dev);
  }

  const frontPivot = new THREE.Group();
  frontPivot.name = 'frontPivot';
  frontPivot.position.set(info.PIVOT_X, 0, info.RD / 2 - 0.4);
  addMerged(frontPivot, info.front, M);
  frontPivot.traverse((o) => { o.userData.door = 'front'; });
  body.add(frontPivot);

  const rearPivot = new THREE.Group();
  rearPivot.name = 'rearPivot';
  rearPivot.position.set(info.PIVOT_X, 0, -(info.RD / 2 - 0.4));
  addMerged(rearPivot, info.rear, M);
  rearPivot.traverse((o) => { o.userData.door = 'rear'; });
  body.add(rearPivot);

  return { root, frontPivot, rearPivot };
}

// 设备类别 → 真实进深（mm→场景单位），供精细模型定位
const DEVICE_SPECS_MAP = {
  核心交换机: { d: 40 }, 接入交换机: { d: 40 }, 交换机: { d: 40 },
  边界防火墙: { d: 34 }, 防火墙: { d: 34 },
  核心路由器: { d: 45 }, 路由器: { d: 45 },
  计算服务器: { d: 70 }, 服务器: { d: 70 },
  存储服务器: { d: 70 }, 存储: { d: 70 },
  光纤配线架: { d: 23 }, 配线架: { d: 22 },
  'PDU 电源': { d: 8 }, PDU: { d: 8 },
  'KVM 切换器': { d: 36 }, KVM: { d: 36 },
  负载均衡: { d: 53 },
};

// ---------------------------------------------------------------------------
// 机房灭火器（米制建模）
// ---------------------------------------------------------------------------
export function buildExtinguisherModel() {
  const parts = [];
  const M = {
    red: new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.38, metalness: 0.35 }),
    black: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.55 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8f9094, roughness: 0.3, metalness: 0.9 }),
  };
  const add = (geo, mat, x, y, z, rot) => {
    if (rot) {
      if (rot.rx) geo.rotateX(rot.rx);
      if (rot.rz) geo.rotateZ(rot.rz);
    }
    geo.translate(x, y, z);
    parts.push({ geo, mat });
  };
  add(new THREE.CylinderGeometry(0.13, 0.15, 0.04, 20), 'black', 0, 0.02, 0);
  add(new THREE.CylinderGeometry(0.09, 0.11, 0.52, 20), 'red', 0, 0.30, 0);
  add(new THREE.CylinderGeometry(0.05, 0.09, 0.08, 16), 'red', 0, 0.60, 0);
  add(new THREE.CylinderGeometry(0.045, 0.045, 0.07, 16), 'metal', 0, 0.675, 0);
  add(new THREE.BoxGeometry(0.11, 0.022, 0.03), 'black', 0.01, 0.735, 0);
  add(new THREE.BoxGeometry(0.05, 0.05, 0.03), 'metal', -0.01, 0.718, 0);
  add(new THREE.CylinderGeometry(0.014, 0.014, 0.30, 10), 'black', 0.075, 0.60, 0.02, { rz: 0.5 });
  add(new THREE.CylinderGeometry(0.03, 0.02, 0.06, 12), 'black', 0.135, 0.45, 0.03, { rz: -0.35 });
  add(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 14), 'metal', 0, 0.70, 0.05, { rx: Math.PI / 2 });

  const byMat = {};
  for (const p of parts) (byMat[p.mat] ||= []).push(p.geo);
  const root = new THREE.Group();
  for (const mat in byMat) {
    const geos = byMat[mat].map((g) => (g.index ? g.toNonIndexed() : g));
    root.add(new THREE.Mesh(mergeGeometries(geos, false), M[mat]));
  }
  return root;
}
