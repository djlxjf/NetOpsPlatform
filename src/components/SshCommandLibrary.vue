<template>
  <el-dialog
    :model-value="modelValue"
    title="网络设备命令大全（华为 / H3C / 思科 / 锐捷）"
    width="860px"
    class="cmdlib-dialog"
    :close-on-click-modal="false"
    @update:model-value="v => emit('update:modelValue', v)"
  >
    <div class="cmdlib-body">
      <!-- 厂商选择 -->
      <div class="cmd-vendors">
        <div
          v-for="(v, k) in CMD_LIB"
          :key="k"
          class="cmd-vendor"
          :class="{ active: curVendor === k }"
          @click="curVendor = k; curCat = firstCat(k)"
        >
          {{ v.label }}
          <span class="vcnt">{{ Object.keys(v.sections).length }}</span>
        </div>
      </div>

      <!-- 分类选择 -->
      <div class="cmd-cats">
        <div
          v-for="(s, k) in CMD_LIB[curVendor].sections"
          :key="k"
          class="cmd-cat"
          :class="{ active: curCat === k }"
          @click="curCat = k"
        >
          <div class="cat-name">{{ s.name }}</div>
          <div class="cat-desc">{{ s.desc }}</div>
        </div>
      </div>

      <!-- 命令列表 / 配置模板 -->
      <div class="cmd-list">
        <h4>{{ CMD_LIB[curVendor].label }} · {{ curSection.name }}</h4>
        <div v-if="curSection.note" class="cmd-note">⚠ {{ curSection.note }}</div>
        <table v-if="curSection.cmds" class="cmd-table">
          <thead><tr><th>命令</th><th style="width:46%">作用</th><th style="width:80px">操作</th></tr></thead>
          <tbody>
            <tr v-for="(c, i) in curSection.cmds" :key="i">
              <td class="cmd">{{ c[0] }}</td>
              <td class="desc">{{ c[1] }}</td>
              <td>
                <el-button size="small" text type="primary" @click="emit('insert', String(c[0]).split(' ')[0])">填入</el-button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="curSection.code" class="cmd-block-wrap">
          <div class="cmd-block-bar">
            <span>配置模板（可直接复制到终端逐步执行）</span>
            <el-button size="small" text type="primary" @click="copyCode(curSection.code)">复制</el-button>
          </div>
          <pre class="cmd-block">{{ curSection.code }}</pre>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { CMD_LIB } from '@/data/cliCommandLibrary'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  vendor: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'insert'])

const curVendor = ref('huawei')
const curCat = ref('view')

// 打开时按设备厂商自动定位
watch(() => props.modelValue, (open) => {
  if (!open) return
  const v = String(props.vendor || '').toLowerCase()
  if (v.includes('华为') || v.includes('huawei')) curVendor.value = 'huawei'
  else if (v.includes('h3c') || v.includes('华三') || v.includes('新华三')) curVendor.value = 'h3c'
  else if (v.includes('cisco') || v.includes('思科')) curVendor.value = 'cisco'
  else if (v.includes('ruijie') || v.includes('锐捷')) curVendor.value = 'ruijie'
  curCat.value = firstCat(curVendor.value)
})

function firstCat(vendorKey) {
  return Object.keys(CMD_LIB[vendorKey].sections)[0]
}

const curSection = computed(() => CMD_LIB[curVendor.value].sections[curCat.value])

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(code)
    ElMessage.success('配置模板已复制到剪贴板')
  } catch {
    ElMessage.warning('复制失败，请手动选择复制')
  }
}
</script>

<style scoped>
.cmdlib-body {
  display: flex;
  gap: 12px;
  min-height: 480px;
  max-height: 66vh;
  font-size: 13px;
}

/* 厂商列 */
.cmd-vendors {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
  width: 120px;
}

.cmd-vendor {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
}

.cmd-vendor:hover { border-color: var(--el-color-primary); }
.cmd-vendor.active {
  background: var(--el-color-primary);
  color: #fff;
  border-color: var(--el-color-primary);
}

.vcnt {
  font-size: 11px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 1px 6px;
}

/* 分类列 */
.cmd-cats {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
  width: 170px;
  overflow-y: auto;
}

.cmd-cat {
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid var(--border-color);
  transition: all 0.15s;
}

.cmd-cat:hover { border-color: var(--el-color-primary); }
.cmd-cat.active {
  border-color: var(--el-color-primary);
  background: rgba(64, 158, 255, 0.08);
}

.cat-name { font-weight: 600; color: var(--text-primary); }
.cat-desc { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

/* 内容列 */
.cmd-list {
  flex: 1;
  overflow-y: auto;
  min-width: 0;
  padding-right: 4px;
}

.cmd-list h4 {
  margin: 0 0 10px;
  font-size: 14px;
  color: var(--text-primary);
}

.cmd-note {
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(230, 162, 60, 0.1);
  border: 1px solid rgba(230, 162, 60, 0.3);
  color: #b88230;
  font-size: 12px;
  margin-bottom: 10px;
  line-height: 1.5;
}

.cmd-table {
  width: 100%;
  border-collapse: collapse;
}

.cmd-table th,
.cmd-table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-color);
  text-align: left;
  vertical-align: top;
}

.cmd-table th {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}

.cmd-table td.cmd {
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 12px;
  color: #0369d1;
  word-break: break-all;
}

.cmd-table td.desc {
  color: var(--text-secondary);
  font-size: 12px;
}

.cmd-block-wrap {
  margin-top: 10px;
}

.cmd-block-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.cmd-block {
  margin: 0;
  padding: 12px;
  background: #0d1117;
  color: #c9d1d9;
  border-radius: 8px;
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.7;
  overflow-x: auto;
  white-space: pre;
}
</style>
