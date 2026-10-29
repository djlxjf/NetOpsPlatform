import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import './styles/design-tokens.css'
import './styles/datacenter-tokens.css'
import './styles/main.scss'
import logger from './utils/logger'

// Sentry 错误监控（可选，需要配置 DSN）
// import * as Sentry from '@sentry/vue'

// 快捷键系统
import shortcutManager, { initShortcuts } from './plugins/shortcutManager'
import shortcutDirective from './directives/shortcut'

// ============ Electron API 兼容层注入 ============
// 在浏览器/Capacitor 环境下模拟 window.electronAPI
// 若已在 Electron 环境中（preload 已注入），则保留原生实现
import electronPolyfill from './electron-polyfill.js'
if (typeof window !== 'undefined' && !window.electronAPI) {
  window.electronAPI = electronPolyfill
  logger.debug('[NetOps] electronAPI polyfill loaded')
}
// ===================================================

const app = createApp(App)

// 全局错误处理器 - 捕获组件内的运行时错误
app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue Error]', err)
  console.error('[Vue Error Info]', info)
  if (instance?.$options?.__name) {
    console.error('[Vue Error Component]', instance.$options.__name)
  }
}

// 捕获未处理的 Promise 错误
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason)
})

// Sentry 错误监控初始化（可选）
// 取消注释并配置 DSN 以启用错误监控
/*
if (process.env.NODE_ENV === 'production') {
  Sentry.init({
    app,
    dsn: 'https://your-dsn@sentry.io/your-project',
    environment: import.meta.env.MODE,
    release: 'netops-platform@' + (import.meta.env.VITE_APP_VERSION || '1.0.0'),
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration()
    ],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0
  })
}
*/

// 注册所有 Element Plus 图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 注册快捷键指令
app.directive('shortcut', shortcutDirective)

app.use(createPinia())
app.use(router)
app.use(ElementPlus, { size: 'default', zIndex: 3000 })

// 初始化快捷键管理器
initShortcuts()

// 将 router 暴露给快捷键管理器
window.__VUE_ROUTER__ = router

// ===================================================
// 自主优化系统初始化
// ===================================================
if (process.env.NODE_ENV === 'production') {
  console.log('[NetOps] Initializing Autonomous Optimization System...');
  
  // 动态导入优化组件（避免影响初始加载）
  const initOptimizationSystem = async () => {
    try {
      // 1. 导入并启动性能监控器
      const { getPerformanceMonitor } = await import('./utils/autonomousPerformanceMonitor.js')
      const performanceMonitor = getPerformanceMonitor({
        thresholds: {
          fcp: 1500,
          lcp: 2500,
          fid: 100,
          cls: 0.1,
          memory: 500 * 1024 * 1024  // 500MB
        },
        onOptimizationTrigger: (trigger, data) => {
          console.log('[AutonomousOptimizer] Optimization triggered:', trigger, data);
        },
        onAnomalyDetected: (anomalies) => {
          console.warn('[AutonomousOptimizer] Anomalies detected:', anomalies);
        }
      });
      
      performanceMonitor.start();
      window.__PERFORMANCE_MONITOR__ = performanceMonitor;
      
      // 2. 导入并启动智能路由器
      const { getIntelligentRouter } = await import('./utils/intelligentRouter.js')
      const intelligentRouter = getIntelligentRouter({
        performanceMonitor,
        abTestEnabled: true
      });
      
      const strategy = intelligentRouter.computeOptimalStrategy();
      intelligentRouter.applyStrategy(strategy);
      window.__INTELLIGENT_ROUTER__ = intelligentRouter;
      
      // 3. 导入并启动熔断器
      const { getCircuitBreaker } = await import('./utils/performanceCircuitBreaker.js')
      const circuitBreaker = getCircuitBreaker({
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 60000,
        onStateChange: (newState, oldState, violations) => {
          console.log(`[CircuitBreaker] State changed: ${oldState} -> ${newState}`, violations);
        },
        onTrip: (violations, state) => {
          console.error('[CircuitBreaker] Circuit tripped!', violations);
        },
        onReset: (state) => {
          console.info('[CircuitBreaker] Circuit reset', state);
        }
      });
      
      circuitBreaker.start();
      window.__CIRCUIT_BREAKER__ = circuitBreaker;
      
      console.log('[NetOps] Autonomous Optimization System initialized successfully');
      console.log('[NetOps] Active strategy:', strategy);
      
    } catch (err) {
      console.error('[NetOps] Failed to initialize optimization system:', err);
    }
  };
  
  // 在应用挂载后初始化（避免阻塞渲染）
  app.mount('#app')
  
  // 延迟初始化优化系统
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      initOptimizationSystem();
    }, { timeout: 2000 });
  } else {
    setTimeout(() => {
      initOptimizationSystem();
    }, 2000);
  }
  
} else {
  // 开发环境 - 简单挂载
  app.mount('#app')
  
  // 开发环境下也启用基础性能监控（无自动优化）
  if (process.env.NODE_ENV === 'development') {
    const initDevMonitoring = async () => {
      try {
        const { getPerformanceMonitor } = await import('./utils/autonomousPerformanceMonitor.js')
        const monitor = getPerformanceMonitor({
          thresholds: {
            fcp: 3000,  // 开发环境阈值放宽
            lcp: 5000,
            fid: 300,
            cls: 0.25
          }
        });
        
        monitor.start();
        window.__PERFORMANCE_MONITOR__ = monitor;
        
        console.log('[NetOps] Development performance monitoring enabled');
      } catch (err) {
        console.warn('[NetOps] Failed to load performance monitor:', err);
      }
    };
    
    setTimeout(initDevMonitoring, 3000);
  }
}

// 导出优化系统实例（方便调试）
window.__GET_OPTIMIZATION_REPORT__ = async () => {
  const report = {};
  
  if (window.__PERFORMANCE_MONITOR__) {
    report.performance = window.__PERFORMANCE_MONITOR__.getReport();
  }
  
  if (window.__INTELLIGENT_ROUTER__) {
    report.strategy = window.__INTELLIGENT_ROUTER__.getCurrentStrategy();
  }
  
  if (window.__CIRCUIT_BREAKER__) {
    report.circuitBreaker = window.__CIRCUIT_BREAKER__.getState();
  }
  
  console.table(report);
  return report;
};
