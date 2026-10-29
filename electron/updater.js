// electron/updater.js
// 自动更新模块

const { app, ipcMain, dialog, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// 配置日志
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// 更新服务器配置（仅当配置了真实 GitHub 仓库时才启用）
// 启用条件（两道开关，缺一不可）：
//   1) main.js 侧：NETOPS_AUTO_UPDATE=1 时才 require 本模块并调用 initAutoUpdater(window)
//   2) 本模块侧：NETOPS_GITHUB_OWNER 已设置为真实仓库所有者（占位值 your-github-username 无效）
// 未启用时不联网、不注册 IPC 通道、不弹窗，对启动无任何影响（内网/离线部署请保持默认）。
const autoUpdaterConfig = {
  provider: 'github',
  owner: process.env.NETOPS_GITHUB_OWNER || '',
  repo: 'netops-platform',
  vPrefixedTagName: true,
  updaterCacheDirName: 'netops-platform-updater'
};

// 是否启用自动更新（owner 为占位符或未设置时关闭）
const autoUpdateEnabled = !!autoUpdaterConfig.owner && autoUpdaterConfig.owner !== 'your-github-username';

if (autoUpdateEnabled) {
  autoUpdater.setFeedURL(autoUpdaterConfig);
} else {
  log.info('未配置真实发布仓库，自动更新已禁用（静默跳过）。');
}

// 是否正在检查更新
let isCheckingUpdate = false;
// 是否正在下载更新
let isDownloadingUpdate = false;
// 主窗口引用
let mainWindow = null;

/**
 * 初始化自动更新
 * @param {BrowserWindow} window - 主窗口
 */
function initAutoUpdater(window) {
  // 未配置真实发布仓库时，静默跳过更新检查
  if (!autoUpdateEnabled) {
    log.info('自动更新未启用，跳过初始化。');
    return;
  }

  mainWindow = window;
  
  // 配置自动更新事件
  setupUpdateEvents();
  
  // 延迟检查更新（避免应用启动太慢）
  setTimeout(() => {
    checkForUpdates();
  }, 30000); // 30秒后检查
  
  // 每小时检查一次更新
  setInterval(() => {
    checkForUpdates();
  }, 3600000); // 1小时
  
  // 监听渲染进程的更新请求
  ipcMain.handle('check-for-updates', () => {
    checkForUpdates();
  });
  
  ipcMain.handle('start-download-update', () => {
    downloadUpdate();
  });
  
  ipcMain.handle('install-update', () => {
    quitAndInstall();
  });
}

/**
 * 设置更新事件监听
 */
function setupUpdateEvents() {
  // 正在检查更新
  autoUpdater.on('checking-for-update', () => {
    log.info('正在检查更新...');
    isCheckingUpdate = true;
    sendStatusToWindow('checking-for-update', {});
  });
  
  // 发现可用更新
  autoUpdater.on('update-available', (info) => {
    log.info('发现新版本:', info.version);
    isCheckingUpdate = false;
    sendStatusToWindow('update-available', info);
    
    // 自动下载更新
    downloadUpdate();
  });
  
  // 没有可用更新
  autoUpdater.on('update-not-available', (info) => {
    log.info('当前已是最新版本:', info.version);
    isCheckingUpdate = false;
    sendStatusToWindow('update-not-available', info);
  });
  
  // 下载进度
  autoUpdater.on('download-progress', (progressObj) => {
    log.info(`下载进度: ${Math.round(progressObj.percent)}%`);
    isDownloadingUpdate = true;
    sendStatusToWindow('download-progress', progressObj);
  });
  
  // 下载完成
  autoUpdater.on('update-downloaded', (info) => {
    log.info('更新下载完成:', info.version);
    isDownloadingUpdate = false;
    sendStatusToWindow('update-downloaded', info);
    
    // 询问用户是否立即安装
    showUpdateDialog();
  });
  
  // 更新错误
  autoUpdater.on('error', (err) => {
    log.error('自动更新错误:', err);
    isCheckingUpdate = false;
    isDownloadingUpdate = false;
    sendStatusToWindow('update-error', { error: err.message });
  });
}

/**
 * 检查更新
 */
function checkForUpdates() {
  if (!autoUpdateEnabled) {
    log.info('自动更新未启用，跳过检查。');
    return;
  }
  if (isCheckingUpdate) {
    log.info('正在检查更新，请稍候...');
    return;
  }
  
  log.info('开始检查更新...');
  autoUpdater.checkForUpdates().catch(err => {
    log.error('检查更新失败:', err);
  });
}

/**
 * 下载更新
 */
function downloadUpdate() {
  if (!autoUpdateEnabled) {
    log.info('自动更新未启用，跳过下载。');
    return;
  }
  if (isDownloadingUpdate) {
    log.info('正在下载更新，请稍候...');
    return;
  }
  
  log.info('开始下载更新...');
  autoUpdater.downloadUpdate().catch(err => {
    log.error('下载更新失败:', err);
  });
}

/**
 * 退出并安装更新
 */
function quitAndInstall() {
  log.info('退出应用并安装更新...');
  autoUpdater.quitAndInstall(false, true);
}

/**
 * 显示更新对话框
 */
function showUpdateDialog() {
  if (!mainWindow) {
    return;
  }
  
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: '更新就绪',
    message: '新版本已下载完成',
    detail: '是否立即安装更新？应用将重启以完成更新。',
    buttons: ['稍后安装', '立即安装'],
    defaultId: 1,
    cancelId: 0
  }).then((returnValue) => {
    if (returnValue.response === 1) {
      quitAndInstall();
    }
  });
}

/**
 * 发送状态到渲染进程
 * @param {string} status - 状态
 * @param {object} data - 数据
 */
function sendStatusToWindow(status, data) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('updater-status', {
      status,
      data
    });
  }
}

/**
 * 获取当前版本
 * @returns {string} 版本号
 */
function getCurrentVersion() {
  return app.getVersion();
}

/**
 * 获取更新状态
 * @returns {object} 更新状态
 */
function getUpdateStatus() {
  return {
    isCheckingUpdate,
    isDownloadingUpdate,
    currentVersion: getCurrentVersion()
  };
}

module.exports = {
  initAutoUpdater,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
  getCurrentVersion,
  getUpdateStatus
};
