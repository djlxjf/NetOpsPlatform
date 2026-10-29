#!/usr/bin/env node
// scripts/version-manager.js
// 版本管理脚本 - 自动化版本号和更新日志管理

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

// 读取 package.json
function readPackageJson() {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const content = fs.readFileSync(packagePath, 'utf-8');
  return JSON.parse(content);
}

// 写入 package.json
function writePackageJson(data) {
  const packagePath = path.join(__dirname, '..', 'package.json');
  fs.writeFileSync(packagePath, JSON.stringify(data, null, 2) + '\n');
}

// 读取 CHANGELOG.md
function readChangelog() {
  const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
  if (!fs.existsSync(changelogPath)) {
    return '# Changelog\n\n所有项目变更记录在此文件中。\n\n';
  }
  return fs.readFileSync(changelogPath, 'utf-8');
}

// 写入 CHANGELOG.md
function writeChangelog(content) {
  const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
  fs.writeFileSync(changelogPath, content);
}

// 获取当前版本
function getCurrentVersion() {
  const pkg = readPackageJson();
  return pkg.version;
}

// 解析版本号
function parseVersion(version) {
  const parts = version.split('.');
  return {
    major: parseInt(parts[0]) || 0,
    minor: parseInt(parts[1]) || 0,
    patch: parseInt(parts[2]) || 0
  };
}

// 增加版本号
function incrementVersion(type = 'patch') {
  const pkg = readPackageJson();
  const current = parseVersion(pkg.version);
  
  switch (type) {
    case 'major':
      current.major += 1;
      current.minor = 0;
      current.patch = 0;
      break;
    case 'minor':
      current.minor += 1;
      current.patch = 0;
      break;
    case 'patch':
    default:
      current.patch += 1;
      break;
  }
  
  const newVersion = `${current.major}.${current.minor}.${current.patch}`;
  pkg.version = newVersion;
  writePackageJson(pkg);
  
  log(`✅ 版本已更新: ${getCurrentVersion()} → ${newVersion}`, 'green');
  return newVersion;
}

// 生成更新日志条目
function generateChangelogEntry(version, changes) {
  const date = new Date().toISOString().split('T')[0];
  let entry = `## [${version}] - ${date}\n\n`;
  
  if (changes && changes.length > 0) {
    changes.forEach(change => {
      entry += `- ${change}\n`;
    });
  } else {
    entry += '- 更新内容待补充\n';
  }
  
  entry += '\n';
  return entry;
}

// 更新 CHANGELOG.md
function updateChangelog(version, changes) {
  const currentChangelog = readChangelog();
  const newEntry = generateChangelogEntry(version, changes);
  
  // 在标题后插入新条目
  const lines = currentChangelog.split('\n');
  const headerEndIndex = lines.findIndex(line => line.startsWith('## ['));
  
  if (headerEndIndex === -1) {
    // 没有现有条目，添加到末尾
    const updatedChangelog = currentChangelog + '\n' + newEntry;
    writeChangelog(updatedChangelog);
  } else {
    // 在第一个条目前插入
    lines.splice(headerEndIndex, 0, newEntry.trim());
    writeChangelog(lines.join('\n'));
  }
  
  log(`✅ CHANGELOG.md 已更新`, 'green');
}

// 创建 Git 标签
function createGitTag(version) {
  try {
    execSync(`git tag v${version}`, { stdio: 'inherit' });
    execSync(`git push origin v${version}`, { stdio: 'inherit' });
    log(`✅ Git 标签 v${version} 已创建并推送`, 'green');
  } catch (error) {
    log(`❌ 创建 Git 标签失败: ${error.message}`, 'red');
  }
}

// 提交更改
function commitChanges(version, message) {
  try {
    execSync('git add package.json CHANGELOG.md', { stdio: 'inherit' });
    execSync(`git commit -m "chore: release v${version} - ${message}"`, { stdio: 'inherit' });
    execSync('git push', { stdio: 'inherit' });
    log(`✅ 更改已提交并推送`, 'green');
  } catch (error) {
    log(`❌ 提交更改失败: ${error.message}`, 'red');
  }
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'patch':
    case 'minor':
    case 'major':
      const newVersion = incrementVersion(command);
      const changes = args.slice(1);
      updateChangelog(newVersion, changes);
      commitChanges(newVersion, changes.join(' ') || '版本更新');
      createGitTag(newVersion);
      break;
      
    case 'current':
      log(`当前版本: ${getCurrentVersion()}`, 'blue');
      break;
      
    case 'changelog':
      const version = args[1] || getCurrentVersion();
      const changelogChanges = args.slice(2);
      updateChangelog(version, changelogChanges);
      break;
      
    default:
      log('使用方法:', 'yellow');
      log('  node scripts/version-manager.js patch [更改描述...]', 'blue');
      log('  node scripts/version-manager.js minor [更改描述...]', 'blue');
      log('  node scripts/version-manager.js major [更改描述...]', 'blue');
      log('  node scripts/version-manager.js current', 'blue');
      log('  node scripts/version-manager.js changelog [版本] [更改描述...]', 'blue');
      break;
  }
}

main();
