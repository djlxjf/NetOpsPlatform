import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
// 账号体系：注册/登录/忘记密码/会话（登录系统新增）
import {
  getAccountSession,
  setAccountSession,
  registerAccount as accountStorageRegister,
  loginAccount as accountStorageLogin,
  resetPassword as accountStorageReset,
  resetPasswordWithRecovery as accountStorageResetRecovery,
  changePassword as accountStorageChangePassword,
  getSecurityQuestion as accountStorageGetQuestion,
  validateAccountSession
} from '../utils/accountStorage'
import deviceModels from '../data/deviceModels.js'
import { usePortStateStore } from './portState.js'
import { useAlertStore } from './alert.js'
import { useConfigStore } from './config.js'
import { useStatsStore } from './stats.js'
import { useNotificationStore } from './notification.js'
import { encryptDeviceSecrets } from '../utils/credentialCrypto.js'

// 重新导出端口状态管理器和告警管理器供外部使用
export { usePortStateStore, useAlertStore, useConfigStore, useStatsStore, useNotificationStore }

// 项目数据存储
const PROJECTS_KEY = 'netops_projects'

// HTML转义函数，防止XSS攻击
function escapeHtml(str) {
  if (!str) return str
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function getProjects() {
  try {
    return JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]')
  } catch {
    return []
  }
}

function saveProjects(projects) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
}

// 认证 Store（已改为项目选择模式）
export const useAuthStore = defineStore('auth', () => {
  // 从 localStorage 恢复当前项目（无论是否在 Electron 环境中，都优先从 localStorage 恢复）
  const initUser = JSON.parse(localStorage.getItem('netops_user') || 'null')
  const currentUser = ref(initUser)
  const isLoggedIn = computed(() => !!currentUser.value)

  // 项目列表
  const projects = ref(getProjects())

  // 创建项目
  function addProject(name, address) {
    if (!name || !name.trim()) return { success: false, message: '项目名称不能为空' }
    const list = getProjects()
    const project = {
      id: 'proj_' + Date.now(),
      name: escapeHtml(name.trim()),
      address: escapeHtml((address || '').trim()),
      createdAt: new Date().toISOString()
    }
    list.push(project)
    saveProjects(list)
    projects.value = list
    return { success: true, project }
  }

  // 更新项目
  function updateProject(id, data) {
    const list = getProjects()
    const idx = list.findIndex(p => p.id === id)
    if (idx < 0) return { success: false, message: '项目不存在' }
    list[idx] = {
      ...list[idx],
      name: escapeHtml(data.name.trim()),
      address: escapeHtml((data.address || '').trim())
    }
    saveProjects(list)
    projects.value = list
    // 如果当前选中的项目被修改，同步更新 currentUser
    if (currentUser.value?.username === id) {
      currentUser.value = {
        ...currentUser.value,
        username: id,
        name: list[idx].name
      }
      localStorage.setItem('netops_user', JSON.stringify(currentUser.value))
    }
    return { success: true }
  }

  // 删除项目
  function deleteProject(id) {
    const list = getProjects().filter(p => p.id !== id)
    saveProjects(list)
    projects.value = list
    // 如果删除的是当前项目，退出登录
    if (currentUser.value?.username === id) {
      logout()
    }
    return { success: true }
  }

  // 选择项目（替代原来的登录）
  function selectProject(project) {
    if (!project || !project.id) return false
    const user = {
      id: project.id,
      username: project.id,
      name: project.name,
      projectAddress: project.address,
      loginTime: new Date().toISOString()
    }
    currentUser.value = user
    localStorage.setItem('netops_user', JSON.stringify(user))
    // 记录该项目最后进入时间（用于登录页最近使用排序）
    const list = getProjects()
    const pIdx = list.findIndex(p => p.id === project.id)
    if (pIdx >= 0) {
      list[pIdx].lastLoginTime = user.loginTime
      saveProjects(list)
      projects.value = list
    }
    if (window.electronAPI) {
      // invoke 返回 Promise：同步 try/catch 捕获不到其 rejection，必须挂 .catch，
      // 否则失败会变成 unhandled rejection。
      try {
        window.electronAPI.dbSaveCurrentUser(project.id)?.catch?.((e) => console.error('保存当前项目失败', e))
      } catch (e) { console.error('保存当前项目失败', e) }
    }
    return true
  }

  // 退出（切换项目）
  function logout() {
    currentUser.value = null
    localStorage.removeItem('netops_user')
    if (window.electronAPI) {
      // 同上：Promise rejection 需 .catch 兜底
      try {
        window.electronAPI.dbSaveCurrentUser(null)?.catch?.((e) => console.error('清除当前项目失败', e))
      } catch (e) { console.error('清除当前项目失败', e) }
    }
  }

  // 切换项目（同 logout）
  function switchAccount() {
    logout()
  }

  // ============================================================
  // 账号体系（用户名 + 密码）：注册 / 登录 / 忘记密码 / 修改密码 / 退出账号
  // 账号与项目解耦：项目数据本机全局共享，账号只做访问门禁（产品评审定案）
  // ============================================================
  const initAccount = getAccountSession()
  const account = ref(initAccount)
  const isAccountLoggedIn = computed(() => !!account.value)

  // 会话恢复完成标志：App.vue 启动时异步恢复账号/项目会话；路由守卫须等待恢复完成后再判定，
  // 否则守卫会在恢复前用空状态误判（把已登录用户弹回登录页，或把直接访问的受保护路由如
  // /datacenter 误转到 /dashboard）。详见 router/index.js 的 authReady 门禁。
  const authReady = ref(false)
  let _authReadyResolve = null
  const _authReadyPromise = new Promise((resolve) => { _authReadyResolve = resolve })
  function waitAuthReady() { return _authReadyPromise }
  function markAuthReady() {
    if (!authReady.value) {
      authReady.value = true
      if (_authReadyResolve) _authReadyResolve()
    }
  }

  // 注册账号（成功即登录；返回值含一次性恢复码，由 UI 展示一次）
  async function registerAccount(payload) {
    const res = await accountStorageRegister(payload)
    if (res.success) {
      account.value = payload.username.trim()
      setAccountSession(account.value)
    }
    return res
  }

  // 账号登录
  async function loginAccount(username, password) {
    const res = await accountStorageLogin(username, password)
    if (res.success) {
      account.value = res.username
      setAccountSession(res.username)
    }
    return res
  }

  // 忘记密码 - 安全问题通道（备选）
  function getSecurityQuestion(username) {
    return accountStorageGetQuestion(username)
  }
  function resetPasswordWithAnswer(username, answer, newPassword) {
    return accountStorageReset(username, answer, newPassword)
  }
  // 忘记密码 - 恢复码通道（主通道）
  function resetPasswordWithRecovery(username, recoveryCode, newPassword) {
    return accountStorageResetRecovery(username, recoveryCode, newPassword)
  }

  // 已登录修改密码
  function changePassword(oldPassword, newPassword) {
    return accountStorageChangePassword(account.value, oldPassword, newPassword)
  }

  // 退出账号：清账号会话 + 项目会话，回到账号登录卡片
  function logoutAccount() {
    account.value = null
    setAccountSession(null)
    logout()
  }

  // App.vue 启动时校验账号会话（账户可能已被删除或数据被清）
  // sessionOverride：Electron 下主进程持久化的会话（优先于 localStorage）
  async function restoreAccountSession(sessionOverride) {
    const session = sessionOverride || getAccountSession()
    if (!session) {
      account.value = null
      setAccountSession(null)
      // 账号会话失效时同步清理项目会话，避免出现"无账号却有项目会话"的中间态
      if (currentUser.value) logout()
      return null
    }
    const valid = await validateAccountSession(session)
    if (valid) {
      account.value = valid
      setAccountSession(valid)
    } else {
      account.value = null
      setAccountSession(null)
      // 账号会话失效时同步清理项目会话，避免出现"无账号却有项目会话"的中间态
      logout()
    }
    return account.value
  }

  return {
    currentUser, isLoggedIn, projects,
    addProject, updateProject, deleteProject, selectProject, logout, switchAccount,
    account, isAccountLoggedIn, authReady, waitAuthReady, markAuthReady,
    registerAccount, loginAccount, getSecurityQuestion,
    resetPasswordWithAnswer, resetPasswordWithRecovery, changePassword,
    logoutAccount, restoreAccountSession
  }
})

// 设备数据 Store
export const useDeviceStore = defineStore('devices', () => {
  const authStore = useAuthStore()

  const devices = ref([])
  const loading = ref(false)

  // 从数据库加载设备
  async function loadDevices() {
    const username = authStore.currentUser?.username || 'default'

    loading.value = true
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.dbDeviceFindAll()
        if (!result || !result.success) {
          // 后端 handler 以 { success:false, error } resolve（不是 reject），必须显式判定，
          // 否则失败时 result.data 为 undefined，会把设备列表静默清空
          console.error('[DeviceStore] 从数据库加载设备失败:', result?.error || '未知错误')
        } else {
          devices.value = result.data || []
          console.log('[DeviceStore] 从数据库加载设备:', devices.value.length, '条')
        }
      } else {
        const key = `netops_devices_${username}`
        const projectData = localStorage.getItem(key)
        if (projectData) {
          devices.value = JSON.parse(projectData)
        } else {
          devices.value = JSON.parse(localStorage.getItem('netops_devices_default') || '[]')
        }
      }
    } catch (e) {
      console.error('[DeviceStore] 加载设备失败', e)
      devices.value = []
    } finally {
      loading.value = false
    }
  }

  // 保存设备到数据库
  async function saveDeviceToDB(device, operation = 'create') {
    if (!window.electronAPI) {
      // Web环境使用localStorage
      const username = authStore.currentUser?.username || 'default'
      const key = `netops_devices_${username}`
      localStorage.setItem(key, JSON.stringify(devices.value))
      return { success: true }
    }

    try {
      let result = null
      if (operation === 'create') {
        result = await window.electronAPI.dbDeviceCreate(device)
      } else if (operation === 'update') {
        result = await window.electronAPI.dbDeviceUpdate(device.id, device)
      } else if (operation === 'delete') {
        result = await window.electronAPI.dbDeviceDelete(device.id)
      }
      // 后端 handler 以 { success:false, error } resolve（不是 reject），必须显式判定，
      // 否则调用方拿到 undefined 后会引发次生错误
      if (!result || !result.success) {
        console.error('[DeviceStore] 保存设备到数据库失败:', result?.error || `未知操作 ${operation}`)
        return { success: false, error: result?.error || `未知操作 ${operation}` }
      }
      return result
    } catch (e) {
      console.error('[DeviceStore] 保存设备到数据库失败', e)
      return { success: false, error: e.message }
    }
  }

  function addDevice(device) {
    const d = {
      ...device,
      id: device.id || Date.now().toString(),
      createdAt: new Date().toISOString(),
      status: device.status || 'offline'
    }
    devices.value.push(d)
    saveDeviceToDB(d, 'create')
    return d
  }

  function updateDevice(id, data) {
    const idx = devices.value.findIndex(d => d.id === id)
    if (idx >= 0) {
      devices.value[idx] = { ...devices.value[idx], ...data, updatedAt: new Date().toISOString() }
      saveDeviceToDB(devices.value[idx], 'update')
    }
  }

  async function deleteDevice(id) {
    // 清理端口连接状态
    try {
      const ps = usePortStateStore()
      if (ps && typeof ps.cleanupDevice === 'function') {
        ps.cleanupDevice(id)
      }
    } catch(e) { console.error('清理端口状态失败', e) }

    // 从设备列表中删除
    devices.value = devices.value.filter(d => d.id !== id)
    await saveDeviceToDB({ id }, 'delete')
  }

  async function importDevices(list) {
    // 追加模式：不覆盖已有设备，只添加新设备（按 IP 去重）
    // 加密收敛点：所有导入路径（DevicesView 与侧边栏 AppLayout）统一在此加密敏感凭据，
    // 避免各调用方自行决定是否加密导致分叉（历史缺陷：AppLayout 导入不加密、DevicesView
    // 预先加密，两条路径不一致）。encryptDeviceSecrets 幂等（已加密字段跳过），
    // 故 DevicesView 预先加密过的设备再经过此处不会二次加密。
    for (const d of list) {
      const exist = devices.value.find(ex => ex.ip === d.ip)
      if (!exist) {
        const safe = await encryptDeviceSecrets(d)
        const newDevice = { ...safe, id: safe.id || Date.now().toString() + Math.random() }
        devices.value.push(newDevice)
        saveDeviceToDB(newDevice, 'create')
      }
    }
  }

  // 批量添加（不覆盖）
  function mergeDevices(list) {
    list.forEach(d => {
      const existIdx = devices.value.findIndex(ex => ex.ip === d.ip)
      if (existIdx >= 0) {
        devices.value[existIdx] = { ...devices.value[existIdx], ...d, updatedAt: new Date().toISOString() }
        saveDeviceToDB(devices.value[existIdx], 'update')
      } else {
        const newDevice = { ...d, id: d.id || Date.now().toString() + Math.random() }
        devices.value.push(newDevice)
        saveDeviceToDB(newDevice, 'create')
      }
    })
  }

  const online = computed(() => devices.value.filter(d => d.status === 'online'))
  const offline = computed(() => devices.value.filter(d => d.status === 'offline'))
  const onlineRate = computed(() => {
    if (!devices.value.length) return 0
    return ((online.value.length / devices.value.length) * 100).toFixed(1)
  })

  // 模拟部分设备在线
  function simulateStatus() {
    devices.value.forEach(d => {
      if (Math.random() > 0.3) d.status = 'online'
      else d.status = 'offline'
    })
    // 批量更新状态
    devices.value.forEach(d => saveDeviceToDB(d, 'update'))
  }

  // 设置单个设备在线/离线状态
  function setDeviceStatus(id, status) {
    const idx = devices.value.findIndex(d => d.id === id)
    if (idx >= 0) {
      devices.value[idx].status = status
      devices.value[idx].lastChecked = new Date().toISOString()
      saveDeviceToDB(devices.value[idx], 'update')
    }
  }

  // 批量设置设备状态
  async function batchSetStatus(statusMap) {
    const updates = []
    for (const [id, status] of Object.entries(statusMap)) {
      const idx = devices.value.findIndex(d => d.id === id)
      if (idx >= 0) {
        devices.value[idx].status = status
        devices.value[idx].lastChecked = new Date().toISOString()
        updates.push(saveDeviceToDB(devices.value[idx], 'update'))
      }
    }
    // 并行执行所有更新
    await Promise.all(updates)
  }

  // 导出所有数据为JSON
  function exportAll() {
    return {
      version: '1.0',
      exportTime: new Date().toISOString(),
      devices: devices.value
    }
  }

  // 从JSON导入
  async function importAll(data) {
    if (data?.devices) {
      devices.value = data.devices
      // 批量保存到数据库
      for (const device of devices.value) {
        await saveDeviceToDB(device, 'create')
      }
    }
  }

  // 清除所有数据
  async function clearAll() {
    // 从数据库删除所有设备
    for (const device of devices.value) {
      await saveDeviceToDB({ id: device.id }, 'delete')
    }
    devices.value = []
  }

  // 重新加载数据（登录后调用）
  async function reload() {
    await loadDevices()
  }

  // 获取当前用户的 localStorage key（供 App.vue 回退加载使用）
  function getStorageKey() {
    const username = authStore.currentUser?.username || 'default'
    return `netops_devices_${username}`
  }

  // 全量保存（供窗口关闭前自动保存使用；Electron 下批量写 DB，Web 下写 localStorage）
  async function save() {
    if (!window.electronAPI) {
      localStorage.setItem(getStorageKey(), JSON.stringify(devices.value))
      return { success: true }
    }
    try {
      const ops = devices.value.map(d => saveDeviceToDB(d, 'update'))
      await Promise.all(ops)
      return { success: true }
    } catch (e) {
      console.error('[DeviceStore] 批量保存失败', e)
      return { success: false, error: e.message }
    }
  }

  return {
    devices,
    loading,
    online,
    offline,
    onlineRate,
    addDevice,
    updateDevice,
    deleteDevice,
    importDevices,
    mergeDevices,
    simulateStatus,
    setDeviceStatus,
    batchSetStatus,
    exportAll,
    importAll,
    clearAll,
    reload,
    loadDevices,
    getStorageKey,
    save,
    // 兼容别名：portState.js 等旧代码调用 deviceStore.saveDevices()
    saveDevices: save
  }
})

// 机柜 Store
export const useCabinetStore = defineStore('cabinets', () => {
  const authStore = useAuthStore()

  const cabinets = ref([])
  const loading = ref(false)

  // 从数据库加载机柜
  async function loadCabinets() {
    loading.value = true
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.dbCabinetFindAll()
        if (!result || !result.success) {
          // 后端 handler 以 { success:false, error } resolve（不是 reject），必须显式判定，
          // 否则失败时 result.data 为 undefined，会把机柜列表静默清空
          console.error('[CabinetStore] 从数据库加载机柜失败:', result?.error || '未知错误')
        } else {
          cabinets.value = result.data || []
          console.log('[CabinetStore] 从数据库加载机柜:', cabinets.value.length, '条')
        }
      } else {
        // Web环境降级到localStorage
        const username = authStore.currentUser?.username || 'default'
        const key = `netops_cabinets_${username}`
        cabinets.value = JSON.parse(localStorage.getItem(key) || '[]')
      }
    } catch (e) {
      console.error('[CabinetStore] 加载机柜失败', e)
      cabinets.value = []
    } finally {
      loading.value = false
    }
  }

  // 保存机柜到数据库
  async function saveCabinetToDB(cabinet, operation = 'create') {
    if (!window.electronAPI) {
      // Web环境使用localStorage
      const username = authStore.currentUser?.username || 'default'
      const key = `netops_cabinets_${username}`
      localStorage.setItem(key, JSON.stringify(cabinets.value))
      return { success: true }
    }

    try {
      let result = null
      if (operation === 'create') {
        result = await window.electronAPI.dbCabinetCreate(cabinet)
      } else if (operation === 'update') {
        result = await window.electronAPI.dbCabinetUpdate(cabinet.id, cabinet)
      } else if (operation === 'delete') {
        result = await window.electronAPI.dbCabinetDelete(cabinet.id)
      }
      // 后端 handler 以 { success:false, error } resolve（不是 reject），必须显式判定，
      // 否则调用方拿到 undefined 后会引发次生错误
      if (!result || !result.success) {
        console.error('[CabinetStore] 保存机柜到数据库失败:', result?.error || `未知操作 ${operation}`)
        return { success: false, error: result?.error || `未知操作 ${operation}` }
      }
      return result
    } catch (e) {
      console.error('[CabinetStore] 保存机柜到数据库失败', e)
      return { success: false, error: e.message }
    }
  }

  function addCabinet(cabinet) {
    const c = {
      ...cabinet,
      id: cabinet.id || Date.now().toString(),
      createdAt: new Date().toISOString(),
      slots: cabinet.slots || {},
      patchItems: cabinet.patchItems || []
    }
    cabinets.value.push(c)
    saveCabinetToDB(c, 'create')
    return c
  }

  function updateCabinet(id, data) {
    const idx = cabinets.value.findIndex(c => c.id === id)
    if (idx >= 0) {
      cabinets.value[idx] = { ...cabinets.value[idx], ...data, updatedAt: new Date().toISOString() }
      saveCabinetToDB(cabinets.value[idx], 'update')
    }
  }

  async function deleteCabinet(id) {
    cabinets.value = cabinets.value.filter(c => c.id !== id)
    await saveCabinetToDB({ id }, 'delete')
  }

  function exportAll() {
    return { cabinets: cabinets.value }
  }

  async function importAll(data) {
    if (data?.cabinets) {
      cabinets.value = data.cabinets
      // 批量保存到数据库
      for (const cabinet of cabinets.value) {
        await saveCabinetToDB(cabinet, 'create')
      }
    }
  }

  async function reload() {
    await loadCabinets()
  }

  // 获取机柜内的设备
  async function getCabinetDevices(cabinetId) {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.dbCabinetGetDevices(cabinetId)
        if (!result || !result.success) {
          // 后端 handler 以 { success:false, error } resolve（不是 reject），必须显式判定
          console.error('[CabinetStore] 获取机柜设备失败:', result?.error || '未知错误')
        } else {
          return result.data || []
        }
      }
    } catch (e) {
      console.error('[CabinetStore] 获取机柜设备失败', e)
    }
    return []
  }

  // 获取当前用户的 localStorage key（供 App.vue 回退加载使用）
  function getStorageKey() {
    const username = authStore.currentUser?.username || 'default'
    return `netops_cabinets_${username}`
  }

  // 全量保存（供窗口关闭前自动保存使用；Electron 下批量写 DB，Web 下写 localStorage）
  async function save() {
    if (!window.electronAPI) {
      localStorage.setItem(getStorageKey(), JSON.stringify(cabinets.value))
      return { success: true }
    }
    try {
      const ops = cabinets.value.map(c => saveCabinetToDB(c, 'update'))
      await Promise.all(ops)
      return { success: true }
    } catch (e) {
      console.error('[CabinetStore] 批量保存失败', e)
      return { success: false, error: e.message }
    }
  }

  return {
    cabinets,
    loading,
    addCabinet,
    updateCabinet,
    deleteCabinet,
    exportAll,
    importAll,
    reload,
    loadCabinets,
    getCabinetDevices,
    getStorageKey,
    save
  }
})


// 设备库 Store（从型号目录自动生成 + 自定义型号）
const builtinModels = [
  // 常用内置型号（供设备管理下拉选择）
  { id: 'builtin_huawei_s5720', name: 'S5720-28TP-PWR-SI', vendor: '华为', type: 'switch', uSize: 1, ethernetPorts: 24, sfpPorts: 4, sfpType: ['1g'], poeType: 'poe+', maxPower: 370, isCustom: false },
  { id: 'builtin_huawei_s5735', name: 'S5735-S24T4X-A', vendor: '华为', type: 'switch', uSize: 1, ethernetPorts: 24, sfpPorts: 4, sfpType: ['1g','10g'], isCustom: false },
  { id: 'builtin_huawei_ar6140', name: 'AR6140-16G4XG', vendor: '华为', type: 'router', uSize: 1, ethernetPorts: 16, sfpPorts: 4, sfpType: ['1g','10g'], isCustom: false },
  { id: 'builtin_huawei_usg6525', name: 'USG6525E', vendor: '华为', type: 'firewall', uSize: 1, ethernetPorts: 8, sfpPorts: 0, isCustom: false },
  { id: 'builtin_cisco_c2960x', name: 'Catalyst 2960X-24TD-L', vendor: '思科', type: 'switch', uSize: 1, ethernetPorts: 24, sfpPorts: 4, sfpType: ['1g'], isCustom: false },
  { id: 'builtin_cisco_c3850', name: 'Catalyst 3850-24T', vendor: '思科', type: 'switch', uSize: 1, ethernetPorts: 24, sfpPorts: 4, sfpType: ['1g'], isCustom: false },
  { id: 'builtin_cisco_isr4331', name: 'ISR 4331', vendor: '思科', type: 'router', uSize: 1, ethernetPorts: 8, sfpPorts: 2, sfpType: ['1g'], isCustom: false },
  { id: 'builtin_h3c_s5130', name: 'S5130S-28P-EI', vendor: '华三', type: 'switch', uSize: 1, ethernetPorts: 24, sfpPorts: 4, sfpType: ['1g'], poeType: 'poe+', maxPower: 370, isCustom: false },
  { id: 'builtin_ruijie_s2910', name: 'RG-S2910-24GT4XS-P', vendor: '锐捷', type: 'switch', uSize: 1, ethernetPorts: 24, sfpPorts: 4, sfpType: ['1g','10g'], poeType: 'poe+', maxPower: 370, isCustom: false },

  // ==================== 1U / 2U / 3U 统一规格交换机 ====================
  // 华为交换机
  { id: 'builtin_huawei_ce6850', name: 'CE6850-48S4Q-EI', vendor: '华为(HUAWEI)', type: 'switch', uSize: 2, ethernetPorts: 48, sfpPorts: 4, sfpType: ['10g','40g'], maxPower: 520, isCustom: false },
  { id: 'builtin_huawei_ce6880', name: 'CE6880-48T4Q-EI', vendor: '华为(HUAWEI)', type: 'switch', uSize: 3, ethernetPorts: 48, sfpPorts: 4, sfpType: ['40g'], maxPower: 800, isCustom: false },
  // 华三交换机
  { id: 'builtin_h3c_s6825', name: 'S6825-56HF', vendor: '华三(H3C)', type: 'switch', uSize: 2, ethernetPorts: 48, sfpPorts: 8, sfpType: ['25g','100g'], maxPower: 480, isCustom: false },
  { id: 'builtin_h3c_s12500x', name: 'S12500X-AF', vendor: '华三(H3C)', type: 'switch', uSize: 3, ethernetPorts: 48, sfpPorts: 8, sfpType: ['100g'], maxPower: 1200, isCustom: false },
  // 思科交换机
  { id: 'builtin_cisco_c9500', name: 'Catalyst 9500-48Y4C', vendor: '思科(Cisco)', type: 'switch', uSize: 2, ethernetPorts: 48, sfpPorts: 4, sfpType: ['10g','40g'], maxPower: 800, isCustom: false },
  { id: 'builtin_cisco_c9600', name: 'Catalyst 9600-40XS', vendor: '思科(Cisco)', type: 'switch', uSize: 3, ethernetPorts: 40, sfpPorts: 8, sfpType: ['100g'], maxPower: 1300, isCustom: false },
  // 锐捷交换机
  { id: 'builtin_ruijie_s6510', name: 'RG-S6510-48GC8XG', vendor: '锐捷(Ruijie)', type: 'switch', uSize: 2, ethernetPorts: 48, sfpPorts: 8, sfpType: ['10g','40g'], maxPower: 500, isCustom: false },
  { id: 'builtin_ruijie_n1800', name: 'RG-N18010-X', vendor: '锐捷(Ruijie)', type: 'switch', uSize: 3, ethernetPorts: 48, sfpPorts: 8, sfpType: ['40g','100g'], maxPower: 1500, isCustom: false },

  // ==================== 1U / 2U / 3U 统一规格路由器 ====================
  { id: 'builtin_huawei_ar6280', name: 'AR6280', vendor: '华为(HUAWEI)', type: 'router', uSize: 1, ethernetPorts: 8, sfpPorts: 4, sfpType: ['1g','10g'], maxPower: 120, isCustom: false },
  { id: 'builtin_huawei_ne40e', name: 'NE40E-X8', vendor: '华为(HUAWEI)', type: 'router', uSize: 2, ethernetPorts: 8, sfpPorts: 16, sfpType: ['10g','100g'], maxPower: 1500, isCustom: false },
  { id: 'builtin_huawei_ne80e', name: 'NE80E-X3', vendor: '华为(HUAWEI)', type: 'router', uSize: 3, ethernetPorts: 8, sfpPorts: 32, sfpType: ['100g'], maxPower: 2500, isCustom: false },
  { id: 'builtin_h3c_msr5660', name: 'MSR5660', vendor: '华三(H3C)', type: 'router', uSize: 1, ethernetPorts: 8, sfpPorts: 4, sfpType: ['1g','10g'], maxPower: 150, isCustom: false },
  { id: 'builtin_h3c_msr5620', name: 'MSR5620', vendor: '华三(H3C)', type: 'router', uSize: 2, ethernetPorts: 8, sfpPorts: 16, sfpType: ['10g','100g'], maxPower: 900, isCustom: false },
  { id: 'builtin_h3c_cr16010', name: 'CR16010-F', vendor: '华三(H3C)', type: 'router', uSize: 3, ethernetPorts: 8, sfpPorts: 32, sfpType: ['100g'], maxPower: 2000, isCustom: false },
  { id: 'builtin_cisco_asr1000', name: 'ASR 1000-X', vendor: '思科(Cisco)', type: 'router', uSize: 1, ethernetPorts: 8, sfpPorts: 2, sfpType: ['1g'], maxPower: 250, isCustom: false },
  { id: 'builtin_cisco_asr9000', name: 'ASR 9000', vendor: '思科(Cisco)', type: 'router', uSize: 2, ethernetPorts: 8, sfpPorts: 24, sfpType: ['10g','100g'], maxPower: 2000, isCustom: false },
  { id: 'builtin_cisco_crs', name: 'CRS-X', vendor: '思科(Cisco)', type: 'router', uSize: 3, ethernetPorts: 8, sfpPorts: 48, sfpType: ['100g'], maxPower: 3500, isCustom: false },
  { id: 'builtin_ruijie_rsr620', name: 'RG-RSR620-32X', vendor: '锐捷(Ruijie)', type: 'router', uSize: 1, ethernetPorts: 8, sfpPorts: 4, sfpType: ['1g','10g'], maxPower: 150, isCustom: false },
  { id: 'builtin_ruijie_rsr50', name: 'RG-RSR50-24X', vendor: '锐捷(Ruijie)', type: 'router', uSize: 2, ethernetPorts: 8, sfpPorts: 16, sfpType: ['10g','100g'], maxPower: 800, isCustom: false },
  { id: 'builtin_ruijie_rsr7708', name: 'RG-RSR7708-X', vendor: '锐捷(Ruijie)', type: 'router', uSize: 3, ethernetPorts: 8, sfpPorts: 32, sfpType: ['100g'], maxPower: 2200, isCustom: false },

  // ==================== 1U / 2U / 3U 统一规格防火墙 ====================
  { id: 'builtin_huawei_usg6630', name: 'USG6630E', vendor: '华为(HUAWEI)', type: 'firewall', uSize: 2, ethernetPorts: 16, sfpPorts: 4, sfpType: ['1g','10g'], maxPower: 400, isCustom: false },
  { id: 'builtin_huawei_usg9500', name: 'USG9500', vendor: '华为(HUAWEI)', type: 'firewall', uSize: 3, ethernetPorts: 16, sfpPorts: 16, sfpType: ['10g','100g'], maxPower: 1200, isCustom: false },
  { id: 'builtin_h3c_f1000', name: 'SecPath F1000-AI-25', vendor: '华三(H3C)', type: 'firewall', uSize: 2, ethernetPorts: 16, sfpPorts: 4, sfpType: ['1g','10g'], maxPower: 350, isCustom: false },
  { id: 'builtin_h3c_t9000', name: 'SecPath T9000', vendor: '华三(H3C)', type: 'firewall', uSize: 3, ethernetPorts: 16, sfpPorts: 16, sfpType: ['10g','100g'], maxPower: 1500, isCustom: false },
  { id: 'builtin_cisco_asa5545', name: 'ASA 5545-X', vendor: '思科(Cisco)', type: 'firewall', uSize: 2, ethernetPorts: 8, sfpPorts: 4, sfpType: ['1g','10g'], maxPower: 300, isCustom: false },
  { id: 'builtin_cisco_fp9300', name: 'Firepower 9300', vendor: '思科(Cisco)', type: 'firewall', uSize: 3, ethernetPorts: 16, sfpPorts: 12, sfpType: ['10g','100g'], maxPower: 1600, isCustom: false },
  { id: 'builtin_ruijie_wall1800', name: 'RG-WALL 1800-X', vendor: '锐捷(Ruijie)', type: 'firewall', uSize: 2, ethernetPorts: 16, sfpPorts: 4, sfpType: ['1g','10g'], maxPower: 350, isCustom: false },
  { id: 'builtin_ruijie_wall1600', name: 'RG-WALL 1600-X', vendor: '锐捷(Ruijie)', type: 'firewall', uSize: 3, ethernetPorts: 16, sfpPorts: 16, sfpType: ['10g','100g'], maxPower: 1100, isCustom: false },
]

// ===== 海康/大华厂商真实面板型号（内置，与 src/assets/panels/vendor/manifest.json 对应；
// 设备上架渲染时按型号匹配真实面板图；内置保证浏览器/Electron/打包版均生效）=====
const vendorPanelModels = [
  { id: 'vendorpanel_hikvision_1', name: "Hikvision", vendor: '海康威视', type: 'other', uSize: 2, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_2', name: "vision", vendor: '海康威视', type: 'other', uSize: 5, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_3', name: "2盘位", vendor: '海康威视', type: 'server', uSize: 1, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_4', name: "4U高-型号未知后续补充", vendor: '海康威视', type: 'other', uSize: 4, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_5', name: "DS-VE22S-B", vendor: '海康威视', type: 'server', uSize: 2, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_6', name: "HIKVISION 10路", vendor: '海康威视', type: 'nvr', uSize: 2, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_7', name: "海康 16路", vendor: '海康威视', type: 'nvr', uSize: 2, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_8', name: "硬盘录像机", vendor: '海康威视', type: 'nvr', uSize: 1, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_9', name: "IVMS-3000C", vendor: '海康威视', type: 'server', uSize: 4, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_10', name: "DS-A72036RH-LCVS", vendor: '海康威视', type: 'server', uSize: 4, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_11', name: "DS-VE22S-B（2）", vendor: '海康威视', type: 'server', uSize: 1, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_12', name: "DS-6104HC-SATA", vendor: '海康威视', type: 'other', uSize: 2, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_13', name: "DS-A908RE-B", vendor: '海康威视', type: 'server', uSize: 3, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_14', name: "CCTV video recorder", vendor: '海康威视', type: 'nvr', uSize: 1, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_15', name: "DS-3E0326P-S", vendor: '海康威视', type: 'switch', uSize: 1, ethernetPorts: 24, sfpPorts: 4, isCustom: false },
  { id: 'vendorpanel_hikvision_16', name: "DS-VM21S-B", vendor: '海康威视', type: 'server', uSize: 2, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_17', name: "DS-3E3728-H", vendor: '海康威视', type: 'switch', uSize: 1, ethernetPorts: 24, sfpPorts: 4, isCustom: false },
  { id: 'vendorpanel_hikvision_18', name: "DS-96128N-I24", vendor: '海康威视', type: 'other', uSize: 4, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_19', name: "海康威视HIKVISION", vendor: '海康威视', type: 'other', uSize: 1, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_20', name: "海康智能存储DS-96016NX", vendor: '海康威视', type: 'server', uSize: 4, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_21', name: "DS-VE2S-XB", vendor: '海康威视', type: 'server', uSize: 2, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_22', name: "HIKVISION-DS-A71072R", vendor: '海康威视', type: 'server', uSize: 8, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_23', name: "HIKVISION-1", vendor: '海康威视', type: 'other', uSize: 3, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_24', name: "HIKVISION-2", vendor: '海康威视', type: 'other', uSize: 1, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_25', name: "DS-A82048D", vendor: '海康威视', type: 'server', uSize: 4, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_26', name: "DS-CD22D-BHW6PP", vendor: '海康威视', type: 'other', uSize: 2, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_27', name: "DS-IE1064-03UBA", vendor: '海康威视', type: 'other', uSize: 1, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_28', name: "DS-IX2003-A3UX", vendor: '海康威视', type: 'other', uSize: 2, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_29', name: "海康24硬盘位录像机", vendor: '海康威视', type: 'server', uSize: 4, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_30', name: "海康录像机", vendor: '海康威视', type: 'nvr', uSize: 2, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_31', name: "海康威视录像机", vendor: '海康威视', type: 'nvr', uSize: 4, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_32', name: "海康威视NVR网络录像机", vendor: '海康威视', type: 'nvr', uSize: 1, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_33', name: "海康威视超脑硬盘录像机", vendor: '海康威视', type: 'nvr', uSize: 2, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_34', name: "DS-9632NI-M8R", vendor: '海康威视', type: 'other', uSize: 2, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_35', name: "Hikvision DS-3T1510HP V2", vendor: '海康威视', type: 'other', uSize: 1, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_36', name: "DS-A82048D（8U）", vendor: '海康威视', type: 'server', uSize: 8, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_37', name: "海康威视", vendor: '海康威视', type: 'other', uSize: 2, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_38', name: "海康威视-视频上云流媒体服务器", vendor: '海康威视', type: 'server', uSize: 2, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_39', name: "HIKVISION硬盘录像机", vendor: '海康威视', type: 'nvr', uSize: 2, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_40', name: "海康硬盘录像机", vendor: '海康威视', type: 'nvr', uSize: 1, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_hikvision_41', name: "海康 DS-3E3728-HL", vendor: '海康威视', type: 'switch', uSize: 1, ethernetPorts: 24, sfpPorts: 4, isCustom: false },
  { id: 'vendorpanel_dahua_42', name: "16盘位", vendor: '大华', type: 'server', uSize: 3, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_dahua_43', name: "DH-DSS-H8900S3", vendor: '大华', type: 'server', uSize: 1, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_dahua_44', name: "DH-EVS5024S-R", vendor: '大华', type: 'server', uSize: 4, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_dahua_45', name: "大华硬盘录像机", vendor: '大华', type: 'nvr', uSize: 2, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_dahua_46', name: "大华 磁盘阵列", vendor: '大华', type: 'server', uSize: 6, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_dahua_47', name: "系统服务器", vendor: '大华', type: 'other', uSize: 3, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_dahua_48', name: "高清解码器", vendor: '大华', type: 'monitor', uSize: 2, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_dahua_49', name: "全程监控推流网关", vendor: '大华', type: 'monitor', uSize: 3, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_dahua_50', name: "大华服务器 云存储服务器", vendor: '大华', type: 'server', uSize: 2, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_dahua_51', name: "大华 DH-DTP-9110D-B", vendor: '大华', type: 'other', uSize: 1, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_dahua_52', name: "DH-CSS8148S-10GIR", vendor: '大华', type: 'server', uSize: 6, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_dahua_53', name: "大华录像机", vendor: '大华', type: 'nvr', uSize: 3, ethernetPorts: 0, sfpPorts: 0, isCustom: false },
  { id: 'vendorpanel_dahua_54', name: "DH-S6600-24XF2QF-A", vendor: '大华', type: 'switch', uSize: 1, ethernetPorts: 24, sfpPorts: 4, isCustom: false },
]

export const useDeviceLibStore = defineStore('deviceLib', () => {
  function generateModelsFromCatalog() {
    const result = []
    const existingSet = new Set(builtinModels.map(m => `${m.vendor}|${m.name}|${m.type}`))
    let autoIdx = 0
    for (const [vendor, typeMap] of Object.entries(deviceModels)) {
      for (const [type, modelNames] of Object.entries(typeMap)) {
        modelNames.forEach(name => {
          const key = `${vendor}|${name}|${type}`
          if (existingSet.has(key)) return
          const upper = name.toUpperCase()
          let ethernetPorts = 8, sfpPorts = 0, sfpType = undefined
          if (/48[TPF]/.test(upper)) { ethernetPorts = 48; sfpPorts = 4; sfpType = ['1g'] }
          else if (/48S/.test(upper)) { ethernetPorts = 0; sfpPorts = 48; sfpType = ['1g'] }
          else if (/32[CT]/.test(upper)) { ethernetPorts = 32; sfpPorts = 4; sfpType = ['1g'] }
          else if (/28[TP]/.test(upper)) { ethernetPorts = 24; sfpPorts = 4; sfpType = ['1g'] }
          else if (/24[TPG]/.test(upper)) { ethernetPorts = 24; sfpPorts = 4; sfpType = ['1g'] }
          else if (/24S/.test(upper)) { ethernetPorts = 0; sfpPorts = 24; sfpType = ['1g'] }
          else if (/16[TG]/.test(upper)) { ethernetPorts = 16; sfpPorts = 2; sfpType = ['1g'] }
          else if (/12[TP]/.test(upper)) { ethernetPorts = 12; sfpPorts = 2; sfpType = ['1g'] }
          else if (/8[TP]/.test(upper)) { ethernetPorts = 8; sfpPorts = 0 }
          else if (/8S/.test(upper)) { ethernetPorts = 0; sfpPorts = 8 }
          else if (/5[TPD]/.test(upper)) { ethernetPorts = 5; sfpPorts = 0 }
          else if (/2[TP]/.test(upper)) { ethernetPorts = 2; sfpPorts = 0 }
          else if (/4[TP]/.test(upper)) { ethernetPorts = 4; sfpPorts = 0 }
          else if (/1[TP]/.test(upper)) { ethernetPorts = 1; sfpPorts = 0 }
          else if (type === 'switch') { ethernetPorts = 24; sfpPorts = 4; sfpType = ['1g'] }
          else if (type === 'router') { ethernetPorts = 8; sfpPorts = 2; sfpType = ['1g'] }
          else if (type === 'firewall') { ethernetPorts = 8; sfpPorts = 0 }
          const isPoE = /poe|HPWR|PWR|UPOE/i.test(name)
          let uSize = 1
          if (type === 'server') uSize = 2
          if (type === 'ups') uSize = 3
          if (type === 'storage') uSize = 3
          autoIdx++
          result.push({
            id: `auto_${autoIdx}`, name, vendor, type, uSize,
            ethernetPorts, sfpPorts,
            ...(sfpType ? { sfpType } : {}),
            ...(isPoE ? { poeType: 'poe+', maxPower: ethernetPorts >= 24 ? 450 : 370 } : {}),
            remark: '', isCustom: false
          })
        })
      }
    }
    return result
  }

  const autoModels = generateModelsFromCatalog()
  const customModels = JSON.parse(localStorage.getItem('netops_device_lib_custom') || '[]')
  const models = ref([...builtinModels, ...vendorPanelModels, ...autoModels, ...customModels])

  function save() {
    const customOnly = models.value.filter(m => m.isCustom)
    localStorage.setItem('netops_device_lib_custom', JSON.stringify(customOnly))
  }

  function addModel(model) {
    models.value.push({ ...model, isCustom: true })
    save()
  }

  function updateModel(id, data) {
    const idx = models.value.findIndex(m => m.id === id)
    if (idx >= 0) { models.value[idx] = { ...models.value[idx], ...data, isCustom: true }; save() }
  }

  function deleteModel(id) {
    models.value = models.value.filter(m => m.id !== id)
    save()
  }

  function getModelsByVendor(vendor) {
    return models.value.filter(m => m.vendor === vendor)
  }

  function getModelsByType(type) {
    return models.value.filter(m => m.type === type)
  }

  function getBuiltinModels() {
    return [...builtinModels, ...vendorPanelModels, ...autoModels]
  }

  return { models, addModel, updateModel, deleteModel, getModelsByVendor, getModelsByType, getBuiltinModels }
})
