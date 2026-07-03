import type { ChatSession } from "@/features/chat/types";

interface Props {
  sessions: ChatSession[];
  activeId: string | null;
  notionConnected: boolean | null;
  onConnectNotion: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

export function SessionSidebar({
  sessions,
  activeId,
  notionConnected,
  onConnectNotion,
  onSelect,
  onCreate,
}: Props) {
  return (
    <aside className="flex w-full flex-col border-b border-slate-800 bg-slate-950 p-4 md:w-72 md:border-r md:border-b-0">
      <div className="mb-5">
        <p className="text-xs font-semibold tracking-[0.2em] text-emerald-400 uppercase">
          AMIO
        </p>
        <h1 className="mt-1 text-lg font-semibold text-white">
          Analytics Agent
        </h1>
      </div>
      <button
        type="button"
        disabled={notionConnected !== false}
        onClick={onConnectNotion}
        className="mb-3 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-left text-sm text-slate-200 hover:border-slate-700 hover:bg-slate-800 disabled:cursor-default disabled:hover:border-slate-800 disabled:hover:bg-slate-900"
      >
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 rounded-full ${
            notionConnected === null
              ? "bg-slate-500"
              : notionConnected
                ? "bg-emerald-400"
                : "bg-red-400"
          }`}
        />
        {notionConnected === null
          ? "Kontroluji Notion…"
          : notionConnected
            ? "Notion connected"
            : "Reconnect Notion"}
      </button>
      <button
        type="button"
        onClick={onCreate}
        className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 focus:ring-2 focus:ring-emerald-300 focus:outline-none"
      >
        Nová konverzace
      </button>
      <nav className="mt-4 flex gap-2 overflow-x-auto md:flex-col">
        {sessions.map((session) => (
          <button
            type="button"
            key={session.id}
            aria-label={`Otevřít konverzaci ${session.title}`}
            onClick={() => onSelect(session.id)}
            className={`min-w-40 rounded-lg px-3 py-2 text-left text-sm ${
              activeId === session.id
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:bg-slate-900"
            }`}
          >
            {session.title}
          </button>
        ))}
      </nav>
    </aside>
  );
}
