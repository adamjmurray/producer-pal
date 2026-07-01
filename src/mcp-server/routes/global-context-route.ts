// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// REST endpoints for the machine-global user context (~/.producer-pal/
// context.md), authored from the chat UI's Global Context editor. Distinct
// from the device's per-project context, which flows through /config. The
// file lives on the Node-for-Max side (V8 has no filesystem), so the browser
// round-trips through here.

import { type Express, type Request, type Response } from "express";
import {
  readGlobalContext,
  writeGlobalContext,
} from "../helpers/global-context-store.ts";
import { isLocalOrigin } from "../helpers/request-origin.ts";

/**
 * Register the /global-context REST endpoints on the Express app.
 *
 * GET returns the current file contents; PUT overwrites them. Writes are
 * localhost-origin-gated exactly like POST /config: editing global context is
 * a local authoring action, so a cross-origin (LAN/tunnel) browser must not be
 * able to rewrite it. Reads stay ungated (mirrors GET /config).
 *
 * @param app - Express application
 */
export function registerGlobalContextRoutes(app: Express): void {
  app.get("/global-context", (_req: Request, res: Response): void => {
    // Device/AI writes must surface on the next fetch — never cache.
    res.set("Cache-Control", "no-store");
    res.json({ content: readGlobalContext() });
  });

  app.put("/global-context", (req: Request, res: Response): void => {
    // Same localhost gate as POST /config (see handleConfigUpdate): same-origin
    // and non-browser (Origin-less) clients pass; a cross-origin browser 403s.
    const origin = req.get("Origin");

    if (origin && !isLocalOrigin(origin)) {
      res
        .status(403)
        .json({ error: "cross-origin /global-context writes are not allowed" });

      return;
    }

    const content = (req.body as { content?: unknown }).content;

    if (typeof content !== "string") {
      res.status(400).json({ error: "content must be a string" });

      return;
    }

    writeGlobalContext(content);
    // Echo back the stored content so the client can confirm the write. Read is
    // byte-faithful, so this equals what was PUT (keeps the editor's saved
    // draft and the server echo in sync).
    res.json({ content: readGlobalContext() });
  });
}
