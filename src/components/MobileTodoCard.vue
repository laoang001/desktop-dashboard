<script setup lang="ts">
/**
 * MobileTodoCard - 移动端首页待办卡片
 */
import { ref, onMounted, onUnmounted } from 'vue';
import { getTodos, updateTodo } from '../modules/todo/api';
import type { Todo } from '../types';
import Icon from './Icon.vue';

const emit = defineEmits<{ 'pending-count': [count: number] }>();

const todos = ref<Todo[]>([]);

async function loadTodos() {
  try {
    const all = await getTodos();
    // 只显示今日待办，最多3条
    const today = new Date().toISOString().slice(0, 10);
    todos.value = all
      .filter(t => !t.planned_start || t.planned_start.startsWith(today))
      .slice(0, 3);
    emit('pending-count', todos.value.filter(t => t.status === 'pending').length);
  } catch {
    todos.value = [];
  }
}

async function toggleTodo(todo: Todo) {
  const newStatus: Todo['status'] = todo.status === 'pending' ? 'done' : 'pending';
  await updateTodo(todo.id, { status: newStatus });
  await loadTodos();
}

function fmtTime(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(11, 16);
}

function onTodoUpdated() { loadTodos(); }
onMounted(() => {
  loadTodos();
  window.addEventListener('todo-updated', onTodoUpdated);
});
onUnmounted(() => {
  window.removeEventListener('todo-updated', onTodoUpdated);
});
</script>

<template>
  <div class="m-todo-card">
    <div class="m-card-header">
      <div class="m-card-title-row">
        <Icon name="check" :size="16" class="m-card-icon" />
        <span class="m-card-title">今日待办</span>
      </div>
      <span class="m-card-count" v-if="todos.length">{{ todos.length }}</span>
    </div>
    <div v-if="todos.length === 0" class="m-empty">暂无待办</div>
    <div v-else class="m-todo-list">
      <div v-for="todo in todos" :key="todo.id" class="m-todo-item" @click="toggleTodo(todo)">
        <div class="m-todo-check" :class="{ done: todo.status === 'done' }">
          <Icon v-if="todo.status === 'done'" name="check" :size="12" />
        </div>
        <div class="m-todo-text" :class="{ done: todo.status === 'done' }">{{ todo.title }}</div>
        <div class="m-todo-time" v-if="todo.planned_start">{{ fmtTime(todo.planned_start) }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.m-todo-card {
  background: var(--bg-card, #fafafa);
  border-radius: 14px;
  padding: 14px 16px;
  border: 1px solid var(--border-color, #e5e5ea);
}
.m-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.m-card-title-row { display: flex; align-items: center; gap: 6px; }
.m-card-icon { color: #6366f1; }
.m-card-title { font-size: 14px; font-weight: 600; }
.m-card-count {
  font-size: 11px;
  background: #eef2ff;
  color: #6366f1;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 500;
}
.m-empty { font-size: 13px; color: var(--text-tertiary, #aeaeb2); text-align: center; padding: 8px 0; }
.m-todo-list { display: flex; flex-direction: column; gap: 8px; }
.m-todo-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  cursor: pointer;
}
.m-todo-check {
  width: 18px; height: 18px;
  border: 1.5px solid var(--text-tertiary, #aeaeb2);
  border-radius: 4px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #fff;
}
.m-todo-check.done {
  background: #22c55e;
  border-color: #22c55e;
}
.m-todo-text { flex: 1; font-size: 13px; }
.m-todo-text.done { color: var(--text-tertiary, #aeaeb2); text-decoration: line-through; }
.m-todo-time { font-size: 11px; color: var(--text-tertiary, #aeaeb2); }
</style>
