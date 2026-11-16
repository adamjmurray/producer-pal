// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The Installation tab's plug-in host wrapper devices: their install label,
// status line and failure check. Keep wrapper text and logic in this file.

/** Installs the wrappers from the repo, for a development build. */
const DEV_INSTALL_COMMAND = "npm run install:plugin-host";

/** How an installed wrapper compares with the one the server carries. */
export type PluginHostWrapperStatus = "missing" | "current" | "differs";

/** One wrapper as `GET /device-install` reports it. */
export interface PluginHostWrapperState {
  name: string;
  path: string;
  state: PluginHostWrapperStatus;
}

/**
 * @param status - The server's device-install status
 * @param status.pluginHost - Each wrapper's state
 * @returns The install button's label, or null when no wrapper needs installing
 */
export function wrapperInstallLabel(status: {
  pluginHost?: PluginHostWrapperState[];
}): string | null {
  return needsInstall(status.pluginHost)
    ? "Install the plug-in wrapper devices"
    : null;
}

/**
 * The line saying whether the plug-in host devices are in the User Library.
 * @param status - The server's device-install status
 * @param status.pluginHost - Each wrapper's state
 * @param status.problem - Why the device can't be installed, if it can't
 * @returns The line, or null when there is nothing to say about the wrappers
 */
export function wrapperStatusLine(status: {
  pluginHost?: PluginHostWrapperState[];
  problem?: string | null;
}): { text: string; tone: "good" | "warn" } | null {
  const { pluginHost, problem } = status;
  // A development device can't run the install, but its wrappers still matter.
  const isDevBuild = problem === "not-frozen";

  if (pluginHost == null || (problem != null && !isDevBuild)) {
    return null;
  }

  if (!needsInstall(pluginHost)) {
    return { text: "Plug-in wrapper devices: installed", tone: "good" };
  }

  const each = pluginHost.map(
    ({ name, state }) =>
      `${name} ${state === "missing" ? "is not installed" : state === "differs" ? "differs from this build" : "is installed"}`,
  );

  const fix = isDevBuild ? `. Run ${DEV_INSTALL_COMMAND}.` : "";

  return {
    text: `Plug-in wrapper devices: ${each.join("; ")}${fix}`,
    tone: "warn",
  };
}

/**
 * @param body - An install response body
 * @param body.pluginHost - What the install did to each wrapper
 * @returns Whether any wrapper failed to install
 */
export function wrapperInstallFailed(body: {
  pluginHost?: { ok?: boolean }[];
}): boolean {
  return body.pluginHost?.some((part) => part.ok === false) === true;
}

function needsInstall(wrappers: PluginHostWrapperState[] | undefined): boolean {
  return wrappers?.some(({ state }) => state !== "current") === true;
}
