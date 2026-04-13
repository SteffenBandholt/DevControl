(function () {
  function esc(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  async function refillProjectSelect() {
    const select = document.getElementById("projectSelect");
    if (!select) return;

    try {
      const response = await fetch("/api/projects", {
        headers: { "Content-Type": "application/json" }
      });

      if (!response.ok) {
        throw new Error("Projekte konnten nicht geladen werden.");
      }

      const cfg = await response.json();
      const projects = Array.isArray(cfg.projects) ? cfg.projects : [];
      const activeId = cfg.activeProjectId || "";

      select.innerHTML = projects.map((project) => {
        const warning = project.validation && project.validation.ok ? "" : " ⚠";
        const selected = project.id === activeId ? " selected" : "";
        return `<option value="${esc(project.id)}"${selected}>${esc(project.name)}${warning}</option>`;
      }).join("");

      if (!select.value && activeId) {
        select.value = activeId;
      }
    } catch (error) {
      console.error("project-select-fix:", error);
    }
  }

  function boot() {
    refillProjectSelect();

    setTimeout(refillProjectSelect, 300);
    setTimeout(refillProjectSelect, 1200);

    setInterval(() => {
      const select = document.getElementById("projectSelect");
      if (select && (!select.options || select.options.length === 0)) {
        refillProjectSelect();
      }
    }, 2000);
  }

  document.addEventListener("DOMContentLoaded", boot);
  window.addEventListener("load", boot);
})();