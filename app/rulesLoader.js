const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function readTextIfExists(filePath) {
  if (!filePath) return "";
  try {
    if (!fs.existsSync(filePath)) return "";
    const st = fs.statSync(filePath);
    if (!st.isFile()) return "";
    return fs.readFileSync(filePath, "utf8");
  } catch (err) {
    return "";
  }
}

function pathExists(targetPath) {
  try {
    return Boolean(targetPath) && fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

function loadAppSettings(root) {
  return readJson(path.join(root, "config", "appsettings.json"));
}

function normalizeProject(raw) {
  return {
    id: raw.id || slugify(raw.name || "projekt"),
    name: raw.name || raw.projectName || "Unbenanntes Projekt",
    projectPath: raw.projectPath || "",
    agentsFile: raw.agentsFile || "",
    defaultPackageType: raw.defaultPackageType || "refactor",
    protectedAreas: Array.isArray(raw.protectedAreas) ? raw.protectedAreas : [],
    defaultConstraints: Array.isArray(raw.defaultConstraints) ? raw.defaultConstraints : []
  };
}

function loadProjectsConfig(root) {
  const multiPath = path.join(root, "config", "projects.json");
  if (fs.existsSync(multiPath)) {
    const data = readJson(multiPath);
    return {
      activeProjectId: data.activeProjectId || (data.projects?.[0]?.id ?? null),
      projects: (data.projects || []).map(normalizeProject)
    };
  }

  const legacyPath = path.join(root, "config", "project.profile.json");
  const legacy = readJson(legacyPath);
  const project = normalizeProject({
    id: slugify(legacy.projectName || "projekt"),
    name: legacy.projectName || "Projekt",
    ...legacy
  });
  const config = {
    activeProjectId: project.id,
    projects: [project]
  };
  writeJson(multiPath, config);
  return config;
}

function saveProjectsConfig(root, config) {
  return writeJson(path.join(root, "config", "projects.json"), config);
}

function getActiveProject(root) {
  const config = loadProjectsConfig(root);
  const active = config.projects.find((p) => p.id === config.activeProjectId) || config.projects[0];
  return active || null;
}

function setActiveProject(root, projectId) {
  const config = loadProjectsConfig(root);
  const found = config.projects.find((p) => p.id === projectId);
  if (!found) throw new Error("Projekt nicht gefunden");
  config.activeProjectId = projectId;
  saveProjectsConfig(root, config);
  return found;
}

function addProject(root, project) {
  const config = loadProjectsConfig(root);
  const normalized = normalizeProject(project);
  if (!normalized.name) throw new Error("Projektname fehlt");
  if (!normalized.projectPath) throw new Error("Projektpfad fehlt");
  normalized.id = createUniqueProjectId(config.projects, normalized.id || normalized.name);
  config.projects.push(normalized);
  if (!config.activeProjectId) config.activeProjectId = normalized.id;
  saveProjectsConfig(root, config);
  return normalized;
}

function loadReviewRules(root) {
  return readTextIfExists(path.join(root, "config", "review-rules.md"));
}

function loadAgentsText(profile) {
  return readTextIfExists(profile?.agentsFile);
}

function validateProjectProfile(profile) {
  const issues = [];
  const info = [];

  if (!profile) {
    return {
      ok: false,
      projectPathExists: false,
      agentsFileExists: false,
      issues: ["Kein aktives Projekt vorhanden."],
      info: []
    };
  }

  const projectPathExists = pathExists(profile.projectPath);
  const agentsFileExists = pathExists(profile.agentsFile);

  if (!profile.projectPath) {
    issues.push("Projektpfad fehlt.");
  } else if (!projectPathExists) {
    issues.push("Projektpfad existiert nicht.");
  } else {
    info.push("Projektpfad gefunden.");
  }

  if (!profile.agentsFile) {
    issues.push("Agents.md Pfad fehlt.");
  } else if (!agentsFileExists) {
    issues.push("Agents.md wurde nicht gefunden.");
  } else {
    info.push("Agents.md gefunden.");
  }

  return {
    ok: issues.length === 0,
    projectPathExists,
    agentsFileExists,
    issues,
    info
  };
}

function loadRulesBundle(root) {
  const appSettings = loadAppSettings(root);
  const projectsConfig = loadProjectsConfig(root);
  const projectProfile = getActiveProject(root);
  const reviewRules = loadReviewRules(root);
  const agentsText = loadAgentsText(projectProfile);
  const projectValidation = validateProjectProfile(projectProfile);

  return {
    appSettings,
    projectsConfig,
    projectProfile,
    reviewRules,
    agentsText,
    projectValidation
  };
}

function createUniqueProjectId(existingProjects, seed) {
  const base = slugify(seed || "projekt");
  const existingIds = new Set((existingProjects || []).map((p) => p.id));
  if (!existingIds.has(base)) return base;
  let counter = 2;
  while (existingIds.has(`${base}-${counter}`)) {
    counter += 1;
  }
  return `${base}-${counter}`;
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "projekt";
}

module.exports = {
  loadAppSettings,
  loadProjectsConfig,
  saveProjectsConfig,
  getActiveProject,
  setActiveProject,
  addProject,
  loadReviewRules,
  loadAgentsText,
  loadRulesBundle,
  validateProjectProfile
};
