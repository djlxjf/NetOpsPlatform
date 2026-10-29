/**
 * Performance Circuit Breaker
 * 性能熔断器 - 当性能指标超标时自动切断并触发降级
 */

export class PerformanceCircuitBreaker {
  constructor(options = {}) {
    // 电路状态
    this.states = {
      CLOSED: 'CLOSED',      // 正常状态 - 允许所有请求
      OPEN: 'OPEN',          // 熔断状态 - 拒绝所有请求
      HALF_OPEN: 'HALF_OPEN' // 半开状态 - 允许部分请求测试恢复
    };
    
    this.currentState = this.states.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastStateChange = Date.now();
    
    // 配置
    this.config = {
      failureThreshold: options.failureThreshold || 5,       // 失败阈值
      successThreshold: options.successThreshold || 2,       // 成功阈值（半开状态）
      timeout: options.timeout || 60000,                     // 熔断时间（ms）
      monitorWindow: options.monitorWindow || 300000,         // 监控窗口（ms）
      resetTimeoutOnSuccess: options.resetTimeoutOnSuccess !== false,
      ...options
    };
    
    // 性能指标阈值
    this.metricsThresholds = {
      fcp: options.fcpThreshold || 3000,           // 3x 正常阈值
      lcp: options.lcpThreshold || 7500,
      fid: options.fidThreshold || 300,
      cls: options.clsThreshold || 0.25,
      memory: options.memoryThreshold || 1000 * 1024 * 1024,  // 1GB
      errorRate: options.errorRateThreshold || 0.05,  // 5% 错误率
      queryTime: options.queryTimeThreshold || 500     // 500ms
    };
    
    // 数据存储
    this.metricsHistory = [];
    this.failureHistory = [];
    this.isRunning = false;
    
    // 回调函数
    this.onStateChange = options.onStateChange || null;
    this.onTrip = options.onTrip || null;
    this.onReset = options.onReset || null;
    
    // 降级策略
    this.fallbackStrategies = {
      'poor-fcp': this.fallbackForFCP.bind(this),
      'poor-lcp': this.fallbackForLCP.bind(this),
      'high-memory': this.fallbackForMemory.bind(this),
      'slow-query': this.fallbackForQuery.bind(this),
      'high-error-rate': this.fallbackForError.bind(this)
    };
  }
  
  /**
   * 启动熔断器
   */
  start() {
    if (this.isRunning) {
      console.warn('[CircuitBreaker] Already running');
      return;
    }
    
    this.isRunning = true;
    
    // 监听性能指标更新
    window.addEventListener('performance-update', (event) => {
      this.recordMetric(event.detail);
    });
    
    // 监听错误
    window.addEventListener('error', (event) => {
      this.recordError({
        type: 'js-error',
        message: event.message,
        timestamp: Date.now()
      });
    });
    
    window.addEventListener('unhandledrejection', (event) => {
      this.recordError({
        type: 'promise-rejection',
        message: event.reason,
        timestamp: Date.now()
      });
    });
    
    console.log('[CircuitBreaker] Circuit breaker started');
  }
  
  /**
   * 记录指标
   */
  recordMetric(metric) {
    this.metricsHistory.push({
      ...metric,
      timestamp: Date.now()
    });
    
    // 保留监控窗口内的数据
    const cutoff = Date.now() - this.config.monitorWindow;
    this.metricsHistory = this.metricsHistory.filter(m => m.timestamp > cutoff);
    
    // 评估指标
    this.evaluateMetrics();
  }
  
  /**
   * 记录错误
   */
  recordError(error) {
    this.failureHistory.push({
      ...error,
      timestamp: Date.now()
    });
    
    // 保留监控窗口内的数据
    const cutoff = Date.now() - this.config.monitorWindow;
    this.failureHistory = this.failureHistory.filter(e => e.timestamp > cutoff);
    
    // 增加失败计数
    this.failureCount++;
    
    // 检查是否需要熔断
    if (this.failureCount >= this.config.failureThreshold) {
      this.trip();
    }
  }
  
  /**
   * 记录成功
   */
  recordSuccess() {
    if (this.currentState === this.states.HALF_OPEN) {
      this.successCount++;
      
      if (this.successCount >= this.config.successThreshold) {
        this.reset();
      }
    } else if (this.currentState === this.states.CLOSED) {
      // 在正常状态下，逐渐降低失败计数
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }
  
  /**
   * 评估指标
   */
  evaluateMetrics() {
    if (this.metricsHistory.length === 0) return;
    
    const latest = this.metricsHistory[this.metricsHistory.length - 1];
    const violations = [];
    
    // 检查 FCP
    if (latest.fcp && latest.fcp > this.metricsThresholds.fcp) {
      violations.push({
        metric: 'fcp',
        value: latest.fcp,
        threshold: this.metricsThresholds.fcp,
        severity: latest.fcp > this.metricsThresholds.fcp * 2 ? 'critical' : 'high'
      });
    }
    
    // 检查 LCP
    if (latest.lcp && latest.lcp > this.metricsThresholds.lcp) {
      violations.push({
        metric: 'lcp',
        value: latest.lcp,
        threshold: this.metricsThresholds.lcp,
        severity: latest.lcp > this.metricsThresholds.lcp * 2 ? 'critical' : 'high'
      });
    }
    
    // 检查 FID
    if (latest.fid && latest.fid > this.metricsThresholds.fid) {
      violations.push({
        metric: 'fid',
        value: latest.fid,
        threshold: this.metricsThresholds.fid,
        severity: 'medium'
      });
    }
    
    // 检查 CLS
    if (latest.cls && latest.cls > this.metricsThresholds.cls) {
      violations.push({
        metric: 'cls',
        value: latest.cls,
        threshold: this.metricsThresholds.cls,
        severity: 'medium'
      });
    }
    
    // 检查内存
    if (latest.memory && latest.memory > this.metricsThresholds.memory) {
      violations.push({
        metric: 'memory',
        value: latest.memory,
        threshold: this.metricsThresholds.memory,
        severity: latest.memory > this.metricsThresholds.memory * 1.5 ? 'critical' : 'high'
      });
    }
    
    // 检查错误率
    const recentErrors = this.failureHistory.filter(
      e => Date.now() - e.timestamp < 300000
    );
    const recentMetrics = this.metricsHistory.filter(
      m => Date.now() - m.timestamp < 300000
    );
    
    if (recentMetrics.length > 0) {
      const errorRate = recentErrors.length / recentMetrics.length;
      
      if (errorRate > this.metricsThresholds.errorRate) {
        violations.push({
          metric: 'errorRate',
          value: errorRate,
          threshold: this.metricsThresholds.errorRate,
          severity: errorRate > this.metricsThresholds.errorRate * 2 ? 'critical' : 'high'
        });
      }
    }
    
    // 处理违规
    if (violations.length > 0) {
      this.handleViolations(violations);
    } else {
      this.recordSuccess();
    }
  }
  
  /**
   * 处理违规
   */
  handleViolations(violations) {
    // 检查是否有严重违规
    const criticalViolations = violations.filter(v => v.severity === 'critical');
    
    if (criticalViolations.length > 0) {
      console.error('[CircuitBreaker] Critical violations detected:', criticalViolations);
      this.trip(violations);
    } else {
      // 增加失败计数
      this.failureCount++;
      
      if (this.failureCount >= this.config.failureThreshold) {
        this.trip(violations);
      }
    }
  }
  
  /**
   * 熔断
   */
  trip(violations = []) {
    if (this.currentState === this.states.OPEN) return;
    
    console.error('[CircuitBreaker] TRIPPED! Switching to OPEN state');
    console.error('[CircuitBreaker] Violations:', violations);
    
    const previousState = this.currentState;
    this.currentState = this.states.OPEN;
    this.lastStateChange = Date.now();
    
    // 触发降级策略
    this.triggerFallback(violations);
    
    // 调用回调函数
    if (this.onTrip) {
      this.onTrip(violations, this.getState());
    }
    
    if (this.onStateChange) {
      this.onStateChange(this.currentState, previousState, violations);
    }
    
    // 定时尝试恢复
    setTimeout(() => {
      this.moveToHalfOpen();
    }, this.config.timeout);
  }
  
  /**
   * 移动到半开状态
   */
  moveToHalfOpen() {
    console.info('[CircuitBreaker] Moving to HALF_OPEN state');
    
    const previousState = this.currentState;
    this.currentState = this.states.HALF_OPEN;
    this.successCount = 0;
    this.lastStateChange = Date.now();
    
    if (this.onStateChange) {
      this.onStateChange(this.currentState, previousState, []);
    }
  }
  
  /**
   * 重置熔断器
   */
  reset() {
    console.info('[CircuitBreaker] Resetting to CLOSED state');
    
    const previousState = this.currentState;
    this.currentState = this.states.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastStateChange = Date.now();
    
    // 移除降级策略
    this.removeFallback();
    
    if (this.onReset) {
      this.onReset(this.getState());
    }
    
    if (this.onStateChange) {
      this.onStateChange(this.currentState, previousState, []);
    }
  }
  
  /**
   * 触发降级策略
   */
  triggerFallback(violations) {
    console.warn('[CircuitBreaker] Triggering fallback strategies');
    
    violations.forEach(violation => {
      const fallbackFn = this.fallbackStrategies[`poor-${violation.metric}`];
      
      if (fallbackFn) {
        fallbackFn(violation);
      }
    });
    
    // 发送降级事件
    window.dispatchEvent(new CustomEvent('performance-degraded', {
      detail: {
        violations,
        timestamp: Date.now()
      }
    }));
  }
  
  /**
   * FCP 降级策略
   */
  fallbackForFCP(violation) {
    console.warn('[CircuitBreaker] Applying FCP fallback');
    
    // 禁用非关键动画
    document.body.classList.add('performance-degraded');
    
    // 延迟加载非关键资源
    const nonCriticalScripts = document.querySelectorAll('script[data-non-critical]');
    nonCriticalScripts.forEach(script => {
      script.defer = true;
    });
  }
  
  /**
   * LCP 降级策略
   */
  fallbackForLCP(violation) {
    console.warn('[CircuitBreaker] Applying LCP fallback');
    
    // 预连接关键域名
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = window.location.origin;
    document.head.appendChild(link);
    
    // 使用 fetchpriority 标记关键资源
    const criticalResources = document.querySelectorAll('img, script, link[rel="stylesheet"]');
    criticalResources.forEach(resource => {
      if (resource.dataset.critical === 'true') {
        resource.setAttribute('fetchpriority', 'high');
      }
    });
  }
  
  /**
   * 内存降级策略
   */
  fallbackForMemory(violation) {
    console.warn('[CircuitBreaker] Applying memory fallback');
    
    // 尝试垃圾回收
    if (window.gc && typeof window.gc === 'function') {
      window.gc();
      console.log('[CircuitBreaker] Forced garbage collection');
    }
    
    // 清理大模型数据
    this.clearLargeDataStructures();
    
    // 清理缓存
    this.clearCaches();
  }
  
  /**
   * 查询降级策略
   */
  fallbackForQuery(violation) {
    console.warn('[CircuitBreaker] Applying query fallback');
    
    // 发送事件通知查询优化器
    window.dispatchEvent(new CustomEvent('query-degraded', {
      detail: {
        threshold: violation.value,
        timestamp: Date.now()
      }
    }));
  }
  
  /**
   * 错误降级策略
   */
  fallbackForError(violation) {
    console.warn('[CircuitBreaker] Applying error fallback');
    
    // 切换到备用 API 端点
    window.dispatchEvent(new CustomEvent('use-fallback-api', {
      detail: {
        errorRate: violation.value,
        timestamp: Date.now()
      }
    }));
  }
  
  /**
   * 清理大型数据结构
   */
  clearLargeDataStructures() {
    // 清理应用状态中的大型数据
    const stores = ['devices', 'alerts', 'topology'];
    
    stores.forEach(storeName => {
      const store = window[storeName + 'Store'] || 
                    (window.$stores && window.$stores[storeName]);
      
      if (store && store.$state) {
        // 保留最近的 100 条记录
        if (store.$state.list && store.$state.list.length > 100) {
          store.$state.list = store.$state.list.slice(-100);
        }
      }
    });
  }
  
  /**
   * 清理缓存
   */
  clearCaches() {
    // 清理 Service Worker 缓存
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        if (registration.active) {
          registration.active.postMessage({
            type: 'CLEAR_CACHE'
          });
        }
      });
    }
    
    // 清理 localStorage 中的非关键数据
    const criticalKeys = ['auth-token', 'user-preferences', 'theme'];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!criticalKeys.includes(key)) {
        const value = localStorage.getItem(key);
        if (value && value.length > 1000) {  // 只清理大值
          localStorage.removeItem(key);
        }
      }
    }
    
    console.log('[CircuitBreaker] Caches cleared');
  }
  
  /**
   * 移除降级策略
   */
  removeFallback() {
    console.info('[CircuitBreaker] Removing fallback strategies');
    
    document.body.classList.remove('performance-degraded');
    
    // 恢复资源加载
    const nonCriticalScripts = document.querySelectorAll('script[data-non-critical]');
    nonCriticalScripts.forEach(script => {
      script.defer = false;
    });
  }
  
  /**
   * 获取当前状态
   */
  getState() {
    return {
      state: this.currentState,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastStateChange: this.lastStateChange,
      uptime: Date.now() - this.lastStateChange,
      metricsHistory: this.metricsHistory.slice(-20),  // 最近 20 条
      failureHistory: this.failureHistory.slice(-20)
    };
  }
  
  /**
   * 检查是否允许请求
   */
  allowRequest() {
    if (this.currentState === this.states.OPEN) {
      return false;
    }
    
    if (this.currentState === this.states.HALF_OPEN) {
      // 在半开状态下，只允许部分请求
      return Math.random() < 0.3;  // 30% 概率
    }
    
    return true;
  }
  
  /**
   * 手动重置
   */
  manualReset() {
    console.info('[CircuitBreaker] Manual reset triggered');
    this.reset();
  }
  
  /**
   * 停止熔断器
   */
  stop() {
    this.isRunning = false;
    
    // 移除事件监听器
    window.removeEventListener('performance-update', this.recordMetric);
    window.removeEventListener('error', this.recordError);
    window.removeEventListener('unhandledrejection', this.recordError);
    
    console.log('[CircuitBreaker] Circuit breaker stopped');
  }
}

// 导出单例
let breakerInstance = null;

export function getCircuitBreaker(options) {
  if (!breakerInstance) {
    breakerInstance = new PerformanceCircuitBreaker(options);
  }
  return breakerInstance;
}

export default PerformanceCircuitBreaker;
