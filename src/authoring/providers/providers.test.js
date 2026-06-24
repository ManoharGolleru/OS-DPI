import { describe, expect, test, vi } from "vitest";
import {
  AuthoringProviderResponseError,
  requestAuthoringConversation,
  validateProviderResponse,
} from "./localProvider";
import { createMockProvider } from "./mockProvider";
import {
  createOpenAIProvider,
  extractOpenAIResponse,
  normalizeOpenAIPlan,
} from "./openaiProvider";
import { selectAuthoringProvider } from "./index";
import { AuthoringPlanValidationError } from "../plan/validatePlan";
import {
  extractBearerToken,
  isLocalRequest,
  sanitizeDesignSummary,
  sanitizeMessages,
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

const USER_MESSAGES = [{ role: "user", content: PROMPT }];

function serverResponse(overrides = {}) {
  return {
    kind: "plan",
    message: "Plan ready.",
    plan: VALID_PLAN,
    provider: "openai",
    warnings: [],
    ...overrides,
  };
}

function openAIResponse(result = {}) {
  return {
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              kind: "plan",
              message: "Plan ready.",
              plan: VALID_PLAN,
              ...result,
            }),
          },
        ],
      },
    ],
  };
}

describe("mock provider", () => {
  test("returns the known valid plan envelope", async () => {
    await expect(
      createMockProvider().createResponse({ messages: USER_MESSAGES }),
    ).resolves.toEqual({
      kind: "plan",
      message: "The deterministic auto-scan plan is ready to review.",
      plan: VALID_PLAN,
      provider: "mock",
      warnings: [],
    });
  });

  test("returns a clear unsupported envelope", async () => {
    await expect(
      createMockProvider().createResponse({
        messages: [{ role: "user", content: "Build a full keyboard" }],
      }),
    ).resolves.toMatchObject({
      kind: "unsupported",
      plan: null,
      provider: "mock",
    });
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
    const result = await provider.createResponse({ messages: USER_MESSAGES });
    expect(result.provider).toBe("mock");
    expect(result.warnings[0]).toContain("OPENAI_API_KEY");
  });

  test("a pasted key takes precedence over mock environment configuration", () => {
    expect(
      selectAuthoringProvider(
        { AUTHORING_PROVIDER: "mock" },
        { apiKey: "sk-memory-only", fetchImpl: vi.fn() },
      ).name,
    ).toBe("openai");
  });
});

describe("safe local request handling", () => {
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

  test("accepts bounded chat messages ending with the user", () => {
    expect(
      sanitizeMessages([
        { role: "user", content: "  Create auto-scan  " },
        { role: "assistant", content: "Which labels?" },
        { role: "user", content: "Yes and No" },
      ]),
    ).toEqual([
      { role: "user", content: "Create auto-scan" },
      { role: "assistant", content: "Which labels?" },
      { role: "user", content: "Yes and No" },
    ]);
  });

  test("extracts only a non-empty Bearer token", () => {
    expect(
      extractBearerToken({
        headers: { authorization: "Bearer sk-memory-only" },
      }),
    ).toBe("sk-memory-only");
    expect(() =>
      extractBearerToken({ headers: { authorization: "Basic secret" } }),
    ).toThrow("Bearer");
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

  test("sends the pasted key only in the Authorization header", async () => {
    const fetchImpl = vi.fn(async (_url, request) => {
      expect(request.headers.Authorization).toBe("Bearer sk-memory-only");
      expect(request.body).not.toContain("sk-memory-only");
      expect(JSON.parse(request.body)).toEqual({
        messages: USER_MESSAGES,
      });
      return {
        ok: true,
        json: async () => serverResponse(),
      };
    });

    await requestAuthoringConversation(USER_MESSAGES, {
      apiKey: "sk-memory-only",
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe("untrusted planner response envelopes", () => {
  test.each([
    ["unknown operation", { ...VALID_PLAN, operation: "write_osdpi" }],
    ["same start and select key", { ...VALID_PLAN, startKey: "Enter" }],
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
    expect(() => validateProviderResponse(serverResponse({ plan }))).toThrow(
      AuthoringPlanValidationError,
    );
  });

  test.each(["clarification", "unsupported"])(
    "accepts a %s response without a plan",
    (kind) => {
      expect(
        validateProviderResponse(
          serverResponse({
            kind,
            message: `${kind} message`,
            plan: null,
          }),
        ),
      ).toMatchObject({ kind, plan: null });
    },
  );

  test("rejects a clarification response containing a plan", () => {
    expect(() =>
      validateProviderResponse(
        serverResponse({
          kind: "clarification",
        }),
      ),
    ).toThrow(AuthoringProviderResponseError);
  });

  test("rejects unknown response fields", () => {
    expect(() =>
      validateProviderResponse({
        ...serverResponse(),
        osdpi: { className: "Layout" },
      }),
    ).toThrow(AuthoringProviderResponseError);
  });
});

describe("OpenAI provider", () => {
  test("uses a constrained conversation and structured response schema", async () => {
    const fetchImpl = vi.fn(async (_url, request) => {
      const body = JSON.parse(request.body);
      expect(body.text.format.type).toBe("json_schema");
      expect(body.text.format.strict).toBe(true);
      expect(body.text.format.schema.additionalProperties).toBe(false);
      expect(body.instructions).toContain(
        'default startKey to "Space", selectKey to "Enter"',
      );
      expect(body.instructions).toContain(
        "never implies that Enter should start scanning",
      );
      expect(body.input).toEqual(USER_MESSAGES);
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
      provider.createResponse({
        messages: USER_MESSAGES,
        designSummary: { pageCount: 1, buttonCount: 0, methodCount: 1 },
      }),
    ).resolves.toEqual(serverResponse());
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  test("fills only omitted planner defaults", () => {
    expect(
      normalizeOpenAIPlan({
        operation: "configure_auto_scan",
        restartAfterSelection: true,
        buttonLabels: ["Yes", "No"],
      }),
    ).toEqual({
      operation: "configure_auto_scan",
      startKey: "Space",
      selectKey: "Enter",
      intervalSeconds: 0.6,
      restartAfterSelection: true,
      buttonLabels: ["Yes", "No"],
    });

    expect(normalizeOpenAIPlan(VALID_PLAN)).toEqual(VALID_PLAN);
  });

  test("normalizes nullable model defaults before validation", () => {
    expect(
      extractOpenAIResponse(
        openAIResponse({
          plan: {
            ...VALID_PLAN,
            startKey: null,
            selectKey: null,
            intervalSeconds: null,
          },
        }),
      ).plan,
    ).toEqual(VALID_PLAN);
  });

  test("rejects an invalid Enter/Enter model plan", () => {
    expect(() =>
      extractOpenAIResponse(
        openAIResponse({
          plan: { ...VALID_PLAN, startKey: "Enter" },
        }),
      ),
    ).toThrow(AuthoringPlanValidationError);
  });

  test("preserves clarification and unsupported responses", () => {
    expect(
      extractOpenAIResponse(
        openAIResponse({
          kind: "clarification",
          message: "Which button labels should I use?",
          plan: null,
        }),
      ),
    ).toEqual({
      kind: "clarification",
      message: "Which button labels should I use?",
      plan: null,
    });

    expect(
      extractOpenAIResponse({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "refusal", refusal: "Unsupported scope" }],
          },
        ],
      }),
    ).toEqual({
      kind: "unsupported",
      message: "Unsupported request: Unsupported scope",
      plan: null,
    });
  });
});
