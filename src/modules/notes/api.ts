import { execute, select } from '../../composables/useDatabase';
import type { DiaryEntry } from '../../types';

/** 将数据库中存储的 tags（JSON 字符串）安全还原为数组 */
function parseTags(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function getDiaryEntries(): Promise<DiaryEntry[]> {
  const rows = await select<DiaryEntry>(
    'SELECT * FROM diary_entries WHERE deleted_at IS NULL ORDER BY pinned DESC, created_at DESC',
  );
  return rows.map(row => ({ ...row, tags: parseTags(row.tags) }));
}

export async function createDiaryEntry(content: string, tags: string[] = []): Promise<void> {
  await execute(
    'INSERT INTO diary_entries (content, tags) VALUES ($1, $2)',
    [content, JSON.stringify(tags)],
  );
}

export async function updateDiaryEntry(id: number, data: { content?: string; tags?: string[]; pinned?: number }): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.content !== undefined) { fields.push('content'); values.push(data.content); }
  if (data.tags !== undefined) { fields.push('tags'); values.push(JSON.stringify(data.tags)); }
  if (data.pinned !== undefined) { fields.push('pinned'); values.push(data.pinned); }
  if (fields.length === 0) return;
  const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  await execute(
    `UPDATE diary_entries SET ${sets}, updated_at = datetime('now') WHERE id = $1 AND deleted_at IS NULL`,
    [id, ...values],
  );
}

export async function deleteDiaryEntry(id: number): Promise<void> {
  await execute(
    "UPDATE diary_entries SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = $1",
    [id],
  );
}

// 向后兼容别名（旧组件仍可使用原名称）
export { getDiaryEntries as getNotes, createDiaryEntry as createNote, updateDiaryEntry as updateNote, deleteDiaryEntry as deleteNote };
