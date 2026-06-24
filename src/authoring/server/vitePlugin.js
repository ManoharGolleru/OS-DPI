import { AuthoringPlanValidationError } from "../plan/validatePlan";
import { selectAuthoringProvider } from "../providers/index";

const MAX_BODY_BYTES = 32 * 1024;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4000;

class AuthoringRequestError extends Error {}

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
      throw new AuthoringRequestError("Authoring request is too large");
    }
  }
  try {
    return JSON.parse(body || "{}");
  } catch {
    throw new AuthoringRequestError("Authoring request body must be valid JSON");
  }
}

/** Read an optional memory-only API key without putting it in the JSON body.
 * @param {any} request
 */
export function extractBearerToken(request) {
  const authorization = request.headers.authorization;
  if (!authorization) return "";
  if (
    typeof authorization != "string" ||
    !authorization.startsWith("Bearer ") ||
    !authorization.slice(7).trim()
  ) {
    throw new AuthoringRequestError(
      "Authorization header must use a non-empty Bearer token",
    );
  }
  return authorization.slice(7).trim();
}

/** Keep chat input small and limited to user/assistant text.
 * @param {any} messages
 */
export function sanitizeMessages(messages) {
  if (
    !Array.isArray(messages) ||
    !messages.length ||
    messages.length > MAX_MESSAGES
  ) {
    throw new AuthoringRequestError(
      `messages must contain between 1 and ${MAX_MESSAGES} entries`,
    );
  }
  const safe = messages.map((message) => {
    if (
      !message ||
      !["user", "assistant"].includes(message.role) ||
      typeof message.content != "string" ||
      !message.content.trim() ||
      message.content.length > MAX_MESSAGE_LENGTH
    ) {
      throw new AuthoringRequestError(
        "messages require a user or assistant role and bounded non-empty text",
      );
    }
    return {
      role: message.role,
      content: message.content.trim(),
    };
  });
  if (safe[safe.length - 1].role != "user") {
    throw new AuthoringRequestError(
      "the latest authoring message must be from the user",
    );
  }
  return safe;
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
            const messages = sanitizeMessages(body.messages);
            const apiKey = extractBearerToken(request);

            const provider = selectAuthoringProvider(env, {
              apiKey,
              fetchImpl: options.fetchImpl,
            });
            const result = await provider.createResponse({
              messages,
              designSummary: sanitizeDesignSummary(body.designSummary),
            });
            sendJson(response, 200, result);
          } catch (error) {
            if (error instanceof AuthoringRequestError) {
              sendJson(response, 400, { error: error.message });
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
