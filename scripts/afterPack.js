// scripts/afterPack.js - 复制所有必要的 Electron 文件
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  const { appOutDir } = context;
  const appResourcesDir = path.join(appOutDir, 'resources', 'app');

  console.log('[afterPack] Starting setup...');

  // 复制 electron 模块
  const electronSrc = path.join(__dirname, '..', 'node_modules', 'electron');
  const electronDest = path.join(appResourcesDir, 'node_modules', 'electron');

  // 确保目标目录存在
  const destNodeModules = path.join(appResourcesDir, 'node_modules');
  if (!fs.existsSync(destNodeModules)) {
    fs.mkdirSync(destNodeModules, { recursive: true });
  }

  // 复制 electron 目录
  copyDirRecursive(electronSrc, electronDest);
  console.log('[afterPack] Electron module copied');

  // 复制 electron/dist 中的资源文件到 appOutDir
  const electronDist = path.join(__dirname, '..', 'node_modules', 'electron', 'dist');
  const destResources = path.join(appOutDir, 'resources');

  // 复制 Electron 资源文件
  const resourcesToCopy = [
    'default_app.asar',
  ];

  for (const resource of resourcesToCopy) {
    const src = path.join(electronDist, 'resources', resource);
    const dest = path.join(destResources, resource);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`[afterPack] Copied ${resource}`);
    }
  }

  console.log('[afterPack] Complete!');
};

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      try {
        fs.copyFileSync(srcPath, destPath);
      } catch (err) {
        if (!err.message.includes('EBUSY')) {
          console.warn(`[afterPack] Warning: Failed to copy ${srcPath}: ${err.message}`);
        }
      }
    }
  }
}
