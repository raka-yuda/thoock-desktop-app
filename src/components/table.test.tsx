import { useState } from "react";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { Table, toggleSelection } from "./table";
const rows = Array.from({ length: 25 }, (_, i) => ({
  id: String(i),
  name: `Brief ${String(i + 1).padStart(2, "0")}`,
  createdAt: new Date(2026, 0, 25 - i).toISOString(),
}));
function Harness() {
  const [selected, setSelected] = useState(new Set<string>());
  return (
    <Table
      rows={rows}
      selected={selected}
      onSelect={(ids, checked) =>
        setSelected((current) => toggleSelection(current, ids, checked))
      }
      searchText={(row) => row.name}
      placeholder="Search briefs"
      columns={[{ label: "Brief", render: (row) => row.name }]}
      empty={{ title: "Empty", description: "No rows" }}
    />
  );
}
describe("entity selection", () => {
  it("keeps selection across pages and limits the page checkbox to visible rows", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(
      screen.getByRole("checkbox", { name: "Select this page" }),
    );
    expect(screen.getByText("10 selected across pages")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(
      screen.getByRole("checkbox", { name: "Select this page" }),
    ).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "Select Brief 11" }));
    expect(screen.getByText("11 selected across pages")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Previous page" }));
    expect(
      screen.getByRole("checkbox", { name: "Select this page" }),
    ).toBeChecked();
    await user.click(
      screen.getByRole("checkbox", { name: "Select this page" }),
    );
    expect(screen.getByText("1 selected across pages")).toBeVisible();
    await user.type(
      screen.getByRole("textbox", { name: "Search briefs" }),
      "Brief 11",
    );
    expect(
      screen.getByRole("checkbox", { name: "Select Brief 11" }),
    ).toBeChecked();
  });
  it("resets the results page after search", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await user.type(
      screen.getByRole("textbox", { name: "Search briefs" }),
      "Brief 01",
    );
    expect(screen.getByText("Page 1 of 1")).toBeVisible();
    expect(screen.getByText("Brief 01")).toBeVisible();
  });
});
