/**
 * 键盘快捷键指令
 * 使用方法：v-shortcut:handler="'Ctrl+S'"
 * 其中 handler 是回调函数，'Ctrl+S' 是快捷键组合
 */

export default {
  mounted(el, binding) {
    const handler = binding.arg
    const shortcut = binding.value
    
    if (!handler || !shortcut) return
    
    // 解析快捷键组合
    const keys = shortcut.split('+')
    const key = keys[keys.length - 1].toLowerCase()
    const modifiers = keys.slice(0, -1).map(m => m.toLowerCase())
    
    // 检查修饰键
    const ctrlRequired = modifiers.includes('ctrl') || modifiers.includes('cmd')
    const shiftRequired = modifiers.includes('shift')
    const altRequired = modifiers.includes('alt')
    
    // 创建事件处理函数
    const keyHandler = (e) => {
      // 检查是否在输入框中（如果是，不触发快捷键）
      const tag = e.target.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        return
      }
      
      // 检查按键和修饰键
      if (
        e.key.toLowerCase() === key &&
        (e.ctrlKey || e.metaKey) === ctrlRequired &&
        e.shiftKey === shiftRequired &&
        e.altKey === altRequired
      ) {
        e.preventDefault()
        // 调用绑定的处理函数
        if (typeof binding.value === 'function') {
          binding.value(e)
        } else if (el[handler]) {
          el[handler](e)
        }
      }
    }
    
    // 保存到元素上，以便卸载时清理
    el._shortcutHandler = keyHandler
    el._shortcutKey = shortcut
    
    // 添加到全局快捷键管理器
    document.addEventListener('keydown', keyHandler)
  },
  
  unmounted(el) {
    // 清理事件监听器
    if (el._shortcutHandler) {
      document.removeEventListener('keydown', el._shortcutHandler)
      delete el._shortcutHandler
      delete el._shortcutKey
    }
  }
}

/**
 * 快捷键解析工具
 */
export function parseShortcut(shortcut) {
  const keys = shortcut.split('+')
  const key = keys[keys.length - 1]
  const modifiers = keys.slice(0, -1).map(m => m.toLowerCase())
  
  return {
    key: key.toLowerCase(),
    ctrl: modifiers.includes('ctrl') || modifiers.includes('cmd'),
    shift: modifiers.includes('shift'),
    alt: modifiers.includes('alt'),
    original: shortcut
  }
}

/**
 * 格式化快捷键显示
 */
export function formatShortcut(shortcut) {
  const parsed = parseShortcut(shortcut)
  const parts = []
  
  if (parsed.ctrl) {
    parts.push(navigator.platform.includes('Mac') ? '⌘' : 'Ctrl')
  }
  if (parsed.alt) {
    parts.push(navigator.platform.includes('Mac') ? '⌥' : 'Alt')
  }
  if (parsed.shift) {
    parts.push(navigator.platform.includes('Mac') ? '⇧' : 'Shift')
  }
  
  // 格式化主键
  const keyMap = {
    ' ': 'Space',
    'arrowup': '↑',
    'arrowdown': '↓',
    'arrowleft': '←',
    'arrowright': '→',
    'enter': 'Enter',
    'escape': 'Esc',
    'tab': 'Tab',
    'backspace': 'Backspace',
    'delete': 'Del'
  }
  
  parts.push(keyMap[parsed.key] || parsed.key.toUpperCase())
  
  return parts.join(navigator.platform.includes('Mac') ? '' : '+')
}
