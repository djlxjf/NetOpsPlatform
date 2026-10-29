// ===========================================================================
// 桥架手绘布线面板（bridgeDrawPanel.js）
//
// 与 bridgeSystem.js 的「自定义路径（手绘布线）」API 联动，仅负责 UI：
//   · 敷设方式切换（吊顶内 / 地板下 / 沿墙）—— 仅决定节点落点（地面投影 / 贴墙），
//     安装高度与桥架规格沿用该类桥架在「桥架铺设参数」中的设置；
//   · 已绘节点列表、撤销上一点、完成当前路径、取消草稿；
//   · 已保存路径列表、单条删除、清空全部。
// 所有几何生成与 localStorage 持久化都交给 BridgeSystem（app._fx.bridge），
// 本面板不持有任何场景对象。手绘模式的进入 / 退出、实时折线预览、键盘快捷键
// 由 main.js 的 app.startBridgeDraw / app.stopBridgeDraw / app._finishBridgeDrawPath
// 等统管（绘制时禁用相机旋转，避免点击被误判为拖拽视角）。
// ===========================================================================
import { PATH_MOUNTS } from './bridgeConfig.js';

const MOUNT_LABEL = { over: '吊顶内', under: '地板下', wall: '沿墙' };
const WALL_LABEL = { back: '后墙', front: '前墙', left: '左墙', right: '右墙' };

export class BridgeDrawPanel {
  constructor(app, domRoot) {
    this.app = app;
    this.root = domRoot;
    this.el = domRoot.querySelector('#bridge-draw');
    if (!this.el) return;
    this.kind = null;
    this._collapsedKey = 'dc3d.bridgeDrawCollapsed';
    this._bind();
    const collapsed = safeLsGet(this._collapsedKey) === '1';
    this.el.classList.toggle('collapsed', collapsed);
    this._syncCollapseBtn();
  }

  _bind() {
    const $ = (sel) => this.el.querySelector(sel);
    this.els = {
      kindTag: $('#bd-kind-tag'),
      mount: $('#bd-mount'),
      nodeCount: $('#bd-node-count'),
      nodeList: $('#bd-node-list'),
      savedCount: $('#bd-saved-count'),
      savedList: $('#bd-saved-list'),
      undo: $('#bd-undo'),
      finish: $('#bd-finish'),
      cancel: $('#bd-cancel'),
      clear: $('#bd-clear'),
      collapse: $('#bd-collapse'),
      close: $('#bd-close'),
    };
    // 敷设方式切换：同步草稿 mount + 重绘预览
    this.els.mount.querySelectorAll('[data-mount]').forEach((b) => {
      b.addEventListener('click', () => {
        const m = b.dataset.mount;
        if (this.kind && this.app.bridgeDraw && PATH_MOUNTS.indexOf(m) >= 0) {
          this.app.bridgeDraw.mount = m;
          this.app._fx.bridge.setDraftMount(this.kind, m);
        }
        this._syncMount(m);
        if (this.app._renderBridgeDrawPreview) this.app._renderBridgeDrawPreview();
      });
    });
    this.els.undo.addEventListener('click', () => {
      if (!this.kind) return;
      const left = this.app._fx.bridge.undoPathPoint(this.kind);
      if (this.app._renderBridgeDrawPreview) this.app._renderBridgeDrawPreview();
      this.render();
      if (!left) this.app.ui.toast('已撤销全部节点', 'info');
    });
    this.els.finish.addEventListener('click', () => {
      if (this.app._finishBridgeDrawPath) this.app._finishBridgeDrawPath();
    });
    this.els.cancel.addEventListener('click', () => {
      if (!this.kind) return;
      this.app._fx.bridge.cancelPath(this.kind);
      if (this.app._renderBridgeDrawPreview) this.app._renderBridgeDrawPreview();
      this.render();
    });
    this.els.clear.addEventListener('click', () => {
      if (!this.kind) return;
      this.app._fx.bridge.clearPaths(this.kind);
      this.render();
    });
    this.els.collapse.addEventListener('click', () => {
      const c = !this.el.classList.contains('collapsed');
      this.el.classList.toggle('collapsed', c);
      safeLsSet(this._collapsedKey, c ? '1' : '0');
      this._syncCollapseBtn();
    });
    this.els.close.addEventListener('click', () => {
      if (this.app.stopBridgeDraw) this.app.stopBridgeDraw();
    });
  }

  _syncCollapseBtn() {
    const c = this.el.classList.contains('collapsed');
    this.els.collapse.textContent = c ? '展开 ▸' : '收起 ▾';
    this.els.collapse.setAttribute('aria-expanded', String(!c));
  }

  _syncMount(m) {
    this.els.mount.querySelectorAll('[data-mount]').forEach((b) => b.classList.toggle('active', b.dataset.mount === m));
  }

  isOpen() { return !!this.el && !this.el.classList.contains('hidden'); }
  closeNow() { if (this.el) this.el.classList.add('hidden'); }

  /**
   * 销毁：关闭面板并释放引用（同 floorPanel/bridgePanel.dispose 约定）。
   * 本面板监听全部绑在自身 #bridge-draw 子树内，宿主销毁时随 DOM 回收；
   * 显式关闭是为了避免手绘态（app.bridgeDraw）在宿主销毁后仍被回调改写。
   */
  dispose() {
    try { this.closeNow(); } catch (_) { /* 销毁阶段不因关闭失败而中断 */ }
    this.els = null;
    this.app = null;
    this.root = null;
    this.el = null;
    this.kind = null;
  }

  openFor(kind) {
    if (!this.el) return;
    this.kind = kind;
    this.el.classList.remove('hidden');
    if (this.app.bridgeDraw) this._syncMount(this.app.bridgeDraw.mount || 'over');
    this.render();
  }

  render() {
    if (!this.el || !this.kind) return;
    const kind = this.kind;
    const label = kind === 'weak' ? '弱电' : '强电';
    if (this.els.kindTag) this.els.kindTag.textContent = label;
    const draft = this.app._fx.bridge.getDraft(kind);
    const pts = draft ? draft.points : [];
    if (this.els.nodeCount) this.els.nodeCount.textContent = String(pts.length);
    if (this.els.nodeList) {
      this.els.nodeList.innerHTML = '';
      pts.forEach((p, i) => {
        const li = document.createElement('li');
        const w = p.wallKey ? ` · ${WALL_LABEL[p.wallKey] || p.wallKey}` : '';
        li.textContent = `#${i + 1}  (${p.x.toFixed(2)}, ${p.z.toFixed(2)})${w}`;
        this.els.nodeList.appendChild(li);
      });
    }
    if (this.els.finish) this.els.finish.disabled = pts.length < 2;
    const paths = this.app._fx.bridge.getPaths(kind);
    if (this.els.savedCount) this.els.savedCount.textContent = String(paths.length);
    if (this.els.savedList) {
      this.els.savedList.innerHTML = '';
      paths.forEach((p) => {
        const li = document.createElement('li');
        li.className = 'bd-saved-item';
        const tag = document.createElement('span');
        tag.textContent = `${MOUNT_LABEL[p.mount] || p.mount} · ${p.points.length} 节点`;
        const del = document.createElement('button');
        del.className = 'bd-del';
        del.textContent = '删除';
        del.addEventListener('click', () => {
          this.app._fx.bridge.removePath(kind, p.id);
          this.render();
        });
        li.appendChild(tag);
        li.appendChild(del);
        this.els.savedList.appendChild(li);
      });
    }
  }
}

function safeLsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
function safeLsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* 无存储环境忽略 */ } }
