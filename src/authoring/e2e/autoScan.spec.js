import { expect, test } from "@playwright/test";

test("mock authoring creates a working recurring auto-scan design", async ({
  page,
}) => {
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() == "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  const designName = `authoring-e2e-${Date.now()}`;
  await page.goto(`?authoring=mock#${designName}`);
  const authoringButton = page.locator("#authoringMockRun");
  await authoringButton.click();
  await expect(authoringButton).toHaveAttribute("data-status", "complete");

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

test("LLM dev mode validates a stubbed plan before applying it", async ({
  page,
}) => {
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() == "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.route("**/api/authoring/plan", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        plan: {
          operation: "configure_auto_scan",
          startKey: "Space",
          selectKey: "Enter",
          intervalSeconds: 0.6,
          restartAfterSelection: true,
          buttonLabels: ["Yes", "No", "Help", "Stop"],
        },
        provider: "mock",
        warnings: ["Stubbed by the browser test."],
      }),
    });
  });

  const designName = `authoring-llm-e2e-${Date.now()}`;
  await page.goto(`?authoring=llm#${designName}`);

  const generate = page.locator("#authoringGenerate");
  const apply = page.locator("#authoringApply");
  const status = page.locator("#authoringStatus");

  await expect(apply).toBeDisabled();
  await generate.click();
  await expect(status).toHaveAttribute("data-status", "ready");
  await expect(status).toContainText('"provider": "mock"');
  await expect(apply).toBeEnabled();

  await apply.click();
  await expect(status).toHaveAttribute("data-status", "complete");
  await expect(
    page.locator('#UI button.button[name="authoring-auto-scan-button"]'),
  ).toHaveCount(4);
  expect(consoleErrors).toEqual([]);
});
