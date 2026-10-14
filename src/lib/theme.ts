import { useSyncExternalStore } from "react";
import { desktop } from "./desktop";

export type ThemePreference = "light" | "dark" | "system";
const media = window.matchMedia?.("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();
function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem("thoock-theme");
    if (value === "light" || value === "dark") return value;
  } catch {
    /* Use the system theme when storage is unavailable. */
  }
  return "system";
}
let preference = readPreference();
const resolvedTheme = () =>
  preference === "system" ? (media?.matches ? "dark" : "light") : preference;
function apply() {
  const resolved = resolvedTheme();
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  void desktop.setAppearance(resolved).catch(() => {});
  listeners.forEach((listener) => listener());
}
export function setThemePreference(value: ThemePreference) {
  preference = value;
  try {
    localStorage.setItem("thoock-theme", value);
  } catch {
    /* Keep the theme for this session. */
  }
  apply();
}
media?.addEventListener("change", () => {
  if (preference === "system") apply();
});
window.addEventListener("storage", (event) => {
  if (event.key === "thoock-theme") {
    preference = readPreference();
    apply();
  }
});
apply();
export function useTheme() {
  const snapshot = useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    () => `${preference}:${resolvedTheme()}`,
  );
  const [selected, resolved] = snapshot.split(":") as [
    ThemePreference,
    "light" | "dark",
  ];
  return { preference: selected, resolved, setPreference: setThemePreference };
}
