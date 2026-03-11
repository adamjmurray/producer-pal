// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useState } from "preact/hooks";
import { type McpStatus } from "#webui/hooks/connection/use-mcp-connection";
import { getConfigUrl } from "#webui/utils/mcp-url";

export interface UseRemoteConfigReturn {
  serverSmallModelMode: boolean;
  postSmallModelMode: (enabled: boolean) => void;
}

/**
 * Hook for reading remote config from the MCP server and posting updates.
 * Fetches the server's smallModelMode on mount, MCP reconnection, and window focus.
 * Provides a POST function for syncing local changes to the server on settings save.
 * @param {McpStatus} mcpStatus - Current MCP connection status
 * @returns {UseRemoteConfigReturn} Server config value and POST function
 */
export function useRemoteConfig(mcpStatus: McpStatus): UseRemoteConfigReturn {
  const [serverSmallModelMode, setServerSmallModelMode] = useState(false);

  const fetchConfig = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(getConfigUrl(), { signal });

      if (response.ok) {
        const config = (await response.json()) as { smallModelMode?: boolean };

        setServerSmallModelMode(Boolean(config.smallModelMode));
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
    const controller = new AbortController();

    const handleFocus = () => {
      void fetchConfig(controller.signal);
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      controller.abort();
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchConfig]);

  const postSmallModelMode = useCallback((enabled: boolean) => {
    setServerSmallModelMode(enabled);
    void fetch(getConfigUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ smallModelMode: enabled }),
    }).catch(() => {
      // Server not available, ignore
    });
  }, []);

  return { serverSmallModelMode, postSmallModelMode };
}
