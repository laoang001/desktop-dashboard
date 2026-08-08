<script setup lang="ts">
import { ref, computed, reactive, onMounted, onUnmounted } from 'vue';
import BaseCard from '../../components/common/BaseCard.vue';
import BaseModal from '../../components/common/BaseModal.vue';
import { getWeather, searchCity } from '../../composables/useWeather';
import { getSetting, setSetting } from '../../composables/useDatabase';
import type { WeatherData, CityInfo } from '../../types';

/* ===== 时钟 ===== */
const now = ref(new Date());
let clockTimer: number | undefined;

const timeText = computed(() => {
  const d = now.value;
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
});

/* ===== 环形进度 ===== */
const RING_R = 38;
const RING_CIRC = 2 * Math.PI * RING_R;

const progress = reactive({
  day: 0,
  week: 0,
  month: 0,
  year: 0,
});

function updateProgress() {
  const d = now.value;
  const dayMs = 24 * 60 * 60 * 1000;
  // 今日
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  progress.day = (d.getTime() - dayStart.getTime()) / dayMs;
  // 本周（周一开始）
  const dayOfWeek = (d.getDay() + 6) % 7; // 0 = 周一
  const weekStart = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayOfWeek);
  progress.week = (d.getTime() - weekStart.getTime()) / (7 * dayMs);
  // 本月
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
  const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  progress.month = (d.getTime() - monthStart.getTime()) / (monthEnd.getTime() - monthStart.getTime());
  // 本年
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const yearEnd = new Date(d.getFullYear() + 1, 0, 1);
  progress.year = (d.getTime() - yearStart.getTime()) / (yearEnd.getTime() - yearStart.getTime());
}

const rings = computed(() => [
  { key: 'day', label: '今日', value: progress.day, color: '#6366f1', glow: 'rgba(99, 102, 241, 0.35)' },
  { key: 'week', label: '本周', value: progress.week, color: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.35)' },
  { key: 'month', label: '本月', value: progress.month, color: '#ec4899', glow: 'rgba(236, 72, 153, 0.35)' },
  { key: 'year', label: '本年', value: progress.year, color: '#14b8a6', glow: 'rgba(20, 184, 166, 0.35)' },
]);

function clamp(p: number) {
  return Math.max(0, Math.min(1, p));
}

function dashArray(p: number) {
  const v = clamp(p) * RING_CIRC;
  return `${v} ${RING_CIRC}`;
}

function percentText(p: number) {
  return `${Math.round(clamp(p) * 100)}%`;
}

/* ===== 天气 ===== */
interface SavedCity {
  name: string;
  latitude: number;
  longitude: number;
}

const DEFAULT_CITY: SavedCity = { name: '北京', latitude: 39.9, longitude: 116.4 };

const weather = ref<WeatherData | null>(null);
const city = ref<SavedCity>({ ...DEFAULT_CITY });
const weatherError = ref('');
const weatherLoading = ref(false);

async function loadWeather() {
  weatherLoading.value = true;
  weatherError.value = '';
  try {
    weather.value = await getWeather(city.value.latitude, city.value.longitude);
  } catch (e) {
    weatherError.value = (e as Error).message;
  } finally {
    weatherLoading.value = false;
  }
}

/* ===== 城市搜索 ===== */
const modalVisible = ref(false);
const searchQuery = ref('');
const searchResults = ref<CityInfo[]>([]);
const searching = ref(false);

function openModal() {
  searchQuery.value = '';
  searchResults.value = [];
  modalVisible.value = true;
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
  modalVisible.value = false;
  await setSetting('weather_city', JSON.stringify(city.value));
  loadWeather();
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
      if (parsed && typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
        city.value = {
          name: parsed.name || '北京',
          latitude: parsed.latitude,
          longitude: parsed.longitude,
        };
      }
    }
  } catch {
    // 解析失败使用默认城市
  }
  loadWeather();
});

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer);
});
</script>

<template>
  <BaseCard :wide="true" class="weather-clock-card">
    <div class="wcc-main">
      <div class="wcc-clock-area">
        <div class="wcc-clock">{{ timeText }}</div>
        <button class="wcc-city" title="点击切换城市" @click="openModal">
          <span class="wcc-city-icon">📍</span>
          <span class="wcc-city-name">{{ city.name }}</span>
        </button>
      </div>
      <div class="wcc-rings">
        <div v-for="r in rings" :key="r.key" class="wcc-ring">
          <div class="wcc-ring-wrap">
            <svg viewBox="0 0 90 90" class="wcc-ring-svg">
              <defs>
                <linearGradient :id="'grad-' + r.key" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" :stop-color="r.color" />
                  <stop offset="100%" :stop-color="r.color" stop-opacity="0.55" />
                </linearGradient>
              </defs>
              <circle cx="45" cy="45" :r="RING_R" class="wcc-ring-bg" />
              <circle
                cx="45"
                cy="45"
                :r="RING_R"
                class="wcc-ring-fg"
                :stroke="'url(#grad-' + r.key + ')'"
                :stroke-dasharray="dashArray(r.value)"
                transform="rotate(-90 45 45)"
                :style="{ filter: `drop-shadow(0 0 4px ${r.glow})` }"
              />
            </svg>
            <span class="wcc-ring-pct" :style="{ color: r.color }">{{ percentText(r.value) }}</span>
          </div>
          <span class="wcc-ring-label">{{ r.label }}</span>
        </div>
      </div>
    </div>

    <div class="wcc-weather">
      <template v-if="weather">
        <span class="wcc-w-icon">{{ weather.icon }}</span>
        <span class="wcc-w-temp">{{ weather.temperature }}°</span>
        <span class="wcc-w-desc">{{ weather.description }}</span>
        <span class="wcc-w-sep">·</span>
        <span class="wcc-w-item">体感 {{ weather.apparentTemperature }}°</span>
        <span class="wcc-w-item">湿度 {{ weather.humidity }}%</span>
        <span class="wcc-w-item">风速 {{ weather.windSpeed }}m/s</span>
      </template>
      <span v-else-if="weatherLoading" class="wcc-w-hint">加载天气中…</span>
      <span v-else-if="weatherError" class="wcc-w-hint">{{ weatherError }}</span>
    </div>

    <BaseModal :visible="modalVisible" title="切换城市" width="460px" @close="modalVisible = false">
      <div class="wcc-search">
        <input
          v-model="searchQuery"
          class="wcc-search-input"
          placeholder="输入城市名搜索"
          @keyup.enter="doSearch"
        />
        <button class="wcc-search-btn" :disabled="searching" @click="doSearch">
          {{ searching ? '搜索中…' : '搜索' }}
        </button>
      </div>
      <ul class="wcc-results">
        <li
          v-for="(c, i) in searchResults"
          :key="i"
          class="wcc-result"
          @click="selectCity(c)"
        >
          <span class="wcc-result-name">{{ c.name }}</span>
          <span class="wcc-result-country">{{ c.country }}</span>
        </li>
        <li v-if="!searching && searchQuery && searchResults.length === 0" class="wcc-result-empty">
          无匹配结果
        </li>
      </ul>
    </BaseModal>
  </BaseCard>
</template>

<style scoped>
.weather-clock-card {
  gap: 4px;
}

/* 主区域：时钟 + 圆环 */
.wcc-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 12px;
}

.wcc-clock-area {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wcc-clock {
  font-size: 44px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 2px;
  line-height: 1;
  color: var(--text-primary);
  background: linear-gradient(135deg, var(--text-primary), var(--text-secondary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.wcc-city {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 13px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  transition: background 0.2s, color 0.2s;
  width: fit-content;
}

.wcc-city:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.wcc-rings {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.wcc-ring {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 86px;
}

.wcc-ring-wrap {
  position: relative;
  width: 86px;
  height: 86px;
  transition: transform 0.3s;
}

.wcc-ring-wrap:hover {
  transform: scale(1.06);
}

.wcc-ring-svg {
  width: 86px;
  height: 86px;
  display: block;
}

.wcc-ring-bg {
  fill: none;
  stroke: var(--bg-hover);
  stroke-width: 6;
}

.wcc-ring-fg {
  fill: none;
  stroke-width: 6;
  stroke-linecap: round;
  transition: stroke-dasharray 0.6s ease;
}

.wcc-ring-pct {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  letter-spacing: 0.5px;
}

.wcc-ring-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
  letter-spacing: 0.3px;
}

/* 天气信息 */
.wcc-weather {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--text-secondary);
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}

.wcc-w-icon {
  font-size: 24px;
  line-height: 1;
}

.wcc-w-temp {
  font-size: 28px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
  line-height: 1;
}

.wcc-w-desc {
  color: var(--text-primary);
  font-weight: 500;
}

.wcc-w-sep {
  color: var(--text-tertiary);
}

.wcc-w-hint {
  color: var(--text-tertiary);
  font-size: 13px;
}

/* 搜索弹窗 */
.wcc-search {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.wcc-search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.wcc-search-input:focus {
  border-color: var(--accent-color);
}

.wcc-search-btn {
  padding: 8px 16px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent-color);
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.wcc-search-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.wcc-search-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.wcc-results {
  list-style: none;
  max-height: 280px;
  overflow-y: auto;
}

.wcc-result {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.2s;
}

.wcc-result:hover {
  background: var(--bg-hover);
}

.wcc-result-name {
  color: var(--text-primary);
  font-weight: 500;
}

.wcc-result-country {
  color: var(--text-tertiary);
  font-size: 12px;
}

.wcc-result-empty {
  padding: 16px;
  text-align: center;
  color: var(--text-tertiary);
}
</style>
