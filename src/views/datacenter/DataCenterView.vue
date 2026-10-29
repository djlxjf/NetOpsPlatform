<template>
  <!-- 机房规划宿主（3D 工具整体跑在 Shadow DOM 内，样式与元素 id 完全隔离） -->
  <div class="dc-view">
    <div ref="hostRef" class="datacenter-host"></div>

    <!-- 加载 / 失败状态：引擎初始化约需 1~2 秒（异步读档 + 建柜），
         期间给出明确进度反馈；失败时给出可重试的错误态，避免「黑屏无提示」 -->
    <div v-if="booting" class="dc-booting" role="status" aria-live="polite">
      <div class="dc-booting-card">
        <span class="dc-spinner" aria-hidden="true"></span>
        <span>机房场景加载中…</span>
      </div>
    </div>
    <div v-else-if="initError" class="dc-fatal" role="alert">
      <div class="dc-fatal-card">
        <div class="dc-state-icon" aria-hidden="true">!</div>
        <div class="dc-fatal-title">机房场景加载失败</div>
        <p class="dc-fatal-msg">{{ initError }}</p>
        <div class="dc-fatal-actions">
          <button type="button" class="dc-btn dc-btn-primary" :disabled="booting" @click="retryInit">
            重新加载
          </button>
        </div>
      </div>
    </div>

    <!-- 监控大屏叠加层：顶栏 + 左侧统计 + 右侧告警/动环，仅在监控模式下显示。
         容器 pointer-events:none，仅面板自身接收交互，保证中间 3D 场景可自由操作 -->
    <div v-show="mode === 'monitor' && !fpsImmersive" class="dc-overlay">
      <!-- 顶部标题栏：品牌 + 标题 / 筛选区 / 检索区 / 时钟 -->
      <header class="dc-topbar">
        <div class="dc-brand">
          <span class="dc-brand-mark" aria-hidden="true"></span>
          <div class="dc-brand-text">
            <h1 class="dc-title">3D 机房可视化监控平台</h1>
            <p class="dc-subtitle">NetOps · 机房规划与态势感知</p>
          </div>
        </div>

        <div class="dc-topbar-tools">
          <!-- 状态筛选：一次点击即可聚焦异常机柜，计数随场景实时刷新 -->
          <div class="dc-seg" role="group" aria-label="按机柜状态筛选">
            <button
              v-for="f in statusFilters"
              :key="f.key"
              type="button"
              class="dc-seg-btn"
              :class="{ 'is-active': statusFilter === f.key }"
              :aria-pressed="statusFilter === f.key"
              :disabled="!ready"
              @click="statusFilter = f.key"
            >
              <i class="dc-dot" :class="f.key" aria-hidden="true"></i>
              <span>{{ f.label }}</span>
              <b class="dc-seg-count">{{ f.count }}</b>
            </button>
          </div>

          <!-- 桥架系统显隐（弱电 / 强电 / 配套三类一键切换，3D 层高 3.1 / 3.7 / 4.2-4.5m 分层展示） -->
          <div class="dc-seg dc-bridge-seg" role="group" aria-label="桥架系统显示控制">
            <button
              v-for="bk in bridgeKinds"
              :key="bk.key"
              type="button"
              class="dc-seg-btn"
              :class="{ 'is-active': bridgeVis[bk.key] }"
              :data-bridge="bk.key"
              :aria-pressed="bridgeVis[bk.key]"
              :disabled="!ready"
              :title="bk.title"
              @click="toggleBridge(bk.key)"
            >
              <i class="dc-dot" :class="`bridge-${bk.key}`" aria-hidden="true"></i>
              <span>{{ bk.label }}</span>
            </button>
          </div>

          <!-- 大屏检索：模糊匹配机柜编号/类型，下拉定位飞行 -->
          <div class="dc-search">
            <label class="dc-sr-only" for="dc-search-input">搜索机柜编号或类型</label>
            <input
              id="dc-search-input"
              v-model="searchText"
              class="dc-search-input"
              type="search"
              autocomplete="off"
              placeholder="搜索机柜编号 / 类型"
              @input="onSearchInput"
              @keydown.enter="onSearchEnter"
              @keydown.esc="closeSearch"
              @blur="closeSearch"
            />
            <ul v-if="searchResults.length" class="dc-search-list" role="listbox" aria-label="机柜搜索结果">
              <li
                v-for="r in searchResults"
                :key="r.id"
                role="option"
                :aria-selected="false"
                @mousedown.prevent="onSearchPick(r)"
              >
                <span class="dc-sr-id">{{ r.id }}</span>
                <span class="dc-sr-type">{{ r.type }}</span>
              </li>
            </ul>
            <p v-else-if="searchTouched && searchText" class="dc-search-empty">未找到匹配的机柜</p>
          </div>

          <div class="dc-clock">
            <b>{{ clockTime }}</b>
            <small>{{ clockDate }}</small>
          </div>
        </div>
      </header>

      <!-- 左侧统计列：关键指标（首屏可见）+ 容量与能耗 + 环境仪表 -->
      <aside class="dc-left" ref="dcLeftRef">
        <section class="dc-card" aria-labelledby="dc-kpi-title">
          <h2 id="dc-kpi-title" class="dc-card-title">
            机柜总览
            <span class="dc-card-extra">{{ ready ? `${dash.total} 台在册` : '统计中' }}</span>
          </h2>

          <div v-if="!ready" class="dc-kpi-skeleton" aria-hidden="true">
            <span class="dc-skeleton dc-skeleton-line dc-skeleton-lg"></span>
            <span class="dc-skeleton dc-skeleton-line dc-skeleton-lg"></span>
            <span class="dc-skeleton dc-skeleton-line dc-skeleton-lg"></span>
          </div>
          <div v-else-if="dash.total === 0" class="dc-state is-empty">
            <span class="dc-state-icon" aria-hidden="true">▤</span>
            <span class="dc-state-title">机房暂无机柜</span>
            <span class="dc-state-hint">请先到「机房规划」完成房间与机柜布局</span>
            <button type="button" class="dc-btn" @click="gotoPlan">前往机房规划</button>
          </div>
          <template v-else>
            <div class="dc-kpi-grid">
              <div class="dc-kpi">
                <span class="dc-kpi-label">机柜总数</span>
                <b class="dc-kpi-value">{{ dash.total }}<em>台</em></b>
                <span class="dc-kpi-foot">
                  <span class="dc-tag is-ok">在线 {{ dash.normal }}</span>
                </span>
              </div>
              <div class="dc-kpi">
                <span class="dc-kpi-label">在线设备</span>
                <b class="dc-kpi-value is-accent">{{ dash.normal }}<em>台</em></b>
                <span class="dc-kpi-foot">
                  <span class="dc-tag is-muted">正常在运机柜</span>
                </span>
              </div>
              <div class="dc-kpi">
                <span class="dc-kpi-label">紧急告警</span>
                <b class="dc-kpi-value is-bad">{{ dash.fault }}<em>条</em></b>
                <span class="dc-kpi-foot">
                  <span class="dc-tag is-warn">预警 {{ dash.warning }}</span>
                </span>
              </div>
            </div>

            <!-- 状态分布：一眼看出健康占比与瓶颈 -->
            <div class="dc-dist" role="img" :aria-label="distAria">
              <span class="dc-dist-seg is-ok" :style="{ width: distPct.normal }"></span>
              <span class="dc-dist-seg is-warn" :style="{ width: distPct.warning }"></span>
              <span class="dc-dist-seg is-bad" :style="{ width: distPct.fault }"></span>
            </div>
            <ul class="dc-dist-legend">
              <li><i class="dc-dot normal" aria-hidden="true"></i>正常 {{ dash.normal }}</li>
              <li><i class="dc-dot warning" aria-hidden="true"></i>预警 {{ dash.warning }}</li>
              <li><i class="dc-dot fault" aria-hidden="true"></i>故障 {{ dash.fault }}</li>
            </ul>
          </template>
        </section>

        <section class="dc-card" aria-labelledby="dc-cap-title">
          <h2 id="dc-cap-title" class="dc-card-title">
            容量与能耗
            <span class="dc-card-extra">PUE {{ envPue.toFixed(2) }}</span>
          </h2>
          <ul class="dc-bars">
            <li v-for="b in capacityBars" :key="b.key" class="dc-bar-row" :class="`is-${b.tone}`">
              <div class="dc-bar-head">
                <span class="dc-bar-label">{{ b.label }}</span>
                <b class="dc-bar-value">{{ b.text }}</b>
              </div>
              <div class="dc-bar-track">
                <span class="dc-bar-fill" :style="{ width: `${b.value}%` }"></span>
              </div>
            </li>
          </ul>
        </section>

        <section class="dc-card dc-ring-card" aria-labelledby="dc-env-title">
          <h2 id="dc-env-title" class="dc-card-title">环境与功率</h2>
          <div class="dc-ring-grid">
            <RingGauge :value="envTemp" :max="40" unit="℃" label="环境温度" :loading="!ready" :warn-at="0.7" :bad-at="0.85" />
            <RingGauge :value="envPower" :max="Math.max(100, envPower)" unit="kW" label="机柜功率" :loading="!ready" :decimals="0" :warn-at="0.75" :bad-at="0.9" />
          </div>
        </section>
      </aside>

      <!-- 右侧告警 + 动环列：3D 检查器（设备信息）弹出时整体让位，避免浮层压住面板 -->
      <aside class="dc-right" ref="dcRightRef" v-show="!infoPanelVisible">
        <section class="dc-panel dc-alarm-panel" aria-labelledby="dc-alarm-title">
          <header class="dc-panel-head">
            <h2 id="dc-alarm-title" class="dc-panel-title">实时告警</h2>
            <span class="dc-tag" :class="dash.fault > 0 ? 'is-bad' : dash.warning > 0 ? 'is-warn' : 'is-ok'">
              {{ filteredAlarms.length }} 条
            </span>
          </header>
          <div class="dc-alarm-list" ref="alarmListRef">
            <template v-if="!ready">
              <span v-for="n in 3" :key="`sk-${n}`" class="dc-skeleton dc-skeleton-block" aria-hidden="true"></span>
            </template>
            <template v-else-if="filteredAlarms.length">
              <button
                v-for="a in filteredAlarms"
                :key="a.id"
                type="button"
                class="dc-alarm-item"
                :class="[{ selected: a.rackId === selectedRackId }, a.level]"
                :data-rack="a.rackId"
                :title="`点击飞行定位到机柜 ${a.rackId}`"
                @click="focusRack(a.rackId)"
              >
                <span class="dc-alarm-level" :class="a.level === 'critical' ? 'is-bad' : 'is-warn'">{{ a.levelLabel }}</span>
                <span class="dc-alarm-body">
                  <span class="dc-alarm-title">{{ a.rackId }} · {{ a.msg }}</span>
                  <span class="dc-alarm-time">{{ a.time }}</span>
                </span>
              </button>
            </template>
            <div v-else class="dc-state is-empty">
              <span class="dc-state-icon" aria-hidden="true">✓</span>
              <span class="dc-state-title">暂无告警</span>
              <span class="dc-state-hint">
                {{ statusFilter === 'all' ? '机房运行正常' : '当前筛选条件下没有告警' }}
              </span>
            </div>
          </div>
        </section>

        <section class="dc-panel dc-env-panel" aria-labelledby="dc-env2-title">
          <header class="dc-panel-head">
            <h2 id="dc-env2-title" class="dc-panel-title">动环监测</h2>
            <span class="dc-tag" :class="ingestEnvLatest ? 'is-info' : 'is-muted'">{{ ingestEnvLatest ? '接入数据' : '模拟' }}</span>
          </header>
          <div class="dc-env-grid">
            <RingGauge :value="envHumidity" :max="100" unit="%" label="湿度" :size="66" :loading="!ready" :decimals="0" :warn-at="0.7" :bad-at="0.85" />
            <RingGauge :value="envLoad" :max="100" unit="%" label="配电负载" :size="66" :loading="!ready" :decimals="0" />
            <RingGauge :value="envPue" :max="3" unit="" label="PUE" :size="66" :loading="!ready" :decimals="2" :warn-at="0.5" :bad-at="0.67" />
          </div>
        </section>

        <!-- 机柜传感器表（温度 / 湿度 / 功率 / 状态），点击行可飞行定位 -->
        <section class="dc-panel dc-sensor-panel" aria-labelledby="dc-sensor-title">
          <header class="dc-panel-head">
            <h2 id="dc-sensor-title" class="dc-panel-title">机柜传感器</h2>
            <span class="dc-head-right">
              <span class="dc-card-extra">{{ filteredSensorRows.length }} 台</span>
              <el-button
                text
                class="dc-icon-btn"
                title="监测阈值与刷新设置"
                aria-label="监测阈值与刷新设置"
                @click="openIngestSettings"
              >
                <el-icon><Setting /></el-icon>
              </el-button>
            </span>
          </header>
          <div class="dc-ingest-flag">
            <i class="dc-dot" :class="ingestBridgeAt ? 'normal' : 'warning'" aria-hidden="true"></i>
            <span v-if="ingestBridgeAt">数据接入实时叠加 · {{ ingestBridgeAt }}</span>
            <span v-else>数据接入实时叠加待刷新…</span>
          </div>
          <div class="dc-sensor-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">机柜</th>
                  <th scope="col">类型</th>
                  <th scope="col">℃</th>
                  <th scope="col">湿度%</th>
                  <th scope="col">kW</th>
                  <th scope="col">状态</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="s in filteredSensorRows"
                  :key="s.id"
                  :class="s.status"
                  tabindex="0"
                  :title="`点击飞行定位到机柜 ${s.id}`"
                  @click="focusRack(s.id)"
                  @keydown.enter.prevent="focusRack(s.id)"
                  @keydown.space.prevent="focusRack(s.id)"
                >
                  <td>{{ s.id }}</td>
                  <td>{{ s.type }}</td>
                  <td :class="{ hot: s.temp >= 30 }">{{ s.temp }}</td>
                  <td>{{ s.humidity }}</td>
                  <td>{{ s.power }}</td>
                  <td>
                    <span class="dc-cell-status">
                      <i class="dc-dot" :class="s.status" aria-hidden="true"></i>
                      {{ s.status === 'fault' ? '故障' : s.status === 'warning' ? '预警' : '正常' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-if="ready && filteredSensorRows.length === 0" class="dc-state is-empty">
              <span class="dc-state-hint">
                {{ statusFilter === 'all' ? '暂无机柜传感器数据' : '当前筛选条件下没有机柜' }}
              </span>
            </div>
          </div>
        </section>
      </aside>
    </div>

    <!-- 监测阈值与刷新设置（数据接入实时桥参数，保存后立即生效） -->
    <el-dialog
      v-model="settingsVisible"
      title="监测阈值与刷新设置"
      width="440px"
      append-to-body
    >
      <el-form label-width="150px" class="ingest-settings-form">
        <el-form-item label="温度预警阈值(℃)">
          <el-input-number v-model="settingsForm.tempWarning" :min="10" :max="80" :step="1" controls-position="right" />
        </el-form-item>
        <el-form-item label="温度严重阈值(℃)">
          <el-input-number v-model="settingsForm.tempCritical" :min="10" :max="100" :step="1" controls-position="right" />
        </el-form-item>
        <el-form-item label="湿度预警阈值(%RH)">
          <el-input-number v-model="settingsForm.humWarning" :min="20" :max="100" :step="1" controls-position="right" />
        </el-form-item>
        <el-form-item label="湿度严重阈值(%RH)">
          <el-input-number v-model="settingsForm.humCritical" :min="20" :max="100" :step="1" controls-position="right" />
        </el-form-item>
        <el-form-item label="数据刷新间隔(秒)">
          <el-input-number v-model="settingsForm.intervalSec" :min="2" :max="600" :step="1" controls-position="right" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="settingsVisible = false">取消</el-button>
        <el-button type="primary" @click="saveIngestSettings">保存</el-button>
      </template>
    </el-dialog>

    <!-- 漫游 / 巡检入口已按需求移除（原两按钮），3D 引擎仍保留 roam/patrol 底层能力 -->
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
// 工具外壳（UI 标记唯一来源）与样式以 raw 文本引入，注入 Shadow Root
import toolShell from '../../../datacenter-3d/src/tool-shell.html?raw'
import toolStyle from '../../../datacenter-3d/src/style.css?raw'
// 工具主模块（导出 initDatacenter / disposeDatacenter）
import { initDatacenter, disposeDatacenter } from '../../../datacenter-3d/src/main.js'
import RingGauge from './RingGauge.vue'
import { useMonitoringStore } from '../../stores/monitoring.js'

const monitoring = useMonitoringStore()

const hostRef = ref(null)
let dcApp = null        // 3D 工具实例（非响应式，避免 Vue 代理 Three.js 对象）
let shadowRoot = null
let timer = null
let ingestTimer = null // 数据接入实时桥轮询定时器

// 模式由当前路由唯一决定（不依赖组件是否重建 / prop 是否重传）：
//   /datacenter = plan 可编辑规划态（机房规划入口）；其余（含 /dashboard 数智机房）= monitor 只读监控大屏。
// 仍保留 initialMode prop 作历史兼容（DashboardView / 路由各传一个值），但已不再作为模式真源。
defineProps({
  initialMode: {
    type: String,
    default: 'monitor',
    validator: (v) => ['monitor', 'plan'].includes(v),
  },
})

const route = useRoute()

// 模式真源：当前路由路径。
//   /datacenter（机房规划）→ plan 可编辑态；其余（含 /dashboard 数智机房）→ monitor 只读监控大屏。
// 用 useRoute() 取路由并 watch，保证 SPA 内点侧边栏从「数智机房」切到「机房规划」时也能正确切换，
// 不再受组件是否复用 / 是否 remount 的时机影响（旧方案监听 initialMode prop，跨路由复用实例时不生效）。
function isPlanRoute() {
  return route.path === '/datacenter'
}

const mode = ref(isPlanRoute() ? 'plan' : 'monitor') // 'monitor' | 'plan'
const booting = ref(true) // 3D 引擎初始化中（initDatacenter 完成后置 false）
const initError = ref('') // 引擎初始化失败原因（非空时显示可重试的错误态）
let prehideEl = null // 引擎启动前的预隐藏样式元素（切规划态时须移除，见 applyMode）

// 进入指定模式：更新响应式 mode + 3D 工具只读/可编辑态 + 隐藏/恢复 Shadow DOM 自带 UI。
function applyMode(toPlan) {
  const m = toPlan ? 'plan' : 'monitor'
  mode.value = m
  // 切模式前退出人物第一人称（相机由引擎平滑飞回，避免跨模式残留接管状态）
  if (dcApp && dcApp.fpsActive && typeof dcApp.exitAvatarFPS === 'function') dcApp.exitAvatarFPS()
  applyShadowVisibility(!toPlan)
  // 监控大屏 = 只读巡检态（锁定编辑）；规划模式 = 恢复可编辑
  if (dcApp && typeof dcApp.setInspectMode === 'function') {
    dcApp.setInspectMode(!toPlan)
  }
  // 切规划态时移除引擎启动前的预隐藏样式（#topbar 等 !important 规则若残留，
  // 会把规划态顶栏永久压没——从「数智机房」切「机房规划」时必现）
  if (toPlan && prehideEl && prehideEl.parentNode) {
    prehideEl.parentNode.removeChild(prehideEl)
    prehideEl = null
  }
}

// SPA 内导航（数智机房 → 机房规划 等）路由变化即切换模式
watch(() => route.path, (p) => {
  applyMode(p === '/datacenter')
})

// 大屏数据（每秒刷新一次）
const dash = reactive({ total: 0, normal: 0, warning: 0, fault: 0 })
const sceneReady = ref(false) // 场景机柜数据是否已就绪（驱动加载骨架 → 真实数据 / 空态）
const ready = computed(() => sceneReady.value && !booting.value)
const envTemp = ref(24.5)
const envPower = ref(86)
const envHumidity = ref(46)
const envLoad = ref(62)
const envPue = ref(1.42)
const envItPower = ref(0)   // IT 侧功率（仅服务器柜），用于配电负载口径
const powerCapKw = ref(0)   // 设计配电容量（机柜数 × 功率密度），无配置时按 5kW/柜 兜底
const alarms = ref([])
const liveAlarms = ref([])   // 后端实时告警（B2 广播），与场景派生告警合并展示
const selectedRackId = ref(null) // T17：当前在 3D 场景中选中的机柜（3D → 2D 联动高亮）
const alarmListRef = ref(null)    // 告警列表容器，用于选中后滚动定位
const sensorRows = ref([])       // B6：机柜传感器快照（温度/湿度/功率/状态）
// 数据接入实时桥：把「数据接入」录入的传感器/动环/告警叠加到大屏（仅监控态生效）
const ingestEnvLatest = ref(null)  // 最新一条动环监测记录（机房级温湿度）
const ingestBridgeAt = ref('')     // 最近一次叠加刷新时间
const ingestBridgeCount = ref(0)   // 本页累计叠加刷新次数
const fpsImmersive = ref(false)  // 人物第一人称沉浸态：隐藏大屏面板，避免遮挡第一人称控件条
const infoPanelVisible = ref(false) // 3D 检查器（设备信息）可见：右侧列让位，避免浮层互相遮挡
const dcLeftRef = ref(null)      // 左侧统计列元素：测量实际遮挡宽度供 3D 画面平移
const dcRightRef = ref(null)     // 右侧告警列元素：同上

// 状态筛选：all / normal / warning / fault，同时作用于告警列表与传感器表
const statusFilter = ref('all')
const statusFilters = computed(() => [
  { key: 'all', label: '全部', count: dash.total },
  { key: 'normal', label: '正常', count: dash.normal },
  { key: 'warning', label: '预警', count: dash.warning },
  { key: 'fault', label: '故障', count: dash.fault },
])

// 桥架系统显隐（与 datacenter-3d 的 BridgeSystem 一一对应）：
//   weak  弱电桥架 400mm · 机柜排正上方 · Y=3.40m 横向偏 −0.35m（数据缆线落柜顶后走线口）
//   strong 强电桥架 300mm · 机柜排正上方 · Y=3.40m 横向偏 +0.35m（与弱电同标高水平平行，净距 0.35m，电源缆线落柜顶前走线口）
//   aux   配套桥架：接地干线 Y=4.2m + 消防灭火剂管架 Y=4.5m（横穿机房）
const bridgeVis = ref({ weak: false, strong: false, aux: false })
const bridgeKinds = [
  { key: 'weak', label: '弱电桥架', title: '弱电桥架：400mm 穿孔桥架，沿机柜排正上方水平平行敷设（安装高度 3.40m，横向偏 −0.35m）' },
  { key: 'strong', label: '强电桥架', title: '强电桥架：300mm，沿机柜排正上方与弱电同标高水平平行敷设（安装高度 3.40m，横向偏 +0.35m，净距 0.35m）' },
  { key: 'aux', label: '配套桥架', title: '配套桥架：接地干线（4.2m）+ 消防灭火剂管架（4.5m），横穿机房' },
]
function toggleBridge(kind) {
  // 引擎未就绪（初始化中/失败重试中）时不动作；按钮同时置禁用
  const bridge = dcApp && dcApp._fx && dcApp._fx.bridge
  if (!bridge) return
  const v = !bridge.isVisible(kind)
  bridge.setVisible(kind, v)
  bridgeVis.value = { ...bridgeVis.value, [kind]: v }
}
const filteredAlarms = computed(() => {
  if (statusFilter.value === 'all') return alarms.value
  const want = statusFilter.value === 'fault' ? 'critical' : statusFilter.value
  return alarms.value.filter((a) => a.level === want)
})
const filteredSensorRows = computed(() => {
  if (statusFilter.value === 'all') return sensorRows.value
  return sensorRows.value.filter((s) => s.status === statusFilter.value)
})

// 状态分布条：健康占比一眼可见（异常段为可点击定位的瓶颈入口）
function pctOf(n) {
  const total = dash.total || 0
  return total ? `${(n / total) * 100}%` : '0%'
}
const distPct = computed(() => ({
  normal: pctOf(dash.normal),
  warning: pctOf(dash.warning),
  fault: pctOf(dash.fault),
}))
const distAria = computed(() =>
  `机柜状态分布：正常 ${dash.normal} 台，预警 ${dash.warning} 台，故障 ${dash.fault} 台`)

function toneOf(ratio) {
  if (ratio >= 0.9) return 'bad'
  if (ratio >= 0.75) return 'warn'
  return 'ok'
}
// 容量与能耗：空间利用率 / 配电负载 / 温度负载，统一用阈值语义色标出瓶颈
const capacityBars = computed(() => {
  const cap = powerCapKw.value || 0
  const it = envItPower.value || 0
  const powerRatio = cap > 0 ? Math.min(1, it / cap) : 0
  const tempRatio = Math.min(1, Math.max(0, envTemp.value / 40))
  return [
    {
      key: 'space',
      label: '空间利用率',
      value: Math.min(100, Math.max(0, envLoad.value)),
      text: `${Math.min(100, Math.max(0, envLoad.value))}%`,
      tone: toneOf(Math.min(1, envLoad.value / 100)),
    },
    {
      key: 'power',
      label: '配电负载',
      value: Math.round(powerRatio * 100),
      text: cap > 0 ? `${it} / ${cap} kW` : '未配置',
      tone: toneOf(powerRatio),
    },
    {
      key: 'temp',
      label: '温度负载',
      value: Math.round(tempRatio * 100),
      text: `${envTemp.value} / 40 ℃`,
      tone: toneOf(tempRatio),
    },
  ]
})

// 3D 工具广播检查器显隐（dc-info-vis）：右侧列让位/恢复后遮挡宽度变化，需重测画面平移
function onDcInfoVis(e) {
  infoPanelVisible.value = !!(e && e.detail && e.detail.visible)
  nextTick(() => updateOverlayPan())
}

// 监控大屏面板遮挡补偿：画布保持全屏，测量左右面板对画布的实际覆盖宽度，
// 传给引擎把机房中心平移到面板间净空区正中（修复「机房中心被左侧统计列挡住」）。
// 面板隐藏（规划态 / 第一人称）时 rect 为 0 → 平移量自动归零，恢复居中渲染。
function updateOverlayPan() {
  if (!dcApp || typeof dcApp.setOverlayPan !== 'function') return
  const hostEl = hostRef.value
  if (!hostEl) return
  // 叠加层面板仅在监控大屏态可见（模板 v-show="mode==='monitor' && !fpsImmersive"）。
  // 规划态 / 沉浸态下它们 display:none，getBoundingClientRect 全为 0：若不甄别，
  // right 会被算成「整宿主宽度」，引擎据此 setViewOffset 巨幅左移，把机房甩出
  // 画面中心——这正是「机房规划默认视角非中心」的根因。故非监控态一律复位 0/0，
  // 让机房在画面正中间居中渲染（与数智机房同一 overviewPose 取景，仅面板补偿不同）。
  if (mode.value !== 'monitor' || fpsImmersive.value) {
    dcApp.setOverlayPan(0, 0)
    return
  }
  const hr = hostEl.getBoundingClientRect()
  const lr = dcLeftRef.value ? dcLeftRef.value.getBoundingClientRect() : null
  const rr = dcRightRef.value ? dcRightRef.value.getBoundingClientRect() : null
  const left = lr ? Math.max(0, Math.round(lr.right - hr.left)) : 0
  const right = rr ? Math.max(0, Math.round(hr.right - rr.left)) : 0
  dcApp.setOverlayPan(left, right)
}
const _onWinResize = () => updateOverlayPan()

// 模式 / 沉浸态切换后重测（等 v-show 生效再量，否则拿到的是旧布局尺寸）
watch([mode, fpsImmersive], async () => {
  await nextTick()
  updateOverlayPan()
})

// 大屏检索：模糊匹配 + 下拉定位（监控态下工具自带搜索框被隐藏，此处提供入口）
const searchText = ref('')
const searchResults = ref([])
const searchTouched = ref(false)
let searchTimer = null
let unsubscribeDcAlert = null
function runSearch() {
  searchTouched.value = true
  if (!dcApp || typeof dcApp.search !== 'function') { searchResults.value = []; return }
  searchResults.value = dcApp.search(searchText.value) || []
}
function onSearchInput() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(runSearch, 150)
}
function onSearchEnter() {
  clearTimeout(searchTimer)
  runSearch()
  if (searchResults.value.length >= 1) onSearchPick(searchResults.value[0])
}
function closeSearch() {
  // 延迟清空：blur 早于 mousedown 触发会打断下拉项点击
  setTimeout(() => { searchResults.value = [] }, 120)
}
function onSearchPick(r) {
  if (dcApp && typeof dcApp.focusRackById === 'function') dcApp.focusRackById(r.id)
  searchResults.value = []
  searchText.value = ''
  searchTouched.value = false
}

const clockTime = ref('')
const clockDate = ref('')

/**
 * 把工具样式适配进 Shadow DOM：
 *   1) :root / html,body / body → :host
 *   2) position:fixed → position:absolute
 *   3) 100vh → 100%
 *   4) 全屏浮层 z-index 压到叠加层之下（层叠契约，见下方注释）
 */
function adaptCssForShadow(css) {
  return css
    .replace(/:root\s*\{/, ':host {')
    .replace(/html,\s*body\s*\{/, ':host {')
    .replace(/\nbody\s*\{/, '\n:host {')
    .replace(/position:\s*fixed/g, 'position: absolute')
    .replace(/100vh/g, '100%')
    // 层叠契约：监控大屏叠加层 .dc-overlay 为 z-index:5，而宿主 .datacenter-host
    // 与影子树内 #app 都是 position:absolute + z-index:auto（不形成层叠上下文），
    // 工具自带的全屏浮层（首次引导 .fx-onboard / 快捷键帮助 .fx-help / 加载
    // .fx-loading，原 z-index 40/50）会一路逃逸到根层叠上下文，盖住整个叠加层——
    // 首次进入数智机房时表现为「快速上手」遮罩挡住状态筛选、KPI、告警、传感器，
    // 全部不可点击。此处压到 4：低于叠加层（5）、高于 3D 画布（宿主 z-auto）。
    // 只影响 Shadow DOM 集成；独立运行的 dist 工具保持原有全屏模态行为。
    // 检查器等工具面板（z 18 及以下）仍逃逸在叠加层之上，监控态点选机柜看详情
    // 的行为不变。
    + '\n.fx-onboard,.fx-help,.fx-loading{z-index:4}'
}

// 监控模式下隐藏 3D 工具自带顶部/提示/角标（避免与监控大屏叠加冲突）
// 注意 #statusbar 是 #stats/#help 的父元素：只藏子元素时，父条 34px 高、
// 0.94 不透明度的空壳仍会盖在漫游按钮（z-index 10 < statusbar 的 20）上，
// 表现为「底部按钮文字被一条横条挡住」。必须连父元素一起隐藏。
function applyShadowVisibility(monitorOn) {
  if (!shadowRoot) return
  ;['#topbar', '#stage-hint', '#stats', '#help', '#stepper', '#equip-tools', '#statusbar'].forEach((sel) => {
    const el = shadowRoot.querySelector(sel)
    if (el) el.style.display = monitorOn ? 'none' : ''
  })
}

// 模式由入口唯一决定：数智机房(/dashboard)=monitor 只读监控大屏；机房规划(/datacenter)=plan 可编辑规划态。
// 两页面各自独立、不再互相切换（原右下角模式切换按钮已按需求移除）。

// 告警飞行定位：复用工具自身的射线/相机能力
function focusRack(rackId) {
  if (!dcApp || !dcApp.racks || !rackId) return
  // 第一人称中点击告警定位：先退出第一人称（相机飞回原视角）再飞行
  if (dcApp.fpsActive && typeof dcApp.exitAvatarFPS === 'function') dcApp.exitAvatarFPS()
  const r = dcApp.racks.findById(rackId)
  if (!r) return
  dcApp.racks.setSelected(r)
  if (dcApp.ui) dcApp.ui.showInfo(r)
  dcApp.director.focusRack(r)
  if (dcApp.ui) dcApp.ui.toast(`已定位 ${r.id}`)
}

const router = useRouter()
// 空态引导：无机柜时直达规划页，保证「看到空 → 有下一步」的连贯流程
function gotoPlan() {
  if (isPlanRoute()) return
  router.push('/datacenter')
}

const STATUS_LEVEL = { fault: ['critical', '紧急'], warning: ['warning', '预警'] }
let tickCount = 0

function tick() {
  tickCount++
  // 时钟
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  clockTime.value = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  clockDate.value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} 周${week}`

  // 场景机柜统计
  // 注：dcApp 为非响应式普通变量，其赋值不会触发视图更新；
  // 同时 initDatacenter 内部的 loadPlan 是异步的，早于其完成时 racks 为空。
  // 故此处除赋值外，主动 bump 一个响应式计数器以驱动重渲染。
  // 场景异步就绪前 racks.racks 可能尚未初始化，需做数组存在性判断，避免统计刷新抛 TypeError
  const rackList = dcApp?.racks?.racks
  if (dcApp && dcApp.racks && typeof dcApp.racks.stats === 'function' && Array.isArray(rackList) && rackList.length > 0) {
    sceneReady.value = true
    const s = dcApp.racks.stats()
    dash.total = s.total
    dash.normal = s.normal
    dash.warning = s.warning
    dash.fault = s.fault

    // 告警列表：来自场景中真实机柜状态（warning/fault），按严重度排序
    const list = rackList
      .filter((r) => r.status === 'warning' || r.status === 'fault')
      .map((r) => {
        const [level, label] = STATUS_LEVEL[r.status] || ['info', '提示']
        return {
          id: r.id,
          rackId: r.id,
          level,
          levelLabel: label,
          msg: r.status === 'fault' ? '设备离线/故障' : `温度偏高 ${r.temp}℃`,
          time: clockTime.value,
        }
      })
    list.sort((a, b) => (a.level === 'critical' ? -1 : 1) - (b.level === 'critical' ? -1 : 1))
    // 去重：实时告警（liveAlarms）已让其目标机柜翻为 fault/warning，tick 会再次派生同柜场景告警，
    // 此处按 rackId 剔除已被实时告警覆盖的机柜，避免 2D 面板重复列出同一机柜
    const liveRackIds = new Set(liveAlarms.value.map((a) => a.rackId))
    const sceneList = list.filter((a) => !liveRackIds.has(a.rackId))
    alarms.value = [...sceneList, ...liveAlarms.value]
  }

  // 动环指标：停止随机游走（审查 D-5 / #13）。原每秒 Math.random 抖动与机房无任何关联，
  // 是「信任杀手」。现改为由场景中真实机柜数据确定性派生（温度/密度均值），数值稳定且与
  // 机房状态相关；湿度无真实数据源，给固定基准。仍标注「模拟」，真实动环链路接入后端后
  // 应在此替换为数据契约取值。
  if (dcApp && dcApp.racks && Array.isArray(rackList) && rackList.length > 0) {
    const total = rackList.length
    const avgTemp = rackList.reduce((s, r) => s + (Number(r.temp) || 0), 0) / total
    const avgDensity = rackList.reduce((s, r) => s + (Number(r.density) || 0), 0) / total
    envTemp.value = +Math.min(34, Math.max(18, avgTemp)).toFixed(1)
    envLoad.value = Math.round(Math.min(100, Math.max(0, avgDensity)))
    // 整改 G-PWR-03：机柜功率改为真实加总（服务器柜按 power 字段，空调按制冷量折算），
    // 不再把灭火器等非耗电小设备按柜均公式计入，避免仪表爆表与口径失真。
    const powerSum = rackList.reduce((s2, r) => {
      const p = Number(r.power) || 0
      return s2 + (r.type === 'server' ? p : (r.type === 'ac' ? Math.round(p * 0.31) : 0))
    }, 0)
    envPower.value = Math.round(powerSum)
    // 整改 G-HVAC-04：湿度取工程配置设点（替代写死 45）
    const eng = dcApp && dcApp.eng ? dcApp.eng : null
    envHumidity.value = eng && eng.hvac && Number(eng.hvac.humidity) ? Number(eng.hvac.humidity) : 45
    // 整改 G-PWR-03：PUE = 总能耗/IT 能耗；IT=机柜功率，总=IT+非IT(≈0.35·IT, 工程惯用口径)
    const itKw = rackList.reduce((s2, r) => s2 + (r.type === 'server' ? (Number(r.power) || 0) : 0), 0)
    envPue.value = itKw > 0 ? +((itKw + 0.35 * itKw) / itKw).toFixed(2) : 1.42
    // IT 功率与设计容量（机柜数 × 单机柜功率密度），供「配电负载」容量条使用
    const serverCount = rackList.filter((r) => r.type === 'server').length
    envItPower.value = Math.round(itKw)
    const density = Number(eng && eng.density) || 0
    powerCapKw.value = Math.round(Math.max(itKw, serverCount * (density || 5)))
  }

  // 数据接入实时叠加：动环监测录入的机房级温湿度优先于场景派生值（无录入时保持派生）。
  // 传感器读数已在 applyIngestOverlay 写入机柜，派生逻辑会自动反映到温度负载等指标。
  if (ingestEnvLatest.value) {
    const t = Number(ingestEnvLatest.value.temperature)
    const h = Number(ingestEnvLatest.value.humidity)
    if (Number.isFinite(t)) envTemp.value = +t.toFixed(1)
    if (Number.isFinite(h)) envHumidity.value = +h.toFixed(1)
  }

  // B6：刷新机柜传感器表格（温度/湿度/功率/状态）。
  // 136 行大表每秒整表重建 diff 是「周期性一卡」的来源，降频到每 3 秒一次；
  // 但 bootEngine 末尾会先调用一次 tick()（tickCount===1），首个 tick 必须刷新，
  // 否则大屏首次渲染有近 3 秒的空表期（传感器表区域显示空态）。
  if (dcApp && dcApp.racks && typeof dcApp.racks.sensorTable === 'function' && (tickCount === 1 || tickCount % 3 === 0)) {
    sensorRows.value = dcApp.racks.sensorTable()
  }
}

// 监测阈值与刷新设置（数据接入实时桥参数）
const settingsVisible = ref(false)
const settingsForm = reactive({
  tempWarning: 30, tempCritical: 35, humWarning: 60, humCritical: 80, intervalSec: 5
})
function openIngestSettings() {
  Object.assign(settingsForm, {
    tempWarning: monitoring.config.tempWarning,
    tempCritical: monitoring.config.tempCritical,
    humWarning: monitoring.config.humWarning,
    humCritical: monitoring.config.humCritical,
    intervalSec: monitoring.config.intervalSec
  })
  settingsVisible.value = true
}
async function saveIngestSettings() {
  await monitoring.updateConfig({ ...settingsForm })
  // 刷新间隔可能已修改：重启桥接定时器立即按新间隔运行
  if (ingestTimer) { clearInterval(ingestTimer); ingestTimer = null }
  ingestTimer = setInterval(refreshIngestBridge, Math.max(1, monitoring.config.intervalSec) * 1000)
  settingsVisible.value = false
}

// ===== 数据接入实时桥（手动录入 → 数智机房大屏实时显示）=====
// 轮询「数据接入」记录：阈值评估生成/解除告警 → 叠加到 3D 机柜 → 覆盖机房级环境指标。
// 仅监控大屏态（数智机房）生效；规划态不叠加，避免影响机房编辑。
async function refreshIngestBridge() {
  if (mode.value !== 'monitor' || !dcApp || !dcApp.racks) return
  try {
    await monitoring.tick() // 拉取接入数据 + 阈值评估（自动生成/解除告警）
    if (typeof dcApp.racks.applyIngestOverlay === 'function') {
      dcApp.racks.applyIngestOverlay(monitoring.buildOverlayMap())
    }
    ingestEnvLatest.value = monitoring.latestEnv()
    ingestBridgeAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    ingestBridgeCount.value++
  } catch (e) {
    console.warn('[DataCenterView] 数据接入实时桥刷新失败:', e)
  }
}

// ===== 实时告警（B2 广播）→ 3D 脉冲 + 2D 面板（F1） =====
// 由 device_id 反查 3D 机柜：遍历机柜内设备清单（seed/真实数据均含 devices）
function resolveRackByDevice(deviceId) {
  if (!deviceId || !dcApp || !dcApp.racks) return null
  for (const r of dcApp.racks.racks) {
    const devs = r.devices
    if (Array.isArray(devs) && devs.some((d) => d && (d.id === deviceId || d.deviceId === deviceId))) {
      return r.id
    }
  }
  return null
}

function handleDcAlert(payload) {
  if (!payload || !dcApp || !dcApp.racks) return
  // 解析目标机柜：优先载荷自带 rackId，否则由 device_id 反查（需 B1 设备↔机柜映射就绪）
  const rackId = payload.rackId || resolveRackByDevice(payload.device_id || payload.deviceId)
  const level = payload.level === 'critical' ? 'critical' : 'warning'
  const resolved = payload.status === 'resolved'
  if (rackId && dcApp.racks.setAlert) {
    if (resolved) dcApp.racks.clearAlert(rackId)
    else dcApp.racks.setAlert(rackId, level)
  }
  // 合并进 2D 告警面板（tick() 每秒重建场景告警，此处以 liveAlarms 持久化实时告警）
  if (resolved) {
    liveAlarms.value = liveAlarms.value.filter((a) => a.id !== payload.id)
  } else {
    const item = {
      id: payload.id,
      rackId: rackId || payload.device_id || payload.id,
      level,
      levelLabel: level === 'critical' ? '紧急' : '预警',
      msg: payload.title || payload.message || '实时告警',
      time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    }
    const existing = liveAlarms.value.find((a) => a.id === payload.id)
    if (existing) Object.assign(existing, item)
    else liveAlarms.value = [...liveAlarms.value, item]
  }
}

// T17：3D 选中机柜 → 高亮对应 2D 告警项并滚动到可视区域
watch(selectedRackId, async (id) => {
  if (!id || !alarmListRef.value) return
  await nextTick()
  const el = alarmListRef.value.querySelector(`.dc-alarm-item[data-rack="${id}"]`)
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
})

/**
 * 挂载 3D 引擎（可重试）。
 * 步骤：确保 Shadow Root → 注入外壳与样式 → 预隐藏规划态 UI → initDatacenter → 绑定联动回调。
 * 失败时写入 initError，由界面错误态提供「重新加载」。
 */
async function bootEngine() {
  const host = hostRef.value
  if (!host) return

  // HMR / 快速重挂时宿主可能已挂过 shadow root，再次 attachShadow 会抛
  // `NotSupportedError: Shadow root cannot be created on a host which already hosts a shadow tree`，
  // 直接导致 3D 机房起不来。此处复用已有 shadow root，保证幂等。
  let shadow = host.shadowRoot
  if (!shadow) {
    try {
      shadow = host.attachShadow({ mode: 'open' })
    } catch (err) {
      console.error('[DataCenterView] Shadow DOM 挂载失败:', err)
      initError.value = '浏览器不支持 Shadow DOM，无法加载 3D 机房'
      booting.value = false
      return
    }
  }
  shadowRoot = shadow
  // 重试时先清掉上一次的残留外壳，保证从干净状态重建
  if (prehideEl && prehideEl.parentNode) prehideEl.parentNode.removeChild(prehideEl)
  prehideEl = null
  shadow.innerHTML = `<style>${adaptCssForShadow(toolStyle)}</style>${toolShell}`

  // 监控模式下，在引擎启动前就先隐藏规划态 UI：initDatacenter 异步建 136 柜约需 1~2 秒，
  // 期间工具默认按规划态渲染（顶栏/工作流/状态条全部可见），与监控面板叠加成「中间态」，
  // 表现为进入数智机房时规划界面闪现约 2 秒。此处用样式先压住，引擎就绪后 applyMode 再接管。
  if (mode.value !== 'plan') {
    const prehide = document.createElement('style')
    prehide.textContent = '#topbar,#stage-hint,#stats,#help,#stepper,#equip-tools,#statusbar{display:none!important}'
    shadow.appendChild(prehide)
    prehideEl = prehide
  }

  booting.value = true
  initError.value = ''
  // 桥架显隐态随引擎实例走：重试/重挂会得到全新的 BridgeSystem（默认全隐），
  // 此处同步复位按钮态，避免「引擎已重置而按钮仍显示激活」的不一致
  bridgeVis.value = { weak: false, strong: false, aux: false }
  try {
    // 内部会异步 loadPlan（Electron 下走 IPC 读 SQLite，浏览器下读 localStorage）
    dcApp = await initDatacenter(host)
  } catch (err) {
    console.error('[DataCenterView] 3D 规划工具初始化失败:', err)
    initError.value = (err && err.message) ? err.message : '未知错误，请重试或检查 WebGL 支持'
    dcApp = null
    return
  } finally {
    booting.value = false
  }

  // T17：3D 场景选中机柜 → 同步到 2D 告警面板高亮（双向联动的 3D→2D 方向）
  if (dcApp) dcApp.onRackSelect = (rackId) => { selectedRackId.value = rackId || null }
  // 人物第一人称态变化 → 隐藏/恢复大屏面板（沉浸漫游，防止面板遮挡第一人称控件条）
  if (dcApp) dcApp.onFpsChange = (on) => { fpsImmersive.value = !!on }

  // 依据当前路由进入对应模式：监控大屏（只读巡检态）或规划态（可编辑机房）
  applyMode(mode.value === 'plan')
  // 初始面板遮挡补偿（等一轮渲染确保 grid 布局完成后再测量）
  await nextTick()
  updateOverlayPan()
  tick()
}

// 错误态重试：先销毁旧实例再重建，避免残留 WebGL 上下文与事件监听
async function retryInit() {
  try { disposeDatacenter() } catch (e) { /* 实例可能本身未建成，忽略 */ }
  dcApp = null
  sceneReady.value = false
  dash.total = 0; dash.normal = 0; dash.warning = 0; dash.fault = 0
  alarms.value = []
  sensorRows.value = []
  await bootEngine()
}

onMounted(async () => {
  await bootEngine()

  // window 级监听统一在挂载期注册一次（重试不会重复注册）
  window.addEventListener('resize', _onWinResize)
  window.addEventListener('dc-info-vis', onDcInfoVis)
  // 订阅 3D 机房实时告警广播（B2/F1）：后端告警事件 → 3D 红色脉冲 + 2D 面板
  if (window.electronAPI && typeof window.electronAPI.onDcAlert === 'function') {
    unsubscribeDcAlert = window.electronAPI.onDcAlert(handleDcAlert)
  }
  // B1/F2：初始化时拉取后端聚合状态并应用到 3D 机柜。
  // 后端告警按 device_id 聚合，复用 resolveRackByDevice 反查机柜后写入 3D 状态；无后端数据时安全跳过。
  if (window.electronAPI && typeof window.electronAPI.getRackStatus === 'function') {
    try {
      const byDevice = await window.electronAPI.getRackStatus()
      if (byDevice && dcApp && dcApp.racks && typeof dcApp.racks.applyStatusMap === 'function') {
        const byRack = {}
        for (const [devId, level] of Object.entries(byDevice)) {
          const rackId = resolveRackByDevice(devId)
          if (rackId) byRack[rackId] = level
        }
        if (Object.keys(byRack).length) dcApp.racks.applyStatusMap(byRack)
      }
    } catch (e) { /* 无后端聚合数据时可安全忽略 */ }
  }
  // 数据接入实时桥：加载监测配置 → 立即刷新一次 → 按间隔轮询（仅监控态生效）
  await monitoring.loadConfig()
  await refreshIngestBridge()
  ingestTimer = setInterval(refreshIngestBridge, Math.max(1, monitoring.config.intervalSec) * 1000)
  timer = setInterval(tick, 1000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  if (ingestTimer) { clearInterval(ingestTimer); ingestTimer = null }
  window.removeEventListener('resize', _onWinResize)
  window.removeEventListener('dc-info-vis', onDcInfoVis)
  // 退订实时告警广播（B2/F1），避免卸载后残留监听导致内存泄漏/空引用
  if (unsubscribeDcAlert) { try { unsubscribeDcAlert() } catch (e) { /* noop */ } unsubscribeDcAlert = null }
  liveAlarms.value = []
  // 停渲染循环、解绑 window 监听、释放 WebGL 上下文与场景资源
  disposeDatacenter()
  dcApp = null
})
</script>

<style scoped>
.dc-view {
  position: relative;
  width: 100%;
  height: 100%;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--n-bg-base, #070b16);
  font-family: var(--dc-font);
  /* 与 datacenter-3d/style.css 的 --rail-w 保持一致：监控大屏左侧统计列据此让位 */
  --dc-rail-w: 240px;
  /* 监控大屏左右信息列宽度（随分辨率收缩，见下方媒体查询） */
  --dc-left-w: 250px;
  --dc-right-w: 270px;
}

/* 3D 工具宿主填满主内容区，作为影子树内绝对定位面板的包含块。
   注意：画布保持全屏渲染（不做几何收窄——窄窗口下会只剩几十像素宽）；
   「面板挡住机房中心」由引擎侧画面平移解决（dcApp.setOverlayPan → 相机
   setViewOffset 把机房中心平移到左右面板之间的净空区正中）。 */
.datacenter-host {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

/* ===== 监控大屏叠加层 ===== */
/* 栅格：顶栏（标题 + 筛选 + 检索 + 时钟）贯穿；下方 左信息列 / 3D 舞台 / 右信息列。
   列宽由 --dc-left-w / --dc-right-w 控制，随分辨率收缩（见媒体查询）。 */
.dc-overlay {
  position: absolute;
  /* 底部留 10px 安全区：面板不再顶到窗口底边（修复「下面被挡住」） */
  inset: 0 0 10px 0;
  pointer-events: none; /* 中间区域透传给 3D 场景 */
  z-index: 5;
  display: grid;
  grid-template-columns: 0 var(--dc-left-w) 1fr var(--dc-right-w);
  /* minmax(0,1fr)：允许行高随视口收缩，配合左右列内部滚动，矮窗口不溢出 */
  grid-template-rows: auto minmax(0, 1fr);
  grid-template-areas:
    'top  top  top  top'
    'gap  left center right';
}

/* ---------- 顶部标题栏 ---------- */
.dc-topbar {
  grid-area: top;
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--dc-gap) var(--dc-gap-md);
  min-height: 64px;
  padding: 10px 24px;
  background: linear-gradient(180deg, var(--dc-surface-strong), var(--dc-surface-soft));
  border-bottom: 1px solid var(--dc-border);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
.dc-brand { display: flex; align-items: center; gap: var(--dc-gap); min-width: 0; }
.dc-brand-mark {
  width: 10px; height: 26px; border-radius: var(--dc-r-pill);
  background: linear-gradient(180deg, var(--dc-accent), var(--dc-accent-strong));
  box-shadow: 0 0 14px var(--dc-accent-soft-2);
  flex: none;
}
.dc-brand-text { min-width: 0; }
.dc-title {
  margin: 0;
  color: var(--dc-text-strong);
  font-size: var(--dc-fs-xl);
  font-weight: 600;
  letter-spacing: 1px;
  line-height: var(--n-lh-tight, 1.25);
}
.dc-subtitle {
  margin: 2px 0 0;
  color: var(--dc-text-dim);
  font-size: var(--dc-fs-xs);
}

.dc-topbar-tools {
  display: flex;
  align-items: center;
  gap: var(--dc-gap);
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* ---------- 状态筛选（分段控件） ---------- */
.dc-seg {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: var(--dc-surface-item);
  border: 1px solid var(--dc-border);
  border-radius: var(--dc-r-md);
}
.dc-seg-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: var(--dc-r-sm);
  background: transparent;
  color: var(--dc-text-dim);
  font-size: var(--dc-fs-sm);
  font-family: inherit;
  cursor: pointer;
  transition: background var(--dc-dur) var(--dc-ease), color var(--dc-dur) var(--dc-ease),
              border-color var(--dc-dur) var(--dc-ease);
}
.dc-seg-btn:hover:not(:disabled) { background: var(--dc-surface-item-hover); color: var(--dc-text); }
.dc-seg-btn:active:not(:disabled) { background: var(--dc-surface-item-active); }
.dc-seg-btn.is-active {
  background: var(--dc-accent-soft);
  border-color: var(--dc-accent-line);
  color: var(--dc-text-strong);
}
.dc-seg-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.dc-seg-count {
  font-size: var(--dc-fs-xs);
  font-variant-numeric: tabular-nums;
  color: var(--dc-text-dim);
}
.dc-seg-btn.is-active .dc-seg-count { color: var(--dc-accent); }

/* ---------- 桥架系统显隐（激活色与 3D 桥架渲染色一致） ---------- */
.dc-bridge-seg .dc-seg-btn .dc-dot { width: 10px; height: 10px; border-radius: 2px; }
.dc-bridge-seg .dc-seg-btn.is-active[data-bridge='weak'] {
  background: rgba(56, 189, 248, 0.16);
  border-color: rgba(56, 189, 248, 0.45);
  color: #7dd3fc;
}
.dc-bridge-seg .dc-seg-btn.is-active[data-bridge='strong'] {
  background: rgba(245, 158, 11, 0.16);
  border-color: rgba(245, 158, 11, 0.45);
  color: #fbbf24;
}
.dc-bridge-seg .dc-seg-btn.is-active[data-bridge='aux'] {
  background: rgba(52, 211, 153, 0.16);
  border-color: rgba(52, 211, 153, 0.45);
  color: #6ee7b7;
}

/* ---------- 大屏检索框 ---------- */
.dc-search { position: relative; pointer-events: auto; }
.dc-search-input {
  width: 220px;
  height: 34px;
  padding: 0 12px;
  background: var(--dc-surface);
  border: 1px solid var(--dc-border-strong);
  border-radius: var(--dc-r-md);
  color: var(--dc-text);
  font-family: inherit;
  font-size: var(--dc-fs-md);
  outline: none;
  transition: border-color var(--dc-dur) var(--dc-ease), box-shadow var(--dc-dur) var(--dc-ease);
}
.dc-search-input::placeholder { color: var(--dc-text-faint); }
.dc-search-input:hover { border-color: var(--dc-border-focus); }
.dc-search-input:focus { border-color: var(--dc-accent); box-shadow: 0 0 0 3px var(--dc-accent-soft); }
.dc-search-list {
  position: absolute; top: 40px; left: 0; right: 0; z-index: 20;
  list-style: none; margin: 0; padding: 4px; max-height: 260px; overflow-y: auto;
  background: var(--dc-surface-strong);
  border: 1px solid var(--dc-border-strong);
  border-radius: var(--dc-r-md);
  box-shadow: var(--dc-shadow-lg);
}
.dc-search-list li {
  display: flex; justify-content: space-between; align-items: center;
  min-height: 32px; padding: 6px 10px; border-radius: var(--dc-r-sm); cursor: pointer; font-size: var(--dc-fs-md);
}
.dc-search-list li:hover { background: var(--dc-surface-item-hover); }
.dc-sr-id { color: var(--dc-text-strong); font-variant-numeric: tabular-nums; }
.dc-sr-type { color: var(--dc-text-dim); font-size: var(--dc-fs-xs); }
.dc-search-empty {
  position: absolute; top: 40px; left: 0; right: 0; z-index: 20;
  margin: 0; padding: 8px 10px;
  background: var(--dc-surface-strong);
  border: 1px solid var(--dc-border);
  border-radius: var(--dc-r-md);
  color: var(--dc-text-dim); font-size: var(--dc-fs-xs);
}

/* ---------- 时钟 ---------- */
.dc-clock { text-align: right; color: var(--dc-accent); min-width: 92px; }
.dc-clock b { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
.dc-clock small { display: block; color: var(--dc-text-dim); font-size: var(--dc-fs-xs); margin-top: 2px; }

/* ---------- 左右信息列 ---------- */
.dc-left {
  grid-area: left;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: var(--dc-gap-md);
  padding: var(--dc-gap-md) 14px;
  /* 内容超高时列内滚动，不再静默裁剪/顶出窗口 */
  overflow-y: auto;
  overflow-x: hidden;
}
.dc-right {
  grid-area: right;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: var(--dc-gap-md);
  padding: var(--dc-gap-md) 14px;
  /* 内容超高时列内滚动（传感器表等不再被窗口底边截断） */
  overflow-y: auto;
  overflow-x: hidden;
}
.dc-left::-webkit-scrollbar,
.dc-right::-webkit-scrollbar { width: 6px; }
.dc-left::-webkit-scrollbar-thumb,
.dc-right::-webkit-scrollbar-thumb { background: var(--dc-accent-soft-2); border-radius: 3px; }
.dc-left::-webkit-scrollbar-track,
.dc-right::-webkit-scrollbar-track { background: transparent; }

/* ---------- 卡片 / 面板 ---------- */
.dc-card,
.dc-panel {
  background: var(--dc-surface);
  border: 1px solid var(--dc-border);
  border-radius: var(--dc-r-lg);
  padding: 14px 16px;
  box-shadow: var(--dc-shadow);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.dc-panel { padding: 12px 12px 14px; }
.dc-card-title,
.dc-panel-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--dc-gap-sm);
  margin: 0 0 10px;
  color: var(--dc-text-strong);
  font-size: var(--dc-fs-md);
  font-weight: 600;
  line-height: var(--n-lh-tight, 1.25);
}
.dc-card-extra { color: var(--dc-text-dim); font-size: var(--dc-fs-xs); font-weight: 400; }
.dc-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dc-gap-sm);
  margin-bottom: 10px;
}
.dc-panel-head .dc-panel-title { margin: 0; }

/* ---------- 关键指标 ---------- */
.dc-kpi-grid { display: flex; flex-direction: column; gap: var(--dc-gap-sm); }
.dc-kpi {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--dc-gap-sm);
  flex-wrap: wrap;
  padding: 8px 10px;
  border-radius: var(--dc-r-md);
  background: var(--dc-surface-item);
  border: 1px solid var(--dc-hairline);
}
.dc-kpi-label { color: var(--dc-text-dim); font-size: var(--dc-fs-sm); }
.dc-kpi-value {
  color: var(--dc-text-strong);
  font-size: var(--dc-fs-metric);
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.dc-kpi-value em { font-style: normal; font-size: var(--dc-fs-sm); color: var(--dc-text-dim); margin-left: 4px; font-weight: 400; }
.dc-kpi-value.is-accent { color: var(--dc-accent); }
.dc-kpi-value.is-bad { color: var(--dc-bad); }
.dc-kpi-foot { display: flex; gap: 6px; flex: none; }

/* ---------- 状态分布条 ---------- */
.dc-dist {
  display: flex;
  height: 8px;
  margin-top: var(--dc-gap);
  border-radius: var(--dc-r-pill);
  overflow: hidden;
  background: var(--dc-surface-item);
}
.dc-dist-seg { height: 100%; transition: width var(--dc-dur-slow) var(--dc-ease); }
.dc-dist-seg.is-ok { background: var(--dc-ok); }
.dc-dist-seg.is-warn { background: var(--dc-warn); }
.dc-dist-seg.is-bad { background: var(--dc-bad); }
.dc-dist-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px var(--dc-gap);
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  color: var(--dc-text-dim);
  font-size: var(--dc-fs-xs);
}
.dc-dist-legend li { display: inline-flex; align-items: center; gap: 5px; }

/* ---------- 容量条 ---------- */
.dc-bars { display: flex; flex-direction: column; gap: var(--dc-gap); margin: 0; padding: 0; list-style: none; }
.dc-bar-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--dc-gap-sm); }
.dc-bar-label { color: var(--dc-text-dim); font-size: var(--dc-fs-sm); }
.dc-bar-value { color: var(--dc-text-strong); font-size: var(--dc-fs-sm); font-variant-numeric: tabular-nums; }
.dc-bar-track {
  margin-top: 5px;
  height: 6px;
  border-radius: var(--dc-r-pill);
  background: var(--dc-surface-item);
  overflow: hidden;
}
.dc-bar-fill {
  display: block;
  height: 100%;
  border-radius: var(--dc-r-pill);
  background: var(--dc-ok);
  transition: width var(--dc-dur-slow) var(--dc-ease), background var(--dc-dur) var(--dc-ease);
}
.dc-bar-row.is-warn .dc-bar-fill { background: var(--dc-warn); }
.dc-bar-row.is-bad .dc-bar-fill { background: var(--dc-bad); }

/* ---------- 仪表盘 ---------- */
.dc-ring-card { margin-top: auto; }
.dc-ring-grid { display: flex; gap: var(--dc-gap-md); justify-content: space-around; }
.dc-env-grid { display: flex; gap: var(--dc-gap-sm); justify-content: space-around; }

/* ---------- 告警列表 ---------- */
.dc-alarm-panel { flex: 1; min-height: 0; }
.dc-alarm-list { overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 8px; padding-right: 4px; min-height: 0; }
.dc-alarm-list::-webkit-scrollbar { width: 6px; }
.dc-alarm-list::-webkit-scrollbar-thumb { background: var(--dc-accent-soft-2); border-radius: 3px; }
.dc-alarm-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  width: 100%;
  text-align: left;
  font-family: inherit;
  background: var(--dc-surface-item);
  border: 1px solid var(--dc-hairline);
  border-left-width: 3px;
  border-radius: var(--dc-r-md);
  padding: 8px 10px;
  cursor: pointer;
  transition: background var(--dc-dur) var(--dc-ease), border-color var(--dc-dur) var(--dc-ease),
              box-shadow var(--dc-dur) var(--dc-ease);
}
.dc-alarm-item:hover { background: var(--dc-surface-item-hover); }
.dc-alarm-item:active { background: var(--dc-surface-item-active); }
.dc-alarm-item.critical { border-left-color: var(--dc-bad); }
.dc-alarm-item.warning { border-left-color: var(--dc-warn); }
/* T17：3D 场景选中该机柜时，2D 告警项高亮（双向联动） */
.dc-alarm-item.selected {
  background: var(--dc-accent-soft);
  border-color: var(--dc-accent-line);
  box-shadow: 0 0 0 1px var(--dc-accent-line);
}
.dc-alarm-level {
  flex: none;
  font-size: var(--dc-fs-xs);
  padding: 2px 6px;
  border-radius: var(--dc-r-sm);
  white-space: nowrap;
  margin-top: 1px;
}
.dc-alarm-level.is-bad { background: var(--dc-bad-soft); color: var(--dc-bad); }
.dc-alarm-level.is-warn { background: var(--dc-warn-soft); color: var(--dc-warn); }
.dc-alarm-body { display: flex; flex-direction: column; min-width: 0; }
.dc-alarm-title { color: var(--dc-text-strong); font-size: var(--dc-fs-md); overflow-wrap: anywhere; }
.dc-alarm-time { color: var(--dc-text-dim); font-size: var(--dc-fs-xs); margin-top: 2px; font-variant-numeric: tabular-nums; }

/* ---------- 机柜传感器表 ---------- */
.dc-sensor-panel { flex: 1 1 0; min-height: 0; }
.dc-ingest-flag {
  display: flex; align-items: center; gap: 6px;
  font-size: var(--dc-fs-xs); color: var(--dc-text-dim);
  padding: 0 2px 6px;
}
.dc-head-right { display: inline-flex; align-items: center; gap: 2px; }
.dc-icon-btn { color: var(--dc-text-dim); padding: 4px; }
.dc-icon-btn:hover { color: var(--dc-accent); }
.dc-sensor-table { overflow: auto; flex: 1; min-height: 0; }
.dc-sensor-table::-webkit-scrollbar { width: 6px; height: 6px; }
.dc-sensor-table::-webkit-scrollbar-thumb { background: var(--dc-accent-soft-2); border-radius: 3px; }
.dc-sensor-table table { width: 100%; border-collapse: collapse; font-size: var(--dc-fs-sm); }
.dc-sensor-table th,
.dc-sensor-table td {
  padding: 6px;
  text-align: left;
  color: var(--dc-text);
  border-bottom: 1px solid var(--dc-hairline);
  white-space: nowrap; /* 机柜传感器标签：禁止自动换行，确保内容完整显示 */
}
.dc-sensor-table th {
  color: var(--dc-text-dim);
  font-weight: 500;
  position: sticky;
  top: 0;
  background: var(--dc-surface-strong);
  z-index: 1;
}
.dc-sensor-table tbody tr { cursor: pointer; transition: background var(--dc-dur) var(--dc-ease); }
.dc-sensor-table tbody tr:hover { background: var(--dc-surface-item-hover); }
.dc-sensor-table tbody tr:focus-visible { outline: 2px solid var(--dc-accent); outline-offset: -2px; }
.dc-sensor-table td.hot { color: var(--dc-warn); font-weight: 600; }
.dc-cell-status { display: inline-flex; align-items: center; gap: 5px; }
.dc-sensor-table tr.fault .dc-cell-status { color: var(--dc-bad); }
.dc-sensor-table tr.warning .dc-cell-status { color: var(--dc-warn); }
.dc-sensor-table tr.normal .dc-cell-status { color: var(--dc-ok); }

/* ---------- 按钮 ---------- */
.dc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 14px;
  border: 1px solid var(--dc-border-strong);
  border-radius: var(--dc-r-md);
  background: var(--dc-surface-item);
  color: var(--dc-text);
  font-family: inherit;
  font-size: var(--dc-fs-md);
  cursor: pointer;
  transition: background var(--dc-dur) var(--dc-ease), border-color var(--dc-dur) var(--dc-ease),
              color var(--dc-dur) var(--dc-ease);
}
.dc-btn:hover:not(:disabled) { background: var(--dc-surface-item-hover); border-color: var(--dc-accent-line); }
.dc-btn:active:not(:disabled) { background: var(--dc-surface-item-active); }
.dc-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.dc-btn-primary {
  background: var(--dc-accent-soft);
  border-color: var(--dc-accent-line);
  color: var(--dc-accent);
  font-weight: 500;
}
.dc-btn-primary:hover:not(:disabled) { background: var(--dc-accent-soft-2); color: var(--dc-text-strong); }

/* ---------- 加载 / 错误 / 空态 ---------- */
.dc-booting {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.dc-booting-card {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 24px;
  border-radius: var(--dc-r-md);
  background: var(--dc-surface-strong);
  border: 1px solid var(--dc-accent-line);
  color: var(--dc-text);
  font-size: var(--dc-fs-md);
  box-shadow: var(--dc-shadow-lg);
}
.dc-spinner {
  width: 14px; height: 14px; flex: none;
  border: 2px solid var(--dc-accent-soft-2);
  border-top-color: var(--dc-accent);
  border-radius: 50%;
  animation: dc-spin 0.8s linear infinite;
}
@keyframes dc-spin { to { transform: rotate(360deg); } }

.dc-fatal {
  position: absolute;
  inset: 0;
  z-index: 31;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dc-surface-soft);
  backdrop-filter: blur(2px);
}
.dc-fatal-card {
  max-width: 420px;
  padding: var(--dc-gap-lg);
  border-radius: var(--dc-r-lg);
  background: var(--dc-surface-strong);
  border: 1px solid var(--dc-bad-soft);
  box-shadow: var(--dc-shadow-lg);
  text-align: center;
}
.dc-fatal-card .dc-state-icon {
  width: 34px; height: 34px; margin: 0 auto 8px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: var(--dc-bad-soft);
  color: var(--dc-bad);
  font-weight: 700;
}
.dc-fatal-title { color: var(--dc-text-strong); font-size: var(--dc-fs-lg); font-weight: 600; }
.dc-fatal-msg { margin: 8px 0 0; color: var(--dc-text-dim); font-size: var(--dc-fs-sm); line-height: 1.6; }
.dc-fatal-actions { margin-top: var(--dc-gap-md); display: flex; justify-content: center; }

/* 骨架屏尺寸 */
.dc-kpi-skeleton { display: flex; flex-direction: column; gap: var(--dc-gap-sm); }
.dc-skeleton-line { width: 100%; height: 44px; }
.dc-skeleton-lg { height: 44px; }
.dc-skeleton-block { width: 100%; height: 58px; flex: none; }

/* 屏幕阅读器专用文本 */
.dc-sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* ===== 响应式：按可用宽度收缩信息列，保证 3D 舞台与关键指标始终可见 ===== */
@media (max-width: 1600px) {
  .dc-view { --dc-left-w: 236px; --dc-right-w: 258px; }
}
@media (max-width: 1360px) {
  .dc-view { --dc-left-w: 220px; --dc-right-w: 240px; }
  .dc-sensor-panel { display: none; } /* 窄屏优先保住告警与动环 */
}
@media (max-width: 1120px) {
  .dc-view { --dc-left-w: 200px; --dc-right-w: 224px; }
  .dc-ring-card { display: none; }
  .dc-search-input { width: 160px; }
  .dc-title { font-size: var(--dc-fs-lg); }
}
@media (max-width: 900px) {
  /* 极小宽度：只保留左列关键指标，右列让位给 3D 场景 */
  .dc-overlay { grid-template-columns: 0 var(--dc-left-w) 1fr 0; }
  .dc-right { display: none; }
}
@media (max-height: 820px) {
  .dc-left, .dc-right { gap: var(--dc-gap); padding: var(--dc-gap) 10px; }
  .dc-kpi-value { font-size: var(--dc-fs-2xl, 24px); }
  .dc-ring-card { display: none; }
}

/* 尊重减少动效偏好 */
@media (prefers-reduced-motion: reduce) {
  .dc-spinner { animation-duration: 2s; }
  .dc-dist-seg, .dc-bar-fill { transition: none; }
}
</style>
