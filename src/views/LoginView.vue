<template>
  <div class="login-view">
    <div class="login-container">
      <div class="login-card">
        <div class="login-header">
          <div class="login-logo">
            <img src="/logo_128.png" alt="NetOps Platform" />
          </div>
          <h1 class="login-title">NetOps Platform</h1>
          <p class="login-subtitle">网络运维管理平台</p>
        </div>

        <!-- ============ 账号认证层（未登录账号时显示） ============ -->
        <div v-if="!authStore.isAccountLoggedIn" class="auth-section">
          <!-- 登录 -->
          <template v-if="authMode === 'login'">
            <div class="auth-title">账号登录</div>
            <el-form
              ref="loginFormRef"
              :model="authForm"
              :rules="loginRules"
              label-position="top"
              class="auth-form"
              @submit.prevent
            >
              <el-form-item label="用户名" prop="username">
                <el-input
                  v-model="authForm.username"
                  placeholder="请输入用户名"
                  size="large"
                  clearable
                  @keyup.enter="handleLogin"
                >
                  <template #prefix><el-icon><User /></el-icon></template>
                </el-input>
              </el-form-item>
              <el-form-item label="密码" prop="password">
                <el-input
                  v-model="authForm.password"
                  type="password"
                  placeholder="请输入密码"
                  size="large"
                  show-password
                  @keyup.enter="handleLogin"
                >
                  <template #prefix><el-icon><Lock /></el-icon></template>
                </el-input>
              </el-form-item>
              <el-button
                type="primary"
                size="large"
                class="auth-submit-btn"
                :loading="authLoading"
                @click="handleLogin"
              >登 录</el-button>
              <div class="auth-links">
                <el-link type="primary" :underline="false" @click="switchAuthMode('register')">注册新账号</el-link>
                <el-link type="info" :underline="false" @click="switchAuthMode('forgot')">忘记密码？</el-link>
              </div>
            </el-form>
          </template>

          <!-- 注册 -->
          <template v-else-if="authMode === 'register'">
            <div class="auth-title">注册账号</div>
            <el-form
              ref="regFormRef"
              :model="regForm"
              :rules="regRules"
              label-position="top"
              class="auth-form"
              @submit.prevent
            >
              <el-form-item label="用户名" prop="username">
                <el-input
                  v-model="regForm.username"
                  placeholder="请输入用户名"
                  size="large"
                  clearable
                >
                  <template #prefix><el-icon><User /></el-icon></template>
                </el-input>
              </el-form-item>
              <el-form-item label="密码" prop="password">
                <el-input
                  v-model="regForm.password"
                  type="password"
                  placeholder="请输入密码"
                  size="large"
                  show-password
                >
                  <template #prefix><el-icon><Lock /></el-icon></template>
                </el-input>
              </el-form-item>
              <el-form-item label="确认密码" prop="confirmPassword">
                <el-input
                  v-model="regForm.confirmPassword"
                  type="password"
                  placeholder="请再次输入密码"
                  size="large"
                  show-password
                >
                  <template #prefix><el-icon><Lock /></el-icon></template>
                </el-input>
              </el-form-item>
              <el-form-item label="安全问题" prop="question">
                <el-select
                  v-model="regForm.question"
                  placeholder="请选择安全问题"
                  size="large"
                  class="auth-select"
                >
                  <el-option
                    v-for="q in securityQuestions"
                    :key="q"
                    :label="q"
                    :value="q"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="安全问题答案" prop="answer">
                <el-input
                  v-model="regForm.answer"
                  placeholder="请输入答案"
                  size="large"
                  clearable
                >
                  <template #prefix><el-icon><QuestionFilled /></el-icon></template>
                </el-input>
              </el-form-item>
              <el-button
                type="primary"
                size="large"
                class="auth-submit-btn"
                :loading="authLoading"
                @click="handleRegister"
              >注 册</el-button>
              <div class="auth-links">
                <el-link type="info" :underline="false" @click="switchAuthMode('login')">
                  <el-icon class="auth-back-icon"><ArrowLeft /></el-icon>
                  返回登录
                </el-link>
              </div>
            </el-form>
          </template>

          <!-- 忘记密码 -->
          <template v-else>
            <div class="auth-title">重置密码</div>

            <!-- 第 1 步：输入用户名 -->
            <el-form
              v-if="forgotStep === 1"
              ref="forgotFormRef"
              :model="forgotForm"
              :rules="forgotStep1Rules"
              label-position="top"
              class="auth-form"
              @submit.prevent
            >
              <el-form-item label="用户名" prop="username">
                <el-input
                  v-model="forgotForm.username"
                  placeholder="请输入用户名"
                  size="large"
                  clearable
                  @keyup.enter="handleForgotQuery"
                >
                  <template #prefix><el-icon><User /></el-icon></template>
                </el-input>
              </el-form-item>
              <el-button
                type="primary"
                size="large"
                class="auth-submit-btn"
                :loading="authLoading"
                @click="handleForgotQuery"
              >下一步</el-button>
            </el-form>

            <!-- 第 2 步：验证身份 + 设置新密码 -->
            <el-form
              v-else
              ref="forgotFormRef"
              :model="forgotForm"
              :rules="forgotStep2Rules"
              label-position="top"
              class="auth-form"
              @submit.prevent
            >
              <div class="auth-question">
                <el-icon><QuestionFilled /></el-icon>
                <span>{{ forgotForm.question }}</span>
              </div>
              <div v-if="forgotLocked" class="auth-note">
                账号已锁定，请通过恢复码重置密码。
              </div>
              <el-form-item label="验证方式" prop="way">
                <el-radio-group v-model="forgotForm.way" class="auth-radio">
                  <el-radio value="recovery">使用恢复码（推荐）</el-radio>
                  <el-radio value="question">使用安全问题</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item
                v-if="forgotForm.way === 'recovery'"
                label="恢复码"
                prop="recoveryCode"
              >
                <el-input
                  v-model="forgotForm.recoveryCode"
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  size="large"
                  clearable
                >
                  <template #prefix><el-icon><Key /></el-icon></template>
                </el-input>
              </el-form-item>
              <el-form-item
                v-else
                label="安全问题答案"
                prop="answer"
              >
                <el-input
                  v-model="forgotForm.answer"
                  placeholder="请输入答案"
                  size="large"
                  clearable
                >
                  <template #prefix><el-icon><QuestionFilled /></el-icon></template>
                </el-input>
              </el-form-item>
              <el-form-item label="新密码" prop="newPassword">
                <el-input
                  v-model="forgotForm.newPassword"
                  type="password"
                  placeholder="请输入新密码"
                  size="large"
                  show-password
                >
                  <template #prefix><el-icon><Lock /></el-icon></template>
                </el-input>
              </el-form-item>
              <el-form-item label="确认新密码" prop="confirmPassword">
                <el-input
                  v-model="forgotForm.confirmPassword"
                  type="password"
                  placeholder="请再次输入新密码"
                  size="large"
                  show-password
                >
                  <template #prefix><el-icon><Lock /></el-icon></template>
                </el-input>
              </el-form-item>
              <el-button
                type="primary"
                size="large"
                class="auth-submit-btn"
                :loading="authLoading"
                @click="handleForgotReset"
              >重置密码</el-button>
              <div class="auth-links">
                <el-link type="info" :underline="false" @click="switchAuthMode('login')">
                  <el-icon class="auth-back-icon"><ArrowLeft /></el-icon>
                  返回登录
                </el-link>
              </div>
            </el-form>
          </template>
        </div>

        <!-- ============ 项目选择层（账号登录后显示，原有功能不变） ============ -->
        <template v-else>
          <!-- 账号信息栏 -->
          <div class="account-bar">
            <div class="account-info">
              <el-icon><User /></el-icon>
              <span class="account-name">{{ authStore.account }}</span>
            </div>
            <div class="account-actions">
              <el-button text size="small" @click="openChangePwd">
                <el-icon><Key /></el-icon>
                <span>修改密码</span>
              </el-button>
              <el-button text size="small" type="danger" @click="handleLogoutAccount">
                <el-icon><SwitchButton /></el-icon>
                <span>退出账号</span>
              </el-button>
            </div>
          </div>

          <!-- 项目列表 -->
          <div class="project-section">
            <div class="section-header">
              <span class="section-title">选择项目</span>
              <span class="section-count" v-if="projects.length">{{ filteredProjects.length }} / {{ projects.length }} 个项目</span>
            </div>

            <el-input
              v-if="projects.length > 0"
              v-model="searchKeyword"
              placeholder="搜索项目名称..."
              class="project-search"
              size="large"
              clearable
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>

            <div v-if="projects.length === 0" class="empty-projects">
              <el-empty description="暂无项目，请创建一个新项目" :image-size="80" />
            </div>

            <div v-else-if="filteredProjects.length === 0" class="empty-projects">
              <el-empty description="未找到匹配的项目" :image-size="80" />
            </div>

            <div v-else class="project-list">
              <div
                v-for="project in filteredProjects"
                :key="project.id"
                class="project-card"
                @click="enterProject(project)"
              >
                <div class="project-info">
                  <div class="project-name">{{ project.name }}</div>
                  <div class="project-address" v-if="project.address">
                    <el-icon><Location /></el-icon>
                    <span>{{ project.address }}</span>
                  </div>
                  <div class="project-time" v-if="project.lastLoginTime">
                    <el-icon><Timer /></el-icon>
                    <span>最近进入：{{ formatTime(project.lastLoginTime) }}</span>
                  </div>
                </div>
                <div class="project-actions" @click.stop>
                  <el-button
                    type="primary"
                    text
                    size="small"
                    @click="editProject(project)"
                  >
                    <el-icon><Edit /></el-icon>
                  </el-button>
                  <el-button
                    type="danger"
                    text
                    size="small"
                    @click="confirmDelete(project)"
                  >
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- 创建项目按钮 -->
          <el-button
            type="primary"
            size="large"
            class="create-project-btn"
            @click="showCreateDialog = true"
          >
            <el-icon><Plus /></el-icon>
            创建新项目
          </el-button>
        </template>
      </div>

      <div class="login-bg">
        <div class="bg-shape shape-1"></div>
        <div class="bg-shape shape-2"></div>
        <div class="bg-shape shape-3"></div>
      </div>
    </div>

    <!-- 创建/编辑项目对话框 -->
    <el-dialog
      v-model="showCreateDialog"
      :title="isEditing ? '修改项目' : '创建项目'"
      width="420px"
      class="project-dialog"
      destroy-on-close
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
      >
        <el-form-item label="项目名称" prop="name">
          <el-input
            v-model="form.name"
            placeholder="请输入项目名称"
            size="large"
            clearable
          />
        </el-form-item>
        <el-form-item label="项目地址" prop="address">
          <el-input
            v-model="form.address"
            placeholder="请输入项目地址（可选）"
            size="large"
            clearable
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="loading">
          {{ isEditing ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 恢复码展示对话框（注册成功后一次性展示） -->
    <el-dialog
      v-model="showRecoveryDialog"
      title="请保存您的恢复码"
      width="440px"
      class="project-dialog recovery-dialog"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :show-close="false"
    >
      <div class="recovery-body">
        <div class="recovery-tip">
          恢复码是忘记密码时的主要找回方式，<strong>仅显示这一次</strong>。
          请截图或抄写到安全的地方保存，关闭后无法再次查看。
        </div>
        <div class="recovery-code">{{ recoveryCode }}</div>
        <el-checkbox v-model="recoverySaved">我已妥善保存恢复码</el-checkbox>
      </div>
      <template #footer>
        <el-button
          type="primary"
          :disabled="!recoverySaved"
          @click="showRecoveryDialog = false"
        >我已保存，继续</el-button>
      </template>
    </el-dialog>

    <!-- 修改密码对话框 -->
    <el-dialog
      v-model="showChangePwd"
      title="修改密码"
      width="420px"
      class="project-dialog"
      destroy-on-close
      @closed="resetChangeForm"
    >
      <el-form
        ref="changeFormRef"
        :model="changeForm"
        :rules="changeRules"
        label-position="top"
      >
        <el-form-item label="当前密码" prop="oldPassword">
          <el-input
            v-model="changeForm.oldPassword"
            type="password"
            placeholder="请输入当前密码"
            size="large"
            show-password
          />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="changeForm.newPassword"
            type="password"
            placeholder="至少 6 位，不含空格"
            size="large"
            show-password
          />
        </el-form-item>
        <el-form-item label="确认新密码" prop="confirmPassword">
          <el-input
            v-model="changeForm.confirmPassword"
            type="password"
            placeholder="请再次输入新密码"
            size="large"
            show-password
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showChangePwd = false">取消</el-button>
        <el-button type="primary" :loading="authLoading" @click="handleChangePwd">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore, useDeviceStore, useCabinetStore } from '../stores'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Location, Search, Timer, User, Lock, Key, QuestionFilled, ArrowLeft, SwitchButton } from '@element-plus/icons-vue'
import { SECURITY_QUESTIONS } from '../utils/accountStorage'
import { addLog, LogType, LogResult } from '../composables/useOperationLog.js'
import logger from '../utils/logger'
import dayjs from 'dayjs'

const router = useRouter()
const authStore = useAuthStore()
const deviceStore = useDeviceStore()
const cabinetStore = useCabinetStore()

// ============================================================
// 账号认证层状态
// ============================================================
const securityQuestions = SECURITY_QUESTIONS
const authMode = ref('login') // login | register | forgot
const authLoading = ref(false)
const forgotStep = ref(1) // 1=输入用户名 2=验证+设置新密码

const loginFormRef = ref(null)
const regFormRef = ref(null)
const forgotFormRef = ref(null)
const changeFormRef = ref(null)

const authForm = reactive({ username: '', password: '' })
const regForm = reactive({ username: '', password: '', confirmPassword: '', question: '', answer: '' })
const forgotForm = reactive({
  username: '',
  question: '',
  way: 'recovery', // recovery | question
  recoveryCode: '',
  answer: '',
  newPassword: '',
  confirmPassword: ''
})
// 账号是否处于密码锁定中（锁定只拦登录与安全问题通道，恢复码通道仍可用）
const forgotLocked = ref(false)
const changeForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })

const loginRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

const regRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 24, message: '用户名长度为 2-24 个字符', trigger: 'blur' },
    { pattern: /^[\u4e00-\u9fa5A-Za-z0-9_.@-]+$/, message: '仅支持中文、字母、数字及 _.@- 字符', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 64, message: '密码长度为 6-64 位', trigger: 'blur' },
    { pattern: /^\S+$/, message: '密码不能包含空格', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== regForm.password) callback(new Error('两次输入的密码不一致'))
        else callback()
      },
      trigger: 'blur'
    }
  ],
  question: [{ required: true, message: '请选择安全问题', trigger: 'change' }],
  answer: [
    { required: true, message: '请输入安全问题答案', trigger: 'blur' },
    { max: 50, message: '答案不能超过 50 个字符', trigger: 'blur' }
  ]
}

const forgotStep1Rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }]
}

const forgotStep2Rules = {
  way: [{ required: true, message: '请选择验证方式', trigger: 'change' }],
  recoveryCode: [
    {
      validator: (rule, value, callback) => {
        if (forgotForm.way === 'recovery' && !String(value || '').trim()) {
          callback(new Error('请输入恢复码'))
        } else callback()
      },
      trigger: 'blur'
    }
  ],
  answer: [
    {
      validator: (rule, value, callback) => {
        if (forgotForm.way === 'question' && !String(value || '').trim()) {
          callback(new Error('请输入安全问题答案'))
        } else callback()
      },
      trigger: 'blur'
    }
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 64, message: '密码长度为 6-64 位', trigger: 'blur' },
    { pattern: /^\S+$/, message: '密码不能包含空格', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== forgotForm.newPassword) callback(new Error('两次输入的密码不一致'))
        else callback()
      },
      trigger: 'blur'
    }
  ]
}

const changeRules = {
  oldPassword: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 64, message: '密码长度为 6-64 位', trigger: 'blur' },
    { pattern: /^\S+$/, message: '密码不能包含空格', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== changeForm.newPassword) callback(new Error('两次输入的密码不一致'))
        else callback()
      },
      trigger: 'blur'
    }
  ]
}

function switchAuthMode(mode) {
  authMode.value = mode
  forgotStep.value = 1
  forgotLocked.value = false
  // 切换视图时清理表单校验残留
  regForm.username = ''
  regForm.password = ''
  regForm.confirmPassword = ''
  regForm.question = ''
  regForm.answer = ''
  forgotForm.username = authMode.value === 'forgot' ? forgotForm.username : ''
  forgotForm.question = ''
  forgotForm.way = 'recovery'
  forgotForm.recoveryCode = ''
  forgotForm.answer = ''
  forgotForm.newPassword = ''
  forgotForm.confirmPassword = ''
  authForm.password = ''
}

// 登录
async function handleLogin() {
  try {
    await loginFormRef.value.validate()
  } catch {
    return
  }
  authLoading.value = true
  try {
    const res = await authStore.loginAccount(authForm.username.trim(), authForm.password)
    if (res.success) {
      ElMessage.success(`欢迎回来，${res.username}`)
      authForm.username = ''
      authForm.password = ''
      addLog({ type: LogType.LOGIN, detail: `账号登录：${res.username}`, result: LogResult.SUCCESS })
    } else {
      ElMessage.error(res.message || '登录失败')
    }
  } catch (e) {
    logger.error('账号登录异常', e)
    ElMessage.error('登录异常，请重试')
  } finally {
    authLoading.value = false
  }
}

// 注册
async function handleRegister() {
  try {
    await regFormRef.value.validate()
  } catch {
    return
  }
  authLoading.value = true
  try {
    const res = await authStore.registerAccount({
      username: regForm.username.trim(),
      password: regForm.password,
      question: regForm.question,
      answer: regForm.answer
    })
    if (res.success) {
      ElMessage.success('注册成功')
      // 展示一次性恢复码（仅此一次）
      recoveryCode.value = res.recoveryCode || ''
      recoverySaved.value = false
      showRecoveryDialog.value = true
      addLog({ type: LogType.LOGIN, detail: `注册账号：${regForm.username.trim()}`, result: LogResult.SUCCESS })
    } else {
      ElMessage.error(res.message || '注册失败')
    }
  } catch (e) {
    logger.error('账号注册异常', e)
    ElMessage.error('注册异常，请重试')
  } finally {
    authLoading.value = false
  }
}

// 忘记密码第 1 步：查询安全问题
async function handleForgotQuery() {
  try {
    await forgotFormRef.value.validate()
  } catch {
    return
  }
  authLoading.value = true
  try {
    const res = await authStore.getSecurityQuestion(forgotForm.username.trim())
    if (!res) {
      ElMessage.error('该用户名未注册')
      return
    }
    forgotLocked.value = !!res.locked
    forgotForm.question = res.question
    forgotStep.value = 2
  } catch (e) {
    logger.error('查询安全问题异常', e)
    ElMessage.error('查询异常，请重试')
  } finally {
    authLoading.value = false
  }
}

// 忘记密码第 2 步：验证 + 重置
async function handleForgotReset() {
  // 锁定期内安全问题通道不可用（防暴力破解），提示用户改用恢复码
  if (forgotLocked.value && forgotForm.way === 'question') {
    ElMessage.error('账号已锁定，安全问题验证暂不可用，请改用恢复码重置')
    return
  }
  try {
    await forgotFormRef.value.validate()
  } catch {
    return
  }
  authLoading.value = true
  try {
    const username = forgotForm.username.trim()
    const res = forgotForm.way === 'recovery'
      ? await authStore.resetPasswordWithRecovery(username, forgotForm.recoveryCode, forgotForm.newPassword)
      : await authStore.resetPasswordWithAnswer(username, forgotForm.answer, forgotForm.newPassword)
    if (res.success) {
      ElMessage.success('密码重置成功，请使用新密码登录')
      authForm.username = username
      authMode.value = 'login'
      forgotStep.value = 1
      forgotForm.question = ''
      forgotForm.way = 'recovery'
      forgotForm.recoveryCode = ''
      forgotForm.answer = ''
      forgotForm.newPassword = ''
      forgotForm.confirmPassword = ''
    } else {
      ElMessage.error(res.message || '密码重置失败')
    }
  } catch (e) {
    logger.error('密码重置异常', e)
    ElMessage.error('密码重置异常，请重试')
  } finally {
    authLoading.value = false
  }
}

// 退出账号
function handleLogoutAccount() {
  ElMessageBox.confirm(
    '退出后需要重新输入账号密码才能进入。项目数据保存在本机，不会因退出账号而丢失。',
    '退出账号',
    {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    authStore.logoutAccount()
    switchAuthMode('login')
    ElMessage.success('已退出账号')
  }).catch(() => {})
}

// ============================================================
// 项目管理（原有功能，保持不变）
// ============================================================
const formRef = ref(null)
const loading = ref(false)
const showCreateDialog = ref(false)
const isEditing = ref(false)
const editId = ref('')

// 用 computed 跟随 store 引用变化（修复改名/删除后列表不即时刷新的既有缺陷）
const projects = computed(() => authStore.projects)

// 项目搜索 + 最近使用排序（按最后进入时间倒序，未进入过的按创建时间倒序）
const searchKeyword = ref('')
const filteredProjects = computed(() => {
  const kw = (searchKeyword.value || '').trim().toLowerCase()
  const list = kw
    ? projects.value.filter(p => (p.name || '').toLowerCase().includes(kw))
    : [...projects.value]
  return list.sort((a, b) => {
    const keyA = a.lastLoginTime || a.createdAt || ''
    const keyB = b.lastLoginTime || b.createdAt || ''
    return keyB < keyA ? -1 : (keyB > keyA ? 1 : 0)
  })
})

function formatTime(t) {
  return t ? dayjs(t).format('YYYY-MM-DD HH:mm') : ''
}

const form = reactive({
  name: '',
  address: ''
})

const rules = {
  name: [
    { required: true, message: '请输入项目名称', trigger: 'blur' },
    { min: 1, max: 30, message: '项目名称长度为1-30个字符', trigger: 'blur' }
  ]
}

onMounted(() => {
  // 不再自动跳转到 Dashboard，让用户每次打开都能看到项目选择页
  // 如需继续上次项目，可手动点击项目卡片进入
})

function enterProject(project) {
  loading.value = true
  try {
    authStore.selectProject(project)

    // 加载项目数据
    logger.info('进入项目，开始加载数据...')
    try {
      deviceStore.reload()
      cabinetStore.reload()
      logger.info('项目数据加载完成')
    } catch (e) {
      logger.error('加载项目数据失败', e)
    }

    ElMessage.success(`已进入项目「${project.name}」`)
    addLog({ type: LogType.LOGIN, detail: `登录项目：${project.name}`, result: LogResult.SUCCESS })
    router.replace('/dashboard')
  } catch (err) {
    ElMessage.error('进入项目失败，请重试')
  } finally {
    loading.value = false
  }
}

function editProject(project) {
  isEditing.value = true
  editId.value = project.id
  form.name = project.name
  form.address = project.address || ''
  showCreateDialog.value = true
}

async function submitForm() {
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  loading.value = true

  try {
    if (isEditing.value) {
      const result = authStore.updateProject(editId.value, {
        name: form.name.trim(),
        address: form.address.trim()
      })
      if (result.success) {
        ElMessage.success('项目修改成功')
        showCreateDialog.value = false
        resetForm()
      } else {
        ElMessage.error(result.message)
      }
    } else {
      const result = authStore.addProject(form.name.trim(), form.address.trim())
      if (result.success) {
        ElMessage.success('项目创建成功')
        // 直接进入新项目
        enterProject(result.project)
        showCreateDialog.value = false
        resetForm()
      } else {
        ElMessage.error(result.message)
      }
    }
  } catch (err) {
    ElMessage.error('操作异常，请重试')
  } finally {
    loading.value = false
  }
}

function confirmDelete(project) {
  ElMessageBox.confirm(
    `确定要删除项目「${project.name}」吗？此操作将删除该项目下的所有数据，且不可恢复。`,
    '删除项目',
    {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    authStore.deleteProject(project.id)
    // 同时清理该项目的本地数据
    const keys = Object.keys(localStorage)
    for (const key of keys) {
      if (key.includes(project.id)) {
        localStorage.removeItem(key)
      }
    }
    ElMessage.success('项目已删除')
  }).catch(() => {})
}

function resetForm() {
  form.name = ''
  form.address = ''
  isEditing.value = false
  editId.value = ''
  formRef.value?.resetFields()
}

// ============================================================
// 修改密码（已登录）
// ============================================================
const showChangePwd = ref(false)
const showRecoveryDialog = ref(false)
const recoveryCode = ref('')
const recoverySaved = ref(false)

function openChangePwd() {
  showChangePwd.value = true
}

async function handleChangePwd() {
  try {
    await changeFormRef.value.validate()
  } catch {
    return
  }
  authLoading.value = true
  try {
    const res = await authStore.changePassword(changeForm.oldPassword, changeForm.newPassword)
    if (res.success) {
      ElMessage.success('密码修改成功，下次登录请使用新密码')
      showChangePwd.value = false
    } else {
      ElMessage.error(res.message || '密码修改失败')
    }
  } catch (e) {
    logger.error('修改密码异常', e)
    ElMessage.error('修改密码异常，请重试')
  } finally {
    authLoading.value = false
  }
}

function resetChangeForm() {
  changeForm.oldPassword = ''
  changeForm.newPassword = ''
  changeForm.confirmPassword = ''
  changeFormRef.value?.resetFields()
}
</script>

<style lang="scss" scoped>
.login-view {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0a0e27 0%, #1a1f4a 50%, #0d1233 100%);
  position: relative;
  overflow: hidden;
}

.login-container {
  position: relative;
  z-index: 10;
  width: 100%;
  max-width: 480px;
  padding: 20px;
}

.login-card {
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 32px 28px;
  box-shadow: var(--shadow-md);

  @media (max-width: 768px) {
    padding: 24px 16px;
    border-radius: 12px;
  }
}

.login-header {
  text-align: center;
  margin-bottom: 24px;
}

.login-logo {
  width: 72px;
  height: 72px;
  margin: 0 auto 12px;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: 16px;
  }

  @media (max-width: 768px) {
    width: 56px;
    height: 56px;
  }
}

.login-title {
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 6px;
  letter-spacing: -0.5px;

  @media (max-width: 768px) {
    font-size: 20px;
  }
}

.login-subtitle {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

// ============ 账号认证层 ============
// 等高对称：登录/注册/忘记密码三个视图共用同一认证区最小高度，
// 使卡片在任意视图下总高度完全一致（注册视图为最高基准）
.auth-section {
  min-height: 580px;

  @media (max-width: 768px) {
    min-height: 0;
  }
}

.auth-title {
  font-size: 15px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  margin-bottom: 16px;
  padding: 0 4px;
}

.auth-form {
  // 强制标签置顶（覆盖全局 main.scss 对 .el-form-item 的左右排布 !important 规则）
  :deep(.el-form-item) {
    display: block !important;
    margin-bottom: 16px;
  }

  :deep(.el-form-item__label) {
    display: block !important;
    width: auto !important;
    height: auto !important;
    line-height: 1.4 !important;
    text-align: left;
    padding: 0 0 6px;
  }

  :deep(.el-form-item__content) {
    min-height: 0 !important;
    margin-left: 0 !important;
    width: 100%;
  }

  :deep(.el-input) {
    width: 100%;
  }

  :deep(.el-form-item__label) {
    color: rgba(255, 255, 255, 0.7);
    font-size: 13px;
  }

  :deep(.el-input__wrapper) {
    background: rgba(255, 255, 255, 0.06);
    box-shadow: none;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    transition: border-color 0.2s;

    &:hover,
    &.is-focus {
      border-color: rgba(0, 122, 204, 0.5);
    }
  }

  :deep(.el-input__inner) {
    color: #fff;

    &::placeholder {
      color: rgba(255, 255, 255, 0.3);
    }
  }

  :deep(.el-input__prefix) {
    color: rgba(255, 255, 255, 0.4);
  }

  :deep(.el-select__wrapper) {
    background: rgba(255, 255, 255, 0.06);
    box-shadow: none;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    min-height: 40px;

    &.is-hovering,
    &.is-focused {
      border-color: rgba(0, 122, 204, 0.5);
    }
  }

  :deep(.el-select__selected-item) {
    color: #fff;
  }

  :deep(.el-select__placeholder) {
    color: rgba(255, 255, 255, 0.3);
  }

  :deep(.el-radio__label) {
    color: rgba(255, 255, 255, 0.75);
    font-size: 13px;
  }

  :deep(.el-radio__inner) {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.3);
  }

  :deep(.el-radio__input.is-checked .el-radio__inner) {
    border-color: #2f81f7;
  }

  :deep(.el-radio__input.is-checked + .el-radio__label) {
    color: #fff;
  }
}

.auth-select {
  width: 100%;
}

.auth-radio {
  display: flex;
  gap: 16px;
}

.auth-submit-btn {
  width: 100%;
  height: 44px;
  font-size: 15px;
  font-weight: 600;
  border-radius: 10px;
  background: linear-gradient(135deg, #2f81f7 0%, #1e60d5 100%);
  border: none;
  margin-top: 4px;

  &:hover {
    background: linear-gradient(135deg, #4090f7 0%, #2f70e5 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 20px rgba(0, 122, 204, 0.4);
  }

  &:active {
    transform: translateY(0);
  }
}

.auth-links {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 14px;
  padding: 0 4px;
}

.auth-back-icon {
  margin-right: 4px;
}

.auth-note {
  margin-top: 14px;
  padding: 10px 12px;
  background: rgba(0, 122, 204, 0.08);
  border: 1px solid rgba(0, 122, 204, 0.2);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.5);
}

.auth-question {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px dashed rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);

  .el-icon {
    color: #2f81f7;
    flex-shrink: 0;
  }
}

// ============ 账号信息栏 ============
.account-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
}

.account-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;

  .el-icon {
    color: #2f81f7;
    font-size: 16px;
    flex-shrink: 0;
  }
}

.account-name {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.account-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;

  .el-button {
    color: rgba(255, 255, 255, 0.55);
    padding: 4px 8px;

    .el-icon {
      margin-right: 4px;
    }

    &:hover {
      color: #fff;
    }

    &.el-button--danger:hover {
      color: #f56c6c;
    }
  }
}

// 恢复码对话框
.recovery-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.recovery-tip {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary, #909399);

  strong {
    color: #e6a23c;
  }
}

.recovery-code {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 2px;
  text-align: center;
  padding: 16px 12px;
  background: rgba(0, 122, 204, 0.08);
  border: 1px dashed rgba(0, 122, 204, 0.4);
  border-radius: 10px;
  color: #2f81f7;
  user-select: all;
}

// 项目列表区域
.project-section {
  margin-bottom: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 0 4px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
}

.section-count {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

.project-search {
  margin-bottom: 12px;

  :deep(.el-input__wrapper) {
    background: rgba(255, 255, 255, 0.06);
    box-shadow: none;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    transition: border-color 0.2s;

    &:hover,
    &:focus-within {
      border-color: rgba(0, 122, 204, 0.5);
    }
  }

  :deep(.el-input__inner) {
    color: #fff;
  }
}

.empty-projects {
  background: rgba(255, 255, 255, 0.03);
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 24px 16px;

  :deep(.el-empty__description) {
    color: rgba(255, 255, 255, 0.4);
  }
}

.project-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 320px;
  overflow-y: auto;
  padding-right: 4px;

  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
  }
}

.project-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 12px 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: var(--shadow-md);

  &:hover {
    background: var(--bg-glass);
    border-color: rgba(0, 122, 204, 0.4);
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }
}

.project-info {
  flex: 1;
  min-width: 0;
}

.project-name {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-address {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);

  .el-icon {
    font-size: 12px;
    flex-shrink: 0;
  }

  span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.project-time {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: rgba(0, 122, 204, 0.7);
  margin-top: 2px;

  .el-icon {
    font-size: 12px;
    flex-shrink: 0;
  }
}

.project-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  margin-left: 8px;

  .el-button {
    padding: 4px;
    color: rgba(255, 255, 255, 0.4);

    &:hover {
      color: #fff;
    }
  }
}

.create-project-btn {
  width: 100%;
  height: 46px;
  font-size: 15px;
  font-weight: 600;
  border-radius: 10px;
  background: linear-gradient(135deg, #2f81f7 0%, #1e60d5 100%);
  border: none;

  &:hover {
    background: linear-gradient(135deg, #4090f7 0%, #2f70e5 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 20px rgba(0, 122, 204, 0.4);
  }

  &:active {
    transform: translateY(0);
  }

  .el-icon {
    margin-right: 6px;
    font-size: 16px;
  }
}

// 背景动画
.login-bg {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: hidden;
}

.bg-shape {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.3;
  animation: float 20s ease-in-out infinite;
}

.shape-1 {
  width: 400px;
  height: 400px;
  background: #2f81f7;
  top: -100px;
  left: -100px;
  animation-delay: 0s;
}

.shape-2 {
  width: 300px;
  height: 300px;
  background: #1e60d5;
  bottom: -50px;
  right: -50px;
  animation-delay: -5s;
}

.shape-3 {
  width: 200px;
  height: 200px;
  background: #7c3aed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation-delay: -10s;
}

@keyframes float {
  0%, 100% {
    transform: translate(0, 0) scale(1);
  }
  25% {
    transform: translate(30px, -30px) scale(1.05);
  }
  50% {
    transform: translate(-20px, 20px) scale(0.95);
  }
  75% {
    transform: translate(20px, 30px) scale(1.02);
  }
}

// 对话框样式
:deep(.project-dialog) {
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);

  .el-dialog__header {
    margin: 0;
    padding: 16px 20px;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .el-dialog__body {
    padding: 20px;
  }

  .el-dialog__footer {
    padding: 12px 20px;
    border-top: 1px solid var(--el-border-color-lighter);
  }

  // 强制表单标签在上方显示
  .el-form-item {
    display: flex;
    flex-direction: column;
  }

  .el-form-item__label {
    float: none;
    display: inline-block;
    text-align: left;
    padding: 0 0 8px;
    line-height: 1.4;
    font-size: 14px;
    color: var(--text-primary);
    width: auto !important;
  }

  .el-form-item__content {
    margin-left: 0 !important;
    width: 100%;
  }

  .el-input {
    width: 100%;
  }
}

// 移动端对话框缩放
@media (max-width: 768px) {
  :deep(.project-dialog) {
    width: 92vw !important;
    max-width: 92vw !important;
    top: 45% !important;
    margin-top: 0 !important;
    transform: translateY(-50%) scale(0.95) !important;
    transform-origin: center center !important;

    .el-dialog__header {
      padding: 14px 18px;
    }

    .el-dialog__headerbtn {
      top: 12px;
      right: 12px;
    }

    .el-dialog__title {
      font-size: 17px;
    }

    .el-dialog__body {
      padding: 16px 18px;
    }

    .el-dialog__footer {
      padding: 12px 18px;
    }

    .el-form-item {
      margin-bottom: 14px;
    }

    .el-form-item__label {
      padding-bottom: 4px;
      line-height: 1.4;
      font-size: 14px;
    }

    .el-input__inner {
      height: 38px;
      font-size: 15px;
    }

    .el-input__wrapper {
      padding: 0 12px;
    }
  }

  .account-bar {
    flex-direction: column;
    gap: 8px;
    align-items: stretch;
  }

  .account-info {
    justify-content: center;
  }

  .account-actions {
    justify-content: center;
  }
}
</style>
