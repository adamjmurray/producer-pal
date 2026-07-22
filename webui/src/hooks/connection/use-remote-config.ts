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
  // Two counters coordinate overlapping config operations:
  //   configSeqRef       — monotonic allocator; every GET (mount, reconnect,
  //                        focus) and every POST takes a unique, issue-ordered
  //                        token from it at initiation.
  //   latestConfigSeqRef — token of the operation that currently OWNS the
  //                        displayed state. A POST claims ownership synchronously
  //                        (it sets state optimistically); a GET claims it only
  //                        when it actually applies a response. A GET that is
  //                        aborted or non-OK allocates a token but never claims
  //                        ownership, so it can't falsely supersede an in-flight
  //                        POST's failure-revert, and a stale GET can't clobber
  //                        fresher state. postConfigField skips its revert only
  //                        when a newer op has genuinely taken ownership.
  const configSeqRef = useRef(0);
  const latestConfigSeqRef = useRef(0);

  const fetchConfig = useCallback(async (signal?: AbortSignal) => {
    const seq = ++configSeqRef.current;

    try {
      const response = await fetch(getConfigUrl(), { signal });

      if (response.ok) {
        const config = (await response.json()) as {
          smallModelMode?: boolean;
          liveApiEnabled?: boolean;
          liveApiForcedOn?: boolean;
          notation?: unknown;
        };

        // Drop a response a newer operation already owns, and otherwise claim
        // ownership at apply time (not call time) so a GET that never applies
        // can't supersede an in-flight POST's revert.
        if (seq < latestConfigSeqRef.current) return;
        latestConfigSeqRef.current = seq;

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
      const seq = ++configSeqRef.current;

      latestConfigSeqRef.current = seq;
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
      const seq = ++configSeqRef.current;

      latestConfigSeqRef.current = seq;
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
      const seq = ++configSeqRef.current;

      latestConfigSeqRef.current = seq;
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
 * The revert is skipped when a newer config op (a POST, or a GET that applied
 * a response) has taken ownership past `seq` — i.e. `latestSeqRef.current`
 * advanced. That newer op owns the authoritative state from here on; the older
 * POST's refetch would otherwise race it and could overwrite its value with
 * stale server state. A GET that was aborted or non-OK never takes ownership,
 * so it can't suppress this revert.
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
