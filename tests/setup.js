// 全局测试设置文件
import { expect } from 'vitest'
import * as matchers from '@testing-library/jest-dom/matchers'

// 扩展 Vitest 的 expect 断言库
expect.extend(matchers)

// 全局测试前设置
beforeAll(() => {
  console.log('🧪 开始测试...')
})

// 每个测试前设置
beforeEach(() => {
  // 清理 localStorage
  localStorage.clear()
  
  // 清理 sessionStorage
  sessionStorage.clear()
})

// 全局测试后清理
afterAll(() => {
  console.log('✅ 测试完成')
})

// Mock Electron API (如果需要)
global.System = {
  api: {
    dbQuery: async (sql, params) => {
      console.warn('Mock dbQuery called:', sql)
      return []
    },
    fsRead: async (path) => {
      console.warn('Mock fsRead called:', path)
      return ''
    },
    fsWrite: async (path, data) => {
      console.warn('Mock fsWrite called:', path)
      return true
    }
  }
}

// 全局测试工具函数
global.testUtils = {
  // 创建模拟设备数据
  createMockDevice: (overrides = {}) => ({
    id: 'test-device-001',
    name: '测试设备',
    type: 'router',
    vendor: 'Cisco',
    model: 'C9200',
    ip: '192.168.1.1',
    status: 'online',
    ...overrides
  }),
  
  // 创建模拟机柜数据
  createMockCabinet: (overrides = {}) => ({
    id: 'test-cabinet-001',
    name: '测试机柜',
    location: '机房A',
    total_u: 42,
    ...overrides
  }),
  
  // 等待异步操作
  waitFor: (ms = 100) => new Promise(resolve => setTimeout(resolve, ms))
}
