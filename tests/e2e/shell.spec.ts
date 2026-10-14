import { test, expect } from "@playwright/test";
test("navigates all pages and opens route dialogs", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Creative production" }),
  ).toBeVisible();
  for (const [name, heading] of [
    ["Opportunities", "Opportunities"],
    ["Commercial briefs", "Commercial briefs"],
    ["Image generation", "Image generation"],
    ["Review queue", "Review queue"],
    ["Adobe exports", "Adobe exports"],
    ["Provider logs", "Provider logs"],
    ["Settings", "Settings"],
  ]) {
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }
  await page.goto("/#/opportunities?new=1");
  await expect(
    page.getByRole("dialog", { name: "Add an opportunity manually" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Meta+k");
  await expect(
    page.getByRole("dialog", { name: "Command palette" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Search commands" }).fill("Review");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Review queue" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review queue" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("fits the minimum desktop window and shows provider setup", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1120, height: 720 });
  await page.goto("/#/settings?tab=providers");
  await expect(
    page.getByRole("heading", { name: "Provider credentials" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    animations: "disabled",
    path: "test-results/settings-minimum.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/");
  await page.screenshot({
    animations: "disabled",
    path: "test-results/dashboard.png",
  });
});
