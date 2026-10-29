/**
 * 应用内确认弹窗（取代原生 window.confirm）
 * -----------------------------------------------------------------------------
 * 为什么不用原生 confirm：
 *   1. 原生弹窗样式由操作系统决定，与机房规划 / 数智机房 的设计语言完全割裂；
 *   2. 原生弹窗会阻塞主线程（WebGL 渲染循环停摆），在 Electron 里还会弹出独立窗口；
 *   3. 无法做「危险操作默认焦点落在取消」这类防误触设计。
 *
 * 设计约束：
 *   - 挂载到工具的 domRoot（Vue 集成时是 shadowRoot，独立运行时是普通容器），
 *     这样 datacenter-3d/src/style.css 的样式对它生效；
 *   - 颜色 / 圆角 / 间距全部取 --dc-* 设计令牌，与两页视觉一致；
 *   - 键盘可达：Enter 确认、Esc 取消、Tab 在两按钮间循环（焦点陷阱）；
 *   - 破坏性操作默认焦点在「取消」，降低误触风险；
 *   - 无可用 DOM 根时降级为原生 confirm，保证流程不中断。
 *
 * @param {Element|ShadowRoot} root 挂载容器（domRoot）
 * @param {Object|string} opts { title, message, detail, confirmText, cancelText }
 * @returns {Promise<boolean>} 用户是否确认
 */
export function confirmDialog(root, opts) {
  const o = typeof opts === 'string' ? { message: opts } : (opts || {});
  const title = o.title || '请确认操作';
  const message = o.message || '';
  const detail = o.detail || '';
  const confirmText = o.confirmText || '确定';
  const cancelText = o.cancelText || '取消';
  const danger = o.danger !== false;

  const fallbackText = [message, detail].filter(Boolean).join('\n');
  const canMount = root && typeof root.appendChild === 'function' && typeof document !== 'undefined';
  if (!canMount) {
    // 降级：引擎未挂载 / 非浏览器环境，保底仍给一次确认机会
    return Promise.resolve(typeof window !== 'undefined' && typeof window.confirm === 'function'
      ? window.confirm(fallbackText)
      : true);
  }

  return new Promise((resolve) => {
    let settled = false;
    // Shadow DOM 下 document.activeElement 会被 retarget 成宿主元素，
    // 取不到弹窗内的真实焦点；须取节点所属树根（shadowRoot / document）的 activeElement。
    // 焦点查询：mask 所属树根（shadowRoot / document）的 activeElement 才是真值
    const activeEl = () => {
      const rn = (mask.getRootNode && mask.getRootNode()) || null;
      const src = (rn && rn.activeElement !== undefined) ? rn : document;
      return src.activeElement || null;
    };
    const mask = document.createElement('div');
    mask.className = 'dc-modal-mask';

    const prevFocus = activeEl();

    const dialog = document.createElement('div');
    dialog.className = 'dc-modal' + (danger ? ' is-danger' : '');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const titleEl = document.createElement('h3');
    titleEl.className = 'dc-modal-title';
    titleEl.id = 'dc-modal-title';
    titleEl.textContent = title;
    dialog.setAttribute('aria-labelledby', titleEl.id);

    const msgEl = document.createElement('p');
    msgEl.className = 'dc-modal-msg';
    msgEl.textContent = message;

    dialog.appendChild(titleEl);
    dialog.appendChild(msgEl);

    if (detail) {
      const detailEl = document.createElement('p');
      detailEl.className = 'dc-modal-detail';
      // 多行补充说明（如"这些机柜内的设备清单将一并删除"）
      detailEl.textContent = detail;
      dialog.appendChild(detailEl);
    }

    const actions = document.createElement('div');
    actions.className = 'dc-modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'dc-modal-btn';
    cancelBtn.textContent = cancelText;

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'dc-modal-btn is-primary';
    okBtn.textContent = confirmText;

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    dialog.appendChild(actions);
    mask.appendChild(dialog);
    root.appendChild(mask);

    function finish(result) {
      if (settled) return;
      settled = true;
      mask.removeEventListener('keydown', onKeyDown);
      if (mask.parentNode) mask.parentNode.removeChild(mask);
      // 焦点归还：避免弹窗关闭后焦点丢失到 body
      try {
        if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus();
      } catch (e) { /* 原焦点元素可能已销毁，忽略 */ }
      resolve(result);
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(false);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        finish(activeEl() === okBtn);
        return;
      }
      // 焦点陷阱：Tab 只在本弹窗的两个按钮间循环
      if (e.key === 'Tab') {
        const order = [cancelBtn, okBtn];
        const idx = order.indexOf(activeEl());
        e.preventDefault();
        const next = e.shiftKey
          ? order[(idx - 1 + order.length) % order.length]
          : order[(idx + 1) % order.length];
        if (next) next.focus();
      }
    }

    cancelBtn.addEventListener('click', () => finish(false));
    okBtn.addEventListener('click', () => finish(true));
    mask.addEventListener('click', (e) => { if (e.target === mask) finish(false); });
    mask.addEventListener('keydown', onKeyDown);

    // 破坏性操作：默认焦点给「取消」，Enter 不会误触确认
    (danger ? cancelBtn : okBtn).focus();
  });
}

export default confirmDialog;
