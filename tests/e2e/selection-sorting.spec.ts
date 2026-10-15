import { test, expect } from "@playwright/test";

test("review selection controls stay square and bulk actions stay at viewport bottom", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("thoock-demo", "true"));
  await page.goto("/#/review");
  const checkbox = page.locator(".image-checkbox").first();
  await checkbox.check();
  await expect(
    page.getByText("1 image selected", { exact: true }),
  ).toBeVisible();
  const tile = page.locator(".image-select-tile").first();
  await expect(tile).toHaveCSS("width", "40px");
  await expect(tile).toHaveCSS("height", "40px");
  await expect(tile.locator("input")).toBeChecked();
  const panel = await page.locator(".selection-bar").boundingBox();
  expect(panel!.height).toBeLessThanOrEqual(80);
  expect(panel!.width).toBeLessThan(1100);
  await expect(
    page.getByText("Apply one action to the current selection."),
  ).toBeVisible();
  await expect(page.locator(".selection-dismiss")).toHaveCSS(
    "box-shadow",
    "none",
  );
  for (const selector of [".image-checkbox", ".image-expand"]) {
    const box = await page.locator(selector).first().boundingBox();
    expect(box!.width).toBe(box!.height);
    expect(box!.width).toBeGreaterThanOrEqual(24);
  }
  for (const width of [1440, 900, 600]) {
    await page.setViewportSize({ width, height: 960 });
    await page.locator(".main-content").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const dock = await page.locator(".selection-dock").boundingBox();
    expect(dock!.x).toBeGreaterThanOrEqual(76);
    expect(dock!.x + dock!.width).toBeLessThanOrEqual(width);
    expect(dock!.y + dock!.height).toBeGreaterThanOrEqual(940);
    expect(dock!.y + dock!.height).toBeLessThanOrEqual(952);
    for (const name of [
      "Approve selected",
      "Generate AI metadata",
      "Reject selected",
      "Clear selection",
    ]) {
      await expect(
        page.getByRole("button", { name, exact: true }),
      ).toBeVisible();
    }
    await page.screenshot({
      path: `test-results/review-selection-${width}.png`,
      animations: "disabled",
    });
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".selection-dock")).toHaveCSS("left", "96px");
  await page.screenshot({
    path: "test-results/review-selection-dark.png",
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await expect(page.locator(".selection-dock")).toHaveCount(0);
});

test("table headings toggle sort for data columns", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("thoock-demo", "true"));
  await page.goto("/#/opportunities");
  await page.getByRole("button", { name: "Next page" }).click();
  await page.getByRole("button", { name: "Score", exact: true }).click();
  await expect(page.getByText("Page 1 of 4")).toBeVisible();
  const scores = async () =>
    (await page.locator("tbody .score").allTextContents()).map((text) =>
      Number(text.split("/")[0]),
    );
  let numbers = await scores();
  expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
  await page.getByRole("button", { name: "Score", exact: true }).click();
  numbers = await scores();
  expect(numbers).toEqual([...numbers].sort((a, b) => b - a));
  await expect(
    page.getByRole("columnheader", { name: "Score" }),
  ).toHaveAttribute("aria-sort", "descending");
});

test("bulk actions shrink with workspace width before wrapping", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("thoock-demo", "true"));
  await page.setViewportSize({ width: 1920, height: 960 });
  await page.goto("/#/review");
  await page.locator(".image-checkbox").first().check();
  const measure = async () =>
    page.locator(".selection-bar").evaluate((bar) => {
      const button = bar.querySelector(".selection-actions .button")!;
      return {
        width: bar.getBoundingClientRect().width,
        height: bar.getBoundingClientRect().height,
        font: parseFloat(getComputedStyle(button).fontSize),
        buttonHeight: button.getBoundingClientRect().height,
      };
    });
  const wide = await measure();
  await page.setViewportSize({ width: 1440, height: 960 });
  const medium = await measure();
  expect(medium.width).toBeLessThan(wide.width);
  expect(medium.height).toBeLessThan(wide.height);
  expect(medium.buttonHeight).toBeLessThan(wide.buttonHeight);
  await page.setViewportSize({ width: 1120, height: 720 });
  const small = await measure();
  expect(small.width).toBeLessThan(medium.width);
  expect(small.font).toBeLessThan(medium.font);
  await expect(page.locator(".selection-summary p")).toBeHidden();
  for (const width of [1120, 900, 600, 480]) {
    await page.setViewportSize({ width, height: 720 });
    const box = await page.locator(".selection-bar").boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(76);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await expect(
      page.getByRole("button", { name: "Generate AI metadata", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/responsive-bulk-${width}.png`,
      animations: "disabled",
    });
  }
});
