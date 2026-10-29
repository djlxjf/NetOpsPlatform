// 领域纯函数层（从 wallLayout.js 抽取）
// 门窗合法性校验：纯函数，不依赖渲染对象 / DOM / THREE，便于复用与单测。

export const OPENING_MIN_SIZE = 0.3;   // 门窗最小宽/高（m）
export const WINDOW_MIN_SILL = 0.3;    // 窗台最低高度（m）
export const EPS = 1e-6;

export function validateOpening(wall, op) {
  const errs = [];
  if (!(op.width > 0)) errs.push('宽度必须大于 0');
  if (!(op.height > 0)) errs.push('高度必须大于 0');
  if (op.width < OPENING_MIN_SIZE - EPS || op.height < OPENING_MIN_SIZE - EPS) {
    errs.push(`宽高不得小于 ${OPENING_MIN_SIZE}m`);
  }
  if (op.offset < -EPS) errs.push('横向位置不能为负');
  if (op.offset + op.width > wall.length + EPS) errs.push('超出墙面长度范围');
  if (op.sill < -EPS) errs.push('底部高度不能为负');
  if (op.sill + op.height > wall.height + EPS) errs.push('超出墙面高度范围');
  if (op.type === 'door' && op.sill > EPS) errs.push('门必须落地（底部高度为 0）');
  if (op.type === 'window' && op.sill < WINDOW_MIN_SILL - EPS) {
    errs.push(`窗台高度不得低于 ${WINDOW_MIN_SILL}m`);
  }
  // 整改 G-FIRE-05：泄压口（relief）为气体灭火保护区超压释放构件
  if (op.type === 'relief' && op.sill < 0.5 - EPS) {
    errs.push('泄压口底边宜高于 0.5m（防喷放气流直吹人员，量级提示）');
  }
  // 整改 G-FIRE-06：防火门等级 rating（甲/乙/丙），疏散门按普通门兼容处理
  if (op.type === 'door' && op.rating && !['甲', '乙', '丙'].includes(op.rating)) {
    errs.push('防火门等级必须为 甲/乙/丙');
  }
  // 整改 G-SEC-02：门禁子模型（识别方式/双向受控/防尾随/断电模式）+ G-SEC-03 fireRelease
  if (op.type === 'door' && op.security) {
    const modes = ['card', 'fingerprint', 'face', 'qr'];
    if (op.security.method && !modes.includes(op.security.method)) errs.push('门禁识别方式不合法');
  }
  for (const other of wall.openings) {
    if (other.id === op.id) continue;
    const xOverlap = op.offset < other.offset + other.width - EPS
      && other.offset < op.offset + op.width - EPS;
    const yOverlap = op.sill < other.sill + other.height - EPS
      && other.sill < op.sill + op.height - EPS;
    if (xOverlap && yOverlap) { errs.push('与其他门窗重叠'); break; }
  }
  return errs;
}

export function validateWall(wall) {
  const errors = [];
  if (!(wall.length >= 1)) errors.push('墙长不能小于 1m');
  if (!(wall.height >= 1)) errors.push('墙高不能小于 1m');
  if (!(wall.thickness >= 0.1)) errors.push('墙厚不能小于 0.1m');
  for (const op of wall.openings) {
    const errs = validateOpening(wall, op);
    if (errs.length) errors.push(`${op.type === 'door' ? '门' : '窗'} ${op.id}：${errs.join('；')}`);
  }
  return errors;
}
