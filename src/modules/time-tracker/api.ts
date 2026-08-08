import { execute, select, selectOne } from '../../composables/useDatabase';
import type { TimeRecord, TimeCategory } from '../../types';

// ==================== 时间记录 CRUD ====================

export async function getTimeRecordsByDate(date: string): Promise<TimeRecord[]> {
  return select<TimeRecord>(
    'SELECT * FROM time_records WHERE date = $1 AND deleted_at IS NULL ORDER BY start_time',
    [date],
  );
}

export async function getTimeRecordsByDateRange(start: string, end: string): Promise<TimeRecord[]> {
  return select<TimeRecord>(
    'SELECT * FROM time_records WHERE date >= $1 AND date <= $2 AND deleted_at IS NULL ORDER BY date, start_time',
    [start, end],
  );
}

export async function createTimeRecord(data: {
  category: string;
  description?: string;
  start_time: string;
  end_time?: string;
  duration?: number;
  date: string;
  todo_id?: number;
}): Promise<void> {
  await execute(
    `INSERT INTO time_records (category, description, start_time, end_time, duration, date, todo_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [data.category, data.description ?? null, data.start_time, data.end_time ?? null, data.duration ?? null, data.date, data.todo_id ?? null],
  );
}

export async function updateTimeRecord(id: number, data: Partial<TimeRecord>): Promise<void> {
  const allowed = ['category', 'description', 'start_time', 'end_time', 'duration', 'date', 'todo_id', 'tags'];
  const fields = allowed.filter(f => (data as Record<string, unknown>)[f] !== undefined);
  if (fields.length === 0) return;
  const values = fields.map(f => (data as Record<string, unknown>)[f]);
  const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  await execute(
    `UPDATE time_records SET ${sets}, updated_at = datetime('now') WHERE id = $1`,
    [id, ...values],
  );
}

export async function deleteTimeRecord(id: number): Promise<void> {
  await execute(
    "UPDATE time_records SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = $1",
    [id],
  );
}

// ==================== 时间分类 ====================

export async function getTimeCategories(): Promise<TimeCategory[]> {
  return select<TimeCategory>(
    'SELECT * FROM time_categories WHERE deleted_at IS NULL ORDER BY sort',
  );
}

export async function createTimeCategory(data: {
  key: string;
  name: string;
  color: string;
  icon?: string;
  daily_goal?: number;
}): Promise<void> {
  await execute(
    `INSERT INTO time_categories (key, name, color, icon, daily_goal) VALUES ($1, $2, $3, $4, $5)`,
    [data.key, data.name, data.color, data.icon ?? '📝', data.daily_goal ?? 0],
  );
}

export async function updateTimeCategory(id: number, data: Partial<TimeCategory>): Promise<void> {
  const allowed = ['key', 'name', 'color', 'icon', 'daily_goal', 'weekly_goal', 'monthly_goal', 'sort', 'is_preset', 'is_skill', 'total_accumulated'];
  const fields = allowed.filter(f => (data as Record<string, unknown>)[f] !== undefined);
  if (fields.length === 0) return;
  const values = fields.map(f => (data as Record<string, unknown>)[f]);
  const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  await execute(
    `UPDATE time_categories SET ${sets}, updated_at = datetime('now') WHERE id = $1`,
    [id, ...values],
  );
}

export async function deleteTimeCategory(id: number): Promise<void> {
  // 先查该分类的 key
  const cat = await selectOne<{ key: string }>(
    'SELECT key FROM time_categories WHERE id = $1',
    [id],
  );
  if (cat) {
    // 检查是否有未删除的时间记录在引用该分类
    const ref = await selectOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM time_records WHERE category = $1 AND deleted_at IS NULL',
      [cat.key],
    );
    if (ref && ref.count > 0) {
      throw new Error(`无法删除分类：仍有 ${ref.count} 条时间记录正在使用`);
    }
  }
  await execute(
    "UPDATE time_categories SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = $1 AND is_preset = 0",
    [id],
  );
}

// ==================== 统计 ====================

export async function getDailySummary(date: string): Promise<{ category: string; total_duration: number }[]> {
  return select(
    `SELECT category, SUM(duration) as total_duration FROM time_records WHERE date = $1 AND duration IS NOT NULL AND deleted_at IS NULL GROUP BY category`,
    [date],
  );
}

/** 周统计：返回本周每天每分类时长 */
export async function getWeeklySummary(
  startDate: string,
  endDate: string,
): Promise<{ date: string; category: string; total_duration: number }[]> {
  return select(
    `SELECT date, category, SUM(duration) as total_duration
     FROM time_records
     WHERE date >= $1 AND date <= $2 AND duration IS NOT NULL AND deleted_at IS NULL
     GROUP BY date, category
     ORDER BY date, category`,
    [startDate, endDate],
  );
}

/** 月统计：返回本月每天每分类时长（用于趋势线图） */
export async function getMonthlySummary(
  startDate: string,
  endDate: string,
): Promise<{ date: string; category: string; total_duration: number }[]> {
  return select(
    `SELECT date, category, SUM(duration) as total_duration
     FROM time_records
     WHERE date >= $1 AND date <= $2 AND duration IS NOT NULL AND deleted_at IS NULL
     GROUP BY date, category
     ORDER BY date, category`,
    [startDate, endDate],
  );
}

/** 范围内分类汇总（用于饼图） */
export async function getRangeSummary(
  startDate: string,
  endDate: string,
): Promise<{ category: string; total_duration: number }[]> {
  return select(
    `SELECT category, SUM(duration) as total_duration
     FROM time_records
     WHERE date >= $1 AND date <= $2 AND duration IS NOT NULL AND deleted_at IS NULL
     GROUP BY category
     ORDER BY total_duration DESC`,
    [startDate, endDate],
  );
}
