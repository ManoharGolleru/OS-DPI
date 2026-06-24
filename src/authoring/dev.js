import Globals from "app/globals";
import "./dev.css";
import { configureAutoScan } from "./commands/configureAutoScan";
import { createSgdInterface } from "./commands/createSgdInterface";
import { parseMockPrompt } from "./plan/parseMockPrompt";
import { validatePlan } from "./plan/validatePlan";
import {
  requestAuthoringConversation,
  requestAuthoringPlan,
} from "./providers/localProvider";
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
  if (plan.operation == "create_sgd_interface") {
    const result = await createSgdInterface(plan);
    return {
      plan,
      result,
      validation: { valid: true, errors: [] },
    };
  }
  const result = await configureAutoScan(plan);
  const validation = validateAutoScanDesign(Globals, plan);
  if (!validation.valid) {
    throw new Error(validation.errors.join("; "));
  }
  return { plan, result, validation };
}

/** @param {string} title @param {string} id */
function createPanel(title, id) {
  const panel = document.createElement("section");
  panel.id = id;
  panel.className = "authoring-dev-panel";
  panel.setAttribute("aria-label", title);

  const badge = document.createElement("p");
  badge.className = "authoring-dev-badge";
  badge.textContent = "Local development tool";

  const heading = document.createElement("h2");
  heading.textContent = title;
  panel.append(badge, heading);
  return panel;
}

/** @param {HTMLElement} transcript @param {"user" | "assistant"} role @param {string} content */
function appendChatMessage(transcript, role, content) {
  const message = document.createElement("div");
  message.className = `authoring-chat-message authoring-chat-${role}`;

  const label = document.createElement("strong");
  label.textContent = role == "user" ? "You" : "Authoring assistant";

  const text = document.createElement("p");
  text.textContent = content;
  message.append(label, text);
  transcript.append(message);
  transcript.scrollTop = transcript.scrollHeight;
}

function installMockMode() {
  /** @param {string} prompt */
  async function runMockPrompt(prompt) {
    return applyPlan(parseMockPrompt(prompt));
  }

  // @ts-ignore Developer-only hook used by tests and local inspection.
  window.osdpiAuthoring = {
    runMockPrompt,
  };

  if (document.getElementById("authoringMock")) return;

  const panel = createPanel("OS-DPI Mock Authoring", "authoringMock");
  const description = document.createElement("p");
  description.textContent =
    "Create the deterministic Yes/No/Help/Stop auto-scan example.";

  const button = document.createElement("button");
  button.id = "authoringMockRun";
  button.type = "button";
  button.textContent = "Create mock auto-scan";

  const status = document.createElement("p");
  status.id = "authoringMockStatus";
  status.className = "authoring-dev-message";
  status.dataset.status = "idle";
  status.setAttribute("aria-live", "polite");
  status.textContent = "Ready.";

  button.addEventListener("click", async () => {
    button.disabled = true;
    button.dataset.status = "running";
    status.dataset.status = "running";
    status.textContent = "Creating auto-scan interface...";
    try {
      await runMockPrompt(MOCK_PROMPT);
      button.dataset.status = "complete";
      status.dataset.status = "complete";
      status.textContent = "Mock auto-scan applied.";
    } catch (error) {
      button.dataset.status = "error";
      status.dataset.status = "error";
      status.textContent =
        error instanceof Error ? error.message : "Mock authoring failed.";
    } finally {
      button.disabled = false;
    }
  });

  panel.append(description, button, status);
  document.body.append(panel);
  document.dispatchEvent(new Event("authoringready"));
}

function installLLMMode() {
  if (document.getElementById("authoringLLM")) return;

  /** @type {{role: string, content: string}[]} */
  const messages = [];
  let pendingPlan = null;
  let plannerResult = null;

  const panel = createPanel("OS-DPI LLM Authoring", "authoringLLM");

  const apiLabel = document.createElement("label");
  apiLabel.htmlFor = "authoringApiKey";
  apiLabel.textContent = "Planner API key (optional)";

  const apiKey = document.createElement("input");
  apiKey.id = "authoringApiKey";
  apiKey.type = "password";
  apiKey.autocomplete = "off";
  apiKey.spellcheck = false;
  apiKey.placeholder = "Uses server OpenAI/OpenRouter config when blank";

  const keyNote = document.createElement("p");
  keyNote.className = "authoring-dev-note";
  keyNote.textContent =
    "Kept only in this page's memory and cleared when the page reloads.";

  const transcriptLabel = document.createElement("h3");
  transcriptLabel.textContent = "Conversation";

  const transcript = document.createElement("div");
  transcript.id = "authoringTranscript";
  transcript.className = "authoring-chat-transcript";
  transcript.setAttribute("role", "log");
  transcript.setAttribute("aria-live", "polite");
  appendChatMessage(
    transcript,
    "assistant",
    "Describe an auto-scan interface or a basic QWERTY/Core vocabulary SGD interface. I can clarify the request and prepare one validated plan.",
  );

  const promptLabel = document.createElement("label");
  promptLabel.htmlFor = "authoringPrompt";
  promptLabel.textContent = "Your message";

  const prompt = document.createElement("textarea");
  prompt.id = "authoringPrompt";
  prompt.rows = 3;
  prompt.value = MOCK_PROMPT;

  const actions = document.createElement("div");
  actions.className = "authoring-dev-actions";

  const generate = document.createElement("button");
  generate.id = "authoringGenerate";
  generate.type = "button";
  generate.textContent = "Generate with LLM";

  const apply = document.createElement("button");
  apply.id = "authoringApply";
  apply.type = "button";
  apply.textContent = "Apply plan";
  apply.disabled = true;
  actions.append(generate, apply);

  const details = document.createElement("dl");
  details.className = "authoring-dev-details";

  const providerLabel = document.createElement("dt");
  providerLabel.textContent = "Provider";
  const provider = document.createElement("dd");
  provider.id = "authoringProvider";
  provider.textContent = "Not selected";

  const validationLabel = document.createElement("dt");
  validationLabel.textContent = "Validation";
  const validation = document.createElement("dd");
  validation.id = "authoringStatus";
  validation.dataset.status = "idle";
  validation.setAttribute("aria-live", "polite");
  validation.textContent = "No plan generated";
  const operationLabel = document.createElement("dt");
  operationLabel.textContent = "Operation";
  const operation = document.createElement("dd");
  operation.id = "authoringOperation";
  operation.textContent = "Not selected";
  details.append(
    providerLabel,
    provider,
    operationLabel,
    operation,
    validationLabel,
    validation,
  );

  const messagesLabel = document.createElement("h3");
  messagesLabel.textContent = "Warnings and errors";
  const notices = document.createElement("div");
  notices.id = "authoringMessages";
  notices.className = "authoring-dev-message";
  notices.setAttribute("aria-live", "polite");
  notices.textContent = "None.";

  const previewLabel = document.createElement("h3");
  previewLabel.textContent = "Returned plan";
  const preview = document.createElement("pre");
  preview.id = "authoringPlanPreview";
  preview.textContent = "No plan available.";

  function clearPendingPlan(message = "No valid plan is ready.") {
    pendingPlan = null;
    plannerResult = null;
    apply.disabled = true;
    operation.textContent = "Not selected";
    preview.textContent = message;
  }

  generate.addEventListener("click", async () => {
    const content = prompt.value.trim();
    if (!content) {
      validation.dataset.status = "error";
      validation.textContent = "Message required";
      notices.textContent = "Enter a message before generating.";
      prompt.focus();
      return;
    }

    clearPendingPlan("Waiting for a validated response.");
    generate.disabled = true;
    validation.dataset.status = "running";
    validation.textContent = "Generating";
    notices.textContent = "None.";

    messages.push({ role: "user", content });
    appendChatMessage(transcript, "user", content);
    prompt.value = "";

    try {
      plannerResult = await requestAuthoringConversation(messages, {
        apiKey: apiKey.value,
        designSummary: summarizeDesign(),
      });
      provider.textContent = plannerResult.provider;
      notices.textContent = plannerResult.warnings.length
        ? plannerResult.warnings.join("\n")
        : "None.";
      messages.push({
        role: "assistant",
        content: plannerResult.message,
      });
      appendChatMessage(transcript, "assistant", plannerResult.message);

      if (plannerResult.kind == "plan") {
        const planValidation = validatePlan(plannerResult.plan);
        if (!planValidation.valid) {
          throw new Error(planValidation.errors.join("; "));
        }
        pendingPlan = plannerResult.plan;
        apply.disabled = false;
        operation.textContent = pendingPlan.operation;
        validation.dataset.status = "ready";
        validation.textContent = "Valid plan ready";
        preview.textContent = JSON.stringify(pendingPlan, null, 2);
      } else {
        const responseKind = plannerResult.kind;
        clearPendingPlan("No plan returned.");
        validation.dataset.status = responseKind;
        validation.textContent =
          responseKind == "clarification"
            ? "Clarification needed"
            : "Unsupported request";
      }
    } catch (error) {
      clearPendingPlan("No plan available.");
      validation.dataset.status = "error";
      validation.textContent = "Plan rejected";
      notices.textContent =
        error instanceof Error ? error.message : "Plan generation failed.";
      appendChatMessage(transcript, "assistant", notices.textContent);
    } finally {
      generate.disabled = false;
    }
  });

  apply.addEventListener("click", async () => {
    if (!pendingPlan || !plannerResult || plannerResult.kind != "plan") return;
    apply.disabled = true;
    validation.dataset.status = "applying";
    validation.textContent = "Applying plan";
    try {
      const applied = await applyPlan(pendingPlan);
      validation.dataset.status = "complete";
      validation.textContent = "Plan applied";
      notices.textContent = applied.validation.valid
        ? "Plan applied and generated design validated."
        : applied.validation.errors.join("\n");
    } catch (error) {
      validation.dataset.status = "error";
      validation.textContent = "Apply failed";
      notices.textContent =
        error instanceof Error ? error.message : "Plan application failed.";
      apply.disabled = false;
    }
  });

  panel.append(
    apiLabel,
    apiKey,
    keyNote,
    transcriptLabel,
    transcript,
    promptLabel,
    prompt,
    actions,
    details,
    messagesLabel,
    notices,
    previewLabel,
    preview,
  );
  document.body.append(panel);

  // @ts-ignore Developer-only helpers for local inspection.
  window.osdpiAuthoring = {
    requestPlan: (userPrompt, options = {}) =>
      requestAuthoringPlan(userPrompt, {
        ...options,
        designSummary: summarizeDesign(),
      }),
    requestConversation: (conversation, options = {}) =>
      requestAuthoringConversation(conversation, {
        ...options,
        designSummary: summarizeDesign(),
      }),
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
