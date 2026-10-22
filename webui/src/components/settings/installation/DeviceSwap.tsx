// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type UseDeviceSwapReturn } from "#webui/hooks/settings/installation/use-device-swap";
import { type SwapAction } from "./helpers/device-actions";
import {
  buttonClass,
  errorTextClass,
  goodTextClass,
  mutedClass,
} from "./helpers/installation-classes";

/**
 * The line offering to swap the running device for the User Library copy, or
 * saying why it can't.
 * @param {object} props - Component props
 * @param {SwapAction} props.action - What the line says and whether Swap works
 * @param {() => void} props.onSwap - Runs the swap
 * @returns {JSX.Element} The swap line
 */
export function DeviceSwapLine({
  action,
  onSwap,
}: {
  action: SwapAction;
  onSwap: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span className={mutedClass} data-testid="device-swap-note">
        {action.text}
      </span>
      <button
        type="button"
        data-testid="device-swap"
        disabled={!action.enabled}
        onClick={onSwap}
        className={buttonClass}
      >
        Swap
      </button>
    </div>
  );
}

/**
 * What a swap is doing or came to, shown under the status: waiting for the new
 * device, done, or why it failed. Nothing before a swap starts.
 * @param {object} props - Component props
 * @param {UseDeviceSwapReturn} props.swap - The useDeviceSwap state
 * @returns {JSX.Element | null} The message, or nothing
 */
export function DeviceSwapMessage({ swap }: { swap: UseDeviceSwapReturn }) {
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
      <p className={goodTextClass} data-testid="device-swap-done">
        Swapped. Save your Live Set so it keeps using the copy in your User
        Library.
      </p>
    );
  }

  if (swap.error != null) {
    return (
      <p className={errorTextClass} data-testid="device-swap-error">
        {swap.error}
      </p>
    );
  }

  return null;
}
