/**
 * 数据接入 - 类型化 Schema 配置（单一事实来源）
 * ---------------------------------------------------------------
 * 本文件是「数据接入」模块的唯一配置入口。新增一种机房数据类型时，
 * 只需在此追加一段 type 配置（字段、表格列、筛选器），前端表单/列表
 * 自动生成，无需改动 IPC / DAO / Store（它们均为 type 驱动）。
 *
 * 字段类型（field.type）：
 *   text      普通文本
 *   number    数值（带单位 unit）
 *   select    下拉（options: [{value,label}]）
 *   textarea  多行文本
 *   datetime  日期时间
 *   switch    开关（仅数据源用）
 */

// ---------------- 公共选项 ----------------
export const ALARM_LEVELS = [
  { value: 'critical', label: '严重' },
  { value: 'major', label: '重要' },
  { value: 'minor', label: '次要' },
  { value: 'warning', label: '预警' }
]

export const ALARM_TYPES = [
  { value: 'temperature', label: '温度越限' },
  { value: 'humidity', label: '湿度越限' },
  { value: 'power', label: '断电/供电异常' },
  { value: 'offline', label: '设备离线' },
  { value: 'door', label: '门禁异常' },
  { value: 'water', label: '漏水' },
  { value: 'smoke', label: '烟雾' },
  { value: 'other', label: '其他' }
]

export const ALARM_STATUS = [
  { value: 'active', label: '未处理' },
  { value: 'acknowledged', label: '已确认' },
  { value: 'resolved', label: '已解决' }
]

export const SENSOR_TYPES = [
  { value: 'temperature', label: '温度' },
  { value: 'humidity', label: '湿度' },
  { value: 'door', label: '门磁' },
  { value: 'smoke', label: '烟雾' },
  { value: 'vibration', label: '震动' },
  { value: 'current', label: '电流' },
  { value: 'other', label: '其他' }
]

export const SENSOR_STATUS = [
  { value: 'normal', label: '正常' },
  { value: 'warning', label: '预警' },
  { value: 'alarm', label: '告警' }
]

export const POWER_STATUS = [
  { value: 'mains', label: '市电' },
  { value: 'ups', label: 'UPS' },
  { value: 'off', label: '断电' }
]

export const ENERGY_TYPES = [
  { value: 'electric', label: '用电' },
  { value: 'water', label: '用水' },
  { value: 'other', label: '其他' }
]

export const SOURCE_TYPES = [
  { value: 'manual', label: '手动录入' },
  { value: 'snmp', label: 'SNMP' },
  { value: 'modbus', label: 'Modbus' },
  { value: 'api', label: 'HTTP API' },
  { value: 'mqtt', label: 'MQTT' },
  { value: 'script', label: '脚本' }
]

// 状态着色元数据（供列表徽标渲染）
export const STATUS_META = {
  // 告警级别
  critical: { color: '#EF4444', label: '严重' },
  major: { color: '#F59E0B', label: '重要' },
  minor: { color: '#EAB308', label: '次要' },
  warning: { color: '#3B82F6', label: '预警' },
  // 告警状态
  active: { color: '#EF4444', label: '未处理' },
  acknowledged: { color: '#F59E0B', label: '已确认' },
  resolved: { color: '#34D399', label: '已解决' },
  // 传感器/环境状态
  normal: { color: '#34D399', label: '正常' },
  leak: { color: '#EF4444', label: '漏水' },
  smoke: { color: '#EF4444', label: '有烟' },
  closed: { color: '#34D399', label: '关闭' },
  open: { color: '#F59E0B', label: '开启' },
  // 供电状态
  mains: { color: '#34D399', label: '市电' },
  ups: { color: '#3B82F6', label: 'UPS' },
  off: { color: '#EF4444', label: '断电' },
}

// ---------------- 各数据类型配置 ----------------
export const INGEST_TYPES = {
  alarm: {
    key: 'alarm',
    label: '告警数据',
    icon: 'Warning',
    desc: '机房设备/环境产生的告警记录（温度越限、断电、漏水、门禁等）',
    fields: [
      { key: 'title', label: '告警标题', type: 'text', required: true, placeholder: '如：A排3号机柜温度越限' },
      { key: 'alarm_level', label: '告警级别', type: 'select', required: true, options: ALARM_LEVELS, default: 'warning' },
      { key: 'alarm_type', label: '告警类型', type: 'select', options: ALARM_TYPES },
      { key: 'status', label: '处理状态', type: 'select', options: ALARM_STATUS, default: 'active' },
      { key: 'device_id', label: '关联设备ID', type: 'text', placeholder: '可选，关联设备管理中的设备' },
      { key: 'cabinet_id', label: '关联机柜ID', type: 'text', placeholder: '可选，如 RK001（与机房规划中的机柜编号一致）' },
      { key: 'location', label: '位置/区域', type: 'text', placeholder: '如：A区、B排2列' },
      { key: 'metric_value', label: '触发值', type: 'number', unit: '' },
      { key: 'threshold', label: '阈值', type: 'number', unit: '' },
      { key: 'unit', label: '数值单位', type: 'text', placeholder: '℃ / %RH / V' },
      { key: 'occurred_at', label: '发生时间', type: 'datetime' },
      { key: 'recorded_at', label: '录入时间', type: 'datetime', defaultNow: true },
      { key: 'description', label: '详细描述', type: 'textarea' },
      { key: 'remark', label: '备注', type: 'textarea' }
    ],
    tableColumns: [
      { key: 'title', label: '告警标题', minWidth: 160 },
      { key: 'alarm_level', label: '级别', width: 90, badge: 'alarm_level' },
      { key: 'alarm_type', label: '类型', width: 110 },
      { key: 'status', label: '状态', width: 90, badge: 'status' },
      { key: 'location', label: '位置', width: 120 },
      { key: 'metric_value', label: '触发值', width: 100 },
      { key: 'occurred_at', label: '发生时间', width: 160 },
      { key: 'recorded_at', label: '录入时间', width: 160 }
    ],
    filters: [
      { key: 'keyword', label: '关键词', type: 'text', placeholder: '标题/位置/设备' },
      { key: 'level', label: '级别', type: 'select', options: ALARM_LEVELS },
      { key: 'status', label: '状态', type: 'select', options: ALARM_STATUS }
    ]
  },

  sensor: {
    key: 'sensor',
    label: '机柜传感器',
    icon: 'Odometer',
    desc: '机柜内传感器的逐点读数（温度、湿度、门磁、烟感、电流等）',
    fields: [
      { key: 'sensor_name', label: '传感器名称', type: 'text', placeholder: '如：RK001 温度传感器' },
      { key: 'cabinet_id', label: '所属机柜ID', type: 'text', placeholder: '如 RK001（与机房规划一致，录入后大屏实时显示）' },
      { key: 'sensor_type', label: '传感器类型', type: 'select', required: true, options: SENSOR_TYPES, default: 'temperature' },
      { key: 'value', label: '读数', type: 'number' },
      { key: 'unit', label: '单位', type: 'text', placeholder: '℃ / %RH / A' },
      { key: 'location', label: '安装位置', type: 'text', placeholder: '如：U12 / 顶部' },
      { key: 'status', label: '状态', type: 'select', options: SENSOR_STATUS, default: 'normal' },
      { key: 'recorded_at', label: '采集时间', type: 'datetime', defaultNow: true },
      { key: 'remark', label: '备注', type: 'textarea' }
    ],
    tableColumns: [
      { key: 'sensor_name', label: '名称', minWidth: 140 },
      { key: 'cabinet_id', label: '机柜ID', width: 120 },
      { key: 'sensor_type', label: '类型', width: 100 },
      { key: 'value', label: '读数', width: 110, withUnit: 'unit' },
      { key: 'status', label: '状态', width: 90, badge: 'status' },
      { key: 'location', label: '位置', width: 120 },
      { key: 'recorded_at', label: '采集时间', width: 160 }
    ],
    filters: [
      { key: 'keyword', label: '关键词', type: 'text', placeholder: '名称/机柜' },
      { key: 'sensor_type', label: '类型', type: 'select', options: SENSOR_TYPES },
      { key: 'status', label: '状态', type: 'select', options: SENSOR_STATUS }
    ]
  },

  env: {
    key: 'env',
    label: '动环监测',
    icon: 'Sunny',
    desc: '机房整体动力与环境状态（温湿度、供电、漏水、烟感、门禁、空调等）',
    fields: [
      { key: 'room_name', label: '机房/区域', type: 'text', placeholder: '如：A机房' },
      { key: 'room_id', label: '区域编号', type: 'text' },
      { key: 'temperature', label: '温度', type: 'number', unit: '℃' },
      { key: 'humidity', label: '湿度', type: 'number', unit: '%RH' },
      { key: 'power_status', label: '供电状态', type: 'select', options: POWER_STATUS },
      { key: 'voltage', label: '电压', type: 'number', unit: 'V' },
      { key: 'current_a', label: '电流', type: 'number', unit: 'A' },
      { key: 'power_kw', label: '实时功率', type: 'number', unit: 'kW' },
      { key: 'water_leak', label: '漏水', type: 'select', options: [{ value: 'normal', label: '正常' }, { value: 'leak', label: '漏水' }] },
      { key: 'smoke', label: '烟感', type: 'select', options: [{ value: 'normal', label: '正常' }, { value: 'smoke', label: '有烟' }] },
      { key: 'door_status', label: '门禁', type: 'select', options: [{ value: 'closed', label: '关闭' }, { value: 'open', label: '开启' }] },
      { key: 'ups_status', label: 'UPS状态', type: 'text' },
      { key: 'ac_status', label: '空调状态', type: 'text' },
      { key: 'recorded_at', label: '采集时间', type: 'datetime', defaultNow: true },
      { key: 'remark', label: '备注', type: 'textarea' }
    ],
    tableColumns: [
      { key: 'room_name', label: '机房/区域', minWidth: 120 },
      { key: 'temperature', label: '温度(℃)', width: 100 },
      { key: 'humidity', label: '湿度(%RH)', width: 110 },
      { key: 'power_status', label: '供电', width: 90, badge: 'power_status' },
      { key: 'power_kw', label: '功率(kW)', width: 100 },
      { key: 'water_leak', label: '漏水', width: 90, badge: 'water_leak' },
      { key: 'smoke', label: '烟感', width: 90, badge: 'smoke' },
      { key: 'door_status', label: '门禁', width: 90, badge: 'door_status' },
      { key: 'recorded_at', label: '采集时间', width: 160 }
    ],
    filters: [
      { key: 'keyword', label: '关键词', type: 'text', placeholder: '机房/区域' },
      { key: 'power_status', label: '供电', type: 'select', options: POWER_STATUS }
    ]
  },

  energy: {
    key: 'energy',
    label: '能耗',
    icon: 'Histogram',
    desc: '机房用电/用水等能耗数据（用量、计费周期、峰值功率、费用）',
    fields: [
      { key: 'meter_id', label: '表计编号', type: 'text', placeholder: '如：EM-001' },
      { key: 'room_id', label: '所属机房', type: 'text' },
      { key: 'device_id', label: '关联设备ID', type: 'text' },
      { key: 'energy_type', label: '能耗类型', type: 'select', required: true, options: ENERGY_TYPES, default: 'electric' },
      { key: 'consumption', label: '用量', type: 'number', required: true },
      { key: 'unit', label: '单位', type: 'text', default: 'kWh' },
      { key: 'period_start', label: '计费开始', type: 'datetime' },
      { key: 'period_end', label: '计费结束', type: 'datetime' },
      { key: 'peak_power', label: '峰值功率', type: 'number', unit: 'kW' },
      { key: 'cost', label: '费用(元)', type: 'number' },
      { key: 'recorded_at', label: '录入时间', type: 'datetime', defaultNow: true },
      { key: 'remark', label: '备注', type: 'textarea' }
    ],
    tableColumns: [
      { key: 'meter_id', label: '表计编号', width: 120 },
      { key: 'energy_type', label: '类型', width: 90 },
      { key: 'consumption', label: '用量', width: 110, withUnit: 'unit' },
      { key: 'period_start', label: '计费开始', width: 160 },
      { key: 'period_end', label: '计费结束', width: 160 },
      { key: 'peak_power', label: '峰值(kW)', width: 100 },
      { key: 'cost', label: '费用(元)', width: 100 },
      { key: 'recorded_at', label: '录入时间', width: 160 }
    ],
    filters: [
      { key: 'keyword', label: '关键词', type: 'text', placeholder: '表计/机房' },
      { key: 'energy_type', label: '类型', type: 'select', options: ENERGY_TYPES }
    ]
  },

  source: {
    key: 'source',
    label: '数据源管理',
    icon: 'Connection',
    desc: '注册自动采集数据源（SNMP/Modbus/API/MQTT）。当前为预留接口，启用后可由采集适配器自动写入上方四类数据',
    isSource: true,
    fields: [
      { key: 'name', label: '数据源名称', type: 'text', required: true, placeholder: '如：A机房SNMP采集' },
      { key: 'type', label: '采集方式', type: 'select', required: true, options: SOURCE_TYPES, default: 'manual' },
      { key: 'target', label: '目标地址', type: 'text', placeholder: 'IP / URL，如 192.168.1.10' },
      { key: 'protocol', label: '协议细节', type: 'text', placeholder: '如 v2c / TCP502' },
      { key: 'poll_interval', label: '轮询间隔(秒)', type: 'number', default: 60 },
      { key: 'config', label: '连接参数(JSON)', type: 'textarea', placeholder: '{"community":"public","oids":{}}' },
      { key: 'enabled', label: '启用自动采集', type: 'switch', default: false }
    ]
  }
}

// 数据接入中心的标签顺序（不含 source 单独成页）
export const INGEST_TABS = ['alarm', 'sensor', 'env', 'energy']

export function getOptionLabel(options, value) {
  const o = (options || []).find(x => x.value === value)
  return o ? o.label : (value ?? '')
}
