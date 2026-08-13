// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { VERSION } from "#src/shared/config.ts";
import { checkForUpdate, type UpdateInfo } from "#src/shared/version-check.ts";
import { readGlobalSettings } from "../config-store/global-settings-store.ts";

// GitHub's unauthenticated API allows 60 requests per hour PER IP, shared across
// everything on that IP. Producer Pal must not spend that budget on telling you
// about itself, so the whole process makes ONE request, when the Max for Live
// device loads the server.
//
// Every consumer reads this promise instead of calling GitHub: the startup log
// and the `update_available` outlet, and every `GET /update` the chat UI makes.
// The chat UI in particular used to fetch GitHub directly on each mount, which
// is per open of a window people open and close all session.
//
// A failed check caches its null too, deliberately. Retrying is exactly what
// turns one request into many, and the cost of not retrying is that an update is
// announced one Live-session late.
let pending: Promise<UpdateInfo | null> | null = null;

/**
 * The process-wide update check: performed once, then served from memory, and
 * filtered through the user's global settings.
 *
 * The settings file is re-read on every call rather than captured at startup, so
 * turning checking off — or dismissing a version — takes effect immediately in
 * both the chat UI and the device rather than at the next Live restart. It's a
 * tiny local read on a route the UI hits once per window open.
 *
 * @returns The available update, or null if up to date, opted out, dismissed, or
 *   the check failed
 */
export async function getUpdate(): Promise<UpdateInfo | null> {
  const settings = readGlobalSettings();

  // Opted out: never touch the network, not even once. This is the whole point
  // of the setting for users who don't want Producer Pal reaching out to GitHub.
  if (!settings.autoUpdateCheck) return null;

  // The catch enforces never-rejects here rather than trusting checkForUpdate to
  // keep swallowing its own failures. This promise is cached for the life of the
  // process, so one rejection would hang `GET /update` for the whole session.
  pending ??= checkForUpdate(VERSION).catch(() => null);

  const update = await pending;

  // Dismissal is applied here, not per-surface, so the device and the chat UI
  // share one answer.
  if (update?.version === settings.dismissedUpdateVersion) return null;

  return update;
}
