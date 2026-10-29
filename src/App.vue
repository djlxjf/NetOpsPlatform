<template>
  <AppLayout v-if="shouldShowLayout" />
  <router-view v-else />
</template>

<script setup>
import { onMounted, onUnmounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import router from './router'
import AppLayout from './components/AppLayout.vue'
import { startDeviceStatusMonitor, stopDeviceStatusMonitor } from './composables/useDeviceStatus'
import logger from './utils/logger'
import { useAuthStore, useDeviceStore, useCabinetStore } from './stores'
import { usePortStateStore } from './stores/portState'
// 安全审计 F-007：历史明文凭据迁移
import { migrateLegacyCredentials } from './utils/credentialCrypto'

const route = useRoute()
const authStore = useAuthStore()
const deviceStore = useDeviceStore()
const cabinetStore = useCabinetStore()
const portStateStore = usePortStateStore()

// 登录页始终不显示侧边栏布局，即使已登录（切换项目场景）
const shouldShowLayout = computed(() => {
  return authStore.isLoggedIn && route.path !== '/login'
})

// 从 localStorage 加载数据（降级方案）
function loadFromLocalStorage() {
  try {
    // 使用 store 提供的 getStorageKey() 获取正确 key；空值时不覆盖已有数据，避免清空
    const dKey = deviceStore.getStorageKey()
    const savedDevices = localStorage.getItem(dKey)
    if (savedDevices) {
      deviceStore.devices = JSON.parse(savedDevices)
    } else {
      const legacy = localStorage.getItem('netops_devices_default')
      if (legacy) deviceStore.devices = JSON.parse(legacy)
    }

    const cKey = cabinetStore.getStorageKey()
    const savedCabinets = localStorage.getItem(cKey)
    if (savedCabinets) {
      cabinetStore.cabinets = JSON.parse(savedCabinets)
    }
  } catch (e) {
    logger.error('从 localStorage 加载数据失败', e)
  }
}

onMounted(async () => {
  // Electron 环境：始终从数据库恢复登录状态（不依赖 localStorage）
  if (window.electronAPI) {
    try {
      // ① 账号会话恢复：优先主进程持久化（dbCache.currentAccount），localStorage 兜底，
      //    并校验账号仍然存在（幽灵会话作废，产品评审 P0-2）
      let accountSession = null
      if (window.electronAPI.authLoadSession) {
        try {
          const sessRes = await window.electronAPI.authLoadSession()
          if (sessRes?.success && sessRes.username) accountSession = sessRes.username
        } catch (e) { /* 主进程不可用时走 localStorage */ }
      }
      if (!accountSession) {
        accountSession = localStorage.getItem('netops_account')
      }
      // ② 项目会话恢复（原有逻辑）
      const result = await window.electronAPI.dbLoadCurrentUser()
      if (result?.success && result?.user?.username) {
        authStore.currentUser = result.user
        localStorage.setItem('netops_user', JSON.stringify(result.user))
        logger.info('已从数据库恢复登录状态:', result.user.username)
      } else {
        authStore.currentUser = null
        localStorage.removeItem('netops_user')
        logger.info('无保存的登录状态，显示登录界面')
      }
      // ③ 校验账号会话有效性（内部会在失效时同步清理项目会话，避免中间态）
      const validAccount = await authStore.restoreAccountSession(accountSession)
      if (!validAccount && authStore.isLoggedIn) {
        // 账号会话失效但项目会话残留：强制清项目会话，回到账号登录卡片
        authStore.logout()
        logger.info('账号会话已失效，项目会话同步清除')
      } else if (validAccount) {
        logger.info('已恢复账号会话:', validAccount)
      }
      if (!validAccount) {
        redirectIfAuthedRoute()
      }
    } catch (e) {
      logger.error('恢复登录状态失败', e)
      authStore.currentUser = null
      localStorage.removeItem('netops_user')
      authStore.logoutAccount()
    } finally {
      // 无论恢复成功/失败/异常，都标记会话判定完成，解除路由守卫的 authReady 门禁
      authStore.markAuthReady()
    }
  } else {
    // Web 环境：同样校验账号会话有效性（账户可能被清）
    try {
      const validAccount = await authStore.restoreAccountSession()
      if (!validAccount) {
        redirectIfAuthedRoute()
      } else {
        logger.info('已恢复账号会话:', validAccount)
      }
    } catch (e) {
      logger.error('Web 环境账号会话校验失败', e)
    } finally {
      // 无论恢复成功/失败/异常，都标记会话判定完成，解除路由守卫的 authReady 门禁
      authStore.markAuthReady()
    }
  }

  // 账号会话失效时，若当前停留在受保护路由（如 #/dashboard），强制回登录卡片
  function redirectIfAuthedRoute() {
    if (router.currentRoute.value.meta.requiresAuth !== false) {
      router.replace('/login')
    }
  }

  // 监听窗口关闭前事件，自动保存所有数据（不弹窗）
  if (window.electronAPI) {
    window.electronAPI.onBeforeClose(async () => {
      logger.info('收到 before-close，开始自动保存数据...')
      try {
        await deviceStore.save()
        await cabinetStore.save()
        portStateStore.save()
        // 强制刷新数据库到磁盘
        if (window.electronAPI.dbFlush) {
          await window.electronAPI.dbFlush()
        }
          logger.info('数据自动保存完成')
      } catch (e) {
        logger.error('自动保存数据失败', e)
      }
      window.electronAPI.confirmClose(true)
    })
  }

  // 加载当前用户数据
  if (authStore.isLoggedIn) {
    const username = authStore.currentUser?.username || 'default'
    // 同时加载端口状态数据
    await portStateStore.reload()

    if (window.electronAPI) {
      try {
        const result = await window.electronAPI.dbLoadUserData(username)
        if (result?.success && result?.data) {
          deviceStore.devices = result.data.devices || []
          cabinetStore.cabinets = result.data.cabinets || []
          // 同步到 localStorage
          deviceStore.save()
          cabinetStore.save()
          logger.info('用户数据已从数据库加载:', username)
        } else {
          loadFromLocalStorage()
        }
      } catch (e) {
        logger.error('从数据库加载失败，降级到 localStorage', e)
        loadFromLocalStorage()
      }
    } else {
      loadFromLocalStorage()
    }

    // 旧拓扑连接迁移已在 Step 4 删除旧 topology store 时移除：
    // 已迁移的连接数据已存在于 portStateStore，新版拓扑直接派生自 portStateStore，无需重复迁移。
  }

  // 安全审计 F-007：迁移历史明文凭据为加密存储（一次性、幂等；Web 环境自动跳过）
  try {
    const migrated = await migrateLegacyCredentials(deviceStore.devices)
    if (migrated > 0) {
      await deviceStore.save()
      logger.info(`[credentialCrypto] 已迁移 ${migrated} 台设备的明文凭据为加密存储`)
    }
  } catch (e) {
    logger.error('凭据迁移失败', e)
  }

  // 启动全局设备状态监控（所有页面共享）
  startDeviceStatusMonitor()
})

onUnmounted(() => {
  stopDeviceStatusMonitor()
})
</script>

<style>
#app {
  background: transparent;
}
</style>
