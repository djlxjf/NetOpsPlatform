import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

/**
 * Autonomous Vite Configuration
 * 自主 Vite 配置 - 简化版本，确保构建通过
 * 
 * 优化策略：先验证后优化
 */
export default defineConfig(({ command, mode }) => {
  const isProduction = mode === 'production'
  const isAnalyze = mode === 'analyze'
  const isDevelopment = mode === 'development'

  return {
    // 关键修复：使用相对 base，避免打包后 renderer 资源以绝对路径 /assets/... 加载
    // （Electron 用 loadFile/file:// 时绝对路径会解析到文件系统根 file:///assets/... 而 404，
    //  且 file:// 协议无法加载 ES module → 黑屏）。配合 main.js 的 app:// 自定义协议使用。
    base: './',

    plugins: [
      vue(),
      
      // Element Plus 自动导入（关闭按需样式导入，因为 main.js 已全量导入）
      AutoImport({
        resolvers: [ElementPlusResolver({ importStyle: false })],
        imports: ['vue', 'vue-router', 'pinia'],
        dts: 'src/auto-imports.d.ts',
      }),
      
      Components({
        resolvers: [ElementPlusResolver({ importStyle: false })],
        dts: 'src/components.d.ts',
      }),
    ],
    
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      },
      // 关键修复：强制所有 `three` 导入（含 three/addons 后期处理 Pass）解析到同一份
      // node_modules/three，避免 Vite 预打包把 postprocessing 的 Pass.js 内联成另一份旧 three
      // 副本，导致 FullScreenQuad 的 Mesh 缺少 Object3D.intersectsFrustum（three r166+ 新增），
      // 触发 "object.intersectsFrustum is not a function" 并使数智机房监控大屏 3D 初始化失败。
      dedupe: ['three']
    },
    
    // 构建优化配置
    build: {
      target: 'esnext',
      
      // 不自动清空 outDir（本环境 genie-safe-delete 拦截 rmSync，需外部手动清理）
      emptyOutDir: false,
      
      // 启用 CSS 代码分割
      cssCodeSplit: true,
      
      // 使用 Vite 默认压缩器（esbuild，更快）
      minify: isProduction ? 'esbuild' : false,
      
      // Esbuild 压缩选项
      esbuild: isProduction ? {
        drop: ['console', 'debugger'],
        pure: ['console.log'],
      } : undefined,
      
      rollupOptions: {
        output: {
          // 智能代码分割配置
          manualChunks: isProduction ? (id) => {
            // Vue 核心库
            // 注意：必须按 node_modules 路径边界匹配。早期版本用 id.includes('vue')，
            // 会误匹配 src 下所有 .vue 文件（扩展名含子串 "vue"），
            // 导致全部视图组件被并入 vue-vendor 分块，懒加载路由的代码分割整体失效。
            if (/[\\/]node_modules[\\/](vue|vue-router|pinia)[\\/]/.test(id)
              || /[\\/]node_modules[\\/]@vue[\\/]/.test(id)
              || /[\\/]node_modules[\\/]@vueuse[\\/]/.test(id)) {
              return 'vue-vendor'
            }
            
            // Element Plus UI 框架
            if (id.includes('element-plus')) {
              return 'ui-framework'
            }
            
            // 图表库 - 大型库单独拆分
            if (id.includes('echarts')) {
              return 'charts'
            }
            
            // 终端组件
            if (id.includes('xterm')) {
              return 'terminal'
            }
            
            // 网络库
            if (id.includes('ssh2') || id.includes('net-snmp') || id.includes('axios')) {
              return 'network'
            }
            
            // 工具库
            if (id.includes('lodash') || id.includes('dayjs') || id.includes('uuid')) {
              return 'utils-vendor'
            }
            
            // 拓扑图库
            if (id.includes('vue-flow') || id.includes('dagre')) {
              return 'topology'
            }

            // 三维渲染库 - 独立分块（与 datacenter-3d 业务代码分离，避免 three 被打入默认/其他 vendor 块）
            if (/[\\/]node_modules[\\/]three[\\/]/.test(id)) {
              return 'three3d'
            }
          } : undefined
        }
      },
      
      // 块大小警告阈值（回落至 700，使大分块告警重新可见、纳入后续监控）
      chunkSizeWarningLimit: 700,
    },
    
    // CSS 配置 - 使用 Vite 内置优化
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
          // 注意：如果需要全局 SCSS 变量，请创建 src/styles/variables.scss 文件
          // additionalData: `@use "@/styles/variables" as *;`
        }
      },
      // 生产环境自动压缩 CSS（Vite 内置）
      minify: isProduction,
    },
    
    // 依赖优化
    optimizeDeps: {
      include: [
        'vue',
        'vue-router',
        'pinia',
        'element-plus',
        'axios',
        'echarts',
        'dayjs',
        // 显式预打包 three 为单一共享分块，确保 three/addons（后期处理 Pass 等）
        // 与 datacenter-3d 引擎共用同一份 three 实例（配合 resolve.dedupe）
        'three',
      ],
      exclude: ['ssh2', 'net-snmp'] // 排除 Node.js 专用模块
    },
    
    // 开发服务器配置
    server: {
      port: 5199,
      strictPort: true,
      preTransformRequests: true,
      // 禁止浏览器缓存任何 dev 资源：曾有浏览器缓存旧 SFC 样式模块，
      // 导致用户在 dev 预览时始终看到修复前的布局（刷新也不更新，须 Ctrl+F5）。
      headers: {
        'Cache-Control': 'no-store',
      },
      // 2026-10-07 忽略 electron-builder 打包产物与构建目录：打包时大量文件写入会让 watcher 崩溃退出
      watch: {
        ignored: ['**/release*/**', '**/release/**', '**/dist/**', '**/.temp/**', '**/node_modules/**']
      },
      hmr: {
        overlay: true
      }
    },
    
    // 环境变量配置
    envPrefix: ['VITE_', 'ELECTRON_'],
    
    // 输出配置
    esbuild: {
      logOverride: {
        'this-is-undefined-in-esm': 'silent'
      }
    },
    
    // 性能优化配置
    json: {
      namedExports: true,
      stringify: true
    },
    
    // 日志级别
    logLevel: isDevelopment ? 'info' : 'warn',
  }
})
