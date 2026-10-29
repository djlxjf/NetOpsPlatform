<template>
  <div class="ingest-tab">
    <!-- 统计概览 -->
    <div class="stat-row" v-if="statCards.length">
      <div class="stat-card" v-for="c in statCards" :key="c.label">
        <div class="stat-value">{{ c.value }}</div>
        <div class="stat-label">{{ c.label }}</div>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="filters">
        <template v-for="f in cfg.filters" :key="f.key">
          <el-input
            v-if="f.type === 'text'"
            v-model="filters[f.key]"
            :placeholder="f.placeholder"
            size="default"
            clearable
            class="filter-item"
            @keyup.enter="applyFilters"
            @clear="applyFilters"
          />
          <el-select
            v-else-if="f.type === 'select'"
            v-model="filters[f.key]"
            :placeholder="f.label"
            size="default"
            clearable
            class="filter-item"
            @change="applyFilters"
          >
            <el-option v-for="o in f.options" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </template>
        <el-button v-if="hasActiveFilter" text @click="resetFilters">重置</el-button>
      </div>
      <div class="actions">
        <el-button type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon> 录入{{ cfg.label }}
        </el-button>
        <el-button @click="exportCsv"><el-icon><Download /></el-icon> 导出CSV</el-button>
        <el-button
          type="danger"
          :disabled="!selectedIds.length"
          @click="batchRemove"
        >删除选中 ({{ selectedIds.length }})</el-button>
      </div>
    </div>

    <!-- 数据表格 -->
    <el-table
      :data="list"
      v-loading="store.loading"
      border
      stripe
      class="data-table"
      @selection-change="onSelectionChange"
    >
      <el-table-column type="selection" width="44" />
      <el-table-column
        v-for="col in cfg.tableColumns"
        :key="col.key"
        :prop="col.key"
        :label="col.label"
        :width="col.width"
        :min-width="col.minWidth"
      >
        <template #default="{ row }">
          <!-- 徽标列 -->
          <el-tag
            v-if="col.badge"
            :style="badgeStyle(row[col.badge] || row[col.key])"
            size="small"
          >{{ badgeLabel(col.badge, row) }}</el-tag>
          <!-- 带单位数值列 -->
          <span v-else-if="col.withUnit">{{ fmt(row[col.key]) }} <em class="unit">{{ row[col.withUnit] || '' }}</em></span>
          <!-- 普通文本 -->
          <span v-else>{{ fmt(row[col.key]) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button text type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button text type="danger" size="small" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <div class="empty-tip">暂无{{ cfg.label }}，点击「录入{{ cfg.label }}」开始手动填写</div>
      </template>
    </el-table>

    <!-- 录入/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑' + cfg.label : '录入' + cfg.label"
      width="640px"
      destroy-on-close
      append-to-body
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px" class="ingest-form">
        <el-form-item
          v-for="f in cfg.fields"
          :key="f.key"
          :label="f.label + (f.unit ? ' (' + f.unit + ')' : '')"
          :prop="f.key"
        >
          <el-input
            v-if="f.type === 'text'"
            v-model="form[f.key]"
            :placeholder="f.placeholder"
          />
          <el-input
            v-else-if="f.type === 'number'"
            v-model.number="form[f.key]"
            type="number"
            :placeholder="f.placeholder"
          />
          <el-input
            v-else-if="f.type === 'textarea'"
            v-model="form[f.key]"
            type="textarea"
            :rows="2"
            :placeholder="f.placeholder"
          />
          <el-select
            v-else-if="f.type === 'select'"
            v-model="form[f.key]"
            :placeholder="'请选择' + f.label"
            style="width:100%"
          >
            <el-option v-for="o in f.options" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
          <el-date-picker
            v-else-if="f.type === 'datetime'"
            v-model="form[f.key]"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss[Z]"
            format="YYYY-MM-DD HH:mm"
            placeholder="选择时间"
            style="width:100%"
          />
          <span v-else>{{ f.type }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useDataIngestStore } from '../../stores/dataIngest.js'
import { INGEST_TYPES, STATUS_META, getOptionLabel } from '../../data/ingestConfig.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Download } from '@element-plus/icons-vue'

const props = defineProps({ typeKey: { type: String, required: true } })
const store = useDataIngestStore()
const cfg = computed(() => INGEST_TYPES[props.typeKey])

const list = ref([])
const filters = reactive({})
const dialogVisible = ref(false)
const editingId = ref(null)
const formRef = ref(null)
const selectedIds = ref([])

const hasActiveFilter = computed(() => Object.values(filters).some(v => v !== '' && v != null))

function fmt(v) {
  if (v === null || v === undefined || v === '') return '—'
  return v
}

function badgeStyle(val) {
  const meta = STATUS_META[val]
  if (!meta) return {}
  return { backgroundColor: meta.color + '22', color: meta.color, borderColor: meta.color + '55' }
}
function badgeLabel(kind, row) {
  const val = row[kind] || row[kind.replace('_status', '')]
  const meta = STATUS_META[val]
  if (meta) return meta.label
  // 尝试用 select 选项回显
  const optKey = { alarm_level: 'alarm_level', status: 'status', sensor_status: 'status' }[kind]
  return val
}

// 统计卡片（依据 store.stats 动态生成）
const statCards = computed(() => {
  const s = store.stats[props.typeKey]
  if (!s) return []
  if (props.typeKey === 'alarm') {
    return [
      { label: '总告警', value: s.total ?? 0 },
      { label: '未处理', value: s.active ?? 0 },
      { label: '已解决', value: s.resolved ?? 0 }
    ]
  }
  if (props.typeKey === 'env') {
    return [
      { label: '记录数', value: s.total ?? 0 },
      { label: '平均温度℃', value: s.avgTemperature != null ? Number(s.avgTemperature).toFixed(1) : '—' },
      { label: '平均湿度%', value: s.avgHumidity != null ? Number(s.avgHumidity).toFixed(1) : '—' }
    ]
  }
  if (props.typeKey === 'energy') {
    return [
      { label: '记录数', value: s.total ?? 0 },
      { label: '累计用量', value: s.totalConsumption != null ? Number(s.totalConsumption).toFixed(1) : '—' },
      { label: '累计费用(元)', value: s.totalCost != null ? Number(s.totalCost).toFixed(1) : '—' }
    ]
  }
  if (props.typeKey === 'sensor') {
    return [
      { label: '传感器读数', value: s.total ?? 0 },
      { label: '正常', value: (s.byStatus && s.byStatus.normal) || 0 },
      { label: '告警', value: (s.byStatus && s.byStatus.alarm) || 0 }
    ]
  }
  return [{ label: '记录数', value: s.total ?? 0 }]
})

const rules = computed(() => {
  const r = {}
  cfg.value.fields.forEach(f => {
    if (f.required) r[f.key] = [{ required: true, message: f.label + '为必填项', trigger: 'blur' }]
  })
  return r
})

function buildDefaults() {
  const f = {}
  cfg.value.fields.forEach(field => {
    if (field.defaultNow) f[field.key] = new Date().toISOString()
    else if (field.default !== undefined) f[field.key] = field.default
    else f[field.key] = field.type === 'number' ? null : ''
  })
  return f
}

async function load() {
  const data = await store.loadType(props.typeKey, cleanFilters())
  list.value = data || []
}

function cleanFilters() {
  const out = {}
  Object.keys(filters).forEach(k => {
    if (filters[k] !== '' && filters[k] != null) out[k] = filters[k]
  })
  return out
}

function applyFilters() { load() }
function resetFilters() {
  Object.keys(filters).forEach(k => { filters[k] = '' })
  load()
}

function openCreate() {
  editingId.value = null
  Object.assign(form, buildDefaults())
  dialogVisible.value = true
}
function openEdit(row) {
  editingId.value = row.id
  Object.assign(form, JSON.parse(JSON.stringify(row)))
  dialogVisible.value = true
}

const form = reactive({})
async function submit() {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    const payload = {}
    cfg.value.fields.forEach(f => { payload[f.key] = form[f.key] })
    if (editingId.value) {
      await store.updateRecord(props.typeKey, editingId.value, payload)
      ElMessage.success('已更新')
    } else {
      await store.addRecord(props.typeKey, payload)
      ElMessage.success('已录入')
    }
    dialogVisible.value = false
    await load()
  })
}

async function remove(row) {
  try {
    await ElMessageBox.confirm('确定删除该条记录吗？', '删除确认', { type: 'warning' })
    await store.deleteRecord(props.typeKey, row.id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {}
}

function onSelectionChange(rows) {
  selectedIds.value = rows.map(r => r.id)
}
async function batchRemove() {
  try {
    await ElMessageBox.confirm(`确定删除选中的 ${selectedIds.value.length} 条记录吗？`, '批量删除', { type: 'warning' })
    await store.deleteRecords(props.typeKey, selectedIds.value)
    ElMessage.success('已删除')
    await load()
  } catch (e) {}
}

function exportCsv() {
  if (!list.value.length) { ElMessage.warning('暂无数据可导出'); return }
  const cols = cfg.value.tableColumns
  const header = cols.map(c => c.label).join(',')
  const rows = list.value.map(r => cols.map(c => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`).join(','))
  const csv = '﻿' + [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${cfg.value.label}_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(load)
</script>

<style scoped>
.ingest-tab { display: flex; flex-direction: column; gap: 14px; height: 100%; }
.stat-row { display: flex; gap: 12px; flex-wrap: wrap; }
.stat-card {
  flex: 1; min-width: 120px;
  background: var(--bg-elevated, #fff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px; padding: 12px 16px;
}
.stat-value { font-size: 22px; font-weight: 700; color: var(--accent, #3b82f6); }
.stat-label { font-size: 12px; color: var(--text-muted, #6b7280); margin-top: 2px; }
.toolbar { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: center; }
.filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.filter-item { width: 180px; }
.actions { display: flex; gap: 8px; }
.data-table { flex: 1; }
.unit { font-style: normal; color: var(--text-muted, #6b7280); font-size: 12px; }
.empty-tip { color: var(--text-muted, #6b7280); padding: 24px; }
.ingest-form { max-height: 60vh; overflow-y: auto; }
</style>
