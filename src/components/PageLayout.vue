<!--
  PageLayout - 页面标题卡统一规范组件
  所有菜单页面的「外框 + 标题 + 副标题 + 操作区」均由本组件承载。
  外框尺寸、字号、字体、颜色全部从 main.scss 的 :root CSS 变量读取：
    --page-header-*    外框（背景/边框/圆角/阴影/内边距/最小高度/间距）
    --page-title-*     主标题（字号/字重/行高/颜色/字距）
    --page-subtitle-*  副标题（字号/字重/颜色/上边距/字距）
    --page-title-decoration-*  左侧装饰竖条（宽度/高度）
    --page-actions-gap 右侧操作按钮间距
  调整规范只改 main.scss，不要在单个页面里覆盖这些值。
-->
<template>
  <div class="page-layout">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="page-title-area">
        <div class="title-decoration"></div>
        <div class="title-content">
          <h1 class="page-title">{{ title }}</h1>
          <span class="page-subtitle">{{ subtitle }}</span>
        </div>
      </div>
      <div class="page-actions">
        <slot name="actions"></slot>
      </div>
    </div>
    
    <!-- 页面内容 -->
    <div class="page-content">
      <slot></slot>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    required: true
  },
  subtitle: {
    type: String,
    default: ''
  }
})
</script>

<style lang="scss" scoped>
/* ============================================================
   页面标题卡统一规范 - 引用 main.scss 中定义的 CSS 变量
   不要在单个页面里覆盖这些值；要调整请改 src/styles/main.scss
   ============================================================ */

.page-layout {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--bg-base);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text",
    "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
    sans-serif;

  @media (max-width: 768px) {
    padding: 12px;
    gap: 12px;
  }
}

/* —— 标题卡与内容区统一入场动画（配合路由切换） —— */
.page-header {
  animation: fade-up 0.38s var(--ease-out-expo) both;
}

.page-content {
  animation: fade-up 0.42s var(--ease-out-expo) both;
  animation-delay: 0.06s;
}

/* —— 外框（卡片容器） —— */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--page-header-gap);
  flex-wrap: wrap;
  min-height: var(--page-header-min-height);
  padding: var(--page-header-padding-y) var(--page-header-padding-x);
  background: var(--page-header-bg);
  border: var(--page-header-border);
  border-radius: var(--page-header-radius);
  box-shadow: var(--page-header-shadow);
  transition: var(--transition);

  &:hover {
    border-color: var(--border-strong);
    box-shadow: var(--shadow-lg);
  }

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    padding: var(--page-header-padding-y-mobile) var(--page-header-padding-x-mobile);
    min-height: 0;
  }
}

/* —— 左侧标题区 —— */
.page-title-area {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 16px;
}

/* —— 左侧渐变竖条（装饰） —— */
.title-decoration {
  width: var(--page-title-decoration-width);
  height: var(--page-title-decoration-height);
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  border-radius: var(--page-title-decoration-radius);
  flex-shrink: 0;
  box-shadow: 0 0 10px var(--accent-glow);

  @media (max-width: 768px) {
    height: var(--page-title-decoration-height-mobile);
  }
}

.title-content {
  display: flex;
  flex-direction: column;
}

/* —— 主标题 —— */
.page-title {
  font-family: inherit;
  font-size: var(--page-title-font-size);
  font-weight: var(--page-title-font-weight);
  color: var(--page-title-color);
  margin: 0;
  line-height: var(--page-title-line-height);
  letter-spacing: var(--page-title-letter-spacing);
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: var(--transition);

  &:hover {
    color: #ffffff;
  }

  @media (max-width: 768px) {
    font-size: var(--page-title-font-size-mobile);
  }
}

/* —— 副标题 —— */
.page-subtitle {
  font-family: inherit;
  font-size: var(--page-subtitle-font-size);
  font-weight: var(--page-subtitle-font-weight);
  color: var(--page-subtitle-color);
  margin-top: var(--page-subtitle-margin-top);
  display: block;
  transition: var(--transition);
  letter-spacing: var(--page-subtitle-letter-spacing);

  &:hover {
    color: var(--accent);
  }

  @media (max-width: 768px) {
    font-size: var(--page-subtitle-font-size-mobile);
  }
}

/* —— 右侧操作按钮区 —— */
.page-actions {
  display: flex;
  align-items: center;
  gap: var(--page-actions-gap);
  flex-wrap: wrap;
}

/* —— 页面内容区 —— */
/* flex:1 撑满剩余高度，供需要全高布局的页面（如拓扑画布）使用 */
.page-content {
  flex: 1;
  min-height: 0;
}
</style>
