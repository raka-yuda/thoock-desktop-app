import {
  ApertureIcon,
  ArrowRightIcon,
  BookOpenIcon,
  CheckCircleIcon,
  CommandIcon,
  DatabaseIcon,
  FolderOpenIcon,
  GearSixIcon,
  ImageIcon,
  ListIcon,
  MagnifyingGlassIcon,
  SidebarSimpleIcon,
  SparkleIcon,
  SquaresFourIcon,
  TrayIcon,
  MoonIcon,
  SunIcon,
} from "@phosphor-icons/react";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Empty, Modal, useActions } from "./components/ui";
import { Table, toggleSelection } from "./components/table";
import { navigate, useRoute, type Page } from "./app/router";
import {
  desktop,
  interfacePreview,
  localImage,
  onWorkspaceChanged,
} from "./lib/desktop";
import { date } from "./lib/format";
import { errorMessage, type Snapshot } from "./lib/types";
import "./App.css";
import "./theme.css";
import { useTheme } from "./lib/theme";
import { isDemoMode, setDemoMode } from "./lib/demo";

const Opportunities = lazy(() =>
  import("./features/research").then((m) => ({ default: m.Opportunities })),
);
const Briefs = lazy(() =>
  import("./features/research").then((m) => ({ default: m.Briefs })),
);
const Exports = lazy(() =>
  import("./features/production").then((m) => ({ default: m.Exports })),
);
const Review = lazy(() =>
  import("./features/production").then((m) => ({ default: m.Review })),
);
const Generation = lazy(() =>
  import("./features/generation").then((m) => ({ default: m.Generation })),
);
const Logs = lazy(() =>
  import("./features/system").then((m) => ({ default: m.Logs })),
);
const Settings = lazy(() =>
  import("./features/system").then((m) => ({ default: m.Settings })),
);

const navigation = [
  { page: "dashboard", title: "Dashboard", group: "", icon: SquaresFourIcon },
  {
    page: "opportunities",
    title: "Opportunities",
    group: "Research",
    icon: MagnifyingGlassIcon,
  },
  {
    page: "briefs",
    title: "Commercial briefs",
    group: "Production",
    icon: BookOpenIcon,
  },
  {
    page: "generation",
    title: "Image generation",
    group: "",
    icon: SparkleIcon,
  },
  { page: "review", title: "Review queue", group: "", icon: ImageIcon },
  {
    page: "exports",
    title: "Adobe exports",
    group: "Delivery",
    icon: TrayIcon,
  },
  { page: "logs", title: "Provider logs", group: "System", icon: ListIcon },
  { page: "settings", title: "Settings", group: "", icon: GearSixIcon },
] as const;

export default function App() {
  const theme = useTheme();
  const { page, params } = useRoute();
  const query = useQueryClient();
  const { busy, notify, run } = useActions();
  const [demo, setDemo] = useState(isDemoMode);
  const workspace = useQuery({
    queryKey: ["workspace", demo],
    queryFn: desktop.snapshot,
    retry: false,
  });
  const [collapsed, setCollapsed] = useState(false);
  const [palette, setPalette] = useState(false);
  const [command, setCommand] = useState("");
  const [selections, setSelections] = useState<
    Record<"briefs" | "review" | "exports", Set<string>>
  >({ briefs: new Set(), review: new Set(), exports: new Set() });
  function select(
    kind: keyof typeof selections,
    ids: string[],
    checked: boolean,
  ) {
    setSelections((current) => ({
      ...current,
      [kind]: toggleSelection(current[kind], ids, checked),
    }));
  }
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void onWorkspaceChanged(() => {
      void query.invalidateQueries({ queryKey: ["workspace"] });
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [query]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((value) => !value);
        setCommand("");
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  const data = workspace.data;
  const activeJobs =
    data?.jobs.filter((j) => j.status === "running" || j.status === "queued")
      .length ?? 0;
  const previousJobs = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (!data) return;
    const previous = previousJobs.current;
    if (previous)
      for (const job of data.jobs) {
        const old = previous.get(job.id);
        if (
          (!old || ["queued", "running"].includes(old)) &&
          !["queued", "running"].includes(job.status)
        ) {
          notify(
            `${job.operation}: ${job.message}`,
            job.status === "succeeded"
              ? "success"
              : job.status === "failed"
                ? "error"
                : "warning",
            job.status === "succeeded" ? undefined : job.id,
          );
        }
      }
    previousJobs.current = new Map(
      data.jobs.map((job) => [job.id, job.status]),
    );
  }, [data, notify]);
  function render() {
    if (!data) return null;
    switch (page) {
      case "opportunities":
        return <Opportunities data={data} params={params} />;
      case "briefs":
        return (
          <Briefs
            data={data}
            params={params}
            selected={selections.briefs}
            onSelect={(ids, checked) => select("briefs", ids, checked)}
          />
        );
      case "generation":
        return (
          <Generation
            data={data}
            params={params}
            selectedBriefs={selections.briefs}
          />
        );
      case "review":
        return (
          <Review
            data={data}
            params={params}
            selected={selections.review}
            onSelect={(ids, checked) => select("review", ids, checked)}
          />
        );
      case "exports":
        return (
          <Exports
            data={data}
            params={params}
            selected={selections.exports}
            onSelect={(ids, checked) => select("exports", ids, checked)}
          />
        );
      case "logs":
        return <Logs data={data} params={params} />;
      case "settings":
        return <Settings data={data} params={params} />;
      default:
        return <Dashboard data={data} />;
    }
  }
  return (
    <div className={`app ${collapsed ? "sidebar-collapsed" : ""}`}>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <aside className="sidebar">
        <button
          className="brand"
          aria-label="Thoock dashboard"
          onClick={() => navigate("dashboard")}
        >
          <span>
            <ApertureIcon size={25} weight="bold" />
          </span>
          <strong>Thoock</strong>
        </button>
        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <div key={item.page}>
              {item.group && <p className="nav-group">{item.group}</p>}
              <button
                aria-current={page === item.page ? "page" : undefined}
                aria-label={item.title}
                className={`nav-item ${page === item.page ? "active" : ""}`}
                onClick={() => navigate(item.page)}
                title={collapsed ? item.title : undefined}
              >
                <item.icon
                  size={21}
                  weight={page === item.page ? "bold" : "regular"}
                />
                <span>{item.title}</span>
                {item.page === "review" &&
                  !!data?.assets.filter((a) => a.decision === "pending")
                    .length && (
                    <small>
                      {
                        data.assets.filter((a) => a.decision === "pending")
                          .length
                      }
                    </small>
                  )}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <DatabaseIcon size={22} weight="light" />
          <div>
            <strong>{demo ? "Demo workspace" : "Local workspace"}</strong>
            <span>
              {demo
                ? "Sample records and illustrations"
                : "Your files stay with you"}
            </span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <Button
            variant="ghost"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <SidebarSimpleIcon size={20} />
          </Button>
          <button
            className="command-trigger"
            onClick={() => {
              setPalette(true);
              setCommand("");
            }}
          >
            <MagnifyingGlassIcon size={18} />
            <span>Search or run a command…</span>
            <kbd>
              {/Mac/.test(navigator.platform) ? (
                <CommandIcon size={12} />
              ) : (
                "Ctrl"
              )}{" "}
              K
            </kbd>
          </button>
          <div className="topbar-status">
            <Button
              variant="ghost"
              aria-label={`Switch to ${theme.resolved === "dark" ? "light" : "dark"} mode`}
              onClick={() =>
                theme.setPreference(
                  theme.resolved === "dark" ? "light" : "dark",
                )
              }
            >
              {theme.resolved === "dark" ? (
                <SunIcon size={20} />
              ) : (
                <MoonIcon size={20} />
              )}
            </Button>
            <Button
              aria-pressed={demo}
              onClick={() => {
                previousJobs.current = null;
                setSelections({
                  briefs: new Set(),
                  review: new Set(),
                  exports: new Set(),
                });
                setDemoMode(!demo);
                setDemo(!demo);
              }}
            >
              {demo ? "Local data" : "Demo data"}
            </Button>
            {data?.restartRequired ? (
              <Badge>Restart required</Badge>
            ) : busy || activeJobs ? (
              <button
                className="job-status"
                onClick={() => navigate("generation", { view: "history" })}
              >
                <span className="status-dot working" />
                {activeJobs ? `${activeJobs} running` : "Working locally"}
              </button>
            ) : (
              <span className="local-status">
                <span className="status-dot" />
                {demo ? "Demo mode" : "Local mode"}
              </span>
            )}
            <Button
              variant="ghost"
              aria-label="Open settings"
              onClick={() => navigate("settings")}
            >
              <GearSixIcon size={20} />
            </Button>
          </div>
        </header>
        {data?.restartRequired && (
          <div className="replacement-banner" role="status">
            Workspace replacement staged. Quit and reopen Thoock to activate it.
            Editing is paused.{" "}
            <Button
              variant="ghost"
              onClick={() => run(() => desktop.restartApp())}
            >
              Restart now
            </Button>
          </div>
        )}
        {demo && (
          <div className="preview-banner" role="status">
            Demo workspace · sample illustrations and records. Explore filters,
            pagination, selections, and editors. Switch to Local data to save
            changes or run provider work.
          </div>
        )}
        {interfacePreview && !demo && (
          <div className="preview-banner">
            Interface preview. Open the desktop app to save data and use local
            files.
          </div>
        )}
        <main
          id="main-content"
          inert={data?.restartRequired || undefined}
          className="main-content"
          tabIndex={-1}
          key={page}
        >
          {workspace.isPending ? (
            <div className="loading-state" aria-label="Opening workspace">
              <div className="skeleton heading-skeleton" />
              <div className="skeleton panel-skeleton" />
              <div className="skeleton panel-skeleton" />
            </div>
          ) : workspace.isError ? (
            <section className="panel">
              <Empty
                icon={<DatabaseIcon size={32} />}
                title="The workspace could not be opened"
                description={errorMessage(workspace.error).message}
                action={
                  <div className="heading-actions">
                    <Button
                      variant="primary"
                      onClick={() => workspace.refetch()}
                    >
                      Try again
                    </Button>
                    <Button
                      onClick={() =>
                        run(
                          () => desktop.chooseWorkspace(),
                          (selected) =>
                            selected
                              ? "Workspace selected. Restart Thoock to open it."
                              : null,
                        )
                      }
                    >
                      Choose existing workspace
                    </Button>
                    <Button onClick={() => run(() => desktop.restartApp())}>
                      Restart app
                    </Button>
                  </div>
                }
              />
            </section>
          ) : (
            <Suspense
              fallback={
                <div
                  className="skeleton panel-skeleton"
                  aria-label="Loading page"
                />
              }
            >
              <div key={page} className="page-view">
                {render()}
              </div>
            </Suspense>
          )}
        </main>
      </div>
      <Modal
        open={palette}
        onClose={() => setPalette(false)}
        title="Command palette"
        description="Jump to a page in your workspace."
      >
        <div className="search-input palette-search">
          <MagnifyingGlassIcon size={20} />
          <input
            autoFocus
            placeholder="Search pages…"
            aria-label="Search commands"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
          />
        </div>
        <div className="palette-results">
          {navigation
            .filter((n) =>
              n.title.toLowerCase().includes(command.toLowerCase()),
            )
            .map((n) => (
              <button
                key={n.page}
                onClick={() => {
                  navigate(n.page);
                  setPalette(false);
                }}
              >
                <n.icon size={22} />
                <span>{n.title}</span>
                <ArrowRightIcon size={16} />
              </button>
            ))}
          {!navigation.some((n) =>
            n.title.toLowerCase().includes(command.toLowerCase()),
          ) && <p>No matching commands.</p>}
        </div>
      </Modal>
    </div>
  );
}
function Dashboard({ data }: { data: Snapshot }) {
  const pending = data.assets.filter((a) => a.decision === "pending").length;
  const approved = data.assets.filter((a) => a.decision === "approved").length;
  const metrics: {
    label: string;
    value: number;
    description: string;
    icon: typeof MagnifyingGlassIcon;
    page: Page;
  }[] = [
    {
      label: "Opportunities",
      value: data.opportunities.length,
      description: "Saved research topics",
      icon: MagnifyingGlassIcon,
      page: "opportunities",
    },
    {
      label: "Commercial briefs",
      value: data.briefs.length,
      description: "Ready for production",
      icon: BookOpenIcon,
      page: "briefs",
    },
    {
      label: "Awaiting review",
      value: pending,
      description: "Needs your decision",
      icon: ImageIcon,
      page: "review",
    },
    {
      label: "Ready to export",
      value: approved,
      description: "Approved images",
      icon: CheckCircleIcon,
      page: "exports",
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Creative production</h1>
          <p>Move research into submission-ready image packages.</p>
        </div>
        <div className="heading-actions">
          <Button onClick={() => navigate("opportunities")}>
            <MagnifyingGlassIcon size={17} />
            Research topics
          </Button>
          <Button
            variant="primary"
            onClick={() => navigate("briefs", { new: "1" })}
          >
            <SparkleIcon size={17} />
            Create brief
          </Button>
        </div>
      </div>
      <div className="metric-grid">
        {metrics.map((m) => (
          <button
            className="metric-card"
            key={m.label}
            onClick={() => navigate(m.page)}
          >
            <span className="metric-icon">
              <m.icon size={25} />
            </span>
            <div>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <small>{m.description}</small>
            </div>
            <ArrowRightIcon className="metric-arrow" size={17} />
          </button>
        ))}
      </div>
      <section className="panel pipeline-panel">
        <header>
          <h2>Production pipeline</h2>
          <p>From a useful topic to a finished package.</p>
        </header>
        <div className="pipeline">
          {[
            {
              label: "Research",
              count: data.opportunities.length,
              page: "opportunities",
              icon: MagnifyingGlassIcon,
            },
            {
              label: "Briefs",
              count: data.briefs.length,
              page: "briefs",
              icon: BookOpenIcon,
            },
            {
              label: "Image candidates",
              count: data.assets.length,
              page: "generation",
              icon: ImageIcon,
            },
            {
              label: "Export ready",
              count: approved,
              page: "exports",
              icon: CheckCircleIcon,
            },
          ].map((step, i) => (
            <button
              key={step.label}
              onClick={() => navigate(step.page as Page)}
            >
              <span className="pipeline-icon">
                <step.icon size={22} />
              </span>
              <small>0{i + 1}</small>
              <h3>{step.label}</h3>
              <strong>{step.count}</strong>
              {i < 3 && <ArrowRightIcon className="pipeline-arrow" size={22} />}
            </button>
          ))}
        </div>
      </section>
      <div className="dashboard-bottom">
        <section>
          <div className="section-heading">
            <h2>Recent activity</h2>
            <Button
              variant="ghost"
              onClick={() => navigate("generation", { view: "history" })}
            >
              View history
              <ArrowRightIcon size={16} />
            </Button>
          </div>
          <Table
            rows={data.jobs.slice(0, 5)}
            searchText={(j) => `${j.operation} ${j.status}`}
            empty={{
              title: "Your workspace is ready",
              description:
                "Start with a research topic or import images from your existing workflow.",
              action: (
                <Button onClick={() => navigate("opportunities", { new: "1" })}>
                  Add an opportunity
                  <ArrowRightIcon size={16} />
                </Button>
              ),
            }}
            columns={[
              {
                label: "Operation",
                render: (j) => <strong>{j.operation}</strong>,
              },
              {
                label: "Status",
                render: (j) => <Badge tone={j.status}>{j.status}</Badge>,
              },
              { label: "Created", render: (j) => date(j.createdAt) },
            ]}
          />
        </section>
        <section className="panel latest-images">
          <header>
            <h2>Recent images</h2>
            <Button variant="ghost" onClick={() => navigate("review")}>
              View all
              <ArrowRightIcon size={16} />
            </Button>
          </header>
          {data.assets.length ? (
            <div className="recent-grid">
              {data.assets.slice(0, 4).map((a) => (
                <button
                  key={a.id}
                  onClick={() => navigate("review", { asset: a.id })}
                >
                  <img
                    src={localImage(a.thumbnail)}
                    alt={a.title || a.name}
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          ) : (
            <Empty
              icon={<FolderOpenIcon size={32} />}
              title="An open canvas"
              description="Your latest image candidates will appear here."
              action={
                <Button onClick={() => navigate("generation")}>
                  Import images
                </Button>
              }
            />
          )}
        </section>
      </div>
    </>
  );
}
