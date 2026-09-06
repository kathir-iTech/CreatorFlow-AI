import { readFileSync, statSync } from "node:fs";
import { getCookiesPath } from "@/security/CookiesDetector.js";

// Names of cookies that actually carry the YouTube/Google login session.
// If any of these expire, the canary will start failing even when the file
// is "present" — the silent root cause of mysterious BOT_CHECKs.
const AUTH_COOKIE_NAMES = new Set([
  "__Secure-3PSID",
  "__Secure-3PAPISID",
  "__Secure-1PSID",
  "__Secure-1PAPISID",
  "SID",
  "HSID",
  "SSID",
  "APISID",
  "SAPISID",
  "LOGIN_INFO",
  "SIDCC",
]);

export interface CookieExpiry {
  name: string;
  domain: string;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  expired: boolean;
  sessionOnly: boolean;
}

export interface CookieInspectionReport {
  available: boolean;
  path: string | null;
  reason?: string;
  fileSizeBytes?: number;
  fileMtime?: string;
  totalCookies?: number;
  authCookies?: CookieExpiry[];
  soonestExpiryAt?: string | null;
  soonestExpiryDays?: number | null;
  anyAuthExpired?: boolean;
  missingAuthNames?: string[];
}

export function parseNetscapeCookies(contents: string): CookieExpiry[] {
  const now = Date.now();
  const out: CookieExpiry[] = [];
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    // domain \t flag \t path \t secure \t expiry \t name \t value
    const parts = rawLine.split("\t");
    if (parts.length < 7) continue;
    const [domain, , , , expiryStr, name] = parts;
    // Malformed line (empty domain/name): skip rather than recording junk.
    if (!domain || !name) continue;
    const expirySec = Number(expiryStr);
    const sessionOnly = !Number.isFinite(expirySec) || expirySec === 0;
    const expiresAtMs = sessionOnly ? null : expirySec * 1000;
    const daysUntilExpiry =
      expiresAtMs === null ? null : Math.round((expiresAtMs - now) / 86_400_000);
    out.push({
      name,
      domain,
      expiresAt: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
      daysUntilExpiry,
      expired: expiresAtMs !== null && expiresAtMs < now,
      sessionOnly,
    });
  }
  return out;
}

export function inspectCookies(): CookieInspectionReport {
  const p = getCookiesPath();
  if (!p) {
    return { available: false, path: null, reason: "No cookies.txt detected" };
  }
  try {
    const stat = statSync(p);
    const contents = readFileSync(p, "utf8");
    const all = parseNetscapeCookies(contents);
    const auth = all.filter((c) => AUTH_COOKIE_NAMES.has(c.name));
    const haveNames = new Set(auth.map((c) => c.name));
    const missing = [...AUTH_COOKIE_NAMES].filter((n) => !haveNames.has(n));
    const withExpiry = auth.filter((c) => c.expiresAt !== null);
    let soonestAt: string | null = null;
    let soonestDays: number | null = null;
    if (withExpiry.length > 0) {
      const min = withExpiry.reduce((acc, c) =>
        new Date(c.expiresAt!).getTime() < new Date(acc.expiresAt!).getTime() ? c : acc,
      );
      soonestAt = min.expiresAt;
      soonestDays = min.daysUntilExpiry;
    }
    return {
      available: true,
      path: p,
      fileSizeBytes: stat.size,
      fileMtime: stat.mtime.toISOString(),
      totalCookies: all.length,
      authCookies: auth,
      soonestExpiryAt: soonestAt,
      soonestExpiryDays: soonestDays,
      anyAuthExpired: auth.some((c) => c.expired),
      missingAuthNames: missing,
    };
  } catch (err) {
    return {
      available: false,
      path: p,
      reason: `Failed to read or parse cookies.txt: ${(err as Error).message}`,
    };
  }
}