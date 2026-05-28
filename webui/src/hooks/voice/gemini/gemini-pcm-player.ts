// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Gemini Live returns output audio as raw 16-bit PCM, 24 kHz, mono,
// little-endian, in base64 chunks. WebRTC played OpenAI's audio for us; here we
// schedule it by hand. The key to smooth (non-choppy) playback is scheduling
// each chunk against a running nextStartTime cursor — NOT "now" — so chunks butt
// up against each other with no gaps. A small lead on the first chunk of a turn
// absorbs network jitter. This is the fix the throwaway spike validated; the
// earlier choppy attempt scheduled every chunk at "now".

const OUTPUT_SAMPLE_RATE = 24000;
const LEAD_SECONDS = 0.12; // jitter cushion before the first chunk of a turn

/**
 * Gapless playback scheduler for Gemini's 24 kHz PCM output, with a GainNode so
 * volume can boost above unity (mirroring the OpenAI path's voice-audio-graph)
 * and a flush() for barge-in.
 */
export class GeminiPcmPlayer {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private volume = 1;

  /** Create/resume the output context (must follow a user gesture). */
  async resume(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(this.ctx.destination);
    }

    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  /**
   * Set output volume. Unlike an <audio> element, a GainNode can exceed unity,
   * so this honors the >1 boost range.
   * @param value - Gain (0 = silent, 1 = unity, >1 = boost)
   */
  setVolume(value: number): void {
    this.volume = value;

    if (this.gain) this.gain.gain.value = value;
  }

  /**
   * Decode and schedule one base64 PCM chunk immediately after whatever is
   * already queued (gapless).
   * @param base64Pcm - Base64-encoded 24 kHz Int16 PCM
   */
  enqueueBase64(base64Pcm: string): void {
    if (!this.ctx || !this.gain) return;
    const pcm = base64ToInt16(base64Pcm);

    if (pcm.length === 0) return;

    const buffer = this.ctx.createBuffer(1, pcm.length, OUTPUT_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);

    for (let i = 0; i < pcm.length; i++) {
      channel[i] = (pcm[i] as number) / 32768;
    }

    const source = this.ctx.createBufferSource();

    source.buffer = buffer;
    source.connect(this.gain);

    const now = this.ctx.currentTime;
    // Drained queue (cursor in the past) → restart from now + lead for a fresh
    // jitter cushion; otherwise butt against the previous chunk's end.
    const startAt = Math.max(now + LEAD_SECONDS, this.nextStartTime);

    source.start(startAt);
    this.nextStartTime = startAt + buffer.duration;
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
  }

  /** Barge-in: stop all scheduled audio and reset the cursor. */
  flush(): void {
    for (const source of this.sources) {
      try {
        source.onended = null;
        source.stop();
      } catch {
        // already stopped/ended
      }
    }

    this.sources.clear();
    this.nextStartTime = 0;
  }

  /** Stop playback and close the output context. */
  async close(): Promise<void> {
    this.flush();

    if (this.ctx) {
      await this.ctx.close().catch(() => {});
      this.ctx = null;
      this.gain = null;
    }
  }
}

/**
 * Decode base64 PCM into Int16 samples. Guards against an odd byte length (a
 * truncated chunk) by dropping the trailing byte so the Int16Array view is valid.
 * @param base64Pcm - Base64-encoded little-endian Int16 PCM
 * @returns The samples
 */
function base64ToInt16(base64Pcm: string): Int16Array {
  const binary = atob(base64Pcm);
  const evenLength = binary.length - (binary.length % 2);
  const bytes = new Uint8Array(evenLength);

  for (let i = 0; i < evenLength; i++) bytes[i] = binary.charCodeAt(i);

  return new Int16Array(bytes.buffer);
}
