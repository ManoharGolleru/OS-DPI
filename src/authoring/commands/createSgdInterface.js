import Globals from "app/globals";
import { TreeBase } from "components/treebase";
import { assertValidPlan } from "../plan/validatePlan";

export const SGD_NAMES = {
  rootButtonPrefix: "authoring-sgd-",
  title: "authoring-sgd-title",
  sectionLabel: "authoring-sgd-section-label",
  display: "authoring-sgd-display",
  letterButton: "authoring-sgd-letter",
  coreButton: "authoring-sgd-core-word",
  spaceButton: "authoring-sgd-space",
  deleteButton: "authoring-sgd-delete",
  clearButton: "authoring-sgd-clear",
  speakButton: "authoring-sgd-speak",
  speechState: "$AuthoringSgdSpeak",
};

const QWERTY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

/** @param {TreeBase} root */
function walk(root) {
  const result = [root];
  for (const child of root.children) {
    result.push(...walk(child));
  }
  return result;
}

/** @param {TreeBase} component */
function isGeneratedSgdLeaf(component) {
  if (
    component.className == "Button" &&
    component.props["name"]?.value?.startsWith(SGD_NAMES.rootButtonPrefix)
  ) {
    return true;
  }
  if (
    component.className == "Display" &&
    component.props["Name"]?.value == SGD_NAMES.display
  ) {
    return true;
  }
  return (
    component.className == "Speech" &&
    component.props["stateName"]?.value == SGD_NAMES.speechState
  );
}

/** Remove only the generated SGD layout and speech nodes.
 * @param {TreeBase} page
 */
function removeGeneratedLayout(page) {
  for (const child of [...page.children]) {
    if (child.className == "Stack" && walk(child).some(isGeneratedSgdLeaf)) {
      child.remove();
    }
  }

  for (const component of [...walk(page)].reverse()) {
    if (component.parent && isGeneratedSgdLeaf(component)) {
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
  };
}

/** @param {ReturnType<typeof designRoots>} roots */
function assertRoots(roots) {
  for (const [name, root] of Object.entries(roots)) {
    if (!root || !Array.isArray(root.children)) {
      throw new Error(`SGD authoring requires a ${name} design root`);
    }
  }
}

/** @param {ReturnType<typeof designRoots>} roots */
async function persistRoots(roots) {
  for (const root of Object.values(roots)) {
    if (typeof root.onUpdate == "function") {
      await root.onUpdate();
    }
  }
}

/** @param {TreeBase} parent @param {string} label @param {string} name @param {number} scale */
function createButton(parent, label, name, scale = 1) {
  const button = TreeBase.create("Button", parent, {
    label,
    name,
    background: "",
    scale,
  });
  button.init();
  return button;
}

/** @param {TreeBase} parent @param {string} direction @param {number} scale */
function createStack(parent, direction, scale = 1) {
  const stack = TreeBase.create("Stack", parent, {
    direction,
    background: "",
    scale,
  });
  stack.init();
  return stack;
}

/** @param {TreeBase} actions @param {string[]} origins */
function removeGeneratedActions(actions, origins) {
  removeChildren(
    actions,
    (child) =>
      child.className == "Action" &&
      origins.includes(child.props["origin"]?.value),
  );
}

/** @param {TreeBase} actions @param {string} origin @param {string} stateName @param {string} newValue */
function createAction(actions, origin, stateName, newValue) {
  const action = TreeBase.create("Action", actions, { origin });
  TreeBase.create("ActionCondition", action, { Condition: "" }).init();
  TreeBase.create("ActionUpdate", action, { stateName, newValue }).init();
  action.init();
  return action;
}

/** Create a basic, deterministic SGD interface from a validated intent plan.
 *
 * The LLM supplies only booleans and labels; all OS-DPI action expressions are
 * fixed templates owned by this command.
 *
 * @param {Object} plan
 * @param {Object} [design]
 * @param {{persist?: boolean}} [options]
 */
export async function createSgdInterface(
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
  const generatedOrigins = [
    SGD_NAMES.letterButton,
    SGD_NAMES.coreButton,
    SGD_NAMES.spaceButton,
    SGD_NAMES.deleteButton,
    SGD_NAMES.clearButton,
    SGD_NAMES.speakButton,
  ];
  removeGeneratedActions(roots.actions, generatedOrigins);

  design.state?.define?.(plan.displayState, "");
  design.state?.define?.(SGD_NAMES.speechState, "");

  const root = createStack(page, "column", 1);
  createButton(root, plan.title.trim(), SGD_NAMES.title, 0.45);

  const display = TreeBase.create("Display", root, {
    stateName: plan.displayState,
    Name: SGD_NAMES.display,
    background: "white",
    fontSize: 1.6,
    scale: 0.9,
  });
  display.init();

  createButton(root, "Core vocabulary", SGD_NAMES.sectionLabel, 0.35);
  for (let index = 0; index < plan.coreVocabulary.length; index += 5) {
    const row = createStack(root, "row", 0.55);
    for (const word of plan.coreVocabulary.slice(index, index + 5)) {
      createButton(row, word.trim(), SGD_NAMES.coreButton);
    }
  }

  createButton(root, "QWERTY keyboard", SGD_NAMES.sectionLabel, 0.35);
  for (const letters of QWERTY_ROWS) {
    const row = createStack(root, "row", 0.55);
    for (const letter of letters) {
      createButton(row, letter, SGD_NAMES.letterButton);
    }
  }

  const controls = createStack(root, "row", 0.65);
  if (plan.keyboard.includeSpace) {
    createButton(controls, "Space", SGD_NAMES.spaceButton, 2);
  }
  if (plan.keyboard.includeDelete) {
    createButton(controls, "Delete", SGD_NAMES.deleteButton);
  }
  if (plan.keyboard.includeClear) {
    createButton(controls, "Clear", SGD_NAMES.clearButton);
  }
  if (plan.actions.speakUsesDisplay) {
    createButton(controls, "Speak", SGD_NAMES.speakButton);
  }

  if (plan.actions.lettersAppendToDisplay) {
    createAction(
      roots.actions,
      SGD_NAMES.letterButton,
      plan.displayState,
      "add_letter(#label)",
    );
  }
  if (plan.actions.coreWordsAppendToDisplay) {
    createAction(
      roots.actions,
      SGD_NAMES.coreButton,
      plan.displayState,
      "add_word(#label)",
    );
  }
  if (plan.keyboard.includeSpace) {
    createAction(
      roots.actions,
      SGD_NAMES.spaceButton,
      plan.displayState,
      'add_letter(" ")',
    );
  }
  if (plan.keyboard.includeDelete && plan.actions.deleteRemovesLastCharacter) {
    createAction(
      roots.actions,
      SGD_NAMES.deleteButton,
      plan.displayState,
      'replace_last_letter("")',
    );
  }
  if (plan.keyboard.includeClear && plan.actions.clearEmptiesDisplay) {
    createAction(roots.actions, SGD_NAMES.clearButton, plan.displayState, '""');
  }
  if (plan.actions.speakUsesDisplay) {
    createAction(
      roots.actions,
      SGD_NAMES.speakButton,
      SGD_NAMES.speechState,
      plan.displayState,
    );
    const speech = TreeBase.create("Speech", page, {
      stateName: SGD_NAMES.speechState,
      voiceURI: "",
      pitch: 1,
      rate: 1,
      volume: 1,
    });
    speech.init();
  }

  if (options.persist ?? design === Globals) {
    await persistRoots(roots);
  }

  return {
    displayState: plan.displayState,
    coreVocabularyCount: plan.coreVocabulary.length,
    letterButtonCount: QWERTY_ROWS.join("").length,
    includesSpeak: plan.actions.speakUsesDisplay,
  };
}
