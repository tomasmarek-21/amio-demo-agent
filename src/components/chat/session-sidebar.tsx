"use client";

import { useState } from "react";
import type { ChatSession } from "@/features/chat/types";
import type {
  ConnectorHealth,
  ConnectorId,
  ConnectorStatus,
} from "@/features/integrations/types";

interface Props {
  sessions: ChatSession[];
  activeId: string | null;
  connectors: ConnectorHealth[] | null;
  onRefreshIntegrations: () => void;
  onConnectNotion: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

export function SessionSidebar({
  sessions,
  activeId,
  connectors,
  onRefreshIntegrations,
  onConnectNotion,
  onSelect,
  onCreate,
}: Props) {
  const [expandedConnector, setExpandedConnector] =
    useState<ConnectorId | null>(null);

  return (
    <aside className="flex w-full flex-col border-b border-[var(--amio-border)] bg-[var(--amio-surface)] p-4 md:w-72 md:border-r md:border-b-0">
      <div className="mb-5">
        <p className="text-xs font-semibold tracking-[0.2em] text-[var(--amio-accent)] uppercase">
          AMIO
        </p>
        <h1 className="mt-1 text-lg font-semibold text-[var(--amio-text)]">
          Analytics Agent
        </h1>
      </div>
      <section className="mb-3 rounded-xl border border-[var(--amio-border)] bg-[var(--amio-surface-muted)] p-2">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-xs font-medium text-[var(--amio-text-muted)]">Connectors</p>
          <button
            type="button"
            onClick={onRefreshIntegrations}
            className="text-xs text-[var(--amio-accent)] hover:opacity-75"
          >
            refresh
          </button>
        </div>
        <div className="space-y-1.5">
          {(connectors ?? CONNECTOR_PLACEHOLDERS).map((connector) => (
            <div key={connector.id}>
              <button
                type="button"
                onClick={() =>
                  setExpandedConnector((current) =>
                    current === connector.id ? null : connector.id,
                  )
                }
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-[var(--amio-text)] hover:bg-[var(--amio-surface-muted)]"
              >
                <ConnectorLogo id={connector.id} />
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-2.5 rounded-full ${statusDotClass(
                    connector.status,
                  )}`}
                />
                <span className="min-w-0 flex-1 truncate">
                  {connector.name}
                </span>
                <span className="text-xs text-[var(--amio-text-muted)]">
                  {statusLabel(connector.status)}
                </span>
              </button>
              {expandedConnector === connector.id && (
                <div className="mx-2 mb-2 rounded-lg border border-[var(--amio-border)] bg-[var(--amio-surface-muted)] p-2 text-xs text-[var(--amio-text-muted)]">
                  <p>{connector.message}</p>
                  <p className="mt-1">
                    Configured: {connector.configured ? "yes" : "no"}
                  </p>
                  <p className="mt-1">
                    Last checked:{" "}
                    {connector.lastCheckedAt
                      ? new Date(connector.lastCheckedAt).toLocaleTimeString()
                      : "—"}
                  </p>
                  {connector.action === "oauth" && !connector.connected && (
                    <button
                      type="button"
                      onClick={onConnectNotion}
                      className="mt-2 rounded-md bg-gradient-to-r from-[var(--amio-accent-from)] to-[var(--amio-accent-to)] px-2 py-1 font-medium text-white hover:opacity-90"
                    >
                      Reconnect Notion
                    </button>
                  )}
                  {connector.action === "env" && !connector.connected && (
                    <p className="mt-2 text-[var(--amio-text-muted)]">
                      Update `.env.local` and restart the local server.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      <button
        type="button"
        onClick={onCreate}
        className="rounded-lg bg-gradient-to-r from-[var(--amio-accent-from)] to-[var(--amio-accent-to)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 focus:ring-2 focus:ring-[var(--amio-accent-to)] focus:outline-none"
      >
        New conversation
      </button>
      <nav className="mt-4 flex gap-2 overflow-x-auto md:flex-col">
        {sessions.map((session) => (
          <button
            type="button"
            key={session.id}
            aria-label={`Open conversation ${session.title}`}
            onClick={() => onSelect(session.id)}
            className={`min-w-40 rounded-lg px-3 py-2 text-left text-sm ${
              activeId === session.id
                ? "bg-[var(--amio-surface-muted)] text-[var(--amio-text)]"
                : "text-[var(--amio-text-muted)] hover:bg-[var(--amio-surface-muted)]"
            }`}
          >
            {session.title}
          </button>
        ))}
      </nav>
    </aside>
  );
}

const CONNECTOR_PLACEHOLDERS: ConnectorHealth[] = [
  placeholder("amio", "AMIO Conversations"),
  placeholder("notion", "Notion"),
  placeholder("posthog", "PostHog"),
  placeholder("stripe", "Stripe"),
  placeholder("supabase", "Supabase"),
];

function placeholder(id: ConnectorId, name: string): ConnectorHealth {
  return {
    id,
    name,
    status: "checking",
    configured: false,
    connected: false,
    message: "Checking connection…",
    action: id === "notion" ? "oauth" : "env",
    lastCheckedAt: "",
  };
}

function statusDotClass(status: ConnectorStatus) {
  if (status === "connected") return "bg-emerald-400";
  if (status === "checking") return "bg-slate-500";
  if (status === "misconfigured") return "bg-amber-400";
  return "bg-red-400";
}

function statusLabel(status: ConnectorStatus) {
  if (status === "connected") return "on";
  if (status === "checking") return "…";
  if (status === "misconfigured") return "config";
  return "off";
}

function ConnectorLogo({ id }: { id: ConnectorId }) {
  const classes =
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white shadow-sm";
  if (id === "notion") {
    return <span className={`${classes} bg-white text-slate-950`}>N</span>;
  }
  if (id === "posthog") {
    return <span className={`${classes} bg-orange-500`}>PH</span>;
  }
  if (id === "stripe") {
    return <span className={`${classes} bg-indigo-500`}>S</span>;
  }
  if (id === "supabase") {
    return <span className={`${classes} bg-emerald-500`}>SB</span>;
  }
  return (
    <span className={`${classes} bg-gradient-to-r from-[var(--amio-accent-from)] to-[var(--amio-accent-to)]`}>
      AC
    </span>
  );
}
