// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type DeviceInstallStatus,
  type DeviceState,
} from "#webui/hooks/settings/installation/use-device-install";
import { wrapperInstallLabel } from "#webui/hooks/settings/installation/helpers/plugin-host-wrappers";

/** What the card's actions need to know beyond the server's status. */
export interface DeviceActionsContext {
  /** The trimmed User Library path in the shared field. */
  path: string;
  /** Whether that path is the one the status describes. */
  isDetected: boolean;
  /** Whether an install is in flight. */
  installing: boolean;
  /** Whether a swap is under way or finished, which replaces its line. */
  swapStarted: boolean;
}

/** The card's install button. */
export interface InstallAction {
  label: string;
  disabled: boolean;
}

/** The line offering to swap the running device for the User Library copy. */
export interface SwapAction {
  text: string;
  /** Whether the Swap button works. */
  enabled: boolean;
}

export interface DeviceActions {
  /** Null when there is nothing to copy. */
  install: InstallAction | null;
  /** Null when a swap would be pointless or is already under way. */
  swap: SwapAction | null;
}

/**
 * What the device card offers: copying this device into the User Library, and
 * swapping the running one for that copy.
 * @param status - The server's device-install status
 * @param ctx - The shared path field and in-flight work
 * @returns The install button and swap line, each null when not offered
 */
export function deviceActions(
  status: DeviceInstallStatus,
  ctx: DeviceActionsContext,
): DeviceActions {
  return { install: installAction(status, ctx), swap: swapAction(status, ctx) };
}

/**
 * Whether installing replaces a copy that's newer or can't be told apart,
 * which the server only does when asked to.
 * @param status - The server's device-install status
 * @param isDetected - Whether the path is the one the status describes
 * @returns Whether to send `force`
 */
export function installReplaces(
  status: DeviceInstallStatus,
  isDetected: boolean,
): boolean {
  return (
    isDetected &&
    (status.state === "installed-newer" || status.state === "different")
  );
}

/**
 * @param status - The server's device-install status
 * @param ctx - The shared path field and in-flight work
 * @returns The install button; off for a development build, or null when the
 *   copy is already this device (and any plug-in host devices are in) or the
 *   device can't be read
 */
function installAction(
  status: DeviceInstallStatus,
  ctx: DeviceActionsContext,
): InstallAction | null {
  if (status.problem === "not-frozen") {
    return { label: "Copy", disabled: true };
  }

  const canInstall =
    status.problem == null || status.problem === "no-user-library";

  // The status describes only the detected User Library, so any other path is
  // a plain copy that never replaces a newer one.
  const state = ctx.isDetected ? status.state : null;

  // With the device current, only plug-in host devices left to install is
  // worth a button. Only a hosting build ever has any.
  const label =
    state === "same" ? wrapperInstallLabel(status) : copyLabel(state);

  if (!canInstall || label == null) {
    return null;
  }

  return {
    label: ctx.installing ? "Installing…" : label,
    disabled: ctx.installing || ctx.path === "",
  };
}

/**
 * @param state - How the copy compares, or null when unknown for this path
 * @returns The install button's label
 */
function copyLabel(state: DeviceState | null): string {
  switch (state) {
    case "installed-older":
      return "Update copy";
    case "installed-newer":
    case "different":
      return "Replace with this device";
    default:
      return "Copy";
  }
}

/**
 * A Live Set points at the device file it was loaded from, so a device from
 * Downloads stays pinned there even after the copy is updated.
 * @param status - The server's device-install status
 * @param ctx - The shared path field and in-flight work
 * @returns The swap line, or null before the device says where it is, once it
 *   is the copy, for a development build, before the copy is current (the
 *   status line and Copy button already say so), or while a swap runs
 */
function swapAction(
  status: DeviceInstallStatus,
  ctx: DeviceActionsContext,
): SwapAction | null {
  if (
    status.source == null ||
    status.inUserLibrary ||
    status.problem === "not-frozen" ||
    status.state === "not-installed" ||
    status.state === "installed-older" ||
    ctx.swapStarted
  ) {
    return null;
  }

  const { allowed, reason } = status.swap;

  if (!allowed) {
    return { text: reason ?? "The swap isn't available.", enabled: false };
  }

  if (!ctx.isDetected) {
    return {
      text: "The swap uses the detected User Library. Put it back in the field above to swap.",
      enabled: false,
    };
  }

  return { text: "This Set uses a copy from elsewhere.", enabled: true };
}
