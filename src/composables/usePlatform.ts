/** 平台检测工具 */
export { isTauri } from './isTauri';
import { isTauri } from './isTauri';

/** 检测是否在 Capacitor 安卓环境中 */
export function isCapacitor(): boolean {
  return typeof window !== 'undefined' && 'Capacitor' in window;
}

/** 检测是否为移动端布局（Capacitor、URL 参数 ?mobile=1、或窄屏浏览器） */
export function isMobile(): boolean {
  if (isCapacitor()) return true;
  if (isTauri()) return false; // Tauri 桌面端始终使用桌面布局
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mobile') === '1') return true;
    return window.innerWidth < 768;
  }
  return false;
}
