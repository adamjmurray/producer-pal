// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type DeviceInstallStatus } from "#webui/hooks/settings/installation/use-device-install";
import { type UseDeviceSwapReturn } from "#webui/hooks/settings/installation/use-device-swap";
import { buttonClass, noteClass } from "./installation-classes";

interface DeviceSwapProps {
  status: DeviceInstallStatus;
  swap: UseDeviceSwapReturn;
  /** The trimmed User Library path in the shared field. */
  path: string;
  /** Whether that path is the one the status describes. */
  isDetected: boolean;
}

/**
 * Swap this device for the User Library copy. A Live Set points at the device
 * file it was loaded from, so a device from Downloads stays pinned there even
 * after the User Library copy is updated. The swap replaces it in the Set.
 * @param {DeviceSwapProps} props - Component props
 * @param {DeviceInstallStatus} props.status - The server's device-install status
 * @param {object} props.swap - The useDeviceSwap state and action
 * @param {string} props.path - The trimmed User Library path in the shared field
 * @param {boolean} props.isDetected - Whether the path is the one the status describes
 * @returns {JSX.Element | null} The swap controls, or nothing when there is nothing to swap
 */
export function DeviceSwap({
  status,
  swap,
  path,
  isDetected,
}: DeviceSwapProps) {
  if (swap.phase === "waiting") {
    return (
      <p data-testid="device-swap-waiting">
        Swapping the device in Live… This page reconnects when the new one
        starts.
      </p>
    );
  }

  if (swap.phase === "done") {
    return (
      <p
        className="text-green-600 dark:text-green-400"
        data-testid="device-swap-done"
      >
        Swapped. Save your Live Set so it keeps using the copy in your User
        Library.
      </p>
    );
  }

  // Nothing to swap before the device says where it is, or once it is the copy.
  if (status.source == null || status.inUserLibrary) {
    return null;
  }

  const { allowed, reason } = status.swap;

  return (
    <div className="space-y-2" data-testid="device-swap-section">
      <button
        type="button"
        data-testid="device-swap"
        disabled={!allowed || !isDetected}
        onClick={() => swap.swap(path)}
        className={buttonClass}
      >
        Swap this device for the User Library copy
      </button>
      <p className={noteClass} data-testid="device-swap-note">
        {noteText(allowed, reason, isDetected)}
      </p>
      {swap.error != null && (
        <p
          className="text-red-600 dark:text-red-400"
          data-testid="device-swap-error"
        >
          {swap.error}
        </p>
      )}
    </div>
  );
}

// --- Helpers below main export ---

/**
 * @param allowed - Whether the server allows the swap
 * @param reason - Why not, when it doesn't
 * @param isDetected - Whether the path field holds the detected User Library
 * @returns What to tell the user under the button
 */
function noteText(
  allowed: boolean,
  reason: string | null,
  isDetected: boolean,
): string {
  if (!allowed) {
    return reason ?? "The swap isn't available.";
  }

  return isDetected
    ? "Replaces this device in your Live Set with the copy in your User Library. The AI connection drops for a moment. Save the Set afterwards."
    : "The swap uses the detected User Library. Put it back in the field above to swap.";
}
