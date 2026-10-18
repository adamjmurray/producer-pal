// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { useCallback, useState } from "preact/hooks";
import {
  getRemoteScriptInstallUrl,
  getRemoteScriptUrl,
} from "#webui/utils/mcp-url";
import { postInstallRequest } from "./helpers/post-install-request";
import {
  useInstallStatus,
  type UseInstallStatusReturn,
} from "./helpers/use-install-status";

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
  /** The port another program answered on, when it isn't our script. */
  otherOnPort: number | null;
  /** Installed is older than this build (or unreadable). */
  updateAvailable: boolean;
  /** Installed is newer than this build, so installing downgrades it. */
  installedNewer: boolean;
}

type StatusListener = (status: RemoteScriptStatus) => void;

const statusListeners = new Set<StatusListener>();

/**
 * Follow every status the Installation tab reads, so the header badge stays
 * in step with an install without a second request.
 * @param listener - Called with each status the tab reads
 * @returns Stops listening
 */
export function subscribeRemoteScriptStatus(
  listener: StatusListener,
): () => void {
  statusListeners.add(listener);

  return () => {
    statusListeners.delete(listener);
  };
}

export interface UseRemoteScriptReturn extends UseInstallStatusReturn<RemoteScriptStatus> {
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
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installedPath, setInstalledPath] = useState<string | null>(null);
  // The status is now out of step with an "Installed to X" message.
  const clearInstalledPath = useCallback(() => setInstalledPath(null), []);
  const read = useInstallStatus<RemoteScriptStatus>({
    getUrl: getRemoteScriptUrl,
    label: "Remote script status",
    onRead: notifyStatusListeners,
    onLoadError: clearInstalledPath,
  });
  const { refresh } = read;

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

  return { ...read, installing, installError, installedPath, install };
}

// --- Helpers below main export ---

/**
 * Pass a status read to every subscriber.
 * @param status - The status just read
 */
function notifyStatusListeners(status: RemoteScriptStatus): void {
  for (const listener of statusListeners) {
    listener(status);
  }
}

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
  const posted = await postInstallRequest<{ path: string }>(
    getRemoteScriptInstallUrl(),
    { userLibrary },
  );

  if (posted.error != null) {
    return { path: null, error: posted.error };
  }

  const { body } = posted;

  if (typeof body?.path !== "string") {
    // A 200 owes us the path it wrote to; anything else is a broken server,
    // not something to paper over with the folder the user typed.
    return {
      path: null,
      error: body?.error ?? "Install failed: the server didn't say where",
    };
  }

  return { path: body.path, error: null };
}
