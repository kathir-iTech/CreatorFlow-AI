import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export type HealthState = "checking" | "online" | "degraded" | "offline";

export function useApiHealth(intervalMs = 15000) {
  const [state, setState] = useState<HealthState>("checking");
  const [detail, setDetail] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    async function ping() {
      const r = await api.ready();
      if (cancelled) return;
      if (!r || r.ok === false) {
        if (r && r.status === 503) {
          setState("degraded");
          setDetail((r as any).error || "Backend not ready");
        } else {
          setState("offline");
          setDetail("Backend unreachable");
        }
      } else {
        setState("online");
        setDetail("All systems normal");
      }
    }
    ping();
    const id = setInterval(ping, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return { state, detail };
}
