const { createOpenAIResponse } = require("./openaiClient");
const { makeId, nowIso } = require("./utils");

const PLANNER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "packageName",
    "packageType",
    "goal",
    "scope",
    "doNotTouch",
    "constraints",
    "successCriteria",
    "abortCriteria",
    "nextStep"
  ],
  properties: {
    packageName: { type: "string" },
    packageType: { type: "string" },
    goal: { type: "array", items: { type: "string" } },
    scope: { type: "array", items: { type: "string" } },
    doNotTouch: { type: "array", items: { type: "string" } },
    constraints: { type: "array", items: { type: "string" } },
    successCriteria: { type: "array", items: { type: "string" } },
    abortCriteria: { type: "array", items: { type: "string" } },
    nextStep: {
      type: "object",
      additionalProperties: false,
      required: ["title", "instructions"],
      properties: {
        title: { type: "string" },
        instructions: { type: "string" }
      }
    }
  }
};

async function planPackageDraft({ goalText, packageType, priority, strictness, hardConstraints, rulesBundle }) {
  const fallbackDraft = buildFallbackDraft({ goalText, packageType, priority, strictness, hardConstraints, rulesBundle });

  if (!process.env.OPENAI_API_KEY) {
    return fallbackDraft;
  }

  try {
    const prompt = [
      "Du bist der Planner fuer DevControl.",
      "Schneide aus dem Rohziel ein konkretes Aufgabenpaket plus den naechsten kleinsten sinnvollen internen Schritt.",
      "Antworte nur im vorgegebenen JSON-Schema.",
      "Halte das Paket klein, klar und pruefbar.",
      "Vermeide Scope-Drift.",
      "",
      `Aktives Projekt: ${rulesBundle.projectProfile.name}`,
      `Projektpfad: ${rulesBundle.projectProfile.projectPath}`,
      "",
      "Rohziel:",
      goalText,
      "",
      `Pakettyp: ${packageType}`,
      `Prioritaet: ${priority}`,
      `Strenge: ${strictness}`,
      "",
      "Harte Zusatzgrenzen:",
      ...(hardConstraints.length ? hardConstraints : ["keine"]),
      "",
      "Projektregeln:",
      ...(rulesBundle.projectProfile.defaultConstraints || []),
      "",
      "Geschuetzte Bereiche:",
      ...(rulesBundle.projectProfile.protectedAreas || []),
      "",
      "Review-Regeln:",
      rulesBundle.reviewRules || "keine",
      "",
      "Agents.md:",
      rulesBundle.agentsText || "nicht vorhanden"
    ].join("\n");

    const result = await createOpenAIResponse({
      prompt,
      schemaName: "devcontrol_package_plan",
      schema: PLANNER_SCHEMA
    });

    return buildDraftFromPlannerResult({ result, goalText, packageType, priority, strictness, rulesBundle });
  } catch (error) {
    fallbackDraft.summary = `Fallback-Planer benutzt, weil OpenAI-Call scheiterte: ${error.message}`;
    return fallbackDraft;
  }
}

function buildPackageFromDraft(draft) {
  return {
    id: makeId("pkg"),
    projectId: draft.projectId,
    projectName: draft.projectName,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    status: "planned",
    priority: draft.priority,
    strictness: draft.strictness,
    rawGoal: draft.rawGoal,
    packageName: draft.packageName,
    packageType: draft.packageType,
    goal: arrayOrEmpty(draft.goal),
    scope: arrayOrEmpty(draft.scope),
    doNotTouch: arrayOrEmpty(draft.doNotTouch),
    constraints: arrayOrEmpty(draft.constraints),
    successCriteria: arrayOrEmpty(draft.successCriteria),
    abortCriteria: arrayOrEmpty(draft.abortCriteria),
    internalSteps: [{
      id: makeId("step"),
      order: 1,
      status: "planned",
      title: draft.nextStep?.title || "Naechster Schritt",
      instructions: draft.nextStep?.instructions || "Arbeite klein, kontrolliert und bleibe im Scope.",
      createdAt: nowIso()
    }],
    summary: draft.summary || "Planner-Vorschlag uebernommen"
  };
}

function buildDraftFromPlannerResult({ result, goalText, packageType, priority, strictness, rulesBundle }) {
  return {
    projectId: rulesBundle.projectProfile.id,
    projectName: rulesBundle.projectProfile.name,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    priority,
    strictness,
    rawGoal: goalText,
    packageName: result.packageName,
    packageType: result.packageType || packageType,
    goal: arrayOrEmpty(result.goal),
    scope: arrayOrEmpty(result.scope),
    doNotTouch: arrayOrEmpty(result.doNotTouch),
    constraints: arrayOrEmpty(result.constraints),
    successCriteria: arrayOrEmpty(result.successCriteria),
    abortCriteria: arrayOrEmpty(result.abortCriteria),
    nextStep: {
      title: result.nextStep?.title || "Naechster Schritt",
      instructions: result.nextStep?.instructions || "Bleibe im Scope und arbeite kontrolliert weiter."
    },
    summary: "Planner ueber OpenAI erstellt",
    source: "openai"
  };
}

function buildFallbackDraft({ goalText, packageType, priority, strictness, hardConstraints, rulesBundle }) {
  const protectedAreas = rulesBundle.projectProfile.protectedAreas || [];
  const defaultConstraints = rulesBundle.projectProfile.defaultConstraints || [];

  return {
    projectId: rulesBundle.projectProfile.id,
    projectName: rulesBundle.projectProfile.name,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    priority,
    strictness,
    rawGoal: goalText,
    packageName: guessPackageName(goalText),
    packageType,
    goal: [goalText],
    scope: ["Nur den direkt genannten Bereich anfassen", "Kleine, kontrollierte Aenderungen"],
    doNotTouch: [...protectedAreas],
    constraints: [...defaultConstraints, ...hardConstraints].filter(Boolean),
    successCriteria: [
      "Das Ziel wurde sichtbar bearbeitet",
      "Der Scope wurde eingehalten",
      "Keine unnoetigen Seitenaenderungen"
    ],
    abortCriteria: [
      "Geschuetzte Bereiche muessen mit angefasst werden",
      "Der Scope kippt in mehrere Subsysteme",
      "Zwei Korrekturschleifen hintereinander"
    ],
    nextStep: {
      title: "Ersten kleinstmoeglichen Umbau-Schritt planen",
      instructions: [
        `Arbeite nur an folgendem Ziel: ${goalText}`,
        "Aendere so wenig wie moeglich.",
        "Respektiere Agents.md und die Projektregeln.",
        "Fasse geschuetzte Bereiche nicht an."
      ].join(" ")
    },
    summary: "Fallback-Planer ohne OpenAI API",
    source: "fallback"
  };
}

function guessPackageName(goalText) {
  const cleaned = String(goalText || "").trim();
  if (!cleaned) return "Neues Aufgabenpaket";
  return cleaned.length > 80 ? `${cleaned.slice(0, 77)}...` : cleaned;
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

module.exports = {
  planPackageDraft,
  buildPackageFromDraft
};
