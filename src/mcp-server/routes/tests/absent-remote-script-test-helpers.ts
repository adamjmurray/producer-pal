// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type RemoteScriptStatus } from "../../rpc/remote-script/remote-script-status.ts";
import { currentRemoteScriptStatus } from "../../rpc/remote-script/tests/remote-script-test-helpers.ts";

/**
 * The status when no script is installed or running.
 * @param userLibrary - The User Library found, or null
 * @returns The status
 */
export function absentRemoteScriptStatus(
  userLibrary: string | null,
): RemoteScriptStatus {
  return currentRemoteScriptStatus({
    userLibrary,
    installed: false,
    installedVersion: null,
    installedBuild: null,
    running: false,
    runningVersion: null,
    runningBuild: null,
    liveVersion: null,
  });
}
