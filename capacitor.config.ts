import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.desktop.dashboard',
  appName: '效率助手',
  webDir: 'dist',
  android: {
    // 允许 WebView 内 fetch 跨域请求（WebDAV/AI API）
    allowMixedContent: true,
  },
};

export default config;
