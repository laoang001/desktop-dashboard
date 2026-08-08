<script setup lang="ts">
/** BaseCard - 基础卡片组件 */
withDefaults(defineProps<{
  title?: string;
  icon?: string;
  wide?: boolean;
}>(), {
  title: '',
  icon: '',
  wide: false,
});
</script>

<template>
  <div class="base-card" :class="{ 'base-card--wide': wide }">
    <div v-if="title || $slots.header" class="base-card__header">
      <slot name="header">
        <span v-if="icon" class="base-card__icon">{{ icon }}</span>
        <span class="base-card__title">{{ title }}</span>
      </slot>
      <div v-if="$slots.actions" class="base-card__actions">
        <slot name="actions" />
      </div>
    </div>
    <div class="base-card__body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.base-card {
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  box-shadow: var(--shadow-md);
  padding: var(--spacing);
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  transition: box-shadow 0.3s ease, transform 0.3s ease, border-color 0.3s;
  overflow: hidden;
}

.base-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--accent-gradient);
  opacity: 0;
  transition: opacity 0.3s;
}

.base-card:hover {
  box-shadow: var(--shadow-lg);
  border-color: var(--border-hover);
  transform: translateY(-2px);
}

.base-card:hover::before {
  opacity: 1;
}

.base-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.base-card__icon {
  font-size: 17px;
  margin-right: 6px;
  line-height: 1;
}

.base-card__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.4px;
}

.base-card__actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.base-card__body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}
</style>
