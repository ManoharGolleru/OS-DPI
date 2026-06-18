import { AUTO_SCAN_NAMES, browserKey } from "../commands/configureAutoScan";
import { validatePlan } from "../plan/validatePlan";

/** @param {Object} design */
function rootsFrom(design) {
  return {
    layout: design.layout,
    actions: design.actions,
    cues: design.cues,
    patterns: design.patterns || design.pattern,
    methods: design.methods || design.method,
  };
}

/** @param {TreeBase} root */
function walk(root) {
  if (!root) return [];
  return [root, ...root.children.flatMap(walk)];
}

/** @param {TreeBase} handler
 * @param {string} key
 */
function hasKey(handler, key) {
  return handler.children.some(
    (child) =>
      child.className == "HandlerKeyCondition" &&
      child.props["Key"]?.value == key,
  );
}

/** @param {TreeBase} handler
 * @param {string} className
 * @param {string} [timerKey]
 */
function hasResponse(handler, className, timerKey = "") {
  return handler.children.some(
    (child) =>
      child.className == className &&
      (!timerKey || child.props["TimerName"]?.value == timerKey),
  );
}

/** Validate only the nodes owned by the deterministic authoring command.
 * Existing user-authored CSS, expressions, and active methods are left alone.
 *
 * @param {Object} design
 * @param {Object} plan
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateAutoScanDesign(design, plan) {
  const errors = [];
  const planResult = validatePlan(plan);
  errors.push(...planResult.errors.map((error) => `plan: ${error}`));

  const roots = rootsFrom(design);
  for (const [name, root] of Object.entries(roots)) {
    if (!root || !Array.isArray(root.children)) {
      errors.push(`missing ${name} root`);
    }
  }
  if (errors.some((error) => error.startsWith("missing "))) {
    return { valid: false, errors };
  }

  const methods = roots.methods.children.filter(
    (child) =>
      child.className == "Method" &&
      child.props["Name"]?.value == AUTO_SCAN_NAMES.method,
  );
  if (methods.length != 1) {
    errors.push(`expected one generated scan method, found ${methods.length}`);
    return { valid: false, errors };
  }
  const method = methods[0];
  if (!method.props["Active"]?.value) {
    errors.push("generated scan method is not active");
  }

  const timers = method.children.filter(
    (child) =>
      child.className == "Timer" &&
      child.props["Name"]?.value == AUTO_SCAN_NAMES.timer,
  );
  if (timers.length != 1) {
    errors.push(`expected one generated timer, found ${timers.length}`);
    return { valid: false, errors };
  }
  const timer = timers[0];
  const timerKey = timer.props["Key"].value;
  if (timer.props["Interval"].value != plan.intervalSeconds) {
    errors.push("generated timer interval does not match the plan");
  }

  const timerHandler = method.children.find(
    (child) =>
      child.className == "TimerHandler" &&
      child.props["Signal"]?.value == "timer" &&
      child.props["TimerName"]?.value == timerKey,
  );
  if (!timerHandler) {
    errors.push("generated TimerHandler is missing or references another timer");
  } else {
    if (!hasResponse(timerHandler, "ResponderNext")) {
      errors.push("TimerHandler is missing ResponderNext");
    }
    if (!hasResponse(timerHandler, "ResponderStartTimer", timerKey)) {
      errors.push("TimerHandler is missing ResponderStartTimer");
    }
  }

  const keyHandlers = method.children.filter(
    (child) =>
      child.className == "KeyHandler" &&
      child.props["Signal"]?.value == "keyup",
  );
  const startHandler = keyHandlers.find((handler) =>
    hasKey(handler, browserKey(plan.startKey)),
  );
  if (!startHandler) {
    errors.push("start-key handler is missing");
  } else if (!hasResponse(startHandler, "ResponderStartTimer", timerKey)) {
    errors.push("start-key handler does not start the generated timer");
  }

  const selectHandler = keyHandlers.find((handler) =>
    hasKey(handler, browserKey(plan.selectKey)),
  );
  if (!selectHandler) {
    errors.push("select-key handler is missing");
  } else {
    if (!hasResponse(selectHandler, "ResponderActivate")) {
      errors.push("select-key handler is missing ResponderActivate");
    }
    if (
      plan.restartAfterSelection &&
      !hasResponse(selectHandler, "ResponderStartTimer", timerKey)
    ) {
      errors.push("select-key handler does not restart the generated timer");
    }
  }

  const buttons = walk(roots.layout).filter(
    (child) =>
      child.className == "Button" &&
      typeof child.props["label"]?.value == "string" &&
      child.props["label"].value.trim(),
  );
  if (buttons.length < 2) {
    errors.push("design must contain at least two enabled static buttons");
  }

  const cue = roots.cues.children.find(
    (child) =>
      child.props["Name"]?.value == AUTO_SCAN_NAMES.cue,
  );
  if (!cue) {
    errors.push("generated scan cue is missing");
  } else if (cue.className != "CueOverlay") {
    errors.push("generated scan cue must use the safe CueOverlay type");
  }

  const pattern = roots.patterns.children.find(
    (child) =>
      child.className == "PatternManager" &&
      child.props["Name"]?.value == AUTO_SCAN_NAMES.pattern,
  );
  if (!pattern) {
    errors.push("generated scan pattern is missing");
  } else {
    if (method.props["Pattern"]?.value != pattern.props["Key"]?.value) {
      errors.push("generated method does not reference its scan pattern");
    }
    if (cue && pattern.props["Cue"]?.value != cue.props["Key"]?.value) {
      errors.push("generated pattern does not reference its scan cue");
    }
  }

  const generatedActions = roots.actions.children.filter(
    (child) =>
      child.className == "Action" &&
      child.props["origin"]?.value == AUTO_SCAN_NAMES.button,
  );
  if (generatedActions.length != 1) {
    errors.push(
      `expected one generated activation action, found ${generatedActions.length}`,
    );
  } else {
    const action = generatedActions[0];
    const conditions = action.children.filter(
      (child) => child.className == "ActionCondition",
    );
    const updates = action.children.filter(
      (child) => child.className == "ActionUpdate",
    );
    if (
      conditions.length != 1 ||
      conditions[0].props["Condition"]?.text != ""
    ) {
      errors.push("generated action must use one empty condition");
    }
    if (
      updates.length != 1 ||
      updates[0].props["stateName"]?.value != AUTO_SCAN_NAMES.displayState ||
      updates[0].props["newValue"]?.text != "#label"
    ) {
      errors.push("generated action must use the fixed #label display update");
    }
  }

  return { valid: errors.length == 0, errors };
}
