import type { Request, Response, NextFunction } from "express";
import type { ZodTypeAny, z } from "zod";

type Source = "body" | "query" | "params";

export function validate<S extends ZodTypeAny>(schema: S, source: Source = "body") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(result.error);
      return;
    }
    (req as Request & { validated?: Record<Source, unknown> }).validated = {
      ...(req as Request & { validated?: Record<Source, unknown> }).validated,
      [source]: result.data,
    } as Record<Source, unknown>;
    next();
  };
}

export function getValidated<T>(req: Request, source: Source = "body"): T {
  const v = (req as Request & { validated?: Record<Source, unknown> }).validated;
  return (v?.[source] ?? req[source]) as T;
}

export type Infer<S extends ZodTypeAny> = z.infer<S>;