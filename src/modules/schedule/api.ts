import { execute, select } from '../../composables/useDatabase';
import type { Schedule } from '../../types';

export async function getSchedulesByDate(date: string): Promise<Schedule[]> {
  return select<Schedule>(
    `SELECT * FROM schedules WHERE date(start_at) = date($1) AND deleted_at IS NULL ORDER BY start_at`,
    [date],
  );
}

export async function getSchedulesByDateRange(start: string, end: string): Promise<Schedule[]> {
  return select<Schedule>(
    `SELECT * FROM schedules WHERE date(start_at) >= date($1) AND date(start_at) <= date($2) AND deleted_at IS NULL ORDER BY start_at`,
    [start, end],
  );
}

export async function createSchedule(data: {
  title: string;
  start_at: string;
  end_at?: string;
  all_day?: number;
  location?: string;
  remark?: string;
  color?: string;
}): Promise<void> {
  await execute(
    `INSERT INTO schedules (title, start_at, end_at, all_day, location, remark, color) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [data.title, data.start_at, data.end_at ?? null, data.all_day ?? 0, data.location ?? null, data.remark ?? null, data.color ?? '#3b82f6'],
  );
}

export async function updateSchedule(id: number, data: Partial<Schedule>): Promise<void> {
  const ALLOWED_FIELDS = ['title', 'start_at', 'end_at', 'all_day', 'location', 'remark', 'color'] as const;
  const fields = ALLOWED_FIELDS.filter(f => f in data);
  if (fields.length === 0) return;
  const values = fields.map(f => (data as Record<string, unknown>)[f]);
  const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  await execute(`UPDATE schedules SET ${sets}, updated_at = datetime('now') WHERE id = $1`, [id, ...values]);
}

export async function deleteSchedule(id: number): Promise<void> {
  await execute(`UPDATE schedules SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = $1`, [id]);
}
