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

it("sorts all filtered rows numerically before pagination and toggles header direction", async () => {
  const user = userEvent.setup();
  const values = [100, 2, 12, 9, 81, 33, 4, 7, 20, 10, 1, 60];
  render(
    <Table
      rows={values.map((score, i) => ({
        id: String(i),
        score,
        createdAt: `2026-01-${String(i + 1).padStart(2, "0")}`,
      }))}
      searchText={(row) => String(row.score)}
      columns={[
        {
          label: "Score",
          sortValue: (row) => row.score,
          render: (row) => row.score,
        },
        { label: "Actions", render: () => "Open" },
      ]}
      empty={{ title: "Empty", description: "No rows" }}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Next page" }));
  await user.click(screen.getByRole("button", { name: "Score" }));
  expect(screen.getByText("Page 1 of 2")).toBeVisible();
  const cells = () =>
    Array.from(document.querySelectorAll("tbody tr td:first-child")).map(
      (cell) => Number(cell.textContent),
    );
  expect(cells()).toEqual([1, 2, 4, 7, 9, 10, 12, 20, 33, 60]);
  expect(screen.getByRole("columnheader", { name: "Score" })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await user.click(screen.getByRole("button", { name: "Score" }));
  expect(cells()).toEqual([100, 81, 60, 33, 20, 12, 10, 9, 7, 4]);
  expect(screen.getByRole("columnheader", { name: "Score" })).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  expect(
    screen.queryByRole("button", { name: "Actions" }),
  ).not.toBeInTheDocument();
});
