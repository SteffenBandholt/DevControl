const express = require("express");
const path = require("path");
const fs = require("fs");
const { loadEnv } = require("./config");
const {
  loadRulesBundle,
  loadProjectsConfig,
  addProject,
  setActiveProject,
  validateProjectProfile,
  slugify,
  getActiveProject
} = require("./rulesLoader");
const { planPackageDraft, buildPackageFromDraft } = require("./planner");
const { runPackage } = require("./packageLoop");
const { reviewPackagePlan } = require("./planReviewer");
const {
  savePackage,
  loadPackage,
  listPackages,
  listReviewsForPackage,
  listRunsForPackage,
  loadState,
  saveState,
  saveReview
} = require("./storage");
const { normalizeMultilineToArray, nowIso } = require("./utils");

const root = path.resolve(__dirname, "..");
loadEnv(root);

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(root, "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, timestamp: nowIso() });
});

app.get("/api/meta", (_req, res) => {
  const rulesBundle = loadRulesBundle(root);
  res.json({
    activeProjectId: rulesBundle.projectsConfig.activeProjectId,
    projectName: rulesBundle.projectProfile?.name || "-",
    projectPath: rulesBundle.projectProfile?.projectPath || "-",
    agentsFile: rulesBundle.projectProfile?.agentsFile || "-",
    defaultConstraints: rulesBundle.projectProfile?.defaultConstraints || [],
    protectedAreas: rulesBundle.projectProfile?.protectedAreas || [],
    projectValidation: rulesBundle.projectValidation,
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    port: process.env.PORT || rulesBundle.appSettings.serverPort || 3210
  });
});

app.get("/api/projects", (_req, res) => {
  const config = loadProjectsConfig(root);
  const enriched = {
    activeProjectId: config.activeProjectId,
    projects: config.projects.map((project) => ({
      ...project,
      validation: validateProjectProfile(project)
    }))
  };
  res.json(enriched);
});

app.post("/api/projects", (req, res) => {
  try {
    const projectPath = String(req.body.projectPath || "").trim();
    const agentsFile = String(req.body.agentsFile || "").trim();

    if (projectPath) {
      try {
        const st = fs.statSync(projectPath);
        if (!st.isDirectory()) return res.status(400).json({ error: "Projektpfad ist kein Verzeichnis." });
      } catch (err) {
        return res.status(400).json({ error: "Projektpfad existiert nicht oder ist nicht zugreifbar." });
      }
    }

    if (agentsFile) {
      try {
        const st = fs.statSync(agentsFile);
        if (!st.isFile()) return res.status(400).json({ error: "Agents-Pfad ist keine Datei." });
      } catch (err) {
        return res.status(400).json({ error: "Agents-Datei existiert nicht oder ist nicht zugreifbar." });
      }
    }

    // Prevent duplicate projects by projectPath, agentsFile, name or stable id
    try {
      const cfg = loadProjectsConfig(root);
      const newName = String(req.body.name || "").trim();
      const normalizePath = (p) => {
        try {
          let r = path.resolve(String(p || ""));
          if (process.platform === "win32") r = r.toLowerCase();
          return r.replace(/[\\/]+$/g, "");
        } catch {
          return String(p || "");
        }
      };
      const newPathNorm = projectPath ? normalizePath(projectPath) : null;
      const newAgentsNorm = agentsFile ? normalizePath(agentsFile) : null;
      const newIdCandidate = slugify(newName || "");

      if (newPathNorm) {
        const dup = cfg.projects.find((p) => p.projectPath && normalizePath(p.projectPath) === newPathNorm);
        if (dup) return res.status(400).json({ error: "Projekt mit diesem Pfad existiert bereits." });
      }

      if (newAgentsNorm) {
        const dupA = cfg.projects.find((p) => p.agentsFile && normalizePath(p.agentsFile) === newAgentsNorm);
        if (dupA) return res.status(400).json({ error: "Projekt mit dieser Agents.md existiert bereits." });
      }

      if (newName) {
        const dupName = cfg.projects.find((p) => String(p.name || "").toLowerCase() === newName.toLowerCase());
        const dupId = cfg.projects.find((p) => String(p.id || "").toLowerCase() === newIdCandidate.toLowerCase());
        if (dupName || dupId) return res.status(400).json({ error: "Projekt mit diesem Namen oder ID existiert bereits." });
      }
    } catch (e) {
      // ignore load errors here, proceed to add
    }

    const project = addProject(root, {
      name: String(req.body.name || "").trim(),
      projectPath,
      agentsFile,
      defaultPackageType: String(req.body.defaultPackageType || "refactor").trim(),
      protectedAreas: normalizeMultilineToArray(req.body.protectedAreas || ""),
      defaultConstraints: normalizeMultilineToArray(req.body.defaultConstraints || "")
    });
    res.json({ ...project, validation: validateProjectProfile(project) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/projects/active", (req, res) => {
  try {
    const project = setActiveProject(root, String(req.body.projectId || ""));
    res.json({ ...project, validation: validateProjectProfile(project) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/projects/active/validate", (_req, res) => {
  const project = getActiveProject(root);
  res.json({
    project,
    validation: validateProjectProfile(project)
  });
});

app.get("/api/packages", (_req, res) => {
  const rulesBundle = loadRulesBundle(root);
  const projectId = rulesBundle.projectProfile?.id;
  res.json(listPackages(root).filter((pkg) => pkg.projectId === projectId));
});

// Simple server-backed file/folder picker support
app.get("/api/fs/list", (req, res) => {
  const p = String(req.query.path || "").trim();
  try {
    if (!p) {
      if (process.platform === "win32") {
        const drives = [];
        for (let i = 67; i <= 90; i++) {
          const d = String.fromCharCode(i) + ':\\';
          if (fs.existsSync(d)) drives.push({ name: d, path: d, type: "dir" });
        }
        if (drives.length) return res.json({ path: "", entries: drives });
      }
      return res.json({ path: path.sep, entries: [{ name: path.sep, path: path.sep, type: "dir" }] });
    }

    const st = fs.statSync(p);
    if (!st.isDirectory()) return res.status(400).json({ error: "Kein Verzeichnis" });

    const items = fs.readdirSync(p).map((name) => {
      const full = path.join(p, name);
      let type = "file";
      try {
        const s = fs.statSync(full);
        if (s.isDirectory()) type = "dir";
      } catch (e) {
        type = "unknown";
      }
      return { name, path: full, type };
    });
    return res.json({ path: p, entries: items });
  } catch (err) {
    return res.status(400).json({ error: String(err.message || err) });
  }
});

app.get("/api/fs/stat", (req, res) => {
  const p = String(req.query.path || "").trim();
  if (!p) return res.status(400).json({ error: "Pfad fehlt" });
  try {
    const st = fs.statSync(p);
    return res.json({ exists: true, isFile: st.isFile(), isDirectory: st.isDirectory() });
  } catch (err) {
    return res.json({ exists: false, isFile: false, isDirectory: false });
  }
});

app.get("/api/packages/:id", (req, res) => {
  const pkg = loadPackage(root, req.params.id);
  if (!pkg) return res.status(404).json({ error: "Paket nicht gefunden" });
  const reviews = listReviewsForPackage(root, req.params.id);
  const runs = listRunsForPackage(root, req.params.id);
  res.json({ pkg, reviews, runs });
});

app.post("/api/planner/preview", async (req, res) => {
  try {
    const rulesBundle = loadRulesBundle(root);
    if (!rulesBundle.projectValidation?.ok) {
      return res.status(400).json({ error: `Aktives Projekt ist nicht sauber konfiguriert: ${(rulesBundle.projectValidation.issues || []).join(" ")}` });
    }

    const payload = {
      goalText: String(req.body.goalText || "").trim(),
      packageType: String(req.body.packageType || rulesBundle.projectProfile.defaultPackageType || "refactor"),
      priority: String(req.body.priority || "normal"),
      strictness: String(req.body.strictness || rulesBundle.appSettings.defaultMode || "conservative"),
      hardConstraints: normalizeMultilineToArray(req.body.hardConstraints || ""),
      rulesBundle
    };

    if (!payload.goalText) {
      return res.status(400).json({ error: "goalText fehlt" });
    }

    const draft = await planPackageDraft(payload);
    res.json(draft);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post("/api/packages", async (req, res) => {
  try {
    const rulesBundle = loadRulesBundle(root);
    if (!rulesBundle.projectValidation?.ok) {
      return res.status(400).json({ error: `Aktives Projekt ist nicht sauber konfiguriert: ${(rulesBundle.projectValidation.issues || []).join(" ")}` });
    }

    let pkg;
    if (req.body.plannerDraft) {
      pkg = buildPackageFromDraft(req.body.plannerDraft);
    } else {
      const payload = {
        goalText: String(req.body.goalText || "").trim(),
        packageType: String(req.body.packageType || rulesBundle.projectProfile.defaultPackageType || "refactor"),
        priority: String(req.body.priority || "normal"),
        strictness: String(req.body.strictness || rulesBundle.appSettings.defaultMode || "conservative"),
        hardConstraints: normalizeMultilineToArray(req.body.hardConstraints || ""),
        rulesBundle
      };

      if (!payload.goalText) {
        return res.status(400).json({ error: "goalText fehlt" });
      }

      const draft = await planPackageDraft(payload);
      pkg = buildPackageFromDraft(draft);
    }

    savePackage(root, pkg);

    const state = loadState(root);
    state.activePackageId = pkg.id;
    state.status = "planned";
    saveState(root, state);

    res.json(pkg);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post("/api/packages/:id/review-preview", async (req, res) => {
  try {
    const pkg = loadPackage(root, req.params.id);
    if (!pkg) return res.status(404).json({ error: "Paket nicht gefunden" });

    const rulesBundle = loadRulesBundle(root);
    const review = await reviewPackagePlan({ pkg, rulesBundle });
    res.json(review);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/packages/:id/reviews", async (req, res) => {
  try {
    const pkg = loadPackage(root, req.params.id);
    if (!pkg) return res.status(404).json({ error: "Paket nicht gefunden" });

    const review = req.body.reviewDraft;
    if (!review || review.packageId !== pkg.id) {
      return res.status(400).json({ error: "reviewDraft fehlt oder passt nicht zum Paket" });
    }

    saveReview(root, review);
    pkg.lastReviewAt = review.createdAt || nowIso();
    pkg.lastReviewDecision = review.decision || null;
    pkg.lastReviewVerdict = review.verdict || null;
    pkg.updatedAt = nowIso();
    savePackage(root, pkg);
    res.json({ ok: true, review });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/packages/:id/run", async (req, res) => {
  try {
    const pkg = loadPackage(root, req.params.id);
    if (!pkg) return res.status(404).json({ error: "Paket nicht gefunden" });

    const rulesBundle = loadRulesBundle(root);
    if (!rulesBundle.projectValidation?.ok) {
      return res.status(400).json({ error: `Aktives Projekt ist nicht sauber konfiguriert: ${(rulesBundle.projectValidation.issues || []).join(" ")}` });
    }

    const finished = await runPackage({ root, pkg, rulesBundle });

    const state = loadState(root);
    state.activePackageId = finished.status === "running" ? finished.id : null;
    state.status = finished.status;
    saveState(root, state);

    res.json(finished);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(root, "public", "index.html"));
});

const port = Number(process.env.PORT || loadRulesBundle(root).appSettings.serverPort || 3210);

app.post("/api/quit", (_req, res) => {
  res.json({ ok: true, message: "DevControl wird beendet." });
  setTimeout(() => {
    process.exit(0);
  }, 250);
});
app.listen(port, () => {
  console.log(`DevControl laeuft auf http://localhost:${port}`);
});

