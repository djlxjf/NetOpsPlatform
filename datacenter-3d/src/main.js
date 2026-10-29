import * as THREE from 'three';
import { SceneManager } from './scene.js';
import { buildRoom } from './room.js';
import { RackSystem, TYPE_LABEL, STATUS_LABEL } from './racks.js';
import { CameraDirector } from './cameraPresets.js';
import { UIController } from './ui.js';
import { roomDims, resetRoomDims, ROOM_MIN, ROOM_MAX } from './config.js';
import {
  loadPlan, savePlan, savePlanSync, debouncedSave, defaultWallLayout, syncWallsToRoom,
  validateWall, findFreeSlot, genId, syncIdCounter, DEFAULT_ROOM_ID, bindPorts,
} from './wallLayout.js';
import { WallEditor } from './wallEditor.js';
import { RackDetailView } from './rackDetailView.js';
import { disposeFaceTextures } from './deviceModel.js';
import { RoamControls, PatrolController } from './walkthrough.js';
import { disposeSharedMaterials } from './rackModel.js';
import { seedDefaultDataCenter, SEED_CONTENT_VERSION } from './seedLayout.js';
import { AvatarFigure, AvatarFPS } from './avatar.js';
import { confirmDialog } from './confirmDialog.js';
import { enhanceSelects, disposeSelectMenus } from './selectMenu.js';
import { engDefaults, validatePlan, computeCapacity, rackInletTemp, batteryRoomIssue, complianceStatus } from './engineering.js';
import { BridgeSystem } from './bridgeSystem.js';
import { BridgePanel } from './bridgePanel.js';
import { FloorPanel } from './floorPanel.js';
import { BridgeDrawPanel } from './bridgeDrawPanel.js';
// 演示增强特性集合（模拟机房可视化增强，纯演示，不涉及真实机房规范）
import {
  AirflowFX, FloorHeatmapFX, MeasureTool, AlertBadges, DemoScenarios,
  ThemeSwitch, LedBreathing, EnterTransition, Onboarding, ShortcutHelp,
  LoadingProgress, PerfHud, TouchGestures, DetailExport,
} from './demoFx.js';
// 值守人员 GLB 模型（?url 让 vite 复制资产并返回运行时地址，不内联进 bundle）
import avatarModelUrl from '../assets/human.glb?url';

// ===========================================================================
// 模块化封装：把原「顶层副作用脚本」改为可挂载 / 可销毁的实例。
//   - 独立运行：index.html 直接调用 initDatacenter(document.getElementById('dc-root'))
//   - Vue 集成：DataCenterView.vue 的 onMounted 调 initDatacenter，onBeforeUnmount 调 disposeDatacenter
// 所有 DOM 查询限定在 rootEl 内，避免与宿主应用元素 id 冲突；
// 所有 window 级监听均登记到 _winListeners，dispose 时统一解绑。
// ===========================================================================

/** 当前活跃实例（同一时刻仅允许一个，重复 init 会先销毁旧实例） */
let _active = null;

// 整改 F1：摆放类 error 白名单——这些校验项的判据依赖机柜摆放数量
// （G-HVAC-01 总制冷量、G-HVAC-02 单台失效冗余），修复动作（增删空调机柜）
// 只能在阶段④完成，因此④入口闸门放行（⑤仍标红）；
// 其余 error（等级/密度/UPS/柴发/灭火剂/疏散门/链路）均在②③修复，照常拦截。
const PLACEMENT_CLASS_CODES = ['G-HVAC-01', 'G-HVAC-02'];

// HTML/属性转义：门窗属性可能来自外部导入的房间 JSON，
// 拼进 innerHTML 前必须转义，避免构造出可执行标记
function escHtml(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(v) {
  return escHtml(v).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export async function initDatacenter(rootEl, plan, opts) {
  if (!rootEl) throw new Error('initDatacenter: rootEl 不能为空');
  // P1-1-B：宿主（Vue 大屏）可注入数据端口，解耦 3D 直连 IPC。
  // 注入后 wallLayout 的 savePlan/loadPlan 优先走注入函数（Vue→3D 单向注入），
  // 3D→Vue 仅经回调（onRackSelect 等）。未注入则保持 window.electronAPI /
  // localStorage 回退路径（独立运行工具模式仍可用）。
  if (opts && opts.ports) bindPorts(opts.ports);
  if (_active) _active.dispose();
  const app = _createApp(rootEl);
  _active = app;
  // 调试出口：供自动化验证脚本读取场景状态（无副作用，可安全保留）
  window.__dcApp = app;
  await app._boot(plan);
  return app;
}

export function disposeDatacenter() {
  if (_active) {
    _active.dispose();
    _active = null;
  }
}

function _createApp(rootEl) {
  // 元素查找根：Vue 集成时工具标记挂在 rootEl 的 shadowRoot 内
  // （宿主元素本身的 querySelector 不会进入 shadow DOM，会全部返回 null）；
  // 独立运行时 shell 以 light DOM 直接注入 rootEl，shadowRoot 为 null，行为不变。
  let eng = engDefaults(); // 工程配置（整改：五域量化数据模型）
  // app.eng 只读访问器：宿主（Vue 大屏）读取工程配置用
  const domRoot = (rootEl.shadowRoot && rootEl.shadowRoot.querySelector('#app'))
    ? rootEl.shadowRoot
    : rootEl;
  // canvas 宿主：优先 domRoot 内的 #app，退化时用 domRoot 本身
  const container = domRoot.querySelector('#app') || domRoot;
  const $ = (id) => domRoot.querySelector(`#${id}`);
  const sm = new SceneManager(container);

  // ---- window 级监听登记表（dispose 统一解绑） ----
  const _winListeners = [];
  const onWin = (type, fn, opts) => {
    window.addEventListener(type, fn, opts);
    _winListeners.push([type, fn, opts]);
  };

  // 判断按键事件是否发生在文本输入控件上（用于快捷键焦点保护，
  // 避免搜索框输入 R/Backspace 时误触发机柜旋转/删除）
  const isTyping = (e) => {
    // Shadow DOM 下 e.target 会被 retarget 成宿主元素（DIV），影子树内聚焦的
    // input/select 判不到——Vue 嵌入态曾因此让聚焦 select 时的空格泄漏为相机平移。
    // composedPath()[0] 才是事件原始目标；无 composedPath 时退回 e.target。
    const t = (e.composedPath && e.composedPath()[0]) || e.target;
    if (!t) return false;
    const tag = t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    // 自绘下拉的 trigger（.dcx-trigger 为 button，需显式保护其键盘/快捷键不被 3D 场景抢走）
    if (t.closest && t.closest('.dcx-trigger')) return true;
    if (t.isContentEditable) return true;
    return false;
  };

  // P1-3-F/G：节流保存。persistIfValid 仅做合法性校验（返回布尔），
  // 保存动作由 schedulePersist（500ms 防抖）与 flushPersist（立即强制落盘）负责，
  // 消除 persistIfValid 即时写导致的写入风暴。
  let _persistTimer = null;
  const doPersistSave = async () => {
    return savePlan(DEFAULT_ROOM_ID, { ...roomDims }, app.wallLayout, app.racks.toPlain(), app.locked, null, SEED_CONTENT_VERSION, eng);
  };

  const app = {
    rootEl,
    sm,
    _winListeners,

    // =======================================================================
    // 数据：房间尺寸 + 墙面布局 + 设备（v3，IPC 优先 + localStorage 兜底）
    // =======================================================================
    // 工程配置只读暴露（整改 G-PWR-13：宿主大屏按真实配置派生 PUE/湿度）
    get eng() { return eng; },

    async _boot(plan) {
      // plan 参数供宿主（Vue）在外部预加载后直接注入；缺省时自行异步加载
      const saved = plan || await loadPlan(DEFAULT_ROOM_ID);
      // 先复位模块级单例，避免上一次挂载的尺寸残留到本次
      resetRoomDims();
      if (saved && saved.dims) Object.assign(roomDims, saved.dims);
      let wallLayout = (saved && saved.walls) || defaultWallLayout();
      syncWallsToRoom(wallLayout, roomDims);
      let locked = (saved && saved.locked) || false; // 完成摆放后锁定布局

      // 整改 G-PWR-01：工程配置（五域量化入口）；存档优先，缺省字段用默认值补齐
      eng = engDefaults();
      if (saved && saved.engineering && typeof saved.engineering === 'object') {
        const se = saved.engineering;
        Object.assign(eng, se);
        for (const k of ['ups', 'generator', 'grounding', 'hvac', 'fire', 'security', 'cable']) {
          if (se[k] && typeof se[k] === 'object') Object.assign(eng[k], se[k]);
        }
        if (Array.isArray(se.auxRooms)) eng.auxRooms = se.auxRooms;
      }

      const room = buildRoom(sm.scene, wallLayout, roomDims);
      const racks = new RackSystem(sm.scene);
      // LOD 阈值按「屏幕像素尺寸」反算，必须知道画布视口高度（CSS 像素）；
      // 传函数而非快照，窗口/宿主布局变化时自动跟随，无需额外挂 resize。
      racks.setCamera(sm.camera, () => sm.renderer.domElement.clientHeight);
      // 开门受阻判定要算墙体：柜体贴墙摆放时门板会扫到墙外（穿模）。
      // 传 getter 而非快照——阶段②改墙体/房间尺寸后无需重建机柜即可生效。
      racks.setWalls(() => wallLayout, () => roomDims);
      // 撤销/重做：阶段④的安全网。按钮可用态由栈变化事件驱动，
      // 不在渲染循环里轮询（每帧比较一个计数器足矣，见 syncUndoUI）。
      racks.onHistoryChange = () => app.syncUndoUI();
      // T17：3D 机柜选中 → 回调宿主（Vue 侧据此高亮 2D 告警/定位）
      racks.onSelect = (r) => { if (typeof app.onRackSelect === 'function') app.onRackSelect(r ? r.id : null); };
      // 柜门自动关闭：用户开启柜门后，若 60 秒内没有任何操作则自动关门。
      // 任何交互（点击/拖拽旋转/滚轮缩放/按键/移动鼠标）都刷新空闲计时，
      // 用捕获阶段监听确保即使子控件 stopPropagation 也不会漏掉。
      const markDoorActivity = () => { try { racks.markActivity(); } catch (_) {} };
      // 必须走 onWin 登记：dispose() 只解绑 _winListeners 里的监听。
      // 此前用裸 window.addEventListener，每次销毁都泄漏 4 个监听（含高频
      // pointermove 的捕获阶段监听），反复进出监控大屏会持续累积，且因闭包
      // 持有 racks/domRoot 引用，整棵机柜对象树无法被 GC 回收。
      for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel']) {
        onWin(ev, markDoorActivity, { passive: true, capture: true });
      }
      // 自动关门时给个轻量提示（仅在有门实际关闭时触发一次）
      racks.onAutoClose = (n) => {
        if (app.ui && typeof app.ui.toast === 'function') {
          app.ui.toast(`柜门已因长时间未操作自动关闭（${n} 扇）`, 'info');
        }
      };
      // 数据加载策略：
      //  - 有用户真实布局（racks 非空）→ 保持原样，绝不覆盖
      //  - 无存档，或存档为空机房且内容版本落后 → 按 seedLayout 重建完整默认机房
      //    （版本标记解决「代码已更新但用户看到的仍是旧空房间」问题）
      let initialRacks = [];
      const savedRacks = saved && Array.isArray(saved.racks) ? saved.racks : null;
      const savedVersion = saved && Number(saved.seedVersion) || 0;
      const isStaleEmptyRoom = (!saved || savedRacks.length === 0) && savedVersion < SEED_CONTENT_VERSION;
      if (isStaleEmptyRoom) initialRacks = seedDefaultDataCenter(roomDims);
      else if (savedRacks) initialRacks = savedRacks;
      racks.loadFrom(initialRacks);
      // 整改 O3：读档/种子重建后统一做一轮「钳回房间 + 有界分离」。
      // 旧存档可能生成于更大的房间（用户之后把 dims 改小）或夹带重叠坐标，
      // 不处理则机柜穿墙/互穿——互穿柜在④还会破坏「空位才能落子」的放置规则
      //（重叠判定按 AABB，两个柜互穿后都摆不下去也删不干净）。
      // moveTo 无撤销栈副作用，boot 期调用安全。
      racks.clampAll(roomDims);
      racks.resolveOverlaps(roomDims);
      // 整改 G-HVAC-12：机柜进风温度由负荷模型确定性推导（替代随机种子语义）
      for (const r of racks.racks) {
        if (r.type === 'server') r.temp = rackInletTemp(eng, r);
      }
      // 同一模型必须覆盖「之后新增」的机柜（racks.js 的单点摆放与批量摆放）。
      // 此前这两条路径写死 22+随机×8，导致同一机房内并存两套温度口径：
      // 启动生成的是真实进风温度、手动添加的是随机数，温度着色与超温告警互相矛盾。
      // eng 是模块级变量（工程配置面板改动会整体替换），闭包读取即取最新值。
      racks.inletTempFn = (powerKW) => rackInletTemp(eng, { power: powerKW });

      const director = new CameraDirector(sm);
      const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

      // T21/T16：第一人称漫游 + 自动巡检（绕过 OrbitControls 直接驱动相机）
      const roam = new RoamControls(sm, () => roomDims);
      const patrol = new PatrolController(sm);
      app.roam = roam;
      app.patrol = patrol;
      app.roamActive = false;
      app.patrolActive = false;
      // 整改（审查 O1）：此处原先有一行 `eng = engDefaults();`，会把上面刚按存档
      // 合并好的五域工程配置整个清空——注释自称「_boot 内以存档为准重新初始化」，
      // 但之后并无任何重新初始化代码，导致③的填写每次重启全丢，且首次切换步骤
      // 时被默认值反写存档。已删除该行：eng 以第 128–136 行的存档合并结果为准。
      // 进入任一模式前停掉另一种，避免相机控制权冲突；同时禁用 OrbitControls
      const enterWalk = (which) => {
        patrol.stop();
        if (which === 'roam') {
          roam.setObstacles(racks); // 进入前按当前机柜布局重建碰撞盒
          roam.enable();
          app.roamActive = true; app.patrolActive = false;
        }
        else { roam.disable(); app.roamActive = false; app.patrolActive = true; }
        director.tween = null;
        sm.controls.enabled = false;
      };
      const exitWalk = () => {
        roam.disable();
        patrol.stop();
        app.roamActive = false;
        app.patrolActive = false;
        sm.controls.enabled = true;
        // 恢复 OrbitControls：以当前相机朝向为基准重置 target，避免回弹跳变。
        // 注意：不再调用 director.panorama() 强制拉回总览机位——
        // 用户退出巡检/漫游后保留当前视角，不强制居中/回正（自由视角需求）。
        const fwd = new THREE.Vector3();
        sm.camera.getWorldDirection(fwd);
        sm.controls.target.copy(sm.camera.position).add(fwd.multiplyScalar(10));
      };
      app.setRoamMode = (on) => { if (on) enterWalk('roam'); else exitWalk(); };
      app.setPatrol = (on) => {
        if (on) {
          if (!patrol.buildPath(racks)) return false;
          const ok = patrol.start();
          if (ok) enterWalk('patrol');
          return ok;
        }
        exitWalk();
        return true;
      };

      Object.assign(app, { room, racks, director, floorPlane });
      app._initUndoUI();

      // 值守人员 3D 模型。
      // 整改（性能）：原实现在启动时即加载 human.glb（约 5 万面 + 3 段动画蒙皮），
      // 而规划态（locked=false）本就隐藏人物——等于为「看不见的功能」付出了启动时间
      // 与常驻渲染开销（QA 实测：关闭人物后 FPS 81.94→46.66，即人物占约四成开销；
      //  swiftshader 软渲染下更是只有 17 FPS）。
      // 现改为按需加载：仅在进入监控/巡检态（setInspectMode(true)）时首次加载，
      // 之后缓存复用；规划态不加载。加载失败不影响机房场景其余功能。
      const avatar = new AvatarFigure(sm.scene);
      app.avatar = avatar;
      let avatarLoading = null;
      app._ensureAvatar = () => {
        if (avatar.ready) return Promise.resolve(avatar);
        if (avatarLoading) return avatarLoading;
        avatarLoading = avatar.load(avatarModelUrl).then(() => {
          avatar.place(racks, roomDims);
          // 应用工程配置中的巡逻速度（默认 0.85，低帧率下更顺滑）
          if (eng && eng.patrolSpeed) avatar.setPatrolSpeed(eng.patrolSpeed);
          return avatar;
        }).catch((e) => {
          console.warn('[avatar] 人物模型加载失败（不影响机房场景）:', e && e.message);
          avatarLoading = null; // 失败不缓存，允许下次进入监控态时重试
          throw e;
        });
        return avatarLoading;
      };

      // 人物第一人称交互：点击人物 → 立即挂载第一人称跟随视角（无过渡停顿），
      // 相机每帧刚性吸附人物眼位+朝向，人物持续巡逻行走、相机同步移动；
      // Esc/界面按钮退出并飞回原视角
      const fps = new AvatarFPS(sm, avatar, () => roomDims, domRoot);
      app.fps = fps;
      app.fpsActive = false;
      app.onFpsChange = null; // Vue 侧订阅第一人称态（进入时隐藏大屏面板，沉浸漫游）
      app.enterAvatarFPS = () => {
        if (app.fpsActive || !app.avatar || !app.avatar.ready) return;
        app.fpsActive = true;
        if (app.onFpsChange) app.onFpsChange(true);
        // 进入第一人称：墙面切换为白色哑光（参考低压配电柜3D模型的墙面观感），
        // 第三人称仍以半透明蓝灰呈现，互不影响；同时显形第一人称天花板（近黑顶板+LED灯盘），
        // 并强制显示且不透明桥架（第一人称视角下直接可见，无需透明）
        if (room && room.setWallSkin) room.setWallSkin('fps');
        if (room && room.setCeilingVisible) room.setCeilingVisible(true);
        if (sm && sm.setFpsLighting) sm.setFpsLighting(true); // 第一人称顶光渐变：压低平填光、降曝光
        if (app._fx && app._fx.bridge && app._fx.bridge.setFpsMode) app._fx.bridge.setFpsMode(true);
        // 点击人物 → 第一人称跟随：不停止巡逻，人物保持持续向前行走；
        // 记录进入前巡逻态，若原本未巡逻则起巡，保证进入后人物持续走动
        app._wasPatrolling = !!(avatar.patrol && avatar.patrol.active);
        // 清除悬停冻结（点击瞬间指针停在人物上，_hovered=true 会暂停巡逻位移/动画）
        avatar.setHovered(false);
        if (!app._wasPatrolling && avatar.startPatrol) avatar.startPatrol(roomDims);
        app._fpsSavedPos = sm.camera.position.clone();
        app._fpsSavedTarget = sm.controls.target.clone();
        sm.controls.enabled = false;
        // 立即挂载第一人称跟随视角（无过渡停顿）：相机由 AvatarFPS 每帧刚性吸附
        // 人物眼位+朝向，人物持续巡逻行走，相机随其位置/朝向同步移动
        fps.activateFollow();
      };
      app.exitAvatarFPS = () => {
        if (!app.fpsActive) return;
        app.fpsActive = false;
        if (app.onFpsChange) app.onFpsChange(false);
        // 退出第一人称：墙面还原为第三人称的半透明蓝灰（恢复原始样式，不做任何修改），
        // 同时隐藏第一人称天花板，恢复第三人称总览俯视不被遮挡；桥架还原为进入前的显隐/透明度
        if (room && room.setWallSkin) room.setWallSkin('default');
        if (room && room.setCeilingVisible) room.setCeilingVisible(false);
        if (sm && sm.setFpsLighting) sm.setFpsLighting(false); // 还原平填光与曝光
        if (app._fx && app._fx.bridge && app._fx.bridge.setFpsMode) app._fx.bridge.setFpsMode(false);
        fps.deactivate();
        sm.controls.enabled = false;
        // 以当前视线方向重置 orbit target，避免退出瞬间回弹
        const fwd = new THREE.Vector3();
        sm.camera.getWorldDirection(fwd);
        sm.controls.target.copy(sm.camera.position).add(fwd.multiplyScalar(10));
        const p = app._fpsSavedPos, t = app._fpsSavedTarget;
        director._tweenTo([p.x, p.y, p.z], [t.x, t.y, t.z], 0.9, () => {
          director.tween = null;
          sm.controls.enabled = true;
          // 恢复进入前巡逻态：原本在巡逻 → 从当前位置继续绕行；原本静止 → 停下回到待命
          if (app._wasPatrolling && app.avatar && app.avatar.ready) app.avatar.startPatrol(roomDims);
          else if (app.avatar && app.avatar.ready) app.avatar.stopPatrol();
          app._wasPatrolling = false;
        });
      };
      fps._onExit = () => app.exitAvatarFPS(); // Esc / 退出按钮回调

      // wallLayout / locked 会在多处整体重新赋值，用访问器属性保持可变
      Object.defineProperty(app, 'wallLayout', {
        get: () => wallLayout,
        set: (v) => { wallLayout = v; },
      });
      Object.defineProperty(app, 'locked', {
        get: () => locked,
        set: (v) => { locked = v; },
      });

      // T21/T16：漫游 / 巡检按钮已从界面移除（按需求仅保留底层 roam/patrol 引擎能力，不再提供触发入口）

      app._initUI();
      app._initDemoFx();
      app._initQualityUI();
      app._initRail();
      app._initStages();
      app._initStage1();
      app._initValidateUI();
      app._initEngPanel();
      app._initTopbarExtras();
      app.syncEngReadout();
      app._initStage2();
      app._initStage4();
      app._initPointer();
      app._initSpacePan();

      // 动画循环补充更新 + FPS
      let last = performance.now();
      sm.addUpdate(() => {
        const now = performance.now();
        const dt = (now - last) / 1000;
        last = now;
        if (app.roamActive) app.roam.update(dt);
        else if (app.patrolActive) app.patrol.update(dt);
        director.update(dt);
        app.detail.update(dt);
        racks.update(dt);
        if (app.avatar) app.avatar.update(dt);
        if (app.fps) app.fps.update(dt);
      });

      sm.onFps = (fps) => {
        const s = racks.stats();
        // 注意：ui 是 _initUI() 内的局部变量，此处须用 app.ui
        // （此前误用裸标识符 ui，在构建分块/时序差异下抛 ReferenceError，
        //  导致 initDatacenter 整体初始化失败、3D 工具无法启动）
        // 状态栏同时显示实际渲染分辨率（设备像素），便于判断是否被降档
        const rs = sm.getRenderSize();
        const qLabel = { high: '高清', balanced: '均衡', perf: '流畅' }[sm.quality] || sm.quality;
        app.ui.setStats(
          `FPS ${fps}  ·  设备 ${s.total}（正常 ${s.normal} / 告警 ${s.warning} / 故障 ${s.fault}）`
          + `  ·  绘制调用 ${sm.renderer.info.render.calls}`
          + `  ·  ${qLabel} ${rs[0]}×${rs[1]}${sm._msaaSamples ? ` MSAA${sm._msaaSamples}x` : ''}`,
        );

        // 性能兜底：onFps 每 500ms 触发一次，连续 8 次（约 4 秒）低于 28 FPS
        // 且人物可见时，自动隐藏人物（约可回收四成绘制开销），只提示一次。
        // 规划态不加载人物，故此处天然只作用于监控/巡检态。
        //
        // 铁律：这段必须写在 onFps 回调内部。此处 fps 是回调形参（帧率数值），
        // 它遮蔽了外层 `const fps = new AvatarFPS(...)`（第一人称控制器实例）。
        // 曾误将此块置于回调之外——那里的 fps 是 AvatarFPS 对象，`对象 > 0` 恒为
        // false，判断永远走 else 分支，自动隐藏逻辑从未生效（实测 _lowFpsRun 恒 0）。
        if (fps > 0 && fps < 28) {
          app._lowFpsRun = (app._lowFpsRun || 0) + 1;
          if (app._lowFpsRun >= 8 && !app._avatarAutoHidden
              && app.avatar && app.avatar.ready && app.avatar.model && app.avatar.model.visible) {
            app._avatarAutoHidden = true;
            app.avatar.setVisible(false);
            app.ui && app.ui.toast('检测到帧率偏低，已自动隐藏值守人员以提升流畅度');
          }
        } else {
          app._lowFpsRun = 0;
        }
      };
      sm.onAdaptive = (msg) => app.ui.toast(msg);
      // 画质档位变化时同步按钮高亮（自动降档/升档也要反映到 UI）
      sm.onQuality = (name) => {
        const seg = $('quality-seg');
        if (seg) {
          seg.querySelectorAll('[data-quality]').forEach((b) => {
            b.classList.toggle('active', b.dataset.quality === name);
          });
        }
      };

      // 启动：进入阶段1（俯视平面）；并立即定位到机房中心的总览机位
      // （房间尺寸可能在场景构造后随存档加载而变化，故按最终尺寸重算一次，保证初始即居中）
      app.setStage(1);
      director.home(0);
      sm.start();
    },

    // =======================================================================
    // 检查器让位：详情工具条是底部 fixed 浮层，会压住 #info 面板尾部内容。
    // 实测其高度（隐藏时为 0）写入宿主 CSS 变量 --detailbar-reserve，
    // .inspector 的 max-height 据此收缩，保证各浮层互不遮挡。
    // =======================================================================
    _syncDetailReserve() {
      const bar = app.detailBar;
      if (!bar || !app.rootEl || !app.rootEl.style) return;
      const h = bar.classList.contains('hidden') ? 0 : bar.getBoundingClientRect().height;
      // 16px = 工具条自身的 bottom 偏移（style.css .detail-bar）；12px = 与面板保留的间距
      app.rootEl.style.setProperty('--detailbar-reserve', h ? `${Math.round(h) + 28}px` : '0px');
    },

    // =======================================================================
    // 演示增强总装（模拟机房可视化增强，纯演示，不涉及真实机房规范）：
    // 把 demoFx.js 的 14 项特性接入工具栏开关 / 场景叙事 / 每帧循环，
    // 并统一在 dispose 时释放。所有特性默认不激活、可独立关闭，不改动主交互路径。
    // =======================================================================
    _initDemoFx() {
      const fx = {
        airflow: new AirflowFX(app),
        heatmap: new FloorHeatmapFX(app),
        measure: new MeasureTool(app),
        alerts: new AlertBadges(app),
        scenarios: new DemoScenarios(app),
        theme: new ThemeSwitch(app),
        led: new LedBreathing(app),
        enter: new EnterTransition(app),
        onboarding: new Onboarding(app, domRoot),
        help: new ShortcutHelp(app, domRoot),
        loading: new LoadingProgress(app, domRoot),
        perfhud: new PerfHud(app, domRoot),
        touch: new TouchGestures(app),
        detailExport: new DetailExport(app, domRoot),
        // 桥架系统可视化（弱电 / 强电 / 配套三类一键显隐，路由由布局实时推导）
        bridge: new BridgeSystem(app),
      };
      // 统一登记，dispose 时逐个释放，避免遗漏监听 / 场景对象
      app._fx = fx;

      // 「静电地板铺设 / 桥架铺设参数」两个菜单面板（规划态入口，互斥开关，
      // 打开时让位阶段坞；监控态由 setInspectMode 显式关闭，不暴露编辑能力）
      app._floorPanel = new FloorPanel(app, domRoot);
      app._bridgePanel = new BridgePanel(app, domRoot);
      // 桥架手绘布线面板（自定义路径）；手绘态由 app.bridgeDraw 记录当前类与敷设方式
      app._bridgeDrawPanel = new BridgeDrawPanel(app, domRoot);
      app.bridgeDraw = { kind: null, mount: 'over' };

      // 仅注册真正含逐帧动画的特性，避免空 update 占用渲染循环
      sm.addUpdate((dt) => {
        fx.airflow.update(dt);
        fx.led.update(dt);
        fx.perfhud.update(dt);
        // 桥架：内部以 0.4s 防抖检查布局签名，全隐时直接返回（零开销）
        fx.bridge.update(dt);
      });

      // 进入转场：首屏画面淡入
      fx.enter.play();
      // 加载进度：首屏就绪指示（自动收起，避免遮挡后续浮层）
      fx.loading.show();
      setTimeout(() => { try { fx.loading.hide(); } catch (_) {} }, 800);
      // 首次引导浮层（localStorage 记忆，仅首次出现）
      fx.onboarding.maybeShow();
      // 机柜详情条「导出配置卡」按钮
      fx.detailExport.attach();

      // 工具栏「演示」分组：开关型（data-fx）+ 场景叙事（data-scenario）
      const syncToggle = (btn, on, labelOn, labelOff) => {
        btn.classList.toggle('active', !!on);
        if (labelOn != null) btn.textContent = on ? labelOn : labelOff;
      };
      domRoot.querySelectorAll('[data-fx]').forEach((b) => {
        b.addEventListener('click', () => {
          const name = b.dataset.fx;
          switch (name) {
            case 'airflow': { const v = !fx.airflow.visible; fx.airflow.setVisible(v); syncToggle(b, v); break; }
            case 'heatmap': { const v = !fx.heatmap.visible; fx.heatmap.setVisible(v); syncToggle(b, v); break; }
            case 'measure': { const v = !fx.measure.visible; fx.measure.setVisible(v); syncToggle(b, v); break; }
            case 'alerts':  { const v = !fx.alerts.visible;  fx.alerts.setVisible(v);  syncToggle(b, v); break; }
            case 'led':     { const v = !fx.led.visible;     fx.led.setVisible(v);     syncToggle(b, v); break; }
            case 'theme': {
              const next = fx.theme.current === 'dark' ? 'light' : 'dark';
              fx.theme.apply(next);
              syncToggle(b, next === 'light', '主题·亮', '主题·暗');
              break;
            }
            case 'touch': fx.touch.ensure(); syncToggle(b, true); break;
            case 'help': fx.help.toggle(); break;
            case 'onboard': fx.onboarding.maybeShow(); break;
            // 桥架系统：弱电 / 强电 / 配套三类一键显隐（默认全隐，激活后随布局自动重建）
            case 'bridge-weak':
            case 'bridge-strong':
            case 'bridge-aux': {
              const kind = name.slice('bridge-'.length);
              const v = !fx.bridge.isVisible(kind);
              fx.bridge.setVisible(kind, v);
              syncToggle(b, v);
              break;
            }
            // 静电地板 / 桥架「参数」菜单面板（互斥；active 态 = 面板展开）
            case 'bridge-config': { const v = app.toggleBridgePanel(); syncToggle(b, v); break; }
            case 'floor-config': { const v = app.toggleFloorPanel(); syncToggle(b, v); break; }
            // 桥架手绘布线：弱电 / 强电（进入 / 退出手绘模式；active 态由 start/stop 同步）
            case 'bridge-draw-weak':
            case 'bridge-draw-strong': {
              const kind = name.slice('bridge-draw-'.length);
              if (app.bridgeDraw && app.bridgeDraw.kind === kind) app.stopBridgeDraw();
              else app.startBridgeDraw(kind);
              app._syncBridgeDrawBtn();
              break;
            }
            default: break;
          }
        });
      });
      domRoot.querySelectorAll('[data-scenario]').forEach((b) => {
        b.addEventListener('click', () => {
          fx.scenarios.apply(b.dataset.scenario);
          domRoot.querySelectorAll('[data-scenario]').forEach((x) => x.classList.toggle('active', x === b));
        });
      });
    },

    // =======================================================================
    // 通用 UI 控制器 + 机柜 3D 详情视图
    // =======================================================================
    _initUI() {
      // domRoot：shadow 集成时为 shadowRoot（元素实际所在）；rootEl：宿主元素，
      // 作为 tooltip 视口坐标换算基准（shadowRoot 无 getBoundingClientRect）
      const ui = new UIController(domRoot, {
        onPreset: (p) => app.director[p](),
        onColorMode: (m) => app.racks.setColorMode(m),
        onSearch: (q) => {
          const query = (q || '').trim();
          if (!query) return;
          // 先精确匹配编号，再退化为大小写不敏感的子串模糊匹配
          const exact = app.racks.findById(query);
          if (exact) {
            app.racks.setSelected(exact); ui.showInfo(exact); app.director.focusRack(exact); ui.toast(`已定位 ${exact.id}`);
            return;
          }
          const ql = query.toLowerCase();
          const hits = (app.racks.racks || []).filter((r) => r.id && r.id.toLowerCase().includes(ql));
          if (hits.length === 1) {
            const r = hits[0];
            app.racks.setSelected(r); ui.showInfo(r); app.director.focusRack(r); ui.toast(`已定位 ${r.id}`);
          } else if (hits.length > 1) {
            app.racks.setSelected(hits[0]); app.director.focusRack(hits[0]);
            ui.toast(`匹配 ${hits.length} 台：${hits.slice(0, 5).map((x) => x.id).join('、')}${hits.length > 5 ? '…' : ''}`);
          } else {
            ui.toast(`未找到 ${query}`);
          }
        },
        onAction: async (act, arg) => {
          // 操作目标 = 整个选集。单选时它就是 selected，多选时三个动作
          // （删 / 转 / 移）都对整组生效，与键盘快捷键保持同一套语义。
          const list = app.racks.selectedRacks;
          if (!list.length) return;
          const multi = list.length > 1;
          // 布局锁定（含监控只读巡检态）时禁止经检查器改机柜——
          // 修复：locked 语义承诺「锁定后不可修改」，但此入口未做闸门
          if (app.locked) { app.ui.toast('布局已锁定，无法修改机柜', 'warn'); return; }
          if (act === 'del') {
            // 与键盘 Delete（下方 _initStage4 快捷键分支）保持同一防错级别：
            // 破坏性操作必须二次确认，避免检查器误触即丢失机柜及其设备清单
            // （现有撤销栈可恢复，但确认仍是第一道闸——撤销步数有限且会被后续操作挤掉）
            if (multi) {
              // 应用内确认弹窗（统一视觉 + 键盘可达 + 默认焦点在「取消」防误触）
              const ok = await confirmDialog(container, {
                title: '删除机柜',
                message: `确定删除选中的 ${list.length} 台机柜？`,
                detail: '这些机柜内的设备清单将一并删除，可用 Ctrl+Z 撤销。',
                confirmText: `删除 ${list.length} 台`,
              });
              if (!ok) return;
              const n = app.racks.removeMany(list);
              app._showSelInfo();
              app.ui.toast(`已删除 ${n} 台（Ctrl+Z 可撤销）`);
            } else {
              const ok = await confirmDialog(container, {
                title: '删除机柜',
                message: `确定删除机柜 ${app.racks.selected.id} 吗？`,
                detail: '该机柜内的设备清单将一并删除，可用 Ctrl+Z 撤销。',
                confirmText: '删除',
              });
              if (!ok) return;
              app.racks.remove(app.racks.selected);
              app._showSelInfo();
              app.ui.toast('已删除（Ctrl+Z 可撤销）');
            }
          }
          else if (act === 'rot') {
            // 旋转可能使 footprint 互换后与邻柜穿透，rotate 会回滚并返回 false
            if (multi) {
              const n = app.racks.rotateMany(list, roomDims);
              if (n < list.length) app.ui.toast(`${list.length - n} 台旋转后与相邻机柜重叠，已保持原位`, 'warn');
            } else if (!app.racks.rotate(app.racks.selected, roomDims)) {
              app.ui.toast('旋转后与相邻机柜重叠，已保持原位', 'warn');
            }
            app._showSelInfo();
          }
          else if (act === 'mv') {
            const [dx, dz] = arg.split(',').map(Number);
            const ok = multi
              ? app.racks.tryPlaceMany(list, dx, dz, roomDims) > 0
              : app.racks.tryPlace(app.racks.selected, app.racks.selected.x + dx, app.racks.selected.z + dz, roomDims);
            if (!ok) app.ui.toast('该位置与相邻机柜重叠，已保持在原位', 'warn');
            app._showSelInfo();
          }
        },
        onToggleBloom: (on) => app.sm.setBloom(on),
      }, rootEl);

      // —— 演示增强：视图截图导出（PNG）——
      const shotBtn = $('tb-shot');
      if (shotBtn) {
        shotBtn.addEventListener('click', () => {
          try {
            const url = app.sm.captureScreenshot();
            if (!url) { ui.toast('截图失败：渲染器不可用', 'warn'); return; }
            const a = document.createElement('a');
            a.href = url; a.download = `机房视图_${Date.now()}.png`; a.click();
            ui.toast('已保存当前 3D 视图为 PNG');
          } catch (e) {
            ui.toast('截图失败：' + (e && e.message || e), 'warn');
          }
        });
      }
      // —— 演示增强：游览模式（环绕 OrbitControls ↔ 自动巡检 PatrolController）——
      const tourBtns = domRoot.querySelectorAll('[data-tour]');
      tourBtns.forEach((b) => {
        b.addEventListener('click', () => {
          const mode = b.dataset.tour;
          if (mode === 'patrol') {
            const ok = app.setPatrol(true);
            if (!ok) { ui.toast('机柜为空，无法生成巡检路径', 'warn'); return; }
          } else {
            app.setPatrol(false);
          }
          tourBtns.forEach((x) => x.classList.toggle('active', x.dataset.tour === mode));
        });
      });

      const detail = new RackDetailView(app.sm);
      app.sm.detailView = detail;
      const detailBar = $('detail-bar');
      detail.onTitle = (rack, mode, rowRacks) => {
        const el = $('detail-title');
        if (mode === 'row' && rowRacks) {
          el.textContent = `整排机柜 · ${rowRacks.length} 台（19" 42U）`;
        } else if (rowRacks) {
          el.textContent = `机柜 ${rack.id} · 19" 42U（同排 ${rowRacks.length} 台）`;
        } else {
          el.textContent = `机柜 ${rack.id} · 19" 42U`;
        }
        // 整排切换按钮仅在同排多于 1 台时可用
        const sw = $('detail-switch');
        if (sw) {
          sw.disabled = !rowRacks || rowRacks.length <= 1;
          sw.textContent = mode === 'row' ? '单台特写' : '整排视图';
        }
      };
      // 详情视图内开门时给出提示
      detail.onDoorToggle = (res, which) => {
        const whichCn = which === 'front' ? '前门' : '后门';
        app.ui.toast(res.open ? `${whichCn}已打开` : `${whichCn}已关闭`);
      };
      // 详情视图内点击柜内设备 → 信息侧栏（数据已挂在 userData.device）
      detail.onDevicePick = (dv) => {
        if (app.ui) app.ui.showDeviceInfo(dv);
        if (app.ui) app.ui.toast(`设备 ${dv.n || dv.type || ''}`.trim());
      };
      // 单台特写 / 整排视图 切换
      const detailSwitch = $('detail-switch');
      if (detailSwitch) {
        detailSwitch.addEventListener('click', () => {
          const ok = detail.toggleMode();
          if (!ok) app.ui.toast('该机柜所在排仅此一台');
        });
      }
      const onDetailBack = () => {
        detail.hide();
        detailBar.classList.add('hidden');
        app._syncDetailReserve();
        app.ui.showInfo(null); // 退出 3D 详情时同步收起检查器面板
        if (app.stage === 4) $('equip-tools').classList.remove('hidden');
      };
      $('detail-back').addEventListener('click', onDetailBack);

      Object.assign(app, { ui, detail, detailBar });
      // 详情工具条显隐 / 窗口尺寸变化都会改变让位高度，统一在 resize 时重测
      onWin('resize', () => app._syncDetailReserve());
      app._syncDetailReserve();
      // detail-back 监听挂到 root 内的按钮上（组件销毁时按钮一并移除），无需单独解绑
    },

    // =======================================================================
    // 阶段流程：1 平面绘制 → 2 门窗布置 → 3 3D 预览 → 4 设备摆放
    // =======================================================================
    // =======================================================================
    // 画质档位控制：高清 / 均衡 / 流畅
    // 元素来自 tool-shell.html 的 #quality-seg（tool-shell 是标记唯一来源）
    // 手动选择会停用帧率自适应，避免自动档把用户选的高清又降回去
    // =======================================================================
    _initQualityUI() {
      const seg = $('quality-seg');
      if (!seg) return;
      const label = { high: '高清', balanced: '均衡', perf: '流畅' };
      seg.querySelectorAll('[data-quality]').forEach((b) => {
        b.addEventListener('click', () => {
          const q = b.dataset.quality;
          if (!app.sm._QL || !app.sm._QL[q]) return;
          app.sm.setQuality(q, true);
          seg.querySelectorAll('[data-quality]').forEach((x) => {
            x.classList.toggle('active', x.dataset.quality === q);
          });
          const rs = app.sm.getRenderSize();
          app.ui.toast(`画质：${label[q] || q} · 渲染 ${rs[0]}×${rs[1]}`
            + `${app.sm._msaaSamples ? ` · MSAA ${app.sm._msaaSamples}x` : ''}（已停用自动调档）`);
        });
      });
    },

    // 工作流导航轨折叠：摆放阶段最需要视野，可收起让出水平空间
    //  - 顶栏开关 #rail-toggle 手动切换
    //  - Tab 键快捷切换
    //  - 点击「锁定布局」= 摆放完成，自动折叠
    // 实现：折叠时在 domRoot 改写 --rail-w，引用该变量的元素自动跟随
    // =======================================================================
    _initRail() {
      const rail = $('stepper');
      const toggle = $('rail-toggle');
      Object.assign(app, { rail, railToggle: toggle, railCollapsed: false });

      const apply = (collapsed) => {
        app.railCollapsed = collapsed;
        const w = collapsed ? '58px' : '240px';
        // CSS 变量必须挂在**宿主元素**上：Vue 集成时 domRoot 是 shadowRoot，
        // 而 shadowRoot.style 为 undefined（不可设置样式），设在其上会抛错导致折叠失效。
        // 宿主元素上的自定义属性会向下继承进 shadowRoot，故设 rootEl。
        if (app.rootEl && app.rootEl.style) app.rootEl.style.setProperty('--rail-w', w);
        // 同步通知宿主（Vue 大屏覆盖层）折叠宽度，避免其让位列错位。
        // Vue 集成时 rootEl 是宿主 .datacenter-host（位于 Shadow DOM 内，
        // closest() 无法跨越 shadow 边界），须先取 shadow host 再上溯；
        // 独立运行时 rootEl 即普通容器，.closest 直接可用。
        let scopeRoot = rootEl;
        const shadowHost = rootEl.getRootNode && rootEl.getRootNode().host;
        if (shadowHost) scopeRoot = shadowHost;
        const hostScope = scopeRoot.closest && scopeRoot.closest('.dc-view');
        if (hostScope && hostScope.style) hostScope.style.setProperty('--dc-rail-w', w);
        if (rail) rail.classList.toggle('collapsed', collapsed);
        if (toggle) toggle.classList.toggle('collapsed', collapsed);
        if (toggle) {
          toggle.title = collapsed ? '展开工作流（Tab）' : '收起工作流（Tab）';
          const label = toggle.querySelector('.rt-label');
          if (label) label.textContent = collapsed ? '展开' : '工作流';
        }
      };
      app.setRailCollapsed = apply;
      app.toggleRail = () => apply(!app.railCollapsed);

      if (toggle) toggle.addEventListener('click', () => app.toggleRail());
      // 工作流收展快捷键。
      // 整改（可达性）：原实现全局拦截 Tab，导致焦点不在输入框时 Tab/Shift+Tab
      // 完全丧失焦点移动职能，键盘用户无法遍历界面（WCAG 2.1.1）。
      // 现仅在「焦点位于文档主体」即无具体控件获焦时拦截；
      // 焦点在按钮/输入框上时放行，恢复标准焦点导航。
      onWin('keydown', (e) => {
        if (e.key === 'Tab' && !isTyping(e) && (e.target === document.body || e.target === document.documentElement)) {
          e.preventDefault();
          app.toggleRail();
        }
      });
      apply(false);
    },

    _initStages() {
      const STEPS = {
        1: '① 规划基础 —— 定机房等级 / 输入规模尺寸 / 设功率密度锚点（供配电与暖通共用）',
        2: '② 建筑围护 —— 布置墙体门窗（防火门等级 / 疏散门 / 泄压口）并登记辅助区',
        3: '③ 系统配置 —— 五域工程参数：供配电 / 空调暖通 / 消防 / 安防 / 综合布线',
        4: '④ 设备布置 —— 按业务域分组摆放设备，支持批量摆放与单柜调整',
        5: '⑤ 校验联检 —— 容量匹配 / 跨域联动 / 合规清单自动核验，可跳转定位修正并生成报审草稿',
      };
      const stageHint = $('stage-hint');
      const wallPanel = $('wall-panel');
      Object.assign(app, { STEPS, stageHint, wallPanel, stage: 0, curWallKey: 'back', placementMode: null });

      // ---- 锁定/解锁 ----
      const lockBtn = $('lock-btn');
      app.lockBtn = lockBtn;
      const onLock = () => {
        app.locked = !app.locked;
        app.schedulePersist();
        app.syncLockUI();
        app.ui.toast(app.locked ? '布局已锁定：设备与墙面不可移动，点击机柜门板可开合' : '已解锁，可继续编辑布局');
        // 摆放完成（锁定）→ 自动收起工作流导航，把视野让给 3D 场景
        if (app.locked && app.setRailCollapsed) app.setRailCollapsed(true);
      };
      lockBtn.addEventListener('click', onLock);

      $('stepper').querySelectorAll('[data-stage]').forEach((b) => {
        b.addEventListener('click', () => app.setStage(Number(b.dataset.stage)));
      });
    },

    // P1-3-F/G：仅校验布局是否合法（返回布尔），不再即时写盘；
    // 保存动作委托给 schedulePersist（节流）/ flushPersist（强制）。
    async persistIfValid() {
      return ['back', 'left', 'front', 'right']
        .every((k) => validateWall(app.wallLayout[k]).length === 0);
    },

    // 节流保存：校验通过则 500ms 防抖后落盘一次，合并连续编辑（拖拽/改参）的写入风暴。
    schedulePersist() {
      if (!this.persistIfValid()) return;
      if (_persistTimer) clearTimeout(_persistTimer);
      _persistTimer = setTimeout(() => {
        _persistTimer = null;
        doPersistSave().catch((e) => {
          if (typeof console !== 'undefined') console.warn('[dc] schedulePersist save failed:', e && e.message);
          // 自动保存失败也必须让用户看到：否则编辑成果静默丢失，
          // 用户直到下次打开才发现布局回到旧版本。
          try {
            if (app.ui && typeof app.ui.toast === 'function') {
              app.ui.toast('自动保存失败，请手动点击「保存」确认', 'warn');
            }
          } catch (_) { /* 提示失败不影响主流程 */ }
        });
      }, 500);
    },

    // 强制立即落盘：取消待执行防抖计时器并 await 一次保存，确保 dispose 时最后一次编辑已落盘。
    async flushPersist() {
      if (!this.persistIfValid()) return false;
      if (_persistTimer) { clearTimeout(_persistTimer); _persistTimer = null; }
      // 以真实落盘结果为准。savePlan 在「IPC 失败 + localStorage 写入失败」
      // （存储配额耗尽 / 隐私模式禁用存储）时返回 false；此前无条件 return true，
      // 把「根本没存上」也上报成成功，用户会误以为布局已安全落盘。
      const ok = await doPersistSave();
      return !!ok;
    },

    syncLockUI() {
      const { lockBtn, ui, editor } = app;
      lockBtn.textContent = app.locked ? '解锁编辑' : '锁定布局';
      lockBtn.classList.toggle('active', app.locked);
      [app.dimW, app.dimD, app.dimH].forEach((i) => { i.disabled = app.locked; });
      $('equip-tools').querySelectorAll('button').forEach((b) => { b.disabled = app.locked; });
      ['wp-add-door', 'wp-add-window', 'wp-delete'].forEach((id) => {
        const b = $(id);
        if (b) b.disabled = app.locked || (id === 'wp-delete' && !editor.selectedId);
      });
      editor.locked = app.locked;
      // 锁定态同样禁止撤销/重做：那等于绕过锁定改布局
      app.syncUndoUI();
    },

    // 信息面板分发器：多选（≥2 台）走聚合面板，否则走单柜检查器。
    // 所有「选择变了就刷新面板」的调用点都走这里，避免每处各自判断选中数量、
    // 也避免多选后信息面板还停留在上一台单柜的幽灵数据。
    _showSelInfo() {
      const list = app.racks.selectedRacks;
      if (list.length > 1) app.ui.showInfoMulti(list);
      else app.ui.showInfo(app.racks.selected);
    },

    // ---- 撤销 / 重做 ----
    // RackSystem 已把阶段④的全部摆放操作（增 / 删 / 移 / 转 / 批量）记入命令栈，
    // 这里只做三件事：执行后落盘并刷新信息面板、同步按钮可用态、绑快捷键。
    // 按钮态由 onHistoryChange 事件驱动，不在渲染循环里轮询。
    _initUndoUI() {
      const btnU = $('tb-undo'), btnR = $('tb-redo');
      if (!btnU || !btnR) return;
      Object.assign(app, { undoBtn: btnU, redoBtn: btnR });
      const run = (dir) => {
        if (app.locked) { app.ui.toast('布局已锁定，请先解锁后再撤销', 'warn'); return; }
        const e = dir === 'undo' ? app.racks.undo() : app.racks.redo();
        if (!e) return;
        app.schedulePersist();
        // 撤销可能删掉/移走当前选中的机柜 → 信息面板必须跟着刷新，否则显示幽灵数据
        // （批量删除的撤销会连选集一起还原，故必须走多选分发器而非单柜 showInfo）
        app._showSelInfo();
        app.ui.toast(`${dir === 'undo' ? '已撤销' : '已重做'}：${e.label}`);
      };
      btnU.addEventListener('click', () => run('undo'));
      btnR.addEventListener('click', () => run('redo'));

      // 快捷键 Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y。与 Tab 拦截同一套判据：
      // 焦点在输入控件时不响应，避免和文本编辑、浏览器原生撤销打架。
      onWin('keydown', (e) => {
        if (isTyping(e) || !(e.ctrlKey || e.metaKey)) return;
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); run('undo'); }
        else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); run('redo'); }
      });
      app.syncUndoUI();
    },

    syncUndoUI() {
      if (!app.undoBtn) return;
      const usable = !app.locked;
      app.undoBtn.disabled = !usable || !app.racks.canUndo;
      app.redoBtn.disabled = !usable || !app.racks.canRedo;
      const u = app.racks._undoStack, r = app.racks._redoStack;
      app.undoBtn.title = u.length
        ? `撤销：${u[u.length - 1].label}（Ctrl+Z）` : '暂无可撤销的操作（Ctrl+Z）';
      app.redoBtn.title = r.length
        ? `重做：${r[r.length - 1].label}（Ctrl+Shift+Z）` : '暂无可重做的操作（Ctrl+Shift+Z）';
    },

    // 问题编号 → 跳转目标步骤（方案 7 跳转关系）。
    // 供两处共用：阶段④入口闸门（告知该去哪改）与阶段⑤校验联检面板（点击跳转）。
    // 整改 F3：原实现按前缀粗映射，多处指错步骤——G-FIRE-10（灭火剂选型）
    // 竟落到①、G-HVAC-01/02（加空调）落到③、G-SEC-02/03（门禁子模型）落到③。
    // 改为按 code 精确查表，判据=「该项数据在哪个步骤产生/修改」：
    //   ② 建筑围护——门数量/宽高/防火等级、门禁双向受控/fireRelease（门窗属性面板）
    //   ③ 系统配置——五域量化参数（等级/密度/UPS/柴发/灭火剂/温湿度/链路/录像天数）
    //   ④ 设备布置——判据依赖机柜摆放数量的项（空调/列头柜/摄像机/入侵探测器/
    //      电子巡查点/灭火控制器），只能摆到④补齐
    //   未知 code 兜底①。
    _issueJumpStage(code) {
      const c = String(code || '');
      if (['G-FIRE-05', 'G-FIRE-06', 'G-FIRE-07', 'G-SEC-02', 'G-SEC-03'].includes(c)) return 2;
      if (['G-HVAC-01', 'G-HVAC-02', 'G-PWR-06', 'G-FIRE-04', 'G-SEC-01', 'G-SEC-05', 'G-SEC-10'].includes(c)) return 4;
      if (c.startsWith('G-PWR') || c.startsWith('G-HVAC') || c.startsWith('G-FIRE')
        || c.startsWith('G-SEC') || c.startsWith('G-CAB')) return 3;
      return 1;
    },

    setStage(n, skipGate = false) {
      // 整改 G-PWR-01 验收③：存在 error 级工程校验（如未选机房等级）禁止进入设备摆放阶段。
      // 已在阶段④时放行（不强制踢出），仅拦截「进入」动作。
      // 整改（设计 P1-C）：闸门原先只 toast 第一项错误，用户不知道该去哪改；
      // 现列出前 3 项并指明目标步骤，与阶段⑤「校验联检」的跳转规则同源。
      // 整改 F2：skipGate——监控大屏（只读巡检态）下用户无权也无力修改工程配置，
      // 闸门 toast「请去③修正」却连 stepper 都隐藏，属于误导；setInspectMode
      // 显式传 skipGate=true 绕过。
      if (n === 4 && !skipGate && app.stage !== 4) {
        const errs = validatePlan(eng, app.racks.racks, app.wallLayout, roomDims).filter((i) => i.level === 'error');
        // 整改 F1：摆放类 error（G-HVAC-01/02 总制冷量/冗余）的修复动作
        // （增删空调机柜）本身就在阶段④执行，原闸门对所有 error 一律拦截会死锁——
        // 默认种子 660kW IT 需 726kW 制冷而仅 400kW，用户被困在③进不了④补空调。
        // 改为：仅「配置/建筑类」error 拦截进入；摆放类放行进入④并以 info 提示
        // 在本阶段补齐，步骤⑤校验联检仍照常标红（renderValidatePanel 不过滤）。
        const blocking = errs.filter((i) => !PLACEMENT_CLASS_CODES.includes(i.code));
        if (blocking.length) {
          const stages = [...new Set(blocking.map((i) => app._issueJumpStage(i.code)))].sort();
          const where = stages.map((s) => `步骤${'①②③④⑤'[s - 1]}`).join('、');
          const head = blocking.slice(0, 3).map((i) => `· ${i.code} ${i.msg}`).join('\n');
          const more = blocking.length > 3 ? `\n…等共 ${blocking.length} 项（详见步骤⑤校验联检）` : '';
          app.ui.toast(`工程校验未通过，请先到 ${where} 修正：\n${head}${more}`, 'error', 6000);
          return;
        }
        const placementErrs = errs.filter((i) => PLACEMENT_CLASS_CODES.includes(i.code));
        if (placementErrs.length) {
          const codes = [...new Set(placementErrs.map((i) => i.code))].join('、');
          app.ui.toast(`制冷量暂不满足需求（${codes}），请在本阶段补齐空调机柜，完成后回步骤⑤复查`, 'info', 6000);
        }
      }
      app.stage = n;
      // 切换阶段时退出详情视图
      if (app.detail.active) {
        app.detail.hide();
        app.detailBar.classList.add('hidden');
        app._syncDetailReserve();
      }
      app.placementMode = null;
      $('stepper').querySelectorAll('[data-stage]').forEach((b) => {
        b.classList.toggle('active', Number(b.dataset.stage) === n);
      });
      // 方案：5 步建造逻辑（①规划基础 ②建筑围护 ③系统配置 ④设备布置 ⑤校验联检）
      // 菜单坞（静电地板/桥架参数）打开期间让位：阶段坞整体隐藏，避免同锚点叠放
      if (app._menuOpen) {
        for (const id of ['plan-tools', 'aux-panel', 'eng-panel', 'equip-tools', 'validate-panel']) {
          const el = $(id);
          if (el) el.classList.add('hidden');
        }
      } else {
        app._showStageDocks();
      }
      app.wallPanel.classList.toggle('hidden', n !== 2);
      app.stageHint.textContent = app.STEPS[n];
      if (n === 1) { app.syncDimInputs(); } // 自由视角模式：切阶段不再强制飞顶视
      if (n === 2) { app.switchWall(app.curWallKey); app.refreshWallStatus(); }
      if (n === 5) app.renderValidatePanel(); // ⑤ 校验联检：汇总渲染问题清单
      if (n === 4 && app.setRailCollapsed) app.setRailCollapsed(true); // 摆放阶段需要视野，自动收起工作流
      if (n !== 4 && app.setRailCollapsed && !app.locked) app.setRailCollapsed(false); // 回到前置阶段自动展开
      if (n !== 4) { app.ui.showInfo(null); app.racks.setSelected(null); } // 右上角让位给门窗面板
      app.racks.setHovered(null);
      app.ui.hideTooltip();
      app.syncLockUI();
      app.schedulePersist(); // 自动保存（异步，无需等待）
    },

    // =======================================================================
    // 菜单坞：静电地板铺设 / 桥架铺设参数（与阶段坞共用左下锚点，互斥显隐）
    // =======================================================================
    /** 按当前阶段显示对应阶段坞（菜单坞打开时不调用） */
    _showStageDocks() {
      const n = app.stage;
      $('plan-tools').classList.toggle('hidden', n !== 1);
      $('aux-panel').classList.toggle('hidden', n !== 2);
      $('eng-panel').classList.toggle('hidden', n !== 3);
      $('equip-tools').classList.toggle('hidden', n !== 4);
      const valPanel = $('validate-panel');
      if (valPanel) valPanel.classList.toggle('hidden', n !== 5);
    },

    /** 开关「桥架铺设参数」面板；与地板面板互斥。返回最终展开态。 */
    toggleBridgePanel(force) {
      if (!app._bridgePanel) return false;
      const next = app._bridgePanel.toggle(force);
      if (next && app._floorPanel && app._floorPanel.isOpen()) app._floorPanel.toggle(false);
      app._syncMenuDock();
      return next;
    },

    /** 开关「静电地板铺设」面板；与桥架面板互斥。返回最终展开态。 */
    toggleFloorPanel(force) {
      if (!app._floorPanel) return false;
      const next = app._floorPanel.toggle(force);
      if (next && app._bridgePanel && app._bridgePanel.isOpen()) app._bridgePanel.toggle(false);
      app._syncMenuDock();
      return next;
    },

    /** 菜单坞与阶段坞的互斥同步 + 顶栏「参数」按钮 active 态 */
    _syncMenuDock() {
      const open = !!(app._floorPanel && app._floorPanel.isOpen())
        || !!(app._bridgePanel && app._bridgePanel.isOpen());
      app._menuOpen = open;
      if (open) {
        for (const id of ['plan-tools', 'aux-panel', 'eng-panel', 'equip-tools', 'validate-panel']) {
          const el = $(id);
          if (el) el.classList.add('hidden');
        }
      } else {
        app._showStageDocks();
      }
      const fb = domRoot.querySelector('[data-fx="floor-config"]');
      if (fb) fb.classList.toggle('active', !!(app._floorPanel && app._floorPanel.isOpen()));
      const bb = domRoot.querySelector('[data-fx="bridge-config"]');
      if (bb) bb.classList.toggle('active', !!(app._bridgePanel && app._bridgePanel.isOpen()));
    },

    /** 无条件关闭两个菜单坞（不弹未保存确认；监控态切换/销毁时用） */
    _closeMenuDocks() {
      if (app._floorPanel && app._floorPanel.isOpen()) app._floorPanel.closeNow();
      if (app._bridgePanel && app._bridgePanel.isOpen()) app._bridgePanel.closeNow();
      app._syncMenuDock();
    },

    // =======================================================================
    // 桥架手绘布线：进入 / 退出 + 实时预览 + 快捷键支撑（与 bridgeDrawPanel.js 联动）
    // 进入手绘后禁用相机旋转，左键点击在地面 / 墙面落点，节点自动轴对齐；
    // 转折处由 BridgeSystem 自动补直角弯头；强弱电各走各组、竖向分层兜底避免冲突。
    // =======================================================================
    startBridgeDraw(kind) {
      if (kind !== 'weak' && kind !== 'strong') return;
      if (app.fpsActive || (app.detail && app.detail.active)) {
        app.ui.toast('请先退出当前视图再手绘桥架', 'warn'); return;
      }
      if (app.bridgeDraw.kind && app.bridgeDraw.kind !== kind) app.stopBridgeDraw();
      app._closeMenuDocks(); // 收起参数菜单坞，释放 3D 视图
      app.bridgeDraw.kind = kind;
      app.bridgeDraw.mount = 'over';
      app._fx.bridge.beginPath(kind, 'over');
      // 确保该类桥架可见以便预览绘制结果（隐藏时自动打开）
      if (!app._fx.bridge.isVisible(kind)) {
        app._fx.bridge.setVisible(kind, true);
        const tb = domRoot.querySelector(`[data-fx="bridge-${kind}"]`);
        if (tb) tb.classList.add('active');
      }
      if (app.sm.controls) app.sm.controls.enabled = false; // 绘制时禁用旋转，避免点击被误判为拖拽视角
      if (app._bridgeDrawPanel) app._bridgeDrawPanel.openFor(kind);
      app._renderBridgeDrawPreview();
      const label = kind === 'weak' ? '弱电' : '强电';
      app.ui.toast(`进入${label}桥架手绘：左键点击落点，Enter 完成，Esc 退出`, 'info');
    },

    stopBridgeDraw() {
      if (!app.bridgeDraw || !app.bridgeDraw.kind) return;
      const kind = app.bridgeDraw.kind;
      app._fx.bridge.cancelPath(kind); // 丢弃未完成的草稿（已保存路径保留）
      app._clearBridgeDrawPreview();
      if (app.sm.controls) app.sm.controls.enabled = true;
      app.bridgeDraw.kind = null;
      if (app._bridgeDrawPanel) app._bridgeDrawPanel.closeNow();
      app._syncBridgeDrawBtn();
    },

    _syncBridgeDrawBtn() {
      for (const k of ['weak', 'strong']) {
        const btn = domRoot.querySelector(`[data-fx="bridge-draw-${k}"]`);
        if (btn) btn.classList.toggle('active', !!(app.bridgeDraw && app.bridgeDraw.kind === k));
      }
    },

    /** 屏幕坐标 → 落点：沿墙模式吸附墙内表面；其余模式取地面投影 */
    _bridgeDrawPoint(cx, cy) {
      const kind = app.bridgeDraw && app.bridgeDraw.kind;
      if (!kind) return null;
      const mount = app.bridgeDraw.mount;
      if (mount === 'wall' && app.room && app.room.wallMeshes && app.room.wallMeshes.length) {
        const hits = app.sm.pick(app.room.wallMeshes, cx, cy);
        if (hits && hits.length) {
          let o = hits[0].object;
          while (o && !o.userData.wallKey) o = o.parent;
          const p = hits[0].point;
          if (o && o.userData.wallKey && Number.isFinite(p.x) && Number.isFinite(p.z)) {
            return { x: +p.x.toFixed(3), z: +p.z.toFixed(3), wallKey: o.userData.wallKey };
          }
        }
      }
      const g = app.sm.rayPoint(cx, cy, app.floorPlane);
      // 射线与地面平行/未命中时交点坐标为 NaN，须丢弃，避免污染预览/几何
      if (!g || !Number.isFinite(g.x) || !Number.isFinite(g.z)) return null;
      return { x: +g.x.toFixed(3), z: +g.z.toFixed(3) };
    },

    /** 重绘手绘预览：用折线 + 节点球 + 光标虚线展示当前草稿（不进场景持久层） */
    _renderBridgeDrawPreview() {
      const kind = app.bridgeDraw && app.bridgeDraw.kind;
      if (!kind) { app._clearBridgeDrawPreview(); return; }
      if (!app._bridgeDrawPreview) {
        app._bridgeDrawPreview = new THREE.Group();
        app._bridgeDrawPreview.name = 'bridge-draw-preview';
        app.sm.scene.add(app._bridgeDrawPreview);
      }
      const grp = app._bridgeDrawPreview;
      for (const c of grp.children) { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }
      grp.clear();
      const draft = app._fx.bridge.getDraft(kind);
      if (!draft || !draft.points.length) return;
      const cfg = app._fx.bridge.getConfig();
      const y = (cfg[kind] && cfg[kind].layers && cfg[kind].layers[0]) ? cfg[kind].layers[0].y : 3.0;
      const pts = draft.points;
      const color = kind === 'weak' ? 0x38bdf8 : 0xf59e0b;
      if (pts.length >= 2) {
        const v3 = pts.map((p) => new THREE.Vector3(p.x, y, p.z));
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(v3),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }),
        );
        grp.add(line);
      }
      for (const p of pts) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color }));
        m.position.set(p.x, y, p.z);
        grp.add(m);
      }
      if (app._bridgeDrawCursor) {
        const last = pts[pts.length - 1];
        const lc = [new THREE.Vector3(last.x, y, last.z), new THREE.Vector3(app._bridgeDrawCursor.x, y, app._bridgeDrawCursor.z)];
        const ln = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(lc),
          new THREE.LineDashedMaterial({ color, dashSize: 0.16, gapSize: 0.1, transparent: true, opacity: 0.55 }),
        );
        ln.computeLineDistances();
        grp.add(ln);
        const cm = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        cm.position.set(app._bridgeDrawCursor.x, y, app._bridgeDrawCursor.z);
        grp.add(cm);
      }
    },

    _clearBridgeDrawPreview() {
      if (!app._bridgeDrawPreview) return;
      const grp = app._bridgeDrawPreview;
      for (const c of grp.children) { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }
      grp.clear();
      app._bridgeDrawCursor = null;
    },

    /** 完成当前路径：≥2 节点才保存，否则提示；保存后重开草稿，便于连续绘制多条路径 */
    _finishBridgeDrawPath() {
      const kind = app.bridgeDraw && app.bridgeDraw.kind;
      if (!kind) return;
      const p = app._fx.bridge.finishPath(kind);
      // 重开一条草稿（敷设方式沿用当前选择），用户无需重新进入手绘即可继续画下一条
      app._fx.bridge.beginPath(kind, app.bridgeDraw.mount || 'over');
      app._renderBridgeDrawPreview();
      if (app._bridgeDrawPanel) app._bridgeDrawPanel.render();
      const label = kind === 'weak' ? '弱电' : '强电';
      if (p) app.ui.toast(`${label}桥架路径已保存（${p.points.length} 个节点），可继续绘制下一条`, 'info');
      else app.ui.toast('至少需要 2 个节点才能生成路径', 'warn');
    },

    // 只读巡检态：监控大屏模式下启用。锁定布局（禁用所有编辑操作）+ 切到阶段4
    // （复用阶段4已有的「点击机柜→详情」「悬停提示」逻辑，而拖拽/摆放/键盘删除均被
    // locked 拦截），从而在默认入口即可 inspection 而不误改机房。规划模式则恢复阶段1。
    setInspectMode(on) {
      app.locked = !!on;
      // 人物与模式联动：监控/巡检态按需加载并自动巡逻；规划态隐藏并停止走动
      // （用户要求：机房规划中不需要人物走动）
      if (on) {
        app._ensureAvatar().then(() => {
          // 加载期间可能已切回规划态，此时不显示、不巡逻
          if (!app.locked) return;
          if (!app.fpsActive) app.avatar.setVisible(true);
          if (!app.fpsActive && !(app.avatar.patrol && app.avatar.patrol.active)) {
            // startPatrol 返回 false = 当前布局连不出安全巡逻路径（极端布局），
            // 此时不弹「开始巡逻」提示，人物原地站立待命
            if (app.avatar.startPatrol(roomDims)) {
              app.ui && app.ui.toast('值守人员已就位并开始自动巡逻，点击人物可进入第一人称视角');
            }
          }
        }).catch(() => { /* 加载失败已 console.warn，此处静默 */ });
      } else if (app.avatar && app.avatar.ready) {
        app.avatar.stopPatrol();
        app.avatar.setVisible(false);
      }
      // 整改 F2：只读巡检态显式绕过④入口闸门（skipGate）——监控大屏下 stepper
      // 已隐藏、布局已锁定，闸门既无处可去也无权修改，误拦只会让场景停留在
      // 错误阶段并弹出误导性 toast。
      app.setStage(on ? 4 : 1, true);
      // 菜单坞（静电地板/桥架参数）是规划态编辑能力：进监控态无条件关闭，
      // 与 F2「只读巡检」口径一致（不弹未保存确认，避免误导性交互）。
      if (on) app._closeMenuDocks();
      // 只读巡检态显式收起编辑类面板：stepper 由 Vue 侧 applyShadowVisibility 隐藏，
      // 此处对 plan-tools 再做一次防御性隐藏，确保监控大屏永不暴露规划工具（审查 #1）。
      if (on) {
        const pt = $('plan-tools');
        if (pt) pt.classList.add('hidden');
        const st = $('stepper');
        if (st) st.classList.add('hidden');
      }
    },

    // 监控大屏左右面板遮挡宽度（px）：Vue 侧测量实际覆盖范围后传入。
    // 引擎据此把渲染画面向面板间净空区平移，使机房中心不被左侧统计列压住。
    setOverlayPan(leftPx, rightPx) {
      if (app.sm && typeof app.sm.setOverlayPan === 'function') {
        app.sm.setOverlayPan(leftPx, rightPx);
      }
    },

    // 模糊检索：返回匹配机柜列表（按编号/类型/柜内设备名），供大屏搜索框下拉使用
    search(query) {
      const q = (query || '').trim().toLowerCase();
      if (!q) return [];
      const all = app.racks.racks || [];
      const seen = new Set();
      const out = [];
      for (const r of all) {
        const hitRack = (r.id && r.id.toLowerCase().includes(q))
          || (TYPE_LABEL[r.type] || '').toLowerCase().includes(q);
        // F3：扩展匹配机柜内设备名称/类别（设备清单字段 n/category）
        let hitDev = false;
        const devs = r.devices;
        if (Array.isArray(devs) && devs.length) {
          hitDev = devs.some((d) => d && (
            (d.n && d.n.toLowerCase().includes(q))
            || (d.category && d.category.toLowerCase().includes(q))
          ));
        }
        if (hitRack || hitDev) {
          if (seen.has(r.id)) continue;
          seen.add(r.id);
          out.push({ id: r.id, type: (TYPE_LABEL[r.type] || r.type), status: r.status });
          if (out.length >= 20) break;
        }
      }
      return out;
    },

    // 按编号飞行定位（大屏搜索下拉点击 / 告警列表点击共用）
    focusRackById(id) {
      const r = app.racks.findById(id);
      if (!r) return false;
      app.racks.setSelected(r);
      if (app.ui) app.ui.showInfo(r);
      app.director.focusRack(r);
      if (app.ui) app.ui.toast(`已定位 ${r.id}`);
      return true;
    },

    // =======================================================================
    // 阶段1：平面绘制（房间边缘拖拽 + 数值输入）
    // =======================================================================
      // =====================================================================
      // 整改：工程配置面板（五域量化入口）。机房等级为联动根（G-PWR-01），
      // 功率密度为供配电↔暖通共用锚点（G-PWR-02 ↔ G-HVAC-01/08）。
      // =====================================================================
      // =====================================================================
      // 整改：顶栏扩展（方案 4.2 三组重构）。
      //  - 显示设置齿轮：收纳画质/泛光（渲染偏好下移，D3）
      //  - 保存 / 导出：创建动作进入操作组
      //  - 工程配置五域 Tab：锚点滚动定位（步骤③）
      // =====================================================================
      _initTopbarExtras() {
        const gear = $('tb-gear');
        const pop = $('gear-pop');
        if (gear && pop) {
          gear.addEventListener('click', (e) => {
            e.stopPropagation();
            pop.classList.toggle('hidden');
          });
          // 点击别处关闭（window 级登记，dispose 统一解绑）
          onWin('click', (e) => {
            if (pop.classList.contains('hidden')) return;
            if (pop.contains(e.target) || e.target === gear) return;
            pop.classList.add('hidden');
          });
        }
        const saveBtn = $('tb-save');
        if (saveBtn) saveBtn.addEventListener('click', async () => {
          // 显式保存必须拿到真实落盘结果再反馈。用 flushPersist（立即落盘并
          // 返回结果）而非 schedulePersist（只排队、无结果），否则校验不通过或
          // 存储不可用时仍弹「方案已保存」，用户会误以为布局已安全存下。
          const ok = await app.flushPersist();
          app.ui.toast(
            ok ? '方案已保存' : '方案未保存：布局校验未通过，或本地存储不可用（配额已满 / 浏览器禁用存储）',
            ok ? 'info' : 'error',
          );
        });
        const expBtn = $('tb-export');
        if (expBtn) expBtn.addEventListener('click', () => {
          // 复用既有导出实现（wp-export：room-plan.json 下载）
          const wp = $('wp-export');
          if (wp) wp.click();
          else app.ui.toast('导出控件未就绪');
        });
        // 五域 Tab → 锚点滚动
        const tabs = domRoot.querySelectorAll('#eng-tabs [data-eng-tab]');
        tabs.forEach((t) => {
          t.addEventListener('click', () => {
            tabs.forEach((x) => x.classList.remove('active'));
            t.classList.add('active');
            const sec = domRoot.querySelector(`#eng-panel [data-eng-sec="${t.dataset.engTab}"]`);
            if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        });
      },

      syncEngReadout() {
        const q = (id) => domRoot.querySelector('#' + id);
        const cap = computeCapacity(eng, app.racks.racks.filter((r) => r.type === 'server').length);
        const ro = q('eng-cap-readout');
        if (ro) {
          ro.innerHTML = cap.P_IT > 0
            ? `IT 有功 <b>${Math.round(cap.P_IT)}</b> kW（${cap.N} 柜 × ${cap.d} kW）<br>`
              + `总冷量需求 <b>${Math.round(cap.cooling)}</b> kW · 非 IT 电 ≈${Math.round(cap.nonIT)} kW<br>`
              + `UPS 视在 ≈<b>${Math.round(cap.upsVA)}</b> kVA${eng.hvac.keyCoolingOnUps !== false ? '（含关键制冷）' : ''} · 柴发 ≈${Math.round(cap.genKVA)} kVA · 列头柜建议 ${cap.rppCount} 台`
            : '录入密度与机柜数后自动核算';
        }
        const issues = validatePlan(eng, app.racks.racks, app.wallLayout, roomDims);
        const err = issues.filter((i) => i.level === 'error').length;
        const warn = issues.filter((i) => i.level !== 'error').length;
        const badge = q('eng-warn');
        if (badge) {
          badge.classList.toggle('ok', err === 0 && warn === 0);
          badge.classList.toggle('error', err > 0);
          badge.title = err ? `${err} 项错误 / ${warn} 项提示` : warn ? `${warn} 项提示` : '工程校验全部通过';
        }
        app._engIssues = issues;
      },

        // =====================================================================
      // 整改：步骤⑤ 校验联检面板。复用 validatePlan() 输出渲染问题清单，
      // 点击问题项跳回对应步骤/域定位修正（方案 7：问题可定位）。
      // =====================================================================
      renderValidatePanel() {
        const list = $('val-list');
        if (!list) return;
        app.syncEngReadout();
        const issues = app._engIssues || [];
        const errs = issues.filter((i) => i.level === 'error');
        const warns = issues.filter((i) => i.level !== 'error');
        const badge = $('val-warn');
        if (badge) {
          badge.classList.toggle('ok', errs.length === 0 && warns.length === 0);
          badge.classList.toggle('error', errs.length > 0);
          badge.title = errs.length ? `${errs.length} 项未通过 / ${warns.length} 项提示` : warns.length ? `${warns.length} 项提示` : '全部通过';
        }
        if (!issues.length) {
          list.innerHTML = '<div class="eng-note">✅ 工程校验全部通过，可生成报审草稿交付。</div>';
          return;
        }
        // 问题编号 → 跳转目标步骤（方案 7 跳转关系）。
        // 提为 app._issueJumpStage 共用：阶段④入口闸门也要用同一映射告知去向
        // （整改 P1-C：闸门原先只说第一项错，不告诉用户该去哪改）。
        const jump = (code) => app._issueJumpStage(code);
        const rows = issues.map((it) => {
          const cls = it.level === 'error' ? 'val-err' : (it.level === 'warn' ? 'val-warn' : 'val-info');
          const tag = it.level === 'error' ? '🔴' : (it.level === 'warn' ? '🟠' : '🔵');
          return `<div class="val-row ${cls}" data-jump="${jump(it.code)}" data-code="${it.code}" title="点击跳转到对应步骤">
            <span class="val-tag">${tag}</span>
            <span class="val-code">${it.code}</span>
            <span class="val-msg">${it.msg}</span>
          </div>`;
        }).join('');
        // 合规检查清单（GB 逐条：自动核验 + 人工确认）
        const comp = complianceStatus(eng, issues);
        const compRows = comp.map((c) => {
          const icon = c.state === 'error' ? '🔴' : c.state === 'warn' ? '🟠' : c.state === 'info' ? '🔵' : c.state === 'manual' ? '✅' : '⬜';
          const st = c.state === 'error' ? '未通过' : (c.state === 'warn' || c.state === 'info') ? '提示' : c.state === 'manual' ? '已确认' : '待核验';
          return `<div class="comp-row ${c.state}" data-code="${c.code}">
            <span class="comp-icon">${icon}</span>
            <span class="comp-cat">${c.cat}</span>
            <span class="comp-text">${c.text}${c.msg ? '<em>— ' + c.msg + '</em>' : ''}</span>
            <span class="comp-st">${st}</span>
            <label class="comp-chk" title="人工确认该条"><input type="checkbox" data-comp="${c.code}" ${c.done ? 'checked' : ''}></label>
          </div>`;
        }).join('');
        const compPass = comp.filter((c) => c.state === 'pass' || c.state === 'manual').length;
        list.innerHTML = `<div class="val-sum">🔴 ${errs.length} 项未通过 · 🟠🔵 ${warns.length} 项提示</div>` + rows
          + `<div class="comp-head">合规检查清单<em>自动核验通过 ${compPass}/${comp.length} · 其余可人工确认（量级提示，正式符合性以资质单位核定为准）</em></div>`
          + compRows;
        list.querySelectorAll('.val-row').forEach((row) => {
          row.addEventListener('click', () => {
            const target = Number(row.dataset.jump);
            app.setStage(target);
            app.ui.toast(`已跳转到步骤 ${target}，请修正 ${row.dataset.code}`);
          });
        });
        // 合规清单人工确认勾选（持久化到 engineering.compliance）
        list.querySelectorAll('[data-comp]').forEach((cb) => {
          cb.addEventListener('change', () => {
            eng.compliance = eng.compliance || {};
            eng.compliance[cb.dataset.comp] = cb.checked;
            app.schedulePersist();
            app.ui.toast(cb.checked ? '已人工确认该条' : '已取消人工确认');
          });
        });
      },

      _initValidateUI() {
        // 报审草稿导出：plan + engineering + 校验结果（G-PWR-13）
        const btn = $('val-export');
        if (!btn) return;
        btn.addEventListener('click', () => {
          const plan = {
            report: 'datacenter-precheck-draft',
            generatedAt: new Date().toISOString(),
            roomId: DEFAULT_ROOM_ID,
            dims: { ...roomDims },
            walls: app.wallLayout,
            racks: app.racks.toPlain(),
            locked: app.locked,
            engineering: JSON.parse(JSON.stringify(eng)),
            validation: (app._engIssues || []).map((i) => ({ code: i.code, level: i.level, msg: i.msg })),
          };
          const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = '机房报审草稿.json';
          a.click();
          URL.revokeObjectURL(a.href);
          app.ui.toast('报审草稿已生成（含五域配置与校验结果）');
        });
      },

    _initEngPanel() {
        const q = (id) => domRoot.querySelector('#' + id);
        if (!q('eng-tier')) return;
        const after = () => { app.syncEngReadout(); app.schedulePersist(); };
        const bindVal = (id, apply) => {
          const el = q(id);
          if (!el) return;
          el.addEventListener('change', () => { apply(el); after(); });
        };
        bindVal('eng-tier-reason', (el) => { eng.tierReason = el.value.trim(); });
        bindVal('eng-density', (el) => { const v = Number(el.value); eng.density = isFinite(v) && v > 0 ? v : 5; });
        bindVal('eng-ups-kva', (el) => { const v = Number(el.value); eng.ups.capacity = isFinite(v) && v >= 0 ? v : 0; });
        bindVal('eng-ups-red', (el) => { eng.ups.redundancy = el.value; });
        bindVal('eng-ups-backup', (el) => { const v = Number(el.value); eng.ups.backupMin = isFinite(v) && v >= 0 ? v : 0; });
        bindVal('eng-ups-battery', (el) => { eng.ups.battery = el.value; });
        bindVal('eng-ups-bypass', (el) => { eng.ups.bypass = !!el.checked; });
        bindVal('eng-keycooling', (el) => { eng.hvac.keyCoolingOnUps = !!el.checked; });
        bindVal('eng-load-form', (el) => { eng.loadForm = el.value; });
        bindVal('eng-ground-form', (el) => { eng.grounding.form = el.value; });
        bindVal('eng-ground-r', (el) => { const v = Number(el.value); eng.grounding.resistance = isFinite(v) && v > 0 ? v : 1; });
        bindVal('eng-gen', (el) => { eng.generator.enabled = !!el.checked; });
        bindVal('eng-gen-kva', (el) => { const v = Number(el.value); eng.generator.capacity = isFinite(v) && v >= 0 ? v : 0; });
        bindVal('eng-gen-fuel', (el) => { const v = Number(el.value); eng.generator.fuelHours = isFinite(v) && v >= 0 ? v : 0; });
        bindVal('eng-air-type', (el) => { eng.hvac.airType = el.value; });
        bindVal('eng-cold-src', (el) => { eng.hvac.coldSource = el.value; });
        bindVal('eng-hvac-red', (el) => { eng.hvac.redundancy = el.value; });
        bindVal('eng-temp-set', (el) => { const v = Number(el.value); eng.hvac.setTemp = isFinite(v) ? v : 24; });
        bindVal('eng-temp-min', (el) => { const v = Number(el.value); eng.hvac.tempMin = isFinite(v) ? v : 18; });
        bindVal('eng-temp-max', (el) => { const v = Number(el.value); eng.hvac.tempMax = isFinite(v) ? v : 27; });
        bindVal('eng-rh-set', (el) => { const v = Number(el.value); eng.hvac.humidity = isFinite(v) ? v : 45; });
        bindVal('eng-rh-min', (el) => { const v = Number(el.value); eng.hvac.rhMin = isFinite(v) ? v : 40; });
        bindVal('eng-rh-max', (el) => { const v = Number(el.value); eng.hvac.rhMax = isFinite(v) ? v : 60; });
        bindVal('eng-dew-min', (el) => { const v = Number(el.value); eng.hvac.dewMin = isFinite(v) ? v : 5.5; });
        bindVal('eng-dew-max', (el) => { const v = Number(el.value); eng.hvac.dewMax = isFinite(v) ? v : 15; });
        bindVal('eng-fire-agent', (el) => { eng.fire.agent = el.value; });
        bindVal('eng-relief', (el) => { const v = Number(el.value); eng.fire.reliefArea = isFinite(v) && v >= 0 ? v : 0; });
        bindVal('eng-vesda', (el) => { eng.fire.vesda = !!el.checked; });
        bindVal('eng-risk', (el) => { eng.security.riskLevel = el.value; });
        bindVal('eng-recdays', (el) => { const v = Number(el.value); eng.security.recDays = isFinite(v) && v >= 1 ? v : 30; });
        bindVal('eng-bitrate', (el) => { const v = Number(el.value); eng.security.bitrate = isFinite(v) && v > 0 ? v : 4; });
        bindVal('eng-patrol-speed', (el) => {
          const v = Number(el.value);
          eng.patrolSpeed = isFinite(v) ? Math.max(0.3, Math.min(2, v)) : 0.85;
          if (app.avatar) app.avatar.setPatrolSpeed(eng.patrolSpeed);
        });
        bindVal('eng-cable-cat', (el) => { eng.cable.cat = el.value; });
        bindVal('eng-cable-fiber', (el) => { eng.cable.fiber = el.value; });
        bindVal('eng-link', (el) => { const v = Number(el.value); eng.cable.linkLen = isFinite(v) && v > 0 ? v : 60; });
        bindVal('eng-aux-area', (el) => { const v = Number(el.value); eng.auxArea = isFinite(v) ? v : 0; });
        bindVal('eng-aux-load', (el) => { const v = Number(el.value); eng.auxFloorLoad = isFinite(v) ? v : 0; });
        // 机房等级（联动根）：切换即刷新下游口径
        const tierEl = q('eng-tier');
        tierEl.addEventListener('change', () => {
          eng.tier = tierEl.value;
          app.syncEngReadout();
          app.schedulePersist();
          if (tierEl.value) app.ui.toast(`机房等级已设为 ${tierEl.value} 级，UPS/空调/安防口径已按等级联动`);
        });
        // 辅助区勾选（融合项 B：电池室三域引用登记）
        domRoot.querySelectorAll('#eng-aux input[data-aux]').forEach((cb) => {
          cb.addEventListener('change', () => {
            const type = cb.dataset.aux;
            const rest = (eng.auxRooms || []).filter((r) => r.type !== type);
            eng.auxRooms = cb.checked ? [...rest, { type, area: Number(eng.auxArea) || 0, floorLoad: Number(eng.auxFloorLoad) || 0 }] : rest;
            app.syncEngReadout();
            app.schedulePersist();
          });
        });
        // 从 eng 反填控件（存档恢复/默认值）
        const set = (id, v) => { const el = q(id); if (el) el.value = v; };
        const chkSet = (id, v) => { const el = q(id); if (el) el.checked = !!v; };
        set('eng-tier', eng.tier || '');
        set('eng-tier-reason', eng.tierReason || '');
        set('eng-density', eng.density);
        set('eng-ups-kva', eng.ups.capacity);
        set('eng-ups-red', eng.ups.redundancy);
        set('eng-ups-backup', eng.ups.backupMin);
        set('eng-ups-battery', eng.ups.battery);
        chkSet('eng-ups-bypass', eng.ups.bypass);
        chkSet('eng-keycooling', eng.hvac.keyCoolingOnUps !== false);
        set('eng-load-form', eng.loadForm || '');
        set('eng-ground-form', eng.grounding.form);
        set('eng-ground-r', eng.grounding.resistance);
        chkSet('eng-gen', eng.generator.enabled);
        set('eng-gen-kva', eng.generator.capacity);
        set('eng-gen-fuel', eng.generator.fuelHours);
        set('eng-air-type', eng.hvac.airType);
        set('eng-cold-src', eng.hvac.coldSource);
        set('eng-hvac-red', eng.hvac.redundancy || '');
        set('eng-temp-set', eng.hvac.setTemp);
        set('eng-temp-min', eng.hvac.tempMin);
        set('eng-temp-max', eng.hvac.tempMax);
        set('eng-rh-set', eng.hvac.humidity);
        set('eng-rh-min', eng.hvac.rhMin);
        set('eng-rh-max', eng.hvac.rhMax);
        set('eng-dew-min', eng.hvac.dewMin);
        set('eng-dew-max', eng.hvac.dewMax);
        set('eng-fire-agent', eng.fire.agent || '');
        set('eng-relief', eng.fire.reliefArea);
        chkSet('eng-vesda', eng.fire.vesda);
        set('eng-risk', eng.security.riskLevel || '');
        set('eng-recdays', eng.security.recDays);
        set('eng-bitrate', eng.security.bitrate);
        set('eng-patrol-speed', eng.patrolSpeed);
        set('eng-cable-cat', eng.cable.cat);
        set('eng-cable-fiber', eng.cable.fiber);
        set('eng-link', eng.cable.linkLen);
        (eng.auxRooms || []).forEach((r) => {
          const cb = domRoot.querySelector(`#eng-aux input[data-aux="${r.type}"]`);
          if (cb) cb.checked = true;
        });
        // 自绘下拉增强：放在全部 set() 反填之后，trigger 初始显示即恢复值。
        // 原生 select 弹窗在 Shadow DOM 内无法暗色化（跟随文档级 color-scheme），
        // 故保留原生 select 作隐藏状态载体，视觉与弹窗由 selectMenu.js 自绘。
        enhanceSelects(domRoot);
      },

    _initStage1() {
      const dimW = $('dim-w');
      const dimD = $('dim-d');
      const dimH = $('dim-h');
      Object.assign(app, { dimW, dimD, dimH });

      [dimW, dimD, dimH].forEach((input) => input.addEventListener('change', () => {
        roomDims.width = Math.max(ROOM_MIN, Math.min(ROOM_MAX, Number(dimW.value) || roomDims.width));
        roomDims.depth = Math.max(ROOM_MIN, Math.min(ROOM_MAX, Number(dimD.value) || roomDims.depth));
        roomDims.height = Math.max(2.5, Math.min(ROOM_MAX, Number(dimH.value) || roomDims.height));
        app.applyRoomResize();
      }));

      // 机房尺寸面板可收折（整改：同源于辅助区登记 #aux-panel）。
      // 标题条常驻；主体与提示收入 .plan-fold；默认宽屏展开 / 窄屏（≤720）收起；
      // 用户手动选择记入 localStorage，跨会话与跨阶段保持。
      const planPanel = $('plan-tools');
      const planCollapseBtn = $('plan-collapse');
      const PLAN_COLLAPSE_KEY = 'dc3d.planCollapsed';
      const applyPlanCollapsed = (collapsed) => {
        if (!planPanel || !planCollapseBtn) return;
        planPanel.classList.toggle('collapsed', collapsed);
        planCollapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        planCollapseBtn.textContent = collapsed ? '展开 ▸' : '收起 ▾';
        planCollapseBtn.title = collapsed
          ? '展开机房尺寸面板'
          : '收起机房尺寸面板（释放 3D 视图）';
        try { localStorage.setItem(PLAN_COLLAPSE_KEY, collapsed ? '1' : '0'); } catch (e) { /* 无存储环境时仅用内存态 */ }
      };
      if (planCollapseBtn) {
        planCollapseBtn.addEventListener('click', () => {
          applyPlanCollapsed(!planPanel.classList.contains('collapsed'));
        });
        let stored = null;
        try { stored = localStorage.getItem(PLAN_COLLAPSE_KEY); } catch (e) { /* 读取失败按默认 */ }
        const narrow = typeof window.matchMedia === 'function'
          && window.matchMedia('(max-width: 720px)').matches;
        applyPlanCollapsed(stored === null ? narrow : stored === '1');
      }
    },

    syncDimInputs() {
      app.dimW.value = Math.round(roomDims.width * 10) / 10;
      app.dimD.value = Math.round(roomDims.depth * 10) / 10;
      app.dimH.value = Math.round(roomDims.height * 10) / 10;
    },

    /**
     * 房间尺寸变更的合帧调度（拖拽边框专用）。
     * roomDims 已在 pointermove 里立即更新（数值面板/后续判定都读它），
     * 只有重建动作推迟到下一帧；同一帧内的多次移动只重建一次。
     * 鼠标抬起时若仍有排队帧，它会用最新 roomDims 执行，结果必然收敛。
     */
    _scheduleRoomResize() {
      if (app._resizeRaf) return;
      app._resizeRaf = requestAnimationFrame(() => {
        app._resizeRaf = 0;
        app.applyRoomResize();
      });
    },

    applyRoomResize() {
      syncWallsToRoom(app.wallLayout, roomDims);
      app.room.rebuild(app.wallLayout, roomDims);
      app.racks.clampAll(roomDims);
      // 房间改小时仅靠 clampAll 会让机柜互相穿透，再做一轮有界分离
      app.racks.resolveOverlaps(roomDims);
      app.syncDimInputs();
      if (!app.wallPanel.classList.contains('hidden')) {
        app.editor.setWall(app.wallLayout[app.curWallKey]);
        app.refreshWallStatus();
      }
    },

    // 判定鼠标是否靠近房间某条边（返回 'e' | 'w' | 's' | 'n' | null）
    pickRoomEdge(p) {
      const t = 0.8;
      const cands = [
        ['e', Math.abs(p.x - roomDims.width / 2)],
        ['w', Math.abs(p.x + roomDims.width / 2)],
        ['s', Math.abs(p.z - roomDims.depth / 2)],
        ['n', Math.abs(p.z + roomDims.depth / 2)],
      ].sort((a, b) => a[1] - b[1]);
      if (cands[0][1] > t) return null;
      const edge = cands[0][0];
      if ((edge === 'e' || edge === 'w') && Math.abs(p.z) > roomDims.depth / 2 + 1) return null;
      if ((edge === 's' || edge === 'n') && Math.abs(p.x) > roomDims.width / 2 + 1) return null;
      return edge;
    },

    // =======================================================================
    // 阶段2：门窗布置（立面编辑器 + 3D 点选墙面联动）
    // =======================================================================
    _initStage2() {
      const WALL_NAMES = { back: '后墙', left: '左墙', front: '前墙', right: '右墙' };
      const wallPanel = app.wallPanel;
      const wpTabs = [...wallPanel.querySelectorAll('[data-wall]')];
      const wpLength = $('wp-length');
      const wpHeight = $('wp-height');
      const wpThickness = $('wp-thickness');
      const wpProps = $('wp-props');
      const wpStatus = $('wp-status');
      const wpSave = $('wp-save');
      const wpDelete = $('wp-delete');

      // 辅助区登记可收折（整改：常驻显示遮挡 3D 视图）。
      // 默认状态：宽屏展开、窄屏（≤720）收起——小屏上 inspector 全宽，展开态会与其
      // 互相压盖；用户手动选择记入 localStorage，跨会话/跨阶段保持。
      const auxPanel = $('aux-panel');
      const auxCollapseBtn = $('aux-collapse');
      const AUX_COLLAPSE_KEY = 'dc3d.auxCollapsed';
      const applyAuxCollapsed = (collapsed) => {
        if (!auxPanel || !auxCollapseBtn) return;
        auxPanel.classList.toggle('collapsed', collapsed);
        auxCollapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        auxCollapseBtn.textContent = collapsed ? '展开 ▸' : '收起 ▾';
        auxCollapseBtn.title = collapsed
          ? '展开辅助区登记面板'
          : '收起辅助区登记面板（释放 3D 视图）';
        try { localStorage.setItem(AUX_COLLAPSE_KEY, collapsed ? '1' : '0'); } catch (e) { /* 无存储环境时仅用内存态 */ }
      };
      if (auxCollapseBtn) {
        auxCollapseBtn.addEventListener('click', () => {
          applyAuxCollapsed(!auxPanel.classList.contains('collapsed'));
        });
        let stored = null;
        try { stored = localStorage.getItem(AUX_COLLAPSE_KEY); } catch (e) { /* 读取失败按默认 */ }
        const narrow = typeof window.matchMedia === 'function'
          && window.matchMedia('(max-width: 720px)').matches;
        applyAuxCollapsed(stored === null ? narrow : stored === '1');
      }

      const editor = new WallEditor($('wall-canvas'), {
        onChange: () => app.onWallEdit(),
        onSelect: () => app.showOpeningProps(),
      });

      Object.assign(app, {
        WALL_NAMES, wpTabs, wpLength, wpHeight, wpThickness,
        wpProps, wpStatus, wpSave, wpDelete, editor,
      });

      const curWall = () => app.wallLayout[app.curWallKey];

      $('wp-close').addEventListener('click', () => wallPanel.classList.add('hidden'));
      wpTabs.forEach((b) => b.addEventListener('click', () => app.switchWall(b.dataset.wall)));

      [wpHeight, wpThickness].forEach((input) => input.addEventListener('change', () => {
        if (app.locked) { app.ui.toast('布局已锁定，请先解锁', 'warn'); return; }
        const w = curWall();
        w.height = Math.max(2.5, Number(wpHeight.value) || w.height);
        w.thickness = Math.max(0.1, Number(wpThickness.value) || w.thickness);
        editor.setWall(w);
        app.onWallEdit();
      }));

      wpProps.addEventListener('input', (e) => {
        if (app.locked) return;
        const input = e.target.closest('[data-p]');
        if (!input) return;
        const op = curWall().openings.find((o) => o.id === editor.selectedId);
        if (!op) return;
        const key = input.dataset.p;
        if (key === 'rating') {
          // 防火门等级（G-FIRE-06）
          op.rating = input.value || undefined;
        } else if (key.startsWith('sec.')) {
          // 门禁子模型（G-SEC-02/03）
          const sub = key.slice(4);
          op.security = op.security || {};
          op.security[sub] = input.type === 'checkbox' ? input.checked : input.value;
          if (sub !== 'fireRelease') op.security.fireRelease = true;
        } else if (key === 'reliefArea') {
          op.reliefArea = Math.max(0, Number(input.value) || 0);
        } else {
          const v = Number(input.value);
          if (!Number.isFinite(v)) return;
          op[key] = Math.max(0, v);
        }
        editor.render();
        app.onWallEdit();
      });

      $('wp-add-door').addEventListener('click', () => app.addOpening('door'));
      $('wp-add-window').addEventListener('click', () => app.addOpening('window'));
      $('wp-add-relief').addEventListener('click', () => app.addOpening('relief'));

      wpDelete.addEventListener('click', () => {
        const w = curWall();
        w.openings = w.openings.filter((o) => o.id !== editor.selectedId);
        editor.selectedId = null;
        editor.render();
        app.onWallEdit();
        app.ui.toast('已删除选中门窗');
      });

      wpSave.addEventListener('click', async () => {
        if (wpSave.disabled) { app.refreshWallStatus(); return; }
        // F5：走防抖保存，避免连点/连续编辑造成 IPC 写入风暴
        // 整改 O2：原调用 `debouncedSave(..., null, 0, cb)` 把 name 之后的
        // seedVersion 传 0（会被 _boot 判为「落后版本」，下次打开触发种子重建）、
        // 且漏传 engineering（③填的五域配置不会随布局保存一起落盘）。
        // debouncedSave 签名 (roomId, dims, walls, racks, locked, name,
        // seedVersion, onDone, engineering)——补上 SEED_CONTENT_VERSION 与 eng。
        debouncedSave(DEFAULT_ROOM_ID, { ...roomDims }, app.wallLayout, app.racks.toPlain(), app.locked, null, SEED_CONTENT_VERSION,
          (ok) => app.ui.toast(ok ? '布局已保存' : '保存失败'), eng);
      });

      $('wp-export').addEventListener('click', () => {
        const blob = new Blob([JSON.stringify({ v: 3, dims: roomDims, walls: app.wallLayout, racks: app.racks.toPlain() }, null, 2)],
          { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'room-plan.json';
        a.click();
        // 部分浏览器在 click() 后立刻 revoke 会取消下载，延迟回收即可
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });

      $('wp-import').addEventListener('click', () => $('wp-import-file').click());
      $('wp-import-file').addEventListener('change', (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = JSON.parse(reader.result);
            const walls = data.walls || data; // 兼容 v2（纯墙面）格式
            // 整改（安全 F-04 / 设计 X-1）：原校验只查 length/openings 形状，
            // 不校验 openings[].id —— 而 id 会被 showOpeningProps()/wallEditor
            // 拼进 innerHTML/SVG 属性。此处补 id 格式白名单校验，
            // 不合法即整体拒绝导入，杜绝经恶意 room-plan.json 注入。
            const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
            for (const k of ['back', 'left', 'front', 'right']) {
              const w = walls[k];
              if (!w || typeof w.length !== 'number' || !Array.isArray(w.openings)) throw new Error('bad');
              for (const op of w.openings) {
                if (!op || typeof op !== 'object') throw new Error('bad opening');
                if (!ID_RE.test(String(op.id))) throw new Error('bad opening id');
              }
            }
            app.wallLayout = walls;
            if (data.dims) Object.assign(roomDims, data.dims);
            syncWallsToRoom(app.wallLayout, roomDims);
            // 整改 O3：原顺序是先 applyRoomResize（其内部的 clampAll/
            // resolveOverlaps 只作用于上一批机柜）再 loadFrom 导入柜——
            // 导入的原始坐标不经任何钳位/分离，当导入 dims 与当前房间不一致
            // 时会穿墙或互相重叠。改为先 loadFrom 再 applyRoomResize，
            // 让导入机柜同样走一遍「钳回房间 + 有界分离」。
            // 整改 P2-6-5：房间 JSON 导入前对 racks 逐元素做字段 schema 校验，
            // 任一元素不合法则整体抛错（触发下方 catch →「导入失败」提示），不做越界解析。
            if (Array.isArray(data.racks)) {
              for (const rk of data.racks) {
                if (!rk || typeof rk !== 'object') throw new Error('rack 必须为对象');
                if (typeof rk.type !== 'string') throw new Error('rack.type 必须为字符串');
                if (![rk.x, rk.z, rk.rotationY].every((v) => typeof v === 'number' && isFinite(v))) {
                  throw new Error('rack 的 x/z/rotationY 必须为有限数字');
                }
                if (typeof rk.status !== 'string') throw new Error('rack.status 必须为字符串');
                if (rk.devices !== undefined && !Array.isArray(rk.devices)) throw new Error('rack.devices 必须为数组');
              }
              app.racks.loadFrom(data.racks);
            }
            // 整改 O4：导入后门窗编号续号，避免新增门窗与导入存档 id 重名
            syncIdCounter(app.wallLayout);
            app.applyRoomResize();
            app.switchWall(app.curWallKey);
            app.schedulePersist();
            app.ui.toast('导入成功，已同步 3D 预览');
          } catch (err) {
            // 整改（设计 P2-G）：失败提示原先用默认 info 色（青），
            // 与「导入成功」视觉无别，用户无法从颜色判断成败。改 error 色。
            app.ui.toast('导入失败：文件不是合法的布局 JSON', 'error', 4200);
          }
        };
        reader.readAsText(file);
      });

      $('wp-reset').addEventListener('click', async () => {
        // 重置不可撤销且清空全部机柜与门窗修改，必须二次确认
        // （修复：原为一键清空，误触即永久丢失布局）
        const ok = await confirmDialog(container, {
          title: '恢复默认布局',
          message: '确定要恢复默认布局吗？',
          detail: '当前所有机柜摆放、门窗修改都会被清空，且无法自动恢复。',
          confirmText: '清空并恢复',
        });
        if (!ok) return;
        app.wallLayout = defaultWallLayout();
        syncWallsToRoom(app.wallLayout, roomDims);
        app.applyRoomResize();
        app.racks.clearAll(); // 重置为空机房
        app.switchWall(app.curWallKey);
        app.schedulePersist();
        app.ui.toast('已恢复默认布局（空机房）');
      });
    },

    curWall() {
      return app.wallLayout[app.curWallKey];
    },

    refreshWallStatus() {
      const errs = ['back', 'left', 'front', 'right']
        .flatMap((k) => validateWall(app.wallLayout[k]).map((e) => `${app.WALL_NAMES[k]}：${e}`));
      if (!errs.length) {
        app.wpStatus.textContent = '✓ 布局合法，已同步 3D 预览';
        app.wpStatus.className = 'ok';
        app.wpSave.disabled = false;
      } else {
        app.wpStatus.textContent = `✗ ${errs[0]}${errs.length > 1 ? `（共 ${errs.length} 处问题）` : ''}`;
        app.wpStatus.className = 'err';
        app.wpSave.disabled = true;
      }
    },

    showOpeningProps() {
      const op = app.curWall().openings.find((o) => o.id === app.editor.selectedId);
      app.wpDelete.disabled = !op || app.locked;
      if (!op) {
        app.wpProps.innerHTML = '<span class="muted">点击图中门窗进行编辑；拖动门窗移动位置，拖拽黄色手柄调整宽/高。</span>';
        return;
      }
      const isDoor = op.type === 'door';
      const isRelief = op.type === 'relief';
      const kindName = isDoor ? '门' : (isRelief ? '泄压口' : '窗');
      // 门窗属性可能来自「导入房间 JSON」：op.id / width / height 等是外部可控字符串，
      // 直接拼进 innerHTML 会形成注入面。所有插值一律先转义。
      const num = (v) => escAttr(Number(v) || 0);
      const sec = op.security || {};
      // —— 防火门等级（G-FIRE-06，GB 50016 甲/乙/丙级） ——
      const ratingSel = isDoor ? `
        <label><span>防火等级</span>
          <select data-p="rating">
            <option value="" ${!op.rating ? 'selected' : ''}>普通门（无防火要求）</option>
            <option value="甲" ${op.rating === '甲' ? 'selected' : ''}>甲级（防火分区开口）</option>
            <option value="乙" ${op.rating === '乙' ? 'selected' : ''}>乙级</option>
            <option value="丙" ${op.rating === '丙' ? 'selected' : ''}>丙级（管井等）</option>
          </select>
        </label>` : '';
      // —— 门禁子模型（G-SEC-02/03，GB 50348-2018） ——
      const secBlock = isDoor ? `
        <div class="op-sec-t">门禁（出入口控制）</div>
        <label><span>识别方式</span>
          <select data-p="sec.method">
            <option value="card" ${sec.method !== 'fingerprint' && sec.method !== 'face' && sec.method !== 'qr' ? 'selected' : ''}>刷卡</option>
            <option value="fingerprint" ${sec.method === 'fingerprint' ? 'selected' : ''}>指纹</option>
            <option value="face" ${sec.method === 'face' ? 'selected' : ''}>人脸</option>
            <option value="qr" ${sec.method === 'qr' ? 'selected' : ''}>二维码</option>
          </select>
        </label>
        <label class="op-chk"><input type="checkbox" data-p="sec.twoWay" ${sec.twoWay ? 'checked' : ''}><span>双向受控（主机房强制）</span></label>
        <label class="op-chk"><input type="checkbox" data-p="sec.antiTail" ${sec.antiTail ? 'checked' : ''}><span>防尾随</span></label>
        <label><span>断电模式</span>
          <select data-p="sec.powerFail">
            <option value="safe-egress" ${sec.powerFail !== 'stay-locked' ? 'selected' : ''}>安全疏散优先（断电释放）</option>
            <option value="stay-locked" ${sec.powerFail === 'stay-locked' ? 'selected' : ''}>保持锁闭</option>
          </select>
        </label>
        <label class="op-chk"><input type="checkbox" checked disabled><span title="火灾确认自动释放（fireRelease，强制且不可关闭）">火灾自动释放（强制）</span></label>` : '';
      // —— 泄压口有效面积（G-FIRE-05，GB 50370） ——
      const reliefBlock = isRelief ? `
        <label title="有效泄压面积（GB 50370）"><span>有效面积(㎡)</span><input data-p="reliefArea" type="number" step="0.1" min="0" value="${num(op.reliefArea)}"></label>
        <div class="op-note">按保护区容积核算有效面积，防喷放超压；须核 GB 50370 正文</div>` : '';
      app.wpProps.innerHTML = `
        <b>${kindName} ${escHtml(op.id)}</b>
        <label><span>宽(m)</span><input data-p="width" type="number" step="0.1" min="0.3" value="${num(op.width)}"></label>
        <label><span>高(m)</span><input data-p="height" type="number" step="0.1" min="0.3" value="${num(op.height)}"></label>
        <label><span>横向位置(m)</span><input data-p="offset" type="number" step="0.1" min="0" value="${num(op.offset)}"></label>
        <label><span>底部高度(m)</span><input data-p="sill" type="number" step="0.1" min="0" value="${num(op.sill)}" ${isDoor ? 'disabled title="门必须落地"' : (isRelief ? 'value="0.5" title="泄压口底边宜高于 0.5m"' : '')}></label>
        ${ratingSel}${secBlock}${reliefBlock}`;
      // innerHTML 重建会抹掉旧增强，需对新建的 3 个 select 重新增强
      enhanceSelects(app.wpProps);
      // 门禁子模型持久化标记（fireRelease 恒 true，G-SEC-03 强制分支）
      if (isDoor) {
        op.security = { method: sec.method || 'card', twoWay: !!sec.twoWay, antiTail: !!sec.antiTail, powerFail: sec.powerFail || 'safe-egress', fireRelease: true };
      }
    },

    onWallEdit() {
      app.showOpeningProps();
      app.refreshWallStatus();
      if (!app.wpSave.disabled) app.room.rebuild(app.wallLayout, roomDims); // 仅合法布局同步 3D
    },

    syncDimInputsWall() {
      const w = app.curWall();
      app.wpLength.value = w.length;
      app.wpLength.disabled = true;
      app.wpLength.title = '由阶段①的房间尺寸决定';
      app.wpHeight.value = w.height;
      app.wpThickness.value = w.thickness;
    },

    switchWall(key) {
      app.curWallKey = key;
      app.wpTabs.forEach((b) => b.classList.toggle('active', b.dataset.wall === key));
      app.editor.setWall(app.curWall());
      app.syncDimInputsWall();
      app.showOpeningProps();
    },

    addOpening(type) {
      const w = app.curWall();
      const def = type === 'door'
        ? { width: 1.8, height: 2.4, sill: 0 }
        : (type === 'relief'
          ? { width: 1.2, height: 1.0, sill: 0.5, reliefArea: 1 }
          : { width: 2.4, height: 1.5, sill: 1.2 });
      const offset = findFreeSlot(w, def.width, def.height, def.sill);
      if (offset === null) { app.ui.toast(`${app.WALL_NAMES[app.curWallKey]}无合法空位`, 'warn'); return; }
      const op = { id: genId(type), type, offset, ...def };
      w.openings.push(op);
      app.editor.selectedId = op.id;
      app.editor.render();
      app.onWallEdit();
      app.ui.toast(`已在${app.WALL_NAMES[app.curWallKey]}添加 ${op.id}`);
    },

    // =======================================================================
    // 阶段4：设备摆放（工具栏添加 + 拖拽移动 + 键盘旋转/删除）
    // =======================================================================
    _initStage4() {
      $('equip-tools').querySelectorAll('[data-equip]').forEach((b) => {
        b.addEventListener('click', () => {
          if (app.locked) { app.ui.toast('布局已锁定，请先解锁', 'warn'); return; }
          const rack = app.racks.add(b.dataset.equip, roomDims);
          if (rack) {
            app.racks.setSelected(rack); app.ui.showInfo(rack); app.director.focusRack(rack);
            app.ui.toast(`已放置 ${rack.id}`);

          } else app.ui.toast('房间内无合适空位', 'warn');
        });
      });

      // 批量摆放：一列 / 两列机柜。
      // 整改（设计 P1-D）：原实现放一台就清 placementMode，摆 8 列要点 8 次工具栏，
      // 且放下后无任何视觉迹象表明「模式已悄悄退出」——用户下一次点击地面只会
      // 取消选择，看起来像功能坏了。现改为粘滞模式：连续摆放，仅由
      // 「再次点击同一按钮 / Esc / 切换阶段」退出，且按钮常显 active 高亮。
      const setPlacementMode = (mode) => {
        const next = (app.placementMode === mode) ? null : mode;
        app.placementMode = next;
        for (const id of ['place-col1', 'place-col2']) {
          const b = $(id);
          if (b) b.classList.toggle('active', next === (id === 'place-col1' ? 'col1' : 'col2'));
        }
        app.ui.toast(next === 'col1' ? '连续摆放：点击地面空位放置一列机柜（Esc 或再点按钮退出）'
          : next === 'col2' ? '连续摆放：点击地面空位放置两列机柜，含冷热通道（Esc 或再点按钮退出）'
          : '已退出连续摆放');
      };
      $('place-col1').addEventListener('click', () => {
        if (app.locked) { app.ui.toast('布局已锁定，请先解锁', 'warn'); return; }
        setPlacementMode('col1');
      });
      $('place-col2').addEventListener('click', () => {
        if (app.locked) { app.ui.toast('布局已锁定，请先解锁', 'warn'); return; }
        setPlacementMode('col2');
      });
      // 全选：与 Ctrl+A 同一入口（工具坞里给一个可发现的按钮，
      // 键盘流走快捷键）。批量删/转/移都以选集为目标。
      $('select-all').addEventListener('click', () => {
        if (app.locked) { app.ui.toast('布局已锁定，请先解锁', 'warn'); return; }
        const n = app.racks.selectAll();
        app._showSelInfo();
        app.ui.toast(n
          ? `已选中全部 ${n} 台机柜（Shift 点击可取消单个，Esc 取消全部）`
          : '机房内还没有机柜');
      });

      // 全局 Esc：按「最内层优先」依次退出 第一人称 → 机柜详情 → 连续摆放。
      // 整改（设计 P1-D）：原 Esc 仅 fps.deactivate 一处绑定，详情视图只能点返回键，
      // 摆放模式更是没有任何退出路径（只能切换阶段）。
      onWin('keydown', (e) => {
        if (e.key !== 'Escape' || isTyping(e)) return;
        if (app.fpsActive) { app.exitAvatarFPS(); return; }
        if (app.bridgeDraw && app.bridgeDraw.kind) { app.stopBridgeDraw(); return; } // 手绘模式：Esc 退出
        if (app.detail && app.detail.active) {
          app.detail.hide();
          app.detailBar.classList.add('hidden');
          app._syncDetailReserve();
          return;
        }
        if (app.placementMode) { setPlacementMode(app.placementMode); return; }
        // 最内层都退出完后，Esc 的最后一档含义 = 取消机柜选择
        // （多选批量操作后尤其需要：不清选择，下一次方向键还会搬动整组）
        if (app.racks.selected) {
          app.racks.setSelected(null);
          app._showSelInfo();
        }
      });

      // 桥架手绘快捷键：Enter 完成路径 / Backspace 撤销上一点（仅在手绘模式下生效，
      // 避免与机柜删除（Backspace）等全局快捷键冲突）。
      onWin('keydown', (e) => {
        if (!app.bridgeDraw || !app.bridgeDraw.kind || isTyping(e)) return;
        if (e.key === 'Enter') {
          app._finishBridgeDrawPath();
          e.preventDefault();
        } else if (e.key === 'Backspace') {
          const left = app._fx.bridge.undoPathPoint(app.bridgeDraw.kind);
          app._renderBridgeDrawPreview();
          if (app._bridgeDrawPanel) app._bridgeDrawPanel.render();
          if (!left) app.ui.toast('已撤销全部节点', 'info');
          e.preventDefault();
        }
      });

      // Ctrl+A 全选（阶段④可编辑态）。锁定态给提示而非静默——
      // 「按了没反应」比「告诉你为什么不行」更难用。
      onWin('keydown', (e) => {
        if (isTyping(e) || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'a') return;
        if (app.stage !== 4 || app.placementMode) return;
        e.preventDefault(); // 拦住浏览器「全选页面文本」
        if (app.locked) { app.ui.toast('布局已锁定，无法批量选择修改', 'warn'); return; }
        const n = app.racks.selectAll();
        app._showSelInfo();
        app.ui.toast(n
          ? `已选中全部 ${n} 台机柜（Shift 点击可取消单个，Esc 取消全部）`
          : '机房内还没有机柜');
      });

      onWin('keydown', async (e) => {
        if (app.stage !== 4 || !app.racks.selected || app.locked || isTyping(e) || (app.bridgeDraw && app.bridgeDraw.kind)) return;
        // 选集 ≥2 台时，三个快捷键全部作用于整组（与检查器聚合按钮同语义）
        const list = app.racks.selectedRacks;
        const multi = list.length > 1;
        const step = 0.5;
        const nudge = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] };
        if (nudge[e.key]) {
          const ok = multi
            ? app.racks.tryPlaceMany(list, nudge[e.key][0], nudge[e.key][1], roomDims) > 0
            : app.racks.tryPlace(app.racks.selected, app.racks.selected.x + nudge[e.key][0], app.racks.selected.z + nudge[e.key][1], roomDims);
          if (!ok) {
            app.ui.toast('该位置与相邻机柜重叠，已保持在原位', 'warn');
          }
          app._showSelInfo();
          e.preventDefault();
        }
        if (e.key === 'r' || e.key === 'R') {
          if (multi) {
            const n = app.racks.rotateMany(list, roomDims);
            if (n < list.length) app.ui.toast(`${list.length - n} 台旋转后与相邻机柜重叠，已保持原位`, 'warn');
          } else if (!app.racks.rotate(app.racks.selected, roomDims)) {
            app.ui.toast('旋转后与相邻机柜重叠，已保持原位', 'warn');
          }
          app._showSelInfo();
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          // 删除会连带丢掉该柜的柜内设备清单且直接落盘 → 必须二次确认
          // （现有撤销栈可恢复，但确认仍是第一道闸：撤销步数有限且会被后续操作挤掉）
          if (multi) {
            const ok = await confirmDialog(container, {
              title: '删除机柜',
              message: `确定删除选中的 ${list.length} 台机柜？`,
              detail: '此操作将移除其柜内设备清单，可用 Ctrl+Z 撤销。',
              confirmText: `删除 ${list.length} 台`,
            });
            if (!ok) return;
            const n = app.racks.removeMany(list);
            app._showSelInfo();
            app.ui.toast(`已删除 ${n} 台（Ctrl+Z 可撤销）`);
            return;
          }
          const target = app.racks.selected;
          const label = (target && (target.name || target.id)) || '该设备';
          const ok = await confirmDialog(container, {
            title: '删除机柜',
            message: `确定删除「${label}」？`,
            detail: '此操作将移除其柜内设备清单，可用 Ctrl+Z 撤销。',
            confirmText: '删除',
          });
          if (!ok) return;
          app.racks.remove(target);
          app.ui.showInfo(null);
        }
      });
    },

    // =======================================================================
    // 统一指针交互：房间边缘拖拽 / 设备拖拽 / 点选
    // =======================================================================
    _initPointer() {
      const canvas = app.sm.renderer.domElement;
      let drag = null;      // { kind:'room'|'rack'|'racks', ... } racks = 多选整组拖拽
      let lastDown = null;  // 判定点击 vs 拖动
      Object.assign(app, { canvas, _drag: () => drag });

      // 事件目标修正：canvas 是场景交互的唯一热区，但 Vue 集成时 pointer 事件的
      // target 可能是宿主 .datacenter-host（shadow 边界 + 面板覆盖层所致），
      // 导致 `e.target === canvas` 判断恒假、点击逻辑整段被跳过。
      // 统一改用「事件坐标是否落在 canvas 矩形内」来判定，且把 pointerup 绑到
      // canvas 自身（不再走 window），彻底规避 target 归属问题。
      const inCanvas = (e) => {
        const r = canvas.getBoundingClientRect();
        return e.clientX >= r.left && e.clientX <= r.right
          && e.clientY >= r.top && e.clientY <= r.bottom;
      };

      const onPointerDown = (e) => {
        // lastDown 必须先于所有分支记录：详情视图模式下 pointerdown 会提前 return，
        // 若不记录则 pointerup 无法判定「点击 vs 拖动」，详情内点门开合将失效。
        lastDown = { x: e.clientX, y: e.clientY };
        // 第一人称中：拖拽由 AvatarFPS 环视接管，屏蔽场景拖拽/选中
        if (app.fpsActive) return;
        // 手绘桥架模式：左键点击在地面 / 墙面落点（绘制时已禁用相机旋转，不触发拖拽）
        if (app.bridgeDraw && app.bridgeDraw.kind) {
          if (e.button === 0) {
            const pt = app._bridgeDrawPoint(e.clientX, e.clientY);
            if (pt) {
              const n = app._fx.bridge.addPathPoint(app.bridgeDraw.kind, pt);
              app._renderBridgeDrawPreview();
              if (app._bridgeDrawPanel) app._bridgeDrawPanel.render();
              if (n >= 2) app.ui.toast(`已落 ${n} 点，继续点击或按 Enter 完成`, 'info');
            }
          }
          return;
        }
        if (e.button !== 0 || app.detail.active) return;
        if (app.stage === 1 && !app.locked) {
          const p = app.sm.rayPoint(e.clientX, e.clientY, app.floorPlane);
          const edge = p && app.pickRoomEdge(p);
          if (edge) {
            drag = { kind: 'room', edge };
            app.sm.controls.enabled = false;
          }
        } else if (app.stage === 4 && !app.placementMode && !app.locked) {
          const hits = app.sm.pick(app.racks.bodies(), e.clientX, e.clientY);
          const rack = app.racks.fromIntersection(hits[0]);
          if (rack) {
            const additive = e.shiftKey || e.ctrlKey || e.metaKey;
            if (additive) {
              // Shift/Ctrl 按下只改选集，不进入拖拽 —— 否则「加选一台」
              // 会顺带把整组柜搬走，与用户的点击意图相悖
              app.racks.toggleSelected(rack);
              app._showSelInfo();
            } else {
              // 点多选组内的一台 → 拖动整组（选集保持不变）；
              // 点组外的一台 → 先单选它，再拖这一台
              const inSel = app.racks.selectedRacks.indexOf(rack) >= 0;
              if (!inSel) app.racks.setSelected(rack);
              app._showSelInfo();
              const p0 = app.sm.rayPoint(e.clientX, e.clientY, app.floorPlane);
              const group = app.racks.selectedRacks;
              drag = group.length > 1
                ? {
                    kind: 'racks', lead: rack, racks: group,
                    gx: p0 ? rack.x - p0.x : 0,
                    gz: p0 ? rack.z - p0.z : 0,
                  }
                : {
                    kind: 'rack', rack,
                    gx: p0 ? rack.x - p0.x : 0,
                    gz: p0 ? rack.z - p0.z : 0,
                  };
              app.sm.controls.enabled = false;
            }
          }
        }
      };
      canvas.addEventListener('pointerdown', onPointerDown);

      const onPointerMove = (e) => {
        if (app.detail.active || app.fpsActive) {
          // 详情/第一人称期间人物不可悬停；若此前处于悬停态，先清除
          if (app.avatar && app.avatar._hovered) app.avatar.setHovered(false);
          return;
        }
        // 手绘桥架模式：实时光标预览（从最后一个节点连到当前鼠标位置）
        if (app.bridgeDraw && app.bridgeDraw.kind) {
          const pt = app._bridgeDrawPoint(e.clientX, e.clientY);
          if (pt) { app._bridgeDrawCursor = pt; app._renderBridgeDrawPreview(); }
          return;
        }
        // 人物悬停交互：命中人物 → 暂停行走动画 + 描边高亮；移出 → 恢复 + 移除描边
        if (app.avatar && app.avatar.hoverable) {
          const hit = sm.pick([app.avatar.model], e.clientX, e.clientY);
          app.avatar.setHovered(hit.length > 0);
        } else if (app.avatar && app.avatar._hovered) {
          app.avatar.setHovered(false);
        }
        if (drag && drag.kind === 'room') {
          const p = app.sm.rayPoint(e.clientX, e.clientY, app.floorPlane);
          if (!p) return;
          if (drag.edge === 'e' || drag.edge === 'w') {
            roomDims.width = Math.max(ROOM_MIN, Math.min(ROOM_MAX, 2 * Math.abs(p.x)));
          } else {
            roomDims.depth = Math.max(ROOM_MIN, Math.min(ROOM_MAX, 2 * Math.abs(p.z)));
          }
          // 合帧：applyRoomResize 是全量重建（4 面墙体挤出 + 地砖阵列 + 全柜
          // 钳回与分离），而 pointermove 在拖拽时每秒可触发上百次。此前逐事件
          // 同步执行，拖动房间边框明显掉帧；改为一帧最多一次，视觉无差别。
          app._scheduleRoomResize();
          return;
        }
        if (drag && drag.kind === 'rack') {
          const p = app.sm.rayPoint(e.clientX, e.clientY, app.floorPlane);
          if (!p) return;
          // 拖拽中静默拒绝重叠：每帧 toast 会刷屏，只记录状态，
          // 由 pointerup 统一提示一次（见下方 onPointerUp 的 drag.rejected 分支）
          if (!app.racks.tryPlace(drag.rack, p.x + drag.gx, p.z + drag.gz, roomDims)) {
            drag.rejected = true;
          } else {
            drag.rejected = false;
          }
          // 整改（设计 P2-H）：拖拽中每个 pointermove 都会走到这里。
          // 原为全量重建 infoBody.innerHTML（~10 行 + N 行设备清单），
          // 现传 lite=true 只更新坐标/朝向/设备数三个文本节点。
          app.ui.showInfo(drag.rack, true);
          return;
        }
        if (drag && drag.kind === 'racks') {
          // 整组拖拽：以「主拖那台」为基准算 delta，其余柜吃同一个 delta，
          // 组内相对位置不变（tryPlaceMany 的 skipSet 让组内成员互不阻挡）。
          const p = app.sm.rayPoint(e.clientX, e.clientY, app.floorPlane);
          if (!p) return;
          const dx = (p.x + drag.gx) - drag.lead.x;
          const dz = (p.z + drag.gz) - drag.lead.z;
          // 0.1m 网格：与单柜拖拽同一套栅格，整组才能与既有队列对齐
          if (!app.racks.tryPlaceMany(drag.racks, dx, dz, roomDims, 0.1)) {
            drag.rejected = true;
          } else {
            drag.rejected = false;
          }
          // 聚合面板不随拖拽逐帧刷新：平移不改变「几台/什么类型」，
          // 3D 场景本身就是反馈；落定时由 pointerup 统一刷一次。
          return;
        }
        if (!inCanvas(e)) return;
        if (app.stage === 1 && !app.locked) {
          // 悬停边缘提示可拖拽
          const p = app.sm.rayPoint(e.clientX, e.clientY, app.floorPlane);
          const edge = p && app.pickRoomEdge(p);
          canvas.style.cursor = edge === 'e' || edge === 'w' ? 'ew-resize'
            : edge === 's' || edge === 'n' ? 'ns-resize' : '';
        } else if (app.stage === 4 || app.locked) {
          const hits = app.sm.pick(app.racks.bodies(), e.clientX, e.clientY);
          const rack = app.racks.fromIntersection(hits[0]);
          app.racks.setHovered(rack);
          if (rack) {
            app.ui.showTooltip(`${rack.id} · ${TYPE_LABEL[rack.type]} · ${STATUS_LABEL[rack.status]}`, e.clientX + 14, e.clientY + 14);
          } else {
            app.ui.hideTooltip();
          }
        } else {
          canvas.style.cursor = '';
          app.ui.hideTooltip();
        }
      };

      const onPointerUp = (e) => {
        // 第一人称中：点击/拖拽均不触发场景选中（退出走 Esc 或界面按钮）
        if (app.fpsActive) { lastDown = null; return; }
        // 手绘桥架模式：落点已在 pointerdown 处理，这里不触发选中 / 进入机柜详情
        if (app.bridgeDraw && app.bridgeDraw.kind) { lastDown = null; return; }
        const moved = lastDown ? Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) : Infinity;
        const isClick = moved < 5; // 位移小于阈值视为点击（而非拖动）

        // 详情视图：点击门体开合
        if (app.detail.active) {
          if (isClick && inCanvas(e)) app.detail.tap(e.clientX, e.clientY);
          lastDown = null;
          return;
        }

        // 结束拖拽；若位移极小则视为一次点击，继续走点击逻辑
        if (drag) {
          if (drag.kind === 'racks') {
            // 组拖拽：选集在 pointerdown 就已定好，这里只收尾。
            // 必须提前返回——若位移极小（等于一次点击）而继续往下走拾取逻辑，
            // 会把刚保留的多选整组折叠成单选，用户「点一下选中的柜」就丢选择。
            if (drag.rejected) app.ui.toast('该位置与相邻机柜重叠，已保持在原位', 'warn');
            app._showSelInfo();
            drag = null;
            app.sm.controls.enabled = true;
            lastDown = null;
            return;
          }
          // 拖拽过程中若因重叠被拒绝，松手时提示一次（避免每帧刷屏）
          if (drag.rejected) app.ui.toast('该位置与相邻机柜重叠，已保持在原位', 'warn');
          drag = null;
          app.sm.controls.enabled = true;
          if (!isClick) { lastDown = null; return; }
        } else if (!isClick) {
          lastDown = null;
          return;
        }

        if (inCanvas(e)) {
          // 人物点击拾取（优先于机柜点选）：点击人物 → 进入第一人称视角
          if (isClick && !app.detail.active && app.avatar && app.avatar.ready && !app.fpsActive) {
            const hit = sm.pick([app.avatar.model], e.clientX, e.clientY);
            if (hit.length) { app.enterAvatarFPS(); lastDown = null; return; }
          }
          if (app.stage === 2) {
            // 点选 3D 墙面 → 切换编辑对象
            const hits = app.sm.pick(app.room.wallMeshes, e.clientX, e.clientY);
            if (hits.length) {
              let o = hits[0].object;
              while (o && !o.userData.wallKey) o = o.parent;
              if (o && o.userData.wallKey) {
                app.switchWall(o.userData.wallKey);
                app.wallPanel.classList.remove('hidden');
              }
            }
          } else if (app.stage === 4 || app.locked) {
            // 批量摆放模式：点击地面成列放置
            if (app.placementMode) {
              const p = app.sm.rayPoint(e.clientX, e.clientY, app.floorPlane);
              if (p) {
                const made = app.racks.addBatch(app.placementMode, p, roomDims);
                app.ui.toast(made.length ? `已摆放 ${made.length} 台机柜（可继续点击地面，Esc 退出）` : '该位置无法摆放，请换个空位');
              }
              // 整改（设计 P1-D）：不再在此处清 placementMode —— 粘滞模式，
              // 退出只走 Esc / 再次点击同一按钮 / 切换阶段。
              lastDown = null;
              return;
            }
            const hits = app.sm.pick(app.racks.bodies(), e.clientX, e.clientY);
            const rack = app.racks.fromIntersection(hits[0]);
            // Shift/Ctrl + 点机柜 = 加选/减选；点空白 = 取消选择。
            // 加选手势只改选集与聚合面板：不飞相机、不进柜内 3D 详情
            // （那两个是「聚焦单台」的语义，与「挑一批出来」相悖）。
            if (rack && (e.shiftKey || e.ctrlKey || e.metaKey)) {
              app.racks.toggleSelected(rack);
              app._showSelInfo();
              app.ui.hideTooltip();
              lastDown = null;
              return;
            }
            app.racks.setSelected(rack);
            if (rack && rack.type === 'server') {
              // 代理盒命中后，对该机柜门枢轴做精确二次拾取：点在门体上 → 开合
              const pivots = [rack._frontPivot, rack._rearPivot].filter(Boolean);
              const dhits = pivots.length ? app.sm.pick(pivots, e.clientX, e.clientY) : [];
              if (dhits.length) {
                const res = app.racks.toggleDoor(rack, dhits[0].object.userData.door);
                const which = dhits[0].object.userData.door === 'rear' ? '后门' : '前门';
                let doorMsg, doorLvl = 'info';
                if (!res.ok) {
                  doorMsg = '旁边设备阻挡，柜门无法打开';
                  doorLvl = 'warn';
                } else if (res.open) {
                  doorMsg = res.partial
                    ? `${which}已部分打开（约 ${Math.round(res.angle * 180 / Math.PI)}°）`
                    : `${which}已打开`;
                } else {
                  doorMsg = `${which}已关闭`;
                }
                app.ui.toast(doorMsg, doorLvl);
              } else {
              // 点击柜体 → 进入机柜 3D 详情界面（展示同排整排机柜，可逐台开门）
              // 同时把选中机柜的专属数据（编号/类型/坐标/状态/温度/密度等）同步到检查器面板，
              // 使「菜单」随所选机柜动态更新，而非停留在主界面的主数据
              app.ui.showInfo(rack);
              app.ui.hideTooltip();
                $('equip-tools').classList.add('hidden');
                app.detailBar.classList.remove('hidden');
                app._syncDetailReserve();
                const rowRacks = app.racks.rowOf(rack);
                app.detail.show(rack, (rowRacks && rowRacks.length > 1) ? rowRacks : null);
              }
            } else if (rack) {
              app._showSelInfo();
              app.director.focusRack(rack);
            } else {
              app.ui.showInfo(null);
            }
          }
        }
        lastDown = null;
      };

      onWin('pointermove', onPointerMove);
      // pointerup 绑到 canvas 自身：window 级监听在 Vue 集成时
      // 事件 target 会落到宿主 .datacenter-host，历史上导致点击逻辑失效
      canvas.addEventListener('pointerup', onPointerUp);

      // 指针离开画布（移到面板/窗口外）时解除悬停：否则人物会一直冻结。
      // pointermove 在指针离开画布后不再触发，单靠它无法恢复行走。
      const onPointerLeave = () => {
        if (app.avatar && app.avatar._hovered) app.avatar.setHovered(false)
      }
      canvas.addEventListener('pointerleave', onPointerLeave);

      // canvas 级监听随 renderer.dispose() 一并移除，这里登记以便兜底
      app._canvasCleanups = [
        () => canvas.removeEventListener('pointerdown', onPointerDown),
        () => canvas.removeEventListener('pointerup', onPointerUp),
        () => canvas.removeEventListener('pointerleave', onPointerLeave),
      ];
    },

    // =======================================================================
    // 空格键平移模式：按住空格 → 进入平移模式（左键拖动平移视角 / 配合 WASD 持续平移）；
    // 松开空格 → 立即退出平移模式，恢复常规（左键旋转）操作。
    // 与 walkthrough（WASD 行走）互斥：空格平移仅在非 fpsActive 时生效。
    // =======================================================================
    _initSpacePan() {
      const canvas = app.sm.renderer.domElement;
      // 平移状态：active=是否处于平移模式；keys=持续平移的 WASD 按键集合
      app.spacePan = { active: false, keys: new Set() };

      // 取当前激活的轨道控制器：详情视图激活时用详情控制器，否则用主场景控制器
      const activeControls = () => (app.detail && app.detail.active ? app.detail.controls : app.sm.controls);
      const activeCamera = () => (app.detail && app.detail.active ? app.detail.camera : app.sm.camera);

      // 进入/退出平移模式：左键行为在 ROTATE ↔ PAN 间切换，并同步光标提示
      const setPanMode = (on) => {
        // 主场景与详情两套控制器一并置为一致状态，避免详情<->主场景切换时错位
        const others = [app.sm.controls, app.detail && app.detail.controls].filter(Boolean);
        for (const o of others) {
          if (o.mouseButtons) o.mouseButtons.LEFT = on ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
        }
        app.spacePan.active = on;
        canvas.style.cursor = on ? 'grab' : '';
        if (!on) app.spacePan.keys.clear();
      };

      // 空格按下：进入平移模式（阻止页面滚动；输入框内不拦截，保留空格输入）
      let spaceDownAt = 0; // 本次按下的时刻（用于区分「短按」与「长按平移」）
      let lastTapAt = 0;   // 上一次短按松开的时刻（用于识别「双击空格」）
      onWin('keydown', (e) => {
        if (e.code !== 'Space' || isTyping(e) || app.fpsActive) return;
        e.preventDefault();
        if (!e.repeat && !app.spacePan.active) spaceDownAt = performance.now();
        if (!app.spacePan.active) setPanMode(true);
      });
      // 空格松开：立即退出平移模式；两次快速短按（双击空格）→ 平滑跳回默认视角
      onWin('keyup', (e) => {
        if (e.code !== 'Space') return;
        if (app.spacePan.active) setPanMode(false);
        const now = performance.now();
        // 整改（P2 手感）：阈值 260/380ms → 300/500ms。
        // 原值偏严：新手第二次按键稍慢就只触发「平移模式」而回不了视角，
        // 而两种语义共用同一个键、无任何视觉预示，误判成本高。
        // 放宽后仍与「长按进入平移」可靠区分（长按通常 >400ms）。
        const isTap = spaceDownAt > 0 && now - spaceDownAt < 300;
        if (!isTap || isTyping(e) || app.fpsActive || app.detail.active) {
          lastTapAt = 0; // 长按后重置，避免「长按-单击」被误判为双击
          return;
        }
        if (now - lastTapAt < 500) {
          lastTapAt = 0;
          app.director.home(); // 默认视角 = 总览机位（随房间尺寸自适应，平滑过渡）
          app.ui.toast('已回到默认视角');
        } else {
          lastTapAt = now;
        }
      });

      // 持续平移：按住空格期间，WASD 让画面沿视角方向持续平移
      onWin('keydown', (e) => {
        if (isTyping(e) || !app.spacePan.active) return;
        const k = e.key.toLowerCase();
        if (k === 'w' || k === 'a' || k === 's' || k === 'd') app.spacePan.keys.add(k);
      });
      onWin('keyup', (e) => {
        const k = e.key.toLowerCase();
        if (k === 'w' || k === 'a' || k === 's' || k === 'd') app.spacePan.keys.delete(k);
      });

      // 失焦兜底：按住空格时窗口失焦可能漏收 keyup，强制退出避免平移卡死
      onWin('blur', () => { if (app.spacePan.active) setPanMode(false); });

      // 每帧持续平移（帧率无关）：仅在平移模式 + 有 WASD 按键时，按视角方向平移相机与目标点
      const PAN_SPEED = 9; // 单位/秒（米/秒）
      let last = performance.now();
      app.sm.addUpdate(() => {
        if (!app.spacePan.active) return;
        const now = performance.now();
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        const k = app.spacePan.keys;
        let f = 0, r = 0;
        if (k.has('w')) f += 1;
        if (k.has('s')) f -= 1;
        if (k.has('d')) r += 1;
        if (k.has('a')) r -= 1;
        if (f === 0 && r === 0) return;

        const cam = activeCamera();
        const forward = new THREE.Vector3();
        cam.getWorldDirection(forward);
        forward.y = 0;
        if (forward.lengthSq() < 1e-6) return; // 俯视正下方时无水平前向，跳过
        forward.normalize();
        // right = forward × up：相机朝 -Z 时 right=+X，方向正确（与屏幕右方一致）
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

        const pan = new THREE.Vector3();
        pan.addScaledVector(forward, f * PAN_SPEED * dt);
        pan.addScaledVector(right, r * PAN_SPEED * dt);

        const ctrls = activeControls();
        cam.position.add(pan);
        if (ctrls && ctrls.target) ctrls.target.add(pan);
      });
    },

    // =======================================================================
    // 销毁：解绑全部 window 监听，释放 UI / 编辑器 / 详情视图 / WebGL 场景
    // =======================================================================
    dispose() {
      // 卸载前先持久化一次有效布局，避免用户直接切页丢失
      try {
        // flushPersist 内部 await IPC，切页时可能来不及完成；
        // 这里再同步写一份 localStorage 快照兜底（浏览器模式下即为主存储）
        const valid = ['back', 'left', 'front', 'right']
          .every((k) => validateWall(this.wallLayout[k]).length === 0);
        if (valid) {
          savePlanSync(DEFAULT_ROOM_ID, { ...roomDims }, this.wallLayout, this.racks.toPlain(), this.locked, SEED_CONTENT_VERSION, eng);
          this.flushPersist().catch(() => {}); // 强制立即落盘（取消防抖），确保 Electron(SQLite) 侧落库
        }
      } catch { /* 忽略：销毁阶段不因持久化失败而中断 */ }

      (this._winListeners || []).forEach(([type, fn, opts]) => window.removeEventListener(type, fn, opts));
      this._winListeners = [];
      (this._canvasCleanups || []).forEach((fn) => fn());
      this._canvasCleanups = [];
      // 未执行的合帧重建必须取消：否则销毁后回调仍会打到已释放的 room/racks 上抛错
      if (this._resizeRaf) { cancelAnimationFrame(this._resizeRaf); this._resizeRaf = 0; }

      if (this.ui) this.ui.dispose();
      if (this.editor) this.editor.dispose();
      if (this.detail) this.detail.dispose();
      disposeSelectMenus();
      // 三个参数面板（静电地板 / 桥架参数 / 桥架手绘）：先关闭再释放。
      // 此前只注释「统一登记逐个释放」却未真正调用，面板若停在打开态，
      // 其委托回调会在宿主销毁后继续打到已释放的 room/bridge 上抛错。
      for (const p of [this._floorPanel, this._bridgePanel, this._bridgeDrawPanel]) {
        try { if (p && typeof p.dispose === 'function') p.dispose(); }
        catch (_) { /* 单个面板释放失败不影响其余 */ }
      }
      this._floorPanel = null;
      this._bridgePanel = null;
      this._bridgeDrawPanel = null;
      // 人物模型：停 mixer 并摘出场景（几何/材质/纹理由 sm.dispose 遍历统一释放）
      if (this.fps) { this.fps.deactivate(); this.fps = null; }
      if (this.avatar) { this.avatar.dispose(); this.avatar = null; }
      // P2-5-3：实例销毁时显式释放共享 CanvasTexture 缓存（编号标牌/状态标牌/设备面板），
      // 避免重挂后引用已 dispose 的纹理；与 scene 遍历释放互补。
      if (this.racks && typeof this.racks.dispose === 'function') this.racks.dispose();
      disposeFaceTextures();
      if (this.sm) this.sm.dispose();
      // 场景销毁后再释放模块级共享材质缓存（rackModel 的 _M），
      // 避免跨实例/HMR 时复用已被 dispose 的材质
      disposeSharedMaterials();

      // 演示增强：统一释放 14 个特性实例（监听 / 场景对象 / DOM 浮层）
      if (this._fx) {
        for (const k of Object.keys(this._fx)) {
          try { if (this._fx[k] && typeof this._fx[k].dispose === 'function') this._fx[k].dispose(); }
          catch (_) { /* 单个特性释放失败不影响其余 */ }
        }
        this._fx = null;
      }

      if (_active === this) _active = null;
      // 调试出口同步清理：否则 dispose 后 window.__dcApp 仍持有已销毁实例的
      // 引用（scene/racks/ui 均已释放），既阻碍 GC，也让自动化脚本读到僵尸状态。
      // 仅清理「本实例」，避免误删后续新实例（initDatacenter 会先 dispose 旧的）。
      if (window.__dcApp === this) delete window.__dcApp;
    },
  };

  return app;
}

// ===========================================================================
// 独立运行入口（浏览器直接打开 index.html 时自动初始化）
// Vue 集成时由 DataCenterView.vue 显式调用 initDatacenter，此处不触发。
// ===========================================================================
if (typeof document !== 'undefined') {
  const _bootstrap = () => {
    const root = document.getElementById('dc-root');
    if (root) initDatacenter(root);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bootstrap);
  } else {
    _bootstrap();
  }
}
