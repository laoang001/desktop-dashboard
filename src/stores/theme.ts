import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export type ThemeMode = 'light' | 'dark';

export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>('light');
  /** 卡片透明度 0.3 ~ 1 */
  const cardOpacity = ref<number>(0.78);

  function applyTheme(m: ThemeMode) {
    document.documentElement.setAttribute('data-theme', m);
  }

  function applyOpacity(o: number) {
    document.documentElement.style.setProperty('--card-opacity', String(o));
  }

  function toggle() {
    mode.value = mode.value === 'light' ? 'dark' : 'light';
  }

  function setMode(m: ThemeMode) {
    mode.value = m;
  }

  function setOpacity(o: number) {
    cardOpacity.value = Math.max(0.3, Math.min(1, o));
  }

  // 初始化
  const saved = localStorage.getItem('theme-mode');
  if (saved === 'dark' || saved === 'light') {
    mode.value = saved;
  }
  applyTheme(mode.value);

  const savedOpacity = localStorage.getItem('card-opacity');
  if (savedOpacity) {
    const o = parseFloat(savedOpacity);
    if (!Number.isNaN(o)) cardOpacity.value = Math.max(0.3, Math.min(1, o));
  }
  applyOpacity(cardOpacity.value);

  watch(mode, (m) => {
    applyTheme(m);
    localStorage.setItem('theme-mode', m);
  });

  watch(cardOpacity, (o) => {
    applyOpacity(o);
    localStorage.setItem('card-opacity', String(o));
  });

  return { mode, cardOpacity, toggle, setMode, setOpacity };
});
