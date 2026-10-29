// ===========================================================================
// 「静电地板铺设」面板控制器（floorPanel.js）
//
// 把 floorConfig.js 的配置模型接到 UI：地板砖长度/宽度、离地高度（架空层深度）、
// 地板板厚、砖缝宽度、贴面颜色均可独立调整；改动经 validateFloorConfig 校验
// （红字定位到具体字段），同时把 sanitize 后的配置喂给 room.setFloorConfig()
// —— 3D 场景实时重建预览、不落盘；「保存」仅在零错误时可点，写入 localStorage
// 跨会话保持。另提供「重置默认」。
//
// 面板 DOM 为 tool-shell.html 的静态骨架（#floor-panel / #fp-body / #fp-err …），
// 字段为静态行（参数固定五项 + 贴面分段），无需动态渲染。入口：规划态顶栏
// #tb-floor「参数」按钮（data-fx="floor-config"），经 app.toggleFloorPanel()
// 开关（与 #bridge-panel 互斥，监控态不开放）。
//
// 坐标系口径（与 room.js 一致）：地板顶面恒为 y=0，机柜/设备等既有锚点不动；
// 「离地高度」实现为地板面向下架空层的深度（板厚 + 空腔 + 结构板面），空腔内
// 按 1.2m 网格布置支撑立柱。调大离地高度不抬高任何设备，只加深地板下敷设
// 空间（桥架「静电地板下方」敷设的标高区间随之变化）。
//
// 设计口径（与 BridgePanel 同源）：
//   · 编辑稿 this._draft 保留用户原始输入（含超范围值），错误信息如实显示；
//     场景侧看到的是 sanitize 钳制后的值——输入框与预览的差异即校验提示；
//   · 预览态同时写 floorConfig 的实时缓存（setLiveFloorConfig），使桥架
//     「地板下」敷设的立柱高度/标高区间随地板参数联动；
//   · 关闭面板不放弃已生效的实时预览（与桥架面板一致）；未保存的改动在
//     再次打开时从「当前生效配置」起稿。
// ===========================================================================
import {
  validateFloorConfig, FLOOR_LIMITS, FLOOR_SURFACES, FLOOR_DEFAULTS,
  setLiveFloorConfig, getLiveFloorConfig, loadFloorConfig, saveFloorConfig,
} from './floorConfig.js';
import { underYRange } from './bridgeConfig.js';
import { confirmDialog } from './confirmDialog.js';

const FIELDS = [
  { f: 'tileW', label: '地板砖长度', step: 0.05, tip: '沿房间 X 方向的单块砖长度（m）' },
  { f: 'tileD', label: '地板砖宽度', step: 0.05, tip: '沿房间 Z 方向的单块砖宽度（m）' },
  { f: 'raise', label: '离地高度', step: 0.05, tip: '地板面到结构板面的架空层深度（m）；地板顶面保持 y=0，不抬高设备' },
  { f: 'tileH', label: '地板板厚', step: 0.01, tip: '单块地板砖的厚度（m）' },
  { f: 'gap', label: '砖缝宽度', step: 0.002, tip: '相邻地砖之间的缝隙（m）' },
];
const COLLAPSE_KEY = 'dc3d.floorCollapsed';

export class FloorPanel {
  /**
   * @param {Object} app 引擎应用对象（room.setFloorConfig / ui.toast）
   * @param {Element|ShadowRoot} root 面板 DOM 所在根（domRoot；shadow 集成时为 shadowRoot）
   */
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.panel = root.querySelector('#floor-panel');
    this.body = root.querySelector('#fp-body');
    this.saveBtn = root.querySelector('#fp-save');
    this._draft = null;  // 编辑稿（保留原始输入）
    this._dirty = false; // 相对已保存配置是否有未保存改动
    this._closing = false;
    if (!this.panel || !this.body) return;
    this._bind();
    this._bindCollapse();
  }

  /** 面板当前是否展开（供顶栏按钮同步 active 态） */
  isOpen() { return !!this.panel && !this.panel.classList.contains('hidden'); }

  /**
   * 开关面板。force 可显式指定开/关；返回最终状态。
   * 有未保存改动时关闭需二次确认（确认期间仍视为打开）。
   */
  toggle(force) {
    const next = force === undefined ? !this.isOpen() : !!force;
    if (!this.panel) return false;
    if (!next) {
      if (this._dirty && !this._closing) {
        this._closing = true;
        confirmDialog(this.root, {
          title: '关闭静电地板参数面板',
          message: '当前有未保存的地板参数调整，关闭将放弃这些改动。',
          detail: '点击「保存」可先写入本地配置；已生效的实时预览不受影响。',
          confirmText: '放弃并关闭',
        }).then((ok) => {
          this._closing = false;
          if (ok) this._closeNow();
        });
        return true; // 等待确认期间保持打开
      }
      this._closeNow();
      return false;
    }
    // 打开：从「当前生效配置」起稿（room 内存态 = 上次保存值或上次预览值）
    this._draft = this.app.room && typeof this.app.room.getFloorConfig === 'function'
      ? this.app.room.getFloorConfig()
      : loadFloorConfig();
    this._dirty = false;
    this.panel.classList.remove('hidden');
    this._render();
    return true;
  }

  _closeNow() {
    if (!this.panel) return;
    this.panel.classList.add('hidden');
    this._draft = null;
    this._dirty = false;
  }

  /** 无条件关闭（不弹未保存确认；监控态切换等场景用） */
  closeNow() { this._closeNow(); }

  /**
   * 销毁：关闭面板 + 解绑自身监听 + 释放引用。
   * 监听虽绑在自身 DOM 上（宿主销毁时随之回收），但若面板仍处于打开态，
   * 其 input/click 回调会打到已释放的 room/bridge 上抛错；显式释放与
   * main.js dispose「统一登记逐个释放」的约定一致。
   */
  dispose() {
    try { this._closeNow(); } catch (_) { /* 销毁阶段不因关闭失败而中断 */ }
    if (this.body && this._onInputH) this.body.removeEventListener('input', this._onInputH);
    if (this.body && this._onClickH) this.body.removeEventListener('click', this._onClickH);
    this._onInputH = null;
    this._onClickH = null;
    this._draft = null;
    this.app = null;
    this.root = null;
    this.panel = null;
    this.body = null;
  }

  // -------------------------------------------------------------------------
  // 事件绑定
  // -------------------------------------------------------------------------
  _bind() {
    // 处理器留引用：dispose 时精确解绑，避免面板在宿主销毁后仍回调已释放的 room
    this._onInputH = (e) => this._onInput(e);
    this._onClickH = (e) => {
      const s = e.target.closest('.fp-seg [data-surface]');
      if (!s || !this.body.contains(s)) return;
      this._setSurface(s.dataset.surface);
    };
    this.body.addEventListener('input', this._onInputH);
    this.body.addEventListener('click', this._onClickH);
    const on = (id, fn) => { const el = this.root.querySelector(id); if (el) el.addEventListener('click', fn); };
    on('#fp-close', () => this.toggle(false));
    on('#fp-save', () => this._save());
    on('#fp-reset', () => this._reset());
  }

  /** 可收折（同 #aux-panel / #plan-tools / #bridge-panel 范式） */
  _bindCollapse() {
    const btn = this.root.querySelector('#fp-collapse');
    if (!btn) return;
    const apply = (collapsed) => {
      this.panel.classList.toggle('collapsed', collapsed);
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      btn.textContent = collapsed ? '展开 ▸' : '收起 ▾';
      btn.title = collapsed ? '展开静电地板参数面板' : '收起静电地板参数面板（释放 3D 视图）';
      try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch (_) { /* 无存储环境仅内存态 */ }
    };
    btn.addEventListener('click', () => apply(!this.panel.classList.contains('collapsed')));
    let stored = null;
    try { stored = localStorage.getItem(COLLAPSE_KEY); } catch (_) { /* 读取失败按默认 */ }
    const narrow = typeof window.matchMedia === 'function'
      && window.matchMedia('(max-width: 720px)').matches;
    apply(stored === null ? narrow : stored === '1');
  }

  // -------------------------------------------------------------------------
  // 渲染
  // -------------------------------------------------------------------------
  _render() {
    const c = this._draft;
    this.body.innerHTML = '';
    const sec = document.createElement('div');
    sec.className = 'eng-sec';
    sec.innerHTML = `
      <div class="eng-sec-t">地板几何参数（相互独立，可分别设置）</div>
      ${FIELDS.map((fd) => `
        <label class="field" title="${fd.tip}">
          <span>${fd.label}</span>
          <input type="number" class="fp-num" data-f="${fd.f}" step="${fd.step}"
                 min="${FLOOR_LIMITS[fd.f].min}" max="${FLOOR_LIMITS[fd.f].max}" value="${c[fd.f]}" />
          <em>m</em>
          <div class="fp-field-err"></div>
        </label>`).join('')}
      <label class="field" title="防静电贴面基色（即时生效）">
        <span>贴面颜色</span>
        <span class="seg wide fp-seg" role="group" aria-label="地板贴面颜色">
          ${FLOOR_SURFACES.map((s) => `<button type="button" data-surface="${s.key}" class="${c.surface === s.key ? 'active' : ''}" aria-pressed="${c.surface === s.key}">${s.label}</button>`).join('')}
        </span><em></em>
        <div class="fp-field-err"></div>
      </label>
      <div class="fp-info"></div>`;
    this.body.appendChild(sec);
    this._apply(false); // 首渲也跑校验（红字 + 保存按钮态 + 预览），不标记脏
  }

  // -------------------------------------------------------------------------
  // 编辑 → 校验 → 实时预览
  // -------------------------------------------------------------------------
  _onInput(e) {
    const input = e.target.closest('.fp-num');
    if (!input || !this.body.contains(input)) return;
    const f = input.dataset.f;
    const v = input.value === '' ? NaN : Number(input.value);
    if (!Number.isFinite(v)) return; // 空串/非法输入不改稿，保留上一个合法值
    this._draft[f] = v;
    this._apply(true);
  }

  _setSurface(key) {
    if (!FLOOR_SURFACES.some((s) => s.key === key)) return;
    if (this._draft.surface === key) return;
    this._draft.surface = key;
    const sec = this.body.querySelector('.fp-seg');
    if (sec) {
      sec.querySelectorAll('[data-surface]').forEach((b) => {
        const on = b.dataset.surface === key;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });
    }
    this._apply(true);
  }

  /**
   * 校验 + 错误渲染 + 实时预览（不落盘）。
   * dirty=true 表示本次来自用户编辑（标记未保存；关闭时确认）。
   */
  _apply(dirty) {
    if (dirty) this._dirty = true;
    const items = validateFloorConfig(this._draft);
    const errs = items.filter((i) => i.level === 'error');
    const warns = items.filter((i) => i.level === 'warn');
    // 字段级红字（落在对应输入行内）
    for (const label of this.body.querySelectorAll('.field')) {
      const input = label.querySelector('.fp-num');
      const box = label.querySelector('.fp-field-err');
      if (!box) continue;
      const field = input ? input.dataset.f : (label.querySelector('.fp-seg') ? 'surface' : null);
      const mine = items.filter((i) => i.field === field && i.level === 'error');
      box.innerHTML = mine.map((i) => `<div class="fp-err-item">${i.msg}</div>`).join('');
      label.classList.toggle('has-err', mine.length > 0);
    }
    // 顶部汇总
    const sum = this.root.querySelector('#fp-err');
    if (sum) {
      sum.textContent = errs.length
        ? `存在 ${errs.length} 项参数问题（红字标注），修正后「保存」才可点`
        : (warns.length ? warns[0].msg : '');
    }
    const warn = this.root.querySelector('#fp-warn');
    if (warn) {
      warn.className = `eng-warn ${errs.length ? 'error' : (warns.length ? 'warn' : 'ok')}`;
      warn.title = errs.length ? `存在 ${errs.length} 项未通过的校验项` : (warns.length ? warns[0].msg : '参数校验全部通过');
    }
    if (this.saveBtn) this.saveBtn.disabled = errs.length > 0;
    // 实时预览：钳制后的配置进场景（不写 localStorage）
    setLiveFloorConfig(this._draft);
    if (this.app.room && typeof this.app.room.setFloorConfig === 'function') {
      this.app.room.setFloorConfig(this._draft);
    }
    // 桥架联动：地板下敷设的立柱高度/标高区间随架空层深度变化，可见类即时重建
    const fx = this.app._fx && this.app._fx.bridge;
    if (fx && typeof fx.setConfig === 'function') {
      fx.setConfig(fx.getConfig(), { save: false });
    }
    // 派生信息：当前架空层深度 + 地板下桥架可敷设标高区间
    const info = this.body.querySelector('.fp-info');
    if (info) {
      const u = underYRange(getLiveFloorConfig());
      const raise = Number(this._draft.raise).toFixed(2);
      info.textContent = `当前架空层深度 ${raise} m · 地板下桥架可敷设标高 ${u.min.toFixed(2)} ~ ${u.max.toFixed(2)} m`;
    }
  }

  // -------------------------------------------------------------------------
  // 保存 / 重置
  // -------------------------------------------------------------------------
  _save() {
    const errs = validateFloorConfig(this._draft).filter((i) => i.level === 'error');
    if (errs.length) {
      this.app.ui.toast(`还有 ${errs.length} 项参数问题未修正，暂时不能保存`, 'warn');
      return;
    }
    // setFloorConfig 返回 sanitize 后的规范配置（输入框回显用）
    const applied = this.app.room && typeof this.app.room.setFloorConfig === 'function'
      ? this.app.room.setFloorConfig(this._draft)
      : this._draft;
    saveFloorConfig(applied);
    setLiveFloorConfig(null); // 预览缓存交回已保存配置
    this._draft = applied;
    this._dirty = false;
    this._render();
    this.app.ui.toast('静电地板参数已保存，刷新页面后仍生效');
  }

  async _reset() {
    const ok = await confirmDialog(this.root, {
      title: '恢复默认地板参数',
      message: '确定放弃当前调整，恢复设计默认值？',
      detail: `默认值：600×600 防静电砖 · 板厚 ${FLOOR_DEFAULTS.tileH * 100}cm · 砖缝 ${FLOOR_DEFAULTS.gap * 1000}mm · 离地高度 ${FLOOR_DEFAULTS.raise}m · 浅灰贴面。未保存的调整将丢失。`,
      confirmText: '恢复默认',
    });
    if (!ok) return;
    this._draft = JSON.parse(JSON.stringify(FLOOR_DEFAULTS));
    this._apply(true);
    // 重置即恢复默认并持久化（与桥架面板 resetConfig 一致）
    this._save();
  }
}
