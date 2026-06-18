import { describe, expect, test, vi } from "vitest";
import {
  AuthoringProviderResponseError,
  validateProviderResponse,
} from "./localProvider";
import { createMockProvider } from "./mockProvider";
import {
  createOpenAIProvider,
  extractOpenAIPlan,
} from "./openaiProvider";
import { selectAuthoringProvider } from "./index";
import { AuthoringPlanValidationError } from "../plan/validatePlan";
import { UnsupportedAuthoringRequestError } from "../plan/parseMockPrompt";
import {
  isLocalRequest,
  sanitizeDesignSummary,
} from "../server/vitePlugin";

const PROMPT =
  "Create an auto-scan interface where Enter selects the current button.";

const VALID_PLAN = {
  operation: "configure_auto_scan",
  startKey: "Space",
  selectKey: "Enter",
  intervalSeconds: 0.6,
  restartAfterSelection: true,
  buttonLabels: ["Yes", "No", "Help", "Stop"],
};

function serverResponse(plan = VALID_PLAN) {
  return {
    plan,
    provider: "openai",
    warnings: [],
  };
}

function openAIResponse(plan = VALID_PLAN) {
  return {
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(plan) }],
      },
    ],
  };
}

describe("mock provider", () => {
  test("returns the known valid plan", async () => {
    await expect(
      createMockProvider().createPlan({ prompt: PROMPT }),
    ).resolves.toEqual({
      plan: VALID_PLAN,
      provider: "mock",
      warnings: [],
    });
  });

  test("returns a clear unsupported error", async () => {
    await expect(
      createMockProvider().createPlan({ prompt: "Build a full keyboard" }),
    ).rejects.toBeInstanceOf(UnsupportedAuthoringRequestError);
  });
});

describe("provider selection", () => {
  test("defaults to mock without provider configuration or an API key", () => {
    expect(selectAuthoringProvider({}).name).toBe("mock");
  });

  test("explicit OpenAI mode without a key falls back with a warning", async () => {
    const provider = selectAuthoringProvider({
      AUTHORING_PROVIDER: "openai",
    });
    const result = await provider.createPlan({ prompt: PROMPT });
    expect(result.provider).toBe("mock");
    expect(result.warnings[0]).toContain("OPENAI_API_KEY");
  });
});

describe("safe design context", () => {
  test("keeps counts and drops arbitrary design data", () => {
    expect(
      sanitizeDesignSummary({
        pageCount: 1,
        buttonCount: 4,
        methodCount: 2,
        layout: { className: "Layout" },
        secret: "do not send",
      }),
    ).toEqual({
      pageCount: 1,
      buttonCount: 4,
      methodCount: 2,
    });
  });

  test("accepts loopback requests and rejects a spoofed remote Host header", () => {
    expect(
      isLocalRequest({
        headers: { host: "127.0.0.1:8080" },
        socket: { remoteAddress: "127.0.0.1" },
      }),
    ).toBe(true);
    expect(
      isLocalRequest({
        headers: { host: "localhost:8080" },
        socket: { remoteAddress: "192.168.1.50" },
      }),
    ).toBe(false);
  });
});

describe("untrusted planner responses", () => {
  test.each([
    ["unknown operation", { ...VALID_PLAN, operation: "write_osdpi" }],
    [
      "missing selectKey",
      Object.fromEntries(
        Object.entries(VALID_PLAN).filter(([key]) => key != "selectKey"),
      ),
    ],
    ["invalid interval", { ...VALID_PLAN, intervalSeconds: 0 }],
    ["too few labels", { ...VALID_PLAN, buttonLabels: ["Only"] }],
    [
      "raw OS-DPI JSON",
      {
        className: "Layout",
        props: {},
        children: [{ className: "Page", props: {}, children: [] }],
      },
    ],
  ])("rejects %s", (_name, plan) => {
    expect(() => validateProviderResponse(serverResponse(plan))).toThrow(
      AuthoringPlanValidationError,
    );
  });

  test("rejects an unknown provider", () => {
    expect(() =>
      validateProviderResponse({
        ...serverResponse(),
        provider: "browser",
      }),
    ).toThrow(AuthoringProviderResponseError);
  });
});

describe("OpenAI provider", () => {
  test("uses Responses structured output and validates the returned plan", async () => {
    const fetchImpl = vi.fn(async (_url, request) => {
      const body = JSON.parse(request.body);
      expect(body.text.format.type).toBe("json_schema");
      expect(body.text.format.strict).toBe(true);
      expect(body.text.format.schema.additionalProperties).toBe(false);
      expect(body.input).toContain(PROMPT);
      return {
        ok: true,
        json: async () => openAIResponse(),
      };
    });

    const provider = createOpenAIProvider({
      apiKey: "test-key",
      fetchImpl,
    });
    await expect(
      provider.createPlan({
        prompt: PROMPT,
        designSummary: { pageCount: 1, buttonCount: 0, methodCount: 1 },
      }),
    ).resolves.toEqual(serverResponse());
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  test("rejects invalid structured model output", () => {
    expect(() =>
      extractOpenAIPlan(
        openAIResponse({ ...VALID_PLAN, operation: "write_osdpi" }),
      ),
    ).toThrow(AuthoringPlanValidationError);
  });

  test("maps a model refusal to unsupported", () => {
    expect(() =>
      extractOpenAIPlan({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "refusal", refusal: "Unsupported scope" }],
          },
        ],
      }),
    ).toThrow(UnsupportedAuthoringRequestError);
  });
});
