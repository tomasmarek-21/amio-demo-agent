"use client";

import { useState } from "react";
import type { ToolTrace } from "@/features/chat/types";

export function ToolTracePanel({ traces }: { traces: ToolTrace[] }) {
  const [open, setOpen] = useState(false);
  if (!traces.length) return null;

  return (
    <div className="mt-3 border-t border-[var(--amio-border)] pt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="text-xs font-medium text-[var(--amio-text-muted)] hover:text-[var(--amio-accent)]"
      >
        How I got this answer ({traces.length})
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {traces.map((trace) => (
            <section
              key={trace.id}
              className="rounded-lg border border-[var(--amio-border)] bg-[var(--amio-surface-muted)] p-3"
            >
              <div className="flex items-center justify-between gap-3 text-xs">
                <strong className="text-[var(--amio-text)]">{trace.toolName}</strong>
                <span
                  className={
                    trace.status === "completed"
                      ? "text-[var(--amio-accent)]"
                      : "text-red-500"
                  }
                >
                  {trace.status}
                  {trace.durationMs !== null ? ` · ${trace.durationMs} ms` : ""}
                </span>
              </div>
              <p className="mt-3 text-[11px] text-[var(--amio-text-muted)]">Arguments</p>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-[var(--amio-text)]">
                {pretty(trace.sanitizedArguments)}
              </pre>
              {trace.resultSummary && (
                <>
                  <p className="mt-3 text-[11px] text-[var(--amio-text-muted)]">
                    Result summary
                  </p>
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-[var(--amio-text)]">
                    {pretty(trace.resultSummary)}
                  </pre>
                </>
              )}
              {trace.error && (
                <p className="mt-2 text-xs text-red-500">{trace.error}</p>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function pretty(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
