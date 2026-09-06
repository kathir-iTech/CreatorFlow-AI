import { Router } from "express";
import { z } from "zod";
import { validate, getValidated } from "@/middleware/validate.js";
import { getChannelStats } from "@/services/ChannelStatsService.js";

export const channelStatsRouter = Router();

const ChannelStatsQuery = z.object({
  // Channel ID (UC…) or handle (@name). Empty/absent, or no API key
  // configured, serves clearly-labeled example data instead.
  channel: z.string().max(120).optional(),
});
type ChannelStatsQuery = z.infer<typeof ChannelStatsQuery>;

channelStatsRouter.get("/", validate(ChannelStatsQuery, "query"), async (req, res, next) => {
  try {
    const { channel } = getValidated<ChannelStatsQuery>(req, "query");
    const data = await getChannelStats(channel);
    res.setHeader("Cache-Control", "public, max-age=600");
    res.json({ data, requestId: req.id });
  } catch (err) {
    next(err);
  }
});
