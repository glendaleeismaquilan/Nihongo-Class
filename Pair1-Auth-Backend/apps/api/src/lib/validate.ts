import type { z } from "zod";
import { ApiError, zodDetails } from "./errors";

/** Validates with zod and throws the §11 validation error shape. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError(400, "validation_error", "Check the highlighted fields.", zodDetails(result.error));
  }
  return result.data;
}

/** Route params as plain strings (Express 5 types allow string[] for wildcards; we don't use any). */
export function params(req: { params: unknown }): Record<string, string> {
  return req.params as Record<string, string>;
}
