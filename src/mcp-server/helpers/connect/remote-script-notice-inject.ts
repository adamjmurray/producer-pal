// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type CallLiveApiFunction } from "../../create-mcp-server.ts";
import { type RemoteScriptStatus } from "../../rpc/remote-script/remote-script-status.ts";
import {
  withConnectAppend,
  type WrappedCallLiveApi,
} from "./connect-append.ts";
import { remoteScriptLine } from "./remote-script-line.ts";

/**
 * Wrap a callLiveApi so a successful ppal-connect response says where the
 * remote script stands: not installed, behind this build, installed but not
 * running, needing a Live restart, or running. The script updates separately
 * from the device, so it drifts.
 *
 * Done Node-side: the installed copy is a file in the User Library, which V8
 * can't read. A status that fails or runs long (see shareConnectPing) adds no
 * line.
 *
 * @param inner - The underlying callLiveApi to wrap
 * @param getStatus - Reads the remote script status (shared per connect)
 * @param manageAvailable - Whether the caller can call ppal-manage; when not,
 *   the line points at the Chat UI instead
 * @returns A callLiveApi that appends the status line to connect results
 */
export function withRemoteScriptNotice(
  inner: CallLiveApiFunction,
  getStatus: () => Promise<RemoteScriptStatus>,
  manageAvailable: () => boolean,
): WrappedCallLiveApi {
  return withConnectAppend(inner, async () =>
    remoteScriptLine(await getStatus(), manageAvailable()),
  );
}
