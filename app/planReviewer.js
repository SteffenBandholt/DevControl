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
    achieved: { type: "array", items: { type: "string" } },
    notAchieved: { type: "array", items: { type: "string" } },
    ruleViolations: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    nextStepTitle: { type: "string" },
    nextStepInstructions: { type: "string" }
  }
};

async function reviewPackagePlan({ pkg, rulesBundle }) {
  if (!process.env.OPENAI_API_KEY) {
    return buildFallbackReview({ pkg });
  }

  try {
    const prompt = [
      "Du bist der Controller-Reviewer fuer DevControl.",
      "Bewerte ausschliesslich die Qualitaet des aktuellen Arbeitspakets.",
      "Es geht noch nicht um Codeaenderungen, sondern um Paketzuschnitt, Scope und Klarheit.",
      "Erlaubte Entscheidungen: continue, correct, blocked, package_done",
      "Antworte nur im JSON-Schema.",
      "",
      `Projekt: ${pkg.projectName}`,
      `Paket: ${pkg.packageName}`,
      `Typ: ${pkg.packageType}`,
      `Prioritaet: ${pkg.priority}`,
      `Strenge: ${pkg.strictness}`,
      "",
      "Rohziel:",
      pkg.rawGoal || "-",
      "",
      "Ziele:",
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
      "Abbruchkriterien:",
      ...(pkg.abortCriteria || []),
      "",
      "Erster interner Schritt:",
      (pkg.internalSteps || [])[0]?.title || "-",
      (pkg.internalSteps || [])[0]?.instructions || "-",
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
      source: "openai-plan-review"
    };
  } catch (error) {
    const fallback = buildFallbackReview({ pkg });
    fallback.risks.push(`Fallback-Review aktiv, OpenAI-Call scheiterte: ${error.message}`);
    return fallback;
  }
}

function buildFallbackReview({ pkg }) {
  const hasScope = Array.isArray(pkg.scope) && pkg.scope.length > 0;
  const hasDoNotTouch = Array.isArray(pkg.doNotTouch) && pkg.doNotTouch.length > 0;
  const hasSuccessCriteria = Array.isArray(pkg.successCriteria) && pkg.successCriteria.length > 0;
  const issues = [];
  if (!hasScope) issues.push("Scope fehlt oder ist zu duenn");
  if (!hasDoNotTouch) issues.push("Nicht-anfassen-Bereich ist leer");
  if (!hasSuccessCriteria) issues.push("Erfolgskriterien fehlen");

  const decision = issues.length ? "correct" : "continue";

  return {
    id: makeId("rev"),
    packageId: pkg.id,
    stepId: null,
    createdAt: nowIso(),
    decision,
    verdict: issues.length ? "teilweise gut" : "gut",
    achieved: [
      `Paketname vorhanden: ${pkg.packageName || "ja"}`,
      `Erster Schritt vorhanden: ${((pkg.internalSteps || [])[0]?.title) ? "ja" : "nein"}`
    ],
    notAchieved: issues,
    ruleViolations: [],
    risks: issues.length ? ["Fallback-Pruefung ohne Modelltiefe"] : ["Fallback-Pruefung ohne Modelltiefe, aber Paket wirkt brauchbar"],
    nextStepTitle: issues.length ? "Paket enger schneiden oder vervollstaendigen" : "Paket kann kontrolliert gestartet werden",
    nextStepInstructions: issues.length
      ? "Ergaenze Scope, Nicht-anfassen und Erfolgskriterien, bevor du startest."
      : "Belasse das Paket klein und starte erst den ersten internen Schritt.",
    source: "fallback-plan-review"
  };
}

module.exports = {
  reviewPackagePlan
};
