// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type DeviceInstallStatus,
  type UseDeviceInstallReturn,
} from "#webui/hooks/settings/installation/use-device-install";
import { type UseDeviceSwapReturn } from "#webui/hooks/settings/installation/use-device-swap";
import { DeviceSwapLine, DeviceSwapMessage } from "./DeviceSwap";
import {
  deviceActions,
  installReplaces,
  type DeviceActions,
} from "./helpers/device-actions";
import {
  deviceStatusLine,
  type StatusTone,
} from "./helpers/device-status-line";
import {
  buttonClass,
  errorTextClass,
  goodTextClass,
  noteClass,
  primaryButtonClass,
  warnTextClass,
} from "./helpers/installation-classes";
import { SectionCard } from "./SectionCard";
import { type StatusKind } from "./StatusIcon";

interface DeviceSectionProps {
  device: UseDeviceInstallReturn;
  swap: UseDeviceSwapReturn;
  /** The User Library path in the tab's shared field. */
  path: string;
  /** The User Library the server detected, or null. */
  detected: string | null;
}

/**
 * Device card of the Installation tab: says whether this device is in the User
 * Library, where Live Sets and the remote script can find it, and copies it
 * there.
 * @param {DeviceSectionProps} props - Component props
 * @param {object} props.device - The useDeviceInstall state and actions
 * @param {object} props.swap - The useDeviceSwap state and action
 * @param {string} props.path - The User Library path in the shared field
 * @param {string | null} props.detected - The detected User Library, or null
 * @returns {JSX.Element} The device card
 */
export function DeviceSection({
  device,
  swap,
  path,
  detected,
}: DeviceSectionProps) {
  const trimmed = path.trim();
  const isDetected = trimmed === detected;
  const view =
    device.status == null
      ? null
      : {
          status: device.status,
          actions: deviceActions(device.status, {
            path: trimmed,
            isDetected,
            installing: device.installing,
            swapStarted: swap.phase === "waiting" || swap.phase === "done",
          }),
        };

  return (
    <SectionCard
      id="device"
      testId="device-section"
      kind={cardKind(view)}
      title="Max for Live device"
      aside={
        view?.actions.install != null && (
          <button
            type="button"
            data-testid="device-install"
            disabled={view.actions.install.disabled}
            onClick={() =>
              device.install(trimmed, installReplaces(view.status, isDetected))
            }
            className={`flex-none ${primaryButtonClass}`}
          >
            {view.actions.install.label}
          </button>
        )
      }
    >
      <p className={noteClass}>
        Add Producer Pal to your User Library so the remote script can load it.
      </p>
      {view == null ? (
        <StatusFallback device={device} />
      ) : (
        <DeviceLines
          device={device}
          swap={swap}
          status={view.status}
          actions={view.actions}
          onSwap={() => swap.swap(trimmed)}
        />
      )}
    </SectionCard>
  );
}

// --- Helpers below main export ---

/**
 * @param view - The status and what the card offers, or null before it lands
 * @param view.status - The server's device-install status
 * @param view.actions - What the card offers
 * @returns Which status icon the card wears
 */
function cardKind(
  view: { status: DeviceInstallStatus; actions: DeviceActions } | null,
): StatusKind {
  if (view == null) {
    return "unknown";
  }

  // A problem with no action (an unreadable device, no User Library) is still
  // not done.
  const { status, actions } = view;

  return actions.install == null &&
    actions.swap == null &&
    status.problem == null
    ? "done"
    : "warning";
}

const toneClass: Record<StatusTone, string> = {
  good: goodTextClass,
  warn: warnTextClass,
  plain: "",
};

/**
 * The status line, the swap line, and what the last install and swap came to,
 * the other copies in the User Library, and how to re-read the status.
 * @param {object} props - Component props
 * @param {UseDeviceInstallReturn} props.device - The useDeviceInstall state
 * @param {UseDeviceSwapReturn} props.swap - The useDeviceSwap state
 * @param {DeviceInstallStatus} props.status - The server's device-install status
 * @param {DeviceActions} props.actions - What the card offers
 * @param {() => void} props.onSwap - Runs the swap
 * @returns {JSX.Element} The lines
 */
function DeviceLines({
  device,
  swap,
  status,
  actions,
  onSwap,
}: {
  device: UseDeviceInstallReturn;
  swap: UseDeviceSwapReturn;
  status: DeviceInstallStatus;
  actions: DeviceActions;
  onSwap: () => void;
}) {
  const line = deviceStatusLine(status);

  return (
    <>
      <p
        className={`font-medium ${toneClass[line.tone]}`}
        data-testid="device-status"
      >
        {line.text}
      </p>
      {actions.swap != null && (
        <DeviceSwapLine action={actions.swap} onSwap={onSwap} />
      )}
      {device.installError != null && (
        <p className={errorTextClass} data-testid="device-error">
          {device.installError}
        </p>
      )}
      {device.installResult != null && device.installError == null && (
        <p className={goodTextClass} data-testid="device-installed-path">
          {device.installResult.detail} ({device.installResult.path})
        </p>
      )}
      <DeviceSwapMessage swap={swap} />
      {status.otherCopies.length > 0 && (
        <p className={noteClass} data-testid="device-other-copies">
          Other Producer Pal devices in your User Library:{" "}
          {status.otherCopies.join(", ")}. Live can't tell them apart when you
          add the device to a Set.
        </p>
      )}
      {status.problem === "unknown-source" && (
        <RefreshButton onRefresh={device.refresh} />
      )}
      {/* A failed Refresh keeps the last status on screen. */}
      {device.loadError != null && <LoadError message={device.loadError} />}
    </>
  );
}

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
      className={`self-start ${buttonClass}`}
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
    <p className={errorTextClass} data-testid="device-load-error">
      {message}
    </p>
  );
}
