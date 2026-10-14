import { test, expect } from "@playwright/test";

test("demo data populates filters, pagination and images and can be switched off", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo data", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Demo workspace");
  await page.goto("/#/opportunities");
  await expect(page.getByText("Page 1 of 4")).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText("Page 2 of 4")).toBeVisible();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByLabel("Market", { exact: true }).selectOption("Indonesia");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(page.getByText("9 results", { exact: true })).toBeVisible();
  await expect(page.getByText("Page 1 of 1")).toBeVisible();
  await page.goto("/#/briefs");
  await expect(page.getByText("Page 1 of 3")).toBeVisible();
  await page.getByRole("checkbox", { name: "Select this page" }).check();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText("10 selected across pages")).toBeVisible();
  await page.goto("/#/generation?view=history");
  await expect(page.getByText("Page 1 of 5")).toBeVisible();
  await page.goto("/#/review");
  await expect(page.locator(".asset-card")).toHaveCount(30);
  expect(
    await page
      .locator(".asset-card img")
      .first()
      .evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
  ).toBe(true);
  await page.screenshot({
    animations: "disabled",
    path: "test-results/demo-review.png",
  });
  await page.goto("/#/exports");
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  await page.goto("/#/exports?view=history");
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  await page.goto("/#/logs");
  await expect(page.getByText("Page 1 of 6")).toBeVisible();
  await page.getByRole("button", { name: "Local data", exact: true }).click();
  await expect(page.getByText("Demo mode", { exact: true })).toHaveCount(0);
  await page.goto("/#/opportunities");
  await expect(
    page.getByText("Start with an opportunity", { exact: true }),
  ).toBeVisible();
});

test("demo actions cannot reach the native mutation boundary", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("thoock-demo", "true");
    Object.assign(window, {
      isTauri: true,
      __TAURI_INTERNALS__: {
        invoke: async (name: string) => {
          if (
            name !== "plugin:event|listen" &&
            name !== "plugin:event|unlisten"
          )
            throw new Error(`Unexpected native call: ${name}`);
          return 1;
        },
        transformCallback: () => 1,
        unregisterCallback: () => {},
        convertFileSrc: () => "invalid",
      },
    });
  });
  await page.goto("/#/settings");
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(
    page.getByText(
      "Demo data is for exploring the interface. Switch to Local data to save changes or run provider work.",
      { exact: true },
    ),
  ).toBeVisible();
});
