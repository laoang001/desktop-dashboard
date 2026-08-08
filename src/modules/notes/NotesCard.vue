<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue';
import BaseCard from '../../components/common/BaseCard.vue';
import { getNotes, createNote, updateNote, deleteNote } from './api';
import type { DiaryEntry } from '../../types';

/* ===== 状态 ===== */
const notes = ref<DiaryEntry[]>([]);
const inputContent = ref('');
const editingId = ref<number | null>(null);
const editingContent = ref('');
const editTextareaRefs = ref<HTMLTextAreaElement[]>([]);

/* ===== 工具 ===== */
function formatTime(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${m}-${day} ${h}:${min}`;
}

/* ===== 加载 ===== */
async function loadNotes() {
  notes.value = await getNotes();
}

/* ===== 创建笔记 ===== */
async function submitNote() {
  const content = inputContent.value.trim();
  if (!content) return;
  await createNote(content, []);
  inputContent.value = '';
  await loadNotes();
}

/* ===== 置顶 ===== */
async function togglePin(note: DiaryEntry) {
  await updateNote(note.id, { pinned: note.pinned ? 0 : 1 });
  await loadNotes();
}

/* ===== 删除 ===== */
async function removeNote(id: number) {
  await deleteNote(id);
  await loadNotes();
}

/* ===== 编辑 ===== */
async function startEdit(note: DiaryEntry) {
  editingId.value = note.id;
  editingContent.value = note.content;
  editTextareaRefs.value = [];
  await nextTick();
  const el = editTextareaRefs.value[editTextareaRefs.value.length - 1];
  el?.focus();
}

async function commitEdit() {
  if (editingId.value === null) return;
  const content = editingContent.value.trim();
  if (content && content !== notes.value.find((n: DiaryEntry) => n.id === editingId.value)?.content) {
    await updateNote(editingId.value, { content });
  }
  editingId.value = null;
  editingContent.value = '';
  await loadNotes();
}

function cancelEdit() {
  editingId.value = null;
  editingContent.value = '';
}

/* ===== 生命周期 ===== */
function onDiaryUpdated() { loadNotes(); }
onMounted(() => {
  loadNotes();
  window.addEventListener('diary-updated', onDiaryUpdated);
});
onUnmounted(() => {
  window.removeEventListener('diary-updated', onDiaryUpdated);
});
</script>

<template>
  <BaseCard icon="📝" title="日记">
    <!-- 快速输入 -->
    <div class="notes-input-wrap">
      <input
        v-model="inputContent"
        class="notes-input"
        placeholder="快速记录日记，回车提交…"
        @keyup.enter="submitNote"
      />
    </div>

    <!-- 笔记列表 -->
    <div class="notes-list">
      <div
        v-for="note in notes"
        :key="note.id"
        class="note-item"
        :class="{ 'note-item--pinned': note.pinned }"
      >
        <div class="note-content">
          <!-- 编辑态 -->
          <textarea
            v-if="editingId === note.id"
            :ref="(el) => { if (el) editTextareaRefs.push(el as HTMLTextAreaElement) }"
            v-model="editingContent"
            class="note-textarea"
            @blur="commitEdit"
            @keyup.esc="cancelEdit"
            @keydown.ctrl.enter="commitEdit"
            @keydown.meta.enter="commitEdit"
          ></textarea>
          <!-- 展示态 -->
          <p
            v-else
            class="note-text"
            title="双击编辑"
            @dblclick="startEdit(note)"
          >
            {{ note.content }}
          </p>

          <div class="note-meta">
            <span class="note-time">{{ formatTime(note.created_at) }}</span>
            <span
              v-for="tag in (note.tags || [])"
              :key="tag"
              class="note-tag"
            >
              #{{ tag }}
            </span>
          </div>
        </div>

        <div class="note-actions">
          <button
            class="note-action"
            :class="{ 'note-action--active': note.pinned }"
            :title="note.pinned ? '取消置顶' : '置顶'"
            @click="togglePin(note)"
          >
            📌
          </button>
          <button
            class="note-action"
            title="删除"
            @click="removeNote(note.id)"
          >
            🗑
          </button>
        </div>
      </div>

      <div v-if="notes.length === 0" class="notes-empty">暂无日记</div>
    </div>
  </BaseCard>
</template>

<style scoped>
/* 输入框 */
.notes-input-wrap {
  margin-bottom: 10px;
  flex-shrink: 0;
}

.notes-input {
  width: 100%;
  padding: 9px 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  font-family: inherit;
}

.notes-input:focus {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.notes-input::placeholder {
  color: var(--text-tertiary);
}

/* 笔记列表 */
.notes-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.note-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  border: 1px solid transparent;
  transition: all 0.2s;
}

.note-item:hover {
  border-color: var(--border-color);
  background: var(--bg-card-solid);
  box-shadow: var(--shadow-sm);
}

.note-item--pinned {
  border-color: var(--accent-color);
  background: var(--accent-light);
}

.note-item--pinned:hover {
  border-color: var(--accent-color);
  background: var(--accent-light);
}

.note-content {
  flex: 1;
  min-width: 0;
}

.note-text {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  cursor: pointer;
  transition: color 0.15s;
}

.note-text:hover {
  color: var(--accent-color);
}

.note-textarea {
  width: 100%;
  min-height: 64px;
  padding: 6px 8px;
  border: 1px solid var(--accent-color);
  border-radius: 4px;
  background: var(--bg-card-solid);
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.55;
  font-family: inherit;
  resize: vertical;
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-light);
}

.note-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.note-time {
  font-size: 11px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.note-tag {
  font-size: 11px;
  color: var(--accent-color);
  background: var(--accent-light);
  padding: 1px 6px;
  border-radius: 4px;
}

/* 操作按钮 */
.note-actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s;
  flex-shrink: 0;
}

.note-item:hover .note-actions,
.note-item--pinned .note-actions {
  opacity: 1;
}

.note-action {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  font-size: 12px;
  opacity: 0.55;
  transition: opacity 0.2s, background 0.2s;
  line-height: 1;
}

.note-action:hover {
  opacity: 1;
  background: var(--bg-hover);
}

.note-action--active {
  opacity: 1;
}

.notes-empty {
  padding: 32px 0;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
}
</style>
