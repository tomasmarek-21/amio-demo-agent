"use client";

import { useState } from "react";
import { ChatShell } from "@/components/chat/chat-shell";
import { AutomatedTab } from "@/components/automated/automated-tab";

type Tab = "conversation" | "automated";

export function AgentShell() {
  const [activeTab, setActiveTab] = useState<Tab>("conversation");

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--amio-bg)] text-[var(--amio-text)]">
      {/* Header */}
      <header className="flex flex-shrink-0 items-center justify-between border-b border-[var(--amio-border)] bg-white/85 px-5 backdrop-blur-md" style={{ height: 56 }}>
        <div className="flex items-center gap-3">
          <span className="text-sm font-black uppercase tracking-tight text-[var(--amio-text)]">
            AMIO
          </span>
          <div className="h-6 w-px bg-[var(--amio-border)]" />
          <span className="text-xs font-semibold text-[var(--amio-text-muted)]">
            Analytics Agent
          </span>
        </div>

        <nav className="flex gap-1 rounded-xl bg-[var(--amio-surface-muted)] p-1">
          <button
            type="button"
            onClick={() => setActiveTab("conversation")}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              activeTab === "conversation"
                ? "bg-white text-[var(--amio-text)] shadow-sm"
                : "text-[var(--amio-text-muted)] hover:text-[var(--amio-text)]"
            }`}
          >
            Conversation
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("automated")}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              activeTab === "automated"
                ? "bg-white text-[var(--amio-text)] shadow-sm"
                : "text-[var(--amio-text-muted)] hover:text-[var(--amio-text)]"
            }`}
          >
            Automated
          </button>
        </nav>

        {/* spacer so nav stays centered */}
        <div className="w-32" />
      </header>

      {/* Content */}
      <div className="flex min-h-0 flex-1">
        {activeTab === "conversation" ? (
          <ChatShell />
        ) : (
          <AutomatedTab />
        )}
      </div>
    </div>
  );
}
