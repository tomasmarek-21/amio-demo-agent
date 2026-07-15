"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronDown, ChevronRight } from "lucide-react";
import { BASE_PATH } from "@/lib/base-path";
import { getSession } from "@/lib/chat-api";
import { MessageList } from "@/components/chat/message-list";
import type { SessionDetail } from "@/features/chat/types";

type WorkflowSummary = {
  id: string;
  name: string;
  n8nWorkflowUrl: string | null;
  capabilities: string[];
};

type WorkflowDetail = WorkflowSummary & {
  systemPromptText: string | null;
};

type WorkflowSession = {
  id: string;
  title: string;
  workflowId: string | null;
  createdAt: string;
  updatedAt: string;
};

type View =
  | { type: "list" }
  | { type: "workflow"; workflowId: string }
  | { type: "run"; sessionId: string; workflowId: string };

export function AutomatedTab() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>({ type: "list" });

  const [workflowDetail, setWorkflowDetail] = useState<WorkflowDetail | null>(null);
  const [workflowSessions, setWorkflowSessions] = useState<WorkflowSession[]>([]);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [systemPromptOpen, setSystemPromptOpen] = useState(false);
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);

  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  useEffect(() => {
    fetch(`${BASE_PATH}/api/scheduled-runs`)
      .then((r) => r.json())
      .then((d: { workflows: WorkflowSummary[] }) => setWorkflows(d.workflows ?? []))
      .catch(() => setWorkflows([]))
      .finally(() => setLoading(false));
  }, []);

  async function openWorkflow(id: string) {
    setView({ type: "workflow", workflowId: id });
    setWorkflowDetail(null);
    setWorkflowSessions([]);
    setSystemPromptOpen(false);
    setCapabilitiesOpen(false);
    setWorkflowLoading(true);
    try {
      const res = await fetch(`${BASE_PATH}/api/scheduled-runs?workflowId=${encodeURIComponent(id)}`);
      const data: { workflow: WorkflowDetail; sessions: WorkflowSession[] } = await res.json();
      setWorkflowDetail(data.workflow ?? null);
      setWorkflowSessions(data.sessions ?? []);
    } catch {
      // ignore
    }
    setWorkflowLoading(false);
  }

  async function openRun(sessionId: string, workflowId: string) {
    setView({ type: "run", sessionId, workflowId });
    setSessionDetail(null);
    setSessionLoading(true);
    try {
      const detail = await getSession(sessionId);
      setSessionDetail(detail);
    } catch {
      // ignore
    }
    setSessionLoading(false);
  }

  // ── Run detail ────────────────────────────────────────────────────────────
  if (view.type === "run") {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex flex-shrink-0 items-center border-b border-[var(--amio-border)] bg-white/70 px-5 py-3 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => {
              setView({ type: "workflow", workflowId: view.workflowId });
              openWorkflow(view.workflowId);
            }}
            className="text-sm font-semibold text-[var(--amio-accent)] hover:opacity-75"
          >
            ← Back to runs
          </button>
        </div>
        {sessionLoading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--amio-text-muted)]">
            Loading run…
          </div>
        ) : (
          <MessageList
            detail={sessionDetail}
            pendingUser={null}
            streamingText=""
            status={null}
            error={null}
            streamingTraces={[]}
          />
        )}
      </div>
    );
  }

  // ── Workflow detail ───────────────────────────────────────────────────────
  if (view.type === "workflow") {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex flex-shrink-0 items-center border-b border-[var(--amio-border)] bg-white/70 px-5 py-3 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setView({ type: "list" })}
            className="text-sm font-semibold text-[var(--amio-accent)] hover:opacity-75"
          >
            ← All workflows
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="mx-auto max-w-3xl">
            {workflowLoading ? (
              <div className="py-16 text-center text-sm text-[var(--amio-text-muted)]">Loading…</div>
            ) : workflowDetail ? (
              <>
                {/* Workflow header */}
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-[var(--amio-text)]">{workflowDetail.name}</h2>
                  {workflowDetail.n8nWorkflowUrl && (
                    <a
                      href={workflowDetail.n8nWorkflowUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--amio-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--amio-text-muted)] transition hover:border-[rgba(120,95,255,0.4)] hover:text-[var(--amio-accent)]"
                    >
                      Open in n8n <ArrowUpRight size={13} />
                    </a>
                  )}
                </div>

                {/* System prompt accordion */}
                {workflowDetail.systemPromptText && (
                  <div className="mb-3 overflow-hidden rounded-xl border border-[var(--amio-border)] bg-white">
                    <button
                      type="button"
                      onClick={() => setSystemPromptOpen((v) => !v)}
                      className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-[var(--amio-text)] hover:bg-[var(--amio-surface-muted)]"
                    >
                      System prompt
                      {systemPromptOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    {systemPromptOpen && (
                      <div className="border-t border-[var(--amio-border)] px-4 py-4">
                        <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--amio-text-muted)]">
                          {workflowDetail.systemPromptText}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {/* Capabilities accordion */}
                <div className="mb-6 overflow-hidden rounded-xl border border-[var(--amio-border)] bg-white">
                  <button
                    type="button"
                    onClick={() => setCapabilitiesOpen((v) => !v)}
                    className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-[var(--amio-text)] hover:bg-[var(--amio-surface-muted)]"
                  >
                    Capabilities
                    {capabilitiesOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  {capabilitiesOpen && (
                    <div className="flex flex-wrap gap-2 border-t border-[var(--amio-border)] px-4 py-3">
                      {workflowDetail.capabilities.map((cap) => (
                        <span
                          key={cap}
                          className="rounded-full bg-[var(--amio-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--amio-accent)]"
                        >
                          {cap}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Run history */}
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--amio-text-muted)]">
                  Run history
                </p>
                {workflowSessions.length === 0 ? (
                  <div className="rounded-xl border border-[var(--amio-border)] bg-white px-4 py-10 text-center text-sm text-[var(--amio-text-muted)]">
                    No automated runs yet for this workflow.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {workflowSessions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => openRun(s.id, view.workflowId)}
                        className="group flex items-center justify-between rounded-xl border border-[var(--amio-border)] bg-white px-4 py-3 text-left transition hover:border-[rgba(120,95,255,0.4)] hover:bg-[var(--amio-surface-muted)]"
                      >
                        <span className="text-sm font-medium text-[var(--amio-text)]">{s.title}</span>
                        <span className="ml-4 flex-shrink-0 text-xs text-[var(--amio-text-muted)]">
                          {formatDate(s.updatedAt)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // ── Workflow list ─────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--amio-text-muted)]">
          Automated
        </p>
        <h2 className="mb-5 text-xl font-bold text-[var(--amio-text)]">Scheduled workflows</h2>

        {loading ? (
          <div className="py-16 text-center text-sm text-[var(--amio-text-muted)]">
            Loading workflows…
          </div>
        ) : workflows.length === 0 ? (
          <div className="rounded-2xl border border-[var(--amio-border)] bg-white px-5 py-10 text-center text-sm text-[var(--amio-text-muted)]">
            No workflows configured.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {workflows.map((wf) => (
              <button
                key={wf.id}
                type="button"
                onClick={() => void openWorkflow(wf.id)}
                className="group flex items-center justify-between rounded-2xl border border-[var(--amio-border)] bg-white px-5 py-4 text-left shadow-sm transition hover:border-[rgba(120,95,255,0.35)] hover:shadow-md"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--amio-text)]">{wf.name}</p>
                  <p className="mt-0.5 text-xs text-[var(--amio-text-muted)]">
                    {wf.capabilities.join(" · ")}
                  </p>
                </div>
                <div className="ml-4 flex flex-shrink-0 items-center gap-2">
                  {wf.n8nWorkflowUrl && (
                    <a
                      href={wf.n8nWorkflowUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-lg border border-[var(--amio-border)] p-1.5 text-[var(--amio-text-muted)] transition hover:border-[rgba(120,95,255,0.4)] hover:text-[var(--amio-accent)]"
                      title="Open in n8n"
                    >
                      <ArrowUpRight size={14} />
                    </a>
                  )}
                  <ChevronRight
                    size={16}
                    className="text-[var(--amio-text-muted)] transition group-hover:text-[var(--amio-accent)]"
                  />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
