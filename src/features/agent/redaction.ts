const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const sensitiveKey =
  /("(?:authorization|api[_-]?key|token|secret|distinct_id|session_id)"\s*:\s*)"[^"]*"/gi;
const sensitiveQuery = /([?&](?:token|key|auth|email|distinct_id)=)[^&#"]*/gi;

export function redact(value: string, maxLength = 2_000): string {
  return value
    .replace(sensitiveKey, '$1"[REDACTED]"')
    .replace(email, "[REDACTED_EMAIL]")
    .replace(sensitiveQuery, "$1[REDACTED]")
    .slice(0, maxLength);
}
