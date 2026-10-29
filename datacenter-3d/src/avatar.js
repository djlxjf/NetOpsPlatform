import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RACK } from './config.js'

// 值守人员 3D 模型（真实 GLB 人物，带蒙皮与三段动画）。
//  - 源资产：datacenter-3d/assets/human.glb（由 E:/软件源代码/3D人物/web_preview/base_basic_pbr_loop.glb
//    经 _build_human_glb.mjs 产出：12 组骨骼权重合并为 4 组 + 减面至 5 万面 + 保留全部动画与贴图）。
//    内置三段动画：
//      HumanIdle     —— 站立呼吸（2s 循环，首尾无缝）
//      HumanWalking  —— 原始带根位移的行走剪辑（Hips 每圈净前进 1.672m，循环会瞬移，不用于循环播放）
//      HumanWalkLoop —— 已剥离 Hips 根位移的"原地走"无缝循环剪辑（首末位移差 0.000000）★行走主力
//  - 比例校准：模型为真实米制（1.75m），与 2.0m 服务器机柜同框即真实人体比例，故默认 1:1 不缩放。
//  - 初始状态：站立（HumanIdle），落在机房内距所有机柜最远的开阔点，面向机房中心。
//  - 行走实现要点（v1.6.4）：
//      1) 播 HumanWalkLoop：其 Hips 根位移已剥离，动画首尾天然闭合 → 循环播放不产生瞬移。
//         旧版播 HumanWalking 时，Hips 每圈净前进 1.672m，wrap 时人物被甩回起点，
//         表现就是"走两步就卡顿/闪回"。这是该症状的真正根因，与帧率无关。
//      2) 位移由外部驱动（root.position），动画只负责姿态；播放 HumanWalkLoop 后
//         步频与位移的锁步关系由 setWalkTimeScale() 的 timeScale = speed / walkRef 维持。
//      3) _normalizeRootMotion() 对本资产不做任何改写：新资产的 Hips 轨道本就正确
//         （x 保留横向摆动、y 保留步态起伏、z 恒定），改写反而会破坏步态。
//  - 悬停交互：setHovered(on) 暂停/恢复动画 + 克隆壳描边高亮（共享 skeleton，动画自动同步）。
//  - 生命周期：资源不单独 dispose（场景 sm.dispose() 会遍历释放全部几何/材质/纹理），
//    本类 dispose() 仅停掉 mixer 并从场景摘除，避免与场景释放重复操作。

const SCALE = 1.0 // 人物缩放系数：源模型为真实米制（1.75m），与 2.0m 机柜 1:1 协调

export class AvatarFigure {
  constructor(scene) {
    this.scene = scene
    // 挂在一个中间 Group 上：模型内部旋转/缩放不影响对外接口的摆位与朝向
    this.root = new THREE.Group()
    this.root.name = 'avatar-human'
    scene.add(this.root)
    this.model = null
    this.mixer = null
    this.actions = {} // clip name -> AnimationAction
    this.current = null
    this.ready = false
    this._pendingPlace = null // load 完成前先缓存摆位请求
    this._outline = null   // 悬停描边壳（克隆 SkinnedMesh，共享 skeleton 自动跟随动画）
    this._hovered = false
    // 自动巡逻状态（startPatrol 启用）
    this.patrol = null
    this._lastRacks = null
    // 平滑 dt：低帧率下帧间隔波动大，直接用真实 dt 会让移动/动画呈
    // 「一卡一卡」的跳格感。对 dt 做指数移动平均（EMA）+ 上限钳制，
    // 使移动与动画都按均匀时间推进（掉帧时表现为轻微放慢而非跳格）。
    this._dtSmooth = 0.016
    // 行走动画参考速度（m/s，脚锁基准）：新模型 HumanWalkLoop 的自然步速 =
    // 单圈净前进 1.672m / 循环时长 1.0333s ≈ 1.618 m/s（见 walk_loop_params.json）。
    // 移动速度/该值 = 动画 timeScale，使腿步周期与 root 位移精准锁步（零脚滑）。
    // 若换回旧模型（无 HumanWalkLoop），可微调此值为 1.45 以适配其步幅。
    this.walkRef = 1.618
    // 巡逻移动速度（m/s）：默认 0.85（原 1.4 过快，低帧率下位移跳格明显）。
    // 由 setPatrolSpeed() 设置（工程配置面板「人员巡逻速度」联动）。
    this.patrolSpeed = 0.85
  }

  /** 设置巡逻速度（m/s）并同步行走动画步频（timeScale = speed/walkRef） */
  setPatrolSpeed(mps) {
    const v = Math.max(0.3, Math.min(2.0, Number(mps) || 0.85))
    this.patrolSpeed = v
    if (this.patrol && this.patrol.active) {
      // 必须同步巡逻状态里的 speed：旧实现只改动画 timeScale 不改位移速度，
      // 工程面板调速后出现「脚步变快/变慢但身体移动速度不变」的滑步。
      this.patrol.speed = v
      this.setWalkTimeScale(v)
    }
  }

  /** 异步加载模型；不阻塞场景主流程，失败仅告警不抛出 */
  async load(url) {
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(url)
    this.model = gltf.scene
    this.model.scale.setScalar(SCALE)
    // 阴影默认关闭（机房全局不开阴影，与机柜一致），不开 frustum 剔除外的特殊处理
    this.model.traverse((o) => { o.frustumCulled = true })
    this.root.add(this.model)

    this.mixer = new THREE.AnimationMixer(this.model)
    for (const clip of gltf.animations || []) {
      this.actions[clip.name] = this.mixer.clipAction(clip)
    }
    // 根位移归一化：抹平会导致循环瞬移的 Hips z 净漂移（保留 x 摆动与 y 起伏）
    this._normalizeRootMotion(gltf)
    this.ready = true
    // 加载完成即切站立姿态；若加载期间已被请求摆位，此刻补执行
    this.play('HumanIdle')
    if (this._pendingPlace) {
      const p = this._pendingPlace
      this._pendingPlace = null
      this.place(p.racks, p.dims)
    }
    return gltf
  }

  /** 播放指定动画并交叉淡入；缺失时静默忽略（资产未含该 clip 不算错误） */
  play(name, fade = 0.25) {
    const next = this.actions[name]
    if (!next || !this.mixer) return
    if (this.current === next) return
    const prev = this.current
    next.reset().setLoop(THREE.LoopRepeat, Infinity).play()
    if (prev) next.crossFadeFrom(prev, fade, false)
    this.current = next
  }

  /** 站立 / 行走 切换入口 */
  setWalking(on) {
    // 行走优先用 HumanWalkLoop：其 Hips 根位移已剥离，首尾闭合，循环播放不瞬移。
    // HumanWalking 带根位移（Hips 每圈 +1.672m），仅在缺少 HumanWalkLoop 时回退使用。
    if (on) {
      this.play(this.actions.HumanWalkLoop ? 'HumanWalkLoop' : 'HumanWalking')
    } else {
      this.play('HumanIdle')
    }
  }

  /**
   * 落位：站在距所有机柜最远的开阔点（通常是过道），面向机房中心。
   * 模型未就绪时缓存请求，load 完成后自动补执行。
   */
  place(racks, dims) {
    this._lastRacks = racks // 供第一人称碰撞盒生成使用
    if (!this.ready) { this._pendingPlace = { racks, dims }; return }
    const spot = findBestSpot(racks, dims)
    this.root.position.set(spot.x, 0, spot.z)
    // 面向机房中心（原点）；若视觉上背对常用视角，调这里的 +Math.PI 即可
    this.root.rotation.y = Math.atan2(-spot.x, -spot.z)
  }

  /** dt 平滑（EMA + 钳制 100ms）：消除低帧率下移动/动画的跳格感 */
  _smoothDt(dt) {
    const c = Math.min(dt, 0.1)
    this._dtSmooth += (c - this._dtSmooth) * 0.15
    return this._dtSmooth
  }

  setVisible(v) {
    if (this.model) this.model.visible = v
  }

  /** 调整行走动画播放速率，使步频与实际移动速度匹配（脚锁） */
  setWalkTimeScale(speed) {
    // 参考对象必须是"实际用于行走的剪辑"，否则 timeScale 打在被闲置的 action 上，等于没调
    const a = this.actions.HumanWalkLoop || this.actions.HumanWalking
    if (a) a.timeScale = Math.max(0.3, Math.min(3, speed / this.walkRef))
  }

  /**
   * 根位移归一化（v1.6.4 重写）：
   *
   * 背景（"走两步就卡顿/闪回"的真正根因）：
   *   行走剪辑若带 Hips 根位移（每圈净前进 1.672m），循环 wrap 时人物会被瞬移甩回起点。
   *   本资产已自带 HumanWalkLoop（Hips 根位移已剥离、首末闭合），行走不经过此处理。
   *
   * v1.6.3 之前的实现存在两处错误：
   *   1) 把 z 轴（根位移轴）误读成 y 轴，误判为"Hips 位移通道数据损坏"；
   *   2) 重建时把 x 固定为节点静态值（抹掉真实的横向髋部摆动），
   *      并用 2Hz 正弦替换真实的纵向步态起伏 —— 动画看起来僵硬，且与脚部实际落点不同步。
   *
   * 现在只做一件事：把"会导致循环瞬移"的 z 净漂移抹平，保留作者原始的 x 摆动与 y 起伏。
   * 对已剥离根位移的 HumanWalkLoop（z 恒定）而言本方法是无操作。
   */
  _normalizeRootMotion(gltf) {
    let hipsNode = null
    this.model.traverse((o) => { if (o.name === 'Hips') hipsNode = o })
    if (!hipsNode) return
    const base = hipsNode.position // GLTF node translation（静态正确值）
    let touched = 0
    for (const clip of gltf.animations || []) {
      const track = clip.tracks.find((t) => t.name === 'Hips.position')
      if (!track) continue
      const n = track.times.length
      if (n < 2) continue
      const zFirst = track.values[2]
      const zLast = track.values[(n - 1) * 3 + 2]
      // z 净漂移 ≈ 0 表示该剪辑本就原地播放（HumanWalkLoop / HumanIdle），无需处理
      if (Math.abs(zLast - zFirst) < 1e-4) continue
      // 抹平 z 的净漂移：保留圈内的 z 起伏（脚步前后摆动），只去掉"每圈净前进"
      const drift = zLast - zFirst
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1)
        track.values[i * 3 + 2] = track.values[i * 3 + 2] - drift * t
      }
      // 兜底：确保首末完全一致（严格闭合，避免浮点残差造成亚毫米级跳动）
      track.values[(n - 1) * 3 + 2] = zFirst
      touched++
    }
    if (touched) {
      console.info(`[avatar] 根位移归一化：${touched} 个剪辑已抹平 Hips z 净漂移（保留 x 摆动与 y 起伏）`)
    }
  }

  /**
   * 悬停交互：停止走动 + 描边高亮。
   *  - 悬停（鼠标滑到人物身上）时人物**停止走动**：
   *      ① 位移停止：_patrolStep 不再推进 root.position（否则人物会"定格滑行"，
   *         脚不动而身体平移，看起来像卡顿/漂移）；
   *      ② 动画暂停：mixer.timeScale=0 冻结当前姿态（不破坏 action 状态，恢复零成本）。
   *    鼠标移出后两者一并恢复，继续沿原路线行走。
   *  - 克隆壳与原 SkinnedMesh 共享 geometry 与 skeleton（骨骼动画自动同步形变），
   *    BackSide 亮青色放大 1.05 倍 → 仅轮廓外漏，形成描边；
   *  - 不影响其他模型：壳只挂本实例 root 下。
   */
  setHovered(on) {
    if (!this.ready || on === this._hovered) return
    this._hovered = on
    if (on) {
      this._savedTimeScale = this.mixer ? this.mixer.timeScale : 1
      if (this.mixer) this.mixer.timeScale = 0
      this._addOutline()
      this._setBodyGlow(0x2bd6ff, 0.35)
    } else {
      if (this.mixer) this.mixer.timeScale = this._savedTimeScale != null ? this._savedTimeScale : 1
      this._removeOutline()
      this._restoreBodyGlow()
    }
  }

  /** 悬停辉光：本体材质 emissive 提亮（与描边壳双保险，软渲染/无 bloom 环境下也清晰） */
  _setBodyGlow(hex, intensity) {
    this._savedEmissive = []
    this.model.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return
      const m = o.material
      if (!m || !m.emissive) return
      this._savedEmissive.push([m, m.emissive.getHex(), m.emissiveIntensity != null ? m.emissiveIntensity : 1])
      m.emissive.setHex(hex)
      m.emissiveIntensity = intensity
    })
  }

  _restoreBodyGlow() {
    for (const [m, hex, inten] of this._savedEmissive || []) {
      m.emissive.setHex(hex)
      m.emissiveIntensity = inten
    }
    this._savedEmissive = null
  }

  _addOutline() {
    if (this._outline || !this.model) return
    const shells = []
    this.model.traverse((o) => {
      if (!o.isSkinnedMesh) return
      const shell = new THREE.SkinnedMesh(o.geometry, new THREE.MeshBasicMaterial({
        color: 0x54e8ff, side: THREE.BackSide, transparent: true, opacity: 1, depthWrite: false,
      }))
      shell.name = 'avatar-outline-shell'
      // 共享 skeleton：骨骼动画驱动的形变与原模型完全一致（零同步成本）
      shell.bind(o.skeleton, o.bindMatrix)
      shell.scale.setScalar(1.08)
      shell.frustumCulled = false
      shells.push(shell)
    })
    if (!shells.length) return
    this._outline = new THREE.Group()
    shells.forEach((sh) => this._outline.add(sh))
    // 挂到 avatar.root（与 model 同层级）：既随 root 一起摆位/朝向，
    // 又不在 model 子树内——射线拾取 avatar.model 时不会命中描边壳。
    this.root.add(this._outline)
  }

  _removeOutline() {
    if (!this._outline) return
    this._outline.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.material.dispose()
      }
    })
    this._outline.removeFromParent()
    this._outline = null
  }

  /** 供射线拾取：人物可见且不在第一人称（隐藏）状态时才可悬停 */
  get hoverable() {
    return !!(this.ready && this.model && this.model.visible)
  }

  update(dt) {
    const s = this._smoothDt(dt)
    if (this.mixer) this.mixer.update(s)
    // 悬停时停止走动：动画已由 setHovered() 冻结（mixer.timeScale=0），
    // 此处必须同步停掉位移推进，否则人物会"定格滑行"（脚不动、身体平移）。
    if (this.patrol && this.patrol.active && !this._hovered) this._patrolStep(s)
  }

  /**
   * 自动巡逻：沿机柜区外围绕圈匀速步行（步行速度匹配 HumanWalking 步频，
   * 滑步不明显）。path 由 buildPatrolPath 生成；外部可再次调用以按当前
   * 位置重新起巡（如退出第一人称后恢复巡逻）。
   */
  startPatrol(dims) {
    if (!this.ready) return false
    const pts = buildPatrolPath(this._lastRacks, dims || { width: 40, depth: 30 })
    if (!pts.length) return false
    // 从当前位置走向「直线可达」的最近路径点（防穿柜）；全被挡则瞬移到最近点兜底
    const p = this.root.position
    const boxes = buildColliders(this._lastRacks, 0.35)
    const segOK = (x0, z0, x1, z1) => {
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.25))
      for (let s = 0; s <= steps; s++) {
        const t = s / steps
        const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t
        if (boxes.some((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ)) return false
      }
      return true
    }
    let cand = pts
      .map((q, i) => ({ i, d: Math.hypot(q.x - p.x, q.z - p.z), ok: segOK(p.x, p.z, q.x, q.z) }))
      .sort((a, b) => a.d - b.d)
    let nearest = 0
    if (cand.length && cand.some((o) => o.ok)) {
      nearest = cand.find((o) => o.ok).i
    } else if (cand.length) {
      p.x = pts[cand[0].i].x
      p.z = pts[cand[0].i].z
      nearest = cand[0].i
    }
    // speed 来自 setPatrolSpeed()（默认 0.85 m/s，工程配置可调 0.3~2.0）——
    // 原 1.4 m/s 在低帧率下每帧位移跳格感明显，放慢后配合 timeScale 步频匹配更顺滑
    this.patrol = { pts, i: nearest, speed: this.patrolSpeed, active: true }
    // 巡逻轨迹的运行时碰撞兜底：路径生成虽已逐段验证，但平滑转向的弧线切角
    // 与 1.15 倍步长超调仍可能擦到柜角；分轴回退保证任何情况下都不侵入
    // 机柜膨胀盒（与第一人称同策略：顺序分轴对 AABB 可证不穿透）。
    this._patrolBoxes = buildColliders(this._lastRacks, 0.35)
    this.setWalking(true)
    // 步频与移动节奏匹配（消除滑步）
    this.setWalkTimeScale(this.patrol.speed)
    return true
  }

  stopPatrol() {
    const was = !!(this.patrol && this.patrol.active)
    if (this.patrol) this.patrol.active = false
    if (this.ready) this.setWalking(false)
    return was
  }

  /**
   * 巡逻步进（v1.6.2 重写：修复「走两步闪退回退」；v1.6.5 增加碰撞兜底）。
   * 根因：旧实现位移直接朝目标点瞬切（move = normalize(target-pos)），
   * 蛇形路径折返时位移方向 180° 瞬切 + 朝向平滑滞后 → 视觉「甩头/退回」；
   * 低帧率下单帧 step 可能冲过目标点 → 「越过→回退」。
   * 实现：
   *  1) 先平滑转向目标方向（dt*8 快速跟随机），再沿「当前朝向」前进——
   *     转弯呈弧线，绝不瞬切、绝不倒退；
   *  2) 前进步长钳制为「不会超越目标点」的 1.15 倍距离，杜绝冲过回退；
   *  3) 到达判定 0.25m + 切点后本帧不移动，避免目标点附近抖动切点；
   *  4) v1.6.5：分轴碰撞回退兜底——路径虽已逐段验证，转向弧线切角与
   *     1.15 倍超调仍可能擦柜，任何情况下都不侵入机柜膨胀盒。
   */
  _patrolStep(dt) {
    const pa = this.patrol
    const pos = this.root.position
    const target = pa.pts[pa.i]
    const dx = target.x - pos.x, dz = target.z - pos.z
    const dist = Math.hypot(dx, dz)
    if (dist < 0.25) {
      pa.i = (pa.i + 1) % pa.pts.length
      pa.justSwitched = true // 切点当帧只转身不位移，避免抖动
      return
    }
    // 目标朝向 + 最短弧平滑转向（dt*8：约 0.4s 完成 90° 转弯）
    const targetYaw = Math.atan2(dx, dz)
    let d = (targetYaw - this.root.rotation.y) % (Math.PI * 2)
    if (d > Math.PI) d -= Math.PI * 2
    if (d < -Math.PI) d += Math.PI * 2
    this.root.rotation.y += d * Math.min(1, dt * 8)
    // 钳制：本帧位移不超过剩余距离的 1.15 倍（防冲过目标点造成回退）
    let step = pa.speed * dt
    if (pa.justSwitched) { step = 0; pa.justSwitched = false } // 切点首帧仅转身
    step = Math.min(step, dist * 1.15)
    // 沿当前朝向前进（弧线转弯，方向绝不瞬切）+ 分轴碰撞回退兜底
    const fwdX = Math.sin(this.root.rotation.y)
    const fwdZ = Math.cos(this.root.rotation.y)
    const boxes = this._patrolBoxes || []
    const hit = (x, z) => boxes.some((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ)
    const nx = pos.x + fwdX * step
    const nz = pos.z + fwdZ * step
    if (!hit(nx, pos.z)) pos.x = nx
    if (!hit(pos.x, nz)) pos.z = nz
  }

  /** 停动画并从场景摘除；几何/材质/纹理交给 SceneManager.dispose() 统一释放 */
  dispose() {
    this._restoreBodyGlow()
    this._removeOutline()
    if (this.mixer) { this.mixer.stopAllAction(); this.mixer = null }
    this.actions = {}
    this.current = null
    this.ready = false
    this.root.removeFromParent()
  }
}

// 在机房内（含边距）采样网格，返回距最近机柜最远的点——最开阔、适合站立的位置
function findBestSpot(racks, dims) {
  const list = (racks && racks.racks) || []
  const W = dims.width || 40
  const D = dims.depth || 30
  const margin = 1.0
  const x0 = -W / 2 + margin, x1 = W / 2 - margin
  const z0 = -D / 2 + margin, z1 = D / 2 - margin
  let best = { x: 0, z: 0 }
  let bestClear = -1
  const N = 14
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x = x0 + (x1 - x0) * (i / (N - 1))
      const z = z0 + (z1 - z0) * (j / (N - 1))
      let clear = Infinity
      for (const r of list) {
        const dim = RACK[r.type] || RACK.server
        // 按机柜外接半径（含对角）估算净距，避免把人放进机柜包围里
        const rad = 0.5 * Math.hypot(dim.w, dim.d)
        const c = Math.hypot(x - (r.x || 0), z - (r.z || 0)) - rad
        if (c < clear) clear = c
      }
      if (clear > bestClear) { bestClear = clear; best = { x, z } }
    }
  }
  return best
}

// 由机柜分布生成自动巡逻路径。
//
// 安全不变量（硬约束，_verify_avatar_patrol.mjs 对每一段含首尾闭合逐段断言）：
//   ① 每条横/竖通道先用 segBlocked 整条验证，被柜体侵占的通道直接剔除；
//   ② 通道之间的连接段（蛇形折返）发射前必须整段验证，两条 rail 都连不上
//      就跳过该通道——绝不发射被挡段；
//   ③ 闭环优先走「末端 rail 横穿回首通道同侧 + 沿首通道竖回起点」的已验证段；
//      无法闭环时退化为「去程 + 去程反向」的往返扫描（回程每一段都是去程
//      已验证段的反向，天然合法）。
//
// 历史教训（v1.6.5 修复「人物乱走动/穿柜」根因）：
//   旧实现的「末点→首点」闭合段从未校验——默认 26×22m 布局下它是一条横穿
//   整个机柜阵列的约 31m 对角线段，每绕完一圈人物就斜穿机房（实测 8 分钟
//   内 1864 帧位于机柜膨胀盒内）；且竖向折返「一侧被挡回退另一侧」时另一侧
//   同样不校验、横向折返则完全不校验。现在所有段一律先验证后发射。
export function buildPatrolPath(racks, dims) {
  const list = (racks && racks.racks) || []
  const W = dims.width || 40
  const D = dims.depth || 30
  const hw = W / 2 - 0.8
  const hd = D / 2 - 0.8
  const R = 0.35 // 人物半径（与碰撞留白一致）

  // 机柜膨胀 AABB
  const boxes = list.map((r) => {
    const dim = RACK[r.type] || RACK.server
    const a = r.rotationY || 0
    const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a))
    const hx = (dim.w * c + dim.d * s) / 2 + R
    const hz = (dim.w * s + dim.d * c) / 2 + R
    return { minX: (r.x || 0) - hx, maxX: (r.x || 0) + hx, minZ: (r.z || 0) - hz, maxZ: (r.z || 0) + hz }
  })
  const blocked = (x, z) => boxes.some((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ)
  // 线段遮挡采样校验（0.25m 步长）
  const segBlocked = (x0, z0, x1, z1) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.25))
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      if (blocked(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return true
    }
    return false
  }

  // 柜区外沿（四周各外扩 2.5m，钳制在房间内）：折返走外沿恒安全
  const xsArr = list.map((r) => r.x || 0)
  const zsArr = list.map((r) => r.z || 0)
  const outerL = Math.max(-hw, (xsArr.length ? Math.min(...xsArr) : 0) - 2.5)
  const outerR = Math.min(hw, (xsArr.length ? Math.max(...xsArr) : 0) + 2.5)
  const outerT = Math.max(-hd, (zsArr.length ? Math.min(...zsArr) : 0) - 2.5)
  const outerB = Math.min(hd, (zsArr.length ? Math.max(...zsArr) : 0) + 2.5)

  const xsU = [...new Set(xsArr.map((v) => +v.toFixed(2)))].sort((a, b) => a - b)
  const zsU = [...new Set(zsArr.map((v) => +v.toFixed(2)))].sort((a, b) => a - b)

  // —— 横向通道（沿 X 走，通道为固定 z）：外围上/下 + 相邻 z 簇间隙 ≥1.4m 的中点 ——
  const hLanes = []
  if (zsU.length) {
    hLanes.push(outerT, outerB)
    for (let i = 0; i < zsU.length - 1; i++) {
      if (zsU[i + 1] - zsU[i] > 1.4) hLanes.push((zsU[i] + zsU[i + 1]) / 2)
    }
  } else hLanes.push(outerT, outerB)
  const hOK = [...new Set(hLanes.map((z) => +z.toFixed(2)))]
    .filter((z) => Math.abs(z) <= hd + 0.01 && !segBlocked(outerL, z, outerR, z))
    .sort((a, b) => a - b)

  // —— 竖向通道（沿 Z 走，通道为固定 x）：外围左/右 + 相邻 x 簇间隙 ≥1.4m 的中点 ——
  const vLanes = []
  if (xsU.length) {
    vLanes.push(outerL, outerR)
    for (let i = 0; i < xsU.length - 1; i++) {
      if (xsU[i + 1] - xsU[i] > 1.4) vLanes.push((xsU[i] + xsU[i + 1]) / 2)
    }
  } else vLanes.push(outerL, outerR)
  const vOK = [...new Set(vLanes.map((x) => +x.toFixed(2)))]
    .filter((x) => Math.abs(x) <= hw + 0.01 && !segBlocked(x, outerT, x, outerB))
    .sort((a, b) => a - b)

  // 择优：纵横两个方向都构建「去程」（逐段验证、双 rail 回退），
  // 取路径更长（覆盖通道更多）的一方；平局取横向。
  const buildVertical = () => {
    const pts = []
    if (vOK.length < 2) return pts
    pts.push({ x: vOK[0], z: outerT }, { x: vOK[0], z: outerB })
    let last = 0        // 最后成功接入的通道下标
    let atBottom = true // 当前通道末端在 outerB
    for (let i = 1; i < vOK.length; i++) {
      const rail = atBottom ? outerB : outerT // 首选 rail：当前通道末端所在
      const alt = atBottom ? outerT : outerB  // 备选 rail：另一侧
      if (!segBlocked(vOK[last], rail, vOK[i], rail)) {
        pts.push({ x: vOK[i], z: rail }, { x: vOK[i], z: alt })
        last = i
        atBottom = !atBottom
      } else if (!segBlocked(vOK[last], rail, vOK[last], alt) && !segBlocked(vOK[last], alt, vOK[i], alt)) {
        // 首选 rail 被挡：先沿当前通道退回另一侧（该通道整条已验证），
        // 再经备选 rail 横连到目标通道
        pts.push({ x: vOK[last], z: alt }, { x: vOK[i], z: alt }, { x: vOK[i], z: rail })
        last = i
        atBottom = (alt === outerT)
      }
      // 两条 rail 都连不上：跳过该通道，绝不发射被挡段
    }
    return pts.length >= 4 ? pts : []
  }
  const buildHorizontal = () => {
    const pts = []
    if (hOK.length < 2) return pts
    pts.push({ x: outerL, z: hOK[0] }, { x: outerR, z: hOK[0] })
    let last = 0
    let atRight = true
    for (let i = 1; i < hOK.length; i++) {
      const rail = atRight ? outerR : outerL
      const alt = atRight ? outerL : outerR
      if (!segBlocked(rail, hOK[last], rail, hOK[i])) {
        pts.push({ x: rail, z: hOK[i] }, { x: alt, z: hOK[i] })
        last = i
        atRight = !atRight
      } else if (!segBlocked(rail, hOK[last], alt, hOK[last]) && !segBlocked(alt, hOK[last], alt, hOK[i])) {
        pts.push({ x: alt, z: hOK[last] }, { x: alt, z: hOK[i] }, { x: rail, z: hOK[i] })
        last = i
        atRight = (alt === outerL)
      }
    }
    return pts.length >= 4 ? pts : []
  }
  const vPath = buildVertical()
  const hPath = buildHorizontal()
  const useV = vPath.length > hPath.length
  const oneWay = useV ? vPath : hPath
  if (oneWay.length < 4) return [] // 两个方向都连不出两条完整通道：站立待命，也绝不穿柜

  const first = oneWay[0]
  const tail = oneWay[oneWay.length - 1]
  // 闭环优先：末端 rail 横穿回首通道同侧 rail，再沿首通道竖回起点（两段都验证）。
  // 竖向闭环时 rail∈{outerT,outerB}；横向闭环时 rail∈{outerL,outerR}。
  if (useV) {
    const rail = tail.z
    if ((Math.abs(rail - outerT) < 1e-6 || Math.abs(rail - outerB) < 1e-6)
      && !segBlocked(tail.x, rail, first.x, rail)
      && !segBlocked(first.x, rail, first.x, first.z)) {
      return oneWay.concat([{ x: first.x, z: rail }])
    }
  } else {
    const rail = tail.x
    if ((Math.abs(rail - outerL) < 1e-6 || Math.abs(rail - outerR) < 1e-6)
      && !segBlocked(rail, tail.z, rail, first.z)
      && !segBlocked(rail, first.z, first.x, first.z)) {
      return oneWay.concat([{ x: rail, z: first.z }])
    }
  }
  // 闭环不可行（末端 rail 被柜体/墙体侵占）：去程 + 去程反向的往返扫描。
  // 回程的每一段都是去程已验证段的反向，因此天然无遮挡；末点与首点重合，
  // 形成零长闭合段，绕完一圈自动从头开始。
  return oneWay.concat(oneWay.slice(0, -1).reverse().slice(0, -1))
}

// 由机柜分布生成碰撞盒（轴对齐外接矩形 + 玩家半径留白），用于第一人称行走防穿模
// 导出供运行时测试直接断言（不改变调用方行为）。
export function buildColliders(racks, radius) {
  const list = (racks && racks.racks) || []
  return list.map((r) => {
    const dim = RACK[r.type] || RACK.server
    const a = r.rotationY || 0
    const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a))
    const hx = (dim.w * c + dim.d * s) / 2 + radius
    const hz = (dim.w * s + dim.d * c) / 2 + radius
    return { minX: (r.x || 0) - hx, maxX: (r.x || 0) + hx, minZ: (r.z || 0) - hz, maxZ: (r.z || 0) + hz }
  })
}

/**
 * 人物第一人称控制器：
 *  - 进入：相机平滑飞至人物眼位（AvatarFigure 提供眼位/朝向），接管视角
 *  - 环视：在画布上按住拖拽即转头（与全局"拖拽旋转"交互一致，不锁指针）
 *  - 移动：键盘 W/S/A/D 或方向键，以及界面按钮（按住持续移动）前进/后退/左右
 *  - 动画联动：有位移输入时人物播 HumanWalking，停止时回 HumanIdle；
 *    人物 root 实时跟随相机落点并转向视线方向，退出后保持在最后位置
 *  - 退出：ESC 或界面按钮，相机平滑飞回进入前视角并恢复 OrbitControls
 */
export class AvatarFPS {
  constructor(sm, avatar, getDims, queryRoot) {
    this.sm = sm
    this.avatar = avatar
    this.getDims = getDims || (() => ({ width: 40, depth: 30 }))
    // 控件条查询根：Vue 集成时是 shadowRoot（宿主 querySelector 不进 shadow DOM），
    // 独立运行时退化为 sm.container
    this.qr = queryRoot || sm.container
    this.active = false
    this.follow = false    // 第一人称跟随模式：相机刚性吸附人物眼位+朝向（点击人物进入）
    this._bobT = 0         // 行走头部起伏相位累加器
    this.eye = 1.7          // 第一人称眼高（m）：人物身高 1.91m 的自然眼位
    this.speed = 2.0        // 第一人称步行速度（m/s）：原 3.0 偏快，放慢更稳
    this.playerRadius = 0.35
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ')
    this.keys = new Set()
    this.btn = { fwd: false, back: false, left: false, right: false }
    this.boxes = []
    this.savedPos = null
    this.savedTarget = null
    this._drag = null
    this._el = {} // 控件条元素引用
    this.baseFov = 70;     // 第一人称基准视场角（°）：比总览 55° 略宽，纵深感更强
    this._fov = this.baseFov;
    this._fovTarget = this.baseFov;
    this.minFov = 35;      // 滚轮拉近（视野变窄）下限
    this.maxFov = 92;      // 滚轮推远（视野变宽）上限
    this._origFov = null;  // 进入前视场角，退出时还原
    // ——— 鼠标视角控制（俯仰/偏航）———
    // lookYaw / lookPitch 为视角偏移量：自由漫游时即绝对朝向；跟随时作为「相对人物朝向」的
    // 偏移，使鼠标可在角色走动时自由环视，而不改变相机对人物位置/朝向的刚性跟随。
    this.lookYaw = 0;                 // 偏航（左右）累积量（弧度）
    this.lookPitch = 0;               // 俯仰（上下）累积量（弧度，已限幅）
    this.lookSensitivity = 0.0032;    // 鼠标灵敏度（弧度/像素）：fps-bar 滑杆可调
    this._lookPitchLimit = Math.PI / 2 - 0.02; // 俯仰限幅 ±88.85°，避免翻转
    this._locked = false;             // 指针锁定态（自由环视）
    this._onKeyDown = (e) => {
      if (e.code === 'Escape') { this.exit(); return }
      this.keys.add(e.code)
    }
    this._onKeyUp = (e) => this.keys.delete(e.code)
    this._onPointerDown = (e) => { if (!this._locked) this._drag = { x: e.clientX, y: e.clientY } }
    this._onPointerMove = (e) => {
      if (this._locked || !this._drag) return
      const dx = e.clientX - this._drag.x, dy = e.clientY - this._drag.y
      this._drag = { x: e.clientX, y: e.clientY }
      // 拖拽环视：与全局 OrbitControls 方向一致（拖右→向左转），统一走灵敏度+俯仰限幅
      this._applyLookDelta(dx, dy)
    }
    this._onPointerUp = () => { this._drag = null }
    // 指针锁定时的自由环视：直接读 movementX/Y（不占用鼠标键，可与 WASD 并行）
    this._onMouseMove = (e) => {
      if (!this.active || !this._locked) return
      this._applyLookDelta(e.movementX || 0, e.movementY || 0)
    }
    this._onLockChange = () => {
      const c = this._canvas()
      this._locked = !!(document.pointerLockElement && document.pointerLockElement === c)
      const hint = this.qr ? this.qr.querySelector('#fps-lock-hint') : null
      if (hint) hint.textContent = this._locked ? '鼠标已锁定 · 移动鼠标环视 · Esc 退出' : ''
    }
    this._onWheel = (e) => {
      if (!this.active) return
      e.preventDefault(); // 阻止页面滚动
      const unit = (e.deltaMode === 1) ? 4 : 1 // 行模式 delta 放大
      const dir = e.deltaY < 0 ? -1 : 1 // 上滚=拉近（视野变窄）
      this._fovTarget = Math.max(this.minFov, Math.min(this.maxFov, this._fovTarget + dir * 3 * unit))
    }
    // 画布点击：尝试指针锁定（锁定后鼠标自由环视、不占用鼠标键，可与 WASD 并行）；
    // 已锁定或不可用时静默失败（保留拖拽环视），故点击锁定的动作放在 _tryLock 内部
    this._onCanvasClick = () => { if (!this._locked) this._tryLock() }
  }

  _canvas() { return this.sm.renderer.domElement }

  /** 应用一次鼠标视角增量（统一入口：拖拽环视与指针锁定共用），含灵敏度与俯仰限幅 */
  _applyLookDelta(dx, dy) {
    const s = this.lookSensitivity
    this.lookYaw += dx * s
    this.lookPitch -= dy * s
    const lim = this._lookPitchLimit
    if (this.lookPitch > lim) this.lookPitch = lim
    else if (this.lookPitch < -lim) this.lookPitch = -lim
  }

  /** 设置鼠标灵敏度（弧度/像素）。供 fps-bar 滑杆或外部调用 */
  setLookSensitivity(v) {
    const n = Number(v)
    if (Number.isFinite(n)) this.lookSensitivity = Math.max(0.0005, Math.min(0.02, n))
    return this.lookSensitivity
  }

  /** 尝试指针锁定（自由环视）；不可用/被拒时静默退化为拖拽环视 */
  _tryLock() {
    try {
      const c = this._canvas()
      if (!c || !c.requestPointerLock || this._locked) return
      const r = c.requestPointerLock()
      if (r && typeof r.catch === 'function') r.catch(() => {})
    } catch (e) { /* 指针锁定不可用：保留拖拽环视 */ }
  }

  /** 平滑视场角（滚轮缩放）：指数缓动到目标值，拉近/推远无突兀跳变 */
  _applyFov(dt) {
    if (Math.abs(this._fov - this._fovTarget) > 0.05) {
      this._fov += (this._fovTarget - this._fov) * Math.min(1, dt * 8)
      this.sm.camera.fov = this._fov
      this.sm.camera.updateProjectionMatrix()
    }
  }

  /**
   * 应用视角（自由漫游）：把累积的 lookYaw/lookPitch 写入 YXZ 欧拉角并赋给相机。
   * 参数顺序 set(俯仰X, 偏航Y, 0, 'YXZ') —— 俯仰对应绕 X 轴（抬头/低头），
   * 偏航对应绕 Y 轴（左右），Z=0 即无翻滚（roll）。
   * YXZ 顺序 = 先偏航后俯仰，旋转时场景不发生任何倾斜/形变；俯仰已在
   * _applyLookDelta 内限幅 ±(_lookPitchLimit)，不会翻转。
   * 注意：必须每帧把 lookYaw/lookPitch 同步进 euler，否则鼠标环视增量无处落地。
   */
  updateCamera(dt) {
    const cam = this.sm.camera
    this.euler.set(this.lookPitch, this.lookYaw, 0, 'YXZ')
    cam.quaternion.setFromEuler(this.euler)
    this._applyFov(dt)
  }

  /** 由 main.js 在 tween 到眼位完成后调用：真正接管输入 */
  activate() {
    if (this.active) return
    this.active = true
    this.follow = false
    this.keys.clear()
    // 切入第一人称基准视场角，并记住进入前的视场角以便退出还原
    this._origFov = this.sm.camera.fov
    this._fov = this._fovTarget = this.baseFov
    this.sm.camera.fov = this.baseFov
    this.sm.camera.updateProjectionMatrix()
    // 视角初始化为人物当前朝向（模型正面朝局部 +Z，相机 yaw = 人物 yaw + π）
    this.lookYaw = (this.avatar ? this.avatar.root.rotation.y : 0) + Math.PI
    this.lookPitch = 0
    this.euler.set(0, this.lookYaw, 0, 'YXZ')
    this.euler.x = 0
    this.boxes = buildColliders(this.avatar?._lastRacks, this.playerRadius)
    // 第一人称下隐藏人物模型：相机位于头模内部，不隐藏会看到整个头部网格
    // 遮挡视野（FPS 游戏通用做法）；退出第一人称时恢复显形
    if (this.avatar && this.avatar.model) this.avatar.model.visible = false
    // 第一人称步行速度 3.0 m/s → 行走动画按比例加速，步频与位移匹配
    if (this.avatar) this.avatar.setWalkTimeScale(this.speed)
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
    const c = this._canvas()
    c.addEventListener('pointerdown', this._onPointerDown)
    window.addEventListener('pointermove', this._onPointerMove)
    window.addEventListener('pointerup', this._onPointerUp)
    window.addEventListener('mousemove', this._onMouseMove)       // 指针锁定自由环视
    document.addEventListener('pointerlockchange', this._onLockChange)
    c.addEventListener('click', this._onCanvasClick)              // 点击锁定鼠标
    c.addEventListener('wheel', this._onWheel, { passive: false })
    this._bindButtons()
  }

  /** 由 main.js 在「点击人物」后立即调用：进入第一人称跟随模式（无过渡停顿）。
   *  与 activate()（自由漫游）不同：相机不接收键盘/拖拽位移，而是每帧刚性吸附
   *  到人物的眼位与前进朝向，人物持续巡逻行走，相机随之同步移动。 */
  activateFollow() {
    if (this.active) return
    this.active = true
    this.follow = true
    this.keys.clear()
    // 切入第一人称基准视场角，并记住进入前的视场角以便退出还原
    this._origFov = this.sm.camera.fov
    this._fov = this._fovTarget = this.baseFov
    this.sm.camera.fov = this.baseFov
    this.sm.camera.updateProjectionMatrix()
    // 跟随模式：lookYaw/lookPitch 作为「相对人物前进朝向」的偏移（初始 0 = 正对前进方向）。
    // 鼠标环视时叠加在刚性跟随之上，使角色走动时仍可自由查看，且不影响相机对人物的位置跟随。
    this.lookYaw = 0
    this.lookPitch = 0
    this.euler.set(0, 0, 0, 'YXZ')
    this.boxes = buildColliders(this.avatar?._lastRacks, this.playerRadius)
    // 第一人称下隐藏人物模型：相机位于头模内部，不隐藏会看到整个头部网格遮挡视野
    if (this.avatar && this.avatar.model) this.avatar.model.visible = false
    // 行走动画 timeScale 由巡逻自身按 patrol.speed 维持（与位移锁步、脚不滑），此处不覆盖
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
    const c = this._canvas()
    c.addEventListener('pointerdown', this._onPointerDown)
    window.addEventListener('pointermove', this._onPointerMove)
    window.addEventListener('pointerup', this._onPointerUp)
    window.addEventListener('mousemove', this._onMouseMove)       // 指针锁定自由环视
    document.addEventListener('pointerlockchange', this._onLockChange)
    c.addEventListener('click', this._onCanvasClick)              // 点击锁定鼠标
    c.addEventListener('wheel', this._onWheel, { passive: false })
    this._bindButtons()
    // 立即吸附一次，避免首帧闪现旧（第三人称）视角
    this._followCamera()
  }

  /** 跟随模式：把相机刚性吸附到人物眼位（root.x/z + 眼高）并朝向其前进方向，
   *  再叠加 lookYaw/lookPitch 鼠标环视偏移（位置仍刚性跟随，仅朝向可自由偏移环视） */
  _followCamera() {
    const cam = this.sm.camera
    const a = this.avatar
    if (!a || !a.ready) return
    // 人物模型正面朝局部 +Z；相机默认朝 -Z，故 yaw = 人物 yaw + π 时相机视线=人物前进方向。
    // 跟随模式下 lookYaw 是相对该朝向的偏移量（鼠标左右环视），lookPitch 是俯仰偏移。
    this.euler.y = a.root.rotation.y + Math.PI + this.lookYaw
    this.euler.x = this.lookPitch
    cam.position.set(a.root.position.x, this.eye, a.root.position.z)
    cam.quaternion.setFromEuler(this.euler)
  }

  /** 界面控件（tool-shell 的 #fps-bar）：按住持续移动 */
  _bindButtons() {
    const rootEl = this.qr
    const bind = (id, key) => {
      const el = rootEl.querySelector('#' + id)
      if (!el) return
      this._el[id] = el
      const down = (e) => { e.preventDefault(); this.btn[key] = true }
      const up = () => { this.btn[key] = false }
      el.addEventListener('pointerdown', down)
      el.addEventListener('pointerup', up)
      el.addEventListener('pointerleave', up)
      this._el[id + '_unbind'] = () => {
        el.removeEventListener('pointerdown', down)
        el.removeEventListener('pointerup', up)
        el.removeEventListener('pointerleave', up)
      }
    }
    bind('fps-fwd', 'fwd')
    bind('fps-back', 'back')
    bind('fps-left', 'left')
    bind('fps-right', 'right')
    // 鼠标灵敏度滑杆：滑杆值（0.5~20，默认 3.2）按 1/1000 换算为弧度/像素，
    // 经 setLookSensitivity 钳制到 [0.0005, 0.02] 后写入 lookSensitivity。
    const look = rootEl.querySelector('#fps-look')
    if (look) {
      this._el['fps-look'] = look
      const onLook = () => {
        const v = Number(look.value) / 1000
        this.setLookSensitivity(v)
        const out = rootEl.querySelector('#fps-look-val')
        if (out) out.textContent = Number(look.value).toFixed(1)
      }
      look.addEventListener('input', onLook)
      this._el['fps-look_unbind'] = () => look.removeEventListener('input', onLook)
      onLook() // 初始化一次，使 lookSensitivity 与滑杆初始值（3.2→0.0032）一致
    }
    const exit = rootEl.querySelector('#fps-exit')
    if (exit) {
      this._el['fps-exit'] = exit
      const onExit = () => this.exit()
      exit.addEventListener('click', onExit)
      this._el['fps-exit_unbind'] = () => exit.removeEventListener('click', onExit)
    }
    const bar = rootEl.querySelector('#fps-bar')
    if (bar) bar.classList.remove('hidden')
  }

  _collides(x, z) {
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i]
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true
    }
    return false
  }

  update(dt) {
    if (!this.active) return
    const cam = this.sm.camera
    // 第一人称跟随模式：相机刚性吸附人物眼位与朝向，人物持续巡逻行走，
    // 相机随其位置/朝向同步移动（无用户位移输入、无自由环视），呈现连贯行走画面
    if (this.follow) {
      this._followCamera()
      // 轻微头部起伏增强行走临场感（仅视觉，不参与碰撞/位移）
      this._bobT += dt
      cam.position.y = this.eye + Math.sin(this._bobT * 9.0) * 0.03
      // 平滑视场角（滚轮缩放仍可微调视野）：指数缓动到目标值，拉近/推远无突兀跳变
      this._applyFov(dt)
      return
    }
    // 应用环视（YXZ 欧拉角：先偏航后俯仰，无翻滚 → 旋转时场景不发生任何形变/倾斜）。
    // updateCamera() 每帧把 lookYaw/lookPitch 同步进 euler 并赋给相机：鼠标俯仰/偏航增量在此落地。
    this.updateCamera(dt)
    // 水平前向 / 右向（由视线 euler 推导）
    const fwd = new THREE.Vector3(-Math.sin(this.euler.y), 0, -Math.cos(this.euler.y))
    const right = new THREE.Vector3(Math.cos(this.euler.y), 0, -Math.sin(this.euler.y))
    const k = this.keys
    let mvF = (k.has('KeyW') || k.has('ArrowUp') || this.btn.fwd) ? 1 : 0
    let mvB = (k.has('KeyS') || k.has('ArrowDown') || this.btn.back) ? 1 : 0
    let mvL = (k.has('KeyA') || k.has('ArrowLeft') || this.btn.left) ? 1 : 0
    let mvR = (k.has('KeyD') || k.has('ArrowRight') || this.btn.right) ? 1 : 0
    const move = new THREE.Vector3()
    if (mvF) move.add(fwd)
    if (mvB) move.sub(fwd)
    if (mvR) move.add(right)
    if (mvL) move.sub(right)
    const p = cam.position
    if (move.lengthSq() > 0) {
      // dt 钳制 50ms：超低帧率（<20fps）下不放大步长，防大步长跃过窄柜缝
      // （柜体膨胀盒最短边约 1.3m，2.0m/s×50ms=0.1m，任何现实帧率都不会隧穿）
      move.normalize().multiplyScalar(this.speed * Math.min(dt, 0.05))
      // 分轴推进 + 碰撞回退：贴柜滑动而非卡死
      if (!this._collides(p.x + move.x, p.z)) p.x += move.x
      if (!this._collides(p.x, p.z + move.z)) p.z += move.z
    }
    // 边界钳制 + 眼高锁定
    const d = this.getDims() || { width: 40, depth: 30 }
    const hw = d.width / 2 - this.playerRadius
    const hd = d.depth / 2 - this.playerRadius
    p.x = Math.max(-hw, Math.min(hw, p.x))
    p.z = Math.max(-hd, Math.min(hd, p.z))
    p.y = this.eye
    // 人物跟随相机落点并转向视线方向；走/停动画联动
    if (this.avatar && this.avatar.ready) {
      this.avatar.root.position.x = p.x
      this.avatar.root.position.z = p.z
      this.avatar.root.rotation.y = this.euler.y + Math.PI
      this.avatar.setWalking(move.lengthSq() > 0)
    }
  }

  /** 退出第一人称：解绑输入、隐藏控件条；相机飞回由 main.js 负责 */
  deactivate() {
    if (!this.active) return
    this.active = false
    this.follow = false
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    const c = this._canvas()
    c.removeEventListener('pointerdown', this._onPointerDown)
    c.removeEventListener('wheel', this._onWheel)
    c.removeEventListener('click', this._onCanvasClick)
    window.removeEventListener('pointermove', this._onPointerMove)
    window.removeEventListener('pointerup', this._onPointerUp)
    window.removeEventListener('mousemove', this._onMouseMove)
    document.removeEventListener('pointerlockchange', this._onLockChange)
    // 安全退出指针锁定（如仍锁定）：异常被吞，避免影响后续退出流程
    try { if (document.pointerLockElement === c) document.exitPointerLock() } catch (e) { /* noop */ }
    this._locked = false
    // 还原总览视场角（第一人称缩放不污染全局相机状态）
    if (this._origFov != null) {
      this.sm.camera.fov = this._origFov
      this.sm.camera.updateProjectionMatrix()
      this._origFov = null
    }
    Object.keys(this._el).forEach((k) => {
      if (k.endsWith('_unbind')) this._el[k]()
    })
    this._el = {}
    const bar = this.qr.querySelector('#fps-bar')
    if (bar) bar.classList.add('hidden')
    this.keys.clear()
    this.btn = { fwd: false, back: false, left: false, right: false }
    if (this.avatar && this.avatar.ready) this.avatar.setWalking(false)
    // 退出第一人称：人物重新显形（相机飞回第三人称后可看到人物站在最后位置）
    if (this.avatar && this.avatar.model) this.avatar.model.visible = true
  }

  exit() {
    if (typeof this._onExit === 'function') this._onExit()
  }
}
