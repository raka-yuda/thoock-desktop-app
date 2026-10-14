import { test, expect } from "@playwright/test";

test("dark appearance persists and applies across pages and portal dialogs", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Demo data", exact: true }).click();
  for (const route of [
    "dashboard",
    "opportunities",
    "briefs",
    "generation",
    "review",
    "exports",
    "logs",
    "settings",
  ]) {
    await page.goto(`/#/${route}`);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    if (route === "review")
      await page.screenshot({
        animations: "disabled",
        path: "test-results/dark-review.png",
      });
    if (route === "settings") {
      await expect(page.getByLabel("Appearance", { exact: true })).toHaveValue(
        "dark",
      );
      await page.screenshot({
        animations: "disabled",
        path: "test-results/dark-settings.png",
      });
    }
  }
  await page.goto("/#/briefs?new=1");
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(29, 41, 33)");
  await page.screenshot({
    animations: "disabled",
    path: "test-results/dark-brief-modal.png",
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/#/logs?request=demo-job-0");
  await expect(page.locator(".dialog-drawer")).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/dark-log-drawer.png",
  });
});

test("system appearance follows OS changes and explicit choices override it", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/#/settings");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByLabel("Appearance", { exact: true })).toHaveValue(
    "system",
  );
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.getByLabel("Appearance", { exact: true })).toHaveValue(
    "light",
  );
  await page.getByLabel("Appearance", { exact: true }).selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
