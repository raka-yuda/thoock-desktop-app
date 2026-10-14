import { test, expect, type Page } from "@playwright/test";
import { mockWorkspace } from "./fixtures/workspace";

async function checkSelects(page: Page) {
  const controls = page.locator("select:visible");
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);
  for (const control of await controls.all()) {
    const geometry = await control.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const field = el.closest(".field")!.getBoundingClientRect();
      return {
        width: box.width,
        fieldWidth: field.width,
        height: box.height,
        appearance: getComputedStyle(el).appearance,
      };
    });
    expect(geometry.height).toBeCloseTo(40, 2);
    expect(Math.abs(geometry.width - geometry.fieldWidth)).toBeLessThan(1);
    expect(geometry.appearance).toBe("none");
  }
}

test("every select fills its field and matches the input height", async ({
  page,
}) => {
  await mockWorkspace(page);
  for (const width of [1440, 1120]) {
    await page.setViewportSize({ width, height: 720 });
    for (const route of [
      "settings",
      "generation",
      "briefs?new=1",
      "opportunities?ai=1",
      "briefs?ai=1",
    ]) {
      await page.goto(`/#/${route}`);
      await expect(page.locator("select").first()).toBeVisible();
      await checkSelects(page);
      if (route === "settings") {
        expect(
          (await page
            .getByRole("combobox", { name: "Default text model" })
            .boundingBox())!.height,
        ).toBe(40);
        await page.screenshot({
          animations: "disabled",
          path: `test-results/select-alignment-${width}.png`,
        });
      }
    }
    for (const route of [
      "opportunities",
      "briefs",
      "generation?view=history",
      "review",
      "exports",
      "exports?view=history",
      "logs",
    ]) {
      await page.goto(`/#/${route}`);
      await page.getByRole("button", { name: "Filters", exact: true }).click();
      // Export views only have date inputs; all other filters also contain selects.
      if (await page.locator("select:visible").count())
        await checkSelects(page);
      await page.keyboard.press("Escape");
    }
    await page.goto("/#/review?asset=asset-0");
    await page.getByRole("tab", { name: "Metadata", exact: true }).click();
    await checkSelects(page);
    await page.getByRole("button", { name: "AI draft", exact: true }).click();
    await checkSelects(page);
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: "Quality review" }).click();
    await page
      .getByRole("button", { name: "Remove provider logo", exact: true })
      .click();
    await checkSelects(page);
  }
});
