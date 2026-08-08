/**
 * schema - 统一建表与同步字段回填
 * 所有 provider 共用，通过 provider.execute 调用，平台无关。
 * 遵循约束：CREATE TABLE IF NOT EXISTS（不依赖 Rust migrations）。
 */

import type { DataProvider } from './provider';

/** 业务表清单（用于同步字段回填检测，与 syncEngine SYNC_TABLES 共用） */
export const BUSINESS_TABLES = [
  'schedules',
  'todos',
  'time_records',
  'time_categories',
  'diary_entries',
  'accounting_accounts',
  'accounting_categories',
  'accounting_transactions',
  'accounting_budgets',
] as const;

/** 各业务表需要回填的同步字段 */
const SYNC_FIELDS: Record<string, { name: string; type: string; default?: string | null }[]> = {
  schedules: [
    { name: 'deleted_at', type: 'TEXT', default: null },
    { name: 'sync_rev', type: 'INTEGER', default: '0' },
  ],
  todos: [
    { name: 'deleted_at', type: 'TEXT', default: null },
    { name: 'sync_rev', type: 'INTEGER', default: '0' },
  ],
  diary_entries: [
    { name: 'deleted_at', type: 'TEXT', default: null },
    { name: 'sync_rev', type: 'INTEGER', default: '0' },
  ],
  time_records: [
    { name: 'updated_at', type: 'TEXT' },
    { name: 'deleted_at', type: 'TEXT', default: null },
    { name: 'sync_rev', type: 'INTEGER', default: '0' },
    { name: 'tags', type: 'TEXT' },
  ],
  time_categories: [
    { name: 'weekly_goal', type: 'INTEGER', default: '0' },
    { name: 'monthly_goal', type: 'INTEGER', default: '0' },
    { name: 'is_skill', type: 'INTEGER', default: '0' },
    { name: 'total_accumulated', type: 'INTEGER', default: '0' },
    { name: 'updated_at', type: 'TEXT' },
    { name: 'deleted_at', type: 'TEXT', default: null },
    { name: 'sync_rev', type: 'INTEGER', default: '0' },
  ],
  accounting_accounts: [
    { name: 'deleted_at', type: 'TEXT', default: null },
    { name: 'sync_rev', type: 'INTEGER', default: '0' },
  ],
  accounting_categories: [
    { name: 'deleted_at', type: 'TEXT', default: null },
    { name: 'sync_rev', type: 'INTEGER', default: '0' },
  ],
  accounting_transactions: [
    { name: 'deleted_at', type: 'TEXT', default: null },
    { name: 'sync_rev', type: 'INTEGER', default: '0' },
  ],
  accounting_budgets: [
    { name: 'deleted_at', type: 'TEXT', default: null },
    { name: 'sync_rev', type: 'INTEGER', default: '0' },
  ],
};

/**
 * 旧 notes 表 → diary_entries 迁移：
 * 若 notes 表存在且有数据，但 diary_entries 不存在，则迁移后删除旧表。
 * 使用事务保护：建表、迁移数据、删除旧表必须原子性，避免中间失败导致数据丢失。
 */
async function migrateNotesToDiary(p: DataProvider): Promise<void> {
  const notesExists = await p.select<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='notes'",
  );
  if (notesExists.length === 0) return;

  const diaryExists = await p.select<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='diary_entries'",
  );
  if (diaryExists.length > 0) return; // 已迁移过

  // 事务保护：建表 + 迁移数据 + 删除旧表必须原子性
  await p.transaction(async (tx) => {
    await tx.execute(`
      CREATE TABLE IF NOT EXISTS diary_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        tags TEXT,
        pinned INTEGER DEFAULT 0,
        mood TEXT,
        weather TEXT,
        entry_date TEXT,
        ai_generated INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT,
        sync_rev INTEGER DEFAULT 0
      );
    `);
    await tx.execute(`
      INSERT INTO diary_entries (content, tags, pinned, created_at, updated_at)
      SELECT content, tags, pinned, created_at, updated_at FROM notes;
    `);
    await tx.execute('DROP TABLE IF EXISTS notes;');
  });
  console.log('[schema] notes 表已迁移为 diary_entries');
}

/**
 * 为业务表创建 updated_at 自动更新触发器。
 * 解决 DEFAULT(datetime('now')) 仅 INSERT 生效、UPDATE 不自动更新 updated_at 的问题。
 */
async function createUpdateTriggers(p: DataProvider): Promise<void> {
  for (const table of BUSINESS_TABLES) {
    await p.execute(`
      CREATE TRIGGER IF NOT EXISTS trg_${table}_updated_at
      AFTER UPDATE ON ${table}
      FOR EACH ROW
      WHEN NEW.updated_at IS OLD.updated_at
      BEGIN
        UPDATE ${table} SET updated_at = datetime('now') WHERE id = NEW.id;
      END;
    `);
  }
}

/** 检测列是否存在（SQLite 特有 PRAGMA） */
async function columnExists(p: DataProvider, table: string, column: string): Promise<boolean> {
  const rows = await p.select<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}

/** 安全地为某表添加列（若不存在） */
async function addColumnIfMissing(
  p: DataProvider,
  table: string,
  field: { name: string; type: string; default?: string | null },
): Promise<void> {
  if (await columnExists(p, table, field.name)) return;
  const defaultClause = field.default == null ? '' : ` DEFAULT ${field.default}`;
  // ALTER TABLE 不支持 ? 占位符，字段名/类型是受控常量，直接拼接
  await p.execute(`ALTER TABLE ${table} ADD COLUMN ${field.name} ${field.type}${defaultClause}`);
}

/** 全部建表 + 同步字段回填 + 同步基础设施表 */
export async function initSchema(p: DataProvider): Promise<void> {
  // 启用外键约束（SQLite 默认关闭，每次连接需设置）
  await p.execute('PRAGMA foreign_keys = ON');

  // ===== 旧 notes → diary_entries 迁移（兼容已建 notes 表的旧库）=====
  await migrateNotesToDiary(p);

  // ===== 业务表（CREATE TABLE IF NOT EXISTS）=====
  await p.execute(`
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT,
      all_day INTEGER DEFAULT 0,
      location TEXT,
      remark TEXT,
      color TEXT DEFAULT '#3b82f6',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  await p.execute(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT DEFAULT 'work',
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'pending',
      due_date TEXT,
      planned_start TEXT,
      planned_end TEXT,
      sort INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  await p.execute(`
    CREATE TABLE IF NOT EXISTS diary_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      tags TEXT,
      pinned INTEGER DEFAULT 0,
      mood TEXT,
      weather TEXT,
      entry_date TEXT,
      ai_generated INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT,
      sync_rev INTEGER DEFAULT 0
    );
  `);
  await p.execute(`
    CREATE TABLE IF NOT EXISTS time_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      description TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration INTEGER,
      date TEXT NOT NULL,
      todo_id INTEGER REFERENCES todos(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  await p.execute(`CREATE INDEX IF NOT EXISTS idx_time_records_date ON time_records(date);`);
  await p.execute(`CREATE INDEX IF NOT EXISTS idx_time_records_todo_id ON time_records(todo_id);`);
  await p.execute(`
    CREATE TABLE IF NOT EXISTS time_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      icon TEXT,
      daily_goal INTEGER DEFAULT 0,
      sort INTEGER DEFAULT 0,
      is_preset INTEGER DEFAULT 0
    );
  `);
  await p.execute(`
    INSERT OR IGNORE INTO time_categories (key, name, color, icon, daily_goal, sort, is_preset) VALUES
      ('work', '工作', '#3b82f6', '💼', 28800, 1, 1),
      ('exercise', '锻炼', '#22c55e', '🏃', 3600, 2, 1),
      ('life', '生活', '#f97316', '🏠', 14400, 3, 1);
  `);
  await p.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // ===== 记账表 =====
  await p.execute(`
    CREATE TABLE IF NOT EXISTS accounting_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      balance REAL DEFAULT 0,
      currency TEXT DEFAULT 'CNY',
      sort INTEGER DEFAULT 0,
      icon TEXT,
      color TEXT,
      credit_limit REAL,
      billing_day INTEGER,
      payment_due_day INTEGER,
      is_archived INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT,
      sync_rev INTEGER DEFAULT 0
    );
  `);
  await p.execute(`
    CREATE TABLE IF NOT EXISTS accounting_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      icon TEXT,
      color TEXT,
      parent_id INTEGER,
      sort INTEGER DEFAULT 0,
      is_preset INTEGER DEFAULT 0,
      monthly_budget REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT,
      sync_rev INTEGER DEFAULT 0
    );
  `);
  await p.execute(`
    CREATE TABLE IF NOT EXISTS accounting_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      account_id INTEGER NOT NULL,
      to_account_id INTEGER,
      category_id INTEGER,
      transaction_time TEXT NOT NULL,
      remark TEXT,
      tags TEXT,
      todo_id INTEGER,
      location TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT,
      sync_rev INTEGER DEFAULT 0
    );
  `);
  await p.execute(`
    CREATE TABLE IF NOT EXISTS accounting_budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period TEXT NOT NULL,
      period_value TEXT NOT NULL,
      category_id INTEGER,
      amount REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT,
      sync_rev INTEGER DEFAULT 0
    );
  `);
  await p.execute(`
    CREATE TABLE IF NOT EXISTS accounting_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      base_currency TEXT NOT NULL,
      quote_currency TEXT NOT NULL,
      rate REAL NOT NULL,
      date TEXT NOT NULL,
      source TEXT
    );
  `);

  // 插入预设分类
  await p.execute(`
    INSERT OR IGNORE INTO accounting_categories (key, name, type, icon, color, sort, is_preset) VALUES
      ('food', '餐饮', 'expense', '🍜', '#ef4444', 1, 1),
      ('transport', '交通', 'expense', '🚗', '#f97316', 2, 1),
      ('shopping', '购物', 'expense', '🛍️', '#eab308', 3, 1),
      ('entertain', '娱乐', 'expense', '🎮', '#22c55e', 4, 1),
      ('housing', '居住', 'expense', '🏠', '#3b82f6', 5, 1),
      ('medical', '医疗', 'expense', '💊', '#ec4899', 6, 1),
      ('education', '教育', 'expense', '📚', '#8b5cf6', 7, 1),
      ('other_expense', '其他支出', 'expense', '📦', '#94a3b8', 8, 1),
      ('salary', '工资', 'income', '💰', '#22c55e', 1, 1),
      ('parttime', '兼职', 'income', '💼', '#3b82f6', 2, 1),
      ('invest', '投资收益', 'income', '📈', '#8b5cf6', 3, 1),
      ('other_income', '其他收入', 'income', '🎁', '#94a3b8', 4, 1);
  `);

  // 插入预设账户（逐条 NOT EXISTS 防重，兼容 sql.js 不支持 VALUES 子查询）
  const presetAccounts: Array<[string, string, string, string, number]> = [
    ['现金', 'cash', '💵', '#22c55e', 1],
    ['银行卡', 'bank', '💳', '#3b82f6', 2],
    ['支付宝', 'alipay', '📱', '#6366f1', 3],
    ['微信', 'wechat', '💬', '#22c55e', 4],
  ];
  for (const [name, type, icon, color, sort] of presetAccounts) {
    await p.execute(
      `INSERT INTO accounting_accounts (name, type, icon, color, sort)
       SELECT $1, $2, $3, $4, $5
       WHERE NOT EXISTS (SELECT 1 FROM accounting_accounts WHERE name = $1 AND deleted_at IS NULL);`,
      [name, type, icon, color, sort],
    );
  }

  // ===== 同步基础设施表 =====
  await p.execute(`
    CREATE TABLE IF NOT EXISTS sync_meta (
      id INTEGER PRIMARY KEY,
      device_id TEXT NOT NULL,
      last_pull_rev INTEGER DEFAULT 0,
      last_push_rev INTEGER DEFAULT 0,
      last_sync_at TEXT,
      remote_url TEXT,
      remote_user_encrypted TEXT
    );
  `);
  await p.execute(`
    CREATE TABLE IF NOT EXISTS sync_counter (
      id INTEGER PRIMARY KEY DEFAULT 1,
      rev INTEGER DEFAULT 0
    );
  `);
  await p.execute(`INSERT OR IGNORE INTO sync_counter (id, rev) VALUES (1, 0);`);

  // ===== 同步字段回填（兼容旧库）=====
  for (const [table, fields] of Object.entries(SYNC_FIELDS)) {
    for (const field of fields) {
      await addColumnIfMissing(p, table, field);
    }
  }

  // ===== updated_at 自动更新触发器 =====
  await createUpdateTriggers(p);
}
