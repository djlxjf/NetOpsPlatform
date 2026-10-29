/**
 * 账号存储与认证服务（登录系统）
 *
 * 职责：
 * - 账户数据的读写抽象：Electron 下走主进程 dbCache（dbLoadAccounts/dbSaveAccounts），
 *   Web 环境降级 localStorage `netops_accounts`，与项目存储的双环境策略一致
 * - 注册 / 登录 / 忘记密码（安全问题 + 恢复码双通道）/ 已登录修改密码，
 *   含防暴力破解锁定（连续失败 5 次锁 10 分钟，锁定状态持久化）
 * - 账号会话管理：localStorage `netops_account` 同步写（保证刷新即时生效），
 *   Electron 下额外经 auth-save-session/auth-load-session 持久到主进程（防 localStorage 丢失）
 *
 * 安全边界：
 * - 密码、安全答案、恢复码均只存 PBKDF2 哈希（见 accountCrypto.js），不存明文；
 *   三者各自独立随机盐
 * - 恢复码是忘记密码的主通道（安全问题为备选）：注册时生成一次、仅明文展示一次
 * - 锁定状态随账户持久化，重启应用不重置
 * - 项目数据为本机全局共享（不随账号隔离），该决策已产品评审定案并需在 UI 文案明示
 */

import {
  hashSecret,
  verifySecret,
  normalizeAnswer,
  validatePassword,
  validateUsername
} from './accountCrypto'

const ACCOUNTS_KEY = 'netops_accounts'
const SESSION_KEY = 'netops_account'

const MAX_ATTEMPTS = 5
const LOCK_DURATION_MS = 10 * 60 * 1000

// 恢复码字符表：剔除易混淆字符（I/L/O/0/1），4 组 × 4 字符
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

// 预设安全问题（注册时选择其一）
export const SECURITY_QUESTIONS = [
  '您的第一所学校叫什么名字？',
  '您母亲的名字是什么？',
  '您第一只宠物的名字是什么？',
  '您出生的城市是哪里？',
  '您最喜欢的电影是什么？',
  '您小学班主任的名字是什么？'
]

/** 恢复码标准化：大写 + 去除分隔符（校验时大小写/横线不敏感） */
function normalizeRecoveryCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** 生成一次性恢复码：XXXX-XXXX-XXXX-XXXX（明文只在注册成功时展示一次） */
function generateRecoveryCode() {
  assertCryptoAvailable()
  const buf = new Uint8Array(16)
  crypto.getRandomValues(buf)
  const chars = Array.from(buf).map(b => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length])
  return [0, 1, 2, 3].map(i => chars.slice(i * 4, i * 4 + 4).join('')).join('-')
}

function assertCryptoAvailable() {
  if (!globalThis.crypto?.subtle?.importKey || !globalThis.crypto?.getRandomValues) {
    throw new Error('当前环境不支持 Web Crypto，无法安全处理密码')
  }
}

/** 用户名标准化键：大小写不敏感的唯一性判断 */
function usernameKey(name) {
  return String(name || '').trim().toLowerCase()
}

function readLocalAccounts() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeLocalAccounts(accounts) {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
    return true
  } catch (e) {
    console.error('[accountStorage] localStorage 写入失败', e)
    return false
  }
}

/** 加载全部账户：Electron 优先主进程，Web 读 localStorage */
export async function loadAccounts() {
  if (window.electronAPI?.dbLoadAccounts) {
    try {
      const res = await window.electronAPI.dbLoadAccounts()
      if (res?.success && res.accounts && typeof res.accounts === 'object') {
        return res.accounts
      }
    } catch (e) {
      console.error('[accountStorage] 主进程账户加载失败，降级 localStorage', e)
    }
  }
  return readLocalAccounts()
}

/** 保存全部账户：Electron 写主进程（同时镜像 localStorage 兜底），Web 写 localStorage */
export async function saveAccounts(accounts) {
  // 先镜像到 localStorage 作为兜底（主进程写失败时仍有副本）
  writeLocalAccounts(accounts)
  if (window.electronAPI?.dbSaveAccounts) {
    try {
      const res = await window.electronAPI.dbSaveAccounts(accounts)
      if (res?.success) return { success: true }
      return { success: false, message: res?.error || '主进程保存失败' }
    } catch (e) {
      console.error('[accountStorage] 主进程账户保存失败，已保留 localStorage 副本', e)
      return { success: true, degraded: true }
    }
  }
  return { success: true }
}

/** 查找账户（按用户名，大小写不敏感）；返回 [key, account] 或 null */
async function findAccount(username) {
  const accounts = await loadAccounts()
  const key = usernameKey(username)
  if (!key || !accounts[key]) return null
  return { key, account: accounts[key] }
}

/** 判断是否处于锁定中；返回剩余毫秒（未锁定返回 0） */
function lockRemaining(account) {
  if (!account?.lockUntil) return 0
  const rest = account.lockUntil - Date.now()
  return rest > 0 ? rest : 0
}

function formatLockTime(ms) {
  const min = Math.ceil(ms / 60000)
  return min > 1 ? `${min} 分钟` : '1 分钟'
}

/**
 * 注册账号
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export async function registerAccount({ username, password, question, answer }) {
  const nameErr = validateUsername(username)
  if (nameErr) return { success: false, message: nameErr }
  const pwdErr = validatePassword(password)
  if (pwdErr) return { success: false, message: pwdErr }
  if (!question) return { success: false, message: '请选择一个安全问题' }
  const ans = normalizeAnswer(answer)
  if (!ans) return { success: false, message: '安全问题答案不能为空' }
  if (ans.length > 50) return { success: false, message: '安全问题答案过长' }

  const accounts = await loadAccounts()
  const key = usernameKey(username)
  if (accounts[key]) return { success: false, message: '该用户名已被注册' }

  const passwordRecord = await hashSecret(password)
  const answerRecord = await hashSecret(ans)

  // 恢复码：明文仅此一次返回给 UI 展示，存储层只留哈希
  const recoveryCode = generateRecoveryCode()
  const recoveryRecord = await hashSecret(normalizeRecoveryCode(recoveryCode))

  accounts[key] = {
    username: String(username).trim(), // 保留原始写法用于展示
    password: passwordRecord,
    question,
    answer: answerRecord,
    recovery: recoveryRecord,
    failedAttempts: 0,
    lockUntil: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  const saved = await saveAccounts(accounts)
  if (!saved.success) return { success: false, message: saved.message || '账户保存失败' }
  return { success: true, recoveryCode }
}

/**
 * 登录校验（含失败锁定）
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export async function loginAccount(username, password) {
  const found = await findAccount(username)
  if (!found) return { success: false, message: '用户名或密码错误' }
  const { key, account } = found

  const locked = lockRemaining(account)
  if (locked > 0) {
    return { success: false, message: `尝试次数过多，账号已锁定，请 ${formatLockTime(locked)} 后重试` }
  }

  const ok = await verifySecret(password, account.password)
  if (!ok) {
    const accounts = await loadAccounts()
    const acct = accounts[key]
    acct.failedAttempts = (acct.failedAttempts || 0) + 1
    let message = '用户名或密码错误'
    if (acct.failedAttempts >= MAX_ATTEMPTS) {
      acct.lockUntil = Date.now() + LOCK_DURATION_MS
      acct.failedAttempts = 0
      message = `连续失败 ${MAX_ATTEMPTS} 次，账号已锁定 10 分钟`
    } else {
      message += `，剩余 ${MAX_ATTEMPTS - acct.failedAttempts} 次机会`
    }
    acct.updatedAt = new Date().toISOString()
    await saveAccounts(accounts)
    return { success: false, message }
  }

  // 登录成功：清空失败计数
  const accounts = await loadAccounts()
  const acct = accounts[key]
  acct.failedAttempts = 0
  acct.lockUntil = 0
  acct.lastLogin = new Date().toISOString()
  await saveAccounts(accounts)
  return { success: true, username: acct.username }
}

/**
 * 获取某账号的安全问题（不存在返回 null）
 * 锁定状态以 locked 标志返回而非直接拒绝：恢复码通道在锁定期仍可用（逃生门），
 * 安全问题通道由 resetPassword 内部的锁定校验拦截
 */
export async function getSecurityQuestion(username) {
  const found = await findAccount(username)
  if (!found) return null
  const locked = lockRemaining(found.account) > 0
  return { question: found.account.question, locked }
}

/**
 * 忘记密码：安全问题答案校验 + 重置密码（答案错误同样累计锁定）
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export async function resetPassword(username, answer, newPassword) {
  const pwdErr = validatePassword(newPassword)
  if (pwdErr) return { success: false, message: pwdErr }

  const found = await findAccount(username)
  if (!found) return { success: false, message: '该用户名未注册' }
  const { key, account } = found

  const locked = lockRemaining(account)
  if (locked > 0) {
    return { success: false, message: `尝试次数过多，账号已锁定，请 ${formatLockTime(locked)} 后重试` }
  }

  const ansOk = await verifySecret(normalizeAnswer(answer), account.answer)
  if (!ansOk) {
    const accounts = await loadAccounts()
    const acct = accounts[key]
    acct.failedAttempts = (acct.failedAttempts || 0) + 1
    let message = '安全问题答案错误'
    if (acct.failedAttempts >= MAX_ATTEMPTS) {
      acct.lockUntil = Date.now() + LOCK_DURATION_MS
      acct.failedAttempts = 0
      message = `连续失败 ${MAX_ATTEMPTS} 次，账号已锁定 10 分钟`
    } else {
      message += `，剩余 ${MAX_ATTEMPTS - acct.failedAttempts} 次机会`
    }
    acct.updatedAt = new Date().toISOString()
    await saveAccounts(accounts)
    return { success: false, message }
  }

  return await doResetPassword(key, newPassword)
}

/**
 * 忘记密码（主通道）：恢复码校验 + 重置密码（恢复码错误同样累计锁定）
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export async function resetPasswordWithRecovery(username, recoveryCode, newPassword) {
  const pwdErr = validatePassword(newPassword)
  if (pwdErr) return { success: false, message: pwdErr }

  const found = await findAccount(username)
  if (!found) return { success: false, message: '该用户名未注册' }
  const { key, account } = found
  // 注意：恢复码通道不受密码锁定限制（产品定案的逃生门）——
  // 恢复码熵约 80 bit，暴力枚举不可行；错误尝试仍会计入锁定

  const codeOk = await verifySecret(normalizeRecoveryCode(recoveryCode), account.recovery)
  if (!codeOk) {
    const accounts = await loadAccounts()
    const acct = accounts[key]
    acct.failedAttempts = (acct.failedAttempts || 0) + 1
    let message = '恢复码不正确'
    if (acct.failedAttempts >= MAX_ATTEMPTS) {
      acct.lockUntil = Date.now() + LOCK_DURATION_MS
      acct.failedAttempts = 0
      message = `连续失败 ${MAX_ATTEMPTS} 次，账号已锁定 10 分钟`
    } else {
      message += `，剩余 ${MAX_ATTEMPTS - acct.failedAttempts} 次机会`
    }
    acct.updatedAt = new Date().toISOString()
    await saveAccounts(accounts)
    return { success: false, message }
  }

  return await doResetPassword(key, newPassword)
}

/** 已登录状态下修改密码：需验证旧密码（防会话被劫持后直接改密） */
export async function changePassword(username, oldPassword, newPassword) {
  const pwdErr = validatePassword(newPassword)
  if (pwdErr) return { success: false, message: pwdErr }

  const found = await findAccount(username)
  if (!found) return { success: false, message: '账号不存在，请重新登录' }

  const ok = await verifySecret(oldPassword, found.account.password)
  if (!ok) return { success: false, message: '当前密码错误' }

  return await doResetPassword(found.key, newPassword)
}

/** 重置密码的公共收尾（调用方已完成全部校验） */
async function doResetPassword(key, newPassword) {
  const accounts = await loadAccounts()
  const acct = accounts[key]
  if (!acct) return { success: false, message: '账号不存在' }
  acct.password = await hashSecret(newPassword)
  acct.failedAttempts = 0
  acct.lockUntil = 0
  acct.updatedAt = new Date().toISOString()
  await saveAccounts(accounts)
  return { success: true }
}

// ============================================================
// 账号会话管理
// ============================================================

/** 读取账号会话（同步，localStorage）；返回用户名字符串或 null */
export function getAccountSession() {
  try {
    return localStorage.getItem(SESSION_KEY) || null
  } catch {
    return null
  }
}

/** 写账号会话（localStorage 同步 + Electron 主进程异步持久化） */
export function setAccountSession(username) {
  try {
    if (username) {
      localStorage.setItem(SESSION_KEY, username)
    } else {
      localStorage.removeItem(SESSION_KEY)
    }
  } catch (e) {
    console.error('[accountStorage] 会话写入失败', e)
  }
  if (window.electronAPI?.authSaveSession) {
    try {
      window.electronAPI.authSaveSession(username || null).catch(() => {})
    } catch (e) { /* 忽略 IPC 异常 */ }
  }
}

/**
 * 校验会话有效性：账号会话指向的账户必须仍然存在（防 localStorage 残留脏会话）
 * 返回有效的用户名或 null
 */
export async function validateAccountSession(sessionUsername) {
  if (!sessionUsername) return null
  const found = await findAccount(sessionUsername)
  return found ? found.account.username : null
}
