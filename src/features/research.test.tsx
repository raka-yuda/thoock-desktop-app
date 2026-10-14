import { vi, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActionProvider } from "../components/ui";
import { Briefs } from "./research";
import { desktop } from "../lib/desktop";
import { demoSnapshot } from "../lib/demo";

vi.mock("../lib/desktop", () => ({
  desktop: {
    saveBrief: vi.fn(async (input) => ({
      ...input,
      id: "saved",
      createdAt: "2026-01-01",
    })),
  },
}));
it("saves structured direction and metadata across tabs and builds a blank starter prompt", async () => {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ActionProvider>
        <Briefs
          data={demoSnapshot()}
          params={new URLSearchParams("new=1")}
          selected={new Set()}
          onSelect={() => {}}
        />
      </ActionProvider>
    </QueryClientProvider>,
  );
  await user.type(
    screen.getByRole("textbox", { name: "Brief name" }),
    "Winter travel banner",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Main subject" }),
    "A quiet snow covered village",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Supporting subjects" }),
    "Distant mountains",
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Orientation" }),
    "Vertical",
  );
  await user.click(screen.getByRole("tab", { name: "Adobe metadata" }));
  await user.type(
    screen.getByRole("textbox", { name: "Keywords" }),
    "winter village, snow, mountains, travel, calm",
  );
  await user.click(screen.getByRole("button", { name: "Save manual brief" }));
  await waitFor(() => expect(desktop.saveBrief).toHaveBeenCalled());
  const saved = vi.mocked(desktop.saveBrief).mock.calls[0][0];
  expect(saved.details?.orientation).toBe("Vertical");
  expect(saved.details?.supportingSubjects).toBe("Distant mountains");
  expect(saved.details?.keywords[0]).toBe("winter village");
  expect(saved.prompt).toContain("A quiet snow covered village");
  expect(saved.prompt).toContain("Orientation: Vertical");
});
