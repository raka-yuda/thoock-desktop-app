import { z } from "zod";

const checklistSchema = z.object({
  referenceChecks: z
    .object({
      logo: z.boolean(),
      text: z.boolean(),
      anatomy: z.boolean(),
      truthfulness: z.boolean(),
      famous: z.boolean(),
      copyright: z.boolean(),
      composition: z.boolean(),
      consistency: z.boolean(),
      distinctiveness: z.boolean(),
    })
    .nullable()
    .optional(),
  technical: z.boolean(),
  artifacts: z.boolean(),
  rights: z.boolean(),
  aiDisclosure: z.boolean(),
});
export const opportunitySchema = z.object({
  details: z
    .object({
      behavior: z.enum(["evergreen", "seasonal", "trending"]),
      resultCount: z.number(),
      trendGrowth: z.number(),
      commercialIntent: z.number(),
      seasonalFit: z.number(),
      portfolioFit: z.number(),
    })
    .nullable()
    .optional(),
  id: z.string(),
  topic: z.string(),
  buyer: z.string(),
  market: z.string(),
  demand: z.number(),
  competition: z.number(),
  commercialFit: z.number(),
  notes: z.string(),
  score: z.number(),
  createdAt: z.string(),
});
export const briefSchema = z.object({
  details: z
    .object({
      supportingSubjects: z.string(),
      environment: z.string(),
      visualStyle: z.string(),
      orientation: z.enum(["Horizontal", "Vertical", "Square"]),
      copySpace: z.string(),
      composition: z.string(),
      lighting: z.string(),
      adobeTitle: z.string(),
      keywords: z.array(z.string()),
      category: z.number(),
    })
    .nullable()
    .optional(),
  id: z.string(),
  opportunityId: z.string().nullable(),
  title: z.string(),
  buyer: z.string(),
  usage: z.string(),
  market: z.string(),
  scene: z.string(),
  visualDirection: z.string(),
  prompt: z.string(),
  negativePrompt: z.string(),
  metadataPlan: z.string(),
  createdAt: z.string(),
});
export const assetSchema = z.object({
  sourceJobId: z.string().nullable().default(null),
  isMock: z.boolean().default(false),
  id: z.string(),
  briefId: z.string().nullable(),
  name: z.string(),
  width: z.number(),
  height: z.number(),
  bytes: z.number(),
  hash: z.string(),
  thumbnail: z.string(),
  preview: z.string(),
  title: z.string(),
  keywords: z.array(z.string()),
  category: z.number(),
  decision: z.enum(["pending", "approved", "rejected"]),
  checklist: checklistSchema,
  notes: z.string(),
  createdAt: z.string(),
});
export const preferencesSchema = z.object({
  workspaceName: z.string().trim().min(1).max(100),
  region: z.string().trim().min(1).max(100),
  prohibitedTerms: z.array(z.string().max(200)).max(500),
  defaultTextProvider: z.enum(["local", "openai", "gemini"]).default("local"),
  defaultTextModel: z.string().trim().min(1).max(100).default("local-rules"),
  defaultImageProvider: z.string().default("local"),
  defaultImageModel: z.string().default("mock-image"),
});
export const jobSchema = z.object({
  id: z.string(),
  operation: z.string(),
  status: z.string(),
  message: z.string(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  provider: z.string().default("local"),
  model: z.string().default(""),
  requestId: z.string().nullable().default(null),
  parentId: z.string().nullable().default(null),
  progress: z.number().default(0),
  resultIds: z.array(z.string()).default([]),
  outputCount: z.number().default(0),
});
export const capabilitySchema = z.object({
  provider: z.string(),
  model: z.string(),
  label: z.string(),
  aspectRatios: z.array(z.string()),
  resolutions: z.array(z.string()),
  qualities: z.array(z.string()),
  negativePrompt: z.boolean(),
  repair: z.boolean(),
});
export type Job = z.infer<typeof jobSchema>;
export type Capability = z.infer<typeof capabilitySchema>;
export type GenerationInput = {
  provider: string;
  model: string;
  prompt: string;
  negativePrompt: string;
  aspectRatio: string;
  resolution: string;
  quality: string;
  briefId: string | null;
  parentJobId: string | null;
};
export type TextInput = {
  context?: {
    targetRegion: string;
    behavior: string;
    portfolioContext: string;
    creativePreset: string;
  };
  provider: string;
  model: string;
  topic: string;
  count: number;
  opportunityId: string | null;
};
export type MigrationPreview = {
  id: string;
  counts: Record<string, number>;
  bytes: number;
  requiredBytes: number;
  status: string;
};
export const snapshotSchema = z.object({
  restartRequired: z.boolean().default(false),
  schemaVersion: z.literal(4),
  workspaceId: z.string(),
  workspacePath: z.string(),
  storageBytes: z.number(),
  preferences: preferencesSchema,
  opportunities: z.array(opportunitySchema),
  briefs: z.array(briefSchema),
  assets: z.array(assetSchema),
  jobs: z.array(jobSchema),
  logs: z.array(
    z.object({
      id: z.string(),
      provider: z.string(),
      operation: z.string(),
      status: z.string(),
      message: z.string(),
      durationMs: z.number(),
      createdAt: z.string(),
      model: z.string().default(""),
      requestId: z.string().nullable().default(null),
      requestSummary: z.unknown().default(null),
      responseSummary: z.unknown().default(null),
    }),
  ),
  exports: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      count: z.number(),
      path: z.string(),
      createdAt: z.string(),
    }),
  ),
  providers: z.array(
    z.object({
      id: z.string(),
      configured: z.boolean(),
      lastTested: z.string().nullable(),
      status: z.string(),
    }),
  ),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Opportunity = z.infer<typeof opportunitySchema>;
export type Brief = z.infer<typeof briefSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Preferences = z.infer<typeof preferencesSchema>;
export type OpportunityInput = Omit<
  Opportunity,
  "id" | "createdAt" | "score"
> & { id: string | null };
export type BriefInput = Omit<Brief, "id" | "createdAt"> & {
  id: string | null;
};
export type ReviewInput = Pick<
  Asset,
  "id" | "title" | "keywords" | "category" | "decision" | "checklist" | "notes"
>;
export type AppError = { code: string; message: string; correlationId: string };
type ReviewState = Pick<
  Asset,
  "decision" | "checklist" | "notes" | "title" | "keywords" | "category"
>;
export type ReviewEvent = {
  id: string;
  assetId: string;
  actor: string;
  previous: ReviewState;
  current: ReviewState;
  createdAt: string;
};
export function errorMessage(error: unknown): AppError {
  if (typeof error === "object" && error !== null && "message" in error) {
    const e = error as Partial<AppError>;
    return {
      code: e.code ?? "client",
      message: String(e.message),
      correlationId: e.correlationId ?? "",
    };
  }
  return {
    code: "client",
    message:
      typeof error === "string" ? error : "The action could not be completed.",
    correlationId: "",
  };
}

export function checklistReady(checklist: Asset["checklist"]) {
  return (
    checklist.technical &&
    checklist.artifacts &&
    checklist.rights &&
    checklist.aiDisclosure &&
    (!checklist.referenceChecks ||
      Object.values(checklist.referenceChecks).every(Boolean))
  );
}
