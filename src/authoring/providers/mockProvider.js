import { parseMockPrompt } from "../plan/parseMockPrompt";
import { assertValidPlan } from "../plan/validatePlan";

/** @param {string[]} [warnings] */
export function createMockProvider(warnings = []) {
  return {
    name: "mock",

    /** @param {{prompt: string, designSummary?: Object}} input */
    async createPlan(input) {
      const plan = parseMockPrompt(input.prompt);
      assertValidPlan(plan);
      return {
        plan,
        provider: "mock",
        warnings: [...warnings],
      };
    },
  };
}
