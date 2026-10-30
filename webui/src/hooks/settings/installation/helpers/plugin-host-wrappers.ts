// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The Installation tab's plug-in host wrapper devices, which only a hosting
// build knows about. Every function opens with the build-time check, and every
// wrapper string lives behind it, so the bundler drops all of it from a release
// chat UI. Keep wrapper text and logic in this file.

/** How an installed wrapper compares with the one the server carries. */
export type PluginHostWrapperStatus = "missing" | "current" | "differs";

/** One wrapper as `GET /device-install` reports it in a hosting build. */
export interface PluginHostWrapperState {
  name: string;
  path: string;
  state: PluginHostWrapperStatus;
}

/**
 * @param status - The server's device-install status
 * @param status.pluginHost - Each wrapper's state, in a hosting build
 * @returns The install button's label, or null when no wrapper needs installing
 */
export function wrapperInstallLabel(status: {
  pluginHost?: PluginHostWrapperState[];
}): string | null {
  if (process.env.ENABLE_HOSTED_PLUGINS !== "true") {
    return null;
  }

  return needsInstall(status.pluginHost)
    ? "Install the plug-in host devices"
    : null;
}

/**
 * The line saying whether the plug-in host devices are in the User Library.
 * @param status - The server's device-install status
 * @param status.pluginHost - Each wrapper's state, in a hosting build
 * @returns The line, or null when the server reports no wrappers
 */
export function wrapperStatusLine(status: {
  pluginHost?: PluginHostWrapperState[];
}): { text: string; tone: "good" | "warn" } | null {
  if (process.env.ENABLE_HOSTED_PLUGINS !== "true") {
    return null;
  }

  const { pluginHost } = status;

  if (pluginHost == null) {
    return null;
  }

  if (!needsInstall(pluginHost)) {
    return { text: "Plug-in host devices: installed", tone: "good" };
  }

  const each = pluginHost.map(
    ({ name, state }) =>
      `${name} ${state === "missing" ? "is not installed" : state === "differs" ? "differs from this build" : "is installed"}`,
  );

  return { text: `Plug-in host devices: ${each.join("; ")}`, tone: "warn" };
}

/**
 * @param body - An install response body
 * @param body.pluginHost - What the install did to each wrapper
 * @returns Whether any wrapper failed to install
 */
export function wrapperInstallFailed(body: {
  pluginHost?: { ok?: boolean }[];
}): boolean {
  if (process.env.ENABLE_HOSTED_PLUGINS !== "true") {
    return false;
  }

  return body.pluginHost?.some((part) => part.ok === false) === true;
}

function needsInstall(wrappers: PluginHostWrapperState[] | undefined): boolean {
  return wrappers?.some(({ state }) => state !== "current") === true;
}
