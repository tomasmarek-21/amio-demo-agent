import type {
  HistoryEvent,
  NormalizedMessage,
  NormalizedTranscript,
  RequestRecord,
} from "./types";

interface NormalizeTranscriptInput {
  contactId: string;
  initialRequest: string;
  lastRequestTimestamp: string;
  outcomes: string[];
  history: HistoryEvent[];
  requests: RequestRecord[];
  includeSystemEvents: boolean;
}

export function normalizeTranscript(
  input: NormalizeTranscriptInput,
): NormalizedTranscript {
  const requestByMessageId = new Map(
    input.requests.map((request) => [request.message_id, request]),
  );
  const messages = input.history
    .map((event) => normalizeEvent(event, requestByMessageId))
    .filter((message): message is NormalizedMessage => Boolean(message))
    .filter((message) => input.includeSystemEvents || message.role !== "system");

  return {
    contactId: input.contactId,
    initialRequest: input.initialRequest,
    lastRequestTimestamp: input.lastRequestTimestamp,
    outcomes: input.outcomes,
    messages,
  };
}

function normalizeEvent(
  event: HistoryEvent,
  requestByMessageId: Map<string, RequestRecord>,
): NormalizedMessage | null {
  const data = recordValue(event.data);
  const messageId = stringOrNull(data.message_id);
  const request = messageId ? requestByMessageId.get(messageId) : undefined;

  if (event.type === "quick_reply" || event.type === "postback") {
    return {
      id: event.id,
      timestamp: event.timestamp,
      role: "user",
      kind: "button_click",
      text: readButtonLabel(data),
      payload: readButtonPayload(data),
      details: data,
    };
  }

  if (event.type === "remote_action") {
    return {
      id: event.id,
      timestamp: event.timestamp,
      role: "system",
      kind: "remote_action",
      details: data,
    };
  }

  if (event.type === "chat_gpt_action") {
    return {
      id: event.id,
      timestamp: event.timestamp,
      role: "system",
      kind: "llm_action",
      details: data,
    };
  }

  if (event.type === "event" || event.type === "bot_wake_up") {
    return {
      id: event.id,
      timestamp: event.timestamp,
      role: "system",
      kind: "event",
      text: readText(data),
      details: data,
    };
  }

  if (stringValue(data.type) && event.type === "answer_end") {
    return {
      id: event.id,
      timestamp: event.timestamp,
      role: "system",
      kind: "answer_end",
      text: stringValue(data.type),
      details: data,
    };
  }

  const direction = stringValue(data.direction).toLowerCase();
  const text = readText(data);
  if (direction === "received") {
    return {
      id: event.id,
      timestamp: event.timestamp,
      role: "user",
      kind: "text",
      text,
      messageId,
      requestId: request?.id ?? null,
      outcome: request?.outcome ?? null,
      intent: request?.intent ?? null,
    };
  }

  if (event.type === "message" || text) {
    return {
      id: event.id,
      timestamp: event.timestamp,
      role: "assistant",
      kind: "text",
      text,
      messageId,
      requestId: request?.id ?? null,
      outcome: request?.outcome ?? null,
      intent: request?.intent ?? null,
    };
  }

  return null;
}

function readButtonLabel(data: Record<string, unknown>) {
  return (
    stringValue(data.text) ||
    stringValue(data.title) ||
    readText(data) ||
    readButtonPayload(data)
  );
}

function readButtonPayload(data: Record<string, unknown>) {
  return stringValue(data.payload) || stringValue(data.value) || "";
}

function readText(data: Record<string, unknown>) {
  const direct = stringValue(data.text);
  if (direct) {
    return direct;
  }
  const content = recordValue(data.content);
  const payload = content.payload;
  return flattenValue(payload);
}

function flattenValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => flattenValue(item))
      .filter(Boolean)
      .join("\n");
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return "";
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}
