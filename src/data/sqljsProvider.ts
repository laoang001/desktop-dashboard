/**
 * SqlJsProvider - 浏览器/预览环境 SQLite 实现（sql.js WASM）
 * 替换旧 webDatabase.ts 的脆弱正则解析，使用真正的 SQLite 引擎。
 * 数据持久化到 localStorage（单条 JSON）。
 */

import type { DataProvider } from './provider';
import { normalizePlaceholders, extractOrderedParams } from './provider';
import { initSchema } from './schema';

const STORAGE_KEY = 'desktop-dashboard-sqlite';
// 使用 Vite 的 ?url 导入 wasm，构建时自动处理路径
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

export class SqlJsProvider implements DataProvider {
  private db: any = null;
  private initPromise: Promise<void> | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private inTransaction = false;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) {
      // 如果之前的 initPromise 失败了，重置以便重试
      try {
        await this.initPromise;
        return;
      } catch {
        this.initPromise = null;
      }
    }
    this.initPromise = (async () => {
      const initSqlJs = (await import('sql.js')).default;
      const SQL = await initSqlJs({ locateFile: () => wasmUrl });
      // 尝试从 localStorage 恢复
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const bytes = Uint8Array.from(atob(saved), (c) => c.charCodeAt(0));
          this.db = new SQL.Database(bytes);
        } catch {
          this.db = new SQL.Database();
        }
      } else {
        this.db = new SQL.Database();
      }
      await initSchema(this);
      console.log('[db:sqljs] 数据库初始化完成');
    })();
    return this.initPromise;
  }

  /** 持久化到 localStorage（防抖，避免频繁写） */
  private persist(): void {
    // 事务中不持久化，事务结束后统一持久化
    if (this.inTransaction) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      try {
        const bytes = this.db.export();
        // 分块处理避免栈溢出（String.fromCharCode 展开限制）
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        const b64 = btoa(binary);
        localStorage.setItem(STORAGE_KEY, b64);
      } catch (e) {
        console.error('[db:sqljs] 持久化失败', e);
      }
    }, 300);
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    await this.init();
    const normSql = normalizePlaceholders(sql);
    const orderedParams = extractOrderedParams(sql, params);
    this.db.run(normSql, orderedParams);
    this.persist();
  }

  async select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    await this.init();
    const normSql = normalizePlaceholders(sql);
    const orderedParams = extractOrderedParams(sql, params);
    const stmt = this.db.prepare(normSql);
    try {
      stmt.bind(orderedParams);
      const rows: T[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
      return rows;
    } finally {
      stmt.free(); // 确保异常时也释放 WASM 内存
    }
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
    // 嵌套调用时复用外层事务（伪嵌套）
    if (this.inTransaction) return fn(this);
    this.db.run('BEGIN');
    this.inTransaction = true;
    try {
      const result = await fn(this);
      this.db.run('COMMIT');
      // 事务结束后立即持久化
      this.persist();
      return result;
    } catch (err) {
      try { this.db.run('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    } finally {
      this.inTransaction = false;
    }
  }
}
