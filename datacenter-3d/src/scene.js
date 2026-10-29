import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { overviewPose } from './cameraPresets.js';
import { setMaxAnisotropy } from './texQuality.js';

// 渲染器 / 场景 / 相机 / 控制器 / 灯光 / 后处理 / 帧率与性能自适应
export class SceneManager {
  constructor(container) {
    this.container = container;
    this._updates = [];
    this.fps = 60;
    this._frames = 0;
    this._lastFpsT = performance.now();
    this.bloomEnabled = true;
    this._lastFrameT = 0;
    this.onFps = null;
    this.onAdaptive = null;
    this.onQuality = null;
    this.detailView = null; // 机柜详情视图（激活时优先渲染）

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // 写入 GPU 实际支持的最大各向异性等级：地/墙/侧板等掠射角表面据此
    // 保持锐利（用户「提升机房可视化清晰度」诉求的核心抓手；见 texQuality.js）
    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    // 清屏色与雾同色：取景下缘/地板之外的空区经 ACES 后呈深蓝雾色，
    // 不再是近纯黑的「底部黑条」（用户反馈根因之一）
    this.renderer.setClearColor(0x16202e, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    // 阴影默认关闭：开启后会在部分驱动/软件渲染器上触发
    // WebGLProgram 浮点精度警告（X4122），且机房全局阴影开销高、观感收益有限
    // （立体感主要由环境反射贴图承担）。机柜详情视图在需要时按需开启。
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // 监听 GPU 上下文丢失/恢复：长时间切后台或显存压力下浏览器会回收上下文，
    // 未处理时表现为画面永久黑屏且无任何提示。
    this._onContextLost = (e) => {
      e.preventDefault();
      this.contextLost = true;
      if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
      if (typeof this.onContextLost === 'function') this.onContextLost();
    };
    this._onContextRestored = () => {
      this.contextLost = false;
      if (typeof this.onContextRestored === 'function') this.onContextRestored();
      if (!this._raf && typeof this._loop === 'function') this._loop();
    };
    this.renderer.domElement.addEventListener('webglcontextlost', this._onContextLost, false);
    this.renderer.domElement.addEventListener('webglcontextrestored', this._onContextRestored, false);

    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    // 雾效：仅做轻微空间纵深，不可遮挡设备。
    // 机房可达 90m，若沿用旧值 0.011，指数雾会把远端机柜完全吞没（实测「一片黑」）。
    // 现按经验大幅降低：exp2 在 d=60m 处衰减到约 80%，仅用于拉开远近层次，
    // 同时保证远端机柜在「高清」诉求下仍清晰可辨（相对旧值 0.0038 再放宽一档）。
    this.scene.fog = new THREE.FogExp2(0x16202e, 0.0030);
    // 场景背景与雾同色：地板之外的空区与远处雾色连成一体，消除纯黑空带
    this.scene.background = new THREE.Color(0x16202e);

    this.camera = new THREE.PerspectiveCamera(
      55, container.clientWidth / container.clientHeight, 0.1, 1000,
    );
    // 初始总览机位：按房间尺寸自适应取景（旧固定 30,24,36 距离偏远，
    // 机房偏小且画面下方留大片空背景）。见 cameraPresets.overviewPose
    const pose = overviewPose(this.camera.aspect);
    this.camera.position.set(...pose.pos);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    // 自由交互模式：俯仰几乎全开（仅留极小余量防万向节数值问题），
    // 缩放范围放宽到贴地细看 ~ 全景远眺，平移（右键拖拽）保持开启，
    // 不再有任何"强制回正/自动复位"的默认机位限制。
    this.controls.maxPolarAngle = Math.PI * 0.999; // 允许从任意角度观察（含近水平以下）
    // 自由交互：允许平移（左/右/上/下任意方向）、屏幕空间平移（可上下自由平移而非仅贴地）、
    // 关闭自动旋转/自动回正——视角完全由用户拖拽控制，不再强制居中或自动复位。
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true;
    this.controls.autoRotate = false;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 220;
    this.controls.zoomSpeed = 1.1;
    this.controls.target.set(0, 2, 0);

    this._setupLights();
    this._setupEnvironment();
    this._setupComposer();

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this._resizeHandler = () => this._onResize();
    window.addEventListener('resize', this._resizeHandler);

    // 容器尺寸观察：宿主元素尺寸因布局变化（而非窗口 resize）改变时，
    // window 的 resize 事件不会触发，renderer 因此停在原尺寸（画面被拉伸/留黑边）。
    // 观察者令其紧随宿主尺寸重算投影与缓冲，保证任何布局变化都正确适配。
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this._onResize());
      this._ro.observe(this.container);
    }

    // 画面平移量（px）：监控大屏左右面板宽度不对称时，把渲染内容向净空区平移，
    // 使机房中心落在左右面板之间的可见区正中（见 setOverlayPan / _onResize）。
    this._panLeft = 0;
    this._panRight = 0;
  }

  /**
   * 设置左右遮挡宽度（px，由 Vue 监控大屏测量面板实际覆盖范围后传入）。
   * 画布保持全屏；仅通过 camera.setViewOffset 把画面向净空区整体平移
   * (left-right)/2 像素——不裁切、不缩放，机房中心恰好落在面板间可见带正中。
   * 传 0/0（规划态、第一人称、面板隐藏时）即恢复居中渲染。
   */
  setOverlayPan(leftPx, rightPx) {
    this._panLeft = Math.max(0, Number(leftPx) || 0);
    this._panRight = Math.max(0, Number(rightPx) || 0);
    this._onResize();
  }

  // 彻底释放：停渲染循环、解绑事件、销毁 WebGL 上下文与场景资源
  // 供 Vue 组件卸载时调用，防止内存泄漏与上下文泄漏（WebGL context 上限约 16 个）
  dispose() {
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this._ro) {
      this._ro.disconnect();
      this._ro = null;
    }
    if (this.controls && typeof this.controls.dispose === 'function') {
      this.controls.dispose();
    }
    // 遍历场景释放 geometry / material / texture
    if (this.scene) {
      this.scene.traverse((obj) => {
        if (obj.geometry && typeof obj.geometry.dispose === 'function') {
          obj.geometry.dispose();
        }
        const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
        for (const m of mats) {
          // 跨实例共享材质（rackModel.js 的 _M）由 disposeSharedMaterials() 统一释放，
          // 此处跳过，否则缓存里会残留已 dispose 的材质导致重挂后材质异常
          if (m.userData && m.userData.shared) continue;
          for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
            if (m[key] && typeof m[key].dispose === 'function') m[key].dispose();
          }
          if (typeof m.dispose === 'function') m.dispose();
        }
      });
    }
    // 释放 PMREM 环境反射贴图（否则显存泄漏，长时间挂机/反复挂载上下文累积）
    if (this._envTex && typeof this._envTex.dispose === 'function') {
      this._envTex.dispose();
      this._envTex = null;
    }
    if (this.scene) this.scene.environment = null;
    if (this.composer && typeof this.composer.dispose === 'function') {
      this.composer.dispose();
    }
    if (this.renderer) {
      this.renderer.domElement.removeEventListener('webglcontextlost', this._onContextLost);
      this.renderer.domElement.removeEventListener('webglcontextrestored', this._onContextRestored);
      this.renderer.dispose();
      // 主动丢弃 WebGL 上下文，避免浏览器上下文累积（切房/反复挂载时必需）
      if (typeof this.renderer.forceContextLoss === 'function') {
        this.renderer.forceContextLoss();
      }
      const canvas = this.renderer.domElement;
      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }
  }

  _setupLights() {
    // 照明参数对齐 cockpit-rack-3d-model.html（该文件为机柜视觉基准）
    // r155+ 物理光照单位：主光 2.2 / 补光 1.0 / 环境光 0.85
    // 基线（第三人称/监控大屏）。第一人称下由 setFpsLighting(true) 临时压低，
    // 把均匀平填光让位给天花板灯具点光源，制造墙面自上而下、近亮远暗的顶光渐变。
    this._ltBase = { a: 0.85, h: 0.5, k: 2.2, f: 1.0, exp: 1.35 };
    this._ltAmbient = new THREE.AmbientLight(0xb8c8da, this._ltBase.a);
    this._ltHemi = new THREE.HemisphereLight(0xbfd4e8, 0x1a2230, this._ltBase.h);
    this._ltKey = new THREE.DirectionalLight(0xffffff, this._ltBase.k);
    this._ltKey.position.set(20,40,18);
    this._ltFill = new THREE.DirectionalLight(0x88bbff, this._ltBase.f);
    this._ltFill.position.set(-18,22,-16);
    this.scene.add(this._ltAmbient, this._ltHemi, this._ltKey, this._ltFill);
  }

  // 第一人称顶光渐变：进入时压低均匀平填光并降低曝光，使天花板灯具点光源
  // 成为墙面照明主角（消除墙面均匀过曝的纯白观感）；退出时按 _ltBase 100% 还原，
  // 第三人称/监控大屏观感零变化。
  setFpsLighting(on) {
    const b = this._ltBase;
    if (!on) {
      this._ltAmbient.intensity = b.a;
      this._ltHemi.intensity = b.h;
      this._ltKey.intensity = b.k;
      this._ltFill.intensity = b.f;
      this.renderer.toneMappingExposure = b.exp;
      return;
    }
    this._ltAmbient.intensity = 0.05;
    this._ltHemi.intensity = 0.045;
    this._ltKey.intensity = 0.14;
    this._ltFill.intensity = 0.09;
    this.renderer.toneMappingExposure = 1.0;
  }

  // 环境反射（IBL）：让机柜金属边框/玻璃门/挂耳有真实质感。
  // 对齐 cockpit-rack-3d-model.html：RoomEnvironment 经 PMREMGenerator 预滤波。
  // 缺此项时 PBR 材质仅被平行光照亮，呈「塑料感」，与基准文件观感差异明显。
  _setupEnvironment() {
    try {
      this._envTex = new THREE.PMREMGenerator(this.renderer)
        .fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environment = this._envTex;
    } catch (e) {
      // 环境贴图失败不影响主功能，仅质感下降
      console.warn('[scene] 环境反射贴图初始化失败:', e && e.message);
    }
  }

  _setupComposer() {
    // =====================================================================
    // 关键修复：EffectComposer 自建的 render target 不带 samples 字段，
    // 而 WebGLRenderer 的 antialias:true 只作用于「默认帧缓冲」。
    // 一旦走后处理链，场景先渲染到离屏 FBO 再拷到屏幕，MSAA 完全失效
    // → 机柜边缘、灯带、人物轮廓、网格线全部发虚（即"画面模糊"的主因）。
    // 解决：显式传入带 samples:4 的 WebGL2 多重采样渲染目标。
    // =====================================================================
    const dpr = this.renderer.getPixelRatio();
    const bw = Math.max(1, Math.floor(this.container.clientWidth * dpr));
    const bh = Math.max(1, Math.floor(this.container.clientHeight * dpr));
    let rt;
    try {
      rt = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType, samples: 4 });
      this._msaaSamples = 4;
    } catch (e) {
      // 极端环境（不支持多重采样 RGBA16F）下降级为无 MSAA，保证不白屏
      console.warn('[scene] MSAA 渲染目标创建失败，回退为无多重采样:', e && e.message);
      rt = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType });
      this._msaaSamples = 0;
    }
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // 泛光：strength/radius 略降、threshold 略升——仅让最亮的指示灯/灯具发光，
    // 不再把中灰墙面/机柜边缘「晕」开，从而保持画面锐利（用户「高清、锐利」诉求）。
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.container.clientWidth, this.container.clientHeight),
      0.55, 0.6, 0.92,
    );
    this.composer.addPass(this.bloomPass);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(this.container.clientWidth, this.container.clientHeight);

    // =====================================================================
    // 画质档位：以「分辨率缩放 + 泛光」两档组合，替代原先"一低帧就
    // 把像素比打到 1"的粗暴降级（那会让画面立刻变模糊，正是用户痛点）。
    // high 为默认高清档：全分辨率 + 泛光 + MSAA。
    // =====================================================================
    this._QL = {
      high:     { scale: 1.00, bloom: true },
      balanced: { scale: 0.85, bloom: true },
      perf:     { scale: 0.65, bloom: false },
    };
    this._qOrder = ['perf', 'balanced', 'high'];
    this.quality = 'high';
    this.autoQuality = true;     // 用户手动选档后关闭自适应
    this._fpsEma = 0;
    this._lowSince = 0;
    this._highSince = 0;
    this.onQuality = null;
  }

  /**
   * 切换画质档位。
   * @param {'high'|'balanced'|'perf'} name
   * @param {boolean} userInitiated 是否用户手动选择（手动则停用自适应）
   */
  setQuality(name, userInitiated = false) {
    const q = this._QL[name];
    if (!q) return this;
    this.quality = name;
    if (userInitiated) this.autoQuality = false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * q.scale;
    this.renderer.setPixelRatio(dpr);
    this.composer.setPixelRatio(dpr);
    this.setBloom(q.bloom);
    // 像素比变了必须重算尺寸，否则离屏目标与屏幕不同步会拉伸模糊
    this._onResize();
    if (this.onQuality) this.onQuality(name, q);
    return this;
  }

  /** 当前有效渲染分辨率（设备像素） */
  getRenderSize() {
    return this.renderer.getDrawingBufferSize(new THREE.Vector2()).toArray();
  }

  addUpdate(fn) { this._updates.push(fn); }

  setBloom(on) { this.bloomEnabled = on; this.bloomPass.enabled = on; }

  // 截图：复用渲染循环的最终合成画面（含泛光），同步渲染后从 canvas 取 PNG dataURL。
  // 必须在同一次 JS 执行流内渲染后立即读取 drawing buffer（WebGL 默认不保留），
  // 故这里显式 render 一次再 toDataURL，避免截到空白帧。
  captureScreenshot() {
    if (!this.renderer) return null;
    if (this.detailView && this.detailView.active) {
      this.detailView.render(this.renderer);
    } else if (this.bloomEnabled && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    try {
      return this.renderer.domElement.toDataURL('image/png');
    } catch (e) {
      return null;
    }
  }

  start() {
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      const now = performance.now();
      // 帧间隔：既供阻尼换算，也供自适应判断
      const dt = Math.min(0.1, (now - (this._lastFrameT || now)) / 1000);
      this._lastFrameT = now;
      this._frames++;
      if (now - this._lastFpsT >= 500) {
        this.fps = Math.round((this._frames * 1000) / (now - this._lastFpsT));
        this._frames = 0; this._lastFpsT = now;
        this._adaptive();
        if (this.onFps) this.onFps(this.fps);
      }
      // =====================================================================
      // 帧率无关的轨道阻尼。
      // three 的 OrbitControls 阻尼按「调用次数」衰减（sphericalDelta *= 1-factor），
      // 帧率一波动，旋转的减速快慢就跟着变：低帧率时"一松手就猛停"、
      // 高帧率时"拖尾过长"——这是旋转交互卡顿、不跟手的直接原因。
      // 以 60fps 为基准反推等效系数，使任何帧率下单位时间的衰减量一致。
      // =====================================================================
      const DAMP_BASE = 0.08;   // 60fps 下的手感基准
      this.controls.dampingFactor = Math.max(0.01, Math.min(0.6,
        1 - Math.pow(1 - DAMP_BASE, Math.max(dt, 1e-4) * 60)));
      // 第一人称（AvatarFPS）/ 漫游（RoamControls）/ 巡检（PatrolController）接管相机时，
      // OrbitControls 已被 disabled；此时仍调用 update() 会用「旧 orbit target」反算相机姿态
      // 并 lookAt(target)，与首人称 update 互相覆盖，曾在帧率波动时引发相机轻微回弹。
      // 仅在 enabled 时更新，彻底隔离两种相机控制，旋转过程零干扰、零形变。
      if (this.controls.enabled) this.controls.update(dt);
      // 必须把 dt 传给每个更新回调。此前写成 fn()（无实参），下游拿到的 dt 恒为
      // undefined：气流箭头按 dt 积分位移 → position 变 NaN（264 个箭头定位崩坏）；
      // LED 呼吸标牌的计时器 _t += dt → NaN（呼吸动画失效）。
      for (const fn of this._updates) fn(dt);
      if (this.detailView && this.detailView.active) {
        this.detailView.render(this.renderer);
      } else if (this.bloomEnabled) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    };
    // 保存循环引用：webglcontextrestored 时据此重启 RAF，
    // 否则恢复后渲染循环永不重启 → 永久黑屏（见 _onContextRestored）
    this._loop = loop;
    loop();
  }

  // 性能自适应：渐进式升降档 + 滞回，避免画质骤降骤升造成闪烁
  _adaptive() {
    if (!this.autoQuality) return;
    // EMA 平滑：单帧尖峰（切换视图、GC、编译着色器）不应触发降档
    this._fpsEma = this._fpsEma ? this._fpsEma + (this.fps - this._fpsEma) * 0.25 : this.fps;
    const idx = this._qOrder.indexOf(this.quality);
    const now = performance.now();

    if (this._fpsEma < 46) {
      // 持续低帧 2.5s 才降档，给瞬态负载留出恢复窗口
      if (!this._lowSince) this._lowSince = now;
      if (now - this._lowSince > 2500 && idx > 0) {
        this.setQuality(this._qOrder[idx - 1]);
        this._lowSince = now; this._highSince = 0;
        if (this.onAdaptive) {
          this.onAdaptive(`帧率偏低（${Math.round(this._fpsEma)} FPS），画质降至「${this.quality}」`);
        }
      }
    } else {
      this._lowSince = 0;
    }

    if (this._fpsEma > 57) {
      // 持续高帧 6s 才升档：升档比降档更保守，防止在阈值附近反复抖动
      if (!this._highSince) this._highSince = now;
      if (now - this._highSince > 6000 && idx < this._qOrder.length - 1) {
        this.setQuality(this._qOrder[idx + 1]);
        this._highSince = 0; this._lowSince = 0;
        if (this.onAdaptive) {
          this.onAdaptive(`帧率充裕（${Math.round(this._fpsEma)} FPS），画质升至「${this.quality}」`);
        }
      }
    } else {
      this._highSince = 0;
    }
  }

  _onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    // 左右遮挡不对称时平移画面：offsetX 取负值 = 渲染内容整体右移 pan 像素。
    // setViewOffset 只改投影矩阵，不裁切不缩放；射线拾取（setFromCamera）走同一
    // 投影矩阵，拾取坐标自动与画面一致，无需换算。
    const pan = (this._panLeft - this._panRight) / 2;
    if (Math.abs(pan) > 1 && w > 0) {
      this.camera.setViewOffset(w, h, -pan, 0, w, h);
    } else if (this.camera.view && this.camera.view.enabled) {
      this.camera.clearViewOffset();
    }
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  // 屏幕坐标 → 射线拾取（递归，支持设备 Group 内子网格）
  pick(objects, clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(objects, true);
  }

  // 屏幕坐标 → 与指定平面（如地面 y=0）的交点，用于平面拖拽
  rayPoint(clientX, clientY, plane) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, p) ? p : null;
  }
}
