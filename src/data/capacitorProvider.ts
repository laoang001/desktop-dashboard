/**
 * CapacitorSqliteProvider - 安卓端 SQLite 实现
 * 使用 @capacitor-community/sqlite 原生插件，性能优于 sql.js WASM。
 * 占位符协议、事务嵌套保护与 TauriSqliteProvider / SqlJsProvider 对齐。
 */

import type { DataProvider } from './provider';
import { normalizePlaceholders, extractOrderedParams } from './provider';
import { initSchema } from './schema';

const DB_NAME = 'dashboard';

export class CapacitorSqliteProvider implements DataProvider {
  private db: any = null;
  private initPromise: Promise<void> | null = null;
  private inTransaction = false;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) {
      try {
        await this.initPromise;
        return;
      } catch {
        this.initPromise = null;
      }
    }
    this.initPromise = (async () => {
      const { SQLiteConnection, CapacitorSQLite } = await import('@capacitor-community/sqlite');
      const sqlite = new SQLiteConnection(CapacitorSQLite);

      // 检查连接一致性（应用重启后恢复）
      const consistency = await sqlite.checkConnectionsConsistency();
      if (!consistency.result) {
        // 不一致时所有连接已被关闭，重新创建
      }

      // 复用已有连接或创建新连接
      const connResult = await sqlite.isConnection(DB_NAME, false);
      if (connResult.result) {
        this.db = await sqlite.retrieveConnection(DB_NAME, false);
      } else {
        this.db = await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
      }

      await this.db.open();

      // 启用外键约束（与桌面端对齐）
      await this.db.execute('PRAGMA foreign_keys = ON;', false);

      await initSchema(this);
      console.log('[db:capacitor] 数据库初始化完成');
    })();
    return this.initPromise;
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    await this.init();
    const normSql = normalizePlaceholders(sql);
    const orderedParams = extractOrderedParams(sql, params);
    // transaction=false：手动管理事务，避免自动包裹导致嵌套
    await this.db.run(normSql, orderedParams, false);
  }

  async select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    await this.init();
    const normSql = normalizePlaceholders(sql);
    const orderedParams = extractOrderedParams(sql, params);
    const res = await this.db.query(normSql, orderedParams);
    return (res?.values || []) as T[];
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
    // 嵌套调用时复用外层事务（伪嵌套，与 TauriSqliteProvider / SqlJsProvider 对齐）
    if (this.inTransaction) return fn(this);
    await this.db.beginTransaction();
    this.inTransaction = true;
    try {
      const result = await fn(this);
      await this.db.commitTransaction();
      return result;
    } catch (err) {
      try { await this.db.rollbackTransaction(); } catch { /* ignore */ }
      throw err;
    } finally {
      this.inTransaction = false;
    }
  }
}
