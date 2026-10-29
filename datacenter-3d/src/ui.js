import { TYPE_LABEL, STATUS_LABEL } from './config.js';

// HTML 转义（与 main.js:34 / wallEditor.js 同规则）。
// 必要性：机柜编号、设备名称均可来自「导入的房间 JSON」，属于外部可控数据；
// 信息面板是全工程唯一把这些值拼进 innerHTML 的地方，注入面必须在这里收口。
function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// UI 控制器：绑定 DOM、更新信息面板 / 状态 / 悬停提示 / 提示气泡
// root 为元素查找容器（shadow 集成时为 shadowRoot）；
// rectRoot 为坐标换算基准元素（shadow 集成时为宿主元素——shadowRoot 无
// getBoundingClientRect，且面板 position:absolute 的包含块正是宿主元素）
export class UIController {
  constructor(root, cb, rectRoot) {
    this.root = root || document;
    this.rectRoot = rectRoot || this.root;
    this.cb = cb;
    const $ = (id) => this.root.querySelector(`#${id}`);
    const $$ = (sel) => this.root.querySelectorAll(sel);
    this.el = {
      presets: $$('[data-preset]'),
      modes: $$('[data-mode]'),
      searchInput: $('search-input'),
      searchBtn: $('search-btn'),
      bloom: $('bloom-toggle'),
      info: $('info'),
      infoBody: $('info-body'),
      stats: $('stats'),
      tooltip: $('tooltip'),
      toast: $('toast'),
    };
    this._cleanups = [];
    this._wire();
  }

  _on(el, evt, fn, opts) {
    if (!el) return;
    el.addEventListener(evt, fn, opts);
    this._cleanups.push(() => el.removeEventListener(evt, fn, opts));
  }

  _wire() {
    this.el.presets.forEach((b) => this._on(b, 'click', () => this.cb.onPreset(b.dataset.preset)));
    this.el.modes.forEach((b) => this._on(b, 'click', () => {
      this.el.modes.forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      this.cb.onColorMode(b.dataset.mode);
    }));
    this._on(this.el.searchBtn, 'click', () => this.cb.onSearch(this.el.searchInput.value));
    this._on(this.el.searchInput, 'keydown', (e) => {
      if (e.key === 'Enter') this.cb.onSearch(this.el.searchInput.value);
    });
    this._on(this.el.bloom, 'change', () => this.cb.onToggleBloom(this.el.bloom.checked));
    this._on(this.el.info, 'click', (e) => {
      // 关闭按钮：与操作按钮区隔离，避免误触发
      if (e.target.closest('#info-close')) {
        this.showInfo(null);
        return;
      }
      const a = e.target.closest('[data-act]');
      if (a) this.cb.onAction(a.dataset.act, a.dataset.arg);
    });
  }

  // 卸载：解绑全部监听并清掉 toast 定时器
  dispose() {
    this._cleanups.forEach((fn) => fn());
    this._cleanups = [];
    if (this._t) { clearTimeout(this._t); this._t = null; }
  }

  // 检查器面板显隐变化时通知宿主（Vue 监控大屏）：宿主据此次让位/恢复右侧面板，
  // 避免「设备信息」浮层压住大屏的告警/传感器面板（shadow DOM 内无法直接操作宿主布局）
  _notifyInfoVis(visible) {
    if (this._infoVis === visible) return;
    this._infoVis = visible;
    try { window.dispatchEvent(new CustomEvent('dc-info-vis', { detail: { visible } })); } catch { /* 旧环境无 CustomEvent 时静默 */ }
  }

  /**
   * 展示机柜信息。
   * @param {Object} rack   机柜对象；null = 隐藏面板
   * @param {boolean} lite  轻量模式：只更新「随位置变化的字段」（坐标/朝向/设备数），
   *                       不重建整个 innerHTML。供拖拽过程中的高频 pointermove 调用，
   *                       避免每次移动都全量重建 DOM（原实现每 pointermove 重建
   *                       ~10 行 HTML + N 行设备清单，是拖拽掉帧的主因之一）。
   *                       首次进入或机柜切换时自动走全量渲染。
   */
  showInfo(rack, lite = false) {
    if (!rack) { this.el.info.classList.add('hidden'); this._notifyInfoVis(false); this._infoRack = null; return; }
    this.el.info.classList.remove('hidden');
    // 换了一台机柜，或面板此前是隐藏态 → 必须全量渲染
    const needFull = !lite || this._infoRack !== rack || !this._infoBodyRef;
    if (needFull) {
      this._renderInfoFull(rack);
      this._infoRack = rack;
      this._notifyInfoVis(true);
      return;
    }
    // 轻量更新：仅改三个会随拖拽变化的文本节点
    const r = this._infoRefs;
    if (!r) return;
    if (r.coord) r.coord.textContent = `X ${rack.x.toFixed(1)} · Z ${rack.z.toFixed(1)}`;
    if (r.rot) r.rot.textContent = `${(((rack.rotationY || 0) * 180 / Math.PI) % 360 + 360) % 360}°`;
    const n = Array.isArray(rack.devices) ? rack.devices.length : 0;
    if (r.devCount && r.devCount.textContent !== `${n} 台`) r.devCount.textContent = `${n} 台`;
  }

  _renderInfoFull(rack) {
    this._infoBodyRef = null;
    this._infoRefs = null;
    // 已上架设备清单（只读展示，随所选机柜动态刷新）
    const devs = Array.isArray(rack.devices) ? rack.devices : [];
    const devStLabel = { online: '在线', neutral: '正常', warning: '预警', alert: '告警', offline: '离线' };
    const devRows = devs.map((d) => `
      <div class="dev-row">
        <span class="dev-u">${d.u != null ? esc(d.u) + 'U' : '—'}</span>
        <span class="dev-name">${esc(d.n || '设备')}</span>
        <span class="dev-st st-${d.st || 'online'}">${devStLabel[d.st] || '在线'}</span>
      </div>`).join('');
    this.el.infoBody.innerHTML = `
      <div class="row"><span>编号</span><b>${esc(rack.id)}</b></div>
      <div class="row"><span>类型</span><b>${esc(TYPE_LABEL[rack.type] || rack.type)}</b></div>
      <div class="row"><span>坐标</span><b data-f="coord">X ${rack.x.toFixed(1)} · Z ${rack.z.toFixed(1)}</b></div>
      <div class="row"><span>朝向</span><b data-f="rot">${(((rack.rotationY || 0) * 180 / Math.PI) % 360 + 360) % 360}°</b></div>
      <div class="row"><span>状态</span><b class="st-${rack.status}">${esc(STATUS_LABEL[rack.status] || rack.status)}</b></div>
      <div class="row"><span>温度</span><b>${rack.temp.toFixed(1)} °C</b></div>
      <div class="row"><span>密度</span><b>${rack.density.toFixed(0)} %</b></div>
      <div class="dev-head"><span>已上架设备</span><b data-f="devCount">${devs.length} 台</b></div>
      <div class="dev-list">${devRows || '<div class="dev-empty">暂无设备清单</div>'}</div>`;
    this._infoBodyRef = this.el.infoBody;
    // 缓存轻量更新要写的三个节点（查询一次，后续拖拽不再 querySelector）
    this._infoRefs = {
      coord: this.el.infoBody.querySelector('[data-f="coord"]'),
      rot: this.el.infoBody.querySelector('[data-f="rot"]'),
      devCount: this.el.infoBody.querySelector('[data-f="devCount"]'),
    };
  }

  setStats(text) { this.el.stats.textContent = text; }

  /**
   * 多选聚合面板（选中 ≥ 2 台时替代单柜检查器）。
   * 单柜面板逐台列设备清单，多选时列清单没有意义 —— 用户要的是
   * 「这批柜一共多少台、什么类型、有没有告警、平均多热」，
   * 外加直接可点的批量操作（删除 / 旋转，走既有 data-act 委托）。
   * @param {Array} list selectedRacks
   */
  showInfoMulti(list) {
    const arr = Array.isArray(list) ? list : [];
    if (arr.length < 2) { this.showInfo(arr[0] || null); return; }
    this.el.info.classList.remove('hidden');
    this._infoBodyRef = null;
    this._infoRefs = null;
    const typeCount = new Map();
    const stCount = new Map();
    let tempSum = 0, densSum = 0, devSum = 0, tempN = 0, densN = 0;
    for (const r of arr) {
      typeCount.set(r.type, (typeCount.get(r.type) || 0) + 1);
      stCount.set(r.status, (stCount.get(r.status) || 0) + 1);
      if (typeof r.temp === 'number') { tempSum += r.temp; tempN++; }
      if (typeof r.density === 'number') { densSum += r.density; densN++; }
      if (Array.isArray(r.devices)) devSum += r.devices.length;
    }
    const typeTxt = [...typeCount].map(([t, n]) => `${esc(TYPE_LABEL[t] || t)} × ${n}`).join('、');
    const stTxt = [...stCount].map(([s, n]) =>
      `<b class="st-${esc(s)}">${esc(STATUS_LABEL[s] || s)} × ${n}</b>`).join('、');
    const avgTemp = tempN ? (tempSum / tempN).toFixed(1) : '—';
    const avgDens = densN ? (densSum / densN).toFixed(0) : '—';
    this.el.infoBody.innerHTML = `
      <div class="row"><span>已选中</span><b>${arr.length} 台</b></div>
      <div class="row"><span>类型构成</span><b>${typeTxt}</b></div>
      <div class="row"><span>状态分布</span><b>${stTxt}</b></div>
      <div class="row"><span>平均温度</span><b>${avgTemp} °C</b></div>
      <div class="row"><span>平均密度</span><b>${avgDens} %</b></div>
      <div class="dev-head"><span>柜内设备合计</span><b>${devSum} 台</b></div>
      <div class="multi-acts">
        <button data-act="rot">旋转选中</button>
        <button data-act="del" class="danger">删除选中</button>
      </div>
      <div class="multi-hint">方向键平移 · R 旋转 · Delete 删除 · Esc 取消选择</div>`;
    this._notifyInfoVis(true);
  }

  // 机柜详情视图内点击柜内设备时，在检查器面板展示设备信息
  showDeviceInfo(dv) {
    if (!dv) { this.showInfo(null); return; }
    this.el.info.classList.remove('hidden');
    const stMap = { normal: '正常', warning: '告警', fault: '故障', offline: '离线', alert: '告警' };
    const st = dv.st || 'normal';
    const stLabel = stMap[st] || st;
    const kindMap = {
      switch: '交换机', firewall: '防火墙', router: '路由器', compute: '计算服务器',
      storage: '存储服务器', patch: '配线架', fiber: '光纤盘', pdu: 'PDU', kvm: 'KVM', lb: '负载均衡',
    };
    const kind = dv.kind || (dv.type ? kindMap[dv.type] : null) || '设备';
    this.el.infoBody.innerHTML = `
      <div class="row"><span>名称</span><b>${String(dv.n || kind).replace(/[<>&]/g, '')}</b></div>
      <div class="row"><span>类型</span><b>${kind}</b></div>
      <div class="row"><span>高度</span><b>${dv.u != null ? dv.u : (dv.h != null ? dv.h : '—')} U</b></div>
      <div class="row"><span>状态</span><b class="st-${st}">${stLabel}</b></div>
      <div class="row"><span>端口</span><b>${dv.ports != null ? dv.ports : '—'}</b></div>`;
    this._notifyInfoVis(true);
  }

  showTooltip(text, x, y) {
    // x/y 为视口坐标（来自 pointer 事件）；挂载根可能不在视口原点（Vue 嵌入时），
    // 需换算为相对宿主元素的坐标（独立运行时宿主位于 0,0，行为不变）
    const r = this.rectRoot.getBoundingClientRect ? this.rectRoot.getBoundingClientRect() : { left: 0, top: 0 };
    this.el.tooltip.textContent = text;
    this.el.tooltip.style.left = `${x - r.left}px`;
    this.el.tooltip.style.top = `${y - r.top}px`;
    this.el.tooltip.classList.add('show');
  }

  hideTooltip() { this.el.tooltip.classList.remove('show'); }

  // msg：提示文本；type：'info'(默认) | 'warn' | 'error'；
  // dur：停留毫秒，省略时按类型取默认值（error 4200 / 其他 2200）。
  // 多行文本（如阶段闸门的错误清单）用 \n 分隔，需配合 white-space:pre-line。
  toast(msg, type = 'info', dur = null) {
    this.el.toast.textContent = msg;
    // 多行文本（含 \n）切换为 multiline 样式：保留换行 + 左对齐 + 放宽宽度
    this.el.toast.classList.toggle('multiline', typeof msg === 'string' && msg.indexOf('\n') >= 0);
    // 整改（交互审查 D-7）：toast 语义色，错误/警告与成功可区分
    this.el.toast.classList.toggle('toast-error', type === 'error');
    this.el.toast.classList.toggle('toast-warn', type === 'warn');
    this.el.toast.classList.add('show');
    clearTimeout(this._t);
    const ms = dur != null ? dur : (type === 'error' ? 4200 : 2200);
    this._t = setTimeout(() => this.el.toast.classList.remove('show'), ms);
  }
}
