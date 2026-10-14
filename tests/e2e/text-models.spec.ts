import { test, expect } from "@playwright/test";
import { mockWorkspace } from "./fixtures/workspace";

test("static model selectors follow the provider across settings and all text workflows", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.addInitScript(() => {
    const internals = (
      window as unknown as {
        __TAURI_INTERNALS__: {
          invoke: (
            command: string,
            args?: Record<string, unknown>,
          ) => Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__;
    const original = internals.invoke;
    internals.invoke = async (command, args) => {
      if (command === "queue_research") {
        (window as unknown as { queuedInput: unknown }).queuedInput =
          args?.input;
        return { id: "queued-research" };
      }
      const value = await original(command, args);
      if (command === "workspace_snapshot") {
        const data = value as {
          preferences: Record<string, unknown>;
          providers: unknown[];
        };
        Object.assign(data.preferences, {
          defaultTextProvider: "openai",
          defaultTextModel: "gpt-5.6-luna",
        });
        data.providers = ["openai", "gemini"].map((id) => ({
          id,
          configured: true,
          status: "connected",
          lastTested: null,
        }));
      }
      return value;
    };
  });
  await page.goto("/#/settings");
  const defaultModel = page.getByRole("combobox", {
    name: "Default text model",
    exact: true,
  });
  await expect(defaultModel).toHaveValue("gpt-5.6-luna");
  await expect(defaultModel.locator("option")).toHaveCount(6);
  await page
    .getByLabel("Default text provider", { exact: true })
    .selectOption("gemini");
  await expect(defaultModel).toHaveValue("gemini-3.5-flash-lite");
  await expect(defaultModel.locator("option")).toHaveCount(9);
  await expect(
    defaultModel.locator('option[value="gemini-3.1-pro-preview"]'),
  ).toContainText("Preview");
  await expect(
    defaultModel.locator('option[value="gemini-2.5-flash"]'),
  ).toContainText("Existing API users");
  await page
    .getByLabel("Default text provider", { exact: true })
    .selectOption("local");
  await expect(defaultModel).toHaveValue("local-rules");
  for (const [route, providerLabel] of [
    ["opportunities?ai=1", "Research assistant"],
    ["briefs?ai=1", "Brief writer"],
  ]) {
    await page.goto(`/#/${route}`);
    const model = page.getByRole("combobox", { name: "Model", exact: true });
    await expect(model).toHaveValue("gpt-5.6-luna");
    await page
      .getByLabel(providerLabel, { exact: true })
      .selectOption("gemini");
    await expect(model).toHaveValue("gemini-3.5-flash-lite");
    await expect(model.locator('option[value^="gpt-"]')).toHaveCount(0);
  }
  await page.goto("/#/review");
  await page
    .getByRole("checkbox", { name: "Select Image 000", exact: true })
    .check();
  await page
    .locator(".selection-bar")
    .getByRole("button", { name: "Metadata", exact: true })
    .click();
  await page.getByLabel("Provider", { exact: true }).selectOption("gemini");
  await expect(
    page.getByRole("combobox", { name: "Model", exact: true }),
  ).toHaveValue("gemini-3.5-flash-lite");
  await page.goto("/#/opportunities?ai=1");
  await page
    .getByLabel("Topic seed", { exact: true })
    .fill("Sustainable travel");
  await page
    .getByRole("combobox", { name: "Model", exact: true })
    .selectOption("gpt-6.1-sol");
  await page
    .getByRole("button", { name: "Review request", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm and queue", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Opportunities", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            queuedInput: { model: string; provider: string };
          }
        ).queuedInput,
    ),
  ).toMatchObject({ model: "gpt-6.1-sol", provider: "openai" });
});
