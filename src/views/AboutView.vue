<template>
  <PageLayout
    title="关于 / 支持"
    subtitle="NetOps Platform · 网络运维管理平台"
  >
    <div class="about-card mac-card">
      <!-- 品牌区：logo + 名称 + 版本徽标 -->
      <div class="about-brand">
        <img class="about-logo" src="/logo_128.png" alt="NetOps" />
        <div class="about-brand-text">
          <div class="about-brand-name">NetOps Platform</div>
          <span class="about-badge">开源核心 · MIT</span>
        </div>
      </div>

      <!-- 说明文案 -->
      <p class="about-intro">
        NetOps Platform 基于 MIT 许可证开源，全部核心功能永久免费、可自由使用。如果它在日常运维中确实帮到了你，
        而你愿意顺手支持一下后续的开发与维护，欢迎用下方任意一种方式请作者喝杯咖啡——<strong>金额随意，心意到了就好</strong>。
        当然，不赞赏也完全没关系，软件的所有功能都不会受到任何影响。
      </p>

      <!-- 收款码区：两张并排，点击放大 -->
      <div class="donate-row">
        <div class="donate-item" @click="enlarge('wechat')">
          <div class="donate-card">
            <img class="donate-qr" src="/donate-wechat.png" alt="微信收款码" />
          </div>
          <div class="donate-name">微信收款</div>
          <div class="donate-tip">打开微信「扫一扫」· 金额自定</div>
        </div>

        <div class="donate-item" @click="enlarge('alipay')">
          <div class="donate-card">
            <img class="donate-qr" src="/donate-alipay.png" alt="支付宝收款码" />
          </div>
          <div class="donate-name">支付宝收款</div>
          <div class="donate-tip">打开支付宝「扫一扫」· 金额自定</div>
        </div>
      </div>

      <!-- 底部说明 -->
      <p class="about-foot">
        你的每一份支持，都会实打实地用在服务器开销、功能迭代与问题修复上，帮这个项目走得更远。
        如果你需要商业授权、私有化部署或团队级技术支持，也可以了解专业版（Pro）方案。再次感谢你愿意花时间了解 NetOps Platform。
      </p>
    </div>

    <!-- 放大查看对话框（全局已主题化，此处仅控制图片） -->
    <el-dialog
      v-model="dialog"
      width="min(92vw, 420px)"
      align-center
      append-to-body
      :show-close="true"
    >
      <img v-if="current" class="dialog-qr" :src="current" alt="收款码大图" />
    </el-dialog>
  </PageLayout>
</template>

<script setup>
import { ref } from 'vue'
import PageLayout from '../components/PageLayout.vue'

const dialog = ref(false)
const current = ref('')

function enlarge(which) {
  current.value = which === 'wechat' ? '/donate-wechat.png' : '/donate-alipay.png'
  dialog.value = true
}
</script>

<style scoped>
/* 外层卡片：复用全局 .mac-card（主题化背景 / 边框 / 圆角 / 阴影 / 悬浮反馈） */
.about-card {
  max-width: 720px;
  margin: 0 auto;
  padding: var(--n-space-6);
  display: flex;
  flex-direction: column;
  gap: var(--n-space-5);
}

/* —— 品牌区 —— */
.about-brand {
  display: flex;
  align-items: center;
  gap: var(--n-space-4);
}
.about-logo {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-md);
  flex-shrink: 0;
}
.about-brand-text {
  display: flex;
  flex-direction: column;
  gap: var(--n-space-2);
}
.about-brand-name {
  font-size: var(--n-fs-xl);
  font-weight: var(--n-fw-bold);
  color: var(--text-strong);
  line-height: var(--n-lh-tight);
}
.about-badge {
  align-self: flex-start;
  font-size: var(--n-fs-xs);
  font-weight: var(--n-fw-semibold);
  letter-spacing: 0.4px;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--border-focus);
  border-radius: var(--radius-sm);
  padding: 2px 8px;
}

/* —— 说明文案 —— */
.about-intro {
  margin: 0;
  font-size: var(--n-fs-lg);
  line-height: var(--n-lh-base);
  color: var(--text-primary);
}
.about-intro strong {
  color: var(--accent);
  font-weight: var(--n-fw-semibold);
}

/* —— 收款码区 —— */
.donate-row {
  display: flex;
  gap: var(--n-space-5);
  flex-wrap: wrap;
  justify-content: center;
}
.donate-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--n-space-3);
  padding: var(--n-space-5);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  cursor: zoom-in;
  transition: var(--transition);
}
.donate-item:hover {
  border-color: var(--n-border-strong);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

/* 二维码卡片：保留纯白底以保证可扫，主题边框 / 圆角统一 */
.donate-card {
  width: 200px;
  height: 200px;
  padding: 10px;
  box-sizing: border-box;
  background: #fff;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: var(--transition);
}
.donate-item:hover .donate-card {
  transform: scale(1.015);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}
.donate-qr {
  max-width: 100%;
  max-height: 100%;
  display: block;
}
.donate-name {
  font-size: var(--n-fs-lg);
  font-weight: var(--n-fw-semibold);
  color: var(--text-strong);
}
.donate-tip {
  font-size: var(--n-fs-sm);
  color: var(--text-secondary);
}

/* —— 底部说明 —— */
.about-foot {
  margin: 0;
  font-size: var(--n-fs-sm);
  line-height: var(--n-lh-base);
  color: var(--text-muted);
  text-align: center;
}

/* —— 放大对话框内图片 —— */
.dialog-qr {
  width: 100%;
  display: block;
  border-radius: var(--radius-sm);
}

/* —— 响应式 —— */
@media (max-width: 560px) {
  .donate-card {
    width: 150px;
    height: 150px;
  }
  .about-card {
    padding: var(--n-space-5);
  }
}
</style>
