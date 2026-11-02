// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { useCallback, useState } from "preact/hooks";
import {
  getDeviceInstallActionUrl,
  getDeviceInstallUrl,
} from "#webui/utils/mcp-url";
import { postInstallRequest } from "./helpers/post-install-request";
import {
  type PluginHostWrapperState,
  wrapperInstallFailed,
} from "./helpers/plugin-host-wrappers";
import {
  useInstallStatus,
  type UseInstallStatusReturn,
} from "./helpers/use-install-status";

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
  /** Whether the running device is the User Library file itself. */
  inUserLibrary: boolean;
  /** The copy compared with the running device; null with a problem. */
  state: DeviceState | null;
  /** This device's version. */
  version: string;
  installedVersion: string | null;
  /** Other Producer_Pal .amxd files in the User Library. */
  otherCopies: string[];
  /** Whether the running device can be swapped for the User Library copy. */
  swap: { allowed: boolean; reason: string | null };
  /** Each plug-in host wrapper's state. Only a hosting build sends it. */
  pluginHost?: PluginHostWrapperState[];
}

/** What a finished install did, as the chat UI shows it. */
export interface DeviceInstallDone {
  detail: string;
  path: string;
  /** Whether part of the install failed, which the detail says. */
  failed: boolean;
}

export interface UseDeviceInstallReturn extends UseInstallStatusReturn<DeviceInstallStatus> {
  /** True while the install request is in flight. */
  installing: boolean;
  /** Why the install was refused or failed, or null. */
  installError: string | null;
  /** What the last install did and where, or null. */
  installResult: DeviceInstallDone | null;
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
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installResult, setInstallResult] = useState<DeviceInstallDone | null>(
    null,
  );
  // The status is now out of step with an "Installed to X" message.
  const clearInstallResult = useCallback(() => setInstallResult(null), []);
  const read = useInstallStatus<DeviceInstallStatus>({
    getUrl: getDeviceInstallUrl,
    label: "Device install status",
    onLoadError: clearInstallResult,
  });
  const { refresh } = read;

  const install = useCallback(
    (userLibrary: string, force: boolean): void => {
      setInstalling(true);
      setInstallError(null);

      void postInstall(userLibrary, force).then((result) => {
        setInstalling(false);

        setInstallError(result.error);
        setInstallResult(result.done);
        // A failed install can still have made folders the status shows.
        refresh();
      });
    },
    [refresh],
  );

  return { ...read, installing, installError, installResult, install };
}

// --- Helpers below main export ---

/** What a POST came back with: what was done, or why it wasn't. */
interface PostResult {
  done: DeviceInstallDone | null;
  error: string | null;
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
  const posted = await postInstallRequest<{
    detail: string;
    path: string;
    pluginHost: { ok?: boolean }[];
  }>(getDeviceInstallActionUrl(), { userLibrary, force });

  if (posted.error != null) {
    return { done: null, error: posted.error };
  }

  const { body } = posted;

  if (typeof body?.path !== "string" || typeof body.detail !== "string") {
    // A 200 owes us where it wrote and what it did.
    return {
      done: null,
      error: "Install failed: the server didn't say what it did",
    };
  }

  return {
    done: {
      detail: body.detail,
      path: body.path,
      failed: wrapperInstallFailed(body),
    },
    error: null,
  };
}
