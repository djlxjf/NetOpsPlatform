import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { loadFromDB, saveToDB } from './db-sync-utils'

const IP_POOLS_DATA_TYPE = 'ipPools'
const IP_ALLOCATIONS_DATA_TYPE = 'ipAllocations'

function getDefaultIPPools() {
  return [
    {
      id: '1',
      name: '管理网段',
      network: '192.168.1.0',
      mask: '255.255.255.0',
      gateway: '192.168.1.1',
      vlan: 1,
      description: '网络设备管理地址',
      total: 254,
      static: [],
      dynamic: []
    },
    {
      id: '2',
      name: '业务网段',
      network: '192.168.10.0',
      mask: '255.255.255.0',
      gateway: '192.168.10.1',
      vlan: 10,
      description: '业务服务器地址',
      total: 254,
      static: [
        { ip: '192.168.10.10', mac: '00:11:22:33:44:55', hostname: 'Web服务器-01', owner: 'IT部', expireTime: null },
        { ip: '192.168.10.11', mac: '00:11:22:33:44:56', hostname: 'Web服务器-02', owner: 'IT部', expireTime: null },
        { ip: '192.168.10.20', mac: '00:11:22:33:44:57', hostname: '数据库服务器', owner: 'IT部', expireTime: null }
      ],
      dynamic: [
        { ip: '192.168.10.100', mac: 'AA:BB:CC:DD:EE:01', hostname: 'PC-001', owner: '市场部', expireTime: new Date(Date.now() + 86400000).toISOString() },
        { ip: '192.168.10.101', mac: 'AA:BB:CC:DD:EE:02', hostname: 'PC-002', owner: '财务部', expireTime: new Date(Date.now() + 86400000).toISOString() }
      ]
    },
    {
      id: '3',
      name: '办公网段',
      network: '192.168.20.0',
      mask: '255.255.255.0',
      gateway: '192.168.20.1',
      vlan: 20,
      description: '员工办公设备地址',
      total: 254,
      static: [],
      dynamic: []
    }
  ]
}

export const useIPPoolStore = defineStore('ipPool', () => {
  const ipPools = ref([])
  const ipAllocations = ref([])
  const ipConflicts = ref([])
  
  // 初始化时从数据库加载
  ;(async () => {
    await loadFromDB(IP_POOLS_DATA_TYPE, ipPools)
    await loadFromDB(IP_ALLOCATIONS_DATA_TYPE, ipAllocations)
    // 如果数据库中没有数据，则加载默认数据
    if (!ipPools.value || ipPools.value.length === 0) {
      ipPools.value = getDefaultIPPools()
      await saveToDB(IP_POOLS_DATA_TYPE, ipPools.value)
    }
  })()

  // 保存IP地址池到数据库
  async function saveIPPools() {
    await saveToDB(IP_POOLS_DATA_TYPE, ipPools.value)
  }

  // 保存IP分配记录到数据库
  async function saveAllocations() {
    await saveToDB(IP_ALLOCATIONS_DATA_TYPE, ipAllocations.value)
  }

  // IP地址池管理
  function addIPPool(pool) {
    const newPool = {
      id: Date.now().toString(),
      total: calculateTotal(pool.mask),
      static: [],
      dynamic: [],
      ...pool
    }
    ipPools.value.push(newPool)
    saveIPPools()
    return newPool
  }

  function updateIPPool(poolId, updates) {
    const index = ipPools.value.findIndex(p => p.id === poolId)
    if (index !== -1) {
      ipPools.value[index] = {
        ...ipPools.value[index],
        ...updates
      }
      if (updates.mask) {
        ipPools.value[index].total = calculateTotal(updates.mask)
      }
      saveIPPools()
    }
  }

  function deleteIPPool(poolId) {
    const index = ipPools.value.findIndex(p => p.id === poolId)
    if (index !== -1) {
      ipPools.value.splice(index, 1)
      saveIPPools()
    }
  }

  // IP分配
  function allocateIP(poolId, allocation) {
    const pool = ipPools.value.find(p => p.id === poolId)
    if (!pool) return null

    const newAllocation = {
      id: Date.now().toString(),
      poolId,
      ...allocation,
      allocatedAt: new Date().toISOString()
    }

    if (allocation.type === 'static') {
      pool.static.push({
        ip: allocation.ip,
        mac: allocation.mac,
        hostname: allocation.hostname,
        owner: allocation.owner,
        expireTime: null
      })
    } else {
      pool.dynamic.push({
        ip: allocation.ip,
        mac: allocation.mac,
        hostname: allocation.hostname,
        owner: allocation.owner,
        expireTime: allocation.expireTime
      })
    }

    saveIPPools()
    return newAllocation
  }

  function releaseIP(poolId, ip) {
    const pool = ipPools.value.find(p => p.id === poolId)
    if (!pool) return

    let index = pool.static.findIndex(a => a.ip === ip)
    if (index !== -1) {
      pool.static.splice(index, 1)
      saveIPPools()
      return
    }

    index = pool.dynamic.findIndex(a => a.ip === ip)
    if (index !== -1) {
      pool.dynamic.splice(index, 1)
      saveIPPools()
    }
  }

  // IP冲突检测
  function detectConflict(poolId, ip) {
    const pool = ipPools.value.find(p => p.id === poolId)
    if (!pool) return false

    const existsInStatic = pool.static.some(a => a.ip === ip)
    const existsInDynamic = pool.dynamic.some(a => a.ip === ip)

    return existsInStatic || existsInDynamic
  }

  function scanConflicts() {
    ipConflicts.value = []
    
    ipPools.value.forEach(pool => {
      const allAllocations = [...pool.static, ...pool.dynamic]
      const ipMap = new Map()

      allAllocations.forEach(alloc => {
        if (ipMap.has(alloc.ip)) {
          ipConflicts.value.push({
            ip: alloc.ip,
            poolId: pool.id,
            poolName: pool.name,
            allocations: [ipMap.get(alloc.ip), alloc]
          })
        } else {
          ipMap.set(alloc.ip, alloc)
        }
      })
    })

    return ipConflicts.value
  }

  // 获取可用IP
  function getAvailableIPs(poolId) {
    const pool = ipPools.value.find(p => p.id === poolId)
    if (!pool) return []

    const usedIPs = new Set([pool.gateway, ...pool.static.map(a => a.ip), ...pool.dynamic.map(a => a.ip)])
    const available = []

    for (let i = 2; i <= pool.total - 1; i++) {
      const ip = generateIP(pool.network, i)
      if (!usedIPs.has(ip)) {
        available.push(ip)
      }
    }

    return available
  }

  // 统计信息
  const poolStats = computed(() => {
    return ipPools.value.map(pool => {
      const used = pool.static.length + pool.dynamic.length
      const available = pool.total - used - 1 // 减去网关
      return {
        id: pool.id,
        name: pool.name,
        total: pool.total - 1,
        used,
        available,
        usageRate: ((used / (pool.total - 1)) * 100).toFixed(1)
      }
    })
  })

  // 辅助函数
  function calculateTotal(mask) {
    const parts = mask.split('.')
    let total = 0
    parts.forEach(part => {
      total = total * 256 + parseInt(part)
    })
    return total - 2 // 减去网络地址和广播地址
  }

  function generateIP(network, index) {
    const parts = network.split('.')
    parts[3] = parseInt(parts[3]) + index
    return parts.join('.')
  }

  function isValidIP(ip) {
    const pattern = /^(\d{1,3}\.){3}\d{1,3}$/
    if (!pattern.test(ip)) return false
    
    const parts = ip.split('.')
    return parts.every(part => {
      const num = parseInt(part)
      return num >= 0 && num <= 255
    })
  }

  function isValidMAC(mac) {
    const pattern = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/
    return pattern.test(mac)
  }

  return {
    ipPools,
    ipAllocations,
    ipConflicts,
    poolStats,
    addIPPool,
    updateIPPool,
    deleteIPPool,
    allocateIP,
    releaseIP,
    detectConflict,
    scanConflicts,
    getAvailableIPs,
    isValidIP,
    isValidMAC
  }
})
