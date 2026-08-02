// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  beginHalfDuplexMute,
  endHalfDuplexMute,
  type HalfDuplexDeps,
} from "#webui/hooks/voice/helpers/half-duplex-helpers";
import {
  handleTransportEvent,
  type TransportEventDeps,
} from "#webui/hooks/voice/helpers/use-voice-session-helpers";

/**
 * Build an endHalfDuplexMute deps bag: auto-muted, nothing manually muted, and
 * the assistant done both generating and speaking (so the gate opens).
 * @param mute - The session's mute spy
 * @param overrides - Ref states to change from the "safe to unmute" baseline
 * @returns A HalfDuplexDeps bag
 */
function endDeps(
  mute: (muted: boolean) => void,
  overrides: Partial<Record<keyof HalfDuplexDeps, boolean>> = {},
): HalfDuplexDeps {
  return {
    session: { mute },
    autoMutedRef: { current: overrides.autoMutedRef ?? true },
    isMutedRef: { current: overrides.isMutedRef ?? false },
    responseActiveRef: { current: overrides.responseActiveRef ?? false },
    audioPlayingRef: { current: overrides.audioPlayingRef ?? false },
  };
}

describe("beginHalfDuplexMute", () => {
  it("mutes and records the auto-mute when barge-in is disabled", () => {
    const mute = vi.fn();
    const autoMutedRef = { current: false };

    beginHalfDuplexMute({ mute }, autoMutedRef, true);

    expect(mute).toHaveBeenCalledWith(true);
    expect(autoMutedRef.current).toBe(true);
  });

  it("is a no-op when barge-in is enabled", () => {
    const mute = vi.fn();
    const autoMutedRef = { current: false };

    beginHalfDuplexMute({ mute }, autoMutedRef, false);

    expect(mute).not.toHaveBeenCalled();
    expect(autoMutedRef.current).toBe(false);
  });

  it("swallows a mute() error (best-effort)", () => {
    const mute = vi.fn(() => {
      throw new Error("nope");
    });
    const autoMutedRef = { current: false };

    expect(() =>
      beginHalfDuplexMute({ mute }, autoMutedRef, true),
    ).not.toThrow();
    expect(autoMutedRef.current).toBe(true);
  });
});

describe("endHalfDuplexMute", () => {
  it("restores the unmuted state and clears the auto-mute flag", () => {
    const mute = vi.fn();
    const deps = endDeps(mute);

    endHalfDuplexMute(deps);

    expect(mute).toHaveBeenCalledWith(false);
    expect(deps.autoMutedRef.current).toBe(false);
  });

  it("restores to muted when the user had manually muted", () => {
    const mute = vi.fn();

    endHalfDuplexMute(endDeps(mute, { isMutedRef: true }));

    expect(mute).toHaveBeenCalledWith(true);
  });

  it("is a no-op when no auto-mute is active", () => {
    const mute = vi.fn();

    endHalfDuplexMute(endDeps(mute, { autoMutedRef: false }));

    expect(mute).not.toHaveBeenCalled();
  });

  // The playback tail is the window a user actually talks over the assistant:
  // response.done lands well before the output buffer drains.
  it("holds the mute while the assistant's audio is still playing", () => {
    const mute = vi.fn();
    const deps = endDeps(mute, { audioPlayingRef: true });

    endHalfDuplexMute(deps);

    expect(mute).not.toHaveBeenCalled();
    expect(deps.autoMutedRef.current).toBe(true);
  });

  // A tool call can open the next response while the previous response's audio
  // is still draining, so a buffer-drained event can land mid-response.
  it("holds the mute while a response is still active", () => {
    const mute = vi.fn();
    const deps = endDeps(mute, { responseActiveRef: true });

    endHalfDuplexMute(deps);

    expect(mute).not.toHaveBeenCalled();
    expect(deps.autoMutedRef.current).toBe(true);
  });

  it("swallows a mute() error (best-effort)", () => {
    const mute = vi.fn(() => {
      throw new Error("nope");
    });
    const deps = endDeps(mute);

    expect(() => endHalfDuplexMute(deps)).not.toThrow();
    expect(deps.autoMutedRef.current).toBe(false);
  });
});

describe("recovering from a missed buffer-stopped event", () => {
  it("clears the playing flag on the next response so the mute can lift", () => {
    // The mic has no other way back: only the buffer events clear this flag,
    // and with it stuck the Mute button is hidden, so the user can't unmute by
    // hand either.
    const mute = vi.fn();
    const deps: TransportEventDeps = {
      ...endDeps(mute, { autoMutedRef: false, audioPlayingRef: true }),
      halfDuplex: true,
      setAssistantThinking: vi.fn(),
      setAssistantSpeaking: vi.fn(),
      setError: vi.fn(),
      setRateLimitedUntil: vi.fn(),
      autoRetryAttemptsRef: { current: 0 },
    };

    handleTransportEvent({ type: "response.created" }, deps);

    expect(deps.audioPlayingRef.current).toBe(false);

    handleTransportEvent({ type: "response.done" }, deps);

    expect(mute).toHaveBeenLastCalledWith(false);
    expect(deps.autoMutedRef.current).toBe(false);
  });
});
