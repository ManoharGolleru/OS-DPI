import { OPENAI_PLANNER_RESPONSE_SCHEMA } from "../plan/schema";
import { assertValidPlan } from "../plan/validatePlan";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export const PLANNER_INSTRUCTIONS = `You are the OS-DPI authoring planner.
Hold a constrained conversation that can only produce one of two validated edit plans:
1. configure_auto_scan
2. create_sgd_interface
Never output OS-DPI JSON, component trees, patches, code, CSS, class names, JavaScript, HTML, or an unapproved operation.
For scanning requests, return configure_auto_scan. Default startKey to "Space", selectKey to "Enter", and intervalSeconds to 0.6.
Enter selecting the current button never implies that Enter should start scanning.
The auto-scan start and selection keys must be different.
For requests about SGD, AAC, QWERTY keyboards, core vocabulary, composing a message, a message display, delete, clear, or speech output, return create_sgd_interface.
For create_sgd_interface, use title "Generated SGD Interface", displayState "$Message", keyboard.type "qwerty", includeSpace/includeDelete/includeClear true, 1 to 40 coreVocabulary strings, and boolean action intents only.
Do not invent arbitrary actions; use only the approved action booleans in the schema.
Ask a short clarification question only when genuinely necessary.
If the request is outside these two authoring operations, return unsupported.
Return only the supplied structured response schema.`;

const OPENAI_RESPONSE_KEYS = ["kind", "message", "plan"];

/** Fill only omitted nullable model fields before strict plan validation.
 * @param {any} plan
 */
export function normalizeOpenAIPlan(plan) {
  if (!plan || typeof plan != "object" || Array.isArray(plan)) return plan;
  if (plan.operation != "configure_auto_scan") return plan;
  return {
    ...plan,
    startKey: plan.startKey ?? "Space",
    selectKey: plan.selectKey ?? "Enter",
    intervalSeconds: plan.intervalSeconds ?? 0.6,
  };
}

/** Validate and normalize the constrained planner envelope.
 * @param {any} result
 * @param {string} source
 */
export function normalizePlannerEnvelope(result, source = "Planner") {
  if (!result || typeof result != "object" || Array.isArray(result)) {
    throw new Error(`${source} response envelope must be an object`);
  }
  const unexpectedKeys = Object.keys(result).filter(
    (key) => !OPENAI_RESPONSE_KEYS.includes(key),
  );
  if (unexpectedKeys.length) {
    throw new Error(
      `${source} response contained unsupported fields: ${unexpectedKeys.join(", ")}`,
    );
  }
  if (!["clarification", "plan", "unsupported"].includes(result.kind)) {
    throw new Error(`${source} response contained an unknown kind`);
  }
  if (typeof result.message != "string" || !result.message.trim()) {
    throw new Error(`${source} response message must be a non-empty string`);
  }

  if (result.kind == "plan") {
    const plan = normalizeOpenAIPlan(result.plan);
    assertValidPlan(plan);
    return {
      kind: "plan",
      message: result.message,
      plan,
    };
  }
  if (result.plan !== null) {
    throw new Error(`${result.kind} responses must not contain a plan`);
  }
  return {
    kind: result.kind,
    message: result.message,
    plan: null,
  };
}

/** Extract the constrained authoring response from an OpenAI payload.
 * @param {any} response
 */
export function extractOpenAIResponse(response) {
  if (response?.status == "incomplete") {
    throw new Error(
      `OpenAI response was incomplete: ${response.incomplete_details?.reason || "unknown reason"}`,
    );
  }

  const content = response?.output
    ?.filter((item) => item?.type == "message")
    .flatMap((item) => item.content || []);
  const refusal = content?.find((item) => item?.type == "refusal");
  if (refusal) {
    return {
      kind: "unsupported",
      message: `Unsupported request: ${refusal.refusal || "the planner refused this request"}`,
      plan: null,
    };
  }

  const output = content?.find((item) => item?.type == "output_text");
  if (!output?.text) {
    throw new Error("OpenAI response did not contain a structured response");
  }

  let result;
  try {
    result = JSON.parse(output.text);
  } catch {
    throw new Error("OpenAI response was not valid JSON");
  }

  return normalizePlannerEnvelope(result, "OpenAI");
}

/** Create the server-only OpenAI planner.
 * @param {{
 *   apiKey: string,
 *   model?: string,
 *   fetchImpl?: typeof fetch
 * }} options
 */
export function createOpenAIProvider(options) {
  const {
    apiKey,
    model = "gpt-5.5",
    fetchImpl = globalThis.fetch,
  } = options;

  if (!apiKey) throw new Error("OPENAI_API_KEY is required");
  if (typeof fetchImpl != "function") {
    throw new Error("OpenAI planner requires fetch");
  }

  return {
    name: "openai",

    /** @param {{messages: {role: string, content: string}[], designSummary?: Object}} input */
    async createResponse(input) {
      const designContext = input.designSummary
        ? `\nSafe design counts: ${JSON.stringify(input.designSummary)}`
        : "";
      const response = await fetchImpl(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          instructions: `${PLANNER_INSTRUCTIONS}${designContext}`,
          input: input.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          text: {
            format: {
              type: "json_schema",
              name: "osdpi_authoring_response",
              schema: OPENAI_PLANNER_RESPONSE_SCHEMA,
              strict: true,
            },
          },
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          `OpenAI planner request failed (${response.status}): ${payload?.error?.message || "unknown error"}`,
        );
      }

      const result = extractOpenAIResponse(payload);
      return {
        ...result,
        provider: "openai",
        warnings: [],
      };
    },
  };
}
