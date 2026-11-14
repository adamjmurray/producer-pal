// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { isLoopbackHost } from "#src/shared/config";
import { useAbortableLoad } from "#webui/hooks/connection/use-abortable-load";
import { fetchJsonOrNull } from "#webui/utils/fetch-json";
import { getNetworkAccessUrl } from "#webui/utils/mcp-url";

interface NetworkAccessBody {
  allowNetwork?: boolean;
  message?: string;
  error?: string;
}

export interface UseNetworkAccessReturn {
  /** Whether other computers can connect now; null until the server answers. */
  allowNetwork: boolean | null;
  /** True once the first read has failed (not while it is still in flight). */
  loadFailed: boolean;
  /** True while a change is in flight. */
  busy: boolean;
  /** What the server said about the last change, or why it failed. */
  message: string | null;
  /** True when this page is open on the computer running Live. */
  onThisComputer: boolean;
  /** Ask the server to change it. Shows what the server then reports. */
  setAllowNetwork: (enabled: boolean) => void;
}

const LEAVING_CONFIRM =
  "Turn this off? You'll lose your connection to Producer Pal here, and so " +
  "will any other phone or computer.";

/**
 * Reads "Remote Control" from the server and changes it there. It is
 * the server's setting (the device shows the same one), so what the box shows
 * is always what the server last reported, never a guess. It reads again when
 * the window regains focus, since the device can change it meanwhile.
 *
 * Turning it on works only from the computer running Live; the server refuses
 * it from any other page and says why. Turning it off from another phone or
 * computer cuts it off, so it asks first.
 *
 * @returns The state, and the setter
 */
export function useNetworkAccess(): UseNetworkAccessReturn {
  const [allowNetwork, setState] = useState<boolean | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const onThisComputer = isLoopbackHost(window.location.host);
  // Counts the starts and ends of changes: odd while one is in flight, and
  // different after any, which is how a read tells it overlapped one.
  const changesRef = useRef(0);

  const load = useCallback(async (signal: AbortSignal) => {
    const body = await fetchJsonOrNull<NetworkAccessBody>(
      getNetworkAccessUrl(),
      signal,
    );

    // An aborted read (the tab closed) says nothing about the server.
    if (signal.aborted) {
      return;
    }

    if (typeof body?.allowNetwork === "boolean") {
      setState(body.allowNetwork);
    } else {
      setLoadFailed(true);
    }
  }, []);

  useAbortableLoad(load);

  // A read that overlaps a change is dropped: it may predate the change, and
  // the change's own answer is the newer one.
  const refresh = useCallback(async (signal: AbortSignal) => {
    const startedAt = changesRef.current;

    if (startedAt % 2 === 1) {
      return;
    }

    const body = await fetchJsonOrNull<NetworkAccessBody>(
      getNetworkAccessUrl(),
      signal,
    );

    if (
      signal.aborted ||
      changesRef.current !== startedAt ||
      typeof body?.allowNetwork !== "boolean"
    ) {
      return;
    }

    setState(body.allowNetwork);
    setLoadFailed(false);
  }, []);

  useEffect(() => onWindowReturn(refresh), [refresh]);

  const setAllowNetwork = useCallback(
    (enabled: boolean) => {
      if (!enabled && !onThisComputer && !window.confirm(LEAVING_CONFIRM)) {
        return;
      }

      changesRef.current++;
      setBusy(true);
      setMessage(null);
      void requestChange(enabled).then((result) => {
        changesRef.current++;

        if (result.allowNetwork != null) {
          setState(result.allowNetwork);
        }

        setMessage(result.message ?? null);
        setBusy(false);
      });
    },
    [onThisComputer],
  );

  return {
    allowNetwork,
    loadFailed,
    busy,
    message,
    onThisComputer,
    setAllowNetwork,
  };
}

// --- Helpers below main export ---

/**
 * Run a read when the window regains focus or the page becomes visible. A newer
 * read aborts the one still running (a tab switch fires both events).
 * @param refresh - The read, given its abort signal
 * @returns Stops listening and aborts the read still running
 */
function onWindowReturn(
  refresh: (signal: AbortSignal) => Promise<void>,
): () => void {
  let controller: AbortController | undefined;

  const run = (): void => {
    controller?.abort();
    controller = new AbortController();
    void refresh(controller.signal);
  };

  const onVisibility = (): void => {
    if (document.visibilityState === "visible") {
      run();
    }
  };

  window.addEventListener("focus", run);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    window.removeEventListener("focus", run);
    document.removeEventListener("visibilitychange", onVisibility);
    controller?.abort();
  };
}

/**
 * PUT the new value. The answer is the server's: its state if it gave one, and
 * its message, or why the call failed. A refusal changes nothing, so the box
 * keeps its old value.
 * @param enabled - The requested value
 * @returns What the server reported
 */
async function requestChange(enabled: boolean): Promise<NetworkAccessBody> {
  try {
    const response = await fetch(getNetworkAccessUrl(), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowNetwork: enabled }),
    });
    const body = (await response.json().catch(() => ({}))) as NetworkAccessBody;

    if (response.ok) {
      return body;
    }

    return {
      message: body.error ?? `The server answered ${response.status}.`,
    };
  } catch {
    return {
      message: enabled
        ? "Couldn't reach the server."
        : "Lost the connection. If you just turned this off, that is expected.",
    };
  }
}
