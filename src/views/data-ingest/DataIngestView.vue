<template>
  <div class="data-ingest-view">
    <header class="page-head">
      <div class="title-wrap">
        <h2 class="page-title">数据接入</h2>
        <p class="page-sub">手动录入机房告警、机柜传感器、动环监测与能耗数据，并预留自动采集扩展接口</p>
      </div>
    </header>

    <el-tabs v-model="activeTab" class="ingest-tabs">
      <el-tab-pane v-for="t in INGEST_TABS" :key="t" :name="t">
        <template #label>
          <span class="tab-label">
            <el-icon><component :is="iconOf(t)" /></el-icon>
            {{ INGEST_TYPES[t].label }}
          </span>
        </template>
        <IngestDataTab :typeKey="t" />
      </el-tab-pane>

      <el-tab-pane name="source">
        <template #label>
          <span class="tab-label">
            <el-icon><Connection /></el-icon>
            数据源管理
          </span>
        </template>
        <DataSourcesTab />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { INGEST_TYPES, INGEST_TABS } from '../../data/ingestConfig.js'
import IngestDataTab from './IngestDataTab.vue'
import DataSourcesTab from './DataSourcesTab.vue'
import { Connection, Warning, Odometer, Sunny, Histogram } from '@element-plus/icons-vue'

const activeTab = ref('alarm')
const iconMap = { alarm: Warning, sensor: Odometer, env: Sunny, energy: Histogram }
function iconOf(t) {
  return iconMap[t]
}
</script>

<style scoped>
.data-ingest-view { display: flex; flex-direction: column; height: 100%; padding: 16px 20px; box-sizing: border-box; }
.page-head { margin-bottom: 12px; }
.page-title { font-size: 20px; font-weight: 700; color: var(--text-heading, #111827); margin: 0; }
.page-sub { font-size: 13px; color: var(--text-muted, #6b7280); margin: 4px 0 0; }
.ingest-tabs { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.ingest-tabs :deep(.el-tabs__content) { flex: 1; min-height: 0; }
.ingest-tabs :deep(.el-tab-pane) { height: 100%; }
.tab-label { display: inline-flex; align-items: center; gap: 6px; }
</style>
