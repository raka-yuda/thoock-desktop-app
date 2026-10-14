import { useState } from "react";
import {
  Badge,
  Button,
  Confirm,
  Field,
  Modal,
  useActions,
} from "../components/ui";
import { desktop } from "../lib/desktop";
import { type Opportunity, type Snapshot } from "../lib/types";
import { navigate } from "../app/router";
import { modelForProvider } from "../lib/text-models";
import { TextModelOptions } from "../components/text-model-options";

export function TextJobModal({
  data,
  kind,
  opportunity,
  assetIds = [],
  onClose,
}: {
  data: Snapshot;
  kind: "research" | "briefs" | "metadata";
  opportunity?: Opportunity;
  assetIds?: string[];
  onClose: () => void;
}) {
  const { run, busy } = useActions();
  const [provider, setProvider] = useState(
    data.preferences.defaultTextProvider,
  );
  const [model, setModel] = useState(() =>
    modelForProvider(
      data.preferences.defaultTextProvider,
      data.preferences.defaultTextModel,
    ),
  );
  const [topic, setTopic] = useState(opportunity?.topic ?? "");
  const [count, setCount] = useState(kind === "briefs" ? 3 : 5);
  const [sourceId, setSourceId] = useState(
    opportunity?.id ?? data.opportunities[0]?.id ?? "",
  );
  const source = data.opportunities.find((o) => o.id === sourceId);
  const [targetRegion, setTargetRegion] = useState(data.preferences.region);
  const [behavior, setBehavior] = useState("evergreen");
  const [portfolioContext, setPortfolioContext] = useState("");
  const [creativePreset, setCreativePreset] = useState(
    "Mixed commercial concepts",
  );
  const [confirm, setConfirm] = useState(false);
  const configured = data.providers.some(
    (p) => p.id === provider && p.configured,
  );
  const valid =
    (provider === "local" || (configured && model.trim())) &&
    (kind === "metadata" || (kind === "briefs" ? !!source : !!topic.trim()));
  const requestCount =
    provider === "local" ? 0 : kind === "metadata" ? assetIds.length : 1;
  const title =
    kind === "research"
      ? "Research topic opportunities with AI"
      : kind === "briefs"
        ? "Create a batch of commercial briefs"
        : "Prepare metadata drafts";
  async function queue() {
    const input = {
      provider,
      model: provider === "local" ? "local-rules" : model,
      topic: kind === "briefs" ? (source?.topic ?? "") : topic,
      count,
      opportunityId: kind === "briefs" ? sourceId || null : null,
      context: { targetRegion, behavior, portfolioContext, creativePreset },
    };
    const result = await run<unknown>(
      () =>
        kind === "metadata"
          ? desktop.metadata(assetIds, provider, input.model)
          : kind === "research"
            ? desktop.research(input)
            : desktop.briefBatch(input),
      "Confirmed work added to the durable queue.",
    );
    if (result.ok) {
      onClose();
      navigate(
        kind === "research"
          ? "opportunities"
          : kind === "briefs"
            ? "briefs"
            : "review",
      );
    }
  }
  return (
    <>
      <Modal
        open
        onClose={onClose}
        variant="plain"
        size={kind === "briefs" ? "medium" : "form"}
        title={title}
        description={
          kind === "metadata"
            ? `${assetIds.length} selected images. Generated metadata remains a draft for human review.`
            : "Produce structured planning concepts. Verify demand and supply estimates with your own sources."
        }
        footer={
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!valid || busy}
              onClick={() => setConfirm(true)}
            >
              Review request
            </Button>
          </>
        }
      >
        <div className="form-grid">
          {kind === "research" && (
            <>
              <Field
                label="Topic seed"
                className="full"
                hint="A market, behavior, season, or buyer problem"
              >
                <input
                  required
                  maxLength={200}
                  value={topic}
                  placeholder="Example: affordable healthy eating"
                  onChange={(e) => setTopic(e.target.value)}
                />
              </Field>
              <Field label="Target region">
                <input
                  maxLength={200}
                  value={targetRegion}
                  onChange={(e) => setTargetRegion(e.target.value)}
                />
              </Field>
              <Field label="Topic behavior">
                <select
                  value={behavior}
                  onChange={(e) => setBehavior(e.target.value)}
                >
                  <option value="evergreen">Evergreen</option>
                  <option value="seasonal">Seasonal</option>
                  <option value="trending">Trending</option>
                </select>
              </Field>
            </>
          )}
          {kind === "briefs" && (
            <Field label="Source opportunity" className="full">
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
              >
                <option value="">Choose a researched opportunity</option>
                {data.opportunities.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.topic} · {o.score}/100
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field
            label={
              kind === "research"
                ? "Research assistant"
                : kind === "briefs"
                  ? "Brief writer"
                  : "Provider"
            }
          >
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value as typeof provider);
                setModel(modelForProvider(e.target.value as typeof provider));
              }}
            >
              <option value="local">Deterministic mock (free)</option>
              <option value="openai">OpenAI</option>
              <option value="gemini">Google Gemini</option>
            </select>
          </Field>
          {kind !== "metadata" && (
            <Field
              label={
                kind === "research"
                  ? "Number of topic angles"
                  : "Number of distinct briefs"
              }
            >
              <input
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(e) =>
                  setCount(Math.min(20, Math.max(1, Number(e.target.value))))
                }
              />
            </Field>
          )}
          {provider !== "local" && (
            <Field
              label="Model"
              className="full"
              hint="Supports structured results and image metadata. Access depends on your API account."
            >
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                <TextModelOptions provider={provider} value={model} />
              </select>
            </Field>
          )}
          {kind === "research" && (
            <Field
              label="Optional portfolio context"
              className="full"
              hint="Helps the AI avoid repeating what you already have"
            >
              <textarea
                rows={3}
                maxLength={5000}
                value={portfolioContext}
                placeholder="Example: I already have many generic office images; I want Indonesian small-business scenes."
                onChange={(e) => setPortfolioContext(e.target.value)}
              />
            </Field>
          )}
          {kind === "briefs" && (
            <>
              <Field label="Creative preset" className="full">
                <select
                  value={creativePreset}
                  onChange={(e) => setCreativePreset(e.target.value)}
                >
                  <option>Mixed commercial concepts</option>
                  <option>Editorial scenes</option>
                  <option>Product backgrounds</option>
                  <option>Brand storytelling</option>
                </select>
              </Field>
              <div className="info-block full">
                <div>
                  <strong>AI output is a research draft</strong>
                  <p>
                    Review commercial usefulness, factual implications,
                    representation, and rights before generation.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>
      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Confirm provider work"
        description="This creates durable jobs that remain visible after navigation."
        busy={busy}
        label="Confirm and queue"
        onConfirm={() => void queue()}
      >
        <div className="request-summary">
          <div>
            <span>Provider</span>
            <strong>{provider}</strong>
          </div>
          <div>
            <span>Model</span>
            <strong>{provider === "local" ? "local-rules" : model}</strong>
          </div>
          <div>
            <span>Provider requests</span>
            <Badge>{requestCount}</Badge>
          </div>
          <div>
            <span>Output</span>
            <strong>
              {kind === "metadata"
                ? `${assetIds.length} metadata drafts`
                : `${count} concepts`}
            </strong>
          </div>
        </div>
        <p className="muted small">
          No paid retries or provider fallback. After an interrupted paid
          action, confirm a new request before repeating it.
        </p>
      </Confirm>
    </>
  );
}
