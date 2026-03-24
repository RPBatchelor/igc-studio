mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::fs::read_directory,
            commands::fs::read_file_text,
            commands::fs::write_file_text,
            commands::fs::get_data_dir,
            commands::fs::scan_flights,
            commands::fs::fetch_url_text,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
