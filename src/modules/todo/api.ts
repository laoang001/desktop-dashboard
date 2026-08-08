import { execute, select } from '../../composables/useDatabase';
import type { Todo } from '../../types';

export async function getTodos(category?: string): Promise<Todo[]> {
  if (category) {
    return select<Todo>('SELECT * FROM todos WHERE category = $1 AND deleted_at IS NULL ORDER BY sort, created_at DESC', [category]);
  }
  return select<Todo>('SELECT * FROM todos WHERE deleted_at IS NULL ORDER BY sort, created_at DESC');
}

export async function createTodo(data: {
  title: string;
  category: string;
  priority?: string;
  due_date?: string;
  planned_start?: string;
  planned_end?: string;
}): Promise<void> {
  await execute(
    `INSERT INTO todos (title, category, priority, due_date, planned_start, planned_end) VALUES ($1, $2, $3, $4, $5, $6)`,
    [data.title, data.category, data.priority ?? 'medium', data.due_date ?? null, data.planned_start ?? null, data.planned_end ?? null],
  );
}

export async function updateTodo(id: number, data: Partial<Todo>): Promise<void> {
  const ALLOWED_FIELDS = ['title', 'category', 'priority', 'status', 'due_date', 'planned_start', 'planned_end', 'sort'] as const;
  const fields = ALLOWED_FIELDS.filter(f => f in data);
  if (fields.length === 0) return;
  const values = fields.map(f => (data as Record<string, unknown>)[f]);
  const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  await execute(`UPDATE todos SET ${sets}, updated_at = datetime('now') WHERE id = $1`, [id, ...values]);
}

export async function toggleTodoStatus(id: number, status: string): Promise<void> {
  await execute('UPDATE todos SET status = $1, updated_at = datetime(\'now\') WHERE id = $2', [status, id]);
}

export async function deleteTodo(id: number): Promise<void> {
  await execute(`UPDATE todos SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = $1`, [id]);
}
