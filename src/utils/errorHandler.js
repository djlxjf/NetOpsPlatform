/**
 * 统一错误处理工具
 * 提供统一的错误处理机制
 */

import logger from './logger.js'

/**
 * 异步函数包装器 - 自动捕获和处理错误
 * @param {Function} fn - 异步函数
 * @param {Object} options - 配置选项
 * @returns {Function} - 包装后的函数
 */
export function asyncHandler(fn, options = {}) {
  const { context = 'Unknown', showNotification = true } = options

  return async function (...args) {
    try {
      return await fn.apply(this, args)
    } catch (error) {
      handleError(error, { context, showNotification })
      return null
    }
  }
}

/**
 * 同步函数包装器 - 自动捕获和处理错误
 * @param {Function} fn - 同步函数
 * @param {Object} options - 配置选项
 * @returns {Function} - 包装后的函数
 */
export function syncHandler(fn, options = {}) {
  const { context = 'Unknown', showNotification = false } = options

  return function (...args) {
    try {
      return fn.apply(this, args)
    } catch (error) {
      handleError(error, { context, showNotification })
      return null
    }
  }
}

/**
 * 统一错误处理函数
 * @param {Error} error - 错误对象
 * @param {Object} options - 配置选项
 */
export function handleError(error, options = {}) {
  const {
    context = 'Unknown',
    showNotification = true,
    level = 'error'
  } = options

  // 记录错误日志
  const errorMessage = `[${context}] ${error.message || '未知错误'}`
  logger[level](errorMessage, error)

  // 在开发环境下打印完整错误堆栈
  if (process.env.NODE_ENV === 'development') {
    console.error('错误详情:', error)
  }

  // 显示用户通知（如果需要）
  if (showNotification && typeof window !== 'undefined') {
    // 这里可以集成 Element Plus 的消息提示
    // 需要在调用处传入 ElMessage 等
    if (options.elMessage) {
      options.elMessage({
        message: errorMessage,
        type: level === 'error' ? 'error' : 'warning',
        duration: 5000
      })
    }
  }

  return {
    success: false,
    error: errorMessage,
    originalError: error
  }
}

/**
 * API 调用错误处理
 * @param {Error} error - API 错误
 * @param {string} context - 上下文描述
 */
export function handleApiError(error, context = 'API调用') {
  let message = '请求失败'

  if (error.response) {
    // 服务器返回了错误状态码
    message = `服务器错误 (${error.response.status}): ${error.response.statusText || '未知错误'}`
  } else if (error.request) {
    // 请求已发出但没有收到响应
    message = '网络连接失败，请检查网络'
  } else {
    // 请求配置出错
    message = error.message || '请求配置错误'
  }

  logger.error(`[${context}] ${message}`, error)
  return {
    success: false,
    error: message,
    originalError: error
  }
}

/**
 * 数据库操作错误处理
 * @param {Error} error - 数据库错误
 * @param {string} operation - 操作描述
 */
export function handleDbError(error, operation = '数据库操作') {
  const message = `数据库${operation}失败: ${error.message || '未知错误'}`
  logger.error(message, error)
  return {
    success: false,
    error: message,
    originalError: error
  }
}

export default {
  asyncHandler,
  syncHandler,
  handleError,
  handleApiError,
  handleDbError
}
