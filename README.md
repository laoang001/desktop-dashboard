# 桌面效率助手

桌面效率助手 — 桌面挂件 × 移动应用，Tauri + Vue3 + SQLite，跨 Windows 桌面端 & Android 移动端。

## ✨ 功能

- **日程** — 日历视图，管理日程事件
- **待办** — 任务列表，支持优先级/分类
- **时间追踪** — 计时器，统计用时
- **记账** — 收支记录，月/周/日统计
- **日记** — 每日记录，按日期归档
- **AI 助手** — 智能对话，短按文字/长按语音
- **天气** — 城市天气，自动获取定位
- **数据同步** — WebDAV（坚果云）云端备份

## 📦 安装

### Windows

直接下载 `desktop-dashboard.exe`（单文件便携版），双击运行即可。

支持：置顶窗口、深色/浅色主题、透明度调节、开机自启、常驻桌面模式。

### Android

下载 `app-debug.apk` 安装到手机。首次打开授予存储权限，所有数据本地 SQLite 存储，支持坚果云 WebDAV 自动同步。

## 🔧 开发构建

```bash
# 安装依赖
npm install

# 桌面端（需要 Vite 开发服务器）
npx tauri dev

# 桌面端（内置前端，双击 exe 直接运行）
npx tauri build --features custom-protocol

# 安卓端
npm run cap:sync
npm run cap:open   # Android Studio 打开
```

## 🏗️ 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + TypeScript + Vite |
| 桌面端 | Tauri 2 (Rust) |
| 移动端 | Capacitor 6 (Android) |
| 数据库 | SQLite (sql.js / Capacitor SQLite) |
| 状态管理 | Pinia |
| 数据同步 | WebDAV (坚果云) |

## 📄 License

MIT
