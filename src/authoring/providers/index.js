import { createMockProvider } from "./mockProvider";
import { createOpenAIProvider } from "./openaiProvider";
import { createOpenRouterProvider } from "./openrouterProvider";

/** Select a server-side planner without exposing credentials to the browser.
 * @param {Record<string, string | undefined>} env
 * @param {{apiKey?: string, fetchImpl?: typeof fetch}} [options]
 */
export function selectAuthoringProvider(env = {}, options = {}) {
  const requested = (env.AUTHORING_PROVIDER || "mock").toLowerCase();

  if (options.apiKey) {
    if (requested == "openrouter") {
      return createOpenRouterProvider({
        apiKey: options.apiKey,
        model: env.OPENROUTER_MODEL || "openrouter/free",
        baseUrl: env.OPENROUTER_BASE_URL,
        httpReferer:
          env.OPENROUTER_HTTP_REFERER || "http://127.0.0.1:8080",
        title: env.OPENROUTER_TITLE || "OS-DPI Authoring Dev",
        fetchImpl: options.fetchImpl,
      });
    }
    if (requested == "mock" || requested == "openai") {
      return createOpenAIProvider({
        apiKey: options.apiKey,
        model: env.OPENAI_MODEL || "gpt-5.5",
        fetchImpl: options.fetchImpl,
      });
    }
  }

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
  if (requested == "openrouter") {
    if (!env.OPENROUTER_API_KEY) {
      return createMockProvider([
        "OPENROUTER_API_KEY is not configured; used the deterministic mock provider.",
      ]);
    }
    return createOpenRouterProvider({
      apiKey: env.OPENROUTER_API_KEY,
      model: env.OPENROUTER_MODEL || "openrouter/free",
      baseUrl: env.OPENROUTER_BASE_URL,
      httpReferer: env.OPENROUTER_HTTP_REFERER || "http://127.0.0.1:8080",
      title: env.OPENROUTER_TITLE || "OS-DPI Authoring Dev",
      fetchImpl: options.fetchImpl,
    });
  }

  throw new Error(
    `Unsupported AUTHORING_PROVIDER "${requested}". Use "mock", "openai", or "openrouter".`,
  );
}
