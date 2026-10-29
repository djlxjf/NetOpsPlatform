<template>
  <PageLayout title="数据报表" subtitle="设备、机柜和告警数据统计分析">
    <template #actions>
      <el-button size="small" @click="refreshData">
        <el-icon><Refresh /></el-icon> 刷新数据
      </el-button>
      <el-dropdown trigger="click" @command="handleExportCommand">
        <el-button size="small">
          <el-icon><Download /></el-icon> 导出报表
          <el-icon class="el-icon--right"><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="json">导出 JSON</el-dropdown-item>
            <el-dropdown-item command="excel">导出 Excel</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-select v-model="selectedDays" size="small" style="width: 120px" @change="loadTrendData">
        <el-option label="近7天" :value="7" />
        <el-option label="近15天" :value="15" />
        <el-option label="近30天" :value="30" />
      </el-select>
    </template>

    <!-- 概览卡片 -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon" style="background: rgba(0, 122, 204,0.15)">
          <el-icon :size="20"><Cpu /></el-icon>
        </div>
        <div class="stat-body">
          <div class="stat-value">{{ stats.devices.total }}</div>
          <div class="stat-label">设备总数</div>
        </div>
        <div class="stat-trend normal">
          <el-icon size="12"><TrendCharts /></el-icon>
          {{ stats.devices.online }}/{{ stats.devices.total }}
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background: rgba(103,194,58,0.15)">
          <el-icon :size="20"><Box /></el-icon>
        </div>
        <div class="stat-body">
          <div class="stat-value">{{ stats.cabinets.total }}</div>
          <div class="stat-label">机柜总数</div>
        </div>
        <div class="stat-trend normal">
          <el-icon size="12"><TrendCharts /></el-icon>
          {{ avgCabinetUtilization }}%
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background: rgba(230,162,60,0.15)">
          <el-icon :size="20"><Connection /></el-icon>
        </div>
        <div class="stat-body">
          <div class="stat-value">{{ stats.ports.total }}</div>
          <div class="stat-label">端口总数</div>
        </div>
        <div class="stat-trend" :class="stats.ports.percentage > 80 ? 'up' : 'warn'">
          <el-icon size="12"><TrendCharts /></el-icon>
          {{ stats.ports.percentage }}% UP
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background: rgba(245,108,108,0.15)">
          <el-icon :size="20"><Bell /></el-icon>
        </div>
        <div class="stat-body">
          <div class="stat-value">{{ stats.alerts.critical + stats.alerts.warning }}</div>
          <div class="stat-label">未处理告警</div>
        </div>
        <div class="stat-trend" :class="(stats.alerts.critical + stats.alerts.warning) > 0 ? 'warn' : 'up'">
          <el-icon size="12"><Warning /></el-icon>
          {{ stats.alerts.critical }} 严重
        </div>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title">设备状态分布</div>
        <div ref="deviceStatusChartRef" class="chart-container"></div>
      </div>

      <div class="chart-card">
        <div class="chart-title">设备类型统计</div>
        <div ref="deviceTypeChartRef" class="chart-container"></div>
      </div>

      <div class="chart-card">
        <div class="chart-title">设备厂商分布</div>
        <div ref="vendorChartRef" class="chart-container"></div>
      </div>

      <div class="chart-card">
        <div class="chart-title">机柜利用率</div>
        <el-empty v-if="stats.cabinets.utilization.length === 0" class="chart-empty" description="暂无数据" :image-size="60" />
        <div v-else ref="cabinetChartRef" class="chart-container"></div>
      </div>

      <div class="chart-card wide">
        <div class="chart-title">设备在线趋势</div>
        <el-empty v-if="trendData.length === 0" class="chart-empty" description="暂无数据" :image-size="60" />
        <div v-else ref="trendChartRef" class="chart-container"></div>
      </div>

      <div class="chart-card wide">
        <div class="chart-title">端口状态趋势</div>
        <el-empty v-if="trendData.length === 0" class="chart-empty" description="暂无数据" :image-size="60" />
        <div v-else ref="portTrendChartRef" class="chart-container"></div>
      </div>
    </div>
  </PageLayout>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import PageLayout from '../../components/PageLayout.vue'
import { useStatsStore, useDeviceStore, useCabinetStore, usePortStateStore, useAlertStore } from '../../stores'
import { ElMessage } from 'element-plus'
import { Refresh, Download, ArrowDown, Cpu, Box, Connection, Warning } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'

const statsStore = useStatsStore()
const deviceStore = useDeviceStore()
const cabinetStore = useCabinetStore()
const portStateStore = usePortStateStore()
const alertStore = useAlertStore()

const selectedDays = ref(7)
const deviceStatusChartRef = ref(null)
const deviceTypeChartRef = ref(null)
const vendorChartRef = ref(null)
const cabinetChartRef = ref(null)
const trendChartRef = ref(null)
const portTrendChartRef = ref(null)

// 图表实例缓存：首次 init 后复用，后续用 setOption(option, true) 增量更新，避免重复销毁重建
const chartInstances = new Map()

// ---------- 主题色：从 CSS 变量读取，缺失时回退默认值 ----------
function cssVar(name, fallback) {
  const val = getComputedStyle(document.documentElement).getPropertyValue(name)
  return (val || '').trim() || fallback
}

// 把主题色转为带透明度的 rgba，用于 areaStyle 等半透明场景
function colorWithAlpha(hex, alpha) {
  let h = (hex || '').replace('#', '')
  if (!h) return `rgba(128, 128, 128, ${alpha})`
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const num = parseInt(h, 16)
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`
}

// 获取（复用）图表实例：无实例时 echarts.init，有则直接复用
function getChartInstance(key, dom) {
  if (!dom) return null
  let chart = chartInstances.get(key)
  if (!chart) {
    chart = echarts.init(dom)
    chartInstances.set(key, chart)
  }
  return chart
}

// 销毁并移除实例（数据为空、图表被 el-empty 替换时调用）
function disposeChart(key) {
  const chart = chartInstances.get(key)
  if (chart) {
    chart.dispose()
    chartInstances.delete(key)
  }
}

const stats = computed(() => statsStore.currentStats)

// 趋势数据（与 selectedDays 联动，空数据时模板显示 el-empty）
const trendData = computed(() => statsStore.getTrendData(selectedDays.value))

const avgCabinetUtilization = computed(() => {
  if (stats.value.cabinets.utilization.length === 0) return 0
  const total = stats.value.cabinets.utilization.reduce((sum, c) => sum + c.percentage, 0)
  return Math.round(total / stats.value.cabinets.utilization.length)
})

function refreshData() {
  statsStore.refreshStats()
  renderAllCharts()
  ElMessage.success('数据已刷新')
}

function exportJson() {
  const data = statsStore.exportStats()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `netops-report-${dayjs().format('YYYYMMDDHHmmss')}.json`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('报表已导出')
}

// 导出 Excel：两个 sheet（概览统计 + 设备明细）
function exportExcel() {
  const s = stats.value
  const overviewRows = [
    { 指标: '设备总数', 数值: s.devices.total },
    { 指标: '在线设备数', 数值: s.devices.online },
    { 指标: '离线设备数', 数值: s.devices.offline },
    { 指标: '未知设备数', 数值: s.devices.unknown },
    { 指标: '机柜总数', 数值: s.cabinets.total },
    { 指标: '端口总数', 数值: s.ports.total },
    { 指标: 'UP 端口数', 数值: s.ports.up },
    { 指标: 'DOWN 端口数', 数值: s.ports.down },
    { 指标: '端口 UP 率(%)', 数值: s.ports.percentage },
    { 指标: '严重告警数', 数值: s.alerts.critical },
    { 指标: '警告告警数', 数值: s.alerts.warning },
    { 指标: '未处理告警数', 数值: s.alerts.critical + s.alerts.warning },
    { 指标: '平均机柜利用率(%)', 数值: avgCabinetUtilization.value }
  ]

  const statusMap = { online: '在线', offline: '离线', unknown: '未知' }
  const deviceRows = deviceStore.devices.map(d => ({
    名称: d.name || '',
    IP: d.ip || '',
    厂商: d.vendor || '',
    类型: d.type || '',
    状态: statusMap[d.status] || d.status || '',
    位置: d.location || ''
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overviewRows), '概览统计')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(deviceRows), '设备明细')
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  saveAs(
    new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `netops-report-${dayjs().format('YYYYMMDDHHmmss')}.xlsx`
  )
  ElMessage.success('Excel 报表已导出')
}

function handleExportCommand(command) {
  if (command === 'excel') exportExcel()
  else exportJson()
}

function loadTrendData() {
  renderTrendCharts()
}

function renderDeviceStatusChart() {
  if (!deviceStatusChartRef.value) return
  const chart = getChartInstance('deviceStatus', deviceStatusChartRef.value)
  if (!chart) return

  const option = {
    tooltip: { trigger: 'item' },
    legend: { orient: 'vertical', left: 'left' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 10, borderColor: cssVar('--bg-card', '#252526'), borderWidth: 2 },
      label: { show: true, formatter: '{b}: {c} ({d}%)' },
      data: [
        { value: stats.value.devices.online, name: '在线', itemStyle: { color: cssVar('--accent-blue', '#007acc') } },
        { value: stats.value.devices.offline, name: '离线', itemStyle: { color: cssVar('--accent-red', '#ef4444') } },
        { value: stats.value.devices.unknown, name: '未知', itemStyle: { color: cssVar('--accent-orange', '#f59e0b') } }
      ]
    }]
  }

  chart.setOption(option, true)
}

function renderDeviceTypeChart() {
  if (!deviceTypeChartRef.value) return
  const chart = getChartInstance('deviceType', deviceTypeChartRef.value)
  if (!chart) return

  const types = stats.value.devices.types
  const data = Object.keys(types).map(key => ({
    name: key,
    value: types[key]
  }))

  const option = {
    tooltip: { trigger: 'item' },
    legend: { orient: 'vertical', left: 'left' },
    series: [{
      type: 'pie',
      radius: '60%',
      data: data.length > 0 ? data : [{ name: '暂无数据', value: 1 }]
    }]
  }

  chart.setOption(option, true)
}

function renderVendorChart() {
  if (!vendorChartRef.value) return
  const chart = getChartInstance('vendor', vendorChartRef.value)
  if (!chart) return

  const vendors = stats.value.devices.vendors
  const data = Object.keys(vendors).map(key => ({
    name: key,
    value: vendors[key]
  }))

  const option = {
    tooltip: { trigger: 'item' },
    legend: { orient: 'vertical', left: 'left' },
    series: [{
      type: 'pie',
      radius: '60%',
      data: data.length > 0 ? data : [{ name: '暂无数据', value: 1 }]
    }]
  }

  chart.setOption(option, true)
}

function renderCabinetChart() {
  const data = stats.value.cabinets.utilization
  // 空数据：不渲染图表，销毁实例（模板显示 el-empty）
  if (data.length === 0) {
    disposeChart('cabinet')
    return
  }
  if (!cabinetChartRef.value) return
  const chart = getChartInstance('cabinet', cabinetChartRef.value)
  if (!chart) return

  const option = {
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      data: data.map(d => d.name),
      axisLabel: { interval: 0, rotate: 30 }
    },
    yAxis: {
      type: 'value',
      max: 100,
      axisLabel: { formatter: '{value}%' }
    },
    series: [{
      type: 'bar',
      data: data.map(d => d.percentage),
      itemStyle: {
        color: params => {
          if (params.value > 80) return cssVar('--accent-red', '#ef4444')
          if (params.value > 60) return cssVar('--accent-orange', '#f59e0b')
          return cssVar('--accent-blue', '#007acc')
        }
      }
    }]
  }

  chart.setOption(option, true)
}

function renderTrendCharts() {
  // 空数据：不渲染趋势图，销毁实例（模板显示 el-empty）
  if (trendData.value.length === 0) {
    disposeChart('trend')
    disposeChart('portTrend')
    return
  }

  const xLabels = trendData.value.map(d => dayjs(d.timestamp).format('MM-DD'))

  // 设备在线趋势
  if (trendChartRef.value) {
    const chart = getChartInstance('trend', trendChartRef.value)
    if (!chart) return

    chart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['在线设备', '离线设备'] },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: xLabels
      },
      yAxis: { type: 'value' },
      series: [
        {
          name: '在线设备',
          type: 'line',
          data: trendData.value.map(d => d.stats.devices.online),
          smooth: true,
          itemStyle: { color: cssVar('--accent-blue', '#007acc') },
          areaStyle: { color: colorWithAlpha(cssVar('--accent-green', '#007acc'), 0.1) }
        },
        {
          name: '离线设备',
          type: 'line',
          data: trendData.value.map(d => d.stats.devices.offline),
          smooth: true,
          itemStyle: { color: cssVar('--accent-red', '#ef4444') },
          areaStyle: { color: colorWithAlpha(cssVar('--accent-red', '#ef4444'), 0.1) }
        }
      ]
    }, true)
  }

  // 端口趋势
  if (portTrendChartRef.value) {
    const chart = getChartInstance('portTrend', portTrendChartRef.value)
    if (!chart) return

    chart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['UP端口', 'DOWN端口'] },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: xLabels
      },
      yAxis: { type: 'value' },
      series: [
        {
          name: 'UP端口',
          type: 'line',
          data: trendData.value.map(d => d.stats.ports.up),
          smooth: true,
          itemStyle: { color: cssVar('--accent-cyan', '#38bdf8') },
          areaStyle: { color: colorWithAlpha(cssVar('--accent-cyan', '#38bdf8'), 0.1) }
        },
        {
          name: 'DOWN端口',
          type: 'line',
          data: trendData.value.map(d => d.stats.ports.down),
          smooth: true,
          itemStyle: { color: cssVar('--accent-red', '#ef4444') },
          areaStyle: { color: colorWithAlpha(cssVar('--accent-red', '#ef4444'), 0.1) }
        }
      ]
    }, true)
  }
}

function renderAllCharts() {
  renderDeviceStatusChart()
  renderDeviceTypeChart()
  renderVendorChart()
  renderCabinetChart()
  renderTrendCharts()
}

function handleResize() {
  chartInstances.forEach(chart => chart?.resize())
}

// 监听数据变化
watch([
  () => deviceStore.devices,
  () => cabinetStore.cabinets,
  () => portStateStore.getAllPortStates(),
  () => alertStore.alerts
], () => {
  statsStore.refreshStats()
  renderAllCharts()
}, { deep: true })

// 自动刷新定时器句柄，用于在卸载时清理（修复定时器泄漏）
let autoRefreshTimer = null

onMounted(() => {
  statsStore.refreshStats()
  setTimeout(renderAllCharts, 100)
  window.addEventListener('resize', handleResize)

  // 定期刷新数据并重绘图表（修复：此前只刷新数据缓存、不重绘，且定时器从未清理）
  autoRefreshTimer = setInterval(() => {
    statsStore.refreshStats()
    renderAllCharts()
  }, 5 * 60 * 1000) // 每5分钟
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (autoRefreshTimer) clearInterval(autoRefreshTimer)
  chartInstances.forEach(chart => chart?.dispose())
  chartInstances.clear()
})
</script>

<style lang="scss" scoped>
/* 统计卡片 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;

  @media (max-width: 1400px) {
    grid-template-columns: repeat(4, 1fr);
  }

  @media (max-width: 1200px) {
    grid-template-columns: repeat(3, 1fr);
  }

  @media (max-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
}

.stat-card {
  background: rgba(28, 28, 30, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-lg);
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  transition: all 0.3s cubic-bezier(0.32, 0.72, 0, 1);
  cursor: default;
  position: relative;
  overflow: hidden;
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 3px;
    background: linear-gradient(90deg, var(--info), var(--info));
    transform: scaleX(0);
    transform-origin: left;
    transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
    opacity: 0.8;
  }

  &::after {
    content: '';
    position: absolute;
    top: -50%;
    right: -50%;
    width: 100%;
    height: 100%;
    background: radial-gradient(circle, rgba(56, 189, 248, 0.05) 0%, transparent 70%);
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  &:hover {
    border-color: rgba(56, 189, 248, 0.3);
    transform: translateY(-4px);
    box-shadow: 0 20px 40px -12px rgba(56, 189, 248, 0.15), 0 0 0 1px rgba(56, 189, 248, 0.1);

    &::before {
      transform: scaleX(1);
    }

    &::after {
      opacity: 1;
    }
  }

  @media (max-width: 768px) {
    padding: 16px;
    gap: 12px;
    flex-direction: column;
    align-items: flex-start;

    .stat-trend {
      display: none;
    }
  }
}

.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.3s cubic-bezier(0.32, 0.72, 0, 1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);

  .el-icon {
    color: white;
    font-size: 20px;
  }

  .stat-card:hover & {
    transform: scale(1.05);
  }
}

.stat-body {
  flex: 1;
  min-width: 0;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -1px;
  line-height: 1;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    bottom: -2px;
    left: 0;
    width: 0;
    height: 2px;
    background: var(--info);
    border-radius: 1px;
    transition: width 0.3s cubic-bezier(0.32, 0.72, 0, 1);
  }

  @media (max-width: 768px) {
    font-size: 22px;
  }
}

.stat-card:hover .stat-value::after {
  width: 40px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 6px;
  font-weight: 500;
  letter-spacing: 0.3px;

  @media (max-width: 768px) {
    font-size: 11px;
  }
}

.stat-trend {
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 20px;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
  transition: all 0.3s ease;

  &.up { 
    background: rgba(0, 122, 204, 0.15); 
    color: var(--accent); 
    border: 1px solid rgba(0, 122, 204, 0.2);
  }
  &.warn { 
    background: rgba(245, 158, 11, 0.15); 
    color: var(--warning); 
    border: 1px solid rgba(245, 158, 11, 0.2);
  }
  &.normal { 
    background: rgba(56, 189, 248, 0.1); 
    color: var(--info); 
    border: 1px solid rgba(56, 189, 248, 0.2);
  }
}

/* 图表区 */
.charts-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;

  @media (max-width: 1200px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}

.chart-card {
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 16px;
  .chart-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 12px;
  }

  &.wide {
    grid-column: span 2;
  }
}

.chart-container {
  height: 220px;
  min-height: 200px;
  width: 100%;
  overflow: visible;

  @media (max-width: 768px) {
    height: 200px;
    min-height: 180px;
  }
}

/* 图表空状态占位（与图表同高居中显示“暂无数据”） */
.chart-empty {
  height: 220px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;

  @media (max-width: 768px) {
    height: 200px;
  }
}


/* ===== Green glassmorphism — data report ===== */
.stats-grid .stat-card {
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}
.stat-card::before {
  background: linear-gradient(90deg, var(--accent), var(--info)) !important;
}
.stat-card:hover {
  border-color: var(--accent) !important;
  box-shadow: 0 20px 40px -12px var(--accent-glow), 0 0 0 1px var(--accent-soft) !important;
}
.chart-card {
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

</style>
