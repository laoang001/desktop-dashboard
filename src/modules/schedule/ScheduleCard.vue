<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import BaseCard from '../../components/common/BaseCard.vue';
import BaseModal from '../../components/common/BaseModal.vue';
import { getSchedulesByDate, createSchedule, deleteSchedule } from './api';
import type { Schedule } from '../../types';

type ViewMode = 'day' | 'week';

const view = ref<ViewMode>('day');
const navDate = ref<string>(getTodayDate());
const schedules = ref<Schedule[]>([]);
const weekData = ref<{ date: string; items: Schedule[] }[]>([]);
const loading = ref(false);

const modalVisible = ref(false);
const form = ref({
  title: '',
  start_time: '',
  end_time: '',
  location: '',
  remark: '',
});

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

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

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getMonday(s: string): string {
  const date = parseDate(s);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  return formatDate(date);
}

function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

function fmtTime(iso: string | null): string {
  if (!iso) return '';
  const t = iso.split('T')[1];
  if (!t) return '全天';
  return t.slice(0, 5);
}

function timeRange(s: Schedule): string {
  if (s.all_day) return '全天';
  const start = fmtTime(s.start_at);
  const end = s.end_at ? fmtTime(s.end_at) : '';
  return end ? `${start} - ${end}` : start;
}

function dayLabel(date: string): string {
  return `周${WEEK_LABELS[parseDate(date).getDay()]}`;
}

function shortDate(date: string): string {
  const d = parseDate(date);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function isToday(date: string): boolean {
  return date === getTodayDate();
}

/* ===== 显示标题 ===== */
const headerLabel = computed(() => {
  if (view.value === 'day') {
    return `${shortDate(navDate.value)} ${dayLabel(navDate.value)}`;
  }
  const start = getMonday(navDate.value);
  const end = addDays(start, 6);
  return `${shortDate(start)} - ${shortDate(end)}`;
});

/* ===== 加载 ===== */
async function load() {
  loading.value = true;
  try {
    if (view.value === 'day') {
      schedules.value = await getSchedulesByDate(navDate.value);
    } else {
      const start = getMonday(navDate.value);
      const dates: string[] = [];
      for (let i = 0; i < 7; i++) dates.push(addDays(start, i));
      const results = await Promise.all(dates.map((d) => getSchedulesByDate(d)));
      weekData.value = dates.map((date, i) => ({ date, items: results[i] }));
    }
  } finally {
    loading.value = false;
  }
}

/* ===== 导航 ===== */
function prev() {
  navDate.value = view.value === 'day' ? addDays(navDate.value, -1) : addDays(navDate.value, -7);
  load();
}

function next() {
  navDate.value = view.value === 'day' ? addDays(navDate.value, 1) : addDays(navDate.value, 7);
  load();
}

function goToday() {
  navDate.value = getTodayDate();
  load();
}

function switchView(v: ViewMode) {
  if (view.value === v) return;
  view.value = v;
  load();
}

/* ===== 添加 ===== */
function openAddModal() {
  form.value = { title: '', start_time: '', end_time: '', location: '', remark: '' };
  modalVisible.value = true;
}

async function submit() {
  const title = form.value.title.trim();
  if (!title || !form.value.start_time) return;
  const date = view.value === 'day' ? navDate.value : getTodayDate();
  await createSchedule({
    title,
    start_at: `${date}T${form.value.start_time}:00`,
    end_at: form.value.end_time ? `${date}T${form.value.end_time}:00` : undefined,
    location: form.value.location.trim() || undefined,
    remark: form.value.remark.trim() || undefined,
  });
  modalVisible.value = false;
  await load();
}

/* ===== 删除 ===== */
async function remove(id: number) {
  await deleteSchedule(id);
  await load();
}

function onScheduleUpdated() { load(); }
onMounted(() => {
  load();
  window.addEventListener('schedule-updated', onScheduleUpdated);
});
onUnmounted(() => {
  window.removeEventListener('schedule-updated', onScheduleUpdated);
});
</script>

<template>
  <BaseCard icon="📅" title="日程">
    <template #actions>
      <button class="sch-add-btn" title="添加日程" @click="openAddModal">＋</button>
    </template>

    <!-- 视图切换 + 导航 -->
    <div class="sch-toolbar">
      <div class="sch-view-toggle">
        <button
          class="sch-seg"
          :class="{ 'sch-seg--active': view === 'day' }"
          @click="switchView('day')"
        >
          日
        </button>
        <button
          class="sch-seg"
          :class="{ 'sch-seg--active': view === 'week' }"
          @click="switchView('week')"
        >
          周
        </button>
      </div>
      <div class="sch-nav">
        <button class="sch-nav-btn" title="上一个" @click="prev">‹</button>
        <button class="sch-nav-label" :title="'回到今天'" @click="goToday">
          {{ headerLabel }}
        </button>
        <button class="sch-nav-btn" title="下一个" @click="next">›</button>
      </div>
    </div>

    <!-- 日视图 -->
    <div v-if="view === 'day'" class="sch-day-list">
      <div v-for="s in schedules" :key="s.id" class="sch-item">
        <span class="sch-dot" :style="{ background: s.color || '#3b82f6' }"></span>
        <div class="sch-time">{{ timeRange(s) }}</div>
        <div class="sch-main">
          <div class="sch-title">{{ s.title }}</div>
          <div v-if="s.location" class="sch-loc">📍 {{ s.location }}</div>
        </div>
        <button class="sch-del" title="删除" @click="remove(s.id)">🗑</button>
      </div>
      <div v-if="!loading && schedules.length === 0" class="sch-empty">当日暂无日程</div>
    </div>

    <!-- 周视图 -->
    <div v-else class="sch-week-list">
      <div
        v-for="d in weekData"
        :key="d.date"
        class="sch-week-row"
        :class="{ 'sch-week-row--today': isToday(d.date) }"
      >
        <div class="sch-week-date">
          <span class="sch-week-day">{{ dayLabel(d.date) }}</span>
          <span class="sch-week-md">{{ shortDate(d.date) }}</span>
        </div>
        <div class="sch-week-body">
          <span v-if="d.items.length === 0" class="sch-week-empty">—</span>
          <template v-else>
            <span class="sch-week-count">{{ d.items.length }}项</span>
            <span class="sch-week-titles">{{ d.items.map((i) => i.title).join('、') }}</span>
          </template>
        </div>
      </div>
    </div>

    <!-- 添加弹窗 -->
    <BaseModal :visible="modalVisible" title="添加日程" @close="modalVisible = false">
      <div class="sch-form">
        <div class="form-row">
          <input
            v-model="form.title"
            class="form-input"
            placeholder="日程标题"
            @keyup.enter="submit"
          />
        </div>
        <div class="form-row">
          <label class="form-label">时间</label>
          <div class="form-times">
            <input v-model="form.start_time" type="time" class="form-input time-input" />
            <span class="time-sep">—</span>
            <input v-model="form.end_time" type="time" class="form-input time-input" />
          </div>
        </div>
        <div class="form-row">
          <input v-model="form.location" class="form-input" placeholder="地点（可选）" />
        </div>
        <div class="form-row">
          <textarea
            v-model="form.remark"
            class="form-input"
            placeholder="备注（可选）"
            rows="2"
          ></textarea>
        </div>
      </div>
      <template #footer>
        <button class="btn btn-cancel" @click="modalVisible = false">取消</button>
        <button class="btn btn-confirm" @click="submit">添加</button>
      </template>
    </BaseModal>
  </BaseCard>
</template>

<style scoped>
/* 工具栏 */
.sch-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  flex-shrink: 0;
}

.sch-view-toggle {
  display: flex;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.sch-seg {
  padding: 4px 12px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 12px;
  transition: all 0.2s;
}

.sch-seg:hover {
  color: var(--text-primary);
}

.sch-seg--active {
  background: var(--accent-color);
  color: #fff;
}

.sch-nav {
  display: flex;
  align-items: center;
  gap: 2px;
}

.sch-nav-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1;
  transition: all 0.2s;
}

.sch-nav-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.sch-nav-label {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  font-variant-numeric: tabular-nums;
  transition: background 0.2s;
}

.sch-nav-label:hover {
  background: var(--bg-hover);
}

/* 添加按钮 */
.sch-add-btn {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent-color);
  color: #fff;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.sch-add-btn:hover {
  background: var(--accent-hover);
}

/* 日视图列表 */
.sch-day-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.sch-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 6px;
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}

.sch-item:hover {
  background: var(--bg-hover);
}

.sch-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sch-time {
  font-size: 11px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  min-width: 86px;
  flex-shrink: 0;
}

.sch-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.sch-title {
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sch-loc {
  font-size: 11px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sch-del {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  font-size: 13px;
  opacity: 0.4;
  transition: opacity 0.2s, background 0.2s;
  flex-shrink: 0;
}

.sch-del:hover {
  opacity: 1;
  background: var(--bg-hover);
}

/* 周视图 */
.sch-week-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.sch-week-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 6px;
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}

.sch-week-row:hover {
  background: var(--bg-hover);
}

.sch-week-row--today {
  background: var(--accent-light);
}

.sch-week-date {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 40px;
  flex-shrink: 0;
}

.sch-week-day {
  font-size: 11px;
  color: var(--text-secondary);
}

.sch-week-md {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.sch-week-body {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.sch-week-count {
  font-size: 10px;
  background: var(--bg-hover);
  color: var(--text-secondary);
  padding: 2px 6px;
  border-radius: 10px;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.sch-week-row--today .sch-week-count {
  background: var(--accent-color);
  color: #fff;
}

.sch-week-titles {
  font-size: 12px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sch-week-empty {
  font-size: 12px;
  color: var(--text-tertiary);
}

.sch-empty {
  padding: 32px 0;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
}

/* 表单 */
.sch-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
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
  resize: vertical;
}

.form-input:focus {
  border-color: var(--accent-color);
}

.form-times {
  display: flex;
  align-items: center;
  gap: 8px;
}

.time-input {
  flex: 1;
}

.time-sep {
  color: var(--text-tertiary);
  flex-shrink: 0;
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

.btn-cancel:hover {
  background: var(--border-color);
}

.btn-confirm {
  background: var(--accent-color);
  color: #fff;
}

.btn-confirm:hover {
  background: var(--accent-hover);
}
</style>
