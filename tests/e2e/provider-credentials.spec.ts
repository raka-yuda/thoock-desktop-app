import { test, expect } from "@playwright/test";
import { mockWorkspace } from "./fixtures/workspace";

test("provider key failures preserve the input for retry and verified saves refresh the status", async ({
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
    let configured = false;
    let saves = 0;
    internals.invoke = async (command, args) => {
      if (command === "workspace_snapshot") {
        const snapshot = (await original(command)) as { providers: unknown[] };
        snapshot.providers = [
          { id: "openai", configured, status: "untested", lastTested: null },
        ];
        return snapshot;
      }
      if (command === "save_provider_key") {
        if (args?.provider !== "openai" || args?.key !== "disposable-test-key")
          throw new Error("Invalid test IPC arguments");
        saves++;
        if (saves === 1)
          throw {
            code: "credential_vault_access",
            message:
              "Unlock your login keychain and allow Thoock access, then try again.",
            correlationId: "",
          };
        configured = true;
        return null;
      }
      return original(command, args);
    };
  });
  await page.goto("/#/settings?tab=providers");
  const provider = page
    .locator(".provider-card")
    .filter({
      has: page.getByRole("heading", { name: "OpenAI", exact: true }),
    });
  const input = provider.getByLabel("API key", { exact: true });
  await input.fill("disposable-test-key");
  await provider.getByRole("button", { name: "Save key", exact: true }).click();
  await expect(
    page.getByText(
      "Unlock your login keychain and allow Thoock access, then try again.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(input).toHaveValue("disposable-test-key");
  await expect(
    provider.getByRole("button", { name: "Test connection", exact: true }),
  ).toBeDisabled();
  await provider.getByRole("button", { name: "Save key", exact: true }).click();
  await expect(
    provider.getByText("Key saved · Not tested", { exact: true }),
  ).toBeVisible();
  await expect(
    provider.getByLabel("Replace API key", { exact: true }),
  ).toHaveValue("");
  await expect(
    provider.getByRole("button", { name: "Test connection", exact: true }),
  ).toBeEnabled();
});
