import * as THREE from 'three';
import { RACK, heat, TYPE_LABEL, STATUS_LABEL, AC_UNIT_COOLING_KW } from './config.js';
import { buildCabinetModel, buildExtinguisherModel, getCabinetBodyBatches } from './rackModel.js';
import { buildACModel, buildGasFireCabinetModel, buildUPSModel, buildPowerCabinetModel } from './equipmentModel.js';
import { genCabinetDevices, deriveCabinetStatus } from './seedLayout.js';
import { STATUS_COLOR_NUM, SELECTED, HOVER } from './themeTokens.js';
import { maxAnisotropy } from './texQuality.js';

// 选中 / 悬停高亮色（token → THREE.Color 数值形式）。
// themeTokens 只给十六进制串，这里转一次即可；与 _flashReject 的拒绝红(0xff3b30)
// 同属「交互反馈色」，一并注释说明来源。
const SELECTED_NUM = parseInt(SELECTED.slice(1), 16);
const HOVER_NUM = parseInt(HOVER.slice(1), 16);
const REJECT_NUM = 0xef4444; // = STATUS_COLOR_NUM.fault，摆放/旋转被拒时的红色闪烁

// ---- 标记 LOD：世界尺寸 → 屏幕像素阈值（推导见 update() 内注释）----
// 三档阈值不再写死米数，而是「该标记在屏幕上小到读不出信息时的距离」。
// 目标像素取经验下限：低于这个值，标记就从「信息」退化成「噪点」。
const LOD_LABEL_PX = 9;    // 编号文字：低于 9px 字高，RK 编号已难以辨认
const LOD_BAR_PX = 2;      // 容量条：低于 2px 高退化为一条细线，但仍可看出填充长度
const LOD_DOT_PX = 5;      // 状态点：低于 5px 只剩一个色点，且与柜体像素难以区分
// 各标记的世界尺寸（须与 _buildRackMarkers 中的实际值保持一致）
const LOD_LABEL_H = 0.22;  // 编号标牌默认世界高度（柜宽 <0.65m 时走此下限）
const LOD_BAR_H = 0.06;    // 容量条世界高度（BoxGeometry 的 y 分量）
const LOD_DOT_H = 0.44;    // 状态点有效世界直径（sprite scale 0.5 × 纹理实心圆占比 28/32）
const LOD_DOT_MIN_OP = 0.25;     // 状态点淡出的最淡不透明度
const LOD_DOT_FULL_RATIO = 0.35; // 地面距离 < 阈值×0.35 时状态点完全不透明
// 取不到视口高度时的兜底（≈1080p 视口 / 55° FOV 下的 pxPerM）
const LOD_FALLBACK_PX_PER_M = 864;

// 撤销栈合并窗口：同柜同类操作在此间隔内视为「一次连续手势」（拖拽/连续微调）
const HISTORY_COALESCE_MS = 700;

// 模型类设备：使用精细模型（克隆共享几何/材质），其余类型走 InstancedMesh
//
// ac / cylinder / power / ups 自本次改造起由占位方块升级为精细模型（equipmentModel.js）：
//   · ac       → 美的立式机房精密空调（原为 1.4×2.2×1.2 灰盒 + 青色 wireframe）
//   · cylinder → 柜式 HFC-227ea 七氟丙烷灭火装置（原为 0.5×1.5×0.5 灰盒）
//   · power    → 低压配电柜（原为 0.8×2.2×1.0 灰盒）
//   · ups      → 在线式 UPS 电源柜（原为 0.9×2.0×1.0 灰盒）
// 四者都遵循「原点=底面中心、正面朝 +Z」的机柜契约，故下方 position/rotationY
// 的摆放逻辑无需任何特判，走 else 分支逐柜 clone 模板即可。
const MODEL_BUILDERS = {
  server: buildCabinetModel,
  fire: buildExtinguisherModel,
  ac: buildACModel,
  cylinder: buildGasFireCabinetModel,
  power: buildPowerCabinetModel,
  ups: buildUPSModel,
};

// 设备系统：数据模型 + 实例化渲染/精细模型 + 着色模式 + 选中/悬停高亮 + 自由摆放（增删/拖拽移动/旋转）/搜索
export class RackSystem {
  constructor(scene) {
    this.scene = scene;
    this.racks = [];
    this.meshes = {};        // type -> { body, frame }（实例化类型）
    this.groups = new Map(); // rack -> Group（模型类设备）
    this._instBody = {};     // type -> InstancedMesh[]（柜体本体，按材质）
    this._instBar = {};      // type -> { statusIm, capIm }（状态条/容量条实例化）
    this.byId = new Map();   // id -> rack
    this.templates = {};     // type -> 模型模板
    this.lookup = new Map(); // `${type}#${index}` -> rack（实例化类型）
    this.colorMode = 'status';
    this.selected = null;
    // 多选集（Shift/Ctrl 加选、Ctrl+A 全选）。selected 仍是「主选中」——
    // 检查器、详情视图、2D 联动都按单柜语义取它，集内其余成员只参与批量操作。
    // 存机柜对象而非 id：remove 后对象仍在闭包里可被撤销恢复，
    // 而 loadFrom 会整体换对象，届时必须清空（见 loadFrom）。
    this._selSet = new Set();
    this.onSelect = null; // T17：选中回调（3D → 2D 联动），由宿主注入
    // 进风温度模型钩子：由宿主注入 `(powerKW) => ℃`，新增机柜时据此推导温度。
    // racks.js 不直接依赖工程域模块（避免循环依赖 + 保持可独立测试）；
    // 未注入时退回随机占位值，行为与注入前一致。
    this.inletTempFn = null;
    this.hovered = null;
    // ---- 撤销 / 重做（阶段④反复试错的安全网）----
    // 摆放类操作（增 / 删 / 移 / 转 / 批量）都是破坏性的：一次误删会连带丢掉柜内
    // 设备清单并直接落盘，一次拖错位置在 136 柜的机房里几乎无法手动找回。
    // 采用「命令对象」而非整场快照：每条只存逆操作所需的少量数据，
    // 60 步栈的内存开销可忽略，也避免 136 柜深拷贝带来的 GC 抖动。
    this._undoStack = [];
    this._redoStack = [];
    this._undoLimit = 60;
    this._lastPushAt = -Infinity;
    this.onHistoryChange = null; // 栈变化回调（宿主刷新撤销/重做按钮）
    // ---- 柜门自动关闭（开启后若空闲 _doorIdleMs 无任何用户操作则自动关门）----
    this._doorAutoClose = true;   // 总开关（测试 / 特殊场景可置 false 关闭）
    this._doorIdleMs = 60000;     // 空闲时长阈值（默认 60 秒）
    // 最近一次用户操作时间戳（开门、点击、拖拽、缩放等都Reset它）
    this._lastActivity = this._now();
    this.onAutoClose = null;      // 自动关门回调（宿主可注入 toast 提示）
    this._uid = 0;
    this._dummy = new THREE.Object3D();
    // 拾取代理：单一 InstancedMesh 覆盖全部设备（射线检测专用）。
    //
    // 演进记录（性能优化）：
    //   旧实现 = 每设备一个透明 Mesh（visible=true + colorWrite=false）。
    //   每台仍占 1 次 draw call，136 台就是 136 次纯浪费的绘制
    //   （实测占全场 3630 次 draw call 中的 136 次，且都是不可见的）。
    //   现合并为 1 个 InstancedMesh：draw call 从 N 降到 1，
    //   命中时用 hit.instanceId 反查设备。
    // 注意：仍不能用 visible=false —— three.js 的 Raycaster 会跳过
    // visible=false 的物体，导致点击拾取完全失效（实测过）。
    // 故保持「全透明 + 不写深度 + 不写颜色」，只是换成实例化载体。
    this.proxies = new Map();          // rack -> instanceId（保留旧 API 语义）
    this._proxyByIndex = [];           // instanceId -> rack
    this._proxyInst = null;            // 唯一的实例化代理
    this._proxyGeo = new THREE.BoxGeometry(1, 1, 1);
    this._proxyMat = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0, depthWrite: false, colorWrite: false,
    });
    // 每次 build() 新建、需在下一次 build() 时释放的资源（几何 / 材质 / InstancedMesh）
    this._owned = [];
    // 实时告警脉冲：记录当前正在脉冲的机柜 id，update() 据此做呼吸式发光并在解除时恢复
    this._pulsing = new Set();
    // 每柜附加可视化（T14 容量条 / T18 状态标牌）的网格与共享纹理，统一回收
    this._extra = [];
    this._camera = null;
    this._billboardTex = null;
    // P2-5-3：编号标牌纹理按 id 缓存，复用同一 CanvasTexture（与 _billboardTex 单例统一管理）
    this._idTexCache = new Map();
    this._buildHighlight();
  }

  // 机柜精细模型缓存：按「类型 + 设备清单签名」缓存，差异化设备各自独立构建
  _template(type, devices) {
    if (!this._tplCache) this._tplCache = new Map();
    const sig = devices ? `${type}#${JSON.stringify(devices)}` : `${type}#default`;
    if (!this._tplCache.has(sig)) this._tplCache.set(sig, MODEL_BUILDERS[type](devices));
    return this._tplCache.get(sig);
  }

  _nextId() {
    this._uid += 1;
    return `RK${String(this._uid).padStart(3, '0')}`;
  }

  // 清空全部设备（初始/重置为空机房）
  clearAll() {
    const all = this.racks.slice();
    this.racks = [];
    this.setSelected(null);
    this.build();
    if (all.length) {
      this.pushHistory({
        label: `清空机房（${all.length} 台）`,
        undo: () => { this.racks = all.slice(); this.build(); },
        redo: () => { this.racks = []; this.setSelected(null); this.build(); },
      });
    }
  }

  // =======================================================================
  // 撤销 / 重做
  // =======================================================================
  get canUndo() { return this._undoStack.length > 0; }
  get canRedo() { return this._redoStack.length > 0; }

  /**
   * 登记一条可撤销操作。
   * @param {{label:string, undo:Function, redo:Function}} entry
   * @param {string} [tag]  合并键（通常是机柜 id）
   * @param {string} [kind] 合并类别（move / rotate / ...）
   *
   * 合并规则：上一条与本次「同柜 + 同类 + 间隔 < 700ms」时，不新增条目，
   * 只把上一条的 redo 指向最新落点。没有这条规则，拖拽时 tryPlace 每帧被
   * 调用一次，一次 2 秒的拖动会灌入上百条微移动记录，把 60 步栈瞬间填满，
   * 撤销退化成「按一次退回 1 毫米」。
   */
  pushHistory(entry, tag, kind) {
    this._redoStack.length = 0; // 任何新操作都使重做栈失效
    const now = performance.now();
    const last = this._undoStack[this._undoStack.length - 1];
    if (last && tag && last.tag === tag && last.kind === kind
      && now - this._lastPushAt < HISTORY_COALESCE_MS) {
      last.redo = entry.redo;
      last.label = entry.label;
    } else {
      entry.tag = tag; entry.kind = kind;
      this._undoStack.push(entry);
      if (this._undoStack.length > this._undoLimit) this._undoStack.shift();
      this._lastPushAt = now;
    }
    if (this.onHistoryChange) this.onHistoryChange();
  }

  /** @returns {{label:string}|null} 被撤销的操作（供宿主提示） */
  undo() {
    const e = this._undoStack.pop();
    if (!e) return null;
    e.undo();
    this._redoStack.push(e);
    if (this.onHistoryChange) this.onHistoryChange();
    return e;
  }

  /** @returns {{label:string}|null} 被重做的操作（供宿主提示） */
  redo() {
    const e = this._redoStack.pop();
    if (!e) return null;
    e.redo();
    this._undoStack.push(e);
    if (this.onHistoryChange) this.onHistoryChange();
    return e;
  }

  // 从已保存数据恢复
  loadFrom(list) {
    this.racks = [];
    this._uid = 0;
    // 存档整体替换现场，旧历史操作的对象已不在场景中 → 栈必须作废
    this._undoStack.length = 0;
    this._redoStack.length = 0;
    this._lastPushAt = -Infinity;
    // 同理，旧选中的机柜对象已全部失效 → 多选集作废并收回描边
    // （不清会让 _hlMap 里的线框永久挂在已消失机柜的坐标上）
    this._selSet = new Set();
    this.selected = null;
    this._syncHighlights();
    for (const r of list || []) {
      if (!RACK[r.type]) continue;
      const type = r.type;
      const density = Number(r.density) || 50;
      // B6：机柜传感器数据。功率按类型派生（服务器柜随负载升高），缺失时给合理默认值
      const power = Number(r.power)
        || (type === 'server' ? Math.round(2 + (Math.min(100, density) / 100) * 4)
          : (type === 'ac' ? 3 : 0));
      this.racks.push({
        id: r.id || this._nextId(),
        type,
        x: Number(r.x) || 0,
        z: Number(r.z) || 0,
        rotationY: Number(r.rotationY) || 0,
        temp: Number(r.temp) || 22,
        density,
        humidity: Number(r.humidity) || 45,
        coolingKW: r.coolingKW != null ? Number(r.coolingKW) : (type === 'ac' ? AC_UNIT_COOLING_KW : undefined),
        power,
        status: ['normal', 'warning', 'fault'].includes(r.status) ? r.status : 'normal',
        devices: Array.isArray(r.devices) ? r.devices : null, // 单柜设备清单（U 位/类别/状态）
      });
    }
    this.build();
  }

  // 依据数据重建（实例化 mesh + 模型类 Group + 拾取代理）
  build() {
    this._releaseBuilt();
    for (const t in this.meshes) {
      this.scene.remove(this.meshes[t].body, this.meshes[t].frame);
    }
    this.meshes = {};
    this.lookup.clear();
    for (const g of this.groups.values()) this.scene.remove(g);
    this.groups.clear();
    this._releaseProxy();
    for (const m of this._extra) this.scene.remove(m);
    this._extra = [];
    this.byId.clear();
    for (const rack of this.racks) this.byId.set(rack.id, rack);

    const instanced = this.racks.filter((r) => !MODEL_BUILDERS[r.type]);
    const byType = {};
    for (const rack of instanced) (byType[rack.type] ||= []).push(rack);

    for (const type in byType) {
      const list = byType[type];
      const def = RACK[type];
      const geo = new THREE.BoxGeometry(def.w, def.h, def.d);
      const bodyMat = new THREE.MeshStandardMaterial({
        roughness: 0.42, metalness: 0.45, emissive: 0x16283c, emissiveIntensity: 0.5,
      });
      const body = new THREE.InstancedMesh(geo, bodyMat, list.length);
      body.name = 'rack-body';
      body.userData.type = type;
      this._owned.push(geo, bodyMat, body);

      const frameMat = new THREE.MeshBasicMaterial({
        color: 0x2bd6ff, wireframe: true, transparent: true, opacity: 0.5,
      });
      const frame = new THREE.InstancedMesh(geo, frameMat, list.length);
      frame.name = 'rack-frame';
      frame.userData.type = type;
      // geo 与 body 共用，只登记一次；frame 及其材质需释放
      this._owned.push(frameMat, frame);

      list.forEach((rack, i) => {
        rack._type = type;
        rack._idx = i;
        this._setMatrix(body, frame, rack);
        this.lookup.set(`${type}#${i}`, rack);
        body.setColorAt(i, this._colorFor(rack));
      });
      body.instanceMatrix.needsUpdate = true;
      frame.instanceMatrix.needsUpdate = true;
      if (body.instanceColor) body.instanceColor.needsUpdate = true;
      this.scene.add(body, frame);
      this.meshes[type] = { body, frame };
    }

    // 模型类设备渲染：性能优化核心。
    // 旧实现 = 每台机柜独立克隆精细模型（21 个 mesh），132 台 = 2772 次 draw call，
    // 是全场 3147 次绘制调用的主因，导致整场景帧率暴跌、人物动画也跟着卡顿。
    // 新实现（server）：柜体本体 + 状态条 + 容量条全部 InstancedMesh 实例化，
    // 132 台共享几何 → 柜体按材质仅 ~18 次 draw call，状态条/容量条各 1 次。
    // 门（frontPivot/rearPivot）因需逐柜独立开合动画，仍逐柜克隆（仅 ~4 mesh/台）。
    for (const type of Object.keys(MODEL_BUILDERS)) {
      const list = this.racks.filter((r) => r.type === type);
      if (!list.length) continue;
      const def = RACK[type];

      if (type === 'server') {
        const bodyData = getCabinetBodyBatches(null);
        const S = bodyData.scale, plinthY = bodyData.plinthY;

        // 1) 柜体本体：按材质实例化（N 台共享几何）
        for (const b of bodyData.batches) {
          const im = new THREE.InstancedMesh(b.geo, b.material, list.length);
          list.forEach((rack, i) => {
            rack._idx = i;
            this._dummy.position.set(rack.x, 0, rack.z);
            this._dummy.rotation.set(0, rack.rotationY || 0, 0);
            this._dummy.scale.set(1, 1, 1);
            this._dummy.updateMatrix();
            im.setMatrixAt(i, this._dummy.matrix);
          });
          im.instanceMatrix.needsUpdate = true;
          im.frustumCulled = false;
          this.scene.add(im);
          this._owned.push(b.geo, im);
          (this._instBody[type] ||= []).push(im);
        }

        // 2) 门：逐柜克隆枢轴组（保留点击开合动画），套 0.01 缩放 + 脚轮偏移
        const tpl = this._template(type, null);
        const fp = tpl.getObjectByName('frontPivot');
        const rp = tpl.getObjectByName('rearPivot');
        for (const rack of list) {
          const holder = new THREE.Group();
          holder.scale.setScalar(S);
          holder.position.y = plinthY;
          if (fp) {
            const c = fp.clone();
            c.traverse((o) => { if (o.isMesh) o.userData.door = 'front'; });
            holder.add(c); rack._frontPivot = c;
          }
          if (rp) {
            const c = rp.clone();
            c.traverse((o) => { if (o.isMesh) o.userData.door = 'rear'; });
            holder.add(c); rack._rearPivot = c;
          }
          if (!rack._doorTarget) rack._doorTarget = { front: 0, rear: 0 };
          const g = new THREE.Group();
          g.add(holder);
          g.position.set(rack.x, 0, rack.z);
          g.rotation.y = rack.rotationY || 0;
          this.scene.add(g);
          this.groups.set(rack, g);
        }

        // 3) 状态条 + 容量条：实例化（按柜色 / 占用率着色，支持实时告警脉冲）
        const statusGeo = new THREE.BoxGeometry(def.w * 0.92, 0.09, Math.max(0.06, def.d * 0.08));
        const statusMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const statusIm = new THREE.InstancedMesh(statusGeo, statusMat, list.length);
        const capGeo = new THREE.BoxGeometry(1, 0.06, 0.04);
        const capMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const capIm = new THREE.InstancedMesh(capGeo, capMat, list.length);
        const _lm = new THREE.Matrix4(), _rm = new THREE.Matrix4(), _wm = new THREE.Matrix4();
        list.forEach((rack, i) => {
          // 状态条：柜顶边缘（柜体局部坐标）
          _lm.makeTranslation(0, def.h + 0.05, def.d / 2 - 0.04);
          _rm.makeRotationY(rack.rotationY || 0);
          _wm.makeTranslation(rack.x, 0, rack.z).multiply(_rm).multiply(_lm);
          statusIm.setMatrixAt(i, _wm);
          statusIm.setColorAt(i, this._colorFor(rack));
          // 容量条：柜门正面下沿（世界坐标），宽度按占用率缩放
          const devs = Array.isArray(rack.devices) ? rack.devices : [];
          const usedU = devs.reduce((s, d) => s + (Number(d.h) || 0), 0);
          const frac = Math.max(0, Math.min(1, usedU / 42));
          const barW = Math.max(0.02, def.w * 0.8 * frac);
          this._dummy.position.set(rack.x - (def.w * 0.8) / 2 + barW / 2, 0.15, rack.z + def.d / 2 + 0.02);
          this._dummy.rotation.set(0, 0, 0);
          this._dummy.scale.set(barW, 1, 1);
          this._dummy.updateMatrix();
          capIm.setMatrixAt(i, this._dummy.matrix);
          capIm.setColorAt(i, heat(frac));
          rack._statusBarIm = statusIm; rack._statusBarI = i;
          rack._capBarIm = capIm; rack._capBarI = i;
          rack._capBarInstanced = true;
        });
        statusIm.instanceMatrix.needsUpdate = true;
        if (statusIm.instanceColor) statusIm.instanceColor.needsUpdate = true;
        capIm.instanceMatrix.needsUpdate = true;
        if (capIm.instanceColor) capIm.instanceColor.needsUpdate = true;
        statusIm.frustumCulled = false; capIm.frustumCulled = false;
        this.scene.add(statusIm, capIm);
        this._owned.push(statusGeo, statusMat, statusIm, capGeo, capMat, capIm);
        this._instBar[type] = { statusIm, capIm };
      } else {
        // fire / ac / cylinder 等专用几何类型：保持原逐柜克隆，避免改动其专用模型。
        // 数量级很小（fire/ac/cylinder 合计通常 < 10 台），逐柜克隆的 draw call 可忽略。
        for (const rack of list) {
          const g = this._template(type, rack.devices).clone();
          g.position.set(rack.x, 0, rack.z);
          g.rotation.y = rack.rotationY || 0;
          g.traverse((o) => { o.userData.rackId = rack.id; });
          const barGeo = new THREE.BoxGeometry(Math.max(0.52, def.w * 0.92), 0.09, Math.max(0.06, def.d * 0.08));
          const barMat = new THREE.MeshBasicMaterial({ color: this._colorFor(rack) });
          this._owned.push(barGeo, barMat);
          const bar = new THREE.Mesh(barGeo, barMat);
          bar.position.set(0, def.h + 0.05, def.d / 2 - 0.04);
          bar.userData.rackId = rack.id;
          rack._statusMat = bar.material;
          g.add(bar);
          rack._frontPivot = g.getObjectByName('frontPivot') || null;
          rack._rearPivot = g.getObjectByName('rearPivot') || null;
          if (!rack._doorTarget) rack._doorTarget = { front: 0, rear: 0 };
          this.scene.add(g);
          this.groups.set(rack, g);
        }
      }
    }

    // 拾取代理：合并为单个 InstancedMesh（draw call N → 1）
    this._releaseProxy();
    this._proxyByIndex = [];
    this.proxies.clear();
    const n = this.racks.length;
    if (n > 0) {
      const inst = new THREE.InstancedMesh(this._proxyGeo, this._proxyMat, n);
      inst.name = 'rack-proxy';
      // 代理包围盒需覆盖整个机房：实例化对象的剔除球由各实例矩阵算出，
      // 但为避免边界情况下被误剔除导致"点了没反应"，直接关闭剔除
      // （它只有 1 次 draw call，剔除省不出任何东西）。
      inst.frustumCulled = false;
      this.racks.forEach((rack, i) => {
        const def = RACK[rack.type] || RACK.server;
        this._dummy.position.set(rack.x, def.h / 2, rack.z);
        this._dummy.rotation.set(0, rack.rotationY || 0, 0);
        this._dummy.scale.set(def.w, def.h, def.d);
        this._dummy.updateMatrix();
        inst.setMatrixAt(i, this._dummy.matrix);
        this._proxyByIndex[i] = rack;
        this.proxies.set(rack, i);
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      this.scene.add(inst);
      this._proxyInst = inst;
    }
      // T14/T18：重建每柜容量条与状态标牌
      this._buildRackMarkers();
    }

  /**
   * 释放上一次 build() 产生的、本系统独占的 GPU 资源。
   * 增删机柜 / loadFrom / clearAll 都会触发 build()，早期实现只 scene.remove 不 dispose，
   * 反复操作会持续泄漏几何与材质句柄（显存上涨、帧率下降）。
   * 不释放的内容（必须保留）：
   *   · _tplCache 模板及其 clone 共享的几何/材质
   *   · _proxyGeo / _proxyMat（构造函数创建，全实例共用）
   *   · 选中/悬停高亮线框
   */
  _releaseBuilt() {
    for (const res of this._owned) {
      if (res && typeof res.dispose === 'function') res.dispose();
    }
    this._owned = [];
  }

  // P2-5-3：释放本系统独占的共享纹理（编号标牌缓存、状态标牌单例）。
  // 与 scene 遍历释放互补，避免实例销毁后缓存仍持有已 dispose 的纹理。
  dispose() {
    if (this._idTexCache) {
      for (const t of this._idTexCache.values()) {
        try { if (t && typeof t.dispose === 'function') t.dispose(); } catch (_) { /* 忽略 */ }
      }
      this._idTexCache.clear();
    }
    if (this._billboardTex && typeof this._billboardTex.dispose === 'function') {
      try { this._billboardTex.dispose(); } catch (_) { /* 忽略 */ }
      this._billboardTex = null;
    }
  }

  _setMatrix(body, frame, rack) {
    const def = RACK[rack.type];
    this._dummy.position.set(rack.x, def.h / 2, rack.z);
    this._dummy.rotation.set(0, rack.rotationY || 0, 0);
    this._dummy.scale.set(1, 1, 1);
    this._dummy.updateMatrix();
    body.setMatrixAt(rack._idx, this._dummy.matrix);
    frame.setMatrixAt(rack._idx, this._dummy.matrix);
  }

  _colorFor(rack) {
    // 演示场景叙事预设（I-04）：故障演练优先以红点标记；高负载按密度偏红
    if (this.scenario === 'fault' && this._faultDemo && this._faultDemo.has(rack.id)) {
      return new THREE.Color(STATUS_COLOR_NUM.fault);
    }
    if (this.colorMode === 'temperature') return heat((rack.temp - 18) / (34 - 18));
    if (this.colorMode === 'density') return heat((rack.density - 20) / (100 - 20));
    if (this.colorMode === 'type') return new THREE.Color(RACK[rack.type].color);
    if (rack.status === 'fault') return new THREE.Color(STATUS_COLOR_NUM.fault);
    if (rack.status === 'warning') return new THREE.Color(STATUS_COLOR_NUM.warning);
    if (this.scenario === 'load') {
      const f = Math.min(1, Math.max(0, ((rack.density || 0) - 20) / 80));
      return heat(0.4 + f * 0.6);
    }
    return new THREE.Color(RACK[rack.type].color);
  }

  applyColors() {
    for (const rack of this.racks) {
      if (MODEL_BUILDERS[rack.type]) {
        if (rack._statusMat) rack._statusMat.color.copy(this._colorFor(rack));
        if (rack._statusBarIm) {
          rack._statusBarIm.setColorAt(rack._statusBarI, this._colorFor(rack));
          if (rack._statusBarIm.instanceColor) rack._statusBarIm.instanceColor.needsUpdate = true;
        }
        continue;
      }
      const m = this.meshes[rack.type];
      if (m) m.body.setColorAt(rack._idx, this._colorFor(rack));
    }
    for (const t in this.meshes) {
      if (this.meshes[t].body.instanceColor) this.meshes[t].body.instanceColor.needsUpdate = true;
    }
  }

  setColorMode(mode) { this.colorMode = mode; this.applyColors(); }

  // 演示场景叙事预设（I-04，纯可视化讲演，不涉及真实规范）：
  //  normal —— 恢复按当前着色模式本色
  //  load   —— 高密度机柜偏红，呈现"局部高负载"叙事
  //  fault  —— 按 id 可复现地挑约 8% 机柜作为"故障演练"红点
  applyScenario(name) {
    this.scenario = name || 'normal';
    this._faultDemo = new Set();
    if (this.scenario === 'fault') {
      for (const r of this.racks) {
        const id = r.id || '';
        let h = 0;
        for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
        if (((h % 100) + 100) % 100 < 8) this._faultDemo.add(id);
      }
    }
    this.applyColors();
    for (const r of this.racks) {
      if (r._billboard) r._billboard.material.color.copy(this._colorFor(r));
    }
  }

  // 实时告警映射（F1/B2）：后端告警事件 → 机柜状态，触发 3D 红色脉冲（C1）
  // level 与告警系统对齐：'critical' → fault（红），其余 → warning（黄）
  setAlert(rackId, level) {
    const rack = this.findById(rackId);
    if (!rack) return false;
    rack.status = level === 'critical' ? 'fault' : 'warning';
    this.applyColors();
    if (rack._billboard) rack._billboard.material.color.copy(this._statusColor(rack.status));
    return true;
  }

  // 告警解除（已处理/已恢复）：恢复机柜基准状态，脉冲在下一帧由 _pulsing 移除
  clearAlert(rackId) {
    const rack = this.findById(rackId);
    if (!rack) return false;
    rack.status = 'normal';
    this.applyColors();
    if (rack._billboard) rack._billboard.material.color.copy(this._statusColor(rack.status));
    return true;
  }

  // 状态 → 标牌颜色（与 themeTokens 单一真源一致）
  _statusColor(status) {
    if (status === 'fault') return new THREE.Color(STATUS_COLOR_NUM.fault);
    if (status === 'warning') return new THREE.Color(STATUS_COLOR_NUM.warning);
    return new THREE.Color(STATUS_COLOR_NUM.normal);
  }

  // 共享圆形标牌纹理（白色，叠加 SpriteMaterial.color 着色）
  _dotTexture() {
    if (this._billboardTex) return this._billboardTex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    x.beginPath();
    x.arc(32, 32, 28, 0, Math.PI * 2);
    x.fillStyle = '#ffffff';
    x.fill();
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAnisotropy();
    this._billboardTex = t;
    return t;
  }

  // 机柜编号文字标牌纹理（半透明底板 + 白色编号，永远朝向相机，漫游时可辨读）。
  // 关键：按实际文字宽度自适应画布尺寸，保证编号完整显示、不被裁切
  // （原固定 256×64 在编号较长时会被截断，表现为"部分字符缺失"）。
  _idTexture(id) {
    const key = String(id || '');
    // P2-5-3：按 id 复用同一编号标牌纹理，命中直接返回（标牌颜色由 SpriteMaterial.color 体现，纹理本身不含状态色）
    if (this._idTexCache.has(key)) return this._idTexCache.get(key);
    const text = String(id || '');
    const fontPx = 38, padX = 24, padY = 14;
    const c = document.createElement('canvas');
    let x = c.getContext('2d');
    x.font = `bold ${fontPx}px "Segoe UI", system-ui, sans-serif`;
    const textW = Math.max(1, Math.ceil(x.measureText(text).width));
    const W = textW + padX * 2, H = fontPx + padY * 2;
    c.width = W; c.height = H;
    x = c.getContext('2d'); // 重置尺寸后上下文状态清空，须重设
    x.font = `bold ${fontPx}px "Segoe UI", system-ui, sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = 'rgba(8,14,22,0.74)';
    const r = 14;
    x.beginPath();
    x.moveTo(r, 0); x.arcTo(W, 0, W, H, r); x.arcTo(W, H, 0, H, r);
    x.arcTo(0, H, 0, 0, r); x.arcTo(0, 0, W, 0, r); x.closePath(); x.fill();
    x.strokeStyle = 'rgba(34, 211, 238, 0.55)'; x.lineWidth = 3; x.stroke();
    x.fillStyle = '#eaf6ff';
    x.fillText(text, W / 2, H / 2 + 2);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    t.minFilter = THREE.LinearFilter;
    t._aspect = W / H; // 供 sprite 按真实宽高比缩放，避免文字被拉伸/裁切
    this._idTexCache.set(key, t);
    return t;
  }

  // 设置相机引用（供 C2 LOD 按距离淡出/隐藏标牌）
  // viewH：返回画布 CSS 像素高度的函数。LOD 阈值按「屏幕像素尺寸」反算，
  // 必须知道视口高度；缺省时退化为兜底值（见 LOD_FALLBACK_PX_PER_M）。
  setCamera(cam, viewH) {
    if (cam) this._camera = cam;
    this._viewH = typeof viewH === 'function' ? viewH : null;
  }

  // 设置墙体布局 / 房间尺寸获取器（供开门受阻判定，见 _doorMaxAngle）
  // 传函数而非快照：墙体在阶段②可随时改建，机柜不需要重建即可跟随。
  setWalls(getLayout, getDims) {
    this._getWalls = typeof getLayout === 'function' ? getLayout : null;
    this._getDims = typeof getDims === 'function' ? getDims : null;
  }

  // T14/T18：为每台机柜生成「柜门正面 U 位容量条」+「柜顶状态标牌」
  // 容量条 = 已用 U / 标准 42U（热力着色）；标牌 = 永远朝向相机的状态色圆点，远景可辨。
  _buildRackMarkers() {
    const tex = this._dotTexture();
    for (const rack of this.racks) {
      const def = RACK[rack.type];
      if (!def) continue;
      // T14：U 位容量条（柜门正面下沿）——server 已用实例化容量条覆盖，跳过逐柜网格
      if (!rack._capBarInstanced) {
        const devs = Array.isArray(rack.devices) ? rack.devices : [];
        const usedU = devs.reduce((s, d) => s + (Number(d.h) || 0), 0);
        const frac = Math.max(0, Math.min(1, usedU / 42));
        const barW = Math.max(0.02, def.w * 0.8 * frac);
        const barGeo = new THREE.BoxGeometry(barW, 0.06, 0.04);
        const barMat = new THREE.MeshBasicMaterial({ color: heat(frac) });
        const bar = new THREE.Mesh(barGeo, barMat);
        bar.position.set(rack.x - (def.w * 0.8) / 2 + barW / 2, 0.15, rack.z + def.d / 2 + 0.02);
        bar.userData.rackId = rack.id;
        this.scene.add(bar);
        this._owned.push(barGeo, barMat);
        this._extra.push(bar);
        rack._capBar = bar;
      }

      // T18：柜顶状态标牌（Sprite 永远朝向相机，远景可辨）
      const sMat = new THREE.SpriteMaterial({
        map: tex, color: this._statusColor(rack.status),
        transparent: true, depthWrite: false, sizeAttenuation: true,
      });
      const sprite = new THREE.Sprite(sMat);
      sprite.scale.set(0.5, 0.5, 0.5);
      sprite.position.set(rack.x, def.h + 0.45, rack.z);
      sprite.userData.rackId = rack.id;
      this.scene.add(sprite);
      this._owned.push(sMat); // 纹理共享，仅材质入账释放
      this._extra.push(sprite);
      rack._billboard = sprite;

      // 编号标签：永远朝向相机的文字标牌（depthTest 关闭 → 不背柜体遮挡，漫游可读出 RK 编号）。
      // 按文字真实宽高比设置 sprite 缩放，确保编号完整、不变形、不裁切。
      const idTex = this._idTexture(rack.id);
      const idMat = new THREE.SpriteMaterial({
        map: idTex, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: true,
      });
      const idSprite = new THREE.Sprite(idMat);
      const labelH = Math.max(0.22, def.w * 0.34);
      idSprite.scale.set(labelH * (idTex._aspect || 4), labelH, 1);
      idSprite.position.set(rack.x, def.h + 0.98, rack.z);
      idSprite.userData.rackId = rack.id;
      idSprite.renderOrder = 5;
      this.scene.add(idSprite);
      this._owned.push(idMat); // 编号标牌纹理来自 this._idTexCache 共享缓存，不在此处 dispose
      this._extra.push(idSprite);
      rack._idLabel = idSprite;
      // 记录该柜编号标牌的世界高度：LOD 反算「多远处字号读不清」要用到。
      // 柜宽不同（灭火器 0.3m vs 空调/七氟丙烷柜 0.61/0.64m）字号下限/上限不同，阈值也不同。
      rack._labelH = labelH;
    }
  }

  // 射线检测走实例化代理（1 次 draw call 覆盖全部设备）；命中后用 instanceId 反查
  bodies() { return this._proxyInst ? [this._proxyInst] : []; }

  /** 释放实例化代理（几何与材质为构造函数级共享资源，不在此释放） */
  _releaseProxy() {
    if (this._proxyInst) {
      this.scene.remove(this._proxyInst);
      this._proxyInst.dispose();
      this._proxyInst = null;
    }
    this._proxyByIndex = [];
    this.proxies.clear();
  }

  fromIntersection(hit) {
    if (!hit) return null;
    const o = hit.object;
    // 实例化代理：instanceId 即设备索引
    if (o === this._proxyInst && hit.instanceId != null) {
      return this._proxyByIndex[hit.instanceId] || null;
    }
    // 直接命中精细模型 Group：沿父链找 rackId
    let p = o;
    while (p) {
      if (p.userData && p.userData.rackId) return this.byId.get(p.userData.rackId) || null;
      p = p.parent;
    }
    // 实例化柜体（power/ups/rpp/odf/... 等占位方块类型）：type#instanceId
    // 注：ac / cylinder / fire 已升级为精细模型，不再出现在 lookup 中
    return this.lookup.get(`${o.userData && o.userData.type}#${hit.instanceId}`) || null;
  }

  // ---- 高亮（选中 / 悬停）----
  // 整改（设计 P1-B）：选中/悬停原为硬编码 0xffe14d / 0x7df9ff，
  // 而 themeTokens.js 已定义 SELECTED(#FFD60A)/HOVER(#FFFFFF) 却无任何引用。
  // 现改为从 token 取色，使「选中=哪个颜色」在全工程只有一处可改。
  //
  // 多选整改：选中高亮从「一个 selMesh」改为「线框池」——
  //   · _hlMap  rack -> LineSegments（当前选中的每台各一个）
  //   · _hlFree 空闲线框复用池（避免加选/取消时反复 new + scene.add）
  //   · 几何（_hlEdges）全池共享；材质必须各自独立：
  //     _flashReject 会改单台的 color 表示「被拒绝」，共享材质会连带染红整组。
  _buildHighlight() {
    this._hlEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this._hlMap = new Map();
    this._hlFree = [];

    this.hovMesh = new THREE.LineSegments(
      this._hlEdges.clone(), new THREE.LineBasicMaterial({ color: HOVER_NUM, transparent: true, opacity: 0.85 }),
    );
    this.hovMesh.visible = false;
    this.scene.add(this.hovMesh);
  }

  /** 取一个空闲选中线框（池空则新建）。返回的线框 visible=true，需调用方摆放 */
  _takeHl() {
    let m = this._hlFree.pop();
    if (!m) {
      m = new THREE.LineSegments(
        this._hlEdges, new THREE.LineBasicMaterial({ color: SELECTED_NUM }),
      );
      this.scene.add(m);
    }
    m.visible = true;
    return m;
  }

  /** 该机柜当前的选中线框（无则 null） */
  _hlFor(rack) { return this._hlMap.get(rack) || null; }

  /** 把线框池同步到 _selSet：取消的收回复用，新增的取池摆放 */
  _syncHighlights() {
    for (const [rack, m] of this._hlMap) {
      if (!this._selSet.has(rack)) {
        this._hlMap.delete(rack);
        m.visible = false;
        this._hlFree.push(m);
      }
    }
    for (const rack of this._selSet) {
      if (this._hlMap.has(rack)) continue;
      const m = this._takeHl();
      this._placeHighlight(m, rack);
      this._hlMap.set(rack, m);
    }
  }

  /** 从选集移除一批（删除 / 撤销放置后调用），主选中让位并同步高亮与回调 */
  _dropFromSelection(list) {
    let changed = false;
    for (const r of list) if (this._selSet.delete(r)) changed = true;
    if (this.selected && list.indexOf(this.selected) >= 0) {
      this.selected = this._selSet.values().next().value || null;
      changed = true;
    }
    if (changed) {
      this._syncHighlights();
      if (this.onSelect) this.onSelect(this.selected);
    }
  }

  _placeHighlight(mesh, rack, scale = 1.02) {
    const def = RACK[rack.type];
    mesh.position.set(rack.x, def.h / 2, rack.z);
    mesh.rotation.set(0, rack.rotationY || 0, 0);
    // 描边线框贴近柜体（1.02 倍），避免过大的线框遮挡机柜与柜内设备
    mesh.scale.set(def.w * scale, def.h * scale, def.d * scale);
  }

  // ---- 选择（单选 / 多选）----
  /**
   * 单选：清空多选集，只选 rack（null = 全部取消）。
   * 点击空白处、检查器定位、撤销回退后的默认态都走这里。
   */
  setSelected(rack) {
    this._selSet = rack ? new Set([rack]) : new Set();
    this.selected = rack || null;
    this._syncHighlights();
    // T17：3D 选中 → 通知宿主（Vue 侧高亮对应 2D 告警项）
    if (this.onSelect) this.onSelect(this.selected);
  }

  /**
   * 加选 / 减选（Shift 或 Ctrl 点击）。返回操作后的选中数量。
   * 主选中始终是「最后一次点到的机柜」，取消主选中时让位给集内其他成员。
   */
  toggleSelected(rack) {
    if (!rack) return this._selSet.size;
    if (this._selSet.has(rack)) {
      this._selSet.delete(rack);
      if (this.selected === rack) {
        this.selected = this._selSet.values().next().value || null;
      }
    } else {
      this._selSet.add(rack);
      this.selected = rack;
    }
    this._syncHighlights();
    if (this.onSelect) this.onSelect(this.selected);
    return this._selSet.size;
  }

  /** 全选（可限定类型，如只选服务器柜）。返回选中数量；空机房清空并返回 0 */
  selectAll(type = null) {
    const list = type ? this.racks.filter((r) => r.type === type) : this.racks.slice();
    this._selSet = new Set(list);
    this.selected = list.length ? list[list.length - 1] : null;
    this._syncHighlights();
    if (this.onSelect) this.onSelect(this.selected);
    return list.length;
  }

  /** 当前多选集（数组）。选中数量 > 1 时各批量操作都以它为目标 */
  get selectedRacks() { return [...this._selSet]; }

  setHovered(rack) {
    this.hovered = rack;
    // 悬停线与选中线会互相叠住：已选中的不再画悬停描边
    if (rack && !this._selSet.has(rack)) { this._placeHighlight(this.hovMesh, rack, 1.04); this.hovMesh.visible = true; }
    else this.hovMesh.visible = false;
  }

  // ---- 自由摆放 ----
  // 旋转感知的半占距（旋转按 90° 步进）
  _halfExtents(rack) {
    const def = RACK[rack.type];
    const quarter = Math.round((rack.rotationY || 0) / (Math.PI / 2));
    const swapped = ((quarter % 2) + 2) % 2 === 1;
    return {
      hx: (swapped ? def.d : def.w) / 2 + 0.05,
      hz: (swapped ? def.w : def.d) / 2 + 0.05,
    };
  }

  updateRackMatrix(rack) {
    // 同步实例化代理的该实例矩阵（原为逐个 Mesh 的 position/rotation）
    const idx = this.proxies.get(rack);
    if (idx != null && this._proxyInst) {
      const def = RACK[rack.type] || RACK.server;
      this._dummy.position.set(rack.x, def.h / 2, rack.z);
      this._dummy.rotation.set(0, rack.rotationY || 0, 0);
      this._dummy.scale.set(def.w, def.h, def.d);
      this._dummy.updateMatrix();
      this._proxyInst.setMatrixAt(idx, this._dummy.matrix);
      this._proxyInst.instanceMatrix.needsUpdate = true;
    }
    if (MODEL_BUILDERS[rack.type]) {
      const g = this.groups.get(rack);
      if (g) {
        g.position.set(rack.x, 0, rack.z);
        g.rotation.y = rack.rotationY || 0;
      }
      // 多选：该柜在选集里就同步它的线框（组内任一台移动，描边都要跟着走）
      const hl = this._hlFor(rack);
      if (hl) this._placeHighlight(hl, rack);
      return;
    }
    const m = this.meshes[rack.type];
    if (!m) return;
    this._setMatrix(m.body, m.frame, rack);
    m.body.instanceMatrix.needsUpdate = true;
    m.frame.instanceMatrix.needsUpdate = true;
    const hl = this._hlFor(rack);
    if (hl) this._placeHighlight(hl, rack);
  }

  // 移动到指定坐标（自动钳位在房间内）。
  // 注意：这是「内部路径」——不吸附、不拒绝重叠，供 clampAll（房间缩小后整体归位）、
  // resolveOverlaps（成对推开）、loadFrom（读档还原）使用。
  // 用户驱动的摆放请走 tryPlace()，两者刻意分开，避免房间缩小时整批机柜
  // 因「拒绝重叠」而无法被推回房间内。
  moveTo(rack, x, z, dims) {
    const { hx, hz } = this._halfExtents(rack);
    rack.x = Math.max(-dims.width / 2 + hx, Math.min(dims.width / 2 - hx, x));
    rack.z = Math.max(-dims.depth / 2 + hz, Math.min(dims.depth / 2 - hz, z));
    this.updateRackMatrix(rack);
  }

  /**
   * 用户驱动的摆放入口（拖拽落点 / 键盘微调 / 检查器移动）。
   * 与内部 moveTo 的两点区别：
   *   ① 0.1m 网格吸附 —— 让机柜排对齐、坐标干净（原为连续浮点，肉眼与批量摆放都难对齐）；
   *   ② 拒绝穿透   —— 复用 _overlapsAny，落点与已有机柜重叠时保持原位、红色闪烁并
   *                   返回 false，由调用方 toast 提示（原实现仅做房间边界钳制，
   *                   机柜可互相穿透叠放并原样持久化）。
   * @returns {boolean} true=已落位；false=被拒绝（位置未变）
   */
  tryPlace(rack, x, z, dims, step = 0.1) {
    const { hx, hz } = this._halfExtents(rack);
    const snap = (v) => Math.round(v / step) * step;
    // 先吸附再钳位：保证吸附结果不越界
    const nx = Math.max(-dims.width / 2 + hx, Math.min(dims.width / 2 - hx, snap(x)));
    const nz = Math.max(-dims.depth / 2 + hz, Math.min(dims.depth / 2 - hz, snap(z)));
    // 吸附/钳位后位置未变 → 直接放行；这也顺带规避了「与自身旧位比较」的误判
    if (nx === rack.x && nz === rack.z) return true;
    // skip=rack：排除自身，用副本探测，避免把机柜与自己的旧位置判为重叠
    if (this._overlapsAny({ ...rack, x: nx, z: nz }, dims, rack)) {
      this._flashReject(rack);
      return false;
    }
    const px = rack.x, pz = rack.z;
    rack.x = nx;
    rack.z = nz;
    this._closeDoors(rack);
    this.updateRackMatrix(rack);
    this.pushHistory({
      label: `移动 ${rack.id}`,
      undo: () => { rack.x = px; rack.z = pz; this.updateRackMatrix(rack); },
      redo: () => { rack.x = nx; rack.z = nz; this.updateRackMatrix(rack); },
    }, rack.id, 'move');
    return true;
  }

  // 摆放/旋转被拒时的红色闪烁反馈：选中线框临时变红并强制可见，600ms 后恢复。
  // 仅改 LineBasicMaterial.color（纯 CPU 侧 Vector3 赋值，无 GL 调用），
  // 即使定时器触发时场景已 dispose 也不会抛错。
  // 多选整改：闪烁载体从固定的 selMesh 改为「该柜自己的线框」；
  // 机柜未选中时（理论上不会发生：拖动/微调前必先选中）临时借一个，
  // 闪完即还，避免为一次拒绝反馈常驻一个线框。
  _flashReject(rack) {
    let m = this._hlFor(rack);
    let borrowed = false;
    if (!m) { m = this._takeHl(); borrowed = true; }
    if (!m || !m.material) return;
    this._placeHighlight(m, rack);
    m.visible = true;
    m.material.color.set(REJECT_NUM);
    clearTimeout(this._rejectTimer);
    this._rejectTimer = setTimeout(() => {
      m.material.color.set(SELECTED_NUM);
      // 恢复由选中态决定显隐，不抢占悬停高亮
      m.visible = borrowed ? false : this._hlMap.has(rack);
      if (borrowed) { this.scene.remove(m); this._hlFree.push(m); }
    }, 600);
  }

  // 旋转 90°（旋转后重新钳位，防止 footprint 变化越界）
  rotate(rack, dims, step = 90) {
    const prev = rack.rotationY || 0;
    const prevX = rack.x, prevZ = rack.z;
    rack.rotationY = prev + (step * Math.PI) / 180;
    if (dims) {
      const { hx, hz } = this._halfExtents(rack);
      rack.x = Math.max(-dims.width / 2 + hx, Math.min(dims.width / 2 - hx, rack.x));
      rack.z = Math.max(-dims.depth / 2 + hz, Math.min(dims.depth / 2 - hz, rack.z));
    }
    // 旋转使 footprint 互换，可能与邻柜穿透 → 拒绝并完整回滚（朝向与坐标都还原），
    // 避免「转一下就叠进隔壁柜」并原样落盘。返回 false 供调用方提示。
    if (this._overlapsAny(rack, dims)) {
      rack.rotationY = prev;
      if (dims) {
        const { hx, hz } = this._halfExtents(rack);
        rack.x = Math.max(-dims.width / 2 + hx, Math.min(dims.width / 2 - hx, rack.x));
        rack.z = Math.max(-dims.depth / 2 + hz, Math.min(dims.depth / 2 - hz, rack.z));
      }
      this._flashReject(rack);
      this.updateRackMatrix(rack);
      return false;
    }
    const now = { r: rack.rotationY, x: rack.x, z: rack.z };
    this._closeDoors(rack);
    this.updateRackMatrix(rack);
    this.pushHistory({
      label: `旋转 ${rack.id}`,
      undo: () => { rack.rotationY = prev; rack.x = prevX; rack.z = prevZ; this.updateRackMatrix(rack); },
      redo: () => { rack.rotationY = now.r; rack.x = now.x; rack.z = now.z; this.updateRackMatrix(rack); },
    }, rack.id, 'rotate');
    return true;
  }

  // ---- 多选批量操作 ----
  // 三个批量入口共用同一套约定：
  //   ① 目标 = selectedRacks（main.js 传入），与单选操作同权限闸门（locked 禁写）；
  //   ② 整组只记「一步」历史 —— 用户意图是「刚才那批柜摆错了」，不是逐台回退；
  //   ③ tag 形如 'multi:id,id'，配合 pushHistory 的 700ms 合并，
  //      连按方向键 / 连按 R 不会把 60 步撤销栈一次灌满。

  /**
   * 批量平移：整组按同一 delta 移动。
   * 全组成功或全组回滚，不做部分成功 —— 否则一次按键会把一组柜拆散，
   * 且「为什么只动了三台」无法解释。任一台落点与组外机柜重叠即整组被拒。
   *
   * 吸附对象是 **delta 而不是每台的绝对坐标**：若逐台 snap(x+dx)，
   * 0.72m 间距的一排柜会被各自吸向 0.7/1.4，一次平移就把队列揉歪；
   * 吸 delta 则整组严格平移，组内相对位置一位不差（仅在贴墙钳位时才可能压缩）。
   * @returns {number} 成功移动台数（0 = 整组被拒，位置未变）
   */
  tryPlaceMany(list, dx, dz, dims, step = 0.1) {
    const moveSet = new Set()
    for (const r of list) if (this.racks.indexOf(r) >= 0) moveSet.add(r)
    if (!moveSet.size) return 0
    for (const r of moveSet) this._closeDoors(r) // 组移动前先关门，避免门板随柜漂移
    const snap = (v) => Math.round(v / step) * step
    const sdx = snap(dx), sdz = snap(dz)
    const before = [...moveSet].map((r) => ({ r, x: r.x, z: r.z }))
    const clampTo = (r, nx, nz) => {
      const { hx, hz } = this._halfExtents(r)
      return [
        Math.max(-dims.width / 2 + hx, Math.min(dims.width / 2 - hx, nx)),
        Math.max(-dims.depth / 2 + hz, Math.min(dims.depth / 2 - hz, nz)),
      ]
    }
    for (const b of before) {
      const [nx, nz] = clampTo(b.r, b.x + sdx, b.z + sdz)
      b.r.x = nx; b.r.z = nz
    }
    // 组内相对位置不变，只可能与组外静态柜冲突；skipSet 让组内成员互不阻挡
    let blocker = null
    for (const r of moveSet) {
      if (this._overlapsAny(r, dims, null, moveSet)) { blocker = r; break }
    }
    if (blocker) {
      for (const b of before) { b.r.x = b.x; b.r.z = b.z }
      for (const b of before) this.updateRackMatrix(b.r)
      // 闪的是「挡住的那台」，而不是被拖的组 —— 用户需要知道撞的是谁
      this._flashReject(blocker)
      return 0
    }
    for (const b of before) this.updateRackMatrix(b.r)
    const ids = before.map((b) => b.r.id).join(',')
    this.pushHistory({
      label: `移动 ${moveSet.size} 台`,
      undo: () => {
        for (const b of before) { b.r.x = b.x; b.r.z = b.z; this.updateRackMatrix(b.r) }
      },
      redo: () => {
        for (const b of before) {
          const [nx, nz] = clampTo(b.r, b.x + sdx, b.z + sdz)
          b.r.x = nx; b.r.z = nz
          this.updateRackMatrix(b.r)
        }
      },
    }, 'multi:' + ids, 'move')
    return moveSet.size
  }

  /**
   * 批量旋转：逐台依次尝试，与「手动连按 R」的结果完全一致
   * （先转的那台可能挡住后转的，被挡的保持原朝向并闪烁一次）。
   * @returns {number} 成功旋转台数
   */
  rotateMany(list, dims, step = 90) {
    const moving = [];
    for (const r of list) if (this.racks.indexOf(r) >= 0) moving.push(r);
    if (!moving.length) return 0;
    for (const r of moving) this._closeDoors(r) // 逐台旋转前先关门，避免门板随柜转向穿模
    const before = moving.map((r) => ({ r, rot: r.rotationY || 0, x: r.x, z: r.z }));
    const after = [];
    for (const r of moving) {
      const prevRot = r.rotationY || 0;
      const px = r.x, pz = r.z;
      r.rotationY = prevRot + (step * Math.PI) / 180;
      if (dims) {
        const { hx, hz } = this._halfExtents(r);
        r.x = Math.max(-dims.width / 2 + hx, Math.min(dims.width / 2 - hx, r.x));
        r.z = Math.max(-dims.depth / 2 + hz, Math.min(dims.depth / 2 - hz, r.z));
      }
      if (this._overlapsAny(r, dims)) {
        r.rotationY = prevRot;
        if (dims) {
          const { hx, hz } = this._halfExtents(r);
          r.x = Math.max(-dims.width / 2 + hx, Math.min(dims.width / 2 - hx, px));
          r.z = Math.max(-dims.depth / 2 + hz, Math.min(dims.depth / 2 - hz, pz));
        }
        this._flashReject(r);
        continue;
      }
      after.push({ r, rot: r.rotationY, x: r.x, z: r.z });
    }
    if (!after.length) return 0;
    for (const b of before) this.updateRackMatrix(b.r);
    this.pushHistory({
      label: `旋转 ${after.length} 台`,
      undo: () => {
        for (const b of before) { b.r.rotationY = b.rot; b.r.x = b.x; b.r.z = b.z; this.updateRackMatrix(b.r); }
      },
      redo: () => {
        for (const a of after) { a.r.rotationY = a.rot; a.r.x = a.x; a.r.z = a.z; this.updateRackMatrix(a.r); }
      },
    }, 'multi:' + before.map((b) => b.r.id).join(','), 'rotate');
    return after.length;
  }

  /**
   * 批量删除：一步历史，撤销时连同当时的选中集一起还原
   * （删完发现删错了，Ctrl+Z 之后那批柜应该还是选中态，而不是散光）。
   * @returns {number} 实际删除台数
   */
  removeMany(list) {
    const drop = new Set();
    for (const r of list) if (this.racks.indexOf(r) >= 0) drop.add(r);
    if (!drop.size) return 0;
    const snapshot = this.racks.slice();
    const selBefore = new Set(this._selSet);
    const primary = this.selected;
    this.racks = this.racks.filter((r) => !drop.has(r));
    this._dropFromSelection([...drop]);
    this.build();
    this.pushHistory({
      label: `删除 ${drop.size} 台机柜`,
      undo: () => {
        this.racks = snapshot.slice();
        this._selSet = new Set(selBefore);
        this.selected = primary;
        this._syncHighlights();
        this.build();
        if (this.onSelect) this.onSelect(this.selected);
      },
      redo: () => {
        this.racks = this.racks.filter((r) => !drop.has(r));
        this._dropFromSelection([...drop]);
        this.build();
      },
    }, 'multi:' + [...drop].map((r) => r.id).join(','), 'remove');
    return drop.size;
  }

  /**
   * 重叠探测。
   * @param {Object|null} skip    单个豁免对象（自身旧位，见 tryPlace）
   * @param {Set|null}   skipSet 整组豁免（批量平移/旋转时组内成员互不阻挡）
   */
  _overlapsAny(rack, dims, skip = null, skipSet = null) {
    const a = this._halfExtents(rack);
    for (const other of this.racks) {
      if (other === rack || other === skip) continue;
      if (skipSet && skipSet.has(other)) continue;
      const b = this._halfExtents(other);
      const dx = Math.abs(rack.x - other.x);
      const dz = Math.abs(rack.z - other.z);
      if (dx < a.hx + b.hx - 0.05 && dz < a.hz + b.hz - 0.05) return true;
    }
    return false;
  }

  // 新增设备：从房间中心螺旋外扩寻找第一个无重叠的位置
  add(type, dims) {
    if (!RACK[type]) return null;
    const step = 1.0;
    const probe = { type, rotationY: 0 };
    for (let ring = 0; ring < Math.max(dims.width, dims.depth); ring += step) {
      const cand = ring === 0
        ? [[0, 0]]
        : [[-ring, 0], [ring, 0], [0, -ring], [0, ring],
           [-ring, -ring], [ring, -ring], [-ring, ring], [ring, ring]];
      for (const [x, z] of cand) {
        probe.x = x; probe.z = z;
        const { hx, hz } = this._halfExtents(probe);
        if (Math.abs(x) + hx > dims.width / 2 || Math.abs(z) + hz > dims.depth / 2) continue;
        if (this._overlapsAny({ ...probe, x, z }, dims)) continue;
        const devices = type === 'server' ? genCabinetDevices(Math.random) : null;
        const density = 40 + Math.floor(Math.random() * 40);
        const power = Math.round(2 + (Math.min(100, density) / 100) * 4);
        const rack = {
          id: this._nextId(), type, x, z, rotationY: 0,
          // 整改 G-HVAC-12（补漏）：此前写死 22+随机×8，与启动期 rackInletTemp 的
          // 确定性推导并行存在两套口径——启动生成的柜按真实负荷模型、手动新增的
          // 柜按随机数，温度着色与超温告警因此互相矛盾。服务器柜统一走注入模型。
          temp: (type === 'server' && this.inletTempFn)
            ? this.inletTempFn(power)
            : 22 + Math.floor(Math.random() * 8),
          density,
          humidity: 42 + Math.floor(Math.random() * 12),
          power,
          // 整改 G-HVAC-01：空调机组记录单台制冷量（工程惯用量级 kW，供容量核算）
          coolingKW: type === 'ac' ? AC_UNIT_COOLING_KW : undefined,
          status: type === 'server' ? deriveCabinetStatus(devices) : 'normal',
          devices,
        };
        this.racks.push(rack);
        this.build();
        this.pushHistory({
          label: `放置 ${rack.id}`,
          undo: () => { this._spliceOut(rack); this.build(); },
          redo: () => { this.racks.push(rack); this.build(); },
        }, rack.id, 'add');
        return rack;
      }
    }
    return null;
  }

  // 批量摆放：一列/两列机柜（沿 Z 排开，列间留 1.3m 冷热通道，相对而立）
  addBatch(kind, p, dims) {
    const n = Math.max(2, Math.min(14, Math.floor((dims.depth - 2) / 1.1)));
    const gap = 0.72; // 0.6 宽 + 0.12 间隙
    const made = [];
    const tryAdd = (x, z, rotY) => {
      const probe = { type: 'server', x, z, rotationY: rotY };
      const { hx, hz } = this._halfExtents(probe);
      if (Math.abs(x) + hx > dims.width / 2 || Math.abs(z) + hz > dims.depth / 2) return;
      if (this._overlapsAny(probe, dims)) return;
      const devices = genCabinetDevices(Math.random);
      const density = 40 + Math.floor(Math.random() * 40);
      const power = Math.round(2 + (Math.min(100, density) / 100) * 4);
      const rack = {
        id: this._nextId(), type: 'server', x, z, rotationY: rotY,
        // 同单点摆放：批量新增也必须走真实进风温度模型（口径统一）
        temp: this.inletTempFn ? this.inletTempFn(power) : 22 + Math.floor(Math.random() * 8),
        density,
        humidity: 42 + Math.floor(Math.random() * 12),
        // 整改 G-PWR-03：批量摆放曾漏设 power，导致大屏显示 0 kW
        power,
        status: deriveCabinetStatus(devices),
        devices,
      };
      this.racks.push(rack);
      made.push(rack);
    };
    const z0 = p.z - ((n - 1) * gap) / 2;
    for (let i = 0; i < n; i++) tryAdd(p.x, z0 + i * gap, Math.PI / 2);          // 面朝 +X
    if (kind === 'col2') {
      const x2 = p.x + 2.3; // 柜深 1.0 + 通道 1.3
      for (let i = 0; i < n; i++) tryAdd(x2, z0 + i * gap, -Math.PI / 2);        // 面朝 -X
    }
    this.build();
    // 一批 14 台算「一步」：逐个登记会让撤销一次只退回一台，
    // 而用户的意图是「刚才那一列摆错了，整列撤掉」。
    if (made.length) {
      const drop = new Set(made);
      this.pushHistory({
        label: `批量摆放 ${made.length} 台`,
        undo: () => {
          this.racks = this.racks.filter((r) => !drop.has(r));
          // 多选：撤销整批放置时，被放回选集里的柜也要一并收回描边
          this._dropFromSelection(made);
          this.build();
        },
        redo: () => { for (const r of made) this.racks.push(r); this.build(); },
      }, 'batch:' + made.map((r) => r.id).join(','), 'addBatch');
    }
    return made;
  }

  // ---- 门板开合（机房视图，自适应角度 + 精确碰撞） ----
  DOOR_ANGLE = 1.745;     // 100°：门板完全展开目标角
  DOOR_MIN_OPEN = 0.21;   // ≈12°：小于此角度视为被阻挡（仅能裂一条缝无意义）
  DOOR_CLEAR = 0.04;      // 门板半厚留白（与原 t 一致），用于线段-AABB 膨胀

  /**
   * 2D XZ 线段 vs 轴对齐矩形（盒子已按 clearance 预膨胀）。Liang-Barsky 裁剪法。
   * 门板是「从铰链扫出的一条细杆」，用整块包围盒会严重高估占位——
   * 这正是旧实现把相邻密排机柜判为「被阻挡、柜门无法打开」的根因。
   */
  _segHitsAABB(x0, z0, x1, z1, b) {
    const dx = x1 - x0, dz = z1 - z0;
    let t0 = 0, t1 = 1;
    const P = [-dx, dx, -dz, dz];
    const Q = [x0 - b.minX, b.maxX - x0, z0 - b.minZ, b.maxZ - z0];
    for (let i = 0; i < 4; i++) {
      if (P[i] === 0) { if (Q[i] < 0) return false; }
      else {
        const r = Q[i] / P[i];
        if (P[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
        else { if (r < t0) return false; if (r < t1) t1 = r; }
      }
    }
    return t0 <= t1;
  }

  /**
   * 计算门板在不碰撞任何机柜/墙体前提下能开到的最大角度（0..DOOR_ANGLE，弧度）。
   * 沿开门弧线分 16 段采样：逐段用「线段 vs 预膨胀 AABB」精确判定，
   * 取「整段弧线均不碰撞」的最大角度——既物理正确，又支持自适应部分开启
   * （空间狭小时开到能开的极限角，而非一概拒绝）。
   */
  _doorMaxAngle(rack, which) {
    const def = RACK[rack.type];
    const front = which === 'front';
    const hx = -(def.w / 2 - 0.006);
    const hz = (front ? 1 : -1) * (def.d / 2 - 0.004);
    const L = def.w - 0.012;
    const dir = front ? -1 : 1; // a 的符号（前门负、后门正）
    const cos = Math.cos(rack.rotationY || 0), sin = Math.sin(rack.rotationY || 0);
    const toWorld = (x, z) => [rack.x + x * cos + z * sin, rack.z - x * sin + z * cos];
    const [whx, whz] = toWorld(hx, hz);
    const c = this.DOOR_CLEAR;
    const obstacles = [];
    for (const other of this.racks) {
      if (other === rack) continue;
      const e = this._halfExtents(other);
      obstacles.push({ minX: other.x - e.hx, maxX: other.x + e.hx, minZ: other.z - e.hz, maxZ: other.z + e.hz });
    }
    for (const s of this._wallSolids()) obstacles.push(s);
    const N = 16;
    const step = this.DOOR_ANGLE / N;
    let maxA = 0;
    for (let i = 1; i <= N; i++) {
      const a = dir * step * i;
      const tx = hx + L * Math.cos(a);
      const tz = hz - L * Math.sin(a);
      const [wtx, wtz] = toWorld(tx, tz);
      let hit = false;
      for (const b of obstacles) {
        const eb = { minX: b.minX - c, maxX: b.maxX + c, minZ: b.minZ - c, maxZ: b.maxZ + c };
        if (this._segHitsAABB(whx, whz, wtx, wtz, eb)) { hit = true; break; }
      }
      if (hit) break;
      maxA = step * i;
    }
    return maxA; // 弧度；遇阻即停在前一采样角
  }

  /**
   * 墙体实心区间（世界坐标 AABB 列表，仅 XZ 平面）。
   *
   * 为什么需要：门板是向外扫开的。机柜被贴墙摆放时（clampAll 允许柜体与墙内表面
   * 齐平），门板扫过的区域必然落到墙体里——旧实现只判「机柜互撞」，
   * 结果是门板穿墙而出（视觉穿模），且用户得不到任何提示。
   *
   * 几何依据 room.js buildWallMesh 的摆放约定：
   *   back  z ∈ [-D/2-t, -D/2]    front z ∈ [D/2, D/2+t]
   *   left  x ∈ [-W/2-t, -W/2]    right x ∈ [W/2, W/2+t]
   * 沿墙长方向按「通高门洞」挖出开口区间；窗与非通高门洞不挖——机柜高度通常
   * 超过窗台，保守判阻优于穿模。四角由左右墙覆盖，故 back/front 只取 [-L/2, L/2]。
   *
   * 只在 toggleDoor（用户点击）时计算一次，不在每帧路径上。
   */
  _wallSolids() {
    const layout = this._getWalls && this._getWalls();
    const dims = this._getDims && this._getDims();
    if (!layout || !dims) return [];
    const W = dims.width, D = dims.depth;
    const solids = [];

    // 沿墙长方向切出实心区间（挖除通高门洞）
    const segsOf = (wall, lo, hi) => {
      const L = hi - lo;
      const holes = (wall.openings || [])
        .filter((op) => op && op.type === 'door' && op.width > 0)
        .map((op) => [lo + op.offset, lo + op.offset + op.width])
        .sort((p, q) => p[0] - q[0]);
      let acc = [[lo, hi]];
      for (const [h0, h1] of holes) {
        const next = [];
        for (const [s0, s1] of acc) {
          if (h1 <= s0 || h0 >= s1) { next.push([s0, s1]); continue; }
          if (h0 > s0) next.push([s0, h0]);
          if (h1 < s1) next.push([h1, s1]);
        }
        acc = next;
      }
      return acc.filter(([s0, s1]) => s1 - s0 > 0.05); // 门框残余太窄，忽略
    };

    const defs = [
      ['back', 'x', -W / 2, W / 2, -D / 2 - (layout.back.thickness || 0.3), -D / 2],
      ['front', 'x', -W / 2, W / 2, D / 2, D / 2 + (layout.front.thickness || 0.3)],
      ['left', 'z', -D / 2, D / 2, -W / 2 - (layout.left.thickness || 0.3), -W / 2],
      ['right', 'z', -D / 2, D / 2, W / 2, W / 2 + (layout.right.thickness || 0.3)],
    ];
    for (const [key, axis, lo, hi, pLo, pHi] of defs) {
      const wall = layout[key];
      if (!wall) continue;
      for (const [s0, s1] of segsOf(wall, lo, hi)) {
        solids.push(axis === 'x'
          ? { minX: s0, maxX: s1, minZ: pLo, maxZ: pHi }
          : { minX: pLo, maxX: pHi, minZ: s0, maxZ: s1 });
      }
    }
    return solids;
  }

  // 统一时间源（浏览器 / Node 测试环境都可用）
  _now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  // 用户产生任何操作（点击 / 拖拽 / 缩放 / 按键）时调用，刷新空闲计时
  markActivity() {
    this._lastActivity = this._now();
  }

  // 配置自动关门：idleMs ≤ 0 表示关闭；返回当前实例便于链式调用
  setDoorAutoClose(idleMs) {
    if (idleMs === false) { this._doorAutoClose = false; return this; }
    if (typeof idleMs === 'number') {
      this._doorIdleMs = idleMs;
      this._doorAutoClose = idleMs > 0;
    }
    return this;
  }

  // 关掉某台机柜的全部门（摆放/旋转前调用，避免门板随柜体漂移穿模）
  _closeDoors(rack) {
    if (rack._doorTarget && (rack._doorTarget.front || rack._doorTarget.rear)) {
      rack._doorTarget = { front: 0, rear: 0 };
    }
  }

  // 空闲计时触发：开启的门超过 _doorIdleMs 未操作时，自动关闭所有开启的门。
  // 由 update() 每帧调用；无门可关时不做事，避免无谓开销与重复事件。
  // 回调参数为「关闭的扇数」（前后门各算一扇），与提示文案「N 扇」一致。
  _tickAutoClose() {
    if (!this._doorAutoClose) return;
    const now = this._now();
    if (now - this._lastActivity < this._doorIdleMs) return;
    let closedDoors = 0;
    for (const r of this.racks) {
      if (r._doorTarget && (r._doorTarget.front || r._doorTarget.rear)) {
        if (r._doorTarget.front) closedDoors++;
        if (r._doorTarget.rear) closedDoors++;
        r._doorTarget = { front: 0, rear: 0 };
      }
    }
    if (closedDoors > 0) {
      // 重置计时：门关完即无开启的门，避免无门状态下持续命中阈值重复触发
      this._lastActivity = now;
      if (typeof this.onAutoClose === 'function') this.onAutoClose(closedDoors);
    }
  }

  toggleDoor(rack, which) {
    // 任何开门/关门点击都是用户操作，刷新空闲计时（开门后 60s 倒计时由此开始）
    this.markActivity();
    if (!rack._doorTarget) rack._doorTarget = { front: 0, rear: 0 };
    const t = rack._doorTarget;
    if (t[which] !== 0) { t[which] = 0; return { ok: true, open: false, angle: 0 }; }
    // 精确碰撞：能开多大开多大（贴邻/贴墙时自适应缩小角度，而非一概拒绝）
    const maxA = this._doorMaxAngle(rack, which);
    if (maxA < this.DOOR_MIN_OPEN) return { ok: false, open: true, angle: 0 };
    const dir = which === 'front' ? -1 : 1;
    t[which] = dir * maxA;
    return { ok: true, open: true, angle: maxA, partial: maxA < this.DOOR_ANGLE };
  }

  // 逐帧门板开合动画 + 实时告警红色脉冲
  update(dt) {
    // 空闲超时自动关门：开启的门若 _doorIdleMs 内无任何用户操作则自动关闭
    this._tickAutoClose();
    const k = Math.min(1, dt * 6);
    // 红色脉冲相位：全局统一，避免逐柜错相导致视觉噪点
    const w = 0.5 + 0.5 * Math.sin(performance.now() / 1000 * 3.0);

    // =====================================================================
    // 标记 LOD（性能优化核心）——阈值按「屏幕像素尺寸」反算，不再写死米数
    // ---------------------------------------------------------------------
    // 背景：每台机柜挂了 3 个附加对象（容量条 / 状态点 / 编号文字标牌），
    // 136 台就是 408 个对象、408 次 draw call，其中编号标牌还各自带一张
    // 独立 canvas 纹理（136 张）。在全景视角下这些文字只有几像素大，
    // 既读不清又白白吃掉 draw call 与填充率。
    //
    // 旧实现把三档阈值写死为 18/32/55 米。同一个「米」在不同视口高度、不同
    // FOV（漫游态会收窄 FOV）下对应的屏幕像素完全不同：1080p 下 18m 的编号
    // 约 10px，窗口切成 1/4 高就只剩 2~3px，字号形同虚设；反之 4K 屏上
    // 55m 的状态点还有 12px，本可以继续显示却被提前隐藏。
    //
    // 现按投影关系反算「世界尺寸 h 在距离 d 处占多少像素」：
    //     px = h × (H/2) / (d × tan(fov/2))   ⇒   d = h × (H/2) / (px × tan(fov/2))
    // 记 pxPerM = (H/2)/tan(fov/2)（1 米处每米世界的像素数），则某标记的
    // 隐藏距离 = 世界高度 h × pxPerM / 目标像素数（目标像素见文件头部常量）。
    // 于是无论窗口多大、FOV 多少，标记都在「即将读不清」的同一临界点消失。
    //
    // 距离度量统一为「地面水平距离」。旧实现淡出用三维 distanceTo、分档用
    // 水平距离，同一函数两套尺度；且柜顶标牌高度随机柜类型而变，用三维距离
    // 会让同一柜的三个标记各自对应不同阈值，难以推理。相机通常高于柜顶，
    // 水平距离略小于真实三维距离（偏差 <20%），即阈值略偏保守——标记比
    // 「严格按像素」多留一点可见距离，方向安全。
    //
    // 编号标牌的世界高度随机柜而变（rack._labelH，0.22~0.48m），故其阈值
    // 逐柜计算；容量条/状态点尺寸恒定，阈值每帧算一次即可。
    // =====================================================================
    const cam = this._camera;
    let pxPerM = 0;
    if (cam) {
      const vh = this._viewH ? this._viewH() : 0;
      const fovRad = (cam.fov || 55) * Math.PI / 180;
      pxPerM = vh > 0 ? (vh / 2) / Math.tan(fovRad / 2) : LOD_FALLBACK_PX_PER_M;
    }
    const dBar = pxPerM > 0 ? LOD_BAR_H * pxPerM / LOD_BAR_PX : 0;
    const dDot = pxPerM > 0 ? LOD_DOT_H * pxPerM / LOD_DOT_PX : 0;
    const dDotFull = dDot * LOD_DOT_FULL_RATIO;
    const cp = cam ? cam.position : null;

    for (const rack of this.racks) {
      // 前/后门枢轴按模型实际具备情况分别判空：
      // 早期只判 _frontPivot 便直接访问 _rearPivot，只有前门的模型会每帧抛 TypeError
      if (!rack._doorTarget) rack._doorTarget = { front: 0, rear: 0 };
      if (rack._frontPivot) {
        rack._frontPivot.rotation.y += (rack._doorTarget.front - rack._frontPivot.rotation.y) * k;
      }
      if (rack._rearPivot) {
        rack._rearPivot.rotation.y += (rack._doorTarget.rear - rack._rearPivot.rotation.y) * k;
      }

      // 实时告警红色脉冲（C1）：故障/预警机柜呼吸式发光，提升 3D 可辨识度
      const alerting = rack.status === 'fault' || rack.status === 'warning';
      if (alerting) {
        const isFault = rack.status === 'fault';
        const base = new THREE.Color(isFault ? STATUS_COLOR_NUM.fault : STATUS_COLOR_NUM.warning);
        const intensity = isFault ? (0.55 + w * 0.95) : (0.78 + w * 0.32);
        // 模型类机柜：状态指示条（MeshBasicMaterial，用亮度脉冲模拟发光）
        if (rack._statusMat) rack._statusMat.color.copy(base).multiplyScalar(intensity);
        if (rack._statusBarIm) { rack._statusBarIm.setColorAt(rack._statusBarI, base.clone().multiplyScalar(intensity)); if (rack._statusBarIm.instanceColor) rack._statusBarIm.instanceColor.needsUpdate = true; }
        // 实例化机柜：本体颜色脉冲
        if (!MODEL_BUILDERS[rack.type] && this.meshes[rack.type]) {
          const body = this.meshes[rack.type].body;
          body.setColorAt(rack._idx, base.clone().multiplyScalar(intensity));
          if (body.instanceColor) body.instanceColor.needsUpdate = true;
        }
        this._pulsing.add(rack.id);
      } else if (this._pulsing.has(rack.id)) {
        // 解除告警：恢复基准色，停止脉冲
        const base = this._colorFor(rack);
        if (rack._statusMat) rack._statusMat.color.copy(base);
        if (rack._statusBarIm) { rack._statusBarIm.setColorAt(rack._statusBarI, base); if (rack._statusBarIm.instanceColor) rack._statusBarIm.instanceColor.needsUpdate = true; }
        if (!MODEL_BUILDERS[rack.type] && this.meshes[rack.type]) {
          const body = this.meshes[rack.type].body;
          body.setColorAt(rack._idx, base);
          if (body.instanceColor) body.instanceColor.needsUpdate = true;
        }
        this._pulsing.delete(rack.id);
      }

      // ---- 标记 LOD：按屏幕像素尺寸隐藏 / 淡出（阈值见函数顶部推导）----
      if (cp) {
        const dx = rack.x - cp.x, dz = rack.z - cp.z;
        const d2 = dx * dx + dz * dz;
        const lb = rack._idLabel, bar = rack._capBar, dot = rack._billboard;

        // 编号文字：阈值随机柜字号而变
        if (lb) {
          const lim = (rack._labelH || LOD_LABEL_H) * pxPerM / LOD_LABEL_PX;
          const want = d2 < lim * lim;
          if (lb.visible !== want) lb.visible = want;
        }
        // 容量条
        if (bar) {
          const want = d2 < dBar * dBar;
          if (bar.visible !== want) bar.visible = want;
        }
        // 状态点：到点即隐；可见区间内按距离淡出，避免一整排标记同时硬切换造成闪烁。
        // 淡出与显隐合并到同一分支——旧实现淡出写在循环体内、显隐写在循环体后，
        // 同一距离被算两遍、每帧两次遍历 136 个机柜。
        if (dot) {
          const want = d2 < dDot * dDot;
          if (dot.visible !== want) dot.visible = want;
          if (want && d2 > dDotFull * dDotFull) {
            const t = (Math.sqrt(d2) - dDotFull) / (dDot - dDotFull);
            const op = t >= 1 ? LOD_DOT_MIN_OP : 1 - (1 - LOD_DOT_MIN_OP) * t;
            // 变化不足 2% 不写材质：省掉每帧上百次 uniform 上传
            if (Math.abs(dot.material.opacity - op) > 0.02) dot.material.opacity = op;
          } else if (dot.visible && dot.material.opacity !== 1) {
            dot.material.opacity = 1;
          }
        }
      }
    }
  }

  /** 不记历史的移除（供撤销/重做内部使用，避免自我嵌套） */
  _spliceOut(rack) {
    this.racks = this.racks.filter((r) => r !== rack);
    // 多选：不只是清 selected —— 该柜若在选集里，其余成员的描边与主选中都要跟着收
    this._dropFromSelection([rack]);
    this.build();
  }

  remove(rack) {
    const idx = this.racks.indexOf(rack);
    if (idx < 0) return;
    const gone = rack;
    this._spliceOut(rack);
    // 删除会连带丢掉柜内设备清单且直接落盘，误触代价极高 → 必须可撤销
    this.pushHistory({
      label: `删除 ${gone.id}`,
      undo: () => {
        this.racks.splice(Math.min(idx, this.racks.length), 0, gone);
        this.build();
      },
      redo: () => this._spliceOut(gone),
    }, gone.id, 'remove');
  }

  // 房间尺寸变化后整体钳位
  clampAll(dims) {
    for (const rack of this.racks) this.moveTo(rack, rack.x, rack.z, dims);
  }

  /**
   * 房间缩小后的重叠消解。
   * clampAll 只把机柜推回房间边界，不处理机柜互相穿透；
   * 把大房间改小时多台机柜会被挤到重叠。这里沿「重叠较小的轴」成对推开，
   * 迭代次数有上限，推不动时（房间实在放不下）保持最后一次结果，不会死循环。
   */
  resolveOverlaps(dims, maxIter = 24) {
    for (let iter = 0; iter < maxIter; iter++) {
      let moved = false;
      for (let i = 0; i < this.racks.length; i++) {
        const a = this.racks[i];
        const ea = this._halfExtents(a);
        for (let j = i + 1; j < this.racks.length; j++) {
          const b = this.racks[j];
          const eb = this._halfExtents(b);
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const ox = ea.hx + eb.hx - Math.abs(dx);
          const oz = ea.hz + eb.hz - Math.abs(dz);
          if (ox <= 0 || oz <= 0) continue; // 两轴中任一轴已分离即不重叠
          const oxRatio = ox / (ea.hx + eb.hx);
          const ozRatio = oz / (ea.hz + eb.hz);
          if (oxRatio <= ozRatio) {
            const s = (dx >= 0 ? 1 : -1) * (ox / 2 + 0.01);
            this.moveTo(a, a.x - s, a.z, dims);
            this.moveTo(b, b.x + s, b.z, dims);
          } else {
            const s = (dz >= 0 ? 1 : -1) * (oz / 2 + 0.01);
            this.moveTo(a, a.x, a.z - s, dims);
            this.moveTo(b, b.x, b.z + s, dims);
          }
          moved = true;
        }
      }
      if (!moved) break;
    }
    this.clampAll(dims);
    return this.racks;
  }

  findById(id) {
    return this.racks.find((r) => r.id.toUpperCase() === id.toUpperCase()) || null;
  }

  /**
   * 查找与给定机柜同排的服务器机柜（按 X 坐标聚类）。
   * 用于「点击机柜 → 展示整排」的 3D 视图：同一排的机柜共享 X，
   * 沿 Z 依次排开，构成一条冷通道或热通道。
   */
  rowOf(rack) {
    if (!rack) return [];
    const EPS = 0.35; // 同排判定容差（排间距 2.4m，0.35 足以区分且容忍浮点误差）
    return this.racks
      .filter((r) => r.type === 'server' && Math.abs(r.x - rack.x) < EPS)
      .sort((a, b) => a.z - b.z);
  }

  // 导出可持久化的纯数据
  toPlain() {
    return this.racks.map((r) => ({
      id: r.id, type: r.type, x: +r.x.toFixed(3), z: +r.z.toFixed(3),
      rotationY: r.rotationY, temp: r.temp, density: r.density,
      humidity: r.humidity, power: r.power, status: r.status,
      devices: r.devices || null,
    }));
  }

  stats() {
    const s = { total: this.racks.length, normal: 0, warning: 0, fault: 0, ac: 0, power: 0, ups: 0, fire: 0 };
    for (const r of this.racks) {
      if (r.status === 'normal') s.normal++;
      else if (r.status === 'warning') s.warning++;
      else s.fault++;
      if (r.type === 'ac') s.ac++;
      else if (r.type === 'power') s.power++;
      else if (r.type === 'ups') s.ups++;
      else if (r.type === 'fire') s.fire++;
    }
    return s;
  }

  // B6：机柜传感器快照（温度 / 湿度 / 功率 / 状态），供 2D 监控大屏表格展示
  sensorTable() {
    return this.racks.map((r) => ({
      id: r.id,
      type: TYPE_LABEL[r.type] || r.type,
      temp: +Number(r.temp != null ? r.temp : 22).toFixed(1),
      humidity: +Number(r.humidity != null ? r.humidity : 45).toFixed(1),
      power: Math.round(r.power || 0),
      status: r.status,
    }));
  }

  // B1/F2：后端聚合状态 → 应用到 3D 机柜（按 rackId 匹配，按最严重级别覆盖）。
  // 返回实际发生状态变化的机柜数。无映射或字段缺失时安全跳过（返回 0）。
  applyStatusMap(statusById) {
    if (!statusById || typeof statusById !== 'object') return 0;
    let n = 0;
    for (const rack of this.racks) {
      const s = statusById[rack.id];
      if (!s) continue;
      const next = (s === 'fault' || s === 'critical' || s === 'error')
        ? 'fault'
        : (s === 'warning' || s === 'warn') ? 'warning' : 'normal';
      if (rack.status !== next) { rack.status = next; n++; }
    }
    if (n) this.applyColors();
    return n;
  }

  // 数据接入实时叠加：把「数据接入」模块录入的传感器读数与告警状态应用到机柜。
  // 语义：map 是该次轮询的「完整期望叠加状态」——在映射内的机柜按映射覆盖，
  // 不在映射内（或映射项无有效值）的机柜解除叠加，恢复到录入前的基准
  // （含规划态自带状态与默认温湿度），不会误留上一次的红色/高温。
  // 基准只在首次叠加时保存（_ingestBase），仅改内存，不写回存档。
  // map 形如 { [rackId]: { temp?, humidity?, status? } }；传 null/空对象 = 全部解除。
  applyIngestOverlay(map) {
    if (!map || typeof map !== 'object') return 0;
    let n = 0;
    for (const rack of this.racks) {
      const o = map[rack.id] || null;
      const t = o ? Number(o.temp) : NaN;
      const h = o ? Number(o.humidity) : NaN;
      const hasData = !!o && ((o.temp != null && Number.isFinite(t)) || (o.humidity != null && Number.isFinite(h)) || !!o.status);
      if (hasData) {
        if (!rack._ingestBase) {
          rack._ingestBase = { temp: rack.temp, humidity: rack.humidity, status: rack.status };
        }
        if (o.temp != null && Number.isFinite(t) && rack.temp !== t) { rack.temp = t; n++; }
        if (o.humidity != null && Number.isFinite(h) && rack.humidity !== h) { rack.humidity = h; n++; }
        if (o.status && rack.status !== o.status) { rack.status = o.status; n++; }
      } else if (rack._ingestBase) {
        const b = rack._ingestBase;
        if (rack.temp !== b.temp) { rack.temp = b.temp; n++; }
        if (rack.humidity !== b.humidity) { rack.humidity = b.humidity; n++; }
        if (rack.status !== b.status) { rack.status = b.status; n++; }
        rack._ingestBase = null;
      }
    }
    if (n) {
      this.applyColors();
      for (const r of this.racks) {
        if (r._billboard) r._billboard.material.color.copy(this._statusColor(r.status));
      }
    }
    return n;
  }
}

export { TYPE_LABEL, STATUS_LABEL };
