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
    <form onSubmit={submit} className="border-t border-[var(--amio-border)] p-4">
      <div className="mx-auto max-w-4xl rounded-2xl border border-[var(--amio-border)] bg-[var(--amio-surface)] p-2 focus-within:border-[var(--amio-accent-to)]">
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
          className="min-h-14 w-full resize-none bg-transparent px-3 py-2 text-sm text-[var(--amio-text)] placeholder:text-[var(--amio-text-muted)] focus:outline-none"
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
                className="cursor-pointer appearance-none rounded-lg border border-[var(--amio-border)] bg-[var(--amio-surface-muted)] py-2 pl-3 pr-8 text-xs font-medium text-[var(--amio-text)] outline-none hover:border-[var(--amio-accent-to)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {AGENT_MODEL_IDS.map((modelId) => (
                  <option key={modelId} value={modelId}>
                    {modelId}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--amio-text-muted)]">
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
                className="cursor-pointer appearance-none rounded-lg border border-[var(--amio-border)] bg-[var(--amio-surface-muted)] py-2 pl-3 pr-8 text-xs font-medium text-[var(--amio-text)] outline-none hover:border-[var(--amio-accent-to)] disabled:cursor-not-allowed disabled:opacity-50"
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
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--amio-text-muted)]">
                ▼
              </span>
            </label>
          </div>
          <button
            type="submit"
            disabled={disabled || !message.trim()}
            className="rounded-xl bg-gradient-to-r from-[var(--amio-accent-from)] to-[var(--amio-accent-to)] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Odeslat
          </button>
        </div>
      </div>
    </form>
  );
}
