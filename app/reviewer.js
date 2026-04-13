const { createOpenAIResponse } = require("./openaiClient");
const { makeId, nowIso } = require("./utils");

const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "decision",
    "verdict",
    "achieved",
    "notAchieved",
    "ruleViolations",
    "risks",
    "nextStepTitle",
    "nextStepInstructions"
  ],
  properties: {
    decision: { type: "string" },
    verdict: { type: "string" },
    achieved: {
      type: "array",
      items: { type: "string" }
    },
    notAchieved: {
      type: "array",
      items: { type: "string" }
    },
    ruleViolations: {
      type: "array",
      items: { type: "string" }
    },
    risks: {
      type: "array",
      items: { type: "string" }
    },
    nextStepTitle: { type: "string" },
    nextStepInstructions: { type: "string" }
  }
};

async function reviewStepResult({ pkg, step, run, rulesBundle, correctionLoops }) {
  if (!process.env.OPENAI_API_KEY) {
    return buildFallbackReview({ pkg, step, run, correctionLoops });
  }

  try {
    const prompt = [
      "Du bist der Reviewer fuer DevControl.",
      "Bewerte den Ausfuehrungsschritt streng.",
      "Entscheide nur mit: continue, correct, blocked, package_done",
      "Antworte nur im JSON-Schema.",
      "",
      `Paket: ${pkg.packageName}`,
      `Pakettyp: ${pkg.packageType}`,
      `Aktueller Schritt: ${step.title}`,
      "",
      "Paketziel:",
      ...(pkg.goal || []),
      "",
      "Erfolgskriterien:",
      ...(pkg.successCriteria || []),
      "",
      "Nicht anfassen:",
      ...(pkg.doNotTouch || []),
      "",
      "Regeln:",
      ...(pkg.constraints || []),
      "",
      "Review-Regeln:",
      rulesBundle.reviewRules || "keine",
      "",
      "Codex-Ausgabe:",
      run.output || "(leer)",
      "",
      "Codex-Fehler:",
      run.error || "(kein Fehler)",
      "",
      `Bisherige Korrekturschleifen: ${correctionLoops}`
    ].join("\n");

    const result = await createOpenAIResponse({
      prompt,
      schemaName: "devcontrol_step_review",
      schema: REVIEW_SCHEMA
    });

    return {
      id: makeId("rev"),
      packageId: pkg.id,
      stepId: step.id,
      createdAt: nowIso(),
      decision: result.decision,
      verdict: result.verdict,
      achieved: result.achieved,
      notAchieved: result.notAchieved,
      ruleViolations: result.ruleViolations,
      risks: result.risks,
      nextStepTitle: result.nextStepTitle,
      nextStepInstructions: result.nextStepInstructions,
      source: "openai"
    };
  } catch (error) {
    const fallback = buildFallbackReview({ pkg, step, run, correctionLoops });
    fallback.risks.push(`Fallback-Review aktiv, OpenAI-Call scheiterte: ${error.message}`);
    return fallback;
  }
}

function buildFallbackReview({ pkg, step, run, correctionLoops }) {
  const blocked = run.status !== "done";
  const decision = blocked
    ? "blocked"
    : correctionLoops >= 1
      ? "package_done"
      : "continue";

  return {
    id: makeId("rev"),
    packageId: pkg.id,
    stepId: step.id,
    createdAt: nowIso(),
    decision,
    verdict: blocked ? "schlecht" : (decision === "package_done" ? "gut" : "teilweise gut"),
    achieved: blocked ? [] : [`Schritt wurde technisch ausgefuehrt: ${step.title}`],
    notAchieved: blocked ? ["Ausfuehrung nicht sauber abgeschlossen"] : ["Inhaltliche Tiefenpruefung nur im Fallback begrenzt moeglich"],
    ruleViolations: [],
    risks: blocked ? [run.error || "Codex-Ausfuehrung blockiert"] : ["Fallback-Review ohne Modellpruefung"],
    nextStepTitle: blocked ? "Paket manuell pruefen" : "Naechsten kleinen Schritt ableiten",
    nextStepInstructions: blocked
      ? "Pruefe Codex CLI, Projektpfad und lokale Umgebung."
      : "Leite aus dem Paketziel den naechsten kleinen Schritt ab und bleibe im Scope.",
    source: "fallback"
  };
}

async function reviewPackageQuick({ pkg, latestRun, latestReview, rulesBundle }) {
  if (!process.env.OPENAI_API_KEY) {
    return buildFallbackPackageReview({ pkg, latestRun, latestReview });
  }

  try {
    const lastStep = (pkg.internalSteps || []).slice(-1)[0] || {};
    const prompt = [
      "Du bist der Controller-Reviewer fuer DevControl.",
      "Bewerte das gesamte Paket auf Management-Ebene.",
      "Entscheide nur mit: continue, correct, blocked, package_done",
      "Antworte nur im JSON-Schema.",
      "",
      `Paket: ${pkg.packageName}`,
      `Pakettyp: ${pkg.packageType}`,
      `Status: ${pkg.status}`,
      `Rohziel: ${pkg.rawGoal || ""}`,
      "",
      "Paketziel:",
      ...(pkg.goal || []),
      "",
      "Scope:",
      ...(pkg.scope || []),
      "",
      "Nicht anfassen:",
      ...(pkg.doNotTouch || []),
      "",
      "Erfolgskriterien:",
      ...(pkg.successCriteria || []),
      "",
      "Regeln:",
      ...(pkg.constraints || []),
      "",
      "Bisherige Paketdaten:",
      `finalSummary: ${pkg.finalSummary || "-"}`,
      `blockedReason: ${pkg.blockedReason || "-"}`,
      `letzter Schrittstatus: ${lastStep.status || "-"}`,
      `letzter Schritttitel: ${lastStep.title || "-"}`,
      "",
      "Letzter Run Output:",
      latestRun?.output || "(kein Run-Output)",
      "",
      "Letzter Run Fehler:",
      latestRun?.error || "(kein Fehler)",
      "",
      "Letztes Review:",
      latestReview ? JSON.stringify({
        decision: latestReview.decision,
        verdict: latestReview.verdict,
        achieved: latestReview.achieved,
        notAchieved: latestReview.notAchieved,
        risks: latestReview.risks
      }) : "(kein Review)",
      "",
      "Review-Regeln:",
      rulesBundle.reviewRules || "keine"
    ].join("\n");

    const result = await createOpenAIResponse({
      prompt,
      schemaName: "devcontrol_package_review",
      schema: REVIEW_SCHEMA
    });

    return {
      id: makeId("rev"),
      packageId: pkg.id,
      stepId: null,
      createdAt: nowIso(),
      decision: result.decision,
      verdict: result.verdict,
      achieved: result.achieved,
      notAchieved: result.notAchieved,
      ruleViolations: result.ruleViolations,
      risks: result.risks,
      nextStepTitle: result.nextStepTitle,
      nextStepInstructions: result.nextStepInstructions,
      source: "openai",
      reviewType: "package_quick"
    };
  } catch (error) {
    const fallback = buildFallbackPackageReview({ pkg, latestRun, latestReview });
    fallback.risks.push(`Fallback-Review aktiv, OpenAI-Call scheiterte: ${error.message}`);
    return fallback;
  }
}

function buildFallbackPackageReview({ pkg, latestRun, latestReview }) {
  const blocked = pkg.status === "blocked" || latestRun?.status === "blocked";
  const done = pkg.status === "finished";
  const decision = blocked ? "blocked" : (done ? "package_done" : "continue");
  const achieved = [];
  const notAchieved = [];

  if (pkg.packageName) achieved.push(`Paket ist sauber angelegt: ${pkg.packageName}`);
  if (pkg.internalSteps?.length) achieved.push(`Interne Schritte vorhanden: ${pkg.internalSteps.length}`);
  if (done) achieved.push("Paket ist formal abgeschlossen.");
  if (!done) notAchieved.push("Paket ist noch nicht vollständig abgeschlossen.");
  if (!latestRun) notAchieved.push("Noch kein Run protokolliert.");

  const risks = [];
  if (blocked) risks.push(pkg.blockedReason || latestRun?.error || "Paket ist aktuell blockiert.");
  if (!process.env.OPENAI_API_KEY) risks.push("Fallback-Review ohne OpenAI-Modell.");
  if (latestReview?.source === "fallback") risks.push("Vorheriges Review war ebenfalls nur Fallback.");

  return {
    id: makeId("rev"),
    packageId: pkg.id,
    stepId: null,
    createdAt: nowIso(),
    decision,
    verdict: blocked ? "schlecht" : (done ? "gut" : "teilweise gut"),
    achieved,
    notAchieved,
    ruleViolations: [],
    risks,
    nextStepTitle: blocked ? "Blockierung prüfen" : (done ? "Nächstes Paket wählen" : "Nächsten kleinen Schritt ableiten"),
    nextStepInstructions: blocked
      ? "Prüfe den letzten Run, lokale Umgebung und Scope des Pakets."
      : (done ? "Leite aus dem Abschlussbericht das nächste sinnvolle Paket ab." : "Leite aus Ziel und Scope den nächsten kleinen Schritt ab und bleibe im Paket."),
    source: "fallback",
    reviewType: "package_quick"
  };
}

module.exports = {
  reviewStepResult,
  reviewPackageQuick
};
