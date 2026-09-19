// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useState } from "preact/hooks";
import { useAbortableLoad } from "#webui/hooks/connection/use-abortable-load";
import { fetchJson } from "#webui/utils/fetch-json";
import {
  getRemoteScriptInstallUrl,
  getRemoteScriptUrl,
} from "#webui/utils/mcp-url";

/** What the server knows about the remote script, as `GET /remote-script`. */
export interface RemoteScriptStatus {
  /** Live's User Library, or null when the server couldn't find it. */
  userLibrary: string | null;
  installed: boolean;
  installedVersion: string | null;
  /** The version this build of Producer Pal ships. */
  bundledVersion: string;
  /** Whether Live currently has the script loaded as a control surface. */
  running: boolean;
  runningVersion: string | null;
  liveVersion: string | null;
  updateAvailable: boolean;
}

export interface UseRemoteScriptReturn {
  status: RemoteScriptStatus | null;
  /** True while a status read is in flight. */
  loading: boolean;
  /** Why the status read failed, or null. */
  loadError: string | null;
  /** Re-read the status. */
  refresh: () => void;
  installing: boolean;
  /** The server's reason for refusing the install, or null. */
  installError: string | null;
  /** Where the last successful install landed, or null. */
  installedPath: string | null;
  /** Copy the bundled script into `userLibrary`, then re-read the status. */
  install: (userLibrary: string) => void;
}

/**
 * Reads the remote script's install state and installs it.
 *
 * Both endpoints are Node-side: the script is files in Live's User Library, not
 * anything the Live API can see.
 * @returns The status, the install action, and their pending/error state
 */
export function useRemoteScript(): UseRemoteScriptReturn {
  const [status, setStatus] = useState<RemoteScriptStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installedPath, setInstalledPath] = useState<string | null>(null);
  // Refresh installs a fresh controller here; the effect below runs that read
  // and aborts it on the way out, so a late answer can't set state on a tab
  // the user has already left.
  const [refreshAbort, setRefreshAbort] = useState<AbortController | null>(
    null,
  );

  const load = useCallback(async (signal: AbortSignal): Promise<void> => {
    setLoading(true);

    try {
      const next = await fetchJson<RemoteScriptStatus>(getRemoteScriptUrl(), {
        label: "Remote script status",
        signal,
      });

      setStatus(next);
      setLoadError(null);
    } catch (err) {
      // An abort is the tab going away, not a failure to show.
      if (signal.aborted) {
        return;
      }

      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useAbortableLoad(load);

  // Null until the first Refresh — useAbortableLoad owns the mount read.
  useEffect(() => {
    if (refreshAbort != null) {
      void load(refreshAbort.signal);
    }

    return () => refreshAbort?.abort();
  }, [load, refreshAbort]);

  const refresh = useCallback((): void => {
    setRefreshAbort(new AbortController());
  }, []);

  const install = useCallback(
    (userLibrary: string): void => {
      setInstalling(true);
      setInstallError(null);

      void postInstall(userLibrary).then((result) => {
        setInstalling(false);

        if (result.error != null) {
          setInstallError(result.error);

          return;
        }

        setInstalledPath(result.path);
        // The summary above the steps has to say "installed" now, and only the
        // server knows the version that landed.
        refresh();
      });
    },
    [refresh],
  );

  return {
    status,
    loading,
    loadError,
    refresh,
    installing,
    installError,
    installedPath,
    install,
  };
}

// --- Helpers below main export ---

/** Either the installed path or the reason the install was refused. */
interface InstallResult {
  path: string | null;
  error: string | null;
}

/**
 * POST the install, folding every failure into one `error` string.
 * @param userLibrary - The User Library to install into
 * @returns The installed path, or the error to show
 */
async function postInstall(userLibrary: string): Promise<InstallResult> {
  try {
    const response = await fetch(getRemoteScriptInstallUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userLibrary }),
    });
    // An older server has no such route, so the 404 comes back as HTML.
    const body = await readJsonBody(response);

    if (!response.ok) {
      return {
        path: null,
        error: body?.error ?? `Install failed (${response.status})`,
      };
    }

    if (typeof body?.path !== "string") {
      // A 200 owes us the path it wrote to; anything else is a broken server,
      // not something to paper over with the folder the user typed.
      return {
        path: null,
        error: body?.error ?? "Install failed: the server didn't say where",
      };
    }

    return { path: body.path, error: null };
  } catch (err) {
    return {
      path: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Parse a JSON response body, or null when the response isn't JSON.
 * @param response - The install response
 * @returns The parsed body, or null
 */
async function readJsonBody(
  response: Response,
): Promise<Partial<{ path: string; error: string }> | null> {
  if (
    response.headers.get("Content-Type")?.includes("application/json") !== true
  ) {
    return null;
  }

  try {
    return (await response.json()) as Partial<{ path: string; error: string }>;
  } catch {
    return null;
  }
}
