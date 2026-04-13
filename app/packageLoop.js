const { executeStep } = require("./executor");
const { reviewStepResult } = require("./reviewer");
const { savePackage, saveRun, saveReview, appendLog } = require("./storage");
const { makeId, nowIso } = require("./utils");

async function runPackage({ root, pkg, rulesBundle }) {
  const settings = rulesBundle.appSettings;
  const maxSteps = Number(settings.maxInternalStepsPerPackage || 6);
  const maxCorrectionLoops = Number(settings.maxCorrectionLoops || 2);

  let correctionLoops = 0;
  let stepCounter = 0;

  pkg.status = "running";
  pkg.updatedAt = nowIso();
  savePackage(root, pkg);
  appendLog(root, "devcontrol", `Paket gestartet: ${pkg.id} ${pkg.packageName}`);

  while (stepCounter < maxSteps) {
    let step = getCurrentPlannedStep(pkg);
    if (!step) {
      pkg.status = "finished";
      pkg.updatedAt = nowIso();
      pkg.finalVerdict = "gut";
      pkg.finalSummary = "Keine weiteren Schritte geplant.";
      savePackage(root, pkg);
      return pkg;
    }

    step.status = "running";
    step.startedAt = nowIso();
    pkg.updatedAt = nowIso();
    savePackage(root, pkg);

    const run = await executeStep({ root, pkg, step, rulesBundle });
    saveRun(root, run);

    step.status = run.status === "done" ? "done" : "blocked";
    step.finishedAt = nowIso();
    step.runId = run.id;
    pkg.updatedAt = nowIso();
    savePackage(root, pkg);

    const review = await reviewStepResult({
      pkg,
      step,
      run,
      rulesBundle,
      correctionLoops
    });

    saveReview(root, review);
    step.reviewId = review.id;
    pkg.updatedAt = nowIso();

    if (review.decision === "blocked") {
      pkg.status = "blocked";
      pkg.finalVerdict = review.verdict;
      pkg.finalSummary = "Paket blockiert";
      pkg.blockedReason = [
        ...(review.notAchieved || []),
        ...(review.ruleViolations || []),
        ...(review.risks || [])
      ].join(" | ");
      savePackage(root, pkg);
      appendLog(root, "devcontrol", `Paket blockiert: ${pkg.id}`);
      return pkg;
    }

    if (review.decision === "package_done") {
      pkg.status = "finished";
      pkg.finalVerdict = review.verdict;
      pkg.finalSummary = "Paket abgeschlossen";
      pkg.updatedAt = nowIso();
      pkg.packageReport = {
        achieved: review.achieved,
        notAchieved: review.notAchieved,
        ruleViolations: review.ruleViolations,
        risks: review.risks
      };
      savePackage(root, pkg);
      appendLog(root, "devcontrol", `Paket beendet: ${pkg.id}`);
      return pkg;
    }

    const nextStep = {
      id: makeId("step"),
      order: pkg.internalSteps.length + 1,
      status: "planned",
      title: review.nextStepTitle || "Naechster Schritt",
      instructions: review.nextStepInstructions || "Bleibe im Scope und arbeite kontrolliert weiter.",
      createdAt: nowIso()
    };

    if (review.decision === "correct") {
      correctionLoops += 1;
      if (correctionLoops > maxCorrectionLoops) {
        pkg.status = "blocked";
        pkg.finalVerdict = "schlecht";
        pkg.finalSummary = "Zu viele Korrekturschleifen";
        pkg.blockedReason = "Maximale Anzahl Korrekturschleifen erreicht";
        savePackage(root, pkg);
        appendLog(root, "devcontrol", `Paket blockiert durch Korrekturschleifen: ${pkg.id}`);
        return pkg;
      }
    } else {
      correctionLoops = 0;
    }

    pkg.internalSteps.push(nextStep);
    pkg.updatedAt = nowIso();
    savePackage(root, pkg);
    stepCounter += 1;
  }

  pkg.status = "blocked";
  pkg.finalVerdict = "teilweise gut";
  pkg.finalSummary = "Maximale Anzahl interner Schritte erreicht";
  pkg.blockedReason = "Paket muss neu geschnitten oder manuell geprueft werden";
  pkg.updatedAt = nowIso();
  savePackage(root, pkg);
  appendLog(root, "devcontrol", `Paket blockiert durch Schrittlimit: ${pkg.id}`);
  return pkg;
}

function getCurrentPlannedStep(pkg) {
  return (pkg.internalSteps || []).find((step) => step.status === "planned");
}

module.exports = {
  runPackage
};
