/**
 * accounting/api - 记账模块数据库操作
 * 账户/分类/流水/预算 CRUD
 */

import { execute, select, selectOne, transaction } from '../../composables/useDatabase';
import type { DataProvider } from '../../data/provider';
import type { Account, AccountCategory, Transaction, Budget } from '../../types';

/* ===== 账户 ===== */
export async function getAccounts(): Promise<Account[]> {
  return select<Account>(
    'SELECT * FROM accounting_accounts WHERE deleted_at IS NULL ORDER BY sort, id',
  );
}

export async function createAccount(data: {
  name: string;
  type: Account['type'];
  balance?: number;
  icon?: string;
  color?: string;
  credit_limit?: number;
  billing_day?: number;
  payment_due_day?: number;
}): Promise<void> {
  await execute(
    `INSERT INTO accounting_accounts (name, type, balance, icon, color, credit_limit, billing_day, payment_due_day)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [data.name, data.type, data.balance ?? 0, data.icon ?? null, data.color ?? null,
     data.credit_limit ?? null, data.billing_day ?? null, data.payment_due_day ?? null],
  );
}

/** 账户允许更新的字段白名单 */
const ACCOUNT_FIELDS = ['name', 'type', 'balance', 'currency', 'sort', 'icon', 'color', 'credit_limit', 'billing_day', 'payment_due_day', 'is_archived'];

export async function updateAccount(id: number, data: Partial<Account>): Promise<void> {
  const fields = Object.keys(data).filter(k => (ACCOUNT_FIELDS as string[]).includes(k));
  if (fields.length === 0) return;
  const values = fields.map(k => (data as Record<string, unknown>)[k]);
  const sets = fields.map((f, i) => `"${f}" = $${i + 2}`).join(', ');
  await execute(
    `UPDATE accounting_accounts SET ${sets}, updated_at = datetime('now') WHERE id = $1 AND deleted_at IS NULL`,
    [id, ...values],
  );
}

export async function deleteAccount(id: number): Promise<void> {
  await execute('UPDATE accounting_accounts SET deleted_at = datetime(\'now\') WHERE id = $1', [id]);
}

/* ===== 分类 ===== */
export async function getCategories(type?: 'income' | 'expense'): Promise<AccountCategory[]> {
  if (type) {
    return select<AccountCategory>(
      'SELECT * FROM accounting_categories WHERE deleted_at IS NULL AND type = $1 ORDER BY sort, id',
      [type],
    );
  }
  return select<AccountCategory>(
    'SELECT * FROM accounting_categories WHERE deleted_at IS NULL ORDER BY type, sort, id',
  );
}

export async function createCategory(data: {
  key: string;
  name: string;
  type: 'income' | 'expense';
  icon?: string;
  color?: string;
  parent_id?: number;
  monthly_budget?: number;
}): Promise<void> {
  await execute(
    `INSERT INTO accounting_categories (key, name, type, icon, color, parent_id, monthly_budget)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [data.key, data.name, data.type, data.icon ?? null, data.color ?? null,
     data.parent_id ?? null, data.monthly_budget ?? 0],
  );
}

/** 分类允许更新的字段白名单 */
const CATEGORY_FIELDS = ['key', 'name', 'type', 'icon', 'color', 'parent_id', 'sort', 'is_preset', 'monthly_budget'];

export async function updateCategory(id: number, data: Partial<AccountCategory>): Promise<void> {
  const fields = Object.keys(data).filter(k => (CATEGORY_FIELDS as string[]).includes(k));
  if (fields.length === 0) return;
  const values = fields.map(k => (data as Record<string, unknown>)[k]);
  const sets = fields.map((f, i) => `"${f}" = $${i + 2}`).join(', ');
  await execute(
    `UPDATE accounting_categories SET ${sets}, updated_at = datetime('now') WHERE id = $1 AND deleted_at IS NULL`,
    [id, ...values],
  );
}

export async function deleteCategory(id: number): Promise<void> {
  await execute('UPDATE accounting_categories SET deleted_at = datetime(\'now\') WHERE id = $1', [id]);
}

/* ===== 流水 ===== */
export async function getTransactions(
  startDate?: string,
  endDate?: string,
  accountId?: number,
  categoryId?: number,
): Promise<Transaction[]> {
  let sql = 'SELECT * FROM accounting_transactions WHERE deleted_at IS NULL';
  const params: unknown[] = [];
  let idx = 1;

  if (startDate) {
    sql += ` AND transaction_time >= $${idx++}`;
    params.push(startDate);
  }
  if (endDate) {
    sql += ` AND transaction_time <= $${idx++}`;
    params.push(endDate + 'T23:59:59');
  }
  if (accountId) {
    sql += ` AND (account_id = $${idx} OR to_account_id = $${idx})`;
    params.push(accountId);
    idx++;
  }
  if (categoryId) {
    sql += ` AND category_id = $${idx++}`;
    params.push(categoryId);
  }

  sql += ' ORDER BY transaction_time DESC, id DESC';
  return select<Transaction>(sql, params);
}

export async function getTodayTransactions(): Promise<Transaction[]> {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return getTransactions(dateStr, dateStr);
}

/** 获取本地日期时间字符串（避免 UTC 导致日期错位） */
function localDateTimeStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}:${s}`;
}

export async function createTransaction(data: {
  type: Transaction['type'];
  amount: number;
  account_id: number;
  to_account_id?: number;
  category_id?: number;
  transaction_time?: string;
  remark?: string;
  tags?: string;
  todo_id?: number;
  location?: string;
}): Promise<void> {
  // 使用本地时间而非 UTC，避免 23:30 的记录算到第二天
  const time = data.transaction_time || localDateTimeStr();

  // 事务保护：流水写入和余额更新必须原子性，避免部分失败导致资金不一致
  await transaction(async (tx) => {
    await tx.execute(
      `INSERT INTO accounting_transactions (type, amount, account_id, to_account_id, category_id, transaction_time, remark, tags, todo_id, location)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [data.type, data.amount, data.account_id, data.to_account_id ?? null, data.category_id ?? null,
       time, data.remark ?? null, data.tags ?? null, data.todo_id ?? null, data.location ?? null],
    );
    await updateAccountBalance(tx, data.type, data.amount, data.account_id, data.to_account_id);
  });
}

/** 余额更新辅助函数（在事务内调用） */
async function updateAccountBalance(
  tx: DataProvider,
  type: Transaction['type'],
  amount: number,
  accountId: number,
  toAccountId?: number,
): Promise<void> {
  if (type === 'income') {
    await tx.execute('UPDATE accounting_accounts SET balance = balance + $1, updated_at = datetime(\'now\') WHERE id = $2 AND deleted_at IS NULL', [amount, accountId]);
  } else if (type === 'expense') {
    await tx.execute('UPDATE accounting_accounts SET balance = balance - $1, updated_at = datetime(\'now\') WHERE id = $2 AND deleted_at IS NULL', [amount, accountId]);
  } else if (type === 'transfer' && toAccountId) {
    await tx.execute('UPDATE accounting_accounts SET balance = balance - $1, updated_at = datetime(\'now\') WHERE id = $2 AND deleted_at IS NULL', [amount, accountId]);
    await tx.execute('UPDATE accounting_accounts SET balance = balance + $1, updated_at = datetime(\'now\') WHERE id = $2 AND deleted_at IS NULL', [amount, toAccountId]);
  }
}

export async function deleteTransaction(id: number): Promise<void> {
  // 先查出该流水用于回滚余额
  const t = await selectOne<Transaction>(
    'SELECT type, amount, account_id, to_account_id FROM accounting_transactions WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  if (!t) return;

  // 事务保护：软删除流水和余额回滚必须原子性
  await transaction(async (tx) => {
    await tx.execute('UPDATE accounting_transactions SET deleted_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = $1', [id]);
    // 回滚账户余额（与创建时反向操作）
    await updateAccountBalance(tx, t.type === 'income' ? 'expense' : t.type === 'expense' ? 'income' : 'transfer', t.amount, t.account_id, t.to_account_id ?? undefined);
  });
}

/** 流水允许更新的字段白名单 */
const TRANSACTION_FIELDS = ['type', 'amount', 'account_id', 'to_account_id', 'category_id', 'transaction_time', 'remark', 'tags', 'todo_id', 'location'];

/** 更新流水：自动回滚旧余额影响并应用新余额影响（事务保护） */
export async function updateTransaction(id: number, data: Partial<Transaction>): Promise<void> {
  // 查出旧流水
  const old = await selectOne<Transaction>(
    'SELECT type, amount, account_id, to_account_id FROM accounting_transactions WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  if (!old) return;

  const fields = Object.keys(data).filter(k => TRANSACTION_FIELDS.includes(k));
  if (fields.length === 0) return;

  // 计算新值（未提供的字段沿用旧值）
  const newType = (data.type ?? old.type) as Transaction['type'];
  const newAmount = data.amount ?? old.amount;
  const newAccountId = data.account_id ?? old.account_id;
  const newToAccountId = data.to_account_id ?? old.to_account_id ?? undefined;

  await transaction(async (tx) => {
    // 1. 回滚旧流水对余额的影响
    await updateAccountBalance(tx, old.type === 'income' ? 'expense' : old.type === 'expense' ? 'income' : 'transfer', old.amount, old.account_id, old.to_account_id ?? undefined);
    // 2. 应用新流水对余额的影响
    await updateAccountBalance(tx, newType, newAmount, newAccountId, newToAccountId);
    // 3. 更新流水记录
    const values = fields.map(k => (data as Record<string, unknown>)[k]);
    const sets = fields.map((f, i) => `"${f}" = $${i + 2}`).join(', ');
    await tx.execute(
      `UPDATE accounting_transactions SET ${sets}, updated_at = datetime('now') WHERE id = $1`,
      [id, ...values],
    );
  });
}

/* ===== 预算 ===== */
export async function getBudgets(period: string, periodValue: string): Promise<Budget[]> {
  return select<Budget>(
    'SELECT * FROM accounting_budgets WHERE deleted_at IS NULL AND period = $1 AND period_value = $2 ORDER BY category_id',
    [period, periodValue],
  );
}

export async function setBudget(data: {
  period: Budget['period'];
  period_value: string;
  category_id?: number;
  amount: number;
}): Promise<void> {
  // 事务保护：软删除旧预算 + 插入新预算必须原子性，避免中间失败导致预算丢失
  await transaction(async (tx) => {
    // 软删除旧的同条件预算（遵循软删除约束，禁止硬 DELETE）
    await tx.execute(
      `UPDATE accounting_budgets SET deleted_at = datetime('now'), updated_at = datetime('now')
       WHERE period = $1 AND period_value = $2 AND category_id IS NOT DISTINCT FROM $3 AND deleted_at IS NULL`,
      [data.period, data.period_value, data.category_id ?? null],
    );
    await tx.execute(
      `INSERT INTO accounting_budgets (period, period_value, category_id, amount) VALUES ($1, $2, $3, $4)`,
      [data.period, data.period_value, data.category_id ?? null, data.amount],
    );
  });
}

export async function deleteBudget(id: number): Promise<void> {
  await execute('UPDATE accounting_budgets SET deleted_at = datetime(\'now\') WHERE id = $1', [id]);
}

/* ===== 统计 ===== */
export async function getMonthlySummary(yearMonth: string): Promise<{
  income: number;
  expense: number;
  byCategory: { category_id: number | null; type: string; total: number }[];
}> {
  const startDate = `${yearMonth}-01`;
  // 计算月末
  const [y, m] = yearMonth.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}T23:59:59`;

  const transactions = await select<{ type: string; amount: number; category_id: number | null }>(
    `SELECT type, amount, category_id FROM accounting_transactions
     WHERE deleted_at IS NULL AND transaction_time >= $1 AND transaction_time <= $2`,
    [startDate, endDate],
  );

  let income = 0;
  let expense = 0;
  const catMap = new Map<string, { category_id: number | null; type: string; total: number }>();

  for (const t of transactions) {
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;     // 转账不计入收支汇总

    const key = `${t.type}_${t.category_id ?? 'null'}`;
    const existing = catMap.get(key);
    if (existing) {
      existing.total += t.amount;
    } else {
      catMap.set(key, { category_id: t.category_id, type: t.type, total: t.amount });
    }
  }

  return { income, expense, byCategory: Array.from(catMap.values()) };
}

/** 获取月度每日收支趋势 */
export async function getDailyTrend(yearMonth: string): Promise<{ date: string; income: number; expense: number }[]> {
  const startDate = `${yearMonth}-01`;
  const [y, m] = yearMonth.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}T23:59:59`;

  const rows = await select<{ day: string; type: string; total: number }>(
    `SELECT substr(transaction_time, 1, 10) as day, type, SUM(amount) as total
     FROM accounting_transactions
     WHERE deleted_at IS NULL AND transaction_time >= $1 AND transaction_time <= $2
     GROUP BY day, type ORDER BY day`,
    [startDate, endDate],
  );

  const dayMap = new Map<string, { income: number; expense: number }>();
  for (const r of rows) {
    const entry = dayMap.get(r.day) || { income: 0, expense: 0 };
    if (r.type === 'income') entry.income += r.total;
    else if (r.type === 'expense') entry.expense += r.total;
    dayMap.set(r.day, entry);
  }

  const result: { date: string; income: number; expense: number }[] = [];
  for (let d = 1; d <= lastDay; d++) {
    const date = `${yearMonth}-${String(d).padStart(2, '0')}`;
    const entry = dayMap.get(date) || { income: 0, expense: 0 };
    result.push({ date, ...entry });
  }
  return result;
}