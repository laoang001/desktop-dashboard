import { getSetting, setSetting } from '../../composables/useDatabase';
import { execute, select } from '../../composables/useDatabase';
import { createTransaction } from '../accounting/api';
import type { LLMConfig, ChatMessage } from '../../types';

const LLM_TIMEOUT_MS = 60000;

/** 带 AbortController 超时的 fetch（防止永久挂起） */
async function fetchUrl(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`LLM 请求超时（${LLM_TIMEOUT_MS / 1000}s），请检查网络或 API 服务`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** 获取 LLM 配置 */
export async function getLLMConfig(): Promise<LLMConfig> {
  const apiUrl = await getSetting('llm_api_url') || '';
  const apiKey = await getSetting('llm_api_key') || '';
  const model = await getSetting('llm_model') || 'deepseek-chat';
  return { apiUrl, apiKey, model };
}

/** 保存 LLM 配置 */
export async function saveLLMConfig(config: LLMConfig): Promise<void> {
  await setSetting('llm_api_url', config.apiUrl);
  await setSetting('llm_api_key', config.apiKey);
  await setSetting('llm_model', config.model);
}

/** 调用 LLM 聊天 API */
export async function chatWithLLM(
  messages: ChatMessage[],
  config: LLMConfig,
): Promise<string> {
  if (!config.apiUrl || !config.apiKey) {
    throw new Error('请先在设置中配置 LLM API 参数');
  }

  // 自动补全 API URL 后缀
  let apiUrl = config.apiUrl.replace(/\/+$/, '');
  if (!apiUrl.endsWith('/chat/completions')) {
    if (apiUrl.endsWith('/v1')) {
      apiUrl += '/chat/completions';
    } else if (!apiUrl.includes('/v1/')) {
      apiUrl += '/v1/chat/completions';
    }
  }

  const res = await fetchUrl(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM 请求失败: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '无响应';
}

/** 获取本地日期字符串（避免 UTC 导致日期错位） */
function localDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 将时间字符串统一为完整 ISO 日期时间 */
function toFullIso(t: string | undefined): string | null {
  if (!t) return null;
  // 已是完整 ISO 格式，补全秒后返回
  if (t.includes('T')) return t.length === 16 ? t + ':00' : t;
  // 纯日期 "YYYY-MM-DD"，补全为当天 00:00:00
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t}T00:00:00`;
  // HH:MM 格式，结合今天日期
  if (/^\d{2}:\d{2}$/.test(t)) return `${localDateStr()}T${t}:00`;
  return null;
}

/** AI 助手：解析自然语言并执行操作（支持多模块联动 + 对话历史） */
export async function processAICommand(
  userInput: string,
  config: LLMConfig,
  history: ChatMessage[] = [],
): Promise<string> {
  const today = localDateStr();

  // 收集当前数据上下文（均过滤软删除）
  const [todos, timeRecords, schedules, accounting] = await Promise.all([
    select<{ id: number; title: string; category: string; status: string; planned_start: string | null; planned_end: string | null }>(
      'SELECT id, title, category, status, planned_start, planned_end FROM todos WHERE status = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 20',
      ['pending'],
    ),
    select<{ category: string; duration: number }>(
      'SELECT category, SUM(duration) as duration FROM time_records WHERE date = $1 AND duration IS NOT NULL AND deleted_at IS NULL GROUP BY category',
      [today],
    ),
    select<{ id: number; title: string; start_at: string; end_at: string | null }>(
      `SELECT id, title, start_at, end_at FROM schedules WHERE date(start_at) = date($1) AND deleted_at IS NULL ORDER BY start_at`,
      [today],
    ),
    select<{ type: string; total: number | null }>(
      `SELECT type, SUM(amount) as total FROM accounting_transactions WHERE date(transaction_time) = date($1) AND deleted_at IS NULL GROUP BY type`,
      [today],
    ),
  ]);

  const systemPrompt = `你是一个桌面效率助手，整合了日程、任务、时间记录、记账、日记等功能。用户会用自然语言下达指令，你需要解析并返回 JSON 操作指令。

支持的指令类型：
1. create_todo: 创建待办事项
   - title: 标题
   - category: "work" | "exercise" | "life"（默认 work）
   - planned_start: 完整 ISO 时间（如 "${today}T09:00:00"）
   - planned_end: 完整 ISO 时间

2. create_schedule: 创建日程
   - title: 标题
   - start_at: 完整 ISO 时间
   - end_at: 完整 ISO 时间（可选）
   - location: 地点（可选）
   - remark: 备注（可选）

3. create_transaction: 记账
   - type: "expense" | "income" | "transfer"
   - amount: 金额（数字）
   - account_id: 账户ID（默认 1）
   - category_id: 分类ID（可选）
   - remark: 备注（可选）

4. create_diary: 写日记
   - content: 日记内容

5. analyze: 分析今日数据
   - 当用户说"分析今天的数据"或类似话时返回此类型

6. chat: 普通对话回复
   - 当无法解析为具体操作时，作为聊天助手回复

当前日期: ${today}
当前待办（未完成）: ${JSON.stringify(todos)}
今日日程: ${JSON.stringify(schedules)}
今日时间记录: ${JSON.stringify(timeRecords)}
今日记账: ${JSON.stringify(accounting)}

请返回 JSON 格式：{"type": "...", "data": {...}}
注意：只返回 JSON，不要多余文字。`;

  // 构建消息：系统提示 + 最近10条历史 + 当前输入
  const recentHistory = history
    .slice(-10)
    .filter(m => m.role === 'user' || m.role === 'assistant');
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt, timestamp: Date.now() },
    ...recentHistory,
    { role: 'user', content: userInput, timestamp: Date.now() },
  ];

  const response = await chatWithLLM(messages, config);

  // 解析 LLM 返回的 JSON 指令
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const cmd = JSON.parse(jsonMatch[0]);

      if (cmd.type === 'create_todo' && cmd.data) {
        await execute(
          `INSERT INTO todos (title, category, priority, planned_start, planned_end) VALUES ($1, $2, $3, $4, $5)`,
          [cmd.data.title || '未命名', cmd.data.category || 'work', 'medium', toFullIso(cmd.data.planned_start), toFullIso(cmd.data.planned_end)],
        );
        window.dispatchEvent(new CustomEvent('todo-updated'));
        return `✅ 已创建待办：${cmd.data.title}（分类：${cmd.data.category || '工作'}）`;
      }

      if (cmd.type === 'create_schedule' && cmd.data) {
        await execute(
          `INSERT INTO schedules (title, start_at, end_at, location, remark) VALUES ($1, $2, $3, $4, $5)`,
          [cmd.data.title || '未命名', cmd.data.start_at, cmd.data.end_at || null, cmd.data.location || null, cmd.data.remark || null],
        );
        window.dispatchEvent(new CustomEvent('schedule-updated'));
        return `📅 已创建日程：${cmd.data.title}`;
      }

      if (cmd.type === 'create_transaction' && cmd.data) {
        const amt = Number(cmd.data.amount) || 0;
        const accId = Number(cmd.data.account_id) || 1;
        // 复用 accounting/api.ts 的 createTransaction，确保事务保护和 transfer 处理一致
        await createTransaction({
          type: cmd.data.type || 'expense',
          amount: amt,
          account_id: accId,
          to_account_id: cmd.data.to_account_id ? Number(cmd.data.to_account_id) : undefined,
          category_id: cmd.data.category_id ? Number(cmd.data.category_id) : undefined,
          remark: cmd.data.remark || undefined,
        });
        window.dispatchEvent(new CustomEvent('accounting-updated'));
        const typeLabel = cmd.data.type === 'income' ? '收入' : cmd.data.type === 'expense' ? '支出' : '转账';
        return `💰 已记录${typeLabel}：${amt} 元${cmd.data.remark ? '（' + cmd.data.remark + '）' : ''}`;
      }

      if (cmd.type === 'create_diary' && cmd.data) {
        await execute(
          `INSERT INTO diary_entries (content, entry_date) VALUES ($1, $2)`,
          [cmd.data.content || '', today],
        );
        window.dispatchEvent(new CustomEvent('diary-updated'));
        return `📝 已写入日记`;
      }

      if (cmd.type === 'analyze') {
        const [completedTodos, totalDuration, expenseRow, incomeRow] = await Promise.all([
          select<{ count: number }>(
            `SELECT COUNT(*) as count FROM todos WHERE status = 'done' AND date(updated_at) = date($1) AND deleted_at IS NULL`,
            [today],
          ),
          select<{ total: number | null }>(
            `SELECT SUM(duration) as total FROM time_records WHERE date = $1 AND deleted_at IS NULL`,
            [today],
          ),
          select<{ total: number | null }>(
            `SELECT SUM(amount) as total FROM accounting_transactions WHERE type = 'expense' AND date(transaction_time) = date($1) AND deleted_at IS NULL`,
            [today],
          ),
          select<{ total: number | null }>(
            `SELECT SUM(amount) as total FROM accounting_transactions WHERE type = 'income' AND date(transaction_time) = date($1) AND deleted_at IS NULL`,
            [today],
          ),
        ]);
        const doneCount = completedTodos[0]?.count ?? 0;
        const totalSec = totalDuration[0]?.total ?? 0;
        const hours = Math.floor(totalSec / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);
        const expense = expenseRow[0]?.total ?? 0;
        const income = incomeRow[0]?.total ?? 0;

        return `📊 今日数据分析：\n• 完成待办：${doneCount} 项\n• 记录时间：${hours}小时${mins}分钟\n• 支出：¥${expense.toFixed(2)}\n• 收入：¥${income.toFixed(2)}\n• 日程：${schedules.length} 项\n\n${cmd.data?.suggestion || '继续加油！'}`;
      }

      if (cmd.type === 'chat' && cmd.data?.reply) {
        return cmd.data.reply;
      }
    }
    return response;
  } catch {
    return response;
  }
}
