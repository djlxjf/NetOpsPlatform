<template>
  <el-dropdown trigger="click" @command="changeTheme" class="theme-switcher">
    <el-button size="small" class="theme-btn">
      <el-icon><Brush /></el-icon>
      <span class="theme-label">{{ currentThemeLabel }}</span>
      <el-icon class="el-icon--right"><ArrowDown /></el-icon>
    </el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="dark">
          <div class="theme-option">
            <el-icon v-if="currentTheme === 'dark'"><Check /></el-icon>
            <span class="theme-icon dark-icon"></span>
            暗色主题
          </div>
        </el-dropdown-item>
        <el-dropdown-item command="light">
          <div class="theme-option">
            <el-icon v-if="currentTheme === 'light'"><Check /></el-icon>
            <span class="theme-icon light-icon"></span>
            亮色主题
          </div>
        </el-dropdown-item>
        <el-dropdown-item command="auto">
          <div class="theme-option">
            <el-icon v-if="currentTheme === 'auto'"><Check /></el-icon>
            <span class="theme-icon auto-icon"></span>
            跟随系统
          </div>
        </el-dropdown-item>
        <el-dropdown-item divided command="custom">
          <div class="theme-option">
            <el-icon v-if="currentTheme === 'custom'"><Check /></el-icon>
            <span class="theme-icon custom-icon"></span>
            自定义主题色
          </div>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>

  <!-- 自定义主题色对话框 -->
  <el-dialog v-model="showCustomDialog" title="自定义主题色" width="400px" class="theme-custom-dialog">
    <div class="color-options">
      <div 
        v-for="color in colorOptions" 
        :key="color.value"
        class="color-option"
        :class="{ active: selectedColor === color.value }"
        :style="{ backgroundColor: color.hex }"
        @click="selectedColor = color.value"
      >
        <el-icon v-if="selectedColor === color.value"><Check /></el-icon>
      </div>
    </div>
    <div class="theme-preview">
      <p class="preview-label">预览:</p>
      <div class="preview-button" :style="{ backgroundColor: currentPreviewColor }">
        主题色预览
      </div>
    </div>
    <template #footer>
      <el-button @click="showCustomDialog = false">取消</el-button>
      <el-button type="primary" @click="applyCustomTheme">应用</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Brush, ArrowDown, Check } from '@element-plus/icons-vue'

const currentTheme = ref('dark')
const showCustomDialog = ref(false)
const selectedColor = ref('blue')

const colorOptions = [
  { label: '蓝色', value: 'blue', hex: '#38bdf8' },
  { label: '绿色', value: 'green', hex: '#22c55e' },
  { label: '紫色', value: 'purple', hex: '#c586c0' },
  { label: '橙色', value: 'orange', hex: '#ce9178' },
  { label: '红色', value: 'red', hex: '#f14c4c' },
]

const currentThemeLabel = computed(() => {
  const labels = {
    'dark': '暗色',
    'light': '亮色',
    'auto': '自动',
    'custom': '自定义'
  }
  return labels[currentTheme.value] || '暗色'
})

const currentPreviewColor = computed(() => {
  const color = colorOptions.find(c => c.value === selectedColor.value)
  return color ? color.hex : '#22c55e'
})

// 应用主题
function applyTheme(theme) {
  const html = document.documentElement
  
  // 添加过渡动画
  document.body.classList.add('theme-transitioning')
  
  if (theme === 'auto') {
    // 跟随系统
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    html.setAttribute('data-theme', 'auto')
    
    // 监听系统主题变化
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (currentTheme.value === 'auto') {
        // 主题会在 CSS 中自动切换
      }
    })
  } else {
    html.setAttribute('data-theme', theme)
  }
  
  currentTheme.value = theme
  
  // 保存到 localStorage
  localStorage.setItem('netops-theme', theme)
  
  // 移除过渡动画
  setTimeout(() => {
    document.body.classList.remove('theme-transitioning')
  }, 300)
}

function changeTheme(command) {
  if (command === 'custom') {
    showCustomDialog.value = true
  } else {
    applyTheme(command)
  }
}

function applyCustomTheme() {
  const html = document.documentElement
  html.setAttribute('data-theme', 'custom')
  html.setAttribute('data-primary-color', selectedColor.value)
  
  currentTheme.value = 'custom'
  localStorage.setItem('netops-theme', 'custom')
  localStorage.setItem('netops-primary-color', selectedColor.value)
  
  showCustomDialog.value = false
  
  // 添加过渡动画
  document.body.classList.add('theme-transitioning')
  setTimeout(() => {
    document.body.classList.remove('theme-transitioning')
  }, 300)
}

// 初始化主题
onMounted(() => {
  const savedTheme = localStorage.getItem('netops-theme') || 'dark'
  const savedColor = localStorage.getItem('netops-primary-color') || 'blue'
  
  if (savedTheme === 'custom') {
    selectedColor.value = savedColor
    applyCustomTheme()
  } else {
    applyTheme(savedTheme)
  }
})
</script>

<style scoped>
.theme-switcher {
  display: inline-block;
}

.theme-btn {
  display: flex;
  align-items: center;
  gap: 6px;
}

.theme-label {
  font-size: 12px;
}

.theme-option {
  display: flex;
  align-items: center;
  gap: 8px;
}

.theme-icon {
  width: 16px;
  height: 16px;
  border-radius: 4px;
}

.dark-icon {
  background: #1e1e1e;
  border: 1px solid #444;
}

.light-icon {
  background: #ffffff;
  border: 1px solid #ddd;
}

.auto-icon {
  background: linear-gradient(45deg, #1e1e1e 50%, #ffffff 50%);
  border: 1px solid #888;
}

.custom-icon {
  background: linear-gradient(45deg, var(--accent), var(--info), var(--purple));
  border: 1px solid var(--border-strong);
}

.color-options {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
  margin-bottom: 20px;
}

.color-option {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 20px;
  transition: transform 0.2s, box-shadow 0.2s;
}

.color-option:hover {
  transform: scale(1.1);
}

.color-option.active {
  box-shadow: 0 0 0 3px var(--accent);
}

.theme-preview {
  margin-top: 16px;
  padding: 16px;
  background: var(--bg-glass-strong);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.preview-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.preview-button {
  padding: 10px 20px;
  border-radius: var(--radius-sm);
  color: white;
  font-size: 14px;
  text-align: center;
  transition: background-color 0.3s;
}
</style>
