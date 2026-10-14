import { BulkActions } from "../components/bulk-actions";
import {
  ArrowRightIcon,
  CheckIcon,
  ShieldCheckIcon,
  XCircleIcon,
  DownloadSimpleIcon,
  ImageIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  SparkleIcon,
  XIcon,
  CheckCircleIcon,
  FileImageIcon,
  FileTextIcon,
  ArrowsOutSimpleIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adobeCategories as categories } from "../lib/categories";
import { TextJobModal } from "./text-jobs";
import { DatePicker } from "../components/date-picker";
import { navigate } from "../app/router";
import {
  Badge,
  ActiveFilters,
  Button,
  Confirm,
  Empty,
  Field,
  Modal,
  ModalTabs,
  useActions,
} from "../components/ui";
import { Table, localDateKey } from "../components/table";
import { desktop, localImage } from "../lib/desktop";
import { bytes, date, megapixels } from "../lib/format";
import {
  checklistReady,
  type Asset,
  type ReviewInput,
  type Snapshot,
} from "../lib/types";

function metadataReady(asset: Asset) {
  const words = asset.keywords.map((word) => word.trim().toLowerCase());
  return (
    asset.title.trim().length > 0 &&
    [...asset.title].length <= 70 &&
    /^[\p{L}\p{N}\s]+$/u.test(asset.title) &&
    words.length >= 5 &&
    words.length <= 49 &&
    new Set(words).size === words.length &&
    words.every(
      (word) =>
        word.length > 0 && [...word].length <= 100 && !word.includes(","),
    ) &&
    asset.category >= 1 &&
    asset.category <= 21
  );
}

export function Review({
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
  const { run, busy } = useActions();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const [briefId, setBriefId] = useState("");
  const [metadata, setMetadata] = useState("");
  const [technical, setTechnical] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const jobs = new Map(data.jobs.map((job) => [job.id, job]));
  const [visible, setVisible] = useState(30);
  const [filters, setFilters] = useState(false);
  const [filterDraft, setFilterDraft] = useState({
    status: "",
    provider: "",
    briefId: "",
    metadata: "",
    technical: "",
    from: "",
    to: "",
  });
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(
    null,
  );
  const filtered = data.assets.filter(
    (a) =>
      `${a.name} ${a.title} ${a.keywords.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!status || a.decision === status) &&
      (!provider ||
        (a.sourceJobId ? jobs.get(a.sourceJobId)?.provider : "import") ===
          provider) &&
      (!briefId ||
        (briefId === "independent" ? !a.briefId : a.briefId === briefId)) &&
      (!metadata || (metadataReady(a) ? "started" : "missing") === metadata) &&
      (!technical ||
        (a.width * a.height >= 4_000_000 && a.width * a.height <= 100_000_000
          ? "ready"
          : "small") === technical) &&
      (!from || localDateKey(a.createdAt) >= from) &&
      (!to || localDateKey(a.createdAt) <= to),
  );
  const asset = data.assets.find((a) => a.id === params.get("asset"));
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Review queue</h1>
          <p>
            Inspect image quality, complete human checks, and prepare metadata.
          </p>
        </div>
        <Button
          onClick={() =>
            run(
              () => desktop.importImages(),
              (n) => (n ? `${n} images imported.` : null),
            )
          }
          disabled={busy}
        >
          <PlusIcon size={18} />
          Import images
        </Button>
      </div>
      <div className="review-toolbar">
        <div className="review-tools">
          <div className="search-input">
            <MagnifyingGlassIcon size={18} />
            <input
              aria-label="Search images"
              placeholder="Search images or metadata…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisible(30);
              }}
            />
          </div>
          <Button
            aria-haspopup="dialog"
            onClick={() => {
              setFilterDraft({
                status,
                provider,
                briefId,
                metadata,
                technical,
                from,
                to,
              });
              setFilters(true);
            }}
            aria-expanded={filters}
          >
            <SlidersHorizontalIcon size={18} />
            Filters
          </Button>
          <Badge>{filtered.length} images</Badge>
          <Button
            variant="ghost"
            disabled={!filtered.length}
            onClick={() =>
              onSelect(
                filtered.slice(0, visible).map((a) => a.id),
                true,
              )
            }
          >
            Select visible
          </Button>
        </div>
        <ActiveFilters
          items={[
            ...(
              [
                ["Decision", status, setStatus],
                ["Provider", provider, setProvider],
                [
                  "Brief",
                  briefId &&
                    (data.briefs.find((b) => b.id === briefId)?.title ??
                      "Independent images"),
                  setBriefId,
                ],
                ["Metadata", metadata, setMetadata],
                ["Resolution", technical, setTechnical],
                ["From", from, setFrom],
                ["Through", to, setTo],
              ] as const
            )
              .filter(([, value]) => value)
              .map(([label, value, setter]) => ({
                label: `${label}: ${value}`,
                onRemove: () => {
                  setter("");
                  setVisible(30);
                },
              })),
          ]}
          onClear={() => {
            setStatus("");
            setProvider("");
            setBriefId("");
            setMetadata("");
            setTechnical("");
            setFrom("");
            setTo("");
            setVisible(30);
          }}
        />
      </div>
      <Modal
        open={filters}
        onClose={() => setFilters(false)}
        title="Filter review queue"
        description="Choose the images to show in the review queue."
        size="filter"
        variant="filter"
        footer={
          <>
            <Button
              variant="danger"
              onClick={() =>
                setFilterDraft({
                  status: "",
                  provider: "",
                  briefId: "",
                  metadata: "",
                  technical: "",
                  from: "",
                  to: "",
                })
              }
            >
              Clear all
            </Button>
            <span className="footer-spacer" />
            <Button onClick={() => setFilters(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                setStatus(filterDraft.status);
                setProvider(filterDraft.provider);
                setBriefId(filterDraft.briefId);
                setMetadata(filterDraft.metadata);
                setTechnical(filterDraft.technical);
                setFrom(filterDraft.from);
                setTo(filterDraft.to);
                setFilters(false);
              }}
            >
              Apply filters
            </Button>
          </>
        }
      >
        <div className="filter-fields">
          <Field label="Review status">
            <div className="filter-chips">
              {[
                ["", "Any"],
                ["pending", "Unreviewed"],
                ["approved", "Approved"],
                ["rejected", "Rejected"],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  aria-pressed={filterDraft.status === value}
                  onClick={() =>
                    setFilterDraft((current) => ({ ...current, status: value }))
                  }
                >
                  {label}
                </Button>
              ))}
            </div>
          </Field>
          <Field label="Provider">
            <select
              value={filterDraft.provider}
              onChange={(e) => {
                setFilterDraft((current) => ({
                  ...current,
                  provider: e.target.value,
                }));
              }}
            >
              <option value="">All providers</option>
              {[
                ...new Set(["import", ...data.jobs.map((j) => j.provider)]),
              ].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Brief">
            <select
              value={filterDraft.briefId}
              onChange={(e) => {
                setFilterDraft((current) => ({
                  ...current,
                  briefId: e.target.value,
                }));
              }}
            >
              <option value="">All briefs</option>
              <option value="independent">Independent images</option>
              {data.briefs.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Metadata">
            <div className="filter-chips">
              {[
                ["", "Any"],
                ["started", "Complete"],
                ["missing", "Incomplete"],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  aria-pressed={filterDraft.metadata === value}
                  onClick={() =>
                    setFilterDraft((current) => ({
                      ...current,
                      metadata: value,
                    }))
                  }
                >
                  {label}
                </Button>
              ))}
            </div>
          </Field>
          <Field label="Technical status">
            <div className="filter-chips">
              {[
                ["", "Any"],
                ["ready", "Meets 4MP"],
                ["small", "Below 4MP"],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  aria-pressed={filterDraft.technical === value}
                  onClick={() =>
                    setFilterDraft((current) => ({
                      ...current,
                      technical: value,
                    }))
                  }
                >
                  {label}
                </Button>
              ))}
            </div>
          </Field>
          <Field label="From">
            <DatePicker
              label="From"
              value={filterDraft.from}
              max={filterDraft.to || undefined}
              onChange={(value) => {
                setFilterDraft((current) => ({
                  ...current,
                  from: value,
                }));
              }}
            />
          </Field>
          <Field label="To">
            <DatePicker
              label="To"
              value={filterDraft.to}
              min={filterDraft.from || undefined}
              onChange={(value) => {
                setFilterDraft((current) => ({
                  ...current,
                  to: value,
                }));
              }}
            />
          </Field>
        </div>
      </Modal>
      {filtered.length ? (
        <>
          <div className="asset-grid review-grid">
            {filtered.slice(0, visible).map((a) => (
              <article
                className={`asset-card ${selected.has(a.id) ? "is-selected" : ""}`}
                key={a.id}
              >
                <div className="asset-image">
                  <button
                    aria-label={`Review ${a.name}`}
                    onClick={() => navigate("review", { asset: a.id })}
                  >
                    <img
                      loading="lazy"
                      decoding="async"
                      src={localImage(a.thumbnail)}
                      alt={a.title || a.name}
                    />
                  </button>
                  <Button
                    className="image-expand"
                    aria-label={`Open ${a.name}`}
                    onClick={() => navigate("review", { asset: a.id })}
                  >
                    <ArrowsOutSimpleIcon size={16} />
                  </Button>
                  <label className="image-select-tile">
                    <input
                      className="image-checkbox"
                      type="checkbox"
                      checked={selected.has(a.id)}
                      aria-label={`Select ${a.name}`}
                      onChange={(e) => onSelect([a.id], e.target.checked)}
                    />
                  </label>
                </div>
                <div className="asset-info">
                  <div className="asset-title">
                    <button
                      className="record-link"
                      onClick={() => navigate("review", { asset: a.id })}
                    >
                      {a.title || a.name}
                    </button>
                    <Badge tone={a.decision}>{a.decision}</Badge>
                  </div>
                  <div>
                    <small>
                      {a.width} × {a.height} · {megapixels(a.width, a.height)}
                    </small>
                  </div>
                  <div className="readiness-icons">
                    <span
                      className={`readiness-icon ${a.width * a.height >= 4_000_000 && a.width * a.height <= 100_000_000 ? "ready" : "warning"}`}
                      role="img"
                      aria-label={
                        a.width * a.height >= 4_000_000 &&
                        a.width * a.height <= 100_000_000
                          ? "Resolution ready"
                          : "Resolution needs attention"
                      }
                      title="Technical resolution"
                    >
                      <CheckCircleIcon size={15} />
                    </span>
                    <span
                      className={`readiness-icon ${checklistReady(a.checklist) ? "ready" : "neutral"}`}
                      role="img"
                      aria-label={
                        checklistReady(a.checklist)
                          ? "Human review complete"
                          : "Human review needed"
                      }
                      title="Human review"
                    >
                      <FileImageIcon size={15} />
                    </span>
                    <span
                      className={`readiness-icon ${metadataReady(a) ? "ready" : "warning"}`}
                      role="img"
                      aria-label={
                        metadataReady(a) ? "Metadata ready" : "Metadata needed"
                      }
                      title="Adobe metadata"
                    >
                      <FileTextIcon size={15} />
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {visible < filtered.length && (
            <div className="load-more">
              <Button onClick={() => setVisible((n) => n + 30)}>
                Load 30 more
              </Button>
              <small>
                {Math.min(visible, filtered.length)} of {filtered.length} loaded
              </small>
            </div>
          )}
        </>
      ) : (
        <section className="panel">
          <Empty
            icon={<ImageIcon size={32} />}
            title={
              data.assets.length
                ? "No images match these filters"
                : "Make room for your next image"
            }
            description={
              data.assets.length
                ? "Try another search or decision filter."
                : "Import candidates to inspect their quality and prepare them for delivery."
            }
            action={
              <Button variant="primary" onClick={() => navigate("generation")}>
                Import your first images
                <ArrowRightIcon size={16} />
              </Button>
            }
          />
        </section>
      )}
      {selected.size > 0 && (
        <BulkActions
          count={selected.size}
          onClear={() => onSelect([...selected], false)}
        >
          <Button variant="primary" onClick={() => setDecision("approved")}>
            <ShieldCheckIcon size={20} />
            Approve selected
          </Button>
          <Button
            className="metadata-action"
            disabled={selected.size > 50}
            onClick={() => setMetadataOpen(true)}
          >
            <SparkleIcon size={20} />
            Generate AI metadata
          </Button>
          <Button variant="danger" onClick={() => setDecision("rejected")}>
            <XCircleIcon size={20} />
            Reject selected
          </Button>
        </BulkActions>
      )}
      {asset && (
        <ReviewDetail
          key={asset.id}
          asset={asset}
          data={data}
          onClose={() => navigate("review")}
        />
      )}
      {metadataOpen && (
        <TextJobModal
          data={data}
          kind="metadata"
          assetIds={[...selected]}
          onClose={() => setMetadataOpen(false)}
        />
      )}
      <Confirm
        open={!!decision}
        onClose={() => setDecision(null)}
        title={`${decision === "approved" ? "Approve" : "Reject"} ${selected.size} images?`}
        description={
          decision === "approved"
            ? "Every selected image must already have complete human checks, valid metadata, and at least 4 megapixels."
            : "This changes the review decision and keeps each original image."
        }
        busy={busy}
        danger={decision === "rejected"}
        label={decision === "approved" ? "Approve selected" : "Reject selected"}
        onConfirm={async () => {
          if (!decision) return;
          const result = await run(
            () => desktop.bulkReview([...selected], decision),
            `${selected.size} images ${decision}.`,
          );
          if (result.ok) {
            onSelect([...selected], false);
            setDecision(null);
          }
        }}
      />
    </>
  );
}
function ReviewDetail({
  asset,
  data,
  onClose,
}: {
  asset: Asset;
  data: Snapshot;
  onClose: () => void;
}) {
  const { run, busy } = useActions();
  const [tab, setTab] = useState("quality");
  const [input, setInput] = useState<ReviewInput>({
    id: asset.id,
    title: asset.title,
    keywords: asset.keywords,
    category: asset.category,
    decision: asset.decision,
    checklist: {
      ...asset.checklist,
      referenceChecks: asset.checklist.referenceChecks ?? {
        logo: false,
        text: false,
        anatomy: false,
        truthfulness: false,
        famous: false,
        copyright: false,
        composition: false,
        consistency: false,
        distinctiveness: false,
      },
    },
    notes: asset.notes,
  });
  const [keywords, setKeywords] = useState(asset.keywords.join(", "));
  const [confirm, setConfirm] = useState<"approved" | "rejected" | null>(null);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const [repairMode, setRepairMode] = useState("fast");
  const [showOriginal, setShowOriginal] = useState(false);
  const original = useQuery({
    queryKey: ["original-preview", asset.id],
    queryFn: () => desktop.originalPreview(asset.id),
    enabled: showOriginal,
    staleTime: Infinity,
  });
  const source = data.jobs.find((j) => j.id === asset.sourceJobId);
  const [historyOpen, setHistoryOpen] = useState(false);
  const history = useQuery({
    queryKey: ["review-history", asset.id],
    queryFn: () => desktop.reviewHistory(asset.id),
    enabled: historyOpen,
  });
  const canRepair =
    source?.provider === "snapgen" &&
    source.model.startsWith("nano-banana") &&
    source.resultIds.length === 1 &&
    source.outputCount === 1;
  const draftKeywords = keywords
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean);
  const canApprove =
    !asset.isMock &&
    asset.width * asset.height >= 4_000_000 &&
    asset.width * asset.height <= 100_000_000 &&
    checklistReady(input.checklist) &&
    input.title.trim().length > 0 &&
    [...input.title].length <= 70 &&
    /^[\p{L}\p{N}\s]+$/u.test(input.title) &&
    draftKeywords.length >= 5 &&
    draftKeywords.length <= 49 &&
    new Set(draftKeywords.map((word) => word.toLowerCase())).size ===
      draftKeywords.length &&
    draftKeywords.every((word) => [...word].length <= 100) &&
    input.category >= 1 &&
    input.category <= 21 &&
    !data.preferences.prohibitedTerms.some(
      (term) =>
        term.trim() &&
        `${input.title} ${draftKeywords.join(" ")}`
          .toLowerCase()
          .includes(term.toLowerCase()),
    );
  async function save(decision: ReviewInput["decision"]) {
    const result = await run(
      () =>
        desktop.saveReview({
          ...input,
          decision,
          keywords: keywords
            .split(",")
            .map((w) => w.trim())
            .filter(Boolean),
        }),
      decision === "pending" ? "Review draft saved." : `Image ${decision}.`,
    );
    if (result.ok) {
      setConfirm(null);
      onClose();
    }
  }
  return (
    <>
      <Modal
        open
        size="review"
        onClose={busy ? () => {} : onClose}
        title={asset.name}
        description={`Actual file: ${asset.width} × ${asset.height}. Automated checks remain advisory.`}
        eyebrow={
          <>
            <Badge tone="approved">
              {megapixels(asset.width, asset.height)}
            </Badge>
            <Badge>
              {source
                ? `${source.provider} · ${source.model}`
                : "Imported image"}
            </Badge>
            <Badge tone={asset.decision}>{asset.decision}</Badge>
          </>
        }
        tabs={
          <ModalTabs
            label="Image review sections"
            value={tab}
            onChange={setTab}
            items={[
              { value: "quality", label: "Quality review" },
              {
                value: "related",
                label: `Same brief (${asset.briefId ? data.assets.filter((a) => a.briefId === asset.briefId).length : 1})`,
              },
              { value: "metadata", label: "Metadata" },
            ]}
          />
        }
        footer={
          <>
            <span className="review-checksum">
              Checksum {asset.hash.slice(0, 16)}… · original preserved
            </span>
            <span className="footer-spacer" />
            <Button onClick={() => save("pending")} disabled={busy}>
              Save draft
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                run(
                  () => desktop.downloadAsset(asset.id, showOriginal),
                  (saved) => (saved ? "Image saved." : null),
                )
              }
            >
              <DownloadSimpleIcon size={16} /> Download
            </Button>
            <Button onClick={onClose} disabled={busy}>
              Close
            </Button>
          </>
        }
      >
        <div className="review-detail" hidden={tab === "related"}>
          <div className="review-preview">
            <img
              src={localImage(
                showOriginal && original.data ? original.data : asset.preview,
              )}
              alt={asset.title || asset.name}
            />
            <div className="technical-facts">
              <span>
                {asset.width} × {asset.height}
              </span>
              <span>{megapixels(asset.width, asset.height)}</span>
              <span>{bytes(asset.bytes)}</span>
              <Badge tone={asset.decision}>{asset.decision}</Badge>
            </div>
            <p className="small muted">
              Viewing a bounded {showOriginal ? "original" : "current"} preview.
              Originals stay immutable.
            </p>
            {showOriginal && (
              <p className="small muted">
                Technical facts above describe the current canonical file.
              </p>
            )}
            <Button onClick={() => setHistoryOpen(!historyOpen)}>
              {historyOpen ? "Hide review history" : "Review history"}
            </Button>
            {historyOpen && (
              <div className="review-history">
                {history.isPending ? (
                  <p>Loading history…</p>
                ) : history.isError ? (
                  <p role="alert">Review history could not be loaded.</p>
                ) : history.data?.length ? (
                  history.data.map((event) => (
                    <details key={event.id}>
                      <summary>
                        {event.previous.decision} → {event.current.decision}
                        <small>
                          {event.actor} ·{" "}
                          {new Date(event.createdAt).toLocaleString()}
                        </small>
                      </summary>
                      <p>{event.current.title || "No metadata title"}</p>
                      <p>{event.current.keywords.join(", ")}</p>
                      <p>{event.current.notes || "No review notes"}</p>
                    </details>
                  ))
                ) : (
                  <p>No review decisions recorded yet.</p>
                )}
              </div>
            )}
            <div className="review-extra-actions">
              <Button
                disabled={busy || original.isFetching}
                onClick={() => setShowOriginal(!showOriginal)}
              >
                {showOriginal ? "View current" : "View original"}
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  run(
                    () => desktop.downloadAsset(asset.id, showOriginal),
                    (saved) => (saved ? "Image saved." : null),
                  )
                }
              >
                <DownloadSimpleIcon size={16} />
                Download
              </Button>
            </div>
            {asset.isMock && (
              <Badge>Local test pattern · export excluded</Badge>
            )}
            {asset.sourceJobId && (
              <Button
                disabled={busy}
                onClick={() =>
                  navigate("generation", { parent: asset.sourceJobId! })
                }
              >
                Regenerate with copied settings
              </Button>
            )}
            {canRepair && (
              <Button disabled={busy} onClick={() => setRepairOpen(true)}>
                Remove provider logo
              </Button>
            )}
          </div>
          <div className="review-form">
            <div className="review-section" hidden={tab !== "quality"}>
              <div className="section-heading">
                <h3>Required human checks</h3>
                <span className="muted small">
                  {
                    Object.values(input.checklist.referenceChecks!).filter(
                      Boolean,
                    ).length
                  }
                  /9
                </span>
                <Button
                  onClick={() => {
                    const r = {
                      logo: true,
                      text: true,
                      anatomy: true,
                      truthfulness: true,
                      famous: true,
                      copyright: true,
                      composition: true,
                      consistency: true,
                      distinctiveness: true,
                    };
                    setInput((current) => ({
                      ...current,
                      checklist: {
                        ...current.checklist,
                        referenceChecks: r,
                        technical: true,
                        artifacts: true,
                        rights: true,
                      },
                    }));
                  }}
                >
                  <CheckIcon size={14} />
                  Check all
                </Button>
              </div>
              {(
                [
                  ["logo", "No visible logo or trademark"],
                  ["text", "No unreadable or meaningless text"],
                  ["anatomy", "No obvious anatomy problems"],
                  ["truthfulness", "No misleading depiction of a real event"],
                  ["famous", "No famous person or fictional character"],
                  ["copyright", "No obvious copyrighted character or artwork"],
                  ["composition", "Composition is commercially useful"],
                  [
                    "consistency",
                    "Subject and background are visually consistent",
                  ],
                  [
                    "distinctiveness",
                    "Image is sufficiently distinct from other submissions",
                  ],
                ] as const
              ).map(([key, label]) => (
                <label className="check-row" key={key}>
                  <input
                    type="checkbox"
                    checked={input.checklist.referenceChecks![key]}
                    onChange={(event) =>
                      setInput((current) => {
                        const r = {
                          ...current.checklist.referenceChecks!,
                          [key]: event.target.checked,
                        };
                        return {
                          ...current,
                          checklist: {
                            ...current.checklist,
                            referenceChecks: r,
                            artifacts: r.logo && r.text,
                            technical:
                              r.anatomy &&
                              r.composition &&
                              r.consistency &&
                              r.distinctiveness,
                            rights: r.famous && r.copyright && r.truthfulness,
                          },
                        };
                      })
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
              <label className="check-row disclosure-check">
                <input
                  type="checkbox"
                  checked={input.checklist.aiDisclosure}
                  onChange={(event) =>
                    setInput((current) => ({
                      ...current,
                      checklist: {
                        ...current.checklist,
                        aiDisclosure: event.target.checked,
                      },
                    }))
                  }
                />
                <span>AI origin and disclosure requirements are reviewed</span>
              </label>
              <Field label="Review notes">
                <textarea
                  rows={4}
                  maxLength={10000}
                  value={input.notes}
                  placeholder="Artifacts, strengths, or regeneration direction"
                  onChange={(e) =>
                    setInput((current) => ({
                      ...current,
                      notes: e.target.value,
                    }))
                  }
                />
              </Field>
              <div className="review-decision-actions">
                <Button
                  variant="danger"
                  onClick={() => setConfirm("rejected")}
                  disabled={busy}
                >
                  <XIcon size={16} />
                  Reject
                </Button>
                {asset.sourceJobId && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      navigate("generation", { parent: asset.sourceJobId! })
                    }
                  >
                    Regenerate
                  </Button>
                )}
                <Button
                  variant="primary"
                  onClick={() => setConfirm("approved")}
                  disabled={busy || !canApprove}
                >
                  <CheckIcon size={16} />
                  Approve
                </Button>
              </div>
              <p className="muted small">
                Approval requires all checks and valid metadata in the Metadata
                tab.
              </p>
            </div>
            <div className="review-section" hidden={tab !== "metadata"}>
              <div className="section-heading">
                <h3>Adobe metadata</h3>
                <Button disabled={busy} onClick={() => setMetadataOpen(true)}>
                  <SparkleIcon size={16} />
                  AI draft
                </Button>
              </div>
              <Field
                label="Title"
                hint="Adobe CSV: up to 70 characters, using plain letters, numbers, and spaces."
              >
                <input
                  value={input.title}
                  maxLength={70}
                  onChange={(e) =>
                    setInput((current) => ({
                      ...current,
                      title: e.target.value,
                    }))
                  }
                />
              </Field>
              <Field
                label={`Keywords · ${keywords.split(",").filter((w) => w.trim()).length}`}
                hint="5 to 49 distinct keywords, ordered by relevance. Separate with commas."
              >
                <textarea
                  rows={4}
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                />
              </Field>
              <Field label="Category">
                <select
                  value={input.category}
                  onChange={(e) =>
                    setInput((current) => ({
                      ...current,
                      category: Number(e.target.value),
                    }))
                  }
                >
                  <option value="0">Choose a category</option>
                  {categories.map((name, i) => (
                    <option key={name} value={i + 1}>
                      {i + 1}. {name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </div>
        {tab === "related" && (
          <div className="related-assets">
            <p className="muted small">
              Compare candidates before choosing the strongest submission.
            </p>
            <div className="asset-grid">
              {data.assets
                .filter((a) =>
                  asset.briefId
                    ? a.briefId === asset.briefId
                    : a.id === asset.id,
                )
                .map((a) => (
                  <button
                    key={a.id}
                    className="related-card"
                    onClick={() => navigate("review", { asset: a.id })}
                    aria-label={`Review ${a.name}`}
                  >
                    <img
                      src={localImage(a.thumbnail)}
                      alt={a.title || a.name}
                    />
                    <strong>{a.name}</strong>
                    <Badge tone={a.decision}>{a.decision}</Badge>
                  </button>
                ))}
            </div>
          </div>
        )}
      </Modal>
      {metadataOpen && (
        <TextJobModal
          data={data}
          kind="metadata"
          assetIds={[asset.id]}
          onClose={() => setMetadataOpen(false)}
        />
      )}
      <Confirm
        open={repairOpen}
        title="Remove the provider logo?"
        description="Provider: SnapGenAI. One removal request for the recorded image. The current image will be replaced and needs a fresh review."
        busy={busy}
        label="Confirm removal"
        onClose={() => setRepairOpen(false)}
        onConfirm={async () => {
          const result = await run(
            () => desktop.repair(asset.id, repairMode),
            "Logo removal queued. The immutable original is preserved.",
          );
          if (result.ok) {
            setRepairOpen(false);
            onClose();
          }
        }}
      >
        <Field label="Provider quality tier">
          <select
            value={repairMode}
            onChange={(e) => setRepairMode(e.target.value)}
          >
            <option value="fast">Fast</option>
            <option value="pro">Pro</option>
          </select>
        </Field>
        <p className="muted small">
          The provider may charge your account for Pro. No paid retry or
          fallback is automatic.
        </p>
      </Confirm>
      <Confirm
        open={!!confirm}
        title={
          confirm === "approved" ? "Approve this image?" : "Reject this image?"
        }
        description={
          confirm === "approved"
            ? "Your checklist and metadata will be validated before the image becomes exportable."
            : "The image stays in your library with a rejected decision."
        }
        onClose={() => setConfirm(null)}
        busy={busy}
        danger={confirm === "rejected"}
        onConfirm={() => {
          if (confirm) void save(confirm);
        }}
        label={confirm === "approved" ? "Approve image" : "Reject image"}
      />
    </>
  );
}

export function Exports({
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
  const { run, busy } = useActions();
  const [confirm, setConfirm] = useState(false);
  const [name, setName] = useState("");
  const history = params.get("view") === "history";
  const eligible = data.assets.filter((a) => a.decision === "approved");
  const ids = [...selected].filter((id) => eligible.some((a) => a.id === id));
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Adobe exports</h1>
          <p>
            Prepare approved images and metadata as a portable submission
            package.
          </p>
        </div>
        {!history && (
          <Button
            variant="primary"
            disabled={!ids.length || busy}
            onClick={() => setConfirm(true)}
          >
            <DownloadSimpleIcon size={18} />
            Prepare package{ids.length > 0 && ` (${ids.length})`}
          </Button>
        )}
      </div>
      <div className="page-tabs">
        <ModalTabs
          label="Export views"
          value={history ? "history" : "create"}
          onChange={(value) =>
            navigate("exports", value === "history" ? { view: "history" } : {})
          }
          items={[
            { value: "create", label: "Prepare package" },
            {
              value: "history",
              label: `Export batches (${data.exports.length})`,
            },
          ]}
        />
      </div>
      {history ? (
        <Table
          filterTitle="Filter export packages"
          rows={data.exports}
          searchText={(b) => `${b.name} ${b.path}`}
          placeholder="Search package history…"
          empty={{
            title: "Your first package starts here",
            description:
              "Completed packages appear here with their destination and image count.",
          }}
          columns={[
            {
              label: "Package",
              sortValue: (b) => b.name,
              render: (b) => <strong>{b.name}</strong>,
            },
            {
              label: "Images",
              sortValue: (b) => b.count,
              render: (b) => b.count,
            },
            {
              label: "Destination",
              sortValue: (b) => b.path,
              className: "path-cell",
              render: (b) => <span title={b.path}>{b.path}</span>,
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
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => desktop.saveExportCopy(b.id),
                      (saved) => (saved ? "Package copy saved." : null),
                    )
                  }
                >
                  <DownloadSimpleIcon size={16} />
                  Save copy
                </Button>
              ),
            },
          ]}
        />
      ) : (
        <Table
          filterTitle="Filter approved images"
          rows={eligible}
          selected={selected}
          onSelect={onSelect}
          searchText={(a) => `${a.name} ${a.title} ${a.keywords.join(" ")}`}
          placeholder="Search approved images…"
          empty={{
            title: "Approve images before delivery",
            description:
              "Finish the human review checks and metadata to make images available for export.",
            action: (
              <Button onClick={() => navigate("review")}>
                Open review queue
                <ArrowRightIcon size={16} />
              </Button>
            ),
          }}
          columns={[
            {
              label: "Image",
              sortValue: (a) => a.title || a.name,
              render: (a) => (
                <div className="image-cell">
                  <img src={localImage(a.thumbnail)} alt="" loading="lazy" />
                  <button
                    className="record-link"
                    onClick={() => navigate("review", { asset: a.id })}
                  >
                    {a.title}
                    <small>{a.name}</small>
                  </button>
                </div>
              ),
            },
            {
              label: "Resolution",
              sortValue: (a) => a.width * a.height,
              render: (a) => megapixels(a.width, a.height),
            },
            {
              label: "Metadata",
              sortValue: (a) => a.keywords.length,
              render: (a) => (
                <Badge tone="approved">{a.keywords.length} keywords</Badge>
              ),
            },
            {
              label: "Created",
              sortValue: (a) => a.createdAt,
              render: (a) => date(a.createdAt),
            },
          ]}
        />
      )}
      <Confirm
        open={confirm}
        title="Prepare Adobe package"
        description={`${ids.length} approved images will be prepared locally. Choose a destination folder after confirmation.`}
        onClose={() => setConfirm(false)}
        busy={busy}
        label="Prepare and save"
        onConfirm={async () => {
          if (!name.trim()) return;
          const result = await run(
            () => desktop.exportPackage(ids, name),
            (result) =>
              result ? `Package saved with ${result.count} images.` : null,
          );
          if (result.ok && result.value) {
            setConfirm(false);
            onSelect(ids, false);
            navigate("exports", { view: "history" });
          }
        }}
      >
        <Field label="Package name">
          <input
            autoFocus
            required
            maxLength={100}
            placeholder="e.g. Urban travel collection"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <ul className="package-contents">
          <li>High-quality JPEGs with XMP titles and keywords</li>
          <li>Adobe metadata CSV</li>
          <li>Manifest with file checksums</li>
          <li>Local compliance report</li>
        </ul>
        <p className="muted small">
          This prepares files for manual submission. It does not submit to
          Adobe.
        </p>
      </Confirm>
    </>
  );
}
