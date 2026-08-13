// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiPcmPlayer } from "#webui/hooks/voice/gemini/gemini-pcm-player";

// Minimal Web Audio fakes — happy-dom has no AudioContext. We capture the
// scheduled sources so the gapless-cursor and flush behavior can be asserted.

class FakeBufferSource {
  buffer: { duration: number } | null = null;
  onended: (() => void) | null = null;
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  currentTime = 0;
  state: "running" | "suspended" = "suspended";
  destination = {};
  gain = { gain: { value: 1 }, connect: vi.fn() };
  sources: FakeBufferSource[] = [];
  resume = vi.fn(async () => {
    this.state = "running";
  });

  close = vi.fn(async () => {});
  createGain = vi.fn(() => this.gain);
  createBuffer = vi.fn((_ch: number, length: number, rate: number) => ({
    duration: length / rate,
    getChannelData: () => new Float32Array(length),
  }));

  createBufferSource = vi.fn(() => {
    const s = new FakeBufferSource();

    this.sources.push(s);

    return s;
  });

  constructor() {
    FakeAudioContext.instances.push(this);
  }
}

/**
 * Base64 of `count` Int16 samples (all zero).
 * @param count - Number of 16-bit samples
 * @returns Base64-encoded PCM
 */
function pcmBase64(count: number): string {
  return btoa(String.fromCharCode(...new Uint8Array(count * 2)));
}

beforeEach(() => {
  FakeAudioContext.instances = [];
  vi.stubGlobal("AudioContext", FakeAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GeminiPcmPlayer", () => {
  it("creates and resumes a suspended output context", async () => {
    const player = new GeminiPcmPlayer();

    await player.resume();
    const ctx = FakeAudioContext.instances[0]!;

    expect(ctx.resume).toHaveBeenCalled();
    expect(ctx.gain.connect).toHaveBeenCalledWith(ctx.destination);
  });

  it("schedules chunks gaplessly against a running cursor", async () => {
    const player = new GeminiPcmPlayer();

    await player.resume();
    const ctx = FakeAudioContext.instances[0]!;

    player.enqueueBase64(pcmBase64(2400)); // 0.1s at 24k
    player.enqueueBase64(pcmBase64(2400));

    expect(ctx.sources).toHaveLength(2);
    const first = ctx.sources[0]!.start.mock.calls[0]![0] as number;
    const second = ctx.sources[1]!.start.mock.calls[0]![0] as number;

    // First chunk gets the lead; second butts up against the first's end.
    expect(first).toBeCloseTo(0.12);
    expect(second).toBeCloseTo(0.22);
  });

  it("does nothing when enqueueing before resume()", () => {
    const player = new GeminiPcmPlayer();

    expect(() => player.enqueueBase64(pcmBase64(10))).not.toThrow();
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it("ignores an empty decoded chunk", async () => {
    const player = new GeminiPcmPlayer();

    await player.resume();
    player.enqueueBase64("");
    expect(FakeAudioContext.instances[0]!.sources).toHaveLength(0);
  });

  it("applies volume live, including boost above unity", async () => {
    const player = new GeminiPcmPlayer();

    player.setVolume(1.25); // before resume: stored
    await player.resume();
    const ctx = FakeAudioContext.instances[0]!;

    expect(ctx.gain.gain.value).toBe(1.25);
    player.setVolume(0.5);
    expect(ctx.gain.gain.value).toBe(0.5);
  });

  it("flush stops scheduled sources and resets the cursor", async () => {
    const player = new GeminiPcmPlayer();

    await player.resume();
    const ctx = FakeAudioContext.instances[0]!;

    player.enqueueBase64(pcmBase64(2400));
    const source = ctx.sources[0]!;

    player.flush();
    expect(source.stop).toHaveBeenCalled();

    // After flush the cursor resets, so the next chunk starts from now + lead.
    player.enqueueBase64(pcmBase64(2400));
    const restart = ctx.sources[1]!.start.mock.calls[0]![0] as number;

    expect(restart).toBeCloseTo(0.12);
  });

  it("tolerates a source that throws on stop during flush", async () => {
    const player = new GeminiPcmPlayer();

    await player.resume();
    const ctx = FakeAudioContext.instances[0]!;

    player.enqueueBase64(pcmBase64(10));
    ctx.sources[0]!.stop = vi.fn(() => {
      throw new Error("already stopped");
    });

    expect(() => player.flush()).not.toThrow();
  });

  it("drops a scheduled source from the set when it ends", async () => {
    const player = new GeminiPcmPlayer();

    await player.resume();
    const ctx = FakeAudioContext.instances[0]!;

    player.enqueueBase64(pcmBase64(10));
    // Fire onended; flush afterward should find nothing to stop.
    ctx.sources[0]!.onended!();
    player.flush();
    expect(ctx.sources[0]!.stop).not.toHaveBeenCalled();
  });

  it("hasQueued reflects scheduled sources, draining on end and flush", async () => {
    const player = new GeminiPcmPlayer();

    await player.resume();
    const ctx = FakeAudioContext.instances[0]!;

    expect(player.hasQueued()).toBe(false);

    player.enqueueBase64(pcmBase64(10));
    expect(player.hasQueued()).toBe(true);

    // A finished source drains from the queue.
    ctx.sources[0]!.onended!();
    expect(player.hasQueued()).toBe(false);

    // flush clears any remaining scheduled audio.
    player.enqueueBase64(pcmBase64(10));
    expect(player.hasQueued()).toBe(true);
    player.flush();
    expect(player.hasQueued()).toBe(false);
  });

  it("onDrained runs immediately when nothing is queued", async () => {
    const player = new GeminiPcmPlayer();

    await player.resume();

    const callback = vi.fn();

    player.onDrained(callback);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("onDrained waits for the last scheduled source to end", async () => {
    const player = new GeminiPcmPlayer();

    await player.resume();
    const ctx = FakeAudioContext.instances[0]!;

    player.enqueueBase64(pcmBase64(10));
    player.enqueueBase64(pcmBase64(10));

    const callback = vi.fn();

    player.onDrained(callback);
    ctx.sources[0]!.onended!();
    expect(callback).not.toHaveBeenCalled();

    ctx.sources[1]!.onended!();
    expect(callback).toHaveBeenCalledTimes(1);

    // One-shot: a later drain does not re-run it.
    player.enqueueBase64(pcmBase64(10));
    ctx.sources[2]!.onended!();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("reports a parked drain callback until it runs or is flushed", async () => {
    // How an interrupt tells "still streaming" from "turnComplete already ran
    // and only the tail is left" — the second has nobody left to lift the mute.
    const player = new GeminiPcmPlayer();

    await player.resume();
    expect(player.hasPendingDrain()).toBe(false);

    player.enqueueBase64(pcmBase64(10));
    player.onDrained(vi.fn());
    expect(player.hasPendingDrain()).toBe(true);

    player.flush();
    expect(player.hasPendingDrain()).toBe(false);
  });

  it("flush drops a pending onDrained instead of firing it", async () => {
    // The half-duplex mute gate defers its unmute to onDrained. A barge-in
    // interrupt flushes, and firing the callback there lifted the mute behind
    // the caller's back — mid-stream, so the next chunk re-muted and the Muted
    // indicator flickered. The flush() call sites handle the unmute themselves.
    const player = new GeminiPcmPlayer();

    await player.resume();
    player.enqueueBase64(pcmBase64(10));

    const callback = vi.fn();

    player.onDrained(callback);
    expect(callback).not.toHaveBeenCalled();

    player.flush();
    expect(callback).not.toHaveBeenCalled();

    // And it stays dropped: a later drain does not resurrect it.
    const ctx = FakeAudioContext.instances[0]!;

    player.enqueueBase64(pcmBase64(10));
    ctx.sources[1]!.onended!();
    expect(callback).not.toHaveBeenCalled();
  });

  it("close flushes and closes the context (idempotent)", async () => {
    const player = new GeminiPcmPlayer();

    await player.resume();
    const ctx = FakeAudioContext.instances[0]!;

    await player.close();
    expect(ctx.close).toHaveBeenCalled();

    // Second close is a no-op (no context).
    await expect(player.close()).resolves.toBeUndefined();
  });

  it("close swallows a context that fails to close", async () => {
    const player = new GeminiPcmPlayer();

    await player.resume();
    FakeAudioContext.instances[0]!.close = vi.fn(async () => {
      throw new Error("close failed");
    });

    await expect(player.close()).resolves.toBeUndefined();
  });

  it("drops a trailing odd byte when decoding base64 PCM", async () => {
    const player = new GeminiPcmPlayer();

    await player.resume();
    const ctx = FakeAudioContext.instances[0]!;
    // 3 bytes → 1 whole Int16 sample (trailing byte dropped).
    const threeBytes = btoa(String.fromCharCode(1, 2, 3));

    player.enqueueBase64(threeBytes);
    expect(ctx.createBuffer).toHaveBeenCalledWith(1, 1, 24000);
  });
});
