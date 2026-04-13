const { spawn } = require("child_process");
const path = require("path");
const { makeId, nowIso } = require("./utils");

function buildCodexPrompt(pkg, step, rulesBundle) {
  return [
    `Paket: ${pkg.packageName}`,
    `Pakettyp: ${pkg.packageType}`,
    `Strenge: ${pkg.strictness}`,
    "",
    "Ziel des Pakets:",
    ...(pkg.goal || []),
    "",
    "Scope:",
    ...(pkg.scope || []),
    "",
    "Nicht anfassen:",
    ...(pkg.doNotTouch || []),
    "",
    "Regeln:",
    ...(pkg.constraints || []),
    "",
    "Erfolgskriterien:",
    ...(pkg.successCriteria || []),
    "",
    "Aktueller Schritt:",
    `${step.title}`,
    step.instructions,
    "",
    "Agents.md:",
    rulesBundle.agentsText || "nicht vorhanden",
    "",
    "Bitte arbeite nur an diesem Schritt. Keine zusaetzlichen Nebenumbauten."
  ].join("\n");
}

async function executeStep({ root, pkg, step, rulesBundle }) {
  const run = {
    id: makeId("run"),
    packageId: pkg.id,
    stepId: step.id,
    startedAt: nowIso(),
    finishedAt: null,
    status: "running",
    tool: "codex",
    output: "",
    error: "",
    changedFiles: [],
    diffStat: "",
    prompt: buildCodexPrompt(pkg, step, rulesBundle)
  };

  const projectPath = rulesBundle.projectProfile.projectPath;
  if (!projectPath) {
    run.status = "blocked";
    run.error = "Kein projectPath im Projektprofil eingetragen.";
    run.finishedAt = nowIso();
    return run;
  }

  const child = spawn("codex", ["exec", "--json", run.prompt], {
    cwd: projectPath,
    shell: true
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  return await new Promise((resolve) => {
    child.on("error", (error) => {
      run.status = "blocked";
      run.error = `Codex konnte nicht gestartet werden: ${error.message}`;
      run.finishedAt = nowIso();
      resolve(run);
    });

    child.on("close", (code) => {
      run.output = stdout;
      run.error = stderr;
      run.finishedAt = nowIso();

      if (code === 0) {
        run.status = "done";
      } else {
        run.status = "blocked";
        if (!run.error) {
          run.error = `Codex exec endete mit Code ${code}`;
        }
      }

      resolve(run);
    });
  });
}

module.exports = {
  executeStep
};
