// 演示增强特性集合（模拟机房可视化，不涉及任何真实机房规范）。
// 设计原则：全部为「增量、可关闭、默认不激活」，不改动既有交互/渲染主路径；
// 高风险视觉特性（气流 / 热力图）默认关闭，由工具栏开关触发。
//
// 每个特性模块统一约定：
//   constructor(app, domRoot) —— app 提供 sm(SceneManager)/racks(RackSystem)/rootEl/ui/director/room
//   setVisible(bool)           —— 开关型特性：true 启用、false 关闭
//   update(dt)                 —— 每帧回调（经 app.sm.addUpdate 注册），内部以 this.visible 闸门
//   dispose()                  —— 释放场景对象与监听
//   visible                   —— 当前开关状态（供工具栏统一切换）
import * as THREE from 'three';

const STATUS = { normal: 0x34d399, warning: 0xf59e0b, fault: 0xef4444 };

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

// ────────────────────────────────────────────────────────────
// I-01 冷/热通道气流可视化：沿机柜排间过道生成可开关的流动箭头
// ────────────────────────────────────────────────────────────
export class AirflowFX {
  constructor(app) {
    this.app = app; this.visible = false; this.group = null; this.t = 0;
  }
  setVisible(v) {
    this.visible = v;
    if (v) this._build(); else this._clear();
  }
  _rows() {
    const racks = (this.app.racks && this.app.racks.racks) || [];
    if (!racks.length) return [];
    const zs = [...new Set(racks.map((r) => Math.round((r.z || 0) * 2) / 2))].sort((a, b) => a - b);
    // 相邻两排之间即为一条过道：中点 Z + X 跨度
    const xs = racks.map((r) => r.x || 0); const minX = Math.min(...xs), maxX = Math.max(...xs);
    const rows = [];
    for (let i = 0; i < zs.length - 1; i++) {
      rows.push({ z: (zs[i] + zs[i + 1]) / 2, x0: minX - 1, x1: maxX + 1 });
    }
    return rows;
  }
  _build() {
    this._clear();
    const rows = this._rows(); if (!rows.length) return;
    const g = new THREE.Group();
    this.cones = [];
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85 });
    for (const row of rows) {
      const len = row.x1 - row.x0; const n = Math.max(3, Math.round(len / 2));
      for (let i = 0; i < n; i++) {
        const geo = new THREE.ConeGeometry(0.18, 0.6, 8);
        const m = new THREE.Mesh(geo, mat.clone());
        m.rotation.z = -Math.PI / 2; // 指向 +X（沿过道）
        m.position.set(row.x0 + (len * i) / n, 0.35, row.z);
        m.userData = { row, off: (len * i) / n, len };
        g.add(m); this.cones.push(m);
      }
    }
    this.group = g; this.app.sm.scene.add(g);
  }
  _clear() {
    if (this.group) {
      this.app.sm.scene.remove(this.group);
      this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    this.group = null; this.cones = null;
  }
  update(dt) {
    if (!this.visible || !this.cones) return;
    this.t += dt;
    for (const m of this.cones) {
      const u = m.userData; const speed = 2.2;
      let p = (u.off + this.t * speed) % u.len;
      m.position.x = u.row.x0 + p;
      const f = p / u.len; // 冷蓝 → 热红，体现送风到回风
      m.material.color.setRGB(0.2 + 0.8 * f, 0.6 - 0.4 * f, 1 - 0.8 * f);
    }
  }
  dispose() { this._clear(); }
}

// ────────────────────────────────────────────────────────────
// V-01 地面温度热力图：依机柜温度在地面生成径向热斑叠加
// ────────────────────────────────────────────────────────────
export class FloorHeatmapFX {
  constructor(app) {
    this.app = app; this.visible = false; this.mesh = null;
  }
  setVisible(v) {
    this.visible = v;
    if (v) this._build(); else this._clear();
  }
  _build() {
    this._clear();
    const racks = (this.app.racks && this.app.racks.racks) || [];
    if (!racks.length) return;
    const xs = racks.map((r) => r.x || 0), zs = racks.map((r) => r.z || 0);
    const minX = Math.min(...xs) - 3, maxX = Math.max(...xs) + 3;
    const minZ = Math.min(...zs) - 3, maxZ = Math.max(...zs) + 3;
    const W = 256, H = 256;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d'); c.fillStyle = 'rgba(20,32,46,0.0)'; c.fillRect(0, 0, W, H);
    for (const r of racks) {
      const t = Math.max(0, Math.min(1, ((r.temp || 24) - 18) / (34 - 18)));
      const cx = ((r.x - minX) / (maxX - minX)) * W, cy = ((r.z - minZ) / (maxZ - minZ)) * H;
      const rad = 26; const grd = c.createRadialGradient(cx, cy, 2, cx, cy, rad);
      const col = t < 0.5 ? `rgba(${30 + t * 2 * 80},${200 - t * 2 * 120},${230 - t * 2 * 150},0.55)`
        : `rgba(255,${200 - (t - 0.5) * 2 * 160},${60 - (t - 0.5) * 2 * 40},0.6)`;
      grd.addColorStop(0, col); grd.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = grd; c.beginPath(); c.arc(cx, cy, rad, 0, Math.PI * 2); c.fill();
    }
    const tex = new THREE.CanvasTexture(cv); tex.needsUpdate = true;
    const geo = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.7, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2; m.position.set((minX + maxX) / 2, 0.02, (minZ + maxZ) / 2);
    this.mesh = m; this.app.sm.scene.add(m);
  }
  _clear() {
    if (this.mesh) {
      this.app.sm.scene.remove(this.mesh);
      this.mesh.geometry.dispose(); this.mesh.material.map.dispose(); this.mesh.material.dispose();
    }
    this.mesh = null;
  }
  update() {}
  dispose() { this._clear(); }
}

// ────────────────────────────────────────────────────────────
// I-02 两点测距工具：点击地面取两点，绘制线段并标注距离（米）
// ────────────────────────────────────────────────────────────
export class MeasureTool {
  constructor(app) {
    this.app = app; this.visible = false; this.points = []; this.group = null;
    this._onDown = (e) => this._down(e);
  }
  setVisible(v) {
    this.visible = v;
    const cv = this.app.sm.renderer.domElement;
    if (v) { cv.addEventListener('pointerdown', this._onDown); this._reset(); this.app.ui.toast('测距：依次点击两点（再次点击重置）'); }
    else { cv.removeEventListener('pointerdown', this._onDown); this._reset(); }
  }
  _reset() {
    this.points = []; this._clear();
  }
  _ground(e) {
    const r = this.app.sm.renderer.domElement.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = -((e.clientY - r.top) / r.height) * 2 + 1;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(nx, ny), this.app.sm.camera);
    const hit = ray.intersectObjects(this.app.sm.scene.children, true)
      .find((h) => Math.abs(h.point.y) < 0.5);
    return hit ? hit.point : null;
  }
  _down(e) {
    if (!this.visible || e.button !== 0) return;
    const p = this._ground(e); if (!p) return;
    this.points.push(p);
    if (this.points.length === 2) this._draw();
  }
  _clear() {
    if (this.group) {
      this.app.sm.scene.remove(this.group);
      this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    this.group = null;
  }
  _draw() {
    this._clear(); const g = new THREE.Group();
    const [a, b] = this.points;
    const mat = new THREE.LineBasicMaterial({ color: 0x2bd6ff });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), mat);
    g.add(line);
    // 距离标注（Sprite）
    const dist = a.distanceTo(b);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const c = cv.getContext('2d'); c.fillStyle = 'rgba(11,20,34,0.85)'; c.fillRect(0, 0, 256, 64);
    c.fillStyle = '#2bd6ff'; c.font = 'bold 34px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(dist.toFixed(2) + ' m', 128, 32);
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sp.position.copy(a.clone().add(b).multiplyScalar(0.5)).add(new THREE.Vector3(0, 1.2, 0));
    sp.scale.set(2.2, 0.55, 1); g.add(sp);
    this.group = g; this.app.sm.scene.add(g);
  }
  update() {}
  dispose() { this._clear(); this.app.sm.renderer.domElement.removeEventListener('pointerdown', this._onDown); }
}

// ────────────────────────────────────────────────────────────
// I-03 设备告警角标：在 fault/warning 机柜顶部叠加"!"角标
// ────────────────────────────────────────────────────────────
export class AlertBadges {
  constructor(app) { this.app = app; this.visible = false; this.badges = []; }
  _tex() {
    if (this._t) return this._t;
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d'); c.fillStyle = '#ef4444'; c.beginPath(); c.arc(32, 32, 30, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.font = 'bold 46px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('!', 32, 34);
    this._t = new THREE.CanvasTexture(cv); return this._t;
  }
  setVisible(v) {
    this.visible = v; this._clear();
    if (!v) return;
    for (const r of (this.app.racks.racks || [])) {
      if (r.status !== 'fault' && r.status !== 'warning') continue;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._tex(), transparent: true, depthTest: false }));
      sp.scale.set(1.1, 1.1, 1); sp.position.set(r.x || 0, 2.6, r.z || 0);
      this.app.sm.scene.add(sp); this.badges.push(sp);
    }
  }
  _clear() { for (const s of this.badges) this.app.sm.scene.remove(s); this.badges = []; }
  update() {}
  dispose() { this._clear(); }
}

// ────────────────────────────────────────────────────────────
// I-04 演示场景叙事预设：正常 / 高负载 / 故障演练（委托 racks.applyScenario）
// ────────────────────────────────────────────────────────────
export class DemoScenarios {
  constructor(app) { this.app = app; this.current = 'normal'; }
  apply(name) {
    this.current = name || 'normal';
    if (this.app.racks && this.app.racks.applyScenario) this.app.racks.applyScenario(this.current);
    const label = { normal: '正常', load: '高负载', fault: '故障演练' }[this.current] || this.current;
    this.app.ui.toast(`演示场景：${label}`);
  }
  // 非开关型，无 visible；为统一注册提供 update 占位
  update() {}
  dispose() {}
}

// ────────────────────────────────────────────────────────────
// V-03 主题/昼夜切换：在宿主元素上覆盖 CSS 变量（暗色=默认，亮色=覆盖）
// ────────────────────────────────────────────────────────────
export class ThemeSwitch {
  constructor(app) { this.app = app; this.current = 'dark'; }
  apply(mode) {
    this.current = mode || 'dark';
    const s = this.app.rootEl.style;
    if (this.current === 'dark') {
      ['--bg', '--surface', '--surface-solid', '--text', '--text-dim', '--border'].forEach((k) => s.removeProperty(k));
    } else {
      s.setProperty('--bg', '#eef2f7'); s.setProperty('--surface', 'rgba(255,255,255,0.92)');
      s.setProperty('--surface-solid', '#ffffff'); s.setProperty('--text', '#0f172a');
      s.setProperty('--text-dim', '#475569'); s.setProperty('--border', '#cbd5e1');
    }
    this.app.ui.toast(`主题：${this.current === 'dark' ? '暗色' : '亮色'}`);
  }
  update() {}
  dispose() {}
}

// ────────────────────────────────────────────────────────────
// V-02 状态 LED 呼吸：对告警机柜状态标牌做呼吸闪烁（安全近似）
// ────────────────────────────────────────────────────────────
export class LedBreathing {
  constructor(app) { this.app = app; this.visible = false; this._prep = false; }
  setVisible(v) { this.visible = v; }
  _prepare() {
    if (this._prep) return;
    this._prep = true;
    // 告警标牌 Sprite 默认非透明，呼吸需开启透明度；仅处理一次
    for (const r of (this.app.racks.racks || [])) {
      if (r.status !== 'fault' && r.status !== 'warning') continue;
      if (r._billboard && r._billboard.material) r._billboard.material.transparent = true;
    }
  }
  update(dt) {
    if (!this.visible) return;
    this._prepare();
    this._t = (this._t || 0) + dt;
    const k = 0.55 + 0.45 * Math.sin(this._t * 3);
    for (const r of (this.app.racks.racks || [])) {
      if (r.status !== 'fault' && r.status !== 'warning') continue;
      if (r._billboard && r._billboard.material) {
        r._billboard.material.opacity = k;
        r._billboard.scale.setScalar(0.9 + 0.2 * k);
      }
    }
  }
  dispose() {}
}

// ────────────────────────────────────────────────────────────
// V-04 进入转场：首屏场景淡入（canvas 透明度）
// ────────────────────────────────────────────────────────────
export class EnterTransition {
  constructor(app) { this.app = app; }
  play() {
    const cv = this.app.sm.renderer.domElement;
    cv.style.transition = 'opacity 0.6s ease'; cv.style.opacity = '0';
    requestAnimationFrame(() => { cv.style.opacity = '1'; });
  }
  update() {}
  dispose() {}
}

// ────────────────────────────────────────────────────────────
// U-01 首次引导：首屏轻量引导浮层（localStorage 记忆）
// ────────────────────────────────────────────────────────────
export class Onboarding {
  constructor(app, domRoot) {
    this.app = app; this.domRoot = domRoot; this.el = null;
  }
  maybeShow() {
    let seen = false; try { seen = localStorage.getItem('dc3d.onboarded') === '1'; } catch {}
    if (seen) return;
    this.el = el('div', 'fx-onboard',
      '<div class="fx-onboard-card">' +
      '<div class="fx-onboard-t">快速上手</div>' +
      '<ul>' +
      '<li><b>视角</b>：全景 / 俯视 / 等距 / 正视，一键切换机位</li>' +
      '<li><b>着色</b>：按状态 / 温度 / 负载 / 类型给机柜上色</li>' +
      '<li><b>定位</b>：输入机柜编号，自动聚焦并打开信息</li>' +
      '<li><b>游览</b>：自动巡检可无人值守环游机房</li>' +
      '<li><b>演示</b>：气流 / 热力图 / 测距 / 场景 / 主题 一键开关</li>' +
      '</ul>' +
      '<button class="fx-onboard-ok primary">开始浏览</button></div>');
    this.domRoot.appendChild(this.el);
    this.el.querySelector('.fx-onboard-ok').addEventListener('click', () => this.dismiss());
  }
  dismiss() {
    try { localStorage.setItem('dc3d.onboarded', '1'); } catch {}
    if (this.el) { this.el.remove(); this.el = null; }
  }
  update() {}
  dispose() { if (this.el) this.el.remove(); }
}

// ────────────────────────────────────────────────────────────
// U-02 快捷键帮助浮层："?" 按钮弹出速查
// ────────────────────────────────────────────────────────────
export class ShortcutHelp {
  constructor(app, domRoot) { this.app = app; this.domRoot = domRoot; this.el = null; }
  toggle() { this.el ? this.close() : this.open(); }
  open() {
    this.el = el('div', 'fx-help',
      '<div class="fx-help-card">' +
      '<div class="fx-help-t">快捷键与操作</div>' +
      '<div class="fx-help-grid">' +
      '<span>左键拖动</span><span>旋转</span><span>滚轮</span><span>缩放</span>' +
      '<span>右键拖动</span><span>平移</span><span>按住空格</span><span>平移 / 双击空格回默认视角</span>' +
      '<span>R</span><span>旋转设备</span><span>Del</span><span>删除</span>' +
      '<span>Ctrl+Z / Shift+Z</span><span>撤销 / 重做</span><span>Ctrl+A</span><span>全选</span>' +
      '</div>' +
      '<button class="fx-help-ok primary">关闭</button></div>');
    this.domRoot.appendChild(this.el);
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
    this.el.querySelector('.fx-help-ok').addEventListener('click', () => this.close());
  }
  close() { if (this.el) { this.el.remove(); this.el = null; } }
  update() {}
  dispose() { this.close(); }
}

// ────────────────────────────────────────────────────────────
// U-03 加载进度指示：首屏就绪进度条
// ────────────────────────────────────────────────────────────
export class LoadingProgress {
  constructor(app, domRoot) { this.app = app; this.domRoot = domRoot; this.el = null; this.bar = null; }
  show() {
    if (this.el) return;
    this.el = el('div', 'fx-loading', '<div class="fx-loading-card"><div class="fx-loading-t">正在准备 3D 机房…</div><div class="fx-loading-track"><div class="fx-loading-fill"></div></div></div>');
    this.bar = this.el.querySelector('.fx-loading-fill');
    this.domRoot.appendChild(this.el);
  }
  setProgress(p) { if (this.bar) this.bar.style.width = Math.max(0, Math.min(100, p * 100)) + '%'; }
  hide() { if (this.el) { this.el.remove(); this.el = null; this.bar = null; } }
  update() {}
  dispose() { this.hide(); }
}

// ────────────────────────────────────────────────────────────
// U-04 性能 HUD 增强：右上角显示着色 / 游览模式 + 帧时间
// ────────────────────────────────────────────────────────────
export class PerfHud {
  constructor(app, domRoot) { this.app = app; this.domRoot = domRoot; this.el = null; }
  _ensure() {
    if (this.el) return;
    this.el = el('div', 'fx-perfhud', '');
    this.domRoot.appendChild(this.el);
  }
  update() {
    if (!this.el) this._ensure();
    const mode = (this.app.racks && this.app.racks.colorMode) || '-';
    const tour = this.app.patrolActive ? '自动巡检' : (this.app.roamActive ? '第一人称' : '环绕');
    const n = (this.app.racks && this.app.racks.racks) ? this.app.racks.racks.length : 0;
    this.el.textContent = `着色 ${mode} · 游览 ${tour} · 机柜 ${n}`;
  }
  dispose() { if (this.el) this.el.remove(); }
}

// ────────────────────────────────────────────────────────────
// U-05 触屏手势：确保触控缩放 / 单指旋转可用
// ────────────────────────────────────────────────────────────
export class TouchGestures {
  constructor(app) { this.app = app; this.done = false; }
  ensure() {
    if (this.done) return; this.done = true;
    const c = this.app.sm.controls;
    if (c && THREE.TOUCH) { c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }; }
    this.app.ui.toast('已启用触屏手势（单指旋转 / 双指缩放）');
  }
  update() {}
  dispose() {}
}

// ────────────────────────────────────────────────────────────
// I-05 机柜详情增强：从详情条导出当前机柜配置卡
// ────────────────────────────────────────────────────────────
export class DetailExport {
  constructor(app, domRoot) { this.app = app; this.domRoot = domRoot; this._on = () => this.exportCard(); }
  attach() {
    const b = this.domRoot.querySelector('#detail-export');
    if (b) b.addEventListener('click', this._on);
  }
  exportCard() {
    const r = (this.app.racks && this.app.racks.selected) || null;
    if (!r) { this.app.ui.toast('请先在 3D 中点击一台机柜', 'warn'); return; }
    const lines = [
      `机柜配置卡  ${r.id || ''}`,
      `类型：${r.type || ''}`,
      `坐标：X ${r.x != null ? r.x.toFixed(1) : '-'} · Z ${r.z != null ? r.z.toFixed(1) : '-'}`,
      `状态：${r.status || ''} · 温度：${r.temp != null ? r.temp.toFixed(1) : '-'}℃`,
      `密度：${r.density != null ? r.density.toFixed(0) : '-'}%`,
      `设备数：${Array.isArray(r.devices) ? r.devices.length : 0}`,
    ].join('\n');
    const blob = new Blob([lines], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `机柜配置卡_${r.id || 'rack'}.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    this.app.ui.toast('已导出机柜配置卡');
  }
  update() {}
  dispose() { const b = this.domRoot.querySelector('#detail-export'); if (b) b.removeEventListener('click', this._on); }
}
