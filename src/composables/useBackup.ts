/**
 * useBackup - 本地备份与恢复
 * 导出业务数据为 JSON 文件，从 JSON 文件恢复。
 * 跨平台通用：浏览器 / Tauri / Capacitor 均通过 DataProvider 抽象层操作。
 *
 * 设计原则：
 * - 导出包含 schema_version 与时间戳，便于未来兼容性处理
 * - 恢复使用事务包裹 + 软删除保留（DELETE 物理清除后重新插入）
 * - 仅导出业务表数据，settings 表内容由各端独立维护
 */

import { select, transaction } from './useDatabase';
import { BUSINESS_TABLES } from '../data/schema';
import type { DataProvider } from '../data/provider';

/** 备份文件结构 */
interface BackupFile {
  schema_version: 1;
  exported_at: string;
  device: string;
  tables: Record<string, unknown[]>;
}

/** 操作结果 */
export interface BackupResult {
  tableCount: number;
  rowCount: number;
}

/** 检测 Tauri 环境（用于读取设备标识） */
function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** 生成备份文件名 */
function backupFileName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `dashboard-backup-${stamp}.json`;
}

/** 触发浏览器文件下载 */
function downloadBlob(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 延迟释放，避免下载未启动就被回收
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 导出全部业务数据为 JSON 文件并触发下载。
 * 仅导出未软删除的记录（deleted_at IS NULL），减少备份体积。
 */
export async function exportBackup(): Promise<BackupResult> {
  const tables: Record<string, unknown[]> = {};
  let totalRows = 0;

  for (const table of BUSINESS_TABLES) {
    // 逐表查询，包含软删除字段以便恢复时保留状态
    const rows = await select(`SELECT * FROM ${table} WHERE deleted_at IS NULL`);
    tables[table] = rows as unknown[];
    totalRows += rows.length;
  }

  const backup: BackupFile = {
    schema_version: 1,
    exported_at: new Date().toISOString(),
    device: isTauriEnv() ? 'tauri-desktop' : 'web',
    tables,
  };

  downloadBlob(JSON.stringify(backup, null, 2), backupFileName());

  return {
    tableCount: BUSINESS_TABLES.length,
    rowCount: totalRows,
  };
}

/**
 * 从 JSON 文件恢复数据。
 * 流程：
 *   1. 读取并校验文件格式
 *   2. 事务包裹：DELETE 现有数据 → INSERT 备份数据
 *   3. 软删除记录（deleted_at 非空）保留原状态
 *
 * 注意：恢复会物理清除现有数据再插入，请确保备份文件可信。
 */
export async function importBackup(file: File): Promise<BackupResult> {
  // 1. 读取文件
  const text = await file.text();
  let backup: BackupFile;
  try {
    backup = JSON.parse(text);
  } catch {
    throw new Error('备份文件格式错误：无法解析 JSON');
  }

  // 2. 校验结构
  if (!backup || typeof backup !== 'object') {
    throw new Error('备份文件无效：缺少根对象');
  }
  if (!backup.tables || typeof backup.tables !== 'object') {
    throw new Error('备份文件无效：缺少 tables 字段');
  }
  if (backup.schema_version !== 1) {
    throw new Error(`不支持的备份版本：${backup.schema_version}`);
  }

  let totalRows = 0;
  let tableCount = 0;

  // 3. 事务包裹恢复过程
  await transaction(async (tx: DataProvider) => {
    for (const table of BUSINESS_TABLES) {
      const rows = backup.tables[table];
      if (!Array.isArray(rows)) continue;

      // 物理清除现有数据（备份只含未删除数据，所以这里安全）
      await tx.execute(`DELETE FROM ${table}`);

      if (rows.length === 0) continue;
      tableCount++;
      totalRows += rows.length;

      // 逐条插入（字段来自原表，避免列顺序问题）
      for (const row of rows) {
        const obj = row as Record<string, unknown>;
        const cols = Object.keys(obj);
        if (cols.length === 0) continue;

        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        const colList = cols.join(', ');
        const values = cols.map((c) => obj[c]);

        await tx.execute(
          `INSERT INTO ${table} (${colList}) VALUES (${placeholders})`,
          values,
        );
      }
    }
  });

  return { tableCount, rowCount: totalRows };
}
