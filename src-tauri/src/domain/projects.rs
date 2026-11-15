use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Vollständiges, speicherbares Web-Projekt (alle 3 Module + Abhak-Fortschritt).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HeddleProject {
    pub id: String,
    pub name: String,
    pub updated_at: String,
    pub loom_mode: String,
    pub active_profile_id: Option<String>,
    pub calculator_input: serde_json::Value,
    pub draft: serde_json::Value,
    #[serde(default)]
    pub checked_steps: Vec<usize>,
}

/// Kurzübersicht für die Projekt-Auswahlliste.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub updated_at: String,
    pub loom_mode: String,
}

fn projects_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("projects")
}

fn sanitize_id(id: &str) -> String {
    id.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect()
}

fn project_file_path(app_data_dir: &Path, id: &str) -> Result<PathBuf, String> {
    let clean = sanitize_id(id);
    if clean.is_empty() {
        return Err("Ungültige Projekt-ID.".to_string());
    }
    Ok(projects_dir(app_data_dir).join(format!("{clean}.heddle")))
}

pub fn save_project(app_data_dir: &Path, project: HeddleProject) -> Result<ProjectSummary, String> {
    if project.name.trim().is_empty() {
        return Err("Der Projektname darf nicht leer sein.".to_string());
    }
    let dir = projects_dir(app_data_dir);
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Projekt-Ordner konnte nicht erstellt werden: {e}"))?;

    let path = project_file_path(app_data_dir, &project.id)?;
    let json = serde_json::to_string_pretty(&project)
        .map_err(|e| format!("Projekt konnte nicht serialisiert werden: {e}"))?;
    fs::write(path, json).map_err(|e| format!("Projekt konnte nicht gespeichert werden: {e}"))?;

    Ok(ProjectSummary {
        id: project.id,
        name: project.name,
        updated_at: project.updated_at,
        loom_mode: project.loom_mode,
    })
}

pub fn list_projects(app_data_dir: &Path) -> Result<Vec<ProjectSummary>, String> {
    let dir = projects_dir(app_data_dir);
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut summaries = Vec::new();
    let entries = fs::read_dir(&dir)
        .map_err(|e| format!("Projekt-Ordner konnte nicht gelesen werden: {e}"))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("heddle") {
            continue;
        }
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(proj) = serde_json::from_str::<HeddleProject>(&content) {
                summaries.push(ProjectSummary {
                    id: proj.id,
                    name: proj.name,
                    updated_at: proj.updated_at,
                    loom_mode: proj.loom_mode,
                });
            }
        }
    }

    summaries.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(summaries)
}

pub fn load_project(app_data_dir: &Path, id: &str) -> Result<HeddleProject, String> {
    let path = project_file_path(app_data_dir, id)?;
    let content =
        fs::read_to_string(&path).map_err(|e| format!("Projekt nicht gefunden: {e}"))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Projektdatei ist beschädigt: {e}"))
}

pub fn delete_project(app_data_dir: &Path, id: &str) -> Result<(), String> {
    let path = project_file_path(app_data_dir, id)?;
    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("Projekt konnte nicht gelöscht werden: {e}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("heddle_proj_test_{nanos}"))
    }

    #[test]
    fn test_project_save_list_load_delete() {
        let dir = temp_dir();
        let proj = HeddleProject {
            id: "proj-1".to_string(),
            name: "Herbstschal".to_string(),
            updated_at: "2026-11-15T19:55:00Z".to_string(),
            loom_mode: "RigidHeddle".to_string(),
            active_profile_id: Some("ashford-rh-60".to_string()),
            calculator_input: serde_json::json!({ "finishedWidthCm": 45 }),
            draft: serde_json::json!({ "warpColors": ["#FFFFFF", "#000000"] }),
            checked_steps: vec![0, 1],
        };

        save_project(&dir, proj.clone()).expect("save should succeed");
        let list = list_projects(&dir).expect("list should succeed");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "Herbstschal");

        let loaded = load_project(&dir, "proj-1").expect("load should succeed");
        assert_eq!(loaded, proj);

        delete_project(&dir, "proj-1").expect("delete should succeed");
        let after_delete = list_projects(&dir).expect("list should succeed");
        assert!(after_delete.is_empty());

        let _ = fs::remove_dir_all(&dir);
    }
}
