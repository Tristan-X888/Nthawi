/**
 * Same-origin relative return paths only (open-redirect defence).
 * Accepts "/w/abc/settings?tab=2#x"; rejects absolute URLs, scheme-relative
 * "//host", backslash tricks, encoded slashes that browsers normalise,
 * control characters and anything not starting with exactly one "/".
 */
export const DEFAULT_RETURN_PATH = "/"
const MAX_LENGTH = 2048

export function safeReturnPath(
  candidate: string | null | undefined,
  fallback: string = DEFAULT_RETURN_PATH
): string {
  if (typeof candidate !== "string") return fallback
  if (candidate.length === 0 || candidate.length > MAX_LENGTH) return fallback
  // Control characters (C0 and C1), whitespace and backslashes can be
  // normalised by browsers into a different authority.
  if (/[\p{Cc}\p{Z}\s\\]/u.test(candidate)) return fallback
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback

  let decoded = candidate
  try {
    decoded = decodeURIComponent(candidate)
  } catch {
    return fallback
  }
  if (/^\/[/\\]/.test(decoded) || /[\p{Cc}\\]/u.test(decoded)) {
    return fallback
  }

  // Resolve against a throwaway origin and require that it did not change.
  const base = "https://return-path.invalid"
  let url: URL
  try {
    url = new URL(candidate, base)
  } catch {
    return fallback
  }
  if (url.origin !== base) return fallback
  return `${url.pathname}${url.search}${url.hash}`
}
