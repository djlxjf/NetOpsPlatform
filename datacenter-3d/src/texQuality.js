// ===========================================================================
// 纹理画质辅助：集中管理各 CanvasTexture 的各向异性（anisotropy）过滤等级。
//
// 背景：各向异性过滤决定「掠射角表面」（地板、墙面、机柜侧板）在倾斜视角下
// 是否锐利。等级越高，斜看时贴图越清晰、越不发虚——这是用户「提升机房可视化
// 清晰度 / 贴图精度」诉求的核心抓手之一。
//
// 旧实现把 anisotropy 硬编码为 8；但桌面 GPU 普遍支持 16。硬编码会白白损失
// 一半的可用过滤等级。这里改为：默认 8（兜底），SceneManager 初始化后由
// renderer.capabilities.getMaxAnisotropy() 覆盖为 GPU 实际最大值。
// 各 make* 纹理函数统一调用 maxAnisotropy()，既避免散落硬编码，又能在不支持
// 高各向异性的环境（如软件渲染器）安全降级为 1。
// ===========================================================================

let _maxAniso = 8;

/** SceneManager 初始化后调用，写入 GPU 实际支持的最大各向异性等级 */
export function setMaxAnisotropy(v) {
  if (typeof v === 'number' && v > 0) _maxAniso = v;
}

/** 供各纹理生成函数读取当前生效的各向异性等级 */
export function maxAnisotropy() {
  return _maxAniso;
}
