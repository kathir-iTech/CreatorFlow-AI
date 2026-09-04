import { createHash } from "node:crypto";

export function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

export function cacheKey(parts: Array<string | number | undefined>): string {
  return sha1(parts.filter((p) => p !== undefined).join("|"));
}