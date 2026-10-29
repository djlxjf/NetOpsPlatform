import { ref, onMounted, onUnmounted } from 'vue'

/**
 * 响应式断点配置（基于 Bootstrap 5）
 */
export const breakpoints = {
  xs: 576,   // 超小屏幕（手机）
  sm: 768,   // 小屏幕（平板）
  md: 992,   // 中等屏幕（小桌面）
  lg: 1200,  // 大屏幕（大桌面）
  xl: 1400   // 超大屏幕
}

/**
 * 响应式设计 Composable
 * @returns {Object} 响应式状态和方法
 */
export function useResponsive() {
  const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1024)
  const windowHeight = ref(typeof window !== 'undefined' ? window.innerHeight : 768)
  
  // 断点检测
  const isXs = ref(windowWidth.value < breakpoints.xs)
  const isSm = ref(windowWidth.value >= breakpoints.xs && windowWidth.value < breakpoints.sm)
  const isMd = ref(windowWidth.value >= breakpoints.sm && windowWidth.value < breakpoints.md)
  const isLg = ref(windowWidth.value >= breakpoints.md && windowWidth.value < breakpoints.lg)
  const isXl = ref(windowWidth.value >= breakpoints.lg)
  
  // 常用设备检测
  const isMobile = ref(windowWidth.value < breakpoints.sm)
  const isTablet = ref(windowWidth.value >= breakpoints.sm && windowWidth.value < breakpoints.md)
  const isDesktop = ref(windowWidth.value >= breakpoints.md)
  const isLargeDesktop = ref(windowWidth.value >= breakpoints.lg)
  
  // 更新所有响应式状态
  function updateResponsiveState() {
    if (typeof window === 'undefined') return
    
    windowWidth.value = window.innerWidth
    windowHeight.value = window.innerHeight
    
    isXs.value = windowWidth.value < breakpoints.xs
    isSm.value = windowWidth.value >= breakpoints.xs && windowWidth.value < breakpoints.sm
    isMd.value = windowWidth.value >= breakpoints.sm && windowWidth.value < breakpoints.md
    isLg.value = windowWidth.value >= breakpoints.md && windowWidth.value < breakpoints.lg
    isXl.value = windowWidth.value >= breakpoints.lg
    
    isMobile.value = windowWidth.value < breakpoints.sm
    isTablet.value = windowWidth.value >= breakpoints.sm && windowWidth.value < breakpoints.md
    isDesktop.value = windowWidth.value >= breakpoints.md
    isLargeDesktop.value = windowWidth.value >= breakpoints.lg
  }
  
  // 防抖处理
  let resizeTimer = null
  function handleResize() {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(updateResponsiveState, 150)
  }
  
  onMounted(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize)
      updateResponsiveState()
    }
  })
  
  onUnmounted(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', handleResize)
      if (resizeTimer) clearTimeout(resizeTimer)
    }
  })
  
  /**
   * 获取当前断点名称
   */
  function getCurrentBreakpoint() {
    if (isXs.value) return 'xs'
    if (isSm.value) return 'sm'
    if (isMd.value) return 'md'
    if (isLg.value) return 'lg'
    return 'xl'
  }
  
  /**
   * 检查是否在指定断点范围内
   * @param {string} breakpoint - 断点名称 (xs, sm, md, lg, xl)
   * @param {string} direction - 方向 ('up', 'down', 'only')
   */
  function matchBreakpoint(breakpoint, direction = 'only') {
    const bp = breakpoints[breakpoint]
    if (!bp) return false
    
    switch (direction) {
      case 'up':
        return windowWidth.value >= bp
      case 'down':
        return windowWidth.value < bp
      case 'only':
        if (breakpoint === 'xl') return windowWidth.value >= bp
        const nextBp = Object.entries(breakpoints).find(([_, val]) => val > bp)
        return nextBp 
          ? windowWidth.value >= bp && windowWidth.value < nextBp[1]
          : windowWidth.value >= bp
      default:
        return false
    }
  }
  
  return {
    windowWidth,
    windowHeight,
    isXs,
    isSm,
    isMd,
    isLg,
    isXl,
    isMobile,
    isTablet,
    isDesktop,
    isLargeDesktop,
    getCurrentBreakpoint,
    matchBreakpoint
  }
}

export default useResponsive
