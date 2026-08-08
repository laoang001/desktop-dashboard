<script setup lang="ts">
/** Home - 桌面挂件：Tab切换布局 + 整合天气时钟头部 */
import { ref, computed, onMounted, onUnmounted, reactive, defineAsyncComponent } from 'vue';
import type { Component } from 'vue';
import { isTauri } from '../composables/isTauri';
import { isMobile } from '../composables/usePlatform';
import { useThemeStore } from '../stores/theme';
import { useLayoutStore } from '../stores/layout';
import { getWeather, searchCity } from '../composables/useWeather';
import { getSetting, setSetting } from '../composables/useDatabase';
import { getSyncConfigDecoded, syncNow } from '../sync';
import BaseModal from './common/BaseModal.vue';
import MobileShell from './MobileShell.vue';
import Icon from './Icon.vue';
import type { WeatherData, CityInfo } from '../types';

const themeStore = useThemeStore();
const layoutStore = useLayoutStore();

/* 移动端检测（响应式，窗口尺寸变化时更新） */
const mobile = ref(isMobile());
function onResize() { mobile.value = isMobile(); }
onMounted(() => window.addEventListener('resize', onResize));
onUnmounted(() => window.removeEventListener('resize', onResize));

/* ===== 模块组件（异步加载 + 降级处理）===== */
const AsyncLoading = { template: '<div class="async-state async-loading">加载中…</div>' };
const AsyncError = { template: '<div class="async-state async-error">模块加载失败，请刷新重试</div>' };

function asyncComp(loader: () => Promise<{ default: Component }>) {
  return defineAsyncComponent({
    loader,
    loadingComponent: AsyncLoading,
    errorComponent: AsyncError,
    delay: 200,
    timeout: 15000,
  });
}

const ScheduleCard = asyncComp(() => import('../modules/schedule/ScheduleCard.vue'));
const TodoCard = asyncComp(() => import('../modules/todo/TodoCard.vue'));
const TimeTrackerCard = asyncComp(() => import('../modules/time-tracker/TimeTrackerCard.vue'));
const NotesCard = asyncComp(() => import('../modules/notes/NotesCard.vue'));
const AIAssistantCard = asyncComp(() => import('../modules/ai-assistant/AIAssistantCard.vue'));
const AccountingCard = asyncComp(() => import('../modules/accounting/AccountingCard.vue'));

/* ===== Tab 导航 ===== */
type TabKey = 'schedule' | 'todo' | 'time' | 'notes' | 'accounting' | 'ai';
const activeTab = ref<TabKey>('todo');
const TABS: { key: TabKey; icon: string; label: string; comp: Component }[] = [
  { key: 'schedule', icon: 'calendar', label: '日程', comp: ScheduleCard },
  { key: 'todo', icon: 'todo', label: '任务', comp: TodoCard },
  { key: 'time', icon: 'clock', label: '时间', comp: TimeTrackerCard },
  { key: 'accounting', icon: 'wallet', label: '记账', comp: AccountingCard },
  { key: 'notes', icon: 'pen', label: '日记', comp: NotesCard },
  { key: 'ai', icon: 'ai', label: 'AI', comp: AIAssistantCard },
];
const activeComp = computed(() => TABS.find(t => t.key === activeTab.value)?.comp);

/* ===== 时钟 ===== */
const now = ref(new Date());
let clockTimer: number | undefined;

const timeText = computed(() => {
  const d = now.value;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
});

const dateText = computed(() => {
  const d = now.value;
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${d.getMonth() + 1}月${d.getDate()}日 周${weekdays[d.getDay()]}`;
});

/* ===== 进度环 ===== */
const RING_R = 24;
const RING_CIRC = 2 * Math.PI * RING_R;
const progress = reactive({ day: 0, week: 0, month: 0, year: 0 });

function updateProgress() {
  const d = now.value;
  const dayMs = 86400000;
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  progress.day = (d.getTime() - dayStart.getTime()) / dayMs;
  const dayOfWeek = (d.getDay() + 6) % 7;
  const weekStart = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayOfWeek);
  progress.week = (d.getTime() - weekStart.getTime()) / (7 * dayMs);
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
  const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  progress.month = (d.getTime() - monthStart.getTime()) / (monthEnd.getTime() - monthStart.getTime());
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const yearEnd = new Date(d.getFullYear() + 1, 0, 1);
  progress.year = (d.getTime() - yearStart.getTime()) / (yearEnd.getTime() - yearStart.getTime());
}

const rings = computed(() => [
  { key: 'day', label: '日', value: progress.day, color: '#6366f1' },
  { key: 'week', label: '周', value: progress.week, color: '#8b5cf6' },
  { key: 'month', label: '月', value: progress.month, color: '#ec4899' },
  { key: 'year', label: '年', value: progress.year, color: '#14b8a6' },
]);

function clamp(p: number) { return Math.max(0, Math.min(1, p)); }
function dashArray(p: number) { return `${clamp(p) * RING_CIRC} ${RING_CIRC}`; }
function pct(p: number) { return `${(clamp(p) * 100).toFixed(1)}%`; }

/* ===== 天气 ===== */
interface SavedCity { name: string; latitude: number; longitude: number; }
const DEFAULT_CITY: SavedCity = { name: '北京', latitude: 39.9, longitude: 116.4 };
const weather = ref<WeatherData | null>(null);
const city = ref<SavedCity>({ ...DEFAULT_CITY });
const weatherModalVisible = ref(false);
const searchQuery = ref('');
const searchResults = ref<CityInfo[]>([]);
const searching = ref(false);

async function loadWeather() {
  try {
    weather.value = await getWeather(city.value.latitude, city.value.longitude);
  } catch { /* ignore */ }
}

async function doSearch() {
  const q = searchQuery.value.trim();
  if (!q) return;
  searching.value = true;
  try {
    searchResults.value = await searchCity(q);
  } catch {
    searchResults.value = [];
  } finally {
    searching.value = false;
  }
}

async function selectCity(c: CityInfo) {
  city.value = { name: c.name, latitude: c.latitude, longitude: c.longitude };
  weatherModalVisible.value = false;
  await setSetting('weather_city', JSON.stringify(city.value));
  loadWeather();
}

/* ===== 置顶 ===== */
const isPinned = ref(false);
async function togglePin() {
  if (!isTauri()) { isPinned.value = !isPinned.value; return; }
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    isPinned.value = await invoke<boolean>('toggle_always_on_top');
  } catch (e) { console.error(e); }
}

/* ===== 同步 ===== */
const syncState = ref<'idle' | 'syncing' | 'done'>('idle');
let syncConfig: Awaited<ReturnType<typeof getSyncConfigDecoded>> = null;

async function triggerSync() {
  if (syncState.value === 'syncing') return;
  const cfg = syncConfig || await getSyncConfigDecoded();
  if (!cfg) {
    layoutStore.toggleSettings();
    return;
  }
  syncState.value = 'syncing';
  syncConfig = cfg;
  try {
    await syncNow(cfg);
    syncState.value = 'done';
    setTimeout(() => { syncState.value = 'idle'; }, 3000);
  } catch {
    syncState.value = 'idle';
  }
}

/* ===== 生命周期 ===== */
onMounted(async () => {
  updateProgress();
  clockTimer = window.setInterval(() => {
    now.value = new Date();
    updateProgress();
  }, 1000);

  try {
    const saved = await getSetting('weather_city');
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<SavedCity>;
      if (parsed?.latitude && parsed?.longitude) {
        city.value = { name: parsed.name || '北京', latitude: parsed.latitude, longitude: parsed.longitude };
      }
    }
  } catch { /* ignore */ }
  loadWeather();
});

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer);
});
</script>

<template>
  <!-- 移动端布局 -->
  <MobileShell v-if="mobile" />

  <!-- 桌面端布局 -->
  <div v-else class="widget">
    <!-- 头部：时间 + 天气 + 控制 -->
    <div class="widget-header" data-tauri-drag-region>
      <div class="wh-left">
        <span class="wh-time">{{ timeText }}</span>
        <span class="wh-date">{{ dateText }}</span>
      </div>
      <div class="wh-right">
        <button class="wh-weather-btn" @click="weatherModalVisible = true" title="点击切换城市">
          <span v-if="weather" class="wh-weather-info">
            <span class="wh-w-icon">{{ weather.icon }}</span>
            <span class="wh-w-temp">{{ weather.temperature }}°</span>
            <span class="wh-w-city">{{ city.name }}</span>
          </span>
          <span v-else class="wh-w-loading">···</span>
        </button>
        <button class="wh-btn" :class="{ 'is-active': isPinned }" data-tauri-no-drag @click="togglePin" title="置顶">
          <Icon name="pin" :size="16" />
        </button>
        <button class="wh-btn" data-tauri-no-drag @click="themeStore.toggle()" :title="themeStore.mode === 'dark' ? '浅色' : '深色'">
          <Icon :name="themeStore.mode === 'dark' ? 'sun' : 'moon'" :size="16" />
        </button>
        <button
          class="wh-btn wh-sync-btn"
          :class="{ 'wh-sync--syncing': syncState === 'syncing', 'wh-sync--done': syncState === 'done' }"
          data-tauri-no-drag
          @click="triggerSync"
          :title="syncState === 'syncing' ? '同步中...' : '手动同步'"
        >
          <Icon name="sync" :size="16" :class="{ 'spin': syncState === 'syncing' }" />
        </button>
        <button class="wh-btn" data-tauri-no-drag @click="layoutStore.toggleSettings()" title="设置">
          <Icon name="settings" :size="16" />
        </button>
      </div>
    </div>

    <!-- 进度环条 -->
    <div class="widget-rings">
      <div v-for="r in rings" :key="r.key" class="wr-item">
        <div class="wr-ring-wrap">
          <svg viewBox="0 0 60 60" class="wr-ring-svg">
            <circle cx="30" cy="30" :r="RING_R" class="wr-ring-bg" />
            <circle
              cx="30" cy="30" :r="RING_R"
              class="wr-ring-fg"
              :stroke="r.color"
              :stroke-dasharray="dashArray(r.value)"
              transform="rotate(-90 30 30)"
            />
          </svg>
          <span class="wr-pct" :style="{ color: r.color }">{{ pct(r.value) }}</span>
        </div>
        <span class="wr-label">{{ r.label }}</span>
      </div>
    </div>

    <!-- Tab 导航 -->
    <div class="widget-tabs">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        class="wt-tab"
        :class="{ 'wt-tab--active': activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        <Icon :name="tab.icon" :size="14" />
        <span class="wt-label">{{ tab.label }}</span>
      </button>
    </div>

    <!-- 内容区 -->
    <div class="widget-content">
      <KeepAlive>
        <component :is="activeComp" :key="activeTab" />
      </KeepAlive>
    </div>

    <!-- 城市搜索弹窗 -->
    <BaseModal :visible="weatherModalVisible" title="切换城市" width="380px" @close="weatherModalVisible = false">
      <div class="ws-search">
        <input v-model="searchQuery" class="ws-input" placeholder="输入城市名搜索" @keyup.enter="doSearch" />
        <button class="ws-btn" :disabled="searching" @click="doSearch">
          {{ searching ? '搜索中…' : '搜索' }}
        </button>
      </div>
      <ul class="ws-results">
        <li v-for="(c, i) in searchResults" :key="i" class="ws-result" @click="selectCity(c)">
          <span>{{ c.name }}</span>
          <span class="ws-country">{{ c.country }}</span>
        </li>
        <li v-if="!searching && searchQuery && searchResults.length === 0" class="ws-empty">无匹配结果</li>
      </ul>
    </BaseModal>
  </div>
</template>

<style scoped>
.widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* ===== 头部 ===== */
.widget-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  height: 44px;
  flex-shrink: 0;
  gap: 8px;
}

.wh-left {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.wh-time {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  letter-spacing: 1px;
}

.wh-date {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 500;
}

.wh-right {
  display: flex;
  align-items: center;
  gap: 2px;
}

.wh-weather-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: background 0.2s;
  display: flex;
  align-items: center;
}

.wh-weather-btn:hover { background: var(--bg-hover); }

.wh-weather-info {
  display: flex;
  align-items: center;
  gap: 4px;
}

.wh-w-icon { font-size: 16px; line-height: 1; }
.wh-w-temp {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.wh-w-city { font-size: 11px; color: var(--text-secondary); }
.wh-w-loading { font-size: 13px; color: var(--text-tertiary); }

.wh-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  transition: all 0.2s;
  opacity: 0.65;
  display: flex;
  align-items: center;
  justify-content: center;
}

.wh-btn:hover { background: var(--bg-hover); opacity: 1; }
.wh-btn.is-active { opacity: 1; color: var(--accent-color); }

/* 同步旋转动画 */
.spin {
  animation: wh-spin 0.8s linear infinite;
}
@keyframes wh-spin { to { transform: rotate(360deg); } }

/* ===== 进度环条 ===== */
.widget-rings {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 4px 16px 8px;
  flex-shrink: 0;
}

.wr-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.wr-ring-wrap {
  position: relative;
  width: 60px;
  height: 60px;
}

.wr-ring-svg {
  width: 60px;
  height: 60px;
  display: block;
}

.wr-ring-bg {
  fill: none;
  stroke: var(--bg-hover);
  stroke-width: 4.5;
}

.wr-ring-fg {
  fill: none;
  stroke-width: 4.5;
  stroke-linecap: round;
  transition: stroke-dasharray 0.6s ease;
}

.wr-pct {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  letter-spacing: -0.3px;
}

.wr-label {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 500;
}

/* ===== Tab 导航 ===== */
.widget-tabs {
  display: flex;
  flex-shrink: 0;
  padding: 0 12px;
  gap: 2px;
  border-bottom: 1px solid var(--border-color);
}

.wt-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 8px 4px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 12px;
  transition: color 0.2s, border-color 0.2s;
  margin-bottom: -1px;
  font-family: inherit;
}

.wt-tab:hover { color: var(--text-primary); }

.wt-tab--active {
  color: var(--accent-color);
  border-bottom-color: var(--accent-color);
  font-weight: 600;
}

.wt-label { font-weight: inherit; }

/* ===== 内容区 ===== */
.widget-content {
  flex: 1;
  overflow: hidden;
  padding: 8px 12px 12px;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.widget-content > :deep(*) {
  flex: 1;
  min-height: 0;
}

.async-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 13px;
  color: var(--text-tertiary);
}

.async-error {
  color: #ef4444;
}

/* ===== 城市搜索弹窗 ===== */
.ws-search {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.ws-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  font-family: inherit;
}

.ws-input:focus { border-color: var(--accent-color); }

.ws-btn {
  padding: 8px 16px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent-color);
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
  font-family: inherit;
}

.ws-btn:hover:not(:disabled) { background: var(--accent-hover); }
.ws-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.ws-results {
  list-style: none;
  max-height: 280px;
  overflow-y: auto;
}

.ws-result {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.2s;
  color: var(--text-primary);
  font-weight: 500;
}

.ws-result:hover { background: var(--bg-hover); }

.ws-country {
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 400;
}

.ws-empty {
  padding: 16px;
  text-align: center;
  color: var(--text-tertiary);
}
</style>
