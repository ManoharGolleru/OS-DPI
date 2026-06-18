import { createMockProvider } from "./mockProvider";
import { createOpenAIProvider } from "./openaiProvider";

/** Select a server-side planner without exposing credentials to the browser.
 * @param {Record<string, string | undefined>} env
 * @param {{fetchImpl?: typeof fetch}} [options]
 */
export function selectAuthoringProvider(env = {}, options = {}) {
  const requested = (env.AUTHORING_PROVIDER || "mock").toLowerCase();

  if (requested == "mock") {
    return createMockProvider();
  }
  if (requested == "openai") {
    if (!env.OPENAI_API_KEY) {
      return createMockProvider([
        "OPENAI_API_KEY is not configured; used the deterministic mock provider.",
      ]);
    }
    return createOpenAIProvider({
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL || "gpt-5.5",
      fetchImpl: options.fetchImpl,
    });
  }

  throw new Error(
    `Unsupported AUTHORING_PROVIDER "${requested}". Use "mock" or "openai".`,
  );
}
