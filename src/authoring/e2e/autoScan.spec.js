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
