import { Router } from "express";
import { listStatus } from "@/runtime/RequestStatusBuffer.js";

export const statusRouter = Router();

// Public, unauthenticated, read-only — last 20 requests to /info, /captions, /downloads
// No PII, no full URLs, no secrets — just endpoint + path + timestamp + success
statusRouter.get("/public", (_req, res) => {
  const entries = listStatus();
  // Aggregate percentages
  const total = entries.length;
  const byPath: Record<string, number> = {};
  for (const e of entries) {
    byPath[e.path] = (byPath[e.path] ?? 0) + 1;
  }
  const percentages: Record<string, number> = {};
  for (const [k, v] of Object.entries(byPath)) {
    percentages[k] = total ? Math.round((v / total) * 100) : 0;
  }
  // Success rate per path
  const byPathSuccess: Record<string, { total: number; success: number; rate: number }> = {};
  for (const e of entries) {
    const cur = byPathSuccess[e.path] ?? { total: 0, success: 0, rate: 0 };
    cur.total++;
    if (e.success) cur.success++;
    byPathSuccess[e.path] = cur;
  }
  for (const k of Object.keys(byPathSuccess)) {
    const v = byPathSuccess[k]!;
    v.rate = v.total ? Math.round((v.success / v.total) * 100) : 0;
  }

  res.json({
    data: {
      entries,
      total,
      percentages,
      byPathSuccess,
      generatedAt: new Date().toISOString(),
    },
  });
});
