import type { Snapshot } from "./types";
import { score } from "./format";

let enabled = false;
try {
  enabled = localStorage.getItem("thoock-demo") === "true";
} catch {
  /* Session-only mode when storage is unavailable. */
}
export const isDemoMode = () => enabled;
export function setDemoMode(value: boolean) {
  enabled = value;
  try {
    localStorage.setItem("thoock-demo", String(value));
  } catch {
    /* Session-only mode. */
  }
}
const subjects = [
  "Quiet winter village",
  "Urban cycling commute",
  "Modern home workspace",
  "Coastal conservation",
  "Inclusive classroom",
  "Fresh market produce",
  "Renewable energy",
  "Mountain travel",
  "Community garden",
  "Accessible city transport",
  "Small business workshop",
  "Calm morning routine",
];
const buyers = [
  "Travel publishers",
  "Education teams",
  "Retail brands",
  "Healthcare marketing",
  "Sustainability teams",
  "Small businesses",
];
const markets = ["Indonesia", "Global", "Europe", "Southeast Asia"];
const demoStartedAt = Date.now();
const stamp = (i: number) =>
  new Date(demoStartedAt - i * 18 * 3_600_000).toISOString();
export const demoCapabilities = [
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
  {
    provider: "snapgen",
    model: "nano-banana-pro",
    label: "Nano Banana Pro",
    aspectRatios: ["1:1", "16:9", "9:16"],
    resolutions: ["1K", "2K", "4K"],
    qualities: ["Stock Photo", "Photorealistic", "None"],
    negativePrompt: false,
    repair: true,
  },
];
export function demoSnapshot(): Snapshot {
  const opportunities = Array.from({ length: 36 }, (_, i) => {
    const demand = 35 + ((i * 7) % 65),
      competition = 15 + ((i * 11) % 80),
      commercialFit = 40 + ((i * 9) % 60);
    return {
      id: `demo-opportunity-${i}`,
      details: {
        behavior: (["evergreen", "seasonal", "trending"] as const)[i % 3],
        resultCount: 4000 + i * 1250,
        trendGrowth: demand,
        commercialIntent: commercialFit,
        seasonalFit: 30 + (i % 70),
        portfolioFit: 40 + (i % 60),
      },
      topic: `${subjects[i % 12]} ${["campaigns", "editorial imagery", "brand storytelling"][Math.floor(i / 12)]}`,
      buyer: buyers[i % 6],
      market: markets[i % 4],
      demand,
      competition,
      commercialFit,
      score: score(demand, competition, commercialFit),
      notes: "Sample planning estimate for exploring the interface.",
      createdAt: stamp(i),
    };
  });
  const briefs = Array.from({ length: 28 }, (_, i) => ({
    id: `demo-brief-${i}`,
    details: {
      supportingSubjects:
        "Distant landscape, natural textures, open copy space",
      environment: "A calm natural setting",
      visualStyle: "Editorial photography",
      orientation: (["Horizontal", "Vertical", "Square"] as const)[i % 3],
      copySpace: "Upper center",
      composition: "Clear focal point and generous negative space",
      lighting: "Soft morning light",
      adobeTitle: "",
      keywords: [],
      category: 0,
    },
    opportunityId: opportunities[i % 36].id,
    title: `${subjects[i % 12]} ${["hero image", "social campaign", "editorial spread"][Math.floor(i / 12)]}`,
    buyer: buyers[i % 6],
    usage: ["Website banner", "Social campaign", "Editorial feature"][i % 3],
    market: markets[i % 4],
    scene: `A clear, commercially useful scene about ${subjects[i % 12].toLowerCase()}.`,
    visualDirection:
      "Natural light, thoughtful composition, and generous copy space.",
    prompt: `Create an editorial photograph of ${subjects[i % 12].toLowerCase()} with clear subject separation and room for a headline.`,
    negativePrompt: "No text or recognizable logos",
    metadataPlan:
      "Describe the visible subject and order keywords by relevance.",
    createdAt: stamp(i),
  }));
  const assets = Array.from({ length: 48 }, (_, i) => {
    const decision = (["pending", "approved", "rejected"] as const)[i % 3];
    const complete = decision === "approved" || i % 4 !== 0;
    return {
      id: `demo-asset-${i}`,
      briefId: briefs[i % 28].id,
      sourceJobId: `demo-job-${i}`,
      isMock: true,
      name: `${subjects[i % 12]} candidate ${Math.floor(i / 12) + 1}`,
      width: i % 7 === 0 && decision !== "approved" ? 1600 : 4096,
      height: i % 7 === 0 && decision !== "approved" ? 1200 : 2731,
      bytes: 1_700_000 + i * 91821,
      hash: String(i).padStart(64, "0"),
      thumbnail: `/demo/scene-${i % 6}.svg`,
      preview: `/demo/scene-${i % 6}.svg`,
      title: complete ? `${subjects[i % 12]} with space for a headline` : "",
      keywords: complete
        ? [
            "landscape",
            "travel",
            "nature",
            "scenic",
            "calm",
            "copy space",
            "editorial",
          ]
        : [],
      category: complete ? (i % 21) + 1 : 0,
      decision,
      checklist: {
        referenceChecks: {
          logo: decision === "approved",
          text: decision === "approved",
          anatomy: decision === "approved",
          truthfulness: decision === "approved",
          famous: decision === "approved",
          copyright: decision === "approved",
          composition: decision === "approved",
          consistency: decision === "approved",
          distinctiveness: decision === "approved",
        },
        technical: decision === "approved",
        artifacts: decision === "approved",
        rights: decision === "approved",
        aiDisclosure: decision === "approved",
      },
      notes:
        "Demo illustration. Use this record to explore review, filters, and selection.",
      createdAt: stamp(i),
    };
  });
  const jobs = Array.from({ length: 54 }, (_, i) => {
    const status =
      i < 48
        ? "succeeded"
        : ["succeeded", "failed", "interrupted", "cancelled"][i % 4];
    return {
      id: `demo-job-${i}`,
      operation: i < 48 ? "image generation" : "metadata draft",
      status,
      message: `Demo attempt ${i + 1}: ${status}. No provider request was sent.`,
      createdAt: stamp(i),
      completedAt: stamp(i),
      provider:
        i < 48
          ? i % 3 === 0
            ? "local"
            : "snapgen"
          : i % 2 === 0
            ? "openai"
            : "gemini",
      model:
        i < 48
          ? i % 3 === 0
            ? "mock-image"
            : "nano-banana-pro"
          : "demo-text-model",
      requestId: `demo-request-${i}`,
      parentId: i % 4 === 2 ? `demo-job-${i - 1}` : null,
      progress: status === "succeeded" ? 100 : 0,
      resultIds: i < 48 ? [assets[i].id] : [],
      outputCount: i < 48 ? 1 : 0,
    };
  });
  return {
    schemaVersion: 4,
    workspaceId: "demo",
    workspacePath: "Demo workspace · sample data",
    storageBytes: 86_400_000,
    restartRequired: false,
    preferences: {
      workspaceName: "Thoock demo",
      region: "Indonesia",
      prohibitedTerms: [],
      defaultTextProvider: "local",
      defaultTextModel: "local-rules",
      defaultImageProvider: "local",
      defaultImageModel: "mock-image",
    },
    opportunities,
    briefs,
    assets,
    jobs,
    exports: Array.from({ length: 14 }, (_, i) => ({
      id: `demo-export-${i}`,
      name: `${["Travel", "Everyday life", "Sustainability"][i % 3]} collection ${i + 1}`,
      count: 3 + (i % 8),
      path: `Demo packages/collection-${i + 1}.zip`,
      createdAt: stamp(i * 2),
    })),
    logs: jobs.map((job, i) => ({
      id: job.id,
      provider: job.provider,
      operation: job.operation,
      status: job.status,
      message: job.message,
      durationMs: 2100 + i * 721,
      createdAt: job.createdAt,
      model: job.model,
      requestId: job.requestId,
      requestSummary: { sample: true, operation: job.operation },
      responseSummary: { sample: true, status: job.status },
    })),
    providers: ["openai", "gemini", "snapgen"].map((id) => ({
      id,
      configured: false,
      lastTested: null,
      status: "demo · no credentials",
    })),
  };
}
