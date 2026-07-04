// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// REST endpoints for the LLM-managed memory collection
// (~/.producer-pal/memory/<slug>.md). The webui manager lists every stored
// memory (GET), saves one entry (PUT), and deletes one (DELETE); the backend
// re-derives the MEMORY.md index on each write. The files live on the
// Node-for-Max side (the browser has no filesystem), so the manager round-trips
// through here — the same shape as the fixed-slot skill-overrides route, but the
// collection is dynamic (entries are created and removed, not a stable slot set).

import { type Express, type Request, type Response } from "express";
import {
  forgetMemory,
  listMemoryEntries,
  memoryExists,
  rememberMemory,
  slugifyMemoryName,
} from "../helpers/memory/global-memory-store.ts";
import { isMemoryType, MEMORY_TYPES } from "../helpers/memory/memory.ts";
import { rejectCrossOriginWrite } from "../helpers/request-origin.ts";

/**
 * Register the /memory collection REST endpoints on the Express app. GET lists
 * every stored memory (name/type/description/body); PUT creates or overwrites
 * one entry; DELETE removes one. Writes are localhost-origin-gated exactly like
 * POST /config (authoring is a local action); the GET stays ungated.
 *
 * @param app - Express application
 */
export function registerMemoryCollectionRoutes(app: Express): void {
  app.get("/memory", (_req: Request, res: Response): void => {
    // Device/AI/hand writes must surface on the next fetch — never cache.
    res.set("Cache-Control", "no-store");
    res.json({ entries: listMemoryEntries() });
  });

  app.put("/memory/:name", (req: Request, res: Response): void => {
    if (rejectWrite(req, res)) return;

    const body = req.body as {
      type?: unknown;
      description?: unknown;
      content?: unknown;
      createOnly?: unknown;
    };

    if (!isMemoryType(body.type)) {
      res
        .status(400)
        .json({ error: `type must be one of: ${MEMORY_TYPES.join(", ")}` });

      return;
    }

    if (typeof body.content !== "string") {
      res.status(400).json({ error: "content must be a string" });

      return;
    }

    // The editor's Create flow sets createOnly so a new memory can't silently
    // overwrite an existing one that its name happens to slugify to (an edit,
    // by contrast, targets a known slug and overwrite is intended).
    if (body.createOnly === true && memoryExists(entryName(req))) {
      res.status(409).json({
        error: `A memory named "${slugifyMemoryName(entryName(req))}" already exists`,
      });

      return;
    }

    try {
      const entry = rememberMemory({
        name: entryName(req),
        type: body.type,
        description:
          typeof body.description === "string" ? body.description : "",
        body: body.content,
      });

      res.json({ entry });
    } catch (error) {
      // The store rejects an unslugifiable name or an empty body — surface it as
      // a 400 so the editor can show why the save was refused.
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.delete("/memory/:name", (req: Request, res: Response): void => {
    if (rejectWrite(req, res)) return;

    res.json({ existed: forgetMemory(entryName(req)) });
  });
}

// --- Helpers below main export ---

/**
 * The `:name` route param as a plain string. Express types params loosely
 * (`string | string[] | undefined`), but a matched `:name` segment is always a
 * string; the store slugifies and validates whatever it receives.
 *
 * @param req - Express request
 * @returns The raw name path segment
 */
function entryName(req: Request): string {
  return String(req.params.name);
}

/**
 * Reject a cross-origin write with 403 (the same localhost gate as POST
 * /config). Returns true when the request was rejected and the caller should
 * stop.
 *
 * @param req - Express request
 * @param res - Express response (written on rejection)
 * @returns True when the request was rejected
 */
function rejectWrite(req: Request, res: Response): boolean {
  return rejectCrossOriginWrite(
    req,
    res,
    "cross-origin /memory writes are not allowed",
  );
}
