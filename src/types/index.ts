/** 全局类型定义 */

/** 日程 */
export interface Schedule {
  id: number;
  title: string;
  start_at: string;
  end_at: string | null;
  all_day: number;
  location: string | null;
  remark: string | null;
  color: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_rev: number;
}

/** 待办 */
export interface Todo {
  id: number;
  title: string;
  category: 'work' | 'exercise' | 'life';
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'done';
  due_date: string | null;
  planned_start: string | null;
  planned_end: string | null;
  sort: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_rev: number;
}

/** 日记（原笔记，已迁移） */
export interface DiaryEntry {
  id: number;
  content: string;
  tags: string[] | null;
  pinned: number;
  mood: string | null;
  weather: string | null;
  entry_date: string | null;
  ai_generated: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_rev: number;
}

/** 时间记录 */
export interface TimeRecord {
  id: number;
  category: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  duration: number | null;
  date: string;
  todo_id: number | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_rev: number;
}

/** 时间分类 */
export interface TimeCategory {
  id: number;
  key: string;
  name: string;
  color: string;
  icon: string | null;
  daily_goal: number;
  weekly_goal: number;
  monthly_goal: number;
  sort: number;
  is_preset: number;
  is_skill: number;
  total_accumulated: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_rev: number;
}

/** 聊天消息 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

/** LLM 配置 */
export interface LLMConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
}

/** 天气数据 */
export interface WeatherData {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  weatherCode: number;
  windSpeed: number;
  description: string;
  icon: string;
}

/** 城市信息 */
export interface CityInfo {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
}

/** ===== 记账 ===== */

/** 账户 */
export interface Account {
  id: number;
  name: string;
  type: 'cash' | 'bank' | 'alipay' | 'wechat' | 'credit';
  balance: number;
  currency: string;
  sort: number;
  icon: string | null;
  color: string | null;
  credit_limit: number | null;
  billing_day: number | null;
  payment_due_day: number | null;
  is_archived: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_rev: number;
}

/** 记账分类 */
export interface AccountCategory {
  id: number;
  key: string;
  name: string;
  type: 'income' | 'expense';
  icon: string | null;
  color: string | null;
  parent_id: number | null;
  sort: number;
  is_preset: number;
  monthly_budget: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_rev: number;
}

/** 流水 */
export interface Transaction {
  id: number;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  account_id: number;
  to_account_id: number | null;
  category_id: number | null;
  transaction_time: string;
  remark: string | null;
  tags: string | null;
  todo_id: number | null;
  location: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_rev: number;
}

/** 预算 */
export interface Budget {
  id: number;
  period: 'month' | 'year';
  period_value: string;
  category_id: number | null;
  amount: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_rev: number;
}

/** 汇率 */
export interface Rate {
  id: number;
  base_currency: string;
  quote_currency: string;
  rate: number;
  date: string;
  source: string | null;
}
