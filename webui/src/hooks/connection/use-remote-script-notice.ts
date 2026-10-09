// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { remoteScriptAttention } from "#src/shared/version-check";
import { type McpStatus } from "#webui/hooks/connection/use-mcp-connection";
import {
  subscribeRemoteScriptStatus,
  type RemoteScriptStatus,
} from "#webui/hooks/settings/use-remote-script";
import { fetchJsonOrNull } from "#webui/utils/fetch-json";
import { getRemoteScriptUrl } from "#webui/utils/mcp-url";

/** What the remote script needs from the user, or null when nothing. */
export type RemoteScriptNotice = "update" | "restart" | null;

/**
 * Whether the header should flag the remote script: an update to install, or a
 * Live restart to load a different copy than the one running.
 *
 * Reads the status on mount, when the window regains focus, and when the MCP
 * connection comes back (Live restarted). A later successful read clears the
 * badge; a failed read leaves it as it was. It also follows the Remote Script
 * tab's own reads, so an Update there changes the badge without waiting.
 * @param mcpStatus - The MCP connection status; a switch to "connected" re-reads
 * @returns "update", "restart", or null
 */
export function useRemoteScriptNotice(
  mcpStatus: McpStatus,
): RemoteScriptNotice {
  const [status, setStatus] = useState<RemoteScriptStatus | null>(null);
  // The read in flight. Every new read aborts it first, so an older answer
  // can't overwrite a newer one.
  const readRef = useRef<AbortController | null>(null);

  // The badge is decoration: a failed read just leaves it as it was.
  const refresh = useCallback(() => {
    readRef.current?.abort();

    const controller = new AbortController();

    readRef.current = controller;

    void fetchJsonOrNull<RemoteScriptStatus>(
      getRemoteScriptUrl(),
      controller.signal,
    ).then((next) => {
      if (next != null && !controller.signal.aborted) {
        setStatus(next);
      }
    });
  }, []);

  useEffect(() => {
    refresh();

    // The tab's read is newer than any read still in flight here.
    const unsubscribe = subscribeRemoteScriptStatus((next) => {
      readRef.current?.abort();
      setStatus(next);
    });

    window.addEventListener("focus", refresh);

    return () => {
      unsubscribe();
      window.removeEventListener("focus", refresh);
      readRef.current?.abort();
    };
  }, [refresh]);

  useEffect(() => {
    if (mcpStatus === "connected") {
      refresh();
    }
  }, [mcpStatus, refresh]);

  return status == null ? null : remoteScriptAttention(status);
}
