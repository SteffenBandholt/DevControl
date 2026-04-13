const fs = require("fs");
const path = require("path");
const { nowIso } = require("./utils");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function appendLog(root, name, message) {
  const filePath = path.join(root, "logs", `${name}.log`);
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `[${nowIso()}] ${message}\n`, "utf8");
}

function savePackage(root, pkg) {
  const filePath = path.join(root, "data", "packages", `${pkg.id}.json`);
  writeJson(filePath, pkg);
  return filePath;
}

function saveReview(root, review) {
  const filePath = path.join(root, "data", "reviews", `${review.id}.json`);
  writeJson(filePath, review);
  return filePath;
}

function saveRun(root, run) {
  const filePath = path.join(root, "data", "runs", `${run.id}.json`);
  writeJson(filePath, run);
  return filePath;
}

function loadPackage(root, packageId) {
  return readJson(path.join(root, "data", "packages", `${packageId}.json`));
}

function listJsonObjects(dirPath) {
  ensureDir(dirPath);
  return fs.readdirSync(dirPath)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson(path.join(dirPath, f)))
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt || b.updatedAt || "").localeCompare(String(a.createdAt || a.updatedAt || "")));
}

function listPackages(root) {
  return listJsonObjects(path.join(root, "data", "packages"));
}

function listReviewsForPackage(root, packageId) {
  return listJsonObjects(path.join(root, "data", "reviews"))
    .filter((r) => r.packageId === packageId);
}

function listRunsForPackage(root, packageId) {
  return listJsonObjects(path.join(root, "data", "runs"))
    .filter((r) => r.packageId === packageId);
}

function loadState(root) {
  return readJson(path.join(root, "data", "state.json"), {
    activePackageId: null,
    lastRunId: null,
    lastReviewId: null,
    status: "idle"
  });
}

function saveState(root, state) {
  writeJson(path.join(root, "data", "state.json"), state);
}

module.exports = {
  appendLog,
  savePackage,
  saveReview,
  saveRun,
  loadPackage,
  listPackages,
  listReviewsForPackage,
  listRunsForPackage,
  loadState,
  saveState
};
