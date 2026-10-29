const fs = require('fs');
const path = require('path');

const electronSource = path.join(__dirname, '..', 'node_modules', 'electron');
const electronDest = path.join('D:/NetOps-Platform-Release/win-unpacked/resources/app/node_modules/electron');
const winUnpackedDir = path.join('D:/NetOps-Platform-Release/win-unpacked');

console.log('Fixing electron module for packaged app...');

// Files needed for electron module
const files = [
  'index.js',
  'path.txt',
  'package.json',
  'cli.js',
  'LICENSE',
  'README.md',
  'checksums.json'
];

// Create destination directory
if (!fs.existsSync(electronDest)) {
  fs.mkdirSync(electronDest, { recursive: true });
}

// Create dist directory inside electron module
const distDir = path.join(electronDest, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy electron module files
for (const file of files) {
  const src = path.join(electronSource, file);
  const dest = path.join(electronDest, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log('Copied:', file);
  }
}

// Copy NetOpsPlatform.exe to electron/dist folder
// This is needed because electron's index.js expects the exe in node_modules/electron/dist/
const exeSource = path.join(winUnpackedDir, 'NetOpsPlatform.exe');
const exeDest = path.join(distDir, 'NetOpsPlatform.exe');
if (fs.existsSync(exeSource)) {
  fs.copyFileSync(exeSource, exeDest);
  console.log('Copied NetOpsPlatform.exe to electron/dist/');
}

// Fix path.txt to point to NetOpsPlatform.exe
fs.writeFileSync(path.join(electronDest, 'path.txt'), 'NetOpsPlatform.exe');
console.log('Set path.txt to NetOpsPlatform.exe');

console.log('Done!');
