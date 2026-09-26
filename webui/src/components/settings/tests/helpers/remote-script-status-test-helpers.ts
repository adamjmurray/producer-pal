// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type RemoteScriptStatus } from "#webui/hooks/settings/use-remote-script";

export const USER_LIBRARY = "/Users/me/Music/Ableton/User Library";

/**
 * A `GET /remote-script` body: not installed, with a User Library detected.
 * @param overrides - Fields to change
 * @returns The status body
 */
export function statusBody(
  overrides: Partial<RemoteScriptStatus> = {},
): RemoteScriptStatus {
  return {
    userLibrary: USER_LIBRARY,
    installed: false,
    installedVersion: null,
    bundledVersion: "1.2.0",
    running: false,
    runningVersion: null,
    liveVersion: "12.1",
    updateAvailable: false,
    installedNewer: false,
    ...overrides,
  };
}
