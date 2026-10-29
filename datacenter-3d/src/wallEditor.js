// 墙面 2D 编辑器（SVG）：绘制墙体立面、门窗，支持点选 / 拖动移动 / 手柄缩放
// 坐标系：x=横向 0..length（左→右），y=竖向 0..height（地→顶）
import { OPENING_MIN_SIZE, WINDOW_MIN_SILL, EPS } from './wallLayout.js';

const SNAP = 0.05; // 拖动吸附步长（m）

// op.id 来自可导入的 plan JSON（外部数据），拼进 innerHTML/SVG 前必须转义
// （与 main.js:34 escHtml 同规则；此处本地实现避免跨模块依赖）
function escHtml(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(v) {
  return escHtml(v).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export class WallEditor {
  constructor(container, { onChange, onSelect } = {}) {
    this.container = container;
    this.onChange = onChange;
    this.onSelect = onSelect;
    this.locked = false; // 布局锁定后禁止拖拽编辑
    this.wall = null;
    this.selectedId = null;
    this.drag = null;
    this.scale = 1;
    this.ox = 0;   // 墙左端在 svg 中的像素 x
    this.oy = 0;   // 墙顶在 svg 中的像素 y

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'wall-svg');
    container.appendChild(this.svg);

    // 命名引用，便于 dispose 时精确解绑（避免闭包导致无法 remove）
    this._moveHandler = (e) => this._move(e);
    this._upHandler = () => this._up();
    this._resizeHandler = () => this.render();
    this.svg.addEventListener('pointerdown', (e) => this._down(e));
    window.addEventListener('pointermove', this._moveHandler);
    window.addEventListener('pointerup', this._upHandler);
    window.addEventListener('resize', this._resizeHandler);
  }

  // 卸载：解绑 window 监听并移除 SVG，防止反复挂载时监听器泄漏
  dispose() {
    window.removeEventListener('pointermove', this._moveHandler);
    window.removeEventListener('pointerup', this._upHandler);
    window.removeEventListener('resize', this._resizeHandler);
    if (this.svg && this.svg.parentNode) this.svg.parentNode.removeChild(this.svg);
  }

  setWall(wall) {
    this.wall = wall;
    this.selectedId = null;
    this.render();
  }

  // ---- 渲染 ----
  render() {
    const wall = this.wall;
    if (!wall) return;
    const cw = this.container.clientWidth || 460;
    const ch = this.container.clientHeight || 240;
    const M = { top: 16, right: 22, bottom: 30, left: 26 };
    const scale = Math.min(
      (cw - M.left - M.right) / wall.length,
      (ch - M.top - M.bottom) / wall.height,
    );
    this.scale = scale;
    const w = wall.length * scale;
    const h = wall.height * scale;
    this.ox = M.left + (cw - M.left - M.right - w) / 2;
    this.oy = M.top + (ch - M.top - M.bottom - h) / 2;
    this.svg.setAttribute('width', cw);
    this.svg.setAttribute('height', ch);

    let s = `<rect class="wall-rect" x="${this.ox}" y="${this.oy}" width="${w}" height="${h}"/>`;

    // 1m 参考网格
    for (let gx = 1; gx < wall.length; gx++) {
      const px = this.ox + gx * scale;
      s += `<line class="grid" x1="${px}" y1="${this.oy}" x2="${px}" y2="${this.oy + h}"/>`;
    }
    for (let gy = 1; gy < wall.height; gy++) {
      const py = this.oy + h - gy * scale;
      s += `<line class="grid" x1="${this.ox}" y1="${py}" x2="${this.ox + w}" y2="${py}"/>`;
    }

    // 门窗（注意 svg y 轴向下：顶边 = oy + h - (sill+height)*scale）
    for (const op of wall.openings) {
      const x = this.ox + op.offset * scale;
      const y = this.oy + h - (op.sill + op.height) * scale;
      const pw = op.width * scale;
      const ph = op.height * scale;
      const sel = op.id === this.selectedId;
      // op.type / op.id 均来自可导入的 plan JSON（外部数据）：
      // type 进 class 属性、id 进 data-* 属性与文本节点，三处都必须转义。
      // 数值字段（offset/sill/width/height）经 * scale 运算被强制转 Number，
      // 字符串注入会得到 NaN 而失效，故无需转义。
      let inner = `<rect class="op-body ${escAttr(op.type)}${sel ? ' sel' : ''}" data-id="${escAttr(op.id)}"
        x="${x}" y="${y}" width="${pw}" height="${ph}"/>`;
      inner += `<text class="op-label" x="${x + pw / 2}" y="${y + ph / 2 + 4}">${escHtml(op.id)}</text>`;
      if (sel) {
        inner += `<circle class="handle" data-id="${escAttr(op.id)}" data-handle="w" cx="${x + pw}" cy="${y + ph / 2}" r="5"/>`;
        inner += `<circle class="handle" data-id="${escAttr(op.id)}" data-handle="h" cx="${x + pw / 2}" cy="${y}" r="5"/>`;
      }
      s += `<g class="op">${inner}</g>`;
    }

    // 尺寸标注（wall.length/height 同样来自外部 plan JSON，文本节点也须转义）
    s += `<text class="dim" x="${this.ox + w / 2}" y="${this.oy + h + 20}">宽 ${escHtml(wall.length)} m</text>`;
    s += `<text class="dim" transform="rotate(-90 ${this.ox - 14} ${this.oy + h / 2})"
      x="${this.ox - 14}" y="${this.oy + h / 2}">高 ${escHtml(wall.height)} m</text>`;

    this.svg.innerHTML = s;
  }

  // ---- 交互 ----
  _down(e) {
    if (!this.wall || this.locked) return;
    const g = e.target.closest('g.op');
    if (!g) {
      if (this.selectedId) {
        this.selectedId = null;
        this.onSelect && this.onSelect();
        this.render();
      }
      return;
    }
    const op = this.wall.openings.find((o) => o.id === g.querySelector('[data-id]').dataset.id);
    if (!op) return;
    this.selectedId = op.id;
    this.onSelect && this.onSelect();
    this.drag = {
      op,
      mode: e.target.dataset.handle === 'w' ? 'w'
        : e.target.dataset.handle === 'h' ? 'h' : 'move',
      sx: e.clientX,
      sy: e.clientY,
      o: { ...op },
    };
    this.render();
    e.preventDefault();
  }

  _move(e) {
    const d = this.drag;
    if (!d || !this.wall) return;
    const dx = (e.clientX - d.sx) / this.scale;
    const dy = (d.sy - e.clientY) / this.scale; // 向上为正
    const L = this.wall.length;
    const H = this.wall.height;
    const snap = (v) => Math.round(v / SNAP) * SNAP;

    if (d.mode === 'move') {
      d.op.offset = snap(Math.max(0, Math.min(L - d.op.width, d.o.offset + dx)));
      if (d.op.type === 'window') {
        d.op.sill = snap(Math.max(WINDOW_MIN_SILL, Math.min(H - d.op.height, d.o.sill + dy)));
      }
    } else if (d.mode === 'w') {
      d.op.width = snap(Math.max(OPENING_MIN_SIZE, Math.min(L - d.op.offset - EPS, d.o.width + dx)));
    } else if (d.mode === 'h') {
      const maxH = d.op.type === 'door' ? H : H - d.op.sill;
      d.op.height = snap(Math.max(OPENING_MIN_SIZE, Math.min(maxH - EPS, d.o.height + dy)));
    }
    this.render();
    this.onChange && this.onChange();
  }

  _up() {
    if (!this.drag) return;
    this.drag = null;
    this.onChange && this.onChange();
  }
}
