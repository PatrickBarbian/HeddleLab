use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::domain::draft::LoomType;

/// Gespeichertes Webstuhl- oder Webrahmen-Profil mit Standardwerten.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LoomProfile {
    pub id: String,
    pub name: String,
    pub loom_type: LoomType,
    pub max_width_cm: f64,
    pub default_ends_per_cm: f64,
    pub default_loom_waste_cm: f64,
    pub default_take_up_percent: f64,
    pub default_shrinkage_percent: f64,
    /// Anzahl verfügbarer Litzen (Ösen) pro Schaft (bei Gatterkamm leer).
    #[serde(default)]
    pub heddles_per_shaft: Vec<usize>,
}

pub fn default_profiles() -> Vec<LoomProfile> {
    vec![
        LoomProfile {
            id: "ashford-rh-60".to_string(),
            name: "Ashford Rigid Heddle 60 cm (40/10)".to_string(),
            loom_type: LoomType::RigidHeddle,
            max_width_cm: 60.0,
            default_ends_per_cm: 4.0,
            default_loom_waste_cm: 50.0,
            default_take_up_percent: 10.0,
            default_shrinkage_percent: 10.0,
            heddles_per_shaft: vec![],
        },
        LoomProfile {
            id: "ashford-sampleit-40".to_string(),
            name: "Ashford SampleIt 40 cm (30/10)".to_string(),
            loom_type: LoomType::RigidHeddle,
            max_width_cm: 40.0,
            default_ends_per_cm: 3.0,
            default_loom_waste_cm: 45.0,
            default_take_up_percent: 10.0,
            default_shrinkage_percent: 10.0,
            heddles_per_shaft: vec![],
        },
        LoomProfile {
            id: "ashford-table-4s-60".to_string(),
            name: "Ashford Tischwebstuhl 60 cm (4 Schäfte)".to_string(),
            loom_type: LoomType::ShaftLoom {
                shafts: 4,
                treadles: 4,
            },
            max_width_cm: 60.0,
            default_ends_per_cm: 6.0,
            default_loom_waste_cm: 60.0,
            default_take_up_percent: 10.0,
            default_shrinkage_percent: 10.0,
            heddles_per_shaft: vec![100, 100, 100, 100],
        },
    ]
}

pub fn profiles_file_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("loom_profiles.json")
}

pub fn load_profiles(app_data_dir: &Path) -> Result<Vec<LoomProfile>, String> {
    let path = profiles_file_path(app_data_dir);
    if !path.exists() {
        let defaults = default_profiles();
        save_all_profiles(app_data_dir, &defaults)?;
        return Ok(defaults);
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Profile konnten nicht gelesen werden: {e}"))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Ungültiges Profil-Dateiformat: {e}"))
}

pub fn upsert_profile(app_data_dir: &Path, profile: LoomProfile) -> Result<Vec<LoomProfile>, String> {
    if profile.name.trim().is_empty() {
        return Err("Der Profilname darf nicht leer sein.".to_string());
    }

    let mut profiles = load_profiles(app_data_dir)?;
    if let Some(existing) = profiles.iter_mut().find(|p| p.id == profile.id) {
        *existing = profile;
    } else {
        profiles.push(profile);
    }

    save_all_profiles(app_data_dir, &profiles)?;
    Ok(profiles)
}

pub fn delete_profile(app_data_dir: &Path, id: &str) -> Result<Vec<LoomProfile>, String> {
    let mut profiles = load_profiles(app_data_dir)?;
    profiles.retain(|p| p.id != id);
    save_all_profiles(app_data_dir, &profiles)?;
    Ok(profiles)
}

fn save_all_profiles(app_data_dir: &Path, profiles: &[LoomProfile]) -> Result<(), String> {
    fs::create_dir_all(app_data_dir)
        .map_err(|e| format!("Profil-Verzeichnis konnte nicht erstellt werden: {e}"))?;
    let json = serde_json::to_string_pretty(profiles)
        .map_err(|e| format!("Profile konnten nicht serialisiert werden: {e}"))?;
    fs::write(profiles_file_path(app_data_dir), json)
        .map_err(|e| format!("Profile konnten nicht gespeichert werden: {e}"))
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
        std::env::temp_dir().join(format!("weben_test_{nanos}"))
    }

    #[test]
    fn test_profile_crud_roundtrip() {
        let dir = temp_dir();
        let initial = load_profiles(&dir).expect("defaults should load");
        assert_eq!(initial.len(), 3);

        let custom = LoomProfile {
            id: "custom-1".to_string(),
            name: "Mein 80er Rahmen".to_string(),
            loom_type: LoomType::RigidHeddle,
            max_width_cm: 80.0,
            default_ends_per_cm: 5.0,
            default_loom_waste_cm: 55.0,
            default_take_up_percent: 8.0,
            default_shrinkage_percent: 12.0,
            heddles_per_shaft: vec![],
        };

        let after_add = upsert_profile(&dir, custom.clone()).expect("upsert should succeed");
        assert_eq!(after_add.len(), 4);
        assert!(after_add.contains(&custom));

        let after_delete = delete_profile(&dir, "custom-1").expect("delete should succeed");
        assert_eq!(after_delete.len(), 3);

        let _ = fs::remove_dir_all(&dir);
    }
}
