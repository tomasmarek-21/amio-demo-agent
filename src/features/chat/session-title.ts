export const DEFAULT_SESSION_TITLE = "New conversation";

const TITLE_PREFIX_LENGTH = 23;

export function titleFromFirstMessage(message: string): string {
  const normalized = message.trim().replace(/\s+/g, " ");
  if (!normalized) return DEFAULT_SESSION_TITLE;
  if (normalized.length <= TITLE_PREFIX_LENGTH + 1) return normalized;
  return `${normalized.slice(0, TITLE_PREFIX_LENGTH).trimEnd()}…`;
}
