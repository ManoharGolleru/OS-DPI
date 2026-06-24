import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("components/errors", () => ({
  errorHandler: vi.fn(),
}));

import { Actions } from "components/actions";
import { Data } from "app/data";
import Globals from "app/globals";
import { Layout } from "components/layout";
import { MethodChooser } from "components/access/method";
import { PatternList } from "components/access/pattern";
import { CueList } from "components/access/cues";
import { State } from "app/state";
import "components/page";
import "components/stack";
import "components/button";
import "components/display";
import "components/speech";
import "components/access/method/responses";
import "components/access/method/keyHandler";
import "components/access/method/pointerHandler";
import "components/access/method/timerHandler";
import {
  AUTO_SCAN_NAMES,
  configureAutoScan,
} from "./commands/configureAutoScan";
import {
  SGD_NAMES,
  createSgdInterface,
} from "./commands/createSgdInterface";
import {
  parseMockPrompt,
  SGD_MVP_PLAN,
  UnsupportedAuthoringRequestError,
} from "./plan/parseMockPrompt";
import { validatePlan } from "./plan/validatePlan";
import { validateAutoScanDesign } from "./validate/validateAutoScanDesign";

const PROMPT =
  "Create an auto-scan interface where Enter selects the current button.";

function emptyRoot(className) {
  return { className, props: {}, children: [] };
}

function makeDesign() {
  Globals.state = new State();
  Globals.data = new Data([]);
  Globals.layout = /** @type {Layout} */ (
    Layout.fromObject({
      className: "Layout",
      props: {},
      children: [
        {
          className: "Page",
          props: { direction: "column", background: "" },
          children: [],
        },
      ],
    })
  );
  Globals.actions = /** @type {Actions} */ (
    Actions.fromObject(emptyRoot("Actions"))
  );
  Globals.cues = /** @type {CueList} */ (
    CueList.fromObject(emptyRoot("CueList"))
  );
  Globals.patterns = /** @type {PatternList} */ (
    PatternList.fromObject(emptyRoot("PatternList"))
  );
  Globals.methods = /** @type {MethodChooser} */ (
    MethodChooser.fromObject({
      className: "MethodChooser",
      props: {},
      children: [
        {
          className: "Method",
          props: {
            Name: "Existing Mouse",
            Pattern: "NullPattern",
            Active: true,
          },
          children: [],
        },
      ],
    })
  );
  return Globals;
}

function walkTree(root) {
  return [root, ...root.children.flatMap(walkTree)];
}

beforeEach(() => {
  document.body.innerHTML = '<div id="UI"></div><div id="designer"></div>';
});

describe("mock prompt adapter", () => {
  test("maps the MVP prompt to configure_auto_scan", () => {
    expect(parseMockPrompt(PROMPT)).toEqual({
      operation: "configure_auto_scan",
      startKey: "Space",
      selectKey: "Enter",
      intervalSeconds: 0.6,
      restartAfterSelection: true,
      buttonLabels: ["Yes", "No", "Help", "Stop"],
    });
  });

  test("accepts a close variant and rejects unrelated requests", () => {
    expect(
      parseMockPrompt(
        "Please make an autoscan screen where Enter activates the highlighted item",
      ).operation,
    ).toBe("configure_auto_scan");
    expect(() => parseMockPrompt("Make a keyboard")).toThrow(
      UnsupportedAuthoringRequestError,
    );
  });

  test("maps the QWERTY/Core vocabulary request to create_sgd_interface", () => {
    expect(
      parseMockPrompt(
        "I want a complex SGD interface with qwerty keyboard and also some Core vocabulary. The user should be able to see what they are composing via display and be able to delete or clear things.",
      ),
    ).toEqual(SGD_MVP_PLAN);
  });
});

describe("plan validation", () => {
  test("reports invalid auto-scan keys, interval, and labels", () => {
    const result = validatePlan({
      operation: "configure_auto_scan",
      startKey: "",
      selectKey: 4,
      intervalSeconds: 0,
      restartAfterSelection: false,
      buttonLabels: ["Yes", ""],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(4);
  });

  test("rejects unsupported operations", () => {
    const result = validatePlan({
      operation: "other",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "operation must be configure_auto_scan or create_sgd_interface",
    );
  });

  test.each([
    ["Enter", "Enter"],
    [" enter ", "ENTER"],
    ["Space", "spacebar"],
  ])("rejects equivalent start and select keys: %s / %s", (startKey, selectKey) => {
    const result = validatePlan({
      operation: "configure_auto_scan",
      startKey,
      selectKey,
      intervalSeconds: 0.6,
      restartAfterSelection: true,
      buttonLabels: ["Yes", "No"],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "startKey and selectKey must be different keys",
    );
  });

  test("rejects unknown fields and raw OS-DPI JSON", () => {
    expect(
      validatePlan({
        ...parseMockPrompt(PROMPT),
        children: [{ className: "Page" }],
      }).errors,
    ).toContain("unsupported plan fields: children");
    expect(
      validatePlan({
        className: "Layout",
        props: {},
        children: [],
      }).valid,
    ).toBe(false);
  });

  test("accepts a valid SGD plan and rejects unsafe SGD variants", () => {
    expect(validatePlan(SGD_MVP_PLAN)).toEqual({ valid: true, errors: [] });
    expect(
      validatePlan({
        ...SGD_MVP_PLAN,
        css: ".button { color: red }",
      }).errors,
    ).toContain("unsupported plan fields: css");
    expect(
      validatePlan({
        ...SGD_MVP_PLAN,
        keyboard: {
          ...SGD_MVP_PLAN.keyboard,
          className: "Grid",
        },
      }).errors,
    ).toContain("keyboard contains unsupported fields: className");
    expect(
      validatePlan({
        ...SGD_MVP_PLAN,
        actions: {
          ...SGD_MVP_PLAN.actions,
          arbitraryExpression: "$Message = evil()",
        },
      }).errors,
    ).toContain("actions contains unsupported fields: arbitraryExpression");
  });
});

describe("configureAutoScan", () => {
  test("creates the known-good timer and key-handler structure", async () => {
    const design = makeDesign();
    const plan = parseMockPrompt(PROMPT);
    await configureAutoScan(plan, design, { persist: false });

    const validation = validateAutoScanDesign(design, plan);
    expect(validation).toEqual({ valid: true, errors: [] });

    const method = design.methods.children.find(
      (child) => child.Name?.value == AUTO_SCAN_NAMES.method,
    );
    expect(method).toBeDefined();
    if (!method) throw new Error("generated method missing");
    const classes = method.children.map((child) => child.className);
    expect(classes).toEqual([
      "Timer",
      "TimerHandler",
      "KeyHandler",
      "KeyHandler",
    ]);
    expect(method.children[1].children.map((child) => child.className)).toEqual(
      ["ResponderNext", "ResponderStartTimer"],
    );
    expect(method.children[3].children.map((child) => child.className)).toEqual(
      [
        "HandlerKeyCondition",
        "ResponderActivate",
        "ResponderStartTimer",
      ],
    );
  });

  test("is idempotent and preserves another active method", async () => {
    const design = makeDesign();
    const plan = parseMockPrompt(PROMPT);
    await configureAutoScan(plan, design, { persist: false });
    await configureAutoScan(plan, design, { persist: false });

    expect(
      design.methods.children.filter(
        (child) => child.Name?.value == AUTO_SCAN_NAMES.method,
      ),
    ).toHaveLength(1);
    expect(
      design.methods.children.filter((child) => child.Active?.value),
    ).toHaveLength(2);
    expect(
      design.cues.children.filter(
        (child) => child.Name?.value == AUTO_SCAN_NAMES.cue,
      ),
    ).toHaveLength(1);
    expect(
      design.patterns.children.filter(
        (child) => child.Name?.value == AUTO_SCAN_NAMES.pattern,
      ),
    ).toHaveLength(1);

    const generatedButtons = design.layout
      .toObject()
      .children[0].children.flatMap((child) => child.children)
      .filter((child) => child.props?.name == AUTO_SCAN_NAMES.button);
    expect(generatedButtons).toHaveLength(4);
    expect(
      design.layout.children[0].children.filter(
        (child) =>
          child.className == "Stack" &&
          child.children.some(
            (button) => button.props["name"]?.value == AUTO_SCAN_NAMES.button,
          ),
      ),
    ).toHaveLength(2);
    expect(validateAutoScanDesign(design, plan).valid).toBe(true);
  });
});

describe("createSgdInterface", () => {
  test("creates visible display, QWERTY keys, vocabulary, controls, and speech", async () => {
    const design = makeDesign();
    await createSgdInterface(SGD_MVP_PLAN, design, { persist: false });

    const nodes = walkTree(design.layout);
    expect(
      nodes.find(
        (node) =>
          node.className == "Button" &&
          node.props["name"]?.value == SGD_NAMES.title,
      )?.props["label"]?.value,
    ).toBe("Generated SGD Interface");
    expect(
      nodes.find(
        (node) =>
          node.className == "Display" &&
          node.props["Name"]?.value == SGD_NAMES.display,
      )?.props["stateName"]?.value,
    ).toBe("$Message");
    expect(
      nodes.filter(
        (node) =>
          node.className == "Button" &&
          node.props["name"]?.value == SGD_NAMES.letterButton,
      ),
    ).toHaveLength(26);
    expect(
      nodes.filter(
        (node) =>
          node.className == "Button" &&
          node.props["name"]?.value == SGD_NAMES.coreButton,
      ),
    ).toHaveLength(10);
    for (const name of [
      SGD_NAMES.deleteButton,
      SGD_NAMES.clearButton,
      SGD_NAMES.speakButton,
    ]) {
      expect(
        nodes.some(
          (node) =>
            node.className == "Button" && node.props["name"]?.value == name,
        ),
      ).toBe(true);
    }
    expect(
      nodes.some(
        (node) =>
          node.className == "Speech" &&
          node.props["stateName"]?.value == SGD_NAMES.speechState,
      ),
    ).toBe(true);
  });

  test("uses fixed action templates for composing, delete, clear, and speak", async () => {
    const design = makeDesign();
    await createSgdInterface(SGD_MVP_PLAN, design, { persist: false });

    design.actions.applyRules(SGD_NAMES.letterButton, "press", { label: "a" });
    expect(design.state.get("$Message")).toBe("a");
    design.actions.applyRules(SGD_NAMES.coreButton, "press", { label: "go" });
    expect(design.state.get("$Message")).toBe("ago ");
    design.actions.applyRules(SGD_NAMES.deleteButton, "press", {});
    expect(design.state.get("$Message")).toBe("ago");
    design.actions.applyRules(SGD_NAMES.clearButton, "press", {});
    expect(design.state.get("$Message")).toBe("");
    design.state.update({ $Message: "hello" });
    design.actions.applyRules(SGD_NAMES.speakButton, "press", {});
    expect(design.state.get(SGD_NAMES.speechState)).toBe("hello");
  });

  test("is idempotent and does not duplicate generated nodes", async () => {
    const design = makeDesign();
    await createSgdInterface(SGD_MVP_PLAN, design, { persist: false });
    await createSgdInterface(SGD_MVP_PLAN, design, { persist: false });

    const nodes = walkTree(design.layout);
    expect(
      nodes.filter(
        (node) =>
          node.className == "Display" &&
          node.props["Name"]?.value == SGD_NAMES.display,
      ),
    ).toHaveLength(1);
    expect(
      nodes.filter(
        (node) =>
          node.className == "Button" &&
          node.props["name"]?.value == SGD_NAMES.letterButton,
      ),
    ).toHaveLength(26);
    expect(
      design.actions.children.filter((child) =>
        [
          SGD_NAMES.letterButton,
          SGD_NAMES.coreButton,
          SGD_NAMES.spaceButton,
          SGD_NAMES.deleteButton,
          SGD_NAMES.clearButton,
          SGD_NAMES.speakButton,
        ].includes(child.props["origin"]?.value),
      ),
    ).toHaveLength(6);
  });

  test("does not break configureAutoScan when both commands are used", async () => {
    const design = makeDesign();
    await createSgdInterface(SGD_MVP_PLAN, design, { persist: false });
    const scanPlan = parseMockPrompt(PROMPT);
    await configureAutoScan(scanPlan, design, { persist: false });

    expect(validateAutoScanDesign(design, scanPlan)).toEqual({
      valid: true,
      errors: [],
    });
    expect(
      walkTree(design.layout).filter(
        (node) =>
          node.className == "Button" &&
          node.props["name"]?.value == SGD_NAMES.letterButton,
      ),
    ).toHaveLength(26);
  });
});
