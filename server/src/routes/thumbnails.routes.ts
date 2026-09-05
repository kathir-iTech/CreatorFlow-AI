import { Router } from "express";
import { z } from "zod";
import { validate, getValidated } from "@/middleware/validate.js";
import { extractThumbnails } from "@/services/ThumbnailService.js";
import { sanitizeMediaUrl } from "@/utils/sanitize.js";

const ThumbnailsBody = z.object({
  url: z.string().min(1, "url is required"),
});
type ThumbnailsBody = z.infer<typeof ThumbnailsBody>;

export const thumbnailsRouter = Router();

thumbnailsRouter.post("/", validate(ThumbnailsBody, "body"), async (req, res, next) => {
  try {
    const body = getValidated<ThumbnailsBody>(req, "body");
    const cleanUrl = sanitizeMediaUrl(body.url);
    const result = await extractThumbnails(cleanUrl);
    res.setHeader("Cache-Control", "private, max-age=120");
    res.json({ data: result, requestId: req.id });
  } catch (err) {
    next(err);
  }
});
