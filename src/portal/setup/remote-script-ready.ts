// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type RemoteScriptPing } from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { outdatedScript } from "#src/mcp-server/rpc/remote-script/port/remote-script-version.ts";
import { INSTALL_WITH_TOOL } from "#src/tools/shared/remote-script/remote-script-setup.ts";
import { type OfflineDeps } from "../offline/offline-deps.ts";
import { type SetupPurpose, SetupFailed, sentence } from "./setup-failure.ts";

/**
 * Check the remote script is running and new enough for the call.
 * @param deps - The ping
 * @param purpose - What the call is for
 * @returns The ping, which names the User Library when the script knows it
 * @throws SetupFailed when the script isn't running or is too old
 */
export async function remoteScriptReady(
  deps: Pick<OfflineDeps, "ping">,
  purpose: SetupPurpose,
): Promise<RemoteScriptPing> {
  const ping = await deps.ping();

  if (!ping.running) {
    throw new SetupFailed(
      `the Producer Pal remote script isn't running, and ${purpose.doing} needs it, so ${purpose.unchanged}. Run ${INSTALL_WITH_TOOL} (if it isn't installed), then ask the user to restart Live and choose Producer Pal as a Control Surface in Settings → Link, Tempo & MIDI. Then call ${purpose.action} again.`,
    );
  }

  const outdated = outdatedScript(ping.scriptVersion);

  if (outdated != null) {
    throw new SetupFailed(
      `${outdated}. ${sentence(purpose.unchanged)}. Call ${purpose.action} again after the user restarts Live.`,
    );
  }

  return ping;
}
