"use client";

import { useState } from "react";
import type { ToolTrace } from "@/features/chat/types";

export function ToolTracePanel({ traces }: { traces: ToolTrace[] }) {
  const [open, setOpen] = useState(false);
  if (!traces.length) return null;

  return (
    <div className="mt-3 border-t border-slate-800 pt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="text-xs font-medium text-slate-400 hover:text-emerald-300"
      >
        Jak jsem k tomu došel ({traces.length})
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {traces.map((trace) => (
            <section
              key={trace.id}
              className="rounded-lg border border-slate-700 bg-slate-950 p-3"
            >
              <div className="flex items-center justify-between gap-3 text-xs">
                <strong className="text-slate-200">{trace.toolName}</strong>
                <span
                  className={
                    trace.status === "completed"
                      ? "text-emerald-400"
                      : "text-red-400"
                  }
                >
                  {trace.status}
                  {trace.durationMs !== null ? ` · ${trace.durationMs} ms` : ""}
                </span>
              </div>
              <p className="mt-3 text-[11px] text-slate-500">Argumenty</p>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-300">
                {pretty(trace.sanitizedArguments)}
              </pre>
              {trace.resultSummary && (
                <>
                  <p className="mt-3 text-[11px] text-slate-500">
                    Shrnutí výsledku
                  </p>
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-300">
                    {pretty(trace.resultSummary)}
                  </pre>
                </>
              )}
              {trace.error && (
                <p className="mt-2 text-xs text-red-300">{trace.error}</p>
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
