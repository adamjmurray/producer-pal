// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type RealtimeSession } from "@openai/agents/realtime";

/** Minimal session surface the half-duplex helpers need (mic mute control). */
export type MutableSession = Pick<RealtimeSession, "mute">;

/** Preact ref holder, narrowed to the boolean refs the helpers receive. */
export interface BooleanRef {
  current: boolean;
}

/** The session + refs the half-duplex mute gate reads and writes. */
export interface HalfDuplexDeps {
  session: MutableSession;
  /** Flags an active half-duplex auto-mute so the turn end can lift it. */
  autoMutedRef: BooleanRef;
  /** Mirrors the user's manual mute, restored when an auto-mute lifts. */
  isMutedRef: BooleanRef;
  /** True between response.created and response.done. */
  responseActiveRef: BooleanRef;
  /** True while the assistant's audio is still draining from the output buffer. */
  audioPlayingRef: BooleanRef;
}

/**
 * Mute the mic at the start of a half-duplex (barge-in disabled) response and
 * record the auto-mute so the turn end can lift it. No-op when barge-in is
 * enabled. Best-effort: a mute() throw is swallowed (the UI is unaffected).
 *
 * @param session - The live realtime session
 * @param autoMutedRef - Ref flagging an active half-duplex auto-mute
 * @param halfDuplex - Whether barge-in is disabled
 */
export function beginHalfDuplexMute(
  session: MutableSession,
  autoMutedRef: BooleanRef,
  halfDuplex: boolean,
): void {
  if (!halfDuplex) return;
  autoMutedRef.current = true;

  try {
    session.mute(true);
  } catch {
    // best-effort; the UI status pill is unaffected
  }
}

/**
 * Lift a half-duplex auto-mute once the assistant is done both generating and
 * speaking, restoring the user's manual mute intent.
 *
 * Both conditions matter. response.done fires when the model finishes
 * generating, which outruns playback — the output buffer keeps draining after
 * it, and that tail is exactly when a user talks over the assistant. And a tool
 * call can open the next response while the previous response's audio is still
 * playing, so a buffer-drained event can arrive mid-response.
 *
 * @param deps - The session and the mute/response/playback refs
 */
export function endHalfDuplexMute(deps: HalfDuplexDeps): void {
  if (!deps.autoMutedRef.current) return;
  if (deps.responseActiveRef.current || deps.audioPlayingRef.current) return;
  deps.autoMutedRef.current = false;

  try {
    deps.session.mute(deps.isMutedRef.current);
  } catch {
    // best-effort
  }
}
