/**
 * 数据库同步工具 - 帮助Store快速集成SQLite数据库
 * 
 * 使用示例：
 * import { createDBSyncedStore } from './db-sync-utils'
 * 
 * export const useMyStore = defineStore('myStore', () => {
 *   const data = ref([])
 *   
 *   // 自动从数据库加载，失败则降级到localStorage
 *   await loadFromDB('myDataType', data)
 *   
 *   // 保存时同时保存到数据库和localStorage
 *   async function save() {
 *     await saveToDB('myDataType', data.value)
 *     localStorage.setItem('mykey', JSON.stringify(data.value))
 *   }
 * })
 */

import logger from '../utils/logger'

/**
 * 从数据库加载数据
 * @param {string} dataType - 数据类型标识（如 'configs', 'stats'等）
 * @param {ref} stateRef - Vue ref对象
 */
export async function loadFromDB(dataType, stateRef) {
  try {
    const username = window.__CURRENT_USER__ || 'default'
    
    if (window.electronAPI) {
      const result = await window.electronAPI.dbJsonLoad({ userId: username, dataType })
      if (result?.success && result?.data !== null) {
        stateRef.value = result.data
        logger.info(`[DBSync] 从数据库加载${dataType}:`, result.data)
        return
      }
    }
  } catch (e) {
    logger.error(`[DBSync] 从数据库加载${dataType}失败:`, e)
  }
  
  // 降级到localStorage
  try {
    const username = window.__CURRENT_USER__ || 'default'
    const key = `netops_${dataType}_${username}`
    const saved = localStorage.getItem(key)
    if (saved) {
      stateRef.value = JSON.parse(saved)
      logger.info(`[DBSync] 从localStorage加载${dataType}`)
    }
  } catch (e) {
    logger.error(`[DBSync] 从localStorage加载${dataType}失败:`, e)
  }
}

/**
 * 深拷贝为可结构化克隆的纯数据：剥离 Vue reactive Proxy。
 *
 * IPC（contextBridge invoke）使用结构化克隆算法，无法克隆 Vue 的 reactive Proxy，
 * 直接发送会抛 "An object could not be cloned"，导致 Electron 下落库静默失败、
 * 只剩 localStorage 兜底。故发送前先转成纯对象/数组。
 * JSON 往返与下方 localStorage 分支的 JSON.stringify 语义一致（Date 等同样转字符串）。
 * @param {any} value
 * @returns {any}
 */
function toPlain(value) {
  if (value === undefined || value === null) return null
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (e) {
    // 循环引用等无法序列化：记录后退回原值，交由 IPC 报错兜底，不静默吞掉
    logger.error('[DBSync] 数据序列化失败，已退回原值:', e)
    return value
  }
}

/**
 * 保存数据到数据库
 * @param {string} dataType - 数据类型标识
 * @param {any} data - 要保存的数据
 */
export async function saveToDB(dataType, data) {
  try {
    const username = window.__CURRENT_USER__ || 'default'

    if (window.electronAPI) {
      await window.electronAPI.dbJsonSave({
        userId: username,
        dataType,
        data: toPlain(data)
      })
      return { success: true }
    }
  } catch (e) {
    logger.error(`[DBSync] 保存${dataType}到数据库失败:`, e)
  }
  
  // 同时保存到localStorage（备份 + Web兼容）
  try {
    const username = window.__CURRENT_USER__ || 'default'
    const key = `netops_${dataType}_${username}`
    localStorage.setItem(key, JSON.stringify(data))
  } catch (e) {
    logger.error(`[DBSync] 保存${dataType}到localStorage失败:`, e)
  }
  
  return { success: true }
}
