// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// REST endpoints for the machine-global settings file (~/.producer-pal/
// settings.json). Distinct from /config, which is the device's own live state:
// these persist on disk across Live sessions and belong to the machine, not the
// project. The file is Node-side (the browser has no filesystem), so the chat UI
// round-trips through here.

import { type Express, type Request, type Response } from "express";
import {
  type GlobalSettings,
  readGlobalSettings,
  updateGlobalSettings,
} from "../../helpers/config-store/global-settings-store.ts";
import { rejectForeignOriginWrite } from "../../helpers/http/request-origin.ts";

/**
 * Register the /settings REST endpoints on the Express app. GET returns the
 * current settings; PUT merges a partial update and returns the result.
 *
 * The PUT is a same-origin write (see rejectForeignOriginWrite): a LAN/tunnel
 * webui changing its own settings passes, only a genuinely foreign browser
 * origin 403s. Reads stay ungated.
 *
 * @param app - Express application
 */
export function registerGlobalSettingsRoutes(app: Express): void {
  app.get("/settings", (_req: Request, res: Response): void => {
    // Hand edits and device-side writes must surface on the next fetch.
    res.set("Cache-Control", "no-store");
    res.json(readGlobalSettings());
  });

  app.put("/settings", (req: Request, res: Response): void => {
    if (
      rejectForeignOriginWrite(
        req,
        res,
        "cross-site /settings writes are not allowed",
      )
    ) {
      return;
    }

    // req.body is undefined when the request carries no JSON body (e.g. a
    // missing Content-Type: application/json), so guard before dereferencing —
    // otherwise it TypeErrors into a 500 instead of the intended 400.
    const body = req.body as Record<string, unknown> | undefined;

    if (body == null || typeof body !== "object") {
      res.status(400).json({ error: "body must be a JSON object" });

      return;
    }

    const patch = parsePatch(body);

    if (typeof patch === "string") {
      res.status(400).json({ error: patch });

      return;
    }

    res.json(updateGlobalSettings(patch));
  });
}

/**
 * Validate a PUT body into a settings patch. Only known keys are accepted, and
 * only when correctly typed — an unrecognized or mistyped field is a 400 rather
 * than a silent no-op, so a client typo surfaces instead of looking like it
 * saved.
 *
 * @param body - Parsed JSON request body
 * @returns The patch, or an error message describing the first problem
 */
function parsePatch(
  body: Record<string, unknown>,
): Partial<GlobalSettings> | string {
  const patch: Partial<GlobalSettings> = {};

  for (const [key, value] of Object.entries(body)) {
    if (key === "autoUpdateCheck") {
      if (typeof value !== "boolean")
        return "autoUpdateCheck must be a boolean";
      patch.autoUpdateCheck = value;
    } else if (key === "dismissedUpdateVersion") {
      if (value !== null && typeof value !== "string") {
        return "dismissedUpdateVersion must be a string or null";
      }

      patch.dismissedUpdateVersion = value;
    } else {
      return `unknown setting: ${key}`;
    }
  }

  return patch;
}
