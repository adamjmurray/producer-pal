// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { ASK_FOR_LIBRARY } from "#src/mcp-server/rpc/remote-script/install/remote-script-install-reply.ts";
import { type RemoteScriptPing } from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { type OfflineDeps } from "../offline/offline-deps.ts";
import { firstUserLibrary } from "../offline/offline-install-status.ts";
import { type SetupPurpose, SetupFailed } from "./setup-failure.ts";

/**
 * Settle which User Library the device file goes in: the one the call gave,
 * else the one the running remote script reports, else the one Producer Pal
 * finds.
 * @param given - The User Library the call gave, if any
 * @param ping - The remote script's answer
 * @param deps - The library lookup
 * @param purpose - What the call is for
 * @returns Absolute path to the User Library
 * @throws SetupFailed when no library is known
 */
export async function userLibraryFor(
  given: string | undefined,
  ping: RemoteScriptPing,
  deps: Pick<OfflineDeps, "findUserLibrary">,
  purpose: SetupPurpose,
): Promise<string> {
  const library = await firstUserLibrary(
    [given?.trim(), ping.userLibrary],
    deps,
  );

  if (library == null) {
    throw new SetupFailed(
      `couldn't find Live's User Library, so ${purpose.unchanged}. ${ASK_FOR_LIBRARY}`,
    );
  }

  return library;
}
