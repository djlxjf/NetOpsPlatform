import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { loadFromDB, saveToDB } from './db-sync-utils'
// 安全审计 F-007：SMTP 密码 / Webhook 加签密钥加密存储
import { encryptSecret, decryptSecret } from '../utils/credentialCrypto'

const CONFIG_DATA_TYPE = 'notificationConfig'
const LOGS_DATA_TYPE = 'notificationLogs'

export const useNotificationStore = defineStore('notification', () => {
  // 状态 - 从数据库加载，失败则使用默认配置
  const notificationConfig = ref({
    email: {
      enabled: false,
      smtpServer: '',
      smtpPort: 587,
      username: '',
      password: '',
      useSSL: true,
      fromAddress: '',
      recipients: [],
      templates: {
        critical: {
          subject: '【紧急】{device} - {alert}',
          body: '告警级别: {level}\n设备: {device}\n告警内容: {message}\n时间: {time}'
        },
        major: {
          subject: '【重要】{device} - {alert}',
          body: '告警级别: {level}\n设备: {device}\n告警内容: {message}\n时间: {time}'
        },
        minor: {
          subject: '【一般】{device} - {alert}',
          body: '告警级别: {level}\n设备: {device}\n告警内容: {message}\n时间: {time}'
        }
      }
    },
    webhook: {
      enabled: false,
      wechat: {
        enabled: false,
        webhookUrl: '',
        secret: '',
        messageType: 'text',
        keywords: []
      },
      dingtalk: {
        enabled: false,
        webhookUrl: '',
        secret: '',
        messageType: 'text',
        keywords: []
      }
    },
    escalation: {
      enabled: false,
      rules: [],
      dutySchedule: {
        enabled: false,
        schedules: []
      }
    },
    suppression: {
      enabled: false,
      sameAlertInterval: 5,
      sameDeviceInterval: 10,
      maintenanceWindows: []
    }
  })
  
  const notificationLogs = ref([])
  const notificationRules = ref([])
  
  // 初始化时从数据库加载（内存明文 / 落盘密文）
  ;(async () => {
    await loadFromDB(CONFIG_DATA_TYPE, notificationConfig)
    await loadFromDB(LOGS_DATA_TYPE, notificationLogs)
  // F-007：解密回明文内存（幂等：非 enc: 前缀原样返回）
  if (notificationConfig.value?.email?.password) {
    notificationConfig.value.email.password = await decryptSecret(notificationConfig.value.email.password)
  }
  for (const p of ['wechat', 'dingtalk']) {
    const w = notificationConfig.value?.webhook?.[p]
    if (w?.secret) w.secret = await decryptSecret(w.secret)
    // webhookUrl 内嵌 access_token/key（企业微信/钉钉），一并解密
    if (w?.webhookUrl) w.webhookUrl = await decryptSecret(w.webhookUrl)
  }
  })()

  // F-007：落盘加密副本（深拷贝避免污染内存明文），统一保存入口
  async function persistConfig() {
    const copy = JSON.parse(JSON.stringify(notificationConfig.value || {}))
    if (copy.email?.password) copy.email.password = await encryptSecret(copy.email.password)
    for (const p of ['wechat', 'dingtalk']) {
      const w = copy.webhook?.[p]
      if (w?.secret) w.secret = await encryptSecret(w.secret)
      if (w?.webhookUrl) w.webhookUrl = await encryptSecret(w.webhookUrl)
    }
    await saveToDB(CONFIG_DATA_TYPE, copy)
  }

  // 邮件配置
  async function updateEmailConfig(config) {
    notificationConfig.value.email = { ...notificationConfig.value.email, ...config }
    await persistConfig()
  }
  
  function testEmail() {
    const config = notificationConfig.value.email
    if (!config.smtpServer || !config.username || !config.recipients.length) {
      return Promise.reject(new Error('请先完善邮件配置'))
    }
    // 真实发送：Electron 环境走 IPC
    if (window.electronAPI?.sendEmail) {
      return window.electronAPI.sendEmail({
        to: config.recipients,
        subject: 'NetOps Platform 测试邮件',
        body: '<p>这是一封来自 NetOps Platform 通知推送系统的测试邮件。</p>',
        smtpConfig: {
          host: config.smtpServer,
          port: config.smtpPort,
          user: config.username,
          pass: config.password,
          from: config.fromAddress,
          secure: config.useSSL
        }
      }).then((res) => {
        if (!res?.success) {
          addLog('error', 'email', `测试邮件发送失败: ${res?.error || '未知错误'}`)
          throw new Error(res?.error || '邮件发送失败')
        }
        addLog('success', 'email', '测试邮件发送成功')
        return { success: true, message: '测试邮件已发送' }
      }).catch((err) => {
        throw new Error(err?.message || String(err))
      })
    }
    // Web 环境（无 IPC）回退到假实现
    return new Promise((resolve) => {
      setTimeout(() => {
        addLog('success', 'email', '测试邮件发送成功（网页演示模式）')
        resolve({ success: true, message: '测试邮件已发送（网页演示模式）' })
      }, 1000)
    })
  }
  
  // Webhook配置
  async function updateWebhookConfig(platform, config) {
    notificationConfig.value.webhook[platform] = { 
      ...notificationConfig.value.webhook[platform], 
      ...config 
    }
    await persistConfig()
  }

  function testWebhook(platform) {
    const config = notificationConfig.value.webhook[platform]
    const channelName = platform === 'wechat' ? '企业微信' : '钉钉'
    if (!config.webhookUrl) {
      return Promise.reject(new Error(`请先配置${channelName}Webhook地址`))
    }
    // 真实发送：Electron 环境走 IPC
    if (window.electronAPI?.sendWebhook) {
      return window.electronAPI.sendWebhook({
        url: config.webhookUrl,
        payload: { msgtype: 'text', text: { content: '测试消息' } }
      }).then((res) => {
        if (!res?.success) {
          addLog('error', platform, `${channelName}测试消息发送失败: ${res?.error || '未知错误'}`)
          throw new Error(res?.error || 'Webhook发送失败')
        }
        addLog('success', platform, `${channelName}测试消息发送成功`)
        return { success: true, message: '测试消息已发送' }
      }).catch((err) => {
        throw new Error(err?.message || String(err))
      })
    }
    // Web 环境（无 IPC）回退到假实现
    return new Promise((resolve) => {
      setTimeout(() => {
        addLog('success', platform, `${channelName}测试消息发送成功（网页演示模式）`)
        resolve({ success: true, message: '测试消息已发送（网页演示模式）' })
      }, 1000)
    })
  }

  // 告警升级规则
  async function updateEscalationRule(ruleId, updates) {
    const index = notificationConfig.value.escalation.rules.findIndex(r => r.id === ruleId)
    if (index !== -1) {
      notificationConfig.value.escalation.rules[index] = {
        ...notificationConfig.value.escalation.rules[index],
        ...updates
      }
      await persistConfig()
    }
  }

  async function addEscalationRule(rule) {
    const newRule = {
      id: Date.now().toString(),
      ...rule
    }
    notificationConfig.value.escalation.rules.push(newRule)
    await persistConfig()
    return newRule
  }

  async function deleteEscalationRule(ruleId) {
    const index = notificationConfig.value.escalation.rules.findIndex(r => r.id === ruleId)
    if (index !== -1) {
      notificationConfig.value.escalation.rules.splice(index, 1)
      await persistConfig()
    }
  }

  // 升级开关：设置并持久化（修复关闭后刷新恢复的问题）
  async function setEscalationEnabled(enabled) {
    notificationConfig.value.escalation.enabled = enabled
    await persistConfig()
  }

  // 通知日志
  async function addLog(type, channel, message) {
    const log = {
      id: Date.now().toString(),
      type,
      channel,
      message,
      timestamp: new Date().toISOString()
    }
    notificationLogs.value.unshift(log)
    if (notificationLogs.value.length > 1000) {
      notificationLogs.value = notificationLogs.value.slice(0, 1000)
    }
    await saveToDB(LOGS_DATA_TYPE, notificationLogs.value)
  }

  async function clearLogs() {
    notificationLogs.value = []
    await saveToDB(LOGS_DATA_TYPE, [])
  }

  // 发送通知（邮件 / 企业微信 / 钉钉，各渠道依次发送，失败不影响其他渠道）
  async function sendNotification(level, device, message, alertType) {
    const config = notificationConfig.value

    // 邮件渠道
    if (config.email.enabled && config.email.recipients.length) {
      try {
        const recipients = config.email.recipients
        const subject = `[告警] ${level} - ${device}`
        const body = `<p>${message || ''}</p>`
        if (window.electronAPI?.sendEmail) {
          const res = await window.electronAPI.sendEmail({
            to: recipients,
            subject,
            body,
            smtpConfig: {
              host: config.email.smtpServer,
              port: config.email.smtpPort,
              user: config.email.username,
              pass: config.email.password,
              from: config.email.fromAddress,
              secure: config.email.useSSL
            }
          })
          if (!res?.success) {
            throw new Error(res?.error || '未知错误')
          }
          addLog('info', 'email', `邮件已发送到 ${recipients.join(',')}`)
        } else {
          addLog('info', 'email', `准备发送邮件通知 - ${level}级别告警（网页演示模式）`)
        }
      } catch (err) {
        addLog('error', 'email', '邮件发送失败: ' + (err?.message || err))
      }
    }

    // 企业微信渠道
    if (config.webhook.wechat.enabled) {
      try {
        const payload = {
          msgtype: 'text',
          text: { content: `[告警] ${level} - ${device}\n${message || ''}` }
        }
        if (window.electronAPI?.sendWebhook) {
          const res = await window.electronAPI.sendWebhook({ url: config.webhook.wechat.webhookUrl, payload })
          if (!res?.success) {
            throw new Error(res?.error || '未知错误')
          }
          addLog('info', 'wechat', `企业微信通知已发送 - ${level}级别告警`)
        } else {
          addLog('info', 'wechat', `准备发送企业微信通知 - ${level}级别告警（网页演示模式）`)
        }
      } catch (err) {
        addLog('error', 'wechat', '企业微信通知发送失败: ' + (err?.message || err))
      }
    }

    // 钉钉渠道
    if (config.webhook.dingtalk.enabled) {
      try {
        const url = config.webhook.dingtalk.webhookUrl
        const payload = {
          msgtype: 'text',
          text: { content: `[告警] ${level} - ${device}\n${message || ''}` }
        }
        if (window.electronAPI?.sendWebhook) {
          const res = await window.electronAPI.sendWebhook({ url, payload })
          if (!res?.success) {
            throw new Error(res?.error || '未知错误')
          }
          addLog('info', 'dingtalk', `钉钉通知已发送 - ${level}级别告警`)
        } else {
          addLog('info', 'dingtalk', `准备发送钉钉通知 - ${level}级别告警（网页演示模式）`)
        }
      } catch (err) {
        addLog('error', 'dingtalk', '钉钉通知发送失败: ' + (err?.message || err))
      }
    }
  }

  // 获取通知配置统计
  const notificationStats = computed(() => {
    const config = notificationConfig.value
    return {
      emailEnabled: config.email.enabled,
      wechatEnabled: config.webhook.wechat.enabled,
      dingtalkEnabled: config.webhook.dingtalk.enabled,
      escalationEnabled: config.escalation.enabled,
      escalationRulesCount: config.escalation.rules.length,
      totalLogs: notificationLogs.value.length,
      successLogs: notificationLogs.value.filter(l => l.type === 'success').length,
      failedLogs: notificationLogs.value.filter(l => l.type === 'error').length
    }
  })

  return {
    notificationConfig,
    notificationLogs,
    notificationRules,
    notificationStats,
    updateEmailConfig,
    testEmail,
    updateWebhookConfig,
    testWebhook,
    updateEscalationRule,
    setEscalationEnabled,
    addEscalationRule,
    deleteEscalationRule,
    addLog,
    clearLogs,
    sendNotification
  }
})
