<script setup lang="ts">
/**
 * MobileShell - 移动端外壳 V3
 * - 顶部不放时间（状态栏已有），只放问候语 + 设置
 * - 底部导航：首页 / 日程 / AI / 记账 / 时间
 * - 日记作为日程页面的二级 tab（日程/日记），不再放首页
 */
import { ref, computed, onMounted, onUnmounted, defineAsyncComponent } from 'vue';
import MobileTodoCard from './MobileTodoCard.vue';
import MobileExpenseCard from './MobileExpenseCard.vue';
import VoiceButton from './VoiceButton.vue';
import Icon from './Icon.vue';

type MobileTab = 'home' | 'schedule' | 'accounting' | 'timer';

const activeTab = ref<MobileTab>('home');

/* 日程页面二级 tab：日程 / 日记 */
type ScheduleSubTab = 'schedule' | 'diary';
const scheduleSubTab = ref<ScheduleSubTab>('schedule');

/* 问候语 */
const greeting = ref('');
const dateText = ref('');
const pendingCount = ref(0);

function updateGreeting() {
  const d = new Date();
  const hour = d.getHours();
  if (hour < 6) greeting.value = '深夜好';
  else if (hour < 9) greeting.value = '早上好';
  else if (hour < 12) greeting.value = '上午好';
  else if (hour < 14) greeting.value = '中午好';
  else if (hour < 18) greeting.value = '下午好';
  else if (hour < 22) greeting.value = '晚上好';
  else greeting.value = '夜深了';

  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  dateText.value = `${month}月${day}日 ${weekdays[d.getDay()]}`;
}

let greetTimer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  updateGreeting();
  greetTimer = setInterval(updateGreeting, 60000);
});
onUnmounted(() => {
  if (greetTimer) clearInterval(greetTimer);
});

/* 设置弹窗 */
const settingsVisible = ref(false);

/* 异步加载各页面组件 */
const ScheduleCard = defineAsyncComponent(() => import('../modules/schedule/ScheduleCard.vue'));
const TimeTrackerCard = defineAsyncComponent(() => import('../modules/time-tracker/TimeTrackerCard.vue'));
const AccountingCard = defineAsyncComponent(() => import('../modules/accounting/AccountingCard.vue'));
const DiaryCard = defineAsyncComponent(() => import('../modules/notes/NotesCard.vue'));
const SettingsPanel = defineAsyncComponent(() => import('./SettingsPanel.vue'));

/* 当前页面组件（schedule 页面内部用 scheduleSubTab 切换日程/日记） */
const currentComponent = computed(() => {
  switch (activeTab.value) {
    case 'schedule': return scheduleSubTab.value === 'diary' ? DiaryCard : ScheduleCard;
    case 'timer': return TimeTrackerCard;
    case 'accounting': return AccountingCard;
    default: return null;
  }
});

/* 底部导航配置 */
const navItems = [
  { key: 'home' as const, icon: 'home', label: '首页' },
  { key: 'schedule' as const, icon: 'calendar', label: '日程' },
  { key: 'accounting' as const, icon: 'wallet', label: '记账' },
  { key: 'timer' as const, icon: 'clock', label: '时间' },
];
</script>

<template>
  <div class="mobile-shell">
    <!-- 安全区顶部（状态栏占位，确保不被电池/时间遮挡） -->
    <div class="safe-top"></div>

    <!-- 顶部栏：问候语 + 设置按钮 -->
    <header class="top-bar">
      <div class="top-left">
        <div class="greeting">{{ greeting }} 👋</div>
        <div class="date-sub">{{ dateText }}<span v-if="pendingCount"> · 还有 {{ pendingCount }} 件事</span></div>
      </div>
      <button class="settings-btn" @click="settingsVisible = true" aria-label="设置">
        <Icon name="settings" :size="18" />
      </button>
    </header>

    <!-- 内容区 -->
    <main class="content">
      <!-- 首页 -->
      <div v-if="activeTab === 'home'" class="home-page">
        <MobileTodoCard @pending-count="pendingCount = $event" />
        <MobileExpenseCard />
      </div>

      <!-- 日程页面：二级 tab 切换 日程/日记 -->
      <div v-else-if="activeTab === 'schedule'" class="schedule-page">
        <div class="sub-tabs">
          <button
            class="sub-tab"
            :class="{ active: scheduleSubTab === 'schedule' }"
            @click="scheduleSubTab = 'schedule'"
          >
            <Icon name="calendar" :size="14" />
            日程
          </button>
          <button
            class="sub-tab"
            :class="{ active: scheduleSubTab === 'diary' }"
            @click="scheduleSubTab = 'diary'"
          >
            <Icon name="pen" :size="14" />
            日记
          </button>
        </div>
        <KeepAlive>
          <component :is="currentComponent" :key="scheduleSubTab" />
        </KeepAlive>
      </div>

      <!-- 其他模块页面（记账/时间） -->
      <KeepAlive v-else>
        <component :is="currentComponent" :key="activeTab" />
      </KeepAlive>
    </main>

    <!-- 底部导航栏 + AI按钮 -->
    <nav class="bottom-nav">
      <button
        v-for="item in navItems.slice(0, 2)"
        :key="item.key"
        class="nav-item"
        :class="{ active: activeTab === item.key }"
        @click="activeTab = item.key"
      >
        <Icon :name="item.icon" :size="22" />
        <span class="nav-label">{{ item.label }}</span>
      </button>

      <!-- AI 助手按钮（核心入口） -->
      <VoiceButton />

      <button
        v-for="item in navItems.slice(2)"
        :key="item.key"
        class="nav-item"
        :class="{ active: activeTab === item.key }"
        @click="activeTab = item.key"
      >
        <Icon :name="item.icon" :size="22" />
        <span class="nav-label">{{ item.label }}</span>
      </button>
    </nav>

    <!-- 安全区底部 -->
    <div class="safe-bottom"></div>

    <!-- 设置弹窗 -->
    <SettingsPanel v-if="settingsVisible" @close="settingsVisible = false" />
  </div>
</template>

<style scoped>
.mobile-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  background: var(--bg-muted, #f5f5f7);
  overflow: hidden;
}

/* 安全区 */
.safe-top {
  height: env(safe-area-inset-top, 0px);
  min-height: 0px;
  background: var(--bg-surface, #ffffff);
  flex-shrink: 0;
}
.safe-bottom {
  height: env(safe-area-inset-bottom, 0px);
  background: var(--bg-surface, #ffffff);
  flex-shrink: 0;
}

/* 顶部栏 */
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px 12px;
  background: var(--bg-surface, #ffffff);
  flex-shrink: 0;
}
.top-left { display: flex; flex-direction: column; gap: 2px; }
.greeting {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary, #1d1d1f);
  letter-spacing: 0.3px;
}
.date-sub {
  font-size: 11px;
  color: var(--text-secondary, #6e6e73);
}
.settings-btn {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: var(--bg-muted, #f5f5f7);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary, #6e6e73);
  cursor: pointer;
  flex-shrink: 0;
}
.settings-btn:active { background: var(--border-color, #e5e5ea); }

/* 内容区 */
.content {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 12px 16px;
}

/* 首页 */
.home-page { display: flex; flex-direction: column; gap: 12px; }

/* 日程页面：二级 tab */
.schedule-page { display: flex; flex-direction: column; gap: 10px; height: 100%; }

.sub-tabs {
  display: flex;
  gap: 4px;
  background: var(--bg-muted, #f5f5f7);
  border-radius: 10px;
  padding: 3px;
  flex-shrink: 0;
}
.sub-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 7px 10px;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  color: var(--text-secondary, #6e6e73);
  cursor: pointer;
  transition: all 0.18s;
}
.sub-tab.active {
  background: var(--bg-surface, #ffffff);
  color: #6366f1;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.sub-tab:active { transform: scale(0.97); }

/* 底部导航 */
.bottom-nav {
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  background: var(--bg-surface, #ffffff);
  border-top: 1px solid var(--border-color, #e5e5ea);
  padding: 8px 0 6px;
  position: relative;
  flex-shrink: 0;
}
.nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 4px 0;
  border: none;
  background: transparent;
  color: var(--text-tertiary, #aeaeb2);
  cursor: pointer;
}
.nav-item.active { color: #6366f1; }
.nav-label { font-size: 10px; }
.nav-item.active .nav-label { font-weight: 600; }
</style>
