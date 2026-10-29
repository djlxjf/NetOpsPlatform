/**
 * Autonomous Performance Monitor
 * 自主性能监控器 - 持续收集性能指标并触发优化
 */

export class AutonomousPerformanceMonitor {
  constructor(options = {}) {
    this.metrics = {
      webVitals: {},
      resourceTiming: [],
      memoryUsage: [],
      queryPerformance: [],
      bundleLoadTime: {},
      navigationTiming: {}
    };
    
    this.thresholds = {
      fcp: 1500,        // ms
      lcp: 2500,        // ms
      fid: 100,         // ms
      cls: 0.1,
      memory: 500 * 1024 * 1024,  // 500MB in bytes
      queryTime: 100    // ms
    };
    
    this.optimizationHistory = [];
    this.anomalyDetector = new AnomalyDetector();
    this.isRunning = false;
    this.monitoringInterval = null;
    
    // 合并自定义阈值
    this.thresholds = { ...this.thresholds, ...options.thresholds };
    
    // 回调函数
    this.onOptimizationTrigger = options.onOptimizationTrigger || null;
    this.onAnomalyDetected = options.onAnomalyDetected || null;
  }
  
  /**
   * 启动自主监控
   */
  start() {
    if (this.isRunning) {
      console.warn('[AutonomousOptimizer] Monitor already running');
      return;
    }
    
    this.isRunning = true;
    
    // 观察 Web Vitals
    this.observeWebVitals();
    
    // 观察资源加载
    this.observeResourceTiming();
    
    // 观察内存使用
    this.observeMemoryUsage();
    
    // 观察导航性能
    this.observeNavigationTiming();
    
    // 定期检测异常
    this.monitoringInterval = setInterval(() => {
      this.detectAnomalies();
    }, 60000);
    
    console.log('[AutonomousOptimizer] Performance monitoring started');
  }
  
  /**
   * 观察 Web Vitals
   */
  observeWebVitals() {
    // FCP - First Contentful Paint
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          this.metrics.webVitals.fcp = entry.startTime;
          this.evaluateMetric('fcp', entry.startTime);
        });
      }).observe({ type: 'paint' });
    } catch (err) {
      console.warn('[AutonomousOptimizer] FCP observation not supported:', err.message);
    }
    
    // LCP - Largest Contentful Paint
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          this.metrics.webVitals.lcp = entry.startTime;
          this.evaluateMetric('lcp', entry.startTime);
        });
      }).observe({ type: 'largest-contentful-paint' });
    } catch (err) {
      console.warn('[AutonomousOptimizer] LCP observation not supported:', err.message);
    }
    
    // FID - First Input Delay
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          const fid = entry.processingStart - entry.startTime;
          this.metrics.webVitals.fid = fid;
          this.evaluateMetric('fid', fid);
        });
      }).observe({ type: 'first-input' });
    } catch (err) {
      console.warn('[AutonomousOptimizer] FID observation not supported:', err.message);
    }
    
    // CLS - Cumulative Layout Shift
    try {
      let clsValue = 0;
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        });
        this.metrics.webVitals.cls = clsValue;
        this.evaluateMetric('cls', clsValue);
      }).observe({ type: 'layout-shift' });
    } catch (err) {
      console.warn('[AutonomousOptimizer] CLS observation not supported:', err.message);
    }
  }
  
  /**
   * 观察资源加载时间
   */
  observeResourceTiming() {
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          // 只记录大于 100ms 的资源
          if (entry.duration > 100) {
            this.metrics.resourceTiming.push({
              name: entry.name,
              duration: entry.duration,
              size: entry.transferSize || 0,
              type: entry.initiatorType,
              timestamp: Date.now()
            });
            
            // 检测慢资源
            if (entry.duration > 1000) {
              this.triggerOptimization('slow-resource', {
                resource: entry.name,
                duration: entry.duration,
                size: entry.transferSize
              });
            }
          }
        });
        
        // 保留最近 100 条记录
        if (this.metrics.resourceTiming.length > 100) {
          this.metrics.resourceTiming = this.metrics.resourceTiming.slice(-100);
        }
      }).observe({ type: 'resource', buffered: true });
    } catch (err) {
      console.warn('[AutonomousOptimizer] Resource timing observation not supported:', err.message);
    }
  }
  
  /**
   * 观察内存使用
   */
  observeMemoryUsage() {
    if (!performance.memory) {
      console.warn('[AutonomousOptimizer] performance.memory not supported');
      return;
    }
    
    this.memoryInterval = setInterval(() => {
      const memory = {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        timestamp: Date.now()
      };
      
      this.metrics.memoryUsage.push(memory);
      
      // 保留最近 100 条记录
      if (this.metrics.memoryUsage.length > 100) {
        this.metrics.memoryUsage.shift();
      }
      
      // 检查内存阈值
      if (memory.usedJSHeapSize > this.thresholds.memory) {
        this.triggerOptimization('high-memory', memory);
      }
    }, 5000);
  }
  
  /**
   * 观察导航性能
   */
  observeNavigationTiming() {
    try {
      const entry = performance.getEntriesByType('navigation')[0];
      if (entry) {
        this.metrics.navigationTiming = {
          dns: entry.domainLookupEnd - entry.domainLookupStart,
          tcp: entry.connectEnd - entry.connectStart,
          ttfb: entry.responseStart - entry.requestStart,
          download: entry.responseEnd - entry.responseStart,
          domInteractive: entry.domInteractive,
          domComplete: entry.domComplete,
          loadEvent: entry.loadEventEnd
        };
      }
    } catch (err) {
      console.warn('[AutonomousOptimizer] Navigation timing not available:', err.message);
    }
  }
  
  /**
   * 评估指标是否超标
   */
  evaluateMetric(metric, value) {
    const threshold = this.thresholds[metric];
    if (!threshold) return;
    
    const isViolated = metric === 'cls' 
      ? value > threshold 
      : value > threshold;
    
    if (isViolated) {
      const excess = metric === 'cls'
        ? ((value - threshold) / threshold * 100).toFixed(1) + '%'
        : ((value - threshold) / threshold * 100).toFixed(1) + '%';
      
      console.warn(`[AutonomousOptimizer] ${metric.toUpperCase()} violation:`, {
        value: metric === 'cls' ? value.toFixed(3) : value.toFixed(0) + 'ms',
        threshold: metric === 'cls' ? threshold.toFixed(3) : threshold + 'ms',
        excess
      });
      
      this.triggerOptimization(`poor-${metric}`, { metric, value, threshold });
    }
  }
  
  /**
   * 触发优化
   */
  triggerOptimization(trigger, data) {
    console.log('[AutonomousOptimizer] Triggering optimization:', trigger, data);
    
    // 记录优化历史
    const historyEntry = {
      timestamp: Date.now(),
      trigger,
      data,
      status: 'pending'
    };
    this.optimizationHistory.push(historyEntry);
    
    // 保留最近 50 条记录
    if (this.optimizationHistory.length > 50) {
      this.optimizationHistory.shift();
    }
    
    // 调用回调函数
    if (this.onOptimizationTrigger) {
      this.onOptimizationTrigger(trigger, data);
    }
    
    // 根据触发条件调用相应的优化器
    switch (trigger) {
      case 'poor-fcp':
      case 'poor-lcp':
        this.requestBundleOptimization();
        break;
      case 'poor-fid':
        this.requestCodeSplitting();
        break;
      case 'high-memory':
        this.requestMemoryOptimization();
        break;
      case 'slow-resource':
        this.requestResourceOptimization(data);
        break;
    }
  }
  
  /**
   * 检测异常模式
   */
  detectAnomalies() {
    const anomalies = this.anomalyDetector.detect(this.metrics);
    
    if (anomalies.length > 0) {
      console.warn('[AutonomousOptimizer] Anomalies detected:', anomalies);
      
      // 调用回调函数
      if (this.onAnomalyDetected) {
        this.onAnomalyDetected(anomalies);
      }
      
      // 检查熔断
      this.checkCircuitBreaker(anomalies);
    }
  }
  
  /**
   * 检查熔断条件
   */
  checkCircuitBreaker(anomalies) {
    // 检查最近的优化是否导致性能退化
    const recentOptimizations = this.optimizationHistory
      .filter(h => Date.now() - h.timestamp < 300000) // 最近 5 分钟
      .filter(h => h.status === 'applied');
    
    if (recentOptimizations.length > 0) {
      // 检查是否性能退化
      const currentFCP = this.metrics.webVitals.fcp;
      if (currentFCP && currentFCP > this.thresholds.fcp * 1.5) {
        console.error('[AutonomousOptimizer] Circuit breaker tripped! Rolling back optimizations');
        this.rollbackOptimizations(recentOptimizations);
      }
    }
  }
  
  /**
   * 请求 Bundle 优化
   */
  requestBundleOptimization() {
    window.dispatchEvent(new CustomEvent('autonomous-optimization', {
      detail: {
        type: 'bundle-optimization',
        metrics: this.metrics.webVitals
      }
    }));
  }
  
  /**
   * 请求代码分割优化
   */
  requestCodeSplitting() {
    window.dispatchEvent(new CustomEvent('autonomous-optimization', {
      detail: {
        type: 'code-splitting',
        metrics: this.metrics.webVitals
      }
    }));
  }
  
  /**
   * 请求内存优化
   */
  requestMemoryOptimization() {
    window.dispatchEvent(new CustomEvent('autonomous-optimization', {
      detail: {
        type: 'memory-optimization',
        memory: this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1]
      }
    }));
  }
  
  /**
   * 请求资源优化
   */
  requestResourceOptimization(data) {
    window.dispatchEvent(new CustomEvent('autonomous-optimization', {
      detail: {
        type: 'resource-optimization',
        resource: data
      }
    }));
  }
  
  /**
   * 回滚优化
   */
  rollbackOptimizations(optimizations) {
    window.dispatchEvent(new CustomEvent('autonomous-rollback', {
      detail: { optimizations }
    }));
  }
  
  /**
   * 获取性能报告
   */
  getReport() {
    return {
      metrics: this.metrics,
      thresholds: this.thresholds,
      optimizationHistory: this.optimizationHistory,
      recommendations: this.generateRecommendations(),
      score: this.calculatePerformanceScore()
    };
  }
  
  /**
   * 计算性能分数
   */
  calculatePerformanceScore() {
    let score = 100;
    
    // FCP 扣分
    if (this.metrics.webVitals.fcp) {
      if (this.metrics.webVitals.fcp > this.thresholds.fcp) {
        score -= Math.min(30, (this.metrics.webVitals.fcp - this.thresholds.fcp) / this.thresholds.fcp * 30);
      }
    }
    
    // LCP 扣分
    if (this.metrics.webVitals.lcp) {
      if (this.metrics.webVitals.lcp > this.thresholds.lcp) {
        score -= Math.min(30, (this.metrics.webVitals.lcp - this.thresholds.lcp) / this.thresholds.lcp * 30);
      }
    }
    
    // FID 扣分
    if (this.metrics.webVitals.fid) {
      if (this.metrics.webVitals.fid > this.thresholds.fid) {
        score -= Math.min(20, (this.metrics.webVitals.fid - this.thresholds.fid) / this.thresholds.fid * 20);
      }
    }
    
    // CLS 扣分
    if (this.metrics.webVitals.cls) {
      if (this.metrics.webVitals.cls > this.thresholds.cls) {
        score -= Math.min(20, (this.metrics.webVitals.cls - this.thresholds.cls) / this.thresholds.cls * 20);
      }
    }
    
    return Math.max(0, Math.round(score));
  }
  
  /**
   * 生成优化建议
   */
  generateRecommendations() {
    const recommendations = [];
    
    if (this.metrics.webVitals.fcp > this.thresholds.fcp) {
      recommendations.push({
        priority: 'P0',
        action: '启用激进代码分割',
        expectedImprovement: '30-50% FCP 减少',
        trigger: 'poor-fcp'
      });
    }
    
    if (this.metrics.webVitals.lcp > this.thresholds.lcp) {
      recommendations.push({
        priority: 'P0',
        action: '预加载关键资源',
        expectedImprovement: '20-40% LCP 减少',
        trigger: 'poor-lcp'
      });
    }
    
    if (this.metrics.webVitals.fid > this.thresholds.fid) {
      recommendations.push({
        priority: 'P1',
        action: '减少主线程工作',
        expectedImprovement: '30-50% FID 减少',
        trigger: 'poor-fid'
      });
    }
    
    if (this.metrics.memoryUsage.length > 0) {
      const latestMemory = this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1];
      if (latestMemory.usedJSHeapSize > this.thresholds.memory) {
        recommendations.push({
          priority: 'P1',
          action: '为大型列表实现虚拟滚动',
          expectedImprovement: '40-60% 内存减少',
          trigger: 'high-memory'
        });
      }
    }
    
    // 资源优化建议
    const slowResources = this.metrics.resourceTiming
      .filter(r => r.duration > 1000)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5);
    
    if (slowResources.length > 0) {
      recommendations.push({
        priority: 'P1',
        action: '优化慢资源加载',
        details: slowResources.map(r => ({
          resource: r.name.split('/').pop(),
          duration: r.duration.toFixed(0) + 'ms',
          size: (r.size / 1024).toFixed(1) + 'KB'
        })),
        expectedImprovement: '20-40% 加载时间减少'
      });
    }
    
    return recommendations;
  }
  
  /**
   * 停止监控
   */
  stop() {
    this.isRunning = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
      this.memoryInterval = null;
    }
    
    console.log('[AutonomousOptimizer] Performance monitoring stopped');
  }
}

/**
 * 异常检测器
 */
class AnomalyDetector {
  detect(metrics) {
    const anomalies = [];
    
    // 检测极端 FCP
    if (metrics.webVitals.fcp > 5000) {
      anomalies.push({
        type: 'extreme-fcp',
        value: metrics.webVitals.fcp,
        severity: 'critical',
        message: 'FCP 极端缓慢，可能网络问题或代码错误'
      });
    }
    
    // 检测极端 LCP
    if (metrics.webVitals.lcp > 10000) {
      anomalies.push({
        type: 'extreme-lcp',
        value: metrics.webVitals.lcp,
        severity: 'critical',
        message: 'LCP 极端缓慢，最大内容绘制失败'
      });
    }
    
    // 检测内存泄漏
    if (metrics.memoryUsage.length >= 10) {
      const recent = metrics.memoryUsage.slice(-10);
      const trend = this.calculateTrend(recent.map(m => m.usedJSHeapSize));
      
      if (trend > 0.1) {  // 内存持续增长
        anomalies.push({
          type: 'memory-leak',
          trend: trend.toFixed(3),
          severity: 'high',
          message: '检测到可能的内存泄漏，内存使用持续增长'
        });
      }
    }
    
    // 检测资源加载异常
    const recentResources = metrics.resourceTiming
      .filter(r => Date.now() - r.timestamp < 300000);  // 最近 5 分钟
    
    if (recentResources.length > 0) {
      const avgDuration = recentResources.reduce((sum, r) => sum + r.duration, 0) / recentResources.length;
      
      if (avgDuration > 3000) {
        anomalies.push({
          type: 'slow-resources',
          averageDuration: avgDuration.toFixed(0) + 'ms',
          count: recentResources.length,
          severity: 'medium',
          message: '资源加载缓慢，平均加载时间超过 3 秒'
        });
      }
    }
    
    return anomalies;
  }
  
  calculateTrend(values) {
    const n = values.length;
    if (n < 2) return 0;
    
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope / values[0];  // 归一化
  }
}

// 导出单例
let instance = null;

export function getPerformanceMonitor(options) {
  if (!instance) {
    instance = new AutonomousPerformanceMonitor(options);
  }
  return instance;
}

export default AutonomousPerformanceMonitor;
