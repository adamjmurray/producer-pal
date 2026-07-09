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
import { rejectForeignOriginWrite } from "../helpers/request-origin.ts";

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
    // Content write: same-origin (incl. a LAN/tunnel webui saving its own
    // content), localhost, and non-browser clients pass; only a genuinely
    // foreign browser origin 403s. See rejectForeignOriginWrite.
    if (
      rejectForeignOriginWrite(
        req,
        res,
        `cross-site ${routePath} writes are not allowed`,
      )
    ) {
      return;
    }

    // req.body is undefined when the request carries no JSON body (e.g. a
    // missing Content-Type: application/json), so guard before dereferencing —
    // otherwise it TypeErrors into a 500 instead of the intended 400.
    const content = (req.body as { content?: unknown } | undefined)?.content;

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
