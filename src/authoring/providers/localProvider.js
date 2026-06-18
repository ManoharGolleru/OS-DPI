import { AuthoringPlanValidationError, validatePlan } from "../plan/validatePlan";

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
  if (!["mock", "openai"].includes(response.provider)) {
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

  const validation = validatePlan(response.plan);
  if (!validation.valid) {
    throw new AuthoringPlanValidationError(validation.errors);
  }

  return {
    plan: response.plan,
    provider: response.provider,
    warnings: [...response.warnings],
  };
}

/** Request a plan from the local-only authoring endpoint.
 * @param {string} prompt
 * @param {{designSummary?: Object, fetchImpl?: typeof fetch}} [options]
 */
export async function requestAuthoringPlan(prompt, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  let response;
  try {
    response = await fetchImpl("/api/authoring/plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
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
