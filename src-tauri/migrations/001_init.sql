// 数据库初始化 SQL
-- 日程
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

-- 待办（三分类：工作/锻炼/生活）
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

-- 笔记
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  tags TEXT,
  pinned INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 时间记录
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
CREATE INDEX IF NOT EXISTS idx_time_records_date ON time_records(date);
CREATE INDEX IF NOT EXISTS idx_time_records_todo_id ON time_records(todo_id);

-- 时间分类
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

INSERT OR IGNORE INTO time_categories (key, name, color, icon, daily_goal, sort, is_preset) VALUES
  ('work', '工作', '#3b82f6', '💼', 28800, 1, 1),
  ('exercise', '锻炼', '#22c55e', '🏃', 3600, 2, 1),
  ('life', '生活', '#f97316', '🏠', 14400, 3, 1);

-- 设置
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
