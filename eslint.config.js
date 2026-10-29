import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import globals from 'globals'
import prettier from 'eslint-plugin-prettier'
import prettierConfig from 'eslint-config-prettier'

export default [
  js.configs.recommended,
  ...vue.configs['flat/recommended'],
  prettierConfig,  // 必须放在最后，禁用冲突规则
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: 'module'
      }
    }
  },
  {
    files: ['**/*.js', '**/*.vue'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      prettier: prettier
    },
    rules: {
      'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
      'vue/multi-word-component-names': 'off',
      'vue/component-api-style': ['error', ['script-setup']],
      'prettier/prettier': 'error',
      // 渲染库隔离红线：@vue-flow/* 只允许在 TopologyCanvas.vue 里出现。
      // 目的是把渲染库锁死在单一文件内 —— 数据层（stores/composables）必须
      // 能脱离渲染库独立测试，将来换渲染库也只需要改 TopologyCanvas.vue 一个文件。
      // 下面紧跟的 override 会对该文件解除此限制。
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@vue-flow', '@vue-flow/*'],
              message:
                '@vue-flow/* 只能在 src/components/topology/TopologyCanvas.vue 中导入。' +
                '数据层与其他组件请通过 useTopologySync().attach(instance) 注入的实例交互。'
            }
          ]
        }
      ]
    }
  },
  {
    // 渲染库隔离的唯一出口
    files: ['src/components/topology/TopologyCanvas.vue'],
    rules: {
      'no-restricted-imports': 'off'
    }
  },
  {
    ignores: ['node_modules/', 'dist/', 'release/', 'coverage/']
  }
]
