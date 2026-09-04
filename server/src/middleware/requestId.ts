import type { Request, Response, NextFunction } from "express";
import { ulid } from "ulid";

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers["x-request-id"];
  const id = typeof incoming === "string" && incoming.length <= 64 ? incoming : ulid();
  (req as Request & { id?: string }).id = id;
  res.setHeader("x-request-id", id);
  next();
}