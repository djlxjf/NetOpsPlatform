import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '../stores'

const routes = [
  {
    path: '/',
    redirect: '/login'
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
    meta: { title: '登录', requiresAuth: false }
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('../views/dashboard/DashboardView.vue'),
    meta: { title: '数智机房', icon: 'Monitor', requiresAuth: true }
  },
  {
    path: '/devices',
    name: 'Devices',
    component: () => import('../views/devices/DevicesView.vue'),
    meta: { title: '设备管理', icon: 'Server', requiresAuth: true }
  },
  {
    path: '/cabinets',
    name: 'Cabinets',
    component: () => import('../views/cabinets/CabinetsView.vue'),
    meta: { title: '机柜管理', icon: 'Grid', requiresAuth: true }
  },
  {
    path: '/datacenter',
    name: 'DataCenter',
    component: () => import('../views/datacenter/DataCenterView.vue'),
    // 机房规划 = 可编辑机房：以规划态（plan）进入，区别于数智机房的监控大屏（monitor）
    props: { initialMode: 'plan' },
    meta: { title: '机房规划', icon: 'Box', requiresAuth: true }
  },
  {
    path: '/topology',
    name: 'Topology',
    component: () => import('../views/topology/TopologyView.vue'),
    meta: { title: '网络拓扑', icon: 'Share', requiresAuth: true }
  },
  {
    path: '/notification',
    name: 'Notification',
    component: () => import('../views/notification/NotificationView.vue'),
    meta: { title: '通知推送', icon: 'Message', requiresAuth: true }
  },
  
  {
    path: '/devicelib',
    name: 'DeviceLib',
    component: () => import('../views/devicelib/DeviceLibView.vue'),
    meta: { title: '设备库', icon: 'Collection', requiresAuth: true }
  },
  {
    path: '/ip-management',
    name: 'IPManagement',
    component: () => import('../views/ip-management/IpManagementView.vue'),
    meta: { title: 'IP管理', icon: 'Files', requiresAuth: true }
  },
  {
    path: '/data-report',
    name: 'DataReport',
    component: () => import('../views/data-report/DataReportView.vue'),
    meta: { title: '数据报表', icon: 'DataAnalysis', requiresAuth: true }
  },
  {
    path: '/logs',
    name: 'OperationLogs',
    component: () => import('../views/logs/OperationLogView.vue'),
    meta: { title: '操作日志', icon: 'Document', requiresAuth: true }
  },
  {
    path: '/data-ingest',
    name: 'DataIngest',
    component: () => import('../views/data-ingest/DataIngestView.vue'),
    meta: { title: '数据接入', icon: 'Connection', requiresAuth: true }
  },
  {
    path: '/about',
    name: 'About',
    component: () => import('../views/AboutView.vue'),
    meta: { title: '关于 / 支持', icon: 'InfoFilled', requiresAuth: true }
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()
  // 门禁前置：等待 App.vue 启动时的账号/项目会话恢复完成，避免守卫在恢复前用空状态误判
  // （历史缺陷：恢复前 isLoggedIn 为 false，会把已登录用户弹回 /login；随后 App.vue 又把
  // 当前路由（仍为初始 '/'）误判为根路径而强转 /dashboard，导致直接访问 /datacenter 等受保护
  // 路由被劫持到 /dashboard）。
  if (!authStore.authReady) {
    await authStore.waitAuthReady()
  }
  const loggedIn = authStore.isAccountLoggedIn && authStore.isLoggedIn
  // 已登录用户不应停留在登录页（也覆盖「根路径 / 经路由表重定向到 /login」的情形）
  if (to.path === '/login' && loggedIn) {
    next('/dashboard')
    return
  }
  // 双重门禁：账号会话（用户名+密码登录）与项目会话（选中项目）缺一不可
  if (to.meta.requiresAuth !== false && !loggedIn) {
    next('/login')
    return
  }
  next()
})

export default router
