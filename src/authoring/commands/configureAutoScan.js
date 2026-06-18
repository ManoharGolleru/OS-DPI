import Globals from "app/globals";
import { TreeBase } from "components/treebase";
import { assertValidPlan } from "../plan/validatePlan";

export const AUTO_SCAN_NAMES = {
  method: "Authoring Auto Scan",
  timer: "authoring-auto-scan-timer",
  pattern: "Authoring Auto Scan Pattern",
  cue: "Authoring Auto Scan Cue",
  button: "authoring-auto-scan-button",
  displayState: "$AuthoringAutoScanSelection",
};

/** Convert the plan's friendly key name into KeyboardEvent.key.
 * @param {string} key
 */
export function browserKey(key) {
  return key.toLowerCase() == "space" ? " " : key;
}

/** @param {TreeBase} root */
function walk(root) {
  const result = [root];
  for (const child of root.children) {
    result.push(...walk(child));
  }
  return result;
}

/** @param {TreeBase} component */
function isGeneratedButton(component) {
  return (
    component.className == "Button" &&
    component.props["name"]?.value == AUTO_SCAN_NAMES.button
  );
}

/** Remove only layout nodes created by this command.
 * @param {TreeBase} page
 */
function removeGeneratedLayout(page) {
  const generatedStacks = walk(page).filter(
    (component) =>
      component.className == "Stack" &&
      component.children.some(isGeneratedButton),
  );
  for (const stack of generatedStacks) {
    if (stack.parent) stack.remove();
  }

  for (const component of [...walk(page)].reverse()) {
    if (!component.parent) continue;
    const generatedDisplay =
      component.className == "Display" &&
      component.props["stateName"]?.value == AUTO_SCAN_NAMES.displayState;
    if (generatedDisplay || isGeneratedButton(component)) {
      component.remove();
    }
  }
}

/** @param {TreeBase} parent
 * @param {(child: TreeBase) => boolean} predicate
 */
function removeChildren(parent, predicate) {
  for (const child of [...parent.children]) {
    if (predicate(child)) child.remove();
  }
}

/** @param {Object} design */
function designRoots(design) {
  return {
    layout: design.layout,
    actions: design.actions,
    cues: design.cues,
    patterns: design.patterns || design.pattern,
    methods: design.methods || design.method,
  };
}

/** Ensure the live design has the roots required by the command.
 * @param {ReturnType<typeof designRoots>} roots
 */
function assertRoots(roots) {
  for (const [name, root] of Object.entries(roots)) {
    if (!root || !Array.isArray(root.children)) {
      throw new Error(`Auto-scan authoring requires a ${name} design root`);
    }
  }
}

/** Persist changed live panels after all mutations are complete.
 * @param {ReturnType<typeof designRoots>} roots
 */
async function persistRoots(roots) {
  for (const root of Object.values(roots)) {
    if (typeof root.onUpdate == "function") {
      await root.onUpdate();
    }
  }
}

/** Configure the known-good timer loop demonstrated by autoscan.osdpi.
 *
 * The command replaces only nodes bearing its private names, so it is
 * idempotent and leaves existing mouse and pointer methods in place.
 *
 * @param {Object} plan
 * @param {Object} [design]
 * @param {{persist?: boolean}} [options]
 */
export async function configureAutoScan(
  plan,
  design = Globals,
  options = {},
) {
  assertValidPlan(plan);
  const roots = designRoots(design);
  assertRoots(roots);

  let page = roots.layout.children.find(
    (component) => component.className == "Page",
  );
  if (!page) {
    page = TreeBase.create("Page", roots.layout, {
      direction: "column",
      background: "",
    });
    page.init();
  }

  removeGeneratedLayout(page);
  removeChildren(
    roots.actions,
    (child) =>
      child.className == "Action" &&
      child.props["origin"]?.value == AUTO_SCAN_NAMES.button,
  );
  removeChildren(
    roots.methods,
    (child) =>
      child.className == "Method" &&
      child.props["Name"]?.value == AUTO_SCAN_NAMES.method,
  );
  removeChildren(
    roots.patterns,
    (child) =>
      child.className == "PatternManager" &&
      child.props["Name"]?.value == AUTO_SCAN_NAMES.pattern,
  );
  removeChildren(
    roots.cues,
    (child) =>
      child.props["Name"]?.value == AUTO_SCAN_NAMES.cue,
  );

  const display = TreeBase.create("Display", page, {
    stateName: AUTO_SCAN_NAMES.displayState,
    Name: "",
    background: "white",
    fontSize: 2,
    scale: 0.5,
  });
  display.init();

  for (let index = 0; index < plan.buttonLabels.length; index += 2) {
    const row = TreeBase.create("Stack", page, {
      direction: "row",
      background: "",
      scale: 1,
    });
    row.init();
    for (const label of plan.buttonLabels.slice(index, index + 2)) {
      const button = TreeBase.create("Button", row, {
        label: label.trim(),
        name: AUTO_SCAN_NAMES.button,
        background: "",
        scale: 1,
      });
      button.init();
    }
  }

  const action = TreeBase.create("Action", roots.actions, {
    origin: AUTO_SCAN_NAMES.button,
  });
  const condition = TreeBase.create("ActionCondition", action, {
    Condition: "",
  });
  condition.init();
  const update = TreeBase.create("ActionUpdate", action, {
    stateName: AUTO_SCAN_NAMES.displayState,
    newValue: "#label",
  });
  update.init();
  action.init();

  const cue = TreeBase.create("CueOverlay", roots.cues, {
    Name: AUTO_SCAN_NAMES.cue,
    CueType: "CueOverlay",
    Default: false,
    SpeechField: "",
    AudioField: "",
    Color: "#7BAFD4",
    Opacity: 0.3,
  });
  cue.init();

  const pattern = TreeBase.create("PatternManager", roots.patterns, {
    Cue: cue.props["Key"].value,
    Name: AUTO_SCAN_NAMES.pattern,
    Active: false,
    StartVisible: false,
  });
  const selector = TreeBase.create("PatternSelector", pattern, {});
  const groupBy = TreeBase.create("GroupBy", selector, {
    GroupBy: "#row",
    Name: "Row #row",
    Cue: cue.props["Key"].value,
    Cycles: 2,
  });
  groupBy.init();
  selector.init();
  pattern.init();

  const method = TreeBase.create("Method", roots.methods, {
    Name: AUTO_SCAN_NAMES.method,
    Pattern: pattern.props["Key"].value,
    KeyDebounce: 0,
    PointerEnterDebounce: 0,
    PointerDownDebounce: 0,
    Active: true,
  });
  const timer = TreeBase.create("Timer", method, {
    Interval: plan.intervalSeconds,
    Name: AUTO_SCAN_NAMES.timer,
  });
  timer.init();
  const timerKey = timer.props["Key"].value;

  const timerHandler = TreeBase.create("TimerHandler", method, {
    Signal: "timer",
    TimerName: timerKey,
  });
  TreeBase.create("ResponderNext", timerHandler, {
    Response: "ResponderNext",
  }).init();
  TreeBase.create("ResponderStartTimer", timerHandler, {
    Response: "ResponderStartTimer",
    TimerName: timerKey,
  }).init();
  timerHandler.init();

  const startHandler = TreeBase.create("KeyHandler", method, {
    Signal: "keyup",
  });
  TreeBase.create("HandlerKeyCondition", startHandler, {
    Condition: "",
    Key: browserKey(plan.startKey),
  }).init();
  TreeBase.create("ResponderStartTimer", startHandler, {
    Response: "ResponderStartTimer",
    TimerName: timerKey,
  }).init();
  startHandler.init();

  const selectHandler = TreeBase.create("KeyHandler", method, {
    Signal: "keyup",
  });
  TreeBase.create("HandlerKeyCondition", selectHandler, {
    Condition: "",
    Key: browserKey(plan.selectKey),
  }).init();
  TreeBase.create("ResponderActivate", selectHandler, {
    Response: "ResponderActivate",
  }).init();
  if (plan.restartAfterSelection) {
    TreeBase.create("ResponderStartTimer", selectHandler, {
      Response: "ResponderStartTimer",
      TimerName: timerKey,
    }).init();
  }
  selectHandler.init();
  method.init();

  if (options.persist ?? design === Globals) {
    await persistRoots(roots);
  }

  return {
    methodKey: method.props["Key"].value,
    timerKey,
    patternKey: pattern.props["Key"].value,
    cueKey: cue.props["Key"].value,
    buttonCount: plan.buttonLabels.length,
  };
}
