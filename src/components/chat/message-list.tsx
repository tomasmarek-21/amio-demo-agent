import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SessionDetail, ToolTrace } from "@/features/chat/types";
import { ToolTracePanel } from "./tool-trace";

interface Props {
  detail: SessionDetail | null;
  pendingUser: string | null;
  streamingText: string;
  status: string | null;
  error: string | null;
  streamingTraces: ToolTrace[];
}

export function MessageList({
  detail,
  pendingUser,
  streamingText,
  status,
  error,
  streamingTraces,
}: Props) {
  const empty =
    !detail?.messages.length && !pendingUser && !streamingText && !error;

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        {empty && (
          <div className="mt-24 text-center">
            <h2 className="text-xl font-medium text-[var(--amio-text)]">
              Ask something about AMIO.
            </h2>
            <p className="mt-2 text-sm text-[var(--amio-text-muted)]">
              Revenue, customers, website traffic, or product conversations.
            </p>
          </div>
        )}
        {detail?.messages.map((message) => {
          const traces =
            detail.evidence.find(
              (item) => item.assistantMessageId === message.id,
            )?.traces ?? [];
          return (
            <article
              key={message.id}
              className={
                message.role === "user"
                  ? "ml-auto max-w-[80%] rounded-2xl bg-gradient-to-r from-[var(--amio-accent-from)] to-[var(--amio-accent-to)] px-4 py-3 text-white"
                  : "max-w-none rounded-2xl border border-[var(--amio-border)] bg-[var(--amio-surface)] px-5 py-4 text-[var(--amio-text)]"
              }
            >
              {message.role === "assistant" ? (
                <>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                  <ToolTracePanel traces={traces} />
                </>
              ) : (
                message.content
              )}
            </article>
          );
        })}
        {pendingUser && (
          <article className="ml-auto max-w-[80%] rounded-2xl bg-gradient-to-r from-[var(--amio-accent-from)] to-[var(--amio-accent-to)] px-4 py-3 text-white">
            {pendingUser}
          </article>
        )}
        {(streamingText || status) && (
          <article className="rounded-2xl border border-[var(--amio-border)] bg-[var(--amio-surface)] px-5 py-4 text-[var(--amio-text)]">
            {streamingText ? (
              <>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {streamingText}
                </ReactMarkdown>
                <ToolTracePanel traces={streamingTraces} />
              </>
            ) : (
              <p className="text-sm text-[var(--amio-text-muted)]">{status}</p>
            )}
          </article>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-[#fde8e8] px-4 py-3 text-[#c92a2a]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
