<script setup lang="ts">
/** TopBar - 顶栏：时钟、天气摘要、置顶、设置 */
import { ref, onMounted, onUnmounted } from 'vue';
import { isTauri } from '../../composables/isTauri';
import { useThemeStore } from '../../stores/theme';
import { useLayoutStore } from '../../stores/layout';

const themeStore = useThemeStore();
const layoutStore = useLayoutStore();

const currentTime = ref('');
const currentDate = ref('');
const isPinned = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;

function updateTime() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  currentTime.value = `${h}:${m}:${s}`;

  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const week = weekdays[now.getDay()];
  currentDate.value = `${month}月${day}日 周${week}`;
}

async function togglePin() {
  if (!isTauri()) {
    isPinned.value = !isPinned.value;
    return;
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    isPinned.value = await invoke<boolean>('toggle_always_on_top');
    // 通知全局失焦监听器当前置顶状态
    window.dispatchEvent(new CustomEvent('pin-state-change', { detail: isPinned.value }));
  } catch (err) {
    console.error('[topbar] 切换置顶失败：', err);
  }
}

onMounted(() => {
  updateTime();
  timer = setInterval(updateTime, 1000);
});

onUnmounted(() => {
  clearInterval(timer);
});
</script>

<template>
  <div class="topbar" data-tauri-drag-region>
    <div class="topbar__left">
      <span class="topbar__time">{{ currentTime }}</span>
      <span class="topbar__date">{{ currentDate }}</span>
    </div>
    <div class="topbar__right">
      <button
        class="topbar__btn"
        data-tauri-no-drag
        :class="{ 'is-active': isPinned }"
        :title="isPinned ? '取消置顶' : '窗口置顶'"
        @click="togglePin"
      >
        {{ isPinned ? '📌' : '📍' }}
      </button>
      <button
        class="topbar__btn"
        data-tauri-no-drag
        :title="themeStore.mode === 'dark' ? '切换浅色' : '切换深色'"
        @click="themeStore.toggle()"
      >
        {{ themeStore.mode === 'dark' ? '☀️' : '🌙' }}
      </button>
      <button
        class="topbar__btn"
        data-tauri-no-drag
        title="设置"
        @click="layoutStore.toggleSettings()"
      >
        ⚙️
      </button>
    </div>
  </div>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: var(--header-height);
  flex-shrink: 0;
  background: transparent;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
}
.topbar:active {
  cursor: grabbing;
}

.topbar__left {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.topbar__time {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  letter-spacing: 1px;
}

.topbar__date {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 500;
}

.topbar__right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.topbar__btn {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  transition: all 0.2s;
  opacity: 0.7;
}

.topbar__btn:hover {
  background: var(--bg-hover);
  opacity: 1;
}

.topbar__btn.is-active {
  opacity: 1;
  background: var(--accent-light);
}
</style>
