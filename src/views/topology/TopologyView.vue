<template>
  <PageLayout title="网络拓扑" subtitle="设备/机柜数据自动同步 · 物理连接自动映射">
    <!-- 页面级主操作（统一标题卡右侧操作区） -->
    <template #actions>
      <el-button size="small" @click="handleRefresh">
        <el-icon><Refresh /></el-icon> 刷新同步
      </el-button>
      <el-button type="primary" size="small" @click="handleAutoLayout">
        <el-icon><Share /></el-icon> 自动布局
      </el-button>
    </template>

    <div class="topology-view">
      <!-- 画布工作区工具条（slim 40px，非页面标题卡） -->
      <TopologyToolbar
        :store="store"
        :is-fullscreen="isFullscreen"
        @auto-layout="handleAutoLayout"
        @zoom-fit="handleZoomFit"
        @zoom-in="handleZoomIn"
        @zoom-out="handleZoomOut"
        @toggle-fullscreen="toggleFullscreen"
        @export-png="handleScreenshot"
        @export-json="handleExport"
        @undo="handleUndo"
        @redo="handleRedo"
      />

      <div class="topology-body">
      <!-- 左侧设备库（图例/过滤面板） -->
      <TopologyLibrary
        :collapsed="libraryCollapsed"
        :nodes="sync.nodes.value"
        :edges="sync.edges.value"
        @toggle="libraryCollapsed = !libraryCollapsed"
      />

      <!-- 中间画布 -->
      <div class="topology-canvas-wrapper">
        <TopologyCanvas
          ref="canvasRef"
          :store="store"
          @node-click="handleNodeClick"
          @node-dblclick="handleNodeDblClick"
          @edge-click="handleEdgeClick"
          @canvas-click="handleCanvasClick"
          @connection-created="handleConnectionCreated"
        />

        <!-- 空状态引导覆盖层（节点为空时显示，引导用户添加设备或加载演示） -->
        <div v-if="sync.nodes.value.length === 0" class="topology-empty-overlay">
          <div class="empty-card">
            <div class="empty-icon">
              <svg viewBox="0 0 96 96" width="96" height="96" fill="none">
                <circle cx="48" cy="48" r="44" stroke="#22d3ee" stroke-width="2" stroke-dasharray="6 4" fill="rgba(34,211,238,0.04)"/>
                <circle cx="48" cy="48" r="14" stroke="#22d3ee" stroke-width="2" fill="rgba(34,211,238,0.1)"/>
                <circle cx="28" cy="28" r="6" stroke="#22d3ee" stroke-width="2" fill="#22d3ee" opacity="0.6"/>
                <circle cx="68" cy="28" r="6" stroke="#22d3ee" stroke-width="2" fill="#22d3ee" opacity="0.6"/>
                <circle cx="28" cy="68" r="6" stroke="#22d3ee" stroke-width="2" fill="#22d3ee" opacity="0.6"/>
                <circle cx="68" cy="68" r="6" stroke="#22d3ee" stroke-width="2" fill="#22d3ee" opacity="0.6"/>
                <line x1="28" y1="28" x2="48" y2="48" stroke="#22d3ee" stroke-width="1.5" opacity="0.5"/>
                <line x1="68" y1="28" x2="48" y2="48" stroke="#22d3ee" stroke-width="1.5" opacity="0.5"/>
                <line x1="28" y1="68" x2="48" y2="48" stroke="#22d3ee" stroke-width="1.5" opacity="0.5"/>
                <line x1="68" y1="68" x2="48" y2="48" stroke="#22d3ee" stroke-width="1.5" opacity="0.5"/>
              </svg>
            </div>
            <h2 class="empty-title">还没有任何设备</h2>
            <p class="empty-desc">
              拓扑节点由 <strong>设备管理</strong> 自动同步；在 <strong>机柜管理</strong> 中连接物理链路线后，连接会同步映射到拓扑连线。
            </p>
            <div class="empty-actions">
              <el-button type="primary" size="large" @click="loadDemoData" :loading="demoLoading">
                <el-icon><MagicStick /></el-icon> 加载演示数据
              </el-button>
              <el-button size="large" @click="goAddDevices">
                <el-icon><Plus /></el-icon> 去设备管理添加设备
              </el-button>
            </div>
            <div class="empty-tips">
              <el-icon><InfoFilled /></el-icon>
              <span>演示数据：1 台核心交换机 + 1 台接入交换机 + 1 台服务器，含 2 条链路。点「加载演示数据」即可预览完整拓扑交互。</span>
            </div>
          </div>
        </div>

        <!-- 演示数据已加载时的提示条（带清空入口） -->
        <div v-if="hasDemoData" class="demo-banner">
          <span><el-icon><InfoFilled /></el-icon> 当前显示演示数据（3 台设备 / 2 条连接）</span>
          <el-button text size="small" type="danger" @click="clearDemoData">清空演示</el-button>
        </div>
      </div>

      <!-- 右侧属性面板 -->
      <TopologyPropertyPanel
        :store="store"
        :selected-node="selectedNode"
        :selected-edge="selectedEdge"
        @update-node="handleUpdateNode"
        @update-edge="handleUpdateEdge"
        @delete-node="handleDeleteNode"
        @delete-edge="handleDeleteEdge"
        @close="handlePanelClose"
        @open-ssh="handleOpenSsh"
      />
      </div>
    </div>

    <!-- SSH 终端对话框（点击拓扑节点 → SSH 命令配置） -->
    <el-dialog
      v-model="sshVisible"
      :title="`SSH终端 - ${sshDevice?.name} (${sshDevice?.ip})`"
      width="800px"
      class="ssh-dialog"
      :close-on-click-modal="false"
      @close="onSshDialogClose"
    >
      <div class="ssh-terminal">
        <div class="terminal-toolbar">
          <span class="terminal-info">{{ sshDevice?.sshUser || 'admin' }}@{{ sshDevice?.ip }}:{{ sshDevice?.sshPort || 22 }}</span>
          <div class="terminal-actions">
            <el-button size="small" type="primary" plain @click="cmdLibVisible = true">
              <el-icon><Reading /></el-icon>&nbsp;命令大全
            </el-button>
            <el-button size="small" @click="clearTerminal">清空</el-button>
          </div>
        </div>
        <div class="terminal-body" ref="terminalBody">
          <div v-for="(line, i) in terminalLines" :key="i" class="terminal-line" :class="line.type">
            <span v-if="line.type === 'input'" class="terminal-prompt">{{ sshPrompt }}# </span>
            <span class="terminal-text" v-html="escapeTerminalText(line.text)"></span>
          </div>
          <!-- 命令联想下拉（输入时实时提示 + 中文解释） -->
          <div v-if="sshSuggestions.length" class="suggest-box">
            <div
              v-for="(s, i) in sshSuggestions"
              :key="i"
              class="suggest-item"
              @mousedown.prevent="applySuggestion(s)"
            >
              <span class="s-cmd">{{ s.cmd }}</span>
              <span class="s-desc">{{ s.desc }}</span>
              <span v-if="s.usage" class="s-usage">{{ s.usage }}</span>
            </div>
            <div class="suggest-hint">Tab 补全 · 点击填入 · 支持简写（如 sys = system-view）</div>
          </div>
          <div class="terminal-input-line">
            <span class="terminal-prompt">{{ sshPrompt }}# </span>
            <input
              ref="termInputRef"
              v-model="currentCommand"
              class="terminal-input"
              @input="onTerminalInput"
              @keydown.enter="sendCommand"
              @keydown.tab.prevent="onTabKey"
              @keydown.escape="sshSuggestions = []"
              @keydown.up.prevent="historyUp"
              @keydown.down.prevent="historyDown"
              @keydown.ctrl.c.prevent="cancelCommand"
              placeholder="输入命令...（Tab 补全，输入时显示联想）"
            />
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="disconnectSSH">断开连接</el-button>
      </template>
    </el-dialog>

    <!-- 命令大全弹窗（华为/H3C/思科/锐捷，含中文解释与配置模板） -->
    <SshCommandLibrary
      v-model="cmdLibVisible"
      :vendor="sshDevice?.vendor || sshDevice?.model || ''"
      @insert="onCmdLibInsert"
    />
  </PageLayout>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import PageLayout from '../../components/PageLayout.vue'
import TopologyCanvas from '@/components/canvas-topology/TopologyCanvas.vue'
import TopologyToolbar from '@/components/canvas-topology/TopologyToolbar.vue'
import TopologyLibrary from '@/components/canvas-topology/TopologyLibrary.vue'
import TopologyPropertyPanel from '@/components/canvas-topology/TopologyPropertyPanel.vue'
import { useTopologyLayoutStore } from '@/stores/topologyLayout'
import { useTopologySync } from '@/composables/topology/useTopologySync'
import { createDerivedTopologyStore } from '@/composables/topology/derivedTopologyStore'
import { migrateCanvasLayout } from '@/composables/topology/migrateCanvasLayout'
import { applyForceLayout } from '@/utils/forceLayout'
import { useDeviceStore } from '@/stores'
import { usePortStateStore } from '@/stores/portState'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Refresh, Share, Plus, MagicStick, InfoFilled, Reading } from '@element-plus/icons-vue'
import { decryptSecret } from '@/utils/credentialCrypto'
import { addLog, LogType, LogResult } from '@/composables/useOperationLog'
import { matchSuggestions, tabComplete, getSuggestionsByVendor, getAllSuggestions } from '@/data/cliCommandLibrary'
import SshCommandLibrary from '@/components/SshCommandLibrary.vue'

const layoutStore = useTopologyLayoutStore()
const deviceStore = useDeviceStore()
const portStateStore = usePortStateStore()
const router = useRouter()

const canvasRef = ref(null)
const libraryCollapsed = ref(false)
const selectedNode = ref(null)
const selectedEdge = ref(null)
const demoLoading = ref(false)
const isFullscreen = ref(false)
// 演示数据 marker：由 deviceStore 中 isDemo 设备派生（跨路由不丢失，避免组件重建后清空入口消失）
const demoDevices = computed(() => deviceStore.devices.filter(d => d.isDemo))
const hasDemoData = computed(() => demoDevices.value.length > 0)

// 演示数据定义：3 台设备 + 2 条连接（设备名后缀 version 避免与已有设备冲突）
const DEMO_DEVICES = [
  {
    _name: 'SW-Core 核心交换机',
    _ip: '192.168.10.1',
    _type: 'switch',
    _vendor: '华为',
    _model: 'S5720-28TP',
    _uSize: 1,
    _ports: 24,
  },
  {
    _name: 'SW-Access 接入交换机',
    _ip: '192.168.10.10',
    _type: 'switch',
    _vendor: '华三',
    _model: 'S5120-28P',
    _uSize: 1,
    _ports: 24,
  },
  {
    _name: 'Server-1 应用服务器',
    _ip: '192.168.10.100',
    _type: 'server',
    _vendor: 'Dell',
    _model: 'PowerEdge R750',
    _uSize: 2,
    _ports: 4,
  },
]
const DEMO_EDGES = [
  { from: 'SW-Core 核心交换机', to: 'SW-Access 接入交换机', fromPort: 'eth1', toPort: 'eth1', type: '六类网线' },
  { from: 'SW-Access 接入交换机', to: 'Server-1 应用服务器', fromPort: 'eth2', toPort: 'eth1', type: '六类网线' },
]

// 派生同步 + facade（节点=设备，边=物理连接）
const sync = useTopologySync({})
const store = createDerivedTopologyStore({ sync })

// ============ SSH 终端（拓扑节点 → SSH 命令配置） ============
const sshVisible = ref(false)
const sshDevice = ref(null)
const isSshConnected = ref(false)
const terminalBody = ref(null)
const termInputRef = ref(null)
const terminalLines = ref([])
const currentCommand = ref('')
const sshPrompt = ref('netops')
const commandHistory = ref([])
const historyIndex = ref(-1)

// ---- 命令联想（输入时实时提示，移植自网络设备模拟器 cmdMatch 引擎）----
const sshSuggestions = ref([])   // 联想候选列表
const cmdLibVisible = ref(false)  // 命令大全弹窗
const sshVendor = ref('')         // 当前设备厂商（决定用哪家命令库）

// 获取当前设备的联想命令表（厂商匹配失败时用全库兜底）
function currentSuggestEntries() {
  return getSuggestionsByVendor(sshVendor.value) || getAllSuggestions()
}

// 输入变化 → 实时联想（输入一个词联想下一词）
function onTerminalInput() {
  const val = String(currentCommand.value || '')
  if (!val.trim()) {
    sshSuggestions.value = []
    return
  }
  sshSuggestions.value = matchSuggestions(val, currentSuggestEntries())
}

// Tab 键补全（唯一候选时自动补全命令）
function onTabKey(e) {
  const completed = tabComplete(String(currentCommand.value || ''), currentSuggestEntries())
  if (completed) {
    currentCommand.value = completed
    sshSuggestions.value = matchSuggestions(completed, currentSuggestEntries())
    e.preventDefault()
  }
}

// 点击候选项 → 填入命令骨架（<参数> 转为光标占位）
function applySuggestion(s) {
  const solid = String(s.cmd).replace(/\s*<[^>]*>.*$/, '')
  // 若用户已输入了参数区内容（超出实词部分），保留参数
  const cmdToks = String(s.cmd).split(/\s+/)
  const inputToks = String(currentCommand.value || '').trim().split(/\s+/).filter(Boolean)
  const solidLen = cmdToks.filter(t => !t.startsWith('<')).length
  if (inputToks.length > solidLen) {
    currentCommand.value = cmdToks.slice(0, solidLen).join(' ') + ' ' + inputToks.slice(solidLen).join(' ')
  } else {
    currentCommand.value = solid + ' '
  }
  sshSuggestions.value = []
  nextTick(() => termInputRef.value?.focus())
}

// 命令大全「填入」回调 → 填入终端输入框并聚焦
function onCmdLibInsert(text) {
  currentCommand.value = String(text || '')
  sshSuggestions.value = []
  cmdLibVisible.value = false
  nextTick(() => termInputRef.value?.focus())
}

// 转义HTML特殊字符（终端输出安全显示）
const escapeTerminalText = (text) => {
  if (!text) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>')
    .replace(/\t/g, '&#9;')
}

function scrollTerminal() {
  nextTick(() => {
    if (terminalBody.value) {
      terminalBody.value.scrollTop = terminalBody.value.scrollHeight
    }
  })
}

function clearTerminal() {
  terminalLines.value = []
}

// 点击拓扑节点的「SSH 命令配置」按钮：从 deviceStore 取完整设备（含 SSH 凭据），自动连接
async function handleOpenSsh(node) {
  // 拓扑节点只含 id/ip/vendor/model 等基础字段，需从 deviceStore 取完整设备对象（含 sshUser/sshPass/sshPort）
  const device = deviceStore.devices.find(d => String(d.id) === String(node.deviceId || node.id))
  if (!device) {
    ElMessage.warning('未找到对应设备记录')
    return
  }
  if (!device.ip) {
    ElMessage.warning('该设备未设置 IP 地址，无法 SSH 连接')
    return
  }
  if (typeof window === 'undefined' || !window.electronAPI?.sshConnect) {
    ElMessage.warning('SSH 终端仅在桌面客户端中可用')
    return
  }

  sshDevice.value = device
  sshPrompt.value = `${device.sshUser || 'admin'}@${device.ip}`
  sshVendor.value = device.vendor || device.model || ''
  terminalLines.value = [
    { type: 'system', text: `Connecting to ${device.ip}:${device.sshPort || 22} via SSH...` },
    { type: 'system', text: '（输入命令时自动联想 · Tab 键补全 · 点右上角「命令大全」查看全部命令与中文解释）' },
  ]
  currentCommand.value = ''
  commandHistory.value = []
  historyIndex.value = -1
  await nextTick()
  sshVisible.value = true
  await nextTick()
  scrollTerminal()
  termInputRef.value?.focus()

  // 自动 SSH 连接
  try {
    const decryptedPass = await decryptSecret(device.sshPass)
    const result = await window.electronAPI.sshConnect({
      connectionId: device.id,
      device: {
        ip: device.ip,
        sshPort: device.sshPort,
        sshUser: device.sshUser,
        sshPass: decryptedPass,
        sshTimeout: device.sshTimeout
      }
    })

    if (result && result.success) {
      isSshConnected.value = true
      terminalLines.value.push({ type: 'system', text: `Connected to ${device.ip}:${device.sshPort || 22}` })
      terminalLines.value.push({ type: 'output', text: '' })
      addLog({ type: LogType.SSH_CONNECT, detail: `拓扑SSH连接：${device.name} (${device.ip})`, result: LogResult.SUCCESS, device: device.name })
      try {
        const info = await window.electronAPI.sshExec({ connectionId: device.id, command: 'hostname' })
        if (info && info.success && info.output) sshPrompt.value = info.output.trim() + '#'
      } catch (e) { /* hostname 失败不影响使用 */ }
      scrollTerminal()
    } else {
      isSshConnected.value = false
      const errMsg = result && result.error ? result.error : '连接失败（未知错误）'
      terminalLines.value.push({ type: 'error', text: `Connection failed: ${errMsg}` })
      terminalLines.value.push({ type: 'output', text: '' })
      addLog({ type: LogType.SSH_CONNECT, detail: `拓扑SSH连接失败：${device.name} (${device.ip})`, result: LogResult.FAILED, device: device.name })
    }
  } catch (e) {
    isSshConnected.value = false
    terminalLines.value.push({ type: 'error', text: `Connection failed: ${e.message || 'SSH连接异常'}` })
    terminalLines.value.push({ type: 'output', text: '' })
    addLog({ type: LogType.SSH_CONNECT, detail: `拓扑SSH连接失败：${device.name} (${device.ip})`, result: LogResult.FAILED, device: device.name })
  }
}

async function sendCommand() {
  const cmd = currentCommand.value.trim()
  if (!cmd) return

  terminalLines.value.push({ type: 'input', text: cmd })
  commandHistory.value.unshift(cmd)
  historyIndex.value = -1

  if (cmd.toLowerCase() === 'quit' || cmd.toLowerCase() === 'exit') {
    await disconnectSSH()
    return
  }

  sshSuggestions.value = []  // 发送后清空联想

  if (isSshConnected.value && window.electronAPI?.sshExec) {
    try {
      const result = await window.electronAPI.sshExec({
        connectionId: sshDevice.value.id,
        command: cmd
      })
      if (result?.success) {
        (result.output || '').split('\n').forEach(line => {
          terminalLines.value.push({ type: 'output', text: line })
        })
      } else {
        terminalLines.value.push({ type: 'error', text: `Error: ${result?.error || '命令执行失败'}` })
      }
    } catch (e) {
      // 执行异常必须回显到终端，不能静默吞掉
      terminalLines.value.push({ type: 'error', text: `Error: ${e?.message || '命令执行异常'}` })
    }
  } else {
    terminalLines.value.push({ type: 'error', text: 'Error: SSH not connected' })
  }

  currentCommand.value = ''
  setTimeout(() => { scrollTerminal(); termInputRef.value?.focus() }, 50)
}

async function disconnectSSH() {
  if (isSshConnected.value && window.electronAPI?.sshDisconnect) {
    await window.electronAPI.sshDisconnect({ connectionId: sshDevice.value.id })
  }
  isSshConnected.value = false
  sshVisible.value = false
  terminalLines.value = []
}

// 弹窗通过 X / 遮罩关闭时也清理连接
function onSshDialogClose() {
  if (isSshConnected.value && window.electronAPI?.sshDisconnect && sshDevice.value) {
    window.electronAPI.sshDisconnect({ connectionId: sshDevice.value.id }).catch(() => {})
  }
  isSshConnected.value = false
  terminalLines.value = []
}

function cancelCommand() {
  currentCommand.value = ''
}

function historyUp() {
  if (historyIndex.value < commandHistory.value.length - 1) {
    historyIndex.value++
    setTimeout(() => {
      const input = termInputRef.value
      if (input) {
        const pos = input.selectionStart
        currentCommand.value = commandHistory.value[historyIndex.value]
        nextTick(() => { input.setSelectionRange(pos, pos); input.focus() })
      } else {
        currentCommand.value = commandHistory.value[historyIndex.value]
      }
    }, 0)
  }
}

function historyDown() {
  if (historyIndex.value > 0) {
    historyIndex.value--
    setTimeout(() => {
      const input = termInputRef.value
      if (input) {
        const pos = input.selectionStart
        currentCommand.value = commandHistory.value[historyIndex.value]
        nextTick(() => { input.setSelectionRange(pos, pos); input.focus() })
      } else {
        currentCommand.value = commandHistory.value[historyIndex.value]
      }
    }, 0)
  } else if (historyIndex.value === 0) {
    historyIndex.value = -1
    setTimeout(() => {
      const input = termInputRef.value
      if (input) {
        const pos = input.selectionStart
        currentCommand.value = ''
        nextTick(() => { input.setSelectionRange(pos, pos); input.focus() })
      } else {
        currentCommand.value = ''
      }
    }, 0)
  }
}

onMounted(async () => {
  await layoutStore.load()
  // 旧画布数据迁移（首次进入自动执行，幂等）
  try {
    const mig = await migrateCanvasLayout()
    if (mig.migrated) {
      console.log('[Topology] 旧画布坐标迁移完成，导入', mig.imported, '个节点')
    }
  } catch (e) {
    console.warn('[Topology] 迁移失败:', e)
  }
  sync.init()
  window.addEventListener('keydown', handleKeydown)
  document.addEventListener('fullscreenchange', handleFullscreenChange)

  // 进入拓扑页：若节点坐标严重分散（历史遗留），自动紧凑布局；并适配视图让全部设备清晰可见
  nextTick(() => {
    if (!sync.nodes.value.length) return
    const xs = sync.nodes.value.map(n => n.x || 0)
    const ys = sync.nodes.value.map(n => n.y || 0)
    const spread = (Math.max(...xs) - Math.min(...xs)) + (Math.max(...ys) - Math.min(...ys))
    if (spread > 3000) autoArrangeNodes()
    canvasRef.value?.zoomToFit()
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
})

// 快捷键（派生式：Delete 删除设备/断线，Escape 取消，Ctrl+A 全选，Ctrl+Z/Ctrl+Y 撤销重做）
function handleKeydown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
  if (e.ctrlKey || e.metaKey) {
    const k = e.key.toLowerCase()
    if (k === 'a') {
      e.preventDefault()
      store.selectAll()
    } else if (k === 'z') {
      e.preventDefault()
      handleUndo()
    } else if (k === 'y') {
      e.preventDefault()
      handleRedo()
    }
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    // 批量删除：遍历所有选中的节点与边，一次确认后统一处理
    handleBatchDelete()
  } else if (e.key === 'Escape') {
    store.clearSelection()
    selectedNode.value = null
    selectedEdge.value = null
  }
}

// 批量删除选中项（Delete/Backspace 快捷键）：遍历全部 selectedNodeIds 与 selectedEdgeIds
function handleBatchDelete() {
  const nodeIds = [...store.selectedNodeIds]
  const edgeIds = [...store.selectedEdgeIds]
  if (nodeIds.length === 0 && edgeIds.length === 0) return

  const nodeNames = nodeIds
    .map(id => store.getNodeById(id)?.label || id)
    .join('、')
  const parts = []
  if (nodeIds.length > 0) parts.push(`${nodeIds.length} 台设备${nodeNames ? `（${nodeNames}）` : ''}`)
  if (edgeIds.length > 0) parts.push(`${edgeIds.length} 条连接`)

  ElMessageBox.confirm(
    `确定要删除选中的 ${parts.join('和')}吗？\n设备将从设备管理中删除，相关连线与机柜上架记录也会清理；连接将被断开。删除后可按 Ctrl+Z 撤销。`,
    '批量删除',
    {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    }
  ).then(() => {
    // 删除前记录被删对象（供撤销恢复）
    const deletedDevices = nodeIds
      .map(id => deviceStore.devices.find(d => d.id === id))
      .filter(Boolean)
      .map(d => JSON.parse(JSON.stringify(d)))
    const deletedConnections = edgeIds
      .map(id => portStateStore.connections.find(c => c.id === id))
      .filter(Boolean)
      .map(c => JSON.parse(JSON.stringify(c)))
    // 节点删除连带清理的连接也要记录
    nodeIds.forEach(nodeId => {
      portStateStore.connections
        .filter(c => c.portA?.deviceId === nodeId || c.portB?.deviceId === nodeId)
        .forEach(c => {
          if (!deletedConnections.find(x => x.id === c.id)) deletedConnections.push(JSON.parse(JSON.stringify(c)))
        })
    })
    layoutStore.snapshot(deletedDevices.length || deletedConnections.length ? { deletedDevices, deletedConnections } : null)
    // 先断开所有选中的边，再删除所有选中的节点（节点删除会连带清理其端口连线）
    edgeIds.forEach(edgeId => {
      const edge = store.getEdgeById(edgeId)
      if (edge) {
        const result = portStateStore.disconnectPorts(edgeId)
        if (!result.success) {
          console.warn('[Topology] 断开连接失败:', edgeId, result?.message || '')
        }
      }
    })
    nodeIds.forEach(nodeId => {
      const node = store.getNodeById(nodeId)
      if (!node) return
      deviceStore.deleteDevice(nodeId)
      portStateStore.cleanupDevice(nodeId)
    })
    selectedNode.value = null
    selectedEdge.value = null
    store.clearSelection()
    ElMessage.success(`已删除 ${nodeIds.length} 台设备、断开 ${edgeIds.length} 条连接`)
  }).catch(() => {})
}

// 事件处理：撤销/重做（布局快照栈 + 删除对象恢复）
function handleUndo() {
  const extra = layoutStore.undo()
  if (extra === undefined) { ElMessage.info('无可撤销操作'); return }
  // 恢复被删除的设备与连接
  if (extra?.deletedDevices) {
    extra.deletedDevices.forEach(d => {
      if (!deviceStore.devices.find(x => x.id === d.id)) deviceStore.addDevice(d)
    })
  }
  if (extra?.deletedConnections) {
    extra.deletedConnections.forEach(c => {
      if (!portStateStore.connections.find(x => x.id === c.id)) {
        portStateStore.addConnectionRaw(JSON.parse(JSON.stringify(c)))
      }
    })
  }
  sync.syncAll()
  canvasRef.value?.refresh()
  ElMessage.success('已撤销')
}
function handleRedo() {
  const extra = layoutStore.redo()
  if (extra === undefined) { ElMessage.info('无可重做操作'); return }
  // 重放删除（redo 逆操作）
  const rd = extra?.redelete
  if (rd?.deletedConnections) rd.deletedConnections.forEach(c => { try { portStateStore.disconnectPorts(c.id) } catch (e) {} })
  if (rd?.deletedDevices) rd.deletedDevices.forEach(d => { try { deviceStore.deleteDevice(d.id) } catch (e) {} })
  sync.syncAll()
  canvasRef.value?.refresh()
  ElMessage.success('已重做')
}

function handleZoomFit() {
  canvasRef.value?.zoomToFit()
}

function handleZoomIn() {
  canvasRef.value?.zoomIn()
}

function handleZoomOut() {
  canvasRef.value?.zoomOut()
}

// 全屏切换
function toggleFullscreen() {
  const el = document.querySelector('.topology-view')
  if (!el) return
  if (!document.fullscreenElement) {
    el.requestFullscreen?.().catch((e) => ElMessage.error('全屏失败：' + e.message))
  } else {
    document.exitFullscreen?.()
  }
}

function handleFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
}

// 跳转设备管理（添加设备）
function goAddDevices() {
  router.push('/devices')
}

// 加载演示数据：3 台虚拟设备 + 2 条物理连接 → 拓扑立刻可见
async function loadDemoData() {
  if (demoLoading.value) return
  if (hasDemoData.value) {
    ElMessage.info('演示数据已加载，无需重复操作')
    return
  }
  demoLoading.value = true
  try {
    const nameToId = {}
    // 1. 添加设备（id 用 Date.now+index 避免同毫秒冲突；isDemo 标记用于跨路由识别演示数据）
    for (let i = 0; i < DEMO_DEVICES.length; i++) {
      const d = DEMO_DEVICES[i]
      const newDevice = deviceStore.addDevice({
        id: `demo_dev_${Date.now()}_${i}`,
        name: d._name,
        ip: d._ip,
        type: d._type,
        vendor: d._vendor,
        model: d._model,
        location: '演示数据',
        uSize: d._uSize,
        loginType: 'web',
        sshPort: 22,
        sshUser: '',
        sshPass: '',
        status: 'online',
        remark: '拓扑演示数据',
        ethernetPorts: d._ports,
        isDemo: true,
      })
      nameToId[d._name] = newDevice.id
    }
    // 2. 建立物理连接
    //    connectPorts 是【同步函数】，失败返回 {success:false} 而非抛异常，必须显式检查；
    //    端口消费 DEMO_EDGES 已定义的 fromPort/toPort，避免两条边都写死 eth1 导致第二条因端口复用静默失败。
    let connectedCount = 0
    for (const e of DEMO_EDGES) {
      const fromId = nameToId[e.from]
      const toId = nameToId[e.to]
      if (!fromId || !toId) {
        console.warn('[Topology Demo] 跳过连线：找不到设备', e.from, '→', e.to)
        continue
      }
      const portA = {
        deviceId: fromId,
        portId: e.fromPort || 'eth1',
        deviceName: e.from,
        portNum: e.fromPort || 'eth1',
        portType: 'ethernet',
      }
      const portB = {
        deviceId: toId,
        portId: e.toPort || 'eth1',
        deviceName: e.to,
        portNum: e.toPort || 'eth1',
        portType: 'ethernet',
      }
      const res = portStateStore.connectPorts(portA, portB, e.type)
      if (res && res.success) {
        connectedCount++
      } else {
        console.warn('[Topology Demo] 连线失败：', e.from, portA.portId, '→', e.to, portB.portId, res?.message || '')
      }
    }
    // 3. 同步派生 + 刷新画布（hasDemoData 由 isDemo 派生，无需手动置位）
    sync.syncAll()
    canvasRef.value?.refresh()
    ElMessage.success(`演示数据已加载：${DEMO_DEVICES.length} 台设备 + ${connectedCount} 条连接`)
  } catch (e) {
    console.error('[Topology Demo] 加载失败', e)
    ElMessage.error('演示数据加载失败：' + e.message)
  } finally {
    demoLoading.value = false
  }
}

// 清空演示数据（仅删除 demo marker 标记的设备）
function clearDemoData() {
  const ids = demoDevices.value.map(d => d.id)
  if (ids.length === 0) {
    return
  }
  ElMessageBox.confirm(`确定清空演示数据（${ids.length} 台设备）？该操作不可撤销。`, '清空演示', {
    type: 'warning',
    confirmButtonText: '清空',
    cancelButtonText: '取消',
  }).then(async () => {
    for (const id of ids) {
      try {
        await deviceStore.deleteDevice(id)
        // 清理端口连线，避免删除设备后残留悬空连接
        portStateStore.cleanupDevice(id)
      } catch (e) {
        console.warn('[Topology Demo] 删除设备失败', id, e)
      }
    }
    // hasDemoData 由 isDemo 派生，删除设备后自动归零
    sync.syncAll()
    canvasRef.value?.refresh()
    ElMessage.success('演示数据已清空')
  }).catch(() => {})
}

function handleRefresh() {
  sync.syncAll()
  canvasRef.value?.refresh()
  ElMessage.success('已与设备/机柜数据同步')
}

// 静默紧凑布局：让节点分布合理（进入拓扑页自动调用）
function autoArrangeNodes() {
  const nodes = sync.nodes.value
  const edges = sync.edges.value
  if (nodes.length === 0) return
  const result = applyForceLayout(nodes, edges, {
    width: 900,
    height: 600,
    nodeSpacing: 260,
    edgeLength: 320,
    iterations: 200
  })
  if (Array.isArray(result)) {
    const posMap = {}
    for (const item of result) posMap[item.id] = item
    for (const n of nodes) {
      const p = posMap[n.id]
      if (p) {
        layoutStore.setPosition(n.id, p.x, p.y, n.fixed)
      }
    }
    layoutStore.save()
    sync.syncAll()
    canvasRef.value?.refresh()
  }
}

function handleAutoLayout() {
  const nodes = sync.nodes.value
  const edges = sync.edges.value
  if (nodes.length === 0) {
    ElMessage.info('暂无设备可布局')
    return
  }
  // 自动布局前记录快照（可撤销）
  layoutStore.snapshot()
  // 对所有非 fixed 节点跑力导向布局，结果写回 layout store
  const result = applyForceLayout(nodes, edges, {
    width: 3000,
    height: 2000,
    nodeSpacing: 160,
    edgeLength: 220,
    iterations: 200
  })
  // result 为 [{ id, x, y }, ...]
  if (Array.isArray(result)) {
    const posMap = {}
    for (const item of result) posMap[item.id] = item
    for (const n of nodes) {
      const p = posMap[n.id]
      if (p && !n.fixed) {
        layoutStore.setPosition(n.id, p.x, p.y, false)
      }
    }
    layoutStore.save()
    sync.syncAll()
    canvasRef.value?.refresh()
    ElMessage.success('自动布局完成')
  }
}

function handleExport() {
  const data = {
    exportedAt: new Date().toISOString(),
    nodes: sync.nodes.value.map((n) => ({ id: n.id, name: n.label, type: n.deviceType, x: n.x, y: n.y, status: n.status, ip: n.ip })),
    edges: sync.edges.value.map((e) => ({ id: e.id, source: e.source, target: e.target, cableType: e.cableType, linkType: e.linkType }))
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `topology-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('导出成功')
}

function handleScreenshot() {
  canvasRef.value?.exportPNG()
}

function handleClear() {
  ElMessageBox.confirm('确定要重置拓扑布局吗？节点与连线数据不会删除（它们由设备/机柜管理驱动）。', '提示', {
    type: 'warning'
  }).then(() => {
    layoutStore.clear()
    sync.syncAll()
    canvasRef.value?.refresh()
    ElMessage.success('布局已重置')
  }).catch(() => {})
}

function handleAddDevice() {
  // 设备自动同步，无需手动添加
  ElMessage.info('设备已自动同步到拓扑图，请在「设备管理」中添加设备')
}

function handleNodeClick(node) {
  selectedNode.value = node
  selectedEdge.value = null
  store.selectNode(node.id)
}

function handleNodeDblClick(node) {
  selectedNode.value = node
  selectedEdge.value = null
}

function handleEdgeClick(edge) {
  selectedEdge.value = edge
  selectedNode.value = null
  store.selectEdge(edge.id)
}

function handleCanvasClick() {
  selectedNode.value = null
  selectedEdge.value = null
  store.clearSelection()
}

function handleConnectionCreated(connection) {
  // 画布拖拽连线 → portStateStore.connectPorts（InteractionManager 已转发）
  ElMessage.success(`已创建连接: ${connection?.fromDeviceName || '设备A'} → ${connection?.toDeviceName || '设备B'}`)
}

function handleUpdateNode(updates) {
  // 节点只读：编辑请到设备管理
  ElMessage.info('节点信息请在「设备管理」中编辑')
}

function handleUpdateEdge(updates) {
  // 边视觉覆盖（路由/标签）写入 layout store
  if (selectedEdge.value) {
    // 边视觉覆盖前记录快照（可撤销）
    layoutStore.snapshot()
    layoutStore.setEdgeOverride(selectedEdge.value.id, updates)
    layoutStore.save()
    sync.syncEdges()
    canvasRef.value?.refresh()
  }
}

function handleDeleteNode(nodeId) {
  const node = store.getNodeById(nodeId)
  if (!node) return
  ElMessageBox.confirm(`确定要删除设备「${node.label}」吗？该设备将从设备管理中删除，相关连线与机柜上架记录也会清理。删除后可按 Ctrl+Z 撤销。`, '删除设备', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消'
  }).then(() => {
    // 删除前记录被删对象（供撤销恢复）
    const deletedDevices = deviceStore.devices.filter(d => d.id === nodeId)
      .map(d => JSON.parse(JSON.stringify(d)))
    const deletedConnections = portStateStore.connections
      .filter(c => c.portA?.deviceId === nodeId || c.portB?.deviceId === nodeId)
      .map(c => JSON.parse(JSON.stringify(c)))
    layoutStore.snapshot({ deletedDevices, deletedConnections })
    deviceStore.deleteDevice(nodeId)
    // 同步清理该设备的端口连线状态，避免拓扑遗留悬空连接
    portStateStore.cleanupDevice(nodeId)
    selectedNode.value = null
    store.clearSelection()
    ElMessage.success('设备已删除')
  }).catch(() => {})
}

function handleDeleteEdge(edgeId) {
  const edge = store.getEdgeById(edgeId)
  if (!edge) return
  ElMessageBox.confirm('确定要断开这条连接吗？断开后可按 Ctrl+Z 撤销。', '断开连接', {
    type: 'warning',
    confirmButtonText: '断开',
    cancelButtonText: '取消'
  }).then(() => {
    // 断开前记录连接对象（供撤销恢复）
    const conn = portStateStore.connections.find(c => c.id === edgeId)
    if (conn) layoutStore.snapshot({ deletedDevices: [], deletedConnections: [JSON.parse(JSON.stringify(conn))] })
    const result = portStateStore.disconnectPorts(edgeId)
    if (result.success) {
      selectedEdge.value = null
      store.clearSelection()
      ElMessage.success('连接已断开')
    } else {
      ElMessage.error(result.message || '断开失败')
    }
  }).catch(() => {})
}

function handlePanelClose() {
  selectedNode.value = null
  selectedEdge.value = null
  store.clearSelection()
}
</script>

<style scoped>
.topology-view {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-primary);
}

.topology-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.topology-canvas-wrapper {
  flex: 1;
  position: relative;
  overflow: hidden;
}

/* 空状态引导覆盖层 */
.topology-empty-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--bg-primary) 60%, transparent);
  backdrop-filter: blur(4px);
  z-index: 5;
  pointer-events: auto;
}

.empty-card {
  max-width: 480px;
  padding: 40px 36px 32px;
  background: var(--bg-glass, #1a1d2e);
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  text-align: center;
}

.empty-icon {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
  opacity: 0.9;
}

.empty-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary, #e4e4e7);
  margin: 0 0 12px;
}

.empty-desc {
  font-size: 13px;
  line-height: 1.7;
  color: #a0a0a8;
  margin: 0 0 24px;
}

.empty-desc strong {
  color: #22d3ee;
  font-weight: 600;
}

.empty-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.empty-actions .el-button {
  width: 100%;
  justify-content: center;
}

.empty-tips {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 10px 12px;
  background: rgba(34, 211, 238, 0.06);
  border: 1px solid rgba(34, 211, 238, 0.15);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: #a0a0a8;
  text-align: left;
}

.empty-tips .el-icon {
  color: #22d3ee;
  flex-shrink: 0;
  margin-top: 2px;
}

/* 演示数据提示条 */
.demo-banner {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px 6px 16px;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 20px;
  font-size: 12px;
  color: #fbbf24;
  z-index: 6;
  backdrop-filter: blur(4px);
}

.demo-banner .el-icon {
  margin-right: 4px;
  vertical-align: -2px;
}

/* ============ SSH 终端 ============ */
:deep(.ssh-dialog .el-dialog__body) { padding: 0 !important; }

.ssh-terminal {
  display: flex;
  flex-direction: column;
  height: 460px;
  background: #0d1117;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
}

.terminal-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
}

.terminal-info { font-size: 11px; color: var(--text-muted); }

.terminal-body {
  flex: 1;
  padding: 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.terminal-line {
  font-size: 12px;
  line-height: 1.6;
}
.terminal-line.system { color: #484f58; }
.terminal-line.output { color: #c9d1d9; }
.terminal-line.input { color: #e6edf3; display: flex; align-items: center; gap: 4px; }
.terminal-line.error { color: #f85149; }

.terminal-prompt { color: var(--accent-green); font-weight: 600; }

.terminal-input-line {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
}

.terminal-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 12px;
  caret-color: var(--accent-green);
}

/* ============ 命令联想下拉 ============ */
.suggest-box {
  margin-top: 6px;
  margin-bottom: 4px;
  border: 1px solid #30363d;
  border-radius: 8px;
  background: #161b22;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.suggest-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
  border-bottom: 1px solid #21262d;
}

.suggest-item:last-of-type { border-bottom: none; }

.suggest-item:hover {
  background: rgba(56, 139, 253, 0.15);
}

.s-cmd {
  font-family: 'SF Mono', 'Consolas', monospace;
  color: #58a6ff;
  white-space: nowrap;
  min-width: 220px;
}

.s-desc {
  color: #8b949e;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.s-usage {
  color: #6e7681;
  font-size: 11px;
  font-family: 'SF Mono', 'Consolas', monospace;
  white-space: nowrap;
}

.suggest-hint {
  padding: 4px 10px;
  font-size: 11px;
  color: #484f58;
  background: #0d1117;
  border-top: 1px solid #21262d;
}
</style>
