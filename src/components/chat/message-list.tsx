import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SessionDetail } from "@/features/chat/types";

interface Props {
  detail: SessionDetail | null;
  pendingUser: string | null;
  streamingText: string;
  status: string | null;
  error: string | null;
}

export function MessageList({
  detail,
  pendingUser,
  streamingText,
  status,
  error,
}: Props) {
  const empty =
    !detail?.messages.length && !pendingUser && !streamingText && !error;

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        {empty && (
          <div className="mt-24 text-center">
            <h2 className="text-xl font-medium text-white">
              Zeptejte se na data v PostHogu.
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Návštěvnost, landing pages, cesty uživatelů nebo místa odchodu.
            </p>
          </div>
        )}
        {detail?.messages.map((message) => (
          <article
            key={message.id}
            className={
              message.role === "user"
                ? "ml-auto max-w-[80%] rounded-2xl bg-emerald-500 px-4 py-3 text-slate-950"
                : "max-w-none rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4 text-slate-100"
            }
          >
            {message.role === "assistant" ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            ) : (
              message.content
            )}
          </article>
        ))}
        {pendingUser && (
          <article className="ml-auto max-w-[80%] rounded-2xl bg-emerald-500 px-4 py-3 text-slate-950">
            {pendingUser}
          </article>
        )}
        {(streamingText || status) && (
          <article className="rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4 text-slate-100">
            {streamingText ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {streamingText}
              </ReactMarkdown>
            ) : (
              <p className="text-sm text-slate-400">{status}</p>
            )}
          </article>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-950 px-4 py-3 text-red-200">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
