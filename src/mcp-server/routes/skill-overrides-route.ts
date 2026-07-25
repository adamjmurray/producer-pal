// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// REST endpoints for the user's built-in skills-fragment overrides
// (~/.producer-pal/skills/<slot>.md). The webui editor lists every slot
// pre-populated with the current built-in (fetched here), Save writes one
// override file (PUT), and "reset to default" clears it (DELETE). A PUT also
// carries the slot's on/off flag, which is independent of the body: either field
// alone is a valid write. The files live on the Node-for-Max side (the browser
// has no filesystem), so the editor round-trips through here.

import { type Express, type Request, type Response } from "express";
import {
  isDisableableSkillSlot,
  isSkillSlotName,
  type SkillSlotName,
} from "#src/skills/skill-slots.ts";
import { requestBody } from "../helpers/http/request-body.ts";
import { rejectForeignOriginWrite } from "../helpers/http/request-origin.ts";
import {
  deleteSkillOverride,
  listSkillSlotStates,
  type SkillSlotWrite,
  writeSkillOverride,
} from "../helpers/skill-overrides-store.ts";

/**
 * Register the /skill-overrides REST endpoints on the Express app. GET lists
 * every slot with its built-in, current override, on/off flag, and drift; PUT
 * writes a slot's `content` and/or `enabled`; DELETE resets one to the built-in
 * (leaving its on/off flag alone). Writes are same-origin content
 * writes (see rejectForeignOriginWrite): a LAN/tunnel webui saving its own
 * content passes, only a foreign browser origin 403s — not strictly
 * localhost-only like POST /config.
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

    const write = parseSlotWrite(req, res, slot);

    if (!write) return;

    res.json({ slot: writeSkillOverride(slot, write) });
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

/**
 * Validate a PUT body into a slot write. Both fields are optional so the editor
 * can save a body and flip the switch independently, but a body carrying
 * NEITHER is a mistake worth reporting rather than a silent no-op write. The
 * driver roots refuse a disable — switching one off would empty the whole blob
 * (see SkillSlotDef.alwaysOn) — so the editor hiding that toggle is enforced
 * here too, not merely conventional.
 *
 * @param req - Express request
 * @param res - Express response (written with a 400 on failure)
 * @param slot - The already-validated slot name
 * @returns The write to apply, or null when the body was rejected
 */
function parseSlotWrite(
  req: Request,
  res: Response,
  slot: SkillSlotName,
): SkillSlotWrite | null {
  const { content, enabled } = requestBody(req);
  const error = writeBodyError(content, enabled, slot);

  if (error != null) {
    res.status(400).json({ error });

    return null;
  }

  return {
    content: content as string | undefined,
    enabled: enabled as boolean | undefined,
  };
}

/**
 * The 400 message for an invalid PUT body, or null when it is acceptable.
 *
 * @param content - The raw `content` field
 * @param enabled - The raw `enabled` field
 * @param slot - The slot being written
 * @returns The error message, or null when the body is valid
 */
function writeBodyError(
  content: unknown,
  enabled: unknown,
  slot: SkillSlotName,
): string | null {
  if (content !== undefined && typeof content !== "string") {
    return "content must be a string";
  }

  if (enabled !== undefined && typeof enabled !== "boolean") {
    return "enabled must be a boolean";
  }

  if (content === undefined && enabled === undefined) {
    return "content must be a string or enabled must be a boolean";
  }

  if (enabled === false && !isDisableableSkillSlot(slot)) {
    return `the "${slot}" skills document cannot be disabled`;
  }

  return null;
}
