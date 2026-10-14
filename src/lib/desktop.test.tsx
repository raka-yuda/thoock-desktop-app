import { it, expect, vi } from "vitest";
const invoke = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke,
  isTauri: () => true,
  convertFileSrc: (path: string) => path,
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
import { desktop } from "./desktop";
it("sends only writable fields when editing a read-model opportunity", async () => {
  const existing = {
    id: "record",
    topic: "Travel",
    buyer: "Designers",
    market: "Global",
    demand: 60,
    competition: 50,
    commercialFit: 70,
    notes: "Notes",
    score: 61,
    createdAt: "2026-01-01",
  };
  await desktop.saveOpportunity(existing);
  const args = invoke.mock.calls[0][1] as { input: Record<string, unknown> };
  expect(args.input).not.toHaveProperty("score");
  expect(args.input).not.toHaveProperty("createdAt");
  expect(args.input).toMatchObject({ id: "record", topic: "Travel" });
});
it("sends only writable fields when editing a read-model brief", async () => {
  const existing = {
    id: "record",
    opportunityId: null,
    title: "Travel",
    buyer: "Designers",
    usage: "Editorial",
    market: "Global",
    scene: "Urban scene",
    visualDirection: "Natural",
    prompt: "A travel image",
    negativePrompt: "",
    metadataPlan: "",
    createdAt: "2026-01-01",
  };
  await desktop.saveBrief(existing);
  const args = invoke.mock.calls[invoke.mock.calls.length - 1][1] as {
    input: Record<string, unknown>;
  };
  expect(args.input).not.toHaveProperty("createdAt");
  expect(args.input).toMatchObject({ id: "record", title: "Travel" });
});
