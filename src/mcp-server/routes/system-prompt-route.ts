// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// REST endpoints for the user's custom system prompt (~/.producer-pal/
// system-prompt.md), authored from the chat UI's Instructions editor. The chat
// UI fetches it to fully replace the built-in system instruction when
// non-empty. The file lives on the Node-for-Max side (the browser has no
// filesystem), so the editor round-trips through here. GET/PUT also carry
// fork-time drift state (`meta`) so the editor can flag "the default changed
// since you forked".

import { type Express } from "express";
import {
  readSystemPrompt,
  readSystemPromptState,
  writeSystemPrompt,
} from "../helpers/system-prompt-store.ts";
import { registerConfigMarkdownRoute } from "./config-markdown-route.ts";

/**
 * Register the /system-prompt REST endpoints on the Express app. GET returns
 * the prompt body plus its drift state; PUT overwrites it (localhost-origin-
 * gated) and echoes the post-write drift state.
 *
 * @param app - Express application
 */
export function registerSystemPromptRoutes(app: Express): void {
  registerConfigMarkdownRoute(app, "/system-prompt", {
    read: readSystemPrompt,
    write: writeSystemPrompt,
    meta: () => {
      const { drifted, forkedFromVersion } = readSystemPromptState();

      return { drifted, forkedFromVersion };
    },
  });
}
