import { UnsupportedAuthoringRequestError } from "../plan/parseMockPrompt";
import { AuthoringPlanValidationError } from "../plan/validatePlan";
import { selectAuthoringProvider } from "../providers/index";

const MAX_BODY_BYTES = 32 * 1024;

/** @param {any} request */
export function isLocalRequest(request) {
  const host = request.headers.host || "";
  const address = request.socket?.remoteAddress;
  const loopback = [
    "127.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
  ].includes(address);
  const localHost =
    host == "localhost" ||
    host.startsWith("localhost:") ||
    host == "127.0.0.1" ||
    host.startsWith("127.0.0.1:") ||
    host == "[::1]" ||
    host.startsWith("[::1]:");
  return loopback && localHost;
}

/** @param {any} request */
async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > MAX_BODY_BYTES) {
      throw new Error("Authoring request is too large");
    }
  }
  return JSON.parse(body || "{}");
}

/** Keep optional model context deliberately small and non-sensitive.
 * @param {any} summary
 */
export function sanitizeDesignSummary(summary) {
  if (!summary || typeof summary != "object" || Array.isArray(summary)) {
    return undefined;
  }
  const safe = {};
  for (const key of ["pageCount", "buttonCount", "methodCount"]) {
    if (
      typeof summary[key] == "number" &&
      Number.isInteger(summary[key]) &&
      summary[key] >= 0
    ) {
      safe[key] = summary[key];
    }
  }
  return Object.keys(safe).length ? safe : undefined;
}

/** @param {any} response */
function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

/** Local Vite middleware that returns plans and never touches OS-DPI state.
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   fetchImpl?: typeof fetch
 * }} [options]
 */
export function authoringPlanServer(options = {}) {
  const env = options.env || {};

  return {
    name: "authoring-plan-server",
    configureServer(server) {
      server.middlewares.use(
        "/api/authoring/plan",
        async (request, response) => {
          if (!isLocalRequest(request)) {
            sendJson(response, 403, {
              error: "The authoring planner endpoint is local-development only.",
            });
            return;
          }
          if (request.method != "POST") {
            sendJson(response, 405, { error: "Use POST for authoring plans." });
            return;
          }

          try {
            const body = await readJson(request);
            if (typeof body.prompt != "string" || !body.prompt.trim()) {
              sendJson(response, 400, {
                error: "prompt must be a non-empty string",
              });
              return;
            }

            const provider = selectAuthoringProvider(env, {
              fetchImpl: options.fetchImpl,
            });
            const result = await provider.createPlan({
              prompt: body.prompt,
              designSummary: sanitizeDesignSummary(body.designSummary),
            });
            sendJson(response, 200, result);
          } catch (error) {
            if (error instanceof UnsupportedAuthoringRequestError) {
              sendJson(response, 422, { error: error.message });
              return;
            }
            if (error instanceof AuthoringPlanValidationError) {
              sendJson(response, 502, { error: error.message });
              return;
            }
            sendJson(response, 500, {
              error:
                error instanceof Error
                  ? error.message
                  : "Authoring planner failed",
            });
          }
        },
      );
    },
  };
}
