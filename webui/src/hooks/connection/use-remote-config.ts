// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useState } from "preact/hooks";
import { type McpStatus } from "#webui/hooks/connection/use-mcp-connection";
import { getConfigUrl } from "#webui/utils/mcp-url";

export interface UseRemoteConfigReturn {
  serverSmallModelMode: boolean;
  serverLiveApiEnabled: boolean;
  serverLiveApiForcedOn: boolean;
  postSmallModelMode: (enabled: boolean) => void;
  postLiveApiEnabled: (enabled: boolean) => Promise<void>;
}

/**
 * Hook for reading remote config from the MCP server and posting updates.
 * Fetches the server's smallModelMode and liveApiEnabled on mount, MCP
 * reconnection, and window focus (the focus refetch picks up device-side
 * Setup-tab toggle changes when the user returns to the chat UI window).
 * Provides POST functions for syncing local changes to the server on save.
 * @param {McpStatus} mcpStatus - Current MCP connection status
 * @returns {UseRemoteConfigReturn} Server config values and POST functions
 */
export function useRemoteConfig(mcpStatus: McpStatus): UseRemoteConfigReturn {
  const [serverSmallModelMode, setServerSmallModelMode] = useState(false);
  const [serverLiveApiEnabled, setServerLiveApiEnabled] = useState(false);
  const [serverLiveApiForcedOn, setServerLiveApiForcedOn] = useState(false);

  const fetchConfig = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(getConfigUrl(), { signal });

      if (response.ok) {
        const config = (await response.json()) as {
          smallModelMode?: boolean;
          liveApiEnabled?: boolean;
          liveApiForcedOn?: boolean;
        };

        setServerSmallModelMode(Boolean(config.smallModelMode));
        setServerLiveApiEnabled(Boolean(config.liveApiEnabled));
        setServerLiveApiForcedOn(Boolean(config.liveApiForcedOn));
      }
    } catch {
      // Server not available or request aborted, keep current state
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    const controller = new AbortController();

    void fetchConfig(controller.signal);

    return () => controller.abort();
  }, [fetchConfig]);

  // Re-fetch when MCP connection succeeds (handles server restart)
  useEffect(() => {
    const controller = new AbortController();

    if (mcpStatus === "connected") {
      void fetchConfig(controller.signal);
    }

    return () => controller.abort();
  }, [mcpStatus, fetchConfig]);

  // Re-fetch when window gains focus (syncs with Max device changes)
  useEffect(() => {
    let controller: AbortController | undefined;

    const handleFocus = () => {
      controller = new AbortController();
      void fetchConfig(controller.signal);
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      controller?.abort();
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchConfig]);

  const postSmallModelMode = useCallback((enabled: boolean) => {
    setServerSmallModelMode(enabled);
    void fetch(getConfigUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ smallModelMode: enabled }),
    })
      /* v8 ignore start -- empty catch: server unavailable is non-actionable */
      .catch(() => {});
    /* v8 ignore stop */
  }, []);

  const postLiveApiEnabled = useCallback(async (enabled: boolean) => {
    setServerLiveApiEnabled(enabled);

    try {
      await fetch(getConfigUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liveApiEnabled: enabled }),
      });
    } catch {
      // Server unavailable — optimistic state already set; nothing to do.
    }
  }, []);

  return {
    serverSmallModelMode,
    serverLiveApiEnabled,
    serverLiveApiForcedOn,
    postSmallModelMode,
    postLiveApiEnabled,
  };
}
