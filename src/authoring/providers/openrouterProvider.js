import { OPENAI_PLANNER_RESPONSE_SCHEMA } from "../plan/schema";
import {
  PLANNER_INSTRUCTIONS,
  normalizePlannerEnvelope,
} from "./openaiProvider";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

/** @param {string} baseUrl */
function chatCompletionsUrl(baseUrl) {
  return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
}

/** @param {any} payload */
export function extractOpenRouterResponse(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content != "string" || !content.trim()) {
    throw new Error("OpenRouter response did not contain message content");
  }
  let result;
  try {
    result = JSON.parse(content);
  } catch {
    throw new Error("OpenRouter response was not valid JSON");
  }
  return normalizePlannerEnvelope(result, "OpenRouter");
}

/** @param {any} payload */
function openRouterErrorMessage(payload) {
  return payload?.error?.message || payload?.message || "unknown error";
}

/** @param {number} status @param {any} payload */
function isStructuredOutputFailure(status, payload) {
  const message = openRouterErrorMessage(payload).toLowerCase();
  return (
    status >= 400 &&
    (message.includes("response_format") ||
      message.includes("json_schema") ||
      message.includes("structured") ||
      message.includes("require_parameters") ||
      message.includes("unsupported parameter"))
  );
}

/** @param {string} instructions @param {{role: string, content: string}[]} messages */
function chatMessages(instructions, messages) {
  return [
    { role: "system", content: instructions },
    ...messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];
}

/** Create the server-only OpenRouter planner.
 * @param {{
 *   apiKey: string,
 *   model?: string,
 *   baseUrl?: string,
 *   httpReferer?: string,
 *   title?: string,
 *   fetchImpl?: typeof fetch
 * }} options
 */
export function createOpenRouterProvider(options) {
  const {
    apiKey,
    model = "openrouter/free",
    baseUrl = DEFAULT_BASE_URL,
    httpReferer = "http://127.0.0.1:8080",
    title = "OS-DPI Authoring Dev",
    fetchImpl = globalThis.fetch,
  } = options;

  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required");
  if (typeof fetchImpl != "function") {
    throw new Error("OpenRouter planner requires fetch");
  }

  return {
    name: "openrouter",

    /** @param {{messages: {role: string, content: string}[], designSummary?: Object}} input */
    async createResponse(input) {
      const designContext = input.designSummary
        ? `\nSafe design counts: ${JSON.stringify(input.designSummary)}`
        : "";
      const instructions = `${PLANNER_INSTRUCTIONS}${designContext}`;
      const headers = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": httpReferer,
        "X-OpenRouter-Title": title,
      };
      const baseBody = {
        model,
        messages: chatMessages(instructions, input.messages),
      };

      const strictResponse = await fetchImpl(chatCompletionsUrl(baseUrl), {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...baseBody,
          provider: {
            require_parameters: true,
          },
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "osdpi_authoring_response",
              strict: true,
              schema: OPENAI_PLANNER_RESPONSE_SCHEMA,
            },
          },
        }),
      });
      const strictPayload = await strictResponse.json();
      if (strictResponse.ok) {
        return {
          ...extractOpenRouterResponse(strictPayload),
          provider: "openrouter",
          warnings: [],
        };
      }
      if (!isStructuredOutputFailure(strictResponse.status, strictPayload)) {
        throw new Error(
          `OpenRouter planner request failed (${strictResponse.status}): ${openRouterErrorMessage(strictPayload)}`,
        );
      }

      const fallbackInstructions = `${instructions}
The selected OpenRouter model may not support structured outputs. Return exactly one JSON object matching the same response schema, with no Markdown or extra text.`;
      const fallbackResponse = await fetchImpl(chatCompletionsUrl(baseUrl), {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: chatMessages(fallbackInstructions, input.messages),
        }),
      });
      const fallbackPayload = await fallbackResponse.json();
      if (!fallbackResponse.ok) {
        throw new Error(
          `OpenRouter planner fallback failed (${fallbackResponse.status}): ${openRouterErrorMessage(fallbackPayload)}`,
        );
      }
      return {
        ...extractOpenRouterResponse(fallbackPayload),
        provider: "openrouter",
        warnings: [
          "OpenRouter structured output was unavailable; used strict JSON fallback and local validation.",
        ],
      };
    },
  };
}
