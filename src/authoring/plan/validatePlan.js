import {
  AUTO_SCAN_PLAN_KEYS,
  PLAN_OPERATIONS,
  SGD_ACTION_KEYS,
  SGD_KEYBOARD_KEYS,
  SGD_PLAN_KEYS,
} from "./schema";

const KEY_ALIASES = {
  " ": "space",
  spacebar: "space",
  return: "enter",
  esc: "escape",
};

/** Normalize friendly key names for validation comparisons.
 * @param {string} key
 */
export function normalizeKeyName(key) {
  const normalized = key.trim().toLowerCase();
  return KEY_ALIASES[normalized] || normalized;
}

export class AuthoringPlanValidationError extends Error {
  /** @param {string[]} errors */
  constructor(errors) {
    super(`Invalid authoring plan: ${errors.join("; ")}`);
    this.name = "AuthoringPlanValidationError";
    this.errors = errors;
  }
}

/** @param {any} value */
function isPlainObject(value) {
  return !!value && typeof value == "object" && !Array.isArray(value);
}

/** @param {any} obj @param {string[]} allowed @param {string} label */
function validateKnownFields(obj, allowed, label) {
  return Object.keys(obj).filter((key) => !allowed.includes(key)).length
    ? [
        `${label} contains unsupported fields: ${Object.keys(obj)
          .filter((key) => !allowed.includes(key))
          .join(", ")}`,
      ]
    : [];
}

/** @param {any} value @param {string} label @param {string[]} errors */
function requireBoolean(value, label, errors) {
  if (typeof value != "boolean") {
    errors.push(`${label} must be a boolean`);
  }
}

/** Validate the deterministic auto-scan plan.
 * @param {any} plan
 * @param {string[]} errors
 */
function validateAutoScanPlan(plan, errors) {
  const unexpectedKeys = Object.keys(plan).filter(
    (key) => !AUTO_SCAN_PLAN_KEYS.includes(key),
  );
  if (unexpectedKeys.length) {
    errors.push(`unsupported plan fields: ${unexpectedKeys.join(", ")}`);
  }
  if (typeof plan.startKey != "string" || !plan.startKey.trim()) {
    errors.push("startKey must be a non-empty string");
  }
  if (typeof plan.selectKey != "string" || !plan.selectKey.trim()) {
    errors.push("selectKey must be a non-empty string");
  }
  if (
    typeof plan.startKey == "string" &&
    plan.startKey.trim() &&
    typeof plan.selectKey == "string" &&
    plan.selectKey.trim() &&
    normalizeKeyName(plan.startKey) == normalizeKeyName(plan.selectKey)
  ) {
    errors.push("startKey and selectKey must be different keys");
  }
  if (
    typeof plan.intervalSeconds != "number" ||
    !Number.isFinite(plan.intervalSeconds) ||
    plan.intervalSeconds <= 0
  ) {
    errors.push("intervalSeconds must be greater than 0");
  }
  if (typeof plan.restartAfterSelection != "boolean") {
    errors.push("restartAfterSelection must be a boolean");
  }
  if (!Array.isArray(plan.buttonLabels) || plan.buttonLabels.length < 2) {
    errors.push("buttonLabels must contain at least two labels");
  } else if (
    plan.buttonLabels.some(
      (label) => typeof label != "string" || !label.trim(),
    )
  ) {
    errors.push("button labels must be non-empty strings");
  }
}

/** Validate the deterministic SGD interface plan.
 * @param {any} plan
 * @param {string[]} errors
 */
function validateSgdPlan(plan, errors) {
  const unexpectedKeys = Object.keys(plan).filter(
    (key) => !SGD_PLAN_KEYS.includes(key),
  );
  if (unexpectedKeys.length) {
    errors.push(`unsupported plan fields: ${unexpectedKeys.join(", ")}`);
  }

  if (typeof plan.title != "string" || !plan.title.trim()) {
    errors.push("title must be a non-empty string");
  }
  if (
    typeof plan.displayState != "string" ||
    !plan.displayState.trim().startsWith("$")
  ) {
    errors.push("displayState must be a string beginning with $");
  }

  if (!isPlainObject(plan.keyboard)) {
    errors.push("keyboard must be an object");
  } else {
    errors.push(
      ...validateKnownFields(plan.keyboard, SGD_KEYBOARD_KEYS, "keyboard"),
    );
    if (plan.keyboard.type != "qwerty") {
      errors.push('keyboard.type must be "qwerty"');
    }
    requireBoolean(plan.keyboard.includeSpace, "keyboard.includeSpace", errors);
    requireBoolean(
      plan.keyboard.includeDelete,
      "keyboard.includeDelete",
      errors,
    );
    requireBoolean(plan.keyboard.includeClear, "keyboard.includeClear", errors);
  }

  if (
    !Array.isArray(plan.coreVocabulary) ||
    plan.coreVocabulary.length < 1 ||
    plan.coreVocabulary.length > 40
  ) {
    errors.push("coreVocabulary must contain 1 to 40 labels");
  } else if (
    plan.coreVocabulary.some(
      (label) => typeof label != "string" || !label.trim(),
    )
  ) {
    errors.push("coreVocabulary labels must be non-empty strings");
  }

  if (!isPlainObject(plan.actions)) {
    errors.push("actions must be an object");
  } else {
    errors.push(...validateKnownFields(plan.actions, SGD_ACTION_KEYS, "actions"));
    for (const key of SGD_ACTION_KEYS) {
      requireBoolean(plan.actions[key], `actions.${key}`, errors);
    }
  }
}

/** Validate a constrained authoring plan.
 * @param {any} plan
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validatePlan(plan) {
  const errors = [];

  if (!plan || typeof plan != "object" || Array.isArray(plan)) {
    return { valid: false, errors: ["plan must be an object"] };
  }

  if (!PLAN_OPERATIONS.includes(plan.operation)) {
    errors.push(
      "operation must be configure_auto_scan or create_sgd_interface",
    );
  }

  if (plan.operation == "configure_auto_scan") {
    validateAutoScanPlan(plan, errors);
  } else if (plan.operation == "create_sgd_interface") {
    validateSgdPlan(plan, errors);
  }

  return { valid: errors.length == 0, errors };
}

/** Throw a detailed error when a plan is invalid.
 * @param {any} plan
 */
export function assertValidPlan(plan) {
  const result = validatePlan(plan);
  if (!result.valid) {
    throw new AuthoringPlanValidationError(result.errors);
  }
}
