import {
  ArrowDownIcon,
  ArrowUpIcon,
  CaretLeftIcon,
  CaretRightIcon,
  MagnifyingGlassIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import { useMemo, useState, type ReactNode } from "react";
import { Button, Empty, Field, Modal, ActiveFilters } from "./ui";
import { DatePicker } from "./date-picker";

type RecordRow = { id: string; createdAt: string };
export function localDateKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export type Column<T> = {
  label: string;
  render: (row: T) => ReactNode;
  className?: string;
  sortValue?: (row: T) => string | number;
};
export function toggleSelection(
  current: Set<string>,
  ids: string[],
  selected: boolean,
) {
  const next = new Set(current);
  for (const id of ids) {
    if (selected) next.add(id);
    else next.delete(id);
  }
  return next;
}
export function Table<T extends RecordRow>({
  rows,
  columns,
  searchText,
  placeholder = "Search…",
  empty,
  selected,
  onSelect,
  filter,
  structuredFilters = [],
  toolbar,
  filterTitle = "Filter results",
}: {
  rows: T[];
  columns: Column<T>[];
  searchText: (row: T) => string;
  placeholder?: string;
  empty: { title: string; description: string; action?: ReactNode };
  selected?: Set<string>;
  onSelect?: (ids: string[], checked: boolean) => void;
  filter?: { options: string[]; value: (row: T) => string };
  structuredFilters?: {
    label: string;
    presentation?: "chips";
    options: string[];
    value: (row: T) => string;
  }[];
  toolbar?: ReactNode;
  filterTitle?: string;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [conditions, setConditions] = useState<Record<string, string>>({});
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filters, setFilters] = useState(false);
  const [draft, setDraft] = useState({
    status: "",
    conditions: {} as Record<string, string>,
    from: "",
    to: "",
  });
  const [page, setPage] = useState(1);
  const [ascending, setAscending] = useState(false);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const activeColumn = columns.find(
    (column) => column.label === sortColumn && column.sortValue,
  );
  const filtered = useMemo(
    () =>
      rows
        .filter(
          (row) =>
            searchText(row).toLowerCase().includes(search.toLowerCase()) &&
            (!status || filter?.value(row) === status) &&
            structuredFilters.every(
              (f) =>
                !conditions[f.label] || f.value(row) === conditions[f.label],
            ) &&
            (!from || localDateKey(row.createdAt) >= from) &&
            (!to || localDateKey(row.createdAt) <= to),
        )
        .sort((a, b) => {
          const left = activeColumn?.sortValue?.(a) ?? a.createdAt;
          const right = activeColumn?.sortValue?.(b) ?? b.createdAt;
          const comparison =
            typeof left === "number" && typeof right === "number"
              ? left - right
              : String(left).localeCompare(String(right), undefined, {
                  numeric: true,
                  sensitivity: "base",
                });
          return (
            (ascending ? comparison : -comparison) || a.id.localeCompare(b.id)
          );
        }),
    [
      rows,
      searchText,
      search,
      status,
      filter,
      structuredFilters,
      conditions,
      from,
      to,
      ascending,
      activeColumn,
    ],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * 10, current * 10);
  const all =
    visible.length > 0 && visible.every((row) => selected?.has(row.id));
  return (
    <section className="table-card">
      <div className="table-tools">
        <div className="search-input">
          <MagnifyingGlassIcon size={18} />
          <input
            aria-label={placeholder}
            placeholder={placeholder}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Button
          aria-haspopup="dialog"
          aria-expanded={filters}
          onClick={() => {
            setDraft({ status, conditions: { ...conditions }, from, to });
            setFilters(true);
          }}
        >
          <SlidersHorizontalIcon size={17} />
          Filters
          {(status ||
            from ||
            to ||
            Object.values(conditions).some(Boolean)) && (
            <span className="filter-count">On</span>
          )}
        </Button>
        {toolbar}
      </div>
      <Modal
        open={filters}
        onClose={() => setFilters(false)}
        title={filterTitle}
        description="Choose conditions, then apply them to the list."
        size="filter"
        variant="filter"
        footer={
          <>
            <Button
              variant="danger"
              onClick={() =>
                setDraft({ status: "", conditions: {}, from: "", to: "" })
              }
            >
              Clear all
            </Button>
            <span className="footer-spacer" />
            <Button onClick={() => setFilters(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                setStatus(draft.status);
                setConditions(draft.conditions);
                setFrom(draft.from);
                setTo(draft.to);
                setPage(1);
                setFilters(false);
              }}
            >
              Apply filters
            </Button>
          </>
        }
      >
        <div className="filter-fields">
          {structuredFilters.map((f) => (
            <Field label={f.label} key={f.label}>
              {f.presentation === "chips" ? (
                <div className="filter-chips">
                  {["", ...f.options].map((option) => (
                    <Button
                      key={option}
                      aria-pressed={
                        (draft.conditions[f.label] ?? "") === option
                      }
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          conditions: {
                            ...current.conditions,
                            [f.label]: option,
                          },
                        }))
                      }
                    >
                      {option || `Any ${f.label.toLowerCase()}`}
                    </Button>
                  ))}
                </div>
              ) : (
                <select
                  value={draft.conditions[f.label] ?? ""}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      conditions: {
                        ...current.conditions,
                        [f.label]: e.target.value,
                      },
                    }))
                  }
                >
                  <option value="">All</option>
                  {f.options.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              )}
            </Field>
          ))}
          {filter && (
            <Field label="Status">
              <div className="filter-chips">
                {["", ...filter.options].map((option) => (
                  <Button
                    key={option}
                    aria-pressed={draft.status === option}
                    onClick={() =>
                      setDraft((current) => ({ ...current, status: option }))
                    }
                  >
                    {option || "Any status"}
                  </Button>
                ))}
              </div>
            </Field>
          )}
          <div className="form-grid">
            <Field label="Created from">
              <DatePicker
                label="Created from"
                value={draft.from}
                max={draft.to || undefined}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, from: value }))
                }
              />
            </Field>
            <Field label="Created through">
              <DatePicker
                label="Created through"
                value={draft.to}
                min={draft.from || undefined}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, to: value }))
                }
              />
            </Field>
          </div>
        </div>
      </Modal>
      <ActiveFilters
        items={[
          ...Object.entries(conditions)
            .filter(([, value]) => value)
            .map(([label, value]) => ({
              label: `${label}: ${value}`,
              onRemove: () => {
                setConditions((current) => ({ ...current, [label]: "" }));
                setPage(1);
              },
            })),
          ...(status
            ? [
                {
                  label: `Status: ${status}`,
                  onRemove: () => {
                    setStatus("");
                    setPage(1);
                  },
                },
              ]
            : []),
          ...(from
            ? [
                {
                  label: `From: ${from}`,
                  onRemove: () => {
                    setFrom("");
                    setPage(1);
                  },
                },
              ]
            : []),
          ...(to
            ? [
                {
                  label: `Through: ${to}`,
                  onRemove: () => {
                    setTo("");
                    setPage(1);
                  },
                },
              ]
            : []),
        ]}
        onClear={() => {
          setConditions({});
          setStatus("");
          setFrom("");
          setTo("");
          setPage(1);
        }}
      />
      <div className="table-meta">
        <span>
          {filtered.length} {filtered.length === 1 ? "result" : "results"}
          {selected && selected.size > 0 && (
            <>
              {" "}
              · <strong>{selected.size} selected across pages</strong>
            </>
          )}
        </span>
        <Button
          variant="ghost"
          onClick={() => {
            setSortColumn(null);
            setAscending(sortColumn ? false : !ascending);
            setPage(1);
          }}
          aria-label={`Sort ${sortColumn || ascending ? "newest" : "oldest"} first`}
        >
          {ascending ? <ArrowUpIcon size={14} /> : <ArrowDownIcon size={14} />}
          {activeColumn
            ? `${activeColumn.label}: ${ascending ? "ascending" : "descending"}`
            : ascending
              ? "Oldest first"
              : "Newest first"}
        </Button>
      </div>
      {filtered.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {onSelect && (
                  <th className="checkbox-cell">
                    <input
                      type="checkbox"
                      aria-label="Select this page"
                      checked={all}
                      ref={(node) => {
                        if (node)
                          node.indeterminate =
                            !all &&
                            visible.some((row) => selected?.has(row.id));
                      }}
                      onChange={(e) =>
                        onSelect(
                          visible.map((row) => row.id),
                          e.target.checked,
                        )
                      }
                    />
                  </th>
                )}
                {columns.map((column) => (
                  <th
                    key={column.label}
                    className={column.className}
                    aria-sort={
                      column.sortValue
                        ? activeColumn?.label === column.label
                          ? ascending
                            ? "ascending"
                            : "descending"
                          : "none"
                        : undefined
                    }
                  >
                    {column.sortValue ? (
                      <button
                        className="column-sort"
                        onClick={() => {
                          setAscending(
                            activeColumn?.label === column.label
                              ? !ascending
                              : true,
                          );
                          setSortColumn(column.label);
                          setPage(1);
                        }}
                      >
                        {column.label}
                        {activeColumn?.label === column.label ? (
                          ascending ? (
                            <ArrowUpIcon size={14} />
                          ) : (
                            <ArrowDownIcon size={14} />
                          )
                        ) : (
                          <span className="sort-indicator" aria-hidden="true">
                            ↕
                          </span>
                        )}
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.id}
                  className={selected?.has(row.id) ? "selected-row" : ""}
                >
                  {onSelect && (
                    <td className="checkbox-cell">
                      <input
                        type="checkbox"
                        aria-label={`Select ${searchText(row).split(" ").slice(0, 6).join(" ")}`}
                        checked={selected?.has(row.id) ?? false}
                        onChange={(e) => onSelect([row.id], e.target.checked)}
                      />
                    </td>
                  )}
                  {columns.map((column) => (
                    <td key={column.label} className={column.className}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon={<MagnifyingGlassIcon size={28} />}
          title={rows.length ? "No matching results" : empty.title}
          description={
            rows.length
              ? "Try a different search or clear your filters."
              : empty.description
          }
          action={
            rows.length ? (
              <Button
                onClick={() => {
                  setSearch("");
                  setStatus("");
                  setConditions({});
                  setFrom("");
                  setTo("");
                }}
              >
                Clear filters
              </Button>
            ) : (
              empty.action
            )
          }
        />
      )}
      <footer className="pagination">
        <span>
          {filtered.length
            ? `${(current - 1) * 10 + 1}–${Math.min(current * 10, filtered.length)} of ${filtered.length}`
            : "0 results"}{" "}
          · 10 per page
        </span>
        <div>
          <Button
            variant="ghost"
            aria-label="Previous page"
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
          >
            <CaretLeftIcon size={16} />
          </Button>
          <span>
            Page {current} of {pages}
          </span>
          <Button
            variant="ghost"
            aria-label="Next page"
            disabled={current >= pages}
            onClick={() => setPage(current + 1)}
          >
            <CaretRightIcon size={16} />
          </Button>
        </div>
      </footer>
    </section>
  );
}
