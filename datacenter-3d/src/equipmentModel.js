import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { maxAnisotropy } from './texQuality.js';

// ===========================================================================
// 机房机电设备精细模型（空调机组 / 柜式气体灭火装置）
//
// 来源资产（独立展示页，Three.js r128 + CDN）：
//   E:/软件源代码/3D机房/空调3D模型.html        → 美的立式机房精密空调
//   E:/软件源代码/3D机房/output/七氟丙烷3D模型.html → 柜式 HFC-227ea 灭火装置
// 本模块把两者的几何/贴图移植进本工程的渲染体系，替换原先的占位方块
// （datacenter-3d/src/config.js 中 RACK.ac / RACK.cylinder 的实例化箱体）。
//
// 移植要点（r128 → r160）：
//   1. 色彩管理：r128 无色彩管理，源页需手工 convertSRGBToLinear()；r160 起
//      ColorManagement 默认开启，new THREE.Color(hex) 已自动 sRGB→Linear，
//      故此处**不得**再转一次（会二次转换发暗）。与 rackModel.js / deviceModel.js
//      保持一致，直接用十六进制原色。
//   2. 贴图：t.encoding = sRGBEncoding（r128）→ t.colorSpace = SRGBColorSpace。
//   3. 环境反射：源页自建 PMREM 环境贴图并写入 scene.environment；本工程
//      scene.js 已用 RoomEnvironment 统一提供 IBL，故此处不再私自覆盖
//      scene.environment（否则会污染整个机房的光照）。
//   4. 阴影：工程全局 shadowMap.enabled = false（仅机柜详情视图临时开启），
//      故模型不设 castShadow/receiveShadow，与 buildExtinguisherModel 一致。
//   5. 绘制批次：工程惯例是「按材质合并几何体」以压 draw call（见 rackModel.js
//      addMerged / deviceModel.js），源页的 InstancedMesh 百叶改为合并进同一
//      材质批次，视觉一致且 draw call 更省。
//
// 坐标约定（与本工程机柜一致）：
//   原点在设备底面中心，正面（操作面）朝 +Z，与 rackModel.js 的机柜前门同向，
//   这样 racks.js 的 placement（position.x/z + rotationY）无需任何特判。
// ===========================================================================

// ---------------------------------------------------------------------------
// Canvas 贴图工具
// ---------------------------------------------------------------------------
function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, x: c.getContext('2d') };
}

function roundRect(x, cx, cy, w, h, r) {
  x.beginPath();
  x.moveTo(cx + r, cy);
  x.lineTo(cx + w - r, cy);
  x.quadraticCurveTo(cx + w, cy, cx + w, cy + r);
  x.lineTo(cx + w, cy + h - r);
  x.quadraticCurveTo(cx + w, cy + h, cx + w - r, cy + h);
  x.lineTo(cx + r, cy + h);
  x.quadraticCurveTo(cx, cy + h, cx, cy + h - r);
  x.lineTo(cx, cy + r);
  x.quadraticCurveTo(cx, cy, cx + r, cy);
  x.closePath();
}

function toTexture(canvas, anisotropy = maxAnisotropy()) {
  const t = new THREE.CanvasTexture(canvas);
  if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

// ---------------------------------------------------------------------------
// 几何收集器：按材质合并，输出少量 mesh
// ---------------------------------------------------------------------------
class PartSet {
  constructor() { this.map = new Map(); }
  add(geo, matKey) {
    if (!this.map.has(matKey)) this.map.set(matKey, []);
    this.map.get(matKey).push(geo.index ? geo.toNonIndexed() : geo);
  }
  // 盒体：w(X) × h(Y) × d(Z)，中心定位后并入材质批次
  box(matKey, w, h, d, x, y, z) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    this.add(g, matKey);
    return g;
  }
  build(materials, parent) {
    for (const [key, geos] of this.map) {
      const merged = mergeGeometries(geos, false);
      const mesh = new THREE.Mesh(merged, materials[key]);
      parent.add(mesh);
    }
    this.map.clear();
  }
}

// ===========================================================================
// 一、美的立式机房精密空调
//    600mm(宽) × 1800mm(高) × 600mm(深)
//    构成：踢脚底座 / 机身 / 前立面饰板 / 顶盖 / 四角包边 / 竖向分缝 /
//          横向分缝 / 左右进风百叶（每侧 30 片）/ Midea 字标 /
//          绿色液晶控制屏 + 指示灯
// ===========================================================================
const AC = { W: 0.60, H: 1.80, D: 0.60 };
const AC_FRONT_Z = AC.D / 2;

function acLogoTexture() {
  const { c, x } = cv(512, 160);
  x.clearRect(0, 0, 512, 160);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = '#e9eff3';
  x.font = 'italic 700 86px "Trebuchet MS","Segoe UI",Arial,sans-serif';
  x.fillText('Midea', 256, 86);
  return toTexture(c);
}

function acScreenTexture() {
  const { c, x } = cv(256, 320);
  const grd = x.createLinearGradient(0, 0, 0, 320);
  grd.addColorStop(0, '#b3e46b');
  grd.addColorStop(0.5, '#9bd94f');
  grd.addColorStop(1, '#79bd3c');
  x.fillStyle = grd;
  x.fillRect(0, 0, 256, 320);
  // 左上深色内嵌块（对应实物屏幕左上角）
  x.fillStyle = 'rgba(38,74,20,0.30)';
  roundRect(x, 22, 22, 96, 62, 6);
  x.fill();
  // 极淡扫描线
  x.fillStyle = 'rgba(0,0,0,0.045)';
  for (let y = 0; y < 320; y += 4) x.fillRect(0, y, 256, 1);
  // 底部状态点
  x.fillStyle = 'rgba(30,60,14,0.55)';
  for (let i = 0; i < 3; i++) {
    x.beginPath();
    x.arc(104 + i * 16, 288, 4.5, 0, Math.PI * 2);
    x.fill();
  }
  return toTexture(c);
}

/**
 * 构建立式精密空调模型（米制，原点=底面中心，正面朝 +Z）。
 */
export function buildACModel() {
  const M = {
    body: new THREE.MeshStandardMaterial({ color: 0x3a3f44, roughness: 0.6, metalness: 0.25 }),
    bodyLight: new THREE.MeshStandardMaterial({ color: 0x434850, roughness: 0.56, metalness: 0.28 }),
    front: new THREE.MeshStandardMaterial({ color: 0x35393e, roughness: 0.64, metalness: 0.22 }),
    panel: new THREE.MeshStandardMaterial({ color: 0x2e3236, roughness: 0.58, metalness: 0.28 }),
    slat: new THREE.MeshStandardMaterial({ color: 0x1e2226, roughness: 0.45, metalness: 0.55 }),
    recess: new THREE.MeshStandardMaterial({ color: 0x111315, roughness: 0.9, metalness: 0.15 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x484f56, roughness: 0.32, metalness: 0.85 }),
    base: new THREE.MeshStandardMaterial({ color: 0x0d0f11, roughness: 0.75, metalness: 0.25 }),
    bezel: new THREE.MeshStandardMaterial({ color: 0x1d2023, roughness: 0.4, metalness: 0.55 }),
  };
  const logoMat = new THREE.MeshBasicMaterial({ map: acLogoTexture(), transparent: true, depthWrite: false });
  const screenTex = acScreenTexture();
  const screenMat = new THREE.MeshStandardMaterial({
    map: screenTex,
    emissiveMap: screenTex,
    emissive: 0x9fdc55,
    emissiveIntensity: 0.55,
    roughness: 0.22,
    metalness: 0,
  });
  const ledMat = new THREE.MeshStandardMaterial({
    color: 0x8fd14f, emissive: 0x8fd14f, emissiveIntensity: 1.6, roughness: 0.3,
  });

  const root = new THREE.Group();
  root.name = 'ac-model';
  const P = new PartSet();

  const bodyBottom = 0.05;
  const bodyHeight = AC.H - bodyBottom;          // 1.75
  const bodyCenterY = bodyBottom + bodyHeight / 2;

  // 踢脚底座
  P.box('base', 0.56, 0.05, 0.56, 0, 0.025, 0);
  // 机身
  P.box('body', AC.W, bodyHeight, AC.D, 0, bodyCenterY, 0);
  // 前立面饰板
  P.box('front', AC.W - 0.012, bodyHeight - 0.02, 0.012, 0, bodyCenterY, AC_FRONT_Z - 0.002);
  // 顶盖
  P.box('bodyLight', AC.W + 0.008, 0.014, AC.D + 0.008, 0, AC.H - 0.004, 0);

  // 四角纵向包边（方盒的立体转折）
  const tr = 0.007;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    P.box('trim', tr, bodyHeight, tr,
      sx * (AC.W / 2 - 0.0035), bodyCenterY, sz * (AC.D / 2 - 0.0035));
  }

  const FZ = AC_FRONT_Z + 0.005;
  // 竖向分缝
  for (const sx of [-1, 1]) {
    P.box('recess', 0.0045, bodyHeight - 0.02, 0.004, sx * 0.177, bodyCenterY, FZ + 0.001);
  }
  // 横向分缝（上下柜体分界）
  P.box('recess', AC.W - 0.012, 0.006, 0.004, 0, 0.50, FZ + 0.001);
  P.box('recess', AC.W - 0.012, 0.004, 0.004, 0, 1.69, FZ + 0.001);

  // 左右进风百叶：凹槽 + 边框 + 30 片斜向叶片
  const gW = 0.0905, gH = 1.046, gY = 1.072, gFW = 0.0045;
  for (const sx of [-1, 1]) {
    const gx = sx * 0.217;
    // 凹槽
    P.box('recess', gW, gH, 0.006, gx, gY, AC_FRONT_Z + 0.0035);
    // 边框（上下左右）
    P.box('panel', gW + 2 * gFW, gFW, 0.007, gx, gY + gH / 2, AC_FRONT_Z + 0.009);
    P.box('panel', gW + 2 * gFW, gFW, 0.007, gx, gY - gH / 2, AC_FRONT_Z + 0.009);
    P.box('panel', gFW, gH + 2 * gFW, 0.007, gx - gW / 2, gY, AC_FRONT_Z + 0.009);
    P.box('panel', gFW, gH + 2 * gFW, 0.007, gx + gW / 2, gY, AC_FRONT_Z + 0.009);
    // 30 片斜向叶片（源页用 InstancedMesh，此处并入同一材质批次）
    const slatGeo = new THREE.BoxGeometry(gW - 0.010, 0.0065, 0.020);
    const gap = gH / 30;
    for (let i = 0; i < 30; i++) {
      const g = slatGeo.clone();
      g.rotateX(-0.52);
      g.translate(gx, gY - gH / 2 + gap * (i + 0.5), AC_FRONT_Z + 0.0115);
      P.add(g, 'slat');
    }
    slatGeo.dispose();
  }

  P.build(M, root);

  // Midea 字标（独立平面，MeshBasic 保证不被光照压暗）
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.115, 0.036), logoMat);
  logo.position.set(0, 1.505, FZ + 0.006);
  root.add(logo);

  // 控制面板：面板框 + 内凹 + 液晶屏 + 指示灯
  const panel = new THREE.Group();
  panel.position.set(0, 1.400, FZ);
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.135, 0.014), M.bezel);
  bezel.position.z = 0.004;
  panel.add(bezel);
  const inset = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.122, 0.004), M.recess);
  inset.position.z = 0.012;
  panel.add(inset);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.072, 0.090), screenMat);
  screen.position.z = 0.0155;
  panel.add(screen);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.0032, 12, 12), ledMat);
  led.position.set(0.036, -0.056, 0.0165);
  panel.add(led);
  root.add(panel);

  return root;
}

// ===========================================================================
// 二、柜式七氟丙烷（HFC-227ea）气体灭火装置
//    柜体 600mm(宽) × 420mm(深) × 1890mm(高)
//    构成：钢制柜体（侧板/背板/顶底板/内衬）/ 顶盖 / 门上固定前脸 /
//          可开启钢门（丝印版式：正华同安 · 柜式气体灭火装置 · HFC-227ea ·
//          竖排「七氟丙烷」+ 把手锁芯 + 铰链）/ 柜内红色瓶组（瓶身 + 封头 +
//          抱箍 + 瓶架 + 容器阀 + 手轮 + 压力表 + 电磁驱动器）/
//          柜顶喷放管路（弯管 + 法兰 + 喷放口）
//
// 说明：柜门按「平时锁闭」的现场状态建模——柜式灭火装置的柜门在正常运行时
// 处于封闭锁闭状态，开启仅用于检修。故门体为固定闭合件，不接入工程的柜门
// 交互（工程柜门开合面向机柜 frontPivot/rearPivot 语义与碰撞判定，套用到
// 消防柜会引入无意义的误判）。柜内瓶组与柜顶管路完整建模，便于近距离检视。
// ===========================================================================
const HFC = { W: 0.62, D: 0.42, H: 1.81, Y0: 0.05, t: 0.018 };
const HFC_DOOR = { w: 0.574, h: 1.64 };
const FONT_CN = '"Microsoft YaHei","PingFang SC","Noto Sans SC","Source Han Sans SC",sans-serif';

function drawSpaced(x, text, cx, cy, font, color, gap) {
  x.save();
  x.font = font;
  x.fillStyle = color;
  x.textAlign = 'left';
  x.textBaseline = 'middle';
  const chars = text.split('');
  const widths = [];
  let total = 0;
  for (const ch of chars) { const w = x.measureText(ch).width; widths.push(w); total += w; }
  total += gap * (chars.length - 1);
  let px = cx - total / 2;
  for (let i = 0; i < chars.length; i++) { x.fillText(chars[i], px, cy); px += widths[i] + gap; }
  x.restore();
}

function drawArcText(x, text, cx, cy, radius, fontSize, color, gapRatio) {
  x.save();
  x.font = '600 ' + fontSize + 'px ' + FONT_CN;
  x.fillStyle = color;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const n = text.length;
  const step = (fontSize * (gapRatio || 1.14)) / radius;
  const start = -Math.PI / 2 - (step * (n - 1)) / 2;
  for (let i = 0; i < n; i++) {
    const a = start + step * i;
    x.save();
    x.translate(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    x.rotate(a + Math.PI / 2);
    x.fillText(text.charAt(i), 0, 0);
    x.restore();
  }
  x.restore();
}

function drawMark(x, cx, cy, s, color) {
  x.save();
  x.translate(cx, cy);
  x.scale(s, s);
  x.strokeStyle = color;
  x.lineJoin = 'round';
  x.lineCap = 'round';
  x.lineWidth = 3.6;
  x.beginPath();
  x.moveTo(0, -46);
  x.lineTo(42, -30);
  x.lineTo(42, 8);
  x.quadraticCurveTo(42, 40, 0, 55);
  x.quadraticCurveTo(-42, 40, -42, 8);
  x.lineTo(-42, -30);
  x.closePath();
  x.stroke();
  x.lineWidth = 2.6;
  for (let i = 0; i < 3; i++) {
    const oy = -8 + i * 14;
    x.beginPath();
    x.moveTo(-22, oy);
    x.quadraticCurveTo(-11, oy - 9, 0, oy);
    x.quadraticCurveTo(11, oy + 9, 22, oy);
    x.stroke();
  }
  x.restore();
}

/** 柜门正面丝印版式（浅灰烤漆钢板 + 红色丝印） */
function hfcDoorTexture() {
  const W = 768, H = 2192;
  const { c, x } = cv(W, H);
  const RED = '#bf2a2c', RED_DARK = '#a82527';

  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#e5e1d9');
  g.addColorStop(0.35, '#dcd8cf');
  g.addColorStop(0.72, '#d2cec4');
  g.addColorStop(1, '#c6c1b6');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);

  // 竖向拉丝（亮纹 + 暗纹两组，与源页一致：只有亮纹会显得过白失真）
  for (let i = 0; i < 420; i++) {
    x.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.035).toFixed(3) + ')';
    x.fillRect(Math.random() * W, 0, 1, H);
  }
  for (let i = 0; i < 120; i++) {
    x.fillStyle = 'rgba(90,84,74,' + (Math.random() * 0.02).toFixed(3) + ')';
    x.fillRect(Math.random() * W, 0, 1, H);
  }
  // 折边阴影
  const sideL = x.createLinearGradient(0, 0, 30, 0);
  sideL.addColorStop(0, 'rgba(60,55,48,.28)');
  sideL.addColorStop(1, 'rgba(60,55,48,0)');
  x.fillStyle = sideL; x.fillRect(0, 0, 30, H);
  const sideR = x.createLinearGradient(W, 0, W - 30, 0);
  sideR.addColorStop(0, 'rgba(60,55,48,.28)');
  sideR.addColorStop(1, 'rgba(60,55,48,0)');
  x.fillStyle = sideR; x.fillRect(W - 30, 0, 30, H);

  drawMark(x, W / 2, 186, 0.92, RED);
  drawSpaced(x, '正华同安', W / 2, 272, '700 44px ' + FONT_CN, RED, 6);
  drawArcText(x, '柜式气体灭火装置', W / 2, 812, 420, 60, RED, 1.16);
  drawSpaced(x, 'HFC-227ea', W / 2, 640, '600 42px ' + FONT_CN, RED, 3);

  // 竖排大字「七氟丙烷」
  const big = ['七', '氟', '丙', '烷'];
  const bigY = [1000, 1265, 1530, 1795];
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = RED_DARK;
  x.font = '700 192px ' + FONT_CN;
  for (let i = 0; i < 4; i++) {
    x.save();
    x.shadowColor = 'rgba(120,20,20,.18)';
    x.shadowBlur = 3;
    x.shadowOffsetY = 1;
    x.fillText(big[i], W / 2, bigY[i]);
    x.restore();
  }

  drawSpaced(x, '安徽正华同安消防科技有限公司', W / 2, 2032, '500 38px ' + FONT_CN, '#8f3a3c', 2);
  return toTexture(c);
}

/**
 * 构建柜式七氟丙烷灭火装置模型（米制，原点=底面中心，正面朝 +Z）。
 */
export function buildGasFireCabinetModel() {
  const M = {
    shell: new THREE.MeshStandardMaterial({ color: 0xd9d5cc, roughness: 0.56, metalness: 0.22 }),
    shellLight: new THREE.MeshStandardMaterial({ color: 0xe2ded6, roughness: 0.5, metalness: 0.24 }),
    shellEdge: new THREE.MeshStandardMaterial({ color: 0xc4bfb4, roughness: 0.6, metalness: 0.22 }),
    inner: new THREE.MeshStandardMaterial({ color: 0xbfbab0, roughness: 0.78, metalness: 0.1 }),
    doorBack: new THREE.MeshStandardMaterial({ color: 0xc8c4ba, roughness: 0.72, metalness: 0.14 }),
    base: new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.78, metalness: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x14171a, roughness: 0.55, metalness: 0.4 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xbfc6cc, roughness: 0.26, metalness: 0.95 }),
    steelDark: new THREE.MeshStandardMaterial({ color: 0x868d94, roughness: 0.35, metalness: 0.9 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb08a4e, roughness: 0.32, metalness: 0.95 }),
    bottle: new THREE.MeshStandardMaterial({ color: 0xb02a24, roughness: 0.4, metalness: 0.35 }),
    bottleCap: new THREE.MeshStandardMaterial({ color: 0x9d221d, roughness: 0.36, metalness: 0.4 }),
    gauge: new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.5, metalness: 0.05 }),
    blackPlate: new THREE.MeshStandardMaterial({ color: 0x1b1e21, roughness: 0.6, metalness: 0.3 }),
  };
  const doorFaceMat = new THREE.MeshStandardMaterial({ map: hfcDoorTexture(), roughness: 0.55, metalness: 0.16 });

  const root = new THREE.Group();
  root.name = 'gas-fire-cabinet';
  const P = new PartSet();
  const W = HFC.W, D = HFC.D, H = HFC.H, Y0 = HFC.Y0, t = HFC.t;
  const yMid = Y0 + H / 2;

  // ---- 柜体 ----
  P.box('base', W - 0.02, 0.05, D - 0.02, 0, 0.025, 0);
  P.box('dark', W - 0.06, 0.012, D - 0.06, 0, 0.052, 0);
  // 左右侧板
  P.box('shell', t, H, D, -(W / 2 - t / 2), yMid, 0);
  P.box('shell', t, H, D, (W / 2 - t / 2), yMid, 0);
  // 背板
  P.box('shell', W - 2 * t, H, t, 0, yMid, -(D / 2 - t / 2));
  // 顶板 / 底板
  P.box('shell', W - 2 * t, t, D - 2 * t, 0, Y0 + H - t / 2, 0);
  P.box('shell', W - 2 * t, t, D - 2 * t, 0, Y0 + t / 2, 0);
  // 内部衬板（开门后可见的浅灰内壁）
  P.box('inner', W - 2 * t - 0.004, 0.004, D - 2 * t - 0.004, 0, Y0 + t + 0.002, 0);
  P.box('inner', W - 2 * t - 0.004, H - 2 * t - 0.008, 0.004, 0, yMid, -(D / 2 - t + 0.002));
  // 门上固定前脸
  P.box('shellLight', HFC_DOOR.w, 0.155, 0.018, 0, 1.7825, 0.201);
  // 顶盖（略大于柜身形成边沿）
  P.box('shellLight', W + 0.016, 0.024, D + 0.016, 0, 1.872, 0);
  P.box('shellEdge', W + 0.02, 0.006, D + 0.02, 0, 1.862, 0);
  // 前脸三颗螺钉
  for (const sx of [0, 0.048, 0.096]) {
    const s = new THREE.CylinderGeometry(0.0055, 0.0055, 0.006, 10);
    s.rotateX(Math.PI / 2);
    s.translate(sx, 1.818, 0.212);
    P.add(s, 'dark');
  }
  // 门缝衬条（避免看穿到背板）
  P.box('dark', W - 2 * t - 0.01, 0.006, 0.02, 0, 1.699, 0.185);

  // ---- 柜门（闭合固定件）----
  // 源页门轴在右侧（x=+0.287）、门扇自门轴向 -X 展开；本模型为静态闭合件，
  // 故直接按世界坐标摆位：门扇居中（x=0），铰链在 +X 边、把手锁芯在 -X 边。
  const doorW = HFC_DOOR.w, doorH = HFC_DOOR.h;
  const doorY = 0.88, doorZ = 0.20;
  P.box('doorBack', doorW, doorH, 0.019, 0, doorY, doorZ);
  // 上下加强折边
  P.box('shellEdge', doorW, 0.008, 0.008, 0, doorY + doorH / 2 - 0.004, doorZ + 0.012);
  P.box('shellEdge', doorW, 0.008, 0.008, 0, doorY - doorH / 2 + 0.004, doorZ + 0.012);
  // 把手（-X 侧）+ 上下固定座
  const hx = -0.231;
  P.box('steel', 0.017, 0.235, 0.026, hx, doorY + 0.29, doorZ + 0.021);
  P.box('steelDark', 0.026, 0.03, 0.03, hx, doorY + 0.29 + 0.115, doorZ + 0.017);
  P.box('steelDark', 0.026, 0.03, 0.03, hx, doorY + 0.29 - 0.115, doorZ + 0.017);
  // 锁芯（把手下方）
  const lockOut = new THREE.CylinderGeometry(0.014, 0.014, 0.008, 18);
  lockOut.rotateX(Math.PI / 2);
  lockOut.translate(hx, doorY + 0.142, doorZ + 0.019);
  P.add(lockOut, 'steel');
  const lockKey = new THREE.CylinderGeometry(0.005, 0.005, 0.01, 12);
  lockKey.rotateX(Math.PI / 2);
  lockKey.translate(hx, doorY + 0.142, doorZ + 0.022);
  P.add(lockKey, 'dark');
  // 铰链（+X 侧，门轴处）
  for (const hy of [0.55, -0.55]) {
    P.box('steelDark', 0.012, 0.075, 0.024, 0.281, doorY + hy, doorZ - 0.004);
  }

  // ---- 柜内瓶组 ----
  const R = 0.135, yBase = 0.18, yTop = 1.02;
  const bz = -0.01;                          // 瓶组略偏柜内后侧
  const bottle = new THREE.CylinderGeometry(R, R, yTop - yBase, 40);
  bottle.translate(0, (yBase + yTop) / 2, bz);
  P.add(bottle, 'bottle');
  // 上下封头（压扁半球）
  const domeTop = new THREE.SphereGeometry(R, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2);
  domeTop.scale(1, 0.62, 1);
  domeTop.translate(0, yTop, bz);
  P.add(domeTop, 'bottleCap');
  const domeBot = new THREE.SphereGeometry(R, 40, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  domeBot.scale(1, 0.62, 1);
  domeBot.translate(0, yBase, bz);
  P.add(domeBot, 'bottle');
  // 瓶身装饰环
  const ring = new THREE.CylinderGeometry(R + 0.002, R + 0.002, 0.03, 40);
  ring.translate(0, 0.72, bz);
  P.add(ring, 'steelDark');
  // 铭牌
  P.box('gauge', 0.11, 0.14, 0.004, 0, 0.62, bz + R - 0.001);
  // 瓶口颈
  const neck = new THREE.CylinderGeometry(0.052, 0.058, 0.06, 24);
  neck.translate(0, yTop + 0.03, bz);
  P.add(neck, 'bottleCap');
  // 容器阀
  const valve = new THREE.CylinderGeometry(0.048, 0.048, 0.1, 24);
  valve.translate(0, yTop + 0.11, bz);
  P.add(valve, 'brass');
  const valveTop = new THREE.CylinderGeometry(0.03, 0.03, 0.028, 20);
  valveTop.translate(0, yTop + 0.174, bz);
  P.add(valveTop, 'brass');
  // 手轮
  const wheel = new THREE.TorusGeometry(0.05, 0.009, 10, 26);
  wheel.rotateX(Math.PI / 2);
  wheel.translate(0, yTop + 0.196, bz);
  P.add(wheel, 'bottle');
  const hub = new THREE.CylinderGeometry(0.011, 0.011, 0.03, 12);
  hub.translate(0, yTop + 0.196, bz);
  P.add(hub, 'steelDark');
  // 压力表（朝 +Z）
  const gauge = new THREE.CylinderGeometry(0.028, 0.028, 0.016, 20);
  gauge.rotateX(Math.PI / 2);
  gauge.translate(0, yTop + 0.10, bz + 0.062);
  P.add(gauge, 'gauge');
  const gaugeRim = new THREE.CylinderGeometry(0.03, 0.03, 0.008, 20);
  gaugeRim.rotateX(Math.PI / 2);
  gaugeRim.translate(0, yTop + 0.10, bz + 0.056);
  P.add(gaugeRim, 'brass');
  // 电磁驱动器（阀体侧面小盒子）
  P.box('blackPlate', 0.05, 0.07, 0.045, -0.072, yTop + 0.115, bz);
  // 瓶架：底托 + 两只抱箍 + 背撑
  P.box('steelDark', 0.36, 0.03, 0.36, 0, 0.083, bz);
  P.box('dark', 0.34, 0.02, 0.34, 0, 0.068, bz);
  for (const yb of [0.52, 0.94]) {
    const hoop = new THREE.TorusGeometry(R + 0.012, 0.007, 8, 30);
    hoop.rotateX(Math.PI / 2);
    hoop.translate(0, yb, bz);
    P.add(hoop, 'steelDark');
    P.box('steelDark', 0.28, 0.014, 0.012, -0.14, yb, bz);
    P.box('steelDark', 0.014, 0.014, 0.14, -0.14, yb, bz - 0.07);
  }

  // ---- 柜顶喷放管路 ----
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.056, 1.16, bz + 0.01),
    new THREE.Vector3(0.13, 1.17, bz - 0.04),
    new THREE.Vector3(0.17, 1.42, bz - 0.10),
    new THREE.Vector3(0.17, 1.72, bz - 0.11),
    new THREE.Vector3(0.17, 1.842, bz - 0.11),
  ]);
  const tube = new THREE.TubeGeometry(curve, 72, 0.0135, 14, false);
  P.add(tube, 'steel');
  // 阀出口接头
  const joint = new THREE.CylinderGeometry(0.021, 0.021, 0.032, 16);
  joint.rotateZ(Math.PI / 2);
  joint.translate(0.056, 1.16, bz + 0.01);
  P.add(joint, 'brass');
  // 穿柜顶法兰
  const flange = new THREE.CylinderGeometry(0.052, 0.052, 0.014, 24);
  flange.translate(0.17, 1.856, bz - 0.11);
  P.add(flange, 'steelDark');
  const flange2 = new THREE.CylinderGeometry(0.028, 0.028, 0.016, 20);
  flange2.translate(0.17, 1.868, bz - 0.11);
  P.add(flange2, 'steel');
  // 柜顶喷放短管 + 喷嘴
  const topPipe = new THREE.CylinderGeometry(0.024, 0.024, 0.045, 20);
  topPipe.translate(0.17, 1.898, bz - 0.11);
  P.add(topPipe, 'steel');
  const nozzle = new THREE.CylinderGeometry(0.028, 0.055, 0.03, 24);
  nozzle.translate(0.17, 1.934, bz - 0.11);
  P.add(nozzle, 'steelDark');
  // 管卡
  const clamp = new THREE.TorusGeometry(0.019, 0.005, 8, 16);
  clamp.rotateX(Math.PI / 2);
  clamp.translate(0.17, 1.62, bz - 0.11);
  P.add(clamp, 'steelDark');

  P.build(M, root);

  // 柜门丝印面（独立平面，贴在门面 +Z 侧）
  const face = new THREE.Mesh(new THREE.PlaneGeometry(doorW - 0.001, doorH - 0.001), doorFaceMat);
  face.position.set(0, doorY, doorZ + 0.0102);
  root.add(face);

  return root;
}

// ---------------------------------------------------------------------------
// 共享零件工具（UPS / 低压配电柜移植共用；源页用 scene.add，此处统一改为父节点）
// ---------------------------------------------------------------------------
function emBox(parent, w, h, d, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function emCyl(parent, rt, rb, h, seg, x, y, z, mat, rotX) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1), mat);
  m.position.set(x, y, z);
  if (rotX) m.rotation.x = rotX;
  parent.add(m);
  return m;
}
function emPanel(parent, w, h, x, y, z, tex, mat, ry) {
  mat = mat || new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.08, transparent: true });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  if (ry) m.rotation.y = ry;
  parent.add(m);
  return m;
}
// 百叶：若干片倾斜薄板（源页 InstancedMesh → 直接复用一个几何的多个 Mesh）
function emLouvers(parent, mat, w, h, rows, x, y, z, depth, tilt, ry) {
  const gh = h / rows;
  const geo = new THREE.BoxGeometry(w, gh * 0.40, depth);
  for (let i = 0; i < rows; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y + h / 2 - gh * (i + 0.5), z);
    m.rotation.x = -(tilt === undefined ? 0.62 : tilt);
    if (ry) m.rotation.y = ry;
    parent.add(m);
  }
}
// 发光指示灯（仅透镜 + 环，去掉源页加色 Sprite，避免在机房里产生异常辉光）
function emLed(parent, r, x, y, z, hex, glowHex, on) {
  const mat = new THREE.MeshStandardMaterial({
    color: hex, emissive: glowHex,
    emissiveIntensity: on ? 1.6 : 0.06,
    roughness: 0.22, metalness: 0.0,
  });
  const lens = emCyl(parent, r, r, 0.005, 18, x, y, z, mat, Math.PI / 2);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.0022, 0.0022, 8, 20), null);
  // 环用深色，避免每颗灯都 new 材质
  ring.material = new THREE.MeshStandardMaterial({ color: 0x101315, roughness: 0.5, metalness: 0.45 });
  ring.position.set(x, y, z + 0.0016);
  parent.add(ring);
  return lens;
}

// ===========================================================================
// 三、在线式 UPS 电源柜（Tower Cabinet · 100kVA 三进三出）
//    源：E:/软件源代码/3D机房/output/UPS电源柜3D模型.html
//    单柜 600(W) × 850(D) × 1720(H) mm（底座 60 + 机身 1600 + 顶盖 22）
//    正面（+Z）：LCD 操作显示单元 / 状态指示灯 / 品牌条 / 主进风防尘网 /
//              铭牌 / 危险警示标 / 门把手锁芯；背面（-Z）：上/下散热百叶 +
//              中部警示标；顶盖：2 × 顶置排风扇；两侧：竖向散热百叶。
//    说明：源页含开门/爆炸/动画交互，本工程仅取「闭合静态」几何，门体为固定
//          闭合件（同 HFC 柜的处理），不接入工程柜门开合语义。原点=底面中心，
//          正面朝 +Z，故 racks.js 的 placement 无需特判。
//    缩放：源页已是 1 场景单位 = 1 米，与机房坐标系一致，故 UPS_SCALE = 1，
//          不另设全局缩放；如后续需整体缩放，统一改下方 UPS_SCALE 即可。
// ===========================================================================
const UPS_SCALE = 1;
const UPS_CAB = { W: 0.60, D: 0.85, H: 1.60, Y0: 0.06, t: 0.02 };
const UPS_DOOR = { w: 0.578, h: 1.455, yBottom: 0.095, th: 0.024 };
const UPS_FONT = '"Microsoft YaHei","PingFang SC","Noto Sans SC","Source Han Sans SC",sans-serif';

function upsLogoTexture() {
  const { c, x } = cv(1100, 150);
  x.clearRect(0, 0, 1100, 150);
  x.save();
  x.translate(78, 75);
  x.strokeStyle = '#eaf2f7'; x.lineWidth = 4;
  x.beginPath(); x.arc(0, 0, 34, 0, Math.PI * 2); x.stroke();
  x.strokeStyle = '#31d0aa'; x.lineWidth = 5; x.lineCap = 'round';
  x.beginPath();
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const px = -20 + t * 40, py = -Math.sin(t * Math.PI * 2) * 11;
    if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
  }
  x.stroke();
  x.restore();
  x.textBaseline = 'middle'; x.textAlign = 'left';
  x.fillStyle = '#f2f7fb'; x.font = '600 46px ' + UPS_FONT;
  x.fillText('在线式不间断电源', 132, 58);
  x.fillStyle = '#8ba0ad'; x.font = '400 24px "Segoe UI",' + UPS_FONT;
  x.fillText('ON-LINE UNINTERRUPTIBLE POWER SUPPLY · 100 kVA', 134, 106);
  return toTexture(c);
}
function upsLedLegendTexture() {
  const { c, x } = cv(1200, 150);
  x.clearRect(0, 0, 1200, 150);
  const names = ['市电输入', '逆变输出', '电池供电', '旁路输出', '过载', '故障'];
  const ens = ['MAINS', 'INVERTER', 'BATTERY', 'BYPASS', 'OVERLOAD', 'FAULT'];
  x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let i = 0; i < 6; i++) {
    const cx = 1200 * (i + 0.5) / 6;
    x.fillStyle = '#c6d2db'; x.font = '500 40px ' + UPS_FONT;
    x.fillText(names[i], cx, 52);
    x.fillStyle = '#6d7c88'; x.font = '400 26px "Segoe UI",' + UPS_FONT;
    x.fillText(ens[i], cx, 112);
  }
  return toTexture(c);
}
function upsNameplateTexture() {
  const { c, x } = cv(900, 580);
  const g = x.createLinearGradient(0, 0, 900, 580);
  g.addColorStop(0, '#e9edf0'); g.addColorStop(0.45, '#d5dbe0'); g.addColorStop(1, '#c3cacf');
  x.fillStyle = g; x.fillRect(0, 0, 900, 580);
  for (let i = 0; i < 1400; i++) {
    x.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(60,70,80,0.05)';
    x.fillRect(0, Math.random() * 580, 900, 1);
  }
  x.strokeStyle = '#7d878f'; x.lineWidth = 6; x.strokeRect(14, 14, 872, 552);
  x.strokeStyle = 'rgba(125,135,143,.45)'; x.lineWidth = 2; x.strokeRect(30, 30, 840, 520);
  x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  x.fillStyle = '#1b2126'; x.font = '700 46px ' + UPS_FONT;
  x.fillText('NAMEPLATE / 产品铭牌', 52, 92);
  x.fillStyle = 'rgba(27,33,38,.55)'; x.fillRect(52, 106, 796, 2);
  const rows = [
    ['产品名称', '在线式不间断电源  UPS'],
    ['型    号', 'UPS-100K-3P/3P'],
    ['额定容量', '100 kVA / 100 kW'],
    ['交流输入', '380 / 400 V  3Φ+N+PE  50/60 Hz'],
    ['交流输出', '380 / 400 V  3Φ  50 Hz  PF = 1.0'],
    ['直流电池', '±240 VDC  12 V × 40 节'],
    ['防护等级', 'IP 20   强制风冷'],
    ['执行标准', 'GB/T 7260.3 · YD/T 1095'],
    ['出厂编号', 'NO. 2026-1000-UPS'],
    ['制造日期', '2026 - 10'],
  ];
  let y = 158;
  for (const r of rows) {
    x.fillStyle = '#4d565e'; x.font = '500 30px ' + UPS_FONT; x.fillText(r[0], 56, y);
    x.fillStyle = '#151b20'; x.font = '600 32px ' + UPS_FONT; x.fillText(r[1], 232, y);
    y += 40;
  }
  x.fillStyle = 'rgba(30,38,44,.72)'; x.font = '400 20px ' + UPS_FONT;
  x.fillText('※ 本铭牌为通用结构示意参数，非特定厂商实物', 56, 544);
  return toTexture(c);
}
function upsWarnTexture() {
  const { c, x } = cv(760, 260);
  x.clearRect(0, 0, 760, 260);
  x.fillStyle = '#f2c12e'; x.fillRect(0, 0, 760, 260);
  x.fillStyle = '#111417'; x.fillRect(0, 0, 760, 10); x.fillRect(0, 250, 760, 10);
  x.save(); x.translate(112, 132);
  x.beginPath(); x.moveTo(0, -62); x.lineTo(58, 46); x.lineTo(-58, 46); x.closePath();
  x.fillStyle = '#111417'; x.fill();
  x.fillStyle = '#f2c12e'; x.font = '700 54px "Segoe UI",' + UPS_FONT;
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('!', 0, 16);
  x.restore();
  x.textAlign = 'left'; x.textBaseline = 'middle';
  x.fillStyle = '#14181c'; x.font = '700 52px ' + UPS_FONT; x.fillText('危险 · 内有高压', 196, 96);
  x.font = '500 34px ' + UPS_FONT; x.fillText('检修前须断电并验电 · 非专业人员禁止开启', 196, 172);
  return toTexture(c);
}
function upsTextTexture(W, H, items, font, color, bg, spread) {
  const { c, x } = cv(W, H);
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, W, H); } else x.clearRect(0, 0, W, H);
  x.fillStyle = color || '#e3ebf1'; x.font = font || '600 60px "Segoe UI",' + UPS_FONT;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const n = items.length;
  if (spread && n > 1) {
    for (let i = 0; i < n; i++) x.fillText(items[i], W * (i + 0.5) / n, H / 2);
  } else {
    for (let i = 0; i < n; i++) x.fillText(items[i], W / 2, H * (i + 0.5) / n);
  }
  return toTexture(c);
}
// LCD 静态单帧（源页为动态刷新，此处只画一帧示意）
function upsLcdTexture() {
  const W = 832, H = 512;
  const { c, x } = cv(W, H);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a2b45'); g.addColorStop(0.55, '#06192b'); g.addColorStop(1, '#04101c');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(180,220,255,.035)';
  for (let sy = 0; sy < H; sy += 4) x.fillRect(0, sy, W, 2);
  x.fillStyle = 'rgba(49,208,170,.13)'; x.fillRect(0, 0, W, 54);
  x.fillStyle = 'rgba(49,208,170,.5)'; x.fillRect(0, 54, W, 2);
  x.textBaseline = 'middle'; x.textAlign = 'left';
  x.fillStyle = '#5cf0cb'; x.font = '600 28px ' + UPS_FONT;
  x.fillText('● 正常运行 / ON-LINE', 22, 28);
  x.textAlign = 'right'; x.fillStyle = '#8fb6d0'; x.font = '400 26px "Segoe UI",' + UPS_FONT;
  x.fillText('2026-10-24  23:05', W - 22, 28);
  function node(px, py, pw, ph, main, sub, active) {
    roundRect(x, px, py, pw, ph, 8);
    x.fillStyle = active ? 'rgba(49,208,170,.16)' : 'rgba(140,180,200,.08)'; x.fill();
    x.strokeStyle = active ? '#7fe9d2' : 'rgba(150,190,210,.42)'; x.lineWidth = 3; x.stroke();
    x.textAlign = 'center'; x.fillStyle = active ? '#b8f6e8' : '#9db6c6';
    x.font = '600 26px ' + UPS_FONT; x.fillText(main, px + pw / 2, py + ph / 2 - (sub ? 12 : 0));
    if (sub) { x.fillStyle = 'rgba(150,185,205,.85)'; x.font = '400 19px "Segoe UI",' + UPS_FONT; x.fillText(sub, px + pw / 2, py + ph / 2 + 16); }
  }
  function line(x1, y1, x2, y2, dash) {
    x.save(); if (dash) x.setLineDash([9, 7]);
    x.strokeStyle = dash ? 'rgba(255,196,90,.55)' : '#7fe9d2'; x.lineWidth = 4;
    x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke(); x.restore();
  }
  line(112, 178, 148, 178); line(240, 178, 268, 178); line(356, 178, 392, 178);
  line(232, 222, 232, 250); line(292, 250, 292, 222);
  line(140, 208, 140, 300, true); line(140, 300, 396, 300, true); line(396, 300, 396, 208, true);
  x.save(); x.fillStyle = 'rgba(255,196,90,.75)'; x.font = '400 18px ' + UPS_FONT;
  x.textAlign = 'left'; x.fillText('BYPASS / 旁路', 152, 288); x.restore();
  node(38, 152, 74, 52, '输入', null, true);
  node(148, 140, 92, 76, '整流器', 'RECT', true);
  node(268, 140, 92, 76, '逆变器', 'INV', true);
  node(392, 152, 74, 52, '输出', null, true);
  node(212, 250, 116, 56, '电池组', 'BATTERY', true);
  x.textAlign = 'center'; x.fillStyle = 'rgba(160,195,215,.8)'; x.font = '400 19px "Segoe UI",' + UPS_FONT;
  x.fillText('AC 380V', 75, 228); x.fillText('AC 380V', 429, 228);
  const data = [['输入电压 L-L', '380', 'V'], ['输出电压 L-L', '380', 'V'], ['输出电流', '152', 'A'], ['输出频率', '50.0', 'Hz'], ['电池电压', '±270', 'V'], ['机内温度', '28', '℃']];
  x.fillStyle = 'rgba(140,185,210,.10)'; roundRect(x, 520, 66, W - 548, 268, 10); x.fill();
  let dy = 100;
  for (const d of data) {
    x.textAlign = 'left'; x.fillStyle = 'rgba(150,185,205,.85)'; x.font = '400 23px ' + UPS_FONT; x.fillText(d[0], 542, dy);
    x.textAlign = 'right'; x.fillStyle = '#d8f2ea'; x.font = '600 34px "Segoe UI",' + UPS_FONT; x.fillText(d[1], W - 62, dy - 1);
    x.fillStyle = 'rgba(150,185,205,.7)'; x.font = '400 20px "Segoe UI",' + UPS_FONT; x.fillText(d[2], W - 24, dy + 2);
    dy += 40;
  }
  function bar(bx, by, bw, label, pct, unit, color) {
    x.textAlign = 'left'; x.fillStyle = 'rgba(150,185,205,.88)'; x.font = '400 24px ' + UPS_FONT; x.fillText(label, bx, by);
    x.textAlign = 'right'; x.fillStyle = '#e6f7f1'; x.font = '600 30px "Segoe UI",' + UPS_FONT; x.fillText(pct + unit, bx + bw, by);
    x.fillStyle = 'rgba(120,160,185,.20)'; roundRect(x, bx, by + 18, bw, 22, 11); x.fill();
    x.fillStyle = color; roundRect(x, bx, by + 18, Math.max(6, Math.round(bw * pct / 100)), 22, 11); x.fill();
  }
  bar(40, 372, 700, '负载率  LOAD', 58, ' %', '#31d0aa');
  bar(40, 444, 700, '电池容量  BATTERY CAPACITY', 96, ' %', '#4ea8ff');
  const vg = x.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.86);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.42)');
  x.fillStyle = vg; x.fillRect(0, 0, W, H);
  return toTexture(c);
}

export function buildUPSModel() {
  const M = {
    shell: new THREE.MeshStandardMaterial({ color: 0x33383e, roughness: 0.62, metalness: 0.42 }),
    shellLight: new THREE.MeshStandardMaterial({ color: 0x3d434a, roughness: 0.56, metalness: 0.44 }),
    shellEdge: new THREE.MeshStandardMaterial({ color: 0x272c31, roughness: 0.60, metalness: 0.40 }),
    doorFace: new THREE.MeshStandardMaterial({ color: 0x363c43, roughness: 0.50, metalness: 0.46 }),
    doorBack: new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.72, metalness: 0.20 }),
    inner: new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.82, metalness: 0.14 }),
    recess: new THREE.MeshStandardMaterial({ color: 0x0d1013, roughness: 0.90, metalness: 0.10 }),
    base: new THREE.MeshStandardMaterial({ color: 0x1a1e22, roughness: 0.76, metalness: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x101315, roughness: 0.50, metalness: 0.45 }),
    bezel: new THREE.MeshStandardMaterial({ color: 0x14181b, roughness: 0.38, metalness: 0.22 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc2c9d0, roughness: 0.24, metalness: 0.96 }),
    steelDark: new THREE.MeshStandardMaterial({ color: 0x8b9299, roughness: 0.34, metalness: 0.90 }),
    plasticGrey: new THREE.MeshStandardMaterial({ color: 0x5a626b, roughness: 0.55, metalness: 0.10 }),
    plasticBlue: new THREE.MeshStandardMaterial({ color: 0x2a5fa8, roughness: 0.45, metalness: 0.12 }),
    plasticRed: new THREE.MeshStandardMaterial({ color: 0xb2302c, roughness: 0.45, metalness: 0.12 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x14171a, roughness: 0.92, metalness: 0.02 }),
    filterMesh: new THREE.MeshStandardMaterial({ color: 0x2e343a, roughness: 0.85, metalness: 0.20 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0a141d, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.24 }),
  };
  const root = new THREE.Group();
  root.name = 'ups-model';
  const S = UPS_SCALE;
  const W = UPS_CAB.W * S, D = UPS_CAB.D * S, H = UPS_CAB.H * S, Y0 = UPS_CAB.Y0 * S, t = UPS_CAB.t * S;
  const yMid = Y0 + H / 2;

  // 底座 + 可调地脚
  emBox(root, W - 0.02, 0.052 * S, D - 0.02, 0, 0.026 * S, 0, M.base);
  emBox(root, W - 0.05, 0.010 * S, D - 0.05, 0, 0.056 * S, 0, M.dark);
  for (let f = 0; f < 4; f++) {
    const fx = (f % 2 === 0 ? 1 : -1) * (W / 2 - 0.055), fz = (f < 2 ? 1 : -1) * (D / 2 - 0.06);
    emCyl(root, 0.020, 0.024, 0.006, 16, fx, 0.003, fz, M.steelDark);
  }
  // 侧板 / 背板 / 顶底板
  emBox(root, t, H, D, -W / 2 + t / 2, yMid, 0, M.shell);
  emBox(root, t, H, D, W / 2 - t / 2, yMid, 0, M.shell);
  emBox(root, W - 2 * t, t, D - 2 * t, 0, Y0 + H - t / 2, 0, M.shell);
  emBox(root, W - 2 * t, t, D - 2 * t, 0, Y0 + t / 2, 0, M.shell);
  // 内壁衬板
  emBox(root, W - 2 * t - 0.004, 0.004, D - 2 * t - 0.004, 0, Y0 + t + 0.002, 0, M.inner);
  // 侧向百叶散热孔（左右镜像）
  emBox(root, 0.004, 0.44, 0.34, -W / 2 - 0.002, 1.10, 0.02, M.recess);
  emLouvers(root, M.shellLight, 0.30, 0.42, 22, -0.307, 1.10, 0.02, 0.010, -0.62, -Math.PI / 2);
  emBox(root, 0.004, 0.44, 0.34, W / 2 + 0.002, 1.10, 0.02, M.recess);
  emLouvers(root, M.shellLight, 0.30, 0.42, 22, 0.307, 1.10, 0.02, 0.010, -0.62, Math.PI / 2);
  // 门下方固定封板
  emBox(root, UPS_DOOR.w + 0.004, 0.035, 0.016, 0, 0.0775, 0.428, M.shellEdge);
  emBox(root, UPS_DOOR.w + 0.004, 0.035, 0.016, 0, 0.0775, -0.428, M.shellEdge);
  // 前门上方固定面板：品牌条 + 出风百叶
  const topPanel = new THREE.Group(); topPanel.position.set(0, 1.6055, 0.4365); root.add(topPanel);
  emBox(topPanel, UPS_DOOR.w + 0.004, 0.108, 0.016, 0, 0, 0.002, M.shellLight);
  emBox(topPanel, 0.40, 0.052, 0.004, 0, 0.012, -0.006, M.recess);
  emLouvers(topPanel, M.shellEdge, 0.38, 0.046, 7, 0, 0.012, -0.005, 0.008, -0.60);
  emPanel(topPanel, 0.34, 0.030, 0, -0.024, 0.0106, upsTextTexture(680, 60, ['EXHAUST  AIR  OUTLET'], '500 34px "Segoe UI",' + UPS_FONT, '#93a6b4'));
  // 后门上方固定面板
  emBox(root, UPS_DOOR.w + 0.004, 0.108, 0.016, 0, 1.6055, -0.4365, M.shellLight);
  // 顶盖 + 2 顶置排风扇
  const topCover = new THREE.Group(); topCover.position.set(0, 1.6725, 0); root.add(topCover);
  emBox(topCover, W + 0.018, 0.022, D + 0.018, 0, 0, 0, M.shellLight);
  emBox(topCover, W + 0.024, 0.006, D + 0.024, 0, -0.013, 0, M.shellEdge);
  const topFanGroup = new THREE.Group(); topFanGroup.position.set(0, 0.011, -0.235); topCover.add(topFanGroup);
  emBox(topFanGroup, 0.34, 0.006, 0.175, 0, 0.003, 0, M.recess);
  emBox(topFanGroup, 0.352, 0.006, 0.008, 0, 0.006, 0.086, M.shellEdge);
  emBox(topFanGroup, 0.352, 0.006, 0.008, 0, 0.006, -0.086, M.shellEdge);
  upsMakeFan(topFanGroup, 0.062, -0.085, 0.008, 0, M.shellEdge);
  upsMakeFan(topFanGroup, 0.062, 0.085, 0.008, 0, M.shellEdge);
  emBox(topCover, 0.34, 0.005, 0.20, 0, 0.002, 0.215, M.recess);
  emLouvers(topCover, M.shellLight, 0.30, 0.185, 12, 0, 0.003, 0.215, 0.022, 0.50, 0, -Math.PI / 2);

  // 前门（Pivot 在左，闭合态 rotation=0）
  const frontPivot = new THREE.Group(); frontPivot.position.set(-0.288, 0, 0.437); root.add(frontPivot);
  const dw = UPS_DOOR.w, dh = UPS_DOOR.h, dth = UPS_DOOR.th;
  const yc = UPS_DOOR.yBottom + dh / 2, cx = dw / 2, ZF = dth / 2 + 0.0008;
  emBox(frontPivot, dw, dh, dth, cx, yc, 0, M.doorFace);
  emBox(frontPivot, dw, 0.010, 0.010, cx, yc + dh / 2 - 0.005, 0.014, M.shellEdge);
  emBox(frontPivot, dw, 0.010, 0.010, cx, yc - dh / 2 + 0.005, 0.014, M.shellEdge);
  emBox(frontPivot, 0.010, dh, 0.010, dw - 0.005, yc, 0.014, M.shellEdge);
  emBox(frontPivot, 0.010, dh, 0.010, 0.005, yc, 0.014, M.shellEdge);
  // LCD
  const dy = 1.410;
  emBox(frontPivot, 0.286, 0.206, 0.016, cx, dy, 0.008, M.bezel);
  emBox(frontPivot, 0.262, 0.182, 0.006, cx, dy, 0.013, M.dark);
  const lcdMat = new THREE.MeshStandardMaterial({ map: upsLcdTexture(), roughness: 0.18, metalness: 0, emissive: 0xffffff, emissiveMap: upsLcdTexture(), emissiveIntensity: 0.55 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.216, 0.133), lcdMat); screen.position.set(cx, dy, 0.0195); frontPivot.add(screen);
  const glassM = new THREE.Mesh(new THREE.PlaneGeometry(0.224, 0.141), M.glass); glassM.position.set(cx, dy, 0.0212); frontPivot.add(glassM);
  // 功能按键
  const ky = 1.270; const keyMat = [M.plasticBlue, M.plasticRed, M.plasticGrey];
  for (let k = 0; k < 3; k++) { const bx = cx - 0.088 + k * 0.088; emCyl(frontPivot, 0.0142, 0.0142, 0.008, 20, bx, ky, 0.016, keyMat[k], Math.PI / 2); }
  emPanel(frontPivot, 0.300, 0.0385, cx, 1.224, ZF, upsTextTexture(700, 90, ['ON 开机', 'OFF 关机', 'SILENCE 消音'], '500 30px ' + UPS_FONT, '#c3d0d9', null, true));
  // LED 指示灯条
  const ledY = 1.155;
  emBox(frontPivot, 0.322, 0.070, 0.008, cx, ledY, 0.013, M.bezel);
  const ledDef = [
    { hex: 0x1e5c3a, glow: 0x2bff77, on: true }, { hex: 0x1e5c3a, glow: 0x2bff77, on: true },
    { hex: 0x6b4410, glow: 0xffb03a, on: true }, { hex: 0x6b5a10, glow: 0xffe14a, on: false },
    { hex: 0x6b1a16, glow: 0xff6a4a, on: false }, { hex: 0x6b1410, glow: 0xff3b30, on: false },
  ];
  for (let i = 0; i < 6; i++) emLed(frontPivot, 0.0112, cx - 0.1375 + i * 0.055, ledY + 0.013, 0.0182, ledDef[i].hex, ledDef[i].glow, ledDef[i].on);
  emPanel(frontPivot, 0.322, 0.0403, cx, 1.096, ZF, upsLedLegendTexture());
  // 品牌条
  emPanel(frontPivot, 0.360, 0.0491, cx, 1.000, ZF, upsLogoTexture());
  // 主进风防尘网
  emBox(frontPivot, 0.372, 0.352, 0.006, cx, 0.735, 0.0105, M.recess);
  // 蜂窝防尘网（源页 InstancedMesh → 简化为贴 recess + 框，视觉接近且省 draw call）
  emBox(frontPivot, 0.392, 0.372, 0.008, cx, 0.735, 0.0100, M.shellEdge);
  emPanel(frontPivot, 0.356, 0.336, cx, 0.735, 0.0140, upsTextTexture(356, 336, ['◇◇◇  AIR FILTER  ◇◇◇'], '600 40px "Segoe UI",' + UPS_FONT, '#7d8a94'));
  // 铭牌 + 警示标
  emBox(frontPivot, 0.216, 0.140, 0.006, cx + 0.086, 0.335, 0.014, M.aluminum || M.steel);
  emPanel(frontPivot, 0.212, 0.1366, cx + 0.086, 0.335, 0.0178, upsNameplateTexture());
  emPanel(frontPivot, 0.207, 0.0709, cx - 0.100, 0.335, ZF, upsWarnTexture());
  // 门把手 + 门锁
  const hx = dw - 0.062, hy = 0.860;
  emBox(frontPivot, 0.026, 0.262, 0.006, hx, hy, 0.015, M.dark);
  emBox(frontPivot, 0.020, 0.300, 0.028, hx, hy, 0.028, M.steel);
  emBox(frontPivot, 0.030, 0.034, 0.032, hx, hy + 0.147, 0.024, M.steelDark);
  emBox(frontPivot, 0.030, 0.034, 0.032, hx, hy - 0.147, 0.024, M.steelDark);
  emCyl(frontPivot, 0.015, 0.015, 0.010, 20, hx, hy - 0.196, 0.020, M.steel, Math.PI / 2);
  emCyl(frontPivot, 0.0055, 0.0055, 0.012, 12, hx, hy - 0.196, 0.024, M.dark, Math.PI / 2);

  // 后门（Pivot 在右，闭合态）
  const rearPivot = new THREE.Group(); rearPivot.position.set(0.288, 0, -0.437); root.add(rearPivot);
  const rcx = -dw / 2, ZR = -dth / 2 - 0.0008;
  emBox(rearPivot, dw, dh, dth, rcx, yc, 0, M.doorFace);
  emBox(rearPivot, dw, 0.010, 0.010, rcx, yc + dh / 2 - 0.005, -0.014, M.shellEdge);
  emBox(rearPivot, dw, 0.010, 0.010, rcx, yc - dh / 2 + 0.005, -0.014, M.shellEdge);
  emBox(rearPivot, 0.010, dh, 0.010, -dw + 0.005, yc, -0.014, M.shellEdge);
  emBox(rearPivot, 0.010, dh, 0.010, -0.005, yc, -0.014, M.shellEdge);
  emBox(rearPivot, 0.400, 0.300, 0.006, rcx, 1.200, -0.009, M.recess);
  emLouvers(rearPivot, M.shellLight, 0.372, 0.285, 18, rcx, 1.200, -0.0125, 0.012, -0.62, Math.PI);
  emBox(rearPivot, 0.424, 0.322, 0.008, rcx, 1.200, -0.0130, M.shellEdge);
  emBox(rearPivot, 0.400, 0.240, 0.006, rcx, 0.400, -0.009, M.recess);
  emLouvers(rearPivot, M.shellLight, 0.372, 0.225, 14, rcx, 0.400, -0.0125, 0.012, -0.62, Math.PI);
  emBox(rearPivot, 0.424, 0.262, 0.008, rcx, 0.400, -0.0130, M.shellEdge);
  emPanel(rearPivot, 0.292, 0.100, rcx, 0.800, ZR, upsWarnTexture(), null, Math.PI);

  return root;
}

// 顶置排风扇（静态）：安装框 + 同心环 + 静止扇叶
function upsMakeFan(parent, r, px, py, pz, mountMat) {
  const g = new THREE.Group(); g.position.set(px, py, pz); parent.add(g);
  const m = mountMat || (buildUPSModel._m && buildUPSModel._m.shellEdge);
  const side = 2 * r + 0.056;
  emBox(g, side, 0.012, 0.014, 0, 0.002, r + 0.021, m);
  emBox(g, side, 0.012, 0.014, 0, 0.002, -r - 0.021, m);
  emBox(g, 0.014, 0.012, side - 0.028, r + 0.021, 0.002, 0, m);
  emBox(g, 0.014, 0.012, side - 0.028, -r - 0.021, 0.002, 0, m);
  for (const rr of [0.30, 0.53, 0.75, 0.94]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(r * rr, 0.0016, 6, 44), m);
    t.rotation.x = Math.PI / 2; t.position.y = 0.004; g.add(t);
  }
  const rotor = new THREE.Group(); rotor.position.y = -0.001; g.add(rotor);
  emCyl(rotor, r * 0.30, r * 0.30, 0.020, 22, 0, 0, 0, new THREE.MeshStandardMaterial({ color: 0x5a626b, roughness: 0.55, metalness: 0.1 }));
  for (let b = 0; b < 7; b++) {
    const pivot = new THREE.Group(); pivot.rotation.y = b * Math.PI * 2 / 7;
    const holder = new THREE.Group(); holder.position.set(r * 0.52, 0, 0); holder.rotation.x = 0.58;
    const bl = new THREE.Mesh(new THREE.BoxGeometry(r * 0.86, 0.0016, r * 0.60), new THREE.MeshStandardMaterial({ color: 0x5a626b, roughness: 0.55, metalness: 0.1 }));
    holder.add(bl); pivot.add(holder); rotor.add(pivot);
  }
  return g;
}

// ===========================================================================
// 四、低压配电柜（单柜 · 800×600×2000mm，列头柜/进线柜风格）
//    源：E:/软件源代码/3D机房/output/低压配电柜3D模型.html
//    源为 1 列头柜 + 4 出线柜的整列，本工程机房仅用 1 台配电柜，故取其中
//    1 面（列头柜·进线：含多功能电力仪表 / 状态指示灯 / 观察窗 / 铭牌）作代表。
//    单柜 800(W) × 600(D) × 2000(H) mm（底座 100 + 柜体 1880 + 顶板 20）
//    正面（+Z）：柜号标识牌 / 门把手锁芯 / 多功能仪表窗 / 指示灯按钮 /
//              观察窗 / 铭牌；下部与门上均有进风百叶。背面（-Z）：母线室隔板。
//    说明：同 UPS，门体为固定闭合件，不接入工程柜门开合语义；原点=底面中心，
//          正面朝 +Z。源页含架空地板标高 +0.35m，本工程直接落地（y=0）。
//    缩放：源页已是 1 场景单位 = 1 米，与机房坐标系一致，故 POWER_SCALE = 1。
// ===========================================================================
const POWER_SCALE = 1;
const POWER_CAB = { W: 0.80, D: 0.60, H: 2.00 };
const POWER_PLINTH = 0.10, POWER_TOP = 0.02;
const POWER_BODY = POWER_CAB.H - POWER_PLINTH - POWER_TOP; // 1.88
const POWER_DOOR_W = POWER_CAB.W - 0.03; // 0.77
const POWER_DOOR_H = 1.84;
const POWER_DOOR_T = 0.026;
const POWER_DOOR_Y = POWER_PLINTH + POWER_BODY / 2; // 1.04
const POWER_FONT = '"Microsoft YaHei","PingFang SC","Noto Sans SC","Source Han Sans SC",sans-serif';

function powerCodeTexture() {
  const { c, x } = cv(640, 200);
  x.fillStyle = '#14181c'; x.fillRect(0, 0, 640, 200);
  x.strokeStyle = '#f0a03c'; x.lineWidth = 4; x.strokeRect(8, 8, 624, 184);
  x.fillStyle = '#f0a03c'; x.fillRect(8, 8, 96, 184);
  x.fillStyle = '#12161a'; x.font = '700 54px ' + POWER_FONT;
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('01', 56, 102);
  x.fillStyle = '#eef3f7'; x.font = '600 62px ' + POWER_FONT; x.textAlign = 'left';
  x.fillText('PDR-01', 124, 74);
  x.fillStyle = '#9fb0bd'; x.font = '400 40px ' + POWER_FONT; x.fillText('低压配电柜', 124, 138);
  x.fillStyle = '#6c7a86'; x.font = '400 30px ' + POWER_FONT; x.fillText('INCOMING 630A', 300, 168);
  return toTexture(c);
}
function powerNameplateTexture(kind) {
  const { c, x } = cv(900, 560);
  x.fillStyle = '#dfe3e7'; x.fillRect(0, 0, 900, 560);
  x.fillStyle = '#15191d'; x.fillRect(0, 0, 900, 92);
  x.fillStyle = '#f0a03c'; x.font = '700 52px ' + POWER_FONT;
  x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText('低压成套开关设备 · ' + (kind || '配电柜'), 32, 48);
  x.fillStyle = '#1b1f23'; x.font = '400 34px ' + POWER_FONT;
  const rows = ['型号示例      PDR-800/600/2000', '额定电压      AC 400 V  3P+N+PE', '额定频率      50 Hz', '额定电流      630 A（列头）/ 250 A（出线）', '短时耐受      Icw 30 kA / 1 s', '防护等级      IP30（门闭）', '执行标准      GB/T 7251.1 · IEC 61439'];
  for (let i = 0; i < rows.length; i++) x.fillText(rows[i], 40, 148 + i * 56);
  x.strokeStyle = '#9aa1a8'; x.lineWidth = 6; x.strokeRect(3, 3, 894, 554);
  x.fillStyle = '#6c7a86'; x.font = '400 26px ' + POWER_FONT; x.fillText('※ 通用结构示意参数，非特定厂商实物', 40, 526);
  return toTexture(c);
}
function powerMeterTexture() {
  const { c, x } = cv(512, 384);
  x.fillStyle = '#061316'; x.fillRect(0, 0, 512, 384);
  x.fillStyle = '#0d2b30'; x.fillRect(0, 0, 512, 44);
  x.fillStyle = '#5fe0c0'; x.font = '600 26px ' + POWER_FONT; x.textAlign = 'left'; x.textBaseline = 'middle';
  x.fillText('PDR-01  列头柜 · 电力监控', 16, 23);
  x.fillStyle = '#ffc776'; x.textAlign = 'right'; x.fillText('RUN', 496, 23);
  const ph = ['L1', 'L2', 'L3']; const base = [228, 224, 231];
  for (let i = 0; i < 3; i++) {
    const yy = 92 + i * 74;
    x.fillStyle = '#8fb6c4'; x.font = '500 22px ' + POWER_FONT; x.textAlign = 'left'; x.fillText(ph[i] + ' 电压', 22, yy);
    x.fillStyle = '#7ff0d4'; x.font = '700 44px ' + POWER_FONT; x.textAlign = 'right'; x.fillText(base[i].toFixed(0) + ' V', 250, yy + 2);
    x.fillStyle = '#8fb6c4'; x.font = '500 22px ' + POWER_FONT; x.textAlign = 'left'; x.fillText('电流', 290, yy);
    x.fillStyle = '#ffc776'; x.font = '700 44px ' + POWER_FONT; x.textAlign = 'right'; x.fillText((320 + i * 9) + ' A', 490, yy + 2);
  }
  x.fillStyle = '#8fb6c4'; x.font = '500 22px ' + POWER_FONT; x.textAlign = 'left';
  x.fillText('总有功功率', 22, 330);
  x.fillStyle = '#7ff0d4'; x.font = '700 44px ' + POWER_FONT; x.textAlign = 'right'; x.fillText('148.3 kW', 250, 332);
  x.fillStyle = '#123039'; x.fillRect(290, 312, 200, 34);
  const gr = x.createLinearGradient(290, 0, 490, 0); gr.addColorStop(0, '#31d0aa'); gr.addColorStop(1, '#ffc776');
  x.fillStyle = gr; x.fillRect(290, 312, 104, 34);
  return toTexture(c);
}

export function buildPowerCabinetModel() {
  const M = {
    enclosure: new THREE.MeshStandardMaterial({ color: 0xb9bfc4, roughness: 0.58, metalness: 0.46 }),
    enclosure2: new THREE.MeshStandardMaterial({ color: 0xa8aeb4, roughness: 0.54, metalness: 0.48 }),
    doorFace: new THREE.MeshStandardMaterial({ color: 0xb2b8be, roughness: 0.50, metalness: 0.50 }),
    doorBack: new THREE.MeshStandardMaterial({ color: 0x5b6268, roughness: 0.74, metalness: 0.22 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x8b9299, roughness: 0.42, metalness: 0.72 }),
    plinth: new THREE.MeshStandardMaterial({ color: 0x3c4248, roughness: 0.66, metalness: 0.42 }),
    recess: new THREE.MeshStandardMaterial({ color: 0x101417, roughness: 0.90, metalness: 0.10 }),
    darkPlate: new THREE.MeshStandardMaterial({ color: 0x1b1f23, roughness: 0.48, metalness: 0.34 }),
    device: new THREE.MeshStandardMaterial({ color: 0x23282d, roughness: 0.56, metalness: 0.18 }),
    deviceLt: new THREE.MeshStandardMaterial({ color: 0x39404a, roughness: 0.52, metalness: 0.20 }),
    handle: new THREE.MeshStandardMaterial({ color: 0x191d21, roughness: 0.44, metalness: 0.30 }),
    handleRed: new THREE.MeshStandardMaterial({ color: 0xa8342c, roughness: 0.46, metalness: 0.14 }),
    busbar: new THREE.MeshStandardMaterial({ color: 0xc07f3c, roughness: 0.30, metalness: 0.94 }),
    busbarN: new THREE.MeshStandardMaterial({ color: 0x8a93a8, roughness: 0.32, metalness: 0.90 }),
    busbarPE: new THREE.MeshStandardMaterial({ color: 0xb8a23e, roughness: 0.34, metalness: 0.88 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc4cad0, roughness: 0.26, metalness: 0.95 }),
    insulator: new THREE.MeshStandardMaterial({ color: 0x2b2f34, roughness: 0.62, metalness: 0.08 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x101a22, roughness: 0.07, metalness: 0.02, transparent: true, opacity: 0.26 }),
    screen: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0, emissive: 0x0d2b30, emissiveIntensity: 1.0 }),
    ledGreen: new THREE.MeshStandardMaterial({ color: 0x0e1a12, roughness: 0.30, emissive: 0x35d17a, emissiveIntensity: 1.7, metalness: 0.1 }),
    ledAmber: new THREE.MeshStandardMaterial({ color: 0x1a150c, roughness: 0.30, emissive: 0xf0a03c, emissiveIntensity: 1.6, metalness: 0.1 }),
    ledRed: new THREE.MeshStandardMaterial({ color: 0x1a0e0e, roughness: 0.30, emissive: 0xe0483c, emissiveIntensity: 1.5, metalness: 0.1 }),
  };
  const root = new THREE.Group();
  root.name = 'power-model';
  const S = POWER_SCALE;
  const W = POWER_CAB.W * S, D = POWER_CAB.D * S, H = POWER_CAB.H * S;
  const PL = POWER_PLINTH * S, TOP = POWER_TOP * S, BODY = POWER_BODY * S;
  const halfW = W / 2, halfD = D / 2;
  const bodyY = PL + BODY / 2;
  const topY = PL + BODY + TOP / 2;

  // 底座
  emBox(root, W - 0.04, PL, D - 0.04, 0, PL / 2, 0, M.plinth);
  for (let f = 0; f < 4; f++) {
    const fx = (f % 2 ? 1 : -1) * (halfW - 0.06), fz = (f < 2 ? 1 : -1) * (halfD - 0.06);
    emCyl(root, 0.022, 0.026, 0.02, 10, fx, 0.01, fz, M.steel);
  }
  // 框架立柱 + 上下横梁
  const posts = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
  for (const p of posts) emBox(root, 0.056, BODY, 0.056, p[0] * (halfW - 0.030), bodyY, p[1] * (halfD - 0.030), M.frame);
  emBox(root, W - 0.08, 0.05, 0.04, 0, PL + 0.028, halfD - 0.030, M.frame);
  emBox(root, W - 0.08, 0.05, 0.04, 0, PL + BODY - 0.028, halfD - 0.030, M.frame);
  // 侧板 / 后板 / 顶板 / 底板
  emBox(root, 0.018, BODY - 0.02, D - 0.06, -(halfW - 0.009), bodyY, 0, M.enclosure);
  emBox(root, 0.018, BODY - 0.02, D - 0.06, (halfW - 0.009), bodyY, 0, M.enclosure);
  emBox(root, W - 0.09, BODY - 0.02, 0.018, 0, bodyY, -(halfD - 0.009), M.enclosure);
  emBox(root, W, TOP, D, 0, topY, 0, M.enclosure2);
  emBox(root, W - 0.10, 0.018, D - 0.10, 0, PL + 0.010, 0, M.plinth);
  // 顶部进出线接口（敲落孔 + 橡胶护圈）
  for (let q = 0; q < 2; q++) {
    const gz = -0.20 + q * 0.26;
    emCyl(root, 0.052, 0.052, 0.016, 18, -0.16 + q * 0.30, topY + TOP / 2 + 0.004, gz, M.rubber);
    emCyl(root, 0.044, 0.044, 0.02, 18, -0.16 + q * 0.30, topY + TOP / 2 + 0.002, gz, M.recess);
  }
  // 顶部吊环
  for (const er of [0.30, -0.30]) {
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.008, 8, 18), M.steel);
    eye.position.set(er, topY + 0.026, 0.24); eye.rotation.y = Math.PI / 2; root.add(eye);
  }
  // 底部走线槽（封闭件，仅外观）
  emBox(root, W - 0.16, 0.10, 0.09, 0, PL + 0.16, 0.06, M.deviceLt);
  emBox(root, W - 0.17, 0.006, 0.08, 0, PL + 0.212, 0.06, M.recess);
  emCyl(root, 0.05, 0.05, 0.02, 16, 0.22, PL + 0.012, 0.14, M.rubber);
  // 内壁安装板 + 母线室隔板（门后遮罩，避免看穿）
  emBox(root, W - 0.14, BODY - 0.30, 0.012, 0, bodyY, 0.02, M.doorBack);
  emBox(root, W - 0.10, BODY - 0.06, 0.012, 0, bodyY, -0.13, M.doorBack);

  // 前门（Pivot 在左，闭合态）
  const pivot = new THREE.Group(); pivot.position.set(-(W / 2 - 0.012), 0, halfD); root.add(pivot);
  const halfDW = POWER_DOOR_W / 2;
  const leaf = emBox(pivot, POWER_DOOR_W, POWER_DOOR_H, POWER_DOOR_T, halfDW, POWER_DOOR_Y, POWER_DOOR_T / 2, M.doorFace);
  emBox(pivot, 0.016, POWER_DOOR_H, POWER_DOOR_T + 0.01, 0.008, POWER_DOOR_Y, POWER_DOOR_T / 2, M.enclosure2);
  emBox(pivot, 0.016, POWER_DOOR_H, POWER_DOOR_T + 0.01, POWER_DOOR_W - 0.008, POWER_DOOR_Y, POWER_DOOR_T / 2, M.enclosure2);
  emBox(pivot, POWER_DOOR_W, 0.016, POWER_DOOR_T + 0.01, halfDW, POWER_DOOR_Y + POWER_DOOR_H / 2, POWER_DOOR_T / 2, M.enclosure2);
  emBox(pivot, POWER_DOOR_W, 0.016, POWER_DOOR_T + 0.01, halfDW, POWER_DOOR_Y - POWER_DOOR_H / 2, POWER_DOOR_T / 2, M.enclosure2);
  const faceZ = POWER_DOOR_T + 0.002;
  // 柜号标识牌
  emBox(pivot, 0.44, 0.14, 0.004, halfDW, POWER_DOOR_Y + 0.79, faceZ, M.darkPlate);
  emPanel(pivot, 0.42, 0.13, halfDW, POWER_DOOR_Y + 0.79, faceZ + 0.0028, powerCodeTexture());
  // 把手 + 锁
  emBox(pivot, 0.05, 0.20, 0.03, POWER_DOOR_W - 0.10, POWER_DOOR_Y - 0.10, faceZ + 0.014, M.handle);
  emCyl(pivot, 0.016, 0.016, 0.012, 12, POWER_DOOR_W - 0.10, POWER_DOOR_Y - 0.24, faceZ + 0.010, M.steel, Math.PI / 2);
  // 多功能电力仪表
  emBox(pivot, 0.32, 0.24, 0.012, halfDW, POWER_DOOR_Y + 0.56, faceZ, M.darkPlate);
  const scr = emPanel(pivot, 0.28, 0.21, halfDW, POWER_DOOR_Y + 0.56, faceZ + 0.0072, powerMeterTexture());
  scr.material = M.screen;
  emBox(pivot, 0.32, 0.24, 0.003, halfDW, POWER_DOOR_Y + 0.56, faceZ + 0.0085, M.glass);
  // 指示灯 + 按钮
  const leds = [M.ledGreen, M.ledAmber, M.ledRed, M.ledGreen];
  for (let l = 0; l < 4; l++) {
    const lx = halfDW - 0.15 + l * 0.10;
    emCyl(pivot, 0.014, 0.014, 0.008, 12, lx, POWER_DOOR_Y + 0.40, faceZ + 0.006, leds[l], Math.PI / 2);
    emBox(pivot, 0.03, 0.012, 0.010, lx, POWER_DOOR_Y + 0.35, faceZ + 0.006, M.handle);
  }
  // 观察窗
  emBox(pivot, 0.50, 0.34, 0.004, halfDW, POWER_DOOR_Y + 0.05, faceZ, M.darkPlate);
  emBox(pivot, 0.46, 0.30, 0.003, halfDW, POWER_DOOR_Y + 0.05, faceZ + 0.0035, M.glass);
  // 铭牌
  emBox(pivot, 0.30, 0.19, 0.004, halfDW, POWER_DOOR_Y - 0.36, faceZ, M.darkPlate);
  emPanel(pivot, 0.28, 0.174, halfDW, POWER_DOOR_Y - 0.36, faceZ + 0.0028, powerNameplateTexture('列头柜'));
  // 下部进风百叶
  emLouvers(pivot, M.enclosure2, 0.52, 0.34, 9, halfDW, POWER_DOOR_Y - 0.72, faceZ + 0.001, 0.014, -0.62);
  emLouvers(pivot, M.enclosure2, 0.30, 0.20, 6, halfDW, PL + 0.13, faceZ + 0.001, 0.012, -0.62);

  return root;
}
