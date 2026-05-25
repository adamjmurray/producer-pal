// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiMicCapture } from "#webui/hooks/voice/gemini/gemini-mic-capture";

// Web Audio + mic fakes (happy-dom has none). We capture the worklet node so a
// posted PCM buffer can be pushed through onmessage and asserted.

class FakeAudioWorkletNode {
  static last: FakeAudioWorkletNode | null = null;
  port: { onmessage: ((e: MessageEvent<ArrayBuffer>) => void) | null } = {
    onmessage: null,
  };

  disconnect = vi.fn();

  constructor() {
    FakeAudioWorkletNode.last = this;
  }
}

class FakeAudioContext {
  static last: FakeAudioContext | null = null;
  sampleRate = 16000;
  audioWorklet = { addModule: vi.fn(async () => {}) };
  createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }));
  close = vi.fn(async () => {});
  constructor() {
    FakeAudioContext.last = this;
  }
}

const trackStop = vi.fn();
const getUserMedia = vi.fn(async () => ({
  getTracks: () => [{ stop: trackStop }],
}));

beforeEach(() => {
  FakeAudioWorkletNode.last = null;
  trackStop.mockClear();
  getUserMedia.mockClear();
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:fake"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GeminiMicCapture", () => {
  it("opens the mic with AEC constraints and loads the worklet", async () => {
    const capture = new GeminiMicCapture();
    const result = await capture.start({ onChunk: vi.fn() });

    expect(result.sampleRate).toBe(16000);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });

  it("base64-encodes posted PCM and forwards it to onChunk", async () => {
    const capture = new GeminiMicCapture();
    const onChunk = vi.fn();

    await capture.start({ onChunk });
    const buf = new Uint8Array([1, 2, 3, 4]).buffer;

    FakeAudioWorkletNode.last!.port.onmessage!({
      data: buf,
    } as MessageEvent<ArrayBuffer>);

    expect(onChunk).toHaveBeenCalledWith(btoa(String.fromCharCode(1, 2, 3, 4)));
  });

  it("drops chunks while muted, resumes when unmuted", async () => {
    const capture = new GeminiMicCapture();
    const onChunk = vi.fn();

    await capture.start({ onChunk });
    const post = (): void =>
      FakeAudioWorkletNode.last!.port.onmessage!({
        data: new Uint8Array([0, 0]).buffer,
      } as MessageEvent<ArrayBuffer>);

    capture.setMuted(true);
    post();
    expect(onChunk).not.toHaveBeenCalled();

    capture.setMuted(false);
    post();
    expect(onChunk).toHaveBeenCalledTimes(1);
  });

  it("stop() ends tracks, disconnects the node, and closes the context", async () => {
    const capture = new GeminiMicCapture();

    await capture.start({ onChunk: vi.fn() });
    const node = FakeAudioWorkletNode.last!;

    await capture.stop();

    expect(node.disconnect).toHaveBeenCalled();
    expect(trackStop).toHaveBeenCalled();
    expect(node.port.onmessage).toBeNull();
  });

  it("stop() is safe before start()", async () => {
    const capture = new GeminiMicCapture();

    await expect(capture.stop()).resolves.toBeUndefined();
  });

  it("stop() swallows a context that fails to close", async () => {
    const capture = new GeminiMicCapture();

    await capture.start({ onChunk: vi.fn() });
    FakeAudioContext.last!.close = vi.fn(async () => {
      throw new Error("close failed");
    });

    await expect(capture.stop()).resolves.toBeUndefined();
  });
});
