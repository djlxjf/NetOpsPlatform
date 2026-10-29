import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { loadFromDB, saveToDB } from './db-sync-utils'

const CONFIG_DATA_TYPE = 'configs'
// 模板 / 自动备份的独立 localStorage key 前缀（getStorageKey 拼成 netops_<key>_<username>）
const CONFIG_TEMPLATES_KEY = 'config_templates'
const AUTO_BACKUP_KEY = 'auto_backup_config'

// 生成带用户维度的 localStorage key（与 db-sync-utils 的 netops_<dataType>_<username> 惯例一致）
function getStorageKey(key) {
  const username = window.__CURRENT_USER__ || 'default'
  return `netops_${key}_${username}`
}

export const useConfigStore = defineStore('config', () => {
  // 配置项
  const configs = ref([])
  // 配置历史版本
  const history = ref([])
  // 配置模板
  const templates = ref([])
  // 自动备份配置
  const autoBackupConfig = ref(null)
  const loading = ref(false)

  // 从数据库加载所有配置数据
  // 注意：loadFromDB 无返回值，通过传入 ref 的 .value 回填数据（与 ipPool.js 惯例一致）
  async function loadAll() {
    loading.value = true
    try {
      const holder = ref({})
      await loadFromDB(CONFIG_DATA_TYPE, holder)
      const data = holder.value || {}
      if (data) {
        configs.value = data.configs || []
        history.value = data.history || []
        templates.value = data.templates || []
        autoBackupConfig.value = data.autoBackupConfig || null
      }
    } catch (e) {
      console.error('[ConfigStore] 加载配置失败', e)
    } finally {
      loading.value = false
    }
  }

  // 保存所有配置数据到数据库
  async function saveAll() {
    try {
      const data = {
        configs: configs.value,
        history: history.value,
        templates: templates.value,
        autoBackupConfig: autoBackupConfig.value
      }
      await saveToDB(CONFIG_DATA_TYPE, data)
    } catch (e) {
      console.error('[ConfigStore] 保存配置失败', e)
    }
  }

  // 统一保存入口（addConfig/updateConfig/deleteConfig 调用）
  async function save() {
    await saveAll()
  }

  // 保存历史版本（历史随 configs 一起持久化在 CONFIG_DATA_TYPE 中）
  async function saveHistory() {
    await saveAll()
  }

  // 添加新配置
  function addConfig(configData) {
    const config = {
      id: Date.now().toString(),
      name: configData.name,
      deviceId: configData.deviceId,
      deviceName: configData.deviceName,
      deviceIp: configData.deviceIp,
      content: configData.content,
      description: configData.description || '',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    configs.value.unshift(config)
    
    // 保存到历史版本
    history.value.unshift({
      id: Date.now().toString(),
      configId: config.id,
      version: 1,
      content: config.content,
      createdAt: config.createdAt
    })
    
    save()
    saveHistory()
    
    return config
  }

  // 更新配置
  function updateConfig(id, configData) {
    const index = configs.value.findIndex(c => c.id === id)
    if (index !== -1) {
      const oldConfig = configs.value[index]
      const newVersion = oldConfig.version + 1
      
      configs.value[index] = {
        ...oldConfig,
        ...configData,
        version: newVersion,
        updatedAt: new Date().toISOString()
      }
      
      // 保存到历史版本
      history.value.unshift({
        id: Date.now().toString(),
        configId: id,
        version: newVersion,
        content: configData.content !== undefined ? configData.content : oldConfig.content,
        createdAt: new Date().toISOString()
      })
      
      save()
      saveHistory()
      
      return configs.value[index]
    }
    return null
  }

  // 删除配置
  function deleteConfig(id) {
    configs.value = configs.value.filter(c => c.id !== id)
    save()
    // 保留历史记录以便恢复
  }

  // 获取配置
  function getConfig(id) {
    return configs.value.find(c => c.id === id)
  }

  // 获取设备的配置
  function getConfigsByDevice(deviceId) {
    return configs.value.filter(c => c.deviceId === deviceId)
  }

  // 获取配置历史
  function getConfigHistory(configId) {
    return history.value.filter(h => h.configId === configId).sort((a, b) => b.version - a.version)
  }

  // 恢复到历史版本
  function restoreToVersion(configId, historyId) {
    const historyItem = history.value.find(h => h.id === historyId)
    if (historyItem) {
      const config = getConfig(configId)
      if (config) {
        updateConfig(configId, { content: historyItem.content })
        return true
      }
    }
    return false
  }

  // 对比两个版本配置的差异
  function diffConfigs(content1, content2) {
    const lines1 = content1.split('\n')
    const lines2 = content2.split('\n')
    const diff = []
    
    // 简单的行级别差异对比
    for (let i = 0; i < Math.max(lines1.length, lines2.length); i++) {
      const line1 = lines1[i] || ''
      const line2 = lines2[i] || ''
      
      if (line1 !== line2) {
        diff.push({
          line: i + 1,
          old: line1,
          new: line2
        })
      }
    }
    
    return diff
  }

  // 导出配置
  function exportConfig(id) {
    const config = getConfig(id)
    if (config) {
      return {
        name: config.name,
        content: config.content,
        deviceName: config.deviceName,
        exportedAt: new Date().toISOString()
      }
    }
    return null
  }

  // 导出所有配置
  function exportAllConfigs() {
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      configs: configs.value.map(c => ({
        id: c.id,
        name: c.name,
        deviceName: c.deviceName,
        deviceIp: c.deviceIp,
        content: c.content,
        createdAt: c.createdAt
      }))
    }
  }

  // ============ 配置模板管理 ============
  function saveTemplates() {
    localStorage.setItem(getStorageKey(CONFIG_TEMPLATES_KEY), JSON.stringify(templates.value))
  }

  // 添加模板
  function addTemplate(templateData) {
    const template = {
      id: Date.now().toString(),
      name: templateData.name,
      description: templateData.description || '',
      category: templateData.category || '通用',
      content: templateData.content,
      tags: templateData.tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    templates.value.unshift(template)
    saveTemplates()
    return template
  }

  // 更新模板
  function updateTemplate(id, templateData) {
    const index = templates.value.findIndex(t => t.id === id)
    if (index !== -1) {
      templates.value[index] = {
        ...templates.value[index],
        ...templateData,
        updatedAt: new Date().toISOString()
      }
      saveTemplates()
      return templates.value[index]
    }
    return null
  }

  // 删除模板
  function deleteTemplate(id) {
    templates.value = templates.value.filter(t => t.id !== id)
    saveTemplates()
  }

  // 获取所有模板
  function getTemplates() {
    return templates.value
  }

  // 根据分类获取模板
  function getTemplatesByCategory(category) {
    if (!category || category === '全部') return templates.value
    return templates.value.filter(t => t.category === category)
  }

  // 获取所有分类
  function getTemplateCategories() {
    const categories = new Set(templates.value.map(t => t.category))
    return ['全部', ...Array.from(categories)]
  }

  // 应用模板到配置
  function applyTemplate(templateId, configData) {
    const template = templates.value.find(t => t.id === templateId)
    if (!template) return null
    
    return {
      ...configData,
      content: template.content,
      name: configData.name || template.name,
      description: configData.description || template.description
    }
  }

  // ============ 自动备份配置 ============
  function saveAutoBackupConfig() {
    localStorage.setItem(getStorageKey(AUTO_BACKUP_KEY), JSON.stringify(autoBackupConfig.value))
  }

  // 启用自动备份
  function enableAutoBackup(config) {
    autoBackupConfig.value = {
      enabled: true,
      interval: config.interval || 'daily', // daily, weekly, monthly
      keepVersions: config.keepVersions || 10,
      includeDevices: config.includeDevices || 'all', // all, selected
      selectedDeviceIds: config.selectedDeviceIds || [],
      lastBackup: null,
      nextBackup: calculateNextBackup(config.interval || 'daily'),
      ...config
    }
    saveAutoBackupConfig()
    return autoBackupConfig.value
  }

  // 禁用自动备份
  function disableAutoBackup() {
    if (autoBackupConfig.value) {
      autoBackupConfig.value.enabled = false
      saveAutoBackupConfig()
    }
  }

  // 计算下次备份时间
  function calculateNextBackup(interval) {
    const now = new Date()
    switch (interval) {
      case 'daily':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
      case 'weekly':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      case 'monthly':
        return new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString()
      default:
        return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
    }
  }

  // 执行自动备份
  function runAutoBackup() {
    if (!autoBackupConfig.value || !autoBackupConfig.value.enabled) {
      return { success: false, message: '自动备份未启用' }
    }

    const now = new Date().toISOString()
    
    // 检查是否需要备份
    if (autoBackupConfig.value.nextBackup && autoBackupConfig.value.nextBackup > now) {
      return { success: false, message: '未到备份时间' }
    }

    // 获取需要备份的设备
    let devicesToBackup = []
    if (autoBackupConfig.value.includeDevices === 'all') {
      devicesToBackup = configs.value
    } else {
      devicesToBackup = configs.value.filter(c => 
        autoBackupConfig.value.selectedDeviceIds.includes(c.deviceId)
      )
    }

    // 执行备份
    const backupResults = []
    for (const config of devicesToBackup) {
      try {
        // 创建备份版本
        const backupVersion = {
          id: Date.now().toString() + '_' + config.id,
          configId: config.id,
          version: config.version + 1,
          content: config.content,
          createdAt: now,
          isBackup: true,
          backupNote: '自动备份'
        }
        history.value.unshift(backupVersion)
        
        // 更新配置版本号
        config.version += 1
        config.updatedAt = now
        
        backupResults.push({
          configId: config.id,
          configName: config.name,
          success: true
        })
      } catch (e) {
        backupResults.push({
          configId: config.id,
          configName: config.name,
          success: false,
          error: e.message
        })
      }
    }

    // 清理旧版本（保留指定数量）
    if (autoBackupConfig.value.keepVersions > 0) {
      for (const config of configs.value) {
        const configHistory = history.value.filter(h => h.configId === config.id)
        if (configHistory.length > autoBackupConfig.value.keepVersions) {
          const sortedHistory = configHistory.sort((a, b) => 
            new Date(b.createdAt) - new Date(a.createdAt)
          )
          const toRemove = sortedHistory.slice(autoBackupConfig.value.keepVersions)
          history.value = history.value.filter(h => 
            !toRemove.some(r => r.id === h.id)
          )
        }
      }
    }

    // 更新备份时间
    autoBackupConfig.value.lastBackup = now
    autoBackupConfig.value.nextBackup = calculateNextBackup(autoBackupConfig.value.interval)
    saveAutoBackupConfig()
    save()
    saveHistory()

    return {
      success: true,
      message: `自动备份完成，共备份 ${backupResults.filter(r => r.success).length} 个配置`,
      results: backupResults,
      nextBackup: autoBackupConfig.value.nextBackup
    }
  }

  // 检查是否需要备份（供定时器调用）
  function checkAndRunAutoBackup() {
    if (!autoBackupConfig.value || !autoBackupConfig.value.enabled) {
      return null
    }

    const now = new Date()
    const nextBackup = new Date(autoBackupConfig.value.nextBackup)

    if (now >= nextBackup) {
      return runAutoBackup()
    }

    return null
  }

  return {
    configs,
    history,
    templates,
    autoBackupConfig,
    loading,
    loadAll,
    saveAll,
    addConfig,
    updateConfig,
    deleteConfig,
    getConfig,
    getConfigsByDevice,
    getConfigHistory,
    restoreToVersion,
    diffConfigs,
    exportConfig,
    exportAllConfigs,
    // 模板管理
    addTemplate,
    updateTemplate,
    deleteTemplate,
    getTemplates,
    getTemplatesByCategory,
    getTemplateCategories,
    applyTemplate,
    // 自动备份
    enableAutoBackup,
    disableAutoBackup,
    runAutoBackup,
    checkAndRunAutoBackup,
    saveAutoBackupConfig,
    save,
    saveHistory,
    getStorageKey
  }
})
