/**
 * 数据层入口 - 根据运行环境选择对应 DataProvider
 * 桌面 → TauriSqliteProvider
 * 安卓 → CapacitorSqliteProvider（阶段4）
 * 浏览器/预览 → SqlJsProvider
 */

import type { DataProvider } from './provider';
import { isTauri } from '../composables/isTauri';
import { TauriSqliteProvider } from './tauriProvider';
import { SqlJsProvider } from './sqljsProvider';

let provider: DataProvider | null = null;

/** 检测是否在 Capacitor 安卓环境中 */
function isCapacitor(): boolean {
  return typeof window !== 'undefined' && 'Capacitor' in window;
}

/** 获取当前环境的 DataProvider（单例） */
export async function getProvider(): Promise<DataProvider> {
  if (provider) return provider;

  if (isTauri()) {
    provider = new TauriSqliteProvider();
  } else if (isCapacitor()) {
    // 阶段4启用：动态导入避免当前打包报错
    const { CapacitorSqliteProvider } = await import('./capacitorProvider');
    provider = new CapacitorSqliteProvider();
  } else {
    provider = new SqlJsProvider();
  }

  await provider.init();
  return provider;
}

export type { DataProvider } from './provider';
