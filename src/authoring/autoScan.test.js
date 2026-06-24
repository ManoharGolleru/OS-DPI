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
import "components/access/method/responses";
import "components/access/method/keyHandler";
import "components/access/method/pointerHandler";
import "components/access/method/timerHandler";
import {
  AUTO_SCAN_NAMES,
  configureAutoScan,
} from "./commands/configureAutoScan";
import {
  parseMockPrompt,
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
});

describe("plan validation", () => {
  test("reports invalid operation, keys, interval, and labels", () => {
    const result = validatePlan({
      operation: "other",
      startKey: "",
      selectKey: 4,
      intervalSeconds: 0,
      restartAfterSelection: false,
      buttonLabels: ["Yes", ""],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(5);
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
