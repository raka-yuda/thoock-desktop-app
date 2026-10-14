import { test, expect } from "@playwright/test";
import { mockWorkspace } from "./fixtures/workspace";
test("bounds review rendering and paginates a 5,000-job history", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.goto("/#/review");
  await expect(page.locator(".asset-card")).toHaveCount(30);
  await expect(page.getByText("500 images", { exact: true })).toBeVisible();
  const started = Date.now();
  await page.getByRole("textbox", { name: "Search images" }).fill("Image 499");
  await expect(page.locator(".asset-card")).toHaveCount(1);
  expect(Date.now() - started).toBeLessThan(1500);
  await page.goto("/#/generation?view=history");
  await expect(page.locator("tbody tr")).toHaveCount(10);
  await expect(page.getByText("Page 1 of 500")).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText("Page 2 of 500")).toBeVisible();
});
