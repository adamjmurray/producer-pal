// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// REST endpoints for the machine-global user context (~/.producer-pal/
// context.md), authored from the chat UI's Global Context editor. Distinct
// from the device's per-project context, which flows through /config. The
// file lives on the Node-for-Max side (V8 has no filesystem), so the browser
// round-trips through here.

import { type Express } from "express";
import {
  readGlobalContext,
  writeGlobalContext,
} from "../helpers/global-context/global-context-store.ts";
import { registerConfigMarkdownRoute } from "./config-markdown-route.ts";

/**
 * Register the /global-context REST endpoints on the Express app. GET returns
 * the file contents; PUT overwrites them (localhost-origin-gated).
 *
 * @param app - Express application
 */
export function registerGlobalContextRoutes(app: Express): void {
  registerConfigMarkdownRoute(app, "/global-context", {
    read: readGlobalContext,
    write: writeGlobalContext,
  });
}
