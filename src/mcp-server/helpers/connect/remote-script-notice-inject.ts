// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { VERSION } from "#src/shared/config.ts";
import { remoteScriptAttention } from "#src/shared/version-check.ts";
import { type CallLiveApiFunction } from "../../create-mcp-server.ts";
import { type RemoteScriptPing } from "../../rpc/remote-script/remote-script-client.ts";
import {
  remoteScriptStatus,
  type RemoteScriptStatus,
} from "../../rpc/remote-script/remote-script-status.ts";
import {
  withConnectAppend,
  type WrappedCallLiveApi,
} from "./connect-append.ts";

/** Reading the status must not hold connect up. */
const STATUS_TIMEOUT_MS = 1500;

/**
 * Wrap a callLiveApi so a successful ppal-connect response says when the remote
 * script needs updating or Live needs restarting to load it. The script
 * updates separately from the device, so it drifts.
 *
 * Done Node-side: the installed copy is a file in the User Library, which V8
 * can't read. A status that fails or runs long adds no line.
 *
 * @param inner - The underlying callLiveApi to wrap
 * @param getPing - Reads the remote script ping (shared with the skills)
 * @returns A callLiveApi that appends the notice line to connect results
 */
export function withRemoteScriptNotice(
  inner: CallLiveApiFunction,
  getPing: () => Promise<RemoteScriptPing>,
): WrappedCallLiveApi {
  return withConnectAppend(inner, async () =>
    remoteScriptLine(await readStatus(getPing)),
  );
}

/**
 * The connect line for a remote script status.
 *
 * @param status - The remote script status
 * @returns The line, or null when the script needs nothing
 */
function remoteScriptLine(status: RemoteScriptStatus): string | null {
  const action = remoteScriptAttention(status);

  if (action === "update") {
    const installed =
      status.installedVersion == null
        ? "an unknown version"
        : `v${status.installedVersion}`;

    return `remoteScript: ${installed} is installed, but this device ships v${VERSION}. Tell the user to update it (Chat UI > Settings > Remote Script > Update), then restart Live.`;
  }

  if (action === "restart") {
    return `remoteScript: Live is running v${status.runningVersion}, but v${status.installedVersion} is installed. Tell the user to restart Live.`;
  }

  return null;
}

/**
 * Read the status from a ping, giving up after STATUS_TIMEOUT_MS.
 *
 * @param getPing - Reads the remote script ping
 * @returns The status
 * @throws When the status takes too long or can't be read
 */
async function readStatus(
  getPing: () => Promise<RemoteScriptPing>,
): Promise<RemoteScriptStatus> {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      getPing().then((ping) => remoteScriptStatus(ping)),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("remote script status timed out")),
          STATUS_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
