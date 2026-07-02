import { useState, type FormEvent } from "react";

interface Props {
  disabled: boolean;
  onSubmit: (message: string) => Promise<void>;
}

export function MessageComposer({ disabled, onSubmit }: Props) {
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
      <div className="mx-auto flex max-w-4xl gap-3">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Zeptejte se na PostHog…"
          rows={2}
          className="min-h-14 flex-1 resize-none rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={disabled || !message.trim()}
          className="self-end rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Odeslat
        </button>
      </div>
    </form>
  );
}
