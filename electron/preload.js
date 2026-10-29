const { ipcRenderer, contextBridge } = require('electron')

// 暴露安全的API给渲染进程
// contextIsolation:true 下必须通过 contextBridge.exposeInMainWorld 暴露，
// 直接 window.electronAPI = ... 在隔离世界赋值，主世界无法访问（安全审计 F-001）
const api = {
  // 网络工具
  ping: (opts) => ipcRenderer.invoke('ping', opts),
  traceroute: (opts) => ipcRenderer.invoke('traceroute', opts),
  nslookup: (opts) => ipcRenderer.invoke('nslookup', opts),
  scanPort: (opts) => ipcRenderer.invoke('scan-port', opts),
  execCommand: (cmd) => ipcRenderer.invoke('exec-command', cmd),

  // 凭据加密（安全审计 F-007）：safeStorage 加密原语
  credentialEncrypt: (text) => ipcRenderer.invoke('credentials-encrypt', text),
  credentialDecrypt: (enc) => ipcRenderer.invoke('credentials-decrypt', enc),
  
  // 网络摄像头搜索
  getLocalNetworks: () => ipcRenderer.invoke('getLocalNetworks'),
  pingSweep: (opts) => ipcRenderer.invoke('pingSweep', opts),
  arpScan: (network) => ipcRenderer.invoke('arpScan', network),
  scanPorts: (device) => ipcRenderer.invoke('scanPorts', device),
  discoverOnvif: () => ipcRenderer.invoke('discoverOnvif'),
  fetchCameraSnapshot: (opts) => ipcRenderer.invoke('fetch-camera-snapshot', opts),

  // 外部链接
  openExternal: (url) => ipcRenderer.send('open-external', url),
  openWebview: (data) => ipcRenderer.send('open-webview', data),

  // 窗口控制
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-isMaximized'),
  titlebarDblClick: () => ipcRenderer.send('window-titlebar-dblclick'),

  // 文件操作
  saveFile: (opts) => ipcRenderer.invoke('save-file', opts),
  readFile: (opts) => ipcRenderer.invoke('read-file', opts),

  // 自动保存备份文件（不弹出对话框）
  saveBackupFile: (data) => ipcRenderer.invoke('save-backup-file', data),

  // 加载用户数据（从备份文件加载到 localStorage）
  loadUserData: (username) => ipcRenderer.invoke('load-user-data', username),

  // 保存用户数据（从 localStorage 保存到备份文件）
  saveUserData: (data) => ipcRenderer.invoke('save-user-data', data),

  // 获取用户数据目录路径
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),

  // SSH 终端
  sshConnect: (opts) => ipcRenderer.invoke('ssh-connect', opts),
  sshExec: (opts) => ipcRenderer.invoke('ssh-exec', opts),
  sshShell: (opts) => ipcRenderer.invoke('ssh-shell', opts),
  sshShellWrite: (opts) => ipcRenderer.send('ssh-shell-write', opts),
  sshShellResize: (opts) => ipcRenderer.send('ssh-shell-resize', opts),
  sshDisconnect: (opts) => ipcRenderer.invoke('ssh-disconnect', opts),
  sshSftpList: (opts) => ipcRenderer.invoke('ssh-sftp-list', opts),
  sshSftpPut: (opts) => ipcRenderer.invoke('ssh-sftp-put', opts),
  sshSftpGet: (opts) => ipcRenderer.invoke('ssh-sftp-get', opts),
  sshSftpMkdir: (opts) => ipcRenderer.invoke('ssh-sftp-mkdir', opts),
  sshSftpRmdir: (opts) => ipcRenderer.invoke('ssh-sftp-rmdir', opts),
  sshSftpDelete: (opts) => ipcRenderer.invoke('ssh-sftp-delete', opts),
  sshSftpRename: (opts) => ipcRenderer.invoke('ssh-sftp-rename', opts),
  sshSftpStat: (opts) => ipcRenderer.invoke('ssh-sftp-stat', opts),
  // 会话日志
  sshLogStart: (opts) => ipcRenderer.invoke('ssh-log-start', opts),
  sshLogWrite: (opts) => ipcRenderer.invoke('ssh-log-write', opts),
  sshLogStop: (opts) => ipcRenderer.invoke('ssh-log-stop', opts),
  // SSH 隧道 / 端口转发
  sshTunnelLocal: (opts) => ipcRenderer.invoke('ssh-tunnel-local', opts),
  sshTunnelRemote: (opts) => ipcRenderer.invoke('ssh-tunnel-remote', opts),
  sshTunnelDynamic: (opts) => ipcRenderer.invoke('ssh-tunnel-dynamic', opts),
  sshTunnelClose: (opts) => ipcRenderer.invoke('ssh-tunnel-close', opts),
  sshTunnelList: (opts) => ipcRenderer.invoke('ssh-tunnel-list', opts),
  onSshData: (connectionId, callback) => {
    const handler = (event, data) => callback(data)
    ipcRenderer.on(`ssh-data-${connectionId}`, handler)
    return () => ipcRenderer.removeListener(`ssh-data-${connectionId}`, handler)
  },
  onSshClosed: (connectionId, callback) => {
    const handler = () => callback()
    ipcRenderer.on(`ssh-closed-${connectionId}`, handler)
    return () => ipcRenderer.removeListener(`ssh-closed-${connectionId}`, handler)
  },

  // 关闭确认
  onBeforeClose: (callback) => ipcRenderer.on('before-close', callback),
  confirmClose: (shouldClose) => ipcRenderer.send('confirm-close', shouldClose),

  // 账户数据持久化
  saveAccounts: (accounts) => ipcRenderer.invoke('save-accounts', { accounts }),
  loadAccounts: () => ipcRenderer.invoke('load-accounts'),

  // 当前登录用户持久化
  saveCurrentUser: (user) => ipcRenderer.invoke('save-current-user', { user }),
  loadCurrentUser: () => ipcRenderer.invoke('load-current-user'),

  // 数据库操作（新统一接口）
  dbSaveUserData: (username, dataType, data) => ipcRenderer.invoke('db-save-user-data', { username, dataType, data }),
  dbLoadUserData: (username) => ipcRenderer.invoke('db-load-user-data', username),
  dbSaveAccounts: (accounts) => ipcRenderer.invoke('db-save-accounts', { accounts }),
  dbLoadAccounts: () => ipcRenderer.invoke('db-load-accounts'),
  dbSaveCurrentUser: (username) => ipcRenderer.invoke('db-save-current-user', { username }),
  dbLoadCurrentUser: () => ipcRenderer.invoke('db-load-current-user'),
  // 账号会话持久化（登录系统）：与项目会话（dbSaveCurrentUser）相互独立
  authSaveSession: (username) => ipcRenderer.invoke('auth-save-session', { username }),
  authLoadSession: () => ipcRenderer.invoke('auth-load-session'),
  dbFlush: () => ipcRenderer.invoke('db-flush'),
  
  // SNMP交换机端口监控
  snmpGetPorts: (opts) => ipcRenderer.invoke('snmp-get-ports', opts),
  
  // 邮件通知
  sendEmail: (opts) => ipcRenderer.invoke('send-email', opts),
  
  // Webhook通知
  sendWebhook: (opts) => ipcRenderer.invoke('send-webhook', opts),

  // 设备状态变化通知
  notifyStatusChange: (data) => ipcRenderer.invoke('notify-status-change', data),
  onStatusChangeNotify: (callback) => {
    const handler = (event, data) => callback(data)
    ipcRenderer.on('status-change-notify', handler)
    return () => ipcRenderer.removeListener('status-change-notify', handler)
  },

  // 3D 机房实时告警事件订阅（B2）：主进程在告警新建/状态变更时 send('dc-alert')
  onDcAlert: (callback) => {
    const handler = (event, data) => callback(data)
    ipcRenderer.on('dc-alert', handler)
    return () => ipcRenderer.removeListener('dc-alert', handler)
  },

  // ============ 清除 localStorage（首次安装时主进程调用） ============
  clearLocalStorage: (prefix) => {
    try {
      if (prefix) {
        const keys = []
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)
          if (k && k.startsWith(prefix)) keys.push(k)
        }
        keys.forEach(k => localStorage.removeItem(k))
      } else {
        localStorage.clear()
      }
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },

  // ============ 设备扫描API ============
  startDeviceScan: (options) => ipcRenderer.invoke('start-device-scan', options),
  getScanResults: () => ipcRenderer.invoke('get-scan-results'),
  
  // 扫描事件监听（返回取消订阅函数，便于组件卸载时彻底清理，修复监听器泄漏）
  onScanStatus: (callback) => {
    const handler = (event, data) => callback(data)
    ipcRenderer.on('scan-status', handler)
    return () => ipcRenderer.removeListener('scan-status', handler)
  },
  onDeviceFound: (callback) => {
    const handler = (event, device) => callback(device)
    ipcRenderer.on('device-found', handler)
    return () => ipcRenderer.removeListener('device-found', handler)
  },
  onScanProgress: (callback) => {
    const handler = (event, data) => callback(data)
    ipcRenderer.on('scan-progress', handler)
    return () => ipcRenderer.removeListener('scan-progress', handler)
  },
  onScanClear: (callback) => {
    const handler = (event) => callback()
    ipcRenderer.on('scan-clear', handler)
    return () => ipcRenderer.removeListener('scan-clear', handler)
  },
  
  // ============================================================
  // 数据库 API - 设备相关
  // ============================================================
  dbDeviceCreate: (device) => ipcRenderer.invoke('db-device-create', device),
  dbDeviceUpdate: (id, updates) => ipcRenderer.invoke('db-device-update', { id, updates }),
  dbDeviceDelete: (id) => ipcRenderer.invoke('db-device-delete', id),
  dbDeviceFindById: (id) => ipcRenderer.invoke('db-device-find-by-id', id),
  dbDeviceFindAll: (filters) => ipcRenderer.invoke('db-device-find-all', filters),
  dbDeviceUpdateStatus: (id, status) => ipcRenderer.invoke('db-device-update-status', { id, status }),
  dbDeviceGetStats: () => ipcRenderer.invoke('db-device-get-stats'),
  
  // ============================================================
  // 数据库 API - 机柜相关
  // ============================================================
  dbCabinetCreate: (cabinet) => ipcRenderer.invoke('db-cabinet-create', cabinet),
  dbCabinetUpdate: (id, updates) => ipcRenderer.invoke('db-cabinet-update', { id, updates }),
  dbCabinetDelete: (id) => ipcRenderer.invoke('db-cabinet-delete', id),
  dbCabinetFindById: (id) => ipcRenderer.invoke('db-cabinet-find-by-id', id),
  dbCabinetFindAll: () => ipcRenderer.invoke('db-cabinet-find-all'),
  dbCabinetGetDevices: (cabinetId) => ipcRenderer.invoke('db-cabinet-get-devices', cabinetId),
  
  // ============================================================
  // 数据库 API - 告警相关
  // ============================================================
  dbAlertCreate: (alert) => ipcRenderer.invoke('db-alert-create', alert),
  dbAlertUpdateStatus: (id, status, resolvedBy, resolutionNote) => 
    ipcRenderer.invoke('db-alert-update-status', { id, status, resolvedBy, resolutionNote }),
  dbAlertFindAll: (filters) => ipcRenderer.invoke('db-alert-find-all', filters),
  dbAlertDelete: (id) => ipcRenderer.invoke('db-alert-delete', id),
  dbAlertGetStats: () => ipcRenderer.invoke('db-alert-get-stats'),
  
  // ============================================================
  // 数据库 API - 配置备份相关
  // ============================================================
  dbConfigBackupCreate: (backup) => ipcRenderer.invoke('db-config-backup-create', backup),
  dbConfigBackupFindByDevice: (deviceId) => ipcRenderer.invoke('db-config-backup-find-by-device', deviceId),
  dbConfigBackupFindLatest: (deviceId) => ipcRenderer.invoke('db-config-backup-find-latest', deviceId),
  
  // ============================================================
  // 数据库 API - 拓扑数据相关
  // ============================================================
  dbTopologySave: (params) => ipcRenderer.invoke('db-topology-save', params),
  dbTopologyLoad: (params) => ipcRenderer.invoke('db-topology-load', params),
  dbTopologyDelete: (params) => ipcRenderer.invoke('db-topology-delete', params),
  dbTopologyList: (userId) => ipcRenderer.invoke('db-topology-list', userId),

  // ============================================================
  // 数据库 API - 机房规划（DataCenter 3D）
  // ============================================================
  dcPlanSave: (roomId, plan) => ipcRenderer.invoke('dc-plan-save', { roomId, plan }),
  dcPlanLoad: (roomId) => ipcRenderer.invoke('dc-plan-load', { roomId }),
  dcPlanList: () => ipcRenderer.invoke('dc-plan-list'),
  dcPlanDelete: (roomId) => ipcRenderer.invoke('dc-plan-delete', { roomId }),
  // B1/F2：拉取后端聚合状态（按 device_id 聚合的最严重级别），供 3D 机房初始化着色
  getRackStatus: () => ipcRenderer.invoke('dc-rack-status'),
  
  // ============================================================
  // 数据库 API - 通用JSON数据存储
  // ============================================================
  dbJsonSave: (params) => ipcRenderer.invoke('db-json-save', params),
  dbJsonLoad: (params) => ipcRenderer.invoke('db-json-load', params),

  // ============================================================
  // 数据库 API - 数据接入（type 驱动：alarm/sensor/env/energy/source）
  // ============================================================
  dbIngestCreate: (type, record) => ipcRenderer.invoke('db-ingest-create', { type, record }),
  dbIngestCreateMany: (type, records) => ipcRenderer.invoke('db-ingest-create-many', { type, records }),
  dbIngestUpdate: (type, id, updates) => ipcRenderer.invoke('db-ingest-update', { type, id, updates }),
  dbIngestDelete: (type, id) => ipcRenderer.invoke('db-ingest-delete', { type, id }),
  dbIngestFindAll: (type, filters) => ipcRenderer.invoke('db-ingest-find-all', { type, filters }),
  dbIngestFindById: (type, id) => ipcRenderer.invoke('db-ingest-find-by-id', { type, id }),
  dbIngestGetStats: (type) => ipcRenderer.invoke('db-ingest-get-stats', { type }),
  dbIngestMarkPoll: (type, id, status, error) => ipcRenderer.invoke('db-ingest-mark-poll', { type, id, status, error }),
}

// 暴露到主世界（渲染进程通过 window.electronAPI 访问）
contextBridge.exposeInMainWorld('electronAPI', api)
