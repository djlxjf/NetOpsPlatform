/**
 * 账号密码哈希工具（登录系统）
 *
 * 设计原则：
 * - 永不存储明文密码：注册/改密时用 PBKDF2-SHA256 派生密钥，只存
 *   { salt, hash, iterations }；登录时对输入做同样派生后比对
 * - 每个账号独立随机盐（16 字节），防彩虹表
 * - 安全问题答案先 trim + 转小写再哈希（大小写不敏感，体验友好）
 * - 使用 Web Crypto API（subtle），Electron 渲染进程（file:// 属安全上下文）
 *   与现代浏览器均可用；不可用时抛出明确错误，静默降级明文是不安全的
 */

const PBKDF2_ITERATIONS = 150000
const SALT_BYTES = 16
const HASH_BYTES = 32

function assertCryptoAvailable() {
  if (!globalThis.crypto?.subtle?.importKey || !globalThis.crypto?.getRandomValues) {
    throw new Error('当前环境不支持 Web Crypto，无法安全处理密码')
  }
}

/** 生成随机盐（hex 字符串） */
export function randomSalt() {
  assertCryptoAvailable()
  const buf = new Uint8Array(SALT_BYTES)
  crypto.getRandomValues(buf)
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return out
}

function bytesToHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** PBKDF2-SHA256 派生（返回 hex 摘要） */
async function pbkdf2(password, saltHex, iterations) {
  assertCryptoAvailable()
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: hexToBytes(saltHex),
      iterations,
      hash: 'SHA-256'
    },
    key,
    HASH_BYTES * 8
  )
  return bytesToHex(bits)
}

/** 哈希一个密码/答案：返回 { salt, hash, iterations } */
export async function hashSecret(plain) {
  const salt = randomSalt()
  const hash = await pbkdf2(String(plain), salt, PBKDF2_ITERATIONS)
  return { salt, hash, iterations: PBKDF2_ITERATIONS }
}

/** 校验明文是否与哈希记录匹配（记录格式由 hashSecret 产出） */
export async function verifySecret(plain, record) {
  if (!record || !record.salt || !record.hash) return false
  const computed = await pbkdf2(String(plain), record.salt, record.iterations || PBKDF2_ITERATIONS)
  // 逐字节比较，避免提前短路带来的时序侧信道
  const a = hexToBytes(computed)
  const b = hexToBytes(record.hash)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/** 安全问题答案标准化：trim + 小写（哈希前调用，保证校验时大小写不敏感） */
export function normalizeAnswer(answer) {
  return String(answer || '').trim().toLowerCase()
}

/** 密码强度校验：返回错误信息，合法返回 null */
export function validatePassword(pwd) {
  const s = String(pwd || '')
  if (!s) return '密码不能为空'
  if (s.length < 6) return '密码长度至少 6 位'
  if (s.length > 64) return '密码长度不能超过 64 位'
  if (/\s/.test(s)) return '密码不能包含空格'
  return null
}

/** 用户名格式校验：返回错误信息，合法返回 null */
export function validateUsername(name) {
  const s = String(name || '').trim()
  if (!s) return '用户名不能为空'
  if (s.length < 2 || s.length > 24) return '用户名长度为 2-24 个字符'
  if (!/^[\u4e00-\u9fa5A-Za-z0-9_.@-]+$/.test(s)) {
    return '用户名仅支持中文、字母、数字及 _.@- 字符'
  }
  return null
}
