<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import BaseCard from '../../components/common/BaseCard.vue';
import BaseModal from '../../components/common/BaseModal.vue';
import {
  getTimeRecordsByDate,
  createTimeRecord,
  updateTimeRecord,
  deleteTimeRecord,
  getTimeCategories,
  createTimeCategory,
  updateTimeCategory,
  deleteTimeCategory,
  getDailySummary,
  getWeeklySummary,
  getMonthlySummary,
} from './api';
import type { TimeRecord, TimeCategory } from '../../types';

type ViewMode = 'timeline' | 'clock' | 'list';
type StatPeriod = 'day' | 'week' | 'month';

const view = ref<ViewMode>('timeline');
const statPeriod = ref<StatPeriod>('day');
const currentDate = ref(getTodayDate());
const loading = ref(false);

const records = ref<TimeRecord[]>([]);
const categories = ref<TimeCategory[]>([]);
const summary = ref<{ category: string; total_duration: number }[]>([]);
const weeklyData = ref<{ date: string; category: string; total_duration: number }[]>([]);
const monthlyData = ref<{ date: string; category: string; total_duration: number }[]>([]);

/* 计时器 */
const timerActive = ref(false);
const timerCategory = ref('');
const timerDesc = ref('');
const timerStart = ref(0);
const liveSeconds = ref(0);
const nowMinutes = ref(0);

/* 富信息 tooltip */
const tooltip = ref<{ visible: boolean; x: number; y: number; record: TimeRecord | null }>({
  visible: false,
  x: 0,
  y: 0,
  record: null,
});

/* 弹窗 */
const fillVisible = ref(false);
const fillForm = ref({ start_time: '', end_time: '', category: '', description: '' });
const editVisible = ref(false);
const editForm = ref({ id: 0, category: '', description: '', start_time: '', end_time: '' });
const catMgmtVisible = ref(false);
const catForm = ref({ id: 0, key: '', name: '', color: '#8b5cf6', icon: '📝', daily_goal: 0, is_preset: 0 });

let tickHandle: ReturnType<typeof setInterval> | undefined;

/* ===== 工具函数 ===== */
function getTodayDate(): string {
  return formatDate(new Date());
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // 周一为起点
  d.setDate(d.getDate() + diff);
  return formatDate(d);
}

function getMonthStart(dateStr: string): string {
  return dateStr.slice(0, 8) + '01';
}

function getMonthEnd(dateStr: string): string {
  const y = parseInt(dateStr.slice(0, 4));
  const m = parseInt(dateStr.slice(5, 7));
  const lastDay = new Date(y, m, 0).getDate();
  return dateStr.slice(0, 8) + String(lastDay).padStart(2, '0');
}

function getWeekLabel(dateStr: string): string {
  const ws = getWeekStart(dateStr);
  const we = addDays(ws, 6);
  return `${ws.slice(5)} - ${we.slice(5)}`;
}

function getMonthLabel(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function isToday(dateStr: string): boolean {
  return dateStr === getTodayDate();
}

function fmtDuration(sec: number): string {
  if (!sec || sec < 0) return '0m';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h${m > 0 ? m + 'm' : ''}`;
  return `${m}m`;
}

function fmtTimer(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function isoToMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

function fmtTimeFromIso(iso: string | null): string {
  if (!iso) return '进行中';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getWeekdayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const labels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return labels[d.getDay()];
}

/* ===== 计算 ===== */
const categoryMap = computed(() => {
  const m = new Map<string, TimeCategory>();
  categories.value.forEach((c) => m.set(c.key, c));
  return m;
});

function colorOf(key: string): string {
  return categoryMap.value.get(key)?.color || '#94a3b8';
}

function nameOf(key: string): string {
  return categoryMap.value.get(key)?.name || key;
}

const nowPct = computed(() => (nowMinutes.value / 1440) * 100);

const segments = computed(() =>
  records.value.map((r) => {
    const startMin = isoToMinutes(r.start_time);
    const endMin = r.end_time ? isoToMinutes(r.end_time) : nowMinutes.value;
    const left = (Math.min(startMin, 1440) / 1440) * 100;
    const width = (Math.max(0, endMin - startMin) / 1440) * 100;
    return { id: r.id, left, width, color: colorOf(r.category), record: r };
  }),
);

const stats = computed(() =>
  summary.value.map((s) => {
    const cat = categoryMap.value.get(s.category);
    return {
      key: s.category,
      name: cat?.name || s.category,
      color: cat?.color || '#94a3b8',
      duration: s.total_duration || 0,
      goal: cat?.daily_goal || 0,
    };
  }),
);

const totalDuration = computed(() => stats.value.reduce((a, b) => a + b.duration, 0));
const maxDuration = computed(() => Math.max(1, ...stats.value.map((s) => s.duration)));

const goals = computed(() =>
  categories.value
    .filter((c) => c.daily_goal > 0)
    .map((c) => {
      const s = summary.value.find((x) => x.category === c.key);
      return { name: c.name, color: c.color, goal: c.daily_goal, duration: s?.total_duration || 0 };
    }),
);

function goalPct(g: { duration: number; goal: number }): number {
  return Math.min(100, g.goal > 0 ? (g.duration / g.goal) * 100 : 0);
}

function goalAchieved(g: { duration: number; goal: number }): boolean {
  return g.goal > 0 && g.duration >= g.goal;
}

function statPct(s: { duration: number }): number {
  return (s.duration / maxDuration.value) * 100;
}

function recordDuration(r: TimeRecord): number {
  if (r.duration) return r.duration;
  if (!r.end_time) {
    return Math.max(0, Math.floor((Date.now() - new Date(r.start_time).getTime()) / 1000));
  }
  return Math.max(0, Math.floor((new Date(r.end_time).getTime() - new Date(r.start_time).getTime()) / 1000));
}

/* ===== 圆形时钟视图 ===== */
const clockSegments = computed(() => {
  return records.value.map((r) => {
    const startMin = isoToMinutes(r.start_time);
    const endMin = r.end_time ? isoToMinutes(r.end_time) : nowMinutes.value;
    const startAngle = (startMin / 1440) * 360 - 90;
    const endAngle = (endMin / 1440) * 360 - 90;
    return {
      id: r.id,
      startAngle,
      endAngle,
      color: colorOf(r.category),
      record: r,
    };
  });
});

const nowAngle = computed(() => (nowMinutes.value / 1440) * 360 - 90);

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

/* ===== 周统计图表 ===== */
const weekDays = computed(() => {
  const ws = getWeekStart(currentDate.value);
  const days: { date: string; label: string; weekday: string; isWeekend: boolean; total: number; cats: { key: string; color: string; duration: number }[] }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    const dayRecords = weeklyData.value.filter((w) => w.date === d);
    const cats = dayRecords.map((w) => ({
      key: w.category,
      color: colorOf(w.category),
      duration: w.total_duration || 0,
    }));
    days.push({
      date: d,
      label: d.slice(8),
      weekday: getWeekdayLabel(d),
      isWeekend: [0, 6].includes(new Date(d + 'T00:00:00').getDay()),
      total: cats.reduce((a, b) => a + b.duration, 0),
      cats,
    });
  }
  return days;
});

const weekMaxTotal = computed(() => Math.max(1, ...weekDays.value.map((d) => d.total)));

const weekTotalDuration = computed(() => weekDays.value.reduce((a, b) => a + b.total, 0));

/* ===== 月统计图表 ===== */
const monthDays = computed(() => {
  const ms = getMonthStart(currentDate.value);
  const me = getMonthEnd(currentDate.value);
  const days: { date: string; label: string; total: number }[] = [];
  let d = ms;
  while (d <= me) {
    const dayTotal = monthlyData.value
      .filter((w) => w.date === d)
      .reduce((a, b) => a + (b.total_duration || 0), 0);
    days.push({ date: d, label: d.slice(8), total: dayTotal });
    d = addDays(d, 1);
  }
  return days;
});

const monthMaxTotal = computed(() => Math.max(1, ...monthDays.value.map((d) => d.total)));

const monthTotalDuration = computed(() => monthDays.value.reduce((a, b) => a + b.total, 0));

/* ===== 计时器 ===== */
function tick() {
  const d = new Date();
  nowMinutes.value = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  if (timerActive.value && timerStart.value) {
    liveSeconds.value = Math.floor((Date.now() - timerStart.value) / 1000);
  }
}

async function startTimer() {
  if (!timerCategory.value && categories.value.length) {
    timerCategory.value = categories.value[0].key;
  }
  if (!timerCategory.value) return;
  timerStart.value = Date.now();
  liveSeconds.value = 0;
  timerActive.value = true;
}

async function stopTimer() {
  if (!timerStart.value) return;
  const start = new Date(timerStart.value);
  const end = new Date();
  const duration = Math.floor((end.getTime() - start.getTime()) / 1000);
  await createTimeRecord({
    category: timerCategory.value,
    description: timerDesc.value.trim() || undefined,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    duration,
    date: getTodayDate(),
  });
  timerActive.value = false;
  timerStart.value = 0;
  liveSeconds.value = 0;
  timerDesc.value = '';
  await load();
}

/* 一键切换活动：计时中点其他分类 → 自动停止 + 立即开始新活动 */
async function selectCategory(key: string) {
  if (timerActive.value) {
    if (key === timerCategory.value) return;
    // 停止当前
    const start = new Date(timerStart.value);
    const end = new Date();
    const duration = Math.floor((end.getTime() - start.getTime()) / 1000);
    await createTimeRecord({
      category: timerCategory.value,
      description: timerDesc.value.trim() || undefined,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      duration,
      date: getTodayDate(),
    });
    // 立即开始新活动
    timerCategory.value = key;
    timerStart.value = Date.now();
    liveSeconds.value = 0;
    await load();
  } else {
    timerCategory.value = key;
  }
}

/* ===== 日期导航 ===== */
function prevDay() {
  currentDate.value = addDays(currentDate.value, -1);
}
function nextDay() {
  currentDate.value = addDays(currentDate.value, 1);
}
function goToday() {
  currentDate.value = getTodayDate();
}

/* ===== 富信息 tooltip ===== */
function showTooltip(e: MouseEvent, record: TimeRecord) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const containerRect = (e.currentTarget as HTMLElement).closest('.tt-timeline')?.getBoundingClientRect();
  tooltip.value = {
    visible: true,
    x: rect.left - (containerRect?.left || 0) + rect.width / 2,
    y: rect.top - (containerRect?.top || 0) - 8,
    record,
  };
}

function hideTooltip() {
  tooltip.value.visible = false;
}

/* ===== 加载 ===== */
async function load() {
  loading.value = true;
  try {
    const [cats, recs, sum] = await Promise.all([
      getTimeCategories(),
      getTimeRecordsByDate(currentDate.value),
      getDailySummary(currentDate.value),
    ]);
    categories.value = cats;
    records.value = recs;
    summary.value = sum;
    if (!timerCategory.value && cats.length) timerCategory.value = cats[0].key;

    // 加载周/月统计
    const ws = getWeekStart(currentDate.value);
    const we = addDays(ws, 6);
    const ms = getMonthStart(currentDate.value);
    const me = getMonthEnd(currentDate.value);
    const [wk, mo] = await Promise.all([
      getWeeklySummary(ws, we),
      getMonthlySummary(ms, me),
    ]);
    weeklyData.value = wk;
    monthlyData.value = mo;
  } finally {
    loading.value = false;
  }
}

/* ===== 补录 ===== */
function onTimelineClick(e: MouseEvent) {
  const track = e.currentTarget as HTMLElement;
  const rect = track.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  const minutes = Math.round(ratio * 1440);
  fillForm.value = {
    start_time: minutesToHHMM(minutes),
    end_time: minutesToHHMM(Math.min(1440, minutes + 60)),
    category: timerCategory.value || categories.value[0]?.key || '',
    description: '',
  };
  fillVisible.value = true;
}

/* 工具栏补录按钮：默认填入当前小时整点-下一整点 */
function openFill() {
  const now = new Date();
  const h = now.getHours();
  fillForm.value = {
    start_time: `${String(h).padStart(2, '0')}:00`,
    end_time: `${String(Math.min(23, h + 1)).padStart(2, '0')}:00`,
    category: timerCategory.value || categories.value[0]?.key || '',
    description: '',
  };
  fillVisible.value = true;
}

/* 时段冲突校验 */
function checkConflict(startMin: number, endMin: number, excludeId?: number): boolean {
  return records.value.some((r) => {
    if (r.id === excludeId) return false;
    const rStart = isoToMinutes(r.start_time);
    const rEnd = r.end_time ? isoToMinutes(r.end_time) : nowMinutes.value;
    return startMin < rEnd && endMin > rStart;
  });
}

async function submitFill() {
  if (!fillForm.value.start_time || !fillForm.value.category) return;
  const startMin = hhmmToMinutes(fillForm.value.start_time);
  const endMin = fillForm.value.end_time ? hhmmToMinutes(fillForm.value.end_time) : startMin;
  if (checkConflict(startMin, endMin)) {
    if (!confirm('该时段与已有记录重叠，是否继续？')) return;
  }
  const duration = Math.max(0, (endMin - startMin) * 60);
  await createTimeRecord({
    category: fillForm.value.category,
    description: fillForm.value.description.trim() || undefined,
    start_time: `${currentDate.value}T${fillForm.value.start_time}:00`,
    end_time: fillForm.value.end_time ? `${currentDate.value}T${fillForm.value.end_time}:00` : undefined,
    duration,
    date: currentDate.value,
  });
  fillVisible.value = false;
  await load();
}

/* ===== 编辑 / 删除 ===== */
function openEdit(r: TimeRecord) {
  editForm.value = {
    id: r.id,
    category: r.category,
    description: r.description || '',
    start_time: fmtTimeFromIso(r.start_time),
    end_time: r.end_time ? fmtTimeFromIso(r.end_time) : '',
  };
  editVisible.value = true;
}

async function submitEdit() {
  if (!editForm.value.start_time) return;
  const startMin = hhmmToMinutes(editForm.value.start_time);
  const endMin = editForm.value.end_time ? hhmmToMinutes(editForm.value.end_time) : startMin;
  if (editForm.value.end_time && checkConflict(startMin, endMin, editForm.value.id)) {
    if (!confirm('该时段与已有记录重叠，是否继续？')) return;
  }
  const startIso = `${currentDate.value}T${editForm.value.start_time}:00`;
  const endIso = editForm.value.end_time ? `${currentDate.value}T${editForm.value.end_time}:00` : null;
  const duration = endIso
    ? Math.floor((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000)
    : null;
  await updateTimeRecord(editForm.value.id, {
    category: editForm.value.category,
    description: editForm.value.description.trim() || null,
    start_time: startIso,
    end_time: endIso,
    duration,
  });
  editVisible.value = false;
  await load();
}

async function removeRecord(id: number) {
  if (!confirm('确认删除此记录？')) return;
  await deleteTimeRecord(id);
  await load();
}

/* ===== 分类管理 ===== */
function openCatMgmt() {
  catMgmtVisible.value = true;
}

function openCatForm(cat?: TimeCategory) {
  if (cat) {
    catForm.value = {
      id: cat.id,
      key: cat.key,
      name: cat.name,
      color: cat.color,
      icon: cat.icon || '📝',
      daily_goal: cat.daily_goal,
      is_preset: cat.is_preset,
    };
  } else {
    catForm.value = {
      id: 0,
      key: `custom_${Date.now()}`,
      name: '',
      color: '#8b5cf6',
      icon: '📝',
      daily_goal: 0,
      is_preset: 0,
    };
  }
}

async function saveCat() {
  if (!catForm.value.name.trim()) return;
  const goalSec = catForm.value.daily_goal * 3600; // 小时转秒
  if (catForm.value.id) {
    await updateTimeCategory(catForm.value.id, {
      name: catForm.value.name.trim(),
      color: catForm.value.color,
      icon: catForm.value.icon,
      daily_goal: goalSec,
    });
  } else {
    await createTimeCategory({
      key: catForm.value.key,
      name: catForm.value.name.trim(),
      color: catForm.value.color,
      icon: catForm.value.icon,
      daily_goal: goalSec,
    });
  }
  catForm.value.id = 0;
  await load();
}

async function removeCat(cat: TimeCategory) {
  if (cat.is_preset) return;
  if (!confirm(`确认删除分类「${cat.name}」？`)) return;
  await deleteTimeCategory(cat.id);
  await load();
}

/* ===== 生命周期 ===== */
watch(currentDate, () => load());

onMounted(() => {
  load();
  tick();
  tickHandle = setInterval(tick, 1000);
});

onUnmounted(() => {
  if (tickHandle) clearInterval(tickHandle);
  // 保存正在进行的计时器到数据库（fire-and-forget，避免组件卸载丢失计时）
  if (timerActive.value && timerStart.value) {
    const start = new Date(timerStart.value);
    const end = new Date();
    const duration = Math.floor((end.getTime() - start.getTime()) / 1000);
    createTimeRecord({
      category: timerCategory.value,
      description: timerDesc.value.trim() || undefined,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      duration,
      date: getTodayDate(),
    }).catch(() => { /* ignore */ });
    timerActive.value = false;
    timerStart.value = 0;
  }
});
</script>

<template>
  <BaseCard icon="⏱️" title="时间记录">
    <template #actions>
      <div class="tt-actions">
        <button class="tt-add-btn" title="补录时间段" @click="openFill">
          <span class="tt-add-icon">＋</span>
          <span class="tt-add-text">补录</span>
        </button>
        <button class="tt-icon-action" title="分类管理" @click="openCatMgmt">⚙</button>
        <div class="tt-view-toggle">
          <button class="tt-seg" :class="{ 'tt-seg--active': view === 'timeline' }" @click="view = 'timeline'">轴</button>
          <button class="tt-seg" :class="{ 'tt-seg--active': view === 'clock' }" @click="view = 'clock'">盘</button>
          <button class="tt-seg" :class="{ 'tt-seg--active': view === 'list' }" @click="view = 'list'">表</button>
        </div>
      </div>
    </template>

    <!-- 日期导航 -->
    <div class="tt-date-nav">
      <button class="tt-nav-btn" @click="prevDay" title="前一天">‹</button>
      <div class="tt-date-display">
        <span class="tt-date-text">{{ currentDate }}</span>
        <span class="tt-date-week">{{ getWeekdayLabel(currentDate) }}</span>
        <button v-if="!isToday(currentDate)" class="tt-back-today" @click="goToday">今天</button>
      </div>
      <button class="tt-nav-btn" :disabled="isToday(currentDate)" @click="nextDay" title="后一天">›</button>
    </div>

    <!-- 快速计时器 -->
    <div class="tt-timer" :class="{ 'tt-timer--active': timerActive }">
      <div class="tt-timer-head">
        <span class="tt-timer-title">
          <i class="tt-timer-led" :class="{ 'tt-timer-led--on': timerActive }"></i>
          {{ timerActive ? '正在记录' : '快速计时' }}
        </span>
        <span v-if="timerActive" class="tt-timer-now">
          {{ nameOf(timerCategory) }} · 点击其他分类可切换
        </span>
        <span v-else class="tt-timer-now">选择分类后点击开始</span>
      </div>
      <div class="tt-timer-cats">
        <button
          v-for="c in categories"
          :key="c.id"
          class="tt-cat-chip"
          :class="{ 'tt-cat-chip--active': timerCategory === c.key }"
          :style="timerCategory === c.key ? { borderColor: c.color, color: c.color, background: c.color + '22' } : {}"
          @click="selectCategory(c.key)"
        >
          <span v-if="c.icon">{{ c.icon }}</span>{{ c.name }}
        </button>
        <span v-if="categories.length === 0" class="tt-empty-inline">暂无分类，请先在分类管理中添加</span>
      </div>
      <div class="tt-timer-row">
        <input
          v-model="timerDesc"
          class="tt-timer-input"
          placeholder="在做什么？（可选）"
          :disabled="timerActive"
        />
        <div class="tt-timer-display">
          <span class="tt-timer-time">{{ fmtTimer(liveSeconds) }}</span>
        </div>
        <button
          class="tt-timer-btn"
          :class="{ 'tt-timer-btn--stop': timerActive }"
          @click="timerActive ? stopTimer() : startTimer()"
        >
          {{ timerActive ? '⏹ 停止记录' : '▶ 开始计时' }}
        </button>
      </div>
    </div>

    <!-- 时间轴视图 -->
    <template v-if="view === 'timeline'">
      <div class="tt-section-title">
        <span>{{ isToday(currentDate) ? '今日时间轴' : '时间轴' }}</span>
        <span class="tt-hint">点击空白处补录</span>
      </div>
      <div class="tt-timeline" @mouseleave="hideTooltip">
        <div class="tt-timeline-track" @click="onTimelineClick">
          <div
            v-for="seg in segments"
            :key="seg.id"
            class="tt-seg"
            :style="{ left: seg.left + '%', width: seg.width + '%', background: seg.color }"
            @click.stop="openEdit(seg.record)"
            @mouseenter="showTooltip($event, seg.record)"
            @mouseleave="hideTooltip"
          ></div>
          <div class="tt-now-line" :style="{ left: nowPct + '%' }" title="现在"></div>
        </div>
        <div class="tt-timeline-scale">
          <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
        </div>
        <!-- 富信息 tooltip -->
        <div
          v-if="tooltip.visible && tooltip.record"
          class="tt-tooltip"
          :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
        >
          <div class="tt-tooltip-head">
            <i class="tt-dot" :style="{ background: colorOf(tooltip.record.category) }"></i>
            {{ nameOf(tooltip.record.category) }}
          </div>
          <div class="tt-tooltip-time">
            {{ fmtTimeFromIso(tooltip.record.start_time) }} - {{ fmtTimeFromIso(tooltip.record.end_time) }}
            · {{ fmtDuration(recordDuration(tooltip.record)) }}
          </div>
          <div v-if="tooltip.record.description" class="tt-tooltip-desc">{{ tooltip.record.description }}</div>
          <div v-if="tooltip.record.todo_id" class="tt-tooltip-todo">关联待办 #{{ tooltip.record.todo_id }}</div>
        </div>
      </div>
    </template>

    <!-- 圆形时钟视图 -->
    <template v-else-if="view === 'clock'">
      <div class="tt-section-title">
        <span>{{ isToday(currentDate) ? '今日时钟' : '时钟' }}</span>
        <span class="tt-total">合计 {{ fmtDuration(totalDuration) }}</span>
      </div>
      <div class="tt-clock-wrap">
        <svg class="tt-clock-svg" viewBox="0 0 200 200">
          <!-- 外圈刻度 -->
          <circle cx="100" cy="100" r="88" fill="none" stroke="var(--border-color)" stroke-width="1" />
          <!-- 刻度线 -->
          <g class="tt-clock-ticks">
            <line
              v-for="h in 24"
              :key="'tick-' + h"
              :x1="100 + Math.cos(((h / 24) * 360 - 90) * Math.PI / 180) * 82"
              :y1="100 + Math.sin(((h / 24) * 360 - 90) * Math.PI / 180) * 82"
              :x2="100 + Math.cos(((h / 24) * 360 - 90) * Math.PI / 180) * 88"
              :y2="100 + Math.sin(((h / 24) * 360 - 90) * Math.PI / 180) * 88"
              :stroke="h % 6 === 0 ? 'var(--text-secondary)' : 'var(--border-color)'"
              :stroke-width="h % 6 === 0 ? 1.5 : 0.8"
            />
            <text
              v-for="h in [0, 6, 12, 18, 24]"
              :key="'label-' + h"
              :x="100 + Math.cos(((h / 24) * 360 - 90) * Math.PI / 180) * 74"
              :y="100 + Math.sin(((h / 24) * 360 - 90) * Math.PI / 180) * 74 + 3"
              fill="var(--text-tertiary)"
              font-size="8"
              text-anchor="middle"
            >{{ h }}</text>
          </g>
          <!-- 已记录时段弧段 -->
          <path
            v-for="seg in clockSegments"
            :key="seg.id"
            :d="describeArc(100, 100, 78, seg.startAngle, seg.endAngle)"
            fill="none"
            :stroke="seg.color"
            stroke-width="10"
            stroke-linecap="round"
            class="tt-clock-arc"
            @click="openEdit(seg.record)"
          />
          <!-- 当前时刻指针 -->
          <line
            :x1="100"
            :y1="100"
            :x2="100 + Math.cos(nowAngle * Math.PI / 180) * 70"
            :y2="100 + Math.sin(nowAngle * Math.PI / 180) * 70"
            stroke="#ef4444"
            stroke-width="1.5"
            stroke-linecap="round"
          />
          <circle cx="100" cy="100" r="3" fill="#ef4444" />
          <!-- 中心总时长 -->
          <text x="100" y="98" text-anchor="middle" fill="var(--text-primary)" font-size="14" font-weight="600">
            {{ fmtDuration(totalDuration) }}
          </text>
          <text x="100" y="112" text-anchor="middle" fill="var(--text-tertiary)" font-size="7">已记录</text>
        </svg>
      </div>
    </template>

    <!-- 列表视图 -->
    <template v-else>
      <div class="tt-section-title">
        <span>记录列表</span>
        <span class="tt-total">{{ records.length }} 条</span>
      </div>
      <div class="tt-list">
        <div v-for="r in records" :key="r.id" class="tt-list-item">
          <i class="tt-dot" :style="{ background: colorOf(r.category) }"></i>
          <div class="tt-list-main">
            <div class="tt-list-title">
              {{ nameOf(r.category) }}<span v-if="r.description" class="tt-list-desc"> · {{ r.description }}</span>
              <span v-if="r.todo_id" class="tt-list-todo">🔗</span>
            </div>
            <div class="tt-list-time">
              {{ fmtTimeFromIso(r.start_time) }} - {{ fmtTimeFromIso(r.end_time) }}
              <span class="tt-list-dur">· {{ fmtDuration(recordDuration(r)) }}</span>
            </div>
          </div>
          <button class="tt-icon-btn" title="编辑" @click="openEdit(r)">✏️</button>
          <button class="tt-icon-btn" title="删除" @click="removeRecord(r.id)">🗑</button>
        </div>
        <div v-if="records.length === 0" class="tt-empty">当日暂无记录</div>
      </div>
    </template>

    <!-- 统计区（日/周/月 Tab） -->
    <div class="tt-section-title">
      <div class="tt-stat-tabs">
        <button class="tt-stat-tab" :class="{ 'tt-stat-tab--active': statPeriod === 'day' }" @click="statPeriod = 'day'">日</button>
        <button class="tt-stat-tab" :class="{ 'tt-stat-tab--active': statPeriod === 'week' }" @click="statPeriod = 'week'">周</button>
        <button class="tt-stat-tab" :class="{ 'tt-stat-tab--active': statPeriod === 'month' }" @click="statPeriod = 'month'">月</button>
      </div>
      <span class="tt-total">
        <template v-if="statPeriod === 'day'">合计 {{ fmtDuration(totalDuration) }}</template>
        <template v-else-if="statPeriod === 'week'">{{ getWeekLabel(currentDate) }} · {{ fmtDuration(weekTotalDuration) }}</template>
        <template v-else>{{ getMonthLabel(currentDate) }} · {{ fmtDuration(monthTotalDuration) }}</template>
      </span>
    </div>

    <!-- 日统计 -->
    <div v-if="statPeriod === 'day'" class="tt-stats">
      <div v-for="s in stats" :key="s.key" class="tt-stat-row">
        <span class="tt-stat-name"><i class="tt-dot" :style="{ background: s.color }"></i>{{ s.name }}</span>
        <div class="tt-stat-bar"><div class="tt-stat-fill" :style="{ width: statPct(s) + '%', background: s.color }"></div></div>
        <span class="tt-stat-dur">{{ fmtDuration(s.duration) }}</span>
      </div>
      <div v-if="stats.length === 0" class="tt-empty">当日暂无记录</div>
    </div>

    <!-- 周统计（堆叠柱状图） -->
    <div v-else-if="statPeriod === 'week'" class="tt-week-chart">
      <div class="tt-week-bars">
        <div v-for="d in weekDays" :key="d.date" class="tt-week-bar-col" :title="`${d.date} ${d.weekday} · ${fmtDuration(d.total)}`">
          <div class="tt-week-bar">
            <div
              v-for="cat in d.cats"
              :key="cat.key"
              class="tt-week-bar-seg"
              :style="{ height: (d.total > 0 ? (cat.duration / weekMaxTotal) * 100 : 0) + '%', background: cat.color }"
            ></div>
          </div>
          <span class="tt-week-label">{{ d.label }}</span>
          <span class="tt-week-weekday" :class="{ 'tt-week-weekend': d.isWeekend }">{{ d.weekday.slice(1) }}</span>
        </div>
      </div>
      <div class="tt-week-legend">
        <span v-for="c in categories" :key="c.id" class="tt-legend-item">
          <i class="tt-dot" :style="{ background: c.color }"></i>{{ c.name }}
        </span>
      </div>
    </div>

    <!-- 月统计（趋势柱状图） -->
    <div v-else class="tt-month-chart">
      <div class="tt-month-bars">
        <div
          v-for="d in monthDays"
          :key="d.date"
          class="tt-month-bar-col"
          :title="`${d.date} · ${fmtDuration(d.total)}`"
        >
          <div class="tt-month-bar" :style="{ height: (d.total > 0 ? (d.total / monthMaxTotal) * 100 : 0) + '%' }"></div>
          <span v-if="parseInt(d.label) % 5 === 0" class="tt-month-label">{{ d.label }}</span>
        </div>
      </div>
    </div>

    <!-- 目标进度 -->
    <div class="tt-section-title">目标进度</div>
    <div class="tt-goals">
      <div v-for="g in goals" :key="g.name" class="tt-goal-row" :class="{ 'tt-goal-row--achieved': goalAchieved(g) }">
        <span class="tt-goal-name">
          {{ g.name }}
          <span v-if="goalAchieved(g)" class="tt-goal-badge">✓</span>
        </span>
        <div class="tt-goal-bar">
          <div
            class="tt-goal-fill"
            :class="{ 'tt-goal-fill--achieved': goalAchieved(g) }"
            :style="{ width: goalPct(g) + '%', background: goalAchieved(g) ? '#22c55e' : g.color }"
          ></div>
        </div>
        <span class="tt-goal-pct">{{ Math.round(goalPct(g)) }}%</span>
      </div>
      <div v-if="goals.length === 0" class="tt-empty">未设置每日目标</div>
    </div>

    <!-- 补录弹窗 -->
    <BaseModal :visible="fillVisible" title="补录时间" @close="fillVisible = false">
      <div class="tt-form">
        <div class="form-row">
          <label class="form-label">分类</label>
          <div class="tt-cat-pick">
            <button
              v-for="c in categories"
              :key="c.id"
              class="tt-cat-chip"
              :class="{ 'tt-cat-chip--active': fillForm.category === c.key }"
              :style="fillForm.category === c.key ? { borderColor: c.color, color: c.color, background: c.color + '22' } : {}"
              @click="fillForm.category = c.key"
            >
              <span v-if="c.icon">{{ c.icon }}</span>{{ c.name }}
            </button>
          </div>
        </div>
        <div class="form-row">
          <label class="form-label">时段</label>
          <div class="form-times">
            <input v-model="fillForm.start_time" type="time" class="form-input time-input" />
            <span class="time-sep">—</span>
            <input v-model="fillForm.end_time" type="time" class="form-input time-input" />
          </div>
        </div>
        <div class="form-row">
          <input v-model="fillForm.description" class="form-input" placeholder="描述（可选）" />
        </div>
      </div>
      <template #footer>
        <button class="btn btn-cancel" @click="fillVisible = false">取消</button>
        <button class="btn btn-confirm" @click="submitFill">保存</button>
      </template>
    </BaseModal>

    <!-- 编辑弹窗 -->
    <BaseModal :visible="editVisible" title="编辑记录" @close="editVisible = false">
      <div class="tt-form">
        <div class="form-row">
          <label class="form-label">分类</label>
          <div class="tt-cat-pick">
            <button
              v-for="c in categories"
              :key="c.id"
              class="tt-cat-chip"
              :class="{ 'tt-cat-chip--active': editForm.category === c.key }"
              :style="editForm.category === c.key ? { borderColor: c.color, color: c.color, background: c.color + '22' } : {}"
              @click="editForm.category = c.key"
            >
              <span v-if="c.icon">{{ c.icon }}</span>{{ c.name }}
            </button>
          </div>
        </div>
        <div class="form-row">
          <label class="form-label">时段</label>
          <div class="form-times">
            <input v-model="editForm.start_time" type="time" class="form-input time-input" />
            <span class="time-sep">—</span>
            <input v-model="editForm.end_time" type="time" class="form-input time-input" />
          </div>
        </div>
        <div class="form-row">
          <input v-model="editForm.description" class="form-input" placeholder="描述（可选）" />
        </div>
      </div>
      <template #footer>
        <button class="btn btn-cancel" @click="editVisible = false">取消</button>
        <button class="btn btn-confirm" @click="submitEdit">保存</button>
      </template>
    </BaseModal>

    <!-- 分类管理弹窗 -->
    <BaseModal :visible="catMgmtVisible" title="分类管理" @close="catMgmtVisible = false">
      <div class="tt-cat-mgmt">
        <div v-for="c in categories" :key="c.id" class="tt-cat-mgmt-row">
          <span class="tt-dot" :style="{ background: c.color }"></span>
          <span class="tt-cat-mgmt-icon">{{ c.icon }}</span>
          <span class="tt-cat-mgmt-name">{{ c.name }}</span>
          <span class="tt-cat-mgmt-goal">{{ c.daily_goal > 0 ? (c.daily_goal / 3600).toFixed(1) + 'h' : '无目标' }}</span>
          <button class="tt-icon-btn" title="编辑" @click="openCatForm(c); catMgmtVisible = false">✏️</button>
          <button class="tt-icon-btn" :disabled="c.is_preset === 1" :title="c.is_preset ? '预设不可删' : '删除'" @click="removeCat(c)">🗑</button>
        </div>
      </div>
      <!-- 新增/编辑表单 -->
      <div class="tt-cat-edit-form">
        <div class="form-row">
          <label class="form-label">{{ catForm.id ? '编辑分类' : '新增分类' }}</label>
          <div class="tt-cat-edit-row">
            <input v-model="catForm.icon" class="form-input tt-cat-icon-input" placeholder="📝" maxlength="2" />
            <input v-model="catForm.name" class="form-input tt-cat-name-input" placeholder="分类名称" />
          </div>
        </div>
        <div class="form-row">
          <label class="form-label">颜色</label>
          <div class="tt-color-pick">
            <button
              v-for="col in ['#3b82f6', '#22c55e', '#f97316', '#8b5cf6', '#ec4899', '#14b8a6', '#eab308', '#6366f1']"
              :key="col"
              class="tt-color-dot"
              :class="{ 'tt-color-dot--active': catForm.color === col }"
              :style="{ background: col }"
              @click="catForm.color = col"
            ></button>
          </div>
        </div>
        <div class="form-row">
          <label class="form-label">每日目标（小时）</label>
          <input v-model.number="catForm.daily_goal" type="number" min="0" step="0.5" class="form-input" placeholder="0 表示不设目标" />
        </div>
        <div class="tt-cat-edit-actions">
          <button v-if="catForm.id" class="btn btn-cancel" @click="openCatForm()">取消编辑</button>
          <button class="btn btn-confirm" @click="saveCat">{{ catForm.id ? '保存' : '添加' }}</button>
        </div>
      </div>
    </BaseModal>
  </BaseCard>
</template>

<style scoped>
/* 操作区 */
.tt-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tt-add-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 4px 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent-gradient);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
  font-family: inherit;
}

.tt-add-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
}

.tt-add-icon {
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
}

.tt-add-text {
  font-size: 12px;
}

.tt-icon-action {
  padding: 3px 8px;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 12px;
  transition: all 0.2s;
}

.tt-icon-action:hover {
  color: var(--text-primary);
  border-color: var(--border-hover);
}

/* 视图切换 */
.tt-view-toggle {
  display: flex;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.tt-seg {
  padding: 3px 10px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 12px;
  transition: all 0.2s;
}

.tt-seg:hover { color: var(--text-primary); }

.tt-seg--active {
  background: var(--accent-color);
  color: #fff;
}

/* 日期导航 */
.tt-date-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  flex-shrink: 0;
}

.tt-nav-btn {
  width: 24px;
  height: 24px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tt-nav-btn:hover:not(:disabled) {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.tt-nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.tt-date-display {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tt-date-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.tt-date-week {
  font-size: 11px;
  color: var(--text-tertiary);
}

.tt-back-today {
  padding: 1px 8px;
  border: 1px solid var(--accent-color);
  border-radius: 10px;
  background: transparent;
  color: var(--accent-color);
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.tt-back-today:hover {
  background: var(--accent-color);
  color: #fff;
}

/* 计时器 - 醒目设计 */
.tt-timer {
  position: relative;
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius);
  padding: 12px 14px;
  margin-bottom: 14px;
  background: linear-gradient(135deg, var(--bg-card) 0%, var(--bg-input) 100%);
  transition: border-color 0.3s, box-shadow 0.3s, background 0.3s;
  flex-shrink: 0;
  overflow: hidden;
}

.tt-timer::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--accent-gradient);
  opacity: 0;
  transition: opacity 0.4s;
  pointer-events: none;
}

.tt-timer--active {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px var(--accent-light), 0 8px 24px rgba(99, 102, 241, 0.15);
}

.tt-timer--active::before {
  opacity: 0.04;
}

.tt-timer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  position: relative;
}

.tt-timer-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.3px;
}

.tt-timer-led {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-tertiary);
  flex-shrink: 0;
  transition: background 0.3s;
}

.tt-timer-led--on {
  background: #22c55e;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.25);
  animation: tt-led-blink 1.4s ease-in-out infinite;
}

@keyframes tt-led-blink {
  0%, 100% { box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.25); }
  50% { box-shadow: 0 0 0 6px rgba(34, 197, 94, 0.1); }
}

.tt-timer-now {
  font-size: 11px;
  color: var(--text-tertiary);
}

.tt-timer-cats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
  position: relative;
}

.tt-cat-chip {
  padding: 5px 12px;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: var(--bg-card-solid);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s;
}

.tt-cat-chip:hover {
  border-color: var(--border-hover);
  color: var(--text-primary);
  transform: translateY(-1px);
}

.tt-timer-row {
  display: flex;
  align-items: center;
  gap: 10px;
  position: relative;
}

.tt-timer-input {
  flex: 1;
  min-width: 0;
  padding: 8px 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-card-solid);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  font-family: inherit;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.tt-timer-input:focus {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.tt-timer-input:disabled { opacity: 0.6; cursor: not-allowed; }

.tt-timer-display {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 88px;
  padding: 6px 12px;
  background: var(--bg-card-solid);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
}

.tt-timer--active .tt-timer-display {
  border-color: var(--accent-color);
  background: linear-gradient(135deg, var(--accent-light), transparent);
}

.tt-timer-time {
  font-size: 20px;
  font-weight: 700;
  color: var(--accent-color);
  font-variant-numeric: tabular-nums;
  letter-spacing: 1px;
  line-height: 1;
}

.tt-timer-btn {
  padding: 9px 18px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent-gradient);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
  letter-spacing: 0.3px;
}

.tt-timer-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.4);
}

.tt-timer-btn:active { transform: translateY(0); }

.tt-timer-btn--stop {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
  animation: tt-btn-glow 2s ease-in-out infinite;
}

.tt-timer-btn--stop:hover {
  box-shadow: 0 6px 16px rgba(239, 68, 68, 0.4);
}

@keyframes tt-btn-glow {
  0%, 100% { box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3); }
  50% { box-shadow: 0 4px 20px rgba(239, 68, 68, 0.5); }
}

/* 区块标题 */
.tt-section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 12px 0 6px;
}

.tt-hint {
  font-weight: 400;
  font-size: 11px;
  color: var(--text-tertiary);
}

.tt-total {
  font-weight: 500;
  font-size: 11px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

/* 时间轴 */
.tt-timeline {
  position: relative;
  margin-bottom: 4px;
}

.tt-timeline-track {
  position: relative;
  height: 26px;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  cursor: pointer;
  overflow: visible;
}

.tt-seg {
  position: absolute;
  top: 2px;
  bottom: 2px;
  border-radius: 3px;
  min-width: 1px;
  opacity: 0.92;
  transition: opacity 0.2s;
  cursor: pointer;
}

.tt-seg:hover { opacity: 1; }

.tt-now-line {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  background: #ef4444;
  border-radius: 1px;
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.6);
  pointer-events: none;
  transform: translateX(-1px);
}

.tt-now-line::before {
  content: '';
  position: absolute;
  top: -2px;
  left: -2px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ef4444;
}

.tt-timeline-scale {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 10px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

/* 富信息 tooltip */
.tt-tooltip {
  position: absolute;
  z-index: 10;
  transform: translate(-50%, -100%);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 140px;
  pointer-events: none;
  animation: tt-fade-in 0.15s ease;
}

@keyframes tt-fade-in {
  from { opacity: 0; transform: translate(-50%, -95%); }
  to { opacity: 1; transform: translate(-50%, -100%); }
}

.tt-tooltip-head {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 3px;
}

.tt-tooltip-time {
  font-size: 11px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.tt-tooltip-desc {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.tt-tooltip-todo {
  font-size: 10px;
  color: var(--accent-color);
  margin-top: 2px;
}

/* 圆形时钟 */
.tt-clock-wrap {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

.tt-clock-svg {
  width: 180px;
  height: 180px;
}

.tt-clock-arc {
  cursor: pointer;
  transition: opacity 0.2s;
}

.tt-clock-arc:hover { opacity: 0.8; }

/* 列表视图 */
.tt-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.tt-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 6px;
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}

.tt-list-item:hover { background: var(--bg-hover); }

.tt-list-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.tt-list-title {
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tt-list-desc { color: var(--text-tertiary); }
.tt-list-todo { margin-left: 4px; }

.tt-list-time {
  font-size: 11px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.tt-list-dur { margin-left: 2px; }

.tt-icon-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  font-size: 12px;
  opacity: 0.4;
  transition: opacity 0.2s, background 0.2s;
  flex-shrink: 0;
}

.tt-icon-btn:hover {
  opacity: 1;
  background: var(--bg-hover);
}

.tt-icon-btn:disabled {
  opacity: 0.2;
  cursor: not-allowed;
}

.tt-empty {
  padding: 24px 0;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 12px;
}

.tt-empty-inline {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* 统计 Tab */
.tt-stat-tabs {
  display: flex;
  gap: 2px;
}

.tt-stat-tab {
  padding: 2px 10px;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 11px;
  transition: all 0.2s;
}

.tt-stat-tab:hover { color: var(--text-primary); }

.tt-stat-tab--active {
  background: var(--accent-color);
  border-color: var(--accent-color);
  color: #fff;
}

/* 日统计条形图 */
.tt-stats {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tt-stat-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tt-stat-name {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 64px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tt-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tt-stat-bar {
  flex: 1;
  height: 8px;
  background: var(--bg-hover);
  border-radius: 4px;
  overflow: hidden;
}

.tt-stat-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.4s ease;
}

.tt-stat-dur {
  width: 44px;
  flex-shrink: 0;
  text-align: right;
  font-size: 11px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

/* 周统计柱状图 */
.tt-week-chart {
  padding: 4px 0;
}

.tt-week-bars {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 80px;
  margin-bottom: 4px;
}

.tt-week-bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  height: 100%;
  justify-content: flex-end;
}

.tt-week-bar {
  width: 100%;
  max-width: 24px;
  height: 100%;
  display: flex;
  flex-direction: column-reverse;
  border-radius: 3px 3px 0 0;
  overflow: hidden;
  background: var(--bg-hover);
}

.tt-week-bar-seg {
  width: 100%;
  transition: height 0.4s ease;
}

.tt-week-label {
  font-size: 10px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.tt-week-weekday {
  font-size: 9px;
  color: var(--text-tertiary);
}

.tt-week-weekend { color: #ef4444; }

.tt-week-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}

.tt-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--text-tertiary);
}

/* 月统计柱状图 */
.tt-month-chart {
  padding: 4px 0;
}

.tt-month-bars {
  display: flex;
  align-items: flex-end;
  gap: 1px;
  height: 80px;
  margin-bottom: 4px;
}

.tt-month-bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  height: 100%;
  justify-content: flex-end;
  min-width: 0;
}

.tt-month-bar {
  width: 100%;
  background: var(--accent-color);
  border-radius: 2px 2px 0 0;
  min-height: 1px;
  transition: height 0.4s ease;
  opacity: 0.8;
}

.tt-month-label {
  font-size: 8px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

/* 目标进度 */
.tt-goals {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tt-goal-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tt-goal-name {
  width: 64px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 3px;
}

.tt-goal-badge {
  color: #22c55e;
  font-size: 10px;
}

.tt-goal-bar {
  flex: 1;
  height: 6px;
  background: var(--bg-hover);
  border-radius: 3px;
  overflow: hidden;
}

.tt-goal-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.4s ease, background 0.3s;
}

.tt-goal-pct {
  width: 36px;
  flex-shrink: 0;
  text-align: right;
  font-size: 11px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

/* 表单 */
.tt-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.tt-cat-pick {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.form-input {
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

.form-input:focus { border-color: var(--accent-color); }

.form-times {
  display: flex;
  align-items: center;
  gap: 8px;
}

.time-input { flex: 1; }

.time-sep {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

/* 分类管理 */
.tt-cat-mgmt {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 16px;
}

.tt-cat-mgmt-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}

.tt-cat-mgmt-row:hover { background: var(--bg-hover); }

.tt-cat-mgmt-icon { font-size: 14px; }

.tt-cat-mgmt-name {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
}

.tt-cat-mgmt-goal {
  font-size: 11px;
  color: var(--text-tertiary);
}

.tt-cat-edit-form {
  border-top: 1px solid var(--border-color);
  padding-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.tt-cat-edit-row {
  display: flex;
  gap: 6px;
}

.tt-cat-icon-input {
  width: 44px;
  flex-shrink: 0;
  text-align: center;
}

.tt-cat-name-input { flex: 1; }

.tt-color-pick {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tt-color-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.tt-color-dot--active {
  border-color: var(--text-primary);
  transform: scale(1.1);
}

.tt-cat-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* 按钮 */
.btn {
  padding: 8px 18px;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.btn-cancel {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.btn-cancel:hover { background: var(--border-color); }

.btn-confirm {
  background: var(--accent-color);
  color: #fff;
}

.btn-confirm:hover { background: var(--accent-hover); }
</style>
