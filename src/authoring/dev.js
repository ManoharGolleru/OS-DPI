import Globals from "app/globals";
import { configureAutoScan } from "./commands/configureAutoScan";
import { parseMockPrompt } from "./plan/parseMockPrompt";
import { validatePlan } from "./plan/validatePlan";
import { requestAuthoringPlan } from "./providers/localProvider";
import { validateAutoScanDesign } from "./validate/validateAutoScanDesign";

const MOCK_PROMPT =
  "Create an auto-scan interface where Enter selects the current button.";

/** @param {TreeBase} root */
function walk(root) {
  if (!root) return [];
  return [root, ...root.children.flatMap(walk)];
}

/** Return counts only; never send the design tree to a planner. */
function summarizeDesign() {
  return {
    pageCount: walk(Globals.layout).filter(
      (component) => component.className == "Page",
    ).length,
    buttonCount: walk(Globals.layout).filter(
      (component) => component.className == "Button",
    ).length,
    methodCount: Globals.methods?.children?.length || 0,
  };
}

/** Apply only a validated plan through the existing OS-DPI command. */
async function applyPlan(plan) {
  const planValidation = validatePlan(plan);
  if (!planValidation.valid) {
    throw new Error(planValidation.errors.join("; "));
  }
  const result = await configureAutoScan(plan);
  const validation = validateAutoScanDesign(Globals, plan);
  if (!validation.valid) {
    throw new Error(validation.errors.join("; "));
  }
  return { plan, result, validation };
}

function installMockMode() {
  /** @param {string} prompt */
  async function runMockPrompt(prompt) {
    return applyPlan(parseMockPrompt(prompt));
  }

  // @ts-ignore Developer-only hook used by the browser test.
  window.osdpiAuthoring = {
    runMockPrompt,
  };

  if (!document.getElementById("authoringMockRun")) {
    const button = document.createElement("button");
    button.id = "authoringMockRun";
    button.textContent = "Create mock auto-scan";
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.dataset.status = "running";
      try {
        await runMockPrompt(MOCK_PROMPT);
        button.dataset.status = "complete";
      } catch (error) {
        button.dataset.status = "error";
        throw error;
      } finally {
        button.disabled = false;
      }
    });
    document.body.append(button);
  }
  document.dispatchEvent(new Event("authoringready"));
}

function installLLMMode() {
  if (document.getElementById("authoringLLM")) return;

  let pendingPlan = null;
  let plannerResult = null;

  const container = document.createElement("section");
  container.id = "authoringLLM";

  const label = document.createElement("label");
  label.htmlFor = "authoringPrompt";
  label.textContent = "Authoring prompt";

  const input = document.createElement("input");
  input.id = "authoringPrompt";
  input.type = "text";
  input.value = MOCK_PROMPT;

  const generate = document.createElement("button");
  generate.id = "authoringGenerate";
  generate.type = "button";
  generate.textContent = "Generate with LLM";

  const apply = document.createElement("button");
  apply.id = "authoringApply";
  apply.type = "button";
  apply.textContent = "Apply plan";
  apply.disabled = true;

  const status = document.createElement("pre");
  status.id = "authoringStatus";
  status.setAttribute("aria-live", "polite");
  status.textContent = "No plan generated.";

  generate.addEventListener("click", async () => {
    pendingPlan = null;
    plannerResult = null;
    apply.disabled = true;
    generate.disabled = true;
    status.dataset.status = "running";
    status.textContent = "Generating plan...";
    try {
      plannerResult = await requestAuthoringPlan(input.value, {
        designSummary: summarizeDesign(),
      });
      pendingPlan = plannerResult.plan;
      const validation = validatePlan(pendingPlan);
      apply.disabled = !validation.valid;
      status.dataset.status = validation.valid ? "ready" : "error";
      status.textContent = JSON.stringify(
        {
          provider: plannerResult.provider,
          warnings: plannerResult.warnings,
          plan: pendingPlan,
          validation,
        },
        null,
        2,
      );
    } catch (error) {
      status.dataset.status = "error";
      status.textContent =
        error instanceof Error ? error.message : "Plan generation failed";
    } finally {
      generate.disabled = false;
    }
  });

  apply.addEventListener("click", async () => {
    if (!pendingPlan || !plannerResult) return;
    apply.disabled = true;
    status.dataset.status = "applying";
    try {
      const applied = await applyPlan(pendingPlan);
      status.dataset.status = "complete";
      status.textContent = JSON.stringify(
        {
          provider: plannerResult.provider,
          warnings: plannerResult.warnings,
          plan: pendingPlan,
          validation: applied.validation,
        },
        null,
        2,
      );
    } catch (error) {
      status.dataset.status = "error";
      status.textContent =
        error instanceof Error ? error.message : "Plan application failed";
      apply.disabled = false;
    }
  });

  container.append(label, input, generate, apply, status);
  document.body.append(container);

  // @ts-ignore Developer-only hook used for local inspection.
  window.osdpiAuthoring = {
    requestPlan: requestAuthoringPlan,
    applyPlan,
  };
  document.dispatchEvent(new Event("authoringready"));
}

/** Install deliberately small authoring hooks on local development URLs. */
export function installMockAuthoring() {
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  if (!local) return;

  const mode = new URLSearchParams(location.search).get("authoring");
  if (mode == "mock") installMockMode();
  if (mode == "llm") installLLMMode();
}
