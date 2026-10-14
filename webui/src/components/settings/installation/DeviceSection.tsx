// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type DeviceInstallStatus,
  type UseDeviceInstallReturn,
} from "#webui/hooks/settings/installation/use-device-install";
import { type UseDeviceSwapReturn } from "#webui/hooks/settings/installation/use-device-swap";
import { DeviceSwap } from "./DeviceSwap";
import { buttonClass, noteClass } from "./installation-classes";

interface DeviceSectionProps {
  device: UseDeviceInstallReturn;
  swap: UseDeviceSwapReturn;
  /** The User Library path in the tab's shared field. */
  path: string;
  /** The User Library the server detected, or null. */
  detected: string | null;
}

/**
 * Device section of the Installation tab: copies this device into the User
 * Library, where Live Sets and the remote script can find it.
 * @param {DeviceSectionProps} props - Component props
 * @param {object} props.device - The useDeviceInstall state and actions
 * @param {object} props.swap - The useDeviceSwap state and action
 * @param {string} props.path - The User Library path in the shared field
 * @param {string | null} props.detected - The detected User Library, or null
 * @returns {JSX.Element} The device section
 */
export function DeviceSection({
  device,
  swap,
  path,
  detected,
}: DeviceSectionProps) {
  const { status } = device;

  return (
    <div className="space-y-2 text-sm" data-testid="device-section">
      <h3 className="font-semibold">Device</h3>
      <p className={noteClass}>
        Live Sets find Producer Pal by its file. Keeping a copy in your User
        Library lets any Set load it.
      </p>

      {status == null ? (
        <StatusFallback device={device} />
      ) : (
        <>
          <p data-testid="device-status">{summarize(status)}</p>
          <InstallControls
            device={device}
            status={status}
            path={path.trim()}
            isDetected={path.trim() === detected}
          />
          {status.otherCopies.length > 0 && (
            <p className={noteClass} data-testid="device-other-copies">
              Other Producer Pal devices in your User Library:{" "}
              {status.otherCopies.join(", ")}. Live can't tell them apart when
              you add the device to a Set.
            </p>
          )}
          {status.problem === "unknown-source" && (
            <RefreshButton onRefresh={device.refresh} />
          )}
          {/* A failed Refresh keeps the last status on screen. */}
          {device.loadError != null && <LoadError message={device.loadError} />}
        </>
      )}

      {status != null && (
        <DeviceSwap
          status={status}
          swap={swap}
          path={path.trim()}
          isDetected={path.trim() === detected}
        />
      )}
    </div>
  );
}

// --- Helpers below main export ---

/**
 * What to show before there is a status: a spinner line, or why the read failed.
 * @param {object} props - Component props
 * @param {UseDeviceInstallReturn} props.device - The useDeviceInstall state
 * @returns {JSX.Element} The loading or error line
 */
function StatusFallback({ device }: { device: UseDeviceInstallReturn }) {
  if (device.loading) {
    return <p data-testid="device-loading">Checking…</p>;
  }

  return (
    <>
      <LoadError
        message={device.loadError ?? "Could not read the device status."}
      />
      <RefreshButton onRefresh={device.refresh} />
    </>
  );
}

/**
 * Re-reads the status, for when the device hasn't said where it is yet.
 * @param {object} props - Component props
 * @param {Function} props.onRefresh - Runs the status read
 * @returns {JSX.Element} The refresh button
 */
function RefreshButton({ onRefresh }: { onRefresh: () => void }) {
  return (
    <button
      type="button"
      data-testid="device-refresh"
      onClick={onRefresh}
      className={buttonClass}
    >
      Refresh
    </button>
  );
}

/**
 * @param {object} props - Component props
 * @param {string} props.message - The error to show
 * @returns {JSX.Element} The error line
 */
function LoadError({ message }: { message: string }) {
  return (
    <p
      className="text-red-600 dark:text-red-400"
      data-testid="device-load-error"
    >
      {message}
    </p>
  );
}

/**
 * One-line summary of this device and the User Library copy.
 * @param status - The server's device-install status
 * @returns The summary text
 */
function summarize(status: DeviceInstallStatus): string {
  switch (status.problem) {
    case "unknown-source":
      return "This device hasn't said where its file is yet. Try Refresh in a moment.";
    case "unreadable-source":
      return "This device's file can't be read.";
    case "not-frozen":
      return "This is a development device, which needs the files beside it, so it can't be copied. Freeze it first.";
    case "no-user-library":
      return "Enter your User Library above to check for a copy.";
    default:
      return copySummary(status);
  }
}

/**
 * @param status - A status with no problem
 * @returns How the User Library copy compares with this device
 */
function copySummary(status: DeviceInstallStatus): string {
  const copy = versionText(status.installedVersion);
  const device = versionText(status.version);
  const theCopy = `The copy in your User Library (${copy})`;
  const thisDevice = `this device (${device})`;

  switch (status.state) {
    case "not-installed":
      return "Not in your User Library";
    case "same":
      return `The copy in your User Library is ${thisDevice}`;
    case "installed-older":
      return `Update available: your User Library has ${copy}, this device is ${device}`;
    case "installed-newer":
      return `${theCopy} is newer than ${thisDevice}`;
    default:
      return `${theCopy} differs from ${thisDevice}`;
  }
}

/**
 * @param version - A version the server reported, or null
 * @returns The version to show, never "vnull"
 */
function versionText(version: string | null): string {
  return version == null ? "an unknown version" : `v${version}`;
}

interface InstallControlsProps {
  device: UseDeviceInstallReturn;
  status: DeviceInstallStatus;
  /** The trimmed User Library path in the shared field. */
  path: string;
  /** Whether that path is the one the status describes. */
  isDetected: boolean;
}

/**
 * The Install / Update button and what came of the last install. No button
 * when the device can't be copied, or the copy is already this device.
 * @param {InstallControlsProps} props - Component props
 * @param {object} props.device - The useDeviceInstall state and actions
 * @param {DeviceInstallStatus} props.status - The server's device-install status
 * @param {string} props.path - The trimmed User Library path in the shared field
 * @param {boolean} props.isDetected - Whether the path is the one the status describes
 * @returns {JSX.Element} The install controls
 */
function InstallControls({
  device,
  status,
  path,
  isDetected,
}: InstallControlsProps) {
  // The status describes only the detected User Library, so any other path
  // is a plain install that never replaces a newer copy.
  const replaces = isDetected && needsForce(status.state);
  const canInstall =
    status.problem == null || status.problem === "no-user-library";
  const upToDate = isDetected && status.state === "same";

  return (
    <div className="space-y-2">
      {canInstall && !upToDate && (
        <button
          type="button"
          data-testid="device-install"
          disabled={device.installing || path === ""}
          onClick={() => device.install(path, replaces)}
          className={buttonClass}
        >
          {installLabel(status, device.installing, isDetected)}
        </button>
      )}
      {device.installError != null && (
        <p
          className="text-red-600 dark:text-red-400"
          data-testid="device-error"
        >
          {device.installError}
        </p>
      )}
      {device.installResult != null && device.installError == null && (
        <p
          className="text-green-600 dark:text-green-400"
          data-testid="device-installed-path"
        >
          {device.installResult.detail} ({device.installResult.path})
        </p>
      )}
    </div>
  );
}

/**
 * @param status - The server's device-install status
 * @param installing - Whether an install is in flight
 * @param isDetected - Whether the field holds the detected User Library
 * @returns The button label
 */
function installLabel(
  status: DeviceInstallStatus,
  installing: boolean,
  isDetected: boolean,
): string {
  if (installing) {
    return "Installing…";
  }

  if (!isDetected) {
    return "Install";
  }

  if (needsForce(status.state)) {
    return "Replace with this device";
  }

  return status.state === "installed-older" ? "Update" : "Install";
}

/**
 * @param state - How the User Library copy compares with this device
 * @returns Whether installing means replacing a copy that's newer or can't be
 *   told apart, which the server only does when asked to
 */
function needsForce(state: DeviceInstallStatus["state"]): boolean {
  return state === "installed-newer" || state === "different";
}
