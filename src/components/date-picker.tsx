import * as Popover from "@radix-ui/react-popover";
import {
  CalendarBlankIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "./ui";
import "./date-picker.css";

function key(date: Date) {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parse(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  date.setFullYear(year);
  return key(date) === value ? date : undefined;
}
function shiftMonth(date: Date, count: number) {
  const next = new Date(date);
  next.setDate(1);
  next.setMonth(next.getMonth() + count);
  next.setDate(
    Math.min(
      date.getDate(),
      new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate(),
    ),
  );
  return next;
}
const months = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(2026, i, 1)),
);
const readable = (date: Date) =>
  new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);

export function DatePicker({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
}) {
  const today = new Date();
  const todayKey = key(today);
  const disabled = (date: Date) =>
    !!((min && key(date) < min) || (max && key(date) > max));
  function clamp(date: Date) {
    if (min && key(date) < min) return parse(min) ?? date;
    if (max && key(date) > max) return parse(max) ?? date;
    return date;
  }
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(() => clamp(parse(value) ?? today));
  const [month, setMonth] = useState(
    () => new Date(focus.getFullYear(), focus.getMonth(), 1),
  );
  const grid = useRef<HTMLDivElement>(null);
  const focusKey = key(focus);
  useEffect(() => {
    if (open)
      grid.current
        ?.querySelector<HTMLButtonElement>(`[data-date="${focusKey}"]`)
        ?.focus();
  }, [open, focusKey]);
  function move(date: Date) {
    const next = clamp(date);
    setFocus(next);
    setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, date: Date) {
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -date.getDay(),
      End: 6 - date.getDay(),
    };
    if (event.key in offsets) {
      event.preventDefault();
      const next = new Date(date);
      next.setDate(next.getDate() + offsets[event.key]);
      move(next);
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      move(
        shiftMonth(
          date,
          (event.key === "PageUp" ? -1 : 1) * (event.shiftKey ? 12 : 1),
        ),
      );
    }
  }
  function select(date: Date) {
    if (disabled(date)) return;
    onChange(key(date));
    setOpen(false);
  }
  const start = new Date(month);
  start.setDate(1 - start.getDay());
  const dates = Array.from({ length: 42 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return day;
  });
  const firstYear = Math.min(today.getFullYear() - 100, month.getFullYear());
  const lastYear = Math.max(today.getFullYear() + 20, month.getFullYear());
  const selected = parse(value);
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) move(parse(value) ?? new Date());
        setOpen(next);
      }}
      modal
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          className={`date-trigger ${value ? "has-date" : ""}`}
          aria-label={label}
          aria-description={selected ? readable(selected) : "No date selected"}
        >
          <span>{selected ? readable(selected) : "Choose date"}</span>
          <CalendarBlankIcon size={18} aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="date-calendar"
          aria-label={`${label} calendar`}
          align="start"
          sideOffset={8}
          collisionPadding={12}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            grid.current
              ?.querySelector<HTMLButtonElement>(`[data-date="${focusKey}"]`)
              ?.focus();
          }}
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          <div className="date-calendar-header">
            <Button
              variant="ghost"
              aria-label="Previous month"
              disabled={
                !!min &&
                key(new Date(month.getFullYear(), month.getMonth(), 0)) < min
              }
              onClick={() => move(shiftMonth(focus, -1))}
            >
              <CaretLeftIcon size={18} />
            </Button>
            <select
              aria-label="Calendar month"
              value={month.getMonth()}
              onChange={(event) =>
                move(
                  new Date(
                    month.getFullYear(),
                    Number(event.target.value),
                    1,
                    12,
                  ),
                )
              }
            >
              {months.map((name, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label="Calendar year"
              value={month.getFullYear()}
              onChange={(event) =>
                move(
                  new Date(Number(event.target.value), month.getMonth(), 1, 12),
                )
              }
            >
              {Array.from({ length: lastYear - firstYear + 1 }, (_, i) => (
                <option key={firstYear + i} value={firstYear + i}>
                  {firstYear + i}
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              aria-label="Next month"
              disabled={
                !!max &&
                key(new Date(month.getFullYear(), month.getMonth() + 1, 1)) >
                  max
              }
              onClick={() => move(shiftMonth(focus, 1))}
            >
              <CaretRightIcon size={18} />
            </Button>
          </div>
          <div className="date-weekdays" aria-hidden>
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div
            className="date-days"
            ref={grid}
            role="group"
            aria-label={`${months[month.getMonth()]} ${month.getFullYear()}`}
          >
            {dates.map((date) => {
              const dateKey = key(date);
              return (
                <button
                  key={dateKey}
                  type="button"
                  data-date={dateKey}
                  className={`date-day ${date.getMonth() !== month.getMonth() ? "outside-month" : ""} ${dateKey === todayKey ? "today" : ""}`}
                  aria-label={readable(date)}
                  aria-pressed={dateKey === value}
                  aria-current={dateKey === todayKey ? "date" : undefined}
                  disabled={disabled(date)}
                  tabIndex={dateKey === focusKey ? 0 : -1}
                  onFocus={() => setFocus(date)}
                  onKeyDown={(event) => keyboard(event, date)}
                  onClick={() => select(date)}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="date-calendar-footer">
            <Button
              variant="ghost"
              disabled={!value}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear date
            </Button>
            <Button disabled={disabled(today)} onClick={() => select(today)}>
              Today
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
