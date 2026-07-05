// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// REST endpoints for the user's built-in skills-fragment overrides
// (~/.producer-pal/skills/<slot>.md). The webui editor lists every slot
// pre-populated with the current built-in (fetched here), Save writes one
// override file (PUT), and "reset to default" deletes it (DELETE). The files
// live on the Node-for-Max side (the browser has no filesystem), so the editor
// round-trips through here.

import { type Express, type Request, type Response } from "express";
import {
  isSkillSlotName,
  type SkillSlotName,
} from "#src/skills/skill-slots.ts";
import { rejectForeignOriginWrite } from "../helpers/request-origin.ts";
import {
  deleteSkillOverride,
  listSkillSlotStates,
  writeSkillOverride,
} from "../helpers/skill-overrides-store.ts";

/**
 * Register the /skill-overrides REST endpoints on the Express app. GET lists
 * every slot with its built-in, current override, and drift; PUT saves one
 * override; DELETE resets one to the built-in. Writes are localhost-origin-gated
 * exactly like POST /config (authoring is a local action).
 *
 * @param app - Express application
 */
export function registerSkillOverridesRoutes(app: Express): void {
  app.get("/skill-overrides", (_req: Request, res: Response): void => {
    // Device/AI/hand writes must surface on the next fetch — never cache.
    res.set("Cache-Control", "no-store");
    res.json({ slots: listSkillSlotStates() });
  });

  app.put("/skill-overrides/:slot", (req: Request, res: Response): void => {
    const slot = requireSlot(req, res);

    if (!slot) return;

    const content = (req.body as { content?: unknown }).content;

    if (typeof content !== "string") {
      res.status(400).json({ error: "content must be a string" });

      return;
    }

    res.json({ slot: writeSkillOverride(slot, content) });
  });

  app.delete("/skill-overrides/:slot", (req: Request, res: Response): void => {
    const slot = requireSlot(req, res);

    if (!slot) return;

    res.json({ slot: deleteSkillOverride(slot) });
  });
}

// --- Helpers below main export ---

/**
 * Validate a write request's origin and :slot param. Responds with 403/404 and
 * returns null on failure; returns the validated slot name on success (GET stays
 * ungated, so it doesn't go through here).
 *
 * @param req - Express request
 * @param res - Express response (written on failure)
 * @returns The validated slot name, or null when the request was rejected
 */
function requireSlot(req: Request, res: Response): SkillSlotName | null {
  // Content write: same-origin (incl. a LAN/tunnel webui), localhost, and
  // non-browser clients pass; only a genuinely foreign browser origin 403s.
  if (
    rejectForeignOriginWrite(
      req,
      res,
      "cross-site /skill-overrides writes are not allowed",
    )
  ) {
    return null;
  }

  const slot = req.params.slot;

  if (!isSkillSlotName(slot)) {
    res.status(404).json({ error: `unknown skills slot: ${String(slot)}` });

    return null;
  }

  return slot;
}
