import { WeavingEditor } from "./editor.js";
import { TRANSLATIONS, detectInitialLanguage } from "./i18n.js";

const invoke = window.__TAURI__?.core?.invoke;

let currentLang = detectInitialLanguage();
const langSelect = document.getElementById("lang-select");
langSelect.value = currentLang;

function t(key) {
  return TRANSLATIONS[currentLang]?.[key] ?? TRANSLATIONS.en[key] ?? key;
}

function formatColorLabel(hex) {
  const upper = hex.toUpperCase();
  const colorNames = TRANSLATIONS[currentLang]?.colors ?? {};
  const name = colorNames[upper];
  return name ? `${name} (${upper})` : upper;
}

function applyTranslations() {
  document.documentElement.lang = currentLang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    el.placeholder = t(key);
  });
  if (state.lastCalculation) {
    renderCalculation(state.lastCalculation);
  }
  renderThreadingPlan();
}

langSelect.addEventListener("change", () => {
  currentLang = langSelect.value;
  localStorage.setItem("loomcraft_lang", currentLang);
  applyTranslations();
});

const state = {
  lastCalculation: null,
  profiles: [],
  activeProfileId: null,
  loomMode: "RigidHeddle", // "RigidHeddle" | "ShaftLoom"
  currentProjectId: `proj-${Date.now()}`,
  threadingPlan: [],
  checkedSteps: new Set(),
};

const navButtons = document.querySelectorAll(".nav-item");
const views = document.querySelectorAll(".view");
const presetChips = document.querySelectorAll(".chip[data-epi]");

const inputs = {
  finishedWidthCm: document.getElementById("finishedWidthCm"),
  finishedLengthCm: document.getElementById("finishedLengthCm"),
  endsPerCm: document.getElementById("endsPerCm"),
  picksPerCm: document.getElementById("picksPerCm"),
  takeUpPercent: document.getElementById("takeUpPercent"),
  shrinkagePercent: document.getElementById("shrinkagePercent"),
  loomWasteCm: document.getElementById("loomWasteCm"),
};

const errorBanner = document.getElementById("calc-error");
const profileSelect = document.getElementById("profile-select");
const saveDrawer = document.getElementById("save-profile-drawer");
const sidebarLoomName = document.getElementById("sidebar-loom-name");

const editor = new WeavingEditor({
  onDraftChange: () => {
    state.checkedSteps.clear();
    refreshThreadingPlan();
  },
});

function switchView(viewName) {
  navButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });
  views.forEach((view) => {
    view.classList.toggle("active", view.id === `view-${viewName}`);
  });
  if (viewName === "threading") {
    refreshThreadingPlan();
  }
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

presetChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    inputs.endsPerCm.value = chip.dataset.epi;
    updateActivePresetChip(chip.dataset.epi);
    recalculate();
  });
});

function updateActivePresetChip(epiValue) {
  presetChips.forEach((chip) => {
    chip.classList.toggle("active", Number(chip.dataset.epi) === Number(epiValue));
  });
}

function readCalculatorInput() {
  const picksRaw = inputs.picksPerCm.value.trim();
  return {
    finishedWidthCm: Number(inputs.finishedWidthCm.value),
    finishedLengthCm: Number(inputs.finishedLengthCm.value),
    endsPerCm: Number(inputs.endsPerCm.value),
    picksPerCm: picksRaw === "" ? null : Number(picksRaw),
    takeUpPercent: Number(inputs.takeUpPercent.value),
    shrinkagePercent: Number(inputs.shrinkagePercent.value),
    loomWasteCm: Number(inputs.loomWasteCm.value),
  };
}

function formatNumber(value, decimals = 2) {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function renderCalculation(output) {
  state.lastCalculation = output;
  errorBanner.hidden = true;

  document.getElementById("res-total-ends").textContent = output.totalWarpEnds;
  document.getElementById("res-length-per-end").textContent = formatNumber(output.lengthPerWarpEndCm, 1);
  document.getElementById("res-total-warp").textContent = formatNumber(output.totalWarpLengthM, 2);
  document.getElementById("res-total-weft").textContent = formatNumber(output.totalWeftLengthM, 2);

  document.getElementById("res-weaving-width").textContent = `${formatNumber(output.weavingWidthCm, 1)} cm`;
  document.getElementById("res-woven-length").textContent = `${formatNumber(output.wovenLengthCm, 1)} cm`;
  document.getElementById("res-total-picks").textContent = `${output.totalWeftPicks} ${t("picksUnit")}`;

  document.getElementById("next-step-desc").textContent =
    t("nextStepText").replace("{ends}", output.totalWarpEnds);
  document.getElementById("editor-dims-preview").textContent =
    t("calcPreview")
      .replace("{w}", output.totalWarpEnds)
      .replace("{h}", output.totalWeftPicks);

  renderCalcHeddleSummary(output.totalWarpEnds);
}

function getActiveHeddlesPerShaft() {
  const active = state.profiles.find((p) => p.id === state.activeProfileId);
  const shafts = editor.draft.loomType.kind === "ShaftLoom" ? editor.draft.loomType.shafts : 2;
  if (active?.heddlesPerShaft?.length) {
    return Array.from({ length: shafts }, (_, i) => active.heddlesPerShaft[i] ?? active.heddlesPerShaft[0] ?? 100);
  }
  return Array.from({ length: shafts }, () => 100);
}

function renderCalcHeddleSummary(totalWarpEnds) {
  const card = document.getElementById("calc-shaft-card");
  const grid = document.getElementById("calc-heddle-summary");
  if (state.loomMode !== "ShaftLoom") {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  const limits = getActiveHeddlesPerShaft();
  const shafts = limits.length;
  const perShaftApprox = Math.ceil(totalWarpEnds / shafts);

  grid.innerHTML = "";
  limits.forEach((limit, idx) => {
    const over = perShaftApprox > limit;
    const pill = document.createElement("span");
    pill.className = `heddle-pill${over ? " over-limit" : ""}`;
    pill.textContent = `Schaft ${idx + 1}: ~${perShaftApprox} / ${limit} Ösen`;
    grid.appendChild(pill);
  });
}

function renderError(message) {
  errorBanner.textContent = message;
  errorBanner.hidden = false;
}

async function recalculate() {
  const input = readCalculatorInput();
  updateActivePresetChip(input.endsPerCm);

  if (!invoke) {
    renderError("Tauri-Backend nicht verbunden. Bitte über die Desktop-App starten.");
    return;
  }

  try {
    const output = await invoke("calculate_warp_weft", { input });
    renderCalculation(output);
  } catch (err) {
    renderError(typeof err === "string" ? err : "Ungültige Eingabewerte.");
  }
}

// --- Webstuhl-Profile ---
function renderProfileSelect() {
  profileSelect.innerHTML = "";
  state.profiles.forEach((profile) => {
    const opt = document.createElement("option");
    opt.value = profile.id;
    opt.textContent = `${profile.name} (max. ${profile.maxWidthCm} cm)`;
    profileSelect.appendChild(opt);
  });

  if (state.activeProfileId) {
    profileSelect.value = state.activeProfileId;
  }

  const deleteBtn = document.getElementById("btn-delete-profile");
  deleteBtn.disabled = state.profiles.length <= 1;
}

function setGlobalLoomMode(kind, shafts = 4, treadles = 4) {
  state.loomMode = kind;
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === kind);
  });
  document.getElementById("new-profile-shaft-fields").hidden = kind !== "ShaftLoom";
  document.getElementById("threading-shaft-usage-box").hidden = kind !== "ShaftLoom";
  editor.setLoomMode(kind, shafts, treadles);
  if (state.lastCalculation) {
    renderCalcHeddleSummary(state.lastCalculation.totalWarpEnds);
  }
  refreshThreadingPlan();
}

document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const mode = btn.dataset.mode;
    const shafts = Number(document.getElementById("editor-shaft-count").value) || 4;
    setGlobalLoomMode(mode, shafts, shafts);
  });
});

function applyProfile(profile) {
  if (!profile) return;
  state.activeProfileId = profile.id;
  inputs.endsPerCm.value = profile.defaultEndsPerCm;
  inputs.loomWasteCm.value = profile.defaultLoomWasteCm;
  inputs.takeUpPercent.value = profile.defaultTakeUpPercent;
  inputs.shrinkagePercent.value = profile.defaultShrinkagePercent;
  sidebarLoomName.textContent = profile.name;
  renderProfileSelect();

  if (profile.loomType?.kind === "ShaftLoom") {
    setGlobalLoomMode("ShaftLoom", profile.loomType.shafts, profile.loomType.treadles);
  } else {
    setGlobalLoomMode("RigidHeddle");
  }
  recalculate();
}

async function loadProfiles() {
  if (!invoke) return;
  try {
    state.profiles = await invoke("list_loom_profiles");
    if (state.profiles.length > 0) {
      applyProfile(state.profiles[0]);
    } else {
      renderProfileSelect();
    }
  } catch (err) {
    renderError(typeof err === "string" ? err : "Profile konnten nicht geladen werden.");
  }
}

profileSelect.addEventListener("change", () => {
  const selected = state.profiles.find((p) => p.id === profileSelect.value);
  applyProfile(selected);
});

document.getElementById("btn-toggle-save-profile").addEventListener("click", () => {
  saveDrawer.hidden = !saveDrawer.hidden;
  if (!saveDrawer.hidden) {
    document.getElementById("new-profile-name").focus();
  }
});

document.getElementById("btn-cancel-save-profile").addEventListener("click", () => {
  saveDrawer.hidden = true;
});

document.getElementById("btn-confirm-save-profile").addEventListener("click", async () => {
  if (!invoke) return;
  const name = document.getElementById("new-profile-name").value.trim();
  const maxWidthCm = Number(document.getElementById("new-profile-width").value) || 60;

  if (!name) {
    renderError("Bitte einen Namen für das Webstuhl-Profil eingeben.");
    return;
  }

  const isShaft = state.loomMode === "ShaftLoom";
  const shafts = Number(document.getElementById("new-profile-shafts").value) || 4;
  const treadles = Number(document.getElementById("new-profile-treadles").value) || 4;
  const heddlesRaw = document.getElementById("new-profile-heddles").value;
  const parsedHeddles = isShaft
    ? heddlesRaw
        .split(",")
        .map((v) => Math.max(1, Number(v.trim()) || 100))
        .slice(0, shafts)
    : [];
  while (isShaft && parsedHeddles.length < shafts) {
    parsedHeddles.push(parsedHeddles[0] ?? 100);
  }

  const newProfile = {
    id: `profile-${Date.now()}`,
    name,
    loomType: isShaft ? { kind: "ShaftLoom", shafts, treadles } : { kind: "RigidHeddle" },
    maxWidthCm,
    defaultEndsPerCm: Number(inputs.endsPerCm.value) || 4,
    defaultLoomWasteCm: Number(inputs.loomWasteCm.value) || 50,
    defaultTakeUpPercent: Number(inputs.takeUpPercent.value) || 10,
    defaultShrinkagePercent: Number(inputs.shrinkagePercent.value) || 10,
    heddlesPerShaft: parsedHeddles,
  };

  try {
    state.profiles = await invoke("save_loom_profile", { profile: newProfile });
    saveDrawer.hidden = true;
    document.getElementById("new-profile-name").value = "";
    applyProfile(newProfile);
  } catch (err) {
    renderError(typeof err === "string" ? err : "Profil konnte nicht gespeichert werden.");
  }
});

document.getElementById("btn-delete-profile").addEventListener("click", async () => {
  if (!invoke || state.profiles.length <= 1) return;
  const idToDelete = profileSelect.value;
  try {
    state.profiles = await invoke("delete_loom_profile", { id: idToDelete });
    applyProfile(state.profiles[0]);
  } catch (err) {
    renderError(typeof err === "string" ? err : "Profil konnte nicht gelöscht werden.");
  }
});

// --- Rechner -> Editor Synchronisation ---
document.getElementById("editor-sync-from-calc").addEventListener("click", () => {
  if (!state.lastCalculation) return;
  const warpCount = Math.max(2, Math.min(400, state.lastCalculation.totalWarpEnds));
  const weftCount = Math.max(2, Math.min(400, state.lastCalculation.totalWeftPicks));
  editor.resizeDraft(warpCount, weftCount);
});

// --- Modul 3: Einfädel-Planer ---
async function refreshThreadingPlan() {
  if (!invoke) return;
  try {
    state.threadingPlan = await invoke("generate_threading_plan", {
      draft: editor.draft,
    });
    renderThreadingPlan();
  } catch (err) {
    console.error("Einfädel-Plan konnte nicht generiert werden:", err);
  }
}

function renderThreadingPlan() {
  const plan = state.threadingPlan;
  const totalEnds = plan.reduce((sum, step) => sum + step.count, 0);

  document.getElementById("threading-total-ends").textContent = totalEnds;
  document.getElementById("threading-total-steps").textContent = plan.length;

  // Faden-Summen pro Farbe
  const colorMap = new Map();
  plan.forEach((step) => {
    const key = step.color.toUpperCase();
    colorMap.set(key, (colorMap.get(key) || 0) + step.count);
  });

  const totalsEl = document.getElementById("threading-color-totals");
  totalsEl.innerHTML = "";
  colorMap.forEach((count, color) => {
    const row = document.createElement("div");
    row.className = "color-total-row";
    row.innerHTML = `
      <span class="color-chip-label">
        <span class="color-dot" style="background:${color}"></span>
        <span>${formatColorLabel(color)}</span>
      </span>
      <strong>${count} ${t("threadsWord")}</strong>
    `;
    totalsEl.appendChild(row);
  });

  // Belegte Litzen (Ösen) pro Schaft
  const shaftBox = document.getElementById("threading-shaft-usage-box");
  const shaftListEl = document.getElementById("threading-shaft-usage");
  if (state.loomMode === "ShaftLoom") {
    shaftBox.hidden = false;
    const limits = getActiveHeddlesPerShaft();
    const counts = new Array(limits.length).fill(0);
    editor.draft.threading.forEach((s) => {
      if (s >= 0 && s < counts.length) counts[s]++;
    });
    shaftListEl.innerHTML = "";
    counts.forEach((used, idx) => {
      const limit = limits[idx];
      const over = used > limit;
      const row = document.createElement("div");
      row.className = `color-total-row${over ? " over-limit" : ""}`;
      row.innerHTML = `
        <span>Schaft ${idx + 1}</span>
        <strong>${used} / ${limit} Ösen${over ? " !" : ""}</strong>
      `;
      shaftListEl.appendChild(row);
    });
  } else {
    shaftBox.hidden = true;
  }

  // Schritt-für-Schritt-Liste
  const listEl = document.getElementById("threading-steps-list");
  listEl.innerHTML = "";

  plan.forEach((step, idx) => {
    const li = document.createElement("li");
    const isDone = state.checkedSteps.has(idx);
    const shaftBadge =
      state.loomMode === "ShaftLoom" && step.shafts?.length
        ? `<span class="step-shafts">Schäfte: ${step.shafts.slice(0, 8).join("·")}${step.shafts.length > 8 ? "…" : ""}</span>`
        : "";
    li.className = `threading-step-item${isDone ? " done" : ""}`;
    li.innerHTML = `
      <span class="step-left">
        <input type="checkbox" ${isDone ? "checked" : ""} aria-label="Step ${idx + 1}" />
        <span class="step-number">#${idx + 1}</span>
        <span class="color-dot" style="background:${step.color}"></span>
        <strong>${step.count}× ${formatColorLabel(step.color)}</strong>
        ${shaftBadge}
      </span>
      <span class="step-range">${step.startThread}–${step.endThread}</span>
    `;

    li.addEventListener("click", (e) => {
      if (e.target.tagName !== "INPUT") {
        const cb = li.querySelector("input[type='checkbox']");
        cb.checked = !cb.checked;
      }
      if (state.checkedSteps.has(idx)) {
        state.checkedSteps.delete(idx);
      } else {
        state.checkedSteps.add(idx);
      }
      renderThreadingPlan();
    });

    listEl.appendChild(li);
  });

  document.getElementById("threading-progress").textContent =
    t("progressText")
      .replace("{done}", state.checkedSteps.size)
      .replace("{total}", plan.length);
}

document.getElementById("threading-reset-checks").addEventListener("click", () => {
  state.checkedSteps.clear();
  renderThreadingPlan();
});

document.getElementById("threading-copy-text").addEventListener("click", async () => {
  const lines = state.threadingPlan.map(
    (step, idx) =>
      `${idx + 1}. ${step.count}x ${formatColorLabel(step.color)} (${step.startThread}–${step.endThread})`
  );
  const text =
    t("copyHeader").replace("{count}", editor.draft.warpColors.length) +
    "\n" +
    lines.join("\n");
  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById("threading-copy-text");
    btn.textContent = t("copiedBtn");
    setTimeout(() => {
      btn.textContent = t("copyTextBtn");
    }, 1500);
  } catch (err) {
    console.error("Copy failed:", err);
  }
});

Object.values(inputs).forEach((el) => {
  el.addEventListener("input", recalculate);
});

applyTranslations();
loadProfiles().then(() => {
  recalculate();
  refreshThreadingPlan();
});

// --- Externe Links im Standard-Browser öffnen (Tauri v2) ---
document.addEventListener("click", (e) => {
  const link = e.target.closest("a[href^='http']");
  if (!link) return;
  if (invoke) {
    e.preventDefault();
    invoke("open_external_url", { url: link.href }).catch((err) => {
      console.error("Externer Link fehlgeschlagen:", err);
    });
  }
});

// --- Projekt Speichern / Öffnen / Export / Import ---
const projectNameInput = document.getElementById("project-name-input");
const projectToastEl = document.getElementById("project-save-toast");
const projectsModalEl = document.getElementById("projects-modal");
const projectsListEl = document.getElementById("projects-list");

function buildProjectSnapshot() {
  return {
    id: state.currentProjectId,
    name: projectNameInput.value.trim() || "Mein Webprojekt",
    updatedAt: new Date().toISOString(),
    loomMode: state.loomMode,
    activeProfileId: state.activeProfileId,
    calculatorInput: readCalculatorInput(),
    draft: editor.draft,
    checkedSteps: Array.from(state.checkedSteps),
  };
}

function applyLoadedProject(project) {
  state.currentProjectId = project.id || `proj-${Date.now()}`;
  projectNameInput.value = project.name || "Mein Webprojekt";

  if (project.activeProfileId) {
    const prof = state.profiles.find((p) => p.id === project.activeProfileId);
    if (prof) {
      state.activeProfileId = prof.id;
      sidebarLoomName.textContent = prof.name;
      renderProfileSelect();
    }
  }

  const calc = project.calculatorInput || {};
  if (calc.finishedWidthCm != null) inputs.finishedWidthCm.value = calc.finishedWidthCm;
  if (calc.finishedLengthCm != null) inputs.finishedLengthCm.value = calc.finishedLengthCm;
  if (calc.endsPerCm != null) inputs.endsPerCm.value = calc.endsPerCm;
  inputs.picksPerCm.value = calc.picksPerCm ?? "";
  if (calc.takeUpPercent != null) inputs.takeUpPercent.value = calc.takeUpPercent;
  if (calc.shrinkagePercent != null) inputs.shrinkagePercent.value = calc.shrinkagePercent;
  if (calc.loomWasteCm != null) inputs.loomWasteCm.value = calc.loomWasteCm;

  const isShaft = project.loomMode === "ShaftLoom" || project.draft?.loomType?.kind === "ShaftLoom";
  const shafts = project.draft?.loomType?.shafts || 4;
  const treadles = project.draft?.loomType?.treadles || 4;
  state.loomMode = isShaft ? "ShaftLoom" : "RigidHeddle";
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === state.loomMode);
  });
  document.getElementById("new-profile-shaft-fields").hidden = !isShaft;
  document.getElementById("threading-shaft-usage-box").hidden = !isShaft;

  editor.loadDraft(project.draft);
  state.checkedSteps = new Set(project.checkedSteps || []);
  recalculate();
  refreshThreadingPlan();
  projectsModalEl.hidden = true;
}

function showProjectToast(msg) {
  projectToastEl.textContent = msg;
  projectToastEl.hidden = false;
  setTimeout(() => {
    projectToastEl.hidden = true;
  }, 2000);
}

document.getElementById("btn-save-project").addEventListener("click", async () => {
  if (!invoke) return;
  const snapshot = buildProjectSnapshot();
  try {
    await invoke("save_project", { project: snapshot });
    showProjectToast(t("projectSavedToast") || "Gespeichert!");
  } catch (err) {
    renderError(typeof err === "string" ? err : "Projekt konnte nicht gespeichert werden.");
  }
});

async function refreshProjectsModalList() {
  if (!invoke) return;
  try {
    const projects = await invoke("list_projects");
    projectsListEl.innerHTML = "";
    if (projects.length === 0) {
      projectsListEl.innerHTML = `<p class="muted">${t("noSavedProjects") || "Noch keine gespeicherten Projekte."}</p>`;
      return;
    }
    projects.forEach((p) => {
      const row = document.createElement("div");
      row.className = "project-row";
      const dateStr = new Date(p.updatedAt).toLocaleString();
      const modeText = p.loomMode === "ShaftLoom" ? "Schaftwebstuhl" : "Gatterkamm";
      row.innerHTML = `
        <div class="project-row-info">
          <strong>${p.name}</strong>
          <small>${modeText} · ${dateStr}</small>
        </div>
        <div class="project-row-actions">
          <button type="button" class="btn-primary btn-open-item">${t("openBtn") || "Öffnen"}</button>
          <button type="button" class="btn-secondary btn-del-item">✕</button>
        </div>
      `;
      row.querySelector(".btn-open-item").addEventListener("click", async () => {
        const full = await invoke("load_project", { id: p.id });
        applyLoadedProject(full);
      });
      row.querySelector(".btn-del-item").addEventListener("click", async () => {
        await invoke("delete_project", { id: p.id });
        refreshProjectsModalList();
      });
      projectsListEl.appendChild(row);
    });
  } catch (err) {
    console.error("Projekte laden fehlgeschlagen:", err);
  }
}

document.getElementById("btn-open-projects").addEventListener("click", () => {
  projectsModalEl.hidden = false;
  refreshProjectsModalList();
});

document.getElementById("btn-close-projects").addEventListener("click", () => {
  projectsModalEl.hidden = true;
});

projectsModalEl.addEventListener("click", (e) => {
  if (e.target === projectsModalEl) projectsModalEl.hidden = true;
});

document.getElementById("btn-export-project").addEventListener("click", () => {
  const snapshot = buildProjectSnapshot();
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = snapshot.name.replace(/[^a-zA-Z0-9_-]+/g, "_");
  a.href = url;
  a.download = `${safeName}.heddle`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("input-import-project").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    applyLoadedProject(parsed);
  } catch {
    alert("Ungültige .heddle Projektdatei.");
  } finally {
    e.target.value = "";
  }
});

// --- GitHub Auto-Updater (Tauri v2 Plugin + Fallback) ---
const APP_VERSION = "0.3.5";
const updateBtn = document.getElementById("btn-check-updates");
const updateStatusEl = document.getElementById("update-status");

function compareVersions(a, b) {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

updateBtn.addEventListener("click", async () => {
  updateStatusEl.hidden = false;
  updateStatusEl.textContent = t("updateChecking");

  // 1. Echter In-App Auto-Updater über tauri-plugin-updater
  const updater = window.__TAURI__?.updater;
  const processApi = window.__TAURI__?.process;
  if (updater?.check) {
    try {
      const update = await updater.check();
      if (!update) {
        updateStatusEl.textContent = t("updateUpToDate");
        return;
      }

      updateStatusEl.innerHTML = `
        <div>${t("updateAvailable").replace("{tag}", `v${update.version}`)}</div>
        <button type="button" id="btn-install-update" class="btn-primary" style="margin-top:6px;width:100%;font-size:0.78rem;">
          ${t("updateInstallBtn") || "Jetzt installieren & neu starten"}
        </button>
      `;

      document.getElementById("btn-install-update").addEventListener("click", async () => {
        let downloaded = 0;
        let total = 0;
        await update.downloadAndInstall((event) => {
          if (event.event === "Started") {
            total = event.data.contentLength || 0;
            updateStatusEl.textContent = (t("updateDownloading") || "Lade Update ({pct}%)...").replace("{pct}", "0");
          } else if (event.event === "Progress") {
            downloaded += event.data.chunkLength || 0;
            const pct = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 50;
            updateStatusEl.textContent = (t("updateDownloading") || "Lade Update ({pct}%)...").replace("{pct}", String(pct));
          } else if (event.event === "Finished") {
            updateStatusEl.textContent = t("updateRestarting") || "Installiert! Starte neu...";
          }
        });
        if (processApi?.relaunch) {
          await processApi.relaunch();
        }
      });
      return;
    } catch (err) {
      console.warn("Native updater fallback:", err);
    }
  }

  // 2. Fallback: GitHub Releases API prüfen & im Browser öffnen
  try {
    const res = await fetch(
      "https://api.github.com/repos/PatrickBarbian/HeddleLab/releases/latest",
      { headers: { Accept: "application/vnd.github+json" } }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const latestTag = data.tag_name || "";

    if (compareVersions(latestTag, APP_VERSION) > 0) {
      updateStatusEl.innerHTML = `${t("updateAvailable").replace("{tag}", latestTag)} · <a href="${data.html_url}" target="_blank" rel="noopener">${t("updateDownloadLink")}</a>`;
    } else {
      updateStatusEl.textContent = t("updateUpToDate");
    }
  } catch {
    updateStatusEl.innerHTML = `${t("updateError")} <a href="https://github.com/PatrickBarbian/HeddleLab/releases" target="_blank" rel="noopener">GitHub Releases</a>`;
  }
});
