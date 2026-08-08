/**
 * sync/httpClient - 平台感知的 HTTP 客户端
 * - Tauri 桌面: 使用 @tauri-apps/plugin-http（绕过 WebView CORS）
 * - Capacitor 安卓: 使用 CapacitorHttp（原生请求，绕过 CORS）
 * - 浏览器: 使用原生 fetch（受 CORS 限制，仅开发环境可用）
 */

import { isTauri } from '../composables/isTauri';
import { isCapacitor } from '../composables/usePlatform';

const DEFAULT_TIMEOUT = 30000;

/** 平台感知的 fetch，返回标准 Response 对象 */
export async function platformFetch(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT,
): Promise<Response> {
  const platform = isTauri() ? 'tauri' : isCapacitor() ? 'capacitor' : 'browser';
  console.log(`[httpClient] platform=${platform}, method=${init.method}, url=${url}`);
  try {
    const res = isTauri()
      ? await tauriFetch(url, init, timeoutMs)
      : isCapacitor()
        ? await capacitorFetch(url, init, timeoutMs)
        : await browserFetch(url, init, timeoutMs);
    console.log(`[httpClient] response: status=${res.status}, statusText=${res.statusText}`);
    return res;
  } catch (err) {
    console.error(`[httpClient] error:`, err);
    throw err;
  }
}

/* ===== Tauri：使用 @tauri-apps/plugin-http ===== */
async function tauriFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const { fetch } = await import('@tauri-apps/plugin-http');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ===== Capacitor：使用 CapacitorHttp ===== */
async function capacitorFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const { CapacitorHttp } = await import('@capacitor/core');
  const method = (init.method || 'GET').toUpperCase();
  const headers = (init.headers as Record<string, string>) || {};

  // 提取 body：CapacitorHttp 的 data 字段
  let data: unknown = undefined;
  if (init.body) {
    try {
      data = JSON.parse(init.body as string);
    } catch {
      data = init.body;
    }
  }

  const res = await CapacitorHttp.request({
    url,
    method,
    headers,
    data,
    connectTimeout: timeoutMs,
    readTimeout: timeoutMs,
  });

  // 将 CapacitorHttp 响应包装为 fetch 兼容的 Response 对象
  const bodyStr =
    typeof res.data === 'string'
      ? res.data
      : res.data != null
        ? JSON.stringify(res.data)
        : '';
  const respHeaders = new Headers();
  if (res.headers && typeof res.headers === 'object') {
    for (const [k, v] of Object.entries(res.headers as Record<string, string>)) {
      if (typeof v === 'string') respHeaders.set(k, v);
    }
  }
  return new Response(bodyStr, {
    status: res.status || 0,
    statusText: '',
    headers: respHeaders,
  });
}

/* ===== 浏览器：原生 fetch（带超时） ===== */
async function browserFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}