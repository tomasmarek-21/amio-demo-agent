"use client";

import { useEffect, useState } from "react";
import type { ToolTrace } from "@/features/chat/types";
import type { ChatSession, SessionDetail } from "@/features/chat/types";
import {
  createSession,
  getSession,
  listSessions,
  sendMessage,
} from "@/lib/chat-api";
import { MessageComposer } from "./message-composer";
import { MessageList } from "./message-list";
import { SessionSidebar } from "./session-sidebar";

export function ChatShell() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [streamingTraces, setStreamingTraces] = useState<ToolTrace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    void listSessions()
      .then(async (items) => {
        setSessions(items);
        if (items[0]) await selectSession(items[0].id);
      })
      .catch((cause) => setError(readableError(cause)));
  }, []);

  async function selectSession(id: string) {
    setActiveId(id);
    setDetail(await getSession(id));
    setPendingUser(null);
    setStreamingText("");
    setStreamingTraces([]);
    setStatus(null);
    setError(null);
  }

  async function newSession() {
    const session = await createSession();
    setSessions((current) => [session, ...current]);
    await selectSession(session.id);
  }

  async function submit(message: string) {
    setRunning(true);
    setError(null);
    setPendingUser(message);
    setStreamingText("");
    setStreamingTraces([]);
    let sessionId = activeId;
    try {
      if (!sessionId) {
        const session = await createSession();
        sessionId = session.id;
        setActiveId(session.id);
        setSessions((current) => [session, ...current]);
      }
      for await (const event of sendMessage(sessionId, message)) {
        if (event.type === "status") setStatus(event.label);
        if (event.type === "text_delta") {
          setStatus(null);
          setStreamingText((current) => current + event.delta);
        }
        if (event.type === "tool_trace") {
          setStreamingTraces((current) => [
            ...current,
            {
              id: `${sessionId}-${current.length}`,
              runId: "streaming",
              toolName: event.toolName,
              sanitizedArguments: event.arguments,
              resultSummary: event.resultSummary,
              durationMs: event.durationMs,
              status: event.status,
              error: event.error,
              createdAt: new Date(),
            },
          ]);
        }
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "completed") {
          setDetail(await getSession(sessionId));
          setSessions(await listSessions());
          setPendingUser(null);
          setStreamingText("");
          setStreamingTraces([]);
          setStatus(null);
        }
      }
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setRunning(false);
    }
  }

  void streamingTraces;

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-slate-100 md:h-screen md:flex-row">
      <SessionSidebar
        sessions={sessions}
        activeId={activeId}
        onSelect={(id) => void selectSession(id)}
        onCreate={() => void newSession()}
      />
      <section className="flex min-h-[70vh] flex-1 flex-col">
        <MessageList
          detail={detail}
          pendingUser={pendingUser}
          streamingText={streamingText}
          status={status}
          error={error}
        />
        <MessageComposer disabled={running} onSubmit={submit} />
      </section>
    </main>
  );
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : "Požadavek selhal.";
}
