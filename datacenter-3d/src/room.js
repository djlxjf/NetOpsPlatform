import * as THREE from 'three';
import {
  loadFloorConfig, sanitizeFloorConfig, surfaceColor,
} from './floorConfig.js';
import { maxAnisotropy } from './texQuality.js';

// 构建机房（全部尺寸由 roomDims 驱动，可实时重建）：
// 架空防静电地板 / 支撑立柱 / 顶部管线 + 依据墙面布局生成带门窗洞口的墙体
// 返回 { rebuild(layout, dims), wallMeshes, setFloorConfig(cfg) } 供平面拖拽、
// 3D 实时预览与「静电地板铺设」面板参数驱动重建
export function buildRoom(scene, wallLayout, roomDims) {
  const group = new THREE.Group();
  group.name = 'room';

  // 共享材质（重建时只重建几何体，材质复用）
  // 地面：替换为「架空防静电地板」精细模型（默认 600×600 防静电砖，砖缝 8mm，自带贴图）。
  // 顶面保持 y=0 不变，确保机柜/设备等既有锚点不动；砖体向 -Y 延伸，
  // 砖缝透过下方裙边形成深色凹槽，呈现机房架空地板观感（不实际抬升地面以免设备下沉）。
  // 浅灰防静电贴面替代原近黑地板，整体抬亮、消除暗光「黑洞」。
  // 几何参数（砖长/宽/厚/缝/离地高度/贴面）由 floorConfig.js 驱动，
  // 「静电地板铺设」面板调整后经 setFloorConfig 实时重建。
  let _floorCfg = loadFloorConfig(); // 生效中的地板配置（预览态由 floorPanel 写入）
  let _floorSurface = _floorCfg.surface; // 已上图的贴面 key（变更才重画 CanvasTexture）
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.62, metalness: 0.14,
    map: makeAntiStaticFloorTexture(surfaceColor(_floorCfg.surface)), envMapIntensity: 0.7,
  });
  // 支撑立柱（架空层内，深色钢质）
  const pedestalMat = new THREE.MeshStandardMaterial({
    color: 0x3a4450, roughness: 0.45, metalness: 0.65,
  });
  // 地板外裙边：比机房地板略暗一档、与雾色(0x16202e)同族。地板只有房间大小，
  // 总览相机下画面下缘落在地板之外会露出背景色（近纯黑「黑条」），
  // 裙边把可视地面大幅外延，空区被顶出取景范围。
  const apronMat = new THREE.MeshStandardMaterial({
    color: 0x131d29, roughness: 0.95, metalness: 0.05,
    emissive: 0x0a121c, emissiveIntensity: 0.45,
  });
  // 架空地板围边（房间周长一圈，遮住砖体侧沿与空腔，呈现「地板架起来」的观感）
  const skirtMat = new THREE.MeshStandardMaterial({
    color: 0x1b2430, roughness: 0.55, metalness: 0.55,
  });
  const pipeMat = new THREE.MeshStandardMaterial({
    color: 0x2f4759, roughness: 0.45, metalness: 0.6, emissive: 0x1a4a5e, emissiveIntensity: 0.55,
  });
  // 墙体：半透明，且不写深度缓冲（depthWrite:false）——透明墙体若写入深度，
  // 会在深度缓冲中遮挡其后的机柜，导致「墙面挡住机柜」；关闭后机柜正常渲染、
  // 再叠加上墙体的半透明着色，机柜即可透过墙体清晰可见（用户要求「透一点」）。
  // opacity 调低至 0.30，配合发光描边仍勾勒墙体轮廓。
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x223143, transparent: true, opacity: 0.30, side: THREE.DoubleSide,
    roughness: 1, depthWrite: false,
  });
  const trimMat = new THREE.LineBasicMaterial({ color: 0x2bd6ff, transparent: true, opacity: 0.7 });
  // 地面导光条：与顶灯呼应的低位光带，路径引导
  const floorGuideMat = new THREE.MeshBasicMaterial({
    color: 0x2bd6ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false,
  });

  // 第一人称天花板材质（仅进第一人称时显示，避免遮挡第三人称总览俯视）。
  // 默认近黑顶板，参照 E:/软件源代码/3D机房/output/低压配电柜3D模型.html 的
  // MAT.ceil（= 0x23272b，roughness 0.92，metalness 0.06）；龙骨线/灯盘外壳用
  // MAT.wallTrim 同族灰；灯盘灯罩用 MAT.lightEmis（暖白自发光 0xfff2dc，强度 1.35）。
  const ceilMat = new THREE.MeshStandardMaterial({
    color: 0x23272b, roughness: 0.92, metalness: 0.06, side: THREE.DoubleSide,
  });
  const ceilKeelMat = new THREE.MeshStandardMaterial({
    color: 0x4c5257, roughness: 0.72, metalness: 0.24,
  });
  const lightHousingMat = new THREE.MeshStandardMaterial({
    color: 0x2a2d31, roughness: 0.40, metalness: 0.20,
  });
  const lightEmisMat = new THREE.MeshStandardMaterial({
    color: 0x2a2d31, roughness: 0.40, metalness: 0.20,
    emissive: 0xfff2dc, emissiveIntensity: 1.35,
  });
  const lightSteelMat = new THREE.MeshStandardMaterial({
    color: 0xc4cad0, roughness: 0.26, metalness: 0.95,
  });

  const dyn = new THREE.Group(); // 随尺寸重建的部分
  group.add(dyn);
  const wallMeshes = []; // 墙体实体网格（供点击拾取选择墙面）
  // 上次 rebuild 的入参（setFloorConfig 改地板参数时按原布局/尺寸重放一次）
  let _lastLayout = wallLayout;
  let _lastDims = roomDims;

  // 第一人称白墙材质：参考 E:/软件源代码/3D机房/output/低压配电柜3D模型.html 的
  // MAT.wall（= MeshStandardMaterial({ color: 0x838a91, roughness: 0.88, metalness: 0.05 })）
  // 的观感——高粗糙哑光、极低金属度；仅把颜色改成白色，用于第一人称室内视角。
  // 第三人称墙仍保持原本的半透明蓝灰（wallMat）；白墙不透明、depthWrite 默认开启，
  // 室内观感干净、正确遮挡，与第一人称「身处机房内部」的视角一致。
  // 第一人称墙面：浅灰白哑光底 + 自发光竖向渐变（见下方 onBeforeCompile）。
  // 顶光渐变改用「材质级自发光渐变」驱动，与场景灯光解耦——实测单纯靠平填光/点光源
  // 会把墙整体抬到 ~234 饱和（点光源衰减被淹没），或压到死黑（底部 < 60）；
  // 自发光渐变保证墙面无论灯光强弱都稳定呈现「顶部≈190、底部≈135、顶亮底暗」的
  // 天花板向下照射观感，且顶不过曝纯白（< 245）、底不死黑（> 60）。
  // IBL 仅留极小反射（envMapIntensity 0.05），避免均匀提亮抹平渐变。
  const wallMatFPS = new THREE.MeshStandardMaterial({
    color: 0xb8bdc4, roughness: 0.82, metalness: 0.04, side: THREE.DoubleSide,
    emissive: 0x9aa0a8, emissiveIntensity: 1.0,
    envMapIntensity: 0.05,
  });
  // 第一人称墙面竖向渐变：顶部更亮、底部更暗，模拟天花板灯具向下照射的自然衰减。
  // 用 onBeforeCompile 在片元着色器按局部 Y（墙高方向，mesh 无 Y 偏移故即世界高度）
  // 对自发光辐射度（totalEmissiveRadiance）做乘法——自发光与灯光叠加后不依赖灯光
  // 强度，顶亮底暗稳定可辨、杜绝过曝纯白。底部系数 0.45 即底部自发光降到 45%。
  let _wallH = 8;
  let _wallGradU = null;
  wallMatFPS.onBeforeCompile = (shader) => {
    shader.uniforms.uWallH = { value: _wallH };
    shader.uniforms.uGradTop = { value: 1.0 };
    shader.uniforms.uGradBot = { value: 0.45 };
    _wallGradU = shader.uniforms;
    shader.vertexShader = 'varying float vWallY;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vWallY = position.y;'
    );
    shader.fragmentShader = 'varying float vWallY;\nuniform float uWallH;\nuniform float uGradTop;\nuniform float uGradBot;\n'
      + shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  { float _t = clamp(vWallY / max(uWallH, 0.001), 0.0, 1.0); totalEmissiveRadiance *= mix(uGradBot, uGradTop, _t); }'
      );
  };
  // 墙体外观皮肤：'default' = 第三人称半透明蓝灰（wallMat）；'fps' = 第一人称白色哑光（wallMatFPS）
  let _wallSkin = 'default';
  const _wallMatForSkin = () => (_wallSkin === 'fps' ? wallMatFPS : wallMat);
  // 切换墙体外观：进入第一人称时调 setWallSkin('fps') 使墙面变白，退出时调
  // setWallSkin('default') 还原；buildWallMesh 取材质时也走 _wallMatForSkin()，
  // 保证重建后的墙体沿用当前皮肤（规划态调尺寸不丢失第一人称设定）。
  function setWallSkin(skin) {
    if (skin !== 'default' && skin !== 'fps') return;
    _wallSkin = skin;
    const m = _wallMatForSkin();
    for (const mesh of wallMeshes) mesh.material = m;
  }

  // 第一人称天花板：默认隐藏（第三人称总览不显示，否则遮挡机房内部俯视），
  // 进第一人称时由 main.js 调 setCeilingVisible(true) 显示。天花板含：
  // 近黑顶板 + 吊顶龙骨线 + 网格排布的 LED 灯盘（暖白自发光灯罩 + 钢吊杆），
  // 并布置少量暖色点光源在墙面/地面打出光斑，强化「被灯光照亮」的观感。
  let _ceilingVisible = false;
  let _ceilingGroup = null;
  function buildCeiling(dims) {
    const g = new THREE.Group();
    g.name = 'fps-ceiling';
    const H = dims.height;
    const topY = H + 0.03;
    // 顶板（近黑）
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(dims.width + 0.4, 0.06, dims.depth + 0.4),
      ceilMat
    );
    slab.position.set(0, topY, 0);
    g.add(slab);
    // 吊顶龙骨线（沿 X 方向，间距 3m）
    const keelStep = 3;
    const nx = Math.max(1, Math.floor(dims.width / keelStep));
    const keelGeo = new THREE.BoxGeometry(0.03, 0.02, dims.depth);
    for (let i = 0; i <= nx; i++) {
      const x = (i - nx / 2) * keelStep;
      const k = new THREE.Mesh(keelGeo, ceilKeelMat);
      k.position.set(x, H - 0.01, 0);
      g.add(k);
    }
    // LED 灯盘网格（沿 X 长 1.24m、沿 Z 宽 0.34m），暖白自发光灯罩 + 钢吊杆
    const pxStep = 4, pzStep = 4;
    const cols = [];
    for (let x = -dims.width / 2 + 2; x <= dims.width / 2 - 2 + 1e-6; x += pxStep) cols.push(x);
    const rows = [];
    for (let z = -dims.depth / 2 + 2; z <= dims.depth / 2 - 2 + 1e-6; z += pzStep) rows.push(z);
    for (const x of cols) {
      for (const z of rows) {
        const lp = new THREE.Group();
        lp.position.set(x, H - 0.06, z);
        const housing = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.09, 0.34), lightHousingMat);
        lp.add(housing);
        const diff = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.012, 0.26), lightEmisMat);
        diff.position.set(0, -0.048, 0);
        lp.add(diff);
        const h1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.10, 0.02), lightSteelMat);
        h1.position.set(-0.5, 0.075, 0); lp.add(h1);
        const h2 = h1.clone(); h2.position.set(0.5, 0.075, 0); lp.add(h2);
        g.add(lp);
      }
    }
    // 暖色点光源：与 LED 灯盘一一对齐（4m 网格），由天花板灯具向下照射，在墙面
    // 打出柔和的灯具光斑、强化「被灯光照亮」的观感。仅在天花板可见（第一人称）时生效。
    // 调参结论（实测像素验证）：墙面顶光梯度由 wallMatFPS 的材质级竖向渐变着色器
    // 主导（均匀平填光/IBL 会把墙整体抬到 ~234 饱和、淹没点光源衰减，故不再依赖
    // 点光源做梯度）。此处点光源仅作「灯具下方光斑」点缀：保持物理衰减 decay 2.0、
    // 强度 12、distance 40（足以在墙顶/机柜打出自然光斑，又不致整面过曝），与适度
    // 平填光（ambient0.12/hemi0.09/key0.30/fill0.18/exp1.0）叠加，由材质渐变锁定
    // 「顶部≈200、底部≈145、无过曝纯白」的顶光衰减效果。
    for (const x of cols) {
      for (const z of rows) {
        const pl = new THREE.PointLight(0xfff2dc, 6, 40, 2.0);
        pl.position.set(x, H - 0.20, z);
        g.add(pl);
      }
    }
    g.visible = _ceilingVisible;
    _ceilingGroup = g;
    return g;
  }
  function setCeilingVisible(v) {
    _ceilingVisible = !!v;
    if (_ceilingGroup) _ceilingGroup.visible = _ceilingVisible;
  }

  // 单面墙：Shape(长×高) + 门窗洞 holes → ExtrudeGeometry(厚度)
  // 前后墙长度向两端各延伸一个墙厚补齐四角；左右墙嵌在前后墙之间（无缺口、无重叠）
  function buildWallMesh(wall, key, dims) {
    const L = wall.length;
    const H = wall.height;
    // 同步墙体高度给第一人称墙面竖向渐变着色器（重建不同层高时过渡点正确）
    if (H && H !== _wallH) { _wallH = H; if (_wallGradU) _wallGradU.uWallH.value = _wallH; }
    const ext = (key === 'back' || key === 'front') ? wall.thickness : 0;
    const x0 = -L / 2 - ext, x1 = L / 2 + ext;
    const shape = new THREE.Shape();
    shape.moveTo(x0, 0);
    shape.lineTo(x1, 0);
    shape.lineTo(x1, H);
    shape.lineTo(x0, H);
    shape.closePath();

    for (const op of wall.openings) {
      const x0 = op.offset - L / 2;
      // 门洞底边略微下沉 5mm，避免洞口边缘与外墙轮廓共线导致三角化异常
      const y0 = op.type === 'door' ? 0.005 : op.sill;
      const y1 = Math.min(op.sill + op.height, H);
      const hole = new THREE.Path();
      hole.moveTo(x0, y0);
      hole.lineTo(x0 + op.width, y0);
      hole.lineTo(x0 + op.width, y1);
      hole.lineTo(x0, y1);
      hole.closePath();
      shape.holes.push(hole);
    }

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: wall.thickness, bevelEnabled: false, curveSegments: 1,
    });
    const mesh = new THREE.Mesh(geo, _wallMatForSkin());
    mesh.userData.wallKey = key;

    const t = wall.thickness;
    const T = {
      back: { pos: [0, 0, -dims.depth / 2 - t], rotY: 0 },
      front: { pos: [0, 0, dims.depth / 2], rotY: 0 },
      left: { pos: [-dims.width / 2 - t, 0, 0], rotY: Math.PI / 2 },
      right: { pos: [dims.width / 2 + t, 0, 0], rotY: -Math.PI / 2 },
    }[key];
    mesh.position.set(...T.pos);
    mesh.rotation.y = T.rotY;

    const sub = new THREE.Group();
    sub.add(mesh);
    // 发光描边（含洞口轮廓）
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), trimMat);
    edges.position.copy(mesh.position);
    edges.rotation.copy(mesh.rotation);
    sub.add(edges);
    wallMeshes.push(mesh);
    return sub;
  }

  function rebuild(layout, dims) {
    // 释放旧几何体
    wallMeshes.length = 0;
    for (const child of dyn.children) {
      child.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.isInstancedMesh && typeof o.dispose === 'function') o.dispose();
      });
    }
    dyn.clear();
    _lastLayout = layout;
    _lastDims = dims;

    // 地面：架空防静电地板（几何参数全部来自 floorConfig：砖长 tileW / 砖宽 tileD /
    // 板厚 tileH / 砖缝 gap / 离地高度 raise / 贴面 surface）。
    // 顶面保持 y=0 不变，确保既有设备锚点不动；砖体向 -Y 延伸；
    // 离地高度 raise 表现为「地板面向下架空层的深度」：板厚 tileH + 空腔 +
    // 结构板面（裙边），空腔内按 1.2m 网格布置支撑立柱。
    const fc = _floorCfg;
    const tileW = fc.tileW, tileD = fc.tileD, tileH = fc.tileH, gap = fc.gap;
    const raise = fc.raise;
    const nx = Math.max(1, Math.round(dims.width / tileW));
    const nz = Math.max(1, Math.round(dims.depth / tileD));
    const tileGeo = new THREE.BoxGeometry(Math.max(0.02, tileW - gap), tileH, Math.max(0.02, tileD - gap));
    const tiles = new THREE.InstancedMesh(tileGeo, floorMat, nx * nz);
    tiles.name = 'floor-anti-static-tiles';
    tiles.receiveShadow = true;
    tiles.castShadow = false;
    const mtx = new THREE.Matrix4();
    let tk = 0;
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        mtx.makeTranslation(
          -dims.width / 2 + tileW * (ix + 0.5),
          -tileH / 2,
          -dims.depth / 2 + tileD * (iz + 0.5)
        );
        tiles.setMatrixAt(tk++, mtx);
      }
    }
    tiles.instanceMatrix.needsUpdate = true;
    dyn.add(tiles);

    // 地板外裙边（随房间尺寸重建）：即架空层结构板面，沉至 -raise-0.02m，
    // 砖缝与空腔透出深色凹槽，呈现机房架空地板观感
    const apronSize = Math.max(dims.width, dims.depth) * 2.6 + 40;
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(apronSize, apronSize), apronMat);
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -raise - 0.02;
    dyn.add(apron);

    // 架空层支撑立柱 + 底盘（raise 大于板厚 5cm 以上时才构得成空腔）：
    // 1.2m 网格一柱，从砖体底面（-tileH）落到结构板面（-raise），
    // 让「离地高度」在场景里真实可见（从半透明墙体外/低角度可观察到空腔）。
    if (raise > tileH + 0.05) {
      const postH = raise - tileH;
      const postGeo = new THREE.CylinderGeometry(0.022, 0.022, postH, 8);
      const capGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.012, 8);
      const step = 1.2;
      const px0 = -Math.floor(dims.width / 2 / step) * step;
      const pz0 = -Math.floor(dims.depth / 2 / step) * step;
      const pxs = [];
      for (let x = px0; x <= dims.width / 2 + 1e-6; x += step) pxs.push(x);
      const pzs = [];
      for (let z = pz0; z <= dims.depth / 2 + 1e-6; z += step) pzs.push(z);
      const posts = new THREE.InstancedMesh(postGeo, pedestalMat, pxs.length * pzs.length);
      posts.name = 'floor-pedestals';
      const caps = new THREE.InstancedMesh(capGeo, pedestalMat, pxs.length * pzs.length);
      caps.name = 'floor-pedestal-caps';
      let pk = 0;
      const pm = new THREE.Matrix4();
      for (const x of pxs) {
        for (const z of pzs) {
          pm.makeTranslation(x, -tileH - postH / 2, z);
          posts.setMatrixAt(pk, pm);
          pm.makeTranslation(x, -raise + 0.006, z);
          caps.setMatrixAt(pk, pm);
          pk++;
        }
      }
      posts.instanceMatrix.needsUpdate = true;
      caps.instanceMatrix.needsUpdate = true;
      posts.castShadow = false;
      caps.castShadow = false;
      dyn.add(posts);
      dyn.add(caps);
    }

    // 架空地板围边：房间周长一圈竖板（从结构板面到地板顶面），
    // 遮住砖体侧沿与空腔下沿，让地板读作「架起来的一整块」而非悬浮砖块
    {
      const hW = dims.width / 2, hD = dims.depth / 2, t = 0.06;
      const skirtH = raise;
      const edgeGeoX = new THREE.BoxGeometry(dims.width + t * 2, skirtH, t);
      const edgeGeoZ = new THREE.BoxGeometry(t, skirtH, dims.depth);
      const skirt = new THREE.Group();
      skirt.name = 'floor-perimeter';
      for (const [geo, x, z] of [
        [edgeGeoX, 0, -hD - t / 2],
        [edgeGeoX, 0, hD + t / 2],
        [edgeGeoZ, -hW - t / 2, 0],
        [edgeGeoZ, hW + t / 2, 0],
      ]) {
        const m = new THREE.Mesh(geo, skirtMat);
        m.position.set(x, -skirtH / 2, z);
        skirt.add(m);
      }
      dyn.add(skirt);
    }

    // 顶部管线（空调/线缆桥架）已按需求移除：用户明确要求取消屋顶上的架子。
    // 天花板纵横灯带已按需求移除：交叉灯带从下方看呈「网格」状，用户要求去掉。
    // （灯带为自发光视觉材质，不贡献场景照明，移除不影响机房亮度与纵深。）

    // =====================================================================
    // 纵深感增强：天花板灯带 + 地面导光条
    // 灯带沿「过道方向」贯穿房间：沿通道中轴等距排布，向远端收拢形成
    // 消失点，配合 FogExp2 构成强烈线性透视（这是机房「走廊感」的关键）。
    // 数量随房间尺寸自适应，灯带本体用自发光 + 不写深度的薄板，
    // 与 bloom 叠加后在暗背景上呈现连续光条。
    // =====================================================================
    // 天花板纵横灯带已按需求移除：交叉灯带从下方看呈「网格」状（用户要求去掉）。
    // 灯带为自发光视觉材质，不贡献场景照明，移除不影响机房亮度。
    // 地面导光条仍按 2.4m 间距铺设（复用 stripsX 网格参数）。
    const stripStep = 2.4;
    const stripsX = Math.max(1, Math.floor(dims.width / stripStep));

    // 地面导光条：贴地沿过道方向，形成「路径指引」，
    // 与顶部灯带上下呼应，把视线引向房间纵深
    const guideGeoX = new THREE.PlaneGeometry(0.05, dims.depth * 0.9);
    for (let i = 0; i < stripsX; i++) {
      const x = (i - (stripsX - 1) / 2) * stripStep;
      const g = new THREE.Mesh(guideGeoX, floorGuideMat);
      g.rotation.x = -Math.PI / 2;
      g.position.set(x, 0.045, 0);
      dyn.add(g);
    }
    // 房间端部光柱已按需求移除：用户要求删掉机房四角立柱（原 4 根 BoxGeometry(0.22, height, 0.22) 端部光柱）。

    // 墙体
    for (const key of ['back', 'left', 'front', 'right']) {
      dyn.add(buildWallMesh(layout[key], key, dims));
    }

    // 防火门：为每面墙上的「门」洞口生成钢质双开防火门（含观察窗 / 推杠 / 铭牌）
    // 仅针对既有 door 洞口升级，不新增/移动任何门窗，保持布局与墙体不变。
    for (const key of ['back', 'left', 'front', 'right']) {
      const w = layout[key];
      for (const op of w.openings) {
        if (op.type !== 'door') continue;
        const door = buildFireDoor(op.width, op.height, op.rating);
        const tf = doorTransformForOpening(op, key, dims);
        door.position.copy(tf.pos);
        door.rotation.y = tf.rotY;
        door.name = `fire-door-${key}-${op.id || 'D'}`;
        dyn.add(door);
      }
    }

    // 第一人称天花板（默认隐藏，进第一人称时显形）
    dyn.add(buildCeiling(dims));
  }

  rebuild(wallLayout, roomDims);
  scene.add(group);

  // -------------------------------------------------------------------------
  // 静电地板铺设参数（floorConfig.js）：sanitize 后按上次布局/尺寸整体重建。
  // 顶面恒为 y=0，机柜/设备/吊杆等既有锚点不受影响；离地高度只改变架空层
  // 深度（裙边/立柱位置）。返回应用后的规范配置（供面板回显）。
  // -------------------------------------------------------------------------
  function setFloorConfig(cfg) {
    _floorCfg = sanitizeFloorConfig(cfg);
    // 贴面变更才换贴图（CanvasTexture 重建有成本，仅调尺寸/高度时没必要重画）
    if (_floorCfg.surface !== _floorSurface) {
      _floorSurface = _floorCfg.surface;
      if (floorMat.map) floorMat.map.dispose();
      floorMat.map = makeAntiStaticFloorTexture(surfaceColor(_floorSurface));
      floorMat.needsUpdate = true;
    }
    rebuild(_lastLayout, _lastDims);
    return JSON.parse(JSON.stringify(_floorCfg));
  }

  /** 当前生效地板配置的深拷贝（供 floorPanel 起稿 / 断言） */
  function getFloorConfig() { return JSON.parse(JSON.stringify(_floorCfg)); }

  return { rebuild, wallMeshes, setWallSkin, setCeilingVisible, setFloorConfig, getFloorConfig };
}

// ===========================================================================
// 机房「架空防静电地板 / 防火门」精细模型（移植自 source/低压配电柜3D模型.html）
// 缩放系数：源页 1 场景单位 = 1 米，与机房坐标系一致，故 FLOOR_SCALE=1、DOOR_SCALE=1。
// 颜色管理：r160 ColorManagement 默认开启，材质 hex 直接按 sRGB 解释，不再做
// convertSRGBToLinear()；CanvasTexture 设 colorSpace=SRGBColorSpace（不用已废弃的 encoding）。
// ===========================================================================

const FONT_CN = '"Microsoft YaHei","PingFang SC","Noto Sans SC","Source Han Sans SC",sans-serif';

function makeCanvasTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  // 各向异性等级跟随 GPU 最大值（掠射角地板/门牌不发虚）
  t.anisotropy = maxAnisotropy();
  t.needsUpdate = true;
  return t;
}

// 防静电贴面：基色（由 floorConfig 的贴面预设决定）+ 随机颗粒 + 砖缝倒角
// （每块砖一个完整贴图，缝隙由砖间距产生）
// 分辨率 256 → 512：地板是机房最大可见面，近景贴地观察时 256 会明显发糊；
// 512 在同等观感下把砖缝倒角与颗粒细节的像素密度翻倍，配合各向异性过滤，
// 斜看/近看都保持锐利（用户「高清显示标准」诉求的主战场）。
function makeAntiStaticFloorTexture(base = '#8d949a') {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = base;
  x.fillRect(0, 0, S, S);
  // 颗粒基亮度取贴面基色 R 通道，保证深/浅贴面的颗粒都落在同一色系
  const rBase = parseInt(base.slice(1, 3), 16) || 142;
  // 防静电贴面颗粒（密度与 256 版一致：按面积放大 4 倍后数量也 ×4）
  for (let i = 0; i < 20800; i++) {
    const px = Math.random() * S, py = Math.random() * S;
    const v = Math.floor(Math.random() * 46 - 23);
    const baseL = Math.max(20, rBase + v);
    x.fillStyle = 'rgba(' + baseL + ',' + (baseL + 3) + ',' + (baseL + 7) + ',' + (0.28 + Math.random() * 0.35).toFixed(2) + ')';
    x.fillRect(px, py, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  // 倒角边：让 600 砖缝在斜光下更清楚（线宽随分辨率翻倍，保持相对粗细一致）
  x.strokeStyle = 'rgba(74,80,86,0.55)';
  x.lineWidth = 10;
  x.strokeRect(5, 5, S - 10, S - 10);
  x.strokeStyle = 'rgba(214,220,225,0.35)';
  x.lineWidth = 4;
  x.strokeRect(12, 12, S - 24, S - 24);
  return makeCanvasTexture(c);
}

// ---- 防火门共享材质（钢质双开防火门，移植自源页机房门） ----
const MAT_DOOR_FRAME = new THREE.MeshStandardMaterial({ color: 0x5a6169, roughness: 0.50, metalness: 0.50 });
const MAT_DOOR_LEAF = new THREE.MeshStandardMaterial({ color: 0x7c848c, roughness: 0.56, metalness: 0.38 });
const MAT_DOOR_STEEL = new THREE.MeshStandardMaterial({ color: 0xc4cad0, roughness: 0.26, metalness: 0.95 });
const MAT_DOOR_GLASS = new THREE.MeshStandardMaterial({ color: 0x101a22, roughness: 0.07, metalness: 0.02, transparent: true, opacity: 0.26, envMapIntensity: 1.7 });
const MAT_DOOR_PLATE = new THREE.MeshStandardMaterial({ color: 0x1b1f23, roughness: 0.48, metalness: 0.34 });

function makeFireDoorSignTexture(rating) {
  const c = document.createElement('canvas');
  c.width = 768; c.height = 120;
  const x = c.getContext('2d');
  x.fillStyle = '#15191d';
  x.fillRect(0, 0, 768, 120);
  x.fillStyle = '#ffc776';
  x.font = '700 52px ' + FONT_CN;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('防火门 · FIRE DOOR', 384, 42);
  if (rating) {
    const label = rating === '甲' ? '甲级' : rating === '乙' ? '乙级' : rating === '丙' ? '丙级' : String(rating);
    x.fillStyle = '#ff7a59';
    x.font = '600 34px ' + FONT_CN;
    x.fillText(label + ' 防火门', 384, 92);
  }
  return makeCanvasTexture(c);
}

// 钢质双开防火门：本地坐标，正面（含观察窗/把手/推杠）朝 +Z，底面贴 y=0，X 居中
function buildFireDoor(W, H, rating) {
  const g = new THREE.Group();
  const dT = 0.06;
  // 门框（门头 + 左右竖框）
  const head = new THREE.Mesh(new THREE.BoxGeometry(W + 0.14, 0.09, dT + 0.04), MAT_DOOR_FRAME);
  head.name = 'Door_Frame_Head';
  head.position.set(0, H + 0.045, 0);
  g.add(head);
  const fL = new THREE.Mesh(new THREE.BoxGeometry(0.09, H, dT + 0.04), MAT_DOOR_FRAME);
  fL.name = 'Door_Frame_Left';
  fL.position.set(-(W / 2 + 0.045), H / 2, 0);
  g.add(fL);
  const fR = fL.clone();
  fR.name = 'Door_Frame_Right';
  fR.position.set((W / 2 + 0.045), H / 2, 0);
  g.add(fR);
  // 双开门扇
  const winY = Math.min(1.50, H * 0.68);
  const handleY = Math.min(1.02, H * 0.46);
  const pushY = Math.min(0.95, H * 0.43);
  for (let s = 0; s < 2; s++) {
    const sgn = s ? 1 : -1;
    const leaf = new THREE.Group();
    leaf.name = 'Door_Leaf_' + (s ? 'R' : 'L');
    leaf.position.set(sgn * (W / 4), 0, 0);
    g.add(leaf);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(W / 2 - 0.02, H - 0.02, dT), MAT_DOOR_LEAF);
    panel.name = 'Door_Leaf_Panel';
    panel.position.set(sgn * 0.005, H / 2, 0.01);
    leaf.add(panel);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.012), MAT_DOOR_GLASS);
    win.name = 'Door_Window';
    win.position.set(sgn * 0.005, winY, 0.045);
    leaf.add(win);
    const winFrame = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.66, 0.01), MAT_DOOR_PLATE);
    winFrame.name = 'Door_Window_Frame';
    winFrame.position.set(sgn * 0.005, winY, 0.038);
    leaf.add(winFrame);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.035), MAT_DOOR_STEEL);
    handle.name = 'Door_Handle';
    handle.position.set(sgn * (W / 4 - 0.10), handleY, 0.06);
    leaf.add(handle);
    const push = new THREE.Mesh(new THREE.BoxGeometry(W / 2 - 0.24, 0.05, 0.028), MAT_DOOR_STEEL);
    push.name = 'Door_PushBar';
    push.position.set(sgn * 0.02, pushY, 0.055);
    leaf.add(push);
  }
  // 门楣标识（含防火门等级）
  const signTex = makeFireDoorSignTexture(rating);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.40, 0.22),
    new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.55, metalness: 0.05, transparent: true })
  );
  sign.name = 'Door_Sign';
  sign.position.set(0, H + 0.22, 0.04);
  g.add(sign);
  return g;
}

// 将门洞口（沿墙的 offset/width）换算为门组在房间世界坐标中的位置与朝向
// 门组本地 +Z 为门正面，需朝向房间内部；门置于墙内壁面内侧 3cm。
function doorTransformForOpening(op, key, dims) {
  const inset = 0.03;
  let x, z, rotY;
  if (key === 'back') {
    x = op.offset - dims.width / 2 + op.width / 2;
    z = -dims.depth / 2 + inset;
    rotY = 0;
  } else if (key === 'front') {
    x = op.offset - dims.width / 2 + op.width / 2;
    z = dims.depth / 2 - inset;
    rotY = Math.PI;
  } else if (key === 'left') {
    // 左墙绕 Y 旋转 +π/2：本地 +X（墙长方向）映射到世界 -Z，门洞中心需镜像
    z = dims.depth / 2 - op.offset - op.width / 2;
    x = -dims.width / 2 + inset;
    rotY = Math.PI / 2;
  } else { // right
    z = op.offset - dims.depth / 2 + op.width / 2;
    x = dims.width / 2 - inset;
    rotY = -Math.PI / 2;
  }
  return { pos: new THREE.Vector3(x, 0, z), rotY };
}
