/**
 * useDatabase - 数据访问统一入口（对外接口保持不变）
 * 内部委托给 DataProvider，按平台自动分流。
 * 旧 webDatabase.ts 已废弃，浏览器环境由 sql.js 接管。
 */

import { getProvider } from '../data';
import type { DataProvider } from '../data/provider';

/** 执行 SQL（INSERT/UPDATE/DELETE），参数使用 $1,$2... 占位符 */
export async function execute(sql: string, params: unknown[] = []): Promise<void> {
  const p = await getProvider();
  await p.execute(sql, params);
}

/** 查询数据，参数使用 $1,$2... 占位符 */
export async function select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const p = await getProvider();
  return p.select<T>(sql, params);
}

/** 获取单个值 */
export async function selectOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const p = await getProvider();
  return p.selectOne<T>(sql, params);
}

/** 设置项读取 */
export async function getSetting(key: string): Promise<string | null> {
  const p = await getProvider();
  return p.getSetting(key);
}

/** 设置项写入 */
export async function setSetting(key: string, value: string): Promise<void> {
  const p = await getProvider();
  return p.setSetting(key, value);
}

/**
 * 事务执行：在 BEGIN/COMMIT/ROLLBACK 中执行 fn，任意异常自动回滚。
 * 事务内不支持嵌套（SQLite savepoint）。
 */
export async function transaction<T>(fn: (tx: DataProvider) => Promise<T>): Promise<T> {
  const p = await getProvider();
  return p.transaction(fn);
}

export type { DataProvider };
