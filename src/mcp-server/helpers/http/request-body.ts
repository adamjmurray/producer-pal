// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Request } from "express";

/**
 * Read a request's parsed JSON body as a plain object. Express leaves
 * `req.body` undefined when a request carries no JSON body (e.g. a missing
 * `Content-Type: application/json`), so a handler that dereferences it directly
 * TypeErrors into a 500 instead of the intended 400. Normalizing a missing or
 * non-object body (undefined, a JSON array, a bare string/number) to `{}` lets
 * every body-reading handler validate its fields and respond with a clean 400
 * — closing the whole "bodyless request 500s" class in one place.
 *
 * @param req - Express request
 * @returns The parsed body as a record, or `{}` when absent/non-object
 */
export function requestBody(req: Request): Record<string, unknown> {
  const body = req.body as unknown;

  return typeof body === "object" && body != null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}
