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
import {
  createOpenRouterProvider,
  extractOpenRouterResponse,
} from "./openrouterProvider";
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
const SGD_PROMPT =
  "I want a complex SGD interface with qwerty keyboard and also some Core vocabulary. The user should be able to see what they are composing via display and be able to delete or clear things.";

const VALID_PLAN = {
  operation: "configure_auto_scan",
  startKey: "Space",
  selectKey: "Enter",
  intervalSeconds: 0.6,
  restartAfterSelection: true,
  buttonLabels: ["Yes", "No", "Help", "Stop"],
};

const VALID_SGD_PLAN = {
  operation: "create_sgd_interface",
  title: "Generated SGD Interface",
  displayState: "$Message",
  keyboard: {
    type: "qwerty",
    includeSpace: true,
    includeDelete: true,
    includeClear: true,
  },
  coreVocabulary: [
    "I",
    "you",
    "want",
    "go",
    "more",
    "help",
    "yes",
    "no",
    "stop",
    "finished",
  ],
  actions: {
    lettersAppendToDisplay: true,
    coreWordsAppendToDisplay: true,
    deleteRemovesLastCharacter: true,
    clearEmptiesDisplay: true,
    speakUsesDisplay: true,
  },
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

function openRouterResponse(result = {}) {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({
            kind: "plan",
            message: "Plan ready.",
            plan: VALID_PLAN,
            ...result,
          }),
        },
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

  test("maps the QWERTY SGD request to create_sgd_interface", async () => {
    await expect(
      createMockProvider().createResponse({
        messages: [{ role: "user", content: SGD_PROMPT }],
      }),
    ).resolves.toMatchObject({
      kind: "plan",
      plan: VALID_SGD_PLAN,
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

  test("explicit OpenRouter mode without a key falls back with a warning", async () => {
    const provider = selectAuthoringProvider({
      AUTHORING_PROVIDER: "openrouter",
    });
    const result = await provider.createResponse({ messages: USER_MESSAGES });
    expect(result.provider).toBe("mock");
    expect(result.warnings[0]).toContain("OPENROUTER_API_KEY");
  });

  test("a pasted key takes precedence over mock environment configuration", () => {
    expect(
      selectAuthoringProvider(
        { AUTHORING_PROVIDER: "mock" },
        { apiKey: "sk-memory-only", fetchImpl: vi.fn() },
      ).name,
    ).toBe("openai");
  });

  test("OpenRouter selection uses OpenRouter env and pasted keys", () => {
    expect(
      selectAuthoringProvider(
        {
          AUTHORING_PROVIDER: "openrouter",
          OPENROUTER_API_KEY: "or-env",
        },
        { fetchImpl: vi.fn() },
      ).name,
    ).toBe("openrouter");
    expect(
      selectAuthoringProvider(
        { AUTHORING_PROVIDER: "openrouter" },
        { apiKey: "or-memory-only", fetchImpl: vi.fn() },
      ).name,
    ).toBe("openrouter");
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
    ["unknown operation", { ...VALID_SGD_PLAN, operation: "make_anything" }],
  ])("rejects %s", (_name, plan) => {
    expect(() => validateProviderResponse(serverResponse({ plan }))).toThrow(
      AuthoringPlanValidationError,
    );
  });

  test("accepts an OpenRouter plan response envelope", () => {
    expect(
      validateProviderResponse(
        serverResponse({
          provider: "openrouter",
          plan: VALID_SGD_PLAN,
        }),
      ),
    ).toMatchObject({
      provider: "openrouter",
      plan: VALID_SGD_PLAN,
    });
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
        'Default startKey to "Space", selectKey to "Enter"',
      );
      expect(body.instructions).toContain(
        "never implies that Enter should start scanning",
      );
      expect(body.instructions).toContain("create_sgd_interface");
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

  test("extracts a valid SGD response", () => {
    expect(
      extractOpenAIResponse(
        openAIResponse({
          plan: VALID_SGD_PLAN,
        }),
      ).plan,
    ).toEqual(VALID_SGD_PLAN);
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

describe("OpenRouter provider", () => {
  test("uses server-side Bearer auth, app headers, and structured outputs", async () => {
    const fetchImpl = vi.fn(async (url, request) => {
      expect(url).toBe("https://openrouter.test/api/v1/chat/completions");
      expect(request.headers.Authorization).toBe("Bearer or-test-key");
      expect(request.headers["HTTP-Referer"]).toBe("http://127.0.0.1:8080");
      expect(request.headers["X-OpenRouter-Title"]).toBe(
        "OS-DPI Authoring Dev",
      );
      expect(request.body).not.toContain("or-test-key");
      const body = JSON.parse(request.body);
      expect(body.model).toBe("openrouter/free");
      expect(body.response_format.type).toBe("json_schema");
      expect(body.response_format.json_schema.strict).toBe(true);
      expect(body.provider.require_parameters).toBe(true);
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[0].content).toContain("create_sgd_interface");
      return {
        ok: true,
        json: async () => openRouterResponse({ plan: VALID_SGD_PLAN }),
      };
    });

    const provider = createOpenRouterProvider({
      apiKey: "or-test-key",
      baseUrl: "https://openrouter.test/api/v1",
      fetchImpl,
    });
    await expect(
      provider.createResponse({ messages: [{ role: "user", content: SGD_PROMPT }] }),
    ).resolves.toEqual({
      kind: "plan",
      message: "Plan ready.",
      plan: VALID_SGD_PLAN,
      provider: "openrouter",
      warnings: [],
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  test("falls back to strict JSON when structured outputs are unsupported", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { message: "response_format json_schema unsupported" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => openRouterResponse(),
      });

    const provider = createOpenRouterProvider({
      apiKey: "or-test-key",
      fetchImpl,
    });
    const result = await provider.createResponse({ messages: USER_MESSAGES });
    expect(result.provider).toBe("openrouter");
    expect(result.warnings[0]).toContain("strict JSON fallback");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).response_format).toBe(
      undefined,
    );
  });

  test("rejects invalid OpenRouter plans before they can be applied", () => {
    expect(() =>
      extractOpenRouterResponse(
        openRouterResponse({
          plan: { ...VALID_PLAN, operation: "raw_osdpi" },
        }),
      ),
    ).toThrow(AuthoringPlanValidationError);
  });
});
