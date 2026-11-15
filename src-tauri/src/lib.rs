mod commands;
pub mod domain;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::calculate_warp_weft,
            commands::create_rigid_heddle_draft,
            commands::generate_threading_plan,
            commands::list_loom_profiles,
            commands::save_loom_profile,
            commands::delete_loom_profile,
        ])
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten der Tauri-Anwendung");
}
