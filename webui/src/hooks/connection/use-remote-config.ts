// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useState } from "preact/hooks";
import { type McpStatus } from "#webui/hooks/connection/use-mcp-connection";
import { getConfigUrl } from "#webui/utils/mcp-url";

interface UseRemoteConfigReturn {
  smallModelMode: boolean;
  setSmallModelMode: (enabled: boolean) => void;
}

/**
 * Hook for reading and updating remote config from the MCP server.
 * Changes are applied immediately (no save/cancel pattern).
 * Re-fetches on mount, MCP reconnection, and window focus.
 * @param {McpStatus} mcpStatus - Current MCP connection status
 * @returns {UseRemoteConfigReturn} Remote config state and setter
 */
export function useRemoteConfig(mcpStatus: McpStatus): UseRemoteConfigReturn {
  const [smallModelMode, setSmallModelModeState] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const response = await fetch(getConfigUrl());

      if (response.ok) {
        const config = (await response.json()) as { smallModelMode?: boolean };

        setSmallModelModeState(Boolean(config.smallModelMode));
      }
    } catch {
      // Server not available, keep current state
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  // Re-fetch when MCP connection succeeds (handles server restart)
  useEffect(() => {
    if (mcpStatus === "connected") {
      void fetchConfig();
    }
  }, [mcpStatus, fetchConfig]);

  // Re-fetch when window gains focus (syncs with Max device changes)
  useEffect(() => {
    const handleFocus = () => {
      void fetchConfig();
    };

    window.addEventListener("focus", handleFocus);

    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchConfig]);

  const setSmallModelMode = useCallback((enabled: boolean) => {
    setSmallModelModeState(enabled);
    void fetch(getConfigUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ smallModelMode: enabled }),
    }).catch(() => {
      setSmallModelModeState(!enabled);
    });
  }, []);

  return { smallModelMode, setSmallModelMode };
}
