// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { type RealtimeItem } from "@openai/agents/realtime";
import { describe, expect, it, vi } from "vitest";
import {
  beginHalfDuplexMute,
  buildSessionOptions,
  createPlaybackAudioElement,
  endHalfDuplexMute,
  extractResponseFailure,
  parseRetrySeconds,
  setAudioVolume,
  teardownAudioElement,
  toSeedableHistory,
} from "#webui/hooks/voice/helpers/use-voice-session-helpers";
import { DEFAULT_VOICE_LANGUAGE } from "#webui/lib/constants/voice-language";

const doneEvent = (response: unknown) => ({ type: "response.done", response });

describe("extractResponseFailure", () => {
  it("returns null for a completed response", () => {
    expect(
      extractResponseFailure(doneEvent({ status: "completed" })),
    ).toBeNull();
  });

  it("returns the error code and message for a failed response", () => {
    const failure = extractResponseFailure(
      doneEvent({
        status: "failed",
        status_details: { error: { code: "server_error", message: "boom" } },
      }),
    );

    expect(failure).toStrictEqual({ code: "server_error", message: "boom" });
  });

  it("falls back to 'unknown' when a failed response has no error code", () => {
    const failure = extractResponseFailure(
      doneEvent({ status: "failed", status_details: { error: {} } }),
    );

    expect(failure).toStrictEqual({
      code: "unknown",
      message: "Response failed",
    });
  });

  it("surfaces an incomplete response cut off by max_output_tokens", () => {
    const failure = extractResponseFailure(
      doneEvent({
        status: "incomplete",
        status_details: { reason: "max_output_tokens" },
      }),
    );

    expect(failure?.code).toBe("max_output_tokens");
    expect(failure?.message).toMatch(/maximum length/i);
  });

  it("surfaces an incomplete response stopped by the content filter", () => {
    const failure = extractResponseFailure(
      doneEvent({
        status: "incomplete",
        status_details: { reason: "content_filter" },
      }),
    );

    expect(failure?.code).toBe("content_filter");
    expect(failure?.message).toMatch(/content filter/i);
  });

  it("ignores a benign incomplete reason (interruption / barge-in)", () => {
    expect(
      extractResponseFailure(
        doneEvent({
          status: "incomplete",
          status_details: { reason: "turn_detected" },
        }),
      ),
    ).toBeNull();
  });

  it("ignores an incomplete response with no reason", () => {
    expect(
      extractResponseFailure(doneEvent({ status: "incomplete" })),
    ).toBeNull();
  });
});

describe("parseRetrySeconds", () => {
  it("parses a fractional seconds wait", () => {
    expect(
      parseRetrySeconds("Rate limit reached. Please try again in 3.057s."),
    ).toBeCloseTo(3.057);
  });

  it("parses a millisecond wait and normalizes to seconds", () => {
    expect(
      parseRetrySeconds("Rate limit reached. Please try again in 166ms."),
    ).toBeCloseTo(0.166);
  });

  it("parses a minutes wait and normalizes to seconds", () => {
    expect(parseRetrySeconds("Please try again in 2m.")).toBe(120);
  });

  it("tolerates whitespace between the value and unit", () => {
    expect(parseRetrySeconds("Please try again in 5 s")).toBe(5);
  });

  it("does not match a bare unit inside a word like 'seconds'", () => {
    expect(parseRetrySeconds("Please try again in 5 seconds")).toBeNull();
  });

  it("returns null when there is no parseable wait", () => {
    expect(parseRetrySeconds("Rate limit reached. Try later.")).toBeNull();
  });

  it("returns null when the matched number is not finite", () => {
    // A bare "." matches [\d.]+ but parses to NaN, which must not become a wait.
    expect(parseRetrySeconds("Please try again in .s")).toBeNull();
  });
});

describe("buildSessionOptions", () => {
  it("defaults the transcription language to English when none is given", () => {
    const options = buildSessionOptions({} as never, {}) as {
      config: { audio: { input: { transcription: { language: string } } } };
    };

    expect(options.config.audio.input.transcription.language).toBe(
      DEFAULT_VOICE_LANGUAGE,
    );
  });
});

describe("toSeedableHistory", () => {
  it("rewrites an assistant audio message to text and drops one with no transcript", () => {
    const history = [
      {
        itemId: "1",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_audio", transcript: "Hello" }],
      },
      {
        itemId: "2",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_audio", transcript: null }],
      },
    ] as unknown as RealtimeItem[];

    const out = toSeedableHistory(history);

    expect(out).toHaveLength(1);
    expect(out[0]?.content).toStrictEqual([
      { type: "output_text", text: "Hello" },
    ]);
  });
});

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
    const autoMutedRef = { current: true };

    endHalfDuplexMute({ mute }, autoMutedRef, { current: false });

    expect(mute).toHaveBeenCalledWith(false);
    expect(autoMutedRef.current).toBe(false);
  });

  it("restores to muted when the user had manually muted", () => {
    const mute = vi.fn();

    endHalfDuplexMute({ mute }, { current: true }, { current: true });

    expect(mute).toHaveBeenCalledWith(true);
  });

  it("is a no-op when no auto-mute is active", () => {
    const mute = vi.fn();

    endHalfDuplexMute({ mute }, { current: false }, { current: false });

    expect(mute).not.toHaveBeenCalled();
  });

  it("swallows a mute() error (best-effort)", () => {
    const mute = vi.fn(() => {
      throw new Error("nope");
    });
    const autoMutedRef = { current: true };

    expect(() =>
      endHalfDuplexMute({ mute }, autoMutedRef, { current: false }),
    ).not.toThrow();
    expect(autoMutedRef.current).toBe(false);
  });
});

describe("createPlaybackAudioElement", () => {
  it("creates an autoplay element at the given volume", () => {
    const el = createPlaybackAudioElement(0.5);

    expect(el.autoplay).toBe(true);
    expect(el.volume).toBe(0.5);
  });

  it("defaults to unity when volume is undefined", () => {
    expect(createPlaybackAudioElement(undefined).volume).toBe(1);
  });

  it("clamps an out-of-range volume to [0, 1]", () => {
    expect(createPlaybackAudioElement(5).volume).toBe(1);
    expect(createPlaybackAudioElement(-1).volume).toBe(0);
  });
});

describe("setAudioVolume", () => {
  it("applies a clamped volume to the element", () => {
    const el = createPlaybackAudioElement(1);

    setAudioVolume(el, 0.25);
    expect(el.volume).toBe(0.25);

    setAudioVolume(el, 5);
    expect(el.volume).toBe(1);
  });

  it("is a no-op when there is no element", () => {
    expect(() => setAudioVolume(null, 0.5)).not.toThrow();
  });
});

describe("teardownAudioElement", () => {
  it("pauses and detaches the stream", () => {
    const el = createPlaybackAudioElement(1);
    const pause = vi.spyOn(el, "pause");

    el.srcObject = new MediaStream();
    teardownAudioElement(el);

    expect(pause).toHaveBeenCalled();
    expect(el.srcObject).toBeNull();
  });

  it("is a no-op when there is no element", () => {
    expect(() => teardownAudioElement(null)).not.toThrow();
  });
});
