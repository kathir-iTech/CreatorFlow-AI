import { useEffect, useState } from "react";

/**
 * Cold-start honesty (Part 7): Render's free tier can take 30-60s to wake.
 * After `delayMs` of continuous loading, callers swap the generic skeleton
 * for a specific "waking up the server" message instead of an identical,
 * indistinguishable spinner.
 */
export function useSlowHint(loading: boolean, delayMs = 10_000): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }
    setSlow(false);
    const t = setTimeout(() => setSlow(true), delayMs);
    return () => clearTimeout(t);
  }, [loading, delayMs]);
  return slow;
}
