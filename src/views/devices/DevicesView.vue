<template>
  <PageLayout title="设备管理" subtitle="网络设备统一管理平台" class="devices-view">
    <template #actions>
        <el-button size="small" @click="showImportDialog">
          <el-icon><Upload /></el-icon> 导入设备
        </el-button>
        <el-button size="small" @click="exportDevicesExcel">
          <el-icon><Download /></el-icon> 导出Excel
        </el-button>
        <el-button type="primary" size="small" @click="openAddDialog">
          <el-icon><Plus /></el-icon> 添加设备
        </el-button>
        <el-button size="small" @click="libDialogVisible = true">
          <el-icon><Reading /></el-icon> 从设备库导入
        </el-button>
        <el-button size="small" @click="exportEmptyTemplate">
          <el-icon><Document /></el-icon> 导出空表格模板
        </el-button>
        <el-button 
          size="small" 
          class="device-scan-button"
          @click="handleStartScan()"
          :loading="deviceScanStore.isScanning"
        >
          <el-icon><Search /></el-icon>
          {{ deviceScanStore.isScanning ? '扫描中...' : '扫描网络设备' }}
        </el-button>
        <el-button size="small" @click="refreshDeviceStatus">
          <el-icon><Refresh /></el-icon> 刷新在线状态
        </el-button>
        <el-button
          v-if="deviceScanStore.foundDevices.filter(d => isNetworkDevice(d)).length > 0"
          size="small"
          @click="viewScanResults"
        >
          <el-icon><Bell /></el-icon>
          扫描结果 ({{ deviceScanStore.foundDevices.filter(d => isNetworkDevice(d)).length }})
        </el-button>
      </template>

    <!-- 过滤栏 -->
    <div class="filter-bar mac-card">
      <el-input
        v-model="searchText"
        placeholder="搜索设备名称、IP地址..."
        size="small"
        style="width: 220px"
        clearable
      >
        <template #prefix><el-icon><Search /></el-icon>
</template>
      </el-input>
      <el-select v-model="filterVendor" placeholder="全部厂商" size="small" style="width: 130px" clearable>
        <el-option v-for="v in allVendors" :key="v" :label="v" :value="v" />
      </el-select>
      <el-select v-model="filterType" placeholder="全部类型" size="small" style="width: 130px" clearable>
        <el-option v-for="t in deviceTypes" :key="t.value" :label="t.label" :value="t.value" />
      </el-select>
      <el-select v-model="filterStatus" placeholder="全部状态" size="small" style="width: 120px" clearable>
        <el-option label="在线" value="online" />
        <el-option label="离线" value="offline" />
      </el-select>
      <div class="filter-right">
        <span class="device-count">共 <strong>{{ filteredDevices.length }}</strong> 台设备</span>
      </div>
    </div>

    <!-- 桌面端：设备表格 -->
    <div class="table-card-wrapper" v-if="!isMobile">
      <el-table
        :data="paginatedDevices"
        size="default"
        :row-class-name="getRowClassName"
        empty-text="暂无设备，点击「添加设备」开始添加"
        @row-click="viewDetail"
        :header-cell-style="{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontWeight: '600' }"
      >
        <el-table-column width="110" align="center">
          <template #default="{ row }">
            <div class="type-icon-cell" :class="row.type">
              <el-icon size="32"><component :is="getDeviceIcon(row.type)" /></el-icon>
            </div>
          
</template>
        </el-table-column>
        <el-table-column label="设备名称" prop="name" min-width="150">
          <template #default="{ row }">
            <div class="name-cell">
              <span class="device-name">{{ row.name }}</span>
              <el-tag size="small" :type="getVendorTagType(row.vendor)" class="vendor-tag">{{ row.vendor }}</el-tag>
            </div>
          
</template>
        </el-table-column>
        <el-table-column label="IP地址" prop="ip" width="150">
          <template #default="{ row }">
            <span class="ip-text">{{ row.ip }}</span>
          
</template>
        </el-table-column>
        <el-table-column label="设备类型" width="100">
          <template #default="{ row }">
            <span>{{ getTypeLabel(row.type) }}</span>
          
</template>
        </el-table-column>
        <el-table-column label="型号" prop="model" min-width="130" show-overflow-tooltip />
        <el-table-column label="状态" width="110" align="center">
          <template #default="{ row }">
            <div class="status-cell">
              <span class="status-dot" :class="row.status"></span>
              <span class="status-text" :class="row.status === 'online' ? 'text-green' : 'text-red'">
                {{ row.status === 'online' ? '在线' : '离线' }}
              </span>
            </div>
          
</template>
        </el-table-column>
        <el-table-column label="位置" min-width="120">
          <template #default="{ row }">
            <span>{{ getDeviceLocation(row) }}</span>
          
</template>
        </el-table-column>
        <el-table-column label="登录方式" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.loginType === 'ssh' ? 'info' : 'success'">
              {{ row.loginType === 'ssh' ? 'SSH' : 'Web' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right" align="center">
          <template #default="{ row }">
            <div class="action-btns" @click.stop>
              <el-button size="small" type="primary" @click="connectDevice(row)" class="action-btn">
                <el-icon><Monitor /></el-icon>
              </el-button>
              <el-button size="small" @click="editDevice(row)" class="action-btn">
                <el-icon><Edit /></el-icon>
              </el-button>
              <el-button size="small" type="danger" @click="deleteDevice(row)" class="action-btn delete-btn">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          
</template>
        </el-table-column>
      </el-table>
      <!-- 分页 -->
      <div class="pagination-wrapper" v-if="filteredDevices.length > pageSize">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="filteredDevices.length"
          layout="prev, pager, next, jumper"
          size="small"
          background
        />
      </div>
    </div>

    <!-- 移动端：设备卡片视图 -->
    <div class="device-cards-mobile" v-else>
      <div 
        v-for="device in paginatedDevices" 
        :key="device.id" 
        class="device-card-item"
        :data-device-id="device.id"
        :class="{ 'device-card--focused': focusedDeviceId === device.id }"
      >
        <DeviceCard 
          :device="device" 
          @click="viewDetail(device)"
          @connect="connectDevice"
          @edit="editDevice"
          @delete="deleteDevice"
        />
      </div>
      <!-- 移动端分页 -->
      <div class="pagination-wrapper" v-if="filteredDevices.length > pageSize">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="filteredDevices.length"
          layout="prev, pager, next"
          size="small"
          background
        />
      </div>
    </div>

    <!-- 添加/编辑设备对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑设备' : '添加设备'"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px" size="default">
        <div class="form-section-title">基本信息</div>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="设备名称" prop="name">
              <el-input v-model="form.name" placeholder="如: 核心交换机-01" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="IP地址" prop="ip">
              <el-input v-model="form.ip" placeholder="如: 192.168.1.1" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="设备厂商" prop="vendor">
              <el-select v-model="form.vendor" filterable allow-create default-first-option placeholder="选择或输入厂商" style="width:100%">
                <el-option v-for="v in builtinVendors" :key="v" :label="v" :value="v" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="设备类型" prop="type">
              <el-select v-model="form.type" filterable allow-create default-first-option placeholder="选择或输入类型" style="width:100%">
                <el-option v-for="t in deviceTypes" :key="t.value" :label="t.label" :value="t.value" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="设备型号" prop="model">
              <el-select v-model="form.model" filterable allow-create default-first-option placeholder="选择或输入型号" style="width:100%" @change="onModelDetected">
                <el-option v-for="m in getModelOptions(form.vendor, form.type)" :key="m" :label="m" :value="m" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="位置" prop="location">
              <el-input v-model="form.location" placeholder="如: 机柜A-01，U10-12" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="设备U数" prop="uSize">
          <el-input-number v-model="form.uSize" :min="1" :max="20" placeholder="占用U数" />
          <span class="form-hint">设备占用的U位数量（1U≈44.45mm）</span>
        </el-form-item>

        <el-form-item v-if="form.type === 'server'" label="默认面板">
          <el-radio-group v-model="form.defaultPanel">
            <el-radio value="front">前面板</el-radio>
            <el-radio value="back">后面板</el-radio>
          </el-radio-group>
          <span class="form-hint">选择设备详情默认显示的面板</span>
        </el-form-item>
        
        <div class="form-section-title">登录配置</div>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="登录方式" prop="loginType">
              <el-radio-group v-model="form.loginType">
                <el-radio value="web">Web 登录</el-radio>
                <el-radio value="ssh">SSH 登录</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12" v-if="form.loginType === 'ssh'">
            <el-form-item label="SSH端口" prop="sshPort">
              <el-input v-model="form.sshPort" placeholder="22" />
            </el-form-item>
          </el-col>
        </el-row>

        <template v-if="form.loginType === 'ssh'">
          <div class="ssh-notice">
            <el-icon color="#2f81f7"><InfoFilled /></el-icon>
            SSH登录将通过内置终端直接连接设备，支持命令行操作
          </div>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="SSH用户名" prop="sshUser">
                <el-input v-model="form.sshUser" placeholder="如: admin" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="SSH密码" prop="sshPass">
                <el-input v-model="form.sshPass" type="password" show-password placeholder="SSH登录密码" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="私钥路径">
                <el-input v-model="form.sshKey" placeholder="可选，如: ~/.ssh/id_rsa" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="SSH协议">
                <el-select v-model="form.sshProtocol" style="width:100%">
                  <el-option label="SSH2（推荐）" value="ssh2" />
                  <el-option label="SSH1（旧设备）" value="ssh1" />
                  <el-option label="Telnet" value="telnet" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="连接超时">
            <el-input-number v-model="form.sshTimeout" :min="5" :max="60" />
            <span class="form-hint">秒，超时后自动断开</span>
          </el-form-item>
          <el-form-item label="Enable密码">
            <el-input v-model="form.enablePass" type="password" show-password placeholder="可选，华为/思科等设备进特权模式密码" />
          </el-form-item>
        
</template>

        <template v-else>
          <el-form-item label="协议">
            <el-radio-group v-model="form.webProtocol">
              <el-radio value="http">HTTP</el-radio>
              <el-radio value="https">HTTPS</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="Web用户名">
                <el-input v-model="form.sshUser" placeholder="Web管理用户名" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="Web密码">
                <el-input v-model="form.sshPass" type="password" show-password placeholder="Web管理密码" />
              </el-form-item>
            </el-col>
          </el-row>
        
</template>

        <div class="form-section-title">监控接入配置</div>
        <el-form-item label="纳入监控">
          <el-switch v-model="form.monitorConfig.monitorEnabled" />
          <span class="form-hint">开启后，该设备纳入监测引擎的在线状态检测（接入真实探测能力后生效）</span>
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="管理IP">
              <el-input v-model="form.monitorConfig.managementIp" placeholder="监测用IP，如 192.168.1.10" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="监测方式">
              <el-select v-model="form.monitorConfig.pollMethod" style="width:100%">
                <el-option label="ICMP 探测" value="icmp" />
                <el-option label="TCP 端口探测" value="tcp" />
                <el-option label="SNMP 轮询" value="snmp" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="监测端口">
              <el-input v-model="form.monitorConfig.watchPort" placeholder="TCP/SNMP 端口，如 161" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="机柜编号">
              <el-input v-model="form.monitorConfig.cabinetId" placeholder="如 RACK-A01，用于温度看板归类" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="离线重试">
              <el-input-number v-model="form.monitorConfig.offlineRetries" :min="1" :max="10" />
              <span class="form-hint">连续失败几次判离线</span>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="温度预警℃">
              <el-input-number v-model="form.monitorConfig.tempWarning" :min="20" :max="45" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="温度严重℃">
              <el-input-number v-model="form.monitorConfig.tempCritical" :min="20" :max="50" />
            </el-form-item>
          </el-col>
        </el-row>

        <div class="form-section-title">其他信息</div>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="设备描述、用途等备注信息" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm">{{ isEdit ? '保存修改' : '添加设备' }}</el-button>
      
</template>
    </el-dialog>

    <!-- 设备详情面板（与机柜管理一致的 SVG 真实设备面板样式） -->
    <DevicePanelZoom
      v-model:visible="zoomVisible"
      :device="zoomDeviceData"
      :show-unmount="false"
      @port-click="handleZoomPortClick"
    />

    <!-- SSH终端对话框 -->
    <el-dialog
      v-model="sshVisible"
      :title="`SSH终端 - ${sshDevice?.name} (${sshDevice?.ip})`"
      width="800px"
      class="ssh-dialog"
      :close-on-click-modal="false"
    >
      <div class="ssh-terminal">
        <div class="terminal-toolbar">
          <span class="terminal-info">{{ sshDevice?.sshUser }}@{{ sshDevice?.ip }}:{{ sshDevice?.sshPort || 22 }}</span>
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
              @keydown.up="historyUp"
              @keydown.down="historyDown"
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

    <!-- 导入对话框 -->
    <el-dialog v-model="importDialogVisible" title="导入设备数据" width="600px">
      <div class="import-area">
        <el-tabs v-model="importTab">
          <el-tab-pane label="Excel文件" name="excel">
            <el-upload
              drag
              accept=".xlsx,.xls,.csv"
              :auto-upload="false"
              :on-change="handleExcelImport"
              :show-file-list="false"
            >
              <el-icon class="el-icon--upload" size="40"><Upload /></el-icon>
              <div class="el-upload__text">拖拽Excel/CSV文件到此处，或 <em>点击选择</em></div>
              <template #tip>
                <div class="el-upload__tip">支持 .xlsx, .xls, .csv 格式</div>
              
</template>
            </el-upload>
            <div v-if="importPreview.length > 0" class="import-preview-table">
              <el-alert :title="`将导入 ${importPreview.length} 台设备`" type="success" :closable="false" />
              <el-table :data="importPreview.slice(0, 5)" size="small" max-height="200" style="margin-top: 10px">
                <el-table-column prop="name" label="名称" />
                <el-table-column prop="ip" label="IP" />
                <el-table-column prop="vendor" label="厂商" />
                <el-table-column prop="type" label="类型" />
              </el-table>
              <div v-if="importPreview.length > 5" class="more-hint">还有 {{ importPreview.length - 5 }} 台设备...</div>
            </div>
          </el-tab-pane>
          <el-tab-pane label="JSON文件" name="json">
            <el-upload
              drag
              accept=".json"
              :auto-upload="false"
              :on-change="handleJsonImport"
              :show-file-list="false"
            >
              <el-icon class="el-icon--upload" size="40"><Upload /></el-icon>
              <div class="el-upload__text">拖拽JSON文件到此处，或 <em>点击选择</em></div>
              <template #tip>
                <div class="el-upload__tip">支持 .json 格式</div>
              
</template>
            </el-upload>
            <div v-if="jsonImportPreview.length > 0" class="import-preview-table">
              <el-alert :title="`将导入 ${jsonImportPreview.length} 台设备`" type="success" :closable="false" />
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
      <template #footer>
        <el-button @click="importDialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="importPreview.length === 0 && jsonImportPreview.length === 0" @click="confirmImport">确认导入</el-button>
      
</template>
    </el-dialog>

    <!-- 从设备库导入对话框 -->
    <el-dialog v-model="libDialogVisible" title="从设备库导入" width="900px" :close-on-click-modal="false">
      <div class="lib-import">
        <div class="lib-filter">
          <el-input v-model="libSearchText" placeholder="搜索型号..." size="small" style="width:200px" clearable>
            <template #prefix><el-icon><Search /></el-icon>
</template>
          </el-input>
          <el-select v-model="libFilterVendor" placeholder="选择厂商" size="small" style="width:150px" clearable>
            <el-option v-for="v in allVendors" :key="v" :label="v" :value="v" />
          </el-select>
          <el-select v-model="libFilterType" placeholder="选择类型" size="small" style="width:130px" clearable>
            <el-option v-for="t in deviceTypes" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
          <span class="lib-count">共 {{ filteredLibModels.length }} 个型号</span>
        </div>
        <el-table
          ref="libTableRef"
          :data="filteredLibModels"
          size="small"
          max-height="350"
          @selection-change="handleLibSelection"
          style="margin-top: 12px"
        >
          <el-table-column type="selection" width="40" />
          <el-table-column label="型号" prop="name" width="160">
            <template #default="{ row }">
              <div class="model-name-cell">
                <span>{{ row.name }}</span>
                <el-tag v-if="row.isCustom" size="small" type="warning">自定义</el-tag>
              </div>
            
</template>
          </el-table-column>
          <el-table-column label="厂商" prop="vendor" width="100" />
          <el-table-column label="类型" width="80">
            <template #default="{ row }">{{ getTypeLabel(row.type) }}
</template>
          </el-table-column>
          <el-table-column label="端口" width="100">
            <template #default="{ row }">
              <span>{{ row.ethernetPorts || 0 }}电 + {{ row.sfpPorts || 0 }}光</span>
            
</template>
          </el-table-column>
          <el-table-column label="U数" width="60" align="center">
            <template #default="{ row }">{{ row.uSize || 1 }}U
</template>
          </el-table-column>
          <el-table-column label="备注" prop="remark" />
        </el-table>
      </div>
      <template #footer>
        <span class="selection-info">已选择 {{ selectedLibModels.length }} 个型号</span>
        <el-button @click="libDialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="selectedLibModels.length === 0" @click="importFromLib">导入选中型号</el-button>
      
</template>
    </el-dialog>

    <!-- 扫描结果对话框 -->
    <el-dialog
      v-model="showScanDialog"
      title="扫描结果"
      width="800px"
      :close-on-click-modal="false"
    >
      <div class="scan-results">
        <div class="scan-info" v-if="deviceScanStore.isScanning">
          <el-progress
            type="line"
            :percentage="deviceScanStore.scanProgress.total > 0 ? Math.round(deviceScanStore.scanProgress.completed / deviceScanStore.scanProgress.total * 100) : 0"
            :stroke-width="8"
          />
          <p>正在扫描网络设备...</p>
        </div>

        <div v-if="scanResults.length > 0" class="results-list">
          <el-table :data="scanResults" size="small" max-height="400">
            <el-table-column label="IP地址" prop="ip" width="130" />
            <el-table-column label="厂商" prop="vendor" width="100" />
            <el-table-column label="型号" prop="model" width="150" />
            <el-table-column label="端口" prop="port" width="80" />
            <el-table-column label="协议" prop="protocol" width="100" />
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button size="small" type="primary" @click="connectDevice(row)">
                  连接
                </el-button>
              
</template>
            </el-table-column>
          </el-table>
        </div>

        <el-empty v-else-if="!deviceScanStore.isScanning" description="暂无扫描结果" />
      </div>

      <template #footer>
        <el-button @click="showScanDialog = false">关闭</el-button>
        <el-button
          v-if="scanResults.length > 0"
          type="primary"
          @click="importScanResults"
        >
          导入到设备列表
        </el-button>
      
</template>
    </el-dialog>
    <!-- 端口连线对话框 - 已连线端口显示连接情况，空闲端口创建连线（与机柜管理一致） -->
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
          <!-- B端位置：选择设备 + 选择端口（级联，按机柜分组，与机柜管理一致） -->
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

    <!-- 真实设备面板对话框 -->
    <el-dialog
      v-model="realPanelVisible"
      title="真实设备面板"
      width="900px"
      :close-on-click-modal="false"
    >
      <RealDevicePanel v-if="realPanelDevice" :device="realPanelDevice" />
      <template #footer>
        <el-button @click="realPanelVisible = false">关闭</el-button>
      
</template>
    </el-dialog>
  </PageLayout>

</template>

<script setup>
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useDeviceStore, useDeviceLibStore, useCabinetStore } from '../../stores'
import { usePortStateStore } from '../../stores/portState'
import { useDeviceScanStore } from '../../stores/deviceScan'
import { useResponsive } from '../../composables/useResponsive'
import { detectDeviceFromModel } from '../../composables/useRackTransform'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Browser } from '@capacitor/browser'
import { Connection, Share, Lock, Monitor, Lightning, Coin, Promotion, Operation, Cpu, Picture, SetUp, Setting, Upload, Reading } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
// import DeviceDetailPanel from '../../components/DeviceDetailPanel.vue' // 已移除：未使用
import DevicePanelZoom from '../../components/cabinet/DevicePanelZoom.vue'
import RealDevicePanel from '../../components/RealDevicePanel.vue'
import DeviceCard from '../../components/DeviceCard.vue'
// 安全审计 F-007：凭据加密/解密工具
import { encryptSecret, decryptSecret, encryptDeviceSecrets, decryptDeviceSecrets } from '../../utils/credentialCrypto'
// 端口显示名解析（单一真源：自定义名 > 标准名）
import { resolvePortName, standardPortName } from '../../utils/portNaming.js'
import PageLayout from '../../components/PageLayout.vue'
import deviceModels from '../../data/deviceModels.js'
import { startDeviceStatusMonitor, stopDeviceStatusMonitor, refreshDeviceStatus as doRefreshStatus, restoreDeviceStatus } from '../../composables/useDeviceStatus.js'
import { addLog, LogType, LogResult } from '../../composables/useOperationLog.js'
import { matchSuggestions, tabComplete, getSuggestionsByVendor, getAllSuggestions } from '../../data/cliCommandLibrary.js'
import SshCommandLibrary from '../../components/SshCommandLibrary.vue'
import logger from '../../utils/logger'
import { isNetworkDevice } from '../../utils/deviceClassifier'

const deviceStore = useDeviceStore()
const deviceLibStore = useDeviceLibStore()
const cabinetStore = useCabinetStore()
const portStateStore = usePortStateStore()
const deviceScanStore = useDeviceScanStore()

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

// 接收拓扑画布 /devices?focus=<id> 跳转，定位并高亮目标设备
const route = useRoute()
const focusedDeviceId = ref(null)
let focusTimer = null

// 筛选条件（必须在 watch 和函数使用前定义）
const searchText = ref('')
const filterVendor = ref('')
const filterType = ref('')
const filterStatus = ref('')

async function applyDeviceFocus() {
  const id = route.query.focus
  if (!id) return
  const dev = deviceStore.devices.find(d => d.id === id)
  if (!dev) return
  // 清除可能隐藏该设备的筛选条件
  searchText.value = ''
  filterVendor.value = ''
  filterType.value = ''
  filterStatus.value = ''
  // 翻到该设备所在分页，确保卡片已渲染
  const idx = filteredDevices.value.findIndex(d => d.id === id)
  if (idx >= 0) {
    currentPage.value = Math.floor(idx / pageSize.value) + 1
  }
  focusedDeviceId.value = id
  await nextTick()
  await nextTick()
  const el =
    document.querySelector(`[data-device-id="${id}"]`) ||
    document.querySelector('.device-card--focused')
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  if (focusTimer) clearTimeout(focusTimer)
  focusTimer = setTimeout(() => { focusedDeviceId.value = null }, 3000)
}

// 用户手动改变筛选条件时取消高亮
watch([searchText, filterVendor, filterType, filterStatus], () => {
  focusedDeviceId.value = null
  if (focusTimer) { clearTimeout(focusTimer); focusTimer = null }
})

// 客户端导航（如从拓扑画布跳转）同样触发定位
watch(() => route.query.focus, (val) => { if (val) applyDeviceFocus() })

// 响应式检测
const { isMobile } = useResponsive()

// 过滤后的设备列表（显示所有设备，不过滤网络设备类型）
const filteredDevices = computed(() => {
  let list = deviceStore.devices
  if (searchText.value) {
    const s = searchText.value.toLowerCase()
    list = list.filter(d =>
      (d.name || '').toLowerCase().includes(s) ||
      (d.ip || '').toLowerCase().includes(s) ||
      (d.vendor || '').toLowerCase().includes(s) ||
      (d.model || '').toLowerCase().includes(s) ||
      (d.location || '').toLowerCase().includes(s)
    )
  }
  if (filterVendor.value) {
    list = list.filter(d => d.vendor === filterVendor.value)
  }
  if (filterType.value) {
    list = list.filter(d => d.type === filterType.value)
  }
  if (filterStatus.value) {
    list = list.filter(d => d.status === filterStatus.value)
  }
  return list
})
function getRowClassName({ row }) {
  return focusedDeviceId.value === row.id ? 'device-row device-card--focused' : 'device-row'
}

const dialogVisible = ref(false)
const isEdit = ref(false)
const detailVisible = ref(false)
const zoomVisible = ref(false)
const zoomDeviceData = ref(null)
const currentDevice = ref(null)
const sshVisible = ref(false)
const sshDevice = ref(null)

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

// 点击候选项 → 填入命令骨架（保留用户已输入的参数）
function applySuggestion(s) {
  const solid = String(s.cmd).replace(/\s*<[^>]*>.*$/, '')
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
const importDialogVisible = ref(false)
const realPanelVisible = ref(false)
const realPanelDevice = ref(null)
const importTab = ref('excel')
const importPreview = ref([])
const jsonImportPreview = ref([])
const formRef = ref(null)
const editId = ref(null)
const form = ref({
  name: '', ip: '', vendor: '', type: '', model: '', location: '',
  uSize: 1, defaultPanel: 'front', loginType: 'web', sshPort: '',
  sshUser: '', sshPass: '', sshKey: '', sshProtocol: 'ssh', sshTimeout: 30,
  enablePass: '', status: 'unknown', remark: '',
  monitorConfig: defaultMC()
})
// 表单校验规则（修复：此前 rules 未定义，添加/编辑设备表单完全无校验）
const ipv4Regex = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/
const portRegex = /^([1-9]\d{0,3}|[1-5]\d{4}|6[0-4]\d{3}|65[0-4]\d{2}|655[0-2]\d|6553[0-5])$/
const rules = {
  name: [{ required: true, message: '请输入设备名称', trigger: 'blur' }],
  ip: [
    { required: true, message: '请输入设备 IP', trigger: 'blur' },
    { pattern: ipv4Regex, message: 'IP 格式不正确（应为合法 IPv4）', trigger: 'blur' }
  ],
  sshPort: [{ pattern: portRegex, message: 'SSH 端口范围 1-65535', trigger: 'blur' }]
}
function defaultForm() {
  return {
    name: '', ip: '', vendor: '', type: '', model: '', location: '',
    uSize: 1, defaultPanel: 'front', loginType: 'web', sshPort: '',
    sshUser: '', sshPass: '', sshKey: '', sshProtocol: 'ssh', sshTimeout: 30,
    enablePass: '', status: 'unknown', remark: '',
    monitorConfig: defaultMC()
  }
}
// 设备监控接入默认配置（对应「设备接入需填写的字段」）
function defaultMC() {
  return {
    managementIp: '',      // 监测用管理 IP（可与业务 IP 不同）
    pollMethod: 'icmp',    // 监测方式：icmp / tcp / snmp
    watchPort: '',         // TCP/SNMP 监测端口
    cabinetId: '',         // 所属机柜编号（用于温度看板归类）
    offlineRetries: 3,     // 连续失败几次判定离线（防抖）
    tempWarning: 30,       // 该设备关联机柜的温度预警阈值
    tempCritical: 35,      // 温度严重阈值
    monitorEnabled: false  // 是否纳入实时监控
  }
}

// ===== 型号自动识别：输入型号后自动填充厂商与设备类型 =====
// 仅填充空字段（用户已选择的不覆盖）；识别成功后 ElMessage 提示
function onModelDetected(val) {
  if (!val) return
  const det = detectDeviceFromModel(val)
  if (!det) return
  const filled = []
  if (det.vendor && !form.value.vendor) {
    form.value.vendor = det.vendor
    filled.push(det.vendor)
  }
  if (det.type && !form.value.type) {
    form.value.type = det.type
    const tl = deviceTypes.find(t => t.value === det.type)
    filled.push(tl ? tl.label : det.type)
  }
  if (filled.length) {
    ElMessage.success(`已识别型号：${filled.join(' · ')}`)
  }
}
const libDialogVisible = ref(false)
const libSearchText = ref('')
const libFilterVendor = ref('')
const libFilterType = ref('')
const selectedLibModelIds = ref(new Set())
const libTableRef = ref(null)

// 跨筛选保持选中的设备库型号
const selectedLibModels = computed(() => {
  return deviceLibStore.models.filter(m => selectedLibModelIds.value.has(m.id))
})
const terminalBody = ref(null)
const termInputRef = ref(null)
const terminalLines = ref([])
const currentCommand = ref('')
const commandHistory = ref([])
const historyIndex = ref(-1)
const sshPrompt = ref('netops')

// 转义HTML特殊字符，保留换行符（用于终端输出显示）
const escapeTerminalText = (text) => {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>')
    .replace(/\t/g, '&#9;')
}

// 设备前面板
const devicePanelPorts = ref([])
const portEditMode = ref(false)
const portNameEdits = ref({})
const panelMode = ref('front')

// 端口连线对话框
const portConnectVisible = ref(false)
const editConnectionVisible = ref(false)
const editConnectionData = ref({})
const connectingPort = ref(null)
// 连线表单：与机柜管理保持同一结构（occupied 分支显示连接详情，空闲分支创建连线）
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

// 分页
const currentPage = ref(1)
const pageSize = ref(10)

const paginatedDevices = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredDevices.value.slice(start, end)
})

// 动态厂商列表：内置网络设备厂商 + 设备库型号厂商（含海康威视/大华及用户自定义型号的厂商）
const builtinVendors = computed(() => {
  const all = new Set(['华为', '华三(H3C)', '锐捷', 'TP-Link', '思科(Cisco)', '中兴(ZTE)', '烽火', '联想', 'Dell', 'HP', 'Juniper', 'Arista', 'HPE', '新华三', '迪普', '迈普'])
  deviceLibStore.models.forEach(m => { if (m.vendor) all.add(m.vendor) })
  return [...all]
})
// 设备类型（设备管理显示所有设备）
const deviceTypes = [
  { value: 'switch', label: '交换机' },
  { value: 'router', label: '路由器' },
  { value: 'firewall', label: '防火墙' },
  { value: 'wireless', label: '无线AP' },
  { value: 'loadbalancer', label: '负载均衡' },
  { value: 'gateway', label: '网关' },
  { value: 'server', label: '服务器' },
  { value: 'monitor', label: '监控设备' },
  { value: 'nvr', label: 'NVR' },
  { value: 'other', label: '其他' }
]

// 根据扫描结果推断设备类型
function inferDeviceType(d) {
  const text = ((d.type || '') + ' ' + (d.name || '') + ' ' + (d.model || '')).toLowerCase()
  if (text.includes('switch') || text.includes('交换机')) return 'switch'
  if (text.includes('router') || text.includes('路由')) return 'router'
  if (text.includes('firewall') || text.includes('防火墙') || text.includes('安全') || text.includes('网御') || text.includes('网闸')) return 'firewall'
  if (text.includes('wireless') || text.includes('无线') || text.includes('ap')) return 'wireless'
  if (text.includes('loadbalancer') || text.includes('负载均衡')) return 'loadbalancer'
  if (text.includes('gateway') || text.includes('网关')) return 'gateway'
  return 'other'
}

// 设备型号库：内置网络设备型号 + 设备库全部型号（含海康/大华厂商面板型号），按厂商（+已选类型）过滤
function getModelOptions(vendor, type) {
  if (!vendor) return []
  const options = []
  if (type) {
    const vendorModels = deviceModels[vendor]
    if (vendorModels) options.push(...(vendorModels[type] || []))
  }
  deviceLibStore.models.forEach(m => {
    if (m.vendor === vendor && (!type || m.type === type) && m.name) options.push(m.name)
  })
  return [...new Set(options)]
}

function getDeviceIcon(type) {
  const icons = { switch: Connection, router: Share, firewall: Lock, server: Monitor, ups: Lightning, storage: Coin, wireless: Promotion, loadbalancer: Operation, other: Cpu }
  return icons[type] || Cpu
}

function getTypeLabel(type) {
  return deviceTypes.find(t => t.value === type)?.label || type || '-'
}

function getVendorTagType(vendor) {
  const map = { '华为': '', '华三(H3C)': 'success', '锐捷': 'warning', 'TP-Link': 'info', '思科(Cisco)': 'danger', 'Juniper': 'success', 'Arista': 'warning' }
  return map[vendor] || ''
}

async function openAddDialog() {
  isEdit.value = false
  form.value = defaultForm()
  await nextTick()
  dialogVisible.value = true
  await nextTick()
  formRef.value?.clearValidate()
}

async function editDevice(device) {
  isEdit.value = true
  editId.value = device.id
  // 安全审计 F-007：存储为密文，回显时解密
  const d = await decryptDeviceSecrets(device)
  // monitorConfig 在库中可能是 JSON 字符串，回显时解析为对象供表单绑定
  let mc = defaultMC()
  if (d.monitorConfig) {
    try { mc = typeof d.monitorConfig === 'string' ? JSON.parse(d.monitorConfig) : d.monitorConfig } catch (e) { mc = defaultMC() }
  }
  form.value = { ...defaultForm(), ...d, monitorConfig: { ...defaultMC(), ...mc } }
  await nextTick()
  dialogVisible.value = true
}

// 根据机柜数据动态计算设备位置（支持服务器机柜和配线机柜）
function getDeviceLocation(device) {
  if (!device?.id) return device?.location || '-'
  
  // 1. 检查服务器机柜的 slots
  const cabinet = cabinetStore.cabinets.find(c => {
    if (c.slots) return Object.values(c.slots).includes(device.id)
    return false
  })
  if (cabinet && cabinet.slots) {
    const occupiedUs = []
    Object.entries(cabinet.slots).forEach(([u, deviceId]) => {
      if (deviceId === device.id) occupiedUs.push(parseInt(u))
    })
    if (occupiedUs.length > 0) {
      occupiedUs.sort((a, b) => a - b)
      const startU = occupiedUs[0]
      const endU = occupiedUs[occupiedUs.length - 1]
      const uRange = startU === endU ? `U${startU}` : `U${startU}-U${endU}`
      return `${cabinet.name}，${uRange}`
    }
  }
  
  // 2. 检查配线机柜的 patchItems
  const patchCabinet = cabinetStore.cabinets.find(c => {
    if (c.patchItems) return c.patchItems.some(item => item.deviceId === device.id)
    return false
  })
  if (patchCabinet && patchCabinet.patchItems) {
    const patchItem = patchCabinet.patchItems.find(item => item.deviceId === device.id)
    if (patchItem) {
      const uSize = patchItem.uSize || 1
      const startU = patchItem.startU
      if (startU !== undefined) {
        const endU = startU + uSize - 1
        const uRange = uSize === 1 ? `U${startU}` : `U${startU}-U${endU}`
        return `${patchCabinet.name}，${uRange}`
      }
      return `${patchCabinet.name}`
    }
  }
  
  return device.location || '-'
}

// 设备端口连接状态（设备管理列表用）
function getDevicePortConnStatus(device) {
  if (!device?.id) return { text: '无设备', color: 'var(--text-tertiary)', cls: '' }
  const occupiedPorts = portStateStore.getOccupiedPorts(device.id)
  if (occupiedPorts.length > 0) {
    return {
      text: '已占用(' + occupiedPorts.length + ')',
      color: '#f85149',
      cls: 'dot-red'
    }
  }
  return { text: '可用', color: '#3fb950', cls: 'dot-green' }
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

function getDevicePortConnections(device) {
  if (!device?.id) return []
  const occupiedPorts = portStateStore.getOccupiedPorts(device.id)
  return occupiedPorts.map(p => {
    const portKey = p.portId.replace(device.id + '-', '')
    const remoteDeviceName = p.remoteDeviceName || resolveDeviceName(p.remoteDeviceId) || '未知'
    return {
      localPort: portKey,
      remoteDevice: remoteDeviceName,
      remotePort: p.remotePortNum || '',
      cableType: p.cableType || '未指定'
    }
  })
}

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
async function viewDetail(row) {
  if (!row?.id) return
  currentDevice.value = row

  // 查找设备在机柜中的位置
  const cabinet = cabinetStore.cabinets.find(c => {
    // 检查标准机柜的slots
    if (c.slots) {
      return Object.values(c.slots).includes(row.id)
    }
    return false
  })

  if (cabinet && cabinet.slots) {
    // 找到设备占用的U位范围
    const occupiedUs = []
    Object.entries(cabinet.slots).forEach(([u, deviceId]) => {
      if (deviceId === row.id) {
        occupiedUs.push(parseInt(u))
      }
    })
    if (occupiedUs.length > 0) {
      occupiedUs.sort((a, b) => a - b)
      const startU = occupiedUs[0]
      const endU = occupiedUs[occupiedUs.length - 1]
      const uRange = startU === endU ? `U${startU}` : `U${startU}-U${endU}`
      currentDevice.value = {
        ...row,
        location: `${cabinet.name}，${uRange}`
      }
    }
  }

  // 生成设备前面板端口数据
  const ports = []
  const model = deviceLibStore.models.find(m => m.name === row.model)

  if (model) {
    const ethCount = model.ethernetPorts || 0
    for (let i = 1; i <= ethCount; i++) {
      ports.push({
        id: `eth${i}`,
        name: `GE0/0/${i}`,
        type: 'ethernet',
        connected: false,
        hasData: false
      })
    }
    const sfpCount = model.sfpPorts || 0
    for (let i = 1; i <= sfpCount; i++) {
      ports.push({
        id: `sfp${i}`,
        name: `SFP${i}`,
        type: 'sfp',
        connected: false,
        hasData: false
      })
    }
    const xfpCount = model.xfpPorts || 0
    for (let i = 1; i <= xfpCount; i++) {
      ports.push({
        id: `xfp${i}`,
        name: `XFP${i}`,
        type: 'xfp',
        connected: false,
        hasData: false
      })
    }
  }

  // 加载设备已保存的端口名称
  const savedPortNames = row.portNames || {}

  // 如果没有设备库信息，生成默认端口
  if (ports.length === 0) {
    for (let i = 1; i <= 24; i++) {
      ports.push({
        id: `eth${i}`,
        name: `GE0/0/${i}`,
        customName: savedPortNames[`eth${i}`] || null,
        type: 'ethernet',
        connected: false,
        hasData: false
      })
    }
    for (let i = 1; i <= 4; i++) {
      ports.push({
        id: `sfp${i}`,
        name: `SFP${i}`,
        customName: savedPortNames[`sfp${i}`] || null,
        type: 'sfp',
        connected: false,
        hasData: false
      })
    }
  } else {
    ports.forEach(p => {
      if (savedPortNames[p.id]) {
        p.customName = savedPortNames[p.id]
      }
    })
  }

  // 从所有机柜的配线架中反向查询该设备的端口连接状态
  const connectedPortIds = new Set()
  const portConnectionMap = {} // 端口ID/名称 -> {deviceName, portName}
  cabinetStore.cabinets.forEach(cabinet => {
    (cabinet.patchItems || []).forEach(panel => {
      const portMap = panel.portMap || {}
      Object.values(portMap).forEach(portData => {
        if (portData.connectDeviceId === row.id && portData.connectPort) {
          connectedPortIds.add(portData.connectPort)
          const targetDevice = deviceStore.devices.find(d => d.id === portData.connectDeviceId)
          portConnectionMap[portData.connectPort] = {
            deviceName: targetDevice?.name || panel.name || '未知设备',
            portName: portData.portName || portData.connectPort || ''
          }
        }
      })
    })
  })

  // 从拓扑图中查询该设备的连接信息（新增）
  try {
    const topoConnections = getDeviceConnections(row.id)
    topoConnections.forEach(conn => {
      if (conn.localPort) {
        connectedPortIds.add(conn.localPort)
        // 获取对端设备信息
        const targetDevice = deviceStore.devices.find(d => d.id === conn.target)
        const targetPort = conn.targetPort || conn.remotePort || ''
        portConnectionMap[conn.localPort] = {
          deviceName: targetDevice?.name || conn.targetLabel || '未知设备',
          portName: targetPort
        }
      }
    })
  } catch (e) {
    logger.topologySync('查询设备连接失败', e)
  }

  ports.forEach(p => {
    // 同时匹配端口ID和端口名称（拓扑中可能保存的是显示名称如 GE0/0/1）
    if (connectedPortIds.has(p.id) || connectedPortIds.has(p.name)) {
      p.connected = true
      // 保存连接目标信息用于悬浮提示
      const connInfo = portConnectionMap[p.id] || portConnectionMap[p.name]
      if (connInfo) {
        p.connectDeviceName = connInfo.deviceName
        p.connectPortName = connInfo.portName
      }
    }
  })

  devicePanelPorts.value = ports

  // 从设备库判断前后面板端口数量，智能选择默认面板（model已在函数开头获取）
  const frontEth = model?.frontEthernetPorts || model?.ethernetPorts || 0
  const frontSfp = model?.frontSfpPorts || model?.sfpPorts || 0
  const backEth = model?.backEthernetPorts || 0
  const backSfp = model?.backSfpPorts || 0
  const hasFrontPorts = frontEth > 0 || frontSfp > 0
  const hasBackPorts = backEth > 0 || backSfp > 0

  // 根据设备类型智能选择默认面板
  // 服务器设备始终显示后面板（去掉前面板）
  const typeLower = (row.type || '').toLowerCase()
  if (typeLower === 'server' || typeLower.includes('server') || typeLower.includes('服务器') || typeLower.includes('storage') || typeLower.includes('存储') || isServerDevice.value) {
    panelMode.value = 'back'
  } else if (row.defaultPanel) {
    panelMode.value = row.defaultPanel
  } else if (!hasFrontPorts && hasBackPorts) {
    panelMode.value = 'back'
  } else {
    panelMode.value = 'front' // 默认显示前面板
  }

  // 初始化服务器后面板数据
  if (isServerDevice.value) {
    initServerBackPanel(row)
  }

  // 初始化端口名称编辑数据
  portNameEdits.value = {}
  ports.forEach(p => {
    portNameEdits.value[p.id] = p.customName || p.name
  })
  portEditMode.value = false

  await nextTick()
  // 使用与机柜管理一致的 SVG 真实设备面板样式
  zoomDeviceData.value = currentDevice.value
  zoomVisible.value = true
}

async function deleteDevice(device) {
  // 检查设备是否有连线（连线派生自 portStateStore）
  const connectedConns = portStateStore.getAllConnections().filter(
    c => c.sourceDeviceId === device.id || c.targetDeviceId === device.id
  )
  const hasConnections = connectedConns.length > 0

  try {
    let confirmMsg = `确定要删除设备「${device.name}」吗？此操作不可恢复。`
    if (hasConnections) {
      confirmMsg = `设备「${device.name}」已有 ${connectedConns.length} 条连线。确定要删除该设备吗？\n\n删除后将从机柜下架，并从拓扑中移除该设备及其所有连线。此操作不可恢复。`
    }

    await ElMessageBox.confirm(confirmMsg, '确认删除', {
      type: hasConnections ? 'warning' : 'info',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger'
    })

    // 先从所有机柜中下架该设备
    cabinetStore.cabinets.forEach(cabinet => {
      // 从服务器机柜的 slots 中移除
      if (cabinet.slots) {
        const newSlots = { ...cabinet.slots }
        let changed = false
        Object.keys(newSlots).forEach(u => {
          if (newSlots[u] === device.id) {
            delete newSlots[u]
            changed = true
          }
        })
        if (changed) {
          cabinetStore.updateCabinet(cabinet.id, { slots: newSlots })
        }
      }
      // 从配线机柜的 patchItems 中移除（网络设备）
      if (cabinet.patchItems) {
        const newPatchItems = cabinet.patchItems.filter(item => item.deviceId !== device.id)
        if (newPatchItems.length !== cabinet.patchItems.length) {
          cabinetStore.updateCabinet(cabinet.id, { patchItems: newPatchItems })
        }
      }
    })

    // 从 portStateStore 清理该设备的所有端口占用状态和连接关系
    // （节点本身由 deviceStore.deleteDevice 移除后，拓扑会自动派生消失，无需操作旧 topology store）
    if (hasConnections) {
      ElMessage.info(`已移除 ${connectedConns.length} 条关联连线`)
    }
    try {
      portStateStore.cleanupDevice(device.id)
    } catch(e) { console.error('清理端口状态失败', e) }

    deviceStore.deleteDevice(device.id)
    ElMessage.success('设备已删除')
    addLog({ type: LogType.DEVICE_DELETE, detail: `删除设备：${device.name}`, result: LogResult.SUCCESS, device: device.name })
  } catch {}
}

async function submitForm() {
  formRef.value?.validate(async valid => {
    if (!valid) return
    // 安全审计 F-007：敏感字段加密后再入库（幂等，已加密的跳过）
    const payload = await encryptDeviceSecrets(form.value)
    if (isEdit.value) {
      // 记录改名前的设备名，用于同步连接快照（三界面一致）
      const before = deviceStore.devices.find(d => String(d.id) === String(editId.value))
      const oldName = before?.name
      deviceStore.updateDevice(editId.value, payload)
      // 设备改名后同步连接快照中的 deviceName，机柜悬停/连接详情弹窗立即显示新名
      if (oldName && payload.name && String(payload.name).trim() !== String(oldName).trim()) {
        portStateStore.syncDeviceNameToConnections(editId.value, String(payload.name).trim())
      }
      ElMessage.success('设备信息已更新')
      addLog({ type: LogType.DEVICE_EDIT, detail: `编辑设备：${payload.name}`, result: LogResult.SUCCESS, device: payload.name })
    } else {
      const newDevice = deviceStore.addDevice(payload)
      ElMessage.success('设备添加成功')
      addLog({ type: LogType.DEVICE_ADD, detail: `添加设备：${payload.name} (${payload.ip})`, result: LogResult.SUCCESS, device: payload.name })
      // 自动保存到设备库
      autoSaveToDeviceLib(newDevice)
    }
    dialogVisible.value = false
  })
}

// 自动将新设备保存到设备库
function autoSaveToDeviceLib(device) {
  logger.deviceSync('触发自动保存，设备信息:', device)

  // 检查必要的厂商信息
  if (!device || !device.vendor) {
    logger.deviceSync('跳过：缺少厂商信息')
    return
  }

  // 如果没有型号，使用厂商+类型作为默认型号
  let modelName = device.model?.trim()
  if (!modelName) {
    // 生成一个默认型号名
    const typeLabel = getTypeLabel(device.type) || '设备'
    modelName = `${device.vendor} ${typeLabel}`
    logger.deviceSync('未填写型号，自动生成:', modelName)
  }

  // 检查设备库中是否已存在相同型号
  const models = deviceLibStore.models
  logger.deviceSync('当前设备库模型数量:', models.length)
  const existing = models.find(m =>
    m.name === modelName && m.vendor === device.vendor
  )
  if (existing) {
    logger.deviceSync('跳过：型号已存在:', existing.name)
    return
  }

  // 添加到设备库
  const newModel = {
    id: 'custom_' + Date.now().toString(),
    name: modelName,
    vendor: device.vendor,
    type: device.type || 'other',
    uSize: device.uSize || 1,
    isCustom: true,
    remark: `从设备「${device.name}」(${device.ip || '无IP'})自动添加`
  }

  logger.deviceSync('准备添加新型号:', newModel)
  deviceLibStore.addModel(newModel)
  logger.deviceSync('添加成功，设备库模型数量:', deviceLibStore.models.length)
}

async function connectDevice(device) {
  if (!device) return
  if (device.loginType === 'ssh') {
    openSSHTerminal(device)
    return
  }

  const ip = device.ip || device.ipAddress
  if (!ip || String(ip).trim() === '') {
    ElMessage.warning('设备IP地址无效')
    return
  }

  const protocol = device.webProtocol || 'http'
  const port = device.port
  // 如果没有输入端口或端口为空，直接使用IP地址不带端口
  let url
  if (port && String(port).trim() !== '' && String(port).trim() !== 'undefined') {
    url = `${protocol}://${ip}:${port}`
  } else {
    url = `${protocol}://${ip}`
  }

  // Electron 环境：优先使用应用内 WebView，禁止跳出到外部浏览器
  if (typeof window !== 'undefined' && window.electronAPI?.openWebview) {
    window.electronAPI.openWebview({
      urls: [url],
      manufacturer: device.manufacturer,
      deviceType: device.deviceType || device.name
    })
    return
  }

  // 移动端环境：使用 Capacitor Browser（Android/iOS App 内打开）
  try {
    await Browser.open({ url })
    return
  } catch {
    // Capacitor Browser 不可用（非原生环境），降级处理
  }

  // 最后的降级：在新标签页打开（浏览器环境）
  window.open(url, '_blank')
}

// 查看真实设备面板
function showRealPanel(device) {
  realPanelDevice.value = device
  realPanelVisible.value = true
}

async function openSSHTerminal(device) {
  if (typeof window === 'undefined' || !window.electronAPI?.sshConnect) {
    ElMessage.warning('SSH终端仅在桌面客户端中可用')
    return
  }
  
  sshDevice.value = device
  sshPrompt.value = `${device.sshUser || 'admin'}@${device.ip}`
  sshVendor.value = device.vendor || device.model || ''
  terminalLines.value = [
    { type: 'system', text: `Connecting to ${device.ip}:${device.sshPort || 22} via SSH...` },
  ]
  currentCommand.value = ''
  commandHistory.value = []
  historyIndex.value = -1
  await nextTick()
  sshVisible.value = true
  await nextTick()
  scrollTerminal()
  termInputRef.value?.focus()

  // 真实SSH连接
  try {
    // 安全审计 F-007：store 中为密文，连接前解密
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
      addLog({ type: LogType.SSH_CONNECT, detail: `SSH连接：${device.name} (${device.ip})`, result: LogResult.SUCCESS, device: device.name })

      // 获取初始信息
      try {
        const info = await window.electronAPI.sshExec({ connectionId: device.id, command: 'hostname' })
        if (info && info.success && info.output) sshPrompt.value = info.output.trim() + '#'
      } catch (e) {
        // hostname 获取失败不影响终端使用
      }

      scrollTerminal()
    } else {
      isSshConnected.value = false
      const errMsg = result && result.error ? result.error : '连接失败（未知错误）'
      terminalLines.value.push({ type: 'error', text: `Connection failed: ${errMsg}` })
      terminalLines.value.push({ type: 'output', text: '' })
      addLog({ type: LogType.SSH_CONNECT, detail: `SSH连接失败：${device.name} (${device.ip})`, result: LogResult.FAILED, device: device.name })
      setTimeout(() => { sshVisible.value = false }, 5000)
    }
  } catch (e) {
    isSshConnected.value = false
    terminalLines.value.push({ type: 'error', text: `Connection failed: ${e.message || 'SSH连接异常'}` })
    terminalLines.value.push({ type: 'output', text: '' })
    addLog({ type: LogType.SSH_CONNECT, detail: `SSH连接失败：${device.name} (${device.ip})`, result: LogResult.FAILED, device: device.name })
    setTimeout(() => { sshVisible.value = false }, 5000)
  }
}

const isSshConnected = ref(false)

async function sendCommand() {
  const cmd = currentCommand.value.trim()
  if (!cmd) return

  terminalLines.value.push({ type: 'input', text: cmd })
  commandHistory.value.unshift(cmd)
  historyIndex.value = -1

  // 处理退出命令
  if (cmd.toLowerCase() === 'quit' || cmd.toLowerCase() === 'exit') {
    await disconnectSSH()
    return
  }

  // 真实SSH执行命令
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

function cancelCommand() {
  currentCommand.value = ''
}

function historyUp() {
  if (historyIndex.value < commandHistory.value.length - 1) {
    historyIndex.value++
    // 延迟更新以保持光标位置
    setTimeout(() => {
      const input = termInputRef.value
      if (input) {
        const pos = input.selectionStart
        currentCommand.value = commandHistory.value[historyIndex.value]
        nextTick(() => {
          if (input) {
            input.setSelectionRange(pos, pos)
            input.focus()
          }
        })
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
        nextTick(() => {
          if (input) {
            input.setSelectionRange(pos, pos)
            input.focus()
          }
        })
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
        nextTick(() => {
          if (input) {
            input.setSelectionRange(pos, pos)
            input.focus()
          }
        })
      } else {
        currentCommand.value = ''
      }
    }, 0)
  }
}

function clearTerminal() {
  terminalLines.value = []
}

function scrollTerminal() {
  nextTick(() => {
    if (terminalBody.value) {
      terminalBody.value.scrollTop = terminalBody.value.scrollHeight
    }
  })
}

// 导出Excel
async function exportDevicesExcel() {
  if (deviceStore.devices.length === 0) {
    ElMessage.warning('没有设备数据可导出')
    return
  }

  // 准备数据
  const exportData = deviceStore.devices.map(d => ({
    '设备名称': d.name,
    'IP地址': d.ip,
    '设备类型': getTypeLabel(d.type),
    '厂商': d.vendor,
    '型号': d.model,
    '位置': d.location,
    'U数': d.uSize || 1,
    '登录方式': d.loginType === 'ssh' ? 'SSH' : 'Web',
    'SSH端口': d.sshPort || (d.loginType === 'ssh' ? '22' : ''),
    '用户名': d.sshUser || '',
    // 安全审计 F-007：导出不再包含 SSH 密码，防止明文凭据泄露
    '状态': d.status === 'online' ? '在线' : '离线',
    '备注': d.remark || ''
  }))

  const ws = XLSX.utils.json_to_sheet(exportData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '设备列表')

  // 设置列宽
  ws['!cols'] = [
    { wch: 20 }, { wch: 15 }, { wch: 10 }, { wch: 12 },
    { wch: 18 }, { wch: 15 }, { wch: 6 }, { wch: 10 },
    { wch: 8 }, { wch: 12 }, { wch: 15 }, { wch: 8 }, { wch: 20 }
  ]

  const fileName = `netops_devices_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })

  try {
    // 使用Electron的文件保存对话框
    const result = await window.electronAPI?.saveFile({
      content: new Uint8Array(wbout),
      defaultName: fileName,
      filters: [
        { name: 'Excel Files', extensions: ['xlsx'] }
      ]
    })

    if (result?.success) {
      ElMessage.success(`已导出到: ${result.filePath}`)
      addLog({ type: LogType.DEVICE_EXPORT, detail: '导出设备数据', result: LogResult.SUCCESS })
    } else if (result?.canceled) {
      // 用户取消
    } else {
      throw new Error(result?.error || '保存失败')
    }
  } catch (err) {
    // 降级：使用浏览器下载
    const blob = new Blob([wbout], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('设备数据已导出（浏览器下载模式）')
  }
}

// 导入Excel/CSV
async function handleExcelImport(file) {
  const reader = new FileReader()
  reader.onload = e => {
    try {
      const data = new Uint8Array(e.target.result)
      const workbook = XLSX.read(data, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(sheet)

      // 智能类型推断：根据设备名称/类型自动映射到标准类型
      function inferDeviceType(name, rawType) {
        const text = ((rawType || '') + ' ' + (name || '')).toLowerCase()
        if (text.includes('核心交换机') || text.includes('汇聚交换机') || text.includes('接入交换机') || text.includes('交换机')) return 'switch'
        if (text.includes('路由器') || text.includes('路由')) return 'router'
        if (text.includes('防火墙') || text.includes('安全准入') || text.includes('安全隔离') || text.includes('密码管理') || text.includes('威胁防御') || text.includes('网闸') || text.includes('网御')) return 'firewall'
        if (text.includes('无线') || text.includes('ap')) return 'wireless'
        if (text.includes('负载均衡')) return 'loadbalancer'
        if (text.includes('网关')) return 'gateway'
        if (text.includes('服务器') || text.includes('存储') || text.includes('nvr') || text.includes('dvr')) return 'server'
        if (text.includes('ups')) return 'ups'
        // 默认fallback
        const typeMap = {
          '交换机': 'switch', '路由器': 'router', '防火墙': 'firewall',
          '服务器': 'server', 'UPS电源': 'ups', '存储设备': 'storage',
          '无线AP': 'wireless', '负载均衡': 'loadbalancer', '网关': 'gateway', '其他': 'other'
        }
        return typeMap[rawType] || rawType || 'other'
      }

      // 映射Excel列到设备对象
      const devices = jsonData.map(row => {
        const rawType = row['设备类型'] || ''
        const name = row['设备名称'] || ''
        const inferredType = inferDeviceType(name, rawType)
        const loginMap = { 'SSH': 'ssh', 'ssh': 'ssh', 'Web': 'web', 'web': 'web' }
        const portVal = row['SSH端口'] || row['端口'] // 兼容新旧Excel列名
        const sshPort = portVal != null && portVal !== '' ? String(portVal) : '22'

        return {
          name: name,
          ip: row['IP地址'] || '',
          type: inferredType,
          vendor: row['厂商'] || '',
          model: row['型号'] || '',
          location: row['位置'] || '',
          uSize: parseInt(row['U数']) || 1,
          loginType: loginMap[row['登录方式']] || 'ssh',
          sshPort: sshPort,
          sshUser: row['用户名'] || '',
          sshPass: row['密码'] || '',
          // 设备状态：支持多种格式映射
          status: (() => {
            const statusVal = row['状态']
            if (!statusVal) return 'offline'
            const s = String(statusVal).trim().toLowerCase()
            if (s === '在线' || s === '1' || s === 'true' || s === 'online' || s === 'up') return 'online'
            if (s === '离线' || s === '0' || s === 'false' || s === 'offline' || s === 'down') return 'offline'
            return 'offline'
          })(),
          remark: row['备注'] || ''
        }
      }).filter(d => d.name && d.ip)

      importPreview.value = devices
      jsonImportPreview.value = []
      ElMessage.success(`解析到 ${devices.length} 台设备`)
    } catch {
      ElMessage.error('文件解析失败，请检查文件格式')
    }
  }
  reader.readAsArrayBuffer(file.raw)
}

function handleJsonImport(file) {
  const reader = new FileReader()
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result)
      if (Array.isArray(data)) {
        jsonImportPreview.value = data
        importPreview.value = []
        ElMessage.success(`解析到 ${data.length} 台设备`)
      } else {
        ElMessage.error('文件格式错误，需要JSON数组')
      }
    } catch {
      ElMessage.error('JSON解析失败，请检查文件格式')
    }
  }
  reader.readAsText(file.raw)
}

function showImportDialog() {
  importDialogVisible.value = true
  importPreview.value = []
  jsonImportPreview.value = []
}

async function confirmImport() {
  const dataToImport = importPreview.value.length > 0 ? importPreview.value : jsonImportPreview.value

  if (dataToImport.length === 0) {
    ElMessage.warning('没有可导入的数据')
    return
  }

  try {
    await ElMessageBox.confirm(`将导入 ${dataToImport.length} 台设备，已有设备不会被覆盖`, '确认导入', {
      type: 'info',
      confirmButtonText: '确认导入',
      cancelButtonText: '取消'
    })
    // 安全审计 F-007：导入的密码为明文（Excel/JSON），入库前加密
    const encryptedList = await Promise.all(dataToImport.map(d => encryptDeviceSecrets(d)))
    await deviceStore.importDevices(encryptedList)
    importDialogVisible.value = false
    ElMessage.success(`成功导入 ${dataToImport.length} 台设备`)
    addLog({ type: LogType.DEVICE_IMPORT, detail: `导入设备：${dataToImport.length}台`, result: LogResult.SUCCESS })
  } catch {}
}

function formatDate(iso) {
  return iso ? dayjs(iso).format('YYYY-MM-DD HH:mm') : '-'
}

// 设备前面板端口分类
const panelEthernetPorts = computed(() => devicePanelPorts.value.filter(p => p.type === 'ethernet'))
const panelSfpPorts = computed(() => devicePanelPorts.value.filter(p => p.type === 'sfp'))
const panelXfpPorts = computed(() => devicePanelPorts.value.filter(p => p.type === 'xfp'))

// 判断当前设备是否为服务器
const isServerDevice = computed(() => {
  const type = (currentDevice.value?.type || '').toLowerCase()
  const model = (currentDevice.value?.model || '').toLowerCase()
  return type === 'server' ||
    type.includes('server') ||
    type.includes('服务器') ||
    type.includes('storage') ||
    type.includes('存储') ||
    model.includes('dell') ||
    model.includes('hp') ||
    model.includes('huawei') && model.includes('server') ||
    (currentDevice.value?.ports || []).some(p => (p.name || '').toUpperCase().includes('MGMT'))
})

// 判断当前设备是否禁用了前面板
const isFrontPanelDisabled = computed(() => {
  if (!currentDevice.value?.model) return false
  const model = deviceLibStore.models.find(m => m.name === currentDevice.value.model)
  return model?.frontPanelDisabled || false
})

// 服务器后面板 - 管理端口（ref，支持编辑）
const backPanelMgmtPorts = ref([])
// 服务器后面板 - 网络端口（ref，支持编辑）
const backPanelEthPorts = ref([])
// 服务器后面板 - 光口（ref，支持编辑）
const backPanelSfpPorts = ref([])
// 服务器后面板 - 电源模块（ref，支持编辑）
const backPanelPowerModules = ref([])

// 初始化服务器后面板数据
function initServerBackPanel(device) {
  if (!device) return
  const model = (device.model || '').toLowerCase()
  const isDell = model.includes('dell') || model.includes('poweredge')
  const isHuawei = model.includes('huawei') || model.includes('fusion')
  const isHP = model.includes('hp') || model.includes('proliant') || model.includes('dl3')

  // 从设备型号获取后面板端口配置
  const deviceModel = deviceLibStore.models.find(m => m.name === device.model)
  const backEthCount = deviceModel?.backEthernetPorts || 0
  const backSfpCount = deviceModel?.backSfpPorts || 0

  // 管理端口
  const mgmtPorts = []
  // MGMT和Console使用网口图标（rj45），可连线
  mgmtPorts.push({ id: 'mgmt', name: 'MGMT', customName: '', icon: 'rj45', connectable: true, connected: false, ip: device.ip })
  mgmtPorts.push({ id: 'console', name: 'Console', customName: '', icon: 'rj45', connectable: true, connected: false })
  let bmcName = 'iDRAC'
  if (isHuawei) bmcName = 'iBMC'
  else if (isHP) bmcName = 'iLO'
  mgmtPorts.push({ id: 'bmc', name: bmcName, customName: '', icon: 'Setting', connectable: true, connected: false, ip: device.ip })
  // USB、VGA、HDMI、Serial 不可连线
  mgmtPorts.push({ id: 'usb1', name: 'USB-1', customName: '', icon: 'Upload', connectable: false, connected: false })
  mgmtPorts.push({ id: 'usb2', name: 'USB-2', customName: '', icon: 'Upload', connectable: false, connected: false })
  mgmtPorts.push({ id: 'vga', name: 'VGA', customName: '', icon: 'Picture', connectable: false, connected: false })
  mgmtPorts.push({ id: 'hdmi', name: 'HDMI', customName: '', icon: 'Picture', connectable: false, connected: false })
  mgmtPorts.push({ id: 'serial', name: 'Serial', customName: '', icon: 'SetUp', connectable: false, connected: false })

  // 从设备数据中恢复连接状态和自定义名称
  const devicePorts = device.ports || []
  const portNames = device.portNames || {}
  mgmtPorts.forEach(p => {
    const dp = devicePorts.find(dp => dp.name === p.name || dp.id === p.id)
    if (dp) {
      p.connected = !!dp.connected
      if (dp.connectDeviceName) p.connectDeviceName = dp.connectDeviceName
      if (dp.connectPortName) p.connectPortName = dp.connectPortName
    }
    if (portNames[p.id]) p.customName = portNames[p.id]
    else if (portNames[p.name]) p.customName = portNames[p.name]
  })
  backPanelMgmtPorts.value = mgmtPorts

  // 后面板网络端口（RJ45），可连线
  const backEthPorts = []
  for (let i = 1; i <= backEthCount; i++) {
    const port = {
      id: `back-eth-${i}`,
      name: `GE-${i}`,
      customName: '',
      icon: 'rj45',
      connectable: true,
      connected: false
    }
    const dp = devicePorts.find(dp => dp.name === port.name || dp.id === port.id)
    if (dp) {
      port.connected = !!dp.connected
      if (dp.connectDeviceName) port.connectDeviceName = dp.connectDeviceName
      if (dp.connectPortName) port.connectPortName = dp.connectPortName
    }
    if (portNames[port.id]) port.customName = portNames[port.id]
    else if (portNames[port.name]) port.customName = portNames[port.name]
    backEthPorts.push(port)
  }
  backPanelEthPorts.value = backEthPorts

  // 后面板光口（SFP），可连线
  const backSfpPorts = []
  for (let i = 1; i <= backSfpCount; i++) {
    const port = {
      id: `back-sfp-${i}`,
      name: `SFP-${i}`,
      customName: '',
      icon: 'sfp',
      connectable: true,
      connected: false
    }
    const dp = devicePorts.find(dp => dp.name === port.name || dp.id === port.id)
    if (dp) {
      port.connected = !!dp.connected
      if (dp.connectDeviceName) port.connectDeviceName = dp.connectDeviceName
      if (dp.connectPortName) port.connectPortName = dp.connectPortName
    }
    if (portNames[port.id]) port.customName = portNames[port.id]
    else if (portNames[port.name]) port.customName = portNames[port.name]
    backSfpPorts.push(port)
  }
  backPanelSfpPorts.value = backSfpPorts

  // 电源模块，不可连线
  const psuModules = []
  for (let i = 1; i <= 2; i++) {
    const mod = { id: `psu${i}`, name: `PSU-${i}`, customName: '', connectable: false, connected: false }
    const dp = devicePorts.find(p => p.name === mod.name || p.id === mod.id)
    if (dp) {
      mod.connected = !!dp.connected
      if (dp.connectDeviceName) mod.connectDeviceName = dp.connectDeviceName
      if (dp.connectPortName) mod.connectPortName = dp.connectPortName
    }
    if (portNames[mod.id]) mod.customName = portNames[mod.id]
    else if (portNames[mod.name]) mod.customName = portNames[mod.name]
    psuModules.push(mod)
  }
  backPanelPowerModules.value = psuModules
}

// 只有交换机类型且端口数 >= 8 时使用两排交错排列
const isPanelSwitchDevice = computed(() => {
  const type = currentDevice.value?.type
  const isSwitch = type === 'switch' || type === '核心交换机' || type === '汇聚交换机' || type === '接入交换机'
  if (!isSwitch) return false
  return panelEthernetPorts.value.length >= 8
})

// RJ45端口按真实交换机两排交错排列（上排偶数、下排奇数）
const panelEthernetTopRow = computed(() => {
  if (!isPanelSwitchDevice.value) return []
  return panelEthernetPorts.value.filter((_, index) => (index + 1) % 2 === 0)
})
const panelEthernetBottomRow = computed(() => {
  if (!isPanelSwitchDevice.value) return []
  return panelEthernetPorts.value.filter((_, index) => (index + 1) % 2 === 1)
})
const isLargePortCount = computed(() => panelEthernetPorts.value.length > 24)

// 根据厂家返回logo文字
const devicePanelLogo = computed(() => {
  const m = (currentDevice.value?.manufacturer || currentDevice.value?.vendor || '').toLowerCase()
  if (m.includes('h3c') || m.includes('hpe') || m.includes('comware') || m.includes('华三')) return 'H3C'
  if (m.includes('huawei') || m.includes('hw') || m.includes('vrp') || m.includes('华为')) return 'HW'
  if (m.includes('cisco') || m.includes('思科')) return 'CISCO'
  if (m.includes('tp-link') || m.includes('tplink')) return 'TP-LINK'
  if (m.includes('dahua') || m.includes('大华')) return 'DAHUA'
  if (m.includes('hikvision') || m.includes('hik') || m.includes('海康')) return 'HIKVISION'
  if (m.includes('ruijie') || m.includes('锐捷')) return 'RUIJIE'
  return 'NET'
})

// 设备面板对话框标题
const detailDialogTitle = computed(() => {
  const name = currentDevice.value?.name || '设备'
  if (isServerDevice.value) return name + ' - 服务器后面板'
  return name + ' - ' + (panelMode.value === 'back' ? '后面板' : '前面板')
})

// 端口连线相关（与机柜管理一致：设备 + 配线架端口统一从 portStateStore 获取）
// 线缆类型选项（按本端端口类型）
const availableCableOptions = computed(() => {
  const pt = portConnectForm.value.portType || 'ethernet'
  return pt === 'optical' ? portStateStore.OPTICAL_CABLES : portStateStore.ETHERNET_CABLES
})

// 可用目标端口平铺列表（同类型、未占用，含普通设备端口 + 机柜配线架端口）
const availableTargetPortsFlat = computed(() => {
  const portType = portConnectForm.value.portType || 'ethernet'
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

// 根据设备ID查询所在机柜名和U位（与机柜管理一致，支持 slots 设备与配线设备）
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

// 生成"选择设备"下拉选项的显示文本（filterable 搜索依据）
function formatDeviceOptionLabel(d) {
  if (!d) return ''
  let label = d.deviceName || ''
  if (d.deviceModel) label += '（' + d.deviceModel + '）'
  if (d.uPosition) label += ' · ' + d.uPosition
  return label
}

const connectingPortName = computed(() => {
  if (!connectingPort.value) return ''
  return connectingPort.value.customName || connectingPort.value.name || connectingPort.value.id || ''
})

// 保存端口自定义名称
function savePortNames() {
  const device = currentDevice.value
  if (!device) return

  // 基于已有 portNames 展开，避免丢失未在本面板展示的端口自定义名
  const portNames = { ...(device.portNames || {}) }

  // 保存普通端口名称
  devicePanelPorts.value.forEach(p => {
    const editedName = portNameEdits.value[p.id] || ''
    if (editedName && editedName !== p.name) {
      portNames[p.id] = editedName
    }
  })

  // 保存服务器管理端口名称
  backPanelMgmtPorts.value.forEach(p => {
    if (p.customName && p.customName !== p.name) {
      portNames[p.id] = p.customName
    }
  })

  // 保存服务器电源模块名称
  backPanelPowerModules.value.forEach(p => {
    if (p.customName && p.customName !== p.name) {
      portNames[p.id] = p.customName
    }
  })

  deviceStore.updateDevice(device.id, { portNames })
  // 关键：同步更新连接快照中的端口名，机柜悬停/连接详情/拓扑边立即显示新名（三界面同步）
  Object.entries(portNames).forEach(([pid, name]) => {
    portStateStore.syncPortNameToConnections(device.id, pid, name)
  })
  portStateStore.clearDevicePortCache(device.id)

  // updateDevice 会替换 store 中的设备对象，刷新本地引用让放大弹窗端口名立即更新
  const latest = deviceStore.devices.find(d => String(d.id) === String(device.id))
  if (latest) {
    currentDevice.value = latest
    zoomDeviceData.value = latest
  }

  portEditMode.value = false
  ElMessage.success('端口名称已保存')
}

// 端口点击辅助函数：已占用端口弹修改窗口，空闲端口弹创建窗口
function onPortClick(port) {
  if (!port || !port.connectable) return
  const deviceId = currentDevice.value?.id
  if (!deviceId) return
  const isOccupied = portStateStore.isPortOccupied(deviceId, port.id)
  if (isOccupied) {
    openEditConnection(port)
  } else {
    openPortConnect(port)
  }
}

// DevicePanelZoom 端口点击适配：将 SVG 面板的 portInfo 转为设备管理原有 port 结构
function handleZoomPortClick(portInfo) {
  const { deviceId, portId, portNum, portType, portName } = portInfo
  if (!deviceId || !portId) return
  if (portType === 'console' || portType === 'mgmt') {
    ElMessage.warning(portType === 'console' ? 'Console口不支持网络连接' : 'MGMT口不支持网络连接')
    return
  }
  // 检查端口是否已占用
  const isOccupied = portStateStore.isPortOccupied(deviceId, portId)
  // 适配为设备管理原有的 port 结构
  const port = {
    id: portId,
    name: portName || portId,
    type: portType || 'ethernet',
    portType: portType || 'ethernet',
    portNum: portNum,
    connectable: true,
    connected: isOccupied
  }
  // 统一走 openPortConnect：已占用端口显示连接详情（可断开），空闲端口进入创建连线表单
  openPortConnect(port)
}

// 修改连线相关函数
function openEditConnection(port) {
  const deviceId = currentDevice.value?.id
  const portId = port.id
  const connInfo = portStateStore.getPortConnection(deviceId, portId)
  if (!connInfo) return

  editConnectionData.value = {
    deviceId: deviceId,
    portId: portId,
    portType: port.portType || 'ethernet',
    deviceName: currentDevice.value?.name || '',
    portName: port.name || port.id,
    connectionId: connInfo.connectionId,
    remoteDeviceId: connInfo.remoteDeviceId,
    remoteDeviceName: connInfo.remoteDeviceName || '',
    remotePortId: connInfo.remotePortId,
    remotePortNum: connInfo.remotePortNum || '',
    cableType: connInfo.cableType || ''
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
    } else {
      ElMessage.error(result.message)
    }
  } catch (e) {
    ElMessage.error('断开失败：' + e.message)
  }
}

// 端口连线相关函数（与机柜管理统一：已占用端口显示连接详情，空闲端口创建连线）
function openPortConnect(port) {
  if (portEditMode.value) return
  connectingPort.value = port

  const deviceId = port.deviceId || currentDevice.value?.id
  const portId = port.id
  if (!deviceId || !portId) return
  const deviceName = port.deviceName || currentDevice.value?.name || ''

  // 归一化端口类型（optical / ethernet）
  const portType = port.portType || port.type
  const normalizedType = (portType === 'sfp' || portType === 'xfp' || portType === 'optical') ? 'optical' : 'ethernet'

  // 获取端口号
  let portNum = port.portNumber || port.portNum || 0
  if (!portNum) {
    const match = String(portId).match(/(\d+)$/)
    if (match) portNum = parseInt(match[1])
  }

  // 清除端口缓存以获取最新状态
  portStateStore.clearDevicePortCache(deviceId)

  // 检查是否已占用 + 读取连接详情
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
    deviceName: localDev?.name || deviceName,
    portNum: portNum,
    // 预填本端端口名称：自定义名 > 标准名（eth5 → GE0/0/5）> 端口标签名 > 端口号
    localPortName: port?.customName || resolvePortName(localDev, portId) || port?.name || standardPortName(portId) || String(portNum || ''),
    targetDeviceId: '',
    targetPortId: '',
    cableType: normalizedType === 'optical' ? 'LC单模光纤' : '六类网线',
    occupied: isOccupied,
    connectionId: connInfo?.connectionId || '',
    // 对端设备名优先从 deviceStore 动态解析（设备改名后立即生效），快照兜底
    remoteDeviceName: resolveDeviceName(connInfo?.remoteDeviceId) || connInfo?.remoteDeviceName || '',
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

// 从 targetPortId（完整 key：deviceId-portKey）解析目标端口信息
function findTargetPortInfo(targetPortId) {
  const dashIdx = String(targetPortId).lastIndexOf('-')
  if (dashIdx < 0) return null

  const deviceId = String(targetPortId).substring(0, dashIdx)
  const portKey = String(targetPortId).substring(dashIdx + 1)

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
        if (String(panel.id) === String(deviceId)) {
          deviceName = panel.name || ('配线架 - ' + (cabinet.name || ''))
          // 配线架端口备注名优先
          const alias = panel.portMap?.[portNumber]?.portName || panel.portMap?.[String(portNumber)]?.portName
          if (alias) portName = alias
        }
      })
    })
    if (!deviceName) deviceName = '配线架'
  } else {
    const device = deviceStore.devices.find(d => String(d.id) === String(deviceId))
    deviceName = device?.name || ''
    const match = portKey.match(/(\d+)$/)
    if (match) portNumber = parseInt(match[1])
    portType = portStateStore.inferPortType(portKey)
    // 端口显示名：自定义名优先，其次标准名（eth5 → GE0/0/5）
    portName = device ? resolvePortName(device, portKey) : standardPortName(portKey)
  }

  return { deviceId, portId: portKey, deviceName, portNumber, portName, portType }
}

// 创建连接（端口快照存显示名，与机柜管理一致）
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

  // 保存本端端口自定义名称（普通设备 → device.portNames）
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
    ElMessage.success('端口连接成功！' + form.portId + ' ↔ ' + targetPortInfo.portId)
    portConnectVisible.value = false
    // updateDevice 可能替换了 store 中的设备对象（端口改名场景），刷新本地引用同步放大弹窗
    const latest = deviceStore.devices.find(d => String(d.id) === String(form.deviceId))
    if (latest) {
      currentDevice.value = latest
      zoomDeviceData.value = latest
    }
    refreshPanelPortStates()
  } else {
    ElMessage.error(result.message)
  }
}

// 断开连接
function doDisconnectPort() {
  const form = portConnectForm.value
  if (!form.connectionId) {
    ElMessage.error('未找到连接信息')
    return
  }

  const result = portStateStore.disconnectPorts(form.connectionId)
  if (result.success) {
    ElMessage.success('连接已断开')
    portConnectVisible.value = false
    refreshPanelPortStates()
  } else {
    ElMessage.error(result.message)
  }
}

// 保存本端端口自定义名称：device.portNames[portId] + 同步连接快照（与机柜管理一致）
function saveLocalPortName(deviceId, portId, name) {
  const dev = deviceStore.devices.find(d => String(d.id) === String(deviceId))
  if (!dev) return
  if (!dev.portNames) dev.portNames = {}
  dev.portNames[portId] = name
  deviceStore.updateDevice(deviceId, { portNames: { ...dev.portNames } })
  // 关键：同步更新已有连接快照中的端口名，机柜/拓扑/连接详情立即显示新名
  portStateStore.syncPortNameToConnections(deviceId, portId, name)
  portStateStore.clearDevicePortCache(deviceId)
}

function refreshPanelPortStates() {
  if (!currentDevice.value) return
  // 改为读取 portStateStore（连接数据唯一源），确保连线/断开后立即反映面板状态
  devicePanelPorts.value.forEach(p => {
    const conn = portStateStore.getPortConnection(currentDevice.value.id, p.id)
    if (conn) {
      p.connected = true
      p.connectDeviceName = conn.remoteDeviceName || ''
      // remotePortId 为 KEY 格式 (deviceId-port)，还原为可读端口号
      const rawPort = conn.remoteDeviceId && conn.remotePortId && conn.remotePortId.startsWith(conn.remoteDeviceId + '-')
        ? conn.remotePortId.slice(conn.remoteDeviceId.length + 1)
        : conn.remotePortId
      p.connectPortName = rawPort || ''
      p.hasData = true
    } else {
      p.connected = false
      p.connectDeviceName = ''
      p.connectPortName = ''
      p.hasData = false
    }
  })
}

// 设备库导入
const filteredLibModels = computed(() => {
  return deviceLibStore.models.filter(m => {
    if (libFilterVendor.value && m.vendor !== libFilterVendor.value) return false
    if (libFilterType.value && m.type !== libFilterType.value) return false
    if (libSearchText.value) {
      const search = libSearchText.value.toLowerCase()
      if (!m.name.toLowerCase().includes(search) &&
          !m.vendor.toLowerCase().includes(search) &&
          !(m.remark || '').toLowerCase().includes(search)) {
        return false
      }
    }
    return true
  })
})

function handleLibSelection(selection) {
  // 跨筛选保持选中状态：先移除当前页面所有行的选中记录，
  // 再将当前页面中真正被选中的行加入记录
  const currentIds = new Set(filteredLibModels.value.map(m => m.id))
  currentIds.forEach(id => selectedLibModelIds.value.delete(id))
  selection.forEach(row => {
    selectedLibModelIds.value.add(row.id)
  })
}

// 筛选变化后恢复表格的选中状态
watch(filteredLibModels, () => {
  nextTick(() => {
    if (!libTableRef.value) return
    filteredLibModels.value.forEach(row => {
      if (selectedLibModelIds.value.has(row.id)) {
        libTableRef.value.toggleRowSelection(row, true)
      }
    })
  })
})

function importFromLib() {
  const models = selectedLibModels.value
  if (models.length === 0) return

  const devices = models.map(model => ({
    name: model.name,
    ip: '',
    vendor: model.vendor,
    type: model.type,
    model: model.name,
    location: '',
    uSize: model.uSize || 1,
    loginType: 'ssh',
    sshPort: '22', // 默认SSH端口，用户可在添加/编辑设备时修改
    sshUser: 'admin',
    sshPass: '',
    remark: model.remark || ''
  }))

  devices.forEach(d => deviceStore.addDevice(d))

  ElMessage.success(`已从设备库导入 ${devices.length} 个设备型号`)
  libDialogVisible.value = false
  selectedLibModelIds.value.clear()
}

function handleDropdownCommand(command) {
  if (command === 'importLib') {
    libDialogVisible.value = true
    selectedLibModelIds.value.clear()
  } else if (command === 'exportTemplate') {
    exportEmptyTemplate()
  }
}

// 设备扫描
const showScanDialog = ref(false)
const scanResults = ref([])

// 页面加载时设置监听器（不再自动扫描）
// ============ 设备状态检测 ============
// 注：后台 ping 检测已统一由 useDeviceStatus composable 管理，此处仅保留手动刷新入口

// Web fallback ping（当 Electron API 不可用时使用）
// 注意：Web 环境仅通过 HTTP 端口探测判断可达性，无法等价于真实 ICMP ping，结果仅供参考
async function webPing(ip) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2000)
    // 尝试访问设备的常见端口
    await fetch(`http://${ip}:80`, { method: 'HEAD', mode: 'no-cors', signal: controller.signal })
    clearTimeout(timer)
    // Web 环境探测结果不可靠，仅供参考
    return true
  } catch {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 2000)
      await fetch(`http://${ip}:443`, { method: 'HEAD', mode: 'no-cors', signal: controller.signal })
      clearTimeout(timer)
      // Web 环境探测结果不可靠，仅供参考
      return true
    } catch {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 2000)
        await fetch(`http://${ip}:22`, { method: 'HEAD', mode: 'no-cors', signal: controller.signal })
        clearTimeout(timer)
        // Web 环境探测结果不可靠，仅供参考
        return true
      } catch {
        return false
      }
    }
  }
}

// 手动刷新所有设备在线状态（调用全局 composable）
async function refreshDeviceStatus() {
  const result = await doRefreshStatus()
  if (result) {
    // 非 Electron 环境（Web fallback）基于 HTTP 端口探测判断在线，结果仅供参考
    const isWebFallback = !(window.electronAPI && typeof window.electronAPI.ping === 'function')
    ElMessage.success(
      `检测完成，在线: ${result.online}，离线: ${result.offline}` +
      (isWebFallback ? '（Web环境探测结果仅供参考）' : '')
    )
  }
}

onMounted(() => {
  restoreDeviceStatus()
  deviceScanStore.setupListeners()
  applyDeviceFocus()
})

onUnmounted(() => {
  deviceScanStore.removeListeners()
  if (focusTimer) clearTimeout(focusTimer)
})

// 开始扫描
async function handleStartScan(options = {}) {
  try {
    const result = await deviceScanStore.startScan({ 
      deviceTypeFilter: 'network', 
      enableUdpDiscovery: false,
      ...options 
    })
    if (result.success) {
      // 过滤扫描结果，只保留网络设备
      const allDevices = result.devices || []
      scanResults.value = allDevices.filter(d => isNetworkDevice(d))
      const filteredCount = scanResults.value.length
      const excludedCount = allDevices.length - filteredCount
      if (filteredCount > 0) {
        let msg = `扫描完成，发现 ${filteredCount} 个网络设备`
        if (excludedCount > 0) msg += `（已排除 ${excludedCount} 个非网络设备）`
        ElMessage.success(msg)
      } else {
        ElMessage.info('扫描完成，未发现网络设备')
      }
    } else {
      ElMessage.error(result.error || '扫描失败')
    }
  } catch (err) {
    ElMessage.error('扫描失败: ' + err.message)
  }
}

// 将扫描到的设备导入到设备列表（只导入当前对话框中显示的网络设备）
function importScanResults() {
  const devices = scanResults.value.filter(d => isNetworkDevice(d)).map(d => ({
    name: d.name || `${d.vendor || '未知'} ${d.model || '设备'}`,
    ip: d.ip,
    vendor: d.vendor || '未知',
    type: inferDeviceType(d),
    model: d.model || '未知型号',
    status: 'online',
    location: '',
    loginType: 'web',
    port: String(d.port || 80),
    remark: `自动扫描发现 (${d.protocol || 'unknown'})`
  }))
  devices.forEach(d => deviceStore.addDevice(d))
  ElMessage.success(`已导入 ${devices.length} 个网络设备`)
  scanResults.value = []
  showScanDialog.value = false
}

// 查看扫描结果
function viewScanResults() {
  scanResults.value = deviceScanStore.foundDevices.filter(d => isNetworkDevice(d))
  showScanDialog.value = true
}
function exportEmptyTemplate() {
  const templateData = [{
    '设备名称': '',
    'IP地址': '',
    '设备类型': '交换机',
    '厂商': '华为',
    '型号': 'S5735-L24T4X-A',
    '位置': '',
    'U数': 1,
    '登录方式': 'SSH',
    '端口': 22,
    '用户名': 'admin',
    '密码': '',
    '状态': '离线',
    '备注': ''
  }, {
    '设备名称': '',
    'IP地址': '',
    '设备类型': '路由器',
    '厂商': '华为',
    '型号': 'AR1220E-S',
    '位置': '',
    'U数': 1,
    '登录方式': 'SSH',
    '端口': 22,
    '用户名': 'admin',
    '密码': '',
    '状态': '离线',
    '备注': ''
  }, {
    '设备名称': '',
    'IP地址': '',
    '设备类型': '防火墙',
    '厂商': '华为',
    '型号': 'USG6310E-S',
    '位置': '',
    'U数': 1,
    '登录方式': 'SSH',
    '端口': 22,
    '用户名': 'admin',
    '密码': '',
    '状态': '离线',
    '备注': ''
  }]
  
  const ws = XLSX.utils.json_to_sheet(templateData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '设备导入模板')
  
  ws['!cols'] = [
    { wch: 20 }, { wch: 15 }, { wch: 10 }, { wch: 12 },
    { wch: 18 }, { wch: 15 }, { wch: 6 }, { wch: 10 },
    { wch: 8 }, { wch: 12 }, { wch: 15 }, { wch: 8 }, { wch: 20 }
  ]
  
  const fileName = 'netops_device_template.xlsx'
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([wbout], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
  
  ElMessage.success('已导出空表格模板')
}
</script>

<style lang="scss" scoped>
.devices-view {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  /* 与其他页面保持一致：页面内容区本身不是卡片，而是把过滤条/表格等子区域做成独立卡片 */
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;

  @media (max-width: 768px) {
    padding: 0;
    gap: 12px;
  }
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  flex-wrap: wrap;
  padding: 12px 16px;
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);

  @media (max-width: 768px) {
    gap: 8px;
    padding: 10px 12px;

    :deep(.el-input), :deep(.el-select) {
      width: 100% !important;
    }
  }
}

.filter-right {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-muted);

  strong { color: var(--accent); }
}

.table-card-wrapper {
  flex: 1;
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  overflow: hidden;
  min-height: 200px;
  display: flex;
  flex-direction: column;
}

.pagination-wrapper {
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
}

// 设备扫描按钮美化
.device-scan-button {
  background: linear-gradient(135deg, var(--accent-green), #3db87b) !important;
  border-color: transparent !important;
  color: white !important;
  transition: all 0.3s ease !important;
  
  &:hover {
    background: linear-gradient(135deg, #3db87b, var(--accent-green)) !important;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(61, 184, 123, 0.3) !important;
  }
}

/* 更多下拉菜单 - 横排显示 */
:deep(.horizontal-dropdown-menu) {
  display: flex !important;
  flex-direction: row !important;
  gap: 4px;
  padding: 6px 10px !important;

  .el-dropdown-item {
    white-space: nowrap;
    padding: 6px 12px;
    border-radius: 4px;
  }
}

.name-cell { display: flex; align-items: center; gap: 8px; }

.device-name { font-size: 13px; color: var(--text-primary); font-weight: 500; }

.vendor-tag { font-size: 10px !important; }

.ip-text { font-family: 'SF Mono', 'Monaco', monospace; font-size: 12px; color: var(--accent-cyan); }

.type-icon-cell {
  width: 56px; height: 56px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  background: var(--accent-soft);
  transition: var(--transition);
  flex-shrink: 0;
  margin: 0 auto;
  box-sizing: border-box;
  padding: 0;
  overflow: visible !important;
  position: relative;
  z-index: 1;
  .el-icon {
    color: var(--accent);
    font-size: 32px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  &.server { background: rgba(48, 209, 88, 0.15); .el-icon { color: var(--accent-green); } }
  &.firewall { background: rgba(255, 69, 58, 0.15); .el-icon { color: var(--accent-red); } }
  &.router { background: rgba(191, 90, 242, 0.15); .el-icon { color: var(--accent-purple); } }
  &.loadbalancer { background: rgba(100, 210, 255, 0.15); .el-icon { color: var(--accent-cyan); } }
  &.wireless { background: rgba(251, 191, 36, 0.15); .el-icon { color: var(--accent-yellow); } }

  &:hover {
    transform: scale(1.08);
    box-shadow: 0 4px 12px var(--accent-glow);
  }
}

:deep(.el-table .cell) {
  padding: 0 !important;
  line-height: 1 !important;
  white-space: nowrap !important;
  overflow: visible !important;
}

:deep(.el-table td.el-table__cell) {
  padding: 8px 0 !important;
  overflow: visible !important;
  white-space: nowrap !important;
}

:deep(.el-table th.el-table__cell) {
  padding: 12px 0 !important;
  overflow: visible !important;
}

:deep(.el-table__body tr) {
  overflow: visible !important;
}

.action-btns {
  display: flex;
  gap: 4px;
  justify-content: center;
}

.action-btn {
  min-width: 28px !important;
  padding: 4px 8px !important;
}

.delete-btn:hover {
  background-color: var(--accent-red) !important;
  color: white !important;
}

.status-cell { 
  display: inline-flex; 
  align-items: center; 
  gap: 4px; 
  padding: 3px 6px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  white-space: nowrap !important;
  min-width: 50px;
  justify-content: center;
}
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: var(--transition);
  
  &.online { 
    background: var(--accent-green); 
    box-shadow: 0 0 6px rgba(48, 209, 88, 0.5);
  }
  &.offline { 
    background: var(--accent-red); 
    box-shadow: 0 0 6px rgba(255, 69, 58, 0.5);
  }
}
.status-text {
  white-space: nowrap !important;
  flex-shrink: 0;
  display: inline-block;
}
.text-green { 
  color: var(--accent-green); 
  font-size: 12px; 
  font-weight: 500;
}
.text-red { 
  color: var(--accent-red); 
  font-size: 12px; 
  font-weight: 500;
}

// 表单样式 - macOS 风格
.form-section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  padding: 12px 0 8px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 16px;
  margin-top: 8px;
}

.ssh-notice {
  background: var(--accent-soft);
  border: 1px solid var(--border-focus);
  border-radius: var(--radius-sm);
  padding: 12px 16px;
  font-size: 12px;
  color: var(--accent);
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.form-hint {
  margin-left: 8px;
  font-size: 11px;
  color: var(--text-muted);
}

// 设备详情
.device-detail { display: flex; flex-direction: column; gap: 16px; }

.detail-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.detail-icon {
  width: 52px; height: 52px; border-radius: var(--radius-md);
  background: var(--accent-soft);
  display: flex; align-items: center; justify-content: center;
  transition: var(--transition);
  .el-icon { color: var(--accent); }

  &.server { background: rgba(48, 209, 88, 0.15); .el-icon { color: var(--accent-green); } }
  &.firewall { background: rgba(255, 69, 58, 0.15); .el-icon { color: var(--accent-red); } }
  &.router { background: rgba(191, 90, 242, 0.15); .el-icon { color: var(--accent-purple); } }
  
  &:hover {
    transform: scale(1.05);
  }
}

.detail-title {
  flex: 1;
  h2 { font-size: 18px; font-weight: 700; color: var(--text-primary); margin: 0; }
  .detail-model { font-size: 12px; color: var(--text-secondary); margin-top: 3px; display: block; }
}

.detail-status { display: flex; align-items: center; gap: 6px; }

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  transition: var(--transition);
  
  &:hover {
    border-color: var(--border-color);
    background: var(--bg-glass-strong);
  }
}

.detail-label { font-size: 11px; color: var(--text-muted); }
.detail-value {
  font-size: 13px;
  color: var(--text-primary);

  &.mono { font-family: 'SF Mono', Monaco, monospace; color: var(--accent-cyan); }
  &.pass-display { font-family: 'SF Mono', Monaco, monospace; color: var(--accent-orange); }
}

.detail-remark {
  padding: 12px;
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);

  p { font-size: 13px; color: var(--text-secondary); margin-top: 6px; }
}

.detail-meta { font-size: 11px; color: var(--text-muted); }

// SSH 终端
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

  &.system { color: #484f58; }
  &.output { color: #c9d1d9; }
  &.input { color: #e6edf3; display: flex; align-items: center; gap: 4px; }
}

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

.import-area { display: flex; flex-direction: column; gap: 16px; }
.import-hint { font-size: 13px; color: var(--text-secondary); }
.import-preview-table { margin-top: 12px; }
.more-hint { font-size: 12px; color: var(--text-muted); margin-top: 8px; text-align: center; }

// 表格头部样式由全局 main.scss 统一控制，避免局部硬编码色值造成页面不一致

// 设备库导入
.lib-import { display: flex; flex-direction: column; gap: 12px; }

.lib-filter {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.lib-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-muted);
}

.model-name-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.selection-info {
  margin-right: auto;
  font-size: 13px;
  color: var(--text-secondary);
}

/* 移动端适配 */
@media (max-width: 768px) {
  .devices-view {
    gap: 12px;
  }

  .filter-bar {
    gap: 8px;
    padding: 10px 12px;

    :deep(.el-input), :deep(.el-select) {
      width: 100% !important;
    }
  }

  .filter-right {
    margin-left: 0;
    width: 100%;
    text-align: right;
  }

  /* 表格横向滚动 */
  .table-card-wrapper {
    overflow-x: auto;
  }

  :deep(.el-table) {
    min-width: 700px;
  }

  /* 对话框适配 */
  :deep(.el-dialog) {
    width: 95vw !important;
    max-width: 95vw;
    margin: 10px auto !important;
  }

  :deep(.el-dialog__body) {
    padding: 12px;
  }

  /* 表单适配 - 居中对齐 */
  :deep(.el-form) {
    text-align: center;
  }

  :deep(.el-form-item) {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 12px;
  }

  :deep(.el-form-item__label) {
    float: none;
    display: block;
    text-align: center;
    padding: 0 0 4px;
    line-height: 1.4;
    width: 100% !important;
  }

  :deep(.el-form-item__content) {
    margin-left: 0 !important;
    width: 100%;
    justify-content: center;
  }

  :deep(.el-input),
  :deep(.el-select) {
    width: 100%;
  }

  :deep(.el-row) {
    flex-direction: column;
  }

  :deep(.el-col) {
    max-width: 100% !important;
    flex: 0 0 100% !important;
  }

  /* SSH终端适配 */
  .ssh-terminal {
    height: 300px;
  }

  /* 设备详情适配 */
  .device-detail {
    transform: scale(0.92);
    transform-origin: top center;
  }

  .detail-header {
    flex-wrap: wrap;
    gap: 12px;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }

  /* 导入对话框适配 */
  .import-preview-table {
    :deep(.el-table) {
      min-width: auto;
    }
  }

  /* 设备库导入适配 */
  .lib-filter {
    flex-wrap: wrap;
    gap: 8px;

    :deep(.el-input), :deep(.el-select) {
      width: 100% !important;
    }
  }

  .lib-count {
    margin-left: 0;
    width: 100%;
    text-align: right;
  }
}

// ============ 扫描结果对话框样式 ============
.scan-results {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.scan-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px;
  
  p {
    font-size: 13px;
    color: var(--text-secondary);
  }
}

.results-list {
  margin-top: 12px;
}
// ============================================

// ============ 设备前面板可视化样式 ============
.device-panel-dialog {
  :deep(.el-dialog) {
    margin: 0 auto !important;
  }
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
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
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
    color: var(--accent-cyan);
    font-family: 'SF Mono', 'Monaco', monospace;
  }

  &.online {
    color: var(--accent-green);
  }

  &.offline {
    color: var(--accent-red);
  }

  &.pass-display {
    color: var(--accent-orange);
    font-family: 'SF Mono', 'Monaco', monospace;
    letter-spacing: 1px;
  }
}

.detail-info-remark {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 4px;

  .detail-value {
    font-size: 12px;
    font-weight: 400;
    color: var(--text-secondary);
    line-height: 1.5;
  }
}

// 端口编辑模式
.port-edit-mode-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.port-name-input {
  width: 100%;

  :deep(.el-input__wrapper) {
    padding: 0 4px;
    min-height: 18px;
  }

  :deep(.el-input__inner) {
    font-size: 9px !important;
    height: 18px;
    line-height: 18px;
    padding: 0;
    text-align: center;
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
      background: var(--accent-green);
      box-shadow: 0 0 8px var(--accent-green);
      animation: led-blink 2s ease-in-out infinite;
    }
    &.offline {
      background: var(--accent-red);
      box-shadow: 0 0 4px var(--accent-red);
    }
  }

  &.pwr-led {
    &.on {
      background: var(--accent);
      box-shadow: 0 0 6px var(--accent);
    }
  }
}

// 端口区域
.ports-area {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.empty-panel-notice {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px;
  color: var(--text-muted);
  font-size: 13px;
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
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
    color: var(--accent);
    font-family: Arial, sans-serif;
    letter-spacing: 1px;
    padding: 1px 6px;
    border-radius: 3px;
    background: rgba(0, 122, 204,0.10);
    border: 1px solid rgba(0, 122, 204,0.18);
  }

  .section-label-logo-img {
    height: 20px;
    width: auto;
    object-fit: contain;
    border-radius: 3px;
    background: rgba(255,255,255,0.08);
    padding: 2px 4px;
  }

  .section-count {
    font-size: 10px;
    color: var(--text-secondary);
    background: rgba(255,255,255,0.05);
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
  background: rgba(0,0,0,0.2);

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

  &.top-row {
    padding-bottom: 4px;
    border-bottom: 1px dashed rgba(72, 72, 74, 0.5);
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
    background: rgba(0, 122, 204, 0.1);
  }

  &.connected .rj45-body {
    border-color: var(--accent-green);
    box-shadow: 0 0 8px rgba(48, 209, 88, 0.3);
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
    background: var(--accent-green);
    box-shadow: 0 0 4px var(--accent-green);
  }

  &.blinking {
    background: var(--accent-green);
    box-shadow: 0 0 6px var(--accent-green);
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
  padding: 12px;
  border: 1px solid rgba(72, 72, 74, 0.6);
  border-radius: 6px;
  background: rgba(28, 28, 30, 0.4);
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
    background: rgba(0, 122, 204, 0.1);
  }

  &.connected .sfp-body {
    border-color: var(--accent-green);
    box-shadow: 0 0 8px rgba(48, 209, 88, 0.3);
    background: linear-gradient(180deg, #3a5a3a 0%, #2a4a2a 100%);
  }
}

.sfp-body {
  width: 40px;
  height: 40px;
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
    background: var(--accent-green);
    box-shadow: 0 0 4px var(--accent-green);
  }

  &.blinking {
    background: var(--accent-green);
    box-shadow: 0 0 6px var(--accent-green);
    animation: led-blink 1s ease-in-out infinite;
  }
}

.sfp-label {
  font-size: 9px;
  color: var(--text-muted);
  font-family: monospace;
}

// SFP光口内联到下排右侧
.sfp-inline-group {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-left: 12px;
  padding-left: 12px;
  border-left: 1px dashed rgba(72, 72, 74, 0.5);

  .sfp-divider {
    display: none;
  }
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
    background: rgba(0, 122, 204, 0.1);
  }

  &.connected .xfp-body {
    border-color: var(--accent-green);
    box-shadow: 0 0 8px rgba(48, 209, 88, 0.3);
    background: linear-gradient(180deg, #3a5a3a 0%, #2a4a2a 100%);
  }
}

.xfp-body {
  width: 40px;
  height: 40px;
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
    background: var(--accent-green);
    box-shadow: 0 0 4px var(--accent-green);
  }

  &.blinking {
    background: var(--accent-green);
    box-shadow: 0 0 6px var(--accent-green);
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

    &.total { background: var(--text-muted); }
    &.connected { background: var(--accent-green); }
    &.free { background: var(--accent); }
    &.active { background: var(--accent-orange); }
  }

  .stat-label {
    font-size: 10px;
    color: var(--text-muted);
  }

  .stat-value {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);

    &.connected { color: var(--accent-green); }
    &.free { color: var(--accent); }
    &.active { color: var(--accent-orange); }
  }
}

// LED闪烁动画
@keyframes led-blink {
  0%, 100% { opacity:1; }
  50% { opacity:0.3; }
}

// 对话框居中
.device-panel-dialog {
  :deep(.el-dialog) {
    margin: 0 auto !important;
  }
}

/* 移动端适配 */
@media (max-width: 768px) {
  .device-panel-dialog {
    :deep(.el-dialog) {
      width: 95vw !important;
      max-width: 95vw;
      margin: 10px auto !important;
    }
  }

  .device-panel-content {
    padding: 12px;
  }

  .detail-info-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .device-front-panel {
    padding: 10px;
  }

  .rj45-ports-real {
    gap: 4px;
    .port-row { gap: 4px; }
  }

  .rj45-port {
    padding: 2px;
    gap: 2px;
  }

  .rj45-body {
    width: 28px;
    height: 28px;
    padding-top: 3px;
  }

  .rj45-top {
    width: 18px;
    height: 2px;
    margin-bottom: 1px;
  }

  .rj45-pins .pin {
    width: 1.5px;
    height: 5px;
  }

  .rj45-label {
    font-size: 7px;
  }

  .sfp-body {
    width: 48px;
    height: 20px;
  }

  .sfp-notch {
    width: 16px;
    height: 8px;
  }

  .port-stats-bar {
    gap: 12px;
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
  &.vendor-h3c { background: #e60012; }
  &.vendor-huawei { background: #cf0a2c; }
  &.vendor-cisco { background: #049fd9; }
  &.vendor-ruijie { background: #003da5; font-style: italic; }
  &.vendor-aruba { background: #f9a800; color: #000; }
}

.vendor-logo-img {
  height: 36px;
  width: auto;
  object-fit: contain;
  border-radius: 3px;
  background: rgba(255,255,255,0.08);
  padding: 2px 6px;
}
// ============================================
// 服务器后面板样式 - 深色主题
// ============================================
.device-panel-dialog :deep(.device-back-panel) {
  padding: 12px 16px 16px;
  background: #1a1a1a !important;
  border-radius: 8px;
  color: #ebebf5 !important;

  .back-panel-notice {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #aeaeb2;
    background: rgba(0, 122, 204,0.12);
    border: 1px solid rgba(0, 122, 204,0.2);
    border-radius: 6px;
    padding: 6px 12px;
    margin-bottom: 14px;

    .el-icon { color: #007acc; font-size: 14px; }
  }

  .port-section {
    margin-bottom: 16px;

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid #3a3a3c;

      .section-label {
        font-size: 13px;
        font-weight: 600;
        color: #ebebf5;
      }
      .section-count {
        font-size: 12px;
        color: #aeaeb2;
        background: #2c2c2e;
        padding: 2px 8px;
        border-radius: 4px;
      }
    }
  }

  .back-ports-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 10px;
  }

  .back-port-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid #3a3a3c;
    background: #2c2c2e;
    cursor: pointer;
    transition: all 0.2s;

    &:hover { border-color: #007acc; background: #1c3a5c; }
    &.connected {
      border-color: #007acc;
      background: rgba(48,209,88,0.12);
    }

    .back-port-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 4px;
      background: #3a3a3c;
      color: #aeaeb2;
      flex-shrink: 0;

      &.psu-icon { background: rgba(210,153,34,0.15); color: #d29922; }
    }

    .back-port-name {
      font-size: 12px;
      color: #ebebf5;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }

    .port-name-input {
      flex: 1;
      min-width: 0;
      .el-input__inner { 
        font-size: 12px; 
        background: #3a3a3c;
        border-color: #48484a;
        color: #ebebf5;
      }
    }

    .back-port-led {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-left: auto;
      flex-shrink: 0;

      &.on, &.blinking { background: #007acc; box-shadow: 0 0 4px rgba(48,209,88,0.5); }
      &.off { background: #48484a; }
    }

    // 网口图标（mini RJ45）
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

      /* SFP 图标样式（后面板光口） */
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
  }
}

/* 端口连接状态列 */
.port-conn-status-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}
.port-conn-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.port-conn-dot.dot-green {
  background: #3fb950;
  box-shadow: 0 0 4px #3fb950;
}
.port-conn-dot.dot-red {
  background: #f85149;
  box-shadow: 0 0 4px #f85149;
}
.port-conn-info-cell {
  max-height: 60px;
  overflow-y: auto;
}
.port-conn-line {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 0;
  white-space: nowrap;
}
.port-conn-local {
  color: #58a6ff;
  font-weight: 500;
}
.port-conn-arrow {
  color: var(--text-tertiary);
}
.port-conn-remote {
  color: var(--text-secondary);
}
.port-conn-cable {
  color: var(--text-tertiary);
  font-size: 11px;
}

/* 移动端卡片视图样式 */
.device-cards-mobile {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.device-card-item {
  width: 100%;
}

/* 来自拓扑画布的 ?focus=<id> 定位高亮 */
.device-card--focused {
  outline: 2px solid #38bdf8;
  outline-offset: 2px;
  animation: device-focus-pulse 1.2s ease-in-out 2;
}
@keyframes device-focus-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(56, 189, 248, 0); }
  50% { box-shadow: 0 0 0 6px rgba(56, 189, 248, 0.35); }
}
:deep(.el-table .device-card--focused td) {
  background-color: rgba(56, 189, 248, 0.12) !important;
}

/* 移动端分页样式优化 */
.device-cards-mobile .pagination-wrapper {
  display: flex;
  justify-content: center;
  padding: 16px 0;
}

/* 超小屏幕优化 */
@media (max-width: 575.98px) {
  .device-cards-mobile {
    padding: 12px;
    gap: 8px;
  }
}
</style>

