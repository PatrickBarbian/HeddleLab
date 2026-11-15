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

export class WeavingEditor {
  constructor({ onDraftChange }) {
    this.onDraftChange = onDraftChange;
    this.activeColor = DEFAULT_PALETTE[2];
    this.cellSize = 16; // px pro Faden bei 100% (16px = 100%)
    this.isPaintingWarp = false;
    this.isPaintingWeft = false;

    this.draft = this.createInitialDraft(32, 32);

    this.paletteEl = document.getElementById("editor-palette");
    this.customColorEl = document.getElementById("editor-custom-color");
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
    this.bindEvents();
    this.syncDimensionInputs();
    this.render();
  }

  createInitialDraft(warpCount, weftCount) {
    const warpColors = Array.from({ length: warpCount }, (_, i) =>
      Math.floor(i / 4) % 2 === 0 ? DEFAULT_PALETTE[0] : DEFAULT_PALETTE[4]
    );
    const weftColors = Array.from({ length: weftCount }, (_, i) =>
      Math.floor(i / 4) % 2 === 0 ? DEFAULT_PALETTE[0] : DEFAULT_PALETTE[2]
    );

    return {
      loomType: { kind: "RigidHeddle" },
      warpColors,
      weftColors,
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
      this.setCellSize(16);
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

    // Malen auf X-Achse (Kette)
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

    // Malen auf Y-Achse (Schuss)
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
        this.hoverInfoEl.textContent = `Kettfaden ${x + 1} · Schuss ${y + 1} · Oben: ${
          warpUp ? "Kette" : "Schuss"
        }`;
      }
    });
  }

  setCellSize(size) {
    this.cellSize = Math.max(6, Math.min(36, size));
    this.zoomSliderEl.value = this.cellSize;
    const pct = Math.round((this.cellSize / 16) * 100);
    this.zoomLabelEl.textContent = `${pct}%`;
    this.render();
  }

  resizeDraft(newWarpCount, newWeftCount) {
    const oldWarp = this.draft.warpColors;
    const oldWeft = this.draft.weftColors;

    this.draft.warpColors = Array.from(
      { length: newWarpCount },
      (_, x) => oldWarp[x] ?? oldWarp[x % oldWarp.length] ?? DEFAULT_PALETTE[0]
    );
    this.draft.weftColors = Array.from(
      { length: newWeftCount },
      (_, y) => oldWeft[y] ?? oldWeft[y % oldWeft.length] ?? DEFAULT_PALETTE[2]
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
      if (this.draft.warpColors[x] !== this.activeColor) {
        this.draft.warpColors[x] = this.activeColor;
        this.render();
        this.notifyChange();
      }
    }
  }

  paintWeftAtEvent(e) {
    const rect = this.weftCanvas.getBoundingClientRect();
    const y = Math.floor((e.clientY - rect.top) / this.cellSize);
    if (y >= 0 && y < this.draft.weftColors.length) {
      if (this.draft.weftColors[y] !== this.activeColor) {
        this.draft.weftColors[y] = this.activeColor;
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

  render() {
    const warpCount = this.draft.warpColors.length;
    const weftCount = this.draft.weftColors.length;
    const s = this.cellSize;
    const axisThickness = 28;

    const width = warpCount * s;
    const height = weftCount * s;

    // 1. X-Achse (Kettfäden oben)
    this.warpCanvas.width = width;
    this.warpCanvas.height = axisThickness;
    const wCtx = this.warpCanvas.getContext("2d");
    wCtx.clearRect(0, 0, width, axisThickness);

    for (let x = 0; x < warpCount; x++) {
      wCtx.fillStyle = this.draft.warpColors[x];
      wCtx.fillRect(x * s, 0, s, axisThickness);
      wCtx.strokeStyle = "rgba(0,0,0,0.18)";
      wCtx.strokeRect(x * s + 0.5, 0.5, s - 1, axisThickness - 1);
    }

    // 2. Y-Achse (Schussfäden rechts)
    this.weftCanvas.width = axisThickness;
    this.weftCanvas.height = height;
    const fCtx = this.weftCanvas.getContext("2d");
    fCtx.clearRect(0, 0, axisThickness, height);

    for (let y = 0; y < weftCount; y++) {
      fCtx.fillStyle = this.draft.weftColors[y];
      fCtx.fillRect(0, y * s, axisThickness, s);
      fCtx.strokeStyle = "rgba(0,0,0,0.18)";
      fCtx.strokeRect(0.5, y * s + 0.5, axisThickness - 1, s - 1);
    }

    // 3. Drawdown (Gewebebild in der Mitte)
    this.drawdownCanvas.width = width;
    this.drawdownCanvas.height = height;
    const dCtx = this.drawdownCanvas.getContext("2d");
    dCtx.clearRect(0, 0, width, height);

    for (let y = 0; y < weftCount; y++) {
      for (let x = 0; x < warpCount; x++) {
        const warpUp = this.isWarpUp(x, y);
        const color = warpUp
          ? this.draft.warpColors[x]
          : this.draft.weftColors[y];

        const px = x * s;
        const py = y * s;

        dCtx.fillStyle = color;
        dCtx.fillRect(px, py, s, s);

        // Dezente Faden-Plastizität (Kettfaden vertikal, Schussfaden horizontal betont)
        if (s >= 8) {
          dCtx.fillStyle = warpUp
            ? "rgba(255,255,255,0.08)"
            : "rgba(0,0,0,0.08)";
          if (warpUp) {
            dCtx.fillRect(px + 1, py, Math.max(1, s - 2), s);
          } else {
            dCtx.fillRect(px, py + 1, s, Math.max(1, s - 2));
          }
          dCtx.strokeStyle = "rgba(0,0,0,0.14)";
          dCtx.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
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
