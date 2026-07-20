import { NextFunction, Request, Response } from "express";

type JsonLike = string | number | boolean | null | JsonLike[] | { [key: string]: JsonLike };

export function sanitizeInput(req: Request, _res: Response, next: NextFunction): void {
  req.body = sanitizeValue(req.body) as Request["body"];
  req.query = sanitizeValue(req.query) as Request["query"];
  req.params = sanitizeValue(req.params) as Request["params"];
  next();
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry)) as JsonLike[];
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).reduce<Record<string, unknown>>((cleaned, [key, entry]) => {
      if (key.startsWith("$") || key.includes(".")) {
        return cleaned;
      }
      cleaned[key] = sanitizeValue(entry);
      return cleaned;
    }, {});
  }
  return value;
}
