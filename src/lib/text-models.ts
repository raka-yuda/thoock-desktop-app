import type { Preferences } from "./types";

export type TextProvider = Preferences["defaultTextProvider"];
export type TextModel = {
  id: string;
  name: string;
  availability?: "Preview" | "Existing API users";
};

// Checked against official model pages on 2026-10-14. These models support
// structured text output and image input for the app's metadata workflow.
// See docs/TEXT_MODELS.md for source pages and maintenance notes.
export const textModels: Record<TextProvider, readonly TextModel[]> = {
  local: [{ id: "local-rules", name: "Local rules" }],
  openai: [
    { id: "gpt-6-luna", name: "GPT-6 Luna" },
    { id: "gpt-6.1-sol", name: "GPT-6.1 Sol" },
    { id: "gpt-6-astra", name: "GPT-6 Astra" },
    { id: "gpt-6-sol", name: "GPT-6 Sol" },
    { id: "gpt-5.6-luna", name: "GPT-5.6 Luna" },
    { id: "gpt-5.6-sol", name: "GPT-5.6 Sol" },
  ],
  gemini: [
    { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite" },
    { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash" },
    { id: "gemini-4-argon", name: "Gemini 4 Argon" },
    { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash" },
    { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash-Lite" },
    {
      id: "gemini-3.1-pro-preview",
      name: "Gemini 3.1 Pro",
      availability: "Preview",
    },
    {
      id: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      availability: "Existing API users",
    },
    {
      id: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      availability: "Existing API users",
    },
    {
      id: "gemini-2.5-flash-lite",
      name: "Gemini 2.5 Flash-Lite",
      availability: "Existing API users",
    },
  ],
};

export function modelForProvider(provider: TextProvider, saved = "") {
  if (provider === "local") return "local-rules";
  // Preserve existing user choices, including models outside this curated list.
  return saved && saved !== "local-rules" ? saved : textModels[provider][0].id;
}
