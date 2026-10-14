import * as Dialog from "@radix-ui/react-dialog";
import * as Toast from "@radix-ui/react-toast";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  InfoIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  createContext,
  cloneElement,
  isValidElement,
  useContext,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type ReactElement,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { errorMessage } from "../lib/types";

export function Button({
  children,
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button
      className={`button ${variant} ${className}`}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function ActiveFilters({
  items,
  onClear,
}: {
  items: { label: string; onRemove: () => void }[];
  onClear: () => void;
}) {
  if (!items.length) return null;
  return (
    <div className="active-filters" aria-label="Applied filters">
      {items.map((item) => (
        <button
          key={item.label}
          className="filter-chip"
          onClick={item.onRemove}
          aria-label={`Remove ${item.label} filter`}
        >
          {item.label}
          <XIcon size={12} />
        </button>
      ))}
      <Button variant="ghost" onClick={onClear}>
        Clear all
      </Button>
    </div>
  );
}
export function Empty({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide = false,
  size,
  variant = "editor",
  tabs,
  eyebrow,
  placement = "center",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  size?: "compact" | "filter" | "medium" | "form" | "wide" | "review";
  variant?: "editor" | "confirmation" | "filter" | "plain";
  tabs?: ReactNode;
  eyebrow?: ReactNode;
  placement?: "center" | "end";
}) {
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className={`dialog dialog-${size ?? (wide ? "wide" : "form")} dialog-${variant} ${placement === "end" ? "dialog-drawer" : ""}`}
          onOpenAutoFocus={() => {
            opener.current = document.activeElement as HTMLElement;
          }}
          onCloseAutoFocus={(e) => {
            // Route dialogs have no Radix Trigger. Restore focus to the recorded opener.
            e.preventDefault();
            const target =
              opener.current?.isConnected && opener.current !== document.body
                ? opener.current
                : document.querySelector<HTMLElement>(
                    "[data-dialog-opener='true']",
                  );
            target?.focus();
            target?.removeAttribute("data-dialog-opener");
          }}
        >
          <header className="dialog-header">
            <div>
              {eyebrow && <div className="dialog-eyebrow">{eyebrow}</div>}
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </div>
            {variant !== "confirmation" && (
              <Dialog.Close asChild>
                <Button variant="ghost" aria-label="Close dialog">
                  <XIcon size={20} />
                </Button>
              </Dialog.Close>
            )}
          </header>
          {tabs && <div className="dialog-toolbar">{tabs}</div>}
          <div className="dialog-body">{children}</div>
          {footer && <footer className="dialog-footer">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Confirm({
  title,
  description,
  open,
  onClose,
  onConfirm,
  busy,
  danger = false,
  children,
  label = "Confirm",
  layout = "confirmation",
}: {
  title: string;
  description: string;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
  danger?: boolean;
  children?: ReactNode;
  label?: string;
  layout?: "confirmation" | "plain";
}) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      description={description}
      size="compact"
      variant={layout}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Working…" : label}
            <ArrowRightIcon size={16} />
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
/** A fixed, keyboard-operable segmented control for editor sections. */
export function ModalTabs({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  items: { value: string; label: string }[];
  label: string;
}) {
  const id = useId();
  return (
    <div className="segmented-tabs" role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          id={`${id}-${item.value}`}
          aria-selected={value === item.value}
          tabIndex={value === item.value ? 0 : -1}
          onClick={() => onChange(item.value)}
          onKeyDown={(event) => {
            const next =
              event.key === "ArrowRight"
                ? (index + 1) % items.length
                : event.key === "ArrowLeft"
                  ? (index + items.length - 1) % items.length
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? items.length - 1
                      : -1;
            if (next < 0) return;
            event.preventDefault();
            onChange(items[next].value);
            document.getElementById(`${id}-${items[next].value}`)?.focus();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
  className = "",
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  const control =
    isValidElement(children) &&
    ["input", "textarea", "select"].includes(String(children.type))
      ? cloneElement(
          children as ReactElement<{
            "aria-labelledby"?: string;
            "aria-describedby"?: string;
          }>,
          {
            "aria-labelledby": `${id}-label`,
            "aria-describedby": hint ? `${id}-hint` : undefined,
          },
        )
      : children;
  return (
    <label className={`field ${className}`}>
      <span id={`${id}-label`}>{label}</span>
      {control}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </label>
  );
}
type Notice = {
  id: number;
  message: string;
  tone: "success" | "error" | "info" | "warning";
  correlationId?: string;
};
type ActionContextType = {
  busy: boolean;
  notify: (
    message: string,
    tone?: Notice["tone"],
    correlationId?: string,
  ) => void;
  run: <T>(
    task: () => Promise<T>,
    message?: string | ((result: T) => string | null),
  ) => Promise<{ ok: true; value: T } | { ok: false }>;
};
const ActionContext = createContext<ActionContextType | null>(null);
export function ActionProvider({ children }: { children: ReactNode }) {
  const query = useQueryClient();
  const [pending, setPending] = useState(0);
  const [notices, setNotices] = useState<Notice[]>([]);
  function notify(
    message: string,
    tone: Notice["tone"] = "info",
    correlationId?: string,
  ) {
    setNotices((current) => [
      ...current.slice(-3),
      { id: Date.now() + Math.random(), message, tone, correlationId },
    ]);
  }
  async function run<T>(
    task: () => Promise<T>,
    message?: string | ((result: T) => string | null),
  ): Promise<{ ok: true; value: T } | { ok: false }> {
    setPending((n) => n + 1);
    try {
      const value = await task();
      await query.invalidateQueries({ queryKey: ["workspace"] });
      const text = typeof message === "function" ? message(value) : message;
      if (text) notify(text, "success");
      return { ok: true, value };
    } catch (error) {
      const e = errorMessage(error);
      notify(e.message, "error", e.correlationId);
      await query.invalidateQueries({ queryKey: ["workspace"] });
      return { ok: false };
    } finally {
      setPending((n) => n - 1);
    }
  }
  return (
    <ActionContext.Provider value={{ busy: pending > 0, run, notify }}>
      <Toast.Provider swipeDirection="right" duration={7000}>
        {children}
        {notices.map((notice) => (
          <Toast.Root
            key={notice.id}
            className={`toast ${notice.tone}`}
            onOpenChange={(open) => {
              if (!open)
                setNotices((items) =>
                  items.filter((item) => item.id !== notice.id),
                );
            }}
          >
            <span>
              {notice.tone === "success" ? (
                <CheckCircleIcon size={22} />
              ) : notice.tone === "error" ? (
                <WarningCircleIcon size={22} />
              ) : (
                <InfoIcon size={22} />
              )}
            </span>
            <div>
              <Toast.Description>{notice.message}</Toast.Description>
              {notice.correlationId && (
                <a href={`#/logs?request=${notice.correlationId}`}>
                  View diagnostic details
                </a>
              )}
            </div>
            <Toast.Close asChild>
              <Button variant="ghost" aria-label="Dismiss notification">
                <XIcon size={16} />
              </Button>
            </Toast.Close>
          </Toast.Root>
        ))}
        <Toast.Viewport className="toast-viewport" />
      </Toast.Provider>
    </ActionContext.Provider>
  );
}
export function useActions() {
  const value = useContext(ActionContext);
  if (!value) throw new Error("ActionProvider is required");
  return value;
}
