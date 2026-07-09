/**
 * This app has no `basePath` in next.config.ts (it broke client hydration
 * under Turbopack when combined with a reverse proxy) — only `assetPrefix`
 * is set, which covers `_next/static` asset URLs but not `fetch()` calls.
 *
 * A same-origin `fetch("/api/...")` always resolves against the browser's
 * current *origin*, not its current *pathname*. When this app is reverse-
 * proxied under the dashboard at `/agent` (same origin, port 5173), such a
 * call would hit the dashboard's own "/api/..." instead of the proxied one.
 * When run standalone on its own port (e.g. localhost:3000), there is no
 * prefix to add. Detect which mode we're in from the current pathname.
 */
export const BASE_PATH =
  typeof window !== "undefined" && window.location.pathname.startsWith("/agent")
    ? "/agent"
    : "";
