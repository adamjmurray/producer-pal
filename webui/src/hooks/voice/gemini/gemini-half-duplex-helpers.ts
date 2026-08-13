// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Minimal mic surface the half-duplex helpers drive (test-fakeable). */
export interface MutableMic {
  setMuted: (muted: boolean) => void;
}

/** Preact ref holder, narrowed to the boolean refs the helpers receive. */
export interface BooleanRef {
  current: boolean;
}

/**
 * Mute the mic for the duration of an assistant turn when barge-in is off,
 * mirroring OpenAI's half-duplex behavior. `NO_INTERRUPTION` already tells the
 * server to ignore user speech mid-response, but the local mic keeps streaming
 * — muting it here also stops the assistant's playback from looping back as
 * captured input (acoustic echo). Idempotent within a turn; no-op when barge-in
 * is enabled.
 *
 * @param mic - The mic instance, or null
 * @param autoMutedRef - Ref flagging an active half-duplex auto-mute
 * @param halfDuplex - Whether barge-in is disabled
 */
export function beginGeminiHalfDuplexMute(
  mic: MutableMic | null,
  autoMutedRef: BooleanRef,
  halfDuplex: boolean,
): void {
  if (!halfDuplex || autoMutedRef.current || !mic) return;
  autoMutedRef.current = true;
  mic.setMuted(true);
}

/**
 * Apply the user's manual mute choice, which overrides any half-duplex
 * auto-mute.
 *
 * Clearing `autoMutedRef` is the point of routing this through here: left set,
 * the next {@link beginGeminiHalfDuplexMute} finds the mute already "armed" and
 * no-ops, so the rest of the assistant's turn plays into an open mic.
 *
 * @param mic - The mic instance, or null when not connected
 * @param muted - The state the user asked for
 * @param isMutedRef - Ref mirroring the user's manual mute state
 * @param autoMutedRef - Ref flagging an active half-duplex auto-mute
 * @returns True when there was a mic to change
 */
export function applyManualMute(
  mic: MutableMic | null,
  muted: boolean,
  isMutedRef: BooleanRef,
  autoMutedRef: BooleanRef,
): boolean {
  if (!mic) return false;

  autoMutedRef.current = false;
  isMutedRef.current = muted;
  mic.setMuted(muted);

  return true;
}

/**
 * Lift a half-duplex auto-mute on turn complete / interruption, restoring the
 * user's manual mute intent. No-op when no auto-mute is active.
 *
 * @param mic - The mic instance, or null
 * @param autoMutedRef - Ref flagging an active half-duplex auto-mute
 * @param isMutedRef - Ref mirroring the user's manual mute state
 */
export function endGeminiHalfDuplexMute(
  mic: MutableMic | null,
  autoMutedRef: BooleanRef,
  isMutedRef: BooleanRef,
): void {
  if (!autoMutedRef.current) return;
  autoMutedRef.current = false;
  mic?.setMuted(isMutedRef.current);
}
