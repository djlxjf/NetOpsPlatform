// 漫游碰撞单元测试（无需 WebGL）：验证机柜碰撞盒拦截 + 房间边界钳制
import * as THREE from 'three';
import { RoamControls } from './src/walkthrough.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗', m); } };

// 假 sceneMgr：仅提供 camera（update 需要）与 getDims 回调
const cam = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 1000);
cam.position.set(0, 1.65, 5);
const sm = { camera: cam, renderer: { domElement: {} } };
const getDims = () => ({ width: 10, depth: 10, height: 8 });

const roam = new RoamControls(sm, getDims);

// 1) setObstacles 依据 rack 尺寸+旋转生成 AABB
const racks = {
  racks: [
    { id: 'RK001', type: 'server', x: 0, z: 0, rotationY: 0 },        // w0.6 d1.0
    { id: 'RK002', type: 'ac', x: 4, z: 0, rotationY: Math.PI / 2 },  // 旋转90°：w1.4 d1.2
  ],
};
roam.setObstacles(racks);
ok(roam.boxes.length === 2, '应生成 2 个碰撞盒');
// RK001: hx=w/2+r=0.30+0.28=0.58, hz=d/2+r=0.50+0.28=0.78
ok(Math.abs(roam.boxes[0].maxX - 0.58) < 1e-6 && Math.abs(roam.boxes[0].maxZ - 0.78) < 1e-6, 'RK001 盒子半距正确');

// 2) _collides 基础判定
ok(roam._collides(0, 0) === true, '盒心应判为碰撞');
ok(roam._collides(0, 5) === false, '盒外(5m)应无碰撞');
ok(roam._collides(3.9, 0) === true, 'RK002 旋转后盒内应碰撞'); // ac 旋转90° 半距 hz=(1.4+1.2)/2+0.28=1.28 →x∈[2.72,5.28]

// 3) 分轴滑动：朝机柜前进，应停在被拦截边界、绝不穿入盒内
cam.position.set(0, 1.65, 5);
roam.active = true;
roam.keys.add('KeyW'); // 前进（朝向需设为 -Z）
roam.euler.set(0, 0, 0, 'YXZ'); // 默认朝 -Z（THREE 相机默认看向 -Z）
for (let i = 0; i < 40; i++) roam.update(0.1);
roam.keys.delete('KeyW');
ok(cam.position.z >= 0.78 - 1e-6, `不应穿入 RK001 盒 (z=${cam.position.z.toFixed(3)}, 盒边界0.78)`);
ok(roam._collides(cam.position.x, cam.position.z) === false, '最终位置应在盒外');

// 4) 房间边界钳制：无碰撞盒时持续 +X 应被钳在 hw=5-0.28=4.72
roam.boxes = [];
cam.position.set(0, 1.65, 0);
roam.keys.add('KeyD'); // 右移（+X 方向）
for (let i = 0; i < 100; i++) roam.update(0.1);
roam.keys.delete('KeyD');
ok(Math.abs(cam.position.x - 4.72) < 1e-6, `应被钳在房间右界 4.72 (x=${cam.position.x.toFixed(3)})`);
ok(Math.abs(cam.position.y - 1.65) < 1e-6, `视点高度恒为眼高 1.65 (y=${cam.position.y.toFixed(3)})`);

console.log(`\n漫游碰撞测试：${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
