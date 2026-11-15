# LoomCraft — Handweaving Studio

[![GitHub Release](https://img.shields.io/github/v/release/PatrickBarbian/LoomCraft)](https://github.com/PatrickBarbian/LoomCraft/releases)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-orange?logo=buy-me-a-coffee)](https://buymeacoffee.com/02eOWKzm5W)

**LoomCraft** is a cross-platform desktop application (Windows & macOS) built with **Tauri v2** and **Rust** for handweavers. Designed for rigid heddle looms (such as Ashford Rigid Heddle & SampleIt) with an extensible weaving draft architecture ready for multi-shaft looms.

> **Suggested GitHub Description:**  
> *Cross-platform desktop studio for handweavers — warp & weft calculator, interactive CAD weave editor with yarn thickness & material profiles, threading planner, and loom profiles (Tauri v2 + Rust).*

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
   - **Yarn Thickness & Material Profiles:** Scale individual warp/weft thread widths (`0.5×`–`1.6×`) and save reusable yarn/material presets (e.g., *Cotton 8/2*, *Merino DK*, *Bulky Slub*).
   - Click-and-drag painting, custom color picker, zoom (`Ctrl + Wheel`), and sticky axis bars for large projects.
4. **Threading Planner (Module 3)**
   - Automatically generates a run-length encoded threading checklist from your warp, with interactive checkboxes and plain-text export.
5. **Built-in User Guide & Update Checker**
   - Integrated step-by-step guide and one-click GitHub Release update checker.
6. **Multilingual UI (7 Languages)**
   - Deutsch (`de`), English (`en`), Français (`fr`), Español (`es`), Italiano (`it`), Nederlands (`nl`), 日本語 (`ja`).

---

## Support

If LoomCraft helps you plan your weaving projects, you can support development here:  
☕ **[Buy Me a Coffee](https://buymeacoffee.com/02eOWKzm5W)** · 🔗 **[GitHub Repository](https://github.com/PatrickBarbian/LoomCraft)**

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
