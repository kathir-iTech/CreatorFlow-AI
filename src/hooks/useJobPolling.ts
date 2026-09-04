import { useEffect, useRef, useState } from "react";
import { api, type Job } from "@/lib/api";

export function useJobPolling(jobId: string | null, enabled = true) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!jobId || !enabled) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const j = await api.getJob(jobId);
        if (cancelled) return;
        setJob(j);
        if (j.status === "pending" || j.status === "queued" || j.status === "running") {
          timerRef.current = setTimeout(poll, 700);
        }
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? "Failed to fetch job");
        timerRef.current = setTimeout(poll, 2000);
      }
    };
    poll();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [jobId, enabled]);

  return { job, error };
}
