import { test, expect } from "@playwright/test";
import { mockWorkspace } from "./fixtures/workspace";

test("generation history scopes rows, counts, filters and details to image generation", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.addInitScript(() => {
    const internals = (
      window as unknown as {
        __TAURI_INTERNALS__: { invoke: (command: string) => Promise<unknown> };
      }
    ).__TAURI_INTERNALS__;
    const original = internals.invoke;
    internals.invoke = async (command) => {
      const value = await original(command);
      if (command === "workspace_snapshot") {
        const snapshot = value as { jobs: Record<string, unknown>[] };
        const base = snapshot.jobs[0];
        snapshot.jobs = [
          ...Array.from({ length: 11 }, (_, i) => ({
            ...base,
            id: `image-job-${i}`,
            operation: "image generation",
            provider: "snapgen",
            model: "nano-banana-pro",
          })),
          {
            ...base,
            id: "research-job",
            operation: "topic research",
            provider: "openai",
            model: "research-only-model",
          },
          {
            ...base,
            id: "brief-job",
            operation: "brief batch",
            provider: "gemini",
            model: "brief-only-model",
          },
          { ...base, id: "metadata-job", operation: "metadata draft" },
          { ...base, id: "export-job", operation: "Adobe package" },
        ];
      }
      return value;
    };
  });
  await page.goto("/#/generation?view=history");
  await expect(
    page.getByRole("tab", { name: "History (11)", exact: true }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(10);
  await expect(page.getByText("Page 1 of 2", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "topic research", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(
    page.getByLabel("Provider", { exact: true }).locator("option"),
  ).toHaveText(["All", "snapgen"]);
  await expect(
    page.getByLabel("Model", { exact: true }).locator("option"),
  ).toHaveText(["All", "nano-banana-pro"]);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.goto("/#/generation?view=history&job=research-job");
  await expect(
    page.getByRole("tab", { name: "History (11)", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
