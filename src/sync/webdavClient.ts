/**
 * sync/webdavClient - WebDAV HTTP 客户端
 * 使用平台感知的 HTTP 客户端（Tauri/Capacitor/浏览器），绕过 CORS 限制。
 * 支持 Basic Auth、超时控制、ETag 冲突检测、409/429 状态码处理。
 */

import { platformFetch } from './httpClient';

const SYNC_FILE_NAME = 'dashboard_sync.json';

/** 构建远程文件完整 URL */
function fileUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  return `${normalized}/${SYNC_FILE_NAME}`;
}

/**
 * 确保远程目录存在（坚果云 /dav/ 根目录只读，必须用子目录）。
 * 如果 URL 以 /dav/ 结尾，自动追加 dashboard/ 子目录。
 */
async function ensureSyncDir(config: {
  url: string;
  username: string;
  password: string;
}): Promise<string> {
  let url = config.url.replace(/\/+$/, '') + '/';
  // 坚果云根目录 /dav/ 只读，自动追加子目录
  if (/\/dav\/?$/.test(url)) {
    url = url.replace(/\/?$/, '') + '/dashboard/';
  }
  // 尝试创建目录（已存在则忽略）
  try {
    const res = await platformFetch(url, {
      method: 'MKCOL',
      headers: { Authorization: authHeader(config.username, config.password) },
    });
    // 201=创建成功，405=已存在，都正常
    if (res.status !== 201 && res.status !== 405 && !res.ok) {
      console.warn('[webdav] MKCOL response:', res.status);
    }
  } catch (err) {
    console.warn('[webdav] MKCOL failed (may already exist):', err);
  }
  return url;
}

/** 生成 Basic Auth header（兼容非 Latin1 字符） */
function authHeader(username: string, password: string): string {
  const cred = unescape(encodeURIComponent(`${username}:${password}`));
  return 'Basic ' + btoa(cred);
}

/** 不可重试的错误（认证失败、冲突、格式错误等），绕过退避重试直接抛出 */
class WebDAVFatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebDAVFatalError';
  }
}

/** 延迟工具（用于退避重试） */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 尝试获取远程文件内容 */
export async function fetchRemoteFile(config: {
  url: string;
  username: string;
  password: string;
}): Promise<{ content: string | null; etag: string | null }> {
  const dirUrl = await ensureSyncDir(config);
  const remoteUrl = fileUrl(dirUrl);
  try {
    const res = await platformFetch(remoteUrl, {
      method: 'GET',
      headers: {
        Authorization: authHeader(config.username, config.password),
      },
    });
    if (res.status === 404) return { content: null, etag: null };
    if (res.status === 401 || res.status === 403) {
      throw new WebDAVFatalError(`认证失败(${res.status})，请检查用户名或应用密码`);
    }
    if (!res.ok) {
      throw new WebDAVFatalError(`WebDAV 请求失败: ${res.status} ${res.statusText}`);
    }
    const content = await res.text();
    const etag = res.headers.get('ETag');
    return { content, etag };
  } catch (err) {
    if (err instanceof WebDAVFatalError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('连接超时，请检查网络或服务器地址');
    }
    throw new Error(
      `无法连接同步服务器: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** 上传文件到远程（带 429/5xx 退避重试） */
export async function uploadRemoteFile(
  config: { url: string; username: string; password: string },
  content: string,
  etag?: string | null,
): Promise<void> {
  const dirUrl = await ensureSyncDir(config);
  const remoteUrl = fileUrl(dirUrl);
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const headers: Record<string, string> = {
        Authorization: authHeader(config.username, config.password),
        'Content-Type': 'application/json',
      };
      if (etag) {
        headers['If-Match'] = etag;
      }

      const res = await platformFetch(remoteUrl, {
        method: 'PUT',
        headers,
        body: content,
      });

      if (res.ok) return;

      if (res.status === 412) {
        throw new WebDAVFatalError('远程数据已被其他设备修改，请重新同步');
      }

      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        if (attempt < maxRetries) {
          await delay(1000 * Math.pow(2, attempt));
          continue;
        }
      }

      if (res.status === 401 || res.status === 403) {
        throw new WebDAVFatalError('认证失败，请检查用户名或应用密码');
      }

      throw new WebDAVFatalError(`WebDAV 上传失败: ${res.status} ${res.statusText}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new WebDAVFatalError('上传超时，请检查网络');
      }
      if (err instanceof WebDAVFatalError) {
        throw err;
      }
      if (attempt < maxRetries) {
        await delay(1000 * Math.pow(2, attempt));
        continue;
      }
      throw new Error(
        `上传同步数据失败: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/** 检测远程文件是否可访问（用于验证配置） */
export async function checkRemoteAccess(config: {
  url: string;
  username: string;
  password: string;
}): Promise<boolean> {
  try {
    const dirUrl = await ensureSyncDir(config);
    const remoteUrl = fileUrl(dirUrl);
    const res = await platformFetch(remoteUrl, {
      method: 'GET',
      headers: {
        Authorization: authHeader(config.username, config.password),
      },
    });
    return res.status === 200 || res.status === 404;
  } catch {
    return false;
  }
}