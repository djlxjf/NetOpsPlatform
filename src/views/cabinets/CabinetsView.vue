<template>
  <div class="cabinets-view">
    <PageLayout title="机柜管理" subtitle="数据中心机柜与设备管理">
      <template #actions>
        <el-button
          type="primary"
          size="small"
          @click="openAddCabinetDialog"
        >
          <el-icon><Plus /></el-icon> 新建机柜
        </el-button>
      </template>

    <!-- 统计 -->
    <div class="stats-row">
      <div class="mini-stat" v-for="s in cabinetStats" :key="s.label">
        <div class="mini-stat-value">{{ s.value }}</div>
        <div class="mini-stat-label">{{ s.label }}</div>
      </div>
    </div>

    <!-- 机柜列表 -->
    <div class="cabinets-grid" v-if="cabinetStore.cabinets.length > 0">
      <div
        class="cabinet-card mac-card"
        v-for="cabinet in cabinetStore.cabinets"
        :key="cabinet.id"
        :class="{ active: selectedCabinet?.id === cabinet.id }"
        @click="selectCabinet(cabinet)"
      >
        <div class="cabinet-card-header">
          <div class="cabinet-icon">
            <svg viewBox="0 0 48 80" class="cabinet-svg">
              <!-- 机柜外框 - 金属质感 -->
              <rect
                x="1"
                y="1"
                width="46"
                height="78"
                rx="3"
                fill="#2c2c2e"
                stroke="#8e8e93"
                stroke-width="1.5"
              />
              <!-- 机柜门缝 -->
              <line
                x1="24"
                y1="4"
                x2="24"
                y2="76"
                stroke="#3a3a3c"
                stroke-width="0.5"
              />
              <!-- 顶部通风孔 -->
              <rect x="6" y="4" width="16" height="3" rx="1" fill="#1c1c1e" />
              <rect x="26" y="4" width="16" height="3" rx="1" fill="#1c1c1e" />
              <!-- 门锁 -->
              <rect x="22" y="8" width="4" height="6" rx="1" fill="#636366" />
              <circle cx="24" cy="11" r="1.5" fill="#48484a" />
              <!-- 设备1 - 交换机 -->
              <rect
                x="4"
                y="18"
                width="40"
                height="5"
                rx="1"
                fill="#007acc"
                opacity="0.7"
              />
              <rect
                x="6"
                y="19"
                width="4"
                height="1"
                rx="0.5"
                fill="#ffffff"
                opacity="0.3"
              />
              <rect
                x="11"
                y="19"
                width="4"
                height="1"
                rx="0.5"
                fill="#ffffff"
                opacity="0.3"
              />
              <rect
                x="16"
                y="19"
                width="4"
                height="1"
                rx="0.5"
                fill="#ffffff"
                opacity="0.3"
              />
              <!-- 设备2 - 服务器 -->
              <rect
                x="4"
                y="26"
                width="40"
                height="6"
                rx="1"
                fill="#007acc"
                opacity="0.6"
              />
              <circle cx="8" cy="29" r="1" fill="#ffffff" opacity="0.4" />
              <rect
                x="12"
                y="28"
                width="8"
                height="2"
                rx="0.5"
                fill="#ffffff"
                opacity="0.2"
              />
              <!-- 设备3 - 路由器 -->
              <rect
                x="4"
                y="36"
                width="40"
                height="4"
                rx="1"
                fill="#bf5af2"
                opacity="0.6"
              />
              <rect
                x="6"
                y="37"
                width="3"
                height="1"
                rx="0.5"
                fill="#ffffff"
                opacity="0.3"
              />
              <!-- 空U位 -->
              <rect x="4" y="44" width="40" height="8" rx="1" fill="#1c1c1e" />
              <!-- 底部通风孔 -->
              <rect x="6" y="72" width="16" height="3" rx="1" fill="#1c1c1e" />
              <rect x="26" y="72" width="16" height="3" rx="1" fill="#1c1c1e" />
              <!-- 底部支撑脚 -->
              <rect x="4" y="77" width="6" height="2" rx="1" fill="#636366" />
              <rect x="38" y="77" width="6" height="2" rx="1" fill="#636366" />
            </svg>
          </div>
          <div class="cabinet-info">
            <div class="cabinet-name">{{ cabinet.name }}</div>
            <div class="cabinet-type-badge server">
              网络机柜
            </div>
          </div>
          <div class="cabinet-actions" @click.stop>
            <el-button size="small" @click="editCabinet(cabinet)"
              >编辑</el-button
            >
            <el-button
              size="small"
              type="danger"
              @click="deleteCabinet(cabinet)"
              >删除</el-button
            >
          </div>
        </div>
        <div class="cabinet-meta">
          <span>{{ cabinet.totalU }}U 机柜</span>
          <span class="divider">·</span>
          <span>{{ getUsedU(cabinet) }}U 已用</span>
          <span class="divider">·</span>
          <span class="free-u"
            >{{ cabinet.totalU - getUsedU(cabinet) }}U 空闲</span
          >
          <div class="u-progress">
            <div
              class="u-bar"
              :style="{
                width: (getUsedU(cabinet) / cabinet.totalU) * 100 + '%',
              }"
            ></div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="empty-cabinets mac-card">
      <el-icon size="48" color="#484f58"><Box /></el-icon>
      <p>暂无机柜，点击「新建机柜」开始</p>
    </div>

    <!-- 机柜详情区 -->
    <div v-if="selectedCabinet" class="cabinet-detail-area" :class="{ 'fullscreen-mode': isFullscreen }">
      <div class="detail-toolbar">
          <div class="detail-toolbar-title">
            <el-icon><Grid /></el-icon>
            {{ selectedCabinet.name }} 详情
            <el-tag
              size="small"
              type="info"
            >
              网络机柜
            </el-tag>
            <span class="spec-info">{{ selectedCabinet.totalU }}U</span>
          </div>
          <el-button
            size="small"
            type="primary"
            @click="openMountDialog"
          >
            <el-icon><Plus /></el-icon> 上架设备
          </el-button>
        </div>

      <!-- 机柜视图 + 信息面板并列 -->
      <div class="detail-body">

        <!-- 并排画布仅渲染前 5 个机柜，超出时显式提示，避免用户误以为机柜丢失 -->
        <div v-if="hiddenCabinetCount > 0" class="rack-truncated-hint">
          共 {{ (cabinetStore.cabinets || []).length }} 个机柜，当前并排展示前 {{ MAX_DISPLAY_CABINETS }} 个；
          请在左侧机柜列表中切换以查看其余 {{ hiddenCabinetCount }} 个。
        </div>

        <!-- SVG 机柜可视化 - 高仿视图（多机柜同一画布并排，默认，完整功能：拖拽/碰撞/吸附/端口连线） -->
        <CabinetRackVisual
          v-if="displayCabinets.length > 0"
          :key="dragRefreshKey"
          :cabinet="selectedCabinet || displayCabinets[0]"
          :cabinets="displayCabinets"
          :devices="deviceStore.devices"
          :selected-device-id="selectedDeviceId"
          :interactive="true"
          :is-fullscreen="isFullscreen"
          @device-click="handleDeviceClick"
          @device-move="handleDeviceMove"
          @empty-u-click="handleUClickUnified"
          @port-click="handlePortClick"
          @power-toggle="handlePowerToggle"
          @patch-rename="handlePatchRename"
          @toggle-fullscreen="toggleFullscreen"
        />

        <!-- 机柜信息面板 -->
        <div class="rack-info-panel">
          <!-- 机柜信息概览 -->
          <div class="panel-header">
            <h3 class="panel-title">
              <el-icon><Grid /></el-icon>
              机柜详情
            </h3>
          </div>

          <div class="info-table">
            <div class="info-row">
              <span class="info-label">机柜名称</span>
              <span class="info-value">{{ selectedCabinet.name }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">机柜规格</span>
              <span class="info-value">{{ selectedCabinet.totalU }}U 标准机柜</span>
            </div>
            <div class="info-row">
              <span class="info-label">物理位置</span>
              <span class="info-value">{{ selectedCabinet.location || '未设置' }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">已用U位</span>
              <span class="info-value accent-blue">{{ getUsedU(selectedCabinet) }}U</span>
            </div>
            <div class="info-row">
              <span class="info-label">空闲U位</span>
              <span class="info-value accent-green">{{ selectedCabinet.totalU - getUsedU(selectedCabinet) }}U</span>
            </div>
            <div class="info-row">
              <span class="info-label">利用率</span>
              <span class="info-value">
                <span class="usage-bar-wrap">
                  <span class="usage-bar" :style="{ width: ringPercent + '%' }"></span>
                </span>
                <span class="usage-text">{{ ringPercent }}%</span>
              </span>
            </div>
            <div class="info-row">
              <span class="info-label">已上架设备</span>
              <span class="info-value accent-purple">{{ getMountedTotalCount(selectedCabinet) }} 台</span>
            </div>
          </div>

          <!-- 设备类型分布 -->
          <div v-if="cabinetDeviceTypes.length > 0" class="type-section">
            <div class="section-label">设备类型分布</div>
            <div class="type-chips">
              <div v-for="t in cabinetDeviceTypes" :key="t.type" class="type-chip" :class="t.type">
                <span class="chip-count">{{ t.count }}</span>
                <span class="chip-label">{{ t.label }}</span>
              </div>
            </div>
          </div>

          <!-- 已上架设备列表 -->
          <div class="device-section">
            <div class="section-header">
              <span class="section-label">已上架设备</span>
              <el-button size="small" type="primary" plain @click="openMountDialog">
                <el-icon><Plus /></el-icon> 上架
              </el-button>
            </div>
            <div class="device-list">
              <div
                v-for="device in getMountedDevices(selectedCabinet)"
                :key="device.id"
                class="device-item"
                @click="handleDeviceClick(device.id)"
              >
                <div class="device-status-dot" :class="device.status"></div>
                <div class="device-item-body">
                  <div class="device-item-name">{{ device.name }}</div>
                  <div class="device-item-meta">
                    <template v-if="device.vendor"><span>{{ device.vendor }}</span></template>
                    <template v-if="device.model"><span>{{ device.model }}</span></template>
                    <span v-if="device.ip" class="ip-badge">{{ device.ip }}</span>
                  </div>
                </div>
                <div class="device-item-u">{{ device.uSize || 1 }}U</div>
              </div>
              <div v-if="getMountedDevices(selectedCabinet).length === 0" class="empty-tip">
                <el-icon size="28" color="#c8c8cc"><Folder /></el-icon>
                <p>暂无设备</p>
                <el-button size="small" type="primary" text @click="openMountDialog">去上架</el-button>
              </div>
            </div>
          </div>
          <!-- 已安装配线设备 -->
          <div v-if="(selectedCabinet.patchItems || []).length > 0" class="device-section">
            <div class="section-header">
              <span class="section-label">配线设备</span>
            </div>
            <div class="device-list">
              <div
                v-for="item in selectedCabinet.patchItems || []"
                :key="item.id"
                class="device-item"
                @click="handlePatchItemClick(item)"
              >
                <div class="device-status-dot" :class="item.category === 'network' ? (patchDeviceStatusMap[item.deviceId] || 'offline') : 'warning'"></div>
                <div class="device-item-body">
                  <div v-if="editingPatchItemId === item.id" class="patch-name-input" @click.stop>
                    <el-input
                      v-model="patchItemNameEdit"
                      size="small"
                      placeholder="输入新名称，回车保存"
                      @keyup.enter="savePatchItemName(item)"
                      @keyup.escape="cancelEditPatchItemName"
                      @blur="savePatchItemName(item)"
                    />
                  </div>
                  <div v-else class="device-item-name">{{ item.name }}</div>
                  <div class="device-item-meta">
                    <span v-if="item.category === 'network' && getPatchItemDevice(item)">{{ getPatchItemDevice(item).ip }}</span>
                    <span v-else>{{ getPatchItemTypeName(item.category || item.itemType) }}</span>
                    <span>{{ item.uSize }}U</span>
                  </div>
                </div>
                <div class="device-item-actions" @click.stop>
                  <el-button size="small" text @click.stop="startEditPatchItemName(item)">
                    <el-icon><Edit /></el-icon>
                  </el-button>
                  <el-button size="small" type="danger" text @click.stop="removePatchItem(item.id)">下架</el-button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 端口信息浮窗 -->
    <div
      v-if="portTooltip.visible"
      class="port-tooltip"
      :style="{ top: portTooltip.y + 'px', left: portTooltip.x + 'px' }"
    >
      <div class="tooltip-title">端口 {{ portTooltip.port }}</div>
      <div v-if="portTooltip.info" class="tooltip-body">
        <div>A端: {{ portTooltip.info.from || "未连接" }}</div>
        <div>B端: {{ portTooltip.info.to || "未连接" }}</div>
        <div v-if="portTooltip.info.cable">
          线缆: {{ portTooltip.info.cable }}
        </div>
      </div>
      <div v-else class="tooltip-empty">未连接</div>
    </div>

    <!-- 新建机柜对话框 -->
    <el-dialog
      v-model="addCabinetVisible"
      :title="'新建机柜'"
      width="480px"
      class="cabinet-dialog"
    >
      <el-form :model="cabinetForm" label-width="90px" size="default">
        <el-form-item label="机柜名称" required>
          <el-input v-model="cabinetForm.name" placeholder="如: 机柜A-01" />
        </el-form-item>
        <el-form-item label="机柜U数" required>
          <el-select
            v-model="cabinetForm.totalU"
            placeholder="选择U数"
            style="width: 100%"
          >
            <el-option
              v-for="spec in rackSpecs"
              :key="spec.u"
              :label="`${spec.u}U`"
              :value="spec.u"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="位置">
          <el-input
            v-model="cabinetForm.location"
            placeholder="如: 机房A区第1排"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="cabinetForm.remark" placeholder="备注信息" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addCabinetVisible = false">取消</el-button>
        <el-button type="primary" @click="saveCabinet">创建机柜</el-button>
      </template>
    </el-dialog>

    <!-- 统一上架对话框 -->
    <el-dialog
      v-model="showUnifiedMountDialog"
      title="上架设备"
      width="560px"
      class="cabinet-dialog"
    >
      <el-tabs v-model="unifiedMountTab">
        <!-- Tab 1: 上架设备 -->
        <el-tab-pane label="上架设备" name="device">
          <el-form :model="mountForm" label-width="90px" size="default">
            <el-form-item label="选择设备" required>
              <el-select
                v-model="mountForm.deviceId"
                placeholder="选择要上架的设备"
                style="width: 100%"
                filterable
              >
                <el-option
                  v-for="d in availableDevices"
                  :key="d.id"
                  :label="`${d.name} (${d.ip}) - ${d.uSize || 1}U`"
                  :value="d.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="起始U位" required>
              <el-input-number
                v-model="mountForm.startU"
                :min="1"
                :max="selectedCabinet?.totalU || 42"
              />
              <span class="form-hint">从底部开始计算（1U在最底部）</span>
            </el-form-item>
            <div v-if="mountConflict" class="mount-conflict">
              <el-icon color="#f85149"><Warning /></el-icon>
              {{ mountConflict }}
            </div>
          </el-form>
        </el-tab-pane>

        <!-- Tab 2: 添加配线设备 -->
        <el-tab-pane label="添加配线设备" name="patch">
          <el-form :model="patchItemForm" label-width="100px" size="default">
            <el-form-item label="设备类型" required>
              <el-select
                v-model="patchItemForm.category"
                style="width: 100%"
                @change="onPatchCategoryChange"
              >
                <el-option label="网络设备（交换机/路由器）" value="network" />
                <el-option label="配线架" value="patch_panel" />
                <el-option label="理线架" value="cable_manager" />
                <el-option label="ODF框（光纤配线）" value="odf" />
                <el-option label="光纤盘" value="fiber_tray" />
              </el-select>
            </el-form-item>

            <!-- 网络设备选择 -->
            <template v-if="patchItemForm.category === 'network'">
              <el-form-item label="选择设备" required>
                <el-select
                  v-model="patchItemForm.deviceId"
                  placeholder="选择要上架的设备"
                  style="width: 100%"
                  filterable
                >
                  <el-option
                    v-for="d in availablePatchDevices"
                    :key="d.id"
                    :label="`${d.name} (${d.type || '网络设备'}) - ${d.uSize || 1}U`"
                    :value="d.id"
                  />
                </el-select>
              </el-form-item>
            </template>

            <!-- 非网络设备配置 -->
            <template v-else>
              <el-form-item label="名称" required>
                <el-input
                  v-model="patchItemForm.name"
                  placeholder="如: 配线架-01"
                />
              </el-form-item>
            </template>

            <!-- 起始U位 -->
            <el-form-item label="起始U位" required>
              <el-input-number
                v-model="patchItemForm.startU"
                :min="1"
                :max="selectedCabinet?.totalU || 42"
              />
              <span class="form-hint">从底部开始计算（1U在最底部）</span>
            </el-form-item>

            <!-- 配线架配置 -->
            <template v-if="patchItemForm.category === 'patch_panel'">
              <el-form-item label="端口数">
                <el-select v-model="patchItemForm.ports" style="width: 100%">
                  <el-option :label="'24口 (1U)'" :value="24" />
                  <el-option :label="'48口 (2U)'" :value="48" />
                </el-select>
              </el-form-item>
              <div class="info-notice">配线架占用：24口=1U，48口=2U</div>
            </template>

            <!-- ODF框配置 -->
            <template v-if="patchItemForm.category === 'odf'">
              <el-form-item label="ODF芯数">
                <el-select v-model="patchItemForm.fibers" style="width: 100%">
                  <el-option :label="'48芯 (3U)'" :value="48" />
                  <el-option :label="'72芯 (4U)'" :value="72" />
                  <el-option :label="'96芯 (5U)'" :value="96" />
                  <el-option :label="'自定义'" :value="0" />
                </el-select>
              </el-form-item>
              <el-form-item v-if="patchItemForm.fibers === 0" label="自定义芯数">
                <el-input-number
                  v-model="patchItemForm.customFibers"
                  :min="12"
                  :step="12"
                />
              </el-form-item>
              <el-form-item label="光纤接头类型">
                <el-select v-model="patchItemForm.fiberType" style="width: 100%">
                  <el-option label="SC口" value="SC" />
                  <el-option label="LC口" value="LC" />
                  <el-option label="FC口" value="FC" />
                </el-select>
              </el-form-item>
              <div class="info-notice">
                48芯子框=3U | 72芯子框=4U | 96芯子框=5U<br />
                每排12芯光纤，支持设置A端/B端连接信息
              </div>
            </template>

            <!-- 光纤盘配置 -->
            <template v-if="patchItemForm.category === 'fiber_tray'">
              <el-form-item label="芯数">
                <el-select v-model="patchItemForm.fibers" style="width: 100%">
                  <el-option :label="'12芯 (1U)'" :value="12" />
                  <el-option :label="'24芯 (1U)'" :value="24" />
                  <el-option :label="'自定义'" :value="0" />
                </el-select>
              </el-form-item>
              <el-form-item v-if="patchItemForm.fibers === 0" label="自定义芯数">
                <el-input-number
                  v-model="patchItemForm.customFibers"
                  :min="4"
                  :step="4"
                />
              </el-form-item>
              <el-form-item label="光纤接头类型">
                <el-select v-model="patchItemForm.fiberType" style="width: 100%">
                  <el-option label="SC口" value="SC" />
                  <el-option label="LC口" value="LC" />
                  <el-option label="FC口" value="FC" />
                </el-select>
              </el-form-item>
              <el-form-item label="描述">
                <el-input
                  v-model="patchItemForm.desc"
                  placeholder="如: 2号机房到3号机房"
                />
              </el-form-item>
              <div class="info-notice">
                光纤盘占用 1U，支持设置每芯光纤的A端/B端连接信息
              </div>
            </template>

            <!-- 理线架 -->
            <template v-if="patchItemForm.category === 'cable_manager'">
              <div class="info-notice">理线架占用 1U</div>
            </template>

            <div v-if="patchConflict" class="mount-conflict">
              <el-icon color="#f85149"><Warning /></el-icon>
              {{ patchConflict }}
            </div>
          </el-form>
        </el-tab-pane>
      </el-tabs>

      <!-- 对话框底部按钮 -->
      <template #footer>
        <el-button @click="showUnifiedMountDialog = false">取消</el-button>
        <template v-if="unifiedMountTab === 'device'">
          <el-button
            type="primary"
            @click="mountDevice"
            :disabled="!!mountConflict"
            >上架</el-button
          >
        </template>
        <template v-else>
          <el-button
            type="primary"
            @click="savePatchItem"
            :disabled="!!patchConflict"
            >添加</el-button
          >
        </template>
      </template>
    </el-dialog>

    <!-- 配线架端口编辑 -->
    <el-dialog
      v-model="portEditVisible"
      :title="`编辑配线架端口 - ${editingPanel?.name}`"
      width="1200px"
      class="device-panel-dialog cabinet-dialog"
      align-center
    >
      <!-- 端口可视化面板 -->
      <div class="patch-visual-panel" v-if="editingPanel">
        <div class="visual-header">
          <span class="visual-title">{{ editingPanel.name }}</span>
          <span class="visual-count">{{ editingPanel.ports }}口</span>
        </div>
        <div
          class="visual-ports-wrap"
          :class="{ 'two-row': editingPanel.ports > 24 }"
        >
          <!-- 48口：上排1-24 -->
          <template v-if="editingPanel.ports > 24">
            <div class="port-row top-row">
              <div
                v-for="p in 24"
                :key="p"
                class="visual-port"
                :class="{ connected: portEditData[p]?.connectDeviceId }"
                :title="getPatchPortTooltip(p)"
                @click="openPatchPortConnect(p)"
              >
                <div class="visual-port-icon">
                  <div class="mini-rj45">
                    <div class="mini-rj45-top"></div>
                    <div class="mini-rj45-pins">
                      <div class="pin" v-for="n in 8" :key="n"></div>
                    </div>
                    <div
                      class="mini-rj45-led"
                      :class="portEditData[p]?.connectDeviceId ? 'on' : 'off'"
                    ></div>
                  </div>
                </div>
                <div class="visual-port-num">{{ p }}</div>
              </div>
            </div>
            <div class="port-row bottom-row">
              <div
                v-for="p in editingPanel.ports - 24"
                :key="p + 24"
                class="visual-port"
                :class="{ connected: portEditData[p + 24]?.connectDeviceId }"
                :title="getPatchPortTooltip(p + 24)"
                @click="openPatchPortConnect(p + 24)"
              >
                <div class="visual-port-icon">
                  <div class="mini-rj45">
                    <div class="mini-rj45-top"></div>
                    <div class="mini-rj45-pins">
                      <div class="pin" v-for="n in 8" :key="n"></div>
                    </div>
                    <div
                      class="mini-rj45-led"
                      :class="
                        portEditData[p + 24]?.connectDeviceId ? 'on' : 'off'
                      "
                    ></div>
                  </div>
                </div>
                <div class="visual-port-num">{{ p + 24 }}</div>
              </div>
            </div>
          </template>
          <!-- 24口及以下：单排排列 -->
          <template v-else>
            <div
              v-for="p in editingPanel.ports"
              :key="p"
              class="visual-port"
              :class="{ connected: portEditData[p]?.connectDeviceId }"
              :title="getPatchPortTooltip(p)"
              @click="openPatchPortConnect(p)"
            >
              <div class="visual-port-icon">
                <div class="mini-rj45">
                  <div class="mini-rj45-top"></div>
                  <div class="mini-rj45-pins">
                    <div class="pin" v-for="n in 8" :key="n"></div>
                  </div>
                  <div
                    class="mini-rj45-led"
                    :class="portEditData[p]?.connectDeviceId ? 'on' : 'off'"
                  ></div>
                </div>
              </div>
              <div class="visual-port-num">{{ p }}</div>
            </div>
          </template>
        </div>
      </div>
      <template #footer>
        <el-button @click="portEditVisible = false">取消</el-button>
        <el-button type="primary" @click="savePortEdit">保存</el-button>
        <el-button type="primary" @click="exportPatchPanelToXlsx"
          >导出Excel</el-button
        >
        <el-button @click="importPatchPanelFromXlsx">导入Excel</el-button>
      </template>
    </el-dialog>

    <!-- 配线架端口编辑对话框 -->
    <el-dialog
      v-model="patchPortEditVisible"
      :title="`编辑端口 - 第${patchPortEditNum}口`"
      width="520px"
      class="cabinet-dialog"
    >
      <el-form label-width="90px" size="default">
        <el-form-item label="端口名称">
          <el-input
            v-model="patchPortEditForm.portName"
            placeholder="端口名称"
          />
        </el-form-item>
        <el-form-item label="A端位置">
          <el-input v-model="patchPortEditForm.from" placeholder="A端位置" />
        </el-form-item>
        <el-form-item label="B端位置">
          <div
            style="display: flex; gap: 8px; align-items: center; width: 100%"
          >
            <el-select
              v-model="patchPortEditForm.connectDeviceId"
              placeholder="选择设备"
              style="flex: 1"
              filterable
              clearable
              @change="patchPortEditForm.connectPort = ''; patchPortEditForm.cable = ''"
            >
              <el-option
                v-for="d in cabinetNetworkDevices"
                :key="d.id"
                :label="d.name + (d.ip ? ' (' + d.ip + ')' : '')"
                :value="d.id"
              />
            </el-select>
            <el-select
              v-model="patchPortEditForm.connectPort"
              placeholder="选择端口"
              style="flex: 1"
              filterable
              clearable
              :disabled="!patchPortEditForm.connectDeviceId"
              @change="patchPortEditForm.cable = ''"
            >
              <el-option
                v-for="p in getDevicePortsForPatch(
                  patchPortEditForm.connectDeviceId,
                  editingPanel?.id,
                  'patch-' + patchPortEditNum,
                  'ethernet',
                )"
                :key="p.id"
                :label="p.name || p.id"
                :value="p.id"
              />
            </el-select>
          </div>
        </el-form-item>
        <el-form-item label="线缆类型">
          <el-select
            v-model="patchPortEditForm.cable"
            placeholder="选择线缆类型"
            style="width: 100%"
            :disabled="!patchPortEditForm.connectDeviceId || !patchPortEditForm.connectPort"
          >
            <el-option
              v-for="cable in portStateStore.ETHERNET_CABLES"
              :key="cable"
              :label="cable"
              :value="cable"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="patchPortEditVisible = false">取消</el-button>
        <el-button type="primary" @click="savePatchPortEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- ODF编辑 -->
    <el-dialog
      v-model="odfEditVisible"
      :title="`编辑ODF框 - ${editingODF?.name}`"
      width="1100px"
      class="device-panel-dialog cabinet-dialog"
      align-center
    >
      <!-- 光纤芯可视化面板 -->
      <div class="odf-visual-panel" v-if="editingODF">
        <div class="visual-header">
          <span class="visual-title">{{ editingODF.name }}</span>
          <span class="visual-count"
            >{{ editingODF.fibers }}芯 ({{
              editingODF.fiberType || "SC"
            }})</span
          >
        </div>
        <div class="visual-fibers-grid">
          <div
            v-for="i in editingODF.fibers"
            :key="i"
            class="visual-fiber"
            :class="{ connected: odfEditData[i]?.to }"
            :title="getODFTooltip(i)"
            @click="openODFPortConnect(i)"
          >
            <div class="visual-fiber-icon">
              <!-- SC口图标 -->
              <img
                v-if="(editingODF.fiberType || 'SC') === 'SC'"
                src="/images/SC.png"
                alt="SC"
                class="fiber-type-icon"
              />
              <!-- LC口图标 -->
              <img
                v-else-if="editingODF.fiberType === 'LC'"
                src="/images/LC.png"
                alt="LC"
                class="fiber-type-icon"
              />
              <!-- FC口图标 -->
              <img
                v-else-if="editingODF.fiberType === 'FC'"
                src="/images/FC.png"
                alt="FC"
                class="fiber-type-icon"
              />
              <!-- 默认SC口 -->
              <img
                v-else
                src="/images/SC.png"
                alt="SC"
                class="fiber-type-icon"
              />
              <!-- 连接状态LED指示 -->
              <div
                class="fiber-led"
                :class="odfEditData[i]?.to ? 'on' : 'off'"
              ></div>
            </div>
            <div class="visual-fiber-num">{{ i }}</div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="odfEditVisible = false">取消</el-button>
        <el-button type="primary" @click="saveODFEdit">保存</el-button>
        <el-button type="primary" @click="exportODFToXlsx">导出Excel</el-button>
        <el-button @click="importODFFromXlsx">导入Excel</el-button>
      </template>
    </el-dialog>

    <!-- 光纤盘编辑 -->
    <el-dialog
      v-model="fiberTrayEditVisible"
      :title="`编辑光纤盘 - ${editingFiberTray?.name}`"
      width="1100px"
      class="device-panel-dialog cabinet-dialog"
      align-center
    >
      <!-- 光纤芯可视化面板 -->
      <div class="odf-visual-panel" v-if="editingFiberTray">
        <div class="visual-header">
          <span class="visual-title">{{ editingFiberTray.name }}</span>
          <span class="visual-count"
            >{{ editingFiberTray.fibers }}芯 ({{
              editingFiberTray.fiberType || "SC"
            }})</span
          >
        </div>
        <div class="visual-fibers-grid">
          <div
            v-for="i in editingFiberTray.fibers"
            :key="i"
            class="visual-fiber"
            :class="{ connected: fiberTrayEditData[i]?.to }"
            :title="getFiberTrayTooltip(i)"
            @click="openFiberTrayPortConnect(i)"
          >
            <div class="visual-fiber-icon">
              <!-- SC口图标 -->
              <img
                v-if="(editingFiberTray.fiberType || 'SC') === 'SC'"
                src="/images/SC.png"
                alt="SC"
                class="fiber-type-icon"
              />
              <!-- LC口图标 -->
              <img
                v-else-if="editingFiberTray.fiberType === 'LC'"
                src="/images/LC.png"
                alt="LC"
                class="fiber-type-icon"
              />
              <!-- FC口图标 -->
              <img
                v-else-if="editingFiberTray.fiberType === 'FC'"
                src="/images/FC.png"
                alt="FC"
                class="fiber-type-icon"
              />
              <!-- 默认SC口 -->
              <img
                v-else
                src="/images/SC.png"
                alt="SC"
                class="fiber-type-icon"
              />
              <!-- 连接状态LED指示 -->
              <div
                class="fiber-led"
                :class="fiberTrayEditData[i]?.to ? 'on' : 'off'"
              ></div>
            </div>
            <div class="visual-fiber-num">{{ i }}</div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="fiberTrayEditVisible = false">取消</el-button>
        <el-button type="primary" @click="saveFiberTrayEdit">保存</el-button>
        <el-button type="primary" @click="exportFiberTrayToXlsx"
          >导出Excel</el-button
        >
        <el-button @click="importFiberTrayFromXlsx">导入Excel</el-button>
      </template>
    </el-dialog>

    <!-- ODF框端口编辑对话框 -->
    <el-dialog
      v-model="odfPortEditVisible"
      :title="`ODF端口编辑 - 第${odfPortEditNum}芯`"
      width="520px"
      class="cabinet-dialog"
    >
      <el-form label-width="90px" size="default">
        <el-form-item label="端口名称">
          <el-input v-model="odfPortEditForm.portName" placeholder="端口名称" />
        </el-form-item>
        <el-form-item label="A端位置">
          <el-input
            v-model="odfPortEditForm.from"
            placeholder="A端位置（自动生成）"
          />
        </el-form-item>
        <el-form-item label="B端设备">
          <div
            style="display: flex; gap: 8px; align-items: center; width: 100%"
          >
            <el-select
              v-model="odfPortEditForm.connectDeviceId"
              placeholder="选择设备"
              style="flex: 1"
              filterable
              clearable
              @change="odfPortEditForm.connectPort = ''; odfPortEditForm.cable = ''"
            >
              <el-option
                v-for="d in cabinetNetworkDevices"
                :key="d.id"
                :label="d.name + (d.ip ? ' (' + d.ip + ')' : '')"
                :value="d.id"
              />
            </el-select>
            <el-select
              v-model="odfPortEditForm.connectPort"
              placeholder="选择端口"
              style="flex: 1"
              filterable
              clearable
              :disabled="!odfPortEditForm.connectDeviceId"
              @change="odfPortEditForm.cable = ''"
            >
              <el-option
                v-for="p in getDevicePortsForPatch(
                  odfPortEditForm.connectDeviceId,
                  editingODF?.id,
                  'fiber-' + odfPortEditNum,
                  'optical',
                )"
                :key="p.id"
                :label="p.name || p.id"
                :value="p.id"
              />
            </el-select>
          </div>
        </el-form-item>
        <el-form-item label="线缆类型">
          <el-select
            v-model="odfPortEditForm.cable"
            placeholder="选择线缆类型"
            style="width: 100%"
            :disabled="!odfPortEditForm.connectDeviceId || !odfPortEditForm.connectPort"
          >
            <el-option
              v-for="cable in portStateStore.OPTICAL_CABLES"
              :key="cable"
              :label="cable"
              :value="cable"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="odfPortEditVisible = false">取消</el-button>
        <el-button type="primary" @click="saveODFPortEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 光纤盘端口编辑对话框 -->
    <el-dialog
      v-model="fiberTrayPortEditVisible"
      :title="`光纤盘端口编辑 - 第${fiberTrayPortEditNum}芯`"
      width="520px"
      class="cabinet-dialog"
    >
      <el-form label-width="90px" size="default">
        <el-form-item label="端口名称">
          <el-input
            v-model="fiberTrayPortEditForm.portName"
            placeholder="端口名称"
          />
        </el-form-item>
        <el-form-item label="A端位置">
          <el-input
            v-model="fiberTrayPortEditForm.from"
            placeholder="A端位置（自动生成）"
          />
        </el-form-item>
        <el-form-item label="B端设备">
          <div
            style="display: flex; gap: 8px; align-items: center; width: 100%"
          >
            <el-select
              v-model="fiberTrayPortEditForm.connectDeviceId"
              placeholder="选择设备"
              style="flex: 1"
              filterable
              clearable
              @change="fiberTrayPortEditForm.connectPort = ''; fiberTrayPortEditForm.cable = ''"
            >
              <el-option
                v-for="d in cabinetNetworkDevices"
                :key="d.id"
                :label="d.name + (d.ip ? ' (' + d.ip + ')' : '')"
                :value="d.id"
              />
            </el-select>
            <el-select
              v-model="fiberTrayPortEditForm.connectPort"
              placeholder="选择端口"
              style="flex: 1"
              filterable
              clearable
              :disabled="!fiberTrayPortEditForm.connectDeviceId"
              @change="fiberTrayPortEditForm.cable = ''"
            >
              <el-option
                v-for="p in getDevicePortsForPatch(
                  fiberTrayPortEditForm.connectDeviceId,
                  editingFiberTray?.id,
                  'fiber-' + fiberTrayPortEditNum,
                  'optical',
                )"
                :key="p.id"
                :label="p.name || p.id"
                :value="p.id"
              />
            </el-select>
          </div>
        </el-form-item>
        <el-form-item label="线缆类型">
          <el-select
            v-model="fiberTrayPortEditForm.cable"
            placeholder="选择线缆类型"
            style="width: 100%"
            :disabled="!fiberTrayPortEditForm.connectDeviceId || !fiberTrayPortEditForm.connectPort"
          >
            <el-option
              v-for="cable in portStateStore.OPTICAL_CABLES"
              :key="cable"
              :label="cable"
              :value="cable"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="fiberTrayPortEditVisible = false">取消</el-button>
        <el-button type="primary" @click="saveFiberTrayPortEdit"
          >保存</el-button
        >
      </template>
    </el-dialog>

    <!-- 设备详情面板（共享组件） -->
    <DeviceDetailPanel
      v-model="devicePanelDialog"
      :device="devicePanelData"
      :panelMode="panelMode"
      @port-click="onPortClick"
      @save-port-names="savePortNames"
      @save-back-port-names="saveBackPortNames"
      @toggle-panel-mode="togglePanelMode"
      @show-real-panel="openRealPanel"
    />

    <!-- 真实设备面板放大预览（面板上的网口/光口可直接点击连线） -->
    <el-dialog
      v-model="realPanelVisible"
      :title="(realPanelDevice?.name || '设备') + ' - 真实面板'"
      width="900px"
      align-center
      class="real-panel-dialog"
    >
      <RealDevicePanel
        v-if="realPanelDevice"
        :device="realPanelDevice"
        @port-click="onRealPanelPortClick"
      />
      <template #footer>
        <el-button @click="switchRealToZoom">查看绘制面板</el-button>
        <el-button type="primary" @click="realPanelVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 设备面板放大预览 -->
    <DevicePanelZoom
      v-model:visible="zoomVisible"
      :device="zoomDeviceData"
      @port-click="handlePortClick"
      @power-toggle="handlePowerToggle"
      @patch-rename="handlePatchRename"
      @unmount="handleZoomUnmount"
      @rename="handleZoomRename"
    />

    <!-- 端口连线对话框 - 全局端口状态管理器版本 -->
    <el-dialog
      v-model="portConnectVisible"
      :title="portConnectForm.occupied 
        ? `连接信息 - ${connectingPortName}` 
        : `创建连线 - ${connectingPortName}`"
      width="520px"
      class="cabinet-dialog"
      align-center
    >
      <!-- 已占用端口：显示当前连接信息 -->
      <template v-if="portConnectForm.occupied">
        <div class="occupied-port-info">
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="本端设备">{{ portConnectForm.deviceName || '未知' }}</el-descriptions-item>
            <el-descriptions-item label="本端型号">{{ portConnectForm.deviceModel || '未知' }}</el-descriptions-item>
            <el-descriptions-item label="本端 IP">{{ portConnectForm.deviceIp || '未知' }}</el-descriptions-item>
            <el-descriptions-item label="本端位置">{{ portConnectForm.deviceLocation || '未上架' }}</el-descriptions-item>
            <el-descriptions-item label="本端端口">{{ connectingPortName }}（{{ portConnectForm.portType === 'optical' ? '光口' : '网口' }}）</el-descriptions-item>
            <el-descriptions-item label="对端设备">{{ portConnectForm.remoteDeviceName || '未知' }}</el-descriptions-item>
            <el-descriptions-item label="对端型号">{{ portConnectForm.remoteDeviceModel || '未知' }}</el-descriptions-item>
            <el-descriptions-item label="对端 IP">{{ portConnectForm.remoteDeviceIp || '未知' }}</el-descriptions-item>
            <el-descriptions-item label="对端位置">{{ portConnectForm.remoteDeviceLocation || '未上架' }}</el-descriptions-item>
            <el-descriptions-item label="对端端口">{{ portConnectForm.remotePortName || '未知' }}</el-descriptions-item>
            <el-descriptions-item label="线缆类型">{{ portConnectForm.existingCableType || '未指定' }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ portConnectForm.createdAt || '未知' }}</el-descriptions-item>
          </el-descriptions>
        </div>
      </template>

      <!-- 可用端口：创建新连接 -->
      <template v-else>
        <el-form label-width="90px" size="default">
          <el-form-item label="本端端口">
            <el-input v-model="portConnectForm.localPortName" placeholder="本端端口名称（可修改）" clearable />
          </el-form-item>
          <el-form-item label="本端类型">
            <el-tag :type="portConnectForm.portType === 'optical' ? 'warning' : ''" size="small">
              {{ portConnectForm.portType === 'ethernet' ? '网口 (RJ45)' : '光口 (Fiber)' }}
            </el-tag>
          </el-form-item>
          <!-- B端位置：选择设备 + 选择端口（级联） -->
          <el-form-item label="选择设备" required>
            <el-select
              v-model="portConnectForm.targetDeviceId"
              placeholder="选择设备"
              style="width: 100%"
              filterable
              @change="portConnectForm.targetPortId = ''"
            >
              <el-option-group
                v-for="g in availableTargetDeviceGroups"
                :key="g.cabinetName"
                :label="`${g.cabinetName}（${g.devices.length}台设备）`"
              >
                <el-option
                  v-for="d in g.devices"
                  :key="d.deviceId"
                  :label="formatDeviceOptionLabel(d)"
                  :value="d.deviceId"
                >
                  <span>{{ d.deviceName }}</span>
                  <template v-if="d.deviceModel || d.uPosition">
                    <span style="color: var(--text-muted); font-size: 12px; margin-left: 6px;">
                      {{ d.deviceModel }}<template v-if="d.uPosition"> · {{ d.uPosition }}</template>
                    </span>
                  </template>
                </el-option>
              </el-option-group>
            </el-select>
          </el-form-item>
          <el-form-item label="选择端口" required>
            <el-select
              v-model="portConnectForm.targetPortId"
              placeholder="选择端口"
              style="width: 100%"
              filterable
              :disabled="!portConnectForm.targetDeviceId"
            >
              <el-option
                v-for="ap in targetDevicePorts"
                :key="ap.portId"
                :label="ap.portName || ap.portId"
                :value="ap.portId"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="线缆类型" required>
            <el-select
              v-model="portConnectForm.cableType"
              placeholder="选择线缆类型"
              style="width: 100%"
            >
              <el-option
                v-for="cable in availableCableOptions"
                :key="cable"
                :label="cable"
                :value="cable"
              />
            </el-select>
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button @click="portConnectVisible = false">取消</el-button>
        <el-button
          type="danger"
          v-if="portConnectForm.occupied"
          @click="doDisconnectPort"
        >断开连接</el-button>
        <el-button
          type="primary"
          v-if="!portConnectForm.occupied"
          @click="doConnectPort"
          :disabled="!portConnectForm.targetDeviceId || !portConnectForm.targetPortId || !portConnectForm.cableType"
        >创建连接</el-button>
      </template>
    </el-dialog>

    <!-- 配线架端口批量命名：输入后按 Tab 保存并跳转下一个端口 -->
    <el-dialog
      v-model="patchRenameVisible"
      title="配线架端口批量命名"
      width="420px"
      class="cabinet-dialog"
      align-center
      :close-on-click-modal="false"
      @closed="savePatchRename"
    >
      <div style="text-align:center">
        <div style="margin-bottom:12px;color:var(--text-muted);font-size:13px">
          正在编辑端口 <b>{{ patchRenamePort }}</b> / {{ patchRenameTotal }}
        </div>
        <div style="margin-bottom:12px;color:var(--text-muted);font-size:12px">
          输入端口名称后按 <b>Tab</b> 或 <b>回车</b> 保存并跳转到下一个端口，ESC 关闭
        </div>
        <el-input
          id="patch-rename-input"
          v-model="patchRenameValue"
          placeholder="输入端口名称"
          clearable
          @keydown.tab.prevent="patchRenameNext"
          @keydown.enter.prevent="patchRenameNext"
        />
      </div>
      <template #footer>
        <el-button @click="patchRenameDone">完成</el-button>
      </template>
    </el-dialog>

    <!-- 端口连线操作弹窗：上半部分显示对端信息，下半部分取消连线/更改连线 -->
    <el-dialog
      title="端口连线信息"
      v-model="editConnectionVisible"
      width="480px"
      align-center
    >
      <div class="connection-info-panel">
        <el-descriptions :column="1" border size="default">
          <el-descriptions-item label="对端设备">
            {{ editConnectionData.remoteDeviceName || '未知设备' }}
          </el-descriptions-item>
          <el-descriptions-item label="对端端口">
            {{ editConnectionData.remotePortNum || '未知端口' }}
          </el-descriptions-item>
          <el-descriptions-item label="对端机柜">
            {{ editConnectionData.remoteCabinetName || '未入柜' }}
          </el-descriptions-item>
          <el-descriptions-item label="对端U位">
            {{ editConnectionData.remoteUPosition || '未入柜' }}
          </el-descriptions-item>
          <el-descriptions-item label="线缆类型">
            {{ editConnectionData.cableType || '未指定' }}
          </el-descriptions-item>
        </el-descriptions>
      </div>
      <template #footer>
        <el-button type="danger" @click="disconnectConnection">取消连线</el-button>
        <el-button type="primary" @click="changeConnection">更改连线</el-button>
      </template>
    </el-dialog>
    </PageLayout>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useCabinetStore, useDeviceStore, useDeviceLibStore } from '../../stores'
import { usePortStateStore } from '../../stores/portState'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import DeviceDetailPanel from '../../components/DeviceDetailPanel.vue'
import RealDevicePanel from '../../components/RealDevicePanel.vue'
import CabinetRackVisual from '../../components/cabinet/CabinetRackVisual.vue'
import DevicePanelZoom from '../../components/cabinet/DevicePanelZoom.vue'
import { addLog, LogType, LogResult } from '../../composables/useOperationLog.js'
import { resolvePortName, standardPortName } from '../../utils/portNaming.js'
import PageLayout from '../../components/PageLayout.vue'

// 标准机柜规格
const rackSpecs = [
  { u: 6, height: '355mm', note: '小型壁挂机柜' },
  { u: 12, height: '666mm', note: '中型机柜' },
  { u: 18, height: '978mm', note: '标准18U机柜' },
  { u: 24, height: '1200mm', note: '24U机柜' },
  { u: 27, height: '1343mm', note: '27U机柜' },
  { u: 32, height: '1577mm', note: '32U机柜' },
  { u: 37, height: '1811mm', note: '37U机柜' },
  { u: 42, height: '2045mm', note: '标准42U机柜' },
  { u: 45, height: '2180mm', note: '45U机柜' },
  { u: 47, height: '2275mm', note: '47U机柜' },
  { u: 48, height: '2320mm', note: '48U机柜' },
  { u: 52, height: '2505mm', note: '52U机柜' }
]

const cabinetStore = useCabinetStore()
const deviceStore = useDeviceStore()
const deviceLibStore = useDeviceLibStore()
const portStateStore = usePortStateStore()

// 从 portStateStore 派生指定设备的连接（替代旧拓扑 store 的 getDeviceConnections）
// 新版拓扑的连线完全派生自 portStateStore.getAllConnections()，不再维护旧拓扑 store
function getDeviceConnections(deviceId) {
  if (!deviceId) return []
  return portStateStore.getAllConnections()
    .filter(c => c.sourceDeviceId === deviceId || c.targetDeviceId === deviceId)
    .map(c => {
      const isSource = c.sourceDeviceId === deviceId
      const localPortId = isSource ? c.sourcePortId : c.targetPortId
      const remotePortId = isSource ? c.targetPortId : c.sourcePortId
      const remoteDeviceId = isSource ? c.targetDeviceId : c.sourceDeviceId
      return {
        edgeId: c.id,
        localPort: shortPortId(localPortId),
        remotePort: shortPortId(remotePortId),
        remoteDeviceId,
        remoteNodeId: remoteDeviceId,
        target: remoteDeviceId,
        targetPort: shortPortId(remotePortId),
        targetLabel: '',
        linkType: c.isOptical ? 'fiber' : 'copper',
        cableType: c.cableType || '',
        speed: '',
        fiberMode: '',
        connType: '',
        label: '',
        animated: true
      }
    })
}

function shortPortId(fullId) {
  if (!fullId) return ''
  const parts = String(fullId).split('-')
  if (parts.length >= 3 && parts[parts.length - 2] === 'patch') {
    return 'patch-' + parts[parts.length - 1]
  }
  return parts[parts.length - 1]
}
const selectedCabinet = ref(null)
const selectedDeviceId = ref(null)
const dragRefreshKey = ref(0)
const isFullscreen = ref(false)

// 同一画布并排展示的机柜（单画布最多 5 个，超出部分以提示告知，避免被误认为「机柜丢失」）
const MAX_DISPLAY_CABINETS = 5
const displayCabinets = computed(() => {
  return (cabinetStore.cabinets || []).slice(0, MAX_DISPLAY_CABINETS)
})
const hiddenCabinetCount = computed(() => {
  return Math.max(0, (cabinetStore.cabinets || []).length - displayCabinets.value.length)
})

// 柜数据就绪且尚未选中任何柜时，默认选中第一个柜，确保并排可视化常驻显示
watch(
  () => (cabinetStore.cabinets || []).length,
  (n) => {
    if (n > 0 && !selectedCabinet.value) {
      selectedCabinet.value = cabinetStore.cabinets[0]
    }
  },
  { immediate: true }
)

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
  // 全屏切换后强制重新渲染 CabinetRackVisual，触发 fitToScreen 适应新尺寸
  nextTick(() => {
    dragRefreshKey.value++
  })
}

function handleEscKeydown(e) {
  if (e.key === 'Escape' && isFullscreen.value) {
    isFullscreen.value = false
    nextTick(() => {
      dragRefreshKey.value++
    })
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleEscKeydown)
  // 历史连接快照修复：旧版本连线时 portNum 存的是数字端口号，
  // 按当前端口自定义名/标准命名规则重写，保证悬停与连线信息显示正确
  try {
    // 修复属后台自愈逻辑，无需向控制台输出；异常仍按 warn 记录便于排查
    portStateStore.repairConnectionPortNames(deviceStore.devices)
  } catch (e) {
    console.warn('[CabinetsView] 连接端口名快照修复失败', e)
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleEscKeydown)
})
const addCabinetVisible = ref(false)
const portEditVisible = ref(false)
const editConnectionVisible = ref(false)
const editConnectionData = ref({})
const odfEditVisible = ref(false)
const portTooltip = ref({ visible: false, x: 0, y: 0, port: null, info: null })
const editingPanel = ref(null)
const editingODF = ref(null)
const portEditData = ref({})
const odfEditData = ref({})
const fiberTrayEditVisible = ref(false)
const editingFiberTray = ref(null)
const fiberTrayEditData = ref({})
const isEditCabinet = ref(false)
const editCabinetId = ref(null)

// 端口连线对话框
const portConnectVisible = ref(false)
const connectingPort = ref(null)

// 配线架端口编辑对话框
const patchPortEditVisible = ref(false)
const patchPortEditNum = ref(0)
const patchPortEditForm = ref({
  portName: '',
  from: '',
  connectDeviceId: '',
  connectPort: '',
  cable: ''
})

// 配线架/理线架名称编辑
const editingPatchItemId = ref(null)
const patchItemNameEdit = ref('')

// ODF框端口编辑对话框
const odfPortEditNum = ref(0)
const odfPortEditForm = ref({
  portName: '',
  from: '',
  connectDeviceId: '',
  connectPort: '',
  cable: ''
})
const odfPortEditVisible = ref(false)

// 光纤盘端口编辑对话框
const fiberTrayPortEditNum = ref(0)
const fiberTrayPortEditForm = ref({
  portName: '',
  from: '',
  connectDeviceId: '',
  connectPort: '',
  cable: ''
})
const fiberTrayPortEditVisible = ref(false)

// 设备前面板对话框
const devicePanelDialog = ref(false)
const devicePanelData = ref(null)
const devicePanelPorts = ref([])
const panelMode = ref('back') // 'front' | 'back'，默认后面板
const portEditMode = ref(false)
const portNameEdits = ref({})

// 设备面板放大预览
const zoomVisible = ref(false)
const zoomDeviceData = ref(null)

// 真实设备面板（nVisual 图片面板）放大预览
const realPanelVisible = ref(false)
const realPanelDevice = ref(null)
function openRealPanel(device) {
  if (!device) return
  realPanelDevice.value = device
  realPanelVisible.value = true
}

// 从真实面板切换到绘制面板放大视图
function switchRealToZoom() {
  if (realPanelDevice.value) {
    zoomDeviceData.value = realPanelDevice.value
    realPanelVisible.value = false
    zoomVisible.value = true
  }
}

// ===== 面板上的端口点击（图片热点 / 绘制端口统一入口）=====
// 点击面板上的网口/光口 → 归一化端口 ID 后打开连线对话框
function onRealPanelPortClick(port) {
  const dev = realPanelDevice.value
  if (!dev) return
  const rawId = port.portId || port.id
  const portId = portStateStore.inferPortId(rawId) || rawId
  openPortConnect({
    id: portId,
    deviceId: dev.id,
    deviceName: dev.name || '',
    portType: port.portType || 'ethernet',
    portNum: port.portNum,
    name: port.label || portId
  })
}

// 后面板端口名称编辑
const backPortEditMode = ref(false)
const backPortNameEdits = ref({})

// 是否为服务器设备

// 设备是否有前面板端口

// 切换面板模式
function togglePanelMode(mode) {
  panelMode.value = mode
}

// 后面板管理端口

// 后面板电源模块

// 后面板网络端口（RJ45）

// 后面板光口（SFP）

const cabinetForm = ref({ name: '', totalU: 42, location: '', remark: '', type: 'server' })
const mountForm = ref({ deviceId: '', startU: 1 })
const patchItemForm = ref({ category: 'network', deviceId: '', itemType: 'patch_panel', name: '', ports: 24, fibers: 48, customFibers: 12, desc: '', startU: 1, fiberType: 'SC' })

const cabinetStats = computed(() => [
  { value: cabinetStore.cabinets.length, label: '机柜总数' },
  { value: cabinetStore.cabinets.reduce((s, c) => s + c.totalU, 0), label: '总U位' },
  { value: cabinetStore.cabinets.reduce((s, c) => s + getUsedU(c), 0), label: '已用U位' },
  { value: cabinetStore.cabinets.reduce((s, c) => s + (c.totalU - getUsedU(c)), 0), label: '空余U位' }
])

// 选中机柜的设备类型分布统计
const cabinetDeviceTypes = computed(() => {
  const cab = selectedCabinet.value
  if (!cab) return []
  const devices = getMountedDevices(cab)
  const typeMap = {}
  devices.forEach(d => {
    const type = d.type || 'other'
    if (!typeMap[type]) typeMap[type] = { type, label: getDeviceTypeLabel(type), count: 0 }
    typeMap[type].count++
  })
  return Object.values(typeMap).sort((a, b) => b.count - a.count)
})

function getDeviceTypeLabel(type) {
  const labels = {
    switch: '交换机',
    router: '路由器',
    firewall: '防火墙',
    server: '服务器',
    storage: '存储',
    kvm: 'KVM',
    pdu: 'PDU',
    other: '其他'
  }
  return labels[type] || type
}

const ringPercent = computed(() => {
  const cab = selectedCabinet.value
  if (!cab) return 0
  return Math.round((getUsedU(cab) / cab.totalU) * 100)
})

const ringDashArray = computed(() => {
  const circumference = 2 * Math.PI * 40 // radius=40
  const used = circumference * ringPercent.value / 100
  return `${used} ${circumference}`
})

function getTypeIcon(type) {
  const icons = {
    switch: '⇄',
    router: '⬡',
    firewall: '⊞',
    server: '⊡',
    storage: '▤',
    kvm: '⌨',
    pdu: '⚡',
    other: '●'
  }
  return icons[type] || '●'
}

function getUsedU(cabinet) {
  if (!cabinet) return 0
  let used = 0
  // 计算 slots 中上架设备的U数
  if (cabinet.slots) {
    const counted = new Set()
    Object.entries(cabinet.slots).forEach(([u, deviceId]) => {
      if (!deviceId || counted.has(deviceId)) return
      counted.add(deviceId)
      const d = deviceStore.devices.find(dev => dev.id === deviceId)
      used += d?.uSize || 1
    })
  }
  // 计算 patchItems 的U数（所有机柜都支持）
  if (cabinet.patchItems) {
    used += cabinet.patchItems.reduce((sum, item) => sum + (item.uSize || 1), 0)
  }
  return used
}

function getMountedTotalCount(cabinet) {
  if (!cabinet) return 0
  return getMountedDevices(cabinet).length + (cabinet.patchItems || []).length
}

// 获取机柜中已上架的设备列表（去重，并按U位从高到低排序）
function getMountedDevices(cabinet) {
  if (!cabinet?.slots) return []
  const deviceIds = new Set(Object.values(cabinet.slots).filter(Boolean))
  const devices = []
  deviceIds.forEach(id => {
    const d = deviceStore.devices.find(dev => dev.id === id)
    if (d) {
      // 找到设备的起始U位（slots key 中最小的 parseFloat 值）
      let startU = Infinity
      Object.entries(cabinet.slots).forEach(([u, slotDeviceId]) => {
        if (slotDeviceId === id) {
          const n = parseFloat(u)
          if (n < startU) startU = n
        }
      })
      // 设备范围是 [startU, startU + uSize)
      const uSize = d.uSize || 1
      d._maxU = startU + uSize - 1/3
      d._startU = startU
      devices.push(d)
    }
  })
  // 按最高U位从高到低排序（大的在上方先渲染）
  devices.sort((a, b) => b._maxU - a._maxU)
  return devices
}

// 获取某个U位占用的设备（考虑 1/3U 精度的范围检查）
function getSlotDevice(u) {
  const slots = selectedCabinet.value?.slots || {}
  const un = parseFloat(u)
  // 直接命中
  if (slots[u]) {
    const d = deviceStore.devices.find(d => d.id === slots[u])
    if (d) return d
  }
  // 遍历设备，检查 u 是否落在设备占用范围 [startU, startU + uSize) 内
  const seen = new Set()
  for (const [key, deviceId] of Object.entries(slots)) {
    if (!deviceId || seen.has(deviceId)) continue
    seen.add(deviceId)
    const d = deviceStore.devices.find(dev => dev.id === deviceId)
    if (!d) continue
    const startU = parseFloat(key)
    const uSize = d.uSize || 1
    if (un >= startU - 0.001 && un < startU + uSize) {
      return d
    }
  }
  return null
}

const availableDevices = computed(() => {
  const mounted = new Set(Object.values(selectedCabinet.value?.slots || {}))
  return deviceStore.devices.filter(d => !mounted.has(d.id))
})

// 配线机柜可用的网络设备（全局排除已在任何机柜上架的设备）
const availablePatchDevices = computed(() => {
  const mounted = new Set()
  // 遍历所有机柜，收集已上架的设备ID
  cabinetStore.cabinets.forEach(cabinet => {
    // 服务器机柜 slots
    if (cabinet.slots) {
      Object.values(cabinet.slots).forEach(deviceId => {
        if (deviceId) mounted.add(deviceId)
      })
    }
    // 机柜 patchItems 中的网络设备
    if (cabinet.patchItems) {
      cabinet.patchItems.forEach(item => {
        if (item.category === 'network' && item.deviceId) {
          mounted.add(item.deviceId)
        }
      })
    }
  })
  // 返回未在任何机柜上架的设备
  return deviceStore.devices.filter(d => !mounted.has(d.id))
})

const mountConflict = computed(() => {
  if (!mountForm.value.deviceId || !mountForm.value.startU) return null
  const device = deviceStore.devices.find(d => d.id === mountForm.value.deviceId)
  if (!device) return null
  const uSize = device.uSize || 1
  const start = mountForm.value.startU
  const end = start + uSize - 1/3
  const total = selectedCabinet.value?.totalU || 42
  if (start < 1 || end > total + 0.0001) return `设备占用 ${uSize}U，超出机柜范围（1U-${total}U）`
  const slots = selectedCabinet.value?.slots || {}
  // 以 1/3U 步长检查范围重叠
  const step = 1 / 3
  for (let u = start; u <= end + 0.0001; u += step) {
    const uc = Math.round(u * 3) / 3
    if (slots[uc] || slots[String(uc)]) {
      const occupying = deviceStore.devices.find(d => d.id === (slots[uc] || slots[String(uc)]))
      return `U${uc} 已被「${occupying?.name || '未知设备'}」占用`
    }
  }
  // 基于设备占用范围做精确碰撞检查（范围 [s, s+uSize)）
  const existingDevices = new Set(Object.values(slots).filter(Boolean))
  for (const existingId of existingDevices) {
    const eDevice = deviceStore.devices.find(d => d.id === existingId)
    const eSize = eDevice?.uSize || 1
    // 找到现有设备的 startU（slots 中该设备对应的最小 key）
    let eStart = Infinity
    Object.entries(slots).forEach(([k, id]) => {
      if (id === existingId) {
        const n = parseFloat(k)
        if (n < eStart) eStart = n
      }
    })
    if (eStart === Infinity) continue
    const eEnd = eStart + eSize - 1/3
    if (!(end < eStart - 0.0001 || start > eEnd + 0.0001)) {
      return `U${Math.max(start, eStart).toFixed(2)}-U${Math.min(end, eEnd).toFixed(2)} 已被「${eDevice?.name || '未知设备'}」占用`
    }
  }
  // 检查patchItems冲突
  const items = selectedCabinet.value?.patchItems || []
  for (const item of items) {
    const itemStart = item.startU || 1
    const itemEnd = itemStart + (item.uSize || 1) - 1/3
    if (!(end < itemStart - 0.0001 || start > itemEnd + 0.0001)) {
      return `U${Math.max(start, itemStart).toFixed(2)}-U${Math.min(end, itemEnd).toFixed(2)} 已被「${item.name}」占用`
    }
  }
  return null
})

// 上架配线设备的冲突检测
const patchConflict = computed(() => {
  if (!patchItemForm.value.startU) return null
  const total = selectedCabinet.value?.totalU || 42

  // Helper: 基于 slots 范围检查冲突（1/3U 精度）
  function checkSlotsRange(start, end, deviceIdToSkip) {
    const slots = selectedCabinet.value?.slots || {}
    const existing = new Set(Object.values(slots).filter(Boolean))
    for (const existingId of existing) {
      if (deviceIdToSkip && existingId === deviceIdToSkip) continue
      const eDevice = deviceStore.devices.find(d => d.id === existingId)
      const eSize = eDevice?.uSize || 1
      let eStart = Infinity
      Object.entries(slots).forEach(([k, id]) => {
        if (id === existingId) {
          const n = parseFloat(k)
          if (n < eStart) eStart = n
        }
      })
      if (eStart === Infinity) continue
      const eEnd = eStart + eSize - 1/3
      if (!(end < eStart - 0.0001 || start > eEnd + 0.0001)) {
        return `U${Math.max(start, eStart).toFixed(2)}-U${Math.min(end, eEnd).toFixed(2)} 已被「${eDevice?.name || '未知设备'}」占用`
      }
    }
    return null
  }

  if (patchItemForm.value.category === 'network') {
    const device = deviceStore.devices.find(d => d.id === patchItemForm.value.deviceId)
    if (!device) return null
    const uSize = device.uSize || 1
    const start = patchItemForm.value.startU
    const end = start + uSize - 1/3
    if (start < 1 || end > total + 0.0001) return `设备占用 ${uSize}U，超出机柜范围（1U-${total}U）`
    const slotResult = checkSlotsRange(start, end, device.id)
    if (slotResult) return slotResult
    const items = selectedCabinet.value?.patchItems || []
    for (const item of items) {
      const itemStart = item.startU || 1
      const itemEnd = itemStart + (item.uSize || 1) - 1/3
      if (!(end < itemStart - 0.0001 || start > itemEnd + 0.0001)) {
        return `U${Math.max(start, itemStart).toFixed(2)}-U${Math.min(end, itemEnd).toFixed(2)} 已被「${item.name}」占用`
      }
    }
  } else {
    let uSize = 1
    if (patchItemForm.value.category === 'patch_panel') uSize = patchItemForm.value.ports === 48 ? 2 : 1
    else if (patchItemForm.value.category === 'odf') {
      const fibers = patchItemForm.value.fibers === 0 ? patchItemForm.value.customFibers : patchItemForm.value.fibers
      if (fibers <= 48) uSize = 3
      else if (fibers <= 72) uSize = 4
      else if (fibers <= 96) uSize = 5
      else uSize = Math.ceil(fibers / 12)
    }
    const start = patchItemForm.value.startU
    const end = start + uSize - 1/3
    if (start < 1 || end > total + 0.0001) return `占用 ${uSize}U，超出机柜范围（1U-${total}U）`
    const slotResult = checkSlotsRange(start, end)
    if (slotResult) return slotResult
    const items = selectedCabinet.value?.patchItems || []
    for (const item of items) {
      const itemStart = item.startU || 1
      const itemEnd = itemStart + (item.uSize || 1) - 1/3
      if (!(end < itemStart - 0.0001 || start > itemEnd + 0.0001)) {
        return `U${Math.max(start, itemStart).toFixed(2)}-U${Math.min(end, itemEnd).toFixed(2)} 已被「${item.name}」占用`
      }
    }
  }
  return null
})

function mountDevice() {
  if (mountConflict.value) return
  const device = deviceStore.devices.find(d => d.id === mountForm.value.deviceId)
  if (!device) return

  // 检查设备是否已在其他机柜上架
  for (const cabinet of cabinetStore.cabinets) {
    if (cabinet.id === selectedCabinet.value.id) continue
    const existingSlots = cabinet.slots || {}
    const isMounted = Object.values(existingSlots).includes(device.id)
    if (isMounted) {
      ElMessage.error(`设备「${device.name}」已在机柜「${cabinet.name}」中上架，请先下架后再操作`)
      return
    }
    // 配线机柜中也可能上架了该设备
    const patchItems = cabinet.patchItems || []
    const inPatchItem = patchItems.find(item => item.category === 'network' && item.deviceId === device.id)
    if (inPatchItem) {
      ElMessage.error(`设备「${device.name}」已在机柜「${cabinet.name}」中上架，请先下架后再操作`)
      return
    }
  }

  const uSize = device.uSize || 1
  const start = mountForm.value.startU
  // 先清除此设备的所有旧key（兼容旧多key数据）
  const slots = { ...(selectedCabinet.value.slots || {}) }
  Object.keys(slots).forEach(k => {
    if (slots[k] === device.id) delete slots[k]
  })
  // 写入一个key = startU，value = device.id（支持 1/3U 精度）
  const startKey = String(Math.round(start * 3) / 3)
  slots[startKey] = device.id

  const cabinetId = selectedCabinet.value.id
  cabinetStore.updateCabinet(cabinetId, { slots })
  // 强制刷新 selectedCabinet 以更新 UI
  nextTick(() => {
    selectedCabinet.value = cabinetStore.cabinets.find(c => c.id === cabinetId)
  })
  showUnifiedMountDialog.value = false
  mountForm.value = { deviceId: '', startU: 1 }
  // 上架后默认开机状态
  deviceStore.setDeviceStatus(device.id, 'online')
  ElMessage.success(`设备「${device.name}」已上架至 ${startKey}U 位置（${uSize}U）`)
  addLog({ type: 'device', detail: `上架设备：${device.name} 到机柜 ${selectedCabinet.value.name}`, result: 'success', device: device.name })
}

async function unmountDevice(deviceIdOrU) {
  // 兼容旧调用：若传入U位置，则通过该位置找到 deviceId
  const slots = selectedCabinet.value?.slots || {}
  let deviceId = null
  if (slots[deviceIdOrU]) {
    deviceId = slots[deviceIdOrU]
  } else {
    // 传入的可能已经是 deviceId
    deviceId = Object.values(slots).includes(deviceIdOrU) ? deviceIdOrU : null
  }
  // 最后尝试：遍历所有key找到匹配值
  if (!deviceId) {
    const found = Object.entries(slots).find(([k, v]) => v === deviceIdOrU || parseFloat(k) === Number(deviceIdOrU))
    if (found) deviceId = found[1]
  }
  if (!deviceId) return

  const device = deviceStore.devices.find(d => d.id === deviceId)

  // 检查设备是否有活跃端口连接
  if (device) {
    const occupiedPorts = portStateStore.getOccupiedPorts(device.id)
    if (occupiedPorts.length > 0) {
      try {
        await ElMessageBox.confirm(
          `设备「${device.name}」当前有 ${occupiedPorts.length} 个端口处于连接状态，下架后这些连接将被断开。确定下架吗？`,
          '下架确认',
          { type: 'warning', confirmButtonText: '确定下架', cancelButtonText: '取消' }
        )
      } catch { return }
      occupiedPorts.forEach(p => {
        portStateStore.disconnectDevicePort(device.id, p.portId.replace(device.id + '-', ''))
      })
    }
  }

  // 清除所有指向该 deviceId 的 slot keys（兼容多key和单key模式）
  const newSlots = { ...slots }
  Object.keys(newSlots).forEach(k => {
    if (newSlots[k] === deviceId) delete newSlots[k]
  })
  const cabinetId = selectedCabinet.value.id
  cabinetStore.updateCabinet(cabinetId, { slots: newSlots })
  nextTick(() => {
    selectedCabinet.value = cabinetStore.cabinets.find(c => c.id === cabinetId)
    ElMessage.success(`设备「${device?.name || ''}」已下架`)
    addLog({ type: 'unmount', detail: `下架设备：${device?.name || ''} 从机柜 ${selectedCabinet.value?.name || ''}`, result: 'success', device: device?.name || '' })
  })
}

// 配线机柜相关方法
function getPatchItemAtU(u) {
  const items = selectedCabinet.value?.patchItems || []
  const un = parseFloat(u)
  for (const item of items) {
    const startU = item.startU || 1
    const uSize = item.uSize || 1
    const endU = startU + uSize - 1/3
    if (un >= startU - 0.001 && un <= endU + 0.001) return item
  }
  return null
}

function isPatchItemStart(u) {
  const items = selectedCabinet.value?.patchItems || []
  // 在倒序显示（top-down）的机柜视图中，设备块应在其占用U位的顶部（最高U号，即endU）显示
  return items.some(item => {
    const startU = item.startU || 1
    const endU = startU + (item.uSize || 1) - 1
    return endU === u
  })
}

function getPatchItemTypeName(type) {
  const names = {
    network: '网络设备',
    patch_panel: '配线架',
    cable_manager: '理线架',
    odf: 'ODF框',
    fiber_tray: '光纤盘'
  }
  return names[type] || type
}

// 开始编辑配线架/理线架名称
function startEditPatchItemName(item) {
  editingPatchItemId.value = item.id
  patchItemNameEdit.value = item.name || ''
  nextTick(() => {
    const input = document.querySelector('.patch-name-input input')
    if (input) input.focus()
  })
}

// 取消编辑配线架/理线架名称（Esc）
function cancelEditPatchItemName() {
  editingPatchItemId.value = null
  patchItemNameEdit.value = ''
}

// 保存配线架/理线架名称
function savePatchItemName(item) {
  if (editingPatchItemId.value !== item.id) return
  const newName = patchItemNameEdit.value.trim()
  if (newName && newName !== item.name) {
    const items = (selectedCabinet.value.patchItems || []).map(i =>
      i.id === item.id ? { ...i, name: newName } : i
  )
    cabinetStore.updateCabinet(selectedCabinet.value.id, { patchItems: items })
    nextTick(() => {
      selectedCabinet.value = cloneCabinetById(selectedCabinet.value.id)
    })
    ElMessage.success('名称已更新')
  }
  editingPatchItemId.value = null
  patchItemNameEdit.value = ''
}

// 获取配线机柜中网络设备的详细信息
function getPatchItemDevice(item) {
  if (item?.category === 'network' && item?.deviceId) {
    return deviceStore.devices.find(d => d.id === item.deviceId) || null
  }
  return null
}

// 所有上架设备的状态映射（响应式）
const patchDeviceStatusMap = computed(() => {
  const map = {}
  // 强制追踪所有设备的状态变化
  const allDevices = deviceStore.devices || []
  allDevices.forEach(d => { if (d?.id) map[d.id] = d.status || 'offline' })
  return map
})

function getPatchUsedU() {
  const items = selectedCabinet.value?.patchItems || []
  return items.reduce((sum, item) => sum + (item.uSize || 1), 0)
}

// 处理配线机柜中设备的点击（显示设备前面板）
function handlePatchItemClick(item) {
  if (item?.category === 'network' && item?.deviceId) {
    // 网络设备，显示放大面板
    handleDeviceClick(item.deviceId)
  } else if (item?.itemType === 'patch_panel') {
    // 配线架，显示端口编辑
    const cabinetItem = selectedCabinet.value?.patchItems?.find(i => i.id === item.id)
    if (cabinetItem) editPatchPanel(cabinetItem)
  } else if (item?.itemType === 'odf') {
    // ODF框，显示ODF编辑
    const cabinetItem = selectedCabinet.value?.patchItems?.find(i => i.id === item.id)
    if (cabinetItem) editODF(cabinetItem)
  } else if (item?.itemType === 'fiber_tray') {
    // 光纤盘，显示光纤盘编辑
    const cabinetItem = selectedCabinet.value?.patchItems?.find(i => i.id === item.id)
    if (cabinetItem) editFiberTray(cabinetItem)
  }
}

function selectCabinet(cabinet) {
  selectedCabinet.value = cabinet
  selectedDeviceId.value = null
}

// 处理机柜视图中的端口点击
function handlePortClick(portInfo) {
  const { deviceId, device, portId, portNum, portType, portName } = portInfo
  if (!deviceId || !portId) return

  // Console 口不支持网络连接
  if (portType === 'console') {
    ElMessage.warning('Console口不支持网络连接')
    return
  }

  // 调用现有的端口连接对话框
  openPortConnect({
    id: portId,
    deviceId: deviceId,
    deviceName: device?.name || '',
    portType: portType || 'ethernet',
    portNum: portNum,
    name: portName || `GE0/0/${portNum}`
  })
}

async function handleZoomUnmount(device) {
  if (!device || device.id == null) return
  // 配线架/理线架/ODF 等配线设备不在 slots 中，unmountDevice 只认 slots 会静默失败，需走 removePatchItem
  if (device._isPatchItem || device._category) {
    const item = (selectedCabinet.value?.patchItems || []).find(i => String(i.id) === String(device.id))
    zoomVisible.value = false
    if (!item) {
      ElMessage.warning('配线设备不存在或已下架')
      return
    }
    await removePatchItem(item.id)
    ElMessage.success(`配线设备「${item.name || ''}」已下架`)
    addLog({ type: 'unmount', detail: `下架配线设备：${item.name || ''} 从机柜 ${selectedCabinet.value?.name || ''}`, result: 'success', device: item.name || '' })
    return
  }
  zoomVisible.value = false
  unmountDevice(device.id)
}

// 放大弹窗“重命名”：修改配线架/理线架/ODF 等配线设备名称（ElMessageBox.prompt，确认后同步右侧列表与面板）
async function handleZoomRename(device) {
  if (!device || device.id == null) return
  const item = (selectedCabinet.value?.patchItems || []).find(i => String(i.id) === String(device.id))
  if (!item) {
    ElMessage.warning('配线设备不存在')
    return
  }
  try {
    const { value } = await ElMessageBox.prompt('修改配线设备名称', '重命名', {
      inputValue: item.name || '',
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputValidator: (v) => (v && String(v).trim()) ? true : '名称不能为空'
    })
    const newName = String(value).trim()
    if (newName === (item.name || '')) return
    const items = (selectedCabinet.value.patchItems || []).map(i =>
      String(i.id) === String(item.id) ? { ...i, name: newName } : i
    )
    cabinetStore.updateCabinet(selectedCabinet.value.id, { patchItems: items })
    // 关键：配线设备改名后同步连接快照中的 deviceName，
    // 保证设备管理连接详情、机柜悬停、拓扑边信息立即显示新名（三界面同步）
    portStateStore.syncDeviceNameToConnections(item.id, newName)
    nextTick(() => {
      selectedCabinet.value = cloneCabinetById(selectedCabinet.value.id)
    })
    // 同步放大弹窗内数据，面板左下角名称立即刷新
    if (zoomDeviceData.value && String(zoomDeviceData.value.id) === String(item.id)) {
      zoomDeviceData.value = { ...zoomDeviceData.value, name: newName }
    }
    ElMessage.success('名称已更新')
  } catch { /* 用户取消 */ }
}

function handlePowerToggle({ deviceId, device }) {
  const d = deviceStore.devices.find(x => String(x.id) === String(deviceId))
  if (!d) return
  // 关机(offline) → 开机(online)；开机 → 关机(offline)
  const newStatus = d.status === 'offline' ? 'online' : 'offline'
  deviceStore.setDeviceStatus(deviceId, newStatus)
}

function handleDeviceClick(deviceId, device) {
  selectedDeviceId.value = deviceId

  // 优先：如果 device 已经由 CabinetRackVisual 提供（包含 portMap/ports_count）
  if (device && device._isPatchItem) {
    const zoomDev = {
      id: device.id,
      name: device.name || '',
      device_type: device.device_type,
      type: device.device_type,
      u_height: device.u_height || device.uSize || 1,
      uSize: device.u_height || device.uSize || 1,
      vendor: device.vendor || device.brand || '',
      brand: device.brand || device.vendor || '',
      model: device.model || '',
      status: device.status || 'normal',
      portMap: device.portMap || {},
      ports_count: device.ports_count || device.ports || 0,
      fiberType: device.fiberType || 'SC',
      fibers: device.fibers || 0,
      fiberMap: device.fiberMap || {},
      ports: [],
      drives: [],
      _isPatchItem: true,
      _category: device._category,
    }
    zoomDeviceData.value = zoomDev
    zoomVisible.value = true
    return
  }

  // 兼容：从 deviceStore.devices 中查找普通设备
  const dev = deviceStore.devices.find(d => String(d.id) === String(deviceId))
  if (dev) {
    // 统一展示 DevicePanelRenderer 自绘前面板（品牌LOGO+型号+端口），满足"只需前面板"需求
    zoomDeviceData.value = dev
    zoomVisible.value = true
    return
  }

  // 兼容：从 cabinet.patchItems 中查找配线设备（fallback）
  if (selectedCabinet.value?.patchItems) {
    const item = selectedCabinet.value.patchItems.find(i => String(i.id) === String(deviceId))
    if (item) {
      const cat = item.category || ''
      const typeMap = {
        patch_panel: 'patch_panel',
        cable_manager: 'cable_manager',
        odf: 'odf',
        fiber_tray: 'fiber_tray',
      }
      const zoomDev = {
        id: item.id,
        name: item.name || '',
        device_type: typeMap[cat] || 'other',
        type: typeMap[cat] || 'other',
        u_height: item.uSize || 1,
        uSize: item.uSize || 1,
        vendor: item.brand || '',
        brand: item.brand || '',
        model: item.model || '',
        status: 'normal',
        portMap: item.portMap || {},
        ports_count: item.ports || 0,
        fibers: item.fibers || 0,
        fiberType: item.fiberType || 'SC',
        fiberMap: item.fiberMap || {},
        ports: [],
        drives: [],
        _isPatchItem: true,
        _category: cat,
      }
      zoomDeviceData.value = zoomDev
      zoomVisible.value = true
    }
  }
}

/**
 * 深拷贝指定机柜的快照；机柜不存在时返回 null。
 *
 * 早期写法 `JSON.parse(JSON.stringify(cabinets.find(...)))` 在机柜刚被删除时
 * find 返回 undefined → JSON.stringify(undefined) 得到 undefined →
 * JSON.parse(undefined) 直接抛 SyntaxError，后续流程全部中断。
 */
function cloneCabinetById(cabinetId) {
  const c = cabinetStore.cabinets.find(x => String(x.id) === String(cabinetId))
  return c ? JSON.parse(JSON.stringify(c)) : null
}

/** 取设备占用的 U 高度（机柜 slots 只存 id，需回设备表查） */
function getDeviceUHeight(deviceId) {
  const d = deviceStore.devices.find(x => String(x.id) === String(deviceId))
  return Number(d?.u_height || d?.uSize || 1) || 1
}

function handleDeviceMove(event) {
  const { deviceId, fromU, toU, fromRackId, toCabinetId, device } = event
  const uHeight = device?.u_height || 1

  // 源机柜：优先用 fromRackId，否则按 deviceId 查找所在柜
  let sourceCabinet = fromRackId
    ? (cabinetStore.cabinets.find(c => String(c.id) === String(fromRackId)) || null)
    : null
  if (!sourceCabinet) sourceCabinet = getCabinetOfDevice(deviceId)
  if (!sourceCabinet) return

  // 目标机柜：优先 toCabinetId，否则沿用源机柜（同柜移动）
  const targetCabinet = toCabinetId
    ? (cabinetStore.cabinets.find(c => String(c.id) === String(toCabinetId)) || sourceCabinet)
    : sourceCabinet

  const targetCabinetId = targetCabinet.id
  const sourceCabinetId = sourceCabinet.id

  // 落位前复核：拖拽事件里的 toU 由子组件算出，异常事件可能给出越界或与其它设备重叠的 U 位。
  // 早期实现完全信任 toU，会把设备写到机柜 U 位范围之外或压在已有设备上。
  const targetU = Math.round(toU * 3) / 3
  const cabinetTotalU = Number(targetCabinet.totalU) || 42
  if (targetU < 1 || targetU + uHeight - 1 > cabinetTotalU) {
    ElMessage.warning(`目标位置 ${targetU}U 超出机柜范围（1-${cabinetTotalU}U），已取消移动`)
    return
  }

  const isPatch = device?._isPatchItem

  // 目标柜内占位复核（排除被移动设备自身）
  const occupiedRanges = []
  Object.entries(targetCabinet.slots || {}).forEach(([slotU, id]) => {
    if (String(id) === String(deviceId)) return
    const u = Number(slotU)
    if (!Number.isFinite(u)) return
    const h = getDeviceUHeight(id)
    occupiedRanges.push([u, u + h - 1])
  })
  ;(targetCabinet.patchItems || []).forEach((p) => {
    if (String(p.id) === String(deviceId)) return
    const u = Number(p.startU) || 1
    const h = Number(p.uSize) || 1
    occupiedRanges.push([u, u + h - 1])
  })
  const conflicts = occupiedRanges.some(([a, b]) => targetU <= b && targetU + uHeight - 1 >= a)
  if (conflicts) {
    ElMessage.warning(`目标位置 ${targetU}U 已被其它设备占用，已取消移动`)
    return
  }

  // 1. 从源机柜移除设备
  if (isPatch) {
    const srcPatch = [...(sourceCabinet.patchItems || [])]
    const srcIdx = srcPatch.findIndex(p => p.id === deviceId)
    if (srcIdx !== -1) srcPatch.splice(srcIdx, 1)
    if (sourceCabinetId !== targetCabinetId) {
      cabinetStore.updateCabinet(sourceCabinetId, { patchItems: srcPatch })
    }
  } else {
    const srcSlots = { ...(sourceCabinet.slots || {}) }
    Object.keys(srcSlots).forEach(key => {
      if (srcSlots[key] === deviceId) delete srcSlots[key]
    })
    // 同柜移动不在此提交：步骤 2 会基于同一份 slots 清理并写入，只做一次 store 更新，
    // 避免重复触发持久化/渲染；也不再直接写 sourceCabinet.slots 绕过 store
    if (sourceCabinetId !== targetCabinetId) {
      cabinetStore.updateCabinet(sourceCabinetId, { slots: srcSlots })
    }
  }

  // 2. 写入目标机柜
  if (isPatch) {
    // 配线设备移动到目标柜的 patchItems
    const targetPatch = [...(targetCabinet.patchItems || [])]
    const existingIdx = targetPatch.findIndex(p => p.id === deviceId)
    if (existingIdx !== -1) {
      targetPatch[existingIdx] = { ...targetPatch[existingIdx], startU: targetU, uSize: uHeight }
    } else {
      // 从源 patch 复制一份并改位置（设备对象含 id 等完整信息）
      const srcItem = (sourceCabinet.patchItems || []).find(p => p.id === deviceId)
      if (srcItem) {
        targetPatch.push({ ...srcItem, startU: targetU, uSize: uHeight })
      }
    }
    cabinetStore.updateCabinet(targetCabinetId, { patchItems: targetPatch })
  } else {
    // 普通设备写入目标机柜 slots
    const targetSlots = { ...(targetCabinet.slots || {}) }
    // 同柜移动时，targetCabinet === sourceCabinet，slots 已被清理过
    if (sourceCabinetId === targetCabinetId) {
      // 复用已清理的 slots（含目标U位写入）
      Object.keys(targetSlots).forEach(key => {
        if (targetSlots[key] === deviceId) delete targetSlots[key]
      })
    }
    targetSlots[String(targetU)] = deviceId
    cabinetStore.updateCabinet(targetCabinetId, { slots: targetSlots })
  }

  // 跨柜移动时更新选中机柜，指向目标机柜
  if (sourceCabinetId !== targetCabinetId) {
    selectedCabinet.value = cabinetStore.cabinets.find(c => c.id === targetCabinetId)
  }

  const displayU = Math.round(toU * 3) / 3
  const targetName = targetCabinet.name || targetCabinetId
  ElMessage.success(`已移动到机柜${targetName} ${displayU}U 位置`)
}

function handleUClickUnified(u) {
  // 如果该U位已有设备或配线设备，不处理点击上架
  if (getSlotDevice(u) || getPatchItemAtU(u)) return
  // 设置起始U位并打开统一上架对话框
  patchItemForm.value = { category: 'network', deviceId: '', itemType: 'patch_panel', name: '', ports: 24, fibers: 48, customFibers: 12, desc: '', startU: u, fiberType: 'SC' }
  mountForm.value.startU = u
  showUnifiedMountDialog.value = true
}

// 统一上架对话框显示标志
const showUnifiedMountDialog = ref(false)

// 打开统一上架对话框
function openMountDialog() {
  patchItemForm.value = { category: 'network', deviceId: '', itemType: 'patch_panel', name: '', ports: 24, fibers: 48, customFibers: 12, desc: '', startU: 1, fiberType: 'SC' }
  mountForm.value = { deviceId: '', startU: 1 }
  showUnifiedMountDialog.value = true
}

// 统一上架面板 - 区分设备还是配线设备
const unifiedMountTab = ref('device')

async function openAddCabinetDialog() {
  addCabinetVisible.value = false
  await nextTick()
  isEditCabinet.value = false
  cabinetForm.value = { name: '', totalU: 42, location: '', remark: '', type: 'server' }
  await nextTick()
  addCabinetVisible.value = true
}

async function editCabinet(cabinet) {
  addCabinetVisible.value = false
  await nextTick()
  isEditCabinet.value = true
  editCabinetId.value = cabinet.id
  cabinetForm.value = { ...cabinet }
  await nextTick()
  addCabinetVisible.value = true
}

function saveCabinet() {
  if (!cabinetForm.value.name.trim()) { ElMessage.error('请输入机柜名称'); return }

  const spec = rackSpecs.find(s => s.u === cabinetForm.value.totalU)
  const sizeText = spec ? `尺寸：600×1000×${spec.height}` : `尺寸：600×1000×${(cabinetForm.value.totalU * 44.45 + 200 | 0)}mm`

  if (isEditCabinet.value) {
    const cabinetId = editCabinetId.value
    cabinetStore.updateCabinet(cabinetId, { ...cabinetForm.value, size: sizeText })
    // 强制刷新 selectedCabinet 以更新 UI
    nextTick(() => {
      selectedCabinet.value = cloneCabinetById(cabinetId)
      ElMessage.success('机柜已更新')
      addLog({ type: LogType.CABINET_EDIT, detail: `编辑机柜：${cabinetForm.value.name}`, result: LogResult.SUCCESS })
    })
  } else {
    const c = cabinetStore.addCabinet({ ...cabinetForm.value, size: sizeText, slots: {}, patchItems: [] })
    selectedCabinet.value = c
    ElMessage.success(`机柜创建成功！${c.totalU}U机柜`)
    addLog({ type: LogType.CABINET_ADD, detail: `添加机柜：${cabinetForm.value.name}`, result: LogResult.SUCCESS })
  }
  addCabinetVisible.value = false
}

async function deleteCabinet(cabinet) {
  try {
    await ElMessageBox.confirm(`确定删除机柜「${cabinet.name}」？`, '确认删除', { type: 'warning' })
    if (selectedCabinet.value?.id === cabinet.id) selectedCabinet.value = null
    cabinetStore.deleteCabinet(cabinet.id)
    ElMessage.success('机柜已删除')
    addLog({ type: LogType.CABINET_DELETE, detail: `删除机柜：${cabinet.name}`, result: LogResult.SUCCESS })
  } catch {}
}

function addPatchPanelDialog() {
  // 统一使用上架对话框
  openMountDialog()
}

// 类别变更时清空相关字段
function onPatchCategoryChange() {
  patchItemForm.value.deviceId = ''
  patchItemForm.value.name = ''
  patchItemForm.value.ports = 24
  patchItemForm.value.fibers = 48
  patchItemForm.value.customFibers = 12
  patchItemForm.value.desc = ''
  patchItemForm.value.fiberType = 'SC' // 默认SC口
  if (patchItemForm.value.category === 'fiber_tray') {
    patchItemForm.value.fibers = 12
  }
}

// 生成机柜位置编码，格式: 区/排/柜号
function generateCabinetPositionCode(cabinet) {
  if (!cabinet) return ''
  const name = cabinet.name || ''
  const location = cabinet.location || ''

  // 尝试从 location 解析区排信息
  // 支持格式: "A区1排" "A/1" 等
  let area = ''
  let row = ''

  if (location) {
    const areaMatch = location.match(/([A-Za-z]+)\s*[区\/\\]/)
    const rowMatch = location.match(/(\d+)\s*[排号]/)
    if (areaMatch) area = areaMatch[1].toUpperCase()
    if (rowMatch) row = rowMatch[1]
  }

  // 如果未从 location 解析到，从 cabinet name 解析
  // name 如 "A1" => area=A, cabinet=A1, row 从 location 取
  if (!area && name) {
    const nameMatch = name.match(/^([A-Za-z]+)/)
    if (nameMatch) area = nameMatch[1].toUpperCase()
  }
  if (!row && location) {
    row = '1' // 默认第1排
  }

  return [area, row, name].filter(Boolean).join('/')
}

// 为配线架/ODF生成端口A端标识
function generatePortALabel(cabinet, uPosition, portNum) {
  const base = generateCabinetPositionCode(cabinet)
  if (!base) return ''
  const uLabel = `${uPosition}U`
  if (portNum !== undefined && portNum !== null) {
    return `${base}/${uLabel}/${portNum}#/`
  }
  return `${base}/${uLabel}`
}

function savePatchItem() {
  const form = patchItemForm.value
  const totalU = selectedCabinet.value?.totalU || 42
  const startU = form.startU || 1

  if (form.category === 'network') {
    // 添加网络设备
    if (!form.deviceId) { ElMessage.error('请选择设备'); return }
    const device = deviceStore.devices.find(d => d.id === form.deviceId)
    if (!device) { ElMessage.error('设备不存在'); return }

    // 检查设备是否已在其他机柜上架
    for (const cabinet of cabinetStore.cabinets) {
      if (cabinet.id === selectedCabinet.value.id) continue
      // 检查服务器机柜slots
      const existingSlots = cabinet.slots || {}
      const isMounted = Object.values(existingSlots).includes(device.id)
      if (isMounted) {
        ElMessage.error(`设备「${device.name}」已在机柜「${cabinet.name}」中上架，请先下架后再操作`)
        return
      }
      // 检查配线机柜patchItems
      const patchItems = cabinet.patchItems || []
      const inPatchItem = patchItems.find(item => item.category === 'network' && item.deviceId === device.id)
      if (inPatchItem) {
        ElMessage.error(`设备「${device.name}」已在机柜「${cabinet.name}」中上架，请先下架后再操作`)
        return
      }
    }

    const uSize = device.uSize || 1
    const endU = startU + uSize - 1
    if (endU > totalU) { ElMessage.error('超出机柜范围'); return }

    const item = {
      id: Date.now().toString(),
      category: 'network',
      deviceId: device.id,
      name: device.name,
      type: device.type || 'switch',
      uSize,
      startU,
      // 自动生成A端位置标识（新增）
      aEndPosition: generatePortALabel(selectedCabinet.value, startU)
    }

    const patchItems = [...(selectedCabinet.value?.patchItems || []), item]
    const cabinetId = selectedCabinet.value.id
    cabinetStore.updateCabinet(cabinetId, { patchItems })
    nextTick(() => {
      selectedCabinet.value = cloneCabinetById(cabinetId)
    })
    showUnifiedMountDialog.value = false
    ElMessage.success(`「${device.name}」已上架至 U${startU}-U${endU}`)
    return
  }

  // 非网络设备
  if (!form.name.trim()) { ElMessage.error('请输入名称'); return }

  let uSize = 1
  if (form.category === 'patch_panel') uSize = form.ports === 48 ? 2 : 1
  else if (form.category === 'odf') {
    const fibers = form.fibers === 0 ? form.customFibers : form.fibers
    if (fibers <= 48) uSize = 3
    else if (fibers <= 72) uSize = 4
    else if (fibers <= 96) uSize = 5
    else uSize = Math.ceil(fibers / 12)
  }
  // fiber_tray 始终占用 1U

  const endU = startU + uSize - 1
  if (endU > totalU) { ElMessage.error('超出机柜范围'); return }

  const item = {
    id: Date.now().toString(),
    category: form.category,
    itemType: form.category,
    name: form.name,
    uSize,
    startU,
    ports: form.ports,
    fibers: form.fibers === 0 ? form.customFibers : form.fibers,
    fiberType: form.fiberType || 'SC', // 保存光纤接头类型
    desc: form.desc,
    portMap: {},
    fiberMap: {},
    // 自动生成A端位置标识
    aEndPosition: generatePortALabel(selectedCabinet.value, startU)
  }

  const patchItems = [...(selectedCabinet.value?.patchItems || []), item]
  const cabinetId = selectedCabinet.value.id
  cabinetStore.updateCabinet(cabinetId, { patchItems })
  nextTick(() => {
    selectedCabinet.value = cloneCabinetById(cabinetId)
  })
  showUnifiedMountDialog.value = false
  ElMessage.success(`「${form.name}」已添加至 U${startU}-U${endU}`)
}

async function removePatchItem(itemId) {
  const item = (selectedCabinet.value.patchItems || []).find(i => i.id === itemId)
  
  // 检查上架设备是否有活跃端口连接
  if (item?.category === 'network' && item?.deviceId) {
    const occupiedPorts = portStateStore.getOccupiedPorts(item.deviceId)
    if (occupiedPorts.length > 0) {
      try {
        await ElMessageBox.confirm(
          `设备「${item.name}」当前有 ${occupiedPorts.length} 个端口处于连接状态，下架后这些连接将被断开。确定下架吗？`,
          '下架确认',
          { type: 'warning', confirmButtonText: '确定下架', cancelButtonText: '取消' }
        )
      } catch { return }
      // 断开该设备所有端口连接
      occupiedPorts.forEach(p => {
        portStateStore.disconnectDevicePort(item.deviceId, p.portId.replace(item.deviceId + '-', ''))
      })
    }
  }
  
  // 如果是配线架/ODF，也需要清除相关端口连接
  if (item?.itemType === 'patch_panel' || item?.category === 'patch_panel') {
    const panelConns = portStateStore.connections.filter(c =>
      c.portA.portId.startsWith(item.id + '-') || c.portB.portId.startsWith(item.id + '-')
    )
    panelConns.forEach(c => portStateStore.disconnectPorts(c.id))
  }
  
  const patchItems = (selectedCabinet.value.patchItems || []).filter(i => i.id !== itemId)
  const cabinetId = selectedCabinet.value.id
  cabinetStore.updateCabinet(cabinetId, { patchItems })
  nextTick(() => {
    selectedCabinet.value = cloneCabinetById(cabinetId)
  })
}

// 获取当前机柜中的网络设备（包括slots和patchItems中的）
const cabinetNetworkDevices = computed(() => {
  const result = []
  const cabinet = selectedCabinet.value
  if (!cabinet) return result

  // 1. 从 slots 中获取已上架的网络设备
  const slotDeviceIds = new Set()
  Object.values(cabinet.slots || {}).forEach(deviceId => {
    if (deviceId) slotDeviceIds.add(deviceId)
  })
  slotDeviceIds.forEach(deviceId => {
    const device = deviceStore.devices.find(d => d.id === deviceId)
    if (device) {
      result.push({
        id: device.id,
        name: device.name,
        ip: device.ip,
        type: device.type,
        model: device.model
      })
    }
  })

  // 2. 从 patchItems 中获取网络设备
  const items = cabinet.patchItems || []
  items.filter(i => i.category === 'network').forEach(i => {
    // 避免重复
    if (!result.find(d => d.id === i.deviceId)) {
      const device = deviceStore.devices.find(d => d.id === i.deviceId)
      result.push({
        id: i.deviceId,
        name: i.name || device?.name || '未知设备',
        ip: device?.ip || '',
        type: device?.type || '',
        model: device?.model || ''
      })
    }
  })

  return result
})

// 获取设备的端口列表
function getDevicePorts(deviceId) {
  const device = deviceStore.devices.find(d => d.id === deviceId)
  if (!device) return []
  const model = deviceLibStore.models.find(m => m.name === device.model)
  const ports = []
  if (model) {
    const ethCount = model.ethernetPorts || 0
    for (let i = 1; i <= ethCount; i++) {
      ports.push({
        id: `eth${i}`,
        name: `GE0/0/${i}`,
        customName: device.portNames?.[`eth${i}`] || null
      })
    }
    const sfpCount = model.sfpPorts || 0
    for (let i = 1; i <= sfpCount; i++) {
      ports.push({
        id: `sfp${i}`,
        name: `SFP${i}`,
        customName: device.portNames?.[`sfp${i}`] || null
      })
    }
  }
  if (ports.length === 0) {
    for (let i = 1; i <= 24; i++) {
      ports.push({ id: `eth${i}`, name: `GE0/0/${i}`, customName: device.portNames?.[`eth${i}`] || null })
    }
  }
  return ports
}

// 辅助：生成全局端口ID（与portState.js一致）
function makePortId(deviceId, portKey) {
  return deviceId + '-' + portKey
}

// 根据设备ID查找设备名称（支持网络设备和配线设备）
function resolveDeviceName(deviceId) {
  if (!deviceId) return null
  const device = deviceStore.devices.find(d => d.id === deviceId)
  if (device?.name) return device.name
  for (const cab of cabinetStore.cabinets || []) {
    for (const item of cab.patchItems || []) {
      if (item.id === deviceId) return item.name || '配线设备'
    }
  }
  return null
}

// 获取设备可用于连接的端口列表（通过全局状态管理器，过滤已占用）
// aDeviceId: A端设备ID, aPortKey: A端端口键(如'patch-1'), aPortType: A端端口类型('ethernet'|'optical')
function getDevicePortsForPatch(deviceId, aDeviceId, aPortKey, aPortType) {
  if (!deviceId) return []
  const device = deviceStore.devices.find(d => d.id === deviceId)
  if (!device) return []

  // A端完整ID（用于判断是否当前已连接的端口）
  const aPortFullId = aDeviceId && aPortKey ? makePortId(aDeviceId, aPortKey) : null

  // 使用全局状态管理器获取设备所有端口
  const allPorts = portStateStore.getDevicePorts(device, deviceLibStore)

  return allPorts.filter(port => {
    // 类型必须匹配
    if (port.portType !== aPortType) return false
    // 已占用不可选，但如果是当前已有的连接则允许显示（编辑时保留）
    if (port.status === 'occupied') {
      if (aPortFullId) {
        const conn = portStateStore.getPortConnection(deviceId, port.id)
        if (conn && conn.remotePortId === aPortFullId) return true
      }
      return false
    }
    return true
  })
}

function editPatchPanel(item) {
  editingPanel.value = item
  portEditData.value = {}
  const basePosition = item.aEndPosition || generatePortALabel(selectedCabinet.value, item.startU || 1)
  for (let p = 1; p <= item.ports; p++) {
    const existing = item.portMap?.[p]
    portEditData.value[p] = {
      portName: existing?.portName || '',
      from: existing?.from || (basePosition ? `${basePosition}/${p}` : ''),
      to: existing?.to || '',
      cable: existing?.cable || '',
      connectDeviceId: existing?.connectDeviceId || '',
      connectPort: existing?.connectPort || ''
    }
  }
  portEditVisible.value = true
}

function savePortEdit() {
  const portMap = {}
  const panelItem = editingPanel.value
  const basePosition = panelItem?.aEndPosition || generatePortALabel(selectedCabinet.value, panelItem?.startU || 1)

  Object.entries(portEditData.value).forEach(([p, v]) => {
    if (v.from || v.to || v.portName || v.connectDeviceId) {
      // 自动设置A端（from）为配线架位置
      if (!v.from && basePosition) {
        v.from = `${basePosition}/${p}`
      }
      // 自动设置B端（to）为连接目标描述
      if (!v.to && v.connectDeviceId) {
        const targetDevice = cabinetNetworkDevices.value.find(d => d.id === v.connectDeviceId)
        if (targetDevice) {
          v.to = `${targetDevice.name}·${v.connectPort || '?'}`
        }
      }
      portMap[p] = v
    }
  })

  const patchItems = (selectedCabinet.value.patchItems || []).map(i =>
    i.id === editingPanel.value.id ? { ...i, portMap } : i
  )

  // 同步更新连接目标设备的端口状态
  const updatedPatchItems = patchItems.map(item => {
    if (item.id === editingPanel.value.id && item.portMap) {
      // 检查是否有端口连接更新
      return { ...item, portMap }
    }
    // 清除之前与此配线架的旧连接
    if (item.category === 'network' && item.portMap) {
      const newPortMap = { ...item.portMap }
      let changed = false
      Object.entries(newPortMap).forEach(([portKey, portVal]) => {
        // 如果之前连接了正在编辑的配线架，需要更新
        if (portVal.connectDeviceId === editingPanel.value.id) {
          // 查找新的连接状态
          const newConn = Object.entries(portMap).find(([, v]) =>
            v.connectDeviceId === item.deviceId && v.connectPort === portKey
            )
          if (newConn) {
            // 自动设置交换机端口的A端位置（配线架位置/端口号#/）
            const panelPortNum = newConn[0]
            const switchALabel = basePosition ? `${basePosition}/${panelPortNum}#/` : ''
            newPortMap[portKey] = {
              ...portVal,
              from: switchALabel,
              status: 'connected'
            }
            changed = true
          } else {
            // 连接被移除
            delete newPortMap[portKey]
            changed = true
          }
        }
      })
      if (changed) return { ...item, portMap: newPortMap }
    }
    return item
  })

  const cabinetId = selectedCabinet.value.id
  cabinetStore.updateCabinet(cabinetId, { patchItems: updatedPatchItems })
  
  // 同步到全局端口状态管理器
  syncPatchPortMapToPortState(editingPanel.value.id, portMap)
  
  // 强制刷新 selectedCabinet 以更新 UI
  nextTick(() => {
    selectedCabinet.value = cloneCabinetById(cabinetId)
  })
  portEditVisible.value = false
  ElMessage.success('端口信息已保存，A端位置已自动同步')
}

// 将配线架 portMap 连接同步到全局端口状态管理器
function syncPatchPortMapToPortState(panelId, newPortMap) {
  if (!panelId) return
  
  // 移除该panel的所有旧连接
  const oldConns = portStateStore.connections.filter(c =>
    c.portA.portId.startsWith(panelId + '-') || c.portB.portId.startsWith(panelId + '-')
  )
  oldConns.forEach(c => portStateStore.disconnectPorts(c.id))
  
  // 根据新的portMap创建连接
  Object.entries(newPortMap || {}).forEach(([portNum, portData]) => {
    if (!portData.connectDeviceId || !portData.connectPort) return
    const panelName = editingPanel.value?.name || '配线架'
    const switchDevice = deviceStore.devices.find(d => d.id === portData.connectDeviceId)
    if (!switchDevice) return
    
    const portA = {
      deviceId: panelId,
      portId: 'patch-' + portNum,
      deviceName: panelName,
      portNum: parseInt(portNum),
      portType: 'ethernet'
    }
    const portB = {
      deviceId: portData.connectDeviceId,
      portId: portData.connectPort,
      deviceName: switchDevice.name || '',
      portNum: portData.connectPort,
      portType: 'ethernet'
    }
    const cableType = portData.cable || '六类网线'
    portStateStore.connectPorts(portA, portB, cableType)
  })
}

// 导出配线架端口信息到Excel
function exportPatchPanelToXlsx() {
  if (!editingPanel.value) return
  const rows = []
  for (let p = 1; p <= editingPanel.value.ports; p++) {
    const data = portEditData.value[p] || {}
    rows.push({
      '端口': p,
      '端口名称': data.portName || '',
      'A端': data.from || '',
      '连接设备': data.connectDeviceId ? cabinetNetworkDevices.value.find(d => d.id === data.connectDeviceId)?.name || '' : '',
      '设备端口': data.connectPort || ''
    })
  }

  // 使用 XLSX 导出为 Excel
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '端口信息')

  // 设置列宽
  ws['!cols'] = [
    { wch: 8 },   // 端口
    { wch: 20 },  // 端口名称
    { wch: 20 },  // A端
    { wch: 20 },  // 连接设备
    { wch: 15 }   // 设备端口
  ]

  const fileName = `${editingPanel.value.name}_端口信息.xlsx`
  XLSX.writeFile(wb, fileName)
  ElMessage.success('端口信息已导出')
}

// 导入配线架端口信息
function importPatchPanelFromXlsx() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.xlsx,.xls'
  input.onchange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(sheet)

        if (jsonData.length === 0) {
          ElMessage.error('文件中没有找到数据')
          return
        }

        const newPortMap = {}

        jsonData.forEach(row => {
          const portNum = parseInt(row['端口'] || row['port'])
          if (!portNum || portNum > editingPanel.value.ports) return

          // 将设备名称转换为deviceId
          let devId = ''
          const devName = row['连接设备'] || ''
          if (devName) {
            const found = deviceStore.devices.find(d => d.name === devName)
            if (found) devId = found.id
          }

          newPortMap[portNum] = {
            portName: row['端口名称'] || row['portName'] || '',
            from: row['A端'] || row['from'] || '',
            to: '',  // 不再使用
            cable: '',  // 不再使用
            connectDeviceId: devId,
            connectPort: row['设备端口'] || row['connectPort'] || ''
          }
        })

        // 更新编辑数据
        Object.entries(newPortMap).forEach(([p, v]) => {
          portEditData.value[p] = v
        })
        ElMessage.success(`已导入 ${Object.keys(newPortMap).length} 个端口信息`)
      } catch (err) {
        console.error('导入错误:', err)
        ElMessage.error('导入失败：文件格式错误或已损坏')
      }
    }
    reader.readAsArrayBuffer(file)
  }
  input.click()
}

function editODF(item) {
  editingODF.value = item
  odfEditData.value = {}
  for (let i = 1; i <= item.fibers; i++) {
    odfEditData.value[i] = { ...(item.fiberMap?.[i] || { from: '', to: '', fiberType: '' }) }
  }
  odfEditVisible.value = true
}

function saveODFEdit() {
  const fiberMap = {}
  Object.entries(odfEditData.value).forEach(([i, v]) => {
    if (v.from || v.to) fiberMap[i] = v
  })
  const patchItems = (selectedCabinet.value.patchItems || []).map(i =>
    i.id === editingODF.value.id ? { ...i, fiberMap } : i
  )
const cabinetId = selectedCabinet.value.id
  cabinetStore.updateCabinet(cabinetId, { patchItems })
  // 强制刷新 selectedCabinet 以更新 UI
  nextTick(() => {
    selectedCabinet.value = cloneCabinetById(cabinetId)
  })
  odfEditVisible.value = false
  ElMessage.success('ODF信息已保存')
}

// 导出ODF信息到Excel
function exportODFToXlsx() {
  if (!editingODF.value) return
  const rows = []
  for (let i = 1; i <= editingODF.value.fibers; i++) {
    const data = odfEditData.value[i] || {}
    rows.push({
      '芯号': i,
      'A端位置': data.from || '',
      'B端位置': data.to || '',
      '光纤类型': data.fiberType || ''
    })
  }
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'ODF信息')
  ws['!cols'] = [
    { wch: 8 },
    { wch: 20 },
    { wch: 20 },
    { wch: 15 }
  ]
  const fileName = `${editingODF.value.name}_ODF信息.xlsx`
  XLSX.writeFile(wb, fileName)
  ElMessage.success('ODF信息已导出')
}

// 导入ODF信息从Excel
function importODFFromXlsx() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.xlsx,.xls'
  input.onchange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(sheet)
        if (jsonData.length === 0) {
          ElMessage.error('文件中没有找到数据')
          return
        }
        const newFiberMap = {}
        jsonData.forEach(row => {
          const coreNum = parseInt(row['芯号'] || row['core'])
          if (!coreNum || coreNum > editingODF.value.fibers) return
          newFiberMap[coreNum] = {
            from: row['A端位置'] || row['from'] || '',
            to: row['B端位置'] || row['to'] || '',
            fiberType: row['光纤类型'] || row['fiberType'] || ''
          }
        })
        Object.entries(newFiberMap).forEach(([i, v]) => {
          odfEditData.value[i] = v
        })
        ElMessage.success(`已导入 ${Object.keys(newFiberMap).length} 条光纤信息`)
      } catch (err) {
        console.error('导入错误:', err)
        ElMessage.error('导入失败：文件格式错误或已损坏')
      }
    }
    reader.readAsArrayBuffer(file)
  }
  input.click()
}

function editFiberTray(item) {
  editingFiberTray.value = item
  fiberTrayEditData.value = {}
  for (let i = 1; i <= item.fibers; i++) {
    fiberTrayEditData.value[i] = { ...(item.fiberMap?.[i] || { from: '', to: '', fiberType: '' }) }
  }
  fiberTrayEditVisible.value = true
}

function saveFiberTrayEdit() {
  const fiberMap = {}
  Object.entries(fiberTrayEditData.value).forEach(([i, v]) => {
    if (v.from || v.to) fiberMap[i] = v
  })
  const patchItems = (selectedCabinet.value.patchItems || []).map(i =>
    i.id === editingFiberTray.value.id ? { ...i, fiberMap } : i
  )
const cabinetId = selectedCabinet.value.id
  cabinetStore.updateCabinet(cabinetId, { patchItems })
  nextTick(() => {
    selectedCabinet.value = cloneCabinetById(cabinetId)
  })
  fiberTrayEditVisible.value = false
  ElMessage.success('光纤盘信息已保存')
}

// 导出光纤盘信息到Excel
function exportFiberTrayToXlsx() {
  if (!editingFiberTray.value) return
  const rows = []
  for (let i = 1; i <= editingFiberTray.value.fibers; i++) {
    const data = fiberTrayEditData.value[i] || {}
    rows.push({
      '芯号': i,
      'A端位置': data.from || '',
      'B端位置': data.to || '',
      '光纤类型': data.fiberType || ''
    })
  }
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '光纤盘信息')
  ws['!cols'] = [
    { wch: 8 },
    { wch: 20 },
    { wch: 20 },
    { wch: 15 }
  ]
  const fileName = `${editingFiberTray.value.name}_光纤盘信息.xlsx`
  XLSX.writeFile(wb, fileName)
  ElMessage.success('光纤盘信息已导出')
}

// 导入光纤盘信息从Excel
function importFiberTrayFromXlsx() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.xlsx,.xls'
  input.onchange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(sheet)
        if (jsonData.length === 0) {
          ElMessage.error('文件中没有找到数据')
          return
        }
        const newFiberMap = {}
        jsonData.forEach(row => {
          const coreNum = parseInt(row['芯号'] || row['core'])
          if (!coreNum || coreNum > editingFiberTray.value.fibers) return
          newFiberMap[coreNum] = {
            from: row['A端位置'] || row['from'] || '',
            to: row['B端位置'] || row['to'] || '',
            fiberType: row['光纤类型'] || row['fiberType'] || ''
          }
        })
        Object.entries(newFiberMap).forEach(([i, v]) => {
          fiberTrayEditData.value[i] = v
        })
        ElMessage.success(`已导入 ${Object.keys(newFiberMap).length} 条光纤信息`)
      } catch (err) {
        console.error('导入错误:', err)
        ElMessage.error('导入失败：文件格式错误或已损坏')
      }
    }
    reader.readAsArrayBuffer(file)
  }
  input.click()
}

// 生成配线架端口悬浮提示文本
function getPatchPortTooltip(portNum) {
  const data = portEditData.value[portNum]
  const panel = editingPanel.value
  if (!panel) return `端口${portNum}`
  // 本端位置：机柜位置/U位/端口号#/
  const basePosition = panel.aEndPosition || generatePortALabel(selectedCabinet.value, panel.startU || 1)
  const localPos = basePosition ? `${basePosition}/${portNum}#/` : `端口${portNum}`
  // B端信息
  let bEnd = '未连接'
  if (data?.to) {
    bEnd = data.to
  } else if (data?.connectDeviceId) {
    const targetDev = cabinetNetworkDevices.value.find(d => d.id === data.connectDeviceId)
    bEnd = targetDev?.name || data.connectPort || '已连接'
  }
  // 端口名称
  const portName = data?.portName ? ` [${data.portName}]` : ''
  // 线缆类型
  const cable = data?.cable ? `\n线缆: ${data.cable.toUpperCase()}` : ''
  return `本端端口号：${localPos}${portName}\n→ B端: ${bEnd}${cable}`
}

// 生成ODF光纤芯悬浮提示文本
function getODFTooltip(coreNum) {
  const data = odfEditData.value[coreNum]
  const odf = editingODF.value
  if (!odf) return `芯${coreNum}`
  const basePosition = odf.aEndPosition || generatePortALabel(selectedCabinet.value, odf.startU || 1)
  const localPos = basePosition ? `${basePosition}/${coreNum}#/` : `芯${coreNum}`
  const bEnd = data?.to || '未连接'
  const fiberType = data?.fiberType ? `\n类型: ${data.fiberType}` : ''
  return `本端芯号：${localPos}\n→ B端: ${bEnd}${fiberType}`
}

// 生成光纤盘悬浮提示文本
function getFiberTrayTooltip(coreNum) {
  const data = fiberTrayEditData.value[coreNum]
  const tray = editingFiberTray.value
  if (!tray) return `芯${coreNum}`
  const basePosition = tray.aEndPosition || generatePortALabel(selectedCabinet.value, tray.startU || 1)
  const localPos = basePosition ? `${basePosition}/${coreNum}#/` : `芯${coreNum}`
  const bEnd = data?.to || '未连接'
  const fiberType = data?.fiberType ? `\n类型: ${data.fiberType}` : ''
  return `本端芯号：${localPos}\n→ B端: ${bEnd}${fiberType}`
}

function showPortInfo(event, item, port) {
  const info = item.portMap?.[port]
  portTooltip.value = {
    visible: true,
    x: event.clientX + 10,
    y: event.clientY - 10,
    port,
    info: info || null
  }
}

function hidePortInfo() {
  portTooltip.value.visible = false
}

// 显示设备前面板对话框
function getVendorLogoClass(vendor) {
  if (!vendor) return 'vendor-default'
  const v = vendor.toLowerCase()
  if (v.includes('h3c') || v.includes('华三')) return 'vendor-h3c'
  if (v.includes('huawei') || v.includes('华为')) return 'vendor-huawei'
  if (v.includes('cisco') || v.includes('思科')) return 'vendor-cisco'
  if (v.includes('ruijie') || v.includes('锐捷')) return 'vendor-ruijie'
  if (v.includes('aruba')) return 'vendor-aruba'
  return 'vendor-default'
}
function getVendorLogoText(vendor) {
  if (!vendor) return 'N'
  const v = vendor.toLowerCase()
  if (v.includes('h3c') || v.includes('华三')) return 'H3C'
  if (v.includes('huawei') || v.includes('华为')) return 'HW'
  if (v.includes('cisco') || v.includes('思科')) return 'CS'
  if (v.includes('ruijie') || v.includes('锐捷')) return 'RJ'
  if (v.includes('aruba')) return 'AR'
  return vendor.substring(0, 2).toUpperCase()
}
function getVendorLogoImage(vendor) {
  if (!vendor) return ''
  const v = vendor.toLowerCase()
  if (v.includes('huawei') || v.includes('华为')) return './vendor-logos/huawei.png'
  if (v.includes('cisco') || v.includes('思科')) return './vendor-logos/cisco.png'
  if (v.includes('tp-link') || v.includes('tplink')) return './vendor-logos/tp-link.png'
  if (v.includes('dahua') || v.includes('大华')) return './vendor-logos/dahua.png'
  if (v.includes('hikvision') || v.includes('hik') || v.includes('海康')) return './vendor-logos/hikvision.png'
  if (v.includes('ruijie') || v.includes('锐捷')) return './vendor-logos/ruijie.png'
  if (v.includes('网御') || v.includes('leadsec')) return './vendor-logos/leadsec.png'
  if (v.includes('h3c') || v.includes('华三')) return './vendor-logos/h3c.png'
  return ''
}
function showDevicePanel(device) {
  if (!device) return
  devicePanelData.value = device

  // 从设备库获取端口信息，判断前后面板端口数量
  const model = deviceLibStore.models.find(m => m.name === device.model)
  const frontEth = model?.frontEthernetPorts || model?.ethernetPorts || 0
  const frontSfp = model?.frontSfpPorts || model?.sfpPorts || 0
  const backEth = model?.backEthernetPorts || 0
  const backSfp = model?.backSfpPorts || 0
  const hasFrontPorts = frontEth > 0 || frontSfp > 0
  const hasBackPorts = backEth > 0 || backSfp > 0

  // 面板显示规则：
  // 1. 服务器设备默认显示后面板
  // 2. 其他设备：如果前面板没有端口但后面板有，默认显示后面板
  const typeLower = (device.type || '').toLowerCase()
  if (typeLower === 'server' || typeLower.includes('server') || typeLower.includes('服务器') || typeLower.includes('storage') || typeLower.includes('存储')) {
    panelMode.value = 'back'
  } else if (!hasFrontPorts && hasBackPorts) {
    panelMode.value = 'back'
  } else {
    panelMode.value = 'front'
  }

  // 获取拓扑中的连接信息
  const topologyConnections = getDeviceConnections(device.id)
  const connectedPorts = new Set(topologyConnections.map(c => c.localPort).filter(Boolean))
  const activePorts = new Set(
    topologyConnections
      .filter(c => c.animated)
      .map(c => c.localPort)
      .filter(Boolean)
  )
  // 构建端口连接映射
  const portConnectionMap = {}
  topologyConnections.forEach(conn => {
    if (conn.localPort) {
      const targetDevice = deviceStore.devices.find(d => d.id === conn.target)
      // 获取对端设备显示名称：优先名称，其次IP，然后型号，最后targetLabel
      let deviceName = targetDevice?.name
      if (!deviceName && targetDevice) {
        deviceName = targetDevice.ip || targetDevice.model || targetDevice.type
      }
      if (!deviceName) deviceName = conn.targetLabel
      if (!deviceName) deviceName = conn.target
      if (!deviceName) deviceName = '未命名设备'
      portConnectionMap[conn.localPort] = {
        deviceName,
        portName: conn.targetPort || conn.remotePort || ''
      }
    }
  })

  // 从所有机柜的配线架中反向查询该设备的端口连接状态
  cabinetStore.cabinets.forEach(cabinet => {
    (cabinet.patchItems || []).forEach(panel => {
      const portMap = panel.portMap || {}
      Object.values(portMap).forEach(portData => {
        if (portData.connectDeviceId === device.id && portData.connectPort) {
          connectedPorts.add(portData.connectPort)
          // 对端设备信息：配线架/ODF/光纤盘
          let deviceName = panel.name
          if (!deviceName) {
            const typeNames = { patch_panel: '配线架', odf: 'ODF框', fiber_tray: '光纤盘', cable_manager: '理线架' }
            deviceName = typeNames[panel.itemType] || panel.itemType || '未命名'
          }
          portConnectionMap[portData.connectPort] = {
            deviceName,
            portName: portData.portName || portData.connectPort || ''
          }
        }
      })
    })
  })

  // 从设备库获取端口信息（model已在函数开头获取）
  const ports = []

  if (model) {
    // 生成以太网端口 (RJ45) - 8x8网格
    const ethCount = model.ethernetPorts || 0
    for (let i = 1; i <= ethCount; i++) {
      const portName = `GE0/0/${i}`
      const isConnected = connectedPorts.has(portName) || connectedPorts.has(`eth${i}`)
      const connInfo = portConnectionMap[portName] || portConnectionMap[`eth${i}`]
      ports.push({
        id: `eth${i}`,
        name: portName,
        type: 'ethernet',
        connected: isConnected,
        hasData: activePorts.has(portName),
        connectDeviceName: connInfo?.deviceName,
        connectPortName: connInfo?.portName
      })
    }
    // 生成SFP端口
    const sfpCount = model.sfpPorts || 0
    for (let i = 1; i <= sfpCount; i++) {
      const portName = `SFP${i}`
      const isConnected = connectedPorts.has(portName) || connectedPorts.has(`sfp${i}`)
      const connInfo = portConnectionMap[portName] || portConnectionMap[`sfp${i}`]
      ports.push({
        id: `sfp${i}`,
        name: portName,
        type: 'sfp',
        connected: isConnected,
        hasData: activePorts.has(portName),
        connectDeviceName: connInfo?.deviceName,
        connectPortName: connInfo?.portName
      })
    }
    // 生成XFP端口
    const xfpCount = model.xfpPorts || 0
    for (let i = 1; i <= xfpCount; i++) {
      const portName = `XFP${i}`
      const isConnected = connectedPorts.has(portName) || connectedPorts.has(`xfp${i}`)
      const connInfo = portConnectionMap[portName] || portConnectionMap[`xfp${i}`]
      ports.push({
        id: `xfp${i}`,
        name: portName,
        type: 'xfp',
        connected: isConnected,
        hasData: activePorts.has(portName),
        connectDeviceName: connInfo?.deviceName,
        connectPortName: connInfo?.portName
      })
    }
  }

  // 加载设备已保存的端口名称
  const savedPortNames = device.portNames || {}

  // 如果没有设备库信息，生成默认端口
  if (ports.length === 0) {
    for (let i = 1; i <= 24; i++) {
      ports.push({
        id: `eth${i}`,
        name: `GE0/0/${i}`,
        customName: savedPortNames[`eth${i}`] || null,
        type: 'ethernet',
        connected: false, // 默认未连接
        hasData: false
      })
    }
    for (let i = 1; i <= 4; i++) {
      ports.push({
        id: `sfp${i}`,
        name: `SFP${i}`,
        customName: savedPortNames[`sfp${i}`] || null,
        type: 'sfp',
        connected: false, // 默认未连接
        hasData: false
      })
    }
  } else {
    // 应用已保存的自定义名称
    ports.forEach(p => {
      if (savedPortNames[p.id]) {
        p.customName = savedPortNames[p.id]
      }
    })
  }

  // 从所有机柜的配线架中反向查询该设备的端口连接状态
  const connectedPortIds = new Set()
  cabinetStore.cabinets.forEach(cabinet => {
    (cabinet.patchItems || []).forEach(panel => {
      const portMap = panel.portMap || {}
      Object.values(portMap).forEach(portData => {
        if (portData.connectDeviceId === device.id && portData.connectPort) {
          connectedPortIds.add(portData.connectPort)
        }
      })
    })
  })
  ports.forEach(p => {
    if (connectedPortIds.has(p.id)) {
      p.connected = true
    }
  })

  devicePanelPorts.value = ports
  // 初始化端口名称编辑数据
  portNameEdits.value = {}
  ports.forEach(p => {
    portNameEdits.value[p.id] = p.customName || p.name
  })
  portEditMode.value = false

  // 初始化后面板端口名称编辑数据
  backPortNameEdits.value = {}
  const savedBackNames = device.backPortNames || {}
  const defaultBackNames = {
    mgmt: 'MGMT', console: 'Console', ilo: 'iLO/iDRAC',
    usb1: 'USB 1', usb2: 'USB 2', vga: 'VGA', serial: 'Serial',
    psu1: '电源模块 1', psu2: '电源模块 2'
  }
  Object.keys(defaultBackNames).forEach(id => {
    backPortNameEdits.value[id] = savedBackNames[id] || defaultBackNames[id]
  })
  backPortEditMode.value = false

  devicePanelDialog.value = true
}

// 保存端口自定义名称
function savePortNames() {
  const updatedPorts = devicePanelPorts.value.map(p => ({
    ...p,
    customName: portNameEdits.value[p.id] || p.name
  }))
  devicePanelPorts.value = updatedPorts

  // 保存到设备数据中
  const device = devicePanelData.value
  if (device) {
    const portNames = {}
    updatedPorts.forEach(p => {
      if (p.customName && p.customName !== p.name) {
        portNames[p.id] = p.customName
      }
    })
    // 更新设备的端口名称映射
    deviceStore.updateDevice(device.id, { portNames })
    // 关键：把新端口名同步到连接快照，机柜悬停/连线编辑框立即显示新名
    portStateStore.clearDevicePortCache(device.id)
    Object.entries(portNames).forEach(([pid, name]) => {
      portStateStore.syncPortNameToConnections(device.id, pid, name)
    })
  }

  portEditMode.value = false
  ElMessage.success('端口名称已保存')
}

// 保存后面板端口自定义名称
function saveBackPortNames() {
  const device = devicePanelData.value
  if (!device) return

  const defaultNames = {
    mgmt: 'MGMT', console: 'Console', ilo: 'iLO/iDRAC',
    usb1: 'USB 1', usb2: 'USB 2', vga: 'VGA', serial: 'Serial',
    psu1: '电源模块 1', psu2: '电源模块 2'
  }
  const backPortNames = { ...(device.backPortNames || {}) }

  Object.entries(backPortNameEdits.value).forEach(([id, name]) => {
    if (name && name !== defaultNames[id]) {
      backPortNames[id] = name
    } else {
      delete backPortNames[id]
    }
  })

  deviceStore.updateDevice(device.id, { backPortNames })
  backPortEditMode.value = false
  ElMessage.success('后面板端口名称已保存')
}

// 设备前面板端口分类

// 只有交换机类型且端口数 >= 8 时使用两排交错排列

// RJ45端口按真实交换机两排交错排列（上排偶数、下排奇数）

// 端口连线相关 - 使用全局端口状态管理器
// 连接表单状态
const portConnectForm = ref({
  portType: 'ethernet',
  portId: '',
  deviceId: '',
  deviceName: '',
  portNum: 0,
  localPortName: '',
  targetDeviceId: '',
  targetPortId: '',
  cableType: '',
  occupied: false,
  connectionId: '',
  remoteDeviceName: '',
  remotePortName: '',
  existingCableType: '',
  deviceModel: '',
  deviceIp: '',
  deviceLocation: '',
  remoteDeviceModel: '',
  remoteDeviceIp: '',
  remoteDeviceLocation: '',
  createdAt: ''
})

// 根据端口类型返回可用线缆选项
const availableCableOptions = computed(() => {
  if (portConnectForm.value.portType === 'optical') {
    return portStateStore.OPTICAL_CABLES
  }
  return portStateStore.ETHERNET_CABLES
})

// 扁平化可用目标端口列表
const availableTargetPortsFlat = computed(() => {
  const portType = portConnectForm.value.portType
  const excludeDeviceId = portConnectForm.value.deviceId
  const excludePortId = portConnectForm.value.portId

  const allDevices = deviceStore.devices || []
  const patchPorts = []
  cabinetStore.cabinets.forEach(cabinet => {
    (cabinet.patchItems || []).forEach(panel => {
      if (panel.itemType === 'patch_panel' || panel.category === 'patch_panel') {
        const panelName = panel.name || ('配线架 - ' + (cabinet.name || ''))
        for (let p = 1; p <= (panel.ports || 24); p++) {
          patchPorts.push({ panelId: panel.id, panelName: panelName, portNum: p })
        }
      }
    })
  })

  return portStateStore.getAvailablePorts(portType, excludeDeviceId, excludePortId, allDevices, patchPorts)
})

// 从可用端口列表提取不重复的设备列表（用于级联选择器）
const availableTargetDevices = computed(() => {
  const map = new Map()
  for (const ap of availableTargetPortsFlat.value) {
    if (!map.has(ap.deviceId)) {
      map.set(ap.deviceId, { deviceId: ap.deviceId, deviceName: ap.deviceName })
    }
  }
  return Array.from(map.values())
})

// 按机柜分组的可选设备（用于"选择设备"下拉：先显示机柜，再显示该机柜上架的设备）
const availableTargetDeviceGroups = computed(() => {
  const groups = new Map() // 机柜名 -> 设备数组
  const seen = new Set()
  for (const ap of availableTargetPortsFlat.value) {
    if (seen.has(ap.deviceId)) continue
    seen.add(ap.deviceId)
    const info = getDeviceCabinetInfo(ap.deviceId)
    const cabinetName = info.cabinetName || '未上架设备'
    if (!groups.has(cabinetName)) groups.set(cabinetName, [])
    const device = deviceStore.devices.find(d => String(d.id) === String(ap.deviceId))
    groups.get(cabinetName).push({
      deviceId: ap.deviceId,
      deviceName: ap.deviceName,
      deviceModel: device?.model || '',
      deviceIp: device?.ip || '',
      uPosition: info.uPosition || ''
    })
  }
  return Array.from(groups.entries()).map(([cabinetName, devices]) => ({ cabinetName, devices }))
})

// 根据选择的设备过滤可用端口
const targetDevicePorts = computed(() => {
  const deviceId = portConnectForm.value.targetDeviceId
  if (!deviceId) return []
  return availableTargetPortsFlat.value.filter(ap => ap.deviceId === deviceId)
})

// 已连接端口的占位信息
const availableTargetPortsGrouped = computed(() => {
  const portType = portConnectForm.value.portType
  const excludeDeviceId = portConnectForm.value.deviceId
  const excludePortId = portConnectForm.value.portId
  
  const allDevices = deviceStore.devices || []
  const patchPorts = []
  cabinetStore.cabinets.forEach(cabinet => {
    (cabinet.patchItems || []).forEach(panel => {
      if (panel.itemType === 'patch_panel' || panel.category === 'patch_panel') {
        const panelName = panel.name || ('配线架 - ' + (cabinet.name || ''))
        for (let p = 1; p <= (panel.ports || 24); p++) {
          patchPorts.push({ panelId: panel.id, panelName: panelName, portNum: p })
        }
      }
    })
  })
  
  const available = portStateStore.getAvailablePorts(portType, excludeDeviceId, excludePortId, allDevices, patchPorts)
  
  const groups = {}
  available.forEach(ap => {
    const key = ap.deviceName
    if (!groups[key]) groups[key] = []
    groups[key].push(ap)
  })
  
  return Object.entries(groups).map(([label, ports]) => ({
    label: label + ' (' + ports.length + '个可用端口)',
    ports
  }))
})

// ===== 配线架端口批量命名 =====
const patchRenameVisible = ref(false)
const patchRenameDevice = ref(null)
const patchRenamePort = ref(1)
const patchRenameValue = ref('')
const patchRenameTotal = ref(24)

function getPatchPortName(device, portNum) {
  const pm = (device && device.portMap) || {}
  const info = pm[portNum] || pm[String(portNum)] || {}
  return info.portName || ''
}

function handlePatchRename({ device, portNum }) {
  if (!device || !portNum) return
  patchRenameDevice.value = device
  patchRenamePort.value = portNum
  patchRenameValue.value = getPatchPortName(device, portNum)
  const rawTotal = device.ports_count || (typeof device.ports === 'number' ? device.ports : 0) || 24
  patchRenameTotal.value = Number(rawTotal) || 24
  patchRenameVisible.value = true
  nextTick(() => { const el = document.getElementById('patch-rename-input'); el && el.focus() })
}

function savePatchRename() {
  const device = patchRenameDevice.value
  const portNum = patchRenamePort.value
  if (!device || !portNum) return
  if (!device.portMap) device.portMap = {}
  if (!device.portMap[portNum]) device.portMap[portNum] = {}
  device.portMap[portNum].portName = patchRenameValue.value
}

function patchRenameNext() {
  savePatchRename()
  if (patchRenamePort.value < patchRenameTotal.value) {
    patchRenamePort.value += 1
    patchRenameValue.value = getPatchPortName(patchRenameDevice.value, patchRenamePort.value)
    nextTick(() => { const el = document.getElementById('patch-rename-input'); el && el.focus() })
  }
}

function patchRenameDone() {
  savePatchRename()
  patchRenameVisible.value = false
}

const connectingPortName = computed(() => {
  if (!connectingPort.value) return ''
  return connectingPort.value.customName || connectingPort.value.name || connectingPort.value.id || ''
})

// 辅助函数：根据设备ID查询所在机柜名和U位
function getDeviceCabinetInfo(deviceId) {
  if (!deviceId) return { cabinetName: '', name: '', uPosition: '' }
  const cabinets = cabinetStore.cabinets || []
  for (const cab of cabinets) {
    if (cab.slots && typeof cab.slots === 'object') {
      for (const [uPos, slotDeviceId] of Object.entries(cab.slots)) {
        if (String(slotDeviceId) === String(deviceId)) {
          const cabinetName = cab.name || cab.id || '未知机柜'
          return { cabinetName, name: cabinetName, uPosition: uPos + 'U' }
        }
      }
    }
    if (Array.isArray(cab.patchItems)) {
      for (const item of cab.patchItems) {
        // 网络设备：匹配 item.deviceId；配线设备（patch/odf等）：匹配 item.id
        if (String(item.deviceId) === String(deviceId) || String(item.id) === String(deviceId)) {
          const cabinetName = cab.name || cab.id || '未知机柜'
          return { cabinetName, name: cabinetName, uPosition: item.uPosition ? item.uPosition + 'U' : (item.label || '') }
        }
      }
    }
  }
  return { cabinetName: '', name: '', uPosition: '' }
}

// 根据设备ID查找其所在的机柜对象（slots 或 patchItems）
function getCabinetOfDevice(deviceId) {
  if (!deviceId) return null
  const cabinets = cabinetStore.cabinets || []
  for (const cab of cabinets) {
    if (cab.slots && typeof cab.slots === 'object') {
      for (const [, slotDeviceId] of Object.entries(cab.slots)) {
        if (String(slotDeviceId) === String(deviceId)) return cab
      }
    }
    if (Array.isArray(cab.patchItems)) {
      for (const item of cab.patchItems) {
        if (String(item.deviceId) === String(deviceId) || String(item.id) === String(deviceId)) return cab
      }
    }
  }
  return null
}

// 生成"选择设备"下拉选项的显示文本（filterable 搜索依据）
function formatDeviceOptionLabel(d) {
  if (!d) return ''
  let label = d.deviceName || ''
  if (d.deviceModel) label += '（' + d.deviceModel + '）'
  if (d.uPosition) label += ' · ' + d.uPosition
  return label
}

// 端口点击：已占用端口显示连接信息，可用端口打开连线对话框
function onPortClick(port) {
  if (!port || !port.connectable) return
  const deviceId = devicePanelData.value?.id
  if (!deviceId) return
  const isOccupied = portStateStore.isPortOccupied(deviceId, port.id)
  if (isOccupied) {
    openEditConnection(port)
  } else {
    openPortConnect(port)
  }
}

function openEditConnection(port) {
  const deviceId = devicePanelData.value?.id
  const portId = port.id
  const connInfo = portStateStore.getPortConnection(deviceId, portId)
  if (!connInfo) return

  // 查询对端设备所在机柜信息
  const remoteCabinet = getDeviceCabinetInfo(connInfo.remoteDeviceId)

  editConnectionData.value = {
    deviceId: deviceId,
    portId: portId,
    portType: port.portType || 'ethernet',
    deviceName: devicePanelData.value?.name || '',
    portName: port.name || port.id,
    connectionId: connInfo.connectionId,
    remoteDeviceId: connInfo.remoteDeviceId,
    remoteDeviceName: connInfo.remoteDeviceName || '',
    remotePortId: connInfo.remotePortId,
    remotePortNum: connInfo.remotePortNum || '',
    cableType: connInfo.cableType || '',
    remoteCabinetName: remoteCabinet.cabinetName,
    remoteUPosition: remoteCabinet.uPosition
  }
  editConnectionVisible.value = true
}

async function saveConnectionEdit() {
  try {
    const result = await portStateStore.updateCableType(
      editConnectionData.value.connectionId,
      editConnectionData.value.cableType
    )
    if (result.success) {
      ElMessage.success(result.message)
      editConnectionVisible.value = false
      // 刷新端口状态
      portStateStore.clearDevicePortCache(editConnectionData.value.deviceId)
      portStateStore.clearDevicePortCache(editConnectionData.value.remoteDeviceId)
    } else {
      ElMessage.error(result.message)
    }
  } catch (e) {
    ElMessage.error('保存失败：' + e.message)
  }
}

async function disconnectConnection() {
  try {
    const result = await portStateStore.disconnectPorts(editConnectionData.value.connectionId)
    if (result.success) {
      ElMessage.success(result.message)
      editConnectionVisible.value = false
      // 刷新端口缓存，确保三页面同步
      portStateStore.clearDevicePortCache(editConnectionData.value.deviceId)
      portStateStore.clearDevicePortCache(editConnectionData.value.remoteDeviceId)
    } else {
      ElMessage.error(result.message)
    }
  } catch (e) {
    ElMessage.error('断开失败：' + e.message)
  }
}

// 更改连线：断开当前连接后进入连线模式
async function changeConnection() {
  try {
    const result = await portStateStore.disconnectPorts(editConnectionData.value.connectionId)
    if (result.success) {
      ElMessage.success('已断开原连接，请选择新的连线目标')
      editConnectionVisible.value = false
      // 刷新端口缓存
      portStateStore.clearDevicePortCache(editConnectionData.value.deviceId)
      portStateStore.clearDevicePortCache(editConnectionData.value.remoteDeviceId)
      // 进入连线模式：打开端口连接对话框
      nextTick(() => {
        openPortConnect({
          id: editConnectionData.value.portId,
          name: editConnectionData.value.portName,
          portType: editConnectionData.value.portType || 'ethernet'
        })
      })
    } else {
      ElMessage.error(result.message)
    }
  } catch (e) {
    ElMessage.error('更改连线失败：' + e.message)
  }
}

// 根据厂家返回logo文字
const devicePanelLogo = computed(() => {
  const m = (devicePanelData.value?.manufacturer || devicePanelData.value?.vendor || '').toLowerCase()
  if (m.includes('h3c') || m.includes('hpe') || m.includes('comware') || m.includes('华三')) return 'H3C'
  if (m.includes('huawei') || m.includes('hw') || m.includes('vrp') || m.includes('华为')) return 'HW'
  if (m.includes('cisco') || m.includes('思科')) return 'CISCO'
  if (m.includes('tp-link') || m.includes('tplink')) return 'TP-LINK'
  if (m.includes('dahua') || m.includes('大华')) return 'DAHUA'
  if (m.includes('hikvision') || m.includes('hik') || m.includes('海康')) return 'HIKVISION'
  if (m.includes('ruijie') || m.includes('锐捷')) return 'RUIJIE'
  return 'NET'
})

function openPortConnect(port) {
  if (portEditMode.value || backPortEditMode.value) return
  connectingPort.value = port
  
  const deviceId = port.deviceId || devicePanelData.value?.id
  const portId = port.id
  const deviceName = port.deviceName || devicePanelData.value?.name || ''
  
  // 判断端口类型
  const portType = port.portType || port.type
  const normalizedType = (portType === 'sfp' || portType === 'xfp' || portType === 'optical') ? 'optical' : 'ethernet'
  
  // 获取端口号
  let portNum = port.portNumber || port.portNum || 0
  if (!portNum) {
    const match = portId.match(/(\d+)$/)
    if (match) portNum = parseInt(match[1])
  }
  
  // 清除端口缓存以获取最新状态
  portStateStore.clearDevicePortCache(deviceId)
  
  // 检查是否已占用
  const isOccupied = portStateStore.isPortOccupied(deviceId, portId)
  const connInfo = portStateStore.getPortConnection(deviceId, portId)
  
  const localDev = deviceStore.devices.find(d => String(d.id) === String(deviceId))
  const localLoc = getDeviceCabinetInfo(deviceId)
  const remoteDevId = connInfo?.remoteDeviceId
  const remoteDev = remoteDevId ? deviceStore.devices.find(d => String(d.id) === String(remoteDevId)) : null
  const remoteLoc = remoteDevId ? getDeviceCabinetInfo(remoteDevId) : null

  portConnectForm.value = {
    portType: normalizedType,
    portId: portId,
    deviceId: deviceId,
    deviceName: deviceName,
    portNum: portNum,
    // 预填本端端口名称（配线架从 portMap 读取，普通设备从 portNames/customName 读取）
    localPortName: port?.customName || port?.name || port?.portName || String(portNum || ''),
    targetDeviceId: '',
    targetPortId: '',
    cableType: normalizedType === 'optical' ? 'LC单模光纤' : '六类网线',
    occupied: isOccupied,
    connectionId: connInfo?.connectionId || '',
    remoteDeviceName: connInfo?.remoteDeviceName || resolveDeviceName(connInfo?.remoteDeviceId) || '',
    remotePortName: connInfo?.remotePortNum || '',
    existingCableType: connInfo?.cableType || '',
    deviceModel: localDev?.model || localDev?.model_number || '',
    deviceIp: localDev?.ip || '',
    deviceLocation: localLoc && localLoc.cabinetName ? `${localLoc.cabinetName}/${localLoc.uPosition}` : '',
    remoteDeviceModel: remoteDev?.model || remoteDev?.model_number || '',
    remoteDeviceIp: remoteDev?.ip || '',
    remoteDeviceLocation: remoteLoc && remoteLoc.cabinetName ? `${remoteLoc.cabinetName}/${remoteLoc.uPosition}` : '',
    createdAt: connInfo?.createdAt || ''
  }
  
  portConnectVisible.value = true
}

function openPatchPortConnect(portNum) {
  if (!editingPanel.value) return
  patchPortEditNum.value = portNum
  const data = portEditData.value[portNum] || {}
  const basePosition = editingPanel.value.aEndPosition || generatePortALabel(selectedCabinet.value, editingPanel.value.startU || 1)

  // 从全局端口状态管理器读取当前连接
  const panelId = editingPanel.value.id
  const aPortId = 'patch-' + portNum
  const conn = portStateStore.getPortConnection(panelId, aPortId)

  let connectDeviceId = data.connectDeviceId || ''
  let connectPort = data.connectPort || ''
  let cable = data.cable || ''

  // 如果全局状态管理器中有连接，优先使用全局状态
  if (conn) {
    connectDeviceId = conn.remoteDeviceId || ''
    // remotePortId 是完整ID如 deviceId-eth1，需要提取端口键
    const remotePortKey = conn.remotePortId ? conn.remotePortId.replace(makePortId(conn.remoteDeviceId, ''), '') : ''
    connectPort = remotePortKey || ''
    cable = conn.cableType || ''
  }

  patchPortEditForm.value = {
    portName: data.portName || '',
    from: data.from || (basePosition ? `${basePosition}/${portNum}#/` : ''),
    connectDeviceId,
    connectPort,
    cable
  }
  patchPortEditVisible.value = true
}

// ODF框端口点击连线
function openODFPortConnect(fiberNum) {
  if (!editingODF.value) return
  odfPortEditNum.value = fiberNum
  const data = odfEditData.value[fiberNum] || {}
  const basePosition = editingODF.value.aEndPosition || generatePortALabel(selectedCabinet.value, editingODF.value.startU || 1)

  // 从全局端口状态管理器读取当前连接
  const odfId = editingODF.value.id
  const aPortId = 'fiber-' + fiberNum
  const conn = portStateStore.getPortConnection(odfId, aPortId)

  let connectDeviceId = data.connectDeviceId || ''
  let connectPort = data.connectPort || ''
  let cable = data.cable || ''

  if (conn) {
    connectDeviceId = conn.remoteDeviceId || ''
    const prefix = conn.remoteDeviceId + '-'
    connectPort = conn.remotePortId && conn.remotePortId.startsWith(prefix)
      ? conn.remotePortId.slice(prefix.length)
      : conn.remotePortId || ''
    cable = conn.cableType || ''
  }

  odfPortEditForm.value = {
    portName: data.portName || `芯${fiberNum}`,
    from: data.from || (basePosition ? `${basePosition}/${fiberNum}#/` : ''),
    connectDeviceId,
    connectPort,
    cable
  }
  odfPortEditVisible.value = true
}

// 光纤盘端口点击连线
function openFiberTrayPortConnect(fiberNum) {
  if (!editingFiberTray.value) return
  fiberTrayPortEditNum.value = fiberNum
  const data = fiberTrayEditData.value[fiberNum] || {}
  const basePosition = editingFiberTray.value.aEndPosition || generatePortALabel(selectedCabinet.value, editingFiberTray.value.startU || 1)

  // 从全局端口状态管理器读取当前连接
  const trayId = editingFiberTray.value.id
  const aPortId = 'fiber-' + fiberNum
  const conn = portStateStore.getPortConnection(trayId, aPortId)

  let connectDeviceId = data.connectDeviceId || ''
  let connectPort = data.connectPort || ''
  let cable = data.cable || ''

  if (conn) {
    connectDeviceId = conn.remoteDeviceId || ''
    const prefix = conn.remoteDeviceId + '-'
    connectPort = conn.remotePortId && conn.remotePortId.startsWith(prefix)
      ? conn.remotePortId.slice(prefix.length)
      : conn.remotePortId || ''
    cable = conn.cableType || ''
  }

  fiberTrayPortEditForm.value = {
    portName: data.portName || `芯${fiberNum}`,
    from: data.from || (basePosition ? `${basePosition}/${fiberNum}#/` : ''),
    connectDeviceId,
    connectPort,
    cable
  }
  fiberTrayPortEditVisible.value = true
}

function savePatchPortEdit() {
  const portNum = patchPortEditNum.value
  const form = { ...patchPortEditForm.value }

  // ====== 全局端口状态管理器同步 ======
  const panelId = editingPanel.value?.id
  const aPortId = 'patch-' + portNum
  const aPortFullId = panelId ? makePortId(panelId, aPortId) : null

  // 1. 检查A端是否已有全局连接，有则先断开
  const existingConn = panelId ? portStateStore.getPortConnection(panelId, aPortId) : null
  if (existingConn) {
    portStateStore.disconnectPorts(existingConn.connectionId)
  }

  // 2. 如果用户选择了B端，创建新连接
  if (form.connectDeviceId && form.connectPort && form.cable) {
    const targetDev = deviceStore.devices.find(d => d.id === form.connectDeviceId)
    const portA = {
      deviceId: panelId,
      portId: aPortId,
      deviceName: editingPanel.value?.name || '配线架',
      portNum: portNum,
      portType: 'ethernet'
    }
    const portB = {
      deviceId: form.connectDeviceId,
      portId: form.connectPort,
      deviceName: targetDev?.name || '',
      portNum: form.connectPort,
      portType: 'ethernet'
    }
    const result = portStateStore.connectPorts(portA, portB, form.cable)
    if (!result.success) {
      ElMessage.error(result.message)
      return
    }
  }

  // 同步B端到to字段（兼容现有逻辑）
  if (form.connectDeviceId) {
    const targetDev = deviceStore.devices.find(d => d.id === form.connectDeviceId)
    const devName = targetDev?.name || form.connectDeviceId
    form.to = `${devName}${form.connectPort ? '·' + form.connectPort : ''}`
  } else {
    form.to = ''
  }
  portEditData.value[portNum] = { ...form }

  // 立即同步到 cabinet 的 patchItems.portMap，确保双向连接可见
  if (editingPanel.value) {
    const allPortMap = {}
    Object.entries(portEditData.value).forEach(([p, v]) => {
      if (v.from || v.to || v.portName || v.connectDeviceId) {
        allPortMap[p] = v
      }
    })
    const cabinetId = selectedCabinet.value?.id
    if (cabinetId) {
      const patchItems = (selectedCabinet.value.patchItems || []).map(i =>
        i.id === editingPanel.value.id ? { ...i, portMap: allPortMap } : i
      )
      cabinetStore.updateCabinet(cabinetId, { patchItems })
    }
  }

  // 拓扑连线已随 portStateStore 连接自动派生，无需单独同步旧拓扑 store
  // （syncPatchPortToTopology 已在 Step 4 删除）

  patchPortEditVisible.value = false
  ElMessage.success(`端口 ${portNum} 信息已保存`)
}

// 保存ODF框端口连线
function saveODFPortEdit() {
  const fiberNum = odfPortEditNum.value
  const form = { ...odfPortEditForm.value }

  // ====== 全局端口状态管理器同步 ======
  const odfId = editingODF.value?.id
  const aPortId = 'fiber-' + fiberNum

  // 1. 检查A端是否已有全局连接，有则先断开
  const existingConn = odfId ? portStateStore.getPortConnection(odfId, aPortId) : null
  if (existingConn) {
    portStateStore.disconnectPorts(existingConn.connectionId)
  }

  // 2. 如果用户选择了B端，创建新连接
  if (form.connectDeviceId && form.connectPort && form.cable) {
    const targetDev = deviceStore.devices.find(d => d.id === form.connectDeviceId)
    const portA = {
      deviceId: odfId,
      portId: aPortId,
      deviceName: editingODF.value?.name || 'ODF框',
      portNum: fiberNum,
      portType: 'optical'
    }
    const portB = {
      deviceId: form.connectDeviceId,
      portId: form.connectPort,
      deviceName: targetDev?.name || '',
      portNum: form.connectPort,
      portType: 'optical'
    }
    const result = portStateStore.connectPorts(portA, portB, form.cable)
    if (!result.success) {
      ElMessage.error(result.message)
      return
    }
  }

  // 同步B端到to字段
  if (form.connectDeviceId) {
    const targetDev = deviceStore.devices.find(d => d.id === form.connectDeviceId)
    const devName = targetDev?.name || form.connectDeviceId
    form.to = `${devName}${form.connectPort ? '·' + form.connectPort : ''}`
  } else {
    form.to = ''
  }
  odfEditData.value[fiberNum] = { ...form }

  odfPortEditVisible.value = false
  ElMessage.success(`ODF芯 ${fiberNum} 信息已保存`)
}

// 保存光纤盘端口连线
function saveFiberTrayPortEdit() {
  const fiberNum = fiberTrayPortEditNum.value
  const form = { ...fiberTrayPortEditForm.value }

  // ====== 全局端口状态管理器同步 ======
  const trayId = editingFiberTray.value?.id
  const aPortId = 'fiber-' + fiberNum

  // 1. 检查A端是否已有全局连接，有则先断开
  const existingConn = trayId ? portStateStore.getPortConnection(trayId, aPortId) : null
  if (existingConn) {
    portStateStore.disconnectPorts(existingConn.connectionId)
  }

  // 2. 如果用户选择了B端，创建新连接
  if (form.connectDeviceId && form.connectPort && form.cable) {
    const targetDev = deviceStore.devices.find(d => d.id === form.connectDeviceId)
    const portA = {
      deviceId: trayId,
      portId: aPortId,
      deviceName: editingFiberTray.value?.name || '光纤盘',
      portNum: fiberNum,
      portType: 'optical'
    }
    const portB = {
      deviceId: form.connectDeviceId,
      portId: form.connectPort,
      deviceName: targetDev?.name || '',
      portNum: form.connectPort,
      portType: 'optical'
    }
    const result = portStateStore.connectPorts(portA, portB, form.cable)
    if (!result.success) {
      ElMessage.error(result.message)
      return
    }
  }

  // 同步B端到to字段
  if (form.connectDeviceId) {
    const targetDev = deviceStore.devices.find(d => d.id === form.connectDeviceId)
    const devName = targetDev?.name || form.connectDeviceId
    form.to = `${devName}${form.connectPort ? '·' + form.connectPort : ''}`
  } else {
    form.to = ''
  }
  fiberTrayEditData.value[fiberNum] = { ...form }

  fiberTrayPortEditVisible.value = false
  ElMessage.success(`光纤盘芯 ${fiberNum} 信息已保存`)
}

function savePortConnect() {
  doConnectPort()
}

function removePortConnect() {
  doDisconnectPort()
}

function doConnectPort() {
  const form = portConnectForm.value
  if (!form.targetDeviceId || !form.targetPortId || !form.cableType) {
    ElMessage.error('请选择目标设备和端口，以及线缆类型')
    return
  }
  
  const targetPortInfo = findTargetPortInfo(form.targetPortId)
  if (!targetPortInfo) {
    ElMessage.error('目标端口信息不正确')
    return
  }

  // 本端端口显示名：对话框改名 > 设备自定义名 > 标准名（eth5 → GE0/0/5）
  const localName = (form.localPortName || '').trim()
  const localDev = deviceStore.devices.find(d => String(d.id) === String(form.deviceId))
  const localPortDisplayName = localName
    || (localDev ? resolvePortName(localDev, form.portId) : standardPortName(form.portId))

  const portA = {
    deviceId: form.deviceId,
    portId: form.portId,
    deviceName: form.deviceName,
    portNum: localPortDisplayName,
    portType: form.portType
  }

  // 保存本端端口自定义名称（配线架 portMap + 普通设备 device.portNames）
  if (localName) {
    saveLocalPortName(form.deviceId, form.portId, localName)
  }

  const portB = {
    deviceId: targetPortInfo.deviceId,
    portId: targetPortInfo.portId,
    deviceName: targetPortInfo.deviceName,
    // 连线快照存端口显示名（GE0/0/5 / SFP2 / 端口3），不再是数字端口号
    portNum: targetPortInfo.portName || targetPortInfo.portId,
    portType: targetPortInfo.portType || form.portType
  }
  
  const result = portStateStore.connectPorts(portA, portB, form.cableType)
  
  if (result.success) {
    // 拓扑连线已随 portStateStore 连接自动派生，无需同步旧 topology store
    syncToPatchPanel(form.deviceId, form.portId, targetPortInfo.deviceId, targetPortInfo.portId, form.cableType, localName)
    syncToPatchPanel(targetPortInfo.deviceId, targetPortInfo.portId, form.deviceId, form.portId, form.cableType)
    
    ElMessage.success('端口连接成功！' + form.portId + ' ↔ ' + targetPortInfo.portId)
    portConnectVisible.value = false
    
    // 强制DeviceDetailPanel重新加载端口状态
    refreshDevicePanelPorts()
  } else {
    ElMessage.error(result.message)
  }
}

function doDisconnectPort() {
  const form = portConnectForm.value
  if (!form.connectionId) {
    ElMessage.error('未找到连接信息')
    return
  }
  
  const result = portStateStore.disconnectPorts(form.connectionId)
  if (result.success) {
    // 拓扑连线已随 portStateStore 连接断开自动派生消失，无需操作旧 topology store
    removeFromPatchPanelForState(result.disconnected.portA.deviceId, result.disconnected.portA.portId)
    removeFromPatchPanelForState(result.disconnected.portB.deviceId, result.disconnected.portB.portId)
    
    ElMessage.success('连接已断开')
    portConnectVisible.value = false
    
    refreshDevicePanelPorts()
  } else {
    ElMessage.error(result.message)
  }
}

// 强制刷新设备面板端口显示
// 通过创建新的device对象引用，触发DeviceDetailPanel的watch重新加载端口数据
function refreshDevicePanelPorts() {
  if (!devicePanelData.value) return
  portStateStore.clearDevicePortCache(devicePanelData.value.id)
  // Clone设备对象以创建新引用，触发DeviceDetailPanel的watch
  devicePanelData.value = { ...devicePanelData.value }
}

// 从targetPortId查找完整端口信息
function findTargetPortInfo(targetPortId) {
  const dashIdx = targetPortId.lastIndexOf('-')
  if (dashIdx < 0) return null
  
  const deviceId = targetPortId.substring(0, dashIdx)
  const portKey = targetPortId.substring(dashIdx + 1)
  
  let deviceName = ''
  let portNumber = 0
  let portName = ''
  let portType = portConnectForm.value.portType

  if (portKey.startsWith('patch-')) {
    const match = portKey.match(/patch-(\d+)/)
    if (match) portNumber = parseInt(match[1])
    portType = 'ethernet'
    portName = standardPortName(portKey) // patch-3 → 端口3
    cabinetStore.cabinets.forEach(cabinet => {
      (cabinet.patchItems || []).forEach(panel => {
        if (panel.id === deviceId) {
          deviceName = panel.name || ('配线架 - ' + (cabinet.name || ''))
        }
      })
    })
    if (!deviceName) deviceName = '配线架'
  } else {
    const device = deviceStore.devices.find(d => d.id === deviceId)
    deviceName = device?.name || ''
    const match = portKey.match(/(\d+)$/)
    if (match) portNumber = parseInt(match[1])
    portType = portStateStore.inferPortType(portKey)
    // 端口显示名：自定义名优先，其次标准名（eth5 → GE0/0/5）
    portName = device ? resolvePortName(device, portKey) : standardPortName(portKey)
  }

  return { deviceId, portId: portKey, deviceName, portNumber, portName, portType }
}

// 保存本端端口自定义名称：
// 普通设备 → device.portNames[portId]；配线架 → portMap[portNum].portName（见 syncToPatchPanel）
function saveLocalPortName(deviceId, portId, name) {
  // 配线架：portMap 保存由 syncToPatchPanel 处理，这里处理普通设备
  const patchMatch = String(portId).match(/^patch-(\d+)$/)
  if (patchMatch) return // 配线架端口名称由 syncToPatchPanel 写入 portMap

  const dev = deviceStore.devices.find(d => String(d.id) === String(deviceId))
  if (!dev) return
  if (!dev.portNames) dev.portNames = {}
  dev.portNames[portId] = name
  deviceStore.updateDevice(deviceId, { portNames: { ...dev.portNames } })
  // 关键：同步更新已有连接快照中的端口名，悬停/连线编辑框立即显示新名，不再显示旧信息
  portStateStore.syncPortNameToConnections(deviceId, portId, name)
  portStateStore.clearDevicePortCache(deviceId)
}

function syncToPatchPanel(deviceId, portId, targetDeviceId, targetPortId, cableType, localName) {
  cabinetStore.cabinets.forEach(cabinet => {
    const items = cabinet.patchItems || []
    const panel = items.find(p => p.id === deviceId)
    if (panel && (panel.itemType === 'patch_panel' || panel.category === 'patch_panel')) {
      const portMap = panel.portMap || {}
      const match = portId.match(/patch-(\d+)/)
      if (match) {
        const portNum = parseInt(match[1])
        const portObj = {
          connectDeviceId: targetDeviceId,
          connectPort: targetPortId,
          cable: cableType
        }
        // 保存本端端口自定义名称
        if (localName && String(localName).trim()) {
          portObj.portName = String(localName).trim()
        }
        portMap[portNum] = portObj
        const updatedItems = items.map(i =>
          i.id === panel.id ? { ...i, portMap: { ...portMap } } : i
        )
        cabinetStore.updateCabinet(cabinet.id, { patchItems: updatedItems })
        nextTick(() => {
          selectedCabinet.value = cloneCabinetById(cabinet.id)
        })
      }
    }
  })
}

function removeFromPatchPanelForState(deviceId, portId) {
  cabinetStore.cabinets.forEach(cabinet => {
    const items = cabinet.patchItems || []
    const panel = items.find(p => p.id === deviceId)
    if (panel && (panel.itemType === 'patch_panel' || panel.category === 'patch_panel')) {
      const portMap = panel.portMap || {}
      const match = portId.match(/patch-(\d+)/)
      if (match) {
        const portNum = parseInt(match[1])
        if (portMap[portNum]) {
          delete portMap[portNum]
          const updatedItems = items.map(i =>
            i.id === panel.id ? { ...i, portMap: { ...portMap } } : i
          )
          cabinetStore.updateCabinet(cabinet.id, { patchItems: updatedItems })
          nextTick(() => {
            selectedCabinet.value = cloneCabinetById(cabinet.id)
          })
        }
      }
    }
  })
}

</script>

<style lang="scss" scoped>
/* 真实面板弹窗单栏 */
.real-panel-dialog :deep(.el-dialog__body) {
  padding-top: 10px;
}

.cabinets-view {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--bg-glass);

  @media (max-width: 768px) {
    padding: 12px;
    gap: 10px;
  }
}

.stats-row {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}

.mini-stat {
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 10px 16px;
  text-align: center;
  flex: 1;
}
.mini-stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}
.mini-stat-label {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.cabinets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  flex-shrink: 0;
}

.cabinet-card {
  cursor: pointer;
  transition: var(--transition);
  &:hover,
  &.active {
    border-color: var(--info);
    box-shadow:
      0 0 0 1px rgba(56, 189, 248, 0.2),
      var(--shadow-md);
    transform: translateY(-2px);
  }
}

.cabinet-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;

  @media (max-width: 768px) {
    gap: 8px;
    margin-bottom: 8px;

    .el-button {
      padding: 4px 8px;
      font-size: 11px;
    }
  }
}

.cabinet-svg {
  width: 40px;
  height: 64px;
  @media (max-width: 768px) {
    width: 32px;
    height: 52px;
  }
}

.cabinet-info {
  flex: 1;
  min-width: 0;
}
.cabinet-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.cabinet-type-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 6px;
  margin-top: 3px;
  display: inline-block;
  font-weight: 500;
  &.server {
    background: rgba(56, 189, 248, 0.15);
    color: var(--info);
  }
  &.patch {
    background: rgba(0, 122, 204, 0.15);
    color: var(--accent);
  }
}

.cabinet-actions {
  display: flex;
  gap: 4px;
}

.cabinet-meta {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.divider {
  color: var(--text-muted);
}
.free-u {
  color: var(--accent);
}

.u-progress {
  width: 100%;
  height: 3px;
  background: var(--bg-glass-strong);
  border-radius: 2px;
  margin-top: 8px;
}
.u-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--info), var(--purple));
  border-radius: 2px;
  transition: width 0.4s cubic-bezier(0.32, 0.72, 0, 1);
}

.empty-cabinets {
  text-align: center;
  padding: 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--text-muted);
  font-size: 13px;
}

// 机柜详情区
.cabinet-detail-area {
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 16px;
  display: flex;
  flex-direction: column;
  flex: 1;
}

// 全屏模式
.cabinet-detail-area.fullscreen-mode {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2000;
  border-radius: 0;
  border: none;
  padding: 16px;
  background: var(--bg-base, #0d1117);
  display: flex;
  flex-direction: column;
  overflow: hidden;

  .detail-body {
    flex: 1;
    min-height: 0;
  }

  .rack-info-panel {
    position: absolute;
    right: 16px;
    top: 64px;
    bottom: 16px;
    width: 320px;
    max-width: 320px;
    min-width: auto;
    z-index: 10;
    box-shadow: -4px 0 24px rgba(0, 0, 0, 0.3);
    border-radius: var(--radius-md);
    opacity: 0.95;
  }

  :deep(.cabinet-viewport) {
    max-height: none !important;
    height: 100%;
    min-height: 0;
  }

  :deep(.cabinet-rack-visual) {
    height: 100%;
    flex: 1;
  }

  /* 全屏时缩放控制条移到顶部工具栏空白处，避免遮挡右侧信息面板的"机柜详情"标题 */
  :deep(.zoom-controls) {
    position: fixed;
    top: 12px;
    right: 132px;
    z-index: 2001;
  }
}

// 详情区主体（SVG + 信息面板并列）
.detail-body {
  display: flex;
  flex-direction: row;
  gap: 16px;
  flex: 1;
  min-height: 0;
  align-items: stretch;
}

.detail-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  .el-icon {
    color: var(--info);
  }
}

.detail-toolbar-title {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.spec-info {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: normal;
  margin-left: 8px;
}

// 服务器机柜3D可视化
.server-cabinet-visual {
  display: flex;
  gap: 20px;
  align-items: stretch;
  flex: 1;
  justify-content: flex-start;
}

.rack-container {
  display: flex;
  justify-content: center;
  flex-shrink: 0;
  min-width: 600px;
}

// 真实机柜样式
.rack-3d {
  width: 100%;
  min-width: 560px;
  max-width: 100%;
  background: linear-gradient(180deg, #1c1c1e 0%, #000000 100%);
  border: 2px solid #48484a;
  border-radius: 6px 6px 0 0; /* 顶部保留圆角，底部直角以便边框延伸 */
  display: flex;
  flex-direction: column;
  box-shadow:
    inset 0 0 30px rgba(0, 0, 0, 0.6),
    0 8px 32px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.05);
  position: relative;
}

// 机柜顶部通风孔
.rack-3d::before {
  content: "";
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  width: 80%;
  height: 4px;
  background: repeating-linear-gradient(
    90deg,
    #3a3a3c 0px,
    #3a3a3c 8px,
    transparent 8px,
    transparent 12px
  );
  border-radius: 2px;
  pointer-events: none;
}

.rack-top {
  height: 10px;
  background: linear-gradient(180deg, #48484a 0%, #3a3a3c 100%);
  border-radius: 4px 4px 0 0;
  padding: 2px 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #48484a;
  border-bottom: none;
  margin: 0;
}

.rack-top-inner {
  height: 100%;
  width: 100%;
  background: linear-gradient(180deg, #2c2c2e 0%, #1c1c1e 100%);
  border-radius: 2px;
  border: 1px solid #3a3a3c;
}

.rack-body-3d {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: linear-gradient(90deg, #1c1c1e 0%, #000000 50%, #1c1c1e 100%);
  border-left: 2px solid #48484a;
  border-right: 2px solid #48484a;
  border-bottom: 2px solid #48484a; /* 添加底部边框 */
}

.rack-unit {
  height: 30px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  display: flex;
  align-items: center;
  position: relative;
  transition: background 0.2s cubic-bezier(0.32, 0.72, 0, 1);
  overflow: visible;

  &:hover {
    background: rgba(255, 255, 255, 0.02);
  }
  &.drag-over {
    background: rgba(56, 189, 248, 0.1);
    border: 1px dashed var(--info);
    border-bottom: none;
  }
  &.has-device {
    background: linear-gradient(90deg, rgba(56, 189, 248, 0.05), transparent);
    border-bottom-color: rgba(56, 189, 248, 0.08);
  }
}

.u-label {
  width: 32px;
  text-align: center;
  font-size: 9px;
  color: #636366;
  font-family: "SF Mono", monospace;
  flex-shrink: 0;
  font-weight: 500;
}

// 安装孔 - 真实螺丝孔样式
.mounting-holes {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 6px;
  flex-shrink: 0;
}

.hole {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #1c1c1e;
  border: 1px solid #48484a;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.5);
  transition: all 0.2s;

  &.occupied {
    background: var(--warning);
    border-color: var(--warning);
    box-shadow:
      0 0 4px var(--warning),
      inset 0 1px 2px rgba(0, 0, 0, 0.3);
  }
}

// 设备块 - 真实设备前面板
.device-block {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  background: linear-gradient(180deg, #2c2c2e 0%, #1c1c1e 100%);
  border: 1px solid #3a3a3c;
  border-radius: 4px;
  margin: 1px 0;
  cursor: grab;
  min-height: 26px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 1px 3px rgba(0, 0, 0, 0.3);
  overflow: hidden;

  // 设备前面板端口指示
  &::before {
    content: "";
    position: absolute;
    right: 60px;
    top: 50%;
    transform: translateY(-50%);
    width: 40px;
    height: 4px;
    background: repeating-linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.1) 0px,
      rgba(255, 255, 255, 0.1) 3px,
      transparent 3px,
      transparent 5px
    );
    border-radius: 1px;
  }

  &:active {
    cursor: grabbing;
  }

  &:hover {
    border-color: #48484a;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 2px 6px rgba(0, 0, 0, 0.4);
  }
}

.device-led {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  position: relative;

  &.online {
    background: var(--accent);
    box-shadow:
      0 0 6px var(--accent),
      0 0 12px rgba(0, 122, 204, 0.3);
    animation: led-pulse 2s ease-in-out infinite;
  }
  &.offline {
    background: var(--danger);
    box-shadow: 0 0 4px var(--danger);
  }
}

@keyframes led-pulse {
  0%,
  100% {
    opacity: 1;
    box-shadow:
      0 0 6px var(--accent),
      0 0 12px rgba(0, 122, 204, 0.3);
  }
  50% {
    opacity: 0.7;
    box-shadow:
      0 0 3px var(--accent),
      0 0 6px rgba(0, 122, 204, 0.2);
  }
}

.device-info {
  flex: 1;
  min-width: 0;
}

.device-name-text {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.device-meta-text {
  font-size: 9px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.device-u-tag {
  background: rgba(56, 189, 248, 0.2);
  color: var(--info);
  font-size: 8px;
  padding: 1px 3px;
  border-radius: 2px;
  margin-left: 4px;
}

.unmount-btn {
  font-size: 9px !important;
  padding: 2px 6px !important;
  flex-shrink: 0;
}

.rack-bottom {
  height: 10px; /* 增加高度 */
  background: linear-gradient(180deg, #3a3a3c 0%, #48484a 50%, #3a3a3c 100%);
  position: relative;
  border: none; /* 移除边框，避免重复 */
  margin: 0;
}

/* 机柜底座加强筋 */
.rack-bottom::before {
  content: "";
  position: absolute;
  top: 3px;
  left: 50%;
  transform: translateX(-50%);
  width: 70%;
  height: 3px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    #636366 10%,
    #636366 90%,
    transparent 100%
  );
  border-radius: 1px;
}

.rack-bottom::after {
  content: "";
  position: absolute;
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
  width: 60%;
  height: 2px;
  background: repeating-linear-gradient(
    90deg,
    #3a3a3c 0px,
    #3a3a3c 6px,
    transparent 6px,
    transparent 10px
  );
  border-radius: 1px;
}

.rack-bottom-inner {
  display: none;
}

// 机柜信息面板
.rack-info-panel {
  flex: 1;
  min-width: 320px;
  max-width: 480px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 0;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--border-color);

  .panel-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;

    .el-icon { font-size: 16px; }
  }
}

// 信息表格
.info-table {
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color);
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  font-size: 12px;

  + .info-row { border-top: 1px solid var(--border-color); }
}

.info-label {
  color: var(--text-muted);
  flex-shrink: 0;
}

.info-value {
  color: var(--text-primary);
  font-weight: 500;
  text-align: right;

  &.accent-blue { color: var(--info); font-weight: 600; }
  &.accent-green { color: var(--accent); font-weight: 600; }
  &.accent-purple { color: var(--purple); font-weight: 600; }
}

.usage-bar-wrap {
  display: inline-flex;
  width: 60px;
  height: 6px;
  background: var(--bg-glass-strong);
  border-radius: 3px;
  vertical-align: middle;
  margin-right: 6px;
  overflow: hidden;
}

.usage-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--info), var(--accent));
  border-radius: 3px;
  transition: width 0.4s ease;
}

.usage-text {
  font-weight: 600;
  color: var(--text-primary);
  vertical-align: middle;
}

// 设备类型
.section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  padding: 10px 16px 6px;
}

.type-section {
  border-bottom: 1px solid var(--border-color);
}

.type-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 16px 10px;
}

.type-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 11px;
  background: var(--bg-glass-strong);
  border: 1px solid var(--border-color);

  &.switch { color: var(--info); border-color: rgba(0, 122, 204,0.3); }
  &.router { color: var(--accent); border-color: rgba(48,209,88,0.3); }
  &.firewall { color: var(--warning); border-color: rgba(255,159,10,0.3); }
  &.server { color: var(--purple); border-color: rgba(191,90,242,0.3); }
  &.storage { color: var(--danger); border-color: rgba(255,69,58,0.3); }
  &.kvm { color: var(--purple); border-color: rgba(94,92,230,0.3); }
  &.pdu { color: var(--warning); border-color: rgba(255,214,10,0.3); }
}

.chip-count {
  font-weight: 700;
  font-size: 12px;
}

.chip-label {
  color: var(--text-secondary);
}

// 设备列表
.device-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;

  + .device-section {
    border-top: 1px solid var(--border-color);
    flex: none;
    max-height: 200px;
  }
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  flex-shrink: 0;

  .section-label {
    padding: 0;
  }
}

.device-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.device-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: var(--bg-glass-strong);
  }
}

.device-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;

  &.online { background: var(--accent); }
  &.offline { background: var(--text-muted); }
  &.warning { background: var(--warning); }
  &.alarm { background: var(--danger); }
}

.device-item-body {
  flex: 1;
  min-width: 0;
}

.device-item-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.device-item-meta {
  font-size: 10px;
  color: var(--text-muted);
  display: flex;
  gap: 6px;
  margin-top: 1px;

  .ip-badge {
    color: var(--info);
    background: rgba(0, 122, 204,0.08);
    padding: 0 5px;
    border-radius: 3px;
  }
}

.device-item-u {
  font-size: 10px;
  font-weight: 600;
  color: var(--info);
  background: rgba(0, 122, 204,0.08);
  padding: 1px 8px;
  border-radius: 8px;
  flex-shrink: 0;
}

.device-item-actions {
  flex-shrink: 0;
  display: flex;
  gap: 2px;
}

.empty-tip {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  color: var(--text-muted);
  font-size: 12px;
  gap: 4px;
}

.panel-title,
.info-grid,
.info-item,
.info-value-old,
.info-label-old,
.mounted-section,
.mounted-section-header,
.mounted-section-title,
.title-dot,
.mounted-list-scroll,
.mounted-card,
.mounted-card-led,
.mounted-card-body,
.mounted-card-name,
.mounted-card-meta,
.mounted-card-right,
.u-badge,
.status-text,
.led-pulse,
.usage-dashboard,
.usage-ring-wrap,
.usage-ring-svg,
.ring-progress,
.ring-center-text,
.ring-percent,
.ring-label,
.usage-stats-grid,
.usage-stat-item,
.usage-stat-val,
.usage-stat-lbl,
.mounted-empty,
.device-types-row,
.types-label,
.types-tags,
.type-tag,
.type-tag-icon,
.type-tag-count,
.type-tag-label,
.meta-tag {
  /* 已整合到新组件中，保留空样式避免解析错误 */  
}

.mounted-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mounted-meta {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 1px;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.mounted-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.patch-name-input {
  width: 140px;

  :deep(.el-input__wrapper) {
    padding: 0 6px;
  }

  :deep(.el-input__inner) {
    font-size: 12px;
    font-weight: 600;
    height: 22px;
  }
}

.device-ip-tag {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 10px;
  font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
  background: rgba(56, 189, 248, 0.15);
  color: var(--info);
  white-space: nowrap;
}

.device-ip-mini {
  display: inline-block;
  padding: 0px 4px;
  border-radius: 3px;
  font-size: 9px;
  font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
  background: rgba(56, 189, 248, 0.15);
  color: var(--info);
  white-space: nowrap;
  margin-right: 4px;
}

.mounted-status {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;

  &.online {
    background: rgba(0, 122, 204, 0.15);
    color: var(--accent);
  }
  &.offline {
    background: rgba(239, 68, 68, 0.15);
    color: var(--danger);
  }
}

.mounted-empty {
  text-align: center;
  padding: 20px;
  font-size: 12px;
  color: var(--text-muted);
}

.height-spec {
  border-top: 1px solid var(--border-color);
  padding-top: 12px;
}

.spec-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.spec-table {
  font-size: 10px;
  color: var(--text-secondary);
}

.spec-row {
  display: grid;
  grid-template-columns: 50px 70px 70px 1fr;
  gap: 4px;
  padding: 4px 0;
  border-bottom: 1px solid rgba(48, 54, 61, 0.3);

  &.header {
    font-weight: 600;
    color: var(--text-muted);
    border-bottom-color: var(--border-color);
  }
}

// 配线机柜
.patch-cabinet-visual {
}
.patch-rack-container {
  width: 100%;
}
.patch-rack {
  min-height: 200px;
  background: #0d1117;
  border: 2px solid #30363d;
  border-radius: 4px;
  padding: 4px;
}

.patch-item {
  border-bottom: 1px solid #1c2128;
  padding: 4px 8px;
}

.patch-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.patch-label {
  flex: 1;
  font-size: 12px;
  color: var(--text-primary);
}

.patch-type-tag {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 600;
  flex-shrink: 0;
  background: rgba(56, 189, 248, 0.2);
  color: var(--info);
  &.cm {
    background: rgba(0, 122, 204, 0.2);
    color: var(--accent);
  }
  &.odf {
    background: rgba(188, 140, 255, 0.2);
    color: var(--purple);
  }
  &.ft {
    background: rgba(56, 189, 248, 0.2);
    color: var(--info);
  }
}

.ports-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.port {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  padding: 2px 3px;
  border-radius: 3px;
  transition: background 0.15s;
  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }
}

.port-num {
  font-size: 8px;
  color: #484f58;
  font-family: monospace;
}

.port-hole {
  width: 12px;
  height: 8px;
  border: 1px solid #30363d;
  border-radius: 2px;
  background: #0a0d10;
  margin-top: 1px;
  &.connected {
    background: var(--info);
    border-color: var(--info);
    box-shadow: 0 0 4px var(--info);
  }
}

.cable-manager-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.cable-manager-rings {
  display: flex;
  gap: 8px;
  padding: 4px 8px;
}
.cable-ring {
  width: 20px;
  height: 14px;
  border: 2px solid #30363d;
  border-radius: 10px;
  background: #161b22;
}

.odf-visual {
  padding: 4px 0;
}
.odf-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.odf-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.odf-row-label {
  font-size: 9px;
  color: #484f58;
  width: 24px;
  text-align: right;
  flex-shrink: 0;
}

.odf-port {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  padding: 2px;
  border-radius: 2px;
  transition: background 0.15s;
  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }
}
.odf-port-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid #484f58;
  background: #0d1117;
}
.odf-port.connected .odf-port-dot {
  background: var(--purple);
  border-color: var(--purple);
  box-shadow: 0 0 4px var(--purple);
}
.odf-port-num {
  font-size: 7px;
  color: #484f58;
  font-family: monospace;
  margin-top: 1px;
}

// ========== 配线架/ODF可视化面板样式 ==========
.patch-visual-panel,
.odf-visual-panel {
  margin-bottom: 16px;
  padding: 10px 8px;
  background: var(--bg-glass-strong);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
}
.visual-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  .visual-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }
  .visual-count {
    font-size: 11px;
    color: var(--text-secondary);
    background: var(--bg-glass);
    padding: 2px 8px;
    border-radius: 10px;
  }
}

// 配线架端口可视化
.visual-ports-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  justify-content: center;
  &.two-row {
    flex-direction: column;
    gap: 8px;
    .port-row {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
      justify-content: center;
    }
  }
  // 单行模式(24口)使用紧凑端口，确保不换行
  &:not(.two-row) .visual-port {
    width: 38px;
    padding: 2px 1px;
    .visual-port-num { font-size: 7px; }
  }
  // 双行模式: 每行也使用更紧凑的布局
  &.two-row .port-row .visual-port {
    width: 40px;
    padding: 2px 1px;
    .visual-port-num { font-size: 7px; }
  }
}
.visual-port {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 40px;
  padding: 3px 2px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
  &:hover {
    background: rgba(255, 255, 255, 0.06);
  }
  &.connected {
    .mini-rj45 {
      border-color: var(--accent);
      box-shadow: 0 0 8px rgba(0, 122, 204, 0.3);
      background: linear-gradient(180deg, #2a5a3a 0%, #1a4a2a 100%);
    }
    .mini-rj45-led {
      background: var(--accent);
      box-shadow: 0 0 4px var(--accent);
    }
  }
  .visual-port-num {
    font-size: 9px;
    color: var(--text-muted);
    font-family: monospace;
    margin-top: 3px;
  }
}

// 迷你RJ45端口（与交换机RJ45-body一致）
.mini-rj45 {
  width: 32px;
  height: 32px;
  background: linear-gradient(180deg, #1c1c1e 0%, #000 100%);
  border: 1px solid #48484a;
  border-radius: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 3px;
  .mini-rj45-top {
    width: 20px;
    height: 2px;
    background: #3a3a3c;
    border-radius: 1px;
    margin-bottom: 2px;
  }
  .mini-rj45-pins {
    display: flex;
    gap: 1px;
    .pin {
      width: 2px;
      height: 4px;
      background: #636366;
      border-radius: 0 0 1px 1px;
    }
  }
  .mini-rj45-led {
    position: absolute;
    bottom: 2px;
    right: 2px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #3a3a3c;
    transition: all 0.3s;
    &.on {
      background: var(--accent);
      box-shadow: 0 0 4px var(--accent);
    }
  }
}

// ODF光纤芯可视化
.visual-fibers-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 4px;
}
.visual-fiber {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 2px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
  &:hover {
    background: rgba(255, 255, 255, 0.06);
  }
  &.connected {
    .mini-fiber-body {
      border-color: var(--purple);
      background: rgba(167, 139, 250, 0.15);
    }
    .mini-fiber-led,
    .fiber-led {
      background: var(--purple);
      box-shadow: 0 0 4px var(--purple);
    }
  }
  .visual-fiber-num {
    font-size: 9px;
    color: var(--text-muted);
    font-family: monospace;
    margin-top: 2px;
  }
  .visual-fiber-icon {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
  }
}

// 迷你光纤端口（类似SFP）
.mini-fiber {
  width: 20px;
  height: 14px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  .mini-fiber-body {
    width: 16px;
    height: 10px;
    background: #1a1f25;
    border: 1px solid #30363d;
    border-radius: 2px;
    position: relative;
  }
  .mini-fiber-tip {
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 6px;
    background: #484f58;
    border-radius: 0 1px 1px 0;
  }
  .mini-fiber-led {
    position: absolute;
    bottom: 0;
    left: 3px;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: #30363d;
    &.on {
      background: var(--purple);
      box-shadow: 0 0 3px var(--purple);
    }
  }
}

.fiber-tray-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.fiber-tray-visual {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 8px;
}
.fiber-spool {
  width: 30px;
  height: 20px;
  border: 2px solid var(--info);
  border-radius: 50%;
  background: rgba(56, 189, 248, 0.1);
  position: relative;
  &::before {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 8px;
    height: 8px;
    background: var(--info);
    border-radius: 50%;
    opacity: 0.5;
  }
}
.fiber-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.empty-patch {
  padding: 40px;
  text-align: center;
  font-size: 12px;
  color: #484f58;
}

// 端口悬浮提示
.port-tooltip {
  position: fixed;
  z-index: 9999;
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-primary);
  box-shadow: var(--shadow-md);
  pointer-events: none;
  min-width: 160px;
}
.tooltip-title {
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--info);
}
.tooltip-body {
  color: var(--text-secondary);
  line-height: 1.8;
}
.tooltip-empty {
  color: var(--text-muted);
  font-size: 11px;
}

.mount-conflict {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--danger);
  margin-top: 8px;
}

.info-notice {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-glass-strong);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  margin-bottom: 8px;
  line-height: 1.6;
}

.form-hint {
  margin-left: 8px;
  font-size: 11px;
  color: var(--text-muted);
}
.form-tip {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}

// 端口名称编辑
.port-edit-mode-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  background: var(--bg-glass-strong);
  border-radius: var(--radius-sm);
  margin-bottom: 12px;

  .mode-bar-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .mode-bar-right {
    display: flex;
    align-items: center;
    gap: 6px;

    .panel-toggle-label {
      font-size: 12px;
      color: var(--text-secondary);
    }
  }
}
.port-name-input {
  width: 56px !important;
  :deep(.el-input__inner) {
    padding: 0 2px !important;
    font-size: 8px !important;
    height: 16px !important;
    line-height: 16px !important;
    text-align: center !important;
  }
  :deep(.el-input__wrapper) {
    padding: 0 2px !important;
    min-height: 16px !important;
  }
  :deep(.el-input) {
    font-size: 8px !important;
  }
}

// 端口编辑
.port-edit-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 500px;
  overflow-y: auto;
}
.port-edit-row {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 3px 4px;
  border-radius: 4px;
  transition: background 0.2s;

  &.port-connected {
    background: rgba(0, 122, 204, 0.06);
    border-left: 2px solid var(--accent);
  }

  .el-input {
    flex-shrink: 0;
    :deep(.el-input__inner) {
      font-size: 11px;
      padding: 0 6px;
      height: 26px;
    }
    :deep(.el-input__wrapper) {
      padding: 0 4px;
    }
  }
  .el-select {
    flex-shrink: 0;
    :deep(.el-input__inner) {
      font-size: 11px;
      padding: 0 6px;
      height: 26px;
    }
    :deep(.el-input__wrapper) {
      padding: 0 4px;
    }
  }
}

.port-edit-led {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;

  &.connected {
    background: var(--accent);
    box-shadow: 0 0 6px rgba(0, 122, 204, 0.5);
  }
  &.free {
    background: var(--border-color);
  }
}

.port-edit-num {
  width: 42px;
  font-size: 11px;
  color: var(--text-secondary);
  flex-shrink: 0;
  font-family: monospace;
}

// ODF编辑
.odf-edit-area {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 500px;
  overflow-y: auto;
}
.odf-edit-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.odf-edit-num {
  width: 45px;
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
  font-family: monospace;
}

// ========== 设备前面板可视化样式 ==========
.device-panel-dialog {
  :deep(.el-dialog__body) {
    padding: 0;
  }
}

.device-panel-content {
  padding: 20px;
}

// 设备详细信息
.device-detail-info {
  margin-bottom: 20px;
  padding: 16px;
  background: var(--bg-glass-strong);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
}

.detail-info-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.detail-info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);

  &.ip {
    color: var(--info);
    font-family: monospace;
  }

  &.online {
    color: var(--accent);
  }

  &.offline {
    color: var(--danger);
  }
}

// 设备前面板
.device-front-panel {
  background: linear-gradient(180deg, #2c2c2e 0%, #1c1c1e 100%);
  border: 2px solid #48484a;
  border-radius: 8px;
  padding: 16px;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #3a3a3c;
}

.panel-brand {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.panel-model {
  font-size: 12px;
  color: var(--text-muted);
  flex: 1;
}

.panel-leds {
  display: flex;
  gap: 8px;
  align-items: center;
}

.panel-led {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  transition: all 0.3s;

  &.sys-led {
    &.online {
      background: var(--accent);
      box-shadow: 0 0 8px var(--accent);
      animation: led-blink 2s ease-in-out infinite;
    }
    &.offline {
      background: var(--danger);
      box-shadow: 0 0 4px var(--danger);
    }
  }

  &.pwr-led {
    &.on {
      background: var(--info);
      box-shadow: 0 0 6px var(--info);
    }
  }
}

// 端口区域
.ports-area {
  display: flex;
  flex-direction: column;
  gap: 20px;

  &.back-panel {
    gap: 16px;
  }
}

// 后面板样式
.back-panel-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.15);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-secondary);

  .el-icon {
    color: var(--info);
    flex-shrink: 0;
  }
}

.back-ports-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.back-port-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--bg-glass-strong);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  transition: var(--transition);

  &.connected {
    border-color: rgba(0, 122, 204, 0.3);
    background: rgba(0, 122, 204, 0.05);
  }

  .back-port-icon {
    width: 28px;
    height: 28px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(56, 189, 248, 0.12);
    color: var(--info);

    &.psu-icon {
      background: rgba(245, 158, 11, 0.12);
      color: var(--warning);
    }
  }

  .back-port-name {
    font-size: 12px;
    color: var(--text-primary);
    font-weight: 500;
  }

  .back-port-led {
    width: 6px;
    height: 6px;
    border-radius: 50%;

    &.on {
      background: var(--accent);
      box-shadow: 0 0 4px rgba(0, 122, 204, 0.5);
    }
    &.off {
      background: var(--border-color);
    }
  }

  &.editing {
    padding: 6px 10px;
    .back-port-input {
      width: 100px;
      :deep(.el-input__inner) {
        font-size: 11px;
        height: 24px;
        padding: 0 6px;
      }
      :deep(.el-input__wrapper) {
        padding: 0 4px;
      }
    }
  }
}

// 后面板迷你RJ45端口图标
.back-port-icon.rj45-icon {
  background: transparent;
  width: 32px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;

  .mini-rj45 {
    width: 18px;
    height: 22px;
    background: #303133;
    border-radius: 2px 2px 0 0;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 2px;

    .mini-rj45-top {
      width: 14px;
      height: 2px;
      background: #606266;
      border-radius: 1px;
      margin-bottom: 2px;
    }

    .mini-rj45-pins {
      display: flex;
      gap: 1px;
      flex-wrap: wrap;
      justify-content: center;
      width: 14px;

      .mini-pin {
        width: 1.5px;
        height: 5px;
        background: #c0c4cc;
        border-radius: 0.5px;
      }
    }
  }
}

// 后面板迷你SFP端口图标
.back-port-icon.sfp-icon {
  background: transparent;
  width: 32px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;

  .mini-sfp {
    width: 18px;
    height: 22px;
    background: #303133;
    border: 1px solid #606266;
    border-radius: 2px;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 3px;

    .mini-sfp-notch {
      width: 10px;
      height: 2px;
      background: #909399;
      border-radius: 1px;
      margin-bottom: 2px;
    }

    .mini-sfp-latch {
      width: 6px;
      height: 4px;
      background: #606266;
      border-radius: 0 0 2px 2px;
    }
  }
}

.empty-panel-notice {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px;
  color: var(--text-muted);
  font-size: 13px;
  background: var(--bg-glass-strong);
  border-radius: var(--radius-md);
  margin: 8px 0;
}

.port-section {
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .section-label {
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .section-label-logo {
    font-size: 13px;
    font-weight: 900;
    color: var(--info);
    font-family: Arial, sans-serif;
    letter-spacing: 1px;
    padding: 1px 6px;
    border-radius: 3px;
    background: rgba(56, 189, 248, 0.1);
    border: 1px solid rgba(56, 189, 248, 0.18);
  }

  .section-label-logo-img {
    height: 20px;
    width: auto;
    object-fit: contain;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.08);
    padding: 2px 4px;
  }

  .section-count {
    font-size: 10px;
    color: var(--text-secondary);
    background: rgba(255, 255, 255, 0.05);
    padding: 2px 8px;
    border-radius: 4px;
  }
}

// RJ45端口 - 真实交换机两排交错排列
.rj45-ports-real {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-x: visible;
  width: 100%;
  min-width: 0;
  border: 1px solid #48484a;
  border-radius: 4px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);

  &.compact {
    gap: 2px;
    padding: 4px;

    .port-row {
      gap: 2px;
      flex-wrap: nowrap;
      overflow-x: auto;
    }

    .rj45-port {
      padding: 1px;
      gap: 1px;
      flex-shrink: 0;
    }

    .rj45-body {
      width: 28px;
      height: 28px;
      padding-top: 2px;
    }

    .rj45-top {
      width: 20px;
      height: 2px;
      margin-bottom: 1px;
    }

    .rj45-pins .pin {
      width: 1.5px;
      height: 3px;
    }

    .rj45-label {
      font-size: 5px;
      white-space: nowrap;
    }

    .port-name-input {
      width: 28px !important;
    }

    .sfp-inline-group {
      gap: 2px;
      margin-left: 2px;
      padding-left: 4px;

      .sfp-divider {
        margin-right: 2px;
      }
    }
  }
}

.port-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-start;
  overflow-x: visible;
  align-items: flex-end;

  &.top-row {
    padding-bottom: 4px;
    border-bottom: 1px dashed rgba(72, 72, 74, 0.5);
  }

  &.bottom-row {
    padding-top: 4px;
  }
}

.sfp-inline-group {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-left: 4px;
  padding-left: 8px;
  border-left: 1px solid rgba(72, 72, 74, 0.5);

  .sfp-divider {
    display: none;
  }
}

.rj45-port {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  padding: 3px;
  border-radius: 4px;
  transition: background 0.2s;

  &:hover {
    background: rgba(56, 189, 248, 0.1);
  }

  &.connected .rj45-body {
    border-color: var(--accent);
    box-shadow: 0 0 8px rgba(0, 122, 204, 0.3);
    background: linear-gradient(180deg, #2a5a3a 0%, #1a4a2a 100%);
  }
}

.rj45-body {
  width: 32px;
  height: 32px;
  background: linear-gradient(180deg, #1c1c1e 0%, #000 100%);
  border: 1px solid #48484a;
  border-radius: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 3px;
  transition: all 0.3s;
}

.rj45-top {
  width: 20px;
  height: 2px;
  background: #3a3a3c;
  border-radius: 1px;
  margin-bottom: 2px;
}

.rj45-pins {
  display: flex;
  gap: 1px;
  .pin {
    width: 2px;
    height: 4px;
    background: #636366;
    border-radius: 0 0 1px 1px;
  }
}

.rj45-led {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #3a3a3c;
  transition: all 0.3s;

  &.on {
    background: var(--accent);
    box-shadow: 0 0 4px var(--accent);
  }

  &.blinking {
    background: var(--accent);
    box-shadow: 0 0 6px var(--accent);
    animation: led-blink 1s ease-in-out infinite;
  }
}

.rj45-label {
  font-size: 7px;
  color: var(--text-muted);
  font-family: monospace;
  white-space: nowrap;
}

// 非交换机RJ45端口 - 单排网格
.rj45-ports-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
  gap: 8px;
}

// SFP端口 - 自适应网格
.sfp-ports-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(68px, 1fr));
  gap: 10px;
}

.sfp-port {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background 0.2s;

  &:hover {
    background: rgba(56, 189, 248, 0.1);
  }

  &.connected .sfp-body {
    border-color: var(--accent);
    box-shadow: 0 0 8px rgba(0, 122, 204, 0.3);
    background: linear-gradient(180deg, #3a5a3a 0%, #2a4a2a 100%);
  }
}

.sfp-body {
  width: 56px;
  height: 24px;
  background: linear-gradient(180deg, #2c2c2e 0%, #1c1c1e 100%);
  border: 1px solid #48484a;
  border-radius: 0;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}

.sfp-notch {
  width: 20px;
  height: 10px;
  background: #000;
  border: 1px solid #3a3a3c;
  border-radius: 1px;
}

.sfp-latch {
  position: absolute;
  top: -3px;
  right: 6px;
  width: 10px;
  height: 3px;
  background: #636366;
  border-radius: 1px 1px 0 0;
}

.sfp-led {
  position: absolute;
  bottom: 2px;
  left: 2px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #3a3a3c;
  transition: all 0.3s;

  &.on {
    background: var(--accent);
    box-shadow: 0 0 4px var(--accent);
  }

  &.blinking {
    background: var(--accent);
    box-shadow: 0 0 6px var(--accent);
    animation: led-blink 1s ease-in-out infinite;
  }
}

.sfp-label {
  font-size: 9px;
  color: var(--text-muted);
  font-family: monospace;
}

// XFP端口 - 自适应网格
.xfp-ports-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
  gap: 10px;
}

.xfp-port {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background 0.2s;

  &:hover {
    background: rgba(56, 189, 248, 0.1);
  }

  &.connected .xfp-body {
    border-color: var(--accent);
    box-shadow: 0 0 8px rgba(0, 122, 204, 0.3);
    background: linear-gradient(180deg, #3a5a3a 0%, #2a4a2a 100%);
  }
}

.xfp-body {
  width: 72px;
  height: 28px;
  background: linear-gradient(180deg, #2c2c2e 0%, #1c1c1e 100%);
  border: 1px solid #48484a;
  border-radius: 0;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}

.xfp-notch {
  width: 28px;
  height: 12px;
  background: #000;
  border: 1px solid #3a3a3c;
  border-radius: 1px;
}

.xfp-led {
  position: absolute;
  bottom: 2px;
  left: 2px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #3a3a3c;
  transition: all 0.3s;

  &.on {
    background: var(--accent);
    box-shadow: 0 0 4px var(--accent);
  }

  &.blinking {
    background: var(--accent);
    box-shadow: 0 0 6px var(--accent);
    animation: led-blink 1s ease-in-out infinite;
  }
}

.xfp-label {
  font-size: 9px;
  color: var(--text-muted);
  font-family: monospace;
}

// 端口统计栏
.port-stats-bar {
  display: flex;
  gap: 20px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #3a3a3c;
}

.stat {
  display: flex;
  align-items: center;
  gap: 6px;

  .stat-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;

    &.total {
      background: var(--text-muted);
    }
    &.connected {
      background: var(--accent);
    }
    &.free {
      background: var(--info);
    }
    &.active {
      background: var(--warning);
    }
  }

  .stat-label {
    font-size: 10px;
    color: var(--text-muted);
  }

  .stat-value {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);

    &.connected {
      color: var(--accent);
    }
    &.free {
      color: var(--info);
    }
    &.active {
      color: var(--warning);
    }
  }
}

@keyframes led-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

/* 移动端适配 */
@media (max-width: 768px) {
  .cabinets-view {
    gap: 12px;
  }

  .stats-row {
    flex-wrap: wrap;
    gap: 6px;
  }

  .mini-stat {
    padding: 6px 8px;
    min-width: calc(33.33% - 4px);
    flex: none;
  }

  .mini-stat-value {
    font-size: 16px;
  }

  .mini-stat-label {
    font-size: 10px;
  }

  .cabinets-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  /* 机柜卡片整体缩小 */
  .cabinet-card {
    padding: 10px 12px;
  }

  .cabinet-card-header {
    gap: 8px;
    margin-bottom: 6px;
  }

  .cabinet-name {
    font-size: 13px;
  }

  .cabinet-type-badge {
    font-size: 9px;
    padding: 1px 6px;
    margin-top: 2px;
  }

  .cabinet-actions .el-button {
    padding: 3px 6px;
    font-size: 11px;
    min-height: 24px;
  }

  .cabinet-meta {
    font-size: 11px;
    gap: 4px;
  }

  .u-progress {
    margin-top: 5px;
  }

  .empty-cabinets {
    padding: 32px 16px;
  }

  /* 机柜详情区移动端适配 */
  .cabinet-detail-area {
    padding: 12px;
    overflow-x: auto;
    flex: none;
    min-height: auto;
  }

  .detail-toolbar {
    flex-wrap: wrap;
    gap: 8px;
  }

  .detail-toolbar-title {
    flex: none;
    width: 100%;
  }

  /* 机柜可视化缩放 */
  .server-cabinet-visual {
    flex-direction: column;
    gap: 0;
    flex: none;
  }

  .rack-container {
    transform-origin: center top;
    transform: scale(1);
    width: 100%;
    overflow: visible;
    display: flex;
    justify-content: center;
    margin-bottom: -8px;
  }

  .rack-3d {
    width: 100%;
    max-width: 100%;
  }

  .rack-info-panel {
    min-width: auto;
    max-width: 100%;
    padding: 12px;
    margin-top: -8px;
  }

  .info-grid {
    grid-template-columns: 1fr 1fr;
  }

  /* 设备块文字缩小 */
  .device-name-text {
    font-size: 10px;
  }

  .device-meta-text {
    font-size: 8px;
  }

  .unmount-btn {
    font-size: 8px !important;
    padding: 1px 4px !important;
  }

  /* 端口编辑适配 */
  .port-edit-grid {
    max-height: 300px;
  }

  .port-edit-row {
    flex-wrap: wrap;
    gap: 4px;
  }

  /* ODF编辑适配 */
  .odf-edit-area {
    max-height: 300px;
  }

  /* 设备前面板适配 */
  :deep(.device-panel-dialog) {
    width: 96vw !important;
    max-width: 96vw !important;
    margin: 2vh auto !important;
    border-radius: var(--radius-md) !important;
  }

  :deep(.device-panel-dialog .el-dialog__header) {
    padding: 12px 16px;
  }

  :deep(.device-panel-dialog .el-dialog__body) {
    padding: 0;
  }

  .device-panel-content {
    padding: 12px;
  }

  .device-detail-info {
    padding: 12px;
    margin-bottom: 12px;
  }

  .detail-info-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .detail-info-item {
    gap: 2px;
  }

  .detail-label {
    font-size: 9px;
  }

  .detail-value {
    font-size: 12px;
  }

  .device-front-panel {
    padding: 12px;
  }

  .panel-header {
    gap: 8px;
    margin-bottom: 12px;
    padding-bottom: 10px;
  }

  .panel-brand {
    font-size: 13px;
  }

  .rj45-ports-real {
    gap: 4px;

    .port-row {
      gap: 4px;
    }

    .rj45-body {
      width: 28px;
      height: 24px;
    }

    .rj45-label {
      font-size: 7px;
    }
  }

  .rj45-ports-grid {
    grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
    gap: 4px;

    .rj45-body {
      width: 28px;
      height: 24px;
    }

    .rj45-label {
      font-size: 7px;
    }
  }

  .sfp-ports-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }

  .xfp-ports-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }

  .port-stats-bar {
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 12px;
    padding-top: 10px;
  }
}

// 移动端对话框适配
@media (max-width: 768px) {
  :deep(.cabinet-dialog) {
    width: 96vw !important;
    max-width: 96vw !important;
    margin: 2vh auto !important;

    .el-dialog__body {
      padding: 12px 16px;
    }

    .el-dialog__header {
      padding: 12px 16px;
    }

    .el-dialog__footer {
      padding: 10px 16px;
    }
  }

  /* 机柜对话框表单居中对齐 */
  :deep(.cabinet-dialog .el-form-item) {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    margin-bottom: 12px;
  }

  :deep(.cabinet-dialog .el-form-item__label) {
    float: none;
    display: block;
    text-align: left;
    padding: 0 0 4px;
    line-height: 1.4;
    width: 100% !important;
  }

  :deep(.cabinet-dialog .el-form-item__content) {
    margin-left: 0 !important;
    width: 100%;
    justify-content: flex-start;
  }

  :deep(.cabinet-dialog .el-input),
  :deep(.cabinet-dialog .el-select) {
    width: 100%;
  }

  .cabinets-grid {
    grid-template-columns: 1fr;
  }

  .server-cabinet-visual {
    flex-direction: column;
    gap: 12px;
  }

  .rack-3d {
    width: 100%;
    max-width: 100%;
    margin: 0 auto;
  }

  .rack-info-panel {
    max-width: none;
    width: 100%;
  }

  .cabinet-detail-area {
    padding: 12px;
  }

  .detail-toolbar {
    flex-wrap: wrap;
    gap: 6px;

    .el-button {
      padding: 4px 8px;
      font-size: 11px;
    }
  }
}

/* 超小屏幕进一步适配（宽度 < 480px） */
@media (max-width: 480px) {
  .rack-3d {
    width: 100%;
    max-width: 100%;
    margin: 0 auto;
  }

  .rack-container {
    overflow-x: auto;
    justify-content: center;
  }

  .rj45-ports-real {
    gap: 3px;

    .port-row {
      gap: 3px;
    }

    .rj45-body {
      width: 24px;
      height: 22px;
    }

    .rj45-label {
      font-size: 6px;
    }
  }

  .sfp-ports-grid {
    grid-template-columns: repeat(2, 1fr) !important;
    gap: 6px;
  }

  .xfp-ports-grid {
    grid-template-columns: 1fr !important;
  }

  .device-panel-content {
    padding: 12px !important;
  }

  .detail-info-grid {
    grid-template-columns: 1fr !important;
  }

  .port-edit-row {
    flex-wrap: wrap;
  }

  .odf-edit-row {
    flex-wrap: wrap;
  }
}

.panel-brand-area {
  display: flex;
  align-items: center;
  gap: 10px;
}
.vendor-logo {
  width: auto;
  min-width: 48px;
  height: 24px;
  padding: 0 8px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 800;
  color: #fff;
  background: #636366;
  letter-spacing: 0.5px;
  font-family: Arial, Helvetica, sans-serif;
  &.vendor-h3c {
    background: #e60012;
  }
  &.vendor-huawei {
    background: #cf0a2c;
  }
  &.vendor-cisco {
    background: #049fd9;
  }
  &.vendor-ruijie {
    background: #003da5;
    font-style: italic;
  }
  &.vendor-aruba {
    background: #f9a800;
    color: #000;
  }
}

.vendor-logo-img {
  height: 36px;
  width: auto;
  object-fit: contain;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 6px;
}

/* 光纤端口图片图标 */
.fiber-type-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
  border-radius: 3px;
}

/* 光纤端口LED状态指示 */
.fiber-led {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1px solid #1c1c1e;
  background: #484f58;
  transition: all 0.2s;
}

.fiber-led.on {
  background: #007acc;
  box-shadow: 0 0 4px #007acc;
}

/* SC口图标样式 */
.mini-sc {
  width: 20px;
  height: 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
}

.mini-sc-body {
  width: 16px;
  height: 20px;
  background: #303133;
  border: 1px solid #606266;
  border-radius: 2px;
  position: relative;
}

.mini-sc-core {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 8px;
  height: 12px;
  background: #48484a;
  border: 1px solid #909399;
  border-radius: 1px;
}

.mini-sc-led {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #3a3a3c;
  margin-top: 2px;
  transition: all 0.3s;

  &.on {
    background: var(--accent);
    box-shadow: 0 0 4px var(--accent);
  }
}

/* LC口图标样式 - 两芯为一个端口 */
.mini-lc {
  width: 24px;
  height: 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
}

.mini-lc-body {
  width: 20px;
  height: 20px;
  background: #303133;
  border: 1px solid #606266;
  border-radius: 2px;
  position: relative;
  display: flex;
  gap: 2px;
  padding: 2px;
}

.mini-lc-core1,
.mini-lc-core2 {
  width: 7px;
  height: 14px;
  background: #48484a;
  border: 1px solid #909399;
  border-radius: 1px;
  flex-shrink: 0;
}

.mini-lc-led {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #3a3a3c;
  margin-top: 2px;
  transition: all 0.3s;

  &.on {
    background: var(--accent);
    box-shadow: 0 0 4px var(--accent);
  }
}

/* FC口图标样式 - 外边大圆，里面小圆 */
.mini-fc {
  width: 24px;
  height: 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
}

.mini-fc-body {
  width: 22px;
  height: 22px;
  background: #303133;
  border: 1px solid #606266;
  border-radius: 50%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mini-fc-core {
  width: 12px;
  height: 12px;
  background: #48484a;
  border: 1px solid #909399;
  border-radius: 50%;
}

.mini-fc-led {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #3a3a3c;
  position: absolute;
  bottom: 2px;
  right: 2px;
  transition: all 0.3s;

  &.on {
    background: var(--accent);
    box-shadow: 0 0 4px var(--accent);
  }
}

/* ===== Green glassmorphism — cabinets ===== */
.cabinets-view { background: var(--bg-base); }
.cabinet-card {
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}
.cabinet-card:hover,
.cabinet-card.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent-soft), 0 0 18px var(--accent-glow), var(--shadow-md);
  transform: translateY(-2px);
}
.cabinet-detail-area,
.rack-info-panel {
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}
.u-bar { background: linear-gradient(90deg, var(--accent), var(--info)); }
.patch-visual-panel,
.odf-visual-panel {
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}
.port-tooltip {
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
}
.rack-truncated-hint {
  margin-bottom: 8px;
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary, #9ca3af);
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md, 6px);
}

</style>
