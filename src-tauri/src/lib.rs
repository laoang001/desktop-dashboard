use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState},
    Manager,
};

/// 常驻桌面模式状态（atomic 全局状态，避免 is_skip_taskbar 权限问题）
static DESKTOP_MODE: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "windows")]
mod winapi {
    type HWND = isize;
    type BOOL = i32;

    const HWND_BOTTOM: HWND = 1;
    const SWP_NOSIZE: u32 = 0x0001;
    const SWP_NOMOVE: u32 = 0x0002;
    const SWP_NOACTIVATE: u32 = 0x0010;

    #[link(name = "user32")]
    extern "system" {
        fn SetWindowPos(
            hwnd: HWND,
            hwndinsertafter: HWND,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            flags: u32,
        ) -> BOOL;
    }

    /// 将窗口置底（模拟桌面挂件常驻效果）
    pub unsafe fn send_to_bottom(hwnd: isize) {
        SetWindowPos(
            hwnd,
            HWND_BOTTOM,
            0, 0, 0, 0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
    }
}

/// 切换窗口置顶
#[tauri::command]
async fn toggle_always_on_top(window: tauri::WebviewWindow) -> Result<bool, String> {
    let cur = window.is_always_on_top().map_err(|e| e.to_string())?;
    let next = !cur;
    window.set_always_on_top(next).map_err(|e| e.to_string())?;
    Ok(next)
}

/// 将窗口置底
#[tauri::command]
async fn send_to_bottom(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(hwnd) = window.hwnd() {
            let hwnd_raw = hwnd.0 as isize;
            unsafe {
                winapi::send_to_bottom(hwnd_raw);
            }
        }
    }
    Ok(())
}

/// 切换常驻桌面模式（跳过任务栏 + 置底）
#[tauri::command]
async fn toggle_desktop_mode(window: tauri::WebviewWindow) -> Result<bool, String> {
    let next = !DESKTOP_MODE.load(Ordering::Relaxed);
    window.set_skip_taskbar(next).map_err(|e| e.to_string())?;
    if next {
        // 进入常驻模式：取消置顶，置底
        window.set_always_on_top(false).ok();
        // 发送到桌面层
        #[cfg(target_os = "windows")]
        {
            if let Ok(hwnd) = window.hwnd() {
                let hwnd_raw = hwnd.0 as isize;
                unsafe {
                    winapi::send_to_bottom(hwnd_raw);
                }
            }
        }
    }
    DESKTOP_MODE.store(next, Ordering::Relaxed);
    Ok(next)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:dashboard.db",
                    vec![],  // 前端主动建表，不使用迁移
                )
                .build(),
        )
        .invoke_handler(tauri::generate_handler![toggle_always_on_top, toggle_desktop_mode, send_to_bottom])
        .setup(|app| {
            // 系统托盘
            let show_i = MenuItem::with_id(app, "show", "显示挂件", true, None::<&str>)?;
            let hide_i = MenuItem::with_id(app, "hide", "隐藏挂件", true, None::<&str>)?;
            let pin_i = MenuItem::with_id(app, "pin", "切换置顶", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &hide_i, &pin_i, &sep, &quit_i])?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().cloned().unwrap_or_else(|| {
                    tauri::image::Image::new(&[0u8; 4], 1, 1)
                }))
                .tooltip("桌面效率助手")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "hide" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.hide();
                            }
                        }
                        "pin" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let cur = w.is_always_on_top().unwrap_or(false);
                                let _ = w.set_always_on_top(!cur);
                            }
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
