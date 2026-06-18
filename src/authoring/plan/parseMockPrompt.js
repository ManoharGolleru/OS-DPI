const MVP_PLAN = {
  operation: "configure_auto_scan",
  startKey: "Space",
  selectKey: "Enter",
  intervalSeconds: 0.6,
  restartAfterSelection: true,
  buttonLabels: ["Yes", "No", "Help", "Stop"],
};

export class UnsupportedAuthoringRequestError extends Error {
  /** @param {string} [message] */
  constructor(
    message = 'Unsupported request. Authoring currently only supports requests like "Create an auto-scan interface where Enter selects the current button."',
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

  if (
    !requestsAutoScan ||
    !mentionsEnter ||
    !requestsSelection ||
    !identifiesTarget
  ) {
    throw new UnsupportedAuthoringRequestError();
  }

  return {
    ...MVP_PLAN,
    buttonLabels: [...MVP_PLAN.buttonLabels],
  };
}
