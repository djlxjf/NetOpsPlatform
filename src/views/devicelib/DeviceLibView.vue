<template>
  <PageLayout title="设备库" subtitle="设备型号与参数管理" class="device-lib-view">
    <template #actions>
      <el-button size="small" @click="showImportDialog">
        <el-icon><Upload /></el-icon> 导入型号
      </el-button>
      <el-button size="small" @click="exportTemplate">
        <el-icon><Download /></el-icon> 导出模板
      </el-button>
      <el-button size="small" @click="exportLibrary">
        <el-icon><Download /></el-icon> 导出库
      </el-button>
      <el-button type="primary" size="small" @click="showAddDialog">
        <el-icon><Plus /></el-icon> 添加设备型号
      </el-button>
    </template>

    <!-- 统计信息 -->
    <div class="stats-row">
      <div class="mini-stat">
        <div class="mini-stat-value">{{ totalModels }}</div>
        <div class="mini-stat-label">设备型号总数</div>
      </div>
      <div class="mini-stat">
        <div class="mini-stat-value">{{ vendorCount }}</div>
        <div class="mini-stat-label">厂商数量</div>
      </div>
      <div class="mini-stat">
        <div class="mini-stat-value">{{ customCount }}</div>
        <div class="mini-stat-label">自定义型号</div>
      </div>
    </div>

    <!-- 过滤栏 -->
    <div class="filter-bar mac-card">
      <el-input
        ref="searchInputRef"
        v-model="searchText"
        placeholder="搜索设备型号、参数..."
        size="small"
        style="width: 220px"
        clearable
        @paste="handleSearchPaste"
        @contextmenu="handleSearchContextMenu"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-select v-model="filterVendor" placeholder="全部厂商" size="small" style="width: 150px" clearable>
        <el-option v-for="v in vendors" :key="v" :label="v" :value="v" />
      </el-select>
      <el-select v-model="filterType" placeholder="全部类型" size="small" style="width: 130px" clearable>
        <el-option v-for="t in deviceTypes" :key="t.value" :label="t.label" :value="t.value" />
      </el-select>
      <el-checkbox v-model="showOnlyCustom" size="small">仅显示自定义</el-checkbox>
    </div>

    <!-- 设备库列表 -->
    <div class="lib-grid">
      <div
        v-for="(models, vendor) in paginatedVendors"
        :key="vendor"
        class="vendor-section"
      >
        <div class="vendor-header">
          <span class="vendor-name">{{ vendor }}</span>
          <span class="vendor-count">{{ models.length }} 个型号</span>
        </div>
        <div class="model-list">
          <div
            v-for="model in models"
            :key="model.id"
            class="model-card"
            :class="{ custom: model.isCustom }"
            @click="viewModelDetail(model)"
          >
            <div class="model-header">
              <div class="model-icon" :class="model.type">
                <el-icon size="18"><component :is="getDeviceIcon(model.type)" /></el-icon>
              </div>
              <div class="model-info">
                <div class="model-name">{{ model.name }}</div>
                <div class="model-type-tag">{{ getTypeLabel(model.type) }}</div>
              </div>
              <div v-if="model.isCustom" class="custom-badge">自定义</div>
            </div>
            <div class="model-specs">
              <div class="spec-item" v-if="model.ethernetPorts">
                <el-icon><Connection /></el-icon>
                <span>{{ model.ethernetPorts }} 电口</span>
              </div>
              <div class="spec-item" v-if="model.sfpPorts">
                <el-icon><Timer /></el-icon>
                <span>{{ model.sfpPorts }} 光口</span>
              </div>
              <div class="spec-item" v-if="model.frontEthernetPorts || model.backEthernetPorts">
                <span class="panel-badge">面板</span>
                <span>前{{ model.frontEthernetPorts || 0 }}后{{ model.backEthernetPorts || 0 }}电</span>
              </div>
              <div class="spec-item" v-if="model.frontSfpPorts || model.backSfpPorts">
                <span class="panel-badge">面板</span>
                <span>前{{ model.frontSfpPorts || 0 }}后{{ model.backSfpPorts || 0 }}光</span>
              </div>
              <div class="spec-item" v-if="model.uSize">
                <el-icon><Box /></el-icon>
                <span>{{ model.uSize }}U</span>
              </div>
              <div class="spec-item" v-if="model.maxPower">
                <el-icon><Lightning /></el-icon>
                <span>{{ model.maxPower }}W</span>
              </div>
            </div>
            <div class="model-actions" @click.stop>
              <el-button size="small" @click="editModel(model)">编辑</el-button>
              <el-button size="small" type="danger" @click="deleteModel(model)">删除</el-button>
            </div>
          </div>
        </div>
      </div>
      <div v-if="totalFilteredModels === 0" class="empty-state">
        <el-icon size="48" color="#484f58"><Folder /></el-icon>
        <p>暂无匹配的设备型号</p>
      </div>
    </div>

    <!-- 分页 -->
    <div class="pagination-wrapper" v-if="totalFilteredModels > pageSize">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="totalFilteredModels"
        layout="prev, pager, next"
        :pager-count="5"
        size="small"
        background
      />
    </div>

    <!-- 添加/编辑设备型号对话框 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑设备型号' : '添加设备型号'" width="600px">
      <el-form :model="form" ref="formRef" label-width="100px" size="default">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="设备型号" prop="name" required>
              <el-input v-model="form.name" placeholder="如: S5735-L24T4X" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="设备厂商" prop="vendor" required>
              <el-select v-model="form.vendor" filterable allow-create default-first-option placeholder="选择或输入厂商" style="width:100%">
                <el-option v-for="v in vendors" :key="v" :label="v" :value="v" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="设备类型" prop="type" required>
              <el-select v-model="form.type" style="width:100%">
                <el-option v-for="t in deviceTypes" :key="t.value" :label="t.label" :value="t.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="设备U数">
              <el-input-number v-model="form.uSize" :min="1" :max="20" />
              <span class="form-hint">1U=44.45mm</span>
            </el-form-item>
          </el-col>
        </el-row>

        <div class="form-section-title">端口配置</div>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="电口数量">
              <el-input-number v-model="form.ethernetPorts" :min="0" :max="256" placeholder="RJ45电口总数" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="光口数量">
              <el-input-number v-model="form.sfpPorts" :min="0" :max="128" placeholder="SFP光口总数" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="前面板电口">
              <el-input-number v-model="form.frontEthernetPorts" :min="0" :max="256" placeholder="前面板电口数量" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="后面板电口">
              <el-input-number v-model="form.backEthernetPorts" :min="0" :max="256" placeholder="后面板电口数量" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="前面板光口">
              <el-input-number v-model="form.frontSfpPorts" :min="0" :max="128" placeholder="前面板光口数量" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="后面板光口">
              <el-input-number v-model="form.backSfpPorts" :min="0" :max="128" placeholder="后面板光口数量" />
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 服务器选项：关闭前面板 -->
        <el-row v-if="form.type === 'server'" :gutter="16">
          <el-col :span="24">
            <el-form-item label="关闭前面板">
              <el-switch v-model="form.frontPanelDisabled" active-text="关闭" inactive-text="开启" />
              <span class="form-hint">关闭后，设备管理中的该型号服务器将不显示前面板</span>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="光口类型">
              <el-select ref="sfpTypeRef" v-model="form.sfpType" multiple placeholder="选择光口类型" style="width:100%" @change="handleSfpTypeChange">
                <el-option label="1G SFP" value="1g" />
                <el-option label="10G SFP+" value="10g" />
                <el-option label="25G SFP28" value="25g" />
                <el-option label="40G QSFP+" value="40g" />
                <el-option label="100G QSFP28" value="100g" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="PoE供电">
              <el-select v-model="form.poeType" placeholder="是否支持PoE" style="width:100%">
                <el-option label="不支持" value="" />
                <el-option label="PoE (15.4W)" value="poe" />
                <el-option label="PoE+ (30W)" value="poe+" />
                <el-option label="PoE++ (60W)" value="poe++" />
                <el-option label="PoE+++ (90W)" value="poe+++" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <div class="form-section-title">电气参数</div>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="最大功耗">
              <el-input-number v-model="form.maxPower" :min="0" :max="10000" placeholder="W" />
              <span class="form-hint">瓦特(W)</span>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="冗余电源">
              <el-select v-model="form.redundantPower" style="width:100%">
                <el-option label="不支持" :value="false" />
                <el-option label="支持" :value="true" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <div class="form-section-title">其他信息</div>
        <el-form-item label="转发性能">
          <el-input v-model="form.forwardingRate" placeholder="如: 96Gbps / 14.88Mpps" />
        </el-form-item>
        <el-form-item label="支持协议">
          <el-input v-model="form.supportedProtocols" placeholder="如: VLAN, STP, LACP, VRRP" />
        </el-form-item>
        <el-form-item label="备注说明">
          <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="其他参数说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveModel">{{ isEdit ? '保存' : '添加' }}</el-button>
      </template>
    </el-dialog>

    <!-- 设备型号详情对话框 -->
    <el-dialog v-model="detailVisible" title="设备型号详情" width="560px">
      <div v-if="currentModel" class="model-detail">
        <div class="detail-header">
          <div class="detail-icon" :class="currentModel.type">
            <el-icon size="32"><component :is="getDeviceIcon(currentModel.type)" /></el-icon>
          </div>
          <div class="detail-title">
            <h2>{{ currentModel.name }}</h2>
            <span class="detail-vendor">{{ currentModel.vendor }} · {{ getTypeLabel(currentModel.type) }}</span>
            <el-tag v-if="currentModel.isCustom" size="small" type="warning" style="margin-left: 8px">自定义</el-tag>
          </div>
        </div>

        <div class="detail-section" v-if="currentModel.type !== 'server' && currentModel.type !== 'storage'">
          <div class="section-title">面板预览</div>
          <div class="panel-preview">
            <svg :width="panelPreviewWidth" :height="panelPreviewHeight" :viewBox="`0 0 ${panelPreviewWidth} ${panelPreviewHeight}`">
              <DevicePanelRenderer :device="panelPreviewDevice" :width="panelPreviewWidth" :height="panelPreviewHeight" />
            </svg>
          </div>
        </div>

        <div class="detail-section">
          <div class="section-title">基本信息</div>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">U数</span>
              <span class="detail-value">{{ currentModel.uSize || 1 }} U</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">电口数量</span>
              <span class="detail-value">{{ currentModel.ethernetPorts || 0 }} 个</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">光口数量</span>
              <span class="detail-value">{{ currentModel.sfpPorts || 0 }} 个</span>
            </div>
            <div class="detail-item" v-if="currentModel.frontEthernetPorts || currentModel.backEthernetPorts">
              <span class="detail-label">面板电口</span>
              <span class="detail-value">
                前{{ currentModel.frontEthernetPorts || 0 }} / 后{{ currentModel.backEthernetPorts || 0 }}
              </span>
            </div>
            <div class="detail-item" v-if="currentModel.frontSfpPorts || currentModel.backSfpPorts">
              <span class="detail-label">面板光口</span>
              <span class="detail-value">
                前{{ currentModel.frontSfpPorts || 0 }} / 后{{ currentModel.backSfpPorts || 0 }}
              </span>
            </div>
            <div class="detail-item">
              <span class="detail-label">最大功耗</span>
              <span class="detail-value">{{ currentModel.maxPower ? currentModel.maxPower + 'W' : '-' }}</span>
            </div>
          </div>
        </div>

        <div class="detail-section" v-if="currentModel.sfpType?.length">
          <div class="section-title">光口类型</div>
          <div class="sfp-tags">
            <el-tag v-for="t in currentModel.sfpType" :key="t" size="small">{{ t }}</el-tag>
          </div>
        </div>

        <div class="detail-section" v-if="currentModel.poeType">
          <div class="section-title">PoE供电</div>
          <el-tag type="success">{{ getPoELabel(currentModel.poeType) }}</el-tag>
        </div>

        <div class="detail-section" v-if="currentModel.forwardingRate">
          <div class="section-title">转发性能</div>
          <p>{{ currentModel.forwardingRate }}</p>
        </div>

        <div class="detail-section" v-if="currentModel.supportedProtocols">
          <div class="section-title">支持协议</div>
          <p>{{ currentModel.supportedProtocols }}</p>
        </div>

        <div class="detail-section" v-if="currentModel.remark">
          <div class="section-title">备注说明</div>
          <p>{{ currentModel.remark }}</p>
        </div>
      </div>
    </el-dialog>

    <!-- 导入对话框 -->
    <el-dialog v-model="importDialogVisible" title="导入设备型号" width="650px">
      <div class="import-area">
        <el-tabs v-model="importTab" @tab-change="handleImportTabChange">
          <el-tab-pane label="Excel/CSV" name="excel">
            <el-upload
              v-if="importTab === 'excel'"
              ref="uploadRef"
              drag
              accept=".xlsx,.xls,.csv"
              :auto-upload="false"
              :on-change="handleFileChange"
              :show-file-list="true"
              :file-list="fileList"
            >
              <el-icon class="el-icon--upload" size="48"><Upload /></el-icon>
              <div class="el-upload__text">
                拖拽Excel/CSV文件到此处，或 <em>点击选择</em>
              </div>
              <template #tip>
                <div class="el-upload__tip">
                  支持 .xlsx, .xls, .csv 格式<br/>
                  <span style="color: var(--text-secondary)">导入后会自动添加到"自定义型号"分类</span>
                </div>
              </template>
            </el-upload>
          </el-tab-pane>
          <el-tab-pane label="JSON" name="json">
            <el-upload
              v-if="importTab === 'json'"
              ref="uploadRef"
              drag
              accept=".json"
              :auto-upload="false"
              :on-change="handleFileChange"
              :show-file-list="true"
              :file-list="fileList"
            >
              <el-icon class="el-icon--upload" size="48"><Upload /></el-icon>
              <div class="el-upload__text">
                拖拽JSON文件到此处，或 <em>点击选择</em>
              </div>
              <template #tip>
                <div class="el-upload__tip">
                  支持由「导出库」生成的 .json 设备库文件<br/>
                  <span style="color: var(--text-secondary)">按 厂商+型号 自动去重，导入后自动加入"自定义型号"分类</span>
                </div>
              </template>
            </el-upload>
          </el-tab-pane>
        </el-tabs>

        <!-- 预览区域 -->
        <div v-if="importPreview.length > 0" class="import-preview">
          <el-divider content-position="left">
            <span style="color: var(--accent-green); font-size: 13px;">
              ✓ 解析成功，将导入 {{ importPreview.length }} 个型号
            </span>
          </el-divider>
          <el-table :data="importPreview.slice(0, 8)" size="small" max-height="250" border>
            <el-table-column prop="name" label="型号" min-width="120" show-overflow-tooltip />
            <el-table-column prop="vendor" label="厂商" width="90" />
            <el-table-column prop="type" label="类型" width="70">
              <template #default="{ row }">{{ getTypeLabel(row.type) }}</template>
            </el-table-column>
            <el-table-column prop="uSize" label="U数" width="50" align="center" />
            <el-table-column label="状态" width="70" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.duplicate" size="small" type="warning">已存在</el-tag>
                <el-tag v-else size="small" type="success">新增</el-tag>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="importPreview.length > 8" style="text-align: center; color: var(--text-muted); font-size: 12px; margin-top: 8px;">
            还有 {{ importPreview.length - 8 }} 个型号...
          </div>
          <div v-if="newVendors.length > 0" class="new-vendors-hint">
            <div class="hint-text">
              <el-icon color="#e6a23c"><Warning /></el-icon>
              将自动添加以下新厂商
            </div>
            <div class="hint-tags">
              <el-tag v-for="v in newVendors" :key="v" size="small" type="warning">{{ v }}</el-tag>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="importDialogVisible = false; fileList = []; importPreview = [];">取消</el-button>
        <el-button type="primary" :disabled="importPreview.length === 0" @click="confirmImport">确认导入</el-button>
      </template>
    </el-dialog>
  </PageLayout>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageLayout from '../../components/PageLayout.vue'
import DevicePanelRenderer from '../../components/cabinet/DevicePanelRenderer.js'
import { useDeviceLibStore } from '../../stores'
import * as XLSX from 'xlsx'

const deviceLibStore = useDeviceLibStore()

const searchText = ref('')
const searchInputRef = ref(null)
const filterVendor = ref('')
const filterType = ref('')
const showOnlyCustom = ref(false)
const dialogVisible = ref(false)
const detailVisible = ref(false)
const isEdit = ref(false)
const formRef = ref(null)
const currentModel = ref(null)

// 面板预览：根据当前型号构造设备对象，复用 DevicePanelRenderer 渲染真实面板
const panelPreviewDevice = computed(() => {
  const m = currentModel.value
  if (!m) return null
  return {
    id: `preview-${m.id || m.name}`,
    name: m.name || '',
    model: m.name || '',
    vendor: m.vendor || '',
    brand: m.vendor || '',
    type: m.type || 'switch',
    device_type: m.type || 'switch',
    uSize: m.uSize || 1,
    u_height: m.uSize || 1,
    ethernetPorts: m.ethernetPorts || 0,
    sfpPorts: m.sfpPorts || 0,
    status: 'normal',
    ports: [],
  }
})

// 面板预览尺寸：宽度固定，高度按 U 数换算（1U≈44.5px）
const panelPreviewWidth = 480
const panelPreviewHeight = computed(() => Math.max(32, (currentModel.value?.uSize || 1) * 44.5))
const importDialogVisible = ref(false)
const importTab = ref('excel')
const importPreview = ref([])
const fileList = ref([])
const uploadRef = ref(null)
const sfpTypeRef = ref(null)

function handleSfpTypeChange() {
  nextTick(() => {
    sfpTypeRef.value?.blur()
  })
}

// 分页
const currentPage = ref(1)
const pageSize = ref(10)

// 右键粘贴支持
function handleSearchContextMenu(e) {
  // 右键菜单由浏览器默认处理，无需阻止
}
function handleSearchPaste(e) {
  // 使用剪贴板 API 获取粘贴内容并追加到搜索框
  const clipboardData = e.clipboardData
  if (clipboardData) {
    const text = clipboardData.getData('text')
    if (text) {
      e.preventDefault()
      searchText.value = searchText.value + text
    }
  }
}

const deviceTypes = [
  { value: 'switch', label: '交换机' },
  { value: 'router', label: '路由器' },
  { value: 'firewall', label: '防火墙' },
  { value: 'server', label: '服务器' },
  { value: 'ups', label: 'UPS电源' },
  { value: 'storage', label: '存储设备' },
  { value: 'wireless', label: '无线AP' },
  { value: 'loadbalancer', label: '负载均衡' },
  { value: 'other', label: '其他' }
]

// 动态计算所有厂商（包括内置和自定义的）
const vendors = computed(() => {
  const allVendors = new Set([
    '华为', '华三(H3C)', '锐捷', 'TP-Link', '思科(Cisco)', '中兴(ZTE)',
    '烽火', '联想', 'Dell', 'HP', 'Juniper', 'Arista', 'HPE', '新华三', '迪普', '迈普'
  ])
  // 添加自定义型号的厂商
  deviceLibStore.models.forEach(m => {
    if (m.vendor) allVendors.add(m.vendor)
  })
  return [...allVendors].sort()
})

const defaultForm = () => ({
  name: '', vendor: '', type: 'switch', uSize: 1,
  ethernetPorts: 0, sfpPorts: 0,
  frontEthernetPorts: 0, backEthernetPorts: 0,
  frontSfpPorts: 0, backSfpPorts: 0,
  sfpType: [], poeType: '',
  maxPower: 0, redundantPower: false,
  forwardingRate: '', supportedProtocols: '', remark: '',
  frontPanelDisabled: false // 是否关闭前面板
})

const form = ref(defaultForm())
const editId = ref(null)

// 筛选条件变化时重置页码
watch([searchText, filterVendor, filterType, showOnlyCustom], () => {
  currentPage.value = 1
})

const totalModels = computed(() => deviceLibStore.models.length)
const vendorCount = computed(() => {
  const set = new Set(deviceLibStore.models.map(m => m.vendor))
  return set.size
})
const customCount = computed(() => deviceLibStore.models.filter(m => m.isCustom).length)

const filteredVendors = computed(() => {
  const models = deviceLibStore.models

  const filtered = models.filter(m => {
    if (showOnlyCustom.value && !m.isCustom) return false
    if (filterVendor.value && m.vendor !== filterVendor.value) return false
    if (filterType.value && m.type !== filterType.value) return false
    if (searchText.value) {
      const search = searchText.value.toLowerCase()
      if (!m.name.toLowerCase().includes(search) &&
          !m.vendor.toLowerCase().includes(search) &&
          !(m.remark || '').toLowerCase().includes(search)) {
        return false
      }
    }
    return true
  })

  // 按厂商分组
  const grouped = {}
  filtered.forEach(m => {
    if (!grouped[m.vendor]) grouped[m.vendor] = []
    grouped[m.vendor].push(m)
  })

  return grouped
})

// 分页后的型号（扁平化后分页，再重新分组）
const paginatedVendors = computed(() => {
  // 扁平化所有型号
  const allModels = []
  Object.entries(filteredVendors.value).forEach(([vendor, models]) => {
    models.forEach(m => allModels.push(m))
  })

  // 分页
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  const pageModels = allModels.slice(start, end)

  // 重新按厂商分组
  const grouped = {}
  pageModels.forEach(m => {
    if (!grouped[m.vendor]) grouped[m.vendor] = []
    grouped[m.vendor].push(m)
  })

  return grouped
})

// 总型号数（用于分页）
const totalFilteredModels = computed(() => {
  let count = 0
  Object.values(filteredVendors.value).forEach(models => {
    count += models.length
  })
  return count
})

function getModelCount(vendor) {
  return filteredVendors.value[vendor]?.length || 0
}

function getDeviceIcon(type) {
  const icons = {
    switch: 'Connection', router: 'Share', firewall: 'Shield',
    server: 'Monitor', ups: 'Lightning', storage: 'Coin',
    wireless: 'Wifi', loadbalancer: 'Operation', other: 'Cpu'
  }
  return icons[type] || 'Cpu'
}

function getTypeLabel(type) {
  return deviceTypes.find(t => t.value === type)?.label || type || '-'
}

function getPoELabel(type) {
  const map = { 'poe': 'PoE (15.4W)', 'poe+': 'PoE+ (30W)', 'poe++': 'PoE++ (60W)', 'poe+++': 'PoE+++ (90W)' }
  return map[type] || type
}

// 计算新厂商
const newVendors = computed(() => {
  const existingVendors = new Set(deviceLibStore.models.map(m => m.vendor))
  const vendors = new Set(importPreview.value.map(m => m.vendor))
  return [...vendors].filter(v => !existingVendors.has(v))
})

// 处理文件变化
function handleFileChange(file) {
  fileList.value = [file]
  if (importTab.value === 'json') {
    parseJsonFile(file.raw)
  } else {
    parseExcelFile(file.raw)
  }
}

// 解析Excel文件
function parseExcelFile(rawFile) {
  const reader = new FileReader()
  reader.onload = e => {
    try {
      const data = new Uint8Array(e.target.result)
      const workbook = XLSX.read(data, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(sheet)

      if (jsonData.length === 0) {
        ElMessage.warning('文件中没有找到数据')
        return
      }

      // 字段映射
      const typeMap = {
        '交换机': 'switch', '路由': 'router', '防火墙': 'firewall',
        '服务器': 'server', 'UPS': 'ups', '存储': 'storage',
        '无线AP': 'wireless', '无线': 'wireless', '负载均衡': 'loadbalancer', '其他': 'other'
      }
      const poeMap = {
        '不支持': '', '不支持PoE': '', 'PoE': 'poe', 'PoE+': 'poe+', 'PoE++': 'poe++', 'PoE+++': 'poe+++'
      }

      const parsed = jsonData.map((row, index) => {
        // 尝试多种可能的列名
        const name = row['型号'] || row['设备型号'] || row['型号名称'] || row['name'] || ''
        const vendor = row['厂商'] || row['设备厂商'] || row['品牌'] || row['vendor'] || ''
        const typeStr = row['类型'] || row['设备类型'] || row['type'] || ''
        const uSize = parseInt(row['U数'] || row['占用U数'] || row['uSize'] || '1') || 1
        const ethPorts = parseInt(row['电口'] || row['电口数量'] || row['ethernetPorts'] || '0') || 0
        const sfpPorts = parseInt(row['光口'] || row['光口数量'] || row['sfpPorts'] || '0') || 0
        const frontEthPorts = parseInt(row['前面板电口'] || row['frontEthernetPorts'] || '0') || 0
        const backEthPorts = parseInt(row['后面板电口'] || row['backEthernetPorts'] || '0') || 0
        const frontSfpPorts = parseInt(row['前面板光口'] || row['frontSfpPorts'] || '0') || 0
        const backSfpPorts = parseInt(row['后面板光口'] || row['backSfpPorts'] || '0') || 0
        const maxPower = parseInt(row['功耗'] || row['最大功耗'] || row['maxPower'] || '0') || 0
        const remark = row['备注'] || row['备注说明'] || row['remark'] || ''

        // 类型匹配
        let type = 'switch'
        const typeLower = typeStr.toLowerCase()
        if (typeLower.includes('路由')) type = 'router'
        else if (typeLower.includes('防火') || typeLower.includes('墙')) type = 'firewall'
        else if (typeLower.includes('服务') || typeLower.includes('server')) type = 'server'
        else if (typeLower.includes('ups') || typeLower.includes('电源')) type = 'ups'
        else if (typeLower.includes('存储') || typeLower.includes('storage')) type = 'storage'
        else if (typeLower.includes('无线') || typeLower.includes('ap') || typeLower.includes('ac')) type = 'wireless'
        else if (typeLower.includes('负载') || typeLower.includes('lb')) type = 'loadbalancer'
        else if (typeLower.includes('交换') || typeLower === '') type = 'switch'
        else type = 'other'

        return {
          name: String(name).trim(),
          vendor: String(vendor).trim(),
          type,
          uSize,
          ethernetPorts: ethPorts,
          sfpPorts,
          frontEthernetPorts: frontEthPorts,
          backEthernetPorts: backEthPorts,
          frontSfpPorts: frontSfpPorts,
          backSfpPorts: backSfpPorts,
          maxPower,
          remark: String(remark).trim(),
          isCustom: true,
          duplicate: false
        }
      }).filter(m => m.name && m.vendor)

      // 检查是否已存在
      parsed.forEach(m => {
        const exist = deviceLibStore.models.find(
          existing => existing.name === m.name && existing.vendor === m.vendor
        )
        if (exist) m.duplicate = true
      })

      importPreview.value = parsed
      ElMessage.success(`解析成功，共 ${parsed.length} 个型号，其中 ${parsed.filter(m => m.duplicate).length} 个已存在`)
    } catch (err) {
      console.error('Excel解析错误:', err)
      ElMessage.error('文件解析失败，请检查文件格式')
    }
  }
  reader.readAsArrayBuffer(rawFile)
}

// 解析JSON文件（与「导出库」格式对称）
function parseJsonFile(rawFile) {
  const reader = new FileReader()
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result)
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.models) ? data.models : [])
      if (list.length === 0) {
        ElMessage.warning('文件中没有找到型号数据')
        return
      }

      const parsed = list.map(m => {
        if (!m || typeof m !== 'object') return null
        const name = String(m.name || m['设备型号'] || '').trim()
        const vendor = String(m.vendor || m['厂商'] || '').trim()
        if (!name || !vendor) return null
        return {
          name,
          vendor,
          type: m.type || 'switch',
          uSize: parseInt(m.uSize) || 1,
          ethernetPorts: parseInt(m.ethernetPorts) || 0,
          sfpPorts: parseInt(m.sfpPorts) || 0,
          frontEthernetPorts: parseInt(m.frontEthernetPorts) || 0,
          backEthernetPorts: parseInt(m.backEthernetPorts) || 0,
          frontSfpPorts: parseInt(m.frontSfpPorts) || 0,
          backSfpPorts: parseInt(m.backSfpPorts) || 0,
          sfpType: Array.isArray(m.sfpType) ? m.sfpType : [],
          poeType: m.poeType || '',
          maxPower: parseInt(m.maxPower) || 0,
          redundantPower: !!m.redundantPower,
          forwardingRate: m.forwardingRate || '',
          supportedProtocols: m.supportedProtocols || '',
          remark: String(m.remark || '').trim(),
          frontPanelDisabled: !!m.frontPanelDisabled,
          isCustom: true,
          duplicate: false
        }
      }).filter(Boolean)

      // 按 厂商+型号 检测重复
      parsed.forEach(m => {
        const exist = deviceLibStore.models.find(
          existing => existing.name === m.name && existing.vendor === m.vendor
        )
        if (exist) m.duplicate = true
      })

      importPreview.value = parsed
      ElMessage.success(`解析成功，共 ${parsed.length} 个型号，其中 ${parsed.filter(m => m.duplicate).length} 个已存在`)
    } catch (err) {
      console.error('JSON解析错误:', err)
      ElMessage.error('JSON 文件解析失败，请检查文件格式')
    }
  }
  reader.readAsText(rawFile)
}

// 确认导入
async function confirmImport() {
  const toImport = importPreview.value.filter(m => !m.duplicate)
  if (toImport.length === 0) {
    ElMessage.warning('所有型号均已存在，无需导入')
    return
  }

  try {
    await ElMessageBox.confirm(
      `将导入 ${toImport.length} 个新型号到设备库，是否继续？`,
      '确认导入',
      { type: 'info', confirmButtonText: '确认导入', cancelButtonText: '取消' }
    )

    let count = 0
    toImport.forEach(model => {
      const newModel = {
        ...model,
        id: 'custom_' + Date.now().toString() + '_' + count
      }
      deviceLibStore.addModel(newModel)
      count++
    })

    ElMessage.success(`成功导入 ${count} 个型号到设备库`)
    importDialogVisible.value = false
    fileList.value = []
    importPreview.value = []
  } catch {}
}

// 显示导入对话框
function showImportDialog() {
  importDialogVisible.value = true
  importTab.value = 'excel'
  importPreview.value = []
  fileList.value = []
}

// 切换导入 Tab 时清空已解析内容
function handleImportTabChange() {
  importPreview.value = []
  fileList.value = []
}

// 导出模板
function exportTemplate() {
  const templateData = [
    { '型号': 'S5735-L24T4X-A', '厂商': '华为', '类型': '交换机', 'U数': 1, '电口': 24, '光口': 4, '功耗': 45, '备注': '24口千兆+4万兆' },
    { '型号': 'AR1220E-S', '厂商': '华为', '类型': '路由器', 'U数': 1, '电口': 8, '光口': 2, '功耗': 60, '备注': '增强型企业路由器' },
    { '型号': 'USG6310E-S', '厂商': '华为', '类型': '防火墙', 'U数': 1, '电口': 8, '光口': 0, '功耗': 30, '备注': '入门级防火墙' },
    { '型号': 'RG-S1920-24GT4XS', '厂商': '锐捷', '类型': '交换机', 'U数': 1, '电口': 24, '光口': 4, '功耗': 35, '备注': '网管交换机' },
    { '型号': 'S5120-28P-EI', '厂商': '华三(H3C)', '类型': '交换机', 'U数': 1, '电口': 24, '光口': 4, '功耗': 55, '备注': '增强型交换机' },
    { '型号': 'F1000-AK125', '厂商': '华三(H3C)', '类型': '防火墙', 'U数': 1, '电口': 16, '光口': 4, '功耗': 80, '备注': '标准防火墙' },
    { '型号': 'TL-SG2428P', '厂商': 'TP-Link', '类型': '交换机', 'U数': 1, '电口': 24, '光口': 4, '功耗': 450, '备注': '24口PoE+管理交换机' },
    { '型号': 'PowerEdge R750xs', '厂商': 'Dell', '类型': '服务器', 'U数': 2, '电口': 0, '光口': 0, '功耗': 800, '备注': '2U机架式服务器' },
    { '型号': 'UPS2000-G-6KRTL', '厂商': '华为', '类型': 'UPS', 'U数': 3, '电口': 0, '光口': 0, '功耗': 6000, '备注': '6KVA在线式UPS' },
  ]

  const ws = XLSX.utils.json_to_sheet(templateData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '设备型号导入模板')

  ws['!cols'] = [
    { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 6 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 30 }
  ]

  const fileName = 'device_lib_import_template.xlsx'
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([wbout], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)

  ElMessage.success('已导出导入模板')
}

function showAddDialog() {
  isEdit.value = false
  form.value = defaultForm()
  dialogVisible.value = true
}

function editModel(model) {
  isEdit.value = true
  editId.value = model.id
  form.value = { ...defaultForm(), ...model }
  dialogVisible.value = true
}

function viewModelDetail(model) {
  currentModel.value = model
  detailVisible.value = true
}

function saveModel() {
  if (!form.value.name?.trim()) {
    ElMessage.error('请输入设备型号')
    return
  }
  if (!form.value.vendor?.trim()) {
    ElMessage.error('请选择或输入厂商')
    return
  }

  // 端口数量一致性校验：面板电口/光口之和应等于总数
  const frontEth = Number(form.value.frontEthernetPorts) || 0
  const backEth = Number(form.value.backEthernetPorts) || 0
  const frontSfp = Number(form.value.frontSfpPorts) || 0
  const backSfp = Number(form.value.backSfpPorts) || 0
  if ((frontEth > 0 || backEth > 0) && (frontEth + backEth) !== (Number(form.value.ethernetPorts) || 0)) {
    ElMessage.warning(`前面板电口(${frontEth}) + 后面板电口(${backEth}) = ${frontEth + backEth}，与总电口数(${Number(form.value.ethernetPorts) || 0})不一致，请检查`)
    return
  }
  if ((frontSfp > 0 || backSfp > 0) && (frontSfp + backSfp) !== (Number(form.value.sfpPorts) || 0)) {
    ElMessage.warning(`前面板光口(${frontSfp}) + 后面板光口(${backSfp}) = ${frontSfp + backSfp}，与总光口数(${Number(form.value.sfpPorts) || 0})不一致，请检查`)
    return
  }

  if (isEdit.value) {
    // 编辑的是内置型号时，创建自定义副本而非覆盖内置型号
    const originalModel = deviceLibStore.models.find(m => m.id === editId.value)
    if (originalModel && originalModel.isCustom === false) {
      const newName = `${form.value.name}(自定义)`
      deviceLibStore.addModel({
        ...form.value,
        name: newName,
        isCustom: true,
        id: 'custom_' + Date.now()
      })
      ElMessage.success(`已创建自定义副本「${newName}」`)
      dialogVisible.value = false
    } else {
      deviceLibStore.updateModel(editId.value, { ...form.value, isCustom: true })
      ElMessage.success('型号已更新')
      dialogVisible.value = false
    }
  } else {
    // 检查是否已存在相同厂商+型号的设备（去重）
    const existingModel = deviceLibStore.models.find(
      m => m.name === form.value.name && m.vendor === form.value.vendor
    )
    if (existingModel) {
      // 如果存在，询问用户是更新还是取消
      ElMessageBox.confirm(
        `设备库中已存在相同型号「${form.value.vendor} - ${form.value.name}」，是否更新现有型号？`,
        '型号已存在',
        { type: 'warning', confirmButtonText: '更新', cancelButtonText: '取消' }
      ).then(() => {
        deviceLibStore.updateModel(existingModel.id, { ...form.value, isCustom: true })
        ElMessage.success('型号已更新')
        dialogVisible.value = false
      }).catch(() => {})
    } else {
      deviceLibStore.addModel({ ...form.value, isCustom: true, id: 'custom_' + Date.now() })
      ElMessage.success('型号已添加')
      dialogVisible.value = false
    }
  }
}

async function deleteModel(model) {
  if (!model.isCustom) {
    ElMessage.warning('内置型号无法删除')
    return
  }
  try {
    await ElMessageBox.confirm(`确定要删除型号「${model.name}」吗？`, '确认删除', { type: 'warning' })
    deviceLibStore.deleteModel(model.id)
    ElMessage.success('型号已删除')
  } catch {}
}

function exportLibrary() {
  const data = JSON.stringify(deviceLibStore.models.filter(m => m.isCustom), null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `device_library_${new Date().toISOString().split('T')[0]}.json`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('已导出自定义型号')
}
</script>

<style lang="scss" scoped>
.device-lib-view {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.stats-row {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}

.mini-stat {
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: 12px 20px;
  text-align: center;
  flex: 1;
}
.mini-stat-value { font-size: 24px; font-weight: 700; color: var(--text-primary); }
.mini-stat-label { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

@media (max-width: 768px) {
  .device-lib-view {
    gap: 12px;
    overflow-x: hidden;
    width: 100vw;
    max-width: 100%;
    box-sizing: border-box;
  }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .mini-stat {
    padding: 8px 4px;
  }

  .mini-stat-value {
    font-size: 16px;
  }

  .mini-stat-label {
    font-size: 10px;
  }

  .filter-bar {
    padding: 10px 12px;
    gap: 8px;
    flex-wrap: wrap;
  }

  .filter-bar .el-input,
  .filter-bar .el-select {
    width: 100% !important;
    max-width: 100%;
  }

  .filter-bar .el-checkbox {
    width: 100%;
    margin-top: 4px;
  }

  .lib-grid {
    gap: 12px;
  }

  .vendor-section {
    width: 100%;
    min-width: 0;
  }

  .vendor-header {
    padding: 10px 12px;
  }

  .model-list {
    grid-template-columns: 1fr;
    gap: 10px;
    padding: 10px;
  }

  .model-card {
    width: 100%;
    min-width: 0;
    padding: 10px;
  }

  .model-header {
    gap: 8px;
    margin-bottom: 8px;
  }

  .model-specs {
    gap: 8px;
  }

  .model-actions {
    margin-top: 8px;
    padding-top: 8px;
  }

  /* 对话框统一移动端适配 */
  :deep(.el-dialog) {
    width: 96vw !important;
    max-width: 96vw !important;
    margin: 2vh auto !important;
  }

  :deep(.el-dialog__body) {
    padding: 12px 16px;
  }

  :deep(.el-dialog__header) {
    padding: 12px 16px;
  }

  :deep(.el-dialog__footer) {
    padding: 10px 16px;
  }

  :deep(.el-form-item__label) {
    float: none;
    display: block;
    text-align: left;
    padding: 0 0 4px;
    line-height: 1.4;
    width: 100% !important;
  }

  :deep(.el-form-item__content) {
    margin-left: 0 !important;
    width: 100%;
  }

  :deep(.el-input),
  :deep(.el-select),
  :deep(.el-input-number) {
    width: 100% !important;
  }

  :deep(.el-row) {
    flex-direction: column;
    gap: 0;
  }

  :deep(.el-col) {
    max-width: 100% !important;
    flex: 0 0 100% !important;
  }

  .detail-header {
    flex-direction: column;
    gap: 12px;
    align-items: center;
    text-align: center;
  }

  .detail-icon {
    width: 48px;
    height: 48px;
  }

  .detail-title h2 {
    font-size: 16px;
  }

  .detail-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 16px;
}

.lib-grid {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.pagination-wrapper {
  padding: 12px 0;
  display: flex;
  justify-content: center;
}

.vendor-section {
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

.vendor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-glass);
  box-shadow: var(--shadow-md);
  border-bottom: 1px solid var(--border-color);
}

.vendor-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.vendor-count {
  font-size: 12px;
  color: var(--text-muted);
}

.model-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  padding: 12px;
}

.model-card {
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: 12px;
  cursor: pointer;
  transition: var(--transition);

  &:hover {
    border-color: rgba(255,255,255,0.15);
    box-shadow: var(--shadow-sm);
  }

  &.custom {
    border-left: 3px solid var(--accent-orange);
  }
}

.model-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.model-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  background: rgba(0, 122, 204,0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &.switch { background: rgba(0, 122, 204,0.15); .el-icon { color: var(--accent); } }
  &.router { background: rgba(188,140,255,0.15); .el-icon { color: var(--accent-purple); } }
  &.firewall { background: rgba(248,81,73,0.15); .el-icon { color: var(--accent-red); } }
  &.server { background: rgba(63,185,80,0.15); .el-icon { color: var(--accent-green); } }
  &.wireless { background: rgba(57,197,207,0.15); .el-icon { color: var(--accent-cyan); } }
}

.model-info {
  flex: 1;
  min-width: 0;
}

.model-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-type-tag {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 2px;
}

.custom-badge {
  font-size: 9px;
  padding: 2px 6px;
  background: rgba(230,162,60,0.2);
  color: var(--accent-orange);
  border-radius: 3px;
}

.model-specs {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.spec-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-secondary);

  .el-icon { font-size: 12px; color: var(--text-muted); }
}

.panel-badge {
  display: inline-block;
  padding: 0px 3px;
  border-radius: 3px;
  font-size: 9px;
  background: rgba(0, 122, 204, 0.15);
  color: var(--accent);
}

.model-actions {
  display: flex;
  gap: 4px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}

.empty-state {
  text-align: center;
  padding: 60px;
  color: var(--text-muted);
  font-size: 13px;
}

// 表单
.form-section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  padding: 8px 0 4px;
  border-bottom: 1px solid var(--border-color);
  margin: 12px 0;
}

.form-hint {
  margin-left: 8px;
  font-size: 11px;
  color: var(--text-muted);
}

// 详情
.model-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-header {
  display: flex;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.detail-icon {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-md);
  background: rgba(0, 122, 204,0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &.switch { background: rgba(0, 122, 204,0.15); .el-icon { color: var(--accent); } }
  &.router { background: rgba(188,140,255,0.15); .el-icon { color: var(--accent-purple); } }
  &.firewall { background: rgba(248,81,73,0.15); .el-icon { color: var(--accent-red); } }
  &.server { background: rgba(63,185,80,0.15); .el-icon { color: var(--accent-green); } }
}

.detail-title {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;

  h2 { font-size: 20px; font-weight: 700; color: var(--text-primary); margin: 0; }
  .detail-vendor { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
}

.detail-section {
  .section-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 8px;
  }

  p { font-size: 13px; color: var(--text-secondary); line-height: 1.6; margin: 0; }
}

.panel-preview {
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: 12px;
  display: flex;
  justify-content: center;
  overflow: hidden;

  svg {
    display: block;
    max-width: 100%;
    height: auto;
  }
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.detail-item {
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: 10px 12px;
}

.detail-label {
  font-size: 11px;
  color: var(--text-muted);
  display: block;
}

.detail-value {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 600;
}

.sfp-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

// 导入区域
.import-area {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.import-preview {
  margin-top: 16px;
  padding: 16px;
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.new-vendors-hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 12px;
  background: rgba(230, 162, 60, 0.1);
  border: 1px solid rgba(230, 162, 60, 0.3);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--accent-orange);
  flex-wrap: wrap;

  .hint-text {
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .hint-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }
}

:deep(.el-upload-dragger) {
  background: var(--bg-glass);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);

  &:hover {
    border-color: var(--accent);
  }
}
</style>
