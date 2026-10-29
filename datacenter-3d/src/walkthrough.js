import * as THREE from 'three';
import { RACK } from './config.js';

// 第一人称漫游 + 自动巡检路径
// 两者都绕过 OrbitControls（进入时禁用，退出时恢复），直接驱动相机。

/**
 * 第一人称漫游：指针锁定（pointer lock）+ WASD/方向键在机房地面行走。
 * 进入时对齐当前相机朝向，沿相机水平朝向移动，并把相机高度锁定在视点高度，
 * 同时把位置钳制在房间边界内（撞墙不穿模）。
 */
export class RoamControls {
  constructor(sceneMgr, getDims) {
    this.sm = sceneMgr;
    this.getDims = getDims; // () => { width, depth, height }
    this.active = false;
    this.keys = new Set();
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.eye = 1.65;      // 视点高度（m）：成年人眼高，约 1.6~1.8m
    this.speed = 5.0;     // 行走速度（m/s）
    this.playerRadius = 0.28; // 人体等效半径（m）：碰撞盒/墙体留白，避免穿模
    this.fovWalk = 72;    // 漫游视场角（°）：比总览 55° 更宽，增强近大远小的纵深感
    this.boxes = [];      // 机柜碰撞盒（轴对齐外接 AABB，已含 playerRadius 留白）
    this._origFov = null; // 进入漫游前的视场角，退出时恢复
    this._onKeyDown = (e) => this.keys.add(e.code);
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => this._mouse(e);
  }

  _canvas() { return this.sm.renderer.domElement; }

  enable() {
    if (this.active) return;
    this.active = true;
    this.keys.clear();
    // 以当前相机水平朝向作为初始漫游朝向，并拉平俯仰（消费总览的俯视姿态）
    this.euler.setFromQuaternion(this.sm.camera.quaternion);
    this.euler.x = 0;
    // 立即锁定到人体视点高度
    this.sm.camera.position.y = this.eye;
    // 切换到漫游视场角，增强沉浸与纵深感
    if (this._origFov === null) this._origFov = this.sm.camera.fov;
    this.sm.camera.fov = this.fovWalk;
    this.sm.camera.updateProjectionMatrix();
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    const c = this._canvas();
    this._lockClick = () => {
      if (this.active && document.pointerLockElement !== c) {
        const r = c.requestPointerLock && c.requestPointerLock();
        if (r && typeof r.catch === 'function') r.catch(() => {});
      }
    };
    c.addEventListener('click', this._lockClick);
  }

  disable() {
    if (!this.active) return;
    this.active = false;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    const c = this._canvas();
    if (this._lockClick) c.removeEventListener('click', this._lockClick);
    if (document.pointerLockElement === c && document.exitPointerLock) document.exitPointerLock();
    // 恢复总览视场角
    if (this._origFov !== null) {
      this.sm.camera.fov = this._origFov;
      this.sm.camera.updateProjectionMatrix();
      this._origFov = null;
    }
  }

  _mouse(e) {
    if (document.pointerLockElement !== this._canvas()) return;
    this.euler.y -= (e.movementX || 0) * 0.0022;
    this.euler.x -= (e.movementY || 0) * 0.0022;
    const lim = Math.PI / 2 - 0.05;
    this.euler.x = Math.max(-lim, Math.min(lim, this.euler.x));
  }

  /**
   * 由机柜分布构建碰撞盒（轴对齐外接 AABB）。
   * 机柜可能旋转，故取旋转后外接矩形，再外扩 playerRadius，
   * 使相机（近似为点）始终与机柜保持间隙，避免穿模。
   * @param {{racks:Array<{type:string,x:number,z:number,rotationY:number}>}} rackList
   */
  setObstacles(rackList) {
    const list = (rackList && rackList.racks) || [];
    const r = this.playerRadius;
    this.boxes = list.map((rk) => {
      const dim = RACK[rk.type] || RACK.server;
      const a = rk.rotationY || 0;
      const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
      const hx = (dim.w * c + dim.d * s) / 2 + r;
      const hz = (dim.w * s + dim.d * c) / 2 + r;
      return { minX: rk.x - hx, maxX: rk.x + hx, minZ: rk.z - hz, maxZ: rk.z + hz };
    });
  }

  // 点 (x,z) 是否落入任一机柜碰撞盒（已含 playerRadius 留白）
  _collides(x, z) {
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
    }
    return false;
  }

  update(dt) {
    if (!this.active) return;
    // 应用鼠标转向
    this.sm.camera.quaternion.setFromEuler(this.euler);
    // 水平前向 / 右向
    const dir = new THREE.Vector3();
    this.sm.camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) return;
    dir.normalize();
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const move = new THREE.Vector3();
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) move.add(dir);
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) move.sub(dir);
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) move.add(right);
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) move.sub(right);
    const p = this.sm.camera.position;
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(this.speed * dt);
      // 分轴推进 + 逐轴碰撞回退：撞到机柜时沿其侧面滑动，而非卡死或穿透
      if (!this._collides(p.x + move.x, p.z)) p.x += move.x;
      if (!this._collides(p.x, p.z + move.z)) p.z += move.z;
    }
    // 始终：锁定人体视点高度 + 机房物理边界（即使静止也把相机约束在机房内，贴墙不穿墙）
    const d = this.getDims() || { width: 40, depth: 30 };
    const hw = d.width / 2 - this.playerRadius;
    const hd = d.depth / 2 - this.playerRadius;
    p.x = Math.max(-hw, Math.min(hw, p.x));
    p.z = Math.max(-hd, Math.min(hd, p.z));
    p.y = this.eye;
  }
}

/**
 * 自动巡检：沿机房过道环绕一圈的航点路径，相机沿路径匀速前进并始终朝向前方，
 * 形成「无人值守自动巡检」效果。路径由机柜分布的外包络推导，无需手工标定。
 */
export class PatrolController {
  constructor(sceneMgr) {
    this.sm = sceneMgr;
    this.pts = [];
    this.i = 0;
    this.t = 0;
    this.active = false;
    this.speed = 7.0; // 沿路径前进速度（m/s）
    this.height = 2.2;
  }

  // 由机柜分布推导巡检航点：机柜外包络外扩 3m，取四角顺时针环绕
  buildPath(racks) {
    const list = (racks && racks.racks) || [];
    if (!list.length) return false;
    const xs = list.map((r) => r.x);
    const zs = list.map((r) => r.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const y = this.height;
    this.pts = [
      [minX - 3, y, minZ - 3],
      [maxX + 3, y, minZ - 3],
      [maxX + 3, y, maxZ + 3],
      [minX - 3, y, maxZ + 3],
    ].map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    this.i = 0;
    this.t = 0;
    return true;
  }

  start() {
    if (this.pts.length < 2) return false;
    this.active = true;
    this.i = 0;
    this.t = 0;
    this.sm.camera.position.copy(this.pts[0]);
    return true;
  }

  stop() { this.active = false; }

  update(dt) {
    if (!this.active || this.pts.length < 2) return;
    const a = this.pts[this.i];
    const b = this.pts[(this.i + 1) % this.pts.length];
    const segLen = Math.max(0.001, a.distanceTo(b));
    this.t += (this.speed * dt) / segLen;
    if (this.t >= 1) {
      this.t -= 1;
      this.i = (this.i + 1) % this.pts.length;
    }
    const pos = a.clone().lerp(b, this.t);
    pos.y = this.height;
    this.sm.camera.position.copy(pos);
    const look = b.clone();
    look.y = this.height;
    this.sm.camera.lookAt(look);
  }
}
