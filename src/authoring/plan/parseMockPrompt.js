const MVP_PLAN = {
  operation: "configure_auto_scan",
  startKey: "Space",
  selectKey: "Enter",
  intervalSeconds: 0.6,
  restartAfterSelection: true,
  buttonLabels: ["Yes", "No", "Help", "Stop"],
};

export const SGD_MVP_PLAN = {
  operation: "create_sgd_interface",
  title: "Generated SGD Interface",
  displayState: "$Message",
  keyboard: {
    type: "qwerty",
    includeSpace: true,
    includeDelete: true,
    includeClear: true,
  },
  coreVocabulary: [
    "I",
    "you",
    "want",
    "go",
    "more",
    "help",
    "yes",
    "no",
    "stop",
    "finished",
  ],
  actions: {
    lettersAppendToDisplay: true,
    coreWordsAppendToDisplay: true,
    deleteRemovesLastCharacter: true,
    clearEmptiesDisplay: true,
    speakUsesDisplay: true,
  },
};

export class UnsupportedAuthoringRequestError extends Error {
  /** @param {string} [message] */
  constructor(
    message = 'Unsupported request. Authoring currently supports auto-scan requests and a basic QWERTY/Core vocabulary SGD interface request.',
  ) {
    super(
      message,
    );
    this.name = "UnsupportedAuthoringRequestError";
  }
}

/** Normalize a prompt for the deliberately narrow mock adapter.
 * @param {string} prompt
 */
function normalize(prompt) {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cloneSgdPlan() {
  return {
    ...SGD_MVP_PLAN,
    keyboard: { ...SGD_MVP_PLAN.keyboard },
    coreVocabulary: [...SGD_MVP_PLAN.coreVocabulary],
    actions: { ...SGD_MVP_PLAN.actions },
  };
}

/** Map the MVP prompt and close variants to one deterministic edit plan.
 * @param {string} prompt
 * @returns {Object}
 */
export function parseMockPrompt(prompt) {
  if (typeof prompt != "string") {
    throw new UnsupportedAuthoringRequestError();
  }

  const normalized = normalize(prompt);
  const requestsAutoScan = /\bauto-?scan\b/.test(normalized);
  const mentionsEnter = /\benter\b/.test(normalized);
  const requestsSelection = /\b(selects?|activates?|chooses?)\b/.test(
    normalized,
  );
  const identifiesTarget =
    /\b(current|highlighted|scanned|selected)\b/.test(normalized) &&
    /\b(button|item|target)\b/.test(normalized);
  const requestsSgd =
    /\b(sgd|speech generating|speech-generating|aac|communication)\b/.test(
      normalized,
    ) ||
    (/\b(qwerty|keyboard)\b/.test(normalized) &&
      /\b(core|vocabulary|compose|composing|message|display|delete|clear|speak|speech)\b/.test(
        normalized,
      ));

  if (
    requestsAutoScan &&
    mentionsEnter &&
    requestsSelection &&
    identifiesTarget
  ) {
    return {
      ...MVP_PLAN,
      buttonLabels: [...MVP_PLAN.buttonLabels],
    };
  }

  if (requestsSgd) return cloneSgdPlan();

  throw new UnsupportedAuthoringRequestError();
}
