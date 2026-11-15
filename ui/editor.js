const DEFAULT_PALETTE = [
  "#F5F0E6", // Naturweiß / Rohweiß
  "#D6C7B2", // Leinen / Hafer
  "#B45309", // Terrakotta / Rost
  "#D97706", // Senfgelb / Ocker
  "#1E3A5F", // Indigo / Marine
  "#2F5D50", // Tannengrün
  "#7C2D12", // Kastanie
  "#292524", // Anthrazit
];

const DEFAULT_YARN_PROFILES = [
  { id: "cotton-8-2", name: "Baumwolle 8/2 (fein)", color: "#F5F0E6", thickness: 0.7 },
  { id: "linen-16-2", name: "Leinen 16/2 (fein-mittel)", color: "#D6C7B2", thickness: 0.85 },
  { id: "merino-dk", name: "Merino DK (mittel)", color: "#1E3A5F", thickness: 1.0 },
  { id: "wool-worsted", name: "Schurwolle Worsted (kräftig)", color: "#B45309", thickness: 1.25 },
  { id: "slub-bulky", name: "Effekt- / Dochtgarn (dick)", color: "#D97706", thickness: 1.5 },
];

export class WeavingEditor {
  constructor({ onDraftChange }) {
    this.onDraftChange = onDraftChange;
    this.activeColor = DEFAULT_PALETTE[2];
    this.activeThickness = 1.0;
    this.cellSize = 18;
    this.isPaintingWarp = false;
    this.isPaintingWeft = false;

    this.yarnProfiles = this.loadYarnProfiles();
    this.draft = this.createInitialDraft(32, 32);

    this.paletteEl = document.getElementById("editor-palette");
    this.customColorEl = document.getElementById("editor-custom-color");
    this.thicknessEl = document.getElementById("editor-thickness");
    this.thicknessLabelEl = document.getElementById("editor-thickness-label");
    this.yarnProfileSelectEl = document.getElementById("editor-yarn-profile");
    this.warpCountEl = document.getElementById("editor-warp-count");
    this.weftCountEl = document.getElementById("editor-weft-count");
    this.zoomSliderEl = document.getElementById("editor-zoom");
    this.zoomLabelEl = document.getElementById("editor-zoom-label");
    this.hoverInfoEl = document.getElementById("editor-hover-info");

    this.scrollAreaEl = document.getElementById("editor-scroll-area");
    this.warpCanvas = document.getElementById("warp-axis-canvas");
    this.drawdownCanvas = document.getElementById("drawdown-canvas");
    this.weftCanvas = document.getElementById("weft-axis-canvas");

    this.initPalette();
    this.renderYarnProfiles();
    this.bindEvents();
    this.syncDimensionInputs();
    this.render();
  }

  loadYarnProfiles() {
    try {
      const raw = localStorage.getItem("loomcraft_yarn_profiles");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Fallback to defaults
    }
    return [...DEFAULT_YARN_PROFILES];
  }

  saveYarnProfiles() {
    localStorage.setItem("loomcraft_yarn_profiles", JSON.stringify(this.yarnProfiles));
  }

  renderYarnProfiles() {
    this.yarnProfileSelectEl.innerHTML = "";
    this.yarnProfiles.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.name} (${p.thickness.toFixed(2)}×)`;
      this.yarnProfileSelectEl.appendChild(opt);
    });
  }

  createInitialDraft(warpCount, weftCount) {
    const warpColors = Array.from({ length: warpCount }, (_, i) =>
      Math.floor(i / 4) % 2 === 0 ? DEFAULT_PALETTE[0] : DEFAULT_PALETTE[4]
    );
    const weftColors = Array.from({ length: weftCount }, (_, i) =>
      Math.floor(i / 4) % 2 === 0 ? DEFAULT_PALETTE[0] : DEFAULT_PALETTE[2]
    );
    const warpThicknesses = Array.from({ length: warpCount }, () => 1.0);
    const weftThicknesses = Array.from({ length: weftCount }, () => 1.0);

    return {
      loomType: { kind: "RigidHeddle" },
      warpColors,
      weftColors,
      warpThicknesses,
      weftThicknesses,
      threading: Array.from({ length: warpCount }, (_, x) => x % 2),
      tieUp: [
        [true, false],
        [false, true],
      ],
      treadling: Array.from({ length: weftCount }, (_, y) => y % 2),
    };
  }

  initPalette() {
    this.paletteEl.innerHTML = "";
    DEFAULT_PALETTE.forEach((hex) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatch-btn";
      btn.style.backgroundColor = hex;
      btn.title = hex;
      btn.dataset.color = hex;
      btn.addEventListener("click", () => this.setActiveColor(hex));
      this.paletteEl.appendChild(btn);
    });
    this.updatePaletteSelection();
  }

  setActiveColor(hex) {
    this.activeColor = hex.toUpperCase();
    this.customColorEl.value = this.activeColor;
    this.updatePaletteSelection();
  }

  setActiveThickness(value) {
    this.activeThickness = Math.max(0.5, Math.min(1.6, Number(value) || 1.0));
    this.thicknessEl.value = this.activeThickness;
    this.thicknessLabelEl.textContent = `${this.activeThickness.toFixed(1)}×`;
  }

  updatePaletteSelection() {
    this.paletteEl.querySelectorAll(".swatch-btn").forEach((btn) => {
      btn.classList.toggle(
        "active",
        btn.dataset.color.toUpperCase() === this.activeColor
      );
    });
  }

  bindEvents() {
    this.customColorEl.addEventListener("input", (e) => {
      this.setActiveColor(e.target.value);
    });

    this.thicknessEl.addEventListener("input", (e) => {
      this.setActiveThickness(e.target.value);
    });

    this.yarnProfileSelectEl.addEventListener("change", () => {
      const prof = this.yarnProfiles.find((p) => p.id === this.yarnProfileSelectEl.value);
      if (prof) {
        this.setActiveColor(prof.color);
        this.setActiveThickness(prof.thickness);
      }
    });

    document.getElementById("editor-save-yarn-profile").addEventListener("click", () => {
      const name = prompt("Name für das Material-/Garn-Profil:", `Garn ${this.activeColor} (${this.activeThickness.toFixed(1)}×)`);
      if (!name || !name.trim()) return;
      const newProf = {
        id: `yarn-${Date.now()}`,
        name: name.trim(),
        color: this.activeColor,
        thickness: this.activeThickness,
      };
      this.yarnProfiles.push(newProf);
      this.saveYarnProfiles();
      this.renderYarnProfiles();
      this.yarnProfileSelectEl.value = newProf.id;
    });

    document.getElementById("editor-apply-dims").addEventListener("click", () => {
      const w = Math.max(2, Math.min(400, Number(this.warpCountEl.value) || 32));
      const h = Math.max(2, Math.min(400, Number(this.weftCountEl.value) || 32));
      this.resizeDraft(w, h);
    });

    document.getElementById("editor-reset-pattern").addEventListener("click", () => {
      this.draft = this.createInitialDraft(
        this.draft.warpColors.length,
        this.draft.weftColors.length
      );
      this.render();
      this.notifyChange();
    });

    // Zoom-Steuerung
    this.zoomSliderEl.addEventListener("input", () => {
      this.setCellSize(Number(this.zoomSliderEl.value));
    });
    document.getElementById("editor-zoom-out").addEventListener("click", () => {
      this.setCellSize(this.cellSize - 2);
    });
    document.getElementById("editor-zoom-in").addEventListener("click", () => {
      this.setCellSize(this.cellSize + 2);
    });
    document.getElementById("editor-zoom-reset").addEventListener("click", () => {
      this.setCellSize(18);
    });

    this.scrollAreaEl.addEventListener(
      "wheel",
      (e) => {
        if (e.ctrlKey) {
          e.preventDefault();
          const delta = e.deltaY < 0 ? 2 : -2;
          this.setCellSize(this.cellSize + delta);
        }
      },
      { passive: false }
    );

    // Malen auf X-Achse (Kette: Farbe + Dicke)
    this.warpCanvas.addEventListener("pointerdown", (e) => {
      this.isPaintingWarp = true;
      this.warpCanvas.setPointerCapture(e.pointerId);
      this.paintWarpAtEvent(e);
    });
    this.warpCanvas.addEventListener("pointermove", (e) => {
      if (this.isPaintingWarp) this.paintWarpAtEvent(e);
    });
    this.warpCanvas.addEventListener("pointerup", () => {
      this.isPaintingWarp = false;
    });

    // Malen auf Y-Achse (Schuss: Farbe + Dicke)
    this.weftCanvas.addEventListener("pointerdown", (e) => {
      this.isPaintingWeft = true;
      this.weftCanvas.setPointerCapture(e.pointerId);
      this.paintWeftAtEvent(e);
    });
    this.weftCanvas.addEventListener("pointermove", (e) => {
      if (this.isPaintingWeft) this.paintWeftAtEvent(e);
    });
    this.weftCanvas.addEventListener("pointerup", () => {
      this.isPaintingWeft = false;
    });

    // Hover-Inspektor auf dem Gewebebild
    this.drawdownCanvas.addEventListener("pointermove", (e) => {
      const rect = this.drawdownCanvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) / this.cellSize);
      const y = Math.floor((e.clientY - rect.top) / this.cellSize);
      if (
        x >= 0 &&
        x < this.draft.warpColors.length &&
        y >= 0 &&
        y < this.draft.weftColors.length
      ) {
        const warpUp = this.isWarpUp(x, y);
        const wThick = this.draft.warpThicknesses[x].toFixed(1);
        const fThick = this.draft.weftThicknesses[y].toFixed(1);
        this.hoverInfoEl.textContent = `Kette #${x + 1} (${wThick}×) · Schuss #${y + 1} (${fThick}×) · Oben: ${
          warpUp ? "Kette" : "Schuss"
        }`;
      }
    });
  }

  setCellSize(size) {
    this.cellSize = Math.max(6, Math.min(40, size));
    this.zoomSliderEl.value = this.cellSize;
    const pct = Math.round((this.cellSize / 18) * 100);
    this.zoomLabelEl.textContent = `${pct}%`;
    this.render();
  }

  resizeDraft(newWarpCount, newWeftCount) {
    const oldWarp = this.draft.warpColors;
    const oldWeft = this.draft.weftColors;
    const oldWarpT = this.draft.warpThicknesses;
    const oldWeftT = this.draft.weftThicknesses;

    this.draft.warpColors = Array.from(
      { length: newWarpCount },
      (_, x) => oldWarp[x] ?? oldWarp[x % oldWarp.length] ?? DEFAULT_PALETTE[0]
    );
    this.draft.weftColors = Array.from(
      { length: newWeftCount },
      (_, y) => oldWeft[y] ?? oldWeft[y % oldWeft.length] ?? DEFAULT_PALETTE[2]
    );
    this.draft.warpThicknesses = Array.from(
      { length: newWarpCount },
      (_, x) => oldWarpT[x] ?? oldWarpT[x % oldWarpT.length] ?? 1.0
    );
    this.draft.weftThicknesses = Array.from(
      { length: newWeftCount },
      (_, y) => oldWeftT[y] ?? oldWeftT[y % oldWeftT.length] ?? 1.0
    );
    this.draft.threading = Array.from({ length: newWarpCount }, (_, x) => x % 2);
    this.draft.treadling = Array.from({ length: newWeftCount }, (_, y) => y % 2);

    this.syncDimensionInputs();
    this.render();
    this.notifyChange();
  }

  syncDimensionInputs() {
    this.warpCountEl.value = this.draft.warpColors.length;
    this.weftCountEl.value = this.draft.weftColors.length;
  }

  paintWarpAtEvent(e) {
    const rect = this.warpCanvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / this.cellSize);
    if (x >= 0 && x < this.draft.warpColors.length) {
      if (
        this.draft.warpColors[x] !== this.activeColor ||
        this.draft.warpThicknesses[x] !== this.activeThickness
      ) {
        this.draft.warpColors[x] = this.activeColor;
        this.draft.warpThicknesses[x] = this.activeThickness;
        this.render();
        this.notifyChange();
      }
    }
  }

  paintWeftAtEvent(e) {
    const rect = this.weftCanvas.getBoundingClientRect();
    const y = Math.floor((e.clientY - rect.top) / this.cellSize);
    if (y >= 0 && y < this.draft.weftColors.length) {
      if (
        this.draft.weftColors[y] !== this.activeColor ||
        this.draft.weftThicknesses[y] !== this.activeThickness
      ) {
        this.draft.weftColors[y] = this.activeColor;
        this.draft.weftThicknesses[y] = this.activeThickness;
        this.render();
        this.notifyChange();
      }
    }
  }

  isWarpUp(x, y) {
    const shaft = this.draft.threading[x];
    const treadle = this.draft.treadling[y];
    return Boolean(this.draft.tieUp[treadle]?.[shaft]);
  }

  threadSpan(thickness) {
    return Math.max(2, Math.min(this.cellSize, this.cellSize * 0.78 * thickness));
  }

  render() {
    const warpCount = this.draft.warpColors.length;
    const weftCount = this.draft.weftColors.length;
    const s = this.cellSize;
    const axisThickness = 30;

    const width = warpCount * s;
    const height = weftCount * s;

    // 1. X-Achse (Kettfäden oben, skaliert nach Fadendicke)
    this.warpCanvas.width = width;
    this.warpCanvas.height = axisThickness;
    const wCtx = this.warpCanvas.getContext("2d");
    wCtx.fillStyle = "#e6dfd3";
    wCtx.fillRect(0, 0, width, axisThickness);

    for (let x = 0; x < warpCount; x++) {
      const span = this.threadSpan(this.draft.warpThicknesses[x]);
      const offset = (s - span) / 2;
      wCtx.fillStyle = this.draft.warpColors[x];
      wCtx.fillRect(x * s + offset, 1, span, axisThickness - 2);
      wCtx.strokeStyle = "rgba(0,0,0,0.2)";
      wCtx.strokeRect(x * s + offset + 0.5, 1.5, Math.max(1, span - 1), axisThickness - 3);
    }

    // 2. Y-Achse (Schussfäden rechts, skaliert nach Fadendicke)
    this.weftCanvas.width = axisThickness;
    this.weftCanvas.height = height;
    const fCtx = this.weftCanvas.getContext("2d");
    fCtx.fillStyle = "#e6dfd3";
    fCtx.fillRect(0, 0, axisThickness, height);

    for (let y = 0; y < weftCount; y++) {
      const span = this.threadSpan(this.draft.weftThicknesses[y]);
      const offset = (s - span) / 2;
      fCtx.fillStyle = this.draft.weftColors[y];
      fCtx.fillRect(1, y * s + offset, axisThickness - 2, span);
      fCtx.strokeStyle = "rgba(0,0,0,0.2)";
      fCtx.strokeRect(1.5, y * s + offset + 0.5, axisThickness - 3, Math.max(1, span - 1));
    }

    // 3. Drawdown (Gewebebild in der Mitte mit skalierter Fadendicke)
    this.drawdownCanvas.width = width;
    this.drawdownCanvas.height = height;
    const dCtx = this.drawdownCanvas.getContext("2d");
    dCtx.fillStyle = "#f4efe6";
    dCtx.fillRect(0, 0, width, height);

    for (let y = 0; y < weftCount; y++) {
      const weftSpan = this.threadSpan(this.draft.weftThicknesses[y]);
      const weftOffset = (s - weftSpan) / 2;
      const weftColor = this.draft.weftColors[y];

      for (let x = 0; x < warpCount; x++) {
        const warpSpan = this.threadSpan(this.draft.warpThicknesses[x]);
        const warpOffset = (s - warpSpan) / 2;
        const warpColor = this.draft.warpColors[x];

        const px = x * s;
        const py = y * s;
        const warpUp = this.isWarpUp(x, y);

        if (warpUp) {
          // Erst Schuss darunter, dann Kette darüber
          dCtx.fillStyle = weftColor;
          dCtx.fillRect(px, py + weftOffset, s, weftSpan);
          dCtx.fillStyle = warpColor;
          dCtx.fillRect(px + warpOffset, py, warpSpan, s);
          if (s >= 8) {
            dCtx.strokeStyle = "rgba(0,0,0,0.18)";
            dCtx.strokeRect(px + warpOffset + 0.5, py + 0.5, Math.max(1, warpSpan - 1), s - 1);
          }
        } else {
          // Erst Kette darunter, dann Schuss darüber
          dCtx.fillStyle = warpColor;
          dCtx.fillRect(px + warpOffset, py, warpSpan, s);
          dCtx.fillStyle = weftColor;
          dCtx.fillRect(px, py + weftOffset, s, weftSpan);
          if (s >= 8) {
            dCtx.strokeStyle = "rgba(0,0,0,0.18)";
            dCtx.strokeRect(px + 0.5, py + weftOffset + 0.5, s - 1, Math.max(1, weftSpan - 1));
          }
        }
      }
    }
  }

  notifyChange() {
    if (this.onDraftChange) {
      this.onDraftChange(this.draft);
    }
  }
}
