import { Router } from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesPath = path.join(__dirname, "../fixtures/demo-videos.json");
const fixtures = JSON.parse(readFileSync(fixturesPath, "utf8")) as Array<{
  id: string;
  url: string;
  title: string;
  label: string;
  metadata: unknown;
  captions: unknown;
  seo: unknown;
  thumbnails: unknown;
}>;

export const demoRouter = Router();

type DemoEntry = (typeof fixtures)[number];

// GET /api/v1/demo/:id — serves cached fixture directly, no outbound calls
demoRouter.get("/:id", (req, res) => {
  const id = String(req.params.id ?? "").trim();
  const entry = (fixtures as DemoEntry[]).find((f) => f.id === id);
  if (!entry) {
    res.status(404).json({ data: null, error: { code: "NOT_FOUND", message: `Demo ${id} not found` } });
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({ data: entry });
});

demoRouter.get("/", (_req, res) => {
  const list = (fixtures as DemoEntry[]).map((f) => ({ id: f.id, label: f.label, title: f.title, url: f.url }));
  res.json({ data: list });
});
