export default function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");
  res.status(200).json({
    status: "ok",
    service: "creatorflow-ai",
    phase: 0,
    message: "Health endpoint scaffold — full implementation lands in Phase 1",
    timestamp: new Date().toISOString(),
  });
}
