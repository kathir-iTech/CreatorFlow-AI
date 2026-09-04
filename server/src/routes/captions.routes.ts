import { Router } from "express";
import { z } from "zod";
import { validate, getValidated } from "@/middleware/validate.js";
import { captionService } from "@/services/CaptionService.js";
import { sanitizeMediaUrl } from "@/utils/sanitize.js";

const CaptionsBody = z.object({
  url: z.string().min(1, "url is required"),
  lang: z.string().optional(),
});
type CaptionsBody = z.infer<typeof CaptionsBody>;

export const captionsRouter = Router();

captionsRouter.post("/", validate(CaptionsBody, "body"), async (req, res, next) => {
  try {
    const body = getValidated<CaptionsBody>(req, "body");
    const cleanUrl = sanitizeMediaUrl(body.url);
    const lang = (body.lang ?? "en").trim() || "en";
    const result = await captionService.getCaptions(cleanUrl, lang);
    res.setHeader("Cache-Control", "private, max-age=60");
    res.json({ data: result, requestId: req.id });
  } catch (err) {
    next(err);
  }
});
