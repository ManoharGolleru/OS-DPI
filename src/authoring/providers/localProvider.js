import { AuthoringPlanValidationError, validatePlan } from "../plan/validatePlan";

const AUTHORING_RESPONSE_KEYS = [
  "kind",
  "message",
  "plan",
  "provider",
  "warnings",
];

export class AuthoringProviderResponseError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthoringProviderResponseError";
  }
}

/** Revalidate the untrusted response returned to the browser.
 * @param {any} response
 */
export function validateProviderResponse(response) {
  if (!response || typeof response != "object" || Array.isArray(response)) {
    throw new AuthoringProviderResponseError(
      "Authoring server response must be an object",
    );
  }
  const unexpectedKeys = Object.keys(response).filter(
    (key) => !AUTHORING_RESPONSE_KEYS.includes(key),
  );
  if (unexpectedKeys.length) {
    throw new AuthoringProviderResponseError(
      `Authoring server returned unsupported fields: ${unexpectedKeys.join(", ")}`,
    );
  }
  if (!["clarification", "plan", "unsupported"].includes(response.kind)) {
    throw new AuthoringProviderResponseError(
      "Authoring server returned an unknown response kind",
    );
  }
  if (typeof response.message != "string" || !response.message.trim()) {
    throw new AuthoringProviderResponseError(
      "Authoring server message must be a non-empty string",
    );
  }
  if (!["mock", "openai", "openrouter"].includes(response.provider)) {
    throw new AuthoringProviderResponseError(
      "Authoring server returned an unknown provider",
    );
  }
  if (
    !Array.isArray(response.warnings) ||
    response.warnings.some((warning) => typeof warning != "string")
  ) {
    throw new AuthoringProviderResponseError(
      "Authoring server warnings must be strings",
    );
  }

  if (response.kind == "plan") {
    const validation = validatePlan(response.plan);
    if (!validation.valid) {
      throw new AuthoringPlanValidationError(validation.errors);
    }
  } else if (response.plan !== null) {
    throw new AuthoringProviderResponseError(
      `${response.kind} responses must not contain a plan`,
    );
  }

  return {
    kind: response.kind,
    message: response.message,
    plan: response.plan,
    provider: response.provider,
    warnings: [...response.warnings],
  };
}

/** Validate and copy the memory-only chat transcript.
 * @param {any} messages
 */
function normalizeMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) {
    throw new AuthoringProviderResponseError(
      "Authoring conversation requires at least one message",
    );
  }
  return messages.map((message) => {
    if (
      !message ||
      !["user", "assistant"].includes(message.role) ||
      typeof message.content != "string" ||
      !message.content.trim()
    ) {
      throw new AuthoringProviderResponseError(
        "Authoring messages require a user or assistant role and non-empty content",
      );
    }
    return {
      role: message.role,
      content: message.content.trim(),
    };
  });
}

/** Request a constrained chat response from the local-only endpoint.
 * @param {{role: string, content: string}[]} messages
 * @param {{
 *   apiKey?: string,
 *   designSummary?: Object,
 *   fetchImpl?: typeof fetch
 * }} [options]
 */
export async function requestAuthoringConversation(messages, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  /** @type {Record<string, string>} */
  const headers = {
    "Content-Type": "application/json",
  };
  const apiKey = options.apiKey?.trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  let response;
  try {
    response = await fetchImpl("/api/authoring/plan", {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages: normalizeMessages(messages),
        designSummary: options.designSummary,
      }),
    });
  } catch {
    throw new AuthoringProviderResponseError(
      "The local authoring server is unavailable. Start it with npm run start.",
    );
  }
  const payload = await response.json();
  if (!response.ok) {
    throw new AuthoringProviderResponseError(
      payload?.error || `Authoring server failed (${response.status})`,
    );
  }
  return validateProviderResponse(payload);
}

/** One-shot compatibility wrapper for console and tests.
 * @param {string} prompt
 * @param {{
 *   apiKey?: string,
 *   designSummary?: Object,
 *   fetchImpl?: typeof fetch
 * }} [options]
 */
export function requestAuthoringPlan(prompt, options = {}) {
  return requestAuthoringConversation(
    [{ role: "user", content: prompt }],
    options,
  );
}
