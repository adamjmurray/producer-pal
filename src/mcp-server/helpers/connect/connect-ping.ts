// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type CallLiveApiFunction } from "../../create-mcp-server.ts";
import {
  remoteScriptPing,
  type RemoteScriptPing,
} from "../../rpc/remote-script/remote-script-client.ts";
import {
  remoteScriptStatus,
  type RemoteScriptStatus,
} from "../../rpc/remote-script/remote-script-status.ts";

/** Reading the status must not hold connect up. */
const STATUS_TIMEOUT_MS = 1500;

/** One ping and one status read per ppal-connect, shared by every block. */
export interface ConnectPing {
  /** The inner call, which forgets the last ping when a new connect starts. */
  inner: CallLiveApiFunction;
  /** Pings on first use within a connect; later callers get the same answer. */
  getPing: () => Promise<RemoteScriptPing>;
  /** Like getPing, for the status; gives up after STATUS_TIMEOUT_MS. */
  getStatus: () => Promise<RemoteScriptStatus>;
}

/**
 * Let the skills and the remote script blocks share one `/ping` and one status
 * read per connect, so connect doesn't ask Live twice.
 *
 * @param inner - The underlying callLiveApi to wrap
 * @returns The wrapped call and the shared ping getter
 */
export function shareConnectPing(inner: CallLiveApiFunction): ConnectPing {
  let ping: Promise<RemoteScriptPing> | null = null;
  let status: Promise<RemoteScriptStatus> | null = null;
  const getPing = (): Promise<RemoteScriptPing> =>
    (ping ??= remoteScriptPing());

  return {
    inner: (tool, args, overrides) => {
      if (tool === "ppal-connect") {
        ping = null;
        status = null;
      }

      return inner(tool, args, overrides);
    },
    getPing,
    getStatus: () => (status ??= readStatus(getPing)),
  };
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
