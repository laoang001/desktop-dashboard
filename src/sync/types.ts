/**
 * sync/types - 同步相关的类型定义
 */

/** 远程同步文件结构（全量快照） */
export interface SyncSnapshot {
  /** 最后推送时的设备 ID */
  device_id: string;
  /** 快照生成时间 */
  synced_at: string;
  /** 各业务表数据（null 表示该表尚未创建） */
  tables: Record<string, SyncTableData | null>;
}

/** 单张表的数据行数组 */
export type SyncTableData = Record<string, unknown>[];

/** 同步元数据（对应 sync_meta 表） */
export interface SyncMeta {
  id: number;
  device_id: string;
  last_pull_rev: number;
  last_push_rev: number;
  last_sync_at: string | null;
  remote_url: string | null;
  remote_user_encrypted: string | null;
}

/** 同步状态 */
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'unconfigured';

/** 同步事件 */
export interface SyncEventDetail {
  status: SyncStatus;
  message?: string;
  timestamp: number;
}

/** WebDAV 配置 */
export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
}