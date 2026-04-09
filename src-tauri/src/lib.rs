use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            // Allow printing via keyboard shortcut (Ctrl+P)
            window.on_window_event(|_event| {});
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Fateen POS");
}
