<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import BaseCard from '../../components/common/BaseCard.vue';
import BaseModal from '../../components/common/BaseModal.vue';
import { getTodos, createTodo, updateTodo, deleteTodo } from './api';
import { createTimeRecord, updateTimeRecord } from '../time-tracker/api';
import { execute, select, transaction } from '../../composables/useDatabase';
import type { Todo } from '../../types';

/* ===== 分类配置 ===== */
const CATEGORIES = [
  { key: 'work', label: '工作', icon: '💼', color: '#3b82f6' },
  { key: 'exercise', label: '锻炼', icon: '🏃', color: '#22c55e' },
  { key: 'life', label: '生活', icon: '🏠', color: '#f97316' },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]['key'];
type ViewMode = 'list' | 'day' | 'week';

const PRIORITY_MARK = { high: '🔴', medium: '🟡', low: '🟢' } as const;
const PRIORITY_LABEL = { high: '高', medium: '中', low: '低' } as const;
const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

/* ===== 状态 ===== */
const view = ref<ViewMode>('list');
const todos = ref<Todo[]>([]);
const activeCategory = ref<CategoryKey>('work');
const navDate = ref<string>(getTodayDate());
const loading = ref(false);
const timerMap = ref<Record<number, number>>({});
const liveTimer = ref(0);
let timerTick: ReturnType<typeof setInterval> | undefined;

/* ===== 添加弹窗 ===== */
const modalVisible = ref(false);
const form = ref({
  title: '',
  category: 'work' as CategoryKey,
  priority: 'medium' as 'high' | 'medium' | 'low',
  planned_start: '',
  planned_end: '',
});

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

function formatTime(time: string | null): string {
  if (!time) return '';
  // 兼容 "HH:MM" 和完整 ISO "2026-08-07T09:00:00" 格式
  const t = time.includes('T') ? time.split('T')[1] : time;
  return t.slice(0, 5);
}

/** 表单时间基准日期：列表视图用今天，日/周视图用当前导航日期 */
function formDateBase(): string {
  return view.value === 'list' ? getTodayDate() : navDate.value;
}

/** 将 <input type="time"> 的 "HH:MM" 转为完整 ISO 日期时间 */
function toFullIso(time: string | undefined): string | undefined {
  if (!time) return undefined;
  if (time.includes('T')) return time; // 已是完整 ISO
  return `${formDateBase()}T${time}:00`;
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

function getTodoDate(todo: Todo): string {
  if (todo.planned_start) return todo.planned_start.slice(0, 10);
  if (todo.due_date) return todo.due_date;
  return getTodayDate();
}

/* ===== 计算 ===== */
const filteredTodos = computed(() =>
  todos.value.filter((t) => t.category === activeCategory.value),
);

function countByCategory(key: CategoryKey): number {
  return todos.value.filter((t) => t.category === key && t.status === 'pending').length;
}

const headerLabel = computed(() => {
  if (view.value === 'list') return '任务列表';
  if (view.value === 'day') return `${shortDate(navDate.value)} ${dayLabel(navDate.value)}`;
  const start = getMonday(navDate.value);
  const end = addDays(start, 6);
  return `${shortDate(start)} - ${shortDate(end)}`;
});

const dayTodos = computed(() =>
  todos.value.filter((t) => getTodoDate(t) === navDate.value).sort((a, b) => {
    const ta = a.planned_start || '99:99';
    const tb = b.planned_start || '99:99';
    return ta.localeCompare(tb);
  }),
);

const weekData = computed(() => {
  const start = getMonday(navDate.value);
  const days: { date: string; items: Todo[] }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    days.push({
      date: d,
      items: todos.value.filter((t) => getTodoDate(t) === d).sort((a, b) => {
        const ta = a.planned_start || '99:99';
        const tb = b.planned_start || '99:99';
        return ta.localeCompare(tb);
      }),
    });
  }
  return days;
});

const totalPending = computed(() => todos.value.filter((t) => t.status === 'pending').length);
const totalDone = computed(() => todos.value.filter((t) => t.status === 'done').length);

/* ===== 加载 ===== */
async function loadTodos() {
  loading.value = true;
  try {
    todos.value = await getTodos();
  } finally {
    loading.value = false;
  }
}

/* ===== 导航 ===== */
function prev() {
  navDate.value = view.value === 'day' ? addDays(navDate.value, -1) : addDays(navDate.value, -7);
}
function next() {
  navDate.value = view.value === 'day' ? addDays(navDate.value, 1) : addDays(navDate.value, 7);
}
function goToday() {
  navDate.value = getTodayDate();
}

/* ===== 切换分类 ===== */
function switchCategory(key: CategoryKey) {
  activeCategory.value = key;
}

function switchView(v: ViewMode) {
  if (view.value === v) return;
  view.value = v;
  if (v !== 'list') navDate.value = getTodayDate();
}

/* ===== 添加 ===== */
function openAddModal() {
  form.value = {
    title: '',
    category: activeCategory.value,
    priority: 'medium',
    planned_start: '',
    planned_end: '',
  };
  modalVisible.value = true;
}

async function submitTodo() {
  const title = form.value.title.trim();
  if (!title) return;
  await createTodo({
    title,
    category: form.value.category,
    priority: form.value.priority,
    planned_start: toFullIso(form.value.planned_start),
    planned_end: toFullIso(form.value.planned_end),
  });
  modalVisible.value = false;
  await loadTodos();
}

/* ===== 完成待办 ===== */
async function toggleTodo(todo: Todo) {
  const newStatus: Todo['status'] = todo.status === 'pending' ? 'done' : 'pending';

  // 事务保护：状态更新与时间记录写入原子化，避免中间状态
  await transaction(async () => {
    await updateTodo(todo.id, { status: newStatus });

    // 完成时若存在完整计划时段，自动写入时间记录（planned_start/end 已是完整 ISO）
    if (newStatus === 'done' && todo.planned_start && todo.planned_end) {
      const start = todo.planned_start;
      const end = todo.planned_end;
      const duration = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
      if (duration > 0) {
        await createTimeRecord({
          category: todo.category,
          description: todo.title,
          todo_id: todo.id,
          start_time: start,
          end_time: end,
          duration,
          date: getTodoDate(todo),
        });
      }
    }
  });
  await loadTodos();
}

/* ===== 删除 ===== */
async function removeTodo(id: number) {
  await deleteTodo(id);
  await loadTodos();
}

/* ===== 计时 ===== */
async function toggleTimer(todo: Todo) {
  if (timerMap.value[todo.id]) {
    const startTime = timerMap.value[todo.id];
    const now = new Date();
    const duration = Math.round((now.getTime() - startTime) / 1000);
    // 找到该 todo 当前未结束的计时记录并结束它
    const active = await select<{ id: number }>(
      'SELECT id FROM time_records WHERE todo_id = $1 AND end_time IS NULL AND deleted_at IS NULL ORDER BY id DESC LIMIT 1',
      [todo.id],
    );
    if (active[0]) {
      await updateTimeRecord(active[0].id, {
        end_time: now.toISOString(),
        duration,
      });
    }
    delete timerMap.value[todo.id];
  } else {
    const now = new Date();
    await createTimeRecord({
      category: todo.category,
      description: todo.title,
      todo_id: todo.id,
      start_time: now.toISOString(),
      date: getTodayDate(),
    });
    timerMap.value[todo.id] = now.getTime();
  }
}

function isTiming(todoId: number): boolean {
  return !!timerMap.value[todoId];
}

function timingSeconds(todoId: number): number {
  if (!timerMap.value[todoId]) return 0;
  return Math.floor((Date.now() - timerMap.value[todoId]) / 1000);
}

function fmtTimer(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function catColor(key: string): string {
  return CATEGORIES.find((c) => c.key === key)?.color || '#94a3b8';
}

/* ===== 生命周期 ===== */
function onTodoUpdated() {
  loadTodos();
}

/** 清理页面刷新遗留的孤儿时间记录（end_time IS NULL） */
async function cleanupOrphanTimers() {
  const orphans = await select<{ id: number; start_time: string; todo_id: number }>(
    'SELECT id, start_time, todo_id FROM time_records WHERE end_time IS NULL AND deleted_at IS NULL',
  );
  for (const orphan of orphans) {
    const start = new Date(orphan.start_time);
    const now = new Date();
    const duration = Math.round((now.getTime() - start.getTime()) / 1000);
    if (duration > 0) {
      await execute(
        'UPDATE time_records SET end_time = $1, duration = $2 WHERE id = $3',
        [now.toISOString(), duration, orphan.id],
      );
    } else {
      // 异常记录（开始时间在未来），直接软删除
      await execute('UPDATE time_records SET deleted_at = datetime(\'now\') WHERE id = $1', [orphan.id]);
    }
  }
}

onMounted(() => {
  loadTodos();
  cleanupOrphanTimers().catch(() => { /* ignore */ });
  timerTick = setInterval(() => { liveTimer.value++; }, 1000);
  window.addEventListener('todo-updated', onTodoUpdated);
});

onUnmounted(() => {
  if (timerTick) clearInterval(timerTick);
  window.removeEventListener('todo-updated', onTodoUpdated);
  // 保存正在进行的计时器到数据库（fire-and-forget，避免组件卸载丢失计时）
  const now = new Date();
  for (const [todoId, startTime] of Object.entries(timerMap.value)) {
    const duration = Math.round((now.getTime() - startTime) / 1000);
    execute(
      `UPDATE time_records SET end_time = $1, duration = $2 WHERE todo_id = $3 AND end_time IS NULL`,
      [now.toISOString(), duration, Number(todoId)],
    ).catch(() => { /* ignore */ });
  }
  timerMap.value = {};
});
</script>

<template>
  <BaseCard icon="✅" title="任务">
    <template #actions>
      <button class="task-add-btn" title="添加任务" @click="openAddModal">＋</button>
    </template>

    <!-- 视图切换 -->
    <div class="task-toolbar">
      <div class="task-view-toggle">
        <button class="task-seg" :class="{ 'task-seg--active': view === 'list' }" @click="switchView('list')">列表</button>
        <button class="task-seg" :class="{ 'task-seg--active': view === 'day' }" @click="switchView('day')">日</button>
        <button class="task-seg" :class="{ 'task-seg--active': view === 'week' }" @click="switchView('week')">周</button>
      </div>
      <div v-if="view !== 'list'" class="task-nav">
        <button class="task-nav-btn" @click="prev">‹</button>
        <button class="task-nav-label" @click="goToday">{{ headerLabel }}</button>
        <button class="task-nav-btn" :disabled="isToday(navDate)" @click="next">›</button>
      </div>
      <div v-else class="task-stats">
        <span class="task-stat-pending">{{ totalPending }} 待办</span>
        <span class="task-stat-done">{{ totalDone }} 已完成</span>
      </div>
    </div>

    <!-- 分类标签页（列表视图） -->
    <div v-if="view === 'list'" class="task-tabs">
      <button
        v-for="cat in CATEGORIES"
        :key="cat.key"
        class="task-tab"
        :class="{ 'task-tab--active': activeCategory === cat.key }"
        :style="activeCategory === cat.key ? { borderColor: cat.color, color: cat.color } : {}"
        :title="cat.label"
        @click="switchCategory(cat.key)"
      >
        <span class="task-tab-icon">{{ cat.icon }}</span>
        <span class="task-tab-count">{{ countByCategory(cat.key) }}</span>
      </button>
    </div>

    <!-- 列表视图 -->
    <div v-if="view === 'list'" class="task-list">
      <div
        v-for="todo in filteredTodos"
        :key="todo.id"
        class="task-item"
        :class="{ 'task-item--done': todo.status === 'done' }"
      >
        <label class="task-check">
          <input type="checkbox" :checked="todo.status === 'done'" @change="toggleTodo(todo)" />
        </label>
        <span class="task-priority" :title="PRIORITY_LABEL[todo.priority]">{{ PRIORITY_MARK[todo.priority] }}</span>
        <div class="task-main">
          <span class="task-title">{{ todo.title }}</span>
          <span v-if="todo.planned_start && todo.planned_end" class="task-time">
            🕐 {{ formatTime(todo.planned_start) }}-{{ formatTime(todo.planned_end) }}
          </span>
        </div>
        <span v-if="isTiming(todo.id)" class="task-timer-live">{{ fmtTimer(timingSeconds(todo.id)) }}</span>
        <button class="task-timer" :class="{ 'task-timer--active': isTiming(todo.id) }" :title="isTiming(todo.id) ? '停止计时' : '开始计时'" @click="toggleTimer(todo)">⏱</button>
        <button class="task-del" title="删除" @click="removeTodo(todo.id)">🗑</button>
      </div>
      <div v-if="!loading && filteredTodos.length === 0" class="task-empty">暂无任务</div>
    </div>

    <!-- 日视图 -->
    <div v-else-if="view === 'day'" class="task-day-view">
      <div v-for="todo in dayTodos" :key="todo.id" class="task-day-item" :class="{ 'task-day-item--done': todo.status === 'done' }">
        <div class="task-day-time">
          <span v-if="todo.planned_start" class="task-day-t">{{ formatTime(todo.planned_start) }}</span>
          <span v-else class="task-day-t task-day-t--none">全天</span>
          <span v-if="todo.planned_end" class="task-day-te">{{ formatTime(todo.planned_end) }}</span>
        </div>
        <div class="task-day-line" :style="{ background: catColor(todo.category) }"></div>
        <div class="task-day-content">
          <div class="task-day-row">
            <label class="task-check"><input type="checkbox" :checked="todo.status === 'done'" @change="toggleTodo(todo)" /></label>
            <span class="task-day-title">{{ todo.title }}</span>
            <span class="task-day-cat" :style="{ background: catColor(todo.category) + '22', color: catColor(todo.category) }">
              {{ CATEGORIES.find(c => c.key === todo.category)?.icon }}
            </span>
          </div>
        </div>
        <button class="task-timer" :class="{ 'task-timer--active': isTiming(todo.id) }" @click="toggleTimer(todo)">⏱</button>
        <button class="task-del" @click="removeTodo(todo.id)">🗑</button>
      </div>
      <div v-if="dayTodos.length === 0" class="task-empty">当日暂无任务</div>
    </div>

    <!-- 周视图 -->
    <div v-else class="task-week-view">
      <div
        v-for="d in weekData"
        :key="d.date"
        class="task-week-row"
        :class="{ 'task-week-row--today': isToday(d.date) }"
      >
        <div class="task-week-date">
          <span class="task-week-day">{{ dayLabel(d.date) }}</span>
          <span class="task-week-md">{{ shortDate(d.date).slice(-2) }}</span>
        </div>
        <div class="task-week-body">
          <span v-if="d.items.length === 0" class="task-week-empty">—</span>
          <template v-else>
            <div v-for="todo in d.items" :key="todo.id" class="task-week-item" :class="{ 'task-week-item--done': todo.status === 'done' }">
              <span class="task-week-dot" :style="{ background: catColor(todo.category) }"></span>
              <span v-if="todo.planned_start" class="task-week-time">{{ formatTime(todo.planned_start) }}</span>
              <span class="task-week-title">{{ todo.title }}</span>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 添加弹窗 -->
    <BaseModal :visible="modalVisible" title="添加任务" @close="modalVisible = false">
      <div class="task-form">
        <div class="form-row">
          <input v-model="form.title" class="form-input" placeholder="任务标题" @keyup.enter="submitTodo" />
        </div>
        <div class="form-row">
          <label class="form-label">分类</label>
          <div class="form-segments">
            <button
              v-for="cat in CATEGORIES"
              :key="cat.key"
              class="segment"
              :class="{ 'segment--active': form.category === cat.key }"
              :style="form.category === cat.key ? { borderColor: cat.color, color: cat.color, background: cat.color + '22' } : {}"
              @click="form.category = cat.key"
            >{{ cat.icon }} {{ cat.label }}</button>
          </div>
        </div>
        <div class="form-row">
          <label class="form-label">优先级</label>
          <div class="form-segments">
            <button
              v-for="p in (['high', 'medium', 'low'] as const)"
              :key="p"
              class="segment"
              :class="{ 'segment--active': form.priority === p }"
              @click="form.priority = p"
            >{{ PRIORITY_MARK[p] }} {{ PRIORITY_LABEL[p] }}</button>
          </div>
        </div>
        <div class="form-row">
          <label class="form-label">计划时间（可选）</label>
          <div class="form-times">
            <input v-model="form.planned_start" type="time" class="form-input time-input" />
            <span class="time-sep">—</span>
            <input v-model="form.planned_end" type="time" class="form-input time-input" />
          </div>
        </div>
      </div>
      <template #footer>
        <button class="btn btn-cancel" @click="modalVisible = false">取消</button>
        <button class="btn btn-confirm" @click="submitTodo">添加</button>
      </template>
    </BaseModal>
  </BaseCard>
</template>

<style scoped>
/* 工具栏 */
.task-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  flex-shrink: 0;
}

.task-view-toggle {
  display: flex;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.task-seg {
  padding: 4px 12px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 12px;
  transition: all 0.2s;
}

.task-seg:hover { color: var(--text-primary); }

.task-seg--active {
  background: var(--accent-color);
  color: #fff;
}

.task-nav {
  display: flex;
  align-items: center;
  gap: 2px;
}

.task-nav-btn {
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
  transition: all 0.2s;
}

.task-nav-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.task-nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.task-nav-label {
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

.task-nav-label:hover { background: var(--bg-hover); }

.task-stats {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.task-stat-pending { color: var(--accent-color); }

/* 分类标签页 */
.task-tabs {
  display: flex;
  gap: 2px;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.task-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 4px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 12px;
  transition: color 0.2s, border-color 0.2s;
  margin-bottom: -1px;
}

.task-tab:hover { color: var(--text-primary); }

.task-tab--active {
  color: var(--text-primary);
  border-bottom-color: var(--accent-color);
}

.task-tab-icon { font-size: 14px; line-height: 1; }
.task-tab-label { font-weight: 500; }

.task-tab-count {
  font-size: 10px;
  background: var(--bg-hover);
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.task-tab--active .task-tab-count {
  background: var(--accent-light);
  color: var(--accent-color);
}

/* 添加按钮 */
.task-add-btn {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent-color);
  color: #fff;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.task-add-btn:hover {
  background: var(--accent-hover);
  transform: scale(1.05);
}

/* 列表视图 */
.task-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 6px;
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}

.task-item:hover { background: var(--bg-hover); }
.task-item--done .task-title { text-decoration: line-through; color: var(--text-tertiary); }

.task-check { display: flex; align-items: center; cursor: pointer; }
.task-check input { cursor: pointer; width: 14px; height: 14px; accent-color: var(--accent-color); }

.task-priority { font-size: 10px; flex-shrink: 0; }

.task-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.task-title {
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-time {
  font-size: 11px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.task-timer-live {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent-color);
  font-variant-numeric: tabular-nums;
  background: var(--accent-light);
  padding: 2px 6px;
  border-radius: 4px;
}

.task-timer, .task-del {
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

.task-timer:hover, .task-del:hover { opacity: 1; background: var(--bg-hover); }

.task-timer--active {
  opacity: 1;
  animation: timer-pulse 1.5s ease-in-out infinite;
}

@keyframes timer-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.9); }
}

.task-empty {
  padding: 32px 0;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
}

/* 日视图 */
.task-day-view {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.task-day-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 6px;
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}

.task-day-item:hover { background: var(--bg-hover); }
.task-day-item--done .task-day-title { text-decoration: line-through; color: var(--text-tertiary); }

.task-day-time {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 48px;
  flex-shrink: 0;
}

.task-day-t {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.task-day-t--none { color: var(--text-tertiary); font-weight: 400; }
.task-day-te { font-size: 10px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }

.task-day-line {
  width: 3px;
  align-self: stretch;
  border-radius: 2px;
  flex-shrink: 0;
}

.task-day-content {
  flex: 1;
  min-width: 0;
}

.task-day-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.task-day-title {
  font-size: 13px;
  color: var(--text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-day-cat {
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

/* 周视图 */
.task-week-view {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.task-week-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 6px;
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}

.task-week-row:hover { background: var(--bg-hover); }
.task-week-row--today { background: var(--accent-light); }

.task-week-date {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 36px;
  flex-shrink: 0;
  padding-top: 2px;
}

.task-week-day { font-size: 10px; color: var(--text-secondary); }
.task-week-md { font-size: 13px; font-weight: 600; color: var(--text-primary); font-variant-numeric: tabular-nums; }

.task-week-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.task-week-empty { font-size: 12px; color: var(--text-tertiary); }

.task-week-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.task-week-item--done .task-week-title { text-decoration: line-through; color: var(--text-tertiary); }

.task-week-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.task-week-time {
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.task-week-title {
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 表单 */
.task-form { display: flex; flex-direction: column; gap: 16px; }
.form-row { display: flex; flex-direction: column; gap: 8px; }
.form-label { font-size: 12px; color: var(--text-secondary); }

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

.form-segments { display: flex; gap: 6px; }

.segment {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.segment:hover { border-color: var(--border-hover); }

.segment--active {
  border-color: var(--accent-color);
  color: var(--accent-color);
  background: var(--accent-light);
}

.form-times { display: flex; align-items: center; gap: 8px; }
.time-input { flex: 1; }
.time-sep { color: var(--text-tertiary); flex-shrink: 0; }

/* 按钮 */
.btn {
  padding: 8px 18px;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.btn-cancel { background: var(--bg-hover); color: var(--text-secondary); }
.btn-cancel:hover { background: var(--border-color); }
.btn-confirm { background: var(--accent-color); color: #fff; }
.btn-confirm:hover { background: var(--accent-hover); }
</style>
