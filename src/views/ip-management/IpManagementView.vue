<template>
  <PageLayout title="IP 管理" subtitle="IP 台账 · 网段 · 自动扫描 · 冲突检测">
    <template #actions>
      <el-button :icon="Refresh" :loading="ipStore.scanning" @click="handleScanNow">立即扫描</el-button>
      <el-button type="primary" :icon="Plus" @click="openAddDialog">新增 IP</el-button>
    </template>

    <!-- 顶部概览统计（与全站统计卡规范一致） -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon total"><el-icon><Files /></el-icon></div>
        <div class="stat-content">
          <div class="stat-value">{{ ipStore.stats.total }}</div>
          <div class="stat-label">IP 总数</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon used"><el-icon><CircleCheck /></el-icon></div>
        <div class="stat-content">
          <div class="stat-value">{{ ipStore.stats.used }}</div>
          <div class="stat-label">已占用</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon free"><el-icon><CircleClose /></el-icon></div>
        <div class="stat-content">
          <div class="stat-value">{{ ipStore.stats.free }}</div>
          <div class="stat-label">空闲</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon reserved"><el-icon><Timer /></el-icon></div>
        <div class="stat-content">
          <div class="stat-value">{{ ipStore.stats.reserved }}</div>
          <div class="stat-label">预留</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon subnet"><el-icon><Connection /></el-icon></div>
        <div class="stat-content">
          <div class="stat-value">{{ ipStore.subnets.length }}</div>
          <div class="stat-label">网段</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon conflict"><el-icon><Warning /></el-icon></div>
        <div class="stat-content">
          <div class="stat-value" :class="{ 'text-danger': ipStore.conflicts.length > 0 }">{{ ipStore.conflicts.length }}</div>
          <div class="stat-label">冲突/异常</div>
        </div>
      </div>
    </div>

    <!-- 冲突告警（置顶） -->
    <el-alert
      v-if="ipStore.conflicts.length > 0"
      type="error"
      :closable="false"
      show-icon
      class="conflict-alert"
      :title="`发现 ${ipStore.conflicts.length} 条冲突/异常，请前往「冲突检测」处理`"
    />

    <el-tabs v-model="activeTab" class="ip-tabs">
      <!-- IP 台账 -->
      <el-tab-pane label="IP 台账" name="ledger">
        <div class="panel-card ledger-panel">
          <div class="ledger-toolbar">
            <el-input
              v-model="searchKeyword"
              placeholder="搜索 IP / MAC / 备注"
              clearable
              :prefix-icon="Search"
              class="search-input"
            />
            <el-select v-model="statusFilter" placeholder="状态筛选" clearable class="filter-select">
              <el-option v-for="s in IP_STATUS" :key="s" :label="s" :value="s" />
            </el-select>
            <div class="spacer"></div>
            <el-button :icon="Connection" @click="handleImportFromDevices">从设备导入</el-button>
            <el-button :icon="Upload" @click="triggerImport">Excel导入</el-button>
            <el-button :icon="Download" @click="handleDownloadTemplate">导入模板</el-button>
            <el-button :icon="Download" @click="handleExport">导出</el-button>
            <input ref="importInput" type="file" accept=".xlsx,.xls,.csv" style="display:none" @change="handleImport" />
          </div>

          <el-table :data="pagedLedger" border height="100%" v-loading="loading" class="ledger-table">
            <el-table-column prop="ip" label="IP 地址" width="150" fixed>
              <template #default="{ row }">
                <span class="ip-cell">{{ row.ip }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="mac" label="MAC 地址" width="170" />
            <el-table-column prop="hostname" label="主机名" min-width="130" />
            <el-table-column prop="deviceType" label="设备类型" width="100">
              <template #default="{ row }">
                <el-tag size="small" effect="plain">{{ row.deviceType }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="location" label="位置" width="120" />
            <el-table-column prop="owner" label="负责人" width="110" />
            <el-table-column prop="status" label="状态" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="statusTagType(row.status)">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="remark" label="备注" min-width="140" show-overflow-tooltip />
            <el-table-column label="操作" width="140" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="openEditDialog(row)">编辑</el-button>
                <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
              </template>
            </el-table-column>
            <template #empty>
              <el-empty description="暂无 IP 台账数据，点击「新增 IP」或「立即扫描」添加" :image-size="80" />
            </template>
          </el-table>
          <div class="ledger-pagination">
            <el-config-provider :locale="zhCn">
              <el-pagination
                v-model:current-page="currentPage"
                v-model:page-size="pageSize"
                :page-sizes="[20, 50, 100, 200]"
                :total="filteredLedger.length"
                layout="total, sizes, prev, pager, next, jumper"
                background
                small
              />
            </el-config-provider>
          </div>
        </div>
      </el-tab-pane>

      <!-- 网段管理 -->
      <el-tab-pane label="网段" name="subnets">
        <div class="panel-card">
          <div class="panel-header">
            <div class="section-title">网段列表</div>
            <el-button type="primary" :icon="Plus" size="small" @click="openSubnetDialog()">新增网段</el-button>
          </div>
          <el-table :data="ipStore.subnets" border class="subnet-table">
            <el-table-column prop="cidr" label="CIDR 网段" width="240">
              <template #default="{ row }">
                <span class="subnet-cidr">{{ row.cidr }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
            <el-table-column label="操作" width="160" align="center">
              <template #default="{ row }">
                <div class="subnet-actions">
                  <el-button link type="primary" size="small" @click="openSubnetDialog(row)">编辑</el-button>
                  <el-button link type="danger" size="small" @click="handleDeleteSubnet(row)">删除</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- 自动扫描 -->
      <el-tab-pane label="自动扫描" name="scan">
        <div class="panel-card">
          <div class="panel-header">
            <div class="section-title">自动扫描引擎</div>
          </div>
          <el-form label-width="100px" class="scan-form">
            <el-form-item label="扫描网段">
              <el-select v-model="scanNetwork" placeholder="选择要扫描的网段" class="scan-select">
                <el-option v-for="s in ipStore.subnets" :key="s.id" :label="s.cidr + (s.remark ? '（' + s.remark + '）' : '')" :value="s.cidr" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :icon="Refresh" :loading="ipStore.scanning" @click="handleScanNetwork">
                {{ ipStore.scanning ? '扫描中...' : '开始扫描' }}
              </el-button>
              <span v-if="ipStore.lastScanTime" class="scan-time">最近扫描：{{ formatTime(ipStore.lastScanTime) }}</span>
            </el-form-item>
            <el-form-item label="定时自动扫描">
              <el-switch :model-value="ipStore.autoScanEnabled" @change="onAutoScanToggle" />
              <el-select
                v-model="autoScanInterval"
                :disabled="!ipStore.autoScanEnabled"
                class="auto-scan-select"
                placeholder="扫描间隔"
              >
                <el-option :value="30" label="每 30 分钟" />
                <el-option :value="60" label="每 1 小时" />
                <el-option :value="360" label="每 6 小时" />
                <el-option :value="1440" label="每天" />
              </el-select>
              <span v-if="ipStore.autoScanEnabled" class="scan-time">自动扫描已开启，将按间隔依次扫描全部网段</span>
            </el-form-item>
          </el-form>

          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="扫描方式：ARP 表 + ICMP ping 全子网探测。扫描到的在线设备将自动写入 IP 台账（已存在的更新 MAC、新发现的追加为「已占用」）。"
          />
        </div>
      </el-tab-pane>

      <!-- 冲突检测 -->
      <el-tab-pane label="冲突检测" name="conflicts">
        <div class="panel-card">
          <el-table :data="ipStore.conflicts" border>
            <el-table-column prop="type" label="类型" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="row.type === '冲突' ? 'danger' : 'warning'">{{ row.type }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="相关 IP" min-width="180">
              <template #default="{ row }">
                <span class="mono">{{ row.ip || row.ips?.join(' / ') }}</span>
              </template>
            </el-table-column>
            <el-table-column label="相关 MAC" min-width="200">
              <template #default="{ row }">
                <span class="mono">{{ row.macs?.join(' / ') || row.mac }}</span>
              </template>
            </el-table-column>
            <el-table-column label="说明" min-width="160">
              <template #default="{ row }">
                <span>{{ row.type === '冲突' ? '同一 IP 对应多个 MAC' : '同一 MAC 对应多个 IP' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="处置" width="120">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="handleResolveConflict(row)">查看详情</el-button>
              </template>
            </el-table-column>
            <template #empty>
              <el-empty description="未检测到冲突/异常" :image-size="80" />
            </template>
          </el-table>

          <el-divider content-position="left">MAC 变更历史</el-divider>
          <el-table :data="ipStore.macHistory" border max-height="280">
            <el-table-column label="时间" width="170">
              <template #default="{ row }">
                <span class="mono">{{ formatTime(row.time) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="ip" label="IP" width="150">
              <template #default="{ row }">
                <span class="mono">{{ row.ip }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="oldMac" label="旧 MAC" min-width="170">
              <template #default="{ row }">
                <span class="mono">{{ row.oldMac || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="newMac" label="新 MAC" min-width="170">
              <template #default="{ row }">
                <span class="mono">{{ row.newMac || '—' }}</span>
              </template>
            </el-table-column>
            <template #empty>
              <el-empty description="暂无 MAC 变更记录" :image-size="60" />
            </template>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 新增/编辑 IP 弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑 IP' : '新增 IP'" width="560px" append-to-body>
      <el-form :model="form" label-width="90px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="IP 地址" required>
              <el-input v-model="form.ip" placeholder="192.168.1.100" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="MAC 地址">
              <el-input v-model="form.mac" placeholder="00:11:22:33:44:55" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="主机名">
              <el-input v-model="form.hostname" placeholder="如 Web-01" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="设备类型">
              <el-select v-model="form.deviceType" class="full-width">
                <el-option v-for="t in DEVICE_TYPES" :key="t" :label="t" :value="t" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="位置">
              <el-input v-model="form.location" placeholder="如 机房A-3" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="负责人">
              <el-input v-model="form.owner" placeholder="如 张三" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态">
              <el-select v-model="form.status" class="full-width">
                <el-option v-for="s in IP_STATUS" :key="s" :label="s" :value="s" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="备注">
              <el-input v-model="form.remark" placeholder="选填" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 网段弹窗 -->
    <el-dialog v-model="subnetDialogVisible" :title="subnetEditingId ? '编辑网段' : '新增网段'" width="480px" append-to-body>
      <el-form :model="subnetForm" label-width="80px">
        <el-form-item label="CIDR" required>
          <el-input v-model="subnetForm.cidr" placeholder="192.168.1.0/24" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="subnetForm.remark" placeholder="如 管理网段" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="subnetDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSaveSubnet">保存</el-button>
      </template>
    </el-dialog>
  </PageLayout>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { Plus, Refresh, Search, Upload, Download, Files, CircleCheck, CircleClose, Timer, Connection, Warning } from '@element-plus/icons-vue'
import { useIPLedgerStore, DEVICE_TYPES, IP_STATUS } from '../../stores/ipLedger'
import { useDeviceStore } from '../../stores'
import dayjs from 'dayjs'

const ipStore = useIPLedgerStore()
const deviceStore = useDeviceStore()
const loading = ref(false)
const activeTab = ref('ledger')
const currentPage = ref(1)
const pageSize = ref(50)

// 台账搜索与状态筛选
const searchKeyword = ref('')
const statusFilter = ref('')
const filteredLedger = computed(() => {
  const kw = (searchKeyword.value || '').trim().toLowerCase()
  return ipStore.ledger.filter(r => {
    if (statusFilter.value && r.status !== statusFilter.value) return false
    if (!kw) return true
    return [r.ip, r.mac, r.hostname, r.remark, r.location, r.owner]
      .some(v => (v || '').toLowerCase().includes(kw))
  })
})
const pagedLedger = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredLedger.value.slice(start, start + pageSize.value)
})

// 新增 / 编辑 IP
const dialogVisible = ref(false)
const editingId = ref(null)
const form = ref({ ip: '', mac: '', hostname: '', deviceType: 'PC', location: '', owner: '', status: '已占用', remark: '' })

function openAddDialog() {
  editingId.value = null
  form.value = { ip: '', mac: '', hostname: '', deviceType: 'PC', location: '', owner: '', status: '已占用', remark: '' }
  dialogVisible.value = true
}
function openEditDialog(row) {
  editingId.value = row.id
  form.value = { ...row }
  dialogVisible.value = true
}
function handleSave() {
  if (!form.value.ip.trim()) { ElMessage.warning('请输入 IP 地址'); return }
  if (editingId.value) {
    const res = ipStore.updateRecord(editingId.value, form.value)
    if (res?.success) { ElMessage.success('已更新'); dialogVisible.value = false }
    else { ElMessage.error(res?.error || '更新失败') }
  } else {
    const res = ipStore.addRecord(form.value)
    if (res.success) { ElMessage.success('已新增'); dialogVisible.value = false }
    else { ElMessage.error(res.error) }
  }
}
function handleDelete(row) {
  ElMessageBox.confirm(`确定删除 IP ${row.ip} 吗？`, '确认删除', {
    type: 'warning',
    confirmButtonText: '确定',
    cancelButtonText: '取消'
  })
    .then(() => { ipStore.removeRecord(row.id); ElMessage.success('已删除') })
    .catch(() => {})
}

// 网段
const subnetDialogVisible = ref(false)
const subnetEditingId = ref(null)
const subnetForm = ref({ cidr: '', remark: '' })
function openSubnetDialog(row) {
  subnetEditingId.value = row ? row.id : null
  subnetForm.value = row ? { cidr: row.cidr, remark: row.remark } : { cidr: '', remark: '' }
  subnetDialogVisible.value = true
}
function handleSaveSubnet() {
  if (!subnetForm.value.cidr.trim()) { ElMessage.warning('请输入 CIDR 网段'); return }
  if (subnetEditingId.value) {
    const res = ipStore.updateSubnet(subnetEditingId.value, subnetForm.value)
    if (res?.success) { ElMessage.success('已更新'); subnetDialogVisible.value = false }
    else { ElMessage.error(res?.error || '更新失败') }
  } else {
    const res = ipStore.addSubnet(subnetForm.value)
    if (res?.success) { ElMessage.success('已新增'); subnetDialogVisible.value = false }
    else { ElMessage.error(res?.error || '新增失败') }
  }
}
function handleDeleteSubnet(row) {
  ElMessageBox.confirm(`确定删除网段 ${row.cidr} 吗？`, '确认删除', {
    type: 'warning',
    confirmButtonText: '确定',
    cancelButtonText: '取消'
  })
    .then(() => { ipStore.removeSubnet(row.id); ElMessage.success('已删除') })
    .catch(() => {})
}

// 扫描
const scanNetwork = ref('')
async function handleScanNetwork() {
  if (!scanNetwork.value) { ElMessage.warning('请先选择扫描网段'); return }
  loading.value = true
  const res = await ipStore.scanNetwork(scanNetwork.value)
  loading.value = false
  if (res.success) {
    ElMessage.success(`扫描完成，发现 ${res.count} 个在线设备，已写入台账`)
    activeTab.value = 'ledger'
  } else {
    ElMessage.error(res.error || '扫描失败')
  }
}
async function handleScanNow() {
  const first = ipStore.subnets[0]
  if (!first) { ElMessage.warning('请先在「网段」页新增网段'); return }
  scanNetwork.value = first.cidr
  await handleScanNetwork()
}

// ============ 定时自动扫描 ============
const autoScanInterval = ref(ipStore.autoScanInterval || 30)
function onAutoScanToggle(val) {
  if (val) {
    ipStore.startAutoScan(Number(autoScanInterval.value))
    ElMessage.success(`自动扫描已开启（间隔 ${autoScanInterval.value} 分钟）`)
  } else {
    ipStore.stopAutoScan()
    ElMessage.info('自动扫描已关闭')
  }
}
// 间隔变化时，若自动扫描已开启则按新间隔重启
watch(autoScanInterval, (v) => {
  if (ipStore.autoScanEnabled && v) {
    ipStore.startAutoScan(Number(v))
  }
})
onMounted(() => {
  // 若之前开启了自动扫描（已持久化），重新建立定时器
  if (ipStore.autoScanEnabled) {
    autoScanInterval.value = ipStore.autoScanInterval || 30
    ipStore.startAutoScan(autoScanInterval.value)
  }
})

// 从设备管理导入设备 IP
function handleImportFromDevices() {
  const devices = (deviceStore.devices || []).filter(d => d.ip && String(d.ip).trim())
  if (devices.length === 0) {
    ElMessage.warning('设备管理中没有带 IP 的设备可导入')
    return
  }
  ElMessageBox.confirm(
    `将从设备管理导入 ${devices.length} 个设备 IP 到台账（重复 IP 自动跳过），是否继续？`,
    '从设备导入',
    { type: 'info', confirmButtonText: '导入', cancelButtonText: '取消' }
  ).then(() => {
    const res = ipStore.importFromDevices(deviceStore.devices)
    if (res.added > 0) {
      ElMessage.success(`导入完成：新增 ${res.added} 条，跳过 ${res.skipped} 条（重复或无效）`)
    } else {
      ElMessage.info(`没有新增记录（${res.skipped} 条 IP 已在台账中或无效）`)
    }
  }).catch(() => {})
}

// 导入 / 导出
const importInput = ref(null)
function triggerImport() { importInput.value?.click() }
function handleImport(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    try {
      const wb = XLSX.read(ev.target.result, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet)
      const records = rows.map(r => ({
        ip: r['IP'] ?? r['ip'],
        mac: r['MAC'] ?? r['mac'],
        hostname: r['主机名'] ?? r['hostname'],
        deviceType: r['设备类型'] ?? r['deviceType'] ?? 'PC',
        location: r['位置'] ?? r['location'],
        owner: r['负责人'] ?? r['owner'],
        status: r['状态'] ?? r['status'] ?? '已占用',
        remark: r['备注'] ?? r['remark']
      }))
      const res = ipStore.bulkAdd(records)
      ElMessage.success(`导入完成：新增 ${res.added} 条，跳过 ${res.skipped} 条（重复或无效）`)
    } catch (err) {
      ElMessage.error('导入失败：' + err.message)
    }
    e.target.value = ''
  }
  reader.readAsArrayBuffer(file)
}
function handleExport() {
  if (ipStore.ledger.length === 0) { ElMessage.warning('暂无数据可导出'); return }
  const data = ipStore.ledger.map(r => ({
    IP: r.ip, MAC: r.mac, 主机名: r.hostname, 设备类型: r.deviceType,
    位置: r.location, 负责人: r.owner, 状态: r.status, 备注: r.remark
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'IP台账')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  saveAs(new Blob([out], { type: 'application/octet-stream' }), `IP台账_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`)
}

function handleDownloadTemplate() {
  const sample = [
    { IP: '192.168.1.10', MAC: '00:11:22:33:44:55', 主机名: 'Web-01', 设备类型: '服务器', 位置: '机房A', 负责人: '张三', 状态: '已占用', 备注: '示例' },
    { IP: '192.168.1.11', MAC: '00:11:22:33:44:56', 主机名: 'SW-Core', 设备类型: '交换机', 位置: '机柜B-1', 负责人: '李四', 状态: '已占用', 备注: '' }
  ]
  const ws = XLSX.utils.json_to_sheet(sample)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '导入模板')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  saveAs(new Blob([out], { type: 'application/octet-stream' }), 'IP台账_导入模板.xlsx')
}

function handleResolveConflict(row) {
  const detail = row.records.map(r => `IP: ${r.ip}, MAC: ${r.mac || '无'}, 主机名: ${r.hostname || '无'}, 位置: ${r.location || '无'}`).join('\n')
  ElMessageBox.alert(detail, `${row.type}详情`, { confirmButtonText: '知道了' })
}

function statusTagType(s) {
  if (s === '已占用') return 'success'
  if (s === '预留') return 'warning'
  return 'info'
}
function formatTime(t) {
  return t ? dayjs(t).format('YYYY-MM-DD HH:mm') : '从未扫描'
}


</script>

<style scoped lang="scss">
/* ===== 统计卡：与全站 stats-grid 规范一致 ===== */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 4px;
}

.stat-card {
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: var(--shadow-md);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;

  &.total { background: linear-gradient(135deg, #4776e6 0%, #8e54e9 100%); color: #fff; }
  &.used { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: #fff; }
  &.free { background: linear-gradient(135deg, #4b6cb7 0%, #182848 100%); color: #fff; }
  &.reserved { background: linear-gradient(135deg, #f7971e 0%, #ffd200 100%); color: #fff; }
  &.subnet { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; }
  &.conflict { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: #fff; }
}

.stat-content { flex: 1; }
.stat-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  &.text-danger { color: var(--accent-red); }
}
.stat-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.conflict-alert { margin-bottom: 0; }

/* ===== 标签页：header 卡片化，与全站一致 ===== */
.ip-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;

  :deep(.el-tabs__header) {
    background: var(--bg-glass);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: 8px 16px;
    margin: 0 0 12px;
    box-shadow: var(--shadow-md);
  }
  :deep(.el-tabs__content) { flex: 1; min-height: 0; }
  :deep(.el-tab-pane) { height: 100%; display: flex; flex-direction: column; }

  /* 标签文字：未选中态提亮，深色底上清晰可读 */
  :deep(.el-tabs__item) {
    color: var(--text-primary);
    font-weight: 500;
    font-size: 13px;
  }
  :deep(.el-tabs__item:hover) {
    color: var(--text-heading, #e8e8e8);
  }
  :deep(.el-tabs__item.is-active) {
    color: var(--accent);
    font-weight: 600;
  }
  :deep(.el-tabs__active-bar) {
    background-color: var(--accent);
  }
}

/* ===== 内容卡片容器：对齐 config-section 规范 ===== */
.panel-card {
  flex: 1;
  min-height: 0;
  padding: 20px;
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  overflow: auto;
}

.ledger-panel { overflow: hidden; }

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

/* ===== 台账工具栏 ===== */
.ledger-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  flex-shrink: 0;

  .search-input { width: 280px; }
  .filter-select { width: 130px; }
  .spacer { flex: 1; }
}

.ledger-table { flex: 1; }
.ledger-pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 10px;
  flex-shrink: 0;
}

.ip-cell { font-family: 'SF Mono', Consolas, monospace; font-weight: 600; color: var(--text-primary); }
.mono { font-family: 'SF Mono', Consolas, monospace; }

/* ===== 网段列表表格列格式 ===== */
.subnet-table {
  .subnet-cidr {
    font-family: 'SF Mono', Consolas, monospace;
    font-weight: 600;
    color: var(--text-primary);
    font-size: 13px;
  }
  .subnet-actions {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    white-space: nowrap;

    :deep(.el-button) {
      padding: 0 !important;
      background: transparent !important;
      border-color: transparent !important;
      box-shadow: none !important;
      font-size: 12px !important;
      font-weight: 500 !important;

      &.el-button--primary { color: var(--accent) !important; }
      &.el-button--danger { color: var(--accent-red) !important; }

      &:hover { opacity: 0.8; }
    }
  }
}

/* ===== 扫描面板 ===== */
.scan-form { max-width: 520px; }
.scan-select { width: 100%; }
.auto-scan-select { width: 140px; margin-left: 8px; }
.scan-time {
  margin-left: 12px;
  color: var(--text-secondary);
  font-size: 12px;
}

.full-width { width: 100%; }
</style>