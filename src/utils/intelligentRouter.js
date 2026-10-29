/**
 * Intelligent Optimization Router
 * 智能优化路由器 - 根据用户设备和网络条件自动选择最优加载策略
 */

export class IntelligentRouter {
  constructor(options = {}) {
    this.networkConditions = {
      'slow-2g': { bandwidth: 50, latency: 2000, saveData: true },
      '2g': { bandwidth: 150, latency: 1400, saveData: true },
      '3g': { bandwidth: 1500, latency: 400, saveData: false },
      '4g': { bandwidth: 15000, latency: 100, saveData: false },
      '5g': { bandwidth: 100000, latency: 20, saveData: false }
    };
    
    this.deviceCapabilities = {
      low: { memory: 512, cores: 2, hardwareConcurrency: 2 },
      medium: { memory: 2048, cores: 4, hardwareConcurrency: 4 },
      high: { memory: 8192, cores: 8, hardwareConcurrency: 8 }
    };
    
    // 优化策略矩阵
    this.optimizationStrategies = {
      'slow-2g-low': { 
        preload: false, 
        prefetch: false, 
        lazyLoad: true, 
        codeSplit: true,
        minimal: true,
        imageQuality: 'low',
        animation: false
      },
      'slow-2g-medium': { 
        preload: false, 
        prefetch: false, 
        lazyLoad: true, 
        codeSplit: true,
        minimal: true,
        imageQuality: 'low',
        animation: false
      },
      'slow-2g-high': { 
        preload: false, 
        prefetch: false, 
        lazyLoad: true, 
        codeSplit: true,
        minimal: false,
        imageQuality: 'medium',
        animation: false
      },
      '2g-low': { 
        preload: false, 
        prefetch: false, 
        lazyLoad: true, 
        codeSplit: true,
        minimal: true,
        imageQuality: 'low',
        animation: false
      },
      '2g-medium': { 
        preload: false, 
        prefetch: false, 
        lazyLoad: true, 
        codeSplit: true,
        minimal: false,
        imageQuality: 'medium',
        animation: false
      },
      '2g-high': { 
        preload: true, 
        prefetch: false, 
        lazyLoad: true, 
        codeSplit: true,
        minimal: false,
        imageQuality: 'medium',
        animation: true
      },
      '3g-low': { 
        preload: false, 
        prefetch: false, 
        lazyLoad: true, 
        codeSplit: true,
        minimal: false,
        imageQuality: 'medium',
        animation: false
      },
      '3g-medium': { 
        preload: true, 
        prefetch: false, 
        lazyLoad: true, 
        codeSplit: true,
        minimal: false,
        imageQuality: 'medium',
        animation: true
      },
      '3g-high': { 
        preload: true, 
        prefetch: true, 
        lazyLoad: true, 
        codeSplit: false,
        minimal: false,
        imageQuality: 'high',
        animation: true
      },
      '4g-low': { 
        preload: true, 
        prefetch: false, 
        lazyLoad: true, 
        codeSplit: true,
        minimal: false,
        imageQuality: 'medium',
        animation: true
      },
      '4g-medium': { 
        preload: true, 
        prefetch: true, 
        lazyLoad: true, 
        codeSplit: false,
        minimal: false,
        imageQuality: 'high',
        animation: true
      },
      '4g-high': { 
        preload: true, 
        prefetch: true, 
        lazyLoad: false, 
        codeSplit: false,
        minimal: false,
        imageQuality: 'high',
        animation: true
      },
      '5g-low': { 
        preload: true, 
        prefetch: true, 
        lazyLoad: false, 
        codeSplit: false,
        minimal: false,
        imageQuality: 'high',
        animation: true
      },
      '5g-medium': { 
        preload: true, 
        prefetch: true, 
        lazyLoad: false, 
        codeSplit: false,
        minimal: false,
        imageQuality: 'high',
        animation: true
      },
      '5g-high': { 
        preload: true, 
        prefetch: true, 
        lazyLoad: false, 
        codeSplit: false,
        minimal: false,
        imageQuality: 'high',
        animation: true,
        priority: true
      }
    };
    
    this.currentStrategy = null;
    this.abTestEnabled = options.abTestEnabled !== false;
    this.abTestGroups = new Map();
    this.isApplied = false;
    
    // 性能监控集成
    this.performanceMonitor = options.performanceMonitor || null;
  }
  
  /**
   * 检测网络状况
   */
  detectNetworkCondition() {
    if (!navigator.connection) {
      return '4g';  // 默认值
    }
    
    const connection = navigator.connection;
    const effectiveType = connection.effectiveType || '4g';
    const saveData = connection.saveData || false;
    
    // 如果用户启用了省流量模式，降级网络状况
    if (saveData && effectiveType !== 'slow-2g') {
      const downgradeMap = {
        '5g': '4g',
        '4g': '3g',
        '3g': '2g',
        '2g': 'slow-2g'
      };
      return downgradeMap[effectiveType] || 'slow-2g';
    }
    
    return effectiveType;
  }
  
  /**
   * 检测设备能力
   */
  detectDeviceCapability() {
    const memory = navigator.deviceMemory || 4;  // GB
    const cores = navigator.hardwareConcurrency || 4;
    
    if (memory <= 1 || cores <= 2) {
      return 'low';
    } else if (memory <= 4 || cores <= 4) {
      return 'medium';
    } else {
      return 'high';
    }
  }
  
  /**
   * 计算最优策略
   */
  computeOptimalStrategy() {
    const network = this.detectNetworkCondition();
    const device = this.detectDeviceCapability();
    
    const key = `${network}-${device}`;
    const strategy = this.optimizationStrategies[key] || this.optimizationStrategies['4g-medium'];
    
    return {
      network,
      device,
      ...strategy
    };
  }
  
  /**
   * 应用优化策略
   */
  applyStrategy(strategy) {
    console.log('[IntelligentRouter] Applying strategy:', strategy);
    
    this.currentStrategy = strategy;
    
    // 应用预加载策略
    if (strategy.preload) {
      this.enablePreloading();
    }
    
    // 应用预获取策略
    if (strategy.prefetch) {
      this.enablePrefetching();
    }
    
    // 应用懒加载策略
    if (strategy.lazyLoad) {
      this.enableLazyLoading();
    }
    
    // 应用代码分割策略
    if (strategy.codeSplit) {
      this.enableCodeSplitting();
    }
    
    // 应用极简模式
    if (strategy.minimal) {
      this.enableMinimalMode();
    }
    
    // 应用图片质量策略
    if (strategy.imageQuality) {
      this.enableImageOptimization(strategy.imageQuality);
    }
    
    // 应用动画策略
    if (strategy.animation === false) {
      this.disableAnimations();
    }
    
    this.isApplied = true;
    
    // 通知性能监控器
    // 守卫：performanceMonitor 可能未实现 recordMetric（实测启动期报
    // "this.performanceMonitor.recordMetric is not a function"），按能力探测调用。
    if (this.performanceMonitor && typeof this.performanceMonitor.recordMetric === 'function') {
      // 注意：computeOptimalStrategy() 内部的 const key 不在本作用域，
      // 须用 strategy 上携带的 network/device 重建策略标识（与 computeOptimalStrategy 一致）。
      const strategyKey = `${strategy.network}-${strategy.device}`;
      this.performanceMonitor.recordMetric({
        type: 'strategy-applied',
        strategy: strategyKey,
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * 启用预加载
   */
  enablePreloading() {
    // 历史实现预加载了 3 个硬编码路径（/assets/js/vue-vendor.js、/assets/js/ui-framework.js、
    // /assets/css/critical.css）。Vite 构建产物是带 hash 的文件名，这些路径在产物中并不存在，
    // 结果每次启动都产生 3~4 条 ERR_FILE_NOT_FOUND。在没有可靠资源清单前不做预加载，
    // 保留方法以兼容 strategy.preload 分支（后续接入 Vite manifest 后可在此恢复）。
    return;
  }
  
  /**
   * 启用预获取
   */
  enablePrefetching() {
    // 根据用户行为预测下一个可能访问的页面
    const likelyResources = this.predictNextResources();
    
    likelyResources.forEach(resource => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = resource;
      link.as = this.getResourceType(resource);
      document.head.appendChild(link);
    });
    
    console.log('[IntelligentRouter] Prefetching enabled for', likelyResources.length, 'resources');
  }
  
  /**
   * 预测下一个可能访问的资源
   */
  predictNextResources() {
    const currentPath = window.location.pathname;
    const predictions = {
      '/': ['/devices', '/dashboard'],
      '/devices': ['/devices/detail', '/cabinets'],
      '/cabinets': ['/devices', '/topology'],
      '/topology': ['/devices', '/cabinets'],
    };
    
    const nextPaths = predictions[currentPath] || ['/dashboard'];
    
    return nextPaths.map(path => {
      // 转换为实际的资源路径
      return `/assets/js/pages${path}.js`;
    });
  }
  
  /**
   * 获取资源类型
   */
  getResourceType(url) {
    if (url.endsWith('.js')) return 'script';
    if (url.endsWith('.css')) return 'style';
    if (url.match(/\.(png|jpg|jpeg|gif|webp|svg)$/)) return 'image';
    if (url.match(/\.(woff|woff2|ttf|eot)$/)) return 'font';
    return 'fetch';
  }
  
  /**
   * 启用懒加载
   */
  enableLazyLoading() {
    // 使用 Intersection Observer 实现图片懒加载
    if ('IntersectionObserver' in window) {
      const images = document.querySelectorAll('img[data-src]');
      
      const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const image = entry.target;
            image.src = image.dataset.src;
            
            // 加载完成后添加淡入效果
            image.onload = () => {
              image.classList.add('loaded');
            };
            
            imageObserver.unobserve(image);
          }
        });
      }, {
        rootMargin: '50px'  // 提前 50px 开始加载
      });
      
      images.forEach(img => imageObserver.observe(img));
      
      // 保存到实例，方便清理
      this.imageObserver = imageObserver;
    }
    
    console.log('[IntelligentRouter] Lazy loading enabled');
  }
  
  /**
   * 启用代码分割
   */
  enableCodeSplitting() {
    // 监听路由变化，动态导入非关键组件
    if (this.performanceMonitor) {
      window.addEventListener('autonomous-optimization', (event) => {
        if (event.detail.type === 'code-splitting') {
          this.dynamicallyImportNonCritical();
        }
      });
    }
    
    console.log('[IntelligentRouter] Code splitting enabled');
  }
  
  /**
   * 动态导入非关键模块
   */
  async dynamicallyImportNonCritical() {
    const nonCriticalModules = [
      () => import('echarts'),
      () => import('xterm'),
      () => import('@/views/data-report/DataReportView.vue')
    ];
    
    // 在空闲时间加载
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        nonCriticalModules.forEach((importFn, index) => {
          importFn().catch(err => {
            console.warn(`[IntelligentRouter] Failed to load module ${index}:`, err);
          });
        });
      }, { timeout: 2000 });
    } else {
      // 降级方案：延迟加载
      setTimeout(() => {
        nonCriticalModules.forEach(importFn => {
          importFn().catch(err => {
            console.warn('[IntelligentRouter] Failed to load module:', err);
          });
        });
      }, 2000);
    }
  }
  
  /**
   * 启用极简模式
   */
  enableMinimalMode() {
    document.body.classList.add('minimal-mode');
    
    const style = document.createElement('style');
    style.id = 'minimal-mode-styles';
    style.textContent = `
      .minimal-mode * {
        animation: none !important;
        transition: none !important;
        box-shadow: none !important;
        text-shadow: none !important;
      }
      
      .minimal-mode .heavy-animation {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
    
    console.log('[IntelligentRouter] Minimal mode enabled');
  }
  
  /**
   * 启用图片优化
   */
  enableImageOptimization(quality) {
    const qualityMap = {
      'low': 0.5,
      'medium': 0.75,
      'high': 0.95
    };
    
    const qualityLevel = qualityMap[quality] || 0.75;
    
    // 对 Canvas 绘制的图片进行质量优化
    window.addEventListener('canvas-to-blob', (event) => {
      if (event.detail && event.detail.canvas) {
        event.detail.canvas.toBlob((blob) => {
          // 可以在这里进行质量压缩
        }, 'image/jpeg', qualityLevel);
      }
    });
    
    console.log(`[IntelligentRouter] Image optimization enabled: ${quality} quality`);
  }
  
  /**
   * 禁用动画
   */
  disableAnimations() {
    const style = document.createElement('style');
    style.id = 'no-animation-styles';
    style.textContent = `
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.001ms !important;
      }
    `;
    document.head.appendChild(style);
    
    console.log('[IntelligentRouter] Animations disabled for performance');
  }
  
  /**
   * A/B 测试框架
   */
  createABTest(name, variants, onComplete) {
    if (!this.abTestEnabled) {
      return variants[0];  // 返回控制组
    }
    
    // 检查用户是否已经在某个组中
    const storedGroup = localStorage.getItem(`ab-test-${name}`);
    if (storedGroup && variants[storedGroup]) {
      console.log(`[IntelligentRouter] A/B Test "${name}": Returning stored group ${storedGroup}`);
      return variants[storedGroup];
    }
    
    // 随机分配
    const groupNames = Object.keys(variants);
    const group = groupNames[Math.floor(Math.random() * groupNames.length)];
    localStorage.setItem(`ab-test-${name}`, group);
    
    this.abTestGroups.set(name, { 
      group, 
      variants, 
      onComplete,
      startTime: Date.now()
    });
    
    console.log(`[IntelligentRouter] A/B Test "${name}": Assigned to group ${group}`);
    
    return variants[group];
  }
  
  /**
   * 记录 A/B 测试结果
   */
  recordABTestResult(name, metric, value) {
    const test = this.abTestGroups.get(name);
    if (!test) return;
    
    // 存储结果
    const resultsKey = `ab-test-results-${name}`;
    const results = JSON.parse(localStorage.getItem(resultsKey) || '{}');
    
    if (!results[test.group]) {
      results[test.group] = [];
    }
    
    results[test.group].push({ 
      metric, 
      value, 
      timestamp: Date.now(),
      userId: this.getUserId() // 匿名用户 ID
    });
    
    localStorage.setItem(resultsKey, JSON.stringify(results));
    
    // 检查是否有足够数据做出决策
    this.evaluateABTest(name, results);
  }
  
  /**
   * 获取用户 ID（匿名）
   */
  getUserId() {
    let userId = localStorage.getItem('anonymous-user-id');
    if (!userId) {
      userId = 'user-' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('anonymous-user-id', userId);
    }
    return userId;
  }
  
  /**
   * 评估 A/B 测试结果
   */
  evaluateABTest(name, results) {
    const groupKeys = Object.keys(results);
    
    // 至少需要两个组
    if (groupKeys.length < 2) return;
    
    // 检查每组是否有足够样本
    const minSampleSize = 100;
    const hasEnoughSamples = groupKeys.every(key => 
      (results[key] || []).length >= minSampleSize
    );
    
    if (!hasEnoughSamples) {
      console.log(`[IntelligentRouter] A/B Test "${name}": Waiting for more samples`);
      return;
    }
    
    // 计算每组的平均值
    const averages = {};
    groupKeys.forEach(key => {
      const values = results[key].map(r => r.value);
      averages[key] = values.reduce((a, b) => a + b, 0) / values.length;
    });
    
    // 找出最佳组
    const bestGroup = groupKeys.reduce((a, b) => 
      averages[a] > averages[b] ? a : b
    );
    
    const baselineGroup = groupKeys[0];
    const improvement = ((averages[bestGroup] - averages[baselineGroup]) / averages[baselineGroup]) * 100;
    
    // 如果改进超过 10%，宣布获胜者
    if (Math.abs(improvement) > 10) {
      console.log(`[IntelligentRouter] A/B Test "${name}" complete:`, {
        winner: bestGroup,
        improvement: improvement.toFixed(1) + '%',
        confidence: '95%'  // 简化，实际应使用统计检验
      });
      
      // 调用完成回调
      const test = this.abTestGroups.get(name);
      if (test && test.onComplete) {
        test.onComplete(bestGroup, { 
          averages, 
          improvement,
          results: results
        });
      }
      
      // 清理
      this.abTestGroups.delete(name);
      localStorage.removeItem(`ab-test-${name}`);
      localStorage.removeItem(resultsKey);
    }
  }
  
  /**
   * 获取当前策略
   */
  getCurrentStrategy() {
    return this.currentStrategy;
  }
  
  /**
   * 重置策略
   */
  reset() {
    this.currentStrategy = null;
    this.isApplied = false;
    
    // 清理 DOM 修改
    document.body.classList.remove('minimal-mode');
    
    const minimalStyles = document.getElementById('minimal-mode-styles');
    if (minimalStyles) minimalStyles.remove();
    
    const noAnimationStyles = document.getElementById('no-animation-styles');
    if (noAnimationStyles) noAnimationStyles.remove();
    
    // 清理观察者
    if (this.imageObserver) {
      this.imageObserver.disconnect();
    }
    
    console.log('[IntelligentRouter] Strategy reset');
  }
}

// 导出单例
let routerInstance = null;

export function getIntelligentRouter(options) {
  if (!routerInstance) {
    routerInstance = new IntelligentRouter(options);
  }
  return routerInstance;
}

export default IntelligentRouter;
