use tauri::{AppHandle, Manager};

use crate::domain::calculator::{self, WarpWeftInput, WarpWeftOutput};
use crate::domain::draft::{ThreadingPlanStep, WeavingDraft};
use crate::domain::profiles::{self, LoomProfile};
use crate::domain::projects::{self, HeddleProject, ProjectSummary};

#[tauri::command]
pub fn calculate_warp_weft(input: WarpWeftInput) -> Result<WarpWeftOutput, String> {
    calculator::calculate_warp_weft(&input)
}

#[tauri::command]
pub fn create_rigid_heddle_draft(
    warp_count: usize,
    weft_count: usize,
    default_warp_color: String,
    default_weft_color: String,
) -> WeavingDraft {
    WeavingDraft::new_rigid_heddle(warp_count, weft_count, default_warp_color, default_weft_color)
}

#[tauri::command]
pub fn generate_threading_plan(draft: WeavingDraft) -> Vec<ThreadingPlanStep> {
    draft.generate_threading_plan()
}

#[tauri::command]
pub fn list_loom_profiles(app: AppHandle) -> Result<Vec<LoomProfile>, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("App-Datenverzeichnis nicht gefunden: {e}"))?;
    profiles::load_profiles(&dir)
}

#[tauri::command]
pub fn save_loom_profile(app: AppHandle, profile: LoomProfile) -> Result<Vec<LoomProfile>, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("App-Datenverzeichnis nicht gefunden: {e}"))?;
    profiles::upsert_profile(&dir, profile)
}

#[tauri::command]
pub fn delete_loom_profile(app: AppHandle, id: String) -> Result<Vec<LoomProfile>, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("App-Datenverzeichnis nicht gefunden: {e}"))?;
    profiles::delete_profile(&dir, &id)
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("Nur HTTP/HTTPS-Links sind erlaubt.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| format!("Link konnte nicht geöffnet werden: {e}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Link konnte nicht geöffnet werden: {e}"))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Link konnte nicht geöffnet werden: {e}"))?;
    }

    Ok(())
}

#[tauri::command]
pub fn list_projects(app: AppHandle) -> Result<Vec<ProjectSummary>, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("App-Datenverzeichnis nicht gefunden: {e}"))?;
    projects::list_projects(&dir)
}

#[tauri::command]
pub fn save_project(app: AppHandle, project: HeddleProject) -> Result<ProjectSummary, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("App-Datenverzeichnis nicht gefunden: {e}"))?;
    projects::save_project(&dir, project)
}

#[tauri::command]
pub fn load_project(app: AppHandle, id: String) -> Result<HeddleProject, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("App-Datenverzeichnis nicht gefunden: {e}"))?;
    projects::load_project(&dir, &id)
}

#[tauri::command]
pub fn delete_project(app: AppHandle, id: String) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("App-Datenverzeichnis nicht gefunden: {e}"))?;
    projects::delete_project(&dir, &id)
}
