/**
 * sync/syncEngine - 同步引擎
 * 全量快照 + LWW 合并策略（删除优先）。
 * 流程：拉取远程 → 事务内合并 → 推送合并结果 → 更新 sync_meta
 * 安全：互斥锁防重入、事务保护防丢数据、列白名单防注入、结构校验防损坏。
 */

import { getProvider } from '../data';
import { BUSINESS_TABLES } from '../data/schema';
import { fetchRemoteFile, uploadRemoteFile } from './webdavClient';
import type { DataProvider } from '../data/provider';
import type { SyncSnapshot, SyncMeta, WebDAVConfig } from './types';

/** 同步业务表清单（复用 schema.ts 的 BUSINESS_TABLES） */
const SYNC_TABLES = BUSINESS_TABLES;

/** 各表合法列名白名单（防远程数据注入列名） */
const TABLE_COLUMNS: Record<string, string[]> = {
  schedules: ['id', 'title', 'start_at', 'end_at', 'all_day', 'location', 'remark', 'color', 'created_at', 'updated_at', 'deleted_at', 'sync_rev'],
  todos: ['id', 'title', 'category', 'priority', 'status', 'due_date', 'planned_start', 'planned_end', 'sort', 'created_at', 'updated_at', 'deleted_at', 'sync_rev'],
  time_records: ['id', 'category', 'description', 'start_time', 'end_time', 'duration', 'date', 'todo_id', 'tags', 'created_at', 'updated_at', 'deleted_at', 'sync_rev'],
  time_categories: ['id', 'key', 'name', 'color', 'icon', 'daily_goal', 'weekly_goal', 'monthly_goal', 'sort', 'is_preset', 'is_skill', 'total_accumulated', 'created_at', 'updated_at', 'deleted_at', 'sync_rev'],
  diary_entries: ['id', 'content', 'tags', 'pinned', 'mood', 'weather', 'entry_date', 'ai_generated', 'created_at', 'updated_at', 'deleted_at', 'sync_rev'],
  accounting_accounts: ['id', 'name', 'type', 'balance', 'currency', 'sort', 'icon', 'color', 'credit_limit', 'billing_day', 'payment_due_day', 'is_archived', 'created_at', 'updated_at', 'deleted_at', 'sync_rev'],
  accounting_categories: ['id', 'key', 'name', 'type', 'icon', 'color', 'parent_id', 'sort', 'is_preset', 'monthly_budget', 'created_at', 'updated_at', 'deleted_at', 'sync_rev'],
  accounting_transactions: ['id', 'type', 'amount', 'account_id', 'to_account_id', 'category_id', 'transaction_time', 'remark', 'tags', 'todo_id', 'location', 'created_at', 'updated_at', 'deleted_at', 'sync_rev'],
  accounting_budgets: ['id', 'period', 'period_value', 'category_id', 'amount', 'created_at', 'updated_at', 'deleted_at', 'sync_rev'],
};

/** 互斥锁：防止并发同步 */
let syncInFlight: Promise<{ status: 'success' | 'error'; message: string }> | null = null;

/** 生成设备 ID（使用 crypto.randomUUID 若可用） */
function generateDeviceId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** 获取或初始化 sync_meta */
async function getOrInitMeta(p: DataProvider): Promise<SyncMeta> {
  let rows = await p.select<SyncMeta>('SELECT * FROM sync_meta WHERE id = 1');
  if (rows.length === 0) {
    await p.execute(
      'INSERT INTO sync_meta (id, device_id) VALUES ($1, $2)',
      [1, generateDeviceId()],
    );
    rows = await p.select<SyncMeta>('SELECT * FROM sync_meta WHERE id = 1');
  }
  return rows[0];
}

/** 检查表是否存在 */
async function tableExists(p: DataProvider, table: string): Promise<boolean> {
  const rows = await p.select<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=$1",
    [table],
  );
  return rows.length > 0;
}

/** 收集本地所有同步表数据 */
async function collectLocalData(): Promise<Record<string, Record<string, unknown>[] | null>> {
  const p = await getProvider();
  const data: Record<string, Record<string, unknown>[] | null> = {};
  for (const table of SYNC_TABLES) {
    if (!(await tableExists(p, table))) {
      data[table] = [];
      continue;
    }
    const rows = await p.select<Record<string, unknown>>(`SELECT * FROM "${table}"`);
    data[table] = rows;
  }
  return data;
}

/** 获取当前时间（ISO） */
function nowISO(): string {
  return new Date().toISOString();
}

/**
 * 统一时间戳格式：将 "YYYY-MM-DD HH:MM:SS"（SQLite datetime）转为 "YYYY-MM-DDTHH:MM:SS"（ISO）。
 * 解决 SQLite 的 datetime('now') 用空格分隔、JS 用 T 分隔导致字符串比较不一致的问题。
 */
function normalizeTimestamp(ts: unknown): string {
  return String(ts ?? '').replace(' ', 'T');
}

/**
 * LWW 合并：比较 updated_at，删除优先。
 * - 远程有本地无 → 取远程
 * - 本地有远程无 → 保留本地
 * - 双方都有 → 比较 updated_at，相等时删除版本胜出
 */
function pickWinner(localRow: Record<string, unknown>, remoteRow: Record<string, unknown>): Record<string, unknown> {
  const lu = normalizeTimestamp(localRow.updated_at);
  const ru = normalizeTimestamp(remoteRow.updated_at);
  const localDeleted = !!localRow.deleted_at;
  const remoteDeleted = !!remoteRow.deleted_at;

  if (ru > lu) return remoteRow;
  if (ru < lu) return localRow;
  // 时间戳相等：删除优先
  if (remoteDeleted) return remoteRow;
  if (localDeleted) return localRow;
  return localRow; // 都未删除，本地优先
}

/**
 * 事务内合并远程数据到本地。
 * 策略：逐行 LWW 合并，用 UPSERT + 删除缺失行替代整表清空。
 */
async function mergeRemoteIntoLocal(
  p: DataProvider,
  remote: Record<string, Record<string, unknown>[] | null>,
): Promise<void> {
  await p.transaction(async (tx) => {
    for (const table of SYNC_TABLES) {
      if (!(await tableExists(tx, table))) continue;
      const allowed = TABLE_COLUMNS[table] || [];
      if (allowed.length === 0) continue;

      const localRows = await tx.select<Record<string, unknown>>(`SELECT * FROM "${table}"`);
      const remoteRows = remote[table] || [];

      // 构建本地行索引
      const localMap = new Map<number, Record<string, unknown>>();
      for (const row of localRows) {
        localMap.set(row.id as number, row);
      }

      // 合并结果
      const mergedMap = new Map<number, Record<string, unknown>>();
      const seenIds = new Set<number>();

      for (const remoteRow of remoteRows) {
        const id = remoteRow.id as number;
        if (typeof id !== 'number') continue;
        seenIds.add(id);
        const localRow = localMap.get(id);
        const winner = localRow ? pickWinner(localRow, remoteRow) : remoteRow;
        mergedMap.set(id, winner);
      }

      // 本地有远程无 → 保留本地
      for (const [id, row] of localMap) {
        if (!seenIds.has(id)) {
          mergedMap.set(id, row);
        }
      }

      // 写回：先清空表（事务内安全），再批量插入
      await tx.execute(`DELETE FROM "${table}"`);
      for (const [, row] of mergedMap) {
        // 只取白名单列，防注入
        const keys = allowed.filter((k) => k in row);
        if (keys.length === 0) continue;
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const values = keys.map((k) => row[k]);
        await tx.execute(
          `INSERT INTO "${table}" (${keys.join(', ')}) VALUES (${placeholders})`,
          values,
        );
      }
    }
  });
}

/**
 * 执行一次完整同步（互斥保护）。
 * 1. 拉取远程快照
 * 2. 校验并合并到本地（事务内）
 * 3. 上传合并后的本地快照
 * 4. 更新 sync_meta
 */
export async function syncNow(config: WebDAVConfig): Promise<{
  status: 'success' | 'error';
  message: string;
}> {
  // 互斥锁：已在同步中则直接返回
  if (syncInFlight) {
    return { status: 'error', message: '同步正在进行中，请稍后' };
  }
  syncInFlight = doSyncNow(config).finally(() => { syncInFlight = null; });
  return syncInFlight;
}

/** 实际同步逻辑 */
async function doSyncNow(config: WebDAVConfig): Promise<{
  status: 'success' | 'error';
  message: string;
}> {
  const p = await getProvider();
  const meta = await getOrInitMeta(p);

  try {
    // 1. 拉取远程
    const { content: remoteRaw, etag } = await fetchRemoteFile(config);

    // 2. 合并
    if (remoteRaw) {
      let remoteSnapshot: SyncSnapshot;
      try {
        remoteSnapshot = JSON.parse(remoteRaw);
      } catch {
        throw new Error('远程快照 JSON 解析失败，文件可能已损坏');
      }
      // 结构校验
      if (!remoteSnapshot || typeof remoteSnapshot !== 'object'
          || !remoteSnapshot.tables || typeof remoteSnapshot.tables !== 'object') {
        throw new Error('远程快照格式无效');
      }
      await mergeRemoteIntoLocal(p, remoteSnapshot.tables);
    }

    // 3. 上传合并后的本地数据
    const localData = await collectLocalData();
    const snapshot: SyncSnapshot = {
      device_id: meta.device_id,
      synced_at: nowISO(),
      tables: localData,
    };
    await uploadRemoteFile(config, JSON.stringify(snapshot), etag);

    // 4. 更新 sync_meta
    await p.execute(
      `UPDATE sync_meta SET
        last_sync_at = $1,
        remote_url = $2
      WHERE id = 1`,
      [nowISO(), config.url],
    );

    return {
      status: 'success',
      message: remoteRaw
        ? '同步完成，已合并远程数据'
        : '初始同步完成，数据已上传',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'error', message: msg };
  }
}

/** 获取上次同步时间 */
export async function getLastSyncTime(): Promise<string | null> {
  try {
    const p = await getProvider();
    const meta = await getOrInitMeta(p);
    return meta.last_sync_at;
  } catch {
    return null;
  }
}

/** 获取同步配置（从 settings 读取） */
export async function getSyncConfig(): Promise<WebDAVConfig | null> {
  const p = await getProvider();
  const url = await p.getSetting('sync.webdav_url');
  const username = await p.getSetting('sync.webdav_user');
  const password = await p.getSetting('sync.webdav_password');
  if (!url || !username || !password) return null;
  return { url, username, password };
}

/** 保存同步配置（到 settings） */
export async function saveSyncConfig(config: WebDAVConfig): Promise<void> {
  const p = await getProvider();
  await p.setSetting('sync.webdav_url', config.url);
  await p.setSetting('sync.webdav_user', config.username);
  // 直接存储明文密码（后续应迁移到 OS keychain）
  await p.setSetting('sync.webdav_password', config.password);
}

/** 读取同步配置（别名，兼容旧版 import） */
export const getSyncConfigDecoded = getSyncConfig;

/** 设备 ID（用于展示） */
export async function getDeviceId(): Promise<string> {
  const p = await getProvider();
  const meta = await getOrInitMeta(p);
  return meta.device_id;
}
