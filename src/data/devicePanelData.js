/**
 * 设备真实面板数据 v1.0
 * 包含主流网络设备型号的真实面板布局（端口位置、丝印、Logo位置等）
 * 
 * 数据结构说明：
 * - panelWidth/panelHeight: 面板画布尺寸（像素），按真实比例缩放
 * - logo: 厂商Logo位置和尺寸
 * - modelLabel: 型号标签位置
 * - ports: 端口列表，每个端口包含 id、type、x、y、label、row（上排/下排）
 * - leds: LED指示灯列表，每个LED包含 id、x、y、label、color
 * - panelImage（可选）：真实面板图片路径，用于叠加显示
 */

import hikvisionPanels from './devicePanelDataHikvision.js'
import huaweiPanels from './devicePanelDataHuawei.js'
import mianbanPanels from './devicePanelDataMianban.js'

// 合并海康威视面板（来自 nVisual 迁移包，图片面板形式）
const basePanels = {
  // ==================== 华为 ====================
  'S1730S-L8T-A': {
    vendor: '华为',
    model: 'S1730S-L8T-A',
    panelWidth: 320,
    panelHeight: 200,
    logo: { x: 12, y: 12, width: 60, height: 20, src: './vendor-logos/huawei.png' },
    modelLabel: { x: 80, y: 16, text: 'S1730S-L8T-A' },
    ports: [
      // 8个千兆电口，单排排列
      { id: 'GE0/0/1', type: 'rj45', x: 30, y: 70, label: '1', row: 'single' },
      { id: 'GE0/0/2', type: 'rj45', x: 70, y: 70, label: '2', row: 'single' },
      { id: 'GE0/0/3', type: 'rj45', x: 110, y: 70, label: '3', row: 'single' },
      { id: 'GE0/0/4', type: 'rj45', x: 150, y: 70, label: '4', row: 'single' },
      { id: 'GE0/0/5', type: 'rj45', x: 190, y: 70, label: '5', row: 'single' },
      { id: 'GE0/0/6', type: 'rj45', x: 230, y: 70, label: '6', row: 'single' },
      { id: 'GE0/0/7', type: 'rj45', x: 270, y: 70, label: '7', row: 'single' },
      { id: 'GE0/0/8', type: 'rj45', x: 310, y: 70, label: '8', row: 'single' }
    ],
    leds: [
      { id: 'sys', x: 12, y: 160, label: 'SYS', color: 'green' },
      { id: 'pwr', x: 52, y: 160, label: 'PWR', color: 'green' }
    ]
  },

  'S1730S-L24T-A': {
    vendor: '华为',
    model: 'S1730S-L24T-A',
    panelWidth: 440,
    panelHeight: 280,
    logo: { x: 16, y: 16, width: 70, height: 24, src: './vendor-logos/huawei.png' },
    modelLabel: { x: 100, y: 20, text: 'S1730S-L24T-A' },
    ports: [
      // 上排：偶数端口（2, 4, 6, ..., 24）
      { id: 'GE0/0/2', type: 'rj45', x: 60, y: 80, label: '2' },
      { id: 'GE0/0/4', type: 'rj45', x: 100, y: 80, label: '4' },
      { id: 'GE0/0/6', type: 'rj45', x: 140, y: 80, label: '6' },
      { id: 'GE0/0/8', type: 'rj45', x: 180, y: 80, label: '8' },
      { id: 'GE0/0/10', type: 'rj45', x: 220, y: 80, label: '10' },
      { id: 'GE0/0/12', type: 'rj45', x: 260, y: 80, label: '12' },
      { id: 'GE0/0/14', type: 'rj45', x: 300, y: 80, label: '14' },
      { id: 'GE0/0/16', type: 'rj45', x: 340, y: 80, label: '16' },
      { id: 'GE0/0/18', type: 'rj45', x: 380, y: 80, label: '18' },
      { id: 'GE0/0/20', type: 'rj45', x: 420, y: 80, label: '20' },
      { id: 'GE0/0/22', type: 'rj45', x: 460, y: 80, label: '22' },
      { id: 'GE0/0/24', type: 'rj45', x: 500, y: 80, label: '24' },
      // 下排：奇数端口（1, 3, 5, ..., 23）
      { id: 'GE0/0/1', type: 'rj45', x: 60, y: 140, label: '1' },
      { id: 'GE0/0/3', type: 'rj45', x: 100, y: 140, label: '3' },
      { id: 'GE0/0/5', type: 'rj45', x: 140, y: 140, label: '5' },
      { id: 'GE0/0/7', type: 'rj45', x: 180, y: 140, label: '7' },
      { id: 'GE0/0/9', type: 'rj45', x: 220, y: 140, label: '9' },
      { id: 'GE0/0/11', type: 'rj45', x: 260, y: 140, label: '11' },
      { id: 'GE0/0/13', type: 'rj45', x: 300, y: 140, label: '13' },
      { id: 'GE0/0/15', type: 'rj45', x: 340, y: 140, label: '15' },
      { id: 'GE0/0/17', type: 'rj45', x: 380, y: 140, label: '17' },
      { id: 'GE0/0/19', type: 'rj45', x: 420, y: 140, label: '19' },
      { id: 'GE0/0/21', type: 'rj45', x: 460, y: 140, label: '21' },
      { id: 'GE0/0/23', type: 'rj45', x: 500, y: 140, label: '23' }
    ],
    leds: [
      { id: 'sys', x: 16, y: 220, label: 'SYS', color: 'green' },
      { id: 'pwr', x: 56, y: 220, label: 'PWR', color: 'green' }
    ]
  },

  'S5735-L24T4X-A': {
    vendor: '华为',
    model: 'S5735-L24T4X-A',
    panelWidth: 480,
    panelHeight: 300,
    logo: { x: 16, y: 16, width: 72, height: 24, src: './vendor-logos/huawei.png' },
    modelLabel: { x: 100, y: 20, text: 'S5735-L24T4X-A' },
    ports: [
      // 上排：偶数电口（2, 4, 6, ..., 24）
      { id: 'GE0/0/2', type: 'rj45', x: 60, y: 80, label: '2' },
      { id: 'GE0/0/4', type: 'rj45', x: 100, y: 80, label: '4' },
      { id: 'GE0/0/6', type: 'rj45', x: 140, y: 80, label: '6' },
      { id: 'GE0/0/8', type: 'rj45', x: 180, y: 80, label: '8' },
      { id: 'GE0/0/10', type: 'rj45', x: 220, y: 80, label: '10' },
      { id: 'GE0/0/12', type: 'rj45', x: 260, y: 80, label: '12' },
      { id: 'GE0/0/14', type: 'rj45', x: 300, y: 80, label: '14' },
      { id: 'GE0/0/16', type: 'rj45', x: 340, y: 80, label: '16' },
      { id: 'GE0/0/18', type: 'rj45', x: 380, y: 80, label: '18' },
      { id: 'GE0/0/20', type: 'rj45', x: 420, y: 80, label: '20' },
      { id: 'GE0/0/22', type: 'rj45', x: 460, y: 80, label: '22' },
      { id: 'GE0/0/24', type: 'rj45', x: 500, y: 80, label: '24' },
      // 下排：奇数电口（1, 3, 5, ..., 23）
      { id: 'GE0/0/1', type: 'rj45', x: 60, y: 140, label: '1' },
      { id: 'GE0/0/3', type: 'rj45', x: 100, y: 140, label: '3' },
      { id: 'GE0/0/5', type: 'rj45', x: 140, y: 140, label: '5' },
      { id: 'GE0/0/7', type: 'rj45', x: 180, y: 140, label: '7' },
      { id: 'GE0/0/9', type: 'rj45', x: 220, y: 140, label: '9' },
      { id: 'GE0/0/11', type: 'rj45', x: 260, y: 140, label: '11' },
      { id: 'GE0/0/13', type: 'rj45', x: 300, y: 140, label: '13' },
      { id: 'GE0/0/15', type: 'rj45', x: 340, y: 140, label: '15' },
      { id: 'GE0/0/17', type: 'rj45', x: 380, y: 140, label: '17' },
      { id: 'GE0/0/19', type: 'rj45', x: 420, y: 140, label: '19' },
      { id: 'GE0/0/21', type: 'rj45', x: 460, y: 140, label: '21' },
      { id: 'GE0/0/23', type: 'rj45', x: 500, y: 140, label: '23' },
      // 右侧：4个万兆SFP+口
      { id: 'SFP0/0/1', type: 'sfp', x: 560, y: 60, label: 'SFP1' },
      { id: 'SFP0/0/2', type: 'sfp', x: 560, y: 110, label: 'SFP2' },
      { id: 'SFP0/0/3', type: 'sfp', x: 560, y: 160, label: 'SFP3' },
      { id: 'SFP0/0/4', type: 'sfp', x: 560, y: 210, label: 'SFP4' }
    ],
    leds: [
      { id: 'sys', x: 16, y: 240, label: 'SYS', color: 'green' },
      { id: 'pwr', x: 56, y: 240, label: 'PWR', color: 'green' },
      { id: 'alm', x: 96, y: 240, label: 'ALM', color: 'red' }
    ]
  },

  'S5735-L48T4X-A': {
    vendor: '华为',
    model: 'S5735-L48T4X-A',
    panelWidth: 520,
    panelHeight: 320,
    logo: { x: 16, y: 16, width: 72, height: 24, src: './vendor-logos/huawei.png' },
    modelLabel: { x: 100, y: 20, text: 'S5735-L48T4X-A' },
    ports: [
      // 上排：偶数电口（2, 4, ..., 48）
      { id: 'GE0/0/2', type: 'rj45', x: 60, y: 70, label: '2' },
      { id: 'GE0/0/4', type: 'rj45', x: 95, y: 70, label: '4' },
      { id: 'GE0/0/6', type: 'rj45', x: 130, y: 70, label: '6' },
      { id: 'GE0/0/8', type: 'rj45', x: 165, y: 70, label: '8' },
      { id: 'GE0/0/10', type: 'rj45', x: 200, y: 70, label: '10' },
      { id: 'GE0/0/12', type: 'rj45', x: 235, y: 70, label: '12' },
      { id: 'GE0/0/14', type: 'rj45', x: 270, y: 70, label: '14' },
      { id: 'GE0/0/16', type: 'rj45', x: 305, y: 70, label: '16' },
      { id: 'GE0/0/18', type: 'rj45', x: 340, y: 70, label: '18' },
      { id: 'GE0/0/20', type: 'rj45', x: 375, y: 70, label: '20' },
      { id: 'GE0/0/22', type: 'rj45', x: 410, y: 70, label: '22' },
      { id: 'GE0/0/24', type: 'rj45', x: 445, y: 70, label: '24' },
      { id: 'GE0/0/26', type: 'rj45', x: 480, y: 70, label: '26' },
      { id: 'GE0/0/28', type: 'rj45', x: 515, y: 70, label: '28' },
      { id: 'GE0/0/30', type: 'rj45', x: 550, y: 70, label: '30' },
      { id: 'GE0/0/32', type: 'rj45', x: 585, y: 70, label: '32' },
      { id: 'GE0/0/34', type: 'rj45', x: 620, y: 70, label: '34' },
      { id: 'GE0/0/36', type: 'rj45', x: 655, y: 70, label: '36' },
      { id: 'GE0/0/38', type: 'rj45', x: 690, y: 70, label: '38' },
      { id: 'GE0/0/40', type: 'rj45', x: 725, y: 70, label: '40' },
      { id: 'GE0/0/42', type: 'rj45', x: 760, y: 70, label: '42' },
      { id: 'GE0/0/44', type: 'rj45', x: 795, y: 70, label: '44' },
      { id: 'GE0/0/46', type: 'rj45', x: 830, y: 70, label: '46' },
      { id: 'GE0/0/48', type: 'rj45', x: 865, y: 70, label: '48' },
      // 下排：奇数电口（1, 3, ..., 47）
      { id: 'GE0/0/1', type: 'rj45', x: 60, y: 130, label: '1' },
      { id: 'GE0/0/3', type: 'rj45', x: 95, y: 130, label: '3' },
      { id: 'GE0/0/5', type: 'rj45', x: 130, y: 130, label: '5' },
      { id: 'GE0/0/7', type: 'rj45', x: 165, y: 130, label: '7' },
      { id: 'GE0/0/9', type: 'rj45', x: 200, y: 130, label: '9' },
      { id: 'GE0/0/11', type: 'rj45', x: 235, y: 130, label: '11' },
      { id: 'GE0/0/13', type: 'rj45', x: 270, y: 130, label: '13' },
      { id: 'GE0/0/15', type: 'rj45', x: 305, y: 130, label: '15' },
      { id: 'GE0/0/17', type: 'rj45', x: 340, y: 130, label: '17' },
      { id: 'GE0/0/19', type: 'rj45', x: 375, y: 130, label: '19' },
      { id: 'GE0/0/21', type: 'rj45', x: 410, y: 130, label: '21' },
      { id: 'GE0/0/23', type: 'rj45', x: 445, y: 130, label: '23' },
      { id: 'GE0/0/25', type: 'rj45', x: 480, y: 130, label: '25' },
      { id: 'GE0/0/27', type: 'rj45', x: 515, y: 130, label: '27' },
      { id: 'GE0/0/29', type: 'rj45', x: 550, y: 130, label: '29' },
      { id: 'GE0/0/31', type: 'rj45', x: 585, y: 130, label: '31' },
      { id: 'GE0/0/33', type: 'rj45', x: 620, y: 130, label: '33' },
      { id: 'GE0/0/35', type: 'rj45', x: 655, y: 130, label: '35' },
      { id: 'GE0/0/37', type: 'rj45', x: 690, y: 130, label: '37' },
      { id: 'GE0/0/39', type: 'rj45', x: 725, y: 130, label: '39' },
      { id: 'GE0/0/41', type: 'rj45', x: 760, y: 130, label: '41' },
      { id: 'GE0/0/43', type: 'rj45', x: 795, y: 130, label: '43' },
      { id: 'GE0/0/45', type: 'rj45', x: 830, y: 130, label: '45' },
      { id: 'GE0/0/47', type: 'rj45', x: 865, y: 130, label: '47' },
      // 右侧：4个万兆SFP+口
      { id: 'SFP0/0/1', type: 'sfp', x: 560, y: 60, label: 'SFP1' },
      { id: 'SFP0/0/2', type: 'sfp', x: 560, y: 110, label: 'SFP2' },
      { id: 'SFP0/0/3', type: 'sfp', x: 560, y: 160, label: 'SFP3' },
      { id: 'SFP0/0/4', type: 'sfp', x: 560, y: 210, label: 'SFP4' }
    ],
    leds: [
      { id: 'sys', x: 16, y: 240, label: 'SYS', color: 'green' },
      { id: 'pwr', x: 56, y: 240, label: 'PWR', color: 'green' },
      { id: 'alm', x: 96, y: 240, label: 'ALM', color: 'red' }
    ]
  },

  'AR1220-S': {
    vendor: '华为',
    model: 'AR1220-S',
    panelWidth: 380,
    panelHeight: 240,
    logo: { x: 16, y: 16, width: 60, height: 20, src: './vendor-logos/huawei.png' },
    modelLabel: { x: 90, y: 20, text: 'AR1220-S' },
    ports: [
      // 8个千兆电口（LAN）
      { id: 'GE0/0/1', type: 'rj45', x: 30, y: 80, label: 'GE0' },
      { id: 'GE0/0/2', type: 'rj45', x: 70, y: 80, label: 'GE1' },
      { id: 'GE0/0/3', type: 'rj45', x: 110, y: 80, label: 'GE2' },
      { id: 'GE0/0/4', type: 'rj45', x: 150, y: 80, label: 'GE3' },
      { id: 'GE0/0/5', type: 'rj45', x: 190, y: 80, label: 'GE4' },
      { id: 'GE0/0/6', type: 'rj45', x: 230, y: 80, label: 'GE5' },
      { id: 'GE0/0/7', type: 'rj45', x: 270, y: 80, label: 'GE6' },
      { id: 'GE0/0/8', type: 'rj45', x: 310, y: 80, label: 'GE7' },
      // 2个SFP口（WAN）
      { id: 'SFP0/0/1', type: 'sfp', x: 30, y: 150, label: 'SFP1' },
      { id: 'SFP0/0/2', type: 'sfp', x: 70, y: 150, label: 'SFP2' }
    ],
    leds: [
      { id: 'sys', x: 16, y: 200, label: 'SYS', color: 'green' },
      { id: 'pwr', x: 56, y: 200, label: 'PWR', color: 'green' }
    ]
  },

  // ==================== 华三(H3C) ====================
  'S5120-28P-SI': {
    vendor: '华三(H3C)',
    model: 'S5120-28P-SI',
    panelWidth: 460,
    panelHeight: 280,
    logo: { x: 16, y: 16, width: 60, height: 20, src: './vendor-logos/h3c.png' },
    modelLabel: { x: 90, y: 20, text: 'S5120-28P-SI' },
    ports: [
      // 上排：偶数电口
      { id: 'GE1/0/2', type: 'rj45', x: 60, y: 80, label: '2' },
      { id: 'GE1/0/4', type: 'rj45', x: 100, y: 80, label: '4' },
      { id: 'GE1/0/6', type: 'rj45', x: 140, y: 80, label: '6' },
      { id: 'GE1/0/8', type: 'rj45', x: 180, y: 80, label: '8' },
      { id: 'GE1/0/10', type: 'rj45', x: 220, y: 80, label: '10' },
      { id: 'GE1/0/12', type: 'rj45', x: 260, y: 80, label: '12' },
      { id: 'GE1/0/14', type: 'rj45', x: 300, y: 80, label: '14' },
      { id: 'GE1/0/16', type: 'rj45', x: 340, y: 80, label: '16' },
      { id: 'GE1/0/18', type: 'rj45', x: 380, y: 80, label: '18' },
      { id: 'GE1/0/20', type: 'rj45', x: 420, y: 80, label: '20' },
      { id: 'GE1/0/22', type: 'rj45', x: 460, y: 80, label: '22' },
      { id: 'GE1/0/24', type: 'rj45', x: 500, y: 80, label: '24' },
      // 下排：奇数电口
      { id: 'GE1/0/1', type: 'rj45', x: 60, y: 140, label: '1' },
      { id: 'GE1/0/3', type: 'rj45', x: 100, y: 140, label: '3' },
      { id: 'GE1/0/5', type: 'rj45', x: 140, y: 140, label: '5' },
      { id: 'GE1/0/7', type: 'rj45', x: 180, y: 140, label: '7' },
      { id: 'GE1/0/9', type: 'rj45', x: 220, y: 140, label: '9' },
      { id: 'GE1/0/11', type: 'rj45', x: 260, y: 140, label: '11' },
      { id: 'GE1/0/13', type: 'rj45', x: 300, y: 140, label: '13' },
      { id: 'GE1/0/15', type: 'rj45', x: 340, y: 140, label: '15' },
      { id: 'GE1/0/17', type: 'rj45', x: 380, y: 140, label: '17' },
      { id: 'GE1/0/19', type: 'rj45', x: 420, y: 140, label: '19' },
      { id: 'GE1/0/21', type: 'rj45', x: 460, y: 140, label: '21' },
      { id: 'GE1/0/23', type: 'rj45', x: 500, y: 140, label: '23' },
      // 右侧：4个SFP口
      { id: 'SFP1/0/1', type: 'sfp', x: 560, y: 60, label: 'SFP1' },
      { id: 'SFP1/0/2', type: 'sfp', x: 560, y: 110, label: 'SFP2' },
      { id: 'SFP1/0/3', type: 'sfp', x: 560, y: 160, label: 'SFP3' },
      { id: 'SFP1/0/4', type: 'sfp', x: 560, y: 210, label: 'SFP4' }
    ],
    leds: [
      { id: 'sys', x: 16, y: 220, label: 'SYS', color: 'green' },
      { id: 'pwr', x: 56, y: 220, label: 'PWR', color: 'green' }
    ]
  },

  // ==================== 锐捷(Ruijie) ====================
  'RG-S2910-24GT4XS-E': {
    vendor: '锐捷',
    model: 'RG-S2910-24GT4XS-E',
    panelWidth: 480,
    panelHeight: 300,
    logo: { x: 16, y: 16, width: 60, height: 20, src: './vendor-logos/ruijie.png' },
    modelLabel: { x: 90, y: 20, text: 'RG-S2910-24GT4XS-E' },
    ports: [
      // 上排：偶数电口
      { id: 'GE0/1', type: 'rj45', x: 60, y: 80, label: '2' },
      { id: 'GE0/2', type: 'rj45', x: 100, y: 80, label: '4' },
      { id: 'GE0/3', type: 'rj45', x: 140, y: 80, label: '6' },
      { id: 'GE0/4', type: 'rj45', x: 180, y: 80, label: '8' },
      { id: 'GE0/5', type: 'rj45', x: 220, y: 80, label: '10' },
      { id: 'GE0/6', type: 'rj45', x: 260, y: 80, label: '12' },
      { id: 'GE0/7', type: 'rj45', x: 300, y: 80, label: '14' },
      { id: 'GE0/8', type: 'rj45', x: 340, y: 80, label: '16' },
      { id: 'GE0/9', type: 'rj45', x: 380, y: 80, label: '18' },
      { id: 'GE0/10', type: 'rj45', x: 420, y: 80, label: '20' },
      { id: 'GE0/11', type: 'rj45', x: 460, y: 80, label: '22' },
      { id: 'GE0/12', type: 'rj45', x: 500, y: 80, label: '24' },
      // 下排：奇数电口
      { id: 'GE0/13', type: 'rj45', x: 60, y: 140, label: '1' },
      { id: 'GE0/14', type: 'rj45', x: 100, y: 140, label: '3' },
      { id: 'GE0/15', type: 'rj45', x: 140, y: 140, label: '5' },
      { id: 'GE0/16', type: 'rj45', x: 180, y: 140, label: '7' },
      { id: 'GE0/17', type: 'rj45', x: 220, y: 140, label: '9' },
      { id: 'GE0/18', type: 'rj45', x: 260, y: 140, label: '11' },
      { id: 'GE0/19', type: 'rj45', x: 300, y: 140, label: '13' },
      { id: 'GE0/20', type: 'rj45', x: 340, y: 140, label: '15' },
      { id: 'GE0/21', type: 'rj45', x: 380, y: 140, label: '17' },
      { id: 'GE0/22', type: 'rj45', x: 420, y: 140, label: '19' },
      { id: 'GE0/23', type: 'rj45', x: 460, y: 140, label: '21' },
      { id: 'GE0/24', type: 'rj45', x: 500, y: 140, label: '23' },
      // 右侧：4个万兆SFP+口
      { id: 'SFP0/1', type: 'sfp', x: 560, y: 60, label: 'SFP1' },
      { id: 'SFP0/2', type: 'sfp', x: 560, y: 110, label: 'SFP2' },
      { id: 'SFP0/3', type: 'sfp', x: 560, y: 160, label: 'SFP3' },
      { id: 'SFP0/4', type: 'sfp', x: 560, y: 210, label: 'SFP4' }
    ],
    leds: [
      { id: 'sys', x: 16, y: 240, label: 'SYS', color: 'green' },
      { id: 'pwr', x: 56, y: 240, label: 'PWR', color: 'green' }
    ]
  },

  // ==================== 思科(Cisco) ====================
  'Catalyst 2960-X': {
    vendor: '思科(Cisco)',
    model: 'Catalyst 2960-X',
    panelWidth: 460,
    panelHeight: 280,
    logo: { x: 16, y: 16, width: 70, height: 20, src: './vendor-logos/cisco.png' },
    modelLabel: { x: 100, y: 20, text: 'Catalyst 2960-X' },
    ports: [
      // 上排：偶数电口
      { id: 'Gi1/0/2', type: 'rj45', x: 60, y: 80, label: '2' },
      { id: 'Gi1/0/4', type: 'rj45', x: 100, y: 80, label: '4' },
      { id: 'Gi1/0/6', type: 'rj45', x: 140, y: 80, label: '6' },
      { id: 'Gi1/0/8', type: 'rj45', x: 180, y: 80, label: '8' },
      { id: 'Gi1/0/10', type: 'rj45', x: 220, y: 80, label: '10' },
      { id: 'Gi1/0/12', type: 'rj45', x: 260, y: 80, label: '12' },
      { id: 'Gi1/0/14', type: 'rj45', x: 300, y: 80, label: '14' },
      { id: 'Gi1/0/16', type: 'rj45', x: 340, y: 80, label: '16' },
      { id: 'Gi1/0/18', type: 'rj45', x: 380, y: 80, label: '18' },
      { id: 'Gi1/0/20', type: 'rj45', x: 420, y: 80, label: '20' },
      { id: 'Gi1/0/22', type: 'rj45', x: 460, y: 80, label: '22' },
      { id: 'Gi1/0/24', type: 'rj45', x: 500, y: 80, label: '24' },
      // 下排：奇数电口
      { id: 'Gi1/0/1', type: 'rj45', x: 60, y: 140, label: '1' },
      { id: 'Gi1/0/3', type: 'rj45', x: 100, y: 140, label: '3' },
      { id: 'Gi1/0/5', type: 'rj45', x: 140, y: 140, label: '5' },
      { id: 'Gi1/0/7', type: 'rj45', x: 180, y: 140, label: '7' },
      { id: 'Gi1/0/9', type: 'rj45', x: 220, y: 140, label: '9' },
      { id: 'Gi1/0/11', type: 'rj45', x: 260, y: 140, label: '11' },
      { id: 'Gi1/0/13', type: 'rj45', x: 300, y: 140, label: '13' },
      { id: 'Gi1/0/15', type: 'rj45', x: 340, y: 140, label: '15' },
      { id: 'Gi1/0/17', type: 'rj45', x: 380, y: 140, label: '17' },
      { id: 'Gi1/0/19', type: 'rj45', x: 420, y: 140, label: '19' },
      { id: 'Gi1/0/21', type: 'rj45', x: 460, y: 140, label: '21' },
      { id: 'Gi1/0/23', type: 'rj45', x: 500, y: 140, label: '23' },
      // 右侧：4个SFP口
      { id: 'SFP1/1', type: 'sfp', x: 560, y: 60, label: 'SFP1' },
      { id: 'SFP1/2', type: 'sfp', x: 560, y: 110, label: 'SFP2' },
      { id: 'SFP1/3', type: 'sfp', x: 560, y: 160, label: 'SFP3' },
      { id: 'SFP1/4', type: 'sfp', x: 560, y: 210, label: 'SFP4' }
    ],
    leds: [
      { id: 'sys', x: 16, y: 220, label: 'SYS', color: 'green' },
      { id: 'pwr', x: 56, y: 220, label: 'PWR', color: 'green' }
    ]
  },

  // ==================== TP-Link ====================
  'TL-SG1024D': {
    vendor: 'TP-Link',
    model: 'TL-SG1024D',
    panelWidth: 320,
    panelHeight: 200,
    logo: { x: 16, y: 16, width: 60, height: 20, src: './vendor-logos/tp-link.png' },
    modelLabel: { x: 90, y: 20, text: 'TL-SG1024D' },
    ports: [
      // 24个千兆电口，单排（小尺寸端口）
      { id: 'Port1', type: 'rj45', x: 30, y: 70, label: '1' },
      { id: 'Port2', type: 'rj45', x: 60, y: 70, label: '2' },
      { id: 'Port3', type: 'rj45', x: 90, y: 70, label: '3' },
      { id: 'Port4', type: 'rj45', x: 120, y: 70, label: '4' },
      { id: 'Port5', type: 'rj45', x: 150, y: 70, label: '5' },
      { id: 'Port6', type: 'rj45', x: 180, y: 70, label: '6' },
      { id: 'Port7', type: 'rj45', x: 210, y: 70, label: '7' },
      { id: 'Port8', type: 'rj45', x: 240, y: 70, label: '8' },
      { id: 'Port9', type: 'rj45', x: 270, y: 70, label: '9' },
      { id: 'Port10', type: 'rj45', x: 300, y: 70, label: '10' },
      { id: 'Port11', type: 'rj45', x: 330, y: 70, label: '11' },
      { id: 'Port12', type: 'rj45', x: 360, y: 70, label: '12' },
      { id: 'Port13', type: 'rj45', x: 30, y: 120, label: '13' },
      { id: 'Port14', type: 'rj45', x: 60, y: 120, label: '14' },
      { id: 'Port15', type: 'rj45', x: 90, y: 120, label: '15' },
      { id: 'Port16', type: 'rj45', x: 120, y: 120, label: '16' },
      { id: 'Port17', type: 'rj45', x: 150, y: 120, label: '17' },
      { id: 'Port18', type: 'rj45', x: 180, y: 120, label: '18' },
      { id: 'Port19', type: 'rj45', x: 210, y: 120, label: '19' },
      { id: 'Port20', type: 'rj45', x: 240, y: 120, label: '20' },
      { id: 'Port21', type: 'rj45', x: 270, y: 120, label: '21' },
      { id: 'Port22', type: 'rj45', x: 300, y: 120, label: '22' },
      { id: 'Port23', type: 'rj45', x: 330, y: 120, label: '23' },
      { id: 'Port24', type: 'rj45', x: 360, y: 120, label: '24' }
    ],
    leds: [
      { id: 'pwr', x: 16, y: 170, label: 'PWR', color: 'green' }
    ]
  }
}

// 合并：基础绘制面板 + 海康（nVisual 图片面板）+ 华为包 + D:\面板 新增包（H3C/思科/锐捷/中兴/机柜等）
// 新包与已有键同名时跳过，防止覆盖已有面板数据
const mergedPanels = { ...basePanels, ...hikvisionPanels }
;[huaweiPanels, mianbanPanels].forEach((extra) => {
  Object.keys(extra).forEach((k) => {
    if (!mergedPanels[k]) mergedPanels[k] = extra[k]
  })
})
export default mergedPanels
