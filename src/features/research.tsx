import { BulkActions } from "../components/bulk-actions";
import {
  ArrowRightIcon,
  FileCsvIcon,
  PencilSimpleIcon,
  PlusIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";
import {
  Badge,
  Button,
  Field,
  Modal,
  ModalTabs,
  useActions,
} from "../components/ui";
import { Table } from "../components/table";
import { desktop } from "../lib/desktop";
import { date, score } from "../lib/format";
import {
  type Brief,
  type BriefInput,
  type Opportunity,
  type OpportunityInput,
  type Snapshot,
} from "../lib/types";
import { navigate } from "../app/router";
import { adobeCategories } from "../lib/categories";
import { TextJobModal } from "./text-jobs";

export function Opportunities({
  data,
  params,
}: {
  data: Snapshot;
  params: URLSearchParams;
}) {
  const [csv, setCsv] = useState(false);
  const [choice, setChoice] = useState(false);
  const edit = data.opportunities.find((o) => o.id === params.get("id"));
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Opportunities</h1>
          <p>
            Find commercially useful topics and turn research into direction.
          </p>
        </div>
        <div className="heading-actions">
          <Button onClick={() => setCsv(true)}>
            <FileCsvIcon size={18} />
            Import CSV
          </Button>
          <Button variant="primary" onClick={() => setChoice(true)}>
            <PlusIcon size={18} />
            Add opportunity
          </Button>
        </div>
      </div>
      <Table
        filterTitle="Filter opportunities"
        rows={data.opportunities}
        structuredFilters={[
          {
            label: "Type",
            presentation: "chips",
            options: ["evergreen", "seasonal", "trending", "Unspecified"],
            value: (o) => o.details?.behavior ?? "Unspecified",
          },
          {
            label: "Competition",
            presentation: "chips",
            options: ["Lower supply", "Moderate", "High supply"],
            value: (o) =>
              o.competition < 35
                ? "Lower supply"
                : o.competition < 70
                  ? "Moderate"
                  : "High supply",
          },
          {
            label: "Briefs",
            presentation: "chips",
            options: ["Without briefs", "Has briefs"],
            value: (o) =>
              data.briefs.some((b) => b.opportunityId === o.id)
                ? "Has briefs"
                : "Without briefs",
          },
          {
            label: "Market",
            options: [...new Set(data.opportunities.map((o) => o.market))],
            value: (o) => o.market,
          },
          {
            label: "Buyer",
            options: [...new Set(data.opportunities.map((o) => o.buyer))],
            value: (o) => o.buyer,
          },
          {
            label: "Opportunity score",
            options: ["75 to 100", "50 to 74", "Below 50"],
            value: (o) =>
              o.score >= 75
                ? "75 to 100"
                : o.score >= 50
                  ? "50 to 74"
                  : "Below 50",
          },
        ]}
        placeholder="Search topics, buyers, or markets…"
        searchText={(o) => `${o.topic} ${o.buyer} ${o.market}`}
        empty={{
          title: "Start with an opportunity",
          description:
            "Save a topic, identify its buyer, and record the commercial reasoning.",
          action: (
            <Button variant="primary" onClick={() => setChoice(true)}>
              <PlusIcon size={16} />
              Add your first topic
            </Button>
          ),
        }}
        columns={[
          {
            label: "Topic",
            sortValue: (o) => o.topic,
            render: (o) => (
              <button
                className="record-link"
                onClick={() => navigate("opportunities", { id: o.id })}
              >
                {o.topic}
                <small>{o.market}</small>
              </button>
            ),
          },
          { label: "Buyer", sortValue: (o) => o.buyer, render: (o) => o.buyer },
          {
            label: "Score",
            sortValue: (o) => o.score,
            render: (o) => (
              <span
                className="score"
                title="35% demand + 25% low competition + 40% commercial fit"
              >
                {o.score}
                <small>/100</small>
              </span>
            ),
          },
          {
            label: "Supply",
            sortValue: (o) => o.competition,
            render: (o) => (
              <Badge>
                {o.competition < 35
                  ? "Low"
                  : o.competition < 70
                    ? "Moderate"
                    : "High"}{" "}
                · estimated
              </Badge>
            ),
          },
          {
            label: "Created",
            sortValue: (o) => o.createdAt,
            render: (o) => date(o.createdAt),
          },
          {
            label: "Actions",
            render: (o) => (
              <Button
                variant="ghost"
                onClick={() =>
                  navigate("briefs", { new: "1", opportunity: o.id })
                }
              >
                Add brief
                <ArrowRightIcon size={16} />
              </Button>
            ),
          },
        ]}
      />
      {(params.has("new") || edit) && (
        <OpportunityForm
          key={edit?.id ?? "new"}
          existing={edit}
          onClose={() => navigate("opportunities")}
        />
      )}
      {params.has("ai") && (
        <TextJobModal
          data={data}
          kind="research"
          onClose={() => navigate("opportunities")}
        />
      )}
      {choice && (
        <AddMethod
          kind="opportunity"
          onClose={() => setChoice(false)}
          onChoose={(ai) => {
            setChoice(false);
            navigate("opportunities", ai ? { ai: "1" } : { new: "1" });
          }}
        />
      )}
      {csv && <CsvImport onClose={() => setCsv(false)} />}
    </>
  );
}
function OpportunityForm({
  existing,
  onClose,
}: {
  existing?: Opportunity;
  onClose: () => void;
}) {
  const { run, busy } = useActions();
  const [error, setError] = useState("");
  const defaults = {
    behavior: "evergreen" as const,
    resultCount: 25000,
    trendGrowth: existing?.demand ?? 65,
    commercialIntent: existing?.commercialFit ?? 70,
    seasonalFit: 60,
    portfolioFit: 50,
  };
  const [input, setInput] = useState<OpportunityInput>(
    existing
      ? { ...existing, details: existing.details ?? defaults }
      : {
          id: null,
          topic: "",
          buyer: "Commercial marketing teams",
          market: "Indonesia",
          demand: 65,
          competition: 88,
          commercialFit: 62,
          notes: "",
          details: defaults,
        },
  );
  const details = input.details!;
  function signal<K extends keyof typeof details>(
    key: K,
    value: (typeof details)[K],
  ) {
    setInput((current) => {
      const d = { ...current.details!, [key]: value };
      return {
        ...current,
        details: d,
        demand: d.trendGrowth,
        competition:
          key === "resultCount"
            ? Math.min(
                100,
                Math.round(Math.log10(Math.max(1, d.resultCount)) * 20),
              )
            : current.competition,
        commercialFit: Math.round(
          d.commercialIntent * 0.5 + d.portfolioFit * 0.3 + d.seasonalFit * 0.2,
        ),
      };
    });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!input.topic.trim() || !input.market.trim()) {
      setError("Enter a keyword and target region.");
      return;
    }
    const result = await run(
      () => desktop.saveOpportunity(input),
      "Opportunity saved.",
    );
    if (result.ok) onClose();
  }
  return (
    <Modal
      open
      variant="plain"
      onClose={busy ? () => {} : onClose}
      title={existing ? "Edit opportunity" : "Add an opportunity manually"}
      description="Use measured or personally verified inputs when you already know the topic."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="opportunity-form"
            disabled={busy || !input.topic.trim() || !input.market.trim()}
          >
            {busy ? "Saving…" : "Save opportunity"}
          </Button>
        </>
      }
    >
      <form id="opportunity-form" className="form-grid" onSubmit={submit}>
        <Field label="Keyword">
          <input
            autoFocus
            required
            maxLength={200}
            value={input.topic}
            onChange={(e) =>
              setInput((current) => ({ ...current, topic: e.target.value }))
            }
          />
        </Field>
        <Field label="Target region">
          <input
            required
            maxLength={200}
            value={input.market}
            onChange={(e) =>
              setInput((current) => ({ ...current, market: e.target.value }))
            }
          />
        </Field>
        <Field label="Topic behavior">
          <select
            value={details.behavior}
            onChange={(e) =>
              signal("behavior", e.target.value as typeof details.behavior)
            }
          >
            <option value="evergreen">Evergreen</option>
            <option value="seasonal">Seasonal</option>
            <option value="trending">Trending</option>
          </select>
        </Field>
        <Field label="Adobe result count" hint="Available supply, not demand">
          <input
            type="number"
            required
            min={0}
            max={1000000000000}
            value={details.resultCount}
            onChange={(e) =>
              signal("resultCount", Math.max(0, Number(e.target.value)))
            }
          />
        </Field>
        {(
          [
            ["trendGrowth", "Trend growth"],
            ["commercialIntent", "Commercial intent"],
            ["seasonalFit", "Seasonal fit"],
            ["portfolioFit", "Personal portfolio fit"],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={`${label}: ${details[key]}`}>
            <input
              type="range"
              min={0}
              max={100}
              value={details[key]}
              style={
                { "--range-fill": `${details[key]}%` } as React.CSSProperties
              }
              onChange={(e) => signal(key, Number(e.target.value))}
            />
          </Field>
        ))}
        <div className="score-explanation full">
          <div>
            <div className="score-heading">
              <strong>Opportunity score</strong>
              <output className="score" aria-live="polite">
                {score(input.demand, input.competition, input.commercialFit)}
                <small>/100</small>
              </output>
            </div>
            <p>
              Planning estimate: 35% trend growth + 25% lower supply + 40%
              weighted commercial, portfolio, and seasonal fit. Verify estimates
              with your own sources.
            </p>
          </div>
        </div>
        <details className="full additional-context">
          <summary>Buyer and research notes</summary>
          <Field label="Target buyer">
            <input
              required
              maxLength={200}
              value={input.buyer}
              onChange={(e) =>
                setInput((current) => ({ ...current, buyer: e.target.value }))
              }
            />
          </Field>
          <Field label="Research notes">
            <textarea
              rows={3}
              maxLength={10000}
              value={input.notes}
              onChange={(e) =>
                setInput((current) => ({ ...current, notes: e.target.value }))
              }
            />
          </Field>
        </details>
        {error && (
          <p className="inline-error full" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
function CsvImport({ onClose }: { onClose: () => void }) {
  const { run, busy } = useActions();
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState<OpportunityInput[]>([]);
  return (
    <Modal
      open
      onClose={onClose}
      wide
      title="Import researched topics from CSV"
      description="Validate all rows before an atomic import. Maximum 1,000 rows and 2 MB."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>

          <Button
            variant="secondary"
            disabled={busy || !content.trim()}
            onClick={async () => {
              const result = await run(
                () => desktop.previewCsv(content),
                "CSV validation passed.",
              );
              if (result.ok) setPreview(result.value);
            }}
          >
            Validate CSV
          </Button>

          <Button
            variant="primary"
            disabled={busy || !preview.length}
            onClick={async () => {
              const result = await run(
                () => desktop.importOpportunities(preview),
                `${preview.length} opportunities imported.`,
              );
              if (result.ok) onClose();
            }}
          >
            Import {preview.length} topics
          </Button>
        </>
      }
    >
      <div className="info-block import-help">
        <div>
          <strong>Research estimates remain estimates</strong>
          <p>
            Competition is an available-supply estimate, not a sales claim.
            Signals must be numbers from 0–100.
          </p>
        </div>
      </div>
      <div className="form-grid csv-input-grid">
        <Field
          label="Upload research CSV"
          hint="UTF-8 CSV; quoted commas and multiline notes are supported."
        >
          <div className="csv-file-picker">
            <Button
              disabled={busy}
              onClick={async () => {
                const result = await run(() => desktop.pickOpportunityCsv());
                if (result.ok && result.value !== null) {
                  setContent(result.value);
                  setPreview([]);
                }
              }}
            >
              Choose CSV file
            </Button>
            <span className="muted small">
              {content ? "CSV loaded for validation" : "No file chosen"}
            </span>
          </div>
        </Field>
        <Field
          label="Or paste research CSV"
          hint="Required headers: topic,buyer,market,demand,competition,commercialFit,notes"
        >
          <textarea
            rows={4}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setPreview([]);
            }}
            placeholder={
              "topic,buyer,market,demand,competition,commercialFit,notes\nUrban travel,Travel publisher,Global,80,40,85,Research notes"
            }
          />
        </Field>
      </div>
      {preview.length > 0 && (
        <div className="import-preview">
          <h3>{preview.length} valid rows</h3>
          {preview.slice(0, 10).map((row, index) => (
            <div key={index}>
              <span>
                {index + 1}. {row.topic}
              </span>
              <small>
                {row.buyer} · {row.market}
              </small>
            </div>
          ))}
          {preview.length > 10 && (
            <p>
              First 10 rows shown. All {preview.length} rows will be imported.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

export function Briefs({
  data,
  params,
  selected,
  onSelect,
}: {
  data: Snapshot;
  params: URLSearchParams;
  selected: Set<string>;
  onSelect: (ids: string[], checked: boolean) => void;
}) {
  const existing = data.briefs.find((b) => b.id === params.get("id"));
  const opportunity = data.opportunities.find(
    (o) => o.id === params.get("opportunity"),
  );
  const [csv, setCsv] = useState(false);
  const [choice, setChoice] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Commercial briefs</h1>
          <p>
            Give each image a buyer, a purpose, and a clear visual direction.
          </p>
        </div>
        <div className="heading-actions">
          <Button onClick={() => setCsv(true)}>
            <FileCsvIcon size={18} />
            Import CSV
          </Button>
          <Button variant="primary" onClick={() => setChoice(true)}>
            <PlusIcon size={18} />
            Add brief
          </Button>
        </div>
      </div>
      <Table
        filterTitle="Filter commercial briefs"
        rows={data.briefs}
        structuredFilters={[
          {
            label: "Orientation",
            presentation: "chips",
            options: ["Horizontal", "Square", "Vertical", "Unspecified"],
            value: (b) => b.details?.orientation ?? "Unspecified",
          },
          {
            label: "Source",
            presentation: "chips",
            options: ["From opportunity", "Manual"],
            value: (b) => (b.opportunityId ? "From opportunity" : "Manual"),
          },
          {
            label: "Source opportunity",
            options: data.opportunities.map((o) => o.topic),
            value: (b) =>
              data.opportunities.find((o) => o.id === b.opportunityId)?.topic ??
              "",
          },

          {
            label: "Market",
            options: [...new Set(data.briefs.map((b) => b.market))],
            value: (b) => b.market,
          },
          {
            label: "Buyer",
            options: [...new Set(data.briefs.map((b) => b.buyer))],
            value: (b) => b.buyer,
          },
        ]}
        selected={selected}
        onSelect={onSelect}
        searchText={(b) => `${b.title} ${b.buyer} ${b.market} ${b.prompt}`}
        placeholder="Search briefs, buyers, or prompts…"
        empty={{
          title: "Give your next image a purpose",
          description:
            "Create a brief manually or start from a saved opportunity.",
          action: (
            <Button variant="primary" onClick={() => setChoice(true)}>
              <PlusIcon size={16} />
              Create your first brief
            </Button>
          ),
        }}
        columns={[
          {
            label: "Brief",
            sortValue: (b) => b.title,
            render: (b) => (
              <button
                className="record-link"
                onClick={() => navigate("briefs", { id: b.id })}
              >
                {b.title}
                <small>{b.market}</small>
              </button>
            ),
          },
          {
            label: "Buyer / usage",
            sortValue: (b) => `${b.buyer} ${b.usage}`,
            render: (b) => (
              <>
                {b.buyer}
                <small className="cell-subtext">{b.usage}</small>
              </>
            ),
          },
          {
            label: "Prompt",
            sortValue: (b) => b.prompt,
            className: "prompt-cell",
            render: (b) => <span title={b.prompt}>{b.prompt}</span>,
          },
          {
            label: "Images",
            sortValue: (b) =>
              data.assets.filter((a) => a.briefId === b.id).length,
            render: (b) => data.assets.filter((a) => a.briefId === b.id).length,
          },
          {
            label: "Created",
            sortValue: (b) => b.createdAt,
            render: (b) => date(b.createdAt),
          },
          {
            label: "Actions",
            render: (b) => (
              <Button
                variant="ghost"
                onClick={() => navigate("briefs", { id: b.id })}
              >
                Open
                <ArrowRightIcon size={16} />
              </Button>
            ),
          },
        ]}
      />
      {selected.size > 0 && (
        <BulkActions
          count={selected.size}
          noun="brief"
          onClear={() => onSelect([...selected], false)}
        >
          <Button
            variant="primary"
            onClick={() => navigate("generation", { bulk: "1" })}
          >
            Generate selected
            <ArrowRightIcon size={16} />
          </Button>
        </BulkActions>
      )}
      {choice && (
        <AddMethod
          kind="brief"
          onClose={() => setChoice(false)}
          onChoose={(ai) => {
            setChoice(false);
            navigate("briefs", ai ? { ai: "1" } : { new: "1" });
          }}
        />
      )}
      {csv && <BriefCsvImport onClose={() => setCsv(false)} />}
      {params.has("ai") && (
        <TextJobModal
          data={data}
          kind="briefs"
          opportunity={opportunity}
          onClose={() => navigate("briefs")}
        />
      )}
      {(params.has("new") || existing) && (
        <BriefForm
          key={existing?.id ?? opportunity?.id ?? "new"}
          existing={existing}
          opportunity={opportunity}
          opportunities={data.opportunities}
          onClose={() => navigate("briefs")}
        />
      )}
    </>
  );
}
function BriefForm({
  existing,
  opportunity,
  opportunities,
  onClose,
}: {
  existing?: Brief;
  opportunity?: Opportunity;
  opportunities: Opportunity[];
  onClose: () => void;
}) {
  const { run, busy } = useActions();
  const [tab, setTab] = useState("direction");
  const [error, setError] = useState("");
  const [input, setInput] = useState<BriefInput>(
    existing
      ? { ...existing }
      : {
          id: null,
          opportunityId: opportunity?.id ?? null,
          title: "",
          buyer: opportunity?.buyer ?? "Commercial marketing teams",
          usage: "Website, social campaign, and presentation",
          market: opportunity?.market ?? "Indonesia",
          scene: "",
          visualDirection: "",
          prompt: "",
          negativePrompt: "",
          metadataPlan: "",
        },
  );
  const [details, setDetails] = useState<NonNullable<BriefInput["details"]>>(
    existing?.details ?? {
      supportingSubjects: "",
      environment: "Contemporary everyday setting",
      visualStyle: existing?.visualDirection ?? "",
      orientation: "Horizontal",
      copySpace: "",
      composition: "",
      lighting: "",
      adobeTitle: "",
      keywords: [],
      category: 0,
    },
  );
  const [plannedKeywords, setPlannedKeywords] = useState(
    (existing?.details?.keywords ?? []).join(", "),
  );
  function change(key: keyof BriefInput, value: string | null) {
    setInput((current) => ({ ...current, [key]: value }));
  }
  function detail<K extends keyof typeof details>(
    key: K,
    value: (typeof details)[K],
  ) {
    setDetails((current) => ({ ...current, [key]: value }));
  }
  const directionFields = [
    ["buyer", "Target buyer", true],
    ["usage", "Intended commercial usage", true],
    ["market", "Target market", false],
    ["scene", "Main subject", true],
  ] as const;
  async function submit(event: FormEvent, useGeneration = false) {
    event.preventDefault();
    if (
      [input.title, input.buyer, input.usage, input.market, input.scene].some(
        (value) => value.trim().length < 2,
      )
    ) {
      setTab("direction");
      setError(
        "Complete the brief name, buyer, usage, market, and main subject (at least 2 characters). ",
      );
      return;
    }
    const visualDirection = [
      details.visualStyle,
      details.environment,
      details.composition,
      details.lighting,
      details.copySpace && `Copy space: ${details.copySpace}`,
      `Orientation: ${details.orientation}`,
    ]
      .filter(Boolean)
      .join(". ");
    const prompt =
      input.prompt.trim() ||
      `Create a commercially useful image of ${input.scene}. ${details.supportingSubjects ? `Supporting subjects: ${details.supportingSubjects}.` : ""} ${visualDirection}. Intended usage: ${input.usage}. No visible text or brand logos.`;
    const result = await run(
      () =>
        desktop.saveBrief({
          ...input,
          details: {
            ...details,
            keywords: plannedKeywords
              .split(",")
              .map((word) => word.trim())
              .filter(Boolean),
          },
          visualDirection,
          prompt,
        }),
      "Brief saved.",
    );
    if (result.ok) {
      if (useGeneration) navigate("generation", { brief: result.value.id });
      else onClose();
    }
  }
  return (
    <Modal
      open
      wide
      onClose={busy ? () => {} : onClose}
      title={existing ? existing.title : "Add a commercial brief manually"}
      description={
        existing
          ? "Inspect the commercial direction and prompt together. Changes are saved to the workspace."
          : "Enter the commercial direction yourself. If the prompt is blank, Thoock creates a deterministic starter prompt that you can edit."
      }
      eyebrow={
        existing ? (
          <>
            <Badge tone="approved">Ready</Badge>
            <span className="muted small">
              {opportunities.find((o) => o.id === input.opportunityId)?.topic ??
                "Independent brief"}
            </span>
          </>
        ) : undefined
      }
      tabs={
        <ModalTabs
          label="Brief sections"
          value={tab}
          onChange={setTab}
          items={[
            { value: "direction", label: "Commercial direction" },
            { value: "prompt", label: "Prompt" },
            { value: "metadata", label: "Adobe metadata" },
          ]}
        />
      }
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={existing ? "secondary" : "primary"}
            type="submit"
            form="brief-form"
            disabled={busy || !input.title.trim() || !input.scene.trim()}
          >
            <PencilSimpleIcon size={16} />
            {busy ? "Saving…" : existing ? "Save changes" : "Save manual brief"}
          </Button>
          {existing && (
            <Button
              variant="primary"
              disabled={busy}
              onClick={(event) => void submit(event, true)}
            >
              Use in generation
              <ArrowRightIcon size={16} />
            </Button>
          )}
        </>
      }
    >
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <form id="brief-form" className="form-grid" onSubmit={submit} noValidate>
        {tab === "direction" && (
          <>
            <Field label="Source opportunity" hint="Optional">
              <select
                value={input.opportunityId ?? ""}
                onChange={(e) =>
                  change("opportunityId", e.target.value || null)
                }
              >
                <option value="">No source opportunity</option>
                {opportunities.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.topic}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Brief name" hint="Required · 2 characters minimum">
              <input
                required
                minLength={2}
                maxLength={200}
                value={input.title}
                onChange={(e) => change("title", e.target.value)}
              />
            </Field>
            {directionFields.map(([key, label, multiline]) => (
              <Field
                key={key}
                label={label}
                hint={
                  key === "scene"
                    ? "Required · 2 characters minimum"
                    : undefined
                }
              >
                {multiline ? (
                  <textarea
                    rows={3}
                    required
                    maxLength={
                      key === "scene" ? 5000 : key === "usage" ? 500 : 200
                    }
                    value={input[key]}
                    onChange={(e) => change(key, e.target.value)}
                  />
                ) : (
                  <input
                    required
                    maxLength={200}
                    value={input[key]}
                    onChange={(e) => change(key, e.target.value)}
                  />
                )}
              </Field>
            ))}
            <Field
              label="Supporting subjects"
              hint="Separate items with commas"
            >
              <textarea
                rows={3}
                maxLength={5000}
                value={details.supportingSubjects}
                onChange={(e) => detail("supportingSubjects", e.target.value)}
              />
            </Field>
            <Field label="Environment">
              <input
                maxLength={5000}
                value={details.environment}
                onChange={(e) => detail("environment", e.target.value)}
              />
            </Field>
            <Field label="Visual style">
              <input
                maxLength={5000}
                value={details.visualStyle}
                onChange={(e) => detail("visualStyle", e.target.value)}
              />
            </Field>
            <Field label="Orientation">
              <select
                value={details.orientation}
                onChange={(e) =>
                  detail(
                    "orientation",
                    e.target.value as typeof details.orientation,
                  )
                }
              >
                <option>Horizontal</option>
                <option>Vertical</option>
                <option>Square</option>
              </select>
            </Field>
            {(
              [
                ["copySpace", "Copy-space location"],
                ["composition", "Composition"],
                ["lighting", "Lighting"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  maxLength={5000}
                  value={details[key]}
                  onChange={(e) => detail(key, e.target.value)}
                />
              </Field>
            ))}
          </>
        )}
        {tab === "prompt" && (
          <>
            <Field
              label="Generation prompt"
              className="full"
              hint="Leave blank to create a starter prompt from the commercial direction."
            >
              <textarea
                rows={8}
                maxLength={12000}
                value={input.prompt}
                onChange={(e) => change("prompt", e.target.value)}
              />
            </Field>
            <Field label="Negative prompt" className="full">
              <textarea
                rows={3}
                maxLength={5000}
                value={input.negativePrompt}
                onChange={(e) => change("negativePrompt", e.target.value)}
              />
            </Field>
          </>
        )}
        {tab === "metadata" && (
          <>
            <Field label="Adobe title" className="full">
              <input
                maxLength={70}
                value={details.adobeTitle}
                onChange={(e) => detail("adobeTitle", e.target.value)}
              />
            </Field>
            <Field
              label="Keywords"
              className="full"
              hint="Separate with commas; order by relevance."
            >
              <textarea
                rows={4}
                value={plannedKeywords}
                onChange={(e) => setPlannedKeywords(e.target.value)}
              />
            </Field>
            <Field label="Adobe category">
              <select
                value={details.category}
                onChange={(e) => detail("category", Number(e.target.value))}
              >
                <option value={0}>Not planned</option>
                {adobeCategories.map((name, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1}. {name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Adobe metadata plan" className="full">
              <textarea
                rows={4}
                maxLength={5000}
                value={input.metadataPlan}
                onChange={(e) => change("metadataPlan", e.target.value)}
              />
            </Field>
          </>
        )}
      </form>
    </Modal>
  );
}
function BriefCsvImport({ onClose }: { onClose: () => void }) {
  const { run, busy } = useActions();
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState<BriefInput[]>([]);
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Import commercial briefs from CSV"
      description="Validate rows and opportunity references before an atomic import."
      footer={
        <>
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>

          <Button
            variant="secondary"
            disabled={busy || !content.trim()}
            onClick={async () => {
              const result = await run(
                () => desktop.previewBriefCsv(content),
                "Brief CSV validation passed.",
              );
              if (result.ok) setPreview(result.value);
            }}
          >
            Validate CSV
          </Button>

          <Button
            variant="primary"
            disabled={busy || !preview.length}
            onClick={async () => {
              const result = await run(
                () => desktop.importBriefs(preview),
                `${preview.length} briefs imported.`,
              );
              if (result.ok) onClose();
            }}
          >
            Import {preview.length} briefs
          </Button>
        </>
      }
    >
      <div className="info-block import-help">
        <div>
          <strong>Keep opportunity references connected</strong>
          <p>
            Import opportunities first, then validate the connected brief CSV.
            Every row must pass before anything is saved.
          </p>
        </div>
      </div>
      <div className="form-grid csv-input-grid">
        <Field
          label="Upload brief CSV"
          hint="UTF-8 CSV; quoted commas and multiline notes are supported."
        >
          <div className="csv-file-picker">
            <Button
              disabled={busy}
              onClick={async () => {
                const result = await run(() => desktop.pickBriefCsv());
                if (result.ok && result.value !== null) {
                  setContent(result.value);
                  setPreview([]);
                }
              }}
            >
              Choose CSV file
            </Button>
            <span className="muted small">
              {content ? "CSV loaded for validation" : "No file chosen"}
            </span>
          </div>
        </Field>
        <Field
          label="Or paste brief CSV"
          hint="Headers: opportunityId,title,buyer,usage,market,scene,visualDirection,prompt,negativePrompt,metadataPlan"
        >
          <textarea
            rows={4}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setPreview([]);
            }}
          />
        </Field>
      </div>
      {preview.length > 0 && (
        <div className="import-preview">
          <h3>{preview.length} valid briefs</h3>
          {preview.slice(0, 10).map((row, i) => (
            <div key={i}>
              <strong>{row.title}</strong>
              <small>
                {row.buyer} · {row.usage}
              </small>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function AddMethod({
  kind,
  onClose,
  onChoose,
}: {
  kind: "opportunity" | "brief";
  onClose: () => void;
  onChoose: (ai: boolean) => void;
}) {
  const brief = kind === "brief";
  return (
    <Modal
      variant="plain"
      open
      onClose={onClose}
      size="medium"
      title={brief ? "Add commercial briefs" : "Add an opportunity"}
      description={
        brief
          ? "Start one brief manually or create a distinct batch from a saved opportunity."
          : "Record a topic yourself or research commercially useful topics with AI."
      }
    >
      <div className="method-grid">
        <button className="method-card" onClick={() => onChoose(false)}>
          <span className="metric-icon">
            <PencilSimpleIcon size={23} />
          </span>
          <strong>Add manually</strong>
          <p>
            {brief
              ? "Enter the buyer, visual direction, metadata plan, and prompt yourself."
              : "Use measured or personally verified inputs when you already know the topic."}
          </p>
        </button>
        <button className="method-card" onClick={() => onChoose(true)}>
          <span className="metric-icon">
            <SparkleIcon size={23} />
          </span>
          <strong>{brief ? "Create with AI" : "Research with AI"}</strong>
          <p>
            {brief
              ? "Select a researched opportunity and generate commercially distinct briefs."
              : "Choose a provider and generate topics for your target buyers and market."}
          </p>
        </button>
      </div>
    </Modal>
  );
}
