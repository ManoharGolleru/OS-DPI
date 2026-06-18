import { UnsupportedAuthoringRequestError } from "../plan/parseMockPrompt";
import { AUTO_SCAN_PLAN_SCHEMA } from "../plan/schema";
import { assertValidPlan } from "../plan/validatePlan";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

const PLANNER_INSTRUCTIONS = `You are the OS-DPI authoring planner.
Translate the user's request into only the supplied configure_auto_scan plan schema.
Never output OS-DPI JSON, component trees, patches, code, or a new operation.
The only supported operation is configure_auto_scan.
If the request is not specifically asking for an auto-scan interface with a key that selects the current target, refuse instead of inventing a plan.`;

/** Extract the sole structured plan from an OpenAI Responses API payload.
 * @param {any} response
 */
export function extractOpenAIPlan(response) {
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
    throw new UnsupportedAuthoringRequestError(
      `Unsupported request: ${refusal.refusal || "the planner refused this request"}`,
    );
  }

  const output = content?.find((item) => item?.type == "output_text");
  if (!output?.text) {
    throw new Error("OpenAI response did not contain a structured plan");
  }

  let plan;
  try {
    plan = JSON.parse(output.text);
  } catch {
    throw new Error("OpenAI response was not valid JSON");
  }
  assertValidPlan(plan);
  return plan;
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

    /** @param {{prompt: string, designSummary?: Object}} input */
    async createPlan(input) {
      const response = await fetchImpl(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          instructions: PLANNER_INSTRUCTIONS,
          input: JSON.stringify({
            prompt: input.prompt,
            designSummary: input.designSummary || undefined,
          }),
          text: {
            format: {
              type: "json_schema",
              name: "osdpi_authoring_plan",
              schema: AUTO_SCAN_PLAN_SCHEMA,
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

      return {
        plan: extractOpenAIPlan(payload),
        provider: "openai",
        warnings: [],
      };
    },
  };
}
