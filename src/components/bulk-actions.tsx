import { CheckIcon, XIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Button } from "./ui";

export function BulkActions({
  count,
  noun = "image",
  onClear,
  children,
}: {
  count: number;
  noun?: string;
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <div className="selection-dock">
      <section className="selection-bar" aria-label="Selection actions">
        <div className="selection-summary">
          <span className="selection-emblem" aria-hidden="true">
            <CheckIcon size={18} />
          </span>
          <div>
            <strong aria-live="polite">
              {count} {noun}
              {count === 1 ? "" : "s"} selected
            </strong>
          </div>
        </div>
        <div className="selection-actions">{children}</div>
        <Button
          className="selection-dismiss"
          aria-label="Clear selection"
          onClick={onClear}
        >
          <XIcon size={18} />
        </Button>
      </section>
    </div>
  );
}
