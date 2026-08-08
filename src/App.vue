<script setup lang="ts">
import Home from './components/Home.vue';
import SettingsPanel from './components/SettingsPanel.vue';
import { useLayoutStore } from './stores/layout';

const layoutStore = useLayoutStore();
</script>

<template>
  <div class="app">
    <Home />
    <SettingsPanel v-if="layoutStore.settingsOpen" />
  </div>
</template>

<style scoped>
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-app);
  backdrop-filter: blur(30px) saturate(180%);
  -webkit-backdrop-filter: blur(30px) saturate(180%);
  border-radius: 20px;
  border: 1px solid var(--bg-app-border);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
}
</style>
