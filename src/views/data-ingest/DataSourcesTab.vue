<template>
  <div class="source-tab">
    <el-alert
      type="info"
      :closable="false"
      show-icon
      class="hint"
    >
      <template #title>自动采集为「预留接口」</template>
      当前为开发阶段，平台仅支持手动录入。此处可提前登记 SNMP / Modbus / API / MQTT 等数据源；
      待未来启用自动采集时，注册对应适配器（<code>registerIngestionAdapter</code>）即可自动写入上方四类数据，无需改动表单与存储结构。
    </el-alert>

    <div class="toolbar">
      <div class="actions">
        <el-button type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon> 登记数据源
        </el-button>
      </div>
    </div>

    <el-table :data="sources" v-loading="store.loading" border stripe class="data-table">
      <el-table-column prop="name" label="名称" min-width="160" />
      <el-table-column label="采集方式" width="120">
        <template #default="{ row }">{{ typeLabel(row.type) }}</template>
      </el-table-column>
      <el-table-column prop="target" label="目标地址" min-width="160" />
      <el-table-column label="轮询间隔" width="110">
        <template #default="{ row }">{{ row.poll_interval || 60 }}s</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
            {{ row.enabled ? '已启用' : '未启用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="最近采集" width="160">
        <template #default="{ row }">{{ row.last_poll_at || '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button text type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button
            text
            size="small"
            :disabled="row.type === 'manual'"
            @click="testConnection(row)"
          >测试连接</el-button>
          <el-button text type="danger" size="small" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
      <template #empty><div class="empty-tip">尚未登记数据源</div></template>
    </el-table>

    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑数据源' : '登记数据源'"
      width="600px"
      destroy-on-close
      append-to-body
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
        <el-form-item
          v-for="f in cfg.fields"
          :key="f.key"
          :label="f.label"
          :prop="f.key"
        >
          <el-input v-if="f.type === 'text'" v-model="form[f.key]" :placeholder="f.placeholder" />
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
            :rows="3"
            :placeholder="f.placeholder"
          />
          <el-select v-else-if="f.type === 'select'" v-model="form[f.key]" style="width:100%">
            <el-option v-for="o in f.options" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
          <el-switch v-else-if="f.type === 'switch'" v-model="form[f.key]" />
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
import { INGEST_TYPES, SOURCE_TYPES } from '../../data/ingestConfig.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'

const store = useDataIngestStore()
const cfg = computed(() => INGEST_TYPES.source)
const sources = computed(() => store.getSources())

function typeLabel(v) {
  const o = SOURCE_TYPES.find(x => x.value === v)
  return o ? o.label : v
}

const dialogVisible = ref(false)
const editingId = ref(null)
const formRef = ref(null)
const form = reactive({})

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
    if (field.default !== undefined) f[field.key] = field.default
    else if (field.type === 'switch') f[field.key] = false
    else f[field.key] = field.type === 'number' ? null : ''
  })
  return f
}

async function load() { await store.loadSources() }

function openCreate() {
  editingId.value = null
  Object.assign(form, buildDefaults())
  dialogVisible.value = true
}
function openEdit(row) {
  editingId.value = row.id
  Object.assign(form, JSON.parse(JSON.stringify(row)))
  form.enabled = !!row.enabled
  dialogVisible.value = true
}

async function submit() {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    const payload = {}
    cfg.value.fields.forEach(f => { payload[f.key] = form[f.key] })
    if (editingId.value) payload.id = editingId.value
    await store.saveSource(payload)
    ElMessage.success('已保存')
    dialogVisible.value = false
    await load()
  })
}

async function remove(row) {
  try {
    await ElMessageBox.confirm('确定删除该数据源吗？', '删除确认', { type: 'warning' })
    await store.deleteSource(row.id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {}
}

// 测试连接：自动采集未启用，仅为预留入口
function testConnection(row) {
  ElMessage.info(`「${typeLabel(row.type)}」为预留采集方式，当前仅手动录入，测试连接暂不可用`)
}

onMounted(load)
</script>

<style scoped>
.source-tab { display: flex; flex-direction: column; gap: 14px; height: 100%; }
/* 统一暗色主题：Element Plus 默认 alert 为浅色底，此处按设计令牌改为与全局一致的深色卡片 */
.source-tab :deep(.el-alert) {
  background: var(--bg-elevated, #14203c);
  border: 1px solid var(--border-color, rgba(148, 163, 184, 0.22));
  border-radius: 10px;
  padding: 12px 16px;
  align-items: flex-start;
}
.source-tab :deep(.el-alert__icon) { color: var(--accent, #22d3ee); font-size: 16px; margin-top: 3px; }
.source-tab :deep(.el-alert__title) { color: var(--text-primary, #c7d2e1); font-size: 13px; font-weight: 600; }
.source-tab :deep(.el-alert__content) { color: var(--text-muted, #8b98ad); font-size: 12px; line-height: 1.75; }
.source-tab :deep(.el-alert__description) { color: var(--text-muted, #8b98ad); }
.hint code { background: var(--dc-accent-soft, rgba(34, 211, 238, 0.12)); padding: 1px 6px; border-radius: 4px; color: var(--accent, #22d3ee); font-size: 11px; }
.toolbar { display: flex; justify-content: flex-end; }
.data-table { flex: 1; }
.empty-tip { color: var(--text-muted, #8b98ad); padding: 24px; }
</style>
