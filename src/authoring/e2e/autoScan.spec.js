import { expect, test } from "@playwright/test";

const VALID_PLAN = {
  operation: "configure_auto_scan",
  startKey: "Space",
  selectKey: "Enter",
  intervalSeconds: 0.6,
  restartAfterSelection: true,
  buttonLabels: ["Yes", "No", "Help", "Stop"],
};

function collectConsoleErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() == "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("normal mode does not render authoring controls", async ({ page }) => {
  await page.goto(`#authoring-normal-${Date.now()}`);
  await expect(page.locator("#UI")).toBeVisible();
  await expect(page.locator(".authoring-dev-panel")).toHaveCount(0);
});

test("mock authoring panel is visible and recurring auto-scan still works", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  const designName = `authoring-e2e-${Date.now()}`;
  await page.goto(`?authoring=mock#${designName}`);

  const panel = page.locator("#authoringMock");
  const authoringButton = page.locator("#authoringMockRun");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading")).toHaveText(
    "OS-DPI Mock Authoring",
  );
  await expect(authoringButton).toBeVisible();
  await authoringButton.click();
  await expect(authoringButton).toHaveAttribute("data-status", "complete");
  await expect(page.locator("#authoringMockStatus")).toHaveText(
    "Mock auto-scan applied.",
  );

  const buttons = page.locator(
    '#UI button.button[name="authoring-auto-scan-button"]',
  );
  await expect(buttons).toHaveCount(4);
  await page.locator("#UI").focus();

  await page.keyboard.press("Space");
  const cued = page.locator("#UI button[cue]");
  await expect(cued).toHaveCount(1, { timeout: 1500 });
  const firstLabel = await cued.textContent();

  await page.waitForTimeout(750);
  await expect(cued).toHaveCount(1);
  const secondLabel = await cued.textContent();
  expect(secondLabel).not.toBeNull();
  expect(secondLabel).not.toBe(firstLabel);

  await page.keyboard.press("Enter");
  await expect(page.locator("#UI .display button")).toHaveText(
    secondLabel?.trim() || "",
  );
  await expect(cued).toHaveCount(1, { timeout: 1500 });
  expect(consoleErrors).toEqual([]);
});

test("LLM panel supports clarification, review, and explicit apply", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  let requestCount = 0;
  const capturedRequests = [];

  await page.route("**/api/authoring/plan", async (route) => {
    requestCount += 1;
    const request = route.request();
    const body = request.postDataJSON();
    capturedRequests.push({
      authorization: request.headers().authorization,
      body,
      postData: request.postData(),
    });

    if (requestCount == 1) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          kind: "clarification",
          message: "Which button labels should I use?",
          plan: null,
          provider: "openai",
          warnings: [],
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        kind: "plan",
        message: "The auto-scan plan is ready to review.",
        plan: VALID_PLAN,
        provider: "openai",
        warnings: ["Stubbed by the browser test."],
      }),
    });
  });

  const designName = `authoring-llm-e2e-${Date.now()}`;
  await page.goto(`?authoring=llm#${designName}`);

  const panel = page.locator("#authoringLLM");
  const apiKey = page.locator("#authoringApiKey");
  const prompt = page.locator("#authoringPrompt");
  const generate = page.locator("#authoringGenerate");
  const apply = page.locator("#authoringApply");
  const status = page.locator("#authoringStatus");
  const transcript = page.locator("#authoringTranscript");

  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { level: 2 })).toHaveText(
    "OS-DPI LLM Authoring",
  );
  await expect(apiKey).toHaveAttribute("type", "password");
  await expect(transcript).toBeVisible();
  await expect(prompt).toBeVisible();
  await expect(generate).toBeVisible();
  await expect(apply).toBeVisible();
  await expect(page.locator("#authoringProvider")).toBeVisible();
  await expect(status).toBeVisible();
  await expect(page.locator("#authoringMessages")).toBeVisible();
  await expect(page.locator("#authoringPlanPreview")).toBeVisible();
  await expect(apply).toBeDisabled();

  await apiKey.fill("sk-test-memory-only");
  await generate.click();
  await expect(status).toHaveAttribute("data-status", "clarification");
  await expect(status).toHaveText("Clarification needed");
  await expect(transcript).toContainText("Which button labels should I use?");
  await expect(apply).toBeDisabled();
  expect(capturedRequests[0].authorization).toBe(
    "Bearer sk-test-memory-only",
  );
  expect(capturedRequests[0].postData).not.toContain("sk-test-memory-only");
  expect(capturedRequests[0].body.messages).toHaveLength(1);

  await prompt.fill("Use Yes, No, Help, and Stop.");
  await generate.click();
  await expect(status).toHaveAttribute("data-status", "ready");
  await expect(page.locator("#authoringProvider")).toHaveText("openai");
  await expect(page.locator("#authoringMessages")).toContainText(
    "Stubbed by the browser test.",
  );
  await expect(page.locator("#authoringPlanPreview")).toContainText(
    '"startKey": "Space"',
  );
  await expect(apply).toBeEnabled();
  expect(capturedRequests[1].authorization).toBe(
    "Bearer sk-test-memory-only",
  );
  expect(capturedRequests[1].postData).not.toContain("sk-test-memory-only");
  expect(capturedRequests[1].body.messages).toEqual([
    {
      role: "user",
      content:
        "Create an auto-scan interface where Enter selects the current button.",
    },
    {
      role: "assistant",
      content: "Which button labels should I use?",
    },
    {
      role: "user",
      content: "Use Yes, No, Help, and Stop.",
    },
  ]);

  await apply.click();
  await expect(status).toHaveAttribute("data-status", "complete");
  await expect(
    page.locator('#UI button.button[name="authoring-auto-scan-button"]'),
  ).toHaveCount(4);

  await page.locator("#UI").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#UI button[cue]")).toHaveCount(1, {
    timeout: 1500,
  });
  expect(consoleErrors).toEqual([]);
});

test("invalid Enter/Enter planner response cannot be applied", async ({
  page,
}) => {
  await page.route("**/api/authoring/plan", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        kind: "plan",
        message: "Invalid plan.",
        plan: {
          ...VALID_PLAN,
          startKey: "Enter",
        },
        provider: "openai",
        warnings: [],
      }),
    });
  });

  await page.goto(`?authoring=llm#authoring-invalid-${Date.now()}`);
  await page.locator("#authoringGenerate").click();
  await expect(page.locator("#authoringStatus")).toHaveAttribute(
    "data-status",
    "error",
  );
  await expect(page.locator("#authoringMessages")).toContainText(
    "startKey and selectKey must be different keys",
  );
  await expect(page.locator("#authoringApply")).toBeDisabled();
  await expect(
    page.locator('#UI button.button[name="authoring-auto-scan-button"]'),
  ).toHaveCount(0);
});

test("LLM panel fits inside a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`?authoring=llm#authoring-mobile-${Date.now()}`);
  const panel = page.locator("#authoringLLM");
  await expect(panel).toBeVisible();

  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error("authoring panel bounds unavailable");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
});
