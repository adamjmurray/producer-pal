// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { errorMessage } from "#src/shared/error-message";
import { fetchJson } from "#webui/utils/fetch-json";

/** Where to read a status and what to do with each answer. Every field must be stable across renders. */
export interface InstallStatusSource<T> {
  getUrl: () => string;
  /** Names the read in fetch errors. */
  label: string;
  onRead?: (status: T) => void;
  onLoadError?: () => void;
}

export interface UseInstallStatusReturn<T> {
  status: T | null;
  loading: boolean;
  loadError: string | null;
  /** Re-read the status. Does nothing once unmounted. */
  refresh: () => void;
}

/**
 * Reads an install status on mount and on each `refresh`.
 * @param source - The endpoint, its label, and the read callbacks
 * @returns The latest status and its pending/error state
 */
export function useInstallStatus<T>(
  source: InstallStatusSource<T>,
): UseInstallStatusReturn<T> {
  const { getUrl, label, onRead, onLoadError } = source;
  const [status, setStatus] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The read in flight. Each new read aborts it first, so a slow older answer
  // can't overwrite a newer one.
  const readRef = useRef<AbortController | null>(null);
  // An install can finish after the tab closes; its re-read must not start.
  const unmountedRef = useRef(false);

  const load = useCallback(
    async (signal: AbortSignal): Promise<void> => {
      setLoading(true);

      try {
        const next = await fetchJson<T>(getUrl(), { label, signal });

        if (signal.aborted) {
          return;
        }

        setStatus(next);
        setLoadError(null);
        onRead?.(next);
      } catch (err) {
        // A newer read or the tab going away aborted this one: not a failure.
        if (signal.aborted) {
          return;
        }

        setLoadError(errorMessage(err));
        onLoadError?.();
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },
    [getUrl, label, onRead, onLoadError],
  );

  const refresh = useCallback((): void => {
    if (unmountedRef.current) {
      return;
    }

    readRef.current?.abort();
    const controller = new AbortController();

    readRef.current = controller;
    void load(controller.signal);
  }, [load]);

  useEffect(() => {
    unmountedRef.current = false;
    refresh();

    return () => {
      unmountedRef.current = true;
      readRef.current?.abort();
    };
  }, [refresh]);

  return { status, loading, loadError, refresh };
}
