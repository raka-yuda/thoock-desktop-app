import { test, expect, type Page } from "@playwright/test";
import { mockWorkspace } from "./fixtures/workspace";

async function fits(page: Page) {
  expect(
    await page
      .locator(".main-content")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
async function dialogFits(page: Page) {
  const box = await page.getByRole("dialog").boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  expect(
    await page
      .locator(".dialog-body")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await expect(page.locator(".dialog-footer")).toBeInViewport();
}

test("all pages fit usable width with either sidebar state", async ({
  page,
}) => {
  await mockWorkspace(page);
  for (const width of [1440, 1120, 900, 720]) {
    await page.setViewportSize({ width, height: 720 });
    for (const route of [
      "dashboard",
      "opportunities",
      "briefs",
      "generation",
      "review",
      "exports",
      "logs",
      "settings?tab=providers",
    ]) {
      await page.goto(`/#/${route}`);
      await expect(page.locator("h1")).toBeVisible();
      await fits(page);
    }
  }
  await page.setViewportSize({ width: 1120, height: 720 });
  await page.goto("/#/settings?tab=providers");
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  await fits(page);
  await page.screenshot({
    animations: "disabled",
    path: "test-results/settings-collapsed.png",
  });
});

test("reference modal layouts keep tabs and actions visible at short window heights", async ({
  page,
}) => {
  await mockWorkspace(page);
  for (const width of [1440, 1120, 720]) {
    await page.setViewportSize({ width, height: 720 });
    await page.goto("/#/briefs?new=1");
    await expect(
      page.getByRole("dialog", { name: "Add a commercial brief manually" }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Brief name" })
      .fill("Quiet winter village travel banner");
    await page.getByRole("tab", { name: "Prompt", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Generation prompt" })
      .fill("A snowy village with space for a travel headline");
    await page.getByRole("tab", { name: "Commercial direction" }).click();
    await expect(page.getByRole("textbox", { name: "Brief name" })).toHaveValue(
      "Quiet winter village travel banner",
    );
    await dialogFits(page);
    await page.locator(".dialog-body").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(
      page.getByRole("tab", { name: "Prompt", exact: true }),
    ).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Save manual brief", exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      animations: "disabled",
      path: `test-results/brief-modal-${width}.png`,
    });
    await page.keyboard.press("Escape");
    await page.goto("/#/review?asset=asset-0");
    await expect(page.getByRole("dialog", { name: "Image 000" })).toBeVisible();
    await page.getByRole("tab", { name: "Metadata", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Title", exact: true })
      .fill("Snowy village travel banner");
    await page.getByRole("tab", { name: "Quality review" }).click();
    await dialogFits(page);
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Reject this image?" }),
    ).toBeVisible();
    await expect(
      page.locator(".dialog-confirmation .dialog-body"),
    ).not.toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Image 000" })).toBeVisible();
    await page.locator(".dialog-body").evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.screenshot({
      animations: "disabled",
      path: `test-results/review-modal-${width}.png`,
    });
  }
});

test("add-method tiles, staged filters, keyboard tabs and reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#/opportunities");
  await page
    .getByRole("button", { name: "Add opportunity", exact: true })
    .click();
  await expect(page.locator(".method-card")).toHaveCount(2);
  await page.screenshot({
    animations: "disabled",
    path: "test-results/add-method.png",
  });
  await page.getByRole("button", { name: /Add manually/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Add an opportunity manually" }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/opportunity-modal.png",
  });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page
    .getByLabel("Opportunity score", { exact: true })
    .selectOption("75 to 100");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".filter-count")).toHaveCount(0);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page
    .getByLabel("Opportunity score", { exact: true })
    .selectOption("75 to 100");
  await page.screenshot({
    animations: "disabled",
    path: "test-results/opportunity-filter.png",
  });
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(page.locator(".filter-count")).toBeVisible();
  await page.goto("/#/briefs?new=1");
  await page.getByRole("tab", { name: "Commercial direction" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Prompt", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("tab", { name: "Prompt", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("tab", { name: "Commercial direction" }),
  ).toBeFocused();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
});
