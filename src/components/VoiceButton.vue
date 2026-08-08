<script setup lang="ts">
/**
 * AIButton - AI 助手按钮（双交互）
 * 点击 = 弹出文字输入框
 * 长按(>500ms) = 语音录入
 */
import { ref, onUnmounted } from 'vue';
import Icon from './Icon.vue';
import { processAICommand, getLLMConfig } from '../modules/ai-assistant/api';
import type { ChatMessage } from '../types';

type AIState = 'idle' | 'recording' | 'processing';

const state = ref<AIState>('idle');
const transcript = ref('');
const result = ref('');
const errorMsg = ref('');

/* 文字输入弹窗 */
const showTextInput = ref(false);
const textInput = ref('');

/* Web Speech API 类型声明 */
interface SpeechRecognitionEvent {
  results: {
    [index: number]: {
      [index: number]: { transcript: string };
      isFinal: boolean;
    };
    length: number;
  };
  resultIndex: number;
}
interface SpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognition;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

let recognition: SpeechRecognition | null = null;
let history: ChatMessage[] = [];

/* ===== 双交互：点击 vs 长按 ===== */
let pressTimer: ReturnType<typeof setTimeout> | undefined;
let isLongPress = false;
const LONG_PRESS_MS = 500;

/* 触摸起始位置（用于判断是否滑出取消） */
let touchStartX = 0;
let touchStartY = 0;
const CANCEL_THRESHOLD = 20; // 移动超过 20px 才取消

function onPressStart(e: MouseEvent | TouchEvent) {
  if (state.value !== 'idle') return;
  isLongPress = false;
  // 记录触摸起始位置
  if ('touches' in e && e.touches.length > 0) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  } else if ('clientX' in e) {
    touchStartX = e.clientX;
    touchStartY = e.clientY;
  }
  pressTimer = setTimeout(() => {
    isLongPress = true;
    startRecording();
  }, LONG_PRESS_MS);
}

function onPressEnd() {
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = undefined; }
  if (isLongPress) {
    // 长按结束 → 停止录音
    stopRecording();
  } else if (state.value === 'idle') {
    // 短按 → 文字输入
    showTextInput.value = true;
    textInput.value = '';
  }
}

function onPressMove(e: TouchEvent) {
  if (!pressTimer && !isLongPress) return;
  // 只有移动超过阈值才取消，防止手指轻微抖动取消长按
  if (e.touches.length > 0) {
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    if (Math.sqrt(dx * dx + dy * dy) > CANCEL_THRESHOLD) {
      doCancel();
    }
  }
}

function onPressCancel() {
  doCancel();
}

function doCancel() {
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = undefined; }
  if (isLongPress && state.value === 'recording') {
    cancelRecording();
  }
  isLongPress = false;
}

/* ===== 语音录入 ===== */
function startRecording() {
  errorMsg.value = '';
  transcript.value = '';
  result.value = '';
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    // 不支持语音，回退到文字输入
    showTextInput.value = true;
    return;
  }
  try {
    recognition = new Ctor();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      transcript.value = text;
    };
    recognition.onerror = (e: { error: string }) => {
      if (e.error === 'not-allowed') errorMsg.value = '请允许麦克风权限';
      else if (e.error !== 'aborted' && e.error !== 'no-speech') errorMsg.value = `识别失败: ${e.error}`;
      state.value = 'idle';
    };
    recognition.onend = () => {
      if (state.value === 'recording' && transcript.value) submitToAI();
      else if (state.value === 'recording') state.value = 'idle';
    };
    recognition.start();
    state.value = 'recording';
  } catch {
    showTextInput.value = true;
  }
}

function stopRecording() {
  if (state.value !== 'recording') return;
  if (recognition) { try { recognition.stop(); } catch { /* ignore */ } }
  if (transcript.value) submitToAI();
  else state.value = 'idle';
}

function cancelRecording() {
  if (recognition) { try { recognition.abort(); } catch { /* ignore */ } }
  transcript.value = '';
  state.value = 'idle';
}

/* ===== 文字输入提交 ===== */
async function submitText() {
  const text = textInput.value.trim();
  if (!text) return;
  showTextInput.value = false;
  transcript.value = text;
  textInput.value = '';
  await submitToAI();
}

function closeTextInput() {
  showTextInput.value = false;
  textInput.value = '';
}

/* ===== 提交给 AI ===== */
async function submitToAI() {
  if (!transcript.value) { state.value = 'idle'; return; }
  state.value = 'processing';
  try {
    const config = await getLLMConfig();
    const reply = await processAICommand(transcript.value, config, history);
    result.value = reply;
    history.push({ role: 'user', content: transcript.value, timestamp: Date.now() });
    history.push({ role: 'assistant', content: reply, timestamp: Date.now() });
    if (history.length > 20) history = history.slice(-20);
    setTimeout(() => {
      if (state.value === 'processing' && result.value) {
        state.value = 'idle';
        result.value = '';
        transcript.value = '';
      }
    }, 3500);
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'AI 处理失败';
    setTimeout(() => { errorMsg.value = ''; }, 3000);
    state.value = 'idle';
  }
}

onUnmounted(() => {
  if (pressTimer) clearTimeout(pressTimer);
  if (recognition) { try { recognition.abort(); } catch { /* ignore */ } }
});
</script>

<template>
  <div class="ai-wrap">
    <!-- 录音浮层 -->
    <transition name="ai-fade">
      <div v-if="state === 'recording'" class="ai-overlay">
        <div class="ov-label rec">
          <span class="ov-dot"></span>
          正在聆听...
        </div>
        <div class="ov-waveform">
          <span v-for="i in 8" :key="i" class="ov-bar" :style="{ animationDelay: (i * 0.08) + 's' }"></span>
        </div>
        <div class="ov-transcript" v-if="transcript">{{ transcript }}</div>
        <div class="ov-hint">松开发送 · 上滑取消</div>
      </div>
    </transition>

    <!-- 处理结果浮层 -->
    <transition name="ai-fade">
      <div v-if="state === 'processing'" class="ai-overlay">
        <div class="ov-label proc">
          <span class="ov-spinner"></span>
          AI 正在处理
        </div>
        <div class="ov-transcript">{{ transcript }}</div>
        <div class="ov-result" v-if="result">{{ result }}</div>
        <div class="ov-hint">自动识别：记账 / 待办 / 日程 / 日记</div>
      </div>
    </transition>

    <!-- 文字输入弹窗 -->
    <transition name="ai-fade">
      <div v-if="showTextInput" class="ai-overlay text-input">
        <div class="ov-label ai">
          <Icon name="ai" :size="14" />
          AI 助手 · 输入指令
        </div>
        <div class="ti-examples">
          <button v-for="ex in ['记一笔午餐35元', '明天下午3点开会', '记日记今天很开心']" :key="ex" class="ti-example" @click="textInput = ex">
            {{ ex }}
          </button>
        </div>
        <input
          v-model="textInput"
          class="ti-input"
          placeholder="输入指令..."
          autofocus
          @keyup.enter="submitText"
        />
        <div class="ti-actions">
          <button class="ti-btn cancel" @click="closeTextInput">取消</button>
          <button class="ti-btn send" @click="submitText">
            <Icon name="send" :size="13" />
            发送
          </button>
        </div>
      </div>
    </transition>

    <!-- 错误提示 -->
    <transition name="ai-fade">
      <div v-if="errorMsg && state === 'idle' && !showTextInput" class="ai-overlay error">
        <div class="ov-label error">⚠️ {{ errorMsg }}</div>
      </div>
    </transition>

    <!-- AI 按钮 -->
    <button
      class="ai-btn"
      :class="state"
      @touchstart="onPressStart"
      @touchend="onPressEnd"
      @touchmove="onPressMove"
      @mousedown="onPressStart"
      @mouseup="onPressEnd"
      @mouseleave="onPressCancel"
      @click.prevent
    >
      <Icon v-if="state === 'idle'" name="ai" :size="26" />
      <Icon v-else-if="state === 'recording'" name="mic" :size="24" />
      <Icon v-else name="ai" :size="26" />
    </button>
  </div>
</template>

<style scoped>
.ai-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

/* AI 按钮 */
.ai-btn {
  width: 52px;
  height: 52px;
  border-radius: 999px;
  border: 4px solid var(--bg-surface, #ffffff);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin-top: -22px;
  transition: transform 0.15s, box-shadow 0.2s;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: none;
  color: #fff;
}
.ai-btn.idle {
  background: #6366f1;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
}
.ai-btn.recording {
  background: #ef4444;
  box-shadow: 0 0 0 8px rgba(239, 68, 68, 0.2);
  animation: ai-pulse 1.2s ease-in-out infinite;
}
.ai-btn.processing {
  background: #4f46e5;
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4);
}
.ai-btn:active { transform: scale(0.95); }

@keyframes ai-pulse {
  0%, 100% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0.2); }
  50% { box-shadow: 0 0 0 14px rgba(239, 68, 68, 0.06); }
}

/* 浮层 */
.ai-overlay {
  position: absolute;
  bottom: 64px;
  left: 50%;
  transform: translateX(-50%);
  width: 260px;
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color, #e5e5ea);
  border-radius: 14px;
  padding: 14px 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
  z-index: 100;
}

.ov-label {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-primary, #1d1d1f);
}
.ov-label.rec { color: #ef4444; }
.ov-label.proc { color: #6366f1; }
.ov-label.ai { color: #6366f1; }
.ov-label.error { color: #ef4444; justify-content: center; }

.ov-dot {
  width: 6px; height: 6px;
  border-radius: 999px;
  background: #ef4444;
  animation: ai-blink 1s ease-in-out infinite;
}
@keyframes ai-blink { 50% { opacity: 0.3; } }

.ov-waveform {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 28px;
  margin-bottom: 8px;
}
.ov-bar {
  width: 3px;
  background: #ef4444;
  border-radius: 2px;
  animation: ai-wave 0.8s ease-in-out infinite;
  height: 14px;
}
@keyframes ai-wave {
  0%, 100% { transform: scaleY(0.4); }
  50% { transform: scaleY(1); }
}

.ov-transcript {
  font-size: 13px;
  color: var(--text-primary, #1d1d1f);
  background: var(--bg-muted, #f5f5f7);
  padding: 8px 10px;
  border-radius: 8px;
  margin-bottom: 8px;
  line-height: 1.5;
  max-height: 60px;
  overflow-y: auto;
}
.ov-result {
  font-size: 13px;
  color: #6366f1;
  padding: 8px 10px;
  border-radius: 8px;
  background: #eef2ff;
  margin-bottom: 8px;
  line-height: 1.5;
  white-space: pre-wrap;
}
.ov-hint {
  text-align: center;
  font-size: 10px;
  color: var(--text-tertiary, #aeaeb2);
}

.ov-spinner {
  width: 12px; height: 12px;
  border: 2px solid #eef2ff;
  border-top-color: #6366f1;
  border-radius: 999px;
  animation: ai-spin 0.8s linear infinite;
}
@keyframes ai-spin { to { transform: rotate(360deg); } }

/* 文字输入弹窗 */
.ti-examples {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.ti-example {
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--bg-muted, #f5f5f7);
  color: var(--text-secondary, #6e6e73);
  border: none;
  cursor: pointer;
}
.ti-example:active { background: #eef2ff; color: #6366f1; }

.ti-input {
  width: 100%;
  padding: 10px 12px;
  border: 1.5px solid #6366f1;
  border-radius: 10px;
  font-size: 14px;
  outline: none;
  background: var(--bg-surface, #ffffff);
  color: var(--text-primary, #1d1d1f);
  margin-bottom: 10px;
  box-sizing: border-box;
}

.ti-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.ti-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 7px 14px;
  border-radius: 999px;
  font-weight: 600;
  border: none;
  cursor: pointer;
}
.ti-btn.send { background: #6366f1; color: #fff; }
.ti-btn.cancel { background: var(--bg-muted, #f5f5f7); color: var(--text-secondary, #6e6e73); }

/* 过渡 */
.ai-fade-enter-active, .ai-fade-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.ai-fade-enter-from, .ai-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}
</style>
