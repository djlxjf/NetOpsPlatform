<template>
  <PageLayout title="通知推送系统" subtitle="配置邮件、Webhook和告警升级机制">
    <template #actions>
      <el-button :icon="Refresh" @click="handleRefresh">刷新</el-button>
    </template>

    <div class="notification-container">
      <!-- 统计卡片 -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon email"><el-icon><Message /></el-icon></div>
          <div class="stat-content">
            <div class="stat-value">{{ notiStore.notificationStats.emailEnabled ? '已启用' : '未启用' }}</div>
            <div class="stat-label">邮件通知</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon wechat"><el-icon><ChatDotRound /></el-icon></div>
          <div class="stat-content">
            <div class="stat-value">{{ notiStore.notificationStats.wechatEnabled ? '已启用' : '未启用' }}</div>
            <div class="stat-label">企业微信</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon dingtalk"><el-icon><ChatLineRound /></el-icon></div>
          <div class="stat-content">
            <div class="stat-value">{{ notiStore.notificationStats.dingtalkEnabled ? '已启用' : '未启用' }}</div>
            <div class="stat-label">钉钉通知</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon escalation"><el-icon><Connection /></el-icon></div>
          <div class="stat-content">
            <div class="stat-value">{{ notiStore.notificationStats.escalationRulesCount }} 条</div>
            <div class="stat-label">升级规则</div>
          </div>
        </div>
      </div>

      <!-- 标签页 -->
      <el-tabs v-model="activeTab" class="notification-tabs">
        <!-- 邮件配置 -->
        <el-tab-pane label="邮件通知" name="email">
          <div class="config-section">
            <div class="section-header">
              <h3>邮件服务器配置</h3>
              <el-switch
                v-model="emailForm.enabled"
                @change="handleEmailEnabledChange"
              />
            </div>

            <el-form
              ref="emailFormRef"
              :model="emailForm"
              :rules="emailRules"
              label-width="120px"
              :disabled="!emailForm.enabled"
            >
              <el-row :gutter="20">
                <el-col :span="12">
                  <el-form-item label="SMTP服务器" prop="smtpServer">
                    <el-input v-model="emailForm.smtpServer" placeholder="smtp.example.com" />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="SMTP端口" prop="smtpPort">
                    <el-input-number v-model="emailForm.smtpPort" :min="1" :max="65535" />
                  </el-form-item>
                </el-col>
              </el-row>

              <el-row :gutter="20">
                <el-col :span="12">
                  <el-form-item label="用户名" prop="username">
                    <el-input v-model="emailForm.username" placeholder="admin@example.com" />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="密码">
                    <el-input v-model="emailForm.password" type="password" show-password placeholder="邮箱密码或授权码" />
                  </el-form-item>
                </el-col>
              </el-row>

              <el-row :gutter="20">
                <el-col :span="12">
                  <el-form-item label="发件人地址" prop="fromAddress">
                    <el-input v-model="emailForm.fromAddress" placeholder="noreply@example.com" />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="使用SSL">
                    <el-switch v-model="emailForm.useSSL" />
                  </el-form-item>
                </el-col>
              </el-row>

              <el-form-item label="收件人" prop="recipients">
                <el-select
                  v-model="emailForm.recipients"
                  multiple
                  filterable
                  allow-create
                  placeholder="输入邮箱地址后按回车添加"
                  style="width: 100%"
                >
                  <el-option
                    v-for="email in emailForm.recipients"
                    :key="email"
                    :label="email"
                    :value="email"
                  />
                </el-select>
              </el-form-item>

              <el-form-item>
                <el-button type="primary" @click="handleSaveEmail" :disabled="!emailForm.enabled">
                  保存配置
                </el-button>
                <el-button
                  :loading="emailTesting"
                  @click="handleTestEmail"
                  :disabled="!emailForm.enabled"
                >
                  发送测试邮件
                </el-button>
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>

        <!-- Webhook配置 -->
        <el-tab-pane label="Webhook通知" name="webhook">
          <div class="config-section">
            <!-- 企业微信 -->
            <div class="webhook-section">
              <div class="section-header">
                <h3>企业微信机器人</h3>
                <el-switch
                  v-model="wechatForm.enabled"
                  @change="handleWechatEnabledChange"
                />
              </div>

              <el-form
                ref="wechatFormRef"
                :model="wechatForm"
                :rules="webhookRules"
                label-width="120px"
                :disabled="!wechatForm.enabled"
              >
                <el-form-item label="Webhook地址" prop="webhookUrl">
                  <el-input
                    v-model="wechatForm.webhookUrl"
                    placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx"
                  />
                </el-form-item>

                <el-form-item label="关键词">
                  <el-select
                    v-model="wechatForm.keywords"
                    multiple
                    filterable
                    allow-create
                    placeholder="输入关键词后按回车添加"
                    style="width: 100%"
                  >
                    <el-option
                      v-for="kw in wechatForm.keywords"
                      :key="kw"
                      :label="kw"
                      :value="kw"
                    />
                  </el-select>
                </el-form-item>

                <el-form-item>
                  <el-button type="primary" @click="handleSaveWechat" :disabled="!wechatForm.enabled">
                    保存配置
                  </el-button>
                  <el-button
                    :loading="wechatTesting"
                    @click="handleTestWechat"
                    :disabled="!wechatForm.enabled"
                  >
                    发送测试消息
                  </el-button>
                </el-form-item>
              </el-form>
            </div>

            <!-- 钉钉 -->
            <el-divider />
            <div class="webhook-section">
              <div class="section-header">
                <h3>钉钉机器人</h3>
                <el-switch
                  v-model="dingtalkForm.enabled"
                  @change="handleDingtalkEnabledChange"
                />
              </div>

              <el-form
                ref="dingtalkFormRef"
                :model="dingtalkForm"
                :rules="webhookRules"
                label-width="120px"
                :disabled="!dingtalkForm.enabled"
              >
                <el-form-item label="Webhook地址" prop="webhookUrl">
                  <el-input
                    v-model="dingtalkForm.webhookUrl"
                    placeholder="https://oapi.dingtalk.com/robot/send?access_token=xxx"
                  />
                </el-form-item>

                <el-form-item label="关键词">
                  <el-select
                    v-model="dingtalkForm.keywords"
                    multiple
                    filterable
                    allow-create
                    placeholder="输入关键词后按回车添加"
                    style="width: 100%"
                  >
                    <el-option
                      v-for="kw in dingtalkForm.keywords"
                      :key="kw"
                      :label="kw"
                      :value="kw"
                    />
                  </el-select>
                </el-form-item>

                <el-form-item>
                  <el-button type="primary" @click="handleSaveDingtalk" :disabled="!dingtalkForm.enabled">
                    保存配置
                  </el-button>
                  <el-button
                    :loading="dingtalkTesting"
                    @click="handleTestDingtalk"
                    :disabled="!dingtalkForm.enabled"
                  >
                    发送测试消息
                  </el-button>
                </el-form-item>
              </el-form>
            </div>
          </div>
        </el-tab-pane>

        <!-- 告警升级 -->
        <el-tab-pane label="告警升级机制" name="escalation">
          <div class="config-section">
            <div class="section-header">
              <h3>升级规则配置</h3>
              <el-switch
                v-model="escalationForm.enabled"
                @change="handleEscalationEnabledChange"
              />
            </div>

            <div class="escalation-rules">
              <el-card
                v-for="rule in escalationForm.rules"
                :key="rule.id"
                class="rule-card"
                shadow="hover"
              >
                <template #header>
                  <div class="rule-header">
                    <el-tag :type="getLevelType(rule.level)" size="small">
                      {{ getLevelName(rule.level) }}
                    </el-tag>
                    <div class="rule-actions">
                      <el-button link type="primary" size="small" @click="openRuleDialog(rule)">
                        <el-icon><Edit /></el-icon>
                        编辑
                      </el-button>
                      <el-button link type="danger" @click="handleDeleteRule(rule.id)">
                        <el-icon><Delete /></el-icon>
                      </el-button>
                    </div>
                  </div>
                </template>
                <div class="rule-content">
                  <div class="rule-item">
                    <span class="rule-label">延迟时间：</span>
                    <span class="rule-value">{{ rule.delay }} {{ rule.delayUnit }}</span>
                  </div>
                  <div class="rule-item">
                    <span class="rule-label">通知渠道：</span>
                    <span class="rule-value">
                      <el-tag
                        v-for="ch in rule.channels"
                        :key="ch"
                        size="small"
                        class="channel-tag"
                      >
                        {{ getChannelName(ch) }}
                      </el-tag>
                    </span>
                  </div>
                  <div class="rule-item">
                    <span class="rule-label">重复间隔：</span>
                    <span class="rule-value">{{ rule.repeatInterval }} {{ rule.repeatUnit }}</span>
                  </div>
                  <div class="rule-item">
                    <span class="rule-label">最大重试：</span>
                    <span class="rule-value">{{ rule.maxRetries }} 次</span>
                  </div>
                </div>
              </el-card>

              <el-card class="add-rule-card" @click="handleAddRule">
                <el-icon class="add-icon"><Plus /></el-icon>
                <div>添加规则</div>
              </el-card>
            </div>
          </div>
        </el-tab-pane>

        <!-- 通知日志 -->
        <el-tab-pane label="通知日志" name="logs">
          <div class="config-section">
            <div class="section-header">
              <h3>通知发送记录</h3>
              <el-button @click="handleClearLogs" size="small">清空日志</el-button>
            </div>

            <el-table :data="pagedLogs" stripe style="width: 100%">
              <el-table-column prop="timestamp" label="时间" width="180">
                <template #default="{ row }">
                  {{ formatTime(row.timestamp) }}
                </template>
              </el-table-column>
              <el-table-column prop="type" label="类型" width="100">
                <template #default="{ row }">
                  <el-tag :type="getLogType(row.type)" size="small">
                    {{ getLogTypeName(row.type) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="channel" label="渠道" width="120">
                <template #default="{ row }">
                  {{ getChannelName(row.channel) }}
                </template>
              </el-table-column>
              <el-table-column prop="message" label="消息" />
            </el-table>

            <div class="pagination-wrap">
              <el-pagination
                v-model:current-page="logPage"
                v-model:page-size="logPageSize"
                :page-sizes="[20, 50, 100]"
                :total="notiStore.notificationLogs.length"
                layout="total, sizes, prev, pager, next, jumper"
                background
              />
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 添加规则对话框 -->
    <el-dialog
      v-model="ruleDialogVisible"
      :title="editingRuleId ? '编辑升级规则' : '添加升级规则'"
      width="500px"
    >
      <el-form :model="newRule" label-width="100px">
        <el-form-item label="告警级别">
          <el-select v-model="newRule.level" placeholder="请选择告警级别">
            <el-option label="紧急 (Critical)" value="critical" />
            <el-option label="重要 (Major)" value="major" />
            <el-option label="一般 (Minor)" value="minor" />
            <el-option label="警告 (Warning)" value="warning" />
          </el-select>
        </el-form-item>

        <el-form-item label="延迟时间">
          <el-input-number v-model="newRule.delay" :min="1" />
          <el-select v-model="newRule.delayUnit" style="width: 100px; margin-left: 10px">
            <el-option label="分钟" value="minutes" />
            <el-option label="小时" value="hours" />
          </el-select>
        </el-form-item>

        <el-form-item label="通知渠道">
          <el-checkbox-group v-model="newRule.channels">
            <el-checkbox label="sms">短信</el-checkbox>
            <el-checkbox label="email">邮件</el-checkbox>
            <el-checkbox label="wechat">企业微信</el-checkbox>
            <el-checkbox label="dingtalk">钉钉</el-checkbox>
          </el-checkbox-group>
        </el-form-item>

        <el-form-item label="重复间隔">
          <el-input-number v-model="newRule.repeatInterval" :min="1" />
          <el-select v-model="newRule.repeatUnit" style="width: 100px; margin-left: 10px">
            <el-option label="分钟" value="minutes" />
            <el-option label="小时" value="hours" />
          </el-select>
        </el-form-item>

        <el-form-item label="最大重试">
          <el-input-number v-model="newRule.maxRetries" :min="1" :max="10" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="ruleDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSaveRule">保存</el-button>
      </template>
    </el-dialog>
  </PageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Refresh,
  Message,
  ChatDotRound,
  ChatLineRound,
  Connection,
  Delete,
  Plus,
  Edit
} from '@element-plus/icons-vue'
import PageLayout from '../../components/PageLayout.vue'
import { useNotificationStore } from '../../stores/notification'
import dayjs from 'dayjs'

const notiStore = useNotificationStore()

const activeTab = ref('email')
const ruleDialogVisible = ref(false)
const editingRuleId = ref(null)

// 表单 ref 与校验规则
const emailFormRef = ref(null)
const wechatFormRef = ref(null)
const dingtalkFormRef = ref(null)

const emailTesting = ref(false)
const wechatTesting = ref(false)
const dingtalkTesting = ref(false)

// 通知日志分页
const logPage = ref(1)
const logPageSize = ref(20)

function validateSmtpPort(rule, value, callback) {
  if (value === null || value === undefined || value === '') {
    callback(new Error('请输入SMTP端口'))
  } else if (!Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 65535) {
    callback(new Error('端口范围 1-65535'))
  } else {
    callback()
  }
}

const emailRules = {
  smtpServer: [{ required: true, message: '请输入SMTP服务器地址', trigger: 'blur' }],
  smtpPort: [{ required: true, validator: validateSmtpPort, trigger: ['blur', 'change'] }],
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  fromAddress: [
    { required: true, message: '请输入发件人地址', trigger: 'blur' },
    { type: 'email', message: '请输入合法的邮箱地址', trigger: ['blur', 'change'] }
  ],
  recipients: [
    { type: 'array', required: true, min: 1, message: '至少添加一个收件人', trigger: 'change' }
  ]
}

const webhookRules = {
  webhookUrl: [{ required: true, message: '请输入Webhook地址', trigger: 'blur' }]
}

const emailForm = reactive({
  enabled: false,
  smtpServer: '',
  smtpPort: 587,
  username: '',
  password: '',
  useSSL: true,
  fromAddress: '',
  recipients: []
})

const wechatForm = reactive({
  enabled: false,
  webhookUrl: '',
  keywords: []
})

const dingtalkForm = reactive({
  enabled: false,
  webhookUrl: '',
  keywords: []
})

const escalationForm = reactive({
  enabled: false,
  rules: []
})

const newRule = reactive({
  level: 'major',
  delay: 15,
  delayUnit: 'minutes',
  channels: ['email'],
  repeatInterval: 30,
  repeatUnit: 'minutes',
  maxRetries: 2
})

const pagedLogs = computed(() => {
  const logs = notiStore.notificationLogs || []
  const start = (logPage.value - 1) * logPageSize.value
  return logs.slice(start, start + logPageSize.value)
})

onMounted(() => {
  loadConfig()
})

function loadConfig() {
  const config = notiStore.notificationConfig || {}
  // 防御性合并：旧版/残缺配置可能缺失子结构，避免 Object.assign(undefined) 导致白屏
  const email = { ...(config.email || {}) }
  const wechat = { ...((config.webhook && config.webhook.wechat) || {}) }
  const dingtalk = { ...((config.webhook && config.webhook.dingtalk) || {}) }
  const escalation = { ...(config.escalation || {}) }

  Object.assign(emailForm, email)
  Object.assign(wechatForm, wechat)
  Object.assign(dingtalkForm, dingtalk)
  Object.assign(escalationForm, escalation)
}

function handleRefresh() {
  loadConfig()
  ElMessage.success('配置已刷新')
}

function handleEmailEnabledChange(enabled) {
  // 开启与关闭都需持久化，避免关闭后刷新又恢复为启用
  notiStore.updateEmailConfig({ enabled })
}

async function handleSaveEmail() {
  try {
    await emailFormRef.value.validate()
  } catch {
    return
  }
  await notiStore.updateEmailConfig({ ...emailForm })
  ElMessage.success('邮件配置已保存')
}

async function handleTestEmail() {
  emailTesting.value = true
  try {
    const result = await notiStore.testEmail()
    ElMessage.success(result.message)
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    emailTesting.value = false
  }
}

function handleWechatEnabledChange(enabled) {
  notiStore.updateWebhookConfig('wechat', { enabled })
}

async function handleSaveWechat() {
  try {
    await wechatFormRef.value.validate()
  } catch {
    return
  }
  await notiStore.updateWebhookConfig('wechat', { ...wechatForm })
  ElMessage.success('企业微信配置已保存')
}

async function handleTestWechat() {
  wechatTesting.value = true
  try {
    const result = await notiStore.testWebhook('wechat')
    ElMessage.success(result.message)
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    wechatTesting.value = false
  }
}

function handleDingtalkEnabledChange(enabled) {
  notiStore.updateWebhookConfig('dingtalk', { enabled })
}

async function handleSaveDingtalk() {
  try {
    await dingtalkFormRef.value.validate()
  } catch {
    return
  }
  await notiStore.updateWebhookConfig('dingtalk', { ...dingtalkForm })
  ElMessage.success('钉钉配置已保存')
}

async function handleTestDingtalk() {
  dingtalkTesting.value = true
  try {
    const result = await notiStore.testWebhook('dingtalk')
    ElMessage.success(result.message)
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    dingtalkTesting.value = false
  }
}

function handleEscalationEnabledChange(enabled) {
  // 直接改 store 后必须持久化，否则刷新后丢失
  notiStore.setEscalationEnabled(enabled)
}

function openRuleDialog(rule) {
  ruleDialogVisible.value = true
  if (rule) {
    // 编辑：填充已有规则数据
    editingRuleId.value = rule.id
    Object.assign(newRule, {
      level: rule.level,
      delay: rule.delay,
      delayUnit: rule.delayUnit,
      channels: [...(rule.channels || [])],
      repeatInterval: rule.repeatInterval,
      repeatUnit: rule.repeatUnit,
      maxRetries: rule.maxRetries
    })
  } else {
    // 新增：重置为默认值
    editingRuleId.value = null
    Object.assign(newRule, {
      level: 'major',
      delay: 15,
      delayUnit: 'minutes',
      channels: ['email'],
      repeatInterval: 30,
      repeatUnit: 'minutes',
      maxRetries: 2
    })
  }
}

function handleAddRule() {
  openRuleDialog()
}

async function handleSaveRule() {
  if (editingRuleId.value) {
    await notiStore.updateEscalationRule(editingRuleId.value, { ...newRule })
    ElMessage.success('规则已更新')
  } else {
    await notiStore.addEscalationRule({ ...newRule })
    ElMessage.success('规则已添加')
  }
  Object.assign(escalationForm, notiStore.notificationConfig.escalation)
  ruleDialogVisible.value = false
}

function handleDeleteRule(ruleId) {
  notiStore.deleteEscalationRule(ruleId)
  Object.assign(escalationForm, notiStore.notificationConfig.escalation)
  ElMessage.success('规则已删除')
}

async function handleClearLogs() {
  await notiStore.clearLogs()
  logPage.value = 1
  ElMessage.success('日志已清空')
}

function getLevelType(level) {
  const types = {
    critical: 'danger',
    major: 'warning',
    minor: 'info',
    warning: ''
  }
  return types[level] || 'info'
}

function getLevelName(level) {
  const names = {
    critical: '紧急',
    major: '重要',
    minor: '一般',
    warning: '警告'
  }
  return names[level] || level
}

function getChannelName(channel) {
  const names = {
    sms: '短信',
    email: '邮件',
    wechat: '企业微信',
    dingtalk: '钉钉'
  }
  return names[channel] || channel
}

function getLogType(type) {
  const types = {
    success: 'success',
    error: 'danger',
    info: 'info',
    warning: 'warning'
  }
  return types[type] || 'info'
}

function getLogTypeName(type) {
  const names = {
    success: '成功',
    error: '失败',
    info: '信息',
    warning: '警告'
  }
  return names[type] || type
}

function formatTime(timestamp) {
  return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss')
}
</script>

<style lang="scss" scoped>
.notification-container {
  padding: 0;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
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

  &.email {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  &.wechat {
    background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
    color: white;
  }

  &.dingtalk {
    background: linear-gradient(135deg, #4776e6 0%, #8e54e9 100%);
    color: white;
  }

  &.escalation {
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    color: white;
  }
}

.stat-content {
  flex: 1;
}

.stat-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.stat-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.notification-tabs {
  :deep(.el-tabs__header) {
    background: var(--bg-glass);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: 8px 16px;
    margin: 0;
    box-shadow: var(--shadow-md);
  }
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

.config-section {
  padding: 20px;
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;

  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
  }
}

.webhook-section {
  padding: 16px 0;
}

.escalation-rules {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.rule-card {
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  transition: var(--transition);
  box-shadow: var(--shadow-md);

  &:hover {
    border-color: rgba(0, 122, 204, 0.3);
  }

  :deep(.el-card__header) {
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
}

.rule-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.rule-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.rule-content {
  padding: 8px 0;
}

.rule-item {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;

  &:last-child {
    margin-bottom: 0;
  }
}

.rule-label {
  color: var(--text-secondary);
  min-width: 80px;
}

.rule-value {
  color: var(--text-primary);
}

.channel-tag {
  margin-right: 4px;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
}

.add-rule-card {
  border: 2px dashed var(--border-color);
  background: var(--bg-glass);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 150px;
  cursor: pointer;
  transition: var(--transition);

  &:hover {
    border-color: var(--accent);
    background: rgba(0, 122, 204, 0.08);
  }

  .add-icon {
    font-size: 32px;
    margin-bottom: 8px;
    color: var(--accent);
  }

  div {
    font-size: 14px;
    color: var(--text-secondary);
  }
}
</style>
