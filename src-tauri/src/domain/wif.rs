use std::collections::HashMap;

use crate::domain::draft::{ColorHex, LoomType, WeavingDraft};

/// Exportiert eine `WeavingDraft` im branchenüblichen WIF-1.1-Format
/// (kompatibel mit Fiberworks PCW, WeavePoint, DB-WEAVE, iWeaveIt und Handweaving.net).
pub fn export_wif(draft: &WeavingDraft) -> String {
    let (shafts, treadles) = match draft.loom_type {
        LoomType::RigidHeddle => (2usize, 2usize),
        LoomType::ShaftLoom { shafts, treadles } => (shafts.max(2), treadles.max(2)),
    };

    // Einzigartige Farben sammeln -> 1-basierte Farbnummern für [COLOR TABLE]
    let mut palette: Vec<String> = Vec::new();
    let mut color_index_map: HashMap<String, usize> = HashMap::new();
    for hex in draft.warp_colors.iter().chain(draft.weft_colors.iter()) {
        let norm = normalize_hex(hex);
        if !color_index_map.contains_key(&norm) {
            let idx = palette.len() + 1;
            palette.push(norm.clone());
            color_index_map.insert(norm, idx);
        }
    }
    if palette.is_empty() {
        palette.push("#FFFFFF".to_string());
        color_index_map.insert("#FFFFFF".to_string(), 1);
    }

    let mut out = String::new();
    out.push_str("[WIF]\nVersion=1.1\nDate=April 20, 1997\nDevelopers=HeddleLab\nSource Program=HeddleLab\n\n");

    out.push_str("[CONTENTS]\n");
    out.push_str("COLOR PALETTE=yes\n");
    out.push_str("WEAVING=yes\n");
    out.push_str("WARP=yes\n");
    out.push_str("WEFT=yes\n");
    out.push_str("COLOR TABLE=yes\n");
    out.push_str("THREADING=yes\n");
    out.push_str("TIEUP=yes\n");
    out.push_str("TREADLING=yes\n");
    out.push_str("WARP COLORS=yes\n");
    out.push_str("WEFT COLORS=yes\n\n");

    out.push_str(&format!(
        "[COLOR PALETTE]\nEntries={}\nForm=RGB\nRange=0,255\n\n",
        palette.len()
    ));

    out.push_str(&format!(
        "[WEAVING]\nShafts={shafts}\nTreadles={treadles}\nRising Shed=yes\n\n"
    ));

    let default_warp_color = draft
        .warp_colors
        .first()
        .and_then(|c| color_index_map.get(&normalize_hex(c)).copied())
        .unwrap_or(1);
    let default_weft_color = draft
        .weft_colors
        .first()
        .and_then(|c| color_index_map.get(&normalize_hex(c)).copied())
        .unwrap_or(1);

    out.push_str(&format!(
        "[WARP]\nThreads={}\nUnits=centimeters\nColor={default_warp_color}\n\n",
        draft.warp_colors.len()
    ));

    out.push_str(&format!(
        "[WEFT]\nThreads={}\nUnits=centimeters\nColor={default_weft_color}\n\n",
        draft.weft_colors.len()
    ));

    out.push_str("[COLOR TABLE]\n");
    for (i, hex) in palette.iter().enumerate() {
        let (r, g, b) = hex_to_rgb(hex);
        out.push_str(&format!("{}={r},{g},{b}\n", i + 1));
    }
    out.push('\n');

    out.push_str("[THREADING]\n");
    for (i, shaft) in draft.threading.iter().enumerate() {
        let s = (*shaft).min(shafts.saturating_sub(1)) + 1;
        out.push_str(&format!("{}={s}\n", i + 1));
    }
    out.push('\n');

    out.push_str("[TIEUP]\n");
    for (t_idx, row) in draft.tie_up.iter().take(treadles).enumerate() {
        let lifted: Vec<String> = row
            .iter()
            .take(shafts)
            .enumerate()
            .filter_map(|(s_idx, &active)| {
                if active {
                    Some((s_idx + 1).to_string())
                } else {
                    None
                }
            })
            .collect();
        out.push_str(&format!("{}={}\n", t_idx + 1, lifted.join(",")));
    }
    out.push('\n');

    out.push_str("[TREADLING]\n");
    for (i, treadle) in draft.treadling.iter().enumerate() {
        let t = (*treadle).min(treadles.saturating_sub(1)) + 1;
        out.push_str(&format!("{}={t}\n", i + 1));
    }
    out.push('\n');

    out.push_str("[WARP COLORS]\n");
    for (i, hex) in draft.warp_colors.iter().enumerate() {
        let c_idx = color_index_map
            .get(&normalize_hex(hex))
            .copied()
            .unwrap_or(1);
        out.push_str(&format!("{}={c_idx}\n", i + 1));
    }
    out.push('\n');

    out.push_str("[WEFT COLORS]\n");
    for (i, hex) in draft.weft_colors.iter().enumerate() {
        let c_idx = color_index_map
            .get(&normalize_hex(hex))
            .copied()
            .unwrap_or(1);
        out.push_str(&format!("{}={c_idx}\n", i + 1));
    }

    out
}

/// Importiert eine WIF-Datei (Weaving Information File) und wandelt sie in eine `WeavingDraft` um.
pub fn import_wif(content: &str) -> Result<WeavingDraft, String> {
    let sections = parse_ini_sections(content);
    if sections.is_empty() {
        return Err("Die Datei enthält keine gültigen WIF-Abschnitte.".to_string());
    }

    // Farbbereich ermitteln (z. B. 0,255 oder 0,999 bei Fiberworks/WeavePoint)
    let (range_min, range_max) = sections
        .get("COLOR PALETTE")
        .and_then(|s| s.get("RANGE"))
        .and_then(|v| parse_range(v))
        .unwrap_or((0.0, 255.0));

    let mut color_table: HashMap<usize, ColorHex> = HashMap::new();
    if let Some(table) = sections.get("COLOR TABLE") {
        for (k, v) in table {
            if let Ok(idx) = k.parse::<usize>() {
                if let Some(hex) = parse_rgb_to_hex(v, range_min, range_max) {
                    color_table.insert(idx, hex);
                }
            }
        }
    }

    let weaving_sec = sections.get("WEAVING");
    let mut shafts = weaving_sec
        .and_then(|s| s.get("SHAFTS"))
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(4);
    let mut treadles = weaving_sec
        .and_then(|s| s.get("TREADLES"))
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(4);

    let threading_sec = sections.get("THREADING");
    let treadling_sec = sections.get("TREADLING");
    let tieup_sec = sections.get("TIEUP");

    // Schäfte / Tritte ggf. anhand realer Einträge nach oben korrigieren
    if let Some(sec) = threading_sec {
        for v in sec.values() {
            for part in v.split(',') {
                if let Ok(s) = part.trim().parse::<usize>() {
                    shafts = shafts.max(s);
                }
            }
        }
    }
    if let Some(sec) = treadling_sec {
        for v in sec.values() {
            for part in v.split(',') {
                if let Ok(t) = part.trim().parse::<usize>() {
                    treadles = treadles.max(t);
                }
            }
        }
    }
    shafts = shafts.clamp(2, 16);
    treadles = treadles.clamp(2, 16);

    let warp_sec = sections.get("WARP");
    let weft_sec = sections.get("WEFT");

    let max_threading_key = threading_sec
        .map(|s| s.keys().filter_map(|k| k.parse::<usize>().ok()).max().unwrap_or(0))
        .unwrap_or(0);
    let max_treadling_key = treadling_sec
        .map(|s| s.keys().filter_map(|k| k.parse::<usize>().ok()).max().unwrap_or(0))
        .unwrap_or(0);

    let warp_count = warp_sec
        .and_then(|s| s.get("THREADS"))
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(max_threading_key)
        .max(max_threading_key)
        .clamp(1, 2000);
    let weft_count = weft_sec
        .and_then(|s| s.get("THREADS"))
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(max_treadling_key)
        .max(max_treadling_key)
        .max(1)
        .clamp(1, 2000);

    if max_threading_key == 0 && warp_sec.is_none() {
        return Err("WIF-Datei enthält weder [WARP] noch [THREADING].".to_string());
    }

    let default_warp_hex = warp_sec
        .and_then(|s| s.get("COLOR"))
        .and_then(|v| v.parse::<usize>().ok())
        .and_then(|idx| color_table.get(&idx).cloned())
        .unwrap_or_else(|| "#D97706".to_string());
    let default_weft_hex = weft_sec
        .and_then(|s| s.get("COLOR"))
        .and_then(|v| v.parse::<usize>().ok())
        .and_then(|idx| color_table.get(&idx).cloned())
        .unwrap_or_else(|| "#F3E8D2".to_string());

    let warp_colors_sec = sections.get("WARP COLORS");
    let mut warp_colors = vec![default_warp_hex.clone(); warp_count];
    if let Some(sec) = warp_colors_sec {
        for (i, slot) in warp_colors.iter_mut().enumerate() {
            let key = (i + 1).to_string();
            if let Some(c_idx) = sec.get(&key).and_then(|v| v.parse::<usize>().ok()) {
                if let Some(hex) = color_table.get(&c_idx) {
                    *slot = hex.clone();
                }
            }
        }
    }

    let weft_colors_sec = sections.get("WEFT COLORS");
    let mut weft_colors = vec![default_weft_hex.clone(); weft_count];
    if let Some(sec) = weft_colors_sec {
        for (i, slot) in weft_colors.iter_mut().enumerate() {
            let key = (i + 1).to_string();
            if let Some(c_idx) = sec.get(&key).and_then(|v| v.parse::<usize>().ok()) {
                if let Some(hex) = color_table.get(&c_idx) {
                    *slot = hex.clone();
                }
            }
        }
    }

    let mut threading = Vec::with_capacity(warp_count);
    for i in 0..warp_count {
        let key = (i + 1).to_string();
        let val = threading_sec
            .and_then(|s| s.get(&key))
            .and_then(|v| v.split(',').next())
            .and_then(|v| v.trim().parse::<usize>().ok())
            .filter(|&s| s >= 1)
            .map(|s| (s - 1).min(shafts - 1))
            .unwrap_or(i % shafts);
        threading.push(val);
    }

    let mut tie_up = vec![vec![false; shafts]; treadles];
    if let Some(sec) = tieup_sec {
        for t in 0..treadles {
            let key = (t + 1).to_string();
            if let Some(val) = sec.get(&key) {
                for part in val.split(',') {
                    if let Ok(s) = part.trim().parse::<usize>() {
                        if s >= 1 && s <= shafts {
                            tie_up[t][s - 1] = true;
                        }
                    }
                }
            }
        }
    } else {
        for t in 0..treadles {
            tie_up[t][t % shafts] = true;
        }
    }

    let mut treadling = Vec::with_capacity(weft_count);
    for i in 0..weft_count {
        let key = (i + 1).to_string();
        let val = treadling_sec
            .and_then(|s| s.get(&key))
            .and_then(|v| v.split(',').next())
            .and_then(|v| v.trim().parse::<usize>().ok())
            .filter(|&t| t >= 1)
            .map(|t| (t - 1).min(treadles - 1))
            .unwrap_or(i % treadles);
        treadling.push(val);
    }

    Ok(WeavingDraft {
        loom_type: LoomType::ShaftLoom { shafts, treadles },
        warp_colors,
        weft_colors,
        threading,
        tie_up,
        treadling,
    })
}

fn parse_ini_sections(content: &str) -> HashMap<String, HashMap<String, String>> {
    let mut sections: HashMap<String, HashMap<String, String>> = HashMap::new();
    let mut current_section = String::new();

    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with(';') || line.starts_with('#') {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') && line.len() > 2 {
            current_section = line[1..line.len() - 1].trim().to_ascii_uppercase();
            sections.entry(current_section.clone()).or_default();
            continue;
        }
        if !current_section.is_empty() {
            if let Some((k, v)) = line.split_once('=') {
                let key = k.trim().to_ascii_uppercase();
                let val = v.trim().to_string();
                sections
                    .entry(current_section.clone())
                    .or_default()
                    .insert(key, val);
            }
        }
    }
    sections
}

fn normalize_hex(hex: &str) -> String {
    let trimmed = hex.trim();
    if trimmed.starts_with('#') && trimmed.len() == 7 {
        trimmed.to_ascii_uppercase()
    } else if trimmed.len() == 6 && trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
        format!("#{}", trimmed.to_ascii_uppercase())
    } else {
        "#D97706".to_string()
    }
}

fn hex_to_rgb(hex: &str) -> (u8, u8, u8) {
    let norm = normalize_hex(hex);
    let r = u8::from_str_radix(&norm[1..3], 16).unwrap_or(217);
    let g = u8::from_str_radix(&norm[3..5], 16).unwrap_or(119);
    let b = u8::from_str_radix(&norm[5..7], 16).unwrap_or(6);
    (r, g, b)
}

fn parse_range(raw: &str) -> Option<(f64, f64)> {
    let mut parts = raw.split(',').map(|p| p.trim().parse::<f64>().ok());
    let min = parts.next()??;
    let max = parts.next()??;
    if max > min {
        Some((min, max))
    } else {
        None
    }
}

fn parse_rgb_to_hex(raw: &str, min: f64, max: f64) -> Option<String> {
    let parts: Vec<f64> = raw
        .split(',')
        .filter_map(|p| p.trim().parse::<f64>().ok())
        .collect();
    if parts.len() < 3 {
        return None;
    }
    let scale = |v: f64| -> u8 {
        let clamped = ((v - min) / (max - min)).clamp(0.0, 1.0);
        (clamped * 255.0).round() as u8
    };
    Some(format!(
        "#{:02X}{:02X}{:02X}",
        scale(parts[0]),
        scale(parts[1]),
        scale(parts[2])
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wif_export_and_import_roundtrip() {
        let draft = WeavingDraft {
            loom_type: LoomType::ShaftLoom {
                shafts: 4,
                treadles: 4,
            },
            warp_colors: vec![
                "#112233".to_string(),
                "#AABBCC".to_string(),
                "#112233".to_string(),
                "#AABBCC".to_string(),
            ],
            weft_colors: vec![
                "#FFFFFF".to_string(),
                "#FFFFFF".to_string(),
                "#112233".to_string(),
                "#FFFFFF".to_string(),
            ],
            threading: vec![0, 1, 2, 3],
            tie_up: vec![
                vec![true, true, false, false],
                vec![false, true, true, false],
                vec![false, false, true, true],
                vec![true, false, false, true],
            ],
            treadling: vec![0, 1, 2, 3],
        };

        let wif = export_wif(&draft);
        assert!(wif.contains("[WIF]"));
        assert!(wif.contains("Shafts=4"));
        assert!(wif.contains("1=1,2"));

        let imported = import_wif(&wif).expect("WIF import must succeed");
        assert_eq!(
            imported.loom_type,
            LoomType::ShaftLoom {
                shafts: 4,
                treadles: 4
            }
        );
        assert_eq!(imported.threading, draft.threading);
        assert_eq!(imported.treadling, draft.treadling);
        assert_eq!(imported.tie_up, draft.tie_up);
        assert_eq!(imported.warp_colors, draft.warp_colors);
        assert_eq!(imported.weft_colors, draft.weft_colors);
    }

    #[test]
    fn test_wif_import_scales_0_999_palette() {
        let wif = "\
[WIF]
Version=1.1

[COLOR PALETTE]
Entries=2
Range=0,999

[COLOR TABLE]
1=999,0,0
2=0,999,999

[WEAVING]
Shafts=4
Treadles=4

[WARP]
Threads=4
Color=1

[WEFT]
Threads=2
Color=2

[THREADING]
1=1
2=2
3=3
4=4

[TIEUP]
1=1,3
2=2,4

[TREADLING]
1=1
2=2
";
        let imported = import_wif(wif).expect("0..999 range WIF must import");
        assert_eq!(imported.warp_colors, vec!["#FF0000"; 4]);
        assert_eq!(imported.weft_colors, vec!["#00FFFF"; 2]);
        assert_eq!(imported.tie_up[0], vec![true, false, true, false]);
    }
}
