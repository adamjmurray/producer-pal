// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// REST endpoints for the machine-global user context (~/.producer-pal/
// context.md), authored from the chat UI's Global Context editor. Distinct
// from the device's per-project context, which flows through /config. The
// file lives on the Node-for-Max side (V8 has no filesystem), so the browser
// round-trips through here. Also hosts POST /reveal-config-folder — the chat
// UI's "open folder" action for the ~/.producer-pal directory that holds this
// context (see below).

import { type Express, type Request, type Response } from "express";
import {
  readGlobalContext,
  writeGlobalContext,
} from "../helpers/global-context/global-context-store.ts";
import { rejectCrossOriginWrite } from "../helpers/http/request-origin.ts";
import { revealConfigDir } from "../helpers/reveal-config-dir.ts";
import { registerConfigMarkdownRoute } from "./config-markdown-route.ts";

/**
 * Register the /global-context REST endpoints on the Express app. GET returns
 * the file contents; PUT overwrites them (localhost-origin-gated). Also
 * registers POST /reveal-config-folder, which opens ~/.producer-pal in the OS
 * file browser — the folder behind this global context (and the custom
 * instructions, skills, and memory files).
 *
 * @param app - Express application
 */
export function registerGlobalContextRoutes(app: Express): void {
  registerConfigMarkdownRoute(app, "/global-context", {
    read: readGlobalContext,
    write: writeGlobalContext,
  });

  // The browser can't open a native file window itself, so the chat UI POSTs
  // here and Node reveals the folder through the Max patch (see
  // reveal-config-dir.ts). Localhost-gated like /config: the folder opens on
  // the HOST machine, so it's useless to a remote (LAN/tunnel) browser and a
  // foreign page must not be able to spawn file-browser windows on the host.
  app.post("/reveal-config-folder", (req: Request, res: Response): void => {
    if (
      rejectCrossOriginWrite(
        req,
        res,
        "cross-origin /reveal-config-folder requests are not allowed",
      )
    ) {
      return;
    }

    revealConfigDir();
    res.json({ ok: true });
  });
}
