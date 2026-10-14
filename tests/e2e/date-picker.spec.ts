import { test, expect } from "@playwright/test";
import { mockWorkspace } from "./fixtures/workspace";

test("calendar supports keyboard selection, bounded ranges and Escape within filters", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-14T12:00:00Z"));
  await mockWorkspace(page);
  await page.goto("/#/generation?view=history");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("button", { name: "Created from", exact: true }).click();
  const calendar = page.getByRole("dialog", {
    name: "Created from calendar",
    exact: true,
  });
  await expect(calendar).toBeVisible();
  await page.screenshot({
    path: "test-results/light-date-picker.png",
    animations: "disabled",
  });
  await expect(calendar.locator('[data-date="2026-10-14"]')).toBeFocused();
  await calendar.locator('[data-date="2026-10-14"]').press("ArrowLeft");
  await expect(calendar.locator('[data-date="2026-10-13"]')).toBeFocused();
  await calendar.locator('[data-date="2026-10-13"]').press("Enter");
  await expect(calendar).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Created from", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Created through", exact: true })
    .click();
  const end = page.getByRole("dialog", {
    name: "Created through calendar",
    exact: true,
  });
  await expect(end.locator('[data-date="2026-10-12"]')).toBeDisabled();
  await end.getByRole("button", { name: "Today", exact: true }).click();
  await page.getByRole("button", { name: "Created from", exact: true }).click();
  await expect(calendar.locator('[data-date="2026-10-15"]')).toBeDisabled();
  await calendar.locator('[data-date="2026-10-13"]').press("Escape");
  await expect(calendar).toHaveCount(0);
  await expect(
    page.getByRole("dialog", {
      name: "Filter generation history",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove From: 2026-10-13 filter" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove Through: 2026-10-14 filter" }),
  ).toBeVisible();
});

test("calendar month/year navigation handles leap days and fits short dark windows", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-14T12:00:00Z"));
  await page.setViewportSize({ width: 720, height: 600 });
  await mockWorkspace(page);
  await page.goto("/#/review");
  await page
    .getByRole("button", { name: "Switch to dark mode", exact: true })
    .click();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("button", { name: "From", exact: true }).click();
  const calendar = page.getByRole("dialog", {
    name: "From calendar",
    exact: true,
  });
  await calendar
    .getByLabel("Calendar year", { exact: true })
    .selectOption("2024");
  await calendar
    .getByLabel("Calendar month", { exact: true })
    .selectOption("1");
  await calendar.locator('[data-date="2024-02-29"]').click();
  await expect(
    page.getByRole("button", { name: "From", exact: true }),
  ).toContainText("2024");
  await page.getByRole("button", { name: "From", exact: true }).click();
  const bounds = await calendar.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(600);
  const footer = await calendar.locator(".date-calendar-footer").boundingBox();
  expect(footer!.y + footer!.height).toBeLessThanOrEqual(
    bounds!.y + bounds!.height,
  );
  expect(
    await calendar.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(32, 42, 35)");
  await page.screenshot({
    path: "test-results/dark-date-picker.png",
    animations: "disabled",
  });
  await calendar
    .getByRole("button", { name: "Clear date", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "From", exact: true }),
  ).toContainText("Choose date");
});
