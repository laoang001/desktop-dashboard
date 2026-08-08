<script setup lang="ts">
/** ModuleGrid - 2列等高网格 */
</script>

<template>
  <div class="module-grid">
    <slot />
  </div>
</template>

<style scoped>
.module-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  width: 100%;
  align-items: stretch;
}

.module-grid__item--wide {
  grid-column: span 2;
}

@media (max-width: 768px) {
  .module-grid {
    grid-template-columns: 1fr;
  }
}
</style>
