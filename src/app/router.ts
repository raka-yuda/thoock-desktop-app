import { useEffect, useState } from "react";
export type Page =
  | "dashboard"
  | "opportunities"
  | "briefs"
  | "generation"
  | "review"
  | "exports"
  | "logs"
  | "settings";
export function navigate(page: Page, query: Record<string, string> = {}) {
  const params = new URLSearchParams(query);
  const active = document.activeElement as HTMLElement | null;
  if (params.size) active?.setAttribute("data-dialog-opener", "true");
  window.location.hash = `/${page}${params.size ? `?${params}` : ""}`;
}
function location() {
  const [path, query] = window.location.hash.replace(/^#\//, "").split("?");
  const pages: Page[] = [
    "dashboard",
    "opportunities",
    "briefs",
    "generation",
    "review",
    "exports",
    "logs",
    "settings",
  ];
  return {
    page: (pages.includes(path as Page) ? path : "dashboard") as Page,
    params: new URLSearchParams(query),
  };
}
export function useRoute() {
  const [route, setRoute] = useState(location);
  useEffect(() => {
    const listener = () => setRoute(location());
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  return route;
}
