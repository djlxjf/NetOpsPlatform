/**
 * 统一日志工具
 * 替代 console.log，提供统一的日志记录功能
 */

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

// 当前日志级别，可以通过环境变量或配置修改
const currentLogLevel = process.env.NODE_ENV === 'production' ? LOG_LEVELS.warn : LOG_LEVELS.debug

const logger = {
  /**
   * 调试日志 - 开发环境使用
   * @param {...any} args - 日志内容
   */
  debug(...args) {
    if (currentLogLevel <= LOG_LEVELS.debug) {
      console.debug('[DEBUG]', ...args)
    }
  },

  /**
   * 信息日志 - 重要状态信息
   * @param {...any} args - 日志内容
   */
  info(...args) {
    if (currentLogLevel <= LOG_LEVELS.info) {
      console.info('[INFO]', ...args)
    }
  },

  /**
   * 警告日志 - 需要注意但不影响运行的情况
   * @param {...any} args - 日志内容
   */
  warn(...args) {
    if (currentLogLevel <= LOG_LEVELS.warn) {
      console.warn('[WARN]', ...args)
    }
  },

  /**
   * 错误日志 - 错误信息
   * @param {...any} args - 日志内容
   */
  error(...args) {
    if (currentLogLevel <= LOG_LEVELS.error) {
      console.error('[ERROR]', ...args)
    }
  },

  /**
   * 数据恢复日志 - 专门记录数据恢复相关操作
   * @param {...any} args - 日志内容
   */
  dataRecovery(...args) {
    if (currentLogLevel <= LOG_LEVELS.info) {
      console.info('[数据恢复]', ...args)
    }
  },

  /**
   * 设备库同步日志 - 专门记录设备库同步相关操作
   * @param {...any} args - 日志内容
   */
  deviceSync(...args) {
    if (currentLogLevel <= LOG_LEVELS.info) {
      console.info('[设备库同步]', ...args)
    }
  },

  /**
   * 拓扑同步日志 - 专门记录拓扑同步相关操作
   * @param {...any} args - 日志内容
   */
  topologySync(...args) {
    if (currentLogLevel <= LOG_LEVELS.info) {
      console.info('[拓扑同步]', ...args)
    }
  },

  /**
   * 监控日志 - 专门记录监控相关操作
   * @param {...any} args - 日志内容
   */
  monitoring(...args) {
    if (currentLogLevel <= LOG_LEVELS.info) {
      console.info('[Monitoring]', ...args)
    }
  }
}

export default logger
