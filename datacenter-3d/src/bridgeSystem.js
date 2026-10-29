// 机房桥架系统可视化（弱电桥架 / 强电桥架 / 配套桥架）。
// 设计方案与安装工艺详见 docs/机房桥架系统设计与安装工艺方案.md，
// 用户可调参数（层数/安装高度/宽度/横向偏移/吊杆跨距/横档间距）见
// docs/桥架参数自定义功能说明.md；本文件的几何参数全部来自 bridgeConfig.js
// 的配置对象（localStorage 持久化，键 dc3d.bridgeConfig.v1），无任何写死规格。
//
// 与 demoFx.js 的特性模块保持同一约定：
//   constructor(app)   —— app 提供 sm(SceneManager) / racks(RackSystem)；
//                         构造时经 loadBridgeConfig() 读入用户配置
//   isVisible(kind)    —— kind: 'weak' | 'strong' | 'aux'，查询当前显隐状态
//   setVisible(kind,v) —— 一键显隐；true 时按当前布局与配置即时重建
//   update(dt)         —— 每帧回调（经 app.sm.addUpdate 注册），
//                         内部以「布局签名」防抖：机柜增删/移动/房间尺寸变化后
//                         自动重建可见桥架，无需外部钩子（racks.js 零改动）
//   dispose()          —— 释放场景对象与几何/材质
//
// 配置驱动接口（供「桥架铺设参数」面板 bridgePanel.js 调用）：
//   getConfig()            —— 返回当前生效配置的深拷贝（外部改写不影响内部态）
//   setConfig(next, opts)  —— 应用新配置：sanitizeBridgeConfig 钳制后即时重建
//                             可见桥架（实时预览）；opts.save !== false 时持久化
//   resetConfig()          —— 恢复默认配置并持久化、重建
//
// 路由推导（机柜上方 / 静电地板下方两种铺设位置 · 水平平行敷设 · 全程互联）：
//   强电桥架由 -X 端墙的配电柜 / UPS 起，经「主干母线（沿端墙 Z 向）」汇流，
//   再由「馈线（沿 +X 向）」逐排 T 接至每排机柜正上方的「列运行（沿 Z 向）」，
//   形成从电源点到每台机柜上方的连续路由网络（中间桥架与旁边桥架连通，不孤立）。
//   弱电桥架采用同一互联拓扑（主干 + 馈线 + 列运行），自 -X 端墙数据引入点敷设。
//   强弱电默认「竖向分层」敷设：弱电 Y=3.40m 在上、强电 Y=3.00m 在下，垂直净距
//   0.22m（>0，已错层），从根本上消除同标高长距离并行耦合与交叉过桥；横向仍各
//   偏 ±0.35m 作辅助净距。若用户改回同标高，过桥弯避让逻辑自动生效。
//   电源缆线自强电桥架（PDU 侧）落柜顶前走线口，数据缆线自弱电桥架（配线架侧）
//   落柜顶后走线口，两类缆线出桥架即分开，不在柜顶混行。
//   铺设位置 place：'over' 机柜上方（吊杆悬吊，默认）；'under' 静电地板下方
//   （架空层内支架支撑，标高 y<0，立杆落至结构板面）。
//   布置走向 route：'network' 全程互联（默认）；'rows' 仅沿每排机柜纵贯；
//   'cross' 仅主干 + 馈线横穿。全部路由均为轴对齐（横平竖直），逐排对齐规整。
//   兼容：旧版「地板下弱电层」（weak.floor.enabled）在 place='over' 时仍生效。
//   自定义路径（手绘布线）：除自动拓扑外，用户可经交互手动绘制强弱电桥架走向
//   （addPathPoint 逐点轴对齐吸附、finishPath 落盘），系统按节点自动生成对应规格
//   托盘并补转角弯头；路径接入同一 _allRuns 池，强弱电竖向分层与过桥弯避让自动复用。
//
// 过桥弯（空间交叉避让，本文件核心不变量）：
//   强弱电（及配套）桥架在平面内交叉时，严禁同层直接重叠。系统对每个「同标高
//   平面交叉点」自动生成过桥弯——高等优先级类（弱电 > 强电 > 配套）在交叉处
//   向上抬升「上行桥 + 双侧竖向弯头」，跨越低等优先级类，实现上下错层避让。
//   判定口径：仅当两类桥架竖向范围重叠（|Δy| < 槽高 0.18m）才构成「同层冲突」，
//   需过桥；已错层（如配套 4.20m 高于主体 3.40m、地板下 −0.30m 低于吊顶内）
//   则不冲突、不过桥。抬升量动态计算，保证桥底越过被跨桥架顶边并留裕量。
//   所有交叉点位置与标高经 getCrossovers() 输出，供图纸标注与验收复核。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { roomDims } from './config.js';
import {
  loadBridgeConfig, saveBridgeConfig, sanitizeBridgeConfig,
  loadBridgePaths, saveBridgePaths, sanitizeBridgePath, PATH_MOUNTS,
} from './bridgeConfig.js';
import { getLiveFloorConfig, getFloorPlenum } from './floorConfig.js';

const PLATE_T = 0.05;   // 槽底厚度
const RAIL_H = 0.13;    // 侧帮高度
const KINDS = ['weak', 'strong', 'aux'];
// 过桥弯几何参数
const HOP_HALF = 0.30;   // 过桥段半宽（沿桥架长度方向）
const HOP_CLEAR = 0.26;  // 同标高交叉时的最小抬升净空（> 槽高 0.18m）
const HOP_MARGIN = 0.06; // 桥底越过被跨桥架顶边后的附加裕量

export class BridgeSystem {
  constructor(app) {
    this.app = app;
    this._groups = { weak: null, strong: null, aux: null }; // kind -> THREE.Group
    this._vis = { weak: false, strong: false, aux: false };
    this._sig = '';   // 上次构建时的布局签名
    this._acc = 0;    // 签名检查累时器（秒）
    this._cfg = loadBridgeConfig(); // 用户配置（缺失/损坏时内部回落默认值）
    this._paths = loadBridgePaths(roomDims); // 自定义路径（手绘布线）：{ weak:[path], strong:[path] }
    this._draft = { weak: null, strong: null }; // 手绘中的进行态路径（仅预览，不落盘）
    this._fpsBridge = false;   // 第一人称模式：桥架强制显示且不透明
    this._savedVis = null;     // 进入第一人称前各桥架显隐快照（退出时还原）
    this._crossovers = [];     // 过桥弯记录：[{x,z,over,under,baseY,bridgeY,lift}]
  }

  // 过桥优先级：数值高者在上（跨越对方）。弱电跨强电、弱电/强电跨配套。
  static PRIORITY = { weak: 2, strong: 1, aux: 0 };

  // -------------------------------------------------------------------------
  // 配置驱动接口（实时预览 = 应用后对可见类即时重建）
  // -------------------------------------------------------------------------
  /** 当前生效配置深拷贝（防御性拷贝，外部改写不影响内部态） */
  getConfig() { return JSON.parse(JSON.stringify(this._cfg)); }

  /**
   * 应用新配置。next 可为局部配置（缺失 kind 以默认补齐）；
   * 标量参数经 sanitizeBridgeConfig 钳制到合法范围，层间距等结构性问题
   * 不静默改动用户高度值——由面板 validateBridgeConfig 报错提示。
   * opts.save !== false 时写入 localStorage；返回应用后的配置深拷贝。
   */
  setConfig(next, opts = {}) {
    // floorCfg：地板「离地高度/板厚」决定 under 敷设的标高区间（活配置，含面板预览态）
    this._cfg = sanitizeBridgeConfig(next, roomDims, getLiveFloorConfig());
    if (opts.save !== false) saveBridgeConfig(this._cfg);
    this._rebuildVisible();
    return this.getConfig();
  }

  /** 恢复默认配置（持久化 + 重建可见桥架） */
  resetConfig() { return this.setConfig({}, { save: true }); }

  _rebuildVisible() { for (const k of KINDS) if (this._vis[k]) this._build(k); }

  // -------------------------------------------------------------------------
  // 自定义路径（手绘布线）API
  // 节点强制轴对齐：相邻两点共享 X 或共享 Z，保证桥架横平竖直、转角可生成直角弯头。
  // 标高沿用「桥架铺设参数」面板里该类桥架的首层配置（layer.y），mount 决定水平落位。
  // -------------------------------------------------------------------------
  /** 开始一条新路径（kind: weak|strong，mount: over|under|wall）。返回草稿或 null */
  beginPath(kind, mount = 'over') {
    if (kind !== 'weak' && kind !== 'strong') return null;
    if (PATH_MOUNTS.indexOf(mount) < 0) mount = 'over';
    this._draft[kind] = { mount, points: [] };
    return this._draft[kind];
  }

  /** 是否正在手绘某类 */
  isDrawing(kind) { return !!(this._draft[kind] && this._draft[kind].points); }

  /** 手绘草稿（深拷贝，只读） */
  getDraft(kind) { return this._draft[kind] ? JSON.parse(JSON.stringify(this._draft[kind])) : null; }

  /** 已保存路径（kind: weak|strong） */
  getPaths(kind) {
    return (this._paths[kind] || []).map((p) => ({ ...p, points: p.points.map((q) => ({ ...q })) }));
  }

  /** 切换草稿敷设方式（绘制中途也可改） */
  setDraftMount(kind, mount) {
    if (this._draft[kind]) this._draft[kind].mount = PATH_MOUNTS.indexOf(mount) >= 0 ? mount : 'over';
    return this._draft[kind];
  }

  /**
   * 追加路径节点。raw 为地板平面 {x,z}（over/under）或吸附后的墙坐标
   * {x,z,wallKey}（wall）。新点自动与上一节点轴对齐（共享 X 或共享 Z，取更接近者）。
   * 返回当前节点数。
   */
  addPathPoint(kind, raw) {
    const d = this._draft[kind];
    if (!d || !raw || !Number.isFinite(raw.x) || !Number.isFinite(raw.z)) return 0;
    const p = { x: raw.x, z: raw.z };
    if (typeof raw.wallKey === 'string') p.wallKey = raw.wallKey;
    const pts = d.points;
    if (pts.length) {
      const prev = pts[pts.length - 1];
      const dx = Math.abs(p.x - prev.x), dz = Math.abs(p.z - prev.z);
      if (dx < 1e-4 && dz < 1e-4) return pts.length; // 同点忽略
      // 轴对齐吸附：取「主位移方向」为保留轴，把另一轴吸附到上一节点，保证横平竖直。
      // X 向位移更大 → 保留 X、把 Z 吸附到 prev.z；否则（Z 向更大或相等）保留 Z、把 X 吸附到 prev.x。
      if (dx > dz) p.z = prev.z; else p.x = prev.x;
    }
    pts.push(p);
    return pts.length;
  }

  /** 撤销手绘中最后一个节点 */
  undoPathPoint(kind) {
    const d = this._draft[kind];
    if (!d) return 0;
    d.points.pop();
    if (!d.points.length) this._draft[kind] = null;
    return d ? d.points.length : 0;
  }

  /** 完成手绘路径：≥2 节点才保存，否则丢弃。落盘并返回保存后的路径或 null */
  finishPath(kind) {
    const d = this._draft[kind];
    if (!d) return null;
    this._draft[kind] = null;
    const p = sanitizeBridgePath({ mount: d.mount, points: d.points }, roomDims);
    if (!p) return null;
    if (!this._paths[kind]) this._paths[kind] = [];
    this._paths[kind].push(p);
    this._persistPaths();
    if (this._vis[kind]) this._build(kind);
    return p;
  }

  /** 取消手绘（丢弃草稿，不落盘） */
  cancelPath(kind) { this._draft[kind] = null; }

  /** 删除一条已保存路径 */
  removePath(kind, id) {
    if (!this._paths[kind]) return false;
    const i = this._paths[kind].findIndex((p) => p.id === id);
    if (i < 0) return false;
    this._paths[kind].splice(i, 1);
    this._persistPaths();
    if (this._vis[kind]) this._build(kind);
    return true;
  }

  /** 清空某类全部手绘路径 */
  clearPaths(kind) {
    this._paths[kind] = [];
    this._persistPaths();
    if (this._vis[kind]) this._build(kind);
  }

  _persistPaths() { saveBridgePaths(this._paths); }

  /** 弯头半径：随桥架宽度自适应，封顶 0.20m（避免小桥架弯头过大） */
  _elbowR(spec) { return Math.min(0.20, spec.width / 2 + 0.04); }

  /**
   * 由自定义路径生成 axis-aligned run 列表（与自动路由同口径，过桥弯/分层复用
   * _hopsFor）。直线段在内部节点处各内缩一个弯头半径 R，腾出空间给转角弯头，
   * 保证「直线—弯头—直线」连贯衔接、无穿模。
   */
  _customRunsFor(kind, L, spec) {
    const paths = this._paths[kind] || [];
    const runs = [];
    const R = this._elbowR(spec);
    for (const path of paths) {
      const pts = path.points;
      if (pts.length < 2) continue;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const dlen = Math.hypot(b.x - a.x, b.z - a.z);
        if (dlen < 1e-4) continue;
        const ux = (b.x - a.x) / dlen, uz = (b.z - a.z) / dlen;
        const entry = i > 0 ? R : 0;
        const exit = i + 1 < pts.length - 1 ? R : 0;
        const ax = a.x + ux * entry, az = a.z + uz * entry;
        const bx = b.x - ux * exit, bz = b.z - uz * exit;
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.05) continue;
        if (Math.abs(a.z - b.z) < 1e-4) {
          runs.push({ kind, spec, x: (ax + bx) / 2, z: a.z, len, cross: true, run: 'path' });
        } else {
          runs.push({ kind, spec, x: a.x, z: (az + bz) / 2, len, cross: false, run: 'path' });
        }
      }
    }
    return runs;
  }

  /** 转角弯头几何：每条路径每个内部节点生成 90° 圆弧托盘弯头，衔接两侧直线段 */
  _elbowGeosFor(kind, spec) {
    const paths = this._paths[kind] || [];
    const out = [];
    const R = this._elbowR(spec);
    for (const path of paths) {
      const pts = path.points;
      for (let i = 1; i < pts.length - 1; i++) {
        this._buildElbow(pts[i - 1], pts[i], pts[i + 1], R, spec, out);
      }
    }
    return out;
  }

  /** 在 (cx,cz) 处放置一段沿 ang 方向（0=+Z, π/2=+X）的短托盘，归入 arr */
  _pushOrientedTray(arr, cx, cz, ang, segLen, spec) {
    const tmp = [];
    this._trayPiece(-segLen / 2, segLen / 2, 0, spec, tmp, { endCaps: [false, false], support: false, gaps: [] });
    for (const g of tmp) { g.rotateY(ang); g.translate(cx, spec.y, cz); arr.push(g); }
  }

  /** 单个 90° 转角弯头（四分之一圆弧托盘） */
  _buildElbow(prev, v, next, R, spec, arr) {
    const dIn = new THREE.Vector2(v.x - prev.x, v.z - prev.z);
    if (dIn.lengthSq() < 1e-9) return;
    dIn.normalize();
    const dOut = new THREE.Vector2(next.x - v.x, next.z - v.z);
    if (dOut.lengthSq() < 1e-9) return;
    dOut.normalize();
    // 圆心：从 v 沿 -dIn 退 R 到切线点 T_in，再沿 dOut 进 R 到圆心 C
    const C = new THREE.Vector2(v.x - dIn.x * R + dOut.x * R, v.z - dIn.y * R + dOut.y * R);
    // 注意：此处用 THREE.Vector2 承载 (x,z) 平面坐标，z 分量落在 .y 上（Vector2 无 .z）
    const at = (p) => Math.atan2(p.x - C.x, p.y - C.y); // (x,z) → 角（0=+Z 约定）
    let a0 = at(new THREE.Vector2(v.x - dIn.x * R, v.z - dIn.y * R)); // T_in
    let a1 = at(new THREE.Vector2(v.x + dOut.x * R, v.z + dOut.y * R)); // T_out
    let sweep = a1 - a0;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    const N = 6;
    const segLen = (Math.abs(sweep) * R) / N;
    for (let k = 0; k < N; k++) {
      const a = a0 + sweep * (k + 0.5) / N;
      const px = C.x + Math.sin(a) * R;
      const pz = C.y + Math.cos(a) * R;
      // 沿运动方向的数值切线（运动方向与参数递增方向相反，取 a-ε）
      const a2 = a - 1e-3;
      const tx = (C.x + Math.sin(a) * R) - (C.x + Math.sin(a2) * R);
      const tz = (C.y + Math.cos(a) * R) - (C.y + Math.cos(a2) * R);
      const tl = Math.hypot(tx, tz) || 1;
      const ang = Math.atan2(tx / tl, tz / tl);
      this._pushOrientedTray(arr, px, pz, ang, segLen, spec);
    }
  }

  /**
   * 由配置生成「每类每层一条」的可视化规格。aux 对应 ground + fire 两类。
   * order 按安装高度单调递增：透明槽体按低→高绘制，高处盖低处（用户把
   * 某类抬高后层序自动跟随，无需维护固定序号）。
   * place='under'（静电地板下方）的规格：floor=true 改走支架分支，plenum
   * 携带当前架空层深度（立杆落至结构板面），order 取负值画在场景最底层。
   */
  _specsFor(kind) {
    const cfgKinds = kind === 'aux' ? ['ground', 'fire'] : [kind];
    const plenum = getFloorPlenum();
    const specs = [];
    for (const k of cfgKinds) {
      const c = this._cfg[k];
      if (!c || !Array.isArray(c.layers) || !c.layers.length) continue;
      const under = c.place === 'under';
      c.layers.forEach((l, i) => {
        specs.push({
          label: c.layers.length > 1 ? `${c.label}·第${i + 1}层` : c.label,
          width: l.width,
          y: l.y,
          color: c.color,
          opacity: under ? Math.min(0.65, c.opacity + 0.10) : c.opacity,
          rungStep: c.rungStep,
          hangerStep: c.hangerStep,
          offsetX: c.offsetX || 0,
          order: under ? -1 : 2 + Math.round(l.y * 10),
          floor: under,
          plenum,
          place: under ? 'under' : 'over',
        });
      });
    }
    // 兼容旧版「地板下弱电层」（weak.floor.enabled）：仅机柜上方敷设时附加，
    // place='under' 时主层已在地板下，不重复生成
    if (kind === 'weak') {
      const f = this._cfg.weak && this._cfg.weak.floor;
      if (f && f.enabled && this._cfg.weak.place !== 'under') {
        specs.push({
          label: '地板下弱电桥架',
          width: f.width,
          y: f.y,
          color: this._cfg.weak.color,
          opacity: Math.min(0.65, this._cfg.weak.opacity + 0.10),
          rungStep: f.rungStep,
          hangerStep: f.hangerStep,
          offsetX: f.offsetX || 0,
          order: -1,
          floor: true,
          plenum,
          place: 'under',
        });
      }
    }
    return specs;
  }

  // -------------------------------------------------------------------------
  // 显隐（工具栏/大屏一键切换）
  // -------------------------------------------------------------------------
  /** 当前显隐状态（供工具栏统一切换） */
  isVisible(kind) { return !!this._vis[kind]; }

  /**
   * 一键显隐：true 按当前布局与配置即时重建，false 立即移除。
   * this._onVisChange(kind, v) 可选回调：面板自动揭示与 Vue 大屏按钮态
   * 同步都经它广播——所有显隐变更（工具栏/大屏/面板）走同一出口。
   */
  setVisible(kind, v) {
    if (KINDS.indexOf(kind) < 0) return;
    this._vis[kind] = !!v;
    if (typeof this._onVisChange === 'function') {
      try { this._onVisChange(kind, this._vis[kind]); } catch (_) { /* 回调异常不阻断显隐 */ }
    }
    if (v) {
      this._sig = this._sigNow(); // 记录签名，避免 update 立即重复重建
      this._rebuildVisible();      // 重建全部可见类：保证弱电可见强电并能在交叉处生过桥弯
    } else {
      this._clear(kind);
    }
  }

  /**
   * 第一人称模式：进入时强制显示全部桥架且不透明（去掉透明），
   * 退出时按进入前的显隐快照精确还原（含半透明材质）。
   * 不影响第三人在工具栏/面板里的手动显隐状态。
   */
  _fireVis(k, v) {
    if (typeof this._onVisChange === 'function') {
      try { this._onVisChange(k, v); } catch (_) { /* 回调异常不阻断 */ }
    }
  }
  setFpsMode(on) {
    on = !!on;
    if (on === this._fpsBridge) return;
    if (on) {
      this._savedVis = { weak: this._vis.weak, strong: this._vis.strong, aux: this._vis.aux };
      this._fpsBridge = true;
      for (const k of KINDS) {
        this._vis[k] = true;
        this._build(k);
        this._fireVis(k, true);
      }
    } else {
      this._fpsBridge = false;
      const sv = this._savedVis || { weak: false, strong: false, aux: false };
      for (const k of KINDS) {
        this._vis[k] = sv[k];
        if (sv[k]) { this._build(k); this._fireVis(k, true); }
        else { this._clear(k); this._fireVis(k, false); }
      }
      this._savedVis = null;
    }
  }

  /** 由当前机柜布局推导机柜排（按 X 聚排）与阵列 Z 范围 */
  _layout() {
    const racks = (this.app.racks && this.app.racks.racks) || [];
    const servers = racks.filter((r) => r.type === 'server');
    // 空机房（无服务器阵列）时不生成任何桥架：ok=false 让 aux 也整体跳过
    if (servers.length < 2) return { rows: [], zMin: 0, zMax: 0, ok: false };
    // 按 X 聚排（同排 X 相同；5cm 精度容忍存档浮点误差）
    const byX = new Map();
    for (const r of servers) {
      const k = Math.round((r.x || 0) * 20) / 20;
      if (!byX.has(k)) byX.set(k, []);
      byX.get(k).push(r);
    }
    const rows = [...byX.entries()].map(([x, list]) => ({
      x,
      z0: Math.min.apply(null, list.map((r) => r.z || 0)),
      z1: Math.max.apply(null, list.map((r) => r.z || 0)),
    })).sort((a, b) => a.x - b.x);
    const zs = servers.map((r) => r.z || 0);
    return { rows, zMin: Math.min.apply(null, zs), zMax: Math.max.apply(null, zs), ok: true };
  }

  /** 布局签名：房间尺寸 + 机柜数量/位置（0.25m 精度；正上方方案不依赖排朝向） */
  _sigNow() {
    const racks = (this.app.racks && this.app.racks.racks) || [];
    let s = `${roomDims.width}x${roomDims.height}x${roomDims.depth}|${racks.length}`;
    for (const r of racks) {
      if (r.type !== 'server') continue;
      s += `,${Math.round((r.x || 0) * 4) / 4},${Math.round((r.z || 0) * 4) / 4}`;
    }
    return s;
  }

  /**
   * 生成某 kind 在给定 spec 下的路由清单。每项携带 kind/spec/轴向（cross）与
   * 平面跨度（x/z/len），既用于建几何，也用于过桥弯的交叉判定：
   *   · Z 向段（cross 缺省）：固定 x = run.x，沿 Z 跨 [z−len/2, z+len/2]；
   *   · X 向段（cross=true）：固定 z = run.z，沿 X 跨 [x−len/2, x+len/2]。
   * 馈线（X 向）的错峰布点：同类多段馈线若共用同一 Z 线，X 跨度互相嵌套，
   * 会在同标高同 Z 上整段重叠（旧版即此缺陷）。现按「弱电组 → 强电组」顺序
   * 沿主干母线 Z 跨度分组等距排布：组内距 = 本类宽度 + 0.05m（同类不重叠），
   * 组间距 0.65m（两类半宽和 0.35m + 净距 0.30m，GB 51348-2019 第 8.5.5 条
   * 第 2 款降档值）；布点超出源设备 Z 区间时主干母线随之延伸覆盖（汇流母排
   * 沿端墙加长即可够到所有 T 接点，物理上成立）。
   */
  _runsFor(kind, L, spec) {
    const runs = [];
    const ox = spec.offsetX || 0;
    if (kind === 'weak' || kind === 'strong') {
      const route = this._cfg[kind].route || 'network'; // network 全程互联 / rows 沿排纵贯 / cross 横穿
      // 源设备（配电柜 / UPS，位于 -X 端墙）坐标 → 推导主干母线起点与覆盖 Z 区间
      const powerRacks = ((this.app.racks && this.app.racks.racks) || []).filter((r) => r.type === 'power' || r.type === 'ups');
      let endX = L.rows.length ? L.rows[0].x - 4.76 : -10.76;
      let spineZ0 = L.zMin - 1.0, spineZ1 = L.zMax + 1.0;
      if (powerRacks.length) {
        endX = Math.min.apply(null, powerRacks.map((r) => r.x));
        const pz = powerRacks.map((r) => r.z || 0);
        spineZ0 = Math.min.apply(null, pz) - 1.5;
        spineZ1 = Math.max.apply(null, pz) + 1.5;
      }
      // 馈线错峰带（弱电组在前、强电组在后）；按需延伸主干母线覆盖整个布点带
      const n = L.rows.length;
      const wW = ((this._cfg.weak.layers || [])[0] || {}).width || 0.4;
      const wS = ((this._cfg.strong.layers || [])[0] || {}).width || 0.3;
      const stepW = wW + 0.05, stepS = wS + 0.05;
      const bandW0 = spineZ0 + 0.5, bandW1 = spineZ0 + 0.5 + Math.max(0, n - 1) * stepW + wW / 2;
      const bandS0 = bandW1 + 0.30 + wS / 2, bandS1 = bandS0 + Math.max(0, n - 1) * stepS + wS / 2;
      const band0 = Math.min(bandW0 - wW / 2, bandS0 - wS / 2);
      const band1 = Math.max(bandW1, bandS1);
      spineZ0 = Math.min(spineZ0, band0 - 0.30);
      spineZ1 = Math.max(spineZ1, band1 + 0.30);
      const feederZ = (i) => (kind === 'weak' ? bandW0 + i * stepW : bandS0 + i * stepS);
      // 1) 主干母线：沿 -X 端墙（源设备侧）敷设，覆盖配电柜/UPS 与馈线布点带
      if (route !== 'rows') {
        runs.push({ kind, spec, x: endX + ox, len: spineZ1 - spineZ0, z: (spineZ0 + spineZ1) / 2, run: 'spine' });
      }
      // 2) 馈线：自主干母线错峰引出，沿 +X 敷至每排机柜（T 接列运行）
      if (route !== 'rows') {
        for (let i = 0; i < n; i++) {
          const row = L.rows[i];
          const reach = row.x + ox, x0 = endX + ox;
          runs.push({ kind, spec, x: (x0 + reach) / 2, len: Math.abs(reach - x0), z: feederZ(i), cross: true, run: 'feeder' });
        }
      }
      // 3) 列运行：沿 Z 贯通每排机柜正上方（弱电落柜顶后走线口 / 强电落前走线口）；
      //    place='under' 时为每排机柜正下方（架空层内）
      if (route !== 'cross') {
        for (const row of L.rows) {
          runs.push({ kind, spec, x: row.x + ox, len: row.z1 - row.z0, z: (row.z0 + row.z1) / 2, run: 'row' });
        }
      }
    } else if (L.ok) {
      // 配套桥架：沿 X 横穿，扎在机柜阵列两端外侧 1.2m（接地干线 + 消防管架各两道）；
      // 空机房（无服务器阵列）整体不生成
      const half = Math.max(1, roomDims.width / 2 - 0.6);
      runs.push({ kind, spec, x: 0, len: half * 2, z: L.zMin - 1.2 + ox, cross: true, run: 'cross' });
      runs.push({ kind, spec, x: 0, len: half * 2, z: L.zMax + 1.2 + ox, cross: true, run: 'cross' });
    }
    return runs;
  }

  /**
   * 过桥判定：枚举与 run 平面交叉的其他段，按「优先级高者在上」生成本段的
   * 过桥清单（仅含本段在上的交叉点）。判定口径：
   *   1) 同向平行不交叉；平面交点须同时落在两段跨度内（T 接点落在段端，
   *      由下方「贴边内收」规则自然排除，不作为交叉处理）；
   *   2) 仅当竖向范围重叠（|Δy| < 槽高 0.18m）才构成同层冲突，需过桥；
   *      已错层（配套 4.20m vs 主体 3.40m、地板下 −0.30m vs 吊顶内）不冲突；
   *   3) 上下关系：弱电 > 强电 > 配套（PRIORITY）；同类段按「X 向馈线在上」；
   *   4) 过桥段须整体落在本段内（贴边时内收，且仍须覆盖被跨段宽度）；
   *   5) 抬升量动态计算：桥底越过被跨槽顶并留 HOP_MARGIN，且不低于 HOP_CLEAR；
   *      再受板底/地板面钳制；净空实在不足时放弃该点并告警（不静默留重叠）。
   */
  _hopsFor(run, allRuns) {
    const hops = [];
    const spec = run.spec;
    const TRAY_H = PLATE_T + RAIL_H;
    if (run.len < 2 * (HOP_HALF + 0.06)) return hops; // 段长容不下过桥弯
    for (const o of allRuns) {
      if (o === run) continue;
      if (!!o.cross === !!run.cross) continue;                 // 同向平行
      if (Math.abs(o.spec.y - spec.y) >= TRAY_H - 1e-6) continue; // 已错层，不冲突
      const pr = BridgeSystem.PRIORITY[run.kind] || 0;
      const po = BridgeSystem.PRIORITY[o.kind] || 0;
      const over = pr !== po ? (pr > po ? run : o) : (run.cross ? run : o);
      if (over !== run) continue;                               // 本段为被跨方，无几何动作
      let px, pz, lc;
      if (!run.cross) { // 本段沿 Z：固定 x，跨 z
        px = run.x; pz = o.z; lc = pz - run.z;
        if (px < o.x - o.len / 2 - 1e-6 || px > o.x + o.len / 2 + 1e-6) continue;
      } else {          // 本段沿 X：固定 z，跨 x
        pz = run.z; px = o.x; lc = px - run.x;
        if (pz < o.z - o.len / 2 - 1e-6 || pz > o.z + o.len / 2 + 1e-6) continue;
      }
      if (lc < -run.len / 2 - 1e-6 || lc > run.len / 2 + 1e-6) continue;
      const lo = -run.len / 2 + HOP_HALF + 0.06, hi = run.len / 2 - HOP_HALF - 0.06;
      let lcFit = lc;
      if (lcFit < lo || lcFit > hi) {
        lcFit = Math.min(hi, Math.max(lo, lcFit));
        if (Math.abs(lcFit - lc) > HOP_HALF - o.spec.width / 2 - 0.03) continue; // 内收后盖不住被跨段
      }
      const oTop = o.spec.y + TRAY_H; // 被跨桥架槽顶
      let bridgeY = spec.y + Math.max(HOP_CLEAR, oTop + HOP_MARGIN - spec.y);
      const ceilLim = (spec.floor ? -0.02 : roomDims.height - 0.02) - TRAY_H; // 板底/地板面限值
      let clamped = false;
      if (bridgeY > ceilLim) { bridgeY = ceilLim; clamped = true; }
      if (bridgeY < oTop + 0.01) {
        console.warn(`[桥架] 交叉点 (${px.toFixed(2)}, ${pz.toFixed(2)}) 净空不足，无法生成过桥弯：${spec.label} 未能翻越 ${o.spec.label}（请分层敷设或改换铺设位置）`);
        continue;
      }
      hops.push({
        lc: lcFit, px, pz, bridgeY, clamped,
        over: run.kind, overRun: run.run, under: o.kind, underRun: o.run,
        baseY: spec.y, lift: bridgeY - spec.y,
      });
    }
    return hops;
  }

  /**
   * 生成一段「沿 Z、中心在原点」的桥架几何，返回 { base, bridge }：
   *   base   —— 基座托盘（按过桥缺口切分后的各段，含端盖与吊杆/立柱支撑）；
   *   bridge —— 过桥弯部件（上行桥 + 双侧竖弯头），由调用方作为独立 Mesh 挂载。
   * hops: [{ lc, bridgeY }] —— lc 为过桥中心沿长度方向的局部坐标，
   * bridgeY 为上行桥槽底标高（已含被跨桥架顶边净空核算）。
   */
  _trayGeosZ(len, spec, hops = [], gnd = null) {
    const W = spec.width, y = spec.y, L = Math.max(0.2, len);
    const base = [], bridge = [], hanger = [];
    const hs = hops
      .slice()
      .sort((a, b) => a.lc - b.lc)
      .filter((h) => h.lc - HOP_HALF >= -L / 2 - 1e-6 && h.lc + HOP_HALF <= L / 2 + 1e-6);
    // 基座段：按过桥缺口切分（缺口内不覆板，由上行桥替代）
    let cursor = -L / 2;
    const segs = [];
    for (const h of hs) {
      const g0 = h.lc - HOP_HALF, g1 = h.lc + HOP_HALF;
      if (g0 - cursor > 0.05) segs.push([cursor, g0]);
      cursor = Math.max(cursor, g1);
    }
    if (L / 2 - cursor > 0.05) segs.push([cursor, L / 2]);
    const gaps = hs.map((h) => [h.lc - HOP_HALF, h.lc + HOP_HALF]);
    for (const [za, zb] of segs) {
      this._trayPiece(za, zb, y, spec, base, {
        endCaps: [za <= -L / 2 + 1e-6, zb >= L / 2 - 1e-6], // 仅路由真正端点封盖
        gaps, gnd, hangerArr: hanger,
      });
    }
        // 过桥弯：上行桥（无端盖/无支撑，靠竖弯头与基座连接）+ 双侧竖弯头
    for (const h of hs) {
      this._trayPiece(h.lc - HOP_HALF, h.lc + HOP_HALF, h.bridgeY, spec, bridge, {
        endCaps: [false, false], support: false,
      });
      const rise = h.bridgeY - y;
      if (rise <= 0.001) continue;
      // 过桥弯竖弯头：原实现为直角硬拐（0.05m 厚矩形盒），易误导非专业安装者
      // 以为直角可行。现改为「圆角 U 形弯头」——两端各四分之一圆弧（半径 R 示意
      // 缆线最小弯曲半径），以折线 Box 近似，体现平滑过渡。实际最小弯曲半径仍须
      // 满足缆线厂家要求（铜缆 ≥4×外径、光纤 ≥10×外径、电力缆 ≥6×外径）。
      const R = Math.min(0.12, rise / 2.4);
      const N = 4;
      for (const s of [-1, 1]) {
        const zc = h.lc + s * HOP_HALF;
        // 竖弯头直线段（中间，避开两端圆弧）
        const lineBot = y + R, lineTop = y + rise - R;
        if (lineTop > lineBot + 0.001) {
          const gm = new THREE.BoxGeometry(W, lineTop - lineBot, 0.05);
          gm.translate(0, (lineBot + lineTop) / 2, zc);
          bridge.push(gm);
        }
        // 底弧：基座水平段 → 竖弯头（弧心 (zc, y)，a:0→(zc−sR,y) 水平末端；a:90→(zc,y+R) 竖弯头底）
        for (let k = 0; k < N; k++) {
          const a0 = (k / N) * Math.PI / 2, a1 = ((k + 1) / N) * Math.PI / 2;
          const z0 = zc - s * R * Math.cos(a0), y0 = y + R * Math.sin(a0);
          const z1 = zc - s * R * Math.cos(a1), y1 = y + R * Math.sin(a1);
          const dz = z1 - z0, dy = y1 - y0, len = Math.hypot(dz, dy);
          const seg = new THREE.BoxGeometry(W, 0.05, len);
          // BoxGeometry 默认居中于本地原点，须先绕自身中心旋转，再平移到目标位；
          // 若先 translate 再 rotateX，rotateX 会绕世界原点旋转，把已平移的段甩到错误高度。
          seg.rotateX(Math.atan2(-dy, dz));
          seg.translate(0, (y0 + y1) / 2, (z0 + z1) / 2);
          bridge.push(seg);
        }
        // 顶弧：竖弯头 → 上行桥水平段（弧心 (zc, y+rise)，a:0→(zc−sR,y+rise) 水平末端；a:90→(zc,y+rise−R) 竖弯头顶下）
        for (let k = 0; k < N; k++) {
          const a0 = (k / N) * Math.PI / 2, a1 = ((k + 1) / N) * Math.PI / 2;
          const z0 = zc - s * R * Math.cos(a0), y0 = (y + rise) - R * Math.sin(a0);
          const z1 = zc - s * R * Math.cos(a1), y1 = (y + rise) - R * Math.sin(a1);
          const dz = z1 - z0, dy = y1 - y0, len = Math.hypot(dz, dy);
          const seg = new THREE.BoxGeometry(W, 0.05, len);
          seg.rotateX(Math.atan2(-dy, dz));
          seg.translate(0, (y0 + y1) / 2, (z0 + z1) / 2);
          bridge.push(seg);
        }
      }
    }
    return { base, bridge, hanger };
  }

  /**
   * 单段托盘几何（沿 Z、区间 [za, zb]、槽底标高 yy）：槽底 + 双侧帮 + 横档
   * + 端盖（可选）+ 吊杆/短立柱支撑（可选；过桥缺口范围内不布置支撑，
   * 避免吊杆穿模上行桥）。全部为轴对齐盒体/圆柱，可合并为单 Mesh。
   */
  _trayPiece(za, zb, yy, spec, arr, opts = {}) {
    const W = spec.width, len = zb - za;
    if (len <= 0.02) return;
    const mid = (za + zb) / 2;
    // 支撑件（吊杆/锚板/立柱）收集到 hangerArr（若有），以便用中性金属材质呈现，
    // 避免彩色吊杆在青色场景里像「分子图钉」；缺省退回主色 arr。
    const harr = opts.hangerArr;
    const add = (geo, px, py, pz) => { geo.translate(px, py, pz); arr.push(geo); };
    const hadd = (geo, px, py, pz) => { geo.translate(px, py, pz); (harr || arr).push(geo); };
    // 槽底
    add(new THREE.BoxGeometry(W, PLATE_T, len), 0, yy + PLATE_T / 2, mid);
    // 两侧帮
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.03, RAIL_H, len), s * (W / 2 - 0.015), yy + PLATE_T + RAIL_H / 2, mid);
    }
    // 横档（穿孔/梯级桥架的观感锚点）
    const n = Math.max(1, Math.floor(len / spec.rungStep));
    for (let i = 0; i <= n; i++) {
      add(new THREE.BoxGeometry(W, 0.025, 0.035), 0, yy + PLATE_T + 0.0125, za + (len * i) / n);
    }
    // 端部盖板（仅路由真正端点；过桥缺口边缘不封盖，由竖弯头过渡）
    const caps = opts.endCaps || [true, true];
    const gnd = opts.gnd || null; // 接地跨接几何收集器（仅弱电/强电传入，独立材质呈现）
    for (const [i, z] of [[0, za], [1, zb]]) {
      if (!caps[i]) continue;
      add(new THREE.BoxGeometry(W + 0.08, RAIL_H + 0.02, 0.04), 0, yy + PLATE_T + (RAIL_H + 0.02) / 2 - 0.01, z);
      // 接地跨接：端盖外侧伸出跨接扁钢 + 等电位联结端子，体现 GB 50303-2015
      // 桥架接地连续（段间跨接）。仅路由真正端点（caps[i]=true）加；过桥缺口边缘不加。
      if (gnd) {
        const zEdge = i === 0 ? z - 0.07 : z + 0.07; // 伸出路由端点 7cm，与相邻段叠接成连续跨接
        gnd.push(new THREE.BoxGeometry(W + 0.04, 0.04, 0.14).translate(0, yy + PLATE_T + RAIL_H + 0.02, zEdge));
        gnd.push(new THREE.BoxGeometry(0.07, 0.07, 0.07).translate(0, yy + PLATE_T + RAIL_H + 0.06, zEdge));
      }
    }
    // 支撑结构：吊顶内桥架用吊杆 + 顶板锚板；地板下桥架改短立柱支于架空层
    // 结构板面（立柱高度 = 槽底到板面，随离地高度 raise 自适应）
    if (opts.support === false) return;
    const gaps = opts.gaps || [];
    const inGap = (z) => gaps.some(([a, b]) => z >= a - 1e-6 && z <= b + 1e-6);
    if (spec.floor) {
      const plenum = Number.isFinite(spec.plenum) ? spec.plenum : 0.35;
      const postH = Math.max(0.04, yy + plenum); // 槽底 y(负) → 结构板面 -plenum
      const sn = Math.max(1, Math.floor(len / Math.max(0.6, spec.hangerStep || 1.2)));
      for (let i = 0; i <= sn; i++) {
        const z = za + (len * i) / sn;
        if (inGap(z)) continue;
        hadd(new THREE.CylinderGeometry(0.02, 0.02, postH, 8), 0, yy - postH / 2, z); // 短立柱：地板下桥架落于架空层
        hadd(new THREE.BoxGeometry(0.10, 0.014, 0.10), 0, -plenum + 0.007, z);           // 柱脚底板（结构板面上）
      }
    } else {
      const ceil = roomDims.height - 0.18;
      const hn = Math.max(1, Math.floor(len / spec.hangerStep));
      for (let i = 0; i <= hn; i++) {
        const z = za + (len * i) / hn;
        if (inGap(z)) continue;
        const h = ceil - (yy + PLATE_T + RAIL_H);
        if (h <= 0.05) continue;
        hadd(new THREE.CylinderGeometry(0.018, 0.018, h, 8), 0, yy + PLATE_T + RAIL_H + h / 2, z);
        hadd(new THREE.BoxGeometry(0.18, 0.02, 0.18), 0, ceil + 0.01, z);
      }
    }
  }

  /** 汇总一段路由的几何并返回合并结果（失败返回 null） */
  _merge(geos) {
    if (!geos.length) return null;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    return merged || null;
  }

  /** 汇总当前「可见」各类的路由池（含 kind 标记），供过桥交叉判定共用 */
  _allRuns() {
    const L = this._layout();
    const all = [];
    for (const k of KINDS) {
      if (!this._vis[k]) continue;
      for (const spec of this._specsFor(k)) {
        for (const r of this._runsFor(k, L, spec)) { r.kind = k; all.push(r); }
        for (const r of this._customRunsFor(k, L, spec)) { r.kind = k; all.push(r); }
      }
    }
    return all;
  }

  _build(kind) {
    this._clear(kind);
    const L = this._layout();
    const g = new THREE.Group();
    g.name = `bridge-${kind}`;
    // 路由池含其它可见类：强弱电交叉时，被跨方（强电）虽不生成几何，但弱电须能
    // 在其上自动生过桥弯 —— 必须纳入全部可见类一起判定（一方显隐后整体重建保证一致）。
    const allRuns = this._allRuns();
    const specs = this._specsFor(kind);
    for (let si = 0; si < specs.length; si++) {
      const spec = specs[si];
      const runs = this._runsFor(kind, L, spec).concat(this._customRunsFor(kind, L, spec));
      if (!runs.length) continue; // 无路由则不创建材质（避免空挂载泄漏）
      // 第一人称模式下桥架不透明（去掉透明，depthWrite 恢复写入），
      // 第三人称仍按配置半透明（transparent + depthWrite:false）呈现。
      const opaque = this._fpsBridge;
      // 托盘本体：同色自发光（emissive）让桥架像「发光的 UI 元素」融入青色科技场景，
      // 消除原平涂塑料感；缎面金属（metalness 0.45 / roughness 0.42）提升质感。
      // 第三人称自发光温和（0.35），第一人称不透明态降低（0.12）避免过曝。
      const mat = new THREE.MeshStandardMaterial({
        color: spec.color,
        emissive: spec.color,
        emissiveIntensity: opaque ? 0.12 : 0.25,
        transparent: !opaque,
        opacity: opaque ? 1.0 : spec.opacity,
        depthWrite: opaque ? true : false,
        roughness: 0.42, metalness: 0.45,
      });
      // 支撑件（吊杆/锚板/立柱）中性金属灰：避免在青色场景里呈现彩色「分子图钉」，
      // 让桥架结构像真实镀锌钢支架，与发光托盘形成「骨架+发光体」的层次。
      const hmat = new THREE.MeshStandardMaterial({
        color: 0x9aa6b2,
        emissive: 0x000000,
        transparent: !opaque,
        opacity: opaque ? 1.0 : 0.85,
        depthWrite: opaque ? true : false,
        roughness: 0.5, metalness: 0.65,
      });
      let matUsed = false, hmatUsed = false;
      const groundGeos = []; // 接地跨接几何（弱电/强电专用，独立绿色材质呈现）
      const fireSealGeos = []; // 防火封堵几何（弱电/强电主干引入处，独立红棕材质）
      for (const run of runs) {
        const runTag = run.run || (run.cross ? 'cross' : 'row');
        const place = spec.place || 'over'; // over 机柜上方 / under 静电地板下方（供断言识别）
        // 过桥判定：本段在上的所有同标高交叉点 → 基座切缺口 + 上行桥翻越
        const hops = this._hopsFor(run, allRuns);
        const useGnd = (kind === 'weak' || kind === 'strong') ? groundGeos : null;
        const { base, bridge, hanger } = this._trayGeosZ(run.len, spec, hops, useGnd);
        if (base.length) {
          const geo = this._merge(base);
          if (geo) {
            const mesh = new THREE.Mesh(geo, mat);
            mesh.name = spec.label;
            mesh.userData.run = runTag;
            mesh.userData.place = place;
            mesh.userData.kind = kind;
            mesh.position.set(run.x, 0, run.z);
            if (run.cross) mesh.rotation.y = Math.PI / 2;
            mesh.renderOrder = spec.order; // 透明层按高度排序，高处盖低处
            g.add(mesh);
            matUsed = true;
          }
        }
        if (bridge.length) {
          const geo = this._merge(bridge);
          if (geo) {
            const bmesh = new THREE.Mesh(geo, mat);
            bmesh.name = `${spec.label}·过桥弯`;
            bmesh.userData.run = 'bridge';
            bmesh.userData.place = place;
            bmesh.userData.kind = kind;
            bmesh.userData.crossAts = hops.map((h) => ({ x: h.px, z: h.pz, bridgeY: h.bridgeY }));
            bmesh.position.set(run.x, 0, run.z);
            if (run.cross) bmesh.rotation.y = Math.PI / 2;
            bmesh.renderOrder = spec.order;
            g.add(bmesh);
            matUsed = true;
          }
        }
        // 支撑件（吊杆/锚板/立柱）：中性金属灰，独立材质，与本体同段位姿
        if (hanger.length) {
          const geo = this._merge(hanger);
          if (geo) {
            const hmesh = new THREE.Mesh(geo, hmat);
            hmesh.name = `${spec.label}·支撑`;
            hmesh.userData.run = 'hanger';
            hmesh.userData.place = place;
            hmesh.userData.kind = kind;
            hmesh.position.set(run.x, 0, run.z);
            if (run.cross) hmesh.rotation.y = Math.PI / 2;
            hmesh.renderOrder = spec.order;
            g.add(hmesh);
            hmatUsed = true;
          }
        }
        // 防火封堵：主干母线引入机房处（贴 -X 端墙侧电源/数据引入点）做防火封堵表现
        // （GB 50174-2017 防火章节：桥架穿越防火分区须做防火封堵，阻断烟火纵向蔓延）
        if ((kind === 'weak' || kind === 'strong') && run.run === 'spine') {
          const fz = new THREE.BoxGeometry(spec.width + 0.12, PLATE_T + RAIL_H + 0.12, 0.10);
          fz.translate(run.x, spec.y + PLATE_T + RAIL_H / 2, run.z);
          fireSealGeos.push(fz);
        }

      }
      // 接地跨接：独立绿色材质，体现 GB 50303-2015 桥架接地连续（段间跨接）
      if (groundGeos.length) {
        const geo = this._merge(groundGeos);
        if (geo) {
          const gmat = new THREE.MeshStandardMaterial({ color: 0x34d399, roughness: 0.5, metalness: 0.4 });
          const gmesh = new THREE.Mesh(geo, gmat);
          gmesh.name = '接地跨接';
          gmesh.userData.run = 'ground-bond';
          gmesh.userData.kind = kind;
          gmesh.userData.place = spec.place || 'over';
          gmesh.renderOrder = spec.order + 1;
          g.add(gmesh);
          matUsed = true;
        }
      }
      // 防火封堵：独立红棕材质，体现桥架引入穿墙防火封堵（GB 50174-2017 防火章节）
      if (fireSealGeos.length) {
        const geo = this._merge(fireSealGeos);
        if (geo) {
          const fmat = new THREE.MeshStandardMaterial({ color: 0xB22222, roughness: 0.9, metalness: 0.0 });
          const fmesh = new THREE.Mesh(geo, fmat);
          fmesh.name = '防火封堵';
          fmesh.userData.run = 'fire-seal';
          fmesh.userData.kind = kind;
          fmesh.userData.place = spec.place || 'over';
          fmesh.renderOrder = spec.order + 2;
          g.add(fmesh);
          matUsed = true;
        }
      }
      // 转角弯头：仅首层 spec 生成（多层层高不同，弯头落在主层即可避免重复几何）
      if (si === 0) {
        const elGeos = this._elbowGeosFor(kind, spec);
        if (elGeos.length) {
          const geo = this._merge(elGeos);
          if (geo) {
            const em = new THREE.Mesh(geo, mat);
            em.name = `${spec.label}·弯头`;
            em.userData.run = 'elbow';
            em.userData.kind = kind;
            em.renderOrder = spec.order;
            g.add(em);
            matUsed = true;
          }
        }
      }
      if (!matUsed) mat.dispose(); // 该类层无任何几何：释放材质，避免泄漏
      if (!hmatUsed) hmat.dispose(); // 无任何支撑几何：释放中性材质，避免泄漏
    }
    if (g.children.length) {
      this._groups[kind] = g;
      this.app.sm.scene.add(g);
    } else {
      // 空组（空机房 / 无路由）不入场景
      this._groups[kind] = null;
      g.traverse((o) => { if (o.material) o.material.dispose(); });
    }
    this._refreshCrossovers();
  }

  /** 重算并缓存过桥弯清单（当前可见类之间所有同标高交叉点） */
  _refreshCrossovers() {
    this._crossovers = [];
    const all = this._allRuns();
    for (const run of all) {
      for (const h of this._hopsFor(run, all)) {
        this._crossovers.push({
          x: h.px, z: h.pz,
          over: h.over, under: h.under,
          overRun: h.overRun, underRun: h.underRun,
          baseY: h.baseY, bridgeY: h.bridgeY, lift: h.lift,
          clamped: h.clamped,
        });
      }
    }
    return this._crossovers;
  }

  /** 输出所有过桥弯（交叉点）的位置与标高，供图纸标注与验收复核 */
  getCrossovers() { return this._crossovers.map((c) => ({ ...c })); }

  _clear(kind) {
    const g = this._groups[kind];
    if (!g) return;
    this.app.sm.scene.remove(g);
    g.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    this._groups[kind] = null;
  }

  /** 每帧回调：布局签名变化（增删/移动机柜、改房间尺寸）时防抖重建可见桥架 */
  update(dt) {
    if (!this._vis.weak && !this._vis.strong && !this._vis.aux) return;
    this._acc += dt;
    if (this._acc < 0.4) return;
    this._acc = 0;
    const s = this._sigNow();
    if (s === this._sig) return;
    this._sig = s;
    for (const k of KINDS) if (this._vis[k]) this._build(k);
  }

  dispose() { for (const k of KINDS) this._clear(k); }
}
