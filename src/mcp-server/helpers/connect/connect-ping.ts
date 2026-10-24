// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type CallLiveApiFunction } from "../../create-mcp-server.ts";
import {
  remoteScriptPing,
  type RemoteScriptPing,
} from "../../rpc/remote-script/remote-script-client.ts";

/** One remote script ping per ppal-connect, shared by every block that needs it. */
export interface ConnectPing {
  /** The inner call, which forgets the last ping when a new connect starts. */
  inner: CallLiveApiFunction;
  /** Pings on first use within a connect; later callers get the same answer. */
  getPing: () => Promise<RemoteScriptPing>;
}

/**
 * Let the skills and the remote script notice share one `/ping` per connect, so
 * connect doesn't ask Live twice.
 *
 * @param inner - The underlying callLiveApi to wrap
 * @returns The wrapped call and the shared ping getter
 */
export function shareConnectPing(inner: CallLiveApiFunction): ConnectPing {
  let ping: Promise<RemoteScriptPing> | null = null;

  return {
    inner: (tool, args, overrides) => {
      if (tool === "ppal-connect") {
        ping = null;
      }

      return inner(tool, args, overrides);
    },
    getPing: () => (ping ??= remoteScriptPing()),
  };
}
