
let selectedPackageId = null;
let plannerDraft = null;
let currentMeta = null;
let busyCount = 0;
let currentPackageDetail = null;
let currentQuickReview = null;

const DEFAULT_TIMEOUT_MS = 25000;

async function api(url, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {}, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { "Content-Type": "application/json", ...headers },
      signal: controller.signal,
      ...rest
    });

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (_error) {
      data = { raw };
    }

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Zeitüberschreitung nach ${Math.round(timeoutMs / 1000)}s. Bitte erneut versuchen.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function setStatus(kind, detail) {
  const chip = document.getElementById("globalStatus");
  chip.className = `status-chip status-${kind}`;
  chip.textContent = kind === "working" ? "Arbeitet ..." : kind === "error" ? "Fehler" : "Bereit";
  document.getElementById("globalStatusDetail").textContent = detail || (kind === "ready" ? "Keine laufende Aktion." : "");
}

const busyButtonState = new Map();

function setBusyButtons(buttonIds = [], isBusy = false) {
  buttonIds.forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    if (isBusy) {
      if (!busyButtonState.has(id)) {
        busyButtonState.set(id, btn.textContent);
      }
      btn.disabled = true;
      btn.classList.add("is-busy");
      const busyLabel = btn.dataset.busyLabel || "Arbeitet ...";
      btn.textContent = busyLabel;
    } else {
      const original = busyButtonState.get(id);
      if (original) btn.textContent = original;
      btn.disabled = false;
      btn.classList.remove("is-busy");
      busyButtonState.delete(id);
    }
  });
}

function setWorkspaceOverlay(show, text = "Bitte warten.") {
  const overlay = document.getElementById("workspaceBusyOverlay");
  const label = document.getElementById("workspaceBusyText");
  if (!overlay || !label) return;
  label.textContent = text;
  overlay.classList.toggle("hidden", !show);
}

function beginBusy(detail, buttonIds = [], workspaceText = "") {
  busyCount += 1;
  setStatus("working", detail);
  setBusyButtons(buttonIds, true);
  const visibleText = workspaceText || detail || "Bitte warten.";
  showWorkspaceNotice(visibleText, "working");
  setWorkspaceOverlay(true, visibleText);
}

function endBusy(successText = "Fertig.", buttonIds = [], error = null) {
  busyCount = Math.max(0, busyCount - 1);
  setBusyButtons(buttonIds, false);
  if (busyCount === 0) {
    setWorkspaceOverlay(false);
  }
  if (error) {
    setStatus("error", error.message || String(error));
    showWorkspaceNotice(error.message || String(error), "error");
    return;
  }
  setStatus("ready", successText);
  if (successText) showWorkspaceNotice(successText, "success");
}

function showWorkspaceNotice(text, type = "working") {
  const el = document.getElementById("workspaceNotice");
  el.className = `inline-status ${type === "working" ? "" : type}`.trim();
  el.textContent = text;
  el.classList.remove("hidden");
}

function clearWorkspaceNotice() {
  const el = document.getElementById("workspaceNotice");
  el.classList.add("hidden");
  el.textContent = "";
  el.className = "inline-status hidden";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderList(items) {
  if (!items || !items.length) return `<div class="muted">-</div>`;
  return `<ul>${items.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`;
}

function renderInlineList(items) {
  if (!items || !items.length) return `<span class="muted">-</span>`;
  return items.map((x) => `<span class="inline-chip">${escapeHtml(x)}</span>`).join(" ");
}


function renderCompactReviewList(items) {
  if (!items || !items.length) return `<span class="muted">-</span>`;
  return `<ul class="quick-review-list">${items.map((item) => `<li>${escapeHtml(String(item))}</li>`).join("")}</ul>`;
}

function buildCompactReview(detail) {
  const pkg = detail?.pkg || {};
  const reviews = detail?.reviews || [];
  const runs = detail?.runs || [];
  const report = pkg.packageReport || {};
  const currentStep = (pkg.internalSteps || []).find((s) => s.status === "planned" || s.status === "running");

  let verdict = "offen";
  if (pkg.blockedReason || pkg.status === "blocked") {
    verdict = "blockiert";
  } else if (pkg.finalVerdict) {
    verdict = pkg.finalVerdict;
  } else if (pkg.status === "finished") {
    verdict = "gut";
  } else if (pkg.status === "running") {
    verdict = "in Arbeit";
  } else if (runs.length > 0) {
    verdict = "teilweise gut";
  }

  const achieved = (report.achieved || []).slice(0, 3);
  const risks = [];
  (report.risks || []).slice(0, 3).forEach((x) => risks.push(x));
  if (pkg.blockedReason) risks.unshift(pkg.blockedReason);
  if (!runs.length) risks.push("Noch kein Lauf protokolliert.");

  const uniqueRisks = [...new Set(risks)].slice(0, 3);
  const nextStep = currentStep?.title || (pkg.status === "finished" ? "Folgepaket ableiten" : "Paket starten");
  const decision = pkg.status === "finished" ? "weiter planen" : (pkg.blockedReason ? "korrigieren" : "weiter / starten");

  return {
    verdict,
    decision,
    achieved,
    risks: uniqueRisks,
    nextStep,
    reviewCount: reviews.length,
    runCount: runs.length
  };
}

function renderCompactReview() {
  const wrap = document.getElementById("workspaceContent");
  if (!wrap || !currentPackageDetail || wrap.classList.contains("empty-state")) return;

  const old = document.getElementById("compactReviewBox");
  if (old) old.remove();

  const review = currentQuickReview;
  const html = review ? `
    <div id="compactReviewBox" class="quick-review-box">
      <h3>Bewertung kompakt</h3>
      <div class="quick-review-grid">
        <div class="quick-review-label">Urteil</div>
        <div class="quick-review-value"><strong>${escapeHtml(review.verdict)}</strong></div>

        <div class="quick-review-label">Empfehlung</div>
        <div class="quick-review-value">${escapeHtml(review.decision)}</div>

        <div class="quick-review-label">Erreicht</div>
        <div class="quick-review-value">${renderCompactReviewList(review.achieved)}</div>

        <div class="quick-review-label">Risiken</div>
        <div class="quick-review-value">${renderCompactReviewList(review.risks)}</div>

        <div class="quick-review-label">NÃ¤chster Schritt</div>
        <div class="quick-review-value">${escapeHtml(review.nextStep)}</div>

        <div class="quick-review-label">Verlauf</div>
        <div class="quick-review-value">${escapeHtml(String(review.reviewCount))} Reviews Â· ${escapeHtml(String(review.runCount))} Runs</div>
      </div>
    </div>
  ` : `
    <div id="compactReviewBox" class="quick-review-box">
      <h3>Bewertung kompakt</h3>
      <div class="muted">Noch keine Bewertung. Klicke auf <strong>Paket bewerten</strong>.</div>
    </div>
  `;

  wrap.insertAdjacentHTML("afterbegin", html);
}

async function reviewSelectedPackage() {
  if (!currentPackageDetail) return;
  currentQuickReview = buildCompactReview(currentPackageDetail);
  renderPackageWorkspace(currentPackageDetail.pkg, currentPackageDetail.reviews || [], currentPackageDetail.runs || []);
}
function renderValidation(validation, meta = {}) {
  if (!validation) return `<div class="muted">Keine Prüfung vorhanden.</div>`;
  return `
    <div class="validation-box ${validation.ok ? "validation-ok" : "validation-bad"}">
      <div><strong>Projektprüfung:</strong> ${validation.ok ? "ok" : "fehlerhaft"}</div>
      <div class="muted">Pfad: ${escapeHtml(meta.projectPath || meta.project?.projectPath || "-")}</div>
      <div class="muted">Agents: ${escapeHtml(meta.agentsFile || meta.project?.agentsFile || "-")}</div>
      <div><strong>Hinweise:</strong> ${renderInlineList(validation.info)}</div>
      <div><strong>Probleme:</strong> ${renderInlineList(validation.issues)}</div>
    </div>
  `;
}

function renderStepTable(steps) {
  if (!steps || !steps.length) return `<div class="muted">Noch keine Schritte.</div>`;
  return steps.map((s) => `
    <div class="pre"><strong>#${s.order} ${escapeHtml(s.title)}</strong>
Status: ${escapeHtml(s.status)}
${escapeHtml(s.instructions)}</div>
  `).join("");
}

function getPackageFormPayload() {
  return {
    goalText: document.getElementById("goalText").value,
    packageType: document.getElementById("packageType").value,
    priority: document.getElementById("priority").value,
    strictness: document.getElementById("strictness").value,
    hardConstraints: document.getElementById("hardConstraints").value
  };
}

function updateToolbarSummary(meta) {
  const validation = meta.projectValidation || { ok: false, issues: [] };
  document.getElementById("projectSummary").innerHTML = `
    Aktiv: <strong>${escapeHtml(meta.projectName || "-")}</strong> ·
    Pfad: ${escapeHtml(meta.projectPath || "-")} ·
    Projekt: ${validation.ok ? '<span class="ok">ok</span>' : '<span class="bad">prüfen</span>'} ·
    OpenAI: ${meta.openaiConfigured ? 'aktiv' : 'nicht konfiguriert'}
  `;
}

async function loadMeta() {
  currentMeta = await api("/api/meta", { timeoutMs: 10000 });
  updateToolbarSummary(currentMeta);
  document.getElementById("projectValidationBox").innerHTML = renderValidation(currentMeta.projectValidation, currentMeta);
}

async function loadProjects() {
  const config = await api("/api/projects", { timeoutMs: 10000 });
  const select = document.getElementById("projectSelect");
  select.innerHTML = (config.projects || []).map((project) => `
    <option value="${escapeHtml(project.id)}" ${project.id === config.activeProjectId ? "selected" : ""}>${escapeHtml(project.name)}${project.validation?.ok ? "" : " ⚠"}</option>
  `).join("");
}

async function activateProject() {
  try {
    beginBusy("Projekt wird aktiviert ...", ["setProjectBtn"], "Projekt wird aktiviert ...");
    const projectId = document.getElementById("projectSelect").value;
    await api("/api/projects/active", {
      timeoutMs: 15000,
      method: "POST",
      body: JSON.stringify({ projectId })
    });
    plannerDraft = null;
    selectedPackageId = null;
    document.getElementById("runPackageBtn").disabled = true;
    document.getElementById("refreshSelectedBtn").disabled = true;
    await loadMeta();
    await loadPackages();
    renderWorkspaceEmpty("Paketansicht", "Projekt aktiviert. Links ein Paket auswählen oder oben ein neues Paket planen.");
    endBusy("Projekt aktiviert.", ["setProjectBtn"]);
  } catch (error) {
    endBusy("", ["setProjectBtn"], error);
  }
}

async function validateActiveProject() {
  try {
    beginBusy("Projektprüfung läuft ...", ["validateProjectBtn"], "Projektprüfung läuft ...");
    const data = await api("/api/projects/active/validate", { timeoutMs: 15000 });
    document.getElementById("projectValidationBox").innerHTML = renderValidation(data.validation, data.project || {});
    await loadProjects();
    await loadMeta();
    endBusy(data.validation?.ok ? "Projektprüfung erfolgreich." : "Projektprüfung meldet Probleme.", ["validateProjectBtn"]);
  } catch (error) {
    endBusy("", ["validateProjectBtn"], error);
  }
}


async function saveCurrentProjectSelection() {
  // Unified activation path: delegate to activateProject()
  try {
    await activateProject();
  } catch (error) {
    // activateProject handles busy state and errors
  }
}

async function quitDevControl() {
  const ok = window.confirm("DevControl wirklich beenden?");
  if (!ok) return;

  try {
    beginBusy("DevControl wird beendet ...", ["quitAppBtn"], "DevControl wird beendet ...");
    await api("/api/quit", {
      timeoutMs: 8000,
      method: "POST",
      body: "{}"
    });

    busyCount = 0;
    setBusyButtons(["quitAppBtn"], false);
    setWorkspaceOverlay(false);
    setStatus("ready", "DevControl wurde beendet.");
    showWorkspaceNotice("DevControl wurde beendet. Dieses Browserfenster kann jetzt geschlossen werden.", "success");

    const quitBtn = document.getElementById("quitAppBtn");
    if (quitBtn) quitBtn.disabled = true;
  } catch (error) {
    endBusy("", ["quitAppBtn"], error);
  }
}

function ensureProjectActionButtons() {
  const validateBtn = document.getElementById("validateProjectBtn");
  const setBtn = document.getElementById("setProjectBtn");
  const anchor = validateBtn || setBtn;
  if (!anchor) return;

  const row = anchor.parentElement || anchor.closest(".compact-row") || anchor.closest(".toolbar-main") || anchor.parentElement;
  if (!row) return;

  if (!document.getElementById("saveCurrentProjectBtn")) {
    const saveBtn = document.createElement("button");
    saveBtn.id = "saveCurrentProjectBtn";
    saveBtn.className = "secondary";
    saveBtn.type = "button";
    saveBtn.textContent = "Projekt speichern";
    row.appendChild(saveBtn);
    saveBtn.addEventListener("click", saveCurrentProjectSelection);
  }

  if (!document.getElementById("quitAppBtn")) {
    const quitBtn = document.createElement("button");
    quitBtn.id = "quitAppBtn";
    quitBtn.className = "danger";
    quitBtn.type = "button";
    quitBtn.textContent = "Beenden";
    row.appendChild(quitBtn);
    quitBtn.addEventListener("click", quitDevControl);
  }
}

async function addProject(event) {
  event.preventDefault();
  try {
    beginBusy("Projekt wird gespeichert ...", ["saveProjectBtn"], "Projekt wird gespeichert ...");
    await api("/api/projects", {
      timeoutMs: 15000,
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("projectName").value,
        projectPath: document.getElementById("projectPath").value,
        agentsFile: document.getElementById("agentsFile").value,
        protectedAreas: document.getElementById("protectedAreas").value,
        defaultConstraints: document.getElementById("defaultConstraints").value,
        defaultPackageType: "refactor"
      })
    });
    event.target.reset();
    document.getElementById("projectFormWrap").classList.add("hidden");
    await loadProjects();
    await loadMeta();
    endBusy("Projekt gespeichert.", ["saveProjectBtn"]);
  } catch (error) {
    endBusy("", ["saveProjectBtn"], error);
  }
}

async function loadPackages() {
  const packages = await api("/api/packages", { timeoutMs: 10000 });
  const list = document.getElementById("packageList");
  if (!packages.length) {
    list.innerHTML = `<div class="muted">Noch keine Pakete vorhanden.</div>`;
    return;
  }

  list.innerHTML = packages.map((pkg) => `
    <div class="package-row ${pkg.id === selectedPackageId ? "active" : ""}" data-package-id="${pkg.id}">
      <div class="package-top">
        <div class="package-title">${escapeHtml(pkg.packageName || pkg.rawGoal || pkg.id)}</div>
        <span class="badge status-${escapeHtml(pkg.status)}">${escapeHtml(pkg.status)}</span>
      </div>
      <div class="package-meta">${escapeHtml(pkg.packageType || "-")} · ${escapeHtml(pkg.priority || "-")} · ${escapeHtml(pkg.strictness || "-")}</div>
      <div>
        ${pkg.finalVerdict ? `<span class="badge">${escapeHtml(pkg.finalVerdict)}</span>` : ""}
      </div>
    </div>
  `).join("");

  list.querySelectorAll(".package-row").forEach((row) => {
    row.addEventListener("click", () => showPackage(row.dataset.packageId));
  });
}

function renderWorkspaceEmpty(title, hint) {
  clearWorkspaceNotice();
  setWorkspaceOverlay(false);
  document.getElementById("workspaceTitle").textContent = title || "Paketansicht";
  document.getElementById("workspaceHint").textContent = hint || "";
  document.getElementById("workspaceContent").className = "workspace-content empty-state";
  document.getElementById("workspaceContent").innerHTML = escapeHtml(hint || "Noch kein Paket ausgewählt.");
  document.getElementById("runPackageBtn").disabled = true;
    document.getElementById("refreshSelectedBtn").disabled = !selectedPackageId;
    const reviewBtn = document.getElementById("reviewPackageBtn");
    if (reviewBtn) reviewBtn.disabled = true;
    currentPackageDetail = null;
    currentQuickReview = null;
}

function renderPackageWorkspace(pkg, reviews, runs) {
  const report = pkg.packageReport || {};
  const currentStep = (pkg.internalSteps || []).find((s) => s.status === "planned" || s.status === "running");
  document.getElementById("workspaceTitle").textContent = pkg.packageName || "Paketansicht";
  document.getElementById("workspaceHint").textContent = pkg.rawGoal || "";
  document.getElementById("workspaceContent").className = "workspace-content";
  document.getElementById("workspaceContent").innerHTML = `
    <div class="compact-actions">
      <span class="badge status-${escapeHtml(pkg.status)}">${escapeHtml(pkg.status)}</span>
      <span class="badge">${escapeHtml(pkg.packageType || "-")}</span>
      <span class="badge">${escapeHtml(pkg.priority || "-")}</span>
      <span class="badge">${escapeHtml(pkg.strictness || "-")}</span>
      <span class="muted">Projekt: ${escapeHtml(pkg.projectName || "-")}</span>
    </div>

    <div class="summary-grid">
      <div class="summary-card">
        <h3>Ziel</h3>
        ${renderList(pkg.goal)}
      </div>
      <div class="summary-card">
        <h3>Scope</h3>
        ${renderList(pkg.scope)}
      </div>
      <div class="summary-card">
        <h3>Nicht anfassen</h3>
        ${renderList(pkg.doNotTouch)}
      </div>
      <div class="summary-card">
        <h3>Nächster Schritt</h3>
        ${currentStep ? `<div class="pre"><strong>${escapeHtml(currentStep.title)}</strong>

${escapeHtml(currentStep.instructions)}</div>` : `<div class="muted">Kein geplanter Schritt offen.</div>`}
      </div>
    </div>

    <div class="section-block">
      <h3>Erfolgskriterien</h3>
      ${renderList(pkg.successCriteria)}
    </div>

    <div class="section-block">
      <h3>Bericht</h3>
      <div><strong>Summary:</strong> ${escapeHtml(pkg.finalSummary || pkg.summary || "-")}</div>
      ${pkg.blockedReason ? `<div><strong>Blockierung:</strong> ${escapeHtml(pkg.blockedReason)}</div>` : ""}
      <div><strong>Erreicht:</strong> ${renderList(report.achieved)}</div>
      <div><strong>Nicht erreicht:</strong> ${renderList(report.notAchieved)}</div>
      <div><strong>Regelverstöße:</strong> ${renderList(report.ruleViolations)}</div>
      <div><strong>Risiken:</strong> ${renderList(report.risks)}</div>
    </div>

    <div class="section-block">
      <h3>Schritte</h3>
      ${renderStepTable(pkg.internalSteps || [])}
    </div>

    <div class="section-block">
      <h3>Verlauf</h3>
      <div><strong>Reviews:</strong> ${reviews.length}</div>
      <div><strong>Runs:</strong> ${runs.length}</div>
      ${reviews.length ? reviews.map((r) => `
        <div class="pre"><strong>${escapeHtml(r.decision)}</strong> / ${escapeHtml(r.verdict)}
Erreicht: ${(r.achieved || []).join("; ")}
Nicht erreicht: ${(r.notAchieved || []).join("; ")}
Risiken: ${(r.risks || []).join("; ")}
Nächster Schritt: ${escapeHtml(r.nextStepTitle || "-")}</div>
      `).join("") : '<div class="muted">Noch keine Reviews.</div>'}
      ${runs.length ? runs.map((run) => `
        <div class="pre"><strong>${escapeHtml(run.status)}</strong>
Prompt:
${escapeHtml(run.prompt || "")}

Output:
${escapeHtml((run.output || "").slice(0, 1800))}

Error:
${escapeHtml(run.error || "")}</div>
      `).join("") : '<div class="muted" style="margin-top:8px">Noch keine Runs.</div>'}
    </div>
  `;

  document.getElementById("runPackageBtn").disabled = false;
  document.getElementById("refreshSelectedBtn").disabled = false;
}

async function showPackage(packageId) {
  try {
    selectedPackageId = packageId;
    beginBusy("Paket wird geladen ...", ["refreshSelectedBtn", "runPackageBtn"], "Paket wird geladen ...");
    const detail = await api(`/api/packages/${packageId}`, { timeoutMs: 15000 });
      currentPackageDetail = detail;
      currentQuickReview = null;
    await loadPackages();
    renderPackageWorkspace(detail.pkg, detail.reviews, detail.runs);
      const reviewBtn = document.getElementById("reviewPackageBtn");
      if (reviewBtn) reviewBtn.disabled = false;
      renderCompactReview();
    endBusy("Paket geladen.", ["refreshSelectedBtn", "runPackageBtn"]);
  } catch (error) {
    endBusy("", ["refreshSelectedBtn", "runPackageBtn"], error);
  }
}

async function runSelectedPackage() {
  if (!selectedPackageId) return;
  try {
    beginBusy("Paket läuft ...", ["runPackageBtn", "refreshSelectedBtn"], "Paket läuft ... bitte warten");
    await api(`/api/packages/${selectedPackageId}/run`, { method: "POST", body: "{}", timeoutMs: 45000 });
    await loadPackages();
    await showPackage(selectedPackageId);
    endBusy("Paketlauf abgeschlossen.", ["runPackageBtn", "refreshSelectedBtn"]);
  } catch (error) {
    endBusy("", ["runPackageBtn", "refreshSelectedBtn"], error);
  }
}

async function previewPlanner(event) {
  event.preventDefault();
  try {
    beginBusy("Planner erstellt Vorschlag ...", ["previewPlannerBtn", "acceptPlannerBtn", "clearPlannerBtn"], "Planner erstellt Vorschlag ...");
    plannerDraft = await api("/api/planner/preview", {
      timeoutMs: 30000,
      method: "POST",
      body: JSON.stringify(getPackageFormPayload())
    });
    selectedPackageId = null;
    renderPlannerPreview();
    endBusy("Vorschlag bereit.", ["previewPlannerBtn", "acceptPlannerBtn", "clearPlannerBtn"]);
  } catch (error) {
    endBusy("", ["previewPlannerBtn", "acceptPlannerBtn", "clearPlannerBtn"], error);
  }
}

async function acceptPlannerDraft() {
  if (!plannerDraft) {
    showWorkspaceNotice("Erst einen Paketvorschlag erzeugen.", "error");
    return;
  }
  try {
    beginBusy("Paket wird gespeichert ...", ["acceptPlannerBtn", "clearPlannerBtn", "previewPlannerBtn"], "Paket wird gespeichert ...");
    const pkg = await api("/api/packages", {
      timeoutMs: 20000,
      method: "POST",
      body: JSON.stringify({ plannerDraft })
    });
    plannerDraft = null;
    document.getElementById("goalText").value = "";
    document.getElementById("hardConstraints").value = "";
    document.getElementById("composerWrap").classList.add("hidden");
    await loadPackages();
    await showPackage(pkg.id);
    endBusy("Paket gespeichert.", ["acceptPlannerBtn", "clearPlannerBtn", "previewPlannerBtn"]);
  } catch (error) {
    endBusy("", ["acceptPlannerBtn", "clearPlannerBtn", "previewPlannerBtn"], error);
  }
}

function clearPlannerDraft() {
  plannerDraft = null;
  renderWorkspaceEmpty("Paketansicht", "Vorschlag verworfen. Links ein Paket auswählen oder oben ein neues Paket planen.");
  document.getElementById("acceptPlannerBtn").disabled = true;
  document.getElementById("clearPlannerBtn").disabled = true;
  showWorkspaceNotice("Vorschlag verworfen.", "success");
}

function renderPlannerPreview() {
  const acceptBtn = document.getElementById("acceptPlannerBtn");
  const clearBtn = document.getElementById("clearPlannerBtn");
  if (!plannerDraft) {
    acceptBtn.disabled = true;
    clearBtn.disabled = true;
    renderWorkspaceEmpty("Paketansicht", "Links ein Paket auswählen oder oben ein neues Paket planen.");
    return;
  }

  acceptBtn.disabled = false;
  clearBtn.disabled = false;
  document.getElementById("workspaceTitle").textContent = "Paketvorschlag";
  document.getElementById("workspaceHint").textContent = "Erst prüfen, dann übernehmen.";
  document.getElementById("workspaceContent").className = "workspace-content";
  document.getElementById("workspaceContent").innerHTML = `
    <div class="compact-actions">
      <span class="badge">${escapeHtml(plannerDraft.packageType)}</span>
      <span class="badge">${escapeHtml(plannerDraft.priority)}</span>
      <span class="badge">${escapeHtml(plannerDraft.strictness)}</span>
      <span class="muted">Quelle: ${escapeHtml(plannerDraft.source || "planner")}</span>
    </div>

    <div class="summary-grid">
      <div class="summary-card">
        <h3>Paket</h3>
        <div><strong>${escapeHtml(plannerDraft.packageName)}</strong></div>
        <div class="muted" style="margin-top:8px">${escapeHtml(plannerDraft.summary || "-")}</div>
      </div>
      <div class="summary-card">
        <h3>Erster Schritt</h3>
        <div class="pre"><strong>${escapeHtml(plannerDraft.nextStep?.title || "-")}</strong>

${escapeHtml(plannerDraft.nextStep?.instructions || "-")}</div>
      </div>
    </div>

    <div class="section-block"><h3>Ziel</h3>${renderList(plannerDraft.goal)}</div>
    <div class="section-block"><h3>Scope</h3>${renderList(plannerDraft.scope)}</div>
    <div class="section-block"><h3>Nicht anfassen</h3>${renderList(plannerDraft.doNotTouch)}</div>
    <div class="section-block"><h3>Regeln</h3>${renderList(plannerDraft.constraints)}</div>
    <div class="section-block"><h3>Erfolgskriterien</h3>${renderList(plannerDraft.successCriteria)}</div>
    <div class="section-block"><h3>Abbruchkriterien</h3>${renderList(plannerDraft.abortCriteria)}</div>
  `;

  document.getElementById("runPackageBtn").disabled = true;
  document.getElementById("refreshSelectedBtn").disabled = true;
}

function toggleProjectForm() {
  document.getElementById("projectFormWrap").classList.toggle("hidden");
}

function toggleComposer() {
  document.getElementById("composerWrap").classList.toggle("hidden");
}

async function refreshSelectedPackage() {
  if (!selectedPackageId) return;
  await showPackage(selectedPackageId);
}

// --- Simple server-backed file/folder picker (minimal) ---
let fsPickerState = null;

function createFsPicker() {
  if (document.getElementById("fsPickerOverlay")) return document.getElementById("fsPickerOverlay");
  const overlay = document.createElement("div");
  overlay.id = "fsPickerOverlay";
  overlay.style = `position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);z-index:1200;`;
  overlay.innerHTML = `
    <div style="width:720px;max-width:94%;background:#fff;padding:12px;border-radius:6px;box-shadow:0 6px 24px rgba(0,0,0,0.25);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong id="fsPickerTitle">Datei wählen</strong>
        <div>
          <button id="fsPickerUpBtn" class="secondary">Up</button>
          <button id="fsPickerCancelBtn" class="secondary">Abbrechen</button>
          <button id="fsPickerAcceptBtn" class="primary">Übernehmen</button>
        </div>
      </div>
      <div id="fsPickerPath" style="font-size:12px;color:#444;margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>
      <div id="fsPickerList" style="max-height:360px;overflow:auto;border:1px solid #eee;padding:8px;border-radius:4px;background:#fafafa"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector("#fsPickerCancelBtn").addEventListener("click", () => closeFsPicker());
  overlay.querySelector("#fsPickerUpBtn").addEventListener("click", () => {
    if (!fsPickerState || !fsPickerState.currentPath) return;
    const up = fsPickerState.currentPath.replace(/[\\/][^\\/]+$/,'');
    if (up && up !== fsPickerState.currentPath) loadFsPath(up);
  });
  overlay.querySelector("#fsPickerAcceptBtn").addEventListener("click", () => acceptFsPicker());

  return overlay;
}

function closeFsPicker() {
  const el = document.getElementById("fsPickerOverlay");
  if (el) el.remove();
  fsPickerState = null;
}

async function openFsPicker(mode, targetInputId) {
  fsPickerState = { mode, targetInputId, currentPath: null, selectedPath: null };
  const overlay = createFsPicker();
  const initial = document.getElementById(targetInputId)?.value || "";
  if (initial) await loadFsPath(initial);
  else await loadFsPath("");
  overlay.style.display = "flex";
}

async function loadFsPath(p) {
  const listEl = document.getElementById("fsPickerList");
  const pathEl = document.getElementById("fsPickerPath");
  listEl.innerHTML = "Lade...";
  pathEl.textContent = p || "(Wurzel)";
  fsPickerState.currentPath = p || "";
  try {
    const resp = await fetch(`/api/fs/list?path=${encodeURIComponent(p || "")}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Fehler beim Lesen");
    const entries = data.entries || [];
    listEl.innerHTML = "";
    // directories first
    entries.sort((a,b)=> (a.type===b.type? a.name.localeCompare(b.name) : (a.type==='dir'? -1:1)));
    entries.forEach((it) => {
      const row = document.createElement("div");
      row.style = "padding:6px;border-bottom:1px solid #f1f1f1;display:flex;justify-content:space-between;align-items:center;";
      const left = document.createElement("div");
      left.textContent = it.name + (it.type==='dir'? ' /' : '');
      left.style.cursor = 'pointer';
      left.addEventListener('click', () => {
        if (it.type === 'dir') {
          loadFsPath(it.path);
        } else if (fsPickerState.mode === 'file') {
          fsPickerState.selectedPath = it.path;
          // highlight selection
          listEl.querySelectorAll('.fs-selected').forEach(el=>el.classList.remove('fs-selected'));
          row.classList.add('fs-selected');
        }
      });
      const right = document.createElement('div');
      right.style.fontSize='12px';
      right.style.color='#666';
      right.textContent = it.type;
      row.appendChild(left);
      row.appendChild(right);
      listEl.appendChild(row);
    });
    if (entries.length === 0) listEl.innerHTML = '<div class="muted">(Keine Einträge)</div>';
  } catch (err) {
    listEl.innerHTML = `<div style="color:#900">${escapeHtml(String(err.message || err))}</div>`;
  }
}

function acceptFsPicker() {
  if (!fsPickerState) return;
  const { mode, targetInputId, currentPath, selectedPath } = fsPickerState;
  const target = document.getElementById(targetInputId);
  if (!target) return closeFsPicker();

  if (mode === 'dir') {
    // accept currentPath (must be directory) or selectedPath if it's a dir
    const val = currentPath || selectedPath || '';
    if (!val) return showWorkspaceNotice('Kein Verzeichnis ausgewählt.', 'error');
    target.value = val;
  } else {
    if (!selectedPath) return showWorkspaceNotice('Bitte eine Datei auswählen.', 'error');
    target.value = selectedPath;
  }
  closeFsPicker();
}


document.getElementById("packageForm").addEventListener("submit", previewPlanner);
document.getElementById("acceptPlannerBtn").addEventListener("click", acceptPlannerDraft);
document.getElementById("clearPlannerBtn").addEventListener("click", clearPlannerDraft);
document.getElementById("projectForm").addEventListener("submit", addProject);
document.getElementById("setProjectBtn").addEventListener("click", activateProject);
document.getElementById("validateProjectBtn").addEventListener("click", validateActiveProject);
const chooseProjectPathBtn = document.getElementById("chooseProjectPathBtn");
if (chooseProjectPathBtn) chooseProjectPathBtn.addEventListener("click", () => openFsPicker('dir', 'projectPath'));
const chooseAgentsFileBtn = document.getElementById("chooseAgentsFileBtn");
if (chooseAgentsFileBtn) chooseAgentsFileBtn.addEventListener("click", () => openFsPicker('file', 'agentsFile'));
document.getElementById("toggleProjectFormBtn").addEventListener("click", toggleProjectForm);
document.getElementById("toggleComposerBtn").addEventListener("click", toggleComposer);
document.getElementById("reloadPackagesBtn").addEventListener("click", async () => {
  try {
    beginBusy("Paketliste wird aktualisiert ...", ["reloadPackagesBtn"], "Paketliste wird aktualisiert ...");
    await loadPackages();
    endBusy("Paketliste aktualisiert.", ["reloadPackagesBtn"]);
  } catch (error) {
    endBusy("", ["reloadPackagesBtn"], error);
  }
});
document.getElementById("runPackageBtn").addEventListener("click", runSelectedPackage);
  const reviewPackageBtn = document.getElementById("reviewPackageBtn");
  if (reviewPackageBtn) reviewPackageBtn.addEventListener("click", reviewSelectedPackage);
document.getElementById("refreshSelectedBtn").addEventListener("click", refreshSelectedPackage);

(async function init() {
  try {
    setStatus("ready", "DevControl wird geladen ...");
      ensureProjectActionButtons();
    await loadProjects();
    await loadMeta();
    await loadPackages();
    renderWorkspaceEmpty("Paketansicht", "Links ein Paket auswählen oder oben ein neues Paket planen.");
    setStatus("ready", "DevControl bereit.");
  } catch (error) {
    setStatus("error", error.message);
    renderWorkspaceEmpty("Fehler", error.message);
    showWorkspaceNotice(error.message, "error");
  }
})();





