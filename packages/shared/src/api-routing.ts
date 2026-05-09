export const DEFAULT_API_BASE_URL = "http://localhost:8016";
export const DESKTOP_API_FALLBACK_BASE_URL = "http://127.0.0.1:39282";

export function normalizeApiBaseUrl(value: string | undefined | null): string {
  const trimmed = value?.trim();
  return (trimmed || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

export function isLocalHostname(hostname: string | undefined | null): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function apiBaseUrlCandidates(
  primaryBaseUrl: string | undefined | null,
  browserHostname: string | undefined | null,
): string[] {
  const primary = normalizeApiBaseUrl(primaryBaseUrl);
  const candidates = [primary];

  if (!isLocalHostname(browserHostname)) {
    return candidates;
  }

  try {
    const primaryUrl = new URL(primary);
    if (
      isLocalHostname(primaryUrl.hostname) &&
      primary !== DESKTOP_API_FALLBACK_BASE_URL
    ) {
      candidates.push(DESKTOP_API_FALLBACK_BASE_URL);
    }
  } catch {
    // Keep the configured URL as-is if it is not parseable.
  }

  return candidates;
}
