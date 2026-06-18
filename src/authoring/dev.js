import Globals from "app/globals";
import { configureAutoScan } from "./commands/configureAutoScan";
import { parseMockPrompt } from "./plan/parseMockPrompt";
import { validateAutoScanDesign } from "./validate/validateAutoScanDesign";

/** Install a deliberately small console/test hook on local development URLs. */
export function installMockAuthoring() {
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  const enabled = new URLSearchParams(location.search).get("authoring") == "mock";
  if (!local || !enabled) return;

  /** @param {string} prompt */
  async function runMockPrompt(prompt) {
    const plan = parseMockPrompt(prompt);
    const result = await configureAutoScan(plan);
    const validation = validateAutoScanDesign(Globals, plan);
    if (!validation.valid) {
      throw new Error(validation.errors.join("; "));
    }
    return { plan, result, validation };
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
        await runMockPrompt(
          "Create an auto-scan interface where Enter selects the current button.",
        );
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
