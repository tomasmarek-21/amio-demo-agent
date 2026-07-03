import { useState, type FormEvent } from "react";
import {
  AGENT_MODEL_IDS,
  type AgentModel,
  type ReasoningEffort,
} from "@/features/agent/models";

interface Props {
  disabled: boolean;
  model: AgentModel;
  reasoningEffort: ReasoningEffort;
  reasoningOptions: readonly ReasoningEffort[];
  onModelChange: (model: AgentModel) => void;
  onReasoningChange: (effort: ReasoningEffort) => void;
  onSubmit: (message: string) => Promise<void>;
}

export function MessageComposer({
  disabled,
  model,
  reasoningEffort,
  reasoningOptions,
  onModelChange,
  onReasoningChange,
  onSubmit,
}: Props) {
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = message.trim();
    if (!value || disabled) return;
    setMessage("");
    await onSubmit(value);
  }

  return (
    <form onSubmit={submit} className="border-t border-slate-800 p-4">
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-700 bg-slate-900 p-2 focus-within:border-emerald-400">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Zeptejte se na PostHog nebo Stripe…"
          rows={2}
          className="min-h-14 w-full resize-none bg-transparent px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none"
        />
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label className="relative">
              <span className="sr-only">Model</span>
              <select
                value={model}
                disabled={disabled}
                onChange={(event) =>
                  onModelChange(event.target.value as AgentModel)
                }
                className="cursor-pointer appearance-none rounded-lg border border-slate-700 bg-slate-950 py-2 pl-3 pr-8 text-xs font-medium text-slate-200 outline-none hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {AGENT_MODEL_IDS.map((modelId) => (
                  <option key={modelId} value={modelId}>
                    {modelId}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">
                ▼
              </span>
            </label>
            <label className="relative">
              <span className="sr-only">Reasoning effort</span>
              <select
                value={reasoningOptions.length ? reasoningEffort : ""}
                disabled={disabled || reasoningOptions.length === 0}
                onChange={(event) =>
                  onReasoningChange(event.target.value as ReasoningEffort)
                }
                className="cursor-pointer appearance-none rounded-lg border border-slate-700 bg-slate-950 py-2 pl-3 pr-8 text-xs font-medium text-slate-200 outline-none hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {reasoningOptions.length === 0 ? (
                  <option value="">reasoning: nepodporováno</option>
                ) : (
                  reasoningOptions.map((effort) => (
                    <option key={effort} value={effort}>
                      reasoning: {effort}
                    </option>
                  ))
                )}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">
                ▼
              </span>
            </label>
          </div>
          <button
            type="submit"
            disabled={disabled || !message.trim()}
            className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Odeslat
          </button>
        </div>
      </div>
    </form>
  );
}
