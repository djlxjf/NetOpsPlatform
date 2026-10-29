import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCabinetDetailModel, buildCabinetShowcaseModel } from './rackModel.js';

// 机柜 3D 详情视图：独立场景渲染单台机柜（完整柜内设备），支持
// 正面/背面/内部/俯视机位、前后门点击开合、轨道旋转缩放
export class RackDetailView {
  constructor(sm) {
    this.sm = sm;
    this.active = false;
    this.rack = null;
    this.tween = null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111b28);
    // 环境反射贴图（IBL）：对齐 cockpit-rack-3d-model.html 的做法。
    // 这是机柜金属边框 / 玻璃门 / 挂耳产生真实质感的关键——
    // 没有它，PBR 材质只会被平行光照亮，看起来是「平的塑料感」。
    this._envTex = new THREE.PMREMGenerator(sm.renderer)
      .fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this._envTex;
    // 对齐源文件照明方案（r155+ 物理光照单位）
    this.scene.add(new THREE.AmbientLight(0xb8c8da, 0.85));
    this.scene.add(new THREE.HemisphereLight(0xbfd4e8, 0x1a2230, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2.2, 3.4, 2.6);
    // 阴影：源文件 castShadow + PCFSoftShadowMap，让机柜有落地感
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 20;
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -2;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x88bbff, 1.0);
    fill.position.set(-2.4, 1.8, -1.8);
    this.scene.add(fill);
    // 轮廓光：青色冷光勾勒机柜边缘（源文件的 rim 灯）。
    // 源文件在 100× 尺度下强度 2600，本项目 1 单位=1m，故按 1/100² = 1e-4 换算为 0.26。
    const rim = new THREE.PointLight(0x22d3ee, 0.26, 6);
    rim.position.set(0, 1.6, -1.7);
    this.scene.add(rim);
    // 柜内点光源：源文件明确注释「真实机柜内有照明，保证透过玻璃可见」。
    // 同样按 1e-4 换算：1500→0.15、1200→0.12、900→0.09。
    const innerTop = new THREE.PointLight(0xdfeaff, 0.15, 2.6);
    innerTop.position.set(0, 1.45, 0.35);
    this.scene.add(innerTop);
    const innerMid = new THREE.PointLight(0xdfeaff, 0.12, 2.6);
    innerMid.position.set(0, 0.65, 0.35);
    this.scene.add(innerMid);
    const backGlow = new THREE.PointLight(0x66d9ff, 0.09, 2.2);
    backGlow.position.set(0, 1.05, -0.3);
    this.scene.add(backGlow);
    this._innerLights = [innerTop, innerMid, backGlow];

    // 展示台：实体地面（承接阴影）+ 网格线（空间参照）
    // 源文件用实体地面 floor + GridHelper，缺了实体地面则机柜悬空、阴影无处可投
    const stageFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x0c1422, roughness: 0.95, metalness: 0.1 }),
    );
    stageFloor.rotation.x = -Math.PI / 2;
    stageFloor.receiveShadow = true;
    this.scene.add(stageFloor);
    const grid = new THREE.GridHelper(40, 20, 0x2bd6ff, 0x123047);
    grid.position.y = 0.002;
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    this.scene.add(grid);

    const model = buildCabinetDetailModel();
    this.root = model.root;
    this.frontPivot = model.frontPivot;
    this.rearPivot = model.rearPivot;
    this.scene.add(this.root);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 60);
    this.camera.position.set(0, 1.15, 2.1);
    this.controls = new OrbitControls(this.camera, sm.renderer.domElement);
    this.controls.target.set(0, 1.0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.4;
    // 上限须容纳整排视图：同排最多可达数十台（跨度可达 30m+），
    // 原 8m 会导致相机无法后退、整排超出画面。
    this.controls.maxDistance = 90;
    // 放开俯仰限制，允许任意方向上/下自由查看（不再强制回正或限制视角）
    this.controls.maxPolarAngle = Math.PI * 0.999;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true;
    this.controls.autoRotate = false;
    this.controls.enabled = false;

    this.doorTarget = { front: 0, rear: 0 }; // 弧度：0 关闭
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.onTitle = null;
    this.onDevicePick = null; // 单台特写中点击柜内设备时回调（由 main.js 接线到信息侧栏）
  }

  // 释放详情模型几何体（仅 geometry，材质为模块级共享缓存，禁止 dispose 以免污染主场景）
  _clearRoot() {
    if (!this.root) return;
    this.root.traverse((obj) => {
      if (obj.geometry && typeof obj.geometry.dispose === 'function') obj.geometry.dispose();
    });
  }

  // 开启机柜模型阴影：柜体与门体投射、柜体接收（自遮挡）
  _enableShadows(root) {
    if (!root) return;
    root.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
  }

  show(rack, rowRacks = null, mode = null) {
    // rack：主选机柜；rowRacks：同排机柜数组（仅「整排模式」使用）；
    // mode：显式指定视图模式（toggleMode 切换时传入），缺省按是否有同排推导。
    this.rack = rack;
    this.rowRacks = (rowRacks && rowRacks.length > 1) ? rowRacks : null;
    // 模式：showcase=单台精细特写（默认，对齐 cockpit-rack-3d-model.html 观感）；
    //       row=同排整排（剪影，可逐台开门）。整排模式下柜内为剪影，
    //       因数十台 × 精细模型的 draw call 会爆炸，单台特写才用精细模型。
    // 注意：此处不可无条件重置 mode，否则 toggleMode() 的切换会被覆盖。
    // 注意：兜底只能是合法模式 'showcase' / 'row'。原代码用无效值 'single'，
    // 孤立机柜（rowRacks 为 null）会落入 else 的整排分支并对 null 取 .length 崩溃
    // （审查 D-14 / #7）。统一兜底为 'showcase'（单台精细特写），'row' 仅由 toggleMode 显式切换。
    this.mode = mode || 'showcase';
    this.active = true;
    this._deviceGroups = null;
    // 仅在详情视图开启阴影（退出时关闭），避免机房全局阴影开销与驱动警告
    if (this.sm && this.sm.renderer) this.sm.renderer.shadowMap.enabled = true;
    this.sm.controls.enabled = false;
    this.controls.enabled = true;
    this.doorTarget.front = 0;
    this.doorTarget.rear = 0;

    // 清理上一组模型（整排时可能有多个 root），释放几何体与非共享材质/纹理，
    // 避免反复打开详情视图时显存泄漏（约 3MB/次）。共享材质（userData.shared）由
    // disposeSharedMaterials 统一释放，此处跳过。
    const oldRoots = [];
    if (this._roots) oldRoots.push(...this._roots);
    if (this.root && !oldRoots.includes(this.root)) oldRoots.push(this.root);
    for (const r of oldRoots) {
      this.scene.remove(r);
      r.traverse((obj) => {
        if (obj.geometry && typeof obj.geometry.dispose === 'function') obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
        for (const m of mats) {
          if (m.userData && m.userData.shared) continue;
          for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
            if (m[key] && typeof m[key].dispose === 'function') m[key].dispose();
          }
          if (typeof m.dispose === 'function') m.dispose();
        }
      });
    }

    // ---- 模式 A：单台精细特写（默认）----
    // 柜内每台设备都用精细 3D 模型，观感对齐 cockpit-rack-3d-model.html
    if (this.mode === 'showcase') {
      this.units = null;
      this._roots = null;
      const model = buildCabinetShowcaseModel(rack && rack.devices ? rack.devices : null);
      this.root = model.root;
      this.frontPivot = model.frontPivot;
      this.rearPivot = model.rearPivot;
      // 特写一律以正面朝向相机：场景中 rotationY 表示机柜在机房里的朝向
      // （可能被转 90° 成侧面对着相机，窄条不可辨），此处必须归零，
      // 否则「点击机柜看细节」看到的会是机柜侧面而非正面。
      this.root.rotation.y = 0;
      this.scene.add(this.root);
      // 收集柜内设备组，供「点击设备 → 信息侧栏」拾取
      this._deviceGroups = [];
      this.root.traverse((o) => { if (o.userData && o.userData.kind === 'device3d') this._deviceGroups.push(o); });
      this._enableShadows(this.root);
      this.frontPivot.rotation.y = 0;
      this.rearPivot.rotation.y = 0;
      // 相机距离按机柜实际高度反算：FOV 50° 时垂直可见高度 = 2*d*tan(25°)。
      // 机柜含脚轮/风扇约 2.1m，取 0.92 填充系数 → d ≈ 2.1*0.92/(2*tan25°) ≈ 2.07m，
      // 使机柜占满约 92% 画面高度，与源文件「单台特写」的取景一致。
      this._fly([0, 1.12, 2.07], [0, 1.0, 0]);
    } else {
      // ---- 模式 B：同排整排（剪影，可逐台开门）----
      const rowRacks = this.rowRacks;
      // 兜底：孤立机柜（rowRacks 为空或不足 2 台）不应进入整排分支。理论上 toggleMode
      // 已拦截（!this.rowRacks 直接 return false），此处再判空一次，避免对 null 取 .length
      // 导致 TypeError 卡死（审查 D-14 / #7）。退回单台特写。
      if (!rowRacks || rowRacks.length < 2) {
        this.mode = 'showcase';
        return this.show(rack, null, 'showcase');
      }
      const gap = 0.72;
      const n = rowRacks.length;
      this.units = rowRacks.map((rk, i) => {
        const model = buildCabinetDetailModel(rk && rk.devices ? rk.devices : null);
        const root = model.root;
        const offset = (i - (n - 1) / 2) * gap;
        // 整排视图统一以 +Z 为观察面（相机在 +Z 看向原点），
        // 故所有机柜按统一朝向摆放并沿 X 轴排开，确保一排都在视野内。
        root.rotation.y = 0;
        root.position.set(offset, 0, 0);
        this.scene.add(root);
        this._enableShadows(root);
        return {
          rack: rk,
          root,
          frontPivot: model.frontPivot,
          rearPivot: model.rearPivot,
          door: { front: 0, rear: 0 },
        };
      });
      this._roots = this.units.map((u) => u.root);
      this.root = this.units[0].root;
      this.frontPivot = this.units[0].frontPivot;
      this.rearPivot = this.units[0].rearPivot;
      // 相机按整排宽度自动后退，确保全部机柜入画。
      // 视场角 50°、横向取景约 1.8*span，故退到 span*0.62 + 2.6 即可刚好收全，
      // 同时保持机柜在画面中足够大（原系数 0.9+3.4 在长排下退得过远，机柜显小）。
      const span = (n - 1) * gap;
      this._fly([0, 2.1, span * 0.62 + 2.6], [0, 1.0, 0]);
    }
    if (this.onTitle) this.onTitle(rack, this.mode, this.rowRacks);
  }

  // 在「单台特写 / 同排整排」之间切换（同排仅 1 台时无整排可切）
  toggleMode() {
    if (!this.rowRacks) return false;
    const next = this.mode === 'showcase' ? 'row' : 'showcase';
    this.show(this.rack, this.rowRacks, next);
    return true;
  }

  // 点击柜体：整排模式下按命中的是哪一台，切换该台前/后门
  toggleUnitAt(hitObject) {
    if (this.units) {
      for (const u of this.units) {
        let o = hitObject;
        while (o) {
          if (o === u.frontPivot || o === u.rearPivot) {
            const which = o === u.frontPivot ? 'front' : 'rear';
            u.door[which] = u.door[which] === 0 ? (which === 'front' ? -1.745 : 1.745) : 0;
            return { ok: true, open: u.door[which] !== 0 };
          }
          o = o.parent;
        }
      }
      return null;
    }
    return null;
  }

  hide() {
    this.active = false;
    this.controls.enabled = false;
    this.sm.controls.enabled = true;
    // 退出详情即关闭阴影，避免机房视图继续承担阴影开销与相关驱动警告
    if (this.sm && this.sm.renderer) this.sm.renderer.shadowMap.enabled = false;
  }

  _fly(pos, target) {
    this.tween = {
      p0: this.camera.position.clone(),
      p1: new THREE.Vector3(...pos),
      t0: this.controls.target.clone(),
      t1: new THREE.Vector3(...target),
      k: 0,
    };
  }

  toggleDoor(which) {
    const A = 1.745; // 100°
    this.doorTarget[which] = this.doorTarget[which] === 0 ? (which === 'front' ? -A : A) : 0;
  }

  // 点击门体开合（整排模式下按命中机柜逐台开合）
  tap(clientX, clientY) {
    const rect = this.sm.renderer.domElement.getBoundingClientRect();
    this.ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.ray.setFromCamera(this.ndc, this.camera);
    if (this.units) {
      // 整排：拾取全部单元的门枢轴
      const pivots = this.units.flatMap((u) => [u.frontPivot, u.rearPivot]).filter(Boolean);
      const hits = this.ray.intersectObjects(pivots, true);
      if (!hits.length) return;
      const res = this.toggleUnitAt(hits[0].object);
      if (res && this.onDoorToggle) this.onDoorToggle(res, hits[0].object.userData.door || 'front');
      return;
    }
    const hits = this.ray.intersectObjects([this.frontPivot, this.rearPivot], true);
    if (hits.length) {
      this.toggleDoor(hits[0].object.userData.door || 'front');
      if (this.onDoorToggle) {
        this.onDoorToggle(
          { ok: true, open: this.doorTarget[hits[0].object.userData.door || 'front'] !== 0 },
          hits[0].object.userData.door || 'front',
        );
      }
      return;
    }
    // 设备级拾取（仅单台特写分支）：点击柜内某台设备 → 信息侧栏
    if (this._deviceGroups && this._deviceGroups.length) {
      const devHits = this.ray.intersectObjects(this._deviceGroups, true);
      if (devHits.length) {
        let o = devHits[0].object;
        while (o && !(o.userData && o.userData.device)) o = o.parent;
        if (o && o.userData.device && typeof this.onDevicePick === 'function') {
          this.onDevicePick(o.userData.device);
          return;
        }
      }
    }
  }

  update(dt) {
    if (!this.active) return;
    const k = Math.min(1, dt * 6);
    if (this.units) {
      // 整排：逐台独立门角度动画
      for (const u of this.units) {
        u.frontPivot.rotation.y += (u.door.front - u.frontPivot.rotation.y) * k;
        u.rearPivot.rotation.y += (u.door.rear - u.rearPivot.rotation.y) * k;
      }
    } else {
      this.frontPivot.rotation.y += (this.doorTarget.front - this.frontPivot.rotation.y) * k;
      this.rearPivot.rotation.y += (this.doorTarget.rear - this.rearPivot.rotation.y) * k;
    }
    if (this.tween) {
      const tw = this.tween;
      tw.k = Math.min(1, tw.k + dt / 0.8);
      const e = tw.k < 0.5 ? 2 * tw.k * tw.k : 1 - Math.pow(-2 * tw.k + 2, 2) / 2;
      this.camera.position.lerpVectors(tw.p0, tw.p1, e);
      this.controls.target.lerpVectors(tw.t0, tw.t1, e);
      if (tw.k >= 1) this.tween = null;
    }
    this.controls.update();
  }

  render(renderer) {
    const el = renderer.domElement;
    const aspect = el.clientWidth / el.clientHeight;
    if (Math.abs(this.camera.aspect - aspect) > 1e-3) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    renderer.render(this.scene, this.camera);
  }

  // 释放详情视图独占的场景资源与控制器（不影响主场景）
  dispose() {
    if (this.controls && typeof this.controls.dispose === 'function') {
      this.controls.dispose();
    }
    if (this.scene) {
      this.scene.traverse((obj) => {
        if (obj.geometry && typeof obj.geometry.dispose === 'function') obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
        for (const m of mats) {
          for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
            if (m[key] && typeof m[key].dispose === 'function') m[key].dispose();
          }
          if (typeof m.dispose === 'function') m.dispose();
        }
      });
    }
    this.active = false;
    this.rack = null;
    this.tween = null;
    // 释放环境反射贴图（PMREM 生成的 renderTarget，需显式 dispose）
    if (this._envTex && typeof this._envTex.dispose === 'function') this._envTex.dispose();
    this._envTex = null;
  }
}
