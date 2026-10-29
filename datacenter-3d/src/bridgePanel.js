// ===========================================================================
// 「桥架铺设参数」面板控制器（bridgePanel.js）
//
// 把 bridgeConfig.js 的配置模型接到 UI：四类桥架（弱电 / 强电 / 接地干线 /
// 消防管架）的铺设位置（机柜上方 / 静电地板下方）、布置走向（全程互联 /
// 沿排纵贯 / 横穿）、层数、安装高度、宽度、横向偏移、吊杆/支架跨距、横档
// 间距均可调，改动经 validateBridgeConfig 校验（红字定位到具体桥架与层），
// 同时把钳制后的配置喂给 BridgeSystem.setConfig({ save:false }) —— 3D 场景
// 实时预览、不落盘；「保存」仅在零错误时可点，写入 localStorage 跨会话保持。
// 另提供「重置默认 / 导出 JSON / 导入 JSON」。
//
// 面板 DOM 为 tool-shell.html 的静态骨架（#bridge-panel / #bp-list / #bp-err …），
// 层编辑行由本类按层数动态渲染（#val-list 同款动态填充模式）。入口：规划态
// 顶栏 #tb-bridge「参数」按钮（data-fx="bridge-config"），经
// app.toggleBridgePanel() 开关（与 #floor-panel 互斥，监控态不开放）。
//
// 设计口径（与 docs/桥架参数自定义功能说明.md 一致）：
//   · 编辑稿 this._draft 保留用户原始输入（含超范围值），错误信息如实显示；
//     场景侧看到的是 sanitize 钳制后的值——输入框与预览的差异即校验提示；
//   · 间距按「本体净距」= 安装高度差 − 槽高 0.18m 校验（GB 51348-2019
//     第 8.5.5 条），口径与错误文案见 bridgeConfig.js 注释；
//   · 切换「铺设位置」时自动把各层标高搬进目标区间（机柜上方 ↔ 架空层），
//     避免用户面对一片红字；
//   · 编辑某类桥架而它当前隐藏时自动打开它（实时预览立即可见），显隐变更
//     经 BridgeSystem.onVisChange 广播，顶栏按钮与面板标签同步更新。
// ===========================================================================
import {
  validateBridgeConfig, exportBridgeConfig, importBridgeConfig,
  BRIDGE_LIMITS, BRIDGE_DEFAULTS, TRAY_H, underYRange,
} from './bridgeConfig.js';
import { confirmDialog } from './confirmDialog.js';
import { roomDims } from './config.js';
import { getLiveFloorConfig } from './floorConfig.js';

// 面板覆盖的四类桥架（与 bridgeConfig.BRIDGE_KINDS 同序）
const KIND_ORDER = ['weak', 'strong', 'ground', 'fire'];
// 支持「铺设位置 / 走向」的桥架类（弱电/强电）
const PLACE_KINDS = ['weak', 'strong'];
// 类 → 场景显隐组（ground/fire 同属 aux 组，随配套桥架一起显隐）
const FX_KIND = { weak: 'weak', strong: 'strong', ground: 'aux', fire: 'aux' };
// 铺设位置选项（place）
const PLACE_OPTS = [
  { v: 'over', label: '机柜上方' },
  { v: 'under', label: '静电地板下方' },
];
// 布置走向选项（route）
const ROUTE_OPTS = [
  { v: 'network', label: '全程互联' },
  { v: 'rows', label: '沿排纵贯' },
  { v: 'cross', label: '横穿布线' },
];
// 新增层默认抬升 0.6m：回响设计文档「强电高于弱电 0.6m」的分层范式；
// 层间距下限（0.30m 本体净距）由 validateBridgeConfig 把关，此处只给初值
const NEW_LAYER_DY = 0.6;
const COLLAPSE_KEY = 'dc3d.bridgeCollapsed';

export class BridgePanel {
  /**
   * @param {Object} app 引擎应用对象（_fx.bridge / ui.toast）
   * @param {Element|ShadowRoot} root 面板 DOM 所在根（domRoot；shadow 集成时为 shadowRoot）
   */
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.panel = root.querySelector('#bridge-panel');
    this.list = root.querySelector('#bp-list');
    this.saveBtn = root.querySelector('#bp-save');
    this._draft = null;  // 编辑稿（保留原始输入）
    this._dirty = false; // 相对已保存配置是否有未保存改动
    this._touched = new Set(); // 本次打开期间编辑过的桥架类（用于自动揭示）
    this._closing = false;     // 脏关闭确认进行中，防重复弹窗
    if (!this.panel || !this.list) return;
    this._bind();
    this._bindCollapse();
    // 显隐变更广播 → 面板标签同步（顶栏/大屏/面板自动揭示三处来源都覆盖）
    const fx = app._fx && app._fx.bridge;
    if (fx && typeof fx.onVisChange === 'function') {
      fx.onVisChange((kind, v) => this._syncVis(kind, v));
    }
  }

  /** 面板当前是否展开（供两端按钮同步 active 态） */
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
          title: '关闭桥架参数面板',
          message: '当前有未保存的桥架参数调整，关闭将放弃这些改动。',
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
    // 打开：从「已生效配置」起稿（上次保存值，而非上次丢弃的编辑稿）
    this._draft = this.app._fx.bridge.getConfig();
    this._dirty = false;
    this._touched.clear();
    this.panel.classList.remove('hidden');
    this._render();
    return true;
  }

  _closeNow() {
    if (!this.panel) return;
    this.panel.classList.add('hidden');
    this._draft = null;
    this._dirty = false;
    this._touched.clear();
  }

  /** 无条件关闭（不弹未保存确认；监控态切换等场景用） */
  closeNow() { this._closeNow(); }

  /**
   * 销毁：关闭面板 + 解绑自身监听 + 释放引用（同 floorPanel.dispose）。
   * 面板处于打开态时若不解绑，其委托回调会打到已释放的 bridge/room 上抛错。
   */
  dispose() {
    try { this._closeNow(); } catch (_) { /* 销毁阶段不因关闭失败而中断 */ }
    if (this.list && this._onInputH) this.list.removeEventListener('input', this._onInputH);
    if (this.list && this._onClickH) this.list.removeEventListener('click', this._onClickH);
    this._onInputH = null;
    this._onClickH = null;
    this._draft = null;
    this._touched = null;
    this.app = null;
    this.root = null;
    this.panel = null;
    this.list = null;
  }

  // -------------------------------------------------------------------------
  // 事件绑定
  // -------------------------------------------------------------------------
  _bind() {
    // 表单输入委托（数值字段）+ 层数 / 铺设位置 / 布置走向分段按钮
    // 处理器留引用：dispose 时精确解绑（同 floorPanel）
    this._onInputH = (e) => this._onInput(e);
    this._onClickH = (e) => {
      const sec = e.target.closest('.eng-sec');
      if (!sec || !this.list.contains(sec)) return;
      const cnt = e.target.closest('.bp-count [data-n]');
      if (cnt) { this._setLayerCount(sec.dataset.kind, Number(cnt.dataset.n)); return; }
      const pl = e.target.closest('.bp-seg [data-place]');
      if (pl) { this._setPlace(sec.dataset.kind, pl.dataset.place); return; }
      const rt = e.target.closest('.bp-seg [data-route]');
      if (rt) { this._setRoute(sec.dataset.kind, rt.dataset.route); return; }
    };
    this.list.addEventListener('input', this._onInputH);
    this.list.addEventListener('click', this._onClickH);
    const on = (id, fn) => { const el = this.root.querySelector(id); if (el) el.addEventListener('click', fn); };
    on('#bp-close', () => this.toggle(false));
    on('#bp-save', () => this._save());
    on('#bp-reset', () => this._reset());
    on('#bp-export', () => this._export());
    on('#bp-import', () => { const f = this.root.querySelector('#bp-import-file'); if (f) f.click(); });
    const file = this.root.querySelector('#bp-import-file');
    if (file) file.addEventListener('change', (e) => this._importFile(e));
  }

  /** 可收折（同 #aux-panel / #plan-tools 范式）：默认宽屏展开、窄屏收起，选择记 localStorage */
  _bindCollapse() {
    const btn = this.root.querySelector('#bp-collapse');
    if (!btn) return;
    const apply = (collapsed) => {
      this.panel.classList.toggle('collapsed', collapsed);
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      btn.textContent = collapsed ? '展开 ▸' : '收起 ▾';
      btn.title = collapsed ? '展开桥架参数面板' : '收起桥架参数面板（释放 3D 视图）';
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
  _yMax() { return roomDims.height - BRIDGE_LIMITS.topClear - TRAY_H; }

  /** 某类桥架当前铺设位置下的层标高输入区间 */
  _layerBounds(kind) {
    const c = this._draft[kind];
    if (c && c.place === 'under') {
      const u = underYRange(getLiveFloorConfig());
      return { min: u.min, max: u.max, under: true };
    }
    return { min: BRIDGE_LIMITS.floorClear, max: this._yMax(), under: false };
  }

  _render() {
    const cfg = this._draft;
    this.list.innerHTML = '';
    for (const kind of KIND_ORDER) {
      const c = cfg[kind];
      const vis = this.app._fx.bridge.isVisible(FX_KIND[kind]);
      const sec = document.createElement('div');
      sec.className = 'eng-sec';
      sec.dataset.kind = kind;
      const placeSeg = PLACE_KINDS.indexOf(kind) >= 0 ? `
        <label class="field"><span>铺设位置</span>
          <span class="seg wide bp-seg" role="group" aria-label="${c.label}铺设位置">
            ${PLACE_OPTS.map((o) => `<button type="button" data-place="${o.v}" class="${c.place === o.v ? 'active' : ''}" aria-pressed="${c.place === o.v}">${o.label}</button>`).join('')}
          </span><em></em>
        </label>
        <label class="field"><span>布置走向</span>
          <span class="seg wide bp-seg" role="group" aria-label="${c.label}布置走向">
            ${ROUTE_OPTS.map((o) => `<button type="button" data-route="${o.v}" class="${c.route === o.v ? 'active' : ''}" aria-pressed="${c.route === o.v}">${o.label}</button>`).join('')}
          </span><em></em>
        </label>` : '';
      sec.innerHTML = `
        <div class="eng-sec-t">
          <span class="bp-dot" data-kind="${kind}"></span>${c.label}
          <span class="bp-vis${vis ? ' on' : ''}">${vis ? '显示中' : '已隐藏'}</span>
        </div>
        ${placeSeg}
        <label class="field"><span>层数</span>
          <span class="seg wide bp-count" role="group" aria-label="${c.label}层数">
            ${[1, 2, 3].map((n) => `<button type="button" data-n="${n}" class="${c.layers.length === n ? 'active' : ''}" aria-pressed="${c.layers.length === n}">${n}</button>`).join('')}
          </span><em>层</em>
        </label>
        <div class="bp-layers"></div>
        <label class="field"><span>横向偏移</span><input type="number" class="bp-num" data-f="offsetX" step="0.05" min="${BRIDGE_LIMITS.offsetX.min}" max="${BRIDGE_LIMITS.offsetX.max}" value="${c.offsetX}" /><em>m</em></label>
        <label class="field"><span>${c.place === 'under' ? '支架跨距' : '吊杆跨距'}</span><input type="number" class="bp-num" data-f="hangerStep" step="0.1" min="${BRIDGE_LIMITS.hangerStep.min}" max="${BRIDGE_LIMITS.hangerStep.max}" value="${c.hangerStep}" /><em>m</em></label>
        <label class="field"><span>横档间距</span><input type="number" class="bp-num" data-f="rungStep" step="0.05" min="${BRIDGE_LIMITS.rungStep.min}" max="${BRIDGE_LIMITS.rungStep.max}" value="${c.rungStep}" /><em>m</em></label>
        <div class="bp-kind-err"></div>`;
      const box = sec.querySelector('.bp-layers');
      c.layers.forEach((l, i) => box.appendChild(this._layerRow(kind, i, l)));
      this.list.appendChild(sec);
    }
    this._apply(false); // 首渲也跑校验（红字 + 保存按钮态 + 预览），不标记脏
  }

  _layerRow(kind, i, l) {
    const b = this._layerBounds(kind);
    const row = document.createElement('div');
    row.className = 'bp-layer';
    row.dataset.layer = String(i);
    row.innerHTML = `
      <label class="field"><span>第${i + 1}层高度</span><input type="number" class="bp-num" data-f="y" step="0.05" min="${b.min.toFixed(2)}" max="${b.max.toFixed(2)}" value="${l.y}" /><em>m</em></label>
      <label class="field"><span>第${i + 1}层宽度</span><input type="number" class="bp-num" data-f="width" step="0.05" min="${BRIDGE_LIMITS.width.min}" max="${BRIDGE_LIMITS.width.max}" value="${l.width}" /><em>m</em></label>`;
    return row;
  }

  // -------------------------------------------------------------------------
  // 编辑 → 校验 → 实时预览
  // -------------------------------------------------------------------------
  _onInput(e) {
    const input = e.target.closest('.bp-num');
    if (!input || !this.list.contains(input)) return;
    const sec = input.closest('.eng-sec');
    const kind = sec.dataset.kind;
    const f = input.dataset.f;
    const row = input.closest('.bp-layer');
    const c = this._draft[kind];
    const v = input.value === '' ? NaN : Number(input.value);
    if (!Number.isFinite(v)) return; // 空串/非法输入不改稿，保留上一个合法值
    if (row) {
      const i = Number(row.dataset.layer);
      c.layers[i] = c.layers[i] || {};
      c.layers[i][f] = v;
    } else {
      c[f] = v;
    }
    this._touched.add(kind);
    this._apply(true);
  }

  _setLayerCount(kind, n) {
    const c = this._draft[kind];
    n = Math.max(BRIDGE_LIMITS.layers.min, Math.min(BRIDGE_LIMITS.layers.max, n));
    if (c.layers.length === n) return;
    if (n > c.layers.length) {
      while (c.layers.length < n) {
        const last = c.layers[c.layers.length - 1];
        const b = this._layerBounds(kind);
        c.layers.push({ y: Math.min(last.y + NEW_LAYER_DY, b.max), width: last.width });
      }
    } else {
      c.layers.length = n;
    }
    this._touched.add(kind);
    this._render();
    this._apply(true);
  }

  /**
   * 切换铺设位置（机柜上方 ↔ 静电地板下方）。各层标高自动搬进目标区间，
   * 避免用户切过去就面对一片红字；切回机柜上方时恢复本次会话的上一组标高
   * （无记录则取该类默认高度）。
   * 注意：必须先把 c.place 切到目标值再取 _layerBounds——该函数按当前
   * place 返回区间，若用旧位置区间算中点，会把标高搬进错误区间（如切到
   * 「地板下方」却取机柜上方区间中值 4.935，直接越界报错）。
   */
  _setPlace(kind, place) {
    if (PLACE_KINDS.indexOf(kind) < 0) return;
    const c = this._draft[kind];
    if (c.place === place) return;
    c.place = place; // 先切换，_layerBounds 按目标位置取区间
    const b = this._layerBounds(kind);
    const clampY = (y) => Math.min(b.max, Math.max(b.min, y));
    if (place === 'under') {
      if (!this._lastOverY) this._lastOverY = new Map();
      this._lastOverY.set(kind, c.layers.map((l) => l.y));
      const y0 = clampY((b.min + b.max) / 2); // 架空层中值：下留立柱间隙、上不顶穿地板
      c.layers = c.layers.map((l) => ({ y: y0, width: l.width }));
    } else {
      const prev = this._lastOverY && this._lastOverY.get(kind);
      c.layers = c.layers.map((l, i) => ({
        y: clampY(prev && prev[i] != null ? prev[i] : BRIDGE_DEFAULTS[kind].layers[0].y),
        width: l.width,
      }));
    }
    this._touched.add(kind);
    this._render();
    this._apply(true);
  }

  /** 切换布置走向（全程互联 / 沿排纵贯 / 横穿布线） */
  _setRoute(kind, route) {
    if (PLACE_KINDS.indexOf(kind) < 0) return;
    const c = this._draft[kind];
    if (c.route === route) return;
    c.route = route;
    this._touched.add(kind);
    this._render();
    this._apply(true);
  }

  /**
   * 校验 + 错误渲染 + 实时预览（不落盘）。
   * dirty=true 表示本次来自用户编辑（标记未保存；关闭时确认）。
   */
  _apply(dirty) {
    if (dirty) this._dirty = true;
    // floorCfg（离地高度/板厚）决定「静电地板下方」敷设的标高校验区间
    const errs = validateBridgeConfig(this._draft, roomDims, getLiveFloorConfig());
    // 每类错误落在对应桥架节下
    for (const sec of this.list.querySelectorAll('.eng-sec')) {
      const mine = errs.filter((e) => e.kind === sec.dataset.kind);
      const box = sec.querySelector('.bp-kind-err');
      if (box) box.innerHTML = mine.map((e) => `<div class="bp-err-item">${e.msg}</div>`).join('');
      sec.classList.toggle('has-err', mine.length > 0);
    }
    // 顶部汇总 + 标题告警点
    const sum = this.root.querySelector('#bp-err');
    if (sum) {
      sum.textContent = errs.length
        ? `存在 ${errs.length} 项参数问题（红字标注），修正后「保存」才可点`
        : '';
    }
    const warn = this.root.querySelector('#bp-warn');
    if (warn) {
      warn.className = `eng-warn ${errs.length ? 'error' : 'ok'}`;
      warn.title = errs.length ? `存在 ${errs.length} 项未通过的校验项` : '参数校验全部通过';
    }
    if (this.saveBtn) this.saveBtn.disabled = errs.length > 0;
    // 实时预览：钳制后的配置进场景（不写 localStorage）
    this.app._fx.bridge.setConfig(this._draft, { save: false });
    // 自动揭示：编辑中的桥架类若处于隐藏，打开它让预览立即可见
    const fx = this.app._fx.bridge;
    for (const kind of KIND_ORDER) {
      if (!this._touched.has(kind)) continue;
      if (!fx.isVisible(FX_KIND[kind])) fx.setVisible(FX_KIND[kind], true);
    }
  }

  // -------------------------------------------------------------------------
  // 保存 / 重置 / 导入导出
  // -------------------------------------------------------------------------
  _save() {
    const errs = validateBridgeConfig(this._draft, roomDims, getLiveFloorConfig());
    if (errs.length) {
      this.app.ui.toast(`还有 ${errs.length} 项参数问题未修正，暂时不能保存`, 'warn');
      return;
    }
    // save:true → 写 localStorage；返回值为 sanitize 后的规范配置
    this._draft = this.app._fx.bridge.setConfig(this._draft, { save: true });
    this._dirty = false;
    this._touched.clear();
    this._render(); // 输入框回显规范值（如 3.10 → 3.1）
    this.app.ui.toast('桥架参数已保存，刷新页面后仍生效');
  }

  async _reset() {
    const ok = await confirmDialog(this.root, {
      title: '恢复默认桥架参数',
      message: '确定放弃当前调整，恢复设计文档默认值？',
      detail: '默认值：弱电/强电同标高 3.40m、横向各偏 ±0.35m（水平平行，净距 0.35m）· 宽 400/300mm · 接地干线 4.20m/250mm · 消防管架 4.50m/220mm。未保存的调整将丢失。',
      confirmText: '恢复默认',
    });
    if (!ok) return;
    this._draft = this.app._fx.bridge.resetConfig();
    this._dirty = false;
    this._touched.clear();
    this._render();
    this.app.ui.toast('已恢复默认桥架参数');
  }

  _export() {
    try {
      const blob = new Blob([exportBridgeConfig(this._draft)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'bridge-config.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      this.app.ui.toast('已导出桥架参数 JSON（当前编辑稿，含未保存调整）');
    } catch (e) {
      this.app.ui.toast('导出失败：' + ((e && e.message) || e), 'warn');
    }
  }

  _importFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const r = importBridgeConfig(String(reader.result || ''));
      if (!r.ok) { this.app.ui.toast('导入失败：' + r.error, 'warn'); return; }
      this._draft = r.cfg;
      this._dirty = true;
      this._render();
      const errs = validateBridgeConfig(this._draft, roomDims, getLiveFloorConfig());
      this.app.ui.toast(errs.length
        ? `已导入桥架参数，但有 ${errs.length} 项需修正后才能保存`
        : '已导入桥架参数，确认无误后点击「保存」');
    };
    reader.onerror = () => this.app.ui.toast('读取文件失败', 'warn');
    reader.readAsText(file);
  }

  // -------------------------------------------------------------------------
  // 显隐广播同步（BridgeSystem.onVisChange）
  // -------------------------------------------------------------------------
  _syncVis(kind, v) {
    if (!this.isOpen()) return;
    const mapped = kind === 'aux' ? ['ground', 'fire'] : [kind];
    for (const sec of this.list.querySelectorAll('.eng-sec')) {
      if (mapped.indexOf(sec.dataset.kind) < 0) continue;
      const el = sec.querySelector('.bp-vis');
      if (el) {
        el.textContent = v ? '显示中' : '已隐藏';
        el.classList.toggle('on', v);
      }
    }
    const btn = this.root.querySelector(`[data-fx="bridge-${kind}"]`);
    if (btn) btn.classList.toggle('active', v);
  }
}
