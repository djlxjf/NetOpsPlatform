<template>
  <div class="app-layout">
    <!-- 标题栏：颜色与窗口内部一致，右侧为系统原生最小化/最大化/关闭按钮（titleBarOverlay） -->
    <div class="titlebar">
      <div class="titlebar-drag">
        <div class="titlebar-icon">
          <img src="/logo_256.png" alt="NetOps" />
        </div>
        <span class="titlebar-title">NetOps Platform</span>
        <span class="titlebar-project">{{ projectName }}</span>
      </div>
    </div>

    <!-- 移动端顶部标题栏 -->
    <div class="mobile-header">
      <button class="mobile-menu-btn" @click="sidebarOpen = !sidebarOpen">
        <el-icon><Menu /></el-icon>
      </button>
      <span class="mobile-header-title">{{ pageTitle }}</span>
      <div style="width: 36px;"></div>
    </div>

    <!-- 侧边栏遮罩 -->
    <div
      class="sidebar-overlay"
      :class="{ active: sidebarOpen }"
      @click="sidebarOpen = false"
    ></div>

    <div class="app-body">
      <!-- 侧边栏 -->
      <aside class="sidebar" :class="{ open: sidebarOpen }">
        <div class="sidebar-brand">
          <div class="brand-icon">
            <img src="/logo_128.png" alt="NetOps" />
          </div>
          <div class="brand-text">
            <div class="brand-name">NetOps</div>
            <div class="brand-sub">运维管理平台</div>
          </div>
        </div>

        <nav class="sidebar-nav">
          <div class="nav-section-label">主菜单</div>
          <router-link
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="nav-item"
            :class="{ active: $route.path === item.path }"
            @click="isMobile ? sidebarOpen = false : null"
          >
            <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
            <span class="nav-label">{{ item.label }}</span>
            <span v-if="item.badge" class="nav-badge">{{ item.badge }}</span>
          </router-link>
        </nav>

        <!-- 数据管理区域 -->
        <div class="data-section">
          <div class="nav-section-label">数据管理</div>
          <button class="data-btn" @click="handleExport(); if (isMobile) sidebarOpen = false">
            <el-icon><Download /></el-icon>
            <span>导出数据</span>
          </button>
          <button class="data-btn" @click="handleImport(); if (isMobile) sidebarOpen = false">
            <el-icon><Upload /></el-icon>
            <span>导入数据</span>
          </button>
          <input ref="fileInput" type="file" accept=".xlsx,.xls" style="display:none" @change="onFileSelected" />
        </div>

        <div class="sidebar-footer">
          <div class="user-info" @click="showUserMenu = !showUserMenu">
            <div class="user-avatar">
              <el-icon><UserFilled /></el-icon>
            </div>
            <div class="user-detail">
              <span class="user-name">{{ authStore.currentUser?.name || '项目' }}</span>
              <span class="user-role">{{ authStore.currentUser?.projectAddress || '网络运维' }}</span>
            </div>
            <el-icon class="arrow-icon"><ArrowDown /></el-icon>
          </div>

          <!-- 用户菜单 -->
          <div v-if="showUserMenu" class="user-menu">
            <button class="menu-item" @click="handleSwitchAccount">
              <el-icon><SwitchButton /></el-icon>
              <span>切换项目</span>
            </button>
            <button class="menu-item logout" @click="handleLogout">
              <el-icon><SwitchButton /></el-icon>
              <span>退出项目</span>
            </button>
          </div>

          <div class="sys-status">
            <span class="status-dot online"></span>
            <span class="status-text">系统运行正常</span>
          </div>
          <div class="theme-switcher-wrapper">
            <ThemeSwitcher />
          </div>
          <div class="version-text">v1.6.0</div>
        </div>
      </aside>

      <!-- 主内容区 -->
      <main class="main-content">
        <router-view v-slot="{ Component }">
          <!-- 注意：此处刻意不用 <transition mode="out-in">。
               「数智机房」(DashboardView 内嵌 DataCenterView) 与「机房规划」(直接挂载
               DataCenterView) 两条路由树的根元素同为 div.dc-view，out-in 模式下离场动画
               会被取消且新组件永不进场——表现为路由已切换（侧边栏高亮更新）但页面永远
               停留旧视图，且旧实例的 watch 全部失效（机房规划显示监控大屏的根因）。
               如需恢复页面过渡，必须先保证两条路由根元素类型不同。 -->
          <component :is="Component" :key="$route.path" />
        </router-view>
      </main>
    </div>

    <!-- 移动端底部导航栏 -->
    <nav class="mobile-nav">
      <div class="mobile-nav-items">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="mobile-nav-item"
          :class="{ active: $route.path === item.path }"
          @click="sidebarOpen = false"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </router-link>
      </div>
    </nav>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore, useDeviceStore, useCabinetStore, useDeviceLibStore, useAlertStore } from '../stores'
import { usePortStateStore } from '../stores/portState'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import { Menu } from '@element-plus/icons-vue'
import { addLog, LogType, LogResult } from '../composables/useOperationLog.js'
import ThemeSwitcher from './ThemeSwitcher.vue'
import logger from '../utils/logger'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const deviceStore = useDeviceStore()
const cabinetStore = useCabinetStore()
const deviceLibStore = useDeviceLibStore()
const portStateStore = usePortStateStore()
const alertStore = useAlertStore()

const currentTime = ref('')
let timer = null
const isMaximized = ref(false)

// 判断是否在手机端（Capacitor 环境或屏幕宽度小）
const isMobile = computed(() => {
  if (typeof window === 'undefined') return false
  return !!window.Capacitor || window.innerWidth <= 768
})
const showUserMenu = ref(false)
const fileInput = ref(null)
const sidebarOpen = ref(false)

const projectName = computed(() => {
  return authStore.currentUser?.name ? `${authStore.currentUser.name} 的网络` : 'NetOps'
})

// 导航菜单配置
const navItems = computed(() => [
  { path: '/dashboard', label: '数智机房', icon: 'Monitor', badge: alertStore.unreadCount > 0 ? alertStore.unreadCount : null },
  { path: '/devices', label: '设备管理', icon: 'Cpu' },
  { path: '/cabinets', label: '机柜管理', icon: 'Box' },
  { path: '/datacenter', label: '机房规划', icon: 'Grid' },
  { path: '/topology', label: '网络拓扑', icon: 'Share' },
  { path: '/ip-management', label: 'IP管理', icon: 'Files' },
  { path: '/notification', label: '通知推送', icon: 'Message' },
  { path: '/devicelib', label: '设备库', icon: 'Box' },
  { path: '/data-report', label: '数据报表', icon: 'DataAnalysis' },
  { path: '/data-ingest', label: '数据接入', icon: 'Connection' },
  { path: '/logs', label: '操作日志', icon: 'Document' },
  { path: '/about', label: '关于 / 支持', icon: 'InfoFilled' },
])

// 当前页面标题
const pageTitle = computed(() => {
  const item = navItems.value.find(n => n.path === route.path)
  return item?.label || 'NetOps Platform'
})

function updateTime() {
  const now = new Date()
  currentTime.value = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

onMounted(() => {
  updateTime()
  timer = setInterval(updateTime, 1000)
  checkMaximized()
  window.addEventListener('resize', checkMaximized)

  // 监听登录状态变化，加载对应用户数据
  watch(() => authStore.currentUser, async (newUser) => {
    if (newUser) {
      const username = newUser.username

      // 尝试从文件系统加载备份数据
      try {
        const result = await window.electronAPI?.loadUserData(username)
        if (result?.success && result.data) {
          // 从备份文件加载数据到 localStorage
          const { devices, cabinets, deviceLibCustom } = result.data

          if (devices) {
            deviceStore.devices = devices
            localStorage.setItem(`netops_devices_${username}`, JSON.stringify(devices))
          }
          if (cabinets) {
            cabinetStore.cabinets = cabinets
            localStorage.setItem(`netops_cabinets_${username}`, JSON.stringify(cabinets))
          }
          if (deviceLibCustom) {
            localStorage.setItem(`netops_device_lib_custom`, JSON.stringify(deviceLibCustom))
          }

          logger.dataRecovery('已从备份文件加载用户数据')
        }
      } catch (err) {
        logger.error('[数据恢复] 加载失败:', err)
      }
    }
  }, { immediate: true })

  // 监听 Electron 关闭前事件
  if (window.electronAPI?.onBeforeClose) {
    window.electronAPI.onBeforeClose(async () => {
      await handleBeforeClose()
    })
  }
})

onUnmounted(() => {
  clearInterval(timer)
  window.removeEventListener('resize', checkMaximized)
})

function checkMaximized() {
  if (window.electronAPI?.isMaximized) {
    isMaximized.value = window.electronAPI.isMaximized()
  }
}

// 关闭前自动保存（不弹窗）
async function handleBeforeClose() {
  try {
    await saveAllData()
    window.electronAPI?.confirmClose(true)
  } catch (err) {
    logger.error('自动保存失败:', err)
    window.electronAPI?.confirmClose(true)
  }
}

// 保存所有数据到文件（自动保存到用户数据目录）
async function saveAllData() {
  try {
    const username = authStore.currentUser?.username || 'default'

    // 1. 导出 JSON 备份文件
    const allData = {
      version: '1.0',
      exportTime: new Date().toISOString(),
      username,
      devices: deviceStore.devices,
      cabinets: cabinetStore.cabinets
    }

    const content = JSON.stringify(allData, null, 2)
    const fileName = `netops_backup_${dayjs().format('YYYYMMDD_HHmmss')}.json`

    // 保存备份文件
    await window.electronAPI?.saveBackupFile({
      content,
      subDir: username,
      fileName
    })

    // 2. 使用专用 API 保存用户数据（文件系统）
    // 获取自定义设备库型号
    const customModels = deviceLibStore.models.filter(m => m.isCustom)

    await window.electronAPI?.saveUserData({
      username,
      data: {
        devices: deviceStore.devices,
        cabinets: cabinetStore.cabinets,
        deviceLibCustom: customModels
      }
    })

    ElMessage.success('数据已自动备份')
  } catch (err) {
    logger.error('保存数据失败:', err)
    ElMessage.error('备份失败: ' + err.message)
  }
}

function handleSwitchAccount() {
  showUserMenu.value = false
  addLog({ type: LogType.LOGOUT, detail: '退出当前项目', result: LogResult.SUCCESS })
  authStore.switchAccount()
  router.replace('/login')
  ElMessage.success('已退出当前项目')
}

function handleLogout() {
  ElMessageBox.confirm('确定要退出当前项目吗？', '退出确认', {
    type: 'warning',
    confirmButtonText: '退出',
    cancelButtonText: '取消'
  }).then(() => {
    addLog({ type: LogType.LOGOUT, detail: '退出项目', result: LogResult.SUCCESS })
    authStore.logout()
    router.replace('/login')
    ElMessage.success('已退出项目')
  }).catch(() => {})
}

async function handleExport() {
  try {
    // 创建设备数据工作表
    const devicesData = deviceStore.devices.map(d => ({
      '设备名称': d.name || '',
      'IP地址': d.ip || '',
      '设备类型': d.type || '',
      '厂商': d.vendor || '',
      '型号': d.model || '',
      '位置': d.location || '',
      'U数': d.uSize || '',
      '状态': d.status || '',
      '管理VLAN': d.managementVlan || '',
      '登录方式': d.loginMethod || '',
      '用户名': d.username || '',
      '密码': '', // 安全审计 C-001：全局导出不再包含明文密码，防止凭据泄露,
      'SNMP社区': d.snmpCommunity || '',
      '端口数': d.ethernetPorts || '',
      '上传时间': d.createdAt || ''
    }))

    // 创建机柜数据工作表
    const cabinetsData = cabinetStore.cabinets.map(c => ({
      '机柜名称': c.name || '',
      '位置': c.location || '',
      '总U数': c.totalSlots || '',
      '已用U数': Object.keys(c.slots || {}).length,
      '描述': c.description || '',
      '创建时间': c.createdAt || ''
    }))

    // 创建端口连接数据工作表（拓扑连线已随 portStateStore 连接派生，节点即设备，
    // 故不再单独导出冗余的拓扑节点/连线工作表）
    const portConnsData = portStateStore.connections.map(c => ({
      '连接ID': c.id || '',
      'A设备': c.portA?.deviceName || '',
      'A端口': c.portA?.portId || '',
      'B设备': c.portB?.deviceName || '',
      'B端口': c.portB?.portId || '',
      '线缆类型': c.cableType || '',
      '创建时间': c.createdAt || ''
    }))

    // 创建工作簿
    const wb = XLSX.utils.book_new()

    // 添加设备工作表
    if (devicesData.length > 0) {
      const ws1 = XLSX.utils.json_to_sheet(devicesData)
      XLSX.utils.book_append_sheet(wb, ws1, '设备列表')
    }

    // 添加机柜工作表
    if (cabinetsData.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(cabinetsData)
      XLSX.utils.book_append_sheet(wb, ws2, '机柜列表')
    }

    // 添加端口连接工作表
    if (portConnsData.length > 0) {
      const ws5 = XLSX.utils.json_to_sheet(portConnsData)
      XLSX.utils.book_append_sheet(wb, ws5, '端口连接')
    }

    // 生成文件
    const fileName = `netops_backup_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`
    XLSX.writeFile(wb, fileName)

    ElMessage.success('数据导出成功')
  } catch (err) {
    ElMessage.error('导出失败: ' + err.message)
  }
}

function handleImport() {
  fileInput.value?.click()
}

async function onFileSelected(e) {
  const file = e.target.files?.[0]
  if (!file) return

  try {
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })

    // 获取设备列表工作表
    const deviceSheet = workbook.Sheets['设备列表']
    if (deviceSheet) {
      const jsonData = XLSX.utils.sheet_to_json(deviceSheet)

      await ElMessageBox.confirm(
        `将导入 ${jsonData.length} 台设备，是否覆盖现有数据？`,
        '导入确认',
        {
          type: 'warning',
          confirmButtonText: '覆盖导入',
          cancelButtonText: '取消'
        }
      )

      // 转换为设备格式
      const devices = jsonData.map((row, idx) => ({
        id: Date.now().toString() + idx,
        name: row['设备名称'] || '',
        ip: row['IP地址'] || '',
        type: row['设备类型'] || '',
        vendor: row['厂商'] || '',
        model: row['型号'] || '',
        location: row['位置'] || '',
        uSize: row['U数'] || 1,
        status: row['状态'] || 'offline',
        managementVlan: row['管理VLAN'] || '',
        loginMethod: row['登录方式'] || '',
        username: row['用户名'] || '',
        password: row['密码'] || '', // 密码字段保留在对象中；敏感字段加密统一收敛在 importDevices 内
        sshPass: row['密码'] || '', // 兼容旧导出格式；由 importDevices 内的 encryptDeviceSecrets 统一加密
        snmpCommunity: row['SNMP社区'] || '',
        ethernetPorts: row['端口数'] || 0,
        createdAt: new Date().toISOString()
      }))

      await deviceStore.importDevices(devices)
      ElMessage.success('设备导入成功')
    } else {
      ElMessage.warning('未找到设备列表工作表')
    }

    // 获取机柜列表工作表
    const cabinetSheet = workbook.Sheets['机柜列表']
    if (cabinetSheet) {
      const jsonData = XLSX.utils.sheet_to_json(cabinetSheet)
      const cabinets = jsonData.map((row, idx) => ({
        id: Date.now().toString() + idx + 1000,
        name: row['机柜名称'] || '',
        location: row['位置'] || '',
        totalSlots: row['总U数'] || 42,
        description: row['描述'] || '',
        slots: {},
        patchItems: [],
        createdAt: new Date().toISOString()
      }))

      // 合并机柜
      cabinets.forEach(c => {
        const existIdx = cabinetStore.cabinets.findIndex(ex => ex.name === c.name)
        if (existIdx >= 0) {
          cabinetStore.updateCabinet(cabinetStore.cabinets[existIdx].id, c)
        } else {
          cabinetStore.addCabinet(c)
        }
      })
      ElMessage.success('机柜导入成功')
    }

    // 获取端口连接工作表
    const portConnSheet = workbook.Sheets['端口连接']
    if (portConnSheet) {
      const jsonData = XLSX.utils.sheet_to_json(portConnSheet)
      const portConns = jsonData.map(row => ({
        id: row['连接ID'] || '',
        portA: {
          deviceName: row['A设备'] || '',
          portId: row['A端口'] || ''
        },
        portB: {
          deviceName: row['B设备'] || '',
          portId: row['B端口'] || ''
        },
        cableType: row['线缆类型'] || '',
        createdAt: row['创建时间'] || new Date().toISOString()
      })).filter(c => c.id && c.portA.portId)
      if (portConns.length > 0) {
        // 直接设置到connections
        portStateStore.connections = portConns
        portStateStore.save()
        ElMessage.success('端口连接导入成功')
      }
    }

    ElMessage.success('数据导入完成')
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error('导入失败: ' + err.message)
    }
  }

  // 清空input
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}
</script>

<style lang="scss" scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: transparent;
}

// 标题栏 - 颜色与窗口内部一致（配合 titleBarOverlay 系统按钮）
.titlebar {
  height: 40px;
  background: var(--bg-base);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  position: relative;
  z-index: 100;
  user-select: none;
  border-bottom: 1px solid var(--border-color);
}

.titlebar-drag {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-left: 12px;
  // 右侧预留系统窗口控制按钮（titleBarOverlay）空间，避免标题文本被遮挡
  padding-right: 150px;
  flex: 1;
  height: 100%;
  -webkit-app-region: drag;
}

.titlebar-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: 4px;
  }
}

.titlebar-title {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-primary);
  letter-spacing: 0.2px;
}

.titlebar-project {
  font-size: 11px;
  color: var(--text-secondary);
  margin-left: 12px;
  padding-left: 12px;
  border-left: 1px solid var(--border-color);
}

// VS Code风格窗口控制按钮
.titlebar-controls {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}

.control-btn {
  width: 44px;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;

  svg {
    width: 10px;
    height: 10px;
  }

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.close:hover {
    background: #f14c4c;
    color: #ffffff;
  }
}

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  width: var(--sidebar-width);
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
}

.sidebar-brand {
  padding: 20px 16px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--border-color);
}

.brand-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  flex-shrink: 0;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: 10px;
    image-rendering: -webkit-optimize-contrast;
    image-rendering: crisp-edges;
  }
}

.brand-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
  letter-spacing: -0.3px;
}

.brand-sub {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 1px;
}

.sidebar-nav {
  flex: 1;
  padding: 12px 8px;
  overflow-y: auto;
}

.nav-section-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  padding: 4px 10px 8px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  position: relative;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  text-decoration: none;
  transition: var(--transition-item);
  margin-bottom: 2px;
  font-size: 13px;
  font-weight: 400;
  cursor: pointer;
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;

  /* 菜单项入场：stagger 依次滑入（延迟按次序递增） */
  animation: nav-item-in 0.3s var(--ease-out-expo) both;

  &:nth-child(2)  { animation-delay: 0.03s; }
  &:nth-child(3)  { animation-delay: 0.06s; }
  &:nth-child(4)  { animation-delay: 0.09s; }
  &:nth-child(5)  { animation-delay: 0.12s; }
  &:nth-child(6)  { animation-delay: 0.15s; }
  &:nth-child(7)  { animation-delay: 0.18s; }
  &:nth-child(8)  { animation-delay: 0.21s; }
  &:nth-child(9)  { animation-delay: 0.24s; }
  &:nth-child(10) { animation-delay: 0.27s; }

  /* 左侧指示条（active 时滑入） */
  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 6px;
    bottom: 6px;
    width: 3px;
    border-radius: 2px;
    background: var(--accent-gradient);
    box-shadow: 0 0 8px var(--accent-glow);
    transform: scaleY(0);
    transition: transform 0.22s var(--ease-out-expo);
  }

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);

    .nav-icon {
      color: var(--accent-hover);
      transform: translateX(1px) scale(1.08);
    }
  }

  &.active {
    background: linear-gradient(90deg, var(--accent-subtle), transparent);
    color: var(--text-heading);
    font-weight: 600;

    &::before {
      transform: scaleY(1);
    }

    .nav-icon {
      color: var(--accent);
      opacity: 1;
    }
  }
}

.nav-icon {
  font-size: 16px;
  flex-shrink: 0;
  opacity: 0.8;
  transition: color 0.18s var(--ease-out-expo), transform 0.18s var(--ease-out-expo);
}

.nav-label {
  flex: 1;
}

.nav-badge {
  background: var(--accent-red);
  color: white;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

// 数据管理区域
.data-section {
  padding: 12px 8px;
  border-top: 1px solid var(--border-color);
}

.data-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: var(--transition);
  margin-bottom: 4px;

  .el-icon {
    font-size: 14px;
  }

  &:hover {
    background: var(--bg-hover);
    color: var(--accent-hover);
  }
}

.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
  position: relative;
}

.theme-switcher-wrapper {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
  
  :deep(.theme-switcher) {
    width: 100%;
  }
  
  :deep(.theme-btn) {
    width: 100%;
    justify-content: center;
    background: var(--bg-tertiary) !important;
    border-color: var(--border-color) !important;
    color: var(--text-primary) !important;
    
    &:hover {
      background: var(--bg-hover) !important;
      border-color: var(--accent-color) !important;
    }
  }
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: var(--transition);

  &:hover {
    background: var(--bg-hover);
  }
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--accent-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-hover);
  font-size: 16px;
}

.user-detail {
  flex: 1;
  min-width: 0;
}

.user-name {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-role {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
}

.arrow-icon {
  font-size: 12px;
  color: var(--text-muted);
  transition: transform 0.2s;
}

.user-menu {
  position: absolute;
  bottom: 70px;
  left: 8px;
  right: 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  padding: 4px;
  box-shadow: var(--shadow-lg);
  z-index: 100;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: var(--transition);

  .el-icon {
    font-size: 14px;
  }

  &:hover {
    background: var(--accent-subtle);
    color: var(--accent-hover);
  }

  &.logout:hover {
    background: rgba(248, 81, 73, 0.1);
    color: var(--accent-red);
  }
}

.sys-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}

.status-text {
  font-size: 11px;
  color: var(--text-muted);
}

.version-text {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}

.main-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 确保 router-view / transition / 页面根元素填满 main-content */
.main-content > * {
  flex: 1;
  display: flex !important;
  flex-direction: column;
  min-height: 0;
}

/* 移动端侧边栏遮罩 */
.sidebar-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 998;

  &.active {
    display: block;
  }
}

/* 移动端顶部标题栏 */
.mobile-header {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: calc(48px + env(safe-area-inset-top, 0px));
  padding-top: env(safe-area-inset-top, 0px);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  z-index: 1000;
  align-items: center;
  justify-content: space-between;
  padding-left: 16px;
  padding-right: 16px;

  .mobile-header-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .mobile-menu-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--text-primary);
    font-size: 20px;
    cursor: pointer;
    border-radius: var(--radius-sm);

    &:active {
      background: var(--bg-hover);
    }
  }
}

/* 移动端底部导航栏 - 已隐藏 */
.mobile-nav {
  display: none !important;
}

/* 屏幕宽度 ≤ 768px 时应用移动端样式 */
@media (max-width: 768px) {
  .app-layout {
    padding-bottom: 0;
    background: transparent;
  }

  .mobile-header {
    display: flex;
  }

  .mobile-nav {
    display: none !important;
  }

  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 999;
    transform: translateX(-100%);
    transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
    width: 260px;
    background: var(--bg-sidebar);
    &.open {
      transform: translateX(0);
    }
  }

  .main-content {
    padding-top: calc(48px + env(safe-area-inset-top, 0px));
    padding-bottom: 0;
    min-height: 100vh;
    min-height: 100dvh;
    background: transparent;
  }

  /* 移动端侧边栏品牌区域增加顶部安全距离，避开手机状态栏 */
  .sidebar-brand {
    padding-top: calc(65px + env(safe-area-inset-top, 0px));
  }
}
</style>
