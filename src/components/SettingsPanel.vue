<script setup lang="ts">
/** SettingsPanel - 设置面板：主题、AI 配置、同步、布局重置、本地备份、开机自启、常驻桌面 */
import { ref, onMounted, computed } from 'vue';
import { useThemeStore } from '../stores/theme';
import { useLayoutStore } from '../stores/layout';
import { getLLMConfig, saveLLMConfig } from '../modules/ai-assistant/api';
import { getSyncConfigDecoded, saveSyncConfig, syncNow, getLastSyncTime, getDeviceId } from '../sync';
import { isMobile } from '../composables/usePlatform';
import { isTauri } from '../composables/isTauri';
import { exportBackup, importBackup } from '../composables/useBackup';
import type { SyncStatus } from '../sync';

const emit = defineEmits<{ (e: 'close'): void }>();

const themeStore = useThemeStore();
const layoutStore = useLayoutStore();

/* 平台标识：移动端隐藏部分桌面专属选项 */
const isMobileLayout = computed(() => isMobile());

/* ===== LLM 配置 ===== */
const apiUrl = ref('https://api.deepseek.com/v1/chat/completions');
const apiKey = ref('');
const model = ref('deepseek-chat');
const llmSaving = ref(false);
const llmSavedHint = ref(false);
const llmErrorHint = ref('');

/* ===== 同步配置 ===== */
const syncUrl = ref('');
const syncUser = ref('');
const syncPass = ref('');
const syncStatus = ref<SyncStatus>('idle');
const syncMessage = ref('');
const lastSyncTime = ref('');
const deviceId = ref('');
const syncSaving = ref(false);
const syncSavedHint = ref(false);

function close() {
  // 兼容两种调用方式：桌面端用 layoutStore.settingsOpen，移动端用 v-if + emit('close')
  layoutStore.settingsOpen = false;
  emit('close');
}

/* ===== 本地备份与恢复 ===== */
const backupBusy = ref(false);
const backupMsg = ref('');
const backupErr = ref('');
const fileInputRef = ref<HTMLInputElement | null>(null);

/* ===== 开机自启（仅桌面端） ===== */
const autoStartEnabled = ref(false);
const autoStartLoading = ref(false);

/* ===== 常驻桌面（仅桌面端） ===== */
const desktopModeEnabled = ref(false);
const desktopModeLoading = ref(false);

async function handleExport() {
  if (backupBusy.value) return;
  backupBusy.value = true;
  backupErr.value = '';
  backupMsg.value = '正在生成备份...';
  try {
    const result = await exportBackup();
    backupMsg.value = `✓ 已导出 ${result.tableCount} 张表，共 ${result.rowCount} 条记录`;
  } catch (err) {
    backupErr.value = err instanceof Error ? err.message : String(err);
    backupMsg.value = '';
  } finally {
    backupBusy.value = false;
  }
}

function triggerImport() {
  if (backupBusy.value) return;
  fileInputRef.value?.click();
}

async function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  backupBusy.value = true;
  backupErr.value = '';
  backupMsg.value = '正在恢复...';
  try {
    const result = await importBackup(file);
    backupMsg.value = `✓ 已恢复 ${result.tableCount} 张表，共 ${result.rowCount} 条记录，刷新后生效`;
  } catch (err) {
    backupErr.value = err instanceof Error ? err.message : String(err);
    backupMsg.value = '';
  } finally {
    backupBusy.value = false;
    input.value = ''; // 重置 input，允许重复选择同一文件
  }
}

/* ===== LLM ===== */
async function saveLLM() {
  llmSaving.value = true;
  llmErrorHint.value = '';
  try {
    await saveLLMConfig({
      apiUrl: apiUrl.value.trim(),
      apiKey: apiKey.value.trim(),
      model: model.value.trim() || 'deepseek-chat',
    });
    llmSavedHint.value = true;
    setTimeout(() => { llmSavedHint.value = false; }, 1500);
  } catch (err) {
    llmErrorHint.value = err instanceof Error ? err.message : String(err);
    console.error('[settings] 保存LLM配置失败:', err);
  } finally {
    llmSaving.value = false;
  }
}

/* ===== 同步 ===== */
async function saveSync() {
  syncSaving.value = true;
  try {
    await saveSyncConfig({
      url: syncUrl.value.trim(),
      username: syncUser.value.trim(),
      password: syncPass.value,
    });
    syncSavedHint.value = true;
    setTimeout(() => { syncSavedHint.value = false; }, 1500);
  } catch (err) {
    console.error('[settings] 保存同步配置失败:', err);
  } finally {
    syncSaving.value = false;
  }
}

async function doSync() {
  const config = await getSyncConfigDecoded();
  if (!config) {
    syncStatus.value = 'error';
    syncMessage.value = '请先配置同步信息';
    return;
  }
  syncStatus.value = 'syncing';
  syncMessage.value = '同步中...';
  try {
    const result = await syncNow(config);
    syncStatus.value = result.status;
    syncMessage.value = result.message;
    if (result.status === 'success') {
      lastSyncTime.value = formatTime(new Date().toISOString());
    }
  } catch (err) {
    syncStatus.value = 'error';
    syncMessage.value = err instanceof Error ? err.message : String(err);
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${h}:${m}`;
}

/* ===== 布局 ===== */
function resetLayout() {
  if (confirm('确定恢复默认布局？')) {
    layoutStore.resetLayout();
  }
}

/* ===== 开机自启 ===== */
async function toggleAutoStart() {
  if (autoStartLoading.value) return;
  autoStartLoading.value = true;
  try {
    const { enable, disable } = await import('@tauri-apps/plugin-autostart');
    if (autoStartEnabled.value) {
      await disable();
    } else {
      await enable();
    }
    autoStartEnabled.value = !autoStartEnabled.value;
  } catch (err) {
    console.error('[settings] 切换开机自启失败:', err);
  } finally {
    autoStartLoading.value = false;
  }
}

/* ===== 常驻桌面 ===== */
async function toggleDesktopMode() {
  if (desktopModeLoading.value) return;
  desktopModeLoading.value = true;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const next = await invoke<boolean>('toggle_desktop_mode');
    desktopModeEnabled.value = next;
  } catch (err) {
    console.error('[settings] 切换常驻桌面失败:', err);
  } finally {
    desktopModeLoading.value = false;
  }
}

onMounted(async () => {
  // 加载 LLM 配置
  try {
    const config = await getLLMConfig();
    if (config.apiUrl) apiUrl.value = config.apiUrl;
    if (config.model) model.value = config.model;
    apiKey.value = config.apiKey || '';
  } catch { /* ignore */ }

  // 加载同步配置
  try {
    const config = await getSyncConfigDecoded();
    if (config) {
      syncUrl.value = config.url;
      syncUser.value = config.username;
      syncPass.value = config.password;
    }
    const lastSync = await getLastSyncTime();
    if (lastSync) lastSyncTime.value = formatTime(lastSync);
    deviceId.value = await getDeviceId();
  } catch { /* ignore */ }

  // 加载开机自启状态（仅桌面端）
  if (isTauri()) {
    try {
      const { isEnabled } = await import('@tauri-apps/plugin-autostart');
      autoStartEnabled.value = await isEnabled();
    } catch { /* ignore */ }
  }
});
</script>

<template>
  <Teleport to="body">
    <Transition name="settings">
      <div class="settings-overlay" @click.self="close">
        <div class="settings-panel">
          <div class="settings-header">
            <h3 class="settings-title">设置</h3>
            <button class="settings-close" @click="close">✕</button>
          </div>

          <div class="settings-body">
            <!-- 主题切换 -->
            <section class="settings-section">
              <div class="settings-label">主题</div>
              <div class="settings-theme">
                <button
                  class="theme-btn"
                  :class="{ 'is-active': themeStore.mode === 'light' }"
                  @click="themeStore.setMode('light')"
                >
                  ☀️ 浅色
                </button>
                <button
                  class="theme-btn"
                  :class="{ 'is-active': themeStore.mode === 'dark' }"
                  @click="themeStore.setMode('dark')"
                >
                  🌙 深色
                </button>
              </div>
            </section>

            <!-- 开机自启（仅桌面端） -->
            <section v-if="!isMobileLayout" class="settings-section">
              <div class="settings-label">开机自启</div>
              <div class="toggle-row">
                <button
                  class="toggle-btn"
                  :class="{ 'is-on': autoStartEnabled }"
                  :disabled="autoStartLoading"
                  @click="toggleAutoStart"
                >
                  <span class="toggle-track">
                    <span class="toggle-thumb"></span>
                  </span>
                  <span class="toggle-label">{{ autoStartEnabled ? '已开启' : '已关闭' }}</span>
                </button>
              </div>
              <p class="settings-tip">开启后，电脑开机时自动启动桌面挂件</p>
            </section>

            <!-- 常驻桌面（仅桌面端） -->
            <section v-if="!isMobileLayout" class="settings-section">
              <div class="settings-label">常驻桌面</div>
              <div class="toggle-row">
                <button
                  class="toggle-btn"
                  :class="{ 'is-on': desktopModeEnabled }"
                  :disabled="desktopModeLoading"
                  @click="toggleDesktopMode"
                >
                  <span class="toggle-track">
                    <span class="toggle-thumb"></span>
                  </span>
                  <span class="toggle-label">{{ desktopModeEnabled ? '已开启' : '已关闭' }}</span>
                </button>
              </div>
              <p class="settings-tip">开启后，窗口隐藏到桌面层（不显示在任务栏），像桌面挂件一样常驻</p>
            </section>

            <!-- 透明度（移动端隐藏：移动端卡片不需要透明度，避免影响可读性） -->
            <section v-if="!isMobileLayout" class="settings-section">
              <div class="settings-label">
                卡片透明度
                <span class="settings-value">{{ Math.round(themeStore.cardOpacity * 100) }}%</span>
              </div>
              <div class="opacity-row">
                <input
                  type="range"
                  min="30"
                  max="100"
                  step="1"
                  :value="Math.round(themeStore.cardOpacity * 100)"
                  class="opacity-slider"
                  @input="themeStore.setOpacity(parseInt(($event.target as HTMLInputElement).value) / 100)"
                />
                <div class="opacity-presets">
                  <button class="opacity-preset" @click="themeStore.setOpacity(0.4)">玻璃</button>
                  <button class="opacity-preset" @click="themeStore.setOpacity(0.78)">默认</button>
                  <button class="opacity-preset" @click="themeStore.setOpacity(1)">不透明</button>
                </div>
              </div>
              <p class="settings-tip">滑块越靠左越透明，适合叠加在壁纸上</p>
            </section>

            <!-- 本地备份与恢复 -->
            <section class="settings-section">
              <div class="settings-label">本地备份与恢复</div>
              <div class="backup-actions">
                <button
                  class="btn btn-backup"
                  :disabled="backupBusy"
                  @click="handleExport"
                >
                  {{ backupBusy ? '处理中...' : '⬇ 导出备份' }}
                </button>
                <button
                  class="btn btn-backup"
                  :disabled="backupBusy"
                  @click="triggerImport"
                >
                  ⬆ 从文件恢复
                </button>
                <input
                  ref="fileInputRef"
                  type="file"
                  accept=".json,application/json"
                  class="backup-file-input"
                  @change="handleFileChange"
                />
              </div>
              <p v-if="backupMsg" class="settings-tip" style="color: var(--accent-color);">{{ backupMsg }}</p>
              <p v-if="backupErr" class="settings-tip" style="color: #ef4444;">{{ backupErr }}</p>
              <p class="settings-tip">
                备份将导出全部业务数据（日程、待办、时间记录、记账、日记）为 JSON 文件；恢复会覆盖当前数据，请谨慎操作。
              </p>
            </section>

            <!-- AI 配置 -->
            <section class="settings-section">
              <div class="settings-label">AI 配置</div>
              <div class="settings-form">
                <div class="form-row">
                  <label class="form-text">API URL</label>
                  <input
                    v-model="apiUrl"
                    class="form-input"
                    placeholder="https://api.deepseek.com/v1/chat/completions"
                  />
                </div>
                <div class="form-row">
                  <label class="form-text">API Key</label>
                  <input
                    v-model="apiKey"
                    type="password"
                    class="form-input"
                    placeholder="sk-..."
                  />
                </div>
                <div class="form-row">
                  <label class="form-text">模型</label>
                  <input
                    v-model="model"
                    class="form-input"
                    placeholder="deepseek-chat"
                  />
                </div>
                <div class="settings-actions">
                  <button
                    class="btn btn-primary"
                    :disabled="llmSaving"
                    @click="saveLLM"
                  >
                    {{ llmSaving ? '保存中...' : '保存' }}
                  </button>
                  <Transition name="hint">
                    <span v-if="llmSavedHint" class="saved-hint">✓ 已保存</span>
                  </Transition>
                  <Transition name="hint">
                    <span v-if="llmErrorHint" class="error-hint">⚠ {{ llmErrorHint }}</span>
                  </Transition>
                </div>
              </div>
            </section>

            <!-- 布局 -->
            <section class="settings-section">
              <div class="settings-label">布局</div>
              <button class="btn btn-danger" @click="resetLayout">
                ↺ 恢复默认布局
              </button>
            </section>

            <!-- 同步 坚果云 WebDAV -->
            <section class="settings-section">
              <div class="settings-label">数据同步</div>
              <div class="settings-form">
                <div class="form-row">
                  <label class="form-text">WebDAV 地址（坚果云路径）</label>
                  <input
                    v-model="syncUrl"
                    class="form-input"
                    placeholder="https://dav.jianguoyun.com/dav/dashboard/"
                  />
                </div>
                <div class="form-row">
                  <label class="form-text">账号</label>
                  <input
                    v-model="syncUser"
                    class="form-input"
                    placeholder="用户名/邮箱"
                  />
                </div>
                <div class="form-row">
                  <label class="form-text">密码（坚果云应用密码）</label>
                  <input
                    v-model="syncPass"
                    type="password"
                    class="form-input"
                    placeholder="应用密码，非登录密码"
                  />
                </div>
                <div class="settings-actions">
                  <button
                    class="btn btn-primary"
                    :disabled="syncSaving"
                    @click="saveSync"
                  >
                    {{ syncSaving ? '保存中...' : '保存配置' }}
                  </button>
                  <Transition name="hint">
                    <span v-if="syncSavedHint" class="saved-hint">✓ 已保存</span>
                  </Transition>
                </div>
                <div class="sync-actions">
                  <button
                    class="btn btn-sync"
                    :disabled="syncStatus === 'syncing'"
                    @click="doSync"
                  >
                    {{ syncStatus === 'syncing' ? '⏳ 同步中...' : '🔄 立即同步' }}
                  </button>
                  <span
                    class="sync-status"
                    :class="`sync-status--${syncStatus}`"
                  >
                    {{ syncMessage || (syncStatus === 'idle' ? '就绪' : '') }}
                  </span>
                </div>
                <div v-if="deviceId" class="sync-device">
                  设备 ID: <code>{{ deviceId.slice(0, 8) }}...</code>
                </div>
                <div v-if="lastSyncTime" class="sync-device">
                  上次同步: {{ lastSyncTime }}
                </div>
                <p class="settings-tip">
                  建议使用坚果云 WebDAV，创建应用密码后填入上面。同步后所有设备数据保持一致。
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.settings-panel {
  width: 480px;
  max-width: 92%;
  max-height: 85vh;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.settings-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.settings-close {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s;
}

.settings-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.settings-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.settings-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.3px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.settings-value {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-color);
  font-variant-numeric: tabular-nums;
}

.settings-tip {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

/* 透明度滑块 */
.opacity-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.opacity-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--bg-hover), var(--accent-color));
  outline: none;
  cursor: pointer;
}

.opacity-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid var(--accent-color);
  box-shadow: 0 2px 6px rgba(99, 102, 241, 0.4);
  cursor: pointer;
  transition: transform 0.15s;
}

.opacity-slider::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}

.opacity-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid var(--accent-color);
  box-shadow: 0 2px 6px rgba(99, 102, 241, 0.4);
  cursor: pointer;
}

.opacity-presets {
  display: flex;
  gap: 6px;
}

.opacity-preset {
  flex: 1;
  padding: 5px 8px;
  font-size: 11px;
  font-family: inherit;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.opacity-preset:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

/* 主题切换 */
.settings-theme {
  display: flex;
  gap: 8px;
}

.theme-btn {
  flex: 1;
  padding: 8px 12px;
  font-size: 13px;
  font-family: inherit;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.theme-btn:hover {
  border-color: var(--border-hover);
  color: var(--text-primary);
}

.theme-btn.is-active {
  border-color: var(--accent-color);
  color: var(--accent-color);
  background: var(--accent-light);
}

/* 表单 */
.settings-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-text {
  font-size: 12px;
  color: var(--text-secondary);
}

.form-input {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
}

.form-input:focus {
  border-color: var(--accent-color);
}

.settings-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

/* 按钮 */
.btn {
  padding: 8px 18px;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--accent-color);
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-danger {
  background: var(--bg-hover);
  color: var(--text-secondary);
  align-self: flex-start;
}

.btn-danger:hover {
  background: var(--border-color);
  color: var(--text-primary);
}

.saved-hint {
  font-size: 12px;
  color: var(--accent-color);
}

.error-hint {
  font-size: 12px;
  color: #ef4444;
  max-width: 200px;
  word-break: break-word;
}

/* 同步相关 */
.sync-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

.btn-sync {
  padding: 8px 18px;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  background: var(--accent-color);
  color: #fff;
  transition: background 0.2s;
}

.btn-sync:hover:not(:disabled) {
  background: var(--accent-hover);
}

.btn-sync:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.sync-status {
  font-size: 12px;
  transition: color 0.2s;
}

.sync-status--idle { color: var(--text-tertiary); }
.sync-status--syncing { color: var(--accent-color); }
.sync-status--success { color: #22c55e; }
.sync-status--error { color: #ef4444; }
.sync-status--unconfigured { color: var(--text-tertiary); }

.sync-device {
  font-size: 11px;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.sync-device code {
  font-size: 11px;
  background: var(--bg-hover);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: monospace;
}

/* 过渡动画 */
.settings-enter-active,
.settings-leave-active {
  transition: opacity 0.2s ease;
}

.settings-enter-from,
.settings-leave-to {
  opacity: 0;
}

/* 开关按钮 */
.toggle-row {
  display: flex;
  align-items: center;
}
.toggle-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-family: inherit;
}
.toggle-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.toggle-track {
  width: 40px;
  height: 22px;
  border-radius: 999px;
  background: var(--bg-hover, #e5e5ea);
  position: relative;
  transition: background 0.2s;
  flex-shrink: 0;
}
.toggle-btn.is-on .toggle-track {
  background: #6366f1;
}
.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s;
}
.toggle-btn.is-on .toggle-thumb {
  transform: translateX(18px);
}
.toggle-label {
  font-size: 13px;
  color: var(--text-secondary);
}

/* 备份与恢复 */
.backup-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-backup {
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  padding: 8px 14px;
  font-size: 13px;
  font-family: inherit;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-backup:hover:not(:disabled) {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.btn-backup:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.backup-file-input {
  display: none;
}

.hint-enter-active,
.hint-leave-active {
  transition: opacity 0.2s ease;
}

.hint-enter-from,
.hint-leave-to {
  opacity: 0;
}
</style>
