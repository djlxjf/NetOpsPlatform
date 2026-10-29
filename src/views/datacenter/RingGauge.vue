<template>
  <div
    class="ring-gauge"
    :class="{ 'is-loading': loading, 'is-muted': disabled }"
    :style="{ '--ring-size': sizePx }"
    role="img"
    :aria-label="ariaLabel"
  >
    <svg viewBox="0 0 100 100" class="ring-svg" aria-hidden="true">
      <circle cx="50" cy="50" r="42" class="ring-track" />
      <circle
        cx="50" cy="50" r="42"
        class="ring-value"
        :style="{ stroke: strokeColor }"
        :stroke-dasharray="circ"
        :stroke-dashoffset="offset"
      />
    </svg>
    <div class="ring-center" aria-hidden="true">
      <div class="ring-num" :style="{ color: strokeColor }">
        <template v-if="loading">--</template>
        <template v-else>{{ display }}<span class="ring-unit">{{ unit }}</span></template>
      </div>
    </div>
    <div class="ring-label" aria-hidden="true">{{ label }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  value: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  unit: { type: String, default: '' },
  label: { type: String, default: '' },
  /** 显式配色；不传时按阈值自动取语义状态色（normal/warning/fault） */
  color: { type: String, default: '' },
  decimals: { type: Number, default: 1 },
  /** 直径（px）。右列窄区域可传 66 避免溢出换行 */
  size: { type: Number, default: 84 },
  /** 占总量的比例超过该值转「预警」色，超过 badAt 转「故障」色（0~1） */
  warnAt: { type: Number, default: 0.75 },
  badAt: { type: Number, default: 0.9 },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})

const R = 42
const circ = computed(() => 2 * Math.PI * R)

const safeValue = computed(() => (Number.isFinite(props.value) ? props.value : 0))
const safeMax = computed(() => (Number.isFinite(props.max) && props.max > 0 ? props.max : 100))
const pct = computed(() => Math.min(1, Math.max(0, safeValue.value / safeMax.value)))
const offset = computed(() => circ.value * (1 - pct.value))
const display = computed(() => safeValue.value.toFixed(props.decimals))
const sizePx = computed(() => `${props.size}px`)

// 阈值配色：显式 color 优先，否则按负载比例落到设计令牌的语义状态色，
// 让「同一指标在不同页面/主题下颜色语义一致」（不再逐处硬编码十六进制）。
const strokeColor = computed(() => {
  if (props.color) return props.color
  if (props.disabled) return 'var(--dc-text-dim)'
  if (pct.value >= props.badAt) return 'var(--dc-bad)'
  if (pct.value >= props.warnAt) return 'var(--dc-warn)'
  return 'var(--dc-ok)'
})

const ariaLabel = computed(() => {
  if (props.loading) return `${props.label} 数据加载中`
  const pctText = Math.round(pct.value * 100)
  return `${props.label} ${display.value}${props.unit}，为量程的 ${pctText}%`
})
</script>

<style scoped>
.ring-gauge {
  position: relative;
  width: var(--ring-size, 84px);
  display: flex;
  flex-direction: column;
  align-items: center;
  color: inherit;
}
.ring-gauge.is-muted { opacity: 0.55; }
.ring-svg {
  width: var(--ring-size, 84px);
  height: var(--ring-size, 84px);
  transform: rotate(-90deg);
}
.ring-track {
  fill: none;
  stroke: var(--dc-surface-item, rgba(255, 255, 255, 0.08));
  stroke-width: 7;
}
.ring-value {
  fill: none;
  stroke-width: 7;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.6s var(--dc-ease, cubic-bezier(0.16, 1, 0.3, 1)), stroke 0.2s linear;
}
.ring-center {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: var(--ring-size, 84px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ring-num {
  font-size: calc(var(--ring-size, 84px) * 0.19);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.ring-unit { font-size: 0.62em; margin-left: 1px; opacity: 0.8; }
.ring-label {
  margin-top: 4px;
  color: var(--dc-text-dim);
  font-size: var(--dc-fs-sm, 12px);
  white-space: nowrap;
}
/* 加载态：环形不填充，中心显示 --，由模板控制 */
.ring-gauge.is-loading .ring-value { opacity: 0.35; }

@media (prefers-reduced-motion: reduce) {
  .ring-value { transition: none; }
}
</style>
