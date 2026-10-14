import {
  ArrowRightIcon,
  DatabaseIcon,
  DownloadSimpleIcon,
  GearSixIcon,
  KeyIcon,
  ShieldCheckIcon,
  TrashIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { navigate } from "../app/router";
import {
  Badge,
  Button,
  Confirm,
  Field,
  Modal,
  useActions,
} from "../components/ui";
import { Table } from "../components/table";
import { desktop } from "../lib/desktop";
import { useTheme, type ThemePreference } from "../lib/theme";
import { modelForProvider, type TextProvider } from "../lib/text-models";
import { TextModelOptions } from "../components/text-model-options";
import { bytes, date } from "../lib/format";
import {
  preferencesSchema,
  type Snapshot,
  type MigrationPreview,
} from "../lib/types";

export function Settings({
  data,
  params,
}: {
  data: Snapshot;
  params: URLSearchParams;
}) {
  const tab = params.get("tab") || "general";
  const tabs = [
    {
      id: "general",
      title: "General",
      description: "Workspace and preferences",
      icon: GearSixIcon,
    },
    {
      id: "providers",
      title: "Providers",
      description: "Your keys and connections",
      icon: KeyIcon,
    },
    {
      id: "storage",
      title: "Storage",
      description: "Local files, backup, and restore",
      icon: DatabaseIcon,
    },
    {
      id: "compliance",
      title: "Compliance",
      description: "Metadata and prohibited terms",
      icon: ShieldCheckIcon,
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p>Configure your private production workspace.</p>
        </div>
      </div>
      <div className="settings-layout">
        <nav aria-label="Settings sections" className="settings-nav">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "active" : ""}
              onClick={() => navigate("settings", { tab: t.id })}
            >
              <t.icon size={22} />
              <span>
                <strong>{t.title}</strong>
                <small>{t.description}</small>
              </span>
            </button>
          ))}
        </nav>
        <section className="panel settings-panel">
          {tab === "providers" ? (
            <Providers data={data} />
          ) : tab === "storage" ? (
            <Storage data={data} />
          ) : (
            <PreferencesForm
              key={tab + JSON.stringify(data.preferences)}
              data={data}
              compliance={tab === "compliance"}
            />
          )}
        </section>
      </div>
    </>
  );
}
function PreferencesForm({
  data,
  compliance,
}: {
  data: Snapshot;
  compliance: boolean;
}) {
  const { run, busy, notify } = useActions();
  const theme = useTheme();
  const [input, setInput] = useState(() => ({
    ...data.preferences,
    defaultTextModel: modelForProvider(
      data.preferences.defaultTextProvider,
      data.preferences.defaultTextModel,
    ),
  }));
  const [terms, setTerms] = useState(input.prohibitedTerms.join("\n"));
  const catalog = useQuery({
    queryKey: ["capabilities"],
    queryFn: desktop.capabilities,
  });
  async function save(e: FormEvent) {
    e.preventDefault();
    const result = preferencesSchema.safeParse({
      ...input,
      prohibitedTerms: terms
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    });
    if (!result.success) {
      notify(
        result.error.issues[0]?.message ?? "Check your preferences.",
        "error",
      );
      return;
    }
    await run(() => desktop.savePreferences(result.data), "Preferences saved.");
  }
  return (
    <>
      <header>
        <h2>{compliance ? "Compliance preferences" : "General settings"}</h2>
        <p>
          {compliance
            ? "Local validation supports your review process. Human checks remain required."
            : "Basic information and local production preferences."}
        </p>
      </header>
      <form className="panel-body" onSubmit={save}>
        {compliance ? (
          <>
            <div className="info-block">
              <strong>Export requirements</strong>
              <p>
                Approved decision · all four human checks · 4 to 100 MP · title
                up to 70 characters · 5 to 49 distinct keywords · Adobe
                category.
              </p>
            </div>
            <Field
              label="Prohibited metadata terms"
              hint="One term per line. Matching ignores case and checks titles and keywords."
            >
              <textarea
                rows={10}
                maxLength={100000}
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                placeholder="Add terms you want to exclude from exports"
              />
            </Field>
          </>
        ) : (
          <>
            <div className="form-grid">
              <Field label="Workspace name">
                <input
                  required
                  maxLength={100}
                  value={input.workspaceName}
                  onChange={(e) =>
                    setInput((current) => ({
                      ...current,
                      workspaceName: e.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Default region">
                <input
                  required
                  maxLength={100}
                  value={input.region}
                  onChange={(e) =>
                    setInput((current) => ({
                      ...current,
                      region: e.target.value,
                    }))
                  }
                />
              </Field>
              <Field
                label="Appearance"
                className="full"
                hint="Applies immediately on this device."
              >
                <select
                  value={theme.preference}
                  onChange={(e) =>
                    theme.setPreference(e.target.value as ThemePreference)
                  }
                >
                  <option value="system">Follow system</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </Field>
              <Field label="Default text provider">
                <select
                  value={input.defaultTextProvider}
                  onChange={(e) =>
                    setInput((current) => ({
                      ...current,
                      defaultTextProvider: e.target
                        .value as typeof input.defaultTextProvider,
                      defaultTextModel: modelForProvider(
                        e.target.value as TextProvider,
                      ),
                    }))
                  }
                >
                  <option value="local">Local rules</option>
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Google Gemini</option>
                </select>
              </Field>
              <Field
                label="Default text model"
                hint="Static API catalogue. Access depends on your provider account."
              >
                <select
                  required
                  value={input.defaultTextModel}
                  onChange={(e) =>
                    setInput((current) => ({
                      ...current,
                      defaultTextModel: e.target.value,
                    }))
                  }
                >
                  <TextModelOptions
                    provider={input.defaultTextProvider}
                    value={input.defaultTextModel}
                  />
                </select>
              </Field>
              <Field label="Default image provider / model" className="full">
                <select
                  value={`${input.defaultImageProvider}:${input.defaultImageModel}`}
                  onChange={(e) => {
                    const selected = catalog.data?.find(
                      (c) => `${c.provider}:${c.model}` === e.target.value,
                    );
                    if (selected)
                      setInput((current) => ({
                        ...current,
                        defaultImageProvider: selected.provider,
                        defaultImageModel: selected.model,
                      }));
                  }}
                >
                  {catalog.data?.map((c) => (
                    <option
                      key={`${c.provider}:${c.model}`}
                      value={`${c.provider}:${c.model}`}
                    >
                      {c.provider} · {c.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="info-block">
              <ShieldCheckIcon size={24} />
              <div>
                <strong>A private workspace on your machine</strong>
                <p>
                  No account is required. Your research, briefs, original
                  images, and review history are stored locally.
                </p>
              </div>
            </div>
            <div className="detail-row">
              <span>Workspace identifier</span>
              <code>{data.workspaceId}</code>
            </div>
            <div className="detail-row">
              <span>Database schema</span>
              <span>Version {data.schemaVersion}</span>
            </div>
          </>
        )}
        <div className="form-actions">
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save preferences"}
          </Button>
        </div>
      </form>
    </>
  );
}
function Providers({ data }: { data: Snapshot }) {
  const { run, busy } = useActions();
  const [remove, setRemove] = useState<string | null>(null);
  const names: Record<string, string> = {
    openai: "OpenAI",
    gemini: "Google Gemini",
    snapgen: "SnapGenAI",
  };
  async function save(e: FormEvent<HTMLFormElement>, provider: string) {
    e.preventDefault();
    const form = e.currentTarget;
    const key = String(new FormData(form).get("key") ?? "");
    const result = await run(
      () => desktop.saveKey(provider, key),
      `${names[provider]} key saved in the OS credential vault.`,
    );
    // Keep the transient input available for retry if the vault rejects the save.
    // Existing saved credentials are never returned to the renderer.
    if (result.ok) form.reset();
  }
  return (
    <>
      <header>
        <h2>Provider credentials</h2>
        <p>
          Bring your own keys. Credentials are kept in the operating-system
          vault.
        </p>
      </header>
      <div className="panel-body">
        <div className="info-block">
          <KeyIcon size={24} />
          <div>
            <strong>Your provider account, your credentials</strong>
            <p>
              Keys are never returned to the interface or included in backups,
              database records, or diagnostic logs.
            </p>
          </div>
        </div>
        {data.providers.map((provider) => (
          <section className="provider-card" key={provider.id}>
            <div className="provider-heading">
              <h3>{names[provider.id]}</h3>
              <Badge
                tone={provider.status === "connected" ? "approved" : "neutral"}
              >
                {provider.configured
                  ? provider.status === "untested"
                    ? "Key saved · Not tested"
                    : provider.status
                  : "No key saved"}
              </Badge>
            </div>
            <p>
              {provider.id === "snapgen"
                ? "Image generation, result recovery, and provider logo removal."
                : "Text, research, and image metadata. Connection testing uses a read-only model lookup."}
            </p>
            <form onSubmit={(e) => save(e, provider.id)}>
              <Field
                label={provider.configured ? "Replace API key" : "API key"}
              >
                <input
                  name="key"
                  type="password"
                  required
                  autoComplete="new-password"
                  maxLength={4096}
                  placeholder="Paste a key to store securely"
                />
              </Field>
              <Button type="submit" variant="primary" disabled={busy}>
                Save key
              </Button>
            </form>
            <div className="provider-actions">
              <span>
                {provider.lastTested
                  ? `Last tested ${date(provider.lastTested)}`
                  : "Not tested"}
              </span>
              <Button
                disabled={!provider.configured || busy}
                onClick={() =>
                  run(
                    () => desktop.testProvider(provider.id),
                    "Provider connection verified.",
                  )
                }
              >
                Test connection
              </Button>
              <Button
                variant="ghost"
                aria-label={`Remove ${names[provider.id]} key`}
                disabled={!provider.configured || busy}
                onClick={() => setRemove(provider.id)}
              >
                <TrashIcon size={18} />
              </Button>
            </div>
          </section>
        ))}
      </div>
      <Confirm
        open={!!remove}
        title="Remove provider key?"
        description="Future requests will need a new key. Your local workspace data is preserved."
        onClose={() => setRemove(null)}
        busy={busy}
        danger
        label="Remove key"
        onConfirm={async () => {
          if (!remove) return;
          const result = await run(
            () => desktop.removeKey(remove),
            "Provider key removed.",
          );
          if (result.ok) setRemove(null);
        }}
      />
    </>
  );
}
function Storage({ data }: { data: Snapshot }) {
  const { run, busy, notify } = useActions();
  const [restore, setRestore] = useState(false);
  const [migration, setMigration] = useState<MigrationPreview | null>(null);
  const [relocate, setRelocate] = useState(false);
  return (
    <>
      <header>
        <h2>Local storage</h2>
        <p>Back up your workspace and restore a validated package.</p>
      </header>
      <div className="panel-body">
        <div className="storage-summary">
          <DatabaseIcon size={36} weight="light" />
          <div>
            <strong>{bytes(data.storageBytes)}</strong>
            <p>
              {data.assets.length} original images · {data.briefs.length} briefs
            </p>
          </div>
        </div>
        <Field label="Workspace location">
          <input readOnly value={data.workspacePath} />
        </Field>
        <Button disabled={busy} onClick={() => setRelocate(true)}>
          Move workspace to another folder
        </Button>
        <div className="form-divider" />
        <h3>Backup and restore</h3>
        <p className="muted">
          Backups include the SQLite database, image library, previews, and
          prepared packages. Keys stay in the OS credential vault.
        </p>
        <div className="storage-actions">
          <Button
            disabled={busy}
            onClick={() =>
              run(
                () => desktop.backup(),
                (saved) => (saved ? "Workspace backup saved." : null),
              )
            }
          >
            <DownloadSimpleIcon size={18} />
            Create backup
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              run(
                () => desktop.rebuildPreviews(),
                (count) => `${count} image previews rebuilt.`,
              )
            }
          >
            Rebuild previews
          </Button>
          <Button disabled={busy} onClick={() => setRestore(true)}>
            <UploadSimpleIcon size={18} />
            Restore backup
          </Button>
        </div>
        <div className="info-block">
          <strong>Restore activates on the next launch</strong>
          <p>
            Thoock checks the archive, database, record references, and original
            image checksums. The current workspace is kept as a rollback copy
            beside the restored one.
          </p>
        </div>
        <div className="form-divider" />
        <h3>Diagnostics</h3>
        <p className="muted small">
          A support bundle includes platform information, record counts, and
          normalized diagnostic facts. It excludes credentials, prompts, image
          files, and the database.
        </p>
        <Button
          disabled={busy}
          onClick={() =>
            run(
              () => desktop.supportBundle(),
              (saved) => (saved ? "Support bundle saved." : null),
            )
          }
        >
          Save support bundle
        </Button>
        <div className="form-divider" />
        <h3>Import from the web app</h3>
        <p className="muted small">
          Choose a version 1 migration bundle. File checksums are validated
          before import, and failed imports can resume from staged checkpoints.
        </p>
        <Button
          disabled={busy}
          onClick={async () => {
            const result = await run(() => desktop.previewMigration());
            if (result.ok && result.value) setMigration(result.value);
          }}
        >
          Preview migration bundle
        </Button>
      </div>
      <Confirm
        open={!!migration}
        title="Import migration bundle?"
        description="The imported workspace activates on the next launch. Your current workspace is kept as a rollback copy."
        busy={busy}
        onClose={() => setMigration(null)}
        label="Import into staging"
        onConfirm={async () => {
          if (!migration) return;
          const result = await run(() => desktop.importMigration(migration.id));
          if (result.ok) {
            setMigration(null);
            notify(
              "Migration staged. Quit and reopen Thoock to activate it.",
              "warning",
            );
          }
        }}
      >
        <div className="request-summary">
          {Object.entries(migration?.counts ?? {}).map(([kind, count]) => (
            <div key={kind}>
              <span>{kind}</span>
              <strong>{count} records</strong>
            </div>
          ))}
          <div>
            <span>Archive contents</span>
            <strong>{bytes(migration?.bytes ?? 0)}</strong>
          </div>
          <div>
            <span>Working space estimate</span>
            <strong>{bytes(migration?.requiredBytes ?? 0)}</strong>
          </div>
        </div>
        <p className="muted small">
          Users, sessions, credentials, and raw provider payloads are excluded
          by the bundle contract. Preview validates checksums; import validates
          record references.
        </p>
      </Confirm>
      <Confirm
        open={relocate}
        title="Move the workspace?"
        description="Choose a parent folder for a new Thoock directory. The copied workspace activates after restart, and the existing workspace is retained."
        busy={busy}
        onClose={() => setRelocate(false)}
        label="Choose destination"
        onConfirm={async () => {
          const result = await run(() => desktop.relocateWorkspace());
          if (result.ok && result.value) {
            setRelocate(false);
            notify(
              "Workspace copied and validated. Restart Thoock to use the new location.",
              "warning",
            );
          }
        }}
      />
      <Confirm
        open={restore}
        title="Restore a workspace backup?"
        description="Select a Thoock backup to validate and stage. On the next launch it will replace the active workspace."
        busy={busy}
        onClose={() => setRestore(false)}
        label="Choose backup"
        onConfirm={async () => {
          const result = await run(() => desktop.restore());
          if (result.ok && result.value) {
            setRestore(false);
            notify(
              "Backup validated and staged. Quit and reopen Thoock to activate the restored workspace.",
              "warning",
            );
          }
        }}
      />
    </>
  );
}
export function Logs({
  data,
  params,
}: {
  data: Snapshot;
  params: URLSearchParams;
}) {
  const log = data.logs.find((l) => l.id === params.get("request"));
  const missing = params.has("request") && !log;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Provider logs</h1>
          <p>
            Inspect normalized diagnostics for local actions and provider
            connections.
          </p>
        </div>
        <Button onClick={() => navigate("generation", { view: "history" })}>
          View job history
          <ArrowRightIcon size={16} />
        </Button>
      </div>
      {missing && (
        <div className="inline-error">
          This correlation ID has no stored provider request. The action may
          have failed validation before a request was created.
        </div>
      )}
      <Table
        filterTitle="Filter provider logs"
        rows={data.logs}
        structuredFilters={[
          {
            label: "Provider",
            options: [...new Set(data.logs.map((l) => l.provider))],
            value: (l) => l.provider,
          },
          {
            label: "Model",
            options: [
              ...new Set(data.logs.map((l) => l.model).filter(Boolean)),
            ],
            value: (l) => l.model,
          },
          {
            label: "Operation",
            options: [...new Set(data.logs.map((l) => l.operation))],
            value: (l) => l.operation,
          },
          {
            label: "Duration",
            options: ["Under 1 second", "1 to 10 seconds", "Over 10 seconds"],
            value: (l) =>
              l.durationMs < 1000
                ? "Under 1 second"
                : l.durationMs <= 10000
                  ? "1 to 10 seconds"
                  : "Over 10 seconds",
          },
        ]}
        searchText={(l) =>
          `${l.provider} ${l.model} ${l.operation} ${l.status} ${l.id} ${l.message}`
        }
        placeholder="Search provider, operation, or correlation ID…"
        filter={{
          options: [...new Set(data.logs.map((l) => l.status))],
          value: (l) => l.status,
        }}
        empty={{
          title: "Every action has a trail",
          description:
            "Completed jobs and provider connection tests appear here. Credentials and raw provider responses are excluded.",
        }}
        columns={[
          {
            label: "Operation",
            render: (l) => (
              <button
                className="record-link"
                onClick={() => navigate("logs", { request: l.id })}
              >
                {l.operation}
                <small>{l.id.slice(0, 8)}</small>
              </button>
            ),
          },
          {
            label: "Provider / model",
            render: (l) => (
              <>
                {l.provider}
                <small className="cell-subtext">{l.model}</small>
              </>
            ),
          },
          {
            label: "Status",
            render: (l) => <Badge tone={l.status}>{l.status}</Badge>,
          },
          {
            label: "Duration",
            render: (l) => (l.durationMs ? `${l.durationMs} ms` : "Local task"),
          },
          { label: "Created", render: (l) => date(l.createdAt) },
        ]}
      />
      {log && (
        <Modal
          open
          onClose={() => navigate("logs")}
          placement="end"
          title="Provider request details"
          description="Normalized local diagnostics. No credentials or raw request content."
        >
          <dl className="log-detail">
            <dt>Correlation ID</dt>
            <dd>
              <code>{log.id}</code>
            </dd>
            <dt>Operation</dt>
            <dd>{log.operation}</dd>
            <dt>Provider</dt>
            <dd>{log.provider}</dd>
            <dt>Status</dt>
            <dd>
              <Badge tone={log.status}>{log.status}</Badge>
            </dd>
            <dt>Created</dt>
            <dd>{new Date(log.createdAt).toLocaleString()}</dd>
            <dt>Request ID</dt>
            <dd>
              <code>{log.requestId ?? "Unavailable"}</code>
            </dd>
            <dt>Model</dt>
            <dd>{log.model || "Local operation"}</dd>
            <dt>Message</dt>
            <dd>{log.message}</dd>
          </dl>
          <h3>Request summary</h3>
          <pre className="log-json">
            {JSON.stringify(log.requestSummary, null, 2)}
          </pre>
          <h3>Response summary</h3>
          <pre className="log-json">
            {JSON.stringify(log.responseSummary, null, 2)}
          </pre>
        </Modal>
      )}
    </>
  );
}
