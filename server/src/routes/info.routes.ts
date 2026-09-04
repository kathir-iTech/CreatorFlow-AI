import { Router } from "express";
import { z } from "zod";
import { validate, getValidated } from "@/middleware/validate.js";
import { infoService } from "@/services/InfoService.js";
import { sanitizeMediaUrl } from "@/utils/sanitize.js";

// Intentionally loose: the backend sanitizes and normalizes the URL; strict
// .url() validation would reject copy-pasted links with tracking params or
// provider-specific quirks that our sanitizer handles correctly.
const InfoBody = z.object({ url: z.string() });
type InfoBody = z.infer<typeof InfoBody>;


export const infoRouter = Router();

infoRouter.post("/", validate(InfoBody, "body"), async (req, res, next) => {
  try {
    const { url } = getValidated<InfoBody>(req, "body");
    const cleanUrl = sanitizeMediaUrl(url);
    const { metadata, cached, providerId } = await infoService.getMetadata(cleanUrl);
    res.setHeader("Cache-Control", "private, max-age=60");
    res.json({
      data: { providerId, cached, metadata },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
});