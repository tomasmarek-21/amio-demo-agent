"use client";

import { useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/base-path";
import {
  DEFAULT_REASONING_EFFORT,
  DEFAULT_AGENT_MODEL,
  isAgentModel,
  isReasoningEffort,
  MODEL_REASONING_EFFORTS,
  type AgentModel,
  type ReasoningEffort,
} from "@/features/agent/models";
import {
  DEFAULT_SESSION_TITLE,
  titleFromFirstMessage,
} from "@/features/chat/session-title";
import type { ToolTrace } from "@/features/chat/types";
import type { ChatSession, SessionDetail } from "@/features/chat/types";
import type { ConnectorHealth } from "@/features/integrations/types";
import {
  createSession,
  getSession,
  listSessions,
  sendMessage,
} from "@/lib/chat-api";
import { getIntegrationsStatus } from "@/lib/integrations-api";
import { MessageComposer } from "./message-composer";
import { MessageList } from "./message-list";
import { SessionSidebar } from "./session-sidebar";

export function ChatShell() {
  const [selectedModel, setSelectedModel] =
    useState<AgentModel>(DEFAULT_AGENT_MODEL);
  const [reasoningEffort, setReasoningEffort] =
    useState<ReasoningEffort>(DEFAULT_REASONING_EFFORT);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [streamingTraces, setStreamingTraces] = useState<ToolTrace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [connectors, setConnectors] =
    useState<ConnectorHealth[] | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notionResult = params.get("notion");
    if (notionResult === "error") {
      setError("Failed to connect Notion. Try the OAuth flow again.");
    }
    if (notionResult) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    const sessionParam = params.get("session");
    void refreshIntegrations();
    const storedModel = window.localStorage.getItem("amio-agent-model");
    if (storedModel && isAgentModel(storedModel)) {
      setSelectedModel(storedModel);
      const storedEffort = window.localStorage.getItem(
        `amio-agent-reasoning-${storedModel}`,
      );
      if (
        storedEffort &&
        isReasoningEffort(storedEffort) &&
        MODEL_REASONING_EFFORTS[storedModel].includes(storedEffort)
      ) {
        setReasoningEffort(storedEffort);
      }
    }
    void listSessions()
      .then(async (items) => {
        setSessions(items);
        const initialId = sessionParam ?? items[0]?.id ?? null;
        if (initialId) await selectSession(initialId);
      })
      .catch((cause) => setError(readableError(cause)));
  }, []);

  async function refreshIntegrations() {
    try {
      const result = await getIntegrationsStatus();
      setConnectors(result.connectors);
    } catch {
      setConnectors([]);
    }
  }

  async function selectSession(id: string) {
    activeIdRef.current = id;
    setActiveId(id);
    setDetail(null);
    setPendingUser(null);
    setStreamingText("");
    setStreamingTraces([]);
    setStatus(null);
    setError(null);
    const selected = await getSession(id);
    if (activeIdRef.current === id) setDetail(selected);
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
        activeIdRef.current = session.id;
        setActiveId(session.id);
        setSessions((current) => [session, ...current]);
      }
      const optimisticTitle = titleFromFirstMessage(message);
      setSessions((current) =>
        current.map((session) =>
          session.id === sessionId && session.title === DEFAULT_SESSION_TITLE
            ? { ...session, title: optimisticTitle, updatedAt: new Date() }
            : session,
        ),
      );
      for await (const event of sendMessage(
        sessionId,
        message,
        selectedModel,
        MODEL_REASONING_EFFORTS[selectedModel].length
          ? reasoningEffort
          : null,
      )) {
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
          const refreshed = await getSession(sessionId);
          const refreshedSessions = await listSessions();
          setSessions(refreshedSessions);
          if (activeIdRef.current === sessionId) {
            setDetail(refreshed);
            setPendingUser(null);
            setStreamingText("");
            setStreamingTraces([]);
            setStatus(null);
          }
        }
      }
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-[var(--amio-bg)] text-[var(--amio-text)] md:h-screen md:flex-row">
      <SessionSidebar
        sessions={sessions}
        activeId={activeId}
        connectors={connectors}
        onRefreshIntegrations={() => void refreshIntegrations()}
        onConnectNotion={() => {
          window.location.assign(`${BASE_PATH}/api/integrations/notion/connect`);
        }}
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
          streamingTraces={streamingTraces}
        />
        <MessageComposer
          disabled={running}
          model={selectedModel}
          reasoningEffort={reasoningEffort}
          reasoningOptions={MODEL_REASONING_EFFORTS[selectedModel]}
          onModelChange={(model) => {
            setSelectedModel(model);
            window.localStorage.setItem("amio-agent-model", model);
            const storedEffort = window.localStorage.getItem(
              `amio-agent-reasoning-${model}`,
            );
            setReasoningEffort(
              storedEffort &&
                isReasoningEffort(storedEffort) &&
                MODEL_REASONING_EFFORTS[model].includes(storedEffort)
                ? storedEffort
                : DEFAULT_REASONING_EFFORT,
            );
          }}
          onReasoningChange={(effort) => {
            setReasoningEffort(effort);
            window.localStorage.setItem(
              `amio-agent-reasoning-${selectedModel}`,
              effort,
            );
          }}
          onSubmit={submit}
        />
      </section>
    </main>
  );
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}
