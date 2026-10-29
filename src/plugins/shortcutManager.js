/**
 * 全局快捷键管理器
 * 管理应用的键盘快捷键，支持注册、注销和触发
 */

class ShortcutManager {
  constructor() {
    this.shortcuts = new Map() // key: shortcut string, value: { handler, description, scope }
    this.handlers = new Map() // key: shortcut string, value: handler function
    this.isListening = false
    this.initialized = false
  }
  
  /**
   * 初始化快捷键管理器
   */
  init() {
    if (this.initialized) return
    
    // 从 localStorage 加载用户自定义的快捷键
    this.loadCustomShortcuts()
    
    // 注册默认的快捷键
    this.registerDefaults()
    
    // 开始监听键盘事件
    this.startListening()
    
    this.initialized = true
  }
  
  /**
   * 注册快捷键
   * @param {string} shortcut - 快捷键组合，如 'Ctrl+S'
   * @param {Function} handler - 处理函数
   * @param {string} description - 描述
   * @param {string} scope - 作用域（global, devices, cabinets, etc.）
   */
  register(shortcut, handler, description = '', scope = 'global') {
    const normalizedKey = this.normalizeShortcut(shortcut)
    
    if (this.shortcuts.has(normalizedKey)) {
      console.warn(`[ShortcutManager] 快捷键已被注册: ${shortcut}`)
    }
    
    this.shortcuts.set(normalizedKey, {
      shortcut: normalizedKey,
      original: shortcut,
      handler,
      description,
      scope
    })
    
    this.handlers.set(normalizedKey, handler)
  }
  
  /**
   * 注销快捷键
   * @param {string} shortcut - 快捷键组合
   */
  unregister(shortcut) {
    const normalizedKey = this.normalizeShortcut(shortcut)
    this.shortcuts.delete(normalizedKey)
    this.handlers.delete(normalizedKey)
  }
  
  /**
   * 触发快捷键
   * @param {KeyboardEvent} e - 键盘事件
   * @returns {boolean} 是否处理了该快捷键
   */
  trigger(e) {
    const shortcut = this.eventToShortcut(e)
    
    if (this.handlers.has(shortcut)) {
      const handler = this.handlers.get(shortcut)
      if (typeof handler === 'function') {
        handler(e)
        return true
      }
    }
    
    return false
  }
  
  /**
   * 获取所有已注册的快捷键
   * @returns {Array} 快捷键列表
   */
  getAllShortcuts() {
    return Array.from(this.shortcuts.values())
  }
  
  /**
   * 获取指定作用域的快捷键
   * @param {string} scope - 作用域
   * @returns {Array} 快捷键列表
   */
  getShortcutsByScope(scope) {
    return this.getAllShortcuts().filter(s => s.scope === scope)
  }
  
  /**
   * 更新快捷键
   * @param {string} oldShortcut - 旧快捷键
   * @param {string} newShortcut - 新快捷键
   */
  updateShortcut(oldShortcut, newShortcut) {
    const normalizedOld = this.normalizeShortcut(oldShortcut)
    const normalizedNew = this.normalizeShortcut(newShortcut)
    
    if (this.shortcuts.has(normalizedNew) && normalizedNew !== normalizedOld) {
      throw new Error(`快捷键已被占用: ${newShortcut}`)
    }
    
    const shortcutData = this.shortcuts.get(normalizedOld)
    if (shortcutData) {
      shortcutData.shortcut = normalizedNew
      shortcutData.original = newShortcut
      
      this.handlers.set(normalizedNew, shortcutData.handler)
      this.handlers.delete(normalizedOld)
      
      this.shortcuts.set(normalizedNew, shortcutData)
      this.shortcuts.delete(normalizedOld)
      
      // 保存到 localStorage
      this.saveCustomShortcuts()
    }
  }
  
  /**
   * 重置快捷键到默认
   */
  resetToDefaults() {
    this.shortcuts.clear()
    this.handlers.clear()
    this.registerDefaults()
    localStorage.removeItem('netops-custom-shortcuts')
  }
  
  /**
   * 开始监听键盘事件
   */
  startListening() {
    if (this.isListening) return
    
    document.addEventListener('keydown', (e) => {
      // 检查是否在输入框中
      const tag = e.target.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        return
      }
      
      this.trigger(e)
    })
    
    this.isListening = true
  }
  
  /**
   * 停止监听键盘事件
   */
  stopListening() {
    // 注意：这里不实际移除监听器，因为其他组件可能也在使用
    // 实际使用中，应该只在应用销毁时调用
  }
  
  // ============ 私有方法 ============
  
  /**
   * 标准化快捷键字符串
   */
  normalizeShortcut(shortcut) {
    const keys = shortcut.split('+').map(k => k.trim().toLowerCase())
    const key = keys[keys.length - 1]
    const modifiers = keys.slice(0, -1).sort()
    
    return [...modifiers, key].join('+')
  }
  
  /**
   * 将键盘事件转换为快捷键字符串
   */
  eventToShortcut(e) {
    const parts = []
    
    if (e.ctrlKey || e.metaKey) {
      parts.push('ctrl')
    }
    if (e.shiftKey) {
      parts.push('shift')
    }
    if (e.altKey) {
      parts.push('alt')
    }
    
    parts.push(e.key.toLowerCase())
    
    return parts.join('+')
  }
  
  /**
   * 注册默认快捷键
   */
  registerDefaults() {
    // 保存
    this.register('Ctrl+S', () => {
      document.dispatchEvent(new CustomEvent('shortcut-save'))
    }, '保存', 'global')
    
    // 搜索
    this.register('Ctrl+F', () => {
      document.dispatchEvent(new CustomEvent('shortcut-search'))
    }, '搜索', 'global')
    
    // 新建
    this.register('Ctrl+N', () => {
      document.dispatchEvent(new CustomEvent('shortcut-new'))
    }, '新建', 'global')
    
    // 删除
    this.register('Delete', () => {
      document.dispatchEvent(new CustomEvent('shortcut-delete'))
    }, '删除', 'global')
    
    // 刷新
    this.register('F5', () => {
      document.dispatchEvent(new CustomEvent('shortcut-refresh'))
    }, '刷新', 'global')
    
    // 帮助
    this.register('F1', () => {
      document.dispatchEvent(new CustomEvent('shortcut-help'))
    }, '帮助', 'global')
    
    // 导航 - 设备
    this.register('Alt+1', () => {
      this.navigateTo('/devices')
    }, '转到设备管理', 'global')
    
    // 导航 - 机柜
    this.register('Alt+2', () => {
      this.navigateTo('/cabinets')
    }, '转到机柜管理', 'global')
    
    // 导航 - 拓扑
    this.register('Alt+3', () => {
      this.navigateTo('/topology')
    }, '转到拓扑视图', 'global')
    
    // 导航 - 仪表盘
    this.register('Alt+4', () => {
      this.navigateTo('/dashboard')
    }, '转到仪表盘', 'global')
  }
  
  /**
   * 导航到指定路径
   */
  navigateTo(path) {
    const router = window.__VUE_ROUTER__
    if (router) {
      router.push(path)
    }
  }
  
  /**
   * 保存自定义快捷键到 localStorage
   */
  saveCustomShortcuts() {
    const customShortcuts = {}
    this.shortcuts.forEach((value, key) => {
      customShortcuts[value.original] = value.shortcut
    })
    localStorage.setItem('netops-custom-shortcuts', JSON.stringify(customShortcuts))
  }
  
  /**
   * 从 localStorage 加载自定义快捷键
   */
  loadCustomShortcuts() {
    try {
      const saved = localStorage.getItem('netops-custom-shortcuts')
      if (saved) {
        const customShortcuts = JSON.parse(saved)
        // 这里需要应用自定义的快捷键
        // 实际实现中，需要在 registerDefaults 之后应用这些自定义设置
      }
    } catch (e) {
      console.error('[ShortcutManager] 加载自定义快捷键失败:', e)
    }
  }
}

// 创建全局实例
const shortcutManager = new ShortcutManager()

// 导出
export default shortcutManager

// 在应用启动时初始化
export function initShortcuts() {
  shortcutManager.init()
}
