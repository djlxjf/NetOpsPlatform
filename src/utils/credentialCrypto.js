/**
 * 凭据加密工具（安全审计 F-007）
 *
 * 设计原则：
 * - 加密只发生在"用户输入密码的那一刻"（表单提交 / 导入入库时）
 * - 存储层（deviceStore.devices / localStorage / SQLite）存密文（enc: 前缀 base64）
 * - 所有使用点（编辑回显 / SSH 连接 / 终端）从 store 读取时解密
 * - Web 预览模式（无 window.electronAPI / safeStorage 不可用）自动降级为明文，
 *   保证 vite preview 与浏览器环境功能不回退
 */

const ENC_PREFIX = 'enc:'

/** 判断值是否已是加密密文（幂等防护：防止对密文二次加密） */
export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX)
}

/** 加密敏感字段：Electron 下走 safeStorage，Web/降级场景原样返回（幂等） */
export async function encryptSecret(text) {
  if (typeof text !== 'string' || !text) return text
  if (isEncrypted(text)) return text // 已加密，跳过
  if (window.electronAPI?.credentialEncrypt) {
    try {
      const res = await window.electronAPI.credentialEncrypt(text)
      if (res?.success) return res.data
      if (res?.fallback) return text // safeStorage 不可用，降级明文
    } catch (e) {
      console.error('[credentialCrypto] 加密失败，降级明文', e)
    }
  }
  return text // Web 环境无 IPC，降级明文
}

/** 解密敏感字段：非密文原样返回（幂等）；解密失败返回 null（安全审计 H-002） */
export async function decryptSecret(enc) {
  if (typeof enc !== 'string' || !isEncrypted(enc)) return enc
  if (window.electronAPI?.credentialDecrypt) {
    try {
      const res = await window.electronAPI.credentialDecrypt(enc)
      if (res?.success) return res.data
    } catch (e) {
      console.error('[credentialCrypto] 解密失败', e)
    }
  }
  // 安全审计 H-002：解密失败返回 null 而非密文原值
  // 旧实现返回密文原值会导致 SSH 连接把密文当密码发送到设备，造成认证失败
  return null
}

/** 设备对象的敏感凭据字段（sshKey 为私钥路径，非敏感，不加密） */
export const DEVICE_SECRET_FIELDS = ['sshPass', 'enablePass']

/**
 * 迁移历史明文凭据（幂等）：遍历设备，把明文密码字段加密重写。
 * 在 App.vue 设备数据加载完成后调用一次。
 * @returns {Promise<number>} 迁移的设备数
 */
export async function migrateLegacyCredentials(devices) {
  if (!Array.isArray(devices)) return 0
  // Web 环境 / 无加密能力时无需迁移
  if (!window.electronAPI?.credentialEncrypt) return 0
  let changed = 0
  for (const d of devices) {
    let dirty = false
    for (const field of DEVICE_SECRET_FIELDS) {
      if (d && d[field] && !isEncrypted(d[field])) {
        d[field] = await encryptSecret(d[field])
        dirty = true
      }
    }
    if (dirty) changed++
  }
  return changed
}

/** 加密单个设备对象中的敏感字段（返回新对象，不改原对象） */
export async function encryptDeviceSecrets(device) {
  const d = { ...device }
  for (const field of DEVICE_SECRET_FIELDS) {
    if (d[field]) d[field] = await encryptSecret(d[field])
  }
  return d
}

/** 解密单个设备对象中的敏感字段（返回新对象，不改原对象） */
export async function decryptDeviceSecrets(device) {
  const d = { ...device }
  for (const field of DEVICE_SECRET_FIELDS) {
    if (d[field]) d[field] = await decryptSecret(d[field])
  }
  return d
}
