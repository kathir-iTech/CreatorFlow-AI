import { Router } from "express";
import { z } from "zod";
import { validate, getValidated } from "@/middleware/validate.js";
import { generateSeo } from "@/services/SeoService.js";

const SeoBody = z.object({
  transcript: z.string().min(1, "transcript is required").max(20_000),
  videoTitle: z.string().max(500).optional(),
});
type SeoBody = z.infer<typeof SeoBody>;

export const seoRouter = Router();

seoRouter.post("/", validate(SeoBody, "body"), async (req, res, next) => {
  try {
    const body = getValidated<SeoBody>(req, "body");
    const result = await generateSeo(body.transcript, body.videoTitle);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.json({ data: result, requestId: req.id });
  } catch (err) {
    next(err);
  }
});
