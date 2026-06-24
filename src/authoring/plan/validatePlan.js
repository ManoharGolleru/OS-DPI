import { AUTO_SCAN_PLAN_KEYS } from "./schema";

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

/** Validate the deterministic auto-scan plan.
 * @param {any} plan
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validatePlan(plan) {
  const errors = [];

  if (!plan || typeof plan != "object" || Array.isArray(plan)) {
    return { valid: false, errors: ["plan must be an object"] };
  }

  const unexpectedKeys = Object.keys(plan).filter(
    (key) => !AUTO_SCAN_PLAN_KEYS.includes(key),
  );
  if (unexpectedKeys.length) {
    errors.push(`unsupported plan fields: ${unexpectedKeys.join(", ")}`);
  }
  if (plan.operation != "configure_auto_scan") {
    errors.push("operation must be configure_auto_scan");
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
