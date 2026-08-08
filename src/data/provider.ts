/**
 * DataProvider - 统一数据访问接口
 * 三端各一实现：桌面(Tauri SQLite) / 安卓(Capacitor SQLite) / 浏览器(sql.js)
 * 所有模块只依赖此接口，不直接碰平台 API。
 */

export interface DataProvider {
  /** 初始化（建表、迁移等） */
  init(): Promise<void>;
  /** 执行 SQL（INSERT/UPDATE/DELETE），参数使用 $1,$2... 占位符 */
  execute(sql: string, params?: unknown[]): Promise<void>;
  /** 查询数据，参数使用 $1,$2... 占位符 */
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
  /** 获取单个值 */
  selectOne<T>(sql: string, params?: unknown[]): Promise<T | null>;
  /** 设置项读取 */
  getSetting(key: string): Promise<string | null>;
  /** 设置项写入 */
  setSetting(key: string, value: string): Promise<void>;
  /**
   * 事务执行：在 BEGIN/COMMIT/ROLLBACK 中执行 fn，任意异常自动回滚。
   * 事务内不支持嵌套（SQLite savepoint）。
   */
  transaction<T>(fn: (tx: DataProvider) => Promise<T>): Promise<T>;
}

/** 将 SQL 中的 $N 占位符转换为 ? （sql.js / capacitor 需要） */
export function normalizePlaceholders(sql: string): string {
  return sql.replace(/\$(\d+)/g, '?');
}

/** 从 SQL 中按 $N 出现顺序提取参数（转换用） */
export function extractOrderedParams(sql: string, params: unknown[]): unknown[] {
  const matches = sql.match(/\$(\d+)/g);
  if (!matches) return params || [];
  return matches.map((m) => params[parseInt(m.slice(1)) - 1]);
}
