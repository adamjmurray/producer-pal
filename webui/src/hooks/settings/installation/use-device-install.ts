// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { fetchJson } from "#webui/utils/fetch-json";
import {
  getDeviceInstallActionUrl,
  getDeviceInstallUrl,
} from "#webui/utils/mcp-url";

/** How the User Library copy compares with the running device. */
export type DeviceState =
  | "not-installed"
  | "same"
  | "installed-older"
  | "installed-newer"
  | "different";

/** Why the running device can't be copied. */
export type DeviceInstallProblem =
  | "unknown-source"
  | "unreadable-source"
  | "not-frozen"
  | "no-user-library";

/** What the server knows about the device's own installation, as `GET /device-install`. */
export interface DeviceInstallStatus {
  /** The running device's file, or null before it has said where it is. */
  source: string | null;
  /** Why it can't be installed, or null when it can. */
  problem: DeviceInstallProblem | null;
  /** Live's User Library, or null when the server couldn't find it. */
  userLibrary: string | null;
  /** Where the copy is, or would be. */
  path: string | null;
  /** The copy compared with the running device; null with a problem. */
  state: DeviceState | null;
  /** This device's version. */
  version: string;
  installedVersion: string | null;
  /** Other Producer_Pal .amxd files in the User Library. */
  otherCopies: string[];
}

export interface UseDeviceInstallReturn {
  status: DeviceInstallStatus | null;
  /** True while a status read is in flight. */
  loading: boolean;
  /** Why the status read failed, or null. */
  loadError: string | null;
  /** Re-read the status. */
  refresh: () => void;
  /** True while the install request is in flight. */
  installing: boolean;
  /** Why the install was refused or failed, or null. */
  installError: string | null;
  /** What the last install did and where, or null. */
  installResult: { detail: string; path: string } | null;
  /** Copy the device into `userLibrary`, replacing a newer one only with `force`, then re-read the status. */
  install: (userLibrary: string, force: boolean) => void;
}

/**
 * Reads whether this device is installed in the User Library and installs it.
 *
 * Both endpoints are Node-side: the copy is a file operation the Live API
 * can't see.
 * @returns The status, the install action, and their pending/error state
 */
export function useDeviceInstall(): UseDeviceInstallReturn {
  const [status, setStatus] = useState<DeviceInstallStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installResult, setInstallResult] =
    useState<UseDeviceInstallReturn["installResult"]>(null);
  // The read in flight. Each new read aborts it first, so a slow older answer
  // can't overwrite a newer one.
  const readRef = useRef<AbortController | null>(null);
  // An install can finish after the tab closes; its re-read must not start.
  const unmountedRef = useRef(false);

  const load = useCallback(async (signal: AbortSignal): Promise<void> => {
    setLoading(true);

    try {
      const next = await fetchJson<DeviceInstallStatus>(getDeviceInstallUrl(), {
        label: "Device install status",
        signal,
      });

      if (signal.aborted) {
        return;
      }

      setStatus(next);
      setLoadError(null);
    } catch (err) {
      // A newer read or the tab going away aborted this one: not a failure.
      if (signal.aborted) {
        return;
      }

      setLoadError(err instanceof Error ? err.message : String(err));
      // The status is now out of step with an "Installed to X" message.
      setInstallResult(null);
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

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

  const install = useCallback(
    (userLibrary: string, force: boolean): void => {
      setInstalling(true);
      setInstallError(null);

      void postInstall(userLibrary, force).then((result) => {
        setInstalling(false);

        if (result.error != null) {
          setInstallError(result.error);
          setInstallResult(null);

          return;
        }

        setInstallResult(result.done);
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
    installResult,
    install,
  };
}

// --- Helpers below main export ---

/** What a POST came back with: what was done, or why it wasn't. */
interface PostResult {
  done: { detail: string; path: string } | null;
  error: string | null;
}

/** The server's answer, whichever way it went. */
interface InstallBody {
  detail?: string;
  path?: string;
  error?: string;
}

/**
 * POST the install, folding every failure into one `error` string.
 * @param userLibrary - The User Library to install into
 * @param force - Replace a newer or unorderable copy
 * @returns What was done, or the error to show
 */
async function postInstall(
  userLibrary: string,
  force: boolean,
): Promise<PostResult> {
  try {
    const response = await fetch(getDeviceInstallActionUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userLibrary, force }),
    });
    // An older server has no such route, so the 404 comes back as HTML.
    const body = await readJsonBody(response);

    if (!response.ok) {
      return {
        done: null,
        error: body?.error ?? `Install failed (${response.status})`,
      };
    }

    if (typeof body?.path !== "string" || typeof body.detail !== "string") {
      // A 200 owes us where it wrote and what it did.
      return {
        done: null,
        error: "Install failed: the server didn't say what it did",
      };
    }

    return { done: { detail: body.detail, path: body.path }, error: null };
  } catch (err) {
    return {
      done: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Parse a JSON response body, or null when the response isn't JSON.
 * @param response - The install response
 * @returns The parsed body, or null
 */
async function readJsonBody(response: Response): Promise<InstallBody | null> {
  if (
    response.headers.get("Content-Type")?.includes("application/json") !== true
  ) {
    return null;
  }

  try {
    return (await response.json()) as InstallBody;
  } catch {
    return null;
  }
}
