(function () {
  function byId(id) {
    return document.getElementById(id);
  }

  function setMiniStatus(text, isError = false) {
    const detail = byId("globalStatusDetail");
    const chip = byId("globalStatus");
    if (!detail || !chip) return;

    detail.textContent = text || "";
    chip.className = isError ? "status-chip status-error" : "status-chip status-ready";
    chip.textContent = isError ? "Fehler" : "Bereit";
  }

  async function saveCurrentProjectSelection() {
    const select = byId("projectSelect");
    if (!select) return;

    try {
      setMiniStatus("Aktives Projekt wird gespeichert ...");
      const response = await fetch("/api/projects/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: select.value })
      });

      if (!response.ok) {
        throw new Error("Projekt konnte nicht gespeichert werden.");
      }

      setMiniStatus("Aktives Projekt gespeichert.");
    } catch (error) {
      console.error(error);
      setMiniStatus(error.message || "Projekt speichern fehlgeschlagen.", true);
    }
  }

  async function quitDevControl() {
    const ok = window.confirm("DevControl wirklich beenden?");
    if (!ok) return;

    try {
      setMiniStatus("DevControl wird beendet ...");
      const response = await fetch("/api/quit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });

      if (!response.ok) {
        throw new Error("DevControl konnte nicht beendet werden.");
      }

      setMiniStatus("DevControl wurde beendet. Browserfenster kann geschlossen werden.");
      const quitBtn = byId("quitAppBtn");
      if (quitBtn) quitBtn.disabled = true;
    } catch (error) {
      console.error(error);
      setMiniStatus(error.message || "Beenden fehlgeschlagen.", true);
    }
  }

  function ensureTopbarButtons() {
    const anchor = byId("validateProjectBtn") || byId("setProjectBtn");
    if (!anchor) return;

    const row = anchor.parentElement;
    if (!row) return;

    if (!byId("saveCurrentProjectBtn")) {
      const saveBtn = document.createElement("button");
      saveBtn.id = "saveCurrentProjectBtn";
      saveBtn.type = "button";
      saveBtn.className = "secondary";
      saveBtn.textContent = "Projekt speichern";
      saveBtn.addEventListener("click", saveCurrentProjectSelection);
      row.appendChild(saveBtn);
    }

    if (!byId("quitAppBtn")) {
      const quitBtn = document.createElement("button");
      quitBtn.id = "quitAppBtn";
      quitBtn.type = "button";
      quitBtn.className = "danger";
      quitBtn.textContent = "Beenden";
      quitBtn.addEventListener("click", quitDevControl);
      row.appendChild(quitBtn);
    }
  }

  function boot() {
    ensureTopbarButtons();
    setTimeout(ensureTopbarButtons, 400);
    setTimeout(ensureTopbarButtons, 1200);
  }

  document.addEventListener("DOMContentLoaded", boot);
  window.addEventListener("load", boot);
})();