use serde::{Deserialize, Serialize};

/// Eingabeparameter für den Kett- und Schuss-Rechner (Modul 1).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WarpWeftInput {
    /// Gewünschte Fertigbreite des gewaschenen Stoffes in cm.
    pub finished_width_cm: f64,
    /// Gewünschte Fertiglänge des gewaschenen Stoffes in cm.
    pub finished_length_cm: f64,
    /// Kettfäden pro cm (Kammdichte / EPI in cm).
    pub ends_per_cm: f64,
    /// Optionale Schussfäden pro cm (PPI in cm). Falls None, wird ends_per_cm (ausgewogene Leinwandbindung) genutzt.
    pub picks_per_cm: Option<f64>,
    /// Einsprung (Take-up) beim Weben in Prozent (0..100).
    pub take_up_percent: f64,
    /// Schrumpfung beim Waschen in Prozent (0..100).
    pub shrinkage_percent: f64,
    /// Anbindeverlust / Webverlust (Loom Waste) in cm.
    pub loom_waste_cm: f64,
}

/// Berechnete Ergebnisse für Kett- und Schussgarnbedarf.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WarpWeftOutput {
    /// Webbreite auf dem Webstuhl (vor Schrumpfung) in cm.
    pub weaving_width_cm: f64,
    /// Gewebte Stofflänge auf dem Webstuhl (vor Schrumpfung) in cm.
    pub woven_length_cm: f64,
    /// Gesamtzahl der benötigten Kettfäden.
    pub total_warp_ends: usize,
    /// Gesamtzahl der benötigten Schussfäden.
    pub total_weft_picks: usize,
    /// Benötigte Länge pro einzelner Kettfaden (inkl. Schrumpfung, Einsprung und Webverlust) in cm.
    pub length_per_warp_end_cm: f64,
    /// Gesamtlänge des benötigten Kettgarns in Metern.
    pub total_warp_length_m: f64,
    /// Gesamtlänge des benötigten Schussgarns in Metern.
    pub total_weft_length_m: f64,
}

/// Berechnet alle Kett- und Schusswerte aus den Projektparametern.
pub fn calculate_warp_weft(input: &WarpWeftInput) -> Result<WarpWeftOutput, String> {
    validate_input(input)?;

    let shrinkage_factor = 1.0 - (input.shrinkage_percent / 100.0);
    let take_up_factor = 1.0 - (input.take_up_percent / 100.0);

    // Benötigte Webbreite & Weblänge vor dem Waschen (Schrumpfung kompensieren)
    let weaving_width_cm = input.finished_width_cm / shrinkage_factor;
    let woven_length_cm = input.finished_length_cm / shrinkage_factor;

    // Gesamtzahl Kettfäden = Webbreite * Kammdichte (auf ganze Fäden gerundet)
    let total_warp_ends = (weaving_width_cm * input.ends_per_cm).round().max(1.0) as usize;

    // Länge pro Kettfaden = (Weblänge / (1 - Einsprung)) + Anbindeverlust
    let warp_length_with_take_up_cm = woven_length_cm / take_up_factor;
    let length_per_warp_end_cm = warp_length_with_take_up_cm + input.loom_waste_cm;

    // Gesamtlänge Kettgarn in Metern
    let total_warp_length_m = (total_warp_ends as f64 * length_per_warp_end_cm) / 100.0;

    // Schussberechnung
    let effective_picks_per_cm = input.picks_per_cm.unwrap_or(input.ends_per_cm);
    let total_weft_picks = (woven_length_cm * effective_picks_per_cm).round().max(1.0) as usize;
    let length_per_weft_pick_cm = weaving_width_cm / take_up_factor;
    let total_weft_length_m = (total_weft_picks as f64 * length_per_weft_pick_cm) / 100.0;

    Ok(WarpWeftOutput {
        weaving_width_cm: round_to_2(weaving_width_cm),
        woven_length_cm: round_to_2(woven_length_cm),
        total_warp_ends,
        total_weft_picks,
        length_per_warp_end_cm: round_to_2(length_per_warp_end_cm),
        total_warp_length_m: round_to_2(total_warp_length_m),
        total_weft_length_m: round_to_2(total_weft_length_m),
    })
}

fn validate_input(input: &WarpWeftInput) -> Result<(), String> {
    if !input.finished_width_cm.is_finite() || input.finished_width_cm <= 0.0 {
        return Err("Die Fertigbreite muss größer als 0 cm sein.".to_string());
    }
    if !input.finished_length_cm.is_finite() || input.finished_length_cm <= 0.0 {
        return Err("Die Fertiglänge muss größer als 0 cm sein.".to_string());
    }
    if !input.ends_per_cm.is_finite() || input.ends_per_cm <= 0.0 {
        return Err("Die Kammdichte (Fäden pro cm) muss größer als 0 sein.".to_string());
    }
    if let Some(picks) = input.picks_per_cm {
        if !picks.is_finite() || picks <= 0.0 {
            return Err("Die Schussdichte (Schüsse pro cm) muss größer als 0 sein.".to_string());
        }
    }
    if !input.take_up_percent.is_finite() || input.take_up_percent < 0.0 || input.take_up_percent >= 90.0 {
        return Err("Der Einsprung muss zwischen 0% und 89,9% liegen.".to_string());
    }
    if !input.shrinkage_percent.is_finite() || input.shrinkage_percent < 0.0 || input.shrinkage_percent >= 90.0 {
        return Err("Die Schrumpfung muss zwischen 0% und 89,9% liegen.".to_string());
    }
    if !input.loom_waste_cm.is_finite() || input.loom_waste_cm < 0.0 {
        return Err("Der Anbindeverlust darf nicht negativ sein.".to_string());
    }
    Ok(())
}

fn round_to_2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_balanced_plain_weave_calculation() {
        let input = WarpWeftInput {
            finished_width_cm: 45.0,
            finished_length_cm: 180.0,
            ends_per_cm: 4.0,
            picks_per_cm: None,
            take_up_percent: 10.0,
            shrinkage_percent: 10.0,
            loom_waste_cm: 50.0,
        };

        let result = calculate_warp_weft(&input).expect("valid input should succeed");

        // 45 / 0.9 = 50 cm Webbreite -> 50 * 4 = 200 Kettfäden
        assert_eq!(result.weaving_width_cm, 50.0);
        assert_eq!(result.total_warp_ends, 200);

        // 180 / 0.9 = 200 cm Weblänge
        assert_eq!(result.woven_length_cm, 200.0);

        // 200 / 0.9 + 50 = 272.22 cm pro Kettfaden
        assert_eq!(result.length_per_warp_end_cm, 272.22);

        // 200 * 272.2222 / 100 = 544.44 m Kettgarn
        assert_eq!(result.total_warp_length_m, 544.44);

        // 200 * 4 = 800 Schussfäden, je 50 / 0.9 = 55.5556 cm -> 444.44 m Schussgarn
        assert_eq!(result.total_weft_picks, 800);
        assert_eq!(result.total_weft_length_m, 444.44);
    }

    #[test]
    fn test_invalid_shrinkage_returns_error() {
        let input = WarpWeftInput {
            finished_width_cm: 40.0,
            finished_length_cm: 100.0,
            ends_per_cm: 4.0,
            picks_per_cm: None,
            take_up_percent: 5.0,
            shrinkage_percent: 95.0,
            loom_waste_cm: 40.0,
        };

        assert!(calculate_warp_weft(&input).is_err());
    }
}
