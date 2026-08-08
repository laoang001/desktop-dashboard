import { defineStore } from 'pinia';
import { ref, watch, computed } from 'vue';

/** 模块 key 类型（与 Home.vue Tab 对齐，weather 在头部整合） */
export type ModuleKey =
  | 'weather'
  | 'schedule'
  | 'todo'
  | 'notes'
  | 'time-tracker'
  | 'ai-assistant';

/** 所有可用模块 */
export const ALL_MODULES: { key: ModuleKey; label: string; icon: string; description: string }[] = [
  { key: 'weather', label: '天气时钟', icon: '🌤️', description: '实时天气、时钟、时间进度（头部整合）' },
  { key: 'schedule', label: '日程', icon: '📅', description: '日程管理（日/周视图）、倒数纪念日' },
  { key: 'todo', label: '任务', icon: '✅', description: '任务管理（列表/日/周视图）+ 计时器 + 习惯打卡' },
  { key: 'time-tracker', label: '时间记录', icon: '⏱️', description: '时间轴、统计、目标追踪、技能累积' },
  { key: 'notes', label: '笔记', icon: '📝', description: '快速记录、标签、置顶（后续改为日记）' },
  { key: 'ai-assistant', label: 'AI助手', icon: '🤖', description: 'AI聊天、跨模块操作、语音输入' },
];

const DEFAULT_ORDER: ModuleKey[] = [
  'weather',
  'schedule',
  'todo',
  'time-tracker',
  'notes',
  'ai-assistant',
];

export const useLayoutStore = defineStore('layout', () => {
  const moduleOrder = ref<ModuleKey[]>([...DEFAULT_ORDER]);
  /** 已隐藏的模块 */
  const hiddenModules = ref<Set<ModuleKey>>(new Set());
  const settingsOpen = ref(false);

  // 从 localStorage 恢复
  const savedOrder = localStorage.getItem('module-order');
  if (savedOrder) {
    try {
      const parsed = JSON.parse(savedOrder) as ModuleKey[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        moduleOrder.value = parsed;
      }
    } catch { /* ignore */ }
  }

  const savedHidden = localStorage.getItem('hidden-modules');
  if (savedHidden) {
    try {
      const parsed = JSON.parse(savedHidden) as ModuleKey[];
      hiddenModules.value = new Set(parsed);
    } catch { /* ignore */ }
  }

  watch(moduleOrder, (val) => {
    localStorage.setItem('module-order', JSON.stringify(val));
  }, { deep: true });

  watch(hiddenModules, (val) => {
    localStorage.setItem('hidden-modules', JSON.stringify(Array.from(val)));
  }, { deep: true });

  /** 可见模块（按顺序，排除隐藏） */
  const visibleModules = computed(() =>
    moduleOrder.value.filter((k) => !hiddenModules.value.has(k)),
  );

  function reorder(from: number, to: number) {
    const item = moduleOrder.value.splice(from, 1)[0];
    moduleOrder.value.splice(to, 0, item);
  }

  function toggleModule(key: ModuleKey) {
    if (hiddenModules.value.has(key)) {
      hiddenModules.value.delete(key);
    } else {
      hiddenModules.value.add(key);
    }
    hiddenModules.value = new Set(hiddenModules.value);
  }

  function isHidden(key: ModuleKey): boolean {
    return hiddenModules.value.has(key);
  }

  function resetLayout() {
    moduleOrder.value = [...DEFAULT_ORDER];
    hiddenModules.value = new Set();
  }

  function toggleSettings() {
    settingsOpen.value = !settingsOpen.value;
  }

  return { moduleOrder, hiddenModules, visibleModules, settingsOpen, reorder, toggleModule, isHidden, resetLayout, toggleSettings };
});
