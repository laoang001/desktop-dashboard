/**
 * TauriSqliteProvider - 桌面端 SQLite 实现（tauri-plugin-sql）
 * 原生支持 $1,$2... 占位符。
 */

import type { DataProvider } from './provider';
import { initSchema } from './schema';

const DB_NAME = 'sqlite:dashboard.db';

export class TauriSqliteProvider implements DataProvider {
  private db: any = null;
  private initPromise: Promise<void> | null = null;
  private inTransaction = false;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) {
      // 失败后重置 initPromise 以便重试
      try {
        await this.initPromise;
        return;
      } catch {
        this.initPromise = null;
      }
    }
    this.initPromise = (async () => {
      const Database = await import('@tauri-apps/plugin-sql');
      this.db = await Database.default.load(DB_NAME);
      await initSchema(this);
      console.log('[db:tauri] 数据库初始化完成');
    })();
    return this.initPromise;
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    await this.init();
    await this.db.execute(sql, params as never);
  }

  async select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    await this.init();
    const result = await this.db.select(sql, params as never);
    return result as T[];
  }

  async selectOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.select<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async getSetting(key: string): Promise<string | null> {
    const row = await this.selectOne<{ value: string }>(
      'SELECT value FROM settings WHERE key = $1',
      [key],
    );
    return row?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.execute(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
  }

  async transaction<T>(fn: (tx: DataProvider) => Promise<T>): Promise<T> {
    await this.init();
    // 嵌套调用时复用外层事务（伪嵌套），避免 "cannot start a transaction within a transaction"
    if (this.inTransaction) return fn(this);
    await this.execute('BEGIN');
    this.inTransaction = true;
    try {
      const result = await fn(this);
      await this.execute('COMMIT');
      return result;
    } catch (err) {
      try { await this.execute('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    } finally {
      this.inTransaction = false;
    }
  }
}
