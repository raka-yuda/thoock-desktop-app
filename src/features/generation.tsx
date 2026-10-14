import {
  ArrowRightIcon,
  ImageIcon,
  PlusIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { navigate } from "../app/router";
import {
  Badge,
  Button,
  Confirm,
  Field,
  Modal,
  ModalTabs,
  useActions,
} from "../components/ui";
import { Table } from "../components/table";
import { desktop } from "../lib/desktop";
import { date } from "../lib/format";
import { type GenerationInput, type Job, type Snapshot } from "../lib/types";

export function Generation({
  data,
  params,
  selectedBriefs,
}: {
  data: Snapshot;
  params: URLSearchParams;
  selectedBriefs: Set<string>;
}) {
  const { run, busy } = useActions();
  const [confirm, setConfirm] = useState(false);
  const [historyUuid, setHistoryUuid] = useState("");
  const [jobAction, setJobAction] = useState<{
    job: Job;
    kind: "retry" | "lookup" | "cancel";
  } | null>(null);
  const linkedBrief = data.briefs.find((b) => b.id === params.get("brief"));
  const [input, setInput] = useState<GenerationInput>({
    provider: "local",
    model: "mock-image",
    prompt: linkedBrief?.prompt ?? "",
    negativePrompt: linkedBrief?.negativePrompt ?? "",
    aspectRatio: "1:1",
    resolution: "2K",
    quality: "test pattern",
    briefId: linkedBrief?.id ?? null,
    parentJobId: params.get("parent"),
  });
  const catalog = useQuery({
    queryKey: ["capabilities"],
    queryFn: desktop.capabilities,
  });
  const parent = useQuery({
    queryKey: ["generation-settings", params.get("parent")],
    queryFn: () => desktop.generationSettings(params.get("parent")!),
    enabled: !!params.get("parent"),
    retry: false,
  });
  useEffect(() => {
    if (parent.data) setInput(parent.data);
  }, [parent.data]);
  useEffect(() => {
    if (catalog.data && !params.has("parent")) {
      const chosen = catalog.data.find(
        (c) =>
          c.provider === data.preferences.defaultImageProvider &&
          c.model === data.preferences.defaultImageModel,
      );
      if (chosen)
        setInput((current) => ({
          ...current,
          provider: chosen.provider,
          model: chosen.model,
          aspectRatio: chosen.aspectRatios[0],
          resolution: chosen.resolutions[0],
          quality: chosen.qualities[0],
        }));
    }
  }, [
    catalog.data,
    data.preferences.defaultImageProvider,
    data.preferences.defaultImageModel,
  ]);
  const capability = catalog.data?.find(
    (c) => c.provider === input.provider && c.model === input.model,
  );
  const history = params.get("view") === "history";
  const generationJobs = data.jobs.filter(
    (j) => j.operation === "image generation",
  );
  const detail = generationJobs.find((j) => j.id === params.get("job"));
  const bulkIds =
    params.get("bulk") === "1"
      ? [...selectedBriefs].filter((id) => data.briefs.some((b) => b.id === id))
      : [];
  const configured =
    input.provider === "local" ||
    data.providers.some((p) => p.id === input.provider && p.configured);
  const valid =
    !!capability &&
    configured &&
    (bulkIds.length > 0 || input.prompt.trim().length > 0);
  function chooseModel(value: string) {
    const chosen = catalog.data?.find(
      (c) => `${c.provider}:${c.model}` === value,
    );
    if (chosen)
      setInput((current) => ({
        ...current,
        provider: chosen.provider,
        model: chosen.model,
        aspectRatio: chosen.aspectRatios[0],
        resolution: chosen.resolutions[0],
        quality: chosen.qualities[0],
        negativePrompt: "",
      }));
  }
  function chooseBrief(id: string) {
    const brief = data.briefs.find((b) => b.id === id);
    setInput((current) => ({
      ...current,
      briefId: id || null,
      prompt: brief
        ? `${brief.prompt}${brief.negativePrompt ? `\nAvoid: ${brief.negativePrompt}` : ""}`
        : current.prompt,
    }));
  }
  async function queue() {
    const result = await run<unknown>(
      () =>
        bulkIds.length
          ? desktop.bulkGenerate(input, bulkIds)
          : desktop.generate(input),
      "Generation queued. Follow its progress in History.",
    );
    if (result.ok) {
      setConfirm(false);
      navigate("generation", { view: "history" });
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (valid) setConfirm(true);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Image generation</h1>
          <p>
            Create candidates with your provider, or import existing images.
          </p>
        </div>
        <Button onClick={() => navigate("settings", { tab: "providers" })}>
          Configure providers
          <ArrowRightIcon size={16} />
        </Button>
      </div>
      <div className="page-tabs">
        <ModalTabs
          label="Generation views"
          value={history ? "history" : "create"}
          onChange={(value) =>
            navigate(
              "generation",
              value === "history" ? { view: "history" } : {},
            )
          }
          items={[
            { value: "create", label: "Create" },
            { value: "history", label: `History (${generationJobs.length})` },
          ]}
        />
      </div>
      {history ? (
        <Table
          filterTitle="Filter generation history"
          rows={generationJobs}
          structuredFilters={[
            {
              label: "Provider",
              options: [...new Set(generationJobs.map((j) => j.provider))],
              value: (j) => j.provider,
            },
            {
              label: "Model",
              options: [
                ...new Set(generationJobs.map((j) => j.model).filter(Boolean)),
              ],
              value: (j) => j.model,
            },
            {
              label: "Operation",
              options: [...new Set(generationJobs.map((j) => j.operation))],
              value: (j) => j.operation,
            },
            {
              label: "Recovery",
              options: ["Saved request ID", "No request ID"],
              value: (j) =>
                j.requestId ? "Saved request ID" : "No request ID",
            },
          ]}
          placeholder="Search operation, model, or status…"
          searchText={(j) =>
            `${j.operation} ${j.provider} ${j.model} ${j.status} ${j.message}`
          }
          filter={{
            options: [
              "queued",
              "running",
              "succeeded",
              "failed",
              "interrupted",
              "cancelled",
            ],
            value: (j) => j.status,
          }}
          empty={{
            title: "Your production history will appear here",
            description:
              "Confirmed requests are stored before the worker contacts a provider.",
          }}
          columns={[
            {
              label: "Operation",
              render: (j) => (
                <button
                  className="record-link"
                  onClick={() =>
                    navigate("generation", { view: "history", job: j.id })
                  }
                >
                  {j.operation}
                  <small>
                    {j.provider} · {j.model || "local processing"}
                  </small>
                </button>
              ),
            },
            {
              label: "Status",
              render: (j) => (
                <>
                  <Badge tone={j.status}>{j.status}</Badge>
                  {j.status === "running" && (
                    <small className="cell-subtext">{j.progress}%</small>
                  )}
                </>
              ),
            },
            {
              label: "Result",
              className: "prompt-cell",
              render: (j) => <span title={j.message}>{j.message}</span>,
            },
            { label: "Created", render: (j) => date(j.createdAt) },
            {
              label: "Actions",
              render: (j) => (
                <div className="row-actions">
                  {j.provider === "snapgen" &&
                    ["succeeded", "failed", "interrupted"].includes(
                      j.status,
                    ) && (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          setHistoryUuid("");
                          setJobAction({ job: j, kind: "lookup" });
                        }}
                      >
                        Check result
                      </Button>
                    )}
                  {j.operation === "image generation" &&
                    ["failed", "interrupted"].includes(j.status) && (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setJobAction({ job: j, kind: "retry" })}
                      >
                        Retry
                      </Button>
                    )}
                  {["queued", "running"].includes(j.status) && (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setJobAction({ job: j, kind: "cancel" })}
                    >
                      Stop
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      ) : (
        <div className="generation-layout">
          <section className="panel">
            <header>
              <h2>
                {bulkIds.length
                  ? `Generate from ${bulkIds.length} selected briefs`
                  : "Create image candidates"}
              </h2>
              <p>Capability controls come from the selected provider model.</p>
            </header>
            <form onSubmit={submit} className="panel-body">
              <div className="form-grid">
                <Field label="Provider / model" className="full">
                  <select
                    disabled={!catalog.data}
                    value={`${input.provider}:${input.model}`}
                    onChange={(e) => chooseModel(e.target.value)}
                  >
                    {catalog.data?.map((c) => (
                      <option
                        value={`${c.provider}:${c.model}`}
                        key={`${c.provider}:${c.model}`}
                      >
                        {c.provider === "local" ? "Local" : "SnapGenAI"} ·{" "}
                        {c.label}
                      </option>
                    ))}
                  </select>
                </Field>
                {!bulkIds.length && (
                  <>
                    <Field label="Commercial brief" className="full">
                      <select
                        value={input.briefId ?? ""}
                        onChange={(e) => chooseBrief(e.target.value)}
                      >
                        <option value="">Independent generation</option>
                        {data.briefs.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.title}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Prompt" className="full">
                      <textarea
                        required
                        rows={7}
                        maxLength={12000}
                        value={input.prompt}
                        onChange={(e) =>
                          setInput((current) => ({
                            ...current,
                            prompt: e.target.value,
                          }))
                        }
                        placeholder="Describe the subject, scene, composition, lighting, and intended use."
                      />
                    </Field>
                  </>
                )}
                {capability &&
                  (
                    [
                      ["aspectRatio", "Aspect ratio", capability.aspectRatios],
                      ["resolution", "Resolution", capability.resolutions],
                      ["quality", "Quality / style", capability.qualities],
                    ] as const
                  ).map(([key, label, values]) => (
                    <Field key={key} label={label}>
                      <select
                        value={input[key]}
                        onChange={(e) =>
                          setInput((current) => ({
                            ...current,
                            [key]: e.target.value,
                          }))
                        }
                      >
                        {values.map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </Field>
                  ))}
                {capability?.negativePrompt && (
                  <Field label="Negative prompt" className="full">
                    <textarea
                      value={input.negativePrompt}
                      onChange={(e) =>
                        setInput((current) => ({
                          ...current,
                          negativePrompt: e.target.value,
                        }))
                      }
                    />
                  </Field>
                )}
                {!configured && (
                  <div className="inline-error full">
                    Save a SnapGenAI key in Settings to use this model.
                  </div>
                )}
                {bulkIds.length > 0 && (
                  <p className="small muted full">
                    One request per brief. Negative prompts are added as avoid
                    instructions in the main prompt.
                  </p>
                )}
              </div>
              {input.provider === "local" && (
                <div className="info-block">
                  <strong>Local test pattern</strong>
                  <p>
                    Exercises the durable queue and image pipeline without
                    provider requests. Test patterns are labeled and excluded
                    from commercial approval and export.
                  </p>
                </div>
              )}
              {input.parentJobId && (
                <Badge>
                  Linked regeneration · {input.parentJobId.slice(0, 8)}
                </Badge>
              )}
              <div className="form-actions">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={busy || !valid}
                >
                  <SparkleIcon size={18} />
                  Review generation request
                </Button>
              </div>
            </form>
          </section>
          <aside className="panel">
            <header>
              <h2>Import your existing images</h2>
              <p>Bring candidates into the same local review workflow.</p>
            </header>
            <div className="panel-body">
              <div className="import-zone">
                <ImageIcon size={42} weight="light" />
                <h3>Keep your originals</h3>
                <p>JPEG, PNG, WebP · up to 50 images · 100 MB each</p>
                <Button
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => desktop.importImages(input.briefId),
                      (n) => (n ? `${n} images imported.` : null),
                    )
                  }
                >
                  <PlusIcon size={18} />
                  Choose image files
                </Button>
              </div>
              <p className="small muted">
                Originals stay immutable. Identical files are deduplicated.
              </p>
            </div>
          </aside>
        </div>
      )}
      <Confirm
        open={confirm}
        title="Confirm image generation"
        description="Each confirmed attempt is durable. A provider request may charge your own account."
        onClose={() => setConfirm(false)}
        busy={busy}
        label="Confirm and queue"
        onConfirm={() => void queue()}
      >
        <div className="request-summary">
          <div>
            <span>Provider</span>
            <strong>{input.provider}</strong>
          </div>
          <div>
            <span>Model</span>
            <strong>{input.model}</strong>
          </div>
          <div>
            <span>Requests</span>
            <strong>
              {input.provider === "local" ? 0 : bulkIds.length || 1}
            </strong>
          </div>
          <div>
            <span>Controls</span>
            <strong>
              {input.aspectRatio} · {input.resolution} · {input.quality}
            </strong>
          </div>
        </div>
        <p className="small muted">
          After an interrupted request, use read-only lookup when available. A
          retry creates a separate linked attempt and requires confirmation.
        </p>
      </Confirm>
      <Confirm
        open={!!jobAction}
        title={
          jobAction?.kind === "retry"
            ? "Confirm a new linked retry"
            : jobAction?.kind === "cancel"
              ? "Stop local work?"
              : "Check SnapGenAI result"
        }
        description={
          jobAction?.kind === "retry"
            ? `Provider: ${jobAction.job.provider}. Model: ${jobAction.job.model}. One new request; your provider may charge you.`
            : jobAction?.kind === "cancel"
              ? "Queued work will be cancelled. A provider request already accepted may still complete."
              : "Check the saved UUID or supply a UUID from the provider dashboard. This does not submit a new generation request."
        }
        busy={busy}
        onClose={() => setJobAction(null)}
        label={
          jobAction?.kind === "retry"
            ? "Confirm retry"
            : jobAction?.kind === "cancel"
              ? "Stop local work"
              : "Find result now"
        }
        onConfirm={async () => {
          if (!jobAction) return;
          const { job, kind } = jobAction;
          const result = await run(
            () =>
              kind === "retry"
                ? desktop.retry(job.id)
                : kind === "cancel"
                  ? desktop.cancelJob(job.id)
                  : desktop.checkResult(
                      job.id,
                      historyUuid.trim() || undefined,
                    ),
            kind === "retry"
              ? "New linked attempt queued."
              : kind === "cancel"
                ? "Local work stopped."
                : "Saved provider result checked.",
          );
          if (result.ok) setJobAction(null);
        }}
        layout={jobAction?.kind === "lookup" ? "plain" : "confirmation"}
      >
        {jobAction?.kind === "lookup" && (
          <>
            <div className="info-block">
              <div>
                <strong>Read-only provider recovery</strong>
                <p>
                  Paste the history UUID when the original response did not
                  return one. A supplied UUID cannot replace an existing saved
                  request ID.
                </p>
              </div>
            </div>
            <Field label="Optional SnapGen history UUID">
              <input
                value={historyUuid}
                onChange={(e) => setHistoryUuid(e.target.value)}
                placeholder={
                  jobAction.job.requestId ??
                  "Paste a UUID from the provider dashboard"
                }
                maxLength={36}
              />
            </Field>
          </>
        )}
      </Confirm>
      {detail && (
        <Modal
          open
          onClose={() => navigate("generation", { view: "history" })}
          title="Attempt details"
          description="Request identifiers and lineage remain attached to this attempt."
        >
          <dl className="log-detail">
            <dt>Attempt</dt>
            <dd>
              <code>{detail.id}</code>
            </dd>
            <dt>Provider / model</dt>
            <dd>
              {detail.provider} · {detail.model}
            </dd>
            <dt>Request ID</dt>
            <dd>
              <code>{detail.requestId ?? "Not issued or unavailable"}</code>
            </dd>
            <dt>Parent attempt</dt>
            <dd>{detail.parentId ?? "Original attempt"}</dd>
            <dt>Status</dt>
            <dd>
              <Badge tone={detail.status}>{detail.status}</Badge>
            </dd>
            <dt>Message</dt>
            <dd>{detail.message}</dd>
            <dt>Results</dt>
            <dd>{detail.resultIds.length} saved records</dd>
          </dl>
          {detail.operation === "image generation" &&
            detail.resultIds.length > 0 && (
              <Button
                onClick={() =>
                  navigate("review", { asset: detail.resultIds[0] })
                }
              >
                Review result
                <ArrowRightIcon size={16} />
              </Button>
            )}
        </Modal>
      )}
    </>
  );
}
