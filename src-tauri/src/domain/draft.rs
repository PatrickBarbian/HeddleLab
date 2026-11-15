use serde::{Deserialize, Serialize};

/// Hex-Farbcode, z. B. "#D97706".
pub type ColorHex = String;

/// Webstuhltyp zur Steuerung der UI-Komplexität.
/// Im Gatterkamm-Modus bleiben Tie-up und Treadling auf Leinwandbindung fixiert.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LoomType {
    RigidHeddle,
    ShaftLoom { shafts: usize, treadles: usize },
}

/// Ein einzelner Schritt im Einfädel-Plan (Modul 3), z. B. "4x Rot".
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ThreadingPlanStep {
    pub count: usize,
    pub color: ColorHex,
    pub start_thread: usize,
    pub end_thread: usize,
}

/// Zentrale, erweiterbare Webpatrone (Weaving Draft) für Gatterkamm- und Schaftwebstühle.
///
/// Das Gewebebild (Drawdown) wird nicht redundant gespeichert, sondern deterministisch
/// aus `threading`, `tie_up` und `treadling` berechnet.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeavingDraft {
    pub loom_type: LoomType,
    /// X-Achse (oben): Farbe jedes einzelnen Kettfadens.
    pub warp_colors: Vec<ColorHex>,
    /// Y-Achse (rechts): Farbe jedes einzelnen Schussfadens.
    pub weft_colors: Vec<ColorHex>,
    /// Einzug (Threading): Welcher Schaft (0-basiert) für Kettfaden x gehoben wird.
    /// Im Gatterkamm-Modus entspricht 0 = Schlitz, 1 = Loch (abwechselnd 0, 1, 0, 1...).
    pub threading: Vec<usize>,
    /// Schnürung (Tie-up): Matrix [treadle][shaft] -> true, wenn Tritt `t` Schaft `s` hebt.
    /// Im Gatterkamm-Modus hartcodiert auf 2x2-Einheitsmatrix (Leinwandbindung).
    pub tie_up: Vec<Vec<bool>>,
    /// Trittfolge (Treadling): Welcher Tritt (0-basiert) bei Schuss y getreten wird.
    /// Im Gatterkamm-Modus abwechselnd 0, 1, 0, 1...
    pub treadling: Vec<usize>,
}

impl WeavingDraft {
    /// Erzeugt einen neuen Entwurf für einen Gatterkamm-Webrahmen (Leinwandbindung).
    pub fn new_rigid_heddle(
        warp_count: usize,
        weft_count: usize,
        default_warp_color: ColorHex,
        default_weft_color: ColorHex,
    ) -> Self {
        let warp_colors = vec![default_warp_color; warp_count];
        let weft_colors = vec![default_weft_color; weft_count];
        let threading = (0..warp_count).map(|x| x % 2).collect();
        let treadling = (0..weft_count).map(|y| y % 2).collect();
        let tie_up = vec![
            vec![true, false],
            vec![false, true],
        ];

        Self {
            loom_type: LoomType::RigidHeddle,
            warp_colors,
            weft_colors,
            threading,
            tie_up,
            treadling,
        }
    }

    /// Bestimmt für Zelle (x, y) im Gewebebild, ob der Kettfaden oben liegt (true)
    /// oder der Schussfaden oben liegt (false).
    pub fn is_warp_up(&self, x: usize, y: usize) -> Option<bool> {
        let shaft = *self.threading.get(x)?;
        let treadle = *self.treadling.get(y)?;
        self.tie_up.get(treadle)?.get(shaft).copied()
    }

    /// Liefert die sichtbare Farbe an Position (x, y) im Gewebe.
    pub fn visible_color_at(&self, x: usize, y: usize) -> Option<&str> {
        if self.is_warp_up(x, y)? {
            self.warp_colors.get(x).map(String::as_str)
        } else {
            self.weft_colors.get(y).map(String::as_str)
        }
    }

    /// Generiert eine zusammengefasste Einfädel-Liste (Run-Length Encoding) aus `warp_colors`.
    pub fn generate_threading_plan(&self) -> Vec<ThreadingPlanStep> {
        let mut plan = Vec::new();
        let mut iter = self.warp_colors.iter().enumerate();

        let Some((first_idx, first_color)) = iter.next() else {
            return plan;
        };

        let mut current_color = first_color.clone();
        let mut start_idx = first_idx;
        let mut count = 1usize;

        for (idx, color) in iter {
            if color == &current_color {
                count += 1;
            } else {
                plan.push(ThreadingPlanStep {
                    count,
                    color: current_color,
                    start_thread: start_idx + 1,
                    end_thread: start_idx + count,
                });
                current_color = color.clone();
                start_idx = idx;
                count = 1;
            }
        }

        plan.push(ThreadingPlanStep {
            count,
            color: current_color,
            start_thread: start_idx + 1,
            end_thread: start_idx + count,
        });

        plan
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rigid_heddle_plain_weave_drawdown() {
        let draft = WeavingDraft::new_rigid_heddle(
            4,
            4,
            "#1E293B".to_string(),
            "#F59E0B".to_string(),
        );

        // Schachbrettmuster der Leinwandbindung prüfen
        assert_eq!(draft.is_warp_up(0, 0), Some(true));
        assert_eq!(draft.is_warp_up(1, 0), Some(false));
        assert_eq!(draft.is_warp_up(0, 1), Some(false));
        assert_eq!(draft.is_warp_up(1, 1), Some(true));
    }

    #[test]
    fn test_threading_plan_run_length_encoding() {
        let mut draft = WeavingDraft::new_rigid_heddle(
            6,
            2,
            "#FF0000".to_string(),
            "#FFFFFF".to_string(),
        );
        draft.warp_colors[4] = "#0000FF".to_string();
        draft.warp_colors[5] = "#0000FF".to_string();

        let plan = draft.generate_threading_plan();
        assert_eq!(
            plan,
            vec![
                ThreadingPlanStep {
                    count: 4,
                    color: "#FF0000".to_string(),
                    start_thread: 1,
                    end_thread: 4,
                },
                ThreadingPlanStep {
                    count: 2,
                    color: "#0000FF".to_string(),
                    start_thread: 5,
                    end_thread: 6,
                },
            ]
        );
    }
}
