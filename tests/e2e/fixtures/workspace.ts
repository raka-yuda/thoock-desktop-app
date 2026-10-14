import type { Page } from "@playwright/test";
export async function mockWorkspace(page: Page) {
  await page.addInitScript(() => {
    const createdAt = new Date().toISOString();
    const data = {
      schemaVersion: 4,
      workspaceId: "fixture",
      workspacePath: "/fixture/workspace",
      storageBytes: 1_000_000,
      restartRequired: false,
      preferences: {
        workspaceName: "Test workspace",
        region: "Global",
        prohibitedTerms: [],
      },
      opportunities: [],
      briefs: [],
      exports: [],
      logs: [],
      providers: [],
      assets: Array.from({ length: 500 }, (_, i) => ({
        id: `asset-${i}`,
        briefId: null,
        sourceJobId: i === 0 ? "job-0" : null,
        name: `Image ${String(i).padStart(3, "0")}`,
        width: 3000,
        height: 2000,
        bytes: 100_000,
        hash: String(i),
        thumbnail: "/fixture/thumbnail",
        preview: "/fixture/preview",
        title: "",
        keywords: [],
        category: 0,
        decision: "pending",
        checklist: {
          technical: false,
          artifacts: false,
          rights: false,
          aiDisclosure: false,
        },
        notes: "",
        createdAt,
      })),
      jobs: Array.from({ length: 5000 }, (_, i) => ({
        id: `job-${i}`,
        operation: "image generation",
        status: "succeeded",
        message: "Fixture completed",
        createdAt,
        completedAt: createdAt,
        provider: i === 0 ? "snapgen" : "local",
        model: i === 0 ? "nano-banana-pro" : "mock-image",
        requestId: null,
        parentId: null,
        progress: 100,
        resultIds: i === 0 ? ["asset-0"] : [],
        outputCount: i === 0 ? 1 : 0,
      })),
    };
    const callbacks = new Map<number, unknown>();
    let callbackId = 0;
    Object.assign(window, {
      isTauri: true,
      __TAURI_INTERNALS__: {
        invoke: async (command: string) =>
          command === "workspace_snapshot"
            ? data
            : command === "model_capabilities"
              ? [
                  {
                    provider: "local",
                    model: "mock-image",
                    label: "Local test pattern",
                    aspectRatios: ["1:1", "16:9"],
                    resolutions: ["2K"],
                    qualities: ["test pattern"],
                    negativePrompt: false,
                    repair: false,
                  },
                ]
              : command === "plugin:event|listen"
                ? 1
                : undefined,
        transformCallback: (callback: unknown) => {
          callbacks.set(++callbackId, callback);
          return callbackId;
        },
        unregisterCallback: (id: number) => callbacks.delete(id),
        convertFileSrc: () => "/thoock-icon.svg",
      },
    });
  });
}
