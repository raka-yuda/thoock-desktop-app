import { test, expect } from "@playwright/test";

test("reference actions, removable filter chips, structured forms and five-column review", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo data", exact: true }).click();
  for (const route of ["opportunities", "briefs"]) {
    await page.goto(`/#/${route}`);
    const actions = page.locator(".heading-actions");
    await expect(
      actions.getByRole("button", { name: "Export CSV" }),
    ).toHaveCount(0);
    await expect(
      actions.getByRole("button", { name: /Research with AI|Create AI batch/ }),
    ).toHaveCount(0);
    await expect(actions.getByRole("button")).toHaveCount(2);
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await page.getByLabel("Market", { exact: true }).selectOption("Indonesia");
    await page
      .getByLabel("Buyer", { exact: true })
      .selectOption("Travel publishers");
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect(page.locator(".filter-chip")).toHaveCount(2);
    await page
      .getByRole("button", { name: "Remove Buyer: Travel publishers filter" })
      .click();
    await expect(page.locator(".filter-chip")).toHaveCount(1);
    await page
      .locator(".active-filters")
      .getByRole("button", { name: "Clear all" })
      .click();
    await expect(page.locator(".filter-chip")).toHaveCount(0);
  }
  await page.goto("/#/opportunities?new=1");
  for (const label of [
    "Keyword",
    "Target region",
    "Topic behavior",
    "Adobe result count",
  ])
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  await expect(page.locator('input[type="range"]')).toHaveCount(4);
  await page.screenshot({
    animations: "disabled",
    path: "test-results/reference-opportunity-form.png",
  });
  await page.goto("/#/briefs?new=1");
  for (const label of [
    "Source opportunity",
    "Brief name",
    "Target buyer",
    "Intended commercial usage",
    "Main subject",
    "Supporting subjects",
    "Environment",
    "Visual style",
    "Orientation",
    "Copy-space location",
    "Composition",
    "Lighting",
  ])
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  await page.locator(".dialog-body").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({
    animations: "disabled",
    path: "test-results/reference-brief-form.png",
  });
  await page.goto("/#/review");
  const columns = await page
    .locator(".review-grid")
    .evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
    );
  expect(columns).toBe(5);
  await expect(
    page.locator(".asset-card").first().locator(".readiness-icon"),
  ).toHaveCount(3);
  await expect(
    page
      .locator(".asset-card")
      .first()
      .getByText("Technical check needed", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    animations: "disabled",
    path: "test-results/reference-review-grid.png",
  });
  await page.locator(".image-expand").first().click();
  await expect(
    page.getByText("Required human checks", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("0/9", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Check all", exact: true }).click();
  await expect(page.getByText("9/9", { exact: true })).toBeVisible();
  await page.goto("/#/generation?view=history");
  await page
    .getByRole("button", { name: "Check result", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("textbox", { name: "Optional SnapGen history UUID" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.goto("/#/logs?request=demo-job-0");
  await expect(
    page.getByRole("dialog", { name: "Provider request details" }),
  ).toBeVisible();
  await expect(page.locator(".dialog-drawer")).toHaveCSS("right", "0px");
  await expect(page.locator(".dialog-drawer")).toHaveCSS("height", "960px");
});
