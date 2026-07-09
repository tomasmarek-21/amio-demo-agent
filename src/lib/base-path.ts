/**
 * Matches `basePath` in next.config.ts. Client-side `fetch()` calls with a
 * literal path are not auto-prefixed by Next.js (unlike `next/link` or the
 * router), so every same-origin API call must prepend this manually.
 */
export const BASE_PATH = "/agent";
