<script setup lang="ts">
/** BaseModal - 模态弹窗（ESC 关闭 + 焦点陷阱 + ARIA 无障碍） */
import { ref, watch, nextTick, onBeforeUnmount } from 'vue';

const props = withDefaults(defineProps<{
  visible: boolean;
  title?: string;
  width?: string;
}>(), {
  title: '',
  width: '420px',
});

const emit = defineEmits<{
  close: [];
  confirm: [];
}>();

const contentRef = ref<HTMLElement | null>(null);
let lastFocused: HTMLElement | null = null;

/** 获取模态内可聚焦元素 */
function getFocusable(): HTMLElement[] {
  if (!contentRef.value) return [];
  return Array.from(contentRef.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ));
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
    return;
  }
  // 焦点陷阱：Tab/Shift+Tab 在模态内循环
  if (e.key === 'Tab') {
    const focusable = getFocusable();
    if (focusable.length === 0) {
      e.preventDefault();
      contentRef.value?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

watch(() => props.visible, async (val) => {
  if (val) {
    lastFocused = document.activeElement as HTMLElement;
    window.addEventListener('keydown', onKeydown);
    await nextTick();
    // 打开后聚焦模态内容或首个可聚焦元素
    const focusable = getFocusable();
    if (focusable.length > 0) focusable[0].focus();
    else contentRef.value?.focus();
  } else {
    window.removeEventListener('keydown', onKeydown);
    // 关闭后恢复焦点
    if (lastFocused) {
      lastFocused.focus();
      lastFocused = null;
    }
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click.self="emit('close')">
        <div
          ref="contentRef"
          class="modal-content"
          :style="{ maxWidth: width }"
          role="dialog"
          aria-modal="true"
          :aria-label="title || '对话框'"
          tabindex="-1"
        >
          <div class="modal-header">
            <h3 class="modal-title">{{ title }}</h3>
            <button class="modal-close" aria-label="关闭" @click="emit('close')">✕</button>
          </div>
          <div class="modal-body">
            <slot />
          </div>
          <div v-if="$slots.footer" class="modal-footer">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  width: 90%;
  background: var(--bg-card-solid);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.modal-title {
  font-size: 16px;
  font-weight: 600;
}

.modal-close {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s;
}

.modal-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
