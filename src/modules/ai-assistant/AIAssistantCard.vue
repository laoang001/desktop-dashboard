<script setup lang="ts">
/** AIAssistantCard - AI 助手聊天卡片 */
import { ref, nextTick, onMounted } from 'vue';
import BaseCard from '../../components/common/BaseCard.vue';
import { getLLMConfig, processAICommand } from './api';
import type { ChatMessage } from '../../types';

type LLMConfig = Awaited<ReturnType<typeof getLLMConfig>>;

const QUICK_COMMANDS = ['创建待办', '记一笔账', '分析今天的数据', '写日记'];
const WELCOME = '你好！我是你的AI助手，试试说：今天上午九点到十一点写书、午饭花了25块、帮我记一笔';

const messages = ref<ChatMessage[]>([]);
const input = ref('');
const loading = ref(false);
const llmConfigured = ref(false);
const llmConfig = ref<LLMConfig | null>(null);

const messageListRef = ref<HTMLElement | null>(null);

function scrollToBottom() {
  nextTick(() => {
    const el = messageListRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

async function send(text?: string) {
  const content = (text ?? input.value).trim();
  if (!content || loading.value) return;
  if (!llmConfigured.value || !llmConfig.value) return;

  // 保存历史（不包含当前即将发送的消息），供 AI 保持上下文
  const history = [...messages.value];
  messages.value.push({ role: 'user', content, timestamp: Date.now() });
  if (text === undefined) input.value = '';
  loading.value = true;
  scrollToBottom();

  try {
    const reply = await processAICommand(content, llmConfig.value, history);
    messages.value.push({ role: 'assistant', content: reply, timestamp: Date.now() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '请求失败，请稍后重试';
    messages.value.push({ role: 'assistant', content: `⚠️ ${msg}`, timestamp: Date.now() });
  } finally {
    loading.value = false;
    scrollToBottom();
  }
}

onMounted(async () => {
  // 欢迎消息（首次打开）
  messages.value.push({ role: 'assistant', content: WELCOME, timestamp: Date.now() });
  scrollToBottom();

  // 检查 LLM 配置状态
  try {
    const config = await getLLMConfig();
    llmConfig.value = config;
    llmConfigured.value = Boolean(config.apiUrl && config.apiKey);
  } catch {
    llmConfigured.value = false;
  }
});
</script>

<template>
  <BaseCard icon="🤖" title="AI 助手">
    <div class="ai-chat">
      <!-- 快捷指令 -->
      <div class="ai-quick">
        <button
          v-for="cmd in QUICK_COMMANDS"
          :key="cmd"
          class="ai-quick__btn"
          :disabled="loading || !llmConfigured"
          @click="send(cmd)"
        >
          {{ cmd }}
        </button>
      </div>

      <!-- 未配置提示 -->
      <div v-if="!llmConfigured" class="ai-warn">请先在设置中配置 AI 参数</div>

      <!-- 消息列表 -->
      <div ref="messageListRef" class="ai-messages">
        <div
          v-for="(msg, i) in messages"
          :key="i"
          class="ai-msg"
          :class="`ai-msg--${msg.role}`"
        >
          <div class="ai-msg__bubble">{{ msg.content }}</div>
        </div>
        <div v-if="loading" class="ai-msg ai-msg--assistant">
          <div class="ai-msg__bubble ai-msg__bubble--typing">
            <span class="dot" /><span class="dot" /><span class="dot" />
          </div>
        </div>
      </div>

      <!-- 输入区 -->
      <div class="ai-input">
        <input
          v-model="input"
          class="ai-input__field"
          placeholder="输入消息..."
          :disabled="loading"
          @keyup.enter="send()"
        />
        <button
          class="ai-input__send"
          :disabled="loading || !llmConfigured || !input.trim()"
          @click="send()"
        >
          发送
        </button>
      </div>
    </div>
  </BaseCard>
</template>

<style scoped>
.ai-chat {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 快捷指令 */
.ai-quick {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex-shrink: 0;
  margin-bottom: 10px;
}

.ai-quick__btn {
  padding: 4px 10px;
  font-size: 12px;
  font-family: inherit;
  border: 1px solid var(--border-color);
  background: var(--bg-input);
  color: var(--text-secondary);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.ai-quick__btn:hover:not(:disabled) {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.ai-quick__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 未配置提示 */
.ai-warn {
  flex-shrink: 0;
  padding: 6px 12px;
  margin-bottom: 10px;
  background: var(--accent-light);
  color: var(--accent-color);
  border-radius: var(--radius-sm);
  font-size: 12px;
  text-align: center;
}

/* 消息列表 */
.ai-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.ai-msg {
  display: flex;
  margin-bottom: 10px;
}

.ai-msg--user {
  justify-content: flex-end;
}

.ai-msg--assistant {
  justify-content: flex-start;
}

.ai-msg__bubble {
  max-width: 80%;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
  white-space: pre-wrap;
}

.ai-msg--user .ai-msg__bubble {
  background: var(--accent-color);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.ai-msg--assistant .ai-msg__bubble {
  background: var(--bg-input);
  color: var(--text-primary);
  border-bottom-left-radius: 4px;
}

/* 打字指示器 */
.ai-msg__bubble--typing {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 10px 14px;
}

.ai-msg__bubble--typing .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-tertiary);
  animation: typing-bounce 1.2s infinite ease-in-out;
}

.ai-msg__bubble--typing .dot:nth-child(2) { animation-delay: 0.15s; }
.ai-msg__bubble--typing .dot:nth-child(3) { animation-delay: 0.3s; }

@keyframes typing-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-4px); opacity: 1; }
}

/* 输入区 */
.ai-input {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}

.ai-input__field {
  flex: 1;
  min-width: 0;
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

.ai-input__field:focus {
  border-color: var(--accent-color);
}

.ai-input__field:disabled {
  opacity: 0.6;
}

.ai-input__send {
  padding: 8px 16px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent-color);
  color: #fff;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
}

.ai-input__send:not(:disabled):hover {
  background: var(--accent-hover);
}

.ai-input__send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
