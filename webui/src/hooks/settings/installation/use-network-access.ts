// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { useCallback, useState } from "preact/hooks";
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
  /** Whether other devices can connect now; null until the server answers. */
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
  "Turn this off? Other devices, including this one, will lose their " +
  "connection to Producer Pal.";

/**
 * Reads "Allow other devices to connect" from the server and changes it there.
 * It is the server's setting (the device shows the same one), so what the box
 * shows is always what the server last reported, never a guess.
 *
 * Turning it on works only from the computer running Live; the server refuses
 * it from any other page and says why. Turning it off from another device cuts
 * that device off, so it asks first.
 *
 * @returns The state, and the setter
 */
export function useNetworkAccess(): UseNetworkAccessReturn {
  const [allowNetwork, setState] = useState<boolean | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const onThisComputer = isLoopbackHost(window.location.host);

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

  const setAllowNetwork = useCallback(
    (enabled: boolean) => {
      if (!enabled && !onThisComputer && !window.confirm(LEAVING_CONFIRM)) {
        return;
      }

      setBusy(true);
      setMessage(null);
      void requestChange(enabled).then((result) => {
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
        : "Lost the connection. If you turned this off from another device, that is expected.",
    };
  }
}
