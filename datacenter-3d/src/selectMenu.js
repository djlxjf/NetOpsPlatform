/**
 * 自绘下拉弹窗（selectMenu）
 * -----------------------------------------------------------------------------
 * 为什么不用原生 select 弹窗：
 *   本工具跑在 Vue 宿主的 Shadow DOM 内。Chromium 的原生 select 弹窗渲染在文档顶层，
 *   配色只跟随「文档级」color-scheme——宿主页面是 color-scheme:light dark（本机解析为
 *   浅色），Shadow 树内 :host{color-scheme:dark} 与 option 显式底色都传不进去
 *   （2026-10-24 对照实验证实：浅色 DOM 内生效、Shadow DOM 内全部失效）。
 *   表现为「下拉选中区域一片白」，与深色玻璃界面割裂，且无 CSS 解法。
 *
 * 方案（渐进增强，既有逻辑零改动）：
 *   原生 <select> 保留为「隐藏状态载体」（加 .dcx-native，视觉隐藏但 value/option/
 *   change 全部照旧）；在其外包裹自定义 trigger 按钮 + 自绘 listbox 弹窗：
 *     - 弹窗是本工具影子树内的普通 div，配色走 --dc-* 令牌，与整体 UI 完全一致；
 *     - 键盘可达：Enter/Space/↑/↓/Home/End/Esc/首字母跳转，焦点始终留在 trigger；
 *     - 选中后回写原生 select 并派发 input+change（bubbles+composed）——
 *       eng-panel 的 change 监听、wp-props 的 input 事件委托原样工作；
 *     - 已处理的按键在 trigger 上 stopPropagation，不会泄漏给 window 级 3D 快捷键；
 *       未处理的键由 main.js 的 isTyping 补判 .dcx-trigger 一并保护。
 *
 * 用法：
 *   enhanceSelects(root)   —— 增强 root 内所有未增强的 select（动态 innerHTML
 *                              重建后需再次调用，如 showOpeningProps）
 *   disposeSelectMenus()   —— 工具销毁时清理模块级监听
 */

const ENHANCED = new WeakSet(); // 已增强的 native select（幂等，防重复包裹）
let openInst = null;            // 当前展开的实例（同时只允许一个）
let pop = null;                 // 单例弹窗元素（挂在本工具影子树根下）
let uidSeq = 0;

/* ------------------------------ 弹窗单例 ------------------------------ */

function layerOf(el) {
  // 弹窗挂载层：影子树内挂 shadowRoot（不被 .eng-scroll 等 overflow 容器裁剪），
  // 独立运行（无 shadow）挂 document.body
  const rn = el.getRootNode();
  if (rn && rn.host) return rn;
  return rn === document ? document.body : (rn || document.body);
}

function ensurePop(layer) {
  if (!pop) {
    pop = document.createElement('div');
    pop.className = 'dcx-pop';
    pop.id = 'dcx-pop';
    pop.setAttribute('role', 'listbox');
    pop.hidden = true;
    // 点击选项 → 提交当前展开实例
    pop.addEventListener('click', (e) => {
      if (!openInst) return;
      const row = e.target.closest('.dcx-opt');
      if (!row) return;
      const idx = openInst.options.findIndex((o) => o.row === row);
      const o = openInst.options[idx];
      if (o && !o.disabled) commit(openInst, o.value);
    });
    // 悬停同步键盘活跃项（不滚动）
    pop.addEventListener('pointermove', (e) => {
      if (!openInst) return;
      const row = e.target.closest('.dcx-opt');
      if (!row) return;
      const idx = openInst.options.findIndex((o) => o.row === row);
      if (idx >= 0 && !openInst.options[idx].disabled && idx !== openInst.activeIdx) {
        setActive(openInst, idx, false);
      }
    });
  }
  if (pop.parentNode !== layer) layer.appendChild(pop);
  return pop;
}

/* ------------------------------ 状态同步 ------------------------------ */

function optionsOf(sel) {
  return Array.prototype.slice.call(sel.options);
}

function selectedOption(sel) {
  return sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
}

/** 同步 trigger 显示（选中文本 / 占位符弱化 / 选中行标记 / 截断时 title 全值） */
function syncTrigger(inst) {
  const opt = selectedOption(inst.sel);
  const text = opt ? opt.textContent : '';
  inst.val.textContent = text;
  inst.val.classList.toggle('is-empty', inst.sel.value === '');
  inst.trig.title = text;
  inst.options.forEach((o, i) => {
    const on = !!opt && i === inst.sel.selectedIndex;
    o.row.classList.toggle('is-selected', on);
    o.row.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}

/** 构建弹窗选项行（textContent 写入，防注入） */
function buildOptions(inst) {
  const p = ensurePop(layerOf(inst.sel));
  p.textContent = '';
  inst.options = optionsOf(inst.sel).map((o) => {
    const row = document.createElement('div');
    row.className = 'dcx-opt';
    row.id = `dcx-opt-${++uidSeq}`;
    row.setAttribute('role', 'option');
    const t = document.createElement('span');
    t.className = 'dcx-opt-t';
    t.textContent = o.textContent;
    const m = document.createElement('span');
    m.className = 'dcx-opt-mark';
    m.textContent = '✓';
    row.append(t, m);
    if (o.disabled) row.classList.add('is-disabled');
    p.appendChild(row);
    return { value: o.value, disabled: o.disabled, row };
  });
  syncTrigger(inst);
  return p;
}

function firstEnabled(inst) {
  return inst.options.findIndex((o) => !o.disabled);
}
function lastEnabled(inst) {
  for (let i = inst.options.length - 1; i >= 0; i--) if (!inst.options[i].disabled) return i;
  return -1;
}

/** 设置键盘活跃项（is-active + aria-activedescendant + 滚动入可视区） */
function setActive(inst, idx, scroll = true) {
  inst.activeIdx = idx;
  inst.options.forEach((o, i) => o.row.classList.toggle('is-active', i === idx));
  const row = inst.options[idx] ? inst.options[idx].row : null;
  if (row) {
    inst.trig.setAttribute('aria-activedescendant', row.id);
    if (scroll && pop) {
      // 手工算滚动量：scrollIntoView 会连带滚动 .eng-scroll 等祖先容器
      const pr = pop.getBoundingClientRect();
      const rr = row.getBoundingClientRect();
      if (rr.top < pr.top) pop.scrollTop -= pr.top - rr.top;
      else if (rr.bottom > pr.bottom) pop.scrollTop += rr.bottom - pr.bottom;
    }
  } else {
    inst.trig.removeAttribute('aria-activedescendant');
  }
}

function moveActive(inst, dir) {
  const n = inst.options.length;
  if (!n) return;
  let i = inst.activeIdx;
  for (let step = 0; step < n; step++) {
    i = (i + dir + n) % n;
    if (!inst.options[i].disabled) { setActive(inst, i); return; }
  }
}

/** 首字母跳转（500ms 缓冲） */
function typeAhead(inst, ch) {
  clearTimeout(inst.typeTimer);
  inst.typeBuf += ch.toLowerCase();
  inst.typeTimer = setTimeout(() => { inst.typeBuf = ''; }, 500);
  const hit = inst.options.findIndex((o) =>
    !o.disabled && o.row.textContent.trim().toLowerCase().startsWith(inst.typeBuf));
  if (hit >= 0) setActive(inst, hit);
}

/** 定位：贴 trigger 下方，空间不足翻上方，水平方向防溢出视口 */
function place(inst) {
  if (!pop) return;
  const tr = inst.trig.getBoundingClientRect();
  const op = pop.offsetParent;
  const oRect = (op && op.getBoundingClientRect) ? op.getBoundingClientRect()
    : (pop.parentNode && pop.parentNode.host ? pop.parentNode.host.getBoundingClientRect() : { left: 0, top: 0 });
  pop.style.minWidth = `${Math.round(tr.width)}px`;
  pop.style.maxHeight = '';
  const ph = pop.offsetHeight;
  const vh = window.innerHeight;
  const below = vh - tr.bottom - 12;
  const above = tr.top - 12;
  let top;
  let maxH;
  if (ph <= below || below >= above) {
    top = tr.bottom - oRect.top + 4;
    maxH = below;
  } else {
    top = tr.top - oRect.top - 4 - Math.min(ph, above);
    maxH = above;
  }
  let left = tr.left - oRect.left;
  const maxLeft = window.innerWidth - pop.offsetWidth - 8 - oRect.left;
  if (left > maxLeft) left = Math.max(8 - oRect.left, maxLeft);
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
  pop.style.maxHeight = `${Math.max(80, Math.round(maxH))}px`;
}

/* ------------------------------ 开合与提交 ------------------------------ */

function onDocPointerDown(e) {
  if (!openInst) return;
  const path = e.composedPath ? e.composedPath() : [e.target];
  if (path.indexOf(openInst.trig) >= 0 || path.indexOf(pop) >= 0) return;
  closeMenu(openInst);
}
function onViewportChange() {
  if (openInst) place(openInst);
}

function openMenu(inst, mode) {
  if (openInst && openInst !== inst) closeMenu(openInst);
  buildOptions(inst);
  pop.style.visibility = 'hidden';
  pop.hidden = false;
  place(inst);
  pop.style.visibility = '';
  inst.trig.setAttribute('aria-expanded', 'true');
  openInst = inst;
  // 活跃项：默认落当前选中；'last' 用于 ↑ 打开（与原生一致：↑ 打开定位末项）
  const sel = inst.sel.selectedIndex;
  if (mode === 'last') setActive(inst, lastEnabled(inst));
  else if (sel >= 0 && !inst.options[sel].disabled) setActive(inst, sel);
  else setActive(inst, firstEnabled(inst));
  document.addEventListener('pointerdown', onDocPointerDown, true);
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('scroll', onViewportChange, true);
}

function closeMenu(inst) {
  if (!inst) return;
  inst.trig.setAttribute('aria-expanded', 'false');
  inst.trig.removeAttribute('aria-activedescendant');
  clearTimeout(inst.typeTimer);
  inst.typeBuf = '';
  inst.activeIdx = -1;
  if (pop) pop.hidden = true;
  if (openInst === inst) {
    openInst = null;
    document.removeEventListener('pointerdown', onDocPointerDown, true);
    window.removeEventListener('resize', onViewportChange);
    window.removeEventListener('scroll', onViewportChange, true);
  }
}

/** 选中某一项：回写原生 select + 派发 input/change（既有监听原样工作） */
function commit(inst, value) {
  const sel = inst.sel;
  const changed = sel.value !== value;
  closeMenu(inst);
  if (!changed) return; // 与原生语义一致：选同一项不触发 change
  sel.value = value;
  syncTrigger(inst);
  sel.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  sel.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}

/* ------------------------------ 增强 ------------------------------ */

function upgrade(sel) {
  const doc = sel.ownerDocument;
  const wrap = doc.createElement('span');
  wrap.className = 'dcx';
  sel.parentNode.insertBefore(wrap, sel);

  // trigger 放在原生 select 之前：label 的无 for 关联指向第一个可标注元素，
  // 点标签文字即等于点 trigger（打开弹窗）
  const trig = doc.createElement('button');
  trig.type = 'button';
  trig.className = 'dcx-trigger';
  trig.setAttribute('role', 'combobox');
  trig.setAttribute('aria-haspopup', 'listbox');
  trig.setAttribute('aria-expanded', 'false');
  const val = doc.createElement('span');
  val.className = 'dcx-value';
  trig.appendChild(val);
  wrap.appendChild(trig);

  // 原生 select 退居隐藏状态载体（value/option/change 逻辑全部照旧）
  sel.classList.add('dcx-native');
  sel.tabIndex = -1;
  sel.setAttribute('aria-hidden', 'true');
  wrap.appendChild(sel);

  const inst = {
    sel, wrap, trig, val,
    options: [], activeIdx: -1, typeBuf: '', typeTimer: 0,
  };
  sel.__dcx = inst;
  if (sel.disabled) trig.disabled = true;

  trig.addEventListener('click', () => {
    if (openInst === inst) closeMenu(inst);
    else openMenu(inst, 'selected');
  });

  trig.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'Tab') { if (openInst === inst) closeMenu(inst); return; }
    if (k === 'Escape') {
      if (openInst === inst) { e.preventDefault(); e.stopPropagation(); closeMenu(inst); }
      return;
    }
    if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
      e.preventDefault();
      e.stopPropagation(); // 不泄漏给 window 级快捷键（空格平移等）
      if (openInst === inst) {
        const o = inst.options[inst.activeIdx];
        if (o && !o.disabled) commit(inst, o.value);
      } else {
        openMenu(inst, 'selected');
      }
      return;
    }
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      if (openInst !== inst) openMenu(inst, k === 'ArrowDown' ? 'selected' : 'last');
      else moveActive(inst, k === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (openInst === inst && (k === 'Home' || k === 'End')) {
      e.preventDefault();
      e.stopPropagation();
      setActive(inst, k === 'Home' ? firstEnabled(inst) : lastEnabled(inst));
      return;
    }
    if (k.length === 1 && /\S/.test(k) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      if (openInst !== inst) openMenu(inst, 'selected');
      typeAhead(inst, k);
    }
  });

  syncTrigger(inst);
}

/**
 * 增强 root 内所有未增强的 <select>。
 * 动态 innerHTML 重建（如 showOpeningProps）后需再次调用。
 */
export function enhanceSelects(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  root.querySelectorAll('select').forEach((sel) => {
    if (ENHANCED.has(sel)) return;
    ENHANCED.add(sel);
    upgrade(sel);
  });
}

/** 工具销毁：关闭弹窗并清理模块级监听 */
export function disposeSelectMenus() {
  if (openInst) closeMenu(openInst);
  document.removeEventListener('pointerdown', onDocPointerDown, true);
  window.removeEventListener('resize', onViewportChange);
  window.removeEventListener('scroll', onViewportChange, true);
  if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
  pop = null;
}
