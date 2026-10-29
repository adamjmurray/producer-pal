// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  UP_TO_DATE_NEW_CHAT,
  remoteScriptAttention,
} from "#src/shared/version-check.ts";
import { VERSION } from "#src/shared/config.ts";
import { type CallLiveApiFunction } from "../../create-mcp-server.ts";
import { type RemoteScriptStatus } from "../../rpc/remote-script/remote-script-status.ts";
import {
  withConnectAppend,
  type WrappedCallLiveApi,
} from "./connect-append.ts";

/**
 * Wrap a callLiveApi so a version check that found nothing to fix ends by
 * suggesting a new chat. Compose it outermost so the line lands last.
 *
 * "Nothing to fix" means the portal (if any) matches the device and the remote
 * script runs this version with nothing pending. An unreadable status doesn't.
 *
 * @param inner - The underlying callLiveApi to wrap
 * @param getStatus - Reads the remote script status (shared with the notice)
 * @param getPortalVersion - Reads this request's portal version, if it has one
 * @returns A callLiveApi that appends the new-chat line when all is current
 */
export function withUpToDate(
  inner: CallLiveApiFunction,
  getStatus: () => Promise<RemoteScriptStatus>,
  getPortalVersion: () => string | undefined,
): WrappedCallLiveApi {
  return withConnectAppend(inner, async () => {
    const portalVersion = getPortalVersion();

    if (portalVersion != null && portalVersion !== VERSION) {
      return null;
    }

    return remoteScriptSettled(await getStatus()) ? UP_TO_DATE_NEW_CHAT : null;
  });
}

/**
 * `remoteScriptAttention` alone misses a copy newer than the device, and a
 * running script whose copy wasn't found.
 * @param status - The remote script status
 * @returns True when there is nothing to update, restart or start
 */
function remoteScriptSettled(status: RemoteScriptStatus): boolean {
  return (
    status.running &&
    status.runningVersion === VERSION &&
    !status.installedNewer &&
    remoteScriptAttention(status) == null
  );
}
