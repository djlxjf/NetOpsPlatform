/**
 * 设备扫描 Store - 高速扫描版
 */
import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import { isNetworkDevice } from '../utils/deviceClassifier'
import { loadFromDB, saveToDB } from './db-sync-utils'
import devicePanelData from '../data/devicePanelData.js'

export const useDeviceScanStore = defineStore('deviceScan', () => {
  // 扫描状态
  const isScanning = ref(false)
  const scanProgress = reactive({
    completed: 0,
    total: 0
  })
  const scanStatus = ref('idle') // idle, starting, scanning, completed, error
  const scanError = ref('')
  const scanStage = ref('') // onvif, arp, ping, port, done
  const scanMessage = ref('')

  // 扫描结果
  const foundDevices = ref([])
  const scanHistory = ref([])

  // 自动扫描设置
  const autoScanEnabled = ref(true)
  const autoScanDelay = ref(3000)

  // 删除设备黑名单（用户手动删除/下架的设备，扫描时跳过）
  const deletedDeviceBlacklist = ref([])
  
  // 初始化时从数据库加载
  ;(async () => {
    await loadFromDB('scanHistory', scanHistory)
    await loadFromDB('deletedDeviceBlacklist', deletedDeviceBlacklist)
  })()

  // 将设备加入删除黑名单
  async function addToBlacklist(deviceId, deviceIp) {
    const key = deviceId || deviceIp || ''
    if (!key || deletedDeviceBlacklist.value.includes(key)) return
    deletedDeviceBlacklist.value.push(key)
    await saveToDB('deletedDeviceBlacklist', deletedDeviceBlacklist.value)
  }

  // 从黑名单移除（用户重新添加设备时调用）
  async function removeFromBlacklist(deviceId, deviceIp) {
    const key = deviceId || deviceIp || ''
    deletedDeviceBlacklist.value = deletedDeviceBlacklist.value.filter(k => k !== key)
    await saveToDB('deletedDeviceBlacklist', deletedDeviceBlacklist.value)
  }

  // 判断设备是否在黑名单中
  function isDeviceBlacklisted(d) {
    return deletedDeviceBlacklist.value.includes(d.id) || deletedDeviceBlacklist.value.includes(d.ip)
  }

  /**
   * 清空扫描结果
   */
  function clearResults() {
    foundDevices.value = []
    scanProgress.completed = 0
    scanProgress.total = 0
    scanStatus.value = 'idle'
    scanError.value = ''
    scanStage.value = ''
    scanMessage.value = ''
  }

  /**
   * 开始扫描
   */
  async function startScan(options = {}) {
    if (isScanning.value) {
      return { success: false, error: '扫描正在进行中' }
    }

    isScanning.value = true
    scanStatus.value = 'starting'
    scanProgress.completed = 0
    scanProgress.total = 0
    scanError.value = ''
    foundDevices.value = []
    scanStage.value = ''
    scanMessage.value = '正在启动扫描...'

    try {
      if (window.electronAPI?.startDeviceScan) {
        const result = await window.electronAPI.startDeviceScan(options)

        if (result.success) {
          // 过滤黑名单设备：用户手动删除的设备不再显示在扫描结果中
          foundDevices.value = (result.devices || []).filter(d => !isDeviceBlacklisted(d))
          scanStatus.value = 'completed'
          addToHistory(foundDevices.value)
          scanMessage.value = `扫描完成，发现 ${foundDevices.value.length} 个设备`
          return { success: true, devices: foundDevices.value }
        } else {
          scanStatus.value = 'error'
          scanError.value = result.error || '扫描失败'
          scanMessage.value = result.error || '扫描失败'
          return result
        }
      } else {
        console.warn('[设备扫描] Electron API不可用')
        scanStatus.value = 'error'
        scanError.value = 'Electron API 不可用'
        isScanning.value = false
        return { success: false, error: 'Electron API 不可用' }
      }
    } catch (err) {
      isScanning.value = false
      scanStatus.value = 'error'
      scanError.value = err.message
      scanMessage.value = err.message
      return { success: false, error: err.message }
    }
  }

  /**
   * 获取扫描结果
   */
  async function getScanResults() {
    if (window.electronAPI?.getScanResults) {
      const result = await window.electronAPI.getScanResults()
      if (result.success) {
        isScanning.value = result.isScanning || false
        foundDevices.value = result.results || []
        scanProgress.completed = result.progress?.completed || 0
        scanProgress.total = result.progress?.total || 0
      }
      return result
    }
    return { success: true, results: foundDevices.value }
  }

  /**
   * 监听扫描事件（在组件mounted时调用）
   */
  function setupListeners() {
    // 扫描清空事件
    if (window.electronAPI?.onScanClear) {
      window.electronAPI.onScanClear(() => {
        clearResults()
      })
    }

    // 扫描状态变化
    if (window.electronAPI?.onScanStatus) {
      window.electronAPI.onScanStatus((data) => {
        scanStatus.value = data.status

        if (data.status === 'starting') {
          isScanning.value = true
          if (data.message) scanMessage.value = data.message
        } else if (data.status === 'completed') {
          isScanning.value = false
          if (data.devices) {
            foundDevices.value = data.devices
            addToHistory(data.devices)
          }
          scanMessage.value = `扫描完成，共发现 ${data.totalFound || foundDevices.value.length} 个设备`
        } else if (data.status === 'error') {
          isScanning.value = false
          scanError.value = data.error || '扫描失败'
          scanMessage.value = data.error || '扫描失败'
        }
      })
    }

    // 发现设备
    if (window.electronAPI?.onDeviceFound) {
      window.electronAPI.onDeviceFound((device) => {
        // 去重添加
        const exists = foundDevices.value.some(d => d.ip === device.ip)
        if (!exists) {
          foundDevices.value.push(device)
        }
      })
    }

    // 扫描进度
    if (window.electronAPI?.onScanProgress) {
      window.electronAPI.onScanProgress((data) => {
        scanProgress.completed = data.completed || 0
        scanProgress.total = data.total || 0
        if (data.stage) scanStage.value = data.stage
        if (data.message) scanMessage.value = data.message
      })
    }
  }

  /**
   * 移除事件监听器（在组件unmounted时调用）
   */
  function removeListeners() {
    // 空实现，因为当前监听方式不支持移除
    // 如果需要支持移除，需要保存回调引用并使用 removeListener
  }

  /**
   * 添加到历史记录
   */
  function addToHistory(devices) {
    scanHistory.value.unshift({
      timestamp: new Date().toISOString(),
      deviceCount: devices.length,
      devices: [...devices]
    })

    if (scanHistory.value.length > 10) {
      scanHistory.value = scanHistory.value.slice(0, 10)
    }
  }

  // 根据扫描结果推断设备类型
  function inferDeviceType(d) {
    const text = ((d.type || '') + ' ' + (d.name || '') + ' ' + (d.model || '')).toLowerCase()
    if (text.includes('switch') || text.includes('交换机')) return 'switch'
    if (text.includes('router') || text.includes('路由')) return 'router'
    if (text.includes('firewall') || text.includes('防火墙') || text.includes('安全') || text.includes('网御') || text.includes('网闸')) return 'firewall'
    if (text.includes('wireless') || text.includes('无线') || text.includes('ap')) return 'wireless'
    if (text.includes('loadbalancer') || text.includes('负载均衡')) return 'loadbalancer'
    if (text.includes('gateway') || text.includes('网关')) return 'gateway'
    return 'other'
  }

  /**
   * 根据扫描到的型号/厂商信息，自动匹配面板库中的型号
   * @param {Object} d - 扫描到的设备数据
   * @returns {Object} { vendor, model } 匹配后的厂商和型号
   */
  function matchDeviceModel(d) {
    const scannedModel = (d.model || '').trim()
    const scannedVendor = (d.vendor || '').trim()
    const scannedName = (d.name || '').trim()

    // 优先：如果扫描到的 model 能精确匹配面板库，直接返回
    if (scannedModel && devicePanelData[scannedModel]) {
      return {
        vendor: devicePanelData[scannedModel].vendor || scannedVendor || '未知',
        model: scannedModel
      }
    }

    // 其次：尝试模糊匹配 model（忽略大小写、空格）
    const scannedModelLower = scannedModel.toLowerCase().replace(/\s+/g, '')
    if (scannedModelLower) {
      for (const key of Object.keys(devicePanelData)) {
        const keyLower = key.toLowerCase().replace(/\s+/g, '')
        if (keyLower === scannedModelLower || scannedModelLower.includes(keyLower) || keyLower.includes(scannedModelLower)) {
          return {
            vendor: devicePanelData[key].vendor || scannedVendor || '未知',
            model: key
          }
        }
      }
    }

    // 再次：从设备名称中尝试提取型号关键词
    const nameLower = scannedName.toLowerCase().replace(/\s+/g, '')
    if (nameLower) {
      for (const key of Object.keys(devicePanelData)) {
        const keyLower = key.toLowerCase().replace(/\s+/g, '')
        if (nameLower.includes(keyLower)) {
          return {
            vendor: devicePanelData[key].vendor || scannedVendor || '未知',
            model: key
          }
        }
      }
    }

    // 未匹配到，返回原始值
    return {
      vendor: scannedVendor || '未知',
      model: scannedModel || '未知型号'
    }
  }

  function importToDeviceManager() {
    return foundDevices.value
      .filter(d => isNetworkDevice(d))
      // 黑名单过滤：用户手动删除的设备不再自动加回
      .filter(d => !isDeviceBlacklisted(d))
      .map(d => {
        const matched = matchDeviceModel(d)
        return {
          name: d.name || `${matched.vendor} ${matched.model}`,
          ip: d.ip,
          vendor: matched.vendor,
          type: inferDeviceType(d),
          model: matched.model,
          status: 'online',
          location: '',
          loginType: 'web',
          port: String(d.port || 80),
          remark: `自动扫描发现 (${d.protocol || 'unknown'})`
        }
      })
  }

  return {
    // 状态
    isScanning,
    scanProgress,
    scanStatus,
    scanError,
    scanStage,
    scanMessage,
    foundDevices,
    scanHistory,
    autoScanEnabled,
    autoScanDelay,
    deletedDeviceBlacklist,

    // 方法
    startScan,
    getScanResults,
    setupListeners,
    removeListeners,
    clearResults,
    addToHistory,
    importToDeviceManager,
    addToBlacklist,
    removeFromBlacklist,
    isDeviceBlacklisted
  }
})
