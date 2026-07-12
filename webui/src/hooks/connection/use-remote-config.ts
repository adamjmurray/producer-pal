// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  DEFAULT_NOTATION,
  isNotation,
  type Notation,
} from "#src/shared/notation";
import { type McpStatus } from "#webui/hooks/connection/use-mcp-connection";
import { getConfigUrl } from "#webui/utils/mcp-url";

export interface UseRemoteConfigReturn {
  serverSmallModelMode: boolean;
  serverLiveApiEnabled: boolean;
  serverLiveApiForcedOn: boolean;
  serverNotation: Notation;
  postSmallModelMode: (enabled: boolean) => void;
  postLiveApiEnabled: (enabled: boolean) => Promise<void>;
  postNotation: (notation: Notation) => void;
}

/**
 * Hook for reading remote config from the MCP server and posting updates.
 * Fetches the server's smallModelMode, liveApiEnabled, and notation on mount,
 * MCP reconnection, and window focus (the focus refetch picks up device-side
 * Setup-tab changes when the user returns to the chat UI window).
 * Provides POST functions for syncing local changes to the server on save.
 * @param {McpStatus} mcpStatus - Current MCP connection status
 * @returns {UseRemoteConfigReturn} Server config values and POST functions
 */
export function useRemoteConfig(mcpStatus: McpStatus): UseRemoteConfigReturn {
  const [serverSmallModelMode, setServerSmallModelMode] = useState(false);
  const [serverLiveApiEnabled, setServerLiveApiEnabled] = useState(false);
  const [serverLiveApiForcedOn, setServerLiveApiForcedOn] = useState(false);
  const [serverNotation, setServerNotation] =
    useState<Notation>(DEFAULT_NOTATION);
  // Monotonic counter shared by every config operation — each GET (mount,
  // reconnect, focus) and each POST bumps it. A GET applies its response only
  // while it is still the latest op, and a POST's failure-revert refetch is
  // skipped once a newer op supersedes it. Without this, out-of-order arrivals
  // (an older GET resolving after a newer GET, or a stale GET landing after a
  // POST's optimistic update) could clobber fresher config state.
  const latestConfigSeqRef = useRef(0);

  const fetchConfig = useCallback(async (signal?: AbortSignal) => {
    const seq = ++latestConfigSeqRef.current;

    try {
      const response = await fetch(getConfigUrl(), { signal });

      if (response.ok) {
        const config = (await response.json()) as {
          smallModelMode?: boolean;
          liveApiEnabled?: boolean;
          liveApiForcedOn?: boolean;
          notation?: unknown;
        };

        // Drop a response that a newer GET or POST superseded while it was in
        // flight, so an out-of-order arrival can't overwrite fresher state.
        if (seq !== latestConfigSeqRef.current) return;

        setServerSmallModelMode(Boolean(config.smallModelMode));
        setServerLiveApiEnabled(Boolean(config.liveApiEnabled));
        setServerLiveApiForcedOn(Boolean(config.liveApiForcedOn));
        setServerNotation(
          isNotation(config.notation) ? config.notation : DEFAULT_NOTATION,
        );
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
      // Abort any prior focus refetch still in flight before starting a new one,
      // so rapid refocus doesn't leak controllers (cleanup only aborts the last).
      controller?.abort();
      controller = new AbortController();
      void fetchConfig(controller.signal);
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      controller?.abort();
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchConfig]);

  const postSmallModelMode = useCallback(
    (enabled: boolean) => {
      setServerSmallModelMode(enabled);
      const seq = ++latestConfigSeqRef.current;

      void postConfigField(
        "smallModelMode",
        enabled,
        fetchConfig,
        seq,
        latestConfigSeqRef,
      );
    },
    [fetchConfig],
  );

  const postLiveApiEnabled = useCallback(
    async (enabled: boolean) => {
      setServerLiveApiEnabled(enabled);
      const seq = ++latestConfigSeqRef.current;

      await postConfigField(
        "liveApiEnabled",
        enabled,
        fetchConfig,
        seq,
        latestConfigSeqRef,
      );
    },
    [fetchConfig],
  );

  const postNotation = useCallback(
    (notation: Notation) => {
      setServerNotation(notation);
      const seq = ++latestConfigSeqRef.current;

      void postConfigField(
        "notation",
        notation,
        fetchConfig,
        seq,
        latestConfigSeqRef,
      );
    },
    [fetchConfig],
  );

  return {
    serverSmallModelMode,
    serverLiveApiEnabled,
    serverLiveApiForcedOn,
    serverNotation,
    postSmallModelMode,
    postLiveApiEnabled,
    postNotation,
  };
}

/**
 * POST a single config field and, on failure, refetch /config to revert
 * the caller's optimistic update. Failures are logged so they show up in
 * the devtools console — the chat UI has no toast surface yet, so this is
 * the most we can do without adding one. A non-OK HTTP response (e.g. 400
 * validation) is treated the same as a network error.
 *
 * The revert is skipped when a newer config op (POST or GET) has bumped
 * `latestSeqRef.current` past `seq`. That newer op owns the authoritative
 * state from here on; the older POST's refetch would otherwise race it and
 * could overwrite its value with stale server state.
 *
 * @param field - Config field name
 * @param value - New value
 * @param refetch - Function to re-read authoritative server state
 * @param seq - This POST's sequence number, captured at initiation
 * @param latestSeqRef - Ref holding the hook's latest sequence number
 * @param latestSeqRef.current - Most recently issued config-op sequence number
 */
async function postConfigField(
  field: string,
  value: string | boolean,
  refetch: (signal?: AbortSignal) => Promise<void>,
  seq: number,
  latestSeqRef: { current: number },
): Promise<void> {
  try {
    const response = await fetch(getConfigUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });

    if (!response.ok) {
      const latest = seq === latestSeqRef.current;

      console.error(
        `POST /config (${field}) returned ${response.status}${latest ? "; reverting" : "; skipping revert (newer request in flight)"}`,
      );
      if (latest) await refetch();
    }
  } catch (err) {
    const latest = seq === latestSeqRef.current;

    console.error(
      `POST /config (${field}) failed${latest ? "" : " (skipping revert; newer request in flight)"}:`,
      err,
    );
    if (latest) await refetch();
  }
}
