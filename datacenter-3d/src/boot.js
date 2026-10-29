// 独立运行入口：把 tool-shell.html 注入 #dc-root，再加载 main.js
// main.js 内部会检测 #dc-root 并自动 initDatacenter（见文件末尾 bootstrap）
import shell from './tool-shell.html?raw';

const root = document.getElementById('dc-root');
if (root) {
  root.innerHTML = shell;
} else {
  // 兜底：未提供 #dc-root 时直接挂到 body，保证工具仍可运行
  document.body.insertAdjacentHTML('afterbegin', shell);
}

import('./main.js');
