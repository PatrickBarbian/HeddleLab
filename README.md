# LoomCraft — Handweaving Studio

**LoomCraft** is a cross-platform desktop application (Windows & macOS) built with **Tauri v2** and **Rust** for handweavers. Designed for rigid heddle looms (such as Ashford Rigid Heddle & SampleIt) with an extensible weaving draft architecture ready for multi-shaft looms.

> **Suggested GitHub Description:**  
> *Cross-platform desktop studio for handweavers — warp & weft calculator, interactive CAD weave editor, threading planner, and loom profiles (Tauri v2 + Rust).*

---

## Features

1. **Warp & Weft Calculator (Module 1)**
   - Live calculation of total warp ends, length per warp end, total warp yarn, and total weft yarn.
   - Accounts for take-up (%), wet-finishing shrinkage (%), and loom waste (cm).
   - Quick-select presets for Ashford reeds (`30/10`, `40/10`, `50/10`, `60/10`).
2. **Saved Loom Profiles**
   - Save, load, and delete custom loom configurations locally (`loom_profiles.json` in your OS app data directory).
3. **Visual Weave Editor / CAD (Module 2)**
   - Interactive 2D drawdown grid with paintable warp (X-axis) and weft (Y-axis) color bars.
   - Click-and-drag painting, custom color picker, zoom (`50%`–`225%`, `Ctrl + Wheel`), and sticky axis bars for large projects.
   - Sync dimensions directly from the calculator.
4. **Threading Planner (Module 3)**
   - Automatically generates a run-length encoded threading checklist (e.g., `4× Natural White, 4× Indigo`) from your warp.
   - Interactive checkboxes with progress tracking and one-click plain-text clipboard export.
5. **Multilingual UI (7 Languages)**
   - Deutsch (`de`), English (`en`), Français (`fr`), Español (`es`), Italiano (`it`), Nederlands (`nl`), 日本語 (`ja`).

---

## Running Locally

### Prerequisites
- [Rust & Cargo](https://rustup.rs/)
- Platform WebView dependencies (WebView2 on Windows, Xcode Command Line Tools on macOS)

### Start in Development
```bash
cd src-tauri
cargo run
```

### Run Unit Tests
```bash
cd src-tauri
cargo test
```

### Building Release Binaries (Windows & macOS)
Push a version tag (e.g. `v0.1.0`) to GitHub to trigger `.github/workflows/release.yml`, which builds installers/bundles for both **Windows (`x86_64`)** and **macOS (`aarch64` Apple Silicon & `x86_64` Intel)** automatically.
