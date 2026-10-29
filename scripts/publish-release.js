#!/usr/bin/env node
// scripts/publish-release.js
// 发布脚本 - 自动化发布流程

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('');
  console.log(`${colors.blue}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.blue}  ${title}${colors.reset}`);
  console.log(`${colors.blue}${'='.repeat(60)}${colors.reset}`);
  console.log('');
}

// 读取 package.json
function readPackageJson() {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const content = fs.readFileSync(packagePath, 'utf-8');
  return JSON.parse(content);
}

// 执行命令
function execute(command, options = {}) {
  log(`${colors.yellow}$ ${command}${colors.reset}`);
  try {
    execSync(command, { stdio: 'inherit', ...options });
    return true;
  } catch (error) {
    log(`❌ 命令执行失败: ${error.message}`, 'red');
    return false;
  }
}

// 主函数
function main() {
  logSection('NetOps Platform 发布流程');
  
  // 1. 读取当前版本
  const pkg = readPackageJson();
  const version = pkg.version;
  log(`📦 当前版本: ${version}`, 'green');
  
  // 2. 检查 Git 状态
  logSection('检查 Git 状态');
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' });
    if (status.trim()) {
      log('⚠️  有未提交的更改，请先提交或暂存', 'yellow');
      log(status, 'yellow');
      process.exit(1);
    }
    log('✅ Git 工作区干净', 'green');
  } catch (error) {
    log('❌ Git 状态检查失败', 'red');
    process.exit(1);
  }
  
  // 3. 运行测试
  logSection('运行测试');
  if (!execute('npm run test:unit')) {
    log('❌ 测试失败，停止发布', 'red');
    process.exit(1);
  }
  
  // 4. 构建应用
  logSection('构建应用');
  if (!execute('npm run build')) {
    log('❌ 构建失败，停止发布', 'red');
    process.exit(1);
  }
  
  // 5. 打包 Electron 应用
  logSection('打包 Electron 应用');
  log('正在打包 Windows 版本...', 'blue');
  if (!execute('npm run electron:build:win')) {
    log('❌ Windows 打包失败', 'red');
    process.exit(1);
  }
  
  log('正在打包 macOS 版本...', 'blue');
  if (!execute('npm run electron:build:mac')) {
    log('⚠️  macOS 打包失败（可能需要在 macOS 环境下运行）', 'yellow');
  }
  
  log('正在打包 Linux 版本...', 'blue');
  if (!execute('npm run electron:build:linux')) {
    log('⚠️  Linux 打包失败（可能需要在 Linux 环境下运行）', 'yellow');
  }
  
  // 6. 创建 Git 标签
  logSection('创建 Git 标签');
  if (!execute(`git tag v${version}`)) {
    log('⚠️  Git 标签创建失败（可能已存在）', 'yellow');
  }
  
  // 7. 推送到远程仓库
  logSection('推送到远程仓库');
  if (!execute('git push origin main')) {
    log('❌ 推送失败', 'red');
    process.exit(1);
  }
  
  if (!execute(`git push origin v${version}`)) {
    log('⚠️  标签推送失败', 'yellow');
  }
  
  // 8. 提示手动操作
  logSection('发布完成');
  log('✅ 本地构建和推送完成！', 'green');
  log('', 'reset');
  log('📝 后续步骤：', 'blue');
  log('1. 访问 GitHub Releases 页面', 'yellow');
  log('2. 编辑 Release 说明', 'yellow');
  log('3. 上传 release/ 目录下的安装包', 'yellow');
  log('4. 发布 Release', 'yellow');
  log('', 'reset');
  log('💡 提示：也可以使用 GitHub Actions 自动发布', 'blue');
  log('   访问：Actions → CD - Package and Release → Run workflow', 'blue');
}

main();
