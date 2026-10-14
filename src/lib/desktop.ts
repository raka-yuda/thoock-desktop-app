import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  snapshotSchema,
  capabilitySchema,
  type BriefInput,
  type Brief,
  type OpportunityInput,
  type Preferences,
  type ReviewInput,
  type Snapshot,
  type GenerationInput,
  type TextInput,
  type Job,
  type MigrationPreview,
  type ReviewEvent,
} from "./types";
import { z } from "zod";
import { demoSnapshot, demoCapabilities, isDemoMode } from "./demo";

export const interfacePreview = import.meta.env.DEV && !isTauri();
const preview: Snapshot = {
  restartRequired: false,
  schemaVersion: 4,
  workspaceId: "preview",
  workspacePath: "Available in the desktop application",
  storageBytes: 0,
  preferences: {
    workspaceName: "Thoock",
    region: "Indonesia",
    prohibitedTerms: [],
    defaultTextProvider: "local",
    defaultTextModel: "local-rules",
    defaultImageProvider: "local",
    defaultImageModel: "mock-image",
  },
  opportunities: [],
  briefs: [],
  assets: [],
  jobs: [],
  logs: [],
  exports: [],
  providers: ["openai", "gemini", "snapgen"].map((id) => ({
    id,
    configured: false,
    lastTested: null,
    status: "not configured",
  })),
};
function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (isDemoMode()) {
    const data = demoSnapshot();
    if (name === "model_capabilities")
      return Promise.resolve(demoCapabilities as T);
    if (name === "review_history") return Promise.resolve([] as T);
    if (name === "original_preview")
      return Promise.resolve(
        (data.assets.find((a) => a.id === args?.assetId)?.preview ??
          "/demo/scene-0.svg") as T,
      );
    if (name === "generation_settings") {
      const asset = data.assets.find((a) => a.sourceJobId === args?.jobId);
      const brief = data.briefs.find((b) => b.id === asset?.briefId);
      return Promise.resolve({
        provider: "snapgen",
        model: "nano-banana-pro",
        prompt: brief?.prompt ?? "Demo landscape",
        negativePrompt: "",
        aspectRatio: "16:9",
        resolution: "2K",
        quality: "Stock Photo",
        briefId: brief?.id ?? null,
        parentJobId: args?.jobId ?? null,
      } as T);
    }
    return Promise.reject({
      code: "demo_read_only",
      message:
        "Demo data is for exploring the interface. Switch to Local data to save changes or run provider work.",
      correlationId: "",
    });
  }
  if (!isTauri())
    return Promise.reject({
      code: "desktop_required",
      message: "Open the Thoock desktop app to use the local workspace.",
      correlationId: "",
    });
  return invoke<T>(name, args);
}
export const desktop = {
  setAppearance: (theme: "light" | "dark") =>
    isTauri() ? invoke<void>("set_appearance", { theme }) : Promise.resolve(),
  snapshot: async () => {
    if (isDemoMode()) return snapshotSchema.parse(demoSnapshot());
    if (interfacePreview) return snapshotSchema.parse(preview);
    await command("startup_status");
    return snapshotSchema.parse(await command<unknown>("workspace_snapshot"));
  },
  saveOpportunity: ({
    id,
    topic,
    buyer,
    market,
    demand,
    competition,
    commercialFit,
    notes,
    details,
  }: OpportunityInput) =>
    command("save_opportunity", {
      input: {
        id,
        topic,
        buyer,
        market,
        demand,
        competition,
        commercialFit,
        notes,
        ...(details ? { details } : {}),
      },
    }),
  saveBrief: ({
    id,
    opportunityId,
    title,
    buyer,
    usage,
    market,
    scene,
    visualDirection,
    prompt,
    negativePrompt,
    metadataPlan,
    details,
  }: BriefInput) =>
    command<Brief>("save_brief", {
      input: {
        id,
        opportunityId,
        title,
        buyer,
        usage,
        market,
        scene,
        visualDirection,
        prompt,
        negativePrompt,
        metadataPlan,
        ...(details ? { details } : {}),
      },
    }),
  saveReview: (input: ReviewInput) => command("save_review", { input }),
  bulkReview: (ids: string[], decision: "approved" | "rejected") =>
    command<number>("bulk_review", { ids, decision }),
  importImages: (briefId: string | null = null) =>
    command<number>("import_images", { briefId }),
  exportPackage: (ids: string[], name: string) =>
    command<Snapshot["exports"][number] | null>("export_package", {
      ids,
      name,
    }),
  savePreferences: (input: Preferences) =>
    command("save_preferences", { input }),
  saveKey: (provider: string, key: string) =>
    command("save_provider_key", { provider, key }),
  removeKey: (provider: string) => command("remove_provider_key", { provider }),
  testProvider: (provider: string) => command("test_provider", { provider }),
  backup: () => command<boolean>("backup_workspace"),
  restore: () => command<boolean>("restore_workspace"),
  previewCsv: (content: string) =>
    command<OpportunityInput[]>("preview_opportunity_csv", { content }),
  importOpportunities: (inputs: OpportunityInput[]) =>
    command<number>("import_opportunities", { inputs }),
  capabilities: async () =>
    z.array(capabilitySchema).parse(
      interfacePreview && !isDemoMode()
        ? [
            {
              provider: "local",
              model: "mock-image",
              label: "Local test pattern",
              aspectRatios: ["1:1", "16:9", "9:16"],
              resolutions: ["2K"],
              qualities: ["test pattern"],
              negativePrompt: false,
              repair: false,
            },
          ]
        : await command("model_capabilities"),
    ),
  generate: (input: GenerationInput) =>
    command<Job>("queue_generation", { input }),
  research: (input: TextInput) => command<Job>("queue_research", { input }),
  briefBatch: (input: TextInput) =>
    command<Job>("queue_brief_batch", { input }),
  metadata: (ids: string[], provider: string, model: string) =>
    command<Job[]>("queue_metadata", { ids, provider, model }),
  repair: (assetId: string, mode: string) =>
    command<Job>("queue_repair", { assetId, mode }),
  checkResult: (jobId: string, historyUuid?: string) =>
    command<Job>("check_provider_result", {
      jobId,
      historyUuid: historyUuid ?? null,
    }),
  retry: (jobId: string) => command<Job>("retry_generation", { jobId }),
  cancelJob: (jobId: string) => command("cancel_job", { jobId }),
  generationSettings: (jobId: string) =>
    command<GenerationInput>("generation_settings", { jobId }),
  bulkGenerate: (input: GenerationInput, briefIds: string[]) =>
    command<Job[]>("queue_bulk_generation", { input, briefIds }),
  downloadAsset: (assetId: string, original: boolean) =>
    command<boolean>("download_asset", { assetId, original }),
  originalPreview: (assetId: string) =>
    command<string>("original_preview", { assetId }),
  pickOpportunityCsv: () => command<string | null>("pick_opportunity_csv"),
  pickBriefCsv: () => command<string | null>("pick_brief_csv"),
  previewBriefCsv: (content: string) =>
    command<BriefInput[]>("preview_brief_csv", { content }),
  importBriefs: (inputs: BriefInput[]) =>
    command<number>("import_briefs", { inputs }),
  exportOpportunityCsv: () => command<boolean>("export_opportunity_csv"),
  exportBriefCsv: () => command<boolean>("export_brief_csv"),
  previewMigration: () => command<MigrationPreview | null>("preview_migration"),
  importMigration: (importId: string) =>
    command("import_migration", { importId }),
  supportBundle: () => command<boolean>("support_bundle"),
  rebuildPreviews: () => command<number>("rebuild_previews"),
  relocateWorkspace: () => command<boolean>("relocate_workspace"),
  chooseWorkspace: () => command<boolean>("choose_workspace"),
  restartApp: () => command("restart_app"),
  saveExportCopy: (batchId: string) =>
    command<boolean>("save_export_copy", { batchId }),
  reviewHistory: (assetId: string) =>
    command<ReviewEvent[]>("review_history", { assetId }),
};
export const localImage = (path: string) =>
  path.startsWith("/demo/") ? path : convertFileSrc(path);
export function onWorkspaceChanged(callback: () => void) {
  return isTauri()
    ? listen("workspace-changed", callback)
    : Promise.resolve(() => {});
}
