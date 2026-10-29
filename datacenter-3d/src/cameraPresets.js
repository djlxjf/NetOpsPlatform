import * as THREE from 'three';
import { RACK, roomDims } from './config.js';

// 相机导演：预设机位（随房间尺寸自适应）+ 平滑过渡 + 聚焦单柜
export class CameraDirector {
  constructor(sceneMgr) {
    this.sm = sceneMgr;
    this.tween = null;
  }

  _tweenTo(pos, target, dur = 1.0, onDone = null) {
    this.tween = {
      fromPos: this.sm.camera.position.clone(),
      toPos: new THREE.Vector3(...pos),
      fromTar: this.sm.controls.target.clone(),
      toTar: new THREE.Vector3(...target),
      t: 0, dur, onDone,
    };
  }

  panorama() {
    this.home(1.0);
  }

  // 默认视角（总览机位，随房间尺寸自适应取景）。
  // dur<=0：立即定位（用于初始加载，无过渡动画）；dur>0：平滑补间（用于双击空格 /「全景」按钮回位）。
  // 整改（P2 手感）：补间默认 1.0s → 0.6s。主流工具的视角切换多在 300-600ms，
  // 1s 在「回到默认视角」这种高频回位操作上偏拖沓；0.6s 仍保留足够的空间感。
  home(dur = 0.6) {
    const p = overviewPose(this.sm.camera.aspect);
    if (dur <= 0) {
      this.tween = null;
      this.sm.camera.position.set(...p.pos);
      this.sm.controls.target.set(...p.target);
    } else {
      this._tweenTo(p.pos, p.target, dur);
    }
  }

  top() {
    const d = roomDims;
    this._tweenTo([0.01, Math.max(d.width, d.depth) + 24, 0.01], [0, 0, 0]);
  }

  // 等距视角：固定 3/4 俯视方向，立体感强，适合产品展示 / 截图留档
  iso() {
    const d = roomDims;
    const dist = Math.max(d.width, d.depth) * 0.95 + 16;
    const dir = new THREE.Vector3(0.92, 0.82, 0.92).normalize();
    this._tweenTo([dir.x * dist, dir.y * dist, dir.z * dist], [0, 1.5, 0], 0.6);
  }

  // 正视视角：沿机房正门(+Z)方向平视，适合查看单排机柜正面布局
  front() {
    const d = roomDims;
    const dist = d.depth / 2 + 14;
    this._tweenTo([0, 6, dist], [0, 3, 0], 0.6);
  }

  // 聚焦单柜：0.8s → 0.6s，与 home() 统一节奏（整改 P2 手感）
  focusRack(rack) {
    const def = RACK[rack.type];
    this._tweenTo([rack.x + 4, def.h + 2.5, rack.z + 6.5], [rack.x, def.h / 2, rack.z], 0.6);
  }

  update(dt) {
    if (!this.tween) return;
    const tw = this.tween;
    tw.t += dt / tw.dur;
    const k = tw.t >= 1 ? 1 : easeInOut(tw.t);
    this.sm.camera.position.lerpVectors(tw.fromPos, tw.toPos, k);
    this.sm.controls.target.lerpVectors(tw.fromTar, tw.toTar, k);
    if (tw.t >= 1) {
      const done = tw.onDone;
      this.tween = null;
      if (typeof done === 'function') done();
    }
  }
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// 总览机位：按房间包围球 + 视口纵横比自适应取景，机房在画面中基本占满（留 ~15% 边距）。
// 旧实现用固定经验机位 (30,24,36)，对 26×22m 房间距离偏远，机房在画面中偏小，
// 下方留出大片空背景；空区又因清屏色近纯黑，观感即「底部黑条」。
export function overviewPose(aspect = 1.6) {
  const d = roomDims;
  const radius = 0.5 * Math.hypot(d.width, d.depth, d.height); // 房间包围球半径
  const vTan = Math.tan((55 * Math.PI) / 360);                 // 视场半角（与 scene.js 的 fov=55 一致）
  const distV = radius / vTan;                                 // 竖直方向恰好放下的距离
  const distH = radius / (vTan * Math.max(aspect, 0.5));       // 横向受限时的距离
  const dist = Math.max(distV, distH) * 1.15;
  const dir = new THREE.Vector3(30, 24, 36).normalize();       // 沿用旧机位的视角方向
  return { pos: [dir.x * dist, dir.y * dist, dir.z * dist], target: [0, 2, 0] };
}
