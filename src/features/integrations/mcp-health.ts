interface McpHealthInput {
  serverUrl: string;
  authorization: string;
  expectedTools?: string[];
  timeoutMs?: number;
}

interface McpHealthResult {
  ok: boolean;
  message: string;
}

export async function checkMcpTools(
  input: McpHealthInput,
): Promise<McpHealthResult> {
  const timeoutMs = input.timeoutMs ?? 7_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const initialized = await callMcp(
      input.serverUrl,
      input.authorization,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: {
            name: "amio-analytics-agent-health",
            version: "1.0.0",
          },
        },
      },
      controller.signal,
    );
    if (initialized.sessionId) {
      await notifyInitialized(
        input.serverUrl,
        input.authorization,
        initialized.sessionId,
        controller.signal,
      );
    }
    const payload = await callMcp(
      input.serverUrl,
      input.authorization,
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      },
      controller.signal,
      initialized.sessionId,
    );
    const tools = readToolNames(payload);
    if (!tools.length) {
      return { ok: false, message: "MCP server nevrátil žádné tools." };
    }
    const missing = input.expectedTools?.filter((tool) => !tools.includes(tool));
    if (missing?.length) {
      return {
        ok: false,
        message: `MCP server odpověděl, ale chybí tool: ${missing[0]}.`,
      };
    }
    return {
      ok: true,
      message: `MCP tools/list OK (${tools.length} tools).`,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? readableHealthError(error)
          : "Health check selhal.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callMcp(
  serverUrl: string,
  authorization: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
  sessionId?: string,
) {
  const response = await fetch(serverUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${authorization}`,
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `MCP HTTP ${response.status}${readErrorBody(text)}`,
    );
  }
  const payload = parseMcpPayload(text);
  if (payload.error) {
    const error = payload.error as { message?: unknown; code?: unknown };
    throw new Error(
      typeof error.message === "string"
        ? error.message
        : `MCP error ${String(error.code ?? "")}`.trim(),
    );
  }
  return {
    ...payload,
    sessionId: response.headers.get("mcp-session-id") ?? undefined,
  };
}

async function notifyInitialized(
  serverUrl: string,
  authorization: string,
  sessionId: string,
  signal: AbortSignal,
) {
  const response = await fetch(serverUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${authorization}`,
      "Mcp-Session-Id": sessionId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    }),
    cache: "no-store",
    signal,
  });
  if (!response.ok && response.status !== 404 && response.status !== 405) {
    const text = await response.text();
    throw new Error(
      `MCP initialized notification HTTP ${response.status}${readErrorBody(
        text,
      )}`,
    );
  }
}

function parseMcpPayload(text: string) {
  const direct = safeJson(text);
  if (direct) return direct;
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const payload = safeJson(line.slice(6));
    if (payload) return payload;
  }
  throw new Error("MCP server vrátil nečitelnou odpověď.");
}

function safeJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readToolNames(payload: Record<string, unknown>) {
  const result =
    payload.result && typeof payload.result === "object"
      ? (payload.result as Record<string, unknown>)
      : {};
  const tools = Array.isArray(result.tools) ? result.tools : [];
  return tools
    .map((tool) =>
      tool && typeof tool === "object" && "name" in tool
        ? String((tool as { name?: unknown }).name ?? "")
        : "",
    )
    .filter(Boolean);
}

function readErrorBody(text: string) {
  const parsed = safeJson(text);
  const message =
    parsed && typeof parsed.message === "string" ? parsed.message : "";
  return message ? `: ${message}` : "";
}

function readableHealthError(error: Error) {
  if (error.name === "AbortError") return "Health check vypršel.";
  return error.message || "Health check selhal.";
}
