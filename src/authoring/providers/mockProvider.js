import {
  parseMockPrompt,
  UnsupportedAuthoringRequestError,
} from "../plan/parseMockPrompt";
import { assertValidPlan } from "../plan/validatePlan";

/** @param {string[]} [warnings] */
export function createMockProvider(warnings = []) {
  return {
    name: "mock",

    /** @param {{messages: {role: string, content: string}[], designSummary?: Object}} input */
    async createResponse(input) {
      const prompt =
        [...input.messages]
          .reverse()
          .find((message) => message.role == "user")?.content || "";
      try {
        const plan = parseMockPrompt(prompt);
        assertValidPlan(plan);
        return {
          kind: "plan",
          message: "The deterministic auto-scan plan is ready to review.",
          plan,
          provider: "mock",
          warnings: [...warnings],
        };
      } catch (error) {
        if (!(error instanceof UnsupportedAuthoringRequestError)) throw error;
        return {
          kind: "unsupported",
          message: error.message,
          plan: null,
          provider: "mock",
          warnings: [...warnings],
        };
      }
    },
  };
}
