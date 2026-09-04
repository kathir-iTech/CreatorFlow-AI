import { Router } from "express";
import { providerRegistry } from "@/providers/ProviderRegistry.js";

export const providersRouter = Router();

providersRouter.get("/", (req, res) => {
  res.json({
    data: providerRegistry.list().map((p) => ({
      id: p.id,
      displayName: p.displayName,
      domains: p.domains,
      requiresCookies: p.requiresCookies,
    })),
    requestId: req.id,
  });
});