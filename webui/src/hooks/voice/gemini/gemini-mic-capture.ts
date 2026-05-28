// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Gemini Live captures mic audio as raw 16-bit PCM, 16 kHz, mono, little-endian
// (the format sendRealtimeInput expects). Unlike OpenAI's WebRTC transport —
// which captured, encoded, and resampled the mic for us — the WebSocket path
// makes us do it by hand. We create the AudioContext at 16 kHz so the browser
// resamples the mic stream for us, then an AudioWorklet batches the Float32
// quanta into ~100 ms Int16 chunks. (Proven in the throwaway spike, Chrome +
// Firefox.)

const INPUT_SAMPLE_RATE = 16000;

// AudioWorklet processor source, inlined so it survives the single-file webui
// build (viteSingleFile) — there is no separate asset URL to addModule() at
// runtime, so we load it from a Blob URL built from this string. It batches the
// 128-sample render quanta to ~100 ms and converts Float32 → Int16 LE before
// transferring the buffer to the main thread.
const MIC_WORKLET_SOURCE = `
const TARGET_SAMPLES = 1600; // 100 ms at 16 kHz
class PcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(TARGET_SAMPLES);
    this._len = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      this._buf[this._len++] = channel[i];
      if (this._len === TARGET_SAMPLES) this._flush();
    }
    return true;
  }
  _flush() {
    const pcm = new Int16Array(this._len);
    for (let i = 0; i < this._len; i++) {
      const s = Math.max(-1, Math.min(1, this._buf[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.port.postMessage(pcm.buffer, [pcm.buffer]);
    this._len = 0;
  }
}
registerProcessor("pcm-recorder", PcmRecorderProcessor);
`;

export interface GeminiMicCaptureOptions {
  /** Called with each base64-encoded 16 kHz PCM chunk (~100 ms) while unmuted. */
  onChunk: (base64Pcm: string) => void;
}

/**
 * Owns the mic → 16 kHz PCM input path for a Gemini Live session: getUserMedia
 * (with the browser's echo cancellation / noise suppression / AGC on), a 16 kHz
 * AudioContext, and the batching AudioWorklet. Muting drops chunks at the source
 * rather than stopping the track, so the half-duplex auto-mute and the user's
 * manual mute both reduce to setMuted().
 */
export class GeminiMicCapture {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private muted = false;

  /**
   * Open the mic and start streaming PCM chunks to options.onChunk.
   * @param options - The chunk callback
   * @returns The actual input sample rate the browser gave us
   */
  async start(
    options: GeminiMicCaptureOptions,
  ): Promise<{ sampleRate: number }> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });

    this.ctx = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });

    const blobUrl = URL.createObjectURL(
      new Blob([MIC_WORKLET_SOURCE], { type: "application/javascript" }),
    );

    try {
      await this.ctx.audioWorklet.addModule(blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }

    const source = this.ctx.createMediaStreamSource(this.stream);

    this.node = new AudioWorkletNode(this.ctx, "pcm-recorder");

    this.node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (this.muted) return;
      options.onChunk(arrayBufferToBase64(event.data));
    };

    // Worklet output is unused (we read it via the port); do not connect to
    // destination or the mic would be audible to the user.
    source.connect(this.node);

    return { sampleRate: this.ctx.sampleRate };
  }

  /**
   * Mute/unmute by dropping chunks at the source (the track stays open so
   * unmute is instant and the AEC reference is uninterrupted).
   * @param muted - Whether to stop sending mic audio
   */
  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  /** Stop the mic, close the worklet node and AudioContext. */
  async stop(): Promise<void> {
    if (this.node) {
      this.node.port.onmessage = null;
      this.node.disconnect();
      this.node = null;
    }

    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }

    if (this.ctx) {
      await this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

/**
 * Base64-encode a PCM ArrayBuffer in chunks (apply() argument-count safe) for
 * sendRealtimeInput.
 * @param buffer - Raw PCM bytes
 * @returns Base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 0x8000;

  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }

  return btoa(binary);
}
