import { Router } from "express";
import { z } from "zod";
import { validate, getValidated } from "@/middleware/validate.js";
import { getPublishReadiness } from "@/services/PublishReadinessService.js";

export const publishReadinessRouter = Router();

const PublishReadinessBody = z.object({
  transcript: z.string().max(20000).optional().default(""),
  title: z.string().max(500).optional().default(""),
  tags: z.array(z.string().max(80)).max(30).optional().default([]),
  channel: z.string().max(120).optional().default(""),
  scheduledDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

type PublishReadinessBody = z.infer<typeof PublishReadinessBody>;

publishReadinessRouter.post("/", validate(PublishReadinessBody, "body"), async (req, res, next) => {
  try {
    const body = getValidated<PublishReadinessBody>(req, "body");
    const data = await getPublishReadiness(body);
    res.setHeader("Cache-Control", "private, max-age=60");
    res.json({ data, requestId: req.id });
  } catch (err) {
    next(err);
  }
});
