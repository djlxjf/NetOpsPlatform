/**
 * 从 deviceModels.js 生成设备库模型条目
 * 自动为所有厂商型号创建 deviceLibStore 格式的条目
 */
const fs = require('fs')
const path = require('path')

// 动态导入 deviceModels.js (ESM)
const srcDir = path.resolve(__dirname, '..', 'src')
const modelsPath = path.join(srcDir, 'data', 'deviceModels.js')
const modelsContent = fs.readFileSync(modelsPath, 'utf-8')

// 解析 export default { ... } 中的 JSON 数据
const jsonStr = modelsContent
  .replace(/export default /, '')
  .replace(/\/\*\*[\s\S]*?\*\//g, '')     // 移除块注释
  .replace(/\/\/.*$/gm, '')                // 移除行注释
  .replace(/,(\s*[}\]])/g, '$1')           // 移除尾部逗号

const deviceModels = eval('(' + jsonStr + ')')

// 端口数量推断规则
function inferPorts(name, type) {
  const upper = name.toUpperCase()
  // 常见端口模式
  const patterns = [
    // 48口模式
    { match: /48[TPF]/, ports: 48, sfp: 4 },
    { match: /48S/, ports: 0, sfp: 48 },
    // 32口模式
    { match: /32[CT]/, ports: 32, sfp: 4 },
    { match: /32S/, ports: 0, sfp: 32 },
    // 28口模式
    { match: /28[TP]/, ports: 24, sfp: 4 },
    { match: /28S/, ports: 0, sfp: 28 },
    // 24口模式
    { match: /24[TP]/, ports: 24, sfp: 4 },
    { match: /24S/, ports: 0, sfp: 24 },
    // 16口模式
    { match: /16[TRP]/, ports: 16, sfp: 2 },
    { match: /16S/, ports: 0, sfp: 16 },
    // 12口模式
    { match: /12[TP]/, ports: 12, sfp: 2 },
    // 10口模式
    { match: /10[TP]/, ports: 8, sfp: 2 },
    // 8口模式
    { match: /8[TP]/, ports: 8, sfp: 0 },
    { match: /8S/, ports: 0, sfp: 8 },
    // 5口模式
    { match: /5[TPD]/, ports: 5, sfp: 0 },
  ]
  
  for (const p of patterns) {
    if (p.match.test(upper)) {
      return { ethernetPorts: p.ports, sfpPorts: p.sfp }
    }
  }
  
  // 默认值
  if (type === 'switch') return { ethernetPorts: 24, sfpPorts: 4 }
  if (type === 'router') return { ethernetPorts: 8, sfpPorts: 2 }
  if (type === 'firewall') return { ethernetPorts: 8, sfpPorts: 0 }
  return { ethernetPorts: 8, sfpPorts: 0 }
}

// 生成短ID
function shortId(vendor, type, index) {
  const vendorMap = {
    '华为': 'hw', '华三(H3C)': 'h3c', '锐捷(Ruijie)': 'rj', '中兴(ZTE)': 'zte',
    '迈普(Maipu)': 'mp', '烽火(FiberHome)': 'fh', '博达(BDCOM)': 'bd',
    '神码(DCN)': 'dcn', '迪普(DPtech)': 'dp', '深信服(Sangfor)': 'sxf',
    '山石网科(Hillstone)': 'hs', '天融信(TopSec)': 'trx', '浪潮(Inspur)': 'lc',
    '联想(Lenovo)': 'lx', 'G-COM(新格林耐特)': 'gcom', '奇安信': 'qax',
    '思科(Cisco)': 'cs', 'Juniper': 'jn', 'Arista': 'ars', 'Aruba/HPE': 'aruba',
    'Fortinet(FortiGate)': 'fg', 'Palo Alto Networks': 'pa', 'Dell': 'dell',
    'Extreme Networks': 'exn', 'Check Point': 'cp', 'F5': 'f5', 'Netgear': 'ng',
    'Ubiquiti(UniFi)': 'ub', 'MikroTik': 'mt', 'D-Link': 'dl',
    'Allied Telesis': 'at', 'Ruckus(Commscope)': 'rk', 'TP-Link': 'tp',
    '派网(Panabit)': 'pn', '网御星云(Leadsec)': 'leadsec', 'SonicWall': 'sw',
    'WatchGuard': 'wg', 'Barracuda': 'bc', 'Sophos': 'so', '新华三(New H3C)': 'nh3c'
  }
  const typeMap = { 'switch': 'sw', 'router': 'rt', 'firewall': 'fw', 'wireless': 'wl', 'server': 'srv', 'ups': 'ups', 'storage': 'sto', 'gateway': 'gw', 'ac': 'ac', 'loadbalancer': 'lb' }
  const v = vendorMap[vendor] || vendor.replace(/[^a-zA-Z]/g, '').toLowerCase().slice(0, 3)
  const t = typeMap[type] || 'ot'
  return `${v}_${t}_${index + 1}`
}

// 生成所有条目
let entries = []
let globalIndex = 0

for (const [vendor, types] of Object.entries(deviceModels)) {
  for (const [type, models] of Object.entries(types)) {
    models.forEach((modelName, idx) => {
      const ports = inferPorts(modelName, type)
      const sfpType = ports.sfpPorts > 0 ? ['1g'] : undefined
      
      let uSize = 1
      if (type === 'server') uSize = 2
      if (type === 'ups') uSize = 3
      if (type === 'storage') uSize = 4
      
      // 检测PoE
      const isPoE = /poe|HPWR|PWR/i.test(modelName)
      const poeType = isPoE ? 'poe+' : undefined
      const maxPower = isPoE ? (ports.ethernetPorts >= 24 ? 450 : 370) : undefined
      
      // 协议推断
      let supportedProtocols = ''
      if (type === 'switch') {
        if (/^[CS]\d{4}/.test(modelName) || modelName.includes('CE')) {
          supportedProtocols = 'VLAN, STP, LACP, VRRP, OSPF, BGP'
        } else if (/^[CS]\d{2,3}/.test(modelName)) {
          supportedProtocols = 'VLAN, STP, LACP'
        } else {
          supportedProtocols = 'VLAN, QoS'
        }
      } else if (type === 'router') {
        supportedProtocols = 'OSPF, BGP, RIP, VRRP'
      } else if (type === 'firewall') {
        supportedProtocols = 'ACL, NAT, VPN, IPS'
      }
      
      // 转发速率推断
      let forwardingRate = ''
      if (type === 'switch') {
        const totalPorts = ports.ethernetPorts + ports.sfpPorts
        if (totalPorts >= 48) forwardingRate = '256Gbps'
        else if (totalPorts >= 24) forwardingRate = '128Gbps'
        else if (totalPorts >= 16) forwardingRate = '32Gbps'
        else if (totalPorts >= 8) forwardingRate = '16Gbps'
        else forwardingRate = '10Gbps'
      }
      
      entries.push({
        id: shortId(vendor, type, idx + 1),
        name: modelName,
        vendor,
        type,
        uSize,
        ethernetPorts: ports.ethernetPorts,
        sfpPorts: ports.sfpPorts,
        ...(sfpType ? { sfpType } : {}),
        ...(poeType ? { poeType, maxPower } : {}),
        ...(supportedProtocols ? { supportedProtocols } : {}),
        ...(forwardingRate ? { forwardingRate } : {}),
        remark: ''
      })
      
      globalIndex++
    })
  }
}

// 输出为JS格式
const output = entries.map(e => {
  let parts = [`  { id: '${e.id}', name: '${e.name}', vendor: '${e.vendor}', type: '${e.type}', uSize: ${e.uSize}`]
  if (e.ethernetPorts > 0) parts.push(`ethernetPorts: ${e.ethernetPorts}`)
  if (e.sfpPorts > 0) parts.push(`sfpPorts: ${e.sfpPorts}`)
  if (e.sfpType && e.sfpType.length > 0) parts.push(`sfpType: [${e.sfpType.map(s => `'${s}'`).join(', ')}]`)
  if (e.poeType) parts.push(`poeType: '${e.poeType}'`)
  if (e.maxPower) parts.push(`maxPower: ${e.maxPower}`)
  if (e.forwardingRate) parts.push(`forwardingRate: '${e.forwardingRate}'`)
  if (e.supportedProtocols) parts.push(`supportedProtocols: '${e.supportedProtocols}'`)
  if (e.remark) parts.push(`remark: '${e.remark}'`)
  return parts.join(', ') + ' },'
}).join('\n')

// 按厂商分组写出
const outPath = path.join(srcDir, 'data', 'generated_device_lib_models.json')
fs.writeFileSync(outPath, output, 'utf-8')

console.log(`Generated ${entries.length} model entries -> ${outPath}`)
console.log('First 5 entries:')
entries.slice(0, 5).forEach(e => console.log(JSON.stringify(e, null, 2)))
