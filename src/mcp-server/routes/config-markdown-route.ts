// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Generic REST endpoints for a machine-global user-content markdown slot under
// ~/.producer-pal/ (global context, custom system prompt). GET returns the
// current file contents; PUT overwrites them. The file lives on the
// Node-for-Max side (the browser has no filesystem), so the chat UI editors
// round-trip through here.

import { type Express, type Request, type Response } from "express";
import { isLocalOrigin } from "../helpers/request-origin.ts";

/** Read/write transport for one config markdown slot. */
export interface ConfigMarkdownHandlers {
  /** Read the current file contents ("" when absent). */
  read: () => string;
  /** Overwrite the file contents. */
  write: (content: string) => void;
}

/**
 * Register GET/PUT handlers for a single config markdown slot on the Express
 * app.
 *
 * GET returns the current file contents; PUT overwrites them. Writes are
 * localhost-origin-gated exactly like POST /config: editing user content is a
 * local authoring action, so a cross-origin (LAN/tunnel) browser must not be
 * able to rewrite it. Reads stay ungated (mirrors GET /config).
 *
 * @param app - Express application
 * @param routePath - Endpoint path (e.g. "/global-context")
 * @param handlers - Read/write transport for the slot
 */
export function registerConfigMarkdownRoute(
  app: Express,
  routePath: string,
  handlers: ConfigMarkdownHandlers,
): void {
  app.get(routePath, (_req: Request, res: Response): void => {
    // Device/AI/hand writes must surface on the next fetch — never cache.
    res.set("Cache-Control", "no-store");
    res.json({ content: handlers.read() });
  });

  app.put(routePath, (req: Request, res: Response): void => {
    // Same localhost gate as POST /config (see handleConfigUpdate): same-origin
    // and non-browser (Origin-less) clients pass; a cross-origin browser 403s.
    const origin = req.get("Origin");

    if (origin && !isLocalOrigin(origin)) {
      res
        .status(403)
        .json({ error: `cross-origin ${routePath} writes are not allowed` });

      return;
    }

    const content = (req.body as { content?: unknown }).content;

    if (typeof content !== "string") {
      res.status(400).json({ error: "content must be a string" });

      return;
    }

    handlers.write(content);
    // Echo back the stored content so the client can confirm the write. Reads
    // are byte-faithful, so this equals what was PUT (keeps the editor's saved
    // draft and the server echo in sync).
    res.json({ content: handlers.read() });
  });
}
